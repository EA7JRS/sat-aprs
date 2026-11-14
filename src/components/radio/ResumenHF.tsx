// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Resumen de HF: qué bandas sirven ahora para enlace local (NVIS) y de larga
// distancia, y los índices de los que depende. Lo medido se distingue siempre
// de lo estimado, y lo que no se ha podido leer se dice que falta.
import React, { useEffect, useState } from 'react';
import { customFetch } from '../../utils/customFetch';
import { Dato, Tarjeta } from '../shell/Etiquetas';
import { haceCuanto } from '../../utils/useAvisos';

type Estado = 'abierta' | 'justa' | 'cerrada' | 'absorbida' | 'sin dato';
interface Banda { nombre: string; mhz: number; nvis: Estado; dx: Estado }
interface DatosHf {
  actualizado: number;
  sfi: number | null; manchas: number | null; fechaSolar: string | null;
  kp: { valor: number; origen: string } | null;
  rayosX: string | null;
  escalas: { R: number | null; S: number | null; G: number | null; oficiales: boolean };
  vientoSolar: { velocidad: number | null; bz: number | null; densidad: number | null } | null;
  ionosonda: { nombre: string; codigo: string; distanciaKm: number; fof2: number | null; muf3000: number | null; hmf2: number | null; cuando: number } | null;
  muf: { valor: number; medida: boolean } | null;
  luf: number | null;
  bandas: Banda[];
  mejorLocal: string | null;
  mejorDx: string | null;
  sol: { orto: string; ocaso: string; deDia: boolean } | null;
}

const ESTILO: Record<Estado, string> = {
  abierta: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  justa: 'bg-amber-950 text-amber-300 border-amber-700',
  cerrada: 'text-slate-400 border-slate-800',
  absorbida: 'text-slate-400 border-slate-800',
  'sin dato': 'text-slate-500 border-slate-800 border-dashed',
};
const TEXTO: Record<Estado, string> = { abierta: 'Abierta', justa: 'Justa', cerrada: 'Cerrada', absorbida: 'Absorbida', 'sin dato': 'Sin dato' };

function Celda({ estado }: { estado: Estado }) {
  return <span className={`inline-block min-w-[84px] text-center border rounded-md px-2 py-0.5 text-[13px] ${ESTILO[estado]}`}>{TEXTO[estado]}</span>;
}

function Escala({ letra, nivel }: { letra: string; nivel: number | null }) {
  const clase = nivel === null ? 'border-slate-800 text-slate-500' : nivel >= 3 ? 'border-red-700 bg-red-950 text-red-300' : nivel >= 1 ? 'border-amber-700 bg-amber-950 text-amber-300' : 'border-emerald-800 bg-emerald-950 text-emerald-300';
  return <span className={`inline-block border rounded-md px-2 py-0.5 font-mono text-sm ${clase}`}>{letra}{nivel ?? '?'}</span>;
}

/** Datos de HF en directo: se releen solos cada `cadaMs` (30 s por defecto). */
/** Reloj que avanza cada segundo, para mostrar la antigüedad de los datos. */
function useReloj(): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return t;
}

function EnDirecto({ actualizado, ahora, error }: { actualizado: number; ahora: number; error: boolean }) {
  const s = Math.max(0, Math.round((ahora - actualizado) / 1000));
  const viva = !error && s < 90;
  return (
    <span id="hf-en-directo" className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[13px] ${viva ? 'border-emerald-800 bg-emerald-950 text-emerald-300' : 'border-amber-700 bg-amber-950 text-amber-300'}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${viva ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
      {viva ? `En directo · hace ${s} s` : `Sin actualizar desde hace ${s < 120 ? `${s} s` : `${Math.round(s / 60)} min`}`}
    </span>
  );
}

export function useHf(cadaMs = 30000) {
  const [datos, setDatos] = useState<DatosHf | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/hf').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, cadaMs);
    return () => { vivo = false; clearInterval(t); };
  }, [cadaMs]);
  return { datos, error };
}

const dato = (v: number | null | undefined, unidad = '', decimales = 0) => (v === null || v === undefined ? '—' : `${v.toFixed(decimales)}${unidad}`);

