// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Boyas y estaciones costeras más cercanas a la estación, en tiempo real.
import React, { useEffect, useState } from 'react';
import { customFetch } from '../../utils/customFetch';
import { Tarjeta } from '../shell/Etiquetas';
import { haceCuanto } from '../../utils/useAvisos';

interface Boya {
  id: string; lat: number; lon: number; distanciaKm: number; cuando: number;
  vientoDirGrados: number | null; vientoNudos: number | null; rachaNudos: number | null;
  olaM: number | null; periodoS: number | null; olaDirGrados: number | null;
  presionHpa: number | null; aireC: number | null; aguaC: number | null;
}
interface Datos { disponible: boolean; consultado: number | null; boyas: Boya[] }

const ROSA = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const rumbo = (g: number | null) => (g === null ? '' : ROSA[Math.round(g / 45) % 8]);
const dato = (v: number | null, decimales: number, unidad: string) => (v === null ? '—' : `${v.toFixed(decimales)} ${unidad}`);

export default function BoyasCercanas({ onVerEnMapa }: { onVerEnMapa?: (lat: number, lon: number, titulo: string) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/boyas').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  return (
    <Tarjeta aria-label="Boyas y estaciones costeras cercanas" className="flex flex-col gap-3" id="boyas-cercanas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Las más cercanas a la estación</h2>
        {datos?.disponible && datos.consultado && (
          <span className="text-sm text-slate-400">consultado {haceCuanto(datos.consultado, ahora)}</span>
        )}
      </div>
      {!datos && <p className="text-sm text-slate-400">{error ? 'No se pudo consultar.' : 'Consultando…'}</p>}
      {datos && !datos.disponible && (
        <p className="text-sm text-amber-300">La fuente de boyas no responde ahora mismo: no hay observaciones que mostrar.</p>
      )}
      {datos?.disponible && datos.boyas.length === 0 && (
        <p className="text-sm text-slate-300">Ninguna boya ni estación costera con observación de las últimas 6 horas a menos de 1500 km.</p>
      )}
      {datos?.disponible && datos.boyas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="font-normal py-1 pr-3">Estación</th>
                <th className="font-normal py-1 pr-3">Distancia</th>
                <th className="font-normal py-1 pr-3">Ola</th>
                <th className="font-normal py-1 pr-3">Viento</th>
                <th className="font-normal py-1 pr-3">Presión</th>
                <th className="font-normal py-1 pr-3">Aire</th>
                <th className="font-normal py-1 pr-3">Agua</th>
                <th className="font-normal py-1 text-right">Observación</th>
              </tr>
            </thead>
            <tbody>
              {datos.boyas.map((b) => (
                <tr key={b.id} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {onVerEnMapa ? (
                      <button type="button" onClick={() => onVerEnMapa(b.lat, b.lon, `Boya ${b.id}`)} className="font-mono text-sky-400 underline underline-offset-2">{b.id}</button>
                    ) : <span className="font-mono text-slate-100">{b.id}</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{b.distanciaKm.toFixed(0)} km</td>
                  <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">
                    {dato(b.olaM, 1, 'm')}{b.periodoS !== null && <span className="text-slate-400"> · {b.periodoS.toFixed(0)} s</span>}{b.olaDirGrados !== null && <span className="text-slate-400"> {rumbo(b.olaDirGrados)}</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">
                    {b.vientoNudos === null ? '—' : `${rumbo(b.vientoDirGrados)} ${b.vientoNudos.toFixed(0)} kn`}{b.rachaNudos !== null && <span className="text-slate-400"> · racha {b.rachaNudos.toFixed(0)}</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-slate-300 whitespace-nowrap">{dato(b.presionHpa, 1, 'hPa')}</td>
                  <td className="py-1.5 pr-3 font-mono text-slate-300 whitespace-nowrap">{dato(b.aireC, 1, '°C')}</td>
                  <td className="py-1.5 pr-3 font-mono text-slate-300 whitespace-nowrap">{dato(b.aguaC, 1, '°C')}</td>
                  <td className="py-1.5 text-right text-slate-400 whitespace-nowrap">{haceCuanto(b.cuando, ahora)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[13px] text-slate-400">
        Última observación de cada boya o estación costera que distribuye el NDBC de la NOAA (las suyas y las de otros países que comparten datos).
        «—» significa que esa estación no mide ese dato. La lista sigue a la posición de la estación y se renueva sola.
        Las boyas de Puertos del Estado aún no tienen fuente conectada.
      </p>
    </Tarjeta>
  );
}
