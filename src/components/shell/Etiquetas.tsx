// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import React from 'react';
import type { Gravedad } from '../../utils/useAvisos';

// Colores fijos: el nivel de un aviso se ve igual en todos los temas de la consola
const COLOR: Record<Gravedad, string> = {
  rojo: 'bg-[#f87171] text-black',
  naranja: 'bg-[#fb923c] text-black',
  amarillo: 'bg-[#fde047] text-black',
  info: 'bg-[#94a3b8] text-black',
};

/** Nivel del aviso: color y, siempre, la palabra (no se distingue solo por el color). */
export function Nivel({ gravedad }: { gravedad: Gravedad }) {
  return (
    <span className={`sat-nivel inline-block w-[88px] shrink-0 text-center rounded-md py-1 text-[13px] font-bold tracking-wide ${COLOR[gravedad]}`}>
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

/** Franja que avisa de que una pantalla usa datos de demostración o es solo de consulta. */
export function AvisoDemostracion({ children }: { children: React.ReactNode }) {
  return (
    <p className="sat-aviso-demo border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm">
      {children}
    </p>
  );
}
