// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import React, { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, Unlock } from 'lucide-react';
import { useAdminSession } from '../../utils/session';

/**
 * Acceso de administrador de la estación. Sustituye a las antiguas cuentas en
 * la nube: basta el token local definido en SAT_ADMIN_TOKEN (.env), que
 * funciona también sin Internet.
 */
export default function AdminAccess() {
  const session = useAdminSession();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const ok = await session.login(token);
    setBusy(false);
    if (ok) {
      setToken('');
      setOpen(false);
    } else {
      setError(session.adminConfigured
        ? 'Token incorrecto.'
        : 'El servidor no tiene SAT_ADMIN_TOKEN configurado en .env.');
    }
  };

  if (session.isAdmin) {
    return (
      <span
        id="admin-access-status"
        className="min-h-[36px] text-[13px] bg-emerald-950/40 text-emerald-400 px-3 border border-emerald-900 rounded-lg font-semibold flex items-center gap-1.5"
      >
        <ShieldCheck size={14} />
        {session.via === 'localhost' ? 'Administrador (equipo local)' : 'Administrador'}
        {session.via === 'token' && (
          <button
            type="button"
            onClick={session.logout}
            title="Cerrar la sesión de administrador en este navegador"
            className="ml-1 text-emerald-300 hover:text-white cursor-pointer"
          >
            <LogOut size={14} />
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="relative" id="admin-access">
      <button
        type="button"
        onClick={() => { setOpen(!open); setError(null); }}
        className="min-h-[36px] text-[13px] bg-amber-950/30 text-amber-400 hover:text-amber-200 px-3 border border-amber-700/60 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
      >
        <Unlock size={14} />
        Entrar como administrador
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full mt-2 z-50 w-72 bg-slate-950 border border-slate-800 rounded-xl p-3 shadow-2xl space-y-2 text-[13px] normal-case"
        >
          <label htmlFor="admin-token-input" className="flex items-center gap-1.5 text-slate-300 font-bold uppercase">
            <KeyRound size={11} className="text-amber-500" />
            Token de administrador
          </label>
          <input
            id="admin-token-input"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Valor de SAT_ADMIN_TOKEN"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/40"
          />
          {error && <p className="text-rose-400">{error}</p>}
          <p className="text-slate-500 font-sans leading-snug">
            Se define en el archivo <code>.env</code> de la estación y se guarda solo en este navegador.
            Sin él, los cambios no se escriben en disco.
          </p>
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black uppercase tracking-wider cursor-pointer disabled:opacity-40"
          >
            {busy ? 'Comprobando…' : 'Acceder'}
          </button>
        </form>
      )}
    </div>
  );
}
