import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Radio, AlertTriangle, ShieldCheck, ShieldAlert, MapPin, Sliders, FileCode, CheckCircle, Database, Globe, CloudRain, Waves, Anchor, Megaphone, VolumeX, Volume2, Locate, X, BellOff, Bell, Compass, Sun, Clock, ExternalLink, Flame, Cpu, CloudSun, Wind, Leaf, BookOpen, RefreshCw, Send, Target } from 'lucide-react';
import { ServerTelemetryData, TelemetryConfig } from './types';

// Modular Sub-components (Unified Imports)
import {
  ConsoleHeader,
  RadarMap,
  TelemetryStatus,
  WeatherStation,
  IcaAirQualityMonitor,
  NucConsole,
  WeewxConsole,
  DirewolfConsole,
  AprxConsole,
  AlertMonitor,
  TerminalLogs,
  Configurator,
  AlarmThresholds,
  ScriptExporter,
  TransmissionTrafficTrends,
  DgtTrafficDatabase,
  IgnEarthquakeIndicators,
  AemetOpenDataPortal,
  PortusOceanData,
  NavareaMonitor,
  INITIAL_NAVAREA_WARNINGS,
  NavareaWarning,
  NotificationPanel,
  RadiologicalNetworks,
  SyncScheduler,
  MeteosaludPortal,
  WildfireMonitor,
  ThreatPollingEngine,
  CecopDashboard,
  AprsAdaptor,
  AprsPacket,
  NtpSyncStatus,
  PatAx25Console,
  HelpOverlay,
  PropagacionMonitor,
  RepeaterDatabaseView,
  PrivateLoginGate,
  TwoFactorVerificationGate
} from './components';

import AprsScheduler from './components/radio/AprsScheduler';
import { DEFAULT_SOS_SETTINGS } from './components/emergency/SOSConfiguration';

