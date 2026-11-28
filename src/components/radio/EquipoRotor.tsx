// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Principal: equipo de radio por CAT (rigctld) y rotor (rotctld o la
// caja APRS LoRa+ Rotor). Solo enseña lo que el equipo y el rotor dicen.
import React, { useEffect, useRef, useState } from 'react';
import { Tarjeta } from '../shell/Etiquetas';
import { customFetch } from '../../utils/customFetch';
import { TelemetryConfig } from '../../types';

type Guardar = (cambios: Partial<TelemetryConfig>) => Promise<boolean>;

export interface DatosEquipo {
  equipo: {
    activo: boolean; destino: string; enlace: boolean; error: string; frecuenciaHz: number | null; modo: string | null; anchoHz: number | null;
    vfo: string | null; ptt: boolean | null; senalDb: number | null; senal: { s: number; sobre: number; texto: string } | null; modelo: string; modos: string[];
  };
  rotor: {
    modo: 'off' | 'rotctld' | 'caja'; destino: string; pinGuardado: boolean; enlace: boolean; error: string; az: number | null; el: number | null;
    objetivoAz: number | null; objetivoEl: number | null; moviendo: boolean | null; fallo: string; tieneElevacion: boolean | null; nombre: string;
    /** El rotor va en un vehículo o barco: se trabaja en acimut verdadero. */
    movil: boolean; azVerdadero: number | null; objetivoVerdadero: number | null;
    /** La caja tiene GPS propio y su posición está congelada por el filtro de equipo parado («fijo»). */
    gps: boolean; fijo: boolean;
    /** Compensación de actitud de la caja (escora / cabeceo / giro del mástil); null si no la da. */
    actitud: { on: boolean; roll: number; pitch: number; yaw: number; viejo: boolean } | null;
  };
  estacion: { gps: boolean; lat: number; lon: number; velocidadKmh: number; proa: number | null; proaCuando: number | null };
  seguimiento: null | {
    objetivo: { tipo: 'aprs' | 'barco' | 'avion' | 'ultima' | 'punto' | 'sol' | 'luna'; indicativo?: string; nombre?: string };
    ok: boolean; espera?: string; nombre: string; azVerdadero?: number; elevacion?: number; azRotor?: number; distanciaKm?: number; estimada?: boolean;
  };
}

const campo = 'w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-100 text-[15px]';
const boton = 'min-h-[44px] px-3.5 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';
const botonActivo = 'min-h-[44px] px-3.5 rounded-lg border border-sky-500 bg-sky-950 text-slate-100 font-semibold cursor-pointer';
const botonPrincipal = 'min-h-[44px] px-5 rounded-lg bg-sky-500 text-slate-950 font-bold cursor-pointer hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed';
const enlaceTexto = 'text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer';

