// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Estación · WeeWX: lo que WeeWX da de verdad. Su configuración (weewx.conf)
// y su base de datos: la última lectura y las últimas 24 h, hora a hora.
// Sin base de datos no hay gráficas: se dice, no se inventan.
import React, { useEffect, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { haceCuanto } from '../utils/useAvisos';
import { Cifra, Estado, duracion, horaMin } from '../components/radio/Piezas';

interface Hora { hora: number; tempC: number | null; humedadPct: number | null; presionHpa: number | null; vientoKmh: number | null; rachaKmh: number | null; lluviaMm: number | null; registros: number }
interface Datos {
  servicio: { estado: 'active' | 'inactive' | 'failed' | null; desde: number | null };
  simulador?: boolean;
  conf: null | { ruta: string; tipoEstacion: string | null; ubicacion: string | null; lat: number | null; lon: number | null; altitud: string | null; intervaloArchivoS: number | null; baseDatos: string | null; unidadesInforme: string | null };
  bd: { ruta: string; error: string | null; leido: number; ultimaHora: number | null };
  actual: null | { cuando: number; tempC?: number; humedadPct?: number; presionHpa?: number; vientoKmh?: number; rachaKmh?: number; dirGrados?: number; lluvia1hMm?: number; lluvia24hMm?: number };
  horas: Hora[];
  resumen: { tempMin: number | null; tempMax: number | null; rachaMax: number | null; lluvia24h: number | null; tendencia3h: number | null; registros: number };
  parte: { activo: boolean; intervaloMin: number; fuente: string | null };
}

const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400';
const num = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));
const ROSA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const rosa = (g?: number) => (g === undefined ? '' : ROSA[Math.round(((g % 360) + 360) % 360 / 22.5) % 16]);

/** Línea de 24 h, una serie, con cruz y lectura al pasar el dedo o el ratón. */
function GraficaHoras({ id, titulo, horas, clave, unidad, decimales = 1, color }: {
  id: string; titulo: string; horas: Hora[]; clave: keyof Hora; unidad: string; decimales?: number; color: string;
}) {
  const [sobre, setSobre] = useState<number | null>(null);
  const puntos = horas.map((h, i) => ({ i, h, v: h[clave] as number | null })).filter((p) => p.v !== null && Number.isFinite(p.v));
  if (puntos.length < 2) {
    return (
      <Tarjeta className="flex flex-col gap-1" id={id}>
        <h3 className="text-[15px] font-semibold text-slate-100">{titulo}</h3>
        <p className="text-sm text-slate-400">Sin datos suficientes en las últimas 24 h.</p>
      </Tarjeta>
    );
  }
  const W = 600, H = 150, iz = 44, de = 8, ar = 10, ab = 22;
  const vs = puntos.map((p) => p.v as number);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const margen = (max - min) * 0.1; min -= margen; max += margen;
  const t0 = horas[0].hora, t1 = horas[horas.length - 1].hora || t0 + 1;
  const x = (t: number) => iz + ((t - t0) / Math.max(1, t1 - t0)) * (W - iz - de);
  const y = (v: number) => ar + (1 - (v - min) / (max - min)) * (H - ar - ab);
  const d = puntos.map((p, k) => `${k ? 'L' : 'M'}${x(p.h.hora).toFixed(1)},${y(p.v as number).toFixed(1)}`).join(' ');
  const marcas = [min + margen, (min + max) / 2, max - margen];
  const actual = sobre !== null ? puntos.find((p) => p.i === sobre) ?? null : null;
  const ultimo = puntos[puntos.length - 1];
  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let mejor = puntos[0];
    for (const p of puntos) if (Math.abs(x(p.h.hora) - px) < Math.abs(x(mejor.h.hora) - px)) mejor = p;
    setSobre(mejor.i);
  };
  return (
    <Tarjeta className="flex flex-col gap-1 min-w-0" id={id}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-slate-100">{titulo}</h3>
        <span className="font-mono text-sm text-slate-300" aria-live="polite">
          {actual ? <>{num(actual.v, decimales)} {unidad} · {horaMin(actual.h.hora)} UTC</> : <>ahora {num(ultimo.v, decimales)} {unidad}</>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none select-none" role="img"
        aria-label={`${titulo}, últimas 24 horas: de ${num(Math.min(...vs), decimales)} a ${num(Math.max(...vs), decimales)} ${unidad}`}
        onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setSobre(null)}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={iz} x2={W - de} y1={y(m)} y2={y(m)} className="stroke-slate-800" strokeWidth={1} />
            <text x={iz - 6} y={y(m) + 4} textAnchor="end" className="fill-slate-400 font-mono" fontSize={11}>{num(m, decimales)}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => {
          const t = t0 + f * (t1 - t0);
          return <text key={f} x={x(t)} y={H - 6} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} className="fill-slate-400 font-mono" fontSize={11}>{horaMin(t)}</text>;
        })}
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {actual && (
          <>
            <line x1={x(actual.h.hora)} x2={x(actual.h.hora)} y1={ar} y2={H - ab} className="stroke-slate-500" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(actual.h.hora)} cy={y(actual.v as number)} r={4.5} fill={color} className="stroke-slate-900" strokeWidth={2} />
          </>
        )}
      </svg>
    </Tarjeta>
  );
}

