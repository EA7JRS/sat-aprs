// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Cadena de avisos: fuente -> Evento -> reglas -> objeto y boletín APRS -> emisor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aprsPasscode, decideTransmission, parseTnc2, toIsPacket, toRfFrame } from '../server/aprs';
import { Evento } from '../server/core/evento';
import { Politica, RegistroAvisos, distanciaKm, evaluar } from '../server/core/reglas';
import { boletinAprs, nombreObjeto, objetoAprs } from '../server/core/aprsAvisos';
import { ColaEmision } from '../server/core/emisor';
import { descargarSismos, extraerSismosFdsnTexto, extraerSismosIgn, extraerSismosRss, normalizarSismo, sismoAEvento } from '../server/fuentes/sismos';

const SEVILLA = { lat: 37.3891, lon: -5.9845 };
const AHORA = Date.UTC(2026, 10, 9, 16, 0, 0);
const HORA = 3600_000;

const politica: Politica = {
  radioKm: 200,
  gravedadMinima: 'info',
  vigenciaMs: 6 * HORA,
  repetirCadaMs: 30 * 60_000,
  boletin: true,
  filtro: (e) => (e.datos?.magnitud ?? 0) >= 4,
};

function sismo(extra: Partial<Evento> = {}): Evento {
  return {
    id: 'sismo:es2026abc', tipo: 'sismo', gravedad: 'naranja', titulo: 'Salar, Granada',
    detalle: 'M4.2 Prof:8km', lat: 37.15, lon: -4.01, inicio: AHORA - 10 * 60_000,
    fuente: 'IGN', real: true, datos: { magnitud: 4.2 }, ...extra,
  };
}

test('reglas: radio alrededor de la estación, fija o móvil', () => {
  const d = evaluar(sismo(), politica, SEVILLA, AHORA);
  assert.equal(d.emitir, true);
  assert.ok(Math.abs(d.distanciaKm! - distanciaKm(SEVILLA, { lat: 37.15, lon: -4.01 })) < 0.01);
  assert.ok(d.distanciaKm! > 170 && d.distanciaKm! < 180);

  // La misma estación, ahora en Vigo (móvil): el sismo queda fuera de su radio
  const lejos = evaluar(sismo(), politica, { lat: 42.24, lon: -8.72 }, AHORA);
  assert.deepEqual([lejos.emitir, lejos.motivo], [false, 'fuera del radio de la estación']);
});

test('reglas: umbral, caducidad, gravedad y datos no reales', () => {
  assert.equal(evaluar(sismo({ datos: { magnitud: 2.1 } }), politica, SEVILLA, AHORA).motivo, 'no alcanza el umbral configurado');
  assert.equal(evaluar(sismo({ inicio: AHORA - 7 * HORA }), politica, SEVILLA, AHORA).motivo, 'aviso caducado');
  assert.equal(evaluar(sismo({ fin: AHORA + HORA, inicio: AHORA - 20 * HORA }), politica, SEVILLA, AHORA).emitir, true);
  assert.equal(evaluar(sismo({ real: false }), politica, SEVILLA, AHORA).motivo, 'dato simulado o incompleto');
  assert.equal(evaluar(sismo({ gravedad: 'amarillo' }), { ...politica, gravedadMinima: 'naranja' }, SEVILLA, AHORA).emitir, false);
  // Un aviso sin coordenadas (p. ej. clima espacial) no depende del radio
  assert.equal(evaluar(sismo({ lat: undefined, lon: undefined }), politica, SEVILLA, AHORA).emitir, true);
});

test('registro: no repite antes de tiempo y sobrevive a un reinicio', () => {
  const r = new RegistroAvisos();
  assert.equal(r.toca('a', AHORA, 30 * 60_000), true);
  r.anotar('a', AHORA);
  assert.equal(r.esNuevo('a'), false);
  assert.equal(r.toca('a', AHORA + 10 * 60_000, 30 * 60_000), false);
  assert.equal(r.toca('a', AHORA + 31 * 60_000, 30 * 60_000), true);

  const tras = new RegistroAvisos(JSON.parse(JSON.stringify(r)));
  assert.equal(tras.toca('a', AHORA + 10 * 60_000, 30 * 60_000), false);
  tras.purgar(AHORA + 8 * 24 * HORA, 7 * 24 * HORA);
  assert.equal(tras.esNuevo('a'), true);
});

