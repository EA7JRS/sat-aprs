// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Meteorología complementaria a wxcalc.ts (que es el porte del plotter):
// magnitudes que necesita una estación meteorológica y de alerta. Cada
// fórmula indica su referencia publicada.

/** Presión de vapor de saturación (hPa), Magnus con los coeficientes de Alduchov y Eskridge (1996). */
export function saturationVaporPressureHpa(tempC: number): number {
  return 6.1094 * Math.exp((17.625 * tempC) / (243.04 + tempC));
}

/** Presión de vapor real (hPa) a partir de la temperatura y la humedad relativa. */
export const vaporPressureHpa = (tempC: number, rhPct: number): number => (rhPct / 100) * saturationVaporPressureHpa(tempC);

/** Humedad absoluta (g/m³): gas ideal para el vapor de agua, Rv = 461,5 J/(kg·K). */
export function absoluteHumidityGm3(tempC: number, rhPct: number): number {
  return (216.7 * vaporPressureHpa(tempC, rhPct)) / (tempC + 273.15);
}

/**
 * Temperatura de bulbo húmedo (°C), ajuste empírico de Stull (2011), J. Appl.
 * Meteor. Climatol. 50. Válido de -20 a 50 °C y del 5 al 99 % a presión normal
 * (error medio < 0,3 °C).
 */
export function wetBulbC(tempC: number, rhPct: number): number {
  return tempC * Math.atan(0.151977 * Math.sqrt(rhPct + 8.313659)) + Math.atan(tempC + rhPct) - Math.atan(rhPct - 1.676331) +
    0.00391838 * Math.pow(rhPct, 1.5) * Math.atan(0.023101 * rhPct) - 4.686035;
}

/** Humidex (Servicio Meteorológico de Canadá, Masterton y Richardson, 1979) a partir del punto de rocío. */
export function humidex(tempC: number, dewC: number): number {
  const e = 6.11 * Math.exp(5417.7530 * (1 / 273.16 - 1 / (273.15 + dewC)));
  return tempC + 0.5555 * (e - 10.0);
}

/**
 * Temperatura aparente (°C) de Steadman en la versión sin radiación del Bureau
 * of Meteorology australiano: AT = Ta + 0,33·e − 0,70·v − 4,00 (v en m/s a 10 m).
 */
export function apparentTemperatureC(tempC: number, rhPct: number, windMs: number): number {
  const e = (rhPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return tempC + 0.33 * e - 0.70 * windMs - 4.0;
}

/** Altura estimada de la base de las nubes convectivas (m sobre el suelo): unos 125 m por °C de separación entre temperatura y rocío. */
export const cloudBaseM = (tempC: number, dewC: number): number => Math.max(0, 125 * (tempC - dewC));

/** Densidad del aire húmedo (kg/m³): Rd = 287,058 y Rv = 461,495 J/(kg·K). */
export function airDensityKgM3(tempC: number, pressureHpa: number, rhPct = 0): number {
  const tk = tempC + 273.15;
  const pv = vaporPressureHpa(tempC, rhPct) * 100;
  const pd = pressureHpa * 100 - pv;
  return pd / (287.058 * tk) + pv / (461.495 * tk);
}

/** Altitud de presión (m) en la atmósfera estándar OACI: 44330·(1 − (p/1013,25)^0,190284). */
export const pressureAltitudeM = (pressureHpa: number): number => 44330.77 * (1 - Math.pow(pressureHpa / 1013.25, 0.190284));

/**
 * Tendencia barométrica en 3 horas según los umbrales habituales en
 * meteorología marítima (hPa en 3 h).
 */
export function pressureTendency(deltaHpa3h: number): 'subiendo muy rápido' | 'subiendo rápido' | 'subiendo' | 'estable' | 'bajando' | 'bajando rápido' | 'bajando muy rápido' {
  const d = deltaHpa3h;
  if (d >= 6) return 'subiendo muy rápido';
  if (d >= 3.6) return 'subiendo rápido';
  if (d >= 1.6) return 'subiendo';
  if (d > -1.6) return 'estable';
  if (d > -3.6) return 'bajando';
  if (d > -6) return 'bajando rápido';
  return 'bajando muy rápido';
}

/** Categoría del índice UV según la OMS. */
export function uvCategory(uvIndex: number): 'Bajo' | 'Moderado' | 'Alto' | 'Muy alto' | 'Extremo' {
  if (uvIndex < 3) return 'Bajo';
  if (uvIndex < 6) return 'Moderado';
  if (uvIndex < 8) return 'Alto';
  if (uvIndex < 11) return 'Muy alto';
  return 'Extremo';
}

/** Intensidad de la precipitación según AEMET (mm/h). */
export function rainIntensity(mmPerHour: number): 'sin lluvia' | 'débil' | 'moderada' | 'fuerte' | 'muy fuerte' | 'torrencial' {
  if (mmPerHour <= 0) return 'sin lluvia';
  if (mmPerHour <= 2) return 'débil';
  if (mmPerHour <= 15) return 'moderada';
  if (mmPerHour <= 30) return 'fuerte';
  if (mmPerHour <= 60) return 'muy fuerte';
  return 'torrencial';
}
