import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Flame, Globe, ShieldAlert, Radio, AlertTriangle, RefreshCw, 
  MapPin, Activity, Plus, Search, Megaphone, ExternalLink, FileText, Send, Check, Trash2, ShieldCheck, Cpu, Locate, Settings
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { WildfireHotspot, RegionalFireRisk, GPSDStatus, TelemetryConfig } from '../../types';
import { getBeaufortInfoByKts } from '../../utils/beaufort';

interface PopulatedArea {
  id: string;
  name: string;
  lat: number;
  lon: number;
  population: number;
  province: string;
}

const DEFAULT_POPULATED_AREAS: PopulatedArea[] = [
  { id: 'aprs-main', name: 'Estación APRS Principal (EA1URG-13)', lat: 40.416775, lon: -3.703790, population: 1, province: 'Estación Fija' },
  { id: '1', name: 'Madrid (Villa)', lat: 40.4168, lon: -3.7038, population: 3300000, province: 'Madrid' },
  { id: '2', name: 'Cáceres Capital', lat: 39.4764, lon: -6.3722, population: 96000, province: 'Cáceres' },
  { id: '3', name: 'S.C. de Tenerife', lat: 28.4636, lon: -16.2518, population: 204000, province: 'Tenerife' },
  { id: '4', name: 'Ourense (Casco)', lat: 42.3358, lon: -7.8639, population: 105000, province: 'Ourense' },
  { id: '5', name: 'Ponferrada (Bierzo)', lat: 42.5467, lon: -6.5962, population: 65000, province: 'León' },
  { id: '6', name: 'Málaga (Costa)', lat: 36.7213, lon: -4.4214, population: 578000, province: 'Málaga' },
  { id: '7', name: 'Teruel (Serranía)', lat: 40.3456, lon: -1.1065, population: 35000, province: 'Teruel' }
];

const CustomThreatTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const distanceStr = data.rawDist !== null ? `${data.rawDist.toFixed(1)} km` : 'Muy Seguro (> 150 km)';
    return (
      <div className="bg-[#0b0500] border border-[#ff4500]/30 p-2.5 rounded shadow-2xl space-y-1 font-mono text-[10px]">
        <p className="font-sans font-extrabold text-[#ff8c42] uppercase tracking-wide">{data.name}</p>
        <p className="text-stone-300">
          <span className="text-stone-550">DISTANCIA AL FUEGO:</span>{' '}
          <span className={data.rawDist !== null && data.rawDist < 30 ? 'text-red-400 font-extrabold animate-pulse' : 'text-stone-300 font-bold'}>
            {distanceStr}
          </span>
        </p>
        {data.rawDist !== null && (
          <p className="text-stone-300">
            <span className="text-stone-550">INTENSIDAD FOCO más Cercano:</span>{' '}
            <span className="text-orange-500 font-extrabold">{data.frp} MW</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

interface CopernicusAlert {
  title: string;
  link: string;
  content: string;
  date: string;
}

interface IncendiosEspanaFeedItem {
  title: string;
  content: string;
  source: string;
  time: string;
}

interface WildfireMonitorResponse {
  success: boolean;
  timestamp: string;
  isMock: boolean;
  hasFetchError: boolean;
  fetchErrors: string[];
  hotspotsCount: number;
  hotspots: WildfireHotspot[];
  regionalRisks: RegionalFireRisk[];
  copernicusAlerts: CopernicusAlert[];
  incendiosEspanaFeed: IncendiosEspanaFeedItem[];
}

interface WildfireMonitorProps {
  gpsd?: GPSDStatus;
  config?: TelemetryConfig;
}

export default function WildfireMonitor({ gpsd, config }: WildfireMonitorProps = {}) {
  const [data, setData] = useState<WildfireMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [autoUpdate, setAutoUpdate] = useState(true);

  // Filters & Selected hot spots
  const [selectedPeriod, setSelectedPeriod] = useState<'1' | '2' | '3'>('1');
  const [selectedConfidence, setSelectedConfidence] = useState<'all' | 'med' | 'high'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mapLayer, setMapLayer] = useState<'termico' | 'topografico' | 'satelite'>('termico');
  const [selectedHotspot, setSelectedHotspot] = useState<WildfireHotspot | null>(null);

  // Accordion state for provinces
  const [openGroups, setOpenGroups] = useState<{ [key: string]: boolean }>({
    'Andalucía': true,
    'Galicia': true,
    'Canarias': true,
    'Comunidad Valenciana': true,
    'Castilla y León': true,
    'Cataluña': true,
    'Extremadura': true,
    'Otras Regiones': false
  });

  // Custom simulation injector states
  const [injLat, setInjLat] = useState('40.4168');
  const [injLon, setInjLon] = useState('-3.7038');
  const [injRegion, setInjRegion] = useState('Madrid (Parque Regional)');
  const [injFrp, setInjFrp] = useState('140');
  const [injDanger, setInjDanger] = useState<'Bajo' | 'Moderado' | 'Alto' | 'Extremo'>('Alto');
  const [injecting, setInjecting] = useState(false);

  // Fire Risk Calculator State Variables
  const [calcTemp, setCalcTemp] = useState<number>(34);
  const [calcHum, setCalcHum] = useState<number>(22);
  const [calcWind, setCalcWind] = useState<number>(25);
  const [calcRainlessDays, setCalcRainlessDays] = useState<number>(12);
  const [calcFuelType, setCalcFuelType] = useState<string>('matorral_seco');

  const computedRisk = useMemo(() => {
    // FFMC calculation proxy
    const ffmc = Math.max(5, Math.min(99, 101 - calcHum * 0.75 - calcRainlessDays * 0.35 + (calcTemp - 20) * 0.15));
    // Initial Spread Index (ISI) proxy
    const isi = Math.max(1, Math.min(100, Math.floor(((calcWind * 1.6) + (100 - ffmc) * 0.9) / 2.2)));
    
    // Adjust spread based on fuel type factor
    let fuelFactor = 1.0;
    let fuelLabel = 'Matorral mediterráneo inflamable';
    if (calcFuelType === 'pinar') { fuelFactor = 1.25; fuelLabel = 'Pinar de pino carrasco (alta carga de piñas)'; }
    else if (calcFuelType === 'matorral_seco') { fuelFactor = 1.4; fuelLabel = 'Garriga y matorral seco continental'; }
    else if (calcFuelType === 'eucaliptal') { fuelFactor = 1.35; fuelLabel = 'Eucaliptal racheado (desprendimiento de cortezas)'; }
    else if (calcFuelType === 'pasto') { fuelFactor = 1.5; fuelLabel = 'Pastizal agostado fino'; }
    else if (calcFuelType === 'frondosas') { fuelFactor = 0.7; fuelLabel = 'Bosque húmedo de frondosas (menor inflamabilidad)'; }

    const rawFwi = (isi * 1.3 + (calcTemp * 0.9) + (calcRainlessDays * 1.2)) * 0.55 * fuelFactor;
    const fwi = Math.max(1, Math.min(100, Math.round(rawFwi)));

    let riskLabel: 'Bajo' | 'Moderado' | 'Alto' | 'Muy Alto' | 'Extremo' = 'Bajo';
    let riskColor = '#10b981'; // Green
    let riskBg = 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400';
    let recommendations = 'Vigilancia ordinaria. No se prevén dificultades severas de control en caso de ignición espontánea.';

    if (fwi >= 65) {
      riskLabel = 'Extremo';
      riskColor = '#ef4444'; // Red
      riskBg = 'bg-red-950/45 border-red-500/60 text-red-200 animate-pulse';
      recommendations = '⚠️ Rápida propagación tridimensional (copas). Fuego fuera de capacidad de extinción. Altísimo riesgo de faja radiante crítica hacia núcleos próximos.';
    } else if (fwi >= 45) {
      riskLabel = 'Muy Alto';
      riskColor = '#f97316'; // Orange
      riskBg = 'bg-orange-950/40 border-orange-500/50 text-orange-300';
      recommendations = '⚠️ Antorcheo frecuente y focos secundarios a distancias medias. Labores de ataque directo condicionadas a fajas de baja carga.';
    } else if (fwi >= 30) {
      riskLabel = 'Alto';
      riskColor = '#f59e0b'; // Amber
      riskBg = 'bg-amber-950/30 border-amber-500/40 text-amber-400';
      recommendations = 'Fuegos de superficie intensos. Recomendado evitar quemas agrícolas o desbroces motorizados en horas de máxima insolación.';
    } else if (fwi >= 15) {
      riskLabel = 'Moderado';
      riskColor = '#eab308'; // Yellow
      riskBg = 'bg-yellow-950/20 border-yellow-500/35 text-yellow-300';
      recommendations = 'Propagación de intensidad media controlable con medios terrestres convencionales y líneas de defensa estándar.';
    }

    return { fwi, ffmc: Math.round(ffmc), isi, riskLabel, riskColor, riskBg, recommendations, fuelLabel };
  }, [calcTemp, calcHum, calcWind, calcRainlessDays, calcFuelType]);

  // Gemini & alert broadcast states
  const [generatingReport, setGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isAlertBroadcasting, setIsAlertBroadcasting] = useState(false);

  // --- CIVIL PROTECTION & POPULATION THREAT INTELLIGENCE (PILAR I) ---
  const [minFrpFilter, setMinFrpFilter] = useState<number>(0);
  const [maxProximityFilter, setMaxProximityFilter] = useState<number>(999); // 999 = No filter
  const [selectedAreaForConnection, setSelectedAreaForConnection] = useState<string | null>(null);

  // Load populated areas from localStorage, or defaults
  const [populatedAreas, setPopulatedAreas] = useState<PopulatedArea[]>(() => {
    const stored = localStorage.getItem('sat_populated_areas');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_POPULATED_AREAS;
  });

  // Fixed backup coordinates ("latitudBase", "longitudBase")
  const [latitudBase, setLatitudBase] = useState<string>(() => {
    const stored = localStorage.getItem('sat_latitud_base');
    if (stored !== null) return stored;
    return String(config?.fallbackLat ?? 40.416775);
  });

  const [longitudBase, setLongitudBase] = useState<string>(() => {
    const stored = localStorage.getItem('sat_longitud_base');
    if (stored !== null) return stored;
    return String(config?.fallbackLon ?? -3.703790);
  });

  // Persist "latitudBase" and "longitudBase" to localStorage on change
  useEffect(() => {
    localStorage.setItem('sat_latitud_base', latitudBase);
  }, [latitudBase]);

  useEffect(() => {
    localStorage.setItem('sat_longitud_base', longitudBase);
  }, [longitudBase]);

  // Real-time Coordinate Validation Utility
  const validateCoordinateRange = useCallback((latVal: string | number, lonVal: string | number) => {
    const latNum = Number(latVal);
    const lonNum = Number(lonVal);
    const isLatOk = latVal !== '' && !isNaN(latNum) && latNum >= -90 && latNum <= 90;
    const isLonOk = lonVal !== '' && !isNaN(lonNum) && lonNum >= -180 && lonNum <= 180;
    return { isLatOk, isLonOk, isValid: isLatOk && isLonOk };
  }, []);

  // Determine active monitoring coordinates: Integrate GPSD with latitudBase / longitudBase backup
  const { activeLat, activeLon, locationSource, isUsingGpsd } = useMemo(() => {
    if (gpsd && (gpsd.lat !== 0 || gpsd.lon !== 0)) {
      return {
        activeLat: gpsd.lat,
        activeLon: gpsd.lon,
        locationSource: 'Sincronización GPSD [En Vivo]',
        isUsingGpsd: true
      };
    }
    
    // Fallback to configured backup coordinates
    const validation = validateCoordinateRange(latitudBase, longitudBase);
    if (validation.isValid) {
      return {
        activeLat: Number(latitudBase),
        activeLon: Number(longitudBase),
        locationSource: 'Coordenadas Fijas de Respaldo [Configuradas]',
        isUsingGpsd: false
      };
    }
    
    // Hard fallback if user typed invalid garbage
    return {
      activeLat: 40.416775,
      activeLon: -3.703790,
      locationSource: 'APRS Fallback del Sistema [Falla de Configuración]',
      isUsingGpsd: false
    };
  }, [gpsd, latitudBase, longitudBase, validateCoordinateRange]);

  // Resolved populated areas where 'aprs-main' is dynamically overridden with active coords
  const resolvedPopulatedAreas = useMemo(() => {
    return populatedAreas.map(area => {
      if (area.id === 'aprs-main') {
        return {
          ...area,
          lat: activeLat,
          lon: activeLon,
          name: config?.callsign ? `Estación APRS Principal (${config.callsign})` : 'Estación APRS Principal (EA1URG-13)'
        };
      }
      return area;
    });
  }, [populatedAreas, activeLat, activeLon, config]);

  // Area manager state variables
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaLat, setNewAreaLat] = useState('');
  const [newAreaLon, setNewAreaLon] = useState('');
  const [newAreaPop, setNewAreaPop] = useState('');
  const [newAreaProv, setNewAreaProv] = useState('');
  const [showAreaConfig, setShowAreaConfig] = useState(false);

  // Save populated areas to localStorage when modified
  useEffect(() => {
    localStorage.setItem('sat_populated_areas', JSON.stringify(populatedAreas));
  }, [populatedAreas]);

  // Haversine formula to compute geodesic distances
  const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getClosestPopulatedArea = (lat: number, lon: number) => {
    if (resolvedPopulatedAreas.length === 0) return null;
    let minDistance = Infinity;
    let closestArea = resolvedPopulatedAreas[0];
    
    for (const area of resolvedPopulatedAreas) {
      const d = calculateDistanceKm(lat, lon, area.lat, area.lon);
      if (d < minDistance) {
        minDistance = d;
        closestArea = area;
      }
    }
    
    return { area: closestArea, distanceKm: minDistance };
  };

  // Sincronización updater ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Fetch wildfires data
  const fetchWildfireData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customFetch('/api/wildfires/latest');
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const json: WildfireMonitorResponse = await response.json();
      if (json.success) {
        setData(json);
        setSecondsSinceUpdate(0);
        // Default select the first hotspot
        if (json.hotspots && json.hotspots.length > 0) {
          const matched = json.hotspots.find(h => h.dangerLevel === 'Extremo' || h.dangerLevel === 'Alto') || json.hotspots[0];
          setSelectedHotspot(matched);
        }
      } else {
        throw new Error('No se pudo establecer conexión satelital.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error de conexión con la interfaz NASA FIRMS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWildfireData();
  }, []);

  // Intervalo de actualización automática en tiempo real (cada 5 segundos)
  useEffect(() => {
    if (!autoUpdate) return;
    const autoInterval = setInterval(() => {
      fetchWildfireData();
    }, 5000);
    return () => clearInterval(autoInterval);
  }, [autoUpdate]);

  // Handler: Copy Share anchor link
  const handleCopyShare = () => {
    try {
      const shareUrl = window.location.href;
      navigator.clipboard.writeText(shareUrl);
      setSuccessMsg('✓ Enlace cartográfico copiado al portapapeles. ¡Listo para compartir!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (_) {
      setSuccessMsg('Enlace de vista: ' + window.location.origin + window.location.pathname);
      setTimeout(() => setSuccessMsg(null), 6000);
    }
  };

  // Sound generator (Buzzer alarm)
  const playTacticalSiren = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const playBeep = (timeOffset: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, ctx.currentTime + timeOffset);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + timeOffset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + timeOffset + 0.25);
          
          osc.start(ctx.currentTime + timeOffset);
          osc.stop(ctx.currentTime + timeOffset + 0.25);
        };

        playBeep(0);
        playBeep(0.35);
        playBeep(0.7);
      }
    } catch (_) {}
  };

  // Trigger alert broadcasting
  const handleSimulateCivilBroadcast = () => {
    if (!selectedHotspot) return;
    playTacticalSiren();
    setIsAlertBroadcasting(true);
    setSuccessMsg(`📢 Boletín VHF de alerta temprana emitido para: ${selectedHotspot.region}`);
    setTimeout(() => {
      setIsAlertBroadcasting(false);
      setSuccessMsg(null);
    }, 6000);
  };

  // Gemini predictive modeling 
  const handleGenerateAiReport = async (hotspot: WildfireHotspot) => {
    setGeneratingReport(true);
    setAiReport(null);
    try {
      const res = await customFetch('/api/wildfires/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotspot })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setAiReport(json.report);
      } else {
        setAiReport(`### ⚠️ Fallo en el análisis predictivo\nNo se pudo calcular la propagación.\nDetalles: ${json.msg}`);
      }
    } catch (err: any) {
      setAiReport(`### ⚠️ Error de Enlace\nNo se pudo establecer conexión táctica con el procesador Gemini.\nDetalles: ${err.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  // Manual fire inject
  const handleInjectFire = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(injLat);
    const lon = parseFloat(injLon);
    if (isNaN(lat) || isNaN(lon)) {
      alert('Digita coordenadas geográficas reales');
      return;
    }
    setInjecting(true);
    try {
      const res = await customFetch('/api/wildfires/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          region: injRegion,
          frpMw: parseFloat(injFrp),
          dangerLevel: injDanger
        })
      });
      if (res.ok) {
        setSuccessMsg(`✓ Foco simulado inyectado con éxito en ${injRegion}. Refrescando con satélite...`);
        setTimeout(() => setSuccessMsg(null), 4000);
        await fetchWildfireData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInjecting(false);
    }
  };

  // Clear manual custom conflagrations
  const handleClearCustomFires = async () => {
    try {
      const res = await customFetch('/api/wildfires/clear-custom', { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('✓ Se han limpiado los registros tácticos del simulacro.');
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchWildfireData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Map viewport Dimensions & Scaling Math
  const mapWidth = 500;
  const mapHeight = 380;

  const getCoordinatesForHotspot = (lat: number, lon: number) => {
    const isCanarias = lat < 30.0;
    if (isCanarias) {
      const x = 20 + ((lon - (-18.2)) / (-13.3 - (-18.2))) * 110;
      const y = (mapHeight - 80) + (1 - (lat - 27.2) / (29.5 - 27.2)) * 60;
      return { x, y, isCanarias: true };
    } else {
      const x = 50 + ((lon - (-10.1)) / (4.5 - (-10.1))) * (mapWidth - 80);
      const y = 30 + (1 - (lat - 35.5) / (44.0 - 35.5)) * (mapHeight - 120);
      return { x, y, isCanarias: false };
    }
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - svgRect.left;
    const clickY = e.clientY - svgRect.top;

    const isCanariasBox = clickX <= 140 && clickY >= (mapHeight - 90);
    
    let lat = 40.0;
    let lon = -3.5;
    let regionName = 'España Central';

    if (isCanariasBox) {
      const percentX = (clickX - 20) / 110;
      const percentY = (clickY - (mapHeight - 80)) / 60;
      lon = -18.2 + percentX * (-13.3 - (-18.2));
      lat = 27.2 + (1 - percentY) * (29.5 - 27.2);
      regionName = 'Islas Canarias';
    } else {
      const percentX = (clickX - 50) / (mapWidth - 80);
      const percentY = (clickY - 30) / (mapHeight - 120);
      lon = -10.1 + percentX * (4.5 - (-10.1));
      lat = 35.5 + (1 - percentY) * (44.0 - 35.5);

      if (lat >= 41.8 && lon <= -6.8) regionName = 'Galicia';
      else if (lat <= 38.8 && lon <= -1.5) regionName = 'Andalucía';
      else if (lat >= 37.9 && lat <= 40.5 && lon <= -4.8) regionName = 'Extremadura';
      else if (lat >= 40.1 && lat <= 43.2 && lon <= -1.8) regionName = 'Castilla y León';
      else if (lat >= 40.5 && lon >= 0.1) regionName = 'Cataluña';
      else if (lat >= 37.8 && lat <= 40.8 && lon >= -1.5 && lon <= 0.5) regionName = 'Comunidad Valenciana';
      else if (lat >= 38.1 && lat <= 41.3 && lon <= -1.0) regionName = 'Castilla-La Mancha';
      else if (lat >= 40.0 && lat <= 42.9 && lon >= -2.1 && lon <= 0.8) regionName = 'Aragón';
    }

    setInjLat(lat.toFixed(4));
    setInjLon(lon.toFixed(4));
    setInjRegion(`${regionName} (Punto Detectado)`);
  };

  // Get active cached / last modified text
  const getCacheLabel = () => {
    if (loading) return 'Actualizando...';
    const autoStr = autoUpdate ? ' [En Vivo - 45s]' : ' [Manual]';
    if (secondsSinceUpdate < 10) return `Sincronizado ahora${autoStr}`;
    if (secondsSinceUpdate < 60) return `Hace ${secondsSinceUpdate} s${autoStr}`;
    const mins = Math.floor(secondsSinceUpdate / 60);
    return `Sinc: hace ${mins} min${autoStr}`;
  };

  // Compile hotspots and filter based on Period, Confidence level, and search box
  const filteredHotspots = useMemo(() => {
    if (!data?.hotspots) return [];
    return data.hotspots.filter(h => {
      // 1. Period filter
      if (selectedPeriod === '1') {
        // past 24h
      } else if (selectedPeriod === '2') {
        // simulated 48h (just keep all, as NASA feed contains the past 24 hours)
      } else if (selectedPeriod === '3') {
        // simulated 72h
      }

      // 2. Minimum Confidence filter
      if (selectedConfidence === 'high') {
        const isHigh = h.confidence === 'high' || parseInt(h.confidence) >= 80 || h.dangerLevel === 'Extremo';
        if (!isHigh) return false;
      } else if (selectedConfidence === 'med') {
        const isLow = h.confidence === 'low' || parseInt(h.confidence) < 50;
        if (isLow) return false;
      }

      // 3. Minimum FRP intensity filter (Intensidad del Foco)
      if (h.frpMw < minFrpFilter) {
        return false;
      }

      // 4. Proximity to Populated Areas filter
      if (maxProximityFilter < 999) {
        const closestInfo = getClosestPopulatedArea(h.lat, h.lon);
        if (!closestInfo || closestInfo.distanceKm > maxProximityFilter) {
          return false;
        }
      }

      // 5. Search text query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matches = h.region.toLowerCase().includes(q) || h.id.toLowerCase().includes(q) || h.satellite.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [data, selectedPeriod, selectedConfidence, searchQuery, minFrpFilter, maxProximityFilter, resolvedPopulatedAreas]);

  // Compute live statistics for summary boxes
  const stats = useMemo(() => {
    const total = filteredHotspots.length;
    let highCount = 0;
    let maxFrp = 0;
    let latestTime = '–';

    filteredHotspots.forEach(h => {
      if (h.confidence === 'high' || parseInt(h.confidence) >= 80 || h.dangerLevel === 'Extremo') {
        highCount++;
      }
      if (h.frpMw > maxFrp) {
        maxFrp = h.frpMw;
      }
    });

    if (total > 0) {
      const sortedByTime = [...filteredHotspots].sort((a, b) => {
        const tA = `${a.date} ${a.time}`;
        const tB = `${b.date} ${b.time}`;
        return tB.localeCompare(tA);
      });
      latestTime = sortedByTime[0].time;
    }

    return {
      total,
      high: highCount,
      maxFrp: Math.round(maxFrp),
      lastTime: latestTime
    };
  }, [filteredHotspots]);

  // Compute threat levels (distances and closest fire details) for each configured populated area
  const threatMetadata = useMemo(() => {
    return resolvedPopulatedAreas.map(area => {
      // Find closest active fire in the filtered set of hotspots
      let closestHotspot: WildfireHotspot | null = null;
      let minDistance = Infinity;
      
      for (const h of filteredHotspots) {
         const d = calculateDistanceKm(h.lat, h.lon, area.lat, area.lon);
         if (d < minDistance) {
           minDistance = d;
           closestHotspot = h;
         }
      }
      
      return {
        area,
        closestHotspot,
        distanceKm: minDistance === Infinity ? null : minDistance
      };
    });
  }, [resolvedPopulatedAreas, filteredHotspots]);

  // Prepare threat data specifically formatted for the Recharts BarChart visualization
  const chartData = useMemo(() => {
    return threatMetadata.map(tm => {
      return {
        name: tm.area.name,
        dist: tm.distanceKm !== null ? Math.round(tm.distanceKm) : 150, // default display bar size if safe / no fires
        rawDist: tm.distanceKm,
        frp: tm.closestHotspot ? tm.closestHotspot.frpMw : 0,
        id: tm.area.id
      };
    }).sort((a, b) => {
      // Show closest threats at the top of the chart (ascending distance)
      const dA = a.rawDist !== null ? a.rawDist : Infinity;
      const dB = b.rawDist !== null ? b.rawDist : Infinity;
      return dA - dB;
    });
  }, [threatMetadata]);

  // Dynamic grouping of filtered hotspots into provinces / regions as accordion elements
  const groupedHotspots = useMemo(() => {
    const groups: { [key: string]: WildfireHotspot[] } = {
      'Andalucía': [],
      'Galicia': [],
      'Canarias': [],
      'Comunidad Valenciana': [],
      'Castilla y León': [],
      'Cataluña': [],
      'Extremadura': [],
      'Otras Regiones': []
    };

    filteredHotspots.forEach(h => {
      const r = h.region.toLowerCase();
      if (r.includes('andalucía') || r.includes('huelva') || r.includes('sevilla') || r.includes('cádiz') || r.includes('málaga')) {
        groups['Andalucía'].push(h);
      } else if (r.includes('galicia') || r.includes('ourense') || r.includes('pontevedra') || r.includes('lugo')) {
        groups['Galicia'].push(h);
      } else if (r.includes('canarias') || r.includes('tenerife') || r.includes('palma')) {
        groups['Canarias'].push(h);
      } else if (r.includes('valencia') || r.includes('castellón') || r.includes('alicante')) {
        groups['Comunidad Valenciana'].push(h);
      } else if (r.includes('león') || r.includes('burgos') || r.includes('castilla y león')) {
        groups['Castilla y León'].push(h);
      } else if (r.includes('cataluña') || r.includes('girona') || r.includes('barcelona')) {
        groups['Cataluña'].push(h);
      } else if (r.includes('extremadura') || r.includes('cáceres')) {
        groups['Extremadura'].push(h);
      } else {
        groups['Otras Regiones'].push(h);
      }
    });

    return groups;
  }, [filteredHotspots]);

  // Toggle active accordion
  const toggleGroup = (key: string) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Safe checks for FWI regional risk lists
  const sortedRisks = useMemo(() => {
    if (!data?.regionalRisks) return [];
    return [...data.regionalRisks].sort((a, b) => b.fwi - a.fwi);
  }, [data]);

  return (
    <div id="native-incendiosespana-portal" className="font-sans antialiased text-[#eee] bg-[#0f0f0f] shadow-2xl rounded-2xl p-0 overflow-hidden flex flex-col gap-0 select-none">
      
      {/* SCOPED CUSTOM STYLE INJECTOR FOR THE ORIGINAL WEBSITE EMBED LOOK & FEEL */}
      <style dangerouslySetInnerHTML={{ __html: `
        #native-incendiosespana-portal {
          --brand-primary: #ff4500;
          --brand-primary-glow: rgba(255, 69, 0, 0.4);
          --brand-deep: #1a0a00;
          --ui-surface: #111111;
          --ui-border: #2a1500;
          --ui-border-active: #3d1800;
          --text-muted: #888888;
        }

        #native-incendiosespana-portal header {
          background: linear-gradient(135deg, #1a0a00 0%, #2d1200 50%, #1a0a00 100%);
          border-bottom: 2px solid var(--brand-primary);
          box-shadow: 0 2px 20px var(--brand-primary-glow);
        }

        #native-incendiosespana-portal .flicker-flame {
          animation: flame-flicker 1.5s ease-in-out infinite alternate;
        }

        @keyframes flame-flicker {
          0% { transform: scaleY(1) rotate(-2deg); opacity: 1; filter: drop-shadow(0 0 4px var(--brand-primary)); }
          100% { transform: scaleY(1.1) rotate(2deg); opacity: 0.85; filter: drop-shadow(0 0 10px #ff6a00); }
        }

        #native-incendiosespana-portal .layout-frame {
          display: flex;
          flex-direction: row;
          min-height: 560px;
          border-bottom: 1px solid var(--ui-border);
        }

        #native-incendiosespana-portal #sidebar {
          width: 300px;
          background: #111111;
          border-right: 1px solid var(--ui-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-shrink: 0;
        }

        #native-incendiosespana-portal .sidebar-header {
          padding: 12px 16px;
          background: #1a0a00;
          border-bottom: 1px solid var(--ui-border);
          font-size: 0.85rem;
          font-weight: 600;
          color: #ff8c42;
        }

        #native-incendiosespana-portal .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 12px;
          border-bottom: 1px solid var(--ui-border);
        }

        #native-incendiosespana-portal .stat-box {
          background: #1a0a00;
          border: 1px solid var(--ui-border-active);
          border-radius: 8px;
          padding: 8px;
          text-align: center;
        }

        #native-incendiosespana-portal .stat-box .num {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--brand-primary);
        }

        #native-incendiosespana-portal .stat-box .lbl {
          font-size: 0.65rem;
          color: var(--text-muted);
          margin-top: 1px;
        }

        #native-incendiosespana-portal .legend {
          padding: 12px 16px;
          border-bottom: 1px solid var(--ui-border);
        }

        #native-incendiosespana-portal .legend h3 {
          font-size: 0.74rem;
          color: #aaa;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: .05em;
        }

        #native-incendiosespana-portal .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
          font-size: 0.78rem;
          color: #ccc;
        }

        #native-incendiosespana-portal .legend-item .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        #native-incendiosespana-portal #fire-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        #native-incendiosespana-portal .fire-card {
          background: #1a0a00;
          border: 1px solid var(--ui-border-active);
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.2s;
          border-left: 3px solid var(--brand-primary);
        }

        #native-incendiosespana-portal .fire-card:hover {
          background: #251000;
          border-color: var(--brand-primary);
          transform: translateX(1px);
        }

        #native-incendiosespana-portal .fire-card.high { border-left-color: #ff1a1a; }
        #native-incendiosespana-portal .fire-card.med  { border-left-color: #ff8c00; }
        #native-incendiosespana-portal .fire-card.low  { border-left-color: #ffcc00; }

        #native-incendiosespana-portal .province-group {
          margin-bottom: 4px;
        }

        #native-incendiosespana-portal .province-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 12px;
          background: #1e0c00;
          border: 1px solid var(--ui-border-active);
          border-radius: 7px;
          cursor: pointer;
          font-size: 0.78rem;
          font-weight: 600;
          color: #ff8c42;
          user-select: none;
          transition: background 0.15s;
        }

        #native-incendiosespana-portal .province-header:hover {
          background: #2a1200;
        }

        #native-incendiosespana-portal .province-header .ph-arrow {
          font-size: 0.7rem;
          color: #8c5d44;
          transition: transform 0.2s;
        }

        #native-incendiosespana-portal .province-header.open .ph-arrow {
          transform: rotate(90deg);
        }

        #native-incendiosespana-portal .province-cards {
          display: none;
          padding: 4px 0 2px 4px;
        }

        #native-incendiosespana-portal .province-cards.open {
          display: block;
        }

        #native-incendiosespana-portal #status-bar {
          padding: 7px 16px;
          background: #0a0500;
          border-top: 1px solid var(--ui-border);
          font-size: 0.7rem;
          color: #666;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        #native-incendiosespana-portal #map {
          flex: 1;
          background: #0d0905;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: auto;
          overflow: hidden;
        }

        @media (max-width: 768px) {
          #native-incendiosespana-portal .layout-frame {
            flex-direction: column;
            min-height: auto;
          }

          #native-incendiosespana-portal #map {
            height: 380px;
          }

          #native-incendiosespana-portal #sidebar {
            width: 100%;
            border-right: none;
            border-top: 1px solid var(--ui-border);
          }
        }
      `}} />

      {/* GLOBAL NOTIFICATION SYSTEM BANNER */}
      {successMsg && (
        <div className="w-full px-5 py-3 bg-[#1e0c00] border-b border-[#ff4500]/40 text-xs text-[#ff8c42] font-mono flex items-center justify-between gap-3 animate-fade-in z-20">
          <div className="flex items-center gap-2">
            <Megaphone size={14} className="text-[#ff4500] animate-bounce shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <span className="text-[9px] bg-red-950 border border-[#ff4500]/30 px-2 py-0.5 rounded text-white font-black uppercase shrink-0">ACTIVO S.A.T.</span>
        </div>
      )}

      {/* HEADER BAR: LOGO, BRANDING & ONLINE CACHE TICKERS */}
      <header className="px-5 py-3.5 flex items-center gap-4 flex-shrink-0 z-10">
        <div className="flicker-flame shrink-0 text-[#ff4500]">
          <Flame size={34} fill="#ff4500" />
        </div>
        <div>
          <h1 className="text-sm md:text-base font-bold text-[#ff6a1a] tracking-tight">
            Incendios Forestales en España en Tiempo Real
          </h1>
          <p className="text-[10px] md:text-xs text-[#aaa]">
            Datos satelitales NASA FIRMS (VIIRS / MODIS) + EFFIS Copernicus · actualización cada 5 min
          </p>
        </div>
        
        {/* RIGHT CACHE CONTROL AND REFRESH */}
        <div className="ml-auto flex items-center gap-2">
          <div 
            id="cache-chip" 
            onClick={() => setAutoUpdate(prev => !prev)}
            className="fresh flex items-center gap-1.5 cursor-pointer hover:bg-emerald-950/25 p-1 px-3 rounded-full border border-emerald-500/10 hover:border-emerald-500/30 select-none transition-all"
            title="Soporte S.A.T: Haz clic para alternar refresco en tiempo real autónomo (cada 45s)"
          >
            <div className={`cdot w-2 h-2 rounded-full ${autoUpdate ? 'bg-emerald-500 animate-pulse shadow-[0_0_5px_#22cc44]' : 'bg-stone-500'}`}></div>
            <span id="cache-label" className="text-[10.5px] font-mono text-[#aaa]">{getCacheLabel()}</span>
          </div>
          
          <button 
            type="button"
            onClick={handleCopyShare}
            className="hidden sm:inline-flex bg-transparent border border-[#3d1800] hover:bg-[#1a0c00] text-[#888] hover:text-[#ff8c42] text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            🔗 Compartir
          </button>
          
          <button 
            type="button"
            onClick={fetchWildfireData}
            disabled={loading}
            className="bg-gradient-to-r from-[#cc3300] to-[#ff4500] hover:from-[#ff4500] hover:to-[#ff6a00] hover:shadow-[0_4px_12px_rgba(255,69,0,0.5)] active:translate-y-0.5 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={11.5} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </header>

      {/* THE LAYOUT CONTAINER */}
      <div className="layout-frame">
        
        {/* LEFT COMPONENT SIDEBAR */}
        <aside id="sidebar">
          <div className="sidebar-header" id="sidebar-period">
            Resumen · últimas {selectedPeriod === '1' ? '24' : selectedPeriod === '2' ? '48' : '72'} h
          </div>

          {/* DYNAMIC METRIC CARDS */}
          <div className="stats">
            <div className="stat-box">
              <div className="num" id="stat-total">{loading ? '...' : stats.total}</div>
              <div className="lbl">Focos detectados</div>
            </div>
            <div className="stat-box">
              <div className="num" id="stat-high" style={{ color: '#ff1a1a' }}>{loading ? '...' : stats.high}</div>
              <div className="lbl">Confianza alta</div>
            </div>
            <div className="stat-box">
              <div className="num" id="stat-frp" style={{ color: '#ff8c00' }}>{loading ? '...' : stats.maxFrp}</div>
              <div className="lbl">FRP máx. (MW)</div>
            </div>
            <div className="stat-box">
              <div className="num" id="stat-updated" style={{ fontSize: '0.9rem', color: '#ffcc00' }}>{loading ? '...' : stats.lastTime}</div>
              <div className="lbl">Última detección</div>
            </div>
          </div>

          {/* CONFIDENCE COLOR LEGENDS */}
          <div className="legend">
            <h3>Nivel de confianza</h3>
            <div className="legend-items-row">
              <div className="legend-item">
                <div className="dot" style={{ background: '#ff1a1a', boxShadow: '0 0 6px #ff1a1a' }}></div>
                <span>Alta (≥ 80 %)</span>
              </div>
              <div className="legend-item">
                <div className="dot" style={{ background: '#ff8c00', boxShadow: '0 0 6px #ff8c00' }}></div>
                <span>Media (50–79 %)</span>
              </div>
              <div className="legend-item">
                <div className="dot" style={{ background: '#ffcc00', boxShadow: '0 0 6px #ffcc00' }}></div>
                <span>Baja (&lt; 50 %)</span>
              </div>
              <div className="legend-item">
                <div className="dot" style={{ background: '#888888' }}></div>
                <span>Sin dato</span>
              </div>
            </div>
          </div>

          {/* DYNAMIC PERÍODO SELECTOR SEGMENT CONTROL */}
          <div className="filter-group">
            <div className="filter-label">Período</div>
            <div className="seg-ctrl" id="ctrl-days">
              {(['1', '2', '3'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedPeriod(d)}
                  className={`seg-btn ${selectedPeriod === d ? 'active' : ''}`}
                >
                  {d} {d === '1' ? 'día' : 'días'}
                </button>
              ))}
            </div>
          </div>

          {/* DYNAMIC CONFIANZA SELECTOR SEGMENT CONTROL */}
          <div className="filter-group">
            <div className="filter-label">Confianza mínima</div>
            <div className="seg-ctrl" id="ctrl-conf">
              <button
                onClick={() => setSelectedConfidence('all')}
                className={`seg-btn ${selectedConfidence === 'all' ? 'active' : ''}`}
              >
                Todas
              </button>
              <button
                onClick={() => setSelectedConfidence('med')}
                className={`seg-btn ${selectedConfidence === 'med' ? 'active' : ''}`}
              >
                ≥ Media
              </button>
              <button
                onClick={() => setSelectedConfidence('high')}
                className={`seg-btn ${selectedConfidence === 'high' ? 'active' : ''}`}
              >
                Solo alta
              </button>
            </div>
          </div>

          {/* ADVANCED CIVIL PROTECTION INTELLIGENCE FILTERS */}
          <div className="filter-group border-t border-[#2a1500]/45 pt-3 mt-1 px-4 pb-2">
            <h4 className="text-[#ff8c42] font-extrabold flex items-center gap-1.5 uppercase text-[9px] font-mono tracking-wider mb-2">
              <ShieldAlert size={12} className="text-[#ff4500]" />
              Filtros de Amenaza Civil
            </h4>
            
            <div className="space-y-3">
              {/* Slider for Min FRP */}
              <div>
                <div className="flex justify-between items-center text-[9.5px] font-mono mb-1 text-stone-400">
                  <span>Intensidad Mín. (FRP):</span>
                  <span className="text-[#ff4500] font-bold">{minFrpFilter} MW</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="250" 
                  step="10" 
                  value={minFrpFilter}
                  onChange={(e) => setMinFrpFilter(Number(e.target.value))}
                  className="w-full accent-[#ff4500] h-1 bg-[#1a0a00] rounded focus:outline-none cursor-ew-resize"
                  id="slider-min-frp"
                />
              </div>

              {/* Range for Proximity */}
              <div>
                <div className="flex justify-between items-center text-[9.5px] font-mono mb-1 text-stone-400">
                  <span>Radio a Población:</span>
                  <span className="text-[#ff8c42] font-semibold">
                    {maxProximityFilter === 999 ? 'Cualquier área' : `< ${maxProximityFilter} km`}
                  </span>
                </div>
                <select
                  value={maxProximityFilter}
                  onChange={(e) => setMaxProximityFilter(Number(e.target.value))}
                  className="w-full bg-black/95 border border-[#2a1500] focus:border-[#ff4500]/50 text-stone-300 rounded px-2 py-1 text-[10.5px] cursor-pointer font-sans focus:outline-none"
                  id="select-max-proximity"
                >
                  <option value={999}>Cualquier Distancia</option>
                  <option value={20}>Crítico (&lt; 20 km de núcleos)</option>
                  <option value={50}>Urgente (&lt; 50 km de núcleos)</option>
                  <option value={100}>Alerta (&lt; 100 km de núcleos)</option>
                  <option value={200}>Vigilancia (&lt; 200 km de núcleos)</option>
                </select>
              </div>
            </div>
          </div>

          {/* PROVINCES ACCORDION LIST */}
          <div className="sidebar-header flex items-center justify-between">
            <span>Lista de focos</span>
            <span className="text-[10px] font-mono opacity-60">Filtrando: {filteredHotspots.length}</span>
          </div>

          <div id="fire-list" className="scrollbar-thin">
            {/* Real Search field INSIDE the list panel */}
            <div className="px-2 pb-3 pt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 text-stone-550" size={13} />
                <input
                  type="text"
                  placeholder="Filtrar focos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a0500] border border-[#2a1500] focus:border-[#ff4500] focus:outline-none rounded px-2 pl-7 py-1 text-xs text-[#eee] font-sans"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 font-mono text-[10px] text-stone-500 hover:text-stone-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <p className="p-4 text-xs text-stone-500 font-mono animate-pulse">Cargando datos satelitales...</p>
            ) : filteredHotspots.length === 0 ? (
              <p className="p-4 text-xs text-stone-600 font-mono text-center">Ninguna anomalía coincide con el criterio.</p>
            ) : (
              Object.keys(groupedHotspots).map(groupKey => {
                const list = groupedHotspots[groupKey];
                if (list.length === 0) return null;
                const isOpen = openGroups[groupKey];
                return (
                  <div key={groupKey} className="province-group">
                    <div 
                      className={`province-header ${isOpen ? 'open' : ''}`}
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <div className="ph-left">
                        <span className="ph-arrow">▶</span>
                        <span>{groupKey}</span>
                      </div>
                      <span className="ph-count bg-[#ff4500] px-1.5 py-0.2 rounded-full text-[9px] text-white font-extrabold font-mono">
                        {list.length}
                      </span>
                    </div>

                    <div className={`province-cards ${isOpen ? 'open' : ''}`}>
                      {list.map((h, hIdx) => {
                        const isCurSelected = selectedHotspot?.id === h.id;
                        const confVal = parseInt(h.confidence);
                        const confClass = isNaN(confVal) 
                          ? (h.confidence === 'high' ? 'high' : h.confidence === 'nominal' ? 'med' : 'low')
                          : (confVal >= 80 ? 'high' : confVal >= 50 ? 'med' : 'low');

                        return (
                          <div 
                            key={h.id + '-' + hIdx}
                            onClick={() => {
                              setSelectedHotspot(h);
                              // Auto scroll to detailed widgets below if on desktop
                              const detailBlock = document.getElementById('inspect-widget-view');
                              if (detailBlock && window.innerWidth < 768) {
                                detailBlock.scrollIntoView({ behavior: 'smooth' });
                              }
                            }}
                            className={`fire-card ${confClass} ${isCurSelected ? 'bg-[#291100] border-[#ff4500] scale-[1.01]' : ''}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="title">{h.region}</span>
                              <span className="frp text-[#ff6a00] font-mono text-[11px] shrink-0 font-bold">{h.frpMw} MW</span>
                            </div>
                            <div className="meta text-stone-500 font-mono text-[10px] mt-1 flex justify-between">
                              <span>Sonda {h.satellite} · {h.time}</span>
                              <span className="text-stone-400 capitalize">{h.dangerLevel || 'Severo'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div id="status-bar">
            <div className="pulse"></div>
            <span id="status-text" className="font-mono text-[10px] tracking-wide text-stone-400 uppercase">
              {loading ? 'Sincronizando...' : 'Sonda satelital activa · NASA FIRMS'}
            </span>
          </div>
        </aside>

        {/* RIGHT INTERACTIVE GEOGRAPHICAL MAP */}
        <section id="map">
          
          {/* FLOATING MAP LAYERS OVERLAY */}
          <div className="absolute top-3 left-3 z-10 flex bg-neutral-950/80 backdrop-blur border border-[#ff4500]/20 rounded-lg p-0.5 shadow-2xl gap-1">
            {(['termico', 'topografico', 'satelite'] as const).map(layer => {
              const isSel = mapLayer === layer;
              const labels = {
                termico: 'Térmico MODIS',
                topografico: 'Topográfico NRT',
                satelite: 'Satelital VIIRS'
              };
              return (
                <button
                  key={layer}
                  onClick={() => setMapLayer(layer)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono font-black border transition-all cursor-pointer ${
                    isSel 
                      ? 'bg-gradient-to-r from-[#cc3300] to-[#ff4500] text-white border-transparent' 
                      : 'border-transparent text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {labels[layer]}
                </button>
              );
            })}
          </div>

          {/* REALTIME SPATIAL POSITION COORDINATES */}
          <div className="absolute top-3 right-3 z-10 bg-neutral-950/90 backdrop-blur border border-[#ff4500]/20 px-3 py-1 rounded-lg text-[9.5px] font-mono text-[#ff8c42] shadow-xl flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
            <span className="text-stone-300 font-sans font-bold">GRID:</span> 
            {selectedHotspot ? `${selectedHotspot.lat.toFixed(4)}°N, ${selectedHotspot.lon.toFixed(4)}°W` : 'Capturando mapa...'}
          </div>

          {/* VECTOR MAP ENGINE */}
          <div className="w-full h-full p-4 flex items-center justify-center">
            <svg 
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              onClick={handleMapClick}
              className="w-full max-w-[500px] aspect-auto cursor-crosshair select-none"
              style={{ maxHeight: '100%' }}
            >
              {/* Optional Grid Background Pattern overlay */}
              {mapLayer !== 'termico' && (
                <g>
                  <defs>
                    <pattern id="spainGridMapPattern" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#spainGridMapPattern)" />
                </g>
              )}

              {/* Spain boundary land contours */}
              <path 
                d="M 120 40 L 450 40 L 480 120 L 420 280 L 320 300 L 250 310 L 200 290 L 150 250 L 120 180 L 110 50 Z" 
                fill={
                  mapLayer === 'termico' 
                    ? 'rgba(26, 10, 0, 0.65)' 
                    : mapLayer === 'topografico' 
                    ? 'rgba(40,30,20,0.5)' 
                    : 'rgba(15, 20, 10, 0.7)'
                } 
                stroke={
                  mapLayer === 'termico' 
                    ? '#ff4500' 
                    : mapLayer === 'topografico' 
                    ? '#8c5d44' 
                    : '#4c6c21'
                } 
                strokeWidth={mapLayer === 'topografico' ? '2' : '1.5'} 
                strokeDasharray={mapLayer === 'topografico' ? '3 3' : 'none'}
                className="transition-all duration-300"
              />

              {/* Portugal frontiers */}
              <path 
                d="M 160 55 L 170 120 L 160 180 L 200 240 L 201 289" 
                fill="none" 
                stroke="rgba(255,255,255,0.1)" 
                strokeWidth="1.2" 
                strokeDasharray="2 2"
              />

              {/* Baleares */}
              <circle cx="452" cy="180" r="14" fill="none" stroke="#ff4500" strokeWidth="1" strokeDasharray="1 1" />
              <circle cx="475" cy="195" r="9" fill="none" stroke="#ff4550" strokeWidth="1" strokeDasharray="1 1" />

              {/* Canary Islands box inset */}
              <rect x="10" y={mapHeight - 95} width="140" height="85" fill="rgba(10, 10, 12, 0.85)" stroke="#3d1800" strokeWidth="1" />
              <text x="18" y={mapHeight - 83} className="font-mono text-[8px] fill-[#ff8c42] font-extrabold uppercase tracking-widest">ISLAS CANARIAS</text>
              
              <ellipse cx="40" cy={mapHeight - 50} rx="12" ry="8" fill="none" stroke="#ff4500" strokeWidth="1" strokeDasharray="1 1" />
              <ellipse cx="75" cy={mapHeight - 48} rx="16" ry="10" fill="none" stroke="#ff4500" strokeWidth="1" strokeDasharray="1 1" />
              <ellipse cx="115" cy={mapHeight - 35} rx="18" ry="9" fill="none" stroke="#ff4500" strokeWidth="1" strokeDasharray="1 1" />

              {/* Click mapping grid coordinate guide */}
              {injLat && injLon && (
                <g>
                  {(() => {
                    const pt = getCoordinatesForHotspot(parseFloat(injLat), parseFloat(injLon));
                    return (
                      <g>
                        <line x1={pt.x} y1={0} x2={pt.x} y2={mapHeight} stroke="rgba(255, 69, 0, 0.15)" strokeWidth="0.5" strokeDasharray="3 3" />
                        <line x1={0} y1={pt.y} x2={mapWidth} y2={pt.y} stroke="rgba(255, 69, 0, 0.15)" strokeWidth="0.5" strokeDasharray="3 3" />
                        <circle cx={pt.x} cy={pt.y} r="5" fill="#ff4500" className="animate-ping" />
                        <circle cx={pt.x} cy={pt.y} r="2.5" fill="#ff4500" />
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Plotted hotspots */}
              {filteredHotspots.map((h, i) => {
                const { x, y } = getCoordinatesForHotspot(h.lat, h.lon);
                const isSelected = selectedHotspot?.id === h.id;
                const isExtreme = h.dangerLevel === 'Extremo' || parseInt(h.confidence) >= 80 || h.confidence === 'high';
                
                let ptColor = '#ffcc00'; // low
                let rngColor = 'rgba(255, 204, 0, 0.25)';

                if (isExtreme) {
                  ptColor = '#ff1a1a'; // high
                  rngColor = 'rgba(255, 26, 26, 0.45)';
                } else if (h.confidence === 'nominal' || parseInt(h.confidence) >= 50) {
                  ptColor = '#ff8c00'; // med
                  rngColor = 'rgba(255, 140, 0, 0.35)';
                }

                if (h.source === 'IncendiosEspaña') {
                  ptColor = '#818cf8'; // Simulado
                  rngColor = 'rgba(129, 140, 248, 0.4)';
                }

                return (
                  <g 
                    key={h.id + '-' + i} 
                    className="cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedHotspot(h);
                    }}
                  >
                    {/* Ring glow for severe items */}
                    {isExtreme && (
                      <circle cx={x} cy={y} r={12 + Math.sin(Date.now() / 300) * 4} fill="none" stroke={rngColor} strokeWidth="0.8" />
                    )}

                    {/* Active highlight marker */}
                    {isSelected && (
                      <circle cx={x} cy={y} r="10.5" fill="none" stroke="#ff4500" strokeWidth="1.5" className="animate-pulse" />
                    )}

                    {/* Core Point dot */}
                    <circle 
                      cx={x} 
                      cy={y} 
                      r={isSelected ? 6 : 3.8} 
                      fill={ptColor} 
                      stroke="#0d0905" 
                      strokeWidth="1.2"
                      className="transition-all duration-200"
                    />
                  </g>
                );
              })}

              {/* Plotting Configured Populated Areas */}
              {resolvedPopulatedAreas.map(area => {
                const coord = getCoordinatesForHotspot(area.lat, area.lon);
                
                // Calculate if any active filtered fire is critical (<25km) to this city
                const directThreats = filteredHotspots.filter(h => calculateDistanceKm(h.lat, h.lon, area.lat, area.lon) < 25);
                const isUnderThreat = directThreats.length > 0;
                const isCriticallyThreatened = directThreats.some(h => h.frpMw > 80 || h.dangerLevel === 'Extremo');
                
                const dotColor = isCriticallyThreatened ? '#ef4444' : isUnderThreat ? '#f97316' : '#3b82f6';
                
                return (
                  <g 
                    key={'area-' + area.id} 
                    className="cursor-pointer select-none group"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Set selected area to view connection trajectory
                      setSelectedAreaForConnection(area.id === selectedAreaForConnection ? null : area.id);
                    }}
                  >
                    {/* Pulsing ring if threatened */}
                    {isUnderThreat && (
                      <circle 
                        cx={coord.x} 
                        cy={coord.y} 
                        r={isCriticallyThreatened ? 13 : 9} 
                        fill="none" 
                        stroke={dotColor} 
                        strokeWidth="0.8" 
                        className="animate-ping" 
                      />
                    )}
                    {/* Connection indicator arrow if selected */}
                    {selectedAreaForConnection === area.id && (
                      <circle 
                        cx={coord.x} 
                        cy={coord.y} 
                        r="8" 
                        fill="none" 
                        stroke="#3b82f6" 
                        strokeWidth="1.2" 
                        className="animate-pulse" 
                      />
                    )}
                    
                    {/* Core node shape */}
                    <circle 
                      cx={coord.x} 
                      cy={coord.y} 
                      r="4.2" 
                      fill={dotColor} 
                      stroke="#0d0905" 
                      strokeWidth="1" 
                    />
                    
                    {/* Small inner highlight */}
                    <circle 
                      cx={coord.x} 
                      cy={coord.y} 
                      r="1.5" 
                      fill="#fff" 
                    />

                    {/* Populated Area label always visible */}
                    <text 
                      x={coord.x + 6} 
                      y={coord.y + 3} 
                      className="font-sans font-bold text-[7.5px] fill-stone-300 pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)] uppercase tracking-wide group-hover:fill-sky-400"
                    >
                      {area.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}

              {/* Laser Trace Line connection between a selected area and its closest fire */}
              {selectedAreaForConnection && (() => {
                const area = resolvedPopulatedAreas.find(p => p.id === selectedAreaForConnection);
                if (!area) return null;
                
                // Find closest hotspot to this specific area in the filtered ones
                let closest: WildfireHotspot | null = null;
                let minD = Infinity;
                for (const h of filteredHotspots) {
                  const d = calculateDistanceKm(h.lat, h.lon, area.lat, area.lon);
                  if (d < minD) {
                    minD = d;
                    closest = h;
                  }
                }
                
                if (!closest) return null;
                const ptArea = getCoordinatesForHotspot(area.lat, area.lon);
                const ptFire = getCoordinatesForHotspot(closest.lat, closest.lon);
                
                return (
                  <g>
                    {/* Laser line trace */}
                    <line 
                      x1={ptArea.x} 
                      y1={ptArea.y} 
                      x2={ptFire.x} 
                      y2={ptFire.y} 
                      stroke="#ef4444" 
                      strokeWidth="1.4" 
                      strokeDasharray="3 2" 
                    />
                    {/* Target hit ring */}
                    <circle 
                      cx={ptFire.x} 
                      cy={ptFire.y} 
                      r="12" 
                      fill="none" 
                      stroke="#ef4444" 
                      strokeWidth="0.6" 
                      className="animate-ping" 
                    />
                    {/* Pulse line glow */}
                    <line 
                      x1={ptArea.x} 
                      y1={ptArea.y} 
                      x2={ptFire.x} 
                      y2={ptFire.y} 
                      stroke="#ef4444" 
                      strokeWidth="4" 
                      opacity="0.15" 
                      className="animate-pulse"
                    />
                    {/* Label Box in center of line */}
                    <g transform={`translate(${(ptArea.x + ptFire.x)/2 - 38}, ${(ptArea.y + ptFire.y)/2 - 7})`}>
                      <rect width="76" height="14" rx="2" fill="#0c0500" stroke="#ef4444" strokeWidth="0.8" opacity="0.95" />
                      <text x="38" y="9.5" textAnchor="middle" className="font-mono text-[6.5px] fill-red-400 font-bold uppercase tracking-wider">
                        RANGO: {minD.toFixed(1)} KM
                      </text>
                    </g>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* FLOATING LEGEND STRIP ON THE OVERLAY */}
          <div className="absolute bottom-3 left-3 right-3 bg-neutral-950/80 backdrop-blur border border-[#ff4500]/20 p-2 text-[9.5px] font-mono rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2 leading-none text-stone-400">
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff1a1a] inline-block shrink-0 animate-pulse"></span>
              <span>Peligro Extremo</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff8c00] inline-block shrink-0"></span>
              <span>Peligro Severo</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffcc00] inline-block shrink-0"></span>
              <span>Moderado Local</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[#818cf8] inline-block shrink-0"></span>
              <span>Inyectado Manual</span>
            </div>
          </div>
        </section>

      </div>

      {/* DETAILED ACTION WIDGET PANELS GRID */}
      <div className="p-5 bg-[#111111] grid grid-cols-1 md:grid-cols-12 gap-5" id="inspect-widget-view">
        
        {/* EXPEDIENTE TÉCNICO SATELITAL INSPECTOR */}
        <div className="md:col-span-4 bg-[#0a0500] border border-[#2a1500] p-4.5 rounded-xl flex flex-col justify-between shadow-2xl gap-4">
          <div>
            <div className="border-b border-[#3d1800] pb-2 flex items-center gap-2">
              <Activity size={14} className="text-[#ff4500] animate-pulse" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] font-mono">
                Expediente Técnico Satelital
              </h3>
            </div>

            {selectedHotspot ? (
              <div className="mt-3.5 space-y-3.5 text-xs text-stone-300">
                <div>
                  <span className="text-[8.5px] text-[#888] font-bold uppercase block tracking-wider">LOCALIZACIÓN / PERÍMETRO</span>
                  <p className="text-[#ff8c42] font-black leading-snug">{selectedHotspot.region}</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 font-mono text-[10.5px] border-y border-[#2a1500] py-2.5 text-stone-300 leading-normal">
                  <div>
                    <span className="text-[8.5px] text-stone-500 block font-bold uppercase mb-0.5">COORDENADAS QTH</span>
                    {selectedHotspot.lat.toFixed(4)}N, {selectedHotspot.lon.toFixed(4)}W
                  </div>
                  <div>
                    <span className="text-[8.5px] text-stone-500 block font-bold uppercase mb-0.5">CARGA RADIATIVA</span>
                    <span className="text-[#ff6a00] font-black">{selectedHotspot.frpMw} MW</span>
                  </div>
                  <div>
                    <span className="text-[8.5px] text-stone-500 block font-bold uppercase mb-0.5">SATÉLITE SONDA</span>
                    {selectedHotspot.satellite} ({selectedHotspot.instrument})
                  </div>
                  <div>
                    <span className="text-[8.5px] text-stone-500 block font-bold uppercase mb-0.5">AFECCIÓN EST.</span>
                    <span className="text-[#ff1a1a] font-extrabold">{Math.floor(selectedHotspot.frpMw * 1.5 + 4)} ha YTD</span>
                  </div>
                </div>

                <p className="text-[10px] font-mono text-[#ff8c42] leading-relaxed bg-[#ff4500]/5 p-2 rounded border border-[#ff4500]/20">
                  ⚠️ <strong>Aviso S.A.T:</strong> Anomalía clasificada como <strong>foco {selectedHotspot.dangerLevel || 'Severo'}</strong>. Posibilidad de rápida propagación racheada según faja de matorral local.
                </p>
              </div>
            ) : (
              <p className="mt-6 text-xs text-stone-500 text-center italic">
                Seleccione un foco en la lista lateral o en el mapa de España para cargar el informe técnico de telemetría e intensidades.
              </p>
            )}
          </div>

          {selectedHotspot && (
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleGenerateAiReport(selectedHotspot);
                  const aiConsole = document.getElementById('inspect-prediction-console');
                  if (aiConsole) aiConsole.scrollIntoView({ behavior: 'smooth' });
                }}
                disabled={generatingReport}
                className="w-full bg-[#ef4444] hover:bg-red-500 text-white font-extrabold uppercase text-[10px] tracking-widest py-2.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
              >
                <Cpu size={11} className={generatingReport ? 'animate-spin' : ''} />
                <span>{generatingReport ? 'Sopesando fajas...' : 'Dictamen Técnico IA (Gemini)'}</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateCivilBroadcast}
                className="w-full bg-[#160c00] hover:bg-[#2a1300] border border-[#ff4500]/30 text-stone-200 text-[10px] font-bold uppercase tracking-wider py-2 rounded transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <Radio size={11.5} className={isAlertBroadcasting ? 'animate-ping' : ''} />
                <span>Transmitir Boletín VHF</span>
              </button>
            </div>
          )}
        </div>

        {/* DICTAMEN DE SITUACIÓN PREDICTIVO (GEMINI AI IN THE MAIN FLOW) */}
        <div id="inspect-prediction-console" className="md:col-span-5 bg-[#0a0500] border border-[#2a1500] p-4.5 rounded-xl shadow-2xl flex flex-col justify-between gap-3">
          <div>
            <div className="border-b border-[#3d1800] pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14.5} className="text-red-400 animate-pulse" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] font-mono">
                  Predicción U.A.F. · Google Gemini-3.5-Flash
                </h3>
              </div>
              {aiReport && (
                <button
                  onClick={() => {
                    const b = new Blob([aiReport], { type: 'text/plain;charset=utf-8' });
                    const blobUrl = URL.createObjectURL(b);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = `Boletin_UAF_${selectedHotspot?.id || 'SAT'}.txt`;
                    link.click();
                  }}
                  className="text-[9px] font-mono text-stone-500 hover:text-stone-300 transition-colors"
                >
                  [Exportar TXT]
                </button>
              )}
            </div>

            <div className="mt-3.5 bg-black/60 p-3 rounded-lg border border-[#2a1500] min-h-[143px] overflow-y-auto max-h-[195px] scrollbar-thin">
              {generatingReport ? (
                <div className="flex flex-col items-center justify-center py-8 text-stone-500 font-mono text-xs gap-3.5">
                  <RefreshCw size={20} className="animate-spin text-red-500" />
                  <p className="animate-pulse uppercase text-[9.5px] text-center max-w-xs tracking-wider leading-relaxed">Conectando telemétricamente con el analizador forestal Gemini 3.5...</p>
                </div>
              ) : aiReport ? (
                <div className="prose prose-invert text-[10.5px] font-sans text-stone-350 leading-relaxed whitespace-pre-wrap select-text">
                  {aiReport}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center text-stone-500 text-xs font-mono space-y-2">
                  <FileText size={24} className="text-stone-700" />
                  <p className="max-w-xs leading-normal">Sin dictamen operacional cargado.</p>
                  <p className="text-[9.5px] text-stone-600 max-w-xs leading-relaxed">
                    Haga clic en un foco y seleccione <strong>"Dictamen Técnico IA"</strong> para calcular la celeridad perimetral mediante IA.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="text-[9px] font-mono text-stone-550 italic leading-snug">
            Procesador calibrado según fajas de riesgo perimetral INFOCA / UME de España.
          </div>
        </div>

        {/* SIMULATION OPERATOR INJECTOR BOARD */}
        <div className="md:col-span-3 bg-[#0a0500] border border-[#2a1500] p-4.5 rounded-xl shadow-2xl flex flex-col justify-between">
          <div className="border-b border-[#3d1800] pb-2 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] font-mono flex items-center gap-1.5">
              <Plus size={13.5} className="text-[#ff4500]" />
              Inyector de Simulacros
            </h3>
            <button 
              onClick={handleClearCustomFires}
              className="text-[9.5px] font-mono text-stone-500 hover:text-red-400"
            >
              [Reset]
            </button>
          </div>

          <form onSubmit={handleInjectFire} className="mt-3.5 space-y-2.5 font-sans text-xs">
            <div className="grid grid-cols-2 gap-2">
              <input 
                type="text" 
                value={injLat} 
                onChange={(e) => setInjLat(e.target.value)}
                placeholder="Lat N"
                title="Latitud"
                className="w-full bg-black border border-[#2a1500] focus:border-[#ff4500] focus:outline-none rounded p-1 px-2 text-[10.5px] font-mono text-stone-200"
              />
              <input 
                type="text" 
                value={injLon} 
                onChange={(e) => setInjLon(e.target.value)}
                placeholder="Lon W"
                title="Longitud"
                className="w-full bg-black border border-[#2a1500] focus:border-[#ff4500] focus:outline-none rounded p-1 px-2 text-[10.5px] font-mono text-stone-200"
              />
            </div>

            <input 
              type="text" 
              value={injRegion} 
              onChange={(e) => setInjRegion(e.target.value)}
              placeholder="Región e.g. Huelva"
              className="w-full bg-black border border-[#2a1500] focus:border-[#ff4500] focus:outline-none rounded p-1 px-2 text-[10.5px] text-stone-200 font-sans"
            />

            <div className="grid grid-cols-2 gap-2">
              <input 
                type="number" 
                value={injFrp} 
                onChange={(e) => setInjFrp(e.target.value)}
                placeholder="FRP MW"
                className="w-full bg-black border border-[#2a1500] focus:border-[#ff4500] focus:outline-none rounded p-1 px-2 text-[10.5px] font-mono text-stone-200"
              />
              <select 
                value={injDanger}
                onChange={(e: any) => setInjDanger(e.target.value)}
                className="w-full bg-black border border-[#2a1500] focus:border-[#ff4500] focus:outline-none rounded p-1 text-[10.5px] text-stone-250 cursor-pointer"
              >
                <option value="Moderado">Severo</option>
                <option value="Alto">Crítico</option>
                <option value="Extremo">Extremo</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={injecting}
              className="w-full bg-gradient-to-r from-[#160c00] to-black hover:from-[#ff4500] hover:to-[#ff6a00] border border-[#ff4500]/40 hover:border-transparent hover:text-white text-[#ff8c42] font-mono font-bold uppercase tracking-wider text-[10px] py-1.5 rounded transition-all cursor-pointer shadow"
            >
              {injecting ? 'Cargando...' : 'Inyectar simulado'}
            </button>
          </form>
        </div>

        {/* ========================================================= */}
        {/* INTERACTIVE CIVIL THREAT PROXIMITY ANALYZER PANEL (PILAR I) */}
        {/* ========================================================= */}
        <div className="md:col-span-12 bg-[#0a0500] border border-[#2a1500] p-5 rounded-2xl shadow-xl space-y-4" id="civilian-threat-dashboard">
          
          {/* Header section */}
          <div className="border-b border-[#3d1800] pb-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-[#ff4500]" />
              <div>
                <h3 className="font-extrabold text-xs uppercase tracking-widest text-[#ff8c42] font-mono">
                  MONITOR DE PROXIMIDAD DE AMENAZAS Y VULNERABILIDAD CIVIL
                </h3>
                <p className="text-[10px] text-stone-550 font-sans mt-0.5">
                  Cálculo geodésico en tiempo real del foco activo de calor más cercano a núcleos poblados de guardia configurados.
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowAreaConfig(prev => !prev)}
              type="button"
              className="bg-[#120600] hover:bg-[#250d00] border border-[#ff4500]/30 text-[#ff8c42] font-mono text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 shadow"
            >
              <Settings size={11} className={showAreaConfig ? 'animate-spin' : ''} />
              <span>{showAreaConfig ? 'Cerrar Gestor de Areas' : 'Ajustes de Áreas'}</span>
            </button>
          </div>

          {/* Collapsible Area configuration drawer */}
          {showAreaConfig && (
            <div className="bg-[#100600]/80 border border-[#ff4500]/20 p-4 rounded-xl space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-extrabold text-[#ff8c42] uppercase tracking-wider">
                  Configurador Atómico de Áreas de Guardia
                </span>
                <button
                  onClick={() => {
                    if (window.confirm('¿Seguro que desea restaurar las áreas de guardia predeterminadas?')) {
                      setPopulatedAreas(DEFAULT_POPULATED_AREAS);
                    }
                  }}
                  type="button"
                  className="text-red-400 hover:text-red-300 font-mono text-[9px] hover:underline"
                >
                  [Restablecer Valores de Fábrica]
                </button>
              </div>

              {/* Editable listings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mr-1">
                {populatedAreas.map(area => (
                  <div key={area.id} className="bg-black/70 border border-[#2a1505] p-2 rounded flex items-center justify-between text-xs font-mono">
                    <div className="truncate">
                      <p className="font-sans font-bold text-stone-200 truncate">{area.name}</p>
                      <p className="text-[8.5px] text-stone-500">
                        {area.lat.toFixed(4)}N, {area.lon.toFixed(4)}W • {area.population.toLocaleString()} hab
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setPopulatedAreas(prev => prev.filter(p => p.id !== area.id));
                        if (selectedAreaForConnection === area.id) {
                          setSelectedAreaForConnection(null);
                        }
                      }}
                      type="button"
                      className="text-red-500 hover:text-red-400 p-1 cursor-pointer transition-colors"
                      title="Eliminar este núcleo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Form to append new area */}
              <div className="pt-3 border-t border-[#3d1800]/40">
                <p className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Plus size={12} className="text-[#ff4500]" />
                  Añadir nuevo núcleo de guardia
                </p>

                {/* Autorellenar presets de estacion APRS / GPSD */}
                <div className="flex flex-wrap items-center gap-2 mb-3 bg-black/30 border border-[#2a1505]/40 p-2 rounded-lg">
                  <span className="text-[8.5px] text-stone-500 uppercase font-mono font-bold tracking-wider">PRESETS DE ESTACIÓN:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewAreaName(config?.callsign ? `Estación APRS QTH (${config.callsign})` : 'Estación APRS Principal QTH');
                      setNewAreaLat(String(config?.fallbackLat ?? 40.416775));
                      setNewAreaLon(String(config?.fallbackLon ?? -3.703790));
                      setNewAreaPop('1');
                      setNewAreaProv('Estación Fija');
                    }}
                    className="bg-[#1c0e05] hover:bg-[#2d1709] border border-[#ff4500]/30 hover:border-[#ff4500]/60 text-[#ff8c42] px-2 py-1 rounded text-[9.5px] font-mono transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <Radio size={10.5} className="text-[#ff4500]" />
                    <span>Estación APRS Principal ({config?.callsign || 'EA1URG-13'})</span>
                  </button>

                  {gpsd && (gpsd.lat !== 0 || gpsd.lon !== 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewAreaName('Estación Móvil GPSD');
                        setNewAreaLat(String(gpsd.lat));
                        setNewAreaLon(String(gpsd.lon));
                        setNewAreaPop('1');
                        setNewAreaProv(gpsd.device ? gpsd.device.split(' ')[0] : 'GPSD');
                      }}
                      className="bg-[#05140b] hover:bg-[#0c2415] border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 px-2 py-1 rounded text-[9.5px] font-mono transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                    >
                      <Cpu size={10.5} className="text-emerald-400" />
                      <span>Coordenadas de GPSD ({gpsd.lat.toFixed(4)}, {gpsd.lon.toFixed(4)})</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-sans">
                  <input
                    type="text"
                    placeholder="Nombre (ej. Ávila)"
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    className="bg-[#050505] border border-[#2a1505] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#ff4500] font-mono"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Latitud N (ej. 40.8)"
                    value={newAreaLat}
                    onChange={(e) => setNewAreaLat(e.target.value)}
                    className="bg-[#050505] border border-[#2a1505] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#ff4500] font-mono"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Longitud W (ej. -4.1)"
                    value={newAreaLon}
                    onChange={(e) => setNewAreaLon(e.target.value)}
                    className="bg-[#050505] border border-[#2a1505] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#ff4500] font-mono"
                  />
                  <input
                    type="number"
                    placeholder="Población"
                    value={newAreaPop}
                    onChange={(e) => setNewAreaPop(e.target.value)}
                    className="bg-[#050505] border border-[#2a1505] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#ff4500] font-mono"
                  />
                  <div className="flex gap-2 col-span-2 md:col-span-1">
                    <input
                      type="text"
                      placeholder="Provincia"
                      value={newAreaProv}
                      onChange={(e) => setNewAreaProv(e.target.value)}
                      className="bg-[#050505] border border-[#2a1505] rounded px-2.5 py-1 text-xs text-stone-300 w-full focus:outline-none focus:border-[#ff4500] font-mono"
                    />
                    <button
                      onClick={() => {
                        if (!newAreaName || !newAreaLat || !newAreaLon) {
                          alert('Por favor introduzca Nombre, Latitud y Longitud.');
                          return;
                        }
                        const validation = validateCoordinateRange(newAreaLat, newAreaLon);
                        if (!validation.isValid) {
                          alert('Error de validación: Latitud debe estar entre -90 y 90, Longitud entre -180 y 180.');
                          return;
                        }
                        const idStr = String(Date.now());
                        const fresh: PopulatedArea = {
                          id: idStr,
                          name: newAreaName,
                          lat: parseFloat(newAreaLat),
                          lon: parseFloat(newAreaLon),
                          population: parseInt(newAreaPop) || 1200,
                          province: newAreaProv || 'S.A.T Spain'
                        };
                        setPopulatedAreas(prev => [...prev, fresh]);
                        setNewAreaName('');
                        setNewAreaLat('');
                        setNewAreaLon('');
                        setNewAreaPop('');
                        setNewAreaProv('');
                      }}
                      type="button"
                      className="bg-[#e03d00] hover:bg-orange-500 font-bold px-3 py-1 rounded text-[10px] uppercase font-sans text-white transition-colors cursor-pointer shrink-0"
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              </div>

              {/* Sección de Configuración de Coordenadas de Respaldo */}
              <div className="pt-3 border-t border-[#3d1800]/40">
                <p className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Settings size={12} className="text-amber-500 animate-pulse" />
                  Configuración de Coordenadas de Respaldo de la Estación / Monitor
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/40 border border-[#2a1505]/50 p-3 rounded-lg">
                  {/* Inputs para latitudBase y longitudBase */}
                  <div className="space-y-1.5 col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[8.5px] font-mono text-stone-400 uppercase tracking-wider">Latitud de Respaldo (latitudBase)</label>
                      <input
                        type="text"
                        value={latitudBase}
                        onChange={(e) => setLatitudBase(e.target.value)}
                        placeholder="Ej. 40.416775"
                        className={`w-full bg-[#050505] border ${validateCoordinateRange(latitudBase, longitudBase).isLatOk ? 'border-[#2a1505] focus:border-[#ff4500]' : 'border-red-500 focus:border-red-500'} rounded px-2.5 py-1 text-xs text-white font-mono mt-0.5 focus:outline-none`}
                      />
                      {!validateCoordinateRange(latitudBase, longitudBase).isLatOk && (
                        <span className="text-[8px] text-red-400 block font-mono mt-0.5">⚠️ Rango válido de latitud: -90 a 90</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-[8.5px] font-mono text-stone-400 uppercase tracking-wider">Longitud de Respaldo (longitudBase)</label>
                      <input
                        type="text"
                        value={longitudBase}
                        onChange={(e) => setLongitudBase(e.target.value)}
                        placeholder="Ej. -3.703790"
                        className={`w-full bg-[#050505] border ${validateCoordinateRange(latitudBase, longitudBase).isLonOk ? 'border-[#2a1505] focus:border-[#ff4500]' : 'border-red-500 focus:border-red-500'} rounded px-2.5 py-1 text-xs text-white font-mono mt-0.5 focus:outline-none`}
                      />
                      {!validateCoordinateRange(latitudBase, longitudBase).isLonOk && (
                        <span className="text-[8px] text-red-400 block font-mono mt-0.5">⚠️ Rango válido de longitud: -180 a 180</span>
                      )}
                    </div>
                  </div>

                  {/* Estado de Integración con GPSD */}
                  <div className="bg-black/60 p-2.5 rounded border border-[#2a1505] flex flex-col justify-between text-xs font-mono space-y-1">
                    <span className="text-[8.5px] text-stone-500 uppercase font-bold tracking-wider">ESTADO DE INTEGRACIÓN:</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${isUsingGpsd ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                      <span className={`text-[10px] font-bold ${isUsingGpsd ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isUsingGpsd ? 'GPSD En Vivo Activo' : 'Ubicación Fija de Respaldo'}
                      </span>
                    </div>
                    <p className="text-[8.5px] text-stone-400 truncate mt-1">
                      Origen: <span className="text-white text-[8.5px]">{locationSource}</span>
                    </p>
                    <p className="text-[8.5px] text-stone-500">
                      Coordenadas: <span className="text-stone-300">{activeLat.toFixed(6)}N, {activeLon.toFixed(6)}W</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Analyzer Columns Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* COLUMN 1: Detailed Civil Vulnerability list of Areas (4 columns) */}
            <div className="lg:col-span-4 bg-black/40 border border-[#2a1500] rounded-xl p-3.5 space-y-3 max-h-[260px] overflow-y-auto scrollbar-thin">
              <span className="font-mono text-[9px] text-[#ff8c42] tracking-wider uppercase font-bold block mb-1">
                Análisis Inmediato por Proximidad (QTH)
              </span>

              {threatMetadata.length === 0 ? (
                <p className="text-xs text-stone-500 italic text-center py-8">
                  No hay núcleos de población configurados en la consola.
                </p>
              ) : (
                <div className="space-y-2">
                  {threatMetadata.map((tm) => {
                    const { area, closestHotspot, distanceKm } = tm;
                    const isThreatened = distanceKm !== null && distanceKm < 30;
                    const isCritical = distanceKm !== null && distanceKm < 15;
                    
                    let badgeBg = 'bg-[#1a2e3b] text-blue-400 border-blue-900/40';
                    let badgeLabel = 'SEGURO';
                    
                    if (isCritical) {
                      badgeBg = 'bg-red-950/80 text-red-400 border-red-900/40 animate-pulse';
                      badgeLabel = 'CRÍTICO';
                    } else if (isThreatened) {
                      badgeBg = 'bg-orange-950/80 text-orange-400 border-orange-900/40';
                      badgeLabel = 'ALTO RIESGO';
                    } else if (distanceKm !== null && distanceKm < 60) {
                      badgeBg = 'bg-yellow-950/50 text-yellow-400 border-yellow-900/30';
                      badgeLabel = 'REGULAR';
                    }

                    const isActiveTrajectory = selectedAreaForConnection === area.id;

                    return (
                      <div 
                        key={'threat-row-' + area.id}
                        className={`p-2.5 rounded-lg border transition-all text-xs font-mono space-y-1.5 ${
                          isActiveTrajectory 
                            ? 'bg-[#180a00]/80 border-[#ff4500]/60 shadow' 
                            : 'bg-black/60 border-[#2a1500] hover:border-[#ff4500]/25'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-sans font-black text-stone-200">{area.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-bold border uppercase ${badgeBg}`}>
                            {badgeLabel}
                          </span>
                        </div>

                        <div className="text-[10px] text-stone-400 leading-snug flex justify-between">
                          <span>
                            Fuego próximo:{' '}
                            <strong className={isThreatened ? 'text-red-400' : 'text-stone-300'}>
                              {distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'Ausente'}
                            </strong>
                          </span>
                          {closestHotspot && (
                            <span className="text-orange-400 font-bold">
                              ⚡ {closestHotspot.frpMw} MW
                            </span>
                          )}
                        </div>

                        {/* Interactive button layout */}
                        <div className="flex items-center gap-1.5 pl-1 pt-1 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAreaForConnection(isActiveTrajectory ? null : area.id);
                            }}
                            className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wide border cursor-pointer font-bold ${
                              isActiveTrajectory 
                                ? 'bg-[#ff4500] text-white border-transparent' 
                                : 'bg-[#121212] border-stone-800 text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            {isActiveTrajectory ? 'Ocultar Vector' : 'Trazar Vector'}
                          </button>
                          
                          {closestHotspot && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedHotspot(closestHotspot);
                                const mapSec = document.getElementById('map');
                                if (mapSec) mapSec.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="px-2 py-0.5 rounded text-[8px] bg-black/90 text-[#ff8c42] hover:bg-[#ff4500]/10 border border-[#ff4500]/20 hover:border-[#ff4550]/40 font-bold uppercase tracking-wide cursor-pointer"
                              title="Enfocar este fuego en el expediente"
                            >
                              Localizar Foco
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* COLUMN 2: RECHARTS INTERACTIVE BAR GRAPH DISPLAY (8 columns) */}
            <div className="lg:col-span-8 bg-black/40 border border-[#2a1500] rounded-xl p-3.5 flex flex-col justify-between" id="distance-bar-chart-card">
              <div>
                <span className="font-mono text-[9px] text-[#ff8c42] tracking-wider uppercase font-bold block mb-1">
                  Gráfica Interactiva de Vulnerabilidades (Distancia Mínima al Fuego en km)
                </span>
                <p className="text-[9.5px] text-stone-500 font-sans mb-3 font-medium">
                  Las barras más cortas indican una mayor amenaza civil y necesidad de preparación contra la faja radiante.
                </p>
              </div>

              {chartData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center font-mono text-xs text-stone-600">
                  Sin datos calificados para graficar.
                </div>
              ) : (
                <div className="w-full h-[200px] pr-2">
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                      onClick={(data: any) => {
                        if (data && data.activePayload && data.activePayload.length) {
                          const id = data.activePayload[0].payload.id;
                          setSelectedAreaForConnection(id === selectedAreaForConnection ? null : id);
                        }
                      }}
                    >
                      <XAxis 
                        type="number" 
                        domain={[0, 150]} 
                        tick={{ fill: '#888', fontSize: 8.5, fontFamily: 'monospace' }} 
                        stroke="#2a1500" 
                        unit=" km" 
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        tick={{ fill: '#cac6c0', fontSize: 9, fontFamily: 'sans-serif', fontWeight: 'bold' }} 
                        stroke="#2a1500" 
                        width={85}
                      />
                      <Tooltip 
                        content={<CustomThreatTooltip />}
                        cursor={{ fill: 'rgba(255, 69, 0, 0.05)' }}
                      />
                      <Bar 
                        dataKey="dist" 
                        radius={[0, 4, 4, 0]} 
                        barSize={12}
                        className="cursor-pointer"
                      >
                        {chartData.map((entry, index) => {
                          if (entry.rawDist === null) {
                            return <Cell key={`cell-${index}`} fill="#10b981" opacity={0.25} />;
                          }
                          if (entry.rawDist < 15) return <Cell key={`cell-${index}`} fill="#ef4444" />;
                          if (entry.rawDist < 30) return <Cell key={`cell-${index}`} fill="#f97316" />;
                          if (entry.rawDist < 60) return <Cell key={`cell-${index}`} fill="#f59e0b" />;
                          return <Cell key={`cell-${index}`} fill="#10b981" />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="flex items-center gap-3 text-[8.5px] font-mono text-stone-500 mt-2 justify-center border-t border-[#1a0f05] pt-2">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-red-600 block"></span> Critico (&lt; 15 km)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-orange-500 block"></span> Severo (15-30 km)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-yellow-500 block"></span> Moderado (30-60 km)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-green-500 block"></span> Seguro (&gt; 60 km)
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* COPERNICUS CLIMATOLOGICAL RISK PANEL & BULLETINS RSS */}
      <div className="p-5 bg-[#0f0f0f] border-t border-[#2a1500] grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* COPERNICUS REGIONAL Hazard Indices (FWI EFFIS) */}
        <div className="bg-[#111111] border border-[#2a1500] rounded-xl p-4.5 shadow-2xl space-y-3">
          <div className="border-b border-[#2a1500] pb-2 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] flex items-center gap-1.5 font-mono">
              <AlertTriangle size={14} className="text-[#ff4500] animate-pulse" />
              Riesgo Integrado Copernicus FWI Spain
            </h3>
            <span className="text-[8.5px] font-mono text-stone-500 uppercase">Alertas EFFIS UE</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[200px] overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="col-span-3 py-10 text-center text-stone-600 text-xs font-mono">
                Cargando FWI EFFIS...
              </div>
            ) : sortedRisks.map((r, idx) => {
              let tagColors = 'bg-[#1a0a00] border-[#3d1800] text-stone-300';
              let bColors = 'bg-stone-800 text-stone-400';
              
              if (r.riskLevel === 'Extremo') {
                tagColors = 'bg-red-950/20 border-red-500/30 text-white';
                bColors = 'bg-red-900 border border-red-500/20 text-red-100';
              } else if (r.riskLevel === 'Muy Alto') {
                tagColors = 'bg-orange-950/15 border-orange-500/25 text-stone-100';
                bColors = 'bg-orange-850 text-orange-200';
              } else if (r.riskLevel === 'Alto') {
                tagColors = 'bg-amber-950/10 border-amber-500/20 text-stone-200';
                bColors = 'bg-amber-800 text-amber-200';
              }

              return (
                <div key={r.region + '-' + idx} className={`p-2 rounded-lg border flex flex-col justify-between font-sans ${tagColors}`}>
                  <div className="flex items-center justify-between pb-1 font-mono text-[10px]">
                    <span className="font-bold truncate max-w-[90px] text-stone-200">{r.region}</span>
                    <span className={`text-[8px] font-black uppercase px-1 rounded ${bColors}`}>
                      {r.riskLevel}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-1.5 font-mono">
                    <span className="text-sm font-extrabold text-white">
                      FWI {r.fwi}
                    </span>
                    <span className="text-[8.5px] text-stone-500">
                      {r.focosActivos} Focos 
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-0.5 border-t border-[#2a1500]/50 pt-1.5 mt-1.5 text-[8px] text-stone-500 font-mono text-center">
                    <div>
                      <span className="block text-stone-300 text-[10px]">{r.tempC}°</span>
                      Aire
                    </div>
                    <div>
                      <span className="block text-stone-350 text-[10px]">{r.humidityPct}%</span>
                      Humedad
                    </div>
                    <div>
                      {(() => {
                        const bft = getBeaufortInfoByKts(r.windSpeedKts);
                        return (
                          <span className="block text-[10px] font-bold" style={{ color: bft.hex }}>
                            {r.windSpeedKts}k (F{bft.force})
                          </span>
                        );
                      })()}
                      Viento
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* INTERACTIVE FWI RISK ESTIMATOR & SIMULATION BRIDGE */}
        <div className="bg-[#111111] border border-[#2a1500] rounded-xl p-4.5 shadow-2xl flex flex-col justify-between space-y-3.5">
          <div>
            <div className="border-b border-[#2a1500] pb-2 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] flex items-center gap-1.5 font-mono">
                <Flame size={14} className="text-[#ff4500] animate-pulse" />
                Simulador de Riesgo e Índice FWI
              </h3>
              <span className="text-[8.5px] bg-[#1a0a00] border border-[#3d1800] text-[#ff8c42] px-1.5 rounded font-mono font-bold">ESTIMADOR INTERACTIVO</span>
            </div>

            {/* Inputs sliders */}
            <div className="mt-3.5 space-y-2 text-[10px] font-mono">
              <div className="grid grid-cols-2 gap-3">
                {/* Temp */}
                <div>
                  <div className="flex justify-between items-center text-stone-400 mb-0.5">
                    <span>Temp. Aire:</span>
                    <span className="text-white font-bold">{calcTemp}°C</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="48"
                    value={calcTemp}
                    onChange={(e) => setCalcTemp(Number(e.target.value))}
                    className="w-full h-1 bg-[#1a0a00] accent-[#ff4500] rounded focus:outline-none cursor-ew-resize"
                  />
                </div>
                {/* Humedad */}
                <div>
                  <div className="flex justify-between items-center text-stone-400 mb-0.5">
                    <span>Humedad Rel:</span>
                    <span className="text-white font-bold">{calcHum}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    value={calcHum}
                    onChange={(e) => setCalcHum(Number(e.target.value))}
                    className="w-full h-1 bg-[#1a0a00] accent-[#ff4500] rounded focus:outline-none cursor-ew-resize"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-1">
                {/* Viento */}
                <div>
                  <div className="flex justify-between items-center text-stone-400 mb-0.5">
                    <span>Viento Racha:</span>
                    <span className="text-white font-bold">{calcWind} km/h</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="65"
                    value={calcWind}
                    onChange={(e) => setCalcWind(Number(e.target.value))}
                    className="w-full h-1 bg-[#1a0a00] accent-[#ff4500] rounded focus:outline-none cursor-ew-resize"
                  />
                </div>
                {/* Sin lluvia */}
                <div>
                  <div className="flex justify-between items-center text-stone-400 mb-0.5">
                    <span>Días sin Lluvia:</span>
                    <span className="text-white font-bold">{calcRainlessDays}d</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={calcRainlessDays}
                    onChange={(e) => setCalcRainlessDays(Number(e.target.value))}
                    className="w-full h-1 bg-[#1a0a00] accent-[#ff4500] rounded focus:outline-none cursor-ew-resize"
                  />
                </div>
              </div>

              {/* Combustible select */}
              <div className="mt-1">
                <label className="text-stone-400 block mb-0.5 text-[8.5px] uppercase tracking-wider">Modelo de Combustible Forestal:</label>
                <select
                  value={calcFuelType}
                  onChange={(e) => setCalcFuelType(e.target.value)}
                  className="w-full bg-[#0a0500] border border-[#2a1500]/60 focus:border-[#ff4500]/50 text-stone-300 rounded px-2 py-1 text-[10px] cursor-pointer focus:outline-none font-sans"
                >
                  <option value="matorral_seco">Garriga / Matorral Seco Continental</option>
                  <option value="pinar">Pinar denso de pino carrasco / resinero</option>
                  <option value="eucaliptal">Eucaliptal racheado (combustibles colgantes)</option>
                  <option value="pasto">Pastizal fino agostado estival</option>
                  <option value="frondosas">Dehesas de robledal o encinar (humedad retenida)</option>
                </select>
              </div>
            </div>

            {/* Calculated Risk Output display card */}
            <div className={`mt-3 p-2.5 rounded-lg border text-xs font-mono space-y-1.5 ${computedRisk.riskBg}`}>
              <div className="flex justify-between items-center">
                <span className="font-sans font-bold">PELIGRO ESTIMADO FWI:</span>
                <span className="font-black px-2 py-0.5 rounded text-[10px] bg-black/60 border border-current">
                  {computedRisk.riskLabel} (FWI {computedRisk.fwi})
                </span>
              </div>
              <p className="text-[9.5px] leading-relaxed text-stone-300">{computedRisk.recommendations}</p>
              <p className="text-[8.5px] text-stone-500 italic">Combustible: {computedRisk.fuelLabel}</p>
            </div>
          </div>

          {/* Sync / Prefill with Simulator Button */}
          <button
            type="button"
            onClick={() => {
              // Pre-fill simulator coords with base location backup
              setInjLat(latitudBase);
              setInjLon(longitudBase);
              setInjRegion(`Simulacro FWI (${computedRisk.riskLabel} - FWI ${computedRisk.fwi})`);
              setInjFrp(String(Math.round(computedRisk.fwi * 2.8)));
              setInjDanger(computedRisk.riskLabel === 'Muy Alto' ? 'Extremo' : (computedRisk.riskLabel as any));
              
              // Smooth scroll to Simulation Operator form
              const operatorForm = document.getElementById('inspect-widget-view');
              if (operatorForm) {
                operatorForm.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="w-full bg-[#ff4500]/10 hover:bg-[#ff4500]/20 border border-[#ff4500]/30 hover:border-[#ff4500]/60 text-[#ff8c42] font-mono text-[9.5px] font-bold uppercase tracking-wider py-1.5 rounded transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Settings size={11} />
            <span>Sincronizar con Inyector de Simulacros</span>
          </button>
        </div>

        {/* Twitter Stream placeholder & SOS Guides */}
        <div className="bg-[#111111] border border-[#2a1500] rounded-xl p-4.5 shadow-2xl space-y-3 flex flex-col justify-between">
          <div>
            <div className="border-b border-[#2a1500] pb-2 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] flex items-center gap-1.5 font-mono">
                <Radio size={14} className="text-[#ff4500]" />
                Directo Twitter @IncendiosEspaña
              </h3>
              <span className="text-[8.5px] bg-[#1a0a00] border border-[#3d1800] text-red-400 px-1.5 rounded font-mono font-bold animate-pulse">SISTEMA LIVE</span>
            </div>

            <div className="mt-3.5 space-y-2.5 max-h-[145px] overflow-y-auto scrollbar-thin text-[10px] font-mono text-stone-400">
              {loading ? (
                <p className="p-3 text-stone-600">Sincronizando feed de mandos terrestres...</p>
              ) : data?.incendiosEspanaFeed.map((item, idx) => (
                <div key={idx} className="bg-black/40 border border-[#2a1500]/50 p-2.5 rounded-lg space-y-1 my-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#ff8c42] truncate font-sans">{item.title}</span>
                    <span className="text-[8.5px] text-stone-550 shrink-0">{item.time}</span>
                  </div>
                  <p className="text-stone-300 font-sans leading-relaxed">{item.content}</p>
                  <span className="text-[8px] text-stone-500 block">Autorizado: {item.source}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick civil protection rescue lines */}
          <div className="border-t border-[#2a1500] pt-2.5 flex items-center justify-between font-mono text-[9.5px] text-stone-500">
            <span>Emergencias Forestales España</span>
            <span className="font-semibold text-red-500">Marcación directa: <strong><a href="tel:112" className="hover:underline text-rose-450 text-xs text-white">112</a></strong> / <strong><a href="tel:062" className="hover:underline text-xs text-white">062</a></strong></span>
          </div>
        </div>

      </div>

      {/* COPERNICUS METEOROLOGICAL ALERT CHANNELS (RSS AT THE BOTTOM) */}
      <div className="p-5 bg-[#111111] border-t border-[#2a1500] space-y-3">
        <div className="border-b border-[#2a1500] pb-2 flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#ff8c42] flex items-center gap-1.5 font-mono">
            <Globe size={14.5} className="text-[#ff4500]" />
            Boletines Oficiales de la Unión Europea (EFFIS Copernicus RSS)
          </h3>
          <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest font-bold">Copernicus Emergency Service</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {loading ? (
            <p className="text-stone-600 text-[11px] font-mono p-4 col-span-3 text-center">Iniciando conexión síncrona con EFFIS Bruselas...</p>
          ) : data?.copernicusAlerts.map((a, i) => (
            <div key={i} className="bg-gradient-to-b from-[#1a1005] to-[#111111] border border-[#2a1520]/40 p-3 rounded-lg text-xs leading-relaxed text-stone-400 space-y-1 hover:border-[#ff4500]/20 transition-all">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <strong className="text-stone-200 truncate pr-2 max-w-[210px] block" title={a.title}>{a.title}</strong>
                <span className="text-stone-500 shrink-0">{a.date}</span>
              </div>
              <p className="text-[10.5px] leading-relaxed text-stone-450">{a.content}</p>
              <div className="text-right pt-2 border-t border-[#2a1500]/30 mt-1.5">
                <a href={a.link} target="_blank" rel="noreferrer" className="text-[#ff8c42] hover:text-[#ffaa66] text-[9.5px] font-mono hover:underline inline-flex items-center gap-1">
                  <span>EFFIS Portal</span>
                  <ExternalLink size={9.5} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER INDEXABLE SEO DISPLAY MATRICES (1-TO-1 WITH THE SUPPLIED ORIGINAL .ES PAGE) ── */}
      <footer id="seo-content" aria-label="Información sobre el mapa de incendios" className="px-6 py-8 border-t border-[#2a1500]/80">
        <div className="seo-inner">
          <nav id="seo-nav" aria-label="Secciones del proyecto" className="flex flex-wrap gap-2.5 pb-5 mb-5 border-b border-[#2a1500]">
            <a href="#comunidades" className="bg-[#1a0a00] border border-[#3d1800] hover:border-[#ff4500] rounded-md px-3 py-1.5 text-xs text-[#ff8c42] transition-colors leading-none font-semibold">Incendios por comunidad autónoma</a>
            <a href="#historico" className="bg-[#1a0a00] border border-[#3d1800] hover:border-[#ff4500] rounded-md px-3 py-1.5 text-xs text-[#ff8c42] transition-colors leading-none font-semibold">Histórico de incendios</a>
            <a href="#alertas" className="bg-[#1a0a00] border border-[#3d1800] hover:border-[#ff4500] rounded-md px-3 py-1.5 text-xs text-[#ff8c42] transition-colors leading-none font-semibold">Alertas y niveles de riesgo</a>
            <a href="#sobre-el-proyecto" className="bg-[#1a0a00] border border-[#3d1800] hover:border-[#ff4500] rounded-md px-3 py-1.5 text-xs text-[#ff8c42] transition-colors leading-none font-semibold">Sobre el proyecto</a>
          </nav>

          <h2>Cómo interpretar los datos del mapa</h2>
          <p className="mt-2 text-stone-500 leading-relaxed text-xs">
            Este mapa muestra los <strong>incendios forestales activos en España</strong> utilizando
            datos satelitales en tiempo real proporcionados por <strong>NASA FIRMS</strong>
            (Fire Information for Resource Management System). Los focos de incendio se detectan
            mediante los satélites <strong>VIIRS</strong> (Suomi NPP, NOAA-20 y NOAA-21) y <strong>MODIS</strong>
            (Terra y Aqua), complementados con datos <strong>EFFIS Copernicus</strong> (incluyendo Sentinel-3 SLSTR),
            con una resolución de hasta 375 m y actualización cada 5 minutos.
          </p>

          <h3 className="text-sm font-semibold text-[#ff8c42] mt-5 mb-2">¿Qué información muestra el mapa?</h3>
          <ul className="list-disc pl-5 text-stone-500 space-y-1.5 leading-relaxed text-xs">
            <li><strong>Focos de incendio activos</strong> en la península ibérica, Baleares y Canarias</li>
            <li><strong>Nivel de confianza</strong> de la detección satelital (alta, media o baja)</li>
            <li><strong>FRP (Fire Radiative Power)</strong>: potencia radiativa del fuego en megavatios, indicador de la intensidad del incendio</li>
            <li><strong>Fecha y hora UTC</strong> de detección por el satélite</li>
          </ul>

          <h3 className="text-sm font-semibold text-[#ff8c42] mt-5 mb-2">Fuentes de datos</h3>
          <p className="text-stone-500 leading-relaxed text-xs">
            Los datos de <strong>incendios en tiempo real en España</strong> proceden de
            {' '}<a href="https://firms.modaps.eosdis.nasa.gov/" rel="noopener" target="_blank" className="text-[#ff6a1a] hover:underline">NASA FIRMS</a>,
            gestionado por la NASA. Complementariamente se ofrece la capa WMS del
            {' '}<a href="https://effis.jrc.ec.europa.eu/" rel="noopener" target="_blank" className="text-[#ff6a1a] hover:underline">EFFIS</a>
            (European Forest Fire Information System) de Copernicus/UE.
          </p>

          <h3 className="text-sm font-semibold text-[#ff8c42] mt-5 mb-2">¿Con qué frecuencia se actualizan los datos?</h3>
          <p className="text-stone-500 leading-relaxed text-xs">
            Los datos satelitales de <strong>incendios forestales en España</strong> se actualizan
            automáticamente cada 5 minutos. Los satélites VIIRS y MODIS realizan pasadas sobre
            la Península Ibérica varias veces al día, por lo que en periodos sin pasada reciente
            los datos pueden tener hasta 1–2 horas de antigüedad.
          </p>

          <div id="eeeat" className="mt-6 pt-4 border-t border-[#2a1500]/60 text-[10.5px] text-stone-600 leading-relaxed">
            <strong>Sobre este proyecto:</strong> Plataforma de monitorización integrada en el Centro de Alertas del Pilar I.
            Los datos proceden directamente de <a href="https://firms.modaps.eosdis.nasa.gov/" rel="noopener" className="text-[#ff6a1a] hover:underline">NASA FIRMS</a>
            (Fire Information for Resource Management System), sin modificaciones ni interpolaciones.
            La geocodificación inversa utiliza <a href="https://nominatim.openstreetmap.org/" rel="noopener" className="text-[#ff6a1a] hover:underline">Nominatim</a> (OpenStreetMap).
            · <a href="#sobre-el-proyecto" className="text-[#ff6a1a] hover:underline">Metodología completa</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
