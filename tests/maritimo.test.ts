// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { ajusteReceptorValido, claveNavtex, emitiendoAhora, estacionesDeReceptor, estacionesPorDistancia, eventoNavtex, mensajesDeReceptor, posicionParaReceptor, proximaEmision, urlReceptorValida, exportarNavtex, trozosNavtexN2k } from '../server/radio/navtex';
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

// Mensajes como los da la API del receptor Navtex (uno por cabecera)
const delReceptor = (textos: string[], cuando = T) => mensajesDeReceptor(textos.map((message, i) => ({ id: i + 1, bbbb: message.slice(5, 9), freq: 518, received: new Date(cuando).toISOString(), complete: true, message })), cuando).mensajes;

test('NAVTEX: aviso con la gravedad del tema y la misma clave al repetirse', () => {
  const r = { mensajes: delReceptor(['ZCZC GD05\nSAR. MAYDAY RELAY. FISHING VESSEL SINKING IN 36-05.2N 005-21.0W.\nNNNN', 'ZCZC GE40\n201000 UTC NOV 26\nFORECAST FOR STRAIT.\nNNNN']) };
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
  const otraVez = delReceptor(['ZCZC GD05\nSAR. MAYDAY RELAY. FISHING VESSEL SINKING IN 36-05.2N 005-21.0W.\nNNNN'], T + 4 * 3600_000)[0];
  assert.equal(claveNavtex(otraVez), claveNavtex(r.mensajes[0]));
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
  assert.deepEqual(mensajesDeReceptor({ error: 'x' }, ahora), { mensajes: [], ultimoId: 0, ultimoOido: 0 });
  // Onda corta: 4209 es 4209,5 kHz; otra frecuencia no se cree
  const hf = mensajesDeReceptor([{ id: 1, bbbb: 'EE39', freq: 4209, complete: true, message: 'ZCZC EE39\nWEATHER FORECAST FOR THE AREA' }, { id: 2, bbbb: 'EE40', freq: 7000, complete: true, message: 'ZCZC EE40\nWEATHER FORECAST FOR THE AREA' }], ahora);
  assert.deepEqual(hf.mensajes.map((m) => m.freq), [4209, null]);
});

test('NAVTEX en red: solo se admite la dirección del equipo', () => {
  assert.equal(urlReceptorValida('http://sdr.local:8080'), 'http://sdr.local:8080');
  assert.equal(urlReceptorValida(' http://10.116.117.108:8080/ '), 'http://10.116.117.108:8080');
  assert.equal(urlReceptorValida('https://navtex.example'), 'https://navtex.example');
  for (const mala of ['', 'sdr.local:8080', 'ftp://sdr.local', 'http://u:p@sdr.local', 'http://sdr.local/api/x', 'http://sdr.local/?a=1', 'file:///etc/passwd']) {
    assert.equal(urlReceptorValida(mala), null, mala);
  }
});

