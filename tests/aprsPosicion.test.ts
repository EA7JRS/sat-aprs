// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import { leerPosicionAprs } from '../server/aprsPosicion';
import { EstacionesOidas } from '../server/estaciones';
import { ClienteAprsIs } from '../server/aprsIs';
import { balizaPosicion } from '../server/estacion/baliza';
import { objetoAprs } from '../server/core/aprsAvisos';
import { parseTnc2 } from '../server/aprs';

const cerca = (a: number, b: number, tol = 0.001) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('posición sin comprimir, con y sin hora (ejemplos de la especificación APRS)', () => {
  const p = leerPosicionAprs('EA7ZZZ-9', 'APRS', '!4903.50N/07201.75W-Test 001234')!;
  cerca(p.lat, 49.0583); cerca(p.lon, -72.0292);
  assert.equal(p.simbolo, '/-');
  assert.equal(p.comentario, 'Test 001234');
  const h = leerPosicionAprs('EA7ZZZ', 'APRS', '@092345z4903.50N/07201.75W>088/036Hola')!;
  cerca(h.lat, 49.0583);
  assert.equal(h.simbolo, '/>');
  assert.equal(h.comentario, 'Hola');
  const s = leerPosicionAprs('VK2ZZZ', 'APRS', '=3352.00S/15112.00E#PHG5132Digi')!;
  cerca(s.lat, -33.8667); cerca(s.lon, 151.2);
  assert.equal(s.comentario, 'Digi');
});

test('posición comprimida (ejemplo de la especificación: 49°30\' N, 72°45\' W)', () => {
  const p = leerPosicionAprs('EA7ZZZ', 'APRS', '=/5L!!<*e7>7P[')!;
  cerca(p.lat, 49.5); cerca(p.lon, -72.75);
  assert.equal(p.simbolo, '/>');
});

test('objetos e ítems, y su baja', () => {
  const o = leerPosicionAprs('EA7ZZZ', 'APRS', ';LEADER   *092345z4903.50N/07201.75W>088/036')!;
  assert.deepEqual([o.nombre, o.origen, o.clase, o.baja], ['LEADER', 'EA7ZZZ', 'objeto', false]);
  assert.equal(leerPosicionAprs('EA7ZZZ', 'APRS', ';LEADER   _092345z4903.50N/07201.75W>')!.baja, true);
  const i = leerPosicionAprs('EA7ZZZ', 'APRS', ')AID #2!4903.50N/07201.75WA')!;
  assert.deepEqual([i.nombre, i.clase, i.simbolo], ['AID #2', 'item', '/A']);
});

test('Mic-E: latitud en el destino, longitud con y sin desplazamiento de 100°', () => {
  // S32UVT: 33°25.64' N; la V (5.º carácter) suma 100° y la T (6.º) indica oeste
  const p = leerPosicionAprs('EA7ZZZ-9', 'S32UVT', '`(_fn"Oj/')!;
  cerca(p.lat, 33.4273); cerca(p.lon, -112.129);
  assert.equal(p.simbolo, '/j');
  // S32U6T: sin desplazamiento, 12°07.74' W
  cerca(leerPosicionAprs('EA7ZZZ-9', 'S32U6T', '`(_fn"Oj/')!.lon, -12.129);
  // 3723.35 N, 005°59.07' W (Sevilla): destino 3W2S3U; grados 5 → 5+100+90 = 195 → carácter 195-100+28
  const info = '`' + String.fromCharCode(95 + 28, 59 + 28, 7 + 28) + '   >/';
  const s = leerPosicionAprs('EA7ZZZ-9', '3W2SSU', info)!;
  cerca(s.lat, 37.3892); cerca(s.lon, -5.9845);
});

test('tramas de terceros y tramas sin posición', () => {
  const p = leerPosicionAprs('EA7GAT', 'APRS', '}EA7ZZZ-7>APRS,TCPIP,EA7GAT*:!4903.50N/07201.75W[A pie')!;
  assert.equal(p.nombre, 'EA7ZZZ-7');
  assert.equal(leerPosicionAprs('EA7ZZZ', 'APRS', ':BLN1     :Hola'), null);
  assert.equal(leerPosicionAprs('EA7ZZZ', 'APRS', '>Estado'), null);
  assert.equal(leerPosicionAprs('EA7ZZZ', 'APRS', '!9903.50N/07201.75W-'), null);
  assert.equal(leerPosicionAprs('EA7ZZZ', 'APRS', '!0000.00N/00000.00W-'), null);
});

