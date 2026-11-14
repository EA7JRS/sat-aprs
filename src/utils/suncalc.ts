// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
/**
 * Solar Utility calculations for Civil Protection Radio Console
 * Calculates sunrise ("orto") and sunset ("ocaso") using Almanac Equations (NOAA algorithm).
 */

import { sunTimes } from '../../server/formulas/astro';

export interface SolarTimes {
  sunrise: number | null; // decimal hours, local time
  sunset: number | null;  // decimal hours, local time
  sunriseStr: string;     // formatting "HH:MM"
  sunsetStr: string;      // formatting "HH:MM"
}

/**
 * Calculates local sunrise and sunset decimal hours for a given latitude, longitude and date.
 * @param lat Latitude of coordinate (North positive)
 * @param lon Longitude of coordinate (East positive)
 * @param date Date object to calculate for (defaults to current date)
 */
export function getSunriseSunset(lat: number, lon: number, date: Date = new Date()): SolarTimes {
  // Orto y ocaso con la fórmula común del ecosistema (server/formulas/astro.ts),
  // calculados para el día local y pasados a la hora local del navegador.
  const times = sunTimes(date.getFullYear(), date.getMonth() + 1, date.getDate(), lat, lon, -0.833);
  const offsetHours = -date.getTimezoneOffset() / 60;
  const toLocal = (utcMin: number): number => ((((utcMin / 60 + offsetHours) % 24) + 24) % 24);
  const sunrise = times ? toLocal(times.riseUtcMin) : null;
  const sunset = times ? toLocal(times.setUtcMin) : null;

  const formatDec = (val: number | null): string => {
    if (val === null) return '--:--';
    const totalMinutes = Math.round(val * 60);
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return {
    sunrise,
    sunset,
    sunriseStr: formatDec(sunrise),
    sunsetStr: formatDec(sunset)
  };
}

/**
 * Checks if a given time (in decimal local hours) lies between sunset and sunrise.
 * If sunset is post-midnight or sunrise spans past midnight, handles wrap-around.
 */
export function isNightTime(currentHourDec: number, sunrise: number | null, sunset: number | null): boolean {
  if (sunrise === null || sunset === null) {
    return false; // Sun never rises or sets, handle safely
  }

  // standard night time spans from sunset to sunrise: e.g. 21.0 to 6.5
  if (sunset > sunrise) {
    return currentHourDec >= sunset || currentHourDec < sunrise;
  } else {
    // sun does not set before midnight or covers unusual ranges
    return currentHourDec >= sunset && currentHourDec < sunrise;
  }
}
