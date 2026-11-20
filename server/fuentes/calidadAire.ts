// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Calidad del aire en la estación (CAMS, vía Open-Meteo).
//
// El índice europeo de calidad del aire (EAQI) que calcula el servicio
// Copernicus CAMS para el punto de la estación. Es un dato de modelo, no de un
// medidor: se identifica como «CAMS». Solo genera aviso cuando el aire es
// malo; los valores normales se ven en la consola pero no se anuncian.

import { Evento, Gravedad } from '../core/evento';
import { RegistroFuente } from './sismos';

export interface AireActual {
  /** Índice europeo de calidad del aire. */
  indice: number;
  pm25?: number;
  pm10?: number;
  no2?: number;
  o3?: number;
  cuando: number;
}

export function urlCalidadAire(lat: number, lon: number): string {
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=UTC';
}

export function leerCalidadAire(json: any): AireActual | null {
  const c = json?.current;
  // null o ausente = sin dato (Number(null) sería 0, que es un índice «bueno»)
  if (!c || c.european_aqi === null || c.european_aqi === undefined || c.european_aqi === '') return null;
  const indice = Number(c.european_aqi);
  if (!Number.isFinite(indice) || indice < 0) return null;
  const n = (v: any) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : undefined);
  const cuando = Date.parse(`${c.time}${/Z|[+-]\d\d:?\d\d$/.test(String(c.time)) ? '' : 'Z'}`);
  return { indice, pm25: n(c.pm2_5), pm10: n(c.pm10), no2: n(c.nitrogen_dioxide), o3: n(c.ozone), cuando: Number.isFinite(cuando) ? cuando : Date.now() };
}

/** Clases del EAQI: hasta 20 buena, 40 razonable, 60 moderada, 80 mala, 100 muy mala; más, extremadamente mala. */
export function claseAire(indice: number): { nombre: string; gravedad: Gravedad | null } {
  if (indice > 100) return { nombre: 'extremadamente mala', gravedad: 'rojo' };
  if (indice > 80) return { nombre: 'muy mala', gravedad: 'naranja' };
  if (indice > 60) return { nombre: 'mala', gravedad: 'amarillo' };
  if (indice > 40) return { nombre: 'moderada', gravedad: null };
  if (indice > 20) return { nombre: 'razonable', gravedad: null };
  return { nombre: 'buena', gravedad: null };
}

/** Aviso de mala calidad del aire en la estación; null si el aire no es malo. */
export function aireAEvento(a: AireActual, ahora = Date.now(), vigenciaMs = 90 * 60_000): Evento | null {
  const clase = claseAire(a.indice);
  if (!clase.gravedad) return null;
  const dia = new Date(ahora).toISOString().slice(0, 10).replace(/-/g, '');
  const pm = a.pm25 !== undefined ? ` PM2.5 ${Math.round(a.pm25)}ug` : '';
  return {
    id: `CAMS-${clase.gravedad}-${dia}`,
    tipo: 'calidad_aire',
    gravedad: clase.gravedad,
    titulo: `Calidad del aire ${clase.nombre}`,
    detalle: `Indice ${Math.round(a.indice)}${pm}`,
    // Sin posición: es el aire de la propia estación, así que basta el boletín
    // (un objeto encima del símbolo de la estación no aportaría nada)
    inicio: Math.min(a.cuando, ahora),
    fin: ahora + vigenciaMs,
    fuente: 'CAMS',
    real: true,
    datos: { indice: a.indice },
  };
}

export async function descargarCalidadAire(estacion: { lat: number; lon: number }, registrar: RegistroFuente = () => {}): Promise<AireActual | null> {
  try {
    const res = await fetch(urlCalidadAire(estacion.lat, estacion.lon), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const aire = leerCalidadAire(await res.json());
    if (!aire) throw new Error('formato no reconocido');
    registrar('CAMS', `Calidad del aire (CAMS): índice europeo ${Math.round(aire.indice)}, ${claseAire(aire.indice).nombre}.`, true);
    return aire;
  } catch (e: any) {
    registrar('CAMS', `No se pudo leer la calidad del aire: ${e?.message || e}.`, false);
    return null;
  }
}
