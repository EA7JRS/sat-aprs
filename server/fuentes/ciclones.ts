// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Ciclones tropicales del Centro Nacional de Huracanes (NHC, NOAA).
//
// https://www.nhc.noaa.gov/CurrentStorms.json lista los ciclones activos del
// Atlántico y del Pacífico oriental y central, con su centro, intensidad
// (nudos), presión y movimiento, según el último aviso del NHC. Sin clave.
// Cada ciclón es un evento en su centro: la regla de radio decide si
// concierne a la estación (Canarias, Azores, la Península…).

import type { Evento, Gravedad } from '../core/evento';

export const URL_NHC = 'https://www.nhc.noaa.gov/CurrentStorms.json';

const CLASE: Record<string, { nombre: string; gravedad: Gravedad }> = {
  HU: { nombre: 'Huracan', gravedad: 'rojo' },
  TY: { nombre: 'Tifon', gravedad: 'rojo' },
  TS: { nombre: 'Tormenta tropical', gravedad: 'naranja' },
  STS: { nombre: 'Tormenta subtropical', gravedad: 'naranja' },
  TD: { nombre: 'Depresion tropical', gravedad: 'amarillo' },
  STD: { nombre: 'Depresion subtropical', gravedad: 'amarillo' },
  PTC: { nombre: 'Ciclon postropical', gravedad: 'amarillo' },
  PC: { nombre: 'Posible ciclon tropical', gravedad: 'amarillo' },
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
/** «22.9N» / «79.9W» → grados con signo. */
const coord = (v: unknown): number | null => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?\s*$/i.exec(String(v ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return /[SW]/i.test(m[2] ?? '') ? -n : n;
};

/** Categoría Saffir-Simpson por la intensidad (nudos). */
export function categoria(kn: number): number {
  return kn >= 137 ? 5 : kn >= 113 ? 4 : kn >= 96 ? 3 : kn >= 83 ? 2 : kn >= 64 ? 1 : 0;
}

export function eventosCiclones(j: any, ahora = Date.now()): Evento[] {
  const ev: Evento[] = [];
  for (const s of (Array.isArray(j?.activeStorms) ? j.activeStorms : [])) {
    const lat = num(s?.latitudeNumeric) ?? num(s?.latitude_numeric) ?? coord(s?.latitude);
    const lon = num(s?.longitudeNumeric) ?? num(s?.longitude_numeric) ?? coord(s?.longitude);
    const id = String(s?.id ?? '').trim().toLowerCase();
    if (!id || lat === null || lon === null) continue;
    const clase = String(s?.classification ?? '').toUpperCase();
    const c = CLASE[clase] ?? { nombre: 'Ciclon', gravedad: 'amarillo' as Gravedad };
    const kn = num(s?.intensity);
    const hpa = num(s?.pressure);
    const nombre = String(s?.name ?? '').trim();
    const cat = kn !== null && clase === 'HU' ? categoria(kn) : 0;
    const cuando = Date.parse(String(s?.lastUpdate ?? '')) || ahora;
    const rumbo = num(s?.movementDir);
    const mph = num(s?.movementSpeed);
    ev.push({
      id: `nhc-${id}`, tipo: 'huracan', gravedad: c.gravedad,
      // Qué (clase e intensidad) y quién (nombre y presión); el movimiento va en los datos
      detalle: `${c.nombre}${cat ? ` cat.${cat}` : ''}${kn !== null ? ` ${Math.round(kn)}kn` : ''}`,
      titulo: `${nombre.toUpperCase() || id.toUpperCase()}${hpa !== null ? ` ${Math.round(hpa)}hPa` : ''}`,
      lat, lon, nombre: `${clase}${nombre.toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 9) || undefined,
      // El aviso del NHC se renueva cada 6 horas (cada 3 con avisos de costa)
      inicio: cuando, fin: cuando + 9 * 3600_000, fuente: 'NHC', real: true,
      datos: { nudos: kn ?? 0, hpa: hpa ?? 0, categoria: cat, ...(rumbo !== null && mph !== null ? { rumbo, kmh: Math.round(mph * 1.609) } : {}) },
    });
  }
  return ev;
}

export async function descargarCiclones(): Promise<any> {
  const r = await fetch(URL_NHC, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'S.A.T.-APRS' } });
  if (!r.ok) throw new Error(`NHC respondió ${r.status}`);
  return r.json();
}
