// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Lo que WeeWX da de verdad, para su pantalla.
//
//  · weewx.conf: tipo de estación, ubicación, intervalo de archivo y base de datos.
//  · Su base de datos (SQLite, tabla «archive»): las últimas 24 h, hora a
//    hora, y los extremos. Se lee con la orden «sqlite3» en solo lectura.
// Sin base de datos no hay gráficas: se dice, no se inventan.

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ConfWeewx {
  tipoEstacion: string | null;
  ubicacion: string | null;
  lat: number | null;
  lon: number | null;
  altitud: string | null;
  intervaloArchivoS: number | null;
  baseDatos: string | null;
  unidadesInforme: string | null;
}

/** Lee weewx.conf (formato ConfigObj: [Sección], [[Subsección]], clave = valor). */
export function leerConfWeewx(texto: string): ConfWeewx {
  const c: ConfWeewx = { tipoEstacion: null, ubicacion: null, lat: null, lon: null, altitud: null, intervaloArchivoS: null, baseDatos: null, unidadesInforme: null };
  const secciones: string[] = [];
  const valores = new Map<string, string>();
  for (const bruta of texto.split(/\r?\n/)) {
    const linea = bruta.replace(/\s+#.*$/, '').trim();
    if (!linea || linea.startsWith('#')) continue;
    const s = /^(\[+)\s*([^\]]+?)\s*\]+$/.exec(linea);
    if (s) {
      secciones.length = s[1].length - 1;
      secciones[s[1].length - 1] = s[2];
      continue;
    }
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(linea);
    if (kv) valores.set([...secciones, kv[1]].join('/'), kv[2].replace(/^["']|["']$/g, '').trim());
  }
  const v = (k: string) => valores.get(k) ?? null;
  c.tipoEstacion = v('Station/station_type');
  c.ubicacion = v('Station/location');
  const num = (t: string | null) => (t !== null && Number.isFinite(Number(t)) ? Number(t) : null);
  c.lat = num(v('Station/latitude'));
  c.lon = num(v('Station/longitude'));
  c.altitud = v('Station/altitude')?.replace(/\s*,\s*/, ' ') ?? null;
  c.intervaloArchivoS = num(v('StdArchive/archive_interval'));
  c.unidadesInforme = v('StdConvert/target_unit');
  // La base de datos: [DataBindings] → [[wx_binding]] database = archive_sqlite;
  // [Databases] → [[archive_sqlite]] database_name; [DatabaseTypes] → [[SQLite]] SQLITE_ROOT
  const enlace = v('DataBindings/wx_binding/database') ?? 'archive_sqlite';
  const nombre = v(`Databases/${enlace}/database_name`);
  if (nombre) {
    const raiz = v('DatabaseTypes/SQLite/SQLITE_ROOT') ?? '/var/lib/weewx';
    const raizReal = raiz.replace('%(WEEWX_ROOT)s', v('WEEWX_ROOT') ?? '/');
    c.baseDatos = path.isAbsolute(nombre) ? nombre : path.join(raizReal.startsWith('/') ? raizReal : path.join(v('WEEWX_ROOT') ?? '/', raizReal), nombre);
  }
  return c;
}

// ── Base de datos ───────────────────────────────────────────────────────────
export interface HoraWeewx {
  hora: number;
  tempC: number | null;
  humedadPct: number | null;
  presionHpa: number | null;
  vientoKmh: number | null;
  rachaKmh: number | null;
  lluviaMm: number | null;
  registros: number;
}

/** Medias por hora de las últimas 24 h del archivo (y la lluvia sumada). */
export const CONSULTA_HORAS =
  'SELECT (dateTime/3600)*3600 AS h, MAX(usUnits), AVG(outTemp), AVG(outHumidity), AVG(barometer), AVG(windSpeed), MAX(windGust), SUM(rain), COUNT(*) ' +
  'FROM archive WHERE dateTime > (SELECT MAX(dateTime) FROM archive) - 86400 GROUP BY h ORDER BY h;';

const valido = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Interpreta las filas de CONSULTA_HORAS, pasándolas a unidades métricas. */
export function leerHorasWeewx(salida: string): HoraWeewx[] {
  const horas: HoraWeewx[] = [];
  for (const fila of salida.split('\n')) {
    const c = fila.trim().split('|');
    if (c.length < 9) continue;
    const n = (i: number): number | null => (c[i] === undefined || c[i].trim() === '' || !Number.isFinite(Number(c[i])) ? null : Number(c[i]));
    const h = n(0), u = n(1);
    if (!valido(h) || ![1, 16, 17].includes(u as number)) continue;
    const us = u === 1;
    const vel = (v: number | null) => (!valido(v) ? null : us ? v * 1.609344 : u === 17 ? v * 3.6 : v);
    const temp = n(2), pres = n(4), lluvia = n(7);
    horas.push({
      hora: h * 1000,
      tempC: !valido(temp) ? null : us ? (temp - 32) * 5 / 9 : temp,
      humedadPct: n(3),
      presionHpa: !valido(pres) ? null : us ? pres * 33.8639 : pres,
      vientoKmh: vel(n(5)),
      rachaKmh: vel(n(6)),
      lluviaMm: !valido(lluvia) ? null : us ? lluvia * 25.4 : u === 16 ? lluvia * 10 : lluvia,
      registros: n(8) ?? 0,
    });
  }
  return horas;
}

/** Extremos y tendencia de las 24 h. */
export function resumenHoras(horas: HoraWeewx[]) {
  const de = (k: keyof HoraWeewx) => horas.map((h) => h[k]).filter(valido) as number[];
  const temps = de('tempC'), rachas = de('rachaKmh'), lluvias = de('lluviaMm'), pres = horas.filter((h) => valido(h.presionHpa));
  // Tendencia barométrica: diferencia en las últimas 3 h
  const ultima = pres[pres.length - 1];
  const hace3 = ultima ? pres.find((h) => h.hora >= ultima.hora - 3 * 3600_000) : undefined;
  return {
    tempMin: temps.length ? Math.min(...temps) : null,
    tempMax: temps.length ? Math.max(...temps) : null,
    rachaMax: rachas.length ? Math.max(...rachas) : null,
    lluvia24h: lluvias.length ? lluvias.reduce((s, x) => s + x, 0) : null,
    tendencia3h: ultima && hace3 && hace3 !== ultima ? ultima.presionHpa! - hace3.presionHpa! : null,
    registros: horas.reduce((s, h) => s + h.registros, 0),
  };
}

export function consultarWeewx(rutaBd: string, consulta: string): Promise<{ salida: string; error: string | null }> {
  return new Promise((resolve) => {
    if (!rutaBd) return resolve({ salida: '', error: 'sin ruta de la base de datos' });
    if (!fs.existsSync(rutaBd)) return resolve({ salida: '', error: `no existe ${rutaBd}` });
    execFile('sqlite3', ['-readonly', '-separator', '|', rutaBd, consulta], { timeout: 8000 }, (e, salida, err) => {
      if (e) {
        const msg = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'falta la orden sqlite3 (sudo apt install sqlite3)' : String(err || e.message).trim().split('\n')[0];
        return resolve({ salida: '', error: msg });
      }
      resolve({ salida: String(salida), error: null });
    });
  });
}
