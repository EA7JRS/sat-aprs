// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Equipo de radio (CAT) y rotor por los demonios de Hamlib.
//
// `rigctld` y `rotctld` hablan un protocolo de texto por TCP (puertos 4532 y
// 4533). Aquí se usa su «protocolo de respuesta extendida» (la orden va
// precedida de «+»): cada respuesta trae sus valores con nombre y termina con
// «RPRT n» (0 = correcto), así que no hay ambigüedad sobre dónde acaba.
// Vale para cualquier equipo o rotor que Hamlib sepa manejar.

import net from 'net';

export interface RespuestaHamlib {
  /** Código «RPRT»: 0 correcto, negativo = error de Hamlib. */
  codigo: number;
  /** Valores con nombre («Frequency» → «14205000»). */
  valores: Record<string, string>;
  /** Líneas de valor sin nombre, en orden. */
  sueltas: string[];
}

/** Interpreta las líneas de una respuesta extendida (sin la línea «RPRT»). */
export function leerRespuestaHamlib(lineas: string[], codigo: number): RespuestaHamlib {
  const valores: Record<string, string> = {};
  const sueltas: string[] = [];
  lineas.forEach((l, i) => {
    const m = /^([A-Za-z][A-Za-z0-9 _]*):\s*(.*)$/.exec(l);
    // La primera línea repite la orden («get_freq:» o «set_freq: 14205000»): no es un valor
    if (i === 0 && m && /^(get|set|\\)/.test(m[1])) return;
    if (m && m[2] !== '') valores[m[1].trim()] = m[2].trim();
    else if (l.trim() && !m) sueltas.push(l.trim());
  });
  return { codigo, valores, sueltas };
}

const ERRORES: Record<number, string> = {
  [-1]: 'parámetro no válido', [-2]: 'configuración no válida', [-5]: 'error de comunicación con el equipo',
  [-6]: 'error interno', [-8]: 'el equipo no responde', [-9]: 'orden rechazada por el equipo', [-11]: 'función no disponible en este equipo',
};
export const errorHamlib = (codigo: number): string => ERRORES[codigo] ?? `error ${codigo} de Hamlib`;

/** Cliente de un demonio de Hamlib: una orden cada vez, con su respuesta. */
export class ClienteHamlib {
  private socket: net.Socket | null = null;
  private cola: Promise<unknown> = Promise.resolve();
  private resto = '';
  private pendiente: { lineas: string[]; resolver: (r: RespuestaHamlib) => void; rechazar: (e: Error) => void; reloj: NodeJS.Timeout } | null = null;

  constructor(public host: string, public puerto: number, private esperaMs = 3000) {}

  cerrar() {
    this.socket?.destroy();
    this.socket = null;
    this.resto = '';
    if (this.pendiente) {
      clearTimeout(this.pendiente.reloj);
      this.pendiente.rechazar(new Error('conexión cerrada'));
      this.pendiente = null;
    }
  }

  private conectar(): Promise<net.Socket> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve(this.socket);
    return new Promise((resolver, rechazar) => {
      const s = new net.Socket();
      s.setEncoding('latin1');
      const reloj = setTimeout(() => { s.destroy(); rechazar(new Error('sin respuesta al conectar')); }, this.esperaMs);
      s.once('error', (e) => { clearTimeout(reloj); if (this.socket === s) this.cerrar(); rechazar(e); });
      s.on('close', () => { if (this.socket === s) this.cerrar(); });
      s.on('data', (trozo: string) => this.recibir(trozo));
      s.connect(this.puerto, this.host, () => { clearTimeout(reloj); this.socket = s; resolver(s); });
    });
  }

  private recibir(trozo: string) {
    this.resto += trozo;
    const partes = this.resto.split(/\r?\n/);
    this.resto = partes.pop() ?? '';
    for (const linea of partes) {
      if (!this.pendiente) continue;
      const fin = /^RPRT (-?\d+)/.exec(linea);
      if (fin) {
        const p = this.pendiente;
        this.pendiente = null;
        clearTimeout(p.reloj);
        p.resolver(leerRespuestaHamlib(p.lineas, Number(fin[1])));
      } else this.pendiente.lineas.push(linea);
    }
  }

  /** Envía una orden («f», «F 14205000», «P 123 0»...) y espera su respuesta. */
  orden(texto: string): Promise<RespuestaHamlib> {
    const limpia = texto.replace(/[\r\n]/g, ' ').trim();
    const turno = this.cola.then(async () => {
      const s = await this.conectar();
      return new Promise<RespuestaHamlib>((resolver, rechazar) => {
        const reloj = setTimeout(() => { this.pendiente = null; this.cerrar(); rechazar(new Error('sin respuesta')); }, this.esperaMs);
        this.pendiente = { lineas: [], resolver, rechazar, reloj };
        s.write(`+${limpia}\n`);
      });
    });
    this.cola = turno.catch(() => {});
    return turno;
  }
}

