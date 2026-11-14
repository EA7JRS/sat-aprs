// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Focos de calor reales (NASA FIRMS) tal como los entrega la cadena de avisos,
// en la forma que esperan las pantallas de coordinación y de pruebas.
import { WildfireHotspot } from '../types';
import { customFetch } from './customFetch';

const PELIGRO: Record<string, WildfireHotspot['dangerLevel']> = { rojo: 'Extremo', naranja: 'Alto', amarillo: 'Moderado', info: 'Bajo' };

/** Grupos de focos de calor cerca de la estación. Lista vacía si no hay o no se pueden leer. */
export async function leerFocosReales(): Promise<WildfireHotspot[]> {
  try {
    const res = await customFetch('/api/avisos');
    if (!res.ok) return [];
    const json = await res.json();
    return (Array.isArray(json.avisos) ? json.avisos : [])
      .filter((a: any) => a.tipo === 'incendio' && Number.isFinite(a.lat) && Number.isFinite(a.lon))
      .map((a: any): WildfireHotspot => {
        const fecha = new Date(a.inicio).toISOString();
        return {
          id: a.id,
          lat: a.lat,
          lon: a.lon,
          brightnessK: 0,
          frpMw: Number(/(\d+)\s*MW/.exec(a.detalle || '')?.[1] ?? 0),
          confidence: 'n',
          satellite: 'VIIRS',
          instrument: 'VIIRS / MODIS',
          date: fecha.slice(0, 10),
          time: fecha.slice(11, 19),
          region: a.distanciaKm !== null && a.distanciaKm !== undefined ? `a ${a.distanciaKm} km de la estación` : 'cerca de la estación',
          source: 'NASA FIRMS',
          dangerLevel: PELIGRO[a.gravedad] || 'Bajo',
          distanceKm: a.distanciaKm ?? undefined,
        };
      });
  } catch {
    return [];
  }
}
