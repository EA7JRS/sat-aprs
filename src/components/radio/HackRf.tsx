// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · HackRF One: APRS en FM de VHF o UHF, solo recepción.
import React, { useEffect, useState } from 'react';
import { customFetch } from '../../utils/customFetch';

interface Estado { activo: boolean; mhz: number; lna: number; vga: number; amp: boolean; serie: string; estado: string; motivo: string; tramas: number; ultima: number; desde: number; muestras: number; nivel: number | null }

const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const hace = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };

export default function HackRf() {
  const [e, setE] = useState<Estado | null>(null);
  const [v, setV] = useState({ activo: false, mhz: '144.8', lna: '24', vga: '30', amp: false, serie: '' });
  const [cargado, setCargado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const leer = () => customFetch('/api/hackrf').then((r) => r.json()).then((j: Estado) => {
    setE(j);
    if (!cargado) { setV({ activo: j.activo, mhz: String(j.mhz), lna: String(j.lna), vga: String(j.vga), amp: j.amp, serie: j.serie }); setCargado(true); }
  }).catch(() => { /* la consola no contesta: se queda lo que había */ });

  useEffect(() => { leer(); const t = setInterval(leer, 15000); return () => clearInterval(t); }, [cargado]);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      const r = await customFetch('/api/hackrf/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: v.activo, mhz: Number(v.mhz.replace(',', '.')), lna: Number(v.lna), vga: Number(v.vga), amp: v.amp, serie: v.serie.trim() }) });
      const j = await r.json();
      if (!r.ok) { setMsg({ ok: false, texto: `No se guardó: ${j.error ?? r.status}.` }); return; }
      setE(j); setV({ ...v, lna: String(j.lna), vga: String(j.vga) }); setMsg({ ok: true, texto: 'Guardado.' });
    } catch { setMsg({ ok: false, texto: 'La consola no contesta.' }); }
  };

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-4" aria-label="HackRF One">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">HackRF One: APRS en VHF y UHF</h3>
        <p className="text-sm text-slate-400">Un HackRF One enchufado a este equipo recibe APRS en FM (1200 baudios) en la frecuencia que escriba: 144,800 MHz, 432,500 MHz o la de la ISS (145,825 MHz). Es un segundo receptor, aparte de la emisora. Solo recibe: la consola nunca lo pone a emitir. No descodifica LoRa (las balizas APRS LoRa+ de 433,775 MHz las reciben los trackers y el iGate).</p>
      </div>

      <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={guardar}>
        <label className="flex items-center gap-3 text-sm text-slate-200 min-h-[44px]">
          <input type="checkbox" className="h-5 w-5" checked={v.activo} onChange={(x) => setV({ ...v, activo: x.target.checked })} id="check-hackrf-activo" /> Recibir APRS con el HackRF
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Frecuencia (MHz)
          <input className={`${campo} font-mono`} value={v.mhz} onChange={(x) => setV({ ...v, mhz: x.target.value })} inputMode="decimal" id="input-hackrf-mhz" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Ganancia de FI (dB)
          <select className={campo} value={v.lna} onChange={(x) => setV({ ...v, lna: x.target.value })} id="select-hackrf-lna">
            {[0, 8, 16, 24, 32, 40].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Ganancia de banda base (dB, de 0 a 62)
          <input className={`${campo} font-mono`} value={v.vga} onChange={(x) => setV({ ...v, vga: x.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" id="input-hackrf-vga" />
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-200 min-h-[44px]">
          <input type="checkbox" className="h-5 w-5" checked={v.amp} onChange={(x) => setV({ ...v, amp: x.target.checked })} id="check-hackrf-amp" /> Amplificador de RF
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">Número de serie (si hay varios; vacío, cualquiera)
          <input className={`${campo} font-mono`} value={v.serie} onChange={(x) => setV({ ...v, serie: x.target.value })} autoComplete="off" spellCheck={false} id="input-hackrf-serie" />
        </label>
        <button type="submit" className="min-h-[44px] rounded-lg bg-sky-600 px-4 font-semibold text-white" id="btn-hackrf-guardar">Guardar</button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-amber-400'}`} role="status">{msg.texto}</p>}

      {e && (
        <div className="rounded-xl border border-slate-700 p-3 text-sm" id="hackrf-estado">
          <p className={e.estado === 'recibiendo' ? 'text-emerald-400' : e.estado === 'apagado' ? 'text-slate-400' : 'text-amber-400'}>
            {e.estado === 'recibiendo' ? `Recibiendo en ${e.mhz} MHz · FI ${e.lna} dB, banda base ${e.vga} dB${e.amp ? ', amplificador encendido' : ''}` : e.estado === 'apagado' ? 'Apagado' : e.estado === 'arrancando' ? 'Arrancando…' : `Sin equipo: ${e.motivo}`}
          </p>
          {e.estado === 'recibiendo' && <p className="text-slate-400">{e.tramas} tramas{e.ultima ? `, la última ${hace(e.ultima)}` : ''}{e.nivel !== null ? ` · nivel del canal ${e.nivel} dB respecto al máximo del HackRF` : ''}. Entran en Tramas y Estaciones como las de radio.{e.muestras === 0 ? ' Aún no llegan muestras del HackRF.' : ''}</p>}
        </div>
      )}
      <p className="text-xs text-slate-400">El HackRF no tiene ganancia automática: si el nivel del canal sin señal pasa de −20 dB, baje la ganancia; si con una estación cercana no sube de −45 dB, súbala. Hace falta el paquete «hackrf» (hackrf_transfer) y permiso para abrir el USB (grupo plugdev).</p>
    </section>
  );
}
