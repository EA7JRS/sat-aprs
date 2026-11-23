// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import crypto from 'crypto';
import { CanalKiwi, LectorWs, negativa, ordenesSonido, peticionWs, posicionCfg, sonidoSnd, tramaWs, valorMsg, wsAceptado } from '../server/radio/kiwi';
import { BALIZAS, BANDAS_IBP, CicloIbp, TablaIbp, balizaEn, centroLocator, ranuraIbp, sintoniaIbp } from '../server/radio/ibp';
import { argsDirewolfHf, centroAprsHf, confDirewolfHf, tramasKiss } from '../server/radio/aprsHf';

test('WebSocket: la petición, las tramas del cliente y el lector', () => {
  const p = peticionWs('kiwi.example', 8073, 1234567, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
  assert.ok(p.startsWith('GET /1234567/SND HTTP/1.1\r\nHost: kiwi.example:8073\r\n'));
  assert.ok(p.includes('Sec-WebSocket-Key: AAECAwQFBgcICQoLDA0ODw==\r\n') && p.endsWith('\r\n\r\n'));
  assert.ok(wsAceptado('HTTP/1.1 101 Switching Protocols\r\n') && !wsAceptado('HTTP/1.1 200 OK\r\n'));

  const t = tramaWs(1, Buffer.from('SET keepalive'), Buffer.from([0x11, 0x22, 0x33, 0x44]));
  assert.equal(t.length, 19); assert.equal(t[0], 0x81); assert.equal(t[1], 0x80 | 13);
  assert.equal(String.fromCharCode(t[6] ^ 0x11, t[7] ^ 0x22, t[8] ^ 0x33), 'SET');
  assert.equal(tramaWs(1, Buffer.alloc(200), Buffer.alloc(4))[1], 0x80 | 126);

  const l = new LectorWs(1000);
  assert.deepEqual(l.dar(Buffer.from([0x82, 0x05, 0x4d])), []);                       // media trama
  const m = l.dar(Buffer.from([0x53, 0x47, 0x20, 0x61, 0x88, 0x00]));
  assert.equal(m.length, 2); assert.equal(m[0].carga.toString(), 'MSG a'); assert.equal(m[1].opcode, 8);
  // un mensaje en dos trozos, con un ping en medio
  const dos = new LectorWs().dar(Buffer.concat([Buffer.from([0x02, 0x02, 0x41, 0x42]), Buffer.from([0x89, 0x01, 0x70]), Buffer.from([0x80, 0x01, 0x43])]));
  assert.deepEqual(dos.map((x) => [x.opcode, x.carga.toString()]), [[9, 'p'], [2, 'ABC']]);
  assert.throws(() => new LectorWs().dar(Buffer.from([0x81, 0x85, 1, 2, 3, 4, 0, 0, 0, 0, 0])));      // enmascarada: no es de un servidor
  assert.throws(() => new LectorWs(100).dar(Buffer.from([0x82, 126, 0x01, 0x2c])));                    // más larga de lo admitido
});

test('KiwiSDR: mensajes, negativas, posición y órdenes', () => {
  const m = 'audio_init=0 audio_rate=12000 sample_rate=12001.135 version_maj=1';
  assert.equal(valorMsg(m, 'sample_rate'), '12001.135');
  assert.equal(valorMsg(m, 'rate'), null);
  assert.equal(valorMsg('too_busy=4', 'too_busy'), '4');
  assert.match(negativa('too_busy=4')!, /ocupados/);
  assert.match(negativa('badp=1')!, /contraseña/);
  assert.equal(negativa('badp=0'), null);
  assert.equal(negativa(m), null);
  const cfg = encodeURIComponent(JSON.stringify({ rx_name: 'x', rx_gps: encodeURIComponent('(36.530000, -6.290000)') }));
  assert.deepEqual(posicionCfg(cfg), { lat: 36.53, lon: -6.29 });
  assert.equal(posicionCfg(encodeURIComponent(JSON.stringify({ rx_gps: '(0.000000, 0.000000)' }))), null);
  assert.equal(posicionCfg(encodeURIComponent(JSON.stringify({ rx_name: 'x' }))), null);
  const o = ordenesSonido('usb', 10147.6, 300, 2700);
  assert.ok(o.includes('SET mod=usb low_cut=300 high_cut=2700 freq=10147.600') && o.includes('SET compression=0') && o.includes('SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50'));
  assert.ok(ordenesSonido('cw', 128030, 350, 650, 116000, false).includes('SET mod=cw low_cut=350 high_cut=650 freq=12030.000'));
});

test('KiwiSDR: un bloque de sonido', () => {
  const b = Buffer.alloc(7 + 4);
  b.writeUInt16BE(670, 5); b.writeInt16BE(0x1234, 7); b.writeInt16BE(-2, 9);
  const s = sonidoSnd(b)!;
  assert.ok(Math.abs(s.dbm + 60) < 1e-9);
  assert.equal(s.pcm!.readInt16LE(0), 0x1234); assert.equal(s.pcm!.readInt16LE(2), -2);
  b[0] = 0x08; assert.equal(sonidoSnd(b)!.pcm, null);            // I/Q: no es el sonido que se pidió
  b[0] = 0x10; assert.equal(sonidoSnd(b)!.pcm, null);            // comprimido
  assert.equal(sonidoSnd(Buffer.alloc(3)), null);
});

test('IBP: quién suena en cada banda', () => {
  assert.equal(BALIZAS.length, 18); assert.equal(BANDAS_IBP.length, 5);
  const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);                    // comienzo de un ciclo
  assert.equal(ranuraIbp(t0), 0); assert.equal(ranuraIbp(t0 + 10_000), 1); assert.equal(ranuraIbp(t0 + 179_000), 17); assert.equal(ranuraIbp(t0 + 180_000), 0);
  // al empezar el ciclo, 4U1UN está en 14 100 y la última de la lista, YV5B, en 18 110 (empezó una ranura antes)
  assert.equal(BALIZAS[balizaEn(0, t0)].indicativo, '4U1UN');
  assert.equal(BALIZAS[balizaEn(1, t0)].indicativo, 'YV5B');
  assert.equal(BALIZAS[balizaEn(4, t0)].indicativo, 'CS3B');
  // diez segundos después 4U1UN ha subido a 18 110 y VE8AT ocupa 14 100
  assert.equal(BALIZAS[balizaEn(1, t0 + 10_000)].indicativo, '4U1UN');
  assert.equal(BALIZAS[balizaEn(0, t0 + 10_000)].indicativo, 'VE8AT');
  // cada baliza pasa una vez por cada banda en el ciclo
  for (let f = 0; f < 5; f++) assert.equal(new Set(Array.from({ length: 18 }, (_, r) => balizaEn(f, t0 + r * 10_000))).size, 18);
  assert.deepEqual(sintoniaIbp(0), { modo: 'cw', khz: 14099.5, bajo: 350, alto: 650, agc: false });
  const c = centroLocator('IM12jt');
  assert.ok(Math.abs(c.lat - 32.81) < 0.05 && Math.abs(c.lon + 17.21) < 0.05);     // Madeira
});

