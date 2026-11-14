// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Pruebas de las primitivas APRS y de la política de emisión de la consola.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aprsPasscode,
  decideTransmission,
  encodeAx25Ui,
  isValidCallsign,
  kissEncode,
  latToAprs,
  lonToAprs,
  normalizeInfo,
  parseTnc2,
  passcodeMatches,
  rfPathFor,
  toAscii,
  toIsPacket,
  toRfFrame,
} from '../server/aprs';

const CALL = 'EA7JRS-13';
const PASS = String(aprsPasscode(CALL));
const BULLETIN = `${CALL}>APRS,TCPIP*,qAC,GATEWAY::BLN1    :EMERGENCIA SISMICA`;

test('indicativos: válidos, de plantilla y mal formados', () => {
  for (const c of ['EA7JRS', 'EA7JRS-13', 'ea7jrs-9', 'W1AW']) assert.equal(isValidCallsign(c), true, c);
  for (const c of ['', null, 'CALLSING-13', 'N0CALL', 'EA1URG-13', 'EA7JRS-16', 'TOOLONG7', 'ABCDEF', '123456']) {
    assert.equal(isValidCallsign(c as any), false, String(c));
  }
});

test('passcode de APRS-IS', () => {
  assert.equal(aprsPasscode('N0CALL'), 13023);
  assert.equal(passcodeMatches('N0CALL-5', '13023'), true);
  assert.equal(passcodeMatches('N0CALL', ''), false);
  assert.equal(passcodeMatches('N0CALL', '-1'), false);
});

test('coordenadas: formato fijo y sin minutos «60.00»', () => {
  assert.equal(latToAprs(40.416775), '4025.01N');
  assert.equal(lonToAprs(-3.70379), '00342.23W');
  assert.equal(latToAprs(36.99999), '3700.00N');
  assert.equal(lonToAprs(-5.999999), '00600.00W');
  assert.equal(latToAprs(-33.5), '3330.00S');
});

test('toAscii conserva los espacios de los campos de ancho fijo', () => {
  assert.equal(toAscii(':BLN1    :⚠️ Ñandú en Cádiz'), ':BLN1    : Nandu en Cadiz');
});

test('los boletines se recortan a 67 caracteres de texto; el resto de tramas no', () => {
  const long = ':BLN2AQI  :' + 'x'.repeat(100);
  assert.equal(normalizeInfo(long), ':BLN2AQI  :' + 'x'.repeat(67));
  const object = ';SEISMO   *091530z3709.00N\\00400.60WQ' + 'y'.repeat(80);
  assert.equal(normalizeInfo(object), object);
});

test('APRS-IS: ruta TCPIP* sin construcciones q inventadas', () => {
  const packet = parseTnc2(BULLETIN)!;
  assert.deepEqual(packet.path, ['TCPIP*', 'qAC', 'GATEWAY']);
  assert.equal(toIsPacket(packet), `${CALL}>APZSAT,TCPIP*::BLN1    :EMERGENCIA SISMICA`);
});

test('RF: las rutas de Internet se sustituyen por la ruta de radio', () => {
  const packet = parseTnc2(BULLETIN)!;
  assert.deepEqual(rfPathFor(packet, 'WIDE1-1,WIDE2-1'), ['WIDE1-1', 'WIDE2-1']);
  const own = parseTnc2(`${CALL}>APXSAT,WIDE1-1::BLN1REMER:hola`)!;
  assert.deepEqual(rfPathFor(own), ['WIDE1-1']);

  const frame = toRfFrame(packet, 'WIDE1-1,WIDE2-1');
  const text = (offset: number) => Buffer.from(frame.subarray(offset, offset + 6)).map((b) => b >> 1).toString().trim();
  assert.equal(text(0), 'APZSAT');
  assert.equal(text(7), 'EA7JRS');
  assert.equal((frame[13] >> 1) & 0x0f, 13);
  assert.deepEqual([6, 13, 20, 27].map((i) => frame[i] & 1), [0, 0, 0, 1]);
  assert.deepEqual([...frame.subarray(28, 30)], [0x03, 0xf0]);
  assert.equal(frame.subarray(30).toString('ascii'), ':BLN1    :EMERGENCIA SISMICA');
  assert.equal(frame.includes('TCPIP'), false);
});

test('AX.25 rechaza direcciones que no son de radio', () => {
  assert.throws(() => encodeAx25Ui(CALL, 'APZSAT', ['TCPIP*'], 'x'));
  assert.throws(() => encodeAx25Ui(CALL, 'APZSAT', ['qAC'], 'x'));
  assert.throws(() => encodeAx25Ui('CALLSING-13', 'APZSAT', [], 'x'));
});

test('KISS: escapado de FEND y FESC', () => {
  assert.deepEqual([...kissEncode(Buffer.from([1, 0xc0, 2, 0xdb, 3]))], [0xc0, 0, 1, 0xdb, 0xdc, 2, 0xdb, 0xdd, 3, 0xc0]);
});

test('política de emisión', async (t) => {
  const ctx = { txEnabled: true, callsign: CALL, passcode: PASS };

  await t.test('apagada por defecto', () => {
    const d = decideTransmission(BULLETIN, { ...ctx, txEnabled: false });
    assert.deepEqual([d.aprsIs, d.rf], [false, false]);
    assert.match(d.reason, /desactivada/);
  });
  await t.test('los datos simulados no salen al aire', () => {
    const d = decideTransmission(BULLETIN, { ...ctx, simulated: true });
    assert.deepEqual([d.aprsIs, d.rf], [false, false]);
  });
  await t.test('indicativo de plantilla', () => {
    const d = decideTransmission('N0CALL>APRS:>x', { ...ctx, callsign: 'N0CALL', passcode: '13023' });
    assert.deepEqual([d.aprsIs, d.rf], [false, false]);
  });
  await t.test('no se emite con el indicativo de otro', () => {
    const d = decideTransmission('EA4XXX>APRS:>x', ctx);
    assert.deepEqual([d.aprsIs, d.rf], [false, false]);
  });
  await t.test('solo el campo de información no es una trama', () => {
    const d = decideTransmission(':BLN1    :texto', ctx);
    assert.deepEqual([d.aprsIs, d.rf], [false, false]);
  });
  await t.test('passcode incorrecto: solo RF', () => {
    const d = decideTransmission(BULLETIN, { ...ctx, passcode: '12345' });
    assert.deepEqual([d.aprsIs, d.rf], [false, true]);
  });
  await t.test('estación bien configurada: ambos canales', () => {
    const d = decideTransmission(BULLETIN, ctx);
    assert.deepEqual([d.aprsIs, d.rf, d.reason], [true, true, '']);
  });
});
