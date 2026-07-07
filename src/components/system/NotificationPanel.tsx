import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Bell, BellOff, ShieldAlert, Sliders, Play, 
  HelpCircle, Settings, CheckCircle2, AlertTriangle, Radio,
  ChevronDown, ChevronUp, Thermometer, Wind, CloudRain,
  Droplets, Gauge, Plus, Trash2, Volume2, VolumeX, Clock
} from 'lucide-react';
import { EarthquakeEvent, NoaaSpaceAlert, WeatherTelemetry, TsunamiAlert, AemetWeatherAlert, GPSDStatus } from '../../types';
import { playEmergencyAlertSound } from '../../utils/audio';

export interface ThreatRule {
  id: string;
  name: string;
  threatType: 'sísmica' | 'meteorológica' | 'radiológica' | 'marítima' | 'otros';
  variable: 'earthquake_magnitude' | 'tempC' | 'windSpeedKts' | 'rainMm' | 'humidityPct' | 'pressureHpa' | 'radiationUsVh' | 'navarea_count' | 'cecop_situacion';
  operator: 'greater_than' | 'less_than';
  threshold: number;
  enabled: boolean;
}

export type WeatherRule = ThreatRule;

interface NavareaWarning {
  id: string;
  navareaType: 'NAVAREA III' | 'Armada Española' | 'NAVTEX';
  category: string;
  title: string;
  urgency: string;
}

interface NotificationPanelProps {
  earthquakes: EarthquakeEvent[];
  noaaAlerts: NoaaSpaceAlert[];
  navareas: NavareaWarning[];
  minMagnitudVisualThreshold: number;
  onAddSimulatedNavarea?: () => void;
  weather?: WeatherTelemetry;
  tsunamiAlerts?: TsunamiAlert[];
  cecopSituacion?: 0 | 1 | 2 | 3;
  aemetAlerts?: AemetWeatherAlert[];
  aemetAlertsSubscriptionEnabled?: boolean;
  gpsd?: GPSDStatus;
}

