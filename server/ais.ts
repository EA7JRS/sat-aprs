// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Lectura de AIS (sentencias NMEA !AIVDM / !AIVDO).
//
// Es lo que entregan AIS-catcher, rtl_ais, un receptor AIS o un servidor como
// AISHub, por UDP o TCP. Se leen los mensajes de posición (1, 2, 3, 18, 19 y
// 27) y los de datos estáticos (5 y 24) para el nombre. Funciones puras, más
// un pequeño almacén de barcos para la capa AIS del mapa.

export interface MensajeAis {
  tipo: number;
  mmsi: number;
  lat?: number;
  lon?: number;
  /** Velocidad sobre el fondo en nudos. */
  sog?: number;
  /** Rumbo sobre el fondo en grados. */
  cog?: number;
  /** Proa verdadera en grados. */
  proa?: number;
  estado?: number;
  nombre?: string;
  indicativo?: string;
  tipoBarco?: number;
  destino?: string;
}

/** Suma de comprobación NMEA correcta (o ausente). */
export function sumaNmeaValida(sentencia: string): boolean {
  const m = /^[!$]([^*]*)\*([0-9A-Fa-f]{2})/.exec(sentencia.trim());
  if (!m) return !sentencia.includes('*');
  let x = 0;
  for (const c of m[1]) x ^= c.charCodeAt(0);
  return x === parseInt(m[2], 16);
}

class Bits {
  private b: number[] = [];
  constructor(carga: string, relleno: number) {
    for (const c of carga) {
      let v = c.charCodeAt(0) - 48;
      if (v > 40) v -= 8;
      if (v < 0 || v > 63) v = 0;
      for (let i = 5; i >= 0; i--) this.b.push((v >> i) & 1);
    }
    if (relleno > 0 && relleno < 6) this.b.length = Math.max(0, this.b.length - relleno);
  }
  get largo() { return this.b.length; }
  u(desde: number, n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 2 + (this.b[desde + i] ?? 0);
    return v;
  }
  s(desde: number, n: number): number {
    const v = this.u(desde, n);
    return this.b[desde] ? v - 2 ** n : v;
  }
  texto(desde: number, n: number): string {
    let t = '';
    for (let i = 0; i + 6 <= n && desde + i + 6 <= this.b.length; i += 6) {
      const v = this.u(desde + i, 6);
      t += String.fromCharCode(v < 32 ? v + 64 : v);
    }
    return t.replace(/@.*$/, '').trim();
  }
}

function posicion(m: MensajeAis, lon: number, lat: number, divisor: number) {
  const la = lat / divisor;
  const lo = lon / divisor;
  // 91° y 181° significan «no disponible»
  if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) {
    m.lat = la;
    m.lon = lo;
  }
}

/** Interpreta la carga (ya reensamblada) de un mensaje AIS. */
export function leerCargaAis(carga: string, relleno = 0): MensajeAis | null {
  const b = new Bits(carga, relleno);
  if (b.largo < 38) return null;
  const tipo = b.u(0, 6);
  const m: MensajeAis = { tipo, mmsi: b.u(8, 30) };
  if (m.mmsi <= 0) return null;

  if (tipo >= 1 && tipo <= 3) {
    if (b.largo < 137) return null;
    m.estado = b.u(38, 4);
    const sog = b.u(50, 10);
    if (sog < 1023) m.sog = sog / 10;
    posicion(m, b.s(61, 28), b.s(89, 27), 600000);
    const cog = b.u(116, 12);
    if (cog < 3600) m.cog = cog / 10;
    const proa = b.u(128, 9);
    if (proa < 360) m.proa = proa;
  } else if (tipo === 18 || tipo === 19) {
    if (b.largo < 133) return null;
    const sog = b.u(46, 10);
    if (sog < 1023) m.sog = sog / 10;
    posicion(m, b.s(57, 28), b.s(85, 27), 600000);
    const cog = b.u(112, 12);
    if (cog < 3600) m.cog = cog / 10;
    const proa = b.u(124, 9);
    if (proa < 360) m.proa = proa;
    if (tipo === 19 && b.largo >= 271) {
      m.nombre = b.texto(143, 120) || undefined;
      m.tipoBarco = b.u(263, 8);
    }
  } else if (tipo === 27) {
    if (b.largo < 90) return null;
    m.estado = b.u(40, 4);
    posicion(m, b.s(44, 18), b.s(62, 17), 600);
    const sog = b.u(79, 6);
    if (sog < 63) m.sog = sog;
    const cog = b.u(85, 9);
    if (cog < 360) m.cog = cog;
  } else if (tipo === 5) {
    if (b.largo < 240) return null;
    m.indicativo = b.texto(70, 42) || undefined;
    m.nombre = b.texto(112, 120) || undefined;
    m.tipoBarco = b.u(232, 8);
    if (b.largo >= 422) m.destino = b.texto(302, 120) || undefined;
  } else if (tipo === 24) {
    if (b.largo < 160) return null;
    const parte = b.u(38, 2);
    if (parte === 0) m.nombre = b.texto(40, 120) || undefined;
    else if (parte === 1) {
      m.tipoBarco = b.u(40, 8);
      m.indicativo = b.texto(90, 42) || undefined;
    }
  } else {
    return null;
  }
  return m;
}

