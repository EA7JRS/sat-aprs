// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Estado de las bandas de HF.
//
// A partir de tres frecuencias se decide qué bandas sirven ahora:
//   - foF2: frecuencia crítica de la capa F2 medida por una ionosonda. Lo que
//     queda por debajo vuelve a tierra casi en vertical: es el enlace NVIS,
//     el de las comunicaciones locales y regionales (0-400 km) de emergencia.
//   - MUF(3000): máxima frecuencia utilizable en un salto de 3000 km.
//   - LUF: por debajo, la capa D absorbe la señal de día.
// Funciones puras. La lectura de ionosondas está al final.

import { gcDistanceKm } from './formulas/geo';

export const BANDAS_HF: Array<{ nombre: string; mhz: number }> = [
  { nombre: '160 m', mhz: 1.85 },
  { nombre: '80 m', mhz: 3.65 },
  { nombre: '60 m', mhz: 5.36 },
  { nombre: '40 m', mhz: 7.1 },
  { nombre: '30 m', mhz: 10.12 },
  { nombre: '20 m', mhz: 14.15 },
  { nombre: '17 m', mhz: 18.1 },
  { nombre: '15 m', mhz: 21.2 },
  { nombre: '12 m', mhz: 24.93 },
  { nombre: '10 m', mhz: 28.5 },
];

export type EstadoBanda = 'abierta' | 'justa' | 'cerrada' | 'absorbida' | 'sin dato';

export interface Ionosfera {
  /** Frecuencia crítica foF2 en MHz (medida). */
  fof2?: number;
  /** MUF para 3000 km en MHz (medida o estimada). */
  muf3000?: number;
  /** Frecuencia mínima utilizable en MHz (estimada). */
  luf?: number;
}

const ok = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Estado de una frecuencia para un tope dado: abierta hasta el 85 % (frecuencia óptima de trabajo), justa hasta el tope. */
function frente(mhz: number, tope: number | undefined, luf: number | undefined): EstadoBanda {
  if (!ok(tope)) return 'sin dato';
  if (ok(luf) && mhz < luf) return 'absorbida';
  if (mhz <= tope * 0.85) return 'abierta';
  if (mhz <= tope) return 'justa';
  return 'cerrada';
}

export interface BandaHf { nombre: string; mhz: number; nvis: EstadoBanda; dx: EstadoBanda }

/** Estado de cada banda para enlace local (NVIS) y de larga distancia. */
export function estadoBandas(i: Ionosfera): BandaHf[] {
  return BANDAS_HF.map((b) => ({
    ...b,
    nvis: frente(b.mhz, i.fof2, i.luf),
    dx: frente(b.mhz, i.muf3000, i.luf),
  }));
}

/** Mejor banda (la más alta abierta) para cada tipo de enlace, o null. */
export function mejorBanda(bandas: BandaHf[], enlace: 'nvis' | 'dx'): string | null {
  const abiertas = bandas.filter((b) => b[enlace] === 'abierta');
  return abiertas.length ? abiertas[abiertas.length - 1].nombre : null;
}

// ---------------------------------------------------------------------------
// Absorción de la capa D por los rayos X (fulguraciones)
// ---------------------------------------------------------------------------
/**
 * MHz que suben la LUF por el flujo de rayos X (GOES, 0,1-0,8 nm, W/m²) con el sol a `elevDeg` grados.
 * Clase X 8, M 4, C 1,5, B 0,5 con el sol en el cenit. La absorción solo existe en el lado de día y crece con
 * cos(cenit)^0,75, como el modelo D-RAP de SWPC; de noche, cero (sin sol no hay capa D).
 */
export function absorcionRayosX(xrayFlux: number | undefined | null, elevDeg: number): number {
  if (!ok(xrayFlux ?? undefined) || !(elevDeg > 0)) return 0;
  const f = xrayFlux as number;
  const clase = f > 1e-4 ? 8 : f > 1e-5 ? 4 : f > 1e-6 ? 1.5 : f > 1e-7 ? 0.5 : 0;
  return clase * Math.pow(Math.sin((elevDeg * Math.PI) / 180), 0.75);
}

// ---------------------------------------------------------------------------
// Ionosondas (red GIRO, a través del servicio de KC2G)
// ---------------------------------------------------------------------------
export const URL_IONOSONDAS = 'https://prop.kc2g.com/api/stations.json';

export interface Ionosonda {
  nombre: string;
  codigo: string;
  lat: number;
  lon: number;
  fof2?: number;
  muf3000?: number;
  /** Altura del máximo de la capa F2 en km. */
  hmf2?: number;
  /** Calidad del escalado automático, 0-100. */
  confianza?: number;
  cuando: number;
  distanciaKm?: number;
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Normaliza la lista de estaciones; descarta las que no traen posición, hora o foF2. */
export function leerIonosondas(json: unknown): Ionosonda[] {
  if (!Array.isArray(json)) return [];
  const salida: Ionosonda[] = [];
  for (const e of json as any[]) {
    const st = e?.station ?? e;
    const lat = num(st?.latitude);
    let lon = num(st?.longitude);
    const texto = String(e?.time ?? '');
    const cuando = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(texto) ? texto : `${texto.replace(' ', 'T')}Z`);
    const fof2 = num(e?.fof2);
    if (lat === undefined || lon === undefined || !Number.isFinite(cuando) || !ok(fof2)) continue;
    if (lon > 180) lon -= 360; // GIRO da la longitud de 0 a 360
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || fof2 > 30) continue;
    const muf = num(e?.mufd);
    salida.push({
      nombre: String(st?.name ?? st?.code ?? 'Ionosonda').slice(0, 40),
      codigo: String(st?.code ?? '').slice(0, 10),
      lat, lon, fof2,
      muf3000: ok(muf) && muf < 60 ? muf : undefined,
      hmf2: num(e?.hmf2),
      confianza: num(e?.cs),
      cuando,
    });
  }
  return salida;
}

/**
 * La ionosonda más cercana con datos recientes y fiables. La ionosfera cambia
 * con la distancia: más allá de `maxKm` la medida ya no representa a la estación.
 */
export function ionosondaCercana(
  estaciones: Ionosonda[],
  pos: { lat: number; lon: number },
  ahora = Date.now(),
  maxKm = 1500,
  maxEdadMs = 2 * 3600_000,
): Ionosonda | null {
  let mejor: Ionosonda | null = null;
  for (const e of estaciones) {
    if (ahora - e.cuando > maxEdadMs || e.cuando > ahora + 15 * 60_000) continue;
    if (e.confianza !== undefined && e.confianza >= 0 && e.confianza < 40) continue; // escalado dudoso
    const d = gcDistanceKm(pos, e);
    if (d > maxKm) continue;
    if (!mejor || d < (mejor.distanciaKm ?? Infinity)) mejor = { ...e, distanciaKm: d };
  }
  return mejor;
}

/** Descarga las ionosondas. null si el servicio no responde. */
export async function descargarIonosondas(): Promise<Ionosonda[] | null> {
  try {
    const res = await fetch(URL_IONOSONDAS, { headers: { 'User-Agent': 'Mozilla/5.0 (S.A.T.-APRS)' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lista = leerIonosondas(await res.json());
    return lista.length > 0 ? lista : null;
  } catch {
    return null;
  }
}
