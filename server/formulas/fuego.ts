// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Fórmulas de comportamiento del fuego.
//
// Velocidad de propagación de un incendio de superficie según el modelo de
// Rothermel (1972), simplificado, y la «regla de los 30» (viento de 30 km/h
// o más, 30 °C o más y humedad del 30 % o menos).

// ROTHERMEL (1972) WILDFIRE RATE OF SPREAD (ROS) MATHEMATICAL ENGINE
// Formula: R = (I_R * xi * (1 + Phi_w + Phi_s)) / (rho_b * epsilon * Q_i)
export function calculateRothermelROS(params: {
  windSpeedKmh: number; // U: Wind velocity (km/h)
  slopePercent: number; // Pendiente / Slope (%)
  tempC: number;        // Air Temperature (°C)
  rhPercent: number;    // Relative Humidity (%)
  frpMw: number;        // Fire Radiative Power (MW)
  fuelType?: string;    // matorral_seco | pinar | eucaliptal | pasto | frondosas
}) {
  const { windSpeedKmh, slopePercent, tempC, rhPercent, frpMw, fuelType = 'matorral_seco' } = params;

  // 1. "Regla del 30" Check (Wind > 30 km/h, Temp > 30°C, RH < 30%)
  const ruleOf30 = windSpeedKmh >= 30 && tempC >= 30 && rhPercent <= 30;

  // 2. Fuel Matrix (rho_b * epsilon * Q_i) and Wind/Slope constants
  // Fine dry fuels (pasto/matorral) have lower density & heat of ignition, reacting instantly to wind.
  let fuelMatrix = 900; // kJ/m^3 (matorral default)
  let baseIr = 1800 + Math.min(9000, frpMw * 35); // kJ/m^2/min (Reaction Intensity)
  let B_exponent = 1.48; // Power-law exponent for wind factor Phi_w = C * U^B
  let C_factor = 0.032;  // Empirical coefficient

  if (fuelType === 'pasto') {
    fuelMatrix = 600;  // Fine, low bulk density (pastizal fino agostado)
    B_exponent = 1.65;
    C_factor = 0.042;
  } else if (fuelType === 'matorral_seco') {
    fuelMatrix = 850;  // Garriga y matorral continental inflamable
    B_exponent = 1.50;
    C_factor = 0.035;
  } else if (fuelType === 'eucaliptal') {
    fuelMatrix = 1100; // Eucaliptal con tiras de corteza colgante
    B_exponent = 1.46;
    C_factor = 0.030;
  } else if (fuelType === 'pinar') {
    fuelMatrix = 1350; // Pinar de pino carrasco con pinocha y piñas
    B_exponent = 1.40;
    C_factor = 0.026;
  } else if (fuelType === 'frondosas') {
    fuelMatrix = 2100; // Bosque húmedo de frondosas (alta retención hídrica)
    B_exponent = 1.25;
    C_factor = 0.018;
  }

  // 3. Optimum Flux Ratio (xi)
  const xi = 0.12;

  // 4. Wind Factor (Phi_w) - Power-law / exponential response to wind velocity U
  const U = Math.max(0, windSpeedKmh);
  const phiW = C_factor * Math.pow(U, B_exponent);

  // 5. Slope Factor (Phi_s) - Efecto chimenea a favor de pendiente
  const slopeAngleRad = Math.atan(slopePercent / 100);
  const phiS = 5.275 * Math.pow(Math.tan(slopeAngleRad), 2);

  // 6. Calculate Linear Rate of Spread R (m/min)
  // R = (I_R * xi * (1 + Phi_w + Phi_s)) / (rho_b * epsilon * Q_i)
  let rawR = (baseIr * xi * (1 + phiW + phiS)) / fuelMatrix;

  // If Regla del 30 applies, extreme behavior convective chimney amplification
  if (ruleOf30) {
    rawR *= 1.45;
  }

  const rosMmin = Math.round(rawR * 10) / 10;
  const rosKmh = Math.round((rosMmin * 0.06) * 100) / 100;

  // 7. Shape behavior
  let spreadShape: 'Concéntrica' | 'Elíptica Alargada' | 'Dominada por Viento / Extrema' = 'Concéntrica';
  if (U < 5) {
    spreadShape = 'Concéntrica';
  } else if (U <= 25 && !ruleOf30) {
    spreadShape = 'Elíptica Alargada';
  } else {
    spreadShape = 'Dominada por Viento / Extrema';
  }

  return {
    rosMmin,
    rosKmh,
    phiW: Math.round(phiW * 100) / 100,
    phiS: Math.round(phiS * 100) / 100,
    reactionIntensityIr: Math.round(baseIr),
    fuelHeatMatrix: fuelMatrix,
    ruleOf30,
    spreadShape
  };
}
