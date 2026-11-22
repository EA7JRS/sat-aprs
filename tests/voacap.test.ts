// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { EntradaVoacap, ejecutarVoacap, entradaVoacap, leerSalidaVoacap, manchasParaVoacap, voacapDisponible } from '../server/radio/voacap';

const base: EntradaVoacap = { txLat: 53.67, txLon: 9.8, rxLat: 36.53, rxLon: -6.29, kw: 10, khz: [3855, 7880, 13882.5], anio: 2026, mes: 11, manchas: 80, ruido: 145, umbral: 40 };

test('el archivo de entrada de VOACAP, en sus columnas', () => {
  const t = entradaVoacap(base)!;
  // las mismas líneas que escribe Wefax y que voacapl 16.1207W acepta
  assert.ok(t.includes('CIRCUIT   53.67N     9.80E    36.53N     6.29W  S     0\n'));
  assert.ok(t.includes('MONTH      2026 11.00\n'));
  assert.ok(t.includes('SUNSPOT     80.\n'));
  assert.ok(t.includes('SYSTEM       1. 145. 3.00  90. 40.0 3.00 0.10\n'));
  assert.ok(t.includes(']  0.0   10.0000\n'));
  assert.match(t, /FREQUENCY  3\.8[56] 7\.8813\.88 0\.00/);
  assert.ok(entradaVoacap({ ...base, txLat: -33, txLon: -71.6 })!.includes('CIRCUIT   33.00S    71.60W'));
});

test('lo que VOACAP no puede calcular se rechaza', () => {
  assert.equal(entradaVoacap({ ...base, khz: [518] }), null);        // onda media
  assert.equal(entradaVoacap({ ...base, manchas: 400 }), null);
  assert.equal(entradaVoacap({ ...base, khz: [] }), null);
  assert.equal(entradaVoacap({ ...base, rxLat: NaN }), null);
  assert.equal(entradaVoacap({ ...base, mes: 13 }), null);
});

test('lectura de una salida real de voacapl', () => {
  // principio de una salida real (Pinneberg a Cádiz, noviembre de 2026, 80 manchas): las horas 01 y 02 UTC
  const s = leerSalidaVoacap(fs.readFileSync(path.join('tests', 'datos', 'voacap_muestra.out'), 'utf8'), 3);
  assert.equal(s.horas, 2);
  assert.deepEqual([s.fiabilidad[0][1], s.fiabilidad[1][1], s.fiabilidad[2][1]], [0.98, 0.99, 0.56]);
  assert.equal(s.senal[0][1], 60);          // la fila SNR, no las SNR LW ni SNR UP
  assert.equal(s.senal[2][2], 21);
  assert.equal(s.fiabilidad[2][2], 0.17);
  assert.equal(s.fiabilidad[0][5], null);   // lo que no está en la salida queda sin dato
});

test('sin el programa no hay predicción propia', async () => {
  assert.equal(voacapDisponible('/no/existe'), false);
  await assert.rejects(ejecutarVoacap('/no/existe', base), /no está instalado/);
});

test('el número de manchas para VOACAP: la media de los días del archivo de la NOAA', () => {
  // archivo de muestra con la forma de daily-solar-indices.txt (cifras inventadas para la prueba)
  const cab = ':Product: Daily Solar Data\n#  Date   10.7cm  Number\n#----\n';
  const dias = [[150, 90], [155, 80], [148, 70], [152, 85], [149, 75]];
  const texto = cab + dias.map(([f, s], i) => `2026 11 ${18 + i}  ${f}     ${s}      500      1    -999      *   3  0`).join('\n');
  assert.deepEqual(manchasParaVoacap(texto), { manchas: 80, dias: 5, hasta: '2026-11-22', de: 'manchas' });
  // sin número de manchas, por el flujo: (150,8 − 64) × 0,9 = 78
  const sinManchas = cab + dias.map(([f], i) => `2026 11 ${18 + i}  ${f}     -1      500`).join('\n');
  assert.deepEqual(manchasParaVoacap(sinManchas), { manchas: 78, dias: 5, hasta: '2026-11-22', de: 'flujo' });
  assert.equal(manchasParaVoacap(cab + '2026 11 22  150  90  500  1'), null);    // con menos de cinco días no hay media
  assert.equal(manchasParaVoacap('no es el archivo'), null);
});
