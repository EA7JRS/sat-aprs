// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sol y luna. Portado del núcleo del plotter APRS LoRa+ (astro.cpp):
//  - orto, ocaso y crepúsculos con la serie de Fourier de NOAA (~1 minuto);
//  - posición del sol con Meeus, cap. 25 (~0,01°);
//  - luna con Meeus, cap. 47 (términos principales, ~0,05°), topocéntrica.
import { deg2rad, norm360, rad2deg } from './geo';

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function dayOfYear(y: number, m: number, d: number): number {
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cum[m - 1] + d + (isLeap(y) && m > 2 ? 1 : 0);
}

/** Día juliano (UTC). */
export function julianDay(y: number, m: number, d: number, utcHours: number): number {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.trunc(y / 100), b = 2 - a + Math.trunc(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5 + utcHours / 24.0;
}

/** Ecuación del tiempo (minutos) y declinación solar (radianes). */
function solar(y: number, m: number, d: number, utcHours: number): { eqMin: number; dec: number } {
  const g = ((2 * Math.PI) / (isLeap(y) ? 366.0 : 365.0)) * (dayOfYear(y, m, d) - 1 + (utcHours - 12) / 24.0);
  const eqMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { eqMin, dec };
}

/** Paso del sol por el meridiano, en minutos UTC del día. */
export function solarNoonUtcMin(y: number, m: number, d: number, lon: number): number {
  return 720 - 4 * lon - solar(y, m, d, 12).eqMin;
}

/**
 * Paso del sol por la altura altDeg (-0.833 orto/ocaso, -6 civil, -12 náutico,
 * -18 astronómico), en minutos UTC del día (pueden salir < 0 o > 1440 según la
 * longitud). null si no la cruza ese día (día o noche polar).
 */
export function sunTimes(y: number, m: number, d: number, lat: number, lon: number, altDeg: number): { riseUtcMin: number; setUtcMin: number } | null {
  const { eqMin, dec } = solar(y, m, d, 12);
  const la = deg2rad(lat);
  const c = (Math.sin(deg2rad(altDeg)) - Math.sin(la) * Math.sin(dec)) / (Math.cos(la) * Math.cos(dec));
  if (c < -1 || c > 1) return null;
  const ha = rad2deg(Math.acos(c)), noon = 720 - 4 * lon - eqMin;
  return { riseUtcMin: noon - 4 * ha, setUtcMin: noon + 4 * ha };
}

/** Altura y azimut del sol (grados; azimut desde el norte verdadero), sin refracción. */
export function sunPosition(y: number, m: number, d: number, utcHours: number, lat: number, lon: number): { altDeg: number; azDeg: number } {
  const jd = julianDay(y, m, d, utcHours), T = (jd + 69.0 / 86400.0 - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = deg2rad(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const om = deg2rad(125.04 - 1934.136 * T);
  const lam = deg2rad(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  const eps = deg2rad(23.439291 - 0.0130042 * T + 0.00256 * Math.cos(om));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const Tu = (jd - 2451545.0) / 36525.0;
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * Tu * Tu) % 360.0;
  const ha = deg2rad(gmst + lon) - ra, la = deg2rad(lat);
  return {
    altDeg: rad2deg(Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha))),
    azDeg: norm360(rad2deg(Math.atan2(-Math.sin(ha) * Math.cos(dec), Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(ha)))),
  };
}

const SYNODIC_MONTH = 29.530588853;

/** Edad de la luna en días (0 = nueva), con el mes sinódico medio. */
export function moonAgeDays(y: number, m: number, d: number, utcHours: number): number {
  const newMoon = 2451550.09766; // luna nueva del 6 de enero de 2000
  const a = (julianDay(y, m, d, utcHours) - newMoon) % SYNODIC_MONTH;
  return a < 0 ? a + SYNODIC_MONTH : a;
}

/** Fracción iluminada 0..1. */
export const moonIllumination = (ageDays: number): number => (1 - Math.cos((2 * Math.PI * ageDays) / SYNODIC_MONTH)) / 2;

/** Fase en 8 partes (0 nueva, 2 cuarto creciente, 4 llena, 6 cuarto menguante). */
export function moonPhase8(ageDays: number): number {
  const p = Math.trunc(Math.floor((ageDays / SYNODIC_MONTH) * 8 + 0.5)) % 8;
  return p < 0 ? p + 8 : p;
}

const MOON_ES = ['Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'];
const MOON_EN = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
export const moonPhaseNameEs = (phase8: number): string => MOON_ES[((phase8 % 8) + 8) % 8];
export const moonPhaseNameEn = (phase8: number): string => MOON_EN[((phase8 % 8) + 8) % 8];

// Meeus, tabla 47.A: [d, m, mp, f, longitud (1e-6 grados), distancia (m)], los 32 primeros términos
const LR: number[][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];
// Tabla 47.B: [d, m, mp, f, latitud (1e-6 grados)], los 20 primeros
const LB: number[][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
];

const nrm = (a: number): number => { a = a % 360.0; return a < 0 ? a + 360 : a; };

/**
 * Posición de la luna: altura y azimut topocéntricos (con el paralaje, que en
 * la luna llega a 1°), sin refracción; distancia en km. Para apuntar una
 * antena (rebote lunar) hay que sumar refractionDeg().
 */
export function moonPosition(y: number, mo: number, d: number, utcHours: number, lat: number, lon: number): { altDeg: number; azDeg: number; distKm: number } {
  const jd = julianDay(y, mo, d, utcHours) + 69.0 / 86400.0; // TT ~ UTC + 69 s
  const T = (jd - 2451545.0) / 36525.0;
  const Lp = nrm(218.3164477 + 481267.88123421 * T), D = nrm(297.8501921 + 445267.1114034 * T),
    M = nrm(357.5291092 + 35999.0502909 * T), Mp = nrm(134.9633964 + 477198.8675055 * T),
    F = nrm(93.2720950 + 483202.0175233 * T), E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = nrm(119.75 + 131.849 * T), A2 = nrm(53.09 + 479264.290 * T), A3 = nrm(313.45 + 481266.484 * T);
  const ecc = (m: number) => (m === 0 ? 1 : m === 1 || m === -1 ? E : E * E);
  let sl = 0, sr = 0, sb = 0;
  for (const t of LR) {
    const arg = deg2rad(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
    sl += ecc(t[1]) * t[4] * Math.sin(arg);
    sr += ecc(t[1]) * t[5] * Math.cos(arg);
  }
  for (const t of LB) {
    const arg = deg2rad(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F);
    sb += ecc(t[1]) * t[4] * Math.sin(arg);
  }
  sl += 3958 * Math.sin(deg2rad(A1)) + 1962 * Math.sin(deg2rad(Lp - F)) + 318 * Math.sin(deg2rad(A2));
  sb += -2235 * Math.sin(deg2rad(Lp)) + 382 * Math.sin(deg2rad(A3)) + 175 * Math.sin(deg2rad(A1 - F)) +
    175 * Math.sin(deg2rad(A1 + F)) + 127 * Math.sin(deg2rad(Lp - Mp)) - 115 * Math.sin(deg2rad(Lp + Mp));
  // Nutación en longitud (términos principales) y oblicuidad
  const Om = nrm(125.04452 - 1934.136261 * T), Ls = nrm(280.4665 + 36000.7698 * T);
  const dpsi = -17.20 * Math.sin(deg2rad(Om)) - 1.32 * Math.sin(deg2rad(2 * Ls)) - 0.23 * Math.sin(deg2rad(2 * Lp)) + 0.21 * Math.sin(deg2rad(2 * Om));
  const deps = 9.20 * Math.cos(deg2rad(Om)) + 0.57 * Math.cos(deg2rad(2 * Ls)) + 0.10 * Math.cos(deg2rad(2 * Lp)) - 0.09 * Math.cos(deg2rad(2 * Om));
  const lam = deg2rad(Lp + sl / 1e6 + dpsi / 3600.0), bet = deg2rad(sb / 1e6);
  const distKm = 385000.56 + sr / 1000.0;
  const eps = deg2rad(23.4392911 - 0.0130042 * T + deps / 3600.0);
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  // Tiempo sidéreo aparente de Greenwich (con UT ~ UTC)
  const jdu = jd - 69.0 / 86400.0, Tu = (jdu - 2451545.0) / 36525.0;
  const gmst = nrm(280.46061837 + 360.98564736629 * (jdu - 2451545.0) + 0.000387933 * Tu * Tu + (dpsi / 3600.0) * Math.cos(eps));
  const H = deg2rad(gmst + lon) - ra, la = deg2rad(lat);
  // Paralaje: coordenadas topocéntricas (Meeus, cap. 40)
  const sinPi = 6378.14 / distKm;
  const u = Math.atan(0.99664719 * Math.tan(la));
  const rs = 0.99664719 * Math.sin(u), rc = Math.cos(u);
  const dra = Math.atan2(-rc * sinPi * Math.sin(H), Math.cos(dec) - rc * sinPi * Math.cos(H));
  const dec2 = Math.atan2((Math.sin(dec) - rs * sinPi) * Math.cos(dra), Math.cos(dec) - rc * sinPi * Math.cos(H));
  const H2 = H - dra;
  return {
    altDeg: rad2deg(Math.asin(Math.sin(la) * Math.sin(dec2) + Math.cos(la) * Math.cos(dec2) * Math.cos(H2))),
    azDeg: norm360(rad2deg(Math.atan2(-Math.sin(H2) * Math.cos(dec2), Math.sin(dec2) * Math.cos(la) - Math.cos(dec2) * Math.sin(la) * Math.cos(H2)))),
    distKm,
  };
}

/** Salida y puesta de la luna ese día UTC (minutos UTC, 0..1440); null si no ocurre ese día. */
export function moonTimes(y: number, m: number, d: number, lat: number, lon: number): { riseUtcMin: number | null; setUtcMin: number | null } {
  const h0 = -0.833; // centro con la refracción y el semidiámetro (topocéntrica)
  let rise: number | null = null, set: number | null = null;
  let prev = moonPosition(y, m, d, 0, lat, lon).altDeg - h0;
  for (let i = 1; i <= 144; i++) { // cada 10 min
    const a = moonPosition(y, m, d, i / 6.0, lat, lon).altDeg - h0;
    if ((prev < 0) !== (a < 0)) {
      const t = (i - 1 + prev / (prev - a)) * 10.0;
      if (prev < 0 && rise === null) rise = t;
      else if (prev >= 0 && set === null) set = t;
    }
    prev = a;
  }
  return { riseUtcMin: rise, setUtcMin: set };
}

/** Refracción atmosférica media (grados, Saemundsson): altura aparente = verdadera + esto. */
export function refractionDeg(trueAltDeg: number): number {
  const h = trueAltDeg < -1.9 ? -1.9 : trueAltDeg;
  return 1.02 / Math.tan(deg2rad(h + 10.3 / (h + 5.11))) / 60.0;
}

/** Fecha y hora UTC desde el tiempo Unix (segundos). */
export function unixToUtc(unixS: number): { y: number; m: number; d: number; utcHours: number } {
  const date = new Date(Math.floor(unixS) * 1000);
  return {
    y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(),
    utcHours: date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
  };
}
