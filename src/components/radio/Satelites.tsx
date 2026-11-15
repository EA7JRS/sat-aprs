// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Principal: satélites. Favoritos con su posición y próximo paso desde
// la posición actual de la estación, y búsqueda en el archivo de TLE.
import React, { useEffect, useState } from 'react';
import { Tarjeta } from '../shell/Etiquetas';
import { customFetch } from '../../utils/customFetch';
import { haceCuanto, horaUtc } from '../../utils/useAvisos';
import { TelemetryConfig } from '../../types';
import { frecuenciaLegible, ordenRadio } from './EquipoRotor';

type Guardar = (cambios: Partial<TelemetryConfig>) => Promise<boolean>;

interface Paso { aos: number; maximo: number; los: number; azAos: number; azLos: number; elMax: number; azMax: number }
interface Transmisor { subidaHz: number; bajadaHz: number; modo: string; baudios: number; descripcion: string; ctcssHz?: number; bajadaAhoraHz: number | null }
interface Ficha {
  norad: number; nombre: string; grupos: string; categoria: string; edadTleDias: number;
  ahora: { az: number; el: number; distanciaKm: number; radialKmS: number } | null;
  paso?: Paso | null; transmisores?: Transmisor[]; favorito?: boolean;
}
interface Datos {
  disponible: boolean; error: string; total: number; generado: number | null; leido: number | null; edadTleDias: number | null;
  estacion: { lat: number; lon: number; gps: boolean }; grupos: Record<string, string>;
  favoritos: Ficha[]; favoritosSinTle: number[]; lista: Ficha[];
  doppler: null | { norad: number; nombre: string; bajadaHz: number; subidaHz: number; modo: string | null; descripcion: string; fin: number | null; ultimaRx: number | null; ultimaTx: number | null; ultimaVez: number | null; radialKmS: number | null; split: boolean | null };
  dopplerFin: null | { motivo: string; cuando: number; nombre: string };
}

const campo = 'w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-100 text-[15px]';
const boton = 'min-h-[40px] px-3 rounded-lg border border-slate-600 text-slate-100 text-sm font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';
const enlaceTexto = 'text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer';
const az3 = (a: number) => `${String(Math.round(a)).padStart(3, '0')}°`;