import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './utils/firebase';
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
  const [activeTab, setActiveTab ] = useState<'monitor' | 'radiological' | 'dgt' | 'sismos-ign' | 'aemet-portal' | 'portus' | 'navareas' | 'salud' | 'engineering' | 'incendios' | 'sistema' | 'weewx-pillar' | 'direwolf-pillar' | 'aprx-pillar' | 'cecop-dashboard' | 'aprs-adaptor' | 'pat-pillar' | 'ica' | 'propagacion' | 'repetidores'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [navareas, setNavareas] = useState<NavareaWarning[]>(INITIAL_NAVAREA_WARNINGS);
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
      if (customEvent.detail?.tab) {
        setActiveTab(customEvent.detail.tab as any);
      }
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

          // Trigger the incoming APRS modal popup!
          setIncomingAprsModal(newPacket);

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
  }, [data?.logs, lastSeenLogId]);

  // Firebase Database Sync Status indicator state
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'disabled' | 'offline'>('synced');

  // Sync state modifications across multiple tabs or browser windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nightMode' && e.newValue !== null) {
        setNightMode(e.newValue === 'true');
      }
      if (e.key === 'eco_mode' && e.newValue !== null) {
        setIsEcoMode(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Night Mode States & Autopreserving selection
  const [nightMode, setNightMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('nightMode');
    if (saved !== null) return saved === 'true';
    return false;
  });

  // Day Mode State & Autopreserving selection
  const [dayMode, setDayMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dayMode');
    return saved === 'true'; // Default is dark
  });

  // Emergency Mode State & Autopreserving selection
  const [emergencyMode, setEmergencyMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('emergencyMode');
    return saved === 'true';
  });

  const [nightModeAuto, setNightModeAuto] = useState<boolean>(() => {
    const saved = localStorage.getItem('nightModeAuto');
    if (saved !== null) return saved === 'true';
    return true; // Auto enabled by default
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

  // Automatic Version Updates S.A.T.
  const APP_VERSION = '2.4.0';
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<string>('');
  const [forceUpdate, setForceUpdate] = useState<boolean>(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState<boolean>(false);
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
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
  const [loadingUser, setLoadingUser] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [is2faVerified, setIs2faVerified] = useState<boolean>(false);
  const [isFirebaseSyncEnabled, setIsFirebaseSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem('firebase_sync_enabled') !== 'false'; // Sync active by default if logged in
  });

  const handleToggleFirebaseSync = (v: boolean) => {
    setIsFirebaseSyncEnabled(v);
    localStorage.setItem('firebase_sync_enabled', String(v));
  };

  // Always listen to the user profile when logged in to check roles and 2FA status
  useEffect(() => {
    if (!currentUser) {
      setUserProfile(null);
      setIs2faVerified(false);
      return;
    }
    const docRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data());
      } else {
        setUserProfile({});
      }
    }, (error) => {
      console.error("Error listening to user profile in App.tsx:", error);
    });
    return unsubscribe;
  }, [currentUser]);

  // Listen to Auth state and network connectivity
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingUser(false);
      if (!user) {
        setSyncStatus('disabled');
        setUserProfile(null);
        setIs2faVerified(false);
      } else if (isFirebaseSyncEnabled) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('disabled');
      }
    });

    const handleOnline = () => {
      if (currentUser && isFirebaseSyncEnabled) {
        setSyncStatus('synced');
      }
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) {
      setSyncStatus('offline');
    }

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isFirebaseSyncEnabled, currentUser]);

  // Listen to global system config for unified version tracking
  useEffect(() => {
    if (!currentUser || !isFirebaseSyncEnabled) return;

    const sysRef = doc(db, 'system', 'config');
    const unsubscribe = onSnapshot(sysRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const serverVersion = data.currentVersion;
        if (serverVersion && serverVersion !== APP_VERSION) {
          setLatestVersion(serverVersion);
          setChangelog(data.changelog || 'Actualizaciones operativas del sistema.');
          setForceUpdate(data.forceUpdate !== undefined ? !!data.forceUpdate : true);
          setShowUpdatePrompt(true);
        } else {
          setShowUpdatePrompt(false);
        }
      }
    }, (error) => {
      console.warn("No se pudo conectar al canal de versiones S.A.T.:", error);
    });

    return unsubscribe;
  }, [currentUser, isFirebaseSyncEnabled]);

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

  // Listen to Firestore settings changes
  useEffect(() => {
    if (!currentUser || !isFirebaseSyncEnabled) {
      setSyncStatus('disabled');
      return;
    }

    setSyncStatus('syncing');
    const docRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      setSyncStatus('synced');
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Only update if different to avoid infinite trigger loops
        if (data.nightMode !== undefined && data.nightMode !== nightMode) {
          setNightMode(data.nightMode);
          localStorage.setItem('nightMode', String(data.nightMode));
        }
        if (data.isEcoMode !== undefined && data.isEcoMode !== isEcoMode) {
          setIsEcoMode(data.isEcoMode);
          localStorage.setItem('eco_mode', String(data.isEcoMode));
          window.dispatchEvent(new Event('eco_mode_changed'));
        }
        if (data.nightModeAuto !== undefined && data.nightModeAuto !== nightModeAuto) {
          setNightModeAuto(data.nightModeAuto);
          localStorage.setItem('nightModeAuto', String(data.nightModeAuto));
        }
        if (data.nightModeUseSolar !== undefined && data.nightModeUseSolar !== nightModeUseSolar) {
          setNightModeUseSolar(data.nightModeUseSolar);
          localStorage.setItem('nightModeUseSolar', String(data.nightModeUseSolar));
        }
        if (data.startHour !== undefined && data.startHour !== startHour) {
          setStartHour(data.startHour);
          localStorage.setItem('nightModeStartHour', String(data.startHour));
        }
        if (data.endHour !== undefined && data.endHour !== endHour) {
          setEndHour(data.endHour);
          localStorage.setItem('nightModeEndHour', String(data.endHour));
        }
      }
    }, (error) => {
      console.error("Error listening to user settings in Firestore:", error);
      setSyncStatus('error');
    });

    return unsubscribe;
  }, [currentUser, isFirebaseSyncEnabled]);

  // Push local changes to Firestore
  useEffect(() => {
    if (!currentUser || !isFirebaseSyncEnabled) return;

    const saveSettings = async () => {
      try {
        setSyncStatus('syncing');
        const docRef = doc(db, 'users', currentUser.uid);
        // Only save if it's actually different from what's in the DB to avoid unnecessary writes
        const docSnap = await getDoc(docRef);
        const currentData = docSnap.exists() ? docSnap.data() : {};
        
        if (
          currentData.nightMode !== nightMode ||
          currentData.isEcoMode !== isEcoMode ||
          currentData.nightModeAuto !== nightModeAuto ||
          currentData.nightModeUseSolar !== nightModeUseSolar ||
          currentData.startHour !== startHour ||
          currentData.endHour !== endHour
        ) {
          await setDoc(docRef, {
            nightMode,
            isEcoMode,
            nightModeAuto,
            nightModeUseSolar,
            startHour,
            endHour,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
        setSyncStatus('synced');
      } catch (error) {
        console.error("Error saving user settings to Firestore:", error);
        setSyncStatus('error');
      }
    };

    // Debounce database write slightly
    const timer = setTimeout(saveSettings, 1000);
    return () => clearTimeout(timer);
  }, [currentUser, isFirebaseSyncEnabled, nightMode, isEcoMode, nightModeAuto, nightModeUseSolar, startHour, endHour]);

  // Keep checking local time for automatic night mode triggers
  useEffect(() => {
    if (!nightModeAuto) return;

    const checkTime = () => {
      const now = new Date();
      let isNight = false;

      if (nightModeUseSolar) {
        // Compute dynamically using station fixed or GPS coords
        const lat = data?.gpsd?.lat ?? 40.416775;
        const lon = data?.gpsd?.lon ?? -3.703790;
        const solar = getSunriseSunset(lat, lon, now);
        const currentHourDec = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        isNight = isNightTime(currentHourDec, solar.sunrise, solar.sunset);
      } else {
        const currentHour = now.getHours();
        if (startHour > endHour) {
          isNight = currentHour >= startHour || currentHour < endHour;
        } else {
          isNight = currentHour >= startHour && currentHour < endHour;
        }
      }
      setNightMode(isNight);
      if (isNight) {
        setDayMode(false);
        localStorage.setItem('dayMode', 'false');
        setEmergencyMode(false);
        localStorage.setItem('emergencyMode', 'false');
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, [nightModeAuto, nightModeUseSolar, startHour, endHour, data?.gpsd?.lat, data?.gpsd?.lon]);

  const handleToggleDayMode = () => {
    setDayMode(prev => {
      const newVal = !prev;
      localStorage.setItem('dayMode', String(newVal));
      if (newVal) {
        setNightMode(false);
        localStorage.setItem('nightMode', 'false');
        setEmergencyMode(false);
        localStorage.setItem('emergencyMode', 'false');
      }
      return newVal;
    });
  };

  const handleToggleNightMode = () => {
    setNightMode(prev => {
      const newVal = !prev;
      localStorage.setItem('nightMode', String(newVal));
      if (newVal) {
        setDayMode(false);
        localStorage.setItem('dayMode', 'false');
        setEmergencyMode(false);
        localStorage.setItem('emergencyMode', 'false');
      }
      return newVal;
    });
    // Suspend auto mode to let the manual click override persist
    if (nightModeAuto) {
      setNightModeAuto(false);
      localStorage.setItem('nightModeAuto', 'false');
    }
  };

  const handleToggleEmergencyMode = () => {
    setEmergencyMode(prev => {
      const newVal = !prev;
      localStorage.setItem('emergencyMode', String(newVal));
      if (newVal) {
        setDayMode(false);
        localStorage.setItem('dayMode', 'false');
        setNightMode(false);
        localStorage.setItem('nightMode', 'false');
      }
      return newVal;
    });
    // Suspend auto mode to let the manual click override persist
    if (nightModeAuto) {
      setNightModeAuto(false);
      localStorage.setItem('nightModeAuto', 'false');
    }
  };

  const handleToggleNightModeAuto = (v: boolean) => {
    setNightModeAuto(v);
    localStorage.setItem('nightModeAuto', String(v));
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

  const handleAddSimulatedNavarea = async () => {
    const randomIdNumber = Math.floor(Math.random() * 900 + 100);
    const newWarning: NavareaWarning = {
      id: `NAV3-${randomIdNumber}/26`,
      navareaType: 'NAVAREA III',
      category: 'Search & Rescue',
      title: 'ALERTA DE SOCORRO: Embarcación a la deriva al norte de Menorca',
      lat: 40.2450,
      lon: 4.1200,
      areaDescription: 'Norte de las Baleares. Operando Salvamento Marítimo con embarcación de salvamento "Salvamar Acrux".',
      originator: 'Sociedad de Salvamento y Seguridad Marítima (SASEMAR)',
      broadcastTime: new Date().toISOString().replace('T', ' ').substring(0, 19).replace('Z', '') + ' UTC',
      urgency: 'ALERTA CRÍTICA',
      rawText: `NAVAREA III WARNING 0${randomIdNumber}/26\nNORTH OF MENORCA ISLAND.\n1. FISHING VESSEL "ORION DOS" WITH ENGINE FAILURE DRIFTING IN VICINITY 40-14.7N 004-07.2E. DANGEROUS TO OBSTRUCTION.\n2. ALL SHIPS REQUESTED TO EXTREME COOPERATIVE LOOKOUT AND REPORT TO MRCC PALMA. CANCEL THIS MSG ON CEASE EMERGENCY.`
    };
    try {
      await customFetch('/api/navareas/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warning: newWarning })
      });
      // Also update local state immediately for snappy response
      setNavareas(prev => [newWarning, ...prev]);
    } catch (err) {
      console.error('Error injecting simulated navarea warning:', err);
    }
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
          backgroundColor: dayMode ? "#f1f5f9" : nightMode ? "#050201" : emergencyMode ? "#0b0101" : "#070b12",
          color: dayMode ? "#0f172a" : nightMode ? "#c9a59c" : emergencyMode ? "#fca5a5" : "#f1f5f9"
        }}
        transition={{ duration: isEcoMode ? 0 : 0.8, ease: "easeInOut" }}
        className={`min-h-screen flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950 ${isEcoMode ? 'eco-mode' : ''} ${
          dayMode ? 'theme-day' : nightMode ? 'theme-night' : emergencyMode ? 'theme-emergency' : 'theme-standard'
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
      {nightMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          /* Monochromatic Low-Glare Red-Amber Tactical Night Mode overrides */
          body, #root, .min-h-screen {
            background-color: #050201 !important;
          }
          
          /* Red-Amber low glare filter for maps and charts */
          iframe, .recharts-responsive-container, #radar-map-canvas, svg, canvas, img {
            filter: sepia(1) saturate(1.8) hue-rotate(-50deg) brightness(0.65) contrast(1.15) !important;
          }
          
          /* Dimm out high-contrast neon badges and texts to deep amber/orange/red */
          .text-emerald-400, .text-emerald-300, .text-cyan-400, .text-blue-400, .text-indigo-400, .text-yellow-400,
          .text-emerald-500, .text-amber-500, .text-sky-450, .text-teal-400, .text-orange-400, .text-red-400 {
            color: #f97316 !important; /* Orange 500 */
          }
          .text-green-400 {
            color: #f97316 !important;
          }
          .border-emerald-500, .border-emerald-500\/30, .border-emerald-500\/40, .border-emerald-500\/50, 
          .border-cyan-500, .border-blue-500, .border-indigo-500, .border-slate-800, .border-slate-850 {
            border-color: rgba(234, 88, 12, 0.25) !important;
          }
          .bg-emerald-400, .bg-emerald-500, .bg-emerald-950, .bg-emerald-950\/20, .bg-blue-950\/40, .bg-indigo-950\/40 {
            background-color: rgba(124, 45, 18, 0.25) !important;
            border-color: rgba(234, 88, 12, 0.3) !important;
          }
          
          /* Dim all buttons, cards and elements to avoid retinal strain */
          .bg-slate-900, .bg-slate-950, .bg-slate-950\/80, .bg-slate-900\/50, .bg-slate-950\/40, .bg-[#070b12], .bg-slate-900\/45 {
            background-color: #0b0504 !important; /* Extremely dark red-tinted black */
            border-color: #260a00 !important; /* Dim red-brown borders */
          }
          
          /* General text desaturation and dimming */
          .text-slate-100, .text-slate-200, .text-slate-300, .text-white {
            color: #c9a59c !important; /* Warm copper/red-tinted cream */
          }
          .text-slate-400, .text-slate-500 {
            color: #7d5449 !important; /* Dim copper-gray */
          }
          
          /* Special active indicators: keep them orange */
          .bg-emerald-400.text-slate-950 {
            background-color: #f97316 !important;
            color: #000000 !important;
          }
        `}} />
      )}
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
      {dayMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          /* Modern High-Contrast Elegant Day Mode (Light Theme) Overrides */
          body, #root, .min-h-screen {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
          }
          
          /* Main container background overrides */
          .min-h-screen.bg-\[\#070b12\], .bg-\[\#070b12\], .bg-slate-950, .bg-[#070b12] {
            background-color: #f1f5f9 !important;
          }

          /* General slate & dark background classes converted to crisp cards */
          .bg-slate-900, 
          .bg-slate-950, 
          .bg-slate-900\/50, 
          .bg-slate-950\/40, 
          .bg-slate-900\/45, 
          .bg-slate-900\/60, 
          .bg-\[\#0b0f19\], 
          .bg-slate-850, 
          .bg-slate-950\/80, 
          .bg-\[\#0a0f1d\], 
          .bg-\[\#050914\], 
          .bg-slate-900\/80, 
          .bg-slate-950\/90,
          .bg-slate-950\/85,
          .bg-slate-900/40,
          .bg-slate-900/50,
          .bg-slate-850/40,
          .bg-[#0a0f1d]/50,
          .bg-slate-950/20,
          .bg-slate-900\/20,
          .bg-slate-900\/30,
          .bg-slate-900\/80,
          .bg-[#121824],
          .bg-slate-900/30,
          .bg-[#0d121f] {
            background-color: #ffffff !important;
            color: #0f172a !important;
            border-color: #e2e8f0 !important;
          }

          /* Specific sidebars and cards hover states */
          .hover\:bg-slate-900:hover, 
          .hover\:bg-slate-850:hover, 
          .hover\:bg-slate-800:hover,
          .hover\:bg-slate-950\/60:hover,
          .hover\:bg-slate-900\/50:hover {
            background-color: #f8fafc !important;
            color: #0f172a !important;
          }

          /* Input / Select / Textarea styling */
          select, input, textarea, .bg-slate-900 select, .bg-slate-950 input {
            background-color: #ffffff !important;
            color: #0f172a !important;
            border-color: #cbd5e1 !important;
          }
          select:focus, input:focus, textarea:focus {
            border-color: #6366f1 !important;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2) !important;
          }

          /* General text colors mapped to high contrast slate */
          .text-slate-100, 
          .text-slate-200, 
          .text-slate-300, 
          .text-slate-50,
          .text-white,
          .text-zinc-100,
          .text-gray-100,
          .text-gray-200,
          .text-emerald-50,
          .text-indigo-50 {
            color: #0f172a !important; /* deep slate-900 */
          }
          
          .text-slate-400, 
          .text-slate-500,
          .text-gray-400,
          .text-gray-500,
          .text-zinc-400 {
            color: #334155 !important; /* slate-700 */
          }

          /* Muted, labels, or secondary indicators */
          .text-slate-500, 
          .text-slate-600,
          .text-gray-500,
          .text-[9px].text-slate-500,
          .text-[10px].text-slate-500 {
            color: #475569 !important; /* slate-600 */
          }

          /* Borders override */
          .border-slate-800, 
          .border-slate-850, 
          .border-slate-900, 
          .border-slate-705,
          .border-slate-750,
          .border-slate-700, 
          .border-slate-700\/50, 
          .border-slate-800\/80,
          .border-slate-800\/50,
          .border-slate-850\/40,
          .border-zinc-800,
          .border-slate-800/30,
          .border-slate-800/40,
          .border-slate-800/20 {
            border-color: #e2e8f0 !important; /* slate-200 */
          }

          /* Color coded badge highlights for Light Mode contrast */
          .text-indigo-400, .text-indigo-300 {
            color: #4f46e5 !important; /* Indigo 600 */
          }
          .text-blue-400, .text-sky-400, .text-sky-450 {
            color: #1d4ed8 !important; /* Blue 700 */
          }
          .text-cyan-400, .text-cyan-300, .text-teal-400 {
            color: #0369a1 !important; /* Sky 700 */
          }
          .text-emerald-400, .text-emerald-300, .text-green-400, .text-green-500 {
            color: #15803d !important; /* Green 700 */
          }
          .text-yellow-450, .text-yellow-400, .text-amber-400, .text-amber-500 {
            color: #b45309 !important; /* Amber 700 */
          }
          .text-red-400, .text-rose-400, .text-red-500 {
            color: #be123c !important; /* Rose 700 */
          }

          /* Background soft overlay pills mapping */
          .bg-emerald-950\/20, 
          .bg-emerald-950\/40, 
          .bg-emerald-950\/30, 
          .bg-emerald-950\/50, 
          .bg-green-950\/30,
          .bg-green-950\/40,
          .bg-emerald-900\/20,
          .bg-emerald-950\/10 {
            background-color: #f0fdf4 !important; /* green-50 */
            border-color: #bbf7d0 !important; /* green-200 */
            color: #15803d !important;
          }

          .bg-indigo-950\/40, 
          .bg-indigo-950\/20, 
          .bg-indigo-950\/30, 
          .bg-indigo-950\/50,
          .bg-indigo-900\/20,
          .bg-indigo-950\/10 {
            background-color: #e0e7ff !important; /* indigo-50 */
            border-color: #c7d2fe !important; /* indigo-200 */
            color: #4f46e5 !important;
          }

          .bg-red-950\/50, 
          .bg-red-950\/40, 
          .bg-red-950\/30, 
          .bg-red-950\/20, 
          .bg-rose-950\/20, 
          .bg-rose-950\/40,
          .bg-red-950\/10,
          .bg-rose-950\/10,
          .bg-red-900\/20 {
            background-color: #fef2f2 !important; /* red-50 */
            border-color: #fecaca !important; /* red-200 */
            color: #be123c !important;
          }

          .bg-cyan-950\/40, 
          .bg-blue-950\/40, 
          .bg-blue-950\/30,
          .bg-blue-950\/10,
          .bg-cyan-900\/10,
          .bg-cyan-900\/20 {
            background-color: #f0f9ff !important; /* sky-50 */
            border-color: #bae6fd !important;
            color: #0369a1 !important;
          }

          .bg-amber-950\/40, 
          .bg-yellow-950\/20, 
          .bg-yellow-950\/40,
          .bg-yellow-900\/20,
          .bg-amber-900\/20 {
            background-color: #fefcbf !important; /* yellow-50 */
            border-color: #fef08a !important;
            color: #b45309 !important;
          }

          /* Ensure proper styling for charts and SVG graphs */
          .recharts-cartesian-grid-horizontal line, 
          .recharts-cartesian-grid-vertical line {
            stroke: #cbd5e1 !important;
            stroke-dasharray: 3 3;
          }
          .recharts-text, .recharts-label {
            fill: #1e293b !important;
            font-weight: 500;
          }
          .recharts-default-tooltip {
            background-color: #ffffff !important;
            border-color: #cbd5e1 !important;
            color: #0f172a !important;
          }
          .recharts-legend-item-text {
            color: #1e293b !important;
          }

          /* Consoles & Terminals styling */
          .font-mono.bg-black, 
          .font-mono.bg-slate-950, 
          .font-mono.bg-slate-900, 
          .font-mono.bg-\#0b0f19,
          .font-mono.bg-slate-950\/80,
          .font-mono.bg-slate-950\/90,
          #direwolf-terminal,
          #weewx-terminal,
          #aprx-terminal {
            background-color: #fafafa !important;
            color: #0f172a !important;
            border-color: #cbd5e1 !important;
          }

          /* Weather LCD glow effect swap to dark border glow */
          .shadow-\[0_0_15px_rgba\(16\,185\,129\,0\.15\)\] {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05) !important;
          }

          /* Alert blinkers & headers */
          .border-red-500\/30, .border-red-500\/20 {
            border-color: #fecaca !important;
          }
          .bg-red-950/20 {
            background-color: #fef2f2 !important;
          }

          /* Map Pin popup and header alerts */
          .leaflet-popup-content-wrapper, .leaflet-popup-tip {
            background: #ffffff !important;
            color: #0f172a !important;
          }
        `}} />
      )}
      {loadingUser ? (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <Radio className="text-emerald-500 animate-pulse" size={48} />
            <h1 className="font-sans font-extrabold text-lg tracking-widest text-emerald-400 uppercase">S.A.T. CONSOLE</h1>
            <p className="text-xs text-slate-500 font-mono tracking-widest uppercase">Estableciendo canal seguro...</p>
            <div className="w-20 h-1 bg-slate-900 rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-emerald-500 animate-bounce duration-1000"></div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* HEADER COMPONENT */}
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
        currentUser={currentUser}
        isFirebaseSyncEnabled={isFirebaseSyncEnabled}
        onToggleFirebaseSync={handleToggleFirebaseSync}
        propagation={data.propagation}
        onUpdateConfig={handleSaveConfig}
      />

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

      {/* SECCIÓN DE PILARES SAT - MARCO DE ALERTA TEMPRANA ONU/OMM */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col gap-4">
        
        {/* Tier 1: 10 Pillars Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3">
          
          {/* PILAR I */}
          <button
            onClick={() => setActiveTab('monitor')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['monitor', 'sismos-ign', 'aemet-portal', 'incendios', 'navareas', 'portus', 'radiological', 'salud', 'dgt', 'ica', 'propagacion', 'repetidores'].includes(activeTab)
                ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['monitor', 'sismos-ign', 'aemet-portal', 'incendios', 'navareas', 'portus', 'radiological', 'salud', 'dgt', 'ica', 'propagacion', 'repetidores'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={['monitor', 'sismos-ign', 'aemet-portal', 'incendios', 'navareas', 'portus', 'radiological', 'salud', 'dgt', 'ica', 'propagacion', 'repetidores'].includes(activeTab) ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['monitor', 'sismos-ign', 'aemet-portal', 'incendios', 'navareas', 'portus', 'radiological', 'salud', 'dgt', 'ica', 'propagacion', 'repetidores'].includes(activeTab) ? 'text-emerald-400' : 'text-slate-300'}`}>
                Pilar I: Sondeo y Diagnóstico
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Sondeo, Evaluación y Alertas
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                Integral Sismos, Radiactividad, NASA, DGT, NAVTEX
              </span>
            </div>
          </button>

          {/* PILAR II: VERIFICACIÓN Y CECOP (EXCLUSIVE NEW PILLAR) */}
          <button
            onClick={() => setActiveTab('cecop-dashboard')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              activeTab === 'cecop-dashboard'
                ? 'bg-amber-950/20 border-amber-550/50 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {activeTab === 'cecop-dashboard' && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-amber-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className={activeTab === 'cecop-dashboard' ? 'text-amber-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${activeTab === 'cecop-dashboard' ? 'text-amber-400' : 'text-slate-300'}`}>
                Pilar II: Verificación y CECOP
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Coordinación y Triage (PEM)
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                Validación, Drills y Riesgos
              </span>
            </div>
          </button>

          {/* PILAR III (formerly PILAR II) */}
          <button
            onClick={() => setActiveTab('navareas')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['navareas', 'portus'].includes(activeTab)
                ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['navareas', 'portus'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-cyan-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Radio size={16} className={['navareas', 'portus'].includes(activeTab) ? 'text-cyan-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['navareas', 'portus'].includes(activeTab) ? 'text-cyan-400' : 'text-slate-300'}`}>
                Pilar III: Canales Marítimos
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-cyan-400 font-mono leading-relaxed truncate">
                Difusión, Red VHF y NAVTEX
              </span>
              <span className="text-[9px] text-slate-550 font-mono mt-0.5 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isEmergencyBroadcastActive ? 'bg-red-500 animate-ping shrink-0' : 'bg-cyan-500'}`}></span>
                {navareas.length} Avisos • Portus Boyas
              </span>
            </div>
          </button>

          {/* PILAR IV (formerly PILAR III) */}
          <button
            onClick={() => setActiveTab('engineering')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['engineering'].includes(activeTab)
                ? 'bg-indigo-950/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['engineering'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-indigo-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <FileCode size={16} className={['engineering'].includes(activeTab) ? 'text-indigo-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['engineering'].includes(activeTab) ? 'text-indigo-400' : 'text-slate-300'}`}>
                Pilar IV: Respuesta
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Garantía y Preparación Civil
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-indigo-400"></span>
                Planificadores • Parámetros Alarma
              </span>
            </div>
          </button>

          {/* PILAR V: SISTEMA (formerly PILAR IV) */}
          <button
            onClick={() => setActiveTab('sistema')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['sistema'].includes(activeTab)
                ? 'bg-violet-950/20 border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['sistema'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-violet-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Cpu size={16} className={['sistema'].includes(activeTab) ? 'text-violet-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['sistema'].includes(activeTab) ? 'text-violet-400' : 'text-slate-300'}`}>
                Pilar V: Sistema
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Diagnósticos, Núcleo y Logs
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse"></span>
                Servidor NUC • Terminal SAT
              </span>
            </div>
          </button>

          {/* PILAR VI: WEEWX (formerly PILAR V) */}
          <button
            onClick={() => setActiveTab('weewx-pillar')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['weewx-pillar'].includes(activeTab)
                ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['weewx-pillar'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-amber-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <CloudSun size={16} className={['weewx-pillar'].includes(activeTab) ? 'text-amber-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['weewx-pillar'].includes(activeTab) ? 'text-amber-400' : 'text-slate-200'}`}>
                Pilar VI: WeeWX
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Consola y Motor Met.
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                WeeWX Activo • SQLite sdb
              </span>
            </div>
          </button>

          {/* PILAR VII: DIREWOLF (formerly PILAR VI) */}
          <button
            onClick={() => setActiveTab('direwolf-pillar')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['direwolf-pillar'].includes(activeTab)
                ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['direwolf-pillar'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Radio size={16} className={['direwolf-pillar'].includes(activeTab) ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['direwolf-pillar'].includes(activeTab) ? 'text-emerald-400' : 'text-slate-200'}`}>
                Pilar VII: Direwolf
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                TNC de Radiocom.
              </span>
              <span className="text-[9px] text-slate-550 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                144.800 MHz • AFSK
              </span>
            </div>
          </button>

          {/* PILAR VIII: APRX (formerly PILAR VII) */}
          <button
            onClick={() => setActiveTab('aprx-pillar')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['aprx-pillar'].includes(activeTab)
                ? 'bg-blue-950/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['aprx-pillar'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-blue-5/5 bg-blue-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Globe size={16} className={['aprx-pillar'].includes(activeTab) ? 'text-blue-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['aprx-pillar'].includes(activeTab) ? 'text-blue-400' : 'text-slate-200'}`}>
                Pilar VIII: APRX
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                IGate y Enrutador
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                Standby • APRS-IS
              </span>
            </div>
          </button>

          {/* PILAR IX: COMPILADOR Y ADAPTADOR APRS */}
          <button
            onClick={() => setActiveTab('aprs-adaptor')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['aprs-adaptor'].includes(activeTab)
                ? 'bg-orange-950/20 border-orange-500/50 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['aprs-adaptor'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-orange-5/5 bg-orange-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
               <Radio size={16} className={['aprs-adaptor'].includes(activeTab) ? 'text-orange-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['aprs-adaptor'].includes(activeTab) ? 'text-orange-400' : 'text-slate-200'}`}>
                Pilar IX: Adaptación APRS
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Compilador y Red AX.25
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${aprsPackets.some(p => p.status === 'PENDIENTE') ? 'bg-amber-400 animate-ring' : 'bg-orange-400'}`}></span>
                {aprsPackets.length} Tráfico • Cola FM
              </span>
            </div>
          </button>

          {/* PILAR X: PAT MAIL & AX.25 SUBSYSTEM */}
          <button
            onClick={() => setActiveTab('pat-pillar')}
            className={`text-left p-3.5 rounded-xl border transition-all duration-300 relative cursor-pointer flex flex-col gap-1.5 overflow-hidden ${
              ['pat-pillar'].includes(activeTab)
                ? 'bg-violet-950/30 border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
                : 'bg-slate-950/40 border-slate-850 hover:border-slate-800 hover:bg-slate-950/80'
            }`}
          >
            {/* Corner Decorative Accent */}
            {['pat-pillar'].includes(activeTab) && (
              <div className="absolute top-0 right-0 w-8 h-8 bg-violet-50/5 rounded-bl-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Mail size={16} className={['pat-pillar'].includes(activeTab) ? 'text-violet-400 animate-pulse' : 'text-slate-400'} />
              <span className={`font-sans font-bold text-xs uppercase tracking-wide ${['pat-pillar'].includes(activeTab) ? 'text-violet-400' : 'text-slate-200'}`}>
                Pilar X: Pat Winlink
              </span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                Winlink y AX.25 Debian
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                Web Server 8080 • ax0/wl0
              </span>
            </div>
          </button>

        </div>

        {/* Tier 2: Secondary Tab Selection Bar */}
        <div className="flex items-center justify-between flex-wrap gap-3 border-t border-slate-800 pt-3">
          <div className="flex items-center flex-wrap gap-1.5">
            
            {/* Pilar I Sub-tabs (Merged with Pilar II and Pilar III NAVTEX/Portus boyas) */}
            {['monitor', 'sismos-ign', 'aemet-portal', 'incendios', 'navareas', 'portus', 'radiological', 'salud', 'dgt', 'ica', 'propagacion', 'repetidores'].includes(activeTab) && (
              <>
                <button
                  onClick={() => setActiveTab('monitor')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'monitor'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-monitor-trigger"
                >
                  <ShieldCheck size={13} />
                  Consola Operativa S.A.T. (Central)
                </button>
                <button
                  onClick={() => setActiveTab('sismos-ign')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'sismos-ign'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-sismos-trigger"
                >
                  <Globe size={13} />
                  Sismógrafo IGN en Directo
                </button>
                <button
                  onClick={() => setActiveTab('aemet-portal')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'aemet-portal'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-aemet-trigger"
                >
                  <CloudRain size={13} />
                  Meteorología AEMET OpenData
                </button>
                <button
                  onClick={() => setActiveTab('incendios')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'incendios'
                      ? 'bg-[#ef4444] text-[#ffffff] shadow-md shadow-red-500/20'
                      : 'text-rose-400 hover:text-rose-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                  id="tab-incendios-trigger"
                >
                  <Flame size={13} className="text-red-500 animate-pulse" />
                  Monitor Incendios (NASA/Copernicus)
                </button>
                <button
                  onClick={() => setActiveTab('radiological')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'radiological'
                      ? 'bg-emerald-400 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-radiological-trigger"
                >
                  <Database size={13} />
                  Radiactividad Ambiental (CSN/JRC)
                </button>
                <button
                  onClick={() => setActiveTab('salud')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'salud'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-salud-trigger"
                >
                  <HeartPulse size={13} />
                  Índice Climatológico Meteosalud
                </button>
                <button
                  onClick={() => setActiveTab('dgt')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'dgt'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-dgt-trigger"
                >
                  <Radio size={13} />
                  Tránsito e Incidencias DGT
                </button>
                <button
                  onClick={() => setActiveTab('navareas')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'navareas'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-navareas-trigger"
                >
                  <Anchor size={13} />
                  Boletines Marítimos NAVAREA III
                </button>
                <button
                  onClick={() => setActiveTab('portus')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'portus'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-portus-trigger"
                >
                  <Waves size={13} />
                  Física de Aguas Portus (boyas)
                </button>
                <button
                  onClick={() => setActiveTab('ica')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'ica'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-ica-trigger"
                >
                  <Wind size={13} />
                  Calidad del Aire (ICA)
                </button>
                <button
                  onClick={() => setActiveTab('propagacion')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'propagacion'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-propagacion-trigger"
                >
                  <Waves size={13} />
                  Propagación HF y Clima Espacial
                </button>
                <button
                  onClick={() => setActiveTab('repetidores')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'repetidores'
                      ? 'bg-emerald-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-repetidores-trigger"
                >
                  <Radio size={13} />
                  Guía de Repetidores
                </button>
              </>
            )}

            {/* Pilar III Sub-tabs */}
            {['engineering'].includes(activeTab) && (
              <>
                <button
                  onClick={() => setActiveTab('engineering')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'engineering'
                      ? 'bg-indigo-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-engineer-trigger"
                >
                  <FileCode size={13} />
                  Soporte, Parámetros y Planificadores S.A.T.
                </button>
              </>
            )}

            {/* Pilar IV Sub-tabs */}
            {['sistema'].includes(activeTab) && (
              <>
                <button
                  onClick={() => setActiveTab('sistema')}
                  className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    activeTab === 'sistema'
                      ? 'bg-violet-400 text-slate-955 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                  id="tab-sistema-trigger"
                >
                  <Cpu size={13} className="text-violet-950" />
                  Diagnósticos de Servidor Intel NUC & Terminal Logs
                </button>
              </>
            )}

            {/* Pilar V Sub-tabs */}
            {['weewx-pillar'].includes(activeTab) && (
              <>
                <button
                  onClick={() => setActiveTab('weewx-pillar')}
                  className="px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none bg-amber-400 text-slate-950 shadow-md font-sans"
                  id="tab-weewx-trigger"
                >
                  <CloudSun size={13} />
                  Consola de Motor Meteorológico WeeWX (SQLite)
                </button>
              </>
            )}

            {/* Pilar VI Sub-tabs */}
            {['direwolf-pillar'].includes(activeTab) && (
              <>
                <button
                  onClick={() => setActiveTab('direwolf-pillar')}
                  className="px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none bg-emerald-400 text-slate-950 shadow-md font-sans"
                  id="tab-direwolf-trigger"
                >
                  <Radio size={13} />
                  TNC de Radiocomunicaciones Direwolf (144.800 MHz)
                </button>
              </>
            )}

            {/* Pilar VII Sub-tabs */}
            {['aprx-pillar'].includes(activeTab) && (
              <>
                <button
                  onClick={() => setActiveTab('aprx-pillar')}
                  className="px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none bg-blue-500 text-slate-950 shadow-md font-sans font-black"
                  id="tab-aprx-trigger"
                >
                  <Globe size={13} />
                  Consola de Enrutamiento e IGate APRX
                </button>
              </>
            )}

          </div>

          {/* Localized parameters badge */}
          <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
            <div className="flex items-center gap-1">
              <MapPin size={12} className="text-yellow-500/80" />
              <span>QTH: <span className="text-slate-300">{data.gpsd.isFallback ? 'Madrid CENTRAL' : 'Coordenadas Fijas de Red'}</span></span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="hidden sm:inline">Esquema Integrado S.A.T. • 1 Hz</span>
          </div>

        </div>

      </div>

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
      <main className="flex-1 p-4 max-w-7xl mx-auto w-full flex flex-col gap-4">
        
        {activeTab === 'monitor' ? (
          /* CONSOLA OPERATIVA MONITORS GRID - REDISEÑO HAMCLOCK / WORLD RADIO LEAGUE */
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-5"
          >
            {/* TIER 1: BANNER DE PERFIL DEL OPERADOR Y ESTACIÓN (Estilo World Radio League) */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-stretch justify-between gap-4 backdrop-blur-sm relative overflow-hidden">
              {/* Background ambient accents */}
              <div className="absolute top-0 left-0 w-32 h-full bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
              <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-cyan-500/5 to-transparent pointer-events-none" />

              {/* Left Section: Station Callsign Profile Badge */}
              <div className="flex items-center gap-4 relative">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] shrink-0 animate-pulse">
                  <Radio size={28} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-3xl font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 uppercase drop-shadow-[0_0_10px_rgba(52,211,153,0.2)]">
                      {data.config.callsign}
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase">
                      SYS-OP
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1 font-mono text-emerald-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      APRS-IS ENLACE ACTIVO
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="font-mono text-slate-300 flex items-center gap-1">
                      <MapPin size={12} className="text-cyan-400" />
                      QTH: <span className="text-cyan-300 font-bold">{getMaidenheadLocator(data.gpsd.lat, data.gpsd.lon)}</span>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-300 font-mono">
                      LAT: <span className="font-bold">{data.gpsd.lat.toFixed(4)}°N</span> | LON: <span className="font-bold">{data.gpsd.lon.toFixed(4)}°E</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Center Section: Active Frequencies & Radio Link Status */}
              <div className="flex flex-col justify-center border-t border-b border-slate-800/60 py-3 md:py-0 md:border-t-0 md:border-b-0 md:border-l md:border-r md:px-6 border-slate-800 shrink-0">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] tracking-wider">Frecuencia VHF</span>
                    <span className="text-slate-200 font-bold text-emerald-400">144.800 MHz FM</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] tracking-wider">TNC Hardware</span>
                    <span className="text-slate-200 font-bold">Direwolf AFSK</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] tracking-wider">Sincronía NTP</span>
                    <span className="text-slate-200 font-bold flex items-center gap-1 text-cyan-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      +{data.ntp.offsetMs.toFixed(2)}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] tracking-wider">Velocidad TNC</span>
                    <span className="text-slate-200 font-bold">1200 Baudios</span>
                  </div>
                </div>
              </div>

              {/* Right Section: Time Synchronicity & Quick System Information */}
              <div className="flex items-center gap-4 justify-between md:justify-end shrink-0">
                <div className="text-right flex flex-col justify-center">
                  <div className="flex items-center gap-2 justify-end">
                    <Clock size={14} className="text-cyan-400" />
                    <span className="font-mono text-lg font-bold text-slate-100 tracking-wider">
                      {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} UTC
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">
                    NTP STRATUM {data.ntp.stratum} • LATENCIA {rtt !== null ? `${rtt}ms` : 'N/A'}
                  </span>
                  <div className="flex items-center gap-1.5 justify-end mt-1.5">
                    <span className="text-[10px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                      CPU Temp: <span className="text-amber-400 font-bold">{data.nucStats.cpuTempC}°C</span>
                    </span>
                    <span className="text-[10px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                      RAM: <span className="text-cyan-400 font-bold">{data.nucStats.ramUsagePct}%</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* TIER 2: CENTRAL BENTO DASHBOARD GRID (Símil OpenHamClock / WRL Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              
              {/* COLUMNA IZQUIERDA (Span 4): METEOROLOGÍA LCD LOCAL */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                {/* Panel: Meteorología LCD Local */}
                <div className="flex flex-col gap-4">
                  <WeatherStation weather={data.weather} iqair={data.iqair} />
                </div>
              </div>

              {/* COLUMNA DERECHA (Span 8): MAPA TÁCTICO, ALERTAS Y TENDENCIA DE TRÁFICO */}
              <div className="lg:col-span-8 flex flex-col gap-5">
                {/* Mapa de Cobertura de Emergencia */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col h-[460px] relative">
                  <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      <h3 className="font-mono text-xs font-black uppercase tracking-widest text-slate-200">
                        Visualizador de Cartografía y Tráfico Táctico S.A.T.
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-950 border border-slate-850 px-2 py-0.5 rounded">
                      Radio Cobertura: {data.config.filterRadiusKm} km
                    </span>
                  </div>
                  <div className="flex-1 relative min-h-0">
                    <RadarMap 
                      gpsd={data.gpsd} 
                      earthquakes={data.earthquakes} 
                      vessels={data.vessels}
                      aprsPackets={aprsPackets}
                      filterRadiusKm={data.config.filterRadiusKm}
                      onRelocate={handleRelocate}
                      fallbackLat={data.config.fallbackLat}
                      fallbackLon={data.config.fallbackLon}
                    />
                  </div>
                </div>

                {/* Nota: Tendencia de Tráfico APRS reubicada en el Pilar VII: Direwolf */}
              </div>

            </div>

            {/* TIER 3: WORLD RADIO LEAGUE LIVE STATION LOGBOOK & ALERTS SPLIT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              
              {/* LOGBOOK EN DIRECTO (Span 7) - Visualizador de tráfico de radioaficionados */}
              <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-emerald-400" />
                    <h3 className="font-mono text-xs font-black uppercase tracking-widest text-slate-200">
                      S.A.T. Station Logbook (Tráfico APRS / AIS)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
                    <span>Total Cola: <span className="text-slate-300 font-bold">{aprsPackets.length}</span></span>
                    <span>•</span>
                    <span>Logs de Enlace: <span className="text-emerald-400 font-bold">{data.logs ? data.logs.filter(l => l.type !== 'SYS').length : 0}</span></span>
                  </div>
                </div>

                {/* List Stream de Logbook */}
                <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1" id="wrl-logbook-feed">
                  {data.logs && data.logs.filter(l => l.type !== 'SYS').length > 0 ? (
                    data.logs.filter(l => l.type !== 'SYS').slice(0, 15).map((log, index) => {
                      let typeColor = "text-slate-400 bg-slate-950/50 border-slate-800";
                      let typeLabel = "SYS";
                      if (log.type === "TX") {
                        typeColor = "text-emerald-400 bg-emerald-950/20 border-emerald-500/20";
                        typeLabel = "TX RF";
                      } else if (log.type === "RX") {
                        typeColor = "text-cyan-400 bg-cyan-950/20 border-cyan-500/20";
                        typeLabel = "RX IS";
                      } else if (log.type === "AIS") {
                        typeColor = "text-indigo-400 bg-indigo-950/20 border-indigo-500/20";
                        typeLabel = "AIS MS";
                      } else if (log.type === "WINLINK") {
                        typeColor = "text-violet-400 bg-violet-950/20 border-violet-500/20";
                        typeLabel = "WLINK";
                      }

                      return (
                        <div 
                          key={log.id || `log-${index}`}
                          className="flex items-start justify-between gap-3 p-2.5 bg-slate-950/50 border border-slate-850/50 rounded-xl hover:border-slate-800 transition-all font-mono text-xs leading-relaxed"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            {/* Type Pill */}
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border tracking-wider shrink-0 ${typeColor}`}>
                              {typeLabel}
                            </span>
                            
                            {/* Packet content */}
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-emerald-400 text-slate-200">
                                  {log.source || data.config.callsign}
                                </span>
                                {log.destination && (
                                  <>
                                    <span className="text-slate-600 text-[10px]">&gt;</span>
                                    <span className="text-slate-400 text-[10px]">{log.destination}</span>
                                  </>
                                )}
                                {log.path && (
                                  <span className="text-slate-500 text-[9px] hidden sm:inline">[{log.path}]</span>
                                )}
                              </div>
                              <p className="text-slate-300 break-all text-[11px] mt-0.5 whitespace-pre-wrap">
                                {log.payload}
                              </p>
                              {log.remarks && (
                                <span className="text-slate-500 text-[9px] italic mt-0.5">
                                  ℹ️ {log.remarks}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Time offset & Success marker */}
                          <div className="text-right shrink-0 flex flex-col items-end gap-1 font-mono text-[9px]">
                            <span className="text-slate-500">
                              {log.timestamp ? log.timestamp.split("T")[1]?.slice(0, 8) || log.timestamp : "N/A"}
                            </span>
                            {log.success ? (
                              <span className="text-emerald-400 font-bold">OK</span>
                            ) : (
                              <span className="text-red-400 font-bold">ERR</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-850 rounded-xl">
                      Esperando paquetes APRS / AIS de telemetría local...
                    </div>
                  )}
                </div>
              </div>

              {/* ENGINES DE ALERTAS Y NOTIFICADORES (Span 5) */}
              <div className="lg:col-span-5 flex flex-col gap-5">
                
                {/* Panel de Alertas Activas */}
                <NotificationPanel 
                  earthquakes={data.earthquakes} 
                  noaaAlerts={data.noaaAlerts} 
                  navareas={navareas} 
                  minMagnitudVisualThreshold={data.config.minMagnitudAlertaVisual ?? 3.0}
                  onAddSimulatedNavarea={handleAddSimulatedNavarea}
                  weather={data.weather}
                  tsunamiAlerts={data.tsunamiAlerts || []}
                  cecopSituacion={cecopSituacion}
                  aemetAlerts={data.aemetAlerts || []}
                  aemetAlertsSubscriptionEnabled={data.config.aemetAlertsSubscriptionEnabled ?? true}
                  gpsd={data.gpsd}
                />

                {/* Motor continuo de escaneo de amenazas */}
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
              </div>

            </div>

            {/* TIER 4: MONITOR DE ALERTAS DE EMERGENCIA S.A.T */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
              
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <Sliders size={14} className="text-slate-400" />
                <h4 className="font-mono text-xs font-black uppercase tracking-widest text-slate-400">
                  Monitor de Alertas y Eventos Sísmicos/Meteorológicos S.A.T.
                </h4>
              </div>

              {/* Alert Monitor List */}
              <motion.div
                key={`alert-monitor-wrapper-${alertAnimKey}`}
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: isEcoMode ? 0 : 0.4 }}
                className="w-full"
              >
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
            </div>

          </motion.div>
        ) : activeTab === 'cecop-dashboard' ? (
          /* PILAR II: COORDINACIÓN Y VERIFICACIÓN CECOP (PEM) */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
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
        ) : activeTab === 'radiological' ? (
          /* UNIFIED RADIOLOGICAL MONITOR: CSN & JRC */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <RadiologicalNetworks 
              stations={data.csnStations || []} 
              gpsd={data.gpsd} 
              onRelocate={(lat, lon) => handleRelocate(lat, lon, 'Estación CSN REA')} 
            />
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
        ) : activeTab === 'sismos-ign' ? (
          /* IGN EARTHQUAKE INDICATORS PANEL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <IgnEarthquakeIndicators 
              earthquakes={data.earthquakes || []} 
              gpsd={data.gpsd} 
              onRelocate={(lat, lon) => handleRelocate(lat, lon, 'Epicentro Sísmico IGN')} 
              isRefreshing={isRefreshing}
              onRefresh={() => fetchTelemetry(false)}
            />
          </motion.div>
        ) : activeTab === 'aemet-portal' ? (
          /* AEMET OPENDATA PRODUCT DOWNLOAD PORTAL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <AemetOpenDataPortal 
              config={data.config}
              weather={data.weather}
              iqair={data.iqair}
              onUpdateConfig={async (newConfig) => {
                const updatedFull = { ...data.config, ...newConfig } as TelemetryConfig;
                return handleSaveConfig(updatedFull);
              }}
            />
          </motion.div>
        ) : activeTab === 'incendios' ? (
          /* REAL-TIME WILDFIRE SPAIN MONITOR BASED ON COPERNICUS & NASA LAND-NRT */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <WildfireMonitor gpsd={data.gpsd} config={data.config} />
          </motion.div>
        ) : activeTab === 'portus' ? (
          /* PORTUS OCEANOGRAPHIC PUERTOS DEL ESTADO DATABASE */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <PortusOceanData 
              gpsd={data.gpsd} 
              onRelocate={(lat, lon, title) => handleRelocate(lat, lon, title)} 
              onInjectRaw={handleInjectRaw} 
              erddapBuoys={data.erddapBuoys || []}
              portusStations={data.portusStations || []}
            />
          </motion.div>
        ) : activeTab === 'navareas' ? (
          /* NAVAREA / NAVTEX EMERGENCY COMSAR ALERTS PORTAL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <NavareaMonitor 
              gpsd={data.gpsd} 
              onRelocate={(lat, lon, title) => handleRelocate(lat, lon, title)} 
              onInjectRaw={handleInjectRaw} 
              warnings={navareas}
              inmarsatMessages={data.inmarsatMessages || []}
            />
          </motion.div>
        ) : activeTab === 'salud' ? (
          /* METEOSALUD PLAN TEMPERATURE WATCH PORTAL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <MeteosaludPortal 
              gpsd={data.gpsd} 
              onInjectRaw={handleInjectRaw} 
            />
          </motion.div>
        ) : activeTab === 'ica' ? (
          /* ICA AIR QUALITY MONITOR PORTAL */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            {data && <IcaAirQualityMonitor gpsd={data.gpsd} />}
          </motion.div>
        ) : activeTab === 'propagacion' ? (
          /* HF PROPAGATION & SPACE WEATHER MONITOR */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            {data && <PropagacionMonitor data={data.propagation} />}
          </motion.div>
        ) : activeTab === 'repetidores' ? (
          /* VADEMECUM DE REPETIDORES DE ESPAÑA (REMER / PROTECTION CIVIL) */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <RepeaterDatabaseView 
              onInjectRaw={handleInjectRaw}
              showToast={showToast}
              gpsd={data.gpsd}
            />
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
          /* PILAR DE CONTROL DIREWOLF EXCLUSIVO (CON DIAGNÓSTICOS, LOGS Y TENDENCIAS CENTRALIZADAS) */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-5"
          >
            <DirewolfConsole 
              weather={data.weather} 
              callsign={data.config.callsign}
              systemLogs={data?.logs}
            />

            {/* Tendencia de Tráfico y Modulación de Radio (Última Hora) */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <TransmissionTrafficTrends trafficTrends={data.trafficTrends} />
            </div>

            {/* Módem de Radiocomunicaciones Direwolf y Terminal TNC */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-5 flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5">
                <Sliders size={14} className="text-emerald-400" />
                <h4 className="font-mono text-xs font-black uppercase tracking-widest text-slate-300">
                  Consola Operativa S.A.T. (Central) - Enlace de Datos Direwolf
                </h4>
              </div>

              <div className="grid grid-cols-1 gap-5">
                {/* Módem de Radiocomunicaciones Direwolf (Núcleo TNC AX.25) */}
                <NucConsole callsign={data.config.callsign} />

                {/* Terminal TNC de Tráfico de Paquetes APRS */}
                <TerminalLogs 
                  logs={data.logs ? data.logs.filter(l => l.type === 'TX' || l.type === 'RX' || l.type === 'WINLINK') : []}
                  onInjectRaw={handleInjectRaw}
                  onTriggerSismoTest={handleTriggerSismoTest}
                  onTriggerNoaaTest={handleTriggerNoaaTest}
                  onClearLogs={handleClearLogs}
                />
              </div>
            </div>
          </motion.div>
        ) : activeTab === 'aprx-pillar' ? (
          /* PILAR DE ENRUTAMIENTO APRX EXCLUSIVO */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <AprxConsole 
              weather={data.weather} 
              aprsPackets={aprsPackets}
              setAprsPackets={setAprsPackets}
              playBuzzerSound={playBuzzerSound}
              showToast={showToast}
              callsign={data.config.callsign}
              systemLogs={data?.logs}
              onInjectRaw={handleInjectRaw}
            />
          </motion.div>
        ) : activeTab === 'sistema' ? (
          /* DIÁGNOSTICOS Y CONTROL DE SISTEMA RED SAT */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
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
              <Configurator config={data.config} onSaveConfig={handleSaveConfig} gpsd={data.gpsd} currentUser={currentUser} />
              
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
              <SyncScheduler config={data.config} onSaveConfig={handleSaveConfig} currentUser={currentUser} />
              <AprsScheduler onScheduleTriggered={() => fetchTelemetry(true)} />
              <AlarmThresholds config={data.config} onSaveConfig={handleSaveConfig} currentUser={currentUser} />
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

                <div className="grid grid-cols-3 gap-2">
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

                  <button
                    onClick={() => {
                      // Navigate to Gonio-Radar or locate station coordinates!
                      handleRelocate(incomingAprsModal.latitude, incomingAprsModal.longitude, `Estación ${incomingAprsModal.callsign}`);
                      setIncomingAprsModal(null);
                      setIsReplying(false);
                      setAprsReplyText('');
                      if (showToast) {
                        showToast(`Centrado gonio-radar en coordenadas de la estación: ${incomingAprsModal.callsign}`);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-xs font-mono font-bold cursor-pointer transition-all flex items-center justify-center gap-1 shadow-lg shadow-blue-500/15"
                    id="aprs-modal-radar-btn"
                  >
                    <Target size={12} />
                    Ver Radar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="bg-slate-950 border-t border-slate-900 py-3 text-center text-[10px] text-slate-500 font-mono flex flex-col lg:flex-row items-center justify-between px-4 gap-2 gap-y-3">
        <span>© 2026 S.A.T.-APRS by EA7JRS • Todos los derechos reservados • Licencia SPDX • IARU / ITU / BOE-A-2013-7624</span>
        <NtpSyncStatus ntp={data?.ntp} />
        
        {/* FIREBASE SYNC STATUS */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900/40 border border-slate-900 rounded-lg select-none">
          <Database size={11} className={syncStatus === 'syncing' ? 'text-amber-400 animate-spin' : syncStatus === 'error' ? 'text-rose-500' : 'text-emerald-400'} />
          <span className="text-slate-500 mr-1 uppercase text-[9px] font-bold">Nube:</span>
          {syncStatus === 'synced' && (
            <span className="flex items-center gap-1 text-emerald-400 font-bold uppercase text-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Sincronizado
            </span>
          )}
          {syncStatus === 'syncing' && (
            <span className="flex items-center gap-1 text-amber-400 font-bold uppercase text-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              Sincronizando...
            </span>
          )}
          {syncStatus === 'error' && (
            <span className="flex items-center gap-1 text-rose-400 font-bold uppercase text-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
              Error
            </span>
          )}
          {syncStatus === 'disabled' && (
            <span className="flex items-center gap-1 text-slate-500 font-bold uppercase text-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-600"></span>
              Inactivo
            </span>
          )}
          {syncStatus === 'offline' && (
            <span className="flex items-center gap-1 text-indigo-400 font-bold uppercase text-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              Sin Red (Offline)
            </span>
          )}
        </div>

        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          S.A.T.-APRS Dashboard • v2.4.0 (Centralizado)
        </span>
      </footer>
        </>
      )}
    </motion.div>
  </MotionConfig>
);
}
