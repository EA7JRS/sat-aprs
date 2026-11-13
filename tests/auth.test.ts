// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
// Pruebas de la autenticación local de la API: nunca se confía en cabeceras declarativas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticator } from '../server/auth';

const TOKEN = 'secreto-largo-de-la-estacion-0123456789';
const req = (headers: Record<string, string>, remoteAddress = '203.0.113.7') => ({ headers, socket: { remoteAddress } });

test('sin configuración nadie es administrador', () => {
  const a = createAuthenticator({});
  assert.equal(a.adminConfigured, false);
  assert.equal(a.authenticate(req({})), null);
  assert.equal(a.authenticate(req({ 'x-admin-token': '' })), null);
  assert.equal(a.authenticate(req({}, '127.0.0.1')), null);
});

test('las cabeceras X-User-* no conceden ningún privilegio', () => {
  const a = createAuthenticator({ adminToken: TOKEN });
  assert.equal(a.authenticate(req({ 'x-user-uid': 'cualquiera', 'x-user-email': 'admin@example.org' })), null);
});

test('token local de administrador', () => {
  const a = createAuthenticator({ adminToken: TOKEN });
  assert.equal(a.adminConfigured, true);
  assert.deepEqual(a.authenticate(req({ 'x-admin-token': TOKEN })), { admin: true, via: 'token' });
  assert.deepEqual(a.authenticate(req({ authorization: `Bearer ${TOKEN}` })), { admin: true, via: 'token' });
  assert.equal(a.authenticate(req({ 'x-admin-token': 'incorrecto' })), null);
  assert.equal(a.authenticate(req({ 'x-admin-token': TOKEN.slice(0, -1) })), null);
});

test('un token demasiado corto se ignora', () => {
  const a = createAuthenticator({ adminToken: '1234' });
  assert.equal(a.tokenTooShort, true);
  assert.equal(a.adminConfigured, false);
  assert.equal(a.authenticate(req({ 'x-admin-token': '1234' })), null);
});

test('confianza en localhost: opcional y nunca a través de un proxy', () => {
  const a = createAuthenticator({ trustLocalhost: true });
  assert.deepEqual(a.authenticate(req({}, '127.0.0.1')), { admin: true, via: 'localhost' });
  assert.deepEqual(a.authenticate(req({}, '::1')), { admin: true, via: 'localhost' });
  assert.equal(a.authenticate(req({}, '192.168.1.20')), null);
  assert.equal(a.authenticate(req({ 'x-forwarded-for': '198.51.100.4' }, '127.0.0.1')), null);
});
