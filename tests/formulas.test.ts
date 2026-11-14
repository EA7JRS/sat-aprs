// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Las fórmulas portadas del plotter APRS LoRa+ deben dar los mismos resultados
// que el código C++ original. tests/fixtures/plotter-core-ref.json se generó
// compilando lib/plotter_core (geo, astro, wxcalc, wind, motion, wmm, units)
// y evaluándolo en 300 casos aleatorios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as geo from '../server/formulas/geo';
import * as astro from '../server/formulas/astro';
import * as wx from '../server/formulas/wxcalc';
import * as wind from '../server/formulas/wind';
import * as motion from '../server/formulas/motion';
import * as units from '../server/formulas/units';
import { Wmm, decimalYear, defaultWmm, magneticDeclination } from '../server/formulas/wmm';

const ref = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/plotter-core-ref.json'), 'utf8'));

/** Igualdad con tolerancia relativa y absoluta; null en la referencia = NaN. */
function igual(obtenido: number, esperado: number | null, etiqueta: string, tol = 1e-9) {
  if (esperado === null) return assert.ok(Number.isNaN(obtenido), `${etiqueta}: se esperaba NaN y salió ${obtenido}`);
  const margen = tol * Math.max(1, Math.abs(esperado));
  assert.ok(Math.abs(obtenido - esperado) <= margen, `${etiqueta}: ${obtenido} != ${esperado}`);
}
/** Igualdad de ángulos (359,9999 y 0,0001 son el mismo rumbo). */
function igualAngulo(obtenido: number, esperado: number, etiqueta: string, tol = 1e-7) {
  const dif = Math.abs(geo.norm180(obtenido - esperado));
  assert.ok(dif <= tol, `${etiqueta}: ${obtenido} != ${esperado}`);
}

test('geodesia: mismos resultados que el plotter', () => {
  for (const [i, c] of ref.geo.entries()) {
    const a = { lat: c.a[0], lon: c.a[1] }, b = { lat: c.b[0], lon: c.b[1] }, p = { lat: c.p[0], lon: c.p[1] };
    igual(geo.gcDistanceNm(a, b), c.gc, `gc ${i}`);
    igualAngulo(geo.gcInitialBearing(a, b), c.ib, `ib ${i}`);
    const dest = geo.gcDestination(a, c.brg, c.dist);
    igual(dest.lat, c.dest[0], `dest.lat ${i}`);
    igualAngulo(dest.lon, c.dest[1], `dest.lon ${i}`);
    igual(geo.rhumbDistanceNm(a, b), c.rd, `rhumb ${i}`);
    igualAngulo(geo.rhumbBearing(a, b), c.rb, `rhumbBrg ${i}`);
    const v = geo.vincentyInverse(a, b);
    assert.equal(v !== null, c.vok, `vincenty ok ${i}`);
    if (v) { igual(v.distM, c.vd, `vincenty d ${i}`, 1e-8); igualAngulo(v.initialBearingDeg, c.vb, `vincenty b ${i}`); }
    const xt = geo.crossTrack(a, b, p);
    igual(xt.xteNm, c.xte, `xte ${i}`, 1e-7);
    igual(xt.alongNm, c.along, `along ${i}`, 1e-7);
  }
});

