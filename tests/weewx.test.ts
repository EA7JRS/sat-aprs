// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { leerConfWeewx, leerHorasWeewx, resumenHoras } from '../server/estacion/weewx';

const CONF = `
WEEWX_ROOT = /etc/weewx
[Station]
    location = "Sevilla, EA7JRS"
    latitude = 37.389
    longitude = -5.984
    altitude = 12, meter
    station_type = Vantage   # Davis
[StdConvert]
    target_unit = METRICWX
[StdArchive]
    archive_interval = 300
[DataBindings]
    [[wx_binding]]
        database = archive_sqlite
[Databases]
    [[archive_sqlite]]
        database_name = weewx.sdb
        database_type = SQLite
[DatabaseTypes]
    [[SQLite]]
        driver = weedb.sqlite
        SQLITE_ROOT = /var/lib/weewx
`;

test('leerConfWeewx: estación, archivo y ruta de la base de datos', () => {
  const c = leerConfWeewx(CONF);
  assert.equal(c.tipoEstacion, 'Vantage');
  assert.equal(c.ubicacion, 'Sevilla, EA7JRS');
  assert.equal(c.lat, 37.389);
  assert.equal(c.altitud, '12 meter');
  assert.equal(c.intervaloArchivoS, 300);
  assert.equal(c.unidadesInforme, 'METRICWX');
  assert.equal(c.baseDatos, '/var/lib/weewx/weewx.sdb');
  const pip = leerConfWeewx(CONF.replace('SQLITE_ROOT = /var/lib/weewx', 'SQLITE_ROOT = %(WEEWX_ROOT)s/archive').replace('WEEWX_ROOT = /etc/weewx', 'WEEWX_ROOT = /home/manuel/weewx-data'));
  assert.equal(pip.baseDatos, '/home/manuel/weewx-data/archive/weewx.sdb');
});

test('leerHorasWeewx: unidades de EE. UU. y métricas', () => {
  const salida = [
    '1794754800|1|68.0|60|30.00|10.0|20.0|0.1|12',   // EE. UU.: °F, inHg, mph, pulgadas
    '1794758400|17|20.0|55|1015.9|2.0|5.0|1.5|12',   // METRICWX: °C, hPa, m/s, mm
    '1794762000|16|19.0||1016.4|7.2|||12',           // METRIC: km/h, cm; huecos
    'basura',
  ].join('\n');
  const h = leerHorasWeewx(salida);
  assert.equal(h.length, 3);
  assert.equal(h[0].hora, 1794754800000);
  assert.ok(Math.abs(h[0].tempC! - 20) < 1e-9);
  assert.ok(Math.abs(h[0].presionHpa! - 1015.9) < 0.1);
  assert.ok(Math.abs(h[0].vientoKmh! - 16.09) < 0.01);
  assert.ok(Math.abs(h[0].lluviaMm! - 2.54) < 1e-9);
  assert.ok(Math.abs(h[1].vientoKmh! - 7.2) < 1e-9);
  assert.equal(h[1].lluviaMm, 1.5);
  assert.equal(h[2].humedadPct, null);
  assert.equal(h[2].rachaKmh, null);
  const r = resumenHoras(h);
  assert.ok(Math.abs(r.tempMax! - 20) < 1e-9);
  assert.equal(r.tempMin, 19);
  assert.ok(Math.abs(r.lluvia24h! - 4.04) < 1e-9);
  assert.ok(Math.abs(r.tendencia3h! - (1016.4 - h[0].presionHpa!)) < 1e-9);
  assert.equal(r.registros, 36);
  assert.deepEqual(resumenHoras([]), { tempMin: null, tempMax: null, rachaMax: null, lluvia24h: null, tendencia3h: null, registros: 0 });
});
