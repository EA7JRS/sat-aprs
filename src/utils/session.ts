// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sesión de administrador de la consola. No hay cuentas ni servicios en la
// nube: el administrador se identifica con el token local de la estación
// (SAT_ADMIN_TOKEN en .env), que el servidor comprueba en cada petición.
import { useCallback, useEffect, useState } from 'react';
import { ADMIN_TOKEN_STORAGE_KEY } from './customFetch';

export interface AdminStatus {
  /** La petición actual está autorizada como administrador. */
  admin: boolean;
  /** Cómo se ha reconocido: token local o navegador del propio equipo. */
  via: 'token' | 'localhost' | null;
  /** El servidor tiene configurado algún método de administración. */
  adminConfigured: boolean;
  /** La consola tiene activada la emisión real (SAT_APRS_TX=on). */
  txEnabled: boolean;
}

const ANONYMOUS: AdminStatus = { admin: false, via: null, adminConfigured: false, txEnabled: false };
const SESSION_EVENT = 'sat_admin_session_changed';

function readToken(): string {
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

async function fetchStatus(): Promise<AdminStatus> {
  try {
    const res = await customFetch('/api/auth/status');
    if (!res.ok) return ANONYMOUS;
    return { ...ANONYMOUS, ...(await res.json()) };
  } catch {
    return ANONYMOUS;
  }
}

/** Estado de la sesión de administrador, compartido por toda la consola. */
export function useAdminSession() {
  const [status, setStatus] = useState<AdminStatus>(ANONYMOUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchStatus();
    setStatus(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => { refresh(); };
    window.addEventListener(SESSION_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(SESSION_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  /** Guarda el token y comprueba que el servidor lo acepta. */
  const login = useCallback(async (token: string): Promise<boolean> => {
    const clean = token.trim();
    if (!clean) return false;
    try {
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, clean);
    } catch {
      return false;
    }
    const next = await fetchStatus();
    if (!next.admin) {
      try { window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); } catch { /* sin almacenamiento */ }
    }
    window.dispatchEvent(new Event(SESSION_EVENT));
    return next.admin;
  }, []);

  const logout = useCallback(() => {
    try { window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event(SESSION_EVENT));
  }, []);

  return {
    ...status,
    isAdmin: status.admin,
    hasStoredToken: readToken() !== '',
    loading,
    login,
    logout,
    refresh,
  };
}
