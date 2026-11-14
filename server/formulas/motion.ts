// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Movimiento relativo: CPA / TCPA, viento real y aparente, VMG y corriente.
// Velocidades en nudos, ángulos en grados. Portado del plotter (motion.cpp).
import { LatLon, deg2rad, gcDistanceNm, gcInitialBearing, norm180, norm360, rad2deg } from './geo';

export interface Mover { pos: LatLon; sogKn: number; cogDeg: number }

/**
 * Punto de máxima aproximación entre el barco propio y un blanco.
 * tcpaMin < 0: el blanco ya se aleja (cpaNm = distancia actual).
 * moving = false si no hay movimiento relativo.
 */
export function cpa(own: Mover, target: Mover): { cpaNm: number; tcpaMin: number; moving: boolean } {
  // Plano local centrado en el barco propio (millas): x al este, y al norte
  const d = gcDistanceNm(own.pos, target.pos), b = deg2rad(gcInitialBearing(own.pos, target.pos));
  const rx = d * Math.sin(b), ry = d * Math.cos(b);
  const vx = target.sogKn * Math.sin(deg2rad(target.cogDeg)) - own.sogKn * Math.sin(deg2rad(own.cogDeg));
  const vy = target.sogKn * Math.cos(deg2rad(target.cogDeg)) - own.sogKn * Math.cos(deg2rad(own.cogDeg));
  const v2 = vx * vx + vy * vy;
  if (v2 < 1e-6) return { cpaNm: d, tcpaMin: 0, moving: false };
  const t = -(rx * vx + ry * vy) / v2; // horas
  if (t < 0) return { cpaNm: d, tcpaMin: t * 60, moving: true };
  return { cpaNm: Math.hypot(rx + vx * t, ry + vy * t), tcpaMin: t * 60, moving: true };
}

/**
 * Viento real a partir del aparente. awaDeg: -180..180 (positivo = estribor);
 * headingDeg: proa verdadera. twaDeg -180..180, twdDeg 0..360 (de donde viene).
 */
export function trueWind(awaDeg: number, awsKn: number, boatKn: number, headingDeg: number): { twaDeg: number; twsKn: number; twdDeg: number } {
  const x = awsKn * Math.sin(deg2rad(awaDeg)), y = awsKn * Math.cos(deg2rad(awaDeg)) - boatKn;
  const twsKn = Math.hypot(x, y);
  const twaDeg = twsKn < 1e-9 ? 0 : rad2deg(Math.atan2(x, y));
  return { twaDeg, twsKn, twdDeg: norm360(headingDeg + twaDeg) };
}

/** Viento aparente a partir del real (para estimarlo con datos de Internet). */
export function apparentWind(twdDeg: number, twsKn: number, boatKn: number, headingDeg: number): { awaDeg: number; awsKn: number } {
  const twa = deg2rad(norm180(twdDeg - headingDeg));
  const x = twsKn * Math.sin(twa), y = twsKn * Math.cos(twa) + boatKn;
  const awsKn = Math.hypot(x, y);
  return { awaDeg: awsKn < 1e-9 ? 0 : rad2deg(Math.atan2(x, y)), awsKn };
}

/** Velocidad ganada hacia barlovento (> 0 ganando barlovento). */
export const vmgToWind = (boatKn: number, twaDeg: number): number => boatKn * Math.cos(deg2rad(twaDeg));
/** Velocidad de aproximación a un punto de recalada. */
export const vmgToWaypoint = (sogKn: number, cogDeg: number, bearingDeg: number): number => sogKn * Math.cos(deg2rad(cogDeg - bearingDeg));

/** Corriente: de (proa, corredera) frente a (COG, SOG). setDeg = hacia donde va. */
export function current(headingDeg: number, stwKn: number, cogDeg: number, sogKn: number): { setDeg: number; driftKn: number } {
  const x = sogKn * Math.sin(deg2rad(cogDeg)) - stwKn * Math.sin(deg2rad(headingDeg));
  const y = sogKn * Math.cos(deg2rad(cogDeg)) - stwKn * Math.cos(deg2rad(headingDeg));
  const driftKn = Math.hypot(x, y);
  return { setDeg: driftKn < 1e-9 ? 0 : norm360(rad2deg(Math.atan2(x, y))), driftKn };
}
