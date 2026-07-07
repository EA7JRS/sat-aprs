import React, { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Layers, Wifi, Volume2, Bookmark, BookmarkCheck, ArrowRightLeft, HelpCircle, Navigation, Compass, Sliders, Globe, Clipboard, Import, PlusCircle, Check, Database, Trash2, Link, Server } from 'lucide-react';
import { WIRESX_NODES_DATABASE, WIRESX_ROOMS_PRESET, parseWiresXRawText, WiresXNode, WiresXRoom } from '../../data/wiresx';

// Predefined reference locations for GPS proximity
const PRESET_LOCATIONS = [
  { name: "Madrid (Centro)", lat: 40.4168, lon: -3.7038 },
  { name: "Barcelona (Catalunya)", lat: 41.3851, lon: 2.1734 },
  { name: "Valencia (Levante)", lat: 39.4699, lon: -0.3763 },
  { name: "Sevilla (Andalucía)", lat: 37.3828, lon: -5.9903 },
  { name: "Zaragoza (Aragón)", lat: 41.6488, lon: -0.8891 },
  { name: "Málaga (Costa del Sol)", lat: 36.7213, lon: -4.4214 },
  { name: "Bilbao (Euskadi)", lat: 43.2630, lon: -2.9350 },
  { name: "Santiago de Compostela", lat: 42.8782, lon: -8.5448 },
  { name: "Gijón (Asturias)", lat: 43.5357, lon: -5.6615 },
  { name: "Las Palmas (Canarias)", lat: 28.1235, lon: -15.4363 }
];

// Calculate distance via Haversine
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Estimate coordinates for WiresX nodes based on keywords
function estimateWiresXCoords(node: WiresXNode): { lat: number; lon: number } {
  const locUpper = (node.city + " " + node.state).toUpperCase();
  if (locUpper.includes("GIJÓN") || locUpper.includes("GIJON") || locUpper.includes("ASTURIAS") || locUpper.includes("SAN MARTÍN")) {
    return { lat: 43.5357, lon: -5.6615 };
  }
  if (locUpper.includes("ALICANTE") || locUpper.includes("CASTELLS")) {
    return { lat: 38.3452, lon: -0.4815 };
  }
  if (locUpper.includes("BARCELONA") || locUpper.includes("ESPARREGUERA") || locUpper.includes("CATALUNYA") || locUpper.includes("MONTSENY") || locUpper.includes("GABARRES") || locUpper.includes("GIRONA")) {
    return { lat: 41.3851, lon: 2.1734 };
  }
  if (locUpper.includes("ALCORCÓN") || locUpper.includes("ALCORCON") || locUpper.includes("MADRID") || locUpper.includes("LEÓN") || locUpper.includes("LEON")) {
    return { lat: 40.4168, lon: -3.7038 };
  }
  if (locUpper.includes("ZARAGOZA") || locUpper.includes("FRAGA") || locUpper.includes("CALATAYUD") || locUpper.includes("ARAGÓN") || locUpper.includes("ARAGON")) {
    return { lat: 41.6488, lon: -0.8891 };
  }
  if (locUpper.includes("VALENCIA") || locUpper.includes("ALICANTE") || locUpper.includes("CASTELLON") || locUpper.includes("CASTELLÓN")) {
    return { lat: 39.4699, lon: -0.3763 };
  }
  if (locUpper.includes("SEVILLA") || locUpper.includes("ANDALUCÍA") || locUpper.includes("ANDALUCIA") || locUpper.includes("HUELVA") || locUpper.includes("CÁDIZ") || locUpper.includes("CADIZ") || locUpper.includes("TARIFA")) {
    return { lat: 37.3828, lon: -5.9903 };
  }
  if (locUpper.includes("MÁLAGA") || locUpper.includes("MALAGA") || locUpper.includes("GRANADA")) {
    return { lat: 36.7213, lon: -4.4214 };
  }
  if (locUpper.includes("BILBAO") || locUpper.includes("VIZCAYA") || locUpper.includes("OIZ") || locUpper.includes("EUSKADI") || locUpper.includes("PAÍS VASCO") || locUpper.includes("PAIS VASCO")) {
    return { lat: 43.2630, lon: -2.9350 };
  }
  if (locUpper.includes("SANTANDER") || locUpper.includes("CANTABRIA")) {
    return { lat: 43.4623, lon: -3.8099 };
  }
  if (locUpper.includes("BADAJOZ") || locUpper.includes("EXTREMADURA")) {
    return { lat: 38.8794, lon: -6.9706 };
  }
  if (locUpper.includes("MURCIA") || locUpper.includes("MÚRCIA") || locUpper.includes("ESPUÑA") || locUpper.includes("AGUILAS") || locUpper.includes("ÁGUILAS")) {
    return { lat: 37.9922, lon: -1.1307 };
  }
  if (locUpper.includes("LANZAROTE") || locUpper.includes("CANARIAS") || locUpper.includes("TENERIFE") || locUpper.includes("PALMAS")) {
    return { lat: 28.2916, lon: -16.6291 };
  }
  if (locUpper.includes("MENORCA") || locUpper.includes("TORO") || locUpper.includes("MALLORCA") || locUpper.includes("IBIZA") || locUpper.includes("BALEARS")) {
    return { lat: 39.6953, lon: 3.0176 };
  }
  if (locUpper.includes("CEUTA")) {
    return { lat: 35.8894, lon: -5.3198 };
  }
  if (locUpper.includes("MELILLA")) {
    return { lat: 35.2923, lon: -2.9381 };
  }
  if (locUpper.includes("TOKYO") || locUpper.includes("JAPAN")) {
    return { lat: 35.6762, lon: 139.6503 };
  }
  if (locUpper.includes("PARIS") || locUpper.includes("FRANCE")) {
    return { lat: 48.8566, lon: 2.3522 };
  }
  if (locUpper.includes("LONDON") || locUpper.includes("UNITED KINGDOM") || locUpper.includes("UK")) {
    return { lat: 51.5074, lon: -0.1278 };
  }
  if (locUpper.includes("LOS ANGELES") || locUpper.includes("CALIFORNIA") || locUpper.includes("USA")) {
    return { lat: 34.0522, lon: -118.2437 };
  }
  return { lat: 40.4168, lon: -3.7038 };
}

