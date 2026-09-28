import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { 
  Waves, 
  Sun, 
  Zap, 
  AlertTriangle, 
  Bell, 
  BellOff, 
  TrendingUp, 
  Calendar, 
  ShieldCheck, 
  CheckCircle,
  HelpCircle,
  Clock,
  Radio,
  XCircle,
  Wifi,
  WifiOff,
  Search,
  Filter,
  Check,
  Send,
  Volume2,
  VolumeX,
  BellRing,
  Settings,
  Sliders,
  ShieldAlert
} from 'lucide-react';
import { PropagationData } from '../../types';

// Band propagation condition helper (standard HamClock feature)
function getBandStatusText(band: string, sfi: number, kp: number) {
  const isStorm = kp >= 4.5;
  if (isStorm) {
    return { text: "RUIDO/MALA", color: "text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-mono" };
  }
  
  if (band === "80m" || band === "40m") {
    return {
      day: { text: "POBRE", color: "text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: { text: "EXCELENTE", color: "text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold animate-pulse" }
    };
  } else if (band === "20m") {
    return {
      day: sfi > 90 ? { text: "EXCELENTE", color: "text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold animate-pulse" } : { text: "BUENA", color: "text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: sfi > 110 ? { text: "BUENA", color: "text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono" } : { text: "REGULAR", color: "text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded text-[10px] font-mono" }
    };
  } else if (band === "15m") {
    return {
      day: sfi > 120 ? { text: "EXCELENTE", color: "text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-mono" } : sfi > 95 ? { text: "BUENA", color: "text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono" } : { text: "POBRE", color: "text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: { text: "CERRADO", color: "text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono" }
    };
  } else { // 10m
    return {
      day: sfi > 130 ? { text: "EXCELENTE", color: "text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-mono" } : sfi > 110 ? { text: "BUENA", color: "text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono" } : { text: "CERRADO", color: "text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: { text: "CERRADO", color: "text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono" }
    };
  }
}

export function getUvDetailedStyle(uvVal: number | string | undefined) {
  const val = typeof uvVal === 'number' ? uvVal : parseFloat(uvVal || '0') || 0;
  if (val <= 2) {
    return {
      text: "Bajo",
      pantone: "PMS 375",
      rgb: "(142, 211, 0)",
      hex: "#8ED300",
      textColor: "text-[#8ED300]",
      bgColor: "bg-[#8ED300]",
      badgeClass: "bg-[#8ED300]/10 text-[#8ED300] border-[#8ED300]/30",
    };
  } else if (val <= 5) {
    return {
      text: "Moderado",
      pantone: "PMS 102",
      rgb: "(255, 242, 0)",
      hex: "#FFF200",
      textColor: "text-amber-500", // using high contrast amber for readability on light/white, but keeping hex/rgb
      bgColor: "bg-[#FFF200]",
      badgeClass: "bg-[#FFF200]/20 text-amber-700 border-yellow-400/50",
    };
  } else if (val <= 7) {
    return {
      text: "Alto",
      pantone: "PMS 151",
      rgb: "(255, 127, 0)",
      hex: "#FF7F00",
      textColor: "text-[#FF7F00]",
      bgColor: "bg-[#FF7F00]",
      badgeClass: "bg-[#FF7F00]/10 text-[#FF7F00] border-[#FF7F00]/30",
    };
  } else if (val <= 10) {
    return {
      text: "Muy Alto",
      pantone: "PMS 032",
      rgb: "(238, 28, 37)",
      hex: "#EE1C25",
      textColor: "text-[#EE1C25]",
      bgColor: "bg-[#EE1C25]",
      badgeClass: "bg-[#EE1C25]/10 text-[#EE1C25] border-[#EE1C25]/30",
    };
  } else {
    return {
      text: "Extremadamente Alto",
      pantone: "PMS 265",
      rgb: "(146, 75, 159)",
      hex: "#924B9F",
      textColor: "text-[#924B9F]",
      bgColor: "bg-[#924B9F]",
      badgeClass: "bg-[#924B9F]/10 text-[#924B9F] border-[#924B9F]/30",
    };
  }
}

export function getKpStyle(kp: number) {
  if (kp <= 1.5) {
    return {
      text: "Calmo",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (kp <= 3.5) {
    return {
      text: "Inquieto",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else if (kp <= 4.5) {
    return {
      text: "Activo",
      textColor: "text-orange-600",
      badgeClass: "bg-orange-50 text-orange-700 border-orange-200"
    };
  } else {
    return {
      text: "Tormenta",
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  }
}

export function getSfiStyle(sfi: number) {
  if (sfi <= 90) {
    return {
      text: "Bajo",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (sfi <= 150) {
    return {
      text: "Moderado",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      text: "Elevado",
      textColor: "text-orange-600",
      badgeClass: "bg-orange-50 text-orange-700 border-orange-200"
    };
  }
}

export function getSsnStyle(ssn: number) {
  if (ssn <= 30) {
    return {
      text: "Bajo",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (ssn <= 100) {
    return {
      text: "Moderado",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      text: "Elevado",
      textColor: "text-orange-600",
      badgeClass: "bg-orange-50 text-orange-700 border-orange-200"
    };
  }
}

export function getWindStyle(speed: number) {
  if (speed <= 400) {
    return {
      text: "Lento",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (speed <= 600) {
    return {
      text: "Moderado",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      text: "Rápido",
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  }
}

export function getSnrStyle(noiseStr: string | undefined) {
  const str = (noiseStr || "").toLowerCase();
  if (str.includes("mínimo") || str.includes("minimo")) {
    return {
      value: "S0",
      text: "Mínimo (+0.0 dB)",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (str.includes("bajo") || str.includes("+0.5") || str.includes("+0,5")) {
    return {
      value: "S1",
      text: "Bajo (+0.5 dB)",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (str.includes("moderado") || str.includes("+1.5") || str.includes("+1,5")) {
    return {
      value: "S2",
      text: "Moderado (+1.5 dB)",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else if (str.includes("elevado") || str.includes("+3.0") || str.includes("+3,0") || str.includes("alto")) {
    return {
      value: "S3",
      text: "Elevado (+3.0 dB)",
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  } else {
    return {
      value: "S1",
      text: "Bajo (+0.5 dB)",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  }
}

export function getDensityStyle(density: number) {
  if (density <= 8) {
    return {
      text: "Normal",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (density <= 15) {
    return {
      text: "Elevada",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      text: "Muy Alta",
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  }
}

export function getBzStyle(bz: number) {
  if (bz >= 0) {
    return {
      text: "Norte (Estable)",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (bz >= -4) {
    return {
      text: "Sur Leve",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      text: "Sur Crítico",
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  }
}

export function getBtStyle(bt: number) {
  if (bt <= 8) {
    return {
      text: "Estable",
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (bt <= 15) {
    return {
      text: "Moderado",
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      text: "Fuerte",
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  }
}

export function parseNoaaScale(scaleStr: string | undefined, defaultVal: string) {
  const str = scaleStr || defaultVal;
  const match = str.match(/^([^(]+)\(([^)]+)\)/);
  if (match) {
    return {
      value: match[1].trim(),
      status: match[2].trim()
    };
  }
  const parts = str.split(" ");
  const value = parts[0] || str;
  const status = str.substring(value.length).replace(/[()]/g, "").trim() || "Normal";
  return { value, status };
}

export function getNoaaScaleStyle(value: string) {
  const num = parseInt(value.replace(/[^0-9]/g, "")) || 0;
  if (num === 0) {
    return {
      textColor: "text-emerald-600",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  } else if (num <= 2) {
    return {
      textColor: "text-amber-600",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  } else {
    return {
      textColor: "text-red-600 font-black animate-pulse",
      badgeClass: "bg-red-50 text-red-700 border-red-200 animate-pulse"
    };
  }
}

interface PropagacionMonitorProps {
  data?: PropagationData;
}

function formatUpdateTimes(fechaUtcStr: string) {
  try {
    let cleanStr = fechaUtcStr.trim();
    if (cleanStr.endsWith(' UTC')) {
      cleanStr = cleanStr.substring(0, cleanStr.length - 4);
    }
    if (cleanStr.includes(' ') && !cleanStr.includes('T')) {
      cleanStr = cleanStr.replace(' ', 'T');
    }
    if (!cleanStr.endsWith('Z') && !cleanStr.includes('+') && !cleanStr.includes('-')) {
      cleanStr += 'Z';
    }
    const date = new Date(cleanStr);
    if (isNaN(date.getTime())) {
      return { utc: fechaUtcStr, local: '---' };
    }
    // Format local date and time nicely
    const localStr = date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }) + ' ' + date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Format UTC string
    const utcStr = date.getUTCFullYear() + '-' + 
                   String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                   String(date.getUTCDate()).padStart(2, '0') + ' ' + 
                   String(date.getUTCHours()).padStart(2, '0') + ':' + 
                   String(date.getUTCMinutes()).padStart(2, '0') + ' UTC';
                   
    return { utc: utcStr, local: localStr };
  } catch (e) {
    return { utc: fechaUtcStr, local: '---' };
  }
}

function getVoltageEquivalent(dbm: number) {
  try {
    const p_watts = Math.pow(10, (dbm - 30) / 10);
    const v_volts = Math.sqrt(p_watts * 50);
    if (v_volts >= 1) {
      return `${v_volts.toFixed(2)} V`;
    } else if (v_volts >= 0.001) {
      return `${(v_volts * 1000).toFixed(2)} mV`;
    } else {
      return `${(v_volts * 1e6).toFixed(2)} μV`;
    }
  } catch (e) {
    return "0.00 μV";
  }
}


export default function PropagacionMonitor({ data }: PropagacionMonitorProps) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [showExplanation, setShowExplanation] = useState(false);
  const [bandTab, setBandTab] = useState<'all' | 'low' | 'medium' | 'high' | 'vhf'>('all');
  const [bandSearch, setBandSearch] = useState('');
  const lastAlertTimeRef = useRef<Record<string, number>>({});

  // Space Weather & HF Propagation APRS Bulletin & Alert Threshold states
  const [aprsBlnConfig, setAprsBlnConfig] = useState<{
    enabled: boolean;
    intervalMinutes: number;
    addressee: string;
    template: string;
    includeBands: boolean;
    thresholdG: number;
    thresholdR: number;
    thresholdS: number;
    aprsOnAlertOnly: boolean;
    autoSendOnChange: boolean;
    minIntervalOnChangeMinutes: number;
    soundGEnabled: boolean;
    soundREnabled: boolean;
    soundSEnabled: boolean;
  }>({
    enabled: true,
    intervalMinutes: 30,
    addressee: "BLN1SPACE",
    template: "CLIMA ESPACIAL: R{R} S{S} G{G} | SFI:{SFI} Kp:{KP} SSN:{SSN} MUF:{MUF}MHz HF:{STATUS}",
    includeBands: true,
    thresholdG: 1,
    thresholdR: 1,
    thresholdS: 1,
    aprsOnAlertOnly: false,
    autoSendOnChange: true,
    minIntervalOnChangeMinutes: 5,
    soundGEnabled: true,
    soundREnabled: true,
    soundSEnabled: true
  });

  const [aprsBlnPreview, setAprsBlnPreview] = useState<string>('');
  const [aprsBlnAlerts, setAprsBlnAlerts] = useState<{ rScale: string; sScale: string; gScale: string }>({ rScale: 'R0', sScale: 'S0', gScale: 'G0' });
  const [aprsBlnMetrics, setAprsBlnMetrics] = useState<any>(null);
  const [aprsBlnHistory, setAprsBlnHistory] = useState<any[]>([]);
  const [isTransmittingBln, setIsTransmittingBln] = useState<boolean>(false);
  const [blnTxMessage, setBlnTxMessage] = useState<string | null>(null);

  const lastSoundAlertRef = useRef<{ r: string; s: string; g: string }>({ r: 'R0', s: 'S0', g: 'G0' });

  const playSpaceWeatherAlarm = (type: 'G' | 'R' | 'S', scaleValue: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'R') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      } else if (type === 'G') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
        osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.2);
      }

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const typeName = type === 'R' ? 'Apagón de Radio' : type === 'G' ? 'Tormenta Geomagnética' : 'Tormenta de Radiación Solar';
        const msg = new SpeechSynthesisUtterance(
          `Atención. Alerta de Clima Espacial: Nivel ${typeName} ${scaleValue} detectado.`
        );
        msg.lang = 'es-ES';
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);
      }
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  const checkSoundTriggers = (alerts: { rScale: string; sScale: string; gScale: string }, cfg: typeof aprsBlnConfig) => {
    const rNivel = parseInt((alerts.rScale || 'R0').replace('R', '')) || 0;
    const sNivel = parseInt((alerts.sScale || 'S0').replace('S', '')) || 0;
    const gNivel = parseInt((alerts.gScale || 'G0').replace('G', '')) || 0;

    if (cfg.soundREnabled && rNivel >= cfg.thresholdR && rNivel > 0 && lastSoundAlertRef.current.r !== alerts.rScale) {
      playSpaceWeatherAlarm('R', alerts.rScale);
      lastSoundAlertRef.current.r = alerts.rScale;
    }
    if (cfg.soundSEnabled && sNivel >= cfg.thresholdS && sNivel > 0 && lastSoundAlertRef.current.s !== alerts.sScale) {
      playSpaceWeatherAlarm('S', alerts.sScale);
      lastSoundAlertRef.current.s = alerts.sScale;
    }
    if (cfg.soundGEnabled && gNivel >= cfg.thresholdG && gNivel > 0 && lastSoundAlertRef.current.g !== alerts.gScale) {
      playSpaceWeatherAlarm('G', alerts.gScale);
      lastSoundAlertRef.current.g = alerts.gScale;
    }
  };

  const fetchAprsBlnData = async () => {
    try {
      const res = await fetch('/api/space-weather/aprs-bulletin');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.config) {
            setAprsBlnConfig(data.config);
            if (data.currentAlerts) {
              checkSoundTriggers(data.currentAlerts, data.config);
            }
          }
          if (data.latestPacket) setAprsBlnPreview(data.latestPacket);
          if (data.currentAlerts) setAprsBlnAlerts(data.currentAlerts);
          if (data.metrics) setAprsBlnMetrics(data.metrics);
          if (data.history) setAprsBlnHistory(data.history || []);
        }
      }
    } catch (err) {
      console.error("Error fetching space weather APRS bulletin:", err);
    }
  };

  useEffect(() => {
    fetchAprsBlnData();
    const interval = setInterval(fetchAprsBlnData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAprsBlnConfig = async (newCfg: Partial<typeof aprsBlnConfig>) => {
    const updated = { ...aprsBlnConfig, ...newCfg };
    setAprsBlnConfig(updated);
    try {
      const res = await fetch('/api/space-weather/aprs-bulletin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        fetchAprsBlnData();
      }
    } catch (err) {
      console.error("Error updating APRS bulletin config:", err);
    }
  };

  const handleManualTransmitBln = async () => {
    setIsTransmittingBln(true);
    setBlnTxMessage(null);
    try {
      const res = await fetch('/api/space-weather/aprs-bulletin/transmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setBlnTxMessage("¡Boletín APRS difundido a la red con éxito!");
        fetchAprsBlnData();
      }
    } catch (err) {
      setBlnTxMessage("Error al transmitir boletín APRS.");
    } finally {
      setIsTransmittingBln(false);
      setTimeout(() => setBlnTxMessage(null), 4000);
    }
  };



  // Request browser notifications permission
  const requestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
    }
  };

  // Safe fetch of propagation fields
  const gfz = data?.gfz || {
    fecha_utc: new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC',
    Hp30: 2.1,
    Hp60: 2.3,
    ap30: 9,
    ap60: 12,
    real: false
  };

  const noaa = data?.noaa || {
    dia1: "150",
    dia2: "148",
    dia3: "145",
    geom: [
      { dateStr: "Hoy", kp: 2, desc: "Actividad en calma (Simulado)" },
      { dateStr: "Mañana", kp: 3, desc: "Periodos inestables (Simulado)" },
      { dateStr: "Siguiente", kp: 2, desc: "Calma (Simulado)" }
    ],
    rad: [
      { dateStr: "Hoy", level: 0, desc: "None" },
      { dateStr: "Mañana", level: 0, desc: "None" },
      { dateStr: "Siguiente", level: 0, desc: "None" }
    ],
    blackout: [
      { dateStr: "Hoy", level: 0, desc: "None" },
      { dateStr: "Mañana", level: 0, desc: "None" },
      { dateStr: "Siguiente", level: 0, desc: "None" }
    ],
    real: false,
    ssn: "110",
    solar_updated: ""
  };



  const defaultRtsw = {
    speed: 412.5,
    density: 5.4,
    temperature: 110200,
    bt: 5.2,
    bz: -1.2,
    time: new Date().toISOString().replace('T', ' ').substring(0, 16),
    real: false
  };

  const rtsw = data?.rtsw ? {
    speed: data.rtsw.speed !== null && data.rtsw.speed !== undefined ? data.rtsw.speed : defaultRtsw.speed,
    density: data.rtsw.density !== null && data.rtsw.density !== undefined ? data.rtsw.density : defaultRtsw.density,
    temperature: data.rtsw.temperature !== null && data.rtsw.temperature !== undefined ? data.rtsw.temperature : defaultRtsw.temperature,
    bt: data.rtsw.bt !== null && data.rtsw.bt !== undefined ? data.rtsw.bt : defaultRtsw.bt,
    bz: data.rtsw.bz !== null && data.rtsw.bz !== undefined ? data.rtsw.bz : defaultRtsw.bz,
    time: data.rtsw.time || defaultRtsw.time,
    real: data.rtsw.real ?? defaultRtsw.real
  } : defaultRtsw;

  // Notification logic when Hp60 or Kp exceeds 5.0 (Active Storm Level)
  useEffect(() => {
    const hpValue = gfz.Hp60;
    const now = Date.now();
    
    if (hpValue >= 5.0) {
      const cacheKey = `${gfz.fecha_utc}_${hpValue}`;
      const lastTriggered = lastAlertTimeRef.current[cacheKey] || 0;
      
      // Throttle notification triggers for same timestamp
      if (now - lastTriggered > 600000) {
        lastAlertTimeRef.current[cacheKey] = now;
        
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification("⚠️ ALERTA: Tormenta Geomagnética Activa", {
            body: `El índice Hp60 de GFZ Potsdam ha alcanzado ${hpValue} (G1+ Tormenta). Calidad de propagación en bandas HF severamente afectada.`,
            icon: "/favicon.ico",
            tag: "propagacion-alerta"
          });
        }
      }
    }
  }, [gfz.Hp60, gfz.fecha_utc]);

  // Determine Geomagnetic Index Badge
  const getGeomBadgeColor = (val: number) => {
    if (val < 2.0) return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Calma (G0)' };
    if (val < 4.0) return { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'Inestable (G0)' };
    if (val < 5.0) return { bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'Activo (G0)' };
    if (val < 6.0) return { bg: 'bg-red-50 text-red-700 border-red-200', text: 'Tormenta Menor (G1)' };
    if (val < 7.0) return { bg: 'bg-rose-100 text-rose-800 border-rose-300', text: 'Tormenta Moderada (G2)' };
    return { bg: 'bg-red-950 text-red-100 border-red-800 animate-pulse', text: 'Tormenta Fuerte (G3+)' };
  };

  // Assess HF Band Conditions
  const getBandCondition = (band: string, sfiStr: string, hpValue: number) => {
    const sfi = parseInt(sfiStr) || 120;
    
    // Reconstruct Day and Night MUF and LUF based on solar elevation limits
    const mufBase = 7.0 + (sfi - 65) * 0.06;
    const mufDay = mufBase + (12.0 + (sfi - 70) * 0.12);
    const mufNight = Math.max(4.5, mufBase * 0.85);

    const lufBase = 1.5 + (sfi - 65) * 0.005;
    // Add xray impact to LUF if available in noaa.xrayFlux
    const xrayFlux = noaa.xrayFlux || 1e-7;
    let xrayAbs = 0;
    if (xrayFlux > 1e-4) xrayAbs = 8.0;
    else if (xrayFlux > 1e-5) xrayAbs = 4.0;
    else if (xrayFlux > 1e-6) xrayAbs = 1.5;
    else if (xrayFlux > 1e-7) xrayAbs = 0.5;

    const lufDay = lufBase + (2.0 + (sfi - 70) * 0.015) + xrayAbs;
    const lufNight = Math.max(0.5, lufBase * 0.7) + (xrayAbs * 0.1); // minor impact at night

    const isStorm = hpValue >= 4.5;
    const isMinorStorm = hpValue >= 3.5 && hpValue < 4.5;

    // Helper to evaluate a specific frequency
    const evalFreq = (freq: number, isNight: boolean) => {
      const m = isNight ? mufNight : mufDay;
      const l = isNight ? lufNight : lufDay;

      if (isStorm) {
        if (freq < l) return { cond: "Mala (Ruidosa)", color: "text-red-700 bg-red-50 border-red-200" };
        return { cond: "Degradada", color: "text-red-600 bg-red-50 border-red-100" };
      }

      if (isMinorStorm) {
        if (freq < l) return { cond: "Mala (QRN)", color: "text-amber-700 bg-amber-50 border-amber-200" };
        return { cond: "Regular (Fading)", color: "text-amber-600 bg-amber-50 border-amber-100" };
      }

      if (freq > m) {
        return { cond: "Cerrada", color: "text-slate-500 bg-slate-50 border-slate-200" };
      }

      if (freq < l) {
        return { cond: "Cerrada (Absorción)", color: "text-slate-500 bg-slate-50 border-slate-100" };
      }

      // Open! Calculate suitability position
      const window = m - l;
      const pos = window > 0 ? ((freq - l) / window) * 100 : 50;

      if (pos > 70) {
        return { cond: "Excelente", color: "text-emerald-700 bg-emerald-50 border-emerald-200 font-bold" };
      }
      if (pos > 30) {
        return { cond: "Buena", color: "text-emerald-600 bg-emerald-50 border-emerald-100" };
      }
      return { cond: "Regular", color: "text-amber-600 bg-amber-50 border-amber-200" };
    };

    let dayCondition = "Regular";
    let nightCondition = "Regular";
    let dayColor = "text-amber-600 bg-amber-50 border-amber-200";
    let nightColor = "text-amber-600 bg-amber-50 border-amber-200";

    if (band === "80m-40m") {
      // 80m and 40m are lower bands, evaluated around 5.0 MHz
      const d = evalFreq(5.0, false);
      const n = evalFreq(5.0, true);
      dayCondition = d.cond;
      dayColor = d.color;
      nightCondition = n.cond;
      nightColor = n.color;
    } else if (band === "20m") {
      // 20m center is 14.15 MHz
      const d = evalFreq(14.15, false);
      const n = evalFreq(14.15, true);
      dayCondition = d.cond;
      dayColor = d.color;
      nightCondition = n.cond;
      nightColor = n.color;
    } else if (band === "15m-17m") {
      // 17m-15m center is 19.5 MHz
      const d = evalFreq(19.5, false);
      const n = evalFreq(19.5, true);
      dayCondition = d.cond;
      dayColor = d.color;
      nightCondition = n.cond;
      nightColor = n.color;
    } else if (band === "10m-12m") {
      // 12m-10m center is 27.2 MHz
      const d = evalFreq(27.2, false);
      const n = evalFreq(27.2, true);
      dayCondition = d.cond;
      dayColor = d.color;
      nightCondition = n.cond;
      nightColor = n.color;
    }

    return { dayCondition, nightCondition, dayColor, nightColor };
  };

  // Prepare dummy historical trend for chart visualization
  const trendData = [
    { name: '12h ago', Hp30: Math.max(0.5, gfz.Hp30 - 0.8), Hp60: Math.max(0.6, gfz.Hp60 - 0.6) },
    { name: '9h ago', Hp30: Math.max(0.5, gfz.Hp30 - 0.4), Hp60: Math.max(0.6, gfz.Hp60 - 0.3) },
    { name: '6h ago', Hp30: Math.max(0.5, gfz.Hp30 + 0.5), Hp60: Math.max(0.6, gfz.Hp60 + 0.8) },
    { name: '3h ago', Hp30: Math.max(0.5, gfz.Hp30 + 0.2), Hp60: Math.max(0.6, gfz.Hp60 + 0.4) },
    { name: 'Actual', Hp30: gfz.Hp30, Hp60: gfz.Hp60 }
  ];

  const hp60Badge = getGeomBadgeColor(gfz.Hp60);

  // Dynamic band calculations based on actual SFU and Hp60
  const currentSfi = parseInt(noaa.dia1) || 120;
  const hpValue = gfz.Hp60;

  const legacyCalculateBandStatus = (bandId: string) => {
    const isStorm = hpValue >= 5.0;
    const isModerateStorm = hpValue >= 4.0 && hpValue < 5.0;
    
    switch (bandId) {
      case "160m": {
        const sfiMin = 60;
        const pct = Math.min(100, Math.round((currentSfi / 100) * 100));
        if (isStorm) {
          return {
            name: "160 metros (1.8 MHz)",
            status: "Inoperable (Tormenta)",
            color: "text-red-700 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-950",
            icon: XCircle,
            desc: "Completamente bloqueada por absorción geomagnética de tormenta (Blackout).",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo: 60.",
            pct,
            category: "low"
          };
        }
        if (isModerateStorm) {
          return {
            name: "160 metros (1.8 MHz)",
            status: "Ruido Extremo",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-900",
            icon: AlertTriangle,
            desc: "Fuertes interferencias estáticas (QRN). Enlaces de emergencia viables a muy corto alcance.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo: 60.",
            pct,
            category: "low"
          };
        }
        return {
          name: "160 metros (1.8 MHz)",
          status: "Abierta (Noche)",
          color: "text-emerald-700 bg-emerald-50 border-emerald-200",
          badgeColor: "bg-emerald-500",
          textColor: "text-emerald-800",
          icon: CheckCircle,
          desc: "Excelente propagación nocturna para cobertura nacional de emergencia. Absorción total durante el día.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo: 60.",
          pct,
          category: "low"
        };
      }
      case "80m": {
        const sfiMin = 65;
        const pct = Math.min(100, Math.round((currentSfi / 110) * 100));
        if (isStorm) {
          return {
            name: "80 metros (3.5 MHz)",
            status: "Ruido Extremo",
            color: "text-red-700 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-950",
            icon: XCircle,
            desc: "Nivel de ruido insostenible. Comunicaciones diurnas nulas; nocturnas severamente perturbadas.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo: 65.",
            pct,
            category: "low"
          };
        }
        if (isModerateStorm) {
          return {
            name: "80 metros (3.5 MHz)",
            status: "Condiciones Limitadas",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-900",
            icon: AlertTriangle,
            desc: "Ruido estático elevado. Enlaces REMER locales con antenas de ángulo alto (NVIS) viables.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo: 65.",
            pct,
            category: "low"
          };
        }
        return {
          name: "80 metros (3.5 MHz)",
          status: "Abierta (Noche / Local)",
          color: "text-emerald-700 bg-emerald-50 border-emerald-200",
          badgeColor: "bg-emerald-500",
          textColor: "text-emerald-800",
          icon: CheckCircle,
          desc: "Óptima propagación nocturna. Cobertura regional diurna estable mediante ondas de espacio (NVIS).",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo: 65.",
          pct,
          category: "low"
        };
      }
      case "60m": {
        const sfiMin = 65;
        const pct = Math.min(100, Math.round((currentSfi / 120) * 100));
        if (isStorm) {
          return {
            name: "60 metros (5.3 MHz)",
            status: "Fuertes Perturbaciones",
            color: "text-red-700 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-950",
            icon: AlertTriangle,
            desc: "Banda de emergencia estatal comprometida. Requiere filtros de ruido y alta potencia.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo: 65.",
            pct,
            category: "low"
          };
        }
        return {
          name: "60 metros (5.3 MHz)",
          status: "Excelente Canal NVIS",
          color: "text-emerald-700 bg-emerald-50 border-emerald-200",
          badgeColor: "bg-emerald-500",
          textColor: "text-emerald-800",
          icon: CheckCircle,
          desc: "Banda intergubernamental y REMER sumamente estable día/noche. Baja atenuación.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo: 65.",
          pct,
          category: "low"
        };
      }
      case "40m": {
        const sfiMin = 70;
        const pct = Math.min(100, Math.round((currentSfi / 120) * 100));
        if (isStorm) {
          return {
            name: "40 metros (7 MHz)",
            status: "Ruido Geomagnético Severo",
            color: "text-red-700 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-900",
            icon: AlertTriangle,
            desc: "Banda ruidosa y perturbada por tormenta geomagnética activa. Filtros DSP requeridos.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 60. Suficiente para enlaces de emergencia nacionales.",
            pct,
            category: "low"
          };
        }
        if (hpValue >= 4.0) {
          return {
            name: "40 metros (7 MHz)",
            status: "Ruido Moderado",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-900",
            icon: AlertTriangle,
            desc: "Aumento de QRN (ruido). Enlaces REMER viables pero requieren mayor potencia de transmisión.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 60. Suficiente para enlaces de emergencia nacionales.",
            pct,
            category: "low"
          };
        }
        if (currentSfi < 70) {
          return {
            name: "40 metros (7 MHz)",
            status: "Operatividad Parcial",
            color: "text-amber-600 bg-amber-50/50 border-amber-200/60",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-800",
            icon: AlertTriangle,
            desc: "Flujo solar bajo. Señales diurnas ligeramente atenuadas; estable durante la noche.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 60. Suficiente para enlaces de emergencia nacionales.",
            pct,
            category: "low"
          };
        }
        return {
          name: "40 metros (7 MHz)",
          status: "Totalmente Operativa",
          color: "text-emerald-700 bg-emerald-50 border-emerald-200",
          badgeColor: "bg-emerald-500",
          textColor: "text-emerald-800",
          icon: CheckCircle,
          desc: "Excelente propagación local y regional durante el día; largo alcance (DX) durante la noche.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 60. Suficiente para enlaces de emergencia nacionales.",
          pct,
          category: "low"
        };
      }
      case "30m": {
        const sfiMin = 75;
        const pct = Math.min(100, Math.round((currentSfi / 140) * 100));
        if (isStorm) {
          return {
            name: "30 metros (10.1 MHz)",
            status: "Inestable / Fading",
            color: "text-red-700 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-950",
            icon: AlertTriangle,
            desc: "Pérdidas de señal rápidas por centelleo ionosférico (fading severo).",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 75.",
            pct,
            category: "medium"
          };
        }
        return {
          name: "30 metros (10.1 MHz)",
          status: "Operativa (Digitales)",
          color: "text-emerald-700 bg-emerald-50 border-emerald-200",
          badgeColor: "bg-emerald-500",
          textColor: "text-emerald-800",
          icon: CheckCircle,
          desc: "Excelente banda diurna y nocturna para telegrafía (CW) y modos digitales rápidos (FT8).",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 75.",
          pct,
          category: "medium"
        };
      }
      case "20m": {
        const sfiMin = 80;
        const pct = Math.min(100, Math.round((currentSfi / 150) * 100));
        if (isStorm) {
          return {
            name: "20 metros (14 MHz)",
            status: "Propagación Degradada",
            color: "text-red-700 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-900",
            icon: AlertTriangle,
            desc: "Ionósfera altamente inestable. Fuertes desvanecimientos (fading) e interrupciones temporales.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 80. Óptimo para comunicados diurnos transcontinentales.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi < 70) {
          return {
            name: "20 metros (14 MHz)",
            status: "Condiciones Pobres",
            color: "text-rose-600 bg-rose-50 border-rose-200",
            badgeColor: "bg-rose-500",
            textColor: "text-rose-900",
            icon: XCircle,
            desc: "Ionización F2 insuficiente. Banda cerrada en picos de mañana y tarde, señales débiles.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 80. Óptimo para comunicados diurnos transcontinentales.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi < 90) {
          return {
            name: "20 metros (14 MHz)",
            status: "Operativa Intermitente",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-800",
            icon: AlertTriangle,
            desc: "Aperturas inestables. Enlaces posibles pero con niveles de señal variables y ruido de fondo.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 80. Óptimo para comunicados diurnos transcontinentales.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi >= 130) {
          return {
            name: "20 metros (14 MHz)",
            status: "Excelente / DX Abierto",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Excelentes condiciones. Banda abierta de par en par día y noche con señales potentes.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 80. Óptimo para comunicados diurnos transcontinentales.",
            pct,
            category: "medium"
          };
        }
        return {
          name: "20 metros (14 MHz)",
          status: "Totalmente Operativa",
          color: "text-emerald-700 bg-emerald-50 border-emerald-200",
          badgeColor: "bg-emerald-500",
          textColor: "text-emerald-800",
          icon: CheckCircle,
          desc: "Banda diurna principal abierta a nivel global con excelente nivel de señal y estabilidad.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 80. Óptimo para comunicados diurnos transcontinentales.",
          pct,
          category: "medium"
        };
      }
      case "17m": {
        const sfiMin = 95;
        const pct = Math.min(100, Math.round((currentSfi / 160) * 100));
        if (isStorm) {
          return {
            name: "17 metros (18.1 MHz)",
            status: "Cerrada por Tormenta",
            color: "text-slate-400 bg-slate-50 border-slate-200",
            badgeColor: "bg-slate-400",
            textColor: "text-slate-600",
            icon: XCircle,
            desc: "Absorción drástica del flujo solar. Sin posibilidades de enlaces ionosféricos estables.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 95.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi >= 110) {
          return {
            name: "17 metros (18.1 MHz)",
            status: "Excelente Abierta",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Abierta con bajo ruido atmosférico y excelente cobertura global de larga distancia.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 95.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi >= 95) {
          return {
            name: "17 metros (18.1 MHz)",
            status: "Abierta Diurna",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            badgeColor: "bg-emerald-500",
            textColor: "text-emerald-800",
            icon: CheckCircle,
            desc: "Buenas aperturas durante el día hacia América del Sur, África y Europa central.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 95.",
            pct,
            category: "medium"
          };
        }
        return {
          name: "17 metros (18.1 MHz)",
          status: "Cerrada",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Flujo solar insuficiente para activar esta capa de la ionósfera.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 95.",
          pct,
          category: "medium"
        };
      }
      case "15m": {
        const sfiMin = 105;
        const pct = Math.min(100, Math.round((currentSfi / 170) * 100));
        if (isStorm) {
          return {
            name: "15 metros (21.0 MHz)",
            status: "Inoperativa",
            color: "text-red-800 bg-red-50 border-red-200",
            badgeColor: "bg-red-500",
            textColor: "text-red-950",
            icon: XCircle,
            desc: "Bloqueada temporalmente por anomalías magnéticas del sol.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 105.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi >= 120) {
          return {
            name: "15 metros (21.0 MHz)",
            status: "Excelente DX Abierto",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Excelentes señales intercontinentales durante las horas de sol. Nivel de ruido bajísimo.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 105.",
            pct,
            category: "medium"
          };
        }
        if (currentSfi >= 105) {
          return {
            name: "15 metros (21.0 MHz)",
            status: "Abierta de Día",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            badgeColor: "bg-emerald-500",
            textColor: "text-emerald-800",
            icon: CheckCircle,
            desc: "Buena apertura diurna. Enlaces continentales estables con potencias estándar (100W).",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 105.",
            pct,
            category: "medium"
          };
        }
        return {
          name: "15 metros (21.0 MHz)",
          status: "Cerrada",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Flujo solar muy bajo. Sin refracción en capa F2 para esta frecuencia.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 105.",
          pct,
          category: "medium"
        };
      }
      case "12m": {
        const sfiMin = 110;
        const pct = Math.min(100, Math.round((currentSfi / 175) * 100));
        if (isStorm) {
          return {
            name: "12 metros (24.9 MHz)",
            status: "Cerrada (Tormenta)",
            color: "text-slate-400 bg-slate-50 border-slate-200",
            badgeColor: "bg-slate-400",
            textColor: "text-slate-550",
            icon: XCircle,
            desc: "Nula ionización disponible debido a perturbación ionosférica.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 125) {
          return {
            name: "12 metros (24.9 MHz)",
            status: "Excelente / DX Activo",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Espectacular banda para DX de baja potencia durante el día. Desaparece al atardecer.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 110) {
          return {
            name: "12 metros (24.9 MHz)",
            status: "Abierta Parcial",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            badgeColor: "bg-emerald-500",
            textColor: "text-emerald-800",
            icon: CheckCircle,
            desc: "Aperturas diurnas moderadas hacia el ecuador. Requiere buena antena directiva.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110.",
            pct,
            category: "high"
          };
        }
        return {
          name: "12 metros (24.9 MHz)",
          status: "Cerrada",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Inactiva. Flujo solar insuficiente para refractar frecuencias superiores a 24 MHz.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 110.",
          pct,
          category: "high"
        };
      }
      case "11m": {
        const sfiMin = 115;
        const pct = Math.min(100, Math.round((currentSfi / 180) * 100));
        if (isStorm) {
          return {
            name: "11 metros (CB / 27 MHz)",
            status: "Inactiva (Tormenta)",
            color: "text-slate-400 bg-slate-50 border-slate-200",
            badgeColor: "bg-slate-400",
            textColor: "text-slate-550",
            icon: XCircle,
            desc: "Banda de Banda Ciudadana (CB) completamente muerta o con ruido estático masivo.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 115.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 125) {
          return {
            name: "11 metros (CB / 27 MHz)",
            status: "Abierta (Gran Alcance)",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Banda Ciudadana con propagación mundial activa en canales AM/FM/SSB de forma masiva.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 115.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 115) {
          return {
            name: "11 metros (CB / 27 MHz)",
            status: "Abierta Diurna (CB)",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            badgeColor: "bg-emerald-500",
            textColor: "text-emerald-800",
            icon: CheckCircle,
            desc: "Operativa para enlaces nacionales y europeos durante horas centrales de sol.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 115.",
            pct,
            category: "high"
          };
        }
        return {
          name: "11 metros (CB / 27 MHz)",
          status: "Cerrada (Solo Local)",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Solo comunicados de corto alcance en línea de visión directa (onda terrestre).",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 115.",
          pct,
          category: "high"
        };
      }
      case "10m": {
        const sfiMin = 120;
        const pct = Math.min(100, Math.round((currentSfi / 180) * 100));
        if (isStorm) {
          return {
            name: "10 metros (28 MHz)",
            status: "Inoperativa por Absorción",
            color: "text-red-800 bg-red-50 border-red-200",
            badgeColor: "bg-red-600",
            textColor: "text-red-950",
            icon: XCircle,
            desc: "Completamente inoperativa por bloqueo auroral o absorción geomagnética de tormenta.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110. Requiere alta actividad solar para abrirse vía F2.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 130) {
          return {
            name: "10 metros (28 MHz)",
            status: "Excelente / DX Abierto",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Apertura masiva diurna para comunicados globales a muy larga distancia con baja potencia.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110. Requiere alta actividad solar para abrirse vía F2.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 105) {
          return {
            name: "10 metros (28 MHz)",
            status: "Operativa / Abierta de Día",
            color: "text-emerald-700 bg-emerald-50 border-emerald-200",
            badgeColor: "bg-emerald-500",
            textColor: "text-emerald-800",
            icon: CheckCircle,
            desc: "Abierta durante horas de máxima insolación diurna. Muy propicia para contactos DX.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110. Requiere alta actividad solar para abrirse vía F2.",
            pct,
            category: "high"
          };
        }
        if (currentSfi >= 90) {
          return {
            name: "10 metros (28 MHz)",
            status: "Apertura Marginal / Esporádica",
            color: "text-amber-600 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-800",
            icon: AlertTriangle,
            desc: "Inestable. Enlaces esporádicos breves vía propagación por nubes ionizadas (Sporadic-E).",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 110. Requiere alta actividad solar para abrirse vía F2.",
            pct,
            category: "high"
          };
        }
        return {
          name: "10 metros (28 MHz)",
          status: "Cerrada",
          color: "text-slate-500 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-400",
          textColor: "text-slate-650",
          icon: XCircle,
          desc: "Capa F2 sin ionización suficiente. Comunicaciones limitadas a onda terrestre local.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 110. Requiere alta actividad solar para abrirse vía F2.",
          pct,
          category: "high"
        };
      }
      case "8m": {
        const sfiMin = 130;
        const pct = Math.min(100, Math.round((currentSfi / 200) * 100));
        if (currentSfi >= 135) {
          return {
            name: "8 metros (experimental / 40 MHz)",
            status: "Abierta (Experimental DX)",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "Banda de 40 MHz abierta vía F2 para enlaces experimentales a gran distancia.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 130.",
            pct,
            category: "vhf"
          };
        }
        return {
          name: "8 metros (experimental / 40 MHz)",
          status: "Cerrada (Solo Sporadic-E)",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Generalmente cerrada. Posibles aperturas esporádicas de verano/invierno (Sporadic-E).",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 130.",
          pct,
          category: "vhf"
        };
      }
      case "6m": {
        const sfiMin = 140;
        const pct = Math.min(100, Math.round((currentSfi / 220) * 100));
        if (currentSfi >= 150) {
          return {
            name: "6 metros (50.0 MHz)",
            status: "Abierta vía F2 (DX Extremo)",
            color: "text-cyan-700 bg-cyan-50 border-cyan-200",
            badgeColor: "bg-cyan-500",
            textColor: "text-cyan-850",
            icon: Zap,
            desc: "¡La banda mágica abierta de par en par! Enlaces globales con potencias ínfimas vía refracción F2.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 140.",
            pct,
            category: "vhf"
          };
        }
        if (currentSfi >= 110) {
          return {
            name: "6 metros (50.0 MHz)",
            status: "Condiciones de Sporadic-E",
            color: "text-amber-600 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-800",
            icon: AlertTriangle,
            desc: "Aperturas súbitas e intensas pero de corta duración hacia Europa y norte de África.",
            sfiMin,
            sfiLabel: "Flujo SFU mínimo sugerido: 140.",
            pct,
            category: "vhf"
          };
        }
        return {
          name: "6 metros (50.0 MHz)",
          status: "Cerrada",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Cerrada. Requiere picos solares extremos o nubes E esporádicas para enlaces a larga distancia.",
          sfiMin,
          sfiLabel: "Flujo SFU mínimo sugerido: 140.",
          pct,
          category: "vhf"
        };
      }
      default: {
        return {
          name: "Banda Desconocida",
          status: "Cerrada",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Sin datos específicos.",
          sfiMin: 100,
          sfiLabel: "",
          pct: 50,
          category: "medium"
        };
      }
    }
  };

  const calculateBandStatus = (bandId: string) => {
    // 13 Bands Parameters configuration:
    const bandConfigs: Record<string, { freq: number; sfiMin: number; targetSfi: number; name: string; category: string; sfiLabel: string }> = {
      "160m": { freq: 1.8, sfiMin: 60, targetSfi: 100, name: "160 metros (1.8 MHz)", category: "low", sfiLabel: "Flujo SFU sugerido: 60." },
      "80m": { freq: 3.5, sfiMin: 65, targetSfi: 110, name: "80 metros (3.5 MHz)", category: "low", sfiLabel: "Flujo SFU sugerido: 65." },
      "60m": { freq: 5.3, sfiMin: 65, targetSfi: 120, name: "60 metros (5.3 MHz)", category: "low", sfiLabel: "Flujo SFU sugerido: 65. Banda REMER estatal." },
      "40m": { freq: 7.05, sfiMin: 70, targetSfi: 120, name: "40 metros (7 MHz)", category: "low", sfiLabel: "Flujo SFU sugerido: 70. Banda para enlaces nacionales." },
      "30m": { freq: 10.12, sfiMin: 75, targetSfi: 140, name: "30 metros (10.1 MHz)", category: "medium", sfiLabel: "Flujo SFU sugerido: 75. Excelente telegrafía." },
      "20m": { freq: 14.15, sfiMin: 80, targetSfi: 150, name: "20 metros (14 MHz)", category: "medium", sfiLabel: "Flujo SFU sugerido: 80. Banda principal diurna." },
      "17m": { freq: 18.12, sfiMin: 95, targetSfi: 160, name: "17 metros (18.1 MHz)", category: "medium", sfiLabel: "Flujo SFU sugerido: 95. Óptima cobertura global." },
      "15m": { freq: 21.22, sfiMin: 105, targetSfi: 170, name: "15 metros (21.0 MHz)", category: "medium", sfiLabel: "Flujo SFU sugerido: 105." },
      "12m": { freq: 24.94, sfiMin: 110, targetSfi: 175, name: "12 metros (24.9 MHz)", category: "high", sfiLabel: "Flujo SFU sugerido: 110. Banda diurna experimental." },
      "11m": { freq: 27.2, sfiMin: 115, targetSfi: 180, name: "11 metros (CB / 27 MHz)", category: "high", sfiLabel: "Flujo SFU sugerido: 115. Canales de Banda Ciudadana (CB)." },
      "10m": { freq: 28.5, sfiMin: 120, targetSfi: 180, name: "10 metros (28 MHz)", category: "high", sfiLabel: "Flujo SFU sugerido: 120. Excelente para enlaces DX diurnos." },
      "8m": { freq: 40.1, sfiMin: 130, targetSfi: 200, name: "8 metros (experimental / 40 MHz)", category: "vhf", sfiLabel: "Flujo SFU sugerido: 130. Uso experimental." },
      "6m": { freq: 50.1, sfiMin: 140, targetSfi: 220, name: "6 metros (50.0 MHz)", category: "vhf", sfiLabel: "Flujo SFU sugerido: 140. 'La Banda Mágica' de VHF." }
    };

    const cfg = bandConfigs[bandId];
    if (!cfg) {
      return {
        name: "Banda Desconocida",
        status: "Cerrada",
        color: "text-slate-400 bg-slate-50 border-slate-200",
        badgeColor: "bg-slate-300",
        textColor: "text-slate-500",
        icon: XCircle,
        desc: "Sin datos específicos.",
        sfiMin: 100,
        sfiLabel: "",
        pct: 50,
        category: "medium"
      };
    }

    const muf = noaa.muf || 14.5;
    const luf = noaa.luf || 2.0;
    const isStorm = hpValue >= 4.5;
    const isMinorStorm = hpValue >= 3.5 && hpValue < 4.5;
    const pct = Math.min(100, Math.round((currentSfi / cfg.targetSfi) * 100));

    // Dynamic state assessment:
    // 1. Is the band's frequency above the current MUF?
    if (cfg.freq > muf) {
      // Sporadic E exception for VHF (6m/8m) or 10m
      if (bandId === "6m" || bandId === "8m") {
        if (currentSfi > 140 && !isStorm) {
          return {
            ...cfg,
            status: "Apertura Esporádica",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            badgeColor: "bg-amber-500",
            textColor: "text-amber-800",
            icon: AlertTriangle,
            desc: "Frecuencia superior a la MUF base, pero las nubes de ionización esporádica Sporadic-E permiten enlaces rápidos.",
            pct
          };
        }
        return {
          ...cfg,
          status: "Cerrada (Supera MUF)",
          color: "text-slate-400 bg-slate-50 border-slate-200",
          badgeColor: "bg-slate-300",
          textColor: "text-slate-500",
          icon: XCircle,
          desc: "Frecuencia superior a la Máxima Usable (MUF). Las señales de radio atraviesan la ionósfera rumbo al espacio.",
          pct
        };
      }

      if ((bandId === "10m" || bandId === "11m" || bandId === "12m") && currentSfi > 120 && !isStorm) {
        return {
          ...cfg,
          status: "Apertura Marginal",
          color: "text-amber-600 bg-amber-50/50 border-amber-200/50",
          badgeColor: "bg-amber-400",
          textColor: "text-amber-800",
          icon: AlertTriangle,
          desc: "Ligeramente por encima de la MUF calculada. Contactos esporádicos breves hacia zonas ecuatoriales.",
          pct
        };
      }

      return {
        ...cfg,
        status: "Cerrada (Supera MUF)",
        color: "text-slate-400 bg-slate-50/50 border-slate-200/50",
        badgeColor: "bg-slate-300",
        textColor: "text-slate-500",
        icon: XCircle,
        desc: `Inactiva. Frecuencia superior a la Máxima Usable (MUF actual: ${muf.toFixed(2)} MHz). Las ondas no se refractan.`,
        pct
      };
    }

    // 2. Is the band's frequency below the current LUF?
    if (cfg.freq < luf) {
      if (isStorm) {
        return {
          ...cfg,
          status: "Blackout / Absorbida",
          color: "text-red-700 bg-red-50 border-red-200",
          badgeColor: "bg-red-600",
          textColor: "text-red-950",
          icon: XCircle,
          desc: `Absorción de tormenta severa en la capa D. Frecuencia inferior a la LUF (${luf.toFixed(2)} MHz). Redes REMER en HF degradadas.`,
          pct
        };
      }
      return {
        ...cfg,
        status: "Absorbida (Menor que LUF)",
        color: "text-slate-400 bg-slate-50/30 border-slate-200/40",
        badgeColor: "bg-slate-300",
        textColor: "text-slate-400",
        icon: XCircle,
        desc: `Frecuencia inferior a la LUF actual de ${luf.toFixed(2)} MHz. Las ondas son completamente absorbidas por colisiones en la capa D.`,
        pct
      };
    }

    // 3. Band is Open! (LUF <= Freq <= MUF)
    if (isStorm) {
      return {
        ...cfg,
        status: "Abierta con Ruido Severo",
        color: "text-red-700 bg-red-50 border-red-200",
        badgeColor: "bg-red-500",
        textColor: "text-red-900",
        icon: AlertTriangle,
        desc: `Refractiva pero inútil por ruido extremo. Tormenta geomagnética (Hp60: ${hpValue.toFixed(2)}) genera QRN masivo y desvanecimientos.`,
        pct
      };
    }

    if (isMinorStorm) {
      return {
        ...cfg,
        status: "Operativa (Fading Severo)",
        color: "text-amber-700 bg-amber-50 border-amber-200",
        badgeColor: "bg-amber-500",
        textColor: "text-amber-900",
        icon: AlertTriangle,
        desc: "Enlaces viables pero inestables debido al centelleo ionosférico y desvanecimientos rápidos.",
        pct
      };
    }

    // Evaluate position within the useful ionospheric window
    const windowSize = muf - luf;
    const positionPercent = windowSize > 0 ? ((cfg.freq - luf) / windowSize) * 100 : 50;

    // FOT (Frequency of Optimum Transmission) near MUF (upper 30% of the window)
    if (positionPercent > 70) {
      return {
        ...cfg,
        status: "Excelente / Canal Óptimo",
        color: "text-cyan-700 bg-cyan-50 border-cyan-200",
        badgeColor: "bg-cyan-500",
        textColor: "text-cyan-850",
        icon: Zap,
        desc: `FOT Óptima. Muy baja pérdida de propagación al estar cerca del límite superior (MUF: ${muf.toFixed(2)} MHz). Señales potentes y estables.`,
        pct
      };
    }

    // Main window (middle 40%)
    if (positionPercent > 30) {
      return {
        ...cfg,
        status: "Totalmente Operativa",
        color: "text-emerald-700 bg-emerald-50 border-emerald-200",
        badgeColor: "bg-emerald-500",
        textColor: "text-emerald-800",
        icon: CheckCircle,
        desc: "Muy estable. La banda se sitúa perfectamente dentro del espectro refractivo útil. Bajos niveles de ruido y buena atenuación.",
        pct
      };
    }

    // Near LUF (lower 30%)
    return {
      ...cfg,
      status: "Operatividad Parcial",
      color: "text-amber-600 bg-amber-50 border-amber-200/60",
      badgeColor: "bg-amber-500",
      textColor: "text-amber-800",
      icon: AlertTriangle,
      desc: `Abierta pero con atenuación moderada. Frecuencia muy cercana al límite inferior LUF (${luf.toFixed(2)} MHz). Requiere más potencia.`,
      pct
    };
  };

  const allBands = [
    { id: "160m" },
    { id: "80m" },
    { id: "60m" },
    { id: "40m" },
    { id: "30m" },
    { id: "20m" },
    { id: "17m" },
    { id: "15m" },
    { id: "12m" },
    { id: "11m" },
    { id: "10m" },
    { id: "8m" },
    { id: "6m" }
  ];

  const filteredBands = allBands.filter(band => {
    const statusInfo = calculateBandStatus(band.id);
    const matchesSearch = statusInfo.name.toLowerCase().includes(bandSearch.toLowerCase()) || 
                          band.id.toLowerCase().includes(bandSearch.toLowerCase()) ||
                          statusInfo.status.toLowerCase().includes(bandSearch.toLowerCase());
    
    const matchesTab = bandTab === 'all' || statusInfo.category === bandTab;
    
    return matchesSearch && matchesTab;
  });

  return (
    <motion.div 
      id="propagacion-monitor-view"
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="space-y-6"
    >
      {/* Upper Status Cards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="text-cyan-500 animate-pulse" size={24} />
            <h2 className="font-sans font-bold text-lg text-slate-800 tracking-tight">
              Monitor de Propagación HF & Clima Espacial
            </h2>
          </div>
          <p className="font-sans text-xs text-slate-500 mt-1 flex items-center flex-wrap gap-1.5">
            <Clock size={12} className="text-slate-400" />
            <span>Sincronización de Consola: <span className="font-mono text-cyan-600 font-semibold">{data?.lastUpdated || '---'}</span></span>
            <span className="text-slate-300">|</span>
            <span>Observación Solar: <span className="font-mono text-slate-600 font-medium">{formatUpdateTimes(gfz.fecha_utc).local} <span className="text-slate-400 font-normal text-[10px] font-sans">(Local)</span></span></span>
            {gfz.real ? (
              <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 rounded text-[10px] font-semibold tracking-wider uppercase ml-1">Tiempo Real</span>
            ) : (
              <span className="text-amber-600 bg-amber-50 border border-amber-100 px-1.5 rounded text-[10px] font-semibold tracking-wider uppercase ml-1">Simulado</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Notification Button */}
          <button
            id="notif-perm-button"
            onClick={requestPermission}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg font-sans text-xs font-semibold tracking-wide border transition-all cursor-pointer shadow-xs ${
              permission === 'granted'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {permission === 'granted' ? (
              <>
                <Bell size={14} className="text-emerald-600" />
                <span>Alertas Activas (G2+)</span>
              </>
            ) : (
              <>
                <BellOff size={14} className="text-slate-400" />
                <span>Permitir Alertas</span>
              </>
            )}
          </button>

          {/* Help button */}
          <button
            id="propagacion-info-button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 cursor-pointer transition-colors"
          >
            <HelpCircle size={14} />
            <span>Guía Operativa</span>
          </button>
        </div>
      </div>

      {/* Explanatory banner if opened */}
      {showExplanation && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-xs font-sans text-sky-900 space-y-2 leading-relaxed"
        >
          <div className="flex items-center gap-1.5 font-bold text-sky-950">
            <Radio size={14} />
            Guía de Interpretación de Propagación en HF
          </div>
          <p>
            Los radioaficionados y servicios de emergencia utilizan estos datos para predecir si el enlace de ionósfera es favorable:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-1 text-sky-850 pl-2">
            <li><strong>SFU (Solar Flux Unit):</strong> Representa la ionización general. Valores superiores a <strong>90 SFU</strong> abren bandas de alta frecuencia como 20m. Por encima de <strong>120 SFU</strong>, las bandas de 15m y 10m se vuelven excelentes durante el día.</li>
            <li><strong>Índices Hp30 & Hp60 (GFZ Potsdam Nowcast):</strong> Son versiones instantáneas de alta resolución del índice Kp de perturbación geomagnética. Valores de <strong>0 a 3</strong> indican condiciones en calma y estables. Valores de <strong>4+</strong> indican inestabilidad ionosférica, provocando ruidos estáticos extremos y ráfagas que apagan o "desvanecen" (fade-out) las comunicaciones HF.</li>
            <li><strong>Notificación Activa:</strong> Si el índice geomagnético sube de 5.0 (Tormenta activa nivel G2+), se disparará un aviso automático del navegador para alertar al operador sobre perturbaciones de alcance inmediato.</li>
          </ul>
        </motion.div>
      )}

      {/* Main Grid: Bento Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Card 0: Consola Clima Solar y Propagación HF (Relocated) */}
        <div className="lg:col-span-12 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-amber-500/5 pointer-events-none">
            <Sun size={80} />
          </div>
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-sans font-bold text-sm text-slate-700 flex items-center gap-1.5">
                <Sun size={16} className="text-amber-500 animate-spin-slow" />
                Consola Clima Solar y Propagación HF
              </h3>
              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                CICLO SOLAR 25
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
              {/* SFU */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">SFU</span>
                  {(() => {
                    const sfiVal = parseInt(noaa.dia1) || 140;
                    const sfiStyle = getSfiStyle(sfiVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${sfiStyle.textColor}`}>
                          {sfiVal}
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${sfiStyle.badgeClass}`}>
                            {sfiStyle.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* MANCHAS SOLARES */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">MANCHAS SOLARES</span>
                  {(() => {
                    const ssnVal = parseInt(noaa.ssn) || Math.max(0, Math.round((parseInt(noaa.dia1) - 64) * 0.9)) || 0;
                    const ssnStyle = getSsnStyle(ssnVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${ssnStyle.textColor}`}>
                          {ssnVal} SSN
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${ssnStyle.badgeClass}`}>
                            {ssnStyle.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Kp */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">Índice Geomag. Kp</span>
                  {(() => {
                    const kpVal = gfz.Hp60 !== undefined ? gfz.Hp60 : 2.1;
                    const kpStyle = getKpStyle(kpVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${kpStyle.textColor}`}>
                          {kpVal.toFixed(2)} Kp
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${kpStyle.badgeClass}`}>
                            {kpStyle.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* VIENTO SOLAR */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">VIENTO SOLAR</span>
                  {(() => {
                    const windVal = rtsw.speed || 412.5;
                    const windStyle = getWindStyle(windVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${windStyle.textColor}`}>
                          {windVal.toFixed(1)} <span className="text-[10px]">km/s</span>
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${windStyle.badgeClass}`}>
                            {windStyle.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* UVI */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">UVI</span>
                  {(() => {
                    const uvStyle = getUvDetailedStyle(noaa.iuv);
                    const uvVal = noaa.iuv !== undefined ? noaa.iuv : 0.0;
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${uvStyle.textColor}`}>
                          {uvVal.toFixed(1)}
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${uvStyle.badgeClass}`}>
                            {uvStyle.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* SNR */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">SNR</span>
                  {(() => {
                    const snrStyle = getSnrStyle(noaa.solarNoise);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${snrStyle.textColor}`}>
                          {snrStyle.value}
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${snrStyle.badgeClass}`}>
                            {snrStyle.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* MUF */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">MUF (Máx Usable)</span>
                  {(() => {
                    const mufVal = noaa.muf !== undefined ? noaa.muf : 14.50;
                    return (
                      <>
                        <span className="text-lg font-extrabold font-mono block mt-1 text-sky-600">
                          {mufVal.toFixed(2)} <span className="text-[10px] ml-0.5">MHz</span>
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border bg-sky-50 text-sky-700 border-sky-200">
                            Frec. Refractiva
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* LUF */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">LUF (Mín Usable)</span>
                  {(() => {
                    const lufVal = noaa.luf !== undefined ? noaa.luf : 2.00;
                    return (
                      <>
                        <span className="text-lg font-extrabold font-mono block mt-1 text-rose-500">
                          {lufVal.toFixed(2)} <span className="text-[10px] ml-0.5">MHz</span>
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border bg-rose-50 text-rose-700 border-rose-200">
                            Frec. Absorción
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Espectro útil de propagación */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center col-span-2 flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">BANDA UTIL</span>
                  {(() => {
                    const mufVal = noaa.muf !== undefined ? noaa.muf : 14.50;
                    const lufVal = noaa.luf !== undefined ? noaa.luf : 2.00;
                    const diff = mufVal - lufVal;
                    if (diff > 0) {
                      return (
                        <>
                          <span className="text-lg font-extrabold font-mono block mt-1 text-emerald-600">
                            {diff.toFixed(2)} <span className="text-[10px] ml-0.5">MHz</span>
                          </span>
                          <div className="mt-1 flex flex-col items-center gap-0.5">
                            <span className="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Ventana de Transmisión Abierta
                            </span>
                          </div>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <span className="text-lg font-extrabold font-mono block mt-1 text-red-600 animate-pulse">
                            0.00 <span className="text-[10px] ml-0.5">MHz</span>
                          </span>
                          <div className="mt-1 flex flex-col items-center gap-0.5">
                            <span className="px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border bg-red-50 text-red-700 border-red-200 animate-pulse">
                              APAGÓN (LUF ≥ MUF)
                            </span>
                          </div>
                        </>
                      );
                    }
                  })()}
                </div>
              </div>

              {/* Alerta NOAA R */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">Alerta R (Radio)</span>
                  {(() => {
                    const rData = parseNoaaScale(noaa.rScale, "R0 (Normal)");
                    const rStyle = getNoaaScaleStyle(rData.value);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${rStyle.textColor}`}>
                          {rData.value}
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${rStyle.badgeClass}`}>
                            {rData.status}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Alerta NOAA S */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">Alerta S (Solar)</span>
                  {(() => {
                    const sData = parseNoaaScale(noaa.sScale, "S0 (Normal)");
                    const sStyle = getNoaaScaleStyle(sData.value);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${sStyle.textColor}`}>
                          {sData.value}
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${sStyle.badgeClass}`}>
                            {sData.status}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Alerta NOAA G */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">Alerta G (Geomag)</span>
                  {(() => {
                    const gData = parseNoaaScale(noaa.gScale, "G0 (Normal)");
                    const gStyle = getNoaaScaleStyle(gData.value);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${gStyle.textColor}`}>
                          {gData.value}
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${gStyle.badgeClass}`}>
                            {gData.status}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* RTSW Densidad */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">Densidad</span>
                  {(() => {
                    const densityVal = typeof rtsw.density === 'number' ? rtsw.density : 5.4;
                    const style = getDensityStyle(densityVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${style.textColor}`}>
                          {densityVal.toFixed(1)} <span className="text-[10px]">p/cm³</span>
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${style.badgeClass}`}>
                            {style.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* RTSW IMF Bz (N/S) */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">IMF Bz (N/S)</span>
                  {(() => {
                    const bzVal = typeof rtsw.bz === 'number' ? rtsw.bz : 0.5;
                    const style = getBzStyle(bzVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${style.textColor}`}>
                          {bzVal > 0 ? '+' : ''}{bzVal.toFixed(1)} <span className="text-[10px]">nT</span>
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${style.badgeClass}`}>
                            {style.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* RTSW Campo Total Bt */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center flex flex-col justify-between">
                <div>
                  <span className="text-slate-500 text-[9px] uppercase block tracking-wider font-sans font-semibold">IMF BT</span>
                  {(() => {
                    const btVal = typeof rtsw.bt === 'number' ? rtsw.bt : 6.2;
                    const style = getBtStyle(btVal);
                    return (
                      <>
                        <span className={`text-lg font-extrabold font-mono block mt-1 ${style.textColor}`}>
                          {btVal.toFixed(1)} <span className="text-[10px]">nT</span>
                        </span>
                        <div className="mt-1 flex flex-col items-center gap-0.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wide border ${style.badgeClass}`}>
                            {style.text}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* RTSW Diagnóstico Magnetosfera */}
              <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl col-span-2 text-center text-[9.5px] font-sans">
                <span className="text-slate-400 block mb-1 font-semibold uppercase tracking-wider text-[8px]">Diagnóstico Magnetosfera (RTSW)</span>
                {(() => {
                  const bzVal = typeof rtsw.bz === 'number' ? rtsw.bz : 0.5;
                  if (bzVal <= -4.0) {
                    return (
                      <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 animate-pulse inline-block">
                        ⚠️ Bz Sur fuerte (Acoplamiento solar crítico / Riesgo de tormenta)
                      </span>
                    );
                  } else if (bzVal < 0) {
                    return (
                      <span className="font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 inline-block">
                        ⚡ Bz Sur leve (Inestabilidad ionosférica leve)
                      </span>
                    );
                  } else {
                    return (
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 inline-block">
                        ✅ Bz Norte (Campo geomagnético estable / Bloqueo de tormenta)
                      </span>
                    );
                  }
                })()}
              </div>
            </div>

            {/* Band propagation conditions matrix (HamClock Classic) */}
            <div className="mt-4 font-sans">
              <span className="text-slate-500 text-[9px] uppercase tracking-wider font-bold block mb-2 border-b border-slate-100 pb-1">
                PROPAGACIÓN HF (BAND CONDITIONS)
              </span>
              <div className="flex flex-col gap-1.5 text-xs">
                {["80m", "40m", "20m", "15m", "10m"].map((band) => {
                  const sfiVal = parseInt(noaa.dia1 || "150");
                  const kpVal = gfz.Hp60 || 2.1;
                  const cond = getBandStatusText(band, sfiVal, kpVal);
                  
                  return (
                    <div key={band} className="flex items-center justify-between py-1 border-b border-slate-100/60 last:border-b-0 font-mono">
                      <span className="font-bold text-slate-700">{band}</span>
                      <div className="flex items-center gap-1.5">
                        {cond.day && (
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-slate-400 uppercase font-sans">DÍA:</span>
                            <span className={cond.color || cond.day.color}>{cond.day.text}</span>
                          </div>
                        )}
                        {cond.night && (
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-slate-400 uppercase font-sans">NOC:</span>
                            <span className={cond.color || cond.night.color}>{cond.night.text}</span>
                          </div>
                        )}
                        {!cond.day && !cond.night && (
                          <span className={cond.color}>{cond.text}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3 mt-4 text-slate-400 font-sans text-[10px] leading-relaxed flex flex-col gap-1">
            <span>Consola centralizada de propagación e indicadores en tiempo real para bandas HF (HamClock Core).</span>
            {noaa.solar_updated && (
              <span className="text-[9px] text-cyan-600 font-mono">
                Sincronización solar NOAA: {noaa.solar_updated}
              </span>
            )}
          </div>
        </div>

        {/* Tarjeta de Configuración de Clima Espacial & Boletín APRS */}
        <div className="lg:col-span-12 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg text-white space-y-6" id="seccion-configuracion-clima-espacial">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400 shrink-0">
                <Sliders size={22} className="animate-pulse" />
              </div>
              <div>
                <h3 className="font-sans font-bold text-base text-slate-100 flex items-center gap-2">
                  Configuración de Clima Espacial &amp; Boletines APRS
                  <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                    {aprsBlnConfig.addressee || "BLN1SPACE"}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Define umbrales de alerta personalizados (G, R, S), notificaciones sonoras independientes y reglas de transmisión automática por cambio de nivel o cadencia.
                </p>
              </div>
            </div>

            {/* Toggle Switch & Transmit Button */}
            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-800/90 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs text-slate-200 font-medium transition-colors">
                <span>Boletín Automático</span>
                <input 
                  type="checkbox" 
                  checked={aprsBlnConfig.enabled}
                  onChange={(e) => handleSaveAprsBlnConfig({ enabled: e.target.checked })}
                  className="rounded text-indigo-500 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer w-4 h-4"
                />
              </label>

              <button
                type="button"
                onClick={handleManualTransmitBln}
                disabled={isTransmittingBln}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
              >
                <Send size={14} className={isTransmittingBln ? "animate-spin" : ""} />
                <span>{isTransmittingBln ? "Emitiendo..." : "Emitir Ahora"}</span>
              </button>
            </div>
          </div>

          {blnTxMessage && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 px-3.5 py-2 rounded-lg text-xs font-sans font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                <span>{blnTxMessage}</span>
              </div>
            </div>
          )}

          {/* Telemetría Actual NOAA (R / S / G / SFI / Kp / MUF / Banda Útil / Retardo L1) */}
          {(() => {
            const activeRScale = (noaa.rScale ? parseNoaaScale(noaa.rScale, "R0 (Normal)").value : null) || aprsBlnAlerts.rScale || "R0";
            const activeSScale = (noaa.sScale ? parseNoaaScale(noaa.sScale, "S0 (Normal)").value : null) || aprsBlnAlerts.sScale || "S0";
            const activeGScale = (noaa.gScale ? parseNoaaScale(noaa.gScale, "G0 (Normal)").value : null) || aprsBlnAlerts.gScale || "G0";
            const activeSfiVal = parseInt(noaa.dia1) || (aprsBlnMetrics?.sfi ? parseInt(aprsBlnMetrics.sfi) : 150);
            const activeKpVal = gfz.Hp60 !== undefined ? gfz.Hp60 : (gfz.Hp30 !== undefined ? gfz.Hp30 : (typeof aprsBlnMetrics?.kp === 'number' ? aprsBlnMetrics.kp : 2.10));
            const activeMufVal = noaa.muf !== undefined ? noaa.muf : (aprsBlnMetrics?.muf ? parseFloat(aprsBlnMetrics.muf) : 14.50);

            let activeBandaOptima = aprsBlnMetrics?.bandaUtil || "20m";
            if (!aprsBlnMetrics?.bandaUtil) {
              if (activeMufVal >= 28.0) activeBandaOptima = "10m";
              else if (activeMufVal >= 24.89) activeBandaOptima = "12m";
              else if (activeMufVal >= 21.0) activeBandaOptima = "15m";
              else if (activeMufVal >= 18.06) activeBandaOptima = "17m";
              else if (activeMufVal >= 14.0) activeBandaOptima = "20m";
              else if (activeMufVal >= 10.1) activeBandaOptima = "30m";
              else if (activeMufVal >= 7.0) activeBandaOptima = "40m";
              else if (activeMufVal >= 3.5) activeBandaOptima = "80m";
              else activeBandaOptima = "160m";
            }

            const activeDelayL1 = rtsw.speed ? Math.round((1500000.0 / rtsw.speed) / 60.0) : (noaa?.delayL1 ? Math.round(noaa.delayL1) : (aprsBlnMetrics?.delayL1 || 45));

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* Escala R */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Escala R (Apagón)
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className={`text-xl font-extrabold font-mono ${
                      activeRScale === 'R0' ? 'text-emerald-400' :
                      activeRScale === 'R1' || activeRScale === 'R2' ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {activeRScale}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      activeRScale === 'R0' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {activeRScale === 'R0' ? 'Normal' : 'Alerta R'}
                    </span>
                  </div>
                </div>

                {/* Escala S */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Escala S (Solar)
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className={`text-xl font-extrabold font-mono ${
                      activeSScale === 'S0' ? 'text-emerald-400' :
                      activeSScale === 'S1' || activeSScale === 'S2' ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {activeSScale}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      activeSScale === 'S0' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {activeSScale === 'S0' ? 'Normal' : 'Alerta S'}
                    </span>
                  </div>
                </div>

                {/* Escala G */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Escala G (Geomag)
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className={`text-xl font-extrabold font-mono ${
                      activeGScale === 'G0' ? 'text-emerald-400' :
                      activeGScale === 'G1' || activeGScale === 'G2' ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {activeGScale}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      activeGScale === 'G0' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {activeGScale === 'G0' ? 'Normal' : 'Alerta G'}
                    </span>
                  </div>
                </div>

                {/* Flujo Solar SFI */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Flujo Solar SFI
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-extrabold font-mono text-amber-400">
                      {activeSfiVal}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">SFU</span>
                  </div>
                </div>

                {/* Índice Kp */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Índice Kp
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className={`text-xl font-extrabold font-mono ${
                      activeKpVal >= 5 ? 'text-rose-400' :
                      activeKpVal >= 4 ? 'text-amber-400' : 'text-cyan-400'
                    }`}>
                      {activeKpVal.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Hp60</span>
                  </div>
                </div>

                {/* MUF Estimada */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    MUF Estimada
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-extrabold font-mono text-indigo-300">
                      {activeMufVal.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">MHz</span>
                  </div>
                </div>

                {/* Banda Útil HF */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Banda Útil
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-extrabold font-mono text-emerald-300">
                      {activeBandaOptima}
                    </span>
                    <span className="text-[9px] text-emerald-500 font-mono font-bold uppercase">Óptima</span>
                  </div>
                </div>

                {/* Retardo L1 (DSCOVR/ACE) */}
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">
                    Retardo L1 Viento
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-extrabold font-mono text-violet-300">
                      {activeDelayL1}m
                    </span>
                    <span className="text-[9px] text-violet-400 font-mono font-bold">L1-Earth</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SECCIÓN 1: UMBRALES DE ALERTA Y NOTIFICACIONES SONORAS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <ShieldAlert size={15} className="text-amber-400" />
                1. Umbrales de Alerta Personalizados &amp; Notificaciones Sonoras (R / S / G)
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                Alarma audible mediante Síntesis de Voz &amp; Tonos RF
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tarjeta Umbral Escala R */}
              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Escala R (Apagón Radio HF)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveAprsBlnConfig({ soundREnabled: !aprsBlnConfig.soundREnabled })}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                      aprsBlnConfig.soundREnabled 
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    {aprsBlnConfig.soundREnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    <span>{aprsBlnConfig.soundREnabled ? "Audio ON" : "Audio OFF"}</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 block font-medium">
                    Umbral de Alerta R:
                  </label>
                  <div className="grid grid-cols-6 gap-1">
                    {[0, 1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSaveAprsBlnConfig({ thresholdR: level })}
                        className={`py-1 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                          aprsBlnConfig.thresholdR === level
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {level === 0 ? 'OFF' : `R${level}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-slate-800/60 font-mono">
                  <span>Actual: <strong className="text-amber-400">{aprsBlnAlerts.rScale}</strong></span>
                  <button
                    type="button"
                    onClick={() => playSpaceWeatherAlarm('R', 'R2')}
                    className="text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer"
                  >
                    Probar Alarma Audio
                  </button>
                </div>
              </div>

              {/* Tarjeta Umbral Escala S */}
              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    Escala S (Tormenta Radiación)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveAprsBlnConfig({ soundSEnabled: !aprsBlnConfig.soundSEnabled })}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                      aprsBlnConfig.soundSEnabled 
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    {aprsBlnConfig.soundSEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    <span>{aprsBlnConfig.soundSEnabled ? "Audio ON" : "Audio OFF"}</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 block font-medium">
                    Umbral de Alerta S:
                  </label>
                  <div className="grid grid-cols-6 gap-1">
                    {[0, 1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSaveAprsBlnConfig({ thresholdS: level })}
                        className={`py-1 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                          aprsBlnConfig.thresholdS === level
                            ? 'bg-rose-500 text-slate-950 border-rose-400 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {level === 0 ? 'OFF' : `S${level}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-slate-800/60 font-mono">
                  <span>Actual: <strong className="text-rose-400">{aprsBlnAlerts.sScale}</strong></span>
                  <button
                    type="button"
                    onClick={() => playSpaceWeatherAlarm('S', 'S2')}
                    className="text-rose-400 hover:text-rose-300 underline font-semibold cursor-pointer"
                  >
                    Probar Alarma Audio
                  </button>
                </div>
              </div>

              {/* Tarjeta Umbral Escala G */}
              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Escala G (Geomagnetismo Kp)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveAprsBlnConfig({ soundGEnabled: !aprsBlnConfig.soundGEnabled })}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                      aprsBlnConfig.soundGEnabled 
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    {aprsBlnConfig.soundGEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    <span>{aprsBlnConfig.soundGEnabled ? "Audio ON" : "Audio OFF"}</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 block font-medium">
                    Umbral de Alerta G:
                  </label>
                  <div className="grid grid-cols-6 gap-1">
                    {[0, 1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSaveAprsBlnConfig({ thresholdG: level })}
                        className={`py-1 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                          aprsBlnConfig.thresholdG === level
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {level === 0 ? 'OFF' : `G${level}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-slate-800/60 font-mono">
                  <span>Actual: <strong className="text-cyan-400">{aprsBlnAlerts.gScale}</strong></span>
                  <button
                    type="button"
                    onClick={() => playSpaceWeatherAlarm('G', 'G2')}
                    className="text-cyan-400 hover:text-cyan-300 underline font-semibold cursor-pointer"
                  >
                    Probar Alarma Audio
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: MODO AUTOMÁTICO Y REGLAS DE EMISIÓN APRS */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 font-sans">
              <Zap size={15} className="text-indigo-400" />
              2. Reglas de Emisión Automática de Boletín por Cambio de Estado o Intervalo
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              {/* Emisión Inmediata por Cambio de Nivel */}
              <div className="lg:col-span-6 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={aprsBlnConfig.autoSendOnChange}
                    onChange={(e) => handleSaveAprsBlnConfig({ autoSendOnChange: e.target.checked })}
                    className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Envío Automático por Cambio en Nivel de Alerta
                    </span>
                    <span className="text-[11px] text-slate-400 block leading-normal mt-0.5">
                      Transmite de inmediato un boletín a la red APRS en cuanto se detecte una variación en las escalas R, S o G.
                    </span>
                  </div>
                </label>

                {aprsBlnConfig.autoSendOnChange && (
                  <div className="pl-6 pt-1 flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">Intervalo mín. anti-spam:</span>
                    <div className="flex items-center gap-1">
                      {[1, 3, 5, 10, 15].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleSaveAprsBlnConfig({ minIntervalOnChangeMinutes: m })}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border cursor-pointer ${
                            aprsBlnConfig.minIntervalOnChangeMinutes === m
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filtro 'Solo en Alerta' */}
              <div className="lg:col-span-6 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={aprsBlnConfig.aprsOnAlertOnly}
                    onChange={(e) => handleSaveAprsBlnConfig({ aprsOnAlertOnly: e.target.checked })}
                    className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Restringir Cadencia Regular 'Solo en Estado de Alerta'
                    </span>
                    <span className="text-[11px] text-slate-400 block leading-normal mt-0.5">
                      Emite boletines periódicos únicamente si el nivel actual alcanza o supera al menos uno de los umbrales configurados.
                    </span>
                  </div>
                </label>
              </div>

              {/* Cadencia Periódica Estándar */}
              <div className="lg:col-span-12 space-y-2 pt-2 border-t border-slate-800/80">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Cadencia de Transmisión Periódica Estándar:</span>
                  <span className="font-mono text-[11px] text-indigo-400 font-bold">
                    {aprsBlnConfig.intervalMinutes === 0 ? 'Sólo Manual / Evento' : `${aprsBlnConfig.intervalMinutes} minutos`}
                  </span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[15, 30, 60, 120, 240, 0].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleSaveAprsBlnConfig({ intervalMinutes: mins || 30 })}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold font-mono border transition-all cursor-pointer ${
                        aprsBlnConfig.intervalMinutes === mins
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {mins === 0 ? 'Manual / Eventos' : mins >= 60 ? `${mins / 60} horas` : `${mins} min`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: PLANTILLA, OBJETO ADDRESSEE Y PREVIEW TRAMA */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 font-sans">
              <Radio size={15} className="text-indigo-400" />
              3. Configuración del Formato del Mensaje APRS &amp; Preview
            </h4>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              {/* Objeto Addressee */}
              <div className="lg:col-span-4 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Objeto APRS (Addressee):
                </label>
                <input 
                  type="text"
                  maxLength={9}
                  value={aprsBlnConfig.addressee}
                  onChange={(e) => handleSaveAprsBlnConfig({ addressee: e.target.value.toUpperCase() })}
                  placeholder="BLN1SPACE"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 font-bold tracking-wider uppercase"
                />
                <span className="text-[10px] text-slate-500 font-sans block">
                  Identificador de 9 caracteres para boletines (ej: BLN1SPACE, BLN2RADIO)
                </span>
              </div>

              {/* Trama Preview */}
              <div className="lg:col-span-8 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Trama APRS Saliente en Tiempo Real:</span>
                  <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    aprsBlnPreview.length <= 80 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {aprsBlnPreview.length} / 67 caracteres útiles
                  </span>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] text-emerald-400 break-all leading-tight min-h-[38px]">
                  {aprsBlnPreview || 'Generando trama APRS...'}
                </div>
              </div>

              {/* Plantilla de Texto */}
              <div className="lg:col-span-12 space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Plantilla de Formateo de Texto:
                  </label>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="text-slate-400 font-medium mr-1">Insertar Etiqueta:</span>
                    {['{R}', '{S}', '{G}', '{SFI}', '{KP}', '{SSN}', '{MUF}', '{BANDA}', '{RETARDO_L1}', '{STATUS}'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const newTpl = (aprsBlnConfig.template || '') + ' ' + tag;
                          handleSaveAprsBlnConfig({ template: newTpl });
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <input 
                  type="text"
                  value={aprsBlnConfig.template}
                  onChange={(e) => handleSaveAprsBlnConfig({ template: e.target.value })}
                  placeholder="CLIMA ESPACIAL: R{R} S{S} G{G} | SFI:{SFI} Kp:{KP} MUF:{MUF}MHz BANDA:{BANDA} L1:{RETARDO_L1} HF:{STATUS}"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 font-sans pt-1">
                  <span><strong>{"{BANDA}"}</strong>: Banda útil estimada (ej: 20m, 15m, 10m)</span>
                  <span><strong>{"{RETARDO_L1}"}</strong>: Retardo de llegada del viento solar desde L1 (ej: 45m)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Histórico de Transmisiones */}
          {aprsBlnHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                Histórico Reciente de Transmisiones del Boletín
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                {aprsBlnHistory.map((item, idx) => (
                  <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-slate-400 shrink-0 text-[10px]">
                        {new Date(item.timestamp).toLocaleTimeString('es-ES')}
                      </span>
                      <span className="text-emerald-400 truncate font-semibold">
                        {item.packet}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[10px]">
                      <span className="text-indigo-300 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800">
                        {item.rScale} {item.sScale} {item.gScale}
                      </span>
                      <span className="text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded border border-amber-800">
                        HF: {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN DESTACADA: ESTADO OPERATIVO DE BANDAS HF & VHF (13 BANDAS) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs" id="seccion-estado-bandas">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-4">
          <div>
            <h3 className="font-sans font-bold text-sm text-slate-800 flex items-center gap-2">
              <Radio size={16} className="text-cyan-500 animate-pulse" />
              Estado y Disponibilidad de Bandas HF &amp; VHF (13 Bandas)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Análisis dinámico en tiempo real basado en el Flujo Solar actual SFU (<span className="font-mono font-semibold text-amber-600">{currentSfi}</span>) y nivel geomagnético Hp60 (<span className="font-mono font-semibold text-indigo-600">{hpValue.toFixed(2)}</span>).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Buscar banda (ej: 40m, 14MHz)..."
                value={bandSearch}
                onChange={(e) => setBandSearch(e.target.value)}
                className="pl-8 pr-6 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans text-slate-700 placeholder-slate-400 focus:outline-hidden focus:border-cyan-500 focus:bg-white transition-all w-52"
              />
              {bandSearch && (
                <button 
                  onClick={() => setBandSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-[11px] font-sans text-slate-600">
              <Wifi size={12} className="text-emerald-500 animate-pulse" />
              <span>Sincronizado: <span className="font-mono font-bold text-cyan-600">{data?.lastUpdated || '---'}</span></span>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5" id="bandas-filtro-categorias">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={10} />
            Filtrar:
          </span>
          <button
            onClick={() => setBandTab('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              bandTab === 'all'
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Todas (13)
          </button>
          <button
            onClick={() => setBandTab('low')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              bandTab === 'low'
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Bajas / Nocturnas (160m - 40m)
          </button>
          <button
            onClick={() => setBandTab('medium')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              bandTab === 'medium'
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Medias / Todo el Día (30m - 15m)
          </button>
          <button
            onClick={() => setBandTab('high')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              bandTab === 'high'
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Altas / Diurnas (12m - 10m)
          </button>
          <button
            onClick={() => setBandTab('vhf')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              bandTab === 'vhf'
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            VHF / Esporádicas (8m - 6m)
          </button>
        </div>

        {/* Bands Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="bandas-destacadas-grid">
          {filteredBands.map((band) => {
            const bandInfo = calculateBandStatus(band.id);
            const StatusIcon = bandInfo.icon;
            return (
              <div 
                key={band.id}
                className={`border rounded-xl p-3.5 flex flex-col justify-between transition-all hover:shadow-xs hover:scale-[1.01] duration-150 ${bandInfo.color}`}
                id={`band-card-${band.id}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-sans font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                      <Waves size={13} className="text-slate-400" />
                      {bandInfo.name}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${bandInfo.badgeColor} animate-pulse`} />
                  </div>

                  <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wide mt-1">
                    <StatusIcon size={13} className="shrink-0" />
                    <span className={bandInfo.textColor}>{bandInfo.status}</span>
                  </div>

                  <p className="text-[11px] text-slate-600 mt-2 leading-relaxed font-sans">
                    {bandInfo.desc}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200/50">
                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-sans mb-1">
                    <span>Idoneidad SFU ({bandInfo.sfiMin} min):</span>
                    <span className="font-mono font-bold">{currentSfi} / {bandInfo.sfiMin} SFU</span>
                  </div>
                  <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${currentSfi >= bandInfo.sfiMin ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      style={{ width: `${bandInfo.pct}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 font-sans italic leading-tight">
                    {bandInfo.sfiLabel}
                  </p>
                </div>
              </div>
            );
          })}

          {filteredBands.length === 0 && (
            <div className="col-span-full py-10 text-center text-slate-400 font-sans text-xs">
              No se encontraron bandas para el criterio de búsqueda "{bandSearch}".
            </div>
          )}
        </div>
      </div>

      {/* Assessment Table & Forecast Table Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        
        {/* Table 1: Evaluador de Bandas de Radioaficionados */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-sans font-bold text-sm text-slate-700 flex items-center gap-1.5">
              <Radio size={16} className="text-cyan-500" />
              PROPAGACIÓN HF (BAND CONDITIONS)
            </h3>
            <span className="font-sans text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-500 uppercase tracking-wide">Estimación Dinámica</span>
          </div>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left font-sans text-xs" id="band-propagation-table">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2">Rango / Banda</th>
                  <th className="py-2">Frecuencia</th>
                  <th className="py-2">Propagación Día</th>
                  <th className="py-2">Propagación Noche</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700">
                {/* Band 80m-40m */}
                {(() => {
                  const cond = getBandCondition("80m-40m", noaa.dia1, gfz.Hp60);
                  return (
                    <tr>
                      <td className="py-3 font-semibold text-slate-800">80m - 40m</td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">3.5 - 7.3 MHz</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.dayColor}`}>
                          {cond.dayCondition}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.nightColor}`}>
                          {cond.nightCondition}
                        </span>
                      </td>
                    </tr>
                  );
                })()}

                {/* Band 20m */}
                {(() => {
                  const cond = getBandCondition("20m", noaa.dia1, gfz.Hp60);
                  return (
                    <tr>
                      <td className="py-3 font-semibold text-slate-800">20m</td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">14.0 - 14.35 MHz</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.dayColor}`}>
                          {cond.dayCondition}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.nightColor}`}>
                          {cond.nightCondition}
                        </span>
                      </td>
                    </tr>
                  );
                })()}

                {/* Band 15m-17m */}
                {(() => {
                  const cond = getBandCondition("15m-17m", noaa.dia1, gfz.Hp60);
                  return (
                    <tr>
                      <td className="py-3 font-semibold text-slate-800">17m - 15m</td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">18.0 - 21.45 MHz</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.dayColor}`}>
                          {cond.dayCondition}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.nightColor}`}>
                          {cond.nightCondition}
                        </span>
                      </td>
                    </tr>
                  );
                })()}

                {/* Band 10m-12m */}
                {(() => {
                  const cond = getBandCondition("10m-12m", noaa.dia1, gfz.Hp60);
                  return (
                    <tr>
                      <td className="py-3 font-semibold text-slate-800">12m - 10m</td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">24.8 - 29.7 MHz</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.dayColor}`}>
                          {cond.dayCondition}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cond.nightColor}`}>
                          {cond.nightCondition}
                        </span>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Escalas NOAA 3-Day Forecast */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-sans font-bold text-sm text-slate-700 flex items-center gap-1.5">
              <Calendar size={16} className="text-amber-500" />
              Pronóstico de Eventos NOAA (3 Días)
            </h3>
            <span className="font-sans text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-500 uppercase tracking-wide">Official SWPC</span>
          </div>

          <div className="space-y-4 mt-4" id="noaa-scales-list">
            {/* Geomagnetic Storms */}
            <div>
              <span className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider block">A. Tormentas Geomagnéticas (G-Scale)</span>
              <div className="divide-y divide-slate-100 mt-1">
                {noaa.geom.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs font-sans">
                    <span className="text-slate-600 font-medium">{item.dateStr}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-500">Kp: {item.kp}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        item.kp >= 5 ? 'bg-red-50 text-red-700 border border-red-200' :
                        item.kp >= 3 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>
                        {item.kp >= 5 ? `Tormenta G${item.kp - 4}` : 'Estable'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Solar Radiation Storms */}
            <div>
              <span className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider block">B. Tormentas de Radiación Solar (S-Scale)</span>
              <div className="divide-y divide-slate-100 mt-1">
                {noaa.rad.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs font-sans">
                    <span className="text-slate-600 font-medium">{item.dateStr}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      item.level > 0 ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse' :
                      'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}>
                      {item.level > 0 ? `Radiación S${item.level}` : 'Ninguna'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Radio Blackouts */}
            <div>
              <span className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider block">C. Apagón de Radio (R-Scale)</span>
              <div className="divide-y divide-slate-100 mt-1">
                {noaa.blackout.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs font-sans">
                    <span className="text-slate-600 font-medium">{item.dateStr}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      item.level > 0 ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse' :
                      'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}>
                      {item.level > 0 ? `R-Blackout R${item.level}` : 'Ninguno'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pronóstico Próximo Bloque */}
            {noaa.kp_tendencia && (
              <div className="pt-3 border-t border-slate-100">
                <span className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider block">D. Tendencia Estimada Kp (Próximo Bloque)</span>
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center mt-1.5 flex items-center justify-between">
                  <span className="font-sans text-[11px] text-slate-600 font-medium">Pronóstico a corto plazo (SWPC):</span>
                  <span className="font-mono text-[11px] font-extrabold text-cyan-600 px-2 py-0.5 bg-cyan-50 border border-cyan-100 rounded">
                    {noaa.kp_tendencia}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </motion.div>
  );
}
