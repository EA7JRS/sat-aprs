import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  MapPin, 
  AlertOctagon, 
  Radio, 
  Users, 
  Layers, 
  CheckSquare, 
  Flame, 
  Activity, 
  Cpu, 
  ExternalLink, 
  Bell, 
  AlertTriangle,
  Play,
  RotateCcw,
  Plus,
  Send,
  Sliders,
  ChevronRight,
  TrendingUp,
  Clock,
  HeartPulse,
  Database,
  Waves,
  Trash2,
  Settings,
  Leaf,
  Download,
  FileSpreadsheet,
  Check,
  X,
  Search,
  LayoutList
} from 'lucide-react';
import { 
  EarthquakeEvent, 
  TsunamiAlert, 
  CsnReaStation, 
  DgtIncident, 
  WeatherTelemetry, 
  ERDDAPBuoy,
  IQAirStatus
} from '../../types';
import { NavareaWarning } from '../environment/NavareaMonitor';
import { AprsPacket } from '../radio/AprsAdaptor';

interface CecopDashboardProps {
  earthquakes: EarthquakeEvent[];
  tsunamiAlerts: TsunamiAlert[];
  csnStations: CsnReaStation[];
  dgtIncidents: DgtIncident[];
  erddapBuoys: ERDDAPBuoy[];
  navareas: NavareaWarning[];
  weather: WeatherTelemetry | null;
  iqair?: IQAirStatus;
  onModifyNavareas?: (nav: NavareaWarning[]) => void;
  playBuzzerSound?: (freq?: number, duration?: number, type?: OscillatorType) => void;
  showToast?: (msg: string) => void;
  aprsPackets?: AprsPacket[];
  setAprsPackets?: React.Dispatch<React.SetStateAction<AprsPacket[]>>;
  cecopSituacion?: 0 | 1 | 2 | 3;
  setCecopSituacion?: (val: 0 | 1 | 2 | 3) => void;
}

// Internal definitions for CECOP incidents being managed in the verification engine
interface IncidentState {
  id: string;
  source: 'IGN' | 'CSN' | 'DGT' | 'NASA' | 'AEMET' | 'PORTUS' | 'SIMULACRO';
  category: 'SISMICIDAD' | 'RADIACTIVIDAD' | 'VIAL' | 'INCENDIO' | 'METEOROLOGÍA' | 'MARÍTIMO';
  title: string;
  details: string;
  value: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  confidence: number; // 0-100%
  validation: 'PRE-VERIFICADO' | 'CONFIRMADO' | 'FALSA-ALARMA' | 'MITIGADO';
  operationalLevel: 0 | 1 | 2 | 3; // Situación 0-3 de Protección Civil
  affectedPopRange: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO';
  notes: string[];
}

interface OperationalUnit {
  id: string;
  name: string;
  type: 'BOMBEROS' | 'PROTECCION_CIVIL' | 'REMER' | 'UME' | 'SANITARIO' | 'POLICIA';
  callsign: string;
  status: 'DISPONIBLE' | 'MOVILIZADO' | 'EN_ESCENA' | 'STANDBY';
  location: string;
}

interface EmergencyFrequency {
  id: string;
  channelName: string;
  frequency: string;
  alertType: string;
  description: string;
  isActive: boolean;
}

interface AlertProfile {
  id: string;
  name: string;
  severity: 'CRÍTICO' | 'ALTO' | 'MEDIO' | 'VIGILANCIA';
  includeSismo: boolean;
  includeMeteo: boolean;
  includeTsunami: boolean;
  autoForward: boolean;
  deviationPreset: number;
  fecPreset: boolean;
  targetFrequencyName: string;
}

