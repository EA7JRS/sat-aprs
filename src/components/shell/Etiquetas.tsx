// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import React from 'react';
import type { Gravedad } from '../../utils/useAvisos';

const COLOR: Record<Gravedad, string> = {
  rojo: 'bg-red-400 text-slate-950',
  naranja: 'bg-orange-400 text-slate-950',
  amarillo: 'bg-yellow-300 text-slate-950',
  info: 'bg-slate-400 text-slate-950',
};

/** Nivel del aviso: color y, siempre, la palabra (no se distingue solo por el color). */
export function Nivel({ gravedad }: { gravedad: Gravedad }) {
  return (
    <span className={`inline-block w-[88px] shrink-0 text-center rounded-md py-1 text-[13px] font-bold tracking-wide ${COLOR[gravedad]}`}>
      {gravedad.toUpperCase()}
    </span>
  );
}

export function Tarjeta({ children, className = '', ...resto }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`bg-slate-900 border border-slate-800 rounded-xl p-4 ${className}`} {...resto}>
      {children}
    </section>
  );
}

export function Dato({ rotulo, children, grande = false }: { rotulo: string; children: React.ReactNode; grande?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-400">{rotulo}</div>
      <div className={grande ? 'text-xl font-semibold text-slate-100' : 'text-[15px] text-slate-100'}>{children}</div>
    </div>
  );
}
