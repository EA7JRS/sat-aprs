// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
/**
 * GEOGRAPHIC UTILITIES FOR S.A.T.-APRS+
 * Uniform Distance (Haversine) and Bearing (Rumbo) computations.
 */

import { gcDistanceKm, gcInitialBearing } from '../../server/formulas/geo';

export interface GeoLocation {
  lat: number;
  lon: number;
}

/**
 * Distancia en kilómetros por círculo máximo (fórmula común del ecosistema).
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return parseFloat(gcDistanceKm({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }).toFixed(1));
}

/**
 * Demora inicial verdadera en grados del punto 1 al punto 2.
 */
export function calculateBearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return gcInitialBearing({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 });
}

/**
 * Translates a bearing in degrees into a beautiful cardinal indicator (e.g. "▲ N", "► NE").
 */
export function getBearingIndicator(lat1: number, lon1: number, lat2: number, lon2: number): string {
  if (Math.abs(lat1 - lat2) < 0.0001 && Math.abs(lon1 - lon2) < 0.0001) return '● AQUÍ';
  
  const bearing = calculateBearingDegrees(lat1, lon1, lat2, lon2);
  const index = Math.round(bearing / 22.5) % 16;
  
  const sectors = [
    { label: 'N', icon: '▲' },
    { label: 'NNE', icon: '▲' },
    { label: 'NE', icon: '►' },
    { label: 'ENE', icon: '►' },
    { label: 'E', icon: '►' },
    { label: 'ESE', icon: '►' },
    { label: 'SE', icon: '▼' },
    { label: 'SSE', icon: '▼' },
    { label: 'S', icon: '▼' },
    { label: 'SSW', icon: '▼' },
    { label: 'SO', icon: '◀' },
    { label: 'OSO', icon: '◀' },
    { label: 'O', icon: '◀' },
    { label: 'ONO', icon: '◀' },
    { label: 'NO', icon: '▲' },
    { label: 'NNO', icon: '▲' }
  ];
  
  const sector = sectors[index];
  return `${sector.icon} ${sector.label} (${Math.round(bearing)}°)`;
}
