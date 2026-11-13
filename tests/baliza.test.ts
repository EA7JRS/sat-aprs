// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { balizaPosicion, infoBaliza, extensionPhg, validarPerfil, intervaloBalizaMs, posicionValida } from '../server/estacion/baliza';
import { decideTransmission, aprsPasscode, parseTnc2 } from '../server/aprs';

const perfil = {
  callsign: 'EA7ZZZ-10',
  lat: 37.3891,
  lon: -5.9845,
  symbolTable: '/',
  symbolCode: '-',
  phg: { power: 5, height: 3, gain: 3, directivity: 0 },
  comment: '📡 Estación de avisos · Sevilla',
};

test('baliza: posición, símbolo, PHG y comentario en ASCII', () => {
  assert.equal(infoBaliza(perfil), '!3723.35N/00559.07W-PHG5330Estacion de avisos Sevilla');
  assert.equal(balizaPosicion(perfil), 'EA7ZZZ-10>APZSAT,TCPIP*:!3723.35N/00559.07W-PHG5330Estacion de avisos Sevilla');
});

test('baliza: el comentario se recorta a 36 con PHG y a 43 sin PHG', () => {
  const largo = 'x'.repeat(80);
  assert.equal(infoBaliza({ ...perfil, comment: largo }).length, 1 + 8 + 1 + 9 + 1 + 7 + 36);
  assert.equal(infoBaliza({ ...perfil, phg: null, comment: largo }).length, 1 + 8 + 1 + 9 + 1 + 43);
});

test('baliza: PHG no válido se omite', () => {
  assert.equal(extensionPhg({ power: 12, height: 3, gain: 3, directivity: 0 }), '');
  assert.equal(extensionPhg(null), '');
  assert.equal(extensionPhg({ power: 0, height: 0, gain: 0, directivity: 0 }), 'PHG0000');
});

test('baliza: no se genera con indicativo de plantilla ni sin posición', () => {
  assert.equal(balizaPosicion({ ...perfil, callsign: 'N0CALL' }), null);
  assert.equal(balizaPosicion({ ...perfil, lat: 0, lon: 0 }), null);
  assert.equal(balizaPosicion({ ...perfil, lat: 95 }), null);
  assert.equal(balizaPosicion({ ...perfil, symbolCode: 'ab' }), null);
  assert.deepEqual(validarPerfil(perfil), []);
  assert.equal(posicionValida(NaN, 1), false);
});

test('baliza: intervalo con mínimo de 5 minutos', () => {
  assert.equal(intervaloBalizaMs(30), 30 * 60000);
  assert.equal(intervaloBalizaMs(1), 5 * 60000);
  assert.equal(intervaloBalizaMs(undefined), 30 * 60000);
});

test('baliza: pasa la política de emisión solo con TX activado', () => {
  const trama = balizaPosicion(perfil)!;
  assert.ok(parseTnc2(trama));
  const ctx = { callsign: perfil.callsign, passcode: aprsPasscode(perfil.callsign) };
  assert.equal(decideTransmission(trama, { ...ctx, txEnabled: false }).rf, false);
  const ok = decideTransmission(trama, { ...ctx, txEnabled: true });
  assert.equal(ok.rf && ok.aprsIs, true);
});