test('IBP: de los niveles del receptor a la tabla', () => {
  const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);
  const ciclo = new CicloIbp(2);                                   // 21 150 kHz
  // ruido a -120 dBm; en la ranura 5 una baliza a -100 (con su indicativo y sus rayas: no siempre arriba) y en la 9 una floja, a -117
  for (let s = 0; s < 180; s++) for (let k = 0; k < 5; k++) {
    const ms = t0 + s * 1000 + k * 200, r = Math.floor(s / 10);
    let dbm = -120 + ((s * 7 + k * 3) % 5) * 0.2;
    if (r === 5 && (s % 10) < 7) dbm = -100;
    if (r === 9) dbm = -117;
    ciclo.anotar(ms, dbm);
  }
  assert.equal(ciclo.ranurasMedidas(), 18);
  const medidas = ciclo.cerrar(t0 + 180_000);
  assert.equal(medidas.length, 18);
  const fuerte = medidas.find((m) => m.oida)!;
  assert.equal(medidas.filter((m) => m.oida).length, 1);
  assert.equal(fuerte.baliza, (5 - 2 + 18) % 18);                  // la que toca en la ranura 5 de la tercera banda
  assert.ok(fuerte.dbm === -100 && fuerte.sobreRuido > 18 && fuerte.sobreRuido < 21);
  const floja = medidas.find((m) => m.baliza === (9 - 2 + 18) % 18)!;
  assert.ok(!floja.oida && floja.sobreRuido > 1 && floja.sobreRuido < 4);       // 3 dB sobre el ruido: no basta
  assert.ok(Math.abs(ciclo.ruido()! + 119.5) < 1);
  // medio ciclo no da medidas: no se sabría el ruido
  const medio = new CicloIbp(0);
  for (let s = 0; s < 90; s++) for (let k = 0; k < 5; k++) medio.anotar(t0 + s * 1000 + k * 200, -120);
  assert.deepEqual(medio.cerrar(t0), []);
  // los bordes de la ranura no cuentan
  const borde = new CicloIbp(0);
  borde.anotar(t0 + 500, -50); borde.anotar(t0 + 9500, -50);
  assert.equal(borde.ranurasMedidas(), 0);

  const tabla = new TablaIbp();
  tabla.anotar(medidas, ciclo.ruido());
  const cuadro = tabla.cuadro(t0 + 200_000);
  assert.equal(cuadro.length, 18); assert.equal(cuadro[fuerte.baliza][2]!.oida, true); assert.equal(cuadro[fuerte.baliza][0], null);
  assert.equal(tabla.cuadro(t0 + 3 * 3600_000)[fuerte.baliza][2], null);        // a las tres horas ya no vale
  assert.ok(tabla.ruido[2] && tabla.ruido[0] === null);
});

