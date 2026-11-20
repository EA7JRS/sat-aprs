// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Boyas y estaciones costeras más cercanas, en tiempo real.
//
// El NDBC de la NOAA publica, sin clave, la última observación de todas las
// boyas y estaciones costeras que distribuye (las suyas y las de otros países
// que comparten datos). Se leen todas y se devuelven las más próximas a la
// posición actual de la estación. «MM» en el fichero significa «sin medida»:
// ese dato queda vacío, nunca se rellena.

import { gcDistanceKm } from '../formulas/geo';
import { RegistroFuente } from './sismos';

export const URL_BOYAS = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';

export interface Boya {
  id: string;
  lat: number;
  lon: number;
  distanciaKm: number;
  /** Momento de la observación (ms epoch, UTC). */
  cuando: number;
  vientoDirGrados?: number;
  vientoNudos?: number;
  rachaNudos?: number;
  /** Altura significativa de ola, en metros. */
  olaM?: number;
  /** Periodo dominante de ola, en segundos. */
  periodoS?: number;
  olaDirGrados?: number;
  presionHpa?: number;
  aireC?: number;
  aguaC?: number;
}

const MS_A_NUDOS = 1.94384;

/** Lee el fichero de últimas observaciones. Las columnas se localizan por su nombre. */
export function leerBoyas(texto: string): Omit<Boya, 'distanciaKm'>[] {
  const lineas = String(texto ?? '').split('\n');
  const cabecera = lineas.find((l) => l.startsWith('#STN'));
  if (!cabecera) return [];
  const columnas = cabecera.slice(1).trim().split(/\s+/);
  const col = (nombre: string) => columnas.indexOf(nombre);
  const idx = {
    lat: col('LAT'), lon: col('LON'), a: col('YYYY'), m: col('MM'), d: col('DD'), h: col('hh'), min: col('mm'),
    wdir: col('WDIR'), wspd: col('WSPD'), gst: col('GST'), wvht: col('WVHT'), dpd: col('DPD'), mwd: col('MWD'),
    pres: col('PRES'), atmp: col('ATMP'), wtmp: col('WTMP'),
  };
  if (idx.lat < 0 || idx.lon < 0 || idx.a < 0) return [];

  const boyas: Omit<Boya, 'distanciaKm'>[] = [];
  for (const linea of lineas) {
    if (!linea.trim() || linea.startsWith('#')) continue;
    const p = linea.trim().split(/\s+/);
    const dato = (i: number): number | undefined => {
      if (i < 0 || p[i] === undefined || p[i] === 'MM') return undefined;
      const n = Number(p[i]);
      return Number.isFinite(n) ? n : undefined;
    };
    const lat = dato(idx.lat);
    const lon = dato(idx.lon);
    const [a, m, d, h, min] = [dato(idx.a), dato(idx.m), dato(idx.d), dato(idx.h), dato(idx.min)];
    if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (a === undefined || m === undefined || d === undefined || h === undefined) continue;
    const cuando = Date.UTC(a, m - 1, d, h, min ?? 0);
    if (!Number.isFinite(cuando)) continue;
    const nudos = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * MS_A_NUDOS * 10) / 10);
    const boya: Omit<Boya, 'distanciaKm'> = {
      id: p[0], lat, lon, cuando,
      vientoDirGrados: dato(idx.wdir),
      vientoNudos: nudos(dato(idx.wspd)),
      rachaNudos: nudos(dato(idx.gst)),
      olaM: dato(idx.wvht),
      periodoS: dato(idx.dpd),
      olaDirGrados: dato(idx.mwd),
      presionHpa: dato(idx.pres),
      aireC: dato(idx.atmp),
      aguaC: dato(idx.wtmp),
    };
    // Una estación sin ninguna medida no aporta nada
    const { id: _i, lat: _a, lon: _o, cuando: _c, ...medidas } = boya;
    if (Object.values(medidas).every((v) => v === undefined)) continue;
    boyas.push(boya);
  }
  return boyas;
}

/** Las más cercanas a la posición, con observación reciente. */
export function boyasCercanas(
  boyas: Omit<Boya, 'distanciaKm'>[],
  pos: { lat: number; lon: number },
  opciones: { ahora?: number; maxEdadMs?: number; cuantas?: number; radioKm?: number } = {},
): Boya[] {
  const ahora = opciones.ahora ?? Date.now();
  const maxEdad = opciones.maxEdadMs ?? 6 * 3600_000;
  const radio = opciones.radioKm ?? 1500;
  return boyas
    .filter((b) => ahora - b.cuando <= maxEdad && b.cuando - ahora < 3600_000)
    .map((b) => ({ ...b, distanciaKm: Math.round(gcDistanceKm(pos, { lat: b.lat, lon: b.lon }) * 10) / 10 }))
    .filter((b) => b.distanciaKm <= radio)
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, opciones.cuantas ?? 12);
}

export async function descargarBoyas(registrar: RegistroFuente = () => {}): Promise<Omit<Boya, 'distanciaKm'>[] | null> {
  try {
    const r = await fetch(URL_BOYAS, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const boyas = leerBoyas(await r.text());
    if (boyas.length === 0) throw new Error('fichero sin observaciones legibles');
    return boyas;
  } catch (e: any) {
    registrar('NDBC', `Boyas no disponibles: ${e?.message ?? e}`, false);
    return null;
  }
}
