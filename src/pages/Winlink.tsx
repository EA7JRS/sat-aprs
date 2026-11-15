// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Winlink: el correo por radio que lleva Pat. Aquí se ve y se maneja
// lo que Pat tiene de verdad (su buzón, sus alias de conexión, la lista de
// pasarelas RMS que descarga de winlink.org) a través de su API HTTP.
// Si Pat no contesta, se dice; no hay buzón de ejemplo.
import React, { useEffect, useMemo, useState } from 'react';
import type { TelemetryConfig } from '../types';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { haceCuanto } from '../utils/useAvisos';
import { Estado, duracion } from '../components/radio/Piezas';

type Guardar = (cambios: Partial<TelemetryConfig>) => Promise<boolean>;
type BuzonVisible = 'in' | 'out' | 'sent';
interface Mensaje { mid: string; fecha: string | null; de: string; para: string[]; cc: string[]; asunto: string; cuerpo?: string; adjuntos: { nombre: string; bytes: number | null }[]; soloP2P: boolean; sinLeer: boolean }
interface Sesion { destino: string; desde: number; fin: number | null; recibidos: number | null; error: string | null }
interface Datos {
  url: string;
  servicio: { nombre: string; estado: 'active' | 'inactive' | 'failed' | null; desde: number | null };
  alcanzable: boolean; error: string | null; leido: number;
  conectado: boolean; marcando: boolean; remoto: string; escuchas: string[];
  indicativo: string; locator: string; alias: { nombre: string; destino: string }[];
  buzones: Record<BuzonVisible, Mensaje[]>;
  cuentas: { in: number; sinLeer: number; out: number; sent: number };
  sesion: Sesion | null;
  modosRms: string[];
}
interface Rms { indicativo: string; locator: string; km: number | null; acimut: number | null; modos: string; khz: number | null; frecuencia: string; url: string; calidad: number | null }

const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';
const botonFuerte = 'min-h-[44px] px-4 rounded-lg border border-sky-500 bg-sky-900 text-slate-50 font-semibold cursor-pointer hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;
const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const NOMBRE_BUZON: Record<BuzonVisible, string> = { in: 'Entrada', out: 'Salida', sent: 'Enviados' };
const NOMBRE_MODO: Record<string, string> = { packet: 'Packet (AX.25)', ardop: 'ARDOP', varafm: 'VARA FM', varahf: 'VARA HF', pactor: 'PACTOR', telnet: 'Telnet' };

