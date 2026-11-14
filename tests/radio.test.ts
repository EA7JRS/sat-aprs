// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mensajeria, REINTENTOS_S, infoAcuse, infoMensaje, leerMensajeAprs } from '../server/radio/mensajes';
import { TablaDxcc } from '../server/radio/dxcc';
import { ClusterDx, bandaDe, leerSpot } from '../server/radio/clusterDx';
import { cuerpoDapnet } from '../server/radio/dapnet';
import { normalizeInfo } from '../server/aprs';

test('mensajes: lectura de mensaje, número y acuse', () => {
  assert.deepEqual(leerMensajeAprs(':EA7JRS-13:Hola, QRV en R2{17'), { para: 'EA7JRS-13', texto: 'Hola, QRV en R2', id: '17' });
  assert.deepEqual(leerMensajeAprs(':EA7JRS   :sin numero'), { para: 'EA7JRS', texto: 'sin numero', id: undefined });
  assert.deepEqual(leerMensajeAprs(':EA7JRS-13:ack17'), { para: 'EA7JRS-13', texto: '', id: '17', acuse: 'ack' });
  assert.deepEqual(leerMensajeAprs(':EA7JRS-13:rejAB}'), { para: 'EA7JRS-13', texto: '', id: 'AB', acuse: 'rej' });
  assert.equal(leerMensajeAprs(':EA7JRS-13:con acuse encadenado{AB}CD')!.id, 'AB');
  assert.equal(leerMensajeAprs('!3723.00N/00559.00W-'), null);
  assert.equal(infoMensaje('ea7kz-9', 'Recibido 5/9', '3'), ':EA7KZ-9  :Recibido 5/9{3');
  assert.equal(infoAcuse('EA7KZ-9', '17'), ':EA7KZ-9  :ack17');
  // El número de mensaje no se pierde al recortar un texto de 67 caracteres
  const largo = 'x'.repeat(67);
  assert.equal(normalizeInfo(infoMensaje('EA7KZ-9', largo, '12')), `:EA7KZ-9  :${largo}{12`);
  assert.equal(normalizeInfo(`:BLN1REMER:${'y'.repeat(80)}`), `:BLN1REMER:${'y'.repeat(67)}`);
});

test('mensajes: bandeja, acuse, duplicados y mensajes ajenos', () => {
  const m = new Mensajeria(() => 'EA7JRS-13');
  const t0 = 1_000_000;
  const r1 = m.recibir('EA7KZ-9', ':EA7JRS-13:QRV en R2{17', 'RF', t0);
  assert.equal(r1!.info, ':EA7KZ-9  :ack17');
  // Repetido: se vuelve a confirmar, no se duplica
  const r2 = m.recibir('EA7KZ-9', ':EA7JRS-13:QRV en R2{17', 'IS', t0 + 30_000);
  assert.equal(r2!.info, ':EA7KZ-9  :ack17');
  assert.equal(m.recibidos.length, 1);
  assert.equal(m.recibidos[0].veces, 2);
  assert.equal(m.recibidos[0].via, 'RF');
  // Para otra estación o para otro SSID: ni bandeja ni acuse
  assert.equal(m.recibir('EA7KZ-9', ':EA7XYZ   :no es para mi{1', 'RF', t0), null);
  assert.equal(m.recibir('EA7KZ-9', ':EA7JRS-7 :otro SSID{2', 'RF', t0), null);
  assert.equal(m.recibidos.length, 1);
  // Sin número no hay acuse, pero sí entra
  assert.equal(m.recibir('EA7URS-3', ':EA7JRS-13:sin numero', 'IS', t0), null);
  // Boletín: entra como boletín, sin acuse
  assert.equal(m.recibir('EA7URS', ':BLN1REMER:Simulacro a las 13 UTC', 'RF', t0), null);
  assert.equal(m.recibidos.length, 3);
  assert.equal(m.sinLeer, 2);
  m.marcarLeidos();
  assert.equal(m.sinLeer, 0);
  // Eco de la propia estación
  assert.equal(m.recibir('EA7JRS-13', ':EA7JRS-13:eco{9', 'IS', t0), null);
});

