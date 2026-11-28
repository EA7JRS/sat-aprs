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
  // GPS propio de la caja con la posición congelada (equipo parado) -> «fijo»
  const g = aplicarEventoCaja(e, { e: 'info', gps: { lines: 842, lat: 36.72, lon: -4.42, held: true } }, 4);
  assert.equal(g.gps, true);
  assert.equal(g.fijo, true);
  assert.equal(aplicarEventoCaja(e, { e: 'info' }, 5).gps, false);
  // Compensación de actitud (escora / cabeceo / giro del mástil)
  const a = aplicarEventoCaja(e, { e: 'pos', az: 10, att: { on: true, r: 5.2, p: -3.1, y: 12, age: 1 } }, 6);
  assert.ok(a.actitud && a.actitud.on === true && Math.abs(a.actitud.roll - 5.2) < 0.01 && a.actitud.pitch < -3 && a.actitud.viejo === false);
  assert.equal(aplicarEventoCaja(e, { e: 'pos', az: 10 }, 7).actitud, null);
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

// ── Seguimiento del rotor, con estación fija o en movimiento ────────────────
import { Proa, Seguimiento, acimutDeRotor, acimutVerdadero, calcular, difAngulo, posicionEstimada } from '../server/radio/seguimiento';
import { leerPosicionAprs } from '../server/aprsPosicion';

test('APRS: rumbo y velocidad de las estaciones en movimiento', () => {
  const m = leerPosicionAprs('EA7KZ-9', 'APRS', '!3723.00N/00559.00W>090/036En ruta')!;
  assert.equal(m.rumbo, 90);
  assert.equal(m.velocidadKmh, 66.7);
  assert.equal(m.comentario, 'En ruta');
  // Parada, sin extensión o estación meteorológica (ahí es viento): sin movimiento
  assert.equal(leerPosicionAprs('EA7KZ-9', 'APRS', '!3723.00N/00559.00W>000/000Parado')!.rumbo, undefined);
  assert.equal(leerPosicionAprs('EA7KZ-9', 'APRS', '!3723.00N/00559.00W-Casa')!.velocidadKmh, undefined);
  assert.equal(leerPosicionAprs('EA7WX', 'APRS', '!3723.00N/00559.00W_220/004g005t077')!.rumbo, undefined);
  // Comprimida: «7P» = rumbo 88°, 36,2 nudos (ejemplo de la especificación)
  const c = leerPosicionAprs('EA7KZ-9', 'APRS', '!/5L!!<*e7>7P[')!;
  assert.equal(c.rumbo, 88);
  assert.ok(Math.abs(c.velocidadKmh! - 67.1) < 0.3);
});

test('seguimiento: posición estimada de una estación en movimiento', () => {
  const e = { nombre: 'EA7KZ-9', lat: 37, lon: -6, ultima: 0, rumbo: 90, velocidadKmh: 72 };
  // 100 s a 72 km/h = 2 km hacia el este
  const r = posicionEstimada(e, 100_000);
  assert.equal(r.estimada, true);
  assert.ok(Math.abs(r.pos.lat - 37) < 0.001);
  assert.ok(Math.abs((r.pos.lon + 6) * 111.32 * Math.cos((37 * Math.PI) / 180) - 2) < 0.02);
  // Nunca más de 300 s de extrapolación
  const lejos = posicionEstimada(e, 3600_000);
  assert.ok(Math.abs((lejos.pos.lon + 6) * 111.32 * Math.cos((37 * Math.PI) / 180) - 6) < 0.05);
  // Parada o sin datos: su última posición, sin marcar como estimada
  assert.deepEqual(posicionEstimada({ nombre: 'X', lat: 37, lon: -6, ultima: 0 }, 100_000), { pos: { lat: 37, lon: -6 }, estimada: false });
  assert.equal(posicionEstimada({ ...e, velocidadKmh: 0.5 }, 100_000).estimada, false);
});

