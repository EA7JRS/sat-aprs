// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · APRS LoRa+: los trackers APRS LoRa+ de la estación, enlazados por su
// TNC KISS sobre WiFi. Su estado (GET /api/status del tracker), lo que oyen por
// LoRa, las comprobaciones de su configuración que se ven desde fuera, dónde se
// pisan con la consola y la emisión de los avisos urgentes por la otra banda.
// Sin enlace no hay cifras: se dice, no se inventan.
import React, { useEffect, useState } from 'react';
import { Tarjeta } from '../components/shell/Etiquetas';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { haceCuanto } from '../utils/useAvisos';
import { Cifra, duracion } from '../components/radio/Piezas';

type Celda = 'si' | 'no' | 'respaldo' | 'desconocido';
interface EstadoTracker {
  indicativo: string; version: string; placa: string; modo: number; modoNombre: string; perfil: number; perfilLora: number;
  frecuencia: number | null; modulacion: string; sf: number | null; bw: number | null; cr: number | null; potencia: number | null;
  ruta: string; bateria: number | null; encendidoS: number; digi: boolean; smart: boolean; sos: boolean;
  kissTcp: boolean; kissClientes: number; kissBle: boolean;
}
interface Hallazgo { id: string; nivel: 'error' | 'aviso' | 'nota'; titulo: string; texto: string }
interface Tracker {
  id: string; equipo: string; puerto: number; enlace: 'apagado' | 'conectando' | 'conectado' | 'error'; motivo: string; desde: number;
  estado: EstadoTracker | null; estadoCuando: number; estadoDisponible: boolean | null; ultimaTrama: number; enviadas: number;
  cifras: { oidas: number; estaciones: number; propias: number; ocupacion: number };
  hallazgos: Hallazgo[];
}
interface Datos {
  ajustes: null | { equipos: string; intervalo: number; ruta: string; igate: boolean; respaldo: boolean; siempre: boolean; maxEquipos: number };
  trackers: Tracker[];
  pasadasAIs: number;
  conflictos: Array<{ id: string; nivel: 'aviso' | 'info'; texto: string }>;
  reparto: { filas: Array<{ funcion: string; consola: Celda; aprx: Celda; wx3in1: Celda }> };
  emision: { cuando: number; ok: boolean | null; texto: string; txActiva: boolean };
}

const boton = 'min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-default';
const campo = 'min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 font-mono text-sm';
const CELDA: Record<Celda, { texto: string; clase: string }> = {
  si: { texto: '✓', clase: 'text-emerald-400' },
  no: { texto: '—', clase: 'text-slate-500' },
  respaldo: { texto: 'respaldo', clase: 'text-sky-400' },
  desconocido: { texto: '?', clase: 'text-slate-400' },
};
const coma = (n: number, d: number) => n.toFixed(d).replace('.', ',');
const NIVEL: Record<Hallazgo['nivel'], { nombre: string; clase: string }> = {
  error: { nombre: 'Error', clase: 'text-red-400' },
  aviso: { nombre: 'Aviso', clase: 'text-amber-300' },
  nota: { nombre: 'Nota', clase: 'text-slate-400' },
};

function radioTexto(e: EstadoTracker): string {
  const f = e.frecuencia ? `${coma(e.frecuencia / 1e6, 3)} MHz` : '—';
  return e.sf && e.bw ? `${f} · SF${e.sf} · ${e.bw / 1000} kHz` : `${f}${e.modulacion ? ` · ${e.modulacion}` : ''}`;
}

