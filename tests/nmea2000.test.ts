// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  n2kId, n2kParseId, n2kName, ReclamoDireccion, latLonRapida, cogSogRapida, horaSistema, viento, presion,
  temperaturaExt, xte, datosNav, tramasFastPacket, mensajeSeguridadAis, EmisorN2k, type TramaCan, type ConfigN2k, CONFIG_N2K_DEFECTO,
} from '../server/conectividad/nmea2000';

const u16 = (a: Uint8Array, o: number) => a[o] | (a[o + 1] << 8);
const i32 = (a: Uint8Array, o: number) => new DataView(a.buffer).getInt32(o, true);
const u32 = (a: Uint8Array, o: number) => new DataView(a.buffer).getUint32(o, true);

test('identificador de 29 bits', () => {
  assert.equal(n2kId(2, 130306, 0x23) >>> 0, 0x09fd0223);
  assert.equal(n2kId(6, 60928, 0x23, 255) >>> 0, 0x18eeff23);
  assert.equal(n2kId(6, 59904, 0x23, 5) >>> 0, 0x18ea0523);
  const p = n2kParseId(n2kId(3, 129284, 0x47));
  assert.equal(p.pgn, 129284);
  assert.equal(p.src, 0x47);
  assert.equal(p.prio, 3);
});

test('posicion y COG/SOG', () => {
  const pos = latLonRapida(37.5, -5.5);
  assert.equal(i32(pos, 0), 375000000);
  assert.equal(i32(pos, 4), -55000000);
  const cs = cogSogRapida(5, Math.PI / 2, 10 * 1852 / 3600);
  assert.equal(cs[0], 5);
  assert.equal(u16(cs, 2), 15708);            // 90 grados en 0,0001 rad
  assert.equal(u16(cs, 4), 514);              // 10 nudos = 5,144 m/s en 0,01 m/s
});

test('hora, viento, presion, temperatura', () => {
  const t = horaSistema(3, 1763150400 + 3661);           // 01:01:01 de ese día
  assert.equal(u16(t, 2), Math.floor((1763150400 + 3661) / 86400));
  const w = viento(2, 5.0, Math.PI, 0);                  // del sur (180 grados)
  assert.equal(u16(w, 1), 500);                          // 5 m/s
  assert.equal(u16(w, 3), 31416);                        // pi en 0,0001 rad
  assert.equal(w[5], 0xf8);                              // ref 0
  const pr = presion(1, 101325);
  assert.equal(u32(pr, 3), 1013250);                     // 0,1 Pa
  const tp = temperaturaExt(1, 293.15);                  // 20 C
  assert.equal(tp[3] | (tp[4] << 8) | (tp[5] << 16), 293150);   // 0,001 K
});

test('XTE y datos de navegacion', () => {
  const x = xte(5, 12.34, false);
  assert.equal(x[1], 0x30);
  assert.equal(i32(x, 2), 1234);
  const nd = datosNav(9, { distanciaM: 1852, demoraPosicionDestinoRad: Math.PI / 2, destLat: 37.5, destLon: -5.5, wpDestino: 2, enLlegada: true, loxodromica: true, velAcercamientoMs: 1.23 });
  assert.equal(nd.length, 34);
  assert.equal(u32(nd, 1), 185200);
  assert.equal(nd[5], (1 << 4) | (1 << 6));
  assert.equal(u16(nd, 14), 15708);
  assert.equal(u32(nd, 20), 2);
  assert.equal(i32(nd, 24), 375000000);
});

test('fast packet', () => {
  const payload = new Uint8Array(34).map((_, i) => i);
  const fr = tramasFastPacket(payload, 3);
  assert.equal(fr.length, 5);
  assert.equal(fr[0][0], (3 << 5) | 0);
  assert.equal(fr[0][1], 34);
  assert.equal(fr[0][2], 0);
  assert.equal(fr[1][0], (3 << 5) | 1);
  assert.equal(fr[1][1], 6);                 // payload[6]
  const corto = tramasFastPacket(new Uint8Array([1, 2, 3, 4, 5]), 0);
  assert.equal(corto.length, 1);
  assert.equal(corto[0][1], 5);
  assert.equal(corto[0][7], 0xff);
});

test('129802 mensaje de seguridad AIS', () => {
  const p = mensajeSeguridadAis(8000123, 0, 'SISMO 5.2');
  assert.equal(p[0], 0x0e);                     // mensaje 14
  assert.equal(u32(p, 1), 8000123);
  assert.equal(p[5], 0x01);                     // transceiver 0, bit reservado 1
  assert.equal(p[6], 2 + 9);                    // STRINGLAU: 2 + "SISMO 5.2"
  assert.equal(p[7], 0x01);                     // ASCII
  assert.equal(String.fromCharCode(...p.slice(8, 8 + 9)), 'SISMO 5.2');
  assert.equal(p[p.length - 1], 0xff);          // SID
});

test('NAME: orden de los campos', () => {
  const name = n2kName({ unico: 0x12345, clase: 60, funcion: 130 });
  assert.equal(Number(name & 0x1fffffn), 0x12345);
  assert.equal(Number((name >> 49n) & 0x7fn), 60);
  assert.equal(Number((name >> 63n) & 1n), 1);           // dirección arbitraria
});

test('reclamo de direccion: arranca, defiende y cede', () => {
  const name = n2kName({ unico: 0x1000 });               // NAME alto
  const r = new ReclamoDireccion(name, 60);
  const arr = r.arrancar(0);
  assert.equal(n2kParseId(arr.id).pgn, 60928);
  assert.equal(r.direccion(), 60);
  assert.equal(r.listo(100), false);
  assert.equal(r.listo(300), true);
  // otro equipo con NAME más bajo reclama la 60: cedemos
  const bajo = new Uint8Array(8);                          // NAME 0 (el más bajo gana)
  const out = r.alRecibir(n2kId(6, 60928, 60, 255), bajo, 400);
  assert.ok(out && r.direccion() !== 60 && r.cambios === 1);
});

test('emisor: reclama y emite los PGN activados', () => {
  const tramas: TramaCan[] = [];
  const transporte = { enviar: (t: TramaCan) => tramas.push({ id: t.id, datos: t.datos.slice() }) };
  const cfg: ConfigN2k = { ...CONFIG_N2K_DEFECTO, activo: true, direccion: 60 };
  const em = new EmisorN2k(transporte, cfg, {
    posicion: () => ({ lat: 37.5, lon: -5.5, cogRad: 0, sogMs: 2 }),
    horaUnix: () => 1763150400,
    viento: () => ({ velMs: 6, direccionRad: 1 }),
    presionPa: () => 101000,
    temperaturaK: () => 290,
    navegacion: () => ({ distanciaM: 1000, xteM: 5, demoraPosicionDestinoRad: 1, destLat: 37.6, destLon: -5.4, wpDestino: 1 }),
  });
  em.arrancar(0);
  em.tick(100);                   // aún no listo (250 ms)
  const antes = tramas.length;
  em.tick(300);                   // listo: emite
  const pgns = tramas.slice(antes).map((t) => n2kParseId(t.id).pgn);
  for (const pgn of [129025, 129026, 126992, 130306, 130314, 130316, 129283, 129284]) assert.ok(pgns.includes(pgn), `falta PGN ${pgn}`);
  assert.ok(tramas.every((t) => n2kParseId(t.id).src === 60));
});
