// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
// Pruebas de la autenticación de la API: la identidad se verifica, no se confía en cabeceras.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createAuthenticator } from '../server/auth';

const PROJECT = 'proyecto-de-prueba';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function makeToken(claims: Record<string, unknown> = {}, key = privateKey, kid = 'k1'): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'RS256', kid, typ: 'JWT' })}.${b64({
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: 'uid-123',
    iat: now - 10,
    exp: now + 3600,
    email: 'admin@example.org',
    email_verified: true,
    ...claims,
  })}`;
  const signature = crypto.createSign('RSA-SHA256').update(body).sign(key).toString('base64url');
  return `${body}.${signature}`;
}

function authenticator(extra: Record<string, unknown> = {}) {
  return createAuthenticator({
    projectId: PROJECT,
    adminEmails: ['admin@example.org'],
    fetchCerts: async () => ({ certs: { k1: publicPem }, maxAgeMs: 60_000 }),
    ...extra,
  });
}

const req = (headers: Record<string, string>, remoteAddress = '203.0.113.7') => ({ headers, socket: { remoteAddress } });

test('las cabeceras X-User-* ya no conceden ningún privilegio', async () => {
  const auth = await authenticator().authenticate(req({ 'x-user-uid': 'cualquiera', 'x-user-email': 'admin@example.org' }));
  assert.equal(auth, null);
});

test('token de Firebase válido de un administrador', async () => {
  const auth = await authenticator().authenticate(req({ authorization: `Bearer ${makeToken()}` }));
  assert.equal(auth?.admin, true);
  assert.equal(auth?.uid, 'uid-123');
});

test('usuario registrado pero no administrador', async () => {
  const auth = await authenticator().authenticate(req({ authorization: `Bearer ${makeToken({ email: 'otro@example.org' })}` }));
  assert.equal(auth?.admin, false);
});

test('un correo sin verificar no es administrador', async () => {
  const auth = await authenticator().authenticate(req({ authorization: `Bearer ${makeToken({ email_verified: false })}` }));
  assert.equal(auth?.admin, false);
});

test('tokens falsificados, caducados o de otro proyecto', async () => {
  const a = authenticator();
  const cases = [
    makeToken({}, other.privateKey),                         // firmado con otra clave
    makeToken({ exp: Math.floor(Date.now() / 1000) - 5 }),    // caducado
    makeToken({ aud: 'otro-proyecto' }),                      // otro proyecto
    makeToken({ iss: 'https://evil.example/' }),              // emisor falso
    makeToken({}, privateKey, 'desconocida'),                 // clave desconocida
    makeToken().replace(/\.[^.]+$/, '.AAAA'),                 // firma manipulada
    'a.b.c',
  ];
  for (const token of cases) {
    assert.equal(await a.authenticate(req({ authorization: `Bearer ${token}` })), null);
  }
  // Algoritmo «none»
  const unsigned = `${b64({ alg: 'none', kid: 'k1' })}.${b64({ aud: PROJECT, sub: 'x' })}.`;
  assert.equal(await a.authenticate(req({ authorization: `Bearer ${unsigned}` })), null);
});

test('token local de administrador (funciona sin Internet)', async () => {
  const a = authenticator({ adminToken: 'secreto-largo-de-la-estacion' });
  assert.equal((await a.authenticate(req({ 'x-admin-token': 'secreto-largo-de-la-estacion' })))?.admin, true);
  assert.equal(await a.authenticate(req({ 'x-admin-token': 'incorrecto' })), null);
  assert.equal(await authenticator().authenticate(req({ 'x-admin-token': '' })), null);
});

test('confianza en localhost: opcional y nunca a través de un proxy', async () => {
  assert.equal(await authenticator().authenticate(req({}, '127.0.0.1')), null);
  const a = authenticator({ trustLocalhost: true });
  assert.equal((await a.authenticate(req({}, '127.0.0.1')))?.admin, true);
  assert.equal(await a.authenticate(req({}, '192.168.1.20')), null);
  assert.equal(await a.authenticate(req({ 'x-forwarded-for': '198.51.100.4' }, '127.0.0.1')), null);
});
