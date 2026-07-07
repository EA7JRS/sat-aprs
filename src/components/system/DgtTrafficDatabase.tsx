import React, { useState, useMemo } from 'react';
import { 
  Search, AlertTriangle, ShieldCheck, MapPin, 
  Database, Filter, Activity, Compass, Clock, 
  ExternalLink, ArrowDownRight, ArrowUpRight, Construction, CloudFog, Navigation
} from 'lucide-react';
import { DgtIncident, GPSDStatus } from '../../types';

interface DgtTrafficDatabaseProps {
  incidents: DgtIncident[];
  gpsd: GPSDStatus;
  onRelocate: (lat: number, lon: number) => void;
}

export default function DgtTrafficDatabase({ incidents, gpsd, onRelocate }: DgtTrafficDatabaseProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'distance' | 'road' | 'type'>('distance');
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'viewer'>('list');

  // Group stats for traffic metrics
  const stats = useMemo(() => {
    if (incidents.length === 0) {
      return { total: 0, redCount: 0, worksCount: 0, weatherCount: 0, accidentsCount: 0 };
    }
    let redCount = 0;
    let worksCount = 0;
    let weatherCount = 0;
    let accidentsCount = 0;

    for (const inc of incidents) {
      if (inc.nivel === 'ROJO' || inc.nivel === 'NEGRO') redCount++;
      if (inc.tipo === 'OBRAS' || inc.tipo?.toUpperCase() === 'OBRAS') worksCount++;
      if (inc.tipo === 'METEOROLÓGICA' || inc.tipo?.toUpperCase() === 'METEOROLOGICA' || inc.tipo?.toUpperCase().includes('METEO')) weatherCount++;
      if (inc.tipo === 'ACCIDENTE' || inc.tipo?.toUpperCase() === 'ACCIDENTE') accidentsCount++;
    }

    return {
      total: incidents.length,
      redCount,
      worksCount,
      weatherCount,
      accidentsCount
    };
  }, [incidents]);

  // Enhance incidents dynamically with fresh bearing indicators
  const enhancedIncidents = useMemo(() => {
    return incidents.map(inc => {
      // Calculate bearing / compass orientation to QTH
      const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const dLon = lon2 - lon1;
        const dLat = lat2 - lat1;
        const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;
        const b = (angle + 360) % 360;
        if (b > 337.5 || b <= 22.5) return 'Norte';
        if (b > 22.5 && b <= 67.5) return 'Noreste';
        if (b > 67.5 && b <= 112.5) return 'Este';
        if (b > 112.5 && b <= 157.5) return 'Sureste';
        if (b > 157.5 && b <= 202.5) return 'Sur';
        if (b > 202.5 && b <= 247.5) return 'Suroeste';
        if (b > 247.5 && b <= 292.5) return 'Oeste';
        return 'Noroeste';
      };

      return {
        ...inc,
        bearing: getBearing(gpsd.lat, gpsd.lon, inc.latitud, inc.longitud)
      };
    });
  }, [incidents, gpsd.lat, gpsd.lon]);

  // Handle Filtering & Sorting
  const filteredAndSorted = useMemo(() => {
    let result = enhancedIncidents.filter(inc => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        inc.carretera.toLowerCase().includes(query) || 
        inc.provincia.toLowerCase().includes(query) ||
        inc.poblacion.toLowerCase().includes(query) ||
        inc.descripcion.toLowerCase().includes(query) ||
        inc.tipo.toLowerCase().includes(query);
      
      const matchesType = 
        selectedType === 'all' || 
        inc.tipo.toLowerCase().includes(selectedType.toLowerCase());

      const matchesLevel = 
        selectedLevel === 'all' || 
        inc.nivel === selectedLevel;

      return matchesSearch && matchesType && matchesLevel;
    });

    if (sortBy === 'distance') {
      result.sort((a, b) => (a.distanciaKm || 0) - (b.distanciaKm || 0));
    } else if (sortBy === 'road') {
      result.sort((a, b) => a.carretera.localeCompare(b.carretera));
    } else if (sortBy === 'type') {
      result.sort((a, b) => a.tipo.localeCompare(b.tipo));
    }

    return result;
  }, [enhancedIncidents, searchQuery, selectedType, selectedLevel, sortBy]);

  return (
    <div className="flex flex-col gap-4" id="dgt-traffic-panel">
      
      {/* HEADER HERO AREA */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-blue-950/40 border border-blue-500/30 text-blue-400 font-mono font-bold rounded text-[10px] uppercase">
              Dirección General de Tráfico
            </div>
            <span className="text-[10px] text-slate-500 font-mono">• eTraffic DGT WEB</span>
          </div>
          <h1 className="font-sans font-extrabold text-lg text-slate-100 tracking-tight flex items-center gap-2">
            <Activity className="text-blue-500" size={18} />
            eTraffic - Centro de Coordinación de Incidencias de la Red de Carreteras
          </h1>
          <p className="text-xs text-slate-400 font-serif leading-relaxed">
            Consola civil de radioenlaces integrada con la base de datos oficial de la <strong className="text-slate-300">DGT de España</strong>. Monitoreo automatizado del flujo de transportes, estados transitorios o afecciones debidas a accidentes, vialidad invernal, meteorología severa o mantenimiento preventivo.
          </p>
        </div>
        
        <a 
          href="https://infocar.dgt.es/etrafficWEB/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[10px] font-mono bg-blue-950/30 border border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-950/50 text-blue-300 hover:text-white px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 self-start md:self-center"
        >
          <span>Visitar eTraffic DGT</span>
          <ExternalLink size={11} className="text-blue-400" />
        </a>
      </div>

      {/* METRIC INDICATORS CARD GRID */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Metric 1: Total incidents */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/20 border border-blue-500/20 rounded-lg text-blue-400">
            <Database size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[8px] text-slate-500 uppercase block leading-none">Total Catálogo</span>
            <span className="text-lg font-black text-slate-100">{stats.total}</span>
            <span className="text-[8px] text-slate-400 block mt-0.5">Alertas activas</span>
          </div>
        </div>

        {/* Metric 2: Red alerts (critical obstacles) */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border text-red-400 ${stats.redCount > 0 ? 'bg-red-950/30 border-red-500/30 animate-pulse' : 'bg-slate-900 border-slate-800'}`}>
            <AlertTriangle size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[8px] text-slate-500 uppercase block leading-none">Afección Alta</span>
            <span className={`text-lg font-black ${stats.redCount > 0 ? 'text-red-400' : 'text-slate-100'}`}>
              {stats.redCount}
            </span>
            <span className="text-[8px] text-slate-400 block mt-0.5">Rojo / Negro (Cortes)</span>
          </div>
        </div>

        {/* Metric 3: Accidents */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-amber-950/20 border border-amber-500/10 rounded-lg text-amber-500">
            <Navigation size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[8px] text-slate-500 uppercase block leading-none">Siniestros</span>
            <span className="text-lg font-black text-slate-100">{stats.accidentsCount}</span>
            <span className="text-[8px] text-slate-400 block mt-0.5">Colisiones / Averías</span>
          </div>
        </div>

        {/* Metric 4: Obras (Construction / maintenance) */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center gap-3">
          <div className="p-2.5 bg-amber-950/20 border border-amber-500/10 rounded-lg text-amber-500">
            <Construction size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[8px] text-slate-500 uppercase block leading-none">Obras de Mantenimiento</span>
            <span className="text-lg font-black text-slate-100">{stats.worksCount}</span>
            <span className="text-[8px] text-slate-400 block mt-0.5">Trabajos calzada</span>
          </div>
        </div>

        {/* Metric 5: Meteorology (snow, ice, wind) */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="p-2.5 bg-sky-950/20 border border-sky-500/20 rounded-lg text-sky-400">
            <CloudFog size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[8px] text-slate-500 uppercase block leading-none">Perturbación Clima</span>
            <span className="text-lg font-black text-slate-100">{stats.weatherCount}</span>
            <span className="text-[8px] text-slate-400 block mt-0.5">Niebla / Lluvia / Nieve</span>
          </div>
        </div>
      </div>

      {/* SECTOR TABS: BBDD LOCAL VS VISOR WEB OFICIAL */}
      <div className="flex border-b border-slate-900 bg-slate-950/40 rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveSubTab('list')}
          className={`flex-1 py-2.5 rounded-lg font-sans font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'list'
              ? 'bg-blue-600/15 border border-blue-500/35 text-blue-400 font-extrabold shadow-md'
              : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Database size={13} />
          Base de Datos de Alertas (DGT API)
        </button>
        <button
          onClick={() => setActiveSubTab('viewer')}
          className={`flex-1 py-2.5 rounded-lg font-sans font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'viewer'
              ? 'bg-blue-600/15 border border-blue-500/35 text-blue-400 font-extrabold shadow-md'
              : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Navigation size={13} />
          Visor eTraffic Oficial Web (DGT)
        </button>
      </div>

      {activeSubTab === 'list' ? (
        <>
          {/* FILTER & CONTROL PANEL GRID */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row gap-3 items-stretch justify-between shadow-lg">
            
            {/* Real-time search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por carretera (A-6), causa, provincia..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>

            {/* Action Selects */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Type */}
              <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
                <Filter size={12} className="text-slate-500" />
                <span>Incidencia:</span>
                <select 
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="bg-transparent border-none text-slate-200 outline-none text-[11px] font-bold cursor-pointer"
                >
                  <option value="all" className="bg-slate-950 text-slate-300">Todos los tipos</option>
                  <option value="ACCIDENTE" className="bg-slate-950 text-slate-300">Accidentes</option>
                  <option value="OBRAS" className="bg-slate-950 text-slate-300">Obras</option>
                  <option value="METEOROLÓGICA" className="bg-slate-950 text-slate-300">Meteorología</option>
                  <option value="RETENCIÓN" className="bg-slate-950 text-slate-300">Retenciones</option>
                  <option value="OTROS" className="bg-slate-950 text-slate-300">Otros incidentes</option>
                </select>
              </div>

              {/* Filter Level / Severity */}
              <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
                <span>Nivel:</span>
                <select 
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="bg-transparent border-none text-slate-200 outline-none text-[11px] font-bold cursor-pointer"
                >
                  <option value="all" className="bg-slate-950 text-slate-300">Todos los niveles</option>
                  <option value="VERDE" className="bg-slate-950 text-slate-300 font-bold text-emerald-400">Verde (Fluido / Condicionado)</option>
                  <option value="AMARILLO" className="bg-slate-950 text-slate-300 font-bold text-amber-400">Amarillo (Condicionado / Lento)</option>
                  <option value="ROJO" className="bg-slate-950 text-slate-300 font-bold text-red-400">Rojo (Difícil)</option>
                  <option value="NEGRO" className="bg-slate-950 text-slate-300 font-bold text-purple-400">Negro (Intransitable)</option>
                </select>
              </div>

              {/* Sorted By */}
              <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
                <span>Ordenar por:</span>
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent border-none text-slate-200 outline-none text-[11px] font-bold cursor-pointer"
                >
                  <option value="distance" className="bg-slate-950 text-slate-300">Cercanía al QTH</option>
                  <option value="road" className="bg-slate-950 text-slate-300">Carretera (A-Z)</option>
                  <option value="type" className="bg-slate-950 text-slate-300">Tipo de Incidencia</option>
                </select>
              </div>
            </div>

          </div>

          {/* EMERGENCY CIVIL LEVEL INFOGRAPHIC PANEL (Optional styling accent) */}
          <div className="bg-blue-950/15 border border-blue-800/30 p-3.5 rounded-xl text-xs text-blue-300 font-mono leading-relaxed flex flex-col md:flex-row justify-between gap-4">
            <div>
              <strong>🛡️ Niveles de Servicio en Carretera (Normativa DGT):</strong>
              <span className="block mt-0.5 text-[11px] text-slate-400">
                🟢 <strong>Verde:</strong> Transito normal, precaución. <strong className="text-amber-400">🟡 Amarillo:</strong> Tráfico lento o restricción parcial (obras/niebla). <strong className="text-red-400">🔴 Rojo:</strong> Tráfico difícil, prohibición para camiones. <strong className="text-slate-200">⚫ Negro:</strong> Carretera cerrada a toda circulación por seguridad.
              </span>
            </div>
            <div className="shrink-0 flex items-center md:border-l border-blue-800/20 md:pl-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                SISTEMA COORD: WGS84
              </span>
            </div>
          </div>

          {/* DGT INCIDENTS GRID VIEW LIST */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAndSorted.length > 0 ? (
              filteredAndSorted.map((inc) => {
                const isLocalRef = Math.abs(gpsd.lat - inc.latitud) < 0.005 && Math.abs(gpsd.lon - inc.longitud) < 0.005;
                
                // Set safety visual state colors
                let levelBadge = 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20';
                if (inc.nivel === 'AMARILLO') levelBadge = 'text-amber-400 bg-amber-950/20 border-amber-500/20';
                if (inc.nivel === 'ROJO') levelBadge = 'text-red-400 bg-red-950/20 border-red-500/30 animate-pulse';
                if (inc.nivel === 'NEGRO') levelBadge = 'text-slate-100 bg-slate-900 border-slate-700 animate-pulse-slow';

                return (
                  <div 
                    key={inc.id}
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-3 font-mono text-xs transition-all ${
                      isLocalRef 
                        ? 'bg-slate-950 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                        : 'bg-slate-950/40 hover:bg-slate-950 border-slate-900 hover:border-slate-800'
                    }`}
                  >
                    {/* ID, Road, and Level badge line */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 text-[9px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-blue-900/40 text-blue-300 border border-blue-500/20 rounded font-black tracking-wider text-[10px]">
                            {inc.carretera}
                          </span>
                          <span className="text-slate-500">PK {inc.id.startsWith('sim') ? 'REF-SIM' : inc.id.split('_')[1] || 'N/A'}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded font-sans font-extrabold text-[8px] uppercase border tracking-widest ${levelBadge}`}>
                          NIVEL {inc.nivel}
                        </span>
                      </div>

                      {/* Title & location info */}
                      <div className="font-sans font-extrabold text-sm text-slate-100 flex items-center justify-between leading-normal truncate">
                        <span className="truncate" title={`${inc.poblacion} (${inc.provincia})`}>
                          {inc.poblacion}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-sans">
                        <MapPin size={11} className="text-slate-500" />
                        <span>Provincia: <span className="text-slate-200 font-bold">{inc.provincia}</span></span>
                        {inc.sentido && (
                          <span className="text-slate-500 text-[9px] font-semibold border-l border-slate-800 pl-1">
                            Dir: {inc.sentido}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Main incident description content */}
                    <div className="bg-slate-900/35 p-2.5 rounded-lg border border-slate-900 text-[11px] leading-relaxed text-slate-300 font-serif min-h-[56px] flex flex-col justify-center">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block shrink-0">
                          {inc.tipo === 'ACCIDENTE' ? (
                            <AlertTriangle className="text-amber-500" size={12} />
                          ) : inc.tipo === 'OBRAS' ? (
                            <Construction className="text-yellow-500" size={12} />
                          ) : inc.tipo?.includes('METEO') || inc.tipo === 'METEOROLÓGICA' ? (
                            <CloudFog className="text-sky-400" size={12} />
                          ) : (
                            <Navigation className="text-blue-400" size={12} />
                          )}
                        </span>
                        <p className="flex-1">{inc.descripcion}</p>
                      </div>
                    </div>

                    {/* Secondary metadata stats */}
                    <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400 border-t border-slate-900 pt-2.5">
                      <div className="space-y-0.5">
                        <div className="text-slate-500 font-bold uppercase tracking-wider">Distancia al QTH</div>
                        <div className="text-[10px] font-semibold text-slate-200">
                          {inc.distanciaKm ? `${inc.distanciaKm.toFixed(1)} km` : '-- km'}
                        </div>
                      </div>
                      <div className="space-y-0.5 text-right">
                        <div className="text-slate-500 font-bold uppercase tracking-wider">Marcación RUMBO</div>
                        <div className="text-[10px] font-semibold text-slate-300 flex items-center justify-end gap-1">
                          <Compass size={10} className="text-blue-500" />
                          <span>{inc.bearing || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions line */}
                    <div className="flex items-center justify-between border-t border-slate-900 pt-2.5">
                      <div className="text-[9px] text-slate-500 flex items-center gap-1">
                        <Clock size={10} />
                        <span>Inis: {inc.fecha.split(' ')[1] || inc.fecha.replace('T', ' ').slice(11, 16)}</span>
                      </div>

                      {!isLocalRef ? (
                        <button
                          onClick={() => onRelocate(inc.latitud, inc.longitud)}
                          className="px-2 py-1 bg-slate-900 hover:bg-blue-950 font-sans font-bold text-[9px] text-slate-300 hover:text-blue-400 rounded border border-slate-800 hover:border-blue-500/30 transition-all cursor-pointer select-none"
                        >
                          Centrar Terminal
                        </button>
                      ) : (
                        <span className="text-[9px] text-blue-400 font-semibold flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                          QTH terminal fijado
                        </span>
                      )}
                    </div>

                  </div>
                );
              })
            ) : (
              <div className="col-span-1 md:col-span-3 text-center py-12 text-slate-500 italic bg-slate-950 border border-slate-900 rounded-xl font-sans text-xs">
                Ninguna incidencia de la DGT coincide con los filtros de búsqueda seleccionados.
              </div>
            )}
          </div>
        </>
      ) : (
        /* DGT ETRAFFIC WEB VIEWER IFRAME CONTAINER */
        <div className="flex flex-col gap-4 bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-4">
            <div className="space-y-2">
              <h3 className="font-sans font-extrabold text-sm text-slate-100 flex items-center gap-1.5">
                <Navigation className="text-blue-400" size={16} />
                Portal Cartográfico Oficial eTraffic (DGT)
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal font-sans">
                Cartografía en tiempo real de incidencias, cámaras de tráfico (CCTV), paneles informativos y sensores de vialidad invernal.
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="https://etraffic.dgt.es/etrafficWEB/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-blue-950/40 hover:bg-blue-900/45 border border-blue-500/30 hover:border-blue-500/50 text-blue-300 hover:text-white rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Abrir en Ventana Nueva</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Security & Access Warning Note */}
          <div className="bg-amber-950/15 border border-amber-500/20 rounded-lg p-3 text-[11px] text-amber-300 font-mono leading-relaxed">
            ⚠️ <strong>Soporte de iFrames del Navegador:</strong> El portal de la DGT utiliza cifrado HTTPS estricto. Si la vista interactiva no se renderiza abajo, se debe a políticas restrictivas de cabeceras de seguridad del navegador (directivas SAMEORIGIN / CSP de la DGT). En ese caso, use el botón <strong>"Abrir en Ventana Nueva"</strong> para consultar el mapa oficial directamente.
          </div>

          <div className="relative w-full rounded-xl border border-slate-900 overflow-hidden bg-slate-950 shadow-inner" style={{ height: '650px' }}>
            <iframe 
              src="https://etraffic.dgt.es/etrafficWEB/" 
              title="eTraffic DGT Web Portal"
              className="w-full h-full border-none bg-slate-950"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      )}

    </div>
  );
}
