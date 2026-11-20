// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Historial, aCsv } from '../server/sistema/historial';
import { Mensajeria } from '../server/radio/mensajes';
import { RegistroTramas } from '../server/radio/tramas';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sat-hist-')), 'h.db');

test('historial: tramas y registro sobreviven a cerrar y abrir', () => {
  const ruta = tmp();
  const h = new Historial(ruta);
  assert.equal(h.disponible, true, h.error ?? '');
  const r = new RegistroTramas(10);
  r.alAnotar = (t) => h.guardarTrama(t);
  r.anotar('RF', 'EA7AAA-9', 'APRS', 'WIDE1-1', '!3723.00N/00559.00W>hola', { cuando: 1000 });
  r.anotar('TX', 'EA7JRS-13', 'APZSAT', 'WIDE1-1,WIDE2-1', ':BLN1     :prueba', { cuando: 2000, noEmitida: 'emisión desactivada' });
  r.anotar('IS', 'EA7BBB', 'APRS', 'TCPIP*,qAC', '>estado', { cuando: 3000 });
  h.guardarRegistro('log_1', 4000, 'SYS', { source: 'X', payload: 'p', remarks: 'r', success: true });
  h.guardarEstado('mensajeria', { contador: 7 });
  h.cerrar();

  const h2 = new Historial(ruta);
  const t = h2.tramas(10);
  assert.deepEqual(t.map((x) => x.origen), ['EA7BBB', 'EA7JRS-13', 'EA7AAA-9']);
  assert.equal(t[1].noEmitida, 'emisión desactivada');
  assert.equal(t[0].noEmitida, undefined);
  assert.equal(t[2].tipo, 'posicion');
  assert.deepEqual(h2.tramas(10, { q: 'ea7aaa'.toUpperCase() }).map((x) => x.origen), ['EA7AAA-9']);
  assert.deepEqual(h2.tramas(10, { via: 'TX' }).map((x) => x.origen), ['EA7JRS-13']);
  assert.deepEqual(h2.tramas(10, { desde: 2500 }).map((x) => x.origen), ['EA7BBB']);
  assert.equal(h2.registro(10)[0].id, 'log_1');
  assert.deepEqual(h2.leerEstado('mensajeria'), { contador: 7 });
  const r2 = new RegistroTramas(10);
  r2.cargar(t as never);
  assert.equal(r2.anotar('RF', 'EA7CCC', 'APRS', '', '>x').n, 4);
  const s = h2.resumen();
  assert.equal(s.tramas, 3);
  assert.equal(s.registro, 1);
  assert.equal(s.desdeTramas, 1000);
  assert.equal(h2.purgar({ diasTramas: 1, diasRegistro: 1 }, 86_400_000 + 2500), 2);
  assert.equal(h2.tramas(10).length, 1);
  h2.cerrar();
});

test('historial: sin archivo queda en memoria y lo dice', () => {
  const h = new Historial(null);
  assert.equal(h.disponible, false);
  assert.deepEqual(h.tramas(), []);
  h.guardarTrama({ cuando: 1, via: 'RF', origen: 'A', destino: 'B', ruta: '', info: '', tipo: 'otro' });
  assert.equal(h.leerEstado('x'), null);
  const mala = new Historial('/no/existe/carpeta/h.db');
  assert.equal(mala.disponible, false);
  assert.ok(mala.error);
});

test('mensajería: se exporta y se restaura; lo pendiente queda sin acuse', () => {
  const m = new Mensajeria(() => 'EA7JRS-13');
  const r = m.redactar('EA7AAA-9', 'hola', 1000);
  assert.ok(r.ok);
  m.recibir('EA7BBB-7', ':EA7JRS-13:que tal{5', 'RF', 2000);
  const m2 = new Mensajeria(() => 'EA7JRS-13');
  m2.restaurar(JSON.parse(JSON.stringify(m.exportar())));
  assert.equal(m2.enviados[0].estado, 'sin-acuse');
  assert.equal(m2.recibidos[0].de, 'EA7BBB-7');
  assert.equal(m2.sinLeer, 1);
  const otro = m2.redactar('EA7AAA-9', 'otra', 3000);
  assert.ok(otro.ok && otro.mensaje.id === '2');   // el número sigue, no se repite
  m2.restaurar(null);
  assert.equal(m2.enviados.length, 2);
});

test('aCsv: comillas, comas y saltos', () => {
  assert.equal(aCsv(['a', 'b'], [{ a: 'x,y', b: 'di "hola"' }, { a: null, b: 3 }]), 'a,b\r\n"x,y","di ""hola"""\r\n,3\r\n');
});
