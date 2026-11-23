// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · trackers APRS LoRa+ en la estación (EA7JRS/APRS-LoRa-Plus).
//
// Lo que el tracker da por la red con el «KISS over WiFi» activado:
//  - un TNC KISS por TCP (puerto 8001 por defecto): entrega lo que oye por LoRa y
//    sus propias balizas, y emite las tramas AX.25 que recibe;
//  - GET http://<equipo>/api/status: su estado en JSON (indicativo, versión,
//    modo, frecuencia y parámetros LoRa, batería, digipetidor, enlaces KISS).
//    Existe desde el firmware posterior a la 5.4.7; sin él, solo hay KISS.
// Con eso la consola escucha la red LoRa de 433,775 MHz, reparte funciones con
// Direwolf, aprx y el WX3in1, y tiene otra banda para los avisos urgentes.
import net from 'net';
import { kissEncode } from '../aprs';

// ── Equipos ─────────────────────────────────────────────────────────────────
export interface Equipo { equipo: string; puerto: number }
export const MAX_EQUIPOS = 4;
export const PUERTO_KISS = 8001;

/** «192.168.1.60, tracker.local:8002» → equipos válidos (como mucho MAX_EQUIPOS, sin repetir). */
export function leerEquipos(texto: string): Equipo[] {
  const out: Equipo[] = [];
  for (const trozo of String(texto ?? '').split(/[,\s]+/)) {
    const m = /^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,78}[A-Za-z0-9])?)(?::(\d{1,5}))?$/.exec(trozo.trim());
    if (!m) continue;
    const puerto = m[2] ? Number(m[2]) : PUERTO_KISS;
    if (puerto < 1 || puerto > 65535) continue;
    if (out.some((e) => e.equipo.toLowerCase() === m[1].toLowerCase() && e.puerto === puerto)) continue;
    out.push({ equipo: m[1], puerto });
    if (out.length >= MAX_EQUIPOS) break;
  }
  return out;
}

// ── KISS ────────────────────────────────────────────────────────────────────
const FEND = 0xc0, FESC = 0xdb, TFEND = 0xdc, TFESC = 0xdd;

/** Separa las tramas KISS de datos de un flujo TCP y les quita el escapado. */
export class DesentramadorKiss {
  private resto: Buffer = Buffer.alloc(0);

  dar(buf: Buffer): Buffer[] {
    this.resto = Buffer.concat([this.resto, buf]);
    const out: Buffer[] = [];
    for (;;) {
      const a = this.resto.indexOf(FEND);
      if (a === -1) { if (this.resto.length > 4096) this.resto = Buffer.alloc(0); break; }
      const b = this.resto.indexOf(FEND, a + 1);
      if (b === -1) { if (a > 0) this.resto = this.resto.subarray(a); if (this.resto.length > 4096) this.resto = Buffer.alloc(0); break; }
      const trama = this.resto.subarray(a + 1, b);
      this.resto = this.resto.subarray(b);          // el FEND de cierre abre la siguiente
      if (trama.length < 2 || (trama[0] & 0x0f) !== 0) continue;
      const datos: number[] = [];
      for (let i = 1; i < trama.length; i++) {
        if (trama[i] === FESC && i + 1 < trama.length) {
          const s = trama[++i];
          datos.push(s === TFEND ? FEND : s === TFESC ? FESC : s);
        } else datos.push(trama[i]);
      }
      out.push(Buffer.from(datos));
    }
    return out;
  }
}

// ── Estado (/api/status) ────────────────────────────────────────────────────
export const MODOS = ['APRS LoRa', 'APRS FSK', 'MORSE', 'WSPR', 'LR-FHSS', 'DAPNET', 'FT8', 'FT4', 'FST4W', 'SAT', 'M17', 'FM', 'AIS'];

