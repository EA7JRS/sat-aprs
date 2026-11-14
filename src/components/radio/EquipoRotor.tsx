// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Principal: equipo de radio por CAT (rigctld) y rotor (rotctld o la
// caja APRS LoRa+ Rotor). Solo enseña lo que el equipo y el rotor dicen.
import React, { useEffect, useState } from 'react';
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

function Brujula({ az, objetivo }: { az: number | null; objetivo: number | null }) {
  const punto = (a: number, r: number) => [90 + r * Math.sin((a * Math.PI) / 180), 90 - r * Math.cos((a * Math.PI) / 180)];
  return (
    <svg role="img" aria-label={az === null ? 'Rotor sin lectura' : `Rotor a ${Math.round(az)} grados${objetivo !== null ? `, objetivo ${Math.round(objetivo)} grados` : ''}`} width="170" height="170" viewBox="0 0 180 180" className="shrink-0">
      <circle cx="90" cy="90" r="80" className="fill-slate-950 stroke-slate-700" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => { const [x1, y1] = punto(i * 30, 73); const [x2, y2] = punto(i * 30, 80); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-slate-500" strokeWidth={i % 3 === 0 ? 2 : 1} />; })}
      {[['N', 90, 27], ['E', 157, 95], ['S', 90, 163], ['O', 23, 95]].map(([t, x, y]) => <text key={t as string} x={x as number} y={y as number} textAnchor="middle" fontSize="13" className="fill-slate-300">{t}</text>)}
      {objetivo !== null && (() => { const [x, y] = punto(objetivo, 66); return <line x1="90" y1="90" x2={x} y2={y} stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 4" />; })()}
      {az !== null && (() => { const [x, y] = punto(az, 66); return <line x1="90" y1="90" x2={x} y2={y} stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />; })()}
      <circle cx="90" cy="90" r="5" fill="#38bdf8" />
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
  const activo = !!r && r.modo !== 'off';

  useEffect(() => { setPuerto((p) => (modo === 'caja' && p === '4533' ? '4534' : modo === 'rotctld' && p === '4534' ? '4533' : p)); }, [modo]);

  const mandar = async (cuerpo: Record<string, unknown>) => { setAviso(await ordenRadio('rotor', cuerpo)); onCambio(); };
  const guardar = async (m: 'off' | 'rotctld' | 'caja') => {
    const cambios: Partial<TelemetryConfig> = { rotorMode: m, rotorHost: host.trim(), rotorPort: Number(puerto) || (modo === 'caja' ? 4534 : 4533) };
    if (pin) cambios.rotorPin = pin;
    const ok = await onGuardar(cambios);
    setAviso(ok ? '' : 'No se pudo guardar.');
    if (ok) { setAjustes(false); setPin(''); onCambio(); }
  };
  const paso = (grados: number) => { if (r?.az != null) mandar({ accion: 'ir', az: (Math.round(r.objetivoAz ?? r.az) + grados + 360) % 360 }); };
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
            <Brujula az={r!.az} objetivo={r!.objetivoAz} />
            <div className="flex-1 basis-36 grid grid-cols-2 gap-3">
              <div><div className="text-xs text-slate-400">Acimut</div><div className="font-mono text-3xl text-sky-400" id="rotor-az">{r!.az === null ? '—' : `${Math.round(r!.az)}°`}</div></div>
              <div><div className="text-xs text-slate-400">Elevación</div><div className="font-mono text-3xl text-sky-400">{r!.el === null ? '—' : `${Math.round(r!.el)}°`}</div></div>
              <div><div className="text-xs text-slate-400">Objetivo</div><div className="font-mono text-lg text-amber-300" id="rotor-objetivo">{r!.objetivoAz === null ? '—' : `${Math.round(r!.objetivoAz)}°${r!.objetivoEl !== null ? ` / ${Math.round(r!.objetivoEl)}°` : ''}`}</div></div>
            </div>
          </div>
          {admin && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} onClick={() => paso(-5)} disabled={r!.az === null}>◀ −5°</button>
                <button type="button" className={boton} onClick={() => paso(5)} disabled={r!.az === null}>+5° ▶</button>
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
      {aviso && <p className="text-sm text-amber-300" role="alert">{aviso}</p>}
    </Tarjeta>
  );
}
