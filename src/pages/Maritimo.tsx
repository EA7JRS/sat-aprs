// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · NAVTEX e Inmarsat-C: radioavisos recibidos con un SDR propio.
//  · NAVTEX: el receptor Navtex (github.com/EA7JRS/Navtex), en este equipo o en la red.
//    Aquí se ven sus mensajes, sus dos receptores, sus ajustes y las estaciones por distancia.
//  · Inmarsat-C EGC (SafetyNET): lo que manda InmarScope por UDP.
// Los avisos que cumplen sus reglas pasan a Avisos y se difunden por APRS.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { haceCuanto } from '../utils/useAvisos';
import { useAdminSession } from '../utils/session';
import { Estado } from '../components/radio/Piezas';
import { TelemetryConfig } from '../types';

interface Navtex { cabecera: string; estacion: string; tema: string; numero: number; freq?: number | null; texto: string; dtg: string | null; recibido: number; incompleto: boolean; posicion: { lat: number; lon: number } | null; clave: string; vigente: boolean }
interface Egc { clave: string; servicio: string; prioridad: string; prioridadEs: string; msgId: number | null; hora: string | null; mhz: number | null; texto: string; recibido: number; posicion: { lat: number; lon: number } | null; vigente: boolean }
interface Datos {
  navtex: { activo: boolean; estaciones: string; url: string; compartePosicion: boolean; red: { error: string | null; consulta: number | null; vivo: number | null; receptor: string | null }; error: string | null; ultimoDato: number | null; temas: Record<string, string>; mensajes: Navtex[] };
  egc: { activo: boolean; escucha: string | null; error: string | null; ultimoDato: number | null; lineas: number; mensajes: Egc[] };
}
interface Receptor {
  url: string; error: string | null; estado: Record<string, string>; ajustes: Record<string, string>; posicionOrigen?: 'gps' | 'manual'; leido: number | null;
  gps: { enabled: boolean; connected: boolean; fix: number | null; age: number | null; lat: number | null; lon: number | null; used: number | null; visible: number | null; hdop: number | null } | null;
}
interface Estacion { area: string; pais: string; nombre: string; khz: 518 | 490 | 4209; letra: string; horas: string[]; alcanceMn: number | null; idioma: string; activa: boolean; fuente: string; km: number | null; mn: number | null; enAlcance: boolean; proxima: number | null; emitiendo: boolean }
interface Estaciones { error: string | null; conPosicion: boolean; fuentes: Array<{ nombre: string; titulo: string; fecha: string; url: string }>; estaciones: Estacion[] }

const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const boton = 'min-h-[44px] px-4 rounded-lg border border-sky-500 bg-sky-900 text-slate-50 font-semibold cursor-pointer hover:bg-sky-800 disabled:opacity-50';
const botonMenor = 'min-h-[40px] px-3 rounded-lg border border-slate-600 text-sm text-slate-200 cursor-pointer hover:border-sky-500 disabled:opacity-50 disabled:cursor-default';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;
const fecha = (t: number) => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
const horaUtc = (t: number) => new Date(t).toISOString().slice(11, 16);
const nombreFreq = (f: number) => `${f === 4209 ? '4209,5' : f} kHz`;
const COLOR_TEMA: Record<string, string> = { D: 'border-red-500 text-red-300', B: 'border-orange-400 text-orange-300', A: 'border-amber-300 text-amber-200', L: 'border-amber-300 text-amber-200' };
const COLOR_PRIORIDAD: Record<string, string> = { Distress: 'border-red-500 text-red-300', Urgency: 'border-orange-400 text-orange-300', Safety: 'border-amber-300 text-amber-200' };

