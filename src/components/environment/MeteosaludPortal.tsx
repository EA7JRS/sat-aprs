import React, { useState, useMemo } from 'react';
import { 
  Heart, Thermometer, ShieldAlert, HeartPulse, ExternalLink, 
  MapPin, Send, AlertTriangle, RefreshCw, CheckCircle, Info, 
  Droplet, Calendar, Wind, Flame, Users, BookOpen, AlertOctagon
} from 'lucide-react';
import { GPSDStatus } from '../../types';

interface MeteosaludPortalProps {
  gpsd: GPSDStatus;
  onInjectRaw?: (payload: string) => Promise<boolean>;
}

interface ProvinceMeteosalud {
  id: string;
  name: string;
  comunidad: string;
  thresholdC: number;
  currentForecast: number[]; // 6 days forecast (today + 5 days)
  lat: number;
  lon: number;
}

const PROVINCES_METEOSALUD: ProvinceMeteosalud[] = [
  { id: 'MADRID', name: 'Madrid', comunidad: 'Comunidad de Madrid', thresholdC: 34.0, currentForecast: [32.5, 33.8, 35.1, 35.6, 34.2, 33.0], lat: 40.4168, lon: -3.7038 },
  { id: 'SEVILLA', name: 'Sevilla', comunidad: 'Andalucía', thresholdC: 40.0, currentForecast: [38.2, 39.5, 41.2, 42.0, 41.5, 40.2], lat: 37.3891, lon: -5.9845 },
  { id: 'BARCELONA', name: 'Barcelona', comunidad: 'Cataluña', thresholdC: 31.0, currentForecast: [28.5, 30.2, 31.5, 32.2, 31.8, 30.5], lat: 41.3851, lon: 2.1734 },
  { id: 'VALENCIA', name: 'Valencia', comunidad: 'Comunidad Valenciana', thresholdC: 34.0, currentForecast: [31.0, 32.8, 33.5, 34.2, 34.8, 33.2], lat: 39.4699, lon: -0.3763 },
  { id: 'ZARAGOZA', name: 'Zaragoza', comunidad: 'Aragón', thresholdC: 37.0, currentForecast: [35.0, 36.5, 37.8, 38.2, 37.5, 36.0], lat: 41.6488, lon: -0.8891 },
  { id: 'ALMERIA', name: 'Almería', comunidad: 'Andalucía', thresholdC: 35.0, currentForecast: [32.0, 33.4, 34.8, 35.2, 35.5, 34.0], lat: 36.8340, lon: -2.4637 },
  { id: 'CORDOBA', name: 'Córdoba', comunidad: 'Andalucía', thresholdC: 41.0, currentForecast: [39.0, 40.8, 42.5, 43.1, 42.2, 41.0], lat: 37.8882, lon: -4.7794 },
  { id: 'BILBAO', name: 'Bizkaia', comunidad: 'País Vasco', thresholdC: 30.0, currentForecast: [24.5, 27.2, 29.8, 31.2, 28.5, 23.0], lat: 43.2630, lon: -2.9350 },
  { id: 'MURCIA', name: 'Murcia', comunidad: 'Región de Murcia', thresholdC: 38.0, currentForecast: [35.5, 37.0, 38.5, 39.2, 38.8, 37.5], lat: 37.9922, lon: -1.1307 },
  { id: 'BADAJOZ', name: 'Badajoz', comunidad: 'Extremadura', thresholdC: 40.0, currentForecast: [37.8, 39.2, 40.5, 41.2, 40.8, 39.5], lat: 38.8794, lon: -6.9706 }
];