test('astronomía (sol y luna): mismos resultados que el plotter', () => {
  for (const [i, c] of ref.astro.entries()) {
    assert.equal(astro.dayOfYear(c.y, c.m, c.d), c.doy);
    igual(astro.julianDay(c.y, c.m, c.d, c.utc), c.jd, `jd ${i}`, 1e-12);
    igual(astro.solarNoonUtcMin(c.y, c.m, c.d, c.lon), c.noon, `noon ${i}`);
    const st = astro.sunTimes(c.y, c.m, c.d, c.lat, c.lon, c.alt0);
    assert.equal(st !== null, c.st, `sunTimes ${i}`);
    if (st) { igual(st.riseUtcMin, c.rise, `rise ${i}`); igual(st.setUtcMin, c.set, `set ${i}`); }
    const sun = astro.sunPosition(c.y, c.m, c.d, c.utc, c.lat, c.lon);
    igual(sun.altDeg, c.sa, `sun alt ${i}`, 1e-7); igualAngulo(sun.azDeg, c.sz, `sun az ${i}`, 1e-6);
    const moon = astro.moonPosition(c.y, c.m, c.d, c.utc, c.lat, c.lon);
    igual(moon.altDeg, c.ma, `moon alt ${i}`, 1e-7); igualAngulo(moon.azDeg, c.mz, `moon az ${i}`, 1e-6); igual(moon.distKm, c.md, `moon dist ${i}`);
    const mt = astro.moonTimes(c.y, c.m, c.d, c.lat, c.lon);
    assert.equal(mt.riseUtcMin !== null, c.hr, `moonrise ${i}`);
    assert.equal(mt.setUtcMin !== null, c.hs, `moonset ${i}`);
    if (mt.riseUtcMin !== null) igual(mt.riseUtcMin, c.mr, `moonrise t ${i}`, 1e-6);
    if (mt.setUtcMin !== null) igual(mt.setUtcMin, c.ms, `moonset t ${i}`, 1e-6);
    const age = astro.moonAgeDays(c.y, c.m, c.d, c.utc);
    igual(age, c.age, `age ${i}`, 1e-8); igual(astro.moonIllumination(age), c.ill, `ill ${i}`, 1e-8);
    assert.equal(astro.moonPhase8(age), c.ph);
    igual(astro.refractionDeg(sun.altDeg), c.refr, `refr ${i}`, 1e-6);
    igual(decimalYear(c.y, c.m, c.d, c.utc), c.dy, `decimalYear ${i}`);
  }
  assert.deepEqual(astro.unixToUtc(Date.UTC(2026, 10, 13, 19, 30) / 1000), { y: 2026, m: 11, d: 13, utcHours: 19.5 });
  assert.equal(astro.moonPhaseNameEs(4), 'Luna llena');
});

test('meteorología, Beaufort y unidades: mismos resultados que el plotter', () => {
  for (const [i, c] of ref.wx.entries()) {
    igual(wx.dewPointC(c.t, c.rh), c.dew, `dew ${i}`);
    igual(wx.relHumidityPct(c.t, c.td), c.rhd, `rh ${i}`);
    igual(wx.windChillC(c.t, c.v), c.wc, `windchill ${i}`);
    igual(wx.heatIndexC(c.t, c.rh), c.hi, `heat ${i}`);
    igual(wx.feelsLikeC(c.t, c.rh, c.v), c.fl, `feels ${i}`);
    igual(wx.seaLevelPressureHpa(c.p, c.h, c.t), c.slp, `slp ${i}`);
    assert.equal(wind.beaufort(c.v), c.bft, `beaufort ${i}`);
    igual(units.speedFromKn(c.v, 'kmh'), c.kmh, `kmh ${i}`);
    igual(units.pressFromHpa(c.p, 'inhg'), c.inhg, `inhg ${i}`);
  }
  assert.equal(wind.beaufortNameEs(7), 'Frescachón');
  assert.equal(units.unitsFor('metric', units.unitsFor('nautical', {} as units.Units)).windSpeed, 'ms');
});

test('movimiento relativo (CPA, viento real, corriente): mismos resultados que el plotter', () => {
  for (const [i, c] of ref.motion.entries()) {
    const own = { pos: { lat: c.o[0], lon: c.o[1] }, sogKn: c.o[2], cogDeg: c.o[3] };
    const tgt = { pos: { lat: c.t[0], lon: c.t[1] }, sogKn: c.t[2], cogDeg: c.t[3] };
    const r = motion.cpa(own, tgt);
    assert.equal(r.moving, c.mv);
    igual(r.cpaNm, c.cpa, `cpa ${i}`, 1e-7); igual(r.tcpaMin, c.tcpa, `tcpa ${i}`, 1e-7);
    const tw = motion.trueWind(c.awa, c.aws, c.boat, c.hdg);
    igualAngulo(tw.twaDeg, c.twa, `twa ${i}`); igual(tw.twsKn, c.tws, `tws ${i}`); igualAngulo(tw.twdDeg, c.twd, `twd ${i}`);
    const aw = motion.apparentWind(tw.twdDeg, tw.twsKn, c.boat, c.hdg);
    igualAngulo(aw.awaDeg, c.awa2, `awa ${i}`, 1e-6); igual(aw.awsKn, c.aws2, `aws ${i}`, 1e-7);
    igual(motion.vmgToWind(c.boat, tw.twaDeg), c.vmg, `vmg ${i}`, 1e-7);
    igual(motion.vmgToWaypoint(own.sogKn, own.cogDeg, c.hdg), c.vmgw, `vmgw ${i}`);
    const cur = motion.current(c.hdg, c.boat, own.cogDeg, own.sogKn);
    igualAngulo(cur.setDeg, c.set, `set ${i}`, 1e-6); igual(cur.driftKn, c.drift, `drift ${i}`);
  }
});

