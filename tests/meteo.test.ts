// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { datosMeteoAprs, elegirObservacion, intervaloMeteoMs, leerFilaWeewx, leerWxnow, parteMeteoAprs, validarParte, Observacion } from '../server/estacion/meteo';
import { decideTransmission, aprsPasscode } from '../server/aprs';
import { leerPosicionAprs } from '../server/aprsPosicion';

const T = Date.parse('2026-11-14T12:40:00Z');
const estacion = { callsign: 'EA7ZZZ-13', lat: 37.3891, lon: -5.9845 };
const obs: Observacion = { cuando: T, fuente: 'WeeWX', propia: true, tempC: 18.2, humedadPct: 62, presionHpa: 1016.0, vientoKmh: 12, rachaKmh: 20, dirGrados: 225, lluvia1hMm: 0, lluvia24hMm: 2.54, lluviaHoyMm: 1.27 };
const cerca = (a: number | undefined, b: number, tol: number) => assert.ok(a !== undefined && Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('parte meteorológico: formato APRS completo', () => {
  // 12 km/h = 7 mph; 20 km/h = 12 mph; 18,2 °C = 65 °F; 2,54 mm = 0,10"; 1,27 mm = 0,05"
  assert.equal(datosMeteoAprs(obs), '225/007g012t065r000p010P005h62b10160');
  assert.equal(parteMeteoAprs(estacion, obs, T + 60_000), 'EA7ZZZ-13>APZSAT,TCPIP*:@141240z3723.35N/00559.07W_225/007g012t065r000p010P005h62b10160');
});

test('parte meteorológico: lo que falta va con puntos, nunca inventado', () => {
  assert.equal(datosMeteoAprs({ cuando: T, fuente: 'x', propia: true, tempC: -20 }), '.../...g...t-04');
  assert.equal(datosMeteoAprs({ cuando: T, fuente: 'x', propia: true, tempC: 0, humedadPct: 100, vientoKmh: 0, dirGrados: 0 }), '360/000g...t032h00');
  // Viento sin dirección conocida
  assert.equal(datosMeteoAprs({ cuando: T, fuente: 'x', propia: true, vientoKmh: 16.1 }), '.../010g...t...');
  // Presión absurda: se omite
  assert.equal(datosMeteoAprs({ cuando: T, fuente: 'x', propia: true, tempC: 10, presionHpa: 0 }), '.../...g...t050');
});

test('parte meteorológico: los datos de Internet se identifican', () => {
  const p = parteMeteoAprs(estacion, { ...obs, propia: false, fuente: 'OWM' }, T)!;
  assert.match(p, /b10160 OWM$/);
});

test('parte meteorológico: cuándo no se emite', () => {
  assert.deepEqual(validarParte(estacion, obs, T), []);
  assert.equal(parteMeteoAprs(estacion, obs, T + 31 * 60_000), null);                 // dato viejo
  assert.equal(parteMeteoAprs(estacion, null, T), null);                               // sin datos
  assert.equal(parteMeteoAprs(estacion, { cuando: T, fuente: 'x', propia: true }, T), null);
  assert.equal(parteMeteoAprs({ ...estacion, callsign: 'N0CALL' }, obs, T), null);
  assert.equal(parteMeteoAprs({ ...estacion, lat: 0, lon: 0 }, obs, T), null);
  assert.equal(parteMeteoAprs(estacion, { ...obs, cuando: T + 3600_000 }, T), null);   // reloj mal
});

test('parte meteorológico: pasa la política de emisión y se lee como posición', () => {
  const trama = parteMeteoAprs(estacion, obs, T)!;
  const d = decideTransmission(trama, { txEnabled: true, callsign: 'EA7ZZZ-13', passcode: aprsPasscode('EA7ZZZ') });
  assert.equal(d.rf && d.aprsIs, true);
  const p = leerPosicionAprs(d.packet!.source, d.packet!.destination, d.packet!.info)!;
  assert.equal(p.simbolo, '/_');
  cerca(p.lat, 37.3892, 0.001);
});

test('elección de la observación', () => {
  const propia = { ...obs };
  const net = { ...obs, propia: false, fuente: 'OWM' };
  const vieja = { ...obs, cuando: T - 3600_000 };
  assert.equal(elegirObservacion('auto', propia, net, T)!.fuente, 'WeeWX');
  assert.equal(elegirObservacion('auto', vieja, net, T)!.fuente, 'OWM');
  assert.equal(elegirObservacion('auto', null, net, T)!.fuente, 'OWM');
  assert.equal(elegirObservacion('propia', vieja, net, T)!.cuando, T - 3600_000);
  assert.equal(elegirObservacion('internet', propia, null, T), null);
  assert.equal(intervaloMeteoMs(1), 5 * 60_000);
  assert.equal(intervaloMeteoMs(undefined), 10 * 60_000);
});

test('WeeWX: fila en unidades de EE. UU., métricas y métricas WX', () => {
  const us = leerFilaWeewx('1794660000|1|64.76|62.0|30.003|7.456|12.43|225.0|0.0|0.0|0.1')!;
  assert.equal(us.cuando, 1794660000000);
  cerca(us.tempC, 18.2, 0.01); cerca(us.presionHpa, 1016.0, 0.1); cerca(us.vientoKmh, 12, 0.01); cerca(us.lluvia24hMm, 2.54, 0.001);
  assert.equal(us.propia, true);
  const metrico = leerFilaWeewx('1794660000|16|18.2|62.0|1016.0|12.0|20.0|225.0|0.0|0.0|0.254')!;
  cerca(metrico.tempC, 18.2, 0.001); cerca(metrico.vientoKmh, 12, 0.001); cerca(metrico.lluvia24hMm, 2.54, 0.001); // cm → mm
  const wx = leerFilaWeewx('1794660000|17|18.2|62.0|1016.0|3.3333|5.5556|225.0|0.0|0.0|2.54')!;
  cerca(wx.vientoKmh, 12, 0.001); cerca(wx.rachaKmh, 20, 0.001); cerca(wx.lluvia24hMm, 2.54, 0.001);
  // Sensores sin dato (NULL) y filas que no valen
  const huecos = leerFilaWeewx('1794660000|16|18.2||1016.0|||||| ')!;
  assert.deepEqual([huecos.humedadPct, huecos.vientoKmh, huecos.dirGrados], [undefined, undefined, undefined]);
  assert.equal(leerFilaWeewx(''), null);
  assert.equal(leerFilaWeewx('1794660000|99|1|2|3|4|5|6|7|8|9'), null);
});

test('wxnow.txt: se lee y vuelve a dar los mismos datos', () => {
  const o = leerWxnow('Nov 14 2026 12:40\n225/007g012t065r000p010P005h62b10160\n', T)!;
  cerca(o.tempC, 18.33, 0.01); cerca(o.vientoKmh, 11.27, 0.01);
  assert.equal(o.humedadPct, 62);
  assert.equal(datosMeteoAprs(o), '225/007g012t065r000p010P005h62b10160');
  const parcial = leerWxnow('fecha\n.../...g...t050h00\n', T)!;
  assert.deepEqual([parcial.vientoKmh, parcial.humedadPct], [undefined, 100]);
  cerca(parcial.tempC, 10, 0.001);
  assert.equal(leerWxnow('sin datos', T), null);
});
