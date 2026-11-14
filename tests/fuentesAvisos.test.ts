// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { escalaAEvento, gravedadEscala, leerEscalasNoaa } from '../server/fuentes/climaEspacial';
import { agruparFocos, gravedadFocos, grupoAEvento, leerCsvFirms } from '../server/fuentes/incendios';
import { aireAEvento, claseAire, leerCalidadAire } from '../server/fuentes/calidadAire';
import { evaluar, Politica } from '../server/core/reglas';
import { boletinAprs, objetoAprs } from '../server/core/aprsAvisos';

const T = Date.parse('2026-11-14T12:40:00Z');
const SEVILLA = { lat: 37.3891, lon: -5.9845 };
const politica = (p: Partial<Politica>): Politica => ({ radioKm: 50, gravedadMinima: 'amarillo', vigenciaMs: 12 * 3600_000, repetirCadaMs: 3600_000, boletin: true, ...p });

test('clima espacial: escalas actuales de la NOAA', () => {
  const json = {
    '0': { DateStamp: '2026-11-14', TimeStamp: '12:30:00', R: { Scale: '3', Text: 'strong' }, S: { Scale: '0', Text: 'none' }, G: { Scale: '1', Text: 'minor' } },
    '1': { DateStamp: '2026-11-15', TimeStamp: '00:00:00', R: { Scale: null }, S: { Scale: null }, G: { Scale: '2' } },
    '-1': { DateStamp: '2026-11-13', TimeStamp: '12:30:00', R: { Scale: '5' }, S: { Scale: '5' }, G: { Scale: '5' } },
  };
  const n = leerEscalasNoaa(json, T);
  assert.deepEqual(n.map((x) => `${x.escala}${x.nivel}`), ['R3', 'S0', 'G1']);
  assert.equal(n[0].cuando, Date.parse('2026-11-14T12:30:00Z'));
  assert.deepEqual(leerEscalasNoaa({}), []);
  assert.deepEqual(leerEscalasNoaa({ '0': { R: { Scale: '9' }, S: {}, G: { Scale: 'x' } } }), []);
  assert.deepEqual([1, 2, 3, 4, 5].map(gravedadEscala), ['info', 'amarillo', 'naranja', 'rojo', 'rojo']);
});

test('clima espacial: boletín sin posición, vigente mientras dure la escala', () => {
  const [r3, s0, g1] = leerEscalasNoaa({ '0': { DateStamp: '2026-11-14', TimeStamp: '12:30:00', R: { Scale: '3' }, S: { Scale: '0' }, G: { Scale: '1' } } }, T);
  assert.equal(escalaAEvento(s0, T), null);
  const e = escalaAEvento(r3, T)!;
  assert.equal(e.id, 'NOAA-R3-20261114');
  assert.equal(objetoAprs('EA7ZZZ-13', e), null);
  assert.equal(boletinAprs('EA7ZZZ-13', e), 'EA7ZZZ-13>APZSAT::BLN2ESPAC:EMERGENCIA CLIMA ESPACIAL R3 Apagon de radio HF fuerte (NOAA)');
  const p = politica({ radioKm: null });
  assert.equal(evaluar(e, p, SEVILLA, T).emitir, true);
  assert.equal(evaluar(e, p, SEVILLA, T + 60 * 60_000).emitir, false);                 // la escala bajó: caduca
  assert.equal(evaluar(escalaAEvento(g1, T)!, p, SEVILLA, T).emitir, false);            // G1 es informativo
  assert.equal(escalaAEvento(g1, T)!.titulo, 'Tormenta geomagnetica menor');
});

const CSV_VIIRS = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
37.5010,-5.9000,340.1,0.4,0.4,2026-11-14,1218,N,n,2.0NRT,295.1,40.5,D
37.5040,-5.9030,350.2,0.4,0.4,2026-11-14,1218,N,h,2.0NRT,296.0,80.0,D
37.5060,-5.8990,330.0,0.4,0.4,2026-11-14,230,N,n,2.0NRT,290.0,12.5,N
37.5050,-5.9010,320.0,0.4,0.4,2026-11-14,1218,N,l,2.0NRT,290.0,5.0,D
38.9000,-3.0000,330.0,0.4,0.4,2026-11-14,1218,N,n,2.0NRT,290.0,3.0,D
`;
const CSV_MODIS = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight
37.5030,-5.9020,320.5,1.0,1.0,2026-11-14,1105,T,74,6.1NRT,290.1,30.0,D
37.5030,-5.9020,320.5,1.0,1.0,2026-11-14,1105,T,20,6.1NRT,290.1,30.0,D
`;

