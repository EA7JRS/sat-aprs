// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Modelo Magnético Mundial (WMM): declinación, inclinación e intensidad del
// campo en cualquier punto. Lleva dentro el WMM2025 (válido hasta 2030.0);
// load() acepta un WMM.COF nuevo (el texto del fichero de NOAA) para cuando
// caduque. Síntesis armónica esférica de grado 12, como describe el informe
// del WMM. Portado del núcleo del plotter APRS LoRa+ (wmm.cpp).
import { dayOfYear } from './astro';
import { WMM2025, WMM_EPOCH, WMM_NAME } from './wmmCof';

const N = 12;
const REF_KM = 6371.2; // radio de referencia del modelo
const A_KM = 6378.137, F = 1 / 298.257223563; // WGS84
const D2R = Math.PI / 180.0;

export interface MagField {
  /** Declinación (+ = al este del norte verdadero): rumbo verdadero = magnético + dec. */
  decDeg: number;
  /** Inclinación (+ hacia abajo). */
  incDeg: number;
  /** Intensidad horizontal y total (nT). */
  hNt: number; fNt: number;
  /** Componentes norte, este y abajo (nT). */
  xNt: number; yNt: number; zNt: number;
}

type Matrix = number[][];
const matrix = (): Matrix => Array.from({ length: 13 }, () => new Array<number>(13).fill(0));

export class Wmm {
  private g = matrix(); private h = matrix(); private gd = matrix(); private hd = matrix();
  private epochYear = WMM_EPOCH;
  private modelName = WMM_NAME;

  /** Con el WMM2025. */
  constructor() {
    let i = 0;
    for (let n = 1; n <= N; n++) {
      for (let m = 0; m <= n; m++, i++) {
        [this.g[n][m], this.h[n][m], this.gd[n][m], this.hd[n][m]] = WMM2025[i];
      }
    }
  }

  get epoch(): number { return this.epochYear; }
  get validUntil(): number { return this.epochYear + 5; }
  get name(): string { return this.modelName; }
  expired(year: number): boolean { return year >= this.validUntil; }

  /** Carga un WMM.COF. false: texto no válido (se queda el modelo anterior). */
  load(cofText: string): boolean {
    if (!cofText) return false;
    const g = matrix(), h = matrix(), gd = matrix(), hd = matrix();
    let epoch = 0, name = '', count = 0, first = true;
    for (const line of cofText.split('\n')) {
      if (line.startsWith('9999')) break;
      const parts = line.trim().split(/\s+/);
      if (first) { // "    2025.0            WMM-2025     11/13/2024"
        epoch = parseFloat(parts[0]);
        if (parts.length < 2 || !(epoch >= 1900 && epoch <= 2200)) return false;
        name = parts[1].slice(0, 15);
        first = false;
        continue;
      }
      if (parts.length < 6) continue;
      const n = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
      const v = parts.slice(2, 6).map(Number);
      if (!Number.isInteger(n) || !Number.isInteger(m) || v.some((x) => !Number.isFinite(x))) continue;
      if (n < 1 || n > N || m < 0 || m > n) return false;
      [g[n][m], h[n][m], gd[n][m], hd[n][m]] = v;
      count++;
    }
    if (first || count !== 90) return false;
    this.g = g; this.h = h; this.gd = gd; this.hd = hd;
    this.epochYear = epoch;
    this.modelName = name;
    return true;
  }