export default function Weewx() {
  const admin = useAdminSession().admin;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [registro, setRegistro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/estacion/weewx').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 30_000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta]);

  const orden = async (accion: 'reiniciar' | 'releer') => {
    if (accion === 'reiniciar' && !window.confirm('Se reinicia WeeWX: durante unos segundos no se archivan lecturas. ¿Seguir?')) return;
    setAviso({ ok: true, texto: accion === 'reiniciar' ? 'Reiniciando…' : 'Leyendo…' });
    try {
      const r = await customFetch('/api/estacion/weewx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) });
      const j = await r.json().catch(() => ({}));
      setAviso(r.ok ? { ok: true, texto: accion === 'reiniciar' ? 'WeeWX reiniciado.' : 'Base de datos leída de nuevo.' } : { ok: false, texto: j.error || 'No se pudo.' });
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setVuelta((v) => v + 1);
  };
  const verRegistro = async () => {
    if (registro !== null) { setRegistro(null); return; }
    setRegistro('Leyendo…');
    try { const j = await (await customFetch('/api/system/journal?servicio=weewx')).json(); setRegistro(String(j.logs ?? '')); } catch { setRegistro('No se pudo leer el registro.'); }
  };

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Estación · WeeWX</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }
  const { servicio: s, conf, bd, actual, horas, resumen: r } = datos;
  const ultimaLectura = actual?.cuando ?? bd.ultimaHora;
  const vieja = ultimaLectura !== null && ahora - ultimaLectura > 30 * 60_000;
  const intervalo = conf?.intervaloArchivoS ? (conf.intervaloArchivoS % 60 ? `${conf.intervaloArchivoS} s` : `${conf.intervaloArchivoS / 60} min`) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Estación · WeeWX</h1>
      {datos.simulador && (
        <p className="border border-red-500 bg-red-950/40 text-red-200 rounded-lg p-3 text-sm" role="alert" id="wx-simulador">
          <strong>WeeWX está con el controlador «Simulator».</strong> Lo que guarda en su base de datos son valores inventados, no medidas. La consola no los usa: ni en el parte meteorológico, ni en los umbrales, ni como observación propia. Las gráficas de abajo son de esos valores simulados. Para medir de verdad, configure en <span className="font-mono">weewx.conf</span> el controlador de su estación (<span className="font-mono">sudo weectl station reconfigure</span>).
        </p>
      )}

      <section aria-label="Estado de WeeWX" className="flex flex-wrap gap-3">
        <Estado id="wx-servicio" titulo="Servicio" ok={s.estado === null ? null : s.estado === 'active'} texto={s.estado === null ? 'Sin systemd' : s.estado === 'active' ? 'Activo' : s.estado === 'failed' ? 'Ha fallado' : 'Parado'}
          detalle={s.estado === 'active' && s.desde ? `en marcha desde hace ${duracion(s.desde, ahora)}` : 'systemd: weewx.service'} />
        <Estado id="wx-bd" titulo="Base de datos" ok={bd.error ? false : ultimaLectura === null ? null : !vieja}
          texto={bd.error ? 'No se puede leer' : ultimaLectura === null ? 'Sin registros' : vieja ? 'Sin lecturas recientes' : 'Archivando'}
          detalle={bd.error ? `${bd.ruta || '—'}: ${bd.error}` : ultimaLectura ? `última lectura ${haceCuanto(ultimaLectura, ahora)} · ${r.registros} registros en 24 h` : (bd.ruta || '—')} />
        <Estado id="wx-parte" titulo="Parte meteorológico por APRS" ok={datos.parte.activo ? datos.parte.fuente === 'WeeWX' || null : null}
          texto={datos.parte.activo ? `Cada ${datos.parte.intervaloMin} min` : 'Apagado'}
          detalle={datos.parte.activo ? (datos.parte.fuente ? `con datos de ${datos.parte.fuente}` : 'sin datos que enviar') : 'se activa en Estación → Perfil'} />
      </section>

      {bd.error && (
        <p className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm" id="wx-sin-bd">
          <b>No se puede leer la base de datos de WeeWX</b> ({bd.error}). La consola la lee con <span className="font-mono">sqlite3</span> en solo lectura: compruebe la ruta
          (Estación → Perfil → «Parte meteorológico por APRS», o la de <span className="font-mono">weewx.conf</span>) y que el usuario de la consola pueda leerla. Sin ella no se muestran gráficas.
        </p>
      )}

      <section aria-label="Lectura actual" className="flex flex-wrap gap-3">
        <Cifra id="wx-temp" titulo="Temperatura" valor={`${num(actual?.tempC, 1)} °C`} detalle={`24 h: ${num(r.tempMin, 1)} a ${num(r.tempMax, 1)} °C`} color="text-amber-300" />
        <Cifra titulo="Humedad" valor={`${num(actual?.humedadPct)} %`} detalle="relativa" color="text-sky-400" />
        <Cifra titulo="Presión" valor={`${num(actual?.presionHpa, 1)} hPa`} detalle={r.tendencia3h === null ? 'tendencia: —' : `${r.tendencia3h > 0 ? '+' : ''}${num(r.tendencia3h, 1)} hPa en 3 h`} />
        <Cifra titulo="Viento" valor={`${num(actual?.vientoKmh)} km/h`} detalle={`${actual?.dirGrados !== undefined ? `del ${rosa(actual.dirGrados)} (${Math.round(actual.dirGrados)}°) · ` : ''}racha máx. 24 h ${num(r.rachaMax)} km/h`} color="text-emerald-400" />
        <Cifra titulo="Lluvia" valor={`${num(actual?.lluvia1hMm, 1)} mm`} detalle={`última hora · 24 h: ${num(r.lluvia24h, 1)} mm`} color="text-sky-400" />
      </section>

      {horas.length > 0 && (
        <section aria-label="Últimas 24 horas" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <GraficaHoras id="wx-g-temp" titulo="Temperatura · 24 h" horas={horas} clave="tempC" unidad="°C" color="var(--color-amber-400)" />
          <GraficaHoras id="wx-g-pres" titulo="Presión · 24 h" horas={horas} clave="presionHpa" unidad="hPa" color="var(--color-slate-400)" />
          <GraficaHoras id="wx-g-hum" titulo="Humedad · 24 h" horas={horas} clave="humedadPct" unidad="%" decimales={0} color="var(--color-sky-400)" />
          <GraficaHoras id="wx-g-viento" titulo="Viento medio · 24 h" horas={horas} clave="vientoKmh" unidad="km/h" decimales={0} color="var(--color-emerald-400)" />
        </section>
      )}

      <Tarjeta aria-label="Configuración de WeeWX" className="flex flex-col gap-3" id="wx-conf">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-100">Configuración</h2>
          {conf && <span className="font-mono text-[13px] text-slate-400">{conf.ruta}</span>}
        </div>
        {!conf ? <p className="text-sm text-amber-300">No se encuentra weewx.conf (ni en /etc/weewx, ni en ~/weewx-data, ni junto a la consola).</p> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              ['Estación (station_type)', conf.tipoEstacion], ['Ubicación', conf.ubicacion],
              ['Posición', conf.lat !== null && conf.lon !== null ? `${conf.lat}, ${conf.lon}` : null], ['Altitud', conf.altitud],
              ['Intervalo de archivo', intervalo], ['Unidades del archivo', conf.unidadesInforme],
              ['Base de datos (weewx.conf)', conf.baseDatos], ['Base de datos que lee la consola', bd.ruta || null],
            ] as Array<[string, string | null]>).map(([k, v]) => (
              <div key={k} className="min-w-0"><div className="text-xs text-slate-400">{k}</div><div className={`font-mono text-[15px] break-words ${v === null ? 'text-slate-500' : 'text-slate-100'}`}>{v ?? '—'}</div></div>
            ))}
          </div>
        )}
        {admin && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={boton} onClick={() => orden('releer')}>Leer de nuevo</button>
            <button type="button" className={boton} aria-expanded={registro !== null} onClick={verRegistro}>{registro !== null ? 'Ocultar registro' : 'Ver registro'}</button>
            <button type="button" className={boton} onClick={() => orden('reiniciar')}>Reiniciar servicio</button>
          </div>
        )}
        {registro !== null && <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[12px] font-mono text-slate-300 max-h-72 overflow-auto whitespace-pre-wrap">{registro}</pre>}
        {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{aviso.texto}</p>}
        <p className="text-[13px] text-slate-400">Las gráficas son medias por hora de la base de datos de WeeWX. Para editar weewx.conf: Sistema → Configuración → «Archivos .conf Debian».</p>
      </Tarjeta>
    </div>
  );
}
