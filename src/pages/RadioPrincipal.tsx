// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Principal: la consola de operación. Equipo por CAT, rotor, cluster
// DX (un spot sintoniza el equipo y gira el rotor) y mensajería (APRS y DAPNET).
import React, { useEffect, useMemo, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { haceCuanto, horaUtc } from '../utils/useAvisos';
import { TelemetryConfig } from '../types';
import { DatosEquipo, PanelEquipo, PanelRotor, ordenRadio } from '../components/radio/EquipoRotor';
import Satelites from '../components/radio/Satelites';
import Grupo from '../components/radio/Grupo';

type Guardar = (cambios: Partial<TelemetryConfig>) => Promise<boolean>;

interface Spot { khz: number; dx: string; de: string; comentario: string; hora: string; cuando: number; banda: string; pais: string | null; rumbo: number | null; distanciaKm: number | null }
interface DatosCluster { configurado: boolean; activo: boolean; estado: string; detalle: string; nodo: string; paises: boolean; spots: Spot[]; lineas: Array<{ cuando: number; texto: string; mia?: boolean }> }
interface Recibido { clave: string; de: string; para: string; texto: string; id?: string; via: 'RF' | 'IS'; cuando: number; veces: number; leido: boolean; boletin: boolean }
interface Enviado { clave: string; para: string; texto: string; id: string; cuando: number; intentos: number; estado: 'pendiente' | 'recibido' | 'rechazado' | 'sin-acuse'; acuseCuando?: number }
interface DatosMensajes { indicativo: string; txEnabled: boolean; sinLeer: number; admin: boolean; recibidos: Recibido[]; enviados: Enviado[]; dapnet: { configurado: boolean; grupo: string; max: number } }

const campo = 'w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-100 text-[15px]';
const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';
const botonPrincipal = 'min-h-[44px] px-5 rounded-lg bg-sky-500 text-slate-950 font-bold cursor-pointer hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;

function useSondeo<T>(url: string, cadaMs: number): [T | null, () => void] {
  const [datos, setDatos] = useState<T | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) setDatos(j); }).catch(() => {});
    leer();
    const t = setInterval(leer, cadaMs);
    return () => { vivo = false; clearInterval(t); };
  }, [url, cadaMs, vuelta]);
  return [datos, () => setVuelta((v) => v + 1)];
}

const ESTADO_CLUSTER: Record<string, { texto: string; color: string }> = {
  conectado: { texto: 'Conectado', color: 'text-emerald-400' },
  conectando: { texto: 'Conectando…', color: 'text-amber-300' },
  desconectado: { texto: 'Desconectado', color: 'text-red-400' },
  parado: { texto: 'Parado', color: 'text-slate-400' },
};

interface AlTocar { puedeSintonizar: boolean; puedeGirar: boolean }