test('mensajes: envío, reintentos y acuse', () => {
  const m = new Mensajeria(() => 'EA7JRS-13');
  const t0 = 5_000_000;
  assert.equal(m.redactar('no vale!', 'hola', t0).ok, false);
  assert.equal(m.redactar('EA7KZ-9', '   ', t0).ok, false);
  assert.equal(m.redactar('EA7KZ-9', 'x'.repeat(68), t0).ok, false);
  const r = m.redactar('ea7kz-9', 'Recibido 5/9', t0);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.emision.info, ':EA7KZ-9  :Recibido 5/9{1');
  assert.deepEqual(m.reintentos(t0 + 10_000), []);
  const re = m.reintentos(t0 + REINTENTOS_S[0] * 1000);
  assert.equal(re.length, 1);
  assert.equal(re[0].info, ':EA7KZ-9  :Recibido 5/9{1');
  // Acuse de otra estación: no cuenta
  m.recibir('EA7XYZ', ':EA7JRS-13:ack1', 'IS', t0 + 40_000);
  assert.equal(m.enviados[0].estado, 'pendiente');
  m.recibir('EA7KZ-9', ':EA7JRS-13:ack1', 'RF', t0 + 41_000);
  assert.equal(m.enviados[0].estado, 'recibido');
  assert.deepEqual(m.reintentos(t0 + 3600_000), []);
  // Sin acuse tras todos los intentos
  const s = m.redactar('EA7URS-3', 'Sin respuesta', t0);
  assert.ok(s.ok);
  let t = t0;
  for (const espera of REINTENTOS_S) { t += espera * 1000; assert.equal(m.reintentos(t).length, 1); }
  assert.equal(m.enviados[0].intentos, REINTENTOS_S.length + 1);
  m.reintentos(t + 241_000);
  assert.equal(m.enviados[0].estado, 'sin-acuse');
  // Boletín: sin número ni reintentos
  const b = m.redactar('BLN1REMER', 'Prueba', t0);
  assert.ok(b.ok && b.emision.info === ':BLN1REMER:Prueba');
});

test('dxcc: país, situación y prefijo más largo', () => {
  const cty = [
    'Spain:                    14:  37:  EU:   40.37:     4.88:    -1.0:  EA:',
    '    AM,AN,AO,EA,EB,EC,ED,EE,EF,EG,EH;',
    'Canary Islands:           33:  36:  AF:   28.32:    15.85:     0.0:  EA8:',
    '    AM8,AN8,AO8,EA8,EB8,EC8,ED8,EE8,EF8,EG8,EH8,=EA7JRS/8;',
    'Falkland Islands:         13:  16:  SA:  -51.63:    58.72:     4.0:  VP8:',
    '    VP8(13)[16],=VP8LP;',
    'Japan:                    25:  45:  AS:   36.40:  -138.38:    -9.0:  JA:',
    '    7J,7K,7L,7M,7N,8J,8K,8L,8M,8N,JA,JE,JF,JG,JH,JI,JJ,JK,JL,JM,JN,JO,JP,JQ,JR,JS;',
    '',
  ].join('\r\n');
  const t = new TablaDxcc();
  assert.equal(t.cargar(cty), 4);
  assert.equal(t.buscar('EA7JRS')!.nombre, 'Spain');
  assert.equal(t.buscar('EA7JRS-13')!.nombre, 'Spain');
  assert.equal(t.buscar('EA8ABC')!.nombre, 'Canary Islands'); // el prefijo más largo gana
  assert.equal(t.buscar('EA8/DL1ABC')!.nombre, 'Canary Islands');
  assert.equal(t.buscar('EA7JRS/P')!.nombre, 'Spain');
  const vp8 = t.buscar('VP8LP')!;
  assert.equal(vp8.nombre, 'Falkland Islands');
  assert.equal(vp8.lon, -58.72); // oeste negativo
  assert.equal(t.buscar('JA1NUT')!.lon, 138.38);
  assert.equal(t.buscar('ZZ9ZZ'), null);
  assert.equal(new TablaDxcc().buscar('EA7JRS'), null);
});

test('cluster DX: lectura de spots y bandas', () => {
  const s = leerSpot('DX de EA5BY:     14205.0  VP8LP        Falkland, 59 en EA             1243Z', 123)!;
  assert.deepEqual(s, { khz: 14205, dx: 'VP8LP', de: 'EA5BY', comentario: 'Falkland, 59 en EA', hora: '1243', cuando: 123, banda: '20 m' });
  const rbn = leerSpot('DX de DL4KW-#:    7018.5  EA7AH        CW 21 dB 24 WPM CQ             0915Z JN58')!;
  assert.equal(rbn.de, 'DL4KW');
  assert.equal(rbn.banda, '40 m');
  assert.equal(leerSpot('DX de F5IN:      144300.0  EA1ABC                                    1810Z')!.comentario, '');
  assert.equal(leerSpot('WWV de VE7CC <18>:   SFI=150, A=8, K=2'), null);
  assert.equal(bandaDe(50313), '6 m');
  assert.equal(bandaDe(12345), '');
  const c = new ClusterDx(() => {}, 2);
  c.linea('DX de EA5BY:     14205.0  VP8LP        uno                            1243Z');
  c.linea('login: ');
  c.linea('DX de EA5BY:     14206.0  VP8LP        dos                            1244Z');
  c.linea('DX de EA5BY:     14207.0  VP8LP        tres                           1245Z');
  assert.deepEqual(c.spots.map((x) => x.comentario), ['tres', 'dos']);
  assert.equal(c.lineas.length, 4);
  assert.equal(c.orden('sh/dx'), false); // sin conexión no se envía
});