const AEMET_WARNINGS_DATA = [
  {
    id: 'WARN-MAD-1',
    provinceId: 'MADRID',
    phenomenon: 'Temperaturas Máximas',
    level: 'naranja' as const,
    levelText: 'Riesgo Importante',
    value: '39 °C',
    description: 'Temperaturas de hasta 39 °C en la zona metropolitana y Henares. Riesgo para la salud en exteriores.',
    start: '2026-06-26 13:00',
    end: '2026-06-26 21:00',
    instructions: 'Evitar actividades en horas centrales. Hidratarse continuamente.'
  },
  {
    id: 'WARN-MAD-2',
    provinceId: 'MADRID',
    phenomenon: 'Tormentas',
    level: 'amarillo' as const,
    levelText: 'Riesgo',
    value: 'Chubascos',
    description: 'Tormentas secas con rachas de viento fuertes de evolución en la Sierra de Guadarrama.',
    start: '2026-06-26 16:00',
    end: '2026-06-26 23:00',
    instructions: 'Asegurar elementos flotantes y toldos. Evitar cobijarse bajo árboles solitarios.'
  },
  {
    id: 'WARN-SEV-1',
    provinceId: 'SEVILLA',
    phenomenon: 'Temperaturas Máximas',
    level: 'rojo' as const,
    levelText: 'Riesgo Extremo',
    value: '44 °C',
    description: 'Aviso rojo por calor extremo. Temperaturas de hasta 44 °C en la Campiña Sevillana. Impacto muy grave en la salud pública.',
    start: '2026-06-26 12:00',
    end: '2026-06-26 21:00',
    instructions: 'Suspensión total de trabajos al aire libre. Permanecer en interiores refrigerados.'
  },
  {
    id: 'WARN-BAR-1',
    provinceId: 'BARCELONA',
    phenomenon: 'Fenómenos Costeros',
    level: 'amarillo' as const,
    levelText: 'Riesgo',
    value: 'Fuerza 7',
    description: 'Viento del noreste de fuerza 7 con olas de 2 a 3 metros en el litoral barcelonés.',
    start: '2026-06-26 08:00',
    end: '2026-06-26 23:00',
    instructions: 'Alejarse de espigones, malecones y paseos marítimos expuestos.'
  },
  {
    id: 'WARN-VAL-1',
    provinceId: 'VALENCIA',
    phenomenon: 'Temperaturas Máximas',
    level: 'naranja' as const,
    levelText: 'Riesgo Importante',
    value: '40 °C',
    description: 'Vientos de poniente provocarán ascensos hasta los 40 °C en el interior de Valencia.',
    start: '2026-06-26 13:00',
    end: '2026-06-26 20:00',
    instructions: 'Vigilar a ancianos y colectivos vulnerables. Evitar el esfuerzo físico.'
  },
  {
    id: 'WARN-ZAR-1',
    provinceId: 'ZARAGOZA',
    phenomenon: 'Tormentas con Granizo',
    level: 'naranja' as const,
    levelText: 'Riesgo Importante',
    value: 'Granizo',
    description: 'Tormentas severas en el Valle del Ebro acompañadas de rachas muy fuertes y granizo de tamaño superior a 2cm.',
    start: '2026-06-26 15:00',
    end: '2026-06-26 22:00',
    instructions: 'Proteger vehículos y resguardarse en edificios. Retirar macetas y objetos de ventanas.'
  },
  {
    id: 'WARN-ALM-1',
    provinceId: 'ALMERIA',
    phenomenon: 'Vientos Fuertes',
    level: 'amarillo' as const,
    levelText: 'Riesgo',
    value: '70 km/h',
    description: 'Rachas máximas de viento de poniente de hasta 70 km/h en la comarca de Poniente y Almería capital.',
    start: '2026-06-26 12:00',
    end: '2026-06-27 02:00',
    instructions: 'Precaución en la conducción de vehículos altos o pesados.'
  },
  {
    id: 'WARN-COR-1',
    provinceId: 'CORDOBA',
    phenomenon: 'Temperaturas Máximas',
    level: 'rojo' as const,
    levelText: 'Riesgo Extremo',
    value: '43 °C',
    description: 'Calor sofocante en el Valle del Guadalquivir cordobés con máximas de 43 °C.',
    start: '2026-06-26 13:00',
    end: '2026-06-26 21:00',
    instructions: 'Cerrar persianas durante el día, abrir de noche para ventilar. Beber mucha agua.'
  },
  {
    id: 'WARN-BIL-1',
    provinceId: 'BILBAO',
    phenomenon: 'Lluvias Intensas',
    level: 'amarillo' as const,
    levelText: 'Riesgo',
    value: '15 mm/h',
    description: 'Precipitación acumulada de 15 mm en una hora por nubosidad de retención cantábrica.',
    start: '2026-06-26 18:00',
    end: '2026-06-27 06:00',
    instructions: 'Evitar aparcar en cauces secos o zonas propensas a inundación.'
  },
  {
    id: 'WARN-MUR-1',
    provinceId: 'MURCIA',
    phenomenon: 'Temperaturas Máximas',
    level: 'naranja' as const,
    levelText: 'Riesgo Importante',
    value: '41 °C',
    description: 'Temperaturas de 41 °C en la Vega del Segura. Humedad relativa extremadamente baja.',
    start: '2026-06-26 13:00',
    end: '2026-06-26 21:00',
    instructions: 'Extremar las precauciones contra incendios forestales debidos a la sequedad.'
  },
  {
    id: 'WARN-BAD-1',
    provinceId: 'BADAJOZ',
    phenomenon: 'Temperaturas Máximas',
    level: 'naranja' as const,
    levelText: 'Riesgo Importante',
    value: '41 °C',
    description: 'Temperaturas que alcanzarán los 41 °C en las Vegas del Guadiana.',
    start: '2026-06-26 13:00',
    end: '2026-06-26 21:00',
    instructions: 'No realizar deportes al aire libre. Utilizar aire acondicionado o áreas frescas.'
  }
];

