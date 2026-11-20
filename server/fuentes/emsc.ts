// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Sismos de fuera de España: EMSC-CSEM (SeismicPortal, CC BY 4.0).
//
// Servicio FDSN del Centro Sismológico Euro-Mediterráneo, sin clave:
//   https://www.seismicportal.eu/fdsnws/event/1/query?format=json&…
// Sismos de M3,5 o más a menos de 15° de la estación (Portugal, Marruecos,
// Argelia, Italia, el Atlántico…), que el IGN no cubre. Mismo lector y mismos
// niveles que la app Android y el plotter APRS LoRa+ (OfficialAlerts.emsc y
// quakeLevel): la gravedad sale de la magnitud y de la distancia a la estación.

import type { Evento, Gravedad } from '../core/evento';
import { gcDistanceKm } from '../formulas/geo';

export const URL_EMSC = (lat: number, lon: number, desdeMs: number, minMag = 3.5, radioGrados = 15) =>
  `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=50&minmag=${minMag.toFixed(1)}&latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&maxradius=${radioGrados.toFixed(0)}&start=${new Date(desdeMs).toISOString().slice(0, 19)}`;

export interface SismoEmsc { id: string; magnitud: number; region: string; lat: number; lon: number; profundidadKm: number; cuando: number }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function leerEmsc(j: any): SismoEmsc[] {
  const sismos: SismoEmsc[] = [];
  for (const f of (Array.isArray(j?.features) ? j.features : [])) {
    const p = f?.properties;
    const lat = num(p?.lat); const lon = num(p?.lon); const mag = num(p?.mag);
    const cuando = Date.parse(String(p?.time ?? ''));
    const id = String(p?.unid ?? f?.id ?? '').trim();
    if (lat === null || lon === null || mag === null || !Number.isFinite(cuando) || !id) continue;
    sismos.push({ id, magnitud: mag, region: String(p.flynn_region ?? '').trim(), lat, lon, profundidadKm: Math.abs(num(p.depth) ?? 0), cuando });
  }
  return sismos;
}

/**
 * Nivel por magnitud y distancia (el de la app):
 * rojo M6 a menos de 300 km o M7 a menos de 1000; naranja M5 < 300, M6 < 1000, M7,5 < 3000;
 * amarillo M4 < 100, M5 < 600, M6 < 2000; el resto, información.
 */
export function nivelSismo(m: number, km: number): Gravedad {
  if ((m >= 6 && km < 300) || (m >= 7 && km < 1000)) return 'rojo';
  if ((m >= 5 && km < 300) || (m >= 6 && km < 1000) || (m >= 7.5 && km < 3000)) return 'naranja';
  if ((m >= 4 && km < 100) || (m >= 5 && km < 600) || (m >= 6 && km < 2000)) return 'amarillo';
  return 'info';
}

/** El mismo sismo en dos catálogos: a menos de 60 km, 90 s y 0,6 de magnitud. */
export function mismoSismo(a: { lat: number; lon: number; cuando: number; magnitud: number }, b: { lat: number; lon: number; cuando: number; magnitud: number }): boolean {
  return gcDistanceKm(a, b) < 60 && Math.abs(a.cuando - b.cuando) < 90_000 && Math.abs(a.magnitud - b.magnitud) < 0.6;
}

/** Sismos de las últimas 24 h como eventos; los que ya da otra fuente (el IGN) se dejan fuera. */
export function eventosEmsc(sismos: SismoEmsc[], estacion: { lat: number; lon: number }, yaConocidos: Array<{ lat: number; lon: number; cuando: number; magnitud: number }> = [], ahora = Date.now()): Evento[] {
  return sismos.filter((s) => ahora - s.cuando < 24 * 3600_000 && !yaConocidos.some((k) => mismoSismo(s, k))).map((s) => ({
    id: `emsc-${s.id}`, tipo: 'sismo' as const, gravedad: nivelSismo(s.magnitud, gcDistanceKm(estacion, s)),
    detalle: `M${s.magnitud.toFixed(1)} Prof:${Math.round(s.profundidadKm)}km`, titulo: s.region.slice(0, 60) || 'EMSC',
    lat: s.lat, lon: s.lon, inicio: s.cuando, fuente: 'EMSC', real: true,
    datos: { magnitud: s.magnitud, profundidadKm: s.profundidadKm },
  }));
}

export async function descargarEmsc(lat: number, lon: number): Promise<SismoEmsc[]> {
  const r = await fetch(URL_EMSC(lat, lon, Date.now() - 24 * 3600_000), { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'S.A.T.-APRS' } });
  if (r.status === 204) return [];   // FDSN: sin sismos en la consulta
  if (!r.ok) throw new Error(`EMSC respondió ${r.status}`);
  const texto = await r.text();
  return texto.trim() ? leerEmsc(JSON.parse(texto)) : [];
}