/** Intensidad de señal de Hamlib (dB respecto a S9) a lectura de S-meter. */
export function sMeter(db: number): { s: number; sobre: number; texto: string } {
  if (db <= 0) {
    const s = Math.max(0, Math.min(9, Math.round(9 + db / 6)));
    return { s, sobre: 0, texto: `S${s}` };
  }
  const sobre = Math.round(db / 10) * 10;
  return { s: 9, sobre, texto: sobre > 0 ? `S9 +${sobre} dB` : 'S9' };
}

export const MODOS = ['USB', 'LSB', 'CW', 'CWR', 'AM', 'FM', 'RTTY', 'PKTUSB', 'PKTLSB', 'PKTFM'];

export interface EstadoEquipo {
  enlace: boolean;
  error: string;
  /** Momento de la última lectura correcta (ms epoch). */
  leido: number;
  frecuenciaHz: number | null;
  modo: string | null;
  anchoHz: number | null;
  vfo: string | null;
  ptt: boolean | null;
  /** dB respecto a S9; null si el equipo no lo da. */
  senalDb: number | null;
  /** Modelo, si el demonio lo dice. */
  modelo: string;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Equipo de radio por rigctld. */
export class Equipo {
  estado: EstadoEquipo = { enlace: false, error: '', leido: 0, frecuenciaHz: null, modo: null, anchoHz: null, vfo: null, ptt: null, senalDb: null, modelo: '' };
  private cliente: ClienteHamlib | null = null;
  private ocupado = false;
  private sinSenal = false;
  private pttDesde = 0;

  /** Tiempo máximo de emisión seguido por PTT desde la consola. */
  constructor(private maxPttMs = 180_000) {}

  get destino(): string {
    return this.cliente ? `${this.cliente.host}:${this.cliente.puerto}` : '';
  }

  ajustar(host: string, puerto: number) {
    if (this.cliente && this.cliente.host === host && this.cliente.puerto === puerto) return;
    this.parar();
    this.cliente = new ClienteHamlib(host, puerto);
  }

  parar() {
    this.cliente?.cerrar();
    this.cliente = null;
    this.sinSenal = false;
    this.estado = { ...this.estado, enlace: false, error: '', frecuenciaHz: null, modo: null, anchoHz: null, vfo: null, ptt: null, senalDb: null, modelo: '' };
  }

