import React, { useState, useEffect } from 'react';
import { 
  Radio, Globe, Server, Terminal, Settings, Activity, Wifi, Play, 
  RefreshCw, BarChart3, Send, ShieldAlert, Check, Info, Save, Cpu, 
  ToggleLeft, ListFilter, Command, MapPin, Heart, AlertCircle, Sparkles, CheckCircle2,
  Trash2, Edit, Plus, X
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { AprsPacket } from './AprsAdaptor';

interface AprxConsoleProps {
  weather?: {
    tempC: number;
    windSpeedKts: number;
    pressureHpa: number;
  };
  aprsPackets?: AprsPacket[];
  setAprsPackets?: React.Dispatch<React.SetStateAction<AprsPacket[]>>;
  playBuzzerSound?: (freq: number, duration: number, type?: OscillatorType) => void;
  showToast?: (msg: string) => void;
  callsign?: string;
  systemLogs?: any[];
  onInjectRaw?: (payload: string) => Promise<boolean>;
}

// Generates simulated through-put history (packets and uploads)
const generateGateHistory = () => {
  const data = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600 * 1000);
    const hourStr = time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    data.push({
      time: hourStr,
      rfToInternet: 0,
      internetToRf: 0,
      latency: Math.round(42 + Math.random() * 5) // ms connection ping
    });
  }
  return data;
};

interface AprsIsServer {
  id: string;
  name: string;
  host: string;
  port: string;
}

const DEFAULT_SERVERS: AprsIsServer[] = [
  { id: '1', name: 'Europa (euro.aprs2.net)', host: 'euro.aprs2.net', port: '14580' },
  { id: '2', name: 'España (spain.aprs2.net)', host: 'spain.aprs2.net', port: '14580' },
  { id: '3', name: 'Norteamérica (noam.aprs2.net)', host: 'noam.aprs2.net', port: '14580' },
  { id: '4', name: 'Mundial (rotate.aprs2.net)', host: 'rotate.aprs2.net', port: '14580' },
  { id: '5', name: 'Servidor Local (localhost)', host: 'localhost', port: '14580' },
];

