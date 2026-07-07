/**
 * Beaufort Scale Wind Force and Color Mappings
 * Standardized Beaufort Scale for meteorological visualization.
 */

export interface BeaufortInfo {
  force: number;
  name: string;
  rgb: string;
  hex: string;
}

export const BEAUFORT_SCALE: BeaufortInfo[] = [
  { force: 0, name: 'Calma', rgb: 'rgb(255, 255, 255)', hex: '#FFFFFF' },
  { force: 1, name: 'Ventolina', rgb: 'rgb(175, 220, 245)', hex: '#AFDCEF' },
  { force: 2, name: 'Flojito', rgb: 'rgb(135, 206, 235)', hex: '#87CEEB' },
  { force: 3, name: 'Flojo', rgb: 'rgb(152, 251, 152)', hex: '#98FB98' },
  { force: 4, name: 'Bonancible', rgb: 'rgb(50, 205, 50)', hex: '#32CD32' },
  { force: 5, name: 'Fresquito', rgb: 'rgb(173, 255, 47)', hex: '#ADFF2F' },
  { force: 6, name: 'Fresco', rgb: 'rgb(255, 255, 0)', hex: '#FFFF00' },
  { force: 7, name: 'Frescachón', rgb: 'rgb(255, 165, 0)', hex: '#FFA500' },
  { force: 8, name: 'Temporal', rgb: 'rgb(255, 102, 0)', hex: '#FF6600' },
  { force: 9, name: 'Temporal fuerte', rgb: 'rgb(255, 0, 0)', hex: '#FF0000' },
  { force: 10, name: 'Temporal duro', rgb: 'rgb(204, 0, 0)', hex: '#CC0000' },
  { force: 11, name: 'Temporal muy duro', rgb: 'rgb(148, 0, 211)', hex: '#9400D3' },
  { force: 12, name: 'Huracán', rgb: 'rgb(0, 0, 0)', hex: '#000000' }
];

/**
 * Get Beaufort Scale information based on wind speed in knots (kts)
 */
export function getBeaufortInfoByKts(speedKts: number | null | undefined): BeaufortInfo {
  if (speedKts === null || speedKts === undefined || isNaN(speedKts)) {
    return BEAUFORT_SCALE[0];
  }
  
  let force = 0;
  if (speedKts < 1) force = 0;
  else if (speedKts <= 3) force = 1;
  else if (speedKts <= 6) force = 2;
  else if (speedKts <= 10) force = 3;
  else if (speedKts <= 16) force = 4;
  else if (speedKts <= 21) force = 5;
  else if (speedKts <= 27) force = 6;
  else if (speedKts <= 33) force = 7;
  else if (speedKts <= 40) force = 8;
  else if (speedKts <= 47) force = 9;
  else if (speedKts <= 55) force = 10;
  else if (speedKts <= 63) force = 11;
  else force = 12;

  return BEAUFORT_SCALE[force];
}

/**
 * Get Beaufort Scale information based on wind speed in meters per second (m/s)
 */
export function getBeaufortInfoByMs(speedMs: number | null | undefined): BeaufortInfo {
  if (speedMs === null || speedMs === undefined || isNaN(speedMs)) {
    return BEAUFORT_SCALE[0];
  }
  // Convert m/s to knots: 1 m/s ≈ 1.94384 knots
  return getBeaufortInfoByKts(speedMs * 1.94384);
}

/**
 * Get Beaufort Scale information based on wind speed in kilometers per hour (km/h)
 */
export function getBeaufortInfoByKmh(speedKmh: number | null | undefined): BeaufortInfo {
  if (speedKmh === null || speedKmh === undefined || isNaN(speedKmh)) {
    return BEAUFORT_SCALE[0];
  }
  // Convert km/h to knots: 1 km/h ≈ 0.539957 knots
  return getBeaufortInfoByKts(speedKmh * 0.539957);
}