export default function CecopDashboard({
  earthquakes,
  tsunamiAlerts,
  csnStations,
  dgtIncidents,
  erddapBuoys,
  navareas,
  weather,
  iqair,
  playBuzzerSound,
  showToast,
  aprsPackets = [],
  setAprsPackets,
  cecopSituacion: propsCecopSituacion,
  setCecopSituacion: propsSetCecopSituacion
}: CecopDashboardProps) {

  // Active status level for the local emergency area: 0, 1, 2, 3
  const [localCecopSituacion, setLocalCecopSituacion] = useState<0 | 1 | 2 | 3>(0);
  const cecopSituacion = propsCecopSituacion !== undefined ? propsCecopSituacion : localCecopSituacion;
  const setCecopSituacion = (val: 0 | 1 | 2 | 3) => {
    if (propsSetCecopSituacion) propsSetCecopSituacion(val);
    else setLocalCecopSituacion(val);
  };
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  
  // Tactical action log / CECOP operational logging
  const [operationalLog, setOperationalLog] = useState<{ time: string; msg: string; type: string }[]>([
    { time: new Date(Date.now() - 3600000 * 2).toLocaleTimeString(), msg: 'CECOP S.A.T. Inicializado bajo estándares de PEM en fase de prealerta.', type: 'SYS' },
    { time: new Date(Date.now() - 3600000).toLocaleTimeString(), msg: 'Verificación formal de redes digitales APRS, TNC Direwolf y Gateway APRX completada.', type: 'SYS' },
  ]);

  const [triageNotes, setTriageNotes] = useState<string>('');

  // Compact display mode to fit more items in high traffic situations
  const [isCompactMode, setIsCompactMode] = useState<boolean>(() => {
    return localStorage.getItem('cecop_compact_mode') === 'true';
  });

  const toggleCompactMode = () => {
    setIsCompactMode(prev => {
      const next = !prev;
      localStorage.setItem('cecop_compact_mode', String(next));
      if (showToast) {
        showToast(next ? 'Modo de visualización compacta activado' : 'Modo de visualización detallada activado');
      }
      return next;
    });
  };

  // Preference state for Desktop/Push Notifications: 'disabled' | 'emergency_only' | 'all'
  const [notificationsEnabled, setNotificationsEnabled] = useState<'disabled' | 'emergency_only' | 'all'>(() => {
    const stored = localStorage.getItem('cecop_notification_preference');
    return (stored as 'disabled' | 'emergency_only' | 'all') || 'disabled';
  });

  // Preferences for specific alert types that trigger push notifications
  const [notifTypes, setNotifTypes] = useState<{ [key: string]: boolean }>(() => {
    const stored = localStorage.getItem('cecop_notif_types');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      'Sísmica': true,
      'Radiológica': true,
      'Meteorológica': true,
      'ICA': true,
      'Incendios': true
    };
  });

  // Detailed configuration thresholds for push notifications saved in localStorage
  const [eqMinMagnitude, setEqMinMagnitude] = useState<number>(() => {
    const stored = localStorage.getItem('cecop_notif_eq_min_magnitude');
    return stored ? parseFloat(stored) : 3.5;
  });

  const [wxMinSeverity, setWxMinSeverity] = useState<string>(() => {
    const stored = localStorage.getItem('cecop_notif_wx_min_severity');
    return stored || 'Alta';
  });

  const seenPacketIds = useRef<Set<string>>(new Set());

  // Initialize of seen packet IDs on first load
  useEffect(() => {
    if (aprsPackets) {
      aprsPackets.forEach(pkt => {
        seenPacketIds.current.add(pkt.id);
      });
    }
  }, []);

  // Listen for brand new incoming APRS packets and push desktop alerts
  useEffect(() => {
    if (!aprsPackets) return;

    aprsPackets.forEach(pkt => {
      // If the packet ID has not been seen yet, trigger notification logic
      if (!seenPacketIds.current.has(pkt.id)) {
        seenPacketIds.current.add(pkt.id);

        const isEmergency = pkt.isEmergency;
        const shouldNotify = 
          notificationsEnabled === 'all' || 
          (notificationsEnabled === 'emergency_only' && isEmergency);

        if (shouldNotify && 'Notification' in window && Notification.permission === 'granted') {
          const title = isEmergency 
            ? `⚠️ ALERTA CRÍTICA APRS (CECOP)` 
            : `📬 Tráfico APRS Recibido (CECOP)`;
          
          try {
            new Notification(title, {
              body: `${pkt.packetString.split(':')[0]}: ${pkt.packetString.substring(pkt.packetString.indexOf(':') + 1)}`,
              tag: pkt.id,
              requireInteraction: isEmergency
            });
          } catch (e) {
            console.error("Browser push notification failed to launch:", e);
          }
        }
      }
    });
  }, [aprsPackets, notificationsEnabled]);

  const handlePreferenceChange = async (pref: 'disabled' | 'emergency_only' | 'all') => {
    setNotificationsEnabled(pref);
    localStorage.setItem('cecop_notification_preference', pref);

    if (pref !== 'disabled' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && showToast) {
          showToast('Notificaciones push de escritorio activadas correctamente.');
        } else if (permission === 'denied' && showToast) {
          showToast('Permiso para notificaciones de escritorio denegado.');
        }
      } else if (Notification.permission === 'denied' && showToast) {
        showToast('Por favor, activa manualmente el permiso de notificaciones de escritorio en tu navegador.');
      }
    }
  };

  // Alert Recipients (Predefined APRS stations for forwarding high-priority emergency alerts)
  const [alertRecipients, setAlertRecipients] = useState<{ id: string; callsign: string; stationName: string; freq: string; isActive: boolean }[]>(() => {
    const stored = localStorage.getItem('cecop_alert_recipients');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse alert recipients", e);
      }
    }
    return [
      { id: 'rec-1', callsign: 'EA4ZO-9', stationName: 'Cruz Roja Segovia (TNC)', freq: '144.800 MHz', isActive: true },
      { id: 'rec-2', callsign: 'EB4MA-B', stationName: 'Enlace Regional REMER', freq: '144.800 MHz', isActive: true },
      { id: 'rec-3', callsign: 'EA4YAK-1', stationName: 'Protección Civil S.A.T.', freq: '144.800 MHz', isActive: true },
    ];
  });

  const [newRecCallsign, setNewRecCallsign] = useState('');
  const [newRecName, setNewRecName] = useState('');
  const [newRecFreq, setNewRecFreq] = useState('144.800 MHz');

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecCallsign.trim() || !newRecName.trim()) {
      if (showToast) showToast('Complete de forma obligatoria los campos de indicativo y estación.');
      return;
    }
    
    const formatCallsign = newRecCallsign.trim().toUpperCase();
    if (alertRecipients.some(r => r.callsign === formatCallsign)) {
      if (showToast) showToast('Ese indicativo ya se encuentra configurado.');
      return;
    }

    const newRec = {
      id: `rec-${Date.now()}`,
      callsign: formatCallsign,
      stationName: newRecName.trim(),
      freq: newRecFreq.trim() || '144.800 MHz',
      isActive: true
    };

    const updated = [...alertRecipients, newRec];
    setAlertRecipients(updated);
    localStorage.setItem('cecop_alert_recipients', JSON.stringify(updated));

    setNewRecCallsign('');
    setNewRecName('');
    setNewRecFreq('144.800 MHz');

    if (showToast) showToast(`Estación de emergencia ${formatCallsign} añadida con éxito.`);
    if (playBuzzerSound) playBuzzerSound(523.25, 0.1, 'sine');
  };

  const handleToggleRecipient = (id: string) => {
    const updated = alertRecipients.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r);
    setAlertRecipients(updated);
    localStorage.setItem('cecop_alert_recipients', JSON.stringify(updated));
  };

  const handleDeleteRecipient = (id: string) => {
    const updated = alertRecipients.filter(r => r.id !== id);
    setAlertRecipients(updated);
    localStorage.setItem('cecop_alert_recipients', JSON.stringify(updated));
    if (showToast) showToast('Destinatario de alerta eliminado.');
  };

  const handleForwardEmergency = (pkt: AprsPacket) => {
    const activeRecipients = alertRecipients.filter(r => r.isActive);
    if (activeRecipients.length === 0) {
      if (showToast) showToast('No hay destinatarios de alerta configurados y activos.');
      return;
    }

    // Emit and record simulation
    activeRecipients.forEach(r => {
      const parts = pkt.packetString.split(':');
      const bodyText = parts.slice(1).join(':') || pkt.packetString;
      const forwardPktString = `${pkt.callsign}>APRS,${r.callsign},ED4YAK-1,WIDE2-1::${r.callsign.padEnd(9, ' ')}:Fwd: EMER: ${bodyText.trim()}`;
      
      setOperationalLog(prev => [
        { 
          time: new Date().toLocaleTimeString(), 
          msg: `REENVÍO DE EMERGENCIA AX.25 emitido hacia [${r.callsign}] (${r.stationName}): ${forwardPktString}`, 
          type: 'ALERT' 
        },
        ...prev
      ]);
    });

    if (playBuzzerSound) {
      playBuzzerSound(987.77, 0.15, 'sawtooth');
      setTimeout(() => playBuzzerSound(880, 0.12, 'sawtooth'), 120);
    }

    if (showToast) {
      showToast(`Alerta de Emergencia retransmitida a ${activeRecipients.length} destinatarios activos.`);
    }
  };

  // Emergency Frequencies Management (Canales de radio para tipos de alertas)
  const [emergencyFrequencies, setEmergencyFrequencies] = useState<EmergencyFrequency[]>(() => {
    const stored = localStorage.getItem('cecop_emergency_frequencies');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse emergency frequencies", e);
      }
    }
    return [
      { id: 'freq-1', channelName: 'Canal Primario S.O.S', frequency: '144.800 MHz', alertType: 'Emergencia', description: 'Canal principal Pilar S.A.T. para balizas continuas y SOS.', isActive: true },
      { id: 'freq-2', channelName: 'Coordinación REMER Segovia', frequency: '145.500 MHz', alertType: 'Mensajes', description: 'Canal vocal de emergencias y red de radioaficionados REMER.', isActive: true },
      { id: 'freq-3', channelName: 'Backbone Cruz Roja', frequency: '145.825 MHz', alertType: 'Telemetría', description: 'Frecuencia APRS de enlace de datos por órbita ISS.', isActive: false },
      { id: 'freq-4', channelName: 'Serranía Pilar Norte', frequency: '430.825 MHz', alertType: 'Boletines / Alertas', description: 'Frecuencia en banda UHF para retransmisión regional de avisos.', isActive: true },
    ];
  });

  const [newFreqChannelName, setNewFreqChannelName] = useState('');
  const [newFreqValue, setNewFreqValue] = useState('');
  const [newFreqAlertType, setNewFreqAlertType] = useState('Emergencia');
  const [newFreqDesc, setNewFreqDesc] = useState('');

  const handleAddFrequency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFreqChannelName.trim() || !newFreqValue.trim()) {
      if (showToast) showToast('Complete de forma obligatoria el nombre de canal y la frecuencia.');
      return;
    }

    const newFreq: EmergencyFrequency = {
      id: `freq-${Date.now()}`,
      channelName: newFreqChannelName.trim(),
      frequency: newFreqValue.trim(),
      alertType: newFreqAlertType,
      description: newFreqDesc.trim() || 'Canal táctico asignado.',
      isActive: true
    };

    const updated = [...emergencyFrequencies, newFreq];
    setEmergencyFrequencies(updated);
    localStorage.setItem('cecop_emergency_frequencies', JSON.stringify(updated));

    setNewFreqChannelName('');
    setNewFreqValue('');
    setNewFreqAlertType('Emergencia');
    setNewFreqDesc('');

    if (showToast) showToast(`Frecuencia asignada con éxito: ${newFreq.frequency}`);
    if (playBuzzerSound) playBuzzerSound(659.25, 0.1, 'sine');
  };

  const handleToggleFrequency = (id: string) => {
    const updated = emergencyFrequencies.map(f => f.id === id ? { ...f, isActive: !f.isActive } : f);
    setEmergencyFrequencies(updated);
    localStorage.setItem('cecop_emergency_frequencies', JSON.stringify(updated));
  };

  const handleDeleteFrequency = (id: string) => {
    const updated = emergencyFrequencies.filter(f => f.id !== id);
    setEmergencyFrequencies(updated);
    localStorage.setItem('cecop_emergency_frequencies', JSON.stringify(updated));
    if (showToast) showToast('Frecuencia de emergencia eliminada.');
  };

  // TNC Transmission Parameters for AFSK Modem optimization
  const [tncDeviation, setTncDeviation] = useState<number>(() => {
    const stored = localStorage.getItem('cecop_tnc_deviation');
    return stored ? parseFloat(stored) : 2.2;
  });

  const [tncRetryTimeout, setTncRetryTimeout] = useState<number>(() => {
    const stored = localStorage.getItem('cecop_tnc_retry_timeout');
    return stored ? parseInt(stored) : 5;
  });

  const [tncTxDelay, setTncTxDelay] = useState<number>(() => {
    const stored = localStorage.getItem('cecop_tnc_tx_delay');
    return stored ? parseInt(stored) : 300; // in milliseconds
  });

  const [tncFecEnabled, setTncFecEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('cecop_tnc_fec_enabled');
    return stored !== 'false'; // defaults to true
  });

  const [tempDeviation, setTempDeviation] = useState<number>(tncDeviation);
  const [tempRetryTimeout, setTempRetryTimeout] = useState<number>(tncRetryTimeout);
  const [tempTxDelay, setTempTxDelay] = useState<number>(tncTxDelay);
  const [tempFecEnabled, setTempFecEnabled] = useState<boolean>(tncFecEnabled);

  const handleApplyTncParams = (e: React.FormEvent) => {
    e.preventDefault();
    setTncDeviation(tempDeviation);
    setTncRetryTimeout(tempRetryTimeout);
    setTncTxDelay(tempTxDelay);
    setTncFecEnabled(tempFecEnabled);

    localStorage.setItem('cecop_tnc_deviation', tempDeviation.toString());
    localStorage.setItem('cecop_tnc_retry_timeout', tempRetryTimeout.toString());
    localStorage.setItem('cecop_tnc_tx_delay', tempTxDelay.toString());
    localStorage.setItem('cecop_tnc_fec_enabled', tempFecEnabled.toString());

    setOperationalLog(prev => [
      { 
        time: new Date().toLocaleTimeString(), 
        msg: `CALIBRACIÓN TNC APLICADA: Módem AFSK ajustado (Desviación: ${tempDeviation} kHz, RetryTimeout: ${tempRetryTimeout}s, TXDELAY: ${tempTxDelay}ms, FEC: ${tempFecEnabled ? 'ACTIVO' : 'DESACTIVADO'}). Despliegue de redundancia optimizado.`, 
        type: 'SYSTEM' 
      },
      ...prev
    ]);

    if (playBuzzerSound) {
      playBuzzerSound(783.99, 0.1, 'sine'); // G5
      setTimeout(() => playBuzzerSound(1046.50, 0.12, 'sine'), 100); // C6
    }

    if (showToast) {
      showToast('Parámetros de transmisión del Puerto TNC aplicados y calibrados con éxito.');
    }
  };

  // --- CONFIGURACIÓN DE PERFILES DE ALERTA ---
  const [alertProfiles, setAlertProfiles] = useState<AlertProfile[]>(() => {
    const stored = localStorage.getItem('cecop_alert_profiles');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse alert profiles", e);
      }
    }
    return [
      {
        id: 'prof-rojo',
        name: 'Nivel Rojo - Catástrofe Inmediata',
        severity: 'CRÍTICO',
        includeSismo: true,
        includeMeteo: true,
        includeTsunami: true,
        autoForward: true,
        deviationPreset: 4.5,
        fecPreset: true,
        targetFrequencyName: '144.800 MHz'
      },
      {
        id: 'prof-naranja',
        name: 'Nivel Naranja - Clima & Alerta Especial',
        severity: 'ALTO',
        includeSismo: false,
        includeMeteo: true,
        includeTsunami: false,
        autoForward: true,
        deviationPreset: 2.5,
        fecPreset: true,
        targetFrequencyName: '145.500 MHz'
      },
      {
        id: 'prof-verde',
        name: 'Nivel Verde - Vigilancia Operativa Base',
        severity: 'VIGILANCIA',
        includeSismo: false,
        includeMeteo: false,
        includeTsunami: false,
        autoForward: false,
        deviationPreset: 1.5,
        fecPreset: false,
        targetFrequencyName: '430.825 MHz'
      }
    ];
  });

  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    return localStorage.getItem('cecop_active_profile_id') || null;
  });

  const [newProfName, setNewProfName] = useState('');
  const [newProfSeverity, setNewProfSeverity] = useState<'CRÍTICO' | 'ALTO' | 'MEDIO' | 'VIGILANCIA'>('MEDIO');
  const [newProfSismo, setNewProfSismo] = useState(false);
  const [newProfMeteo, setNewProfMeteo] = useState(false);
  const [newProfTsunami, setNewProfTsunami] = useState(false);
  const [newProfAutoForward, setNewProfAutoForward] = useState(false);
  const [newProfDeviation, setNewProfDeviation] = useState(2.2);
  const [newProfFec, setNewProfFec] = useState(true);
  const [newProfFreqName, setNewProfFreqName] = useState('144.800 MHz');

  const handleApplyProfile = (profile: AlertProfile) => {
    setActiveProfileId(profile.id);
    localStorage.setItem('cecop_active_profile_id', profile.id);

    // Apply TNC deviation parameters
    setTncDeviation(profile.deviationPreset);
    setTempDeviation(profile.deviationPreset);
    localStorage.setItem('cecop_tnc_deviation', profile.deviationPreset.toString());

    // Apply TNC FEC parameters
    setTncFecEnabled(profile.fecPreset);
    setTempFecEnabled(profile.fecPreset);
    localStorage.setItem('cecop_tnc_fec_enabled', profile.fecPreset.toString());

    // Activate the matched radio frequency in the plan (if matches by name or frequency label)
    const updatedFreqs = emergencyFrequencies.map(freq => {
      const freqContent = `${freq.channelName} ${freq.frequency}`.toLowerCase();
      const targetLower = profile.targetFrequencyName.toLowerCase();
      const isMatch = freqContent.includes(targetLower) || targetLower.includes(freq.frequency.toLowerCase());
      return {
        ...freq,
        isActive: isMatch ? true : freq.isActive
      };
    });
    setEmergencyFrequencies(updatedFreqs);
    localStorage.setItem('cecop_emergency_frequencies', JSON.stringify(updatedFreqs));

    // Also adjust global situation code according to severity
    let situationLevel: 0 | 1 | 2 | 3 = 0;
    if (profile.severity === 'CRÍTICO') situationLevel = 3;
    else if (profile.severity === 'ALTO') situationLevel = 2;
    else if (profile.severity === 'MEDIO') situationLevel = 1;
    setCecopSituacion(situationLevel);

    // Log the event
    setOperationalLog(prev => [
      {
        time: new Date().toLocaleTimeString(),
        msg: `PERFIL DE ALERTA ACTIVADO [${profile.name}]: Protocolo de emisión reconfigurado automáticamente. Severidad: ${profile.severity}. Canales asociados: ${profile.targetFrequencyName}. Módem calibrado a ${profile.deviationPreset} kHz con FEC: ${profile.fecPreset ? 'SI' : 'NO'}.`,
        type: 'ALERT'
      },
      ...prev
    ]);

    if (playBuzzerSound) {
      playBuzzerSound(587.33, 0.1, 'sine'); // D5
      setTimeout(() => playBuzzerSound(659.25, 0.1, 'sine'), 100); // E5
      setTimeout(() => playBuzzerSound(880.00, 0.2, 'sine'), 200); // A5
    }

    if (showToast) {
      showToast(`Perfil de Alerta '${profile.name}' aplicado. Configuración de emisión acoplada.`);
    }
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfName.trim()) {
      if (showToast) showToast('Especifique un nombre de perfil descriptivo.');
      return;
    }

    const newProf: AlertProfile = {
      id: `prof-${Date.now()}`,
      name: newProfName.trim(),
      severity: newProfSeverity,
      includeSismo: newProfSismo,
      includeMeteo: newProfMeteo,
      includeTsunami: newProfTsunami,
      autoForward: newProfAutoForward,
      deviationPreset: parseFloat(newProfDeviation.toString()) || 2.2,
      fecPreset: newProfFec,
      targetFrequencyName: newProfFreqName
    };

    const updated = [...alertProfiles, newProf];
    setAlertProfiles(updated);
    localStorage.setItem('cecop_alert_profiles', JSON.stringify(updated));

    // Reset inputs
    setNewProfName('');
    setNewProfSeverity('MEDIO');
    setNewProfSismo(false);
    setNewProfMeteo(false);
    setNewProfTsunami(false);
    setNewProfAutoForward(false);
    setNewProfDeviation(2.2);
    setNewProfFec(true);

    if (showToast) showToast(`Perfil de configuración guardado: ${newProf.name}`);
    if (playBuzzerSound) playBuzzerSound(523.25, 0.15, 'sine');
  };

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = alertProfiles.filter(p => p.id !== id);
    setAlertProfiles(updated);
    localStorage.setItem('cecop_alert_profiles', JSON.stringify(updated));
    if (activeProfileId === id) {
      setActiveProfileId(null);
      localStorage.removeItem('cecop_active_profile_id');
    }
    if (showToast) showToast('Perfil de alerta de baja de base de datos.');
  };

  const handleDeactivateProfile = () => {
    setActiveProfileId(null);
    localStorage.removeItem('cecop_active_profile_id');
    if (showToast) showToast('Perfil de Alerta desactivado. Modulación y protocolos en modo manual.');
  };

  // Simular actividad de canal en tiempo real mediante el TNC para frecuencias activas
  const [channelActivity, setChannelActivity] = useState<Record<string, 'IDLE' | 'RX' | 'TX'>>({});

  useEffect(() => {
    const updateActivity = () => {
      const newActivity: Record<string, 'IDLE' | 'RX' | 'TX'> = {};
      emergencyFrequencies.forEach(freq => {
        if (!freq.isActive) {
          newActivity[freq.id] = 'IDLE';
        } else {
          // Si está activa, asignar aleatoriamente IDLE, RX o TX con pesos
          // por ejemplo, 50% IDLE, 35% RX (recibiendo señales o balizas APRS), 15% TX (transmisión local)
          const rand = Math.random();
          if (rand < 0.5) {
            newActivity[freq.id] = 'IDLE';
          } else if (rand < 0.85) {
            newActivity[freq.id] = 'RX';
          } else {
            newActivity[freq.id] = 'TX';
          }
        }
      });
      setChannelActivity(newActivity);
    };

    updateActivity();
    const interval = setInterval(updateActivity, 2500);
    return () => clearInterval(interval);
  }, [emergencyFrequencies]);

  // 1. DYNAMIC FEED TO INCIDENTS RECONCILIATION
  // Recompile and transform Pilar I raw feeds into CECOP high-fidelity incident objects
  const [customIncidents, setCustomIncidents] = useState<IncidentState[]>([]);

  // -------------------------------------------------------------
  // RECENT EMERGENCY LOGS PERSISTENCE & POST-INCIDENT AUDITING
  // -------------------------------------------------------------
  const [recentEmergencies, setRecentEmergencies] = useState<any[]>(() => {
    const stored = localStorage.getItem('cecop_recent_emergencies');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [emergencyFilterType, setEmergencyFilterType] = useState<string>('All');
  const [emergencyFilterSeverity, setEmergencyFilterSeverity] = useState<string>('All');
  const [emergencyFilterStatus, setEmergencyFilterStatus] = useState<string>('All');
  const [emergencySearchQuery, setEmergencySearchQuery] = useState<string>('');
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotesValue, setTempNotesValue] = useState<string>('');
  const [showManualForm, setShowManualForm] = useState<boolean>(false);

  // Manual Form State
  const [manualTitle, setManualTitle] = useState<string>('');
  const [manualType, setManualType] = useState<'Sísmica' | 'Radiológica' | 'Meteorológica' | 'ICA' | 'Incendios'>('Sísmica');
  const [manualDescription, setManualDescription] = useState<string>('');
  const [manualSeverity, setManualSeverity] = useState<'Crítica' | 'Alta' | 'Moderada'>('Moderada');
  const [manualStatus, setManualStatus] = useState<'Activa' | 'Controlada'>('Activa');
  const [manualNotes, setManualNotes] = useState<string>('');

  // Persist logs in localStorage
  useEffect(() => {
    localStorage.setItem('cecop_recent_emergencies', JSON.stringify(recentEmergencies));
  }, [recentEmergencies]);

  const seenEmergencyIds = useRef<Set<string>>(new Set());

  // Initialize seen emergency IDs on first load to prevent duplicate retro-notifications
  useEffect(() => {
    if (recentEmergencies) {
      recentEmergencies.forEach(item => {
        seenEmergencyIds.current.add(item.id);
      });
    }
  }, []);

  // Listen for brand new incoming recent emergencies and trigger browser push alerts if matched with selected preferences
  useEffect(() => {
    if (!recentEmergencies) return;

    recentEmergencies.forEach(item => {
      if (!seenEmergencyIds.current.has(item.id)) {
        seenEmergencyIds.current.add(item.id);

        const isTypeEnabled = notifTypes[item.type] !== false;
        const isPushPermitted = 'Notification' in window && Notification.permission === 'granted';

        if (isTypeEnabled && isPushPermitted && notificationsEnabled !== 'disabled') {
          // Verify detailed magnitude/severity thresholds
          let passesThresholds = true;

          if (item.type === 'Sísmica') {
            const match = item.title.match(/M\s*([\d.]+)/);
            const mag = match ? parseFloat(match[1]) : 0;
            if (mag > 0 && mag < eqMinMagnitude) {
              passesThresholds = false;
            }
          } else if (item.type === 'Meteorológica') {
            const severityMap: Record<string, number> = { 'Moderada': 1, 'Alta': 2, 'Crítica': 3 };
            const itemSeverityVal = severityMap[item.severity] || 1;
            const thresholdSeverityVal = severityMap[wxMinSeverity] || 2;
            if (itemSeverityVal < thresholdSeverityVal) {
              passesThresholds = false;
            }
          }

          if (passesThresholds) {
            const title = `⚠️ ALERTA CECOP: ${item.type}`;
            try {
              new Notification(title, {
                body: `${item.title}\n${item.description}`,
                tag: item.id,
                requireInteraction: item.severity === 'Crítica' || item.severity === 'Alta'
              });
            } catch (e) {
              console.error("Browser push notification failed to launch:", e);
            }
          }
        }
      }
    });
  }, [recentEmergencies, notifTypes, notificationsEnabled, eqMinMagnitude, wxMinSeverity]);

  // Automatic verification scanning effect
  useEffect(() => {
    let updated = false;
    const newItems = [...recentEmergencies];

    // 1. Earthquakes
    if (earthquakes && earthquakes.length > 0) {
      earthquakes.forEach(eq => {
        if (eq.magnitud >= 3.5) {
          const id = `eq-${eq.id}`;
          if (!newItems.some(item => item.id === id)) {
            newItems.unshift({
              id,
              timestamp: new Date(eq.time || Date.now()).toLocaleString('es-ES'),
              type: 'Sísmica',
              title: `Seísmo M ${eq.magnitud.toFixed(1)} - ${eq.localizacion}`,
              description: `Terremoto detectado de magnitud ${eq.magnitud.toFixed(1)} con foco localizado en ${eq.localizacion}. Profundidad: ${eq.depthKm} km. Distancia al CECOP: ${eq.distanciaKm.toFixed(1)} km.`,
              severity: eq.magnitud >= 5.0 ? 'Crítica' : (eq.magnitud >= 4.0 ? 'Alta' : 'Moderada'),
              status: 'Activa',
              notes: 'Detección telemática e informe sismológico del Instituto Geográfico Nacional.'
            });
            updated = true;
          }
        }
      });
    }

    // 2. Radiological Stations
    if (csnStations && csnStations.length > 0) {
      csnStations.forEach(st => {
        if (st.baseVal > 115) {
          const id = `rad-${st.id}`;
          if (!newItems.some(item => item.id === id)) {
            newItems.unshift({
              id,
              timestamp: new Date().toLocaleString('es-ES'),
              type: 'Radiológica',
              title: `Anomalía Radiológica: Estación ${st.name}`,
              description: `Medida de radiación ambiental elevada de ${st.baseVal.toFixed(1)} nSv/h detectada en provincia de ${st.provincia}.`,
              severity: st.baseVal > 150 ? 'Crítica' : 'Alta',
              status: 'Activa',
              notes: 'Niveles que superan el fondo natural habitual. Reporte capturado de la red REA del CSN.'
            });
            updated = true;
          }
        }
      });
    }

    // 3. Extreme Weather
    if (weather) {
      const isExtremeWind = weather.windSpeedKts > 25 || (weather.gustKts && weather.gustKts > 35);
      const isExtremeTemp = weather.tempC > 38 || weather.tempC < 0;
      const isExtremeRain = weather.rain1hIn > 0.4 || weather.rain24hIn > 1.5;

      if (isExtremeWind || isExtremeTemp || isExtremeRain) {
        const id = `wx-${weather.time ? weather.time.replace(/\s+/g, '') : Date.now()}`;
        if (!newItems.some(item => item.id === id)) {
          let conditions = [];
          if (isExtremeWind) conditions.push(`viento racheado de ${weather.gustKts || weather.windSpeedKts} kts`);
          if (isExtremeTemp) conditions.push(`temperatura extrema de ${weather.tempC}°C`);
          if (isExtremeRain) conditions.push(`precipitación de ${weather.rain1hIn || weather.rain24hIn} in/h`);

          newItems.unshift({
            id,
            timestamp: new Date().toLocaleString('es-ES'),
            type: 'Meteorológica',
            title: `Alerta Climatológica: Condiciones Extremas`,
            description: `Valores críticos registrados en el sensor meteorológico local: ${conditions.join(', ')}.`,
            severity: (weather.gustKts && weather.gustKts > 45) || weather.tempC > 42 ? 'Crítica' : 'Alta',
            status: 'Activa',
            notes: 'Alerta meteorológica en tiempo real emitida para activación preventiva de telecomunicaciones.'
          });
          updated = true;
        }
      }
    }

    // 4. Air Quality Index (ICA)
    if (iqair && iqair.aqi > 100) {
      const id = `ica-${iqair.city || 'local'}-${iqair.aqi}`;
      if (!newItems.some(item => item.id === id)) {
        newItems.unshift({
          id,
          timestamp: new Date().toLocaleString('es-ES'),
          type: 'ICA',
          title: `Calidad del Aire Insalubre (AQI ${iqair.aqi}) - ${iqair.city || 'Zorita'}`,
          description: `Alerta sanitaria por contaminación del aire. Nivel de AQI: ${iqair.aqi}. Contaminante principal: ${iqair.mainPollutant || 'PM2.5'}.`,
          severity: iqair.aqi > 150 ? 'Crítica' : 'Alta',
          status: 'Activa',
          notes: 'Monitoreo de contaminantes atmosféricos de partículas en suspensión en el área de influencia civil.'
        });
        updated = true;
      }
    }

    // 5. Incendios / Custom fires from customIncidents
    if (customIncidents && customIncidents.length > 0) {
      customIncidents.forEach(inc => {
        if (inc.category === 'INCENDIO') {
          const id = `cust-fire-${inc.id}`;
          if (!newItems.some(item => item.id === id)) {
            newItems.unshift({
              id,
              timestamp: new Date().toLocaleString('es-ES'),
              type: 'Incendios',
              title: `Incendio Forestal: ${inc.title}`,
              description: inc.details || 'Foco térmico activo y detectado por brigadas forestales de emergencias.',
              severity: 'Alta',
              status: 'Activa',
              notes: 'Control y triage de incendios activos verificado telemáticamente.'
            });
            updated = true;
          }
        }
      });
    }

    if (updated) {
      setRecentEmergencies(newItems);
    }
  }, [earthquakes, csnStations, weather, iqair, customIncidents]);

  // Fetch real satellite hotspots for active fire detection
  useEffect(() => {
    const fetchFiresLog = async () => {
      try {
        const res = await customFetch('/api/wildfires/latest');
        if (res.ok) {
          const data = await res.json();
          if (data.hotspots && data.hotspots.length > 0) {
            const highFRP = data.hotspots.filter((h: any) => h.frpMw >= 80);
            if (highFRP.length > 0) {
              setRecentEmergencies(prev => {
                const newItems = [...prev];
                let updated = false;
                highFRP.forEach((f: any) => {
                  const id = `sat-fire-${f.id || `${f.lat.toFixed(3)}-${f.lon.toFixed(3)}`}`;
                  if (!newItems.some(item => item.id === id)) {
                    newItems.unshift({
                      id,
                      timestamp: new Date().toLocaleString('es-ES'),
                      type: 'Incendios',
                      title: `Foco Ígneo Satelital (${f.frpMw.toFixed(0)} MW) - ${f.region || 'España'}`,
                      description: `Teledetección satelital de foco de calor extremo con potencia FRP de ${f.frpMw.toFixed(1)} MW. Coordenadas: [${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}]. Satélite: ${f.satellite || 'NASA VIIRS'}.`,
                      severity: f.frpMw > 150 ? 'Crítica' : 'Alta',
                      status: 'Activa',
                      notes: 'Alerta térmica satelital automática integrada por el sistema de monitoreo espacial Copernicus / NASA FIRMS.'
                    });
                    updated = true;
                  }
                });
                return updated ? newItems : prev;
              });
            }
          }
        }
      } catch (e) {
        console.error("Error fetching fires for persistent log:", e);
      }
    };

    fetchFiresLog();
    const interval = setInterval(fetchFiresLog, 5000);
    return () => clearInterval(interval);
  }, []);

  // Note editing helpers
  const handleStartEditingNotes = (id: string, currentNotes: string) => {
    setEditingNotesId(id);
    setTempNotesValue(currentNotes);
  };

  const handleSaveNotes = (id: string) => {
    setRecentEmergencies(prev => 
      prev.map(item => item.id === id ? { ...item, notes: tempNotesValue } : item)
    );
    setEditingNotesId(null);
    if (showToast) showToast('Notas de auditoría actualizadas correctamente.');
  };

  // Toggle status helper
  const handleToggleStatus = (id: string) => {
    setRecentEmergencies(prev => 
      prev.map(item => {
        if (item.id === id) {
          const nextStatus = item.status === 'Activa' ? 'Controlada' : 'Activa';
          if (showToast) showToast(`Emergencia marcada como ${nextStatus}`);
          return { ...item, status: nextStatus };
        }
        return item;
      })
    );
  };

  // Delete log item
  const handleDeleteLogItem = (id: string) => {
    setRecentEmergencies(prev => prev.filter(item => item.id !== id));
    if (showToast) showToast('Registro eliminado del histórico.');
  };

  // Clear all logs
  const handleClearAllLogs = () => {
    if (window.confirm('¿Está seguro de borrar todo el histórico de emergencias persistente? Esta acción no se puede deshacer.')) {
      setRecentEmergencies([]);
      if (showToast) showToast('Histórico de emergencias borrado por completo.');
    }
  };

  // Export to JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(recentEmergencies, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `auditoria_emergencias_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    if (showToast) showToast('Archivo JSON exportado con éxito.');
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Tipo', 'Título', 'Descripción', 'Gravedad', 'Estado', 'Notas de Auditoría'];
    const rows = recentEmergencies.map(item => [
      item.id,
      item.timestamp,
      item.type,
      `"${item.title.replace(/"/g, '""')}"`,
      `"${item.description.replace(/"/g, '""')}"`,
      item.severity,
      item.status,
      `"${item.notes.replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", encodeURI(csvContent));
    downloadAnchor.setAttribute("download", `auditoria_emergencias_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    if (showToast) showToast('Archivo CSV exportado con éxito.');
  };

  // Add Manual Emergency Log Item
  const handleAddManualEmergency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualDescription.trim()) {
      if (showToast) showToast('Por favor, rellene los campos obligatorios del reporte.');
      return;
    }

    const newLog = {
      id: `manual-${Date.now()}`,
      timestamp: new Date().toLocaleString('es-ES'),
      type: manualType,
      title: manualTitle.trim(),
      description: manualDescription.trim(),
      severity: manualSeverity,
      status: manualStatus,
      notes: manualNotes.trim() || 'Reportado manualmente por el operador de guardia.',
      isManual: true
    };

    setRecentEmergencies(prev => [newLog, ...prev]);
    setShowManualForm(false);
    
    // Clear Form fields
    setManualTitle('');
    setManualDescription('');
    setManualNotes('');
    setManualSeverity('Moderada');
    setManualStatus('Activa');

    if (showToast) showToast('Emergencia registrada manualmente en el registro persistente.');
  };

  // Filtered emergency log list for rendering and export
  const filteredEmergencies = useMemo(() => {
    return recentEmergencies.filter(item => {
      // Search text filter
      if (emergencySearchQuery.trim()) {
        const query = emergencySearchQuery.toLowerCase();
        const matchesQuery = item.title.toLowerCase().includes(query) || 
                             item.description.toLowerCase().includes(query) || 
                             (item.notes && item.notes.toLowerCase().includes(query)) ||
                             item.id.toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }
      // Type/Category filter
      if (emergencyFilterType !== 'All' && item.type !== emergencyFilterType) {
        return false;
      }
      // Severity filter
      if (emergencyFilterSeverity !== 'All' && item.severity !== emergencyFilterSeverity) {
        return false;
      }
      // Status filter
      if (emergencyFilterStatus !== 'All' && item.status !== emergencyFilterStatus) {
        return false;
      }
      return true;
    });
  }, [recentEmergencies, emergencyFilterType, emergencyFilterSeverity, emergencyFilterStatus, emergencySearchQuery]);

  // Derived built-in incidents from real data + local custom modifications
  const consolidatedIncidents = useMemo<IncidentState[]>(() => {
    const list: IncidentState[] = [];

    // Map Earthquakes
    earthquakes.forEach((eq) => {
      // Check if already in custom incident edits
      const custom = customIncidents.find(c => c.id === eq.id);
      if (custom) {
        list.push(custom);
      } else {
        const isSevere = eq.magnitud >= 4.0;
        list.push({
          id: eq.id,
          source: 'IGN',
          category: 'SISMICIDAD',
          title: `Terremoto: M ${eq.magnitud.toFixed(1)} - ${eq.localizacion}`,
          details: `Magnitud: ${eq.magnitud} ${eq.magType}. Profundidad: ${eq.depthKm} km. Localización IGN: ${eq.localizacion}. Distancia: ${eq.distanciaKm.toFixed(1)} km.`,
          value: `M ${eq.magnitud}`,
          timestamp: eq.time,
          latitude: eq.latitude,
          longitude: eq.longitude,
          confidence: isSevere ? 95 : 85,
          validation: 'PRE-VERIFICADO',
          operationalLevel: isSevere ? 1 : 0,
          affectedPopRange: isSevere ? 'MEDIO' : 'BAJO',
          notes: ['Sismógrafo IGN detectó pico de aceleración de suelo. Baliza APRS generada.']
        });
      }
    });

    // Map Radiation anomalies (CSN Stations with values > baseVal + 30)
    csnStations.forEach((st) => {
      const custom = customIncidents.find(c => c.id === st.id);
      if (custom) {
        list.push(custom);
      } else {
        const realReading = st.baseVal + (Math.random() * 5 - 2.5); // Simulated live value around baseVal
        const isHazard = realReading > 115; // Threshold check
        list.push({
          id: st.id,
          source: 'CSN',
          category: 'RADIACTIVIDAD',
          title: `Monitoreo Radiológico: Nodo CSN ${st.name}`,
          details: `Estación REA provincia de ${st.provincia || 'N/A'}. Coordenadas: [${st.lat.toFixed(4)}, ${st.lon.toFixed(4)}]. Tipo: ${st.tipo || 'REA'}.`,
          value: `${realReading.toFixed(2)} nSv/h`,
          timestamp: new Date().toLocaleTimeString(),
          latitude: st.lat,
          longitude: st.lon,
          confidence: 90,
          validation: isHazard ? 'PRE-VERIFICADO' : 'PRE-VERIFICADO',
          operationalLevel: isHazard ? 1 : 0,
          affectedPopRange: isHazard ? 'ALTO' : 'BAJO',
          notes: ['Estación notificando por protocolo UDP redundante del Consejo de Seguridad Nuclear.']
        });
      }
    });

    // Map DGT Incidents
    dgtIncidents.forEach((inc) => {
      const custom = customIncidents.find(c => c.id === inc.id);
      if (custom) {
        list.push(custom);
      } else {
        const isNegro = inc.nivel === 'NEGRO';
        const isRojo = inc.nivel === 'ROJO';
        list.push({
          id: inc.id,
          source: 'DGT',
          category: 'VIAL',
          title: `Incidencia de Tránsito DGT: ${inc.carretera} (${inc.provincia})`,
          details: `${inc.descripcion}. Localización: ${inc.poblacion}. Causa: ${inc.causa || 'Obstrucción'}. Sentido: ${inc.sentido || 'Ambos'}.`,
          value: `Nivel ${inc.nivel}`,
          timestamp: inc.fecha,
          latitude: inc.latitud,
          longitude: inc.longitud,
          confidence: 95,
          validation: 'PRE-VERIFICADO',
          operationalLevel: isNegro ? 2 : (isRojo ? 1 : 0),
          affectedPopRange: isNegro || isRojo ? 'ALTO' : 'BAJO',
          notes: ['Reporte telemático capturado desde Centro de Gestión de Tránsito DGT.']
        });
      }
    });

    // Map custom drills and active manual alerts
    customIncidents.forEach((cust) => {
      if (!list.some(x => x.id === cust.id)) {
        list.push(cust);
      }
    });

    return list;
  }, [earthquakes, csnStations, dgtIncidents, customIncidents]);

  // Eco-Transmit Mode & Beacon Intervals
  const [ecoTransmitMode, setEcoTransmitMode] = useState<boolean>(() => {
    return localStorage.getItem('cecop_eco_transmit_mode') === 'true';
  });

  const isLowActivity = consolidatedIncidents.length === 0;

  const currentBeaconInterval = useMemo(() => {
    if (ecoTransmitMode && isLowActivity) {
      return 120; // 120s in ECO mode with low activity
    }
    return 30; // 30s standard
  }, [ecoTransmitMode, isLowActivity]);

  const [secondsToNextBeacon, setSecondsToNextBeacon] = useState<number>(currentBeaconInterval);
  const [lastBeaconTime, setLastBeaconTime] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsToNextBeacon(prev => {
        if (prev <= 1) {
          const timeStr = new Date().toLocaleTimeString();
          setOperationalLog(old => [
            {
              time: timeStr,
              msg: `EMISIÓN AUTOMÁTICA APRS TNC: Baliza telemática de estado del CECOP radiodifundida. Modo de energía: ${ecoTransmitMode ? 'ECO-POTENCIA' : 'ESTÁNDAR'}. Intervalo aplicado: ${currentBeaconInterval} segundos (Actividad: ${isLowActivity ? 'Baja' : 'Alta/Incidentes'}).`,
              type: 'SAT'
            },
            ...old
          ]);
          setLastBeaconTime(timeStr);

          if (playBuzzerSound) {
            playBuzzerSound(880, 0.05, 'triangle');
          }

          return currentBeaconInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentBeaconInterval, ecoTransmitMode, isLowActivity, playBuzzerSound]);

  useEffect(() => {
    setSecondsToNextBeacon(currentBeaconInterval);
  }, [currentBeaconInterval]);

  // Función para purgar paquetes obsoletos o caducados de la cola pendiente
  const handlePurgeQueue = () => {
    if (!setAprsPackets) return;

    const now = new Date();
    const purged = aprsPackets.filter(pkt => {
      // Mantener todos los paquetes que no estén pendientes
      if (pkt.status !== 'PENDIENTE') {
        return true;
      }

      // No purgar nunca paquetes críticos de emergencia/SOS
      if (pkt.isEmergency) {
        return true;
      }

      // Intentar procesar la marca de tiempo para saber su antigüedad
      let ageInSeconds = 999; 
      try {
        if (pkt.timestamp.includes('T') || pkt.timestamp.includes('-')) {
          const d = new Date(pkt.timestamp);
          if (!isNaN(d.getTime())) {
            ageInSeconds = (now.getTime() - d.getTime()) / 1000;
          }
        } else {
          // Asumir que es solo tiempo e.g. "14:35:22"
          const parsedDate = new Date();
          const cleanTime = pkt.timestamp.replace(/(AM|PM)/i, '').trim();
          const parts = cleanTime.split(':').map(Number);
          if (parts.length >= 2 && !parts.some(isNaN)) {
            let hours = parts[0];
            const minutes = parts[1];
            const seconds = parts[2] || 0;
            
            if (pkt.timestamp.toLowerCase().includes('pm') && hours < 12) {
              hours += 12;
            } else if (pkt.timestamp.toLowerCase().includes('am') && hours === 12) {
              hours = 0;
            }
            
            parsedDate.setHours(hours, minutes, seconds, 0);
            
            if (parsedDate.getTime() > now.getTime()) {
              parsedDate.setDate(parsedDate.getDate() - 1);
            }
            
            ageInSeconds = (now.getTime() - parsedDate.getTime()) / 1000;
          }
        }
      } catch (e) {
        console.error("Error parsing packet timestamp:", e);
      }

      // Se consideran caducados si llevan más de 30 segundos en cola
      const isExpired = ageInSeconds > 30;
      return !isExpired;
    });

    const totalPurged = aprsPackets.length - purged.length;

    if (totalPurged > 0) {
      setAprsPackets(purged);
      localStorage.setItem('sat_aprs_packets', JSON.stringify(purged));

      setOperationalLog(prev => [
        {
          time: new Date().toLocaleTimeString(),
          msg: `DEPURACIÓN DE COLA APRS: Se eliminaron automáticamente ${totalPurged} tramas pendientes caducadas (>30s) para limpiar la carga de trabajo.`,
          type: 'SYS'
        },
        ...prev
      ]);

      if (playBuzzerSound) {
        playBuzzerSound(440, 0.25, 'sine');
      }
      if (showToast) {
        showToast(`Se han purgado ${totalPurged} paquetes obsoletos de la cola de firma.`);
      }
    } else {
      if (showToast) {
        showToast('No se encontraron paquetes pendientes de baja prioridad caducados (>30s) para purgar.');
      }
    }
  };

  // Operational units dispatched from CECOP
  const [units, setUnits] = useState<OperationalUnit[]>([
    { id: 'u1', name: 'Protección Civil - Intervención Rápida', type: 'PROTECCION_CIVIL', callsign: 'ADRA-101', status: 'DISPONIBLE', location: 'Base Central CECOP' },
    { id: 'u2', name: 'Bomberos Comunidad de Madrid - Urbano 4', type: 'BOMBEROS', callsign: 'B-M440', status: 'DISPONIBLE', location: 'Estación de Bomberos Sector 2' },
    { id: 'u3', name: 'UME BIEM I - Módulo de Rescate Pesado', type: 'UME', callsign: 'UME-BIEM1', status: 'STANDBY', location: 'Base Aérea de Torrejón' },
    { id: 'u4', name: 'Servicio Sanitario de Urgencia (SAMUR)', type: 'SANITARIO', callsign: 'SAMUR-Delta4', status: 'DISPONIBLE', location: 'Base Logística Norte' },
    { id: 'u5', name: 'Red Radio de Emergencias (REMER)', type: 'REMER', callsign: 'EA-REMER-3', status: 'STANDBY', location: 'Banda VHF/UHF Local RACES' },
    { id: 'u6', name: 'Policía Local / Control Vial Tránsito', type: 'POLICIA', callsign: 'P-L77', status: 'DISPONIBLE', location: 'Unidad Móvil de Guardia' },
  ]);

  // Preselected Drill scenarios for Protection Civil Master simulation
  const handleTriggerDrill = (drillType: 'TERREMOTO' | 'INCENDIO' | 'RADIO' | 'INUNDACION') => {
    if (playBuzzerSound) playBuzzerSound(1100, 0.4, 'sawtooth');
    
    let drillIncident: IncidentState;
    const drillId = 'drill-' + Date.now();

    if (drillType === 'TERREMOTO') {
      drillIncident = {
        id: drillId,
        source: 'SIMULACRO',
        category: 'SISMICIDAD',
        title: 'SIMULACRO: Seísmo Terremoto Cabo de Gata M 6.1 (Tsunami Potencial)',
        details: 'Simulación de seísmo cortical de falla activa con potencial de inducción de tsunami local en costa de Almería. Afectación estimada a 12 puertos próximos.',
        value: 'M 6.1',
        timestamp: new Date().toLocaleTimeString(),
        latitude: 36.7201,
        longitude: -2.2039,
        confidence: 100,
        validation: 'CONFIRMADO',
        operationalLevel: 2,
        affectedPopRange: 'CRÍTICO',
        notes: ['SIMULACRO ACTIVADO. Plan PEM en Situación 2. Alerta local a boyas ERDDAP.']
      };
      setCecopSituacion(2);
      // Dispatch UME and REMER automatically for high-triage drill
      setUnits(prev => prev.map(u => 
        (u.type === 'UME' || u.type === 'REMER' || u.type === 'BOMBEROS') 
          ? { ...u, status: 'MOVILIZADO', location: 'Cabo de Gata - Zona Cero' }
          : u
      ));
    } else if (drillType === 'INCENDIO') {
      drillIncident = {
        id: drillId,
        source: 'SIMULACRO',
        category: 'INCENDIO',
        title: 'SIMULACRO: Incendio Forestal Gran Escala Corona Forestal Teide',
        details: 'Simulación de pluma térmica de avance rápido hacia zonas de interfaz urbano-forestal. Viento de componente noreste estimado a 25 kts.',
        value: 'FWI 64 Extremo',
        timestamp: new Date().toLocaleTimeString(),
        latitude: 28.2916,
        longitude: -16.6291,
        confidence: 100,
        validation: 'CONFIRMADO',
        operationalLevel: 2,
        affectedPopRange: 'ALTO',
        notes: ['SIMULACRO ACTIVADO. Helicópteros contra incendios y Bomberos movilizados en sector oeste.']
      };
      setCecopSituacion(2);
      setUnits(prev => prev.map(u => 
        (u.type === 'BOMBEROS' || u.type === 'PROTECCION_CIVIL') 
          ? { ...u, status: 'MOVILIZADO', location: 'Sector Norte Corona Forestal' }
          : u
      ));
    } else if (drillType === 'RADIO') {
      drillIncident = {
        id: drillId,
        source: 'SIMULACRO',
        category: 'RADIACTIVIDAD',
        title: 'SIMULACRO: Descarga Radiológica No Programada REA',
        details: 'Alarma de nivel de fondo gamma ambiental superando 1250 nSv/h en perímetro de zona de exclusión radiológica.',
        value: '1250 nSv/h',
        timestamp: new Date().toLocaleTimeString(),
        latitude: 39.7818,
        longitude: -5.6983,
        confidence: 100,
        validation: 'CONFIRMADO',
        operationalLevel: 3,
        affectedPopRange: 'CRÍTICO',
        notes: ['SIMULACRO ACTIVADO. Confinamiento de población civil. Entrega ficticia de yoduro de potasio.']
      };
      setCecopSituacion(3);
      setUnits(prev => prev.map(u => 
        u.type === 'UME' 
          ? { ...u, status: 'EN_ESCENA', location: 'Central Nuclear Almaraz' }
          : u
      ));
    } else {
      drillIncident = {
        id: drillId,
        source: 'SIMULACRO',
        category: 'METEOROLOGÍA',
        title: 'SIMULACRO: Inundación Rápida Cuenca del Ebro (Doble Cero)',
        details: 'Boletín hidrológico estima caudal de crecida en sección urbana superando el límite histórico. Desbordamientos registrados.',
        value: 'Q > 2400 m³/s',
        timestamp: new Date().toLocaleTimeString(),
        latitude: 41.6488,
        longitude: -0.8891,
        confidence: 100,
        validation: 'CONFIRMADO',
        operationalLevel: 2,
        affectedPopRange: 'ALTO',
        notes: ['SIMULACRO ACTIVADO. Cortes de vía de emergencia informados a la DGT.']
      };
      setCecopSituacion(2);
      setUnits(prev => prev.map(u => 
        u.type === 'POLICIA' || u.type === 'PROTECCION_CIVIL'
          ? { ...u, status: 'MOVILIZADO', location: 'Riberas del Ebro - Sector Urbano' }
          : u
      ));
    }

    setCustomIncidents(prev => [drillIncident, ...prev]);
    setSelectedIncidentId(drillId);
    
    // Log in operational actions
    const logMsg = `Simulacro [${drillType}] inyectado. Iniciada secuencia automática de verificación y activación de Planes de Protección Civil correspondientes.`;
    setOperationalLog(prev => [
      { time: new Date().toLocaleTimeString(), msg: logMsg, type: 'ALERT' },
      ...prev
    ]);
    if (showToast) showToast(`Simulacro de ${drillType} Activado en CECOP`);
  };

  const handleResetSimulations = () => {
    setCustomIncidents([]);
    setCecopSituacion(0);
    setSelectedIncidentId(null);
    setUnits(prev => prev.map(u => ({ ...u, status: 'DISPONIBLE', location: 'Base de Guardia' })));
    setOperationalLog(prev => [
      { time: new Date().toLocaleTimeString(), msg: 'Simulaciones y modificaciones revocadas. Retorno a estado operativo en vivo.', type: 'SYS' },
      ...prev
    ]);
    if (showToast) showToast('Restaurado estado en vivo de Protección Civil');
  };

  const selectedIncident = useMemo(() => {
    return consolidatedIncidents.find(i => i.id === selectedIncidentId) || consolidatedIncidents[0] || null;
  }, [consolidatedIncidents, selectedIncidentId]);

  // Handle single incident modification / verification triage inputs
  const handleModifyIncidentValidation = (newStatus: IncidentState['validation']) => {
    if (!selectedIncident) return;
    const updated: IncidentState = {
      ...selectedIncident,
      validation: newStatus,
      // If falsa alarma, clear operational level to 0
      operationalLevel: newStatus === 'FALSA-ALARMA' ? 0 : selectedIncident.operationalLevel
    };

    setCustomIncidents(prev => {
      const filtered = prev.filter(p => p.id !== selectedIncident.id);
      return [updated, ...filtered];
    });

    const lMsg = `Incidente ${selectedIncident.title.slice(0, 30)}... clasificado manualmente como [${newStatus}].`;
    setOperationalLog(prev => [
      { time: new Date().toLocaleTimeString(), msg: lMsg, type: 'TRIAGE' },
      ...prev
    ]);
    
    if (showToast) showToast(`Incidente marcado como ${newStatus}`);
  };

  const handleModifyOperationalLevel = (level: 0 | 1 | 2 | 3) => {
    if (!selectedIncident) return;
    const updated: IncidentState = {
      ...selectedIncident,
      operationalLevel: level
    };

    setCustomIncidents(prev => {
      const filtered = prev.filter(p => p.id !== selectedIncident.id);
      return [updated, ...filtered];
    });

    // Update main CECOP level to match max of current incident
    setCecopSituacion(level);

    const lMsg = `Riesgo de emergencia reevaluado. Nivel de emergencia asignado: Situación ${level}.`;
    setOperationalLog(prev => [
      { time: new Date().toLocaleTimeString(), msg: lMsg, type: 'LEVEL' },
      ...prev
    ]);
    if (showToast) showToast(`Situación Operativa fijada en Nivel ${level}`);
  };

  const handleAddTriageNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !triageNotes.trim()) return;

    const updated: IncidentState = {
      ...selectedIncident,
      notes: [...(selectedIncident.notes || []), triageNotes.trim()]
    };

    setCustomIncidents(prev => {
      const filtered = prev.filter(p => p.id !== selectedIncident.id);
      return [updated, ...filtered];
    });

    setOperationalLog(prev => [
      { 
        time: new Date().toLocaleTimeString(), 
        msg: `Nota agregada a verificación: "${triageNotes.trim().slice(0, 35)}..."`, 
        type: 'NOTE' 
      },
      ...prev
    ]);

    setTriageNotes('');
  };

  // Dispatch individual mobile units directly from the list panel
  const handleToggleUnitStatus = (unitId: string) => {
    if (playBuzzerSound) playBuzzerSound(660, 0.1, 'triangle');
    setUnits(prev => prev.map(u => {
      if (u.id === unitId) {
        const nextStatusMap: Record<OperationalUnit['status'], OperationalUnit['status']> = {
          'DISPONIBLE': 'MOVILIZADO',
          'MOVILIZADO': 'EN_ESCENA',
          'EN_ESCENA': 'STANDBY',
          'STANDBY': 'DISPONIBLE'
        };
        const nextStatus = nextStatusMap[u.status];
        
        // Log mobilization
        const logMsg = `Unidad ${u.name} (${u.callsign}) cambia estado a [${nextStatus}].`;
        setOperationalLog(p => [{ time: new Date().toLocaleTimeString(), msg: logMsg, type: 'DEPT' }, ...p]);

        return { ...u, status: nextStatus };
      }
      return u;
    }));
  };

  // 2. RISK ANALYSIS AND MATRIX ENGINE (5x5 Probability/Consequence Grid)
  // Maps current incident parameters into the standard EN 1990 / ISO 31000 Emergency Risk Matrix
  const riskAnalysisMatrix = useMemo(() => {
    const matrix = Array(5).fill(0).map(() => Array(5).fill(null as null | IncidentState[]));
    
    consolidatedIncidents.forEach((inc) => {
      // Determine Likelihood (Probability) from validation level & source (0 to 4 index)
      let probabilityIdx = 2; // Default Medium (3)
      if (inc.validation === 'CONFIRMADO') {
        probabilityIdx = 4; // Muy Alta (5)
      } else if (inc.validation === 'PRE-VERIFICADO') {
        probabilityIdx = 3; // Alta (4)
      } else if (inc.validation === 'MITIGADO') {
        probabilityIdx = 1; // Baja (2)
      } else if (inc.validation === 'FALSA-ALARMA') {
        probabilityIdx = 0; // Muy Baja (1)
      }

      // Determine Severe Consequence (0 to 4 index) from magnitude, values, pop range
      let consequenceIdx = 1; // Default Leve (2)
      if (inc.affectedPopRange === 'CRÍTICO' || inc.operationalLevel === 3) {
        consequenceIdx = 4; // Catastrófico (5)
      } else if (inc.affectedPopRange === 'ALTO' || inc.operationalLevel === 2) {
        consequenceIdx = 3; // Grave (4)
      } else if (inc.affectedPopRange === 'MEDIO' || inc.operationalLevel === 1) {
        consequenceIdx = 2; // Moderado (3)
      } else if (inc.category === 'SISMICIDAD' && inc.value.toLowerCase().includes('m 5')) {
        consequenceIdx = 3;
      }

      if (!matrix[4 - probabilityIdx][consequenceIdx]) {
        matrix[4 - probabilityIdx][consequenceIdx] = [];
      }
      matrix[4 - probabilityIdx][consequenceIdx]!.push(inc);
    });

    return matrix;
  }, [consolidatedIncidents]);

  // Generate tactical checklists based on live state
  const checklistItems = useMemo(() => {
    const list = [
      { id: 'ck-cecop', label: 'Establecer Enlace Digital e IGate del nodo APRS local en la subred', done: true, priority: 'CRÍTICO' },
      { id: 'ck-ign', label: 'Correlacionar lecturas de sismicidad IGN con acelerómetros de presas sectoriales', done: false, priority: 'ALTA' },
    ];

    const hasSismicidad = consolidatedIncidents.some(i => i.category === 'SISMICIDAD' && i.validation !== 'FALSA-ALARMA');
    const hasRadiactividad = consolidatedIncidents.some(i => i.category === 'RADIACTIVIDAD' && i.validation !== 'FALSA-ALARMA');
    const hasWildfire = consolidatedIncidents.some(i => i.category === 'INCENDIO' && i.validation !== 'FALSA-ALARMA');
    const hasTrafico = consolidatedIncidents.some(i => i.category === 'VIAL' && i.validation !== 'FALSA-ALARMA');

    if (hasSismicidad) {
      list.push({ id: 'ck-eq-1', label: 'Inspeccionar integridad estructural de puentes de autovía e infraestructuras de agua potable', done: cecopSituacion >= 2, priority: 'CRÍTICO' });
      list.push({ id: 'ck-eq-2', label: 'Verificar disparo preventivo de acometidas de gas licuado urbano de alta presión', done: cecopSituacion >= 3, priority: 'ALTA' });
    }
    if (hasRadiactividad) {
      list.push({ id: 'ck-nuc-1', label: 'Activar red rústica de dosímetros REA y verificar filtros HEPA del bunker CECOP', done: true, priority: 'CRÍTICO' });
      list.push({ id: 'ck-nuc-2', label: 'Preparación de profilaxis farmacológica (comprimidos Yoduro Potásico KI) para radio de exclusión', done: cecopSituacion >= 2, priority: 'CRÍTICO' });
    }
    if (hasWildfire) {
      list.push({ id: 'ck-fire-1', label: 'Establecer puntos de reunión seguros para desalojo preventivo de áreas habitadas de interfaz', done: false, priority: 'CRÍTICO' });
      list.push({ id: 'ck-fire-2', label: 'Monitorear dirección y ráfagas de viento mediante telemetría en vivo del pilar WeeWX', done: true, priority: 'ALTA' });
    }
    if (hasTrafico || cecopSituacion >= 2) {
      list.push({ id: 'ck-traffic-1', label: 'Redirigir flujos viales mediante cortes en paneles de mensaje variable DGT', done: cecopSituacion >= 1, priority: 'ALTA' });
    }

    return list;
  }, [consolidatedIncidents, cecopSituacion]);

  // Interactive local states for quick checklist toggle
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>({
    'ck-cecop': true,
    'ck-nuc-1': true,
    'ck-fire-2': true,
  });

  const handleToggleTask = (taskId: string) => {
    setCompletedTaskIds(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
    if (playBuzzerSound) playBuzzerSound(1000, 0.05, 'sine');
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-slate-100 shadow-xl" id="cecop-pilar-container">
      
      {/* 1. UPPER HEADER IN CIVIL DEFENSE SCHEME */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-amber-500 text-slate-950 rounded-lg animate-pulse shadow-md flex items-center justify-center">
            <ShieldAlert size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded uppercase">
                COORDINACIÓN NACIONAL • CECOP
              </span>
              <span className="text-xs font-mono text-slate-500">M.S. & PRO.CIV - CERTIFIED</span>
            </div>
            <h1 className="text-base sm:text-xl font-sans font-black tracking-tight text-white flex items-center gap-2 uppercase">
              Mecanismo Operativo de Verificación y Gestión de Emergencias
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              Consola de Triage para detección Pilar I (Sismos, Alertas AEMET, Radiactividad Nuclear CSN, Incendios e Incidencias DGT)
            </p>
          </div>
        </div>

        {/* OPERATIONAL MODE INDICATOR */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="text-[10px] text-emerald-500 font-mono flex items-center gap-1 border-l border-slate-800 pl-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            SISTEMA OPERATIVO ACTIVO (MODO REAL)
          </div>
        </div>
      </div>

      {/* 2. EMERGENCY DIRECTIVE LEVEL SELECTOR AND METRIC CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 bg-slate-900/40 border border-slate-850 p-3 rounded-xl">
        <div className="lg:col-span-1 flex flex-col gap-2 justify-center">
          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-extrabold text-center lg:text-left">
            Nivel PEM de Coordinación CECOP
          </div>
          
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((level) => {
              const isActive = cecopSituacion === level;
              const colorClasses = 
                level === 0 ? (isActive ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'text-emerald-400 border-emerald-900 hover:bg-emerald-950/10') :
                level === 1 ? (isActive ? 'bg-yellow-500 text-slate-950 border-yellow-400' : 'text-yellow-400 border-yellow-900 hover:bg-yellow-950/10') :
                level === 2 ? (isActive ? 'bg-orange-500 text-slate-950 border-orange-400' : 'text-orange-400 border-orange-950 hover:bg-orange-950/10') :
                (isActive ? 'bg-red-500 text-slate-950 border-red-400 animate-pulse' : 'text-red-400 border-red-950 hover:bg-red-950/10');

              return (
                <button
                  key={level}
                  onClick={() => setCecopSituacion(level as 0|1|2|3)}
                  className={`border font-mono py-2 rounded text-center text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${colorClasses}`}
                >
                  <span className="text-[9px] font-light">SIT</span>
                  <span className="text-sm font-black">{level}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[9px] font-mono text-center lg:text-left leading-relaxed text-slate-400 mt-1">
            {cecopSituacion === 0 && '🟢 SITUACIÓN 0: Seguimiento intensivo. Estado de normalidad vigilada y monitoreo telemático.'}
            {cecopSituacion === 1 && '🟡 SITUACIÓN 1: Alerta local detectada. Movilización selectiva de equipos municipales.'}
            {cecopSituacion === 2 && '🟠 SITUACIÓN 2: Alerta generalizada. Intervención supramunicipal. CECOP activado al 100%.'}
            {cecopSituacion === 3 && '🔴 SITUACIÓN 3: Caso de emergencia catastrófica nacional. Activación de UME y apoyo estatal.'}
          </div>
        </div>

        {/* 3 STAT CARDS REFLECTING LIVE FLOWS */}
        <div className="grid grid-cols-3 gap-2 lg:col-span-3">
          <div className="bg-slate-950/70 border border-slate-850 p-2 text-center rounded-lg flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wide">Foco Detección SAT (Pilar I)</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-white">{consolidatedIncidents.length}</span>
            <span className="text-[9px] font-mono text-slate-400 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              REA, IGN, AEMET, DGT
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-850 p-2 text-center rounded-lg flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wide">Nivel de Alerta Crítica</span>
            <span className={`text-xl sm:text-2xl font-mono font-black ${cecopSituacion >= 2 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
              {cecopSituacion === 0 ? 'NOMINAL' : `SIT-${cecopSituacion} ACTIVADA`}
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              {cecopSituacion >= 2 ? 'CECOP Movilizado' : 'Bajo Control de Guardia'}
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-850 p-2 text-center rounded-lg flex flex-col justify-between">
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wide">Unidades Desplegadas</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-teal-400">
              {units.filter(u => u.status === 'MOVILIZADO' || u.status === 'EN_ESCENA').length} / {units.length}
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              Banda Digital y Voz Activas
            </span>
          </div>
        </div>
      </div>

      {/* 3. TACTICAL WORKING GRID (LEFT: LIST OF LIVE FEEDS FOR TRIAGE, RIGHT: COMPREHENSIVE TRIAGE FILE AND CHANNELS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        
        {/* COL 1: ALARM SELECTION PANEL (5 columns/12) */}
        <div className="xl:col-span-5 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
            <span className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1 uppercase">
              <Layers size={13} className="text-indigo-400" />
              Incidencias y Amenazas Detectadas (Pilar I)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleCompactMode}
                className={`px-1.5 py-0.5 border text-[8px] font-mono font-bold rounded cursor-pointer transition-all flex items-center gap-1 uppercase ${
                  isCompactMode 
                    ? 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40' 
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
                title="Alternar entre vista compacta y detallada"
              >
                <LayoutList size={9} />
                {isCompactMode ? 'COMPACTO' : 'DETALLADO'}
              </button>
              <span className="text-[9px] font-mono bg-slate-800 text-slate-300 px-2 rounded py-0.5 font-bold">
                Total: {consolidatedIncidents.length}
              </span>
            </div>
          </div>

          <div className={`flex flex-col max-h-[380px] overflow-y-auto pr-1 ${isCompactMode ? 'gap-1' : 'gap-1.5'}`}>
            {consolidatedIncidents.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-800 rounded-lg text-slate-500 font-mono text-xs">
                No hay amenazas ni sucesos activos de emergencia detectados en este instante. El sistema se encuentra en vigilancia operativa permanente.
              </div>
            ) : (
              consolidatedIncidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id;
                
                // Colors indicator according to source category
                const sourceBadgeColor = 
                  inc.source === 'IGN' ? 'bg-orange-900/30 text-orange-400 border-orange-500/20' :
                  inc.source === 'CSN' ? 'bg-yellow-920 bg-yellow-900/30 text-yellow-400 border-yellow-500/20' :
                  inc.source === 'DGT' ? 'bg-blue-900/30 text-blue-400 border-blue-500/20' :
                  'bg-red-900/30 text-red-400 border-red-500/20';

                const validationBadgeColor =
                  inc.validation === 'PRE-VERIFICADO' ? 'text-blue-400 bg-blue-500/10' :
                  inc.validation === 'CONFIRMADO' ? 'text-red-400 bg-red-500/10 border-red-500/20 font-bold' :
                  inc.validation === 'FALSA-ALARMA' ? 'text-slate-500 bg-slate-800 line-through' :
                  'text-emerald-400 bg-emerald-500/10';

                // Determine left indicator bar color and label based on severity
                let severityIndicatorColor = 'bg-blue-500/70'; // Informativa
                if (inc.operationalLevel === 3 || inc.affectedPopRange === 'CRÍTICO') {
                  severityIndicatorColor = 'bg-red-500 animate-pulse';
                } else if (inc.operationalLevel === 2 || inc.affectedPopRange === 'ALTO') {
                  severityIndicatorColor = 'bg-orange-500';
                } else if (inc.operationalLevel === 1 || inc.affectedPopRange === 'MEDIO') {
                  severityIndicatorColor = 'bg-amber-500';
                }

                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    className={`flex flex-col cursor-pointer select-none transition-all duration-150 rounded-lg border relative overflow-hidden ${
                      isCompactMode ? 'p-1.5 pl-3 gap-1' : 'p-2.5 pl-4 gap-1.5'
                    } ${
                      isSelected
                        ? 'bg-slate-900 border-indigo-400/80 shadow-md'
                        : 'bg-slate-900/30 border-slate-850 hover:bg-slate-900/60 hover:border-slate-800'
                    }`}
                  >
                    {/* Lateral Visual Indicator of Severity */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${severityIndicatorColor}`} />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-mono border px-1 rounded uppercase tracking-wider ${sourceBadgeColor}`}>
                          {inc.source}
                        </span>
                        <span className={`font-bold text-slate-300 truncate max-w-[170px] sm:max-w-xs ${isCompactMode ? 'text-[9.5px]' : 'text-[10px]'}`}>
                          {inc.title}
                        </span>
                      </div>
                      <span className={`text-[8px] font-mono px-1 py-0.2 rounded border border-transparent ${validationBadgeColor}`}>
                        {inc.validation}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between font-mono text-slate-400 ${isCompactMode ? 'text-[9px]' : 'text-[10px]'}`}>
                      <span className="truncate max-w-[210px] sm:max-w-sm">{inc.details}</span>
                      <span className="text-white font-bold ml-1 font-mono uppercase text-[9px] shrink-0">
                        {inc.value}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between text-[9px] text-slate-500 font-mono border-t border-slate-850/50 ${
                      isCompactMode ? 'pt-0.5' : 'pt-1'
                    }`}>
                      <div className="flex items-center gap-1">
                        <Clock size={9} />
                        <span>{inc.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-1 text-indigo-400 font-bold">
                        <span>Pob: {inc.affectedPopRange}</span>
                        <span>•</span>
                        <span>Conf: {inc.confidence}%</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DYNAMIC EMERGENCY RISK MATRIX */}
          <div className="mt-2 bg-slate-900/20 border border-slate-850 rounded-lg p-2.5">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-850">
              <span className="text-[11px] font-mono text-indigo-400 font-bold flex items-center gap-1">
                <Sliders size={12} />
                Matriz de Riesgo Civil ISO 31000
              </span>
              <span className="text-[8.5px] text-slate-500 font-mono">
                X: Severidad | Y: Probabilidad
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1 text-[9px] font-mono text-slate-400">
              {/* Header col titles */}
              <div className="flex items-center justify-center font-bold">Prob.</div>
              <div className="text-center font-medium">Bajo</div>
              <div className="text-center font-medium">Leve</div>
              <div className="text-center font-medium text-orange-400">Mod.</div>
              <div className="text-center font-medium text-orange-500">Grave</div>
              <div className="text-center font-medium text-red-500">Catast.</div>

              {/* Rows */}
              {riskAnalysisMatrix.map((row, rIdx) => {
                const probabilityLabels = ['M.Alta', 'Alta', 'Media', 'Baja', 'M.Baja'];
                const rowLabel = probabilityLabels[rIdx];

                return (
                  <React.Fragment key={rIdx}>
                    {/* Prob label of row */}
                    <div className="flex items-center pr-1 text-[8.5px] font-bold text-slate-500 truncate">
                      {rowLabel}
                    </div>

                    {/* 5 columns */}
                    {row.map((cellItems, cIdx) => {
                      // Color cell according to standard Risk assessment (Green, Yellow, Orange, Red)
                      const isRed = (rIdx <= 1 && cIdx >= 3) || (rIdx <= 2 && cIdx === 4);
                      const isOrange = (rIdx === 2 && cIdx === 3) || (rIdx <= 1 && cIdx === 2) || (rIdx === 3 && cIdx === 4);
                      const isYellow = (rIdx >= 3 && cIdx === 2) || (rIdx === 2 && cIdx <= 1) || (rIdx === 3 && cIdx === 3);
                      
                      const cellBg = isRed ? 'bg-red-500/10 hover:bg-red-500/25 border-red-500/20' :
                                    isOrange ? 'bg-orange-500/10 hover:bg-orange-500/25 border-orange-500/20' :
                                    isYellow ? 'bg-yellow-500/10 hover:bg-yellow-500/25 border-yellow-500/15' :
                                    'bg-emerald-500/5 hover:bg-emerald-500/15 border-emerald-500/10';

                      const count = cellItems?.length || 0;

                      return (
                        <div
                          key={cIdx}
                          className={`aspect-square sm:h-9 border rounded flex flex-col items-center justify-center transition-all ${cellBg} relative`}
                          title={`Probabilidad: ${rowLabel}, Severidad: ${cIdx+1}. Incidentes activos: ${count}`}
                        >
                          {count > 0 ? (
                            <span className="w-4 h-4 bg-white text-slate-950 font-bold text-[9px] rounded-full flex items-center justify-center shadow animate-bounce">
                              {count}
                            </span>
                          ) : (
                            <span className="text-[8px] text-slate-700 font-extrabold">•</span>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* COL 2: COMPREHENSIVE TRIAGE AND ACTION WORKBENCH (7 columns/12) */}
        <div className="xl:col-span-7 flex flex-col gap-3">
          
          {selectedIncident ? (
            <div className="bg-slate-900/50 border border-slate-850 rounded-xl p-3 flex flex-col gap-3">
              
              {/* HEADER FICHA DE TRIAGE */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 px-2 text-[9px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-550/30 rounded font-bold uppercase tracking-tight">
                    FICHA DE VERIFICACIÓN CO - {selectedIncident.source}-{selectedIncident.id.slice(0, 4)}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <span>Precision:</span>
                    <span className="text-emerald-400 font-bold">{selectedIncident.confidence}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-mono">Control de Triaje:</span>
                  <div className="flex bg-slate-950 border border-slate-800 p-0.5 rounded gap-0.5">
                    {['PRE-VERIFICADO', 'CONFIRMADO', 'FALSA-ALARMA', 'MITIGADO'].map((valType) => {
                      const isActive = selectedIncident.validation === valType;
                      const textMap: Record<string, string> = {
                        'PRE-VERIFICADO': 'VERIF.',
                        'CONFIRMADO': 'VÁLIDO',
                        'FALSA-ALARMA': 'FALSO',
                        'MITIGADO': 'MITIG'
                      };
                      const colorMap: Record<string, string> = {
                        'PRE-VERIFICADO': 'bg-blue-600 text-white',
                        'CONFIRMADO': 'bg-red-600 text-white',
                        'FALSA-ALARMA': 'bg-zinc-800 text-slate-400',
                        'MITIGADO': 'bg-emerald-600 text-white'
                      };

                      return (
                        <button
                          key={valType}
                          onClick={() => handleModifyIncidentValidation(valType as IncidentState['validation'])}
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                            isActive 
                              ? colorMap[valType]
                              : 'text-slate-500 hover:text-slate-350 hover:bg-slate-900'
                          }`}
                        >
                          {textMap[valType]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* CORE CONTENT */}
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-sans font-black text-white leading-tight">
                  {selectedIncident.title}
                </h3>
                <p className="text-xs font-mono text-slate-350 bg-slate-950 p-2.5 rounded-lg border border-slate-850/80 leading-relaxed text-wrap whitespace-pre-wrap">
                  {selectedIncident.details}
                </p>
              </div>

              {/* OPERATIONAL PARAMETERS AND MITIGATION CONTROLS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                <div className="bg-slate-950/40 border border-slate-850/60 p-2 rounded flex flex-col justify-between">
                  <span className="text-[9.5px] text-slate-500 uppercase">Afectación Vecinal (Exposición)</span>
                  <div className="text-white font-mono font-bold mt-1 text-xs">
                    Rango: <span className="text-indigo-400">{selectedIncident.affectedPopRange}</span>
                  </div>
                  <span className="text-[9px] text-slate-500 leading-tight mt-1">Económica & Estructural</span>
                </div>

                <div className="bg-slate-950/40 border border-slate-850/60 p-2 rounded flex flex-col justify-between">
                  <span className="text-[9.5px] text-slate-500 uppercase">Clasificación Situación</span>
                  <div className="flex gap-1 mt-1">
                    {[0, 1, 2, 3].map((l) => (
                      <button
                        key={l}
                        onClick={() => handleModifyOperationalLevel(l as 0|1|2|3)}
                        className={`px-1.5 rounded text-[10px] font-extrabold cursor-pointer transition-all ${
                          selectedIncident.operationalLevel === l 
                            ? 'bg-amber-400 text-slate-950' 
                            : 'bg-slate-850 text-slate-500 hover:text-slate-350'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <span className="text-[9px] mt-1 text-slate-500 leading-tight">Fijar Riesgo General</span>
                </div>

                <div className="bg-slate-950/40 border border-slate-850/60 p-2 rounded flex flex-col justify-between">
                  <span className="text-[9.5px] text-slate-500 uppercase">Localización Geográfica</span>
                  <div className="text-emerald-400 font-mono font-bold mt-1 text-[11px] flex items-center gap-1 truncate">
                    <MapPin size={10} />
                    {selectedIncident.latitude.toFixed(3)}N, {selectedIncident.longitude.toFixed(3)}E
                  </div>
                  <span className="text-[9px] text-slate-500 leading-tight mt-1">Sonda de Posicionamiento</span>
                </div>
              </div>

              {/* TACTICAL NOTES AND EXCLUSIVES NOTES FEED */}
              <div className="bg-slate-950/70 border border-slate-850 p-2.5 rounded-lg flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">
                  Log Operativo y Evaluaciones del Analista de Guardia:
                </span>
                
                <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1">
                  {selectedIncident.notes?.map((n, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-slate-300 leading-relaxed py-0.5 border-b border-slate-900/50 flex gap-2">
                      <span className="text-indigo-400 font-extrabold shrink-0">[{idx + 1}]</span>
                      <span className="text-wrap">{n}</span>
                    </div>
                  ))}
                  {(!selectedIncident.notes || selectedIncident.notes.length === 0) && (
                    <span className="text-[10px] text-slate-500 font-mono text-center py-2">
                      No hay notas o directrices de seguridad anexadas a este evento.
                    </span>
                  )}
                </div>

                {/* NOTE SUBMISSION FORM */}
                <form onSubmit={handleAddTriageNote} className="flex gap-1.5 mt-1">
                  <input
                    type="text"
                    value={triageNotes}
                    onChange={(e) => setTriageNotes(e.target.value)}
                    placeholder="Añadir directriz operativa o de movilización del CECOP..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono px-3 py-1 rounded text-xs cursor-pointer select-none font-bold flex items-center gap-1 shrink-0"
                  >
                    <Plus size={12} />
                    Anotar
                  </button>
                </form>
              </div>

              {/* PROTOCOL VERIFICATION & EMITTING CHANNELS */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-800 pt-2.5">
                <span className="text-[10.5px] font-mono text-slate-400 font-bold flex items-center gap-1">
                  <Radio size={12} className="text-red-400" />
                  Envío de Mensajería Oficial (Difusión):
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (playBuzzerSound) playBuzzerSound(1800, 0.5, 'square');
                      if (showToast) showToast('Emisión ES-ALERT Canal Satélite ejecutada con éxito');
                      setOperationalLog(prev => [
                        { time: new Date().toLocaleTimeString(), msg: `Canal de Difusión Masiva ES-Alert simulado para seísmo/amenaza.`, type: 'SAT' },
                        ...prev
                      ]);
                    }}
                    className="px-2.5 py-1 bg-red-650 hover:bg-red-600 text-white font-mono text-[10.5px] font-bold rounded cursor-pointer transition-all flex items-center gap-1 shadow"
                    title="Emitir mensaje masivo directo por canal celular 5G/4G e Inmarsat"
                  >
                    <Bell size={11} className="animate-bounce" />
                    Enviar ES-Alert
                  </button>
                  <button
                    onClick={() => {
                      if (playBuzzerSound) playBuzzerSound(750, 0.2, 'sine');
                      if (showToast) showToast('Transmisión telemática por APRS e IGATE enviada');
                      setOperationalLog(prev => [
                        { time: new Date().toLocaleTimeString(), msg: `Difusión telemática APRS emitiendo baliza de seguridad.`, type: 'SAT' },
                        ...prev
                      ]);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-mono text-[10.5px] font-bold rounded cursor-pointer transition-all flex items-center gap-1"
                    title="Codificar alerta como un paquete telemático APRS UI-Frame"
                  >
                    <Send size={11} />
                    Baliza APRS
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-6 text-center text-slate-500 font-mono text-xs">
              Directorio de Triage vacío. Use los simulacros para poblar la consola operativa de Protección Civil.
            </div>
          )}

          {/* DYNAMIC CHECKLIST OPERATIVO PEM */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            {/* OPERATIONAL CHECKLISTS */}
            <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[11.5px] font-mono text-indigo-400 font-bold flex items-center gap-1.5 uppercase pb-1 border-b border-slate-850">
                <CheckSquare size={13} />
                Lista de Tareas Estándar PEM
              </span>

              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {checklistItems.map((chk) => {
                  const isDone = completedTaskIds[chk.id] ?? chk.done;
                  
                  return (
                    <div
                      key={chk.id}
                      onClick={() => handleToggleTask(chk.id)}
                      className={`flex items-start gap-2 p-1.5 border rounded-lg cursor-pointer transition-all select-none ${
                        isDone 
                          ? 'bg-emerald-950/10 border-emerald-500/20 text-slate-400' 
                          : 'bg-slate-950/80 border-slate-850 text-slate-200 hover:border-slate-800 hover:bg-slate-950'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center font-mono mt-0.5 shrink-0 ${
                        isDone ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-600 bg-slate-900'
                      }`}>
                        {isDone && '✓'}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[10.5px] leading-tight font-mono ${isDone ? 'line-through text-slate-500' : ''}`}>
                          {chk.label}
                        </span>
                        <span className={`text-[8px] font-bold uppercase mt-0.5 ${
                          chk.priority === 'CRÍTICO' ? 'text-red-400' : 'text-amber-400'
                        }`}>
                          {chk.priority}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* INTERVENTIONAL UNITS STATUS DIRECTORY */}
            <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[11.5px] font-mono text-indigo-400 font-bold flex items-center gap-1.5 uppercase pb-1 border-b border-slate-850">
                <Users size={13} />
                Despliegue y Coordinación de Recursos
              </span>

              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {units.map((unit) => {
                  // Unit color mapping according to operational status
                  const statusColors: Record<OperationalUnit['status'], string> = {
                    'DISPONIBLE': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    'MOVILIZADO': 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
                    'EN_ESCENA': 'bg-red-500/10 text-red-400 border-red-500/20 font-bold',
                    'STANDBY': 'bg-slate-800 text-slate-400 border-slate-750'
                  };

                  return (
                    <div
                      key={unit.id}
                      onClick={() => handleToggleUnitStatus(unit.id)}
                      className="bg-slate-950/80 border border-slate-850 p-1.5 rounded-lg flex items-center justify-between cursor-pointer select-none hover:border-slate-700 transition-all text-xs"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10.5px] font-mono font-bold text-slate-200 leading-tight">
                            {unit.name}
                          </span>
                          <span className="text-[8px] font-mono bg-indigo-900/30 text-indigo-400 px-1 rounded">
                            {unit.callsign}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono">
                          Ubicación: {unit.location}
                        </span>
                      </div>

                      <span className={`text-[8.5px] font-mono border px-1.5 py-0.5 rounded ${statusColors[unit.status]}`}>
                        {unit.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* SECTOR INGENIERÍA: AUDITORÍA Y TRIAGE RED APRS / AX.25 */}
      <div className="bg-slate-900/40 border border-slate-850 p-3.5 rounded-xl flex flex-col gap-3">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-850">
          <div className="flex items-center gap-2">
            <Radio className="text-orange-400 animate-pulse" size={16} />
            <span className="text-xs font-mono text-slate-200 font-bold uppercase">
              Auditoría y Validación de Telecomunicaciones: Red Radio APRS (AX.25 UI-Frames)
            </span>
            <span className="bg-orange-950 text-orange-400 border border-orange-850 text-[8.5px] font-mono font-bold px-1.5 rounded uppercase">
              Control PEM
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] text-slate-500 font-mono">
              Cola de Firma: {aprsPackets.filter(p => p.status === 'PENDIENTE').length} Pendientes
            </span>
            <button
              onClick={handlePurgeQueue}
              type="button"
              className="px-2.5 py-1 bg-red-950/20 hover:bg-red-950/45 border border-red-900/30 hover:border-red-800 text-red-400 hover:text-red-300 font-mono text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all leading-none focus:outline-none"
              title="Purgar paquetes obsoletos o caducados (>30s) de la cola pendiente"
            >
              <Trash2 size={10} className="shrink-0" />
              <span>Purgar Cola</span>
            </button>
          </div>
        </div>

        {/* NOTIFICACIONES DE ESCRITORIO SELECTOR */}
        <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-lg flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-900 pb-2.5">
            <div className="flex items-center gap-2">
              <Bell className="text-orange-400" size={14} />
              <div className="flex flex-col">
                <span className="text-[11px] font-sans font-bold text-slate-300">
                  Preferencias de Notificaciones de Escritorio
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Recibe avisos push inmediatos en tu sistema operativo al detectarse tramas APRS o alertas del CECOP.
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 p-1 bg-slate-900 border border-slate-850 rounded-lg shrink-0">
              <button
                onClick={() => handlePreferenceChange('disabled')}
                className={`px-2.5 py-1 text-[10px] rounded font-mono font-bold transition-all cursor-pointer ${
                  notificationsEnabled === 'disabled'
                    ? 'bg-slate-800 text-slate-300 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Desactivadas
              </button>
              <button
                onClick={() => handlePreferenceChange('emergency_only')}
                className={`px-2.5 py-1 text-[10px] rounded font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  notificationsEnabled === 'emergency_only'
                    ? 'bg-red-950/60 text-red-400 border border-red-900/40 shadow-sm'
                    : 'text-slate-500 hover:text-red-400'
                }`}
              >
                <ShieldAlert size={10} />
                Solo EMERGENCY
              </button>
              <button
                onClick={() => handlePreferenceChange('all')}
                className={`px-2.5 py-1 text-[10px] rounded font-mono font-bold transition-all cursor-pointer ${
                  notificationsEnabled === 'all'
                    ? 'bg-amber-950/80 text-amber-400 border border-amber-900/40 shadow-sm'
                    : 'text-slate-500 hover:text-amber-400'
                }`}
              >
                Todos los paquetes
              </button>
            </div>
          </div>

          {/* Selector de tipos de alerta específicos para notificaciones push */}
          {notificationsEnabled !== 'disabled' && (
            <div className="flex flex-col gap-2 pt-0.5">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                Tipos de alerta que activarán notificaciones push del navegador:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {['Sísmica', 'Radiológica', 'Meteorológica', 'ICA', 'Incendios'].map((type) => {
                  const isChecked = notifTypes[type] !== false;
                  return (
                    <label
                      key={type}
                      className={`flex items-center gap-2 p-1.5 rounded border text-[10px] font-mono cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-indigo-950/35 text-indigo-300 border-indigo-900/40'
                          : 'bg-slate-900/40 text-slate-500 border-slate-900/60 hover:border-slate-850'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const nextTypes = { ...notifTypes, [type]: !isChecked };
                          setNotifTypes(nextTypes);
                          localStorage.setItem('cecop_notif_types', JSON.stringify(nextTypes));
                          if (showToast) {
                            showToast(`Notificaciones para ${type} ${!isChecked ? 'activadas' : 'desactivadas'}`);
                          }
                        }}
                        className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950 w-3 h-3 cursor-pointer"
                      />
                      <span>{type}</span>
                    </label>
                  );
                })}
              </div>

              {/* Umbrales detallados de filtrado para Notificaciones Push */}
              <div className="mt-2.5 pt-2.5 border-t border-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Umbral Sísmico */}
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      Umbral de Magnitud (Sismos)
                    </span>
                    <span className="text-xs font-mono font-bold text-red-400 bg-red-950/40 border border-red-900/20 px-1.5 py-0.5 rounded">
                      M ≥ {eqMinMagnitude.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-sans leading-normal">
                    Solo se emitirán notificaciones push para terremotos con magnitud igual o superior a este umbral.
                  </p>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="1.0" 
                      max="8.0" 
                      step="0.1"
                      value={eqMinMagnitude} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setEqMinMagnitude(val);
                        localStorage.setItem('cecop_notif_eq_min_magnitude', val.toString());
                      }}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                    <span>1.0 (Micro)</span>
                    <span>3.5 (Sentido)</span>
                    <span>5.0 (Moderado)</span>
                    <span>8.0 (Catastrófico)</span>
                  </div>
                </div>

                {/* Umbral Meteorológico */}
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                      Nivel Alerta Meteorológica
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                      wxMinSeverity === 'Crítica' ? 'bg-red-950/40 text-red-400 border-red-900/20' :
                      wxMinSeverity === 'Alta' ? 'bg-orange-950/40 text-orange-400 border-orange-900/20' :
                      'bg-slate-950/40 text-slate-400 border-slate-900/20'
                    }`}>
                      {wxMinSeverity}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-sans leading-normal">
                    Nivel mínimo de severidad climática local requerida para disparar notificaciones de escritorio.
                  </p>
                  <select
                    value={wxMinSeverity}
                    onChange={(e) => {
                      const val = e.target.value;
                      setWxMinSeverity(val);
                      localStorage.setItem('cecop_notif_wx_min_severity', val);
                      if (showToast) {
                        showToast(`Umbral de clima fijado en nivel mínimo: ${val}`);
                      }
                    }}
                    className="bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-slate-300 text-[10.5px] focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Moderada">Moderada (Cualquier ráfaga, lluvia o temp inusual)</option>
                    <option value="Alta">Alta (Viento &gt; 25kts, Gust &gt; 35kts, Temp &gt; 38°C)</option>
                    <option value="Crítica">Crítica (Condiciones de riesgo extremo de incendio o tormentas graves)</option>
                  </select>
                  <div className="text-[8px] text-slate-600 font-sans italic">
                    * Los datos son analizados desde la telemetría del sensor meteorológico local.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CONFIGURACIÓN DE DESTINATARIOS DE ALERTA DE ALTA PRIORIDAD */}
        <div className="bg-slate-950/65 border border-slate-850 p-3 rounded-lg flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <Settings className="text-orange-400" size={13} />
              <div className="flex flex-col">
                <span className="text-[11px] font-sans font-bold text-slate-300">
                  Configuración de Destinatarios de Alerta (Reenvío APRS de Alta Prioridad)
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Lista de estaciones autorizadas para retransmisiones inmediatas de alarmas.
                </span>
              </div>
            </div>
            
            <span className="text-[8.5px] font-mono font-bold bg-orange-950/40 text-orange-400 border border-orange-900/45 px-1.5 py-0.5 rounded uppercase">
              REVOLVING S.A.T.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Formulario de Adición */}
            <form onSubmit={handleAddRecipient} className="lg:col-span-1 flex flex-col gap-1.5 bg-slate-900/20 p-2 rounded border border-slate-900 h-fit">
              <span className="text-[9px] uppercase font-bold text-slate-400 font-sans tracking-wider">
                Alta Nueva Estación APRS
              </span>
              
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500 uppercase">Indicativo (ej. EB4MA-D)</label>
                  <input
                    type="text"
                    placeholder="EB4MA-D..."
                    value={newRecCallsign}
                    onChange={(e) => setNewRecCallsign(e.target.value)}
                    className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1 rounded outline-none font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500 uppercase">Frecuencia / Puerto</label>
                  <input
                    type="text"
                    placeholder="144.800 MHz"
                    value={newRecFreq}
                    onChange={(e) => setNewRecFreq(e.target.value)}
                    className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1 rounded outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-mono text-slate-500 uppercase">Nombre / Organismo</label>
                <input
                  type="text"
                  placeholder="Ej. Cruz Roja Pilar II..."
                  value={newRecName}
                  onChange={(e) => setNewRecName(e.target.value)}
                  className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1 rounded outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-1 bg-orange-600 hover:bg-orange-500 text-slate-950 font-sans font-bold text-[10px] py-1 rounded flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                <Plus size={11} />
                Agregar Estación
              </button>
            </form>

            {/* Listado de Destinatarios */}
            <div className="lg:col-span-2 flex flex-col gap-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 font-sans tracking-wider">
                Directorio Activo de Enlace Emergencia
              </span>
              
              {alertRecipients.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded p-4 text-center">
                  <span className="text-[10px] font-mono text-slate-600">No hay destinatarios configurados. Agregue una estación.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {alertRecipients.map((rec) => (
                    <div 
                      key={rec.id}
                      className={`p-1.5 rounded border flex items-center justify-between gap-2.5 transition-all ${
                        rec.isActive 
                          ? 'bg-slate-900 border-slate-800/80' 
                          : 'bg-slate-950/40 border-slate-905 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={rec.isActive}
                          onChange={() => handleToggleRecipient(rec.id)}
                          className="w-3.5 h-3.5 rounded border-slate-850 bg-slate-950 text-orange-500 focus:ring-0 cursor-pointer"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10.5px] font-mono font-bold text-slate-200 leading-tight">{rec.callsign}</span>
                          <span className="text-[9px] text-slate-450 truncate" title={rec.stationName}>
                            {rec.stationName}
                          </span>
                          <span className="text-[8px] font-mono text-slate-500 leading-none">{rec.freq}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteRecipient(rec.id)}
                        className="p-1 rounded hover:bg-slate-950 text-slate-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                        title="Eliminar destinatario"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GESTIÓN DE FRECUENCIAS DE EMERGENCIA */}
        <div className="bg-slate-950/65 border border-slate-850 p-3 rounded-lg flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <Radio className="text-orange-400" size={13} />
              <div className="flex flex-col">
                <span className="text-[11px] font-sans font-bold text-slate-300">
                  Gestión de Frecuencias de Emergencia (Asignador de Canales de Radio)
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Asigna y monitoriza canales de VHF/UHF específicos de telecomunicación táctica para cada tipo de incidencia.
                </span>
              </div>
            </div>
            
            <span className="text-[8.5px] font-mono font-bold bg-amber-950/40 text-amber-400 border border-amber-900/45 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping inline-block" />
              TÁCTICO CO-CECOP
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Formulario de Adición de Frecuencias */}
            <form onSubmit={handleAddFrequency} className="lg:col-span-1 flex flex-col gap-1.5 bg-slate-900/20 p-2 rounded border border-slate-900 h-fit">
              <span className="text-[9px] uppercase font-bold text-slate-400 font-sans tracking-wider">
                Asignar Nuevo Canal de Operación
              </span>
              
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Nombre Canal</label>
                  <input
                    type="text"
                    placeholder="ej. Canal Alfa..."
                    value={newFreqChannelName}
                    onChange={(e) => setNewFreqChannelName(e.target.value)}
                    className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1 rounded outline-none"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Frecuencia</label>
                  <input
                    type="text"
                    placeholder="ej. 145.500 MHz"
                    value={newFreqValue}
                    onChange={(e) => setNewFreqValue(e.target.value)}
                    className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1 rounded outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Tipo Alerta Asignado</label>
                  <select
                    value={newFreqAlertType}
                    onChange={(e) => setNewFreqAlertType(e.target.value)}
                    className="bg-slate-950 border border-slate-850 text-slate-250 text-[10.5px] px-2 py-1 rounded outline-none"
                  >
                    <option value="Emergencia">Emergencia (S.O.S)</option>
                    <option value="Boletines / Alertas">Boletines y Alertas</option>
                    <option value="SSTV">SSTV (Imágenes)</option>
                    <option value="Telemetría">Telemetría (Datos)</option>
                    <option value="Mensajes">Mensajes de Texto</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Descripción Breve</label>
                  <input
                    type="text"
                    placeholder="ej. Enlace vocal..."
                    value={newFreqDesc}
                    onChange={(e) => setNewFreqDesc(e.target.value)}
                    className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1 rounded outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="mt-2 bg-orange-600 hover:bg-orange-500 text-slate-950 font-sans font-bold text-[10px] py-1 rounded flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                <Plus size={11} />
                Asignar Canal
              </button>
            </form>

            {/* Listado de Frecuencias en Servicio */}
            <div className="lg:col-span-2 flex flex-col gap-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 font-sans tracking-wider">
                Distribución de Radio Canales de Emergencia S.A.T.
              </span>
              
              {emergencyFrequencies.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded p-4 text-center">
                  <span className="text-[10px] font-mono text-slate-600">No hay frecuencias en el plan táctico. Asigne un nuevo canal.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {emergencyFrequencies.map((freq) => (
                    <div 
                      key={freq.id}
                      className={`p-1.5 rounded border flex items-center justify-between gap-2.5 transition-all ${
                        freq.isActive 
                          ? 'bg-slate-900 border-slate-800/80 shadow-[0_0_8px_rgba(245,158,11,0.02)]' 
                          : 'bg-slate-950/40 border-slate-905 opacity-55'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={freq.isActive}
                          onChange={() => handleToggleFrequency(freq.id)}
                          className="w-3.5 h-3.5 rounded border-slate-850 bg-slate-950 text-orange-500 focus:ring-0 cursor-pointer animate-none"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5 leading-none">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-[10.5px] font-sans font-bold text-slate-200 truncate">{freq.channelName}</span>
                              <span className="text-[8px] font-mono font-bold bg-amber-950/50 text-amber-400 px-1 rounded uppercase border border-amber-900/30 shrink-0">
                                {freq.alertType}
                              </span>
                            </div>

                            {/* LED Indicator Badge */}
                            {(() => {
                              const act = channelActivity[freq.id] || 'IDLE';
                              if (!freq.isActive) {
                                return (
                                  <div className="flex items-center gap-1 shrink-0 bg-slate-950/45 border border-slate-900 px-1 py-0.5 rounded text-[7px] font-mono text-slate-500">
                                    <span className="w-1 h-1 rounded-full bg-slate-600" />
                                    OFFLINE
                                  </div>
                                );
                              }
                              if (act === 'TX') {
                                return (
                                  <div className="flex items-center gap-1 shrink-0 bg-red-950/40 border border-red-900/30 px-1 py-0.5 rounded text-[7px] font-mono font-bold text-red-400">
                                    <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                                    TX-BUSY
                                  </div>
                                );
                              }
                              if (act === 'RX') {
                                return (
                                  <div className="flex items-center gap-1 shrink-0 bg-sky-950/40 border border-sky-900/30 px-1 py-0.5 rounded text-[7px] font-mono font-bold text-sky-400 relative">
                                    <span className="w-1 h-1 rounded-full bg-sky-400 animate-pulse" />
                                    RX-DATA
                                  </div>
                                );
                              }
                              return (
                                <div className="flex items-center gap-1 shrink-0 bg-emerald-950/20 border border-emerald-900/10 px-1 py-0.5 rounded text-[7px] font-mono text-emerald-500/85">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500/60" />
                                  STANDBY
                                </div>
                              );
                            })()}
                          </div>

                          <div className="flex justify-between items-center mt-1">
                            <span className="text-[9.5px] font-mono font-black text-orange-400 leading-none">{freq.frequency}</span>
                            <span className="text-[8.5px] text-slate-500 truncate max-w-[130px]" title={freq.description}>
                              {freq.description}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteFrequency(freq.id)}
                        className="p-1 rounded hover:bg-slate-950 text-slate-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                        title="Eliminar frecuencia"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PARÁMETROS DE TRANSMISIÓN DEL PUERTO TNC */}
        <div className="bg-slate-950/65 border border-slate-850 p-4 rounded-lg flex flex-col gap-4">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <Sliders className="text-orange-400 animate-pulse" size={13} />
              <div className="flex flex-col">
                <span className="text-[11px] font-sans font-bold text-slate-300">
                  Parámetros de Transmisión del Puerto TNC (Módem AFSK AX.25)
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Optimice la ganancia, el timing y la tolerancia de colisión para las emisiones de alta prioridad de la red Pilar APRS.
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 font-mono text-[8px]">
              <span className="text-slate-400">ESTADO MÓDEM:</span>
              <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-900/45 px-1.5 py-0.5 rounded uppercase font-bold animate-pulse">
                SINC-ONLINE
              </span>
            </div>
          </div>

          <form onSubmit={handleApplyTncParams} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Control 1: Desviación */}
            <div className="flex flex-col gap-2 bg-slate-900/10 p-2.5 rounded border border-slate-900/65">
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                  Nivel de Desviación
                </span>
                <span className="text-[11px] font-mono font-black text-orange-400">
                  {tempDeviation.toFixed(1)} kHz
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={tempDeviation}
                onChange={(e) => setTempDeviation(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                <span>1.0 kHz (NFM Min)</span>
                <span>5.0 kHz (FM Max)</span>
              </div>
              <p className="text-[8.5px] text-slate-500 leading-tight mt-1 font-sans">
                Ajusta la modulación. <strong className="text-slate-300">2.2 kHz (Narrow)</strong> es ideal para VHF, previniendo saturación de receptores.
              </p>
            </div>

            {/* Control 2: Timeout de Reintento */}
            <div className="flex flex-col gap-2 bg-slate-900/10 p-2.5 rounded border border-slate-900/65">
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                  Timeout de Reintento
                </span>
                <span className="text-[11px] font-mono font-black text-orange-400">
                  {tempRetryTimeout} seg
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={tempRetryTimeout}
                onChange={(e) => setTempRetryTimeout(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                <span>1s (Inmediato)</span>
                <span>30s (Largo)</span>
              </div>
              <p className="text-[8.5px] text-slate-500 leading-tight mt-1 font-sans">
                Tiempo de espera entre colisiones AX.25. <strong className="text-slate-300">5 segundos</strong> previene saturación del canal táctico.
              </p>
            </div>

            {/* Control 3: TX Delay */}
            <div className="flex flex-col gap-2 bg-slate-900/10 p-2.5 rounded border border-slate-900/65">
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                  Retraso TX (TX Delay)
                </span>
                <span className="text-[11px] font-mono font-black text-orange-400">
                  {tempTxDelay} ms
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={tempTxDelay}
                onChange={(e) => setTempTxDelay(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                <span>50 ms (Ultra r.)</span>
                <span>1000 ms (PLL Max)</span>
              </div>
              <p className="text-[8.5px] text-slate-500 leading-tight mt-1 font-sans">
                Tiempo de preámbulo AX.25. Permite estabilizar la portadora de radio VHF antes de enviar datos útiles (<strong className="text-slate-300">Recomendado: 300ms</strong>).
              </p>
            </div>

            {/* Control 4: Robusto/FEC + Botón */}
            <div className="flex flex-col justify-between gap-2.5 bg-slate-900/20 p-2.5 rounded border border-slate-900 h-full">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                  Módem Robusto (FEC)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempFecEnabled}
                    onChange={(e) => setTempFecEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-slate-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-350 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-600 peer-checked:after:bg-slate-950"></div>
                </label>
              </div>

              <div className="text-[8px] font-mono leading-tight text-slate-500">
                {tempFecEnabled ? (
                  <span className="text-emerald-500 font-bold">● ACTIVO: Codificación Reed-Solomon (FX.25/FEC) con tolerancia de ruido incrementada.</span>
                ) : (
                  <span className="text-red-400">○ AX.25 PURO: Sin envoltura FX.25 ni redundancia de paridad. Mayor susceptibilidad a estática.</span>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-500 text-slate-950 font-sans font-bold text-[10px] py-1.5 px-2 rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all uppercase tracking-wider"
              >
                <Sliders size={12} />
                Calibrar Puerto TNC
              </button>
            </div>

            {/* Control 5: Eco-Transmit Mode & Beacon Timer */}
            <div className="flex flex-col gap-2.5 bg-slate-900/25 p-2.5 rounded border border-slate-900 h-full relative overflow-hidden select-none">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Leaf className="text-emerald-400" size={10} />
                  Modo Eco-Transmit
                </span>
                
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ecoTransmitMode}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setEcoTransmitMode(enabled);
                      localStorage.setItem('cecop_eco_transmit_mode', enabled ? 'true' : 'false');
                      if (showToast) {
                        showToast(enabled ? 'Modo Eco-Transmit activado. Conservando batería de estación.' : 'Modo Eco desactivado. Transmisión a cadencia máxima.');
                      }
                      if (playBuzzerSound) {
                        playBuzzerSound(enabled ? 660 : 440, 0.1, 'sine');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-slate-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-350 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-slate-950"></div>
                </label>
              </div>

              <div className="flex flex-col gap-1 bg-slate-950/60 p-1.5 rounded border border-slate-900 leading-none">
                <div className="flex justify-between items-center text-[7.5px] font-mono text-slate-500">
                  <span>ACTIVIDAD DE SENSORES:</span>
                  {isLowActivity ? (
                    <span className="text-emerald-400 font-bold bg-emerald-950/30 px-1 rounded border border-emerald-900/30">BAJA</span>
                  ) : (
                    <span className="text-amber-400 font-bold bg-amber-950/30 px-1 rounded border border-amber-900/30">ACTIVA</span>
                  )}
                </div>

                <div className="flex justify-between items-center text-[7.5px] font-mono text-slate-550 mt-1">
                  <span>INTERVALO BALIZA:</span>
                  <span className="text-slate-300 font-black">{currentBeaconInterval}s</span>
                </div>

                <div className="flex flex-col gap-1 mt-1 font-mono">
                  <div className="flex justify-between text-[7px]">
                    <span className="text-slate-500">SIGUIENTE TX:</span>
                    <span className="text-orange-400 font-black animate-pulse">{secondsToNextBeacon}s</span>
                  </div>
                  <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${ecoTransmitMode && isLowActivity ? 'bg-emerald-500' : 'bg-orange-500'}`}
                      style={{ width: `${(secondsToNextBeacon / currentBeaconInterval) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="text-[8px] font-mono text-slate-500 leading-snug flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <span>DRENAJE DE CORRIENTE:</span>
                  <span className={ecoTransmitMode && isLowActivity ? 'text-emerald-400 font-bold animate-pulse' : 'text-amber-500 font-bold'}>
                    {ecoTransmitMode && isLowActivity ? '15% (Ahorro)' : '100% (Normal)'}
                  </span>
                </div>
                <p className="text-[7.5px] text-slate-600 leading-none font-sans mt-0.5">
                  {ecoTransmitMode && isLowActivity ? (
                    "Estación en reposo térmico/solar. Balizas extendidas a 120s al no haber incidentes."
                  ) : ecoTransmitMode ? (
                    "Eco armado. Cadencia en 30s por alertas activas detectadas."
                  ) : (
                    "Cadencia manual constante de 30s sin modulación inteligente de energía."
                  )}
                </p>
              </div>
            </div>
          </form>

          {/* Estado de Configuración Activa del Módem */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-950 text-[9px] font-mono border border-slate-900/80 p-2 rounded">
            <div className="flex flex-col">
              <span className="text-slate-500">DESVIACIÓN ACTUAL:</span>
              <span className="text-slate-300 font-bold">{tncDeviation.toFixed(1)} kHz</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">TIMEOUT ACTUAL (RETRY):</span>
              <span className="text-slate-300 font-bold">{tncRetryTimeout}s</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">TXDELAY ESTABLECIDO:</span>
              <span className="text-slate-300 font-bold">{tncTxDelay} ms</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">VERSIÓN DE PROTOCOLO:</span>
              <span className="text-orange-400 font-black">{tncFecEnabled ? 'FX.25 (FEC / Robust)' : 'AX.25 UI-FRAME Only'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500">AHORRO ENERGÉTICO ECO:</span>
              <span className={`font-black uppercase flex items-center gap-1 ${ecoTransmitMode ? 'text-emerald-400' : 'text-slate-500'}`}>
                {ecoTransmitMode ? (
                  <>
                    <Leaf size={8} />
                    {isLowActivity ? 'ACTIVO (-85%)' : 'ESPERA (30s)'}
                  </>
                ) : (
                  'DESACTIVADO'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* CONFIGURACIÓN DE PERFILES DE ALERTA */}
        <div className="bg-slate-950/65 border border-slate-850 p-4 rounded-lg flex flex-col gap-4">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <Layers className="text-orange-400 text-amber-500" size={13} />
              <div className="flex flex-col">
                <span className="text-[11px] font-sans font-bold text-slate-300">
                  Configuración de Perfiles de Alerta y Directivas del Pilar
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Defina y aplique combinaciones preestablecidas de severidad de riesgo y modulación TNC para automatizar los protocolos de emisión.
                </span>
              </div>
            </div>
            {activeProfileId && (
              <div className="flex items-center gap-1.5 font-mono text-[8px]">
                <span className="text-orange-500 font-bold animate-pulse">● PERFIL ACTIVO</span>
                <button 
                  onClick={handleDeactivateProfile}
                  type="button"
                  className="bg-red-950/60 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded font-sans font-bold cursor-pointer hover:bg-red-900/30 transition-all"
                >
                  Modo Manual
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Creador de Perfiles */}
            <form onSubmit={handleCreateProfile} className="lg:col-span-1 flex flex-col gap-2.5 bg-slate-900/20 p-3 rounded border border-slate-900 h-fit">
              <span className="text-[9.5px] uppercase font-bold text-slate-300 font-sans tracking-wider">
                Definir Nueva Directiva / Perfil
              </span>

              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-mono text-slate-500">Nombre del Perfil</label>
                <input
                  type="text"
                  placeholder="ej. Sismo Mayor + Tsunami..."
                  value={newProfName}
                  onChange={(e) => setNewProfName(e.target.value)}
                  className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[11px] px-2 py-1.5 rounded outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Severidad de Riesgo</label>
                  <select
                    value={newProfSeverity}
                    onChange={(e) => setNewProfSeverity(e.target.value as any)}
                    className="bg-slate-950 border border-slate-850 text-slate-250 text-[10.5px] px-2 py-1.5 rounded outline-none cursor-pointer"
                  >
                    <option value="CRÍTICO">🚨 CRÍTICO</option>
                    <option value="ALTO">⚠️ ALTO</option>
                    <option value="MEDIO">⚡ MEDIO</option>
                    <option value="VIGILANCIA">💚 VIGILANCIA</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Canal Frecuencia Destino</label>
                  <select
                    value={newProfFreqName}
                    onChange={(e) => setNewProfFreqName(e.target.value)}
                    className="bg-slate-950 border border-slate-850 text-slate-250 text-[10.5px] px-2 py-1.5 rounded outline-none cursor-pointer"
                  >
                    <option value="144.800 MHz">144.800 MHz (SOS)</option>
                    <option value="145.500 MHz">145.500 MHz (REMER)</option>
                    <option value="145.825 MHz">145.825 MHz (Telemetría)</option>
                    <option value="430.825 MHz">430.825 MHz (Alertas UHF)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 bg-slate-950/40 p-2 rounded border border-slate-900">
                <span className="text-[7.5px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Filtros de Disparo</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  <label className="flex items-center gap-1.5 text-[9.5px] text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newProfSismo}
                      onChange={(e) => setNewProfSismo(e.target.checked)}
                      className="w-3 h-3 rounded border-slate-850 bg-slate-950 text-orange-505 focus:ring-0 cursor-pointer"
                    />
                    <span>Alerta Sísmica</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[9.5px] text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newProfMeteo}
                      onChange={(e) => setNewProfMeteo(e.target.checked)}
                      className="w-3 h-3 rounded border-slate-850 bg-slate-950 text-orange-505 focus:ring-0 cursor-pointer"
                    />
                    <span>Meteorológica</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[9.5px] text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newProfTsunami}
                      onChange={(e) => setNewProfTsunami(e.target.checked)}
                      className="w-3 h-3 rounded border-slate-850 bg-slate-950 text-orange-505 focus:ring-0 cursor-pointer"
                    />
                    <span>Tsunami</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-2 rounded border border-slate-900">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-mono text-slate-500">Desviación TNC Preset</label>
                  <input
                    type="number"
                    min="1.0"
                    max="5.0"
                    step="0.1"
                    value={newProfDeviation}
                    onChange={(e) => setNewProfDeviation(parseFloat(e.target.value) || 2.2)}
                    className="bg-slate-950 border border-slate-850 focus:border-slate-700 text-slate-250 text-[10.5px] px-2 py-1 rounded outline-none font-mono"
                  />
                </div>

                <div className="flex flex-col justify-end pb-1.5">
                  <label className="flex items-center gap-1.5 text-[9.5px] text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newProfFec}
                      onChange={(e) => setNewProfFec(e.target.checked)}
                      className="w-3 h-3 rounded border-slate-850 bg-slate-950 text-orange-505 focus:ring-0 cursor-pointer"
                    />
                    <span className="font-mono text-[8.5px]">Activar FEC (Robust)</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-1">
                <label className="flex items-center gap-1.5 text-[9.5px] text-slate-350 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newProfAutoForward}
                    onChange={(e) => setNewProfAutoForward(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-850 bg-slate-950 text-orange-505 focus:ring-0 cursor-pointer"
                  />
                  <div className="flex flex-col leading-none">
                    <span className="font-sans font-bold text-[9px] text-slate-300">Reenvío Auto. APRS</span>
                    <span className="text-[7.5px] text-slate-500">Emitir al detectar coincidencia</span>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="mt-1 bg-orange-600 hover:bg-orange-500 text-slate-950 font-sans font-bold text-[10px] py-1.5 rounded flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                <Plus size={11} />
                Guardar Perfil Táctico
              </button>
            </form>

            {/* Listado de Perfiles Programados */}
            <div className="lg:col-span-2 flex flex-col gap-2">
              <span className="text-[9.5px] uppercase font-bold text-slate-400 font-sans tracking-wider">
                Directivas y Combinaciones Tácticas Disponibles
              </span>

              {alertProfiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded p-4 text-center">
                  <span className="text-[10px] font-mono text-slate-600">No hay perfiles activos. Defina una combinación de severidad.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1">
                  {alertProfiles.map((prof) => {
                    const isSelected = activeProfileId === prof.id;
                    const severityColors = {
                      'CRÍTICO': 'border-red-600/60 text-red-400 bg-red-950/25',
                      'ALTO': 'border-amber-600/60 text-amber-400 bg-amber-950/20',
                      'MEDIO': 'border-yellow-600/55 text-yellow-405 bg-yellow-950/15',
                      'VIGILANCIA': 'border-emerald-600/60 text-emerald-400 bg-emerald-950/20'
                    };

                    return (
                      <div
                        key={prof.id}
                        onClick={() => handleApplyProfile(prof)}
                        className={`p-2.5 rounded-lg border flex flex-col gap-2 cursor-pointer transition-all relative ${
                          isSelected
                            ? 'bg-slate-900 border-orange-500/80 shadow-[0_0_12px_rgba(249,115,22,0.1)]'
                            : 'bg-slate-950/50 border-slate-900 hover:border-slate-800'
                        }`}
                      >
                        {/* Title and severity badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0 leading-tight">
                            <span className="text-[11px] font-sans font-bold text-slate-200 truncate pr-4">
                              {prof.name}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 mt-0.5">
                              EMISIÓN EN: {prof.targetFrequencyName}
                            </span>
                          </div>

                          <span className={`text-[7.5px] font-mono font-black border uppercase px-1.5 py-0.5 rounded leading-none shrink-0 ${
                            severityColors[prof.severity] || 'border-slate-800 text-slate-400 bg-slate-900/40'
                          }`}>
                            {prof.severity}
                          </span>
                        </div>

                        {/* Presets and conditions */}
                        <div className="grid grid-cols-2 gap-1.5 text-[8.5px] font-mono border-t border-slate-900/65 pt-1.5">
                          <div className="flex flex-col gap-0.5 text-slate-400">
                            <span className="text-slate-600 text-[7px] uppercase">COBERTURA</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {prof.includeSismo && <span className="bg-orange-950/30 text-orange-400 px-1 rounded text-[7.5px] border border-orange-900/30">SISMO</span>}
                              {prof.includeMeteo && <span className="bg-blue-950/30 text-blue-400 px-1 rounded text-[7.5px] border border-blue-900/30">CLIMA</span>}
                              {prof.includeTsunami && <span className="bg-cyan-950/30 text-cyan-400 px-1 rounded text-[7.5px] border border-cyan-900/30">TSUNAMI</span>}
                              {!prof.includeSismo && !prof.includeMeteo && !prof.includeTsunami && <span className="text-slate-600 text-[6.5px]">MANUAL</span>}
                            </div>
                          </div>

                          <div className="flex flex-col gap-0.5 text-slate-450">
                            <span className="text-slate-600 text-[7px] uppercase">AJUSTES TNC</span>
                            <span className="text-slate-300 text-[8px] mt-0.5">
                              MODEM: <strong className="text-orange-400">{prof.deviationPreset} kHz</strong>
                            </span>
                          </div>
                        </div>

                        {/* Flow directy logic */}
                        <div className="flex items-center justify-between text-[8px] font-mono pt-1 text-slate-500 border-t border-slate-900/30">
                          <span>
                            AUTOFORWARD: {prof.autoForward ? <span className="text-emerald-400 font-bold">ACTIVO</span> : <span className="text-slate-600">INACTIVO</span>}
                          </span>
                          
                          <div className="flex items-center gap-1.5">
                            {isSelected && (
                              <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-950 text-[7.5px] font-black uppercase px-1 rounded animate-pulse">
                                APLICADO
                              </span>
                            )}
                            
                            <button
                              onClick={(e) => handleDeleteProfile(prof.id, e)}
                              type="button"
                              className="p-1 rounded hover:bg-slate-900 text-slate-600 hover:text-red-400 transition-all cursor-pointer shrink-0"
                              title="Dar de baja perfil"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {aprsPackets.length === 0 ? (
          <div className="text-center py-4 text-slate-500 font-mono text-xs bg-slate-950/40 border border-slate-900 rounded-lg">
            No hay tramas de radio en el búfer de auditoría. Configure y envíe balizas desde el compilador de <strong className="text-orange-400">Pilar IX: Compilador APRS</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aprsPackets.map((pkt) => {
              const handleApprove = () => {
                if (!setAprsPackets) return;
                const updated = aprsPackets.map(p => {
                  if (p.id === pkt.id) {
                    return {
                      ...p,
                      status: 'APROBADO' as const,
                      auditedBy: 'CO-CECOP-01',
                      auditedAt: new Date().toLocaleTimeString(),
                      auditNotes: `Firma digital CECOP validada conforme a la Situación Operativa del PEM.`
                    };
                  }
                  return p;
                });
                setAprsPackets(updated);
                localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

                // Add to operational log in Cecop
                setOperationalLog(prev => [
                  { time: new Date().toLocaleTimeString(), msg: `TRAMA APRS AUTORIZADA: ${pkt.packetString.slice(0, 50)}... Firma realizada por CO-CECOP-01.`, type: 'TRIAGE' },
                  ...prev
                ]);

                if (playBuzzerSound) playBuzzerSound(880, 0.15, 'sine');
                if (showToast) showToast(`Trama APRS [${pkt.id.slice(0, 8)}] APROBADA con firma autorizada.`);
              };

              const handleReject = () => {
                if (!setAprsPackets) return;
                const updated = aprsPackets.map(p => {
                  if (p.id === pkt.id) {
                    return {
                      ...p,
                      status: 'RECHAZADO' as const,
                      auditedBy: 'CO-CECOP-01',
                      auditedAt: new Date().toLocaleTimeString(),
                      auditNotes: `Frenar emisión - parámetros no autorizados por matriz de riesgo.`
                    };
                  }
                  return p;
                });
                setAprsPackets(updated);
                localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

                // Add to operational log
                setOperationalLog(prev => [
                  { time: new Date().toLocaleTimeString(), msg: `TRAMA APRS RECHAZADA: ${pkt.packetString.slice(0, 50)}... Solicitada corrección por CO-CECOP-01.`, type: 'TRIAGE' },
                  ...prev
                ]);

                if (playBuzzerSound) playBuzzerSound(330, 0.25, 'sawtooth');
                if (showToast) showToast(`Trama APRS [${pkt.id.slice(0, 8)}] RECHAZADA.`);
              };

              return (
                <div 
                  key={pkt.id}
                  className={`border rounded-lg p-2.5 flex flex-col justify-between gap-2 md:gap-2.5 relative overflow-hidden transition-all ${
                    pkt.isEmergency ? 'border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.1)] bg-red-950/10' :
                    pkt.status === 'PENDIENTE' ? 'border-amber-500/30 bg-slate-950/80 shadow-[0_0_10px_rgba(245,158,11,0.03)]' :
                    pkt.status === 'APROBADO' ? 'border-emerald-500/20 bg-slate-950/80' :
                    pkt.status === 'RECHAZADO' ? 'border-rose-500/20 bg-slate-950/80' :
                    'border-slate-850 bg-slate-950/80'
                  }`}
                >
                  <div className="flex flex-col gap-1 font-mono text-[10.5px]">
                    <div className="flex justify-between items-center bg-slate-900 px-2 py-0.5 rounded border border-slate-950">
                      <span className="text-slate-400 font-bold max-w-[130px] truncate">{pkt.callsign} ➔ {pkt.destination}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {pkt.isEmergency && (
                          <span className="bg-red-600/40 text-red-200 border border-red-500/40 text-[7px] font-mono px-1 rounded font-black uppercase tracking-wider animate-pulse">
                            EMERGENCIA
                          </span>
                        )}
                        <span className={`text-[8.5px] font-bold ${
                          pkt.status === 'PENDIENTE' ? 'text-amber-400 animate-pulse' :
                          pkt.status === 'APROBADO' ? 'text-emerald-400' :
                          pkt.status === 'RECHAZADO' ? 'text-rose-400' :
                          'text-sky-400'
                        }`}>{pkt.status}</span>
                      </div>
                    </div>
 
                    <div className="text-[10px] text-slate-50 relative mt-1 leading-normal">
                      <div className="text-slate-500 text-[10px] leading-tight flex flex-wrap gap-1">
                        <strong>Evento:</strong>
                        <span className="truncate max-w-[160px] font-bold text-slate-350">{pkt.originalTitle}</span>
                      </div>
                    </div>
 
                    <div className="bg-slate-900/50 p-1.5 rounded border border-slate-950/80 text-[10px] text-orange-400 break-all leading-relaxed mt-1">
                      {pkt.packetString}
                    </div>

                    {/* MOSTRAR DESTINATARIOS PARA REENVÍO SI ES DE EMERGENCIA */}
                    {pkt.isEmergency && (
                      <div className="bg-slate-900/30 border border-slate-900/40 p-1.5 rounded text-[9px] font-mono mt-0.5 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-orange-400 font-semibold uppercase text-[8px]">🎯 Destinatarios Predefinidos:</span>
                          <span className="text-slate-550 text-[7.5px] uppercase">Frecuencia VHF</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {alertRecipients.filter(r => r.isActive).length === 0 ? (
                            <span className="text-slate-600 italic">No hay destinatarios activos en el sistema.</span>
                          ) : (
                            alertRecipients
                              .filter(r => r.isActive)
                              .map(r => (
                                <span key={r.id} className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[8px] text-slate-300 font-bold">
                                  {r.callsign} <span className="text-slate-500 font-normal">({r.stationName.slice(0, 10)}...)</span>
                                </span>
                              ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
 
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-900/40">
                    {pkt.status === 'PENDIENTE' ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleReject}
                          className="bg-rose-950/40 hover:bg-rose-950/85 border border-rose-500/30 hover:border-rose-400 text-rose-300 font-sans font-bold text-[9.5px] px-2 py-1 rounded flex-1 transition-all cursor-pointer text-center"
                        >
                          RECHAZAR TRÁFICO
                        </button>
                        <button
                          onClick={handleApprove}
                          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-sans font-bold text-[9.5px] px-2 py-1 rounded flex-1 transition-all cursor-pointer text-center shadow shadow-emerald-950/20"
                        >
                          FIRMAR Y APROBAR
                        </button>
                      </div>
                    ) : (
                      <div className="text-[9px] font-mono text-slate-400 flex justify-between items-center bg-slate-900/10 px-1 py-0.5 rounded">
                        <span>Auditado: {pkt.auditedAt || pkt.timestamp}</span>
                        <span className="text-[8px] uppercase tracking-wider font-extrabold text-orange-400">{pkt.auditedBy || 'CO-CECOP-01'}</span>
                      </div>
                    )}

                    {/* BOTÓN OPERACIONAL DE REENVÍO S.A.T. PARA PAQUETES DE EMERGENCIA */}
                    {pkt.isEmergency && (
                      <button
                        onClick={() => handleForwardEmergency(pkt)}
                        className="w-full bg-red-950/50 hover:bg-red-950/80 border border-red-500/40 hover:border-red-400 text-red-200 text-[9px] font-sans font-bold py-1 px-2 rounded flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Send size={10} className="text-red-400 animate-pulse" />
                        REENVIAR ALERTA (AX.25 DIGI)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN REGISTRO DE EMERGENCIAS RECIENTES (PERSISTENTE PARA AUDITORÍA POST-INCIDENTE) */}
      <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl flex flex-col gap-4">
        
        {/* HEADER CON BOTONES DE ACCIÓN */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-850/60 gap-3">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono font-black bg-indigo-500/10 text-indigo-400 border border-indigo-550/30 px-2 py-0.5 rounded uppercase self-start mb-1 tracking-wider">
              Auditoría PEM & Protección Civil
            </span>
            <h2 className="text-sm font-sans font-black text-white flex items-center gap-1.5 uppercase">
              <Database size={15} className="text-indigo-400" />
              Log de Emergencias Recientes (Persistencia Local)
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">
              Registros históricos persistentes para auditorías post-incidente, analítica de tiempos de respuesta y resúmenes de operaciones.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleCompactMode}
              className={`px-2.5 py-1.5 border text-[10px] font-sans font-bold rounded cursor-pointer transition-all flex items-center gap-1 shadow ${
                isCompactMode 
                  ? 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40' 
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Alternar entre vista compacta y detallada"
            >
              <LayoutList size={12} />
              VISTA {isCompactMode ? 'COMPACTA' : 'DETALLADA'}
            </button>
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="px-2.5 py-1.5 bg-indigo-650 hover:bg-indigo-550 border border-indigo-650 text-[10px] text-white font-sans font-bold rounded cursor-pointer transition-all flex items-center gap-1.5 shadow"
            >
              <Plus size={12} />
              REGISTRAR INFORME MANUAL
            </button>
            <button
              onClick={handleExportJSON}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[10px] text-slate-300 font-sans font-semibold rounded cursor-pointer transition-all flex items-center gap-1.5"
              title="Exportar registro completo en formato JSON"
            >
              <Download size={12} className="text-slate-400" />
              JSON
            </button>
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-[10px] text-slate-300 font-sans font-semibold rounded cursor-pointer transition-all flex items-center gap-1.5"
              title="Exportar registro en formato CSV para Excel/D3"
            >
              <FileSpreadsheet size={12} className="text-emerald-400" />
              CSV
            </button>
            {recentEmergencies.length > 0 && (
              <button
                onClick={handleClearAllLogs}
                className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900 text-[10px] text-rose-300 font-sans font-semibold rounded cursor-pointer transition-all flex items-center gap-1.5"
                title="Limpiar base de datos local de incidentes"
              >
                <Trash2 size={12} className="text-rose-400" />
                LIMPIAR TODO
              </button>
            )}
          </div>
        </div>

        {/* COMPONENTE FORMULARIO MANUAL DESPLEGABLE */}
        {showManualForm && (
          <form onSubmit={handleAddManualEmergency} className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex flex-col gap-3 font-sans text-xs">
            <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
              <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wide flex items-center gap-1">
                <ShieldAlert size={12} className="text-indigo-400" />
                Registrar Evento de Emergencia en Log Histórico
              </span>
              <button 
                type="button" 
                onClick={() => setShowManualForm(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">Título del Incidente *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Incendio de Interfaz Urbano-Forestal en Moguer"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-3 flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">Tipo/Ámbito *</label>
                <select
                  value={manualType}
                  onChange={e => setManualType(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Sísmica">Sísmica (IGN)</option>
                  <option value="Radiológica">Radiológica (CSN)</option>
                  <option value="Meteorológica">Meteorológica (AEMET)</option>
                  <option value="ICA">Calidad Aire (ICA)</option>
                  <option value="Incendios">Incendio Forestal</option>
                </select>
              </div>

              <div className="md:col-span-3 flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">Severidad de Alerta</label>
                <select
                  value={manualSeverity}
                  onChange={e => setManualSeverity(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Moderada">Moderada (Preventivo)</option>
                  <option value="Alta">Alta (Acción Requerida)</option>
                  <option value="Crítica">Crítica (Riesgo Vital)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8 flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">Descripción de Hechos e Impacto *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Escriba aquí los detalles iniciales reportados (Ej. Foco forestal activo con afectación a 2 hectáreas, viento fuerte racheado...)"
                  value={manualDescription}
                  onChange={e => setManualDescription(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="md:col-span-4 flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">Notas Iniciales de Auditoría</label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionales de control (Ej. Activado protocolo Remer, bomberos movilizados...)"
                  value={manualNotes}
                  onChange={e => setManualNotes(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-1 border-t border-slate-900 pt-2.5">
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded text-[10px] font-bold cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-650 hover:bg-indigo-550 text-white rounded text-[10px] font-bold cursor-pointer"
              >
                REGISTRAR SUCESO
              </button>
            </div>
          </form>
        )}

        {/* BARRA DE FILTRADO, BÚSQUEDA Y CONTROL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-950/30 p-2.5 rounded-lg border border-slate-850/60 items-center font-sans">
          
          {/* Campo de búsqueda */}
          <div className="lg:col-span-4 relative">
            <span className="absolute left-2.5 top-2.5 text-slate-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Buscar por término o ID en el histórico..."
              value={emergencySearchQuery}
              onChange={e => setEmergencySearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-850 rounded-md w-full pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Filtro por Ámbito */}
          <div className="lg:col-span-3 flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">Ámbito:</span>
            <select
              value={emergencyFilterType}
              onChange={e => setEmergencyFilterType(e.target.value)}
              className="bg-slate-950 border border-slate-850 rounded px-2 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer w-full"
            >
              <option value="All">Todos los Tipos</option>
              <option value="Sísmica">Sísmica</option>
              <option value="Radiológica">Radiológica</option>
              <option value="Meteorológica">Meteorológica</option>
              <option value="ICA">Calidad Aire (ICA)</option>
              <option value="Incendios">Incendios</option>
            </select>
          </div>

          {/* Filtro por Severidad */}
          <div className="lg:col-span-2.5 flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">Gravedad:</span>
            <select
              value={emergencyFilterSeverity}
              onChange={e => setEmergencyFilterSeverity(e.target.value)}
              className="bg-slate-950 border border-slate-850 rounded px-2 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer w-full"
            >
              <option value="All">Cualquiera</option>
              <option value="Moderada">Moderada</option>
              <option value="Alta">Alta</option>
              <option value="Crítica">Crítica</option>
            </select>
          </div>

          {/* Filtro por Estado */}
          <div className="lg:col-span-2.5 flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">Estado:</span>
            <select
              value={emergencyFilterStatus}
              onChange={e => setEmergencyFilterStatus(e.target.value)}
              className="bg-slate-950 border border-slate-850 rounded px-2 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer w-full"
            >
              <option value="All">Cualquiera</option>
              <option value="Activa">Activa</option>
              <option value="Controlada">Controlada</option>
            </select>
          </div>
        </div>

        {/* LISTADO DE EMERGENCIAS FILTRADAS */}
        <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
          {filteredEmergencies.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-850 rounded-lg text-slate-500 font-mono text-xs bg-slate-950/20">
              No hay registros de incidentes de emergencia que coincidan con los filtros de auditoría activos.
            </div>
          ) : (
            filteredEmergencies.map((item) => {
              // Color schemes according to emergency type
              const typeBadgeStyle = 
                item.type === 'Sísmica' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                item.type === 'Radiológica' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                item.type === 'Meteorológica' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                item.type === 'ICA' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                'bg-red-500/10 text-red-400 border-red-500/20';

              // Severity styles
              const severityBadgeStyle =
                item.severity === 'Crítica' ? 'text-red-400 border-red-500/30 font-black animate-pulse' :
                item.severity === 'Alta' ? 'text-orange-400 border-orange-500/20 font-bold' :
                'text-yellow-400 border-yellow-500/20';

              // Status styles
              const statusBadgeStyle = 
                item.status === 'Activa' 
                  ? 'bg-red-950/50 text-red-300 border-red-500/30' 
                  : 'bg-emerald-950/30 text-emerald-300 border-emerald-500/20';

              const isEditingNotes = editingNotesId === item.id;

              // Determine left indicator bar color and container class based on severity
              let severityBarColor = 'bg-yellow-400';
              let cardBorderClass = 'border-slate-850 hover:border-slate-800 bg-slate-950';
              
              if (item.severity === 'Crítica') {
                severityBarColor = 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]';
                cardBorderClass = 'border-red-900/40 hover:border-red-900/70 bg-slate-950/90 shadow-[0_0_8px_rgba(239,68,68,0.03)]';
              } else if (item.severity === 'Alta') {
                severityBarColor = 'bg-orange-500';
                cardBorderClass = 'border-orange-900/30 hover:border-orange-900/60 bg-slate-950/95';
              } else if (item.severity === 'Moderada') {
                severityBarColor = 'bg-yellow-500';
                cardBorderClass = 'border-yellow-900/20 hover:border-yellow-900/50 bg-slate-950/95';
              } else {
                severityBarColor = 'bg-yellow-400';
                cardBorderClass = 'border-slate-850 hover:border-slate-800 bg-slate-950';
              }

              return (
                <div 
                  key={item.id} 
                  id={`audit-log-item-${item.id}`}
                  className={`${cardBorderClass} border rounded-lg transition-all flex flex-col font-sans relative overflow-hidden ${
                    isCompactMode ? 'p-1.5 pl-4 gap-1.5' : 'p-3 pl-5 gap-2.5'
                  }`}
                >
                  {/* Lateral Visual Indicator of Severity */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${severityBarColor}`} />
                  
                  {/* Fila Principal */}
                  <div className={`flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-900/50 ${
                    isCompactMode ? 'pb-1' : 'pb-2'
                  }`}>
                    
                    {/* Detalles a la izquierda */}
                    <div className={`flex flex-col ${isCompactMode ? 'gap-1' : 'gap-1.5'}`}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 border rounded uppercase font-extrabold ${typeBadgeStyle}`}>
                          {item.type}
                        </span>
                        <span className={`text-[8.5px] font-mono px-1.5 py-0.5 border rounded uppercase ${severityBadgeStyle}`}>
                          {item.severity}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {item.timestamp}
                        </span>
                        {item.isManual && (
                          <span className="text-[7.5px] font-mono text-indigo-400 bg-indigo-500/5 px-1 rounded uppercase tracking-wider font-bold">
                            Manual
                          </span>
                        )}
                        <span className="text-[8px] font-mono text-slate-600">
                          ID: {item.id}
                        </span>
                      </div>

                      <h3 className={`font-bold text-slate-100 tracking-tight leading-snug ${
                        isCompactMode ? 'text-[11px]' : 'text-xs sm:text-sm'
                      }`}>
                        {item.title}
                      </h3>

                      <p className={`leading-relaxed font-mono ${
                        isCompactMode ? 'text-[9.5px] text-slate-400/90' : 'text-[11px] text-slate-400'
                      }`}>
                        {item.description}
                      </p>
                    </div>

                    {/* Acciones y Estado a la derecha */}
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 self-start">
                      
                      {/* Estado de control */}
                      <button
                        onClick={() => handleToggleStatus(item.id)}
                        className={`text-[9px] font-mono px-2 py-0.5 border rounded cursor-pointer transition-all flex items-center gap-1 uppercase font-bold tracking-wider ${statusBadgeStyle}`}
                        title="Haga clic para cambiar el estado"
                      >
                        {item.status === 'Activa' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />}
                        {item.status}
                      </button>

                      <button
                        onClick={() => handleDeleteLogItem(item.id)}
                        className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Borrar entrada del histórico"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Sección Notas de Auditoría */}
                  <div className={`bg-slate-900/40 rounded border border-slate-900/60 flex flex-col gap-1 text-[11px] ${
                    isCompactMode ? 'p-1.5' : 'p-2.5'
                  }`}>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-1 mb-1">
                      <span>Comentarios / Notas de Auditoría Operativa</span>
                      {!isEditingNotes && (
                        <button
                          onClick={() => handleStartEditingNotes(item.id, item.notes || '')}
                          className="text-indigo-400 hover:text-indigo-300 font-bold transition-all cursor-pointer"
                        >
                          EDITAR NOTAS
                        </button>
                      )}
                    </div>

                    {isEditingNotes ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          rows={2}
                          value={tempNotesValue}
                          onChange={e => setTempNotesValue(e.target.value)}
                          className="bg-slate-950 border border-slate-800 text-[11px] text-slate-200 rounded p-1.5 focus:outline-none focus:border-indigo-500 font-mono resize-none"
                          placeholder="Inserte notas finales de la auditoría o bitácora de intervenciones..."
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingNotesId(null)}
                            className="bg-slate-900 hover:bg-slate-850 text-slate-400 px-2 py-1 rounded text-[9px] font-bold cursor-pointer"
                          >
                            CANCELAR
                          </button>
                          <button
                            onClick={() => handleSaveNotes(item.id)}
                            className="bg-indigo-650 hover:bg-indigo-550 text-white px-2 py-1 rounded text-[9px] font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Check size={10} />
                            GUARDAR
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-355 italic font-mono leading-relaxed">
                        {item.notes || 'Sin anotaciones de auditoría operativa registradas.'}
                      </p>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

      {/* 4. REAL-TIME CECOP LOGGING FEED (FOOTER) */}
      <div className="bg-slate-900/30 border border-slate-850 p-3 rounded-lg flex flex-col gap-2">
        <div className="flex items-center justify-between pb-1 border-b border-slate-850/60">
          <span className="text-[10px] font-mono text-slate-400 font-bold flex items-center gap-1 uppercase">
            <Database size={12} className="text-emerald-400" />
            Canal de Eventos y Comunicados CECOP (Plan Regional)
          </span>
          <span className="text-[8px] text-indigo-400 font-mono tracking-widest font-extrabold uppercase">
            S.A.T. Telemetry Log
          </span>
        </div>

        <div className="flex flex-col gap-1 max-h-[100px] overflow-y-auto pr-1 font-mono text-[10.5px] leading-tight">
          {operationalLog.map((log, index) => {
            const typeColor = 
              log.type === 'ALERT' ? 'text-red-400' :
              log.type === 'TRIAGE' ? 'text-indigo-400' :
              log.type === 'LEVEL' ? 'text-amber-400' :
              log.type === 'DEPT' ? 'text-teal-400' :
              'text-slate-500';

            return (
              <div key={index} className="flex gap-2.5 py-0.5 border-b border-slate-900/30 hover:bg-slate-900/30 px-1.5 rounded transition-all">
                <span className="text-slate-500 shrink-0">[{log.time}]</span>
                <span className={`font-semibold shrink-0 uppercase text-[9px] border px-1 rounded leading-none flex items-center ${typeColor}`}>
                  {log.type}
                </span>
                <span className="text-slate-300 text-wrap">{log.msg}</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