test('APRS de onda corta: la configuración del Direwolf que escucha y las tramas KISS', () => {
  const c = confDirewolfHf('ea7jrs-10', 12001.135, 8011);
  assert.ok(c.includes('ADEVICE stdin null\n') && c.includes('ARATE 12001\n') && c.includes('MYCALL EA7JRS-10\n') && c.includes('MODEM 300 1600:1800 7@30\n') && c.includes('KISSPORT 0\nKISSPORT 8011\n'));
  assert.ok(!/PTT/.test(c));                                       // no puede emitir
  assert.ok(confDirewolfHf('', 12000, 8011).includes('MYCALL N0CALL\n'));
  assert.deepEqual(argsDirewolfHf('/tmp/x.conf', 12000), ['-c', '/tmp/x.conf', '-r', '12000', '-n', '1', '-b', '16', '-t', '0', '-q', 'hd', '-']);
  assert.ok(Math.abs(centroAprsHf({ khz: 10147.6, banda: 'usb', puertoKiss: 8011 }) - 10149.3) < 1e-9);
  assert.ok(Math.abs(centroAprsHf({ khz: 14105, banda: 'lsb', puertoKiss: 8011 }) - 14103.3) < 1e-9);

  const k = Buffer.from([0xc0, 0x00, 0x41, 0xdb, 0xdc, 0x42, 0xdb, 0xdd, 0xc0, 0xc0, 0x00, 0x43, 0xc0, 0xc0, 0x00, 0x44]);
  const r = tramasKiss(k);
  assert.deepEqual(r.tramas.map((t) => [...t]), [[0x41, 0xc0, 0x42, 0xdb], [0x43]]);
  assert.deepEqual([...r.resto], [0xc0, 0x00, 0x44]);                // media trama: espera al resto
  assert.deepEqual(tramasKiss(Buffer.from([0xc0, 0x06, 0x01, 0xc0])).tramas, []);     // una orden KISS no es una trama
});

