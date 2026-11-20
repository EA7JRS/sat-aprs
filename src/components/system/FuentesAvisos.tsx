// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sistema · Configuración · Claves API: más fuentes de avisos sin clave.
//  · MeteoAlarm (avisos oficiales europeos) por zonas;
//  · ciclones tropicales del NHC;
//  · radiactividad ambiental de EURDEP;
//  · avisos del NWS de EE. UU. (tornados…) y sucesos de NASA EONET.
// Vienen apagadas. Las reglas de cada una (nivel, radio, repetición) se
// cambian también desde el aviso, en Avisos.
import React, { useEffect, useState } from 'react';
import { TelemetryConfig } from '../../types';
import { customFetch } from '../../utils/customFetch';
import { useAdminSession } from '../../utils/session';

interface Zona { codigo: string; nombre: string; pais: string; visto: number }
interface SondaCerca { id: string; nombre: string; valor: number; cuando: number; distanciaKm: number; validada: boolean }

const campo = 'min-h-[40px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const boton = 'min-h-[40px] px-4 rounded-lg border border-sky-500 bg-sky-900 text-slate-50 text-sm font-semibold cursor-pointer hover:bg-sky-800 disabled:opacity-50';
const rotulo = 'flex flex-col gap-1 text-[12px] text-slate-300';
const hora = (t: number) => new Date(t).toISOString().slice(11, 16) + ' UTC';

