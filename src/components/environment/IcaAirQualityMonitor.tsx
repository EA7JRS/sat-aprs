import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { 
  Search, Globe, ShieldAlert, Radio, Wind, Sliders, ExternalLink, 
  Activity, Info, MapPin, Compass, AlertTriangle, ShieldCheck, Database, RefreshCw, X, Map,
  Bell, BellOff, Star, Check, Settings
} from 'lucide-react';
import { playAlertSound } from '../../utils/audio';

interface AirQualityStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  province: string;
  region: string;
  pm25: number | null;   // µg/m³
  pm10: number | null;   // µg/m³
  no2: number | null;    // µg/m³
  o3: number | null;     // µg/m³
  so2: number | null;    // µg/m³
  co: number | null;     // mg/m³
  lastMeasured: string;
}

interface IcaCategory {
  level: number;
  label: string;
  color: string;
  hex: string;
  bgHex: string;
  desc: string;
  poblacionGeneral: string;
  poblacionSensible: string;
}

interface IcaAirQualityMonitorProps {
  gpsd: {
    lat: number;
    lon: number;
    isFallback: boolean;
  };
  config?: any;
  onInjectRaw?: (payload: string) => Promise<boolean>;
  iqair?: any;
}

const DEFAULT_STATIONS: AirQualityStation[] = [
  { id: 'AQ-01', name: 'Madrid - Plaza de España', lat: 40.4239, lon: -3.7122, province: 'Madrid', region: 'Comunidad de Madrid', pm25: 8, pm10: 14, no2: 24, o3: 42, so2: 3, co: 0.3, lastMeasured: new Date().toISOString() },
  { id: 'AQ-02', name: 'Barcelona - Eixample', lat: 41.3851, lon: 2.1734, province: 'Barcelona', region: 'Cataluña', pm25: 18, pm10: 32, no2: 45, o3: 56, so2: 8, co: 0.6, lastMeasured: new Date().toISOString() },
  { id: 'AQ-03', name: 'Valencia - Avda. Francia', lat: 39.4699, lon: -0.3763, province: 'Valencia', region: 'Comunidad Valenciana', pm25: 12, pm10: 22, no2: 28, o3: 65, so2: 4, co: 0.4, lastMeasured: new Date().toISOString() },
  { id: 'AQ-04', name: 'Sevilla - Aljarafe', lat: 37.3891, lon: -6.0022, province: 'Sevilla', region: 'Andalucía', pm25: 15, pm10: 28, no2: 19, o3: 72, so2: 2, co: 0.3, lastMeasured: new Date().toISOString() },
  { id: 'AQ-05', name: 'Cáceres - San Blas', lat: 39.4714, lon: -6.3763, province: 'Cáceres', region: 'Extremadura', pm25: 5, pm10: 9, no2: 11, o3: null, so2: null, co: 0.1, lastMeasured: new Date().toISOString() },
  { id: 'AQ-06', name: 'Zaragoza - Plaza Aragón', lat: 41.6502, lon: -0.8804, province: 'Zaragoza', region: 'Aragón', pm25: 11, pm10: 20, no2: 26, o3: 49, so2: 3, co: 0.4, lastMeasured: new Date().toISOString() },
  { id: 'AQ-07', name: 'Gijón - Constitución', lat: 43.5350, lon: -5.6611, province: 'Asturias', region: 'Principado de Asturias', pm25: 14, pm10: 25, no2: 18, o3: null, so2: 7, co: 0.3, lastMeasured: new Date().toISOString() },
  { id: 'AQ-08', name: 'Santa Cruz de Tenerife', lat: 28.4636, lon: -16.2518, province: 'Tenerife', region: 'Canarias', pm25: 4, pm10: 8, no2: 9, o3: 32, so2: null, co: null, lastMeasured: new Date().toISOString() },
  { id: 'AQ-09', name: 'Ourense - Casco', lat: 42.3358, lon: -7.8639, province: 'Ourense', region: 'Galicia', pm25: null, pm10: 11, no2: 14, o3: 40, so2: 2, co: 0.2, lastMeasured: new Date().toISOString() },
  { id: 'AQ-10', name: 'Málaga - El Atabal', lat: 36.7213, lon: -4.4214, province: 'Málaga', region: 'Andalucía', pm25: 10, pm10: 18, no2: 20, o3: 58, so2: 4, co: 0.3, lastMeasured: new Date().toISOString() },
  { id: 'AQ-11', name: 'Valladolid - Arturo Eyries', lat: 41.6523, lon: -4.7286, province: 'Valladolid', region: 'Castilla y León', pm25: 9, pm10: 16, no2: 19, o3: 47, so2: 3, co: 0.3, lastMeasured: new Date().toISOString() },
  { id: 'AQ-12', name: 'Puertollano - San Juan', lat: 38.6875, lon: -4.1114, province: 'Ciudad Real', region: 'Castilla-La Mancha', pm25: 22, pm10: 38, no2: 31, o3: 88, so2: 12, co: 0.7, lastMeasured: new Date().toISOString() }
];

// Calculated State Level description based on MITECO air index (BOE-A-2020-10426)
export function getMitecoIcaInfo(
  pm25: number | null | undefined, 
  pm10: number | null | undefined, 
  no2: number | null | undefined, 
  o3: number | null | undefined,
  so2?: number | null | undefined
): IcaCategory {
  const vals: number[] = [];
  
  const getLevel25 = (v: number) => {
    if (v <= 10) return 1;
    if (v <= 20) return 2;
    if (v <= 25) return 3;
    if (v <= 50) return 4;
    if (v <= 75) return 5;
    return 6;
  };
  const getLevel10 = (v: number) => {
    if (v <= 20) return 1;
    if (v <= 40) return 2;
    if (v <= 50) return 3;
    if (v <= 100) return 4;
    if (v <= 150) return 5;
    return 6;
  };
  const getLevelNo2 = (v: number) => {
    if (v <= 40) return 1;
    if (v <= 90) return 2;
    if (v <= 120) return 3;
    if (v <= 230) return 4;
    if (v <= 340) return 5;
    return 6;
  };
  const getLevelO3 = (v: number) => {
    if (v <= 50) return 1;
    if (v <= 100) return 2;
    if (v <= 130) return 3;
    if (v <= 240) return 4;
    if (v <= 380) return 5;
    return 6;
  };
  const getLevelSo2 = (v: number) => {
    if (v <= 100) return 1;
    if (v <= 200) return 2;
    if (v <= 350) return 3;
    if (v <= 500) return 4;
    if (v <= 750) return 5;
    return 6;
  };

  if (pm25 !== undefined && pm25 !== null && pm25 >= 0) vals.push(getLevel25(pm25));
  if (pm10 !== undefined && pm10 !== null && pm10 >= 0) vals.push(getLevel10(pm10));
  if (no2 !== undefined && no2 !== null && no2 >= 0) vals.push(getLevelNo2(no2));
  if (o3 !== undefined && o3 !== null && o3 >= 0) vals.push(getLevelO3(o3));
  if (so2 !== undefined && so2 !== null && so2 >= 0) vals.push(getLevelSo2(so2));

  if (vals.length === 0) {
    return {
      level: 0,
      label: 'Sin Datos',
      color: 'text-slate-400 border-black/80 bg-black/50',
      hex: '#000000',
      bgHex: 'rgba(0,0,0,0.6)',
      desc: 'No se dispone de datos suficientes de contaminantes para calcular el índice en esta estación.',
      poblacionGeneral: 'Sin datos disponibles para emitir recomendaciones generales.',
      poblacionSensible: 'Sin datos disponibles para emitir recomendaciones de grupos de riesgo.'
    };
  }

  // Assign the worst category (maximum level of any calculated validator)
  const activeLevel = Math.max(...vals);

  switch (activeLevel) {
    case 1:
      return {
        level: 1,
        label: 'Buena',
        color: 'text-[#0096c8] border-[#0096c8]/40 bg-[#0096c8]/10',
        hex: '#0096c8',
        bgHex: 'rgba(0,150,200,0.2)',
        desc: 'La calidad del aire es excelente. No presenta riesgos generales para la salud humana.',
        poblacionGeneral: 'Disfruta de tus actividades habituales al aire libre sin restricciones.',
        poblacionSensible: 'Disfrute de sus actividades al aire libre con total normalidad.'
      };
    case 2:
      return {
        level: 2,
        label: 'Razonablemente buena',
        color: 'text-[#32aa64] border-[#32aa64]/40 bg-[#32aa64]/10',
        hex: '#32aa64',
        bgHex: 'rgba(50,170,100,0.2)',
        desc: 'La calidad del aire es aceptable; cumple holgadamente con los estándares nacionales.',
        poblacionGeneral: 'Actividades al aire libre seguras sin precauciones especiales.',
        poblacionSensible: 'Considere reducir actividades extenuantes al aire libre si experimenta tos o picor nasal.'
      };
    case 3:
      return {
        level: 3,
        label: 'Regular',
        color: 'text-[#ffc800] border-[#ffc800]/40 bg-[#ffc800]/15',
        hex: '#ffc800',
        bgHex: 'rgba(255,200,0,0.2)',
        desc: 'Calidad del aire moderada. Puede haber ligeras molestias para personas altamente vulnerables.',
        poblacionGeneral: 'Disfrute de forma general y preste atención si presenta fatiga inusual.',
        poblacionSensible: 'Reduzca actividades intensas en exteriores. Tenga a mano su medicación de control respiratorio.'
      };
    case 4:
      return {
        level: 4,
        label: 'Desfavorable',
        color: 'text-[#ff0000] border-[#ff0000]/40 bg-[#ff0000]/15',
        hex: '#ff0000',
        bgHex: 'rgba(255,0,0,0.2)',
        desc: 'Calidad del aire perjudicial. Riesgo moderado para la salud general y elevado para el grupo de riesgo.',
        poblacionGeneral: 'Considere moderar esfuerzos físicos vigorosos o duraderos al aire libre en horas punta.',
        poblacionSensible: 'Evite esfuerzos prolongados en el exterior. Reduzca drásticamente la actividad física.'
      };
    case 5:
      return {
        level: 5,
        label: 'Muy desfavorable',
        color: 'text-[#781414] border-[#781414]/50 bg-[#781414]/20',
        hex: '#781414',
        bgHex: 'rgba(120,20,20,0.3)',
        desc: 'Ambiente cargado de poluentes. Impacto directo en la función pulmonar y bronquial.',
        poblacionGeneral: 'Evite actividades físicas intensas en exteriores. Considere permanecer en interiores.',
        poblacionSensible: 'Permanezca en interiores. Evite todo esfuerzo físico y mantenga a mano el inhalador/fármacos.'
      };
    case 6:
    default:
      return {
        level: 6,
        label: 'Extremadamente desfavorable',
        color: 'text-[#800080] border-[#800080]/60 bg-[#800080]/30',
        hex: '#800080',
        bgHex: 'rgba(128,0,128,0.3)',
        desc: 'Alerta roja respiratoria nacional por altísimo contenido de partículas nocivas en suspensión.',
        poblacionGeneral: 'Evite la permanencia prolongada en el exterior. Cierre ventanas y use mascarilla FFP2 si sale.',
        poblacionSensible: 'Manténgase estrictamente dentro del hogar con ventanas cerradas. No realice esfuerzo alguno.'
      };
  }
}

// Convert MITECO limits to direct US-AQI equivalent index score for IQAir comparison
export function calculateUsAqiEquivalent(pm25: number | null | undefined, no2: number | null | undefined) {
  const v25 = pm25 !== null && pm25 !== undefined ? pm25 : 10;
  const vno2 = no2 !== null && no2 !== undefined ? no2 : 20;
  const pmAqi = Math.round(v25 * 3.3);
  const no2Aqi = Math.round(vno2 * 1.8);
  return Math.min(300, Math.max(15, Math.max(pmAqi, no2Aqi)));
}

// Get official 2024 US AQI colors, labels and descriptions used by IQAir
export function getUsAqiInfo(aqi: number) {
  if (aqi <= 50) {
    return {
      hex: '#00e400',
      color: 'text-[#00e400] border-[#00e400]/40 bg-[#00e400]/10',
      label: 'Bueno',
      desc: 'Calidad del aire satisfactoria y con poco o ningún riesgo.'
    };
  } else if (aqi <= 100) {
    return {
      hex: '#ffcc00',
      color: 'text-[#ffcc00] border-[#ffcc00]/40 bg-[#ffcc00]/10',
      label: 'Moderado',
      desc: 'Calidad aceptable; riesgo moderado para personas muy sensibles.'
    };
  } else if (aqi <= 150) {
    return {
      hex: '#ff7e00',
      color: 'text-[#ff7e00] border-[#ff7e00]/40 bg-[#ff7e00]/10',
      label: 'Grupos Sensibles',
      desc: 'Insalubre para grupos sensibles (asmáticos, niños, ancianos).'
    };
  } else if (aqi <= 200) {
    return {
      hex: '#ff0000',
      color: 'text-[#ff0000] border-[#ff0000]/40 bg-[#ff0000]/10',
      label: 'Insalubre',
      desc: 'La población general comenzará a experimentar efectos de salud.'
    };
  } else if (aqi <= 300) {
    return {
      hex: '#8f3f97',
      color: 'text-[#8f3f97] border-[#8f3f97]/40 bg-[#8f3f97]/10',
      label: 'Muy Insalubre',
      desc: 'Advertencia de salud por condiciones de emergencia general.'
    };
  } else {
    return {
      hex: '#7e0023',
      color: 'text-[#7e0023] border-[#7e0023]/40 bg-[#7e0023]/10',
      label: 'Peligroso',
      desc: 'Alerta sanitaria: todos pueden experimentar efectos graves.'
    };
  }
}

