// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Sucesos naturales abiertos de NASA EONET (Earth Observatory
// Natural Event Tracker, dominio público):
//   https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=N&category=…
// Inundaciones, tormentas severas, volcanes… con su última posición. Mismo
// lector que la app Android (HamLayers.parseEonet). EONET no da gravedad:
// todos entran como amarillo y el radio decide.

import type { Evento, TipoEmergencia } from '../core/evento';

export const CATEGORIAS_EONET: Record<string, { nombre: string; tipo: TipoEmergencia; prefijo: string }> = {
  floods: { nombre: 'Inundacion', tipo: 'otro', prefijo: 'IN' },
  severeStorms: { nombre: 'Tormenta severa', tipo: 'meteo', prefijo: 'TS' },
  volcanoes: { nombre: 'Volcan', tipo: 'otro', prefijo: 'VO' },
  wildfires: { nombre: 'Incendio', tipo: 'incendio', prefijo: 'IF' },
  landslides: { nombre: 'Deslizamiento', tipo: 'otro', prefijo: 'DS' },
};
export const URL_EONET = (categoria: string, dias = 20) => `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=${dias}&category=${encodeURIComponent(categoria)}`;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** El último punto (o el centro del polígono) de cada suceso abierto. */
export function eventosEonet(j: any, categoria: string, ahora = Date.now()): Evento[] {
  const c = CATEGORIAS_EONET[categoria];
  if (!c) return [];
  const ev: Evento[] = [];
  for (const e of (Array.isArray(j?.events) ? j.events : [])) {
    const g = Array.isArray(e?.geometry) ? e.geometry[e.geometry.length - 1] : null;
    const id = String(e?.id ?? '').trim();
    if (!g || !id || !Array.isArray(g.coordinates)) continue;
    let lat: number | null = null; let lon: number | null = null;
    if (g.type === 'Point') { lat = num(g.coordinates[1]); lon = num(g.coordinates[0]); }
    else if (g.type === 'Polygon' && Array.isArray(g.coordinates[0])) {
      const r = g.coordinates[0].filter((p: any) => Array.isArray(p) && num(p[0]) !== null && num(p[1]) !== null);
      if (r.length) { lat = r.reduce((s: number, p: number[]) => s + p[1], 0) / r.length; lon = r.reduce((s: number, p: number[]) => s + p[0], 0) / r.length; }
    }
    if (lat === null || lon === null) continue;
    const cuando = Date.parse(String(g.date ?? '')) || ahora;
    const magnitud = num(g.magnitudeValue) !== null ? ` ${Math.round(g.magnitudeValue)}${g.magnitudeUnit ? ` ${g.magnitudeUnit}` : ''}` : '';
    ev.push({
      id: `eonet-${id}`, tipo: c.tipo, gravedad: 'amarillo', detalle: `${c.nombre}${magnitud}`.slice(0, 40), titulo: String(e.title ?? id).slice(0, 60),
      lat, lon, nombre: `${c.prefijo}${id.replace(/^EONET_/, '')}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 9),
      // Sigue abierto mientras EONET lo liste: vale hasta la siguiente consulta y un margen
      inicio: cuando, fin: ahora + 6 * 3600_000, fuente: 'NASA EONET', real: true,
    });
  }
  return ev;
}

export async function descargarEonet(categoria: string, dias = 20): Promise<any> {
  const r = await fetch(URL_EONET(categoria, dias), { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'S.A.T.-APRS' } });
  if (!r.ok) throw new Error(`EONET (${categoria}) respondió ${r.status}`);
  return r.json();
}
