// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LectorLog, MonitorDirewolf, camposCsv, describirTrama, leerConfDirewolf, leerLineaLog, repetidorDe } from '../server/radio/direwolf';

const CABECERA = 'chan,utime,isotime,source,heard,level,error,dti,name,symbol,latitude,longitude,speed,course,altitude,frequency,offset,tone,system,status,telemetry,comment';

test('direwolf.conf: valores que se enseñan', () => {
  const c = leerConfDirewolf([
    '# comentario',
    'ADEVICE plughw:1,0',
    'ARATE 44100',
    'CHANNEL 0',
    'MYCALL ea7jrs-13',
    'MODEM 1200',
    'PTT GPIO 17   # pin',
    'TXDELAY 30',
    'TXTAIL 10',
    'FIX_BITS 1',
    'KISSPORT 8001',
    'AGWPORT 8000',
    'LOGDIR /var/log/direwolf',
  ].join('\n'));
  assert.deepEqual(c, {
    indicativo: 'EA7JRS-13', audio: 'plughw:1,0', muestreo: 44100, modem: '1200 Bd AFSK', ptt: 'GPIO 17', puertoKiss: 8001, puertoAgw: 8000,
    txDelayMs: 300, txTailMs: 100, fixBits: 1, carpetaLog: '/var/log/direwolf', canales: 1,
  });
  // Sin LOGDIR ni valores: quedan sin dato, no se suponen
  const vacia = leerConfDirewolf('MYCALL EA7JRS');
  assert.equal(vacia.carpetaLog, null);
  assert.equal(vacia.txDelayMs, null);
});

test('registro CSV de Direwolf', () => {
  assert.deepEqual(camposCsv('a,"b,c",d,"e ""f"""'), ['a', 'b,c', 'd', 'e "f"']);
  const cab = camposCsv(CABECERA);
  const l = leerLineaLog('0,1763200000,2026-11-15T09:46:40Z,EA7KZ-9,ED7ZAB-3,47(12/8),1,!,,/>,37.3833,-5.9833,0,0,,,,,,,,"Hola, R2"', cab)!;
  assert.deepEqual(l, { canal: 0, cuando: 1763200000000, origen: 'EA7KZ-9', oida: 'ED7ZAB-3', nivel: 47, corregidos: 1 });
  assert.equal(leerLineaLog(CABECERA, cab), null);
  assert.equal(leerLineaLog('', cab), null);
  // Sin nivel: queda sin dato
  assert.equal(leerLineaLog('0,1763200000,x,EA7KZ-9,,,0', cab)!.nivel, null);
});

test('registro: se sigue el archivo más reciente según crece', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-'));
  const leidas: string[] = [];
  const lector = new LectorLog((l) => leidas.push(`${l.origen}:${l.nivel}`));
  lector.leer(dir);
  assert.match(lector.error, /vacía/);
  const archivo = path.join(dir, '2026-11-15.log');
  fs.writeFileSync(archivo, `${CABECERA}\n0,1763200000,x,EA7KZ-9,EA7KZ-9,52(1/1),0\n0,1763200010,x,EA7UR`);
  lector.leer(dir);
  assert.deepEqual(leidas, ['EA7KZ-9:52']);
  fs.appendFileSync(archivo, 'S-3,EA7URS-3,61(2/2),0\n');
  lector.leer(dir);
  assert.deepEqual(leidas, ['EA7KZ-9:52', 'EA7URS-3:61']); // la línea partida se une
  lector.leer(dir);
  assert.equal(leidas.length, 2); // nada nuevo, nada repetido
  assert.equal(lector.actual, archivo);
  // Sin carpeta: sin registro, sin error
  lector.leer(null);
  assert.equal(lector.error, '');
  fs.rmSync(dir, { recursive: true });
});

