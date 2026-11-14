// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { Barcos, LectorAis, claseBarco, leerCargaAis, sumaNmeaValida } from '../server/ais';
import { Aeronaves, emergenciaSquawk, leerSbs } from '../server/adsb';

const cerca = (a: number | undefined, b: number, tol = 0.0005) => assert.ok(a !== undefined && Math.abs(a - b) < tol, `${a} ≠ ${b}`);

// Codificador de prueba: construye la carga de 6 bits a partir de campos (ancho, valor)
function carga(campos: Array<[number, number | string]>): string {
  const bits: number[] = [];
  for (const [n, v] of campos) {
    if (typeof v === 'string') {
      const t = v.toUpperCase().padEnd(n / 6, '@');
      for (const c of t) { const x = c.charCodeAt(0) >= 64 ? c.charCodeAt(0) - 64 : c.charCodeAt(0); for (let i = 5; i >= 0; i--) bits.push((x >> i) & 1); }
    } else {
      const x = v < 0 ? v + 2 ** n : v;
      for (let i = n - 1; i >= 0; i--) bits.push(Math.floor(x / 2 ** i) % 2);
    }
  }
  while (bits.length % 6) bits.push(0);
  let s = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = bits.slice(i, i + 6).reduce((a, b) => a * 2 + b, 0);
    v += 48; if (v > 87) v += 8;
    s += String.fromCharCode(v);
  }
  return s;
}
const nmea = (cuerpo: string) => { let x = 0; for (const c of cuerpo) x ^= c.charCodeAt(0); return `!${cuerpo}*${x.toString(16).toUpperCase().padStart(2, '0')}`; };

test('AIS: mensaje de posición real (tipo 1)', () => {
  // Sentencia de ejemplo muy difundida: MMSI 477553000, amarrado en Seattle
  const s = '!AIVDM,1,1,,B,177KQJ5000G?tO`K>RA1wUbN0TKH,0*5C';
  assert.equal(sumaNmeaValida(s), true);
  const m = new LectorAis().linea(s)!;
  assert.equal(m.tipo, 1);
  assert.equal(m.mmsi, 477553000);
  cerca(m.lat, 47.58283); cerca(m.lon, -122.34583);
  assert.equal(m.sog, 0);
  assert.equal(m.estado, 5);
});

test('AIS: suma de comprobación errónea y texto que no es AIS', () => {
  const l = new LectorAis();
  assert.equal(l.linea('!AIVDM,1,1,,B,177KQJ5000G?tO`K>RA1wUbN0TKH,0*5D'), null);
  assert.equal(l.linea('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A'), null);
  assert.equal(l.descartadas, 1);
});

