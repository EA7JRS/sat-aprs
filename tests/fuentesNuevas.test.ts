// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventosMeteoAlarm, fenomeno, leerFeedMeteoAlarm, zonasSeguidas } from '../server/fuentes/meteoalarm';
import { categoria, eventosCiclones } from '../server/fuentes/ciclones';
import { eventosRadiacion, leerEurdep, sondasCercanas } from '../server/fuentes/radiacion';
import { boletinAprs, objetoAprs } from '../server/core/aprsAvisos';
import { evaluar } from '../server/core/reglas';

const EST = { lat: 37.3891, lon: -5.9845 };
const AHORA = Date.parse('2026-11-04T20:00:00Z');

// Dos entradas reales del feed de España (4-11-2026), recortadas, y una cancelación inventada a partir de ellas
const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
  <entry>
    <cap:geocode><valueName>EMMA_ID</valueName><value>ES084</value></cap:geocode>
    <cap:areaDesc>Costa granadina</cap:areaDesc>
    <cap:event>Moderate rain warning</cap:event>
    <cap:expires>2026-11-05T06:59:59+00:00</cap:expires>
    <cap:effective>2026-11-04T17:12:24+00:00</cap:effective>
    <cap:onset>2026-11-04T23:00:00+00:00</cap:onset>
    <cap:severity>Moderate</cap:severity>
    <cap:message_type>Alert</cap:message_type>
    <cap:status>Actual</cap:status>
    <cap:identifier>2.49.0.0.724.0.ES.261104171408.611804PRP1050712448</cap:identifier>
  </entry><entry>
    <cap:geocode><valueName>EMMA_ID</valueName><value>ES072</value></cap:geocode>
    <cap:areaDesc>Poniente y Almer&#237;a Capital</cap:areaDesc>
    <cap:event>Severe thunderstorm warning</cap:event>
    <cap:expires>2026-11-05T06:59:59+00:00</cap:expires>
    <cap:onset>2026-11-04T17:00:00+00:00</cap:onset>
    <cap:severity>Severe</cap:severity>
    <cap:message_type>Update</cap:message_type>
    <cap:status>Actual</cap:status>
    <cap:identifier>2.49.0.0.724.0.ES.261104171408.610403PRP1050712448</cap:identifier>
  </entry><entry>
    <cap:geocode><valueName>EMMA_ID</valueName><value>ES613</value></cap:geocode>
    <cap:areaDesc>Campiña sevillana</cap:areaDesc>
    <cap:event>Moderate wind warning</cap:event>
    <cap:expires>2026-11-05T06:59:59+00:00</cap:expires>
    <cap:onset>2026-11-04T17:00:00+00:00</cap:onset>
    <cap:severity>Moderate</cap:severity>
    <cap:message_type>Cancel</cap:message_type>
    <cap:status>Actual</cap:status>
  </entry>
