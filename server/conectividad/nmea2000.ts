// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Emisión NMEA 2000 (SocketCAN).
//
// El NUC, con un adaptador CAN (SocketCAN, 250 kbit/s), hace de nodo NMEA 2000 y pone en el bus los datos propios de la
// estación: posición y hora del GPS (gpsd), meteorología (Internet, Weewx, METAR, GRIB) y, si hay un objetivo o ruta, los
// datos de navegación para un piloto del bus. Reclama una dirección ISO (PGN 60928, respuesta a la petición 59904). No es un
// nodo certificado. Lo recibido por RF (AIS, ADS-B, APRS) NO se retransmite: es solo para el mapa.
//
// Los formatos de los PGN se han contrastado con las definiciones de canboat y con la implementación del plotter APRS LoRa+.

/** Trama CAN de 29 bits (NMEA 2000 siempre usa identificadores extendidos). */
export interface TramaCan {
  id: number;
  datos: Uint8Array;
}

/** Transporte físico del bus: lo implementa SocketCAN (o un simulador en las pruebas). */
export interface TransporteCan {
  enviar(t: TramaCan): void;
}

/**
 * Transporte SocketCAN con can-utils (cansend / candump), sin dependencias nativas de Node.
 * Debian: `sudo apt install can-utils`, y la interfaz levantada: `sudo ip link set can0 up type can bitrate 250000`.
 * Emite cada trama con `cansend` (ID extendido de 29 bits) y lee el bus con `candump -L` para el reclamo de dirección.
 * Sin probar con un bus real.
 */
export class TransporteSocketCan implements TransporteCan {
  private candump: ReturnType<typeof import('child_process').spawn> | null = null;
  private resto = '';

  constructor(private iface: string, private alRecibir?: (id: number, datos: Uint8Array) => void) {}