test('focos FIRMS: lectura de VIIRS y MODIS, descartando baja confianza', () => {
  const v = leerCsvFirms(CSV_VIIRS);
  assert.equal(v.length, 4);                                            // se descarta el de confianza «l»
  assert.equal(v[0].cuando, Date.parse('2026-11-14T12:18:00Z'));
  assert.equal(v[2].cuando, Date.parse('2026-11-14T02:30:00Z'));        // hora «230» = 02:30
  assert.equal(leerCsvFirms(CSV_MODIS).length, 1);                      // 74 % sí, 20 % no
  assert.deepEqual(leerCsvFirms('<html>error</html>'), []);
  assert.deepEqual(leerCsvFirms('a,b\n1,2\n'), []);
});

test('focos FIRMS: agrupación, importancia y aviso', () => {
  const grupos = agruparFocos([...leerCsvFirms(CSV_VIIRS), ...leerCsvFirms(CSV_MODIS)]);
  assert.equal(grupos.length, 2);
  const g = grupos.find((x) => x.focos === 4)!;
  assert.equal(Math.round(g.frp), 163);
  assert.equal(g.cuando, Date.parse('2026-11-14T12:18:00Z'));
  assert.equal(gravedadFocos(g), 'naranja');
  assert.equal(gravedadFocos({ ...g, focos: 1, frp: 3 }), 'info');
  assert.equal(gravedadFocos({ ...g, focos: 25 }), 'rojo');
  const e = grupoAEvento(g);
  assert.match(e.nombre!, /^FG[0-9A-Z]{7}$/);
  assert.equal(e.detalle, '4 puntos 163MW');
  assert.equal(grupoAEvento(g).id, e.id);                                // estable entre descargas
  const d = evaluar(e, politica({ gravedadMinima: 'naranja' }), SEVILLA, T);
  assert.equal(d.emitir, true);
  assert.equal(Math.round(d.distanciaKm!), 15);
  assert.match(boletinAprs('EA7ZZZ-13', e, d.distanciaKm), /:BLN2FUEGO:FUEGO 4 puntos 163MW Foco de calor por satelite a 15km \(FIRMS\)$/);
  assert.match(objetoAprs('EA7ZZZ-13', e, T)!, /^EA7ZZZ-13>APZSAT:;FG[0-9A-Z]{7}\*141218z3730\.\d\dN\/00554\.\d\dW:4 puntos 163MW/);
  // El foco aislado y débil no pasa el nivel mínimo; el lejano, el radio
  const lejano = grupoAEvento(grupos.find((x) => x.focos === 1)!);
  assert.equal(evaluar(lejano, politica({ gravedadMinima: 'info' }), SEVILLA, T).emitir, false);
});

test('calidad del aire: índice europeo y aviso solo si es mala', () => {
  const a = leerCalidadAire({ current: { time: '2026-11-14T12:00', european_aqi: 86, pm10: 60.2, pm2_5: 41.7, nitrogen_dioxide: 30, ozone: 80 } })!;
  assert.equal(a.cuando, Date.parse('2026-11-14T12:00:00Z'));
  assert.deepEqual([a.indice, a.pm25], [86, 41.7]);
  assert.equal(leerCalidadAire({ current: { time: 'x', european_aqi: null } }), null);
  assert.equal(leerCalidadAire({}), null);
  assert.deepEqual([10, 30, 50, 70, 90, 130].map((i) => claseAire(i).gravedad), [null, null, null, 'amarillo', 'naranja', 'rojo']);
  assert.equal(aireAEvento({ ...a, indice: 35 }, T), null);
  const e = aireAEvento(a, T)!;
  assert.equal(e.id, 'CAMS-naranja-20261114');
  assert.equal(objetoAprs('EA7ZZZ-13', e), null);
  assert.equal(boletinAprs('EA7ZZZ-13', e), 'EA7ZZZ-13>APZSAT::BLN2AIRE :AIRE Indice 86 PM2.5 42ug Calidad del aire muy mala (CAMS)');
  assert.equal(evaluar(e, politica({ radioKm: null, gravedadMinima: 'naranja' }), SEVILLA, T).emitir, true);
});

