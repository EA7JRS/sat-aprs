// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · WX3in1: el Microsat WX3in1 Plus 2.0 de la estación. Lo que el equipo
// dice por telnet (print stats, print voltage, print rfheard y sus mensajes de
// depuración), lo que hace según su .cfg (comprobado con wx3cfg), dónde se pisa
// con Direwolf y aprx, la vía de emisión de respaldo y las estadísticas que manda
// por HTTP. Sin sesión con el equipo no hay cifras: se dice, no se inventan.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { descargar } from '../utils/descargar';
import { useAdminSession } from '../utils/session';
import { haceCuanto } from '../utils/useAvisos';
import { Cifra, Estado, GraficaMinutos, duracion, horaSeg } from '../components/radio/Piezas';

type Celda = 'si' | 'no' | 'respaldo' | 'desconocido';
interface Dato { etiqueta: string; valor: string; numero: number | null }
interface AvisoCfg { level: 'error' | 'warning' | 'info'; section: string; key: string; text: string }
interface Resumen {
  callsign: string;
  digipeater: { on: boolean; rules: Array<{ name: string; n_max: number; enable_if: string }> };
  igate: { rf_to_is: boolean; msg_to_rf: boolean; packets_to_rf: boolean; servers: string[]; user: string; passcode_ok: boolean };
  beacons: Array<{ n: number; rf_min: number; is_min: number }>;
  weather: { station: string | null; rf_min: number; is_min: number; wunderground: boolean };
  aprsis_server: { on: boolean; port: number; user: string; to_t2: boolean; from_t2: boolean };
  stats_upload: { on: boolean; host: string; port: number; path: string; interval_min: number };
  network: { dhcp: boolean; ip: string };
  ntp: string | null;
}
interface Datos {
  ajustes: { equipo: string; telnet: number; usuario: string; claveGuardada: boolean; depuracion: string[]; intervalo: number; isPuerto: number; isUsuario: string; isClaveGuardada: boolean; respaldo: boolean };
  sesion: { estado: 'apagado' | 'conectando' | 'conectado' | 'error'; motivo: string; desde: number | null; version: string | null; tension: number | null; ultimaConsulta: number | null };
  cifras: { recibidas: number; repetidas: number; minutosVistos: number; eficiencia: Dato | null; totalRecibidas: Dato | null; totalRepetidas: Dato | null; enMarcha: Dato | null };
  minutos: Array<{ minuto: number; rf: number; digi: number }>;
  estadisticas: Dato[];
  oidas: Array<{ indicativo: string; datos: string[]; linea: string }>;
  registro: Array<{ cuando: number; hora: string; etiqueta: string; tipo: string; texto: string }>;
  bruto: Record<string, { texto: string; cuando: number }> | null;
  cfg: null | { nombre: string; cuando: number; error: string | null; counts: { error: number; warning: number; info: number } | null; items: AvisoCfg[]; summary: Resumen | null };
  reparto: { filas: Array<{ funcion: string; consola: Celda; aprx: Celda; wx3in1: Celda }>; conflictos: Array<{ id: string; nivel: 'aviso' | 'info'; texto: string }> };
  respaldo: { cuando: number; ok: boolean | null; texto: string; activo: boolean; txActiva: boolean };
  estadisticasHttp: { ruta: string; puerto: number; peticiones: Array<{ cuando: number; desde: string; metodo: string; ruta: string; consulta: Record<string, string>; cuerpo: string }> };
}

const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-default';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;
const campo = 'min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 font-mono text-sm';
const CELDA: Record<Celda, { texto: string; clase: string }> = {
  si: { texto: '✓', clase: 'text-emerald-400' },
  no: { texto: '—', clase: 'text-slate-500' },
  respaldo: { texto: 'respaldo', clase: 'text-sky-400' },
  desconocido: { texto: '?', clase: 'text-slate-400' },
};
const FILTROS: Array<[string, string]> = [['', 'Todo'], ['rf', 'RF'], ['digi', 'Digi'], ['aprsis', 'APRS-IS'], ['red', 'NTP / DNS'], ['otro', 'Otros']];
const DEPURACION: Array<[string, string]> = [['rf', 'RF'], ['digi', 'Digipetidor'], ['aprsis', 'APRS-IS'], ['aprsis_messages', 'Mensajes APRS-IS'], ['ntp', 'NTP'], ['dns', 'DNS'], ['weatherstation', 'Estación meteo'], ['wunderground', 'WeatherUnderground'], ['telemetry', 'Telemetría'], ['ax25', 'AX.25 (mucho texto)']];