test('qué es cada trama', () => {
  const sevilla = { lat: 37.39, lon: -5.99 };
  assert.match(describirTrama('EA7URS-3', 'APRS', '!3723.00N/00559.00W-Sede REMER', sevilla), /^Posición · [0-9,]+ km al \d{3}° · «Sede REMER»$/);
  assert.equal(describirTrama('EA7KZ-9', 'APRS', ':EA7JRS-13:QRV en R2{17', sevilla), 'Mensaje para EA7JRS-13 · «QRV en R2»');
  assert.equal(describirTrama('EA7JRS-13', 'APRS', ':EA7KZ-9  :ack17', sevilla), 'Acuse de mensaje 17 para EA7KZ-9');
  assert.equal(describirTrama('EA7URS', 'APRS', ':BLN2METEO:Viento naranja', sevilla), 'Boletín BLN2METEO · «Viento naranja»');
  assert.match(describirTrama('EB7QQ-7', 'APRS', '!3723.00N/00559.00W>120/029', null), /^Posición · 54 km\/h al 120°$/);
  assert.equal(describirTrama('X', 'APRS', 'T#005,199,000,255,073,123,01101001', null), 'Telemetría');
  assert.equal(describirTrama('X', 'APRS', '>En servicio', null), 'Estado · «En servicio»');
  assert.equal(repetidorDe('ED7ZAB-3*,WIDE2-1'), 'ED7ZAB-3');
  assert.equal(repetidorDe('WIDE1-1'), null);
  assert.equal(repetidorDe('EA7RCC-10*,WIDE1*'), 'EA7RCC-10');
});

test('resumen: tramas, niveles y baliza propia repetida', () => {
  const m = new MonitorDirewolf(() => 'EA7JRS-13');
  const t0 = Date.UTC(2026, 10, 15, 10, 0, 30);
  m.anotarTx('EA7JRS-13', 'APZSAT', 'WIDE1-1', '!3723.00N/00559.00W-', t0);
  m.anotarRx('EA7JRS-13', 'APZSAT', 'ED7ZAB-3*', '!3723.00N/00559.00W-', t0 + 2000);
  assert.deepEqual(m.propia, { por: 'ED7ZAB-3', cuando: t0 + 2000, trasSegundos: 2 });
  m.anotarRx('EA7KZ-9', 'APRS', 'WIDE1-1', '!3723.00N/00559.00W>', t0 + 5000);
  // El registro llega después que la trama por KISS: se une a ella
  m.anotarLog({ canal: 0, cuando: t0 + 5200, origen: 'EA7KZ-9', oida: 'EA7KZ-9', nivel: 93, corregidos: 1 }, t0 + 5300);
  assert.equal(m.tramas[0].nivel, 93);
  assert.equal(m.tramas[0].corregidos, 1);
  // Y al revés: el registro primero
  m.anotarLog({ canal: 0, cuando: t0 + 9000, origen: 'EA7URS-3', oida: 'EA7URS-3', nivel: 50, corregidos: 0 }, t0 + 9000);
  m.anotarRx('EA7URS-3', 'APRS', 'WIDE1-1', '>QRV', t0 + 9500);
  assert.equal(m.tramas[0].nivel, 50);
  const r = m.resumen(t0 + 10_000);
  assert.equal(r.recibidas, 3);
  assert.equal(r.emitidas, 1);
  assert.equal(r.estaciones, 3);
  assert.equal(r.nivelMedio, 72);
  assert.equal(r.corregidas, 1);
  assert.equal(r.minutos.length, 60);
  assert.deepEqual({ rx: r.minutos[59].rx, tx: r.minutos[59].tx }, { rx: 3, tx: 1 });
  assert.deepEqual(m.nivelesRecientes(t0 + 10_000).map((n) => `${n.estacion}:${n.nivel}`), ['EA7URS-3:50', 'EA7KZ-9:93']);
  // Pasada la hora, fuera
  assert.equal(m.resumen(t0 + 2 * 3600_000).recibidas, 0);
  assert.equal(m.nivelesRecientes(t0 + 2 * 3600_000).length, 0);
});