test('KiwiSDR: el cliente contra un receptor de pega', async () => {
  const dicho: string[] = [];
  const srv = net.createServer((s) => {
    let buf = Buffer.alloc(0), arriba = false;
    const tr = (b: Buffer) => Buffer.concat([b.length < 126 ? Buffer.from([0x82, b.length]) : Buffer.from([0x82, 126, b.length >> 8, b.length & 255]), b]);
    s.on('error', () => {});
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!arriba) {
        const e = buf.indexOf('\r\n\r\n'); if (e < 0) return;
        const clave = /Sec-WebSocket-Key: (.+)/.exec(buf.subarray(0, e).toString())![1].trim();
        buf = buf.subarray(e + 4); arriba = true;
        s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(clave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
      }
      for (;;) {
        if (buf.length < 6) return;
        let n = buf[1] & 127, h = 2; if (n === 126) { n = buf.readUInt16BE(2); h = 4; }
        if (buf.length < h + 4 + n) return;
        const p = Buffer.from(buf.subarray(h + 4, h + 4 + n)); for (let i = 0; i < n; i++) p[i] ^= buf[h + (i & 3)];
        buf = buf.subarray(h + 4 + n);
        const t = p.toString(); if (t !== 'SET keepalive') dicho.push(t);
        if (t.startsWith('SET auth')) {
          s.write(tr(Buffer.from('MSG load_cfg=' + encodeURIComponent(JSON.stringify({ rx_gps: encodeURIComponent('(53.660000, 9.800000)') })))));
          s.write(tr(Buffer.from('MSG audio_init=0 audio_rate=12000'))); s.write(tr(Buffer.from('MSG sample_rate=12001.135')));
        }
        if (t.startsWith('SET mod=')) {
          const b = Buffer.alloc(3 + 7 + 4); b.write('SND'); b.writeUInt16BE(1270 - 800, 8); b.writeInt16BE(1000, 10); b.writeInt16BE(-1000, 12);
          s.write(tr(b));
        }
      }
    });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const puerto = (srv.address() as net.AddressInfo).port;
  const c = new CanalKiwi({ equipo: '127.0.0.1', puerto, clave: '' }, { modo: 'usb', khz: 10147.6, bajo: 300, alto: 2700 });
  const visto: any = {};
  c.on('posicion', (p) => { visto.pos = p; }); c.on('ritmo', (r) => { visto.ritmo = r; }); c.on('nivel', (n) => { visto.nivel = n; });
  const sonido = new Promise<Buffer>((ok) => c.once('sonido', ok));
  c.abrir();
  const pcm = await sonido;
  assert.equal(pcm.readInt16LE(0), 1000); assert.equal(pcm.readInt16LE(2), -1000);
  assert.deepEqual(visto.pos, { lat: 53.66, lon: 9.8 }); assert.equal(visto.ritmo, 12001.135); assert.ok(Math.abs(visto.nivel + 80) < 1e-9);
  assert.ok(c.conectado);
  assert.deepEqual(dicho.slice(0, 2), ['SET auth t=kiwi p=#', 'SET AR OK in=12000 out=44100']);
  assert.ok(dicho.includes('SET mod=usb low_cut=300 high_cut=2700 freq=10147.600'));
  c.sintonizar({ modo: 'cw', khz: 14099.5, bajo: 350, alto: 650, agc: false });
  await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(dicho.includes('SET mod=cw low_cut=350 high_cut=650 freq=14099.500') && dicho.includes('SET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=50'));
  const fin = new Promise<string>((ok) => c.once('fin', ok));
  c.cerrar('prueba');
  assert.equal(await fin, 'prueba');
  srv.close();
});

test('KiwiSDR en la consola: las bandas de las balizas van de una en una, y un ciclo a medias se repite', async () => {
  const { EstacionKiwi } = await import('../server/radio/kiwiEstacion');
  const e = new EstacionKiwi(() => ({ equipo: '', puerto: 8073, clave: '', aprs: false, aprsHf: { khz: 10147.6, banda: 'usb', puertoKiss: 8011 }, ibp: false, cw: false, cwKhz: [], indicativo: 'EA7JRS' }), () => {}, () => {});
  const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);
  const dar = (desde: number, hasta: number) => { for (let s = desde; s < hasta; s++) for (let k = 0; k < 5; k++) e.nivelIbp(t0 + s * 1000 + k * 200, -120 + (Math.floor(s / 10) % 18 === 5 ? 25 : 0)); };
  dar(100, 180);                       // se llega a mitad de un ciclo: ocho ranuras no bastan
  dar(180, 360);                       // un ciclo entero en la primera banda
  e.nivelIbp(t0 + 360_000, -120);      // empieza el siguiente: se cierra el anterior
  let c = e.estado(t0 + 361_000).ibp;
  assert.equal(c.ciclos, 1); assert.equal(c.banda, 1);                         // la primera banda se midió entera, y ya va por la segunda
  assert.equal(c.cuadro[5][0]!.oida, true); assert.ok(c.cuadro[5][0]!.sobreRuido > 20);   // la baliza de la ranura 5 en 14 100
  assert.equal(c.cuadro[5][1], null);
  dar(361, 540); e.nivelIbp(t0 + 540_000, -120);
  c = e.estado(t0 + 541_000).ibp;
  assert.equal(c.ciclos, 2); assert.equal(c.cuadro[4][1]!.oida, true);          // en 18 110 la ranura 5 es de la baliza anterior
  assert.deepEqual(c.ahora.length, 5);
});