  /** Lee el estado del equipo. Lo que el equipo no da queda en null. */
  async sondear(ahora = Date.now()): Promise<void> {
    const c = this.cliente;
    if (!c || this.ocupado) return;
    this.ocupado = true;
    try {
      const f = await c.orden('f');
      if (f.codigo !== 0) throw new Error(errorHamlib(f.codigo));
      const m = await c.orden('m');
      const v = await c.orden('v');
      const t = await c.orden('t');
      let senal: number | null = this.estado.senalDb;
      if (!this.sinSenal) {
        const l = await c.orden('l STRENGTH');
        if (l.codigo === 0) senal = num(l.valores['Level Value'] ?? l.sueltas[0]);
        else { senal = null; this.sinSenal = true; } // este equipo no da S-meter: no se vuelve a pedir
      }
      if (!this.estado.modelo) {
        const i = await c.orden('_').catch(() => null);
        if (i && i.codigo === 0) this.estado.modelo = (i.valores.Info ?? i.sueltas[0] ?? '').slice(0, 60);
      }
      const ptt = num(t.valores.PTT ?? t.sueltas[0]);
      this.estado = {
        ...this.estado, enlace: true, error: '', leido: ahora,
        frecuenciaHz: num(f.valores.Frequency ?? f.sueltas[0]),
        modo: m.codigo === 0 ? (m.valores.Mode ?? m.sueltas[0] ?? null) : null,
        anchoHz: m.codigo === 0 ? num(m.valores.Passband ?? m.sueltas[1]) : null,
        vfo: v.codigo === 0 ? (v.valores.VFO ?? v.sueltas[0] ?? null) : null,
        ptt: t.codigo === 0 && ptt !== null ? ptt !== 0 : null,
        senalDb: senal,
      };
      // Seguridad: la consola no deja el equipo emitiendo sin límite
      if (this.estado.ptt && this.pttDesde && ahora - this.pttDesde > this.maxPttMs) {
        await c.orden('T 0');
        this.pttDesde = 0;
      }
      if (!this.estado.ptt) this.pttDesde = 0;
    } catch (e: any) {
      this.estado = { ...this.estado, enlace: false, error: e?.message ?? String(e), ptt: null, senalDb: null };
    } finally {
      this.ocupado = false;
    }
  }

  private async mandar(orden: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.cliente) return { ok: false, error: 'El equipo no está configurado.' };
    try {
      const r = await this.cliente.orden(orden);
      return r.codigo === 0 ? { ok: true } : { ok: false, error: `El equipo no acepta la orden: ${errorHamlib(r.codigo)}.` };
    } catch (e: any) {
      return { ok: false, error: `Sin respuesta de rigctld: ${e?.message ?? e}.` };
    }
  }

  frecuencia(hz: number) {
    if (!Number.isFinite(hz) || hz < 30_000 || hz > 3_000_000_000) return Promise.resolve({ ok: false, error: 'Frecuencia fuera de rango.' });
    return this.mandar(`F ${Math.round(hz)}`);
  }

  modo(modo: string) {
    const m = modo.toUpperCase();
    if (!MODOS.includes(m)) return Promise.resolve({ ok: false, error: 'Modo no admitido.' });
    return this.mandar(`M ${m} 0`); // 0 = ancho normal del modo
  }

  vfo(vfo: string) {
    const v = vfo.toUpperCase();
    if (!['VFOA', 'VFOB'].includes(v)) return Promise.resolve({ ok: false, error: 'VFO no admitido.' });
    return this.mandar(`V ${v}`);
  }

  async ptt(emitir: boolean, ahora = Date.now()) {
    const r = await this.mandar(`T ${emitir ? 1 : 0}`);
    if (r.ok) this.pttDesde = emitir ? ahora : 0;
    return r;
  }
}

export interface EstadoRotor {
  enlace: boolean;
  error: string;
  leido: number;
  az: number | null;
  el: number | null;
  /** Objetivo, si se conoce. */
  objetivoAz: number | null;
  objetivoEl: number | null;
  moviendo: boolean | null;
  /** Estado que da la caja: OK, STALL AZ, WIND... */
  fallo: string;
  tieneElevacion: boolean | null;
  nombre: string;
}

const ROTOR_VACIO = (): EstadoRotor => ({ enlace: false, error: '', leido: 0, az: null, el: null, objetivoAz: null, objetivoEl: null, moviendo: null, fallo: '', tieneElevacion: null, nombre: '' });

export type ModoRotor = 'rotctld' | 'caja';

