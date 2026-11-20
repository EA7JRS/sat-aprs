// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Medidores de calidad del aire más cercanos, en tiempo real.
//
// La red Sensor.Community publica, sin clave, las lecturas de los últimos
// minutos de miles de medidores de partículas. Son medidores ciudadanos, no
// estaciones oficiales: sirven para ver qué se está midiendo ahora mismo cerca
// de la estación. Se consulta el entorno de la posición actual (fija o móvil),
// así que la lista es siempre la de los más próximos. Solo recoge y normaliza.

import { gcDistanceKm } from '../formulas/geo';
import { RegistroFuente } from './sismos';

export interface MedidorAire {
  id: string;
  lat: number;
  lon: number;
  distanciaKm: number;
  /** Partículas finas PM2,5 en µg/m³. */
  pm25?: number;
  /** Partículas PM10 en µg/m³. */
  pm10?: number;
  /** Modelo del sensor (SDS011, SPS30...). */
  sensor: string;
  /** Momento de la lectura (ms epoch). */
  cuando: number;
}

export function urlMedidoresAire(lat: number, lon: number, radioKm: number): string {
  return `https://data.sensor.community/airrohr/v1/filter/area=${lat.toFixed(4)},${lon.toFixed(4)},${Math.round(radioKm)}`;
}

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Normaliza la respuesta: una entrada por ubicación, con sus partículas más
 * recientes. Se descartan los medidores de interior y las lecturas imposibles.
 */
export function leerMedidoresAire(json: unknown, pos: { lat: number; lon: number }): MedidorAire[] {
  if (!Array.isArray(json)) return [];
  const porLugar = new Map<string, MedidorAire>();
  for (const e of json as any[]) {
    const lugar = e?.location;
    const lat = num(lugar?.latitude);
    const lon = num(lugar?.longitude);
    if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (Number(lugar?.indoor) === 1) continue;
    const texto = String(e?.timestamp ?? '');
    const cuando = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(texto) ? texto : `${texto.replace(' ', 'T')}Z`);
    if (!Number.isFinite(cuando)) continue;
    let pm10: number | undefined;
    let pm25: number | undefined;
    for (const v of Array.isArray(e?.sensordatavalues) ? e.sensordatavalues : []) {
      const valor = num(v?.value);
      if (valor === undefined || valor < 0 || valor > 999) continue; // 999,9 es el fondo de escala: sensor averiado
      if (v?.value_type === 'P1') pm10 = valor;
      else if (v?.value_type === 'P2') pm25 = valor;
    }
    if (pm10 === undefined && pm25 === undefined) continue; // sensor de temperatura u otro
    const id = String(lugar?.id ?? `${lat},${lon}`);
    const previo = porLugar.get(id);
    if (previo && previo.cuando >= cuando) continue;
    porLugar.set(id, {
      id, lat, lon,
      distanciaKm: gcDistanceKm(pos, { lat, lon }),
      pm25, pm10,
      sensor: String(e?.sensor?.sensor_type?.name ?? '').slice(0, 20),
      cuando,
    });
  }
  return [...porLugar.values()].sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/** Calidad según las PM2,5 (umbrales del índice europeo, medias horarias). */
export function clasePm25(pm25: number | undefined): string {
  if (pm25 === undefined) return '';
  if (pm25 <= 10) return 'buena';
  if (pm25 <= 20) return 'razonable';
  if (pm25 <= 25) return 'moderada';
  if (pm25 <= 50) return 'mala';
  if (pm25 <= 75) return 'muy mala';
  return 'extremadamente mala';
}

/**
 * Medidores más cercanos a la posición. Empieza por un radio corto y lo amplía
 * hasta reunir al menos `minimo`. Devuelve null si el servicio no responde.
 */
export async function descargarMedidoresAire(
  pos: { lat: number; lon: number },
  registrar: RegistroFuente = () => {},
  radios: number[] = [10, 30, 80],
  minimo = 4,
): Promise<{ medidores: MedidorAire[]; radioKm: number } | null> {
  let ultimo: { medidores: MedidorAire[]; radioKm: number } | null = null;
  for (const radioKm of radios) {
    try {
      const res = await fetch(urlMedidoresAire(pos.lat, pos.lon, radioKm), { headers: { 'User-Agent': 'S.A.T.-APRS+' }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ultimo = { medidores: leerMedidoresAire(await res.json(), pos), radioKm };
      if (ultimo.medidores.length >= minimo) break;
    } catch (e: any) {
      if (!ultimo) {
        registrar('AIRE', `No se pudieron leer los medidores de calidad del aire cercanos: ${e?.message || e}.`, false);
        return null;
      }
      break;
    }
  }
  if (ultimo) registrar('AIRE', `Medidores de calidad del aire: ${ultimo.medidores.length} a menos de ${ultimo.radioKm} km (Sensor.Community).`, true);
  return ultimo;
}
