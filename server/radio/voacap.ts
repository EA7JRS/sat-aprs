// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Predicción de un circuito de onda corta con VOACAP, en este mismo equipo.
//
// VOACAP (NTIA / ITS, EE. UU.; sin derechos de autor allí) se ejecuta como programa aparte, voacapl,
// su versión para Linux (J. A. Watson, CC0). Aquí no se incluye nada suyo: si no está instalado
// (tools/instalar-voacap.sh), no hay predicción propia y la consola puede pedírsela a Wefax.
// El formato de la entrada y la lectura de la salida son los mismos que en EA7JRS/Wefax (voacap.c).

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface EntradaVoacap {
  txLat: number; txLon: number; rxLat: number; rxLon: number;
  /** Potencia del transmisor, kW. */
  kw: number;
  khz: number[];
  anio: number; mes: number;
  /** Número de manchas solares suavizado del mes. */
  manchas: number;
  /** Ruido artificial a 3 MHz, en -dBW: 145 residencial, 150 rural. */
  ruido: number;
  /** Señal sobre ruido necesaria, dB en 1 Hz. */
  umbral: number;
}

const f = (v: number, ancho: number, dec: number) => v.toFixed(dec).padStart(ancho, ' ');

/** Texto del archivo de entrada, en sus columnas; null si los datos no pueden ser un circuito (2 a 30 MHz, 11 frecuencias). */
export function entradaVoacap(e: EntradaVoacap): string | null {
  const nums = [e.txLat, e.txLon, e.rxLat, e.rxLon, e.kw, e.manchas, e.ruido, e.umbral, ...e.khz];
  if (!nums.every(Number.isFinite)) return null;
  if (e.khz.length < 1 || e.khz.length > 11 || e.khz.some((k) => k < 2000 || k > 30000)) return null;
  if (!Number.isInteger(e.mes) || e.mes < 1 || e.mes > 12 || !Number.isInteger(e.anio) || e.anio < 1990 || e.anio > 2100) return null;
  if (Math.abs(e.txLat) > 90 || Math.abs(e.rxLat) > 90 || Math.abs(e.txLon) > 180 || Math.abs(e.rxLon) > 180) return null;
  if (e.kw < 0.001 || e.kw > 1000 || e.manchas < 0 || e.manchas > 300 || e.ruido < 100 || e.ruido > 180 || e.umbral < 0 || e.umbral > 99) return null;
  const frecs = Array.from({ length: 11 }, (_, i) => f(i < e.khz.length ? e.khz[i] / 1000 : 0, 5, 2)).join('');
  return [
    'LINEMAX      55',
    'COEFFS    CCIR',
    'TIME          1   24    1    1',
    `MONTH     ${String(e.anio).padStart(5, ' ')}${f(e.mes, 6, 2)}`,
    `SUNSPOT   ${f(e.manchas, 4, 0)}.`,
    'LABEL     TRANSMITTER         RECEIVER',
    `CIRCUIT   ${f(Math.abs(e.txLat), 5, 2)}${e.txLat < 0 ? 'S' : 'N'}${f(Math.abs(e.txLon), 9, 2)}${e.txLon < 0 ? 'W' : 'E'}${f(Math.abs(e.rxLat), 9, 2)}${e.rxLat < 0 ? 'S' : 'N'}${f(Math.abs(e.rxLon), 9, 2)}${e.rxLon < 0 ? 'W' : 'E'}  S     0`,
    `SYSTEM       1.${f(e.ruido, 4, 0)}. 3.00  90.${f(e.umbral, 5, 1)} 3.00 0.10`,
    'FPROB      1.00 1.00 1.00 0.00',
    `ANTENNA       1    1    2   30     0.000[default/isotrope     ]  0.0${f(e.kw, 10, 4)}`,
    'ANTENNA       2    2    2   30     0.000[default/swwhip.voa   ]  0.0    0.0000',
    `FREQUENCY ${frecs}`,
    'METHOD       30    0',
    'EXECUTE',
    'QUIT',
    '',
  ].join('\n');
}

export interface SalidaVoacap {
  horas: number;
  /** [frecuencia][hora UTC]: parte de los días del mes (0..1) en que se alcanza el umbral. */
  fiabilidad: Array<Array<number | null>>;
  /** [frecuencia][hora UTC]: señal sobre ruido mediana, dB en 1 Hz. */
  senal: Array<Array<number | null>>;
}