/** Normaliza un evento `pos` o `info` de la caja APRS LoRa+ Rotor sobre el estado. */
export function aplicarEventoCaja(estado: EstadoRotor, evento: any, ahora = Date.now()): EstadoRotor {
  if (!evento || typeof evento !== 'object') return estado;
  if (evento.e === 'pos') {
    return {
      ...estado, enlace: true, error: '', leido: ahora,
      az: num(String(evento.az ?? '')), el: evento.el === undefined ? null : num(String(evento.el)),
      objetivoAz: evento.taz === undefined ? estado.objetivoAz : num(String(evento.taz)),
      objetivoEl: evento.tel === undefined ? estado.objetivoEl : num(String(evento.tel)),
      moviendo: typeof evento.mv === 'boolean' ? evento.mv : null,
      fallo: typeof evento.f === 'string' ? evento.f : '',
    };
  }
  if (evento.e === 'info') {
    return { ...estado, tieneElevacion: typeof evento.hasEl === 'boolean' ? evento.hasEl : estado.tieneElevacion, nombre: [evento.dev, evento.name].filter(Boolean).join(' · ').slice(0, 60) };
  }
  return estado;
}

/** Rotor por rotctld (Hamlib) o por la caja APRS LoRa+ Rotor (JSON por TCP 4534). */
export class Rotor {
  estado: EstadoRotor = ROTOR_VACIO();
  modo: ModoRotor | null = null;
  private hamlib: ClienteHamlib | null = null;
  private ocupado = false;
  // Caja APRS LoRa+ Rotor
  private socket: net.Socket | null = null;
  private caja: { host: string; puerto: number; pin: string } | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private ultimoError = '';

  get destino(): string {
    if (this.hamlib) return `${this.hamlib.host}:${this.hamlib.puerto}`;
    return this.caja ? `${this.caja.host}:${this.caja.puerto}` : '';
  }

  ajustar(modo: ModoRotor, host: string, puerto: number, pin = '') {
    const igual = this.modo === modo && (modo === 'rotctld'
      ? this.hamlib?.host === host && this.hamlib?.puerto === puerto
      : this.caja?.host === host && this.caja?.puerto === puerto && this.caja?.pin === pin);
    if (igual) return;
    this.parar();
    this.modo = modo;
    if (modo === 'rotctld') this.hamlib = new ClienteHamlib(host, puerto);
    else { this.caja = { host, puerto, pin }; this.conectarCaja(); }
  }

  parar() {
    this.hamlib?.cerrar();
    this.hamlib = null;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.caja = null;
    this.socket?.destroy();
    this.socket = null;
    this.modo = null;
    this.estado = ROTOR_VACIO();
  }

  private conectarCaja() {
    const c = this.caja;
    if (!c) return;
    const s = new net.Socket();
    this.socket = s;
    let resto = '';
    s.setEncoding('utf8');
    s.setKeepAlive(true, 15_000);
    s.connect(c.puerto, c.host, () => {
      if (c.pin) s.write(`${JSON.stringify({ c: 'auth', pin: c.pin })}\n`);
      s.write('{"c":"info"}\n{"c":"sub","ms":1000}\n{"c":"get"}\n');
    });
    s.on('data', (trozo: string) => {
      resto += trozo;
      const partes = resto.split('\n');
      resto = partes.pop() ?? '';
      for (const linea of partes) {
        try {
          const evento = JSON.parse(linea);
          if (evento?.e === 'err') this.ultimoError = `${evento.c ?? ''}: ${evento.m ?? ''}`.trim();
          this.estado = aplicarEventoCaja(this.estado, evento);
        } catch { /* línea que no es JSON: se ignora */ }
      }
      if (resto.length > 8000) resto = '';
    });
    const cerrar = (motivo: string) => {
      if (this.socket !== s) return;
      this.socket = null;
      s.destroy();
      this.estado = { ...this.estado, enlace: false, error: motivo, moviendo: null };
      if (this.caja) this.temporizador = setTimeout(() => this.conectarCaja(), 5000);
    };
    s.on('error', (e) => cerrar(e.message));
    s.on('close', () => cerrar('la caja cerró la conexión'));
  }

