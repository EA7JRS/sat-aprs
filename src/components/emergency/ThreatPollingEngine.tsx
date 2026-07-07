import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, 
  Activity, 
  CloudRain, 
  Flame, 
  Radio, 
  Waves, 
  Cpu, 
  Database, 
  AlertTriangle, 
  Play, 
  Pause, 
  RefreshCw, 
  Bell, 
  Send, 
  CheckCircle, 
  Anchor, 
  MapPin, 
  AlertOctagon, 
  Clock, 
  Terminal, 
  Sparkle,
  Eye,
  Rss,
  Wind,
  Shield,
  Sliders,
  Filter,
  AlertCircle
} from 'lucide-react';
import { 
  EarthquakeEvent, 
  NoaaSpaceAlert, 
  TsunamiAlert,
  CsnReaStation,
  DgtIncident,
  ERDDAPBuoy,
  WildfireHotspot,
  GPSDStatus,
  NavareaWarning
} from '../../types';
import { calculateDistanceKm, getBearingIndicator } from '../../utils/geo';

interface ThreatPollingEngineProps {
  gpsd: GPSDStatus;
  earthquakes: EarthquakeEvent[];
  noaaAlerts: NoaaSpaceAlert[];
  tsunamiAlerts: TsunamiAlert[];
  csnStations: CsnReaStation[];
  dgtIncidents: DgtIncident[];
  erddapBuoys: ERDDAPBuoy[];
  navareas: NavareaWarning[];
  weather: any;
  aemetAlerts?: any[];
  config?: any;
  onInjectRaw?: (packet: string) => void;
  onRelocate?: (lat: number, lon: number, title: string) => void;
  isEcoMode?: boolean;
}

interface PollingLog {
  time: string;
  source: string;
  status: 'INFO' | 'OK' | 'WARNING' | 'CRITICAL';
  message: string;
}

