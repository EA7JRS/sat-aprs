// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio: localizador, propagación en línea de vista y potencias.

/** Localizador Maidenhead de 6 caracteres (p. ej. IM77aj) para una posición. */
export function maidenhead(lat: number, lon: number): string {
  const lo = Math.min(359.999999, Math.max(0, lon + 180)), la = Math.min(179.999999, Math.max(0, lat + 90));
  const A = 'A'.charCodeAt(0), a = 'a'.charCodeAt(0);
  return String.fromCharCode(A + Math.floor(lo / 20)) + String.fromCharCode(A + Math.floor(la / 10)) +
    Math.floor((lo % 20) / 2) + Math.floor(la % 10) +
    String.fromCharCode(a + Math.floor(((lo % 2) * 60) / 5)) + String.fromCharCode(a + Math.floor(((la % 1) * 60) / 2.5));
}

/** Centro de una cuadrícula Maidenhead de 4 o 6 caracteres; null si no es válida. */
export function maidenheadToLatLon(locator: string): { lat: number; lon: number } | null {
  const m = /^([A-R])([A-R])(\d)(\d)(?:([A-X])([A-X]))?$/i.exec(locator.trim());
  if (!m) return null;
  const up = (c: string) => c.toUpperCase().charCodeAt(0) - 65;
  let lon = up(m[1]) * 20 + parseInt(m[3], 10) * 2 - 180;
  let lat = up(m[2]) * 10 + parseInt(m[4], 10) - 90;
  if (m[5]) {
    lon += (up(m[5]) + 0.5) * (5 / 60);
    lat += (up(m[6]) + 0.5) * (2.5 / 60);
  } else {
    lon += 1;
    lat += 0.5;
  }
  return { lat, lon };
}

export const SPEED_OF_LIGHT_M_S = 299_792_458;
/** Longitud de onda (m) para una frecuencia en MHz. */
export const wavelengthM = (freqMhz: number): number => SPEED_OF_LIGHT_M_S / (freqMhz * 1e6);

/** Pérdida en espacio libre (dB): 32,45 + 20·log10(f MHz) + 20·log10(d km). */
export const freeSpacePathLossDb = (freqMhz: number, distKm: number): number => 32.45 + 20 * Math.log10(freqMhz) + 20 * Math.log10(distKm);

/**
 * Horizonte radio (km) de una antena a `heightM` metros con atmósfera estándar
 * (factor de radio terrestre k = 4/3): 4,12·√h. El alcance en línea de vista
 * entre dos antenas es la suma de sus horizontes.
 */
export const radioHorizonKm = (heightM: number): number => 4.12 * Math.sqrt(Math.max(0, heightM));
export const lineOfSightKm = (h1M: number, h2M: number): number => radioHorizonKm(h1M) + radioHorizonKm(h2M);

/** Radio de la primera zona de Fresnel (m) en un punto a d1 y d2 km de cada extremo. */
export function fresnelRadiusM(freqMhz: number, d1Km: number, d2Km: number): number {
  return 17.32 * Math.sqrt((d1Km * d2Km) / ((freqMhz / 1000) * (d1Km + d2Km)));
}

export const wattsToDbm = (watts: number): number => 10 * Math.log10(watts * 1000);
export const dbmToWatts = (dbm: number): number => Math.pow(10, dbm / 10) / 1000;
/** PIRE (W) con la potencia del transmisor, la ganancia de antena (dBi) y las pérdidas de línea (dB). */
export const eirpWatts = (txWatts: number, gainDbi: number, lossDb = 0): number => txWatts * Math.pow(10, (gainDbi - lossDb) / 10);

/** ROE a partir de la potencia directa y reflejada. */
export function swr(forwardW: number, reflectedW: number): number {
  const rho = Math.sqrt(Math.max(0, reflectedW) / forwardW);
  return rho >= 1 ? Infinity : (1 + rho) / (1 - rho);
}
/** Pérdida de retorno (dB) para una ROE. */
export const returnLossDb = (swrValue: number): number => -20 * Math.log10((swrValue - 1) / (swrValue + 1));

/**
 * Lectura de S-meter (recomendación IARU R1): S9 = −73 dBm por debajo de
 * 30 MHz y −93 dBm por encima, 6 dB por unidad S. Devuelve p. ej. «S7» o «S9+20».
 */
export function sMeter(dbm: number, freqMhz = 14): string {
  const s9 = freqMhz >= 30 ? -93 : -73;
  if (dbm >= s9) {
    const over = Math.round(dbm - s9);
    return over > 0 ? `S9+${over}` : 'S9';
  }
  return `S${Math.max(0, Math.round(9 + (dbm - s9) / 6))}`;
}

/**
 * Alcance teórico del código PHG de APRS (millas terrestres), según la
 * especificación APRS 1.0: √(2·H·√((P/10)·(G/2))), con P en vatios, H en pies
 * sobre el terreno medio y G como factor lineal de la ganancia en dB.
 */
export function phgRangeMiles(powerW: number, heightFt: number, gainDb: number): number {
  return Math.sqrt(2 * heightFt * Math.sqrt((powerW / 10) * (Math.pow(10, gainDb / 10) / 2)));
}
