// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · KiwiSDR: APRS de onda corta y propagación medida con las balizas NCDXF / IARU.
import React, { useEffect, useState } from 'react';
import { customFetch } from '../../utils/customFetch';

interface Medida { baliza: number; banda: number; cuando: number; dbm: number; sobreRuido: number; oida: boolean }
interface Estado {
  equipo: string; puerto: number; conClave: boolean; posicion: { lat: number; lon: number } | null;
  aprs: { activo: boolean; khz: number; banda: string; estado: string; motivo: string; tramas: number; ultima: number; nivel: number | null };
  ibp: {
    activo: boolean; estado: string; motivo: string; banda: number; ciclos: number; saturado: boolean;
    bandas: Array<{ khz: number; nombre: string }>; balizas: Array<{ indicativo: string; pais: string; lugar: string }>;
    ahora: number[]; cuadro: Array<Array<Medida | null>>; ruido: Array<{ dbm: number; cuando: number } | null>;
  };
}

const campo = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const hace = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
/** Color de una celda por lo que sobresale del ruido: nada, apenas, bien, fuerte. */
const fondo = (m: Medida | null) => (!m ? 'bg-slate-900 text-slate-600' : m.sobreRuido >= 20 ? 'bg-emerald-500 text-slate-950' : m.sobreRuido >= 12 ? 'bg-emerald-700 text-white' : m.oida ? 'bg-emerald-900 text-emerald-100' : 'bg-slate-800 text-slate-500');