test('DAPNET: validación del envío', () => {
  assert.deepEqual(cuerpoDapnet({ texto: ' Simulacro  13 UTC ', indicativos: ['EA7URS', 'no vale!'], grupos: ['EA-ALL'] }), {
    ok: true, cuerpo: { text: 'Simulacro 13 UTC', callSignNames: ['ea7urs'], transmitterGroupNames: ['ea-all'], emergency: false },
  });
  assert.equal(cuerpoDapnet({ texto: 'x'.repeat(81), indicativos: ['ea7urs'], grupos: ['ea-all'] }).ok, false);
  assert.equal(cuerpoDapnet({ texto: 'hola', indicativos: [], grupos: ['ea-all'] }).ok, false);
  assert.equal(cuerpoDapnet({ texto: 'hola', indicativos: ['ea7urs'], grupos: [] }).ok, false);
});

// ── Equipo y rotor por Hamlib ───────────────────────────────────────────────
import net from 'node:net';
import { ClienteHamlib, Equipo, Rotor, aplicarEventoCaja, leerRespuestaHamlib, sMeter } from '../server/radio/hamlib';

test('Hamlib: lectura de respuestas extendidas y S-meter', () => {
  assert.deepEqual(leerRespuestaHamlib(['get_freq:', 'Frequency: 14205000'], 0), { codigo: 0, valores: { Frequency: '14205000' }, sueltas: [] });
  assert.deepEqual(leerRespuestaHamlib(['get_mode:', 'Mode: USB', 'Passband: 2400'], 0).valores, { Mode: 'USB', Passband: '2400' });
  assert.deepEqual(leerRespuestaHamlib(['get_level: STRENGTH', '-12'], 0).sueltas, ['-12']);
  assert.deepEqual(leerRespuestaHamlib(['set_freq: 14205000'], 0), { codigo: 0, valores: {}, sueltas: [] });
  assert.equal(sMeter(0).texto, 'S9');
  assert.equal(sMeter(-24).texto, 'S5');
  assert.equal(sMeter(-80).texto, 'S0');
  assert.equal(sMeter(11).texto, 'S9 +10 dB');
});

test('rotor: eventos de la caja APRS LoRa+ Rotor', () => {
  const r = new Rotor();
  let e = aplicarEventoCaja(r.estado, { e: 'info', hasEl: true, dev: 'APRS LoRa+ Rotor', name: 'APRS-Rotor' }, 1);
  e = aplicarEventoCaja(e, { e: 'pos', az: 123.4, el: 45, mv: true, f: 'OK', taz: 125, tel: 45 }, 2);
  assert.equal(e.enlace, true);
  assert.equal(e.az, 123.4);
  assert.equal(e.objetivoAz, 125);
  assert.equal(e.moviendo, true);
  assert.equal(e.tieneElevacion, true);
  assert.equal(e.nombre, 'APRS LoRa+ Rotor · APRS-Rotor');
  // Sin elevación: queda sin dato, no en cero
  assert.equal(aplicarEventoCaja(e, { e: 'pos', az: 10, mv: false, f: 'WIND' }, 3).el, null);
  assert.equal(aplicarEventoCaja(e, { e: 'pos', az: 10, mv: false, f: 'WIND' }, 3).fallo, 'WIND');
  assert.equal(aplicarEventoCaja(e, 'basura', 3), e);
});