test('seguimiento: estación fija y estación móvil con rumbo de proa', () => {
  assert.equal(acimutDeRotor(90, null), 90);
  assert.equal(acimutDeRotor(90, 120), 330); // proa al 120: el este queda 30° a babor
  assert.equal(acimutVerdadero(330, 120), 90);
  assert.equal(difAngulo(5, 355), 10);
  assert.equal(difAngulo(355, 5), -10);

  const proa = new Proa();
  assert.equal(proa.anotar(200, 1), null); // parado: el rumbo del GPS no vale
  assert.equal(proa.anotar(118, 40), 118);
  assert.equal(proa.anotar(300, 0.5), 118); // se para: conserva el último

  const objetivoEste = { nombre: 'EA7KZ-9', lat: 37, lon: -5, ultima: 0 };
  const base = { estacion: { lat: 37, lon: -6 }, buscar: (i: string) => (i === 'EA7KZ-9' ? objetivoEste : null), ultimaOida: () => objetivoEste, conElevacion: false };
  const fija = calcular({ tipo: 'aprs', indicativo: 'EA7KZ-9' }, { ...base, movil: false, proa: null }, 1000);
  assert.ok(fija.ok && Math.abs(fija.azVerdadero! - 89.7) < 0.3 && fija.azRotor === fija.azVerdadero);
  assert.ok(Math.abs(fija.distanciaKm! - 88.8) < 0.5);
  const movil = calcular({ tipo: 'aprs', indicativo: 'EA7KZ-9' }, { ...base, movil: true, proa: 120 }, 1000);
  assert.ok(Math.abs(movil.azRotor! - 329.7) < 0.3);
  assert.equal(movil.azVerdadero, fija.azVerdadero);
  // Móvil sin rumbo: no se mueve, y se dice por qué
  const sinProa = calcular({ tipo: 'aprs', indicativo: 'EA7KZ-9' }, { ...base, movil: true, proa: null }, 1000);
  assert.equal(sinProa.ok, false);
  assert.match(sinProa.espera!, /rumbo/);
  // Estación que no se ha oído
  assert.equal(calcular({ tipo: 'aprs', indicativo: 'EA7XYZ' }, { ...base, movil: false, proa: null }, 1000).ok, false);
  // Estimada: lleva «~»
  const enMarcha = { ...objetivoEste, rumbo: 0, velocidadKmh: 100 };
  const est = calcular({ tipo: 'ultima' }, { ...base, ultimaOida: () => enMarcha, movil: false, proa: null }, 200_000);
  assert.equal(est.nombre, 'EA7KZ-9~');
  assert.ok(est.azVerdadero! < 89);

  // El rotor solo se mueve cuando el cambio pasa del paso
  const s = new Seguimiento(2);
  s.seguir({ tipo: 'aprs', indicativo: 'EA7KZ-9' });
  const ctx = { ...base, movil: true, proa: 120 as number | null };
  assert.ok(Math.abs(s.paso(ctx, 1000)!.az - 329.7) < 0.3);
  assert.equal(s.paso(ctx, 2000), null);
  ctx.proa = 121; // un grado: no merece mover
  assert.equal(s.paso(ctx, 3000), null);
  ctx.proa = 150; // el barco vira: se vuelve a apuntar
  assert.ok(Math.abs(s.paso(ctx, 4000)!.az - 299.7) < 0.3);
  s.dejar();
  assert.equal(s.paso(ctx, 5000), null);
});

test('seguimiento: sol y luna', () => {
  const ctx = { estacion: { lat: 37.39, lon: -5.99 }, movil: false, proa: null, buscar: () => null, ultimaOida: () => null, conElevacion: true };
  // Mediodía solar aproximado en Sevilla el 21 de junio: sol alto y al sur
  const dia = calcular({ tipo: 'sol' }, ctx, Date.UTC(2026, 5, 21, 12, 26));
  assert.ok(dia.ok);
  assert.ok(Math.abs(dia.azVerdadero! - 180) < 6, `acimut ${dia.azVerdadero}`);
  assert.ok(Math.abs(dia.elevacion! - 76) < 1.5, `elevación ${dia.elevacion}`);
  // De noche: espera, no mueve
  const noche = calcular({ tipo: 'sol' }, ctx, Date.UTC(2026, 5, 21, 0, 30));
  assert.equal(noche.ok, false);
  assert.match(noche.espera!, /horizonte/);
  // Sin elevación en el rotor: solo acimut
  assert.equal(calcular({ tipo: 'sol' }, { ...ctx, conElevacion: false }, Date.UTC(2026, 5, 21, 12, 26)).elevacion, undefined);
  const luna = calcular({ tipo: 'luna' }, ctx, Date.UTC(2026, 5, 21, 12, 26));
  assert.equal(typeof luna.azVerdadero, 'number');
  // Aeronave a 10 km y 10 000 m sobre la estación: unos 45° de elevación
  const avion = { nombre: 'IBE3110', lat: 37.39 + 10 / 111.19, lon: -5.99, ultima: 0, altitudM: 10_000 };
  const a = calcular({ tipo: 'avion', indicativo: 'IBE3110' }, { ...ctx, altitudM: 0, buscar: (i, t) => (t === 'avion' && i === 'IBE3110' ? avion : null) }, 1000);
  assert.ok(a.ok && Math.abs(a.elevacion! - 45) < 0.5 && Math.abs(difAngulo(a.azVerdadero!, 0)) < 0.5);
});

