// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import {
  DesentramadorKiss, EnlaceTracker, bytesLora, comprobarTracker, conflictosLora, debePasarAIs, leerEquipos, leerEstado,
  saltosRuta, tiempoEnAireMs, type EstadoTracker,
} from '../server/radio/aprsLoraPlus';
import { kissEncode } from '../server/aprs';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond: () => boolean, ms = 6000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await espera(25); }
}

// Lo que responde el firmware en /api/status (BLE_Control::statusJson)
const ESTADO = {
  e: 'status', mode: 0, profile: 0, lora: 0, digi: false, smart: true, sos: false, batt: 3.98, up: 86400, bleKiss: true,
  f: 433775000, mod: 'LoRa', call: 'EA7XXX-7', ver: '5.4.8', board: 'ttgo_t_beam_s3_SUPREME_v3', sf: 12, bw: 125000, cr: 5, pwr: 20,
  path: 'WIDE1-1', kiss: { tcp: true, port: 8001, clients: 1, ble: false }, heap: 201234,
};
const estado = (cambios: Record<string, unknown> = {}): EstadoTracker => leerEstado({ ...ESTADO, ...cambios })!;

test('equipos: direcciones, puertos y límite', () => {
  assert.deepEqual(leerEquipos('192.168.1.60, aprs-lora-plus.local:8002'), [{ equipo: '192.168.1.60', puerto: 8001 }, { equipo: 'aprs-lora-plus.local', puerto: 8002 }]);
  assert.deepEqual(leerEquipos('a b c d e f').length, 4);
  assert.deepEqual(leerEquipos('192.168.1.60 192.168.1.60'), [{ equipo: '192.168.1.60', puerto: 8001 }]);
  assert.deepEqual(leerEquipos('http://x, host:0, host:70000, ;rm -rf'), []);
  assert.deepEqual(leerEquipos(''), []);
});

test('KISS: tramas partidas, escapado y órdenes que no son datos', () => {
  const d = new DesentramadorKiss();
  const a = kissEncode(Buffer.from([1, 0xc0, 2, 0xdb, 3]));
  assert.deepEqual(d.dar(a.subarray(0, 3)), []);
  const r = d.dar(Buffer.concat([a.subarray(3), Buffer.from([0xc0, 0x01, 50, 0xc0]), kissEncode(Buffer.from('hola'))]));
  assert.equal(r.length, 2);
  assert.deepEqual([...r[0]], [1, 0xc0, 2, 0xdb, 3]);
  assert.equal(r[1].toString(), 'hola');
  assert.deepEqual(d.dar(Buffer.alloc(5000, 65)), []);     // basura sin FEND: se descarta
  assert.equal(d.dar(kissEncode(Buffer.from('x')))[0].toString(), 'x');
});

test('estado: /api/status del tracker', () => {
  const e = estado();
  assert.equal(e.indicativo, 'EA7XXX-7');
  assert.equal(e.modoNombre, 'APRS LoRa');
  assert.equal(e.frecuencia, 433775000);
  assert.equal(e.kissTcp, true);
  assert.equal(e.kissBle, false);
  assert.equal(leerEstado({ e: 'gnss' }), null);
  assert.equal(leerEstado('OK'), null);
  assert.equal(leerEstado({ e: 'status', mode: 3, call: 'ea7xxx\u0007<b>' })!.indicativo, 'EA7XXX<B>');
  assert.equal(leerEstado({ e: 'status', mode: 99 })!.modoNombre, 'modo 99');
});

test('comprobación: lo que se ve desde fuera', () => {
  assert.deepEqual(comprobarTracker(estado()), []);
  const ids = (c: Record<string, unknown>) => comprobarTracker(estado(c)).map((h) => `${h.id}:${h.nivel}`).sort();
  assert.deepEqual(ids({ call: 'NOCALL-7' }), ['nocall:error']);
  assert.deepEqual(ids({ f: 433900000 }), ['canal:aviso']);
  assert.deepEqual(ids({ f: 434855000, sf: 9, cr: 7 }), []);
  assert.deepEqual(ids({ sf: 9 }), ['parametros:nota']);
  assert.deepEqual(ids({ path: 'WIDE1-1,WIDE2-2' }), ['ruta:aviso']);
  assert.deepEqual(ids({ path: 'WIDE1-1,WIDE2-1' }), []);
  assert.deepEqual(ids({ digi: true }), ['digi-movil:aviso']);
  assert.deepEqual(ids({ digi: true, smart: false }), []);
  assert.deepEqual(ids({ kiss: { tcp: true, ble: true } }), ['kiss:aviso']);
  assert.deepEqual(ids({ mode: 3, f: 432300000 }), []);      // otros modos: no se mira el canal LoRa
  assert.deepEqual(saltosRuta('wide1-1, WIDE2-2,EA7XXX'), { saltos: 4, nMax: 2 });
});

