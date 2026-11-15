// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · aprx: solo lo que aprx da de verdad. Su configuración (aprx.conf) y
// su registro de radio (rflog): qué recibe, qué pasa a APRS-IS, qué descarta
// y qué repite o emite. Sin registro no hay cifras: se dice, no se inventan.
import React, { useEffect, useMemo, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { haceCuanto } from '../utils/useAvisos';
import { Cifra, Estado, GraficaMinutos, duracion, horaSeg } from '../components/radio/Piezas';

type Resultado = 'pasada' | 'sin-aprsis' | 'rechazada' | 'descartada' | 'repetida' | 'baliza' | 'emitida' | 'de-aprsis';
interface Linea { cuando: number; puerto: string; sentido: 'R' | 'd' | 'T'; resultado: Resultado; origen: string; destino: string; ruta: string; info: string; que: string }
interface Datos {
  servicio: { estado: 'active' | 'inactive' | 'failed'; desde: number | null };
  conf: null | {
    ruta: string; indicativo: string | null; posicion: string | null;
    aprsis: { servidor: string | null; puerto: number | null; filtro: string | null; conPasscode: boolean } | null;
    interfaces: Array<{ tipo: string; dispositivo: string; indicativo: string | null; emite: boolean }>;
    digipeater: { transmisor: string; fuentes: string[] } | null; balizas: number; registroRf: string | null; registroAprx: string | null;
  };
  registro: { activado: boolean; error: string; ultimaLinea: number | null };
  resumen: {
    recibidas: number; estaciones: number; pasadas: number; sinAprsis: number; rechazadas: number; repetidas: number; balizas: number; deAprsis: number;
    minutos: Array<{ minuto: number; recibidas: number; emitidas: number }>;
    puertos: Array<{ puerto: string; recibidas: number; pasadas: number; emitidas: number }>;
    pasarela: { funciona: boolean; desde: number | null } | null;
  };
  tramas: Linea[];
}

const RESULTADO: Record<Resultado, { texto: string; clase: string }> = {
  pasada: { texto: 'a APRS-IS', clase: 'border-emerald-500 text-emerald-400' },
  'sin-aprsis': { texto: 'sin APRS-IS', clase: 'border-amber-300 text-amber-300' },
  rechazada: { texto: 'rechazada', clase: 'border-slate-500 text-slate-400' },
  descartada: { texto: 'descartada', clase: 'border-slate-500 text-slate-400' },
  repetida: { texto: 'repetida', clase: 'border-amber-300 text-amber-300' },
  baliza: { texto: 'baliza', clase: 'border-amber-300 text-amber-300' },
  emitida: { texto: 'emitida', clase: 'border-amber-300 text-amber-300' },
  'de-aprsis': { texto: 'de APRS-IS', clase: 'border-sky-500 text-sky-400' },
};
const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;

export default function Aprx() {
  const admin = useAdminSession().admin;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [filtro, setFiltro] = useState<'todas' | 'pasadas' | 'descartadas' | 'emitidas'>('todas');
  const [pausa, setPausa] = useState<Linea[] | null>(null);
  const [registro, setRegistro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/radio/aprx').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta]);

  const tramas = useMemo(() => (pausa ?? datos?.tramas ?? []).filter((t) =>
    filtro === 'todas' || (filtro === 'pasadas' ? t.resultado === 'pasada' : filtro === 'emitidas' ? t.sentido === 'T' : ['sin-aprsis', 'rechazada', 'descartada'].includes(t.resultado))).slice(0, 50), [datos, pausa, filtro]);

  const reiniciar = async () => {
    if (!window.confirm('Se reinicia aprx: durante unos segundos no se pasan tramas a APRS-IS ni se repiten. ¿Seguir?')) return;
    setAviso({ ok: true, texto: 'Reiniciando…' });
    try {
      const r = await customFetch('/api/radio/aprx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'reiniciar' }) });
      const j = await r.json().catch(() => ({}));
      setAviso(r.ok ? { ok: true, texto: 'aprx reiniciado.' } : { ok: false, texto: j.error || 'No se pudo.' });
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setVuelta((v) => v + 1);
  };
  const verRegistro = async () => {
    if (registro !== null) { setRegistro(null); return; }
    setRegistro('Leyendo…');
    try { const j = await (await customFetch('/api/system/journal?servicio=aprx')).json(); setRegistro(String(j.logs ?? '')); } catch { setRegistro('No se pudo leer el registro.'); }
  };

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · aprx</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }
  const { servicio, conf, resumen } = datos;
  const sinRegistro = !datos.registro.activado;
  const p = resumen.pasarela;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · aprx</h1>

      <section aria-label="Estado de aprx" className="flex flex-wrap gap-3">
        <Estado id="aprx-servicio" titulo="Servicio" ok={servicio.estado === 'active'} texto={servicio.estado === 'active' ? 'Activo' : servicio.estado === 'failed' ? 'Ha fallado' : 'Parado'}
          detalle={servicio.estado === 'active' && servicio.desde ? `en marcha desde hace ${duracion(servicio.desde, ahora)}` : 'systemd: aprx.service'} />
        <Estado id="aprx-pasarela" titulo="Pasarela a APRS-IS (iGate)" ok={p ? p.funciona : null}
          texto={!conf?.aprsis ? 'Sin APRS-IS en la configuración' : !p ? 'Sin tramas todavía' : p.funciona ? 'Pasando tramas' : 'Sin conexión con APRS-IS'}
          detalle={conf?.aprsis ? <>{conf.aprsis.servidor}:{conf.aprsis.puerto}{!conf.aprsis.conPasscode ? ' · sin passcode: solo recibe' : ''}{p?.desde ? ` · última ${haceCuanto(p.desde, ahora)}` : ''}</> : '—'} />
        <Estado id="aprx-digi" titulo="Digipeater" ok={conf ? !!conf.digipeater : null} texto={conf?.digipeater ? `Activo como ${conf.digipeater.transmisor}` : 'Desactivado'}
          detalle={conf?.digipeater ? `repite lo que oye por ${conf.digipeater.fuentes.join(', ') || '—'}` : 'sin bloque <digipeater>'} />
        <Estado id="aprx-interfaces" titulo="Interfaces de radio" ok={conf ? conf.interfaces.length > 0 : null} texto={conf ? `${conf.interfaces.length} configurada${conf.interfaces.length === 1 ? '' : 's'}` : 'Sin configuración'}
          detalle={conf?.interfaces.map((i) => i.indicativo).filter(Boolean).join(' · ') || '—'} />
      </section>

      {sinRegistro ? (
        <p className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm" id="aprx-sin-registro">
          <b>Sin registro de radio de aprx:</b> las cifras y las tramas salen de él, y está desactivado. Para activarlo, añade
          <span className="font-mono"> rflog /var/log/aprx/aprx-rf.log</span> dentro de <span className="font-mono">&lt;logging&gt;</span> en aprx.conf (que la consola pueda leerlo) y reinicia aprx.
        </p>
      ) : datos.registro.error ? (
        <p className="text-sm text-amber-300">No se puede leer el registro de aprx: {datos.registro.error}.</p>
      ) : null}

      <section aria-label="Cifras de la última hora" className="flex flex-wrap gap-3">
        <Cifra id="aprx-recibidas" titulo="Recibidas por radio · última hora" valor={sinRegistro ? '—' : String(resumen.recibidas)} detalle={`${resumen.estaciones} estaciones distintas`} color="text-sky-400" />
        <Cifra titulo="Pasadas a APRS-IS" valor={sinRegistro ? '—' : String(resumen.pasadas)} detalle={resumen.sinAprsis ? `${resumen.sinAprsis} perdidas sin conexión` : 'iGate'} color="text-emerald-400" />
        <Cifra titulo="Descartadas" valor={sinRegistro ? '—' : String(resumen.rechazadas)} detalle="duplicadas o no válidas para APRS-IS" />
        <Cifra titulo="Repetidas (digipeater)" valor={sinRegistro ? '—' : String(resumen.repetidas)} detalle={`${resumen.balizas} balizas propias`} color="text-amber-300" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Tráfico de la última hora" className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-100">Tráfico por minuto · última hora</h2>
            <GraficaMinutos id="aprx-grafica" minutos={resumen.minutos.map((m) => ({ minuto: m.minuto, a: m.recibidas, b: m.emitidas }))} etiquetas={['Recibidas', 'Emitidas']} />
          </Tarjeta>

          <Tarjeta aria-label="Registro en directo" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Registro en directo</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar">
                {([['todas', 'Todas'], ['pasadas', 'A APRS-IS'], ['descartadas', 'Descartadas'], ['emitidas', 'Emitidas']] as const).map(([k, n]) => (
                  <button key={k} type="button" className={pastilla(filtro === k)} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{n}</button>
                ))}
                <button type="button" className={pastilla(pausa !== null)} aria-pressed={pausa !== null} onClick={() => setPausa(pausa ? null : datos.tramas)}>{pausa ? 'Seguir' : 'Pausar'}</button>
              </div>
            </div>
            {tramas.length === 0 ? <p className="text-sm text-slate-400">{sinRegistro ? 'Sin registro de radio.' : 'Nada en el registro todavía.'}</p> : (
              <div className="overflow-auto max-h-[620px]">
                <table className="w-full text-sm" id="aprx-tramas">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900">
                      <th className="font-normal py-1 pr-3">Hora</th><th className="font-normal py-1 pr-3">Interfaz</th><th className="font-normal py-1 pr-3" />
                      <th className="font-normal py-1 pr-3">Origen</th><th className="font-normal py-1 pr-3">Qué es</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tramas.map((t, i) => (
                      <tr key={`${t.cuando}-${i}`} className="border-t border-slate-800" title={`${t.origen}>${t.destino}${t.ruta ? `,${t.ruta}` : ''}:${t.info}`}>
                        <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{horaSeg(t.cuando)}</td>
                        <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{t.puerto}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap"><span className={`border rounded px-1.5 text-xs font-bold ${RESULTADO[t.resultado].clase}`}>{RESULTADO[t.resultado].texto}</span></td>
                        <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{t.origen}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{t.que}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[13px] text-slate-400">«a APRS-IS»: recibida y pasada a Internet. «sin APRS-IS»: recibida, pero aprx no tenía conexión. «rechazada»: no se pasa (duplicada o no válida). «repetida»: el digipeater la volvió a emitir. Las horas son las del registro de aprx.</p>
          </Tarjeta>
        </div>

        <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Por interfaz" className="flex flex-col gap-2" id="aprx-puertos">
            <h2 className="text-lg font-semibold text-slate-100">Por interfaz · última hora</h2>
            {!conf || conf.interfaces.length === 0 ? <p className="text-sm text-slate-400">Sin interfaces en aprx.conf.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="font-normal py-1 pr-2">Interfaz</th><th className="font-normal py-1 pr-2 text-right">Recibidas</th><th className="font-normal py-1 pr-2 text-right">A APRS-IS</th><th className="font-normal py-1 text-right">Emitidas</th></tr></thead>
                <tbody>
                  {conf.interfaces.map((i) => {
                    const c = resumen.puertos.find((x) => x.puerto.toUpperCase() === (i.indicativo ?? '').toUpperCase());
                    return (
                      <tr key={`${i.indicativo}-${i.dispositivo}`} className="border-t border-slate-800">
                        <td className="py-1.5 pr-2"><div className="font-mono text-slate-100">{i.indicativo ?? '—'}</div><div className="text-xs text-slate-400 break-all">{i.dispositivo}{i.emite ? ' · emite' : ' · solo recibe'}</div></td>
                        <td className="py-1.5 pr-2 text-right font-mono text-sky-400">{sinRegistro ? '—' : c?.recibidas ?? 0}</td>
                        <td className="py-1.5 pr-2 text-right font-mono text-emerald-400">{sinRegistro ? '—' : c?.pasadas ?? 0}</td>
                        <td className="py-1.5 text-right font-mono text-amber-300">{sinRegistro ? '—' : c?.emitidas ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {resumen.deAprsis > 0 && <p className="text-[13px] text-slate-400">De APRS-IS hacia la radio en la última hora: {resumen.deAprsis}.</p>}
          </Tarjeta>

          <Tarjeta aria-label="Configuración de aprx" className="flex flex-col gap-3" id="aprx-conf">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Configuración</h2>
              {conf && <span className="font-mono text-[13px] text-slate-400">{conf.ruta}</span>}
            </div>
            {!conf ? <p className="text-sm text-amber-300">No se encuentra aprx.conf (ni en /etc ni junto a la consola).</p> : (
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Indicativo (mycall)', conf.indicativo], ['Posición (myloc)', conf.posicion],
                  ['Servidor APRS-IS', conf.aprsis ? `${conf.aprsis.servidor}:${conf.aprsis.puerto}` : null], ['Filtro', conf.aprsis?.filtro ?? null],
                  ['Passcode', conf.aprsis ? (conf.aprsis.conPasscode ? 'configurado' : 'sin passcode (solo recibe)') : null], ['Balizas', String(conf.balizas)],
                  ['Registro de radio (rflog)', conf.registroRf], ['Registro de aprx', conf.registroAprx],
                ] as Array<[string, string | null]>).map(([k, v]) => (
                  <div key={k} className="min-w-0"><div className="text-xs text-slate-400">{k}</div><div className={`font-mono text-[15px] break-words ${v === null ? 'text-slate-500' : 'text-slate-100'}`}>{v ?? '—'}</div></div>
                ))}
              </div>
            )}
            {admin && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} aria-expanded={registro !== null} onClick={verRegistro}>{registro !== null ? 'Ocultar registro' : 'Ver registro'}</button>
                <button type="button" className={boton} onClick={reiniciar}>Reiniciar servicio</button>
              </div>
            )}
            {registro !== null && <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[12px] font-mono text-slate-300 max-h-72 overflow-auto whitespace-pre-wrap">{registro}</pre>}
            <p className="text-[13px] text-slate-400">Para editar el archivo: Sistema → Configuración → «Archivos .conf Debian». El passcode no se muestra.</p>
          </Tarjeta>
          {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{aviso.texto}</p>}
        </div>
      </div>
    </div>
  );
}
