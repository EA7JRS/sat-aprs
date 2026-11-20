// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Winlink a través de Pat (getpat.io).
//
// Pat ya hace todo el trabajo (buzón, sesiones B2F, ARDOP, VARA, AX.25,
// telnet a los CMS); aquí solo se habla con su API HTTP («pat http», de
// serie en localhost:8080) para enseñar y manejar lo que de verdad tiene:
//
//  · GET  /api/status                  enlace activo, marcando, escuchas
//  · GET  /api/config                  indicativo, locator, alias de conexión
//  · GET  /api/mailbox/{in|out|sent}   buzones (sin cuerpo)
//  · GET  /api/mailbox/{buzón}/{mid}   un mensaje con su cuerpo
//  · POST /api/mailbox/{buzón}/{mid}/read  {"Read":true}
//  · POST /api/mailbox/out             redactar (campos to, cc, subject, body, date)
//  · GET  /api/connect?url=…           sesión (larga: dura lo que dure el enlace)
//  · GET  /api/disconnect              cortar la sesión
//  · GET  /api/rmslist?mode=&band=     pasarelas RMS por distancia o predicción
//
// Si Pat no contesta, se dice; no hay buzón de ejemplo.

export const BUZONES = ['in', 'out', 'sent', 'archive'] as const;
export type Buzon = (typeof BUZONES)[number];
export const MODOS_RMS = ['packet', 'ardop', 'varafm', 'varahf', 'pactor', 'telnet'] as const;

export interface Adjunto { nombre: string; bytes: number | null }
export interface MensajePat {
  mid: string;
  fecha: string | null;
  de: string;
  para: string[];
  cc: string[];
  asunto: string;
  cuerpo?: string;
  adjuntos: Adjunto[];
  soloP2P: boolean;
  sinLeer: boolean;
}
export interface Rms {
  indicativo: string;
  locator: string;
  km: number | null;
  acimut: number | null;
  modos: string;
  khz: number | null;
  frecuencia: string;
  url: string;
  calidad: number | null;
}
export interface SesionPat {
  destino: string;
  desde: number;
  fin: number | null;
  recibidos: number | null;
  error: string | null;
}

const direccion = (d: any): string => (typeof d === 'string' ? d : String(d?.Addr ?? '')).trim();
const finito = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

/** Un mensaje tal como lo da Pat (JSONMessage) → forma propia. */
export function leerMensajePat(m: any): MensajePat | null {
  if (!m || typeof m.MID !== 'string' || !m.MID) return null;
  const fecha = typeof m.Date === 'string' && !m.Date.startsWith('0001-') && Number.isFinite(Date.parse(m.Date)) ? new Date(m.Date).toISOString() : null;
  const msg: MensajePat = {
    mid: m.MID,
    fecha,
    de: direccion(m.From),
    para: Array.isArray(m.To) ? m.To.map(direccion).filter(Boolean) : [],
    cc: Array.isArray(m.Cc) ? m.Cc.map(direccion).filter(Boolean) : [],
    asunto: String(m.Subject ?? ''),
    adjuntos: Array.isArray(m.Files) ? m.Files.map((f: any) => ({ nombre: String(f?.Name ?? f?.name ?? 'adjunto'), bytes: finito(f?.Size ?? f?.size) })) : [],
    soloP2P: m.P2POnly === true,
    sinLeer: m.Unread === true,
  };
  if (typeof m.Body === 'string' && m.Body !== '') msg.cuerpo = m.Body;
  return msg;
}

/** Una pasarela de /api/rmslist → forma propia. */
export function leerRms(r: any): Rms | null {
  if (!r || typeof r.callsign !== 'string' || !r.url) return null;
  const hz = finito(r.freq?.hz);
  return {
    indicativo: r.callsign,
    locator: String(r.gridsquare ?? ''),
    km: finito(r.distance),
    acimut: finito(r.azimuth),
    modos: String(r.modes ?? ''),
    khz: hz && hz > 0 ? hz / 1000 : null,
    frecuencia: String(r.freq?.desc ?? ''),
    url: String(r.url),
    calidad: finito(r.prediction?.link_quality),
  };
}

