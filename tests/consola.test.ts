// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { AYUDA, frecuenciaHz, leerOrden, pideConfirmacion, textoAyuda } from '../server/radio/consola';

test('consola: lectura de órdenes', () => {
  assert.deepEqual(leerOrden('  ROT pos 123 45 '), { modulo: 'rot', accion: 'pos', args: ['123', '45'], resto: '123 45' });
  assert.deepEqual(leerOrden('aprs msg EA7KZ-9 Voy para R2,  10 min'), { modulo: 'aprs', accion: 'msg', args: ['EA7KZ-9', 'Voy', 'para', 'R2,', '10', 'min'], resto: 'EA7KZ-9 Voy para R2,  10 min' });
  assert.equal(leerOrden('dx sh/dx 10 on 20m')!.resto, '10 on 20m');
  assert.equal(leerOrden('dx sh/dx 10 on 20m')!.accion, 'sh/dx');
  assert.equal(leerOrden('   '), null);
  assert.equal(leerOrden('help')!.accion, '');
});

test('consola: frecuencias escritas a mano', () => {
  assert.equal(frecuenciaHz('14205'), 14_205_000);
  assert.equal(frecuenciaHz('14.205'), 14_205_000);
  assert.equal(frecuenciaHz('145,825'), 145_825_000);
  assert.equal(frecuenciaHz('145825'), 145_825_000);
  assert.equal(frecuenciaHz('14205000'), 14_205_000);
  assert.equal(frecuenciaHz('7049.5'), 7_049_500_000); // con punto son MHz: lo rechaza el rango del equipo
  assert.equal(frecuenciaHz('abc'), null);
});

test('consola: confirmación y ayuda', () => {
  assert.equal(pideConfirmacion(leerOrden('cat ptt on')!), true);
  assert.equal(pideConfirmacion(leerOrden('cat ptt off')!), false);
  assert.equal(pideConfirmacion(leerOrden('eai EA7KZ-9 ABCD')!), true);
  assert.equal(pideConfirmacion(leerOrden('eai EA7KZ-9 ABCD stop')!), false);
  assert.equal(pideConfirmacion(leerOrden('rot pos 120')!), false);
  assert.match(textoAyuda()[0], /cat, rot, dx/);
  assert.equal(textoAyuda('rot').length, AYUDA.rot.ordenes.length + 1);
  assert.equal(textoAyuda('nada').length, 2);
});