  async abrir(): Promise<void> {
    const { spawn } = await import('child_process');
    this.candump = spawn('candump', ['-L', this.iface], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.candump.stdout?.on('data', (b: Buffer) => this.consumir(b.toString('latin1')));
  }

  cerrar() { this.candump?.kill(); this.candump = null; }

  enviar(t: TramaCan): void {
    import('child_process').then(({ execFile }) => {
      const id = (t.id >>> 0).toString(16).toUpperCase().padStart(8, '0');
      const datos = Array.from(t.datos, (x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
      execFile('cansend', [this.iface, `${id}#${datos}`], () => { /* los errores los refleja el estado del bus */ });
    });
  }

  // Formato de `candump -L`: "(ts) iface ID#DATA" con ID extendido de 8 hex
  private consumir(txt: string) {
    this.resto += txt;
    let nl: number;
    while ((nl = this.resto.indexOf('\n')) >= 0) {
      const linea = this.resto.slice(0, nl).trim();
      this.resto = this.resto.slice(nl + 1);
      const m = /\s(\w+)#([0-9A-Fa-f]*)$/.exec(linea);
      if (!m || m[1].length < 4) continue;
      const id = parseInt(m[1], 16) >>> 0;
      const datos = new Uint8Array(m[2].length / 2);
      for (let i = 0; i < datos.length; i++) datos[i] = parseInt(m[2].substr(i * 2, 2), 16);
      this.alRecibir?.(id, datos);
    }
  }
}

const PGN_PETICION = 59904;
const PGN_RECLAMO = 60928;
const KN_A_MS = 1852 / 3600;
const MN_A_M = 1852;

/** Identificador de 29 bits. Con PGN dirigido (PF < 240) el byte bajo del PGN es 0 y «dst» va en su lugar. */
export function n2kId(prio: number, pgn: number, src: number, dst = 255): number {
  const pf = (pgn >> 8) & 0xff;
  const p = pf < 240 ? (pgn & 0x3ff00) | dst : pgn & 0x3ffff;
  return (((prio & 7) << 26) | (p << 8) | src) >>> 0;
}

/** Descompone un identificador de 29 bits. */
export function n2kParseId(id: number): { prio: number; pgn: number; src: number; dst: number } {
  const prio = (id >> 26) & 7;
  const src = id & 0xff;
  const ps = (id >> 8) & 0xff;
  const pf = (id >> 16) & 0xff;
  const dp = (id >> 24) & 1;
  const pgn = pf < 240 ? (dp << 16) | (pf << 8) : (dp << 16) | (pf << 8) | ps;
  const dst = pf < 240 ? ps : 255;
  return { prio, pgn, src, dst };
}

// --- utilidades de empaquetado (little-endian) ---
function u16(d: DataView, o: number, v: number) { d.setUint16(o, v & 0xffff, true); }
function u32(d: DataView, o: number, v: number) { d.setUint32(o, v >>> 0, true); }
function i32(d: DataView, o: number, v: number) { d.setInt32(o, v | 0, true); }
function fill(a: Uint8Array, v = 0xff) { a.fill(v); }

function u16res(d: DataView, o: number, v: number, res: number, noData = 0xffff) {
  if (!Number.isFinite(v)) { d.setUint16(o, noData, true); return; }
  let n = Math.round(v / res);
  if (n < 0) n = 0;
  if (n > noData - 2) n = noData - 2;
  d.setUint16(o, n, true);
}
function i16res(d: DataView, o: number, v: number, res: number) {
  if (!Number.isFinite(v)) { d.setInt16(o, 0x7fff, true); return; }
  let n = Math.round(v / res);
  if (n > 32766) n = 32766;
  if (n < -32767) n = -32767;
  d.setInt16(o, n, true);
}
function radU16(d: DataView, o: number, rad: number) {
  if (!Number.isFinite(rad)) { d.setUint16(o, 0xffff, true); return; }
  let a = rad % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  let n = Math.round(a * 10000);
  if (n >= 62832) n = 0;
  d.setUint16(o, n, true);
}
function llI32(d: DataView, o: number, deg: number) {
  if (!Number.isFinite(deg)) { d.setInt32(o, 0x7fffffff, true); return; }
  d.setInt32(o, Math.round(deg * 1e7) | 0, true);
}

// --- NAME y reclamo de dirección (ISO 11783-5) ---
export interface OpcionesName {
  unico?: number;        // 21 bits (número de serie)
  fabricante?: number;   // 11 bits (2046 = sin registrar)
  instancia?: number;
  funcion?: number;      // 60/130 = navegación
  clase?: number;        // 60 = navegación
  instanciaSistema?: number;
  grupoIndustria?: number; // 4 = marina
  direccionArbitraria?: boolean;
}

export function n2kName(o: OpcionesName = {}): bigint {
  const unico = BigInt((o.unico ?? 0) & 0x1fffff);
  const fab = BigInt((o.fabricante ?? 2046) & 0x7ff);
  const inst = BigInt(o.instancia ?? 0);
  const fun = BigInt(o.funcion ?? 130);
  const clase = BigInt((o.clase ?? 60) & 0x7f);
  const sis = BigInt((o.instanciaSistema ?? 0) & 0x0f);
  const grp = BigInt((o.grupoIndustria ?? 4) & 0x07);
  const arb = BigInt(o.direccionArbitraria === false ? 0 : 1);
  return unico | (fab << 21n) | (inst << 32n) | (fun << 40n) | (clase << 49n) | (sis << 56n) | (grp << 60n) | (arb << 63n);
}

function reclamoTrama(name: bigint, src: number): TramaCan {
  const datos = new Uint8Array(8);
  let v = name;
  for (let i = 0; i < 8; i++) { datos[i] = Number(v & 0xffn); v >>= 8n; }
  return { id: n2kId(6, PGN_RECLAMO, src, 255), datos };
}

/** Máquina de reclamo de dirección: arranca, defiende y negocia la dirección en el bus. */
export class ReclamoDireccion {
  private dir: number;
  private reclamadoMs = 0;
  private arrancado = false;
  private tomadas = new Set<number>();
  cambios = 0;

  constructor(private name: bigint, preferida: number) {
    this.dir = preferida > 251 ? 0 : preferida;
  }

  direccion(): number { return this.dir; }
  perdida(): boolean { return this.dir === 254; }

  /** Arranca o reinicia; devuelve el reclamo que hay que mandar. */
  arrancar(nowMs: number): TramaCan {
    this.arrancado = true;
    this.reclamadoMs = nowMs;
    return reclamoTrama(this.name, this.dir);
  }

  /** Se puede emitir: 250 ms tras el último reclamo sin disputa y con dirección. */
  listo(nowMs: number): boolean {
    return this.arrancado && !this.perdida() && nowMs - this.reclamadoMs >= 250;
  }

  private siguiente(): boolean {
    if (!(this.name >> 63n)) { this.dir = 254; return false; }   // sin dirección arbitraria: se queda sin dirección
    for (let a = 128; a <= 251; a++) if (!this.tomadas.has(a)) { this.dir = a; return true; }
    this.dir = 254;
    return false;
  }

  /** Trama recibida del bus. Devuelve el reclamo propio a mandar, o null. */
  alRecibir(id: number, datos: Uint8Array, nowMs: number): TramaCan | null {
    if (!this.arrancado) return null;
    const p = n2kParseId(id);
    if (p.pgn === PGN_PETICION) {
      if (datos.length >= 3) {
        const pgn = datos[0] | (datos[1] << 8) | (datos[2] << 16);
        if (pgn === PGN_RECLAMO && (p.dst === 255 || p.dst === this.dir)) {
          this.reclamadoMs = nowMs;
          return reclamoTrama(this.name, this.dir);
        }
      }
      return null;
    }
    if (p.pgn !== PGN_RECLAMO || datos.length < 8) return null;
    if (p.src < 252) this.tomadas.add(p.src);
    if (p.src !== this.dir) return null;
    // otro equipo reclama nuestra dirección: gana el NAME más bajo
    let otro = 0n;
    for (let i = 7; i >= 0; i--) otro = (otro << 8n) | BigInt(datos[i]);
    if (this.name < otro) { this.reclamadoMs = nowMs; return reclamoTrama(this.name, this.dir); }
    this.cambios++;
    if (!this.siguiente()) return null;
    this.reclamadoMs = nowMs;
    return reclamoTrama(this.name, this.dir);
  }
}

// --- codificadores de PGN ---

/** 129025 posición rápida. */
export function latLonRapida(lat: number, lon: number): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  llI32(d, 0, lat);
  llI32(d, 4, lon);
  return a;
}

/** 129026 COG/SOG rápido. cog en radianes verdaderos; sog en m/s. */
export function cogSogRapida(sid: number, cogRad: number, sogMs: number): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  a[0] = sid;
  a[1] = 0xfc;                 // ref 0 = verdadero, bits altos reservados a 1
  radU16(d, 2, cogRad);
  u16res(d, 4, sogMs, 0.01);
  a[6] = 0xff; a[7] = 0xff;
  return a;
}

/** 126992 hora del sistema (unixSec, UTC). */
export function horaSistema(sid: number, unixSec: number): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  a[0] = sid;
  a[1] = 0xf0;                 // fuente GPS (0), bits altos reservados
  u16(d, 2, Math.floor(unixSec / 86400));
  u32(d, 4, Math.round((unixSec % 86400) * 10000));   // 0,0001 s desde medianoche
  return a;
}

