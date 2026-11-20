// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventosPronosticoWeatherApi, eventosUmbralesLocales } from '../server/fuentes/umbrales';
import { boletinAprs, objetoAprs } from '../server/core/aprsAvisos';

const EST = { lat: 37.3891, lon: -5.9845 };
const U = { vientoKn: 20, tempMaxC: 35, tempMinC: 5, lluvia1hMm: 10 };
const AHORA = Date.parse('2026-11-20T12:00:00Z');

test('umbrales locales: solo lo que pasa, un aviso por tipo y día', () => {
  const obs = { cuando: AHORA - 60_000, fuente: 'WeeWX', propia: true, tempC: 36.2, vientoKmh: 30, rachaKmh: 45, lluvia1hMm: 12 };
  const ev = eventosUmbralesLocales(obs, U, EST, AHORA);
  assert.deepEqual(ev.map((e) => e.id).sort(), ['umbral-calor-2026-11-20', 'umbral-lluvia-2026-11-20', 'umbral-viento-2026-11-20']);
  const viento = ev.find((e) => e.id.startsWith('umbral-viento'))!;
  assert.equal(viento.titulo, 'Viento 24kn, umbral 20kn');   // la racha manda: 45 km/h
  assert.equal(viento.fuente, 'Estación');
  assert.equal(viento.lat, EST.lat);
  assert.ok(viento.real);
  // Los textos caben en APRS
  assert.ok(objetoAprs('EA7JRS-13', viento, AHORA)!.includes(';UMBVIENTO*'));
  assert.ok(boletinAprs('EA7JRS-13', viento).split('::')[1].length <= 10 + 67);
});

test('umbrales locales: sin observación reciente o sin dato, nada', () => {
  assert.deepEqual(eventosUmbralesLocales(null, U, EST, AHORA), []);
  assert.deepEqual(eventosUmbralesLocales({ cuando: AHORA - 3600_000, fuente: 'OWM', propia: false, tempC: 40 }, U, EST, AHORA), []);
  const frio = eventosUmbralesLocales({ cuando: AHORA, fuente: 'OWM', propia: false, tempC: 2 }, U, EST, AHORA);
  assert.deepEqual(frio.map((e) => e.id), ['umbral-frio-2026-11-20']);
  assert.equal(frio[0].fuente, 'OWM');
  assert.deepEqual(eventosUmbralesLocales({ cuando: AHORA, fuente: 'WeeWX', propia: true, humedadPct: 90 }, U, EST, AHORA), []);
});

test('pronóstico de WeatherAPI: avisos oficiales y días que pasan los umbrales', () => {
  const j = {
    alerts: { alert: [
      { event: 'Aviso amarillo por viento', severity: 'Moderate', areas: 'Campiña sevillana; Sierra', effective: '2026-11-20T14:00:00Z', expires: '2026-11-20T20:00:00Z' },
      { event: 'Caducado', severity: 'Severe', expires: '2026-11-19T00:00:00Z' },
      { severity: 'Extreme' },
    ] },
    forecast: { forecastday: [
      { date: '2026-11-20', day: { maxwind_kph: 20, mintemp_c: 8, totalprecip_mm: 2 } },
      { date: '2026-11-21', day: { maxwind_kph: 55, mintemp_c: -1.5, totalprecip_mm: 31 } },
    ] },
  };
  const ev = eventosPronosticoWeatherApi(j, { vientoKn: 25, tempMinC: 0, lluviaMm: 20 }, EST, AHORA);
  assert.deepEqual(ev.map((e) => e.id), [
    'weatherapi-Aviso_amarillo_por_viento-2026-11-20-Campiña_sevillana',
    'pronostico-viento-2026-11-21', 'pronostico-helada-2026-11-21', 'pronostico-lluvia-2026-11-21',
  ]);
  assert.equal(ev[0].gravedad, 'amarillo');
  assert.equal(ev[0].titulo, 'Aviso amarillo por viento Campiña sevillana');
  assert.equal(ev[1].titulo, 'Viento previsto 30kn el 21/11');
  assert.equal(ev[2].titulo, 'Helada prevista -1.5C el 21/11');
  assert.equal(ev[1].inicio, Date.parse('2026-11-21T00:00:00Z'));
  assert.deepEqual(eventosPronosticoWeatherApi({}, { vientoKn: 25, tempMinC: 0, lluviaMm: 20 }, EST, AHORA), []);
});
