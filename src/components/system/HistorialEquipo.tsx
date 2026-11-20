// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sistema · Equipo: el historial en disco (sat_historial.db). Cuánto guarda,
// desde cuándo, cuánto ocupa, cuántos días se conservan y exportación a CSV.
import React, { useEffect, useState } from 'react';
import { Tarjeta } from '../shell/Etiquetas';
import { customFetch } from '../../utils/customFetch';
import { descargar } from '../../utils/descargar';
import { useAdminSession } from '../../utils/session';

interface Resumen {
  disponible: boolean; error: string | null; ruta: string | null; bytes: number | null;
  tramas: number; registro: number; desdeTramas: number | null; desdeRegistro: number | null;
  retencion: { diasTramas: number; diasRegistro: number };
}

const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50';
const campo = 'min-h-[44px] w-24 rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 focus:border-sky-500 focus:outline-none';
const tam = (b: number | null) => b === null ? '—' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} kB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const fecha = (t: number | null) => t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
const hoy = () => new Date().toISOString().slice(0, 10);

export default function HistorialEquipo() {
  const { isAdmin } = useAdminSession();
  const [r, setR] = useState<Resumen | null>(null);
  const [dT, setDT] = useState('');
  const [dR, setDR] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = () => customFetch('/api/historial').then((x) => x.ok ? x.json() : null).then((j: Resumen | null) => {
    if (!j) return;
    setR(j);
    setDT((v) => v || String(j.retencion.diasTramas));
    setDR((v) => v || String(j.retencion.diasRegistro));
  }).catch(() => undefined);
  useEffect(() => { void leer(); const t = setInterval(leer, 30_000); return () => clearInterval(t); }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = Math.round(Number(dT)); const g = Math.round(Number(dR));
    if (!(t >= 1 && t <= 365) || !(g >= 1 && g <= 3650)) { setMsg({ ok: false, texto: 'Tramas: de 1 a 365 días. Registro: de 1 a 3650 días.' }); return; }
    setOcupado(true);
    try {
      const x = await customFetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historialDiasTramas: t, historialDiasRegistro: g }) });
      setMsg(x.ok ? { ok: true, texto: 'Guardado. Lo más antiguo se borra en la próxima limpieza (cada 6 horas).' } : { ok: false, texto: 'No se pudo guardar.' });
      if (x.ok) void leer();
    } catch { setMsg({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setOcupado(false);
  };
  const exportar = async (que: 'tramas' | 'registro') => {
    const dias = que === 'tramas' ? r?.retencion.diasTramas : r?.retencion.diasRegistro;
    const err = await descargar(`/api/historial/${que}?formato=csv&dias=${dias ?? 7}`, `${que}-${hoy()}.csv`);
    setMsg(err ? { ok: false, texto: err } : null);
  };

  return (
    <Tarjeta aria-label="Historial" className="flex flex-col gap-3" id="historial-equipo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Historial en disco</h2>
        {r && <span className={`text-sm font-semibold ${r.disponible ? 'text-emerald-400' : 'text-red-400'}`}>● {r.disponible ? 'Guardando' : 'Sin historial'}</span>}
      </div>
      {!r ? <p className="text-sm text-slate-400">Consultando…</p> : !r.disponible ? (
        <p className="text-sm text-amber-300" role="alert">Las tramas, el registro y los mensajes se pierden al reiniciar: {r.error}.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate-400">Tramas</dt><dd className="text-slate-100">{r.tramas.toLocaleString('es-ES')} · desde {fecha(r.desdeTramas)}</dd>
          <dt className="text-slate-400">Registro</dt><dd className="text-slate-100">{r.registro.toLocaleString('es-ES')} entradas · desde {fecha(r.desdeRegistro)}</dd>
          <dt className="text-slate-400">Archivo</dt><dd className="font-mono text-slate-300 break-all">{r.ruta} · {tam(r.bytes)}</dd>
        </dl>
      )}
      {isAdmin ? (
        <>
          <form className="flex flex-wrap items-end gap-3" onSubmit={guardar}>
            <label className="flex flex-col gap-1 text-sm text-slate-300">Días de tramas
              <input className={campo} inputMode="numeric" value={dT} onChange={(e) => setDT(e.target.value)} id="hist-dias-tramas" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">Días de registro
              <input className={campo} inputMode="numeric" value={dR} onChange={(e) => setDR(e.target.value)} id="hist-dias-registro" />
            </label>
            <button type="submit" className={boton} disabled={ocupado}>Guardar</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={boton} disabled={!r?.disponible} onClick={() => exportar('tramas')} id="hist-csv-tramas">Exportar tramas (CSV)</button>
            <button type="button" className={boton} disabled={!r?.disponible} onClick={() => exportar('registro')} id="hist-csv-registro">Exportar registro (CSV)</button>
          </div>
        </>
      ) : <p className="text-[13px] text-slate-400">Con la sesión de administrador se cambian los días que se guardan y se exporta a CSV.</p>}
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{msg.texto}</p>}
    </Tarjeta>
  );
}