function Cluster({ config, onGuardar, admin, alTocar, onCambio }: { config: TelemetryConfig; onGuardar: Guardar; admin: boolean; alTocar: AlTocar; onCambio: () => void }) {
  const [datos, releer] = useSondeo<DatosCluster>('/api/radio/cluster', 5000);
  const [banda, setBanda] = useState('todas');
  const [ajustes, setAjustes] = useState(false);
  const [host, setHost] = useState(config.clusterHost || '');
  const [puerto, setPuerto] = useState(String(config.clusterPort || 7300));
  const [orden, setOrden] = useState('');
  const [consola, setConsola] = useState(false);
  const [aviso, setAviso] = useState('');
  const [sintonizar, setSintonizar] = useState(true);
  const [girar, setGirar] = useState(true);
  const [elegido, setElegido] = useState('');
  const ahora = Date.now();
  const hace = admin && ((alTocar.puedeSintonizar && sintonizar) || (alTocar.puedeGirar && girar));

  // Tocar un spot: el equipo va a su frecuencia y el rotor a su rumbo (lo que esté conectado y marcado)
  const tocar = async (s: Spot) => {
    setElegido(`${s.dx}-${s.khz}`);
    const errores: string[] = [];
    if (alTocar.puedeSintonizar && sintonizar) { const e = await ordenRadio('equipo', { frecuenciaHz: Math.round(s.khz * 1000) }); if (e) errores.push(e); }
    if (alTocar.puedeGirar && girar && s.rumbo !== null) { const e = await ordenRadio('rotor', { accion: 'ir', az: s.rumbo }); if (e) errores.push(e); }
    setAviso(errores.join(' '));
    onCambio();
  };

  const bandas = useMemo(() => {
    const vistas = new Map<string, number>();
    for (const s of datos?.spots ?? []) if (s.banda) vistas.set(s.banda, (vistas.get(s.banda) ?? 0) + 1);
    return [...vistas.entries()].sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]) || a[0].localeCompare(b[0]));
  }, [datos]);
  const spots = (datos?.spots ?? []).filter((s) => banda === 'todas' || s.banda === banda).slice(0, 40);
  const estado = ESTADO_CLUSTER[datos?.estado ?? 'parado'] ?? ESTADO_CLUSTER.parado;

  const guardar = async (activar: boolean) => {
    const ok = await onGuardar({ clusterEnabled: activar, clusterHost: host.trim(), clusterPort: Number(puerto) || 7300 });
    setAviso(ok ? '' : 'No se pudo guardar.');
    if (ok) { setAjustes(false); releer(); }
  };
  const enviarOrden = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orden.trim()) return;
    const r = await customFetch('/api/radio/cluster/orden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden }) });
    const j = await r.json().catch(() => ({}));
    setAviso(r.ok ? '' : j.error || 'No se pudo enviar la orden.');
    if (r.ok) { setOrden(''); releer(); }
  };

  return (
    <Tarjeta aria-label="Cluster DX" className="flex flex-col gap-3" id="cluster-dx">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Cluster DX</h2>
          {datos?.nodo && <span className="text-sm text-slate-400 font-mono">{datos.nodo}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${estado.color}`} id="cluster-estado">● {estado.texto}</span>
          {admin && <button type="button" className="text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer" onClick={() => setAjustes((v) => !v)}>Nodo</button>}
        </div>
      </div>

      {datos && datos.estado === 'desconectado' && datos.detalle && <p className="text-sm text-amber-300">{datos.detalle}. Se reintenta solo.</p>}

      {(ajustes || (datos && !datos.configurado && admin)) && (
        <div className="border border-slate-700 rounded-lg p-3 flex flex-col gap-3" id="cluster-ajustes">
          <p className="text-sm text-slate-300">Nodo de cluster por telnet (DXSpider, AR-Cluster o CC Cluster). La estación entra con su indicativo, sin SSID.</p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 basis-56 text-xs text-slate-400 flex flex-col gap-1">Servidor
              <input className={`${campo} font-mono`} value={host} onChange={(e) => setHost(e.target.value)} placeholder="p. ej. dxfun.com" autoCapitalize="none" spellCheck={false} />
            </label>
            <label className="basis-28 text-xs text-slate-400 flex flex-col gap-1">Puerto
              <input className={`${campo} font-mono`} value={puerto} onChange={(e) => setPuerto(e.target.value)} inputMode="numeric" placeholder="8000" />
            </label>
            <button type="button" className={botonPrincipal} disabled={!host.trim()} onClick={() => guardar(true)}>Conectar</button>
            {datos?.activo && <button type="button" className={boton} onClick={() => guardar(false)}>Desconectar</button>}
          </div>
        </div>
      )}
      {datos && !datos.configurado && !admin && <p className="text-sm text-slate-400">Sin nodo de cluster configurado. Lo ajusta el administrador.</p>}

      {datos && datos.configurado && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por banda">
            <button type="button" className={pastilla(banda === 'todas')} aria-pressed={banda === 'todas'} onClick={() => setBanda('todas')}>Todas · {datos.spots.length}</button>
            {bandas.map(([b, n]) => (
              <button key={b} type="button" className={pastilla(banda === b)} aria-pressed={banda === b} onClick={() => setBanda(b)}>{b} · {n}</button>
            ))}
          </div>
          {spots.length === 0 ? (
            <p className="text-sm text-slate-400">{datos.estado === 'conectado' ? 'Conectado. Todavía no ha llegado ningún spot.' : 'Sin spots.'}</p>
          ) : (
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-sm" id="cluster-spots">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="font-normal py-1 pr-3">kHz</th>
                    <th className="font-normal py-1 pr-3">DX</th>
                    <th className="font-normal py-1 pr-3">País</th>
                    <th className="font-normal py-1 pr-3">Rumbo y distancia</th>
                    <th className="font-normal py-1 pr-3">Comentario</th>
                    <th className="font-normal py-1 pr-3">Anuncia</th>
                    <th className="font-normal py-1 text-right">UTC</th>
                  </tr>
                </thead>
                <tbody>
                  {spots.map((s, i) => (
                    <tr key={`${s.cuando}-${s.dx}-${s.khz}-${i}`} className={`border-t border-slate-800 ${elegido === `${s.dx}-${s.khz}` ? 'bg-sky-950' : ''}`}>
                      <td className="py-1.5 pr-3 font-mono text-sky-400 whitespace-nowrap">
                        {hace ? <button type="button" className="underline underline-offset-2 cursor-pointer min-h-[32px]" title="Sintonizar y girar a este spot" onClick={() => tocar(s)}>{s.khz.toFixed(1)}</button> : s.khz.toFixed(1)}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{s.dx}</td>
                      <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{s.pais ?? '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{s.rumbo === null ? '—' : `${String(s.rumbo).padStart(3, '0')}° · ${s.distanciaKm!.toLocaleString('es-ES')} km`}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{s.comentario}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{s.de}</td>
                      <td className="py-1.5 text-right font-mono text-slate-400 whitespace-nowrap" title={haceCuanto(s.cuando, ahora)}>{s.hora.slice(0, 2)}:{s.hora.slice(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!datos.paises && datos.spots.length > 0 && (
            <p className="text-[13px] text-amber-300">No se ha podido descargar la tabla de países (cty.dat): los spots salen sin país, rumbo ni distancia.</p>
          )}
          <p className="text-[13px] text-slate-400">El rumbo y la distancia son al centro del país del indicativo, desde la posición actual de la estación.</p>
          {admin && (alTocar.puedeSintonizar || alTocar.puedeGirar) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300" id="cluster-al-tocar">
              <span>Al tocar la frecuencia de un spot:</span>
              {alTocar.puedeSintonizar && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-5 h-5" checked={sintonizar} onChange={(e) => setSintonizar(e.target.checked)} /> sintonizar el equipo</label>}
              {alTocar.puedeGirar && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-5 h-5" checked={girar} onChange={(e) => setGirar(e.target.checked)} /> girar el rotor</label>}
            </div>
          )}

          {admin && (
            <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
              <form onSubmit={enviarOrden} className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 basis-64 text-xs text-slate-400 flex flex-col gap-1">Orden al nodo (sh/dx 10 on 20m, sh/wwv, dx 14205 EA7XYZ texto…)
                  <input className={`${campo} font-mono`} id="cluster-orden" value={orden} onChange={(e) => setOrden(e.target.value)} autoCapitalize="none" spellCheck={false} />
                </label>
                <button type="submit" className={boton} disabled={!orden.trim() || datos.estado !== 'conectado'}>Enviar</button>
                <button type="button" className={boton} aria-expanded={consola} onClick={() => setConsola((v) => !v)}>{consola ? 'Ocultar consola' : 'Ver consola'}</button>
              </form>
              {consola && (
                <pre id="cluster-consola" className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[13px] font-mono text-slate-300 max-h-72 overflow-auto whitespace-pre-wrap">
                  {datos.lineas.length === 0 ? 'Sin salida del nodo todavía.' : datos.lineas.map((l) => `${horaUtc(l.cuando)} ${l.mia ? '> ' : '  '}${l.texto}`).join('\n')}
                </pre>
              )}
            </div>
          )}
        </>
      )}
      {aviso && <p className="text-sm text-red-400" role="alert">{aviso}</p>}
    </Tarjeta>
  );
}

const ESTADO_ENVIO: Record<Enviado['estado'], { texto: string; color: string }> = {
  pendiente: { texto: 'Esperando acuse', color: 'text-amber-300' },
  recibido: { texto: 'Recibido (ack)', color: 'text-emerald-400' },
  rechazado: { texto: 'Rechazado', color: 'text-red-400' },
  'sin-acuse': { texto: 'Sin acuse', color: 'text-red-400' },
};

function Mensajes({ config, onGuardar, admin }: { config: TelemetryConfig; onGuardar: Guardar; admin: boolean }) {
  const [datos, releer] = useSondeo<DatosMensajes>('/api/radio/mensajes', 5000);
  const [red, setRed] = useState<'APRS' | 'DAPNET'>('APRS');
  const [para, setPara] = useState('');
  const [texto, setTexto] = useState('');
  const [emergencia, setEmergencia] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cuenta, setCuenta] = useState(false);
  const [usuario, setUsuario] = useState(config.dapnetUser || '');
  const [clave, setClave] = useState('');
  const [grupo, setGrupo] = useState(config.dapnetGroup || 'ea-all');
  const ahora = Date.now();
  const max = red === 'APRS' ? 67 : datos?.dapnet.max ?? 80;

  // Conversación: recibidos y enviados juntos, lo más reciente arriba
  const hilo = useMemo(() => {
    const todo: Array<{ cuando: number; r?: Recibido; e?: Enviado }> = [
      ...(datos?.recibidos ?? []).map((r) => ({ cuando: r.cuando, r })),
      ...(datos?.enviados ?? []).map((e) => ({ cuando: e.cuando, e })),
    ];
    return todo.sort((a, b) => b.cuando - a.cuando).slice(0, 60);
  }, [datos]);

  useEffect(() => {
    if (admin && datos && datos.sinLeer > 0) {
      const t = setTimeout(() => { customFetch('/api/radio/mensajes/leidos', { method: 'POST' }).catch(() => {}); }, 4000);
      return () => clearTimeout(t);
    }
  }, [admin, datos?.sinLeer]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const r = await customFetch(red === 'APRS' ? '/api/radio/mensajes' : '/api/radio/dapnet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(red === 'APRS' ? { para, texto } : { para, texto, emergencia }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setAviso({ ok: false, texto: j.error || 'No se pudo enviar.' });
      else {
        setTexto('');
        setAviso(red === 'APRS'
          ? (j.txEnabled ? { ok: true, texto: 'Mensaje en la cola de emisión.' } : { ok: false, texto: 'Mensaje anotado, pero la emisión está desactivada: no sale al aire.' })
          : { ok: true, texto: 'Enviado a DAPNET.' });
        releer();
      }
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setEnviando(false);
  };
  const guardarCuenta = async () => {
    const cambios: Partial<TelemetryConfig> = { dapnetUser: usuario.trim(), dapnetGroup: grupo.trim() };
    if (clave) cambios.dapnetPassword = clave;
    const ok = await onGuardar(cambios);
    setAviso(ok ? { ok: true, texto: 'Cuenta de DAPNET guardada.' } : { ok: false, texto: 'No se pudo guardar.' });
    if (ok) { setCuenta(false); setClave(''); releer(); }
  };

  return (
    <Tarjeta aria-label="Mensajería" className="flex flex-col gap-3" id="mensajeria">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Mensajería</h2>
          {datos && <span className="text-sm text-slate-400">APRS como <span className="font-mono text-slate-200">{datos.indicativo}</span></span>}
        </div>
        {datos && datos.sinLeer > 0 && <span className="text-sm font-semibold text-amber-300" id="mensajes-sin-leer">{datos.sinLeer} sin leer</span>}
      </div>

      {datos && !datos.admin && <p className="text-sm text-slate-400">Los mensajes solo se muestran al administrador de la estación.</p>}
      {datos && datos.admin && !datos.txEnabled && (
        <p className="text-sm text-amber-300">La emisión está desactivada: se reciben mensajes, pero ni los acuses ni lo que escribas salen al aire.</p>
      )}

      {datos?.admin && (
        <>
          {hilo.length === 0 ? (
            <p className="text-sm text-slate-400">Sin mensajes todavía. Aquí aparecen los dirigidos a {datos.indicativo} y los boletines que se oigan.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto" id="mensajes-hilo">
              {hilo.map(({ r, e }) => r ? (
                <div key={`r-${r.clave}-${r.cuando}`} className={`rounded-lg border px-3 py-2 mr-8 ${r.leido ? 'border-slate-800 bg-slate-950' : 'border-amber-600 bg-slate-950'}`}>
                  <div className="flex flex-wrap justify-between gap-x-3 text-[13px] text-slate-400">
                    <span><span className="font-mono text-sky-400">{r.de}</span>{r.boletin ? ` · boletín ${r.para}` : ''} · {r.via === 'RF' ? 'por radio' : 'por APRS-IS'}{r.veces > 1 ? ` · recibido ${r.veces} veces` : ''}</span>
                    <span title={haceCuanto(r.cuando, ahora)}>{horaUtc(r.cuando)}</span>
                  </div>
                  <div className="text-slate-100 break-words">{r.texto}</div>
                  {!r.boletin && (
                    <button type="button" className="mt-1 text-[13px] font-semibold text-sky-400 underline underline-offset-2 cursor-pointer" onClick={() => { setRed('APRS'); setPara(r.de); document.getElementById('mensaje-texto')?.focus(); }}>Responder</button>
                  )}
                </div>
              ) : e ? (
                <div key={`e-${e.clave}`} className="rounded-lg border border-slate-800 bg-sky-950 px-3 py-2 ml-8">
                  <div className="flex flex-wrap justify-between gap-x-3 text-[13px] text-slate-400">
                    <span>Yo → <span className="font-mono text-sky-400">{e.para}</span>{e.intentos > 1 ? ` · ${e.intentos} intentos` : ''}</span>
                    <span className={`font-semibold ${ESTADO_ENVIO[e.estado].color}`}>{/^BLN/.test(e.para) ? 'Boletín emitido' : ESTADO_ENVIO[e.estado].texto} · {horaUtc(e.acuseCuando ?? e.cuando)}</span>
                  </div>
                  <div className="text-slate-100 break-words">{e.texto}</div>
                </div>
              ) : null)}
            </div>
          )}

          <form onSubmit={enviar} className="border-t border-slate-800 pt-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 items-center" role="group" aria-label="Red">
              <button type="button" className={pastilla(red === 'APRS')} aria-pressed={red === 'APRS'} onClick={() => { setRed('APRS'); setAviso(null); }}>APRS</button>
              <button type="button" className={pastilla(red === 'DAPNET')} aria-pressed={red === 'DAPNET'} onClick={() => { setRed('DAPNET'); setAviso(null); }}>DAPNET (buscapersonas)</button>
              {red === 'DAPNET' && <button type="button" className="text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer" onClick={() => setCuenta((v) => !v)}>Cuenta</button>}
            </div>

            {red === 'DAPNET' && (cuenta || !datos.dapnet.configurado) && (
              <div className="border border-slate-700 rounded-lg p-3 flex flex-col gap-3" id="dapnet-cuenta">
                <p className="text-sm text-slate-300">Cuenta de hampager.de. La contraseña se guarda en la estación y no se vuelve a mostrar.</p>
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="flex-1 basis-36 text-xs text-slate-400 flex flex-col gap-1">Usuario
                    <input className={`${campo} font-mono`} value={usuario} onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" spellCheck={false} autoComplete="off" />
                  </label>
                  <label className="flex-1 basis-36 text-xs text-slate-400 flex flex-col gap-1">Contraseña
                    <input className={campo} type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder={config.dapnetPassword ? 'guardada' : ''} autoComplete="new-password" />
                  </label>
                  <label className="flex-1 basis-36 text-xs text-slate-400 flex flex-col gap-1">Grupo de transmisores
                    <input className={`${campo} font-mono`} value={grupo} onChange={(e) => setGrupo(e.target.value)} autoCapitalize="none" spellCheck={false} />
                  </label>
                  <button type="button" className={boton} disabled={!usuario.trim()} onClick={guardarCuenta}>Guardar</button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-end">
              <label className="basis-40 grow-0 text-xs text-slate-400 flex flex-col gap-1">{red === 'APRS' ? 'Para (indicativo o BLNn)' : 'Para (indicativos, con comas)'}
                <input className={`${campo} font-mono`} id="mensaje-para" value={para} onChange={(e) => setPara(red === 'APRS' ? e.target.value.toUpperCase() : e.target.value)} autoCapitalize="characters" spellCheck={false} />
              </label>
              <label className="flex-1 basis-64 text-xs text-slate-400 flex flex-col gap-1">
                <span className="flex justify-between"><span>Mensaje</span><span className={texto.length > max ? 'text-red-400 font-semibold' : ''}>{texto.length} / {max}</span></span>
                <input className={campo} id="mensaje-texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
              </label>
              <button type="submit" className={botonPrincipal} id="mensaje-enviar" disabled={enviando || !para.trim() || !texto.trim() || texto.length > max || (red === 'DAPNET' && !datos.dapnet.configurado)}>Enviar</button>
            </div>
            {red === 'DAPNET' && (
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" className="w-5 h-5" checked={emergencia} onChange={(e) => setEmergencia(e.target.checked)} /> Prioridad de emergencia
              </label>
            )}
            {red === 'APRS' && <p className="text-[13px] text-slate-400">Se repite hasta cinco veces mientras no llegue el acuse. Los acentos y la ñ se pasan a ASCII al emitir.</p>}
          </form>
        </>
      )}
      {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status" id="mensaje-aviso">{aviso.texto}</p>}
    </Tarjeta>
  );
}

export default function RadioPrincipal({ config, onGuardar }: { config: TelemetryConfig; onGuardar: Guardar }) {
  const session = useAdminSession();
  const admin = session.admin;
  const [equipo, releer] = useSondeo<DatosEquipo>('/api/radio/equipo', 1500);
  const alTocar = { puedeSintonizar: !!equipo?.equipo.enlace, puedeGirar: !!equipo?.rotor.enlace };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · Principal</h1>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3 min-w-0"><PanelEquipo datos={equipo} admin={admin} config={config} onGuardar={onGuardar} onCambio={releer} /></div>
        <div className="xl:col-span-2 min-w-0"><PanelRotor datos={equipo} admin={admin} config={config} onGuardar={onGuardar} onCambio={releer} /></div>
        <div className="xl:col-span-5 min-w-0"><Satelites admin={admin} config={config} onGuardar={onGuardar} puedeSeguir={alTocar.puedeGirar} puedeSintonizar={alTocar.puedeSintonizar} onCambio={releer} /></div>
        <div className="xl:col-span-3 min-w-0"><Cluster config={config} onGuardar={onGuardar} admin={admin} alTocar={alTocar} onCambio={releer} /></div>
        <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
          <Grupo admin={admin} config={config} onGuardar={onGuardar} />
          <Mensajes config={config} onGuardar={onGuardar} admin={admin} />
        </div>
      </div>
      <p className="text-[13px] text-slate-400">Próximo módulo de esta pantalla: consola de comandos.</p>
    </div>
  );
}
