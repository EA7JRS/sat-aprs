// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Medidores de calidad del aire más cercanos a la estación, en tiempo real.
import React, { useEffect, useState } from 'react';
import { customFetch } from '../../utils/customFetch';
import { Tarjeta } from '../shell/Etiquetas';
import { haceCuanto } from '../../utils/useAvisos';

interface Medidor { id: string; lat: number; lon: number; distanciaKm: number; pm25: number | null; pm10: number | null; clase: string; sensor: string; cuando: number }
interface Datos { disponible: boolean; consultado: number | null; radioKm: number | null; medidores: Medidor[] }

const COLOR: Record<string, string> = {
  buena: 'text-emerald-400', razonable: 'text-emerald-400', moderada: 'text-amber-300',
  mala: 'text-amber-300', 'muy mala': 'text-red-400', 'extremadamente mala': 'text-red-400',
};

export default function MedidoresAire() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/aire/medidores').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  return (
    <Tarjeta aria-label="Medidores de calidad del aire cercanos" className="flex flex-col gap-3" id="medidores-aire">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Medidores de aire más cercanos</h2>
        {datos?.disponible && datos.consultado && (
          <span className="text-sm text-slate-400">a menos de {datos.radioKm} km · consultado {haceCuanto(datos.consultado, ahora)}</span>
        )}
      </div>
      {!datos && <p className="text-sm text-slate-400">{error ? 'No se pudo consultar.' : 'Consultando…'}</p>}
      {datos && !datos.disponible && (
        <p className="text-sm text-amber-300">La red de medidores no responde ahora mismo: no hay lecturas que mostrar.</p>
      )}
      {datos?.disponible && datos.medidores.length === 0 && (
        <p className="text-sm text-slate-300">No hay ningún medidor activo a menos de {datos.radioKm} km de la estación.</p>
      )}
      {datos?.disponible && datos.medidores.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="font-normal py-1 pr-3">Distancia</th>
                <th className="font-normal py-1 pr-3">PM2,5</th>
                <th className="font-normal py-1 pr-3">PM10</th>
                <th className="font-normal py-1 pr-3">Aire</th>
                <th className="font-normal py-1 pr-3">Sensor</th>
                <th className="font-normal py-1 text-right">Lectura</th>
              </tr>
            </thead>
            <tbody>
              {datos.medidores.map((m) => (
                <tr key={m.id} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{m.distanciaKm.toFixed(1)} km</td>
                  <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{m.pm25 === null ? '—' : `${m.pm25.toFixed(1)} µg/m³`}</td>
                  <td className="py-1.5 pr-3 font-mono text-slate-300 whitespace-nowrap">{m.pm10 === null ? '—' : `${m.pm10.toFixed(1)} µg/m³`}</td>
                  <td className={`py-1.5 pr-3 whitespace-nowrap ${COLOR[m.clase] || 'text-slate-400'}`}>{m.clase ? m.clase.charAt(0).toUpperCase() + m.clase.slice(1) : '—'}</td>
                  <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{m.sensor || '—'}</td>
                  <td className="py-1.5 text-right text-slate-400 whitespace-nowrap">{haceCuanto(m.cuando, ahora)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[13px] text-slate-400">
        Lecturas de los últimos minutos de la red Sensor.Community: medidores ciudadanos de partículas, no estaciones oficiales.
        La lista sigue a la posición de la estación y se renueva sola.
      </p>
    </Tarjeta>
  );
}