/** Passcode APRS-IS de un indicativo (sin SSID). */
function passcode(indicativo: string): number {
  const c = indicativo.toUpperCase().split('-')[0].trim();
  let h = 0x73e2;
  for (let i = 0; i < c.length; i += 2) { h ^= c.charCodeAt(i) << 8; if (i + 1 < c.length) h ^= c.charCodeAt(i + 1); }
  return h & 0x7fff;
}

function aBase64(buf: ArrayBuffer): string {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export default function Wx3in1() {
  const admin = useAdminSession().admin;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [tipo, setTipo] = useState('');
  const [pausa, setPausa] = useState<Datos['registro'] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [ajustes, setAjustes] = useState<null | { equipo: string; telnet: string; usuario: string; clave: string; depuracion: string[]; intervalo: string; isPuerto: string; isUsuario: string; isClave: string }>(null);
  const [verBruto, setVerBruto] = useState(false);
  const [calcular, setCalcular] = useState('');
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch(`/api/radio/wx3in1${tipo ? `?tipo=${tipo}` : ''}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta, tipo]);

  const registro = useMemo(() => (pausa ?? datos?.registro ?? []).slice(0, 80), [datos, pausa]);

  const enviar = async (url: string, cuerpo: unknown, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return null;
    setAviso({ ok: true, texto: 'Un momento…' });
    try {
      const r = await customFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = await r.json().catch(() => ({}));
      setAviso(r.ok ? { ok: true, texto: j.texto || 'Hecho.' } : { ok: false, texto: j.error || `La consola respondió ${r.status}.` });
      setVuelta((v) => v + 1);
      return r.ok ? j : null;
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); return null; }
  };

  const subirCfg = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 64_000) { setAviso({ ok: false, texto: 'El archivo es demasiado grande para ser un .cfg del WX3in1.' }); return; }
    const j = await enviar('/api/radio/wx3in1/cfg', { nombre: f.name, datos: aBase64(await f.arrayBuffer()) });
    if (j) setAviso({ ok: true, texto: `Comprobado ${f.name}.` });
    if (archivo.current) archivo.current.value = '';
  };

  const bajar = async (sinDigi: boolean) => {
    const base = (datos?.cfg?.nombre ?? 'wx3in1.cfg').replace(/\.cfg$/i, '');
    const e = await descargar(`/api/radio/wx3in1/cfg/corregido${sinDigi ? '?digi=0' : ''}`, `${base}${sinDigi ? '_sin_digi' : '_corregido'}.cfg`);
    setAviso(e ? { ok: false, texto: e } : { ok: true, texto: sinDigi ? 'Descargado. Cárguelo en el equipo con «Read from file» y «Write config» del Configurador (USB).' : 'Descargado. Cárguelo en el equipo con el Configurador oficial (USB).' });
  };

  const abrirAjustes = () => {
    if (!datos) return;
    const a = datos.ajustes;
    setAjustes({ equipo: a.equipo, telnet: String(a.telnet), usuario: a.usuario, clave: '', depuracion: a.depuracion, intervalo: String(a.intervalo), isPuerto: String(a.isPuerto), isUsuario: a.isUsuario, isClave: '' });
  };
  const guardarAjustes = async () => {
    if (!ajustes) return;
    const c: Record<string, unknown> = {
      equipo: ajustes.equipo.trim(), telnet: Number(ajustes.telnet), usuario: ajustes.usuario.trim(), depuracion: ajustes.depuracion,
      intervalo: Number(ajustes.intervalo), isPuerto: Number(ajustes.isPuerto), isUsuario: ajustes.isUsuario.trim(),
    };
    if (ajustes.clave) c.clave = ajustes.clave;
    if (ajustes.isClave) c.isClave = ajustes.isClave;
    if (await enviar('/api/radio/wx3in1/config', c)) { setAjustes(null); setAviso({ ok: true, texto: 'Ajustes guardados.' }); }
  };

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · WX3in1</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }

  const { sesion, cifras, cfg, reparto, respaldo } = datos;
  const r = cfg?.summary ?? null;
  const conectado = sesion.estado === 'conectado';
  const sinEquipo = !datos.ajustes.equipo;
  const vistos = cifras.minutosVistos;
  const ventana = vistos >= 60 ? 'última hora' : vistos > 1 ? `últimos ${vistos} min` : vistos === 1 ? 'último minuto' : 'sin sesión';
  const digiConflicto = reparto.conflictos.some((c) => c.id === 'digi');
  const estadoTexto = sinEquipo ? 'Sin configurar' : conectado ? 'Conectado' : sesion.estado === 'conectando' ? 'Conectando…' : sesion.estado === 'error' ? 'Sin conexión' : 'Apagado';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · WX3in1</h1>
        <span className="text-[13px] text-slate-400">Microsat WX3in1 Plus 2.0{sesion.version ? ` · firmware ${sesion.version}` : ''}{datos.ajustes.equipo ? ` · ${datos.ajustes.equipo}` : ''}</span>
      </div>

      {sinEquipo && (
        <p className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm" id="wx3-sin-equipo">
          <b>Sin equipo configurado.</b> Escriba la dirección del WX3in1 y su usuario y contraseña de telnet en «Ajustes» (abajo, administrador). Sin sesión telnet no hay cifras ni registro.
        </p>
      )}

      <section aria-label="Estado del WX3in1" className="flex flex-wrap gap-3">
        <Estado id="wx3-equipo" titulo="Equipo" ok={sinEquipo ? null : conectado} texto={estadoTexto}
          detalle={conectado ? <>telnet {datos.ajustes.equipo}:{datos.ajustes.telnet}{sesion.desde ? ` · sesión desde hace ${duracion(sesion.desde, ahora)}` : ''}</> : sesion.motivo || (sinEquipo ? '—' : 'Reintenta cada 30 s')} />
        <Estado id="wx3-igate" titulo="Pasarela a APRS-IS (iGate)" ok={r ? (r.igate.rf_to_is ? r.igate.passcode_ok : null) : null}
          texto={!r ? 'Sin .cfg' : !r.igate.rf_to_is ? 'Desactivada' : r.igate.passcode_ok ? `A ${r.igate.servers[0] ?? '—'}` : 'Passcode incorrecto'}
          detalle={r ? <>{r.igate.user || '—'}{r.igate.servers.length > 1 ? ` · ${r.igate.servers.length} servidores` : ''} · según su .cfg</> : 'Cargue su .cfg (Configuración)'} />
        <Estado id="wx3-digi" titulo="Digipetidor" ok={r ? (r.digipeater.on ? !digiConflicto : null) : null}
          texto={!r ? 'Sin .cfg' : r.digipeater.on ? `Activo · ${r.digipeater.rules.map((x) => `${x.name}n-N n≤${x.n_max}`).join(', ')}` : 'Desactivado'}
          detalle={digiConflicto ? 'también activo en Direwolf o aprx: ver reparto' : r ? 'según su .cfg' : '—'} />
        <Estado id="wx3-hora" titulo="Hora" ok={r ? (r.ntp ? true : null) : null} texto={!r ? 'Sin .cfg' : r.ntp ? `NTP ${r.ntp}` : 'Sin NTP'}
          detalle={r?.ntp ? 'use la IP de este equipo para la hora del GPS' : 'según su .cfg'} />
      </section>

      <section aria-label="Cifras" className="flex flex-wrap gap-3">
        <Cifra id="wx3-recibidas" titulo={`Recibidas por radio · ${ventana}`} valor={conectado || vistos ? String(cifras.recibidas) : '—'} detalle={datos.ajustes.depuracion.includes('rf') ? 'mensajes (RF) del equipo' : 'active «debug rf» en Ajustes'} color="text-sky-400" />
        <Cifra titulo={`Repetidas (digipetidor) · ${ventana}`} valor={conectado || vistos ? String(cifras.repetidas) : '—'} detalle={datos.ajustes.depuracion.includes('digi') ? 'mensajes (DIGI) del equipo' : 'active «debug digi» en Ajustes'} color="text-amber-300" />
        <Cifra titulo="Eficiencia de decodificación" valor={cifras.eficiencia ? cifras.eficiencia.valor : '—'} detalle={cifras.eficiencia ? cifras.eficiencia.etiqueta : 'print stats no la da'} />
        <Cifra titulo="Tensión de alimentación" valor={sesion.tension !== null ? `${sesion.tension.toFixed(1).replace('.', ',')} V` : '—'} detalle="print voltage" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Tráfico por minuto" className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-100">Tráfico por minuto · última hora</h2>
            <GraficaMinutos id="wx3-grafica" minutos={datos.minutos.map((m) => ({ minuto: m.minuto, a: m.rf, b: m.digi }))} etiquetas={['Recibidas', 'Repetidas por el WX3in1']} />
            <p className="text-[13px] text-slate-400">Se cuentan los mensajes de depuración «(RF)» y «(DIGI)» que el equipo escribe por telnet desde que se abrió la sesión. Sin sesión no hay barras.</p>
          </Tarjeta>

          <Tarjeta aria-label="Estaciones oídas por RF" className="flex flex-col gap-2" id="wx3-oidas">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Estaciones oídas por RF</h2>
              <span className="text-[13px] text-slate-400">print rfheard{sesion.ultimaConsulta ? ` · ${haceCuanto(sesion.ultimaConsulta, ahora)}` : ''}</span>
            </div>
            {datos.oidas.length === 0 ? <p className="text-sm text-slate-400">{conectado ? 'El equipo no ha dado ninguna estación todavía.' : 'Sin sesión con el equipo.'}</p> : (
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900"><th className="font-normal py-1 pr-3">Indicativo</th><th className="font-normal py-1">Lo que da el equipo</th></tr></thead>
                  <tbody>
                    {datos.oidas.map((o, i) => (
                      <tr key={`${o.indicativo}-${i}`} className="border-t border-slate-800" title={o.linea}>
                        <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{o.indicativo}</td>
                        <td className="py-1.5 font-mono text-[13px] text-slate-300">{o.datos.join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta aria-label="Registro del equipo" className="flex flex-col gap-2" id="wx3-registro">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Registro del equipo (telnet)</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar">
                {FILTROS.map(([k, n]) => <button key={k || 'todo'} type="button" className={pastilla(tipo === k)} aria-pressed={tipo === k} onClick={() => { setTipo(k); setPausa(null); }}>{n}</button>)}
                <button type="button" className={pastilla(pausa !== null)} aria-pressed={pausa !== null} onClick={() => setPausa(pausa ? null : datos.registro)}>{pausa ? 'Seguir' : 'Pausar'}</button>
              </div>
            </div>
            {registro.length === 0 ? <p className="text-sm text-slate-400">{conectado ? 'Nada todavía. Los mensajes que se piden al equipo se eligen en Ajustes.' : 'Sin sesión con el equipo.'}</p> : (
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[12.5px] leading-relaxed font-mono text-slate-300 max-h-[420px] overflow-auto whitespace-pre-wrap">
                {registro.map((l) => `${l.hora} (${l.etiqueta}) ${l.texto}`).join('\n')}
              </pre>
            )}
            <p className="text-[13px] text-slate-400">Las horas son las del reloj del equipo.</p>
          </Tarjeta>

          <Tarjeta aria-label="Estadísticas del equipo" className="flex flex-col gap-2" id="wx3-stats">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Estadísticas del equipo</h2>
              <span className="text-[13px] text-slate-400">print stats{sesion.ultimaConsulta ? ` · ${haceCuanto(sesion.ultimaConsulta, ahora)}` : ''}</span>
            </div>
            {datos.estadisticas.length === 0 ? <p className="text-sm text-slate-400">{conectado ? 'Todavía sin respuesta del equipo.' : 'Sin sesión con el equipo.'}</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {datos.estadisticas.map((d, i) => (
                  <div key={`${d.etiqueta}-${i}`} className="flex justify-between gap-3 border-t border-slate-800 py-1.5 text-sm">
                    <span className="text-slate-400 min-w-0">{d.etiqueta}</span><span className="font-mono text-slate-100 text-right">{d.valor}</span>
                  </div>
                ))}
              </div>
            )}
            {admin && datos.bruto && Object.keys(datos.bruto).length > 0 && (
              <>
                <button type="button" className={`${boton} self-start`} aria-expanded={verBruto} onClick={() => setVerBruto((v) => !v)}>{verBruto ? 'Ocultar las respuestas tal cual' : 'Ver las respuestas tal cual'}</button>
                {verBruto && <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[12px] font-mono text-slate-300 max-h-80 overflow-auto whitespace-pre-wrap">{Object.entries(datos.bruto as Record<string, { texto: string; cuando: number }>).map(([o, b]) => `> ${o}   (${horaSeg(b.cuando)} UTC)\n${b.texto || '(sin texto)'}`).join('\n\n')}</pre>}
              </>
            )}
          </Tarjeta>
        </div>

        <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Reparto de funciones" className="flex flex-col gap-2.5" id="wx3-reparto">
            <h2 className="text-lg font-semibold text-slate-100">Reparto de funciones en la estación</h2>
            <p className="text-[13px] text-slate-400">Qué hace cada uno, según direwolf.conf, aprx.conf y el .cfg del WX3in1 (la consola emite por Direwolf). «?»: no se encuentra su configuración. Los choques suponen que los tres trabajan en la misma frecuencia.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="font-normal py-1 pr-2">Función</th><th className="font-normal py-1 px-2 text-center">Direwolf</th><th className="font-normal py-1 px-2 text-center">aprx</th><th className="font-normal py-1 pl-2 text-center">WX3in1</th></tr></thead>
                <tbody>
                  {reparto.filas.map((f) => (
                    <tr key={f.funcion} className="border-t border-slate-800">
                      <td className="py-2 pr-2 text-slate-100">{f.funcion}</td>
                      {([f.consola, f.aprx, f.wx3in1] as Celda[]).map((c, i) => <td key={i} className={`py-2 px-2 text-center font-semibold ${CELDA[c].clase}`}>{CELDA[c].texto}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reparto.conflictos.map((c) => (
              <p key={c.id} role={c.nivel === 'aviso' ? 'alert' : undefined} className={c.nivel === 'aviso' ? 'border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm' : 'text-sm text-slate-400'}>{c.texto}</p>
            ))}
            {admin && digiConflicto && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} onClick={() => enviar('/api/radio/wx3in1/orden', { accion: 'digi-solo-wx3in1' }, 'Se comentan las líneas DIGIPEAT de direwolf.conf (queda copia del archivo) y se reinicia Direwolf: durante unos segundos no emite. ¿Seguir?')}>Digi solo en el WX3in1</button>
                <button type="button" className={boton} onClick={() => bajar(true)}>Digi solo en Direwolf</button>
              </div>
            )}
            {admin && digiConflicto && <p className="text-[13px] text-slate-400">«Digi solo en Direwolf» descarga el .cfg del WX3in1 sin digipetidor: hay que cargarlo en el equipo con el Configurador (USB). La configuración del equipo no se puede cambiar desde aquí.</p>}
          </Tarjeta>

          <Tarjeta aria-label="Configuración del WX3in1" className="flex flex-col gap-2.5" id="wx3-cfg">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Configuración (wx3cfg)</h2>
              {cfg && <span className="text-[13px] text-slate-400">{cfg.nombre} · {haceCuanto(cfg.cuando, ahora)}</span>}
            </div>
            {!cfg ? <p className="text-sm text-slate-400">Todavía no hay ningún .cfg. Guárdelo desde el Configurador oficial («Save to file») y cárguelo aquí.</p>
              : cfg.error ? <p className="text-sm text-amber-300">No se pudo comprobar: {cfg.error}.</p> : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className={cfg.counts?.error ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>{cfg.counts?.error ?? 0} errores</span>
                  <span className={cfg.counts?.warning ? 'text-amber-300 font-semibold' : 'text-slate-400'}>{cfg.counts?.warning ?? 0} avisos</span>
                  <span className="text-slate-400">{cfg.counts?.info ?? 0} informativos</span>
                </div>
                {cfg.items.length > 0 && (
                  <ul className="flex flex-col gap-1.5 text-sm text-slate-300 list-disc pl-5">
                    {cfg.items.slice(0, 12).map((x, i) => (
                      <li key={i}><span className={x.level === 'error' ? 'text-red-400' : x.level === 'warning' ? 'text-amber-300' : 'text-slate-400'}>{x.level === 'error' ? 'Error' : x.level === 'warning' ? 'Aviso' : 'Info'}</span> · {x.section}{x.key && x.key !== '*' ? ` / ${x.key}` : ''}: {x.text}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {admin && (
              <div className="flex flex-wrap gap-2">
                <input ref={archivo} type="file" accept=".cfg" className="hidden" id="wx3-archivo" onChange={(e) => subirCfg(e.target.files?.[0])} />
                <label htmlFor="wx3-archivo" className={`${boton} inline-flex items-center`}>Comprobar un .cfg</label>
                <button type="button" className={boton} disabled={!cfg || !!cfg.error} onClick={() => bajar(false)}>Descargar corregido</button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-400 grow basis-40">Passcode APRS-IS de
                <input className={campo} value={calcular} onChange={(e) => setCalcular(e.target.value.toUpperCase().slice(0, 9))} placeholder="EA7XXX" autoCapitalize="characters" />
              </label>
              <span className="min-h-[44px] flex items-center font-mono text-lg text-slate-100" aria-live="polite">{/^[A-Z0-9]{3,6}(-\d{1,2})?$/.test(calcular) ? passcode(calcular) : '—'}</span>
            </div>
            <p className="text-[13px] text-slate-400">El archivo se carga en el equipo con «Read from file» y «Write config» del Configurador oficial (USB). Herramienta y manual v1.13: github.com/EA7JRS/wx3in1.</p>
          </Tarjeta>

          <Tarjeta aria-label="Vía de emisión de respaldo" className="flex flex-col gap-2.5" id="wx3-respaldo">
            <h2 className="text-lg font-semibold text-slate-100">Vía de emisión de respaldo</h2>
            <p className="text-sm text-slate-300">Si Direwolf no acepta un aviso urgente (servicio parado o sin conexión KISS), sale por el WX3in1 y su emisora, a través de su servidor APRS-IS simple ({datos.ajustes.equipo || '—'}:{datos.ajustes.isPuerto}). Si Direwolf lo acepta pero su radio falla, la consola no lo puede saber.</p>
            <label className="flex items-center gap-2.5 min-h-[44px] text-sm text-slate-100">
              <input type="checkbox" className="w-5 h-5 accent-sky-500" checked={respaldo.activo} disabled={!admin} onChange={(e) => enviar('/api/radio/wx3in1/config', { respaldo: e.target.checked })} />
              Usar el WX3in1 si Direwolf no acepta un aviso urgente
            </label>
            <div className="text-[13px] text-slate-400">
              {!respaldo.txActiva ? 'La emisión está desactivada (SAT_APRS_TX): no sale nada al aire.' : respaldo.cuando ? <>Último uso {haceCuanto(respaldo.cuando, ahora)}: <span className={respaldo.ok ? 'text-emerald-400' : 'text-amber-300'}>{respaldo.texto}</span></> : 'Sin usar todavía.'}
              {r && !r.aprsis_server.on && <span className="text-amber-300"> · Según su .cfg, el servidor APRS-IS simple del equipo está desactivado.</span>}
            </div>
            {admin && <button type="button" className={`${boton} self-start`} disabled={!respaldo.txActiva || sinEquipo} onClick={() => enviar('/api/radio/wx3in1/orden', { accion: 'probar-respaldo' }, 'Se emite por el WX3in1 un estado de prueba («Prueba de la via de respaldo»). ¿Seguir?')}>Probar con un paquete</button>}
            <p className="text-[13px] text-amber-300">Ese servidor del equipo emite sin límites lo que le llega: contraseña propia y solo desde la red local.</p>
          </Tarjeta>

          <Tarjeta aria-label="Estadísticas por HTTP" className="flex flex-col gap-2" id="wx3-http">
            <h2 className="text-lg font-semibold text-slate-100">Estadísticas por HTTP (Statistics upload)</h2>
            <p className="text-sm text-slate-300">Para que el equipo las mande aquí, en su Configurador (Remote access → Statistics upload): servidor <span className="font-mono">{typeof window !== 'undefined' ? window.location.hostname : '—'}</span>, puerto <span className="font-mono">{datos.estadisticasHttp.puerto}</span>, ruta <span className="font-mono">{datos.estadisticasHttp.ruta.replace(/^\//, '')}</span>.</p>
            {datos.estadisticasHttp.peticiones.length === 0 ? (
              <p className="text-sm text-slate-400">● Esperando la primera petición. Su formato no está documentado: se guarda tal cual para poder leerlo.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {datos.estadisticasHttp.peticiones.map((p, i) => (
                  <div key={i} className="border border-slate-800 rounded-lg p-2.5 text-[13px]">
                    <div className="text-slate-400">{haceCuanto(p.cuando, ahora)} · {p.metodo} desde {p.desde}</div>
                    <div className="font-mono text-slate-100 break-all">{p.ruta}</div>
                    {p.cuerpo && <pre className="font-mono text-slate-300 whitespace-pre-wrap break-all mt-1">{p.cuerpo}</pre>}
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta aria-label="Ajustes" className="flex flex-col gap-2.5" id="wx3-ajustes">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Ajustes</h2>
              {admin && !ajustes && <button type="button" className={boton} onClick={abrirAjustes}>Cambiar</button>}
            </div>
            {!ajustes ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ['Equipo', datos.ajustes.equipo || '—'], ['Telnet', `${datos.ajustes.usuario}@${datos.ajustes.telnet}${datos.ajustes.claveGuardada ? ' · contraseña guardada' : ' · sin contraseña'}`],
                  ['Depuración pedida', datos.ajustes.depuracion.join(', ') || 'ninguna'], ['Consulta', `cada ${datos.ajustes.intervalo} s`],
                  ['Servidor APRS-IS simple', `${datos.ajustes.isUsuario}@${datos.ajustes.isPuerto}${datos.ajustes.isClaveGuardada ? ' · contraseña guardada' : ' · sin contraseña'}`],
                ] as Array<[string, string]>).map(([k, v]) => <div key={k} className="min-w-0"><div className="text-xs text-slate-400">{k}</div><div className="font-mono text-slate-100 break-words">{v}</div></div>)}
              </div>
            ) : (
              <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); guardarAjustes(); }}>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1 text-xs text-slate-400 col-span-2">Dirección del equipo<input className={campo} value={ajustes.equipo} onChange={(e) => setAjustes({ ...ajustes, equipo: e.target.value })} placeholder="192.168.1.50" /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Puerto telnet<input className={campo} inputMode="numeric" value={ajustes.telnet} onChange={(e) => setAjustes({ ...ajustes, telnet: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Consulta cada (s)<input className={campo} inputMode="numeric" value={ajustes.intervalo} onChange={(e) => setAjustes({ ...ajustes, intervalo: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Usuario telnet<input className={campo} value={ajustes.usuario} onChange={(e) => setAjustes({ ...ajustes, usuario: e.target.value })} autoComplete="off" /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Contraseña telnet<input className={campo} type="password" value={ajustes.clave} onChange={(e) => setAjustes({ ...ajustes, clave: e.target.value })} placeholder={datos.ajustes.claveGuardada ? 'guardada (vacío: no cambia)' : ''} autoComplete="new-password" /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Puerto APRS-IS simple<input className={campo} inputMode="numeric" value={ajustes.isPuerto} onChange={(e) => setAjustes({ ...ajustes, isPuerto: e.target.value })} /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Usuario APRS-IS simple<input className={campo} value={ajustes.isUsuario} onChange={(e) => setAjustes({ ...ajustes, isUsuario: e.target.value })} autoComplete="off" /></label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400 col-span-2">Contraseña APRS-IS simple<input className={campo} type="password" value={ajustes.isClave} onChange={(e) => setAjustes({ ...ajustes, isClave: e.target.value })} placeholder={datos.ajustes.isClaveGuardada ? 'guardada (vacío: no cambia)' : ''} autoComplete="new-password" /></label>
                </div>
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-xs text-slate-400 mb-1">Mensajes de depuración que se piden al equipo</legend>
                  <div className="flex flex-wrap gap-x-4">
                    {DEPURACION.map(([k, n]) => (
                      <label key={k} className="flex items-center gap-2 min-h-[40px] text-sm text-slate-100">
                        <input type="checkbox" className="w-4 h-4 accent-sky-500" checked={ajustes.depuracion.includes(k)} onChange={(e) => setAjustes({ ...ajustes, depuracion: e.target.checked ? [...ajustes.depuracion, k] : ajustes.depuracion.filter((x) => x !== k) })} />{n}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={boton}>Guardar</button>
                  <button type="button" className={boton} onClick={() => setAjustes(null)}>Cancelar</button>
                </div>
              </form>
            )}
            {admin && !ajustes && !sinEquipo && <button type="button" className={`${boton} self-start`} onClick={() => enviar('/api/radio/wx3in1/orden', { accion: 'reconectar' })}>Volver a conectar</button>}
            <p className="text-[13px] text-slate-400">La consola mantiene una sesión telnet abierta con el equipo. Si entra a mano por telnet a la vez, el equipo puede cerrar una de las dos.</p>
          </Tarjeta>
          {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{aviso.texto}</p>}
        </div>
      </div>
    </div>
  );
}