test('NAVTEX: tabla de estaciones del receptor, por distancia y con su próxima emisión', () => {
  // Filas de la Tabla 4 de la UIT (Oostende, Tarifa y Cabo La Nao) y otras que no encajan, para ver que se descartan
  const t = estacionesDeReceptor({
    fuentes: [{ nombre: 'UIT', titulo: 'Tabla 4', fecha: '2017-05-31', url: 'https://www.itu.int/x.pdf' }, { nombre: 'x', titulo: 'y', fecha: '', url: 'javascript:alert(1)' }],
    estaciones: [
      { area: 'I', pais: 'Belgium', nombre: 'Oostende Radio', lat: 51.1825, lon: 2.8078, khz: 518, letra: 'T', horas: ['0310', '0710', '1110', '1510', '1910', '2310'], alcance: 55, idioma: 'English', estado: 'activa', fuente: 'UIT' },
      { area: 'II', pais: 'Spain', nombre: 'Tarifa', lat: 36.0422, lon: -5.5563, khz: 518, letra: 'G', horas: ['0100', '0500', '0900', '1300', '1700', '2100'], alcance: 300, idioma: 'English', estado: 'activa', fuente: 'UIT' },
      { area: 'III', pais: 'Spain', nombre: 'Cabo La Nao', lat: 38.7178, lon: 0.1758, khz: 518, letra: 'X', horas: ['0350', '0750', '1150', '1550', '1950', '2350'], alcance: 220, idioma: 'English', estado: 'activa', fuente: 'UIT' },
      { area: 'I', pais: 'Nowhere', nombre: 'Sin posición', lat: null, lon: null, khz: 490, letra: 'Q', horas: ['2500', '0010'], alcance: null, estado: 'prevista' },
      { nombre: 'Frecuencia rara', khz: 500, letra: 'A' }, { nombre: 'Letra rara', khz: 518, letra: 'AB' },
    ],
  });
  assert.equal(t.estaciones.length, 4);
  assert.equal(t.fuentes[1].url, '');
  assert.deepEqual(t.estaciones[3].horas, ['0010']);
  const cadiz = { lat: 36.53, lon: -6.29 };
  const v = estacionesPorDistancia(t.estaciones, cadiz, T);   // 10:00 UTC
  assert.deepEqual(v.map((e) => e.nombre), ['Tarifa', 'Cabo La Nao', 'Oostende Radio', 'Sin posición']);
  assert.ok(v[0].mn! > 40 && v[0].mn! < 50, `Tarifa a ${v[0].mn} millas`);
  assert.equal(v[0].enAlcance, true);
  assert.equal(v[2].enAlcance, false);
  assert.equal(v[3].km, null);
  assert.equal(new Date(v[0].proxima!).toISOString(), '2026-11-20T13:00:00.000Z');
  assert.equal(new Date(v[1].proxima!).toISOString(), '2026-11-20T11:50:00.000Z');
  // Sin posición de la consola: sin distancias, y nadie «en alcance»
  assert.ok(estacionesPorDistancia(t.estaciones, null, T).every((e) => e.km === null && !e.enAlcance));
  // El turno dura diez minutos; el de las 23:50 pasa al día siguiente
  assert.equal(emitiendoAhora(['0900'], Date.parse('2026-11-20T09:05:00Z')), true);
  assert.equal(emitiendoAhora(['0900'], Date.parse('2026-11-20T09:10:30Z')), false);
  assert.equal(new Date(proximaEmision(['2350', '0350'], Date.parse('2026-11-20T23:55:00Z'))!).toISOString(), '2026-11-21T03:50:00.000Z');
  assert.equal(proximaEmision([], T), null);
});

test('NAVTEX: ajustes del receptor que la consola acepta mandar', () => {
  for (const [k, val] of [['rx1.enabled', '1'], ['rx2.source', 'rtlsdr'], ['rx1.band', 'auto'], ['rx1.hf_slots', '0200,0600'], ['rx1.hf_slots', ''], ['rx2.port', 'B'], ['rx2.serial', ''], ['rx2.direct', 'auto'], ['rx2.upconv', '125000000'], ['rx2.gain', '28.0'], ['rx2.gain', 'auto'], ['rx2.ppm', '-12']]) {
    assert.equal(ajusteReceptorValido(k, val), true, `${k}=${val}`);
  }
  for (const [k, val] of [['rx3.enabled', '1'], ['position', '36.5,-6.2'], ['position_source', 'manual'], ['rx1.band', 'vhf'], ['rx1.hf_slots', '2400'], ['rx1.hf_slots', '0200,'], ['rx1.serial', '../x'], ['rx1.gain', '1e3'], ['rx1.ppm', '--1'], ['rx1.enabled/../x', '1'], ['rx1.port', 'D']]) {
    assert.equal(ajusteReceptorValido(k, val), false, `${k}=${val}`);
  }
  assert.equal(posicionParaReceptor(36.53, -6.29), '36.53000,-6.29000');
});

