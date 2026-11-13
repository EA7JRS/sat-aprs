// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Náutica complementaria a geo.ts y motion.ts (que son el porte del plotter).

/** Distancia al horizonte visible (millas náuticas) desde una altura de ojo en metros: 2,08·√h (con refracción media). */
export const horizonDistanceNm = (eyeHeightM: number): number => 2.08 * Math.sqrt(Math.max(0, eyeHeightM));

/** Alcance geográfico de una luz (millas): suma de los horizontes del observador y de la luz. */
export const geographicRangeNm = (eyeHeightM: number, lightHeightM: number): number => horizonDistanceNm(eyeHeightM) + horizonDistanceNm(lightHeightM);

/** Velocidad de casco (nudos) de un barco de desplazamiento: 1,34·√(eslora en flotación en pies). */
export const hullSpeedKn = (waterlineM: number): number => 1.34 * Math.sqrt(Math.max(0, waterlineM) / 0.3048);

const DOUGLAS_TOP_M = [0, 0.1, 0.5, 1.25, 2.5, 4, 6, 9, 14];
const DOUGLAS_ES = ['Calma', 'Rizada', 'Marejadilla', 'Marejada', 'Fuerte marejada', 'Gruesa', 'Muy gruesa', 'Arbolada', 'Montañosa', 'Enorme'];

/** Grado de la escala Douglas (0..9) para una altura significativa de ola en metros. */
export function douglasSeaState(waveHeightM: number): number {
  const h = Math.max(0, waveHeightM);
  for (let g = 0; g < DOUGLAS_TOP_M.length; g++) if (h <= DOUGLAS_TOP_M[g]) return g;
  return 9;
}
export const douglasNameEs = (degree: number): string => DOUGLAS_ES[Math.max(0, Math.min(9, Math.trunc(degree)))];

const ROSA_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
/** Punto de la rosa de 16 rumbos, en español, para un rumbo en grados. */
export const compassPointEs = (deg: number): string => ROSA_16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