export interface EstadoTracker {
  indicativo: string;
  version: string;
  placa: string;
  modo: number;
  modoNombre: string;
  perfil: number;
  perfilLora: number;
  frecuencia: number | null;
  modulacion: string;
  sf: number | null;
  bw: number | null;
  cr: number | null;
  potencia: number | null;
  ruta: string;
  bateria: number | null;
  encendidoS: number;
  digi: boolean;
  smart: boolean;
  sos: boolean;
  kissTcp: boolean;
  kissClientes: number;
  kissBle: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[^\x20-\x7e]/g, '').slice(0, max) : '');

/** Valida y ordena la respuesta de /api/status; null si no es de un tracker APRS LoRa+. */
export function leerEstado(x: unknown): EstadoTracker | null {
  if (!x || typeof x !== 'object') return null;
  const j = x as Record<string, unknown>;
  if (j.e !== 'status' || typeof j.mode !== 'number') return null;
  const k = (j.kiss && typeof j.kiss === 'object' ? j.kiss : {}) as Record<string, unknown>;
  const modo = Math.round(j.mode);
  return {
    indicativo: texto(j.call, 9).toUpperCase(),
    version: texto(j.ver, 16),
    placa: texto(j.board, 48),
    modo,
    modoNombre: MODOS[modo] ?? `modo ${modo}`,
    perfil: Math.round(num(j.profile) ?? 0),
    perfilLora: Math.round(num(j.lora) ?? 0),
    frecuencia: num(j.f),
    modulacion: texto(j.mod, 12),
    sf: num(j.sf), bw: num(j.bw), cr: num(j.cr), potencia: num(j.pwr),
    ruta: texto(j.path, 40).toUpperCase(),
    bateria: num(j.batt),
    encendidoS: Math.max(0, Math.round(num(j.up) ?? 0)),
    digi: j.digi === true,
    smart: j.smart === true,
    sos: j.sos === true,
    kissTcp: k.tcp === true,
    kissClientes: Math.max(0, Math.round(num(k.clients) ?? 0)),
    kissBle: k.ble === true,
  };
}

// ── Comprobaciones (las de la WebUI del tracker que se ven desde fuera) ─────
export interface Hallazgo { id: string; nivel: 'error' | 'aviso' | 'nota'; titulo: string; texto: string }

/** Canales digitales de 70 cm del plan de la IARU Región 1 (los de la WebUI del tracker), en MHz. */
export const CANALES_R1 = [433.625, 433.65, 433.675, 433.7, 433.725, 433.75, 433.775, 434.45, 434.475, 434.5, 434.525, 434.55, 434.575, 434.855,
  438.025, 438.05, 438.075, 438.1, 438.125, 438.15, 438.175, 439.9125];
export const LORA_APRS = { frecuencia: 433_775_000, sf: 12, bw: 125_000, cr: 5 };

/** Saltos que pide una ruta: WIDEn-N pide N; cualquier otro alias o indicativo, uno. */
export function saltosRuta(ruta: string): { saltos: number; nMax: number } {
  let saltos = 0, nMax = 0;
  for (const t of ruta.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^WIDE([1-7])-([0-7])$/.exec(t);
    if (m) { saltos += Number(m[2]); nMax = Math.max(nMax, Number(m[1])); } else saltos += 1;
  }
  return { saltos, nMax };
}

