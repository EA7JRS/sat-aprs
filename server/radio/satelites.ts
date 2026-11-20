// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Satélites: elementos orbitales (TLE), posición y pasos.
//
// Usa el mismo archivo que el tracker y la app APRS LoRa+ (`sats_all.txt`, en
// la rama `satdata` del repositorio APRS-LoRa-Plus): se genera cada día con
// los TLE de CelesTrak y los transmisores de SatNOGS DB (CC BY-SA 4.0).
// Formato, un bloque por satélite: «S|norad|nombre|categoría|grupos», las dos
// líneas del TLE y una línea «T|…» por transmisor.
// La órbita se propaga con SGP4 (biblioteca satellite.js). Los TLE envejecen:
// pasados unos días la precisión baja, y se indica su antigüedad.

import * as sgp4 from 'satellite.js';
import { LatLon } from '../formulas/geo';

export const URL_SATELITES = 'https://raw.githubusercontent.com/EA7JRS/APRS-LoRa-Plus/satdata/sats_all.txt';

export interface Transmisor {
  /** Frecuencias en Hz; 0 = sin dato. */
  subidaHz: number;
  bajadaHz: number;
  modo: string;
  baudios: number;
  descripcion: string;
  /** Subtono CTCSS en Hz, si lo pide. */
  ctcssHz?: number;
}

export interface Satelite {
  norad: number;
  nombre: string;
  /** U 70 cm, V 2 m / VHF, L LoRa, G geoestacionario. */
  categoria: string;
  /** Letras de los grupos de CelesTrak (a aficionados, s estaciones espaciales, w meteorológicos...). */
  grupos: string;
  tle1: string;
  tle2: string;
  /** Época del TLE (ms epoch). */
  epoca: number;
  transmisores: Transmisor[];
}

/** Época de un TLE (año de dos cifras y día del año con decimales, columnas 19-32). */
export function epocaTle(linea1: string): number {
  const aa = Number(linea1.slice(18, 20));
  const dia = Number(linea1.slice(20, 32));
  if (!Number.isFinite(aa) || !Number.isFinite(dia)) return NaN;
  const anio = aa < 57 ? 2000 + aa : 1900 + aa;
  return Date.UTC(anio, 0, 1) + (dia - 1) * 86400_000;
}

/** Suma de control de una línea de TLE (dígitos, y cada «-» vale 1). */
export function sumaTle(linea: string): boolean {
  if (linea.length < 69) return false;
  let suma = 0;
  for (const c of linea.slice(0, 68)) suma += c >= '0' && c <= '9' ? Number(c) : c === '-' ? 1 : 0;
  return suma % 10 === Number(linea[68]);
}

/** Lee el archivo de satélites. Los bloques sin TLE válido se descartan. */
export function leerSatelites(texto: string): { satelites: Satelite[]; generado: number | null } {
  const satelites: Satelite[] = [];
  let generado: number | null = null;
  let actual: Partial<Satelite> | null = null;
  const cerrar = () => {
    if (actual && actual.tle1 && actual.tle2 && Number.isFinite(actual.epoca)) satelites.push(actual as Satelite);
    actual = null;
  };
  for (const cruda of String(texto ?? '').split('\n')) {
    const l = cruda.replace(/\r$/, '');
    if (l.startsWith('#')) {
      const m = /(\d{4}-\d\d-\d\dT\d\d:\d\dZ)/.exec(l);
      if (m && generado === null) generado = Date.parse(m[1].replace('Z', ':00Z'));
      continue;
    }
    if (l.startsWith('S|')) {
      cerrar();
      const p = l.split('|');
      const norad = Number(p[1]);
      if (Number.isInteger(norad) && norad > 0) actual = { norad, nombre: (p[2] || String(norad)).trim(), categoria: p[3] || '', grupos: p[4] || '', transmisores: [] };
    } else if (actual && l.startsWith('1 ') && sumaTle(l)) {
      actual.tle1 = l;
      actual.epoca = epocaTle(l);
    } else if (actual && l.startsWith('2 ') && sumaTle(l)) {
      actual.tle2 = l;
    } else if (actual && l.startsWith('T|')) {
      const p = l.split('|');
      const n = (i: number) => (Number.isFinite(Number(p[i])) ? Number(p[i]) : 0);
      actual.transmisores!.push({
        subidaHz: n(1), bajadaHz: n(3), modo: p[5] || '', baudios: n(6), descripcion: (p[8] || '').trim(),
        ctcssHz: p[9] && Number(p[9]) > 0 ? Number(p[9]) / 10 : undefined,
      });
    }
  }
  cerrar();
  return { satelites, generado };
}

export interface Mirada {
  /** Acimut verdadero y elevación, en grados. */
  az: number;
  el: number;
  distanciaKm: number;
  /** Velocidad radial en km/s; positiva = se aleja. */
  radialKmS: number;
}

const GRADOS = 180 / Math.PI;

