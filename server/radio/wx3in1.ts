// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Microsat WX3in1 Plus 2.0 (firmware v1.13) en la estación.
//
// Lo que el equipo da por la red, y nada más:
//  - por telnet: «print version», «print stats», «print voltage», «print rfheard»
//    y los mensajes de depuración («HH:MM:SS (ETIQUETA) texto») que se piden con
//    «debug rf on», «debug digi on», etc. Una sola sesión, que se mantiene abierta.
//  - su servidor APRS-IS simple, que pasa a la radio lo que recibe: la vía de
//    emisión de respaldo cuando Direwolf no acepta una trama urgente.
//  - «Statistics upload»: el equipo manda sus estadísticas por HTTP. El formato no
//    está documentado; se guardan las peticiones tal cual para poder leerlas.
// Lo que hace el equipo (digi, iGate, balizas...) sale de su archivo .cfg, que
// comprueba tools/wx3cfg.py (repositorio EA7JRS/wx3in1).
import net from 'net';
import type { ConfAprx } from './aprx';

// ── Telnet ──────────────────────────────────────────────────────────────────
const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;
const ECO = 1, SGA = 3;

/**
 * Quita las negociaciones de telnet del flujo y prepara las respuestas: se acepta
 * que el equipo haga eco y suprima el «go ahead»; todo lo demás se rechaza.
 */
export class FiltroTelnet {
  private estado: 'texto' | 'iac' | 'opcion' | 'sub' | 'sub-iac' = 'texto';
  private orden = 0;

  dar(buf: Buffer): { texto: string; respuesta: Buffer } {
    const texto: number[] = [];
    const resp: number[] = [];
    for (const b of buf) {
      switch (this.estado) {
        case 'texto':
          if (b === IAC) this.estado = 'iac'; else texto.push(b);
          break;
        case 'iac':
          if (b === IAC) { texto.push(IAC); this.estado = 'texto'; }
          else if (b === DO || b === DONT || b === WILL || b === WONT) { this.orden = b; this.estado = 'opcion'; }
          else if (b === SB) this.estado = 'sub';
          else this.estado = 'texto';
          break;
        case 'opcion':
          if (this.orden === WILL) resp.push(IAC, b === ECO || b === SGA ? DO : DONT, b);
          else if (this.orden === DO) resp.push(IAC, b === SGA ? WILL : WONT, b);
          this.estado = 'texto';
          break;
        case 'sub':
          if (b === IAC) this.estado = 'sub-iac';
          break;
        case 'sub-iac':
          this.estado = b === SE ? 'texto' : 'sub';
          break;
      }
    }
    return { texto: Buffer.from(texto).toString('latin1'), respuesta: Buffer.from(resp) };
  }
}

// ── Lo que el equipo escribe ────────────────────────────────────────────────
export interface LineaRegistro { cuando: number; hora: string; etiqueta: string; tipo: TipoRegistro; texto: string }
export type TipoRegistro = 'rf' | 'digi' | 'aprsis' | 'red' | 'otro';

const RE_DEPURACION = /^(\d{1,2}:\d{2}:\d{2})\s+\(([^)]{1,20})\)\s?(.*)$/;

/** Un mensaje de depuración del equipo, como «00:25:47 (DNS) Server name not found...». */
export function leerDepuracion(linea: string, cuando: number): LineaRegistro | null {
  const m = linea.trim().match(RE_DEPURACION);
  if (!m) return null;
  return { cuando, hora: m[1].padStart(8, '0'), etiqueta: m[2].trim(), tipo: tipoEtiqueta(m[2]), texto: m[3] };
}

export function tipoEtiqueta(etiqueta: string): TipoRegistro {
  const e = etiqueta.toUpperCase().replace(/[\s_-]/g, '');
  if (e === 'RF' || e === 'AX25') return 'rf';
  if (e.startsWith('DIGI')) return 'digi';
  if (e.startsWith('APRSIS')) return 'aprsis';
  if (['NTP', 'DNS', 'DHCP'].includes(e)) return 'red';
  return 'otro';
}

