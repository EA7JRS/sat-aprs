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

import { eventosTsunami, leerFeedTsunami } from '../server/fuentes/tsunami';
import { eventosNws } from '../server/fuentes/nws';
import { eventosEonet } from '../server/fuentes/eonet';

// Las mismas muestras que las pruebas de la app Android (core/SelfTest.kt)
test('tsunami.gov: la categoría la da el centro de alerta, no la magnitud', () => {
  const entrada = '<entry><title>BONIN ISLANDS  JAPAN REGION</title><updated>2026-10-25T02:27:01Z</updated><geo:lat>28.</geo:lat><geo:long>139.9</geo:long>' +
    '<summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><strong>Category:</strong> Information<br/><strong>Bulletin Issue Time: </strong> 2026.10.25 02:27:01 UTC <br/>' +
    '<strong>Preliminary Magnitude: </strong>7.0(Mwp)<br/><strong>Lat/Lon: </strong>28. / 139.9<br/><strong>Affected Region: </strong>BONIN ISLANDS  JAPAN REGION<br/></div></summary>' +
    '<id>urn:uuid:ba64bc82</id></entry>';
  const [m] = leerFeedTsunami(`<feed>${entrada}</feed>`);
  assert.equal(m.categoria, 'Information');
  assert.equal(m.gravedad, 'info');
  assert.equal(m.magnitud, '7.0(Mwp)');
  assert.equal(m.emitido, Date.UTC(2026, 9, 25, 2, 27, 1));
  assert.equal(m.lat, 28);
  const alerta = leerFeedTsunami(`<feed>${entrada.replace('Information', 'Warning')}</feed>`);
  const [e] = eventosTsunami(alerta, m.emitido + 3600_000);
  assert.equal(e.gravedad, 'rojo');
  assert.equal(e.detalle, 'Alerta de tsunami M7.0');
  assert.equal(e.titulo, 'BONIN ISLANDS JAPAN REGION');
  assert.ok(objetoAprs('EA7JRS-13', e, m.emitido)!.includes('Alerta de tsunami M7.0'));
  assert.deepEqual(eventosTsunami(alerta, m.emitido + 25 * 3600_000), []);   // pasadas 24 h
  assert.deepEqual(eventosTsunami(leerFeedTsunami(`<feed>${entrada.replace('Information', 'Warning Cancellation')}</feed>`), m.emitido), []);
});

test('NWS: avisos en vigor para el punto, con el tipo por el nombre del aviso', () => {
  const f = (id: string, event: string, severity: string, extra = {}) => ({ type: 'Feature', geometry: null, properties: { id, areaDesc: 'Travis, TX; Hays, TX', sent: '2026-11-04T10:00:00-06:00', onset: '2026-11-04T10:00:00-06:00', ends: '2026-11-07T06:00:00-06:00', status: 'Actual', messageType: 'Alert', severity, event, ...extra } });
  const j = { features: [
    { ...f('urn:oid:2.49.0.1.840.0.aaa', 'Flood Warning', 'Severe'), geometry: { type: 'Polygon', coordinates: [[[-97.9, 30.2], [-97.7, 30.2], [-97.7, 30.4], [-97.9, 30.4], [-97.9, 30.2]]] } },
    f('urn:oid:2.49.0.1.840.0.bbb', 'Tornado Warning', 'Extreme'),
    f('urn:oid:2.49.0.1.840.0.ccc', 'Tornado Watch', 'Severe', { messageType: 'Cancel' }),
    f('urn:oid:2.49.0.1.840.0.ddd', 'Test', 'Minor', { status: 'Test' }),
  ] };
  const ev = eventosNws(j, { lat: 30.27, lon: -97.74 }, Date.parse('2026-11-05T00:00:00Z'));
  assert.deepEqual(ev.map((e) => [e.tipo, e.gravedad, e.detalle, e.titulo]), [['meteo', 'naranja', 'Flood Warning', 'Travis, TX'], ['tornado', 'rojo', 'Tornado Warning', 'Travis, TX']]);
  assert.ok(Math.abs(ev[0].lat! - 30.28) < 0.05);
  assert.equal(ev[1].lat, 30.27);   // sin polígono, la estación
  assert.equal(ev[0].fin, Date.parse('2026-11-07T12:00:00Z'));
  assert.ok(boletinAprs('EA7JRS-13', ev[1]).includes('TORNADO Tornado Warning Travis, TX'));
  assert.deepEqual(eventosNws({ features: [] }, EST), []);
});