test('NAVTEX: repeticiones (heard), calidad, exportación y trozos para NMEA 2000', () => {
  // Mensajes escritos para la prueba, con la forma de la API de Navtex 1.2
  const api = [
    { id: 7, bbbb: 'GA12', freq: 518, received: '2026-11-20T05:08:00Z', heard: Date.parse('2026-11-20T09:08:00Z') / 1000, complete: true, characters: 60, errors: 0, satisfactory: true, in_slot: true, message: 'ZCZC GA12\nLIGHT UNLIT IN 36-05.2N 005-21.0W.\nNNNN' },
    { id: 8, bbbb: 'GB20', freq: 490, received: '2026-11-20T09:40:00Z', heard: Date.parse('2026-11-20T09:40:00Z') / 1000, complete: true, characters: 40, errors: 6, satisfactory: false, in_slot: false, message: 'ZCZC GB20\n=GA*E "W*RN*NG", T**T.\nNNNN' },
  ];
  const r = mensajesDeReceptor(api, T);
  assert.equal(r.ultimoId, 8);
  assert.equal(r.ultimoOido, Date.parse('2026-11-20T09:40:00Z') / 1000);
  // Vale la última vez que se oyó, no la primera: el aviso sigue vigente mientras la estación lo repita
  assert.equal(new Date(r.mensajes[0].recibido).toISOString(), '2026-11-20T09:08:00.000Z');
  assert.deepEqual([r.mensajes[0].idReceptor, r.mensajes[0].satisfactorio, r.mensajes[0].enTurno, r.mensajes[1].errores, r.mensajes[1].satisfactorio, r.mensajes[1].enTurno], [7, true, true, 6, false, false]);
  // Un receptor anterior no trae esos campos
  const viejo = mensajesDeReceptor([{ id: 1, bbbb: 'GA12', freq: 518, received: '2026-11-20T05:08:00Z', complete: true, message: 'ZCZC GA12\nLIGHT UNLIT. PRUEBA.\nNNNN' }], T);
  assert.deepEqual([viejo.ultimoOido, viejo.mensajes[0].errores, viejo.mensajes[0].satisfactorio], [0, null, null]);
  assert.equal(new Date(viejo.mensajes[0].recibido).toISOString(), '2026-11-20T05:08:00.000Z');

  const csv = exportarNavtex(r.mensajes, true).split('\r\n');
  assert.equal(csv[0], 'cabecera,khz,recibido_utc,completo,caracteres_mal,tema,lat,lon,texto');
  assert.equal(csv[1], '"GA12","518","2026-11-20 09:08",1,0,"Aviso a los navegantes",36.08667,-5.35,"LIGHT UNLIT IN 36-05.2N 005-21.0W."');
  // Comillas dobladas, y nada que una hoja de cálculo tome por fórmula
  assert.ok(csv[2].endsWith(',"\'=GA*E ""W*RN*NG"", T**T."'), csv[2]);
  const txt = exportarNavtex(r.mensajes, false);
  assert.ok(txt.startsWith('==== GA12  518 kHz  recibido 2026-11-20 09:08 UTC ====\r\nZCZC GA12\r\nLIGHT UNLIT'));
  assert.ok(txt.includes('==== GB20  490 kHz  recibido 2026-11-20 09:40 UTC  6 caracteres mal ===='));

  const largo = { cabecera: 'GE40', texto: Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ') + '\nÚltima línea con ñ.' };
  const t = trozosNavtexN2k(largo);
  assert.ok(t.length > 5 && t.every((x) => x.length <= 110 && /^[ -_]+$/.test(x)), 'trozos cortos y solo con caracteres del AIS');
  assert.ok(t[0].startsWith(`NAVTEX GE40 1/${t.length} PALABRA0 PALABRA1`));
  assert.ok(t[t.length - 1].endsWith('?LTIMA L?NEA CON ?.'));
  // Todo el texto, en orden y sin partir palabras
  assert.equal(t.map((x) => x.replace(/^NAVTEX GE40 \d+\/\d+ /, '')).join(' '), largo.texto.toUpperCase().replace(/\s+/g, ' ').replace(/[^ -_]/g, '?'));
  assert.deepEqual(trozosNavtexN2k({ cabecera: 'GA12', texto: 'LIGHT UNLIT.' }), ['NAVTEX GA12 1/1 LIGHT UNLIT.']);
  assert.equal(trozosNavtexN2k({ cabecera: 'GA12', texto: 'A '.repeat(4000) }).length, 30);
  assert.ok(ajusteReceptorValido('retention_hours', '168') && ajusteReceptorValido('nrx.udp', '192.168.1.255:10110') && ajusteReceptorValido('nrx.udp', '') && ajusteReceptorValido('nrx.tcp', '0'));
  assert.ok(!ajusteReceptorValido('retention_hours', '24') && !ajusteReceptorValido('nrx.udp', 'equipo') && !ajusteReceptorValido('nrx.udp', 'a:0') && !ajusteReceptorValido('nrx.tcp', '80'));
});
