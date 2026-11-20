// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Radiactividad ambiental de EURDEP (red europea de intercambio
// de datos radiológicos), publicada como datos abiertos por la Oficina Federal
// de Protección Radiológica de Alemania (BfS):
//   WFS https://www.imis.bfs.de/ogc/opendata/ows, capa opendata:eurdep_latestValue
// Es la última tasa de dosis gamma ambiental de cada sonda, en µSv/h, con su
// periodo de promedio. Las sondas españolas son las de la REA del CSN y las
// autonómicas. Son datos SIN VALIDAR: el aviso lo dice.

import type { Evento, Gravedad } from '../core/evento';
import { gcDistanceKm } from '../formulas/geo';

export const URL_EURDEP = 'https://www.imis.bfs.de/ogc/opendata/ows';

export interface Sonda {
  id: string;
  nombre: string;
  lat: number;
  lon: number;
  /** µSv/h */
  valor: number;
  /** Fin del periodo de medida (ms). */
  cuando: number;
  horas: number;
  validada: boolean;
}

/** Una sonda por id, la del periodo más corto y más reciente. */
export function leerEurdep(j: any): Sonda[] {
  const mejor = new Map<string, Sonda>();
  for (const f of (Array.isArray(j?.features) ? j.features : [])) {
    const p = f?.properties ?? {};
    const [lon, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.map(Number) : [NaN, NaN];
    const id = String(p.id ?? '').trim();
    let valor = p.value === null || p.value === undefined || p.value === '' ? NaN : Number(p.value);
    const unidad = String(p.unit ?? '').replace('μ', 'µ').toLowerCase();
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(valor) || valor < 0) continue;
    if (unidad === 'nsv/h') valor /= 1000;
    else if (unidad && unidad !== 'µsv/h' && unidad !== 'usv/h') continue;
    const cuando = Date.parse(String(p.end_measure ?? ''));
    if (!Number.isFinite(cuando)) continue;
    const horas = Number(p.analyzed_range_in_h) || 9999;
    const s: Sonda = { id, nombre: String(p.name ?? id).trim(), lat, lon, valor, cuando, horas, validada: Number(p.validated) === 1 };
    const a = mejor.get(id);
    if (!a || s.horas < a.horas || (s.horas === a.horas && s.cuando > a.cuando)) mejor.set(id, s);
  }
  return [...mejor.values()];
}

/** Las sondas más cercanas a la estación, con la distancia. */
export function sondasCercanas(sondas: Sonda[], estacion: { lat: number; lon: number }, n = 10) {
  return sondas.map((s) => ({ ...s, distanciaKm: gcDistanceKm(estacion, s) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm).slice(0, n);
}

const fmt = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

/**
 * Sondas por encima del umbral (µSv/h): amarillo desde el umbral, naranja
 * desde 3 veces y rojo desde 10 veces. Solo medidas de las últimas 12 horas.
 */
export function eventosRadiacion(sondas: Sonda[], umbral: number, ahora = Date.now()): Evento[] {
  if (!(umbral > 0)) return [];
  const ev: Evento[] = [];
  for (const s of sondas) {
    if (ahora - s.cuando > 12 * 3600_000 || s.valor < umbral) continue;
    const gravedad: Gravedad = s.valor >= 10 * umbral ? 'rojo' : s.valor >= 3 * umbral ? 'naranja' : 'amarillo';
    ev.push({
      id: `eurdep-${s.id}-${new Date(s.cuando).toISOString().slice(0, 10)}-${gravedad}`, tipo: 'radiacion', gravedad,
      detalle: `${fmt(s.valor)}uSv/h`,
      titulo: `${s.nombre}${s.validada ? '' : ' sin validar'}`.slice(0, 60),
      lat: s.lat, lon: s.lon, nombre: `RAD${s.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 9),
      inicio: s.cuando, fin: s.cuando + 3 * 3600_000, fuente: 'EURDEP', real: true,
      datos: { uSvh: s.valor, umbral },
    });
  }
  return ev;
}

/** Última medida de las sondas de esos países (códigos de dos letras: ES, PT…). */
export async function descargarEurdep(paises: string[]): Promise<Sonda[]> {
  const ps = [...new Set(paises.map((p) => p.trim().toUpperCase()).filter((p) => /^[A-Z]{2}$/.test(p)))];
  if (!ps.length) return [];
  const filtro = ps.map((p) => `id LIKE '${p}%'`).join(' OR ');
  const q = new URLSearchParams({
    service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: 'opendata:eurdep_latestValue',
    outputFormat: 'application/json', maxFeatures: '5000', CQL_FILTER: ps.length > 1 ? `(${filtro})` : filtro,
  });
  const r = await fetch(`${URL_EURDEP}?${q}`, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'S.A.T.-APRS' } });
  if (!r.ok) throw new Error(`EURDEP (BfS) respondió ${r.status}`);
  return leerEurdep(await r.json());
}
