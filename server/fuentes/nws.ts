// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Avisos del Servicio Meteorológico Nacional de EE. UU. (NWS):
// https://api.weather.gov/alerts/active?point=lat,lon (GeoJSON, sin clave).
// Son los avisos en vigor para el punto de la estación: tornados, tormentas
// severas, huracanes, inundaciones… Solo cubre EE. UU. y sus territorios; en
// el resto del mundo no devuelve nada. Mismo lector que la app Android y el
// plotter APRS LoRa+ (OfficialAlerts.nws).

import type { Evento, Gravedad, TipoEmergencia } from '../core/evento';

export const URL_NWS = (lat: number, lon: number) => `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;

const gravedadDe = (s: string): Gravedad => (/extreme/i.test(s) ? 'rojo' : /severe/i.test(s) ? 'naranja' : /moderate/i.test(s) ? 'amarillo' : 'info');
const tipoDe = (evento: string): TipoEmergencia =>
  /tornado/i.test(evento) ? 'tornado' : /hurricane|tropical|typhoon/i.test(evento) ? 'huracan' : /tsunami/i.test(evento) ? 'tsunami' : /fire|red flag/i.test(evento) ? 'incendio' : 'meteo';

export function eventosNws(j: any, estacion: { lat: number; lon: number }, ahora = Date.now()): Evento[] {
  const ev: Evento[] = [];
  for (const f of (Array.isArray(j?.features) ? j.features : [])) {
    const p = f?.properties;
    if (!p || (p.status ?? 'Actual') !== 'Actual' || p.messageType === 'Cancel') continue;
    const id = String(p.id ?? '').trim();
    const evento = String(p.event ?? '').trim();
    if (!id || !evento) continue;
    const inicio = Date.parse(p.onset ?? '') || Date.parse(p.effective ?? '') || Date.parse(p.sent ?? '') || ahora;
    const fin = Date.parse(p.ends ?? '') || Date.parse(p.expires ?? '') || undefined;
    if (fin && fin < ahora) continue;
    // Centro del polígono del aviso; sin polígono, la estación (el aviso es para su punto)
    let { lat, lon } = estacion;
    const anillo = f?.geometry?.type === 'Polygon' && Array.isArray(f.geometry.coordinates?.[0])
      ? f.geometry.coordinates[0].filter((c: any) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) : [];
    if (anillo.length) {
      lat = anillo.reduce((s: number, c: number[]) => s + c[1], 0) / anillo.length;
      lon = anillo.reduce((s: number, c: number[]) => s + c[0], 0) / anillo.length;
    }
    ev.push({
      id: `nws-${id.split('/').pop()}`.slice(0, 120), tipo: tipoDe(evento), gravedad: gravedadDe(String(p.severity ?? '')),
      detalle: evento.slice(0, 40), titulo: String(p.areaDesc ?? '').split(';')[0].trim().slice(0, 60) || 'NWS',
      lat, lon, inicio, fin, fuente: 'NWS', real: true,
    });
  }
  return ev;
}

export async function descargarNws(lat: number, lon: number): Promise<any> {
  const r = await fetch(URL_NWS(lat, lon), { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'S.A.T.-APRS (github.com/EA7JRS/sat-aprs)', Accept: 'application/geo+json' } });
  // Fuera de su zona de cobertura la API rechaza el punto: no es un fallo, es que no hay avisos
  if (r.status === 400 || r.status === 404) return { features: [], fueraDeCobertura: true };
  if (!r.ok) throw new Error(`NWS respondió ${r.status}`);
  return r.json();
}