// ── Satélites: TLE, posición y pasos ────────────────────────────────────────
import { conDoppler, epocaTle, leerSatelites, mirar, orbita, proximoPaso, sumaTle } from '../server/radio/satelites';

const ARCHIVO_SAT = [
  '# APRS LoRa+ satellites (all bands, groups) 2026-11-14T10:39Z',
  '# TLE: CelesTrak. Transmitters: SatNOGS DB (CC BY-SA 4.0).',
  'S|25544|ISS (ZARYA)|U|ansv',
  '1 25544U 98067A   26317.91612726  .00008668  00000+0  16320-3 0  9995',
  '2 25544  51.6324 279.1461 0007382  22.6178 337.5134 15.49359724594967',
  'T|145825000|145825000|145825000|145825000|AFSK|1200|0|Mode V APRS',
  'T|145990000|145990000|437800000|437800000|FM|0|0|Mode V/U FM repeater|670',
  'S|23839|INMARSAT 3-F1|G',
  'S|99999|TLE ROTO|U|a',
  '1 99999U 98067A   26317.91612726  .00008668  00000+0  16320-3 0  9993',
  '2 25544  51.6324 279.1461 0007382  22.6178 337.5134 15.49359724594967',
].join('\n');

test('satélites: lectura del archivo de TLE y transmisores', () => {
  const { satelites, generado } = leerSatelites(ARCHIVO_SAT);
  assert.equal(generado, Date.UTC(2026, 10, 14, 10, 39));
  assert.equal(satelites.length, 1); // sin TLE o con la suma de control mal, fuera
  const iss = satelites[0];
  assert.equal(iss.norad, 25544);
  assert.equal(iss.nombre, 'ISS (ZARYA)');
  assert.equal(iss.grupos, 'ansv');
  assert.equal(iss.transmisores.length, 2);
  assert.deepEqual(iss.transmisores[1], { subidaHz: 145990000, bajadaHz: 437800000, modo: 'FM', baudios: 0, descripcion: 'Mode V/U FM repeater', ctcssHz: 67 });
  assert.equal(iss.transmisores[0].ctcssHz, undefined);
  // Día 317,916 de 2026 = 13 de noviembre, hacia las 22 UTC
  assert.equal(new Date(epocaTle(iss.tle1)).toISOString().slice(0, 13), '2026-11-13T21');
  assert.equal(sumaTle(iss.tle1), true);
  assert.equal(sumaTle(iss.tle1.slice(0, 68) + '0'), false);
});

