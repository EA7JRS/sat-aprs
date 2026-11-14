// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisoAEvento, avisosVigentes, extraerEnlacesCap, leerCap, vigenciaCorta } from '../server/fuentes/aemetAvisos';
import { centroZona, dentroDeZona, distanciaAZonaKm, leerPoligonoCap } from '../server/core/zona';
import { evaluar, Politica } from '../server/core/reglas';
import { boletinAprs, objetoAprs } from '../server/core/aprsAvisos';

// Documento con la estructura de los CAP 1.2 de AEMET (Meteoalerta)
function cap(o: { nivel?: string; tipo?: string; sent?: string; status?: string; poligono?: string; onset?: string; expires?: string } = {}): string {
  const nivel = o.nivel ?? 'amarillo';
  const poligono = o.poligono ?? '37.0,-6.0 37.5,-6.0 37.5,-5.5 37.0,-5.5 37.0,-6.0';
  const info = (lang: string, evento: string) => `
  <info>
    <language>${lang}</language>
    <category>Met</category>
    <event>${evento}</event>
    <urgency>Future</urgency>
    <severity>Moderate</severity>
    <certainty>Likely</certainty>
    <eventCode><valueName>AEMET-Meteoalerta fenomeno</valueName><value>PR;Lluvias</value></eventCode>
    <effective>2026-09-08T19:03:02+02:00</effective>
    <onset>${o.onset ?? '2026-09-10T00:00:00+02:00'}</onset>
    <expires>${o.expires ?? '2026-09-10T03:59:59+02:00'}</expires>
    <senderName>AEMET. Agencia Estatal de Meteorolog&#237;a</senderName>
    <headline>${evento}. Campi&#241;a sevillana</headline>
    <description>Precipitaci&#243;n acumulada en una hora: 15 mm.</description>
    <parameter><valueName>AEMET-Meteoalerta nivel</valueName><value>${nivel}</value></parameter>
    <parameter><valueName>AEMET-Meteoalerta parametro</valueName><value>P1;Precipitaci&#243;n acumulada en una hora;15 mm</value></parameter>
    <parameter><valueName>AEMET-Meteoalerta probabilidad</valueName><value>40%-70%</value></parameter>
    <area>
      <areaDesc>Campi&#241;a sevillana</areaDesc>
      <polygon>${poligono}</polygon>
      <geocode><valueName>AEMET-Meteoalerta zona</valueName><value>614102</value></geocode>
    </area>
  </info>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>2.49.0.0.724.0.ES.20260908170302.614102PRP11002</identifier>
  <sender>http://www.aemet.es</sender>
  <sent>${o.sent ?? '2026-09-08T17:03:02-00:00'}</sent>
  <status>${o.status ?? 'Actual'}</status>
  <msgType>${o.tipo ?? 'Alert'}</msgType>
  <scope>Public</scope>${info('es-ES', 'Aviso de lluvias de nivel ' + nivel)}${info('en-GB', 'Moderate rain warning')}
</alert>`;
}

const SEVILLA = { lat: 37.3891, lon: -5.9845 };
const ANTES = Date.parse('2026-09-09T18:00:00Z'); // 4 h antes del comienzo
const politica: Politica = { radioKm: 25, gravedadMinima: 'amarillo', vigenciaMs: 86400_000, antelacionMs: 12 * 3600_000, repetirCadaMs: 3600_000, boletin: true };

test('AEMET: lectura de un documento CAP', () => {
  const a = leerCap(cap())!;
  assert.equal(a.zona, '614102');
  assert.equal(a.nombreZona, 'Campiña sevillana');
  assert.equal(a.fenomeno, 'PR');
  assert.equal(a.nombreFenomeno, 'Lluvias');
  assert.equal(a.nivel, 'amarillo');
  assert.equal(a.valor, '15 mm');
  assert.equal(a.inicio, Date.parse('2026-09-09T22:00:00Z'));
  assert.equal(a.fin, Date.parse('2026-09-10T01:59:59Z'));
  assert.equal(a.poligono.length, 4);
  assert.match(a.titular, /^Aviso de lluvias de nivel amarillo/); // bloque en español, no el inglés
});

test('AEMET: documentos no utilizables', () => {
  assert.equal(leerCap(cap({ status: 'Test' })), null);
  assert.equal(leerCap(cap({ nivel: 'verde' }).replace(/<severity>Moderate/g, '<severity>Minor')), null);
  assert.equal(leerCap(cap({ expires: '2026-09-09T00:00:00+02:00' })), null);
  assert.equal(leerCap('<html>error</html>'), null);
});