export function comprobarTracker(e: EstadoTracker): Hallazgo[] {
  const out: Hallazgo[] = [];
  if (!e.indicativo || e.indicativo.startsWith('NOCALL')) {
    out.push({ id: 'nocall', nivel: 'error', titulo: 'El indicativo sigue siendo NOCALL', texto: 'El tracker no emite con NOCALL. Ponga su indicativo y SSID en la WebUI del tracker (Beaconing).' });
  }
  if (e.modo === 0 && e.frecuencia) {
    const mhz = e.frecuencia / 1e6;
    if (mhz >= 430 && mhz <= 440 && !CANALES_R1.some((c) => Math.abs(c - mhz) < 0.001)) {
      out.push({ id: 'canal', nivel: 'aviso', titulo: `${mhz.toFixed(3).replace('.', ',')} MHz no es un canal digital del plan de la IARU Región 1`, texto: 'La red APRS LoRa usa 433,775 MHz salvo que su red local diga otra cosa.' });
    }
    if (Math.abs(e.frecuencia - LORA_APRS.frecuencia) < 1000 && e.sf !== null && e.bw !== null && e.cr !== null
      && (e.sf !== LORA_APRS.sf || e.bw !== LORA_APRS.bw || e.cr !== LORA_APRS.cr)) {
      out.push({ id: 'parametros', nivel: 'nota', titulo: `SF${e.sf} / ${e.bw / 1000} kHz / CR 4/${e.cr} en 433,775 MHz`, texto: 'Solo lo decodifican las estaciones con los mismos parámetros. La red de 433,775 usa SF12, 125 kHz y CR 4/5.' });
    }
  }
  const r = saltosRuta(e.ruta);
  if (r.saltos > 2 || r.nMax > 2) {
    out.push({ id: 'ruta', nivel: 'aviso', titulo: `La ruta ${e.ruta} pide ${r.saltos} saltos`, texto: 'En LoRa a un tracker le basta WIDE1-1: cada salto de más repite el paquete en un canal lento y compartido.' });
  }
  if (e.kissTcp && e.kissBle) {
    out.push({ id: 'kiss', nivel: 'aviso', titulo: 'KISS por Bluetooth y por WiFi a la vez', texto: 'Una aplicación en el móvil y esta consola pueden emitir las dos por el mismo tracker. Deje un solo enlace KISS para emitir.' });
  }
  if (e.digi && e.smart) {
    out.push({ id: 'digi-movil', nivel: 'aviso', titulo: 'Digipetidor en una estación móvil', texto: 'El tracker repite tramas con SmartBeacon activo (se mueve). En LoRa es mejor dejar el digipetidor a las estaciones fijas.' });
  }
  return out;
}

// ── Tiempo en el aire y ocupación del canal ─────────────────────────────────
/** Tiempo en el aire de un paquete LoRa (fórmula de Semtech; cabecera explícita, CRC, preámbulo de 8 símbolos). */
export function tiempoEnAireMs(bytes: number, sf: number, bwHz: number, cr4: number, preambulo = 8): number {
  if (!(bytes >= 0) || sf < 6 || sf > 12 || !(bwHz > 0) || cr4 < 5 || cr4 > 8) return 0;
  const tSim = (2 ** sf) / bwHz * 1000;
  const de = tSim >= 16 ? 1 : 0;                    // optimización de baja velocidad (símbolo de 16 ms o más)
  const carga = 8 + Math.max(Math.ceil((8 * bytes - 4 * sf + 28 + 16) / (4 * (sf - 2 * de))) * cr4, 0);
  return (preambulo + 4.25 + carga) * tSim;
}

/** Bytes en el aire de una trama TNC2 en APRS LoRa: «<», 0xFF, 0x01 y el texto. */
export const bytesLora = (tnc2: string) => 3 + Buffer.byteLength(tnc2, 'latin1');

// ── Paso a APRS-IS de lo oído por LoRa ──────────────────────────────────────
/** ¿Se puede pasar a APRS-IS una trama oída por radio? (reglas de iGate de aprs-is.net) */
export function debePasarAIs(origen: string, ruta: string, info: string): boolean {
  if (!/^[A-Z0-9]{1,6}(-[A-Z0-9]{1,2})?$/.test(origen.toUpperCase()) || /^(NOCALL|N0CALL)/i.test(origen)) return false;
  const camino = ruta.toUpperCase().split(',').map((s) => s.trim().replace(/\*$/, ''));
  if (camino.some((t) => t === 'TCPIP' || t === 'TCPXX' || t === 'NOGATE' || t === 'RFONLY' || /^Q[A-Z]{2}$/.test(t))) return false;
  if (!info || info[0] === '?') return false;        // consultas generales
  if (info[0] === '}') {                             // tercero: no si ya vino de internet
    const cab = info.slice(1).split(':')[0].toUpperCase();
    if (/,(TCPIP|TCPXX)\*?(,|$)/.test(cab)) return false;
  }
  return true;
}

