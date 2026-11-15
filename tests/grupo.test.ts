// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { Grupo, coincide, leerIndicativos, mensajeEai, normalizarAjustes } from '../server/radio/grupo';

test('grupo: lista de indicativos y coincidencias, como en el tracker', () => {
  assert.deepEqual(leerIndicativos('ea7kz-9, EA7URS; eb7qq-7 x EA7KZ-9 a1 ea7aa ea7bb ea7cc'), ['EA7KZ-9', 'EA7URS', 'EB7QQ-7', 'EA7AA', 'EA7BB']);
  assert.equal(coincide({ indicativo: 'EA7URS', exacto: false }, 'EA7URS-3'), true);
  assert.equal(coincide({ indicativo: 'EA7URS', exacto: false }, 'EA7URSX'), false);
  assert.equal(coincide({ indicativo: 'EA7KZ-9', exacto: true }, 'EA7KZ-7'), false);
  assert.equal(coincide({ indicativo: 'EA7KZ-9', exacto: true }, 'ea7kz-9'), true);
  assert.deepEqual(normalizarAjustes({ minutos: 0, maxKm: 900, sondeoS: 30 }), { indicativos: '', minutos: 1, maxKm: 500, sondeoS: 60 });
  assert.equal(normalizarAjustes({ sondeoS: 0 }).sondeoS, 0);
});

test('grupo: en alcance, fuera y sondeo', () => {
  const g = new Grupo();
  const t0 = 1_000_000;
  const casa = { lat: 37.39, lon: -5.99 };
  g.ajustar({ indicativos: 'EA7KZ-9, EA7URS', minutos: 10, maxKm: 50, sondeoS: 120 }, t0);
  // Al arrancar nadie está perdido todavía
  assert.deepEqual(g.revisar(casa, t0 + 1000), []);
  assert.deepEqual(g.miembros.map((m) => m.estado), ['desconocido', 'desconocido']);
  // Oída por radio: dentro
  g.oida('EA7KZ-9', 'RF', { lat: 37.5, lon: -5.9 }, t0 + 2000);
  let c = g.revisar(casa, t0 + 3000);
  assert.deepEqual(c.map((x) => `${x.indicativo}:${x.estado}`), ['EA7KZ-9:dentro']);
  // Por APRS-IS no cuenta como alcance de radio
  g.oida('EA7URS-3', 'IS', null, t0 + 4000);
  assert.equal(g.miembros[1].oidoIs, t0 + 4000);
  assert.equal(g.miembros[1].oidoRf, null);
  // Pasado el plazo desde el arranque, el que no se ha oído por radio: fuera
  c = g.revisar(casa, t0 + 10 * 60_000 + 1001);
  assert.deepEqual(c.map((x) => `${x.indicativo}:${x.estado}`), ['EA7URS:fuera']);
  // Se aleja más de 50 km: fuera aunque se oiga
  g.oida('EA7KZ-9', 'RF', { lat: 38.2, lon: -5.9 }, t0 + 11 * 60_000);
  c = g.revisar(casa, t0 + 11 * 60_000 + 1000);
  assert.equal(c[0].estado, 'fuera');
  assert.match(c[0].detalle, /más de 50/);
  // Sondeo: el primero solo arranca el reloj; luego, ping a quien no se oye
  const g2 = new Grupo();
  g2.ajustar({ indicativos: 'EA7KZ-9,EA7URS', sondeoS: 120 }, t0);
  assert.deepEqual(g2.sondeos(t0), []);
  g2.oida('EA7URS-3', 'RF', null, t0 + 100_000);
  assert.deepEqual(g2.sondeos(t0 + 60_000), []);
  assert.deepEqual(g2.sondeos(t0 + 120_000), ['EA7KZ-9']); // EA7URS se oyó hace menos del intervalo
  assert.deepEqual(g2.sondearTodos(t0 + 130_000), ['EA7KZ-9', 'EA7URS-3']); // al indicativo exacto oído
  // Cambiar la lista conserva lo sabido de quien sigue
  g2.ajustar({ indicativos: 'EA7URS, EB7QQ-7', sondeoS: 120 }, t0 + 140_000);
  assert.equal(g2.miembros[0].ultimo, 'EA7URS-3');
  assert.equal(g2.miembros[1].oidoRf, null);
  // Situación
  const s = g.situar(casa);
  assert.ok(s[0].km! > 80 && s[0].rumbo! >= 0);
  assert.equal(s[1].km, null);
});

test('EAI: mensaje de emergencia remota', () => {
  assert.deepEqual(mensajeEai(' abcd12 ', false), { ok: true, texto: 'EAI ABCD12' });
  assert.deepEqual(mensajeEai('ABCD12', true), { ok: true, texto: 'EAI STOP ABCD12' });
  assert.equal(mensajeEai('abc', false).ok, false);
  assert.equal(mensajeEai('con espacio', false).ok, false);
});
