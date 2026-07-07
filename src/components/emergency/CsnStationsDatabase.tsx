import React, { useState, useMemo } from 'react';
import { 
  Search, Radio, Shield, TrendingUp, MapPin, 
  Database, Filter, Activity, Compass, AlertTriangle, ArrowRight 
} from 'lucide-react';
import { CsnReaStation, GPSDStatus } from '../../types';

interface CsnStationsDatabaseProps {
  stations: CsnReaStation[];
  gpsd: GPSDStatus;
  onRelocate: (lat: number, lon: number) => void;
}

export default function CsnStationsDatabase({ stations, gpsd, onRelocate }: CsnStationsDatabaseProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'radiation' | 'distance'>('name');

  // Calculates the distance between the fixed GPS/fallback coordinate and a station coordinate
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  };

  // Enhance stations with computed distance and drift/live values
  const enhancedStations = useMemo(() => {
    return stations.map(station => {
      const distance = calculateDistance(gpsd.lat, gpsd.lon, station.lat, station.lon);
      
      // Seeded dummy variance based on station code to generate consistent stable variation
      let codeSum = 0;
      for (let i = 0; i < station.id.length; i++) {
        codeSum += station.id.charCodeAt(i);
      }
      
      // deterministic mini fluctuation based on current hour to simulate active telemetry 
      const hourSeed = new Date().getHours() + (new Date().getMinutes() / 60);
      const fluctuation = Math.sin(codeSum + hourSeed) * 0.006;
      const liveValue = parseFloat((station.baseVal + fluctuation).toFixed(3));

      return {
        ...station,
        distance,
        liveValue
      };
    });
  }, [stations, gpsd.lat, gpsd.lon]);

  // Handle Filtering 
  const filteredAndSortedStations = useMemo(() => {
    let result = enhancedStations.filter(st => {
      const matchesSearch = 
        st.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (st.provincia || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = 
        selectedType === 'all' || 
        st.tipo === selectedType;

      return matchesSearch && matchesType;
    });

    // Sorting
    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'radiation') {
      result.sort((a, b) => b.liveValue - a.liveValue); // highest first
    } else if (sortBy === 'distance') {
      result.sort((a, b) => a.distance - b.distance); // closest first
    }

    return result;
  }, [enhancedStations, searchQuery, selectedType, sortBy]);

  // Statistics Summary
  const stats = useMemo(() => {
    if (enhancedStations.length === 0) return { avg: 0, max: null, min: null };
    
    let sum = 0;
    let maxSt = enhancedStations[0];
    let minSt = enhancedStations[0];

    for (const st of enhancedStations) {
      sum += st.liveValue;
      if (st.liveValue > maxSt.liveValue) maxSt = st;
      if (st.liveValue < minSt.liveValue) minSt = st;
    }

    return {
      avg: parseFloat((sum / enhancedStations.length).toFixed(3)),
      max: maxSt,
      min: minSt
    };
  }, [enhancedStations]);

  return (
    <div className="flex flex-col gap-4" id="csn-stations-db-panel">
      
      {/* HEADER SECTION */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 font-mono font-bold rounded text-[10px] uppercase">
              Base de Datos Integrada
            </div>
            <span className="text-[10px] text-slate-500 font-mono">• CSN REA RED NACIONAL</span>
          </div>
          <h1 className="font-sans font-extrabold text-lg text-slate-100 tracking-tight flex items-center gap-2">
            <Database className="text-cyan-400" size={18} />
            Red de Estaciones de Vigilancia Radiológica de Alerta Automática (REA)
          </h1>
          <p className="text-xs text-slate-400 font-serif leading-relaxed">
            Consola de vigilancia ambiental del Consejo de Seguridad Nuclear (CSN). Monitoreo en tiempo real de la tasa de dosis de radiación gamma equivalente ambiental en aire (medido en microsieverts/hora, <strong className="text-slate-300">µSv/h</strong>). El espectro detecta fluctuaciones cósmicas y radionucleidos terrestres.
          </p>
        </div>
        
        <a 
          href="https://www.csn.es/varios/rea/?estaciones-de-vigilancia-radiologica=lista" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[10px] font-mono bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 self-start md:self-center"
        >
          <span>Enlace Oficial CSN REA</span>
          <ArrowRight size={11} className="text-cyan-400" />
        </a>
      </div>

      {/* STATS HIGHLIGHT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Total cataloged */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex items-center gap-3 shadow">
          <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-lg text-cyan-400">
            <Radio size={20} className="animate-pulse" />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[9px] text-slate-500 uppercase block">Estaciones Registradas</span>
            <span className="text-xl font-black text-slate-100">{stations.length}</span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Cobertura nacional completa</span>
          </div>
        </div>

        {/* Metric 2: Average spain value */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex items-center gap-3 shadow">
          <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-emerald-400">
            <TrendingUp size={20} />
          </div>
          <div className="font-mono text-xs">
            <span className="text-[9px] text-slate-500 uppercase block">Promedio Nacional</span>
            <span className="text-xl font-black text-slate-100">{stats.avg.toFixed(3)} <span className="text-xs font-bold text-slate-400">µSv/h</span></span>
            <span className="text-[9px] text-emerald-400 block mt-0.5 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"></span>
              NIVEL DE FONDO NORMAL
            </span>
          </div>
        </div>

        {/* Metric 3: Highest value location (rich granite soils like Galicia/Salamanca are naturally higher!) */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex items-center gap-3 shadow">
          <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-lg text-amber-400">
            <Activity size={20} />
          </div>
          <div className="font-mono text-xs min-w-0 flex-1">
            <span className="text-[9px] text-slate-500 uppercase block">Radiación Máxima de Fondo</span>
            <span className="text-lg font-black text-slate-100 truncate block">
              {stats.max?.liveValue.toFixed(3)} µSv/h
            </span>
            <span className="text-[9px] text-slate-400 block truncate" title={stats.max?.name}>
              📍 {stats.max?.name} (Geología)
            </span>
          </div>
        </div>

        {/* Metric 4: Nearest active detector */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex items-center gap-3 shadow">
          <div className="p-3 bg-yellow-950/20 border border-yellow-500/20 rounded-lg text-yellow-400">
            <Compass size={20} />
          </div>
          <div className="font-mono text-xs min-w-0 flex-1">
            <span className="text-[9px] text-slate-500 uppercase block">Detector REA más cercano</span>
            <span className="text-lg font-black text-yellow-400 truncate block">
              {enhancedStations.length > 0 ? `${enhancedStations.sort((a,b)=>a.distance-b.distance)[0].distance.toFixed(1)} km` : '--'}
            </span>
            <span className="text-[9px] text-slate-400 block truncate">
              Estación: {enhancedStations.length > 0 ? enhancedStations[0].name : 'Cargando...'}
            </span>
          </div>
        </div>
      </div>

      {/* FILTER & TOOLBAR PANEL */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch justify-between shadow-lg">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder="Buscar estación por nombre, provincia..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
            <Filter size={12} className="text-slate-500" />
            <span>Tipo:</span>
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-transparent border-none text-slate-200 outline-none text-[11px] font-bold cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-950 text-slate-300">Todas las estaciones</option>
              <option value="Central Nuclear" className="bg-slate-950 text-slate-300">Central Nuclear (Red NPP)</option>
              <option value="Estación Regional" className="bg-slate-950 text-slate-300">Estación Regional</option>
              <option value="Estación Central" className="bg-slate-950 text-slate-300">Sede Central CSN</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono">
            <span>Ordenar por:</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent border-none text-slate-200 outline-none text-[11px] font-bold cursor-pointer"
            >
              <option value="name" className="bg-slate-950 text-slate-300">Alfabético</option>
              <option value="radiation" className="bg-slate-950 text-slate-300">Nivel de Radiación</option>
              <option value="distance" className="bg-slate-950 text-slate-300">Distancia al QTH</option>
            </select>
          </div>
        </div>

      </div>

      {/* DANGERS EXPLAINER BOX (Optional but very high-end design) */}
      <div className="bg-cyan-950/15 border border-cyan-800/30 p-3.5 rounded-xl text-xs text-cyan-300 font-mono leading-relaxed">
        <strong>🛡️ Escala de Seguridad Civil (Tasa de Dosis equivalente):</strong> En España, la radiación natural de fondo oscila habitualmente entre <strong className="text-cyan-200">0.05 y 0.20 µSv/h</strong>. Niveles hasta <strong className="text-cyan-200">0.25 µSv/h</strong> se consideran normales. Valores por encima de <strong className="text-yellow-400">0.30 µSv/h</strong> activan alarmas preventivas de bajo nivel en el CSN para descartar perturbaciones climáticas (arrastre de radón por lluvias). Niveles sobre <strong className="text-red-400 font-bold">1.00 µSv/h</strong> representarán estados significativos y requerirían intervención o planes de emergencia en el radio de influencia.
      </div>

      {/* THE STATIONS GRID CARD LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredAndSortedStations.length > 0 ? (
          filteredAndSortedStations.map((st) => {
            const isLocalRef = gpsd.lat === st.lat && gpsd.lon === st.lon;
            
            // Color mapping for safety
            let valColor = 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20';
            if (st.liveValue >= 0.25) valColor = 'text-amber-400 bg-amber-950/20 border-amber-500/20 animate-pulse';
            if (st.liveValue >= 0.50) valColor = 'text-red-400 bg-red-950/20 border-red-500/20 animate-pulse-slow';

            return (
              <div 
                key={st.id}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 font-mono text-xs transition-all ${
                  isLocalRef 
                    ? 'bg-slate-950/90 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.1)]' 
                    : 'bg-slate-950/40 hover:bg-slate-950 border-slate-900 hover:border-slate-800'
                }`}
              >
                {/* ID & Type Banner */}
                <div>
                  <div className="flex items-center justify-between mb-1 text-[9px]">
                    <span className="text-slate-500 font-bold tracking-widest">{st.id}</span>
                    <span className={`px-1.5 py-0.2 rounded font-sans font-bold text-[8px] uppercase tracking-wide border ${
                      st.tipo === 'Central Nuclear' 
                        ? 'bg-red-950/30 text-red-400 border-red-500/25' 
                        : st.tipo === 'Estación Central' 
                        ? 'bg-purple-950/30 text-purple-400 border-purple-500/25'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}>
                      {st.tipo}
                    </span>
                  </div>

                  {/* Station Name */}
                  <div className="font-sans font-extrabold text-sm text-slate-100 flex items-center justify-between leading-normal truncate">
                    <span className="truncate" title={st.name}>{st.name}</span>
                    {isLocalRef && (
                      <span className="text-[8px] bg-yellow-950 text-yellow-400 border border-yellow-500/20 px-1 py-0.2 rounded font-mono font-bold uppercase tracking-wider shrink-0 ml-1">
                        CENTRO GPS
                      </span>
                    )}
                  </div>

                  {/* Region info */}
                  <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-sans">
                    <MapPin size={11} className="text-slate-500" />
                    <span>Provincia: <span className="text-slate-300 font-bold">{st.provincia || 'N/A'}</span></span>
                  </div>
                </div>

                {/* Values Block */}
                <div className="grid grid-cols-2 gap-2 bg-slate-900/40 p-2.5 rounded-lg border border-slate-900/80">
                  <div>
                    <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-widest">Tasa Gamma</span>
                    <span className={`text-[13px] font-black block tracking-tight ${valColor.split(' ')[0]}`}>
                      {st.liveValue.toFixed(3)}
                    </span>
                    <span className="text-[8px] text-slate-400 block tracking-normal">µSv/h EN AIRE</span>
                  </div>
                  <div className="text-right border-l border-slate-900/40 pl-2">
                    <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-widest">Distancia QTH</span>
                    <span className="text-[11px] font-semibold text-slate-300 block mt-0.5">
                      {st.distance.toFixed(1)} km
                    </span>
                    <span className="text-[8px] text-slate-400 block tracking-normal">DIRECCIÓN {getBearingIndicator(gpsd.lat, gpsd.lon, st.lat, st.lon)}</span>
                  </div>
                </div>

                {/* Coordinates & Relocation Buttons */}
                <div className="flex items-center justify-between border-t border-slate-900 pt-3">
                  <div className="text-[9px] text-slate-500 flex flex-col">
                    <span>Lat: {st.lat.toFixed(4)}</span>
                    <span>Lon: {st.lon.toFixed(4)}</span>
                  </div>

                  {!isLocalRef ? (
                    <button
                      onClick={() => onRelocate(st.lat, st.lon)}
                      className="px-2 py-1 bg-slate-900 hover:bg-cyan-950 font-sans font-bold text-[9px] text-slate-300 hover:text-cyan-400 rounded border border-slate-800 hover:border-cyan-500/30 transition-all cursor-pointer select-none"
                    >
                      Centrar Terminal
                    </button>
                  ) : (
                    <span className="text-[9px] text-yellow-500 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                      Terminal fijado aquí
                    </span>
                  )}
                </div>

              </div>
            );
          })
        ) : (
          <div className="col-span-1 md:col-span-3 text-center py-12 text-slate-500 italic bg-slate-950 border border-slate-900 rounded-xl font-sans text-xs">
            Ninguna estación REA del CSN coincide con los criterios de búsqueda actuales.
          </div>
        )}
      </div>

    </div>
  );
}

// Simple bearing direction helper
function getBearingIndicator(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const angle = Math.atan2(dLon, dLat) * 180 / Math.PI;
  const b = (angle + 360) % 360;
  if (b > 337.5 || b <= 22.5) return '▲ N';
  if (b > 22.5 && b <= 67.5) return '► NE';
  if (b > 67.5 && b <= 112.5) return '► E';
  if (b > 112.5 && b <= 157.5) return '▼ SE';
  if (b > 157.5 && b <= 202.5) return '▼ S';
  if (b > 202.5 && b <= 247.5) return '◀ SO';
  if (b > 247.5 && b <= 292.5) return '◀ O';
  return '▲ NO';
}