// Helper to get pollutant specific colors, limits, and safe-ratio percentages
export function getPollutantColorAndPct(type: 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co', value: number | null | undefined) {
  if (value === null || value === undefined) {
    return { hex: '#475569', label: 'Sin Datos', pct: 0, maxVal: 100, safeLimit: 0, safeLimitPct: 0 };
  }
  let level = 1;
  let maxVal = 100;
  let safeLimit = 10;
  
  if (type === 'pm25') {
    safeLimit = 10;
    maxVal = 60; // scale max
    if (value <= 10) level = 1;
    else if (value <= 20) level = 2;
    else if (value <= 25) level = 3;
    else if (value <= 50) level = 4;
    else if (value <= 75) level = 5;
    else level = 6;
  } else if (type === 'pm10') {
    safeLimit = 20;
    maxVal = 120; // scale max
    if (value <= 20) level = 1;
    else if (value <= 40) level = 2;
    else if (value <= 50) level = 3;
    else if (value <= 100) level = 4;
    else if (value <= 150) level = 5;
    else level = 6;
  } else if (type === 'no2') {
    safeLimit = 40;
    maxVal = 200; // scale max
    if (value <= 40) level = 1;
    else if (value <= 90) level = 2;
    else if (value <= 120) level = 3;
    else if (value <= 230) level = 4;
    else if (value <= 340) level = 5;
    else level = 6;
  } else if (type === 'o3') {
    safeLimit = 50;
    maxVal = 180; // scale max
    if (value <= 50) level = 1;
    else if (value <= 100) level = 2;
    else if (value <= 130) level = 3;
    else if (value <= 240) level = 4;
    else if (value <= 380) level = 5;
    else level = 6;
  } else if (type === 'so2') {
    safeLimit = 100;
    maxVal = 400; // scale max
    if (value <= 100) level = 1;
    else if (value <= 200) level = 2;
    else if (value <= 350) level = 3;
    else if (value <= 500) level = 4;
    else if (value <= 750) level = 5;
    else level = 6;
  } else if (type === 'co') {
    safeLimit = 10;
    maxVal = 15; // scale max
    if (value <= 10) level = 1;
    else level = 4;
  }

  const hexColors: { [key: number]: string } = {
    1: '#0096c8', // Buena (RGB: 0,150,200)
    2: '#32aa64', // Razonablemente buena (RGB: 50,170,100)
    3: '#ffc800', // Regular (RGB: 255,200,0)
    4: '#ff0000', // Desfavorable (RGB: 255,0,0)
    5: '#781414', // Muy desfavorable (RGB: 120,20,20)
    6: '#800080', // Extremadamente desfavorable (RGB: 128,0,128)
  };

  const labels: { [key: number]: string } = {
    1: 'Buena',
    2: 'Razonablemente buena',
    3: 'Regular',
    4: 'Desfavorable',
    5: 'Muy desfavorable',
    6: 'Extremadamente desfavorable'
  };

  const hex = hexColors[level] || '#0096c8';
  const label = labels[level] || 'Buena';
  const pct = Math.min(100, (value / maxVal) * 100);
  const safeLimitPct = (safeLimit / maxVal) * 100;

  return { hex, label, pct, maxVal, safeLimit, safeLimitPct };
}

interface IcaToast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  stationId: string;
  timestamp: Date;
}

