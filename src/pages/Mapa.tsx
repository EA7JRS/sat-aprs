// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Mapa de la estación: un mapa base y, encima, capas con todo lo que llega
// con coordenadas. Es solo para verlo: nada se retransmite por estar aquí.
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Pantalla } from '../navigation';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';
import { TelemetryConfig } from '../types';
import { vigenciaLegible, tituloAviso, haceCuanto } from '../utils/useAvisos';

interface AvisoMapa {
  id: string; tipo: string; gravedad: 'info' | 'amarillo' | 'naranja' | 'rojo'; titulo: string; detalle: string; fuente: string;
  inicio: number; fin: number; lat: number; lon: number; cumple: boolean; zona: Array<[number, number]> | null;
}
interface Incidencia { id: string; tipo: string; carretera: string; poblacion: string; provincia: string; nivel: string; descripcion: string; lat: number; lon: number }
interface EstacionAprs { nombre: string; origen: string; clase: 'estacion' | 'objeto' | 'item'; lat: number; lon: number; simbolo: string; comentario: string; via: 'RF' | 'IS'; ultima: number }
interface BarcoMapa { mmsi: number; nombre: string; clase: string; indicativo: string; destino: string; lat: number; lon: number; sog: number | null; rumbo: number | null; ultima: number }
interface AvionMapa { hex: string; vuelo: string; lat: number; lon: number; altitud: number | null; velocidad: number | null; rumbo: number | null; squawk: string; emergencia: string; enTierra: boolean; ultima: number }
interface EstadoEntradas {
  ais: { activo: boolean; udpPuerto: number; udpEscuchando: boolean; udpError: string; tcp: { estado: string; destino: string; detalle: string }; sentencias: number; barcos: number };
  adsb: { activo: boolean; estado: string; destino: string; detalle: string; mensajes: number; aeronaves: number };
}
interface DatosMapa {
  estacion: { lat: number; lon: number; indicativo: string; gps: boolean; radioSismosKm: number; radioMeteoKm: number };
  avisos: AvisoMapa[];
  aprs: EstacionAprs[];
  ais: BarcoMapa[];
  adsb: AvionMapa[];
  trafico: Incidencia[];
  traficoReal: boolean;
}

type IdCapa = 'estacion' | 'avisos' | 'aprs' | 'ais' | 'adsb' | 'trafico';

const COLOR_NIVEL: Record<string, string> = { rojo: '#f87171', naranja: '#fb923c', amarillo: '#fde047', info: '#94a3b8' };
const COLOR_TRAFICO: Record<string, string> = { NEGRO: '#0f172a', ROJO: '#f87171', AMARILLO: '#fde047', VERDE: '#4ade80' };

/** Flecha orientada al rumbo (solo números y colores fijos en el HTML); sin rumbo, un punto. */
function flecha(color: string, rumbo: number | null, lado: number): L.DivIcon {
  const forma = rumbo === null
    ? `<circle cx="12" cy="12" r="6" fill="${color}" stroke="#0f172a" stroke-width="2"/>`
    : `<path d="M12 2 19 21 12 16.5 5 21Z" fill="${color}" stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round" transform="rotate(${Math.round(rumbo)} 12 12)"/>`;
  return L.divIcon({ className: '', iconSize: [lado, lado], iconAnchor: [lado / 2, lado / 2], html: `<svg viewBox="0 0 24 24" width="${lado}" height="${lado}" aria-hidden="true">${forma}</svg>` });
}

/** Contenido de un globo hecho con nodos de texto: los datos vienen de fuera y no se interpretan como HTML. */
function globo(titulo: string, lineas: string[]): HTMLElement {
  const caja = document.createElement('div');
  const h = document.createElement('strong');
  h.textContent = titulo;
  caja.appendChild(h);
  for (const linea of lineas.filter(Boolean)) {
    const p = document.createElement('div');
    p.textContent = linea;
    caja.appendChild(p);
  }
  return caja;
}

const campo = 'min-h-[40px] w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 text-slate-100 text-sm';

