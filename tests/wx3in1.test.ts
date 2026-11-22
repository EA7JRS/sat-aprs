// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import {
  FiltroTelnet, RecibidorEstadisticas, SesionWx3in1, datoEstadistica, enviarPorServidorSimple, funcionesDirewolf,
  leerDepuracion, leerEstadisticas, leerOidas, leerTension, leerVersion, PATRONES, quitarDigiDirewolf, repartoFunciones,
  tipoEtiqueta, type ResumenWx3cfg,
} from '../server/radio/wx3in1';
import { leerConfAprx } from '../server/radio/aprx';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond: () => boolean, ms = 6000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo agotado'); await espera(25); }
}

test('telnet: negociación y texto', () => {
  const f = new FiltroTelnet();
  // IAC WILL ECHO, IAC DO NAWS, «Hola», IAC SB ... IAC SE, IAC IAC (un 255 de datos)
  const r = f.dar(Buffer.from([255, 251, 1, 255, 253, 31, 72, 111, 108, 97, 255, 250, 24, 1, 255, 240, 255, 255]));
  assert.equal(r.texto, 'Holaÿ');
  assert.deepEqual([...r.respuesta], [255, 253, 1, 255, 252, 31]);   // DO ECHO, WONT NAWS
  // una negociación partida entre dos lecturas
  const g = new FiltroTelnet();
  assert.equal(g.dar(Buffer.from([65, 255])).texto, 'A');
  const r2 = g.dar(Buffer.from([251, 3, 66]));
  assert.equal(r2.texto, 'B');
  assert.deepEqual([...r2.respuesta], [255, 253, 3]);                  // DO SGA
});

test('WX3in1: mensajes de depuración, estadísticas, tensión, versión y estaciones oídas', () => {
  const d = leerDepuracion('00:25:47 (DNS) Server name not found, need to nslookup: time.nist.gov.', 1)!;
  assert.deepEqual([d.hora, d.etiqueta, d.tipo], ['00:25:47', 'DNS', 'red']);
  assert.equal(d.texto, 'Server name not found, need to nslookup: time.nist.gov.');
  assert.equal(leerDepuracion('APRS packet received (CRC OK): 12', 1), null);
  assert.equal(tipoEtiqueta('RF'), 'rf');
  assert.equal(tipoEtiqueta('DIGI'), 'digi');
  assert.equal(tipoEtiqueta('APRS-IS'), 'aprsis');
  assert.equal(tipoEtiqueta('APRSIS_MESSAGES'), 'aprsis');
  assert.equal(tipoEtiqueta('USER'), 'otro');

  const e = leerEstadisticas('Uptime: 3d 04:12:00\nAPRS packet received (CRC OK): 1532\nPackets digipeated = 610\nDecode efficiency (1h): 94%\n12:00:01 (RF) algo\nsin dos puntos');
  assert.equal(e.length, 4);
  assert.equal(datoEstadistica(e, PATRONES.recibidas)?.numero, 1532);
  assert.equal(datoEstadistica(e, PATRONES.repetidas)?.numero, 610);
  assert.equal(datoEstadistica(e, PATRONES.eficiencia)?.valor, '94%');
  assert.equal(datoEstadistica(e, PATRONES.enMarcha)?.valor, '3d 04:12:00');
  assert.equal(datoEstadistica([], PATRONES.eficiencia), null);

  assert.equal(leerTension('Input voltage: 13.62V'), 13.62);
  assert.equal(leerTension('Vin = 12,1 V'), 12.1);
  assert.equal(leerTension('sin dato'), null);
  assert.equal(leerVersion('Firmware version: v1.13'), 'v1.13');
  assert.equal(leerVersion('WX3in1 Plus 2.0 1.13'), 'v1.13');

  const o = leerOidas('Local RF:\nEA7XXA-10   00:01:12   2 pkts\nEB7XXB-9, 00:05:00, 1 hop\n12:00:00 (RF) EA7XXC>APRS\nprint rfheard');
  assert.deepEqual(o.map((x) => x.indicativo), ['EA7XXA-10', 'EB7XXB-9']);
  assert.deepEqual(o[0].datos, ['00:01:12', '2 pkts']);
  assert.deepEqual(o[1].datos, ['00:05:00', '1 hop']);
});

