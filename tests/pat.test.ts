// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientePat, destinatarioValido, destinoValido, leerDestinatarios, leerMensajePat, leerRms } from '../server/radio/pat';

const MSG = {
  MID: 'ABC123DEF456', Date: '2026-11-14T10:00:00Z', From: { Proto: '', Addr: 'EA7XXX' },
  To: [{ Proto: '', Addr: 'EA7JRS' }], Cc: null, Subject: 'Prueba', Files: [{ Name: 'a.txt', Size: 12 }], P2POnly: false, Unread: true,
};

test('leerMensajePat: direcciones, adjuntos y fecha', () => {
  const m = leerMensajePat(MSG)!;
  assert.equal(m.de, 'EA7XXX');
  assert.deepEqual(m.para, ['EA7JRS']);
  assert.deepEqual(m.cc, []);
  assert.deepEqual(m.adjuntos, [{ nombre: 'a.txt', bytes: 12 }]);
  assert.equal(m.sinLeer, true);
  assert.equal(m.fecha, '2026-11-14T10:00:00.000Z');
  assert.equal(m.cuerpo, undefined);
  assert.equal(leerMensajePat({ ...MSG, Date: '0001-01-01T00:00:00Z' })!.fecha, null);
  assert.equal(leerMensajePat({ Subject: 'sin MID' }), null);
});

test('leerRms: frecuencia, distancia y predicción', () => {
  const r = leerRms({ callsign: 'EA7URM-10', gridsquare: 'IM77', distance: 12.5, azimuth: 80, modes: 'Packet 1200', freq: { hz: 144800000, khz: 144800, desc: '144.800 MHz' }, url: 'ax25:///EA7URM-10', prediction: { link_quality: 70 } })!;
  assert.equal(r.khz, 144800);
  assert.equal(r.km, 12.5);
  assert.equal(r.calidad, 70);
  assert.equal(leerRms({ callsign: 'X', url: null }), null);
  assert.equal(leerRms({ callsign: 'X', url: 'telnet://', distance: null, freq: { hz: 0 } })!.km, null);
});

test('destinatarios y destinos', () => {
  assert.deepEqual(leerDestinatarios('EA7XXX, ea1aaa-5; alguien@ejemplo.org'), ['EA7XXX', 'ea1aaa-5', 'alguien@ejemplo.org']);
  assert.ok(destinatarioValido('EA7XXX'));
  assert.ok(destinatarioValido('alguien@ejemplo.org'));
  assert.ok(!destinatarioValido('EA7 XXX'));
  assert.ok(!destinatarioValido('<script>'));
  assert.ok(destinoValido('telnet'));
  assert.ok(destinoValido('ax25:///EA7URM-10'));
  assert.ok(destinoValido('ardop:///EA5XXX?freq=7101'));
  assert.ok(!destinoValido('rm -rf /'));
});

function falsoPat() {
  const peticiones: { url: string; init?: RequestInit }[] = [];
  const buzones: Record<string, any[]> = { in: [MSG], out: [], sent: [] };
  let terminarSesion: (r: Response) => void = () => {};
  const buscar = async (url: string, init?: RequestInit): Promise<Response> => {
    peticiones.push({ url, init });
    const u = new URL(url);
    const j = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/api/status') return j({ active_listeners: ['ax25'], connected: false, dialing: false, remote_addr: '', http_clients: [] });
    if (u.pathname === '/api/config') return j({ mycall: 'EA7JRS', locator: 'IM77', connect_aliases: { telnet: 'telnet://{mycall}:CMSTelnet@cms.winlink.org:8772/wl2k', local: 'ax25:///EA7URM-10' } });
    const m = u.pathname.match(/^\/api\/mailbox\/(in|out|sent)$/);
    if (m && (!init?.method || init.method === 'GET')) return j(buzones[m[1]]);
    if (u.pathname === '/api/mailbox/out' && init?.method === 'POST') {
      const f = new URLSearchParams(String(init.body));
      if (!f.get('date')) return new Response('Missing date value', { status: 400 });
      buzones.out.push({ MID: 'NUEVO1', Date: f.get('date'), From: { Addr: 'EA7JRS' }, To: f.get('to')!.split(',').map((Addr) => ({ Addr })), Subject: f.get('subject'), Files: [], Unread: false });
      return new Response('Message posted', { status: 200 });
    }
    if (u.pathname === `/api/mailbox/in/${MSG.MID}`) return j({ ...MSG, Body: 'Hola\r\n' });
    if (u.pathname === `/api/mailbox/in/${MSG.MID}/read`) return j('OK');
    if (u.pathname === '/api/connect') return new Promise<Response>((r) => { terminarSesion = r; });
    if (u.pathname === '/api/disconnect') return j({});
    if (u.pathname === '/api/rmslist') return j([{ callsign: 'EA7URM-10', url: 'ax25:///EA7URM-10', distance: 3, freq: { hz: 144800000 } }]);
    return new Response('404 page not found', { status: 404 });
  };
  return { buscar, peticiones, buzones, terminar: (r: Response) => terminarSesion(r) };
}