function dentroDe(ms: number, ahora: number): string {
  const min = Math.round((ms - ahora) / 60000);
  if (min <= 0) return 'ahora';
  if (min < 90) return `en ${min} min`;
  return `en ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export default function Satelites({ admin, config, onGuardar, puedeSeguir, puedeSintonizar, onCambio }: {
  admin: boolean; config: TelemetryConfig; onGuardar: Guardar; puedeSeguir: boolean; puedeSintonizar: boolean; onCambio: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [buscar, setBuscar] = useState('');
  const [grupo, setGrupo] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [anadir, setAnadir] = useState(false);
  const [aviso, setAviso] = useState('');
  const [vuelta, setVuelta] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams();
    if (anadir && buscar.trim()) q.set('q', buscar.trim());
    if (anadir && grupo) q.set('grupo', grupo);
    const leer = () => customFetch(`/api/radio/satelites?${q.toString()}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo && j) { setDatos(j); setAhora(Date.now()); } }).catch(() => {});
    leer();
    const t = setInterval(leer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [buscar, grupo, anadir, vuelta]);

  const favoritos = String(config.satFavoritos ?? '25544').split(',').filter(Boolean);
  const cambiarFavorito = async (norad: number, poner: boolean) => {
    const lista = favoritos.filter((n) => n !== String(norad));
    if (poner) lista.push(String(norad));
    const ok = await onGuardar({ satFavoritos: lista.join(',') });
    setAviso(ok ? '' : 'No se pudo guardar.');
    setVuelta((v) => v + 1);
  };
  const seguir = async (norad: number) => { setAviso(await ordenRadio('rotor', { accion: 'seguir', objetivo: { tipo: 'satelite', norad } })); onCambio(); };
  const sintonizar = async (hz: number) => { setAviso(await ordenRadio('equipo', { frecuenciaHz: hz })); onCambio(); };
  const doppler = async (cuerpo: Record<string, unknown>) => {
    const r = await customFetch('/api/radio/satelites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setAviso(r?.ok ? '' : j.error || 'No se pudo.');
    setVuelta((v) => v + 1);
    onCambio();
  };
  const actualizar = async () => {
    setAviso('Descargando…');
    const r = await customFetch('/api/radio/satelites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'actualizar' }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setAviso(r?.ok ? '' : j.error || 'No se pudo descargar.');
    setVuelta((v) => v + 1);
  };

  return (
    <Tarjeta aria-label="Satélites" className="flex flex-col gap-3" id="satelites">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Satélites</h2>
          {datos?.disponible && (
            <span className="text-sm text-slate-400" id="sat-tle">
              {datos.total} con TLE{datos.edadTleDias !== null ? ` · de hace ${datos.edadTleDias.toLocaleString('es-ES')} días` : ''}{datos.leido ? ` · descargado ${haceCuanto(datos.leido, ahora)}` : ''}
            </span>
          )}
        </div>
        {admin && (
          <div className="flex items-center gap-4">
            <button type="button" className={enlaceTexto} onClick={actualizar}>Actualizar TLE</button>
            <button type="button" className={enlaceTexto} aria-expanded={anadir} onClick={() => setAnadir((v) => !v)}>{anadir ? 'Cerrar' : 'Añadir'}</button>
          </div>
        )}
      </div>

      {datos && !datos.disponible && (
        <p className="text-sm text-amber-300" id="sat-sin-tle">No se han podido descargar los elementos orbitales (TLE){datos.error ? `: ${datos.error}` : ''}. Sin ellos no hay posiciones ni pasos. Se reintenta cada hora.</p>
      )}
      {datos?.disponible && datos.edadTleDias !== null && datos.edadTleDias > 7 && (
        <p className="text-sm text-amber-300">Los TLE tienen más de una semana: los pasos pueden ir desplazados. Pulsa «Actualizar TLE».</p>
      )}

      {datos?.disponible && (
        datos.favoritos.length === 0 ? <p className="text-sm text-slate-400">Sin satélites favoritos. Añade alguno para ver sus pasos.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" id="sat-favoritos">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="font-normal py-1 pr-3">Satélite</th>
                  <th className="font-normal py-1 pr-3">Ahora</th>
                  <th className="font-normal py-1 pr-3">Próximo paso</th>
                  <th className="font-normal py-1 pr-3">Sale → máx. → se pone</th>
                  <th className="font-normal py-1 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {datos.favoritos.map((s) => {
                  const arriba = !!s.ahora && s.ahora.el > 0;
                  return (
                    <React.Fragment key={s.norad}>
                      <tr className={`border-t border-slate-800 ${arriba ? 'bg-emerald-950' : ''}`}>
                        <td className="py-2 pr-3">
                          <button type="button" className="text-left cursor-pointer" aria-expanded={abierto === s.norad} onClick={() => setAbierto(abierto === s.norad ? null : s.norad)}>
                            <span className="block text-slate-100 font-semibold underline underline-offset-2">{s.nombre}</span>
                            <span className="block text-xs text-slate-400 font-mono">{s.norad}</span>
                          </button>
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">
                          {s.ahora === null ? '—' : arriba
                            ? <span className="text-emerald-400">{az3(s.ahora.az)} · elev. {Math.round(s.ahora.el)}°</span>
                            : <span className="text-slate-400">bajo el horizonte</span>}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {s.paso ? (
                            <>
                              <span className="font-mono text-sky-400">{arriba ? `hasta ${horaUtc(s.paso.los)}` : dentroDe(s.paso.aos, ahora)}</span>
                              <span className="block text-xs text-slate-400">{horaUtc(s.paso.aos)} UTC · máx. {Math.round(s.paso.elMax)}°</span>
                            </>
                          ) : <span className="text-slate-400">sin paso en 36 h</span>}
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-300 whitespace-nowrap">
                          {s.paso ? `${az3(s.paso.azAos)} → ${az3(s.paso.azMax)} → ${az3(s.paso.azLos)}` : '—'}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {admin && puedeSeguir && <button type="button" className={boton} onClick={() => seguir(s.norad)}>Seguir con el rotor</button>}
                        </td>
                      </tr>
                      {abierto === s.norad && (
                        <tr className="border-t border-slate-800">
                          <td colSpan={5} className="py-2">
                            <div className="flex flex-col gap-1.5">
                              {(s.transmisores ?? []).length === 0 && <span className="text-sm text-slate-400">Sin transmisores en el archivo.</span>}
                              {(s.transmisores ?? []).map((t, i) => (
                                <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                  <span className="font-mono text-slate-100">{t.bajadaHz ? `↓ ${frecuenciaLegible(t.bajadaHz)}` : '↓ —'}{t.subidaHz ? ` · ↑ ${frecuenciaLegible(t.subidaHz)}` : ''}</span>
                                  <span className="text-slate-300">{[t.modo, t.baudios ? `${t.baudios} Bd` : '', t.ctcssHz ? `CTCSS ${t.ctcssHz.toFixed(1)}` : ''].filter(Boolean).join(' · ')}</span>
                                  <span className="text-slate-400">{t.descripcion}</span>
                                  {arriba && t.bajadaAhoraHz && <span className="font-mono text-emerald-400">con Doppler: {frecuenciaLegible(t.bajadaAhoraHz)}</span>}
                                  {admin && puedeSintonizar && t.bajadaHz > 0 && (
                                    <button type="button" className={enlaceTexto} onClick={() => sintonizar(arriba && t.bajadaAhoraHz ? t.bajadaAhoraHz : t.bajadaHz)}>Sintonizar</button>
                                  )}
                                  {admin && puedeSintonizar && (t.bajadaHz > 0 || t.subidaHz > 0) && (
                                    <button type="button" className={enlaceTexto} onClick={() => doppler({ accion: 'doppler', norad: s.norad, transmisor: i })}>Seguir Doppler</button>
                                  )}
                                </div>
                              ))}
                              <div className="flex flex-wrap gap-x-4 text-xs text-slate-400">
                                <span>TLE de hace {s.edadTleDias.toLocaleString('es-ES')} días</span>
                                {s.ahora && <span>distancia {s.ahora.distanciaKm.toLocaleString('es-ES')} km</span>}
                                {admin && <button type="button" className="underline cursor-pointer" onClick={() => cambiarFavorito(s.norad, false)}>Quitar de favoritos</button>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {datos?.doppler && (
        <div className="rounded-lg border border-emerald-700 bg-slate-950 px-3 py-2 flex flex-wrap items-center justify-between gap-2" id="sat-doppler">
          <div className="min-w-0">
            <div className="text-slate-100"><span className="text-slate-400">Doppler: </span>{datos.doppler.nombre}{datos.doppler.descripcion ? ` · ${datos.doppler.descripcion}` : ''}</div>
            <div className="font-mono text-sm text-emerald-400">
              {datos.doppler.ultimaRx ? `↓ ${frecuenciaLegible(datos.doppler.ultimaRx)}` : '↓ —'}
              {datos.doppler.bajadaHz && datos.doppler.ultimaRx ? ` (${datos.doppler.ultimaRx - datos.doppler.bajadaHz >= 0 ? '+' : '−'}${(Math.abs(datos.doppler.ultimaRx - datos.doppler.bajadaHz) / 1000).toFixed(1).replace('.', ',')} kHz)` : ''}
              {datos.doppler.subidaHz ? (datos.doppler.split === false ? ' · ↑ el equipo no acepta split' : datos.doppler.ultimaTx ? ` · ↑ ${frecuenciaLegible(datos.doppler.ultimaTx)}` : '') : ''}
            </div>
            <div className="text-xs text-slate-400">{datos.doppler.ultimaVez ? `resintonizado ${haceCuanto(datos.doppler.ultimaVez, ahora)}` : 'esperando lectura del equipo'}{datos.doppler.fin ? ` · termina al ponerse, ${horaUtc(datos.doppler.fin)} UTC` : ''} · se para si mueves el dial</div>
          </div>
          {admin && <button type="button" className={boton} onClick={() => doppler({ accion: 'doppler-parar' })}>Parar Doppler</button>}
        </div>
      )}
      {!datos?.doppler && datos?.dopplerFin && ahora - datos.dopplerFin.cuando < 10 * 60_000 && (
        <p className="text-sm text-slate-400" id="sat-doppler-fin">Corrección de Doppler de {datos.dopplerFin.nombre} terminada: {datos.dopplerFin.motivo}.</p>
      )}
      {datos && datos.favoritosSinTle.length > 0 && datos.disponible && (
        <p className="text-[13px] text-amber-300">Sin TLE en el archivo para: {datos.favoritosSinTle.join(', ')}.</p>
      )}

      {anadir && datos?.disponible && (
        <div className="border border-slate-700 rounded-lg p-3 flex flex-col gap-3" id="sat-anadir">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 basis-48 text-xs text-slate-400 flex flex-col gap-1">Nombre o número NORAD
              <input className={campo} id="sat-buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="ISS, SO-50, 25544…" spellCheck={false} />
            </label>
            <label className="basis-52 text-xs text-slate-400 flex flex-col gap-1">Grupo
              <select className={campo} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                <option value="">Cualquiera</option>
                {Object.entries(datos.grupos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          {!buscar.trim() && !grupo ? <p className="text-sm text-slate-400">Escribe un nombre o elige un grupo.</p>
            : datos.lista.length === 0 ? <p className="text-sm text-slate-400">Ningún satélite coincide.</p> : (
              <ul className="flex flex-col divide-y divide-slate-800 max-h-64 overflow-y-auto">
                {datos.lista.map((s) => (
                  <li key={s.norad} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-slate-100">{s.nombre} <span className="font-mono text-xs text-slate-400">{s.norad}</span>{s.ahora && s.ahora.el > 0 && <span className="text-emerald-400 text-xs"> · visible ahora</span>}</span>
                    <button type="button" className={boton} disabled={s.favorito} onClick={() => cambiarFavorito(s.norad, true)}>{s.favorito ? 'Ya está' : 'Añadir'}</button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      <p className="text-[13px] text-slate-400">
        Pasos calculados desde la posición actual de la estación ({datos?.estacion.gps ? 'GPS' : 'fija'}). TLE de CelesTrak y transmisores de SatNOGS DB (CC BY-SA 4.0),
        del mismo archivo que usan el tracker y la app APRS LoRa+. Al seguir un satélite, el rotor se coloca por donde sale dos minutos antes.
      </p>
      {aviso && <p className="text-sm text-amber-300" role="status">{aviso}</p>}
    </Tarjeta>
  );
}