/** Un WX3in1 de pega: pide usuario y contraseña, contesta a print y escribe depuración. */
function wx3inDePega(opts: { clave?: string } = {}) {
  const recibido: string[] = [];
  const sockets: net.Socket[] = [];
  const srv = net.createServer((s) => {
    sockets.push(s);
    let fase = 'usuario';
    let buf = '';
    s.write(Buffer.from([255, 251, 1, 255, 251, 3]));                // WILL ECHO, WILL SGA
    s.write('WX3in1 Plus 2.0 telnet\r\nUsername: ');
    s.on('data', (b) => {
      buf += b.toString('latin1').replace(/\xff[\xfb-\xfe]./g, '');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 2);
        recibido.push(l);
        if (fase === 'usuario') { fase = 'clave'; s.write('Password: '); continue; }
        if (fase === 'clave') {
          if (l !== (opts.clave ?? 'secreta')) { s.write('\r\nLogin incorrect\r\n'); s.end(); return; }
          fase = 'dentro'; s.write('\r\nWelcome\r\n'); continue;
        }
        s.write(`${l}\r\n`);                                         // eco
        if (l === 'print version') s.write('Firmware version: v1.13\r\n');
        else if (l === 'print stats') s.write('APRS packet received (CRC OK): 1532\r\nDecode efficiency: 94%\r\n');
        else if (l === 'print voltage') s.write('Input voltage: 13.6V\r\n');
        else if (l === 'print rfheard') s.write('EA7XXA-10   00:01:12\r\nEA7XXB-9   00:03:40\r\n');
        else if (l.startsWith('debug ')) s.write(`${l.slice(6).replace(' on', '')} debug enabled\r\n`);
      }
    });
  });
  return {
    recibido,
    abrir: () => new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as net.AddressInfo).port))),
    escribir: (t: string) => sockets.forEach((s) => s.write(t)),
    cerrar: () => { sockets.forEach((s) => s.destroy()); srv.close(); },
  };
}

test('WX3in1: sesión telnet con un equipo de pega', async () => {
  const pega = wx3inDePega();
  const puerto = await pega.abrir();
  const notas: string[] = [];
  const s = new SesionWx3in1(() => ({ equipo: '127.0.0.1', puerto, usuario: 'admin', clave: 'secreta', depuracion: ['rf', 'digi'], intervaloS: 60 }), (t) => notas.push(t));
  try {
    s.aplicar();
    await hasta(() => s.estado === 'conectado');
    await hasta(() => s.oidas.length === 2);
    assert.equal(s.version, 'v1.13');
    assert.equal(s.tension, 13.6);
    assert.equal(datoEstadistica(s.estadisticas, PATRONES.recibidas)?.numero, 1532);
    assert.deepEqual(pega.recibido.slice(0, 2), ['admin', 'secreta']);
    assert.ok(pega.recibido.includes('debug rf on') && pega.recibido.includes('debug digi on'));
    assert.ok(!s.estadisticas.some((d) => /debug/.test(d.etiqueta)));   // las respuestas a debug no se mezclan
    assert.equal(s.bruto['print voltage'].texto, 'Input voltage: 13.6V');
    // depuración mientras tanto: se cuenta por minuto y no se mezcla con las respuestas
    pega.escribir('21:58:02 (RF) EA7XXA-10>APLRT1,WIDE2-1:!3632.05N/00611.40W>\r\n21:58:02 (DIGI) EA7XXA-10 digipeated\r\n21:58:03 (AX25) bajo nivel\r\n21:59:10 (NTP) time synchronized\r\n');
    await hasta(() => s.registro.length === 4);
    const c = s.cuenta(60);
    assert.deepEqual([c.rf, c.digi], [1, 1]);                         // la línea AX25 no cuenta como trama
    assert.equal(s.minutos().length, 60);
    assert.deepEqual(s.registro.map((l) => l.tipo), ['red', 'rf', 'digi', 'rf']);
    assert.ok(notas.some((t) => /sesión telnet abierta/.test(t)));
  } finally { s.parar(); pega.cerrar(); }
});