test('modelo magnético WMM2025: mismos resultados que el plotter', () => {
  for (const [i, c] of ref.wmm.entries()) {
    const f = defaultWmm().field(c.lat, c.lon, c.alt, c.yr)!;
    // Los coeficientes del plotter son float de 32 bits: se admite 0,01 nT y 1e-5 grados
    igualAngulo(f.decDeg, c.dec, `dec ${i}`, 1e-4); igual(f.incDeg, c.inc, `inc ${i}`, 1e-5);
    for (const [k, v] of [['hNt', c.h], ['fNt', c.f], ['xNt', c.x], ['yNt', c.y], ['zNt', c.z]] as const) {
      assert.ok(Math.abs(f[k] - v) < 0.05, `${k} ${i}: ${f[k]} != ${v}`);
    }
  }
  // Valor de control: declinación en Sevilla a finales de 2026, ligeramente al este de cero
  const sevilla = magneticDeclination(37.39, -5.99, 2026.87);
  assert.ok(sevilla > -1.5 && sevilla < 1.5, `declinación en Sevilla fuera de lo esperable: ${sevilla}`);
  const w = new Wmm();
  assert.equal(w.load('texto no válido'), false);
  assert.deepEqual([w.name, w.epoch, w.validUntil, w.expired(2031)], ['WMM-2025', 2025, 2030, true]);
});

// ---------------------------------------------------------------------------
// Fórmulas complementarias: se comprueban contra valores publicados
// ---------------------------------------------------------------------------
import * as wxx from '../server/formulas/wxextra';
import * as nautica from '../server/formulas/nautica';
import * as radio from '../server/formulas/radio';
import * as fisica from '../server/formulas/fisica';

const cerca = (obtenido: number, esperado: number, margen: number, etiqueta: string) =>
  assert.ok(Math.abs(obtenido - esperado) <= margen, `${etiqueta}: ${obtenido} no está a ±${margen} de ${esperado}`);

test('meteorología complementaria', () => {
  cerca(wxx.wetBulbC(20, 50), 13.7, 0.05, 'bulbo húmedo (ejemplo de Stull, 2011)');
  cerca(wxx.humidex(30, 15), 34, 0.5, 'humidex (tabla del Servicio Meteorológico de Canadá)');
  cerca(wxx.apparentTemperatureC(30, 50, 2), 31.6, 0.1, 'temperatura aparente');
  cerca(wxx.saturationVaporPressureHpa(20), 23.37, 0.05, 'presión de vapor de saturación a 20 °C');
  cerca(wxx.absoluteHumidityGm3(20, 50), 8.64, 0.05, 'humedad absoluta');
  cerca(wxx.airDensityKgM3(15, 1013.25), 1.225, 0.001, 'densidad del aire ISA');
  cerca(wxx.pressureAltitudeM(1013.25), 0, 0.01, 'altitud de presión a nivel del mar');
  cerca(wxx.pressureAltitudeM(898.76), 1000, 2, 'altitud de presión a 1000 m (ISA)');
  assert.equal(wxx.cloudBaseM(25, 15), 1250);
  assert.deepEqual([wxx.pressureTendency(-4), wxx.pressureTendency(0.5), wxx.pressureTendency(7)], ['bajando rápido', 'estable', 'subiendo muy rápido']);
  assert.deepEqual([2, 5, 7, 9, 11].map(wxx.uvCategory), ['Bajo', 'Moderado', 'Alto', 'Muy alto', 'Extremo']);
  assert.deepEqual([0, 1, 10, 20, 45, 80].map(wxx.rainIntensity), ['sin lluvia', 'débil', 'moderada', 'fuerte', 'muy fuerte', 'torrencial']);
});

