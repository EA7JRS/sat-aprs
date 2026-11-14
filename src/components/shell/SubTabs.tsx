// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Pantallas de la sección en curso. Con una sola pantalla no se muestra.
import React from 'react';
import { Pantalla, Seccion } from '../../navigation';

export default function SubTabs({ seccion, actual, onIr }: { seccion: Seccion; actual: Pantalla; onIr: (p: Pantalla) => void }) {
  if (seccion.pantallas.length < 2) return null;
  return (
    <div role="tablist" aria-label={seccion.nombre} id="pantallas-seccion" className="flex gap-1.5 px-4 lg:px-6 py-2 border-b border-slate-800 bg-slate-950 overflow-x-auto">
      {seccion.pantallas.map((p) => {
        const activa = p.id === actual;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activa}
            id={`pantalla-${p.id}`}
            onClick={() => onIr(p.id)}
            className={`min-h-[40px] px-4 rounded-full border text-sm whitespace-nowrap cursor-pointer transition-colors ${
              activa ? 'border-sky-500 bg-sky-950 text-slate-50 font-semibold' : 'border-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100'
            }`}
          >
            {p.nombre}
          </button>
        );
      })}
    </div>
  );
}
