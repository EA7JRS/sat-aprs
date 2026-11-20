// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · NAVTEX e Inmarsat-C: radioavisos recibidos con un SDR propio.
//  · NAVTEX: lo que escribe el descodificador (tools/navtex/navtex.sh).
//  · Inmarsat-C EGC (SafetyNET): lo que manda InmarScope por UDP.
// Los avisos que cumplen sus reglas pasan a Avisos y se difunden por APRS.
import React, { useEffect, useMemo, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { haceCuanto } from '../utils/useAvisos';
import { useAdminSession } from '../utils/session';
import { Estado } from '../components/radio/Piezas';
import { TelemetryConfig } from '../types';

interface Navtex { cabecera: string; estacion: string; tema: string; numero: number; texto: string; dtg: string | null; recibido: number; incompleto: boolean; posicion: { lat: number; lon: number } | null; clave: string; vigente: boolean }
interface Egc { clave: string; servicio: string; prioridad: string; prioridadEs: string; msgId: number | null; hora: string | null; mhz: number | null; texto: string; recibido: number; posicion: { lat: number; lon: number } | null; vigente: boolean }
interface Datos {
  navtex: { activo: boolean; archivo: string; estaciones: string; error: string | null; ultimoDato: number | null; caracteres: number; abierto: string | null; temas: Record<string, string>; mensajes: Navtex[] };
  egc: { activo: boolean; escucha: string | null; error: string | null; ultimoDato: number | null; lineas: number; mensajes: Egc[] };
}

const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const boton = 'min-h-[44px] px-4 rounded-lg border border-sky-500 bg-sky-900 text-slate-50 font-semibold cursor-pointer hover:bg-sky-800 disabled:opacity-50';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;
const fecha = (t: number) => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
const COLOR_TEMA: Record<string, string> = { D: 'border-red-500 text-red-300', B: 'border-orange-400 text-orange-300', A: 'border-amber-300 text-amber-200', L: 'border-amber-300 text-amber-200' };
const COLOR_PRIORIDAD: Record<string, string> = { Distress: 'border-red-500 text-red-300', Urgency: 'border-orange-400 text-orange-300', Safety: 'border-amber-300 text-amber-200' };

export default function Maritimo({ config, onGuardar }: { config: TelemetryConfig; onGuardar: (c: Partial<TelemetryConfig>) => Promise<boolean> }) {
  const { isAdmin } = useAdminSession();
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [ver, setVer] = useState<'navtex' | 'egc'>('navtex');
  const [tema, setTema] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [v, setV] = useState(() => ({
    navtexEnabled: config.navtexEnabled === true, navtexArchivo: config.navtexArchivo ?? '/var/lib/sat-aprs/navtex.txt', navtexEstaciones: config.navtexEstaciones ?? '',
    egcEnabled: config.egcEnabled === true, egcEscucha: config.egcEscucha ?? '127.0.0.1', egcPuerto: String(config.egcPuerto ?? 5556),
  }));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/maritimo').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setD(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const navtex = useMemo(() => (d?.navtex.mensajes ?? []).filter((m) => !tema || m.tema === tema), [d, tema]);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onGuardar({ ...v, egcPuerto: Number(v.egcPuerto) });
    setMsg(ok ? { ok: true, texto: 'Guardado.' } : { ok: false, texto: 'No se pudo guardar.' });
  };

  if (!d) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · NAVTEX e Inmarsat-C</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }
  const n = d.navtex; const g = d.egc;
  const navtexVivo = n.activo && !n.error && !!n.ultimoDato && ahora - n.ultimoDato < 10 * 60_000;
  const egcVivo = g.activo && !g.error && !!g.ultimoDato && ahora - g.ultimoDato < 30 * 60_000;
  const temasVistos = [...new Set(n.mensajes.map((m) => m.tema))].sort();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · NAVTEX e Inmarsat-C</h1>

      <section aria-label="Estado" className="flex flex-wrap gap-3">
        <Estado id="mar-navtex" titulo="NAVTEX (SDR)" ok={!n.activo ? null : navtexVivo}
          texto={!n.activo ? 'Apagado' : n.error ? 'Sin descodificador' : navtexVivo ? (n.abierto ? `Recibiendo ${n.abierto}` : 'Escuchando') : 'Sin caracteres'}
          detalle={!n.activo ? 'se enciende abajo' : n.error ? `${n.archivo}: ${n.error}` : n.ultimoDato ? `${n.archivo} · último carácter ${haceCuanto(n.ultimoDato, ahora)}` : n.archivo} />
        <Estado id="mar-egc" titulo="Inmarsat-C EGC" ok={!g.activo ? null : g.error ? false : egcVivo}
          texto={!g.activo ? 'Apagado' : g.error ? 'Sin escucha' : egcVivo ? 'Recibiendo' : 'Escuchando'}
          detalle={!g.activo ? 'se enciende abajo' : g.error ? g.error : `UDP ${g.escucha ?? '—'}${g.ultimoDato ? ` · último mensaje ${haceCuanto(g.ultimoDato, ahora)}` : ' · aún sin mensajes de InmarScope'}`} />
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué ver">
        <button type="button" className={pastilla(ver === 'navtex')} aria-pressed={ver === 'navtex'} onClick={() => setVer('navtex')}>NAVTEX · {n.mensajes.length}</button>
        <button type="button" className={pastilla(ver === 'egc')} aria-pressed={ver === 'egc'} onClick={() => setVer('egc')}>Inmarsat-C · {g.mensajes.length}</button>
      </div>

      {ver === 'navtex' ? (
        <Tarjeta aria-label="Mensajes NAVTEX" className="flex flex-col gap-3" id="mar-lista-navtex">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-100">Mensajes NAVTEX</h2>
            {temasVistos.length > 1 && (
              <select className={`${campo} sm:w-72`} value={tema} onChange={(e) => setTema(e.target.value)} aria-label="Tema">
                <option value="">Todos los temas</option>
                {temasVistos.map((t) => <option key={t} value={t}>{t} · {n.temas[t] ?? t}</option>)}
              </select>
            )}
          </div>
          {navtex.length === 0 ? <p className="text-sm text-slate-400">{n.activo ? 'Todavía no ha llegado ningún mensaje completo.' : 'NAVTEX está apagado.'}</p> : (
            <ul className="flex flex-col gap-2">
              {navtex.map((m) => (
                <li key={m.clave} className="border border-slate-800 rounded-lg">
                  <button type="button" className="w-full text-left p-3 cursor-pointer hover:bg-slate-800/50 flex flex-wrap items-baseline gap-x-3 gap-y-1" onClick={() => setAbierto(abierto === m.clave ? null : m.clave)} aria-expanded={abierto === m.clave}>
                    <span className={`border rounded px-1.5 font-mono text-xs font-bold ${COLOR_TEMA[m.tema] ?? 'border-slate-600 text-slate-300'}`}>{m.cabecera}</span>
                    <span className="text-slate-100 font-semibold">{n.temas[m.tema] ?? m.tema}</span>
                    <span className="text-[13px] text-slate-400">estación {m.estacion} · {fecha(m.recibido)}{m.incompleto ? ' · cortado' : ''}{m.vigente ? '' : ' · ya no vigente'}{m.posicion ? ` · ${m.posicion.lat.toFixed(3)}, ${m.posicion.lon.toFixed(3)}` : ''}</span>
                    <span className="basis-full text-[13px] text-slate-300 truncate">{m.texto.split('\n').find((l) => l.trim() && !/^\d{6} ?UTC/.test(l)) ?? ''}</span>
                  </button>
                  {abierto === m.clave && <pre className="px-3 pb-3 text-[13px] text-slate-200 whitespace-pre-wrap break-words font-mono">{m.texto}</pre>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[13px] text-slate-400">Los temas A, B, D y L (avisos a los navegantes, meteorológicos y de salvamento) pasan a Avisos; los demás solo se muestran. Un mensaje vale 12 horas desde la última vez que se recibe.</p>
        </Tarjeta>
      ) : (
        <Tarjeta aria-label="Mensajes Inmarsat-C" className="flex flex-col gap-3" id="mar-lista-egc">
          <h2 className="text-lg font-semibold text-slate-100">Mensajes EGC (SafetyNET)</h2>
          {g.mensajes.length === 0 ? <p className="text-sm text-slate-400">{g.activo ? 'Todavía no ha llegado ningún mensaje de InmarScope.' : 'La entrada EGC está apagada.'}</p> : (
            <ul className="flex flex-col gap-2">
              {g.mensajes.map((m) => (
                <li key={m.clave} className="border border-slate-800 rounded-lg">
                  <button type="button" className="w-full text-left p-3 cursor-pointer hover:bg-slate-800/50 flex flex-wrap items-baseline gap-x-3 gap-y-1" onClick={() => setAbierto(abierto === m.clave ? null : m.clave)} aria-expanded={abierto === m.clave}>
                    <span className={`border rounded px-1.5 text-xs font-bold ${COLOR_PRIORIDAD[m.prioridad] ?? 'border-slate-600 text-slate-300'}`}>{m.prioridadEs}</span>
                    <span className="text-slate-100 font-semibold">{m.servicio.replace(/^SafetyNET,\s*/i, '')}</span>
                    <span className="text-[13px] text-slate-400">{fecha(m.recibido)}{m.msgId ? ` · n.º ${m.msgId}` : ''}{m.mhz ? ` · ${m.mhz.toFixed(4)} MHz` : ''}{m.vigente ? '' : ' · ya no vigente'}</span>
                    <span className="basis-full text-[13px] text-slate-300 truncate">{m.texto.split('\n')[0]}</span>
                  </button>
                  {abierto === m.clave && <pre className="px-3 pb-3 text-[13px] text-slate-200 whitespace-pre-wrap break-words font-mono">{m.texto}</pre>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[13px] text-slate-400">Socorro y urgencia pasan a Avisos de serie (nivel rojo y naranja); seguridad, amarillo; rutina solo se muestra. Si el texto trae una posición, el objeto APRS va allí.</p>
        </Tarjeta>
      )}

      <Tarjeta aria-label="Ajustes" className="flex flex-col gap-3" id="mar-ajustes">
        <h2 className="text-lg font-semibold text-slate-100">Receptores</h2>
        <form className="flex flex-col gap-4" onSubmit={guardar}>
          <fieldset className="flex flex-col gap-2" disabled={!isAdmin}>
            <label className="flex items-center gap-2.5 text-slate-100 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={v.navtexEnabled} onChange={(e) => setV({ ...v, navtexEnabled: e.target.checked })} id="check-navtex" /> NAVTEX</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="md:col-span-2 flex flex-col gap-1 text-sm text-slate-300">Archivo del descodificador
                <input className={`${campo} font-mono`} value={v.navtexArchivo} onChange={(e) => setV({ ...v, navtexArchivo: e.target.value })} id="input-navtex-archivo" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">Estaciones que se siguen (letra)
                <input className={`${campo} font-mono`} value={v.navtexEstaciones} onChange={(e) => setV({ ...v, navtexEstaciones: e.target.value })} placeholder="todas" id="input-navtex-estaciones" />
              </label>
            </div>
            <p className="text-[13px] text-slate-400">
              El receptor es <span className="font-mono">tools/navtex/navtex.sh</span> (servicio <span className="font-mono">sat-navtex</span>): RTL-SDR con rtl_fm o SDRplay RSPdx-R2 con rx_fm, en USB 1 kHz por debajo de 518 kHz, y el descodificador de fldigi. De noche llegan estaciones lejanas: indique las letras de las que le interesan.
            </p>
          </fieldset>
          <fieldset className="flex flex-col gap-2 border-t border-slate-800 pt-3" disabled={!isAdmin}>
            <label className="flex items-center gap-2.5 text-slate-100 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={v.egcEnabled} onChange={(e) => setV({ ...v, egcEnabled: e.target.checked })} id="check-egc" /> Inmarsat-C EGC</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-sm text-slate-300">Escucha en
                <input className={`${campo} font-mono`} value={v.egcEscucha} onChange={(e) => setV({ ...v, egcEscucha: e.target.value })} id="input-egc-escucha" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">Puerto UDP
                <input className={`${campo} font-mono`} inputMode="numeric" value={v.egcPuerto} onChange={(e) => setV({ ...v, egcPuerto: e.target.value })} id="input-egc-puerto" />
              </label>
            </div>
            <p className="text-[13px] text-slate-400">
              El descodificador es InmarScope (RTL-SDR, SDRplay, Airspy…, con una antena de banda L hacia el satélite). En su salida de mensajes, active el envío por UDP a esta dirección y puerto con formato JSON; 5556 es el puerto que trae de serie.
            </p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={boton} disabled={!isAdmin} id="mar-guardar">Guardar</button>
            {!isAdmin && <span className="text-[13px] text-slate-400">Con la sesión de administrador se encienden y se ajustan. Radio, nivel mínimo y repetición: desde el aviso, en Avisos.</span>}
            {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{msg.texto}</span>}
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
