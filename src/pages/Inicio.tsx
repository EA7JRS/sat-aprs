// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Portada de la consola: qué está pasando, cómo está la estación, qué se ha
// emitido y si las fuentes responden. Todo lo demás está a un clic.
import React, { useEffect, useState } from 'react';
import { ServerTelemetryData } from '../types';
import { Pantalla } from '../navigation';
import { Dato, Nivel, Tarjeta } from '../components/shell/Etiquetas';
import { distanciaLegible, haceCuanto, tituloAviso, horaUtc, useAvisos, vigenciaLegible } from '../utils/useAvisos';
import { maidenhead } from '../../server/formulas/radio';
import { customFetch } from '../utils/customFetch';
import { ResumenHFBreve } from '../components/radio/ResumenHF';

const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const rumbo = (grados: number) => RUMBOS[Math.round((((grados % 360) + 360) % 360) / 45) % 8];

interface Baliza { activa: boolean; intervaloMin: number; packet: string | null; errores: string[] }
interface ObsMeteo { fuente: string; cuando: number; reciente: boolean; tempC: number | null; humedadPct: number | null; presionHpa: number | null; vientoKmh: number | null; dirGrados: number | null }
interface Meteo { activa: boolean; intervaloMin: number; propia: ObsMeteo | null; internet: ObsMeteo | null }

function Enlace({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-sm font-semibold text-sky-400 hover:text-sky-300 cursor-pointer min-h-[32px]">
      {children}
    </button>
  );
}

