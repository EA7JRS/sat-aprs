// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { esDeNoche, resolverTema, temaGuardado } from '../src/utils/tema';

const almacen = (datos: Record<string, string>) => ({ getItem: (k: string) => datos[k] ?? null });

test('tema: automático sigue al sol y sistema al sistema operativo', () => {
  assert.equal(resolverTema('auto', { esNoche: false, sistemaOscuro: true }), 'claro');
  assert.equal(resolverTema('auto', { esNoche: true, sistemaOscuro: false }), 'oscuro');
  assert.equal(resolverTema('sistema', { esNoche: true, sistemaOscuro: false }), 'claro');
  assert.equal(resolverTema('sistema', { esNoche: false, sistemaOscuro: true }), 'oscuro');
  for (const t of ['claro', 'oscuro', 'tactico'] as const) {
    assert.equal(resolverTema(t, { esNoche: true, sistemaOscuro: true }), t);
  }
});

test('tema: automático por defecto y herencia de los modos antiguos', () => {
  assert.equal(temaGuardado(almacen({})), 'auto');
  assert.equal(temaGuardado(almacen({ sat_tema: 'tactico' })), 'tactico');
  assert.equal(temaGuardado(almacen({ sat_tema: 'otro' })), 'auto');
  assert.equal(temaGuardado(almacen({ nightModeAuto: 'false', dayMode: 'true' })), 'claro');
  assert.equal(temaGuardado(almacen({ nightModeAuto: 'false', nightMode: 'true' })), 'tactico');
  assert.equal(temaGuardado(almacen({ nightModeAuto: 'false' })), 'oscuro');
  assert.equal(temaGuardado(almacen({ nightModeAuto: 'true', dayMode: 'true' })), 'auto');
});

test('tema: noche por horario fijo, también cruzando la medianoche', () => {
  const o = { lat: 37.4, lon: -6, solar: false, horaInicio: 20, horaFin: 8 };
  assert.equal(esDeNoche(o, new Date(2026, 10, 14, 23, 0)), true);
  assert.equal(esDeNoche(o, new Date(2026, 10, 14, 3, 0)), true);
  assert.equal(esDeNoche(o, new Date(2026, 10, 14, 12, 0)), false);
  assert.equal(esDeNoche({ ...o, horaInicio: 1, horaFin: 5 }, new Date(2026, 10, 14, 3, 0)), true);
});