test('objeto APRS del sismo: posición, símbolo de terremoto y datos', () => {
  const e = sismo({ inicio: Date.UTC(2026, 10, 9, 15, 30) });
  assert.equal(nombreObjeto(e), 'EQ091530 ');
  const p = parseTnc2(objetoAprs('ea7jrs-13', e)!)!;
  assert.equal(p.source, 'EA7JRS-13');
  assert.equal(p.info, ';EQ091530 *091530z3709.00N\\00400.60WQM4.2 Prof:8km Salar, Granada');
  assert.equal(objetoAprs('EA7JRS-13', sismo({ lat: undefined })), null);
  // Dos sismos distintos no comparten nombre de objeto
  assert.notEqual(nombreObjeto(e), nombreObjeto(sismo({ inicio: Date.UTC(2026, 10, 9, 15, 31) })));
});

test('boletín de emergencia: mensaje APRS válido, ASCII y de 67 caracteres como máximo', () => {
  const b = parseTnc2(boletinAprs('EA7JRS-13', sismo({ titulo: 'Sierra de Alhama de Granada, cerca de Ñíguelas y Dúrcal' }), 176.4))!;
  assert.match(b.info, /^:BLN2SISMO:EMERGENCIA SISMO M4\.2 Prof:8km Sierra de Alhama/);
  assert.ok(b.info.length - 11 <= 67);
  assert.ok([...b.info].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127));
  const leve = parseTnc2(boletinAprs('EA7JRS-13', sismo({ gravedad: 'amarillo', detalle: 'M3.1 Prof:5km' }), 40))!;
  assert.equal(leve.info, ':BLN3SISMO:SISMO M3.1 Prof:5km Salar, Granada a 40km (IGN)');
});

test('de extremo a extremo: el aviso sale por APRS-IS y por RF con la ruta correcta', () => {
  const ctx = { txEnabled: true, callsign: 'EA7JRS-13', passcode: String(aprsPasscode('EA7JRS')) };
  for (const trama of [objetoAprs('EA7JRS-13', sismo())!, boletinAprs('EA7JRS-13', sismo(), 176)]) {
    const d = decideTransmission(trama, ctx);
    assert.deepEqual([d.aprsIs, d.rf], [true, true]);
    assert.match(toIsPacket(d.packet!), /^EA7JRS-13>APZSAT,TCPIP\*:[;:]/);
    assert.equal(toRfFrame(d.packet!, 'WIDE1-1,WIDE2-1').includes('TCPIP'), false);
  }
});

test('fuente IGN: lectura del visor, del RSS y normalización', () => {
  const js = `var dias3 = {"type":"FeatureCollection","features":[
    {"type":"Feature","properties":{"evid":"es2026abc","fecha":"2026/11/09 15:30:00","mag":"4.2","prof":"8","loc":"Salar.GR"},"geometry":{"type":"Point","coordinates":[-4.01,37.15]}},
    {"type":"Feature","properties":{"evid":"es2026abc","fecha":"2026/11/09 15:30:00","mag":"4.2","loc":"Salar.GR"},"geometry":{"type":"Point","coordinates":[-4.01,37.15]}},
    {"type":"Feature","properties":{"evid":"es2026xyz","loc":"Sin datos"},"geometry":{"type":"Point","coordinates":[-3.5,36.9]}}]};
    var roto = {esto no es json};`;
  const features = extraerSismosIgn(js);
  assert.equal(features.length, 2); // el duplicado se descarta y la variable rota se ignora

  const completo = normalizarSismo(features[0], 'IGN')!;
  assert.deepEqual([completo.id, completo.time, completo.magnitud, completo.depthKm, completo.datosCompletos],
    ['es2026abc', '2026-11-09T15:30:00.000Z', 4.2, 8, true]);
  const evento = sismoAEvento(completo);
  assert.deepEqual([evento.id, evento.gravedad, evento.real, evento.detalle], ['sismo:es2026abc', 'naranja', true, 'M4.2 Prof:8km']);

  // Sin magnitud ni hora se puede mostrar, pero nunca se anuncia por radio
  const incompleto = normalizarSismo(features[1], 'IGN')!;
  assert.equal(incompleto.datosCompletos, false);
  assert.equal(sismoAEvento(incompleto).real, false);
  assert.equal(normalizarSismo({ geometry: { coordinates: [] } }, 'IGN'), null);

  const rss = extraerSismosRss(`<rss><item><title>3.4 - NE Lorca.MU</title><geo:lat>37.70</geo:lat><geo:long>-1.65</geo:long>
    <link>http://ign/es1</link><pubDate>Mon, 09 Nov 2026 12:00:00 GMT</pubDate></item></rss>`);
  const delRss = normalizarSismo(rss[0], 'IGN-RSS')!;
  assert.deepEqual([delRss.magnitud, delRss.localizacion, delRss.time, delRss.datosCompletos], [3.4, 'NE Lorca.MU', '2026-11-09T12:00:00.000Z', true]);
});

