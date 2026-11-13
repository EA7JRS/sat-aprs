// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Autenticación de la API.
//
// La consola gobierna una estación de radio y escribe en el disco del equipo,
// así que la identidad del operador se VERIFICA en el servidor; nunca se confía
// en lo que diga una cabecera enviada por el navegador. Hay tres vías:
//
//   1. Token de identidad de Firebase (Authorization: Bearer <idToken>), cuya
//      firma RS256 se comprueba con los certificados públicos de Google.
//      Es administrador quien tenga el correo verificado y listado en
//      SAT_ADMIN_EMAILS.
//   2. Token local SAT_ADMIN_TOKEN (cabecera X-Admin-Token). Funciona sin
//      Internet, imprescindible en una emergencia con la red caída.
//   3. SAT_TRUST_LOCALHOST=on: las peticiones hechas desde el propio equipo
//      (pantalla de la estación) se consideran del administrador.

import crypto from 'crypto';

export interface AuthInfo {
  uid: string;
  email?: string;
  emailVerified: boolean;
  admin: boolean;
  via: 'firebase' | 'token' | 'localhost';
}

export interface AuthenticatorOptions {
  projectId?: string;
  adminEmails?: string[];
  adminToken?: string;
  trustLocalhost?: boolean;
  /** Sustituible en las pruebas. Devuelve { kid: certificadoPEM }. */
  fetchCerts?: () => Promise<{ certs: Record<string, string>; maxAgeMs: number }>;
  now?: () => number;
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_S = 300;

async function fetchGoogleCerts(): Promise<{ certs: Record<string, string>; maxAgeMs: number }> {
  const res = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`No se pudieron obtener los certificados de Google (HTTP ${res.status})`);
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  return {
    certs: (await res.json()) as Record<string, string>,
    maxAgeMs: (maxAge ? parseInt(maxAge[1], 10) : 3600) * 1000,
  };
}

function header(req: RequestLike, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return (Array.isArray(value) ? value[0] : value || '').trim();
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function decodeSegment(segment: string): any {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function isLoopback(address: string | null | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function parseList(value: string | undefined): string[] {
  return (value || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export function createAuthenticator(options: AuthenticatorOptions) {
  const adminEmails = new Set((options.adminEmails || []).map((e) => e.toLowerCase()));
  const adminToken = (options.adminToken || '').trim();
  const fetchCerts = options.fetchCerts || fetchGoogleCerts;
  const now = options.now || Date.now;

  let certCache: Record<string, string> = {};
  let certExpiry = 0;

  async function certFor(kid: string): Promise<string | undefined> {
    if (!certCache[kid] || now() >= certExpiry) {
      const fresh = await fetchCerts();
      certCache = fresh.certs;
      certExpiry = now() + fresh.maxAgeMs;
    }
    return certCache[kid];
  }

  /** Verifica un token de identidad de Firebase. Devuelve sus datos o lanza un error. */
  async function verifyIdToken(token: string): Promise<AuthInfo> {
    const projectId = options.projectId;
    if (!projectId) throw new Error('Falta el identificador del proyecto de Firebase');

    const segments = token.split('.');
    if (segments.length !== 3) throw new Error('Token mal formado');
    const [headerB64, payloadB64, signatureB64] = segments;
    const head = decodeSegment(headerB64);
    const payload = decodeSegment(payloadB64);

    if (head.alg !== 'RS256' || typeof head.kid !== 'string') throw new Error('Algoritmo de firma no admitido');
    const cert = await certFor(head.kid);
    if (!cert) throw new Error('Clave de firma desconocida');

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    if (!verifier.verify(cert, Buffer.from(signatureB64, 'base64url'))) throw new Error('Firma no válida');

    const nowS = Math.floor(now() / 1000);
    if (payload.aud !== projectId) throw new Error('El token es de otro proyecto');
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Emisor no válido');
    if (typeof payload.exp !== 'number' || payload.exp <= nowS) throw new Error('Token caducado');
    if (typeof payload.iat !== 'number' || payload.iat > nowS + CLOCK_SKEW_S) throw new Error('Token emitido en el futuro');
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Token sin usuario');

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
    const emailVerified = payload.email_verified === true;
    return {
      uid: payload.sub,
      email,
      emailVerified,
      admin: !!email && emailVerified && adminEmails.has(email),
      via: 'firebase',
    };
  }

  /** Identidad verificada de la petición, o null si es anónima o no válida. */
  async function authenticate(req: RequestLike): Promise<AuthInfo | null> {
    const authorization = header(req, 'authorization');
    const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() || '';
    const localToken = header(req, 'x-admin-token') || bearer;

    if (adminToken && localToken && safeEqual(localToken, adminToken)) {
      return { uid: 'local-admin', emailVerified: false, admin: true, via: 'token' };
    }

    if (bearer && bearer.split('.').length === 3) {
      try {
        return await verifyIdToken(bearer);
      } catch {
        // Token no válido: se trata como petición anónima
      }
    }

    // Solo conexiones directas desde el propio equipo: una petición que llega
    // a través de un proxy inverso trae X-Forwarded-For y no se considera local.
    if (options.trustLocalhost && isLoopback(req.socket?.remoteAddress) && !header(req, 'x-forwarded-for')) {
      return { uid: 'localhost', emailVerified: false, admin: true, via: 'localhost' };
    }

    return null;
  }

  return { authenticate, verifyIdToken };
}
