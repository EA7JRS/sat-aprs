// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Todos los avisos de la cadena en una sola lista: los que la estación
// difunde y los que no (y por qué), con las tramas APRS de cada uno.
import React, { useMemo, useState } from 'react';
import { Dato, Nivel, Tarjeta } from '../components/shell/Etiquetas';
import { Aviso, NOMBRE_TIPO, distanciaLegible, tituloAviso, horaUtc, useAvisos, vigenciaLegible } from '../utils/useAvisos';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { EarthquakeEvent, TelemetryConfig } from '../types';

function Fila({ a, elegido, onElegir }: { a: Aviso; elegido: boolean; onElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegido}
      className={`w-full text-left rounded-xl p-3.5 flex flex-wrap items-center gap-3.5 cursor-pointer border ${
        elegido ? 'border-sky-500 bg-slate-900' : a.cumple ? 'border-slate-800 bg-slate-900 hover:border-slate-600' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
      }`}
    >
      <Nivel gravedad={a.gravedad} />
      <span className="flex-1 basis-60 min-w-0">
        <span className="block text-[17px] font-semibold text-slate-100">{tituloAviso(a)}</span>
        <span className="block text-sm text-slate-400">{a.titulo} · {vigenciaLegible(a.inicio, a.fin)} · {a.fuente}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-sm text-slate-300">{distanciaLegible(a)}</span>
        <span className={`block text-[13px] ${a.cumple ? (a.emitido ? 'text-emerald-400 font-semibold' : 'text-slate-300') : 'text-slate-400'}`}>
          {a.cumple ? (a.emitido ? `Emitido ${horaUtc(a.emitido.ultima)}` : 'Pendiente de emitir') : a.motivo.charAt(0).toUpperCase() + a.motivo.slice(1)}
        </span>
      </span>
    </button>
  );
}

type Guardar = (cambios: Partial<TelemetryConfig>) => Promise<boolean>;

const campo = 'w-full min-h-[40px] bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-slate-100 text-sm';

interface CampoRegla {
  clave: keyof TelemetryConfig;
  rotulo: string;
  /** «nivel» = amarillo/naranja/rojo; lo demás, número con su unidad. */
  unidad: string;
  porDefecto: number | string;
}