/** Destinatarios separados por comas, punto y coma o espacios (indicativos o correos). */
export function leerDestinatarios(texto: string): string[] {
  return String(texto ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}
const DESTINATARIO = /^([A-Za-z0-9]{3,7}(-\d{1,2})?|[^\s@]+@[^\s@]+\.[^\s@]+)$/;
export function destinatarioValido(d: string): boolean { return DESTINATARIO.test(d) && d.length <= 64; }

/** Destino de conexión que Pat acepta: un alias o una URL «transporte://…». */
export function destinoValido(d: string): boolean {
  return /^[A-Za-z0-9_.-]{1,40}$/.test(d) || /^[a-z0-9+]{2,20}:\/\/[^\s]{1,200}$/i.test(d);
}

export type Busqueda = (url: string, init?: RequestInit) => Promise<Response>;

export class ClientePat {
  estado = {
    alcanzable: false,
    error: null as string | null,
    leido: 0,
    conectado: false,
    marcando: false,
    remoto: '',
    escuchas: [] as string[],
    indicativo: '',
    locator: '',
    alias: [] as { nombre: string; destino: string }[],
    buzones: { in: [], out: [], sent: [] } as Record<'in' | 'out' | 'sent', MensajePat[]>,
  };
  sesion: SesionPat | null = null;
  private ultimaConfig = 0;
  private sondeando = false;

  constructor(private base: () => string, private buscar: Busqueda = (u, i) => fetch(u, i)) {}

  private url(ruta: string) { return this.base().replace(/\/+$/, '') + ruta; }

  private async pedir(ruta: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
    const r = await this.buscar(this.url(ruta), { ...init, signal: AbortSignal.timeout(ms) });
    if (!r.ok) {
      const texto = (await r.text().catch(() => '')).split('\n')[0].trim();
      throw new Error(`Pat respondió ${r.status}${texto ? `: ${texto}` : ''}`);
    }
    return r;
  }
  private async json(ruta: string, ms?: number): Promise<any> { return (await this.pedir(ruta, {}, ms)).json(); }

  /** Lee estado y buzones. La configuración se relee cada minuto. */
  async sondear(): Promise<void> {
    if (this.sondeando) return;
    this.sondeando = true;
    try {
      const s = await this.json('/api/status');
      this.estado.conectado = s?.connected === true;
      this.estado.marcando = s?.dialing === true;
      this.estado.remoto = String(s?.remote_addr ?? '');
      this.estado.escuchas = Array.isArray(s?.active_listeners) ? s.active_listeners.map(String) : [];
      if (Date.now() - this.ultimaConfig > 60_000) {
        const c = await this.json('/api/config').catch(() => null);
        if (c) {
          this.estado.indicativo = String(c.mycall ?? '');
          this.estado.locator = String(c.locator ?? '');
          this.estado.alias = Object.entries(c.connect_aliases ?? {})
            .filter(([, v]) => typeof v === 'string')
            .map(([nombre, destino]) => ({ nombre, destino: String(destino) }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        }
        this.ultimaConfig = Date.now();
      }
      for (const b of ['in', 'out', 'sent'] as const) {
        const lista = await this.json(`/api/mailbox/${b}`);
        this.estado.buzones[b] = (Array.isArray(lista) ? lista : []).map(leerMensajePat).filter((m): m is MensajePat => !!m);
      }
      this.estado.alcanzable = true;
      this.estado.error = null;
    } catch (e: any) {
      this.estado.alcanzable = false;
      this.estado.conectado = false;
      this.estado.marcando = false;
      this.estado.error = /fetch failed|ECONNREFUSED|timeout|aborted/i.test(String(e?.message ?? e) + String(e?.cause?.code ?? ''))
        ? `Pat no contesta en ${this.base()} (¿está «pat http» en marcha?)`
        : String(e?.message ?? e);
    } finally {
      this.estado.leido = Date.now();
      this.sondeando = false;
    }
  }

  /** Mensaje completo, con cuerpo. */
  async mensaje(buzon: Buzon, mid: string): Promise<MensajePat> {
    if (!BUZONES.includes(buzon) || !/^[A-Za-z0-9]{1,16}$/.test(mid)) throw new Error('Mensaje no válido.');
    const m = leerMensajePat(await this.json(`/api/mailbox/${buzon}/${mid}`));
    if (!m) throw new Error('Pat no devolvió el mensaje.');
    return m;
  }

  async marcarLeido(buzon: Buzon, mid: string): Promise<void> {
    if (!BUZONES.includes(buzon) || !/^[A-Za-z0-9]{1,16}$/.test(mid)) throw new Error('Mensaje no válido.');
    await this.pedir(`/api/mailbox/${buzon}/${mid}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Read: true }) });
    const m = this.estado.buzones[buzon as 'in']?.find((x) => x.mid === mid);
    if (m) m.sinLeer = false;
  }

  /** Deja un mensaje en la bandeja de salida de Pat; sale en la próxima sesión. */
  async enviar(d: { para: string; cc?: string; asunto: string; cuerpo: string; soloP2P?: boolean }): Promise<void> {
    const para = leerDestinatarios(d.para);
    const cc = leerDestinatarios(d.cc ?? '');
    if (!para.length) throw new Error('Falta el destinatario.');
    const malo = [...para, ...cc].find((x) => !destinatarioValido(x));
    if (malo) throw new Error(`Destinatario no válido: ${malo}`);
    const asunto = String(d.asunto ?? '').trim();
    if (!asunto) throw new Error('Falta el asunto.');
    if (asunto.length > 128) throw new Error('El asunto es demasiado largo (máx. 128).');
    const cuerpo = String(d.cuerpo ?? '');
    if (cuerpo.length > 64_000) throw new Error('El texto es demasiado largo.');
    const campos = new URLSearchParams({ to: para.join(','), subject: asunto, body: cuerpo.replace(/\r?\n/g, '\r\n'), date: new Date().toISOString() });
    if (cc.length) campos.set('cc', cc.join(','));
    if (d.soloP2P) campos.set('p2ponly', 'true');
    await this.pedir('/api/mailbox/out', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: campos.toString() });
    await this.sondear();
  }

  /** Abre una sesión. No espera a que termine: Pat la mantiene lo que dure el enlace. */
  conectar(destino: string, alTerminar?: (s: SesionPat) => void): SesionPat {
    if (!destinoValido(destino)) throw new Error('Destino no válido: un alias de Pat o una URL como «telnet://» o «ax25:///EA7XXX-10».');
    if (this.sesion && this.sesion.fin === null) throw new Error('Ya hay una sesión en curso.');
    const s: SesionPat = { destino, desde: Date.now(), fin: null, recibidos: null, error: null };
    this.sesion = s;
    this.buscar(this.url(`/api/connect?url=${encodeURIComponent(destino)}`), { signal: AbortSignal.timeout(15 * 60_000) })
      .then(async (r) => {
        const texto = await r.text().catch(() => '');
        const m = texto.match(/"NumReceived"\s*:\s*(\d+)/);
        if (m) s.recibidos = Number(m[1]);
        if (!r.ok) s.error = texto.split('\n')[0].trim() === 'Session failure' ? 'La sesión falló (mira el diario de Pat).' : `Pat respondió ${r.status}`;
      })
      .catch((e: any) => { s.error = /timeout|aborted/i.test(String(e?.name ?? '') + String(e?.message ?? '')) ? 'Sin respuesta de Pat en 15 min.' : `No se pudo hablar con Pat: ${e?.message ?? e}`; })
      .finally(() => { s.fin = Date.now(); void this.sondear(); alTerminar?.(s); });
    return s;
  }

  async desconectar(sucio = false): Promise<void> {
    await this.pedir(`/api/disconnect${sucio ? '?dirty=true' : ''}`);
  }

  /** Pasarelas RMS (las descarga Pat de winlink.org y las guarda). */
  async rms(modo: string, banda = '', forzar = false): Promise<Rms[]> {
    const q = new URLSearchParams();
    if ((MODOS_RMS as readonly string[]).includes(modo)) q.set('mode', modo);
    if (/^[0-9]{1,4}(c?m)$/i.test(banda)) q.set('band', banda.toLowerCase());
    if (forzar) q.set('force-download', 'true');
    const lista = await this.json(`/api/rmslist?${q}`, 30_000);
    return (Array.isArray(lista) ? lista : []).map(leerRms).filter((r): r is Rms => !!r).slice(0, 60);
  }
}
