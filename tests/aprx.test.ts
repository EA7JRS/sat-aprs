// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MonitorAprx, SeguidorArchivo, leerConfAprx, leerLineaRf } from '../server/radio/aprx';

const CONF = `
mycall  ea7jrs-10
myloc   lat 3723.00N lon 00559.00W
<aprsis>
  server    rotate.aprs2.net   14580
  passcode  12345        # secreto
  filter    "m/50"
</aprsis>
<logging>
  pidfile    /var/run/aprx.pid
  rflog      /var/log/aprx/aprx-rf.log
  aprxlog    /var/log/aprx/aprx.log
</logging>
<interface>
  tcp-device   127.0.0.1   8001   KISS
  tx-ok        true
</interface>
<interface>
  serial-device /dev/ttyLoraAPRS 115200 8n1 KISS
  callsign     EA7JRS-11
</interface>
<beacon>
  beacon symbol "R&" lat "3723.00N" lon "00559.00W" comment "iGate"
</beacon>
<digipeater>
  transmitter  $mycall
  <source>
    source     $mycall
    relay-type digipeated
  </source>
</digipeater>
`;

test('aprx.conf: lo que se enseña', () => {
  const c = leerConfAprx(CONF);
  assert.equal(c.indicativo, 'EA7JRS-10');
  assert.equal(c.posicion, 'lat 3723.00N lon 00559.00W');
  assert.deepEqual(c.aprsis, { servidor: 'rotate.aprs2.net', puerto: 14580, filtro: 'm/50', conPasscode: true });
  assert.deepEqual(c.interfaces, [
    { tipo: 'tcp', dispositivo: '127.0.0.1:8001 KISS', indicativo: 'EA7JRS-10', emite: true },
    { tipo: 'serie', dispositivo: '/dev/ttyLoraAPRS 115200 8n1 KISS', indicativo: 'EA7JRS-11', emite: false },
  ]);
  assert.deepEqual(c.digipeater, { transmisor: 'EA7JRS-10', fuentes: ['EA7JRS-10'] });
  assert.equal(c.balizas, 1);
  assert.equal(c.registroRf, '/var/log/aprx/aprx-rf.log');
  assert.equal(leerConfAprx('mycall X').registroRf, null);
});

test('registro de radio de aprx', () => {
  const r = leerLineaRf('2026-11-15 09:09:15.097 EA7JRS-10 R EA7KZ-9>APLRT1,WIDE1-1,qAR:!3723.00N/00559.00W>090/036 LoRa')!;
  assert.equal(r.resultado, 'pasada');
  assert.equal(r.origen, 'EA7KZ-9');
  assert.equal(r.ruta, 'WIDE1-1,qAR');
  assert.equal(r.cuando, new Date('2026-11-15T09:09:15.097').getTime());
  assert.equal(leerLineaRf('2026-11-15 09:09:15.097 EA7JRS-10 d *EA7KZ-9>APRS:>hola')!.resultado, 'sin-aprsis');
  assert.equal(leerLineaRf('2026-11-15 09:09:15.097 EA7JRS-10 d #EA7KZ-9>APRS:>hola')!.resultado, 'rechazada');
  assert.equal(leerLineaRf('2026-11-15 09:09:16.000 EA7JRS-10 T EA7KZ-9>APRS,EA7JRS-10*:>hola', ['EA7JRS-10'])!.resultado, 'repetida');
  assert.equal(leerLineaRf('2026-11-15 09:09:16.000 EA7JRS-10 T EA7JRS-10>APRX29:!3723.00NR00559.00W&iGate', ['EA7JRS-10'])!.resultado, 'baliza');
  assert.equal(leerLineaRf('2026-11-15 09:09:16.000 APRSIS    R EA7XX>APRS,TCPIP*:>x')!.resultado, 'de-aprsis');
  assert.equal(leerLineaRf('2026-11-15 09:09:16.000 EA7JRS-10 R EA7KZ-9>APRS:T#001,<0x0d>x')!.info, 'T#001,\rx');
  assert.equal(leerLineaRf('basura'), null);
});

test('registro de aprx: se sigue según crece y tras rotarlo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aprx-'));
  const ruta = path.join(dir, 'aprx-rf.log');
  const leidas: string[] = [];
  const s = new SeguidorArchivo((l) => leidas.push(l), 40);
  s.leer(ruta);
  assert.match(s.error, /ENOENT/);
  fs.writeFileSync(ruta, 'línea vieja muy larga que se corta al arrancar\nuno\n');
  s.leer(ruta);
  assert.deepEqual(leidas, ['uno']); // al arrancar solo la cola, sin la línea cortada
  fs.appendFileSync(ruta, 'dos\ntr');
  s.leer(ruta);
  fs.appendFileSync(ruta, 'es\n');
  s.leer(ruta);
  assert.deepEqual(leidas, ['uno', 'dos', 'tres']);
  // Rotación (logrotate): archivo nuevo, se lee entero
  fs.renameSync(ruta, ruta + '.1');
  fs.writeFileSync(ruta, 'cuatro\n');
  s.leer(ruta);
  assert.deepEqual(leidas, ['uno', 'dos', 'tres', 'cuatro']);
  fs.rmSync(dir, { recursive: true });
});

test('resumen de aprx', () => {
  const m = new MonitorAprx();
  const t0 = new Date('2026-11-15T10:00:30').getTime();
  const l = (s: string) => m.anotar(leerLineaRf(s, ['EA7JRS-10'])!);
  l('2026-11-15 10:00:01.000 EA7JRS-10 d *EA7KZ-9>APRS:>a');
  l('2026-11-15 10:00:05.000 EA7JRS-10 R EA7KZ-9>APRS:>a');
  l('2026-11-15 10:00:06.000 EA7JRS-10 T EA7KZ-9>APRS,EA7JRS-10*:>a');
  l('2026-11-15 10:00:07.000 EA7JRS-11 R EA7URS-3>APRS:>b');
  l('2026-11-15 10:00:08.000 EA7JRS-10 d #EA7KZ-9>APRS:>a');
  l('2026-11-15 10:00:09.000 EA7JRS-10 T EA7JRS-10>APRX29:>c');
  l('2026-11-15 10:00:10.000 APRSIS    R EA7XX>APRS,TCPIP*:>x');
  const r = m.resumen(t0);
  assert.deepEqual({ ...r, minutos: undefined, puertos: undefined }, {
    recibidas: 4, estaciones: 2, pasadas: 2, sinAprsis: 1, rechazadas: 1, repetidas: 1, balizas: 1, deAprsis: 1,
    minutos: undefined, puertos: undefined, pasarela: { funciona: true, desde: new Date('2026-11-15T10:00:07').getTime() },
  });
  assert.deepEqual(r.puertos, [{ puerto: 'EA7JRS-10', recibidas: 3, pasadas: 1, emitidas: 2 }, { puerto: 'EA7JRS-11', recibidas: 1, pasadas: 1, emitidas: 0 }]);
  assert.equal(r.minutos[59].recibidas, 4);
  assert.equal(r.minutos[59].emitidas, 2);
});
