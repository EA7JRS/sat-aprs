// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import pkg from '../package.json';
import { Pantalla, SECCIONES, seccionDe } from './navigation';
import Sidebar from './components/shell/Sidebar';
import StatusBar from './components/shell/StatusBar';
import SubTabs from './components/shell/SubTabs';
import Inicio from './pages/Inicio';
import Avisos from './pages/Avisos';
import Mapa from './pages/Mapa';
import RadioPrincipal from './pages/RadioPrincipal';
import Direwolf from './pages/Direwolf';
import Aprx from './pages/Aprx';
import Nmea2000Card from './components/Nmea2000Card';
import ResumenHF from './components/radio/ResumenHF';
import MedidoresAire from './components/environment/MedidoresAire';
import BoyasCercanas from './components/environment/BoyasCercanas';
import { AvisoDemostracion } from './components/shell/Etiquetas';
import { useAvisos } from './utils/useAvisos';
import { COLORES_TACTICO, useTema } from './utils/tema';
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Radio, AlertTriangle, ShieldCheck, ShieldAlert, MapPin, Sliders, FileCode, CheckCircle, Database, Globe, CloudRain, Waves, Anchor, Megaphone, VolumeX, Volume2, Locate, X, BellOff, Bell, Compass, Sun, Clock, ExternalLink, Flame, Cpu, CloudSun, Wind, Leaf, BookOpen, RefreshCw, Send } from 'lucide-react';
import { NavareaWarning, ServerTelemetryData, TelemetryConfig } from './types';

// Modular Sub-components (Unified Imports)
import {
  ConsoleHeader,
  TelemetryStatus,
  WeatherStation,
  WeewxConsole,
  AlertMonitor,
  TerminalLogs,
  Configurator,
  AlarmThresholds,
  ScriptExporter,
  DgtTrafficDatabase,
  NotificationPanel,
  SyncScheduler,
  MeteosaludPortal,
  ThreatPollingEngine,
  CecopDashboard,
  AprsAdaptor,
  AprsPacket,
  NtpSyncStatus,
  PatAx25Console,
  HelpOverlay,
  PropagacionMonitor,
  UserProfileManager
} from './components';

import AprsScheduler from './components/radio/AprsScheduler';
import { DEFAULT_SOS_SETTINGS } from './components/emergency/SOSConfiguration';

import { useAdminSession } from './utils/session';
import { getSunriseSunset, isNightTime } from './utils/suncalc';
import { HeartPulse, Mail, Lock, Shield, Key, AlertCircle, Terminal, UserPlus } from 'lucide-react';
import { HelpCircle } from 'lucide-react';
import { customFetch } from './utils/customFetch';

// Maidenhead Locator converter for GPS latitude/longitude (standard HamClock feature)
function getMaidenheadLocator(lat: number, lon: number): string {
  let l = lon + 180;
  let b = lat + 90;

  let f1 = Math.floor(l / 20);
  let f2 = Math.floor(b / 10);
  let field = String.fromCharCode(65 + f1) + String.fromCharCode(65 + f2);

  let s1 = Math.floor((l % 20) / 2);
  let s2 = Math.floor(b % 10);
  let square = s1.toString() + s2.toString();

  let sub1 = Math.floor((l % 2 % 2) * 12);
  let sub2 = Math.floor((b % 1) * 24);
  let subsquare = String.fromCharCode(97 + sub1) + String.fromCharCode(97 + sub2);

  return field + square + subsquare;
}