test('ClientePat: sondeo, lectura, envío y sesión', async () => {
  const f = falsoPat();
  const c = new ClientePat(() => 'http://pat.local:8080/', f.buscar);
  await c.sondear();
  assert.equal(c.estado.alcanzable, true);
  assert.equal(c.estado.indicativo, 'EA7JRS');
  assert.deepEqual(c.estado.alias.map((a) => a.nombre), ['local', 'telnet']);
  assert.deepEqual(c.estado.escuchas, ['ax25']);
  assert.equal(c.estado.buzones.in.length, 1);

  const m = await c.mensaje('in', MSG.MID);
  assert.equal(m.cuerpo, 'Hola\r\n');
  await c.marcarLeido('in', MSG.MID);
  assert.equal(c.estado.buzones.in[0].sinLeer, false);
  const leido = f.peticiones.find((p) => p.url.endsWith('/read'))!;
  assert.equal(leido.init?.body, '{"Read":true}');
  await assert.rejects(c.mensaje('in', '../../etc'), /no válido/);

  await assert.rejects(c.enviar({ para: '', asunto: 'x', cuerpo: '' }), /destinatario/);
  await assert.rejects(c.enviar({ para: 'EA7 XX!', asunto: 'x', cuerpo: '' }), /no válido/);
  await c.enviar({ para: 'EA7XXX', asunto: 'Parte', cuerpo: 'línea 1\nlínea 2' });
  const envio = f.peticiones.find((p) => p.init?.method === 'POST' && p.url.endsWith('/api/mailbox/out'))!;
  const campos = new URLSearchParams(String(envio.init!.body));
  assert.equal(campos.get('body'), 'línea 1\r\nlínea 2');
  assert.equal(campos.get('to'), 'EA7XXX');
  assert.equal(c.estado.buzones.out.length, 1);

  let terminada = false;
  const s = c.conectar('local', () => { terminada = true; });
  assert.equal(s.fin, null);
  assert.throws(() => c.conectar('local'), /en curso/);
  assert.ok(f.peticiones.some((p) => p.url.endsWith('/api/connect?url=local')));
  f.terminar(new Response('{"NumReceived":2}\n', { status: 200 }));
  for (let i = 0; i < 20 && !terminada; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(terminada, true);
  assert.equal(s.recibidos, 2);
  assert.equal(s.error, null);

  const s2 = c.conectar('telnet');
  f.terminar(new Response('Session failure\n{"NumReceived":0}\n', { status: 500 }));
  for (let i = 0; i < 20 && s2.fin === null; i++) await new Promise((r) => setTimeout(r, 5));
  assert.match(s2.error!, /falló/);

  const rms = await c.rms('packet', '2m');
  assert.equal(rms[0].indicativo, 'EA7URM-10');
  assert.ok(f.peticiones.some((p) => p.url.includes('/api/rmslist?mode=packet&band=2m')));
});

test('ClientePat: sin Pat se dice, sin inventar buzón', async () => {
  const c = new ClientePat(() => 'http://127.0.0.1:9', async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); });
  await c.sondear();
  assert.equal(c.estado.alcanzable, false);
  assert.match(c.estado.error!, /no contesta/);
  assert.equal(c.estado.buzones.in.length, 0);
});
