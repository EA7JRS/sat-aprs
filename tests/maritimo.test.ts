// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ColaArchivo, cerrarPendiente, claveNavtex, eventoNavtex, separarNavtex, mensajesDeReceptor, urlReceptorValida } from '../server/radio/navtex';
import { eventoEgc, juntarEgc, leerEgc } from '../server/radio/egc';
import { posicionEnTexto } from '../server/core/posicionTexto';
import { boletinAprs, objetoAprs } from '../server/core/aprsAvisos';

const T = Date.parse('2026-11-20T10:00:00Z');

test('posición en el texto de un radioaviso', () => {
  assert.deepEqual(posicionEnTexto('WRECK IN 36-05.2N 005-21.0W MARKED'), { lat: 36.08667, lon: -5.35 });
  assert.deepEqual(posicionEnTexto('POSITION 3605.2N 00521.0W'), { lat: 36.08667, lon: -5.35 });
  assert.deepEqual(posicionEnTexto("36°05'N 005°21'W"), { lat: 36.08333, lon: -5.35 });
  assert.equal(posicionEnTexto('NAVAREA III 123/26'), null);
  assert.equal(posicionEnTexto('36-75N 005-21W'), null);   // minutos imposibles
});

// La cabecera y el principio son la salida real de navtex_rx_from_file con la grabación de Mondolfo (fventuri/navtex)
const MONDOLFO = '\nZCZC EE39\n062040 UTC NOV 21\nMONDOLFO RADIO\n\nPREVISIONI METEOROLOGICHE PER IL MEDITERRANEO EMESSE DAL CENTRO METEO DI ROMA\n';

test('NAVTEX: separa los mensajes de la corriente de caracteres', () => {
  // A medias: queda pendiente
  let r = separarNavtex('ruido' + MONDOLFO, T);
  assert.equal(r.mensajes.length, 0);
  assert.ok(r.resto.startsWith('ZCZC EE39'));
  // Llega el final y otro mensaje entero
  r = separarNavtex(r.resto + 'NNNN\n\nZCZC GD05\nSAR. MAYDAY RELAY. FISHING VESSEL SINKING IN 36-05.2N 005-21.0W.\nALL SHIPS IN VICINITY KEEP SHARP LOOKOUT.\nNNNN\nZCZC GA1', T);
  assert.deepEqual(r.mensajes.map((m) => m.cabecera), ['EE39', 'GD05']);
  const [e39, d05] = r.mensajes;
  assert.equal(e39.dtg, '062040 UTC NOV 21');
  assert.equal(e39.estacion, 'E');
  assert.equal(e39.tema, 'E');
  assert.equal(e39.incompleto, false);
  assert.deepEqual(d05.posicion, { lat: 36.08667, lon: -5.35 });
  assert.equal(r.resto, '\nZCZC GA1');
  // Una cabecera nueva sin NNNN corta la anterior
  r = separarNavtex('ZCZC GA12\nLIGHT UNLIT AT PUNTA CARNERO.\nZCZC GB13\nGALE WARNING STRAIT OF GIBRALTAR.\nNNNN', T);
  assert.deepEqual(r.mensajes.map((m) => [m.cabecera, m.incompleto]), [['GA12', true], ['GB13', false]]);
  // Pendiente demasiado tiempo
  assert.equal(cerrarPendiente('ZCZC GA14\nTEXTO A MEDIAS SIN FINAL', T, T + 60_000), null);
  assert.equal(cerrarPendiente('ZCZC GA14\nTEXTO A MEDIAS SIN FINAL', T, T + 16 * 60_000)!.incompleto, true);
});

test('NAVTEX: aviso con la gravedad del tema y la misma clave al repetirse', () => {
  const r = separarNavtex('ZCZC GD05\nSAR. MAYDAY RELAY. FISHING VESSEL SINKING IN 36-05.2N 005-21.0W.\nNNNN\nZCZC GE40\n201000 UTC NOV 26\nFORECAST FOR STRAIT.\nNNNN\n', T);
  const [sar, prevision] = r.mensajes.map((m) => eventoNavtex(m, 12 * 3600_000)!);
  assert.equal(sar.gravedad, 'rojo');
  assert.equal(sar.titulo, 'SAR. MAYDAY RELAY. FISHING VESSEL SINKING IN 36-05.2N 005-21');   // 60 caracteres
  assert.equal(sar.lat, 36.08667);
  assert.equal(sar.nombre, 'NTXGD05');
  assert.equal(prevision.gravedad, 'info');
  assert.equal(prevision.titulo, 'FORECAST FOR STRAIT.');   // sin el grupo fecha-hora
  assert.equal(prevision.lat, undefined);
  assert.ok(objetoAprs('EA7JRS-13', sar, T)!.includes(';NTXGD05  *'));
  assert.ok(boletinAprs('EA7JRS-13', sar).includes(':BLN1MARIT:'));
  const otraVez = separarNavtex('ZCZC GD05\nSAR. MAYDAY RELAY. FISHING VESSEL SINKING IN 36-05.2N 005-21.0W.\nNNNN', T + 4 * 3600_000).mensajes[0];
  assert.equal(claveNavtex(otraVez), claveNavtex(r.mensajes[0]));
});

test('NAVTEX: lee lo que se añade al archivo, también si se vacía', () => {
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sat-ntx-')), 'navtex.txt');
  const c = new ColaArchivo(ruta);
  assert.equal(c.leerNuevo(), '');
  assert.match(c.error!, /no existe/);
  fs.writeFileSync(ruta, 'ZCZC GA');
  assert.equal(c.leerNuevo(), 'ZCZC GA');
  fs.appendFileSync(ruta, '12\nTEXTO\n');
  assert.equal(c.leerNuevo(), '12\nTEXTO\n');
  assert.equal(c.leerNuevo(), '');
  fs.writeFileSync(ruta, 'NUEVO');
  assert.equal(c.leerNuevo(), 'NUEVO');
});