</feed>`;

test('MeteoAlarm: lee el feed Atom y solo avisa de las zonas seguidas', () => {
  const avisos = leerFeedMeteoAlarm(ATOM, 'spain');
  assert.equal(avisos.length, 3);
  assert.equal(avisos[1].nombreZona, 'Poniente y Almería Capital');
  assert.equal(avisos[1].gravedad, 'naranja');
  assert.equal(fenomeno('Moderate rain warning'), 'lluvia');
  assert.equal(fenomeno('Severe thunderstorm warning'), 'tormentas');
  const z = zonasSeguidas('ES084, almería; Campiña');
  assert.deepEqual([...z.codigos], ['ES084']);
  const ev = eventosMeteoAlarm(avisos, 'ES084, almería, Campiña', EST, AHORA);
  assert.deepEqual(ev.map((e) => `${e.detalle} ${e.titulo}`), ['AMARILLO Lluvia Costa granadina', 'NARANJA Tormentas Poniente y Almería Capital']);   // la cancelación no
  assert.equal(ev[0].inicio, Date.parse('2026-11-04T23:00:00Z'));
  assert.equal(ev[0].lat, EST.lat);
  assert.deepEqual(ev.map((e) => e.nombre), ['ES084LL', 'ES072TO']);
  assert.ok(objetoAprs('EA7JRS-13', ev[1], AHORA)!.includes('NARANJA Tormentas Poniente'));
  assert.ok(boletinAprs('EA7JRS-13', ev[1]).split('::')[1].length <= 10 + 67);
  // Con AEMET activado, las zonas españolas no se duplican
  assert.deepEqual(eventosMeteoAlarm(avisos, 'ES084', EST, AHORA, true), []);
  assert.deepEqual(eventosMeteoAlarm(avisos, '', EST, AHORA), []);
});

test('NHC: un evento por ciclón, en su centro, con la gravedad de su clase', () => {
  const j = { activeStorms: [
    { id: 'al132026', binNumber: 'AT3', name: 'Ophelia', classification: 'HU', intensity: '85', pressure: '975', latitudeNumeric: 38.5, longitudeNumeric: -15.2, movementDir: 45, movementSpeed: 25, lastUpdate: '2026-11-04T15:00:00.000Z' },
    { id: 'al142026', name: 'Fourteen', classification: 'TD', intensity: 30, pressure: 1007, latitude: '15.1N', longitude: '45.3W', lastUpdate: '2026-11-04T15:00:00.000Z' },
    { id: 'x', classification: 'TS' },
  ] };
  const ev = eventosCiclones(j, AHORA);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].titulo, 'OPHELIA 975hPa');
  assert.equal(ev[0].detalle, 'Huracan cat.2 85kn');
  assert.equal(ev[0].datos!.kmh, 40);
  assert.ok(objetoAprs('EA7JRS-13', ev[0], AHORA)!.endsWith('Huracan cat.2 85kn OPHELIA 975hPa'));
  assert.ok(boletinAprs('EA7JRS-13', ev[0], 817).endsWith(':EMERGENCIA HURACAN Huracan cat.2 85kn OPHELIA 975hPa a 817km (NHC)'));
  assert.equal(ev[0].gravedad, 'rojo');
  assert.equal(ev[0].nombre, 'HUOPHELIA');
  assert.equal(ev[1].lon, -45.3);
  assert.equal(ev[1].gravedad, 'amarillo');
  assert.equal(categoria(64), 1);
  assert.equal(categoria(140), 5);
  // A 1000 km se avisa del que está a ~850 km; no del de mitad del Atlántico
  const pol = { radioKm: 1000, gravedadMinima: 'amarillo' as const, vigenciaMs: 9 * 3600_000, repetirCadaMs: 3 * 3600_000, boletin: true };
  assert.equal(evaluar(ev[0], pol, EST, AHORA).emitir, true);
  assert.equal(evaluar(ev[1], pol, EST, AHORA).emitir, false);
  assert.deepEqual(eventosCiclones({ activeStorms: [] }), []);
});

test('EURDEP: la medida más corta de cada sonda y aviso por encima del umbral', () => {
  const f = (id: string, name: string, lon: number, lat: number, value: number, h: number, end: string, unit = 'µSv/h') =>
    ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id, name, value, unit, analyzed_range_in_h: h, end_measure: end, validated: 0 } });
  const sondas = leerEurdep({ features: [
    f('ES0012', 'Sevilla', -5.98, 37.39, 0.11, 24, '2026-11-04T00:00:00Z'),
    f('ES0012', 'Sevilla', -5.98, 37.39, 0.12, 1, '2026-11-04T19:00:00Z'),
    f('ES0040', 'Huelva', -6.95, 37.26, 450, 1, '2026-11-04T19:00:00Z', 'nSv/h'),
    f('ES0099', 'Vieja', -6.0, 37.5, 9, 1, '2026-11-03T00:00:00Z'),
    f('PT0001', 'Mal', 0, 0, NaN, 1, '2026-11-04T19:00:00Z'),
  ] });
  assert.equal(sondas.length, 3);
  assert.equal(sondas.find((s) => s.id === 'ES0012')!.valor, 0.12);
  assert.equal(sondas.find((s) => s.id === 'ES0040')!.valor, 0.45);
  assert.equal(sondasCercanas(sondas, EST, 1)[0].id, 'ES0012');
  const ev = eventosRadiacion(sondas, 0.3, AHORA);
  assert.deepEqual(ev.map((e) => `${e.detalle} ${e.titulo}`), ['0.45uSv/h Huelva sin validar']);   // la vieja (más de 12 h) no
  assert.equal(ev[0].gravedad, 'amarillo');
  assert.equal(ev[0].nombre, 'RADES0040');
  assert.equal(eventosRadiacion(sondas, 0.1, AHORA).find((e) => e.titulo.startsWith('Huelva'))!.gravedad, 'naranja');
  assert.ok(objetoAprs('EA7JRS-13', ev[0], AHORA)!.includes(';RADES0040*'));
});