import { Envolvente, OidasCw, balizasEnTexto, confirmaIndicativo, frecuenciasCw, leerCw, sintoniaCw, sonidoCw } from '../server/radio/cw';

/** Azar repetible, para que las pruebas con ruido den siempre lo mismo. */
const azarFijo = (semilla: number) => () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const envDe = (pcm: Buffer, ritmo = 12000) => { const e = new Envolvente(90); e.dar(pcm, ritmo, 1_000_000); return e.tramo(0, 2_000_000); };

test('Telegrafía: se lee con ruido, se deduce la velocidad y sin señal no se inventa nada', () => {
  const a = leerCw(envDe(sonidoCw('4U1UN ____', 22, 12000, 3000, 100, 500, azarFijo(1))));
  assert.equal(a.texto, '4U1UN ____'); assert.ok(a.ppm >= 19 && a.ppm <= 24); assert.ok(a.snrDb > 20);
  assert.ok(confirmaIndicativo(a.texto, '4U1UN') && !confirmaIndicativo(a.texto, 'VE8AT'));
  assert.equal(leerCw(envDe(sonidoCw('CS3B ____', 22, 12000, 3000, 600, 500, azarFijo(2)))).texto, 'CS3B ____');
  const lenta = leerCw(envDe(sonidoCw('VVV DE EA7JRS IM76HR', 12, 12000, 3000, 300, 500, azarFijo(3))));
  assert.equal(lenta.texto, 'VVV DE EA7JRS IM76HR'); assert.ok(lenta.ppm >= 11 && lenta.ppm <= 13);
  assert.equal(leerCw(envDe(sonidoCw('TEST DE EA7JRS', 30, 8000, 3000, 200, 600, azarFijo(4)), 8000)).texto, 'TEST DE EA7JRS');     // otra velocidad de muestras y otro tono
  assert.equal(leerCw(envDe(sonidoCw('', 22, 12000, 0, 500, 500, azarFijo(5)))).texto, '');                                         // solo ruido
  assert.equal(leerCw(envDe(sonidoCw('JA2IGY', 22, 12000, 900, 700, 500, azarFijo(6)))).texto, '');                                 // demasiado floja: calla
  assert.ok(!confirmaIndicativo('4U1U ____', '4U1UN') && confirmaIndicativo('T 4U1UN _', '4U1UN'));
});

test('Balizas de telegrafía: el indicativo tras «DE», el localizador, y dos lecturas para contar', () => {
  assert.deepEqual(balizasEnTexto('VVV DE ED7YAA/B IM67 VVV DE ED7YAA/B IM67'), [{ indicativo: 'ED7YAA/B', locator: 'IM67' }, { indicativo: 'ED7YAA/B', locator: 'IM67' }]);
  assert.deepEqual(balizasEnTexto('CQ DE EA7JRS K'), [{ indicativo: 'EA7JRS', locator: '' }]);
  assert.deepEqual(balizasEnTexto('DE DE TTT'), []); assert.deepEqual(balizasEnTexto('VVV DE 123'), []);
  const o = new OidasCw(), l = { texto: 'VVV DE EA7JRS IM76HR', ppm: 12, snrDb: 15 };
  assert.deepEqual(o.anotar(28200, l, 0), []); assert.deepEqual(o.recientes(1000), []);               // una vez: aún no
  assert.deepEqual(o.anotar(28250, l, 60_000), []);                                                    // en otra frecuencia no suma
  const n = o.anotar(28200, l, 120_000);
  assert.equal(n.length, 1); assert.equal(n[0].indicativo, 'EA7JRS'); assert.equal(n[0].locator, 'IM76HR'); assert.equal(n[0].veces, 2);
  o.anotar(28200, { ...l, texto: 'DE EA7JRS' }, 180_000);
  assert.equal(o.recientes(200_000)[0].veces, 3); assert.equal(o.recientes(200_000)[0].locator, 'IM76HR');
  const tarde = new OidasCw(); tarde.anotar(28200, l, 0);
  assert.deepEqual(tarde.anotar(28200, l, 31 * 60_000), []);                                          // la primera ya caducó
  assert.equal(new OidasCw().anotar(7039, { texto: 'DE EA7JRS DE EA7JRS', ppm: 12, snrDb: 15 }, 0).length, 1);   // dos veces en la misma escucha
  assert.deepEqual(frecuenciasCw('28175, 28200,5 28200.5; 99 31000 hola'), [28175, 28200, 5 < 100 ? 28200.5 : 0].filter((x) => x >= 100));
  assert.equal(frecuenciasCw('1 2 3').length, 0); assert.equal(frecuenciasCw('1000 2000 3000 4000 5000 6000 7000 8000 9000').length, 8);
  assert.deepEqual(sintoniaCw(28200), { modo: 'cw', khz: 28199.5, bajo: 300, alto: 700, agc: false });
});