export default function IcaAirQualityMonitor({ gpsd, config, onInjectRaw, iqair }: IcaAirQualityMonitorProps) {
  const [stations, setStations] = useState<AirQualityStation[]>(DEFAULT_STATIONS);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [viewMode, setViewMode] = useState<'lista' | 'mapa'>('lista');
  const [searchQuery, setSearchQuery] = useState('');
  const [pastedIcaLevel, setPastedIcaLevel] = useState<string>('todos');
  const [proximityFilter, setProximityFilter] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_proximity_filter') || 'todos';
    } catch {
      return 'todos';
    }
  });
  const [selectedStation, setSelectedStation] = useState<AirQualityStation | null>(DEFAULT_STATIONS[0]);

  // Fetch stations from backend on mount
  useEffect(() => {
    let active = true;
    const loadStations = async () => {
      try {
        const res = await fetch('/api/ica/stations');
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data) && data.length > 0) {
            const mapped = data.map(st => {
              const def = DEFAULT_STATIONS.find(d => d.id === st.id);
              return {
                ...st,
                region: st.region || def?.region || 'España',
                lastMeasured: st.lastMeasured || new Date().toISOString()
              };
            });
            setStations(mapped);
          }
        }
      } catch (err) {
        console.error("Error loading stations:", err);
      }
    };
    loadStations();
    return () => { active = false; };
  }, []);
  const [simulatedOffset, setSimulatedOffset] = useState<number>(0);

  // Custom thresholds state for pollutant alerts (PM2.5, CO, O3, NO2)
  const [thresholdPm25, setThresholdPm25] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_threshold_pm25');
      return stored ? parseFloat(stored) : 25;
    } catch {
      return 25;
    }
  });
  const [thresholdCo, setThresholdCo] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_threshold_co');
      return stored ? parseFloat(stored) : 10;
    } catch {
      return 10;
    }
  });
  const [thresholdO3, setThresholdO3] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_threshold_o3');
      return stored ? parseFloat(stored) : 130;
    } catch {
      return 130;
    }
  });
  const [thresholdNo2, setThresholdNo2] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_threshold_no2');
      return stored ? parseFloat(stored) : 120;
    } catch {
      return 120;
    }
  });
  const [showThresholdConfig, setShowThresholdConfig] = useState<boolean>(false);

  // Calima BOE / BLN2AQI Bulletin states
  const [pm10_24h, setPm10_24h] = useState<number>(30);
  const [polvo_sahariano, setPolvo_sahariano] = useState<number>(12);
  const [pm25_24h, setPm25_24h] = useState<number>(10);
  const [autoSyncWithStation, setAutoSyncWithStation] = useState<boolean>(true);
  const [bulletinLogs, setBulletinLogs] = useState<string[]>([]);

  // Data source selector
  const [calimaDataSource, setCalimaDataSource] = useState<'miteco' | 'iqair'>(() => {
    try {
      const stored = localStorage.getItem('ica_calima_data_source');
      return (stored as 'miteco' | 'iqair') || 'miteco';
    } catch {
      return 'miteco';
    }
  });

  // Customized APRS Template States
  const [templateBln2Aqi, setTemplateBln2Aqi] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_bln2aqi') || 'MEDICION CALIDAD AIRE - ICA: {ica} (PM2.5: {pm25}ug, CO: {co}ug, O3: {o3}ug)';
    } catch {
      return 'MEDICION CALIDAD AIRE - ICA: {ica} (PM2.5: {pm25}ug, CO: {co}ug, O3: {o3}ug)';
    }
  });
  const [templateCalima, setTemplateCalima] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_calima') || 'MEDICION CALIDAD AIRE - ALERTA CALIMA BOE CONFIRMADA ({criterio})';
    } catch {
      return 'MEDICION CALIDAD AIRE - ALERTA CALIMA BOE CONFIRMADA ({criterio})';
    }
  });
  const [templateBln4, setTemplateBln4] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_bln4') || 'ICA EXTR. DESFAVORABLE: Emergencia publica. Siga recomendaciones de salud.';
    } catch {
      return 'ICA EXTR. DESFAVORABLE: Emergencia publica. Siga recomendaciones de salud.';
    }
  });
  const [templateWalkieGral, setTemplateWalkieGral] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_walkie_gral') || 'ALERTA EMER: ICA Extr Desfavorable. Gral: evite estancia exterior.';
    } catch {
      return 'ALERTA EMER: ICA Extr Desfavorable. Gral: evite estancia exterior.';
    }
  });
  const [templateWalkieSens, setTemplateWalkieSens] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_walkie_sens') || 'ALERTA EMER: ICA Extr Desfavorable. Sens: permanezca dentro.';
    } catch {
      return 'ALERTA EMER: ICA Extr Desfavorable. Sens: permanezca dentro.';
    }
  });
  const [templateBln3, setTemplateBln3] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_bln3') || 'ICA MUY DESFAVORABLE: Gral: reduzca estar fuera. Sens: interiores y plan medico.';
    } catch {
      return 'ICA MUY DESFAVORABLE: Gral: reduzca estar fuera. Sens: interiores y plan medico.';
    }
  });
  const [templateBln2, setTemplateBln2] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_bln2') || 'ICA DESFAVORABLE: Gral: reduzca esfuerzo exterior. Sens: quedese en el interior.';
    } catch {
      return 'ICA DESFAVORABLE: Gral: reduzca esfuerzo exterior. Sens: quedese en el interior.';
    }
  });
  const [templateBln1, setTemplateBln1] = useState<string>(() => {
    try {
      return localStorage.getItem('ica_tpl_bln1') || 'ICA REGULAR: Gral: disfrute exterior. Sens: considere reducir esfuerzo.';
    } catch {
      return 'ICA REGULAR: Gral: disfrute exterior. Sens: considere reducir esfuerzo.';
    }
  });

  const [showTemplateConfig, setShowTemplateConfig] = useState<boolean>(false);

  // Automatic and programmable Calima transmission states
  const [followClosestStation, setFollowClosestStation] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ica_follow_closest');
      return stored ? JSON.parse(stored) === true : true;
    } catch {
      return true;
    }
  });

  const [autoTransmitEnabled, setAutoTransmitEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ica_auto_transmit');
      return stored ? JSON.parse(stored) === true : false;
    } catch {
      return false;
    }
  });

  const [autoTransmitOnChange, setAutoTransmitOnChange] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ica_auto_transmit_on_change');
      return stored ? JSON.parse(stored) === true : true;
    } catch {
      return true;
    }
  });

  const [intervalLevel3, setIntervalLevel3] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_interval_l3');
      return stored ? parseInt(stored, 10) : 180;
    } catch {
      return 180;
    }
  });

  const [intervalLevel4, setIntervalLevel4] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_interval_l4');
      return stored ? parseInt(stored, 10) : 120;
    } catch {
      return 120;
    }
  });

  const [intervalLevel5, setIntervalLevel5] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_interval_l5');
      return stored ? parseInt(stored, 10) : 60;
    } catch {
      return 60;
    }
  });

  const [intervalLevel6, setIntervalLevel6] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ica_interval_l6');
      return stored ? parseInt(stored, 10) : 30;
    } catch {
      return 30;
    }
  });

  const lastTxTimeRef = useRef<number>(0);
  const lastTxIcaLevelRef = useRef<number>(-1);
  const lastTxCalimaStateRef = useRef<boolean | null>(null);
  const lastTxStationIdRef = useRef<string | null>(null);

  // Save thresholds to localStorage
  useEffect(() => {
    localStorage.setItem('ica_threshold_pm25', thresholdPm25.toString());
  }, [thresholdPm25]);
  useEffect(() => {
    localStorage.setItem('ica_threshold_co', thresholdCo.toString());
  }, [thresholdCo]);
  useEffect(() => {
    localStorage.setItem('ica_threshold_o3', thresholdO3.toString());
  }, [thresholdO3]);
  useEffect(() => {
    localStorage.setItem('ica_threshold_no2', thresholdNo2.toString());
  }, [thresholdNo2]);

  // Push notification simulator & favorites state
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('ica_favorites');
      return stored ? JSON.parse(stored) : ['AQ-02', 'AQ-12']; // Default to Barcelona & Puertollano (higher pollutant averages)
    } catch {
      return ['AQ-02', 'AQ-12'];
    }
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ica_notifications_enabled');
      return stored ? JSON.parse(stored) === true : true;
    } catch {
      return true;
    }
  });
  const [browserPermission, setBrowserPermission] = useState<string>('default');
  const [toasts, setToasts] = useState<IcaToast[]>([]);
  const [tick, setTick] = useState<number>(0);
  const alertedKeys = useRef<Set<string>>(new Set());
  const customAlertedKeys = useRef<Set<string>>(new Set());

  // Save favorites & notification state to localStorage
  useEffect(() => {
    localStorage.setItem('ica_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('ica_notifications_enabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('ica_follow_closest', JSON.stringify(followClosestStation));
  }, [followClosestStation]);

  useEffect(() => {
    localStorage.setItem('ica_auto_transmit', JSON.stringify(autoTransmitEnabled));
  }, [autoTransmitEnabled]);

  useEffect(() => {
    localStorage.setItem('ica_auto_transmit_on_change', JSON.stringify(autoTransmitOnChange));
  }, [autoTransmitOnChange]);

  useEffect(() => {
    localStorage.setItem('ica_interval_l3', intervalLevel3.toString());
  }, [intervalLevel3]);

  useEffect(() => {
    localStorage.setItem('ica_interval_l4', intervalLevel4.toString());
  }, [intervalLevel4]);

  useEffect(() => {
    localStorage.setItem('ica_interval_l5', intervalLevel5.toString());
  }, [intervalLevel5]);

  useEffect(() => {
    localStorage.setItem('ica_interval_l6', intervalLevel6.toString());
  }, [intervalLevel6]);

  useEffect(() => {
    localStorage.setItem('ica_calima_data_source', calimaDataSource);
  }, [calimaDataSource]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_bln2aqi', templateBln2Aqi);
  }, [templateBln2Aqi]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_calima', templateCalima);
  }, [templateCalima]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_bln4', templateBln4);
  }, [templateBln4]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_walkie_gral', templateWalkieGral);
  }, [templateWalkieGral]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_walkie_sens', templateWalkieSens);
  }, [templateWalkieSens]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_bln3', templateBln3);
  }, [templateBln3]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_bln2', templateBln2);
  }, [templateBln2]);

  useEffect(() => {
    localStorage.setItem('ica_tpl_bln1', templateBln1);
  }, [templateBln1]);

  useEffect(() => {
    localStorage.setItem('ica_proximity_filter', proximityFilter);
  }, [proximityFilter]);

  // Request & check native browser notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const requestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
    }
  };

  // Live simulation tick to fluctuate pollutants and evaluate alert triggers
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 4000); // Ticks every 4 seconds to make live testing interactive
    return () => clearInterval(interval);
  }, []);

  // Modal & API detail states
  const [modalStation, setModalStation] = useState<AirQualityStation | null>(null);
  const [detailedData, setDetailedData] = useState<any | null>(null);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchDetailedStation = async (stationId: string) => {
    setLoadingDetailed(true);
    setApiError(null);
    try {
      const response = await customFetch(`/api/ica/station/${stationId}`);
      if (!response.ok) {
        throw new Error('Error al conectar con la API de calidad de aire');
      }
      const data = await response.json();
      setDetailedData(data);
    } catch (err: any) {
      setApiError(err.message || 'Error desconocido al extraer datos de telemetría');
    } finally {
      setLoadingDetailed(false);
    }
  };

  const handleSyncDatabase = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await customFetch('/api/ica/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stations) {
          const mapped = data.stations.map((st: any) => {
            const def = DEFAULT_STATIONS.find(d => d.id === st.id);
            return {
              ...st,
              region: st.region || def?.region || 'España',
              lastMeasured: st.lastMeasured || new Date().toISOString()
            };
          });
          setStations(mapped);
          setLastSyncTime(new Date());

          const newToast: IcaToast = {
            id: `sync-${Date.now()}`,
            title: 'Base de Datos Actualizada',
            message: 'Sincronización manual completada. Todas las estaciones de Calidad del Aire (ICA) han sido actualizadas con datos del MITECO y transmitidas vía baliza APRS.',
            type: 'info',
            stationId: 'SYSTEM',
            timestamp: new Date()
          };
          setToasts(prev => [newToast, ...prev].slice(0, 5));
          playAlertSound('chime');
        }
      } else {
        const newToast: IcaToast = {
          id: `sync-err-${Date.now()}`,
          title: 'Error de Sincronización',
          message: 'No se pudo contactar con el servidor central para actualizar los datos de calidad del aire.',
          type: 'warning',
          stationId: 'SYSTEM',
          timestamp: new Date()
        };
        setToasts(prev => [newToast, ...prev].slice(0, 5));
      }
    } catch (err) {
      console.error("Error syncing database:", err);
      const newToast: IcaToast = {
        id: `sync-err-${Date.now()}`,
        title: 'Error de Red',
        message: 'Ocurrió un error inesperado al actualizar la base de datos de estaciones.',
        type: 'warning',
        stationId: 'SYSTEM',
        timestamp: new Date()
      };
      setToasts(prev => [newToast, ...prev].slice(0, 5));
    } finally {
      setIsSyncing(false);
    }
  };

  // Haversine formula
  const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Enhance station data with distance keeping nullable values supported
  const stationsWithDistance = useMemo(() => {
    return stations.map(st => {
      // Add a little simulated live fluctuation based on time and ticks
      const secSeed = new Date().getMinutes() * 0.05 + new Date().getSeconds() * 0.001 + tick * 0.04;
      const variationFactor = 1 + Math.sin(st.id.charCodeAt(3) + secSeed) * 0.12;
      
      const modPm25 = st.pm25 !== null && st.pm25 !== undefined 
        ? parseFloat(Math.max(2, st.pm25 * variationFactor).toFixed(1)) 
        : null;
      const modPm10 = st.pm10 !== null && st.pm10 !== undefined 
        ? parseFloat(Math.max(4, st.pm10 * variationFactor).toFixed(1)) 
        : null;
      const modNo2 = st.no2 !== null && st.no2 !== undefined 
        ? parseFloat(Math.max(3, st.no2 * variationFactor).toFixed(1)) 
        : null;
      const modO3 = st.o3 !== null && st.o3 !== undefined 
        ? parseFloat(Math.max(10, st.o3 * variationFactor).toFixed(1)) 
        : null;
      const modSo2 = st.so2 !== null && st.so2 !== undefined 
        ? parseFloat(Math.max(1, st.so2 * variationFactor).toFixed(1)) 
        : null;
      const modCo = st.co !== null && st.co !== undefined 
        ? parseFloat(Math.max(0.1, st.co * variationFactor).toFixed(2)) 
        : null;

      const distance = calculateDistanceKm(gpsd.lat, gpsd.lon, st.lat, st.lon);

      return {
        ...st,
        pm25: modPm25,
        pm10: modPm10,
        no2: modNo2,
        o3: modO3,
        so2: modSo2,
        co: modCo,
        distance
      };
    });
  }, [gpsd.lat, gpsd.lon, tick]);

  // Evaluate if any favorite station is in a configured alert state based on user preferences
  useEffect(() => {
    if (!notificationsEnabled) return;

    stationsWithDistance.forEach(st => {
      if (!favorites.includes(st.id)) return;

      const ica = getMitecoIcaInfo(st.pm25, st.pm10, st.no2, st.o3, st.so2);
      
      // Load user notifications preferences for this specific ICA level from localStorage
      let levelBehavior: 'sound' | 'visual' | 'disabled' = 'disabled';
      let soundStyle: any = 'beep';
      let isSoundGloballyEnabled = true;

      try {
        const savedGlobalSound = localStorage.getItem('ica_sound_enabled');
        isSoundGloballyEnabled = savedGlobalSound ? JSON.parse(savedGlobalSound) : true;

        const savedBehavior = localStorage.getItem(`ica_pref_level_${ica.level}`);
        if (savedBehavior) {
          levelBehavior = JSON.parse(savedBehavior);
        } else {
          // Default fallbacks matching the app design
          if (ica.level >= 4) {
            levelBehavior = 'sound';
          } else if (ica.level === 3) {
            levelBehavior = 'visual';
          } else {
            levelBehavior = 'disabled';
          }
        }

        const savedStyle = localStorage.getItem(`ica_sound_style_${ica.level}`);
        if (savedStyle) {
          soundStyle = JSON.parse(savedStyle);
        } else {
          soundStyle = ica.level === 6 ? 'warble' : ica.level === 5 ? 'siren' : ica.level === 4 ? 'beep' : 'chime';
        }
      } catch (e) {
        // Fallback defaults
        if (ica.level >= 4) levelBehavior = 'sound';
        else if (ica.level === 3) levelBehavior = 'visual';
        else levelBehavior = 'disabled';
        soundStyle = ica.level === 6 ? 'warble' : ica.level === 5 ? 'siren' : ica.level === 4 ? 'beep' : 'chime';
      }

      // Evaluaciones de umbrales personalizados por contaminante (PM2.5, CO, O3, NO2)
      if (notificationsEnabled) {
        const exceededCustom: { name: string; val: number; threshold: number; unit: string }[] = [];
        if (st.pm25 !== null && st.pm25 !== undefined && st.pm25 > thresholdPm25) {
          exceededCustom.push({ name: 'PM2.5', val: st.pm25, threshold: thresholdPm25, unit: 'µg/m³' });
        }
        if (st.co !== null && st.co !== undefined && st.co > thresholdCo) {
          exceededCustom.push({ name: 'CO', val: st.co, threshold: thresholdCo, unit: 'mg/m³' });
        }
        if (st.o3 !== null && st.o3 !== undefined && st.o3 > thresholdO3) {
          exceededCustom.push({ name: 'O₃', val: st.o3, threshold: thresholdO3, unit: 'µg/m³' });
        }
        if (st.no2 !== null && st.no2 !== undefined && st.no2 > thresholdNo2) {
          exceededCustom.push({ name: 'NO₂', val: st.no2, threshold: thresholdNo2, unit: 'µg/m³' });
        }

        if (exceededCustom.length > 0) {
          exceededCustom.forEach(item => {
            const alertedKey = `${st.id}-custom-${item.name}-${Math.round(item.val)}`;
            if (!customAlertedKeys.current.has(alertedKey)) {
              customAlertedKeys.current.add(alertedKey);

              const title = `⚠️ Alerta de Umbral S.A.T.: ${st.name.split(' - ')[0]}`;
              const message = `Sensor ${item.name} ha registrado ${item.val} ${item.unit}, superando el límite de alerta personalizado (${item.threshold} ${item.unit})`;

              // Visual Notification in Console
              const newToast: IcaToast = {
                id: `${st.id}-custom-${item.name}-${Date.now()}`,
                title,
                message,
                type: 'alert',
                stationId: st.id,
                timestamp: new Date()
              };
              setToasts(prev => [newToast, ...prev].slice(0, 5));

              // Auditory alarm (Play alarm sound)
              if (isSoundGloballyEnabled) {
                playAlertSound('siren');
              }

              // Native Browser Notification
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification(title, { body: message, icon: '/icon.png' });
                } catch (e) {
                  console.warn('Native notification failed', e);
                }
              }

              // S.A.T. Messages and APRS bulletins injection
              const callsign = config?.callsign || 'EA1URG-10';
              const cleanName = st.name.toUpperCase().split(' - ')[0];

              // Bulletin APRS
              const bulletinPacket = `${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN1ICA  :⚠️ UMBRAL EXCEDIDO - ESTACION ${cleanName} REGISTRA ${item.name}: ${item.val} > ${item.threshold} ${item.unit}`;
              
              // APRS Message
              const messagePacket = `${callsign}>APRS,TCPIP*,qAC,GATEWAY::SNECA    :⚠️ ALERTA CALIDAD AIRE: ${st.name.split(' - ')[0]} excede umbral de ${item.name}. Valor: ${item.val} (Limite: ${item.threshold})`;

              // Inject packets
              customFetch('/api/aprs/inject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'RAW_PACKET', payload: bulletinPacket })
              }).catch(err => console.error("Error injecting APRS bulletin:", err));

              customFetch('/api/aprs/inject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'RAW_PACKET', payload: messagePacket })
              }).catch(err => console.error("Error injecting APRS message:", err));
            }
          });
        }
      }

      // If disabled for this level, skip entirely
      if (levelBehavior === 'disabled') return;

      // Find which specific pollutants exceeded standard levels
      const badPollutants: string[] = [];
      if (st.pm25 !== null && st.pm25 !== undefined && st.pm25 > 25) badPollutants.push(`PM2.5 (${st.pm25} µg/m³)`);
      if (st.pm10 !== null && st.pm10 !== undefined && st.pm10 > 50) badPollutants.push(`PM10 (${st.pm10} µg/m³)`);
      if (st.no2 !== null && st.no2 !== undefined && st.no2 > 120) badPollutants.push(`NO₂ (${st.no2} µg/m³)`);
      if (st.o3 !== null && st.o3 !== undefined && st.o3 > 130) badPollutants.push(`O₃ (${st.o3} µg/m³)`);
      if (st.so2 !== null && st.so2 !== undefined && st.so2 > 350) badPollutants.push(`SO₂ (${st.so2} µg/m³)`);

      const polStr = badPollutants.length > 0 ? badPollutants.join(', ') : 'Contaminantes elevados';

      // We use a unique alert key so we don't alert the exact same category twice in a row
      const alertKey = `${st.id}-${ica.level}`;
      if (!alertedKeys.current.has(alertKey)) {
        alertedKeys.current.add(alertKey);

        const title = `⚠️ Alerta: ${st.name}`;
        const message = `Calidad del aire '${ica.label}' (Falta de inocuidad). Exceso: ${polStr}.`;

        // Add toast
        const newToast: IcaToast = {
          id: `${st.id}-${Date.now()}`,
          title,
          message,
          type: ica.level >= 5 ? 'alert' : 'warning',
          stationId: st.id,
          timestamp: new Date()
        };

        setToasts(prev => [newToast, ...prev].slice(0, 5)); // max 5 toasts

        // Play alarm sound if set to 'sound' and global sound is enabled
        if (levelBehavior === 'sound' && isSoundGloballyEnabled) {
          playAlertSound(soundStyle);
        }

        // Native notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, {
              body: message,
              icon: '/icon.png'
            });
          } catch (e) {
            console.warn('Native notification failed', e);
          }
        }
      }
    });
  }, [stationsWithDistance, favorites, notificationsEnabled, thresholdPm25, thresholdCo, thresholdO3, thresholdNo2, config]);

  const filteredStations = useMemo(() => {
    return stationsWithDistance.filter(st => {
      const matchesSearch = st.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            st.province.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            st.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            st.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const ica = getMitecoIcaInfo(st.pm25, st.pm10, st.no2, st.o3, st.so2);
      const matchesIca = pastedIcaLevel === 'todos' || ica.label.toLowerCase() === pastedIcaLevel.toLowerCase();

      // Proximity Filtering
      let matchesProximity = true;
      if (proximityFilter === 'cobertura') {
        const radius = config?.filterRadiusKm || 150;
        matchesProximity = st.distance <= radius;
      } else if (proximityFilter !== 'todos') {
        const maxDist = parseFloat(proximityFilter);
        if (!isNaN(maxDist)) {
          matchesProximity = st.distance <= maxDist;
        }
      }

      return matchesSearch && matchesIca && matchesProximity;
    }).sort((a, b) => a.distance - b.distance);
  }, [stationsWithDistance, searchQuery, pastedIcaLevel, proximityFilter, config]);

  // Follow closest station if enabled
  useEffect(() => {
    if (followClosestStation && stationsWithDistance.length > 0) {
      const closest = stationsWithDistance[0];
      if (!selectedStation || selectedStation.id !== closest.id) {
        setSelectedStation(closest);
      }
    }
  }, [followClosestStation, stationsWithDistance, selectedStation]);

  const activeStation = useMemo(() => {
    if (!selectedStation) return null;
    const match = stationsWithDistance.find(s => s.id === selectedStation.id);
    return match || selectedStation;
  }, [stationsWithDistance, selectedStation]);

  const activeIca = activeStation ? getMitecoIcaInfo(activeStation.pm25, activeStation.pm10, activeStation.no2, activeStation.o3, activeStation.so2) : null;
  const activeUsAqi = activeStation ? calculateUsAqiEquivalent(activeStation.pm25, activeStation.no2) : 50;
  const activeUsAqiInfo = getUsAqiInfo(activeUsAqi);

  // Synchronize state with selected station or IQAir if auto-sync is active
  useEffect(() => {
    if (autoSyncWithStation) {
      if (calimaDataSource === 'iqair' && iqair) {
        const pm10Val = iqair.pm10 ?? (iqair.aqi ? Math.round(iqair.aqi * 0.7) : 30);
        const pm25Val = iqair.pm2_5 ?? (iqair.aqi ? Math.round(iqair.aqi * 0.4) : 12);
        setPm10_24h(pm10Val);
        setPm25_24h(pm25Val);
        // Simulate dusting factor based on PM10 with minor tick fluctuation
        const simulatedDust = Math.max(0, parseFloat((pm10Val * 0.48 + (Math.sin(tick * 0.1) * 1.2)).toFixed(1)));
        setPolvo_sahariano(simulatedDust);
      } else if (activeStation) {
        const pm10Val = activeStation.pm10 ?? 24;
        const pm25Val = activeStation.pm25 ?? 9.9;
        setPm10_24h(pm10Val);
        setPm25_24h(pm25Val);
        // Simulate dusting factor based on PM10 with minor tick fluctuation
        const simulatedDust = Math.max(0, parseFloat((pm10Val * 0.45 + (Math.sin(tick * 0.1) * 1)).toFixed(1)));
        setPolvo_sahariano(simulatedDust);
      }
    }
  }, [activeStation, calimaDataSource, iqair, autoSyncWithStation, tick]);

  const calimaAnalysis = useMemo(() => {
    if (pm10_24h <= 0 || pm25_24h <= 0) {
      return { calima: false, motivo: "Datos insuficientes o incorrectos" };
    }

    if (polvo_sahariano > 100) {
      return {
        calima: true, 
        criterio: "Polvo sahariano extremo (>100 µg/m³)",
        ratio_pm25_pm10: `${((pm25_24h / pm10_24h) * 100).toFixed(1)}%`,
        metricas: {
          ratio_sahariano_pm10: `${((polvo_sahariano / pm10_24h) * 100).toFixed(1)}%`,
          ratio_pm25_pm10_real: `${((pm25_24h / pm10_24h) * 100).toFixed(1)}%`,
          ratio_referencia_boe: "50.0%"
        }
      };
    }
        
    const superaLimiteLegal = pm10_24h > 50;          
    const polvoSignificativo = polvo_sahariano > 30;   
    
    const ratioOrigen = (polvo_sahariano / pm10_24h) * 100;
    const origenSahariano = ratioOrigen >= 60;

    const ratioPm25Pm10 = (pm25_24h / pm10_24h) * 100;
    const esPolvoGrueso = ratioPm25Pm10 < 40;  

    const calimaConfirmada = superaLimiteLegal && polvoSignificativo && origenSahariano && esPolvoGrueso;

    return {
      calima: calimaConfirmada,
      criterio: calimaConfirmada ? "Fórmula estándar + Filtro granulométrico" : "Condiciones no cumplidas (requiere PM10 > 50, Polvo > 30, Origen Sahariano ≥ 60% y Polvo Grueso PM2.5/PM10 < 40%)",
      metricas: {
        ratio_sahariano_pm10: `${ratioOrigen.toFixed(1)}%`,
        ratio_pm25_pm10_real: `${ratioPm25Pm10.toFixed(1)}%`,
        ratio_referencia_boe: "50.0%"
      }
    };
  }, [pm10_24h, polvo_sahariano, pm25_24h]);

  // Automated Transmission of Bulletins based on active station values, intervals or state changes
  useEffect(() => {
    if (!autoTransmitEnabled || !activeStation || !activeIca) return;

    const currentIcaLevel = activeIca.level;
    const currentCalimaState = calimaAnalysis.calima;
    const currentStationId = activeStation.id;

    // We only transmit if the active level is >= 3 (Moderate/Regular to Extremely Unfavorable)
    if (currentIcaLevel < 3) return;

    const now = Date.now();
    let shouldTransmit = false;
    let reason = "";

    // 1. Check for State/Level Change trigger
    if (autoTransmitOnChange) {
      const levelChanged = lastTxIcaLevelRef.current !== currentIcaLevel;
      const calimaChanged = lastTxCalimaStateRef.current !== currentCalimaState;
      const stationChanged = lastTxStationIdRef.current !== currentStationId;

      if (levelChanged || calimaChanged || stationChanged) {
        shouldTransmit = true;
        reason = `Cambio de estado en estación más cercana (Nivel: ${lastTxIcaLevelRef.current} -> ${currentIcaLevel}, Calima: ${lastTxCalimaStateRef.current === null ? 'N/A' : lastTxCalimaStateRef.current ? 'SI' : 'NO'} -> ${currentCalimaState ? 'SI' : 'NO'})`;
      }
    }

    // 2. Check for Time Interval trigger
    if (!shouldTransmit) {
      let intervalSec = 0;
      if (currentIcaLevel === 3) intervalSec = intervalLevel3;
      else if (currentIcaLevel === 4) intervalSec = intervalLevel4;
      else if (currentIcaLevel === 5) intervalSec = intervalLevel5;
      else if (currentIcaLevel >= 6) intervalSec = intervalLevel6;

      const elapsedSec = (now - lastTxTimeRef.current) / 1000;
      if (elapsedSec >= intervalSec) {
        shouldTransmit = true;
        reason = `Intervalo programado de ${intervalSec}s completado para Nivel ${currentIcaLevel}`;
      }
    }

    if (shouldTransmit) {
      // Update refs immediately to prevent race conditions during async transmission
      lastTxTimeRef.current = now;
      lastTxIcaLevelRef.current = currentIcaLevel;
      lastTxCalimaStateRef.current = currentCalimaState;
      lastTxStationIdRef.current = currentStationId;

      const timestampStr = new Date().toLocaleTimeString('es-ES');
      setBulletinLogs(prev => [`[${timestampStr}] ⚡ DIFUSIÓN AUTO: ${reason}`, ...prev].slice(0, 15));
      
      // Perform transmission
      handleTransmitCalimaBulletin();
    }
  }, [
    tick,
    autoTransmitEnabled,
    activeStation,
    activeIca,
    calimaAnalysis,
    autoTransmitOnChange,
    intervalLevel3,
    intervalLevel4,
    intervalLevel5,
    intervalLevel6
  ]);

  const handleTransmitCalimaBulletin = async () => {
    const callsign = config?.callsign || 'EA1URG-10';
    const packetsToSend: string[] = [];
    const timestampStr = new Date().toLocaleTimeString('es-ES');

    // Standard broadcast callsign
    const destino_bc = "CQ       "; // 9 characters obligatory for broadcast messages

    // Dict of parameters for templates
    const dict = {
      ica: activeStation ? activeUsAqi : (iqair ? iqair.aqi : 42),
      pm25: pm25_24h.toFixed(1),
      pm10: pm10_24h.toFixed(1),
      co: activeStation?.co !== null && activeStation?.co !== undefined ? Math.round(activeStation.co * 1000) : (iqair?.co !== null && iqair?.co !== undefined ? Math.round(iqair.co * 1000) : 102),
      o3: (activeStation?.o3 !== null && activeStation?.o3 !== undefined ? activeStation.o3 : (iqair?.o3 ?? 104.0)).toFixed(1),
      no2: (activeStation?.no2 !== null && activeStation?.no2 !== undefined ? activeStation.no2 : (iqair?.no2 ?? 20.0)).toFixed(1),
      so2: (activeStation?.so2 !== null && activeStation?.so2 !== undefined ? activeStation.so2 : (iqair?.so2 ?? 3.0)).toFixed(1),
      station: calimaDataSource === 'iqair' ? (iqair?.city || 'IQAir Cloud') : (activeStation?.name?.split(' - ')[0] || 'MITECO Local'),
      criterio: calimaAnalysis.criterio,
      dust: polvo_sahariano.toFixed(1)
    };

    const parseLocalTpl = (tpl: string) => {
      let result = tpl;
      for (const [key, val] of Object.entries(dict)) {
        result = result.replaceAll(`{${key}}`, val !== null && val !== undefined ? String(val) : '');
      }
      return result;
    };

    // 1. PUBLIC AIR QUALITY BULLETIN (BLN2AQI)
    const mainBlnPacket = `${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN2AQI  :${parseLocalTpl(templateBln2Aqi)}`;
    packetsToSend.push(mainBlnPacket);

    // 2. ALERT LEVEL PROCESSING ACCORDING TO BOE
    if (pm10_24h > 150 || polvo_sahariano > 100) {
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN4      :${parseLocalTpl(templateBln4)}`);
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::${destino_bc}:${parseLocalTpl(templateWalkieGral)}`);
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::${destino_bc}:${parseLocalTpl(templateWalkieSens)}`);
    } else if (pm10_24h > 100) {
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN3      :${parseLocalTpl(templateBln3)}`);
    } else if (pm10_24h > 50) {
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN2      :${parseLocalTpl(templateBln2)}`);
    } else if (pm10_24h > 35) {
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN1      :${parseLocalTpl(templateBln1)}`);
    }

    if (calimaAnalysis.calima) {
      packetsToSend.push(`${callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN2AQI  :${parseLocalTpl(templateCalima)}`);
    }

    // Now inject packets
    const logEntries: string[] = [];
    for (const packet of packetsToSend) {
      try {
        let ok = false;
        if (onInjectRaw) {
          ok = await onInjectRaw(packet);
        } else {
          const resp = await fetch('/api/aprs/inject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'RAW_PACKET', payload: packet })
          });
          ok = resp.ok;
        }

        if (ok) {
          logEntries.push(`[${timestampStr}] ENVIADO OK: ${packet}`);
        } else {
          logEntries.push(`[${timestampStr}] FALLO INYECCIÓN: ${packet}`);
        }
      } catch (e: any) {
        logEntries.push(`[${timestampStr}] ERROR RED: ${e.message || e}`);
      }
    }

    setBulletinLogs(prev => [...logEntries, ...prev].slice(0, 15));
    playAlertSound('chime');
  };

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl shadow-xl p-4 flex flex-col gap-3 font-mono text-xs" id="ica-calidad-aire-widget">
      
      {/* Title & Badge */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <Wind size={16} className="animate-pulse" />
          <div>
            <h3 className="font-extrabold text-[10px] uppercase tracking-widest text-slate-100 font-mono">
              SEGUIMIENTO DE ESTACIONES DE CALIDAD DEL AIRE (ICA)
            </h3>
            <p className="text-[8.5px] text-slate-500 font-sans tracking-tight mt-0.5">
              Protocolo coordinado MITECO e IQAir para salvaguarda respiratoria civil.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-emerald-950/40 text-emerald-400 text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase border border-emerald-900/30">
          <Activity size={10} />
          <span>SNECA ACTIVO</span>
        </div>
      </div>

      {/* External Visor Portals Grid */}
      <div className="grid grid-cols-2 gap-2">
        <a 
          href="https://sig.miteco.gob.es/calidad-aire/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="bg-slate-900/60 hover:bg-slate-900 border border-slate-850 hover:border-emerald-500/30 text-slate-200 hover:text-emerald-400 p-2 rounded-xl transition-all duration-200 flex flex-col justify-between group cursor-pointer"
          id="visor-miteco-btn"
        >
          <div className="flex justify-between items-start">
            <span className="text-[7.5px] uppercase text-emerald-500 font-black tracking-widest font-mono">Visor Nacional</span>
            <ExternalLink size={10} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <span className="text-[10px] font-sans font-bold text-slate-200 mt-1 block">SIG MITECO España</span>
          <span className="text-[8px] text-slate-500 font-sans block mt-0.5 leading-tight">Mapa oficial e Índices Georreferenciados</span>
        </a>

        <a 
          href="https://www.iqair.com/es/air-quality/spain" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="bg-slate-900/60 hover:bg-slate-900 border border-slate-850 hover:border-amber-500/30 text-slate-200 hover:text-amber-400 p-2 rounded-xl transition-all duration-200 flex flex-col justify-between group cursor-pointer"
          id="visor-iqair-btn"
        >
          <div className="flex justify-between items-start">
            <span className="text-[7.5px] uppercase text-amber-500 font-black tracking-widest font-mono">Visor Global</span>
            <ExternalLink size={10} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
          </div>
          <span className="text-[10px] font-sans font-bold text-slate-200 mt-1 block">IQAir España</span>
          <span className="text-[8px] text-slate-500 font-sans block mt-0.5 leading-tight">Estaciones de fondo y satelitales en tiempo real</span>
        </a>
      </div>

      {/* Dynamic Alerts and Favorites Monitor Panel */}
      <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Bell size={12} className={notificationsEnabled && favorites.length > 0 ? "text-amber-400 animate-bounce" : "text-slate-500"} />
            <div>
              <span className="text-[9px] text-slate-300 font-extrabold uppercase font-mono tracking-wider block">Notificaciones Push SNECA</span>
              <span className="text-[8px] text-slate-500 block leading-none mt-0.5">Alertas de contaminantes en tus estaciones seguidas</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Request Native Browser Permission button */}
            {typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={requestBrowserPermission}
                className={`text-[8px] px-2 py-0.5 rounded font-extrabold border transition-colors ${
                  browserPermission === 'granted'
                    ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30'
                    : browserPermission === 'denied'
                    ? 'bg-rose-950/20 text-rose-400 border-rose-900/30'
                    : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
                }`}
                title="Habilitar notificaciones nativas en el sistema operativo"
              >
                {browserPermission === 'granted' ? 'NATIVAS OK' : browserPermission === 'denied' ? 'NATIVAS BLOCK' : 'NATIVAS OFF'}
              </button>
            )}

            {/* Toggle threshold config panel */}
            <button
              onClick={() => setShowThresholdConfig(!showThresholdConfig)}
              className={`text-[8.5px] px-2 py-0.5 rounded font-extrabold border flex items-center gap-1 transition-colors ${
                showThresholdConfig 
                  ? 'bg-amber-950 text-amber-400 border-amber-900' 
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-350 border-slate-800'
              }`}
              title="Configurar umbrales de alerta personalizados por contaminante"
            >
              <Sliders size={10} />
              <span>UMBRALES</span>
            </button>

            {/* Toggle notifications enabled */}
            <button
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`text-[8.5px] px-2 py-0.5 rounded font-extrabold border transition-colors ${
                notificationsEnabled 
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              {notificationsEnabled ? 'ACTIVO' : 'APAGADO'}
            </button>
          </div>
        </div>

        {/* Collapsible Thresholds Config Panel */}
        <AnimatePresence>
          {showThresholdConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-slate-950 pt-2.5 pb-1 overflow-hidden"
            >
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-900 flex flex-col gap-3">
                <div className="flex justify-between items-center pb-1 border-b border-slate-900">
                  <span className="text-[8.5px] text-amber-400 font-extrabold uppercase font-mono tracking-wider flex items-center gap-1">
                    <Sliders size={11} className="text-amber-500 animate-pulse" />
                    Ajuste de Umbrales de Alerta Personalizados
                  </span>
                  <button 
                    onClick={() => {
                      setThresholdPm25(25);
                      setThresholdCo(10);
                      setThresholdO3(130);
                      setThresholdNo2(120);
                    }}
                    className="text-[7.5px] text-slate-500 hover:text-slate-300 underline uppercase cursor-pointer"
                    title="Restablecer valores predeterminados"
                  >
                    Valores por Defecto
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* PM2.5 Threshold */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline text-[8.5px] font-bold">
                      <span className="text-slate-300">Material Particulado Fino (PM2.5)</span>
                      <span className="text-amber-400 font-mono">{thresholdPm25} µg/m³</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={thresholdPm25} 
                        onChange={(e) => setThresholdPm25(parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[7.5px] text-slate-500 font-mono w-4 text-right">100</span>
                    </div>
                    <p className="text-[7.5px] text-slate-500 leading-normal font-sans">
                      Límite de alerta estándar S.A.T.: 25 µg/m³ (MITECO Desfavorable).
                    </p>
                  </div>

                  {/* CO Threshold */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline text-[8.5px] font-bold">
                      <span className="text-slate-300">Monóxido de Carbono (CO)</span>
                      <span className="text-amber-400 font-mono">{thresholdCo} mg/m³</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="1" 
                        max="30" 
                        value={thresholdCo} 
                        onChange={(e) => setThresholdCo(parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[7.5px] text-slate-500 font-mono w-4 text-right">30</span>
                    </div>
                    <p className="text-[7.5px] text-slate-500 leading-normal font-sans">
                      Límite de alerta estándar S.A.T.: 10 mg/m³ (MITECO Desfavorable).
                    </p>
                  </div>

                  {/* O3 Threshold */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline text-[8.5px] font-bold">
                      <span className="text-slate-300">Ozono Troposférico (O₃)</span>
                      <span className="text-amber-400 font-mono">{thresholdO3} µg/m³</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="20" 
                        max="240" 
                        value={thresholdO3} 
                        onChange={(e) => setThresholdO3(parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[7.5px] text-slate-500 font-mono w-4 text-right">240</span>
                    </div>
                    <p className="text-[7.5px] text-slate-500 leading-normal font-sans">
                      Umbral de información: 180 µg/m³, Alerta: 240 µg/m³.
                    </p>
                  </div>

                  {/* NO2 Threshold */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline text-[8.5px] font-bold">
                      <span className="text-slate-300">Dióxido de Nitrógeno (NO₂)</span>
                      <span className="text-amber-400 font-mono">{thresholdNo2} µg/m³</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="range" 
                        min="10" 
                        max="200" 
                        value={thresholdNo2} 
                        onChange={(e) => setThresholdNo2(parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[7.5px] text-slate-500 font-mono w-4 text-right">200</span>
                    </div>
                    <p className="text-[7.5px] text-slate-500 leading-normal font-sans">
                      Valor límite anual: 40 µg/m³, Alerta de umbral: 200 µg/m³.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Favorites list */}
        <div className="border-t border-slate-950 pt-2">
          <span className="text-[7.5px] text-slate-500 font-black uppercase tracking-wider block mb-1">Tus Estaciones Seguidas ({favorites.length})</span>
          {favorites.length === 0 ? (
            <p className="text-[8.5px] text-slate-550 italic leading-tight">
              No sigues ninguna estación. Haz clic en el icono de estrella (⭐) en la tabla o mapa para activar la monitorización en tiempo real.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {favorites.map(id => {
                const st = stationsWithDistance.find(s => s.id === id);
                if (!st) return null;
                const ica = getMitecoIcaInfo(st.pm25, st.pm10, st.no2, st.o3, st.so2);
                return (
                  <div 
                    key={id}
                    onClick={() => {
                      setSelectedStation(st);
                      setModalStation(st);
                      fetchDetailedStation(st.id);
                    }}
                    className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded px-1.5 py-0.5 text-[8.5px] cursor-pointer transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ica.hex }} />
                    <span className="text-slate-300 font-bold truncate max-w-[85px]">{st.name.split(' - ')[0]}</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setFavorites(prev => prev.filter(fid => fid !== id));
                      }}
                      className="text-slate-500 hover:text-rose-400 text-[8px] font-bold ml-1"
                      title="Dejar de seguir"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Alerts List (Toasts Container) */}
        {toasts.length > 0 && (
          <div className="border-t border-slate-950 pt-2 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[7.5px] text-amber-500 font-black uppercase tracking-wider block">Alertas Recientes (Exceso de Umbral 'Desfavorable')</span>
              <button 
                onClick={() => setToasts([])}
                className="text-[7.5px] text-slate-500 hover:text-slate-300 uppercase underline"
              >
                Limpiar todo
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto scrollbar-thin">
              <AnimatePresence initial={false}>
                {toasts.map(toast => {
                  const isCritical = toast.type === 'alert';
                  return (
                    <motion.div
                      key={toast.id}
                      initial={{ opacity: 0, height: 0, y: -5 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: 5 }}
                      className={`flex items-start justify-between gap-2 p-1.5 rounded border text-[8.5px] leading-tight ${
                        isCritical 
                          ? 'bg-rose-950/35 text-rose-350 border-rose-900/40' 
                          : 'bg-amber-950/25 text-amber-350 border-amber-900/30'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="font-extrabold flex items-center gap-1">
                          <span className={`w-1 h-1 rounded-full animate-ping ${isCritical ? 'bg-rose-500' : 'bg-amber-500'}`} />
                          {toast.title}
                        </div>
                        <p className="text-slate-400 mt-0.5">{toast.message}</p>
                        <span className="text-[7px] text-slate-500 mt-1 block">
                          Hace unos segundos • {toast.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <button 
                        onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                        className="text-slate-500 hover:text-slate-300 font-bold px-1 text-[9px]"
                      >
                        ×
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN NUEVA: PROCESADOR DE ALERTA CALIMA BOE Y EMISOR DE BOLETINES (BLN2AQI) */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-slate-800/85 pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-amber-400">
            <ShieldAlert size={14} className="animate-pulse shrink-0" />
            <div>
              <span className="text-[9.5px] text-slate-100 font-extrabold uppercase font-mono tracking-wider block">
                Boletín de Calima BOE & Difusión APRS (BLN2AQI)
              </span>
              <span className="text-[8px] text-slate-500 block leading-none mt-0.5 font-sans">
                Procesamiento de episodios de polvo sahariano y ratios temporales oficiales.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[8.5px] font-sans text-slate-400 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={autoSyncWithStation} 
                onChange={(e) => setAutoSyncWithStation(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 accent-emerald-500 w-3 h-3 cursor-pointer"
              />
              <span>Autosincronizar</span>
            </label>
            <span className="bg-amber-950/40 text-amber-400 text-[8px] px-1.5 py-0.5 rounded font-black border border-amber-900/30 uppercase tracking-wider shrink-0">
              MITECO BOE-A-2020-10426
            </span>
          </div>
        </div>

        {/* DATA SOURCE SELECTOR ROW */}
        <div className="flex items-center justify-between bg-slate-950/40 p-2 rounded-lg border border-slate-900/50 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[8px] uppercase text-slate-400 font-extrabold font-mono">Origen de Datos para Calima:</span>
            <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800">
              <button 
                type="button"
                onClick={() => setCalimaDataSource('miteco')}
                className={`text-[8px] uppercase px-2 py-0.5 rounded font-black transition-all ${calimaDataSource === 'miteco' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200'}`}
              >
                MITECO España
              </button>
              <button 
                type="button"
                onClick={() => setCalimaDataSource('iqair')}
                className={`text-[8px] uppercase px-2 py-0.5 rounded font-black transition-all ${calimaDataSource === 'iqair' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200'}`}
              >
                IQAir Cloud Feed
              </button>
            </div>
          </div>
          {calimaDataSource === 'iqair' && (
            <div className="flex items-center gap-1.5 text-[7.5px] text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded font-sans">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span>Sincronizado con IQAir: <strong>{iqair?.city || 'Zorita'}</strong> (AQI: {iqair?.aqi || '--'}, PM2.5: {iqair?.pm2_5 || '--'}µg)</span>
            </div>
          )}
          {calimaDataSource === 'miteco' && (
            <div className="flex items-center gap-1.5 text-[7.5px] text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded font-sans">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
              <span>Sincronizado con MITECO: <strong>{activeStation?.name?.split(' - ')[0] || 'No conectada'}</strong></span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* PM10 24h Input */}
          <div className="space-y-1 bg-black/25 p-2 rounded-lg border border-slate-900/60">
            <div className="flex justify-between items-baseline text-[8.5px] font-bold">
              <span className="text-slate-400">PM10 (Med. 24h)</span>
              <span className="text-slate-200">{pm10_24h} µg/m³</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="200" 
              step="1"
              disabled={autoSyncWithStation}
              value={pm10_24h} 
              onChange={(e) => setPm10_24h(parseInt(e.target.value))}
              className="w-full accent-amber-500 h-1 bg-slate-950 rounded cursor-pointer disabled:opacity-40"
            />
            <p className="text-[7.5px] text-slate-500 font-sans leading-tight">
              Límite BOE: 50 µg/m³
            </p>
          </div>

          {/* Polvo Sahariano Input */}
          <div className="space-y-1 bg-black/25 p-2 rounded-lg border border-slate-900/60">
            <div className="flex justify-between items-baseline text-[8.5px] font-bold">
              <span className="text-slate-400">Polvo Sahariano</span>
              <span className="text-slate-200">{polvo_sahariano} µg/m³</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="150" 
              step="0.5"
              disabled={autoSyncWithStation}
              value={polvo_sahariano} 
              onChange={(e) => setPolvo_sahariano(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1 bg-slate-950 rounded cursor-pointer disabled:opacity-40"
            />
            <p className="text-[7.5px] text-slate-500 font-sans leading-tight">
              Origen Sahariano (ratio ≥60%)
            </p>
          </div>

          {/* PM2.5 24h Input */}
          <div className="space-y-1 bg-black/25 p-2 rounded-lg border border-slate-900/60">
            <div className="flex justify-between items-baseline text-[8.5px] font-bold">
              <span className="text-slate-400">PM2.5 (Med. 24h)</span>
              <span className="text-slate-200">{pm25_24h} µg/m³</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              step="0.5"
              disabled={autoSyncWithStation}
              value={pm25_24h} 
              onChange={(e) => setPm25_24h(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1 bg-slate-950 rounded cursor-pointer disabled:opacity-40"
            />
            <p className="text-[7.5px] text-slate-500 font-sans leading-tight">
              Filtro granulométrico (ratio &lt;40%)
            </p>
          </div>
        </div>

        {/* AUTOMATIC TRANSMISSION CONFIGURATION GRID */}
        <div className="bg-black/20 border border-slate-900/60 p-2.5 rounded-lg flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-900/65 pb-1.5 flex-wrap gap-2">
            <span className="text-[8.5px] uppercase text-amber-400 font-extrabold flex items-center gap-1 font-mono">
              <Radio size={11} className="text-amber-500 animate-pulse" />
              Parámetros de Automatización y Tiempos
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[8px] text-slate-400 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={autoTransmitEnabled}
                  onChange={(e) => setAutoTransmitEnabled(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 accent-emerald-500 w-3 h-3 cursor-pointer"
                />
                <span className={autoTransmitEnabled ? "text-emerald-400 font-bold" : ""}>Activar Difusión Automática</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Left side: Automation options */}
            <div className="flex flex-col gap-2 justify-center">
              <label className="flex items-center gap-2 text-[8px] text-slate-300 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={followClosestStation}
                  onChange={(e) => setFollowClosestStation(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 accent-emerald-500 w-3 h-3 cursor-pointer"
                />
                <div>
                  <span className="font-bold block">Seguir Estación Más Próxima</span>
                  <span className="text-slate-500 block text-[7.5px] font-sans mt-0.5">
                    Sincroniza con: {stationsWithDistance[0]?.name.split(' - ')[0]} ({stationsWithDistance[0]?.distance.toFixed(1)} km)
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2 text-[8px] text-slate-300 cursor-pointer select-none border-t border-slate-900/40 pt-2 mt-1">
                <input 
                  type="checkbox"
                  checked={autoTransmitOnChange}
                  onChange={(e) => setAutoTransmitOnChange(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 accent-emerald-500 w-3 h-3 cursor-pointer"
                />
                <div>
                  <span className="font-bold block">Transmitir al Cambiar de Estado</span>
                  <span className="text-slate-500 block text-[7.5px] font-sans mt-0.5">
                    Inyecta boletines en el acto si cambia el nivel ICA o dictamen de Calima
                  </span>
                </div>
              </label>
            </div>

            {/* Right side: Intervals for Level 3-6 */}
            <div className="flex flex-col gap-1.5 border-t md:border-t-0 md:border-l border-slate-900/60 pt-2 md:pt-0 pl-0 md:pl-3">
              <span className="text-[7.5px] text-slate-500 uppercase font-black tracking-wider block mb-1">
                Intervalos de Transmisión por Nivel ICA (segundos)
              </span>

              {/* Level 3: Regular */}
              <div className="flex items-center justify-between text-[7.5px] font-mono">
                <span className="text-amber-400 font-bold w-[120px] shrink-0">Regular (L3):</span>
                <div className="flex items-center gap-2 w-full max-w-[120px]">
                  <input 
                    type="range" 
                    min="10" 
                    max="600" 
                    step="5"
                    value={intervalLevel3}
                    onChange={(e) => setIntervalLevel3(parseInt(e.target.value))}
                    className="w-full accent-amber-500 h-1 bg-slate-950 rounded cursor-pointer"
                  />
                  <span className="text-slate-300 w-10 text-right shrink-0">{intervalLevel3}s</span>
                </div>
              </div>

              {/* Level 4: Desfavorable */}
              <div className="flex items-center justify-between text-[7.5px] font-mono">
                <span className="text-rose-400 font-bold w-[120px] shrink-0">Desfavorable (L4):</span>
                <div className="flex items-center gap-2 w-full max-w-[120px]">
                  <input 
                    type="range" 
                    min="10" 
                    max="480" 
                    step="5"
                    value={intervalLevel4}
                    onChange={(e) => setIntervalLevel4(parseInt(e.target.value))}
                    className="w-full accent-rose-500 h-1 bg-slate-950 rounded cursor-pointer"
                  />
                  <span className="text-slate-300 w-10 text-right shrink-0">{intervalLevel4}s</span>
                </div>
              </div>

              {/* Level 5: Muy Desfavorable */}
              <div className="flex items-center justify-between text-[7.5px] font-mono">
                <span className="text-rose-600 font-bold w-[120px] shrink-0">Muy Desfavorable (L5):</span>
                <div className="flex items-center gap-2 w-full max-w-[120px]">
                  <input 
                    type="range" 
                    min="10" 
                    max="300" 
                    step="5"
                    value={intervalLevel5}
                    onChange={(e) => setIntervalLevel5(parseInt(e.target.value))}
                    className="w-full accent-rose-600 h-1 bg-slate-950 rounded cursor-pointer"
                  />
                  <span className="text-slate-300 w-10 text-right shrink-0">{intervalLevel5}s</span>
                </div>
              </div>

              {/* Level 6: Extremadamente Desfavorable */}
              <div className="flex items-center justify-between text-[7.5px] font-mono">
                <span className="text-purple-400 font-bold w-[120px] shrink-0">Extremo (L6):</span>
                <div className="flex items-center gap-2 w-full max-w-[120px]">
                  <input 
                    type="range" 
                    min="5" 
                    max="180" 
                    step="5"
                    value={intervalLevel6}
                    onChange={(e) => setIntervalLevel6(parseInt(e.target.value))}
                    className="w-full accent-purple-500 h-1 bg-slate-950 rounded cursor-pointer"
                  />
                  <span className="text-slate-300 w-10 text-right shrink-0">{intervalLevel6}s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTÓN PARA COLLAPSE DE PLANTILLAS */}
        <div className="flex justify-end">
          <button 
            type="button"
            onClick={() => setShowTemplateConfig(!showTemplateConfig)}
            className="flex items-center gap-1 text-[8px] text-slate-400 bg-slate-950 hover:bg-slate-900 border border-slate-900/60 px-2.5 py-1 rounded transition-colors cursor-pointer select-none"
          >
            <Settings size={10} className={showTemplateConfig ? "rotate-45" : ""} />
            <span>{showTemplateConfig ? "Ocultar Personalizador de Mensajes APRS" : "Personalizar Contexto de Boletines y Mensajes APRS"}</span>
          </button>
        </div>

        {showTemplateConfig && (
          <div className="bg-black/35 border border-slate-900 p-2.5 rounded-lg flex flex-col gap-2.5 text-[8.5px]">
            <div className="border-b border-slate-900 pb-1.5 flex items-center justify-between flex-wrap gap-2">
              <span className="uppercase text-amber-500 font-extrabold font-mono flex items-center gap-1">
                <Settings size={11} />
                Editor de Plantillas APRS / Walkie
              </span>
              <span className="text-[7.5px] text-slate-500 font-sans">
                Etiquetas dinámicas: <strong className="text-slate-300 font-mono">{"{ica}"}</strong>, <strong className="text-slate-300 font-mono">{"{pm25}"}</strong>, <strong className="text-slate-300 font-mono">{"{pm10}"}</strong>, <strong className="text-slate-300 font-mono">{"{co}"}</strong>, <strong className="text-slate-300 font-mono">{"{o3}"}</strong>, <strong className="text-slate-300 font-mono">{"{station}"}</strong>, <strong className="text-slate-300 font-mono">{"{criterio}"}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Boletín Principal General (BLN2AQI):</label>
                  <input 
                    type="text" 
                    value={templateBln2Aqi} 
                    onChange={(e) => setTemplateBln2Aqi(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Alerta Calima Confirmada (BLN2AQI):</label>
                  <input 
                    type="text" 
                    value={templateCalima} 
                    onChange={(e) => setTemplateCalima(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Regular L3 Boletín (BLN1):</label>
                  <input 
                    type="text" 
                    value={templateBln1} 
                    onChange={(e) => setTemplateBln1(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-amber-500/80 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Desfavorable L4 Boletín (BLN2):</label>
                  <input 
                    type="text" 
                    value={templateBln2} 
                    onChange={(e) => setTemplateBln2(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-rose-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Muy Desfavorable L5 Boletín (BLN3):</label>
                  <input 
                    type="text" 
                    value={templateBln3} 
                    onChange={(e) => setTemplateBln3(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-rose-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Extremo L6 Boletín (BLN4):</label>
                  <input 
                    type="text" 
                    value={templateBln4} 
                    onChange={(e) => setTemplateBln4(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-purple-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Alerta Walkie L6 - Población General (CQ):</label>
                  <input 
                    type="text" 
                    value={templateWalkieGral} 
                    onChange={(e) => setTemplateWalkieGral(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-purple-300 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase font-mono">Alerta Walkie L6 - Población Sensible (CQ):</label>
                  <input 
                    type="text" 
                    value={templateWalkieSens} 
                    onChange={(e) => setTemplateWalkieSens(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-[8px] text-purple-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-950/50 p-1.5 rounded text-[7.5px] font-mono text-slate-400 border border-slate-900/60 mt-1">
              <span>* Los cambios se aplican en tiempo real al generar los boletines automáticos o manuales.</span>
              <button 
                type="button" 
                onClick={() => {
                  setTemplateBln2Aqi('MEDICION CALIDAD AIRE - ICA: {ica} (PM2.5: {pm25}ug, CO: {co}ug, O3: {o3}ug)');
                  setTemplateCalima('MEDICION CALIDAD AIRE - ALERTA CALIMA BOE CONFIRMADA ({criterio})');
                  setTemplateBln4('ICA EXTR. DESFAVORABLE: Emergencia publica. Siga recomendaciones de salud.');
                  setTemplateWalkieGral('ALERTA EMER: ICA Extr Desfavorable. Gral: evite estancia exterior.');
                  setTemplateWalkieSens('ALERTA EMER: ICA Extr Desfavorable. Sens: permanezca dentro.');
                  setTemplateBln3('ICA MUY DESFAVORABLE: Gral: reduzca estar fuera. Sens: interiores y plan medico.');
                  setTemplateBln2('ICA DESFAVORABLE: Gral: reduzca esfuerzo exterior. Sens: quedese en el interior.');
                  setTemplateBln1('ICA REGULAR: Gral: disfrute exterior. Sens: considere reducir esfuerzo.');
                }}
                className="text-amber-500 hover:text-amber-400 font-bold underline cursor-pointer uppercase text-[7px]"
              >
                Restaurar Predeterminados
              </button>
            </div>
          </div>
        )}

        {/* Real-time BOE Analysis Outcome */}
        <div className="bg-slate-950 border border-slate-900 p-2.5 rounded-lg flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] uppercase text-slate-400 font-bold">Dictamen Calima (Criterio BOE)</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[7.5px] text-slate-500">Estado:</span>
              <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                calimaAnalysis.calima 
                  ? 'bg-rose-950/50 text-rose-400 border border-rose-900/45 animate-pulse' 
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}>
                {calimaAnalysis.calima ? '⚠️ CALIMA DETECTADA' : 'NO DETECTADA'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8px] font-mono border-t border-slate-900/80 pt-2">
            <div>
              <span className="text-slate-500 block">MÉTODO DETECCIÓN</span>
              <span className="text-slate-200 truncate max-w-full block" title={calimaAnalysis.criterio}>
                {calimaAnalysis.criterio}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">RATIO SAHARIANO / PM10</span>
              <span className={`font-bold ${
                calimaAnalysis.metricas && parseFloat(calimaAnalysis.metricas.ratio_sahariano_pm10) >= 60 
                  ? 'text-amber-400' 
                  : 'text-slate-300'
              }`}>
                {calimaAnalysis.metricas?.ratio_sahariano_pm10 || '0%'} (BOE: ≥60%)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">RATIO PM2.5 / PM10</span>
              <span className={`font-bold ${
                calimaAnalysis.metricas && parseFloat(calimaAnalysis.metricas.ratio_pm25_pm10_real) < 40 
                  ? 'text-emerald-400' 
                  : 'text-rose-400'
              }`}>
                {calimaAnalysis.metricas?.ratio_pm25_pm10_real || '0%'} (BOE: &lt;40%)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">PM10 MÁXIMO LEGAL</span>
              <span className={`font-bold ${pm10_24h > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                {pm10_24h} / 50 µg/m³
              </span>
            </div>
          </div>
        </div>

        {/* Action button & Logs */}
        <div className="flex flex-col gap-2 border-t border-slate-900/60 pt-2.5">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="text-[8px] text-slate-500 leading-tight">
              El boletín de difusión pública BLN2AQI se inyectará junto a los boletines y advertencias de rango correspondientes.
            </span>
            <button
              onClick={handleTransmitCalimaBulletin}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-extrabold uppercase text-[9.5px] px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all border border-amber-400/20"
              id="transmit-calima-btn"
            >
              <Radio size={12} className="animate-pulse" />
              <span>Inyectar Boletines Calima (BLN2AQI)</span>
            </button>
          </div>

          {bulletinLogs.length > 0 && (
            <div className="bg-[#040608] border border-slate-900 rounded p-2 max-h-[100px] overflow-y-auto space-y-1 text-[7.5px] font-mono text-slate-400 shadow-inner">
              <span className="text-[7.5px] text-emerald-500 uppercase font-bold block mb-1">Monitor de Inyección APRS-IS (SNECA)</span>
              {bulletinLogs.map((log, index) => (
                <div key={index} className="border-b border-slate-900/40 pb-0.5 truncate select-text" title={log}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected Station Telemetry Showcase */}
      {activeStation && activeIca && (
        <div className="bg-slate-900/45 border border-slate-900 p-3 rounded-xl space-y-2.5">
          <div className="flex justify-between items-start gap-2 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-slate-500 uppercase block font-bold">Estación Seleccionada</span>
                <button
                  onClick={() => {
                    setFavorites(prev => 
                      prev.includes(activeStation.id) 
                        ? prev.filter(id => id !== activeStation.id) 
                        : [...prev, activeStation.id]
                    );
                  }}
                  className={`flex items-center gap-0.5 text-[7.5px] font-bold px-1.5 py-0.2 rounded transition-all border ${
                    favorites.includes(activeStation.id)
                      ? 'bg-amber-950/40 text-amber-400 border-amber-900/50 hover:bg-amber-950/60'
                      : 'bg-slate-900 text-slate-450 border-slate-800 hover:text-slate-300'
                  }`}
                  title={favorites.includes(activeStation.id) ? "Quitar de favoritos" : "Seguir estación (recibir alertas)"}
                >
                  <Star size={8} fill={favorites.includes(activeStation.id) ? "currentColor" : "none"} className={favorites.includes(activeStation.id) ? "text-amber-400" : ""} />
                  <span>{favorites.includes(activeStation.id) ? "Siguiendo" : "Seguir"}</span>
                </button>
              </div>
              <span className="text-slate-105 font-bold text-[11px] block">{activeStation.name}</span>
              <span className="text-[8.5px] text-slate-450 font-medium block mt-0.5 flex items-center gap-1">
                <MapPin size={9} className="text-slate-550" />
                {activeStation.province} ({activeStation.region}) • d = {activeStation.distance.toFixed(1)} km
              </span>
            </div>
            
            {/* Double AQI/ICA Metric panel */}
            <div className="flex gap-1.5 shrink-0">
              {/* MITECO ICA */}
              <div className={`px-2 py-1 rounded border flex flex-col items-center justify-center text-center ${activeIca.color}`}>
                <span className="text-[7px] uppercase font-extrabold opacity-70">ICA MITECO</span>
                <span className="text-xs font-black uppercase">{activeIca.label}</span>
              </div>
              {/* US AQI */}
              <div 
                className="px-2 py-1 rounded border flex flex-col items-center justify-center text-center transition-all duration-300 font-bold"
                style={{ 
                  color: activeUsAqiInfo.hex, 
                  borderColor: `${activeUsAqiInfo.hex}40`, 
                  backgroundColor: `${activeUsAqiInfo.hex}10` 
                }}
                title={`Índice US-AQI (IQAir): ${activeUsAqiInfo.label} - ${activeUsAqiInfo.desc}`}
              >
                <span className="text-[7px] uppercase font-extrabold text-slate-500">US AQI</span>
                <span className="text-xs font-black">{activeUsAqi}</span>
              </div>
            </div>
          </div>

          <p className="text-[9.5px] text-slate-400 italic leading-tight border-l-2 border-emerald-500/40 pl-2">
            {activeIca.desc}
          </p>

          {/* Micro Gas Sensors Array Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 bg-black/35 p-2 rounded-lg border border-slate-950/80 text-[10px] text-slate-400 font-mono">
            <div className="text-center bg-[#070b0e] py-1 border border-slate-900 rounded">
              <span className="text-slate-500 block uppercase text-[7.5px] font-bold">PM2.5</span>
              <span 
                className="font-extrabold"
                style={{ color: getPollutantColorAndPct('pm25', activeStation.pm25).hex }}
              >
                {activeStation.pm25 !== null && activeStation.pm25 !== undefined ? `${activeStation.pm25} µg` : <span className="text-slate-600 font-normal">--</span>}
              </span>
            </div>
            <div className="text-center bg-[#070b0e] py-1 border border-slate-900 rounded">
              <span className="text-slate-500 block uppercase text-[7.5px] font-bold">PM10</span>
              <span 
                className="font-extrabold"
                style={{ color: getPollutantColorAndPct('pm10', activeStation.pm10).hex }}
              >
                {activeStation.pm10 !== null && activeStation.pm10 !== undefined ? `${activeStation.pm10} µg` : <span className="text-slate-600 font-normal">--</span>}
              </span>
            </div>
            <div className="text-center bg-[#070b0e] py-1 border border-slate-900 rounded">
              <span className="text-slate-500 block uppercase text-[7.5px] font-bold">NO₂</span>
              <span 
                className="font-extrabold"
                style={{ color: getPollutantColorAndPct('no2', activeStation.no2).hex }}
              >
                {activeStation.no2 !== null && activeStation.no2 !== undefined ? `${activeStation.no2} µg` : <span className="text-slate-600 font-normal">--</span>}
              </span>
            </div>
            <div className="text-center bg-[#070b0e] py-1 border border-slate-900 rounded">
              <span className="text-slate-500 block uppercase text-[7.5px] font-bold">O₃</span>
              <span 
                className="font-extrabold"
                style={{ color: getPollutantColorAndPct('o3', activeStation.o3).hex }}
              >
                {activeStation.o3 !== null && activeStation.o3 !== undefined ? `${activeStation.o3} µg` : <span className="text-slate-600 font-normal">--</span>}
              </span>
            </div>
            <div className="text-center bg-[#070b0e] py-1 border border-slate-900 rounded">
              <span className="text-slate-500 block uppercase text-[7.5px] font-bold">SO₂</span>
              <span 
                className="font-extrabold"
                style={{ color: getPollutantColorAndPct('so2', activeStation.so2).hex }}
              >
                {activeStation.so2 !== null && activeStation.so2 !== undefined ? `${activeStation.so2} µg` : <span className="text-slate-600 font-normal">--</span>}
              </span>
            </div>
            <div className="text-center bg-[#070b0e] py-1 border border-slate-900 rounded">
              <span className="text-slate-500 block uppercase text-[7.5px] font-bold">CO</span>
              <span 
                className="font-extrabold"
                style={{ color: getPollutantColorAndPct('co', activeStation.co).hex }}
              >
                {activeStation.co !== null && activeStation.co !== undefined ? `${activeStation.co} mg` : <span className="text-slate-600 font-normal">--</span>}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-900/40">
            <span className="text-[8px] text-slate-500 font-mono">ID Telemetría: API-SNECA::{activeStation.id}</span>
            <button
              onClick={() => {
                setModalStation(activeStation);
                fetchDetailedStation(activeStation.id);
              }}
              className="text-[9px] bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer select-none"
              id="view-detailed-api"
            >
              <Activity size={10} className="animate-pulse" />
              <span>Ver Diagnóstico Completo (API)</span>
            </button>
          </div>
        </div>
      )}

      {/* Database control filters bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[8.5px] uppercase text-slate-500 font-extrabold tracking-wider">Base de Datos de Estaciones</span>
            <button
              onClick={handleSyncDatabase}
              disabled={isSyncing}
              className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer select-none ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Sincronizar base de datos de calidad del aire con MITECO"
            >
              <RefreshCw size={8} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
            </button>
            {lastSyncTime && (
              <span className="text-[7.5px] text-slate-500 font-mono">
                Sinc: {lastSyncTime.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-850 shrink-0 font-sans text-[9px]">
            <button
              onClick={() => setViewMode('lista')}
              className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'lista' 
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold' 
                  : 'text-slate-500 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Sliders size={9} />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setViewMode('mapa')}
              className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'mapa' 
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold' 
                  : 'text-slate-500 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Map size={9} />
              <span>Mapa Calor</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search box */}
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nombre, provincia, región o código (ej: Andalucía, AQ-01)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 text-slate-100 border border-slate-850 rounded-lg pl-8 pr-2.5 py-1.5 text-[10.5px] focus:outline-none focus:border-emerald-500/45 placeholder:text-slate-600 font-sans"
              id="search-stations-ica"
            />
          </div>

          <div className="flex gap-2 shrink-0">
            {/* Type dropdown */}
            <select
              value={pastedIcaLevel}
              onChange={(e) => setPastedIcaLevel(e.target.value)}
              className="bg-slate-900 border border-slate-850 text-slate-200 rounded-lg px-2 text-[10.5px] focus:outline-none focus:border-emerald-500/40 cursor-pointer font-sans"
              id="filter-ica-state"
            >
              <option value="todos">Todos los ICA</option>
              <option value="buena">Buena</option>
              <option value="razonablemente buena">Razonablemente Buena</option>
              <option value="regular">Regular</option>
              <option value="desfavorable">Desfavorable</option>
              <option value="muy desfavorable">Muy Desfavorable</option>
              <option value="extremadamente desfavorable">Extremadamente Desfavorable</option>
              <option value="sin datos">Sin Datos</option>
            </select>

            {/* Proximity Filter Dropdown */}
            <select
              value={proximityFilter}
              onChange={(e) => setProximityFilter(e.target.value)}
              className="bg-slate-900 border border-slate-850 text-slate-200 rounded-lg px-2 text-[10.5px] focus:outline-none focus:border-emerald-500/40 cursor-pointer font-sans"
              id="filter-proximity"
            >
              <option value="todos">Cualquier distancia</option>
              <option value="cobertura">Radio Cobertura ({config?.filterRadiusKm || 150} km)</option>
              <option value="50">Hasta 50 km</option>
              <option value="100">Hasta 100 km</option>
              <option value="200">Hasta 200 km</option>
              <option value="500">Hasta 500 km</option>
            </select>
          </div>
        </div>

        {viewMode === 'mapa' ? (
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 space-y-2.5 relative overflow-hidden flex flex-col items-center">
            {/* Map SVG container */}
            <div className="relative w-full aspect-[400/245] bg-[#020617]/90 rounded-lg border border-slate-950 shadow-inner flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 400 245" className="w-full h-full select-none">
                <defs>
                  {/* Heatmap overlapping gradients using MITECO official color codes */}
                  <radialGradient id="grad-local-1" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(0,150,200)" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="rgb(0,150,200)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(0,150,200)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="grad-local-2" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(50,170,100)" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="rgb(50,170,100)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(50,170,100)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="grad-local-3" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(255,200,0)" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="rgb(255,200,0)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(255,200,0)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="grad-local-4" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(255,0,0)" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="rgb(255,0,0)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(255,0,0)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="grad-local-5" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(120,20,20)" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="rgb(120,20,20)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(120,20,20)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="grad-local-6" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(128,0,128)" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="rgb(128,0,128)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(128,0,128)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="grad-local-0" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgb(0,0,0)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="rgb(0,0,0)" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Cyber Grid Lines */}
                <g stroke="rgba(51, 65, 85, 0.12)" strokeWidth="0.5">
                  <line x1="80" y1="0" x2="80" y2="245" />
                  <line x1="160" y1="0" x2="160" y2="245" />
                  <line x1="240" y1="0" x2="240" y2="245" />
                  <line x1="320" y1="0" x2="320" y2="245" />
                  
                  <line x1="0" y1="50" x2="400" y2="50" />
                  <line x1="0" y1="110" x2="400" y2="110" />
                  <line x1="0" y1="170" x2="400" y2="170" />
                </g>

                {/* Peninsula Coastline stylized Vector */}
                <path 
                  d={(() => {
                    const minLonLocal = -9.8;
                    const maxLonLocal = 3.5;
                    const minLatLocal = 35.8;
                    const maxLatLocal = 44.0;
                    const getCoordsL = (lon: number, lat: number) => {
                      const x = ((lon - minLonLocal) / (maxLonLocal - minLonLocal)) * 340 + 40;
                      const y = 245 - (((lat - minLatLocal) / (maxLatLocal - minLatLocal)) * 180 + 30);
                      return { x, y };
                    };
                    const coastlinePoints = [
                      [-9.3, 42.9], [-7.9, 43.8], [-5.7, 43.6], [-3.8, 43.5], [-2.0, 43.3], 
                      [3.2, 42.4], [2.2, 41.4], [0.9, 40.7], [-0.3, 39.5], [0.2, 38.7], 
                      [-2.2, 36.7], [-5.6, 36.0], [-6.3, 36.5], [-9.0, 37.0], [-9.5, 38.7], 
                      [-8.7, 41.15], [-8.9, 42.2], [-9.3, 42.9]
                    ];
                    return coastlinePoints.map((pt, idx) => {
                      const { x, y } = getCoordsL(pt[0], pt[1]);
                      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ') + ' Z';
                  })()}
                  stroke="rgba(16, 185, 129, 0.2)" 
                  strokeWidth="1" 
                  strokeDasharray="4,4" 
                  fill="rgba(16, 185, 129, 0.02)" 
                />

                {/* Spain-Portugal Border divider */}
                <path
                  d={(() => {
                    const minLonLocal = -9.8;
                    const maxLonLocal = 3.5;
                    const minLatLocal = 35.8;
                    const maxLatLocal = 44.0;
                    const getCoordsL = (lon: number, lat: number) => {
                      const x = ((lon - minLonLocal) / (maxLonLocal - minLonLocal)) * 340 + 40;
                      const y = 245 - (((lat - minLatLocal) / (maxLatLocal - minLatLocal)) * 180 + 30);
                      return { x, y };
                    };
                    const borderPoints = [
                      [-8.2, 42.1], [-6.5, 41.8], [-6.8, 39.7], [-7.3, 37.2]
                    ];
                    return borderPoints.map((pt, idx) => {
                      const { x, y } = getCoordsL(pt[0], pt[1]);
                      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ');
                  })()}
                  stroke="rgba(148, 163, 184, 0.12)"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                  fill="none"
                />

                {/* Balearic Islands */}
                {(() => {
                  const minLonLocal = -9.8;
                  const maxLonLocal = 3.5;
                  const minLatLocal = 35.8;
                  const maxLatLocal = 44.0;
                  const getCoordsL = (lon: number, lat: number) => {
                    const x = ((lon - minLonLocal) / (maxLonLocal - minLonLocal)) * 340 + 40;
                    const y = 245 - (((lat - minLatLocal) / (maxLatLocal - minLatLocal)) * 180 + 30);
                    return { x, y };
                  };
                  const ibiza = getCoordsL(1.4, 38.9);
                  const mallorca = getCoordsL(3.0, 39.6);
                  const menorca = getCoordsL(4.1, 39.9);
                  return (
                    <g stroke="rgba(16, 185, 129, 0.2)" strokeWidth="0.8" fill="rgba(16, 185, 129, 0.02)">
                      <ellipse cx={mallorca.x} cy={mallorca.y} rx="9" ry="5" transform={`rotate(-15, ${mallorca.x}, ${mallorca.y})`} strokeDasharray="2,2" />
                      <ellipse cx={menorca.x} cy={menorca.y} rx="5" ry="3" transform={`rotate(10, ${menorca.x}, ${menorca.y})`} strokeDasharray="2,2" />
                      <ellipse cx={ibiza.x} cy={ibiza.y} rx="4" ry="2.5" transform={`rotate(-45, ${ibiza.x}, ${ibiza.y})`} strokeDasharray="2,2" />
                    </g>
                  );
                })()}

                {/* Canary Islands Inset Border */}
                <g opacity="0.9">
                  <rect x="15" y="180" width="85" height="50" rx="6" fill="rgba(15, 23, 42, 0.6)" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="0.8" />
                  <text x="22" y="191" className="text-[6.5px] fill-slate-500 font-extrabold uppercase tracking-wider font-mono">INS. CANARIAS</text>
                  <polygon points="35,215 45,210 55,215 45,222" fill="none" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="0.5" strokeDasharray="1,1" />
                  <polygon points="65,215 75,212 80,218 70,222" fill="none" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="0.5" strokeDasharray="1,1" />
                </g>

                {/* Radar Concentric rings locator around selection */}
                {activeStation && (() => {
                  const minLonLocal = -9.8;
                  const maxLonLocal = 3.5;
                  const minLatLocal = 35.8;
                  const maxLatLocal = 44.0;
                  const getCoordsL = (lon: number, lat: number, id: string) => {
                    if (id === 'AQ-08' || lat < 32) {
                      return { x: 55, y: 210 };
                    }
                    const x = ((lon - minLonLocal) / (maxLonLocal - minLonLocal)) * 340 + 40;
                    const y = 245 - (((lat - minLatLocal) / (maxLatLocal - minLatLocal)) * 180 + 30);
                    return { x, y };
                  };
                  const coords = getCoordsL(activeStation.lon, activeStation.lat, activeStation.id);
                  return (
                    <g className="pointer-events-none">
                      <circle cx={coords.x} cy={coords.y} r="18" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="0.5" strokeDasharray="2,2" className="animate-[spin_40s_linear_infinite]" />
                      <line x1={coords.x - 22} y1={coords.y} x2={coords.x + 22} y2={coords.y} stroke="rgba(16, 185, 129, 0.15)" strokeWidth="0.5" />
                      <line x1={coords.x} y1={coords.y - 22} x2={coords.x} y2={coords.y + 22} stroke="rgba(16, 185, 129, 0.15)" strokeWidth="0.5" />
                    </g>
                  );
                })()}

                {/* Dynamic Stations Glow Heatmap Overlay */}
                {filteredStations.map((st) => {
                  const minLonLocal = -9.8;
                  const maxLonLocal = 3.5;
                  const minLatLocal = 35.8;
                  const maxLatLocal = 44.0;
                  const getCoordsL = (lon: number, lat: number, id: string) => {
                    if (id === 'AQ-08' || lat < 32) {
                      return { x: 55, y: 210 };
                    }
                    const x = ((lon - minLonLocal) / (maxLonLocal - minLonLocal)) * 340 + 40;
                    const y = 245 - (((lat - minLatLocal) / (maxLatLocal - minLatLocal)) * 180 + 30);
                    return { x, y };
                  };

                  const coords = getCoordsL(st.lon, st.lat, st.id);
                  const ica = getMitecoIcaInfo(st.pm25, st.pm10, st.no2, st.o3, st.so2);
                  const levelCode = ica.level; // 0, 1, 2, 3, 4, 5, 6
                  const isSelected = selectedStation?.id === st.id;

                  return (
                    <g 
                      key={`heatmap-${st.id}`}
                      onClick={() => {
                        setSelectedStation(st);
                        setModalStation(st);
                        fetchDetailedStation(st.id);
                      }}
                      className="cursor-pointer group"
                    >
                      {/* Thermal Heat Aura (Blended Glow) */}
                      <circle 
                        cx={coords.x} 
                        cy={coords.y} 
                        r="32" 
                        fill={`url(#grad-local-${levelCode})`} 
                        className="transition-transform duration-300 group-hover:scale-125"
                      />

                      {/* Selected pulsing ring */}
                      {isSelected && (
                        <circle 
                          cx={coords.x} 
                          cy={coords.y} 
                          r="9" 
                          fill="none" 
                          stroke="rgba(255, 255, 255, 0.85)" 
                          strokeWidth="1" 
                          className="animate-pulse"
                        />
                      )}

                      {/* Station Core Center Dot */}
                      <circle 
                        cx={coords.x} 
                        cy={coords.y} 
                        r="3.5" 
                        fill={ica.hex} 
                        stroke={isSelected ? "#ffffff" : "rgba(15, 23, 42, 0.85)"}
                        strokeWidth={isSelected ? "1" : "0.5"}
                        className="transition-all duration-300 group-hover:r-5"
                      />

                      {/* Station name indicator overlay on hover */}
                      <text 
                        x={coords.x} 
                        y={coords.y - 7} 
                        textAnchor="middle" 
                        className="text-[6.5px] font-mono font-bold fill-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                      >
                        {st.name.split(' - ')[0]} ({ica.label})
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Map Legend (Official Scale) */}
            <div className="w-full bg-slate-950/80 p-2 border border-slate-900 rounded-lg text-[8px] flex flex-wrap gap-x-2 gap-y-1 justify-center items-center font-bold">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[rgb(0,150,200)]" />
                <span className="text-[rgb(0,150,200)]">Buena</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[rgb(50,170,100)]" />
                <span className="text-[rgb(50,170,100)]">Razonablemente Buena</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[rgb(255,200,0)]" />
                <span className="text-[rgb(255,200,0)]">Regular</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[rgb(255,0,0)]" />
                <span className="text-[rgb(255,0,0)]">Desfavorable</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[rgb(120,20,20)]" />
                <span className="text-[rgb(120,20,20)]">Muy Desfavorable</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[rgb(128,0,128)]" />
                <span className="text-[rgb(128,0,128)]">Extremadamente Desfavorable</span>
              </div>
            </div>
          </div>
        ) : (
          /* Stations table/list box */
          <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden max-h-[145px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-left font-mono text-[9.5px]">
              <thead className="bg-slate-900 text-slate-500 text-[8px] uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="p-2 py-1.5 pl-3">Estación/Provincia</th>
                  <th className="p-2 py-1.5 text-center">ICA MITECO</th>
                  <th className="p-2 py-1.5 text-center">US AQI</th>
                  <th className="p-2 py-1.5 text-right pr-3">Distancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {filteredStations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-550 italic">
                      Ninguna estación coincide con el filtro de búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredStations.map((st) => {
                    const ica = getMitecoIcaInfo(st.pm25, st.pm10, st.no2, st.o3, st.so2);
                    const usAqiEquivalent = calculateUsAqiEquivalent(st.pm25, st.no2);
                    const isSelected = selectedStation?.id === st.id;
                    const isStationPartial = st.pm25 === null || st.pm10 === null || st.no2 === null || st.o3 === null || st.so2 === null || st.co === null;

                    return (
                      <tr 
                         key={st.id}
                         onClick={() => {
                           setSelectedStation(st);
                           setModalStation(st);
                           fetchDetailedStation(st.id);
                         }}
                         className={`cursor-pointer transition-colors ${
                           isSelected 
                             ? 'bg-slate-900/80 text-emerald-350' 
                             : 'hover:bg-slate-900/30 text-slate-300'
                         }`}
                       >
                         <td className="p-2 pl-3">
                           <div className="truncate max-w-[130px] flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFavorites(prev => 
                                    prev.includes(st.id) 
                                      ? prev.filter(id => id !== st.id) 
                                      : [...prev, st.id]
                                  );
                                }}
                                className="text-slate-600 hover:text-amber-450 transition-colors p-0.5 shrink-0"
                                title={favorites.includes(st.id) ? "Quitar de favoritos" : "Seguir estación"}
                              >
                                <Star size={9} fill={favorites.includes(st.id) ? "currentColor" : "none"} className={favorites.includes(st.id) ? "text-amber-400 font-bold" : "text-slate-600"} />
                              </button>
                              <span>{st.name}</span>
                            </div>
                           <div className="text-[8px] text-slate-500 uppercase font-mono mt-0.5">{st.province} ({st.region}) • {st.id}</div>
                         </td>
                         <td className="p-2 text-center">
                           <div className="flex items-center justify-center gap-1.5" title={isStationPartial ? "Estación con Sensores Incompletos - Calidad de Aire Calculada sobre Contaminantes Disponibles" : "Medición Completa de Gases SNECA"}>
                             {isStationPartial ? (
                               <div className="relative flex items-center justify-center w-3 h-3">
                                 {/* Translucent border circle pulsing representing BOE standard */}
                                 <span 
                                   className="absolute rounded-full border border-current opacity-60 w-3 h-3 animate-pulse"
                                   style={{ color: ica.hex, borderColor: ica.hex }}
                                 ></span>
                                 {/* Inner faint dot */}
                                 <span 
                                   className="rounded-full w-1 h-1"
                                   style={{ backgroundColor: ica.hex }}
                                 ></span>
                                </div>
                             ) : (
                               <span 
                                 className="w-1.5 h-1.5 rounded-full inline-block" 
                                 style={{ backgroundColor: ica.hex }}
                               />
                             )}
                             <span className="font-extrabold uppercase shrink-0 text-[9px]" style={{ color: ica.hex }}>{ica.label}</span>
                           </div>
                         </td>
                         <td className="p-2 text-center font-bold font-mono">
                           <span style={{ color: getUsAqiInfo(usAqiEquivalent).hex }} title={`US-AQI: ${getUsAqiInfo(usAqiEquivalent).label}`}>
                             {usAqiEquivalent}
                           </span>
                         </td>
                         <td className="p-2 text-right pr-3 font-mono text-slate-400 font-semibold">
                           {st.distance.toFixed(1)} km
                         </td>
                       </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Protocol actions & instructions */}
      <div className="border-t border-slate-900/60 pt-2 flex items-center justify-between text-[8px] text-slate-550 italic leading-snug">
        <span>* Niveles actualizados vía telemetría APRS-SNECA e IQAir Cloud feeds</span>
        <button 
          onClick={() => {
            alert("SNECA (Sistema Nacional de Estaciones de Calidad del Aire) ha re-calibrado los sensores del Casco Urbano peninsular con éxito.");
          }}
          className="text-emerald-500 hover:underline font-mono"
        >
          [Re-calibrar Sensores]
        </button>
      </div>

      {/* Detailed Sidebar Panel Drawer */}
      <AnimatePresence>
        {modalStation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex justify-end"
            onClick={() => setModalStation(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="bg-slate-950 border-l border-slate-800 h-full w-full max-w-md overflow-hidden shadow-2xl flex flex-col font-mono text-xs text-slate-300"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between bg-slate-900/60 border-b border-slate-900 p-4">
                <div className="flex items-center gap-2">
                  <Wind className="text-emerald-400 shrink-0" size={18} />
                  <div>
                    <h4 className="text-[11px] font-black uppercase text-slate-100 font-mono tracking-wider">
                      DIAGNÓSTICO EN TIEMPO REAL - SNECA API
                    </h4>
                    <span className="text-[9px] text-slate-500 font-sans block mt-0.5">
                      Dispositivo de detección remota por micropartículas
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setModalStation(null)}
                  className="text-slate-500 hover:text-slate-200 hover:bg-slate-850 p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 p-5 space-y-4 overflow-y-auto scrollbar-thin">
                {/* Station general header */}
                <div className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[8px] text-emerald-500 font-extrabold uppercase">
                      Estación ID: {modalStation.id}
                    </span>
                    <h5 className="text-slate-100 font-bold text-sm tracking-tight">{modalStation.name}</h5>
                    <div className="flex items-center gap-1 text-[8.5px] text-slate-500 mt-1">
                      <MapPin size={9} />
                      <span>{modalStation.province} • Lat: {modalStation.lat.toFixed(4)}, Lon: {modalStation.lon.toFixed(4)}</span>
                    </div>
                  </div>
                  <div className="bg-black/40 px-2 py-1 rounded border border-slate-800 text-right shrink-0">
                    <span className="text-[7.5px] block text-slate-500 uppercase font-bold">Consumo Endpoint</span>
                    <span className="text-[8.5px] text-slate-450 font-mono">/api/ica/station/{modalStation.id}</span>
                  </div>
                </div>

                {loadingDetailed ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="animate-spin text-emerald-500" size={24} />
                    <div className="text-center space-y-1">
                      <p className="font-extrabold text-[10px] text-slate-300 uppercase tracking-widest animate-pulse">
                        Extrayendo Telemetría...
                      </p>
                      <p className="text-[8.5px] text-slate-550 font-sans">
                        Solicitando lecturas de partículas gaseosas del servidor principal...
                      </p>
                    </div>
                  </div>
                ) : apiError ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-3 bg-red-950/10 border border-red-900/30 rounded-xl p-4">
                    <AlertTriangle className="text-red-400 animate-bounce" size={24} />
                    <div className="text-center space-y-1">
                      <p className="font-extrabold text-[10px] text-red-500 uppercase">
                        FALLO DE CONEXIÓN CON EL ENDPOINT
                      </p>
                      <p className="text-[8.5px] text-slate-400 font-sans leading-tight">
                        {apiError}
                      </p>
                    </div>
                    <button
                      onClick={() => fetchDetailedStation(modalStation.id)}
                      className="mt-2 text-[9px] bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 px-3 py-1 rounded font-bold cursor-pointer"
                    >
                      Reintentar conexión
                    </button>
                  </div>
                ) : detailedData ? (
                  <>
                    {/* Double Badge Main Reading */}
                    {(() => {
                      const ica = getMitecoIcaInfo(detailedData.pm25, detailedData.pm10, detailedData.no2, detailedData.o3, detailedData.so2);
                      const usAqi = calculateUsAqiEquivalent(detailedData.pm25, detailedData.no2);
                      const usAqiInfo = getUsAqiInfo(usAqi);

                      return (
                        <div className="space-y-4">
                          {/* Main metric row summary */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className={`p-3 rounded-xl border flex flex-col justify-between h-[90px] transition-colors ${ica.color}`}>
                              <span className="text-[7.5px] uppercase font-black tracking-wider opacity-70">
                                Índice Nacional MITECO
                              </span>
                              <div>
                                <span className="text-lg font-black uppercase tracking-tight block leading-none">
                                  {ica.label}
                                </span>
                                <span className="text-[8.5px] opacity-80 block mt-1 font-sans">
                                  Evaluación bajo norma BOE.
                                </span>
                              </div>
                            </div>

                            <div 
                              className="p-3 rounded-xl border flex flex-col justify-between h-[90px] transition-all duration-300"
                              style={{
                                color: usAqiInfo.hex,
                                borderColor: `${usAqiInfo.hex}40`,
                                backgroundColor: `${usAqiInfo.hex}10`
                              }}
                            >
                              <span className="text-[7.5px] uppercase font-black tracking-wider opacity-70">
                                US-AQI (IQAir): {usAqiInfo.label}
                              </span>
                              <div>
                                <div className="flex items-baseline gap-1">
                                  <span className="text-xl font-black leading-none">{usAqi}</span>
                                  <span className="text-[9px] uppercase font-bold opacity-80">Puntos</span>
                                </div>
                                <span className="text-[8.5px] opacity-80 block mt-1 font-sans">
                                  {usAqiInfo.desc}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Pollutants concentration details with progress bars */}
                          <div className="space-y-3">
                            <span className="text-[8.5px] font-extrabold text-slate-500 uppercase block tracking-wider font-mono">
                              CONCENTRACIONES QUÍMICAS DE GASES Y PARTÍCULAS
                            </span>

                            <div className="space-y-3 bg-black/40 p-3.5 rounded-xl border border-slate-900/60 font-mono">
                              {(() => {
                                const renderPollutantRow = (type: 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co', labelName: string, subName: string, value: number | null | undefined, unit: string) => {
                                  const { hex, label: pollutantLabel, pct, safeLimit, safeLimitPct } = getPollutantColorAndPct(type, value);
                                  const isExceeded = value !== null && value !== undefined && value > safeLimit;

                                  return (
                                    <div className="space-y-1 bg-slate-900/10 p-2.5 rounded-xl border border-slate-900/40 relative overflow-hidden group hover:bg-slate-900/30 transition-all duration-300">
                                      {/* Row Header */}
                                      <div className="flex justify-between items-baseline text-[9.5px] font-bold">
                                        <div className="flex flex-col">
                                          <span className="text-slate-200 font-sans tracking-wide">{labelName}</span>
                                          <span className="text-[7.5px] text-slate-500 font-mono uppercase">{subName}</span>
                                        </div>
                                        <div className="text-right">
                                          {value !== null && value !== undefined ? (
                                            <div className="flex items-center gap-1.5 font-mono">
                                              <span className="text-[10px] text-slate-100 font-extrabold">{value} {unit}</span>
                                              <span 
                                                className="px-1 py-0.5 rounded text-[7.5px] font-black uppercase text-center shrink-0 border"
                                                style={{ color: hex, borderColor: `${hex}30`, backgroundColor: `${hex}10` }}
                                              >
                                                {pollutantLabel}
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="text-slate-600 italic font-mono text-[8px]">SIN DATOS (N/D)</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Progress Bar Container with Safe Limit Indicator */}
                                      <div className="relative w-full h-3 bg-slate-900/90 rounded-lg overflow-hidden border border-slate-800/80 flex items-center">
                                        {/* Safe limit boundary background split if valued */}
                                        {value !== null && value !== undefined && (
                                          <div 
                                            className="absolute top-0 bottom-0 left-0 bg-emerald-950/5 border-r border-dashed border-slate-700/40 z-10"
                                            style={{ width: `${safeLimitPct}%` }}
                                            title={`Zona Segura (Hasta ${safeLimit} ${unit})`}
                                          />
                                        )}

                                        {/* Animated Filled Progress Bar */}
                                        {value !== null && value !== undefined ? (
                                          <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ type: 'spring', damping: 15, stiffness: 80, delay: 0.1 }}
                                            className="h-full relative z-0 flex items-center justify-end pr-1"
                                            style={{ 
                                              backgroundColor: hex,
                                              boxShadow: `0 0 10px ${hex}40`
                                            }}
                                          >
                                            {/* Subtle inner pulse dot at progress bar tail */}
                                            {pct > 5 && (
                                              <span className="w-1 h-1 rounded-full bg-white/70 animate-ping absolute right-1" />
                                            )}
                                          </motion.div>
                                        ) : (
                                          <div className="w-full h-full bg-slate-900/40" />
                                        )}

                                        {/* Threshold marker label overlay */}
                                        {value !== null && value !== undefined && (
                                          <div 
                                            className="absolute top-0 bottom-0 z-20 flex flex-col justify-center items-center pointer-events-none"
                                            style={{ left: `${safeLimitPct}%` }}
                                          >
                                            <div className="h-full border-r border-slate-500/50" />
                                            {/* Tooltip-like tick mark indicator */}
                                            <span className="absolute -top-[1px] transform -translate-x-1/2 text-[6.5px] font-bold text-slate-500 bg-slate-950 px-0.5 rounded border border-slate-800 font-mono">
                                              {safeLimit}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Status helper info footer */}
                                      {value !== null && value !== undefined && (
                                        <div className="flex justify-between items-center text-[7.5px] text-slate-500 font-mono pt-0.5 px-0.5">
                                          <span>Zona Segura ≤ {safeLimit} {unit}</span>
                                          <span className={isExceeded ? "text-rose-400 font-bold" : "text-emerald-500 font-medium"}>
                                            {isExceeded 
                                              ? `⚠️ Excede límite seguro por +${(value - safeLimit).toFixed(1)} ${unit}` 
                                              : `✓ Seguro (${((value / safeLimit) * 100).toFixed(0)}% del límite)`
                                            }
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                };

                                return (
                                  <div className="space-y-2.5">
                                    {renderPollutantRow('pm25', 'Material Particulado Fino', 'PM2.5', detailedData.pm25, 'µg/m³')}
                                    {renderPollutantRow('pm10', 'Material Particulado Grueso', 'PM10', detailedData.pm10, 'µg/m³')}
                                    {renderPollutantRow('no2', 'Dióxido de Nitrógeno', 'NO₂', detailedData.no2, 'µg/m³')}
                                    {renderPollutantRow('o3', 'Ozono Troposférico', 'O₃', detailedData.o3, 'µg/m³')}
                                    {renderPollutantRow('so2', 'Dióxido de Azufre', 'SO₂', detailedData.so2, 'µg/m³')}
                                    {renderPollutantRow('co', 'Monóxido de Carbono', 'CO', detailedData.co, 'mg/m³')}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Health warnings / recommendation box */}
                          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 space-y-2.5">
                            <span className="text-[8px] text-slate-500 font-extrabold uppercase block tracking-widest flex items-center gap-1">
                              <ShieldAlert size={10} className="text-slate-400 font-bold" />
                              RECOMENDACIONES SANITARIAS OFICIALES
                            </span>
                            <p className="text-[9.5px] text-slate-350 leading-relaxed font-sans">
                              {ica.desc}
                            </p>
                            <div className="grid grid-cols-2 gap-2.5 pt-1 font-sans text-[8.5px] text-slate-400">
                              <div className="bg-black/20 p-2.5 rounded border border-slate-900/60 leading-snug">
                                <span className="font-extrabold block text-[7.5px] uppercase text-sky-400 mb-1 font-mono">Población General</span>
                                {ica.poblacionGeneral}
                              </div>
                              <div className="bg-black/20 p-2.5 rounded border border-slate-900/60 leading-snug">
                                <span className="font-extrabold block text-[7.5px] uppercase text-amber-500 mb-1 font-mono">Población Sensible</span>
                                {ica.poblacionSensible}
                              </div>
                            </div>
                          </div>

                          {/* Raw API Response Log */}
                          <div className="bg-[#030608] border border-slate-900 rounded-lg p-2 font-mono text-[8.5px] text-slate-650 text-slate-500">
                            <div className="flex justify-between font-bold mb-1 text-slate-600">
                              <span>RAW API LOGSTREAM</span>
                              <span className="text-emerald-600 font-bold">200 OK</span>
                            </div>
                            <div className="h-[35px] overflow-y-auto scrollbar-none select-all font-mono leading-tight text-[7.5px] text-slate-500">
                              {"{"} "status": "success", "source": "SNECA-SATELLITE", "epoch": {Date.now()}, "station_id": "{detailedData.id}", "lat": {detailedData.lat}, "lon": {detailedData.lon}, "sensors": {"{"} "pm25": {detailedData.pm25 !== null ? detailedData.pm25 : "null"}, "pm10": {detailedData.pm10 !== null ? detailedData.pm10 : "null"}, "no2": {detailedData.no2 !== null ? detailedData.no2 : "null"}, "o3": {detailedData.o3 !== null ? detailedData.o3 : "null"}, "so2": {detailedData.so2 !== null ? detailedData.so2 : "null"}, "co": {detailedData.co !== null ? detailedData.co : "null"} {"}"} {"}"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-900/30 border-t border-slate-900 px-4 py-3 flex text-right justify-between items-center text-[8.5px] text-slate-550">
                <span>Actualizando vía SNECA endpoints</span>
                <button
                  onClick={() => setModalStation(null)}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold px-4 py-1.5 rounded-lg cursor-pointer transition-all"
                >
                  Cerrar Diagnóstico
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