/** Reglas que el administrador puede cambiar, por tipo de aviso. */
const REGLAS: Record<string, { titulo: string; campos: CampoRegla[] }> = {
  meteo: { titulo: 'los avisos meteorológicos', campos: [
    { clave: 'meteoRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 25 },
    { clave: 'meteoGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'amarillo' },
    { clave: 'meteoAntelacionH', rotulo: 'Antelación', unidad: 'h', porDefecto: 12 },
    { clave: 'meteoRepetirMin', rotulo: 'Repetición', unidad: 'min', porDefecto: 60 },
  ] },
  sismo: { titulo: 'los sismos', campos: [
    { clave: 'filterRadiusKm', rotulo: 'Radio', unidad: 'km', porDefecto: 200 },
    { clave: 'minMagnitudBaliza', rotulo: 'Magnitud mínima', unidad: 'M', porDefecto: 4 },
    { clave: 'ignSeismoInterval', rotulo: 'Repetición', unidad: 'min', porDefecto: 30 },
  ] },
  incendio: { titulo: 'los focos de calor', campos: [
    { clave: 'fuegoRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 50 },
    { clave: 'fuegoGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'naranja' },
  ] },
  clima_espacial: { titulo: 'el clima espacial', campos: [
    { clave: 'climaEspacialNivelMin', rotulo: 'Escala mínima (R, S, G)', unidad: '1-5', porDefecto: 2 },
  ] },
  calidad_aire: { titulo: 'la calidad del aire', campos: [
    { clave: 'aireGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'naranja' },
  ] },
  umbrales: { titulo: 'los umbrales de la estación', campos: [
    { clave: 'localThresholdWindKts', rotulo: 'Viento', unidad: 'kn', porDefecto: 20 },
    { clave: 'localThresholdTempMaxC', rotulo: 'Temperatura alta', unidad: '°C', porDefecto: 35 },
    { clave: 'localThresholdTempMinC', rotulo: 'Temperatura baja', unidad: '°C', porDefecto: 5 },
    { clave: 'localThresholdRainMm', rotulo: 'Lluvia', unidad: 'mm/h', porDefecto: 10 },
  ] },
  meteoalarm: { titulo: 'los avisos de MeteoAlarm', campos: [
    { clave: 'meteoalarmGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'amarillo' },
    { clave: 'meteoalarmRepetirMin', rotulo: 'Repetición', unidad: 'min', porDefecto: 60 },
  ] },
  huracan: { titulo: 'los ciclones tropicales', campos: [
    { clave: 'ciclonesRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 1000 },
    { clave: 'ciclonesGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'amarillo' },
  ] },
  radiacion: { titulo: 'la radiactividad ambiental', campos: [
    { clave: 'radiacionRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 100 },
    { clave: 'radiacionUmbral', rotulo: 'Umbral', unidad: 'µSv/h', porDefecto: 0.3 },
  ] },
  tsunami: { titulo: 'los tsunamis', campos: [
    { clave: 'tsunamiRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 3000 },
    { clave: 'tsunamiGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'amarillo' },
  ] },
  nws: { titulo: 'los avisos del NWS', campos: [
    { clave: 'nwsGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'naranja' },
  ] },
  eonet: { titulo: 'los sucesos de NASA EONET', campos: [
    { clave: 'eonetRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 300 },
  ] },
  effisPeligro: { titulo: 'el peligro de incendio (EFFIS)', campos: [
    { clave: 'effisPeligroGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'naranja' },
  ] },
  effisAreas: { titulo: 'las áreas quemadas (EFFIS)', campos: [
    { clave: 'effisAreasRadioKm', rotulo: 'Radio', unidad: 'km', porDefecto: 100 },
    { clave: 'effisAreasDias', rotulo: 'Cartografiadas en los últimos', unidad: 'días', porDefecto: 10 },
  ] },
  navtex: { titulo: 'los avisos NAVTEX', campos: [
    { clave: 'navtexRadioKm', rotulo: 'Radio (si traen posición)', unidad: 'km', porDefecto: 400 },
    { clave: 'navtexGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'naranja' },
  ] },
  egc: { titulo: 'los avisos Inmarsat-C', campos: [
    { clave: 'egcRadioKm', rotulo: 'Radio (si traen posición)', unidad: 'km', porDefecto: 500 },
    { clave: 'egcGravedadMinima', rotulo: 'Nivel mínimo', unidad: 'nivel', porDefecto: 'naranja' },
  ] },
  pronostico: { titulo: 'el pronóstico de WeatherAPI', campos: [
    { clave: 'thresholdWindKts', rotulo: 'Viento previsto', unidad: 'kn', porDefecto: 25 },
    { clave: 'thresholdTempMinC', rotulo: 'Helada', unidad: '°C', porDefecto: 0 },
    { clave: 'thresholdRainMm', rotulo: 'Lluvia en el día', unidad: 'mm', porDefecto: 20 },
    { clave: 'forecastDays', rotulo: 'Días', unidad: '1-3', porDefecto: 3 },
  ] },
};

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Reglas de difusión del tipo de aviso, editables por el administrador. */
function Reglas({ a, config, onGuardar, onGuardado }: { a: Aviso; config: TelemetryConfig; onGuardar: Guardar; onGuardado: () => void }) {
  const session = useAdminSession();
  const [editando, setEditando] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<string | null>(null);
  const regla = REGLAS[a.grupo ?? a.tipo];
  const actual = (c: CampoRegla) => String((config as any)[c.clave] ?? c.porDefecto);

  const abrir = () => {
    if (!regla) return;
    setV(Object.fromEntries(regla.campos.map((c) => [c.clave, actual(c)])));
    setEstado(null);
    setEditando(true);
  };

  const guardar = async () => {
    if (!regla) return;
    const cambios: Record<string, number | string> = {};
    for (const c of regla.campos) {
      if (c.unidad === 'nivel') cambios[c.clave] = v[c.clave];
      else {
        const n = Number(String(v[c.clave]).replace(',', '.'));
        if (!Number.isFinite(n)) { setEstado(`«${c.rotulo}» no es un número.`); return; }
        cambios[c.clave] = n;
      }
    }
    setEstado('Guardando…');
    const ok = await onGuardar(cambios as Partial<TelemetryConfig>);
    setEstado(ok ? null : 'No se pudo guardar.');
    if (ok) { setEditando(false); onGuardado(); }
  };

  return (
    <div className="border-t border-slate-800 pt-3.5 flex flex-col gap-2.5" id="reglas-aviso">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold text-slate-100">Reglas de {regla?.titulo ?? 'este tipo de aviso'}</div>
        {regla && !editando && (
          <button type="button" id="reglas-cambiar" onClick={abrir} disabled={!session.isAdmin} title={session.isAdmin ? '' : 'Solo el administrador'} className="text-sm font-semibold text-sky-400 disabled:opacity-40 cursor-pointer min-h-[32px]">
            Cambiar
          </button>
        )}
      </div>
      {!editando ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {regla
            ? regla.campos.map((c) => (
              <div key={c.clave}>
                <Dato rotulo={c.rotulo}>
                  {c.unidad === 'nivel' ? mayuscula(actual(c)) : c.unidad === 'km' ? `${actual(c)} km${a.deZona ? ' del borde de la zona' : ''}` : c.unidad === '1-5' ? `Nivel ${actual(c)}` : c.unidad === 'min' ? `Cada ${actual(c)} min` : `${actual(c)} ${c.unidad}`}
                </Dato>
              </div>
            ))
            : <Dato rotulo="Nivel mínimo">{mayuscula(a.reglas.gravedadMinima)}</Dato>}
          {(!regla || !regla.campos.some((c) => c.unidad === 'min')) && <Dato rotulo="Repetición">Cada {a.reglas.repetirMin} min</Dato>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {regla!.campos.map((c) => (
              <label key={c.clave} className="flex flex-col gap-1 text-xs text-slate-400">
                {c.rotulo}{c.unidad === 'nivel' ? '' : ` (${c.unidad})`}
                {c.unidad === 'nivel' ? (
                  <select className={campo} value={v[c.clave]} onChange={(e) => setV((x) => ({ ...x, [c.clave]: e.target.value }))}>
                    <option value="amarillo">Amarillo</option>
                    <option value="naranja">Naranja</option>
                    <option value="rojo">Rojo</option>
                  </select>
                ) : (
                  <input type="number" inputMode="decimal" className={campo} value={v[c.clave] ?? ''} onChange={(e) => setV((x) => ({ ...x, [c.clave]: e.target.value }))} />
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" id="reglas-guardar" onClick={guardar} className="min-h-[40px] px-4 rounded-lg bg-sky-400 text-slate-950 font-bold cursor-pointer">Guardar</button>
            <button type="button" onClick={() => setEditando(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-700 text-slate-200 cursor-pointer">Cancelar</button>
            {estado && <span className="text-[13px] text-amber-300">{estado}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Detalle({ a, txEnabled, onEmitido, config, onGuardar }: { a: Aviso; txEnabled: boolean; onEmitido: () => void; config: TelemetryConfig; onGuardar: Guardar }) {
  const session = useAdminSession();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const emitir = async () => {
    setMensaje('Enviando…');
    try {
      const r = await customFetch('/api/avisos/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
      const j = await r.json();
      setMensaje(r.ok ? (j.txEnabled ? 'Aviso puesto en la cola de emisión.' : 'Registrado, pero no emitido: la emisión está desactivada.') : `No enviado: ${j.error}`);
      onEmitido();
    } catch {
      setMensaje('No se pudo contactar con el servidor.');
    }
  };

  return (
    <Tarjeta aria-label="Detalle del aviso" className="flex flex-col gap-4" id="detalle-aviso">
      <div>
        <div className="text-xs text-slate-400">Aviso seleccionado · {a.fuente}</div>
        <div className="text-xl font-semibold text-slate-100">{tituloAviso(a)}</div>
        <div className="text-sm text-slate-300">{a.titulo}</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-slate-400">Lo que se emite por APRS</div>
        {[a.objeto, a.boletin].filter(Boolean).map((t) => (
          <code key={t} className="block font-mono text-[12.5px] text-sky-300 bg-slate-950 border border-slate-800 rounded-lg p-2.5 break-all">{t}</code>
        ))}
        {!a.objeto && <p className="text-[13px] text-slate-400">Sin posición: no genera objeto en el mapa.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Dato rotulo="Vigencia">{vigenciaLegible(a.inicio, a.fin)}</Dato>
        <Dato rotulo="Respecto a la estación">{distanciaLegible(a)}</Dato>
        <Dato rotulo="Última emisión">{a.emitido ? `${horaUtc(a.emitido.ultima)} UTC · ${a.emitido.veces} ${a.emitido.veces === 1 ? 'vez' : 'veces'}` : 'Nunca'}</Dato>
        <Dato rotulo="Próxima">{a.proxima ? (a.proxima <= Date.now() ? 'En el próximo ciclo' : `${horaUtc(a.proxima)} UTC`) : 'No se emite'}</Dato>
      </div>

      {!a.cumple && <p className="text-sm text-amber-300">No se difunde: {a.motivo}.</p>}

      <Reglas a={a} config={config} onGuardar={onGuardar} onGuardado={onEmitido} />

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          id="aviso-emitir"
          onClick={emitir}
          disabled={!a.cumple || !session.isAdmin}
          title={!session.isAdmin ? 'Solo el administrador' : !a.cumple ? 'El aviso no cumple las reglas' : 'Emite el objeto y el boletín ahora'}
          className="min-h-[44px] px-4 rounded-lg bg-sky-400 text-slate-950 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          Emitir ahora
        </button>
        {!txEnabled && <span className="text-[13px] text-amber-300">Emisión desactivada: nada sale al aire.</span>}
        {mensaje && <span className="text-[13px] text-slate-300" id="aviso-mensaje">{mensaje}</span>}
      </div>
    </Tarjeta>
  );
}

/** Catálogo de los sismos recientes de la fuente oficial, se anuncien o no. */
function CatalogoSismos({ sismos, radioKm }: { sismos: EarthquakeEvent[]; radioKm: number }) {
  // Los sismos inyectados como prueba (Sistema → Pruebas y simulación) no son del catálogo
  const reales = sismos.filter((q) => !String(q.id).startsWith('sim_')).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  if (reales.length === 0) return null;
  const cercanos = reales.filter((q) => q.enRango).length;
  const fecha = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)} ${d.toISOString().slice(11, 16)}`;
  };
  return (
    <details className="bg-slate-900 border border-slate-800 rounded-xl" id="catalogo-sismos">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-100 min-h-[44px]">
        Sismos recientes <span className="font-normal text-slate-400">· {reales.length} en el catálogo, {cercanos} a menos de {radioKm} km</span>
      </summary>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="font-normal py-1 pr-3">Fecha (UTC)</th>
              <th className="font-normal py-1 pr-3">Magnitud</th>
              <th className="font-normal py-1 pr-3">Prof.</th>
              <th className="font-normal py-1 pr-3">Lugar</th>
              <th className="font-normal py-1 text-right">Distancia</th>
            </tr>
          </thead>
          <tbody>
            {reales.slice(0, 60).map((q) => (
              <tr key={q.id} className="border-t border-slate-800">
                <td className="py-1.5 pr-3 font-mono text-slate-300 whitespace-nowrap">{fecha(q.time)}</td>
                <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{q.magnitud.toFixed(1)} <span className="text-slate-400">{q.magType}</span></td>
                <td className="py-1.5 pr-3 font-mono text-slate-300 whitespace-nowrap">{Math.round(q.depthKm)} km</td>
                <td className="py-1.5 pr-3 text-slate-200">{q.localizacion}</td>
                <td className={`py-1.5 text-right font-mono whitespace-nowrap ${q.enRango ? 'text-amber-300' : 'text-slate-400'}`}>{Math.round(q.distanciaKm)} km</td>
              </tr>
            ))}
          </tbody>
        </table>
        {reales.length > 60 && <p className="text-[13px] text-slate-400 mt-2">Se muestran los 60 más recientes.</p>}
      </div>
    </details>
  );
}

export default function Avisos({ config, onGuardar, sismos }: { config: TelemetryConfig; onGuardar: Guardar; sismos: EarthquakeEvent[] }) {
  const { avisos, total, txEnabled, error, recargar } = useAvisos();
  const [tipo, setTipo] = useState<string>('todos');
  const [elegidoId, setElegidoId] = useState<string | null>(null);

  const tipos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const a of avisos) cuenta.set(a.tipo, (cuenta.get(a.tipo) || 0) + 1);
    return [...cuenta.entries()];
  }, [avisos]);

  const visibles = tipo === 'todos' ? avisos : avisos.filter((a) => a.tipo === tipo);
  const cumplen = visibles.filter((a) => a.cumple);
  const resto = visibles.filter((a) => !a.cumple);
  const elegido = visibles.find((a) => a.id === elegidoId) ?? visibles[0] ?? null;

  const chip = (id: string, texto: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={tipo === id}
      onClick={() => setTipo(id)}
      className={`min-h-[44px] px-4 rounded-full border cursor-pointer whitespace-nowrap ${
        tipo === id ? 'border-sky-500 bg-sky-950 text-slate-50 font-semibold' : 'border-slate-800 text-slate-300 hover:border-slate-600'
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div className="flex flex-col gap-4" id="pagina-avisos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-100">Avisos</h1>
        <div className="flex flex-wrap gap-2">
          {chip('todos', `Todos · ${avisos.length}`)}
          {tipos.map(([t, n]) => chip(t, `${NOMBRE_TIPO[t] || t} · ${n}`))}
        </div>
      </div>

      {error && <Tarjeta className="text-amber-300">No se pudo consultar la lista de avisos.</Tarjeta>}
      {!error && avisos.length === 0 && (
        <Tarjeta className="text-slate-300">No hay avisos en vigor en las fuentes conectadas: sismos (IGN), meteorología (AEMET y, si se encienden, MeteoAlarm, umbrales y pronóstico), focos de calor (FIRMS), clima espacial (NOAA), calidad del aire (CAMS) y, si se encienden, ciclones tropicales (NHC) y radiactividad (EURDEP).</Tarjeta>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        <section aria-label="Lista de avisos" className="flex-[1.5] basis-[30rem] min-w-0 flex flex-col gap-2.5">
          {cumplen.map((a) => <div key={a.id}><Fila a={a} elegido={elegido?.id === a.id} onElegir={() => setElegidoId(a.id)} /></div>)}
          {resto.length > 0 && (
            <h2 className="mt-2 text-base font-semibold text-slate-400">Fuera de tus reglas: se muestran, no se emiten</h2>
          )}
          {resto.slice(0, 60).map((a) => <div key={a.id}><Fila a={a} elegido={elegido?.id === a.id} onElegir={() => setElegidoId(a.id)} /></div>)}
          {(resto.length > 60 || total > avisos.length) && (
            <p className="text-sm text-slate-400">Hay más avisos lejanos que no se listan.</p>
          )}
        </section>
        {elegido && (
          <aside className="flex-1 basis-80 min-w-0 lg:sticky lg:top-4">
            <Detalle a={elegido} txEnabled={txEnabled} onEmitido={recargar} config={config} onGuardar={onGuardar} />
          </aside>
        )}
      </div>

      <CatalogoSismos sismos={sismos} radioKm={config.filterRadiusKm ?? 200} />
    </div>
  );
}