/** Estado y ajuste de las entradas AIS y ADS-B. */
function Entradas({ config, onGuardar }: { config: TelemetryConfig; onGuardar: (c: Partial<TelemetryConfig>) => Promise<boolean> }) {
  const session = useAdminSession();
  const [estado, setEstado] = useState<EstadoEntradas | null>(null);
  const [v, setV] = useState({
    aisEnabled: config.aisEnabled !== false, aisUdpPort: String(config.aisUdpPort ?? 10110), aisTcpHost: config.aisTcpHost ?? '', aisTcpPort: String(config.aisTcpPort || ''),
    adsbEnabled: config.adsbEnabled !== false, adsbHost: config.adsbHost ?? '127.0.0.1', adsbPort: String(config.adsbPort ?? 30003),
  });
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/enlaces').then((r) => r.json()).then((j) => { if (vivo) setEstado(j); }).catch(() => {});
    leer();
    const t = setInterval(leer, 10000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const guardar = async () => {
    setMensaje('Guardando…');
    const ok = await onGuardar({
      aisEnabled: v.aisEnabled, aisUdpPort: Number(v.aisUdpPort) || 0, aisTcpHost: v.aisTcpHost.trim(), aisTcpPort: Number(v.aisTcpPort) || 0,
      adsbEnabled: v.adsbEnabled, adsbHost: v.adsbHost.trim(), adsbPort: Number(v.adsbPort) || 0,
    });
    setMensaje(ok ? 'Guardado.' : 'No se pudo guardar.');
  };

  const ais = estado?.ais;
  const adsb = estado?.adsb;
  const textoAis = !ais ? '…' : !ais.activo ? 'Apagada'
    : ais.udpError ? `Error en el puerto UDP ${ais.udpPuerto}: ${ais.udpError}`
    : `${ais.udpEscuchando ? `Escuchando en UDP ${ais.udpPuerto}` : 'Sin puerto UDP'}${ais.tcp.destino ? ` · TCP ${ais.tcp.destino}: ${ais.tcp.estado}` : ''} · ${ais.sentencias} sentencias, ${ais.barcos} barcos`;
  const textoAdsb = !adsb ? '…' : !adsb.activo ? 'Apagada'
    : `${adsb.destino || 'Sin servidor'}: ${adsb.estado}${adsb.estado === 'desconectado' && adsb.detalle ? ` (${adsb.detalle})` : ''} · ${adsb.mensajes} mensajes, ${adsb.aeronaves} aeronaves`;

  const texto = (clave: 'aisUdpPort' | 'aisTcpHost' | 'aisTcpPort' | 'adsbHost' | 'adsbPort', rotulo: string, numerico = false) => (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {rotulo}
      <input className={campo} inputMode={numerico ? 'numeric' : 'text'} value={v[clave]} onChange={(e) => setV((x) => ({ ...x, [clave]: e.target.value }))} />
    </label>
  );

  return (
    <details className="bg-slate-900 border border-slate-800 rounded-xl" id="mapa-entradas">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-100 min-h-[44px]">
        Entradas AIS y ADS-B <span className="font-normal text-slate-400">· {ais?.barcos ?? 0} barcos, {adsb?.aeronaves ?? 0} aeronaves</span>
      </summary>
      <div className="px-4 pb-4 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2 text-slate-100 font-semibold">
            <input type="checkbox" className="accent-sky-400" checked={v.aisEnabled} onChange={(e) => setV((x) => ({ ...x, aisEnabled: e.target.checked }))} /> AIS
          </label>
          <p className="text-[13px] text-slate-400" id="estado-ais">{textoAis}</p>
          <div className="grid grid-cols-3 gap-2.5">
            {texto('aisUdpPort', 'Puerto UDP', true)}
            {texto('aisTcpHost', 'Servidor TCP (opcional)')}
            {texto('aisTcpPort', 'Puerto TCP', true)}
          </div>
          <p className="text-[13px] text-slate-400">AIS-catcher: <code className="font-mono text-slate-300">-u 127.0.0.1 {v.aisUdpPort || '10110'}</code>. Admite cualquier fuente de sentencias NMEA (!AIVDM).</p>
        </div>
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2 text-slate-100 font-semibold">
            <input type="checkbox" className="accent-sky-400" checked={v.adsbEnabled} onChange={(e) => setV((x) => ({ ...x, adsbEnabled: e.target.checked }))} /> ADS-B
          </label>
          <p className="text-[13px] text-slate-400" id="estado-adsb">{textoAdsb}</p>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2">{texto('adsbHost', 'Servidor')}</div>
            {texto('adsbPort', 'Puerto', true)}
          </div>
          <p className="text-[13px] text-slate-400">Puerto SBS (BaseStation) de readsb o dump1090; normalmente el 30003.</p>
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" id="entradas-guardar" onClick={guardar} disabled={!session.isAdmin} title={session.isAdmin ? '' : 'Solo el administrador'} className="min-h-[40px] px-4 rounded-lg bg-sky-400 text-slate-950 font-bold disabled:opacity-40 cursor-pointer">Guardar</button>
          {mensaje && <span className="text-[13px] text-slate-300">{mensaje}</span>}
        </div>
      </div>
    </details>
  );
}

export default function Mapa({ onIr, config, onGuardar }: { onIr: (p: Pantalla) => void; config: TelemetryConfig; onGuardar: (c: Partial<TelemetryConfig>) => Promise<boolean> }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupos = useRef<Record<IdCapa, L.LayerGroup> | null>(null);
  const centrado = useRef(false);
  const [datos, setDatos] = useState<DatosMapa | null>(null);
  const [error, setError] = useState(false);
  const [visibles, setVisibles] = useState<Record<IdCapa, boolean>>(() => {
    try {
      return { estacion: true, avisos: true, aprs: true, ais: true, adsb: true, trafico: false, ...JSON.parse(localStorage.getItem('sat_mapa_capas') || '{}') };
    } catch {
      return { estacion: true, avisos: true, aprs: true, ais: true, adsb: true, trafico: false };
    }
  });

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { center: [40.2, -3.7], zoom: 6, worldCopyJump: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    grupos.current = { trafico: L.layerGroup(), ais: L.layerGroup(), adsb: L.layerGroup(), aprs: L.layerGroup(), avisos: L.layerGroup(), estacion: L.layerGroup() };
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      grupos.current = null;
    };
  }, []);

  // Datos: al entrar y cada 30 s
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await customFetch('/api/mapa');
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (vivo) { setDatos(j); setError(false); }
      } catch {
        if (vivo) setError(true);
      }
    };
    cargar();
    const t = setInterval(cargar, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // Pintar las capas cuando cambian los datos
  useEffect(() => {
    const m = mapa.current;
    const g = grupos.current;
    if (!m || !g || !datos) return;
    g.estacion.clearLayers();
    g.avisos.clearLayers();
    g.trafico.clearLayers();
    g.aprs.clearLayers();
    g.ais.clearLayers();
    g.adsb.clearLayers();

    const e = datos.estacion;
    L.circle([e.lat, e.lon], { radius: e.radioSismosKm * 1000, color: '#38bdf8', weight: 1, dashArray: '6 6', fill: false, interactive: false }).addTo(g.estacion);
    L.circleMarker([e.lat, e.lon], { radius: 8, color: '#0c4a6e', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 })
      .bindPopup(globo(e.indicativo, [e.gps ? 'Posición del GPS' : 'Posición fija', `Radio de sismos: ${e.radioSismosKm} km`, `Radio de avisos meteo: ${e.radioMeteoKm} km del borde de la zona`]))
      .addTo(g.estacion);

    // Primero los que no se difunden, para que los que sí queden encima
    for (const a of [...datos.avisos].sort((x, y) => Number(x.cumple) - Number(y.cumple))) {
      const color = COLOR_NIVEL[a.gravedad] || COLOR_NIVEL.info;
      const texto = globo(tituloAviso(a), [
        a.titulo,
        `Nivel ${a.gravedad} · ${a.fuente}`,
        vigenciaLegible(a.inicio, a.fin),
        a.cumple ? 'Se difunde desde esta estación' : 'No se difunde desde esta estación',
      ]);
      if (a.zona && a.zona.length >= 3) {
        L.polygon(a.zona, { color, weight: a.cumple ? 3 : 1, fillColor: color, fillOpacity: a.cumple ? 0.35 : 0.15 }).bindPopup(texto).addTo(g.avisos);
      } else {
        L.circleMarker([a.lat, a.lon], { radius: a.cumple ? 10 : 6, color: '#0f172a', weight: 1.5, fillColor: color, fillOpacity: 0.9 }).bindPopup(texto).addTo(g.avisos);
      }
    }

    // APRS: verde lo oído por radio, violeta lo que llega por Internet; los objetos, cuadrados
    for (const x of datos.aprs || []) {
      const color = x.via === 'RF' ? '#4ade80' : '#c084fc';
      const texto = globo(x.nombre, [
        x.clase === 'estacion' ? '' : `${x.clase === 'objeto' ? 'Objeto' : 'Ítem'} de ${x.origen}`,
        x.comentario,
        `${x.via === 'RF' ? 'Oído por radio' : 'Recibido por APRS-IS'} · ${haceCuanto(x.ultima)}`,
      ]);
      if (x.clase === 'estacion') {
        L.circleMarker([x.lat, x.lon], { radius: 6, color: '#0f172a', weight: 1.5, fillColor: color, fillOpacity: 0.95 }).bindPopup(texto).bindTooltip(x.nombre).addTo(g.aprs);
      } else {
        L.marker([x.lat, x.lon], {
          icon: L.divIcon({ className: '', iconSize: [12, 12], html: `<span style="display:block;width:10px;height:10px;border:1.5px solid #0f172a;background:${color}"></span>` }),
        }).bindPopup(texto).bindTooltip(x.nombre).addTo(g.aprs);
      }
    }

    // AIS (azul) y ADS-B (ámbar): una flecha orientada al rumbo, o un punto si no se conoce
    for (const b of datos.ais || []) {
      L.marker([b.lat, b.lon], { icon: flecha('#38bdf8', b.rumbo, 16) })
        .bindPopup(globo(b.nombre || `MMSI ${b.mmsi}`, [
          [b.clase, b.indicativo, `MMSI ${b.mmsi}`].filter(Boolean).join(' · '),
          [b.sog !== null ? `${b.sog.toFixed(1)} nudos` : '', b.rumbo !== null ? `rumbo ${Math.round(b.rumbo)}°` : ''].filter(Boolean).join(' · '),
          b.destino ? `Destino: ${b.destino}` : '',
          `AIS · ${haceCuanto(b.ultima)}`,
        ]))
        .bindTooltip(b.nombre || String(b.mmsi))
        .addTo(g.ais);
    }
    for (const a of datos.adsb || []) {
      L.marker([a.lat, a.lon], { icon: flecha(a.emergencia ? '#f87171' : '#fbbf24', a.rumbo, 18) })
        .bindPopup(globo(a.vuelo || a.hex, [
          a.emergencia ? `${a.emergencia} (código ${a.squawk})` : '',
          [a.enTierra ? 'En tierra' : a.altitud !== null ? `${Math.round(a.altitud * 0.3048)} m (${a.altitud} ft)` : '', a.velocidad !== null ? `${Math.round(a.velocidad * 1.852)} km/h` : '', a.rumbo !== null ? `rumbo ${Math.round(a.rumbo)}°` : ''].filter(Boolean).join(' · '),
          `ICAO ${a.hex}${a.squawk ? ` · transpondedor ${a.squawk}` : ''}`,
          `ADS-B · ${haceCuanto(a.ultima)}`,
        ]))
        .bindTooltip(a.vuelo || a.hex)
        .addTo(g.adsb);
    }

    for (const i of datos.trafico) {
      L.circleMarker([i.lat, i.lon], { radius: 5, color: '#0f172a', weight: 1, fillColor: COLOR_TRAFICO[i.nivel] || '#94a3b8', fillOpacity: 0.9 })
        .bindPopup(globo(`${i.tipo} · ${i.carretera}`, [[i.poblacion, i.provincia].filter(Boolean).join(', '), i.descripcion, 'DGT']))
        .addTo(g.trafico);
    }

    if (!centrado.current) {
      m.setView([e.lat, e.lon], 8);
      centrado.current = true;
    }
  }, [datos]);

  // Mostrar u ocultar capas
  useEffect(() => {
    const m = mapa.current;
    const g = grupos.current;
    if (!m || !g) return;
    (Object.keys(g) as IdCapa[]).forEach((id) => {
      if (visibles[id]) g[id].addTo(m);
      else g[id].remove();
    });
    try { localStorage.setItem('sat_mapa_capas', JSON.stringify(visibles)); } catch { /* sin almacenamiento */ }
  }, [visibles, datos]);

  const casilla = (id: IdCapa, nombre: string, cuenta: string) => (
    <label key={id} className="flex items-center gap-2 min-h-[40px] px-3 rounded-full border border-slate-800 text-sm text-slate-200 cursor-pointer whitespace-nowrap">
      <input type="checkbox" id={`capa-${id}`} className="accent-sky-400" checked={visibles[id]} onChange={(ev) => setVisibles((v) => ({ ...v, [id]: ev.target.checked }))} />
      {nombre} <span className="text-slate-400">{cuenta}</span>
    </label>
  );

  return (
    <div className="flex flex-col gap-3" id="pagina-mapa">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-100">Mapa</h1>
        <button
          type="button"
          id="mapa-centrar"
          disabled={!datos}
          onClick={() => datos && mapa.current?.setView([datos.estacion.lat, datos.estacion.lon], 9)}
          className="min-h-[40px] px-4 rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 hover:border-sky-500 disabled:opacity-40 cursor-pointer"
        >
          Centrar en la estación
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Capas del mapa">
        {casilla('estacion', 'Estación', '')}
        {casilla('avisos', 'Avisos', datos ? `· ${datos.avisos.length}` : '')}
        {casilla('trafico', 'Tráfico', datos ? (datos.traficoReal ? `· ${datos.trafico.length}` : '· sin datos reales') : '')}
        {casilla('aprs', 'APRS', datos ? `· ${(datos.aprs || []).length}` : '')}
        {casilla('ais', 'AIS', datos ? `· ${(datos.ais || []).length}` : '')}
        {casilla('adsb', 'ADS-B', datos ? `· ${(datos.adsb || []).length}` : '')}
      </div>

      {error && <p className="text-sm text-amber-300">No se pudieron cargar los datos del mapa.</p>}
      {visibles.aprs && (
        <p className="text-[13px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-green-400 mr-1.5" />Oído por radio</span>
          <span><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-purple-400 mr-1.5" />Recibido por APRS-IS</span>
          <span><span aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-slate-400 mr-1.5" />Objetos (cuadrados)</span>
          <span><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400 mr-1.5" />Barcos (AIS)</span>
          <span><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 mr-1.5" />Aeronaves (ADS-B)</span>
        </p>
      )}

      <div
        ref={contenedor}
        id="mapa"
        role="application"
        aria-label="Mapa de la estación y sus capas"
        className="w-full rounded-xl border border-slate-800 overflow-hidden bg-slate-900"
        style={{ height: 'min(70vh, 720px)', minHeight: 360 }}
      />

      <Entradas config={config} onGuardar={onGuardar} />

      <p className="text-sm text-slate-400">
        El mapa base se descarga de OpenStreetMap: sin Internet se ven las capas pero no el fondo. Los avisos se detallan en{' '}
        <button type="button" className="text-sky-400 font-semibold cursor-pointer" onClick={() => onIr('avisos')}>Avisos</button>
        {' y las incidencias de carretera en '}
        <button type="button" className="text-sky-400 font-semibold cursor-pointer" onClick={() => onIr('dgt')}>Tráfico</button>.
      </p>
    </div>
  );
}