// ── Enlace con un tracker ───────────────────────────────────────────────────
export interface Oida { cuando: number; origen: string; bytes: number; propia: boolean }
type EstadoEnlace = 'apagado' | 'conectando' | 'conectado' | 'error';
const REINTENTO_MS = 20_000;

export class EnlaceTracker {
  enlace: EstadoEnlace = 'apagado';
  motivo = '';
  desde = 0;
  estado: EstadoTracker | null = null;
  estadoCuando = 0;
  /** null = sin probar; false = el firmware no tiene /api/status (o no responde). */
  estadoDisponible: boolean | null = null;
  ultimaTrama = 0;
  enviadas = 0;
  private oidas: Oida[] = [];
  private socket: net.Socket | null = null;
  private kiss = new DesentramadorKiss();
  private relojReintento: NodeJS.Timeout | null = null;
  private relojEstado: NodeJS.Timeout | null = null;

  constructor(
    readonly equipo: Equipo,
    private intervaloS: () => number,
    private alRecibir: (ax25: Buffer, enlace: EnlaceTracker) => void,
    private anotar: (texto: string) => void = () => {},
  ) {}

  get id() { return `${this.equipo.equipo}:${this.equipo.puerto}`; }

  iniciar() {
    this.parar();
    this.abrir();
    this.consultar();
  }

  parar() {
    for (const r of [this.relojReintento, this.relojEstado]) if (r) clearTimeout(r);
    this.relojReintento = this.relojEstado = null;
    if (this.socket) { this.socket.removeAllListeners(); this.socket.on('error', () => {}); this.socket.destroy(); }
    this.socket = null;
    this.enlace = 'apagado';
  }

  private abrir() {
    this.enlace = 'conectando';
    this.kiss = new DesentramadorKiss();
    const s = new net.Socket();
    this.socket = s;
    s.setNoDelay(true);
    s.setKeepAlive(true, 15_000);
    s.setTimeout(8000);
    const caer = (motivo: string) => {
      if (this.socket !== s) return;
      const estaba = this.enlace === 'conectado';
      s.removeAllListeners(); s.on('error', () => {}); s.destroy();
      this.socket = null;
      this.enlace = 'error';
      this.motivo = motivo;
      this.desde = Date.now();
      if (estaba) this.anotar(`${this.id}: enlace KISS perdido (${motivo})`);
      this.relojReintento = setTimeout(() => { this.relojReintento = null; this.abrir(); }, REINTENTO_MS);
    };
    s.on('timeout', () => { if (this.enlace === 'conectando') caer('no responde'); });
    s.on('error', (e) => caer(e.message));
    s.on('close', () => caer('cerrado por el tracker'));
    s.on('data', (buf: Buffer) => { for (const ax25 of this.kiss.dar(buf)) this.alRecibir(ax25, this); });
    s.connect(this.equipo.puerto, this.equipo.equipo, () => {
      s.setTimeout(0);
      this.enlace = 'conectado';
      this.motivo = '';
      this.desde = Date.now();
      this.anotar(`${this.id}: enlace KISS abierto`);
    });
  }

  /** Lee /api/status y programa la siguiente lectura. */
  private async consultar() {
    const control = new AbortController();
    const plazo = setTimeout(() => control.abort(), 4000);
    try {
      const r = await fetch(`http://${this.equipo.equipo}/api/status`, { signal: control.signal, headers: { accept: 'application/json' } });
      const e = r.ok ? leerEstado(await r.json()) : null;
      this.estadoDisponible = !!e;
      if (e) { this.estado = e; this.estadoCuando = Date.now(); }
    } catch {
      this.estadoDisponible = false;
    } finally {
      clearTimeout(plazo);
    }
    if (this.enlace === 'apagado') return;
    const s = Math.min(600, Math.max(15, Math.round(this.intervaloS()) || 30));
    this.relojEstado = setTimeout(() => { this.relojEstado = null; void this.consultar(); }, s * 1000);
  }

