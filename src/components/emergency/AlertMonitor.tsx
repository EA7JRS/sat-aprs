import React, { useState, useEffect, useMemo } from 'react';
import { AlertOctagon, Activity, Radio, AlertTriangle, Waves, Clock, ShieldCheck, EyeOff, MapPin, Plus, Trash2, Compass, Map, Sliders, Database, Cloud, Volume2, Eye, RefreshCw, FileText, Power } from 'lucide-react';
import { EarthquakeEvent, NoaaSpaceAlert, TsunamiAlert } from '../../types';
import { AprsPacket } from '../radio/AprsAdaptor';
import SOSConfiguration, { DEFAULT_SOS_SETTINGS, SOSSettingsMap } from './SOSConfiguration';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

interface AlertProps {
  earthquakes: EarthquakeEvent[];
  noaaAlerts: NoaaSpaceAlert[];
  tsunamiAlerts?: TsunamiAlert[];
  minMagnitudeVisualAlert?: number; // threshold configured by user
  onRelocate?: (lat: number, lon: number, locationName: string, alt?: number) => any;
  aprsPackets?: AprsPacket[];
  setAprsPackets?: React.Dispatch<React.SetStateAction<AprsPacket[]>>;
  config?: any;
}

interface AttentionNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const DEFAULT_NODES: AttentionNode[] = [
  { id: 'node-1', name: 'Centro Coordinación CECOP Almería', lat: 36.8340, lon: -2.4637 },
  { id: 'node-2', name: 'Base Helitransportada Alhabia', lat: 37.1525, lon: -2.3685 },
  { id: 'node-3', name: 'Faro Cabo de Gata (Vigilancia)', lat: 36.7203, lon: -2.2031 },
  { id: 'node-4', name: 'Base Salvamento Marítimo Motril', lat: 36.7212, lon: -3.5181 }
];

function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Severity weight table for tsunami filtering
const SEVERITY_WEIGHTS: Record<string, number> = {
  'GREEN': 1,
  'ADVISORY': 2,
  'WATCH': 3,
  'WARNING': 4
};

const REGIONS = [
  { id: 'ALL', name: 'Todas las Regiones' },
  { id: 'cantabrico', name: 'Norte / Cantábrico' },
  { id: 'galicia', name: 'Galicia / Noroeste' },
  { id: 'cadiz', name: 'Golfo de Cádiz / Suroeste' },
  { id: 'alboran', name: 'Mar de Alborán / Sur' },
  { id: 'med_sur', name: 'Med. Sur (Murcia/Almería)' },
  { id: 'med_levante', name: 'Med. Levante (Val./Cat.)' },
  { id: 'baleares', name: 'Islas Baleares' },
  { id: 'canarias', name: 'Islas Canarias' },
  { id: 'interior_otros', name: 'Interior / Otros' }
];

function getEventRegion(lat: number, lon: number, locationName: string, title: string = ''): string {
  const loc = (locationName || '').toLowerCase();
  const t = (title || '').toLowerCase();

  // 1. Verificar por texto (muy preciso para nombres geográficos específicos)
  if (loc.includes('canarias') || loc.includes('tenerife') || loc.includes('palma') || loc.includes('hierro') || loc.includes('gomera') || loc.includes('lanzarote') || loc.includes('fuerteventura') || t.includes('canarias')) {
    return 'canarias';
  }
  if (loc.includes('baleares') || loc.includes('mallorca') || loc.includes('menorca') || loc.includes('ibiza') || loc.includes('formentera') || t.includes('baleares') || t.includes('mallorca')) {
    return 'baleares';
  }
  if (loc.includes('alborán') || loc.includes('alboran') || loc.includes('almería') || loc.includes('almeria') || loc.includes('motril') || loc.includes('málaga') || loc.includes('malaga') || loc.includes('granada') || loc.includes('estrecho') || t.includes('alborán') || t.includes('alboran')) {
    return 'alboran';
  }
  if (loc.includes('cádiz') || loc.includes('cadiz') || loc.includes('huelva') || loc.includes('atlántico sur') || loc.includes('atlantico sur') || t.includes('cádiz') || t.includes('cadiz') || t.includes('huelva')) {
    return 'cadiz';
  }
  if (loc.includes('murcia') || loc.includes('cartagena') || loc.includes('alicante') || loc.includes('cabo de gata') || loc.includes('lorca') || t.includes('murcia') || t.includes('cartagena') || t.includes('cabo de gata')) {
    return 'med_sur';
  }
  if (loc.includes('valencia') || loc.includes('barcelona') || loc.includes('tarragona') || loc.includes('gerona') || loc.includes('girona') || loc.includes('levante') || loc.includes('castellón') || loc.includes('castellon') || t.includes('valencia') || t.includes('barcelona') || t.includes('tarragona')) {
    return 'med_levante';
  }
  if (loc.includes('galicia') || loc.includes('vigo') || loc.includes('coruña') || loc.includes('pontevedra') || loc.includes('lugo') || loc.includes('orense') || loc.includes('ourense') || t.includes('galicia')) {
    return 'galicia';
  }
  if (loc.includes('cantábrico') || loc.includes('cantabrico') || loc.includes('gijón') || loc.includes('gijon') || loc.includes('bilbao') || loc.includes('santander') || loc.includes('asturias') || loc.includes('cantabria') || loc.includes('vizcaya') || loc.includes('guipúzcoa') || loc.includes('guipuzcoa') || t.includes('cantábrico') || t.includes('cantabrico')) {
    return 'cantabrico';
  }

  // 2. Fallback por coordenadas geográficas de España
  // Canarias: latitud < 30 y longitud < -13
  if (lat < 30 && lon < -13) {
    return 'canarias';
  }
  // Baleares: latitud entre 38 y 41 y longitud entre 1 y 5.5
  if (lat >= 38 && lat <= 41 && lon >= 1 && lon <= 5.5) {
    return 'baleares';
  }
  // Galicia: latitud > 41.8 y longitud < -6.8
  if (lat > 41.8 && lon < -6.8) {
    return 'galicia';
  }
  // Cantábrico: latitud > 43 y longitud entre -6.8 y -1.5
  if (lat > 43 && lon >= -6.8 && lon <= -1.5) {
    return 'cantabrico';
  }
  // Golfo de Cádiz: latitud entre 35.8 y 37.5 y longitud < -5.5
  if (lat >= 35.8 && lat <= 37.5 && lon < -5.5) {
    return 'cadiz';
  }
  // Mar de Alborán / Andalucía Sur: latitud entre 35 y 37 y longitud entre -5.5 y -1.5
  if (lat >= 35 && lat <= 37 && lon >= -5.5 && lon <= -1.5) {
    return 'alboran';
  }
  // Mediterráneo Sur (Murcia / Alicante / Almería oriental): latitud entre 36.5 y 39 y longitud entre -1.5 y 0.5
  if (lat >= 36.5 && lat <= 39 && lon >= -1.5 && lon <= 0.5) {
    return 'med_sur';
  }
  // Levante (Comunidad Valenciana norte / Cataluña): latitud entre 39 y 43 y longitud entre -1.5 y 3.5
  if (lat >= 39 && lat <= 43 && lon >= -1.5 && lon <= 3.5) {
    return 'med_levante';
  }

  return 'interior_otros';
}