test('medidores de aire cercanos: uno por lugar, ordenados por distancia', async () => {
  const { clasePm25, leerMedidoresAire, urlMedidoresAire } = await import('../server/fuentes/estacionesAire');
  const json = [
    { timestamp: '2026-11-14 12:30:00', location: { id: 10, latitude: '37.400', longitude: '-5.990', indoor: 0 }, sensor: { sensor_type: { name: 'SDS011' } },
      sensordatavalues: [{ value_type: 'P1', value: '21.50' }, { value_type: 'P2', value: '9.80' }] },
    { timestamp: '2026-11-14 12:35:00', location: { id: 10, latitude: '37.400', longitude: '-5.990', indoor: 0 }, sensor: { sensor_type: { name: 'SDS011' } },
      sensordatavalues: [{ value_type: 'P1', value: '25.00' }, { value_type: 'P2', value: '12.00' }] },
    { timestamp: '2026-11-14 12:34:00', location: { id: 11, latitude: '37.390', longitude: '-5.985', indoor: 0 }, sensor: { sensor_type: { name: 'SPS30' } },
      sensordatavalues: [{ value_type: 'P2', value: '30.1' }] },
    { timestamp: '2026-11-14 12:34:00', location: { id: 12, latitude: '37.391', longitude: '-5.986', indoor: 1 }, sensor: { sensor_type: { name: 'SDS011' } },
      sensordatavalues: [{ value_type: 'P2', value: '3' }] },
    { timestamp: '2026-11-14 12:34:00', location: { id: 13, latitude: '37.392', longitude: '-5.987' }, sensor: { sensor_type: { name: 'BME280' } },
      sensordatavalues: [{ value_type: 'temperature', value: '18.2' }] },
    { timestamp: '2026-11-14 12:34:00', location: { id: 14, latitude: '37.393', longitude: '-5.988' }, sensor: { sensor_type: { name: 'SDS011' } },
      sensordatavalues: [{ value_type: 'P1', value: '999.90' }, { value_type: 'P2', value: '999.90' }] },
    { basura: true },
  ];
  const l = leerMedidoresAire(json, SEVILLA);
  assert.deepEqual(l.map((m) => m.id), ['11', '10']);                      // interior, sin partículas y averiado, fuera
  assert.deepEqual([l[1].pm10, l[1].pm25, l[1].sensor], [25, 12, 'SDS011']); // la lectura más reciente del lugar
  assert.equal(l[1].cuando, Date.parse('2026-11-14T12:35:00Z'));
  assert.ok(l[0].distanciaKm < 0.5 && l[1].distanciaKm > 1 && l[1].distanciaKm < 2);
  assert.deepEqual(leerMedidoresAire({ error: 1 }, SEVILLA), []);
  assert.deepEqual([5, 15, 22, 40, 60, 120].map(clasePm25), ['buena', 'razonable', 'moderada', 'mala', 'muy mala', 'extremadamente mala']);
  assert.equal(urlMedidoresAire(37.3891, -5.9845, 10), 'https://data.sensor.community/airrohr/v1/filter/area=37.3891,-5.9845,10');
});

// ── Meteorología sin clave (Open-Meteo) ─────────────────────────────────────
import { leerMeteoAbierta, tiempoOmm, urlMeteoAbierta } from '../server/fuentes/meteoAbierta';
import { boyasCercanas, leerBoyas } from '../server/fuentes/boyas';