/** Lee la salida del programa (método 30): la hora ocupa seis columnas y cada valor cinco; el nombre de la fila va al final. */
export function leerSalidaVoacap(texto: string, nFrecs: number): SalidaVoacap {
  const vacia = () => Array.from({ length: nFrecs }, () => Array<number | null>(24).fill(null));
  const s: SalidaVoacap = { horas: 0, fiabilidad: vacia(), senal: vacia() };
  let hora = -1;
  const valor = (linea: string, k: number): number | null => {
    const celda = linea.slice(6 + 5 * k, 11 + 5 * k).trim();
    return celda && Number.isFinite(Number(celda)) ? Number(celda) : null;
  };
  for (const linea of texto.split('\n')) {
    const nombre = linea.slice(66).trim();
    if (nombre === 'FREQ') {
      const h = Math.round(Number(linea.slice(0, 6)));
      if (h >= 1 && h <= 24) { hora = h % 24; s.horas++; } else hora = -1;
    } else if (hora >= 0 && (nombre === 'REL' || nombre === 'SNR')) {
      for (let i = 0; i < nFrecs; i++) (nombre === 'REL' ? s.fiabilidad : s.senal)[i][hora] = valor(linea, i + 1);
    }
  }
  return s;
}

const PROGRAMAS = ['/usr/local/bin/voacapl', '/usr/bin/voacapl'];
export const programaVoacap = (): string | null => PROGRAMAS.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) ?? null;

/** ¿Están el programa y su carpeta de datos (itshfbc, con «run» escribible)? */
export function voacapDisponible(dir: string): boolean {
  try { fs.accessSync(path.join(dir, 'run'), fs.constants.W_OK); return programaVoacap() !== null; } catch { return false; }
}

let turno = 0;
/** Ejecuta una predicción. Rechaza con un motivo en claro. Sin intérprete de órdenes: programa, carpeta y dos nombres de archivo. */
export function ejecutarVoacap(dir: string, e: EntradaVoacap): Promise<SalidaVoacap> {
  return new Promise((resolve, reject) => {
    const prog = programaVoacap();
    const texto = entradaVoacap(e);
    if (!prog || !voacapDisponible(dir)) return reject(new Error('VOACAP no está instalado en este equipo'));
    if (!texto) return reject(new Error('VOACAP vale de 2 a 30 MHz y de 1 W a 1000 kW'));
    const n = ++turno % 8;
    const entrada = `satin${n}.dat`, salida = `satout${n}.out`;
    try {
      fs.writeFileSync(path.join(dir, 'run', entrada), texto);
      fs.rmSync(path.join(dir, 'run', salida), { force: true });
    } catch { return reject(new Error('no se puede escribir en la carpeta de VOACAP')); }
    execFile(prog, ['-s', dir, entrada, salida], { timeout: 20_000 }, () => {
      try {
        const s = leerSalidaVoacap(fs.readFileSync(path.join(dir, 'run', salida), 'utf8'), e.khz.length);
        if (s.horas !== 24) return reject(new Error('VOACAP no dio resultado'));
        resolve(s);
      } catch { reject(new Error('VOACAP no dio resultado')); }
    });
  });
}

/**
 * Número de manchas solares para VOACAP a partir de los índices solares diarios del SWPC (daily-solar-indices.txt:
 * año mes día flujo manchas…): la media de los días que trae el archivo (unos 30), más estable que el valor de un día.
 * Si no hay número de manchas, se estima con el flujo de 10,7 cm: (flujo − 64) × 0,9. Lo mismo hace Wefax
 * (tools/actualizar-manchas.sh). No es el suavizado de 12 meses, sino la media observada del último mes.
 */
export function manchasParaVoacap(texto: string): { manchas: number; dias: number; hasta: string; de: 'manchas' | 'flujo' } | null {
  let s = 0, n = 0, f = 0, m = 0, hasta = '';
  for (const linea of String(texto ?? '').split('\n')) {
    const p = linea.trim().split(/\s+/);
    if (p.length < 5 || !/^\d{4}$/.test(p[0])) continue;
    hasta = `${p[0]}-${p[1]}-${p[2]}`;
    if (/^\d+$/.test(p[4]) && Number(p[4]) <= 400) { s += Number(p[4]); n++; }
    if (/^\d+$/.test(p[3]) && Number(p[3]) >= 50 && Number(p[3]) <= 500) { f += Number(p[3]); m++; }
  }
  if (n >= 5) return { manchas: Math.min(300, Math.round(s / n)), dias: n, hasta, de: 'manchas' };
  if (m >= 5) return { manchas: Math.min(300, Math.max(0, Math.round((f / m - 64) * 0.9))), dias: m, hasta, de: 'flujo' };
  return null;
}