test('WX3in1: contraseña de telnet rechazada', async () => {
  const pega = wx3inDePega({ clave: 'otra' });
  const puerto = await pega.abrir();
  const s = new SesionWx3in1(() => ({ equipo: '127.0.0.1', puerto, usuario: 'admin', clave: 'mala', depuracion: [], intervaloS: 60 }));
  try {
    s.aplicar();
    await hasta(() => s.estado === 'error');
    assert.match(s.motivo, /no aceptados|cerró/);
  } finally { s.parar(); pega.cerrar(); }
});

test('WX3in1: vía de respaldo por su servidor APRS-IS simple', async () => {
  const lineas: string[] = [];
  const srv = net.createServer((s) => {
    s.write('# WX3in1 APRS-IS server\r\n');
    let buf = '';
    s.on('data', (b) => {
      buf += b.toString();
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 2); lineas.push(l);
        if (l.startsWith('user ')) s.write(l.includes('pass buena') ? '# logresp admin verified\r\n' : '# logresp admin unverified\r\n');
      }
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const puerto = (srv.address() as net.AddressInfo).port;
  const a = { equipo: '127.0.0.1', puerto, usuario: 'admin', clave: 'buena', version: 'S.A.T.-APRS+ 1.54.0' };
  try {
    const resp = await enviarPorServidorSimple(a, 'EA7JRS>APZSAT,WIDE2-1:>Prueba');
    assert.match(resp, /verified/);
    assert.deepEqual(lineas, ['user admin pass buena vers S.A.T.-APRS+ 1.54.0', 'EA7JRS>APZSAT,WIDE2-1:>Prueba']);
    await assert.rejects(enviarPorServidorSimple({ ...a, clave: 'mala' }, 'EA7JRS>APZSAT:>x'), /no aceptó/);
    await assert.rejects(enviarPorServidorSimple(a, 'linea\r\ninyectada'), /no válida/);
    await assert.rejects(enviarPorServidorSimple({ ...a, puerto: 1 }, 'EA7JRS>APZSAT:>x'), /desactivado|ECONNREFUSED|contesta/);
  } finally { srv.close(); }
});

test('WX3in1: estadísticas por HTTP, se guardan tal cual y con tope', () => {
  const r = new RecibidorEstadisticas(2);
  for (let i = 0; i < 3; i++) r.anotar({ cuando: i, desde: '192.168.1.50', metodo: 'GET', ruta: `/wx3in1/estadisticas?id=${i}`, consulta: { id: String(i) }, cuerpo: 'x'.repeat(5000) });
  assert.equal(r.peticiones.length, 2);
  assert.equal(r.peticiones[0].consulta.id, '2');
  assert.equal(r.peticiones[0].cuerpo.length, 4000);
});

const RESUMEN: ResumenWx3cfg = {
  callsign: 'EA7JRS-10',
  digipeater: { on: true, rules: [{ name: 'WIDE', n_max: 2, enable_if: 'always' }] },
  igate: { rf_to_is: true, msg_to_rf: true, packets_to_rf: false, servers: ['192.168.1.10:14580'], user: 'EA7JRS-10', passcode_ok: true },
  beacons: [{ n: 1, rf_min: 30, is_min: 10 }],
  weather: { station: null, rf_min: 0, is_min: 0, wunderground: false },
  aprsis_server: { on: true, port: 14580, user: 'admin', to_t2: false, from_t2: false },
  stats_upload: { on: false, host: '', port: 80, path: '', interval_min: 5 },
  telnet: { port: 23, user: 'admin' },
  network: { dhcp: true, ip: '192.168.2.2' },
  ntp: '192.168.1.10',
};

test('Reparto de funciones: Direwolf, aprx y el WX3in1', () => {
  const dw = funcionesDirewolf('MYCALL EA7JRS-13\nDIGIPEAT 0 0 ^WIDE[3-7]-[1-7]$ ^WIDE[12]-[12]$\n# DIGIPEAT 0 1 x\nIGSERVER euro.aprs2.net\nPBEACON delay=1 every=30 symbol="igate"\n');
  assert.deepEqual(dw, { digipeat: 1, igate: true, igateRf: false, balizas: 1 });
  const consola = { indicativo: 'EA7JRS', baliza: false, parteMeteo: false, emite: true };

  const r = repartoFunciones({ direwolf: dw, aprx: null, wx3in1: RESUMEN, consola, respaldo: true });
  assert.deepEqual(r.filas.map((f) => [f.consola, f.aprx, f.wx3in1]), [
    ['si', 'desconocido', 'si'], ['si', 'desconocido', 'si'], ['no', 'desconocido', 'si'], ['si', 'desconocido', 'si'], ['no', 'desconocido', 'no'], ['si', 'no', 'respaldo'],
  ]);
  assert.deepEqual(r.conflictos.map((c) => c.id), ['digi', 'igate']);
  assert.match(r.conflictos[0].texto, /Direwolf y el WX3in1/);

  // aprx con digipetidor de radio y de APRS-IS a radio, el WX3in1 sin digi pero con mensajes a RF
  const ax = leerConfAprx('mycall EA7JRS-1\n<aprsis>\nserver euro.aprs2.net\npasscode 1234\n</aprsis>\n<interface>\nserial-device /dev/ttyUSB0 19200 8n1 KISS\n</interface>\n<digipeater>\ntransmitter $mycall\n<source>\nsource $mycall\n</source>\n<source>\nsource APRSIS\n</source>\n</digipeater>\n');
  const sinDigi = { ...RESUMEN, digipeater: { on: false, rules: [] } };
  const r2 = repartoFunciones({ direwolf: { digipeat: 0, igate: false, igateRf: false, balizas: 0 }, aprx: ax, wx3in1: sinDigi, consola: { ...consola, indicativo: 'EA7JRS-10', baliza: true }, respaldo: false });
  assert.deepEqual(r2.filas[0], { funcion: 'Digipetidor', consola: 'no', aprx: 'si', wx3in1: 'no' });
  assert.deepEqual(r2.conflictos.map((c) => c.id).sort(), ['aprsis-rf', 'baliza', 'igate'].sort());
  // sin nada que se pise
  const r3 = repartoFunciones({ direwolf: { digipeat: 0, igate: false, igateRf: false, balizas: 0 }, aprx: null, wx3in1: null, consola, respaldo: false });
  assert.deepEqual(r3.conflictos, []);
  assert.equal(r3.filas[0].wx3in1, 'desconocido');
});

test('Reparto: quitar el digipetidor de direwolf.conf', () => {
  const r = quitarDigiDirewolf('MYCALL EA7JRS\n  DIGIPEAT 0 0 ^WIDE[3-7]-[1-7]$ ^WIDE[12]-[12]$\n# DIGIPEAT viejo\nIGSERVER x\n', 'nota');
  assert.equal(r.cambiadas, 1);
  assert.equal(r.texto, 'MYCALL EA7JRS\n# nota:   DIGIPEAT 0 0 ^WIDE[3-7]-[1-7]$ ^WIDE[12]-[12]$\n# DIGIPEAT viejo\nIGSERVER x\n');
  assert.equal(funcionesDirewolf(r.texto).digipeat, 0);
});