test('meteo sin clave: estado actual y previsión de los días siguientes, sin rellenos', () => {
  const t0 = Date.UTC(2026, 10, 14, 12, 0) / 1000; // sábado 14/11/2026 12:00 UTC
  const dia = 86400;
  const horas = Array.from({ length: 48 }, (_, i) => t0 - 23 * 3600 + i * 3600);
  const json = {
    utc_offset_seconds: 3600,
    current: { time: t0, temperature_2m: 18.4, relative_humidity_2m: 61, precipitation: 0.2, pressure_msl: 1017.3,
      wind_speed_10m: 18.5, wind_direction_10m: 250, wind_gusts_10m: null },
    hourly: { time: horas, relative_humidity_2m: horas.map(() => 60), precipitation: horas.map((_, i) => (i < 24 ? 0.5 : 9)) },
    daily: {
      time: [t0 - dia - 13 * 3600, t0 - 13 * 3600, t0 + dia - 13 * 3600, t0 + 2 * dia - 13 * 3600],
      weather_code: [0, 3, 63, 95],
      temperature_2m_max: [20, 21, 19.5, null],
      temperature_2m_min: [11, 12, 10.5, 9],
      precipitation_probability_max: [0, 10, 80, 90],
      wind_speed_10m_max: [10, 20, 37.04, 50],
      wind_direction_10m_dominant: [200, 220, 240, 260],
    },
  };
  const m = leerMeteoAbierta(json)!;
  assert.equal(m.observacion.fuente, 'Open-Meteo');
  assert.equal(m.observacion.propia, false);
  assert.equal(m.observacion.tempC, 18.4);
  assert.equal(m.observacion.vientoKmh, 18.5);
  assert.equal(m.observacion.rachaKmh, undefined); // no viene: no se inventa
  assert.equal(m.observacion.lluvia24hMm, 12); // 24 horas de 0,5 mm; las futuras no cuentan
  // Hoy y ayer no entran; el día sin máxima se descarta
  assert.equal(m.prevision.length, 1);
  assert.deepEqual(
    { ...m.prevision[0] },
    { date: 'Dom 15/11', tempMin: 10.5, tempMax: 19.5, humidityPct: 60, windSpeedKts: 20, windDirDeg: 240, description: 'Lluvia', icon: '10d', pop: 0.8 },
  );
  assert.equal(leerMeteoAbierta({ current: { time: t0 } }), null);
  assert.equal(leerMeteoAbierta(null), null);
  assert.equal(tiempoOmm(96).description, 'Tormenta');
  assert.match(urlMeteoAbierta(36.72, -4.42), /latitude=36\.7200&longitude=-4\.4200/);
});

test('boyas: las más cercanas con observación reciente; «MM» queda sin dato', () => {
  const texto = [
    '#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE',
    '#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft',
    '62001     45.200   -5.000 2026 11 14 11 00  270  8.0  11.0  2.5  9.0 7.0 280 1015.2   MM  15.1  16.2   MM   MM     MM',
    '61001     36.500   -4.000 2026 11 14 11 30   MM   MM    MM  0.8   MM  MM  MM     MM   MM    MM  18.4   MM   MM     MM',
    '61002     36.600   -4.300 2026 11 13 02 00  100  5.0    MM  1.0  6.0  MM  MM 1012.0   MM  17.0  18.0   MM   MM     MM',
    '61003     37.000   -4.000 2026 11 14 11 00   MM   MM    MM   MM   MM  MM  MM     MM   MM    MM    MM   MM   MM     MM',
    '41001     34.700  -72.700 2026 11 14 11 00  200 10.0  12.0  3.0 10.0 8.0 210 1010.0   MM  20.0  22.0   MM   MM     MM',
  ].join('\n');
  const todas = leerBoyas(texto);
  assert.equal(todas.length, 4); // la que no mide nada se descarta
  const ahora = Date.UTC(2026, 10, 14, 12, 0);
  const cerca = boyasCercanas(todas, { lat: 36.72, lon: -4.42 }, { ahora });
  assert.deepEqual(cerca.map((b) => b.id), ['61001', '62001']); // la de ayer y la de América no entran
  assert.equal(cerca[0].olaM, 0.8);
  assert.equal(cerca[0].vientoNudos, undefined);
  assert.equal(cerca[0].aguaC, 18.4);
  assert.equal(cerca[1].vientoNudos, 15.6);
  assert.equal(cerca[1].presionHpa, 1015.2);
  assert.ok(cerca[0].distanciaKm < cerca[1].distanciaKm);
  assert.deepEqual(leerBoyas('sin cabecera'), []);
});
