// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Zonas de aviso.
//
// Muchos avisos oficiales (los de AEMET, por ejemplo) no afectan a un punto
// sino a una zona delimitada por un polígono. Aquí está la geometría mínima
// para saber si la estación está dentro, a qué distancia queda y dónde situar
// el objeto APRS que la representa.

import { gcDistanceKm } from '../formulas/geo';

export interface Punto { lat: number; lon: number }

/** Polígono CAP: «lat,lon lat,lon ...». Devuelve [] si no hay al menos 3 puntos válidos. */
export function leerPoligonoCap(texto: string): Punto[] {
  const puntos: Punto[] = [];
  for (const par of String(texto ?? '').trim().split(/\s+/)) {
    const [a, b] = par.split(',');
    const lat = Number(a);
    const lon = Number(b);
    if (a === undefined || b === undefined || a === '' || b === '') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    puntos.push({ lat, lon });
  }
  // El anillo CAP repite el primer punto al final: se quita
  if (puntos.length > 1) {
    const p = puntos[0];
    const u = puntos[puntos.length - 1];
    if (p.lat === u.lat && p.lon === u.lon) puntos.pop();
  }
  return puntos.length >= 3 ? puntos : [];
}

/** ¿Está el punto dentro del polígono? (trazado de rayos; válido para zonas pequeñas). */
export function dentroDeZona(p: Punto, zona: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = zona.length - 1; i < zona.length; j = i++) {
    const a = zona[i];
    const b = zona[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) &&
        p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/** Distancia en km del punto al segmento a-b (aproximación plana local, suficiente a escala comarcal). */
function distanciaASegmentoKm(p: Punto, a: Punto, b: Punto): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lon - p.lon) * k, ay = a.lat - p.lat;
  const bx = (b.lon - p.lon) * k, by = b.lat - p.lat;
  const dx = bx - ax, dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2));
  const cercano = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  return gcDistanceKm(p, cercano);
}

/** Distancia en km del punto a la zona: 0 si está dentro; si no, al borde más cercano. */
export function distanciaAZonaKm(p: Punto, zona: Punto[]): number {
  if (zona.length < 3) return Infinity;
  if (dentroDeZona(p, zona)) return 0;
  let minima = Infinity;
  for (let i = 0, j = zona.length - 1; i < zona.length; j = i++) {
    minima = Math.min(minima, distanciaASegmentoKm(p, zona[j], zona[i]));
  }
  return minima;
}

/** Centro de la zona (centroide del polígono) para situar su objeto APRS. */
export function centroZona(zona: Punto[]): Punto | null {
  if (zona.length < 3) return null;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, j = zona.length - 1; i < zona.length; j = i++) {
    const f = zona[j].lon * zona[i].lat - zona[i].lon * zona[j].lat;
    area += f;
    cx += (zona[j].lon + zona[i].lon) * f;
    cy += (zona[j].lat + zona[i].lat) * f;
  }
  if (Math.abs(area) < 1e-12) {
    // Polígono degenerado: media de los vértices
    const n = zona.length;
    return { lat: zona.reduce((s, q) => s + q.lat, 0) / n, lon: zona.reduce((s, q) => s + q.lon, 0) / n };
  }
  return { lat: cy / (3 * area), lon: cx / (3 * area) };
}