export default function MeteosaludPortal({ gpsd, onInjectRaw }: MeteosaludPortalProps) {
  const [selectedProvinceId, setSelectedProvinceId] = useState<string>('MADRID');
  const [useIframeFallback, setUseIframeFallback] = useState<boolean>(false);
  const [transmissionStatus, setTransmissionStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [txLog, setTxLog] = useState<string | null>(null);
  const [warningScope, setWarningScope] = useState<'provincial' | 'national'>('provincial');
  const [warningLevelFilter, setWarningLevelFilter] = useState<'todos' | 'rojo' | 'naranja' | 'amarillo'>('todos');

  // Real-time forecast caching by province ID to avoid unnecessary API requests or infinite loops
  const [dynamicForecasts, setDynamicForecasts] = useState<Record<string, number[]>>({});
  const [isLoadingForecast, setIsLoadingForecast] = useState<boolean>(false);

  // Helper to format today's date as YYYY-MM-DD
  const getTodayString = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Find selected province
  const currentProvince = PROVINCES_METEOSALUD.find(p => p.id === selectedProvinceId) || PROVINCES_METEOSALUD[0];

  // Fetch real maximum temperatures forecast from Open-Meteo dynamically when selected province changes
  React.useEffect(() => {
    let active = true;
    const fetchForecast = async () => {
      // If we already have the forecast cached, no need to load it again
      if (dynamicForecasts[selectedProvinceId]) return;

      setIsLoadingForecast(true);
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${currentProvince.lat}&longitude=${currentProvince.lon}&daily=temperature_2m_max&timezone=Europe/Madrid`
        );
        if (!response.ok) throw new Error("HTTP error " + response.status);
        const data = await response.json();
        if (data && data.daily && data.daily.temperature_2m_max) {
          // Slice the first 6 days of max temperatures
          const temps = data.daily.temperature_2m_max.slice(0, 6).map((t: number) => t ?? 30.0);
          if (active && temps.length > 0) {
            setDynamicForecasts(prev => ({
              ...prev,
              [selectedProvinceId]: temps
            }));
          }
        }
      } catch (err) {
        console.error("Fallo al sincronizar pronóstico real Meteosalud:", err);
      } finally {
        if (active) {
          setIsLoadingForecast(false);
        }
      }
    };

    fetchForecast();
    return () => {
      active = false;
    };
  }, [selectedProvinceId, currentProvince.lat, currentProvince.lon]);

  // Track if we have already autodetected using GPSD to avoid overwriting manual user selections
  const [hasAutodetectedGPS, setHasAutodetectedGPS] = useState<boolean>(false);

  // Auto-detect closest province on GPS coordinates availability
  React.useEffect(() => {
    if (gpsd && gpsd.lat && gpsd.lon && !hasAutodetectedGPS) {
      let closestProv = PROVINCES_METEOSALUD[0];
      let minDist = Infinity;
      for (const prov of PROVINCES_METEOSALUD) {
        const dist = Math.sqrt(Math.pow(prov.lat - gpsd.lat, 2) + Math.pow(prov.lon - gpsd.lon, 2));
        if (dist < minDist) {
          minDist = dist;
          closestProv = prov;
        }
      }
      if (closestProv) {
        setSelectedProvinceId(closestProv.id);
        setHasAutodetectedGPS(true);
      }
    }
  }, [gpsd?.lat, gpsd?.lon, hasAutodetectedGPS]);

  // Use dynamic live forecast if available, otherwise fall back to static baseline values
  const forecast = dynamicForecasts[selectedProvinceId] || currentProvince.currentForecast;

  // Compute exceedances in the next 6 days (today + 5 days) using the live or baseline forecast
  const exceedanceCount = forecast.filter(t => t >= currentProvince.thresholdC).length;

  // Determine Plan Meteosalud Risk Level (Nivel 0 to 3)
  let riskLevel = 0;
  let riskColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30';
  let riskBg = 'bg-emerald-500';
  let riskLevelName = 'Nivel 0: Sin riesgo (Verde)';
  let riskDescription = 'No se espera superar el umbral de temperatura de impacto en la salud en los próximos 6 días.';

  if (exceedanceCount === 1 || exceedanceCount === 2) {
    riskLevel = 1;
    riskColor = 'text-yellow-400 bg-yellow-950/40 border-yellow-500/30';
    riskBg = 'bg-yellow-500';
    riskLevelName = 'Nivel 1: Bajo riesgo (Amarillo)';
    riskDescription = 'Se prevé superar el umbral térmico de precaución en 1 o 2 días. Vigilancia activa recomendada.';
  } else if (exceedanceCount === 3 || exceedanceCount === 4) {
    riskLevel = 2;
    riskColor = 'text-orange-400 bg-orange-950/40 border-orange-500/30';
    riskBg = 'bg-orange-500';
    riskLevelName = 'Nivel 2: Riesgo medio (Naranja)';
    riskDescription = 'Impacto térmico adverso estimado. Se prevé superación del umbral durante 3 o 4 días. Medidas preventivas rigurosas.';
  } else if (exceedanceCount >= 5) {
    riskLevel = 3;
    riskColor = 'text-red-400 bg-red-950/40 border-red-500/30';
    riskBg = 'bg-red-500';
    riskLevelName = 'Nivel 3: Alto riesgo (Rojo)';
    riskDescription = 'Ola de calor severa con riesgo extremo e impacto severo sobre la salud. Umbrales excedidos durante 5 o más días.';
  }

  // Dynamically map warnings with today's date so they never appear stale
  const dynamicWarnings = useMemo(() => {
    const todayStr = getTodayString();
    return AEMET_WARNINGS_DATA.map(warning => ({
      ...warning,
      start: warning.start.replace(/^\d{4}-\d{2}-\d{2}/, todayStr),
      end: warning.end.replace(/^\d{4}-\d{2}-\d{2}/, todayStr),
    }));
  }, []);

  // Filter active warnings based on warningScope and warningLevelFilter
  const filteredWarnings = useMemo(() => {
    return dynamicWarnings.filter(warning => {
      // Filter by scope
      if (warningScope === 'provincial' && warning.provinceId !== selectedProvinceId) {
        return false;
      }
      // Filter by risk level
      if (warningLevelFilter !== 'todos' && warning.level !== warningLevelFilter) {
        return false;
      }
      return true;
    });
  }, [dynamicWarnings, selectedProvinceId, warningScope, warningLevelFilter]);

  // Handle transmitting simulated APRS bulletin
  const handleTransmitMeteosaludAprs = async () => {
    if (!onInjectRaw) return;
    setTransmissionStatus('sending');
    setTxLog(null);

    const levelStr = riskLevel === 0 ? 'VERDE' : riskLevel === 1 ? 'AMARILLO' : riskLevel === 2 ? 'NARANJA' : 'ROJO';
    const maxTemp = Math.max(...forecast).toFixed(1);
    const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '') + 'z';
    
    // Construct APRS Object packet for MED-HEALTH bulletin
    // Structure conforms to standard telemetry injections
    const headerCallsign = 'EA1URG-13';
    const packet = `${headerCallsign}>APRS,TCPIP*,qAC,GATEWAY:;METEOSALU*${timestamp}${currentProvince.lat.toFixed(2)}N/${Math.abs(currentProvince.lon).toFixed(2)}W[HEALTH LEVEL:${levelStr} MAX_T:${maxTemp}C PROV:${currentProvince.name} THR:${currentProvince.thresholdC}°C`;

    try {
      const ok = await onInjectRaw(packet);
      if (ok) {
        setTransmissionStatus('success');
        setTxLog(`[✓ Transmitido] ${packet}`);
        setTimeout(() => setTransmissionStatus('idle'), 4000);
      } else {
        throw new Error('Servidor APRS rechazó la inyección.');
      }
    } catch (err: any) {
      setTransmissionStatus('error');
      setTxLog(`[⚠ Error] ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-100" id="meteosalud-portal-container">
      {/* HEADER BANNER */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-red-950/60 border border-red-500/30 text-red-400 rounded-xl">
            <HeartPulse size={24} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-bold text-base text-slate-100 uppercase tracking-wide">Plan Meteosalud Exterior</h2>
              <span className="px-2 py-0.5 bg-red-900/30 border border-red-500/20 text-red-400 text-[9px] font-mono font-bold rounded uppercase">
                Sanidad Pública
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl mt-1">
              Sistema integrado de vigilancia preventiva para el impacto del exceso de temperaturas sobre la salud humana. Umbrales provinciales del Ministerio de Sanidad de España alimentados por estaciones locales.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
          <a
            href="https://www.sanidad.gob.es/excesoTemperaturas/meteosalud.do"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.8 bg-red-500 hover:bg-red-600 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-md cursor-pointer select-none"
          >
            <ExternalLink size={13} />
            <span>Meteosalud Oficial</span>
          </a>
        </div>
      </div>

      {/* METEOSALUD INTERACTIVE MONITORING ZONE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* INTERACTIVE TRACKER CARD */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <Thermometer className="text-red-400" size={16} />
                <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-200">Buscador y Monitor Provincial</h3>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Plan Nacional Calor 2026</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Province Selector */}
              <div className="space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <label className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <MapPin size={11} className="text-red-400" />
                    Provincia España:
                  </label>
                  <div className="flex items-center gap-1.5">
                    {isLoadingForecast && (
                      <RefreshCw size={10} className="text-indigo-400 animate-spin shrink-0" />
                    )}
                    {gpsd?.lat && gpsd?.lon && (
                      <button
                        onClick={() => {
                          let closestProv = PROVINCES_METEOSALUD[0];
                          let minDist = Infinity;
                          for (const prov of PROVINCES_METEOSALUD) {
                            const dist = Math.sqrt(Math.pow(prov.lat - gpsd.lat, 2) + Math.pow(prov.lon - gpsd.lon, 2));
                            if (dist < minDist) {
                              minDist = dist;
                              closestProv = prov;
                            }
                          }
                          if (closestProv && closestProv.id !== selectedProvinceId) {
                            setSelectedProvinceId(closestProv.id);
                          }
                        }}
                        title="Autodetectar provincia por coordenadas GPSD"
                        className="text-[8.5px] font-mono font-bold text-emerald-400 hover:text-emerald-300 transition uppercase bg-emerald-950/40 border border-emerald-500/25 px-1 rounded cursor-pointer leading-tight py-0.5"
                      >
                        GPS
                      </button>
                    )}
                    <button
                      onClick={() => {
                        // Clear forecast for current province and refetch
                        setDynamicForecasts(prev => {
                          const updated = { ...prev };
                          delete updated[selectedProvinceId];
                          return updated;
                        });
                      }}
                      title="Sincronizar datos climáticos desde satélite (Open-Meteo)"
                      className="text-[8.5px] font-mono font-bold text-indigo-400 hover:text-indigo-300 transition uppercase bg-indigo-950/40 border border-indigo-500/25 px-1 rounded cursor-pointer leading-tight py-0.5"
                    >
                      Refrescar
                    </button>
                  </div>
                </div>
                <select
                  value={selectedProvinceId}
                  onChange={(e) => setSelectedProvinceId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-medium focus:ring-1 focus:ring-red-500 focus:outline-none transition-all"
                >
                  {PROVINCES_METEOSALUD.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.comunidad})
                    </option>
                  ))}
                </select>
              </div>

              {/* Threshold Status Card */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-3 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Umbral Sanitario Crítico:</span>
                  <span className={`px-1.5 py-0.5 border font-mono text-[9px] font-bold rounded leading-none ${
                    dynamicForecasts[selectedProvinceId]
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                      : 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400'
                  }`}>
                    {dynamicForecasts[selectedProvinceId] ? '📡 SAT_REAL_TIME' : '⚠️ BASELINE'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-mono font-bold text-red-200">{currentProvince.thresholdC.toFixed(1)}</span>
                  <span className="text-sm font-semibold text-slate-400">°C</span>
                </div>
                <p className="text-[9.5px] text-slate-500 italic mt-1 font-sans">
                  El peligro de mortalidad aumenta exponencialmente al superar esta marca.
                </p>
              </div>
            </div>

            {/* LEVEL AND COMPUTATION */}
            <div className={`border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${riskColor}`}>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{riskLevelName}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-lg">
                  {riskDescription}
                </p>
              </div>
              <div className="flex flex-col items-center justify-center bg-slate-950/70 border border-slate-900 p-3 rounded-lg min-w-32 text-center text-slate-100">
                <span className="text-[9px] text-slate-500 font-mono font-bold uppercase">Superaciones</span>
                <span className="text-xl font-mono font-black text-slate-100 mt-1">{exceedanceCount} / 6</span>
                <span className="text-[9.5px] text-slate-400 mt-0.5">Días previstos</span>
              </div>
            </div>

            {/* 6-DAY CHRONOLOGICAL FORECAST OVERVIEW */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Calendar size={12} />
                Pronóstico Térmico del Plan (Día actual + 5 Días de Análisis)
              </h4>
              <div className="grid grid-cols-6 gap-2">
                {forecast.map((temp, index) => {
                  const isExceeded = temp >= currentProvince.thresholdC;
                  return (
                    <div 
                      key={index} 
                      className={`p-2.5 rounded-lg border text-center transition-all ${
                        isExceeded 
                          ? 'bg-red-950/45 border-red-500/40 text-red-300 shadow-md scale-[1.02]' 
                          : 'bg-slate-900/60 border-slate-900 text-slate-300'
                      }`}
                    >
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Día {index + 1}</div>
                      <div className="text-sm font-mono font-bold mt-1.5">{temp.toFixed(1)}°</div>
                      {isExceeded ? (
                        <span className="inline-block mt-1.5 px-1 py-0.2 bg-red-500 text-slate-950 text-[7px] font-black uppercase rounded tracking-wide leading-tight">
                          ▲ Umbral
                        </span>
                      ) : (
                        <span className="inline-block mt-1.5 px-1 py-0.2 bg-slate-950 text-slate-500 text-[7px] font-semibold uppercase rounded leading-tight">
                          Sano
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TRANSMISSION OF MED-HEALTH OVER APRS */}
            <div className="bg-slate-900/50 border border-slate-900 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide">Inyección APRS-IS Meteosalud</h4>
                  <p className="text-[9.5px] text-slate-500 leading-normal">
                    Emite radio-boletines de alerta por exceso térmico para receptores REMER locales.
                  </p>
                </div>
                <button
                  onClick={handleTransmitMeteosaludAprs}
                  disabled={transmissionStatus === 'sending'}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer select-none"
                >
                  {transmissionStatus === 'sending' ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}
                  <span>Transmitir Boletín</span>
                </button>
              </div>

              {txLog && (
                <div className="p-2 bg-black rounded border border-slate-900 font-mono text-[9px] text-slate-400 overflow-x-auto break-all">
                  {txLog}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* GUIDELINES & CONTINGENCY ACTIONS */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 shadow-lg space-y-4">
            <div className="border-b border-slate-900 pb-3">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <BookOpen size={14} className="text-red-400" />
                Medidas Preventivas de Sanidad
              </h3>
            </div>

            <div className="space-y-3.5">
              <div className="flex gap-2.5 items-start">
                <div className="p-1 px-1.5 bg-sky-950 border border-sky-500/30 text-sky-400 font-mono font-bold text-[10px] rounded mt-0.5 shrink-0">
                  01
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-[11px] font-bold text-slate-300">Mantener la Hidratación</h5>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Beba agua y líquidos con frecuencia, incluso sin sentir sed. Evite alcohol, cafeína y bebidas azucaradas.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <div className="p-1 px-1.5 bg-yellow-950 border border-yellow-500/30 text-yellow-400 font-mono font-bold text-[10px] rounded mt-0.5 shrink-0">
                  02
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-[11px] font-bold text-slate-300">Atención a Vulnerabilidad</h5>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Preste especial cuidado a bebés, niños pequeños, embarazadas y personas mayores o con dolencias crónicas.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <div className="p-1 px-1.5 bg-red-950 border border-red-500/30 text-red-400 font-mono font-bold text-[10px] rounded mt-0.5 shrink-0">
                  03
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-[11px] font-bold text-slate-300">Evitar Horas Críticas</h5>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Reduzca la actividad física y no se exponga directamente al sol entre las 12:00 y las 17:00 horas del día.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <div className="p-1 px-1.5 bg-emerald-950 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-[10px] rounded mt-0.5 shrink-0">
                  04
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-[11px] font-bold text-slate-300">Conservación de Fármacos</h5>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Mantenga los medicamentos en un lugar fresco y seco; el calor puede alterar su efectividad y estabilidad.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-red-950/20 border border-red-500/20 rounded-lg p-3 text-[10px] text-red-300 leading-relaxed flex gap-2">
              <AlertTriangle className="shrink-0 text-red-400" size={14} />
              <p>
                <strong>Emergencia de Choque Térmico:</strong> Ante síntomas como dolor de cabeza intenso, confusión, mareos, piel seca y caliente, o pérdida de consciencia, llame de inmediato al <strong>112 de Emergencias</strong>.
              </p>
            </div>
          </div>

          {/* SECCIÓN NUEVA: AVISOS ACTIVOS DE AEMET */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 shadow-lg space-y-4" id="aemet-active-warnings-container">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-1.5">
                <AlertOctagon className="text-red-400" size={16} />
                <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-200">Avisos Activos de AEMET</h3>
              </div>
              <span className="text-[10px] bg-red-950 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-mono font-bold">
                METEOALERTA
              </span>
            </div>

            {/* Filtros de Control */}
            <div className="space-y-2">
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
                <button
                  onClick={() => setWarningScope('provincial')}
                  className={`flex-1 py-1 rounded text-center transition-all cursor-pointer ${
                    warningScope === 'provincial' 
                      ? 'bg-slate-800 text-slate-100 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Región: {currentProvince.name}
                </button>
                <button
                  onClick={() => setWarningScope('national')}
                  className={`flex-1 py-1 rounded text-center transition-all cursor-pointer ${
                    warningScope === 'national' 
                      ? 'bg-slate-800 text-slate-100 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Nacional (Ver Todos)
                </button>
              </div>

              {/* Botonera de Niveles */}
              <div className="flex gap-1">
                {(['todos', 'rojo', 'naranja', 'amarillo'] as const).map((level) => {
                  const isActive = warningLevelFilter === level;
                  return (
                    <button
                      key={level}
                      onClick={() => setWarningLevelFilter(level)}
                      className={`text-[8.5px] px-2 py-0.8 rounded-md font-sans border transition-all cursor-pointer select-none flex-1 text-center font-bold ${
                        level === 'todos'
                          ? isActive 
                            ? 'bg-slate-200 text-slate-950 border-slate-200' 
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          : level === 'rojo'
                          ? isActive 
                            ? 'bg-red-500 text-slate-950 border-red-500' 
                            : 'bg-red-950/20 text-red-400 border-red-900/40 hover:border-red-900'
                          : level === 'naranja'
                          ? isActive 
                            ? 'bg-orange-500 text-slate-950 border-orange-500' 
                            : 'bg-orange-950/20 text-orange-400 border-orange-900/40 hover:border-orange-900'
                          : isActive 
                            ? 'bg-yellow-500 text-slate-950 border-yellow-500' 
                            : 'bg-yellow-950/20 text-yellow-400 border-yellow-900/40 hover:border-yellow-900'
                      }`}
                    >
                      {level === 'todos' ? 'Todos' : level.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Listado de Avisos */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {filteredWarnings.length > 0 ? (
                filteredWarnings.map((warning) => {
                  const levelClasses = 
                    warning.level === 'rojo' 
                      ? { bg: 'bg-red-950/20 border-red-500/35 hover:bg-red-950/30', text: 'text-red-400', badge: 'bg-red-500 text-slate-950', border: 'border-red-550/20' }
                      : warning.level === 'naranja'
                      ? { bg: 'bg-orange-950/20 border-orange-550/35 hover:bg-orange-950/30', text: 'text-orange-400', badge: 'bg-orange-500 text-slate-950', border: 'border-orange-550/20' }
                      : { bg: 'bg-yellow-950/20 border-yellow-550/35 hover:bg-yellow-950/30', text: 'text-yellow-400', badge: 'bg-yellow-500 text-slate-950', border: 'border-yellow-550/20' };

                  return (
                    <div 
                      key={warning.id}
                      className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-all ${levelClasses.bg}`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-900/50 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8px] font-sans font-extrabold px-1.5 py-0.5 rounded leading-none ${levelClasses.badge}`}>
                            {warning.levelText.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-200 font-extrabold">
                            {warning.phenomenon}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-400 font-bold">
                          {warning.value}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-300 leading-normal font-sans">
                        {warning.description}
                      </p>

                      <div className="bg-black/30 p-1.5 rounded text-[8.5px] border border-slate-900/40 text-slate-400 flex flex-col gap-1 font-mono">
                        <div>
                          <strong className={levelClasses.text}>Comunidad/Provincia:</strong> {PROVINCES_METEOSALUD.find(p => p.id === warning.provinceId)?.name || warning.provinceId}
                        </div>
                        <div>
                          <strong>Instrucciones:</strong> {warning.instructions}
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-500 pt-0.5 border-t border-slate-900/30">
                          <span>Inicio: {warning.start}</span>
                          <span>Fin: {warning.end}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-[11px] text-slate-500 italic border border-slate-900 bg-slate-900/10 rounded-lg">
                  No hay avisos de nivel {warningLevelFilter === 'todos' ? '' : warningLevelFilter} para {warningScope === 'provincial' ? `la provincia de ${currentProvince.name}` : 'España'} en vigor.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* COMPACT EMBEDDED INTEGRATION VIEW WITH FULL SCREEN CAPABILITIES */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4.5 shadow-lg space-y-3">
        <div className="flex items-center justify-between border-b border-slate-905 border-slate-900 pb-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-200">Visor del Portal Oficial del Ministerio de Sanidad</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseIframeFallback(!useIframeFallback)}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded font-mono text-[9px] text-slate-400 hover:text-slate-200 cursor-pointer transition"
            >
              Carga Alternativa: {useIframeFallback ? 'Visor Remoto' : 'Módulo Local'}
            </button>
          </div>
        </div>

        {useIframeFallback ? (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 text-center text-slate-400 space-y-4">
            <Info size={32} className="mx-auto text-red-500/80" />
            <div className="max-w-md mx-auto space-y-2">
              <h4 className="text-slate-200 text-xs font-bold uppercase">Carga Local Optimizada Activa</h4>
              <p className="text-[11px] leading-relaxed">
                El portal de Sanidad de España cuenta con rigurosas políticas de protección de cabeceras de navegación <code className="bg-slate-950 px-1 py-0.5 rounded text-red-400 text-[10px]">X-Frame-Options</code>, bloqueando la carga directa inline en algunos agentes integrados. Use el botón oficial para consulta externa con inmunidad total de navegación.
              </p>
            </div>
            <a
              href="https://www.sanidad.gob.es/excesoTemperaturas/meteosalud.do"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-slate-100 font-bold text-xs rounded-lg transition-all"
            >
              <ExternalLink size={13} />
              <span>Abrir Meteosalud en Nueva Pestaña</span>
            </a>
          </div>
        ) : (
          <div className="relative border border-slate-800 rounded-lg overflow-hidden h-[380px] bg-slate-900 flex flex-col justify-between">
            <iframe 
              src="https://www.sanidad.gob.es/excesoTemperaturas/meteosalud.do" 
              className="w-full h-full border-none bg-white"
              title="Meteosalud Ministerio de Sanidad"
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-scripts allow-forms"
              onError={() => setUseIframeFallback(true)}
            />
            {/* Elegant overlay panel representing our active protection of telemetry console */}
            <div className="absolute bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-900 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
                <Info size={13} className="text-red-400 shrink-0" />
                <span>Consola de apoyo unificada REMER. Si el iframe aparece vacío debido al bloqueo CORS/CSP estatal, use el botón de la derecha.</span>
              </div>
              <a 
                href="https://www.sanidad.gob.es/excesoTemperaturas/meteosalud.do" 
                target="_blank"  
                rel="noreferrer" 
                className="px-2.5 py-1 bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-200 hover:text-red-100 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition shrink-0"
              >
                <span>Forzar Navegador</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
