// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Circuito de onda corta: predicción de VOACAP de un transmisor al receptor de Wefax
// (EA7JRS/Wefax), y las últimas cartas de radiofacsímil que ha recibido.
import React, { useEffect, useState } from 'react';
import { customFetch } from '../../utils/customFetch';
import { horasBuenas } from '../../../server/radio/wefax';
import type { CartaWefax, CircuitoHf as Circuito } from '../../../server/radio/wefax';

const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const color = (r: number | null) => (r === null ? 'text-slate-500' : r >= 0.7 ? 'text-emerald-400' : r >= 0.3 ? 'text-amber-400' : 'text-rose-400');

export default function CircuitoHf() {
  const [destino, setDestino] = useState('');
  const [mhz, setMhz] = useState('');
  const [vatios, setVatios] = useState('100');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [origen, setOrigen] = useState('');
  const [circuito, setCircuito] = useState<Circuito | null>(null);
  const [cartas, setCartas] = useState<{ url: string; error: string | null; cartas: CartaWefax[] } | null>(null);
  const hora = new Date().getUTCHours();

  useEffect(() => {
    customFetch('/api/wefax/cartas').then((r) => r.json()).then(setCartas).catch(() => { /* sin Wefax no se enseña nada */ });
  }, []);

  const calcular = (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true); setError(''); setAviso(''); setCircuito(null);
    customFetch(`/api/hf/circuito?destino=${encodeURIComponent(destino)}&mhz=${encodeURIComponent(mhz)}&w=${encodeURIComponent(vatios)}`)
      .then((r) => r.json())
      .then((j) => { setError(j.error ?? ''); setAviso(j.aviso ?? ''); setOrigen(j.origen ?? ''); setCircuito(j.circuito ?? null); })
      .catch(() => setError('la consola no contesta'))
      .finally(() => setOcupado(false));
  };

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-4" aria-label="Circuito de onda corta">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Circuito de onda corta (VOACAP)</h3>
        <p className="text-sm text-slate-400">De una estación hasta aquí: qué parte de los días de este mes llega la señal, hora a hora. Lo calcula VOACAP en este equipo, hasta la posición de la consola; si no está instalado, se le pide a Wefax, que lo calcula hasta su receptor. Es la mediana del mes, con antenas y ruido supuestos; no ve la tormenta ni el apagón de hoy, que están arriba.</p>
      </div>
      <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={calcular}>
        <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">Estación: posición o localizador
          <input className={`${campo} font-mono`} value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="36.53, -6.29  o  IM66uq" id="input-circuito-destino" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">MHz (vacío, todas las bandas)
          <input className={`${campo} font-mono`} value={mhz} onChange={(e) => setMhz(e.target.value)} placeholder="14.150" inputMode="decimal" id="input-circuito-mhz" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Su potencia (W)
          <input className={`${campo} font-mono`} value={vatios} onChange={(e) => setVatios(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" id="input-circuito-vatios" />
        </label>
        <button type="submit" disabled={ocupado || !destino.trim()} className="min-h-[44px] rounded-lg bg-sky-600 px-4 font-semibold text-white disabled:opacity-50 md:col-span-4" id="btn-circuito">
          {ocupado ? 'Calculando…' : 'Calcular'}
        </button>
      </form>
      {error && <p className="text-sm text-amber-400" role="status">{error}</p>}
      {circuito && (
        <div className="flex flex-col gap-2">
          {aviso && <p className="text-sm text-amber-400">{aviso}</p>}
          <p className="text-sm text-slate-400">
            {origen === 'wefax' ? 'Calculado por Wefax, hasta su receptor · ' : origen === 'local' ? 'Calculado aquí, hasta la consola · ' : ''}{circuito.km !== null ? `${Math.round(circuito.km)} km · ` : ''}manchas solares {circuito.manchas ?? '?'} · umbral {circuito.umbral ?? '?'} dB-Hz · ahora {String(hora).padStart(2, '0')} UTC
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400"><th className="py-1 pr-3">Frecuencia</th><th className="py-1 pr-3">Ahora</th><th className="py-1 pr-3">Horas buenas (UTC)</th><th className="py-1">24 horas</th></tr></thead>
              <tbody>
                {circuito.khz.map((k, i) => {
                  const fila = circuito.fiabilidad[i] ?? [];
                  const ahora = fila[hora] ?? null;
                  return (
                    <tr key={k} className="border-t border-slate-800">
                      <td className="py-1.5 pr-3 font-mono text-slate-100">{(k / 1000).toFixed(3)} MHz</td>
                      <td className={`py-1.5 pr-3 font-semibold ${color(ahora)}`}>{ahora === null ? '—' : `${Math.round(ahora * 100)} %`}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{horasBuenas(fila) || 'ninguna'}</td>
                      <td className="py-1.5">
                        <div className="flex items-end gap-px h-5" aria-hidden="true">
                          {Array.from({ length: 24 }, (_, h) => (
                            <span key={h} className={`w-1.5 rounded-sm ${h === hora ? 'bg-sky-300' : 'bg-sky-600'}`} style={{ height: `${10 + 90 * (fila[h] ?? 0)}%`, opacity: 0.3 + 0.7 * (fila[h] ?? 0) }} title={`${String(h).padStart(2, '0')} UTC · ${fila[h] === null || fila[h] === undefined ? '—' : Math.round((fila[h] as number) * 100) + ' %'}`} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Porcentaje: días del mes en que la señal llega con ese umbral a esa hora. Horas buenas: la mitad de los días o más.</p>
        </div>
      )}
      {cartas && cartas.url && (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-slate-200">Últimas cartas de radiofacsímil</h4>
          {cartas.error && <p className="text-sm text-amber-400">{cartas.error}</p>}
          {!cartas.error && cartas.cartas.length === 0 && <p className="text-sm text-slate-400">Wefax aún no ha recibido ninguna.</p>}
          <ul className="flex flex-col">
            {cartas.cartas.slice(0, 8).map((c) => (
              <li key={c.id} className="border-t border-slate-800 py-1.5 text-sm">
                <a className="text-sky-400 underline" href={`${cartas.url}/chart/${c.id}.png`} target="_blank" rel="noopener noreferrer">{c.titulo || 'Carta sin título'}</a>
                <span className="text-slate-400"> · {c.recibida ? c.recibida.replace('T', ' ').replace(':00Z', ' UTC') : ''} · {c.estacion || '?'} · {c.khz} kHz · {c.lineas} líneas{c.completa ? '' : ' · cortada'}</span>
              </li>
            ))}
          </ul>
          <a className="text-sm text-sky-400 underline" href={cartas.url} target="_blank" rel="noopener noreferrer">Abrir Wefax</a>
        </div>
      )}
    </section>
  );
}
