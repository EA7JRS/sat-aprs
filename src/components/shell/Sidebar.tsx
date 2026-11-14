// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Menú principal: las seis secciones de la consola.
import React from 'react';
import { Home, BellRing, RadioTower, Map as MapIcon, Radio, Settings } from 'lucide-react';
import { IdSeccion, SECCIONES, Seccion } from '../../navigation';

const ICONO: Record<IdSeccion, React.ComponentType<{ size?: number; className?: string }>> = {
  inicio: Home, avisos: BellRing, estacion: RadioTower, mapa: MapIcon, radio: Radio, sistema: Settings,
};

interface Props {
  actual: IdSeccion;
  onIr: (seccion: Seccion) => void;
  /** Avisos que cumplen las reglas ahora mismo. */
  avisosActivos: number;
  version: string;
}

export default function Sidebar({ actual, onIr, avisosActivos, version }: Props) {
  return (
    <nav
      aria-label="Secciones"
      id="menu-principal"
      className="bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 lg:w-56 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen flex lg:flex-col gap-2 lg:gap-5 px-3 py-2 lg:py-5 items-center lg:items-stretch overflow-x-auto"
    >
      <div className="flex items-center gap-2.5 px-1 lg:px-2 shrink-0">
        <img src="/aprs-lora-plus.png" alt="" className="h-8 w-8 rounded-md" />
        <div className="hidden sm:block leading-tight">
          <div className="font-bold text-lg tracking-wide text-slate-100">S.A.T.-APRS</div>
          <div className="text-xs text-slate-400">APRS LoRa+</div>
        </div>
      </div>

      <div className="flex lg:flex-col gap-1">
        {SECCIONES.map((s) => {
          const Icono = ICONO[s.id];
          const activa = s.id === actual;
          return (
            <button
              key={s.id}
              type="button"
              id={`seccion-${s.id}`}
              aria-current={activa ? 'page' : undefined}
              onClick={() => onIr(s)}
              className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded-lg text-[15px] whitespace-nowrap cursor-pointer transition-colors ${
                activa ? 'bg-sky-950 text-slate-50 font-semibold' : 'text-slate-300 font-medium hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icono size={17} className={activa ? 'text-sky-400' : 'text-slate-400'} />
              <span>{s.nombre}</span>
              {s.id === 'avisos' && avisosActivos > 0 && (
                <span className="lg:ml-auto sat-nivel bg-[#fbbf24] text-black text-xs font-bold rounded-full px-2 py-px" aria-label={`${avisosActivos} avisos activos`}>
                  {avisosActivos}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden lg:block mt-auto px-2 text-xs text-slate-400">v{version} · © 2026 Manuel - EA7JRS</div>
    </nav>
  );
}
