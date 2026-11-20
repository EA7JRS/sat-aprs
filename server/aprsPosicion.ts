// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Lectura de la posición de una trama APRS recibida.
//
// Entiende los formatos con posición del protocolo: posición sin comprimir y
// comprimida (con o sin hora), objetos, ítems, Mic-E y tramas de terceros.
// Funciones puras: sirven para situar en el mapa lo que se oye por RF o llega
// de APRS-IS. No decide nada sobre retransmisión.

export interface PosicionAprs {
  /** Estación que emite, o nombre del objeto/ítem. */
  nombre: string;
  /** Quién lo emitió (igual que `nombre` salvo en objetos e ítems). */
  origen: string;
  clase: 'estacion' | 'objeto' | 'item';
  lat: number;
  lon: number;
  /** Tabla y código del símbolo APRS (2 caracteres). */
  simbolo: string;
  comentario: string;
  /** true si el objeto o ítem se da de baja: hay que quitarlo del mapa. */
  baja: boolean;
  /** Rumbo (grados verdaderos) y velocidad, si la trama los lleva y se mueve. */
  rumbo?: number;
  velocidadKmh?: number;
}

const enRango = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

function limpiarComentario(texto: string): string {
  return texto
    .replace(/^\d{3}\/\d{3}/, '')            // rumbo/velocidad
    .replace(/^PHG\d{4}\/?/, '')             // potencia-altura-ganancia
    .replace(/^RNG\d{4}/, '')
    .replace(/\/A=-?\d{5,6}/, '')            // altitud
    .replace(/\|[!-{]{4,}\|/, '')            // telemetría base91
    .replace(/![!-{]{3}!/, '')               // precisión extra (DAO)
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

interface Cruda { lat: number; lon: number; simbolo: string; resto: string; rumbo?: number; velocidadKmh?: number }

const NUDO_KMH = 1.852;
/** Rumbo y velocidad válidos (en nudos) o nada: parado o sin dato no cuenta como movimiento. */
function movimiento(rumbo: number, nudos: number): { rumbo?: number; velocidadKmh?: number } {
  if (!Number.isFinite(rumbo) || !Number.isFinite(nudos) || nudos <= 0 || nudos > 2000 || rumbo < 0 || rumbo > 360) return {};
  return { rumbo: rumbo % 360, velocidadKmh: Math.round(nudos * NUDO_KMH * 10) / 10 };
}

/** «DDMM.hhN/DDDMM.hhW-...» (19 caracteres); los espacios de ambigüedad cuentan como cero. */
function sinComprimir(t: string): Cruda | null {
  const m = /^([0-9 ]{4}\.[0-9 ]{2})([NS])(.)([0-9 ]{5}\.[0-9 ]{2})([EW])(.)/i.exec(t);
  if (!m) return null;
  const a = m[1].replace(/ /g, '0');
  const b = m[4].replace(/ /g, '0');
  let lat = parseInt(a.slice(0, 2), 10) + parseFloat(a.slice(2)) / 60;
  let lon = parseInt(b.slice(0, 3), 10) + parseFloat(b.slice(3)) / 60;
  if (m[2].toUpperCase() === 'S') lat = -lat;
  if (m[5].toUpperCase() === 'W') lon = -lon;
  if (!enRango(lat, lon)) return null;
  // Extensión de datos «rumbo/velocidad» (grados/nudos) justo tras el símbolo; en una estación meteorológica («_») es viento
  const ext = m[6] === '_' ? null : /^(\d{3})\/(\d{3})/.exec(t.slice(19));
  return { lat, lon, simbolo: m[3] + m[6], resto: t.slice(19), ...(ext ? movimiento(Number(ext[1]), Number(ext[2])) : {}) };
}

const base91 = (s: string) => [...s].reduce((n, c) => n * 91 + (c.charCodeAt(0) - 33), 0);

/** Posición comprimida: tabla, 4 de latitud, 4 de longitud, código, 2 de datos y tipo (13 caracteres). */
function comprimida(t: string): Cruda | null {
  if (t.length < 13 || !/^[/\\A-Za-j]/.test(t) || !/^[!-{]{8}$/.test(t.slice(1, 9))) return null;
  const lat = 90 - base91(t.slice(1, 5)) / 380926;
  const lon = -180 + base91(t.slice(5, 9)) / 190463;
  if (!enRango(lat, lon)) return null;
  // Bytes «cs»: con c entre «!» y «z» son rumbo (×4°) y velocidad (1,08^s − 1 nudos)
  const c = t.charCodeAt(10) - 33;
  const v = t.charCodeAt(11) - 33;
  const mov = t[10] !== ' ' && c >= 0 && c <= 89 && v >= 0 ? movimiento(c * 4, Math.pow(1.08, v) - 1) : {};
  return { lat, lon, simbolo: t[0] + t[9], resto: t.slice(13), ...mov };
}

const posicion = (t: string): Cruda | null => (/^[0-9 ]/.test(t) ? sinComprimir(t) : comprimida(t));

/** Mic-E: la latitud viaja en el destino y el resto en el campo de información. */
function micE(destino: string, info: string): Cruda | null {
  const d = destino.split('-')[0];
  if (d.length !== 6 || info.length < 9) return null;
  const cifras: number[] = [];
  for (const c of d) {
    if (c >= '0' && c <= '9') cifras.push(c.charCodeAt(0) - 48);
    else if (c >= 'A' && c <= 'J') cifras.push(c.charCodeAt(0) - 65);
    else if (c >= 'P' && c <= 'Y') cifras.push(c.charCodeAt(0) - 80);
    else if (c === 'K' || c === 'L' || c === 'Z') cifras.push(0); // ambigüedad
    else return null;
  }
  let lat = cifras[0] * 10 + cifras[1] + (cifras[2] * 10 + cifras[3] + (cifras[4] * 10 + cifras[5]) / 100) / 60;
  if (!(d[3] >= 'P' && d[3] <= 'Z')) lat = -lat;
  const mas100 = d[4] >= 'P' && d[4] <= 'Z';
  const oeste = d[5] >= 'P' && d[5] <= 'Z';

  let grados = info.charCodeAt(1) - 28;
  if (mas100) grados += 100;
  if (grados >= 180 && grados <= 189) grados -= 80;
  else if (grados >= 190 && grados <= 199) grados -= 190;
  let minutos = info.charCodeAt(2) - 28;
  if (minutos >= 60) minutos -= 60;
  const centesimas = info.charCodeAt(3) - 28;
  if (grados < 0 || grados > 179 || minutos < 0 || minutos > 59 || centesimas < 0 || centesimas > 99) return null;
  let lon = grados + (minutos + centesimas / 100) / 60;
  if (oeste) lon = -lon;
  if (!enRango(lat, lon)) return null;
  // Tras el símbolo puede ir el tipo de equipo (>, ], `, ') y la altitud «xxx}»
  const resto = info.slice(9).replace(/^[>\]`']/, '').replace(/^[!-{]{3}\}/, '');
  // Velocidad (nudos) y rumbo en los tres bytes siguientes a la longitud
  const sp = info.charCodeAt(4) - 28;
  const dc = info.charCodeAt(5) - 28;
  const se = info.charCodeAt(6) - 28;
  let nudos = sp * 10 + Math.floor(dc / 10);
  let rumbo = (dc % 10) * 100 + se;
  if (nudos >= 800) nudos -= 800;
  if (rumbo >= 400) rumbo -= 400;
  return { lat, lon, simbolo: info[8] + info[7], resto, ...movimiento(rumbo, nudos) };
}

/**
 * Posición contenida en una trama APRS, o null si la trama no lleva posición
 * (mensajes, boletines, telemetría, estado...).
 */
export function leerPosicionAprs(origen: string, destino: string, info: string, nivel = 0): PosicionAprs | null {
  if (!info || !origen) return null;
  const emisor = origen.trim().toUpperCase();
  const tipo = info[0];
  const hecha = (c: Cruda | null, nombre = emisor, clase: PosicionAprs['clase'] = 'estacion', baja = false): PosicionAprs | null =>
    c ? {
      nombre, origen: emisor, clase, lat: c.lat, lon: c.lon, simbolo: c.simbolo, comentario: limpiarComentario(c.resto), baja,
      ...(c.rumbo !== undefined && c.velocidadKmh !== undefined ? { rumbo: c.rumbo, velocidadKmh: c.velocidadKmh } : {}),
    } : null;

  switch (tipo) {
    case '!':
    case '=':
      return hecha(posicion(info.slice(1)));
    case '/':
    case '@':
      return hecha(posicion(info.slice(8)));
    case ';': {
      // ;NOMBRE___*DDHHMMz + posición
      if (info.length < 18) return null;
      const nombre = info.slice(1, 10).trimEnd();
      const marca = info[10];
      if (!nombre || (marca !== '*' && marca !== '_')) return null;
      return hecha(posicion(info.slice(18)), nombre, 'objeto', marca === '_');
    }
    case ')': {
      // )NOMBRE! + posición (nombre de 3 a 9 caracteres)
      const m = /^\)([^!_]{3,9})([!_])/.exec(info);
      if (!m) return null;
      return hecha(posicion(info.slice(m[0].length)), m[1].trimEnd(), 'item', m[2] === '_');
    }
    case '`':
    case "'":
    case '\x1c':
    case '\x1d':
      return hecha(micE(destino.trim().toUpperCase(), info));
    case '}': {
      // Trama de terceros: }ORIGEN>DESTINO,RUTA:info
      if (nivel > 1) return null;
      const m = /^\}([^>\s]+)>([^,:\s]+)[^:]*:([\s\S]+)$/.exec(info);
      return m ? leerPosicionAprs(m[1], m[2], m[3], nivel + 1) : null;
    }
    default:
      return null;
  }
}