export default function NotificationPanel({ 
  earthquakes = [], 
  noaaAlerts = [], 
  navareas = [],
  minMagnitudVisualThreshold,
  onAddSimulatedNavarea,
  weather,
  tsunamiAlerts = [],
  cecopSituacion = 0,
  aemetAlerts = [],
  aemetAlertsSubscriptionEnabled = true,
  gpsd
}: NotificationPanelProps) {
  
  // Notification capability supported
  const surpassesCapable = typeof window !== 'undefined' && 'Notification' in window;

  // Notification configuration state saved in local storage
  const [permission, setPermission] = useState<NotificationPermission>(
    surpassesCapable ? Notification.permission : 'denied'
  );

  const [enabledEarthquakes, setEnabledEarthquakes] = useState(() => {
    const saved = localStorage.getItem('notif_earthquakes');
    return saved !== null ? saved === 'true' : true;
  });

  const [minMagnitude, setMinMagnitude] = useState(() => {
    const saved = localStorage.getItem('notif_min_magnitude');
    return saved !== null ? parseFloat(saved) : (minMagnitudVisualThreshold || 3.0);
  });

  const [maxProximityRadius, setMaxProximityRadius] = useState<number>(() => {
    const saved = localStorage.getItem('notif_max_proximity');
    return saved !== null ? parseInt(saved) : 500;
  });

  const [enabledNavareas, setEnabledNavareas] = useState(() => {
    const saved = localStorage.getItem('notif_navareas');
    return saved !== null ? saved === 'true' : true;
  });

  const [enabledNoaa, setEnabledNoaa] = useState(() => {
    const saved = localStorage.getItem('notif_noaa');
    return saved !== null ? saved === 'true' : true;
  });

  const [enabledTsunamis, setEnabledTsunamis] = useState(() => {
    const saved = localStorage.getItem('notif_tsunamis');
    return saved !== null ? saved === 'true' : true;
  });

  const [enabledCecop, setEnabledCecop] = useState(() => {
    const saved = localStorage.getItem('notif_cecop');
    return saved !== null ? saved === 'true' : true;
  });

  const [enabledAemet, setEnabledAemet] = useState(() => {
    const saved = localStorage.getItem('notif_aemet');
    return saved !== null ? saved === 'true' : true;
  });

  const [snoozeInterval, setSnoozeInterval] = useState<number>(() => {
    const saved = localStorage.getItem('notif_snooze_interval');
    return saved !== null ? parseInt(saved) : 15; // default 15 minutes
  });

  const lastNotificationTimes = useRef<Record<string, number>>(() => {
    const saved = localStorage.getItem('notif_last_trigger_times');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing last trigger times', e);
      }
    }
    return {};
  });

  const [testSuccess, setTestSuccess] = useState(false);

  const getClosestProvinceName = (lat: number, lon: number) => {
    const provinces = [
      { name: 'Madrid', lat: 40.4167, lon: -3.7037 },
      { name: 'Barcelona', lat: 41.3851, lon: 2.1734 },
      { name: 'Valencia', lat: 39.4699, lon: -0.3763 },
      { name: 'Sevilla', lat: 37.3891, lon: -5.9845 },
      { name: 'Zaragoza', lat: 41.6488, lon: -0.8891 },
      { name: 'Málaga', lat: 36.7213, lon: -4.4214 },
      { name: 'A Coruña', lat: 43.3623, lon: -8.4115 },
      { name: 'Vizcaya', lat: 43.2630, lon: -2.9350 },
      { name: 'Asturias', lat: 43.3614, lon: -5.8593 },
      { name: 'Murcia', lat: 37.9922, lon: -1.1307 },
      { name: 'Las Palmas', lat: 28.1235, lon: -15.4363 },
      { name: 'Santa Cruz de Tenerife', lat: 28.4636, lon: -16.2518 },
      { name: 'Baleares', lat: 39.5696, lon: 2.6502 }
    ];
    
    let closest = provinces[0];
    let minDist = Math.hypot(lat - closest.lat, lon - closest.lon);
    
    for (let i = 1; i < provinces.length; i++) {
      const d = Math.hypot(lat - provinces[i].lat, lon - provinces[i].lon);
      if (d < minDist) {
        minDist = d;
        closest = provinces[i];
      }
    }
    return closest.name;
  };

  const handleInjectAemetWarning = async (
    parameter: string,
    severity: 'YELLOW' | 'ORANGE' | 'RED',
    headline: string,
    description: string,
    value: string
  ) => {
    try {
      const res = await customFetch('/api/aemet/warnings/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameter, severity, headline, description, value })
      });
      if (!res.ok) {
        throw new Error('Inyección fallida');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearAemetWarnings = async () => {
    try {
      await customFetch('/api/aemet/warnings/clear', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  // Collapse/Expand state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('notif_panel_collapsed') === 'true';
    }
    return false;
  });

  // Custom Threat/Weather Rules State
  const [weatherRules, setWeatherRules] = useState<ThreatRule[]>(() => {
    const saved = localStorage.getItem('threat_rules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing threat rules', e);
      }
    }
    const legacySaved = localStorage.getItem('weather_rules');
    if (legacySaved) {
      try {
        const legacy: any[] = JSON.parse(legacySaved);
        return legacy.map(r => ({
          ...r,
          threatType: r.threatType || 'meteorológica'
        }));
      } catch (e) {
        console.error('Error parsing legacy weather rules', e);
      }
    }
    // Default seeded rules for awesome initial presentation of all threat types
    return [
      {
        id: 'thr-1',
        name: 'Sismo Crítico Detectado',
        threatType: 'sísmica',
        variable: 'earthquake_magnitude',
        operator: 'greater_than',
        threshold: 4.5,
        enabled: true
      },
      {
        id: 'thr-2',
        name: 'Temporal de Viento Fuerte',
        threatType: 'meteorológica',
        variable: 'windSpeedKts',
        operator: 'greater_than',
        threshold: 20,
        enabled: true
      },
      {
        id: 'thr-3',
        name: 'Ola de Calor Extremo',
        threatType: 'meteorológica',
        variable: 'tempC',
        operator: 'greater_than',
        threshold: 35,
        enabled: true
      },
      {
        id: 'thr-4',
        name: 'Peligro Radiación Elevada',
        threatType: 'radiológica',
        variable: 'radiationUsVh',
        operator: 'greater_than',
        threshold: 0.35,
        enabled: true
      },
      {
        id: 'thr-5',
        name: 'Saturación Avisos Navarea',
        threatType: 'marítima',
        variable: 'navarea_count',
        operator: 'greater_than',
        threshold: 5,
        enabled: false
      }
    ];
  });

  // Save rules to localStorage
  useEffect(() => {
    localStorage.setItem('threat_rules', JSON.stringify(weatherRules));
    localStorage.setItem('weather_rules', JSON.stringify(weatherRules));
  }, [weatherRules]);

  // Sync settings dynamically when altered from other panels
  useEffect(() => {
    const handleSettingsChanged = () => {
      const savedMinMag = localStorage.getItem('notif_min_magnitude');
      if (savedMinMag !== null) {
        setMinMagnitude(parseFloat(savedMinMag));
      }
      const savedMaxProx = localStorage.getItem('notif_max_proximity');
      if (savedMaxProx !== null) {
        setMaxProximityRadius(parseInt(savedMaxProx));
      }
      const savedPushEnabled = localStorage.getItem('notif_push_enabled');
      if (savedPushEnabled !== null) {
        setEnabledEarthquakes(savedPushEnabled === 'true');
      }
    };
    window.addEventListener('notif-settings-changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('notif-settings-changed', handleSettingsChanged);
    };
  }, []);

  // Weather and general simulation state
  const [isSimActive, setIsSimActive] = useState(false);
  const [simTemp, setSimTemp] = useState(25);
  const [simWind, setSimWind] = useState(10);
  const [simRain, setSimRain] = useState(0);
  const [simHum, setSimHum] = useState(50);
  const [simPress, setSimPress] = useState(1013);
  const [simMagnitude, setSimMagnitude] = useState(3.5);
  const [simRadiation, setSimRadiation] = useState(0.12);
  const [simNavarea, setSimNavarea] = useState(1);

  // Sound alert toggle
  const [soundEnabled, setSoundEnabled] = useState(true);

  // New rule form states
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleType, setNewRuleType] = useState<'sísmica' | 'meteorológica' | 'radiológica' | 'marítima' | 'otros'>('meteorológica');
  const [newRuleVar, setNewRuleVar] = useState<any>('tempC');
  const [newRuleOp, setNewRuleOp] = useState<'greater_than' | 'less_than'>('greater_than');
  const [newRuleThreshold, setNewRuleThreshold] = useState<number>(30);

  // Track triggered alert IDs to edge-trigger native system notifications
  const triggeredRuleIdsRef = useRef<Set<string>>(new Set());

  // Derive active weather values (either live from props or from simulator)
  const activeTemp = isSimActive ? simTemp : (weather?.tempC ?? 22.5);
  const activeWind = isSimActive ? simWind : (weather?.windSpeedKts ?? 4);
  const activeRain = isSimActive ? simRain : ((weather?.rain1hIn ?? 0) * 25.4);
  const activeHum = isSimActive ? simHum : (weather?.humidityPct ?? 50);
  const activePress = isSimActive ? simPress : (weather?.pressureHpa ?? 1016.2);

  // Derive active threat/telemetry values
  const activeMagnitude = isSimActive ? simMagnitude : (earthquakes.length > 0 ? Math.max(...earthquakes.map(eq => eq.magnitud)) : 0);
  const activeRadiation = isSimActive ? simRadiation : 0.12;
  const activeNavarea = isSimActive ? simNavarea : navareas.length;
  const activeCecop = cecopSituacion;

  // Evaluate which rules are currently triggered
  const evaluatedRulesStatus = useMemo(() => {
    return weatherRules.map(rule => {
      let currentValue = 0;
      switch (rule.variable) {
        case 'tempC':
          currentValue = activeTemp;
          break;
        case 'windSpeedKts':
          currentValue = activeWind;
          break;
        case 'rainMm':
          currentValue = activeRain;
          break;
        case 'humidityPct':
          currentValue = activeHum;
          break;
        case 'pressureHpa':
          currentValue = activePress;
          break;
        case 'earthquake_magnitude':
          currentValue = activeMagnitude;
          break;
        case 'radiationUsVh':
          currentValue = activeRadiation;
          break;
        case 'navarea_count':
          currentValue = activeNavarea;
          break;
        case 'cecop_situacion':
          currentValue = activeCecop;
          break;
        default:
          currentValue = 0;
      }

      const isTriggered = rule.enabled && (
        rule.operator === 'greater_than' 
          ? currentValue > rule.threshold 
          : currentValue < rule.threshold
      );

      return {
        ...rule,
        currentValue,
        isTriggered
      };
    });
  }, [weatherRules, activeTemp, activeWind, activeRain, activeHum, activePress, activeMagnitude, activeRadiation, activeNavarea, activeCecop]);

  // Filter triggered rules
  const triggeredRules = useMemo(() => {
    return evaluatedRulesStatus.filter(r => r.isTriggered);
  }, [evaluatedRulesStatus]);

  // Play sound indicator
  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitched clean alarm tone
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35); // quick fade
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio Context error:', e);
    }
  };

  // Monitor threats and trigger notifications
  useEffect(() => {
    let playedSound = false;
    
    evaluatedRulesStatus.forEach(rule => {
      if (rule.isTriggered) {
        const lastNotified = lastNotificationTimes.current[rule.id] || 0;
        const now = Date.now();
        const hasSnoozeElapsed = snoozeInterval > 0 && (now - lastNotified) >= (snoozeInterval * 60 * 1000);

        if (!triggeredRuleIdsRef.current.has(rule.id) || hasSnoozeElapsed) {
          // New trigger or snooze elapsed!
          triggeredRuleIdsRef.current.add(rule.id);
          lastNotificationTimes.current[rule.id] = now;
          localStorage.setItem('notif_last_trigger_times', JSON.stringify(lastNotificationTimes.current));
          
          // Play sound
          if (!playedSound) {
            if (rule.threatType === 'sísmica') {
              playEmergencyAlertSound('seismic');
            } else if (rule.threatType === 'meteorológica') {
              playEmergencyAlertSound('weather');
            } else if (rule.variable === 'cecop_situacion' || rule.variable === 'navarea_count') {
              playEmergencyAlertSound('civil');
            } else {
              playAlertSound();
            }
            playedSound = true;
          }

          // Trigger system notification
          let variableLabel = '';
          let unit = '';
          switch (rule.variable) {
            case 'tempC': variableLabel = 'Temperatura'; unit = '°C'; break;
            case 'windSpeedKts': variableLabel = 'Velocidad de Viento'; unit = 'kts'; break;
            case 'rainMm': variableLabel = 'Lluvia acumulada'; unit = 'mm'; break;
            case 'humidityPct': variableLabel = 'Humedad relativa'; unit = '%'; break;
            case 'pressureHpa': variableLabel = 'Presión barométrica'; unit = 'hPa'; break;
            case 'earthquake_magnitude': variableLabel = 'Magnitud de Sismo'; unit = ' Mw'; break;
            case 'radiationUsVh': variableLabel = 'Radiación Ambiental'; unit = ' µSv/h'; break;
            case 'navarea_count': variableLabel = 'Cantidad Avisos NAVAREA'; unit = ' avisos'; break;
            case 'cecop_situacion': variableLabel = 'Nivel CECOP'; unit = ''; break;
          }

          const comparisonStr = rule.operator === 'greater_than' ? 'superior a' : 'inferior a';
          const categoryUpper = (rule.threatType || 'amenaza').toUpperCase();
          
          triggerSystemNotification(
            `⚠️ Alerta [${categoryUpper}]: ${rule.name}`,
            {
              body: `Las condiciones de ${categoryUpper} han superado el umbral: ${variableLabel} actual de ${rule.currentValue.toFixed(2)}${unit} es ${comparisonStr} límite de ${rule.threshold}${unit}.`,
              tag: rule.id,
              requireInteraction: true
            }
          );
        }
      } else {
        // Remove from triggered set if no longer matching
        triggeredRuleIdsRef.current.delete(rule.id);
      }
    });
  }, [evaluatedRulesStatus, snoozeInterval]);

  // State to track if a new critical alert is active
  const [hasNewCritical, setHasNewCritical] = useState(false);

  // Refs to store seen IDs to avoid sending notifications for already processed events on mount or poll
  const seenEarthquakeIds = useRef<Set<string>>(new Set());
  const seenNavareaIds = useRef<Set<string>>(new Set());
  const seenNoaaIds = useRef<Set<string>>(new Set());
  const seenTsunamiIds = useRef<Set<string>>(new Set());
  const seenAemetAlertIds = useRef<Set<string>>(new Set());
  const prevCecopSituacion = useRef<number>(cecopSituacion);
  const isFirstRender = useRef(true);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('notif_earthquakes', String(enabledEarthquakes));
  }, [enabledEarthquakes]);

  useEffect(() => {
    localStorage.setItem('notif_min_magnitude', String(minMagnitude));
  }, [minMagnitude]);

  useEffect(() => {
    localStorage.setItem('notif_navareas', String(enabledNavareas));
  }, [enabledNavareas]);

  useEffect(() => {
    localStorage.setItem('notif_noaa', String(enabledNoaa));
  }, [enabledNoaa]);

  useEffect(() => {
    localStorage.setItem('notif_tsunamis', String(enabledTsunamis));
  }, [enabledTsunamis]);

  useEffect(() => {
    localStorage.setItem('notif_cecop', String(enabledCecop));
  }, [enabledCecop]);

  useEffect(() => {
    localStorage.setItem('notif_aemet', String(enabledAemet));
  }, [enabledAemet]);

  // Request browser permissions
  const handleRequestPermission = async () => {
    if (!surpassesCapable) return;
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
    } catch (err) {
      console.error('Error al solicitar permisos de notificación:', err);
    }
  };

  // Populate initially saw items on first load to prevent storming notification triggers on initialization
  useEffect(() => {
    if (earthquakes.length > 0) {
      earthquakes.forEach(e => seenEarthquakeIds.current.add(e.id));
    }
    if (navareas.length > 0) {
      navareas.forEach(n => seenNavareaIds.current.add(n.id));
    }
    if (noaaAlerts.length > 0) {
      noaaAlerts.forEach(no => seenNoaaIds.current.add(no.id));
    }
    if (tsunamiAlerts.length > 0) {
      tsunamiAlerts.forEach(tsu => seenTsunamiIds.current.add(tsu.id));
    }
    if (aemetAlerts.length > 0) {
      aemetAlerts.forEach(ale => seenAemetAlertIds.current.add(ale.id));
    }
    prevCecopSituacion.current = cecopSituacion;
    isFirstRender.current = false;
  }, []);

  // Watch for new incoming Earthquakes from express server loop
  useEffect(() => {
    if (earthquakes.length === 0) return;

    // Check for initial empty list to avoid flashing on initialization
    const isInitialLoad = seenEarthquakeIds.current.size === 0;
    let foundNewCritical = false;

    // Check for any earthquake not previously seen
    earthquakes.forEach((eq) => {
      if (!seenEarthquakeIds.current.has(eq.id)) {
        // Mark as seen immediately
        seenEarthquakeIds.current.add(eq.id);

        const matchesMagnitude = eq.magnitud >= minMagnitude;
        const matchesProximity = eq.distanciaKm <= maxProximityRadius;

        // Flashing condition: earthquake magnitude >= minMagnitude and within proximity
        if (!isInitialLoad && matchesMagnitude && matchesProximity) {
          foundNewCritical = true;
        }

        // Check if eligible for browser notification
        if (!isInitialLoad && enabledEarthquakes && permission === 'granted') {
          if (matchesMagnitude && matchesProximity) {
            triggerSystemNotification(
              `⚠️ Sismo Crítico Detectado - Mag: ${eq.magnitud}`,
              {
                body: `Seísmo de magnitud ${eq.magnitud} en ${eq.localizacion}. Profundidad: ${eq.depthKm} km. Distancia a estación: ${eq.distanciaKm.toFixed(1)} km.`,
                tag: eq.id,
                requireInteraction: true // Keep on screen until operator acknowledges
              }
            );
          }
        }
      }
    });

    if (foundNewCritical) {
      setHasNewCritical(true);
    }
  }, [earthquakes, enabledEarthquakes, minMagnitude, maxProximityRadius, permission]);

  // Watch for new incoming NAVAREA warnings
  useEffect(() => {
    if (navareas.length === 0) return;

    const isInitialLoad = seenNavareaIds.current.size === 0;
    let foundNewCritical = false;

    navareas.forEach((na) => {
      if (!seenNavareaIds.current.has(na.id)) {
        seenNavareaIds.current.add(na.id);

        const isCritical = na.urgency === 'ALERTA CRÍTICA';
        if (!isInitialLoad && isCritical) {
          foundNewCritical = true;
        }

        if (!isInitialLoad && enabledNavareas && permission === 'granted') {
          triggerSystemNotification(
            `⚓ Aviso Marítimo NAVAREA [${na.urgency}]`,
            {
              body: `[${na.navareaType}] - ${na.id}: ${na.title.substring(0, 80)}...`,
              tag: na.id,
              requireInteraction: isCritical
            }
          );
        }
      }
    });

    if (foundNewCritical) {
      setHasNewCritical(true);
    }
  }, [navareas, enabledNavareas, permission]);

  // Watch for Space Weather Alerts
  useEffect(() => {
    if (noaaAlerts.length === 0) return;

    const isInitialLoad = seenNoaaIds.current.size === 0;
    let foundNewCritical = false;

    noaaAlerts.forEach((no) => {
      if (!seenNoaaIds.current.has(no.id)) {
        seenNoaaIds.current.add(no.id);

        // Any solar storm radiation alert is space weather crisis affecting radio bands
        if (!isInitialLoad) {
          foundNewCritical = true;
        }

        if (!isInitialLoad && enabledNoaa && permission === 'granted') {
          triggerSystemNotification(
            `☀️ Alerta Radiación Espacial NOAA G${no.nivel}`,
            {
              body: `Tormenta Solar grado G${no.nivel} detectada. Frecuencias afectadas: ${no.frecuenciasAfectadas}`,
              tag: no.id
            }
          );
        }
      }
    });

    if (foundNewCritical) {
      setHasNewCritical(true);
    }
  }, [noaaAlerts, enabledNoaa, permission]);

  // Watch for new incoming Tsunamis
  useEffect(() => {
    if (tsunamiAlerts.length === 0) return;

    const isInitialLoad = seenTsunamiIds.current.size === 0;
    let foundNewCritical = false;

    tsunamiAlerts.forEach((tsu) => {
      if (!seenTsunamiIds.current.has(tsu.id)) {
        seenTsunamiIds.current.add(tsu.id);

        const isCritical = tsu.severity === 'WARNING' || tsu.severity === 'WATCH';
        if (!isInitialLoad && isCritical) {
          foundNewCritical = true;
        }

        if (!isInitialLoad && enabledTsunamis && permission === 'granted') {
          if (isCritical || tsu.severity === 'ADVISORY') {
            triggerSystemNotification(
              `🌊 Alerta de Tsunami [${tsu.severity}]`,
              {
                body: `Se ha detectado posible tsunami en ${tsu.location}. Olas máx: ${tsu.maxWaveHeightMeter?.toFixed(2)}m. Fuente: ${tsu.source}.`,
                tag: tsu.id,
                requireInteraction: isCritical
              }
            );
          }
        }
      }
    });

    if (foundNewCritical) {
      setHasNewCritical(true);
    }
  }, [tsunamiAlerts, enabledTsunamis, permission]);

  // Watch for new incoming AEMET warnings (GPSD geolocational subscription)
  useEffect(() => {
    if (aemetAlerts.length === 0) return;

    const isInitialLoad = seenAemetAlertIds.current.size === 0;
    let foundNewCritical = false;

    aemetAlerts.forEach((alert) => {
      if (!seenAemetAlertIds.current.has(alert.id)) {
        seenAemetAlertIds.current.add(alert.id);

        const isCritical = alert.severity === 'RED' || alert.severity === 'ORANGE';
        if (!isInitialLoad && isCritical) {
          foundNewCritical = true;
          if (soundEnabled) {
            playEmergencyAlertSound('weather');
          }
        }

        if (!isInitialLoad && enabledAemet && permission === 'granted') {
          triggerSystemNotification(
            `⚠️ AEMET: Aviso ${alert.severity === 'RED' ? 'Rojo 🔴' : alert.severity === 'ORANGE' ? 'Naranja 🟠' : 'Amarillo 🟡'}`,
            {
              body: `Provincia: ${alert.province}. ${alert.headline}. ${alert.description}`,
              tag: alert.id,
              requireInteraction: isCritical
            }
          );
        }
      }
    });

    if (foundNewCritical) {
      setHasNewCritical(true);
    }
  }, [aemetAlerts, enabledAemet, permission, soundEnabled]);

  // Watch for CECOP Situation Level changes
  useEffect(() => {
    const prev = prevCecopSituacion.current;
    prevCecopSituacion.current = cecopSituacion;

    if (isFirstRender.current) return;

    if (cecopSituacion >= 2 && cecopSituacion > prev) {
      setHasNewCritical(true);

      if (enabledCecop && permission === 'granted') {
        const title = `🚨 Emergencia Civil Activada - SITUACIÓN ${cecopSituacion}`;
        const description = cecopSituacion === 3
          ? 'Caso de emergencia catastrófica nacional. Activación de UME y apoyo estatal.'
          : 'Alerta generalizada con intervención supramunicipal. CECOP activado al 100%.';

        triggerSystemNotification(
          title,
          {
            body: description,
            tag: `cecop-sit-${cecopSituacion}-${Date.now()}`,
            requireInteraction: true
          }
        );
      }
    }
  }, [cecopSituacion, enabledCecop, permission]);

  // Helper function to play sound or activate native HTML5 notification
  const triggerSystemNotification = (title: string, options: NotificationOptions) => {
    if (!surpassesCapable || Notification.permission !== 'granted') return;
    
    const tag = options.tag || title;
    const now = Date.now();
    const lastTime = lastNotificationTimes.current[tag] || 0;
    const elapsedMs = now - lastTime;
    const intervalMs = snoozeInterval * 60 * 1000;
    
    if (snoozeInterval > 0 && elapsedMs < intervalMs) {
      console.log(`[Snooze Activo] Omitiendo notificación para "${tag}". Restan ${Math.ceil((intervalMs - elapsedMs) / 1000)}s.`);
      return;
    }
    
    try {
      // Base options with custom security icons
      const extendedOptions = {
        icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png', // high resolution warning badge
        badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
        ...options
      };

      const notification = new Notification(title, extendedOptions);
      
      // Update last notification timestamp
      lastNotificationTimes.current[tag] = now;
      localStorage.setItem('notif_last_trigger_times', JSON.stringify(lastNotificationTimes.current));

      // Optionally focus on window click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.warn('Fallo al despachar notificación nativa:', err);
    }
  };

  // Send interactive test notification with 3 seconds delay
  const handleTestNotification = () => {
    if (permission !== 'granted') {
      alert('Por favor, autorice primero los permisos de notificación del navegador.');
      return;
    }

    setTestSuccess(true);
    setTimeout(() => {
      triggerSystemNotification('🔔 Enlace del Operador Civil - TEST', {
        body: 'El bus de teletipos APRS-S.A.T extrae la telemetría en segundo plano con éxito incluso con la ventana cerrada.',
        requireInteraction: false
      });
      setTestSuccess(false);
    }, 3000);
  };

  // Toggle collapse state
  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('notif_panel_collapsed', String(next));
      return next;
    });
  };

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 flex flex-col gap-5 shadow-xl text-slate-200" id="browser-notif-panel">
      {/* Dynamic styles for soft flashing alerts */}
      <style>{`
        @keyframes softCriticalGlow {
          0%, 100% {
            background-color: rgba(127, 29, 29, 0.05);
            box-shadow: inset 0 0 10px rgba(239, 68, 68, 0.05);
            border-bottom-color: rgba(239, 68, 68, 0.15);
          }
          50% {
            background-color: rgba(127, 29, 29, 0.35);
            box-shadow: inset 0 0 25px rgba(239, 68, 68, 0.25), 0 0 15px rgba(239, 68, 68, 0.15);
            border-bottom-color: rgba(239, 68, 68, 0.50);
          }
        }
        .animate-critical-glow {
          animation: softCriticalGlow 2s infinite ease-in-out;
        }
      `}</style>
      
      {/* HEADER SECTION */}
      <div 
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3 transition-all duration-500 rounded-t-lg -mx-3 -mt-3 px-3 pt-3 ${
          hasNewCritical ? 'animate-critical-glow border-b-red-900/40' : ''
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 rounded-lg shrink-0">
            <Bell size={18} className={hasNewCritical ? 'animate-bounce text-red-500' : 'animate-wiggle'} />
          </div>
          <div>
            <h3 className="font-sans font-bold text-slate-200 text-xs flex items-center gap-2">
              Alertas del Sistema de Notificaciones Web (Push Nativo)
              {hasNewCritical && (
                <span className="inline-flex items-center gap-1 bg-red-950/80 border border-red-800 text-red-400 text-[8.5px] font-mono leading-none px-1.5 py-0.5 rounded uppercase animate-pulse shrink-0">
                  ¡ALERTA CRÍTICA RECIENTE!
                </span>
              )}
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">Consola de teletipos y radioavisos en segundo plano</p>
          </div>
        </div>

        {/* STATUS STICKER & CONTROLS */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {hasNewCritical && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHasNewCritical(false);
              }}
              type="button"
              className="px-2.5 py-1 bg-red-950 border border-red-800 hover:bg-red-900 text-red-400 hover:text-red-300 rounded text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 focus:outline-none"
              title="Aceptar y silenciar el parpadeo de advertencia en el encabezado"
            >
              <ShieldAlert size={10} className="shrink-0 text-red-400 animate-pulse" />
              <span>RECONOCER</span>
            </button>
          )}

          <div className="text-[10px] select-none font-sans font-black uppercase shrink-0">
            {permission === 'granted' ? (
              <span className="px-2.5 py-1 bg-emerald-950 border border-emerald-500 text-emerald-400 rounded flex items-center gap-1">
                <CheckCircle2 size={11} /> Autocontrol Activo
              </span>
            ) : permission === 'denied' ? (
              <span className="px-2.5 py-1 bg-red-950 border border-red-500 text-red-400 rounded flex items-center gap-1">
                <BellOff size={11} /> Bloqueado / No Soportado
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-yellow-950 border border-yellow-500 text-yellow-400 rounded flex items-center gap-1">
                <AlertTriangle size={11} className="animate-pulse" /> Acción Requerida
              </span>
            )}
          </div>

          {/* COLLAPSE/EXPAND TRIGGER */}
          <button
            onClick={toggleCollapse}
            type="button"
            className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
            title={isCollapsed ? "Expandir panel" : "Colapsar panel"}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* COLUMN 1: PERMISSION MANAGEMENT (4 COLS) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex flex-col gap-4 justify-between h-full">
              <div className="space-y-2">
                <span className="text-[9px] text-emerald-400 font-black tracking-widest uppercase block font-mono">Acceso de Segundidad Operativa</span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Para capturar alertas críticas de seísmos españoles (IGN) y radiocomunicados en tiempo real mientras opera otras herramientas de protección civil, requiere habilitar las notificaciones del sistema operativo en el navegador.
                </p>
              </div>

              <div className="space-y-2">
                {permission !== 'granted' ? (
                  <button
                    onClick={handleRequestPermission}
                    className="w-full py-2 bg-emerald-400 hover:bg-emerald-350 active:scale-[0.99] text-slate-950 rounded-lg text-xs font-bold font-sans flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-950/50"
                  >
                    <Bell size={13} />
                    <span>Configurar Permisos</span>
                  </button>
                ) : (
                  <div className="p-3 bg-slate-950/80 rounded border border-slate-800 text-[10px] text-center text-emerald-400 font-mono">
                    ✓ Permisos aprobados en el navegador.
                  </div>
                )}

                {/* TEST DELAY SHIELD */}
                <button
                  onClick={handleTestNotification}
                  disabled={testSuccess}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-200 border border-slate-700 hover:border-slate-600 rounded-lg text-[11px] font-bold font-sans flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Play size={10} className={testSuccess ? 'animate-ping' : ''} />
                  <span>{testSuccess ? 'Enviando en 3s...' : 'Enviar Notificación de Prueba'}</span>
                </button>

                {onAddSimulatedNavarea && (
                  <button
                    onClick={onAddSimulatedNavarea}
                    className="w-full py-1.5 bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-900 hover:border-indigo-700 rounded-lg text-[11px] font-bold font-sans flex items-center justify-center gap-2 transition-colors cursor-pointer font-mono"
                  >
                    <Radio size={10} className="text-yellow-500 animate-pulse animate-duration-1000" />
                    <span>Simular Alerta NAVAREA</span>
                  </button>
                )}
              </div>
            </div>

            {/* SNOOZE CONFIGURATION CARD */}
            <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex flex-col gap-3 font-sans">
              <span className="text-[9px] text-emerald-400 font-black tracking-widest uppercase block font-mono">Intervalo de Snooze / Silenciador</span>
              <p className="text-[10px] text-slate-400 leading-normal">
                Evita la fatiga del operador silenciando alertas de escritorio repetitivas de eventos de larga duración durante el intervalo configurado.
              </p>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-mono font-bold uppercase">Intervalo de Re-notificación:</label>
                <select
                  value={snoozeInterval}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSnoozeInterval(val);
                    localStorage.setItem('notif_snooze_interval', String(val));
                  }}
                  className="bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer w-full font-mono"
                >
                  <option value={0}>Sin Snooze (Siempre Alertar)</option>
                  <option value={1}>1 Minuto (Modo de Prueba)</option>
                  <option value={5}>5 Minutos (Temporales)</option>
                  <option value={15}>15 Minutos (Recomendado)</option>
                  <option value={30}>30 Minutos (Sismos/Sucesos Estables)</option>
                  <option value={60}>60 Minutos (Silencio Prolongado)</option>
                </select>
              </div>

              {snoozeInterval > 0 && (
                <div className="flex items-center gap-1.5 text-[9px] text-yellow-500/95 font-mono bg-yellow-950/20 border border-yellow-900/30 p-1.5 rounded mt-1">
                  <Clock size={12} className="shrink-0 text-yellow-500 animate-pulse" />
                  <span>Snooze activo: Máx. 1 aviso cada {snoozeInterval} min por tipo de incidente.</span>
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: CHANNEL CHOSEN AND THRESHOLDS (8 COLS) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex flex-col gap-4">
              <span className="text-[9px] text-emerald-400 font-black tracking-widest uppercase block font-mono">Canales de Telemetría Suscritos</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* EARTHQUAKES CHANNEL SETTINGS */}
                <div className="p-3 bg-slate-950/70 border border-slate-900 rounded-lg flex flex-col gap-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notif-earthquakes-cb"
                        checked={enabledEarthquakes}
                        onChange={(e) => setEnabledEarthquakes(e.target.checked)}
                        className="accent-emerald-450 accent-emerald-400 w-4 h-4 rounded cursor-pointer"
                      />
                      <label htmlFor="notif-earthquakes-cb" className="font-bold text-slate-200 text-xs cursor-pointer">
                        Sismos IGN Nacional
                      </label>
                    </div>
                    <span className="text-[8.5px] font-mono text-slate-500 uppercase">Frecuencia: Live</span>
                  </div>

                  <div className="space-y-1.5 pl-6 border-l border-slate-900/80">
                    <div className="flex justify-between items-center text-[10px] text-slate-500">
                      <span>Umbral Sismológico de Alerta:</span>
                      <strong className="text-yellow-500 font-mono">≥ Mag {minMagnitude.toFixed(1)}</strong>
                    </div>

                    <input
                      type="range"
                      min="1.0"
                      max="8.0"
                      step="0.5"
                      value={minMagnitude}
                      onChange={(e) => setMinMagnitude(parseFloat(e.target.value))}
                      disabled={!enabledEarthquakes}
                      className="w-full accent-emerald-400 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-slate-500 italic block">
                      Defecto: El radar civil utiliza un umbral de {minMagnitude} en la escala oficial de magnitud Richter.
                    </span>
                  </div>
                </div>

                {/* MARITIME NAVAREA CHANNEL SETTINGS */}
                <div className="p-3 bg-slate-950/70 border border-slate-900 rounded-lg flex flex-col gap-3 justify-between font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notif-navareas-cb"
                        checked={enabledNavareas}
                        onChange={(e) => setEnabledNavareas(e.target.checked)}
                        className="accent-emerald-400 w-4 h-4 rounded cursor-pointer"
                      />
                      <label htmlFor="notif-navareas-cb" className="font-bold text-slate-200 text-xs cursor-pointer">
                        Avisos NAVAREA / NAVTEX
                      </label>
                    </div>
                    <span className="text-[8.5px] font-mono text-slate-500 uppercase">COMSAR</span>
                  </div>

                  <p className="text-[10px] text-slate-500 pl-6 leading-relaxed">
                    Permite alertar tormentas fuertes en boyas oceanográficas de Cabo Peñas, ejercicios militares de tiro con fuego real, canales prohibidos y emergencias de socorro dictadas por el Instituto Hidrográfico de la Marina de la Armada Española.
                  </p>
                </div>

                {/* SPACE WEATHER SYSTEM CHANNEL SETTINGS */}
                <div className="p-3 bg-slate-950/70 border border-slate-900 rounded-lg flex flex-col gap-3 justify-between font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notif-noaa-cb"
                        checked={enabledNoaa}
                        onChange={(e) => setEnabledNoaa(e.target.checked)}
                        className="accent-emerald-400 w-4 h-4 rounded cursor-pointer"
                      />
                      <label htmlFor="notif-noaa-cb" className="font-bold text-slate-200 text-xs cursor-pointer">
                        Clima Espacial (ALERT-NOAA)
                      </label>
                    </div>
                    <span className="text-[8.5px] font-mono text-slate-500 uppercase">Radio Blackouts</span>
                  </div>

                  <p className="text-[10px] text-slate-500 pl-6 leading-relaxed">
                    Informa sobre radiaciones de tormentas geomagnéticas graves del NOAA que degradan la propagación de radiocomunicación HF en frecuencias críticas tácticas de rescate de protección civil.
                  </p>
                </div>

                {/* TSUNAMIS AND MARITIME THREATS CHANNEL SETTINGS */}
                <div className="p-3 bg-slate-950/70 border border-slate-900 rounded-lg flex flex-col gap-3 justify-between font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notif-tsunamis-cb"
                        checked={enabledTsunamis}
                        onChange={(e) => setEnabledTsunamis(e.target.checked)}
                        className="accent-emerald-400 w-4 h-4 rounded cursor-pointer"
                      />
                      <label htmlFor="notif-tsunamis-cb" className="font-bold text-slate-200 text-xs cursor-pointer">
                        Vigilancia Marítima y Tsunamis
                      </label>
                    </div>
                    <span className="text-[8.5px] font-mono text-slate-500 uppercase">Vigilancia</span>
                  </div>

                  <p className="text-[10px] text-slate-500 pl-6 leading-relaxed">
                    Alerta de tsunamis críticos de intensidad WARNING o WATCH y boletines preventivos de boyas de nivel de mar para costas nacionales.
                  </p>
                </div>

                {/* CIVIL EMERGENCIES AND CECOP SITUATIONS CHANNEL SETTINGS */}
                <div className="p-3 bg-slate-950/70 border border-slate-900 rounded-lg flex flex-col gap-3 justify-between font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notif-cecop-cb"
                        checked={enabledCecop}
                        onChange={(e) => setEnabledCecop(e.target.checked)}
                        className="accent-emerald-400 w-4 h-4 rounded cursor-pointer"
                      />
                      <label htmlFor="notif-cecop-cb" className="font-bold text-slate-200 text-xs cursor-pointer">
                        Emergencias de Protección Civil (CECOP)
                      </label>
                    </div>
                    <span className="text-[8.5px] font-mono text-slate-500 uppercase">SIT-2 / SIT-3</span>
                  </div>

                  <p className="text-[10px] text-slate-500 pl-6 leading-relaxed">
                    Recibe notificaciones inmediatas al activarse la Situación 2 (Alerta General) o Situación 3 (Emergencia Nacional) del plan territorial.
                  </p>
                </div>

                {/* AEMET GEOLOCATIONAL SUBSCRIPTION CARD */}
                <div className="p-3 bg-slate-950/70 border border-slate-900 rounded-lg flex flex-col gap-3 font-sans md:col-span-2">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <div className="flex items-center gap-2">
                      <CloudRain className="text-emerald-400 stroke-[1.5]" size={16} />
                      <span className="font-bold text-slate-200 text-xs">
                        Suscripción Meteorológica Geolocalizada (AEMET OpenData)
                      </span>
                    </div>
                    <span className="text-[8.5px] font-mono text-emerald-400 uppercase font-black px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-500/30 rounded animate-pulse">
                      S.A.T. Activo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Controls Column */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded border border-slate-900/60">
                        <span className="text-[10.5px] text-slate-300 font-medium">Suscripción GPSD:</span>
                        <button
                          onClick={async () => {
                            try {
                              const res = await customFetch('/api/aemet/subscription/toggle', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ enabled: !aemetAlertsSubscriptionEnabled })
                              });
                              if (res.ok) {
                                // The telemetry polling loop will automatically pick up the config change and update the state
                              }
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-[9.5px] font-mono font-bold border transition-all cursor-pointer ${
                            aemetAlertsSubscriptionEnabled
                              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                              : 'bg-slate-950 border-slate-800 text-slate-550 hover:bg-slate-900 hover:text-slate-400'
                          }`}
                        >
                          {aemetAlertsSubscriptionEnabled ? '✓ SUSCRITO (GPSD)' : '✗ DESACTIVADO'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded border border-slate-900/60">
                        <span className="text-[10.5px] text-slate-300 font-medium">Notificaciones Sistema:</span>
                        <input
                          type="checkbox"
                          id="notif-aemet-cb"
                          checked={enabledAemet}
                          onChange={(e) => setEnabledAemet(e.target.checked)}
                          className="accent-emerald-400 w-4 h-4 rounded cursor-pointer animate-pulse"
                        />
                      </div>

                      {/* Display Location Context */}
                      <div className="text-[10px] font-mono bg-slate-900/60 border border-slate-850 p-2 rounded flex flex-col gap-1 text-slate-400">
                        <div className="flex justify-between">
                          <span>Lat/Lon:</span>
                          <span className="text-slate-300 font-bold">
                            {gpsd ? `${gpsd.lat.toFixed(4)}, ${gpsd.lon.toFixed(4)}` : 'Sin Fijación'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cobertura AEMET:</span>
                          <span className="text-yellow-500 font-bold">
                            {gpsd ? 'Provincia de ' + getClosestProvinceName(gpsd.lat, gpsd.lon) : 'Detectando...'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Avisos Activos:</span>
                          <span className={`${aemetAlerts.length > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}`}>
                            {aemetAlerts.length} activos
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Simulation Injector Column */}
                    <div className="flex flex-col gap-2 bg-slate-900/30 p-2 rounded border border-slate-900/50">
                      <span className="text-[9.5px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                        Consola de Inyección de Avisos (Pruebas)
                      </span>
                      <p className="text-[9.5px] text-slate-500 font-sans leading-relaxed">
                        Inyecta avisos meteorológicos personalizados para comprobar la recepción y el disparo acústico/visual del applet.
                      </p>

                      <div className="grid grid-cols-3 gap-1.5 mt-1">
                        <button
                          onClick={() => handleInjectAemetWarning('viento', 'ORANGE', 'Aviso Naranja por Viento', 'Rachas máximas de poniente de hasta 95 km/h.', '95 km/h')}
                          className="px-1.5 py-1 text-[8.5px] font-mono font-bold rounded bg-amber-950/40 border border-amber-500/20 text-amber-400 hover:bg-amber-900/30 transition-colors cursor-pointer"
                        >
                          🌬️ Viento (Or.)
                        </button>
                        <button
                          onClick={() => handleInjectAemetWarning('lluvia', 'RED', 'Alerta Roja por Lluvia', 'Precipitación extrema de hasta 65 mm en una hora.', '65 mm/h')}
                          className="px-1.5 py-1 text-[8.5px] font-mono font-bold rounded bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
                        >
                          🌧️ Lluvia (Rojo)
                        </button>
                        <button
                          onClick={() => handleInjectAemetWarning('tormentas', 'YELLOW', 'Aviso Amarillo por Tormenta', 'Tormenta convectiva severa con granizo medio.', 'Rayos y Granizo')}
                          className="px-1.5 py-1 text-[8.5px] font-mono font-bold rounded bg-yellow-950/40 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-900/30 transition-colors cursor-pointer"
                        >
                          ⚡ Tormenta (Am.)
                        </button>
                      </div>

                      <button
                        onClick={handleClearAemetWarnings}
                        className="w-full mt-1 px-2 py-1 text-[8.5px] font-mono font-bold rounded border border-slate-800 bg-slate-950 text-slate-500 hover:text-red-400 hover:border-red-900/40 transition-all cursor-pointer uppercase flex items-center justify-center gap-1"
                      >
                        <Trash2 size={10} />
                        Limpiar Alertas Manuales
                      </button>
                    </div>
                  </div>

                  {/* Render list of active AEMET Warnings */}
                  {aemetAlerts.length > 0 && (
                    <div className="mt-2 space-y-2 border-t border-slate-900/80 pt-2">
                      <span className="text-[9px] font-mono font-bold text-red-400 uppercase tracking-widest block animate-pulse">
                        Avisos Meteorológicos Activos para tu Geolocalización ({aemetAlerts.length})
                      </span>
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {aemetAlerts.map((alert) => {
                          const isSevere = alert.severity === 'RED' || alert.severity === 'ORANGE';
                          return (
                            <div
                              key={alert.id}
                              className={`p-2 rounded font-mono text-[10.5px] border flex flex-col gap-1 transition-all ${
                                alert.severity === 'RED'
                                  ? 'bg-red-950/30 border-red-500/40 text-red-200'
                                  : alert.severity === 'ORANGE'
                                  ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                                  : 'bg-yellow-950/15 border-yellow-500/20 text-yellow-200'
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span className="flex items-center gap-1">
                                  ⚠️ {alert.headline}
                                </span>
                                <span className={`text-[8.5px] px-1.5 rounded uppercase ${
                                  alert.severity === 'RED'
                                    ? 'bg-red-500 text-white animate-pulse'
                                    : alert.severity === 'ORANGE'
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-yellow-500 text-slate-950'
                                }`}>
                                  Nivel {alert.severity}
                                </span>
                              </div>
                              <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                                {alert.description}
                              </p>
                              <div className="flex justify-between items-center text-[8.5px] text-slate-500 border-t border-slate-900/40 pt-1 mt-0.5">
                                <span>Provincia: <strong className="text-slate-400">{alert.province} ({alert.region})</strong></span>
                                <span>Valor: <strong className="text-slate-400">{alert.value}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* QUICK ENVIRONMENT INSTRUCTIONS INFO */}
                <div className="p-3 bg-sky-950/20 border border-sky-500/20 text-sky-400/90 rounded-lg text-[10px] font-sans flex items-start gap-2 select-none leading-relaxed">
                  <HelpCircle size={15} className="shrink-0 mt-0.5 text-sky-400" />
                  <div className="space-y-1">
                    <strong className="text-slate-300">Modo de Operación en Segundo Plano:</strong>
                    <p>
                      Las alertas se ejecutan inmediatamente gracias a que la terminal de emergencias civil realiza consultas dinámicas (KISS/TCPIP) constantes cada 3 segundos. Puede mantener la pestaña minimizada o estar trabajando en otra pantalla con total tranquilidad.
                    </p>
                  </div>
                </div>

              </div>

            </div>

            {/* GESTOR DE ALERTAS METEOROLÓGICAS PERSONALIZADAS */}
            <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex flex-col gap-4" id="weather-custom-alerts-panel">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <CloudRain className="text-sky-400 stroke-[1.5]" size={18} />
                  <h3 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wide">
                    Alertas Meteorológicas Personalizadas
                  </h3>
                </div>
                
                {/* Audio and simulation indicators */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`p-1.5 rounded border transition-colors cursor-pointer flex items-center justify-center ${
                      soundEnabled 
                        ? 'bg-emerald-950/45 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40' 
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-400'
                    }`}
                    title={soundEnabled ? "Desactivar alarmas sonoras" : "Activar alarmas sonoras"}
                  >
                    {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  </button>

                  <span className={`text-[8.5px] font-mono px-2 py-0.5 rounded uppercase font-black ${
                    isSimActive 
                      ? 'bg-amber-950/60 border border-amber-500/30 text-amber-400 animate-pulse' 
                      : 'bg-slate-950 border border-slate-900 text-slate-500'
                  }`}>
                    {isSimActive ? 'Modo Simulación' : 'Monitoreo Activo'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Define criterios de alerta personalizados para múltiples amenazas (sísmica, meteorológica, radiológica, marítima y CECOP) según tus necesidades operativas. El S.A.T. evaluará las condiciones actuales frente a estos umbrales y disparará alertas visuales y del sistema operativo al instante.
              </p>

              {/* ACTIVE ALERT OVERVIEW BAR */}
              {triggeredRules.length > 0 && (
                <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex flex-col gap-2.5 animate-[pulse_2.5s_infinite]">
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                    <ShieldAlert className="text-red-500 animate-bounce shrink-0" size={15} />
                    <span className="uppercase tracking-wide font-mono text-[10px]">
                      ¡AMENAZAS DETECTADAS BAJO CRITERIO PERSONALIZADO ({triggeredRules.length})!
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px] font-mono">
                    {triggeredRules.map(rule => {
                      let unit = '';
                      let valLabel = '';
                      switch (rule.variable) {
                        case 'tempC': unit = '°C'; valLabel = 'Temp'; break;
                        case 'windSpeedKts': unit = ' kts'; valLabel = 'Viento'; break;
                        case 'rainMm': unit = ' mm'; valLabel = 'Lluvia'; break;
                        case 'humidityPct': unit = '%'; valLabel = 'Humedad'; break;
                        case 'pressureHpa': unit = ' hPa'; valLabel = 'Presión'; break;
                        case 'earthquake_magnitude': unit = ' Mw'; valLabel = 'Sismo Mag'; break;
                        case 'radiationUsVh': unit = ' µSv/h'; valLabel = 'Radiación'; break;
                        case 'navarea_count': unit = ' avisos'; valLabel = 'Avisos Marítimos'; break;
                        case 'cecop_situacion': unit = ''; valLabel = 'Nivel CECOP'; break;
                      }
                      const opChar = rule.operator === 'greater_than' ? '>' : '<';
                      return (
                        <div key={rule.id} className="p-2 bg-red-950/50 border border-red-900/40 rounded flex items-center justify-between text-red-200">
                          <span className="font-bold truncate max-w-[150px]" title={rule.name}>
                            ⚠️ [{rule.threatType.toUpperCase()}] {rule.name}
                          </span>
                          <span className="font-bold text-red-400 shrink-0">
                            {valLabel}: {rule.currentValue.toFixed(2)}{unit} ({opChar} {rule.threshold}{unit})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MAIN CONTENT SPLIT: RULES vs CREATOR */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                
                {/* RULES LIST (7 COLS) */}
                <div className="xl:col-span-7 space-y-3">
                  <div className="text-[10px] text-slate-500 font-mono uppercase font-black">
                    Reglas de Alerta ({weatherRules.length})
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {weatherRules.length > 0 ? (
                      weatherRules.map(rule => {
                        const isTriggered = evaluatedRulesStatus.find(r => r.id === rule.id)?.isTriggered;
                        let varName = '';
                        let varIcon = <Thermometer size={13} className="text-orange-400" />;
                        let unit = '';
                        switch (rule.variable) {
                          case 'tempC':
                            varName = 'Temperatura';
                            varIcon = <Thermometer size={13} className="text-orange-400" />;
                            unit = '°C';
                            break;
                          case 'windSpeedKts':
                            varName = 'Velocidad de Viento';
                            varIcon = <Wind size={13} className="text-teal-400" />;
                            unit = 'kts';
                            break;
                          case 'rainMm':
                            varName = 'Lluvia (1h)';
                            varIcon = <CloudRain size={13} className="text-sky-400" />;
                            unit = 'mm';
                            break;
                          case 'humidityPct':
                            varName = 'Humedad';
                            varIcon = <Droplets size={13} className="text-blue-400" />;
                            unit = '%';
                            break;
                          case 'pressureHpa':
                            varName = 'Presión';
                            varIcon = <Gauge size={13} className="text-indigo-400" />;
                            unit = 'hPa';
                            break;
                          case 'earthquake_magnitude':
                            varName = 'Magnitud Sismo';
                            varIcon = <Radio size={13} className="text-red-400" />;
                            unit = ' Mw';
                            break;
                          case 'radiationUsVh':
                            varName = 'Radiación';
                            varIcon = <Radio size={13} className="text-yellow-400 animate-pulse" />;
                            unit = ' µSv/h';
                            break;
                          case 'navarea_count':
                            varName = 'Cant. NAVAREAs';
                            varIcon = <AlertTriangle size={13} className="text-amber-400" />;
                            unit = ' avisos';
                            break;
                          case 'cecop_situacion':
                            varName = 'CECOP Situación';
                            varIcon = <ShieldAlert size={13} className="text-red-500" />;
                            unit = '';
                            break;
                        }

                        const currentVal = evaluatedRulesStatus.find(r => r.id === rule.id)?.currentValue ?? 0;

                        return (
                          <div 
                            key={rule.id}
                            className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-[11px] transition-all relative overflow-hidden ${
                              isTriggered 
                                ? 'bg-red-950/20 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.1)]' 
                                : rule.enabled 
                                ? 'bg-slate-950 border-slate-900 hover:border-slate-800' 
                                : 'bg-slate-950/40 border-slate-900/60 opacity-60'
                            }`}
                          >
                            <div className="flex flex-col gap-1 flex-1">
                              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                                {varIcon}
                                <span className="truncate max-w-[180px]" title={rule.name}>{rule.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>{varName}</span>
                                <span className="text-slate-500">•</span>
                                <span className="font-bold text-slate-300">
                                  Límite: {rule.operator === 'greater_than' ? '>' : '<'} {rule.threshold}{unit}
                                </span>
                                <span className="text-slate-500">•</span>
                                <span className={isTriggered ? "text-red-400 font-bold" : "text-slate-550"}>
                                  Actual: {currentVal.toFixed(1)}{unit}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {/* Trigger status light */}
                              <span className={`h-2 w-2 rounded-full shrink-0 ${
                                isTriggered 
                                  ? 'bg-red-500 animate-pulse ring-4 ring-red-500/20' 
                                  : rule.enabled 
                                  ? 'bg-emerald-500' 
                                  : 'bg-slate-700'
                              }`} title={isTriggered ? "Alerta disparada" : rule.enabled ? "Evaluando" : "Inactiva"} />

                              {/* Toggle Enabled */}
                              <button
                                onClick={() => {
                                  setWeatherRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                                }}
                                className={`px-2 py-1 rounded text-[9.5px] font-bold border cursor-pointer select-none transition-all uppercase ${
                                  rule.enabled
                                    ? 'bg-emerald-950/44 border-emerald-500/20 text-emerald-400 hover:bg-emerald-900/30'
                                    : 'bg-slate-900 border-slate-800 text-slate-550 hover:bg-slate-850 hover:text-slate-400'
                                }`}
                              >
                                {rule.enabled ? 'Activa' : 'Pausada'}
                              </button>

                              {/* Delete Rule */}
                              <button
                                onClick={() => {
                                  setWeatherRules(prev => prev.filter(r => r.id !== rule.id));
                                }}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/20 rounded border border-transparent hover:border-red-900/40 cursor-pointer transition-all"
                                title="Eliminar regla"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-xs text-slate-500 italic font-sans border border-dashed border-slate-900 rounded-lg">
                        No hay reglas de alerta configuradas. Crea una a la derecha.
                      </div>
                    )}
                  </div>
                </div>

                {/* CREATOR FORM (5 COLS) */}
                <div className="xl:col-span-5 bg-slate-950 p-3.5 rounded-xl border border-slate-900 flex flex-col gap-3 font-sans text-xs">
                  <div className="text-[10px] text-slate-500 font-mono uppercase font-black border-b border-slate-900 pb-1.5">
                    Crear Nueva Alerta de Amenaza
                  </div>

                  {/* Name field */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
                      Nombre de la Alerta:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Sismo Elevado, Viento Extremo..."
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Threat Type Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
                      Tipo de Amenaza:
                    </label>
                    <select
                      value={newRuleType}
                      onChange={(e) => {
                        const type = e.target.value as any;
                        setNewRuleType(type);
                        // Update default variable & default threshold
                        if (type === 'sísmica') {
                          setNewRuleVar('earthquake_magnitude');
                          setNewRuleThreshold(4.0);
                        } else if (type === 'meteorológica') {
                          setNewRuleVar('tempC');
                          setNewRuleThreshold(35);
                        } else if (type === 'radiológica') {
                          setNewRuleVar('radiationUsVh');
                          setNewRuleThreshold(0.35);
                        } else if (type === 'marítima') {
                          setNewRuleVar('navarea_count');
                          setNewRuleThreshold(5);
                        } else if (type === 'otros') {
                          setNewRuleVar('cecop_situacion');
                          setNewRuleThreshold(2);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer font-mono"
                    >
                      <option value="sísmica">📈 Sísmica (Sismos)</option>
                      <option value="meteorológica">🌦️ Meteorológica (Clima)</option>
                      <option value="radiológica">☢️ Radiológica (Radiación)</option>
                      <option value="marítima">⚓ Marítima (NAVAREA)</option>
                      <option value="otros">🚨 Otros (CECOP Situación)</option>
                    </select>
                  </div>

                  {/* Variable & Operator */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
                        Variable:
                      </label>
                      <select
                        value={newRuleVar}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setNewRuleVar(val);
                          // Suggest a smart default threshold depending on variable
                          if (val === 'tempC') setNewRuleThreshold(35);
                          else if (val === 'windSpeedKts') setNewRuleThreshold(25);
                          else if (val === 'rainMm') setNewRuleThreshold(5);
                          else if (val === 'humidityPct') setNewRuleThreshold(80);
                          else if (val === 'pressureHpa') setNewRuleThreshold(1010);
                          else if (val === 'earthquake_magnitude') setNewRuleThreshold(4.0);
                          else if (val === 'radiationUsVh') setNewRuleThreshold(0.35);
                          else if (val === 'navarea_count') setNewRuleThreshold(5);
                          else if (val === 'cecop_situacion') setNewRuleThreshold(2);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer font-mono"
                      >
                        {newRuleType === 'sísmica' && (
                          <option value="earthquake_magnitude">Magnitud Sismo (Mw)</option>
                        )}
                        {newRuleType === 'meteorológica' && (
                          <>
                            <option value="tempC">🌡️ Temp (°C)</option>
                            <option value="windSpeedKts">💨 Viento (kts)</option>
                            <option value="rainMm">🌧️ Lluvia (mm)</option>
                            <option value="humidityPct">💧 Humedad (%)</option>
                            <option value="pressureHpa">🌀 Presión (hPa)</option>
                          </>
                        )}
                        {newRuleType === 'radiológica' && (
                          <option value="radiationUsVh">Radiación (µSv/h)</option>
                        )}
                        {newRuleType === 'marítima' && (
                          <option value="navarea_count">Cantidad NAVAREAs</option>
                        )}
                        {newRuleType === 'otros' && (
                          <option value="cecop_situacion">Situación CECOP</option>
                        )}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
                        Condición:
                      </label>
                      <select
                        value={newRuleOp}
                        onChange={(e) => setNewRuleOp(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer font-mono"
                      >
                        <option value="greater_than">Mayor que (&gt;)</option>
                        <option value="less_than">Menor que (&lt;)</option>
                      </select>
                    </div>
                  </div>

                  {/* Threshold value input */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400 uppercase font-mono font-bold">
                      <span>Valor Umbral:</span>
                      <span className="text-sky-400 font-mono">
                        {newRuleVar === 'tempC' ? '°C' : 
                         newRuleVar === 'windSpeedKts' ? 'kts' : 
                         newRuleVar === 'rainMm' ? 'mm' : 
                         newRuleVar === 'humidityPct' ? '%' : 
                         newRuleVar === 'pressureHpa' ? 'hPa' :
                         newRuleVar === 'earthquake_magnitude' ? 'Mw' :
                         newRuleVar === 'radiationUsVh' ? 'µSv/h' :
                         newRuleVar === 'navarea_count' ? 'avisos' : 'nivel'}
                      </span>
                    </div>
                    <input
                      type="number"
                      step={newRuleVar === 'pressureHpa' ? '0.5' : newRuleVar === 'radiationUsVh' ? '0.01' : '1'}
                      value={newRuleThreshold}
                      onChange={(e) => setNewRuleThreshold(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={() => {
                      if (!newRuleName.trim()) {
                        alert('Por favor, asigne un nombre descriptivo a la alerta de amenaza.');
                        return;
                      }
                      const newRule: ThreatRule = {
                        id: `thr-${Date.now()}`,
                        name: newRuleName.trim(),
                        threatType: newRuleType,
                        variable: newRuleVar,
                        operator: newRuleOp,
                        threshold: newRuleThreshold,
                        enabled: true
                      };
                      setWeatherRules(prev => [...prev, newRule]);
                      setNewRuleName('');
                    }}
                    className="w-full mt-1 py-2 bg-sky-500 hover:bg-sky-450 active:scale-[0.99] text-slate-950 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-sky-950/20"
                  >
                    <Plus size={13} />
                    <span>Añadir Alerta de Amenaza</span>
                  </button>
                </div>

              </div>

              {/* OPERATIONAL NOTE ON REAL-TIME TELEMETRY ONLY */}
              <div className="border-t border-slate-800/60 pt-4 mt-2">
                <div className="text-[10px] font-mono text-emerald-500/80 italic pl-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Consola en Modo Operativo Real. Evaluando variables climatológicas y de telemetría emitidas directamente por teletipos WeeWX Core y sensores en red.</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