export default function AlertMonitor({ 
  earthquakes, 
  noaaAlerts, 
  tsunamiAlerts = [], 
  minMagnitudeVisualAlert = 3.0,
  onRelocate,
  aprsPackets = [],
  setAprsPackets,
  config
}: AlertProps) {
  const [filterType, setFilterType] = useState<'all' | 'critical'>('all');
  const [severitySelector, setSeveritySelector] = useState<'ALL' | 'ADVISORY' | 'WATCH' | 'WARNING'>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [highActivityMode, setHighActivityMode] = useState<boolean>(false);
  const [minMagnitudeNoise, setMinMagnitudeNoise] = useState<number>(3.0);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tsunamiMinSeverity, setTsunamiMinSeverity] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('alert_monitor_tsunami_min_severity');
      return saved || 'ADVISORY';
    } catch {
      return 'ADVISORY';
    }
  });

  const [soundSettings, setSoundSettings] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('alert_monitor_sound_settings');
      return saved ? JSON.parse(saved) : {
        WARNING: 'siren',
        WATCH: 'pulse',
        ADVISORY: 'continuous'
      };
    } catch {
      return {
        WARNING: 'siren',
        WATCH: 'pulse',
        ADVISORY: 'continuous'
      };
    }
  });

  const [isExtremeContrast, setIsExtremeContrast] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('alert_monitor_extreme_contrast');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const triggerSound = (severity: string, soundType: string) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      let freq = 520;
      if (severity === 'WARNING') freq = 1100;
      else if (severity === 'WATCH') freq = 780;

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const docRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.tsunamiMinSeverity !== undefined && data.tsunamiMinSeverity !== tsunamiMinSeverity) {
          setTsunamiMinSeverity(data.tsunamiMinSeverity);
          localStorage.setItem('alert_monitor_tsunami_min_severity', data.tsunamiMinSeverity);
        }
        if (data.soundSettings !== undefined) {
          setSoundSettings(data.soundSettings);
          localStorage.setItem('alert_monitor_sound_settings', JSON.stringify(data.soundSettings));
        }
      }
    });
    return unsubscribe;
  }, [currentUser]);

  const handleSaveTsunamiMinSeverity = async (val: string) => {
    setTsunamiMinSeverity(val);
    localStorage.setItem('alert_monitor_tsunami_min_severity', val);
    if (currentUser) {
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        await setDoc(docRef, { tsunamiMinSeverity: val }, { merge: true });
      } catch (err) {
        console.error("Error saving tsunami threshold to Firestore:", err);
      }
    }
  };

  const handleSaveSoundSetting = async (severity: string, soundType: string) => {
    const updated = {
      ...soundSettings,
      [severity]: soundType
    };
    setSoundSettings(updated);
    localStorage.setItem('alert_monitor_sound_settings', JSON.stringify(updated));
    if (currentUser) {
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        await setDoc(docRef, { soundSettings: updated }, { merge: true });
      } catch (err) {
        console.error("Error saving sound settings to Firestore:", err);
      }
    }
    triggerSound(severity, soundType);
  };

  const handleToggleExtremeContrast = () => {
    const nextVal = !isExtremeContrast;
    setIsExtremeContrast(nextVal);
    localStorage.setItem('alert_monitor_extreme_contrast', String(nextVal));
  };









  // Attention nodes state
  const [attentionNodes, setAttentionNodes] = useState<AttentionNode[]>(() => {
    try {
      const saved = localStorage.getItem('alert_monitor_attention_nodes');
      return saved ? JSON.parse(saved) : DEFAULT_NODES;
    } catch {
      return DEFAULT_NODES;
    }
  });

  // Form states for creating a new node
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeLat, setNewNodeLat] = useState('');
  const [newNodeLon, setNewNodeLon] = useState('');
  const [nodeFormError, setNodeFormError] = useState<string | null>(null);

  const handleAddNode = (e: React.FormEvent) => {
    e.preventDefault();
    setNodeFormError(null);

    const name = newNodeName.trim();
    const lat = parseFloat(newNodeLat);
    const lon = parseFloat(newNodeLon);

    if (!name) {
      setNodeFormError('El nombre no puede estar vacío');
      return;
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setNodeFormError('Latitud inválida (debe estar entre -90 y 90)');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setNodeFormError('Longitud inválida (debe estar entre -180 y 180)');
      return;
    }

    const newNode: AttentionNode = {
      id: `custom-node-${Date.now()}`,
      name,
      lat,
      lon
    };

    const updated = [...attentionNodes, newNode];
    setAttentionNodes(updated);
    try {
      localStorage.setItem('alert_monitor_attention_nodes', JSON.stringify(updated));
    } catch {}

    setNewNodeName('');
    setNewNodeLat('');
    setNewNodeLon('');
  };

  const handleDeleteNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = attentionNodes.filter(n => n.id !== id);
    setAttentionNodes(updated);
    try {
      localStorage.setItem('alert_monitor_attention_nodes', JSON.stringify(updated));
    } catch {}
    if (activeNodeId === id) {
      setActiveNodeId(null);
    }
  };

  // Helper to find nearest node to a given coordinate
  const getNearestNodeInfo = (lat: number, lon: number) => {
    if (attentionNodes.length === 0) return null;
    let nearestNode = attentionNodes[0];
    let minDistance = getHaversineDistance(lat, lon, nearestNode.lat, nearestNode.lon);

    for (let i = 1; i < attentionNodes.length; i++) {
      const node = attentionNodes[i];
      const dist = getHaversineDistance(lat, lon, node.lat, node.lon);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNode = node;
      }
    }
    return { node: nearestNode, distanceKm: minDistance };
  };

  const [isAutoAck, setIsAutoAck] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('alert_auto_ack_eq');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [showSismoRadii, setShowSismoRadii] = useState<boolean>(true);

  const isTsunamiWarningActive = useMemo(() => {
    return tsunamiAlerts.some(tsu => tsu.severity === 'WARNING');
  }, [tsunamiAlerts]);

  const handleToggleAutoAck = () => {
    const nextVal = !isAutoAck;
    setIsAutoAck(nextVal);
    try {
      localStorage.setItem('alert_auto_ack_eq', JSON.stringify(nextVal));
    } catch {}
  };

  // Earthquakes filter: magnitude >= minMagnitudeVisualAlert OR enRango
  const regionFilteredEarthquakes = selectedRegion === 'ALL'
    ? earthquakes
    : earthquakes.filter(eq => getEventRegion(eq.latitude, eq.longitude, eq.localizacion) === selectedRegion);

  const activityFilteredEarthquakes = highActivityMode
    ? regionFilteredEarthquakes.filter(eq => eq.magnitud >= minMagnitudeNoise)
    : regionFilteredEarthquakes;

  const baseFilteredEarthquakes = filterType === 'all'
    ? activityFilteredEarthquakes
    : activityFilteredEarthquakes.filter(eq => eq.magnitud >= minMagnitudeVisualAlert || eq.enRango);

  const filteredEarthquakes = severitySelector === 'ALL'
    ? baseFilteredEarthquakes
    : baseFilteredEarthquakes.filter(eq => {
        const hasVisualAlert = eq.magnitud >= minMagnitudeVisualAlert;
        const sev = hasVisualAlert ? 'WARNING' : eq.enRango ? 'WATCH' : 'ADVISORY';
        return sev === severitySelector;
      });

  // Filter out non-critical earthquakes (magnitude < 2.5) from active alerts feed if Auto-Ack is enabled
  const activeEarthquakes = isAutoAck
    ? filteredEarthquakes.filter(eq => eq.magnitud >= 2.5)
    : filteredEarthquakes;

  const suppressedCount = filteredEarthquakes.filter(eq => eq.magnitud < 2.5).length;

  // Tsunamis filter: warning, watch or advisory (any non-GREEN or non-minor alert)
  const regionFilteredTsunamis = selectedRegion === 'ALL'
    ? tsunamiAlerts
    : tsunamiAlerts.filter(tsu => getEventRegion(tsu.coordinates[0], tsu.coordinates[1], tsu.location, tsu.title) === selectedRegion);

  const activityFilteredTsunamis = highActivityMode
    ? regionFilteredTsunamis.filter(tsu => tsu.severity !== 'ADVISORY' && tsu.severity !== 'GREEN')
    : regionFilteredTsunamis;

  const severityThresholdWeight = SEVERITY_WEIGHTS[tsunamiMinSeverity] || 2; // Default to ADVISORY
  const thresholdFilteredTsunamis = activityFilteredTsunamis.filter(tsu => {
    const w = SEVERITY_WEIGHTS[tsu.severity] || 1;
    return w >= severityThresholdWeight;
  });

  const baseFilteredTsunamis = filterType === 'all'
    ? thresholdFilteredTsunamis
    : thresholdFilteredTsunamis.filter(tsu => tsu.severity === 'WARNING' || tsu.severity === 'WATCH' || tsu.severity === 'ADVISORY');

  const filteredTsunamis = severitySelector === 'ALL'
    ? baseFilteredTsunamis
    : baseFilteredTsunamis.filter(tsu => tsu.severity === severitySelector);

  // Geographic mapping to sectors for the Spain Coastal Risk Map
  const getSectorStatus = (sectorId: string) => {
    const rawMatchingAlerts = filteredTsunamis.filter(tsu => {
      const loc = (tsu.location || '').toLowerCase();
      const title = (tsu.title || '').toLowerCase();
      
      if (sectorId === 'alboran') {
        return loc.includes('alborán') || loc.includes('alboran') || loc.includes('almería') || loc.includes('almeria') || loc.includes('motril') || loc.includes('málaga') || loc.includes('malaga') || title.includes('alborán') || title.includes('alboran');
      }
      if (sectorId === 'cadiz') {
        return loc.includes('cádiz') || loc.includes('cadiz') || loc.includes('huelva') || loc.includes('atlántico sur') || loc.includes('atlantico sur') || title.includes('cádiz') || title.includes('cadiz') || title.includes('huelva');
      }
      if (sectorId === 'med_sur') {
        return loc.includes('murcia') || loc.includes('cartagena') || loc.includes('alicante') || loc.includes('cabo de gata') || title.includes('murcia') || title.includes('cartagena') || title.includes('cabo de gata');
      }
      if (sectorId === 'med_levante') {
        return loc.includes('valencia') || loc.includes('barcelona') || loc.includes('tarragona') || loc.includes('gerona') || loc.includes('girona') || loc.includes('levante') || title.includes('valencia') || title.includes('barcelona') || title.includes('tarragona');
      }
      if (sectorId === 'baleares') {
        return loc.includes('baleares') || loc.includes('mallorca') || loc.includes('menorca') || loc.includes('ibiza') || title.includes('baleares') || title.includes('mallorca');
      }
      if (sectorId === 'canarias') {
        return loc.includes('canarias') || loc.includes('tenerife') || loc.includes('las palmas') || title.includes('canarias');
      }
      if (sectorId === 'galicia') {
        return loc.includes('galicia') || loc.includes('vigo') || loc.includes('coruña') || title.includes('galicia');
      }
      if (sectorId === 'cantabrico') {
        return loc.includes('cantábrico') || loc.includes('cantabrico') || loc.includes('gijón') || loc.includes('bilbao') || loc.includes('santander') || title.includes('cantábrico') || title.includes('cantabrico');
      }
      return false;
    });

    // Smart prioritization: Ignore ADVISORY alerts if a Tsunami WARNING is active to reduce operator fatigue
    const matchingAlerts = isTsunamiWarningActive
      ? rawMatchingAlerts.filter(tsu => tsu.severity !== 'ADVISORY')
      : rawMatchingAlerts;

    if (matchingAlerts.length === 0) return { active: false, severity: 'GREEN', alerts: [] };

    let highestSeverity = 'GREEN';
    for (const a of matchingAlerts) {
      if (a.severity === 'WARNING') highestSeverity = 'WARNING';
      else if (a.severity === 'WATCH' && highestSeverity !== 'WARNING') highestSeverity = 'WATCH';
      else if (a.severity === 'ADVISORY' && highestSeverity !== 'WARNING' && highestSeverity !== 'WATCH') highestSeverity = 'ADVISORY';
    }

    return { active: true, severity: highestSeverity, alerts: matchingAlerts };
  };

  const getSectorStyles = (sectorId: string) => {
    const status = getSectorStatus(sectorId);
    if (!status.active) {
      return {
        stroke: '#1e293b', // slate-800
        strokeWidth: 3,
        className: 'transition-all duration-300 hover:stroke-slate-500 cursor-pointer',
        filter: 'none'
      };
    }
    
    switch (status.severity) {
      case 'WARNING':
        return {
          stroke: '#ef4444', // red-500
          strokeWidth: 5,
          className: 'animate-pulse cursor-pointer stroke-red-500',
          filter: 'drop-shadow(0 0 3px #ef4444)'
        };
      case 'WATCH':
        return {
          stroke: '#f97316', // orange-500
          strokeWidth: 4.5,
          className: 'animate-pulse cursor-pointer stroke-orange-500',
          filter: 'drop-shadow(0 0 2px #f97316)'
        };
      case 'ADVISORY':
        return {
          stroke: '#eab308', // yellow-500
          strokeWidth: 4,
          className: 'animate-pulse cursor-pointer stroke-yellow-500',
          filter: 'drop-shadow(0 0 1px #eab308)'
        };
      default:
        return {
          stroke: '#06b6d4', // cyan-500
          strokeWidth: 3,
          className: 'cursor-pointer stroke-cyan-500',
          filter: 'none'
        };
    }
  };

  // Convert lat/lon coordinates to 320x180 map coords for plotting epicenters
  const getMapCoordinates = (lat: number, lon: number) => {
    const minLon = -10.5;
    const maxLon = 4.5;
    const x = 20 + ((lon - minLon) / (maxLon - minLon)) * 280;
    
    const minLat = 34.0;
    const maxLat = 44.5;
    const y = 160 - ((lat - minLat) / (maxLat - minLat)) * 140;
    
    return { x, y };
  };

  // NOAA Alerts filter: nivel >= 4 (high radiation or storm level)
  const activityFilteredNoaa = highActivityMode
    ? noaaAlerts.filter(alert => alert.nivel >= 3)
    : noaaAlerts;

  const baseFilteredNoaa = filterType === 'all'
    ? activityFilteredNoaa
    : activityFilteredNoaa.filter(alert => alert.nivel >= 4);

  const filteredNoaa = severitySelector === 'ALL'
    ? baseFilteredNoaa
    : baseFilteredNoaa.filter(alert => {
        const sev = alert.nivel >= 4 ? 'WARNING' : alert.nivel === 3 ? 'WATCH' : 'ADVISORY';
        return sev === severitySelector;
      });
  
  // Check if there are any earthquakes in immediate crisis range (250km or less)
  const rangeSismos = activeEarthquakes.filter(e => e.enRango);

  return (
    <div className="flex flex-col gap-4 font-mono w-full" id="alert-monitor-component">
      
      {/* SYSTEM STANDBY WARNING BANNER */}
      {config?.systemPower === false && (
        <div className="bg-red-950/25 border border-red-500/30 rounded-xl p-6 text-center shadow-lg relative overflow-hidden" id="system-standby-banner">
          <div className="absolute inset-0 bg-red-900/5 animate-pulse pointer-events-none"></div>
          <Power className="mx-auto text-red-500 animate-pulse mb-3" size={32} />
          <h3 className="font-bold text-base text-slate-100 tracking-wider">ESTACIÓN GENERAL EN MODO STANDBY (APAGADO)</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-xl mx-auto leading-relaxed font-sans">
            El sismógrafo IGN, la vigilancia de tsunamis y la baliza APRS de telemetría se encuentran en suspenso.
            No se están registrando eventos en la base de datos de la NUC ni se transmiten beacons. Use el interruptor <span className="font-bold text-emerald-400">"Estación: ON"</span> en el encabezado superior para reanudar el monitoreo.
          </p>
        </div>
      )}

      {/* REAL-TIME FILTER CONTROL BAR */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-xs tracking-tight shadow-lg" id="filter-control-panel">
        
        {/* Fila 1: Filtros de Selección Activa */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={`w-2 h-2 rounded-full ${filterType === 'critical' ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></span>
              <span className="text-slate-400 font-bold uppercase">Consola de Filtrado:</span>
            </div>

            {/* Selector de Severidad */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg">
              <span className="text-[10px] uppercase text-slate-500 font-bold">Gravedad:</span>
              <select
                value={severitySelector}
                onChange={(e) => setSeveritySelector(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-[10.5px] font-mono font-bold rounded px-2 py-0.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                id="severity-filter-select"
              >
                <option value="ALL">[TODAS LAS GRAVEDADES]</option>
                <option value="ADVISORY">🟢 ADVISORY (Aviso)</option>
                <option value="WATCH">🟡 WATCH (Vigilancia)</option>
                <option value="WARNING">🔴 WARNING (Alerta Máxima)</option>
              </select>
            </div>

            {/* Selector de Región Española */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg">
              <span className="text-[10px] uppercase text-slate-500 font-bold">Región (IGN/Costas):</span>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-[10.5px] font-mono font-bold rounded px-2 py-0.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                id="region-filter-select"
              >
                {REGIONS.map(reg => (
                  <option key={reg.id} value={reg.id}>{reg.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de tipo (Todos vs Solo Críticos) */}
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg gap-1.5 self-stretch lg:self-auto justify-center">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded text-[10.5px] font-bold uppercase transition-all tracking-wide cursor-pointer select-none ${
                filterType === 'all'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({earthquakes.length + tsunamiAlerts.length + noaaAlerts.length})
            </button>
            <button
              onClick={() => setFilterType('critical')}
              className={`px-3 py-1.5 rounded text-[10.5px] font-bold uppercase transition-all tracking-wide flex items-center gap-1.5 cursor-pointer select-none ${
                filterType === 'critical'
                  ? 'bg-red-950/80 text-rose-400 border border-red-900/40'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              <AlertTriangle size={12} className={filterType === 'critical' ? 'animate-bounce text-rose-400' : ''} />
              Solo Críticos ({filteredEarthquakes.length + filteredTsunamis.length + filteredNoaa.length})
            </button>
          </div>
        </div>

        {/* Fila 2: Mitigación de Ruido en Alta Actividad */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-slate-400 text-[11px] bg-slate-950/40">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-900/40 px-2.5 py-1 rounded border border-slate-800">
              <span className="font-bold text-slate-300">Modo de Alta Actividad (Filtro de Ruido):</span>
              <button
                type="button"
                onClick={() => setHighActivityMode(!highActivityMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  highActivityMode ? 'bg-amber-600' : 'bg-slate-800'
                }`}
                id="high-activity-mode-toggle"
                title="Activa el filtro de ruido para ocultar alertas secundarias en situaciones de crisis"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    highActivityMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {highActivityMode && (
              <div className="flex items-center gap-2 animate-pulse bg-amber-950/25 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[10px]">
                <span>⚠️ Ocultando Sismos M &lt; {minMagnitudeNoise.toFixed(1)}, Tsunamis ADVISORY y Alertas NOAA Menores</span>
              </div>
            )}
          </div>

          {highActivityMode && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase">Ruido Sísmico Mínimo:</span>
              <div className="flex items-center gap-1">
                {[2.5, 3.0, 3.5, 4.0].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMinMagnitudeNoise(val)}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold cursor-pointer ${
                      minMagnitudeNoise === val
                        ? 'bg-amber-950 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-900 text-slate-500 border border-slate-850 hover:text-slate-350'
                    }`}
                  >
                    M{val.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN: NODOS DE ATENCIÓN PERSONALIZADOS */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-900 pb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="text-emerald-400 animate-pulse stroke-[1.5]" size={18} />
            <div>
              <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-slate-100">Nodos de Atención de Emergencias</h2>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                Vigila puntos e infraestructuras críticas y calcula distancias automáticas a eventos de riesgo.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-bold px-2 py-0.5 rounded font-mono uppercase self-start md:self-auto shrink-0">
            {attentionNodes.length} Nodos Activos
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* LISTA DE NODOS (Col-span 7) */}
          <div className="xl:col-span-7 flex flex-col gap-2">
            <div className="text-[10px] text-slate-450 uppercase font-bold tracking-wider mb-1">Puntos de Vigilancia Activa</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
              {attentionNodes.map((node) => {
                const isActive = activeNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => {
                      setActiveNodeId(node.id);
                      if (onRelocate) {
                        onRelocate(node.lat, node.lon, `Nodo: ${node.name}`);
                      }
                    }}
                    className={`p-2.5 rounded-lg border text-xs font-mono transition-all duration-200 cursor-pointer flex items-center justify-between gap-2 relative overflow-hidden ${
                      isActive 
                        ? 'bg-emerald-950/40 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20' 
                        : 'bg-slate-900/40 border-slate-900 hover:border-slate-700 hover:bg-slate-900/80'
                    }`}
                    title="Haz clic para centrar el mapa en este nodo de atención"
                  >
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                    )}
                    <div className="min-w-0 flex-1 pl-1">
                      <div className="font-sans font-bold text-slate-200 truncate" title={node.name}>
                        {node.name}
                      </div>
                      <div className="text-[9px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Compass size={10} className="text-slate-600" />
                        <span>Lat: {node.lat.toFixed(4)} • Lon: {node.lon.toFixed(4)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[8px] bg-slate-950 text-slate-450 px-1 py-0.5 rounded font-mono opacity-60">
                        🗺️ Centrar
                      </span>
                      <button
                        onClick={(e) => handleDeleteNode(node.id, e)}
                        className="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-slate-950 transition-colors"
                        title="Eliminar este nodo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {attentionNodes.length === 0 && (
                <div className="col-span-2 text-center py-6 text-xs text-slate-600 italic font-sans">
                  No hay nodos de atención definidos. Añada un punto de infraestructura crítica.
                </div>
              )}
            </div>
          </div>

          {/* FORMULARIO DE AÑADIR NODO (Col-span 5) */}
          <form onSubmit={handleAddNode} className="xl:col-span-5 bg-slate-900/30 border border-slate-900/60 p-3 rounded-xl flex flex-col gap-2">
            <div className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Registrar Nuevo Punto Crítico</div>
            
            <div className="grid grid-cols-1 gap-2">
              <input
                type="text"
                placeholder="Nombre del punto (ej. Hospital Heliopuerto)"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                className="bg-black/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 font-sans"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Latitud (ej. 36.8400)"
                  value={newNodeLat}
                  onChange={(e) => setNewNodeLat(e.target.value)}
                  className="bg-black/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
                <input
                  type="text"
                  placeholder="Longitud (ej. -2.4500)"
                  value={newNodeLon}
                  onChange={(e) => setNewNodeLon(e.target.value)}
                  className="bg-black/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {nodeFormError && (
              <div className="text-[9px] text-rose-400 font-sans">{nodeFormError}</div>
            )}

            <button
              type="submit"
              className="mt-1 bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-500/40 hover:border-emerald-500/60 text-emerald-400 font-sans font-bold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all duration-200"
            >
              <Plus size={13} />
              <span>Guardar Nodo de Atención</span>
            </button>
          </form>
        </div>
      </div>

      {/* SECCIÓN: AJUSTES DE OPERACIÓN - PERSONALIZACIÓN DE AUDIO Y CONTRASTE */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-900 pb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="text-yellow-500 animate-pulse stroke-[1.5]" size={18} />
            <div>
              <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-slate-100">Consola de Operación: Audio y Contraste</h2>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                Personaliza las síntesis de sonido de alarma de emergencia por severidad y gestiona la visibilidad con contraste extremo.
              </p>
            </div>
          </div>
          {currentUser && (
            <div className="flex items-center gap-1.5 text-[10px] bg-blue-950/40 border border-blue-500/20 text-blue-400 font-mono px-2 py-0.5 rounded">
              <Database size={10} />
              <span>Sincronizado con la nube</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PERSONALIZACIÓN DE AUDIO (Col 1) */}
          <div className="bg-slate-900/20 border border-slate-900/60 p-3 rounded-xl flex flex-col gap-2.5">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Volume2 size={12} className="text-blue-400" />
              <span>Síntesis de Alerta Acústica</span>
            </div>
            
            <div className="space-y-2">
              {/* WARNING */}
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/30 border border-slate-900">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                  <span className="text-[10.5px] font-bold text-red-400 font-mono w-20 uppercase">Warning</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={soundSettings.WARNING || 'siren'}
                    onChange={(e) => handleSaveSoundSetting('WARNING', e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-[10.5px] font-mono text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-red-500 cursor-pointer"
                  >
                    <option value="pulse">Pulse (Pulsos de onda senoidal)</option>
                    <option value="continuous">Continuous (Tono de onda triangular)</option>
                    <option value="siren">Siren (Sirena de frecuencia variable)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => triggerSound('WARNING', soundSettings.WARNING || 'siren')}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-red-500/40 hover:text-red-400 text-slate-400 cursor-pointer transition-colors"
                    title="Probar sonido Warning"
                  >
                    <Volume2 size={12} />
                  </button>
                </div>
              </div>

              {/* WATCH */}
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/30 border border-slate-900">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                  <span className="text-[10.5px] font-bold text-orange-400 font-mono w-20 uppercase">Watch</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={soundSettings.WATCH || 'pulse'}
                    onChange={(e) => handleSaveSoundSetting('WATCH', e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-[10.5px] font-mono text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="pulse">Pulse (Pulsos de onda senoidal)</option>
                    <option value="continuous">Continuous (Tono de onda triangular)</option>
                    <option value="siren">Siren (Sirena de frecuencia variable)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => triggerSound('WATCH', soundSettings.WATCH || 'pulse')}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-orange-500/40 hover:text-orange-400 text-slate-400 cursor-pointer transition-colors"
                    title="Probar sonido Watch"
                  >
                    <Volume2 size={12} />
                  </button>
                </div>
              </div>

              {/* ADVISORY */}
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/30 border border-slate-900">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                  <span className="text-[10.5px] font-bold text-yellow-400 font-mono w-20 uppercase">Advisory</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={soundSettings.ADVISORY || 'continuous'}
                    onChange={(e) => handleSaveSoundSetting('ADVISORY', e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-[10.5px] font-mono text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-yellow-500 cursor-pointer"
                  >
                    <option value="pulse">Pulse (Pulsos de onda senoidal)</option>
                    <option value="continuous">Continuous (Tono de onda triangular)</option>
                    <option value="siren">Siren (Sirena de frecuencia variable)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => triggerSound('ADVISORY', soundSettings.ADVISORY || 'continuous')}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-yellow-500/40 hover:text-yellow-400 text-slate-400 cursor-pointer transition-colors"
                    title="Probar sonido Advisory"
                  >
                    <Volume2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CONTRASTE EXTREMO (Col 2) */}
          <div className="bg-slate-900/20 border border-slate-900/60 p-3 rounded-xl flex flex-col justify-between gap-2">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5 mb-2.5">
                <Eye size={12} className="text-yellow-400" />
                <span>Accesibilidad de Interfaz</span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans leading-normal">
                El <strong className="text-yellow-300">Modo de Contraste Extremo</strong> fuerza el fondo de las tarjetas de alerta a negro puro (<code className="bg-slate-950 px-1 py-0.5 rounded text-yellow-400 font-mono">#000000</code>), aumenta el grosor de los bordes e intensifica la luminosidad del texto para garantizar una visibilidad insuperable bajo luz ambiental intensa, fatiga visual extrema o para operadores con daltonismo.
              </p>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-slate-900 mt-2">
              <span className="text-[11px] font-mono font-bold text-slate-200">CONTRASTE EXTREMO</span>
              <button
                type="button"
                onClick={handleToggleExtremeContrast}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isExtremeContrast ? 'bg-yellow-400' : 'bg-slate-800'
                }`}
                aria-label="Alternar modo de contraste extremo"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                    isExtremeContrast ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN: CONFIGURACIÓN GLOBAL DE CÓDIGOS SOS */}
      <SOSConfiguration isExtremeContrast={isExtremeContrast} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* 1. SEISMOLOGY PANEL */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
            <div className="flex items-center gap-2">
              <Activity className="text-red-500 animate-pulse stroke-[1.5]" size={18} />
              <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-slate-100">Detector de Sismos IGN</h2>
            </div>
            <span className="text-[10px] bg-red-950 border border-red-500/30 text-red-400 font-bold px-2 py-0.5 rounded font-mono">
              {rangeSismos.length} EN RANGO
            </span>
          </div>

          {/* VISUAL AUTO-ACK TOGGLE */}
          <div className="bg-slate-900/40 border border-slate-900/60 p-2 rounded-lg flex items-center justify-between gap-2 text-[10px] font-sans">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isAutoAck ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
              <div>
                <span className="font-bold text-slate-300 block leading-tight">Auto-Ack (M &lt; 2.5)</span>
                {isAutoAck && suppressedCount > 0 && (
                  <span className="text-[8.5px] text-emerald-400 font-mono font-semibold">
                    {suppressedCount} alertas filtradas
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleToggleAutoAck}
              className={`px-2 py-1 text-[9px] font-mono font-bold rounded border cursor-pointer uppercase transition-all duration-200 flex items-center gap-1 ${
                isAutoAck 
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/10' 
                  : 'bg-slate-950 text-slate-500 border-slate-850 hover:text-slate-400 hover:border-slate-800'
              }`}
              title="Suprimir alertas sísmicas no críticas de baja magnitud (<2.5)"
            >
              {isAutoAck && <ShieldCheck size={10} className="text-emerald-400" />}
              <span>{isAutoAck ? 'ACTIVO' : 'INACTIVO'}</span>
            </button>
          </div>

          {/* Earthquake scrollable feed (Primary Alerts Feed) */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 border-b border-slate-900 pb-3">
            {config?.ignSeismoEnabled === false ? (
              <div className="text-center py-8 px-4 bg-red-950/20 border border-red-500/20 rounded-lg">
                <EyeOff className="mx-auto text-red-500 animate-pulse mb-2" size={20} />
                <h5 className="font-bold text-slate-200">MONITOR SÍSMICO APAGADO</h5>
                <p className="text-[10px] text-slate-500 mt-1">El detector de sismos IGN ha sido desactivado por el operador. Active el monitor en el gestor de umbrales para iniciar registros.</p>
              </div>
            ) : activeEarthquakes.length > 0 ? (
              <AnimatePresence initial={false}>
                {activeEarthquakes.map((eq) => {
                  // Check if magnitude triggers user-configured visual alert
                  const hasVisualAlert = eq.magnitud >= minMagnitudeVisualAlert;
                  const nearest = getNearestNodeInfo(eq.latitude, eq.longitude);
                  const damageRadiusKm = Math.pow(2.2, eq.magnitud) * 0.8;

                  return (
                    <motion.div 
                      key={eq.id}
                      initial={{ opacity: 0, y: -15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      layout
                      onClick={() => {
                        if (onRelocate) {
                          onRelocate(eq.latitude, eq.longitude, `Sismo M${eq.magnitud.toFixed(1)}: ${eq.localizacion}`);
                        }
                        const sev = hasVisualAlert ? 'WARNING' : eq.enRango ? 'WATCH' : 'ADVISORY';
                        triggerSound(sev, soundSettings[sev]);
                      }}
                      className={`p-3 rounded-lg border font-mono text-xs relative overflow-hidden cursor-pointer hover:border-red-500/60 hover:bg-slate-900/70 transition-all duration-200 group ${
                        isExtremeContrast
                          ? hasVisualAlert
                            ? 'bg-black border-2 border-red-500 text-white font-bold ring-2 ring-red-500'
                            : eq.enRango
                            ? 'bg-black border-2 border-yellow-400 text-white font-bold'
                            : 'bg-black border border-white text-white font-semibold'
                          : hasVisualAlert
                          ? 'bg-red-950/50 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-[pulse_2.2s_infinite] ring-1 ring-red-500/40' 
                          : eq.enRango 
                          ? 'bg-slate-900/80 border-slate-700' 
                          : 'bg-slate-900/40 border-slate-900 shadow-sm'
                      }`}
                      title="Haz clic para centrar el mapa y reproducir alerta acústica"
                    >
                      {/* Visual Alarm glow bar on side */}
                      {hasVisualAlert && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 animate-pulse" />
                      )}

                      <div className="flex items-center justify-between mb-1 pl-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isExtremeContrast
                            ? hasVisualAlert
                              ? 'bg-red-600 text-white border border-red-400 font-black'
                              : 'bg-yellow-450 text-slate-950 border border-slate-950 font-black'
                            : hasVisualAlert 
                            ? 'bg-red-650 text-white font-black animate-pulse' 
                            : eq.magnitud >= 4.0 
                            ? 'bg-red-500 text-white' 
                            : eq.magnitud >= 3.0 
                            ? 'bg-amber-500 text-slate-950' 
                            : 'bg-slate-850 text-slate-450'
                        }`}>
                          M {eq.magnitud.toFixed(1)} {eq.magType}
                        </span>
                        
                        <span className={`text-[10px] flex items-center gap-1 font-bold ${isExtremeContrast ? 'text-yellow-300' : 'text-slate-550'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-red-550 animate-ping"></span>
                          <span className="text-[8.5px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity mr-1 font-sans">
                            🗺️ Centrar + Sonido
                          </span>
                          {new Date(eq.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} • IGN
                        </span>
                      </div>

                      <div className={`font-bold text-xs truncate pl-1.5 ${isExtremeContrast ? 'text-white' : 'text-slate-100'}`} title={eq.localizacion}>
                        {eq.localizacion}
                      </div>

                      <div className={`grid grid-cols-2 gap-1 text-[10px] mt-2 border-t pt-1.5 pl-1.5 ${isExtremeContrast ? 'text-white border-white/40 bg-slate-950/20' : 'text-slate-400 border-slate-800/40'}`}>
                        <div>Distancia: <span className={eq.enRango ? "text-yellow-400 font-bold" : isExtremeContrast ? "text-yellow-300 font-bold" : "text-slate-200"}>{eq.distanciaKm} km</span></div>
                        <div>Profundidad: <span className={isExtremeContrast ? "text-white font-bold" : "text-slate-200"}>{eq.depthKm} km</span></div>
                        <div className="col-span-2 text-rose-400/90 flex items-center gap-1 text-[9.5px] mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                          <span>Radio Impacto Estimado: <strong className={isExtremeContrast ? "text-rose-400 font-black text-[11px]" : "text-rose-400 font-extrabold"}>{damageRadiusKm.toFixed(1)} km</strong></span>
                        </div>
                      </div>

                      {nearest && (
                        <div className={`mt-2 text-[8.5px] flex items-center gap-1 p-1 rounded font-sans leading-tight pl-1.5 ${isExtremeContrast ? 'bg-black border border-emerald-500 text-emerald-300' : 'bg-emerald-950/10 border border-emerald-950/35 text-emerald-400'}`}>
                          <MapPin size={9} className="text-emerald-500 shrink-0" />
                          <span className="truncate">
                            Nodo: <strong className={isExtremeContrast ? 'text-emerald-200 font-bold' : 'text-emerald-300'}>{nearest.node.name}</strong> a {nearest.distanceKm.toFixed(1)} km
                          </span>
                        </div>
                      )}

                      {/* Visual alert message indicator */}
                      {hasVisualAlert && (
                        <div className={`mt-2 text-[9.5px] font-bold p-1 px-2 rounded font-sans flex items-center gap-1.5 animate-pulse pl-1.5 ${isExtremeContrast ? 'bg-red-650 border border-white text-white' : 'bg-red-950 border border-red-500/50 text-red-200'}`}>
                          <AlertOctagon size={11} className="text-red-400 shrink-0 animate-bounce" />
                          <span>¡AMPLITUD CRÍTICA! Magnitud ≥ {minMagnitudeVisualAlert.toFixed(1)}</span>
                        </div>
                      )}

                      {eq.enRango && eq.aprsPacket && (
                        <div className={`mt-1.5 text-[9px] px-1.5 py-1 rounded font-sans leading-tight ${isExtremeContrast ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : 'bg-emerald-950/20 border border-emerald-500/25 text-emerald-400'}`}>
                          📡 Objeto APRS <span className="font-mono bg-emerald-900/40 px-1 rounded text-emerald-200">SEISMO</span> inyectado en banda VHF nacional.
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                {filterType === 'critical' 
                  ? 'No hay sismos críticos (M ≥ ' + minMagnitudeVisualAlert.toFixed(1) + ') recientes.'
                  : isAutoAck && filteredEarthquakes.some(eq => eq.magnitud < 2.5)
                  ? 'Todos los sismos menores han sido auto-aceptados (M < 2.5).'
                  : 'No se han detectado eventos sísmicos recientes.'}
              </div>
            )}
          </div>

          {/* REGISTRO SÍSMICO EVENT LOGGER (Historical record keeping) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-450 uppercase font-black tracking-wider">
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></span>
                Registro Sísmico (Logger)
              </span>
              <span className="text-[8px] bg-slate-900 text-slate-500 py-0.5 px-1 rounded font-mono">
                {filteredEarthquakes.length} REGISTRADOS
              </span>
            </div>
            <div className="bg-black/75 border border-slate-900 rounded-lg p-2 font-mono text-[9px] h-[120px] overflow-y-auto space-y-1 scrollbar-thin">
              {config?.ignSeismoEnabled === false ? (
                <div className="text-center py-6 text-slate-600 italic">LECTURAS SUSPENDIDAS (MONITOR APAGADO)</div>
              ) : filteredEarthquakes.length > 0 ? (
                filteredEarthquakes.map((eq) => {
                  const isSuppressed = isAutoAck && eq.magnitud < 2.5;
                  const eqRadiusKm = Math.pow(2.2, eq.magnitud) * 0.8;
                  return (
                    <div 
                      key={`eq-log-${eq.id}`}
                      onClick={() => onRelocate?.(eq.latitude, eq.longitude, `Sismo: ${eq.localizacion}`)}
                      className={`flex items-start justify-between border-b border-slate-950/80 pb-1 last:border-0 last:pb-0 gap-1.5 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors ${
                        isSuppressed ? 'text-slate-600' : 'text-slate-350 hover:text-emerald-300'
                      }`}
                      title="Clic para centrar mapa en este evento"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                           {isSuppressed ? (
                            <span className="text-[7.5px] font-sans font-black bg-emerald-950/30 text-emerald-500 px-1 rounded border border-emerald-900/20 leading-none py-0.5 uppercase shrink-0">Auto-Ack</span>
                          ) : (
                            <span className="text-[7.5px] font-sans font-black bg-rose-950/30 text-rose-400 px-1 rounded border border-rose-900/20 leading-none py-0.5 uppercase shrink-0">Alerta</span>
                          )}
                          <span className={`font-bold ${isSuppressed ? 'text-slate-500' : 'text-slate-200'}`}>
                            M{eq.magnitud.toFixed(1)}
                          </span>
                          <span className="truncate max-w-[130px] font-sans" title={eq.localizacion}>
                            {eq.localizacion}
                          </span>
                        </div>
                        <div className="text-[8px] text-slate-600">
                          Prof: {eq.depthKm}km • Dist: {eq.distanciaKm.toFixed(0)}km • Radio: {eqRadiusKm.toFixed(1)}km
                        </div>
                      </div>
                      <span className="text-[8px] text-slate-500 shrink-0 self-center">
                        {new Date(eq.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-slate-700 italic">No hay registros sismológicos en base de datos.</div>
              )}
            </div>
          </div>
        </div>

        {/* 2. TSUNAMI PANEL - NUEVA VENTANA DE MONITOREO */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
            <div className="flex items-center gap-2">
              <Waves className="text-cyan-400 animate-pulse stroke-[1.5]" size={18} />
              <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-slate-100">Monitoreo de Tsunamis</h2>
            </div>
            <span className="text-[10px] bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-bold px-2 py-0.5 rounded font-mono uppercase">
              Vigilancia Marítima
            </span>
          </div>

          {/* SECCIÓN DE CONFIGURACIÓN PERSISTENTE DE TSUNAMIS */}
          <div className="bg-slate-900/40 border border-slate-900/60 p-2.5 rounded-lg flex flex-col gap-2 font-sans text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 block">Configuración de Alertas de Tsunami</span>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono">
                {currentUser ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sincronizado con Firebase
                  </span>
                ) : (
                  <span className="text-slate-500">
                    Almacenamiento Local (Sin sesión)
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-900/60 pt-2">
              <div className="text-[10.5px] text-slate-400 leading-tight">
                <span className="font-bold text-slate-300 block mb-0.5">Umbral Mínimo de Gravedad:</span>
                Filtra los eventos según la escala de severidad de la alerta de tsunami.
              </div>
              <div className="flex bg-black/50 border border-slate-850 p-0.5 rounded-md gap-0.5 font-sans">
                {[
                  { id: 'GREEN', label: 'Todos', desc: 'Muestra verde, advertencia, vigilancia y alarma' },
                  { id: 'ADVISORY', label: 'Aviso+', desc: 'Muestra Advertencia (Advisory) o superior' },
                  { id: 'WATCH', label: 'Vigila+', desc: 'Muestra Vigilancia (Watch) o superior' },
                  { id: 'WARNING', label: 'Alarma', desc: 'Muestra únicamente Alarma (Warning)' }
                ].map((level) => {
                  const isActive = tsunamiMinSeverity === level.id;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => handleSaveTsunamiMinSeverity(level.id)}
                      className={`px-2 py-1 rounded text-[9.5px] font-bold uppercase transition-all duration-150 cursor-pointer ${
                        isActive
                          ? level.id === 'WARNING' ? 'bg-red-950 text-red-400 border border-red-500/30' :
                            level.id === 'WATCH' ? 'bg-orange-950 text-orange-400 border border-orange-500/30' :
                            level.id === 'ADVISORY' ? 'bg-yellow-950 text-yellow-400 border border-yellow-500/30' :
                            'bg-slate-800 text-slate-300 border border-slate-700'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                      title={level.desc}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* VISUAL COASTAL RISK MAP */}
          <div className="bg-slate-900/30 border border-slate-900/80 p-2.5 rounded-lg flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-0.5">
              <span className="flex items-center gap-1.5 font-sans">
                <Map size={11} className="text-cyan-400 animate-pulse" />
                Mapa de Riesgo de Costas de España (SAT)
              </span>
              <span className="text-[9px] text-slate-550 font-normal">
                Proyección de Riesgo Sectorizado
              </span>
            </div>

            <div className="relative">
              <svg viewBox="0 0 320 180" className="w-full h-44 bg-slate-950 border border-slate-850 rounded-lg overflow-hidden relative font-mono">
                {/* Grid pattern background */}
                <defs>
                  <pattern id="tsunami-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(30, 41, 59, 0.25)" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#tsunami-grid)" />

                {/* Subtle radial/sonar range rings */}
                <circle cx="160" cy="90" r="30" fill="none" stroke="rgba(6, 182, 212, 0.04)" strokeDasharray="1 3" />
                <circle cx="160" cy="90" r="60" fill="none" stroke="rgba(6, 182, 212, 0.04)" strokeDasharray="1 3" />
                <circle cx="160" cy="90" r="90" fill="none" stroke="rgba(6, 182, 212, 0.04)" strokeDasharray="1 3" />
                <circle cx="160" cy="90" r="120" fill="none" stroke="rgba(6, 182, 212, 0.04)" strokeDasharray="1 3" />

                {/* Coastline reference background path */}
                <path 
                  d="M 30,20 L 80,20 L 240,20 M 30,20 L 30,50 L 50,70 M 50,70 L 50,110 L 45,130 L 60,130 L 100,140 L 160,130 L 190,110 L 210,95 L 240,70 L 260,40" 
                  fill="none" 
                  stroke="#111827" 
                  strokeWidth="5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
                <path 
                  d="M 30,20 L 80,20 L 240,20 M 30,20 L 30,50 L 50,70 M 50,70 L 50,110 L 45,130 L 60,130 L 100,140 L 160,130 L 190,110 L 210,95 L 240,70 L 260,40" 
                  fill="none" 
                  stroke="#1e293b" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />

                {/* Portugal border line (aesthetic dotted line) */}
                <path d="M 50,70 L 62,75 L 58,100 L 60,115 L 45,130" fill="none" stroke="rgba(71, 85, 105, 0.25)" strokeWidth="1" strokeDasharray="2 2" />

                {/* Sector 1: Cantábrico */}
                <path 
                  d="M 80,20 L 240,20" 
                  fill="none" 
                  stroke={getSectorStyles('cantabrico').stroke}
                  strokeWidth={getSectorStyles('cantabrico').strokeWidth}
                  className={getSectorStyles('cantabrico').className}
                  filter={getSectorStyles('cantabrico').filter}
                  strokeLinecap="round"
                  title="Sector Norte: Cantábrico"
                />

                {/* Sector 2: Atlántico / Galicia */}
                <path 
                  d="M 30,20 L 30,50 L 50,70" 
                  fill="none" 
                  stroke={getSectorStyles('galicia').stroke}
                  strokeWidth={getSectorStyles('galicia').strokeWidth}
                  className={getSectorStyles('galicia').className}
                  filter={getSectorStyles('galicia').filter}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  title="Sector Noroeste: Galicia"
                />

                {/* Sector 3: Golfo de Cádiz */}
                <path 
                  d="M 50,130 L 100,140" 
                  fill="none" 
                  stroke={getSectorStyles('cadiz').stroke}
                  strokeWidth={getSectorStyles('cadiz').strokeWidth}
                  className={getSectorStyles('cadiz').className}
                  filter={getSectorStyles('cadiz').filter}
                  strokeLinecap="round"
                  title="Sector Suroeste: Golfo de Cádiz"
                />

                {/* Sector 4: Mar de Alborán */}
                <path 
                  d="M 100,140 L 160,130" 
                  fill="none" 
                  stroke={getSectorStyles('alboran').stroke}
                  strokeWidth={getSectorStyles('alboran').strokeWidth}
                  className={getSectorStyles('alboran').className}
                  filter={getSectorStyles('alboran').filter}
                  strokeLinecap="round"
                  title="Sector Sur: Mar de Alborán & Estrecho"
                />

                {/* Sector 5: Mediterráneo Sur */}
                <path 
                  d="M 160,130 L 190,110 L 210,95" 
                  fill="none" 
                  stroke={getSectorStyles('med_sur').stroke}
                  strokeWidth={getSectorStyles('med_sur').strokeWidth}
                  className={getSectorStyles('med_sur').className}
                  filter={getSectorStyles('med_sur').filter}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  title="Sector Sureste: Almería & Murcia"
                />

                {/* Sector 6: Mediterráneo Levante */}
                <path 
                  d="M 210,95 L 240,70 L 260,40" 
                  fill="none" 
                  stroke={getSectorStyles('med_levante').stroke}
                  strokeWidth={getSectorStyles('med_levante').strokeWidth}
                  className={getSectorStyles('med_levante').className}
                  filter={getSectorStyles('med_levante').filter}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  title="Sector Este: C. Valenciana & Cataluña"
                />

                {/* Sector 7: Islas Baleares */}
                <g title="Sector: Islas Baleares">
                  <ellipse 
                    cx="255" 
                    cy="85" 
                    rx="5" 
                    ry="3" 
                    fill={getSectorStatus('baleares').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('baleares').stroke}
                    strokeWidth={getSectorStatus('baleares').active ? 1.5 : 1}
                    className={getSectorStyles('baleares').className}
                    filter={getSectorStyles('baleares').filter}
                  />
                  <ellipse 
                    cx="272" 
                    cy="76" 
                    rx="6" 
                    ry="4" 
                    fill={getSectorStatus('baleares').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('baleares').stroke}
                    strokeWidth={getSectorStatus('baleares').active ? 1.5 : 1}
                    className={getSectorStyles('baleares').className}
                    filter={getSectorStyles('baleares').filter}
                  />
                  <ellipse 
                    cx="285" 
                    cy="78" 
                    rx="3" 
                    ry="2" 
                    fill={getSectorStatus('baleares').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('baleares').stroke}
                    strokeWidth={getSectorStatus('baleares').active ? 1.5 : 1}
                    className={getSectorStyles('baleares').className}
                    filter={getSectorStyles('baleares').filter}
                  />
                </g>

                {/* Sector 8: Islas Canarias (Inset) */}
                <g title="Sector: Islas Canarias">
                  {/* Inset Border */}
                  <rect x="8" y="115" width="62" height="52" fill="rgba(15, 23, 42, 0.8)" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
                  <text x="12" y="125" className="text-[8px] fill-slate-500 font-bold">CANARIAS</text>
                  
                  {/* Islands circles/ellipses */}
                  <ellipse 
                    cx="22" 
                    cy="144" 
                    rx="4.5" 
                    ry="2.5" 
                    fill={getSectorStatus('canarias').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('canarias').stroke}
                    strokeWidth={getSectorStatus('canarias').active ? 1.5 : 1}
                    className={getSectorStyles('canarias').className}
                    filter={getSectorStyles('canarias').filter}
                  />
                  <ellipse 
                    cx="36" 
                    cy="143" 
                    rx="5" 
                    ry="3.5" 
                    fill={getSectorStatus('canarias').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('canarias').stroke}
                    strokeWidth={getSectorStatus('canarias').active ? 1.5 : 1}
                    className={getSectorStyles('canarias').className}
                    filter={getSectorStyles('canarias').filter}
                  />
                  <ellipse 
                    cx="50" 
                    cy="147" 
                    rx="4" 
                    ry="3" 
                    fill={getSectorStatus('canarias').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('canarias').stroke}
                    strokeWidth={getSectorStatus('canarias').active ? 1.5 : 1}
                    className={getSectorStyles('canarias').className}
                    filter={getSectorStyles('canarias').filter}
                  />
                  <ellipse 
                    cx="61" 
                    cy="138" 
                    rx="2" 
                    ry="3.5" 
                    fill={getSectorStatus('canarias').active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(30, 41, 59, 0.3)'}
                    stroke={getSectorStyles('canarias').stroke}
                    strokeWidth={getSectorStatus('canarias').active ? 1.5 : 1}
                    className={getSectorStyles('canarias').className}
                    filter={getSectorStyles('canarias').filter}
                  />
                </g>

                {/* Plot active tsunami epicenters */}
                {filteredTsunamis.map(tsu => {
                  const isSilenced = isTsunamiWarningActive && tsu.severity === 'ADVISORY';
                  if (isSilenced) return null; // Reduce operator cognitive fatigue by not plotting silenced advisories on the map

                  const { x, y } = getMapCoordinates(tsu.coordinates[0], tsu.coordinates[1]);
                  const color = tsu.severity === 'WARNING' ? '#ef4444' : tsu.severity === 'WATCH' ? '#f97316' : tsu.severity === 'ADVISORY' ? '#eab308' : '#06b6d4';
                  return (
                    <g key={`epicenter-${tsu.id}`} className="cursor-pointer" onClick={() => onRelocate?.(tsu.coordinates[0], tsu.coordinates[1], `Tsunami Epicenter: ${tsu.title}`)}>
                      {/* Concentric waves propagating outward */}
                      <circle 
                        cx={x} 
                        cy={y} 
                        r="18" 
                        fill="none" 
                        stroke={color} 
                        strokeWidth="0.8" 
                        className="animate-ping opacity-60" 
                        style={{ animationDuration: '2s' }}
                      />
                      <circle 
                        cx={x} 
                        cy={y} 
                        r="8" 
                        fill="none" 
                        stroke={color} 
                        strokeWidth="1.2" 
                        className="animate-pulse"
                      />
                      {/* Core epicenter dot */}
                      <circle 
                        cx={x} 
                        cy={y} 
                        r="3.5" 
                        fill={color} 
                        stroke="#000000" 
                        strokeWidth="1" 
                      />
                    </g>
                  );
                })}

                {/* Plot active sismos and their dynamic Estimated Impact Radius circles */}
                {activeEarthquakes.map(eq => {
                  const { x, y } = getMapCoordinates(eq.latitude, eq.longitude);
                  
                  // Coordinate bounds of the projected map box
                  const minLon = -10.5;
                  const maxLon = 4.5;
                  const minLat = 34.0;
                  const maxLat = 44.5;
                  const isWithinMap = eq.latitude >= minLat && eq.latitude <= maxLat && eq.longitude >= minLon && eq.longitude <= maxLon;
                  
                  if (!isWithinMap) return null;

                  // Compute dynamic damage radius based on magnitude: Math.pow(2.2, magnitude) * 0.8
                  const damageRadiusKm = Math.pow(2.2, eq.magnitud) * 0.8;
                  const rSvg = damageRadiusKm * 0.12;

                  const isCritical = eq.magnitud >= minMagnitudeVisualAlert;
                  const color = isCritical ? '#ef4444' : '#eab308'; // red-500 or yellow-500
                  const fillColor = isCritical ? 'rgba(239, 68, 68, 0.12)' : 'rgba(234, 179, 8, 0.08)';

                  return (
                    <g 
                      key={`eq-map-${eq.id}`} 
                      className="cursor-pointer group/eq" 
                      onClick={() => onRelocate?.(eq.latitude, eq.longitude, `Sismo M${eq.magnitud.toFixed(1)}: ${eq.localizacion}`)}
                    >
                      {/* Graphical Estimated Impact Radius circle */}
                      {showSismoRadii && (
                        <circle 
                          cx={x} 
                          cy={y} 
                          r={rSvg} 
                          fill={fillColor} 
                          stroke={color} 
                          strokeWidth="1.2" 
                          strokeDasharray={isCritical ? "2 2" : "3 3"} 
                          className={isCritical ? "animate-[pulse_2.2s_infinite]" : ""}
                          style={{ transformOrigin: `${x}px ${y}px` }}
                        >
                          <title>{`Sismo: ${eq.localizacion}\nMagnitud: M${eq.magnitud.toFixed(1)}\nRadio de Impacto Estimado: ${damageRadiusKm.toFixed(1)} km`}</title>
                        </circle>
                      )}

                      {/* Epicenter locator dot with glow effect */}
                      <circle 
                        cx={x} 
                        cy={y} 
                        r="3" 
                        fill={color} 
                        stroke="#000000" 
                        strokeWidth="0.8" 
                        className={isCritical ? "animate-pulse" : ""}
                      />
                      {isCritical && (
                        <circle 
                          cx={x} 
                          cy={y} 
                          r="6" 
                          fill="none" 
                          stroke={color} 
                          strokeWidth="0.5" 
                          className="animate-ping" 
                          style={{ animationDuration: '2.5s' }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Sismo Radii Toggle Overlay */}
              <div className="absolute bottom-2 left-2 bg-slate-950/90 border border-slate-800/80 px-2 py-1 rounded text-[8px] font-mono flex items-center gap-1.5 select-none shadow-md">
                <span className="font-bold text-slate-400">RADIOS SISMOS:</span>
                <button
                  type="button"
                  onClick={() => setShowSismoRadii(!showSismoRadii)}
                  className={`px-1.5 py-0.5 rounded text-[7px] font-bold uppercase transition-all duration-150 cursor-pointer ${
                    showSismoRadii
                      ? 'bg-rose-950 text-rose-400 border border-rose-500/30 font-black'
                      : 'bg-slate-900 text-slate-550 border border-slate-800'
                  }`}
                >
                  {showSismoRadii ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Status display overlay */}
              <div className="absolute top-2 right-2 bg-slate-950/90 border border-slate-800/80 px-2 py-1 rounded text-[8px] font-mono flex flex-col gap-0.5 leading-tight select-none">
                <span className="font-bold text-slate-400 border-b border-slate-800 pb-0.5 uppercase">ESTADO DE SECTORES</span>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1 text-slate-500 font-bold">
                  <span className="flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${getSectorStatus('cantabrico').active ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></span>
                    Cantábrico: <strong className={getSectorStatus('cantabrico').active ? 'text-red-400 font-bold' : 'text-slate-400 font-normal'}>{getSectorStatus('cantabrico').severity}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${getSectorStatus('galicia').active ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></span>
                    Galicia: <strong className={getSectorStatus('galicia').active ? 'text-red-400 font-bold' : 'text-slate-400 font-normal'}>{getSectorStatus('galicia').severity}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${getSectorStatus('cadiz').active ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></span>
                    G. Cádiz: <strong className={getSectorStatus('cadiz').active ? 'text-red-400 font-bold' : 'text-slate-400 font-normal'}>{getSectorStatus('cadiz').severity}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${getSectorStatus('alboran').active ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></span>
                    Alborán: <strong className={getSectorStatus('alboran').active ? 'text-red-400 font-bold' : 'text-slate-400 font-normal'}>{getSectorStatus('alboran').severity}</strong>
                  </span>
                  <span className="flex items-center gap-1 col-span-2">
                    <span className={`w-1 h-1 rounded-full ${getSectorStatus('med_sur').active || getSectorStatus('med_levante').active || getSectorStatus('baleares').active ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></span>
                    Med/Baleares: <strong className={
                      getSectorStatus('med_sur').active ? 'text-red-400 font-bold' :
                      getSectorStatus('med_levante').active ? 'text-orange-400 font-bold' :
                      getSectorStatus('baleares').active ? 'text-yellow-400 font-bold' : 'text-slate-400 font-normal'
                    }>{
                      getSectorStatus('med_sur').active ? getSectorStatus('med_sur').severity :
                      getSectorStatus('med_levante').active ? getSectorStatus('med_levante').severity :
                      getSectorStatus('baleares').active ? getSectorStatus('baleares').severity : 'GREEN'
                    }</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tsunamis scrollable feed */}
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 font-mono">
            {isTsunamiWarningActive && (
              <div className="bg-amber-950/25 border border-amber-500/35 p-2 rounded-lg flex items-start gap-2 text-[10px] font-sans text-amber-400 mb-2 animate-pulse">
                <AlertTriangle size={12} className="shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <span className="font-bold uppercase">Priorización Inteligente Activa:</span>
                  <p className="text-[9px] text-slate-400 mt-0.5 font-normal leading-tight">
                    Se ha detectado una alerta crítica de tsunami (<strong>WARNING</strong>). Las alertas de menor prioridad (<strong>ADVISORY</strong>) han sido silenciadas en el mapa y atenuadas en la consola para reducir la fatiga cognitiva del operador.
                  </p>
                </div>
              </div>
            )}
            {config?.tsunamiMonitorEnabled === false ? (
              <div className="text-center py-8 px-4 bg-red-950/20 border border-red-500/20 rounded-lg">
                <EyeOff className="mx-auto text-red-500 animate-pulse mb-2" size={20} />
                <h5 className="font-bold text-slate-200">MONITOR DE TSUNAMIS APAGADO</h5>
                <p className="text-[10px] text-slate-500 mt-1">La vigilancia de boyas ERDDAP y avisos PTWC ha sido desactivada por el operador. Active el monitor en el gestor de umbrales para iniciar registros.</p>
              </div>
            ) : filteredTsunamis.length > 0 ? (
              <AnimatePresence initial={false}>
                {filteredTsunamis.map((tsu) => {
                  const isSpainPreventive = tsu.id.includes('sim') || tsu.location.toLowerCase().includes('españa');
                  const nearestTsu = getNearestNodeInfo(tsu.coordinates[0], tsu.coordinates[1]);
                  const isSilenced = isTsunamiWarningActive && tsu.severity === 'ADVISORY';

                  // Determine colors based on severity
                  const cardStyles = isExtremeContrast
                    ? isSilenced
                      ? 'bg-black border-2 border-slate-800 text-slate-500 opacity-30 cursor-not-allowed'
                      : tsu.severity === 'WARNING'
                      ? 'bg-black border-2 border-red-500 text-white font-bold'
                      : tsu.severity === 'WATCH'
                      ? 'bg-black border-2 border-orange-500 text-white font-bold'
                      : tsu.severity === 'ADVISORY'
                      ? 'bg-black border-2 border-yellow-400 text-white font-bold'
                      : 'bg-black border border-white text-white font-semibold'
                    : isSilenced
                    ? 'bg-slate-950/40 border-slate-900/60 text-slate-500 opacity-40 hover:opacity-60 saturate-50 transition-all cursor-not-allowed'
                    : tsu.severity === 'WARNING'
                    ? 'bg-red-950/40 border-red-500/65 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-[pulse_2.2s_infinite] ring-1 ring-red-500/20 text-slate-100'
                    : tsu.severity === 'WATCH'
                    ? 'bg-amber-950/35 border-orange-500/55 shadow-[0_0_15px_rgba(249,115,22,0.22)] ring-1 ring-orange-500/15 text-slate-100'
                    : tsu.severity === 'ADVISORY'
                    ? 'bg-yellow-950/20 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.12)] ring-1 ring-yellow-500/15 text-slate-150'
                    : isSpainPreventive
                    ? 'bg-cyan-950/10 border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.02)] text-slate-300'
                    : 'bg-slate-900/35 border-slate-900 text-slate-400';

                  const badgeStyles = isExtremeContrast
                    ? isSilenced
                      ? 'bg-black border border-slate-800 text-slate-500'
                      : tsu.severity === 'WARNING'
                      ? 'bg-red-650 border border-white text-white font-black'
                      : tsu.severity === 'WATCH'
                      ? 'bg-orange-600 border border-white text-white font-black'
                      : tsu.severity === 'ADVISORY'
                      ? 'bg-yellow-400 border border-black text-black font-black'
                      : 'bg-white border border-black text-black font-black'
                    : isSilenced
                    ? 'bg-slate-900 border-slate-850 text-slate-500'
                    : tsu.severity === 'WARNING'
                    ? 'bg-red-650 border-red-500 text-red-100 font-bold'
                    : tsu.severity === 'WATCH'
                    ? 'bg-orange-600/80 border-orange-500 text-orange-100 font-bold'
                    : tsu.severity === 'ADVISORY'
                    ? 'bg-yellow-650/80 border-yellow-500 text-slate-950 font-bold'
                    : 'bg-slate-800 border-slate-700 text-slate-400';

                  const isCriticalTsu = !isSilenced && (tsu.severity === 'WARNING' || tsu.severity === 'WATCH');

                  return (
                    <motion.div 
                      key={tsu.id}
                      initial={{ opacity: 0, y: -15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      layout
                      onClick={() => {
                        if (isSilenced) return; // Ignore clicks on silenced alerts to reduce accidental relocations
                        if (onRelocate) {
                          onRelocate(tsu.coordinates[0], tsu.coordinates[1], `Tsunami: ${tsu.title}`);
                        }
                        const sev = tsu.severity === 'WARNING' || tsu.severity === 'WATCH' || tsu.severity === 'ADVISORY' ? tsu.severity : 'ADVISORY';
                        triggerSound(sev, soundSettings[sev]);
                      }}
                      className={`p-3 rounded-lg border font-mono text-xs relative overflow-hidden transition-all duration-200 group ${cardStyles} ${isSilenced ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title={isSilenced ? "Alerta de menor prioridad silenciada por Alarma de Tsunami Activa" : "Haz clic para centrar el mapa y reproducir la alarma acústica configurada"}
                    >
                      {/* Visual Alarm glow bar on side for critical tsunamis */}
                      {tsu.severity === 'WARNING' && !isSilenced && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 animate-pulse" />
                      )}
                      {tsu.severity === 'WATCH' && !isSilenced && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500 animate-pulse" />
                      )}
                      {tsu.severity === 'ADVISORY' && !isSilenced && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-yellow-500" />
                      )}
                      {isSilenced && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-800" />
                      )}

                      <div className="flex items-center justify-between mb-1 pl-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase transition-all ${badgeStyles}`}>
                          {isSilenced ? '🔇 SILENCIADO' : `${tsu.severity} ${tsu.magnitude > 0 ? `• M${tsu.magnitude.toFixed(1)}` : ''}`}
                        </span>
                        
                        <span className={`text-[10px] flex items-center gap-1 font-bold ${isExtremeContrast ? 'text-yellow-300' : 'text-slate-550'}`}>
                          {!isSilenced && (
                            <span className="text-[8.5px] text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity mr-1 font-sans">
                              🗺️ Centrar + Sonido
                            </span>
                          )}
                          {isCriticalTsu ? (
                            <span className="flex h-2 w-2 relative shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-550"></span>
                            </span>
                          ) : (
                            <Clock size={10} />
                          )}
                          {new Date(tsu.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className={`text-xs font-bold pl-1 ${
                        isSilenced ? 'text-slate-550 line-through' :
                        isExtremeContrast ? 'text-white font-extrabold text-[12.5px]' :
                        tsu.severity === 'WARNING' ? 'text-red-200 font-extrabold' : 
                        tsu.severity === 'WATCH' ? 'text-orange-200 font-bold' : 
                        tsu.severity === 'ADVISORY' ? 'text-yellow-200 font-semibold' :
                        isSpainPreventive ? 'text-cyan-300' : 'text-slate-200'
                      } truncate`} title={tsu.title}>
                        {tsu.title}
                      </div>

                      <p className={`text-[10px] mt-1 leading-snug pl-1 ${isExtremeContrast ? 'text-white' : 'text-slate-450'}`}>
                        <strong className={isExtremeContrast ? "text-yellow-300" : "text-slate-400"}>Epicentro:</strong> {tsu.location}
                      </p>

                      <div className={`grid grid-cols-2 gap-1 text-[9px] mt-2 border-t pt-1.5 pl-1 ${isExtremeContrast ? 'text-white border-white/40 bg-slate-950/20' : 'text-slate-550 border-slate-900'}`}>
                        <div>Fte: <span className={isExtremeContrast ? "text-white font-bold" : "text-slate-400 font-bold"}>{tsu.source}</span></div>
                        <div>Olas máx: <span className={isSilenced ? "text-slate-500 font-bold" : isExtremeContrast ? "text-yellow-300 font-bold" : "text-cyan-400 font-bold"}>{tsu.maxWaveHeightMeter?.toFixed(2)}m</span></div>
                        {tsu.distanceKm && (
                          <div className="col-span-2">Distancia al QTH: <span className={isExtremeContrast ? "text-white font-semibold" : "text-slate-400 font-semibold"}>{tsu.distanceKm.toFixed(0)} km</span></div>
                        )}
                      </div>

                      {nearestTsu && !isSilenced && (
                        <div className={`mt-2 text-[8.5px] flex items-center gap-1 p-1 rounded font-sans leading-tight pl-1 ${isExtremeContrast ? 'bg-black border border-cyan-500 text-cyan-300' : 'bg-cyan-950/10 border border-cyan-950/35 text-cyan-400'}`}>
                          <MapPin size={9} className="text-cyan-500 shrink-0" />
                          <span className="truncate">
                            Nodo: <strong className={isExtremeContrast ? 'text-cyan-200 font-bold' : 'text-cyan-300'}>{nearestTsu.node.name}</strong> a {nearestTsu.distanceKm.toFixed(1)} km
                          </span>
                        </div>
                      )}

                      {/* Special preventive label for Alborán or Cabo de Gata alerts */}
                      {tsu.etaSpain && !isSilenced && (
                        <div className="mt-2 text-[9.5px] bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 p-1 px-2 rounded font-sans leading-relaxed">
                          💡 <strong>Zonas costeras afectadas / ETA España:</strong> {tsu.etaSpain}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                {filterType === 'critical'
                  ? 'No hay alertas de tsunami severas (WARNING o WATCH) vigentes.'
                  : 'Sin alertas de tsunami vigentes en la cuenca atlántica o mediterránea.'}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