test('AEMET: enlaces del índice, sin repetidos', () => {
  const u = 'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/Z_CAP_C_LEMM_20260908170302_AFAZ614102PRP11002.xml';
  const rss = `<rss><channel><item><title>Aviso</title><link>${u}</link><guid>${u}</guid></item>
    <item><link>${u.replace('614102', '610404')}</link></item><item><link>https://www.aemet.es/es/eltiempo/prediccion/avisos</link></item></channel></rss>`;
  assert.deepEqual(extraerEnlacesCap(rss), [u, u.replace('614102', '610404')]);
  assert.deepEqual(extraerEnlacesCap('<rss><channel><item><title>No hay avisos</title></item></channel></rss>'), []);
});

test('AEMET: actualizaciones, cancelaciones y caducados', () => {
  const alerta = leerCap(cap())!;
  const subida = leerCap(cap({ nivel: 'naranja', tipo: 'Update', sent: '2026-09-09T08:00:00-00:00' }))!;
  const cancel = leerCap(cap({ tipo: 'Cancel', sent: '2026-09-09T10:00:00-00:00' }))!;
  assert.deepEqual(avisosVigentes([alerta, subida], ANTES).map((a) => a.nivel), ['naranja']);
  assert.deepEqual(avisosVigentes([subida, alerta], ANTES).map((a) => a.nivel), ['naranja']);
  assert.equal(avisosVigentes([alerta, subida, cancel], ANTES).length, 0);
  assert.equal(avisosVigentes([alerta], Date.parse('2026-09-10T03:00:00Z')).length, 0);
});

test('zona: polígono, interior, distancia y centro', () => {
  const zona = leerPoligonoCap('37.0,-6.0 37.5,-6.0 37.5,-5.5 37.0,-5.5 37.0,-6.0');
  assert.equal(zona.length, 4);
  assert.equal(dentroDeZona(SEVILLA, zona), true);
  assert.equal(distanciaAZonaKm(SEVILLA, zona), 0);
  const fuera = distanciaAZonaKm({ lat: 37.25, lon: -6.5 }, zona); // 0,5° al oeste del borde
  assert.ok(Math.abs(fuera - 44.3) < 1, String(fuera));
  const c = centroZona(zona)!;
  assert.ok(Math.abs(c.lat - 37.25) < 1e-6 && Math.abs(c.lon + 5.75) < 1e-6);
  assert.deepEqual(leerPoligonoCap('1,2 x,y'), []);
});

test('AEMET: aviso → evento → reglas', () => {
  const e = avisoAEvento(leerCap(cap())!);
  assert.equal(e.detalle, 'AMARILLO Lluvias 15mm 09/22-10/02z');
  assert.equal(e.nombre, 'PR614102');
  assert.equal(e.real, true);
  assert.equal(evaluar(e, politica, SEVILLA, ANTES).emitir, true);
  assert.equal(evaluar(e, politica, SEVILLA, ANTES).distanciaKm, 0);
  // Fuera de plazo, fuera de radio, por debajo del nivel y ya caducado
  assert.equal(evaluar(e, politica, SEVILLA, ANTES - 24 * 3600_000).emitir, false);
  assert.equal(evaluar(e, politica, { lat: 40.4, lon: -3.7 }, ANTES).emitir, false);
  assert.equal(evaluar(e, { ...politica, gravedadMinima: 'naranja' }, SEVILLA, ANTES).emitir, false);
  assert.equal(evaluar(e, politica, SEVILLA, Date.parse('2026-09-10T03:00:00Z')).emitir, false);
  // Sin polígono no se sabe a quién afecta: no se emite
  assert.equal(avisoAEvento(leerCap(cap({ poligono: '' }))!).real, false);
});

test('AEMET: tramas APRS del aviso', () => {
  const e = avisoAEvento(leerCap(cap({ nivel: 'naranja' }))!);
  assert.equal(objetoAprs('EA7ZZZ-10', e), 'EA7ZZZ-10>APZSAT:;PR614102 *092200z3715.00N\\00545.00WWNARANJA Lluvias 15mm 09/22-10/02z Campina s');
  assert.equal(boletinAprs('EA7ZZZ-10', e, 0), 'EA7ZZZ-10>APZSAT::BLN2METEO:METEO NARANJA Lluvias 15mm 09/22-10/02z Campina sevillana (AEMET)');
});

test('AEMET: vigencia compacta', () => {
  assert.equal(vigenciaCorta(Date.parse('2026-09-10T00:00:00Z'), Date.parse('2026-09-10T03:59:59Z')), '10/00-04z');
  assert.equal(vigenciaCorta(Date.parse('2026-09-09T22:00:00Z'), Date.parse('2026-09-10T01:59:59Z')), '09/22-10/02z');
});
