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
import { vigenciaLegible, tituloAviso } from '../utils/useAvisos';

interface AvisoMapa {
  id: string; tipo: string; gravedad: 'info' | 'amarillo' | 'naranja' | 'rojo'; titulo: string; detalle: string; fuente: string;
  inicio: number; fin: number; lat: number; lon: number; cumple: boolean; zona: Array<[number, number]> | null;
}
interface Incidencia { id: string; tipo: string; carretera: string; poblacion: string; provincia: string; nivel: string; descripcion: string; lat: number; lon: number }
interface DatosMapa {
  estacion: { lat: number; lon: number; indicativo: string; gps: boolean; radioSismosKm: number; radioMeteoKm: number };
  avisos: AvisoMapa[];
  trafico: Incidencia[];
  traficoReal: boolean;
}

type IdCapa = 'estacion' | 'avisos' | 'trafico';

const COLOR_NIVEL: Record<string, string> = { rojo: '#f87171', naranja: '#fb923c', amarillo: '#fde047', info: '#94a3b8' };
const COLOR_TRAFICO: Record<string, string> = { NEGRO: '#0f172a', ROJO: '#f87171', AMARILLO: '#fde047', VERDE: '#4ade80' };

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

export default function Mapa({ onIr }: { onIr: (p: Pantalla) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupos = useRef<Record<IdCapa, L.LayerGroup> | null>(null);
  const centrado = useRef(false);
  const [datos, setDatos] = useState<DatosMapa | null>(null);
  const [error, setError] = useState(false);
  const [visibles, setVisibles] = useState<Record<IdCapa, boolean>>(() => {
    try {
      return { estacion: true, avisos: true, trafico: false, ...JSON.parse(localStorage.getItem('sat_mapa_capas') || '{}') };
    } catch {
      return { estacion: true, avisos: true, trafico: false };
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
    grupos.current = { trafico: L.layerGroup(), avisos: L.layerGroup(), estacion: L.layerGroup() };
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

  const pendiente = (nombre: string) => (
    <span key={nombre} className="flex items-center min-h-[40px] px-3 rounded-full border border-dashed border-slate-800 text-sm text-slate-400 whitespace-nowrap" title="Capa pendiente">
      {nombre} · pendiente
    </span>
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
        {['APRS', 'AIS', 'ADS-B'].map(pendiente)}
      </div>

      {error && <p className="text-sm text-amber-300">No se pudieron cargar los datos del mapa.</p>}

      <div
        ref={contenedor}
        id="mapa"
        role="application"
        aria-label="Mapa de la estación y sus capas"
        className="w-full rounded-xl border border-slate-800 overflow-hidden bg-slate-900"
        style={{ height: 'min(70vh, 720px)', minHeight: 360 }}
      />

      <p className="text-sm text-slate-400">
        El mapa base se descarga de OpenStreetMap: sin Internet se ven las capas pero no el fondo. Los avisos se detallan en{' '}
        <button type="button" className="text-sky-400 font-semibold cursor-pointer" onClick={() => onIr('avisos')}>Avisos</button>
        {' y las incidencias de carretera en '}
        <button type="button" className="text-sky-400 font-semibold cursor-pointer" onClick={() => onIr('dgt')}>Tráfico</button>.
      </p>
    </div>
  );
}
