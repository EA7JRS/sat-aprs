// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { RegistroTramas, analizarTrama, tipoTrama } from '../server/radio/tramas';

const SEVILLA = { lat: 37.3891, lon: -5.9845 };

test('tipoTrama: clasifica por el campo de información', () => {
  assert.equal(tipoTrama('EA7XXX-9', 'APRS', '!3723.00N/00559.00W>Hola'), 'posicion');
  assert.equal(tipoTrama('EA7XXX-13', 'APRS', '@092345z3723.00N/00559.00W_090/005g010t068'), 'meteo');
  assert.equal(tipoTrama('EA7XXX', 'APRS', '_10090556c220s004g005t077'), 'meteo');
  assert.equal(tipoTrama('EA7XXX', 'APRS', ':EA7YYY-9 :Hola{12'), 'mensaje');
  assert.equal(tipoTrama('EA7XXX', 'APRS', ':EA7YYY-9 :ack12'), 'acuse');
  assert.equal(tipoTrama('EA7XXX', 'APRS', ':BLN1     :Aviso'), 'boletin');
  assert.equal(tipoTrama('EA7XXX', 'APRS', ':EA7XXX   :PARM.Bat'), 'telemetria');
  assert.equal(tipoTrama('EA7XXX', 'APRS', 'T#005,199,000,255,073,123,01101001'), 'telemetria');
  assert.equal(tipoTrama('EA7XXX', 'APRS', '>En QRV'), 'estado');
  assert.equal(tipoTrama('EA7XXX', 'APRS', ';EQ131901 *131901z3709.00N\\00400.60WQM4.5'), 'objeto');
  assert.equal(tipoTrama('EA7XXX', 'APRS', ')PUESTO1!3723.00N/00559.00W-'), 'item');
  assert.equal(tipoTrama('EA7XXX', 'APRS', '?APRS?'), 'consulta');
  assert.equal(tipoTrama('EA7XXX', 'APRS', '}EA7YYY>APRS,TCPIP,EA7XXX*:>hola'), 'terceros');
  assert.equal(tipoTrama('EA7XXX-9', 'S32U6T', "`(_fn\"Oj/]"), 'mice');
  assert.equal(tipoTrama('EA7XXX', 'APRS', 'xyz'), 'otro');
});

test('RegistroTramas: guarda en orden, recorta y resume la última hora', () => {
  const r = new RegistroTramas(3);
  const ahora = 1_000_000_000;
  r.anotar('RF', 'EA7AAA', 'APRS', 'WIDE1-1', '>uno', { cuando: ahora - 7200_000 });
  r.anotar('IS', 'EA7BBB', 'APRS', 'TCPIP*,qAC,T2SPAIN', '>dos', { cuando: ahora - 60_000 });
  r.anotar('TX', 'EA7JRS', 'APZSAT', 'WIDE1-1,WIDE2-1', ':BLN1     :hola', { cuando: ahora, noEmitida: 'emisión desactivada' });
  r.anotar('RF', 'EA7CCC', 'APRS', '', '!3723.00N/00559.00W-', { cuando: ahora });
  assert.equal(r.tramas.length, 3);
  assert.deepEqual(r.tramas.map((t) => t.n), [4, 3, 2]);
  assert.equal(r.tramas[1].noEmitida, 'emisión desactivada');
  assert.equal(r.tramas[0].noEmitida, undefined);
  const s = r.resumen(ahora);
  assert.deepEqual(s.porVia, { RF: 1, IS: 1, TX: 1 });
  assert.equal(s.estaciones, 2);
  assert.equal(s.porTipo.boletin, 1);
});

test('analizarTrama: posición con PHG, rumbo y distancia', () => {
  const a = analizarTrama('EA7XXX-9>APRS,EA7RCC-10*,WIDE2-1:!3723.00N/00559.00W>090/036PHG5132/A=000328 Movil', SEVILLA);
  assert.equal(a.ok, true);
  assert.equal(a.tipo, 'posicion');
  assert.deepEqual(a.avisos, []);
  const campo = (n: string) => a.campos.find((c) => c.nombre === n)?.valor;
  assert.equal(campo('Llegó por'), 'radio, por EA7RCC-10');
  assert.equal(campo('Rumbo y velocidad'), '90° · 67 km/h');
  assert.equal(campo('Altitud'), '100 m');
  assert.match(campo('PHG')!, /^25 W · 6 m sobre el terreno · 3 dB · hacia 90°$/);
  assert.ok(a.posicion && a.posicion.distanciaKm! < 2);
});

test('analizarTrama: mensaje, acuse y errores', () => {
  const m = analizarTrama('EA7XXX>APRS,TCPIP*,qAC,T2SPAIN::EA7YYY-9 :Hola que tal{7', null);
  assert.equal(m.tipo, 'mensaje');
  assert.equal(m.campos.find((c) => c.nombre === 'Número')?.valor, '7');
  assert.equal(m.campos.find((c) => c.nombre === 'Llegó por')?.valor, 'APRS-IS (qAC)');
  const ack = analizarTrama('EA7YYY-9>APRS::EA7XXX   :ack7', null);
  assert.equal(ack.tipo, 'acuse');
  assert.equal(ack.campos.find((c) => c.nombre === 'Acusa recibo del mensaje')?.valor, '7');

  assert.equal(analizarTrama('', null).ok, false);
  assert.match(analizarTrama('esto no es una trama', null).error!, /TNC2/);
  const mala = analizarTrama('EA7XXXXXX-22>APRS,WIDE1-1,MAL_RUTA:>hola', null);
  assert.equal(mala.ok, true);
  assert.equal(mala.avisos.length, 2);
  assert.match(analizarTrama('EA7XXX>APRS:xyz', null).avisos[0], /No se reconoce/);
});

test('analizarTrama: telemetría y terceros', () => {
  const t = analizarTrama('EA7XXX>APRS:T#005,199,000,255,073,123,01101001', null);
  assert.equal(t.campos.find((c) => c.nombre === 'Valores analógicos')?.valor, '199 · 000 · 255 · 073 · 123');
  assert.equal(t.campos.find((c) => c.nombre === 'Bits')?.valor, '01101001');
  const g = analizarTrama('EA7XXX>APRS:}EA7YYY>APRS,TCPIP,EA7XXX*:>hola', null);
  assert.equal(g.tipo, 'terceros');
  assert.equal(g.campos.find((c) => c.nombre === 'Trama interior')?.valor, 'EA7YYY>APRS,TCPIP,EA7XXX*:>hola');
});