/** 130306 viento. speedMs m/s; angleRad; ref 0 verdadero-norte, 2 aparente, 3 real-barco. */
export function viento(sid: number, speedMs: number, angleRad: number, ref: number): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  fill(a);
  a[0] = sid;
  u16res(d, 1, speedMs, 0.01);
  radU16(d, 3, angleRad);
  a[5] = 0xf8 | (ref & 7);
  return a;
}

/** 130314 presión atmosférica, en pascales. */
export function presion(sid: number, pa: number): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  fill(a);
  a[0] = sid;
  a[1] = 0;                    // instancia
  a[2] = 0;                    // fuente 0 = atmosférica
  i32(d, 3, Math.round(pa / 0.1));   // resolución 0,1 Pa (como canboat / la librería NMEA2000)
  a[7] = 0xff;
  return a;
}

/** 130316 temperatura de rango ampliado, en kelvin. */
export function temperaturaExt(sid: number, kelvin: number): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  fill(a);
  a[0] = sid;
  a[1] = 0;                    // instancia
  a[2] = 0;                    // fuente 0 = temperatura exterior
  // temperatura: 24 bits, 0,001 K
  const n = Math.round(kelvin / 0.001);
  a[3] = n & 0xff; a[4] = (n >> 8) & 0xff; a[5] = (n >> 16) & 0xff;
  a[6] = 0xff; a[7] = 0xff;    // temperatura de consigna: sin dato
  return a;
}