test('satélites: posición, Doppler y próximo paso', () => {
  const iss = leerSatelites(ARCHIVO_SAT).satelites[0];
  const o = orbita(iss)!;
  assert.ok(o);
  const sevilla = { lat: 37.39, lon: -5.99 };
  const t0 = Date.UTC(2026, 10, 14, 12, 0);
  const m = mirar(o, sevilla, 10, t0)!;
  assert.ok(m.az >= 0 && m.az < 360 && m.el >= -90 && m.el <= 90);
  assert.ok(m.distanciaKm > 350 && m.distanciaKm < 14000, `distancia ${m.distanciaKm}`);
  assert.ok(Math.abs(m.radialKmS) < 8);
  // Un paso de la ISS: dura minutos, sale y se pone en el horizonte y culmina entre medias
  const p = proximoPaso(o, sevilla, 10, t0)!;
  assert.ok(p, 'hay paso en 36 h');
  assert.ok(p.aos >= t0 && p.los > p.aos && p.maximo > p.aos && p.maximo < p.los);
  const minutos = (p.los - p.aos) / 60000;
  assert.ok(minutos > 0.5 && minutos < 12, `duración ${minutos} min`);
  assert.ok(p.elMax > 0 && p.elMax <= 90);
  assert.ok(Math.abs(mirar(o, sevilla, 10, p.aos)!.el) < 0.3);
  assert.ok(Math.abs(mirar(o, sevilla, 10, p.los)!.el) < 0.3);
  assert.ok(mirar(o, sevilla, 10, p.maximo)!.el > mirar(o, sevilla, 10, p.aos + 5000)!.el);
  // En mitad del paso devuelve el mismo paso, no el siguiente
  const enCurso = proximoPaso(o, sevilla, 10, p.maximo)!;
  assert.ok(Math.abs(enCurso.aos - p.aos) <= 1000 && Math.abs(enCurso.los - p.los) <= 1000);
  // Doppler: acercándose (radial negativa) la frecuencia recibida sube
  assert.equal(conDoppler(145_825_000, -7), 145_828_405);
  assert.equal(conDoppler(145_825_000, 0), 145_825_000);
  assert.equal(orbita({ tle1: 'basura', tle2: 'basura' }), null);
});

// ── Doppler continuo ────────────────────────────────────────────────────────
import { bajadaConDoppler, decidir, modoEquipo, subidaConDoppler, toleranciaHz, EstadoDoppler } from '../server/radio/doppler';

test('Doppler: frecuencias, modos y cuándo resintonizar', () => {
  // ISS acercándose a 7 km/s: la bajada sube unos 3,4 kHz en 2 m y la subida se baja
  assert.equal(bajadaConDoppler(145_800_000, -7), 145_803_404);
  assert.equal(subidaConDoppler(145_990_000, -7), 145_986_591);
  assert.equal(modoEquipo('FM'), 'FM');
  assert.equal(modoEquipo('AFSK'), 'FM');
  assert.equal(modoEquipo('GMSK USP'), 'FM');
  assert.equal(modoEquipo('BPSK'), 'USB');
  assert.equal(modoEquipo('CW'), 'CW');
  assert.equal(modoEquipo('LoRa'), null);
  assert.equal(toleranciaHz('FM'), 1000);
  assert.equal(toleranciaHz('CW'), 50);
  const base: EstadoDoppler = {
    norad: 25544, nombre: 'ISS', bajadaHz: 145_800_000, subidaHz: 145_990_000, modo: 'FM', descripcion: '', inicio: 0, fin: 600_000,
    ultimaRx: null, ultimaTx: null, ultimaVez: null, radialKmS: null, split: null,
  };
  // Primera vez: manda las dos
  assert.deepEqual(decidir(base, -7, null, 1000), { tipo: 'mandar', rx: 145_803_404, tx: 145_986_591 });
  // Menos de la tolerancia (FM, 1 kHz): nada
  const hecho = { ...base, ultimaRx: 145_803_404, ultimaTx: 145_986_591 };
  assert.deepEqual(decidir(hecho, -6.5, 145_803_404, 2000), { tipo: 'nada' });
  // Pasa de la tolerancia: solo lo que cambia
  const d = decidir(hecho, -4, 145_803_404, 3000);
  assert.equal(d.tipo, 'mandar');
  // Sin split: solo la bajada
  assert.deepEqual(decidir({ ...base, split: false }, -7, null, 1000), { tipo: 'mandar', rx: 145_803_404, tx: null });
  // Operador mueve el dial: se deja
  assert.deepEqual(decidir(hecho, -7, 145_850_000, 4000), { tipo: 'parar', motivo: 'se ha movido el dial del equipo' });
  // Fin del paso
  assert.deepEqual(decidir(hecho, 7, 145_796_596, 700_000), { tipo: 'parar', motivo: 'ha terminado el paso' });
});
