// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Meteorología sin clave (Open-Meteo).
//
// Fuente real de último recurso para la meteorología de la consola: cuando no
// hay clave de OpenWeatherMap ni de AEMET, o estas no responden, se consulta
// Open-Meteo, que no pide clave. Da el estado actual y la previsión diaria en
// la posición de la estación. Son datos de modelo meteorológico, no medidas de
// una estación: se indica así en la consola y en el parte APRS.
// Solo recoge y normaliza; no inventa nada: lo que no viene queda sin dato.

import { Observacion } from '../estacion/meteo';
import { RegistroFuente } from './sismos';

export interface DiaPrevision {
  /** «Lun 16/11» */
  date: string;
  tempMin: number;
  tempMax: number;
  humidityPct: number;
  windSpeedKts: number;
  windDirDeg: number;
  description: string;
  icon: string;
  /** Probabilidad de precipitación, de 0 a 1. */
  pop: number;
}

export interface MeteoAbierta {
  observacion: Observacion;
  prevision: DiaPrevision[];
}

export function urlMeteoAbierta(lat: number, lon: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,precipitation,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'relative_humidity_2m,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant',
    wind_speed_unit: 'kmh',
    timeformat: 'unixtime',
    timezone: 'auto',
    past_days: '1',
    forecast_days: '6',
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Código de tiempo de la OMM (el que da Open-Meteo) a texto e icono. */
export function tiempoOmm(codigo: number | undefined): { description: string; icon: string } {
  if (codigo === undefined) return { description: 'Sin dato', icon: '02d' };
  if (codigo === 0) return { description: 'Despejado', icon: '01d' };
  if (codigo <= 2) return { description: 'Poco nuboso', icon: '02d' };
  if (codigo === 3) return { description: 'Nuboso', icon: '04d' };
  if (codigo === 45 || codigo === 48) return { description: 'Niebla', icon: '50d' };
  if (codigo >= 51 && codigo <= 57) return { description: 'Llovizna', icon: '09d' };
  if (codigo >= 61 && codigo <= 67) return { description: 'Lluvia', icon: '10d' };
  if (codigo >= 71 && codigo <= 77) return { description: 'Nieve', icon: '13d' };
  if (codigo >= 80 && codigo <= 82) return { description: 'Chubascos de lluvia', icon: '09d' };
  if (codigo === 85 || codigo === 86) return { description: 'Chubascos de nieve', icon: '13d' };
  if (codigo >= 95) return { description: 'Tormenta', icon: '11d' };
  return { description: 'Variable', icon: '03d' };
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Normaliza la respuesta. Devuelve null si no trae el estado actual con
 * temperatura: sin eso no hay meteorología que mostrar.
 */
export function leerMeteoAbierta(json: any): MeteoAbierta | null {
  const c = json?.current;
  const cuando = num(c?.time);
  const tempC = num(c?.temperature_2m);
  if (!c || cuando === undefined || tempC === undefined) return null;
  const desfase = num(json?.utc_offset_seconds) ?? 0;

  // Humedad media por día y lluvia de las últimas 24 h, a partir de las horas
  const horas: number[] = Array.isArray(json?.hourly?.time) ? json.hourly.time : [];
  const humHoras: unknown[] = Array.isArray(json?.hourly?.relative_humidity_2m) ? json.hourly.relative_humidity_2m : [];
  const lluviaHoras: unknown[] = Array.isArray(json?.hourly?.precipitation) ? json.hourly.precipitation : [];
  const diaLocal = (t: number) => new Date((t + desfase) * 1000).toISOString().slice(0, 10);
  const humPorDia = new Map<string, { suma: number; n: number }>();
  let lluvia24: number | undefined;
  horas.forEach((t, i) => {
    const h = num(humHoras[i]);
    if (h !== undefined) {
      const d = diaLocal(t);
      const a = humPorDia.get(d) ?? { suma: 0, n: 0 };
      a.suma += h; a.n += 1;
      humPorDia.set(d, a);
    }
    const ll = num(lluviaHoras[i]);
    if (ll !== undefined && t <= cuando && t > cuando - 24 * 3600) lluvia24 = (lluvia24 ?? 0) + ll;
  });

  const observacion: Observacion = {
    cuando: cuando * 1000,
    fuente: 'Open-Meteo',
    propia: false,
    tempC,
    humedadPct: num(c.relative_humidity_2m),
    presionHpa: num(c.pressure_msl),
    vientoKmh: num(c.wind_speed_10m),
    rachaKmh: num(c.wind_gusts_10m),
    dirGrados: num(c.wind_direction_10m),
    lluvia1hMm: num(c.precipitation),
    lluvia24hMm: lluvia24 === undefined ? undefined : Math.round(lluvia24 * 10) / 10,
  };

  const d = json?.daily;
  const prevision: DiaPrevision[] = [];
  const dias: number[] = Array.isArray(d?.time) ? d.time : [];
  const hoy = diaLocal(cuando);
  dias.forEach((t, i) => {
    const clave = diaLocal(t);
    if (clave <= hoy || prevision.length >= 5) return; // solo los días siguientes
    const tMax = num(d.temperature_2m_max?.[i]);
    const tMin = num(d.temperature_2m_min?.[i]);
    if (tMax === undefined || tMin === undefined) return;
    const fecha = new Date(`${clave}T12:00:00Z`);
    const hum = humPorDia.get(clave);
    const viento = num(d.wind_speed_10m_max?.[i]);
    prevision.push({
      date: `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()}/${fecha.getUTCMonth() + 1}`,
      tempMin: tMin,
      tempMax: tMax,
      humidityPct: hum ? Math.round(hum.suma / hum.n) : 0,
      windSpeedKts: viento === undefined ? 0 : Math.round((viento / 1.852) * 10) / 10,
      windDirDeg: num(d.wind_direction_10m_dominant?.[i]) ?? 0,
      ...tiempoOmm(num(d.weather_code?.[i])),
      pop: (num(d.precipitation_probability_max?.[i]) ?? 0) / 100,
    });
  });

  return { observacion, prevision };
}

export async function descargarMeteoAbierta(
  pos: { lat: number; lon: number },
  registrar: RegistroFuente = () => {},
): Promise<MeteoAbierta | null> {
  try {
    const r = await fetch(urlMeteoAbierta(pos.lat, pos.lon), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const leido = leerMeteoAbierta(await r.json());
    if (!leido) throw new Error('respuesta sin estado actual');
    return leido;
  } catch (e: any) {
    registrar('Open-Meteo', `Meteorología sin clave no disponible: ${e?.message ?? e}`, false);
    return null;
  }
}