/** Cómo está cada uno de los dos receptores, con lo que dice el propio receptor. */
function estadoReceptor(r: Receptor | null, n: 1 | 2, ahora: number): { ok: boolean | null; texto: string; detalle: string } {
  if (!r) return { ok: null, texto: 'Consultando…', detalle: '' };
  if (r.error) return { ok: false, texto: 'Sin respuesta', detalle: r.error };
  const p = `rx${n}.`;
  const st = r.estado[`${p}state`] || '';
  const vivo = Date.parse(r.estado[`${p}receiver_alive`] || '');
  const fresco = Number.isFinite(vivo) && ahora - vivo < 3 * 60_000;
  const origen = r.estado[`${p}source`] === 'rtlsdr' ? 'RTL-SDR' : r.estado[`${p}source`] === 'sdrplay' ? 'SDRplay' : '';
  const banda = r.estado[`${p}band`] === 'hf' ? '4209,5 kHz' : '518 y 490 kHz';
  const equipo = `${banda}${origen ? ` · ${origen}` : ''}`;
  if (st === 'off') return { ok: null, texto: 'Apagado', detalle: 'se enciende en Receptores' };
  if (st === 'receiving' && fresco) return { ok: true, texto: 'Recibiendo', detalle: equipo };
  if (st === 'starting' || (st === 'receiving' && Number.isFinite(vivo) && ahora - vivo < 6 * 60_000)) return { ok: null, texto: 'Arrancando', detalle: equipo };
  if (st === 'unavailable') return { ok: false, texto: 'Sin equipo', detalle: `${origen || 'equipo'} desconectado o en uso por otro programa` };
  return { ok: false, texto: 'Parado', detalle: st === '' ? 'el servicio no ha arrancado' : 'el servicio está parado' };
}

/** Los ajustes de un receptor. Cada cambio se guarda al momento en el receptor, que lo aplica solo en unos segundos. */
function AjustesReceptor({ n, r, admin, poner, horasOndaCorta }: { n: 1 | 2; r: Receptor; admin: boolean; poner: (clave: string, valor: string) => void; horasOndaCorta: string }) {
  const p = `rx${n}.`;
  const v = (k: string, defecto: string) => (r.ajustes[p + k] !== undefined && r.ajustes[p + k] !== '' ? r.ajustes[p + k] : defecto);
  const equipo = v('source', 'sdrplay');
  const banda = v('band', 'mf');
  // Los campos de texto se guardan al salir de ellos
  const texto = (k: string, rotulo: string, defecto: string, marcador: string, limpiar: (x: string) => string) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">{rotulo}
      <input key={`${k}-${v(k, defecto)}`} className={`${campo} font-mono`} defaultValue={v(k, defecto)} placeholder={marcador} id={`rx${n}-${k}`}
        onBlur={(e) => { const x = limpiar(e.target.value.trim()); if (x !== v(k, defecto)) poner(p + k, x); }} />
    </label>
  );
  const selector = (k: string, rotulo: string, defecto: string, opciones: Array<[string, string]>) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">{rotulo}
      <select className={campo} value={v(k, defecto)} onChange={(e) => poner(p + k, e.target.value)} id={`rx${n}-${k}`}>
        {opciones.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
      </select>
    </label>
  );
  return (
    <fieldset className="flex flex-col gap-3 border border-slate-800 rounded-lg p-3 min-w-0" disabled={!admin} id={`receptor-${n}`}>
      <legend className="px-1 text-slate-100 font-semibold">Receptor {n}</legend>
      <label className="flex items-center gap-2.5 text-slate-100 cursor-pointer">
        <input type="checkbox" className="w-4 h-4" checked={v('enabled', '0') === '1'} onChange={(e) => poner(`${p}enabled`, e.target.checked ? '1' : '0')} id={`rx${n}-enabled`} /> Encendido
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {selector('source', 'Equipo', 'sdrplay', [['sdrplay', 'SDRplay'], ['rtlsdr', 'RTL-SDR']])}
        {selector('band', 'Banda', 'mf', [['mf', '518 y 490 kHz'], ['hf', '4209,5 kHz (onda corta)'], ['auto', 'Por horario: las dos']])}
      </div>
      {banda === 'auto' && (
        <div className="flex flex-col gap-2">
          {texto('hf_slots', 'Horas UTC en onda corta (HHMM, separadas por comas)', '', '0200,0600,1000',
            (x) => x.replace(/[^0-9,]/g, '').split(',').filter((h) => /^([01]\d|2[0-3])[0-5]\d$/.test(h)).slice(0, 36).join(','))}
          <button type="button" className={`${botonMenor} self-start`} disabled={!horasOndaCorta} onClick={() => poner(`${p}hf_slots`, horasOndaCorta)} id={`rx${n}-tomar`}>
            Tomar las horas de las estaciones de onda corta que sigo
          </button>
          <p className="text-[13px] text-slate-400">Escucha 518 y 490 kHz y pasa a 4209,5 kHz en cada hora indicada, desde un minuto antes hasta once después. Mientras está en onda corta no recibe las otras dos.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {equipo === 'sdrplay' ? selector('port', 'Toma de antena (RSPdx)', 'A', [['A', 'A'], ['B', 'B'], ['C', 'C']]) : (
          <>
            {texto('serial', 'Número de serie (si hay varios)', '', 'cualquiera', (x) => x.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32))}
            {selector('direct', 'Muestreo directo', 'auto', [['auto', 'Automático, según el modelo'], ['2', 'Rama Q'], ['1', 'Rama I'], ['0', 'Apagado (conversor)']])}
            {texto('upconv', 'Conversor externo (Hz; 0 = ninguno)', '0', '0', (x) => x.replace(/\D/g, '').slice(0, 10) || '0')}
            {texto('gain', 'Ganancia (dB, o auto)', 'auto', 'auto', (x) => (/^\d{1,2}(\.\d)?$/.test(x) ? x : 'auto'))}
            {texto('ppm', 'Corrección (ppm)', '0', '0', (x) => (/^-?\d{1,3}$/.test(x) ? x : '0'))}
          </>
        )}
      </div>
      <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
        <input type="checkbox" className="w-4 h-4" checked={v('bias', '0') === '1'} onChange={(e) => poner(`${p}bias`, e.target.checked ? '1' : '0')} id={`rx${n}-bias`} />
        Alimentar la antena por el coaxial{equipo === 'sdrplay' ? ' (RSPdx: solo en la toma B)' : ' (si el equipo lo permite)'}
      </label>
    </fieldset>
  );
}