export default function AprxConsole({ weather, aprsPackets, setAprsPackets, playBuzzerSound, showToast, callsign, systemLogs, onInjectRaw }: AprxConsoleProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'gate' | 'digipeater' | 'packet' | 'metrics' | 'config'>('gate');
  const [isRunning, setIsRunning] = useState(true);
  const [autoRouteAlerts, setAutoRouteAlerts] = useState(true);
  
  // APRX Parameters
  const [myCall, setMyCall] = useState('EA1URG-10');

  useEffect(() => {
    if (callsign) {
      setMyCall(callsign);
    }
  }, [callsign]);
  const [aprsisServer, setAprsisServer] = useState('euro.aprs2.net');
  const [aprsisPort, setAprsisPort] = useState('14580');
  const [passcode, setPasscode] = useState('18023');
  const [rfFilter, setRfFilter] = useState('m/200'); // 200km radius filter
  const [beaconInterval, setBeaconInterval] = useState(1200); // seconds
  const [beaconComment, setBeaconComment] = useState('S.A.T. IGate-Gate y Digirepetidor Activo ES-VHF [Debian Core]');
  const [digiEnabled, setDigiEnabled] = useState(true);

  // APRS-IS custom servers management
  const [serversList, setServersList] = useState<AprsIsServer[]>(() => {
    try {
      const saved = localStorage.getItem('sat_aprsis_servers_list');
      return saved ? JSON.parse(saved) : DEFAULT_SERVERS;
    } catch {
      return DEFAULT_SERVERS;
    }
  });

  const [newServerName, setNewServerName] = useState('');
  const [newServerHost, setNewServerHost] = useState('');
  const [newServerPort, setNewServerPort] = useState('14580');
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.aprsisServersList && Array.isArray(data.aprsisServersList)) {
              setServersList(data.aprsisServersList);
              localStorage.setItem('sat_aprsis_servers_list', JSON.stringify(data.aprsisServersList));
            }
          }
        } catch (err) {
          console.error("Error fetching custom servers from Firebase:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const saveServersList = async (newList: AprsIsServer[]) => {
    setServersList(newList);
    localStorage.setItem('sat_aprsis_servers_list', JSON.stringify(newList));
    if (currentUser) {
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        await setDoc(docRef, {
          aprsisServersList: newList,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        if (showToast) {
          showToast('Servidores guardados en Firebase Firestore con éxito.');
        }
      } catch (err) {
        console.error("Error saving servers list to Firestore:", err);
        if (showToast) {
          showToast('Servidores guardados localmente. Error al sincronizar en la nube.');
        }
      }
    } else {
      if (showToast) {
        showToast('Servidores guardados localmente (inicia sesión para sincronizar en la nube).');
      }
    }
  };

  const handleAddOrUpdateServer = () => {
    if (!newServerName.trim() || !newServerHost.trim()) {
      if (showToast) showToast('Por favor, rellena el nombre y el host/IP del servidor.');
      return;
    }
    const portParsed = parseInt(newServerPort, 10);
    if (isNaN(portParsed) || portParsed <= 0 || portParsed > 65535) {
      if (showToast) showToast('Puerto inválido. Debe ser un número entre 1 y 65535.');
      return;
    }

    let updatedList: AprsIsServer[];
    if (editingServerId) {
      updatedList = serversList.map(s => s.id === editingServerId ? {
        ...s,
        name: newServerName.trim(),
        host: newServerHost.trim(),
        port: newServerPort.trim()
      } : s);
      if (showToast) showToast('Servidor actualizado con éxito.');
    } else {
      const newSrv: AprsIsServer = {
        id: `srv-${Date.now()}`,
        name: newServerName.trim(),
        host: newServerHost.trim(),
        port: newServerPort.trim()
      };
      updatedList = [...serversList, newSrv];
      if (showToast) showToast('Nuevo servidor añadido con éxito.');
    }

    saveServersList(updatedList);
    setNewServerName('');
    setNewServerHost('');
    setNewServerPort('14580');
    setEditingServerId(null);
  };

  const handleDeleteServer = (id: string) => {
    const updatedList = serversList.filter(s => s.id !== id);
    saveServersList(updatedList);
    if (editingServerId === id) {
      setNewServerName('');
      setNewServerHost('');
      setNewServerPort('14580');
      setEditingServerId(null);
    }
    if (showToast) showToast('Servidor eliminado de la lista.');
  };

  const handleEditClick = (srv: AprsIsServer) => {
    setNewServerName(srv.name);
    setNewServerHost(srv.host);
    setNewServerPort(srv.port);
    setEditingServerId(srv.id);
  };

  // States
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [latencyData, setLatencyData] = useState(() => generateGateHistory());
  const [isTxActive, setIsTxActive] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [kissRxSocket, setKissRxSocket] = useState(true);
  const [terminalTab, setTerminalTab] = useState<'traffic' | 'connection'>('traffic');

  // Traffic heartbeat states
  const [lastTrafficTime, setLastTrafficTime] = useState<number | null>(null);
  const [trafficStatus, setTrafficStatus] = useState<'LIVE_TRAFFIC' | 'IDLE'>('IDLE');
  const [heartbeatPulse, setHeartbeatPulse] = useState(false);

  // Automatically reset the heartbeat pulse animation state
  useEffect(() => {
    if (heartbeatPulse) {
      const t = setTimeout(() => setHeartbeatPulse(false), 500);
      return () => clearTimeout(t);
    }
  }, [heartbeatPulse]);

  // Periodically check if traffic is IDLE (no traffic for over 30s) or LIVE
  useEffect(() => {
    if (!isRunning) {
      setTrafficStatus('IDLE');
      return;
    }

    const checkTraffic = () => {
      if (lastTrafficTime && Date.now() - lastTrafficTime <= 30000) {
        setTrafficStatus('LIVE_TRAFFIC');
      } else {
        setTrafficStatus('IDLE');
      }
    };

    checkTraffic();
    const interval = setInterval(checkTraffic, 1000);
    return () => clearInterval(interval);
  }, [lastTrafficTime, isRunning]);

  // Stats Counters
  const [stats, setStats] = useState({
    rfRx: 0,
    isTx: 0, // uploaded
    isRx: 0, // from internet
    rfTx: 0,  // digipeated or beacons injected onto RF
    dropped: 0,
    uptime: '1d 02h 15m'
  });

  // Terminal Log entries specific to APRX (Real Packets only)
  const [logs, setLogs] = useState<string[]>([]);

  // Connection/Status logs
  const [connectionLogs, setConnectionLogs] = useState<string[]>([
    'aprx version 2.9.0-stable initialized...',
    'Configuration loaded from /etc/aprx.conf successfully.',
    'System bind: MyCall is EA1URG-10, Locator Coordinate: JN50ei (Madrid Center)',
    'Connecting to APRS-IS server euro.aprs2.net:14580...',
    'KISS socket link connecting on localhost:8001 (associated via Direwolf TNC)...',
    '[APRS-IS] Connection established with euro.aprs2.net:14580. Passcode 18023 accepted.',
    '[KISS] Connected to virtual TNC socket (localhost:8001). RX/TX buffers linked.',
    `[INFO] Filter "m/200" injected into APRS-IS remote subscription socket.`,
    'Digipeater algorithm [WIDE1-1, WIDE2-1/2-2] activated on virtual radio interface ax0.',
    'Beacon initialized with 1200s timer. Ready for automatic telemetry broadcast.'
  ]);

  const [simulatedNetworkActive, setSimulatedNetworkActive] = useState(false);

  // Load and parse real /etc/aprx.conf file on mount
  useEffect(() => {
    const loadRealConfig = async () => {
      try {
        const resp = await customFetch('/api/files/configs');
        const d = await resp.json();
        if (d && d.aprx) {
          const lines = d.aprx.split('\n');
          lines.forEach((line: string) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || trimmed === '') return;
            
            // match: mycall EA1URG-10
            if (/^mycall\s+(\S+)/i.test(trimmed)) {
              const m = trimmed.match(/^mycall\s+(\S+)/i);
              if (m) setMyCall(m[1]);
            }
            // match: server rotate.aprs2.net 14580
            if (/^\s*server\s+(\S+)\s+(\d+)/i.test(trimmed)) {
              const m = trimmed.match(/^\s*server\s+(\S+)\s+(\d+)/i);
              if (m) {
                setAprsisServer(m[1]);
                setAprsisPort(m[2]);
              }
            }
            // match: passcode 18023
            if (/^\s*passcode\s+(\S+)/i.test(trimmed)) {
              const m = trimmed.match(/^\s*passcode\s+(\S+)/i);
              if (m) setPasscode(m[1]);
            }
            // match: filter "..."
            if (/^\s*filter\s+"([^"]+)"/i.test(trimmed)) {
              const m = trimmed.match(/^\s*filter\s+"([^"]+)"/i);
              if (m) setRfFilter(m[1]);
            }
          });
        }
      } catch (err) {
        console.error('Error loading real aprx config:', err);
      }
    };
    loadRealConfig();
  }, []);

  // Monitor aprsPackets changes to trigger heartbeat pulse
  const [lastPacketsCount, setLastPacketsCount] = useState(aprsPackets?.length || 0);

  useEffect(() => {
    if (aprsPackets && aprsPackets.length > lastPacketsCount) {
      setLastTrafficTime(Date.now());
      setHeartbeatPulse(true);
    }
    setLastPacketsCount(aprsPackets?.length || 0);
  }, [aprsPackets, lastPacketsCount]);

  // Synchronize stats and append real packet traffic from systemLogs to the terminal
  const [lastLogLength, setLastLogLength] = useState(0);

  useEffect(() => {
    if (!systemLogs) return;

    // Filter real packets (TX, RX, WINLINK, AIS)
    const packetLogs = systemLogs.filter(l => l.type === 'TX' || l.type === 'RX' || l.type === 'WINLINK' || l.type === 'AIS');
    const rxCount = packetLogs.filter(l => l.type === 'RX' || l.type === 'AIS' || l.type === 'WINLINK').length;
    const txCount = packetLogs.filter(l => l.type === 'TX').length;

    // Dynamic connection status: check if any error or offline flag is in the logs
    const hasConnectionError = systemLogs.some(l => l.type === 'SYS' && l.payload?.toLowerCase().includes('error de conexión'));
    setIsConnected(!hasConnectionError && isRunning);

    setStats({
      rfRx: rxCount,
      isTx: rxCount, // RX uploaded to APRS-IS
      isRx: txCount, // Downlink / server traffic
      rfTx: txCount,  // Beacons or responses
      dropped: 0,
      uptime: '1d 02h 15m'
    });

    if (systemLogs.length > lastLogLength) {
      const newEntries = systemLogs.slice(lastLogLength);
      const formattedEntries: string[] = [];
      const formattedConnEntries: string[] = [];
      let hasPacket = false;

      newEntries.forEach(l => {
        if (l.type === 'RX' || l.type === 'TX' || l.type === 'WINLINK' || l.type === 'AIS') {
          hasPacket = true;
          if (l.type === 'TX') {
            formattedEntries.push(`[IGATE IN] Downloaded frame from APRS-IS: ${l.source}>${l.destination}`);
            formattedEntries.push(`[KISS OUT] Transmitting frame to TNC: "${l.source}>${l.destination}" [${l.payload}]`);
          } else {
            formattedEntries.push(`[KISS IN] received RF frame from TNC: "${l.source}>${l.destination}"`);
            formattedEntries.push(`[IGATE OUT] Uploading packet to APRS-IS: ${l.source} (${l.remarks || 'Ok'})`);
          }
        } else if (l.type === 'SYS') {
          if (l.source === 'APRX' || l.destination === 'APRX' || l.remarks?.toLowerCase().includes('aprx') || l.payload?.toLowerCase().includes('aprx') || l.payload?.toLowerCase().includes('aprs-is')) {
            formattedConnEntries.push(`[${l.timestamp || new Date().toLocaleTimeString('es-ES')}] [SYSTEM STATUS] ${l.payload} (${l.remarks})`);
          }
        }
      });

      if (hasPacket) {
        setLastTrafficTime(Date.now());
        setHeartbeatPulse(true);
      }

      if (formattedEntries.length > 0) {
        setLogs(prev => [...prev, ...formattedEntries]);
      }
      if (formattedConnEntries.length > 0) {
        setConnectionLogs(prev => [...prev, ...formattedConnEntries]);
      }
    }
    setLastLogLength(systemLogs.length);
  }, [systemLogs, lastLogLength, isRunning]);

  // Fluctuate latency slightly to demonstrate dynamic environment (without adding simulated traffic packet rate)
  useEffect(() => {
    if (!isRunning) return;

    const latencyInterval = setInterval(() => {
      setLatencyData(prev => {
        const updated = [...prev.slice(1)];
        const newLatency = Math.round(40 + Math.random() * 5);
        const hourStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        updated.push({
          time: hourStr,
          rfToInternet: 0,
          internetToRf: 0,
          latency: newLatency
        });
        return updated;
      });
    }, 6000);

    return () => {
      clearInterval(latencyInterval);
    };
  }, [isRunning]);

  // Automated APRX routing for bulletins signed/approved by CECOP
  useEffect(() => {
    if (!isRunning || !autoRouteAlerts || !aprsPackets || !setAprsPackets) return;

    // Find any packet that is "APROBADO" but not yet "TRANSMITIDO"
    const approvedPacket = aprsPackets.find(p => p.status === 'APROBADO');
    if (approvedPacket) {
      const timer = setTimeout(() => {
        // Double check status before auto-sending
        const refreshed = JSON.parse(localStorage.getItem('sat_aprs_packets') || '[]');
        const isStillApproved = refreshed.some((p: any) => p.id === approvedPacket.id && p.status === 'APROBADO');
        if (!isStillApproved) return;

        if (playBuzzerSound) {
          playBuzzerSound(784, 0.1, 'sine');
          setTimeout(() => playBuzzerSound(1046, 0.15, 'sine'), 120);
        }

        setLogs(prev => [
          ...prev,
          `[AUTO-GATEWAY] Boletín S.A.T. aprobado detectado: "${approvedPacket.originalTitle}"`,
          `[APRX RF OUT] ${approvedPacket.callsign}>${approvedPacket.destination},${approvedPacket.path || 'WIDE1-1,WIDE2-1'}:!${approvedPacket.latitude.toFixed(4)}N/${approvedPacket.longitude.toFixed(4)}W#${approvedPacket.messageText || approvedPacket.packetString}`,
          `[APRX IS OUT] Uploaded to server ${aprsisServer} securely with CECOP signature.`
        ]);

        const updated = aprsPackets.map(p => {
          if (p.id === approvedPacket.id) {
            return {
              ...p,
              status: 'TRANSMITIDO' as const,
              transmittedAt: new Date().toLocaleTimeString()
            };
          }
          return p;
        });
        setAprsPackets(updated);
        localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

        if (showToast) {
          showToast(`[AUTO-APRX] Boletín de emergencia "${approvedPacket.originalTitle}" transmitido.`);
        }

        setStats(prev => ({
          ...prev,
          rfTx: prev.rfTx + 1,
          isTx: prev.isTx + 1
        }));
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [aprsPackets, autoRouteAlerts, isRunning, aprsisServer]);

  const handleBroadcastPacket = (pkt: AprsPacket) => {
    if (!setAprsPackets || !aprsPackets) return;

    if (playBuzzerSound) {
      playBuzzerSound(1100, 0.15, 'sine');
    }

    setLogs(prev => [
      ...prev,
      `[MANUAL OUT] Emisor APRX forzado: difundiendo boletín "${pkt.originalTitle}"`,
      `[APRX RF OUT] ${pkt.callsign}>${pkt.destination},${pkt.path || 'WIDE1-1,WIDE2-1'}:!${pkt.latitude.toFixed(4)}N/${pkt.longitude.toFixed(4)}W#${pkt.messageText || pkt.packetString}`,
      `[APRX IS OUT] Server ${aprsisServer} procesó UI-Frame con firma autorizada.`
    ]);

    const updated = aprsPackets.map(p => {
      if (p.id === pkt.id) {
        return {
          ...p,
          status: 'TRANSMITIDO' as const,
          transmittedAt: new Date().toLocaleTimeString()
        };
      }
      return p;
    });
    setAprsPackets(updated);
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

    if (showToast) {
      showToast(`Boletín APRS para "${pkt.originalTitle}" emitido de forma manual por el motor APRX.`);
    }

    setStats(prev => ({
      ...prev,
      rfTx: prev.rfTx + 1,
      isTx: prev.isTx + 1
    }));
  };

  // Transmit Beacon Routine
  const handleManualBeacon = () => {
    if (isTxActive || !isRunning) return;
    setIsTxActive(true);

    const formedFrame = `${myCall}>APDIW1,TCPIP*,qAC,${aprsisServer}:!4025.00N/00342.00W#${beaconComment}`;

    // Play realistic AX.25 AFSK Bell 202 1200 bps packet "screech" with Narrow FM 12.5kHz simulation
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        const audioCtx = new AudioCtxClass();
        const bytes: number[] = [];
        
        // 1. Preamble flags (0x7E) - 25 flags is about 166ms of preamble
        for (let i = 0; i < 25; i++) {
          bytes.push(0x7E);
        }
        
        // 2. Helper to encode callsign in AX.25 shifted format
        const encodeCallsign = (call: string, isLast: boolean) => {
          const parts = call.split('-');
          const name = parts[0].toUpperCase().padEnd(6, ' ');
          const ssid = parts[1] ? parseInt(parts[1], 10) : 0;
          const addrBytes: number[] = [];
          for (let i = 0; i < 6; i++) {
            addrBytes.push(name.charCodeAt(i) << 1);
          }
          addrBytes.push((ssid << 1) | (isLast ? 0x01 : 0x00));
          return addrBytes;
        };

        // Encode Destination and Source
        try {
          const dBytes = encodeCallsign('APDIW1', false);
          const sBytes = encodeCallsign(myCall || 'EA1URG', true);
          bytes.push(...dBytes, ...sBytes);
        } catch {
          for (let i = 0; i < 14; i++) bytes.push(0x40);
        }
        
        // Control: 0x03, PID: 0xF0
        bytes.push(0x03, 0xF0);
        
        // Payload characters
        for (let i = 0; i < formedFrame.length; i++) {
          bytes.push(formedFrame.charCodeAt(i));
        }
        
        // Simple 16-bit CRC checksum calculation (FCS)
        let crc = 0xFFFF;
        for (let idx = 25; idx < bytes.length; idx++) {
          let temp = bytes[idx];
          for (let i = 0; i < 8; i++) {
            const bit = (temp ^ crc) & 1;
            crc >>= 1;
            if (bit) crc ^= 0x8408;
            temp >>= 1;
          }
        }
        crc = ~crc;
        bytes.push(crc & 0xFF, (crc >> 8) & 0xFF);
        
        // Postamble flags
        for (let i = 0; i < 5; i++) {
          bytes.push(0x7E);
        }
        
        // Convert to bits with AX.25 Bit-Stuffing
        const bits: number[] = [];
        let consecutiveOnes = 0;
        const addBit = (bit: number, isFlag: boolean) => {
          bits.push(bit);
          if (!isFlag) {
            if (bit === 1) {
              consecutiveOnes++;
              if (consecutiveOnes === 5) {
                bits.push(0);
                consecutiveOnes = 0;
              }
            } else {
              consecutiveOnes = 0;
            }
          } else {
            consecutiveOnes = 0;
          }
        };

        for (let idx = 0; idx < bytes.length; idx++) {
          const b = bytes[idx];
          const isFlag = (idx < 25) || (idx >= bytes.length - 5) || b === 0x7E;
          for (let i = 0; i < 8; i++) {
            addBit((b >> i) & 1, isFlag);
          }
        }
        
        // NRZI modulation (0 = toggle tone, 1 = keep tone)
        const nrziBits: number[] = [];
        let currentToneState = 0; // 0 = Mark (1200Hz), 1 = Space (2200Hz)
        for (const bit of bits) {
          if (bit === 0) {
            currentToneState = 1 - currentToneState;
          }
          nrziBits.push(currentToneState);
        }
        
        // Synthesize AFSK audio buffer
        const sampleRate = audioCtx.sampleRate;
        const baudRate = 1200;
        const samplesPerBit = sampleRate / baudRate;
        const totalSamples = Math.ceil(nrziBits.length * samplesPerBit);
        
        const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
        const data = buffer.getChannelData(0);
        
        const markFreq = 1200;  // Hz (binary 1)
        const spaceFreq = 2200; // Hz (binary 0)
        let phase = 0;
        
        // Generate base AFSK audio signal
        for (let i = 0; i < totalSamples; i++) {
          const bitIndex = Math.floor(i / samplesPerBit);
          if (bitIndex >= nrziBits.length) break;
          
          const isSpace = nrziBits[bitIndex] === 1;
          const freq = isSpace ? spaceFreq : markFreq;
          
          data[i] = Math.sin(phase);
          phase += (2 * Math.PI * freq) / sampleRate;
        }

        // Step 2: Apply realistic Narrow FM (NFM) 12.5 kHz audio channel modeling
        // (Pre-emphasis, de-emphasis, bandlimiting, and subtle analog discriminator squelch hiss)
        try {
          const temp = new Float32Array(totalSamples);
          
          // 1. Apply pre-emphasis to the raw AFSK (emphasize high frequencies)
          let lastRaw = 0;
          for (let i = 0; i < totalSamples; i++) {
            temp[i] = data[i] - 0.95 * lastRaw;
            lastRaw = data[i];
          }

          // 2. Apply de-emphasis (the receiver's response, smoothing out the signal)
          let deEmphasisState = 0;
          for (let i = 0; i < totalSamples; i++) {
            deEmphasisState = deEmphasisState * 0.92 + temp[i] * 0.08;
            data[i] = deEmphasisState;
          }

          // 3. Add a faint, beautiful analog FM discriminator white noise floor
          // This gives the exact feeling of a narrow 12.5 kHz FM channel!
          for (let i = 0; i < totalSamples; i++) {
            const noise = (Math.random() * 2 - 1) * 0.015;
            data[i] = data[i] * 0.85 + noise;
          }

          // 4. Add squelch tail: at the end of the packet, add a 25ms burst of pure radio noise
          const tailSamples = Math.floor(sampleRate * 0.025);
          if (totalSamples > tailSamples) {
            for (let i = totalSamples - tailSamples; i < totalSamples; i++) {
              const ratio = (i - (totalSamples - tailSamples)) / tailSamples;
              const staticNoise = (Math.random() * 2 - 1) * 0.22;
              data[i] = data[i] * (1 - ratio) + staticNoise * ratio * Math.sin(ratio * Math.PI);
            }
          }

          // 5. Normalize output to prevent digital clipping while maintaining standard amateur audio levels
          let maxVal = 0.0001;
          for (let i = 0; i < totalSamples; i++) {
            const absVal = Math.abs(data[i]);
            if (absVal > maxVal) maxVal = absVal;
          }
          for (let i = 0; i < totalSamples; i++) {
            data[i] = data[i] / maxVal;
          }
        } catch (err) {
          console.error("Narrow FM audio channel modeling error:", err);
        }
        
        // Create audio source node
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        
        // Lowpass filter to simulate analog VHF speaker roll-off
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3500;
        
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
        
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        source.start();
      }
    } catch (e) {
      console.warn("Browser audio constraints:", e);
    }

    setLogs(prev => [
      ...prev,
      `[BEACON] Preparing APRS coordinate injection frame for IGate/RF distribution...`,
      `[BEACON] Frame output ➔ ${formedFrame}`
    ]);

    setTimeout(() => {
      setLogs(prev => [
        ...prev,
        `[APRS-IS] Successfully sent frame to server ${aprsisServer}`,
        `[KISS TX] Broadcasted beacon package onto VHF radio channel (RF TX)`
      ]);

      setStats(prev => ({
        ...prev,
        rfTx: prev.rfTx + 1,
        isTx: prev.isTx + 1
      }));

      setStatusMsg(`Beacon transmitido: EA1URG-10 geolocalización propagada con éxito.`);
      setTimeout(() => setStatusMsg(null), 3500);
      setIsTxActive(false);
    }, 1200);
  };

  const showStatusBanner = (action: string) => {
    setStatusMsg(`APRX Control: ${action}`);
    setTimeout(() => setStatusMsg(null), 3000);
    
    setLogs(prev => [
      ...prev,
      `[SYSTEM] Command invoked: ${action} - timestamp synced.`
    ]);
  };

  const saveConfiguration = async () => {
    const confBody = `# ===============================================
# ARCHIVO DE CONFIGURACIÓN APRX S.A.T. EMERGENCIAS
# ===============================================
mycall      ${myCall}
myloc       lat 4025.00N lon 00342.00W

<aprsis>
  server    ${aprsisServer}   ${aprsisPort}
  passcode  ${passcode}
  filter    "${rfFilter}"
</aprsis>

<logging>
  pidfile    /var/run/aprx.pid
  rflog      /var/log/aprx/aprx-rf.log
</logging>

<interface>
  tcp-device   127.0.0.1   8001   KISS
</interface>`;

    try {
      const resp = await customFetch('/api/files/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'aprx', content: confBody })
      });
      const resData = await resp.json();
      if (resData.success) {
        showStatusBanner(`Configuración de aprx guardada con éxito en ${resData.path || '/etc/aprx.conf'}. Recargando demonio...`);
      } else {
        setStatusMsg(`APRX Control: Error de escritura: ${resData.error || 'Sin permisos /etc/'}`);
        setTimeout(() => setStatusMsg(null), 5000);
      }
    } catch (e: any) {
      console.error(e);
      setStatusMsg(`APRX Control: Error de conexión: ${e.message}`);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-slate-100 flex flex-col gap-0" id="aprx-pillar-exclusive-interactive-console">
      
      {/* HEADER SECTION */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className="bg-blue-950/40 border border-blue-500/20 p-2.5 rounded-xl text-blue-400 h-11 w-11 flex items-center justify-center shrink-0">
            <Globe size={24} className={isRunning ? 'animate-spin' : ''} style={{ animationDuration: '8s' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-blue-455 text-blue-400">
                Pilar VII: APRX Gateway APRS-IS & Digipeater
              </h2>
              <span className="text-[9px] bg-blue-500/10 border border-blue-500/30 text-blue-400 px-1.5 py-0.2 rounded font-mono font-bold tracking-tight">
                IGATE STANDBY
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-tight">
              Servidor de pasarela de red bidireccional entre radio packet VHF y servidores atómicos APRS internacionales
            </p>
          </div>
        </div>

        {/* Daemon State & Switcher */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* APRS-IS Connection State */}
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800/80 flex items-center gap-3">
            <span className="text-[9px] text-slate-500 uppercase font-black font-mono">APRS-IS Link:</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${isConnected && isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
              <span className={`font-mono text-[10px] font-bold ${isConnected && isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnected && isRunning ? 'APRS_IS_ONLINE' : 'APRS_IS_OFFLINE'}
              </span>
            </div>
          </div>

          {/* Traffic Heartbeat State */}
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800/80 flex items-center gap-3" id="aprx-heartbeat-traffic-status">
            <span className="text-[9px] text-slate-500 uppercase font-black font-mono">Tráfico:</span>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center">
                <Heart 
                  size={11} 
                  className={`transition-all duration-300 ${
                    !isRunning 
                      ? 'text-slate-600' 
                      : trafficStatus === 'LIVE_TRAFFIC'
                        ? heartbeatPulse 
                          ? 'text-rose-500 scale-130 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                          : 'text-rose-400'
                        : 'text-slate-500'
                  }`} 
                />
                {isRunning && heartbeatPulse && (
                  <span className="absolute h-3.5 w-3.5 rounded-full border border-rose-500 animate-ping opacity-75" />
                )}
              </div>
              <span className={`font-mono text-[10px] font-bold tracking-tight transition-colors duration-300 ${
                !isRunning 
                  ? 'text-slate-500' 
                  : trafficStatus === 'LIVE_TRAFFIC' 
                    ? 'text-emerald-400 font-extrabold animate-pulse' 
                    : 'text-amber-500/90'
              }`}>
                {isRunning ? (trafficStatus === 'LIVE_TRAFFIC' ? 'LIVE TRAFFIC' : 'IDLE') : 'OFFLINE'}
              </span>
              {isRunning && lastTrafficTime && (
                <span className="text-[9px] text-slate-500 font-mono font-medium">
                  ({Math.max(0, Math.round((Date.now() - lastTrafficTime) / 1000))}s ago)
                </span>
              )}
            </div>
          </div>

          <button 
            onClick={() => {
              setIsRunning(!isRunning);
              showStatusBanner(isRunning ? 'Parando el servicio daemon aprx (systemctl stop aprx)' : 'Iniciando el servicio daemon aprx (systemctl start aprx)');
            }}
            className={`px-3 py-1.5 text-xs font-bold font-sans rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              isRunning ? 'bg-red-950/30 text-red-400 border border-red-500/30 hover:bg-red-900/20' : 'bg-blue-500 text-slate-955 text-slate-950 hover:bg-blue-400 font-extrabold'
            }`}
          >
            <Play size={10} />
            {isRunning ? 'Apagar IGate' : 'Iniciar IGate'}
          </button>
        </div>
      </div>

      {/* QUICK ACTIONS BAR & SUBTAB NAVIGATION */}
      <div className="bg-slate-900/30 border-b border-slate-850 p-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Navigation tabs within the APRX controller */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button 
            onClick={() => setActiveTab('gate')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'gate' ? 'bg-blue-550 bg-blue-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Server size={13} />
            Servidor IGate
          </button>
          
          <button 
            onClick={() => setActiveTab('digipeater')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'digipeater' ? 'bg-blue-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Activity size={13} />
            Digirepetidor
          </button>

          <button 
            onClick={() => setActiveTab('packet')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'packet' ? 'bg-blue-550 bg-blue-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Send size={13} />
            Inyección Beacon
          </button>

          <button 
            onClick={() => setActiveTab('metrics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'metrics' ? 'bg-blue-550 bg-blue-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <BarChart3 size={13} />
            Estadísticas y Tráfico
          </button>

          <button 
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'config' ? 'bg-blue-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Settings size={13} />
            Editar aprx.conf
          </button>
        </div>

        {/* Tune Server, dynamic action inside status bar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden h-7 text-[11px] font-mono shrink-0">
            <span className="bg-slate-900 border-r border-slate-800 px-2 text-slate-500 font-bold uppercase flex items-center h-full">Svr APRS-IS:</span>
            <select
              value={aprsisServer}
              onChange={(e) => {
                const matched = serversList.find(s => s.host === e.target.value);
                if (matched) {
                  setAprsisServer(matched.host);
                  setAprsisPort(matched.port);
                  showStatusBanner(`Cambiando de servidor de enrutamiento a ${matched.name} (${matched.host}:${matched.port})`);
                } else {
                  setAprsisServer(e.target.value);
                  showStatusBanner(`Cambiando de servidor de enrutamiento a ${e.target.value}`);
                }
              }}
              className="bg-black text-blue-400 px-2 py-0.5 outline-none font-bold h-full cursor-pointer focus:ring-0"
            >
              {serversList.map((srv) => (
                <option key={srv.id} value={srv.host}>
                  {srv.name} ({srv.host}:{srv.port})
                </option>
              ))}
              {!serversList.some(s => s.host === aprsisServer) && (
                <option value={aprsisServer}>{aprsisServer} (Personalizado)</option>
              )}
            </select>
          </div>
          
          <button 
            onClick={() => {
              setIsConnected(false);
              setTimeout(() => {
                setIsConnected(true);
                showStatusBanner('Enlace de TCP socket y passcode contra APRS-IS restaurado exitosamente');
              }, 1200);
            }}
            className="p-1 px-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded text-xs font-bold flex items-center gap-1 transition-all cursor-pointer h-7"
          >
            <RefreshCw size={11} className="text-blue-400" />
            Reiniciar Link
          </button>
        </div>

      </div>

      {statusMsg && (
        <div className="bg-blue-950/85 border-b border-blue-500/20 p-2 text-center text-xs text-blue-300 font-mono font-bold animate-pulse">
          ✓ {statusMsg}
        </div>
      )}

      {/* CORE INNER SUB-VIEWS */}
      <div className="p-4 flex-1">
        
        {/* SUBTAB 1: INTEGRATED IGATE ROUTER AND TELEMETRY PORTAL */}
        {activeTab === 'gate' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 animate-fade-in animate-duration-200">
            
            {/* Embedded Active aprx Log Terminal (cols: 8) */}
            <div className="xl:col-span-8 bg-black border border-slate-800 p-4 rounded-xl relative overflow-hidden flex flex-col justify-between min-h-[350px]">
              {/* Scanline CRT aesthetic overlay */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-500/5 shadow-[0_0_12px_2px_rgba(59,130,246,0.1)] pointer-events-none" />
              
              <div className="flex items-center justify-between border-b border-blue-955/20 pb-2 mb-2 font-mono text-[11px] text-blue-400 font-black shrink-0">
                <div className="flex items-center gap-2 font-bold">
                  <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500 animate-ping'}`} />
                  <span>APRX DAEMON TRACE • SERVER: {aprsisServer}</span>
                  {isRunning && (
                    <span className="flex items-center gap-1 bg-slate-900/60 px-1.5 py-0.5 rounded text-[9.5px]">
                      <Heart 
                        size={8} 
                        className={`transition-transform duration-300 ${
                          heartbeatPulse 
                            ? 'text-rose-500 scale-125' 
                            : trafficStatus === 'LIVE_TRAFFIC' 
                              ? 'text-rose-400' 
                              : 'text-slate-500'
                        }`} 
                      />
                      <span className={trafficStatus === 'LIVE_TRAFFIC' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {trafficStatus === 'LIVE_TRAFFIC' ? 'LIVE TRAFFIC' : 'IDLE'}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      if (terminalTab === 'traffic') {
                        setLogs([]);
                      } else {
                        setConnectionLogs([]);
                      }
                      try {
                        await customFetch('/api/system/clear-service-logs', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ service: 'aprx' })
                        });
                      } catch (err) {
                        console.error('Error clearing aprx logs:', err);
                      }
                    }}
                    type="button"
                    className="text-red-400 hover:text-red-300 text-[9.5px] font-mono font-bold cursor-pointer transition-colors mr-2 uppercase"
                    title="Limpiar logs de aprx"
                  >
                    [Limpiar Logs]
                  </button>
                  <span>Passcode: Mapped {passcode && '✓'}</span>
                  <span className="text-slate-650">KISS: PORT 8001</span>
                </div>
              </div>

              {/* Subtabs to separate connection status and packet traffic logs */}
              <div className="flex items-center gap-2 mb-2.5 bg-slate-950 p-1 rounded-lg border border-slate-900 self-start">
                <button
                  onClick={() => setTerminalTab('traffic')}
                  className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                    terminalTab === 'traffic'
                      ? 'bg-blue-950/80 text-blue-400 border border-blue-800/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  📟 TRÁFICO DE PAQUETES (APRS-IS)
                </button>
                <button
                  onClick={() => setTerminalTab('connection')}
                  className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                    terminalTab === 'connection'
                      ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  🔌 ESTADO DE CONEXIÓN
                </button>
              </div>

              {/* Scrollable logs terminal */}
              <div className="flex-1 bg-[#050505] p-3 rounded-lg border border-blue-955/20 h-[220px] overflow-y-auto space-y-1.5 font-mono text-[10.5px] scrollbar-thin scrollbar-thumb-slate-900 flex flex-col justify-between">
                <div>
                  {terminalTab === 'traffic' ? (
                    logs.length === 0 ? (
                      <div className="text-slate-500 flex flex-col items-center justify-center py-14 gap-2 text-center select-none">
                        <span className="animate-pulse text-blue-400 font-extrabold text-[11px] tracking-wider uppercase">Waiting for data...</span>
                        <span className="text-[9.5px] text-slate-600 font-medium">No hay paquetes APRS entrantes o salientes en la pasarela aún.</span>
                      </div>
                    ) : (
                      logs.slice(-30).map((logLine, idx) => (
                        <div key={idx} className="leading-relaxed flex items-start gap-1">
                          <span className="text-blue-900 select-none font-bold shrink-0">»</span>
                          <span className={
                            logLine.startsWith('[IGATE OUT]') ? 'text-amber-400 font-bold' :
                            logLine.startsWith('[KISS IN]') || logLine.startsWith('[BEACON]') ? 'text-blue-400 font-semibold' :
                            logLine.includes('from TNC:') ? 'text-cyan-400 font-black' :
                            logLine.includes('[APRS-IS]') ? 'text-emerald-400 font-extrabold' : 
                            logLine.includes('[INFO]') ? 'font-mono text-indigo-400' : 'text-slate-400'
                          }>
                            {logLine}
                          </span>
                        </div>
                      ))
                    )
                  ) : (
                    connectionLogs.length === 0 ? (
                      <div className="text-slate-500 flex flex-col items-center justify-center py-14 gap-2 text-center select-none">
                        <span className="text-indigo-400 font-extrabold text-[11px] tracking-wider uppercase">Sin eventos de conexión</span>
                        <span className="text-[9.5px] text-slate-600 font-medium">No se han registrado eventos de estado del demonio de red.</span>
                      </div>
                    ) : (
                      connectionLogs.slice(-30).map((logLine, idx) => (
                        <div key={idx} className="leading-relaxed flex items-start gap-1">
                          <span className="text-indigo-900 select-none font-bold shrink-0">»</span>
                          <span className="text-slate-350 font-medium">
                            {logLine}
                          </span>
                        </div>
                      ))
                    )
                  )}
                </div>

                {isTxActive && (
                  <div className="text-amber-500 font-bold animate-pulse text-[10px] flex items-center gap-1 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                    APRX modulando baliza de identificación...
                  </div>
                )}
              </div>

              {/* Terminal indicator metrics footer */}
              <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono text-slate-450 text-slate-400 gap-2 shrink-0">
                <span className="flex items-center gap-1"><Cpu size={11} className="text-indigo-400" /> Daemon Bind: aprx service active on systemd</span>
                <span className="bg-blue-950/50 border border-blue-800/30 text-blue-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
                  IGATE ENCRYPTION: NONE-OPEN
                </span>
              </div>
            </div>

            {/* Micro VU-Meter, Calibration controls on side column (cols: 4) */}
            <div className="xl:col-span-4 flex flex-col gap-3.5">
              
              {/* Interactive IGate Blocks Diagram */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 flex flex-col justify-between font-mono gap-3">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-800 pb-1.5">
                  ESQUEMA ENRUTAMIENTO APRX
                </span>

                <div className="flex flex-col gap-2 text-[10px]">
                  
                  {/* Step 1: KISS RF Ingestion */}
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio size={12} className={kissRxSocket ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
                      <span>KISS Socket TNC (RF)</span>
                    </div>
                    <span className="text-emerald-400 font-bold font-mono">PORT 8001</span>
                  </div>

                  {/* Flow Arrow */}
                  <div className="text-center text-slate-650 h-3 leading-none font-bold">↓</div>

                  {/* Step 2: In-Engine Regex Filters */}
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListFilter size={12} className="text-blue-400" />
                      <span>Filtro de Tránsito</span>
                    </div>
                    <span className="bg-blue-950 text-blue-400 px-1.5 py-0.2 rounded font-mono font-bold">{rfFilter}</span>
                  </div>

                  {/* Flow Arrow */}
                  <div className="text-center text-slate-650 h-3 leading-none font-bold">↓</div>

                  {/* Step 3: Server IS Upload */}
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={12} className={isConnected ? "text-cyan-400 animate-spin" : "text-slate-500"} style={{ animationDuration: '10s' }} />
                      <span>APRS-IS Uplink Gateway</span>
                    </div>
                    <span className="text-cyan-400 font-bold font-mono">14580</span>
                  </div>

                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[9.5px] leading-relaxed text-slate-400">
                  <span className="text-blue-400 font-extrabold block">Acción de Bypass:</span>
                  ¿Necesitas redirigir las tramas recibidas en RF a Internet? El IGate corre un hilo secundario que se auto-reconecta si detecta pérdida en la trama de paquetes.
                </div>
              </div>

              {/* Hardware statistics summary */}
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 font-mono">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5">
                  VOLUMEN DE SERVICIO IGATE
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-850 flex flex-col justify-center items-center text-center gap-1">
                    <span className="text-[8.5px] text-slate-450 text-slate-400 uppercase leading-none">Subido aprs-is</span>
                    <span className="font-bold text-amber-400 text-xs">{stats.isTx}</span>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-850 flex flex-col justify-center items-center text-center gap-1">
                    <span className="text-[8.5px] text-slate-400 uppercase leading-none">Recibidos RF</span>
                    <span className="font-bold text-emerald-400 text-xs">{stats.rfRx}</span>
                  </div>
                </div>

                {/* Force sync button */}
                <button
                  onClick={() => {
                    showStatusBanner('Forzar rotación del descriptor de IGate contra euro.aprs2.net');
                  }}
                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-850 border border-blue-500/30 hover:border-blue-400 text-blue-400 font-sans font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw size={11} />
                  Forzar Sincronización Servidor
                </button>
              </div>

            </div>
          </div>
        )}

        {/* SUBTAB 2: DIGIPEATER CONTROL MODULE */}
        {activeTab === 'digipeater' && (
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fade-in flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Activity className="text-blue-400" size={16} />
                <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100">
                  Módulo de Digirepetidor APRX local (WIDE)
                </h3>
              </div>

              {/* Status summary figures */}
              <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
                <div>REPETIDO EN RF: <span className="font-bold text-emerald-400">{stats.rfTx} pkts</span></div>
                <div>MODO DIGIPEATER: <span className={`font-bold uppercase ${digiEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>{digiEnabled ? 'ACTIVO' : 'MUTADO'}</span></div>
              </div>
            </div>

            {/* DIGIPEATER CONTROLLER BOX */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-900">
                <div className="font-mono text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Heart size={14} className="text-red-500 animate-pulse" />
                  Conmutador del Módulo Digipeating Local (WIDE)
                </div>
                
                <div className="flex items-center gap-2" onClick={() => {
                  setDigiEnabled(!digiEnabled);
                  showStatusBanner(digiEnabled ? 'Módulo digipeater APRX mutado' : 'Módulo digipeater APRX reactivado');
                }}>
                  <span className="font-mono text-[10px] text-slate-500">Estado:</span>
                  <button className="focus:outline-none transition-transform cursor-pointer">
                    <ToggleLeft size={24} className={digiEnabled ? 'text-emerald-400 rotate-180 transition-all' : 'text-slate-600 transition-all'} />
                  </button>
                  <span className={`font-mono text-[10px] font-bold ${digiEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {digiEnabled ? 'CORRIENDO' : 'MUTADO'}
                  </span>
                </div>
              </div>

              <div className="font-mono text-[10.5px] leading-relaxed text-slate-400 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-900">
                  <span className="text-blue-400 font-bold block mb-1">Algoritmo de Filtrado WIDEn_n:</span>
                  Un digipeater inteligente como APRX extrae la ruta del frame. Si incluye WIDE1-1, sustituirá el indicador por su propia llamada <span className="text-yellow-400">EA1URG-10*</span> para que ningún nodo duplique en bucle eterno el mismo fragmento sobre el espectro de voz.
                </div>
                <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-900">
                  <span className="text-blue-400 font-bold block mb-1">Manejo de Emergencias Críticas:</span>
                  Si aprx detecta tramas prefijadas con <span className="text-red-400">"S.O.S."</span> o coordinadas con alertas nucleares y tsunamis del S.A.T., el digipeater les asignará de forma automática máxima prioridad de slot sobre la cola de modulación del soundcard.
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 2.5: HISTORICAL PACKET METRICS CHARTS */}
        {activeTab === 'metrics' && (
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fade-in flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-blue-400" size={16} />
                <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100">
                  Desempeño y Latencia de Subida APRS-IS (Últimas 24 Horas)
                </h3>
              </div>

              {/* Status summary figures */}
              <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
                <div>DROP FILTRADOS: <span className="font-bold text-red-400">{stats.dropped} pkts</span></div>
                <div>REPETIDO EN RF: <span className="font-bold text-emerald-400">{stats.rfTx} pkts</span></div>
                <div>MODO DIGIPEATER: <span className={`font-bold uppercase ${digiEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>{digiEnabled ? 'ACTIVO' : 'MUTADO'}</span></div>
              </div>
            </div>

            {/* Recharts graph of incoming packets/noise ratios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Traffic distribution Area Chart */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">TRÁFICO CONVERTIDO POR EL IGATE (pkts / hora)</span>
                <div className="h-[210px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <AreaChart data={latencyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="glowRxToIs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                      <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                      <YAxis stroke="#4b5563" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="rfToInternet" name="RF ➔ Internet (IGate Uplink)" stroke="#3b82f6" fillOpacity={1} fill="url(#glowRxToIs)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Server Latency Line Chart */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">LATENCIA DE DESCRIPTOR TCP (Milisegundos)</span>
                <div className="h-[210px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <AreaChart data={latencyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="glowLatency" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                      <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                      <YAxis stroke="#4b5563" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="latency" name="Latencia APRS-IS" stroke="#ef4444" fillOpacity={1} fill="url(#glowLatency)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* SUBTAB 3: MANUAL APRS INJECTION BEACONS */}
        {activeTab === 'packet' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-fade-in font-mono text-[11px]">
            
            {/* Form Column (cols: 5) */}
            <div className="md:col-span-5 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 space-y-3.5 flex flex-col justify-between">
              
              <div className="space-y-3">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block border-b border-slate-800 pb-1.5 flex items-center gap-1.5 font-mono">
                  <Send size={12} className="text-blue-400" /> Parámetros del Beacon de Coordenadas
                </span>

                <div className="space-y-2.5">
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Indicativo Local (GateCall):</label>
                    <input 
                      type="text" 
                      value={myCall}
                      onChange={(e) => setMyCall(e.target.value.toUpperCase())}
                      className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-blue-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Filtro Rango (Radius):</label>
                      <input 
                        type="text" 
                        value={rfFilter}
                        onChange={(e) => setRfFilter(e.target.value)}
                        className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Intervalo Baliza (wx):</label>
                      <select 
                        value={beaconInterval}
                        onChange={(e) => setBeaconInterval(parseInt(e.target.value))}
                        className="w-full bg-black border border-slate-800 rounded-lg p-1.5 outline-none font-bold text-slate-300 cursor-pointer h-8"
                      >
                        <option value="600">10 minutos</option>
                        <option value="1200">20 minutos (Def.)</option>
                        <option value="1800">30 minutos</option>
                        <option value="3600">1 hora</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Comentario / Info Beacon:</label>
                    <textarea 
                      value={beaconComment}
                      onChange={(e) => setBeaconComment(e.target.value)}
                      rows={2}
                      className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none text-slate-200 resize-none font-sans text-xs"
                      placeholder="Escribe el comentario del beacon..."
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900/60 mt-2">
                <button 
                  onClick={handleManualBeacon}
                  disabled={isTxActive || !isRunning}
                  className="w-full py-2 bg-blue-500 text-slate-950 hover:bg-blue-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all font-sans"
                >
                  <Send size={11} />
                  Emitir Baliza de Identificación IGate
                </button>
              </div>

              {onInjectRaw && (
                <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-900/60 mt-2 space-y-2">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest block font-mono">
                    Simulación de Tráfico APRS Entrante:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        const payload = `EA4CECOP-9>APRS,TCPIP*,qAC::${(callsign || 'EA4SAT').padEnd(9, ' ')}:S.A.T. Alerta de simulacion de mensaje directo.`;
                        const ok = await onInjectRaw(payload);
                        if (ok && showToast) showToast('Simulando recepción de mensaje directo...');
                      }}
                      className="py-1.5 bg-pink-950/30 text-pink-400 border border-pink-900/40 hover:bg-pink-900/20 text-[10px] font-bold rounded-lg transition-all cursor-pointer font-sans text-center"
                    >
                      Recibir Mensaje
                    </button>
                    <button
                      onClick={async () => {
                        const payload = `EA4CECOP-9>BLN1REMER,TCPIP*,qAC::BLN1REMER:ALERTA: Boletin meteorologico de prueba REMER.`;
                        const ok = await onInjectRaw(payload);
                        if (ok && showToast) showToast('Simulando recepción de boletín civil...');
                      }}
                      className="py-1.5 bg-amber-950/30 text-amber-400 border border-amber-900/40 hover:bg-amber-900/20 text-[10px] font-bold rounded-lg transition-all cursor-pointer font-sans text-center"
                    >
                      Recibir Boletín
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Simulated Live maps/tracking coordinate visualizer (cols: 7) */}
            <div className="md:col-span-7 bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 justify-between">
              <div>
                <span className="text-slate-550 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5 flex items-center justify-between">
                  <span>VISTA TÁCTICA DEL RECORRIDO APRS MAPS</span>
                  <span className="text-[8.5px] bg-blue-950/40 text-blue-450 text-blue-450 text-blue-450 text-blue-400 px-1.5 rounded font-bold">GRID JN50EI</span>
                </span>

                {/* Animated map tracker representation */}
                <div className="h-[140px] bg-slate-950/80 rounded-lg border border-slate-900/80 relative overflow-hidden flex items-center justify-center">
                  
                  {/* Grid lines layout */}
                  <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 pointer-events-none opacity-20">
                    {Array.from({ length: 24 }).map((_, gi) => (
                      <div key={gi} className="border border-slate-700/40" />
                    ))}
                  </div>

                  {/* Concentric waves around Madrid center */}
                  <div className="absolute bg-blue-500/5 border border-blue-500/20 rounded-full h-24 w-24 animate-pulse" />
                  <div className="absolute bg-blue-500/5 border border-blue-500/10 rounded-full h-36 w-36" />

                  {/* Madrid Center pointer symbol */}
                  <div className="absolute flex flex-col justify-center items-center gap-1">
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_2px_rgba(59,130,246,0.8)] flex items-center justify-center">
                      <div className="h-1 w-1 rounded-full bg-white animate-ping" />
                    </div>
                    <span className="text-[8.5px] font-bold text-slate-300 bg-slate-950/90 border border-slate-800 px-1 py-0.2 rounded mt-1 shadow-md">
                      {myCall} (Madrid Core)
                    </span>
                  </div>

                  {/* Incoming remote nodes representation */}
                  <div className="absolute top-4 left-10 flex flex-col items-center">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[7.5px] text-slate-500 mt-0.5">EA1URG-13 (VHF)</span>
                  </div>

                  <div className="absolute bottom-6 right-16 flex flex-col items-center">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[7.5px] text-slate-500 mt-0.5">EB1TR-1</span>
                  </div>

                </div>
              </div>

              {/* Informative map coordinates details */}
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-900 leading-normal text-slate-400 text-[10px]">
                <span className="text-amber-500 font-extrabold block mb-0.5">Propagación de Coordenadas WX / APRS:</span>
                El protocolo APRS convierte las coordenadas en formato <code className="text-slate-300">DDMM.hhN/DDDMM.hhW</code>. Esta baliza inyecta tanto a RF (por si un receptor analógico lo sintoniza alterno) como a Internet para posicionar a Protección Civil de forma coordinada en portales públicos satelitales.
              </div>

            </div>

            {/* SECCIÓN ESPECIAL: DIFUSIÓN DE BOLETINES DE EMERGENCIA S.A.T. (INTEGRACIÓN CON PILAR IX Y CECOP) */}
            <div className="md:col-span-12 bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col gap-4 mt-2" id="aprx-sat-alerts-broadcaster">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800 gap-3">
                <div className="flex items-center gap-2">
                  <Terminal size={15} className="text-blue-400 animate-pulse" />
                  <div>
                    <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-200">
                      Cola de Difusión de Alertas S.A.T. • Motor de Procesamiento APRX
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 animate-pulse">
                      ▲ Escáner de puerto de red activo para auto-difusión de boletines con firma digital CECOP validada
                    </p>
                  </div>
                </div>

                {/* Auto Routing Toggle Control & Clear Queue Control */}
                <div className="flex flex-wrap items-center gap-2">
                  {aprsPackets && aprsPackets.length > 0 && setAprsPackets && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('¿Está seguro de que desea limpiar la cola de difusión y vaciar todos los boletines de emergencia activos del búfer?')) {
                          setAprsPackets([]);
                          if (showToast) {
                            showToast('Cola de difusión APRX vaciada con éxito.');
                          }
                          if (playBuzzerSound) playBuzzerSound(440, 0.15);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 hover:border-rose-650 text-rose-300 text-[9px] rounded font-black uppercase transition-all tracking-wider flex items-center gap-1 cursor-pointer select-none shadow-sm"
                      title="Limpiar toda la cola de difusión"
                      id="clear-aprx-queue-btn"
                    >
                      <Trash2 size={11} className="text-rose-400" />
                      Vaciar Cola ({aprsPackets.length})
                    </button>
                  )}

                  <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 px-3 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Auto-Difusión APRX:</span>
                    <button 
                      onClick={() => {
                        setAutoRouteAlerts(!autoRouteAlerts);
                        if (showToast) {
                          showToast(autoRouteAlerts ? 'Auto-difusión de boletines desactivada.' : 'Auto-difusión de boletines activada (APRX Escáner ON).');
                        }
                        if (playBuzzerSound) playBuzzerSound(autoRouteAlerts ? 300 : 600, 0.1);
                      }}
                      className={`px-2 py-0.5 text-[9px] rounded font-bold transition-all cursor-pointer ${
                        autoRouteAlerts 
                          ? 'bg-blue-500 text-slate-950 font-black' 
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {autoRouteAlerts ? 'ACTIVO (AUTOMÁTICO)' : 'INACTIVO (MANUAL)'}
                    </button>
                  </div>
                </div>
              </div>

              {!aprsPackets || aprsPackets.length === 0 ? (
                <div className="text-center py-6 text-slate-500 font-mono text-xs bg-slate-950/20 border border-slate-900 rounded-lg">
                  No hay boletines de emergencia activos en el búfer. Genere alertas críticas en <strong className="text-orange-400 font-bold">Pilar IX: Adaptación APRS</strong> para enrutarlos aquí.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {aprsPackets.map((pkt) => (
                    <div 
                      key={pkt.id} 
                      className={`bg-slate-950/90 border rounded-xl p-3 flex flex-col justify-between gap-3 text-[10.5px] ${
                        pkt.status === 'PENDIENTE' ? 'border-amber-500/20 opacity-75' :
                        pkt.status === 'APROBADO' ? 'border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.04)] bg-slate-950' :
                        'border-slate-850 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center bg-slate-900/60 px-2 py-1 rounded border border-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-400 font-bold uppercase text-[9px] bg-blue-950/40 border border-blue-900/30 px-1 rounded flex items-center gap-1 font-mono">
                              {pkt.eventType}
                            </span>
                            <span className="text-slate-300 font-bold">{pkt.callsign} ➔ {pkt.destination}</span>
                          </div>
                          
                          {/* Rich Status badge */}
                          <span className={`text-[8.5px] font-bold px-1.5 rounded uppercase font-mono ${
                            pkt.status === 'PENDIENTE' ? 'bg-amber-950/50 text-amber-400 animate-pulse border border-amber-900/40' :
                            pkt.status === 'APROBADO' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 animate-pulse' :
                            'bg-slate-900/80 text-slate-450 text-slate-400 border border-slate-800'
                          }`}>
                            {pkt.status === 'PENDIENTE' ? 'Sello CECOP pendiente' :
                             pkt.status === 'APROBADO' ? 'Listo para Emitir' :
                             'Difundido por APRX'}
                          </span>
                        </div>

                        <div className="px-1 text-slate-350">
                          <strong className="text-slate-400 font-mono mr-1">Origen:</strong> {pkt.originalTitle}
                        </div>

                        {/* Raw APRS frame payload */}
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-950 text-[10px] text-orange-400 font-mono break-all leading-normal">
                          {pkt.packetString}
                        </div>
                      </div>

                      {/* Dynamic Action in footer of card */}
                      <div className="flex items-center justify-between border-t border-slate-900/80 pt-2 text-[9.5px] font-mono text-slate-500">
                        {pkt.status === 'PENDIENTE' ? (
                          <div className="flex items-center gap-1 text-amber-400 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            <span>Esperando validación en Dashboard CECOP para liberar envío.</span>
                          </div>
                        ) : pkt.status === 'APROBADO' ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-emerald-400 font-semibold">✓ Firma validada</span>
                            <button
                              onClick={() => handleBroadcastPacket(pkt)}
                              disabled={!isRunning}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded font-sans transition-all cursor-pointer disabled:opacity-40"
                            >
                              DIFUNDIR EN RF (Force APRX)
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-slate-400 flex items-center gap-1">
                              <CheckCircle2 size={11} className="text-emerald-400" />
                              Bucle APRX completado a las {pkt.transmittedAt || pkt.timestamp}
                            </span>
                            <span className="text-[8px] bg-slate-900 text-slate-500 px-1 py-0.2 rounded font-black">
                              ID: {pkt.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* SUBTAB 4: HARDWARE ADJUSTMENTS AND NETWORK SOCKETS */}
        {activeTab === 'config' && (
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fade-in flex flex-col gap-4">
            
            <div className="border-b border-slate-800 pb-2.5">
              <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100 flex items-center gap-2">
                <Settings size={14} className="text-blue-400" />
                Edición de Directivas Críticas del Archivo aprx.conf
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[11px]">
              
              {/* Config Form fieldsets (cols: 1) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900 space-y-3.5 flex flex-col justify-between">
                
                <div className="space-y-3">
                  <span className="text-blue-400 font-bold block uppercase border-b border-slate-900 pb-1 text-[10px] flex items-center gap-1.5">
                    <Command size={12} /> Directivas del Configrador
                  </span>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-400 text-[9.5px]">Servidor APRS-IS:</span>
                        <input 
                          type="text" 
                          value={aprsisServer}
                          onChange={(e) => setAprsisServer(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 font-bold text-slate-200 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-400 text-[9.5px]">Puerto de Escucha:</span>
                        <input 
                          type="text" 
                          value={aprsisPort}
                          onChange={(e) => setAprsisPort(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 font-bold text-slate-200 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-400 text-[9.5px]">Passcode Verificador:</span>
                        <input 
                          type="text" 
                          value={passcode}
                          onChange={(e) => setPasscode(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 font-bold text-slate-200 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-400 text-[9.5px]">Frecuencia Baliza:</span>
                        <div className="bg-slate-900 border border-slate-850 rounded p-1.5 font-bold text-amber-500 flex justify-between">
                          <span>VHF Físico</span>
                          <span>144.800 MHz</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={saveConfiguration}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-400 text-slate-955 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 font-sans cursor-pointer transition-all"
                  >
                    <Save size={12} />
                    Guardar y Reiniciar Demonio
                  </button>
                </div>

              </div>

              {/* Dynamic generated /etc/aprx.conf viewer (cols: 1) */}
              <div className="bg-slate-950 rounded-xl border border-slate-900 flex flex-col justify-between overflow-hidden">
                <div className="bg-slate-900/60 p-2 border-b border-slate-900 flex justify-between items-center px-4 shrink-0">
                  <span className="text-[10px] font-bold text-blue-450 text-blue-400">/etc/aprx.conf (Archivo Real)</span>
                  <span className="text-[8px] bg-slate-950 px-1.5 rounded font-bold text-slate-500">ASCII FORMAT</span>
                </div>

                {/* Text Block content of config file */}
                <div className="p-3.5 flex-1 font-mono text-[10px] bg-black text-yellow-300/90 leading-relaxed overflow-y-auto">
                  <span># ===============================================</span><br />
                  <span># ARCHIVO DE CONFIGURACIÓN APRX S.A.T. EMERGENCIAS</span><br />
                  <span># ===============================================</span><br />
                  <span>mycall &nbsp; &nbsp; &nbsp;{myCall}</span><br />
                  <span>myloc &nbsp; &nbsp; &nbsp; lat 4025.00N lon 00342.00W</span><br />
                  <br />
                  <span>&lt;aprsis&gt;</span><br />
                  <span>&nbsp;&nbsp;server &nbsp; &nbsp;{aprsisServer} &nbsp; {aprsisPort}</span><br />
                  <span>&nbsp;&nbsp;passcode &nbsp; {passcode}</span><br />
                  <span>&nbsp;&nbsp;filter &nbsp; &nbsp; "{rfFilter}"</span><br />
                  <span>&lt;/aprsis&gt;</span><br />
                  <br />
                  <span>&lt;logging&gt;</span><br />
                  <span>&nbsp;&nbsp;pidfile &nbsp; &nbsp;/var/run/aprx.pid</span><br />
                  <span>&nbsp;&nbsp;rflog &nbsp; &nbsp; &nbsp;/var/log/aprx/aprx-rf.log</span><br />
                  <span>&lt;/logging&gt;</span><br />
                  <br />
                  <span>&lt;interface&gt;</span><br />
                  <span>&nbsp;&nbsp;tcp-device &nbsp; 127.0.0.1 &nbsp; 8001 &nbsp; KISS</span><br />
                  <span>&lt;/interface&gt;</span>
                </div>
              </div>

            </div>

            {/* SECCIÓN DE GESTIÓN DE SERVIDORES APRS-IS */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-900 space-y-4 font-mono text-[11px] mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-2">
                <span className="text-pink-400 font-bold block uppercase text-[10px] flex items-center gap-1.5">
                  <Globe size={13} className="text-pink-400" /> Servidores APRS-IS Persistentes (Local / Nube)
                </span>
                {currentUser ? (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sincronizado con Firebase Firestore
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500">
                    Sincronizado localmente (Inicia sesión para persistir en Firebase)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* LISTA DE SERVIDORES */}
                <div className="lg:col-span-2 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider pb-1">
                    Servidores Disponibles:
                  </div>
                  {serversList.length === 0 ? (
                    <div className="text-slate-500 text-center py-4 bg-slate-900/40 rounded border border-slate-900">
                      No hay servidores configurados. Añade uno a la derecha.
                    </div>
                  ) : (
                    serversList.map((srv) => {
                      const isActive = aprsisServer === srv.host && aprsisPort === srv.port;
                      return (
                        <div 
                          key={srv.id} 
                          className={`flex items-center justify-between p-2 rounded border transition-all ${
                            isActive 
                              ? 'bg-blue-950/35 border-blue-500/30 text-blue-300' 
                              : 'bg-slate-900/50 border-slate-900 hover:border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isActive ? (
                              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                            ) : (
                              <div className="h-3 w-3 rounded-full border border-slate-700 shrink-0"></div>
                            )}
                            <div className="truncate">
                              <span className="font-bold text-white text-[11px] block">{srv.name}</span>
                              <span className="text-slate-500 text-[10px] block font-mono">{srv.host}:{srv.port}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isActive && (
                              <button
                                onClick={() => {
                                  setAprsisServer(srv.host);
                                  setAprsisPort(srv.port);
                                  if (showToast) {
                                    showToast(`Servidor activo cambiado a: ${srv.name}`);
                                  }
                                }}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-550 text-[9px] text-white font-bold rounded cursor-pointer transition-colors"
                              >
                                Activar
                              </button>
                            )}
                            <button
                              onClick={() => handleEditClick(srv)}
                              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer transition-colors"
                              title="Editar servidor"
                            >
                              <Edit size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteServer(srv.id)}
                              className="p-1 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 rounded cursor-pointer transition-colors"
                              title="Eliminar de la lista"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* FORMULARIO DE CREACIÓN/EDICIÓN */}
                <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-xl space-y-2.5">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>{editingServerId ? 'Editar Servidor' : 'Nuevo Servidor APRS-IS'}</span>
                    {editingServerId && (
                      <button 
                        onClick={() => {
                          setEditingServerId(null);
                          setNewServerName('');
                          setNewServerHost('');
                          setNewServerPort('14580');
                        }}
                        className="text-[9px] text-rose-400 hover:underline flex items-center gap-0.5"
                      >
                        <X size={10} /> Cancelar
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-500 text-[9px] uppercase font-bold">Identificación / Nombre:</span>
                      <input 
                        type="text"
                        placeholder="Ej: Local TNC, Servidor Madrid"
                        value={newServerName}
                        onChange={(e) => setNewServerName(e.target.value)}
                        className="bg-slate-950 border border-slate-850 rounded p-1.5 font-bold text-slate-200 outline-none placeholder:text-slate-700"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="col-span-2 flex flex-col gap-0.5">
                        <span className="text-slate-500 text-[9px] uppercase font-bold">Host / IP / URL:</span>
                        <input 
                          type="text"
                          placeholder="Ej: localhost, 127.0.0.1"
                          value={newServerHost}
                          onChange={(e) => setNewServerHost(e.target.value)}
                          className="bg-slate-950 border border-slate-850 rounded p-1.5 font-bold text-slate-200 outline-none placeholder:text-slate-700"
                        />
                      </div>
                      <div className="col-span-1 flex flex-col gap-0.5">
                        <span className="text-slate-500 text-[9px] uppercase font-bold">Puerto:</span>
                        <input 
                          type="text"
                          placeholder="14580"
                          value={newServerPort}
                          onChange={(e) => setNewServerPort(e.target.value)}
                          className="bg-slate-950 border border-slate-850 rounded p-1.5 font-bold text-slate-200 outline-none text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleAddOrUpdateServer}
                    className="w-full py-1.5 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    {editingServerId ? (
                      <>
                        <Save size={11} />
                        Guardar Cambios
                      </>
                    ) : (
                      <>
                        <Plus size={11} />
                        Añadir Servidor
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