export async function ordenRadio(ruta: 'equipo' | 'rotor', cuerpo: Record<string, unknown>): Promise<string> {
  try {
    const r = await customFetch(`/api/radio/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    if (r.ok) return '';
    const j = await r.json().catch(() => ({}));
    return j.error || 'No se pudo ejecutar la orden.';
  } catch {
    return 'Sin conexión con la consola.';
  }
}

/** Frecuencia en Hz como «14.205.000». */
export function frecuenciaLegible(hz: number): string {
  return Math.round(hz).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Frecuencia de llamada o centro de actividad de cada banda, en kHz
const BANDAS: Array<[string, number, number, number]> = [
  ['160 m', 1800, 2000, 1840], ['80 m', 3500, 3800, 3700], ['40 m', 7000, 7200, 7100], ['30 m', 10100, 10150, 10120],
  ['20 m', 14000, 14350, 14200], ['17 m', 18068, 18168, 18120], ['15 m', 21000, 21450, 21250], ['12 m', 24890, 24990, 24940],
  ['10 m', 28000, 29700, 28400], ['6 m', 50000, 52000, 50150], ['2 m', 144000, 146000, 144300], ['70 cm', 430000, 440000, 432200],
];

// S-meter como el del rotor, el Display y la app Android (SMeterBar): colores
// IARU, 9 tramos S y 6 sobre S9 algo más altos, los apagados al 15 %.
const COLORES_S = ['#4FC3E0', '#52D4C0', '#5BDFA0', '#72E688', '#96EA74', '#D4E650', '#F2DE3E', '#FFCF33', '#FF9A2E', '#FF5A3C', '#FF4636', '#FF3A33', '#FF3030', '#FF2A2A', '#FF2424'];

/** `tramos`: 0-15 (S0..S9 = 0..9, S9+10..+60 = 10..15); -1 = el equipo no da señal. */
export function SMeter({ tramos }: { tramos: number }) {
  const encendidos = tramos < 0 ? 0 : Math.min(15, tramos);
  const lectura = tramos < 0 ? 'S—' : tramos <= 9 ? `S${tramos}` : `S9+${(encendidos - 9) * 10}`;
  const tramo = (i: number, alto: string) => <i key={i} className={`flex-1 rounded-sm ${alto}`} style={{ background: COLORES_S[i], opacity: i < encendidos ? 1 : 0.15 }} />;
  return (
    <div className="flex-1 basis-56 min-w-0 flex items-center gap-3" id="equipo-smeter-caja">
      <div className="flex-1 min-w-0">
        <div role="img" aria-label={tramos < 0 ? 'Sin lectura de señal' : `Señal ${lectura}`} className="flex items-end">
          <div className="flex items-end gap-[2px]" style={{ flex: 9 }}>{Array.from({ length: 9 }, (_, i) => tramo(i, 'h-[10px]'))}</div>
          <span className="w-[2px] h-4 mx-[3px] rounded-[1px] bg-slate-100 opacity-80" />
          <div className="flex items-end gap-[2px]" style={{ flex: 6 }}>{Array.from({ length: 6 }, (_, i) => tramo(i + 9, 'h-[13px]'))}</div>
        </div>
        <div className="flex text-[11px] leading-tight text-slate-400 pt-px">
          <div className="flex" style={{ flex: 9 }}>
            <span style={{ flex: 2 }}>1</span><span style={{ flex: 2 }}>3</span><span style={{ flex: 2 }}>5</span><span style={{ flex: 2 }}>7</span><span style={{ flex: 1, color: '#FF9A2E' }}>9</span>
          </div>
          <div className="w-2" />
          <div className="flex text-right" style={{ flex: 6 }}><span className="flex-1">+20</span><span className="flex-1">+40</span><span className="flex-1">+60</span></div>
        </div>
      </div>
      <span className="font-mono text-lg whitespace-nowrap" id="equipo-smeter" style={{ color: encendidos ? COLORES_S[encendidos - 1] : '#6F8293' }} title={tramos < 0 ? 'El equipo no da el S-meter por CAT' : undefined}>{lectura}</span>
    </div>
  );
}

export function PanelEquipo({ datos, admin, config, onGuardar, onCambio }: { datos: DatosEquipo | null; admin: boolean; config: TelemetryConfig; onGuardar: Guardar; onCambio: () => void }) {
  const e = datos?.equipo;
  const [ajustes, setAjustes] = useState(false);
  const [host, setHost] = useState(config.catHost || '127.0.0.1');
  const [puerto, setPuerto] = useState(String(config.catPort || 4532));
  const [khz, setKhz] = useState('');
  const [aviso, setAviso] = useState('');

  const mandar = async (cuerpo: Record<string, unknown>) => { setAviso(await ordenRadio('equipo', cuerpo)); onCambio(); };
  const guardar = async (activar: boolean) => {
    const ok = await onGuardar({ catEnabled: activar, catHost: host.trim(), catPort: Number(puerto) || 4532 });
    setAviso(ok ? '' : 'No se pudo guardar.');
    if (ok) { setAjustes(false); onCambio(); }
  };
  const fkhz = e?.frecuenciaHz != null ? e.frecuenciaHz / 1000 : null;
  const s = e?.senal ?? null;
  const tramos = s ? (s.sobre > 0 ? 9 + Math.min(6, Math.round(s.sobre / 10)) : s.s) : 0;

  return (
    <Tarjeta aria-label="Equipo de radio por CAT" className="flex flex-col gap-3" id="equipo-cat">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Equipo (CAT)</h2>
          {e?.activo && <span className="text-sm text-slate-400">{e.modelo ? `${e.modelo} · ` : ''}rigctld <span className="font-mono">{e.destino}</span></span>}
        </div>
        <div className="flex items-center gap-3">
          {e?.activo && <span className={`text-sm font-semibold ${e.enlace ? 'text-emerald-400' : 'text-red-400'}`} id="equipo-estado">● {e.enlace ? 'Conectado' : 'Sin enlace'}</span>}
          {admin && <button type="button" className={enlaceTexto} onClick={() => setAjustes((v) => !v)}>Conexión</button>}
        </div>
      </div>

      {(ajustes || (e && !e.activo && admin)) && (
        <div className="border border-slate-700 rounded-lg p-3 flex flex-col gap-3" id="equipo-ajustes">
          <p className="text-sm text-slate-300">Demonio <span className="font-mono">rigctld</span> de Hamlib: vale para cualquier equipo que Hamlib sepa manejar. En el NUC, por ejemplo: <span className="font-mono">rigctld -m &lt;modelo&gt; -r /dev/ttyUSB0 -s 38400</span>.</p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 basis-48 text-xs text-slate-400 flex flex-col gap-1">Servidor
              <input className={`${campo} font-mono`} value={host} onChange={(ev) => setHost(ev.target.value)} autoCapitalize="none" spellCheck={false} />
            </label>
            <label className="basis-28 text-xs text-slate-400 flex flex-col gap-1">Puerto
              <input className={`${campo} font-mono`} value={puerto} onChange={(ev) => setPuerto(ev.target.value)} inputMode="numeric" />
            </label>
            <button type="button" className={botonPrincipal} disabled={!host.trim()} onClick={() => guardar(true)}>Conectar</button>
            {e?.activo && <button type="button" className={boton} onClick={() => guardar(false)}>Desconectar</button>}
          </div>
        </div>
      )}
      {e && !e.activo && !admin && <p className="text-sm text-slate-400">Sin equipo configurado. Lo ajusta el administrador.</p>}
      {e?.activo && !e.enlace && <p className="text-sm text-amber-300" id="equipo-sin-enlace">rigctld no responde{e.error ? ` (${e.error})` : ''}. Se reintenta solo; no se muestra ninguna lectura.</p>}

      {e?.activo && e.enlace && (
        <>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 basis-72 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-4 py-3">
              <div className="flex justify-between text-xs text-slate-400">
                <span>{[e.vfo, e.modo, e.anchoHz ? `filtro ${(e.anchoHz / 1000).toLocaleString('es-ES')} kHz` : null].filter(Boolean).join(' · ') || '—'}</span>
                <span className={`font-semibold ${e.ptt ? 'text-red-400' : 'text-emerald-400'}`} id="equipo-ptt">{e.ptt === null ? '' : e.ptt ? 'TX' : 'RX'}</span>
              </div>
              <div className="font-mono text-4xl sm:text-5xl leading-tight text-sky-400 whitespace-nowrap" id="equipo-frecuencia">
                {e.frecuenciaHz === null ? '—' : frecuenciaLegible(e.frecuenciaHz)}<span className="text-lg text-slate-400"> Hz</span>
              </div>
            </div>
            <SMeter tramos={s ? tramos : -1} />
          </div>

          {admin && (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Banda">
                {BANDAS.map(([nombre, desde, hasta, llamada]) => {
                  const enBanda = fkhz !== null && fkhz >= desde && fkhz <= hasta;
                  return <button key={nombre} type="button" className={`${enBanda ? botonActivo : boton} !px-2.5 min-w-[56px]`} aria-pressed={enBanda} onClick={() => mandar({ frecuenciaHz: llamada * 1000 })}>{nombre}</button>;
                })}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Modo">
                {['USB', 'LSB', 'CW', 'FM', 'AM', 'PKTUSB'].map((m) => (
                  <button key={m} type="button" className={e.modo === m ? botonActivo : boton} aria-pressed={e.modo === m} onClick={() => mandar({ modo: m })}>{m === 'PKTUSB' ? 'DATA' : m}</button>
                ))}
                <button type="button" className={e.vfo === 'VFOA' ? botonActivo : boton} onClick={() => mandar({ vfo: 'VFOA' })}>VFO A</button>
                <button type="button" className={e.vfo === 'VFOB' ? botonActivo : boton} onClick={() => mandar({ vfo: 'VFOB' })}>VFO B</button>
              </div>
              <form className="flex flex-wrap gap-2 items-end" onSubmit={(ev) => { ev.preventDefault(); const n = Number(khz.replace(',', '.')); if (n > 0) { mandar({ frecuenciaHz: Math.round(n * 1000) }); setKhz(''); } }}>
                <label className="basis-44 text-xs text-slate-400 flex flex-col gap-1">Frecuencia (kHz)
                  <input className={`${campo} font-mono`} id="equipo-khz" value={khz} onChange={(ev) => setKhz(ev.target.value)} inputMode="decimal" placeholder="14205" />
                </label>
                <button type="submit" className={boton} disabled={!(Number(khz.replace(',', '.')) > 0)}>Sintonizar</button>
                <span className="flex-1" />
                {e.ptt !== null && (
                  <button
                    type="button" id="equipo-boton-ptt"
                    className={e.ptt ? 'min-h-[44px] px-5 rounded-lg bg-red-500 text-slate-950 font-bold cursor-pointer' : botonPrincipal}
                    onClick={() => { if (e.ptt || window.confirm('El equipo va a emitir. Se suelta solo a los 3 minutos. ¿Activar el PTT?')) mandar({ ptt: !e.ptt }); }}
                  >{e.ptt ? 'Soltar PTT' : 'PTT'}</button>
                )}
              </form>
            </>
          )}
        </>
      )}
      {aviso && <p className="text-sm text-amber-300" role="alert">{aviso}</p>}
    </Tarjeta>
  );
}

// Esfera del rotor: graduada cada 5°, numerada cada 30°, con la aguja del
// acimut (punta y contrapeso) y un índice en el borde para el objetivo.
function Brujula({ az, objetivo, proa = null }: { az: number | null; objetivo: number | null; proa?: number | null }) {
  const C = 110;
  const punto = (a: number, r: number): [number, number] => [C + r * Math.sin((a * Math.PI) / 180), C - r * Math.cos((a * Math.PI) / 180)];
  const marcas = Array.from({ length: 72 }, (_, i) => i * 5);
  const CARDINALES: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' };
  // Ángulo acumulado: al pasar por el norte la aguja sigue girando por el lado corto, sin dar la vuelta entera
  const giro = useRef<number | null>(null);
  if (az !== null) giro.current = giro.current === null ? az : giro.current + ((((az - giro.current) % 360) + 540) % 360) - 180;
  return (
    <svg
      role="img" id="rotor-esfera"
      aria-label={az === null ? 'Rotor sin lectura' : `Rotor a ${Math.round(az)} grados${objetivo !== null ? `, objetivo ${Math.round(objetivo)} grados` : ''}`}
      viewBox="0 0 220 220" className="shrink-0 w-[220px] h-[220px] max-w-full"
    >
      <defs>
        <radialGradient id="rotor-fondo" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#16283a" />
          <stop offset="100%" stopColor="#060b14" />
        </radialGradient>
        <linearGradient id="rotor-aguja" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r="106" fill="url(#rotor-fondo)" stroke="#334155" strokeWidth="2" />
      <circle cx={C} cy={C} r="62" fill="none" stroke="#1e293b" strokeWidth="1" />
      {marcas.map((a) => {
        const mayor = a % 30 === 0;
        const media = a % 10 === 0;
        const [x1, y1] = punto(a, mayor ? 90 : media ? 94 : 97);
        const [x2, y2] = punto(a, 103);
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={mayor ? '#e2e8f0' : media ? '#94a3b8' : '#475569'} strokeWidth={mayor ? 2 : 1} strokeLinecap="round" />;
      })}
      {marcas.filter((a) => a % 30 === 0).map((a) => {
        const letra = CARDINALES[a];
        const [x, y] = punto(a, letra ? 76 : 78);
        return (
          <text key={a} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={letra ? 17 : 11} fontWeight={letra ? 700 : 500}
            fill={a === 0 ? '#f87171' : letra ? '#f1f5f9' : '#94a3b8'} fontFamily={letra ? undefined : 'ui-monospace, monospace'}>
            {letra ?? a}
          </text>
        );
      })}
      {proa !== null && (
        <g transform={`rotate(${proa} ${C} ${C})`}>
          {/* proa del vehículo o barco */}
          <path d={`M ${C} ${C - 60} L ${C - 6} ${C - 48} L ${C + 6} ${C - 48} Z`} fill="none" stroke="#a7f3d0" strokeWidth="1.5" strokeLinejoin="round" />
          <line x1={C} y1={C - 48} x2={C} y2={C - 16} stroke="#a7f3d0" strokeWidth="1" opacity="0.5" />
        </g>
      )}
      {objetivo !== null && (
        <g transform={`rotate(${objetivo} ${C} ${C})`}>
          <line x1={C} y1={C - 14} x2={C} y2={C - 88} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" />
          <path d={`M ${C} ${C - 91} L ${C - 7} ${C - 105} L ${C + 7} ${C - 105} Z`} fill="#fbbf24" stroke="#060b14" strokeWidth="1" />
        </g>
      )}
      {az !== null && (
        <g style={{ transform: `rotate(${giro.current}deg)`, transformOrigin: `${C}px ${C}px`, transition: 'transform 1.4s linear' }}>
          {/* contrapeso */}
          <path d={`M ${C - 5} ${C} L ${C} ${C + 34} L ${C + 5} ${C} Z`} fill="#475569" />
          {/* punta */}
          <path d={`M ${C - 7} ${C} L ${C} ${C - 86} L ${C + 7} ${C} Z`} fill="url(#rotor-aguja)" stroke="#e0f2fe" strokeWidth="0.6" strokeLinejoin="round" />
          <line x1={C} y1={C - 6} x2={C} y2={C - 80} stroke="#e0f2fe" strokeWidth="0.8" opacity="0.6" />
        </g>
      )}
      <circle cx={C} cy={C} r="9" fill="#0f172a" stroke="#7dd3fc" strokeWidth="2" />
      <circle cx={C} cy={C} r="3" fill="#7dd3fc" />
    </svg>
  );
}

export function PanelRotor({ datos, admin, config, onGuardar, onCambio }: { datos: DatosEquipo | null; admin: boolean; config: TelemetryConfig; onGuardar: Guardar; onCambio: () => void }) {
  const r = datos?.rotor;
  const [ajustes, setAjustes] = useState(false);
  const [modo, setModo] = useState<'rotctld' | 'caja'>(config.rotorMode === 'caja' ? 'caja' : 'rotctld');
  const [host, setHost] = useState(config.rotorHost || '127.0.0.1');
  const [puerto, setPuerto] = useState(String(config.rotorPort || 4533));
  const [pin, setPin] = useState('');
  const [az, setAz] = useState('');
  const [el, setEl] = useState('');
  const [aviso, setAviso] = useState('');
  const [tipo, setTipo] = useState<'aprs' | 'ultima' | 'barco' | 'avion' | 'sol' | 'luna'>('aprs');
  const [quien, setQuien] = useState('');
  const activo = !!r && r.modo !== 'off';
  const est = datos?.estacion;
  const seg = datos?.seguimiento ?? null;
  // Con el rotor en un móvil, la esfera y las cifras van en acimut verdadero
  const azMostrado = r ? (r.movil ? r.azVerdadero : r.az) : null;
  const objetivoMostrado = r ? (r.movil ? r.objetivoVerdadero : r.objetivoAz) : null;
  const necesitaQuien = tipo === 'aprs' || tipo === 'barco' || tipo === 'avion';

  useEffect(() => { setPuerto((p) => (modo === 'caja' && p === '4533' ? '4534' : modo === 'rotctld' && p === '4534' ? '4533' : p)); }, [modo]);

  const mandar = async (cuerpo: Record<string, unknown>) => { setAviso(await ordenRadio('rotor', cuerpo)); onCambio(); };
  const guardar = async (m: 'off' | 'rotctld' | 'caja') => {
    const cambios: Partial<TelemetryConfig> = { rotorMode: m, rotorHost: host.trim(), rotorPort: Number(puerto) || (modo === 'caja' ? 4534 : 4533) };
    if (pin) cambios.rotorPin = pin;
    const ok = await onGuardar(cambios);
    setAviso(ok ? '' : 'No se pudo guardar.');
    if (ok) { setAjustes(false); setPin(''); onCambio(); }
  };
  const paso = (grados: number) => { if (azMostrado != null) mandar({ accion: 'ir', az: (Math.round(objetivoMostrado ?? azMostrado) + grados + 360) % 360 }); };
  const estado = !r?.enlace ? { t: 'Sin enlace', c: 'text-red-400' }
    : r.fallo && r.fallo !== 'OK' ? { t: r.fallo, c: 'text-red-400' }
    : r.moviendo ? { t: 'Girando', c: 'text-amber-300' } : { t: 'Parado', c: 'text-emerald-400' };

  return (
    <Tarjeta aria-label="Rotor" className="flex flex-col gap-3" id="rotor">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Rotor</h2>
          {activo && <span className="text-sm text-slate-400">{r!.modo === 'caja' ? (r!.nombre || 'APRS LoRa+ Rotor') : 'rotctld'} <span className="font-mono">{r!.destino}</span></span>}
        </div>
        <div className="flex items-center gap-3">
          {activo && <span className={`text-sm font-semibold ${estado.c}`} id="rotor-estado">● {estado.t}</span>}
          {admin && <button type="button" className={enlaceTexto} onClick={() => setAjustes((v) => !v)}>Conexión</button>}
        </div>
      </div>

      {(ajustes || (r && !activo && admin)) && (
        <div className="border border-slate-700 rounded-lg p-3 flex flex-col gap-3" id="rotor-ajustes">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de enlace">
            <button type="button" className={modo === 'rotctld' ? botonActivo : boton} aria-pressed={modo === 'rotctld'} onClick={() => setModo('rotctld')}>rotctld (Hamlib)</button>
            <button type="button" className={modo === 'caja' ? botonActivo : boton} aria-pressed={modo === 'caja'} onClick={() => setModo('caja')}>Caja APRS LoRa+ Rotor</button>
          </div>
          <p className="text-sm text-slate-300">{modo === 'rotctld' ? 'Demonio rotctld de Hamlib (puerto 4533), para cualquier rotor que Hamlib maneje.' : 'La caja APRS LoRa+ Rotor por su protocolo propio (TCP 4534): da además el objetivo, si gira y sus avisos (viento, atasco).'}</p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 basis-44 text-xs text-slate-400 flex flex-col gap-1">Servidor
              <input className={`${campo} font-mono`} value={host} onChange={(ev) => setHost(ev.target.value)} autoCapitalize="none" spellCheck={false} />
            </label>
            <label className="basis-24 text-xs text-slate-400 flex flex-col gap-1">Puerto
              <input className={`${campo} font-mono`} value={puerto} onChange={(ev) => setPuerto(ev.target.value)} inputMode="numeric" />
            </label>
            {modo === 'caja' && (
              <label className="basis-32 text-xs text-slate-400 flex flex-col gap-1">PIN
                <input className={`${campo} font-mono`} type="password" value={pin} onChange={(ev) => setPin(ev.target.value)} placeholder={r?.pinGuardado ? 'guardado' : ''} autoComplete="new-password" inputMode="numeric" />
              </label>
            )}
            <button type="button" className={botonPrincipal} disabled={!host.trim()} onClick={() => guardar(modo)}>Conectar</button>
            {activo && <button type="button" className={boton} onClick={() => guardar('off')}>Desconectar</button>}
          </div>
        </div>
      )}
      {r && !activo && !admin && <p className="text-sm text-slate-400">Sin rotor configurado. Lo ajusta el administrador.</p>}
      {activo && !r!.enlace && <p className="text-sm text-amber-300" id="rotor-sin-enlace">El rotor no responde{r!.error ? ` (${r!.error})` : ''}. Se reintenta solo; no se muestra ninguna posición.</p>}

      {activo && r!.enlace && (
        <>
          <div className="flex flex-wrap gap-4 items-center">
            <Brujula az={azMostrado} objetivo={objetivoMostrado} proa={r!.movil ? est?.proa ?? null : null} />
            <div className="flex-1 basis-36 grid grid-cols-2 gap-3">
              <div><div className="text-xs text-slate-400">{r!.movil ? 'Acimut verdadero' : 'Acimut'}</div><div className="font-mono text-3xl text-sky-400" id="rotor-az">{azMostrado === null ? '—' : `${Math.round(azMostrado)}°`}</div></div>
              <div><div className="text-xs text-slate-400">Elevación</div><div className="font-mono text-3xl text-sky-400">{r!.el === null ? '—' : `${Math.round(r!.el)}°`}</div></div>
              <div><div className="text-xs text-slate-400">Objetivo</div><div className="font-mono text-lg text-amber-300" id="rotor-objetivo">{objetivoMostrado === null ? '—' : `${Math.round(objetivoMostrado)}°${r!.objetivoEl !== null ? ` / ${Math.round(r!.objetivoEl)}°` : ''}`}</div></div>
              {r!.movil && <div><div className="text-xs text-slate-400">Respecto a la proa</div><div className="font-mono text-lg text-slate-200" id="rotor-relativo">{r!.az === null ? '—' : `${Math.round(r!.az)}°`}</div></div>}
            </div>
          </div>
          {(r!.gps || r!.actitud) && (
            <div className="flex flex-wrap items-center gap-2 text-xs" id="rotor-estado-caja">
              {r!.gps && (
                <span className={`px-2 py-0.5 rounded ${r!.fijo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`} title="GPS de la caja: con el equipo parado, la posición se congela para que el apuntado no baile con el baile del fix">
                  GPS {r!.fijo ? 'fijo (parado)' : 'en vivo'}
                </span>
              )}
              {r!.actitud && (
                <span className={`px-2 py-0.5 rounded font-mono ${r!.actitud.on ? (r!.actitud.viejo ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300') : 'bg-slate-600/30 text-slate-400'}`} title="Compensación de actitud: la antena sigue apuntando aunque la plataforma escore o cabecee o el mástil gire con el viento">
                  {r!.actitud.on ? `Actitud ${Math.round(r!.actitud.roll)}° / ${Math.round(r!.actitud.pitch)}° / ${Math.round(r!.actitud.yaw)}°${r!.actitud.viejo ? ' (viejo)' : ''}` : 'Actitud off'}
                </span>
              )}
            </div>
          )}
          {admin && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} onClick={() => paso(-5)} disabled={azMostrado === null}>◀ −5°</button>
                <button type="button" className={boton} onClick={() => paso(5)} disabled={azMostrado === null}>+5° ▶</button>
                <button type="button" className={boton} onClick={() => mandar({ accion: 'aparcar' })}>Aparcar</button>
                <button type="button" className={botonPrincipal} id="rotor-parar" onClick={() => mandar({ accion: 'parar' })}>Parar</button>
              </div>
              <form className="flex flex-wrap gap-2 items-end" onSubmit={(ev) => { ev.preventDefault(); if (az !== '') { mandar({ accion: 'ir', az: Number(az), el: el === '' ? undefined : Number(el) }); setAz(''); setEl(''); } }}>
                <label className="basis-28 text-xs text-slate-400 flex flex-col gap-1">Acimut (°)
                  <input className={`${campo} font-mono`} id="rotor-ir-az" value={az} onChange={(ev) => setAz(ev.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" />
                </label>
                {r!.tieneElevacion !== false && (
                  <label className="basis-28 text-xs text-slate-400 flex flex-col gap-1">Elevación (°)
                    <input className={`${campo} font-mono`} value={el} onChange={(ev) => setEl(ev.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="igual" />
                  </label>
                )}
                <button type="submit" className={boton} disabled={az === ''}>Ir a</button>
              </form>
            </>
          )}
        </>
      )}
      {activo && est && (
        <div className="border-t border-slate-800 pt-3 flex flex-col gap-3" id="rotor-seguimiento">
          <div className="text-sm text-slate-300" id="rotor-estacion">
            <span className="text-slate-400">Estación: </span>
            {est.gps
              ? <>por GPS, {est.velocidadKmh >= 3 ? `en movimiento a ${Math.round(est.velocidadKmh)} km/h` : 'parada'}{est.proa !== null ? ` · rumbo ${String(Math.round(est.proa)).padStart(3, '0')}°` : ''}</>
              : <>posición fija</>}
            <span className="text-slate-400"> · los ángulos se calculan desde </span>
            <span className="font-mono">{Math.abs(est.lat).toFixed(4)}°{est.lat >= 0 ? 'N' : 'S'} {Math.abs(est.lon).toFixed(4)}°{est.lon >= 0 ? 'E' : 'O'}</span>
          </div>
          {admin && (
            <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 mt-0.5 shrink-0" id="rotor-movil" checked={r!.movil} onChange={async (ev) => { const ok = await onGuardar({ rotorMovil: ev.target.checked }); setAviso(ok ? '' : 'No se pudo guardar.'); onCambio(); }} />
              <span>El rotor va en un vehículo o barco: descontar el rumbo de la proa y volver a apuntar cuando cambie.</span>
            </label>
          )}
          {r!.movil && est.proa === null && (
            <p className="text-sm text-amber-300" id="rotor-sin-proa">Todavía no hay rumbo de la proa: hace falta el GPS y algo de marcha (3 km/h). Hasta entonces el rotor no se mueve.</p>
          )}
          {r!.movil && est.proa !== null && est.velocidadKmh < 3 && (
            <p className="text-[13px] text-slate-400">Parada: se usa el último rumbo que dio el GPS en marcha. Si el vehículo gira sin avanzar, no se nota.</p>
          )}

          {seg && (
            <div className={`rounded-lg border px-3 py-2 ${seg.ok ? 'border-emerald-700 bg-slate-950' : 'border-amber-700 bg-slate-950'}`} id="rotor-siguiendo">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-slate-100"><span className="text-slate-400">Siguiendo a </span><span className="font-mono">{seg.nombre || seg.objetivo.indicativo || ''}</span></span>
                {admin && <button type="button" className={enlaceTexto} onClick={() => mandar({ accion: 'dejar' })}>Dejar de seguir</button>}
              </div>
              {seg.ok ? (
                <div className="text-sm text-slate-300 font-mono">
                  {String(Math.round(seg.azVerdadero ?? 0)).padStart(3, '0')}°{seg.elevacion !== undefined ? ` · elev. ${Math.round(seg.elevacion)}°` : ''}{seg.distanciaKm !== undefined ? ` · ${seg.distanciaKm.toLocaleString('es-ES')} km` : ''}
                  {seg.estimada && <span className="font-sans text-slate-400"> · posición estimada por su rumbo y velocidad</span>}
                </div>
              ) : (
                <div className="text-sm text-amber-300">En espera: {seg.espera}.</div>
              )}
            </div>
          )}

          {admin && r!.enlace && (
            <form className="flex flex-wrap gap-2 items-end" onSubmit={(ev) => { ev.preventDefault(); mandar({ accion: 'seguir', objetivo: { tipo, indicativo: quien } }); }}>
              <label className="basis-48 grow text-xs text-slate-400 flex flex-col gap-1">Seguir
                <select className={campo} id="rotor-seguir-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as typeof tipo)}>
                  <option value="aprs">Estación APRS</option>
                  <option value="ultima">Última estación oída por radio</option>
                  <option value="barco">Barco (AIS)</option>
                  <option value="avion">Aeronave (ADS-B)</option>
                  <option value="sol">Sol</option>
                  <option value="luna">Luna</option>
                </select>
              </label>
              {necesitaQuien && (
                <label className="basis-40 grow text-xs text-slate-400 flex flex-col gap-1">{tipo === 'aprs' ? 'Indicativo' : tipo === 'barco' ? 'MMSI o nombre' : 'Vuelo o código ICAO'}
                  <input className={`${campo} font-mono`} id="rotor-seguir-quien" value={quien} onChange={(ev) => setQuien(ev.target.value.toUpperCase())} autoCapitalize="characters" spellCheck={false} />
                </label>
              )}
              <button type="submit" className={boton} id="rotor-seguir" disabled={necesitaQuien && !quien.trim()}>Seguir</button>
            </form>
          )}
          <p className="text-[13px] text-slate-400">Los objetivos en movimiento se apuntan a su posición estimada ahora (hasta 5 minutos desde su última posición). Mover a mano, parar o aparcar deja de seguir.</p>
        </div>
      )}
      {aviso && <p className="text-sm text-amber-300" role="alert">{aviso}</p>}
    </Tarjeta>
  );
}
