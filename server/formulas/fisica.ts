// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Física aplicada a los avisos: sismología y radiación ionizante.

/** Energía radiada por un sismo (julios), Gutenberg-Richter: log10 E = 1,5·M + 4,8. */
export const seismicEnergyJ = (magnitude: number): number => Math.pow(10, 1.5 * magnitude + 4.8);

/** Equivalente en toneladas de TNT (1 t = 4,184·10⁹ J). */
export const tntTons = (joules: number): number => joules / 4.184e9;

/** Cuántas veces más energía libera un sismo de magnitud m1 que otro de m2 (≈ 31,6 por cada unidad). */
export const seismicEnergyRatio = (m1: number, m2: number): number => Math.pow(10, 1.5 * (m1 - m2));

/** Distancia hipocentral (km) a partir de la epicentral y la profundidad. */
export const hypocentralDistanceKm = (epicentralKm: number, depthKm: number): number => Math.hypot(epicentralKm, depthKm);

/**
 * Tiempo estimado de llegada de las ondas P y S (segundos desde el origen) con
 * velocidades medias de corteza (6,0 y 3,5 km/s). Es una aproximación para
 * distancias regionales, no un cálculo con modelo de Tierra.
 */
export function seismicArrivalS(epicentralKm: number, depthKm = 10): { pS: number; sS: number; leadS: number } {
  const d = hypocentralDistanceKm(epicentralKm, depthKm);
  const pS = d / 6.0, sS = d / 3.5;
  return { pS, sS, leadS: sS - pS };
}

// Radiación ionizante
/** 1 µSv = 0,1 mrem. */
export const uSvToMrem = (uSv: number): number => uSv * 0.1;
/** Tasa de dosis de nSv/h a µSv/h (unidad de la red EURDEP). */
export const nSvhToUSvh = (nSvh: number): number => nSvh / 1000;
/** Dosis anual (mSv) si la tasa (µSv/h) se mantuviera todo el año. */
export const annualDoseMSv = (uSvPerHour: number): number => (uSvPerHour * 24 * 365.25) / 1000;

/**
 * Nivel de una tasa de dosis ambiental gamma (µSv/h) con los umbrales que usa
 * la consola: aviso por encima de 0,30 y nivel alto por encima de 1,00. El
 * fondo natural en España está entre 0,05 y 0,25. Son umbrales operativos de
 * la estación; no sustituyen a los criterios oficiales del CSN.
 */
export function doseRateLevel(uSvPerHour: number): 'normal' | 'aviso' | 'alto' {
  if (uSvPerHour > 1.0) return 'alto';
  if (uSvPerHour > 0.3) return 'aviso';
  return 'normal';
}