/** 129283 cross-track error. metros (positivo = barco a estribor); terminado = navegación terminada. */
export function xte(sid: number, metros: number, terminado: boolean): Uint8Array {
  const a = new Uint8Array(8);
  const d = new DataView(a.buffer);
  fill(a);
  a[0] = sid;
  a[1] = 0x00 | (0x3 << 4) | ((terminado ? 1 : 0) << 6);
  if (Number.isFinite(metros)) i32(d, 2, Math.round(metros * 100));
  return a;
}

export interface DatosNav {
  distanciaM: number;
  xteM?: number;               // error de cross-track, metros (positivo = barco a estribor del tramo)
  demoraOrigenDestinoRad?: number;
  demoraPosicionDestinoRad?: number;
  destLat?: number;
  destLon?: number;
  wpOrigen?: number;
  wpDestino?: number;
  velAcercamientoMs?: number;
  enLlegada?: boolean;
  loxodromica?: boolean;
}

/** 129284 datos de navegación (fast packet, 34 bytes de payload). */
export function datosNav(sid: number, n: DatosNav): Uint8Array {
  const a = new Uint8Array(34);
  const d = new DataView(a.buffer);
  fill(a);
  a[0] = sid;
  u32(d, 1, Number.isFinite(n.distanciaM) ? Math.round(n.distanciaM * 100) : 0xffffffff);
  a[5] = (0) | (0 << 2) | ((n.enLlegada ? 1 : 0) << 4) | ((n.loxodromica ? 1 : 0) << 6);
  u32(d, 6, 0xffffffff);       // hora estimada de llegada: sin dato
  u16(d, 10, 0xffff);          // fecha estimada de llegada: sin dato
  radU16(d, 12, n.demoraOrigenDestinoRad ?? NaN);
  radU16(d, 14, n.demoraPosicionDestinoRad ?? NaN);
  u32(d, 16, (n.wpOrigen ?? 0xffffffff) >>> 0);
  u32(d, 20, (n.wpDestino ?? 0xffffffff) >>> 0);
  llI32(d, 24, n.destLat ?? NaN);
  llI32(d, 28, n.destLon ?? NaN);
  i16res(d, 32, n.velAcercamientoMs ?? NaN, 0.01);
  return a;
}

/** Parte un payload en tramas de fast packet (ISO 11783-3). seq: 0..7, cambia en cada mensaje nuevo. */
export function tramasFastPacket(payload: Uint8Array, seq: number): Uint8Array[] {
  const len = payload.length;
  const n = len <= 6 ? 1 : 1 + Math.ceil((len - 6) / 7);
  const s = (seq & 7) << 5;
  const out: Uint8Array[] = [];
  let pos = 0;
  for (let f = 0; f < n; f++) {
    const fr = new Uint8Array(8).fill(0xff);
    fr[0] = s | f;
    let b = 1;
    if (f === 0) fr[b++] = len;
    while (b < 8 && pos < len) fr[b++] = payload[pos++];
    out.push(fr);
  }
  return out;
}

/** Fuentes de datos de la estación para la emisión (devuelven null si no hay dato fresco). */
export interface FuentesN2k {
  posicion?(): { lat: number; lon: number; cogRad?: number; sogMs?: number } | null;
  horaUnix?(): number | null;
  viento?(): { velMs: number; direccionRad: number } | null;   // dirección verdadera (de donde viene)
  presionPa?(): number | null;
  temperaturaK?(): number | null;
  navegacion?(): DatosNav | null;
}