interface WiresXDatabaseViewProps {
  onInjectRaw?: (packet: string) => void;
  showToast?: (message: string) => void;
  activeNodesList?: string[];
  isLoadingStatus?: boolean;
  onRefreshStatus?: () => void;
}

export default function WiresXDatabaseView({ 
  onInjectRaw, 
  showToast, 
  activeNodesList = [], 
  isLoadingStatus = false, 
  onRefreshStatus 
}: WiresXDatabaseViewProps) {
  const [wiresxSearchTerm, setWiresxSearchTerm] = useState('');
  const [selectedWiresXRoom, setSelectedWiresXRoom] = useState<string>('ALL');
  const [selectedWiresXCountry, setSelectedWiresXCountry] = useState<string>('ALL');
  const [isImporting, setIsImporting] = useState(false);
  const [rawImportText, setRawImportText] = useState('');
  const [showDemoPaste, setShowDemoPaste] = useState(false);

  const [wiresxNodes, setWiresxNodes] = useState<WiresXNode[]>(() => {
    try {
      const saved = localStorage.getItem('imported_wiresx_nodes');
      const parsed = saved ? JSON.parse(saved) : [];
      const savedIds = new Set(parsed.map((n: WiresXNode) => n.nodeId));
      const filteredPresets = WIRESX_NODES_DATABASE.filter(n => !savedIds.has(n.nodeId));
      return [...filteredPresets, ...parsed];
    } catch {
      return WIRESX_NODES_DATABASE;
    }
  });

  // GPS Proximity states
  const [isProximityActive, setIsProximityActive] = useState(false);
  const [userLat, setUserLat] = useState(40.4168);
  const [userLon, setUserLon] = useState(-3.7038);
  const [searchRadius, setSearchRadius] = useState(150); // km
  const [sortByProximity, setSortByProximity] = useState(true);

  // Load last valid location on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastValidLocation');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          const lat = typeof parsed.lat === 'number' ? parsed.lat : (typeof parsed.latitude === 'number' ? parsed.latitude : null);
          const lon = typeof parsed.lon === 'number' ? parsed.lon : (typeof parsed.longitude === 'number' ? parsed.longitude : null);
          if (lat !== null && lon !== null) {
            setUserLat(lat);
            setUserLon(lon);
          }
        }
      }
    } catch (e) {
      console.error("Error reading lastValidLocation in WiresXDatabaseView:", e);
    }
  }, []);

  // Browser GPS lookup
  const handleGetBrowserLocation = () => {
    if (!navigator.geolocation) {
      if (showToast) showToast("La geolocalización no está soportada por su navegador.");
      return;
    }
    
    if (showToast) showToast("Buscando señal GPS del navegador...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setUserLat(lat);
        setUserLon(lon);
        setIsProximityActive(true);
        if (showToast) showToast(`📍 Ubicación GPS obtenida: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
        localStorage.setItem('lastValidLocation', JSON.stringify({ lat, lon, timestamp: Date.now() }));
      },
      (error) => {
        console.error(error);
        if (showToast) showToast(`⚠️ Error de geolocalización: ${error.message}. Seleccione un preajuste.`);
      }
    );
  };

  // Wires-X Stats
  const wiresxStats = useMemo(() => {
    const total = wiresxNodes.length;
    const spain = wiresxNodes.filter(n => n.country.toLowerCase() === 'spain' || n.country.toLowerCase() === 'españa').length;
    const international = total - spain;
    const imported = wiresxNodes.length - WIRESX_NODES_DATABASE.length;
    return { total, spain, international, imported };
  }, [wiresxNodes]);

  // Unique Wires-X Rooms list
  const wiresxRoomsList = useMemo(() => {
    const presetsMap = new Map(WIRESX_ROOMS_PRESET.map(r => [r.roomId, r]));
    const uniqueRoomIds = new Set<string>();
    
    wiresxNodes.forEach(n => {
      if (n.roomId) uniqueRoomIds.add(n.roomId);
    });

    const list: { roomId: string; name: string; description: string }[] = [];
    uniqueRoomIds.forEach(id => {
      const preset = presetsMap.get(id);
      if (preset) {
        list.push({ roomId: id, name: preset.name, description: preset.description });
      } else {
        list.push({ roomId: id, name: `ROOM-${id}`, description: "Sala externa conectada" });
      }
    });

    return [{ roomId: 'ALL', name: 'TODAS LAS SALAS', description: 'Todas las salas activas' }, ...list.sort((a, b) => a.name.localeCompare(b.name))];
  }, [wiresxNodes]);

  // Unique Wires-X countries list
  const wiresxCountriesList = useMemo(() => {
    const unique = new Set(wiresxNodes.map(n => n.country).filter(Boolean));
    return ['ALL', ...Array.from(unique).sort()];
  }, [wiresxNodes]);

  // Filter and sort Wires-X Nodes
  const filteredWiresXNodes = useMemo(() => {
    const withDistance = wiresxNodes.map(node => {
      const coords = estimateWiresXCoords(node);
      const distance = calculateHaversineDistance(userLat, userLon, coords.lat, coords.lon);
      return { ...node, coords, distance };
    });

    const filtered = withDistance.filter(node => {
      const sLower = wiresxSearchTerm.toLowerCase();
      const matchSearch =
        node.callsign.toLowerCase().includes(sLower) ||
        node.city.toLowerCase().includes(sLower) ||
        node.state.toLowerCase().includes(sLower) ||
        node.country.toLowerCase().includes(sLower) ||
        node.nodeId.includes(sLower) ||
        (node.roomId && node.roomId.includes(sLower));

      let matchRoom = true;
      if (selectedWiresXRoom !== 'ALL') {
        matchRoom = node.roomId === selectedWiresXRoom;
      }

      let matchCountry = true;
      if (selectedWiresXCountry !== 'ALL') {
        matchCountry = node.country === selectedWiresXCountry;
      }

      let matchProximity = true;
      if (isProximityActive) {
        matchProximity = node.distance <= searchRadius;
      }

      return matchSearch && matchRoom && matchCountry && matchProximity;
    });

    if (isProximityActive || sortByProximity) {
      return filtered.sort((a, b) => a.distance - b.distance);
    }
    return filtered;
  }, [wiresxNodes, wiresxSearchTerm, selectedWiresXRoom, selectedWiresXCountry, isProximityActive, userLat, userLon, searchRadius, sortByProximity]);

  const handleImportWiresX = () => {
    if (!rawImportText.trim()) {
      if (showToast) showToast("⚠️ Por favor, pegue texto válido de la lista de nodos activos.");
      return;
    }

    try {
      const parsed = parseWiresXRawText(rawImportText);
      if (parsed.length === 0) {
        if (showToast) showToast("❌ No se pudieron extraer nodos válidos. Verifique el formato.");
        return;
      }

      const saved = localStorage.getItem('imported_wiresx_nodes');
      const existingImported: WiresXNode[] = saved ? JSON.parse(saved) : [];
      
      const combined = [...existingImported];
      let addedCount = 0;
      
      parsed.forEach(node => {
        const exists = combined.some(n => n.nodeId === node.nodeId) || WIRESX_NODES_DATABASE.some(n => n.nodeId === node.nodeId);
        if (!exists) {
          combined.push(node);
          addedCount++;
        }
      });

      localStorage.setItem('imported_wiresx_nodes', JSON.stringify(combined));
      
      const savedIds = new Set(combined.map(n => n.nodeId));
      const filteredPresets = WIRESX_NODES_DATABASE.filter(n => !savedIds.has(n.nodeId));
      setWiresxNodes([...filteredPresets, ...combined]);
      
      setRawImportText('');
      setIsImporting(false);
      
      if (showToast) {
        showToast(`🎉 ¡Éxito! Se han importado ${addedCount} nodos Wires-X activos adicionales de active_node2.php.`);
      }
    } catch (e) {
      console.error(e);
      if (showToast) showToast("❌ Error al procesar el texto de importación.");
    }
  };

  const handleClearImportedWiresX = () => {
    if (window.confirm("¿Está seguro de que desea eliminar todos los nodos importados manualmente de la base de datos local?")) {
      localStorage.removeItem('imported_wiresx_nodes');
      setWiresxNodes(WIRESX_NODES_DATABASE);
      if (showToast) showToast("🗑️ Nodos importados eliminados de la base de datos.");
    }
  };

  const handleSintonizarWiresX = (node: WiresXNode) => {
    if (showToast) {
      showToast(`🌐 WIRES-X: Sintonizando frecuencia de nodo ${node.frequency.toFixed(4)} MHz (${node.callsign}). Squelch: ${node.squelch}`);
    }

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime); 
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1109, audioCtx.currentTime);
      
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
      
      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.5);
      osc2.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio block ignore
    }

    if (onInjectRaw) {
      const packet = `${node.callsign}>APRS,TCPIP*,qAC,WIRESX:;${node.callsign.padEnd(9)}*111111z${node.frequency.toFixed(3)}MHz WX NodeID:${node.nodeId} Room:${node.roomId}`;
      onInjectRaw(packet);
    }
  };

  const loadDemoText = () => {
    const demo = `12045\tEA2YAI-ND\t145.6250\tTone 123.0\tCalatayud\tAragón\tSpain\t21005\tSPAIN-CQ
15123\tEA5YAM-ND\t145.5750\tDG-ID 55\tCastell de Castells\tComunidad Valenciana\tSpain\t21100\tVALENCIA
21321\tEA3TEST-ND\t144.8500\tDSQ 10\tSabadell\tCatalunya\tSpain\t21015\tCATALUNYA
10543\tJA1YUA-ND\t439.1200\tDG-ID 01\tTokyo\tKanto\tJapan\t20005\tJAPAN-CQ`;
    setRawImportText(demo);
    if (showToast) showToast("📝 Texto de demostración cargado en el editor. Haga clic en 'Procesar e Importar'.");
  };

  return (
    <div className="space-y-5" id="wiresx-database-container">
      {/* STATS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Total Nodos</span>
          <span className="text-xl font-sans font-black text-slate-100">{wiresxStats.total}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Nodos España</span>
          <span className="text-xl font-sans font-black text-cyan-400">{wiresxStats.spain}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Nodos Internac.</span>
          <span className="text-xl font-sans font-black text-indigo-400">{wiresxStats.international}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Salas Activas</span>
          <span className="text-xl font-sans font-black text-amber-400">{WIRESX_ROOMS_PRESET.length}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Importados</span>
          <span className="text-xl font-sans font-black text-emerald-400">{wiresxStats.imported}</span>
        </div>
      </div>

      {/* SEARCH AND FILTERS PANEL */}
      <div className="bg-slate-950/80 border border-slate-900 p-4.5 rounded-xl space-y-4 shadow-lg">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Text Search Input */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar por indicativo, ciudad, provincia, país, Node ID o Room ID..."
              value={wiresxSearchTerm}
              onChange={(e) => setWiresxSearchTerm(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 transition-all font-sans"
            />
            {wiresxSearchTerm && (
              <button
                onClick={() => setWiresxSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 text-xs"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Rooms Filter */}
          <div className="relative w-full lg:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Server size={14} />
            </span>
            <select
              value={selectedWiresXRoom}
              onChange={(e) => setSelectedWiresXRoom(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 cursor-pointer appearance-none"
            >
              {wiresxRoomsList.map(room => (
                <option key={room.roomId} value={room.roomId}>
                  {room.roomId === 'ALL' ? 'Todas las Salas' : `${room.name} (${room.roomId})`}
                </option>
              ))}
            </select>
          </div>

          {/* Country Filter */}
          <div className="relative w-full lg:w-48">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Globe size={14} />
            </span>
            <select
              value={selectedWiresXCountry}
              onChange={(e) => setSelectedWiresXCountry(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 cursor-pointer appearance-none"
            >
              <option value="ALL">Todos los Países ({wiresxCountriesList.length - 1})</option>
              {wiresxCountriesList.filter(c => c !== 'ALL').map(c => (
                <option key={c} value={c}>{c === 'Spain' ? 'España' : c}</option>
              ))}
            </select>
          </div>

          {/* Importer Panel Toggle Button */}
          <button
            onClick={() => setIsImporting(!isImporting)}
            className={`px-3 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 border shrink-0 cursor-pointer ${
              isImporting 
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700'
            }`}
          >
            <Import size={14} />
            <span>Importador Web</span>
          </button>
        </div>

        {/* GPS PROXIMITY FILTER SECTION */}
        <div className="border-t border-slate-900/80 pt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsProximityActive(!isProximityActive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                isProximityActive 
                  ? 'bg-cyan-500/25 border border-cyan-500/45 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)] font-extrabold' 
                  : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700/80'
              }`}
            >
              <Navigation size={13} className={isProximityActive ? 'animate-pulse text-cyan-400' : ''} />
              <span>{isProximityActive ? 'Filtro de Proximidad ACTIVO' : 'Aplicar Filtro de Proximidad GPS'}</span>
            </button>

            {isProximityActive && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortByProximity(!sortByProximity)}
                  className={`text-[10px] font-mono px-2 py-1 rounded transition-colors border ${
                    sortByProximity 
                      ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20' 
                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
                  }`}
                  title="Ordenar resultados de más cercano a más lejano"
                >
                  Ordenar: {sortByProximity ? 'Más Cercanos' : 'Por Defecto'}
                </button>
                <button
                  onClick={handleGetBrowserLocation}
                  className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 hover:bg-cyan-900/40 px-2 py-1 rounded transition-colors"
                >
                  <Compass size={11} className="animate-spin-slow" />
                  Auto-GPS
                </button>
              </div>
            )}
          </div>

          {isProximityActive && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 p-3.5 bg-slate-950/40 border border-slate-900/80 rounded-xl animate-fade-in shadow-inner">
              {/* Radius slider */}
              <div className="md:col-span-5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
                  <span className="flex items-center gap-1"><Sliders size={11} /> Radio de búsqueda</span>
                  <span className="text-cyan-400 font-bold">{searchRadius} km</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="1000"
                  step="10"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(Number(e.target.value))}
                  className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[8px] font-mono text-slate-600">
                  <span>20 km</span>
                  <span>150 km</span>
                  <span>500 km</span>
                  <span>1000 km</span>
                </div>
              </div>

              {/* Coordinates Inputs */}
              <div className="md:col-span-4 flex gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-[9px] font-mono uppercase text-slate-500">Latitud</span>
                  <input
                    type="number"
                    value={userLat}
                    step="0.0001"
                    onChange={(e) => setUserLat(Number(e.target.value))}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 font-mono"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-[9px] font-mono uppercase text-slate-500">Longitud</span>
                  <input
                    type="number"
                    value={userLon}
                    step="0.0001"
                    onChange={(e) => setUserLon(Number(e.target.value))}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 font-mono"
                  />
                </div>
              </div>

              {/* Location presets */}
              <div className="md:col-span-3 flex flex-col gap-1">
                <span className="text-[9px] font-mono uppercase text-slate-500">Ubicación de Referencia</span>
                <select
                  onChange={(e) => {
                    const preset = PRESET_LOCATIONS.find(p => p.name === e.target.value);
                    if (preset) {
                      setUserLat(preset.lat);
                      setUserLon(preset.lon);
                      if (showToast) showToast(`📍 Ubicación sintonizada en: ${preset.name}`);
                    }
                  }}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 cursor-pointer h-7"
                >
                  <option value="">Personalizada / GPS</option>
                  {PRESET_LOCATIONS.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WEB DATA IMPORTER collapsible panel */}
      {isImporting && (
        <div className="bg-slate-950/90 border border-amber-500/20 p-5 rounded-2xl space-y-4 animate-fade-in shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <div className="flex items-center gap-2">
              <Import size={18} className="text-amber-400" />
              <h3 className="font-sans font-bold text-sm text-slate-100 uppercase tracking-wide">
                Importador de Nodos Wires-X (desde yaesu.com)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadDemoText}
                className="text-[10px] bg-slate-900 text-slate-400 hover:text-slate-200 px-2 py-1 rounded font-mono border border-slate-800 cursor-pointer"
              >
                Cargar Demo
              </button>
              {wiresxStats.imported > 0 && (
                <button
                  onClick={handleClearImportedWiresX}
                  className="text-[10px] bg-red-950/60 text-red-400 hover:bg-red-900/60 px-2 py-1 rounded font-mono border border-red-500/20 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={11} />
                  Limpiar BD
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed space-y-2">
            <p>
              Debido a restricciones de seguridad en contenedores, no podemos realizar peticiones directas desde el servidor a Yaesu. Siga estos pasos para actualizar los nodos activos en tiempo real:
            </p>
            <ol className="list-decimal pl-5 space-y-1 font-mono text-slate-500 text-[10px]">
              <li>Abra la URL oficial: <a href="https://www.yaesu.com/jp/en/wires-x/id/active_node2.php" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">https://www.yaesu.com/jp/en/wires-x/id/active_node2.php <Link size={10} /></a></li>
              <li>Seleccione la tabla de nodos activos completa (o presione Ctrl+A / Cmd+A para copiar todo el texto de la pantalla).</li>
              <li>Pegue el contenido en el recuadro de texto inferior. El algoritmo analizará, extraerá de forma inteligente y actualizará su base de datos local.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <textarea
              className="w-full h-44 bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
              placeholder="Pegue aquí el texto copiado de la web de Yaesu active_node2.php... (Tabulado o separado por múltiples espacios)"
              value={rawImportText}
              onChange={(e) => setRawImportText(e.target.value)}
            />
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => {
                  setRawImportText('');
                  setIsImporting(false);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportWiresX}
                className="px-4 py-1.5 bg-amber-500 text-slate-950 font-sans font-bold text-xs rounded-lg hover:bg-amber-400 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check size={13} className="stroke-[3]" />
                Procesar e Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPULAR ROOMS QUICK BAR */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest pl-1">Salas Wires-X Principales</h4>
        <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
          {WIRESX_ROOMS_PRESET.slice(0, 10).map((room) => {
            const isSelected = selectedWiresXRoom === room.roomId;
            return (
              <button
                key={room.roomId}
                onClick={() => setSelectedWiresXRoom(isSelected ? 'ALL' : room.roomId)}
                className={`px-3 py-2 rounded-xl text-left border transition-all duration-150 shrink-0 cursor-pointer min-w-44 ${
                  isSelected 
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.1)]' 
                    : 'bg-slate-950/50 border-slate-900 text-slate-300 hover:border-slate-800 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-mono text-xs font-black tracking-tight">{room.name}</span>
                  <span className={`text-[8px] font-mono px-1 py-0.2 rounded ${
                    isSelected ? 'bg-cyan-950 text-cyan-400' : 'bg-slate-900 text-slate-500'
                  }`}>
                    ID:{room.roomId}
                  </span>
                </div>
                <span className="text-[9px] text-slate-500 block truncate mt-1 max-w-[160px]">{room.description}</span>
                <span className="text-[8px] font-mono text-slate-600 block mt-0.5">~{room.activeNodesCount} nodos activos</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN RESULT GRID */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-slate-500 font-mono text-[10px] px-2 uppercase tracking-wider">
          <span>Resultados Wires-X: <strong className="text-slate-200">{filteredWiresXNodes.length}</strong> nodos activos</span>
          {selectedWiresXRoom !== 'ALL' && (
            <button 
              onClick={() => setSelectedWiresXRoom('ALL')}
              className="text-cyan-400 hover:underline text-[9px] font-mono cursor-pointer"
            >
              Quitar filtro de sala
            </button>
          )}
        </div>

        {filteredWiresXNodes.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-850 rounded-xl bg-slate-950/20">
            <HelpCircle size={32} className="mx-auto text-slate-600 mb-2.5" />
            <h4 className="text-xs font-bold text-slate-300 uppercase">Sin nodos Wires-X en la base de datos</h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              No se han encontrado nodos activos que cumplan con los filtros. Pruebe a cambiar los términos de búsqueda, remover el filtro de proximidad o importar la última lista de la web de Yaesu.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredWiresXNodes.map((node) => {
              const hasRoom = node.roomId && node.roomId !== '';
              const isVhf = node.frequency >= 144 && node.frequency <= 148;
              const isUhf = node.frequency >= 430 && node.frequency <= 440;
              const isSpain = node.country.toLowerCase() === 'spain' || node.country.toLowerCase() === 'españa';
              const isNodeActive = activeNodesList.some(nodeCall => {
                const cleanNode = nodeCall.toUpperCase().trim();
                const cleanCall = node.callsign.toUpperCase().trim();
                return cleanNode === cleanCall || cleanNode.startsWith(cleanCall + '-') || cleanCall.startsWith(cleanNode + '-');
              });

              // Try to find room name
              const roomPreset = WIRESX_ROOMS_PRESET.find(r => r.roomId === node.roomId);
              const roomDisplay = roomPreset ? roomPreset.name : (node.roomId ? `SALA ID:${node.roomId}` : 'Sin Enlace');

              return (
                <div 
                  key={node.nodeId + '_' + node.frequency + '_' + node.callsign}
                  className="bg-slate-950/70 border border-slate-900 hover:border-slate-800 rounded-xl p-4.5 transition-all duration-200 flex flex-col justify-between gap-4.5 shadow-md relative group hover:shadow-xl hover:bg-slate-950"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Indicativo badge */}
                        <span className="font-mono text-xs font-black bg-slate-900 border border-slate-800 px-2 py-1 text-cyan-400 rounded-md uppercase tracking-wider shadow-inner">
                          {node.callsign}
                        </span>
                        {/* WiresX Indicator */}
                        <span className="text-[8px] font-mono font-black bg-red-950/30 text-red-400 border border-red-500/10 px-1 py-0.5 rounded tracking-wide uppercase">
                          WIRES-X
                        </span>
                        {/* Status Badge */}
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider font-mono shadow-inner ${
                          isNodeActive 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isNodeActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          {isNodeActive ? 'Activo' : 'Offline'}
                        </span>
                      </div>

                      {/* Favorite/Connect indicator */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 flex items-center gap-1 shadow-inner">
                          ID:{node.nodeId}
                        </span>
                      </div>
                    </div>

                    {/* Frequency Panel */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900/40 border border-slate-900 rounded-lg shadow-inner">
                      <div>
                        <span className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest">Frecuencia Nodo</span>
                        <span className="text-sm font-mono font-black text-slate-100 tracking-tight">
                          {node.frequency.toFixed(4)} <span className="text-[9px] font-normal text-slate-400">MHz</span>
                        </span>
                      </div>
                      <div className="border-l border-slate-900 pl-2">
                        <span className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest">Squelch / Cód. Acceso</span>
                        <span className="text-xs font-mono font-bold text-amber-400 tracking-tight block truncate mt-0.5">
                          {node.squelch}
                        </span>
                      </div>
                    </div>

                    {/* Operational Connected Room details */}
                    <div className="p-2.5 bg-slate-900/10 border border-dashed border-slate-900 rounded-lg flex items-center justify-between gap-2 text-xs">
                      <div className="flex flex-col gap-0.5 truncate">
                        <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest block">Sala Enlazada Activa</span>
                        <span className="font-sans font-bold text-slate-200 truncate flex items-center gap-1">
                          <Link size={10} className="text-cyan-500 shrink-0" />
                          {roomDisplay}
                        </span>
                      </div>
                      {node.roomId && (
                        <div className="shrink-0 flex items-center justify-center font-mono text-[9px] font-bold text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/10">
                          {node.roomId}
                        </div>
                      )}
                    </div>

                    {/* Geographic Location Indicator */}
                    <div className="pt-1 flex items-start justify-between gap-1.5 text-xs">
                      <div className="flex items-start gap-1.5">
                        <MapPin size={12} className="text-slate-500 mt-0.5 shrink-0" />
                        <div className="truncate">
                          <span className="text-slate-300 font-medium block leading-snug truncate">{node.city}</span>
                          <span className="text-[10px] text-slate-500 block leading-tight truncate">
                            {node.state} • <span className={isSpain ? 'text-slate-400' : 'text-slate-500'}>{isSpain ? 'España' : node.country}</span>
                          </span>
                        </div>
                      </div>
                      
                      {/* Distance badge */}
                      {typeof node.distance === 'number' && (
                        <div className="shrink-0 flex flex-col items-end">
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            node.distance < 50 ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/25' :
                            node.distance < 150 ? 'bg-amber-950/80 text-amber-400 border border-amber-500/25' :
                            'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}>
                            <Compass size={10} className="animate-spin-slow" />
                            {node.distance.toFixed(0)} km
                          </span>
                        </div>
                      )}
                    </div>

                    {node.comment && (
                      <p className="text-[9px] text-slate-600 italic font-sans leading-tight pt-1">
                        "{node.comment}"
                      </p>
                    )}
                  </div>

                  {/* Card Footer: Action button */}
                  <div className="pt-3 border-t border-slate-900/80 flex items-center justify-between gap-2">
                    <span className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                      node.squelch.toUpperCase().includes('DG-ID') ? 'bg-purple-950 text-purple-400 border border-purple-500/10' :
                      node.squelch.toUpperCase().includes('TONE') ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/10' :
                      node.squelch.toUpperCase().includes('DSQ') ? 'bg-orange-950 text-orange-400 border border-orange-500/10' :
                      'bg-slate-900 text-slate-400'
                    }`}>
                      {node.squelch.toUpperCase().includes('DG-ID') ? 'C4FM DIGITAL' : 'FM ANALÓGICO'}
                    </span>

                    <button
                      onClick={() => handleSintonizarWiresX(node)}
                      className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    >
                      <span>Sintonizar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QUICK TUTORIAL BANNER */}
      <div className="p-4 bg-slate-900/30 border border-slate-900 rounded-xl text-slate-400 text-[11px] leading-relaxed flex items-start gap-2.5">
        <HelpCircle size={15} className="text-slate-500 shrink-0 mt-0.5" />
        <p>
          <strong>Operativa de Enlaces WIRES-X (Yaesu System)</strong>: Sintonice su transceptor Yaesu C4FM (ej. FT-70, FTM-300, FT5D) en la frecuencia de salida del nodo. Para conectar en modo digital, active el modo C4FM, configure el <strong>DG-ID de transmisión</strong> indicado en la columna de Squelch/Cód. Acceso (por defecto, TX 00 / RX 00 o DG-ID específico) y presione la tecla <strong>[X] / [WIRES-X]</strong> de su radio. Su equipo transmitirá la señal de enlace para interconectar la estación local con la red global Yaesu de forma automática.
        </p>
      </div>
    </div>
  );
}