test('EGC: lee el JSON de InmarScope y junta los trozos', () => {
  const linea = (texto: string, extra = {}) => JSON.stringify({ source: 'InmarScope', type: 'egc', service: 'SafetyNET, NAVAREA/METAREA Warning/Forecast', priority: 'Urgency', msg_id: 4242, presentation: 0, time_utc: '09:58:01', downlink_mhz: 1537.7, text: texto, timestamp: 1795164000, ...extra });
  const a = leerEgc(linea('NAVAREA III 0456/26\nWESTERN MEDITERRANEAN.'))!;
  assert.equal(a.prioridad, 'Urgency');
  assert.equal(a.recibido, 1795164000_000);
  assert.equal(a.posicion, null);
  let lista = juntarEgc([], a);
  const b = leerEgc(linea('NAVAREA III 0456/26\nWESTERN MEDITERRANEAN.\nDERELICT CONTAINER IN 37-40N 000-30E.'))!;
  lista = juntarEgc(lista, b);
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0].posicion, { lat: 37.66667, lon: 0.5 });
  const e = eventoEgc(lista[0], 12 * 3600_000);
  assert.equal(e.gravedad, 'naranja');
  assert.equal(e.titulo, 'NAVAREA III 0456/26');
  assert.equal(e.detalle, 'EGC Urgencia');
  assert.equal(e.nombre, 'EGC4242');
  // Lo que no es EGC o no trae texto, fuera
  assert.equal(leerEgc(JSON.stringify({ source: 'InmarScope', type: 'les', text: 'x' })), null);
  assert.equal(leerEgc(linea('x', { priority: 'Terminal' })), null);
  assert.equal(leerEgc(linea('(presentation 7, 120 bytes)')), null);
  assert.equal(leerEgc('no es json'), null);
  // Formato compacto
  const c = leerEgc(JSON.stringify({ ut: '10:00:00', sv: 'SafetyNET, Shore-to-Ship Distress Alert to Circular Area', pr: 'Distress', f: 1537.7, tx: 'DISTRESS ALERT 36-10N 006-30W' }), T)!;
  assert.equal(eventoEgc(c, 3600_000).gravedad, 'rojo');
  assert.equal(c.recibido, T);
});

test('NAVTEX en red: mensajes de la API del receptor EA7JRS/Navtex', () => {
  const ahora = Date.parse('2026-11-22T08:00:00Z');
  // Respuesta real de GET /api/messages (recepción de Mondolfo Radio, cortada)
  const api = [
    { id: 5, bbbb: 'EE39', station: 'E', subject: 'E', number: 39, freq: 490, received: '2026-11-22T07:38:00Z', complete: false,
      message: 'ZCZC EE39\n062040 UTC NOV 21\nMONDOLFO RADIO\n\nPREVISIONI METEOROLOGICHE PER IL MEDITERRANEO\nBURRASCHE IN CORSO: - EST 7 SU TIRRENO MERIDIONALE' },
    { id: 6, bbbb: 'PA12', freq: 518, received: '2026-11-22T07:50:00Z', complete: true,
      message: 'ZCZC PA12\n220740 UTC NOV 26\nNAVIGATIONAL WARNING\nBUOY ADRIFT IN 36-45.5N 006-20.0W\nNNNN' },
    { id: 7, bbbb: 'mal', message: 'x' }, { id: 8, bbbb: 'QB01', message: 42 }, null,
    { id: 9, bbbb: 'SB03', freq: 518, received: '2031-01-01T00:00:00Z', complete: true, message: 'ZCZC SB03\nGALE WARNING NORTH FINISTERRE' },
  ];
  const r = mensajesDeReceptor(api, ahora);
  assert.equal(r.ultimoId, 9);
  assert.deepEqual(r.mensajes.map((m) => m.cabecera), ['EE39', 'PA12', 'SB03']);
  const [e, p, s] = r.mensajes;
  assert.equal(e.incompleto, true);
  assert.equal(e.freq, 490);
  assert.equal(e.recibido, Date.parse('2026-11-22T07:38:00Z'));
  assert.ok(e.texto.startsWith('062040 UTC NOV 21'), 'sin la línea ZCZC');
  assert.equal(e.dtg, '062040 UTC NOV 21');
  assert.equal(p.incompleto, false);
  assert.ok(!/NNNN/.test(p.texto), 'sin el NNNN');
  assert.ok(p.posicion && Math.abs(p.posicion.lat - 36.758) < 0.01 && Math.abs(p.posicion.lon + 6.333) < 0.01);
  assert.equal(eventoNavtex(p, 3600_000)?.gravedad, 'amarillo');
  // Una hora del receptor en el futuro no se cree
  assert.equal(s.recibido, ahora);
  assert.deepEqual(mensajesDeReceptor({ error: 'x' }, ahora), { mensajes: [], ultimoId: 0 });
});

test('NAVTEX en red: solo se admite la dirección del equipo', () => {
  assert.equal(urlReceptorValida('http://sdr.local:8080'), 'http://sdr.local:8080');
  assert.equal(urlReceptorValida(' http://10.116.117.108:8080/ '), 'http://10.116.117.108:8080');
  assert.equal(urlReceptorValida('https://navtex.example'), 'https://navtex.example');
  for (const mala of ['', 'sdr.local:8080', 'ftp://sdr.local', 'http://u:p@sdr.local', 'http://sdr.local/api/x', 'http://sdr.local/?a=1', 'file:///etc/passwd']) {
    assert.equal(urlReceptorValida(mala), null, mala);
  }
});
