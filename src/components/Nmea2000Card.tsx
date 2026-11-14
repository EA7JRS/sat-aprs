// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Tarjeta de la consola para la emisión NMEA 2000 (SocketCAN): enciende el bus y elige qué datos de la estación se ponen
// en él (posición de gpsd, meteorología, navegación y avisos de emergencia). Habla con /api/nmea2000.

import { useEffect, useState } from 'react';
import { Cable, CircleCheck, CircleX } from 'lucide-react';
import { customFetch } from '../utils/customFetch';

interface ConfigN2k {
  activo: boolean;
  interfaz: string;
  direccion: number;
  emitirGps: boolean;
  emitirMeteo: boolean;
  emitirNavegacion: boolean;
  emitirAvisos: boolean;
  mmsiPropio?: number;
}
interface EstadoN2k { activo: boolean; interfaz: string; direccion: number; error: string | null; }

const GRUPOS: Array<{ k: keyof ConfigN2k; txt: string; sub: string }> = [
  { k: 'emitirGps', txt: 'Posición y hora (gpsd)', sub: '129025 · 129026 · 126992' },
  { k: 'emitirMeteo', txt: 'Meteorología', sub: '130306 · 130314 · 130316' },
  { k: 'emitirNavegacion', txt: 'Navegación / ruta', sub: '129283 · 129284' },
  { k: 'emitirAvisos', txt: 'Avisos de emergencia', sub: '129802 (mensaje de seguridad AIS)' },
];

export default function Nmea2000Card({ isAdmin, showToast }: { isAdmin?: boolean; showToast?: (m: string, t?: string) => void }) {
  const [cfg, setCfg] = useState<ConfigN2k | null>(null);
  const [estado, setEstado] = useState<EstadoN2k | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const r = await customFetch('/api/nmea2000');
      if (r.ok) { const j = await r.json(); setCfg(j.config); setEstado(j.estado); }
    } catch { /* la consola sigue sin datos */ }
  };
  useEffect(() => { cargar(); const t = setInterval(cargar, 5000); return () => clearInterval(t); }, []);

  const guardar = async () => {
    if (!cfg) return;
    setGuardando(true);
    try {
      const r = await customFetch('/api/nmea2000', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setCfg(j.config); setEstado(j.estado); showToast?.('NMEA 2000 guardado'); }
      else showToast?.(j.error || 'No autorizado', 'error');
    } catch { showToast?.('Error de red', 'error'); } finally { setGuardando(false); }
  };

  if (!cfg) return <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">Cargando NMEA 2000…</div>;

  const set = <K extends keyof ConfigN2k>(k: K, v: ConfigN2k[K]) => setCfg({ ...cfg, [k]: v });
  const ro = !isAdmin;
  const activoEnBus = estado && estado.activo && estado.direccion >= 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Cable size={18} className="text-cyan-400" /> NMEA 2000 (SocketCAN)
        </div>
        <span className={`inline-flex items-center gap-1 text-xs ${activoEnBus ? 'text-emerald-400' : 'text-slate-500'}`}>
          {activoEnBus ? <CircleCheck size={14} /> : <CircleX size={14} />}
          {activoEnBus ? `en el bus · dir ${estado!.direccion}` : (cfg.activo ? 'reclamando…' : 'apagado')}
        </span>
      </div>

      <p className="text-xs text-slate-400 -mt-2">
        El NUC, con un adaptador CAN, pone en el bus los datos propios de la estación. El AIS/ADS-B recibido por RF no se
        retransmite (solo mapa). Requiere <code className="text-slate-300">can-utils</code> y la interfaz levantada a 250 kbit/s.
      </p>

      <label className="flex items-center gap-3">
        <input type="checkbox" disabled={ro} checked={cfg.activo} onChange={(e) => set('activo', e.target.checked)} className="accent-cyan-500 w-4 h-4" />
        <span className="text-sm text-slate-200">Emitir al bus NMEA 2000</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Interfaz CAN
          <input type="text" disabled={ro} value={cfg.interfaz} onChange={(e) => set('interfaz', e.target.value.trim())} placeholder="can0"
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100" />
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          Dirección del bus (0–251)
          <input type="number" min={0} max={251} disabled={ro} value={cfg.direccion} onChange={(e) => set('direccion', parseInt(e.target.value) || 0)}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100" />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {GRUPOS.map((g) => (
          <label key={g.k} className="flex items-center gap-3">
            <input type="checkbox" disabled={ro} checked={!!cfg[g.k]} onChange={(e) => set(g.k, e.target.checked as never)} className="accent-cyan-500 w-4 h-4" />
            <span className="text-sm text-slate-200">{g.txt}</span>
            <span className="text-[11px] text-slate-500 ml-auto font-mono">{g.sub}</span>
          </label>
        ))}
      </div>

      <label className="text-xs text-slate-400 flex flex-col gap-1">
        MMSI de la estación (para los avisos 129802)
        <input type="number" disabled={ro} value={cfg.mmsiPropio ?? ''} onChange={(e) => set('mmsiPropio', e.target.value ? parseInt(e.target.value) : undefined)}
          placeholder="ficticio si se deja vacío" className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100" />
      </label>

      {estado?.error && <div className="text-xs text-amber-400">Bus: {estado.error}</div>}

      {!ro && (
        <button onClick={guardar} disabled={guardando}
          className="self-start rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white">
          {guardando ? 'Guardando…' : 'Guardar y aplicar'}
        </button>
      )}
      {ro && <div className="text-xs text-slate-500">Entra como administrador para cambiar la configuración.</div>}
    </div>
  );
}