export default function Inicio({ data, onIr }: { data: ServerTelemetryData; onIr: (p: Pantalla) => void }) {
  const { avisos, fuentes, error } = useAvisos();
  const [baliza, setBaliza] = useState<Baliza | null>(null);
  const [meteo, setMeteo] = useState<Meteo | null>(null);

  useEffect(() => {
    customFetch('/api/estacion/baliza').then((r) => r.json()).then(setBaliza).catch(() => setBaliza(null));
  }, [data.config.callsign, data.config.aprsBeaconEnabled, data.config.aprsBeaconInterval]);

  // Meteorología real (estación propia o Internet); lo simulado no se enseña aquí
  useEffect(() => {
    const leer = () => customFetch('/api/estacion/meteo').then((r) => r.json()).then(setMeteo).catch(() => setMeteo(null));
    leer();
    const t = setInterval(leer, 60000);
    return () => clearInterval(t);
  }, []);
  const obs = meteo?.propia?.reciente ? meteo.propia : meteo?.internet?.reciente ? meteo.internet : null;
  const valor = (v: number | null, unidad: string, decimales = 0) => (v === null ? '—' : `${v.toFixed(decimales)} ${unidad}`);

  const activos = avisos.filter((a) => a.cumple);
  const { gpsd, config } = data;
  const gpsReal = !gpsd.isFallback && gpsd.mode >= 2;
  const emisiones = data.logs.filter((l) => l.type === 'TX').slice(0, 6);

  return (
    <div className="flex flex-col gap-5" id="pagina-inicio">
      <section aria-label="Avisos activos" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-100">Avisos activos en tu zona</h1>
          <Enlace onClick={() => onIr('avisos')}>Ver todos</Enlace>
        </div>
        {activos.length === 0 && (
          <Tarjeta className="text-slate-300">
            {error ? 'No se pudo consultar la lista de avisos.' : 'Ningún aviso cumple ahora las reglas de difusión de la estación.'}
          </Tarjeta>
        )}
        {activos.slice(0, 5).map((a) => (
          <Tarjeta key={a.id} className="flex flex-wrap items-center gap-3.5">
            <Nivel gravedad={a.gravedad} />
            <div className="flex-1 basis-72 min-w-0">
              <div className="text-[17px] font-semibold text-slate-100">{tituloAviso(a)}</div>
              <div className="text-sm text-slate-400">{a.titulo} · {vigenciaLegible(a.inicio, a.fin)} · {a.fuente}</div>
            </div>
            <div className="text-sm text-slate-300">{distanciaLegible(a)}</div>
            <div className={`text-[13px] font-semibold ${a.emitido ? 'text-emerald-400' : 'text-slate-400'}`}>
              {a.emitido ? `Emitido ${horaUtc(a.emitido.ultima)}` : 'Pendiente de emitir'}
            </div>
          </Tarjeta>
        ))}
      </section>

      <div className="flex flex-wrap gap-5">
        <Tarjeta aria-label="Estación" className="flex-1 basis-80 min-w-0 flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Estación</h2>
            <Enlace onClick={() => onIr('perfil')}>Perfil</Enlace>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Dato rotulo={gpsReal ? 'Posición (GPS)' : 'Posición fija'}>
              <span className="font-mono">{Math.abs(gpsd.lat).toFixed(4)} {gpsd.lat >= 0 ? 'N' : 'S'} · {Math.abs(gpsd.lon).toFixed(4)} {gpsd.lon >= 0 ? 'E' : 'O'}</span>
            </Dato>
            <Dato rotulo="Locator"><span className="font-mono">{maidenhead(gpsd.lat, gpsd.lon)}</span></Dato>
            <Dato rotulo="Baliza de posición">
              {baliza === null ? '—' : baliza.activa ? `Cada ${baliza.intervaloMin} min` : 'Apagada'}
            </Dato>
            <Dato rotulo="Radio de avisos">{config.filterRadiusKm} km (sismos) · {config.meteoRadioKm ?? 25} km (meteo)</Dato>
          </div>
          <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
            {obs ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Dato rotulo="Temp." grande>{valor(obs.tempC, '°C', 1)}</Dato>
                  <Dato rotulo="Humedad" grande>{valor(obs.humedadPct, '%')}</Dato>
                  <Dato rotulo="Presión" grande>{valor(obs.presionHpa, 'hPa')}</Dato>
                  <Dato rotulo="Viento" grande>{obs.vientoKmh === null ? '—' : `${obs.dirGrados !== null ? `${rumbo(obs.dirGrados)} ` : ''}${Math.round(obs.vientoKmh)} km/h`}</Dato>
                </div>
                <div className="text-xs text-slate-400">
                  {obs.fuente} · {haceCuanto(obs.cuando)} · parte por APRS {meteo?.activa ? `cada ${meteo.intervaloMin} min` : 'apagado'}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400" id="inicio-sin-meteo">
                Sin datos meteorológicos reales: ni la estación propia ni una fuente de Internet han dado una medida reciente.
              </p>
            )}
          </div>
        </Tarjeta>

        <Tarjeta aria-label="Últimas emisiones" className="flex-[1.3] basis-96 min-w-0 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Últimas emisiones</h2>
            <Enlace onClick={() => onIr('aprs-adaptor')}>Tramas APRS</Enlace>
          </div>
          {emisiones.length === 0 && <p className="text-slate-400 text-sm">Todavía no se ha emitido nada.</p>}
          <ul className="flex flex-col divide-y divide-slate-800">
            {emisiones.map((l) => {
              const noEmitido = /NO EMITIDO/.test(l.remarks);
              return (
                <li key={l.id} className="flex items-baseline gap-3 py-2">
                  <span className="font-mono text-[13px] text-slate-400 shrink-0">{l.timestamp.slice(0, 5)}</span>
                  <span className="flex-1 min-w-0 font-mono text-[13px] text-sky-300 truncate" title={l.payload}>
                    {l.payload.replace(/^[^:]*:/, '')}
                  </span>
                  <span className={`text-xs font-semibold shrink-0 ${noEmitido ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {noEmitido ? 'No emitido' : 'Emitido'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      </div>

      <ResumenHFBreve onAbrir={() => onIr('propagacion')} />

      <Tarjeta aria-label="Fuentes de datos" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Fuentes</h2>
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
          {fuentes.map((f) => (
            <div key={f.id} className="border border-slate-800 rounded-lg px-3 py-2.5" title={f.texto}>
              <div className="font-semibold text-slate-100">{f.nombre}</div>
              <div className={`text-[13px] ${f.ok ? 'text-emerald-400' : 'text-amber-300'}`}>
                {f.ok ? 'Correcta' : 'Sin datos'} · {haceCuanto(f.cuando)}
              </div>
            </div>
          ))}
          <div className="border border-slate-800 rounded-lg px-3 py-2.5">
            <div className="font-semibold text-slate-100">Posición · gpsd</div>
            <div className={`text-[13px] ${gpsReal ? 'text-emerald-400' : 'text-slate-400'}`}>{gpsReal ? `Fijo ${gpsd.mode === 3 ? '3D' : '2D'}` : 'Sin fijo: posición fija'}</div>
          </div>
          <div className="border border-slate-800 rounded-lg px-3 py-2.5">
            <div className="font-semibold text-slate-100">Hora · ntpsec</div>
            <div className={`text-[13px] ${data.ntp.status === 'synchronized' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {data.ntp.status === 'synchronized' ? `Sincronizada · stratum ${data.ntp.stratum}` : 'Sin sincronizar'}
            </div>
          </div>
          {fuentes.length === 0 && (
            <div className="border border-slate-800 rounded-lg px-3 py-2.5 text-[13px] text-slate-400">Las fuentes oficiales aún no han respondido.</div>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