export interface DatoEstadistica { etiqueta: string; valor: string; numero: number | null }

/** «print stats»: cada línea «etiqueta: valor» (o «etiqueta = valor»), sin suponer más. */
export function leerEstadisticas(texto: string): DatoEstadistica[] {
  const out: DatoEstadistica[] = [];
  for (const cruda of texto.split(/\r?\n|\r/)) {
    const l = cruda.trim();
    if (!l || RE_DEPURACION.test(l)) continue;
    const m = l.match(/^(.{2,80}?)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    const n = m[2].match(/-?\d+(?:[.,]\d+)?/);
    out.push({ etiqueta: m[1].trim(), valor: m[2].trim(), numero: n ? Number(n[0].replace(',', '.')) : null });
  }
  return out;
}

/** Busca un dato por su etiqueta. Si el equipo no lo da, null: no se supone. */
export function datoEstadistica(datos: DatoEstadistica[], patron: RegExp): DatoEstadistica | null {
  return datos.find((d) => patron.test(d.etiqueta)) ?? null;
}

export const PATRONES = {
  recibidas: /receiv.*crc\s*ok|crc\s*ok/i,
  repetidas: /digipeat|digi'?ed|digied/i,
  eficiencia: /efficien/i,
  enMarcha: /uptime|running|work(ing)?\s*time/i,
};

/** «print voltage»: la primera cifra con su V. */
export function leerTension(texto: string): number | null {
  const m = texto.match(/(\d{1,2}(?:[.,]\d{1,3})?)\s*V\b/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** «print version»: el número de versión del firmware. */
export function leerVersion(texto: string): string | null {
  const m = texto.match(/v\s*(\d+\.\d{1,3})/i) ?? texto.match(/(\d+\.\d{2})/);
  return m ? `v${m[1]}` : null;
}

export interface EstacionOida { indicativo: string; datos: string[]; linea: string }

const RE_INDICATIVO = /^\s*([A-Z0-9]{1,2}\d[A-Z0-9]{0,4}(?:-\d{1,2})?)\b\s*[,;|]?\s*(.*)$/i;

/** «print rfheard»: una estación por línea; lo que sigue al indicativo, en columnas tal cual. */
export function leerOidas(texto: string): EstacionOida[] {
  const out: EstacionOida[] = [];
  for (const cruda of texto.split(/\r?\n|\r/)) {
    const l = cruda.replace(/\s+$/, '');
    if (!l.trim() || RE_DEPURACION.test(l.trim())) continue;
    const m = l.match(RE_INDICATIVO);
    if (!m || /^(print|help|debug|send)$/i.test(m[1])) continue;
    out.push({ indicativo: m[1].toUpperCase(), datos: m[2].split(/\s{2,}|\t|\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean), linea: l.trim() });
  }
  return out;
}

// ── La sesión telnet ────────────────────────────────────────────────────────
export interface AjustesWx3in1 {
  equipo: string;
  puerto: number;
  usuario: string;
  clave: string;
  /** Mensajes de depuración que se piden al entrar: rf, digi, aprsis, ntp, dns... */
  depuracion: string[];
  /** Cada cuántos segundos se piden las estadísticas. */
  intervaloS: number;
}

export interface Minuto { minuto: number; rf: number; digi: number }

const ORDENES_CONSULTA = ['print stats', 'print voltage', 'print rfheard'];
const SILENCIO_MS = 900;
const REINTENTO_MS = 30_000;
const MAX_REGISTRO = 400;

type Estado = 'apagado' | 'conectando' | 'conectado' | 'error';

export class SesionWx3in1 {
  estado: Estado = 'apagado';
  motivo = '';
  desde = 0;
  version: string | null = null;
  tension: number | null = null;
  estadisticas: DatoEstadistica[] = [];
  oidas: EstacionOida[] = [];
  /** Respuestas tal cual, para ver qué escribe el equipo. */
  bruto: Record<string, { texto: string; cuando: number }> = {};
  ultimaConsulta = 0;
  registro: LineaRegistro[] = [];
  private cuentas = new Map<number, { rf: number; digi: number }>();
  private socket: net.Socket | null = null;
  private filtro = new FiltroTelnet();
  private pendiente = '';
  private fase: 'usuario' | 'clave' | 'esperando' | 'dentro' = 'usuario';
  private cola: string[] = [];
  private enCurso: { orden: string; lineas: string[] } | null = null;
  private relojSilencio: NodeJS.Timeout | null = null;
  private relojConsulta: NodeJS.Timeout | null = null;
  private relojReintento: NodeJS.Timeout | null = null;
  private relojEntrada: NodeJS.Timeout | null = null;

  constructor(private ajustes: () => AjustesWx3in1, private anotar: (texto: string) => void = () => {}) {}

  aplicar() {
    this.parar();
    const a = this.ajustes();
    if (!a.equipo) { this.motivo = ''; return; }
    this.abrir();
  }

  parar() {
    for (const r of [this.relojSilencio, this.relojConsulta, this.relojReintento, this.relojEntrada]) if (r) clearTimeout(r);
    this.relojSilencio = this.relojConsulta = this.relojReintento = this.relojEntrada = null;
    if (this.socket) { this.socket.removeAllListeners(); this.socket.on('error', () => {}); this.socket.destroy(); }
    this.socket = null;
    this.estado = 'apagado';
    this.cola = [];
    this.enCurso = null;
  }

  /** Encola una orden de telnet (solo las de consulta y depuración las manda la consola sola). */
  orden(texto: string) {
    this.cola.push(texto);
    this.siguiente();
  }

  /** Recibidas y repetidas por minuto en la última hora, según los mensajes de depuración. */
  minutos(ahora = Date.now()): Minuto[] {
    const actual = Math.floor(ahora / 60_000);
    const out: Minuto[] = [];
    for (let m = actual - 59; m <= actual; m++) {
      const c = this.cuentas.get(m);
      out.push({ minuto: m * 60_000, rf: c?.rf ?? 0, digi: c?.digi ?? 0 });
    }
    return out;
  }

  private abrir() {
    const a = this.ajustes();
    this.estado = 'conectando';
    this.motivo = '';
    this.fase = 'usuario';
    this.pendiente = '';
    this.filtro = new FiltroTelnet();
    const s = net.createConnection({ host: a.equipo, port: a.puerto });
    this.socket = s;
    s.setTimeout(15_000);
    s.on('timeout', () => this.fallo(this.fase === 'dentro' ? 'el equipo dejó de contestar' : 'el equipo no contesta por telnet'));
    s.on('error', (e: any) => this.fallo(e?.code === 'ECONNREFUSED' ? 'telnet rechazado (¿puerto o equipo apagado?)' : e?.code === 'EHOSTUNREACH' || e?.code === 'ENETUNREACH' ? 'equipo inalcanzable en la red' : (e?.message || String(e))));
    s.on('close', () => { if (this.socket === s) this.fallo(this.fase === 'dentro' ? 'el equipo cerró la sesión' : 'el equipo cerró la conexión antes de entrar'); });
    s.on('data', (buf) => this.datos(buf));
  }

  private fallo(motivo: string) {
    if (this.estado === 'apagado') return;
    const antes = this.estado;
    this.parar();
    this.estado = 'error';
    this.motivo = motivo;
    if (antes === 'conectado') this.anotar(`WX3in1: ${motivo}.`);
    this.relojReintento = setTimeout(() => { if (this.ajustes().equipo) this.abrir(); }, REINTENTO_MS);
  }

  private escribir(texto: string) {
    this.socket?.write(Buffer.from(texto + '\r\n', 'latin1'));
  }

  private datos(buf: Buffer) {
    const { texto, respuesta } = this.filtro.dar(buf);
    if (respuesta.length) this.socket?.write(respuesta);
    this.pendiente += texto;
    if (this.fase !== 'dentro') { this.entrar(); return; }
    const partes = this.pendiente.split(/\r?\n|\r/);
    this.pendiente = partes.pop() ?? '';
    for (const l of partes) this.linea(l);
  }

  /** Usuario y contraseña, como en el manual: el equipo pide «Username» y «Password». */
  private entrar() {
    const a = this.ajustes();
    const cola = this.pendiente.slice(-200);
    if (this.fase === 'usuario' && /(user\s*(name)?|login)\s*:?$/i.test(cola.trimEnd())) {
      this.pendiente = '';
      this.escribir(a.usuario);
      this.fase = 'clave';
    } else if (this.fase === 'clave' && /pass\s*(word)?\s*:?\s*$/i.test(cola.trimEnd())) {
      this.pendiente = '';
      this.escribir(a.clave);
      this.fase = 'esperando';
      this.relojEntrada = setTimeout(() => this.dentro(), 1500);
    } else if (this.fase === 'esperando' && /(incorrect|invalid|denied|wrong|fail|bad\s+pass)/i.test(cola)) {
      if (this.relojEntrada) clearTimeout(this.relojEntrada);
      this.fallo('usuario o contraseña de telnet no aceptados');
    }
  }

  private dentro() {
    this.fase = 'dentro';
    this.estado = 'conectado';
    this.desde = Date.now();
    this.socket?.setTimeout(0);
    const resto = this.pendiente;
    this.pendiente = '';
    for (const l of resto.split(/\r?\n|\r/)) if (l.trim()) this.linea(l);
    this.anotar('WX3in1: sesión telnet abierta.');
    const a = this.ajustes();
    this.cola.push('print version');
    for (const d of a.depuracion) if (/^[a-z_]{2,20}$/.test(d)) this.cola.push(`debug ${d} on`);
    this.consultar();
  }

  private consultar() {
    if (this.estado !== 'conectado') return;
    for (const o of ORDENES_CONSULTA) if (!this.cola.includes(o)) this.cola.push(o);
    this.siguiente();
    const s = Math.max(30, Math.min(600, Math.round(this.ajustes().intervaloS || 60)));
    this.relojConsulta = setTimeout(() => this.consultar(), s * 1000);
  }

  private siguiente() {
    if (this.enCurso || this.estado !== 'conectado' || !this.cola.length) return;
    const orden = this.cola.shift()!;
    this.enCurso = { orden, lineas: [] };
    this.escribir(orden);
    this.armarSilencio();
  }

  private armarSilencio() {
    if (this.relojSilencio) clearTimeout(this.relojSilencio);
    this.relojSilencio = setTimeout(() => this.terminar(), SILENCIO_MS);
  }

  private linea(cruda: string) {
    const ahora = Date.now();
    const d = leerDepuracion(cruda, ahora);
    if (d) {
      this.registro.unshift(d);
      if (this.registro.length > MAX_REGISTRO) this.registro.length = MAX_REGISTRO;
      if (d.tipo === 'rf' || d.tipo === 'digi') {
        const m = Math.floor(ahora / 60_000);
        const c = this.cuentas.get(m) ?? { rf: 0, digi: 0 };
        // Una trama recibida se cuenta una vez: las líneas de AX.25 de bajo nivel no
        if (d.tipo === 'rf' && d.etiqueta.toUpperCase() === 'RF') c.rf += 1;
        if (d.tipo === 'digi') c.digi += 1;
        this.cuentas.set(m, c);
        for (const k of this.cuentas.keys()) if (k < m - 70) this.cuentas.delete(k);
      }
      return;
    }
    if (!this.enCurso) return;
    // El eco de la propia orden no es respuesta
    if (cruda.trim().toLowerCase() === this.enCurso.orden.toLowerCase() || /^>\s*$/.test(cruda.trim())) { this.armarSilencio(); return; }
    this.enCurso.lineas.push(cruda);
    this.armarSilencio();
  }

  private terminar() {
    const e = this.enCurso;
    this.enCurso = null;
    if (!e) return;
    const texto = e.lineas.join('\n').trim();
    const ahora = Date.now();
    this.bruto[e.orden] = { texto, cuando: ahora };
    if (e.orden === 'print version') this.version = leerVersion(texto) ?? this.version;
    else if (e.orden === 'print stats') { this.estadisticas = leerEstadisticas(texto); this.ultimaConsulta = ahora; }
    else if (e.orden === 'print voltage') this.tension = leerTension(texto);
    else if (e.orden === 'print rfheard') this.oidas = leerOidas(texto);
    this.siguiente();
  }

  /** Cuántas recibidas y repetidas se han visto en los últimos `min` minutos. */
  cuenta(min = 60, ahora = Date.now()): { rf: number; digi: number; minutosVistos: number } {
    const m0 = Math.floor(ahora / 60_000) - min + 1;
    let rf = 0, digi = 0;
    for (const [k, c] of this.cuentas) if (k >= m0) { rf += c.rf; digi += c.digi; }
    const vistos = this.desde ? Math.min(min, Math.max(1, Math.ceil((ahora - this.desde) / 60_000))) : 0;
    return { rf, digi, minutosVistos: vistos };
  }
}

// ── Vía de respaldo: el servidor APRS-IS simple del equipo ─────────────────
export interface AjustesServidorSimple { equipo: string; puerto: number; usuario: string; clave: string; version: string }

/**
 * Entrega una trama (formato TNC2: ORIGEN>DESTINO,RUTA:info) al servidor APRS-IS
 * simple del WX3in1, que la pasa a la radio. Se entra como un cliente APRS-IS.
 */
export function enviarPorServidorSimple(a: AjustesServidorSimple, tnc2: string, plazoMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!a.equipo || !a.puerto) return reject(new Error('sin equipo o puerto del servidor APRS-IS simple'));
    if (/[\r\n]/.test(tnc2) || !/^[A-Z0-9-]{1,9}>[^:]{1,80}:/i.test(tnc2)) return reject(new Error('trama no válida'));
    let recibido = '';
    let fase: 'saludo' | 'login' | 'hecho' = 'saludo';
    const s = net.createConnection({ host: a.equipo, port: a.puerto });
    const fin = (err: Error | null) => {
      clearTimeout(plazo); clearTimeout(sinSaludo);
      s.removeAllListeners('data');
      s.on('error', () => {});
      s.end();
      setTimeout(() => s.destroy(), 300);
      if (err) reject(err); else resolve(recibido.trim().split(/\r?\n/).filter((l) => l.startsWith('#')).slice(-1)[0] ?? '');
    };
    const plazo = setTimeout(() => fin(new Error('el servidor APRS-IS simple no contesta')), plazoMs);
    const entrar = () => {
      if (fase !== 'saludo') return;
      fase = 'login';
      s.write(`user ${a.usuario} pass ${a.clave} vers ${a.version}\r\n`);
      setTimeout(() => {
        if (fase !== 'login') return;
        fase = 'hecho';
        s.write(tnc2 + '\r\n');
        setTimeout(() => fin(null), 600);
      }, 1200);
    };
    const sinSaludo = setTimeout(entrar, 2500);  // hay servidores que no saludan
    s.on('connect', () => {});
    s.on('data', (b) => {
      recibido += b.toString('latin1');
      if (fase === 'saludo' && /^#/m.test(recibido)) entrar();
      if (fase === 'login' && /#\s*logresp\b[^\n]*\b(unverified|invalid|refused|denied)/i.test(recibido)) { fase = 'hecho'; fin(new Error('el servidor APRS-IS simple no aceptó el usuario o la contraseña')); }
    });
    s.on('error', (e: any) => fin(new Error(e?.code === 'ECONNREFUSED' ? 'servidor APRS-IS simple desactivado o en otro puerto' : (e?.message || String(e)))));
  });
}

// ── Statistics upload ───────────────────────────────────────────────────────
export interface PeticionEstadisticas { cuando: number; desde: string; metodo: string; ruta: string; consulta: Record<string, string>; cuerpo: string }

/** Guarda las últimas peticiones del equipo tal cual: su formato no está documentado. */
export class RecibidorEstadisticas {
  peticiones: PeticionEstadisticas[] = [];
  constructor(private max = 20) {}
  anotar(p: PeticionEstadisticas) {
    this.peticiones.unshift({ ...p, cuerpo: p.cuerpo.slice(0, 4000) });
    if (this.peticiones.length > this.max) this.peticiones.length = this.max;
  }
}

// ── Qué hace cada uno en la estación ────────────────────────────────────────
/** Lo que importa de direwolf.conf para el reparto: digipetidor, iGate y balizas. */
export interface FuncionesDirewolf { digipeat: number; igate: boolean; igateRf: boolean; balizas: number }

export function funcionesDirewolf(texto: string): FuncionesDirewolf {
  const f: FuncionesDirewolf = { digipeat: 0, igate: false, igateRf: false, balizas: 0 };
  for (const cruda of String(texto ?? '').split('\n')) {
    const l = cruda.replace(/#.*$/, '').trim();
    if (!l) continue;
    const k = l.split(/\s+/)[0].toUpperCase();
    if (k === 'DIGIPEAT') f.digipeat += 1;
    else if (k === 'IGSERVER') f.igate = true;
    else if (k === 'IGTXVIA') f.igateRf = true;
    else if (/^[PTOCI]BEACON$/.test(k)) f.balizas += 1;
  }
  return f;
}

/** Comenta las líneas DIGIPEAT de direwolf.conf (el digipetidor queda en otro equipo). */
export function quitarDigiDirewolf(texto: string, nota: string): { texto: string; cambiadas: number } {
  let cambiadas = 0;
  const out = String(texto).split('\n').map((l) => {
    if (/^\s*DIGIPEAT\b/i.test(l)) { cambiadas += 1; return `# ${nota}: ${l}`; }
    return l;
  });
  return { texto: out.join('\n'), cambiadas };
}

/** Resumen de tools/wx3cfg.py check --json (solo lo que se usa aquí). */
export interface ResumenWx3cfg {
  callsign: string;
  digipeater: { on: boolean; rules: Array<{ name: string; n_max: number; enable_if: string }> };
  igate: { rf_to_is: boolean; msg_to_rf: boolean; packets_to_rf: boolean; servers: string[]; user: string; passcode_ok: boolean };
  beacons: Array<{ n: number; rf_min: number; is_min: number }>;
  weather: { station: string | null; rf_min: number; is_min: number; wunderground: boolean };
  aprsis_server: { on: boolean; port: number; user: string; to_t2: boolean; from_t2: boolean };
  stats_upload: { on: boolean; host: string; port: number; path: string; interval_min: number };
  telnet: { port: number; user: string };
  network: { dhcp: boolean; ip: string };
  ntp: string | null;
}

export type Celda = 'si' | 'no' | 'respaldo' | 'desconocido';
export interface FilaReparto { funcion: string; consola: Celda; aprx: Celda; wx3in1: Celda }
export interface Conflicto { id: string; nivel: 'aviso' | 'info'; texto: string }

export interface EntradaReparto {
  direwolf: FuncionesDirewolf | null;
  aprx: ConfAprx | null;
  wx3in1: ResumenWx3cfg | null;
  consola: { indicativo: string; baliza: boolean; parteMeteo: boolean; emite: boolean };
  respaldo: boolean;
}

const celda = (conocido: boolean, valor: boolean): Celda => (!conocido ? 'desconocido' : valor ? 'si' : 'no');
const mismoIndicativo = (a: string, b: string) => !!a && !!b && a.toUpperCase().replace(/-0$/, '') === b.toUpperCase().replace(/-0$/, '');

/**
 * Qué hace cada uno (la consola con Direwolf, aprx y el WX3in1) y dónde se pisan.
 * Se supone que los tres trabajan en la misma frecuencia (144,800 MHz): si no es
 * así, los avisos de choque no aplican y la pantalla lo dice.
 */
export function repartoFunciones(e: EntradaReparto): { filas: FilaReparto[]; conflictos: Conflicto[] } {
  const dw = e.direwolf, ax = e.aprx, wx = e.wx3in1;
  const axIs = !!ax?.aprsis;
  const axARf = !!ax?.digipeater && ax.digipeater.fuentes.some((f) => /aprsis/i.test(f));
  const filas: FilaReparto[] = [
    { funcion: 'Digipetidor', consola: celda(!!dw, (dw?.digipeat ?? 0) > 0), aprx: celda(!!ax, !!ax?.digipeater && ax.digipeater.fuentes.some((f) => !/aprsis/i.test(f))), wx3in1: celda(!!wx, !!wx?.digipeater.on) },
    { funcion: 'iGate RF → APRS-IS', consola: celda(!!dw, !!dw?.igate), aprx: celda(!!ax, axIs), wx3in1: celda(!!wx, !!wx?.igate.rf_to_is) },
    { funcion: 'APRS-IS → RF', consola: celda(!!dw, !!dw?.igateRf), aprx: celda(!!ax, axARf), wx3in1: celda(!!wx, !!wx && (wx.igate.msg_to_rf || wx.igate.packets_to_rf)) },
    { funcion: 'Baliza de posición', consola: e.consola.baliza || (dw?.balizas ?? 0) > 0 ? 'si' : 'no', aprx: celda(!!ax, (ax?.balizas ?? 0) > 0), wx3in1: celda(!!wx, (wx?.beacons.length ?? 0) > 0) },
    { funcion: 'Parte meteorológico', consola: e.consola.parteMeteo ? 'si' : 'no', aprx: ax ? 'no' : 'desconocido', wx3in1: celda(!!wx, !!wx?.weather.station && (wx.weather.rf_min > 0 || wx.weather.is_min > 0)) },
    { funcion: 'Avisos de emergencia (emisión)', consola: e.consola.emite ? 'si' : 'no', aprx: 'no', wx3in1: e.respaldo ? 'respaldo' : 'no' },
  ];
  const conflictos: Conflicto[] = [];
  const quienes = (f: FilaReparto) => [f.consola === 'si' ? 'Direwolf' : null, f.aprx === 'si' ? 'aprx' : null, f.wx3in1 === 'si' ? 'el WX3in1' : null].filter((x): x is string => !!x);
  const lista = (q: string[]) => q.length === 2 ? `${q[0]} y ${q[1]}` : `${q.slice(0, -1).join(', ')} y ${q[q.length - 1]}`;
  const digi = quienes(filas[0]);
  if (digi.length > 1) conflictos.push({ id: 'digi', nivel: 'aviso', texto: `Dos digipetidores: ${lista(digi)} repiten los mismos paquetes. Cada uno sale dos veces y hay más colisiones. Deje el digipetidor en uno solo.` });
  const aRf = quienes(filas[2]);
  if (aRf.length > 1) conflictos.push({ id: 'aprsis-rf', nivel: 'aviso', texto: `${lista(aRf)} pasan tráfico de APRS-IS a la radio: lo mismo saldría dos veces.` });
  const igate = quienes(filas[1]);
  if (igate.length > 1) conflictos.push({ id: 'igate', nivel: 'info', texto: `${lista(igate)} hacen de iGate. APRS-IS descarta los duplicados, pero basta con uno.` });
  if (wx && filas[3].wx3in1 === 'si' && filas[3].consola === 'si' && mismoIndicativo(wx.callsign, e.consola.indicativo)) {
    conflictos.push({ id: 'baliza', nivel: 'aviso', texto: `La consola y el WX3in1 envían baliza de posición con el mismo indicativo (${wx.callsign}).` });
  }
  if (filas[4].consola === 'si' && filas[4].wx3in1 === 'si') {
    conflictos.push({ id: 'meteo', nivel: 'aviso', texto: 'La consola y el WX3in1 envían parte meteorológico: deje uno solo.' });
  }
  return { filas, conflictos };
}
