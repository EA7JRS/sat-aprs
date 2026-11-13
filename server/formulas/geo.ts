// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Geodesia: distancias, demoras y desvío de ruta. Ángulos en grados y
// distancias en millas náuticas. Mismas fórmulas y nombres que el núcleo del
// plotter APRS LoRa+ (lib/plotter_core/src/geo.cpp), para que todos los
// equipos del ecosistema den exactamente los mismos resultados.

export const EARTH_RADIUS_M = 6371008.8; // radio medio (IUGG)
export const METERS_PER_NM = 1852.0;
const RNM = EARTH_RADIUS_M / METERS_PER_NM;

export interface LatLon { lat: number; lon: number }

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

/** Ángulo en 0..360. */
export function norm360(d: number): number {
  d = d % 360;
  return d < 0 ? d + 360 : d;
}

/** Ángulo en -180..180. */
export function norm180(d: number): number {
  d = norm360(d);
  return d > 180 ? d - 360 : d;
}

/** Distancia por círculo máximo sobre la esfera (haversine), en millas náuticas. */
export function gcDistanceNm(a: LatLon, b: LatLon): number {
  const p1 = deg2rad(a.lat), p2 = deg2rad(b.lat);
  const dp = p2 - p1, dl = deg2rad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return RNM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** La misma distancia en kilómetros. */
export function gcDistanceKm(a: LatLon, b: LatLon): number {
  return (gcDistanceNm(a, b) * METERS_PER_NM) / 1000;
}

/** Demora inicial verdadera de a hacia b, 0..360. */
export function gcInitialBearing(a: LatLon, b: LatLon): number {
  const p1 = deg2rad(a.lat), p2 = deg2rad(b.lat), dl = deg2rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(rad2deg(Math.atan2(y, x)));
}

/** Punto de llegada desde `from` con una demora y una distancia (millas). */
export function gcDestination(from: LatLon, bearingDeg: number, distNm: number): LatLon {
  const d = distNm / RNM, t = deg2rad(bearingDeg), p1 = deg2rad(from.lat), l1 = deg2rad(from.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: rad2deg(p2), lon: norm180(rad2deg(l2)) };
}

/** Distancia loxodrómica (rumbo constante), en millas náuticas. */
export function rhumbDistanceNm(a: LatLon, b: LatLon): number {
  const p1 = deg2rad(a.lat), p2 = deg2rad(b.lat);
  const dp = p2 - p1, dl = deg2rad(norm180(b.lon - a.lon));
  const dpsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2)); // latitudes aumentadas
  const q = Math.abs(dpsi) > 1e-12 ? dp / dpsi : Math.cos(p1);
  return RNM * Math.sqrt(dp * dp + q * q * dl * dl);
}

/** Rumbo loxodrómico de a hacia b, 0..360. */
export function rhumbBearing(a: LatLon, b: LatLon): number {
  const p1 = deg2rad(a.lat), p2 = deg2rad(b.lat);
  const dl = deg2rad(norm180(b.lon - a.lon));
  const dpsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
  return norm360(rad2deg(Math.atan2(dl, dpsi)));
}

/**
 * Distancia y demora inicial sobre el elipsoide WGS84 (Vincenty inverso).
 * null si no converge (puntos casi antípodas).
 */
export function vincentyInverse(p1: LatLon, p2: LatLon): { distM: number; initialBearingDeg: number } | null {
  const a = 6378137.0, f = 1 / 298.257223563, b = a * (1 - f);
  const L = deg2rad(p2.lon - p1.lon);
  const U1 = Math.atan((1 - f) * Math.tan(deg2rad(p1.lat))), U2 = Math.atan((1 - f) * Math.tan(deg2rad(p2.lat)));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, lamP: number, sS: number, cS: number, sig: number, sA: number, c2A: number, c2SM: number;
  let it = 0;
  do {
    const sL = Math.sin(lam), cL = Math.cos(lam);
    sS = Math.sqrt((cU2 * sL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cL) ** 2);
    if (sS === 0) return { distM: 0, initialBearingDeg: 0 }; // puntos coincidentes
    cS = sU1 * sU2 + cU1 * cU2 * cL;
    sig = Math.atan2(sS, cS);
    sA = (cU1 * cU2 * sL) / sS;
    c2A = 1 - sA * sA;
    c2SM = c2A !== 0 ? cS - (2 * sU1 * sU2) / c2A : 0; // línea ecuatorial
    const C = (f / 16) * c2A * (4 + f * (4 - 3 * c2A));
    lamP = lam;
    lam = L + (1 - C) * f * sA * (sig + C * sS * (c2SM + C * cS * (-1 + 2 * c2SM * c2SM)));
  } while (Math.abs(lam - lamP) > 1e-12 && ++it < 200);
  if (it >= 200) return null;
  const u2 = (c2A * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sS * (c2SM + (B / 4) * (cS * (-1 + 2 * c2SM * c2SM) - (B / 6) * c2SM * (-3 + 4 * sS * sS) * (-3 + 4 * c2SM * c2SM)));
  return {
    distM: b * A * (sig - dS),
    initialBearingDeg: norm360(rad2deg(Math.atan2(cU2 * Math.sin(lam), cU1 * sU2 - sU1 * cU2 * Math.cos(lam)))),
  };
}

/**
 * Desvío de ruta de `p` respecto al tramo a→b. xteNm > 0 a estribor del
 * tramo; alongNm = avance sobre el tramo (negativo por detrás del origen).
 */
export function crossTrack(a: LatLon, b: LatLon, p: LatLon): { xteNm: number; alongNm: number } {
  const d13 = gcDistanceNm(a, p) / RNM;
  const t13 = deg2rad(gcInitialBearing(a, p)), t12 = deg2rad(gcInitialBearing(a, b));
  const dxt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12));
  let c = Math.cos(d13) / Math.cos(dxt);
  c = c > 1 ? 1 : c < -1 ? -1 : c;
  let dat = Math.acos(c);
  if (Math.cos(t13 - t12) < 0) dat = -dat;
  return { xteNm: dxt * RNM, alongNm: dat * RNM };
}