export default function KiwiSdr() {
  const [e, setE] = useState<Estado | null>(null);
  const [v, setV] = useState({ equipo: '', puerto: '8073', clave: '', aprs: false, aprsKhz: '10147.6', aprsBanda: 'usb', ibp: false });
  const [cargado, setCargado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const leer = () => customFetch('/api/kiwi').then((r) => r.json()).then((j: Estado) => {
    setE(j);
    if (!cargado) { setV({ equipo: j.equipo, puerto: String(j.puerto), clave: '', aprs: j.aprs.activo, aprsKhz: String(j.aprs.khz), aprsBanda: j.aprs.banda, ibp: j.ibp.activo }); setCargado(true); }
  }).catch(() => { /* la consola no contesta: se queda lo que había */ });

  useEffect(() => { leer(); const t = setInterval(leer, 15000); return () => clearInterval(t); }, [cargado]);

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const cuerpo: any = { equipo: v.equipo.trim(), puerto: Number(v.puerto), aprs: v.aprs, aprsKhz: Number(v.aprsKhz.replace(',', '.')), aprsBanda: v.aprsBanda, ibp: v.ibp };
    if (v.clave !== '') cuerpo.clave = v.clave === '-' ? '' : v.clave;        // vacío: se deja la que hay; un guion la quita
    try {
      const r = await customFetch('/api/kiwi/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = await r.json();
      if (!r.ok) { setMsg({ ok: false, texto: `No se guardó: ${j.error ?? r.status}.` }); return; }
      setE(j); setV({ ...v, clave: '' }); setMsg({ ok: true, texto: 'Guardado.' });
    } catch { setMsg({ ok: false, texto: 'La consola no contesta.' }); }
  };

  const hayMedidas = !!e && e.ibp.cuadro.some((f) => f.some((c) => c));
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-4" aria-label="KiwiSDR">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">KiwiSDR: onda corta por la red</h3>
        <p className="text-sm text-slate-400">Un KiwiSDR recibe de 0 a 30 MHz. Con él la consola recibe APRS de onda corta (300 baudios) y mide qué balizas NCDXF / IARU llegan ahora. Solo recibe. Ocupa dos canales del KiwiSDR de continuo: con uno público, pida permiso a su dueño. No sirve para el APRS de VHF ni para las balizas de 433 MHz.</p>
      </div>

      <form className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" onSubmit={guardar}>
        <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">Nombre o dirección del KiwiSDR (vacío, sin él)
          <input className={`${campo} font-mono`} value={v.equipo} onChange={(x) => setV({ ...v, equipo: x.target.value })} placeholder="kiwisdr.local" id="input-kiwi-equipo" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Puerto
          <input className={`${campo} font-mono`} value={v.puerto} onChange={(x) => setV({ ...v, puerto: x.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" id="input-kiwi-puerto" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Contraseña {e?.conClave ? '(hay una; un guion la quita)' : '(si la pide)'}
          <input className={`${campo} font-mono`} type="password" value={v.clave} onChange={(x) => setV({ ...v, clave: x.target.value })} placeholder={e?.conClave ? 'sin cambios' : 'ninguna'} autoComplete="off" id="input-kiwi-clave" />
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-200 min-h-[44px]">
          <input type="checkbox" className="h-5 w-5" checked={v.aprs} onChange={(x) => setV({ ...v, aprs: x.target.checked })} id="check-kiwi-aprs" /> Recibir APRS de onda corta
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Frecuencia del dial (kHz)
          <input className={`${campo} font-mono`} value={v.aprsKhz} onChange={(x) => setV({ ...v, aprsKhz: x.target.value })} inputMode="decimal" id="input-kiwi-khz" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">Banda lateral
          <select className={campo} value={v.aprsBanda} onChange={(x) => setV({ ...v, aprsBanda: x.target.value })} id="select-kiwi-banda">
            <option value="usb">Superior (10 147,6 kHz en 30 m)</option>
            <option value="lsb">Inferior (14 105 kHz en 20 m)</option>
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-200 min-h-[44px]">
          <input type="checkbox" className="h-5 w-5" checked={v.ibp} onChange={(x) => setV({ ...v, ibp: x.target.checked })} id="check-kiwi-ibp" /> Medir las balizas NCDXF / IARU
        </label>
        <button type="submit" className="min-h-[44px] rounded-lg bg-sky-600 px-4 font-semibold text-white md:col-span-4" id="btn-kiwi-guardar">Guardar</button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-amber-400'}`} role="status">{msg.texto}</p>}

      {e && e.equipo && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm" id="kiwi-estado">
          <div className="rounded-xl border border-slate-700 p-3">
            <p className="font-semibold text-slate-100">APRS de onda corta</p>
            <p className={e.aprs.estado === 'recibiendo' ? 'text-emerald-400' : e.aprs.estado === 'apagado' ? 'text-slate-400' : 'text-amber-400'}>
              {e.aprs.estado === 'recibiendo' ? `Recibiendo en ${e.aprs.khz} kHz ${e.aprs.banda.toUpperCase()}` : e.aprs.estado === 'apagado' ? 'Apagado' : e.aprs.estado === 'conectando' ? 'Conectando…' : `Sin enlace: ${e.aprs.motivo}`}
            </p>
            {e.aprs.estado === 'recibiendo' && <p className="text-slate-400">{e.aprs.tramas} tramas{e.aprs.ultima ? `, la última ${hace(e.aprs.ultima)}` : ''}{e.aprs.nivel !== null ? ` · señal ${e.aprs.nivel} dBm` : ''}. Entran en Tramas y Estaciones como las de radio.</p>}
          </div>
          <div className="rounded-xl border border-slate-700 p-3">
            <p className="font-semibold text-slate-100">Balizas NCDXF / IARU</p>
            <p className={e.ibp.estado === 'midiendo' ? 'text-emerald-400' : e.ibp.estado === 'apagado' ? 'text-slate-400' : 'text-amber-400'}>
              {e.ibp.estado === 'midiendo' ? `Midiendo en ${e.ibp.bandas[e.ibp.banda].khz} kHz · ahora suena ${e.ibp.balizas[e.ibp.ahora[e.ibp.banda]].indicativo}` : e.ibp.estado === 'apagado' ? 'Apagado' : e.ibp.estado === 'conectando' ? 'Conectando…' : `Sin enlace: ${e.ibp.motivo}`}
            </p>
            {e.ibp.estado === 'midiendo' && <p className="text-slate-400">{e.ibp.ciclos} bandas medidas desde que arrancó; una vuelta a las cinco tarda 15 minutos.{e.ibp.saturado ? ' El KiwiSDR avisa de que su entrada está saturada.' : ''}</p>}
          </div>
          {e.posicion && <p className="text-slate-400 md:col-span-2">El KiwiSDR dice estar en {e.posicion.lat.toFixed(2)}, {e.posicion.lon.toFixed(2)}: lo que se mide es lo que llega allí, no a la consola.</p>}
        </div>
      )}

      {e && e.ibp.activo && (
        <div className="flex flex-col gap-2" id="kiwi-ibp">
          {!hayMedidas ? <p className="text-sm text-slate-400">Aún no hay medidas: la primera banda tarda entre tres y seis minutos.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-1">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 pr-2">Baliza</th>
                    {e.ibp.bandas.map((b) => <th key={b.khz} className="py-1 text-center font-mono">{b.khz}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {e.ibp.balizas.map((b, i) => (
                    <tr key={b.indicativo}>
                      <td className="pr-2 whitespace-nowrap"><span className="font-mono text-slate-100">{b.indicativo}</span> <span className="text-slate-400">{b.pais}</span></td>
                      {e.ibp.cuadro[i].map((c, f) => (
                        <td key={f} className={`rounded text-center font-mono ${fondo(c)}`} title={c ? `${c.dbm} dBm · ${hace(c.cuando)}` : 'sin medida reciente'}>
                          {c ? (c.oida ? `+${Math.round(c.sobreRuido)}` : '·') : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="text-slate-400">
                    <td className="pr-2">Ruido (dBm)</td>
                    {e.ibp.ruido.map((r, f) => <td key={f} className="text-center font-mono">{r ? Math.round(r.dbm) : '—'}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-400">Decibelios sobre el ruido de la banda en la ranura de diez segundos de cada baliza, en las dos últimas horas; un punto es una ranura medida sin señal (menos de 6 dB). La baliza se reconoce por la hora, no por su indicativo: otra señal en la frecuencia cuenta como si fuera ella, y el reloj del equipo debe ir en hora. Mide lo que llega ahora; VOACAP, arriba, da la mediana del mes.</p>
        </div>
      )}
    </section>
  );
}