test('KiwiSDR en la consola: una baliza NCDXF / IARU queda confirmada al leer su indicativo en su ranura', async () => {
  const { EstacionKiwi } = await import('../server/radio/kiwiEstacion');
  const e = new EstacionKiwi(() => ({ equipo: '', puerto: 8073, clave: '', aprs: false, aprsHf: { khz: 10147.6, banda: 'usb', puertoKiss: 8011 }, ibp: false, cw: false, cwKhz: [], indicativo: 'EA7JRS' }), () => {}, () => {});
  const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);
  // un ciclo entero en 14 100: la ranura 14 (CS3B) con señal y su indicativo; la 3 (KH6RS) con señal y otro indicativo
  for (let s = 0; s < 180; s++) for (let k = 0; k < 5; k++) { const r = Math.floor(s / 10); e.nivelIbp(t0 + s * 1000 + k * 200, -120 + (r === 14 || r === 3 ? 25 : 0)); if (s === 145 && k === 0) e.leerRanura(t0 + 140_000, envDe(sonidoCw('CS3B ____', 22, 12000, 3000, 200, 500, azarFijo(7)))); if (s === 35 && k === 0) e.leerRanura(t0 + 30_000, envDe(sonidoCw('EA7JRS', 22, 12000, 3000, 200, 500, azarFijo(8)))); }
  e.nivelIbp(t0 + 180_000, -120);
  const c = e.estado(t0 + 181_000).ibp;
  assert.equal(c.cuadro[14][0]!.confirmada, true); assert.equal(c.cuadro[14][0]!.oida, true);
  assert.equal(c.cuadro[3][0]!.oida, true); assert.equal(c.cuadro[3][0]!.confirmada, false);           // hay señal, pero no es KH6RS
  assert.equal(c.leido!.texto, 'CS3B ____'); assert.equal(c.leido!.confirmada, true);
});

import { HACKRF_DE_SERIE, HACKRF_DESVIO_HZ, ReceptorFm, argsDirewolfHackrf, argsHackrf, confDirewolfHackrf, gananciasHackrf, mhzHackrfValida, muestrasFm } from '../server/radio/hackrf';
import { motivoHackrf } from '../server/radio/hackrfEstacion';

