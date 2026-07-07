import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, Radio, MapPin, Layers, Wifi, Volume2, Bookmark, BookmarkCheck, ArrowRightLeft, HelpCircle, Navigation, Compass, Sliders, Globe, Clipboard, Import, PlusCircle, Check, Database, Trash2, Link, Server, RefreshCw } from 'lucide-react';
import { REPEATERS_DATABASE, Repeater } from '../../data/repeaters';
import { WIRESX_NODES_DATABASE, WIRESX_ROOMS_PRESET, parseWiresXRawText, WiresXNode, WiresXRoom } from '../../data/wiresx';
import WiresXDatabaseView from './WiresXDatabaseView';
import WiresXRoomsDatabaseView from './WiresXRoomsDatabaseView';
import { GPSDStatus } from '../../types';

// Spanish autonomous communities/provinces coordinates lookup
const COMMUNITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "Andalucía": { lat: 37.54, lon: -4.72 },
  "Aragón": { lat: 41.35, lon: -0.85 },
  "Asturias": { lat: 43.36, lon: -5.85 },
  "Canarias": { lat: 28.29, lon: -16.62 },
  "Cantabria": { lat: 43.20, lon: -4.03 },
  "Castilla y León": { lat: 41.75, lon: -4.78 },
  "Castilla-La Mancha": { lat: 39.50, lon: -3.00 },
  "Catalunya": { lat: 41.82, lon: 1.86 },
  "Comunidad de Madrid": { lat: 40.4168, lon: -3.7038 },
  "Comunidad Valenciana": { lat: 39.48, lon: -0.75 },
  "Extremadura": { lat: 39.10, lon: -6.15 },
  "Galicia": { lat: 42.75, lon: -7.85 },
  "Illes Balears": { lat: 39.60, lon: 3.00 },
  "La Rioja": { lat: 42.28, lon: -2.50 },
  "Murcia": { lat: 37.99, lon: -1.13 },
  "Navarra": { lat: 42.61, lon: -1.60 },
  "País Vasco": { lat: 42.98, lon: -2.61 },
  "Ceuta": { lat: 35.8894, lon: -5.3198 },
  "Melilla": { lat: 35.2923, lon: -2.9381 }
};

// Estimate coordinates for WiresX nodes
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

// Location keywords lookup for higher precision
function estimateRepeaterCoords(rep: Repeater): { lat: number; lon: number } {
  const locUpper = rep.location.toUpperCase();
  
  if (locUpper.includes("GIJÓN") || locUpper.includes("GIJON") || locUpper.includes("SAN MARTÍN") || locUpper.includes("SAN MARTIN")) {
    return { lat: 43.5357, lon: -5.6615 };
  }
  if (locUpper.includes("ALICANTE") || locUpper.includes("CASTELLS")) {
    return { lat: 38.3452, lon: -0.4815 };
  }
  if (locUpper.includes("BARCELONA") || locUpper.includes("MONTJUIC") || locUpper.includes("MONTJUÏC") || locUpper.includes("ESPARREGUERA") || locUpper.includes("MONTSENY")) {
    return { lat: 41.3851, lon: 2.1734 };
  }
  if (locUpper.includes("ALCORCÓN") || locUpper.includes("ALCORCON") || locUpper.includes("MADRID") || locUpper.includes("ALTO DEL LEÓN") || locUpper.includes("ALTO DEL LEON")) {
    return { lat: 40.4168, lon: -3.7038 };
  }
  if (locUpper.includes("ZARAGOZA") || locUpper.includes("FRAGA") || locUpper.includes("CALATAYUD")) {
    return { lat: 41.6488, lon: -0.8891 };
  }
  if (locUpper.includes("VALENCIA") || locUpper.includes("ALTO DEL PINO") || locUpper.includes("FONT D'EN CARRÓS") || locUpper.includes("FONT D'EN CARROS")) {
    return { lat: 39.4699, lon: -0.3763 };
  }
  if (locUpper.includes("SEVILLA")) {
    return { lat: 37.3828, lon: -5.9903 };
  }
  if (locUpper.includes("MÁLAGA") || locUpper.includes("MALAGA")) {
    return { lat: 36.7213, lon: -4.4214 };
  }
  if (locUpper.includes("BILBAO") || locUpper.includes("VIZCAYA") || locUpper.includes("OIZ")) {
    return { lat: 43.2630, lon: -2.9350 };
  }
  if (locUpper.includes("SANTANDER") || locUpper.includes("IBIO")) {
    return { lat: 43.4623, lon: -3.8099 };
  }
  if (locUpper.includes("BADAJOZ")) {
    return { lat: 38.8794, lon: -6.9706 };
  }
  if (locUpper.includes("GRANADA") || locUpper.includes("VELETA")) {
    return { lat: 37.1773, lon: -3.5986 };
  }
  if (locUpper.includes("ALMERÍA") || locUpper.includes("ALMERIA")) {
    return { lat: 36.8340, lon: -2.4637 };
  }
  if (locUpper.includes("CÓRDOBA") || locUpper.includes("CORDOBA")) {
    return { lat: 37.8882, lon: -4.7794 };
  }
  if (locUpper.includes("HUELVA") || locUpper.includes("CRISTOBAL") || locUpper.includes("CRISTÓBAL")) {
    return { lat: 37.2614, lon: -6.9447 };
  }
  if (locUpper.includes("CÁDIZ") || locUpper.includes("CADIZ") || locUpper.includes("TARIFA")) {
    return { lat: 36.5271, lon: -6.2886 };
  }
  if (locUpper.includes("BURGOS") || locUpper.includes("TRIGAZA")) {
    return { lat: 42.3440, lon: -3.6969 };
  }
  if (locUpper.includes("LEÓN") || locUpper.includes("LEON") || locUpper.includes("BIERZO")) {
    return { lat: 42.5987, lon: -5.5671 };
  }
  if (locUpper.includes("SORIA") || locUpper.includes("ONCALA")) {
    return { lat: 41.7640, lon: -2.4688 };
  }
  if (locUpper.includes("SALAMANCA") || locUpper.includes("BÉJAR") || locUpper.includes("BEJAR") || locUpper.includes("COVATILLA")) {
    return { lat: 40.9701, lon: -5.6635 };
  }
  if (locUpper.includes("MURCIA") || locUpper.includes("MÚRCIA") || locUpper.includes("ESPUÑA") || locUpper.includes("CALVÁRIO") || locUpper.includes("CALVARIO") || locUpper.includes("AGUILAS") || locUpper.includes("ÁGUILAS")) {
    return { lat: 37.9922, lon: -1.1307 };
  }
  if (locUpper.includes("LUGO")) {
    return { lat: 43.0097, lon: -7.5568 };
  }
  if (locUpper.includes("OURENSE") || locUpper.includes("MEDA")) {
    return { lat: 42.3358, lon: -7.8639 };
  }
  if (locUpper.includes("PONTEVEDRA") || locUpper.includes("CANDÁN") || locUpper.includes("CANDAN")) {
    return { lat: 42.4310, lon: -8.6444 };
  }
  if (locUpper.includes("CORUÑA") || locUpper.includes("FEIXA")) {
    return { lat: 43.3623, lon: -8.4115 };
  }
  if (locUpper.includes("LANZAROTE") || locUpper.includes("CHACHE")) {
    return { lat: 29.0469, lon: -13.5900 };
  }
  if (locUpper.includes("GRAN CANARIA") || locUpper.includes("GORRA")) {
    return { lat: 27.9202, lon: -15.5474 };
  }
  if (locUpper.includes("TENERIFE")) {
    return { lat: 28.2916, lon: -16.6291 };
  }
  if (locUpper.includes("MENORCA") || locUpper.includes("TORO")) {
    return { lat: 39.9950, lon: 4.0750 };
  }
  if (locUpper.includes("IBIZA")) {
    return { lat: 38.9067, lon: 1.4206 };
  }
  if (locUpper.includes("MALLORCA") || locUpper.includes("ALFÁBIA") || locUpper.includes("ALFABIA")) {
    return { lat: 39.6953, lon: 3.0176 };
  }
  if (locUpper.includes("TOLEDO") || locUpper.includes("CRUCES")) {
    return { lat: 39.8628, lon: -4.0273 };
  }
  if (locUpper.includes("TERUEL") || locUpper.includes("JAVALAMBRE")) {
    return { lat: 40.3456, lon: -1.1065 };
  }
  if (locUpper.includes("GUIPÚZCOA") || locUpper.includes("GUIPUZCOA") || locUpper.includes("ANDATZA") || locUpper.includes("SAN SEBASTIÁN") || locUpper.includes("SAN SEBASTIAN")) {
    return { lat: 43.3183, lon: -1.9812 };
  }
  if (locUpper.includes("CUENCA") || locUpper.includes("ALMENARA")) {
    return { lat: 40.0704, lon: -2.1374 };
  }

  return COMMUNITY_COORDINATES[rep.county] || { lat: 40.4168, lon: -3.7038 };
}

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

