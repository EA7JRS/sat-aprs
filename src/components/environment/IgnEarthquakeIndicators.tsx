import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Activity, Globe, Zap, Compass, AlertTriangle, ArrowUpRight, 
  Clock, MapPin, Layers, Info, ExternalLink, RefreshCw, Map,
  Sliders, Volume2, VolumeX, Radio, ChevronDown, ChevronUp, Filter,
  Bell, BellRing, BellOff, X
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  Tooltip, BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { AnimatePresence, motion } from 'motion/react';
import { EarthquakeEvent, GPSDStatus } from '../../types';

interface IgnEarthquakeIndicatorsProps {
  earthquakes: EarthquakeEvent[];
  gpsd: GPSDStatus;
  onRelocate: (lat: number, lon: number) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function IgnEarthquakeIndicators({ 
  earthquakes = [], 
  gpsd, 
  onRelocate,
  isRefreshing,
  onRefresh
}: IgnEarthquakeIndicatorsProps) {
  
  const [subTab, setSubTab] = useState<'analysis' | 'live-detector' | 'ign-map'>('live-detector'); // Default to live-detector for maximum impact

  // 0. Live Detector and Seismograph states
  const [useGps, setUseGps] = useState<boolean>(true);
  const [manualLat, setManualLat] = useState<string>('40.416775');
  const [manualLon, setManualLon] = useState<string>('-3.703790');
  const [maxRadioKm, setMaxRadioKm] = useState<number>(150.0); // Default 150 km matching Python script
  const [minMagFilter, setMinMagFilter] = useState<number>(1.5);
  const [seismographSensitivity, setSeismographSensitivity] = useState<number>(1.5);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(false);
  
  // Load user threshold magnitude from localStorage (fallback to 3.0)
  const [userThreshold, setUserThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('notif_min_magnitude');
      return saved !== null ? parseFloat(saved) : 3.0;
    } catch {
      return 3.0;
    }
  });

  // Enable/disable push notifications state
  const [pushNotifEnabled, setPushNotifEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('notif_push_enabled');
      const savedEq = localStorage.getItem('notif_earthquakes');
      return saved !== null ? saved === 'true' : (savedEq !== null ? savedEq === 'true' : true);
    } catch {
      return true;
    }
  });

  // Custom high priority threshold for IGN seismic monitoring
  const [highPriorityThreshold, setHighPriorityThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ign_high_priority_threshold');
      return saved !== null ? parseFloat(saved) : 3.5;
    } catch {
      return 3.5;
    }
  });

  useEffect(() => {
    localStorage.setItem('ign_high_priority_threshold', String(highPriorityThreshold));
  }, [highPriorityThreshold]);

  // State to track active high-priority visual alerts
  const [ignHighAlerts, setIgnHighAlerts] = useState<{
    id: string;
    magnitud: number;
    localizacion: string;
    calculatedDist: number;
    time: string;
    depthKm: number;
  }[]>([]);

  // Simulator helper for user testing
  const simulateHighPriorityAlert = () => {
    const randomLocs = [
      "Golfo de Cádiz", "Estrecho de Gibraltar", "Mar de Alborán", "Lorca (Murcia)", "Salar (Granada)", "Pirineos Orientales", "Cabo de San Vicente", "Tenerife (Islas Canarias)"
    ];
    const randomLoc = randomLocs[Math.floor(Math.random() * randomLocs.length)];
    const simulatedEq = {
      id: `sim-${Date.now()}`,
      magnitud: Number((highPriorityThreshold + Math.random() * 1.5).toFixed(1)),
      localizacion: `[SIMULADO] ${randomLoc}`,
      calculatedDist: Number((Math.random() * maxRadioKm * 0.85 + 5).toFixed(1)), // within configured radius
      time: new Date().toISOString(),
      depthKm: Math.floor(Math.random() * 25) + 5
    };
    
    setIgnHighAlerts(prev => [simulatedEq, ...prev]);
  };

  // Listen to external changes to the configuration threshold
  useEffect(() => {
    const handleSettingsChange = () => {
      try {
        const saved = localStorage.getItem('notif_min_magnitude');
        if (saved !== null) {
          setUserThreshold(parseFloat(saved));
        }
        
        const savedPush = localStorage.getItem('notif_push_enabled');
        if (savedPush !== null) {
          setPushNotifEnabled(savedPush === 'true');
        } else {
          const savedEq = localStorage.getItem('notif_earthquakes');
          if (savedEq !== null) {
            setPushNotifEnabled(savedEq === 'true');
          }
        }
      } catch (e) {
        console.error('Error reading configuration thresholds', e);
      }
    };
    window.addEventListener('notif-settings-changed', handleSettingsChange);
    window.addEventListener('storage', handleSettingsChange);
    return () => {
      window.removeEventListener('notif-settings-changed', handleSettingsChange);
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, []);
  
  // Advanced Visual-Only List Filters (stored in localStorage)
  const [visualMinMag, setVisualMinMag] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ign_visual_min_mag');
      return saved !== null ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const [visualMaxMag, setVisualMaxMag] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ign_visual_max_mag');
      return saved !== null ? parseFloat(saved) : 10.0;
    } catch {
      return 10.0;
    }
  });

  const [visualRegion, setVisualRegion] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ign_visual_region');
      return saved !== null ? saved : '';
    } catch {
      return '';
    }
  });

  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState<boolean>(false);
  const [selectedEarthquakeId, setSelectedEarthquakeId] = useState<string | null>(null);

  // Sync visual filters to localStorage on change
  useEffect(() => {
    localStorage.setItem('ign_visual_min_mag', String(visualMinMag));
  }, [visualMinMag]);

  useEffect(() => {
    localStorage.setItem('ign_visual_max_mag', String(visualMaxMag));
  }, [visualMaxMag]);

  useEffect(() => {
    localStorage.setItem('ign_visual_region', visualRegion);
  }, [visualRegion]);

  // Notification API Permission State & Alerts
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          const testNotif = new Notification("SAT Detector Sísmico - Alertas Activas", {
            body: `Recibirás alertas de escritorio para sismos de magnitud ≥ ${userThreshold.toFixed(1)} en el área.`,
            tag: "sat-test-notification"
          });
          testNotif.onclick = () => {
            window.focus();
            window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'sismos-ign' } }));
          };
        }
      } catch (err) {
        console.error("Error requesting notification permission:", err);
      }
    } else {
      alert("Su navegador no soporta la API de Notificaciones de Escritorio.");
    }
  };

  // Real-time canvas states and refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<number[]>([]);
  const shockStartTimeRef = useRef<number | null>(null);
  const shockParamsRef = useRef<{ magnitude: number; distance: number }>({ magnitude: 0, distance: 0 });
  const currentAmplitudeRef = useRef<number>(0.1);

  // Haversine distance calculator
  const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const radioTierra = 6371.0;
    const dlat = (lat2 - lat1) * Math.PI / 180;
    const dlon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dlat / 2) ** 2 + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radioTierra * c;
  };

  const currentLat = useGps ? (gpsd?.lat || 40.416775) : parseFloat(manualLat) || 40.416775;
  const currentLon = useGps ? (gpsd?.lon || -3.703790) : parseFloat(manualLon) || -3.703790;

  const processedEarthquakes = useMemo(() => {
    return earthquakes.map(eq => {
      const dist = calculateHaversineDistance(currentLat, currentLon, eq.latitude, eq.longitude);
      return {
        ...eq,
        calculatedDist: dist,
        isInRange: dist <= maxRadioKm && eq.magnitud >= minMagFilter
      };
    });
  }, [earthquakes, currentLat, currentLon, maxRadioKm, minMagFilter]);

  const selectedEarthquake = useMemo(() => {
    if (!selectedEarthquakeId) return null;
    return processedEarthquakes.find(eq => (eq.id || `${eq.time}-${eq.latitude}-${eq.longitude}`) === selectedEarthquakeId) || null;
  }, [processedEarthquakes, selectedEarthquakeId]);

  // Keep track of already notified or seen earthquakes
  const seenEarthquakeIdsRef = useRef<Set<string>>(new Set());
  const isFirstRenderRef = useRef<boolean>(true);

  useEffect(() => {
    if (processedEarthquakes.length === 0) return;

    // Build the set of current IDs/keys
    const currentIds = processedEarthquakes.map(eq => eq.id || `${eq.time}-${eq.latitude}-${eq.longitude}`);

    if (isFirstRenderRef.current) {
      // On first render, just populate the seen set so we don't spam notifications for old data
      currentIds.forEach(id => seenEarthquakeIdsRef.current.add(id));
      isFirstRenderRef.current = false;
      return;
    }

    // Check for any new earthquakes that we haven't seen before
    processedEarthquakes.forEach(eq => {
      const id = eq.id || `${eq.time}-${eq.latitude}-${eq.longitude}`;
      if (!seenEarthquakeIdsRef.current.has(id)) {
        // This is a new earthquake! Mark as seen
        seenEarthquakeIdsRef.current.add(id);

        const dist = eq.calculatedDist;

        // HIGH PRIORITY VISUAL ALERT TRIGGER:
        // Exceeds custom threshold AND within configured maximum range/radio
        if (eq.magnitud >= highPriorityThreshold && dist <= maxRadioKm) {
          setIgnHighAlerts(prev => {
            if (prev.some(a => a.id === id)) return prev;
            return [{
              id,
              magnitud: eq.magnitud,
              localizacion: eq.localizacion,
              calculatedDist: dist,
              time: eq.time,
              depthKm: eq.depthKm
            }, ...prev];
          });
        }

        // Check if it exceeds the desktop notification threshold
        if (eq.magnitud >= userThreshold && pushNotifEnabled) {
          // Trigger push/desktop notification if permission is granted
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const title = `⚠️ ALERTA SÍSMICA: M ${eq.magnitud.toFixed(1)} - ${eq.localizacion}`;
            const body = `Nuevo seísmo detectado con magnitud ${eq.magnitud.toFixed(1)} a ${eq.depthKm}km de profundidad, registrado en tiempo real por el RSN.`;
            
            try {
              const notification = new Notification(title, {
                body,
                tag: id,
                requireInteraction: true
              });

              notification.onclick = () => {
                window.focus();
                window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: { tab: 'sismos-ign' } }));
              };
            } catch (err) {
              console.error("Error displaying notification:", err);
            }
          }
        }
      }
    });
  }, [processedEarthquakes, userThreshold, highPriorityThreshold, maxRadioKm]);

  const nearestEarthquake = useMemo(() => {
    const inRange = processedEarthquakes.filter(e => e.isInRange);
    if (inRange.length === 0) return null;
    return inRange.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
  }, [processedEarthquakes]);

  const visuallyFilteredEarthquakes = useMemo(() => {
    const inRange = processedEarthquakes.filter(e => e.isInRange);
    return inRange.filter(eq => {
      const matchMinMag = eq.magnitud >= visualMinMag;
      const matchMaxMag = eq.magnitud <= visualMaxMag;
      const matchRegion = !visualRegion || eq.localizacion.toLowerCase().includes(visualRegion.toLowerCase());
      return matchMinMag && matchMaxMag && matchRegion;
    });
  }, [processedEarthquakes, visualMinMag, visualMaxMag, visualRegion]);

  // Seismograph simulator loop
  useEffect(() => {
    if (pointsRef.current.length === 0) {
      pointsRef.current = Array.from({ length: 400 }, () => 0);
    }

    let animationFrameId: number;
    let lastTime = Date.now();

    const updateSeismograph = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Base micro-noise (constant ground vibration)
      const secSeed = now / 1000;
      let amplitude = (Math.sin(secSeed * 5.3) * 0.4 + Math.cos(secSeed * 12.1) * 0.15 + (Math.random() - 0.5) * 0.5) * seismographSensitivity;

      // Add shockwave if active
      if (shockStartTimeRef.current !== null) {
        const elapsed = (now - shockStartTimeRef.current) / 1000;
        const { magnitude, distance } = shockParamsRef.current;

        // Wave progression modeling: P-wave arrives at t=0, S-wave arrives at t_S, Surface waves later
        const pWaveArrival = 0;
        const sWaveArrival = Math.max(0.8, distance / 120); // Arrival delay based on distance
        const surfaceWaveArrival = sWaveArrival * 1.8;

        let shockAmp = 0;

        // 1. P-Wave (Primary Compression - High frequency, lower amplitude)
        if (elapsed >= pWaveArrival) {
          const tP = elapsed - pWaveArrival;
          const pFreq = 16.0; // Hz
          const pAmp = (magnitude * 3.5) / Math.max(1, distance / 50); // Attenuate over distance
          const pDecay = Math.exp(-1.8 * tP);
          shockAmp += pAmp * Math.sin(tP * pFreq * 2 * Math.PI) * pDecay;
        }

        // 2. S-Wave (Secondary Shear - Medium-low frequency, high lateral amplitude)
        if (elapsed >= sWaveArrival) {
          const tS = elapsed - sWaveArrival;
          const sFreq = 5.5; // Hz
          const sAmp = (magnitude * 12.0) / Math.max(1, distance / 45);
          const sDecay = Math.exp(-0.75 * tS);
          shockAmp += sAmp * Math.sin(tS * sFreq * 2 * Math.PI) * sDecay;
        }

        // 3. Surface Waves (Rayleigh - Ultra-low frequency, massive amplitude, slow decay)
        if (elapsed >= surfaceWaveArrival) {
          const tSurf = elapsed - surfaceWaveArrival;
          const surfFreq = 2.0; // Hz
          const surfAmp = (magnitude * 18.0) / Math.max(1, distance / 35);
          const surfDecay = Math.exp(-0.25 * tSurf);
          shockAmp += surfAmp * Math.sin(tSurf * surfFreq * 2 * Math.PI) * surfDecay;
        }

        amplitude += shockAmp;

        // Terminate simulation after 18 seconds or decay to insignificance
        if (elapsed > 18.0) {
          shockStartTimeRef.current = null;
        }
      }

      currentAmplitudeRef.current = amplitude;

      // Update points array
      pointsRef.current.push(amplitude);
      if (pointsRef.current.length > 400) {
        pointsRef.current.shift();
      }

      // Render Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          // Draw grid and magnitude thresholds
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1;
          for (let x = 0; x < width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
          }

          // Horizontal threshold markers
          const midY = height / 2;
          ctx.strokeStyle = '#1e293b';
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(width, midY);
          ctx.stroke();

          // M3 and M5 warning threshold bands
          ctx.fillStyle = 'rgba(244, 63, 94, 0.02)';
          ctx.fillRect(0, midY - height * 0.15, width, height * 0.30);
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.1)';
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, midY - height * 0.15);
          ctx.lineTo(width, midY - height * 0.15);
          ctx.moveTo(0, midY + height * 0.15);
          ctx.lineTo(width, midY + height * 0.15);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#64748b';
          ctx.font = '8px monospace';
          ctx.fillText('+3.0M LÍMITE', 10, midY - height * 0.15 - 3);
          ctx.fillText('-3.0M LÍMITE', 10, midY + height * 0.15 + 8);

          // Plot the scrolling wave line
          ctx.beginPath();
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';

          // Color based on maximum intensity of current points
          const maxVal = Math.max(...pointsRef.current.map(Math.abs));
          let lineColor = '#10b981'; // green
          let shadowColor = 'rgba(16, 185, 129, 0.4)';
          if (maxVal > 15) {
            lineColor = '#ef4444'; // red
            shadowColor = 'rgba(239, 68, 68, 0.6)';
          } else if (maxVal > 4) {
            lineColor = '#f59e0b'; // amber
            shadowColor = 'rgba(245, 158, 11, 0.5)';
          }

          ctx.strokeStyle = lineColor;
          ctx.shadowColor = shadowColor;
          ctx.shadowBlur = 4;

          const step = width / 400;
          for (let i = 0; i < pointsRef.current.length; i++) {
            const x = i * step;
            const y = midY + pointsRef.current[i] * 3; // vertical scaling
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.shadowBlur = 0; // reset shadow

          // Pen needle drawing (on the right end)
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(width - 4, midY + pointsRef.current[pointsRef.current.length - 1] * 3, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(updateSeismograph);
    };

    animationFrameId = requestAnimationFrame(updateSeismograph);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [seismographSensitivity]);

  // Handle a simulation trigger
  const triggerSimulation = (magnitude: number, distance: number) => {
    shockStartTimeRef.current = Date.now();
    shockParamsRef.current = { magnitude, distance };
    
    // Play sound if enabled
    if (isSoundEnabled) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        try {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(25 + magnitude * 8, ctx.currentTime);
          
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(60 + magnitude * 5, ctx.currentTime);

          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.3 * (magnitude / 6), ctx.currentTime + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.5);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + 4.0);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  
  // 1. Calculate general stats
  const stats = useMemo(() => {
    const total = earthquakes.length;
    if (total === 0) {
      return {
        total: 0,
        avgMagnitude: 0,
        maxMagnitude: 0,
        maxSismo: null,
        totalEnergyJoules: 0,
        totalEnergyTntEquivalentTonnes: 0,
        feltCount: 0
      };
    }

    let sumMagnitude = 0;
    let maxMagnitude = 0;
    let maxSismo: EarthquakeEvent | null = null;
    let totalEnergyJoules = 0;
    let feltCount = 0;

    for (const eq of earthquakes) {
      sumMagnitude += eq.magnitud;
      
      // Calculate energy using Gutenberg-Richter relation: log10(E) = 4.8 + 1.5 * M (with E in Joules)
      const energy = Math.pow(10, 4.8 + 1.5 * eq.magnitud);
      totalEnergyJoules += energy;

      if (eq.magnitud > maxMagnitude) {
        maxMagnitude = eq.magnitud;
        maxSismo = eq;
      }

      // Estimate if felt (usually sismos starting from M>=3.0 can be felt, or we check description tags)
      if (eq.magnitud >= 3.0 || eq.localizacion.toLowerCase().includes('sentido')) {
        feltCount++;
      }
    }

    const avgMagnitude = sumMagnitude / total;
    
    // Convert Joules to Tonnes of TNT: 1 Ton equivalent of TNT = 4.184 * 10^9 Joules
    const totalEnergyTntEquivalentTonnes = totalEnergyJoules / 4.184e9;

    return {
      total,
      avgMagnitude,
      maxMagnitude,
      maxSismo,
      totalEnergyJoules,
      totalEnergyTntEquivalentTonnes,
      feltCount
    };
  }, [earthquakes]);

  // 2. Map data for chart: Magnitudes Distribution
  const magnitudeChartData = useMemo(() => {
    let micro = 0; // M < 2.0
    let minor = 0; // 2.0 - 2.9
    let light = 0; // 3.0 - 3.9
    let moderate = 0; // >= 4.0

    for (const eq of earthquakes) {
      if (eq.magnitud < 2.0) micro++;
      else if (eq.magnitud < 3.0) minor++;
      else if (eq.magnitud < 4.0) light++;
      else moderate++;
    }

    return [
      { name: 'Microseísmos (<2.0)', value: micro, color: '#10b981' },
      { name: 'Sismo Menor (2.0-2.9)', value: minor, color: '#3b82f6' },
      { name: 'Sismo Ligero (3.0-3.9)', value: light, color: '#f59e0b' },
      { name: 'Sismo Moderado (≥4.0)', value: moderate, color: '#ef4444' }
    ];
  }, [earthquakes]);

  // 3. Map data for chart: Depth Distribution
  const depthChartData = useMemo(() => {
    let shallow = 0; // < 10 km
    let intermediate = 0; // 10 - 25 km
    let deep = 0; // 25 - 50 km
    let veryDeep = 0; // > 50 km

    for (const eq of earthquakes) {
      const d = eq.depthKm || 0;
      if (d < 10) shallow++;
      else if (d < 25) intermediate++;
      else if (d < 50) deep++;
      else veryDeep++;
    }

    return [
      { name: 'Superficial (<10km)', count: shallow, fill: '#fda4af' },
      { name: 'Intermedio (10-25km)', count: intermediate, fill: '#f43f5e' },
      { name: 'Profundo (25-50km)', count: deep, fill: '#be123c' },
      { name: 'Muy Profundo (≥50km)', count: veryDeep, fill: '#881337' }
    ];
  }, [earthquakes]);

  // 4. Map data for chart: Seismic Regions (Top 6 provinces/zones)
  const zoneChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Guess zone from localizacion
    for (const eq of earthquakes) {
      let l = eq.localizacion || 'Otros';
      
      // Extract province if inside parentheses or after a comma, or use common keywords
      let zone = 'España / Atlántico';
      if (l.includes('(') && l.includes(')')) {
        const matches = l.match(/\(([^)]+)\)/);
        if (matches && matches[1]) zone = matches[1].toUpperCase().trim();
      } else if (l.includes(',')) {
        const parts = l.split(',');
        zone = parts[parts.length - 1].trim().toUpperCase();
      } else {
        // Fallback checks
        const upper = l.toUpperCase();
        if (upper.includes('ALBORÁN') || upper.includes('ALBORAN')) zone = 'MAR DE ALBORÁN';
        else if (upper.includes('CANARIAS') || upper.includes('TENERIFE') || upper.includes('PALMA') || upper.includes('HIERRO')) zone = 'I. CANARIAS';
        else if (upper.includes('HUELVA')) zone = 'HUELVA';
        else if (upper.includes('GRANADA')) zone = 'GRANADA';
        else if (upper.includes('ALMERÍA') || upper.includes('ALMERIA')) zone = 'ALMERÍA';
        else if (upper.includes('MURCIA') || upper.includes('LORCA')) zone = 'MURCIA';
        else if (upper.includes('PIRINEOS') || upper.includes('HUESCA') || upper.includes('LLEIDA')) zone = 'PIRINEOS';
        else if (upper.includes('GALICIA') || upper.includes('LUGO') || upper.includes('PONTEVEDRA')) zone = 'GALICIA';
        else zone = upper.substring(0, 18);
      }

      // Cleanup short generic zones
      if (zone.length < 3) zone = 'PENÍNSULA IBÉRICA';

      counts[zone] = (counts[zone] || 0) + 1;
    }

    const sortedZones = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return sortedZones;
  }, [earthquakes]);

  // 5. Compute temporal evolution (Daily count of earthquakes in analyzed block)
  const temporalChartData = useMemo(() => {
    const tempCounts: Record<string, { count: number; magSum: number; maxMag: number }> = {};
    
    // We sort older to newer for timeline
    const chronologicalEqs = [...earthquakes].reverse();
    
    for (const eq of chronologicalEqs) {
      // Extract date in YYYY-MM-DD
      const dateStr = eq.time.slice(0, 10);
      
      if (!tempCounts[dateStr]) {
        tempCounts[dateStr] = { count: 0, magSum: 0, maxMag: 0 };
      }
      tempCounts[dateStr].count += 1;
      tempCounts[dateStr].magSum += eq.magnitud;
      if (eq.magnitud > tempCounts[dateStr].maxMag) {
        tempCounts[dateStr].maxMag = eq.magnitud;
      }
    }

    return Object.entries(tempCounts).map(([date, val]) => {
      // Reformat to readable ES date "15 Jun"
      let label = date;
      try {
        const parts = date.split('-');
        if (parts.length === 3) {
          const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
          const day = parseInt(parts[2]);
          const monthIdx = parseInt(parts[1]) - 1;
          label = `${day} ${months[monthIdx]}`;
        }
      } catch (err) {}

      return {
        date,
        label,
        sismos: val.count,
        magnitudMax: parseFloat(val.maxMag.toFixed(1)),
        avgMagnitud: parseFloat((val.magSum / val.count).toFixed(1))
      };
    });
  }, [earthquakes]);

  return (
    <div className="flex flex-col gap-4 font-mono text-xs" id="ign-terremotos-panel">
      
      {/* 1. SEISMIC HERO HEADER */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-rose-950/40 border border-rose-500/30 text-rose-400 font-mono font-bold rounded text-[10px] uppercase">
              Red Sísmica Nacional (IGN)
            </div>
            <span className="text-[10px] text-slate-500 font-mono">• INDICADORES DE SISMICIDAD</span>
          </div>
          <h1 className="font-sans font-extrabold text-lg text-slate-100 tracking-tight flex items-center gap-2">
            <Globe className="text-rose-500" size={18} />
            Visor de Indicadores de Terremotos - Integración Oficial RSN España
          </h1>
          <p className="text-xs text-slate-400 font-serif leading-relaxed">
            Consola analítica integrada con el sistema estadístico de <strong className="text-slate-300">indicadores-terremotos.ign.es</strong>. Procesa las últimas alertas sismográficas de la corteza ibérica y canaria, computando la energía acumulada liberada el período actual, patrones geográficos de deformación tectónica y umbrales de seguridad civil.
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={requestNotificationPermission}
            className={`p-2 py-2 border rounded-lg flex items-center gap-1.5 transition-all text-[10px] cursor-pointer font-mono ${
              notificationPermission === 'granted'
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40'
                : notificationPermission === 'denied'
                ? 'bg-rose-950/20 border-rose-500/20 text-rose-300 hover:bg-rose-950/30'
                : 'bg-cyan-950/20 border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/30 hover:border-cyan-500/50'
            }`}
            title="Configurar Notificaciones de Escritorio para Sismos de Mayor Intensidad"
          >
            {notificationPermission === 'granted' ? (
              <BellRing size={12} className="text-emerald-400 animate-pulse" />
            ) : notificationPermission === 'denied' ? (
              <BellOff size={12} className="text-rose-400" />
            ) : (
              <Bell size={12} className="text-cyan-400" />
            )}
            <span>
              {notificationPermission === 'granted'
                ? `Alertas Activas (M ≥ ${userThreshold.toFixed(1)})`
                : notificationPermission === 'denied'
                ? 'Alertas Bloqueadas'
                : 'Habilitar Alertas Web'}
            </span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition-all text-[10px] cursor-pointer"
            title="Recargar catálogo sismográfico del IGN"
          >
            <RefreshCw size={12} className={`${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <a 
            href="https://indicadores-terremotos.ign.es/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] font-mono bg-rose-950/30 border border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-950/50 text-rose-300 hover:text-white px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5"
          >
            <span>Ir al Portal IGN</span>
            <ExternalLink size={11} className="text-rose-400" />
          </a>
        </div>
      </div>

      {/* ALERTA VISUAL DE PRIORIDAD ALTA */}
      <AnimatePresence>
        {ignHighAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-red-950 via-rose-950 to-red-950 border-2 border-red-500 rounded-xl p-4 md:p-5 flex flex-col gap-4 shadow-[0_0_25px_rgba(239,68,68,0.25)] animate-pulse relative">
              {/* Zebra striping highlight accent */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-500 via-red-500 to-yellow-500" />
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-red-500/35 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500 text-white rounded-lg animate-ping absolute opacity-20 w-10 h-10" />
                  <div className="p-2 bg-red-600 text-white rounded-lg relative z-10 shrink-0">
                    <AlertTriangle size={20} className="animate-bounce" />
                  </div>
                  <div>
                    <h2 className="font-sans font-black text-sm md:text-base text-red-100 tracking-tight flex items-center gap-2">
                      SISTEMA RSN: ALERTA SÍSMICA ACTIVA DE PRIORIDAD ALTA
                    </h2>
                    <p className="text-[10px] text-red-300 font-mono leading-none mt-1">
                      Eventos detectados por encima del umbral personalizado de <strong className="text-white">M ≥ {highPriorityThreshold.toFixed(1)}</strong> dentro de su radio de cobertura de <strong className="text-white">{maxRadioKm} km</strong>.
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIgnHighAlerts([])}
                  className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold font-mono px-3 py-1.5 rounded border border-red-400 transition-all cursor-pointer self-start md:self-auto shadow-md"
                >
                  DESACTIVAR TODAS LAS ALERTAS ({ignHighAlerts.length})
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {ignHighAlerts.map((alert) => (
                  <div 
                    key={alert.id}
                    className="bg-slate-950/80 border border-red-500/40 hover:border-red-500/70 p-3 rounded-lg flex flex-col gap-2 transition-all shadow-inner relative group"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[9px] bg-red-950 text-red-400 font-mono font-bold px-1.5 py-0.5 rounded border border-red-900/50 uppercase">
                          M {alert.magnitud.toFixed(1)} • Umbral Superado
                        </span>
                        <h4 className="font-sans font-black text-slate-100 text-xs mt-1">{alert.localizacion}</h4>
                      </div>
                      
                      <button
                        onClick={() => setIgnHighAlerts(prev => prev.filter(a => a.id !== alert.id))}
                        className="text-slate-500 hover:text-red-400 text-[10px] font-mono p-1 transition-colors hover:bg-red-950/40 rounded"
                        title="Descartar esta alerta"
                      >
                        ✕ Descartar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 border-t border-slate-900 pt-2">
                      <div>Distancia: <strong className="text-rose-400">{alert.calculatedDist.toFixed(1)} km</strong></div>
                      <div>Profundidad: <strong className="text-slate-300">{alert.depthKm} km</strong></div>
                      <div className="col-span-2 text-slate-500 flex items-center gap-1">
                        <Clock size={10} />
                        <span>{new Date(alert.time).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
                      </div>
                    </div>

                    <div className="flex gap-1.5 mt-1">
                      <button
                        onClick={() => {
                          const realEq = earthquakes.find(e => e.id === alert.id);
                          if (realEq) {
                            onRelocate(realEq.latitude, realEq.longitude);
                          } else {
                            // Simulated: place relatively close to station
                            const angle = Math.random() * 2 * Math.PI;
                            const distDeg = (alert.calculatedDist / 111);
                            const lLat = currentLat + distDeg * Math.sin(angle);
                            const lLon = currentLon + distDeg * Math.cos(angle);
                            onRelocate(Number(lLat.toFixed(6)), Number(lLon.toFixed(6)));
                          }
                        }}
                        className="flex-1 py-1 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[9.5px] rounded transition-all font-mono flex items-center justify-center gap-1 cursor-pointer"
                        title="Ubicar la estación de monitoreo en este epicentro"
                      >
                        <MapPin size={10} className="text-rose-400" />
                        <span>Re-centrar Estación Aquí</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SEISMIC NAVIGATION TABS */}
      <div className="flex border border-slate-850 bg-slate-950/40 p-1.5 rounded-xl gap-2 items-center">
        <button
          onClick={() => setSubTab('live-detector')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
            subTab === 'live-detector'
              ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.08)] font-black'
              : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Radio size={14} className={subTab === 'live-detector' ? 'text-rose-400 animate-pulse' : 'text-slate-400'} />
          <span>Detector Sísmico IGN</span>
          <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[8.5px] font-mono px-1.5 rounded uppercase tracking-tight">
            En Directo
          </span>
        </button>

        <button
          onClick={() => setSubTab('analysis')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
            subTab === 'analysis'
              ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.08)] font-black'
              : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Activity size={14} className={subTab === 'analysis' ? 'text-rose-400 animate-pulse' : 'text-slate-400'} />
          <span>Indicadores y Análisis Sísmico</span>
        </button>

        <button
          onClick={() => setSubTab('ign-map')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
            subTab === 'ign-map'
              ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.08)] font-black'
              : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Map size={14} className={subTab === 'ign-map' ? 'text-rose-400 animate-pulse' : 'text-slate-400'} />
          <span>Visor Terremotos Próximos</span>
          <span className="bg-rose-950 text-rose-400 border border-rose-800 text-[8.5px] font-mono px-1.5 rounded uppercase tracking-tight flex items-center gap-0.5">
            <span className="w-1 h-1 rounded-full bg-rose-400 animate-ping" />
            IGN
          </span>
        </button>
      </div>

      {subTab === 'live-detector' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* COL 1: SEISMIC DETECTOR & EARTHQUAKES (7 COLS) */}
          <div className="lg:col-span-7 flex flex-col gap-4 animate-fade-in">
            {/* List of Earthquakes currently within configured Max Radio */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Red Sísmica en Rango</span>
                  <h3 className="font-sans font-extrabold text-sm text-slate-200">
                    Sismos en Rango ({visuallyFilteredEarthquakes.length} de {processedEarthquakes.filter(e => e.isInRange).length})
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-black uppercase font-mono tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isAdvancedFiltersOpen 
                      ? 'bg-rose-950 border-rose-500/30 text-rose-300' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Filter size={11} className={visualMinMag > 1.0 || visualMaxMag < 10.0 || visualRegion ? "text-rose-400 animate-pulse" : ""} />
                  <span>Filtros</span>
                  {isAdvancedFiltersOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              </div>

              {/* Advanced Filters Panel */}
              <AnimatePresence>
                {isAdvancedFiltersOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden bg-slate-900/30 border border-slate-900/80 rounded-lg p-3 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {/* Keyword Filter for Region */}
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                          Región de Monitoreo
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={visualRegion}
                            onChange={(e) => setVisualRegion(e.target.value)}
                            placeholder="Ej. Canarias, Salar, Alborán..."
                            className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-rose-500/30 font-mono placeholder:text-slate-600"
                          />
                          {visualRegion && (
                            <button
                              type="button"
                              onClick={() => setVisualRegion('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px] font-mono font-bold px-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Magnitude Range */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <span>Magnitud Preferida</span>
                          <span className="text-rose-400 font-mono font-bold">
                            M {visualMinMag.toFixed(1)} - M {visualMaxMag.toFixed(1)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-slate-900/60">
                            <span className="text-[8px] text-slate-500 block font-bold uppercase">Mínima</span>
                            <input
                              type="range"
                              min="0.0"
                              max="9.0"
                              step="0.1"
                              value={visualMinMag}
                              onChange={(e) => setVisualMinMag(parseFloat(e.target.value))}
                              className="w-full accent-rose-500 h-1 bg-slate-900 rounded cursor-pointer"
                            />
                          </div>
                          <div className="space-y-1 bg-slate-950/40 p-1.5 rounded border border-slate-900/60">
                            <span className="text-[8px] text-slate-500 block font-bold uppercase">Máxima</span>
                            <input
                              type="range"
                              min="1.0"
                              max="10.0"
                              step="0.1"
                              value={visualMaxMag}
                              onChange={(e) => setVisualMaxMag(parseFloat(e.target.value))}
                              className="w-full accent-rose-500 h-1 bg-slate-900 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900/60 pt-2 text-[9px]">
                      <span className="text-slate-500 font-serif italic">
                        * Filtros visuales guardados en localStorage. No afectan la detección global.
                      </span>
                      {(visualMinMag > 1.0 || visualMaxMag < 10.0 || visualRegion !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setVisualMinMag(1.0);
                            setVisualMaxMag(10.0);
                            setVisualRegion('');
                          }}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded text-slate-400 hover:text-slate-300 font-mono transition-colors cursor-pointer text-[9px]"
                        >
                          Restablecer Filtros
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className={`${selectedEarthquake ? 'md:col-span-7' : 'md:col-span-12'} flex flex-col gap-3 transition-all duration-300`}>
                  <div className="max-h-[220px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent">
                    {visuallyFilteredEarthquakes.length > 0 ? (
                      visuallyFilteredEarthquakes.map((eq, idx) => {
                        const eqKey = eq.id || `${eq.time}-${eq.latitude}-${eq.longitude}`;
                        const isSelected = selectedEarthquakeId === eqKey;
                        const isCritical = eq.magnitud >= userThreshold;
                        return (
                          <motion.div 
                            key={eqKey}
                            onClick={() => setSelectedEarthquakeId(isSelected ? null : eqKey)}
                            className={`p-2 flex items-center justify-between transition-all cursor-pointer rounded ${
                              isSelected
                                ? 'bg-rose-950/30 border border-rose-500/60 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                                : 'bg-slate-900/40 border border-slate-900 hover:border-slate-800'
                            }`}
                            animate={isCritical && !isSelected ? {
                              borderColor: ["rgba(239, 68, 68, 0.2)", "rgba(239, 68, 68, 0.85)", "rgba(239, 68, 68, 0.2)"],
                              boxShadow: [
                                "0 0 0px rgba(239, 68, 68, 0)",
                                "0 0 10px rgba(239, 68, 68, 0.45)",
                                "0 0 0px rgba(239, 68, 68, 0)"
                              ],
                              backgroundColor: ["rgba(15, 23, 42, 0.4)", "rgba(127, 29, 29, 0.25)", "rgba(15, 23, 42, 0.4)"]
                            } : {}}
                            transition={isCritical && !isSelected ? {
                              duration: 1.5,
                              repeat: Infinity,
                              ease: "easeInOut"
                            } : undefined}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded flex flex-col items-center justify-center font-mono font-bold leading-none ${
                                eq.magnitud >= 4.0 ? 'bg-rose-950/40 border border-rose-500/30 text-rose-300' :
                                eq.magnitud >= 3.0 ? 'bg-amber-950/30 border border-amber-500/20 text-amber-300' :
                                'bg-slate-950 border border-slate-900 text-slate-300'
                              }`}>
                                <span className="text-[8px] text-slate-500">M</span>
                                <span className="text-xs">{eq.magnitud.toFixed(1)}</span>
                              </div>

                              <div className="space-y-0.5">
                                <div className="text-xs font-bold text-slate-200 leading-none flex items-center gap-1.5">
                                  <span>{eq.localizacion}</span>
                                  {isCritical && (
                                    <span className="text-[8px] bg-rose-950 text-rose-400 border border-rose-900/40 px-1 py-0.5 rounded font-black font-mono tracking-tight uppercase animate-pulse">
                                      CRÍTICO
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono leading-none flex items-center gap-1.5">
                                  <Clock size={9} />
                                  <span>{new Date(eq.time).toISOString().replace('T', ' ').slice(0, 19)}</span>
                                  <span>•</span>
                                  <span>Prof: {eq.depthKm} km</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right font-mono text-[10px]">
                                <div className="text-emerald-400 font-black">{eq.calculatedDist.toFixed(1)} km</div>
                                <div className="text-slate-500 text-[8px] uppercase">Distancia</div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRelocate(eq.latitude, eq.longitude);
                                }}
                                className="p-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-900 hover:border-slate-800 rounded text-slate-400 hover:text-rose-400 cursor-pointer transition-all animate-none"
                                title="Centrar mapa de radar"
                              >
                                <Compass size={12} />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-slate-500 italic text-xs border border-dashed border-slate-900 rounded-lg">
                        No se han encontrado sismos que cumplan los filtros actuales en el rango de búsqueda o de preferencia visual.
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {selectedEarthquake && (
                    <motion.div
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="md:col-span-5 bg-slate-900/60 border border-slate-850 rounded-lg p-3 flex flex-col gap-3 relative shadow-inner animate-fade-in"
                    >
                      <button
                        onClick={() => setSelectedEarthquakeId(null)}
                        className="absolute top-2 right-2 p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-950 cursor-pointer transition-colors"
                        title="Cerrar detalles"
                      >
                        <X size={13} />
                      </button>

                      <div className="space-y-1">
                        <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider block">Detalle de Evento</span>
                        <h4 className="font-sans font-black text-slate-200 text-xs leading-snug pr-4">{selectedEarthquake.localizacion}</h4>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] leading-relaxed font-mono">
                        <div className="bg-slate-950/60 border border-slate-900 p-2 rounded">
                          <span className="text-slate-500 block text-[8px] uppercase font-bold">Magnitud</span>
                          <span className="text-rose-300 font-black">
                            M {selectedEarthquake.magnitud.toFixed(1)} <span className="text-[8px] text-slate-500">{selectedEarthquake.magType || 'Mw'}</span>
                          </span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-900 p-2 rounded">
                          <span className="text-slate-500 block text-[8px] uppercase font-bold">Profundidad</span>
                          <span className="text-slate-200 font-bold">{selectedEarthquake.depthKm} km</span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-900 p-2 rounded col-span-2">
                          <span className="text-slate-500 block text-[8px] uppercase font-bold">Coordenadas Exactas</span>
                          <span className="text-slate-200 font-bold flex items-center gap-1.5">
                            <MapPin size={9} className="text-rose-500/70" />
                            <span>{selectedEarthquake.latitude.toFixed(4)}° N, {selectedEarthquake.longitude.toFixed(4)}° E</span>
                          </span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-900 p-2 rounded col-span-2">
                          <span className="text-slate-500 block text-[8px] uppercase font-bold">Fecha / Hora (UTC)</span>
                          <span className="text-slate-200 font-bold flex items-center gap-1.5">
                            <Clock size={9} className="text-slate-500" />
                            <span>{new Date(selectedEarthquake.time).toISOString().replace('T', ' ').slice(0, 19)}</span>
                          </span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-900 p-2 rounded col-span-2 flex justify-between items-center">
                          <div>
                            <span className="text-slate-500 block text-[8px] uppercase font-bold">Distancia Calculada</span>
                            <span className="text-emerald-400 font-black">{selectedEarthquake.calculatedDist.toFixed(1)} km</span>
                          </div>
                          <button
                            onClick={() => onRelocate(selectedEarthquake.latitude, selectedEarthquake.longitude)}
                            className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
                            title="Centrar mapa en este seísmo"
                          >
                            <Compass size={11} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-1 space-y-1.5">
                        <a
                          href={`https://www.ign.es/web/ign/portal/sis-catalogo-terremotos/-/sis-catalogo-terremotos/getDetallesTerremoto?eventoId=${selectedEarthquake.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 text-rose-300 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <ExternalLink size={11} />
                          <span>Ver Ficha Oficial IGN</span>
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* COL 2: IGN COBERTURA FILTER AND SCRIPT REPORT (5 COLS) */}
          <div className="lg:col-span-5 flex flex-col gap-4 animate-fade-in">
            {/* STATIONS CONTROLS */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="border-b border-slate-900 pb-2">
                <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider block">Filtro de Cobertura y GPSD</span>
                <h3 className="font-sans font-extrabold text-sm text-slate-200">Parámetros del Detector</h3>
              </div>

              {/* Mode switch */}
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-slate-900/30 p-2 rounded border border-slate-900">
                  <span className="text-xs font-bold text-slate-300">Usar Coordenadas Reales GPSD</span>
                  <input
                    type="checkbox"
                    checked={useGps}
                    onChange={(e) => setUseGps(e.target.checked)}
                    className="accent-rose-500 rounded h-3.5 w-3.5 bg-slate-950 border-slate-800 cursor-pointer"
                  />
                </div>

                {/* GPS Status indicators */}
                {useGps ? (
                  <div className="bg-slate-900/50 border border-slate-900 p-2.5 rounded space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-mono leading-none">
                      <span className="text-slate-500 uppercase">Estado Demonio GPSD:</span>
                      {gpsd && gpsd.mode >= 2 ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          CONECTADO [MODO {gpsd.mode}D FIX]
                        </span>
                      ) : (
                        <span className="text-amber-500 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          CONECTADO [FALLBACK/NO FIX]
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                      <div>Latitud: <span className="text-slate-200 font-bold">{currentLat.toFixed(6)}</span></div>
                      <div>Longitud: <span className="text-slate-200 font-bold">{currentLon.toFixed(6)}</span></div>
                      <div>Satélites: <span className="text-slate-200 font-bold">{(gpsd?.satellitesUsed || 0)}/{(gpsd?.satellitesVisible || 0)}</span></div>
                      <div>Dispositivo: <span className="text-slate-400 font-bold truncate max-w-[120px] inline-block align-bottom">{(gpsd?.device || 'comar_com')}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/50 border border-slate-900 p-2.5 rounded space-y-2">
                    <div className="text-[9px] text-amber-400 font-bold uppercase leading-none mb-1">
                      ⚠️ Configuración Manual de Respaldo Activa
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-500 font-mono uppercase block">Latitud Estación:</label>
                        <input
                          type="text"
                          value={manualLat}
                          onChange={(e) => setManualLat(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs p-1 rounded outline-none focus:border-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] text-slate-500 font-mono uppercase block">Longitud Estación:</label>
                        <input
                          type="text"
                          value={manualLon}
                          onChange={(e) => setManualLon(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs p-1 rounded outline-none focus:border-slate-700"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Radio Maximo Selector Dropdown */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[10px] font-mono leading-none">
                  <span className="text-slate-400">RADIO DE VISUALIZACIÓN:</span>
                  <span className="font-bold text-rose-400 font-mono">{maxRadioKm.toFixed(0)} km</span>
                </div>
                
                <select
                  value={[50, 100, 150, 200, 300, 500].includes(maxRadioKm) ? maxRadioKm.toString() : 'custom'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== 'custom') {
                      setMaxRadioKm(parseInt(val));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded p-1.5 focus:outline-none focus:border-rose-500 cursor-pointer"
                  id="ign-proximity-radius-select"
                >
                  <option value="50">🟢 50 km (Urbano / Muy Próximo)</option>
                  <option value="100">🟡 100 km (Regional / Corto Alcance)</option>
                  <option value="150">🟠 150 km (Estándar RSN / Recomendado)</option>
                  <option value="200">🔴 200 km (Medio / Media Distancia)</option>
                  <option value="300">🚨 300 km (Amplio / Cobertura Extendida)</option>
                  <option value="500">🌌 500 km (Máximo / Península Completa)</option>
                  <option value="custom">⚙️ Ajuste Fino (Usar barra abajo)...</option>
                </select>

                <div className="pt-0.5">
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="5"
                    value={maxRadioKm}
                    onChange={(e) => setMaxRadioKm(parseInt(e.target.value))}
                    className="w-full accent-rose-500 h-1 bg-slate-900 rounded cursor-pointer"
                    title="Ajuste fino de radio de cobertura"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-0.5">
                    <span>Min: 10 km</span>
                    <span>Max: 500 km</span>
                  </div>
                </div>
              </div>

              {/* Min Magnitude filter */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono leading-none">
                  <span className="text-slate-400">MIN. MAGNITUD DETECCIÓN:</span>
                  <span className="font-bold text-slate-200">M {minMagFilter.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="6.0"
                  step="0.5"
                  value={minMagFilter}
                  onChange={(e) => setMinMagFilter(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 h-1 bg-slate-900 rounded cursor-pointer"
                />
              </div>

              {/* Umbral de Alerta de Alta Prioridad */}
              <div className="space-y-2 border-t border-slate-900 pt-3">
                <div className="flex justify-between items-center text-[10px] font-mono leading-none">
                  <span className="text-rose-400 font-bold uppercase">UMBRAL ALERTA PRIORIDAD ALTA:</span>
                  <span className="font-bold text-rose-300 font-mono">M ≥ {highPriorityThreshold.toFixed(1)}</span>
                </div>
                
                <select
                  value={highPriorityThreshold.toString()}
                  onChange={(e) => setHighPriorityThreshold(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded p-1.5 focus:outline-none focus:border-rose-500 cursor-pointer"
                  id="high-priority-threshold-select"
                >
                  <option value="2.5">🟢 M ≥ 2.5 (Leve - Muy Sensible)</option>
                  <option value="3.0">🟢 M ≥ 3.0 (Moderado - Estándar)</option>
                  <option value="3.5">🟡 M ≥ 3.5 (Intermedio / Rango Alerta)</option>
                  <option value="4.0">🟠 M ≥ 4.0 (Fuerte / Riesgo Local)</option>
                  <option value="4.5">🔴 M ≥ 4.5 (Peligroso / Daño Potencial)</option>
                  <option value="5.0">🚨 M ≥ 5.0 (Severo / Evacuación)</option>
                </select>

                <div className="flex gap-2 pt-0.5">
                  <button
                    onClick={simulateHighPriorityAlert}
                    className="flex-1 text-[9.5px] font-mono bg-rose-950/40 border border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-950/60 text-rose-300 hover:text-white py-1 px-2 rounded transition-all cursor-pointer flex items-center justify-center gap-1"
                    title="Simular un sismo que supere el umbral dentro del radio para probar la alerta visual"
                  >
                    <Zap size={10} className="animate-pulse text-rose-400" />
                    <span>Probar Alerta Visual</span>
                  </button>
                  
                  {ignHighAlerts.length > 0 && (
                    <button
                      onClick={() => setIgnHighAlerts([])}
                      className="text-[9.5px] font-mono bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200 py-1 px-2 rounded transition-all cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* MONITOR DE DISTANCIA A SEÍSMOS EN TIEMPO REAL */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="border-b border-slate-900 pb-2 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">Estación de Monitoreo GPSD</span>
                  <h3 className="font-sans font-extrabold text-sm text-slate-200">Distancias a Seísmos Activos</h3>
                </div>
                <div className="text-[9px] bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-0.5 rounded font-mono uppercase tracking-wider">
                  Radio: {maxRadioKm} km
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-normal">
                Análisis de proximidad instantánea respecto a la antena receptora. Los eventos ubicados por debajo del radio configurado (<strong className="text-red-400 font-bold">{maxRadioKm} km</strong>) se resaltan en rojo pulsante.
              </p>

              <div className="space-y-2.5 max-h-[225px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent pr-1">
                {processedEarthquakes.length > 0 ? (
                  [...processedEarthquakes]
                    .sort((a, b) => a.calculatedDist - b.calculatedDist)
                    .slice(0, 5)
                    .map((eq, idx) => {
                      const isUnderRadius = eq.calculatedDist <= maxRadioKm;
                      return (
                        <div 
                          key={eq.id || idx}
                          className={`border rounded-lg p-2.5 transition-all flex flex-col gap-2 ${
                            isUnderRadius
                              ? 'bg-red-950/25 border-red-500/35 text-red-100 shadow-[0_0_12px_rgba(239,68,68,0.12)] animate-pulse'
                              : 'bg-slate-900/30 border-slate-900/60 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUnderRadius ? 'bg-red-500 animate-ping' : 'bg-slate-500'}`} />
                              <span className="font-bold text-slate-100 truncate text-[10.5px] font-sans">{eq.localizacion}</span>
                            </div>
                            <span className={`text-[9.5px] font-black px-1.5 py-0.5 rounded font-mono shrink-0 ${
                              isUnderRadius
                                ? 'bg-red-950/80 border border-red-500/40 text-red-300'
                                : 'bg-slate-950 border border-slate-850 text-slate-400'
                            }`}>
                              M {eq.magnitud.toFixed(1)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[9.5px] font-mono leading-none">
                            <div className="text-slate-500 flex items-center gap-1">
                              <Clock size={9} />
                              <span>{new Date(eq.time).toISOString().replace('T', ' ').slice(11, 19)} UTC</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500 uppercase text-[8px]">Rango:</span>
                              <strong className={`text-[10px] ${isUnderRadius ? 'text-red-400 font-black' : 'text-emerald-400'}`}>
                                {eq.calculatedDist.toFixed(1)} km
                              </strong>
                            </div>
                          </div>

                          {/* Visual Distance Progress Track */}
                          <div className="space-y-1.5 mt-1">
                            <div className="w-full bg-slate-950 h-2 rounded-full relative overflow-hidden border border-slate-900/80 flex items-center">
                              {/* Warning radio shade on the track */}
                              <div 
                                className="absolute left-0 top-0 h-full bg-red-500/10 border-r border-red-500/20"
                                style={{ width: `${Math.min(100, (maxRadioKm / 350) * 100)}%` }}
                              />
                              
                              {/* Earthquake marker dot */}
                              <div 
                                className={`absolute h-2 w-2 rounded-full top-0 -ml-1 transition-all duration-300 ${
                                  isUnderRadius 
                                    ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]' 
                                    : 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                                }`}
                                style={{ left: `${Math.min(100, (eq.calculatedDist / 350) * 100)}%` }}
                              />

                              {/* Station coordinate origin dot at 0% */}
                              <div className="absolute left-0 h-full w-1 bg-blue-500" title="Antena de la Estación (0 km)" />
                            </div>

                            <div className="flex justify-between text-[7.5px] text-slate-500 font-mono leading-none">
                              <span className="text-blue-400 font-bold">0 km (Estación)</span>
                              <span className="text-red-400/80">Límite Alerta: {maxRadioKm} km</span>
                              <span>350+ km</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="py-6 text-center text-slate-500 italic text-xs border border-dashed border-slate-900 rounded-lg">
                    Sin datos geográficos disponibles para calcular proximidades.
                  </div>
                )}
              </div>
            </div>

            {/* SCRIPT EMULATION OUTPUT (THE REPLICATED TERMINAL REPORT CARD) */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md relative overflow-hidden flex-1">
              <div className="border-b border-slate-900 pb-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Terminal de Detección IGN</span>
                <h3 className="font-sans font-extrabold text-sm text-slate-200">Último Seísmo Cercano</h3>
              </div>

              {nearestEarthquake ? (
                <div className="flex flex-col gap-3 flex-1 justify-between">
                  {/* Styled like a telemetry report */}
                  <motion.div 
                    className="bg-slate-900/40 border border-rose-950/50 rounded-lg p-3.5 font-mono text-xs text-slate-300 space-y-2 relative"
                    animate={nearestEarthquake.magnitud >= userThreshold ? {
                      borderColor: ["rgba(239, 68, 68, 0.2)", "rgba(239, 68, 68, 0.85)", "rgba(239, 68, 68, 0.2)"],
                      boxShadow: [
                        "0 0 0px rgba(239, 68, 68, 0)",
                        "0 0 12px rgba(239, 68, 68, 0.45)",
                        "0 0 0px rgba(239, 68, 68, 0)"
                      ],
                      backgroundColor: ["rgba(15, 23, 42, 0.4)", "rgba(127, 29, 29, 0.25)", "rgba(15, 23, 42, 0.4)"]
                    } : {}}
                    transition={nearestEarthquake.magnitud >= userThreshold ? {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    } : undefined}
                  >
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      {nearestEarthquake.magnitud >= userThreshold && (
                        <span className="text-[8px] bg-red-950 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded uppercase font-black font-mono animate-pulse">
                          Peligro
                        </span>
                      )}
                      <span className="text-[8px] bg-rose-950 text-rose-400 border border-rose-900 px-1.5 py-0.5 rounded uppercase font-bold tracking-tight">
                        EN COBERTURA
                      </span>
                    </div>
                    
                    <div className="text-rose-400 font-black border-b border-slate-800 pb-1.5 uppercase text-[10.5px]">
                      === ÚLTIMO SEÍSMO DETECTADO A MENOS DE {maxRadioKm.toFixed(0)} KM ===
                    </div>
                    <div className="space-y-1 pt-1 leading-normal">
                      <div><span className="text-slate-500 uppercase">Ubicación:</span> <strong className="text-slate-100">{nearestEarthquake.localizacion}</strong></div>
                      <div><span className="text-slate-500 uppercase">Fecha/Hora (UTC):</span> <span className="text-slate-200 font-bold">{new Date(nearestEarthquake.time).toISOString().replace('T', ' ').slice(0, 19)}</span></div>
                      <div><span className="text-slate-500 uppercase">Magnitud:</span> <span className={`${nearestEarthquake.magnitud >= userThreshold ? 'text-red-400 animate-pulse' : 'text-rose-400'} font-black`}>M {nearestEarthquake.magnitud.toFixed(1)}</span></div>
                      <div><span className="text-slate-500 uppercase">Profundidad:</span> <span className="text-slate-200">{nearestEarthquake.depthKm} km</span></div>
                      <div><span className="text-slate-500 uppercase">Distancia:</span> <strong className="text-emerald-400">{nearestEarthquake.calculatedDist.toFixed(2)} km</strong></div>
                    </div>
                  </motion.div>

                  <div className="space-y-2">
                    <a
                      href={`https://www.ign.es/web/ign/portal/sis-catalogo-terremotos/-/sis-catalogo-terremotos/getDetallesTerremoto?eventoId=${nearestEarthquake.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 text-rose-300 text-[11px] font-bold rounded flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <ExternalLink size={13} />
                      <span>Ver Ficha Oficial en el IGN</span>
                    </a>

                      <button
                        onClick={() => onRelocate(nearestEarthquake.latitude, nearestEarthquake.longitude)}
                        className="w-full py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Compass size={12} />
                        <span>Centrar Radar</span>
                      </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-900 rounded-lg bg-slate-900/10 flex-1 justify-center">
                  <AlertTriangle size={24} className="text-slate-600 mb-2" />
                  <div className="text-slate-400 font-mono text-[11px] font-bold uppercase mb-1">
                    === ESTADO COBERTURA SÍSMICA ===
                  </div>
                  <p className="text-slate-500 font-mono text-[10px] leading-relaxed max-w-[280px]">
                    No se ha registrado ningún seísmo de magnitud ≥{minMagFilter.toFixed(1)} a menos de {maxRadioKm} km en la ventana de análisis.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : subTab === 'analysis' ? (
        <>
          {/* 2. DYNAMIC SCIENCE METRICS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Metric 1: Total Events */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex items-center gap-3">
              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-lg text-rose-400">
                <Activity size={18} />
              </div>
              <div className="font-mono text-xs">
                <span className="text-[8px] text-slate-500 uppercase block leading-none mb-0.5">Catálogo Sismicidad</span>
                <span className="text-lg font-black text-slate-100">{stats.total} sismos</span>
                <span className="text-[8px] text-slate-400 block mt-0.5">Analizados en ventana</span>
              </div>
            </div>

            {/* Metric 2: Max Magnitude */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex items-center gap-3">
              <div className={`p-3 rounded-lg border text-amber-400 ${stats.maxMagnitude >= 3.5 ? 'bg-amber-950/30 border-amber-500/30 animate-pulse' : 'bg-slate-900 border-slate-800'}`}>
                <AlertTriangle size={18} />
              </div>
              <div className="font-mono text-xs overflow-hidden">
                <span className="text-[8px] text-slate-500 uppercase block leading-none mb-0.5">Magnitud Máxima</span>
                <span className={`text-lg font-black ${stats.maxMagnitude >= 3.5 ? 'text-amber-400' : 'text-slate-100'}`}>
                  M {stats.maxMagnitude.toFixed(1)}
                </span>
                <span className="text-[8px] text-slate-400 block mt-0.5 truncate uppercase">
                  {stats.maxSismo ? stats.maxSismo.localizacion : 'Península'}
                </span>
              </div>
            </div>

            {/* Metric 3: Total Energy released */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex items-center gap-3">
              <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg text-red-400">
                <Zap size={18} />
              </div>
              <div className="font-mono text-xs">
                <span className="text-[8px] text-slate-500 uppercase block leading-none mb-0.5">Energía Sísmica Liberada</span>
                <span className="text-lg font-black text-slate-100">
                  {stats.totalEnergyTntEquivalentTonnes >= 1000 
                    ? `${(stats.totalEnergyTntEquivalentTonnes / 1000).toFixed(2)} kT`
                    : `${stats.totalEnergyTntEquivalentTonnes.toFixed(1)} t`
                  } TNT
                </span>
                <span className="text-[8px] text-slate-400 block mt-0.5 font-sans">
                  Equiv: ~{stats.totalEnergyJoules.toExponential(2)} J
                </span>
              </div>
            </div>

            {/* Metric 4: Earthquakes felt by public */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex items-center gap-3">
              <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-lg text-blue-400">
                <Layers size={18} />
              </div>
              <div className="font-mono text-xs">
                <span className="text-[8px] text-slate-500 uppercase block leading-none mb-0.5">Eventos Sentidos / Críticos</span>
                <span className="text-lg font-black text-blue-400">
                  {stats.feltCount} sismos
                </span>
                <span className="text-[8px] text-slate-400 block mt-0.5">
                  M &gt;= 3.0 / Reportó población
                </span>
              </div>
            </div>
          </div>

          {/* 3. FOCUS: RELEVANT RECENT EVENT CARD */}
          {stats.maxSismo && (() => {
            const isCritical = stats.maxSismo.magnitud >= userThreshold;
            return (
              <motion.div 
                className="bg-slate-950 border border-red-950/80 rounded-xl p-4 flex flex-col md:flex-row items-stretch gap-4"
                animate={isCritical ? {
                  borderColor: ["rgba(239, 68, 68, 0.25)", "rgba(239, 68, 68, 0.9)", "rgba(239, 68, 68, 0.25)"],
                  boxShadow: [
                    "0 0 0px rgba(239, 68, 68, 0)",
                    "0 0 14px rgba(239, 68, 68, 0.45)",
                    "0 0 0px rgba(239, 68, 68, 0)"
                  ],
                  backgroundColor: ["rgba(2, 6, 23, 1)", "rgba(127, 29, 29, 0.15)", "rgba(2, 6, 23, 1)"]
                } : {}}
                transition={isCritical ? {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                } : undefined}
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      Sismo de Mayor Intensidad en el Intervalo {isCritical && "(UMBRAL SUPERADO)"}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-xl font-black text-slate-100 font-sans tracking-tight">
                      {stats.maxSismo.localizacion}
                    </h2>
                    <span className="px-2.5 py-0.5 text-base font-black font-mono bg-red-950 text-red-400 border border-red-500/30 rounded mt-1">
                      M {stats.maxSismo.magnitud.toFixed(1)} {stats.maxSismo.magType}
                    </span>
                  </div>

                  <p className="text-slate-400 font-serif leading-relaxed text-[11px]">
                    Detectado a una profundidad de <strong className="text-slate-300">{stats.maxSismo.depthKm.toFixed(1)} km</strong> de la corteza terrestre, a una distance radial de <strong className="text-slate-300">{stats.maxSismo.distanciaKm.toFixed(1)} km</strong> de su central terminal de telecomunicaciones. Representa el evento sísmico más influyente registrado recientemente.
                  </p>
                </div>

                <div className="shrink-0 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-900 pt-3 md:pt-0 md:pl-4 min-w-[200px] justify-center md:items-end gap-2.5">
                  <div className="text-right">
                    <span className="text-[8px] text-slate-500 uppercase block leading-none">Fecha de Registro UT</span>
                    <span className="text-[11px] text-slate-300 block font-mono mt-0.5">
                      {stats.maxSismo.time.replace('T', ' ').slice(0, 19)} UTC
                    </span>
                  </div>
                  
                  <button
                    onClick={() => onRelocate(stats.maxSismo!.latitude, stats.maxSismo!.longitude)}
                    className="w-full md:w-auto px-4 py-2 bg-red-950 hover:bg-red-900 text-red-200 border border-red-500/30 hover:border-red-500/50 rounded-lg font-sans font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Compass size={12} />
                    <span>Centrar Radar en Epicentro</span>
                  </button>
                </div>
              </motion.div>
            );
          })()}

          {/* 4. ANALYTICAL CHARTS AREA - BENTO GRID DESIGN */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* CHART 1: TIMELINE DE FRECUENCIA SÍSMICA */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">Fluctuación Temporal</span>
                  <h3 className="font-sans font-extrabold text-sm text-slate-200">Frecuencia Sísmica Recente (Evolución Diaria)</h3>
                </div>
                <Clock size={15} className="text-slate-500" />
              </div>

              <div className="h-[210px] w-full pt-2">
                {temporalChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <AreaChart data={temporalChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorWave" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="label" 
                        stroke="#475569" 
                        fontSize={9} 
                        fontFamily="monospace"
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="#475569" 
                        fontSize={9} 
                        fontFamily="monospace"
                        tickLine={false}
                        name="Terremotos"
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '10px', fontFamily: 'monospace' }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="sismos" 
                        name="Seísmos/Día" 
                        stroke="#f43f5e" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorWave)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 italic">No hay histórico suficiente.</div>
                )}
              </div>
              
              <div className="text-[9px] text-slate-500 bg-slate-900/30 p-2 rounded border border-slate-900 leading-normal">
                ⚙️ <strong>Análisis Temporal:</strong> El gráfico registra el recuento absoluto de eventos sismográficos localizados por día, permitiendo detectar enjambres sísmicos (secuencias continuadas de microsismos motivadas por reajustes de esfuerzos).
              </div>
            </div>

            {/* CHART 2: REGIONES SÍSMICAS DE LA RED */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">Análisis Provincial y Regional</span>
                  <h3 className="font-sans font-extrabold text-sm text-slate-200">Zonas de Mayor Actividad Tectónica Reciente</h3>
                </div>
                <MapPin size={15} className="text-slate-500" />
              </div>

              <div className="h-[210px] w-full pt-2">
                {zoneChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <BarChart data={zoneChartData} layout="vertical" margin={{ top: 5, right: 15, left: 30, bottom: 5 }}>
                      <XAxis 
                        type="number" 
                        stroke="#475569" 
                        fontSize={9} 
                        fontFamily="monospace"
                        tickLine={false}
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        stroke="#94a3b8" 
                        fontSize={9} 
                        fontFamily="monospace"
                        tickLine={false}
                        width={70}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '10px', fontFamily: 'monospace' }}
                      />
                      <Bar dataKey="count" name="Número Sismos" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        {zoneChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 italic">Datos insuficientes para zonificación.</div>
                )}
              </div>

              <div className="text-[9px] text-slate-500 bg-slate-900/30 p-2 rounded border border-slate-900 leading-normal">
                🗺️ <strong>Zonificación Sísmica:</strong> Las áreas con mayor incidencia sísmica corresponden históricamente al contacto entre la Placa Antártica/Euroasiática y los complejos deformacionales de la Microplaca de Alborán o el vulcanismo activo de las Islas Canarias.
              </div>
            </div>

            {/* CHART 3: DISTRIBUCIÓN DE MAGNITUDES (HISTOGRAM) */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Gama de Magnitudes</span>
                  <h3 className="font-sans font-extrabold text-sm text-slate-200">Segmentación por Magnitud (Gutenberg-Richter)</h3>
                </div>
                <Layers size={15} className="text-slate-500" />
              </div>

              <div className="h-[210px] w-full pt-2 flex flex-col sm:flex-row items-center justify-center">
                {earthquakes.length > 0 ? (
                  <>
                    <div className="w-full sm:w-[50%] h-full">
                      <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                        <PieChart>
                          <Pie
                            data={magnitudeChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {magnitudeChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '10px', fontFamily: 'monospace' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full sm:w-[50%] space-y-2 mt-4 sm:mt-0 font-mono text-[10px]">
                      {magnitudeChartData.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-slate-300">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                            <span>{m.name}</span>
                          </div>
                          <span className="font-black font-mono text-slate-100">{m.value} ({((m.value / earthquakes.length) * 100).toFixed(0)}%)</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 italic">No hay sismos para reportar magnitud.</div>
                )}
              </div>

              <div className="text-[9px] text-slate-500 bg-slate-900/30 p-2 rounded border border-slate-900 leading-normal">
                📈 <strong>Ley de Magnitudes:</strong> La ley de Gutenberg-Richter indica de manera empírica que por cada sismo de magnitud $M$ habrán cerca de 10 terremotos de magnitud $M-1$. Un aumento desproporcionado de moderados indica anomalía.
              </div>
            </div>

            {/* CHART 4: PROFUNDIDAD DE EMBLEMAS */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider block">Hipocentro Terrestre</span>
                  <h3 className="font-sans font-extrabold text-sm text-slate-200">Distribución de Focos de Profundidad</h3>
                </div>
                <Info size={15} className="text-slate-500" />
              </div>

              <div className="h-[210px] w-full pt-2">
                {earthquakes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <BarChart data={depthChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <XAxis 
                        dataKey="name" 
                        stroke="#475569" 
                        fontSize={8} 
                        fontFamily="monospace"
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="#475569" 
                        fontSize={9} 
                        fontFamily="monospace"
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '10px', fontFamily: 'monospace' }}
                      />
                      <Bar dataKey="count" name="Sismos detectados">
                        {depthChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 italic">No hay sismos para reportar sismicidad profunda.</div>
                )}
              </div>

              <div className="text-[9px] text-slate-500 bg-slate-900/30 p-2 rounded border border-slate-900 leading-normal">
                🌍 <strong>Profundidad:</strong> Los sismos muy superficiales (&lt; 10 km) liberan energía directamente sobre el plano social, siendo más destructivos a magnitudes similares, mientras que los profundos disipan energía en la litosfera.
              </div>
            </div>

          </div>

          {/* 5. EDUCATIONAL AND INFORMATIONAL BANNER */}
          <div className="bg-rose-950/20 border border-rose-500/25 p-4 rounded-xl flex flex-col md:flex-row items-stretch justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-sans font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <Info size={14} className="text-rose-400" />
                Vínculo Informativo con el Sistema eTraffic de Terremotos del IGN
              </h4>
              <p className="text-[11px] text-slate-400 font-serif leading-relaxed">
                La plataforma oficial del <strong className="text-slate-300">Instituto Geográfico Nacional (IGN)</strong> permite consultar el catálogo sísmico completo, calcular la atenuación sísmica esperada en base al terreno local, rellenar cuestionarios macrosísmicos si ha sentido un temblor, y descargar la sismografía del registro instrumental.
              </p>
            </div>
            
            <div className="shrink-0 flex items-center">
              <a
                href="https://indicadores-terremotos.ign.es/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full md:w-auto px-4 py-2 bg-rose-950 border border-rose-400/40 text-rose-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-sans font-bold select-none cursor-pointer transition-colors"
              >
                <span>Acceder Completo indicators-terremotos.ign.es</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </>
      ) : (
        /* VISOR DE TERREMOTOS PRÓXIMOS (IGN) INTEGRADO EN IFRAME */
        <div className="flex flex-col gap-4 animate-fade-in" id="ign-tproximos-visor-container">
          
          {/* INFORMATION CARD FOR RSN INTEGRATION */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-900/60">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <span className="text-slate-200 font-bold uppercase tracking-wider text-[10px] font-mono flex items-center gap-1.5">
                  <Map size={12} className="text-rose-400" />
                  Cartografía en Tiempo Real: Red de Estaciones Sismológicas
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-rose-950 text-rose-300 border border-rose-800 text-[8.5px] font-mono px-2 py-0.5 rounded uppercase tracking-tight">
                  Servicio Oficial IGN
                </span>
              </div>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed font-serif">
              Integración nativa del visor cartográfico interactivo <strong className="text-slate-300">"tproximos"</strong> del Instituto Geográfico Nacional (IGN). Esta consola mapea en tiempo real los últimos sismos localizados por la red de sensores geofísicos, permitiendo análisis espacial, cálculo macrosísmico, y visualización tridimensional de fallas geológicas.
            </p>
            
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <a 
                href="https://visualizadores.ign.es/tproximos" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-rose-950 hover:bg-rose-900 border border-rose-400/40 hover:border-rose-400/60 text-rose-300 hover:text-white px-3.5 py-1.5 rounded-lg text-[10px] font-sans font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Maximizar Visor Sismográfico</span>
                <ExternalLink size={11} />
              </a>
              <span className="text-[9.5px] text-slate-500 font-mono">
                Puerto Ingress Externo: <code className="text-slate-400 break-all select-all">https://visualizadores.ign.es/tproximos</code>
              </span>
            </div>
          </div>

          {/* DYNAMIC IFRAME STAGE WITH GRACEFUL FALLBACKS AND LOADER */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-2xl relative flex flex-col">
            <div className="bg-slate-900/40 p-2.5 px-4 flex items-center justify-between border-b border-slate-900 font-sans text-xs">
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <Globe size={13} className="text-rose-400 animate-pulse" />
                <span className="text-slate-300 font-bold uppercase">IGN visualizadores - tproximos (AX.25 UI Link ready)</span>
              </div>
              <span className="text-[9px] bg-slate-950 border border-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded">
                SECURE SANDBOXED FRAME
              </span>
            </div>

            <div className="w-full h-[650px] relative bg-slate-950">
              <iframe
                src="https://visualizadores.ign.es/tproximos"
                title="Instituto Geográfico Nacional - Visor de Terremotos Próximos"
                className="w-full h-full border-none rounded-b-xl"
                allow="geolocation; camera; microphone"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          
          {/* HELPFUL TIPS FOOTER */}
          <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-lg text-[10px] text-slate-500 font-mono leading-relaxed flex items-start gap-2">
            <Info size={13} className="text-slate-400 mt-0.5 shrink-0" />
            <div>
              <strong>Diagnóstico de Red:</strong> Para que este visor renderice correctamente, su navegador debe permitir la carga de recursos cifrados desde dominios oficiales españoles (<code className="text-rose-400/80">ign.es</code>). Si el panel aparece en blanco o bloqueado por políticas de protección de frames del navegador (Content Security Policy), haga clic en <strong>"Maximizar Visor Sismográfico"</strong> en el panel superior para operarlo de forma externa.
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
