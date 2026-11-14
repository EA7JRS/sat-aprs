// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Parte meteorológico de la estación por APRS.
//
// Una observación (de la estación propia o de una fuente de Internet) se
// convierte en el parte meteorológico APRS con posición. Los datos que falten
// se envían como puntos, tal como pide el protocolo: nunca se inventan.
// Lectores de la estación propia: la base de datos de WeeWX y el archivo
// «wxnow.txt». Funciones puras salvo las dos lecturas del final.

import { execFile } from 'child_process';
import fs from 'fs';
import { TOCALL, IS_PATH, isValidCallsign, latToAprs, lonToAprs, toAscii } from '../aprs';
import { posicionValida } from './baliza';

export interface Observacion {
  /** Momento de la medida (ms epoch). */
  cuando: number;
  /** De dónde sale: «WeeWX», «OWM», «AEMET Sevilla»... Se indica en el comentario si no es propia. */
  fuente: string;
  /** true = medida por la estación meteorológica propia. */
  propia: boolean;
  tempC?: number;
  humedadPct?: number;
  /** Presión reducida al nivel del mar, en hPa. */
  presionHpa?: number;
  vientoKmh?: number;
  rachaKmh?: number;
  /** Dirección de la que viene el viento, en grados. */
  dirGrados?: number;
  lluvia1hMm?: number;
  lluvia24hMm?: number;
  lluviaHoyMm?: number;
}

/** Una observación más antigua que esto no se emite: sería dar por actual un dato viejo. */
export const MAX_EDAD_OBSERVACION_MS = 30 * 60_000;
export const MIN_INTERVALO_METEO_MIN = 5;

const KMH_A_MPH = 0.621371;
const MM_A_CENTESIMAS_PULGADA = 100 / 25.4;
const valido = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

function campo(valor: number | undefined, ancho: number, min: number, max: number): string {
  if (!valido(valor)) return '.'.repeat(ancho);
  const n = Math.round(Math.min(max, Math.max(min, valor)));
  return n < 0 ? `-${String(Math.abs(n)).padStart(ancho - 1, '0')}` : String(n).padStart(ancho, '0');
}

/** Datos meteorológicos en formato APRS: «DDD/VVVgRRRtTTTrLLLpLLLPLLLhHHbPPPPP». */
export function datosMeteoAprs(o: Observacion): string {
  // Dirección: 001-360 (el norte es 360); sin viento o sin dato, puntos
  let dir = '...';
  if (valido(o.dirGrados) && valido(o.vientoKmh)) {
    const d = Math.round((((o.dirGrados % 360) + 360) % 360));
    dir = String(d === 0 ? 360 : d).padStart(3, '0');
  }
  const viento = campo(valido(o.vientoKmh) ? o.vientoKmh * KMH_A_MPH : undefined, 3, 0, 999);
  const racha = campo(valido(o.rachaKmh) ? o.rachaKmh * KMH_A_MPH : undefined, 3, 0, 999);
  const temp = campo(valido(o.tempC) ? o.tempC * 9 / 5 + 32 : undefined, 3, -99, 999);
  const lluvia = (mm: number | undefined) => campo(valido(mm) ? mm * MM_A_CENTESIMAS_PULGADA : undefined, 3, 0, 999);
  let texto = `${dir}/${viento}g${racha}t${temp}`;
  if (valido(o.lluvia1hMm)) texto += `r${lluvia(o.lluvia1hMm)}`;
  if (valido(o.lluvia24hMm)) texto += `p${lluvia(o.lluvia24hMm)}`;
  if (valido(o.lluviaHoyMm)) texto += `P${lluvia(o.lluviaHoyMm)}`;
  if (valido(o.humedadPct)) {
    const h = Math.round(Math.min(100, Math.max(1, o.humedadPct)));
    texto += `h${h === 100 ? '00' : String(h).padStart(2, '0')}`; // 100 % se escribe h00
  }
  if (valido(o.presionHpa) && o.presionHpa > 800 && o.presionHpa < 1100) texto += `b${campo(o.presionHpa * 10, 5, 0, 99999)}`;
  return texto;
}

