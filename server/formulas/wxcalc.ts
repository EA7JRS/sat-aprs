// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Meteorología: punto de rocío, sensación térmica (viento y calor), humedad
// desde el rocío y presión al nivel del mar. Portado del plotter (wxcalc.cpp).

const KA = 17.625, KB = 243.04;

/**
 * Punto de rocío (°C) con la fórmula de Magnus (Alduchov y Eskridge, 1996:
 * error < 0,4 °C entre -40 y 50 °C). rh en %, 1..100; fuera de rango, NaN.
 */
export function dewPointC(tempC: number, rhPct: number): number {
  if (!(rhPct >= 1 && rhPct <= 100) || !Number.isFinite(tempC)) return NaN;
  const g = Math.log(rhPct / 100.0) + (KA * tempC) / (KB + tempC);
  return (KB * g) / (KA - g);
}

/** Humedad relativa (%) a partir de la temperatura y el punto de rocío. */
export function relHumidityPct(tempC: number, dewC: number): number {
  const rh = (100.0 * Math.exp((KA * dewC) / (KB + dewC))) / Math.exp((KA * tempC) / (KB + tempC));
  return rh > 100 ? 100 : rh;
}

/**
 * Índice de enfriamiento por viento (°C), fórmula de Environment Canada / NWS
 * de 2001. Solo vale con tempC <= 10 y viento > 4,8 km/h; fuera de eso, tempC.
 */
export function windChillC(tempC: number, windKmh: number): number {
  if (!(tempC <= 10) || !(windKmh > 4.8)) return tempC;
  const p = Math.pow(windKmh, 0.16);
  const w = 13.12 + 0.6215 * tempC - 11.37 * p + 0.3965 * tempC * p;
  return w < tempC ? w : tempC;
}

/** Índice de calor (°C), regresión de Rothfusz (NWS). Solo con tempC >= 27 y rh >= 40; fuera, tempC. */
export function heatIndexC(tempC: number, rhPct: number): number {
  if (!(tempC >= 27) || !(rhPct >= 40 && rhPct <= 100)) return tempC;
  const f = (tempC * 9) / 5 + 32, r = rhPct;
  let hi = -42.379 + 2.04901523 * f + 10.14333127 * r - 0.22475541 * f * r - 6.83783e-3 * f * f - 5.481717e-2 * r * r +
    1.22874e-3 * f * f * r + 8.5282e-4 * f * r * r - 1.99e-6 * f * f * r * r;
  if (r > 85 && f <= 87) hi += ((r - 85) / 10.0) * ((87 - f) / 5.0); // ajuste de humedad alta del NWS
  const c = ((hi - 32) * 5) / 9;
  return c > tempC ? c : tempC;
}

/**
 * Sensación térmica: enfriamiento por viento si hace frío, índice de calor si
 * hace calor; si no, la temperatura. rhPct < 0 = sin humedad; windKmh < 0 = sin viento.
 */
export function feelsLikeC(tempC: number, rhPct: number, windKmh: number): number {
  if (windKmh >= 0 && tempC <= 10) return windChillC(tempC, windKmh);
  if (rhPct >= 0 && tempC >= 27) return heatIndexC(tempC, rhPct);
  return tempC;
}

/** Presión reducida al nivel del mar (hPa) desde la de la estación, su altitud (m) y la temperatura (fórmula hipsométrica). */
export function seaLevelPressureHpa(stationHpa: number, altM: number, tempC: number): number {
  const tk = tempC + 273.15 + (0.0065 * altM) / 2; // temperatura media de la columna
  return stationHpa * Math.exp((9.80665 * 0.0289644 * altM) / (8.31446 * tk));
}