test('HackRF: ganancias, frecuencia y órdenes; siempre recibir, nunca emitir', () => {
  assert.deepEqual(gananciasHackrf(27, 31), { lna: 24, vga: 30 }); assert.deepEqual(gananciasHackrf(99, -5), { lna: 40, vga: 0 }); assert.deepEqual(gananciasHackrf(NaN, 63), { lna: 0, vga: 62 });
  assert.ok(mhzHackrfValida(144.8) && mhzHackrfValida(432.5) && !mhzHackrfValida(0.5) && !mhzHackrfValida(NaN) && !mhzHackrfValida(7000));
  const a = argsHackrf({ ...HACKRF_DE_SERIE, mhz: 144.8, lna: 16, vga: 21, amp: true, serie: '0000000000000000a06063c8234e925f' });
  assert.deepEqual(a, ['-r', '-', '-f', String(144_800_000 - HACKRF_DESVIO_HZ), '-s', '2400000', '-b', '1750000', '-l', '16', '-g', '20', '-a', '1', '-d', '0000000000000000a06063c8234e925f']);
  assert.ok(!argsHackrf(HACKRF_DE_SERIE).includes('-t') && !argsHackrf(HACKRF_DE_SERIE).includes('-d'));
  assert.ok(!argsHackrf({ ...HACKRF_DE_SERIE, serie: 'abc; rm -rf /' }).includes('-d'));                       // un número de serie raro no pasa
  const c = confDirewolfHackrf('ea7jrs-10', 8012);
  assert.ok(c.includes('ADEVICE stdin null') && c.includes('MYCALL EA7JRS-10') && c.includes('MODEM 1200') && c.includes('KISSPORT 0\nKISSPORT 8012') && !/PTT|DIGIPEAT|IGLOGIN/.test(c));
  assert.ok(confDirewolfHackrf('lo que sea', 8012).includes('MYCALL N0CALL'));
  assert.deepEqual(argsDirewolfHackrf('/tmp/x.conf').slice(0, 4), ['-c', '/tmp/x.conf', '-r', '48000']);
  assert.match(motivoHackrf('hackrf_open() failed: HackRF not found (-5)'), /no se encuentra/);
  assert.match(motivoHackrf('hackrf_open() failed: Resource busy (-1000)'), /otro programa/);
  assert.match(motivoHackrf('libusb: Access denied (insufficient permissions)'), /permiso/);
});

test('HackRF: el receptor de FM devuelve el tono que se moduló, también en trozos impares y con ruido', () => {
  const n = 9600, tono = new Int16Array(n);
  for (let i = 0; i < n; i++) tono[i] = Math.round(20000 * Math.sin(2 * Math.PI * 1200 * i / 48000));
  const medir = (iq: Buffer, trozo: number) => {
    const rx = new ReceptorFm(), partes: Buffer[] = [];
    for (let k = 0; k < iq.length; k += trozo) partes.push(rx.dar(iq.subarray(k, k + trozo)));
    const pcm = Buffer.concat(partes), m = pcm.length >> 1;
    let re = 0, im = 0, pot = 0;
    for (let i = 960; i < m; i++) { const v = pcm.readInt16LE(2 * i), f = 2 * Math.PI * 1200 * i / 48000; re += v * Math.cos(f); im += v * Math.sin(f); pot += v * v; }
    const amp = 2 * Math.hypot(re, im) / (m - 960);
    return { m, amp, resto: 1 - (amp * amp / 2) / (pot / (m - 960)), nivel: rx.nivel };
  };
  const limpio = medir(muestrasFm(tono, 3000, 60, 0), 65536);
  assert.ok(Math.abs(limpio.m - n) <= 2);                                             // 2,4 MS/s entre 50: las mismas muestras de sonido
  // ±3 kHz de desviación con el tono al 61 % del fondo de escala: 0,24 rad de giro por muestra, por 26 000
  assert.ok(Math.abs(limpio.amp - 26000 * 2 * Math.PI * 3000 * (20000 / 32768) / 48000) < 400, `amplitud ${limpio.amp}`);
  assert.ok(limpio.resto < 0.02, `fuera del tono ${limpio.resto}`);
  assert.ok(Math.abs(limpio.nivel! - 20 * Math.log10(60 / 127)) < 1);                 // el nivel del canal, respecto al máximo del HackRF
  const impar = medir(muestrasFm(tono, 3000, 60, 0), 4097);
  assert.ok(Math.abs(impar.amp - limpio.amp) < 1 && impar.m === limpio.m);            // partir las muestras por donde sea no cambia nada
  const ruidoso = medir(muestrasFm(tono, 3000, 20, 20, azarFijo(9)), 65536);          // ruido tan fuerte como la señal en los 2,4 MHz
  assert.ok(Math.abs(ruidoso.amp - limpio.amp) < 1500 && ruidoso.resto < 0.5, `con ruido: ${ruidoso.amp}, ${ruidoso.resto}`);
});