/** La observación tiene al menos un dato meteorológico. */
export function observacionUtil(o: Observacion | null | undefined): o is Observacion {
  return !!o && [o.tempC, o.humedadPct, o.presionHpa, o.vientoKmh].some(valido);
}

function sello(ms: number): string {
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}z`;
}

export interface EstacionMeteo { callsign: string; lat: number; lon: number }

/** Motivos por los que el parte no puede emitirse (lista vacía = se puede). */
export function validarParte(estacion: EstacionMeteo, o: Observacion | null | undefined, ahora: number): string[] {
  const errores: string[] = [];
  if (!isValidCallsign(estacion.callsign)) errores.push('indicativo no válido o de plantilla');
  if (!posicionValida(estacion.lat, estacion.lon)) errores.push('posición de la estación sin configurar');
  if (!observacionUtil(o)) errores.push('sin datos meteorológicos reales');
  else if (ahora - o.cuando > MAX_EDAD_OBSERVACION_MS) errores.push(`el último dato (${o.fuente}) tiene más de ${MAX_EDAD_OBSERVACION_MS / 60_000} minutos`);
  else if (o.cuando > ahora + 5 * 60_000) errores.push('la hora del dato está en el futuro');
  return errores;
}

/**
 * Trama TNC2 del parte meteorológico completo con posición y hora de la
 * medida: «@DDHHMMzLAT/LON_datos». Si el dato no es de la estación propia se
 * dice en el comentario. Devuelve null si no puede emitirse.
 */
export function parteMeteoAprs(estacion: EstacionMeteo, o: Observacion | null | undefined, ahora = Date.now()): string | null {
  if (validarParte(estacion, o, ahora).length > 0 || !o) return null;
  const comentario = toAscii(o.propia ? '' : ` ${o.fuente}`).slice(0, 24).trimEnd();
  const info = `@${sello(o.cuando)}${latToAprs(estacion.lat)}/${lonToAprs(estacion.lon)}_${datosMeteoAprs(o)}${comentario}`;
  return `${estacion.callsign.trim().toUpperCase()}>${TOCALL},${IS_PATH}:${info}`;
}

/** Elige la observación a emitir: «propia», «internet» o «auto» (propia si es reciente; si no, Internet). */
export function elegirObservacion(
  modo: 'auto' | 'propia' | 'internet',
  propia: Observacion | null,
  internet: Observacion | null,
  ahora: number,
): Observacion | null {
  const fresca = (o: Observacion | null) => (observacionUtil(o) && ahora - o.cuando <= MAX_EDAD_OBSERVACION_MS ? o : null);
  if (modo === 'propia') return propia;
  if (modo === 'internet') return internet;
  return fresca(propia) ?? fresca(internet) ?? propia ?? internet;
}

export function intervaloMeteoMs(minutos: number | undefined): number {
  const m = Number.isFinite(minutos) ? Number(minutos) : 10;
  return Math.max(MIN_INTERVALO_METEO_MIN, m) * 60_000;
}

// ---------------------------------------------------------------------------
// Estación propia: base de datos de WeeWX
// ---------------------------------------------------------------------------
/** Consulta del último registro del archivo de WeeWX (una fila, campos separados por «|»). */
export const CONSULTA_WEEWX =
  'SELECT dateTime, usUnits, outTemp, outHumidity, barometer, windSpeed, windGust, windDir, rainRate, ' +
  '(SELECT SUM(rain) FROM archive WHERE dateTime > (SELECT MAX(dateTime) FROM archive) - 3600), ' +
  '(SELECT SUM(rain) FROM archive WHERE dateTime > (SELECT MAX(dateTime) FROM archive) - 86400) ' +
  'FROM archive ORDER BY dateTime DESC LIMIT 1;';

/**
 * Interpreta la fila devuelta por la consulta anterior. WeeWX guarda en uno de
 * tres sistemas de unidades (usUnits): 1 = EE. UU., 16 = métrico, 17 = métrico
 * con viento en m/s y lluvia en mm.
 */
export function leerFilaWeewx(fila: string): Observacion | null {
  const c = fila.trim().split('|');
  if (c.length < 11) return null;
  const n = (i: number): number | undefined => {
    const t = c[i]?.trim();
    if (t === undefined || t === '') return undefined;
    const v = Number(t);
    return Number.isFinite(v) ? v : undefined;
  };
  const segundos = n(0);
  const unidades = n(1);
  if (!valido(segundos) || ![1, 16, 17].includes(unidades as number)) return null;
  const us = unidades === 1;
  const temp = n(2), presion = n(4), viento = n(5), racha = n(6), l1 = n(9), l24 = n(10);
  const velocidad = (v: number | undefined) => (!valido(v) ? undefined : us ? v * 1.609344 : unidades === 17 ? v * 3.6 : v);
  const lluvia = (v: number | undefined) => (!valido(v) ? undefined : us ? v * 25.4 : unidades === 16 ? v * 10 : v);
  return {
    cuando: segundos * 1000,
    fuente: 'WeeWX',
    propia: true,
    tempC: !valido(temp) ? undefined : us ? (temp - 32) * 5 / 9 : temp,
    humedadPct: n(3),
    presionHpa: !valido(presion) ? undefined : us ? presion * 33.8639 : presion,
    vientoKmh: velocidad(viento),
    rachaKmh: velocidad(racha),
    dirGrados: n(7),
    lluvia1hMm: lluvia(l1),
    lluvia24hMm: lluvia(l24),
  };
}

/** Lee el último registro de WeeWX con la orden «sqlite3», en solo lectura. */
export function leerWeewx(rutaBd: string): Promise<Observacion | null> {
  return new Promise((resolve) => {
    if (!rutaBd || !fs.existsSync(rutaBd)) return resolve(null);
    execFile('sqlite3', ['-readonly', '-separator', '|', rutaBd, CONSULTA_WEEWX], { timeout: 8000 }, (error, salida) => {
      resolve(error ? null : leerFilaWeewx(String(salida).split('\n')[0] || ''));
    });
  });
}

// ---------------------------------------------------------------------------
// Estación propia: archivo wxnow.txt (el que usan Direwolf, aprx y Xastir)
// ---------------------------------------------------------------------------
/** «wxnow.txt»: una línea con la fecha y otra con los datos en formato APRS. */
export function leerWxnow(texto: string, modificado: number): Observacion | null {
  const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => /^[\d.]{3}\/[\d.]{3}/.test(l));
  if (!linea) return null;
  const num = (re: RegExp): number | undefined => {
    const m = re.exec(linea);
    return m && /^-?\d+$/.test(m[1]) ? Number(m[1]) : undefined;
  };
  const dir = num(/^(\d{3})\//);
  const viento = num(/^[\d.]{3}\/(\d{3})/);
  const racha = num(/g(\d{3})/);
  const temp = num(/t(-?\d{2,3})/);
  const humedad = num(/h(\d{2})/);
  const presion = num(/b(\d{5})/);
  const l1 = num(/r(\d{3})/), l24 = num(/p(\d{3})/), hoy = num(/P(\d{3})/);
  const mm = (v: number | undefined) => (valido(v) ? v / MM_A_CENTESIMAS_PULGADA : undefined);
  const o: Observacion = {
    cuando: modificado,
    fuente: 'wxnow.txt',
    propia: true,
    tempC: valido(temp) ? (temp - 32) * 5 / 9 : undefined,
    humedadPct: valido(humedad) ? (humedad === 0 ? 100 : humedad) : undefined,
    presionHpa: valido(presion) ? presion / 10 : undefined,
    vientoKmh: valido(viento) ? viento / KMH_A_MPH : undefined,
    rachaKmh: valido(racha) ? racha / KMH_A_MPH : undefined,
    dirGrados: valido(dir) ? dir % 360 : undefined,
    lluvia1hMm: mm(l1),
    lluvia24hMm: mm(l24),
    lluviaHoyMm: mm(hoy),
  };
  return observacionUtil(o) ? o : null;
}

/** Lee «wxnow.txt»; la hora de la medida es la de modificación del archivo. */
export function leerArchivoWxnow(ruta: string): Observacion | null {
  try {
    if (!ruta) return null;
    return leerWxnow(fs.readFileSync(ruta, 'utf8'), fs.statSync(ruta).mtimeMs);
  } catch {
    return null;
  }
}