/** Tarjeta breve para la portada. */
export function ResumenHFBreve({ onAbrir }: { onAbrir: () => void }) {
  const { datos, error } = useHf();
  return (
    <Tarjeta aria-label="Propagación en HF" className="flex flex-col gap-3" id="hf-breve">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-100">HF ahora</h2>
        <button type="button" onClick={onAbrir} className="text-sm font-semibold text-sky-400 hover:text-sky-300 cursor-pointer min-h-[32px]">HF y propagación</button>
      </div>
      {!datos ? (
        <p className="text-sm text-slate-400">{error ? 'No se pudieron leer los datos de propagación.' : 'Leyendo…'}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Dato rotulo="Enlace local (NVIS)" grande>{datos.mejorLocal ?? '—'}</Dato>
          <Dato rotulo="Larga distancia" grande>{datos.mejorDx ?? '—'}</Dato>
          <Dato rotulo={datos.muf ? (datos.muf.medida ? 'MUF 3000 km (medida)' : 'MUF 3000 km (estimada)') : 'MUF 3000 km'} grande>{datos.muf ? `${datos.muf.valor.toFixed(1)} MHz` : '—'}</Dato>
          <div className="min-w-0">
            <div className="text-xs text-slate-400">Escalas NOAA · Kp {dato(datos.kp?.valor, '', 1)}</div>
            <div className="flex gap-1.5 mt-0.5">
              <Escala letra="R" nivel={datos.escalas.R} /><Escala letra="S" nivel={datos.escalas.S} /><Escala letra="G" nivel={datos.escalas.G} />
            </div>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

/** Panel completo: bandas, ionosonda e índices. */
export default function ResumenHF() {
  const { datos, error } = useHf(30000);
  const ahora = useReloj();
  if (!datos) {
    return <Tarjeta id="hf-resumen" className="text-slate-300">{error ? 'No se pudieron leer los datos de propagación.' : 'Leyendo los datos de propagación…'}</Tarjeta>;
  }
  const s = datos.ionosonda;
  return (
    <div className="flex flex-col gap-4" id="hf-resumen">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-100">HF y propagación</h1>
          <EnDirecto actualizado={datos.actualizado} ahora={ahora} error={error} />
        </div>
        {datos.sol && (
          <span className="text-sm text-slate-400">
            {datos.sol.deDia ? 'De día' : 'De noche'} en la estación · orto {datos.sol.orto} · ocaso {datos.sol.ocaso} UTC
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <Tarjeta aria-label="Estado de las bandas" className="flex-[1.4] basis-[26rem] min-w-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-100">Bandas ahora</h2>
            <span className="text-sm text-slate-300">
              Local: <b>{datos.mejorLocal ?? 'sin dato'}</b> · Larga distancia: <b>{datos.mejorDx ?? 'sin dato'}</b>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" id="hf-bandas">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="font-normal py-1 pr-3">Banda</th>
                  <th className="font-normal py-1 pr-3">Local y regional (NVIS, 0-400 km)</th>
                  <th className="font-normal py-1">Larga distancia (3000 km)</th>
                </tr>
              </thead>
              <tbody>
                {datos.bandas.map((b) => (
                  <tr key={b.nombre} className="border-t border-slate-800">
                    <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{b.nombre} <span className="text-slate-400">{b.mhz} MHz</span></td>
                    <td className="py-1.5 pr-3"><Celda estado={b.nvis} /></td>
                    <td className="py-1.5"><Celda estado={b.dx} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-slate-400">
            «Abierta» = hasta el 85 % de la frecuencia tope; «justa» = entre ese 85 % y el tope. El enlace local usa la foF2 medida por la ionosonda;
            el de larga distancia, la MUF {datos.muf ? (datos.muf.medida ? 'medida' : 'estimada a partir del flujo solar') : '(sin dato)'}.
            {datos.luf !== null ? ` Por debajo de ${datos.luf.toFixed(1)} MHz (LUF estimada) la absorción diurna lo impide.` : ''}
          </p>
        </Tarjeta>

        <div className="flex-1 basis-80 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Ionosonda" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-100">Ionosfera medida</h2>
            {s ? (
              <>
                <p className="text-sm text-slate-300">Ionosonda de {s.nombre}{s.codigo ? ` (${s.codigo})` : ''}, a {s.distanciaKm} km · medida {haceCuanto(s.cuando, ahora)}</p>
                <div className="grid grid-cols-3 gap-3">
                  <Dato rotulo="foF2" grande>{dato(s.fof2, ' MHz', 1)}</Dato>
                  <Dato rotulo="MUF 3000 km" grande>{dato(s.muf3000, ' MHz', 1)}</Dato>
                  <Dato rotulo="Altura F2" grande>{dato(s.hmf2, ' km')}</Dato>
                </div>
              </>
            ) : (
              <p className="text-sm text-amber-300">Sin medida reciente de una ionosonda a menos de 1500 km: el enlace local no se puede valorar y la MUF es una estimación.</p>
            )}
          </Tarjeta>

          <Tarjeta aria-label="Índices solares y geomagnéticos" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-100">Sol y campo magnético</h2>
            <div className="grid grid-cols-3 gap-3">
              <Dato rotulo="Flujo solar (SFI)" grande>{dato(datos.sfi)}</Dato>
              <Dato rotulo="Manchas" grande>{dato(datos.manchas)}</Dato>
              <Dato rotulo={datos.kp ? `Kp · ${datos.kp.origen}` : 'Kp'} grande>{dato(datos.kp?.valor, '', 1)}</Dato>
              <Dato rotulo="Rayos X" grande>{datos.rayosX ?? '—'}</Dato>
              <Dato rotulo="Viento solar" grande>{dato(datos.vientoSolar?.velocidad, ' km/s')}</Dato>
              <Dato rotulo="IMF Bz" grande>{dato(datos.vientoSolar?.bz, ' nT', 1)}</Dato>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <Escala letra="R" nivel={datos.escalas.R} /><Escala letra="S" nivel={datos.escalas.S} /><Escala letra="G" nivel={datos.escalas.G} />
              <span className="text-slate-400">{datos.escalas.oficiales ? 'Escalas oficiales de la NOAA' : 'Escalas deducidas de rayos X, protones y Kp'}</span>
            </div>
            {(datos.sfi === null || datos.kp === null) && (
              <p className="text-[13px] text-amber-300">Los valores con «—» no se han podido leer de su fuente; no se rellenan con cifras supuestas.</p>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