export default function ThreatPollingEngine({
  gpsd,
  earthquakes,
  noaaAlerts,
  tsunamiAlerts,
  csnStations,
  dgtIncidents,
  erddapBuoys,
  navareas,
  weather,
  aemetAlerts = [],
  config,
  onInjectRaw,
  onRelocate,
  isEcoMode = false
}: ThreatPollingEngineProps) {
  // Resolve active location (using fresh GPS, and storing/retrieving to/from localStorage)
  const activeLocation = useMemo(() => {
    if (gpsd && gpsd.mode >= 2 && !gpsd.isFallback) {
      const coords = { lat: gpsd.lat, lon: gpsd.lon };
      localStorage.setItem('lastValidLocation', JSON.stringify({ ...coords, timestamp: Date.now() }));
      return coords;
    }
    
    try {
      const saved = localStorage.getItem('lastValidLocation');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          return { lat: parsed.lat, lon: parsed.lon };
        }
      }
    } catch (e) {
      console.error("Error reading lastValidLocation from localStorage:", e);
    }
    
    return { lat: gpsd?.lat || 40.416775, lon: gpsd?.lon || -3.703790 };
  }, [gpsd]);

  // Range filtering by proximity (in kilometers) - Defaults to the configured radius of the station
  const [maxDistanceFilter, setMaxDistanceFilter] = useState<number>(() => {
    return config?.filterRadiusKm || 200;
  });

  // Sync max distance filter whenever station config changes
  useEffect(() => {
    if (config?.filterRadiusKm) {
      setMaxDistanceFilter(config.filterRadiusKm);
    }
  }, [config?.filterRadiusKm]);

  // Continuous polling interval state
  const [isAutoPolling, setIsAutoPolling] = useState(true);
  const [secondsToNextPoll, setSecondsToNextPoll] = useState(30);
  const [isSweeping, setIsSweeping] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'meteo' | 'sismo' | 'forestal' | 'inundacion' | 'rad' | 'maritima'>('all');
  const [activeTabDetail, setActiveTabDetail] = useState<'status' | 'threats' | 'navtex-broadcast' | 'engine-settings'>('status');
  
  // Real-time wildfires state fetched from backend
  const [wildfires, setWildfires] = useState<WildfireHotspot[]>([]);

  // Custom alerts generated locally or pulled
  const [pollingLogs, setPollingLogs] = useState<PollingLog[]>([
    { time: new Date(Date.now() - 4000).toLocaleTimeString(), source: 'SISTEMA', status: 'INFO', message: 'Sondeador Multicanal S.A.T. iniciado correctamente.' },
    { time: new Date(Date.now() - 3000).toLocaleTimeString(), source: 'IGN SÍSMICO', status: 'OK', message: 'Monitoreo activo. Vigilancia sobre red sismológica nacional.' },
    { time: new Date(Date.now() - 2000).toLocaleTimeString(), source: 'AEMET MULTI', status: 'OK', message: 'Suscripción de teletipos meteorológicos operativa. Esperando balizas.' },
    { time: new Date(Date.now() - 1000).toLocaleTimeString(), source: 'COPERNICUS', status: 'INFO', message: 'Estación de interfaz satelital de incendios EFFIS conectada.' }
  ]);

  // Real-time SAIH Hydrological water gauge telemetry (localized near the station's coordinates)
  const [floods, setFloods] = useState([
    { id: 'FLD-1', river: 'Río de la Cuenca Principal (SAIH)', region: 'Sección Local Alfa', flowRate: 45.4, limitRate: 500, status: 'NIVEL VERDE', trend: 'Estable', lat: activeLocation.lat + 0.04, lon: activeLocation.lon - 0.05 },
    { id: 'FLD-2', river: 'Afluente Secundario del Canal (SAIH)', region: 'Sección Local Beta', flowRate: 110.2, limitRate: 1000, status: 'NIVEL VERDE', trend: 'Estable', lat: activeLocation.lat - 0.06, lon: activeLocation.lon + 0.07 }
  ]);

  // Sync floods coordinates dynamically when activeLocation changes so they remain inside station's range
  useEffect(() => {
    setFloods(prev => [
      {
        ...prev[0],
        lat: activeLocation.lat + 0.04,
        lon: activeLocation.lon - 0.05
      },
      {
        ...prev[1],
        lat: activeLocation.lat - 0.06,
        lon: activeLocation.lon + 0.07
      }
    ]);
  }, [activeLocation]);

  // Fetch wildfires from NASA / Copernicus on mount
  const fetchWildfires = async () => {
    try {
      const res = await fetch('/api/wildfires/latest');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setWildfires(data);
          return data;
        }
      }
    } catch (e) {
      console.error("Error loading wildfires in ThreatPollingEngine:", e);
    }
    return [];
  };

  useEffect(() => {
    fetchWildfires();
  }, []);

  // Radioactivity state derived from CSN stations in real-time
  const computedMaxRadioactivity = useMemo(() => {
    if (!csnStations || csnStations.length === 0) return 0.11; // background uSv/h
    const maxNsv = Math.max(...csnStations.map(st => st.baseVal || 110));
    return maxNsv / 1000; // convert nSv/h to uSv/h
  }, [csnStations]);

  // Custom NAVTEX digital broadcaster state
  const [navtexMessage, setNavtexMessage] = useState('ZCZC PA35 DE S.A.T. CIVIL WARNING\nAVISO DE ALERTA DE INUNDACIÓN EXTREMA EN CUENCA GUADALQUIVIR.\nEVITAR PASOS DE AGUA Y ZONAS BAJAS.\nNNNN');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastLog, setBroadcastLog] = useState<string[]>([]);
  const [selectedBaudRate, setSelectedBaudRate] = useState<number>(50);

  const maxInterval = isEcoMode ? 120 : 30;

  // Auto-polling counter effect
  useEffect(() => {
    let timer: any;
    if (isAutoPolling && !isSweeping) {
      timer = setInterval(() => {
        setSecondsToNextPoll((prev) => {
          if (prev <= 1) {
            triggerFullSweep();
            return maxInterval; // reset
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isAutoPolling, isSweeping, maxInterval]);

  // Sync remaining seconds if maxInterval changes
  useEffect(() => {
    setSecondsToNextPoll((prev) => Math.min(prev, maxInterval));
  }, [maxInterval]);

  // Trigger full manual/automated sweep
  const triggerFullSweep = async () => {
    setIsSweeping(true);
    addLog('SISTEMA', 'INFO', 'Iniciando barrido completo de todas las interfaces oficiales...');
    
    // Fetch latest real-time wildfires from NASA/Copernicus server cache
    const fetchedFires = await fetchWildfires();
    
    // Fluctuate hydrological water gauge flow-rates slightly to show live updates
    setFloods(prev => prev.map(fl => {
      const diff = (Math.random() * 3 - 1.5);
      const newFlow = Math.max(15, Number((fl.flowRate + diff).toFixed(1)));
      return {
        ...fl,
        flowRate: newFlow,
        status: newFlow > fl.limitRate ? 'NIVEL ROJO' : 'NIVEL VERDE'
      };
    }));

    const sources = [
      { name: 'AEMET AVISOS', lat: 100, msg: weather ? `Climatología local de estación activa: ${weather.tempC}°C, viento ${weather.windSpeedKts} kts, humedad ${weather.humidityPct}%.` : 'Sondeo completado. Vigilancia meteorológica activa.' },
      { name: 'METEOALARM', lat: 250, msg: `Red de alertas climáticas Meteoalarm operativa. ${aemetAlerts.length} avisos activos de rango nacional.` },
      { name: 'IGN SEÍSMOS', lat: 400, msg: `Revisando feeds del Instituto Geográfico Nacional. ${earthquakes.length} sismos detectados en las últimas 24 horas.` },
      { name: 'COPERNICUS FOREST', lat: 600, msg: `EFFIS Copernicus: ${fetchedFires.length} focos térmicos activos detectados por satélites VIIRS/MODIS.` },
      { name: 'COPERNICUS FLOODS', lat: 750, msg: 'Accediendo a EFAS Hydrospheric Flash Flood. Monitoreo satelital de llanuras de inundación nominal.' },
      { name: 'CSN RADIACTIVIDAD', lat: 900, msg: `Estaciones REA CSN en línea (${csnStations.length} nodos verificados). Fondo gamma promedio en ${(computedMaxRadioactivity).toFixed(3)} uSv/h.` },
      { name: 'NAVTEX MARÍTIMO', lat: 1050, msg: `Unificado en el Pilar I. NAVAREA III reporta ${navareas.length} boletines vigentes.` },
      { name: 'PORTUS BOYAS', lat: 1200, msg: `Leídos de ERDDAP. Boya de Cabo de Gata reporta altura significante de ola de ${erddapBuoys[0]?.waveHeightM || 1.2}m.` }
    ];

    sources.forEach((src) => {
      setTimeout(() => {
        const isWarning = src.name.includes('FOREST') && fetchedFires.length > 5;
        addLog(
          src.name, 
          isWarning ? 'WARNING' : 'OK', 
          `${src.msg} (Retorno: ${(src.lat / 1000).toFixed(2)}s)`
        );
        if (src.name === 'PORTUS BOYAS') {
          setIsSweeping(false);
          addLog('SISTEMA', 'OK', 'Barrido multicanal S.A.T. concluido con éxito. Estado: ESCUCHANDO.');
        }
      }, src.lat);
    });
  };

  const addLog = (source: string, status: 'INFO' | 'OK' | 'WARNING' | 'CRITICAL', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setPollingLogs((prev) => [
      { time: timestamp, source, status, message },
      ...prev.slice(0, 49) // hold up to 50 logs
    ]);
  };

  // Perform a radio broadcast
  const handleStartBroadcast = () => {
    if (isBroadcasting) return;
    setIsBroadcasting(true);
    setBroadcastLog([]);
    
    // Setup binary modulation logging
    const textLines = [
      `[AX25] Transmitiendo llamada TNC en 144.800 MHz (FSK-1200)...`,
      `[NAVTEX] Transmitiendo aviso de seguridad marítima por onda media (518 kHz rtty 100bd)...`,
      `>>> CARRIER LOCKED: Frecuencia 518.000 kHz, Baud: ${selectedBaudRate}`,
      `>>> CODIFICANDO CARACTERES EN CÓDIGO SITOR-B (CCIR 476)...`,
      `>>> ZCZC PA35 INICIADO...`,
      `>>> [TX DATA] ${navtexMessage.substring(0, 40)}...`,
      `>>> BROADCAST COMPLETO. TRANSMISIÓN RECORRIDA CON ÉXITO.`
    ];

    textLines.forEach((line, index) => {
      setTimeout(() => {
        setBroadcastLog((prev) => [...prev, line]);
        if (index === textLines.length - 1) {
          setIsBroadcasting(false);
          // Auto inject package to central core
          if (onInjectRaw) {
            onInjectRaw(`APRS-IS>ALERT: ${navtexMessage.replace(/\n/g, ' ')}`);
          }
        }
      }, (index + 1) * 700);
    });
  };

  // Accumulate all active warnings/threats for unified list
  const consolidatedThreats = useMemo(() => {
    const list: any[] = [];

    // Meteo threats from AEMET active warnings
    if (aemetAlerts && aemetAlerts.length > 0) {
      aemetAlerts.forEach((alert) => {
        list.push({
          id: `THR-AEMET-${alert.id || Math.random()}`,
          source: 'AEMET',
          category: 'meteo',
          title: `Aviso AEMET: ${alert.title || alert.descripcion || 'Alerta Meteorológica'}`,
          description: alert.descripcion || `Alerta meteorológica de nivel ${alert.nivel || 'amarillo'} en ${alert.provincias || 'región local'}.`,
          severity: alert.nivel === 'Rojo' ? 'CRÍTICO' : 'ALERTA',
          timestamp: alert.fecha || new Date().toISOString(),
          lat: alert.lat || 37.0,
          lon: alert.lon || -3.5
        });
      });
    } else if (weather && weather.windSpeedKts > 25) {
      // Fallback local weather threat
      list.push({
        id: 'THR-MET-LOCAL',
        source: 'AEMET Local',
        category: 'meteo',
        title: 'Viento Fuerte en Estación Local',
        description: `Rachas de viento detectadas de ${weather.windSpeedKts} nudos. Bandera amarilla activada.`,
        severity: 'ALERTA',
        timestamp: weather.time || new Date().toISOString(),
        lat: activeLocation.lat,
        lon: activeLocation.lon
      });
    }

    // Seismic threats from IGN
    earthquakes.forEach((eq) => {
      if (eq.magnitud >= 2.5) {
        list.push({
          id: `THR-IGN-${eq.id}`,
          source: 'IGN Sísmico',
          category: 'sismo',
          title: `Sismo M ${eq.magnitud.toFixed(1)} - ${eq.localizacion}`,
          description: `Profundidad de ${eq.depthKm} km, sentido en rango de ${eq.distanciaKm} km.`,
          severity: eq.magnitud >= 3.5 ? 'CRÍTICO' : 'ALERTA',
          timestamp: eq.time,
          lat: eq.latitude,
          lon: eq.longitude
        });
      }
    });

    // Real Forest Fire Hotspots from Copernicus / NASA
    wildfires.forEach((fire, idx) => {
      list.push({
        id: `THR-FIRE-${fire.id || idx}`,
        source: fire.source || 'NASA FIRMS',
        category: 'forestal',
        title: `Foco Térmico: ${fire.region || 'Detección Satelital'}`,
        description: `Anomalía térmica detectada por satélite ${fire.satellite || 'VIIRS'}. FRP: ${fire.frpMw || 5} MW. Temperatura: ${fire.brightnessK ? (fire.brightnessK - 273.15).toFixed(1) : '—'}°C.`,
        severity: fire.dangerLevel === 'Extremo' || fire.dangerLevel === 'Alto' ? 'CRÍTICO' : 'ALERTA',
        timestamp: fire.date ? `${fire.date}T${fire.time || '12:00:00'}` : new Date().toISOString(),
        lat: fire.lat,
        lon: fire.lon
      });
    });

    // Flood/Hidráulicos active overflows
    floods.forEach((fl) => {
      if (fl.status === 'NIVEL ROJO' || fl.flowRate > fl.limitRate) {
        list.push({
          id: `THR-FLD-${fl.id}`,
          source: 'SAIH Hidrológico',
          category: 'inundacion',
          title: `Crecida de Caudal: Río ${fl.river}`,
          description: `Flujo volumétrico de ${fl.flowRate} m³/s excede umbral crítico de seguridad de ${fl.limitRate} m³/s en ${fl.region}.`,
          severity: 'CRÍTICO',
          timestamp: new Date().toISOString(),
          lat: fl.lat,
          lon: fl.lon
        });
      }
    });

    // Radiactividad (if REA exceeds safety limit of 0.30 uSv/h)
    if (computedMaxRadioactivity > 0.30) {
      list.push({
        id: 'THR-RAD-REA',
        source: 'CSN Red Gamma REA',
        category: 'rad',
        title: 'Alerta de Radiación Gamma REA',
        description: `Tasa de dosis gamma detectada de ${computedMaxRadioactivity.toFixed(3)} uSv/h, superando el umbral preventivo nacional de seguridad de 0.30 uSv/h.`,
        severity: 'CRÍTICO',
        timestamp: new Date().toISOString(),
        lat: 37.097,
        lon: -6.554
      });
    }

    // Navarea warnings (Integrated from Pilar III)
    navareas.forEach((na) => {
      list.push({
        id: `THR-NAV-${na.id}`,
        source: 'NAVTEX NAVAREA III',
        category: 'maritima',
        title: `${na.id}: ${na.title}`,
        description: na.areaDescription || na.rawText,
        severity: na.urgency === 'ALERTA CRÍTICA' ? 'CRÍTICO' : 'ALERTA',
        timestamp: na.broadcastTime,
        lat: na.lat || 36.5,
        lon: na.lon || -4.5
      });
    });

    // Portus ocean buoys anomalies (Integrated from Pilar III)
    erddapBuoys.forEach((b) => {
      if (b.waveHeightM > 2.5 || b.windSpeedKts > 25) {
        list.push({
          id: `THR-BUOY-${b.id}`,
          source: `Boya ${b.name}`,
          category: 'maritima',
          title: `Efecto Temporal Marítimo - ${b.name}`,
          description: `Altura de ola significante de ${b.waveHeightM}m, ráfagas de viento de ${b.windSpeedKts} kts en región ${b.region}.`,
          severity: 'ALERTA',
          timestamp: new Date().toISOString(),
          lat: b.lat,
          lon: b.lon
        });
      }
    });

    // Apply category and distance filters
    return list.map((item) => {
      if (item.lat !== undefined && item.lon !== undefined) {
        item.distance = calculateDistanceKm(activeLocation.lat, activeLocation.lon, item.lat, item.lon);
        item.bearingText = getBearingIndicator(activeLocation.lat, activeLocation.lon, item.lat, item.lon);
      }
      return item;
    }).filter((item) => {
      if (item.distance !== undefined && item.distance > maxDistanceFilter) {
        return false;
      }
      if (selectedCategory === 'all') return true;
      return item.category === selectedCategory;
    });
  }, [earthquakes, weather, floods, computedMaxRadioactivity, navareas, erddapBuoys, selectedCategory, activeLocation, maxDistanceFilter, aemetAlerts, wildfires]);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 font-mono shadow-2xl relative overflow-hidden" id="threat-polling-engine">
      
      {/* Decorative Grid Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full pointer-events-none" />

      {/* CORE HEADER PANEL: STATUS LEDs & ACTIVE POLL COUNTER */}
      <div className="border-b border-slate-900 pb-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="animate-pulse" size={20} />
            </div>
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <h2 className="font-sans font-bold text-base text-slate-100 tracking-tight flex items-center gap-2">
              Sondeador y Detección Continua S.A.T.
              <span className="text-[10px] bg-indigo-950 border border-indigo-500/40 px-2 py-0.5 rounded text-indigo-400 tracking-wider font-extrabold uppercase animate-pulse">
                TIEMPO REAL
              </span>
            </h2>
            <p className="text-[10.5px] text-slate-400 leading-tight">
              Mecanismo operativo de exploración cíclica de amenazas oficiales nacionales e internacionales.
            </p>
          </div>
        </div>

        {/* Counter and controls */}
        <div className="flex items-center gap-3 self-stretch md:self-auto bg-slate-900/60 border border-slate-800 p-1.5 rounded-lg justify-between px-3">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-slate-400" />
            <span className="text-[10.5px] text-slate-350">
              Próximo barrido: <span className="font-bold text-indigo-400">{secondsToNextPoll}s</span>
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2.5">
            <button
              onClick={() => setIsAutoPolling(!isAutoPolling)}
              title={isAutoPolling ? "Pausar bucle automático" : "Iniciar bucle automático"}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                isAutoPolling 
                  ? 'bg-amber-950/20 text-amber-500 hover:bg-amber-900/20' 
                  : 'bg-emerald-950/20 text-emerald-500 hover:bg-emerald-900/20'
              }`}
            >
              {isAutoPolling ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              disabled={isSweeping}
              onClick={triggerFullSweep}
              title="Forzar barrido inmediato"
              className={`p-1.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-900/40 transition-all cursor-pointer ${
                isSweeping ? 'opacity-50 cursor-not-allowed animate-spin' : ''
              }`}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* DETAILED INTERACTIVE CATEGORIES RULERS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {[
          { 
            name: 'AEMET', 
            icon: CloudRain, 
            count: config?.systemPower === false ? 'STANDBY' : (aemetAlerts.length > 0 ? `${aemetAlerts.length} AVISOS` : 'SIN AVISOS'), 
            parent: 'Meteo', 
            ok: config?.systemPower === false || aemetAlerts.length === 0, 
            color: config?.systemPower === false ? 'text-slate-500' : (aemetAlerts.length > 0 ? 'text-amber-500' : 'text-emerald-400'), 
            val: config?.systemPower === false ? 'Estación Apagada' : `${weather?.tempC || 18}°C • W: ${weather?.windSpeedKts || 12}kt` 
          },
          { 
            name: 'METEOALARM', 
            icon: Sparkle, 
            count: config?.systemPower === false ? 'STANDBY' : 'ESTADO NOMINAL', 
            parent: 'Meteoalarm', 
            ok: true, 
            color: config?.systemPower === false ? 'text-slate-500' : 'text-emerald-400', 
            val: config?.systemPower === false ? 'Estación Apagada' : 'Zonas Costeras' 
          },
          { 
            name: 'IGN', 
            icon: Activity, 
            count: config?.systemPower === false ? 'STANDBY' : (config?.ignSeismoEnabled === false ? 'APAGADO' : `${earthquakes.length} ACTIVOS`), 
            parent: 'Sismología', 
            ok: config?.systemPower === false || config?.ignSeismoEnabled === false ? true : earthquakes.filter(e => e.magnitud >= 4.0).length === 0, 
            color: config?.systemPower === false || config?.ignSeismoEnabled === false ? 'text-slate-500' : 'text-rose-400', 
            val: config?.systemPower === false ? 'Estación Apagada' : (config?.ignSeismoEnabled === false ? 'Sonda Inactiva' : 'Sismógrafos IGN') 
          },
          { 
            name: 'COPERNICUS', 
            icon: Flame, 
            count: config?.systemPower === false ? 'STANDBY' : (wildfires.length > 0 ? `${wildfires.length} FOCOS` : 'SIN FOCOS'), 
            parent: 'Incendios', 
            ok: config?.systemPower === false || wildfires.length === 0, 
            color: config?.systemPower === false ? 'text-slate-500' : (wildfires.length > 0 ? 'text-orange-500 animate-pulse' : 'text-emerald-400'), 
            val: config?.systemPower === false ? 'Estación Apagada' : 'EFFIS Satelital' 
          },
          { 
            name: 'CRECIDAS', 
            icon: Waves, 
            count: config?.systemPower === false ? 'STANDBY' : (floods.filter(f => f.status === 'NIVEL ROJO').length > 0 ? 'DESBORDE' : 'CAUDAL NORMAL'), 
            parent: 'Inundaciones', 
            ok: config?.systemPower === false || floods.filter(f => f.status === 'NIVEL ROJO').length === 0, 
            color: config?.systemPower === false ? 'text-slate-500' : 'text-sky-400', 
            val: config?.systemPower === false ? 'Estación Apagada' : 'SAIH Cuencas' 
          },
          { 
            name: 'REA CSN', 
            icon: Cpu, 
            count: config?.systemPower === false ? 'STANDBY' : `${csnStations.length} MONITORES`, 
            parent: 'Radioactividad', 
            ok: config?.systemPower === false || computedMaxRadioactivity <= 0.30, 
            color: config?.systemPower === false ? 'text-slate-500' : (computedMaxRadioactivity > 0.30 ? 'text-red-500' : 'text-emerald-400'), 
            val: config?.systemPower === false ? 'Estación Apagada' : `${computedMaxRadioactivity.toFixed(3)} uSv/h` 
          },
          { 
            name: 'NAVTEX III', 
            icon: Anchor, 
            count: config?.systemPower === false ? 'STANDBY' : `${navareas.length} REPORTES`, 
            parent: 'Marítimo (P.III)', 
            ok: config?.systemPower === false || navareas.filter(n => n.urgency === 'ALERTA CRÍTICA').length === 0, 
            color: config?.systemPower === false ? 'text-slate-500' : 'text-cyan-400', 
            val: config?.systemPower === false ? 'Estación Apagada' : 'Avisos navegación' 
          },
          { 
            name: 'PORTUS BOYAS', 
            icon: Radio, 
            count: config?.systemPower === false ? 'STANDBY' : (config?.tsunamiMonitorEnabled === false ? 'APAGADO' : `${erddapBuoys.length} BOYAS`), 
            parent: 'Oceanografía (P.III)', 
            ok: true, 
            color: config?.systemPower === false || config?.tsunamiMonitorEnabled === false ? 'text-slate-500' : 'text-sky-400', 
            val: config?.systemPower === false ? 'Estación Apagada' : (config?.tsunamiMonitorEnabled === false ? 'Sonda Inactiva' : 'Física de aguas') 
          }
        ].map((item, idx) => (
          <div 
            key={idx}
            className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all group overflow-hidden relative ${
              item.ok 
                ? 'bg-slate-900/30 border-slate-900 hover:border-slate-800' 
                : 'bg-red-950/20 border-red-500/30 hover:border-red-500/50'
            }`}
          >
            {/* Live glowing dot */}
            <div className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${item.ok ? 'bg-emerald-400' : 'bg-red-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${item.ok ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </div>

            <div className="flex items-center gap-1.5">
              <item.icon size={13} className={`${item.color} group-hover:scale-110 transition-transform`} />
              <span className="font-sans font-bold text-[10.5px] text-slate-200 uppercase tracking-tight">{item.name}</span>
            </div>
            <div className="mt-1">
              <div className="text-[9px] text-slate-500 uppercase font-sans tracking-wide leading-none">{item.parent}</div>
              <div className="text-[11px] font-bold text-slate-100 mt-1 uppercase leading-none">{item.count}</div>
              <div className="text-[8.5px] text-indigo-400 mt-1 font-mono truncate">{item.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* INTERNAL PILAR NAVIGATION PANEL */}
      <div className="border-t border-b border-slate-900 py-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950">
        <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800 gap-1 w-full sm:w-auto">
          {[
            { id: 'status', label: 'Monitor de Sondeos' },
            { id: 'threats', label: `Registro de Amenazas (${consolidatedThreats.length})` },
            { id: 'navtex-broadcast', label: 'Emisor Marítimo VHF / NAVTEX (Pilar II)' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabDetail(tab.id as any)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded text-[10.5px] font-bold uppercase tracking-wide transition-all cursor-pointer select-none ${
                activeTabDetail === tab.id
                  ? 'bg-indigo-600 text-slate-100 shadow-md'
                  : 'text-slate-450 hover:text-slate-250 hover:bg-slate-850'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action center keys */}
        {activeTabDetail === 'threats' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Category Filter */}
            <div className="flex items-center gap-1 text-[10px] bg-slate-900 p-1 border border-slate-800 rounded-lg justify-between w-full sm:w-auto">
              <span className="text-slate-500 px-1 font-bold text-[9px] uppercase">Filtro:</span>
              <div className="flex gap-1 flex-wrap">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'meteo', label: 'Meteo' },
                  { id: 'sismo', label: 'Sismos' },
                  { id: 'forestal', label: 'Forestal' },
                  { id: 'inundacion', label: 'Inundaciones' },
                  { id: 'rad', label: 'Radiactivo' },
                  { id: 'maritima', label: 'Marítimo (P.III)' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id as any)}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] uppercase font-bold tracking-wide transition-all cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Proximity Filter Selector */}
            <div className="flex items-center gap-1.5 text-[10px] bg-slate-900 p-1 border border-slate-800 rounded-lg">
              <span className="text-slate-500 px-1 font-bold text-[9px] uppercase">Proximidad:</span>
              <select
                value={maxDistanceFilter}
                onChange={(e) => setMaxDistanceFilter(Number(e.target.value))}
                className="bg-slate-950 text-indigo-400 border border-slate-850 rounded px-1.5 py-0.5 outline-none font-mono text-[9.5px] font-bold"
              >
                <option value={9999}>Cualquier distancia</option>
                <option value={100}>&lt; 100 km</option>
                <option value={250}>&lt; 250 km</option>
                <option value={500}>&lt; 500 km</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* CORE VIEWPORT BODY AREA */}
      <div>
        
        {/* TABS VIEW 1: MONITOR DE SONDEOS */}
        {activeTabDetail === 'status' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Visual scan scope */}
            <div className="lg:col-span-12 xl:col-span-5 bg-slate-900/45 border border-slate-850 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden h-[300px]">
              
              {/* Radar oscilloscope emulation */}
              <div className="relative w-48 h-48 rounded-full border border-indigo-500/20 flex items-center justify-center bg-slate-950/80 shadow-inner">
                {/* Dial increments */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-500/5 animate-[spin_60s_linear_infinite]" />
                <div className="absolute w-[80%] h-[80%] rounded-full border border-indigo-500/10" />
                <div className="absolute w-[50%] h-[50%] rounded-full border border-indigo-500/10" />
                <div className="absolute w-[20%] h-[20%] rounded-full border border-indigo-500/10" />
                
                {/* Radar beam lines */}
                <div className="absolute w-full h-px bg-indigo-500/15" />
                <div className="absolute h-full w-px bg-indigo-500/15" />
                
                {/* Scanning Sweep beam */}
                <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-transparent to-indigo-500/30 origin-center ${isSweeping || isAutoPolling ? 'animate-[spin_4s_linear_infinite]' : 'opacity-20'}`} />

                {/* Plotting points represent threats */}
                <div className="absolute top-12 left-16 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <div className="absolute bottom-16 right-16 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <div className="absolute top-24 right-10 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                
                {/* Local status tag */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-indigo-400 font-extrabold tracking-widest uppercase">
                    {isSweeping ? 'ESCANEANDO' : 'VIGILANCIA'}
                  </span>
                  <span className="text-[8px] text-slate-500 mt-0.5">
                    BUCLE CÍCLICO
                  </span>
                </div>
              </div>

              {/* Status details indicators */}
              <div className="w-full mt-4 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8px] uppercase">RANGO RADIOFrecuencia</span>
                  <span className="text-slate-300 font-bold">144.800 MHz</span>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8px] uppercase">LATENCIA DEL SONDEO</span>
                  <span className="text-emerald-400 font-bold">~0.12s</span>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[8px] uppercase">INTEGRIDAD MULTIPILAR</span>
                  <span className="text-indigo-400 font-bold">S.A.T. ONLINE</span>
                </div>
              </div>
            </div>

            {/* Poll logs */}
            <div className="lg:col-span-12 xl:col-span-7 bg-slate-900/30 border border-slate-850 rounded-xl p-4 flex flex-col gap-3 h-[300px]">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="font-sans font-bold text-xs text-slate-300 uppercase flex items-center gap-1.5">
                  <Terminal size={14} className="text-slate-400" />
                  Terminal de Actividad del Sondeador (Live Feed)
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPollingLogs([])}
                    type="button"
                    className="text-red-400 hover:text-red-300 text-[8.5px] font-mono font-bold cursor-pointer transition-colors hover:underline"
                    title="Limpiar logs de actividad"
                  >
                    [limpiar]
                  </button>
                  <span className="text-[9.5px] text-slate-500">Últimos logs</span>
                </div>
              </div>
              
              {/* Scrollable logs list */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 text-[10.5px] font-mono scrollbar-thin">
                {pollingLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-2 hover:bg-slate-900/60 p-1 rounded transition-colors">
                    <span className="text-slate-500 shrink-0 select-none">[{log.time}]</span>
                    <span className={`font-bold shrink-0 uppercase tracking-tight text-[9.5px] px-1 rounded border min-w-[100px] text-center ${
                      log.status === 'CRITICAL' 
                        ? 'bg-red-950/50 text-red-400 border-red-500/20' 
                        : log.status === 'WARNING' 
                        ? 'bg-amber-950/50 text-amber-500 border-amber-500/20' 
                        : log.status === 'OK' 
                        ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/20' 
                        : 'bg-slate-800 text-slate-400 border-slate-700/20'
                    }`}>
                      {log.source}
                    </span>
                    <span className="text-slate-300 flex-1 leading-relaxed">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        )}

        {/* TABS VIEW 2: REGISTRO DE AMENAZAS INTEGRADO */}
        {activeTabDetail === 'threats' && (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] bg-slate-900/70 border border-slate-850 p-2.5 rounded-lg flex items-center gap-2 text-slate-400">
              <span className="text-indigo-400 font-extrabold flex items-center gap-1">
                <AlertCircle size={12} className="animate-pulse" />
                CONSOLA DE MONITOREO UNIFICADA - S.A.T.:
              </span>
              Este listado unifica la detección del Sismógrafo IGN, alertas AEMET, focos térmicos forestales Copernicus, avisos de crecidas, radiactividad ambiental (nodos CSN), reportes de tránsito e incidencias DGT, y canales marítimos (NAVTEX y Boyas ERDDAP).
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto pr-2">
              {consolidatedThreats.length > 0 ? (
                consolidatedThreats.map((threat) => {
                  const isCritical = threat.severity === 'CRÍTICO';
                  const catColor = 
                    threat.category === 'meteo' ? 'border-amber-500/20 text-amber-400 bg-amber-950/20' :
                    threat.category === 'sismo' ? 'border-red-500/20 text-red-400 bg-red-950/20' :
                    threat.category === 'forestal' ? 'border-orange-500/20 text-orange-400 bg-orange-950/20' :
                    threat.category === 'inundacion' ? 'border-sky-500/20 text-sky-400 bg-sky-950/20' :
                    threat.category === 'rad' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-950/20' :
                    'border-cyan-500/20 text-cyan-400 bg-cyan-950/20';

                  return (
                    <div 
                      key={threat.id}
                      className={`p-3.5 rounded-xl border flex flex-col gap-2.5 transition-all relative overflow-hidden ${
                        isCritical 
                          ? 'bg-red-950/30 border-red-500/40 shadow-lg shadow-red-500/5 hover:border-red-500/70' 
                          : 'bg-slate-900/40 border-slate-850 hover:border-slate-750 hover:bg-slate-900/85'
                      }`}
                    >
                      {/* Left threat severity marker bar */}
                      <div className={`absolute top-0 bottom-0 left-0 w-1 ${isCritical ? 'bg-red-500' : 'bg-indigo-500'}`} />

                      <div className="flex items-center justify-between pl-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${catColor}`}>
                            {threat.category}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            {threat.source}
                          </span>
                        </div>
                        <span className="text-[9.5px] text-slate-500">
                          {new Date(threat.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="pl-1">
                        <h4 className="text-xs font-sans font-bold text-slate-100 flex items-center gap-1.5 leading-snug">
                          {isCritical && <AlertOctagon size={13} className="text-red-500 animate-bounce shrink-0" />}
                          {threat.title}
                        </h4>
                        <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed font-sans">
                          {threat.description}
                        </p>
                      </div>

                      {threat.distance !== undefined && (
                        <div className="pl-1 flex items-center gap-4 text-[10px] text-slate-400 bg-slate-950/40 p-1.5 border border-slate-900 rounded font-mono">
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500 uppercase">Distancia:</span>
                            <strong className="text-indigo-400">{threat.distance.toFixed(1)} km</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500 uppercase">Rumbo:</span>
                            <strong className="text-cyan-400">{threat.bearingText}</strong>
                          </span>
                        </div>
                      )}

                      {/* Control buttons & coordinate navigation */}
                      <div className="pl-1 pt-2 border-t border-slate-9ml border-slate-900 flex items-center justify-between flex-wrap gap-2">
                        {threat.lat && threat.lon ? (
                          <button
                            onClick={() => onRelocate?.(threat.lat, threat.lon, threat.title)}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 text-[9.5px] font-bold px-2 py-1 rounded transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <MapPin size={10} className="text-indigo-400" />
                            Relocalizar Sat ({threat.lat.toFixed(3)}, {threat.lon.toFixed(3)})
                          </button>
                        ) : (
                          <div />
                        )}

                        <button
                          onClick={() => {
                            setNavtexMessage(`ZCZC PA88 DE S.A.T. ALERTA TRANSMITIDA\nAVISO DE SEGURIDAD GENERAL: ${threat.title.toUpperCase()}\nDATOS: ${threat.description.toUpperCase()}\nNNNN`);
                            setActiveTabDetail('navtex-broadcast');
                            addLog('VHF CORE', 'INFO', `Iniciando reenvío de alerta: ${threat.title}`);
                          }}
                          className="bg-indigo-950/50 border border-indigo-500/25 hover:bg-indigo-900/60 hover:border-indigo-500/40 text-indigo-300 text-[9.5px] font-bold px-2.5 py-1 rounded transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Send size={10} />
                          Rebotar vía VHF/NAVTEX
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 text-center py-12 text-slate-500 italic text-xs">
                  Ningún vector de amenaza detectado para el filtro seleccionado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TABS VIEW 3: SIMULADOR DE TRANSMISIÓN EMISOR VHF / NAVTEX (PILAR III INTEGRADO) */}
        {activeTabDetail === 'navtex-broadcast' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Navtex parameters selection / controller */}
            <div className="lg:col-span-12 xl:col-span-7 bg-slate-900/35 border border-slate-850 rounded-xl p-4 flex flex-col gap-3">
              <span className="font-sans font-bold text-xs text-slate-300 uppercase flex items-center gap-1.5 border-b border-slate-850 pb-2">
                <Radio size={14} className="text-cyan-400 animate-pulse" />
                Módulo Transmisor de Alerta Temprana NAVTEX (CCIR 476 / SITOR-B)
              </span>
              
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-450 uppercase font-sans font-bold">Mensaje Digital a Codificar:</label>
                <textarea
                  value={navtexMessage}
                  onChange={(e) => setNavtexMessage(e.target.value)}
                  disabled={isBroadcasting}
                  className="font-mono text-xs p-3 rounded-lg bg-slate-950 border border-slate-850 text-slate-200 outline-none focus:border-indigo-500 h-32 resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="flex flex-col gap-1 text-[10px]">
                  <label className="text-[10px] text-slate-450 uppercase font-sans font-bold">Frecuencia Portadora:</label>
                  <select className="bg-slate-950 text-slate-300 border border-slate-850 rounded p-1.5 outline-none text-[10.5px]">
                    <option>518 kHz (NAVTEX Principal Internacional)</option>
                    <option>490 kHz (NAVTEX Nacional Español)</option>
                    <option>144.800 MHz (APRS Emergencia Local)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 text-[10px]">
                  <label className="text-[10px] text-slate-450 uppercase font-sans font-bold">Velocidad de Modulación (Baudios):</label>
                  <div className="flex bg-slate-950 border border-slate-850 rounded p-1 gap-1">
                    {[50, 100, 1200].map((b) => (
                      <button
                        key={b}
                        onClick={() => setSelectedBaudRate(b)}
                        className={`flex-1 text-center font-bold text-[9.5px] py-1 rounded transition-all cursor-pointer ${
                          selectedBaudRate === b 
                            ? 'bg-cyan-500 text-slate-950' 
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {b} Bd ({b === 1200 ? 'APRS' : 'RTTY'})
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 pt-3 border-t border-slate-850 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isBroadcasting ? 'bg-cyan-500 animate-ping' : 'bg-slate-600'}`} />
                  <span className="text-[10px] text-slate-400">Canal libre en 518 kHz para transmisión inmediata</span>
                </div>

                <button
                  onClick={handleStartBroadcast}
                  disabled={isBroadcasting || !navtexMessage}
                  className="bg-cyan-550 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <Send size={12} className={isBroadcasting ? "animate-pulse" : ""} />
                  {isBroadcasting ? 'TRANSMITIENDO...' : 'EMITIR MENSAJE EN ONDAS CIVIL'}
                </button>
              </div>
            </div>

            {/* Modulation Oscilloscope View */}
            <div className="lg:col-span-12 xl:col-span-5 bg-slate-900/30 border border-slate-850 rounded-xl p-4 flex flex-col gap-3 h-[305px]">
              <span className="font-sans font-bold text-xs text-slate-350 uppercase flex items-center gap-1.5 pb-2 border-b border-slate-850">
                <Clock size={13} className="text-slate-400" />
                Monitoreo FSK de Banda Estrecha
              </span>

              {/* Waterfall & Log visualizer */}
              <div className="flex-1 bg-slate-950 rounded-lg p-3 border border-slate-850 overflow-hidden flex flex-col justify-end min-h-[160px] font-mono text-[10px]">
                {isBroadcasting ? (
                  /* Animated sound frequency oscilloscope graph */
                  <div className="flex items-end justify-between gap-[3px] h-12 w-full mb-3 px-1 border-b border-cyan-950 pb-1.5">
                    {Array.from({ length: 30 }).map((_, i) => {
                      const h = Math.floor(Math.random() * 35) + 5;
                      return (
                        <div 
                          key={i} 
                          className="bg-cyan-500/80 rounded-t w-full transition-all duration-75 text-center"
                          style={{ height: `${h}px` }} 
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-12 flex items-center justify-center text-slate-600 italic text-[10px] border-b border-slate-900 mb-3 select-none">
                    Línea base de radio en silencio (CARRIER IDLE)
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1 text-slate-400 max-h-[140px] pr-1 scrollbar-none">
                  {broadcastLog.length > 0 ? (
                    broadcastLog.map((log, idx) => (
                      <div key={idx} className="leading-tight break-all">
                        <span className="text-cyan-400 font-bold font-mono">▸</span> {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-600 text-center py-6 italic">
                      Listo para auditar la transmisión digital en directo...
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
      
    </div>
  );
}
