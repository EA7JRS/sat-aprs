// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Tramas APRS: todo lo que entra por radio y por APRS-IS y todo lo
// que sale, explicado; y un analizador para descomponer una trama a mano.
// Aquí no se emite nada: los mensajes se envían desde Radio · Principal.
import React, { useEffect, useMemo, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { haceCuanto } from '../utils/useAvisos';
import { Cifra, Estado, duracion, horaSeg } from '../components/radio/Piezas';
import { descargar } from '../utils/descargar';
import { useAdminSession } from '../utils/session';

type Via = 'RF' | 'IS' | 'TX';
interface Trama { n: number; cuando: number; via: Via; origen: string; destino: string; ruta: string; info: string; tipo: string; que: string; noEmitida?: string | null; canales?: string }
interface Datos {
  kiss: { conectado: boolean; desde: number; puerto: number };
  aprsIs: { estado: string; servidor: string };
  txEnabled: boolean;
  resumen: { porVia: Record<Via, number>; porTipo: Record<string, number>; estaciones: number; total: number };
  tipos: Record<string, string>;
  tramas: Trama[];
}
interface Analisis {
  ok: boolean; error?: string; avisos: string[]; tipo?: string; nombreTipo?: string; que?: string;
  campos: { nombre: string; valor: string }[];
  posicion?: { lat: number; lon: number; distanciaKm: number | null; rumbo: number | null };
}

const VIA: Record<Via, { texto: string; clase: string }> = {
  RF: { texto: 'radio', clase: 'border-sky-500 text-sky-400' },
  IS: { texto: 'APRS-IS', clase: 'border-violet-400 text-violet-300' },
  TX: { texto: 'emitida', clase: 'border-amber-300 text-amber-300' },
};
const ESTADO_IS: Record<string, string> = {
  conectado: 'Conectado', 'solo-recepcion': 'Solo recepción', conectando: 'Conectando…', desconectado: 'Desconectado', parado: 'Parado',
};
const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50';
const botonFuerte = 'min-h-[44px] px-4 rounded-lg border border-sky-500 bg-sky-900 text-slate-50 font-semibold cursor-pointer hover:bg-sky-800 disabled:opacity-50';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;
const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const tnc2 = (t: Trama) => `${t.origen}>${t.destino}${t.ruta ? `,${t.ruta}` : ''}:${t.info}`;
const ir = (tab: string) => window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab } }));

