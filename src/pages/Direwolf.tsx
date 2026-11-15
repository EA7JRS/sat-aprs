// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Direwolf: solo lo que Direwolf da de verdad. Estado del servicio,
// del enlace KISS y del registro; tramas de la última hora; nivel de audio por
// estación (del registro CSV de Direwolf); su configuración y una prueba de
// emisión. Sin registro no hay niveles: se dice, no se inventan.
import React, { useEffect, useMemo, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { haceCuanto } from '../utils/useAvisos';
import { Cifra, Estado, duracion, horaMin, horaSeg } from '../components/radio/Piezas';

interface Trama {
  cuando: number; sentido: 'RX' | 'TX'; origen: string; destino: string; ruta: string; info: string;
  via: string | null; nivel: number | null; corregidos: number | null; que: string;
}
interface Datos {
  servicio: { estado: 'active' | 'inactive' | 'failed'; desde: number | null };
  kiss: { conectado: boolean; desde: number | null; puerto: number };
  conf: null | {
    ruta: string; indicativo: string | null; audio: string | null; muestreo: number | null; modem: string | null; ptt: string | null;
    puertoKiss: number | null; puertoAgw: number | null; txDelayMs: number | null; txTailMs: number | null; fixBits: number | null; carpetaLog: string | null; canales: number;
  };
  registro: { activado: boolean; archivo: string | null; error: string; ultimaLinea: number | null };
  franja: { bajo: number; alto: number };
  resumen: { recibidas: number; estaciones: number; emitidas: number; conRegistro: number; nivelMedio: number | null; corregidas: number; minutos: Array<{ minuto: number; rx: number; tx: number }> };
  niveles: Array<{ estacion: string; nivel: number; cuando: number; tramas: number }>;
  propia: { por: string; cuando: number; trasSegundos: number | null } | null;
  ultimaEmisionPropia: number | null;
  txEnabled: boolean;
  tramas: Trama[];
}

const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';
const botonPrincipal = 'min-h-[44px] px-5 rounded-lg bg-sky-500 text-slate-950 font-bold cursor-pointer hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed';
const pastilla = (activa: boolean) => `min-h-[40px] px-3.5 rounded-full border text-sm cursor-pointer ${activa ? 'border-sky-500 bg-sky-950 text-slate-100 font-semibold' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`;

const colorNivel = (n: number, f: Datos['franja']) => (n < f.bajo ? 'text-amber-300' : n > f.alto ? 'text-red-400' : 'text-emerald-400');
const fondoNivel = (n: number, f: Datos['franja']) => (n < f.bajo ? 'bg-amber-300' : n > f.alto ? 'bg-red-400' : 'bg-emerald-400');
const notaNivel = (n: number, f: Datos['franja']) => (n < f.bajo ? 'bajo' : n > f.alto ? 'alto: satura' : 'correcto');

export default function Direwolf() {
  const session = useAdminSession();
  const admin = session.admin;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [filtro, setFiltro] = useState<'todas' | 'RX' | 'TX' | 'mensajes'>('todas');
  const [pausa, setPausa] = useState<Trama[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [registro, setRegistro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/radio/direwolf').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 2000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta]);

  const tramas = useMemo(() => (pausa ?? datos?.tramas ?? []).filter((t) =>
    filtro === 'todas' || (filtro === 'mensajes' ? t.info.startsWith(':') : t.sentido === filtro)).slice(0, 40), [datos, pausa, filtro]);

  const orden = async (accion: 'prueba' | 'reiniciar') => {
    if (accion === 'reiniciar' && !window.confirm('Se reinicia Direwolf: durante unos segundos no se recibe ni se emite por radio. ¿Seguir?')) return;
    setAviso({ ok: true, texto: accion === 'prueba' ? 'Emitiendo…' : 'Reiniciando…' });
    try {
      const r = await customFetch('/api/radio/direwolf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setAviso({ ok: false, texto: j.error || 'No se pudo.' });
      else if (accion === 'prueba') setAviso(j.txEnabled ? { ok: true, texto: 'Baliza en la cola de emisión. Si algún repetidor la devuelve, se indica aquí.' } : { ok: false, texto: 'La emisión está desactivada: la baliza no sale al aire.' });
      else setAviso({ ok: true, texto: 'Direwolf reiniciado.' });
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setVuelta((v) => v + 1);
  };
  const verRegistro = async () => {
    if (registro !== null) { setRegistro(null); return; }
    setRegistro('Leyendo…');
    try {
      const r = await customFetch('/api/system/journal?servicio=direwolf');
      const j = await r.json();
      setRegistro(String(j.logs ?? ''));
    } catch { setRegistro('No se pudo leer el registro.'); }
  };

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · Direwolf</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }

  const { servicio, kiss, conf, resumen, franja } = datos;
  const maxMin = Math.max(1, ...resumen.minutos.map((m) => m.rx + m.tx));
  const servicioTexto = servicio.estado === 'active' ? 'Activo' : servicio.estado === 'failed' ? 'Ha fallado' : 'Parado';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-100">Radio · Direwolf</h1>

      <section aria-label="Estado de Direwolf" className="flex flex-wrap gap-3">
        <Estado id="dw-servicio" titulo="Servicio" ok={servicio.estado === 'active'} texto={servicioTexto}
          detalle={servicio.estado === 'active' && servicio.desde ? `en marcha desde hace ${duracion(servicio.desde, ahora)}` : 'systemd: direwolf.service'} />
        <Estado id="dw-kiss" titulo="Enlace KISS" ok={kiss.conectado} texto={kiss.conectado ? 'Conectado' : 'Sin conexión'}
          detalle={<>127.0.0.1:{kiss.puerto} · {kiss.conectado ? 'la consola recibe y emite por aquí' : 'se reintenta solo'}</>} />
        <Estado id="dw-audio" titulo="Audio y módem" ok={conf ? true : null} texto={conf?.modem ?? 'Sin configuración'}
          detalle={conf ? [conf.audio, conf.muestreo ? `${conf.muestreo.toLocaleString('es-ES')} Hz` : null].filter(Boolean).join(' · ') || 'tarjeta de serie' : 'no se encuentra direwolf.conf'} />
        <Estado id="dw-ptt" titulo="PTT" ok={conf?.ptt ? true : null} texto={conf?.ptt ?? 'Sin PTT en la configuración'}
          detalle={[conf?.txDelayMs != null ? `TXDELAY ${conf.txDelayMs} ms` : null, datos.ultimaEmisionPropia ? `última emisión ${haceCuanto(datos.ultimaEmisionPropia, ahora)}` : null].filter(Boolean).join(' · ') || '—'} />
      </section>

      <section aria-label="Cifras de la última hora" className="flex flex-wrap gap-3">
        <Cifra id="dw-recibidas" titulo="Recibidas · última hora" valor={String(resumen.recibidas)} detalle={`${resumen.estaciones} ${resumen.estaciones === 1 ? 'estación distinta' : 'estaciones distintas'}`} color="text-sky-400" />
        <Cifra titulo="Emitidas · última hora" valor={String(resumen.emitidas)} detalle="por la consola" color="text-amber-300" />
        <Cifra id="dw-nivel" titulo="Nivel de audio medio" valor={resumen.nivelMedio === null ? '—' : String(resumen.nivelMedio)}
          detalle={resumen.nivelMedio === null ? (datos.registro.activado ? 'sin tramas en el registro' : 'hace falta el registro') : `${notaNivel(resumen.nivelMedio, franja)} (entre ${franja.bajo} y ${franja.alto})`}
          color={resumen.nivelMedio === null ? 'text-slate-400' : colorNivel(resumen.nivelMedio, franja)} />
        <Cifra titulo="Con bits corregidos" valor={datos.registro.activado ? String(resumen.corregidas) : '—'}
          detalle={datos.registro.activado ? `de ${resumen.conRegistro} · FIX_BITS ${conf?.fixBits ?? 'de serie'}` : 'hace falta el registro'} />
      </section>

      {!datos.registro.activado && (
        <p className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm" id="dw-sin-registro">
          <b>Sin registro de Direwolf:</b> el nivel de audio y los bits corregidos salen de su registro, que está desactivado.
          Para activarlo, añade <span className="font-mono">LOGDIR /var/log/direwolf</span> a direwolf.conf (la carpeta debe existir y poder leerla la consola) y reinicia Direwolf.
        </p>
      )}
      {datos.registro.activado && datos.registro.error && (
        <p className="text-sm text-amber-300">No se puede leer el registro de Direwolf: {datos.registro.error}.</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Tráfico de la última hora" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Tráfico por minuto · última hora</h2>
              <div className="flex gap-4 text-[13px] text-slate-300">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />Recibidas</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" />Emitidas</span>
              </div>
            </div>
            <div role="img" aria-label={`Tramas por minuto: ${resumen.recibidas} recibidas y ${resumen.emitidas} emitidas en la última hora`} className="flex items-end gap-[2px] h-24 border-b border-slate-800" id="dw-grafica">
              {resumen.minutos.map((m) => (
                <div key={m.minuto} className="flex-1 h-full flex flex-col justify-end gap-px" title={`${horaMin(m.minuto)} UTC · ${m.rx} recibidas, ${m.tx} emitidas`}>
                  {m.tx > 0 && <span className="bg-amber-300 rounded-[1px]" style={{ height: `${(m.tx / maxMin) * 100}%` }} />}
                  {m.rx > 0 && <span className="bg-sky-500 rounded-[1px]" style={{ height: `${(m.rx / maxMin) * 100}%` }} />}
                </div>
              ))}
            </div>
            <div className="flex justify-between font-mono text-xs text-slate-400">
              {[0, 15, 30, 45, 59].map((i) => <span key={i}>{horaMin(resumen.minutos[i].minuto)}</span>)}
            </div>
          </Tarjeta>

          <Tarjeta aria-label="Tramas en directo" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Tramas en directo</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar">
                {([['todas', 'Todas'], ['RX', 'Recibidas'], ['TX', 'Emitidas'], ['mensajes', 'Mensajes']] as const).map(([k, n]) => (
                  <button key={k} type="button" className={pastilla(filtro === k)} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{n}</button>
                ))}
                <button type="button" className={pastilla(pausa !== null)} aria-pressed={pausa !== null} onClick={() => setPausa(pausa ? null : datos.tramas)}>{pausa ? 'Seguir' : 'Pausar'}</button>
              </div>
            </div>
            {tramas.length === 0 ? (
              <p className="text-sm text-slate-400">{kiss.conectado ? 'Todavía no ha pasado ninguna trama por Direwolf.' : 'Sin conexión KISS con Direwolf.'}</p>
            ) : (
              <div className="overflow-auto max-h-[620px]">
                <table className="w-full text-sm" id="dw-tramas">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 sticky top-0 bg-slate-900">
                      <th className="font-normal py-1 pr-3">UTC</th><th className="font-normal py-1 pr-3" /><th className="font-normal py-1 pr-3">Origen</th>
                      <th className="font-normal py-1 pr-3">Llegó por</th><th className="font-normal py-1 pr-3">Qué es</th><th className="font-normal py-1 text-right">Audio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tramas.map((t) => {
                      const clave = `${t.cuando}-${t.sentido}-${t.origen}`;
                      return (
                        <React.Fragment key={clave}>
                          <tr className="border-t border-slate-800 cursor-pointer hover:bg-slate-900" onClick={() => setAbierta(abierta === clave ? null : clave)} aria-expanded={abierta === clave}>
                            <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{horaSeg(t.cuando)}</td>
                            <td className="py-1.5 pr-3"><span className={`border rounded px-1.5 text-xs font-bold ${t.sentido === 'TX' ? 'border-amber-300 text-amber-300' : 'border-sky-500 text-sky-400'}`}>{t.sentido}</span></td>
                            <td className="py-1.5 pr-3 font-mono text-slate-100 whitespace-nowrap">{t.origen}</td>
                            <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">{t.sentido === 'TX' ? t.ruta || '—' : t.via ? `${t.via}*` : 'directa'}</td>
                            <td className="py-1.5 pr-3 text-slate-300">{t.que}</td>
                            <td className={`py-1.5 text-right font-mono whitespace-nowrap ${t.nivel === null ? 'text-slate-500' : colorNivel(t.nivel, franja)}`}>
                              {t.nivel === null ? '—' : t.nivel}{t.corregidos ? <span className="text-slate-400 text-xs" title="bits corregidos"> ·{t.corregidos}b</span> : null}
                            </td>
                          </tr>
                          {abierta === clave && (
                            <tr className="border-t border-slate-800 bg-slate-950">
                              <td colSpan={6} className="py-2 px-1">
                                <div className="font-mono text-[13px] text-slate-200 break-all">{t.origen}&gt;{t.destino}{t.ruta ? `,${t.ruta}` : ''}:{t.info}</div>
                                <div className="font-mono text-[12px] text-slate-500 break-all mt-1">{Array.from(new TextEncoder().encode(t.info)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}</div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[13px] text-slate-400">Toca una trama para verla entera, en texto y en hexadecimal. «Llegó por» es el último repetidor que la marcó con «*»; «directa» es que se oyó sin repetidor.</p>
          </Tarjeta>
        </div>

        <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Nivel de audio por estación" className="flex flex-col gap-1" id="dw-niveles">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h2 className="text-lg font-semibold text-slate-100">Nivel de audio recibido</h2>
              <span className="text-[13px] text-slate-400">franja buena: {franja.bajo} a {franja.alto}</span>
            </div>
            {datos.niveles.length === 0 ? (
              <p className="text-sm text-slate-400">{datos.registro.activado ? 'Sin tramas en el registro en la última hora.' : 'Hace falta el registro de Direwolf (LOGDIR).'}</p>
            ) : datos.niveles.map((n) => (
              <div key={n.estacion} className="flex items-center gap-3 py-1.5 border-t border-slate-800">
                <span className="basis-28 shrink-0 font-mono text-slate-100 truncate">{n.estacion}</span>
                <div role="img" aria-label={`Nivel ${n.nivel}, ${notaNivel(n.nivel, franja)}`} className="flex-1 relative h-3 bg-slate-950 border border-slate-800 rounded-md">
                  <span className="absolute top-0 bottom-0 bg-emerald-950" style={{ left: `${franja.bajo}%`, width: `${franja.alto - franja.bajo}%` }} />
                  <span className={`absolute left-0 top-[2px] bottom-[2px] rounded ${fondoNivel(n.nivel, franja)}`} style={{ width: `${Math.min(100, Math.max(2, n.nivel))}%` }} />
                </div>
                <span className={`w-8 text-right font-mono ${colorNivel(n.nivel, franja)}`}>{n.nivel}</span>
                <span className={`w-20 text-right text-[13px] ${colorNivel(n.nivel, franja)}`}>{notaNivel(n.nivel, franja)}</span>
              </div>
            ))}
            <p className="text-[13px] text-slate-400 mt-2">Es el nivel que anota Direwolf con cada trama, de la estación que se oye de verdad (el repetidor, si llega repetida). Si casi todas quedan fuera de la franja, hay que tocar el volumen del equipo o de la tarjeta.</p>
          </Tarjeta>

          <Tarjeta aria-label="Configuración de Direwolf" className="flex flex-col gap-3" id="dw-conf">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Configuración</h2>
              {conf && <span className="font-mono text-[13px] text-slate-400">{conf.ruta}</span>}
            </div>
            {!conf ? <p className="text-sm text-amber-300">No se encuentra direwolf.conf (ni en /etc ni junto a la consola).</p> : (
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Indicativo (MYCALL)', conf.indicativo], ['Módem', conf.modem], ['Tarjeta de sonido', conf.audio], ['PTT', conf.ptt],
                  ['Puerto KISS', conf.puertoKiss], ['Puerto AGW', conf.puertoAgw],
                  ['TXDELAY / TXTAIL', conf.txDelayMs !== null || conf.txTailMs !== null ? `${conf.txDelayMs ?? '—'} / ${conf.txTailMs ?? '—'} ms` : null],
                  ['Corrección (FIX_BITS)', conf.fixBits], ['Registro (LOGDIR)', conf.carpetaLog],
                ] as Array<[string, string | number | null]>).map(([k, v]) => (
                  <div key={k} className="min-w-0"><div className="text-xs text-slate-400">{k}</div><div className={`font-mono text-[15px] break-words ${v === null ? 'text-slate-500' : 'text-slate-100'}`}>{v === null ? 'de serie' : v}</div></div>
                ))}
              </div>
            )}
            {conf && conf.indicativo && datos.tramas.length >= 0 && conf.puertoKiss !== null && conf.puertoKiss !== kiss.puerto && (
              <p className="text-sm text-amber-300">Direwolf escucha KISS en el {conf.puertoKiss} y la consola se conecta al {kiss.puerto}.</p>
            )}
            {admin && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} aria-expanded={registro !== null} onClick={verRegistro}>{registro !== null ? 'Ocultar registro' : 'Ver registro'}</button>
                <button type="button" className={boton} id="dw-reiniciar" onClick={() => orden('reiniciar')}>Reiniciar servicio</button>
              </div>
            )}
            {registro !== null && <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[12px] font-mono text-slate-300 max-h-72 overflow-auto whitespace-pre-wrap" id="dw-registro">{registro}</pre>}
            <p className="text-[13px] text-slate-400">Para editar el archivo: Sistema → Configuración → «Archivos .conf Debian».</p>
          </Tarjeta>

          <Tarjeta aria-label="Prueba de emisión" className="flex flex-col gap-2" id="dw-prueba">
            <h2 className="text-lg font-semibold text-slate-100">Prueba de emisión</h2>
            <p className="text-sm text-slate-300">Emite la baliza de la estación por radio y comprueba si algún repetidor la devuelve.</p>
            <div className="flex flex-wrap items-center gap-3">
              {admin && <button type="button" className={botonPrincipal} disabled={!kiss.conectado} onClick={() => orden('prueba')}>Emitir baliza de prueba</button>}
              <span className={`text-sm font-semibold ${datos.propia ? 'text-emerald-400' : 'text-slate-400'}`} id="dw-propia">
                {datos.propia
                  ? `Última: repetida por ${datos.propia.por}${datos.propia.trasSegundos !== null ? ` a los ${datos.propia.trasSegundos} s` : ''} · ${haceCuanto(datos.propia.cuando, ahora)}`
                  : 'Ningún repetidor ha devuelto todavía una trama de la estación.'}
              </span>
            </div>
            {!datos.txEnabled && <p className="text-[13px] text-amber-300">La emisión está desactivada (SAT_APRS_TX): la baliza no sale al aire.</p>}
          </Tarjeta>
          {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{aviso.texto}</p>}
        </div>
      </div>
    </div>
  );
}