/** Órbita lista para propagar. Null si el TLE no es utilizable. */
export function orbita(s: Pick<Satelite, 'tle1' | 'tle2'>): sgp4.SatRec | null {
  if (!sumaTle(s.tle1) || !sumaTle(s.tle2)) return null;
  try {
    const r = sgp4.twoline2satrec(s.tle1, s.tle2);
    return r && !r.error && Number.isFinite(r.no) && Number.isFinite(r.ecco) ? r : null;
  } catch {
    return null;
  }
}

/** Dónde se ve el satélite desde la estación en un instante. */
export function mirar(o: sgp4.SatRec, estacion: LatLon, altitudM: number, cuando: number): Mirada | null {
  const fecha = new Date(cuando);
  const pv = sgp4.propagate(o, fecha) as any;
  if (!pv || !pv.position || typeof pv.position.x !== 'number' || !pv.velocity) return null;
  const gmst = sgp4.gstime(fecha);
  const observador = { latitude: estacion.lat / GRADOS, longitude: estacion.lon / GRADOS, height: altitudM / 1000 };
  const ecf = sgp4.eciToEcf(pv.position, gmst);
  const v = sgp4.ecfToLookAngles(observador, ecf);
  if (!Number.isFinite(v.azimuth) || !Number.isFinite(v.elevation)) return null;
  // Velocidad radial: diferencia de distancia un segundo después
  const pv2 = sgp4.propagate(o, new Date(cuando + 1000)) as any;
  let radial = 0;
  if (pv2 && pv2.position && typeof pv2.position.x === 'number') {
    const v2 = sgp4.ecfToLookAngles(observador, sgp4.eciToEcf(pv2.position, sgp4.gstime(new Date(cuando + 1000))));
    radial = v2.rangeSat - v.rangeSat;
  }
  return { az: (v.azimuth * GRADOS + 360) % 360, el: v.elevation * GRADOS, distanciaKm: v.rangeSat, radialKmS: radial };
}

/** Frecuencia que se recibe (bajada) con el Doppler: al acercarse sube. */
export function conDoppler(hz: number, radialKmS: number): number {
  return Math.round(hz * (1 - radialKmS / 299792.458));
}

export interface Paso {
  /** Salida, culminación y puesta (ms epoch). */
  aos: number;
  maximo: number;
  los: number;
  azAos: number;
  azLos: number;
  /** Elevación máxima, en grados. */
  elMax: number;
  azMax: number;
}

/**
 * Próximo paso sobre el horizonte a partir de `desde` (o el que está en curso).
 * Busca a saltos de 30 s y afina los cruces al segundo. Null si no hay paso en
 * el plazo (geoestacionarios, o latitudes sin cobertura).
 */
export function proximoPaso(o: sgp4.SatRec, estacion: LatLon, altitudM: number, desde: number, plazoH = 36, elMin = 0): Paso | null {
  const el = (t: number) => mirar(o, estacion, altitudM, t)?.el ?? -90;
  const afinar = (a: number, b: number, sube: boolean) => {
    // a y b a cada lado del cruce
    for (let i = 0; i < 12 && b - a > 1000; i++) {
      const m = (a + b) / 2;
      if ((el(m) > elMin) === sube) b = m; else a = m;
    }
    return Math.round(b / 1000) * 1000;
  };
  const PASO = 30_000;
  const fin = desde + plazoH * 3600_000;
  let t = desde;
  let aos: number | null = null;
  if (el(t) > elMin) {
    // Ya está arriba: se busca hacia atrás cuándo salió (como mucho 30 minutos)
    let atras = t;
    while (atras > desde - 1800_000 && el(atras - PASO) > elMin) atras -= PASO;
    aos = el(atras - PASO) > elMin ? atras - PASO : afinar(atras - PASO, atras, true);
  } else {
    for (; t < fin; t += PASO) {
      if (el(t + PASO) > elMin) { aos = afinar(t, t + PASO, true); t += PASO; break; }
    }
  }
  if (aos === null) return null;
  let los = t;
  while (los < fin + 3600_000 && el(los + PASO) > elMin) los += PASO;
  if (el(los + PASO) > elMin) return null; // nunca se pone: no es un paso
  const finPaso = afinar(los, los + PASO, false);
  let maximo = aos;
  let elMax = -90;
  for (let x = aos; x <= finPaso; x += 5000) {
    const e = el(x);
    if (e > elMax) { elMax = e; maximo = x; }
  }
  const az = (x: number) => Math.round(mirar(o, estacion, altitudM, x)?.az ?? 0);
  return { aos, maximo, los: finPaso, azAos: az(aos), azLos: az(finPaso), elMax: Math.round(elMax * 10) / 10, azMax: az(maximo) };
}

export const NOMBRE_GRUPO: Record<string, string> = {
  s: 'Estaciones espaciales', a: 'Aficionados', w: 'Meteorológicos', c: 'CubeSats', n: 'SatNOGS', v: 'Más brillantes',
  x: 'Ciencia', d: 'Educación', e: 'Ingeniería', l: 'LoRa', g: 'Geoestacionarios',
};
