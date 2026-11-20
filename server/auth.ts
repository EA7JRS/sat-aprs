// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Autenticación de la API.
//
// La consola gobierna una estación de radio y escribe en el disco del equipo,
// así que el servidor comprueba quién es el administrador; nunca se confía en
// cabeceras declarativas enviadas por el navegador. Todo es local, sin cuentas
// ni servicios en la nube, para que funcione también con Internet caído:
//
//   1. Token local SAT_ADMIN_TOKEN (cabecera X-Admin-Token o Authorization:
//      Bearer). Se define en .env y se introduce una vez en cada navegador.
//   2. SAT_TRUST_LOCALHOST=on: las peticiones hechas desde el propio equipo
//      (pantalla de la estación) se consideran del administrador.

import crypto from 'crypto';

export interface AuthInfo {
  admin: boolean;
  via: 'token' | 'localhost';
}

export interface AuthenticatorOptions {
  adminToken?: string;
  trustLocalhost?: boolean;
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

/** Longitud mínima del token: uno corto se puede adivinar por fuerza bruta. */
export const MIN_ADMIN_TOKEN_LENGTH = 16;

function header(req: RequestLike, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return (Array.isArray(value) ? value[0] : value || '').trim();
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isLoopback(address: string | null | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function createAuthenticator(options: AuthenticatorOptions) {
  const configuredToken = (options.adminToken || '').trim();
  // Un token demasiado corto se ignora: equivale a no tener ninguno
  const adminToken = configuredToken.length >= MIN_ADMIN_TOKEN_LENGTH ? configuredToken : '';
  const trustLocalhost = options.trustLocalhost === true;

  /** Identidad comprobada de la petición, o null si es anónima. */
  function authenticate(req: RequestLike): AuthInfo | null {
    const bearer = /^Bearer\s+(.+)$/i.exec(header(req, 'authorization'))?.[1]?.trim() || '';
    const presented = header(req, 'x-admin-token') || bearer;

    if (adminToken && presented && safeEqual(presented, adminToken)) {
      return { admin: true, via: 'token' };
    }

    // Solo conexiones directas desde el propio equipo: una petición que llega
    // a través de un proxy inverso trae X-Forwarded-For y no se considera local.
    if (trustLocalhost && isLoopback(req.socket?.remoteAddress) && !header(req, 'x-forwarded-for')) {
      return { admin: true, via: 'localhost' };
    }

    return null;
  }

  return {
    authenticate,
    /** Hay algún método de administración disponible. */
    adminConfigured: adminToken !== '' || trustLocalhost,
    /** Se definió un token pero es demasiado corto y se ha ignorado. */
    tokenTooShort: configuredToken !== '' && adminToken === '',
  };
}