test('EONET: el último punto de cada suceso abierto', () => {
  const j = { events: [
    { id: 'EONET_1', title: 'Flood in Valencia', categories: [{ id: 'floods', title: 'Floods' }], geometry: [{ date: '2026-11-10T00:00:00Z', type: 'Point', coordinates: [-1, 39] }, { magnitudeValue: 1200, magnitudeUnit: 'acres', date: '2026-11-12T10:00:00Z', type: 'Point', coordinates: [-0.4, 39.5] }] },
    { id: 'EONET_2', title: 'Flood', geometry: [{ date: '2026-11-11T00:00:00Z', type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] }] },
    { id: 'EONET_3', title: 'Sin geometría', geometry: [] },
  ] };
  const ev = eventosEonet(j, 'floods', AHORA);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].lat, 39.5);
  assert.equal(ev[0].detalle, 'Inundacion 1200 acres');
  assert.equal(ev[0].nombre, 'IN1');
  assert.equal(ev[1].lat, 1);
  assert.equal(eventosEonet(j, 'volcanoes', AHORA)[0].detalle.startsWith('Volcan'), true);
  assert.deepEqual(eventosEonet(j, 'inventada', AHORA), []);
});

import fs from 'fs';
import path from 'path';
import { clasePeligro, eventosAreasQuemadas, eventosPeligroIncendio, fwiEnPunto, leerAreasQuemadas, leerTiffFloat32 } from '../server/fuentes/effis';

// Respuestas reales de EFFIS del 2-11-2026 (de agent-engineering-studio/effis-client, datos CC BY 4.0):
// recuadro 15,0–17,5 E y 39,5–41,5 N, a 0,05° por píxel.
const FIX = path.join(process.cwd(), 'tests', 'fixtures');
const CAJA = { oeste: 15.0, sur: 39.5, este: 17.5, norte: 41.5 };

test('EFFIS: lee el GeoTIFF float32 del FWI y no confunde «sin datos» con «sin peligro»', () => {
  const r = leerTiffFloat32(fs.readFileSync(path.join(FIX, 'fwi_2026-11-01.tif')));
  assert.equal(r.ancho, 50);
  assert.equal(r.alto, 40);
  assert.ok(Math.abs(fwiEnPunto(r, CAJA, 40.6, 16.6)! - 10.343368530273438) < 1e-6);   // Matera
  const vacio = leerTiffFloat32(fs.readFileSync(path.join(FIX, 'fwi_no_data.tif')));
  assert.equal(fwiEnPunto(vacio, CAJA, 40.6, 16.6), null);
  assert.throws(() => leerTiffFloat32(Buffer.from('<?xml version="1.0"?><ServiceExceptionReport/>')), /GeoTIFF/);
  assert.deepEqual([4, 10, 20, 30, 45, 60].map((v) => clasePeligro(v).nombre), ['muy bajo', 'bajo', 'moderado', 'alto', 'muy alto', 'extremo']);
  const ev = eventosPeligroIncendio([{ dia: '2026-11-20', fwi: 10.3 }, { dia: '2026-11-21', fwi: 41.2 }, { dia: '2026-11-22', fwi: null }], EST);
  assert.deepEqual(ev.map((e) => [e.id, e.gravedad, e.detalle, e.titulo, e.nombre]), [['effis-fwi-2026-11-21-naranja', 'naranja', 'Peligro de incendio muy alto', 'FWI 41 el 21/11', 'FWI1121']]);
});