  /** Emite una trama AX.25 por el tracker. */
  enviar(ax25: Buffer): Promise<void> {
    const s = this.socket;
    if (!s || this.enlace !== 'conectado' || !s.writable) return Promise.reject(new Error(`sin enlace KISS con ${this.id}`));
    return new Promise((resolve, reject) => s.write(kissEncode(ax25), (e) => { if (e) reject(e); else { this.enviadas++; resolve(); } }));
  }

  /** Apunta una trama entregada por el tracker (oída por radio o baliza propia). */
  anotarOida(origen: string, tnc2: string, ahora = Date.now()) {
    this.ultimaTrama = ahora;
    const propia = !!this.estado && origen.toUpperCase() === this.estado.indicativo;
    this.oidas.push({ cuando: ahora, origen: origen.toUpperCase(), bytes: bytesLora(tnc2), propia });
    const limite = ahora - 3_600_000;
    while (this.oidas.length && (this.oidas[0].cuando < limite || this.oidas.length > 2000)) this.oidas.shift();
  }

  /** Cifras de la última hora y ocupación del canal estimada por el tiempo en el aire. */
  cifras(ahora = Date.now()) {
    const limite = ahora - 3_600_000;
    const hora = this.oidas.filter((o) => o.cuando >= limite);
    const e = this.estado;
    const sf = e?.sf ?? LORA_APRS.sf, bw = e?.bw ?? LORA_APRS.bw, cr = e?.cr ?? LORA_APRS.cr;
    const aireMs = hora.reduce((t, o) => t + tiempoEnAireMs(o.bytes, sf, bw, cr), 0);
    const ajenas = hora.filter((o) => !o.propia);
    return {
      oidas: ajenas.length,
      estaciones: new Set(ajenas.map((o) => o.origen)).size,
      propias: hora.length - ajenas.length,
      ocupacion: Math.round(aireMs / 3_600_000 * 1000) / 10,       // % de la hora, con un decimal
    };
  }
}

// ── Reparto con el resto de la estación ─────────────────────────────────────
export interface ConflictoLora { id: string; nivel: 'aviso' | 'info'; texto: string }

const mismo = (a: string, b: string) => !!a && !!b && a.toUpperCase().replace(/-0$/, '') === b.toUpperCase().replace(/-0$/, '');

/**
 * Dónde se pisan el tracker y la consola. La banda es otra (433,775 MHz frente a
 * 144,800), así que no hay choque de digipetidores con Direwolf, aprx o el WX3in1.
 * Lo que es de un solo tracker (digi en móvil, dos enlaces KISS) lo da comprobarTracker.
 */
export function conflictosLora(trackers: EstadoTracker[], consola: { indicativo: string; baliza: boolean; pasaAIs: boolean }): ConflictoLora[] {
  const out: ConflictoLora[] = [];
  for (const t of trackers) {
    if (consola.baliza && mismo(t.indicativo, consola.indicativo)) out.push({ id: `baliza-${t.indicativo}`, nivel: 'aviso', texto: `La consola y el tracker envían baliza con el mismo indicativo (${t.indicativo}): en APRS-IS la posición saltará de una a otra. Use otro SSID en uno de los dos.` });
  }
  const repetidos = trackers.filter((t, i) => trackers.findIndex((u) => mismo(u.indicativo, t.indicativo)) !== i);
  for (const t of repetidos) out.push({ id: `doble-${t.indicativo}`, nivel: 'aviso', texto: `Dos trackers usan el mismo indicativo (${t.indicativo}).` });
  if (trackers.filter((t) => t.digi).length > 1) out.push({ id: 'digis', nivel: 'aviso', texto: 'Dos trackers de la estación hacen de digipetidor en la misma frecuencia: cada paquete sale dos veces.' });
  if (consola.pasaAIs) out.push({ id: 'igate', nivel: 'info', texto: 'La consola pasa a APRS-IS lo que oyen los trackers. Si hay otro iGate LoRa cerca, los servidores descartan los duplicados: no hace falta cambiar nada.' });
  return out;
}
