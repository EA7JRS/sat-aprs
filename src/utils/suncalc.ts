/**
 * Solar Utility calculations for Civil Protection Radio Console
 * Calculates sunrise ("orto") and sunset ("ocaso") using Almanac Equations (NOAA algorithm).
 */

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
  // 1. Calculate Day of year
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diffMs = date.getTime() - startOfYear.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const d = Math.floor(diffMs / oneDayMs) + 1;

  // 2. Lon hour conversion
  const lnHour = lon / 15;
  const zenith = 90.833; // Offical NOAA standard including refraction correction and sun disc size

  // Timezone offset in hours
  const timezoneOffsetHrs = -date.getTimezoneOffset() / 60;

  const calculateLimit = (isSunrise: boolean): number | null => {
    // 3. Keep approximate time
    const t = d + ((isSunrise ? 6 : 18) - lnHour) / 24;

    // 4. Calculate Mean Anomaly
    const M = (0.9856 * t) - 3.289;

    // 5. True Longitude L
    let L = M + (1.916 * Math.sin(M * Math.PI / 180)) + (0.020 * Math.sin(2 * M * Math.PI / 180)) + 282.634;
    L = (L + 360) % 360;

    // 6. Right Ascension RA
    let RA = Math.atan(0.91764 * Math.tan(L * Math.PI / 180)) * 180 / Math.PI;
    RA = (RA + 360) % 360;

    // Adjust RA to be in same quadrant as L
    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = RA + (Lquadrant - RAquadrant);
    RA = RA / 15; // convert to hours

    // 7. Declination
    const sinDec = 0.39782 * Math.sin(L * Math.PI / 180);
    const cosDec = Math.cos(Math.asin(sinDec));

    // 8. Hour Angle H
    const cosH = (Math.cos(zenith * Math.PI / 180) - (sinDec * Math.sin(lat * Math.PI / 180))) / (cosDec * Math.cos(lat * Math.PI / 180));

    if (cosH > 1) {
      return null; // Sun never rises
    }
    if (cosH < -1) {
      return null; // Sun never sets
    }

    let H = Math.acos(cosH) * 180 / Math.PI;
    if (isSunrise) {
      H = 360 - H;
    }
    H = H / 15;

    // 9. Local Time UT
    const T = H + RA - (0.06571 * t) - 6.622;
    let UT = T - lnHour;
    UT = (UT + 24) % 24;

    // 10. Local clock offset
    let localT = UT + timezoneOffsetHrs;
    localT = (localT + 24) % 24;

    return localT;
  };

  const sunrise = calculateLimit(true);
  const sunset = calculateLimit(false);

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