test('AIS: posición de clase A, clase B y largo alcance (construidas)', () => {
  // 36°31.8' N, 6°16.2' W (bahía de Cádiz)
  const lat = Math.round(36.53 * 600000), lon = Math.round(-6.27 * 600000);
  const a = leerCargaAis(carga([[6, 3], [2, 0], [30, 224123456], [4, 0], [8, 0], [10, 123], [1, 1], [28, lon], [27, lat], [12, 2715], [9, 270], [6, 30], [2, 0], [3, 0], [1, 0], [19, 0]]))!;
  assert.deepEqual([a.tipo, a.mmsi, a.sog, a.cog, a.proa], [3, 224123456, 12.3, 271.5, 270]);
  cerca(a.lat, 36.53); cerca(a.lon, -6.27);
  const b = leerCargaAis(carga([[6, 18], [2, 0], [30, 224999001], [8, 0], [10, 55], [1, 0], [28, lon], [27, lat], [12, 900], [9, 511], [6, 0], [2, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [20, 0]]))!;
  assert.deepEqual([b.tipo, b.sog, b.cog, b.proa], [18, 5.5, 90, undefined]);
  cerca(b.lat, 36.53);
  const largo = leerCargaAis(carga([[6, 27], [2, 0], [30, 224000111], [1, 0], [1, 0], [4, 0], [18, Math.round(-6.27 * 600)], [17, Math.round(36.53 * 600)], [6, 12], [9, 200], [1, 0], [1, 0]]))!;
  cerca(largo.lat, 36.53, 0.002); cerca(largo.lon, -6.27, 0.002);
  assert.equal(largo.sog, 12);
  // Posición «no disponible» (181°, 91°)
  const sin = leerCargaAis(carga([[6, 1], [2, 0], [30, 224123456], [4, 15], [8, 128], [10, 1023], [1, 0], [28, 181 * 600000], [27, 91 * 600000], [12, 3600], [9, 511], [6, 60], [2, 0], [3, 0], [1, 0], [19, 0]]))!;
  assert.deepEqual([sin.lat, sin.lon, sin.sog, sin.cog], [undefined, undefined, undefined, undefined]);
});

test('AIS: datos estáticos en dos fragmentos (tipo 5) y tipo 24', () => {
  const c5 = carga([[6, 5], [2, 0], [30, 224123456], [2, 0], [30, 9123456], [42, 'EA7XYZ'], [120, 'NUEVO AMANECER'], [8, 36], [9, 5], [9, 7], [6, 2], [6, 2], [4, 1], [4, 6], [5, 15], [5, 10], [6, 0], [8, 21], [120, 'CADIZ'], [1, 0], [1, 0]]);
  const l = new LectorAis();
  const mitad = Math.ceil(c5.length / 2);
  assert.equal(l.linea(nmea(`AIVDM,2,1,7,A,${c5.slice(0, mitad)},0`)), null);
  const m = l.linea(nmea(`AIVDM,2,2,7,A,${c5.slice(mitad)},2`))!;
  assert.deepEqual([m.tipo, m.nombre, m.indicativo, m.tipoBarco, m.destino], [5, 'NUEVO AMANECER', 'EA7XYZ', 36, 'CADIZ']);
  // Un segundo fragmento sin el primero se ignora
  assert.equal(l.linea(nmea(`AIVDM,2,2,9,A,${c5.slice(mitad)},2`)), null);
  const a = leerCargaAis(carga([[6, 24], [2, 0], [30, 224999001], [2, 0], [120, 'LA GAVIOTA'], [8, 0]]))!;
  assert.equal(a.nombre, 'LA GAVIOTA');
  assert.equal(claseBarco(36), 'Velero');
});

test('AIS: el almacén une posición y nombre, y caduca', () => {
  const b = new Barcos(600_000);
  const t = 1_000_000_000_000;
  b.anotar({ tipo: 5, mmsi: 224123456, nombre: 'NUEVO AMANECER', tipoBarco: 36 }, t);
  assert.equal(b.lista(t).length, 0); // sin posición aún no sale en el mapa
  b.anotar({ tipo: 1, mmsi: 224123456, lat: 36.53, lon: -6.27, sog: 5 }, t + 1000);
  const [x] = b.lista(t + 1000);
  assert.deepEqual([x.nombre, x.lat, x.sog], ['NUEVO AMANECER', 36.53, 5]);
  assert.equal(b.lista(t + 700_000).length, 0);
});

test('ADS-B: mensajes SBS que se van sumando por aeronave', () => {
  const a = new Aeronaves(60_000);
  const t = 1_000_000_000_000;
  a.linea('MSG,1,1,1,3443C2,1,2026/11/14,12:00:00.000,2026/11/14,12:00:00.000,IBE3170 ,,,,,,,,,,,0', t);
  assert.equal(a.lista(t).length, 0);
  a.linea('MSG,3,1,1,3443C2,1,2026/11/14,12:00:01.000,2026/11/14,12:00:01.000,,36000,,,37.4180,-5.8930,,,0,0,0,0', t + 1000);
  a.linea('MSG,4,1,1,3443C2,1,2026/11/14,12:00:02.000,2026/11/14,12:00:02.000,,,451,272,,,-64,,,,,', t + 2000);
  a.linea('MSG,6,1,1,3443C2,1,2026/11/14,12:00:03.000,2026/11/14,12:00:03.000,,,,,,,,7700,0,1,0,0', t + 3000);
  const [x] = a.lista(t + 3000);
  assert.deepEqual([x.hex, x.vuelo, x.altitud, x.velocidad, x.rumbo, x.squawk, x.enTierra], ['3443C2', 'IBE3170', 36000, 451, 272, '7700', false]);
  cerca(x.lat, 37.418); cerca(x.lon, -5.893);
  assert.equal(emergenciaSquawk(x.squawk), 'Emergencia');
  assert.equal(a.lista(t + 120_000).length, 0);
});

test('ADS-B: líneas que no valen', () => {
  assert.equal(leerSbs('STA,,1,1,3443C2,1,,,,,,,,,,,,,,,,'), null);
  assert.equal(leerSbs('MSG,3,1,1,ZZZZZZ,1,,,,,,1000,,,37.4,-5.9,,,,,,'), null);
  assert.equal(leerSbs('MSG,3,1,1,3443C2,1,,,,,,1000,,,97.4,-5.9,,,,,,')!.lat, undefined);
  assert.equal(leerSbs('basura'), null);
});