test('EFFIS: áreas quemadas recientes, con su centro y sus hectáreas', () => {
  const areas = leerAreasQuemadas(JSON.parse(fs.readFileSync(path.join(FIX, 'perimeters.geojson'), 'utf8')));
  assert.deepEqual(areas.map((a) => [a.id, a.hectareas]), [['384188', 160], ['10207552', 251], ['15954978', 256]]);
  const ev = eventosAreasQuemadas(areas, 10, Date.parse('2026-10-08T00:00:00Z'));
  assert.deepEqual(ev.map((e) => [e.id, e.gravedad, e.detalle, e.titulo, e.nombre]), [['effis-ba-15954978', 'amarillo', 'Area quemada 256ha', 'Incendio del 03/10', 'BA1595497']]);
  assert.ok(Math.abs(ev[0].lat! - 40.5) < 0.6);
  assert.deepEqual(eventosAreasQuemadas(areas, 10, Date.parse('2026-11-20T00:00:00Z')), []);
  assert.throws(() => leerAreasQuemadas({}), /GeoJSON/);
});

import { eventosEmsc, leerEmsc, mismoSismo, nivelSismo, URL_EMSC } from '../server/fuentes/emsc';

// La muestra de EMSC de las pruebas de la app Android (core/SelfTest.kt)
test('EMSC: sismos de fuera de España con el nivel por magnitud y distancia', () => {
  const j = { type: 'FeatureCollection', features: [
    { type: 'Feature', id: '20261104_0000300', properties: { time: '2026-11-04T21:24:25.643Z', flynn_region: 'SOUTH OF FIJI ISLANDS', lat: -25.3174, lon: 179.8078, depth: 508.1, mag: 5.0, unid: '20261104_0000300' } },
    { type: 'Feature', properties: { time: '2026-11-04T16:14:39.4Z', flynn_region: 'STRAIT OF GIBRALTAR', lat: 36.0, lon: -5.5, depth: 10, mag: 4.6, unid: 'b' } },
    { type: 'Feature', properties: { flynn_region: 'SIN DATOS' } },
  ] };
  const sismos = leerEmsc(j);
  assert.equal(sismos.length, 2);
  const ahora = Date.parse('2026-11-04T22:00:00Z');
  const ev = eventosEmsc(sismos, { lat: 36.5, lon: -6.0 }, [], ahora);
  assert.deepEqual(ev.map((e) => [e.titulo, e.gravedad, e.detalle]), [['SOUTH OF FIJI ISLANDS', 'info', 'M5.0 Prof:508km'], ['STRAIT OF GIBRALTAR', 'amarillo', 'M4.6 Prof:10km']]);
  // El que ya da el IGN no se repite
  const ign = [{ lat: 36.04, lon: -5.47, cuando: Date.parse('2026-11-04T16:14:52Z'), magnitud: 4.4 }];
  assert.ok(mismoSismo(sismos[1], ign[0]));
  assert.deepEqual(eventosEmsc(sismos, { lat: 36.5, lon: -6.0 }, ign, ahora).map((e) => e.titulo), ['SOUTH OF FIJI ISLANDS']);
  assert.deepEqual([nivelSismo(6.1, 250), nivelSismo(5.2, 250), nivelSismo(5.2, 500), nivelSismo(5.2, 900), nivelSismo(7.6, 2500)], ['rojo', 'naranja', 'amarillo', 'info', 'naranja']);
  assert.equal(URL_EMSC(36.5, -6.3, Date.parse('2026-11-04T00:00:00Z')), 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=50&minmag=3.5&latitude=36.50&longitude=-6.30&maxradius=15&start=2026-11-04T00:00:00');
  assert.ok(boletinAprs('EA7JRS-13', ev[1], 78).includes('SISMO M4.6 Prof:10km STRAIT OF GIBRALTAR a 78km'));
});
