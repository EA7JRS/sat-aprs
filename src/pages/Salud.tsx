// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Avisos · Salud: temperaturas y salud, solo con datos reales.
//  · Avisos de temperatura en vigor (los de la cadena de Avisos).
//  · Máximas y mínimas previstas en la posición de la estación (Open-Meteo).
//  · Los paneles oficiales: Kairós (ISCIII) y Meteosalud (Ministerio de Sanidad).
// Los niveles de riesgo para la salud los dan esos organismos: la consola no
// los calcula ni los estima.
import React, { useEffect, useState } from 'react';
import { Nivel, Tarjeta } from '../components/shell/Etiquetas';
import { tituloAviso, useAvisos, vigenciaLegible } from '../utils/useAvisos';
import { GPSDStatus } from '../types';

const URL_KAIROS = 'https://momo.isciii.es/kairos/';
const URL_METEOSALUD = 'https://www.sanidad.gob.es/excesoTemperaturas/meteosalud.do';
const enlace = 'inline-flex items-center min-h-[44px] px-4 rounded-lg border border-sky-500 bg-sky-900 text-slate-50 font-semibold hover:bg-sky-800';
const ES_TEMPERATURA = /temperatura|calor|fr[ií]o|helada|ola de/i;

interface Dia { fecha: string; max: number | null; min: number | null }

export default function Salud({ gpsd }: { gpsd: GPSDStatus }) {
  const { avisos: todos } = useAvisos(60_000);
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [error, setError] = useState(false);
  const lat = Number(gpsd?.lat); const lon = Number(gpsd?.lon);
  const conPosicion = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);

  useEffect(() => {
    if (!conPosicion) return;
    let vivo = true;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=temperature_2m_max,temperature_2m_min&forecast_days=6&timezone=auto`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => {
        if (!vivo) return;
        const t: string[] = j?.daily?.time ?? [];
        const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        setDias(t.map((fecha, i) => ({ fecha, max: n(j.daily.temperature_2m_max?.[i]), min: n(j.daily.temperature_2m_min?.[i]) })));
        setError(false);
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [conPosicion, lat.toFixed(2), lon.toFixed(2)]);

  const avisos = todos.filter((a) => a.tipo === 'meteo' && ES_TEMPERATURA.test(`${a.detalle} ${a.titulo}`));
  const diaCorto = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Avisos · Salud</h1>

      <Tarjeta aria-label="Avisos de temperatura" className="flex flex-col gap-3" id="salud-avisos">
        <h2 className="text-lg font-semibold text-slate-100">Avisos de temperatura en vigor</h2>
        {avisos.length === 0 ? <p className="text-sm text-slate-400">Ninguno en las fuentes conectadas (AEMET, MeteoAlarm, umbrales de la estación y pronóstico).</p> : (
          <ul className="flex flex-col gap-2">
            {avisos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border border-slate-800 rounded-lg p-3">
                <Nivel gravedad={a.gravedad} />
                <span className="text-slate-100 font-semibold">{tituloAviso(a)}</span>
                {a.titulo !== tituloAviso(a) && <span className="text-sm text-slate-300">{a.titulo}</span>}
                <span className="text-[13px] text-slate-400">{vigenciaLegible(a.inicio, a.fin)} · {a.fuente}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta aria-label="Temperaturas previstas" className="flex flex-col gap-3" id="salud-temperaturas">
        <h2 className="text-lg font-semibold text-slate-100">Temperaturas previstas en la estación</h2>
        {!conPosicion ? <p className="text-sm text-slate-400">Sin posición de la estación.</p>
          : error ? <p className="text-sm text-amber-300" role="alert">No se pudo consultar el pronóstico de Open-Meteo.</p>
          : !dias ? <p className="text-sm text-slate-400">Consultando…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="font-normal py-1 pr-4">Día</th><th className="font-normal py-1 pr-4">Máxima</th><th className="font-normal py-1">Mínima</th></tr></thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d.fecha} className="border-t border-slate-800">
                      <td className="py-1.5 pr-4 text-slate-200">{diaCorto(d.fecha)}</td>
                      <td className="py-1.5 pr-4 font-mono text-slate-100">{d.max === null ? '—' : `${d.max.toFixed(1)} °C`}</td>
                      <td className="py-1.5 font-mono text-slate-100">{d.min === null ? '—' : `${d.min.toFixed(1)} °C`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <p className="text-[13px] text-slate-400">Pronóstico de Open-Meteo para la posición de la estación. La consola no lo compara con umbrales de salud: el nivel de riesgo lo dan los paneles oficiales de abajo.</p>
      </Tarjeta>

      <Tarjeta aria-label="Paneles oficiales" className="flex flex-col gap-4" id="salud-paneles">
        <h2 className="text-lg font-semibold text-slate-100">Riesgo para la salud: paneles oficiales</h2>
        <div className="flex flex-col gap-2">
          <h3 className="text-slate-100 font-semibold">Índice Kairós · Instituto de Salud Carlos III</h3>
          <p className="text-sm text-slate-300">Riesgo de mortalidad atribuible a temperaturas extremas, por provincia o comunidad autónoma, sexo y edad, para el día y los cinco siguientes. Tres niveles: 1 bajo, 2 moderado y 3 elevado. Se actualiza a diario.</p>
          <div><a className={enlace} href={URL_KAIROS} target="_blank" rel="noopener noreferrer" id="salud-kairos">Abrir el panel Kairós</a></div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
          <h3 className="text-slate-100 font-semibold">Meteosalud · Ministerio de Sanidad</h3>
          <p className="text-sm text-slate-300">Niveles de riesgo para la salud por altas temperaturas, por zona de meteosalud, del Plan Nacional de actuaciones preventivas.</p>
          <div><a className={enlace} href={URL_METEOSALUD} target="_blank" rel="noopener noreferrer" id="salud-meteosalud">Abrir Meteosalud</a></div>
        </div>
        <p className="text-[13px] text-slate-400">Ninguno de los dos publica sus datos en un formato que la consola pueda leer, así que aquí no se muestran ni se difunden sus niveles. Esta pantalla es de consulta: no emite nada.</p>
      </Tarjeta>
    </div>
  );
}