export default function TramasAprs() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [via, setVia] = useState<'todas' | Via>('todas');
  const [tipo, setTipo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pausa, setPausa] = useState<Trama[] | null>(null);
  const [texto, setTexto] = useState('');
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);
  const { isAdmin } = useAdminSession();
  const [hq, setHq] = useState('');
  const [hDias, setHDias] = useState('7');
  const [hVia, setHVia] = useState<'todas' | Via>('todas');
  const [hist, setHist] = useState<{ disponible: boolean; error: string | null; tramas: Trama[] } | null>(null);
  const [hCargando, setHCargando] = useState(false);
  const [hError, setHError] = useState<string | null>(null);
  const consultaHist = (csv = false) => {
    const p = new URLSearchParams({ dias: hDias });
    if (hq.trim()) p.set('q', hq.trim());
    if (hVia !== 'todas') p.set('via', hVia);
    if (csv) p.set('formato', 'csv');
    return `/api/historial/tramas?${p}`;
  };
  const buscarHist = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setHCargando(true); setHError(null);
    try {
      const r = await customFetch(consultaHist());
      if (!r.ok) throw new Error();
      setHist(await r.json());
    } catch { setHError('No se pudo consultar el historial.'); }
    setHCargando(false);
  };

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/radio/tramas').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const lista = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    return (pausa ?? datos?.tramas ?? []).filter((t) => (via === 'todas' || t.via === via) && (!tipo || t.tipo === tipo)
      && (!q || t.origen.includes(q) || t.destino.includes(q) || t.info.toUpperCase().includes(q))).slice(0, 100);
  }, [datos, pausa, via, tipo, buscar]);

  const analizar = async (linea: string) => {
    setTexto(linea);
    if (!linea.trim()) { setAnalisis(null); return; }
    try {
      const r = await customFetch('/api/radio/tramas/analizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trama: linea }) });
      setAnalisis(await r.json());
    } catch { setAnalisis({ ok: false, error: 'Sin conexión con la consola.', avisos: [], campos: [] }); }
  };

  const fila = (t: Trama, conFecha = false) => (
                    <tr key={t.n} className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/60 ${elegida === t.n ? 'bg-slate-800/60' : ''}`} title={tnc2(t)} tabIndex={0}
                      onClick={() => { setElegida(t.n); void analizar(tnc2(t)); }} onKeyDown={(e) => { if (e.key === 'Enter') { setElegida(t.n); void analizar(tnc2(t)); } }}>
                      <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{conFecha && <span className="text-slate-500">{new Date(t.cuando).toISOString().slice(5, 10)} </span>}{horaSeg(t.cuando)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap"><span className={`border rounded px-1.5 text-xs font-bold ${VIA[t.via].clase}`}>{VIA[t.via].texto}</span></td>
                      <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{t.origen}</td>
                      <td className="py-1.5 text-slate-300">
                        {!t.que.startsWith(datos?.tipos[t.tipo] ?? '\u0000') && <span className="text-slate-400">{datos?.tipos[t.tipo] ?? t.tipo} · </span>}{t.que}
                        {t.via === 'TX' && (t.noEmitida
                          ? <span className="block text-xs text-amber-300">No emitida: {t.noEmitida}</span>
                          : t.canales && <span className="block text-xs text-slate-400">por {t.canales}</span>)}
                      </td>
                    </tr>
  );

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · Tramas APRS</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }
  const { resumen } = datos;
  const isOk = datos.aprsIs.estado === 'conectado' || datos.aprsIs.estado === 'solo-recepcion';
  const tiposConTramas = Object.entries(datos.tipos).filter(([k]) => (resumen.porTipo[k] ?? 0) > 0 || k === tipo);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · Tramas APRS</h1>

      <section aria-label="Estado" className="flex flex-wrap gap-3">
        <Estado id="tr-radio" titulo="Radio (KISS de Direwolf)" ok={datos.kiss.conectado} texto={datos.kiss.conectado ? 'Conectado' : 'Sin conexión'}
          detalle={datos.kiss.conectado ? `puerto ${datos.kiss.puerto}${datos.kiss.desde ? ` · desde hace ${duracion(datos.kiss.desde, ahora)}` : ''}` : `puerto ${datos.kiss.puerto}: ¿está Direwolf en marcha?`} />
        <Estado id="tr-is" titulo="APRS-IS" ok={datos.aprsIs.estado === 'parado' ? null : isOk} texto={ESTADO_IS[datos.aprsIs.estado] ?? datos.aprsIs.estado}
          detalle={datos.aprsIs.estado === 'solo-recepcion' ? `${datos.aprsIs.servidor} · el passcode no corresponde al indicativo` : datos.aprsIs.servidor} />
        <Estado id="tr-tx" titulo="Emisión" ok={datos.txEnabled} texto={datos.txEnabled ? 'Activada' : 'Desactivada'}
          detalle={datos.txEnabled ? 'lo que sale se ve aquí como «emitida»' : 'SAT_APRS_TX: nada sale al aire'} />
      </section>

      <section aria-label="Cifras de la última hora" className="flex flex-wrap gap-3">
        <Cifra id="tr-rf" titulo="Por radio · última hora" valor={String(resumen.porVia.RF)} detalle={`${resumen.estaciones} estaciones distintas`} color="text-sky-400" />
        <Cifra titulo="Por APRS-IS" valor={String(resumen.porVia.IS)} detalle="según el filtro de la sesión" color="text-violet-300" />
        <Cifra titulo="Emitidas" valor={String(resumen.porVia.TX)} detalle="por la cola de emisión" color="text-amber-300" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <Tarjeta aria-label="Tramas en directo" className="xl:col-span-3 min-w-0 flex flex-col gap-3" id="tr-directo">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-100">En directo</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Por dónde">
              {([['todas', 'Todas'], ['RF', 'Radio'], ['IS', 'APRS-IS'], ['TX', 'Emitidas']] as const).map(([k, n]) => (
                <button key={k} type="button" className={pastilla(via === k)} aria-pressed={via === k} onClick={() => setVia(k)}>{n}</button>
              ))}
              <button type="button" className={pastilla(pausa !== null)} aria-pressed={pausa !== null} onClick={() => setPausa(pausa ? null : datos.tramas)}>{pausa ? 'Seguir' : 'Pausar'}</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className={`${campo} sm:w-56`} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
              <option value="">Todos los tipos</option>
              {tiposConTramas.map(([k, n]) => <option key={k} value={k}>{n}{resumen.porTipo[k] ? ` (${resumen.porTipo[k]})` : ''}</option>)}
            </select>
            <input className={`${campo} sm:w-56 font-mono`} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Indicativo o texto" aria-label="Buscar" />
          </div>
          {lista.length === 0 ? (
            <p className="text-sm text-slate-400">{datos.tramas.length === 0 ? 'Todavía no ha pasado ninguna trama.' : 'Ninguna trama con estos filtros.'}</p>
          ) : (
            <div className="overflow-auto max-h-[640px]">
              <table className="w-full text-sm" id="tr-tabla">
                <thead>
                  <tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900">
                    <th className="font-normal py-1 pr-3">Hora (UTC)</th><th className="font-normal py-1 pr-3" /><th className="font-normal py-1 pr-3">Origen</th><th className="font-normal py-1">Qué es</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((t) => fila(t))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[13px] text-slate-400">Toca una trama para verla descompuesta. Aquí están las 500 últimas; las anteriores, en el historial de abajo.</p>
        </Tarjeta>

        <Tarjeta aria-label="Analizador" className="xl:col-span-2 min-w-0 flex flex-col gap-3" id="tr-analizador">
          <h2 className="text-lg font-semibold text-slate-100">Analizador</h2>
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); setElegida(null); void analizar(texto); }}>
            <textarea className={`${campo} min-h-[88px] py-2 font-mono text-[13px]`} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="EA7XXX-9>APRS,WIDE1-1:!3723.00N/00559.00W>Hola" aria-label="Trama" id="tr-texto" spellCheck={false} />
            <div className="flex gap-2">
              <button type="submit" className={botonFuerte} disabled={!texto.trim()}>Analizar</button>
              {analisis && <button type="button" className={boton} onClick={() => { setTexto(''); setAnalisis(null); setElegida(null); }}>Limpiar</button>}
            </div>
          </form>
          {analisis && (!analisis.ok ? <p className="text-sm text-amber-300" role="alert">{analisis.error}</p> : (
            <div className="flex flex-col gap-3" id="tr-resultado">
              <div>
                {!analisis.que?.startsWith(analisis.nombreTipo ?? '\u0000') && <div className="text-xs text-slate-400">{analisis.nombreTipo}</div>}
                <div className="text-[17px] font-semibold text-slate-100 break-words">{analisis.que}</div>
              </div>
              {analisis.avisos.length > 0 && (
                <ul className="border border-amber-700 bg-amber-950 text-amber-300 rounded-lg px-3 py-2 text-sm list-disc pl-6" id="tr-avisos">
                  {analisis.avisos.map((a) => <li key={a}>{a}</li>)}
                </ul>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {analisis.campos.map((c) => (
                  <React.Fragment key={c.nombre}>
                    <dt className="text-slate-400">{c.nombre}</dt>
                    <dd className="font-mono text-slate-100 break-all">{c.valor || '—'}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {analisis.posicion && (
                <a className="text-sm font-semibold text-sky-400 hover:text-sky-300" target="_blank" rel="noopener noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${analisis.posicion.lat}&mlon=${analisis.posicion.lon}#map=13/${analisis.posicion.lat}/${analisis.posicion.lon}`}>
                  Ver la posición en OpenStreetMap
                </a>
              )}
            </div>
          ))}
          <p className="text-[13px] text-slate-400">
            Solo analiza: no emite nada. Para enviar mensajes y boletines, <button type="button" className="text-sky-400 font-semibold hover:text-sky-300 cursor-pointer" onClick={() => ir('radio-principal')}>Radio · Principal</button>.
            {datos.tramas[0] && <> Última trama {haceCuanto(datos.tramas[0].cuando, ahora)}.</>}
          </p>
        </Tarjeta>
      </div>

      <Tarjeta aria-label="Historial de tramas" className="min-w-0 flex flex-col gap-3" id="tr-historial">
        <h2 className="text-lg font-semibold text-slate-100">Historial</h2>
        <form className="flex flex-wrap items-end gap-2" onSubmit={buscarHist}>
          <input className={`${campo} sm:w-56 font-mono`} value={hq} onChange={(e) => setHq(e.target.value)} placeholder="Indicativo o texto" aria-label="Buscar en el historial" id="tr-hist-q" />
          <select className={`${campo} sm:w-40`} value={hDias} onChange={(e) => setHDias(e.target.value)} aria-label="Días">
            {[['1', 'Último día'], ['7', '7 días'], ['30', '30 días'], ['365', 'Un año']].map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
          <select className={`${campo} sm:w-40`} value={hVia} onChange={(e) => setHVia(e.target.value as 'todas' | Via)} aria-label="Por dónde en el historial">
            <option value="todas">Todas</option><option value="RF">Radio</option><option value="IS">APRS-IS</option><option value="TX">Emitidas</option>
          </select>
          <button type="submit" className={botonFuerte} disabled={hCargando} id="tr-hist-buscar">{hCargando ? 'Buscando…' : 'Buscar'}</button>
          {isAdmin && <button type="button" className={boton} id="tr-hist-csv" onClick={async () => setHError(await descargar(consultaHist(true), `tramas-${new Date().toISOString().slice(0, 10)}.csv`))}>Exportar CSV</button>}
        </form>
        {hError && <p className="text-sm text-amber-300" role="alert">{hError}</p>}
        {hist && (!hist.disponible ? <p className="text-sm text-amber-300">Sin historial en disco: {hist.error}.</p> : hist.tramas.length === 0
          ? <p className="text-sm text-slate-400">Ninguna trama guardada con estos filtros.</p> : (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-sm" id="tr-hist-tabla">
                <thead>
                  <tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900">
                    <th className="font-normal py-1 pr-3">Fecha y hora (UTC)</th><th className="font-normal py-1 pr-3" /><th className="font-normal py-1 pr-3">Origen</th><th className="font-normal py-1">Qué es</th>
                  </tr>
                </thead>
                <tbody>{hist.tramas.map((t) => fila(t, true))}</tbody>
              </table>
            </div>
          ))}
        <p className="text-[13px] text-slate-400">
          Las tramas se guardan en disco y sobreviven a un reinicio; se muestran las 300 más recientes que cumplen el filtro{isAdmin ? ' y el CSV lleva hasta 5000' : ''}. Los días que se guardan se ajustan en Sistema · Equipo.
        </p>
      </Tarjeta>
    </div>
  );
}
