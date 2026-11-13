// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
// Lectura del estado real de ntpsec (servidor de hora de la estación).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NTP_SIN_DATOS, interpretarNtp, leerPares } from '../server/sistema/ntp';

const RV_GPS = `associd=0 status=0415 leap_none, sync_uhf_radio, 1 event, clock_sync,
leap=00, stratum=1, precision=-20, rootdelay=0.0, rootdisp=1.105,
refid=PPS, reftime=ec9b3f1a.00000000 2026-11-13T19:20:10.000Z,
clock=ec9b3f1c.1a2b3c4d 2026-11-13T19:20:12.102Z, peer=41223, tc=4, mintc=0,
offset=0.001234, frequency=-12.345, sys_jitter=0.000821, clk_jitter=0.001,
clk_wander=0.0`;

const PARES_GPS = `     remote           refid      st t when poll reach   delay   offset   jitter
==============================================================================
oPPS(0)          .PPS.            0 l    3   16  377   0.0000   0.0012   0.0008
*SHM(0)          .GPS.            0 l    2   16  377   0.0000 -12.3456   1.2345
+193.147.107.33  .ROA.            1 u   33   64  377  21.1234   0.5123   0.2100
`;

test('servidor disciplinado por GPS+PPS: stratum 1 real', () => {
  const e = interpretarNtp(RV_GPS, PARES_GPS);
  assert.deepEqual(e, { stratum: 1, offsetMs: 0.001234, delayMs: 0, jitterMs: 0.000821, peer: 'PPS(0) (PPS)', status: 'synchronized' });
  assert.equal(leerPares(PARES_GPS).length, 3);
  assert.equal(leerPares(PARES_GPS)[2].alcance, 0o377);
});

test('sin GPS, sincronizado contra un servidor de Internet', () => {
  const rv = 'leap=00, stratum=2, refid=193.147.107.33, offset=0.512, sys_jitter=0.21, rootdelay=21.1';
  const pares = '*193.147.107.33  .ROA.            1 u   33   64  377  21.1234   0.5123   0.2100\n';
  const e = interpretarNtp(rv, pares);
  assert.deepEqual([e.stratum, e.status, e.peer, e.delayMs], [2, 'synchronized', '193.147.107.33 (ROA)', 21.1234]);
});

test('reloj sin sincronizar o ntpq sin respuesta: no se finge sincronización', () => {
  const arrancando = interpretarNtp('leap=11, stratum=16, refid=INIT, offset=0.0, sys_jitter=0.0',
    ' SHM(0)          .GPS.            0 l    -   16    0   0.0000   0.0000   0.0000\n');
  assert.deepEqual([arrancando.stratum, arrancando.status, arrancando.peer], [16, 'hold', 'sin par seleccionado']);
  assert.deepEqual(interpretarNtp('', ''), NTP_SIN_DATOS);
  assert.equal(NTP_SIN_DATOS.status, 'unsynchronized');
});