test('fuente de sismos: si el IGN falla se usa el respaldo, y sin red no se inventa nada', async () => {
  const original = globalThis.fetch;
  const avisos: string[] = [];
  try {
    globalThis.fetch = (async (url: any) => {
      if (String(url).includes('usgs')) {
        return new Response(JSON.stringify({ features: [{ id: 'us1', properties: { mag: 4.6, place: '12 km NE of Granada, Spain', time: AHORA }, geometry: { coordinates: [-3.6, 37.2, 10] } }] }));
      }
      throw new Error('sin red');
    }) as typeof fetch;
    const sismos = await descargarSismos((origen, _t, ok) => avisos.push(`${origen}:${ok}`));
    assert.deepEqual(sismos.map((s) => [s.id, s.fuente, s.localizacion, s.magnitud]), [['us1', 'USGS', 'Granada, Spain', 4.6]]);
    assert.deepEqual(avisos, ['IGN:false', 'IGN-RSS:false', 'USGS:true']);

    globalThis.fetch = (async () => { throw new Error('sin red'); }) as typeof fetch;
    assert.deepEqual(await descargarSismos(), []);
  } finally {
    globalThis.fetch = original;
  }
});

test('emisor: una transmisión cada vez, con pausa, y las urgentes primero', async () => {
  const cola = new ColaEmision(30);
  const orden: string[] = [];
  const marcas: number[] = [];
  const envio = (nombre: string) => async () => { orden.push(nombre); marcas.push(Date.now()); };
  cola.encolar(envio('a'));
  cola.encolar(envio('b'));
  cola.encolar(envio('c'));
  cola.encolar(async () => { throw new Error('fallo de red'); });
  cola.encolar(envio('URGENTE'), true);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(orden, ['a', 'URGENTE', 'b', 'c']); // «a» ya estaba en el aire; un fallo no detiene la cola
  for (let i = 1; i < marcas.length; i++) assert.ok(marcas[i] - marcas[i - 1] >= 25);
  assert.equal(cola.pendientes, 0);
});

test('sismos de ShakeNet: formato texto de FDSN (muestra escrita según la norma)', () => {
  const f = extraerSismosFdsnTexto(
    '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType\n' +
      'rs2026wabc|2026-11-04T16:14:52.100|36.04|-5.47|12.0|RaspberryShake||RaspberryShake|rs2026wabc|ML|4.4|RaspberryShake|Strait of Gibraltar|earthquake\n' +
      'rs2026wabd|2026-11-04T10:00:00|37.1|-3.9|1|RaspberryShake||||ML|2.1||Granada quarry|quarry blast\r\n',
  );
  assert.equal(f.length, 1);
  const s = normalizarSismo(f[0], 'ShakeNet')!;
  assert.equal(s.id, 'rs2026wabc');
  assert.equal(s.time, '2026-11-04T16:14:52.100Z');
  assert.deepEqual([s.latitude, s.longitude, s.depthKm, s.magnitud, s.magType], [36.04, -5.47, 12, 4.4, 'ML']);
  assert.equal(s.localizacion, 'Strait of Gibraltar');
  assert.equal(s.datosCompletos, true);
  assert.equal(sismoAEvento(s).fuente, 'ShakeNet');
  // sin cabecera, el orden de la norma
  assert.equal(extraerSismosFdsnTexto('rs1|2026-11-04T16:14:52|36.0|-5.5|10|||||ML|3.9||Gibraltar|earthquake').length, 1);
  assert.equal(extraerSismosFdsnTexto('<html>error</html>').length, 0);
});