test('Hamlib: equipo y rotor contra demonios simulados', async () => {
  const equipo = { f: 14205000, modo: 'USB', vfo: 'VFOA', ptt: 0 };
  const rig = net.createServer((s) => {
    s.on('error', () => {});
    s.on('data', (d) => {
      for (const o of d.toString().split('\n').map((x) => x.trim()).filter(Boolean)) {
        if (o === '+f') s.write(`get_freq:\nFrequency: ${equipo.f}\nRPRT 0\n`);
        else if (o === '+m') s.write(`get_mode:\nMode: ${equipo.modo}\nPassband: 2400\nRPRT 0\n`);
        else if (o === '+v') s.write(`get_vfo:\nVFO: ${equipo.vfo}\nRPRT 0\n`);
        else if (o === '+t') s.write(`get_ptt:\nPTT: ${equipo.ptt}\nRPRT 0\n`);
        else if (o === '+l STRENGTH') s.write('get_level: STRENGTH\nRPRT -11\n');
        else if (o === '+_') s.write('get_info:\nInfo: Dummy\nRPRT 0\n');
        else if (o.startsWith('+F ')) { equipo.f = Number(o.slice(3)); s.write(`set_freq: ${equipo.f}\nRPRT 0\n`); }
        else if (o.startsWith('+M ')) { equipo.modo = o.split(' ')[1]; s.write('set_mode:\nRPRT 0\n'); }
        else if (o.startsWith('+T ')) { equipo.ptt = Number(o.slice(3)); s.write('set_ptt:\nRPRT 0\n'); }
        else s.write('RPRT -1\n');
      }
    });
  });
  const pos = { az: 312, el: 0 };
  const rot = net.createServer((s) => {
    s.on('error', () => {});
    s.on('data', (d) => {
      for (const o of d.toString().split('\n').map((x) => x.trim()).filter(Boolean)) {
        if (o === '+p') s.write(`get_pos:\nAzimuth: ${pos.az.toFixed(6)}\nElevation: ${pos.el.toFixed(6)}\nRPRT 0\n`);
        else if (o.startsWith('+P ')) { const [, a, e] = o.split(' '); pos.az = Number(a); pos.el = Number(e); s.write('set_pos:\nRPRT 0\n'); }
        else if (o === '+S') s.write('stop:\nRPRT 0\n');
        else s.write('RPRT -11\n');
      }
    });
  });
  await new Promise<void>((r) => rig.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => rot.listen(0, '127.0.0.1', r));
  const e = new Equipo(1000);
  const r = new Rotor();
  try {
    e.ajustar('127.0.0.1', (rig.address() as net.AddressInfo).port);
    await e.sondear(1000);
    assert.equal(e.estado.enlace, true);
    assert.equal(e.estado.frecuenciaHz, 14205000);
    assert.equal(e.estado.modo, 'USB');
    assert.equal(e.estado.anchoHz, 2400);
    assert.equal(e.estado.vfo, 'VFOA');
    assert.equal(e.estado.ptt, false);
    assert.equal(e.estado.senalDb, null); // este equipo no da S-meter
    assert.equal(e.estado.modelo, 'Dummy');
    assert.deepEqual(await e.frecuencia(7049000), { ok: true });
    assert.deepEqual(await e.modo('lsb'), { ok: true });
    assert.equal((await e.modo('XYZ')).ok, false);
    assert.equal((await e.frecuencia(5)).ok, false);
    await e.sondear(2000);
    assert.equal(e.estado.frecuenciaHz, 7049000);
    assert.equal(e.estado.modo, 'LSB');
    // PTT con corte de seguridad
    assert.deepEqual(await e.ptt(true, 3000), { ok: true });
    await e.sondear(3500);
    assert.equal(e.estado.ptt, true);
    await e.sondear(5000); // pasado el máximo: suelta el PTT
    assert.equal(equipo.ptt, 0);

    r.ajustar('rotctld', '127.0.0.1', (rot.address() as net.AddressInfo).port);
    await r.sondear(1000);
    assert.equal(r.estado.az, 312);
    assert.equal(r.estado.el, 0);
    assert.equal((await r.ir(500)).ok, false);
    assert.deepEqual(await r.ir(298), { ok: true });
    assert.equal(r.estado.objetivoAz, 298);
    await r.sondear(2000);
    assert.equal(r.estado.az, 298);
    assert.equal(r.estado.moviendo, true);
    await r.sondear(3000);
    assert.equal(r.estado.moviendo, false);
    assert.equal(r.estado.objetivoAz, null); // ha llegado
    assert.deepEqual(await r.detener(), { ok: true });
    assert.equal((await r.aparcar()).ok, false); // este rotor no tiene reposo

    // Sin demonio: enlace caído y error, sin valores viejos como si fueran actuales
    const nadie = new ClienteHamlib('127.0.0.1', 1, 500);
    await assert.rejects(nadie.orden('f'));
  } finally {
    e.parar(); r.parar(); rig.close(); rot.close();
  }
});
