// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Parte meteorológico de la estación por APRS: de dónde salen los datos
// (estación propia o Internet), cada cuánto se emite y cómo queda la trama.
import React, { useCallback, useEffect, useState } from 'react';
import { CloudSun, Send } from 'lucide-react';
import { TelemetryConfig } from '../../types';
import { customFetch } from '../../utils/customFetch';
import { useAdminSession } from '../../utils/session';
import { haceCuanto } from '../../utils/useAvisos';

interface Resumen {
  fuente: string; cuando: number; reciente: boolean;
  tempC: number | null; humedadPct: number | null; presionHpa: number | null; vientoKmh: number | null; rachaKmh: number | null; dirGrados: number | null; lluvia1hMm: number | null;
}
interface Estado {
  packet: string | null; errores: string[]; activa: boolean; intervaloMin: number; modo: string; elegida: string | null;
  propia: Resumen | null; internet: Resumen | null; txEnabled: boolean;
}

const campo = 'w-full min-h-[40px] bg-slate-900 border border-slate-800 rounded-lg px-2.5 text-slate-100 text-xs font-mono';
const rotulo = 'text-slate-400 text-[10px] font-bold font-mono flex flex-col gap-1';

function Fuente({ titulo, r, vacio }: { titulo: string; r: Resumen | null; vacio: string }) {
  const dato = (v: number | null, unidad: string, decimales = 0) => (v === null ? '—' : `${v.toFixed(decimales)} ${unidad}`);
  return (
    <div className="border border-slate-800 rounded-lg px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-100 text-sm">{titulo}</span>
        <span className={`text-[11px] ${r ? (r.reciente ? 'text-emerald-400' : 'text-amber-300') : 'text-slate-400'}`}>
          {r ? `${r.fuente} · ${haceCuanto(r.cuando)}${r.reciente ? '' : ' (antiguo)'}` : vacio}
        </span>
      </div>
      {r && (
        <div className="mt-1 text-[12px] text-slate-300 font-mono">
          {dato(r.tempC, '°C', 1)} · {dato(r.humedadPct, '%')} · {dato(r.presionHpa, 'hPa')} · viento {dato(r.vientoKmh, 'km/h')}{r.dirGrados !== null ? ` de ${Math.round(r.dirGrados)}°` : ''}
        </div>
      )}
    </div>
  );
}