export interface ConfigN2k {
  activo: boolean;
  interfaz: string;            // p. ej. "can0"
  direccion: number;           // dirección preferida (empieza en 60)
  emitirGps: boolean;
  emitirMeteo: boolean;
  emitirNavegacion: boolean;
  unico?: number;              // número de serie del NAME
}

export const CONFIG_N2K_DEFECTO: ConfigN2k = {
  activo: false,
  interfaz: 'can0',
  direccion: 60,
  emitirGps: true,
  emitirMeteo: true,
  emitirNavegacion: true,
};

/** Emisor NMEA 2000: reclama dirección y emite los PGN activados cada segundo desde las fuentes. */
export class EmisorN2k {
  private reclamo: ReclamoDireccion;
  private sid = 0;
  private seq = 0;
  private ultGps = -1e9;
  private ultMeteo = -1e9;
  private ultHora = -1e9;
  private ultNav = -1e9;

  constructor(private transporte: TransporteCan, private cfg: ConfigN2k, private fuentes: FuentesN2k) {
    this.reclamo = new ReclamoDireccion(n2kName({ unico: cfg.unico, clase: 60, funcion: 130 }), cfg.direccion);
  }

  arrancar(nowMs: number) { this.transporte.enviar(this.reclamo.arrancar(nowMs)); }
  direccion(): number { return this.reclamo.direccion(); }

  /** Pásale cada trama recibida del bus para que defienda/negocie la dirección. */
  alRecibir(id: number, datos: Uint8Array, nowMs: number) {
    const r = this.reclamo.alRecibir(id, datos, nowMs);
    if (r) this.transporte.enviar(r);
  }

  private envia(pgn: number, payload: Uint8Array, prio = 3) {
    const src = this.reclamo.direccion();
    if (payload.length <= 8) {
      this.transporte.enviar({ id: n2kId(prio, pgn, src), datos: payload });
    } else {
      this.seq = (this.seq + 1) & 7;
      const id = n2kId(prio, pgn, src);
      for (const fr of tramasFastPacket(payload, this.seq)) this.transporte.enviar({ id, datos: fr });
    }
  }

  /** Llamar a menudo (p. ej. cada 200 ms). Emite 1 vez/s cada grupo activado. */
  tick(nowMs: number) {
    if (!this.cfg.activo || !this.reclamo.listo(nowMs)) return;
    this.sid = (this.sid + 1) % 253;
    if (this.cfg.emitirGps) {
      const p = this.fuentes.posicion?.();
      if (p && nowMs - this.ultGps >= 1000) {
        this.ultGps = nowMs;
        this.envia(129025, latLonRapida(p.lat, p.lon));
        this.envia(129026, cogSogRapida(this.sid, p.cogRad ?? NaN, p.sogMs ?? NaN));
      }
      const t = this.fuentes.horaUnix?.();
      if (t && nowMs - this.ultHora >= 1000) { this.ultHora = nowMs; this.envia(126992, horaSistema(this.sid, t)); }
    }
    if (this.cfg.emitirMeteo && nowMs - this.ultMeteo >= 1000) {
      this.ultMeteo = nowMs;
      const w = this.fuentes.viento?.();
      if (w) this.envia(130306, viento(this.sid, w.velMs, w.direccionRad, 0), 2);
      const pa = this.fuentes.presionPa?.();
      if (pa != null) this.envia(130314, presion(this.sid, pa), 5);
      const tk = this.fuentes.temperaturaK?.();
      if (tk != null) this.envia(130316, temperaturaExt(this.sid, tk), 5);
    }
    if (this.cfg.emitirNavegacion && nowMs - this.ultNav >= 1000) {
      const nav = this.fuentes.navegacion?.();
      if (nav) {
        this.ultNav = nowMs;
        this.envia(129283, xte(this.sid, nav.xteM ?? NaN, nav.enLlegada ?? false));
        this.envia(129284, datosNav(this.sid, nav));
      }
    }
  }
}