function TarjetaTracker({ t, ahora, admin }: { t: Tracker; ahora: number; admin: boolean; key?: React.Key }) {
  const e = t.estado;
  const conectado = t.enlace === 'conectado';
  const errores = t.hallazgos.filter((h) => h.nivel === 'error').length;
  const avisos = t.hallazgos.filter((h) => h.nivel === 'aviso').length;
  const datos: Array<[string, string]> = e ? [
    ['Firmware', e.version || '—'], ['Modo', `${e.modoNombre} · perfil ${e.perfil + 1}`], ['Radio', radioTexto(e)],
    ['Batería', e.bateria !== null ? `${coma(e.bateria, 2)} V` : '—'], ['SmartBeacon', e.smart ? 'Sí' : 'No'], ['Digipetidor', e.digi ? 'Sí' : 'No'],
    ['Ruta', e.ruta || '—'], ['Encendido', duracion(ahora - e.encendidoS * 1000, ahora)], ['Última trama', t.ultimaTrama ? haceCuanto(t.ultimaTrama, ahora) : 'ninguna todavía'],
  ] : [];
  return (
    <Tarjeta className="flex-1 basis-[22rem] min-w-0 flex flex-col gap-2.5" id={`lora-${t.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold font-mono text-slate-100">{e?.indicativo || 'Tracker'}</h2>
        {admin && <span className="text-[13px] text-slate-400">{t.equipo}:{t.puerto}</span>}
        <span className={`ml-auto text-sm font-semibold ${conectado ? 'text-emerald-400' : t.enlace === 'conectando' ? 'text-slate-400' : 'text-red-400'}`}>
          ● {conectado ? 'Enlazado por KISS' : t.enlace === 'conectando' ? 'Conectando…' : 'Sin conexión'}
        </span>
      </div>
      {!conectado && <p className="text-[13px] text-slate-400">{t.motivo ? `${t.motivo} · ` : ''}{t.desde ? `desde hace ${duracion(t.desde, ahora)} · ` : ''}reintenta cada 20 s</p>}
      {e ? (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
          {datos.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-slate-400">{k}</dt><dd className="text-sm text-slate-100 break-words">{v}</dd></div>)}
        </dl>
      ) : (
        <p className="text-sm text-slate-400">
          {t.estadoDisponible === false ? 'El tracker no da su estado por HTTP (/api/status): hace falta un firmware posterior a la 5.4.7 con «KISS over WiFi» activado. Las tramas sí se reciben por KISS.' : 'Leyendo su estado…'}
        </p>
      )}
      {e && t.estadoCuando > 0 && ahora - t.estadoCuando > 180_000 && <p className="text-[13px] text-amber-300">Estado de hace {duracion(t.estadoCuando, ahora)}: el tracker no responde ahora.</p>}
      {e && (
        <div className="border-t border-slate-800 pt-2.5 flex flex-col gap-1.5">
          <p className={`text-[13px] font-semibold ${errores ? 'text-red-400' : avisos ? 'text-amber-300' : 'text-emerald-400'}`}>
            {errores || avisos ? `Comprobación: ${errores} error${errores === 1 ? '' : 'es'} · ${avisos} aviso${avisos === 1 ? '' : 's'}` : 'Comprobación: sin errores ni avisos'}
          </p>
          {t.hallazgos.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm text-slate-300">
              {t.hallazgos.map((h) => <li key={h.id}><span className={`font-semibold ${NIVEL[h.nivel].clase}`}>{NIVEL[h.nivel].nombre}</span> · {h.titulo}. <span className="text-slate-400">{h.texto}</span></li>)}
            </ul>
          )}
          <p className="text-[13px] text-slate-400">Se comprueba lo que se ve desde fuera. La comprobación completa, con las correcciones, está en la WebUI del tracker (Config check).</p>
        </div>
      )}
    </Tarjeta>
  );
}

export default function LoraPlus() {
  const admin = useAdminSession().admin;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [ajustes, setAjustes] = useState<null | { equipos: string; intervalo: string; ruta: string }>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/radio/lora').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setDatos(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta]);

  const enviar = async (url: string, cuerpo: unknown, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return null;
    setAviso({ ok: true, texto: 'Un momento…' });
    try {
      const r = await customFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = await r.json().catch(() => ({}));
      setAviso(r.ok ? { ok: true, texto: j.texto || 'Hecho.' } : { ok: false, texto: j.error || `La consola respondió ${r.status}.` });
      setVuelta((v) => v + 1);
      return r.ok ? j : null;
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); return null; }
  };

  if (!datos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · APRS LoRa+</h1>
        <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p>
      </div>
    );
  }

  const { trackers, conflictos, reparto, emision } = datos;
  const a = datos.ajustes;
  const enlazados = trackers.filter((t) => t.enlace === 'conectado');
  const suma = (k: 'oidas' | 'propias') => trackers.reduce((s, t) => s + t.cifras[k], 0);
  const ocupacion = trackers.length ? Math.max(...trackers.map((t) => t.cifras.ocupacion)) : 0;
  const enviadas = trackers.reduce((s, t) => s + t.enviadas, 0);
  const hay = enlazados.length > 0;
  const emiteLora = !!a && (a.respaldo || a.siempre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold text-slate-100">Radio · APRS LoRa+</h1>
        <span className="text-[13px] text-slate-400">{trackers.length ? `${trackers.length} tracker${trackers.length === 1 ? '' : 's'} · KISS por WiFi` : 'Trackers APRS LoRa+ por KISS sobre WiFi'}</span>
      </div>

      {trackers.length === 0 && (
        <p className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm" id="lora-sin-equipos">
          <b>Sin trackers configurados.</b> En la WebUI del tracker active «KISS over WiFi» (Connectivity) y ponga su WiFi (Administration › Firmware update). Después escriba aquí su dirección en «Ajustes» (administrador).
        </p>
      )}

      {trackers.length > 0 && <section aria-label="Trackers" className="flex flex-wrap gap-3">{trackers.map((t) => <TarjetaTracker key={t.id} t={t} ahora={ahora} admin={admin} />)}</section>}

      <section aria-label="Cifras de la última hora" className="flex flex-wrap gap-3">
        <Cifra id="lora-oidas" titulo="Oídas por LoRa · última hora" valor={hay || suma('oidas') ? String(suma('oidas')) : '—'} detalle={trackers.length === 1 ? `${trackers[0].cifras.estaciones} estaciones distintas` : 'entre todos los trackers'} color="text-sky-400" />
        <Cifra titulo="Emitidas por los trackers" valor={hay || suma('propias') ? String(suma('propias')) : '—'} detalle={`sus balizas${enviadas ? ` · ${enviadas} de la consola desde el arranque` : ''}`} />
        <Cifra titulo="Pasadas a APRS-IS" valor={a?.igate || datos.pasadasAIs ? String(datos.pasadasAIs) : '—'} detalle={a ? (a.igate ? 'por esta consola' : 'paso a APRS-IS desactivado') : 'última hora'} />
        <Cifra titulo="Ocupación del canal" valor={hay ? `${coma(ocupacion, 1)} %` : '—'} detalle="estimada por el tiempo en el aire de lo oído" color={ocupacion >= 10 ? 'text-amber-300' : 'text-slate-100'} />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div className="xl:col-span-3 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Reparto de funciones" className="flex flex-col gap-2.5" id="lora-reparto">
            <h2 className="text-lg font-semibold text-slate-100">Reparto de funciones</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    <th scope="col" className="text-left font-medium py-1.5 pr-2">Función</th>
                    <th scope="col" className="font-medium px-2">Consola + Direwolf<br /><span className="font-normal">VHF</span></th>
                    <th scope="col" className="font-medium px-2">aprx<br /><span className="font-normal">VHF</span></th>
                    <th scope="col" className="font-medium px-2">WX3in1<br /><span className="font-normal">VHF</span></th>
                    <th scope="col" className="font-medium px-2">APRS LoRa+<br /><span className="font-normal">LoRa 70 cm</span></th>
                  </tr>
                </thead>
                <tbody>
                  {reparto.filas.map((f, i) => {
                    const estados = trackers.map((t) => t.estado).filter((x): x is EstadoTracker => !!x);
                    const lora: Celda = i === 0 ? (estados.length ? (estados.some((e) => e.digi) ? 'si' : 'no') : 'desconocido')
                      : i === 1 ? (a ? (a.igate ? 'si' : 'no') : 'desconocido')
                      : i === 3 ? (estados.length ? 'si' : 'desconocido')
                      : i === 5 ? (a ? (a.siempre ? 'si' : a.respaldo ? 'respaldo' : 'no') : 'desconocido')
                      : 'no';
                    return (
                      <tr key={f.funcion} className="border-t border-slate-800">
                        <td className="py-2 pr-2 text-slate-100">{f.funcion}</td>
                        {([f.consola, f.aprx, f.wx3in1, lora] as Celda[]).map((c, k) => <td key={k} className={`py-2 px-2 text-center font-semibold ${CELDA[c].clase}`}>{CELDA[c].texto}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-slate-400">Los trackers trabajan en otra banda (433,775 MHz): su digipetidor no choca con los de VHF. El paso a APRS-IS de lo que oyen lo hace esta consola.</p>
            {conflictos.map((c) => (
              <p key={c.id} role={c.nivel === 'aviso' ? 'alert' : undefined} className={c.nivel === 'aviso' ? 'border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm' : 'text-sm text-slate-400'}>{c.texto}</p>
            ))}
          </Tarjeta>
        </div>

        <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
          <Tarjeta aria-label="Avisos urgentes por LoRa" className="flex flex-col gap-2.5" id="lora-emision">
            <h2 className="text-lg font-semibold text-slate-100">Avisos urgentes por LoRa</h2>
            <p className="text-sm text-slate-300">Los avisos urgentes pueden salir también por 433,775 MHz con el primer tracker enlazado en modo APRS LoRa, con la ruta {a?.ruta ?? 'WIDE1-1'}. Un aviso tarda unos 3 s en el aire a SF12.</p>
            {a && (
              <>
                <label className="flex items-start gap-2.5 min-h-[44px] text-sm text-slate-100">
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-sky-500 shrink-0" checked={a.respaldo} disabled={!admin} onChange={(e) => enviar('/api/radio/lora/config', { respaldo: e.target.checked })} />
                  <span>Si no sale por VHF, emitir por LoRa<br /><span className="text-[13px] text-slate-400">Cuando Direwolf no acepta un aviso urgente.</span></span>
                </label>
                <label className="flex items-start gap-2.5 min-h-[44px] text-sm text-slate-100">
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-sky-500 shrink-0" checked={a.siempre} disabled={!admin} onChange={(e) => enviar('/api/radio/lora/config', { siempre: e.target.checked })} />
                  <span>Emitir siempre por las dos bandas<br /><span className="text-[13px] text-slate-400">Cada aviso urgente sale por VHF y por LoRa.</span></span>
                </label>
                <label className="flex items-start gap-2.5 min-h-[44px] text-sm text-slate-100">
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-sky-500 shrink-0" checked={a.igate} disabled={!admin} onChange={(e) => enviar('/api/radio/lora/config', { igate: e.target.checked })} />
                  <span>Pasar a APRS-IS lo que oyen los trackers<br /><span className="text-[13px] text-slate-400">Como iGate de solo recepción, por el servidor APRS-IS de la estación.</span></span>
                </label>
              </>
            )}
            {!emision.txActiva && <p className="text-[13px] text-amber-300">La emisión de la consola está desactivada (SAT_APRS_TX): no sale nada al aire.</p>}
            {admin && (
              <button type="button" className={`${boton} self-start`} disabled={!hay || !emision.txActiva}
                onClick={() => enviar('/api/radio/lora/orden', { accion: 'probar' }, 'Se emite por LoRa un estado de prueba con el indicativo de la estación. ¿Seguir?')}>Probar la emisión por LoRa</button>
            )}
            {emision.cuando > 0 && <p className={`text-[13px] ${emision.ok ? 'text-slate-400' : 'text-amber-300'}`}>{haceCuanto(emision.cuando, ahora)}: {emision.texto}</p>}
            {a && emiteLora && !hay && <p className="text-[13px] text-amber-300">Ahora no hay ningún tracker enlazado: los avisos no saldrían por LoRa.</p>}
          </Tarjeta>

          {a && (
            <Tarjeta aria-label="Ajustes" className="flex flex-col gap-2.5" id="lora-ajustes">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-100">Ajustes</h2>
                {admin && !ajustes && <button type="button" className={boton} onClick={() => setAjustes({ equipos: a.equipos, intervalo: String(a.intervalo), ruta: a.ruta })}>Cambiar</button>}
              </div>
              {!ajustes ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {([['Trackers', a.equipos || '—'], ['Estado', `cada ${a.intervalo} s`], ['Ruta al emitir', a.ruta]] as Array<[string, string]>)
                    .map(([k, v]) => <div key={k} className="min-w-0"><div className="text-xs text-slate-400">{k}</div><div className="font-mono text-slate-100 break-words">{v}</div></div>)}
                </div>
              ) : (
                <form className="flex flex-col gap-2.5" onSubmit={async (e) => {
                  e.preventDefault();
                  if (await enviar('/api/radio/lora/config', { equipos: ajustes.equipos, intervalo: Number(ajustes.intervalo), ruta: ajustes.ruta })) { setAjustes(null); setAviso({ ok: true, texto: 'Ajustes guardados.' }); }
                }}>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">Dirección de los trackers (hasta {a.maxEquipos}, separados por comas)
                    <input className={campo} value={ajustes.equipos} onChange={(e) => setAjustes({ ...ajustes, equipos: e.target.value })} placeholder="192.168.1.60, aprs-lora-plus.local" autoCapitalize="none" autoCorrect="off" />
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="flex flex-col gap-1 text-xs text-slate-400">Leer el estado cada (s)<input className={campo} inputMode="numeric" value={ajustes.intervalo} onChange={(e) => setAjustes({ ...ajustes, intervalo: e.target.value })} /></label>
                    <label className="flex flex-col gap-1 text-xs text-slate-400">Ruta al emitir<input className={campo} value={ajustes.ruta} onChange={(e) => setAjustes({ ...ajustes, ruta: e.target.value.toUpperCase() })} placeholder="WIDE1-1" /></label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={boton}>Guardar</button>
                    <button type="button" className={boton} onClick={() => setAjustes(null)}>Cancelar</button>
                  </div>
                </form>
              )}
              {admin && !ajustes && trackers.length > 0 && <button type="button" className={`${boton} self-start`} onClick={() => enviar('/api/radio/lora/orden', { accion: 'reconectar' })}>Volver a conectar</button>}
              <p className="text-[13px] text-slate-400">El puerto KISS es el 8001 salvo que se escriba «dirección:puerto». El tracker admite 3 clientes KISS a la vez y no pide contraseña: en su WebUI, limite «Allowed addresses» a esta máquina.</p>
            </Tarjeta>
          )}
          {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{aviso.texto}</p>}
        </div>
      </div>
    </div>
  );
}
