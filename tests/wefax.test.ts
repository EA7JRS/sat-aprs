// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDAS_CIRCUITO_KHZ, horasBuenas, leerCartas, leerCircuito, rutaCircuito } from '../server/radio/wefax';

const fila = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));

test('la consulta de un circuito a Wefax', () => {
  assert.equal(rutaCircuito(35.33, 25.12, [14150, 7100], 0.1), '/api/voacap?lat=35.33&lon=25.12&khz=14150.0,7100.0&kw=0.100');
  assert.equal(rutaCircuito(35, 25, [518], 1), null);          // VOACAP empieza en 2 MHz
  assert.equal(rutaCircuito(95, 0, [7100], 1), null);
  assert.equal(rutaCircuito(0, 0, [], 1), null);
  assert.equal(rutaCircuito(0, 0, [7100], NaN), null);
  assert.ok(rutaCircuito(36.5, -6.3, BANDAS_CIRCUITO_KHZ, 0.1));
});

test('la respuesta de Wefax, tal como la da su servidor', () => {
  // forma real de /api/voacap (Wefax 0.3.0 con voacapl 16.1207W)
  const c = leerCircuito({ ok: true, year: 2026, month: 11, ssn: 80, lat: 36.53, lon: -6.29, noise: 145, snr: [fila(() => 52)], kw: 5, km: 2818.7, khz: [4209.5],
    rel: [fila((h) => (h >= 17 || h < 6 ? 0.9 : 0))] });
  assert.equal(c.ok, true);
  assert.equal(c.km, 2818.7);
  assert.equal(c.manchas, 80);
  assert.deepEqual(c.khz, [4209.5]);
  assert.equal(c.fiabilidad[0][20], 0.9);
  assert.equal(c.senal[0][3], 52);
  assert.equal(horasBuenas(c.fiabilidad[0]), '17-06');
});

test('cuando Wefax no puede predecir dice por qué', () => {
  assert.match(leerCircuito({ ok: false, why: 'no sunspot number' }).motivo, /manchas/);
  assert.match(leerCircuito({ ok: false, why: 'voacap not installed' }).motivo, /VOACAP no está instalado/);
  assert.equal(leerCircuito({ ok: false, why: 'algo\u0007raro' }).motivo, 'algo raro');
  assert.equal(leerCircuito(null).ok, false);
  assert.equal(leerCircuito({ ok: true, khz: [7100], rel: [[1, 2]] }).ok, false);   // sin las 24 horas no vale
});

test('horas buenas', () => {
  assert.equal(horasBuenas(fila((h) => ((h >= 7 && h <= 9) || h === 16 || h === 17 ? 0.8 : 0.1))), '07-10, 16-18');
  assert.equal(horasBuenas(fila(() => 1)), 'todo el día');
  assert.equal(horasBuenas(fila(() => 0)), '');
  assert.equal(horasBuenas([null, 0.9]), '01-02');
});

test('las cartas recibidas', () => {
  const l = leerCartas([{ id: 7, received: '2026-11-22T04:30:00Z', station: 'DDH', title: 'Surface Analysis', khz: 7880, height: 1200, ended: 'stop' },
    { id: 6, received: 'ayer', station: 'GYA', title: 'x\ny', khz: 8040, height: 300, ended: 'lost' }, { id: 'no' }, null]);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { id: 7, recibida: '2026-11-22T04:30:00Z', estacion: 'DDH', titulo: 'Surface Analysis', khz: 7880, lineas: 1200, completa: true });
  assert.equal(l[1].recibida, '');
  assert.equal(l[1].titulo, 'x y');
  assert.equal(l[1].completa, false);
  assert.deepEqual(leerCartas({}), []);
});