export default function Maritimo({ config, onGuardar }: { config: TelemetryConfig; onGuardar: (c: Partial<TelemetryConfig>) => Promise<boolean> }) {
  const { isAdmin } = useAdminSession();
  const [d, setD] = useState<Datos | null>(null);
  const [rx, setRx] = useState<Receptor | null>(null);
  const [est, setEst] = useState<Estaciones | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [ver, setVer] = useState<'navtex' | 'estaciones' | 'receptores' | 'egc'>('navtex');
  const [tema, setTema] = useState('');
  const [banda, setBanda] = useState<518 | 490 | 4209>(518);
  const [todas, setTodas] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [v, setV] = useState(() => ({
    navtexEnabled: config.navtexEnabled === true, navtexUrl: config.navtexUrl ?? '', navtexEstaciones: config.navtexEstaciones ?? '', navtexPosicion: config.navtexPosicion !== false,
    egcEnabled: config.egcEnabled === true, egcEscucha: config.egcEscucha ?? '127.0.0.1', egcPuerto: String(config.egcPuerto ?? 5556),
  }));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [msgRx, setMsgRx] = useState<{ ok: boolean; texto: string } | null>(null);

  const activo = d?.navtex.activo === true;
  const leerReceptor = useCallback(() => customFetch('/api/navtex/receptor').then((r) => r.json()).then(setRx).catch(() => { /* se reintenta */ }), []);
  const leerEstaciones = useCallback(() => customFetch('/api/navtex/estaciones').then((r) => r.json()).then(setEst).catch(() => { /* se reintenta */ }), []);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/maritimo').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setD(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  // El receptor y sus estaciones solo se consultan con NAVTEX encendido
  useEffect(() => {
    if (!activo) { setRx(null); setEst(null); return; }
    void leerReceptor(); void leerEstaciones();
    const t1 = setInterval(leerReceptor, 5000);
    const t2 = setInterval(leerEstaciones, 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [activo, d?.navtex.url, leerReceptor, leerEstaciones]);

  const navtex = useMemo(() => (d?.navtex.mensajes ?? []).filter((m) => !tema || m.tema === tema), [d, tema]);
  const seguidas = useMemo(() => new Set((d?.navtex.estaciones ?? '').toUpperCase().replace(/[^A-Z]/g, '').split('')), [d]);
  const seSigue = useCallback((letra: string) => seguidas.size === 0 || seguidas.has(letra), [seguidas]);
  const lista = est?.estaciones ?? [];
  const deBanda = useMemo(() => lista.filter((e) => e.khz === banda), [lista, banda]);
  const proximas = useMemo(() => lista.filter((e) => e.activa && e.proxima !== null && seSigue(e.letra) && (!est?.conPosicion || e.enAlcance))
    .sort((a, b) => a.proxima! - b.proxima!).slice(0, 8), [lista, seSigue, est?.conPosicion]);
  const horasOndaCorta = useMemo(() => [...new Set(lista.filter((e) => e.khz === 4209 && e.activa && seSigue(e.letra)).flatMap((e) => e.horas))].sort().slice(0, 36).join(','), [lista, seSigue]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onGuardar({ ...v, egcPuerto: Number(v.egcPuerto) });
    setMsg(ok ? { ok: true, texto: 'Guardado.' } : { ok: false, texto: 'No se pudo guardar.' });
  };
  const seguir = async (letras: string) => {
    const ok = await onGuardar({ navtexEstaciones: letras });
    if (ok) setV((x) => ({ ...x, navtexEstaciones: letras }));
    if (ok) setD((x) => (x ? { ...x, navtex: { ...x.navtex, estaciones: letras } } : x));
    setMsgRx(ok ? null : { ok: false, texto: 'No se pudo guardar.' });
  };
  const alternarLetra = (letra: string) => {
    // Sin letras se siguen todas: al quitar una, quedan las demás escritas
    const actuales = seguidas.size ? [...seguidas] : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const nuevas = actuales.includes(letra) ? actuales.filter((l) => l !== letra) : [...actuales, letra];
    void seguir(nuevas.length === 26 ? '' : nuevas.sort().join(''));
  };
  const poner = async (clave: string, valor: string) => {
    try {
      const r = await customFetch('/api/navtex/ajuste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, valor }) });
      const j = await r.json().catch(() => ({}));
      setMsgRx(r.ok ? { ok: true, texto: 'Guardado: el receptor lo aplica en unos segundos.' } : { ok: false, texto: j.error || 'No se pudo guardar.' });
    } catch { setMsgRx({ ok: false, texto: 'No se pudo guardar.' }); }
    void leerReceptor();
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
  const navtexVivo = n.activo && !n.error && !!n.ultimoDato && ahora - n.ultimoDato < 5 * 60_000;
  const egcVivo = g.activo && !g.error && !!g.ultimoDato && ahora - g.ultimoDato < 30 * 60_000;
  const temasVistos = [...new Set(n.mensajes.map((m) => m.tema))].sort();
  const rx1 = estadoReceptor(rx, 1, ahora), rx2 = estadoReceptor(rx, 2, ahora);
  const version = rx?.estado.version ? `Navtex ${rx.estado.version}` : 'Navtex';
  const enAlcance = [...new Set(lista.filter((e) => e.activa && e.enAlcance).map((e) => e.letra))].sort().join('');
  const visibles = todas || !est?.conPosicion ? deBanda : deBanda.slice(0, 10);
  const gps = rx?.gps ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · NAVTEX e Inmarsat-C</h1>

      <section aria-label="Estado" className="flex flex-wrap gap-3">
        <Estado id="mar-navtex" titulo="NAVTEX" ok={!n.activo ? null : navtexVivo}
          texto={!n.activo ? 'Apagado' : n.error ? 'Sin receptor' : navtexVivo ? 'Escuchando' : n.red.consulta ? 'Receptor parado' : 'Consultando…'}
          detalle={!n.activo ? 'se enciende abajo' : n.error ? `${n.url || 'sin dirección'}: ${n.error}`
            : `${version} en ${n.url}${n.ultimoDato ? ` · muestras ${haceCuanto(n.ultimoDato, ahora)}` : ' · contesta, pero no está recibiendo'}`} />
        {n.activo && !n.error && (
          <>
            <Estado id="mar-rx1" titulo="Receptor 1" ok={rx1.ok} texto={rx1.texto} detalle={rx1.detalle} />
            <Estado id="mar-rx2" titulo="Receptor 2" ok={rx2.ok} texto={rx2.texto} detalle={rx2.detalle} />
          </>
        )}
        <Estado id="mar-egc" titulo="Inmarsat-C EGC" ok={!g.activo ? null : g.error ? false : egcVivo}
          texto={!g.activo ? 'Apagado' : g.error ? 'Sin escucha' : egcVivo ? 'Recibiendo' : 'Escuchando'}
          detalle={!g.activo ? 'se enciende abajo' : g.error ? g.error : `UDP ${g.escucha ?? '—'}${g.ultimoDato ? ` · último mensaje ${haceCuanto(g.ultimoDato, ahora)}` : ' · aún sin mensajes de InmarScope'}`} />
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Qué ver">
        <button type="button" className={pastilla(ver === 'navtex')} aria-pressed={ver === 'navtex'} onClick={() => setVer('navtex')} id="ver-navtex">NAVTEX · {n.mensajes.length}</button>
        <button type="button" className={pastilla(ver === 'estaciones')} aria-pressed={ver === 'estaciones'} onClick={() => setVer('estaciones')} id="ver-estaciones">Estaciones</button>
        <button type="button" className={pastilla(ver === 'receptores')} aria-pressed={ver === 'receptores'} onClick={() => setVer('receptores')} id="ver-receptores">Receptores</button>
        <button type="button" className={pastilla(ver === 'egc')} aria-pressed={ver === 'egc'} onClick={() => setVer('egc')} id="ver-egc">Inmarsat-C · {g.mensajes.length}</button>
      </div>

      {ver === 'navtex' && (
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
                    <span className="text-[13px] text-slate-400">estación {m.estacion}{m.freq ? ` · ${m.freq === 4209 ? '4209,5' : m.freq} kHz` : ''} · {fecha(m.recibido)}{m.incompleto ? ' · cortado' : ''}{m.vigente ? '' : ' · ya no vigente'}{m.posicion ? ` · ${m.posicion.lat.toFixed(3)}, ${m.posicion.lon.toFixed(3)}` : ''}</span>
                    <span className="basis-full text-[13px] text-slate-300 truncate">{m.texto.split('\n').find((l) => l.trim() && !/^\d{6} ?UTC/.test(l)) ?? ''}</span>
                  </button>
                  {abierto === m.clave && <pre className="px-3 pb-3 text-[13px] text-slate-200 whitespace-pre-wrap break-words font-mono">{m.texto}</pre>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[13px] text-slate-400">Los temas A, B, D y L (avisos a los navegantes, meteorológicos y de salvamento) pasan a Avisos; los demás solo se muestran. Un mensaje vale 12 horas desde la última vez que se recibe.</p>
        </Tarjeta>
      )}

      {ver === 'estaciones' && (
        <>
          <Tarjeta aria-label="Próximas emisiones" className="flex flex-col gap-3" id="mar-proximas">
            <h2 className="text-lg font-semibold text-slate-100">Próximas emisiones {est?.conPosicion ? 'en alcance' : ''} de las estaciones que sigo</h2>
            {!n.activo ? <p className="text-sm text-slate-400">NAVTEX está apagado.</p>
              : est?.error ? <p className="text-sm text-amber-300">No se pudo leer la tabla de estaciones: {est.error}.</p>
              : !est ? <p className="text-sm text-slate-400">Consultando…</p>
              : proximas.length === 0 ? <p className="text-sm text-slate-400">Ninguna de las estaciones que sigue queda en alcance.</p> : (
                <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                  {proximas.map((e) => (
                    <li key={`${e.khz}-${e.letra}-${e.nombre}`} className="flex items-baseline gap-3 text-sm">
                      <span className="font-mono text-slate-100 tabular-nums">{horaUtc(e.proxima!)}</span>
                      <span className="border border-slate-600 rounded px-1.5 font-mono text-xs font-bold text-slate-200">{e.letra}</span>
                      <span className="text-slate-200 min-w-0 truncate">{e.nombre}</span>
                      <span className="text-[13px] text-slate-400 whitespace-nowrap">{nombreFreq(e.khz)}{e.emitiendo ? ' · emitiendo ahora' : ''}</span>
                    </li>
                  ))}
                </ol>
              )}
            <p className="text-[13px] text-slate-400">Horas UTC. Cada estación emite diez minutos en su turno, cada cuatro horas.</p>
          </Tarjeta>

          <Tarjeta aria-label="Estaciones" className="flex flex-col gap-3" id="mar-estaciones">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Estaciones {est?.conPosicion ? 'por distancia' : ''}</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Frecuencia">
                {([518, 490, 4209] as const).map((f) => <button key={f} type="button" className={pastilla(banda === f)} aria-pressed={banda === f} onClick={() => { setBanda(f); setTodas(false); }} id={`banda-${f}`}>{nombreFreq(f)}</button>)}
              </div>
            </div>
            {est && !est.error && !est.conPosicion && <p className="text-sm text-amber-300">La consola no tiene todavía una posición propia (GPS o fija): las estaciones salen sin distancia.</p>}
            {est && !est.error && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" id="tabla-estaciones">
                  <thead className="text-left text-[13px] text-slate-400">
                    <tr><th className="py-1.5 pr-3 font-normal">Letra</th><th className="py-1.5 pr-3 font-normal">Estación</th><th className="py-1.5 pr-3 font-normal text-right">Distancia</th><th className="py-1.5 pr-3 font-normal text-right">Alcance</th><th className="py-1.5 pr-3 font-normal">Próxima</th><th className="py-1.5 font-normal">Avisos</th></tr>
                  </thead>
                  <tbody>
                    {visibles.map((e) => (
                      <tr key={`${e.letra}-${e.nombre}`} className="border-t border-slate-800">
                        <td className="py-2 pr-3 font-mono font-bold text-slate-100">{e.letra}</td>
                        <td className="py-2 pr-3 text-slate-200">{e.nombre}<span className="block text-[13px] text-slate-400">{e.pais}{e.idioma ? ` · ${e.idioma}` : ''}{e.activa ? '' : ' · no operativa'}</span></td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-200 whitespace-nowrap">{e.mn === null ? '—' : <>{e.mn} mn<span className="block text-[13px] text-slate-400">{e.km} km</span></>}</td>
                        <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{e.alcanceMn === null ? <span className="text-slate-400">—</span> : <>{e.alcanceMn} mn<span className={`block text-[13px] ${e.enAlcance ? 'text-emerald-400' : 'text-slate-400'}`}>{e.mn === null ? '' : e.enAlcance ? 'en alcance' : 'fuera'}</span></>}</td>
                        <td className="py-2 pr-3 font-mono tabular-nums text-slate-200 whitespace-nowrap">{e.proxima === null ? '—' : horaUtc(e.proxima)}{e.emitiendo && <span className="block font-sans text-[13px] text-emerald-400">emitiendo</span>}</td>
                        <td className="py-2">
                          <button type="button" className={pastilla(seSigue(e.letra))} aria-pressed={seSigue(e.letra)} disabled={!isAdmin} onClick={() => alternarLetra(e.letra)} id={`seguir-${e.khz}-${e.letra}`}>{seSigue(e.letra) ? 'Se sigue' : 'No'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {est && !est.error && (
              <div className="flex flex-wrap items-center gap-2">
                {est.conPosicion && deBanda.length > 10 && <button type="button" className={botonMenor} onClick={() => setTodas(!todas)} id="ver-todas">{todas ? 'Ver solo las diez más cercanas' : `Ver las ${deBanda.length} de ${nombreFreq(banda)}`}</button>}
                {est.conPosicion && enAlcance && <button type="button" className={botonMenor} disabled={!isAdmin} onClick={() => void seguir(enAlcance)} id="seguir-alcance">Seguir solo las que quedan en alcance ({enAlcance})</button>}
                {seguidas.size > 0 && <button type="button" className={botonMenor} disabled={!isAdmin} onClick={() => void seguir('')} id="seguir-todas">Seguir todas</button>}
              </div>
            )}
            <p className="text-[13px] text-slate-400">
              La distancia se mide desde la posición de la consola; el alcance es el que declara cada estación (de noche llegan de más lejos). Seguir una letra hace que sus avisos de los temas A, B, D y L pasen a Avisos;
              vale para las tres frecuencias y para todas las estaciones que comparten esa letra. Las estaciones activas se ven también en el Mapa, en la capa «Estaciones NAVTEX».
              {est && est.fuentes.length > 0 && <> Datos: {est.fuentes.map((f) => `${f.titulo} (${f.nombre}, ${f.fecha})`).join('; ')}.</>}
            </p>
          </Tarjeta>
        </>
      )}

      {ver === 'receptores' && (
        <Tarjeta aria-label="Receptores NAVTEX" className="flex flex-col gap-3" id="mar-receptores">
          <h2 className="text-lg font-semibold text-slate-100">Receptores NAVTEX</h2>
          {!n.activo ? <p className="text-sm text-slate-400">NAVTEX está apagado.</p>
            : !rx ? <p className="text-sm text-slate-400">Consultando…</p>
            : rx.error ? <p className="text-sm text-amber-300">El receptor no contesta en {rx.url || 'ninguna dirección'}: {rx.error}.</p> : (
              <>
                <p className="text-[13px] text-slate-400">
                  Hay dos receptores. Cada uno usa un equipo y escucha una banda: 518 y 490 kHz a la vez, o 4209,5 kHz. Con dos equipos se reciben las tres frecuencias a la vez; con uno solo, puede alternar por horario.
                  Un equipo solo lo puede usar un programa a la vez: «Sin equipo» es que está desconectado o lo tiene otro programa (SDRconnect, SDR++…); el receptor lo sigue intentando cada 15 segundos.
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <AjustesReceptor n={1} r={rx} admin={isAdmin} poner={poner} horasOndaCorta={horasOndaCorta} />
                  <AjustesReceptor n={2} r={rx} admin={isAdmin} poner={poner} horasOndaCorta={horasOndaCorta} />
                </div>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm" id="mar-rx-datos">
                  {(['518', '490', '4209'] as const).map((f) => {
                    const t = Date.parse(rx.estado[`phasing_${f}`] || '');
                    return <div key={f}><dt className="text-[13px] text-slate-400">Última señal en {nombreFreq(Number(f))}</dt><dd className="text-slate-100">{Number.isFinite(t) ? haceCuanto(t, ahora) : 'ninguna todavía'}</dd></div>;
                  })}
                  <div><dt className="text-[13px] text-slate-400">GPS del receptor</dt>
                    <dd className="text-slate-100">{!gps || !gps.enabled ? 'sin gpsd' : !gps.connected ? 'gpsd no contesta' : gps.lat === null ? 'sin posición todavía' : `con posición${gps.used !== null ? ` · ${gps.used} satélites` : ''}`}</dd></div>
                </dl>
                <p className="text-[13px] text-slate-400">
                  {gps && gps.lat !== null ? 'El receptor tiene su propio GPS y usa esa posición.' : n.compartePosicion ? 'El receptor no tiene posición de GPS: la consola le da la de la estación.' : 'El receptor no tiene posición de GPS y la consola no le da la suya (se cambia abajo).'}
                  {!isAdmin && ' Con la sesión de administrador se cambian estos ajustes.'}
                </p>
                {msgRx && <p className={`text-sm ${msgRx.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{msgRx.texto}</p>}
              </>
            )}
        </Tarjeta>
      )}

      {ver === 'egc' && (
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
        <h2 className="text-lg font-semibold text-slate-100">Entradas</h2>
        <form className="flex flex-col gap-4" onSubmit={guardar}>
          <fieldset className="flex flex-col gap-2" disabled={!isAdmin}>
            <label className="flex items-center gap-2.5 text-slate-100 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={v.navtexEnabled} onChange={(e) => setV({ ...v, navtexEnabled: e.target.checked })} id="check-navtex" /> NAVTEX</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-slate-300">Dirección del receptor Navtex
                <input className={`${campo} font-mono`} value={v.navtexUrl} onChange={(e) => setV({ ...v, navtexUrl: e.target.value })} placeholder="http://127.0.0.1:8081" id="input-navtex-url" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">Estaciones que se siguen (letras; vacío, todas)
                <input className={`${campo} font-mono`} value={v.navtexEstaciones} onChange={(e) => setV({ ...v, navtexEstaciones: e.target.value })} placeholder="todas" id="input-navtex-estaciones" />
              </label>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={v.navtexPosicion} onChange={(e) => setV({ ...v, navtexPosicion: e.target.checked })} id="check-navtex-posicion" /> Dar al receptor la posición de la estación cuando él no tiene GPS</label>
            <p className="text-[13px] text-slate-400">
              El receptor es el programa <span className="font-mono">Navtex</span> (github.com/EA7JRS/Navtex), con un SDRplay o un RTL-SDR. En este mismo equipo se instala con{' '}
              <span className="font-mono">sudo sh tools/instalar-navtex.sh</span>, que deja puesta esta dirección; si está en otro equipo de la red, escriba la suya (por ejemplo <span className="font-mono">http://sdr.local:8080</span>).
              La consola le pregunta cada minuto por los mensajes nuevos.
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