const fechaCorta = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}Z`;
};
const tamano = (b: number | null) => (b === null ? '' : b < 1024 ? `${b} B` : `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} kB`);
/** Las URL de conexión pueden llevar la contraseña del CMS: no se enseña. */
const sinClave = (u: string) => u.replace(/(:\/\/[^:/@]*:)[^@]*@/, '$1•••@');

async function orden(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await customFetch('/api/radio/winlink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: j.error || `Error ${r.status}` };
  } catch { return { ok: false, error: 'Sin conexión con la consola.' }; }
}

export default function Winlink({ config, onGuardar }: { config: TelemetryConfig; onGuardar: Guardar }) {
  const admin = useAdminSession().admin;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [vuelta, setVuelta] = useState(0);
  const [buzon, setBuzon] = useState<BuzonVisible>('in');
  const [abierto, setAbierto] = useState<{ buzon: BuzonVisible; m: Mensaje } | null>(null);
  const [redactar, setRedactar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/radio/winlink').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta]);
  const releer = () => setVuelta((v) => v + 1);

  const abrir = async (b: BuzonVisible, m: Mensaje) => {
    if (!admin) { setAviso({ ok: false, texto: 'Para leer el correo hace falta la sesión de administrador.' }); return; }
    setAbierto({ buzon: b, m });
    try {
      const r = await customFetch(`/api/radio/winlink/mensaje?buzon=${b}&mid=${encodeURIComponent(m.mid)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setAbierto({ buzon: b, m: j.mensaje });
      if (b === 'in' && m.sinLeer) { await orden({ accion: 'leido', buzon: b, mid: m.mid }); releer(); }
    } catch (e: any) { setAviso({ ok: false, texto: e?.message || 'No se pudo abrir el mensaje.' }); }
  };

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · Winlink</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }
  const s = datos.servicio;
  const c = datos.cuentas;
  const sesionViva = datos.sesion && datos.sesion.fin === null;
  const lista = datos.buzones[buzon];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · Winlink</h1>

      <section aria-label="Estado de Winlink" className="flex flex-wrap gap-3">
        <Estado id="wl-servicio" titulo="Servicio Pat" ok={s.estado === 'active' ? true : s.estado === null || datos.alcanzable ? null : false}
          texto={s.estado === null ? 'Sin systemd' : s.estado === 'active' ? 'Activo' : s.estado === 'failed' ? 'Ha fallado' : datos.alcanzable ? 'Fuera de systemd' : 'Parado'}
          detalle={s.estado === 'active' && s.desde ? `en marcha desde hace ${duracion(s.desde, ahora)}`
            : s.estado !== 'active' && datos.alcanzable ? `Pat contesta, pero no como ${s.nombre}.service (¿pat@usuario? se cambia en Ajustes)` : `systemd: ${s.nombre}.service`} />
        <Estado id="wl-api" titulo="Pat (API HTTP)" ok={datos.alcanzable} texto={datos.alcanzable ? `Contesta · ${datos.indicativo || 'sin indicativo'}` : 'No contesta'}
          detalle={datos.alcanzable ? <>{datos.url}{datos.locator ? ` · ${datos.locator}` : ''}</> : (datos.error || datos.url)} />
        <Estado id="wl-enlace" titulo="Enlace" ok={!datos.alcanzable ? null : datos.conectado || datos.marcando ? true : datos.sesion?.error ? false : null}
          texto={datos.conectado ? `Conectado${datos.remoto ? ` con ${datos.remoto}` : ''}` : datos.marcando ? 'Llamando…' : sesionViva ? 'Abriendo sesión…' : 'Sin sesión'}
          detalle={datos.sesion ? (datos.sesion.fin === null ? `${sinClave(datos.sesion.destino)} · desde hace ${duracion(datos.sesion.desde, ahora)}`
            : `última: ${sinClave(datos.sesion.destino)} ${haceCuanto(datos.sesion.fin, ahora)} · ${datos.sesion.error ?? `${datos.sesion.recibidos ?? 0} recibido(s)`}`)
            : datos.escuchas.length ? `escuchando por ${datos.escuchas.join(', ')}` : 'sin escuchas abiertas'} />
        <Estado id="wl-buzon" titulo="Buzón" ok={datos.alcanzable ? true : null}
          texto={datos.alcanzable ? `${c.sinLeer} sin leer · ${c.out} por salir` : '—'}
          detalle={datos.alcanzable ? `${c.in} en entrada · ${c.sent} enviados` : 'sin datos de Pat'} />
      </section>

      {!datos.alcanzable && (
        <p className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm" id="wl-sin-pat">
          <b>Pat no contesta en {datos.url}.</b> La consola habla con Pat por su API HTTP: arranca «pat http» (o el servicio
          <span className="font-mono"> pat@usuario</span> del paquete de Debian) y comprueba <span className="font-mono">http_addr</span> en su config.json. Abajo, en Ajustes, se cambia la dirección.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Buzón" className="flex flex-col gap-2" id="wl-buzones">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Buzón</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Carpeta">
                {(['in', 'out', 'sent'] as const).map((b) => (
                  <button key={b} type="button" className={pastilla(buzon === b)} aria-pressed={buzon === b} onClick={() => { setBuzon(b); setAbierto(null); }}>
                    {NOMBRE_BUZON[b]} <span className="font-mono text-slate-400">{c[b]}</span>
                  </button>
                ))}
                {admin && <button type="button" className={botonFuerte} disabled={!datos.alcanzable} onClick={() => { setRedactar(true); setAbierto(null); }}>Redactar</button>}
              </div>
            </div>
            {!admin ? <p className="text-sm text-slate-400">Para ver el correo hace falta la sesión de administrador.</p> : lista.length === 0 ? <p className="text-sm text-slate-400">{datos.alcanzable ? `Nada en ${NOMBRE_BUZON[buzon].toLowerCase()}.` : 'Sin datos de Pat.'}</p> : (
              <div className="overflow-auto max-h-[460px]">
                <table className="w-full text-sm" id="wl-lista">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900">
                      <th className="font-normal py-1 pr-3">Fecha (UTC)</th><th className="font-normal py-1 pr-3">{buzon === 'in' ? 'De' : 'Para'}</th><th className="font-normal py-1">Asunto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((m) => (
                      <tr key={m.mid} className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/60 ${abierto?.m.mid === m.mid ? 'bg-slate-800/60' : ''}`}
                        onClick={() => abrir(buzon, m)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') abrir(buzon, m); }}>
                        <td className="py-2 pr-3 font-mono text-slate-400 whitespace-nowrap">{fechaCorta(m.fecha)}</td>
                        <td className={`py-2 pr-3 font-mono whitespace-nowrap ${m.sinLeer ? 'text-slate-50 font-bold' : 'text-slate-200'}`}>{buzon === 'in' ? m.de : (m.para.join(', ') || '—')}</td>
                        <td className={`py-2 ${m.sinLeer ? 'text-slate-50 font-semibold' : 'text-slate-300'}`}>
                          {m.sinLeer && <span className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-2 align-middle" aria-label="sin leer" />}
                          {m.asunto || '(sin asunto)'}
                          {m.adjuntos.length > 0 && <span className="text-slate-400 text-xs"> · {m.adjuntos.length} adjunto{m.adjuntos.length === 1 ? '' : 's'}</span>}
                          {m.soloP2P && <span className="text-amber-300 text-xs"> · solo P2P</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {buzon === 'out' && lista.length > 0 && <p className="text-[13px] text-slate-400">Estos mensajes salen en la próxima sesión con una pasarela (Conectar).</p>}
          </Tarjeta>

          {abierto && <Lectura abierto={abierto} onCerrar={() => setAbierto(null)} onResponder={() => setRedactar(true)} />}
          {redactar && (
            <Redactar indicativo={datos.indicativo} respuesta={abierto?.buzon === 'in' ? abierto.m : null}
              onCerrar={() => setRedactar(false)} onEnviado={() => { setRedactar(false); setBuzon('out'); setAbierto(null); setAviso({ ok: true, texto: 'Mensaje en la bandeja de salida: sale en la próxima sesión.' }); releer(); }} />
          )}
        </div>

        <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
          <Conectar datos={datos} admin={admin} ahora={ahora} onCambio={releer} onAviso={setAviso} />
          <Pasarelas admin={admin} alcanzable={datos.alcanzable} modos={datos.modosRms} />
          <Ajustes datos={datos} config={config} admin={admin} onGuardar={onGuardar} onCambio={releer} onAviso={setAviso} />
          {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status" id="wl-aviso">{aviso.texto}</p>}
        </div>
      </div>
    </div>
  );
}

function Lectura({ abierto, onCerrar, onResponder }: { abierto: { buzon: BuzonVisible; m: Mensaje }; onCerrar: () => void; onResponder: () => void }) {
  const { m, buzon } = abierto;
  return (
    <Tarjeta aria-label="Mensaje" className="flex flex-col gap-3" id="wl-mensaje">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-100 break-words">{m.asunto || '(sin asunto)'}</h2>
          <div className="text-sm text-slate-400 font-mono break-words">
            De {m.de || '—'} · Para {m.para.join(', ') || '—'}{m.cc.length ? ` · Cc ${m.cc.join(', ')}` : ''} · {fechaCorta(m.fecha)}
          </div>
        </div>
        <div className="flex gap-2">
          {buzon === 'in' && <button type="button" className={boton} onClick={onResponder}>Responder</button>}
          <button type="button" className={boton} onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
      {m.cuerpo === undefined ? <p className="text-sm text-slate-400">Abriendo…</p> : (
        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[14px] font-mono text-slate-200 max-h-[420px] overflow-auto whitespace-pre-wrap break-words">{m.cuerpo || '(vacío)'}</pre>
      )}
      {m.adjuntos.length > 0 && (
        <p className="text-sm text-slate-300">Adjuntos: {m.adjuntos.map((a) => `${a.nombre}${a.bytes !== null ? ` (${tamano(a.bytes)})` : ''}`).join(' · ')} <span className="text-slate-400">— se abren desde la web de Pat.</span></p>
      )}
    </Tarjeta>
  );
}

function Redactar({ indicativo, respuesta, onCerrar, onEnviado }: { indicativo: string; respuesta: Mensaje | null; onCerrar: () => void; onEnviado: () => void }) {
  const [para, setPara] = useState(respuesta?.de ?? '');
  const [cc, setCc] = useState('');
  const [asunto, setAsunto] = useState(respuesta ? (/^re:/i.test(respuesta.asunto) ? respuesta.asunto : `Re: ${respuesta.asunto}`) : '');
  const [cuerpo, setCuerpo] = useState(respuesta?.cuerpo ? `\n\n--- ${respuesta.de} escribió:\n${respuesta.cuerpo.replace(/\r\n/g, '\n').split('\n').map((l) => `> ${l}`).join('\n')}` : '');
  const [soloP2P, setSoloP2P] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const bytes = useMemo(() => new TextEncoder().encode(cuerpo).length, [cuerpo]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setFallo('');
    const r = await orden({ accion: 'enviar', para, cc, asunto, cuerpo, soloP2P });
    setEnviando(false);
    if (r.ok) onEnviado(); else setFallo(r.error || 'No se pudo.');
  };
  return (
    <Tarjeta aria-label="Redactar" className="flex flex-col gap-3" id="wl-redactar">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">{respuesta ? 'Responder' : 'Nuevo mensaje'}</h2>
        <span className="text-sm text-slate-400 font-mono">De {indicativo || '—'}</span>
      </div>
      <form className="flex flex-col gap-3" onSubmit={enviar}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-300">Para
            <input className={`${campo} font-mono`} value={para} onChange={(e) => setPara(e.target.value)} placeholder="EA7XXX, alguien@correo.es" required id="wl-para" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">Copia (opcional)
            <input className={`${campo} font-mono`} value={cc} onChange={(e) => setCc(e.target.value)} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Asunto
          <input className={campo} value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={128} required id="wl-asunto" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Texto
          <textarea className={`${campo} min-h-[180px] py-2 font-mono text-[14px]`} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} id="wl-cuerpo" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300 min-h-[44px]">
            <input type="checkbox" checked={soloP2P} onChange={(e) => setSoloP2P(e.target.checked)} className="w-5 h-5" /> Solo P2P (no pasa por los CMS)
          </label>
          <span className="text-[13px] text-slate-400">{bytes} bytes · por radio, cuanto más corto, mejor</span>
        </div>
        {fallo && <p className="text-sm text-amber-300" role="alert">{fallo}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={botonFuerte} disabled={enviando}>{enviando ? 'Guardando…' : 'A la bandeja de salida'}</button>
          <button type="button" className={boton} onClick={onCerrar}>Descartar</button>
        </div>
        <p className="text-[13px] text-slate-400">No se transmite al pulsar: queda en la bandeja de salida de Pat y sale en la próxima sesión.</p>
      </form>
    </Tarjeta>
  );
}

function Conectar({ datos, admin, ahora, onCambio, onAviso }: { datos: Datos; admin: boolean; ahora: number; onCambio: () => void; onAviso: (a: { ok: boolean; texto: string } | null) => void }) {
  const [destino, setDestino] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const viva = (datos.sesion && datos.sesion.fin === null) || datos.conectado || datos.marcando;
  const conectar = async (d: string) => {
    const radio = !/^telnet/i.test(d) && !datos.alias.find((a) => a.nombre === d && /^telnet:/i.test(a.destino));
    if (!window.confirm(radio
      ? `Se abre una sesión Winlink con «${sinClave(d)}». Pat transmitirá por radio con ${datos.indicativo || 'tu indicativo'}. ¿Seguir?`
      : `Se abre una sesión Winlink por Internet (telnet) con «${sinClave(d)}». ¿Seguir?`)) return;
    setOcupado(true);
    const r = await orden({ accion: 'conectar', destino: d });
    setOcupado(false);
    onAviso(r.ok ? { ok: true, texto: `Sesión abierta con ${sinClave(d)}.` } : { ok: false, texto: r.error || 'No se pudo.' });
    onCambio();
  };
  const cortar = async () => {
    const r = await orden({ accion: 'desconectar' });
    onAviso(r.ok ? { ok: true, texto: 'Pedido el corte de la sesión.' } : { ok: false, texto: r.error || 'No se pudo cortar.' });
    onCambio();
  };
  return (
    <Tarjeta aria-label="Conectar" className="flex flex-col gap-3" id="wl-conectar">
      <h2 className="text-lg font-semibold text-slate-100">Sesión</h2>
      {datos.sesion && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${datos.sesion.fin === null ? 'border-sky-600 bg-sky-950 text-sky-200' : datos.sesion.error ? 'border-amber-700 bg-amber-950 text-amber-300' : 'border-emerald-700 bg-emerald-950 text-emerald-300'}`}>
          {datos.sesion.fin === null
            ? <>En curso con <span className="font-mono">{sinClave(datos.sesion.destino)}</span> desde hace {duracion(datos.sesion.desde, ahora)}.</>
            : <>Última con <span className="font-mono">{sinClave(datos.sesion.destino)}</span>, {haceCuanto(datos.sesion.fin, ahora)}: {datos.sesion.error ?? `bien, ${datos.sesion.recibidos ?? 0} recibido(s)`}.</>}
        </div>
      )}
      {!admin ? <p className="text-sm text-slate-400">Para abrir una sesión hace falta la sesión de administrador.</p> : (
        <>
          {datos.alias.length === 0 ? <p className="text-sm text-slate-400">{datos.alcanzable ? 'Pat no tiene alias de conexión.' : 'Sin datos de Pat.'}</p> : (
            <div className="flex flex-col gap-2" role="group" aria-label="Alias de Pat">
              {datos.alias.map((a) => (
                <button key={a.nombre} type="button" className="min-h-[44px] text-left rounded-lg border border-slate-700 px-3 py-2 hover:border-sky-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!!viva || ocupado || !datos.alcanzable} onClick={() => conectar(a.nombre)}>
                  <div className="font-semibold text-slate-100">{a.nombre}</div>
                  <div className="font-mono text-xs text-slate-400 break-all">{sinClave(a.destino)}</div>
                </button>
              ))}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (destino.trim()) conectar(destino.trim()); }}>
            <input className={`${campo} font-mono`} value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="ax25:///EA7XXX-10" aria-label="Otro destino" id="wl-destino" />
            <button type="submit" className={botonFuerte} disabled={!!viva || ocupado || !datos.alcanzable || !destino.trim()}>Conectar</button>
          </form>
          {viva && <button type="button" className={boton} onClick={cortar}>Cortar la sesión</button>}
          <p className="text-[13px] text-slate-400">Con Pat se envía lo que hay en Salida y se recibe lo pendiente. Por radio, Pat transmite: elige frecuencia y modo antes (o usa el alias que ya los lleva).</p>
        </>
      )}
    </Tarjeta>
  );
}

function Pasarelas({ admin, alcanzable, modos }: { admin: boolean; alcanzable: boolean; modos: string[] }) {
  const [modo, setModo] = useState('packet');
  const [banda, setBanda] = useState('');
  const [rms, setRms] = useState<Rms[] | null>(null);
  const [estado, setEstado] = useState('');
  const buscar = async (forzar = false) => {
    setEstado('Buscando…');
    try {
      const r = await customFetch(`/api/radio/winlink/rms?modo=${modo}&banda=${encodeURIComponent(banda)}${forzar ? '&forzar=1' : ''}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRms(j.rms); setEstado(j.rms.length ? '' : 'Ninguna pasarela con esos filtros.');
    } catch (e: any) { setEstado(e?.message || 'No se pudo.'); }
  };
  return (
    <Tarjeta aria-label="Pasarelas RMS" className="flex flex-col gap-3" id="wl-rms">
      <h2 className="text-lg font-semibold text-slate-100">Pasarelas RMS</h2>
      {!admin ? <p className="text-sm text-slate-400">Hace falta la sesión de administrador.</p> : (
        <>
          <div className="flex flex-wrap gap-2">
            <select className={`${campo} w-auto`} value={modo} onChange={(e) => setModo(e.target.value)} aria-label="Modo">
              {modos.map((m) => <option key={m} value={m}>{NOMBRE_MODO[m] ?? m}</option>)}
            </select>
            <select className={`${campo} w-auto`} value={banda} onChange={(e) => setBanda(e.target.value)} aria-label="Banda">
              <option value="">Todas las bandas</option>
              {['2m', '70cm', '6m', '10m', '20m', '30m', '40m', '80m'].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <button type="button" className={boton} disabled={!alcanzable} onClick={() => buscar(false)}>Buscar</button>
            <button type="button" className={boton} disabled={!alcanzable} onClick={() => buscar(true)} title="Descarga de nuevo la lista de winlink.org">Actualizar lista</button>
          </div>
          {estado && <p className="text-sm text-slate-400" role="status">{estado}</p>}
          {rms && rms.length > 0 && (
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full text-sm" id="wl-rms-tabla">
                <thead><tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900"><th className="font-normal py-1 pr-2">Pasarela</th><th className="font-normal py-1 pr-2 text-right">km</th><th className="font-normal py-1 pr-2">Frecuencia</th><th className="font-normal py-1 text-right">Calidad</th></tr></thead>
                <tbody>
                  {rms.map((r) => (
                    <tr key={r.url} className="border-t border-slate-800" title={r.url}>
                      <td className="py-1.5 pr-2"><div className="font-mono text-slate-100">{r.indicativo}</div><div className="text-xs text-slate-400">{r.locator}{r.acimut !== null ? ` · ${Math.round(r.acimut)}°` : ''} · {r.modos}</div></td>
                      <td className="py-1.5 pr-2 text-right font-mono text-slate-300">{r.km === null ? '—' : r.km < 100 ? r.km.toFixed(1) : Math.round(r.km)}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-300 whitespace-nowrap">{r.khz ? `${(r.khz / 1000).toFixed(r.khz >= 100000 ? 4 : 3)} MHz` : r.frecuencia || '—'}</td>
                      <td className="py-1.5 text-right font-mono text-slate-300">{r.calidad === null ? '—' : `${r.calidad} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[13px] text-slate-400">La lista la descarga Pat de winlink.org (y la guarda). La calidad sale de su predicción de propagación, si la tiene.</p>
        </>
      )}
    </Tarjeta>
  );
}

function Ajustes({ datos, config, admin, onGuardar, onCambio, onAviso }: { datos: Datos; config: TelemetryConfig; admin: boolean; onGuardar: Guardar; onCambio: () => void; onAviso: (a: { ok: boolean; texto: string } | null) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState(config.patUrl || datos.url);
  const [servicio, setServicio] = useState(config.patServicio || datos.servicio.nombre);
  const [registro, setRegistro] = useState<string | null>(null);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onGuardar({ patUrl: url.trim(), patServicio: servicio.trim() });
    onAviso(ok ? { ok: true, texto: 'Ajustes de Pat guardados.' } : { ok: false, texto: 'No se pudo guardar.' });
    if (ok) { setAbierto(false); onCambio(); }
  };
  const verRegistro = async () => {
    if (registro !== null) { setRegistro(null); return; }
    setRegistro('Leyendo…');
    try { const j = await (await customFetch('/api/system/journal?servicio=pat')).json(); setRegistro(String(j.logs ?? '')); } catch { setRegistro('No se pudo leer el registro.'); }
  };
  const reiniciar = async () => {
    if (!window.confirm(`Se reinicia ${datos.servicio.nombre}: si hay una sesión en curso, se corta. ¿Seguir?`)) return;
    onAviso({ ok: true, texto: 'Reiniciando…' });
    const r = await orden({ accion: 'reiniciar' });
    onAviso(r.ok ? { ok: true, texto: 'Pat reiniciado.' } : { ok: false, texto: r.error || 'No se pudo.' });
    onCambio();
  };
  return (
    <Tarjeta aria-label="Pat" className="flex flex-col gap-3" id="wl-ajustes">
      <h2 className="text-lg font-semibold text-slate-100">Pat</h2>
      <div className="grid grid-cols-2 gap-3">
        {([['Indicativo', datos.indicativo || null], ['Locator', datos.locator || null], ['API HTTP', datos.url], ['Servicio', `${datos.servicio.nombre}.service`],
          ['Escuchas', datos.escuchas.length ? datos.escuchas.join(', ') : null], ['Leído', datos.leido ? haceCuanto(datos.leido, Date.now()) : null]] as Array<[string, string | null]>).map(([k, v]) => (
          <div key={k} className="min-w-0"><div className="text-xs text-slate-400">{k}</div><div className={`font-mono text-[15px] break-words ${v === null ? 'text-slate-500' : 'text-slate-100'}`}>{v ?? '—'}</div></div>
        ))}
      </div>
      {admin && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={boton} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>Ajustes</button>
          <button type="button" className={boton} aria-expanded={registro !== null} onClick={verRegistro}>{registro !== null ? 'Ocultar registro' : 'Ver registro'}</button>
          <button type="button" className={boton} onClick={reiniciar}>Reiniciar servicio</button>
        </div>
      )}
      {abierto && (
        <form className="flex flex-col gap-3" onSubmit={guardar}>
          <label className="flex flex-col gap-1 text-sm text-slate-300">Dirección de «pat http»
            <input className={`${campo} font-mono`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8080" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">Servicio de systemd
            <input className={`${campo} font-mono`} value={servicio} onChange={(e) => setServicio(e.target.value)} placeholder="pat o pat@usuario" />
          </label>
          <div className="flex gap-2"><button type="submit" className={botonFuerte}>Guardar</button><button type="button" className={boton} onClick={() => setAbierto(false)}>Cancelar</button></div>
        </form>
      )}
      {registro !== null && <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[12px] font-mono text-slate-300 max-h-72 overflow-auto whitespace-pre-wrap">{registro}</pre>}
      <p className="text-[13px] text-slate-400">El indicativo, la contraseña de Winlink y los alias se configuran en Pat (Sistema → Configuración → «Archivos .conf Debian», o su propia web).</p>
    </Tarjeta>
  );
}
