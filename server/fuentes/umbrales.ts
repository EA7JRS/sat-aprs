// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Avisos por umbrales (antes los hacía el agente aprs_sat.py).
//
//  · Umbrales de la estación: con la observación real (estación propia o, si
//    no hay, la de Internet), viento, calor, helada y lluvia por encima de los
//    umbrales de la configuración. Un aviso por tipo y día.
//  · Pronóstico de WeatherAPI.com (con clave): sus avisos oficiales y los
//    días previstos que pasan los umbrales de viento, helada y lluvia.
// Todo entra en la cadena de avisos como `Evento` en la posición de la
// estación: las mismas reglas, la misma emisión, el mismo registro.

import type { Evento, Gravedad } from '../core/evento';
import type { Observacion } from '../estacion/meteo';

const KMH_A_KN = 0.539957;
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmt = (n: number, d = 0) => (Math.round(n * 10 ** d) / 10 ** d).toString();
const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface UmbralesLocales {
  vientoKn: number;
  tempMaxC: number;
  tempMinC: number;
  lluvia1hMm: number;
}

/**
 * Avisos de la observación actual frente a los umbrales. Sin observación
 * reciente (30 min) no hay aviso: nunca se compara con un valor supuesto.
 */
export function eventosUmbralesLocales(obs: Observacion | null, u: UmbralesLocales, estacion: { lat: number; lon: number }, ahora = Date.now()): Evento[] {
  if (!obs || ahora - obs.cuando > 30 * 60_000) return [];
  const hoy = dia(obs.cuando);
  const fuente = obs.propia ? 'Estación' : obs.fuente;
  const base = { tipo: 'meteo' as const, gravedad: 'amarillo' as Gravedad, lat: estacion.lat, lon: estacion.lon, inicio: obs.cuando, fin: obs.cuando + 6 * 3600_000, fuente, real: true };
  const ev: Evento[] = [];
  const viento = Math.max(obs.vientoKmh ?? -1, obs.rachaKmh ?? -1);
  if (viento >= 0 && u.vientoKn > 0 && viento * KMH_A_KN >= u.vientoKn) {
    const kn = viento * KMH_A_KN;
    ev.push({ ...base, id: `umbral-viento-${hoy}`, titulo: `Viento ${fmt(kn)}kn, umbral ${fmt(u.vientoKn)}kn`, nombre: 'UMBVIENTO', datos: { nudos: kn } });
  }
  if (finito(obs.tempC) && obs.tempC >= u.tempMaxC) {
    ev.push({ ...base, id: `umbral-calor-${hoy}`, titulo: `Temperatura alta ${fmt(obs.tempC, 1)}C, umbral ${fmt(u.tempMaxC, 1)}C`, nombre: 'UMBCALOR', datos: { tempC: obs.tempC } });
  }
  if (finito(obs.tempC) && obs.tempC <= u.tempMinC) {
    ev.push({ ...base, id: `umbral-frio-${hoy}`, titulo: `Temperatura baja ${fmt(obs.tempC, 1)}C, umbral ${fmt(u.tempMinC, 1)}C`, nombre: 'UMBFRIO', datos: { tempC: obs.tempC } });
  }
  if (finito(obs.lluvia1hMm) && u.lluvia1hMm > 0 && obs.lluvia1hMm >= u.lluvia1hMm) {
    ev.push({ ...base, id: `umbral-lluvia-${hoy}`, titulo: `Lluvia ${fmt(obs.lluvia1hMm, 1)}mm/h, umbral ${fmt(u.lluvia1hMm, 1)}mm/h`, nombre: 'UMBLLUVIA', datos: { mmHora: obs.lluvia1hMm } });
  }
  return ev;
}

// ── WeatherAPI.com ─────────────────────────────────────────────────────────
export interface UmbralesPronostico { vientoKn: number; tempMinC: number; lluviaMm: number }

const GRAVEDAD_CAP: Record<string, Gravedad> = { extreme: 'rojo', severe: 'naranja', moderate: 'amarillo', minor: 'info' };

/** Avisos del pronóstico de WeatherAPI (`forecast.json?alerts=yes`). */
export function eventosPronosticoWeatherApi(j: any, u: UmbralesPronostico, estacion: { lat: number; lon: number }, ahora = Date.now()): Evento[] {
  const ev: Evento[] = [];
  const base = { tipo: 'meteo' as const, lat: estacion.lat, lon: estacion.lon, fuente: 'WeatherAPI', real: true };
  for (const a of (Array.isArray(j?.alerts?.alert) ? j.alerts.alert : [])) {
    const evento = String(a?.event || a?.headline || '').trim();
    if (!evento) continue;
    const inicio = Date.parse(a?.effective ?? '') || ahora;
    const fin = Date.parse(a?.expires ?? '') || undefined;
    if (fin && fin < ahora) continue;
    const gravedad = GRAVEDAD_CAP[String(a?.severity ?? '').toLowerCase()] ?? 'info';
    const zona = String(a?.areas ?? '').split(/[;,]/)[0].trim();
    ev.push({
      ...base, id: `weatherapi-${evento}-${dia(inicio)}-${zona}`.replace(/\s+/g, '_').slice(0, 120),
      gravedad, detalle: evento.slice(0, 40), titulo: (zona || 'WeatherAPI').slice(0, 60), inicio, fin,
    });
  }
  for (const d of (Array.isArray(j?.forecast?.forecastday) ? j.forecast.forecastday : [])) {
    const fecha = String(d?.date ?? '');
    const t = Date.parse(`${fecha}T00:00:00Z`);
    if (!fecha || !Number.isFinite(t)) continue;
    const dd = d?.day ?? {};
    const corto = fecha.slice(8, 10) + '/' + fecha.slice(5, 7);
    const comun = { ...base, gravedad: 'amarillo' as Gravedad, inicio: t, fin: t + 86_400_000 };
    if (finito(dd.maxwind_kph) && u.vientoKn > 0 && dd.maxwind_kph * KMH_A_KN >= u.vientoKn) {
      ev.push({ ...comun, id: `pronostico-viento-${fecha}`, titulo: `Viento previsto ${fmt(dd.maxwind_kph * KMH_A_KN)}kn el ${corto}`, datos: { nudos: dd.maxwind_kph * KMH_A_KN } });
    }
    if (finito(dd.mintemp_c) && dd.mintemp_c <= u.tempMinC) {
      ev.push({ ...comun, id: `pronostico-helada-${fecha}`, titulo: `Helada prevista ${fmt(dd.mintemp_c, 1)}C el ${corto}`, datos: { tempC: dd.mintemp_c } });
    }
    if (finito(dd.totalprecip_mm) && u.lluviaMm > 0 && dd.totalprecip_mm >= u.lluviaMm) {
      ev.push({ ...comun, id: `pronostico-lluvia-${fecha}`, titulo: `Lluvia prevista ${fmt(dd.totalprecip_mm)}mm el ${corto}`, datos: { mm: dd.totalprecip_mm } });
    }
  }
  return ev;
}

export async function descargarWeatherApi(clave: string, lat: number, lon: number, dias: number): Promise<any> {
  const n = Math.min(3, Math.max(1, Math.round(dias) || 3));
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(clave)}&q=${lat.toFixed(4)},${lon.toFixed(4)}&days=${n}&aqi=no&alerts=yes`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'S.A.T.-APRS+' } });
  if (!r.ok) throw new Error(`WeatherAPI respondió ${r.status}`);
  return r.json();
}