/** Reensambla las sentencias de varios fragmentos y entrega los mensajes completos. */
export class LectorAis {
  private pendientes = new Map<string, { partes: string[]; cuando: number }>();
  sentencias = 0;
  descartadas = 0;

  /** Procesa una línea NMEA. Devuelve el mensaje si con ella queda completo. */
  linea(texto: string, ahora = Date.now()): MensajeAis | null {
    // Algunos programas anteponen una etiqueta («\s:...\!AIVDM...»): se busca la sentencia dentro
    const i = texto.search(/!(AI|BS|AB|AN|AR|AS|AT|AX|SA)VD[MO],/);
    if (i < 0) return null;
    const sentencia = texto.slice(i).trim();
    this.sentencias++;
    if (!sumaNmeaValida(sentencia)) { this.descartadas++; return null; }
    const c = sentencia.split('*')[0].split(',');
    if (c.length < 7) { this.descartadas++; return null; }
    const total = parseInt(c[1], 10);
    const numero = parseInt(c[2], 10);
    const relleno = parseInt(c[6], 10) || 0;
    if (!(total >= 1 && total <= 9) || !(numero >= 1 && numero <= total)) { this.descartadas++; return null; }
    if (total === 1) return leerCargaAis(c[5], relleno);

    const clave = `${c[3]}|${c[4]}|${total}`;
    for (const [k, v] of this.pendientes) if (ahora - v.cuando > 10_000) this.pendientes.delete(k);
    if (numero === 1) this.pendientes.set(clave, { partes: [c[5]], cuando: ahora });
    else {
      const p = this.pendientes.get(clave);
      if (!p || p.partes.length !== numero - 1) { this.pendientes.delete(clave); return null; }
      p.partes.push(c[5]);
    }
    const p = this.pendientes.get(clave);
    if (!p || p.partes.length < total) return null;
    this.pendientes.delete(clave);
    return leerCargaAis(p.partes.join(''), relleno);
  }
}

export interface Barco {
  mmsi: number;
  lat?: number;
  lon?: number;
  sog?: number;
  cog?: number;
  proa?: number;
  nombre?: string;
  indicativo?: string;
  tipoBarco?: number;
  destino?: string;
  ultima: number;
}

/** Barcos oídos: une posición y datos estáticos por MMSI. */
export class Barcos {
  private mapa = new Map<number, Barco>();
  constructor(private caducidadMs = 20 * 60_000, private maximo = 5000) {}

  anotar(m: MensajeAis, ahora = Date.now()) {
    const previo = this.mapa.get(m.mmsi) ?? { mmsi: m.mmsi, ultima: ahora };
    const { tipo: _tipo, estado: _estado, ...datos } = m;
    for (const [k, v] of Object.entries(datos)) if (v !== undefined) (previo as any)[k] = v;
    previo.ultima = ahora;
    this.mapa.delete(m.mmsi);
    this.mapa.set(m.mmsi, previo);
    if (this.mapa.size > this.maximo) {
      const primero = this.mapa.keys().next().value;
      if (primero !== undefined) this.mapa.delete(primero);
    }
  }

  /** Barcos vigentes con posición conocida, del más reciente al más antiguo. */
  lista(ahora = Date.now()): Barco[] {
    for (const [k, v] of this.mapa) if (ahora - v.ultima > this.caducidadMs) this.mapa.delete(k);
    return [...this.mapa.values()].filter((b) => b.lat !== undefined && b.lon !== undefined).reverse();
  }

  get total(): number { return this.mapa.size; }
}

/** Clase de barco legible a partir del tipo AIS. */
export function claseBarco(tipo: number | undefined): string {
  if (tipo === undefined || tipo === 0) return '';
  if (tipo === 30) return 'Pesquero';
  if (tipo === 31 || tipo === 32 || tipo === 52) return 'Remolcador';
  if (tipo === 35) return 'Militar';
  if (tipo === 36) return 'Velero';
  if (tipo === 37) return 'Recreo';
  if (tipo === 50) return 'Práctico';
  if (tipo === 51) return 'Salvamento';
  if (tipo === 55) return 'Policía';
  if (tipo >= 40 && tipo < 50) return 'Alta velocidad';
  if (tipo >= 60 && tipo < 70) return 'Pasaje';
  if (tipo >= 70 && tipo < 80) return 'Carguero';
  if (tipo >= 80 && tipo < 90) return 'Petrolero';
  return '';
}