export default function StationWeather({ config, onGuardar }: { config: TelemetryConfig; onGuardar: (c: Partial<TelemetryConfig>) => Promise<boolean> }) {
  const session = useAdminSession();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [v, setV] = useState({
    activa: !!config.wxBeaconEnabled,
    intervalo: String(config.wxBeaconInterval ?? 10),
    fuente: (config.wxFuente ?? 'auto') as NonNullable<TelemetryConfig['wxFuente']>,
    weewx: config.wxWeewxDb ?? '/var/lib/weewx/weewx.sdb',
    wxnow: config.wxWxnowPath ?? '',
  });
  const [mensaje, setMensaje] = useState<string | null>(null);

  const leer = useCallback(() => {
    customFetch('/api/estacion/meteo').then((r) => r.json()).then(setEstado).catch(() => setEstado(null));
  }, []);
  useEffect(() => {
    leer();
    const t = setInterval(leer, 30000);
    return () => clearInterval(t);
  }, [leer]);

  const guardar = async () => {
    setMensaje('Guardando…');
    const ok = await onGuardar({
      wxBeaconEnabled: v.activa, wxBeaconInterval: Math.max(5, Number(v.intervalo) || 10), wxFuente: v.fuente,
      wxWeewxDb: v.weewx.trim(), wxWxnowPath: v.wxnow.trim(),
    });
    setMensaje(ok ? 'Guardado.' : 'No se pudo guardar.');
    setTimeout(leer, 1500);
  };

  const emitir = async () => {
    setMensaje('Enviando…');
    try {
      const r = await customFetch('/api/estacion/meteo', { method: 'POST' });
      const j = await r.json();
      setMensaje(!r.ok ? `No enviado: ${j.error}` : j.txEnabled ? 'Parte puesto en la cola de emisión.' : 'Registrado, pero NO emitido: la emisión está desactivada (SAT_APRS_TX).');
    } catch {
      setMensaje('No se pudo contactar con el servidor.');
    }
  };

  return (
    <div id="station-weather" className="bg-slate-900/30 border border-slate-900/80 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2.5 border-b border-slate-900 pb-3">
        <CloudSun size={16} className="text-amber-500" />
        <div>
          <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider font-mono">Parte meteorológico por APRS</h3>
          <p className="text-[10.5px] text-slate-500 mt-0.5">Datos de la estación meteorológica propia o, si no hay, de Internet. Solo se emiten datos reales y recientes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
        <Fuente titulo="Estación propia" r={estado?.propia ?? null} vacio="Sin lectura (WeeWX o wxnow.txt)" />
        <Fuente titulo="Internet" r={estado?.internet ?? null} vacio="Sin clave de OWM o AEMET" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={rotulo}>
          Datos que se emiten
          <select id="meteo-fuente" className={campo} value={v.fuente} onChange={(e) => setV((x) => ({ ...x, fuente: e.target.value as typeof x.fuente }))}>
            <option value="auto">Automático: la propia y, si falta, Internet</option>
            <option value="propia">Solo la estación propia</option>
            <option value="internet">Solo Internet (OWM o AEMET)</option>
          </select>
        </label>
        <label className={rotulo}>
          Intervalo (minutos, mínimo 5)
          <input id="meteo-intervalo" type="number" min={5} max={120} className={campo} value={v.intervalo} onChange={(e) => setV((x) => ({ ...x, intervalo: e.target.value }))} />
        </label>
        <label className={rotulo}>
          Base de datos de WeeWX
          <input id="meteo-weewx" className={campo} value={v.weewx} disabled={!session.isAdmin} onChange={(e) => setV((x) => ({ ...x, weewx: e.target.value }))} />
        </label>
        <label className={rotulo}>
          Archivo wxnow.txt (opcional)
          <input id="meteo-wxnow" className={campo} value={v.wxnow} disabled={!session.isAdmin} placeholder="/var/tmp/wxnow.txt" onChange={(e) => setV((x) => ({ ...x, wxnow: e.target.value }))} />
        </label>
      </div>

      <label htmlFor="meteo-activa" className="flex items-start gap-2 cursor-pointer">
        <input id="meteo-activa" type="checkbox" className="mt-0.5 accent-amber-500" checked={v.activa} onChange={(e) => setV((x) => ({ ...x, activa: e.target.checked }))} />
        <span className="text-[11px] text-slate-300">
          Emitir el parte meteorológico cada {Math.max(5, Number(v.intervalo) || 10)} min
          <span className="block text-[10px] text-slate-500">Déjelo apagado si WeeWX, Direwolf o aprx ya emiten el parte con este indicativo. El parte lleva también la posición.</span>
        </span>
      </label>

      <div className="space-y-1">
        <span className="text-slate-400 text-[10px] block font-bold font-mono">Trama del parte{estado?.elegida ? ` · datos de ${estado.elegida}` : ''}</span>
        <code id="meteo-trama" className="block bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-sky-300 font-mono break-all">
          {estado === null ? '…' : estado.packet || `No se puede emitir: ${estado.errores.join('; ')}.`}
        </code>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" id="meteo-guardar" onClick={guardar} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-5 py-2 rounded-lg cursor-pointer">Guardar</button>
        <button type="button" id="meteo-emitir" onClick={emitir} disabled={!session.isAdmin || !estado?.packet} title={session.isAdmin ? 'Emite el parte con los datos actuales' : 'Solo el administrador'}
          className="border border-slate-700 hover:border-amber-500/50 disabled:opacity-40 text-slate-200 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer">
          <Send size={12} /> Emitir parte ahora
        </button>
        {mensaje && <span id="meteo-mensaje" className="text-[10px] text-slate-300 font-mono">{mensaje}</span>}
      </div>
    </div>
  );
}