  /** Lectura periódica (solo hace falta con rotctld: la caja avisa ella). */
  async sondear(ahora = Date.now()): Promise<void> {
    if (this.modo === 'caja') {
      // Sin noticias en 15 s (parado manda cada 5): el enlace se da por caído
      if (this.estado.enlace && ahora - this.estado.leido > 15_000) this.estado = { ...this.estado, enlace: false, error: 'la caja no responde' };
      return;
    }
    const c = this.hamlib;
    if (!c || this.ocupado) return;
    this.ocupado = true;
    try {
      const p = await c.orden('p');
      if (p.codigo !== 0) throw new Error(errorHamlib(p.codigo));
      const az = num(p.valores.Azimuth ?? p.sueltas[0]);
      const el = num(p.valores.Elevation ?? p.sueltas[1]);
      const previo = this.estado;
      // rotctld no dice si se mueve: se deduce de que la posición cambie entre lecturas
      const moviendo = previo.az !== null && az !== null ? Math.abs(az - previo.az) > 0.3 || (el !== null && previo.el !== null && Math.abs(el - previo.el) > 0.3) : null;
      const llegado = previo.objetivoAz !== null && az !== null && Math.abs(((az - previo.objetivoAz + 540) % 360) - 180) < 2 && !moviendo;
      this.estado = {
        ...previo, enlace: true, error: '', leido: ahora, az, el, moviendo,
        objetivoAz: llegado ? null : previo.objetivoAz, objetivoEl: llegado ? null : previo.objetivoEl,
      };
    } catch (e: any) {
      this.estado = { ...this.estado, enlace: false, error: e?.message ?? String(e), moviendo: null };
    } finally {
      this.ocupado = false;
    }
  }

  private async mandarHamlib(orden: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await this.hamlib!.orden(orden);
      return r.codigo === 0 ? { ok: true } : { ok: false, error: `El rotor no acepta la orden: ${errorHamlib(r.codigo)}.` };
    } catch (e: any) {
      return { ok: false, error: `Sin respuesta de rotctld: ${e?.message ?? e}.` };
    }
  }

  private mandarCaja(orden: Record<string, unknown>): { ok: boolean; error?: string } {
    if (!this.socket || !this.estado.enlace) return { ok: false, error: 'La caja del rotor no está conectada.' };
    this.socket.write(`${JSON.stringify(orden)}\n`);
    return { ok: true };
  }

  async ir(az: number, el?: number): Promise<{ ok: boolean; error?: string }> {
    if (!Number.isFinite(az) || az < 0 || az > 450) return { ok: false, error: 'Acimut fuera de rango (0 a 450).' };
    if (el !== undefined && (!Number.isFinite(el) || el < 0 || el > 180)) return { ok: false, error: 'Elevación fuera de rango (0 a 180).' };
    if (!this.modo) return { ok: false, error: 'El rotor no está configurado.' };
    const r = this.modo === 'rotctld'
      ? await this.mandarHamlib(`P ${az.toFixed(1)} ${(el ?? this.estado.el ?? 0).toFixed(1)}`)
      : this.mandarCaja(el === undefined ? { c: 'pos', az } : { c: 'pos', az, el });
    if (r.ok) this.estado = { ...this.estado, objetivoAz: az % 360, objetivoEl: el ?? this.estado.objetivoEl };
    return r;
  }

  async detener(): Promise<{ ok: boolean; error?: string }> {
    if (!this.modo) return { ok: false, error: 'El rotor no está configurado.' };
    const r = this.modo === 'rotctld' ? await this.mandarHamlib('S') : this.mandarCaja({ c: 'stop' });
    if (r.ok) this.estado = { ...this.estado, objetivoAz: null, objetivoEl: null };
    return r;
  }

  async aparcar(): Promise<{ ok: boolean; error?: string }> {
    if (!this.modo) return { ok: false, error: 'El rotor no está configurado.' };
    return this.modo === 'rotctld' ? this.mandarHamlib('K') : this.mandarCaja({ c: 'park' });
  }
}