export default function FuentesAvisos({ config }: { config: TelemetryConfig }) {
  const { isAdmin } = useAdminSession();
  const [v, setV] = useState(() => ({
    meteoalarmEnabled: config.meteoalarmEnabled === true,
    meteoalarmPaises: config.meteoalarmPaises ?? 'portugal',
    meteoalarmZonas: config.meteoalarmZonas ?? '',
    ciclonesEnabled: config.ciclonesEnabled === true,
    ciclonesRadioKm: String(config.ciclonesRadioKm ?? 1000),
    radiacionEnabled: config.radiacionEnabled === true,
    radiacionPaises: config.radiacionPaises ?? 'ES,PT',
    radiacionRadioKm: String(config.radiacionRadioKm ?? 100),
    radiacionUmbral: String(config.radiacionUmbral ?? 0.3),
    nwsEnabled: config.nwsEnabled === true,
    eonetEnabled: config.eonetEnabled === true,
    eonetCategorias: config.eonetCategorias ?? 'floods,severeStorms,volcanoes',
    eonetRadioKm: String(config.eonetRadioKm ?? 300),
    effisPeligroEnabled: config.effisPeligroEnabled === true,
    effisAreasEnabled: config.effisAreasEnabled === true,
    effisAreasRadioKm: String(config.effisAreasRadioKm ?? 100),
  }));
  const [peligro, setPeligro] = useState<Array<{ dia: string; fwi: number | null; clase: string | null }>>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [sondas, setSondas] = useState<SondaCerca[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pon = (k: keyof typeof v, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));

  const leer = () => {
    customFetch('/api/fuentes/meteoalarm/zonas').then((r) => r.ok ? r.json() : null).then((j) => { if (j) setZonas(j.zonas); }).catch(() => undefined);
    customFetch('/api/fuentes/peligro-incendio').then((r) => r.ok ? r.json() : null).then((j) => { if (j) setPeligro(j.dias); }).catch(() => undefined);
    customFetch('/api/fuentes/radiacion').then((r) => r.ok ? r.json() : null).then((j) => { if (j) setSondas(j.sondas.slice(0, 5)); }).catch(() => undefined);
  };
  useEffect(() => { leer(); const t = setInterval(leer, 60_000); return () => clearInterval(t); }, []);

  const seguidas = v.meteoalarmZonas.split(/[,;\n]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const anadirZona = (codigo: string) => { if (!seguidas.includes(codigo)) pon('meteoalarmZonas', [...v.meteoalarmZonas.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean), codigo].join(', ')); };

  const guardar = async () => {
    const n = (s: string) => Number(String(s).replace(',', '.'));
    if (![n(v.ciclonesRadioKm), n(v.radiacionRadioKm), n(v.radiacionUmbral), n(v.eonetRadioKm), n(v.effisAreasRadioKm)].every(Number.isFinite)) { setMsg({ ok: false, texto: 'El radio y el umbral tienen que ser números.' }); return; }
    setOcupado(true);
    try {
      const r = await customFetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...v, ciclonesRadioKm: n(v.ciclonesRadioKm), radiacionRadioKm: n(v.radiacionRadioKm), radiacionUmbral: n(v.radiacionUmbral), eonetRadioKm: n(v.eonetRadioKm), effisAreasRadioKm: n(v.effisAreasRadioKm),
      }) });
      setMsg(r.ok ? { ok: true, texto: 'Guardado. Las fuentes encendidas se consultan ahora; el resultado sale en Avisos.' } : { ok: false, texto: 'No se pudo guardar.' });
      if (r.ok) setTimeout(leer, 8000);
    } catch { setMsg({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setOcupado(false);
  };

  const casilla = (id: string, k: 'meteoalarmEnabled' | 'ciclonesEnabled' | 'radiacionEnabled' | 'nwsEnabled' | 'eonetEnabled' | 'effisPeligroEnabled' | 'effisAreasEnabled', titulo: string, detalle: string) => (
    <label className="flex items-start gap-2.5 text-slate-100 text-[13px] cursor-pointer" htmlFor={id}>
      <input type="checkbox" id={id} checked={v[k]} disabled={!isAdmin} onChange={(e) => pon(k, e.target.checked)} className="mt-0.5 w-4 h-4" />
      <span><span className="font-semibold">{titulo}</span> <span className="text-slate-400">{detalle}</span></span>
    </label>
  );

  return (
    <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4" id="fuentes-avisos" aria-label="Más fuentes de avisos">
      <div>
        <h3 className="text-[15px] font-semibold text-slate-100">Más fuentes de avisos (sin clave)</h3>
        <p className="text-[12px] text-slate-400">Vienen apagadas. Lo que encuentren entra en Avisos con sus reglas; nada se emite si la emisión está desactivada.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
        {casilla('check-meteoalarm', 'meteoalarmEnabled', 'MeteoAlarm', '(avisos oficiales de los servicios meteorológicos europeos, por zonas)')}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className={rotulo}>Países (nombre del feed)
            <input className={campo} value={v.meteoalarmPaises} disabled={!isAdmin} onChange={(e) => pon('meteoalarmPaises', e.target.value)} placeholder="portugal, france" id="input-meteoalarm-paises" />
          </label>
          <label className={`${rotulo} md:col-span-2`}>Zonas que se siguen (código EMMA_ID o parte del nombre)
            <input className={campo} value={v.meteoalarmZonas} disabled={!isAdmin} onChange={(e) => pon('meteoalarmZonas', e.target.value)} placeholder="PT014, Algarve" id="input-meteoalarm-zonas" />
          </label>
        </div>
        {zonas.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-slate-400">Zonas vistas en los feeds (con aviso alguna vez); toque una para seguirla:</span>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-auto" id="meteoalarm-zonas-vistas">
              {zonas.map((z) => (
                <button key={z.codigo} type="button" disabled={!isAdmin} onClick={() => anadirZona(z.codigo)}
                  className={`min-h-[32px] px-2.5 rounded-full border text-[12px] cursor-pointer ${seguidas.includes(z.codigo) ? 'border-sky-500 bg-sky-950 text-slate-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                  <span className="font-mono">{z.codigo}</span> {z.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-[12px] text-slate-400">
          El feed no trae el contorno de las zonas: la estación avisa de las que se indiquen aquí. El código de cada zona aparece en la dirección de <a className="text-sky-400 hover:text-sky-300" href="https://meteoalarm.org" target="_blank" rel="noopener noreferrer">meteoalarm.org</a> al tocarla en el mapa (<span className="font-mono">geocode=EMMA_ID:PT014</span>).
          Con los avisos de AEMET activados, las zonas de España se toman de AEMET y no se repiten. Datos de EUMETNET/MeteoAlarm (CC BY 4.0).
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
        {casilla('check-ciclones', 'ciclonesEnabled', 'Ciclones tropicales (NHC)', '(Atlántico y Pacífico oriental: huracanes, tormentas y depresiones tropicales)')}
        <label className={`${rotulo} md:w-48`}>Radio (km)
          <input className={campo} inputMode="numeric" value={v.ciclonesRadioKm} disabled={!isAdmin} onChange={(e) => pon('ciclonesRadioKm', e.target.value)} id="input-ciclones-radio" />
        </label>
        <p className="text-[12px] text-slate-400">Del último aviso del Centro Nacional de Huracanes de EE. UU.: posición, intensidad y movimiento. Se avisa de los que estén a menos de este radio de la estación.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
        {casilla('check-radiacion', 'radiacionEnabled', 'Radiactividad ambiental (EURDEP)', '(tasa de dosis gamma de las sondas europeas, entre ellas la REA del CSN)')}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className={rotulo}>Países (código de dos letras)
            <input className={campo} value={v.radiacionPaises} disabled={!isAdmin} onChange={(e) => pon('radiacionPaises', e.target.value)} placeholder="ES, PT" id="input-radiacion-paises" />
          </label>
          <label className={rotulo}>Radio (km)
            <input className={campo} inputMode="numeric" value={v.radiacionRadioKm} disabled={!isAdmin} onChange={(e) => pon('radiacionRadioKm', e.target.value)} id="input-radiacion-radio" />
          </label>
          <label className={rotulo}>Umbral (µSv/h)
            <input className={campo} inputMode="decimal" value={v.radiacionUmbral} disabled={!isAdmin} onChange={(e) => pon('radiacionUmbral', e.target.value)} id="input-radiacion-umbral" />
          </label>
        </div>
        {sondas.length > 0 && (
          <table className="w-full text-[12px]" id="radiacion-sondas">
            <thead><tr className="text-left text-slate-400"><th className="font-normal pr-3">Sonda más cercana</th><th className="font-normal pr-3">µSv/h</th><th className="font-normal pr-3">A</th><th className="font-normal">Medida</th></tr></thead>
            <tbody>
              {sondas.map((s) => (
                <tr key={s.id} className="border-t border-slate-800">
                  <td className="py-1 pr-3 text-slate-100">{s.nombre} <span className="font-mono text-slate-500">{s.id}</span></td>
                  <td className="py-1 pr-3 font-mono text-slate-100">{s.valor.toFixed(3)}</td>
                  <td className="py-1 pr-3 text-slate-300">{s.distanciaKm} km</td>
                  <td className="py-1 text-slate-400">{hora(s.cuando)}{s.validada ? '' : ' · sin validar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[12px] text-slate-400">
          Datos abiertos de EURDEP que publica la BfS alemana; son medidas sin validar. Avisa desde el umbral (amarillo), desde tres veces el umbral (naranja) y desde diez veces (rojo). Antes de difundir más allá de la estación, revise las condiciones de uso de EURDEP.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
        {casilla('check-effis-peligro', 'effisPeligroEnabled', 'Peligro de incendio (EFFIS)', '(índice FWI oficial de Copernicus en la estación, hoy y los dos días siguientes)')}
        {peligro.length > 0 && (
          <p className="text-[13px] text-slate-200" id="effis-peligro-dias">
            {peligro.map((d) => `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${d.fwi === null ? 'sin datos' : `FWI ${d.fwi.toFixed(1)}, ${d.clase}`}`).join(' · ')}
          </p>
        )}
        {casilla('check-effis-areas', 'effisAreasEnabled', 'Áreas quemadas (EFFIS)', '(perímetros cartografiados por satélite casi en tiempo real)')}
        <label className={`${rotulo} md:w-48`}>Radio (km)
          <input className={campo} inputMode="numeric" value={v.effisAreasRadioKm} disabled={!isAdmin} onChange={(e) => pon('effisAreasRadioKm', e.target.value)} id="input-effis-radio" />
        </label>
        <p className="text-[12px] text-slate-400">Avisa con peligro alto (amarillo), muy alto (naranja) y extremo (rojo); de serie se difunde desde naranja. Las áreas quemadas: amarillo, naranja desde 500 ha y rojo desde 5000 ha. Datos de EFFIS, Copernicus EMS (CC BY 4.0).</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
        {casilla('check-nws', 'nwsEnabled', 'NWS de EE. UU.', '(tornados, tormentas severas, huracanes, inundaciones: avisos en vigor para el punto de la estación)')}
        <p className="text-[12px] text-slate-400">Solo cubre Estados Unidos y sus territorios: con la estación en otro país no devuelve nada, y Avisos lo dice. Es la fuente de tornados de la app Android. De serie se difunde desde naranja.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
        {casilla('check-eonet', 'eonetEnabled', 'NASA EONET', '(sucesos naturales abiertos en todo el mundo, con su última posición)')}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorías de EONET">
            {([['floods', 'Inundaciones'], ['severeStorms', 'Tormentas severas'], ['volcanoes', 'Volcanes'], ['landslides', 'Deslizamientos'], ['wildfires', 'Incendios']] as const).map(([id, nombre]) => {
              const lista = v.eonetCategorias.split(',').filter(Boolean);
              const puesta = lista.includes(id);
              return (
                <button key={id} type="button" disabled={!isAdmin} aria-pressed={puesta}
                  onClick={() => pon('eonetCategorias', (puesta ? lista.filter((c) => c !== id) : [...lista, id]).join(','))}
                  className={`min-h-[32px] px-2.5 rounded-full border text-[12px] cursor-pointer ${puesta ? 'border-sky-500 bg-sky-950 text-slate-100' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{nombre}</button>
              );
            })}
          </div>
          <label className={`${rotulo} w-32`}>Radio (km)
            <input className={campo} inputMode="numeric" value={v.eonetRadioKm} disabled={!isAdmin} onChange={(e) => pon('eonetRadioKm', e.target.value)} id="input-eonet-radio" />
          </label>
        </div>
        <p className="text-[12px] text-slate-400">EONET no da gravedad: todo entra en amarillo y el radio decide. Los incendios ya llegan de FIRMS con más detalle.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
        <button type="button" className={boton} onClick={guardar} disabled={!isAdmin || ocupado} id="fuentes-guardar">Guardar fuentes</button>
        {!isAdmin && <span className="text-[12px] text-slate-400">Con la sesión de administrador se encienden y se ajustan.</span>}
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{msg.texto}</span>}
      </div>
    </section>
  );
}