test('náutica complementaria', () => {
  cerca(nautica.horizonDistanceNm(4), 4.16, 0.01, 'horizonte a 4 m');
  cerca(nautica.geographicRangeNm(4, 25), 14.56, 0.01, 'alcance geográfico');
  cerca(nautica.hullSpeedKn(9.144), 7.34, 0.01, 'velocidad de casco con 30 pies de eslora');
  assert.deepEqual([0, 0.3, 1.0, 3, 5, 8, 12, 20].map(nautica.douglasSeaState), [0, 2, 3, 5, 6, 7, 8, 9]);
  assert.deepEqual([nautica.douglasNameEs(3), nautica.douglasNameEs(7)], ['Marejada', 'Arbolada']);
  assert.deepEqual([0, 45, 247, 350].map(nautica.compassPointEs), ['N', 'NE', 'OSO', 'N']);
});

test('radio', () => {
  assert.equal(radio.maidenhead(37.3891, -5.9845), 'IM77aj'); // Sevilla (centro; al oeste de 6° O ya es IM67)
  assert.equal(radio.maidenhead(40.4168, -3.7038), 'IN80dk'); // Madrid
  const centro = radio.maidenheadToLatLon('IM77aj')!;
  assert.equal(radio.maidenhead(centro.lat, centro.lon), 'IM77aj');
  assert.equal(radio.maidenheadToLatLon('ZZ99'), null);
  cerca(radio.wavelengthM(144.8), 2.0704, 0.001, 'longitud de onda en 144,800');
  cerca(radio.freeSpacePathLossDb(144.8, 10), 95.67, 0.01, 'pérdida en espacio libre');
  cerca(radio.radioHorizonKm(100), 41.2, 0.01, 'horizonte radio');
  cerca(radio.lineOfSightKm(10, 2), 18.86, 0.01, 'línea de vista');
  cerca(radio.fresnelRadiusM(144.8, 5, 5), 71.97, 0.05, 'primera zona de Fresnel');
  cerca(radio.wattsToDbm(5), 36.99, 0.01, 'dBm');
  cerca(radio.dbmToWatts(40), 10, 1e-9, 'W');
  cerca(radio.eirpWatts(25, 6, 1.5), 70.46, 0.05, 'PIRE');
  cerca(radio.swr(100, 4), 1.5, 1e-9, 'ROE');
  cerca(radio.returnLossDb(1.5), 13.98, 0.01, 'pérdida de retorno');
  assert.deepEqual([radio.sMeter(-73), radio.sMeter(-79), radio.sMeter(-53), radio.sMeter(-93, 144.8), radio.sMeter(-140)], ['S9', 'S8', 'S9+20', 'S9', 'S0']);
  cerca(radio.phgRangeMiles(25, 40, 6), 13.36, 0.05, 'alcance PHG');
});

test('sismología y radiación', () => {
  cerca(Math.log10(fisica.seismicEnergyJ(5)), 12.3, 1e-9, 'energía de un M5');
  cerca(fisica.seismicEnergyRatio(6, 5), 31.62, 0.01, 'una unidad de magnitud');
  cerca(fisica.tntTons(fisica.seismicEnergyJ(5)), 477, 1, 'equivalente en TNT de un M5');
  cerca(fisica.hypocentralDistanceKm(30, 40), 50, 1e-9, 'distancia hipocentral');
  const llegada = fisica.seismicArrivalS(175, 10);
  cerca(llegada.sS, 50.08, 0.05, 'llegada de la onda S');
  assert.ok(llegada.pS < llegada.sS && llegada.leadS > 20);
  cerca(fisica.annualDoseMSv(0.12), 1.052, 0.001, 'dosis anual con fondo natural');
  assert.equal(fisica.uSvToMrem(10), 1);
  assert.equal(fisica.nSvhToUSvh(120), 0.12);
  assert.deepEqual([0.12, 0.5, 2].map(fisica.doseRateLevel), ['normal', 'aviso', 'alto']);
});
