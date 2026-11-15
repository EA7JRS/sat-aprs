// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Ayuda de la consola: qué hay en cada sección y un acceso a cada pantalla.
// El detalle está en el manual (docs/MANUAL.md), al que se enlaza.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { SECCIONES, Pantalla } from '../../navigation';

interface HelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  playBuzzerSound?: (freq?: number, duration?: number, type?: OscillatorType) => void;
  activeTab?: string;
  setActiveTab?: (tab: Pantalla) => void;
}

const MANUAL = 'https://github.com/EA7JRS/sat-aprs/blob/main/docs/MANUAL.md';

const QUE_HAY: Record<string, string> = {
  inicio: 'Avisos activos en tu zona, estado de la estación (posición, hora, baliza, meteo), últimas emisiones y si responden las fuentes.',
  avisos: 'Todos los avisos de la cadena: los que se difunden y los que no, con el motivo y sus tramas APRS, y las reglas de cada tipo. Plan Meteosalud.',
  estacion: 'Meteorología de la estación, calidad del aire cercana, perfil APRS (indicativo, posición, símbolo, baliza, parte meteorológico) y WeeWX con sus 24 h.',
  mapa: 'Capas con todo lo que llega con coordenadas: estación, avisos, APRS, AIS, ADS-B y tráfico de la DGT. Boyas cercanas. Nada del mapa se retransmite.',
  radio: 'Equipo por CAT, rotor, satélites con Doppler, cluster DX, grupo ARTS y EAI, mensajería APRS y DAPNET, consola de comandos; Direwolf, aprx, tramas APRS, HF y Winlink.',
  sistema: 'Estado del equipo y de los enlaces, configuración y archivos .conf, salida NMEA 2000 y herramientas de prueba (nada de ellas se emite).',
};

export default function HelpOverlay({ isOpen, onClose, setActiveTab }: HelpOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const ir = (p: Pantalla) => { setActiveTab?.(p); onClose(); };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ayuda-titulo" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto flex flex-col gap-4 p-5" onClick={(e) => e.stopPropagation()} id="ayuda">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ayuda-titulo" className="text-xl font-semibold text-slate-100">Ayuda de la consola</h2>
            <p className="text-sm text-slate-400">Seis secciones; toca una pantalla para ir a ella.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar la ayuda" className="w-11 h-11 rounded-full border border-slate-700 text-slate-300 hover:text-slate-100 flex items-center justify-center cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {SECCIONES.map((s) => (
            <section key={s.id} className="border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2" aria-labelledby={`ayuda-${s.id}`}>
              <h3 id={`ayuda-${s.id}`} className="text-[16px] font-semibold text-slate-100">{s.nombre}</h3>
              <p className="text-sm text-slate-300">{QUE_HAY[s.id]}</p>
              <div className="flex flex-wrap gap-2">
                {s.pantallas.map((p) => (
                  <button key={p.id} type="button" onClick={() => ir(p.id)} className="min-h-[40px] px-3.5 rounded-full border border-slate-700 text-sm text-slate-200 hover:border-sky-500 cursor-pointer">
                    {p.nombre}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-3 flex flex-col gap-1.5 text-sm text-slate-300">
          <p><b>Lo que se emite</b> sale con el indicativo de la estación: la emisión viene apagada (<span className="font-mono">SAT_APRS_TX</span>), sin indicativo válido no sale nada y lo de prueba nunca se transmite. El PTT, la emergencia remota y Winlink por radio piden confirmación.</p>
          <p>Paso a paso, casos de uso y solución de problemas: <a className="text-sky-400 font-semibold hover:text-sky-300" href={MANUAL} target="_blank" rel="noopener noreferrer">manual de uso</a>.</p>
        </div>
      </div>
    </div>
  );
}