interface SearchSuggestion {
  id: string;
  type: 'call' | 'freq' | 'loc';
  value: string;
  label: string;
  sublabel?: string;
}

interface RepeaterDatabaseViewProps {
  onInjectRaw?: (packet: string) => void;
  showToast?: (message: string) => void;
  gpsd?: GPSDStatus;
}

export default function RepeaterDatabaseView({ onInjectRaw, showToast, gpsd }: RepeaterDatabaseViewProps) {
  const [viewMode, setViewMode] = useState<'repeaters' | 'wiresx' | 'wiresx_rooms'>('repeaters');
  const [searchTerm, setSearchTerm] = useState('');
  const [instantFilterTerm, setInstantFilterTerm] = useState('');

  // Autocomplete suggestions states
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Generate unique dynamic suggestions based on REPEATERS_DATABASE
  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const query = searchTerm.trim().toLowerCase();
    if (query.length < 1) return [];

    const callSuggestions: SearchSuggestion[] = [];
    const freqSuggestions: SearchSuggestion[] = [];
    const locSuggestions: SearchSuggestion[] = [];

    const seenCalls = new Set<string>();
    const seenFreqs = new Set<string>();
    const seenLocs = new Set<string>();

    for (const rep of REPEATERS_DATABASE) {
      // 1. Callsign match
      const callUpper = rep.call.toUpperCase();
      if (callUpper.toLowerCase().includes(query) && !seenCalls.has(callUpper)) {
        seenCalls.add(callUpper);
        callSuggestions.push({
          id: `call-${callUpper}`,
          type: 'call',
          value: callUpper,
          label: callUpper,
          sublabel: `${rep.location} (${rep.county})`
        });
      }

      // 2. Frequency match
      const freqStr = rep.outputFreq.toFixed(3);
      const freqStrClean = rep.outputFreq.toString();
      if ((freqStr.includes(query) || freqStrClean.includes(query)) && !seenFreqs.has(freqStr)) {
        seenFreqs.add(freqStr);
        freqSuggestions.push({
          id: `freq-${freqStr}`,
          type: 'freq',
          value: freqStr,
          label: `${freqStr} MHz`,
          sublabel: `Repetidor en ${rep.location}`
        });
      }

      // 3. Location & County match
      const locLower = rep.location.toLowerCase();
      const countyLower = rep.county.toLowerCase();

      if (locLower.includes(query) && !seenLocs.has(rep.location)) {
        seenLocs.add(rep.location);
        locSuggestions.push({
          id: `loc-val-${rep.location}`,
          type: 'loc',
          value: rep.location,
          label: rep.location,
          sublabel: rep.county
        });
      }

      if (countyLower.includes(query) && !seenLocs.has(rep.county)) {
        seenLocs.add(rep.county);
        locSuggestions.push({
          id: `loc-county-${rep.county}`,
          type: 'loc',
          value: rep.county,
          label: rep.county,
          sublabel: 'Provincia / Comunidad'
        });
      }
    }

    // Return balanced mix of top 3 suggestions per category, max 8 in total
    return [
      ...callSuggestions.slice(0, 3),
      ...freqSuggestions.slice(0, 3),
      ...locSuggestions.slice(0, 3)
    ].slice(0, 8);
  }, [searchTerm]);

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    setSearchTerm(suggestion.value);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
    }
  };
  const [selectedBand, setSelectedBand] = useState<string>('ALL'); // ALL, 10M, 6M, VHF, UHF, 23CM
  const [selectedMode, setSelectedMode] = useState<string>('ALL'); // ALL, FM, DMR, DSTAR, Fusion, EchoLink
  const [selectedCounty, setSelectedCounty] = useState<string>('ALL'); // All provinces
  
  // Wires-X states
  const [wiresxSearchTerm, setWiresxSearchTerm] = useState('');
  const [selectedWiresXRoom, setSelectedWiresXRoom] = useState<string>('ALL');
  const [selectedWiresXCountry, setSelectedWiresXCountry] = useState<string>('ALL');
  const [isImporting, setIsImporting] = useState(false);
  const [rawImportText, setRawImportText] = useState('');
  const [wiresxNodes, setWiresxNodes] = useState<WiresXNode[]>(() => {
    try {
      const saved = localStorage.getItem('imported_wiresx_nodes');
      const parsed = saved ? JSON.parse(saved) : [];
      // Prevent duplicates
      const savedIds = new Set(parsed.map((n: WiresXNode) => n.nodeId));
      const filteredPresets = WIRESX_NODES_DATABASE.filter(n => !savedIds.has(n.nodeId));
      return [...filteredPresets, ...parsed];
    } catch {
      return WIRESX_NODES_DATABASE;
    }
  });

  // Proximity states
  const [isProximityActive, setIsProximityActive] = useState(true);
  const [useGpsdSync, setUseGpsdSync] = useState(true);
  const [userLat, setUserLat] = useState(40.4168);
  const [userLon, setUserLon] = useState(-3.7038);
  const [searchRadius, setSearchRadius] = useState(150); // km
  const [sortByProximity, setSortByProximity] = useState(true);

  // Synchronize coordinates with GPSD / Fixed Station
  useEffect(() => {
    if (useGpsdSync && gpsd && (gpsd.lat !== 0 || gpsd.lon !== 0)) {
      setUserLat(gpsd.lat);
      setUserLon(gpsd.lon);
    }
  }, [gpsd, useGpsdSync]);

  const [bookmarkedCalls, setBookmarkedCalls] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bookmarked_repeaters');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // WIRES-X Real-time status states
  const [activeNodesList, setActiveNodesList] = useState<string[]>([]);
  const [activeRoomsList, setActiveRoomsList] = useState<string[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);

  const fetchWiresXStatus = async (silent: boolean = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const res = await customFetch('/api/wiresx/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActiveNodesList(data.nodes || []);
          setActiveRoomsList(data.rooms || []);
          if (!silent && showToast) {
            showToast(`Estados de red sincronizados: ${data.nodes?.length || 0} nodos y ${data.rooms?.length || 0} salas de Yaesu verificadas.`);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching Wires-X real-time status:", err);
    } finally {
      if (!silent) setIsLoadingStatus(false);
    }
  };

  // Load last valid location on mount and retrieve active status
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
      console.error("Error reading lastValidLocation in RepeaterDatabaseView:", e);
    }

    // Initial status fetch
    fetchWiresXStatus(true);
    // Poll status every 3 minutes
    const statusInterval = setInterval(() => {
      fetchWiresXStatus(true);
    }, 3 * 60 * 1000);

    return () => clearInterval(statusInterval);
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const total = REPEATERS_DATABASE.length;
    const vhf = REPEATERS_DATABASE.filter(r => r.outputFreq >= 144 && r.outputFreq <= 148).length;
    const uhf = REPEATERS_DATABASE.filter(r => r.outputFreq >= 430 && r.outputFreq <= 440).length;
    const digital = REPEATERS_DATABASE.filter(r => r.modes.some(m => ['DMR', 'DSTAR', 'Fusion', 'NXDN'].includes(m.trim()))).length;
    const fm = REPEATERS_DATABASE.filter(r => r.modes.includes('FM') || r.modes.includes('FM ')).length;
    return { total, vhf, uhf, digital, fm };
  }, []);

  // List of unique counties (autonomous communities / provinces)
  const countiesList = useMemo(() => {
    const unique = new Set(REPEATERS_DATABASE.map(r => r.county).filter(Boolean));
    return ['ALL', ...Array.from(unique).sort()];
  }, []);

  // Filter and sort repeaters
  const filteredRepeaters = useMemo(() => {
    // Estimate distance for each repeater first
    const withDistance = REPEATERS_DATABASE.map(r => {
      const coords = estimateRepeaterCoords(r);
      const distance = calculateHaversineDistance(userLat, userLon, coords.lat, coords.lon);
      return { ...r, coords, distance };
    });

    const filtered = withDistance.filter(r => {
      // 1. Search term match
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = 
        r.call.toLowerCase().includes(searchLower) ||
        r.location.toLowerCase().includes(searchLower) ||
        r.county.toLowerCase().includes(searchLower) ||
        r.outputFreq.toString().includes(searchLower);

      // 2. Band match
      let matchBand = true;
      if (selectedBand === '10M') {
        matchBand = r.outputFreq >= 28 && r.outputFreq <= 30;
      } else if (selectedBand === '6M') {
        matchBand = r.outputFreq >= 50 && r.outputFreq <= 54;
      } else if (selectedBand === 'VHF') {
        matchBand = r.outputFreq >= 144 && r.outputFreq <= 148;
      } else if (selectedBand === 'UHF') {
        matchBand = r.outputFreq >= 430 && r.outputFreq <= 440;
      } else if (selectedBand === '23CM') {
        matchBand = r.outputFreq >= 1200;
      }

      // 3. Mode match
      let matchMode = true;
      if (selectedMode !== 'ALL') {
        matchMode = r.modes.some(m => m.trim().toUpperCase() === selectedMode.toUpperCase());
      }

      // 4. County match
      let matchCounty = true;
      if (selectedCounty !== 'ALL') {
        matchCounty = r.county === selectedCounty;
      }

      // 5. Proximity filter (if active)
      let matchProximity = true;
      if (isProximityActive) {
        matchProximity = r.distance <= searchRadius;
      }

      return matchSearch && matchBand && matchMode && matchCounty && matchProximity;
    });

    // Sort by proximity or by call sign/frequency if not active
    if (isProximityActive || sortByProximity) {
      return filtered.sort((a, b) => a.distance - b.distance);
    }
    return filtered;
  }, [searchTerm, selectedBand, selectedMode, selectedCounty, isProximityActive, userLat, userLon, searchRadius, sortByProximity]);

  // Real-time instant filtering by callsign or location
  const finalFilteredRepeaters = useMemo(() => {
    if (!instantFilterTerm.trim()) return filteredRepeaters;
    const term = instantFilterTerm.toLowerCase().trim();
    return filteredRepeaters.filter(r => 
      r.call.toLowerCase().includes(term) || 
      r.location.toLowerCase().includes(term) ||
      (r.county && r.county.toLowerCase().includes(term))
    );
  }, [filteredRepeaters, instantFilterTerm]);

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
    // Collect from presets and discover from nodes
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
        // Discovered room
        list.push({ roomId: id, name: `ROOM-${id}`, description: "Sala externa conectada" });
      }
    });

    // Sort by room name
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
      // 1. Search term match
      const sLower = wiresxSearchTerm.toLowerCase();
      const matchSearch =
        node.callsign.toLowerCase().includes(sLower) ||
        node.city.toLowerCase().includes(sLower) ||
        node.state.toLowerCase().includes(sLower) ||
        node.country.toLowerCase().includes(sLower) ||
        node.nodeId.includes(sLower) ||
        (node.roomId && node.roomId.includes(sLower));

      // 2. Room match
      let matchRoom = true;
      if (selectedWiresXRoom !== 'ALL') {
        matchRoom = node.roomId === selectedWiresXRoom;
      }

      // 3. Country match
      let matchCountry = true;
      if (selectedWiresXCountry !== 'ALL') {
        matchCountry = node.country === selectedWiresXCountry;
      }

      // 4. Proximity match
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

      // Load existing imported ones
      const saved = localStorage.getItem('imported_wiresx_nodes');
      const existingImported: WiresXNode[] = saved ? JSON.parse(saved) : [];
      
      // Combine and remove duplicates based on nodeId
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
      
      // Update state
      const savedIds = new Set(combined.map(n => n.nodeId));
      const filteredPresets = WIRESX_NODES_DATABASE.filter(n => !savedIds.has(n.nodeId));
      setWiresxNodes([...filteredPresets, ...combined]);
      
      setRawImportText('');
      setIsImporting(false);
      
      if (showToast) {
        showToast(`🎉 ¡Éxito! Se han importado ${addedCount} nodos Wires-X activos adicionales.`);
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

  const toggleBookmark = (call: string) => {
    setBookmarkedCalls(prev => {
      const next = prev.includes(call) ? prev.filter(c => c !== call) : [...prev, call];
      localStorage.setItem('bookmarked_repeaters', JSON.stringify(next));
      if (showToast) {
        showToast(next.includes(call) ? `Repetidor ${call} guardado en favoritos.` : `Repetidor ${call} eliminado de favoritos.`);
      }
      return next;
    });
  };

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
        setUseGpsdSync(false);
        if (showToast) showToast(`📍 Ubicación GPS obtenida: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
        localStorage.setItem('lastValidLocation', JSON.stringify({ lat, lon, timestamp: Date.now() }));
      },
      (error) => {
        console.error(error);
        if (showToast) showToast(`⚠️ Error de geolocalización: ${error.message}. Seleccione un preajuste.`);
      }
    );
  };

  // Sintonizar repetidor (Play a nice sound / show toast)
  const handleSintonizar = (rep: Repeater) => {
    if (showToast) {
      showToast(`📟 Sintonizando transceptor en ${rep.outputFreq.toFixed(4)} MHz (${rep.call}). Offset: ${(rep.outputFreq - rep.inputFreq).toFixed(3)} MHz`);
    }

    // Try playing a brief beep or synthesized sound as tactical audio feedback
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz tone
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      // Audio context might be blocked or not supported in this frame, ignore
    }

    // Optionally inject an APRS report if callback exists
    if (onInjectRaw) {
      const packet = `${rep.call}>APRS,TCPIP*,qAC,REPEATER:;${rep.call.padEnd(9)}*111111z${rep.outputFreq.toFixed(3)}MHz T${rep.uplinkTone || '000'} - ${rep.location.substring(0, 20)}`;
      onInjectRaw(packet);
    }
  };

  const handleSintonizarWiresX = (node: WiresXNode) => {
    if (showToast) {
      showToast(`🌐 WIRES-X: Sintonizando frecuencia de nodo ${node.frequency.toFixed(4)} MHz (${node.callsign}). Squelch: ${node.squelch}`);
    }

    // Play a dual-tone or special chime representing a digital link connect!
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitched dual chime
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1109, audioCtx.currentTime);
      
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
      
      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.5);
      osc2.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio context might be blocked, ignore
    }

    if (onInjectRaw) {
      const packet = `${node.callsign}>APRS,TCPIP*,qAC,WIRESX:;${node.callsign.padEnd(9)}*111111z${node.frequency.toFixed(3)}MHz WX NodeID:${node.nodeId} Room:${node.roomId}`;
      onInjectRaw(packet);
    }
  };

  return (
    <div className="flex flex-col gap-6" id="repeater-database-container">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-900/60 border border-slate-800 rounded-2xl relative overflow-hidden shadow-2xl">
        <div className={`absolute top-0 right-0 w-32 h-32 ${viewMode === 'wiresx' ? 'bg-cyan-500/5' : viewMode === 'wiresx_rooms' ? 'bg-indigo-500/5' : 'bg-emerald-500/5'} rounded-full blur-2xl pointer-events-none`} />
        <div className="space-y-1.5 z-10 flex-1">
          <div className="flex items-center gap-2">
            {viewMode === 'wiresx' ? (
              <>
                <Globe className="text-cyan-400 animate-pulse" size={20} />
                <h2 className="font-sans font-extrabold text-lg text-slate-100 tracking-wide uppercase">
                  Base de Datos de Nodos Activos WIRES-X (Yaesu C4FM)
                </h2>
              </>
            ) : viewMode === 'wiresx_rooms' ? (
              <>
                <Server className="text-indigo-400 animate-pulse" size={20} />
                <h2 className="font-sans font-extrabold text-lg text-slate-100 tracking-wide uppercase">
                  Directorio de Salas WIRES-X Activas (Yaesu C4FM)
                </h2>
              </>
            ) : (
              <>
                <Radio className="text-emerald-400 animate-pulse" size={20} />
                <h2 className="font-sans font-extrabold text-lg text-slate-100 tracking-wide uppercase">
                  Vademecum de Repetidores de Radioafición (REMER / IARU)
                </h2>
              </>
            )}
          </div>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            {viewMode === 'wiresx' ? (
              <>
                Consulte el listado de nodos activos de la red global de voz digital <strong>Yaesu WIRES-X</strong> sincronizados con la fuente de datos oficial. Estos repetidores C4FM e interfaces de nodo le permiten realizar comunicados locales e interconectarse con salas nacionales e internacionales de radioafición de forma digital.
              </>
            ) : viewMode === 'wiresx_rooms' ? (
              <>
                Consulte el listado de salas de conferencia de la red global <strong>Yaesu WIRES-X</strong> sincronizadas con la fuente de datos oficial. Estas salas virtuales agrupan múltiples nodos y repetidores de todo el mundo para conversaciones colectivas organizadas por zonas geográficas o idiomas.
              </>
            ) : (
              <>
                Consulte la base de datos nacional de repetidores analógicos y digitales (VHF, UHF, SHF, 10m y 6m) operativos en España. Filtre por ubicación, frecuencia o modo operativo para planificar enlaces alternativos de emergencia o coordinar redes de Protección Civil.
              </>
            )}
          </p>
        </div>

        {/* View mode toggle selector and verification buttons inside the header for pristine layout */}
        <div className="flex flex-col sm:flex-row items-center gap-3.5 self-start md:self-center z-10">
          {/* Active stats display */}
          <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-slate-950/60 border border-slate-900 rounded-xl text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Nodos Yaesu: <strong className="text-slate-200">{activeNodesList.length || '...'}</strong>
            </span>
            <span className="text-slate-800">|</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
              Salas: <strong className="text-slate-200">{activeRoomsList.length || '...'}</strong>
            </span>
          </div>

          <button
            onClick={() => fetchWiresXStatus()}
            disabled={isLoadingStatus}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 disabled:opacity-50 text-[10px] text-slate-300 hover:text-slate-100 rounded-xl font-bold transition-all uppercase tracking-wider cursor-pointer shadow-md shrink-0 h-[34px]"
            title="Sincronizar estados en tiempo real desde Yaesu"
          >
            <RefreshCw size={11} className={isLoadingStatus ? 'animate-spin text-cyan-400' : 'text-slate-400'} />
            {isLoadingStatus ? 'Verificando...' : 'Verificar Red'}
          </button>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900/80 shrink-0 shadow-inner">
            <button
              onClick={() => setViewMode('repeaters')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer ${
                viewMode === 'repeaters'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio size={12} />
              Repetidores
            </button>
            <button
              onClick={() => setViewMode('wiresx')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer ${
                viewMode === 'wiresx'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe size={12} />
              Nodos WIRES-X
            </button>
            <button
              onClick={() => setViewMode('wiresx_rooms')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer ${
                viewMode === 'wiresx_rooms'
                  ? 'bg-indigo-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server size={12} />
              Salas WIRES-X
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'repeaters' ? (
        <>
          {/* STATS STRIP */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Total Repetidores</span>
          <span className="text-xl font-sans font-black text-slate-100">{stats.total}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Banda VHF</span>
          <span className="text-xl font-sans font-black text-emerald-400">{stats.vhf} <span className="text-xs font-normal text-slate-500">2m</span></span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Banda UHF</span>
          <span className="text-xl font-sans font-black text-cyan-400">{stats.uhf} <span className="text-xs font-normal text-slate-500">70cm</span></span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Sistemas Digitales</span>
          <span className="text-xl font-sans font-black text-amber-400">{stats.digital} <span className="text-[9px] font-bold text-slate-500 bg-slate-900 px-1 py-0.5 rounded ml-1">DMR/D*</span></span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Modulación FM</span>
          <span className="text-xl font-sans font-black text-indigo-400">{stats.fm} <span className="text-xs font-normal text-slate-500">Analg</span></span>
        </div>
      </div>

      {/* SEARCH AND FILTERS PANEL */}
      <div className="bg-slate-950/80 border border-slate-900 p-4.5 rounded-xl space-y-4 shadow-lg">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Text Search Input with Dynamic Autocomplete */}
          <div className="relative flex-1" ref={suggestionsRef}>
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar por indicativo, ubicación o frecuencia (ej. ED3Y, Gijón, 145.650)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSuggestions(true);
                setActiveSuggestionIndex(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/30 transition-all font-sans"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setShowSuggestions(false);
                  setActiveSuggestionIndex(-1);
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 text-xs"
              >
                Limpiar
              </button>
            )}

            {/* Floating Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-950/95 border border-slate-800 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md z-50 max-h-72 overflow-y-auto divide-y divide-slate-900/60">
                {suggestions.map((suggestion, index) => {
                  const isActive = index === activeSuggestionIndex;
                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => selectSuggestion(suggestion)}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      className={`w-full flex items-center justify-between text-left px-3.5 py-2.5 text-xs transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-slate-900 text-slate-100 border-l-2 border-emerald-500 pl-[12px]' 
                          : 'text-slate-300 hover:bg-slate-900/50 hover:text-slate-200 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`p-1.5 rounded-lg shrink-0 ${
                          suggestion.type === 'call' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : suggestion.type === 'freq' 
                              ? 'bg-cyan-500/10 text-cyan-400' 
                              : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {suggestion.type === 'call' && <Radio size={12} />}
                          {suggestion.type === 'freq' && <Wifi size={12} />}
                          {suggestion.type === 'loc' && <MapPin size={12} />}
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold tracking-wide font-sans text-slate-100 block">
                            {suggestion.label}
                          </span>
                          {suggestion.sublabel && (
                            <span className="text-[10px] text-slate-400 block truncate font-mono mt-0.5">
                              {suggestion.sublabel}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <span className={`text-[8px] font-mono font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shadow-inner shrink-0 ${
                        suggestion.type === 'call'
                          ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'
                          : suggestion.type === 'freq'
                            ? 'bg-cyan-500/5 text-cyan-400 border-cyan-500/10'
                            : 'bg-amber-500/5 text-amber-400 border-amber-500/10'
                      }`}>
                        {suggestion.type === 'call' ? 'Indicativo' : suggestion.type === 'freq' ? 'Frecuencia' : 'Ubicación'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Location / Province Filter */}
          <div className="relative w-full lg:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <MapPin size={14} />
            </span>
            <select
              value={selectedCounty}
              onChange={(e) => setSelectedCounty(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/70 cursor-pointer appearance-none"
            >
              <option value="ALL">Todas las Provincias ({countiesList.length - 1})</option>
              {countiesList.filter(c => c !== 'ALL').map(county => (
                <option key={county} value={county}>{county}</option>
              ))}
            </select>
          </div>
        </div>

        {/* PROXIMITY FILTER SECTION */}
        <div className="border-t border-slate-900/80 pt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsProximityActive(!isProximityActive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                isProximityActive 
                  ? 'bg-emerald-500/25 border border-emerald-500/45 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-extrabold' 
                  : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700/80'
              }`}
            >
              <Navigation size={13} className={isProximityActive ? 'animate-pulse text-emerald-400' : ''} />
              <span>{isProximityActive ? 'Filtro de Proximidad ACTIVO' : 'Aplicar Filtro de Proximidad GPS'}</span>
            </button>

            {isProximityActive && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortByProximity(!sortByProximity)}
                  className={`text-[10px] font-mono px-2 py-1 rounded transition-colors border ${
                    sortByProximity 
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' 
                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
                  }`}
                  title="Ordenar resultados de más cercano a más lejano"
                >
                  Ordenar: {sortByProximity ? 'Más Cercanos' : 'Por Defecto'}
                </button>
                <button
                  onClick={handleGetBrowserLocation}
                  className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 hover:bg-emerald-900/40 px-2 py-1 rounded transition-colors"
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
                  <span className="text-emerald-400 font-bold">{searchRadius} km</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="1000"
                  step="10"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(Number(e.target.value))}
                  className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-emerald-400"
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
                    onChange={(e) => {
                      setUserLat(Number(e.target.value));
                      setUseGpsdSync(false);
                    }}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-[9px] font-mono uppercase text-slate-500">Longitud</span>
                  <input
                    type="number"
                    value={userLon}
                    step="0.0001"
                    onChange={(e) => {
                      setUserLon(Number(e.target.value));
                      setUseGpsdSync(false);
                    }}
                    className="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>
              </div>

              {/* Location presets */}
              <div className="md:col-span-3 flex flex-col gap-1">
                <span className="text-[9px] font-mono uppercase text-slate-500">Ubicación de Referencia</span>
                <select
                  value={useGpsdSync ? "gpsd" : ""}
                  onChange={(e) => {
                    if (e.target.value === "gpsd") {
                      setUseGpsdSync(true);
                      if (gpsd && (gpsd.lat !== 0 || gpsd.lon !== 0)) {
                        setUserLat(gpsd.lat);
                        setUserLon(gpsd.lon);
                      }
                      if (showToast) showToast("📡 Sincronizado con GPSD / Coordenadas fijas de la estación.");
                    } else {
                      const preset = PRESET_LOCATIONS.find(p => p.name === e.target.value);
                      if (preset) {
                        setUserLat(preset.lat);
                        setUserLon(preset.lon);
                        setUseGpsdSync(false);
                        if (showToast) showToast(`📍 Ubicación sintonizada en: ${preset.name}`);
                      } else {
                        setUseGpsdSync(false);
                      }
                    }
                  }}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 cursor-pointer h-7"
                >
                  <option value="gpsd">Estación (GPSD / Fija)</option>
                  <option value="">Personalizada / GPS de Navegador</option>
                  {PRESET_LOCATIONS.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status indicator line */}
              <div className="col-span-1 md:col-span-12 flex items-center gap-1.5 px-2 py-1 bg-slate-900/40 rounded-lg border border-slate-900/60 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${useGpsdSync ? (gpsd?.isFallback ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-blue-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${useGpsdSync ? (gpsd?.isFallback ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-blue-500'}`}></span>
                </span>
                <span className="text-[9.5px] font-mono text-slate-400">
                  {useGpsdSync ? (
                    gpsd?.isFallback ? (
                      <>
                        <span className="text-amber-400 font-bold">COORDENADAS FIJAS:</span> Sincronizado con la estación principal (<span className="text-slate-300">QTH: {gpsd.lat.toFixed(4)}°, {gpsd.lon.toFixed(4)}°</span>)
                      </>
                    ) : (
                      <>
                        <span className="text-emerald-400 font-bold">SISTEMA GPSD:</span> Sincronizado en vivo con receptor GPS (<span className="text-slate-300">QTH: {gpsd?.lat.toFixed(4)}°, {gpsd?.lon.toFixed(4)}°</span>)
                      </>
                    )
                  ) : (
                    <>
                      <span className="text-blue-400 font-bold">QTH MANUAL:</span> Coordenadas personalizadas o del navegador web (<span className="text-slate-300">{userLat.toFixed(4)}°, {userLon.toFixed(4)}°</span>)
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Filter Pill Rows */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-900">
          {/* Bands filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase mr-1.5 flex items-center gap-1">
              <Layers size={11} /> Banda:
            </span>
            {[
              { id: 'ALL', label: 'Todas' },
              { id: '10M', label: '29 MHz (10m)' },
              { id: '6M', label: '51 MHz (6m)' },
              { id: 'VHF', label: 'VHF (2m)' },
              { id: 'UHF', label: 'UHF (70cm)' },
              { id: '23CM', label: '1.2 GHz (23cm)' },
            ].map(band => (
              <button
                key={band.id}
                onClick={() => setSelectedBand(band.id)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                  selectedBand === band.id
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                {band.label}
              </button>
            ))}
          </div>

          {/* Modes filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase mr-1.5 flex items-center gap-1">
              <Wifi size={11} /> Modo:
            </span>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'FM', label: 'FM analógico' },
              { id: 'DMR', label: 'DMR digital' },
              { id: 'DSTAR', label: 'D-Star' },
              { id: 'Fusion', label: 'C4FM / Yaesu Fusion' },
              { id: 'EchoLink', label: 'EchoLink' },
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                  selectedMode === mode.id
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN RESULT GRID */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-900/60 shadow-inner">
          <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px] uppercase tracking-wider">
            <span>Resultados: <strong className="text-slate-200">{finalFilteredRepeaters.length}</strong> {instantFilterTerm ? 'coincidencias' : 'repetidores'}</span>
            {instantFilterTerm && (
              <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/45 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Filtro activo
              </span>
            )}
            {bookmarkedCalls.length > 0 && (
              <span className="border-l border-slate-800 pl-2">Favoritos: <strong className="text-emerald-400">{bookmarkedCalls.length}</strong></span>
            )}
          </div>

          {/* Instant Search Bar */}
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-500">
              <Filter size={11} className={instantFilterTerm ? "text-emerald-400 animate-pulse" : ""} />
            </span>
            <input
              type="text"
              placeholder="Filtro rápido (indicativo o ubicación)..."
              value={instantFilterTerm}
              onChange={(e) => setInstantFilterTerm(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/10 font-mono transition-all"
            />
            {instantFilterTerm && (
              <button
                onClick={() => setInstantFilterTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-500 hover:text-slate-300 text-xs font-bold cursor-pointer"
                title="Limpiar filtro"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {finalFilteredRepeaters.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
            <HelpCircle size={32} className="mx-auto text-slate-600 mb-2.5" />
            <h4 className="text-xs font-bold text-slate-300 uppercase">Sin resultados en la base de datos</h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              No se han encontrado repetidores que cumplan con los filtros establecidos o términos de búsqueda instantánea. Pruebe a flexibilizar sus términos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {finalFilteredRepeaters.map((rep) => {
              const isBookmarked = bookmarkedCalls.includes(rep.call);
              const frequencyOffset = rep.outputFreq - rep.inputFreq;
              const hasTone = rep.uplinkTone && rep.uplinkTone !== '';
              const isVhf = rep.outputFreq >= 144 && rep.outputFreq <= 148;
              const isUhf = rep.outputFreq >= 430 && rep.outputFreq <= 440;
              const isFusion = rep.modes.some(m => m.toUpperCase().includes('FUSION') || m.toUpperCase().includes('C4FM'));
              const isNodeActive = activeNodesList.some(nodeCall => {
                const cleanNode = nodeCall.toUpperCase().trim();
                const cleanRep = rep.call.toUpperCase().trim();
                return cleanNode === cleanRep || cleanNode.startsWith(cleanRep + '-') || cleanRep.startsWith(cleanNode + '-');
              });

              return (
                <div 
                  key={rep.call + '_' + rep.outputFreq}
                  className="bg-slate-950/70 border border-slate-900 hover:border-slate-800 rounded-xl p-4.5 transition-all duration-200 flex flex-col justify-between gap-4.5 shadow-md relative group hover:shadow-xl hover:bg-slate-950"
                >
                  {/* Card Header Info */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Indicativo badge */}
                        <span className="font-mono text-xs font-black bg-slate-900 border border-slate-800 px-2 py-1 text-emerald-400 rounded-md uppercase tracking-wider shadow-inner">
                          {rep.call}
                        </span>
                        {/* Band Badge */}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                          isVhf ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/10' :
                          isUhf ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/10' :
                          'bg-indigo-950/40 text-indigo-300 border border-indigo-500/10'
                        }`}>
                          {isVhf ? '2M VHF' : isUhf ? '70CM UHF' : rep.outputFreq > 1000 ? '23CM SHF' : 'HF/6M'}
                        </span>
                        {/* Real-time Status Badge */}
                        {isNodeActive ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Activo
                          </span>
                        ) : isFusion ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-inner">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Offline
                          </span>
                        ) : null}
                      </div>

                      {/* Favorite Bookmark and Listen */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleBookmark(rep.call)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-900 transition-colors cursor-pointer"
                          title="Añadir a favoritos de la estación"
                        >
                          {isBookmarked ? (
                            <BookmarkCheck size={14} className="text-amber-400" />
                          ) : (
                            <Bookmark size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => handleSintonizar(rep)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-slate-900 transition-colors cursor-pointer"
                          title="Sintonizar transceptor"
                        >
                          <Volume2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Frequencies panel */}
                    <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900/40 border border-slate-900 rounded-lg shadow-inner">
                      <div>
                        <span className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest">Frec. Salida (RX)</span>
                        <span className="text-sm font-mono font-black text-slate-100 tracking-tight">
                          {rep.outputFreq.toFixed(4)} <span className="text-[9px] font-normal text-slate-400">MHz</span>
                        </span>
                      </div>
                      <div className="border-l border-slate-900 pl-2">
                        <span className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest">Frec. Entrada (TX)</span>
                        <span className="text-sm font-mono font-bold text-slate-300 tracking-tight">
                          {rep.inputFreq.toFixed(4)} <span className="text-[9px] font-normal text-slate-500">MHz</span>
                        </span>
                      </div>
                    </div>

                    {/* Operational Details Grid */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div className="flex flex-col">
                        <span className="text-slate-500 font-mono uppercase text-[8px] tracking-widest">Offset / Desplazamiento</span>
                        <span className="font-mono text-slate-300 font-bold">
                          {frequencyOffset === 0 ? 'Sin desplazamiento (Simplex)' : `${frequencyOffset > 0 ? '+' : ''}${frequencyOffset.toFixed(3)} MHz`}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-slate-500 font-mono uppercase text-[8px] tracking-widest">Subtono de Guarda</span>
                        <span className="font-mono text-amber-400 font-bold flex items-center gap-1">
                          {hasTone ? (
                            <>
                              <ArrowRightLeft size={10} className="text-amber-500" />
                              {rep.uplinkTone} Hz {rep.downlinkTone ? `/ ${rep.downlinkTone} Hz` : ''}
                            </>
                          ) : (
                            <span className="text-slate-600">Portadora directa</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Geographic Location Indicator */}
                    <div className="pt-1.5 flex items-start justify-between gap-1.5 text-xs">
                      <div className="flex items-start gap-1.5">
                        <MapPin size={12} className="text-slate-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-slate-300 font-medium block leading-snug">{rep.location}</span>
                          <span className="text-[10px] text-slate-500 block leading-tight">{rep.county} • {rep.state}</span>
                        </div>
                      </div>
                      
                      {/* Distance badge */}
                      {typeof rep.distance === 'number' && (
                        <div className="shrink-0 flex flex-col items-end">
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            rep.distance < 50 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/25' :
                            rep.distance < 150 ? 'bg-amber-950/80 text-amber-400 border border-amber-500/25' :
                            'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}>
                            <Compass size={10} className="animate-spin-slow" />
                            {rep.distance.toFixed(0)} km
                          </span>
                          <span className="text-[8px] font-mono text-slate-600 mt-0.5">
                            {rep.distance < 50 ? 'Cobertura Directa' :
                             rep.distance < 150 ? 'Cobertura Media' : 'Cobertura Distante'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Active Modulation Modes and Tune button */}
                  <div className="pt-3 border-t border-slate-900/80 flex items-center justify-between gap-2">
                    {/* Mode indicators */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {rep.modes.map((mode, idx) => {
                        const m = mode.trim();
                        const isDigital = ['DMR', 'DSTAR', 'Fusion', 'NXDN', 'D-STAR'].includes(m.toUpperCase());
                        return (
                          <span 
                            key={m + idx}
                            className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                              m.toUpperCase() === 'FM' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/10' :
                              m.toUpperCase() === 'DMR' ? 'bg-orange-950 text-orange-400 border border-orange-500/10' :
                              m.toUpperCase() === 'DSTAR' || m.toUpperCase() === 'D-STAR' ? 'bg-blue-950 text-blue-400 border border-blue-500/10' :
                              m.toUpperCase() === 'FUSION' || m.toUpperCase() === 'C4FM' ? 'bg-purple-950 text-purple-400 border border-purple-500/10' :
                              m.toUpperCase() === 'ECHOLINK' ? 'bg-teal-950 text-teal-400 border border-teal-500/10' :
                              'bg-slate-900 text-slate-400'
                            }`}
                          >
                            {m}
                          </span>
                        );
                      })}
                      {rep.digitalAccess && (
                        <span className="text-[8px] bg-slate-900 text-yellow-500 font-mono px-1 py-0.2 rounded font-bold border border-yellow-500/10">
                          CC:{rep.digitalAccess}
                        </span>
                      )}
                    </div>

                    {/* Tactical Tune Action button */}
                    <button
                      onClick={() => handleSintonizar(rep)}
                      className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
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
              <strong>Instrucciones Operativas del Transceptor S.A.T.</strong>: Para operar a través de un repetidor, configure su equipo de radioaficionado en la frecuencia de salida descrita (que será su frecuencia de recepción, RX) y active la desviación de frecuencia (Offset) indicada para transmitir. Si el repetidor exige subtono, active el codificador CTCSS de su radio con el tono correspondiente para abrir el silenciador del receptor analógico remoto.
            </p>
          </div>
        </>
      ) : viewMode === 'wiresx' ? (
        <WiresXDatabaseView 
          onInjectRaw={onInjectRaw} 
          showToast={showToast} 
          activeNodesList={activeNodesList} 
          isLoadingStatus={isLoadingStatus}
          onRefreshStatus={fetchWiresXStatus}
        />
      ) : (
        <WiresXRoomsDatabaseView 
          onInjectRaw={onInjectRaw} 
          showToast={showToast} 
          activeRoomsList={activeRoomsList} 
          isLoadingStatus={isLoadingStatus}
          onRefreshStatus={fetchWiresXStatus}
        />
      )}
    </div>
  );
}