test('tiempo en el aire (Semtech) y bytes de una trama', () => {
  // SF12, 125 kHz, CR 4/5, 60 bytes: 12,25 + 68 símbolos de 32,768 ms
  assert.equal(Math.round(tiempoEnAireMs(60, 12, 125000, 5)), 2630);
  // SF7, 125 kHz, CR 4/5, 20 bytes: 12,25 + 43 símbolos de 1,024 ms
  assert.equal(Math.round(tiempoEnAireMs(20, 7, 125000, 5) * 10) / 10, 56.6);
  assert.equal(tiempoEnAireMs(60, 13, 125000, 5), 0);
  assert.equal(bytesLora('EA7XXX-7>APLJRT:>hola'), 3 + 21);
});

test('paso a APRS-IS: lo que un iGate no debe pasar', () => {
  assert.equal(debePasarAIs('EA7XXX-7', 'WIDE1-1', '!3631.20N/00612.30W>'), true);
  assert.equal(debePasarAIs('EA7XXX-7', 'WIDE1*,qAR,EA7YYY', '>x'), false);
  for (const ruta of ['TCPIP*', 'WIDE1-1,NOGATE', 'RFONLY', 'TCPXX*']) assert.equal(debePasarAIs('EA7XXX-7', ruta, '>x'), false, ruta);
  assert.equal(debePasarAIs('NOCALL-7', '', '>x'), false);
  assert.equal(debePasarAIs('EA7XXX-7', '', '?APRS?'), false);
  assert.equal(debePasarAIs('EA7XXX-7', '', '}EA7YYY>APRS,TCPIP*,EA7XXX-7*:>x'), false);
  assert.equal(debePasarAIs('EA7XXX-7', '', '}EA7YYY>APRS,WIDE1-1:>x'), true);
  assert.equal(debePasarAIs('EA7XXX-7', '', ''), false);
});

test('conflictos con la consola', () => {
  const consola = { indicativo: 'EA7XXX-10', baliza: true, pasaAIs: false };
  assert.deepEqual(conflictosLora([estado()], consola), []);
  const ids = (t: EstadoTracker[], c = consola) => conflictosLora(t, c).map((x) => `${x.id}:${x.nivel}`);
  assert.deepEqual(ids([estado({ digi: true })]), []);      // lo dice la comprobación del tracker
  assert.deepEqual(ids([estado()], { ...consola, indicativo: 'ea7xxx-7' }), ['baliza-EA7XXX-7:aviso']);
  assert.deepEqual(ids([estado()], { ...consola, indicativo: 'EA7XXX-7', baliza: false }), []);
  assert.deepEqual(ids([estado(), estado()]), ['doble-EA7XXX-7:aviso']);
  assert.deepEqual(ids([estado({ digi: true, smart: false }), estado({ call: 'EA7XXX-9', digi: true, smart: false })]), ['digis:aviso']);
  assert.deepEqual(ids([estado()], { ...consola, pasaAIs: true }), ['igate:info']);
});

test('enlace: KISS de ida y vuelta, estado por HTTP y cifras', async () => {
  // un tracker de mentira: TNC KISS por TCP y /api/status en el puerto 80... de otro número
  const recibido: Buffer[] = [];
  let cliente: net.Socket | null = null;
  const tnc = net.createServer((s) => { cliente = s; s.on('data', (b) => recibido.push(b)); s.on('error', () => {}); });
  await new Promise<void>((r) => tnc.listen(0, '127.0.0.1', r));
  const puerto = (tnc.address() as net.AddressInfo).port;

  const tramas: string[] = [];
  const e = new EnlaceTracker({ equipo: '127.0.0.1', puerto }, () => 15, (ax25, enlace) => { const t = ax25.toString(); tramas.push(t); enlace.anotarOida(t.split('>')[0], t); });
  e.iniciar();
  try {
    await hasta(() => e.enlace === 'conectado' && !!cliente);
    cliente!.write(Buffer.concat([kissEncode(Buffer.from('EA7YYY-9>APLJRT,WIDE1-1:>uno')), kissEncode(Buffer.from('EA7ZZZ>APLJRT:>dos'))]));
    await hasta(() => tramas.length === 2);
    await e.enviar(Buffer.from('prueba'));
    await hasta(() => recibido.length > 0);
    assert.deepEqual([...Buffer.concat(recibido)], [...kissEncode(Buffer.from('prueba'))]);
    assert.equal(e.enviadas, 1);
    const c = e.cifras();
    assert.equal(c.oidas, 2);
    assert.equal(c.estaciones, 2);
    assert.ok(c.ocupacion > 0 && c.ocupacion < 1);
    await hasta(() => e.estadoDisponible !== null);
    assert.equal(e.estado, null);                          // aquí nadie da /api/status de un tracker (o no hay nada en el 80)
    // el tracker se apaga: el enlace cae y dice por qué
    cliente!.destroy();
    await hasta(() => e.enlace === 'error');
    await assert.rejects(e.enviar(Buffer.from('x')), /sin enlace KISS/);
  } finally {
    e.parar();
    tnc.close();
  }
  assert.equal(e.enlace, 'apagado');
});