test('lee lo que emite la propia estación: baliza y objeto de aviso', () => {
  const b = parseTnc2(balizaPosicion({ callsign: 'EA7ZZZ-10', lat: 37.3891, lon: -5.9845, comment: 'Prueba' })!)!;
  const p = leerPosicionAprs(b.source, b.destination, b.info)!;
  cerca(p.lat, 37.3891); cerca(p.lon, -5.9845);
  const o = parseTnc2(objetoAprs('EA7ZZZ-10', { id: 'x', tipo: 'sismo', gravedad: 'amarillo', titulo: 'Moron', detalle: 'M3.4', lat: 37.12, lon: -5.45, inicio: Date.parse('2026-09-10T11:32:00Z'), fuente: 'IGN', real: true })!)!;
  const q = leerPosicionAprs(o.source, o.destination, o.info)!;
  assert.equal(q.clase, 'objeto');
  cerca(q.lat, 37.12); cerca(q.lon, -5.45);
});

test('estaciones oídas: RF prevalece, bajas y caducidad', () => {
  const e = new EstacionesOidas(3600_000);
  const t = 1_000_000_000_000;
  assert.equal(e.anotar('EA7ZZZ', 'APRS', '>sin posicion', 'RF', t), null);
  assert.equal(e.anotar('EA7ZZZ-9', 'APRS', '!4903.50N/07201.75W>', 'RF', t)!.via, 'RF');
  assert.equal(e.anotar('EA7ZZZ-9', 'APRS', '!4904.50N/07201.75W>', 'IS', t + 60_000)!.via, 'RF');
  assert.equal(e.anotar('EA7ZZZ-9', 'APRS', '!4904.50N/07201.75W>', 'IS', t + 40 * 60_000)!.via, 'IS');
  assert.equal(e.lista(t + 40 * 60_000)[0].tramas, 3);
  e.anotar('EA7ZZZ', 'APRS', ';OBJ      *092345z4903.50N/07201.75W>', 'IS', t);
  assert.equal(e.total, 2);
  e.anotar('EA7ZZZ', 'APRS', ';OBJ      _092345z4903.50N/07201.75W>', 'IS', t + 1);
  assert.equal(e.total, 1);
  assert.equal(e.lista(t + 3 * 3600_000).length, 0);
});

test('APRS-IS: una sola sesión para recibir y emitir', async () => {
  const recibidoPorServidor: string[] = [];
  const servidor = net.createServer((s) => {
    s.write('# aprsc 2.1\r\n');
    s.on('data', (d) => {
      for (const l of d.toString('latin1').split('\r\n').filter(Boolean)) {
        recibidoPorServidor.push(l);
        if (l.startsWith('user ')) {
          s.write(`# logresp EA7ZZZ-10 ${/pass 123/.test(l) ? 'verified' : 'unverified'}, server T2TEST\r\n`);
          s.write('EA7AAA>APRS,qAC,T2TEST:!4903.50N/07201.75W-\r\n# latido\r\n');
        }
      }
    });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const puerto = (servidor.address() as net.AddressInfo).port;
  const lineas: string[] = [];
  const estados: string[] = [];
  const c = new ClienteAprsIs({ alRecibir: (l) => lineas.push(l), alCambiar: (e) => estados.push(e) });
  const base = { servidor: '127.0.0.1', puerto, indicativo: 'EA7ZZZ-10', filtro: 'r/37.4/-6.0/150', version: 'test' };

  c.iniciar({ ...base, passcode: '123' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(c.estado, 'conectado');
  assert.deepEqual(lineas, ['EA7AAA>APRS,qAC,T2TEST:!4903.50N/07201.75W-']);
  assert.match(recibidoPorServidor[0], /^user EA7ZZZ-10 pass 123 vers SAT-APRS test filter r\/37\.4\/-6\.0\/150$/);
  assert.equal(c.enviar('EA7ZZZ-10>APZSAT,TCPIP*:>prueba'), true);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(recibidoPorServidor.at(-1), 'EA7ZZZ-10>APZSAT,TCPIP*:>prueba');

  c.iniciar({ ...base, passcode: '-1' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(c.estado, 'solo-recepcion');
  assert.equal(c.enviar('EA7ZZZ-10>APZSAT,TCPIP*:>no debe salir'), false);

  c.parar();
  assert.equal(c.estado, 'parado');
  await new Promise<void>((r) => servidor.close(() => r()));
  assert.ok(estados.includes('conectando'));
});
