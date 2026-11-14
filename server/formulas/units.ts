// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sistemas de unidades: náutico, métrico, imperial y de usuario. Valores
// internos: nm, kn, m, °C, hPa, litros. Portado del plotter (units.cpp).
import { beaufort } from './wind';

export type UnitSystem = 'nautical' | 'metric' | 'imperial' | 'user';
export type DistUnit = 'nm' | 'km' | 'mi';
export type SpeedUnit = 'kn' | 'kmh' | 'mph' | 'ms' | 'beaufort';
export type DepthUnit = 'm' | 'ft' | 'fathom';
export type TempUnit = 'C' | 'F';
export type PressUnit = 'hpa' | 'inhg' | 'mb';
export type VolUnit = 'l' | 'galus';

export interface Units {
  dist: DistUnit; boatSpeed: SpeedUnit; windSpeed: SpeedUnit; depth: DepthUnit; height: DepthUnit; temp: TempUnit; press: PressUnit; vol: VolUnit;
}

export function unitsFor(system: UnitSystem, user: Units): Units {
  switch (system) {
    case 'nautical': return { dist: 'nm', boatSpeed: 'kn', windSpeed: 'kn', depth: 'm', height: 'm', temp: 'C', press: 'hpa', vol: 'l' };
    case 'metric': return { dist: 'km', boatSpeed: 'kmh', windSpeed: 'ms', depth: 'm', height: 'm', temp: 'C', press: 'hpa', vol: 'l' };
    case 'imperial': return { dist: 'mi', boatSpeed: 'mph', windSpeed: 'mph', depth: 'ft', height: 'ft', temp: 'F', press: 'inhg', vol: 'galus' };
    default: return user;
  }
}

export const distFromNm = (nm: number, u: DistUnit): number => (u === 'km' ? nm * 1.852 : u === 'mi' ? (nm * 1.852) / 1.609344 : nm);

/** Con 'beaufort' devuelve la fuerza. */
export function speedFromKn(kn: number, u: SpeedUnit): number {
  switch (u) {
    case 'kmh': return kn * 1.852;
    case 'mph': return (kn * 1.852) / 1.609344;
    case 'ms': return (kn * 1852.0) / 3600.0;
    case 'beaufort': return beaufort(kn);
    default: return kn;
  }
}

export const depthFromM = (m: number, u: DepthUnit): number => (u === 'ft' ? m / 0.3048 : u === 'fathom' ? m / 1.8288 : m);
export const tempFromC = (c: number, u: TempUnit): number => (u === 'F' ? (c * 9.0) / 5.0 + 32.0 : c);
export const pressFromHpa = (h: number, u: PressUnit): number => (u === 'inhg' ? h / 33.8638866667 : h);
export const volFromL = (l: number, u: VolUnit): number => (u === 'galus' ? l / 3.785411784 : l);

const LABELS: Record<string, string> = {
  nm: 'nm', km: 'km', mi: 'mi', kn: 'kn', kmh: 'km/h', mph: 'mph', ms: 'm/s', beaufort: 'Bft',
  m: 'm', ft: 'ft', fathom: 'brazas', C: '°C', F: '°F', hpa: 'hPa', inhg: 'inHg', mb: 'mb', l: 'L', galus: 'gal',
};
export const unitLabel = (u: DistUnit | SpeedUnit | DepthUnit | TempUnit | PressUnit | VolUnit): string => LABELS[u];
