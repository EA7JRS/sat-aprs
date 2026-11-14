// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoBandas, ionosondaCercana, leerIonosondas, mejorBanda } from '../server/propagacion';

const T = Date.parse('2026-11-14T13:00:00Z');
const SEVILLA = { lat: 37.3891, lon: -5.9845 };

test('bandas de HF: NVIS por foF2, larga distancia por MUF, absorción por LUF', () => {
  const b = estadoBandas({ fof2: 8.4, muf3000: 26, luf: 3 });
  const de = (n: string) => b.find((x) => x.nombre === n)!;
  assert.deepEqual([de('160 m').nvis, de('160 m').dx], ['absorbida', 'absorbida']);
  assert.deepEqual([de('80 m').nvis, de('40 m').nvis, de('30 m').nvis], ['abierta', 'abierta', 'cerrada']); // 7,1 ≤ 0,85·8,4
  assert.deepEqual([de('20 m').dx, de('15 m').dx, de('12 m').dx, de('10 m').dx], ['abierta', 'abierta', 'justa', 'cerrada']);
  assert.equal(mejorBanda(b, 'nvis'), '40 m');
  assert.equal(mejorBanda(b, 'dx'), '15 m');
  // Con foF2 justo por encima de la banda, queda «justa»
  assert.equal(estadoBandas({ fof2: 7.5 }).find((x) => x.nombre === '40 m')!.nvis, 'justa');
});

test('bandas de HF: sin medida no se afirma nada', () => {
  const b = estadoBandas({ muf3000: 20 });
  assert.ok(b.every((x) => x.nvis === 'sin dato'));
  assert.equal(mejorBanda(b, 'nvis'), null);
  assert.ok(estadoBandas({}).every((x) => x.dx === 'sin dato'));
});

const LISTA = [
  { station: { name: 'El Arenosillo', code: 'EA036', latitude: '37.1', longitude: '353.3' }, time: '2026-11-14T12:45:00', cs: '85', fof2: '8.4', mufd: '26.1', hmf2: '262' },
  { station: { name: 'Roquetes', code: 'EB040', latitude: '40.8', longitude: '0.5' }, time: '2026-11-14T12:50:00', cs: 100, fof2: 7.9, mufd: 25.0, hmf2: 250 },
  { station: { name: 'Antigua', code: 'XX001', latitude: '37.2', longitude: '353.4' }, time: '2026-11-14T06:00:00', cs: '90', fof2: '4.0', mufd: '12' },
  { station: { name: 'Dudosa', code: 'XX002', latitude: '37.3', longitude: '354.0' }, time: '2026-11-14T12:55:00', cs: '10', fof2: '15.0', mufd: '40' },
  { station: { name: 'Boulder', code: 'BC840', latitude: '40.0', longitude: '254.7' }, time: '2026-11-14T12:55:00', cs: '90', fof2: '6.0', mufd: '20' },
  { station: { name: 'Sin foF2', code: 'XX003', latitude: '37.0', longitude: '354.0' }, time: '2026-11-14T12:55:00', cs: '90', fof2: null, mufd: null },
  { basura: true },
];

test('ionosondas: lectura tolerante y longitudes de 0 a 360', () => {
  const l = leerIonosondas(LISTA);
  assert.equal(l.length, 5); // fuera la que no tiene foF2 y la entrada sin datos
  assert.deepEqual([l[0].nombre, l[0].lon, l[0].fof2, l[0].muf3000, l[0].hmf2, l[0].confianza], ['El Arenosillo', 353.3 - 360, 8.4, 26.1, 262, 85]);
  assert.equal(l[0].cuando, Date.parse('2026-11-14T12:45:00Z'));
  assert.deepEqual(leerIonosondas({ error: 'x' }), []);
  assert.deepEqual(leerIonosondas(null), []);
});

test('ionosondas: la más cercana, reciente y fiable', () => {
  const l = leerIonosondas(LISTA);
  const e = ionosondaCercana(l, SEVILLA, T)!;
  assert.equal(e.codigo, 'EA036');                       // ni la antigua ni la de escalado dudoso, aunque estén cerca
  assert.ok(e.distanciaKm! > 50 && e.distanciaKm! < 80, String(e.distanciaKm));
  assert.equal(ionosondaCercana(l, { lat: 41.4, lon: 2.2 }, T)!.codigo, 'EB040');
  assert.equal(ionosondaCercana(l, { lat: -34, lon: 151 }, T), null);   // ninguna a menos de 1500 km
  assert.equal(ionosondaCercana(l, SEVILLA, T + 6 * 3600_000), null);   // todas viejas
});