// Band propagation condition helper (standard HamClock feature)
function getBandStatusText(band: string, sfi: number, kp: number) {
  const isStorm = kp >= 4.5;
  if (isStorm) {
    return { text: "RUIDO/MALA", color: "text-red-400 bg-red-950/30 border border-red-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono" };
  }
  
  if (band === "80m" || band === "40m") {
    return {
      day: { text: "POBRE", color: "text-amber-500 bg-amber-950/20 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: { text: "EXCELENTE", color: "text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono animate-pulse" }
    };
  } else if (band === "20m") {
    return {
      day: sfi > 90 ? { text: "EXCELENTE", color: "text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono animate-pulse" } : { text: "BUENA", color: "text-emerald-500 bg-emerald-950/10 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: sfi > 110 ? { text: "BUENA", color: "text-emerald-500 bg-emerald-950/10 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono" } : { text: "REGULAR", color: "text-amber-400 bg-amber-950/10 border border-amber-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono" }
    };
  } else if (band === "15m") {
    return {
      day: sfi > 120 ? { text: "EXCELENTE", color: "text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono" } : sfi > 95 ? { text: "BUENA", color: "text-emerald-500 bg-emerald-950/10 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono" } : { text: "POBRE", color: "text-amber-500 bg-amber-950/10 border border-amber-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: { text: "CERRADO", color: "text-slate-500 bg-slate-950/40 border border-slate-900 px-1.5 py-0.5 rounded text-[10px] font-mono" }
    };
  } else { // 10m
    return {
      day: sfi > 130 ? { text: "EXCELENTE", color: "text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono" } : sfi > 110 ? { text: "BUENA", color: "text-emerald-500 bg-emerald-950/10 border border-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono" } : { text: "CERRADO", color: "text-slate-500 bg-slate-950/40 border border-slate-900 px-1.5 py-0.5 rounded text-[10px] font-mono" },
      night: { text: "CERRADO", color: "text-slate-500 bg-slate-950/40 border border-slate-900 px-1.5 py-0.5 rounded text-[10px] font-mono" }
    };
  }
}

export default function App() {
  const [data, setData] = useState<ServerTelemetryData | null>(null);
  const [cecopSituacion, setCecopSituacion] = useState<0 | 1 | 2 | 3>(0);
  const [activeTab, setActiveTab] = useState<Pantalla>('inicio');
  const avisosCadena = useAvisos(30000);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [navareas, setNavareas] = useState<NavareaWarning[]>([]);
  const [rtt, setRtt] = useState<number | null>(null);

  // APRS dynamic packet state
  const [aprsPackets, setAprsPackets] = useState<AprsPacket[]>(() => {
    try {
      const stored = localStorage.getItem('sat_aprs_packets');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Eco Mode state
  const [isEcoMode, setIsEcoMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('eco_mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleGlobalEcoChange = () => {
      try {
        setIsEcoMode(localStorage.getItem('eco_mode') === 'true');
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('eco_mode_changed', handleGlobalEcoChange);
    return () => {
      window.removeEventListener('eco_mode_changed', handleGlobalEcoChange);
    };
  }, []);

  // Listen to custom navigation events
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string }>;
      const destino = customEvent.detail?.tab;
      if (!destino) return;
      // Las pantallas retiradas llevan a la lista de avisos
      const existe = SECCIONES.some((sec) => sec.pantallas.some((p) => p.id === destino));
      setActiveTab(existe ? (destino as Pantalla) : 'avisos');
    };
    window.addEventListener('navigate-to-tab', handleNavigation);
    return () => {
      window.removeEventListener('navigate-to-tab', handleNavigation);
    };
  }, []);

  // Floating Action Button states
  const [fabOpen, setFabOpen] = useState<boolean>(false);
  const [isAlarmsSilenced, setIsAlarmsSilenced] = useState<boolean>(false);
  const [isEmergencyBroadcastActive, setIsEmergencyBroadcastActive] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // APRS popup states
  const [incomingAprsModal, setIncomingAprsModal] = useState<AprsPacket | null>(null);
  const [aprsReplyText, setAprsReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isAprsPopupEnabled, setIsAprsPopupEnabled] = useState<boolean>(() => {
    return localStorage.getItem('is_aprs_popup_enabled') !== 'false';
  });
  const [aprsPopupFilter, setAprsPopupFilter] = useState<'ALL' | 'MICE_EMG' | 'MICE_PRIO'>(() => {
    return (localStorage.getItem('aprs_popup_filter') as any) || 'ALL';
  });

  // Hazard tracking for AlertMonitor slide-in animation
  const [knownHazardIds, setKnownHazardIds] = useState<Set<string> | null>(null);
  const [alertAnimKey, setAlertAnimKey] = useState<number>(0);
  const [lastSeenLogId, setLastSeenLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const minMag = data.config?.minMagnitudAlertaVisual ?? 3.0;

    // Define critical events
    const criticalEqs = data.earthquakes.filter(e => e.magnitud >= minMag || e.enRango);
    const criticalNoaa = (data.noaaAlerts || []).filter(n => n.nivel >= 4);
    const criticalTsunamis = (data.tsunamiAlerts || []).filter(t => t.severity === 'WARNING' || t.severity === 'WATCH' || t.severity === 'ADVISORY');

    const currentIds = [
      ...criticalEqs.map(e => `eq-${e.id}`),
      ...criticalNoaa.map(n => `noaa-${n.id}`),
      ...criticalTsunamis.map(t => `tsu-${t.id}`)
    ];

    if (knownHazardIds === null) {
      setKnownHazardIds(new Set(currentIds));
    } else {
      const hasNewEvent = currentIds.some(id => !knownHazardIds.has(id));
      if (hasNewEvent) {
        setAlertAnimKey(prev => prev + 1);
        showToast("⚠️ NUEVA AMENAZA CRÍTICA DETECTADA: Sincronizando consola de alertas");
        playBuzzerSound(1100, 0.3, 'sawtooth');
      }
      setKnownHazardIds(new Set(currentIds));
    }
  }, [data]);

  // Show a temporary tactical toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    // Auto-clear after 4.5 seconds
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 4500);
  };

  // Sound feedback generator (with silent alarm support)
  const playBuzzerSound = (freq: number = 880, duration: number = 0.1, type: OscillatorType = 'sine') => {
    if (isAlarmsSilenced) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.04, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      }
    } catch (_) {}
  };

  const triggerSOSSounds = (freq: number, soundType: 'pulse' | 'continuous' | 'siren') => {
    if (isAlarmsSilenced) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      if (soundType === 'pulse') {
        const playBeep = (delay: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + delay);
          gainNode.gain.setValueAtTime(0, now + delay);
          gainNode.gain.linearRampToValueAtTime(0.04, now + delay + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
          osc.start(now + delay);
          osc.stop(now + delay + 0.15);
        };
        playBeep(0);
        playBeep(0.2);
        playBeep(0.4);
      } else if (soundType === 'continuous') {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else if (soundType === 'siren') {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = 'sawtooth';
        
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.25);
        osc.frequency.linearRampToValueAtTime(freq, now + 0.5);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.75);
        osc.frequency.linearRampToValueAtTime(freq, now + 1.0);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.03, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        
        osc.start(now);
        osc.stop(now + 1.0);
      }
    } catch (_) {}
  };

  // Real-time listener for incoming emergency/priority packets in logs
  useEffect(() => {
    if (!data?.logs || data.logs.length === 0) return;
    
    const newestLog = data.logs[0];
    
    if (!lastSeenLogId) {
      // First run: initialize lastSeenLogId with the newest log ID
      setLastSeenLogId(newestLog.id);
      return;
    }
    
    const lastIndex = data.logs.findIndex(log => log.id === lastSeenLogId);
    let newLogs: any[] = [];
    if (lastIndex > 0) {
      newLogs = data.logs.slice(0, lastIndex);
    } else if (lastIndex === -1) {
      newLogs = [newestLog];
    }
    
    setLastSeenLogId(newestLog.id);
    
    if (newLogs.length === 0) return;
    
    // Read current SOS settings from localStorage (kept in sync by SOSConfiguration)
    let sosSettings: any = null;
    try {
      const stored = localStorage.getItem('alert_monitor_sos_settings');
      sosSettings = stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Error reading SOS settings from localStorage:', e);
    }
    
    const settingsMap = sosSettings || DEFAULT_SOS_SETTINGS;
    
    // Process new logs
    newLogs.forEach(log => {
      const payloadUpper = (log.payload || '').toUpperCase();
      let matchedCode: string | null = null;
      
      if (payloadUpper.includes('!EMERGENCY!')) {
        matchedCode = '!EMERGENCY!';
      } else if (payloadUpper.includes('!PRIORITY!')) {
        matchedCode = '!PRIORITY!';
      } else if (payloadUpper.includes('!SPECIAL!')) {
        matchedCode = '!SPECIAL!';
      }
      
      if (matchedCode && settingsMap[matchedCode]) {
        const config = settingsMap[matchedCode];
        triggerSOSSounds(config.frequency, config.soundProfile);
        showToast(`🔔 CÓDIGO SOS DETECTADO [${matchedCode}] de ${log.source || 'Estación'}: ${log.payload}`);
      }

      // Check if this log is an incoming APRS packet from another station
      if (log.type === 'RX' && log.source !== data?.config?.callsign) {
        const payloadStr = log.payload || '';
        let isBulletin = false;
        let isMessage = false;
        let messageText = payloadStr;
        let callsign = log.source || 'DESCONOCIDO';
        let isEmergency = false;

        // Check if bulletin (standard APRS bulletin dest or payload prefix)
        if (
          log.destination?.startsWith('BLN') || 
          payloadStr.startsWith(':BLN') || 
          /:BLN\d/i.test(payloadStr)
        ) {
          isBulletin = true;
          const match = payloadStr.match(/^:BLN\d[^:]*:(.*)$/i);
          if (match) {
            messageText = match[1];
          }
          if (
            payloadStr.toUpperCase().includes('EMERG') || 
            payloadStr.toUpperCase().includes('ALERTA') || 
            payloadStr.toUpperCase().includes('CRITIC')
          ) {
            isEmergency = true;
          }
        } 
        // Check if direct message (:CALLSIGN :Message)
        else if (payloadStr.startsWith(':')) {
          const match = payloadStr.match(/^:([^:]+):(.*?)$/);
          if (match) {
            isMessage = true;
            messageText = match[2];
            if (
              messageText.toUpperCase().includes('EMERGENCIA') || 
              messageText.toUpperCase().includes('SOS') || 
              messageText.toUpperCase().includes('HELP')
            ) {
              isEmergency = true;
            }
          }
        }

        if (isBulletin || isMessage) {
          const newPacket: AprsPacket = {
            id: `aprs-incoming-${log.id}`,
            sourceEventId: 'received',
            eventType: isEmergency ? 'sismo' : 'manual',
            originalTitle: isBulletin ? `BOLETÍN RECIBIDO DE ${callsign}` : `MENSAJE RECIBIDO DE ${callsign}`,
            originalDetail: messageText,
            timestamp: new Date().toISOString(),
            latitude: data?.gpsd?.lat || 40.416775,
            longitude: data?.gpsd?.lon || -3.703790,
            callsign: callsign,
            destination: log.destination || 'ALL',
            path: log.path || 'VHF',
            aprsType: isBulletin ? 'BULLETIN' : 'MESSAGE',
            symbol: isBulletin ? '&' : '>',
            messageText: messageText,
            packetString: `${callsign}>${log.destination || 'APRS'}:${payloadStr}`,
            status: 'TRANSMITIDO',
            isEmergency: isEmergency,
            visualPriority: isEmergency ? 'Crítica' : 'Normal'
          };

          // Trigger the incoming APRS modal popup if enabled and matches the filter!
          let shouldShowPopup = false;
          if (isAprsPopupEnabled) {
            if (aprsPopupFilter === 'ALL') {
              shouldShowPopup = true;
            } else {
              const fullText = `${callsign} ${messageText} ${log.destination || ''} ${payloadStr}`.toUpperCase();
              
              // Emergency criteria from Mic-E and https://www.aprs.org/aprs12/EmergencyCode.txt (EMG, QRR, SOS, HELP, MED)
              const hasEmergency = isEmergency || 
                /\b(EMG|EMERG|EMERGENCIA|EMERGENCY|QRR|SOS|HELP|MED|MEDICAL|MEDICA)\b/i.test(fullText) ||
                payloadStr.includes('!EMERGENCY!');
                
              // Priority & Special criteria from Mic-E and APRS Search & Rescue (PRIO, SPC, SAR, CIV, FIRE, POL, CRIT)
              const hasPriorityOrSpecial = hasEmergency || 
                /\b(PRIO|PRIORITY|PRIORIDAD|SPC|SPECIAL|ESPECIAL|SAR|CIV|FIRE|INCENDIO|POL|POLICE|POLICIA|CRIT|CRITICAL|HAZ|HAZMAT)\b/i.test(fullText) ||
                payloadStr.includes('!PRIORITY!') || 
                payloadStr.includes('!SPECIAL!');
                
              if (aprsPopupFilter === 'MICE_EMG') {
                shouldShowPopup = hasEmergency;
              } else if (aprsPopupFilter === 'MICE_PRIO') {
                shouldShowPopup = hasPriorityOrSpecial;
              }
            }
          }

          if (shouldShowPopup) {
            setIncomingAprsModal(newPacket);
          }

          // Append to local state list so it appears in the logs and gonio map
          setAprsPackets(prev => {
            const exists = prev.some(p => p.id === newPacket.id);
            if (exists) return prev;
            const updated = [newPacket, ...prev];
            localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));
            return updated;
          });

          // Play notification feedback
          playBuzzerSound(isEmergency ? 1100 : 880, 0.25, isEmergency ? 'sawtooth' : 'sine');
          showToast(`📬 RECIBIDO ${isBulletin ? 'BOLETÍN' : 'MENSAJE'} de ${callsign}: ${messageText}`);
        }
      }
    });
  }, [data?.logs, lastSeenLogId, isAprsPopupEnabled, aprsPopupFilter]);

  // Sync state modifications across multiple tabs or browser windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'eco_mode' && e.newValue !== null) {
        setIsEcoMode(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Emergency Mode State & Autopreserving selection
  const [emergencyMode, setEmergencyMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('emergencyMode');
    return saved === 'true';
  });

  const [nightModeUseSolar, setNightModeUseSolar] = useState<boolean>(() => {
    const saved = localStorage.getItem('nightModeUseSolar');
    if (saved !== null) return saved === 'true';
    return true; // Solar calculations enabled by default
  });

  const [startHour, setStartHour] = useState<number>(() => {
    const saved = localStorage.getItem('nightModeStartHour');
    return saved !== null ? parseInt(saved, 10) : 20; // 20:00 (8 PM)
  });

  const [endHour, setEndHour] = useState<number>(() => {
    const saved = localStorage.getItem('nightModeEndHour');
    return saved !== null ? parseInt(saved, 10) : 8; // 08:00 (8 AM)
  });

  // Color de la consola: claro, oscuro, táctico, el del sistema o automático (src/utils/tema.ts)
  const tema = useTema({
    lat: data?.gpsd?.lat ?? 40.416775,
    lon: data?.gpsd?.lon ?? -3.70379,
    solar: nightModeUseSolar,
    horaInicio: startHour,
    horaFin: endHour,
  });
  // El modo de emergencia es un aviso visual aparte y se impone al color elegido
  const dayMode = !emergencyMode && tema.efectivo === 'claro';
  const nightMode = !emergencyMode && tema.efectivo === 'tactico';
  const nightModeAuto = tema.elegido === 'auto';
  const tactico = COLORES_TACTICO.find((c) => c.id === tema.colorTactico) ?? COLORES_TACTICO[0];

  // Automatic Version Updates S.A.T.
  const APP_VERSION = '2.4.0';
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<string>('');
  const [forceUpdate, setForceUpdate] = useState<boolean>(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState<boolean>(false);
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);

  // Sesión de administrador local (token de la estación)
  const adminSession = useAdminSession();
  
  // --- SINCRONIZADOR DE CONFIGURACIONES Y MONITOREO DE REINICIOS S.A.T. ---
  const [configVerification, setConfigVerification] = useState<any>(null);
  const [prevUptime, setPrevUptime] = useState<string | null>(null);

  const runConfigVerification = async () => {
    try {
      const res = await customFetch('/api/files/verify');
      if (res.ok) {
        const json = await res.json();
        setConfigVerification(json);
        
        // Notify any errors found
        if (json.success && json.results) {
          const errors: string[] = [];
          Object.entries(json.results).forEach(([service, info]: [string, any]) => {
            if (!info.exists) {
              errors.push(`${service.toUpperCase()} (Ausente)`);
            } else if (!info.valid) {
              errors.push(`${service.toUpperCase()} (Corrupto: ${info.error})`);
            }
          });
          
          if (errors.length > 0) {
            showToast(`⚠️ Alerta Sincronizador: Fallos de configuración detectados: ${errors.join(', ')}`);
          } else {
            showToast(`✅ Sincronizador NUC: Todos los ficheros de configuración ('aprx', 'direwolf', 'weewx', 'pat') validados tras el reinicio.`);
          }
        }
      }
    } catch (err) {
      console.error('Error running config verification:', err);
    }
  };

  // Run config verification on initial load
  useEffect(() => {
    runConfigVerification();
  }, []);

  // Monitor uptime reset (reinicio del NUC)
  useEffect(() => {
    const currentUptime = data?.nucStats?.uptime;
    if (currentUptime) {
      if (prevUptime) {
        const parseUptimeToMinutes = (uptimeStr: string): number => {
          try {
            const parts = uptimeStr.split(' ');
            let mins = 0;
            parts.forEach(p => {
              if (p.endsWith('d')) mins += parseInt(p, 10) * 24 * 60;
              else if (p.endsWith('h')) mins += parseInt(p, 10) * 60;
              else if (p.endsWith('m')) mins += parseInt(p, 10);
            });
            return mins;
          } catch {
            return 0;
          }
        };

        const prevMins = parseUptimeToMinutes(prevUptime);
        const currMins = parseUptimeToMinutes(currentUptime);
        if (currMins < prevMins) {
          console.log(`[REBOOT DETECTED] Uptime decreased from ${prevUptime} to ${currentUptime}`);
          showToast('🔄 Se ha detectado un reinicio en el NUC. Ejecutando verificación de configuraciones...');
          runConfigVerification();
        }
      }
      setPrevUptime(currentUptime);
    }
  }, [data?.nucStats?.uptime]);

  // --- SYSTEM AUTOMATIC AGPS RESTART (5 MINUTES INACTIVITY DETECTOR) ---
  const lastGpsUpdateRef = useRef<number>(Date.now());
  const lastGpsCoordsRef = useRef<{lat: number; lon: number} | null>(null);

  useEffect(() => {
    const currentLat = data?.gpsd?.lat;
    const currentLon = data?.gpsd?.lon;
    
    if (currentLat !== undefined && currentLon !== undefined) {
      const coordsChanged = !lastGpsCoordsRef.current || 
        lastGpsCoordsRef.current.lat !== currentLat || 
        lastGpsCoordsRef.current.lon !== currentLon;
        
      if (coordsChanged) {
        lastGpsUpdateRef.current = Date.now();
        lastGpsCoordsRef.current = { lat: currentLat, lon: currentLon };
      }
    }
  }, [data?.gpsd?.lat, data?.gpsd?.lon]);

  // Periodically check if position hasn't changed or been updated for 5 minutes
  useEffect(() => {
    const checkInterval = setInterval(async () => {
      // 5 minutes is 300,000 milliseconds
      const elapsed = Date.now() - lastGpsUpdateRef.current;
      if (elapsed >= 300000) {
        console.log("[A-GPS AUTO-RESTART] Posición fija/móvil inactiva hace 5 min. Reiniciando servicio de asistencia...");
        // Reset timer to avoid hammering the endpoint
        lastGpsUpdateRef.current = Date.now();
        
        try {
          const res = await customFetch('/api/agps/sync?trigger=auto', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger: 'auto' })
          });
          
          if (res.ok) {
            showToast("⚠️ Servicio A-GPS reiniciado automáticamente tras detectar 5 minutos de inactividad de datos de posición.");
            // Refresh telemetry to immediately load new logs
            fetchTelemetry(true);
          }
        } catch (err) {
          console.error("Error auto-restarting A-GPS:", err);
        }
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(checkInterval);
  }, []);
  // Automatic countdown timer for forced reloads
  useEffect(() => {
    if (!showUpdatePrompt || !forceUpdate) {
      setUpdateCountdown(null);
      return;
    }
    setUpdateCountdown(5);
    const interval = setInterval(() => {
      setUpdateCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showUpdatePrompt, forceUpdate]);

  const handleToggleDayMode = () => {
    setEmergencyMode(false);
    localStorage.setItem('emergencyMode', 'false');
    tema.setElegido(dayMode ? 'oscuro' : 'claro');
  };

  const handleToggleNightMode = () => {
    setEmergencyMode(false);
    localStorage.setItem('emergencyMode', 'false');
    tema.setElegido(nightMode ? 'oscuro' : 'tactico');
  };

  const handleToggleEmergencyMode = () => {
    setEmergencyMode(prev => {
      const newVal = !prev;
      localStorage.setItem('emergencyMode', String(newVal));
      return newVal;
    });
  };

  const handleToggleNightModeAuto = (v: boolean) => {
    tema.setElegido(v ? 'auto' : tema.efectivo);
  };

  const handleToggleNightModeUseSolar = (v: boolean) => {
    setNightModeUseSolar(v);
    localStorage.setItem('nightModeUseSolar', String(v));
  };

  const handleChangeHours = (start: number, end: number) => {
    setStartHour(start);
    setEndHour(end);
    localStorage.setItem('nightModeStartHour', String(start));
    localStorage.setItem('nightModeEndHour', String(end));
  };

  // Sync navareas state with backend telemetry data
  useEffect(() => {
    if (data?.navareas && data.navareas.length > 0) {
      setNavareas(data.navareas);
    }
  }, [data?.navareas]);

  // Poll Express API to fetch latest real-time telemetry every 3 seconds
  const fetchTelemetry = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    const start = performance.now();
    try {
      const response = await customFetch(`/api/telemetry?eco=${isEcoMode ? 1 : 0}`);
      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.statusText}`);
      }
      const json = await response.json();
      setData(json);
      setErrorMessage(null);
      const end = performance.now();
      setRtt(Math.round(end - start));
    } catch (err: any) {
      console.error('Error fetching telemetry:', err);
      setErrorMessage('Fallo al conectar con el servidor Express. Reintentando enlace...');
      setRtt(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchTelemetry();

    const intervalTime = isEcoMode ? 5000 : 1500;

    // Constant background polling loop (dynamic based on Eco Mode)
    const interval = setInterval(() => {
      fetchTelemetry(true);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isEcoMode]);

  // Handler: Update station configurations dynamically
  const handleSaveConfig = async (updatedConfig: TelemetryConfig): Promise<boolean> => {
    try {
      const response = await customFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
      });
      if (response.ok) {
        await fetchTelemetry(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // Handler: Antena Gonio-Radar relocation trigger
  const handleRelocate = async (lat: number, lon: number, locationName: string, alt?: number) => {
    try {
      const response = await customFetch('/api/gpsd/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          lat, 
          lon, 
          alt,
          mode: alt !== undefined ? 3 : 2, // 3D if altitude is present, else 2D or preserve
          speedKmh: 0, 
          forceFallback: false 
        })
      });
      if (response.ok) {
        await fetchTelemetry(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Inject Custom Raw APRS strings
  const handleInjectRaw = async (payload: string): Promise<boolean> => {
    try {
      const response = await customFetch('/api/aprs/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'RAW_PACKET', payload })
      });
      if (response.ok) {
        await fetchTelemetry(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // Handler: Acknowledge and Mark APRS Message as Read
  const handleAcknowledgeAprs = (packetId: string) => {
    setAprsPackets(prev => {
      const updated = prev.map(pkt => {
        if (pkt.id === packetId) {
          return { 
            ...pkt, 
            status: 'TRANSMITIDO' as const, 
            auditNotes: 'Leído y Reconocido por el Operador de Consola' 
          };
        }
        return pkt;
      });
      localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));
      return updated;
    });
    
    showToast(`📬 Mensaje de ${incomingAprsModal?.callsign || 'Estación'} reconocido.`);
    setIncomingAprsModal(null);
    setIsReplying(false);
    setAprsReplyText('');
  };

  // Handler: Test Sismo injection
  const handleTriggerSismoTest = async (magnitude: number) => {
    try {
      const response = await customFetch('/api/aprs/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'TRIGGER_SISMO_TEST', value: magnitude })
      });
      if (response.ok) {
        await fetchTelemetry(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Test NOAA solar alert injection
  const handleTriggerNoaaTest = async (scale: 'G' | 'R' | 'S', level: number) => {
    try {
      const response = await customFetch('/api/aprs/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'TRIGGER_NOAA_TEST', value: { scale, level } })
      });
      if (response.ok) {
        await fetchTelemetry(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Clear TNC / Packet logs
  const handleClearLogs = async () => {
    try {
      const response = await customFetch('/api/telemetry/clear-logs', {
        method: 'POST'
      });
      if (response.ok) {
        showToast('Búfer de logs del Terminal TNC borrado exitosamente.');
        await fetchTelemetry(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendReply = () => {
    if (!aprsReplyText.trim() || !incomingAprsModal) return;
    
    const replyUpper = aprsReplyText.toUpperCase();
    let replyPriority: 'Crítica' | 'Alta' | 'Informativa' | 'Normal' = 'Normal';
    let isReplyEmergency = false;

    if (replyUpper.includes('!EMERGENCY!')) {
      replyPriority = 'Crítica';
      isReplyEmergency = true;
    } else if (replyUpper.includes('!PRIORITY!')) {
      replyPriority = 'Alta';
    } else if (replyUpper.includes('!SPECIAL!')) {
      replyPriority = 'Informativa';
    } else if (replyUpper.includes('!ALERT!') || replyUpper.includes('!TESTALARM!')) {
      isReplyEmergency = true;
    }

    const replyPacket: AprsPacket = {
      id: `aprs-reply-${Date.now()}`,
      sourceEventId: 'manual',
      eventType: 'manual',
      originalTitle: `RESPUESTA A ${incomingAprsModal.callsign}`,
      originalDetail: aprsReplyText,
      timestamp: new Date().toISOString(),
      latitude: data?.gpsd?.lat || 40.416775,
      longitude: data?.gpsd?.lon || -3.703790,
      callsign: data?.config?.callsign || 'EA1URG-10',
      destination: incomingAprsModal.callsign,
      path: 'WIDE1-1,WIDE2-1',
      aprsType: 'MESSAGE',
      symbol: '>',
      messageText: aprsReplyText,
      packetString: `:${incomingAprsModal.callsign.padEnd(9, ' ')}:${aprsReplyText}`,
      status: 'TRANSMITIDO',
      transmittedAt: new Date().toISOString(),
      isEmergency: isReplyEmergency,
      visualPriority: replyPriority
    };

    const updated = [replyPacket, ...aprsPackets];
    setAprsPackets(updated);
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

    // Sound feedback
    playBuzzerSound(880, 0.1, 'sine');
    setTimeout(() => playBuzzerSound(1100, 0.1, 'sine'), 100);

    if (showToast) {
      showToast(`Mensaje APRS transmitido con éxito a ${incomingAprsModal.callsign}.`);
    }

    setIncomingAprsModal(null);
    setIsReplying(false);
    setAprsReplyText('');
  };

  // Automated Simulation Loop for Incoming APRS Messages, Bulletins and Alerts
  useEffect(() => {
    // Simulador desactivado por petición del usuario para mantener la consola libre de tráfico simulado intrusivo
    return;
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 font-mono gap-3 p-4">
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-full text-emerald-400 animate-spin">
          <Radio size={28} />
        </div>
        <p className="text-xs uppercase tracking-widest animate-pulse">Enlazando terminal con el bus APRS S.A.T....</p>
        {errorMessage && (
          <p className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/20 px-3 py-1.5 rounded max-w-md text-center mt-2">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  // Count active hazards in critical range
  const rangeHazards = data.earthquakes.filter(e => e.enRango).length;

  return (
    <MotionConfig reducedMotion={isEcoMode ? "always" : "user"}>
      <motion.div 
        initial={false}
        animate={{
          backgroundColor: dayMode ? "#f1f5f9" : nightMode ? tactico.fondo : emergencyMode ? "#0b0101" : "#070b12",
          color: dayMode ? "#0f172a" : nightMode ? tactico.texto : emergencyMode ? "#fca5a5" : "#f1f5f9"
        }}
        transition={{ duration: isEcoMode ? 0 : 0.8, ease: "easeInOut" }}
        className={`min-h-screen flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950 ${isEcoMode ? 'eco-mode' : ''} ${
          dayMode ? 'theme-day' : nightMode ? `theme-night tac-${tema.colorTactico}` : emergencyMode ? 'theme-emergency' : 'theme-standard'
        }`}
      >
      {/* Estilo global para transiciones de color de fondo, borde y texto en todo el documento */}
      <style dangerouslySetInnerHTML={{ __html: `
        body, #root, .min-h-screen, .min-h-screen * {
          transition: background-color 0.8s cubic-bezier(0.4, 0, 0.2, 1), 
                      color 0.8s cubic-bezier(0.4, 0, 0.2, 1), 
                      border-color 0.8s cubic-bezier(0.4, 0, 0.2, 1), 
                      box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1),
                      filter 0.8s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
      `}} />
      {emergencyMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          /* High-Visibility Tactical Emergency Mode (Crimson) Overrides */
          body, #root, .min-h-screen {
            background-color: #0b0101 !important; /* Deep crimson black background */
          }
          
          /* Tactical Crimson low-glare filter for maps, charts, etc. */
          iframe, .recharts-responsive-container, #radar-map-canvas, svg, canvas, img {
            filter: sepia(1) saturate(2.4) hue-rotate(-15deg) brightness(0.6) contrast(1.2) !important;
          }
          
          /* Deep vibrant crimson theme for all status labels and badges */
          .text-emerald-400, .text-emerald-300, .text-cyan-400, .text-blue-400, .text-indigo-400, .text-yellow-400,
          .text-emerald-500, .text-amber-500, .text-sky-450, .text-teal-400, .text-orange-400, .text-red-400, .text-green-400 {
            color: #ef4444 !important; /* Vivid Red */
          }
          
          .border-emerald-500, .border-emerald-500\/30, .border-emerald-500\/40, .border-emerald-500\/50, 
          .border-cyan-500, .border-blue-500, .border-indigo-500, .border-slate-800, .border-slate-850 {
            border-color: rgba(239, 68, 68, 0.3) !important;
          }
          
          .bg-emerald-400, .bg-emerald-500, .bg-emerald-950, .bg-emerald-950\/20, .bg-blue-950\/40, .bg-indigo-950\/40 {
            background-color: rgba(127, 29, 29, 0.25) !important;
            border-color: rgba(239, 68, 68, 0.3) !important;
          }
          
          /* Pure dark tactical background for containers and cards */
          .bg-slate-900, .bg-slate-950, .bg-slate-950\/80, .bg-slate-900\/50, .bg-slate-950\/40, .bg-\[\#070b12\], .bg-slate-900\/45 {
            background-color: #0d0404 !important;
            border-color: #3b0d0d !important;
          }
          
          /* Text overrides with soft desaturated rose tint */
          .text-slate-100, .text-slate-200, .text-slate-300, .text-white {
            color: #fca5a5 !important; /* Soft Rose */
          }
          .text-slate-400, .text-slate-500 {
            color: #991b1b !important; /* Crimson Dark */
          }
          
          /* Special active indicators: keep them bright warning red */
          .bg-emerald-400.text-slate-950 {
            background-color: #ef4444 !important;
            color: #ffffff !important;
          }
        `}} />
      )}
      {(
        <>
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      <Sidebar
        actual={seccionDe(activeTab).id}
        onIr={(seccion) => setActiveTab(seccion.pantallas[0].id)}
        avisosActivos={avisosCadena.avisos.filter((a) => a.cumple).length}
        version={pkg.version}
      />
      <div className="flex-1 min-w-0 flex flex-col">
      <StatusBar config={data.config} gpsd={data.gpsd} ntp={data.ntp} txEnabled={adminSession.txEnabled} tema={tema.elegido} onTema={(t) => { setEmergencyMode(false); localStorage.setItem('emergencyMode', 'false'); tema.setElegido(t); }} colorTactico={tema.colorTactico} onColorTactico={tema.setColorTactico} />

      {/* CENTRAL EMERGENCY & BROADCAST STATUS HUB */}
      {(rangeHazards > 0 || isEmergencyBroadcastActive) && (
        <div className={`border-b px-4 py-2.5 flex items-center justify-between text-xs font-mono gap-3 ${
          isAlarmsSilenced 
            ? 'bg-slate-900 border-slate-800 text-slate-400' 
            : 'bg-red-950/45 border-red-500/40 text-red-300 animate-pulse'
        }`}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className={`${isAlarmsSilenced ? 'text-slate-500' : 'text-red-500'} shrink-0`} />
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <span className={`font-black uppercase tracking-wider ${isAlarmsSilenced ? 'text-slate-400' : 'text-red-400'}`}>
                {isEmergencyBroadcastActive ? '[EMISIÓN DE EMERGENCIA ACTIVA]' : '[ALERTA DE SEGURIDAD CIVIL REMER]'}
              </span>
              <span>
                {isEmergencyBroadcastActive 
                  ? 'Boletín de Emergencia Especial emitido en 144.800 MHz: Atención a todas las estaciones REMER S.A.T.'
                  : `Detectados ${rangeHazards} eventos sísmicos críticos dentro del perímetro de cobertura de ${data.config.filterRadiusKm} km de la estación.`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAlarmsSilenced && (
              <span className="text-[9px] bg-slate-850 border border-slate-750 text-slate-400 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                🔇 ALARMAS SILENCIADAS
              </span>
            )}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
              isAlarmsSilenced ? 'bg-slate-800 text-slate-500' : 'bg-red-900 text-white'
            }`}>
              TRANSMISIÓN CRÍTICA
            </span>
          </div>
        </div>
      )}

      <SubTabs seccion={seccionDe(activeTab)} actual={activeTab} onIr={setActiveTab} />

      {/* ERROR STATUS BAR */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="m-4 mb-0 bg-red-950/30 border border-red-500/30 p-3 rounded-xl text-xs text-red-300 font-mono flex items-center gap-2"
          >
            <AlertTriangle className="text-red-500" size={14} />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTAINER BODY TAB CONTENT AREA */}
      <main className="flex-1 p-4 lg:px-6 max-w-7xl mx-auto w-full flex flex-col gap-4">
        
        {activeTab === 'inicio' ? (
          <Inicio data={data} onIr={setActiveTab} />
        ) : activeTab === 'avisos' ? (
          <Avisos sismos={data.earthquakes} config={data.config} onGuardar={(cambios) => handleSaveConfig(cambios as TelemetryConfig)} />
        ) : activeTab === 'mapa' ? (
          <Mapa onIr={setActiveTab} config={data.config} onGuardar={(cambios) => handleSaveConfig(cambios as TelemetryConfig)} />
        ) : activeTab === 'radio-principal' ? (
          <RadioPrincipal config={data.config} onGuardar={(cambios) => handleSaveConfig(cambios as TelemetryConfig)} />
        ) : activeTab === 'perfil' ? (
          <Configurator config={data.config} onSaveConfig={handleSaveConfig} gpsd={data.gpsd} initialTab="profile" />
        ) : activeTab === 'monitor' ? (
          /* ESTACIÓN Y METEO: la meteorología de la estación. El tráfico está en Radio y los avisos en Avisos. */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <h1 className="text-2xl font-semibold text-slate-100">Estación y meteo</h1>
            {data.meteoSinDatos ? (
              <p id="aviso-meteo-sin-datos" className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm">
                <b>Sin datos meteorológicos.</b> Ninguna fuente responde ahora mismo (OpenWeatherMap, AEMET u Open-Meteo), así que no se muestra nada.
                Se reintenta solo. Las fuentes se ajustan en Estación → Perfil y en Sistema → Configuración.
              </p>
            ) : (
              <>
                {data.meteoFuente && (
                  <p id="meteo-fuente" className="text-sm text-slate-400">
                    Fuente: <span className="text-slate-200">{data.meteoFuente}</span>
                    {data.meteoFuente.startsWith('Open-Meteo') && ' · datos de modelo meteorológico, no de una estación. Con clave de AEMET u OpenWeatherMap se usan observaciones.'}
                  </p>
                )}
                <WeatherStation weather={data.weather} iqair={data.iqair} />
              </>
            )}
            <MedidoresAire />
          </motion.div>
        ) : activeTab === 'pruebas' ? (
          /* PRUEBAS Y SIMULACIÓN: herramientas para inyectar sucesos de prueba; nada de esto sale al aire */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <h1 className="text-2xl font-semibold text-slate-100">Pruebas y simulación</h1>
            <p className="text-sm text-slate-400">
              Herramientas para ensayar con sucesos de prueba. Lo que se inyecta aquí se ve en pantalla pero nunca se transmite; los avisos reales están en Avisos.
            </p>
            {/* Terminal de tramas con inyección de pruebas (antes en la pantalla de Direwolf) */}
            <TerminalLogs 
              logs={data.logs ? data.logs.filter(l => l.type === 'TX' || l.type === 'RX' || l.type === 'WINLINK') : []}
              onInjectRaw={handleInjectRaw}
              onTriggerSismoTest={handleTriggerSismoTest}
              onTriggerNoaaTest={handleTriggerNoaaTest}
              onClearLogs={handleClearLogs}
              retentionLimit={data.config?.terminalLogsRetention || 150}
            />
            <ThreatPollingEngine 
              gpsd={data.gpsd}
              earthquakes={data.earthquakes} 
              noaaAlerts={data.noaaAlerts} 
              tsunamiAlerts={data.tsunamiAlerts || []} 
              csnStations={data.csnStations || []} 
              dgtIncidents={data.dgtIncidents || []} 
              erddapBuoys={data.erddapBuoys || []} 
              navareas={navareas} 
              weather={data.weather} 
              aemetAlerts={data.aemetAlerts || []}
              config={data.config}
              onInjectRaw={handleInjectRaw} 
              onRelocate={handleRelocate}
              isEcoMode={isEcoMode}
            />
            <AlertMonitor 
              earthquakes={data.earthquakes} 
              noaaAlerts={data.noaaAlerts} 
              tsunamiAlerts={data.tsunamiAlerts || []} 
              minMagnitudeVisualAlert={data.config.minMagnitudAlertaVisual ?? 3.0}
              onRelocate={handleRelocate}
              aprsPackets={aprsPackets}
              setAprsPackets={setAprsPackets}
              config={data.config}
            />
          </motion.div>
        ) : activeTab === 'cecop-dashboard' ? (
          /* PILAR II: COORDINACIÓN Y VERIFICACIÓN CECOP (PEM) */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <AvisoDemostracion>Herramienta de coordinación y simulacros. Los focos de calor que registra son los reales de NASA FIRMS; los sucesos que se añadan a mano para un simulacro no se emiten. Los avisos que difunde la estación están en «En vigor».</AvisoDemostracion>
            <CecopDashboard 
              earthquakes={data.earthquakes || []} 
              tsunamiAlerts={data.tsunamiAlerts || []} 
              csnStations={data.csnStations || []} 
              dgtIncidents={data.dgtIncidents || []} 
              erddapBuoys={data.erddapBuoys || []} 
              navareas={navareas} 
              weather={data.weather} 
              iqair={data.iqair}
              playBuzzerSound={playBuzzerSound}
              showToast={showToast}
              aprsPackets={aprsPackets}
              setAprsPackets={setAprsPackets}
              cecopSituacion={cecopSituacion}
              setCecopSituacion={setCecopSituacion}
            />
          </motion.div>
        ) : activeTab === 'aprs-adaptor' ? (
          /* PILAR IX: COMPILADOR Y ADAPTADOR APRS (AX.25) */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <AprsAdaptor 
              earthquakes={data.earthquakes || []} 
              csnStations={data.csnStations || []} 
              dgtIncidents={data.dgtIncidents || []} 
              navareas={navareas} 
              aprsPackets={aprsPackets} 
              setAprsPackets={setAprsPackets} 
              playBuzzerSound={playBuzzerSound}
              showToast={showToast}
              weather={data.weather}
              isAprsPopupEnabled={isAprsPopupEnabled}
              setIsAprsPopupEnabled={(val) => {
                setIsAprsPopupEnabled(val);
                localStorage.setItem('is_aprs_popup_enabled', val ? 'true' : 'false');
              }}
              aprsPopupFilter={aprsPopupFilter}
              setAprsPopupFilter={(val) => {
                setAprsPopupFilter(val);
                localStorage.setItem('aprs_popup_filter', val);
              }}
            />
          </motion.div>
        ) : activeTab === 'pat-pillar' ? (
          /* PILAR X: PAT WINLINK & AX.25 NATIVO */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <PatAx25Console callsign={data.config.callsign} />
          </motion.div>
        ) : activeTab === 'dgt' ? (
          /* DGT ETRAFFIC INCIDENTS DATABASE PANEL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <DgtTrafficDatabase 
              incidents={data.dgtIncidents || []} 
              gpsd={data.gpsd} 
              onRelocate={(lat, lon) => handleRelocate(lat, lon, 'Incidencia DGT')} 
            />
          </motion.div>
        ) : activeTab === 'portus' ? (
          /* PORTUS OCEANOGRAPHIC PUERTOS DEL ESTADO DATABASE */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <h1 className="text-2xl font-semibold text-slate-100">Boyas</h1>
            <BoyasCercanas />
          </motion.div>
        ) : activeTab === 'salud' ? (
          /* METEOSALUD PLAN TEMPERATURE WATCH PORTAL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <AvisoDemostracion>Pantalla de consulta. Los avisos que la estación difunde por APRS son solo los de la pestaña «En vigor».</AvisoDemostracion>
            <MeteosaludPortal 
              gpsd={data.gpsd} 
              onInjectRaw={handleInjectRaw} 
            />
          </motion.div>
        ) : activeTab === 'propagacion' ? (
          /* HF PROPAGATION & SPACE WEATHER MONITOR */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <ResumenHF />
            <h2 className="text-lg font-semibold text-slate-100 mt-2">Detalle: índices, viento solar y previsión de la NOAA</h2>
            {/* Panel dibujado en claro: «sat-claro» hace que siga al color de la consola (src/index.css) */}
            {data.propagation ? (
              <div className="sat-claro flex flex-col gap-4"><PropagacionMonitor data={data.propagation} /></div>
            ) : (
              <p id="hf-detalle-sin-datos" className="border border-amber-700 bg-amber-950 text-amber-300 rounded-xl px-4 py-3 text-sm">
                El detalle no se muestra porque falta alguna fuente: {(data.propagacionFaltan || ['todas las fuentes']).join(', ')}.
                Aparecerá en cuanto respondan; no se rellena con cifras supuestas. El resumen de arriba enseña lo que sí se ha podido leer.
              </p>
            )}
          </motion.div>
        ) : activeTab === 'weewx-pillar' ? (
          /* PILAR DE CONTROL WEEWX EXCLUSIVO */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <WeewxConsole 
              weather={data.weather} 
              iqair={data.iqair} 
              callsign={data.config.callsign}
            />
          </motion.div>
        ) : activeTab === 'direwolf-pillar' ? (
          <Direwolf />
        ) : activeTab === 'aprx-pillar' ? (
          <Aprx />
        ) : activeTab === 'conectividad' ? (
          /* CONECTIVIDAD: emisión NMEA 2000 (SocketCAN) */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <Nmea2000Card isAdmin={adminSession.isAdmin} showToast={showToast} />
          </motion.div>
        ) : activeTab === 'sistema' ? (
          /* DIÁGNOSTICOS Y CONTROL DE SISTEMA RED SAT */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Estado del equipo y ajustes de pantalla (antes, la cabecera de toda la consola) */}
            <div className="rounded-xl overflow-hidden border border-slate-800">
              <ConsoleHeader 
              gpsd={data.gpsd} 
              ntp={data.ntp} 
              config={data.config}
              nucStats={data.nucStats}
              onRefresh={() => fetchTelemetry()}
              isRefreshing={isRefreshing}
              nightMode={nightMode}
              onToggleNightMode={handleToggleNightMode}
              dayMode={dayMode}
              onToggleDayMode={handleToggleDayMode}
              emergencyMode={emergencyMode}
              onToggleEmergencyMode={handleToggleEmergencyMode}
              nightModeAuto={nightModeAuto}
              onToggleNightModeAuto={handleToggleNightModeAuto}
              nightModeUseSolar={nightModeUseSolar}
              onToggleNightModeUseSolar={handleToggleNightModeUseSolar}
              startHour={startHour}
              endHour={endHour}
              onChangeHours={handleChangeHours}
              rtt={rtt !== null ? rtt : undefined}
              noaaAlerts={data.noaaAlerts}
              isAdmin={adminSession.isAdmin}
              propagation={data.propagation}
              onUpdateConfig={handleSaveConfig}
            />
            </div>
            <UserProfileManager />
            {/* Avisos sonoros y notificaciones del navegador */}
            <NotificationPanel 
              earthquakes={data.earthquakes} 
              noaaAlerts={data.noaaAlerts} 
              navareas={navareas} 
              minMagnitudVisualThreshold={data.config.minMagnitudAlertaVisual ?? 3.0}
              weather={data.weather}
              tsunamiAlerts={data.tsunamiAlerts || []}
              cecopSituacion={cecopSituacion}
              aemetAlerts={data.aemetAlerts || []}
              aemetAlertsSubscriptionEnabled={data.config.aemetAlertsSubscriptionEnabled ?? true}
              gpsd={data.gpsd}
            />

            {/* Low-Level ntpsec / gpsd Channels */}
            <TelemetryStatus 
              gpsd={data.gpsd} 
              ntp={data.ntp} 
              config={data.config} 
              configVerification={configVerification}
              onReverifyConfigs={runConfigVerification}
            />
          </motion.div>
        ) : (
          /* INGENIERÍA & EXPORTACIÓN TAB */
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-4"
          >
            {/* Config & Stations Parameters */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <Configurator config={data.config} onSaveConfig={handleSaveConfig} gpsd={data.gpsd} />
              
              {/* Perfiles de Estación (Presets) */}
              <UserProfileManager 
                  defaultSubTab="presets"
                  onApplyPreset={async (callsign, statusComment) => {
                    const updated = {
                      ...data.config,
                      callsign: callsign,
                      aprsStatusComment: statusComment
                    };
                    const success = await handleSaveConfig(updated);
                    if (success) {
                      showToast(`¡Preset aplicado! Estación configurada como ${callsign}`);
                    } else {
                      showToast(`Error al aplicar preset.`);
                    }
                  }}
                />
              
              {/* Architecture block chart */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs">
                <div className="text-emerald-400 font-bold uppercase mb-2.5">Gráfico de Bloques de Telecomunicaciones</div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-slate-300 space-y-2 relative leading-loose">
                  <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                    <span className="text-emerald-500 font-black">GPS Receiver USB</span>
                    <span className="text-slate-500">➔</span>
                    <span className="bg-emerald-950 px-1 py-0.2 rounded text-[10px] text-emerald-300">gpsd (Port 2947)</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                    <span className="text-blue-500 font-black">GNSS / PPS hardware</span>
                    <span className="text-slate-500">➔</span>
                    <span className="bg-blue-950 px-1 py-0.2 rounded text-[10px] text-blue-300">ntpsec (Stratum 1)</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                    <span className="text-yellow-500 font-black">OWM Meteorological Cloud</span>
                    <span className="text-slate-500">➔</span>
                    <span className="bg-yellow-950 px-1 py-0.2 rounded text-[10px] text-yellow-300">OpenWeatherAPI JSON</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                    <span className="text-emerald-500 font-black">IQAir Air Quality Cloud</span>
                    <span className="text-slate-500">➔</span>
                    <span className="bg-emerald-950 px-1 py-0.2 rounded text-[10px] text-emerald-300">AirVisual API v2 JSON</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                    <span className="text-red-500 font-black">IGN Sismológico Nacional</span>
                    <span className="text-slate-500">➔</span>
                    <span className="bg-red-950 px-1 py-0.2 rounded text-[10px] text-red-300">FDSN GeoJSON</span>
                  </div>
                  
                  <div className="border-t border-slate-800 my-2 pt-2 text-center text-[10px] text-slate-400">
                    ⬇ Integrado localmente en centralizador ⬇
                  </div>

                  <div className="bg-slate-950 p-2 rounded border border-emerald-500/30 text-center font-bold text-emerald-400">
                    aprs_sat.py [TNC Controller Loop]
                  </div>

                  <div className="text-center text-slate-500 text-[10px]">
                    ↙ Dual redundant transmission channels ↘
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-[#021c10] border border-emerald-500/30 p-1.5 rounded text-emerald-300 text-[10px]">
                      <strong>direwolf TNC (Port 8001)</strong><br />KISS TCP ➔ 144.800MHz RF
                    </div>
                    <div className="bg-[#121c2c] border border-blue-500/30 p-1.5 rounded text-blue-300 text-[10px]">
                      <strong>APRS-IS IP Gateway</strong><br />Port 14580 ➔ Global net
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Script codes and local OS integrations details */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <SyncScheduler config={data.config} onSaveConfig={handleSaveConfig} />
              <AprsScheduler onScheduleTriggered={() => fetchTelemetry(true)} />
              <AlarmThresholds config={data.config} onSaveConfig={handleSaveConfig} />
              <ScriptExporter onInjectRaw={handleInjectRaw} />
            </div>
          </motion.div>
        )}

      </main>

      {/* FLOATING ACTION BUTTON (FAB) COMMAND GROUP */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 font-mono">
        {/* Floating Toast Notification Inside FAB Area */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="mr-1 mb-1 bg-slate-950/95 border border-emerald-500/40 text-emerald-300 text-[10.5px] px-3.5 py-2.5 rounded-xl shadow-2xl max-w-sm flex items-center gap-2.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sub-buttons Expanded List */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="flex flex-col items-end gap-3 mb-1"
            >
              {/* BUTTON 1: Emergency Broadcast */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-red-500/30 text-red-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider">
                  {isEmergencyBroadcastActive ? 'APAGAR RADIOEMISIÓN' : 'EMISIÓN DE EMERGENCIA'}
                </span>
                <button
                  onClick={async () => {
                    const nextState = !isEmergencyBroadcastActive;
                    setIsEmergencyBroadcastActive(nextState);
                    if (nextState) {
                      showToast('EMISIÓN CRÍTICA INICIADA: Difundiendo boletín especial civil.');
                      await handleInjectRaw('ALERT: REMER CIVIL DEFENSA SAT ACTIVA - CQ CQ EMISION DE DISCRIMINACION NACIONAL');
                      playBuzzerSound(1100, 0.4, 'sawtooth');
                      setTimeout(() => playBuzzerSound(880, 0.4, 'sawtooth'), 300);
                    } else {
                      showToast('Transmisión de emergencia detenida.');
                      playBuzzerSound(440, 0.15, 'sine');
                    }
                  }}
                  id="fab-action-emergency-broadcast"
                  className={`w-11 h-11 rounded-full flex items-center justify-center border cursor-pointer transition-all duration-300 shadow-xl ${
                    isEmergencyBroadcastActive 
                      ? 'bg-red-950/90 border-red-500 text-red-200 animate-pulse' 
                      : 'bg-slate-950/90 border-slate-850 text-red-400 hover:bg-slate-900'
                  }`}
                  title="Emisión de Emergencia S.A.T. (144.800 MHz)"
                >
                  <Megaphone size={18} className={isEmergencyBroadcastActive ? 'animate-bounce' : ''} />
                </button>
              </div>

              {/* BUTTON 2: Silence Alarms */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-amber-500/30 text-amber-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider">
                  {isAlarmsSilenced ? 'ACTIVAR SONIDOS' : 'SILENCIAR CONSOLA'}
                </span>
                <button
                  onClick={() => {
                    const nextState = !isAlarmsSilenced;
                    setIsAlarmsSilenced(nextState);
                    if (nextState) {
                      showToast('Alarmas acústicas silenciadas en consola S.A.T.');
                    } else {
                      showToast('Canal sonoro restablecido.');
                      // play beep feedback
                      setTimeout(() => {
                        try {
                          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                          if (AudioCtx) {
                            const ctx = new AudioCtx();
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.connect(gain); gain.connect(ctx.destination);
                            osc.frequency.setValueAtTime(880, ctx.currentTime);
                            gain.gain.setValueAtTime(0.04, ctx.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
                            osc.start(); osc.stop(ctx.currentTime + 0.12);
                          }
                        } catch (_) {}
                      }, 50);
                    }
                  }}
                  id="fab-action-silence-alarms"
                  className={`w-11 h-11 rounded-full flex items-center justify-center border cursor-pointer transition-all duration-300 shadow-xl ${
                    isAlarmsSilenced
                      ? 'bg-amber-950/90 border-amber-500 text-amber-300'
                      : 'bg-slate-950/90 border-slate-850 text-slate-300 hover:bg-slate-900'
                  }`}
                  title="Restablecer o silenciar alarmas sonoras de terminal"
                >
                  {isAlarmsSilenced ? <VolumeX size={18} className="text-amber-400" /> : <Volume2 size={18} />}
                </button>
              </div>

              {/* BUTTON 3: Sync GPSD/GPS */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-cyan-500/30 text-cyan-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider font-mono">
                  Sincronizar GPS / GPSD
                </span>
                <button
                  onClick={() => {
                    const fallbackLat = data?.config?.fallbackLat ?? 40.416775;
                    const fallbackLon = data?.config?.fallbackLon ?? -3.703790;
                    
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          const { latitude, longitude, altitude } = position.coords;
                          const altInMeters = altitude !== null && altitude !== undefined ? Math.round(altitude) : undefined;
                          
                          handleRelocate(latitude, longitude, 'GPS Navegador (S.A.T.)', altInMeters);
                          showToast(`GPS Integrado: Sincronizada antena con el navegador a ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°${altInMeters !== undefined ? ` (Altitud: ${altInMeters}m)` : ''}`);
                          playBuzzerSound(1200, 0.15, 'triangle');
                        },
                        (error) => {
                          console.warn('Geolocation failed or denied. Defaulting to GPSD server reference coordinates:', error);
                          const fallbackLat = data?.config?.fallbackLat ?? 40.416775;
                          const fallbackLon = data?.config?.fallbackLon ?? -3.703790;
                          const fallbackAlt = data?.gpsd?.alt ?? 657;
                          
                          handleRelocate(fallbackLat, fallbackLon, 'Estación Base (GPSD)', fallbackAlt);
                          showToast(`Servidor GPSD: Re-centrada antena en coordenadas base de NUC (${fallbackLat.toFixed(4)}°, ${fallbackLon.toFixed(4)}°, ${fallbackAlt}m)`);
                          playBuzzerSound(1046.5, 0.15, 'triangle');
                        }
                      );
                    } else {
                      const fallbackLat = data?.config?.fallbackLat ?? 40.416775;
                      const fallbackLon = data?.config?.fallbackLon ?? -3.703790;
                      const fallbackAlt = data?.gpsd?.alt ?? 657;
                      
                      handleRelocate(fallbackLat, fallbackLon, 'Estación Base (GPSD)', fallbackAlt);
                      showToast(`Servidor GPSD: Re-centrada antena en coordenadas base de NUC (${fallbackLat.toFixed(4)}°, ${fallbackLon.toFixed(4)}°, ${fallbackAlt}m)`);
                      playBuzzerSound(1046.5, 0.15, 'triangle');
                    }
                  }}
                  id="fab-action-recenter-map"
                  className="w-11 h-11 rounded-full bg-slate-950/90 border border-slate-850 text-slate-300 hover:bg-slate-900 hover:border-cyan-500/50 hover:text-cyan-400 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xl"
                  title="Sincronizar posicionamiento de antena por GPS Real o Servidor GPSD"
                >
                  <Locate size={18} />
                </button>
              </div>

              {/* BUTTON 4: Space Weather (Clima Espacial) */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-indigo-500/30 text-indigo-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider font-mono">
                  CLIMA ESPACIAL (SIMULACIÓN)
                </span>
                <button
                  onClick={async () => {
                    const scales: ('G' | 'R' | 'S')[] = ['G', 'R', 'S'];
                    const randomScale = scales[Math.floor(Math.random() * scales.length)];
                    const randomLevel = Math.floor(Math.random() * 2) + 4; // 4 or 5
                    
                    showToast(`Simulando Alerta NOAA: ${randomScale}${randomLevel} Tormenta solar extrema.`);
                    await handleTriggerNoaaTest(randomScale, randomLevel);
                    setActiveTab('monitor');
                    playBuzzerSound(1200, 0.2, 'sawtooth');
                    setTimeout(() => playBuzzerSound(1600, 0.3, 'sine'), 100);
                  }}
                  id="fab-action-space-weather"
                  className="w-11 h-11 rounded-full bg-slate-950/90 border border-slate-850 hover:border-indigo-500/50 text-indigo-400 hover:text-indigo-300 hover:bg-slate-900 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xl"
                  title="Simular Evento de Clima Espacial NOAA"
                >
                  <Sun size={18} className="animate-pulse text-yellow-500" />
                </button>
              </div>

              {/* BUTTON 5: Open Ham Clock */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider font-mono">
                  OPEN HAM CLOCK
                </span>
                <a
                  href="https://openhamclock.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    showToast('Abriendo Open Ham Clock (Consola Externa)...');
                    playBuzzerSound(987.77, 0.1, 'sine');
                  }}
                  id="fab-action-ham-clock"
                  className="w-11 h-11 rounded-full bg-slate-950/90 border border-slate-850 hover:border-emerald-500/50 text-emerald-400 hover:text-emerald-300 hover:bg-slate-900 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xl"
                  title="Abrir Open Ham Clock (Herramienta externa de propagación)"
                >
                  <Clock size={18} className="text-emerald-400" />
                </a>
              </div>

              {/* BUTTON 6: Modo Eco */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider font-mono">
                  {isEcoMode ? 'DESACTIVAR MODO ECO' : 'ACTIVAR MODO ECO'}
                </span>
                <button
                  onClick={() => {
                    const nextMode = !isEcoMode;
                    setIsEcoMode(nextMode);
                    try {
                      localStorage.setItem('eco_mode', String(nextMode));
                      window.dispatchEvent(new Event('eco_mode_changed'));
                    } catch (_) {}
                    showToast(nextMode ? 'MODO ECO ACTIVO: Sondeo 15s • Animaciones desactivadas' : 'MODO ECO DESACTIVADO: Sondeo estándar a 3s');
                    playBuzzerSound(nextMode ? 600 : 880, 0.15, 'sine');
                  }}
                  id="fab-action-eco-mode"
                  className={`w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xl ${
                    isEcoMode 
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-400' 
                      : 'bg-slate-950/90 border-slate-850 text-slate-300 hover:bg-slate-900 hover:text-emerald-400 hover:border-emerald-500/50'
                  }`}
                  title="Activar/Desactivar Modo Eco del Sistema"
                >
                  <Leaf size={18} className={isEcoMode ? "" : "animate-pulse text-emerald-500"} />
                </button>
              </div>

              {/* BUTTON 7: Guía & Soporte */}
              <div className="flex items-center gap-2 group">
                <span className="bg-slate-950 border border-amber-500/30 text-amber-400 text-[9px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider font-mono">
                  GUÍA INTERACTIVA S.A.T.
                </span>
                <button
                  onClick={() => {
                    setIsHelpOpen(true);
                    setFabOpen(false);
                    playBuzzerSound(880, 0.12, 'sine');
                  }}
                  id="fab-action-interactive-guide"
                  className="w-11 h-11 rounded-full bg-slate-950/90 border border-slate-850 text-amber-400 hover:text-amber-300 hover:bg-slate-900 hover:border-amber-500/55 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xl"
                  title="Abrir Guía Operativa de Consola S.A.T."
                >
                  <BookOpen size={18} className="animate-pulse text-amber-400" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Trigger Buttons Row */}
        <div className="flex items-center gap-3">
          {/* Dedicated Help Button */}
          <button
            onClick={() => {
              setIsHelpOpen(true);
              playBuzzerSound(880, 0.12, 'sine');
            }}
            className="w-12 h-12 rounded-full bg-slate-900 hover:bg-slate-850 hover:border-amber-500/50 border border-slate-800 text-amber-400 hover:text-amber-300 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-[0_0_20px_rgba(245,158,11,0.1)] focus:outline-none active:scale-95 group relative"
            id="fab-help-trigger"
            title="Guía Operativa Interactiva S.A.T."
          >
            <HelpCircle size={18} className="animate-pulse" />
            
            {/* Slide-out helper tooltip */}
            <span className="absolute right-14 bg-slate-950 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2.5 py-1.5 rounded-xl shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider whitespace-nowrap">
              Guía S.A.T. (Manual)
            </span>
          </button>

          {/* Main Floating Trigger Button */}
          <button
            onClick={() => {
              setFabOpen(prev => !prev);
              playBuzzerSound(784, 0.08, 'sine');
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:outline-none border active:scale-95 ${
              fabOpen
                ? 'bg-slate-950 border-emerald-500 text-emerald-400 ring-4 ring-emerald-950/55'
                : 'bg-slate-900 hover:bg-slate-850 hover:border-emerald-500/50 border-slate-800 text-slate-200'
            }`}
            id="fab-main-trigger"
            title="Consola de Acceso Rápido S.A.T."
          >
            {fabOpen ? (
              <X size={18} />
            ) : (
              <div className="relative">
                <Sliders size={18} className="rotate-90 animate-pulse text-emerald-400" />
                {(isEmergencyBroadcastActive || isAlarmsSilenced) && (
                  <span className="absolute -top-1 -right-1 block h-2 w-2 rounded-full bg-rose-500 ring-1 ring-slate-900"></span>
                )}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* INTERACTIVE GUIDE HELPOVERLAY */}
      <HelpOverlay 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        playBuzzerSound={playBuzzerSound}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* AUTOMATIC UPDATE OVERLAY DIALOG */}
      <AnimatePresence>
        {showUpdatePrompt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-slate-900 border border-amber-500/30 p-6 rounded-2xl shadow-2xl relative overflow-hidden space-y-4"
            >
              {/* Tactical Warning Background Glow */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500"></div>
              
              <div className="flex items-center gap-3 text-amber-500 border-b border-slate-800 pb-3">
                <div className="p-2 bg-amber-500/10 rounded-lg animate-pulse">
                  <RefreshCw className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100 font-sans">
                    ACTUALIZACIÓN DE CONSOLA REQUERIDA
                  </h3>
                  <span className="text-[10px] text-amber-500 font-mono block">
                    COHESIÓN DE SISTEMA S.A.T. • v{latestVersion}
                  </span>
                </div>
              </div>

              <div className="space-y-3 font-sans text-xs">
                <p className="text-slate-300 leading-relaxed">
                  Para garantizar la compatibilidad con los módems Direwolf, las bases de datos de la DGT, la meteorología WeeWX y el protocolo de radio APRS, todos los terminales deben ejecutar la misma versión.
                </p>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Versión Actual (Tu Terminal):</span>
                    <span className="text-rose-400 font-bold">v{APP_VERSION}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Nueva Versión Detectada:</span>
                    <span className="text-emerald-400 font-bold">v{latestVersion}</span>
                  </div>
                </div>

                {changelog && (
                  <div className="space-y-1 font-mono text-[10.5px]">
                    <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Notas de actualización:</span>
                    <div className="bg-slate-950/45 p-2 rounded border border-slate-900 text-slate-300 max-h-24 overflow-y-auto leading-relaxed">
                      {changelog}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-850 pt-4 space-y-2">
                {forceUpdate ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-mono text-amber-400 font-bold bg-amber-950/25 p-2.5 rounded border border-amber-900/30">
                      <span>Recarga forzada activa (Sincronización total)</span>
                      <span className="animate-pulse">Recargando en {updateCountdown}s...</span>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono py-2.5 rounded-lg text-xs transition-all cursor-pointer flex justify-center items-center gap-1.5 shadow-lg shadow-amber-500/10"
                    >
                      <RefreshCw size={13} className="animate-spin" />
                      Sincronizar Terminal Ahora
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setShowUpdatePrompt(false)}
                      className="bg-slate-950 hover:bg-slate-900 text-slate-400 font-mono py-2 rounded-lg text-xs border border-slate-850 cursor-pointer"
                    >
                      Omitir
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-mono font-bold py-2 rounded-lg text-xs cursor-pointer"
                    >
                      Actualizar
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VENTANA EMERGENTE CENTRADA PARA MENSAJES/BOLETINES APRS */}
      <AnimatePresence>
        {incomingAprsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4 font-sans"
            id="aprs-incoming-modal-backdrop"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col relative"
              id="aprs-incoming-modal-container"
            >
              {/* Header con indicador de severidad */}
              <div className={`p-4 flex items-center gap-3 border-b border-slate-800 ${
                incomingAprsModal.isEmergency 
                  ? 'bg-rose-950/45 border-rose-900 text-rose-300' 
                  : incomingAprsModal.aprsType === 'BULLETIN'
                    ? 'bg-amber-950/45 border-amber-900 text-amber-300'
                    : incomingAprsModal.aprsType === 'MESSAGE'
                      ? 'bg-pink-950/45 border-pink-900 text-pink-300'
                      : 'bg-blue-950/45 border-blue-900 text-blue-300'
              }`}>
                <div className="p-2 rounded-lg bg-slate-950/50 flex items-center justify-center">
                  {incomingAprsModal.isEmergency ? (
                    <AlertTriangle size={20} className="text-rose-500 animate-pulse" />
                  ) : incomingAprsModal.aprsType === 'BULLETIN' ? (
                    <Megaphone size={20} className="text-amber-500" />
                  ) : incomingAprsModal.aprsType === 'MESSAGE' ? (
                    <Mail size={20} className="text-pink-500" />
                  ) : (
                    <Radio size={20} className="text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest block opacity-70">
                    {incomingAprsModal.isEmergency ? 'ALERTA DE EMERGENCIA CRÍTICA' : `TRÁFICO APRS: ${incomingAprsModal.aprsType}`}
                  </span>
                  <h3 className="font-mono text-xs font-bold truncate">
                    De: <span className="text-white underline font-black">{incomingAprsModal.callsign}</span>
                  </h3>
                </div>
                {incomingAprsModal.isEmergency && (
                  <span className="bg-rose-600 text-slate-950 text-[9px] font-black uppercase px-2 py-0.5 rounded animate-pulse">
                    CRÍTICO
                  </span>
                )}
              </div>

              {/* Contenido / Detalle */}
              <div className="p-4 space-y-4">
                <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-850/80 space-y-2">
                  <p className="text-xs text-slate-300 font-mono leading-relaxed break-words">
                    "{incomingAprsModal.messageText || incomingAprsModal.originalDetail}"
                  </p>
                  <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Vía: {incomingAprsModal.path || 'DIRECT (APRS-IS)'}</span>
                    <span>{new Date(incomingAprsModal.timestamp).toLocaleTimeString('es-ES')}</span>
                  </div>
                </div>

                {/* Coordenadas o Referencia */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-950/30 p-2.5 rounded border border-slate-850">
                  <div className="space-y-0.5">
                    <span className="text-slate-500 uppercase block text-[8px] font-bold">Latitud</span>
                    <span className="text-slate-300">{incomingAprsModal.latitude?.toFixed(5)} N</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-500 uppercase block text-[8px] font-bold">Longitud</span>
                    <span className="text-slate-300">{incomingAprsModal.longitude?.toFixed(5)} W</span>
                  </div>
                </div>

                {/* Responder Panel */}
                {isReplying && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2 border-t border-slate-800 pt-3"
                  >
                    <label className="text-[9px] font-mono text-slate-400 font-bold uppercase block">Responder a {incomingAprsModal.callsign}:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Escribe tu mensaje APRS..."
                        value={aprsReplyText}
                        onChange={(e) => setAprsReplyText(e.target.value.slice(0, 60))}
                        className="flex-1 bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-blue-400 outline-none focus:border-pink-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSendReply();
                        }}
                      />
                      <button
                        onClick={handleSendReply}
                        className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs px-3 rounded font-mono cursor-pointer flex items-center gap-1"
                      >
                        <Send size={11} />
                        TX
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Filtro de Alertas Pop-up (Mic-E / EmergencyCode.txt) */}
                <div className="border-t border-slate-800/60 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono text-orange-400 font-bold uppercase block">Filtro de Alertas Pop-up</label>
                    <span className="text-[8.5px] text-slate-500 font-mono">Mic-E / APRS 1.2</span>
                  </div>
                  <select
                    value={aprsPopupFilter}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setAprsPopupFilter(val);
                      localStorage.setItem('aprs_popup_filter', val);
                      showToast(`Filtro pop-up cambiado a: ${
                        val === 'ALL' ? 'Todos los mensajes/boletines' :
                        val === 'MICE_EMG' ? 'Solo Emergencias Críticas' :
                        'Tránsito Prioritario y Especial'
                      }`);
                    }}
                    className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-xs font-mono text-slate-300 outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="ALL">📬 Mostrar todos los tráficos APRS (Por Defecto)</option>
                    <option value="MICE_EMG">🚨 Solo Emergencias Críticas (Mic-E EMG / SOS / QRR / MED)</option>
                    <option value="MICE_PRIO">⚠️ Tránsito Prioritario y Especial (Prioridad / Especial / SAR)</option>
                  </select>
                </div>
              </div>

              {/* Botonera de acciones */}
              <div className="bg-slate-950/80 p-3 border-t border-slate-850 space-y-2">
                <button
                  onClick={() => handleAcknowledgeAprs(incomingAprsModal.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg py-2.5 text-xs font-sans font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-550/20 uppercase tracking-wider"
                  id="aprs-modal-ack-btn"
                >
                  <CheckCircle size={13} />
                  Reconocer y Marcar como Leído
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setIncomingAprsModal(null);
                      setIsReplying(false);
                      setAprsReplyText('');
                    }}
                    className="bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded-lg py-2 text-xs font-mono font-bold cursor-pointer transition-all"
                    id="aprs-modal-dismiss-btn"
                  >
                    Cerrar
                  </button>
                  
                  <button
                    onClick={() => {
                      setIsReplying(!isReplying);
                    }}
                    className={`${isReplying ? 'bg-pink-600 text-white' : 'bg-slate-900 hover:bg-slate-850 text-pink-400 border border-slate-800'} rounded-lg py-2 text-xs font-mono font-bold cursor-pointer transition-all flex items-center justify-center gap-1`}
                    id="aprs-modal-reply-btn"
                  >
                    <Mail size={12} />
                    {isReplying ? 'Cancelar' : 'Responder'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="bg-slate-950 border-t border-slate-900 py-3 text-center text-[10px] text-slate-500 font-mono flex flex-col lg:flex-row items-center justify-between px-4 gap-2 gap-y-3">
        <span>
          S.A.T.-APRS · © 2026 Manuel - EA7JRS · GPL-3.0-or-later ·{' '}
          <a
            href="https://paypal.me/ea7jrs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
          >
            Donar con PayPal
          </a>
        </span>
        <NtpSyncStatus ntp={data?.ntp} />
        
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          S.A.T.-APRS • v{pkg.version}
        </span>
      </footer>
      </div>
      </div>
        </>
      )}
    </motion.div>
  </MotionConfig>
);
}