  /** Campo en lat / lon geodésicas (WGS84), altitud sobre el elipsoide en km y año decimal. null fuera de -90..90. */
  field(latDeg: number, lonDeg: number, altKm: number, year: number): MagField | null {
    if (!(latDeg >= -90 && latDeg <= 90) || !Number.isFinite(lonDeg) || !Number.isFinite(year)) return null;
    // Geodésica -> geocéntrica esférica
    const e2 = F * (2 - F);
    const sl = Math.sin(latDeg * D2R), cl = Math.cos(latDeg * D2R);
    const rc = A_KM / Math.sqrt(1 - e2 * sl * sl);
    const pp = (rc + altKm) * cl, zz = (rc * (1 - e2) + altKm) * sl;
    const r = Math.sqrt(pp * pp + zz * zz);
    const phic = Math.asin(zz / r);
    const x = Math.sin(phic), c = Math.cos(phic); // x = cos(colatitud), c = sen(colatitud)
    const dt = year - this.epochYear;

    // Legendre de Schmidt (seminormalizadas) y su derivada
    const P = matrix(), dP = matrix();
    P[0][0] = 1; P[1][0] = x; P[1][1] = c;
    for (let n = 2; n <= N; n++) P[n][n] = c * Math.sqrt((2.0 * n - 1) / (2.0 * n)) * P[n - 1][n - 1];
    for (let m = 0; m <= N; m++) {
      for (let n = m + 1; n <= N; n++) {
        if (n === 1) continue; // P[1][0] ya está
        const a = Math.sqrt(n * n - m * m);
        const b = n - 1 >= m ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        P[n][m] = ((2.0 * n - 1) * x * P[n - 1][m] - (n - 2 >= m ? b * P[n - 2][m] : 0)) / a;
      }
    }
    const s = c > 1e-12 ? c : 1e-12;
    for (let n = 1; n <= N; n++) {
      for (let m = 0; m <= n; m++) {
        const prev = n - 1 >= m ? Math.sqrt(n * n - m * m) * P[n - 1][m] : 0;
        dP[n][m] = (n * x * P[n][m] - prev) / s;
      }
    }

    const cm: number[] = [], sm: number[] = [];
    for (let m = 0; m <= N; m++) {
      cm[m] = Math.cos(m * lonDeg * D2R);
      sm[m] = Math.sin(m * lonDeg * D2R);
    }
    let X = 0, Y = 0, Z = 0;
    const ar = REF_KM / r;
    let arn = ar * ar;
    for (let n = 1; n <= N; n++) {
      arn *= ar; // (a/r)^(n+2)
      let xs = 0, ys = 0, zs = 0;
      for (let m = 0; m <= n; m++) {
        const g = this.g[n][m] + dt * this.gd[n][m], h = this.h[n][m] + dt * this.hd[n][m];
        const t1 = g * cm[m] + h * sm[m];
        xs += t1 * dP[n][m];
        ys += m * (g * sm[m] - h * cm[m]) * P[n][m];
        zs += t1 * P[n][m];
      }
      X += arn * xs;
      Y += arn * ys;
      Z -= (n + 1) * arn * zs;
    }
    Y /= s;
    // Esféricas -> geodésicas
    const psi = phic - latDeg * D2R;
    const Xg = X * Math.cos(psi) - Z * Math.sin(psi);
    const Zg = X * Math.sin(psi) + Z * Math.cos(psi);
    const hNt = Math.sqrt(Xg * Xg + Y * Y);
    return {
      xNt: Xg, yNt: Y, zNt: Zg, hNt,
      fNt: Math.sqrt(hNt * hNt + Zg * Zg),
      decDeg: Math.atan2(Y, Xg) / D2R,
      incDeg: Math.atan2(Zg, hNt) / D2R,
    };
  }

  declination(latDeg: number, lonDeg: number, year: number, altKm = 0): number {
    return this.field(latDeg, lonDeg, altKm, year)?.decDeg ?? 0;
  }
}

let serie: Wmm | null = null;
export function defaultWmm(): Wmm {
  if (!serie) serie = new Wmm();
  return serie;
}

/** Año decimal de una fecha UTC (2026-07-02 12:00 = 2026.5). */
export function decimalYear(y: number, m: number, d: number, utcHours = 0): number {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return y + (dayOfYear(y, m, d) - 1 + utcHours / 24.0) / (leap ? 366.0 : 365.0);
}

/** Declinación con el modelo de serie (grados, + este). */
export function magneticDeclination(latDeg: number, lonDeg: number, year: number, altKm = 0): number {
  return defaultWmm().declination(latDeg, lonDeg, year, altKm);
}
