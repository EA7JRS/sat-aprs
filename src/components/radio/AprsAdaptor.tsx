import React, { useState, useEffect, useMemo } from 'react';
import { 
  Radio, 
  ShieldAlert, 
  CheckCircle2, 
  Activity, 
  FileText, 
  Sliders, 
  Clock, 
  Database, 
  AlertTriangle, 
  Cpu, 
  Globe, 
  Send, 
  Volume2, 
  VolumeX, 
  Plus, 
  Trash2, 
  Play, 
  Check, 
  RotateCcw,
  Sparkles,
  Layers,
  ChevronRight,
  HelpCircle,
  FileCode,
  Compass
} from 'lucide-react';
import { EarthquakeEvent, DgtIncident, CsnReaStation, WeatherTelemetry } from '../../types';
import { NavareaWarning } from '../environment/NavareaMonitor';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Cell } from 'recharts';

// Explicit APRS Packet definition
export interface AprsPacket {
  id: string;
  sourceEventId: string;
  eventType: 'sismo' | 'incendio' | 'meteo' | 'radiologico' | 'dgt' | 'manual';
  originalTitle: string;
  originalDetail: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  callsign: string;      // Source e.g. EA4SAT-1
  destination: string;   // Destination e.g. APCE01
  path: string;          // e.g. WIDE1-1,WIDE2-1
  aprsType: 'BULLETIN' | 'OBJECT' | 'BEACON' | 'MESSAGE';
  symbol: string;        // Symbol character e.g. [, \, #
  messageText: string;   // Synthesized message body
  packetString: string;  // Full raw APRS string
  status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'TRANSMITIDO';
  auditNotes?: string;
  auditedBy?: string;
  auditedAt?: string;
  transmittedAt?: string;
  isEmergency: boolean;  // Flags severe emergency broadcasts
  visualPriority?: 'Crítica' | 'Alta' | 'Informativa' | 'Normal';
}

interface AprsAdaptorProps {
  earthquakes: EarthquakeEvent[];
  csnStations: CsnReaStation[];
  dgtIncidents: DgtIncident[];
  navareas: NavareaWarning[];
  aprsPackets: AprsPacket[];
  setAprsPackets: React.Dispatch<React.SetStateAction<AprsPacket[]>>;
  playBuzzerSound?: (freq?: number, duration?: number, type?: OscillatorType) => void;
  showToast?: (msg: string) => void;
  weather?: WeatherTelemetry;
}

// Convert Decimal Coordinates to standard APRS format:
// Latitude: DDMM.hh N/S  (2 digits deg, 2 digits min, 2 digits dec-min)
// Longitude: DDDMM.hh E/W (3 digits deg, 2 digits min, 2 digits dec-min)
export function convertToAprsCoords(lat: number, lon: number): { latStr: string; lonStr: string } {
  try {
    // Latitude
    const latAbs = Math.abs(lat);
    let latDeg = Math.floor(latAbs);
    let latMinHundredths = Math.round((latAbs - latDeg) * 60 * 100);
    if (latMinHundredths >= 6000) {
      latMinHundredths -= 6000;
      latDeg += 1;
    }
    const latMinInt = Math.floor(latMinHundredths / 100);
    const latFrac = latMinHundredths % 100;
    
    const latDegStr = latDeg.toString().padStart(2, '0');
    const latMinStr = latMinInt.toString().padStart(2, '0');
    const latFracStr = latFrac.toString().padStart(2, '0');
    const latHem = lat >= 0 ? 'N' : 'S';
    const latStr = `${latDegStr}${latMinStr}.${latFracStr}${latHem}`;

    // Longitude
    const lonAbs = Math.abs(lon);
    let lonDeg = Math.floor(lonAbs);
    let lonMinHundredths = Math.round((lonAbs - lonDeg) * 60 * 100);
    if (lonMinHundredths >= 6000) {
      lonMinHundredths -= 6000;
      lonDeg += 1;
    }
    const lonMinInt = Math.floor(lonMinHundredths / 100);
    const lonFrac = lonMinHundredths % 100;

    const lonDegStr = lonDeg.toString().padStart(3, '0');
    const lonMinStr = lonMinInt.toString().padStart(2, '0');
    const lonFracStr = lonFrac.toString().padStart(2, '0');
    const lonHem = lon >= 0 ? 'E' : 'W';
    const lonStr = `${lonDegStr}${lonMinStr}.${lonFracStr}${lonHem}`;

    return { latStr, lonStr };
  } catch (e) {
    return { latStr: "4000.00N", lonStr: "00300.00W" };
  }
}

// Full AX.25 Frame Generator Mock (produces beautiful telemetry byte logs)
export function generateAx25MockHex(
  source: string,
  dest: string,
  path: string,
  payload: string
): { hex: string; parts: { label: string; offset: number; len: number; value: string; bytes: string }[] } {
  const encodeCallsign = (call: string): string => {
    const parts = call.split('-');
    const base = parts[0].toUpperCase().padEnd(6, ' ');
    const ssid = parts[1] ? parseInt(parts[1], 10) : 0;
    
    let bytesStr = '';
    // Each char in base shifted left by 1
    for (let i = 0; i < 6; i++) {
      const code = base.charCodeAt(i);
      const shifted = (code << 1) & 0xFE;
      bytesStr += shifted.toString(16).toUpperCase().padStart(2, '0') + ' ';
    }
    // SSID byte shifted left by 1, with reserved bits
    const ssidByte = ((ssid << 1) | 0x60) & 0xFE;
    bytesStr += ssidByte.toString(16).toUpperCase().padStart(2, '0') + ' ';
    return bytesStr.trim();
  };

  const destBytes = encodeCallsign(dest || 'APRS');
  const srcBytes = encodeCallsign(source || 'EA4SAT');
  
  let pathBytes = '';
  const viaList = path ? path.split(',') : [];
  viaList.forEach((via) => {
    pathBytes += encodeCallsign(via.trim()) + ' ';
  });
  
  // Set the "last address" bit (bit 0 of the SSID byte of the last address)
  const pathBytesArray = pathBytes.trim().split(' ');
  if (pathBytesArray.length > 0 && pathBytesArray[pathBytesArray.length - 1]) {
    const lastByteIndex = pathBytesArray.length - 1;
    const lastByteVal = parseInt(pathBytesArray[lastByteIndex], 16);
    // Set the HDLC address extension bit (1)
    const finalByteVal = (lastByteVal | 0x01).toString(16).toUpperCase().padStart(2, '0');
    pathBytesArray[lastByteIndex] = finalByteVal;
    pathBytes = pathBytesArray.join(' ');
  } else {
    // If no path, set bit 0 of source SSID base to 1
    const srcBytesArray = srcBytes.split(' ');
    const lastByteIndex = srcBytesArray.length - 1;
    const lastByteVal = parseInt(srcBytesArray[lastByteIndex], 16);
    srcBytesArray[lastByteIndex] = (lastByteVal | 0x01).toString(16).toUpperCase().padStart(2, '0');
  }

  // UI Control frame = 0x03, PID = 0xF0
  const controlByte = '03';
  const pidByte = 'F0';

  // Info Field
  let infoBytes = '';
  for (let i = 0; i < payload.length; i++) {
    infoBytes += payload.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0') + ' ';
  }
  infoBytes = infoBytes.trim();

  // Flags y FCS
  const startFlag = '7E';
  const endFlag = '7E';
  
  // Fake CRC CCITT calculation representing rigor
  let sum = 0;
  payload.split('').forEach(c => sum += c.charCodeAt(0));
  const fcsHex = (sum % 65535).toString(16).toUpperCase().padStart(4, '0');
  const fcsBytes = fcsHex.slice(0, 2) + ' ' + fcsHex.slice(2, 4);

  const fullHex = `${startFlag} ${destBytes} ${srcBytes} ${pathBytes.trim()} ${controlByte} ${pidByte} ${infoBytes} ${fcsBytes} ${endFlag}`.replace(/\s+/g, ' ');

  const parts = [
    { label: 'FLAG INI', offset: 0, len: 1, value: '0x7E', bytes: startFlag },
    { label: 'DESTINO (AX.25 Adr)', offset: 1, len: 7, value: dest, bytes: destBytes },
    { label: 'ORIGEN (AX.25 Adr)', offset: 8, len: 7, value: source, bytes: srcBytes },
    { label: 'DIGIPEATER PATH', offset: 15, len: viaList.length * 7, value: path, bytes: pathBytes.trim() },
    { label: 'CONTROL (UI Frame)', offset: 15 + viaList.length * 7, len: 1, value: '0x03 (Unnumbered Info)', bytes: controlByte },
    { label: 'PID (No Layer 3)', offset: 16 + viaList.length * 7, len: 1, value: '0xF0 (APRS Standard)', bytes: pidByte },
    { label: 'DATOS (APRS Payload)', offset: 17 + viaList.length * 7, len: payload.length, value: `ASCII Length: ${payload.length}`, bytes: infoBytes },
    { label: 'FCS (FCS CRC-16)', offset: 17 + viaList.length * 7 + payload.length, len: 2, value: `CRC-16-CCITT: ${fcsHex}`, bytes: fcsBytes },
    { label: 'FLAG END', offset: 19 + viaList.length * 7 + payload.length, len: 1, value: '0x7E', bytes: endFlag }
  ];

  return { hex: fullHex, parts };
}

// HTML audio player for AFSK modulation
export const playPacketAfsktone = () => {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const audioCtx = new AudioCtxClass();
    
    // Generate a quick random AX.25 frame simulation for acoustic burst (around 450-600ms)
    const bytes: number[] = [];
    
    // 1. Preamble (15 flags)
    for (let i = 0; i < 15; i++) {
      bytes.push(0x7E);
    }
    
    // Mock AX.25 address headers and PID/Control bytes
    for (let i = 0; i < 14; i++) {
      bytes.push(0x50 + Math.floor(Math.random() * 20));
    }
    bytes.push(0x03, 0xF0);
    
    // Random APRS text payload
    const text = "APRS TACTICAL PACKET SYNC BEACON SIGNAL TEST";
    for (let i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i));
    }
    
    // FCS CRC-16
    bytes.push(0xAA, 0xBB);
    
    // Postamble flags
    for (let i = 0; i < 4; i++) {
      bytes.push(0x7E);
    }
    
    // Bit-Stuffing
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
      const isFlag = (idx < 15) || (idx >= bytes.length - 4) || b === 0x7E;
      for (let i = 0; i < 8; i++) {
        addBit((b >> i) & 1, isFlag);
      }
    }
    
    // NRZI modulation
    const nrziBits: number[] = [];
    let currentToneState = 0;
    for (const bit of bits) {
      if (bit === 0) {
        currentToneState = 1 - currentToneState;
      }
      nrziBits.push(currentToneState);
    }
    
    // Synthesize audio buffer
    const sampleRate = audioCtx.sampleRate;
    const baudRate = 1200;
    const samplesPerBit = sampleRate / baudRate;
    const totalSamples = Math.ceil(nrziBits.length * samplesPerBit);
    
    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);
    
    const markFreq = 1200;
    const spaceFreq = 2200;
    let phase = 0;
    
    for (let i = 0; i < totalSamples; i++) {
      const bitIndex = Math.floor(i / samplesPerBit);
      if (bitIndex >= nrziBits.length) break;
      
      const isSpace = nrziBits[bitIndex] === 1;
      const freq = isSpace ? spaceFreq : markFreq;
      
      data[i] = Math.sin(phase);
      phase += (2 * Math.PI * freq) / sampleRate;
    }

    // Apply realistic Narrow FM (NFM) 12.5 kHz audio channel modeling
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
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3500;
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
    
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    source.start();
    
    // Subtle physical relay click noise on release
    setTimeout(() => {
      try {
        const clickCtx = new AudioCtxClass();
        const oscClick = clickCtx.createOscillator();
        const gainClick = clickCtx.createGain();
        oscClick.type = 'triangle';
        oscClick.frequency.setValueAtTime(350, clickCtx.currentTime);
        gainClick.gain.setValueAtTime(0.03, clickCtx.currentTime);
        gainClick.gain.exponentialRampToValueAtTime(0.0001, clickCtx.currentTime + 0.04);
        oscClick.connect(gainClick);
        gainClick.connect(clickCtx.destination);
        oscClick.start();
        oscClick.stop(clickCtx.currentTime + 0.04);
      } catch (e) {}
    }, (totalSamples / sampleRate) * 1000);
  } catch (error) {
    console.warn('Web Audio fail', error);
  }
};

export default function AprsAdaptor({
  earthquakes,
  csnStations,
  dgtIncidents,
  navareas,
  aprsPackets,
  setAprsPackets,
  playBuzzerSound,
  showToast,
  weather
}: AprsAdaptorProps) {
  
  const [innerTab, setInnerTab] = useState<'adaptar' | 'consola' | 'traductor' | 'doc'>('adaptar');
  const [activeExplainToken, setActiveExplainToken] = useState<string | null>(null);

  // Translate fields for easier understanding (if weather is provided)
  const tempF = weather ? Math.round((weather.tempC * 9/5) + 32) : 68;
  const dirToken = weather ? weather.windDirDeg.toString().padStart(3, '0') : '000';
  const speedToken = weather ? Math.round(weather.windSpeedKts).toString().padStart(3, '0') : '000';
  const gustToken = `g${weather ? Math.round(weather.gustKts || 0).toString().padStart(3, '0') : '000'}`;
  const tempToken = `t${tempF >= 0 ? tempF.toString().padStart(3, '0') : '-' + Math.abs(tempF).toString().padStart(2, '0')}`;
  const rain1hToken = `r${weather ? Math.round(weather.rain1hIn * 100).toString().padStart(3, '0') : '000'}`;
  const rain24hToken = `p${weather ? Math.round(weather.rain24hIn * 100).toString().padStart(3, '0') : '000'}`;
  let humVal = weather ? weather.humidityPct : 50;
  if (humVal === 100) humVal = 0;
  const humToken = `h${humVal.toString().padStart(2, '0')}`;
  const pressToken = `b${weather ? Math.round(weather.pressureHpa * 10).toString().padStart(5, '0') : '10130'}`;

  function getWindDirectionName(deg: number): string {
    const d = deg % 360;
    if (d > 337.5 || d <= 22.5) return 'Norte (N)';
    if (d > 22.5 && d <= 67.5) return 'Nordeste (NE)';
    if (d > 67.5 && d <= 112.5) return 'Este (E)';
    if (d > 112.5 && d <= 157.5) return 'Sudeste (SE)';
    if (d > 157.5 && d <= 202.5) return 'Sur (S)';
    if (d > 202.5 && d <= 247.5) return 'Sudoeste (SO)';
    if (d > 247.5 && d <= 292.5) return 'Oeste (O)';
    return 'Noroeste (NO)';
  }

  const tokens = [
    { code: '_', label: 'Estructura WX', desc: 'Define que el paquete es un informe de estación meteorológica sin posición dedicada.', color: 'text-pink-400' },
    { code: `${dirToken}/`, label: 'Viento (Dirección/Div)', desc: `Dirección de donde sopla el viento: ${weather ? weather.windDirDeg : 0}° (${getWindDirectionName(weather ? weather.windDirDeg : 0)}).`, color: 'text-red-400' },
    { code: speedToken, label: 'Viento (Velocidad)', desc: `Velocidad sostenida del viento: ${weather ? Math.round(weather.windSpeedKts) : 0} nudos (${weather ? (weather.windSpeedKts * 1.852).toFixed(1) : '0.0'} km/h).`, color: 'text-amber-400' },
    { code: gustToken, label: 'Racha Máxima', desc: `Velocidad racha de viento máxima en los últimos 5 minutos: ${weather ? Math.round(weather.gustKts || 0) : 0} nudos (${weather ? ((weather.gustKts || 0) * 1.852).toFixed(1) : '0.0'} km/h).`, color: 'text-yellow-400' },
    { code: tempToken, label: 'Temperatura', desc: `Temperatura ambiente en Fahrenheit: ${tempF}°F (Equivale a ${weather ? weather.tempC.toFixed(1) : '20.0'}°C).`, color: 'text-orange-400' },
    { code: rain1hToken, label: 'Lluvia Crítica (1h)', desc: `Precipitaciones caídas en la última hora: ${weather ? weather.rain1hIn.toFixed(2) : '0.00'} pulgadas (Equivale a ${weather ? (weather.rain1hIn * 25.4).toFixed(1) : '0.0'} mm).`, color: 'text-blue-400' },
    { code: rain24hToken, label: 'Lluvia Semanal (24h)', desc: `Acumulado de lluvias en las últimas 24 horas: ${weather ? weather.rain24hIn.toFixed(2) : '0.00'} pulgadas (Equivale a ${weather ? (weather.rain24hIn * 25.4).toFixed(1) : '0.0'} mm).`, color: 'text-cyan-400' },
    { code: humToken, label: 'Humedad Relativa', desc: `Humedad atmosférica en porcentaje: ${weather && weather.humidityPct === 100 ? '100% (APRS codificado como h00)' : (weather ? weather.humidityPct : 50) + '%'}.`, color: 'text-indigo-400' },
    { code: pressToken, label: 'Presión Barométrica', desc: `Presión barométrica en décimas de hPa/mb: ${weather ? weather.pressureHpa.toFixed(1) : '1013.0'} hPa.`, color: 'text-violet-400' }
  ];

  const [selectedFeedEvent, setSelectedFeedEvent] = useState<{
    id: string;
    type: 'sismo' | 'incendio' | 'meteo' | 'radiologico' | 'dgt';
    title: string;
    detail: string;
    lat: number;
    lon: number;
    extra?: string;
  } | null>(null);

  // Form states for manual or automatic APRS parameters
  const [aprsSource, setAprsSource] = useState('EA4SAT-1');
  const [aprsDest, setAprsDest] = useState('APCE01');
  const [aprsPath, setAprsPath] = useState('WIDE1-1,WIDE2-1');
  const [aprsType, setAprsType] = useState<'BULLETIN' | 'OBJECT' | 'BEACON' | 'MESSAGE'>('OBJECT');
  const [aprsSymbol, setAprsSymbol] = useState('['); // default is human/emergency block
  const [callsignTarget, setCallsignTarget] = useState('EA4CECOP'); // target for message
  const [customComment, setCustomComment] = useState('');
  const [isEmergencyAlert, setIsEmergencyAlert] = useState(true);

  // Advanced Inspector Panel Selection
  const [selectedHexPart, setSelectedHexPart] = useState<string | null>(null);

  // Filter settings for TNC: Ignores stations with invalid telemetry or voice messages
  const [enableTncIgnoreFilter, setEnableTncIgnoreFilter] = useState<boolean>(() => {
    return localStorage.getItem('aprs_tnc_ignore_filter') === 'true';
  });

  const [requireTelemetryOnly, setRequireTelemetryOnly] = useState<boolean>(() => {
    return localStorage.getItem('aprs_require_telemetry_only') === 'true';
  });

  const [requireVoiceOnly, setRequireVoiceOnly] = useState<boolean>(() => {
    return localStorage.getItem('aprs_require_voice_only') === 'true';
  });

  const [whitelistCallsigns, setWhitelistCallsigns] = useState<string>(() => {
    return localStorage.getItem('aprs_whitelist_callsigns') || 'EA4SAT,ED4YAK';
  });

  const [blacklistCallsigns, setBlacklistCallsigns] = useState<string>(() => {
    return localStorage.getItem('aprs_blacklist_callsigns') || '';
  });

  const isPktTelemetryOrVoice = (pkt: AprsPacket) => {
    const content = `${pkt.packetString} ${pkt.messageText} ${pkt.originalDetail} ${pkt.originalTitle}`.toLowerCase();
    
    // Check custom blacklist
    const blacklist = blacklistCallsigns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (blacklist.some(badCall => pkt.callsign.toUpperCase().includes(badCall))) {
      return false; // Automatically ignored if blacklisted
    }

    // Check custom whitelist
    const whitelist = whitelistCallsigns.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (whitelist.some(goodCall => pkt.callsign.toUpperCase().includes(goodCall))) {
      return true; // Always allowed
    }

    // Telemetry identifiers:
    // - "t#..." standard telemetry
    // - Specific environmental keys (temp, wind, hum)
    const hasTelemetry = /t#\d+|temp|tmp|hmd|hum|baro|pres|wind|gust|sol|uv|batt|volts|v\s*=|\bwx\b|clima|meteo|sensor|telemetr|telemetry/i.test(content);

    // Voice or repeater characteristics:
    // - Frequency numbers (e.g., 144.800, 145.500 MHz)
    // - Vocal, PL tone, repeater terms
    const hasVoice = /14[45]\.\d+|43[0-8]\.\d+|mhz|audio|vocal|voice|remer|pl\s*=|ctcss|tone|hz|repeater|repetidor|enlace\s+vocal|conversaci|vcl|simplex|r\d+|u\d+/i.test(content);

    if (requireTelemetryOnly && requireVoiceOnly) {
      return hasTelemetry && hasVoice;
    }
    if (requireTelemetryOnly) {
      return hasTelemetry;
    }
    if (requireVoiceOnly) {
      return hasVoice;
    }

    return hasTelemetry || hasVoice;
  };

  const filteredPackets = useMemo(() => {
    if (!enableTncIgnoreFilter) return [...aprsPackets];
    return aprsPackets.filter(pkt => isPktTelemetryOrVoice(pkt));
  }, [aprsPackets, enableTncIgnoreFilter, requireTelemetryOnly, requireVoiceOnly, whitelistCallsigns, blacklistCallsigns]);

  const ignoredCount = useMemo(() => {
    return aprsPackets.length - filteredPackets.length;
  }, [aprsPackets, filteredPackets]);

  // Memoized packets sorted so that EMERGENCY messages get high priority (placed at top/front of queue)
  const orderedPackets = useMemo(() => {
    return [...filteredPackets].sort((a, b) => {
      // Prioritize EMERGENCY messages first
      if (a.isEmergency && !b.isEmergency) return -1;
      if (!a.isEmergency && b.isEmergency) return 1;
      return 0;
    });
  }, [filteredPackets]);

  // Compute APRS traffic volume filtered by type (Beacons, Objetos, Alertas, Mensajes) in the last 60 minutes
  const last60MinsTrafficData = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let beaconsCount = 0;
    let objectsCount = 0;
    let alertsCount = 0; // BULLETIN or alerts
    let messagesCount = 0;

    aprsPackets.forEach((pkt) => {
      let pktTime = now; // Default fallback to "now" so newly created/active ones are represented in real-time
      
      const match = pkt.id.match(/^aprs-(\d+)/);
      if (match) {
        pktTime = parseInt(match[1]);
      } else if (pkt.timestamp) {
        try {
          const parts = pkt.timestamp.split(' ');
          const hms = parts[0].split(':').map(Number);
          let hours = hms[0];
          const minutes = hms[1];
          const seconds = hms[2] || 0;
          
          if (parts[1] === 'PM' && hours < 12) hours += 12;
          if (parts[1] === 'AM' && hours === 12) hours = 0;
          
          const d = new Date();
          d.setHours(hours, minutes, seconds, 0);
          pktTime = d.getTime();
        } catch (e) {
          pktTime = now;
        }
      }

      if (pktTime >= oneHourAgo && pktTime <= now) {
        if (pkt.aprsType === 'BEACON') {
          beaconsCount++;
        } else if (pkt.aprsType === 'OBJECT') {
          objectsCount++;
        } else if (pkt.aprsType === 'BULLETIN') {
          alertsCount++;
        } else if (pkt.aprsType === 'MESSAGE') {
          messagesCount++;
        }
      }
    });

    return [
      { name: 'Beacons', value: beaconsCount, color: '#10b981', type: 'BEACON' },    // Emerald
      { name: 'Objetos', value: objectsCount, color: '#06b6d4', type: 'OBJECT' },    // Cyan
      { name: 'Alertas', value: alertsCount, color: '#f59e0b', type: 'BULLETIN' },   // Amber
      { name: 'Mensajes', value: messagesCount, color: '#ec4899', type: 'MESSAGE' },  // Pink
    ];
  }, [aprsPackets]);

  // Dynamic Event Feed Compilation from Pilar I
  const pilarIEvents = useMemo(() => {
    const list: typeof selectedFeedEvent[] = [];

    // Map Earthquakes (Sismos)
    earthquakes.forEach((eq) => {
      list.push({
        id: eq.id,
        type: 'sismo',
        title: `Terremoto M ${eq.magnitud.toFixed(1)} - ${eq.localizacion}`,
        detail: `Profundidad ${eq.depthKm}km. Distancia: ${eq.distanciaKm.toFixed(1)}km, capturado por Red Sísmica Nacional IGN.`,
        lat: eq.latitude,
        lon: eq.longitude,
        extra: `magnitud: ${eq.magnitud}`
      });
    });

    // Map Radiactividad Nodes (CSN)
    csnStations.forEach((st) => {
      list.push({
        id: st.id,
        type: 'radiologico',
        title: `Estación CSN REA: ${st.name}`,
        detail: `Monitoreo en tiempo real, provincia de ${st.provincia}. Tipo ${st.tipo}. Nivel base: ${st.baseVal} nSv/h.`,
        lat: st.lat,
        lon: st.lon,
        extra: `rad: ${st.baseVal}`
      });
    });

    // Map DGT traffic obstructions
    dgtIncidents.forEach((inc) => {
      list.push({
        id: inc.id,
        type: 'dgt',
        title: `Incidencia DGT: ${inc.carretera} (${inc.provincia})`,
        detail: `${inc.descripcion}. Localización: ${inc.poblacion}. Causa: ${inc.causa || 'Obstrucción'}. Nivel de servicio: ${inc.nivel}.`,
        lat: inc.latitud,
        lon: inc.longitud,
        extra: `nivel: ${inc.nivel}`
      });
    });

    // Dynamic emergency weather alerts based on global status or simulated storms
    navareas.forEach((n) => {
      // Decode coordinates from navareas if any, or default to central Spain
      list.push({
        id: n.id,
        type: 'meteo',
        title: `NAVTEX/NAVAREA III Broadcast: ${n.title}`,
        detail: `${n.rawText}. Área de seguridad: ${n.areaDescription}. Urgencia: ${n.urgency}.`,
        lat: n.lat || 40.4167, 
        lon: n.lon || -3.7037,
        extra: `navarea: ${n.id}`
      });
    });

    return list;
  }, [earthquakes, csnStations, dgtIncidents, navareas]);

  // Set the first event as selected by default if available
  useEffect(() => {
    if (pilarIEvents.length > 0 && !selectedFeedEvent) {
      setSelectedFeedEvent(pilarIEvents[0]);
    }
  }, [pilarIEvents, selectedFeedEvent]);

  // Auto-synthesiZing the packet payload text based on selections represent true craft!
  const generatedPayload = useMemo(() => {
    if (!selectedFeedEvent) {
      return customComment || 'SAT APRS GATEWAY ALERTA ACTIVA';
    }

    const { latStr, lonStr } = convertToAprsCoords(selectedFeedEvent.lat, selectedFeedEvent.lon);
    const textMsg = customComment || `${selectedFeedEvent.title.toUpperCase()}`;

    // APRS Protocol Format Compilation
    if (aprsType === 'OBJECT') {
      // Formato APRS Object: ;NAME      *DDHHMMzDDMM.hhN/DDDMM.hhW$comment
      // Name holds up to 9 chars padded
      const rawName = selectedFeedEvent.type === 'sismo' ? 'SISM-IGN' 
                    : selectedFeedEvent.type === 'radiologico' ? 'RAD-CSN'
                    : selectedFeedEvent.type === 'dgt' ? 'VIAL-DGT'
                    : selectedFeedEvent.type === 'incendio' ? 'INC-NASA'
                    : 'METEO-SAT';
      const namePadded = rawName.slice(0, 9).padEnd(9, ' ');
      const ddhhmm = '211242z'; // Real-time formatted timestamp mock from metadata
      return `;${namePadded}*${ddhhmm}${latStr}/${lonStr}${aprsSymbol}${textMsg}`;
    } 
    
    if (aprsType === 'BULLETIN') {
      // Formato APRS Bulletin: :BLN1EMERG:Text message
      const blnNum = '1';
      const urgency = isEmergencyAlert ? 'EMERG' : 'ALRT';
      return `:BLN${blnNum}${urgency}:${textMsg.slice(0, 60)}`;
    }

    if (aprsType === 'BEACON') {
      // Formato APRS Position Beacon: =DDMM.hhN/DDDMM.hhW$comment
      return `=${latStr}/${lonStr}${aprsSymbol}${textMsg}`;
    }

    // MESSAGE Direct target Format
    // Format: :CALLSIGN :Message
    const paddedCall = callsignTarget.slice(0, 9).padEnd(9, ' ');
    return `:${paddedCall}:${textMsg}`;

  }, [selectedFeedEvent, aprsType, aprsSymbol, callsignTarget, customComment, isEmergencyAlert]);

  // Compile AX.25 Frame representation
  const ax25Rep = useMemo(() => {
    return generateAx25MockHex(aprsSource, aprsDest, aprsPath, generatedPayload);
  }, [aprsSource, aprsDest, aprsPath, generatedPayload]);

  // Change symbol list based on event category automatically
  useEffect(() => {
    if (selectedFeedEvent) {
      if (selectedFeedEvent.type === 'sismo') {
        setAprsSymbol('['); // [ is standard APRS symbol for earthquake/red-cross or direct sismo
      } else if (selectedFeedEvent.type === 'radiologico') {
        setAprsSymbol('n'); // n is standard APRS nuclear symbol
      } else if (selectedFeedEvent.type === 'dgt') {
        setAprsSymbol('v'); // v is road/obstacle symbol
      } else if (selectedFeedEvent.type === 'meteo') {
        setAprsSymbol('_'); // _ is weather station symbol
      } else if (selectedFeedEvent.type === 'incendio') {
        setAprsSymbol('f'); // f is fire symbol
      }
    }
  }, [selectedFeedEvent]);

  // Handle Event Selection
  const handleSelectEvent = (event: typeof selectedFeedEvent) => {
    setSelectedFeedEvent(event);
    setCustomComment(''); // reset custom typing to allow pristine re-compile
  };

  // Compile and Submit APRS Packet to CECOP (Pilar II) for formal auditing
  const handleCompileAndSubmit = () => {
    if (!selectedFeedEvent) {
      if (showToast) showToast('Error: No se ha seleccionado ningún evento para adaptar.');
      return;
    }

    const { latStr, lonStr } = convertToAprsCoords(selectedFeedEvent.lat, selectedFeedEvent.lon);
    
    const payloadUpper = generatedPayload.toUpperCase();
    let visualPriority: 'Crítica' | 'Alta' | 'Informativa' | 'Normal' = 'Normal';
    let isEmergency = isEmergencyAlert;

    if (payloadUpper.includes('!EMERGENCY!')) {
      visualPriority = 'Crítica';
      isEmergency = true;
    } else if (payloadUpper.includes('!PRIORITY!')) {
      visualPriority = 'Alta';
    } else if (payloadUpper.includes('!SPECIAL!')) {
      visualPriority = 'Informativa';
    } else if (payloadUpper.includes('!ALERT!') || payloadUpper.includes('!TESTALARM!')) {
      isEmergency = true;
    }

    const packet: AprsPacket = {
      id: `aprs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sourceEventId: selectedFeedEvent.id,
      eventType: selectedFeedEvent.type,
      originalTitle: selectedFeedEvent.title,
      originalDetail: selectedFeedEvent.detail,
      timestamp: new Date().toLocaleTimeString(),
      latitude: selectedFeedEvent.lat,
      longitude: selectedFeedEvent.lon,
      callsign: aprsSource,
      destination: aprsDest,
      path: aprsPath,
      aprsType: aprsType,
      symbol: aprsSymbol,
      messageText: generatedPayload,
      packetString: `${aprsSource}>${aprsDest},${aprsPath}:${generatedPayload}`,
      status: 'PENDIENTE', // Initialized pending CECOP/Triage Auditing!
      isEmergency,
      visualPriority
    };

    const updated = [packet, ...aprsPackets];
    setAprsPackets(updated);
    
    // Save to localStorage immediately
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

    if (playBuzzerSound) playBuzzerSound(784, 0.15, 'triangle');
    if (showToast) {
      showToast(`PAQUETE APRS ENVIADO A CECOP: Pendiente de auditoría y firma (Pilar II)`);
    }

    // Auto-navigate to console view to check progress
    setInnerTab('consola');
  };

  // Manual Triggering of Packet Transmission (requires Approved status)
  const handleTransmitPacket = (item: AprsPacket) => {
    if (item.status !== 'APROBADO' && item.status !== 'TRANSMITIDO') {
      if (showToast) showToast('ERROR: El paquete aún no ha sido AUDITADO por el CECOP (Pilar II).');
      return;
    }

    // Play AX.25 AFSK packet burst!
    playPacketAfsktone();

    // Mark as transmitted
    const updated = aprsPackets.map((pkt) => {
      if (pkt.id === item.id) {
        return {
          ...pkt,
          status: 'TRANSMITIDO' as const,
          transmittedAt: new Date().toLocaleTimeString()
        };
      }
      return pkt;
    });

    setAprsPackets(updated);
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

    if (showToast) {
      showToast(`DIRE-WOLF TNC: Emitiendo baliza en 144.800 MHz FM - [${item.isEmergency ? 'EMERGENCY' : 'TELEMETRÍA'}]`);
    }
  };

  // Delete Packet draft
  const handleDeletePacket = (id: string) => {
    const updated = aprsPackets.filter(pkt => pkt.id !== id);
    setAprsPackets(updated);
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));
    if (showToast) showToast('Paquete eliminado del histórico del TNC.');
  };

  // Dynamic colors for events
  const getEventBadgeClass = (type: string) => {
    switch (type) {
      case 'sismo': return 'bg-rose-950/40 text-rose-400 border-rose-850/50';
      case 'radiologico': return 'bg-violet-950/40 text-violet-400 border-violet-850/50';
      case 'dgt': return 'bg-sky-950/40 text-sky-400 border-sky-850/50';
      case 'meteo': return 'bg-amber-950/40 text-amber-400 border-amber-850/50';
      case 'incendio': return 'bg-orange-950/40 text-orange-400 border-orange-850/50';
      default: return 'bg-slate-950/40 text-slate-400 border-slate-850/50';
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-[600px] font-sans" id="aprs-adaptor-panel">
      
      {/* HEADER BANNER OF THE PILLAR */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-950/30 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <Radio size={20} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100 flex items-center gap-2">
              PILAR IX: COMPILADOR Y ADAPTADOR RED APRS (AX.25)
              <span className="bg-orange-950 text-orange-400 border border-orange-800/60 font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase">
                Estándar Emergencias
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Protocolo de encapsulación FM VHF para boletines y posicionamientos GPS de alerta temprana.
            </p>
          </div>
        </div>
        
        {/* NAV CONTROLS FOR INNER TABS */}
        <div className="bg-slate-950 border border-slate-850 p-1 rounded-lg flex items-center gap-1.5 self-stretch md:self-auto justify-between">
          <button
            onClick={() => setInnerTab('adaptar')}
            className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'adaptar'
                ? 'bg-orange-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders size={13} />
            Adaptador de Boletines
          </button>
          <button
            onClick={() => setInnerTab('consola')}
            className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer relative ${
              innerTab === 'consola'
                ? 'bg-orange-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity size={13} />
            TNC & Tráfico Regional
            {aprsPackets.some(p => p.status === 'PENDIENTE') && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-slate-950 animate-ping" />
            )}
            {aprsPackets.some(p => p.status === 'APROBADO') && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full border border-slate-950" />
            )}
          </button>
          <button
            onClick={() => setInnerTab('traductor')}
            className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'traductor'
                ? 'bg-orange-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass size={13} />
            Traductor WX APRS
          </button>
          <button
            onClick={() => setInnerTab('doc')}
            className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              innerTab === 'doc'
                ? 'bg-orange-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle size={13} />
            Especificación AX.25
          </button>
        </div>
      </div>

      {/* RENDER DYNAMIC TAB VIEWS */}
      <div className="p-4 flex-1 flex flex-col">
        {innerTab === 'adaptar' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
            
            {/* LADO IZQUIERDO: SELECCIÓN EVENTOS ACTVOS DE PILAR I */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Database size={13} className="text-orange-400" />
                  Feeds Activos (Pilar I)
                </span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-850 px-1.5 py-0.5 rounded">
                  {pilarIEvents.length} Nodos
                </span>
              </div>

              <div className="border border-slate-850 rounded-xl bg-slate-950/50 p-2.5 flex flex-col gap-2 max-h-[480px] overflow-y-auto">
                {pilarIEvents.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    Sin eventos sismológicos, radiológicos o viales detectados actualmente.
                  </div>
                ) : (
                  pilarIEvents.map((evt) => {
                    const isSelected = selectedFeedEvent?.id === evt.id;
                    return (
                      <button
                        key={evt.id}
                        onClick={() => handleSelectEvent(evt)}
                        className={`text-left p-3 rounded-lg border transition-all flex flex-col gap-1.5 relative ${
                          isSelected
                            ? 'bg-orange-500/10 border-orange-500/40 shadow-inner'
                            : 'bg-slate-950/60 border-slate-900 hover:border-slate-800 hover:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${getEventBadgeClass(evt.type)}`}>
                            {evt.type}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            COORD: {evt.lat.toFixed(2)}, {evt.lon.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-xs font-sans font-bold text-slate-200 line-clamp-1">
                          {evt.title}
                        </span>
                        <p className="text-[10px] text-slate-400 font-mono line-clamp-2 leading-relaxed">
                          {evt.detail}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>

              {/* TACTICAL TIP */}
              <div className="bg-slate-900/60 border border-slate-850/50 rounded-xl p-3 flex gap-2.5 items-start">
                <Sparkles size={14} className="text-orange-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                  Para convertir un feed en boletín, selecciónelo de la lista. El compilador formateará automáticamente el paquete de acuerdo a las directrices APRS.
                </p>
              </div>
            </div>

            {/* LADO CENTRAL: CONFIGURACIÓN PARÁMETROS DEL COMPILADOR APRS */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 px-1">
                <Sliders size={13} className="text-orange-400" />
                <span className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wide">
                  Parámetros Compilador APRS
                </span>
              </div>

              <div className="border border-slate-850 rounded-xl bg-slate-950/40 p-4 space-y-4 flex flex-col flex-1">
                
                {/* CALLSIGNS Y DIGITAL ROUTING */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">ORIGEN (Callsign-SSID)</label>
                    <input
                      type="text"
                      value={aprsSource}
                      onChange={(e) => setAprsSource(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-orange-400 focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">DESTINO (APRS Router)</label>
                    <input
                      type="text"
                      value={aprsDest}
                      onChange={(e) => setAprsDest(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-slate-350 focus:border-orange-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">DIGIPEATER PATH (Enrutadores RF)</label>
                  <input
                    type="text"
                    value={aprsPath}
                    onChange={(e) => setAprsPath(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-slate-350 focus:border-orange-500 outline-none"
                  />
                  <p className="text-[9px] text-slate-550 font-mono mt-1">
                    Path por defecto de la red nacional REMER: WIDE1-1, WIDE2-1
                  </p>
                </div>

                {/* APRS FRAME TYPE */}
                <div>
                  <label className="text-[10px] font-mono text-slate-400 block mb-1">TIPO DE PAQUETE APRS</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'OBJECT', label: 'Object / Alerta Pos' },
                      { key: 'BULLETIN', label: 'Bulletin / Boletín civil' },
                      { key: 'BEACON', label: 'Beacon / Coordenadas' },
                      { key: 'MESSAGE', label: 'Message / Directo' }
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setAprsType(opt.key as any)}
                        className={`px-2.5 py-1.5 rounded border font-mono text-[10px] text-left transition-all ${
                          aprsType === opt.key
                            ? 'bg-orange-500/10 border-orange-550 text-orange-300 font-bold'
                            : 'bg-slate-950 border-slate-900 hover:border-slate-800 text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CONDITIONAL SPECIFIC SETTINGS */}
                {aprsType === 'MESSAGE' ? (
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">INDICATIVO DESTINATARIO</label>
                    <input
                      type="text"
                      value={callsignTarget}
                      onChange={(e) => setCallsignTarget(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-blue-400 focus:border-orange-500 outline-none"
                    />
                  </div>
                ) : aprsType === 'BULLETIN' ? (
                  <div className="flex items-center justify-between bg-slate-900/40 border border-slate-850 p-2.5 rounded">
                    <span className="text-[10px] font-mono text-slate-400">¿DIFUSIÓN CIVIL EMERGENCY CRÍTICO?</span>
                    <input
                      type="checkbox"
                      checked={isEmergencyAlert}
                      onChange={(e) => setIsEmergencyAlert(e.target.checked)}
                      className="w-4 h-4 text-orange-500 bg-slate-950 border-slate-800 rounded focus:ring-orange-550 focus:ring-offset-slate-950 rounded-md"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">APRS SYMBOL (Icono en Mapa)</label>
                    <div className="flex gap-2">
                      <select
                        value={aprsSymbol}
                        onChange={(e) => setAprsSymbol(e.target.value)}
                        className="bg-slate-950 border border-slate-850 rounded px-2 py-1.5 font-mono text-xs text-amber-400 flex-1 outline-none focus:border-orange-500"
                      >
                        <option value="["> [ ] - CRUZ DE EMERGENCIA / HOSPITAL</option>
                        <option value="f"> [ f ] - INCENDIO / FOCO ACTIVO</option>
                        <option value="n"> [ n ] - RADIACIÓN NUCLEAR</option>
                        <option value="v"> [ v ] - VIAL / CORTE CARRETERA DGT</option>
                        <option value="_"> [ _ ] - ESTACIÓN METEREOLÓGICA</option>
                        <option value="&"> [ & ] - NODO DE COORDINACIÓN</option>
                        <option value="*"> [ * ] - EPICENTRO SÍSMICO</option>
                        <option value="/"> [ / ] - INCIDENCIA SECUNDARIA</option>
                      </select>
                      <div className="bg-slate-900 border border-slate-850 p-2 text-xs font-bold text-center rounded w-9 text-orange-400 font-mono">
                        {aprsSymbol}
                      </div>
                    </div>
                  </div>
                )}

                {/* TEXT INPUT OVERRIDE */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-mono text-slate-400">TEXTO / TEXTO ADICIONAL COMENTARIO</label>
                    <span className="text-[9px] font-mono text-slate-500">Máx. 65 caracteres</span>
                  </div>
                  <input
                    type="text"
                    value={customComment}
                    onChange={(e) => setCustomComment(e.target.value)}
                    placeholder={selectedFeedEvent ? selectedFeedEvent.title : "Escribe un comentario..."}
                    maxLength={65}
                    className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleCompileAndSubmit}
                    className="w-full bg-orange-600 hover:bg-orange-500 text-slate-955 text-slate-950 font-sans font-bold text-xs py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-orange-950/20"
                  >
                    <Send size={14} />
                    ADAPTAR Y ENVIAR A PILAR II PARA AUDITORÍA
                  </button>
                </div>
              </div>
            </div>

            {/* LADO DERECHO: INSPECTOR TECNOLÓGICO AX.25 BAJO NIVEL */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 px-1">
                <FileCode size={13} className="text-orange-400" />
                <span className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wide">
                  Visualizador de Trama AX.25 (Binario)
                </span>
              </div>

              <div className="border border-slate-850 rounded-xl bg-slate-950/60 p-4 space-y-3.5 flex flex-col flex-1 font-mono text-xs">
                
                {/* STRING EN CLARO */}
                <div className="bg-slate-950 border border-slate-900 rounded-lg p-3">
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 font-bold">Cadena de Texto APRS Compilada</div>
                  <div className="text-[11px] text-orange-400 break-all leading-relaxed font-semibold">
                    {aprsSource}&gt;{aprsDest},{aprsPath}:{generatedPayload}
                  </div>
                </div>

                {/* HEX VIEWER */}
                <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 flex-1 flex flex-col min-h-[160px]">
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Trama AX.25 UI-Frame (Byte stream)</div>
                  
                  <div className="bg-slate-900/60 border border-slate-950 p-2 rounded text-[10px] break-all leading-normal flex-1 font-mono text-slate-400 overflow-y-auto max-h-[140px]">
                    {ax25Rep.hex.split(' ').map((byte, i) => {
                      // Work out which part this byte belongs to for highlighting
                      let isHighlighted = false;
                      let partLabel = "";
                      
                      const viaList = aprsPath ? aprsPath.split(',') : [];
                      const isFlags = i === 0 || i === (ax25Rep.hex.split(' ').length - 1);
                      const isDest = i >= 1 && i <= 7;
                      const isSrc = i >= 8 && i <= 14;
                      const isPath = i >= 15 && i < (15 + viaList.length * 7);
                      const isCtrl = i === (15 + viaList.length * 7);
                      const isPid = i === (16 + viaList.length * 7);
                      const isPayload = i >= (17 + viaList.length * 7) && i < (17 + viaList.length * 7 + generatedPayload.length);
                      const isFcs = i >= (17 + viaList.length * 7 + generatedPayload.length) && i < (19 + viaList.length * 7 + generatedPayload.length);

                      if (selectedHexPart === 'FLAG' && isFlags) isHighlighted = true;
                      if (selectedHexPart === 'DEST' && isDest) isHighlighted = true;
                      if (selectedHexPart === 'SRC' && isSrc) isHighlighted = true;
                      if (selectedHexPart === 'PATH' && isPath) isHighlighted = true;
                      if (selectedHexPart === 'CTRL' && isCtrl) isHighlighted = true;
                      if (selectedHexPart === 'PID' && isPid) isHighlighted = true;
                      if (selectedHexPart === 'DATA' && isPayload) isHighlighted = true;
                      if (selectedHexPart === 'FCS' && isFcs) isHighlighted = true;

                      let colorClass = "text-slate-500";
                      if (isFlags) colorClass = "text-rose-500 font-bold";
                      else if (isDest) colorClass = "text-yellow-400 font-bold";
                      else if (isSrc) colorClass = "text-orange-400 font-bold";
                      else if (isPath) colorClass = "text-cyan-400";
                      else if (isCtrl) colorClass = "text-emerald-400 font-bold";
                      else if (isPid) colorClass = "text-violet-400 font-bold";
                      else if (isPayload) colorClass = "text-slate-200";
                      else if (isFcs) colorClass = "text-sky-400";

                      return (
                        <span 
                          key={i} 
                          title={`${byte}`}
                          className={`inline-block px-0.5 cursor-pointer hover:bg-slate-800 rounded transition-colors ${colorClass} ${
                            isHighlighted ? 'bg-orange-500/20 border-b border-orange-500/80 text-orange-200' : ''
                          }`}
                        >
                          {byte}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* DECODER FIELDS LEGEND */}
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-850 space-y-1.5">
                  <div className="text-[8px] text-slate-500 uppercase font-black tracking-wider mb-1">Campos de Trama (Presione para Resaltar)</div>
                  
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <button 
                      type="button" 
                      onClick={() => setSelectedHexPart(selectedHexPart === 'FLAG' ? null : 'FLAG')}
                      className="text-left px-1.5 py-0.5 rounded hover:bg-slate-850/60 transition-all flex justify-between items-center bg-slate-950/40 border border-slate-900"
                    >
                      <span className="text-rose-500 font-bold">Flags (S/E)</span>
                      <span className="text-[9px] font-mono text-slate-500">7E</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedHexPart(selectedHexPart === 'DEST' ? null : 'DEST')}
                      className="text-left px-1.5 py-0.5 rounded hover:bg-slate-850/60 transition-all flex justify-between items-center bg-slate-950/40 border border-slate-900"
                    >
                      <span className="text-yellow-400 font-bold">Destino</span>
                      <span className="text-[9px] font-mono text-slate-500"> {aprsDest}</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedHexPart(selectedHexPart === 'SRC' ? null : 'SRC')}
                      className="text-left px-1.5 py-0.5 rounded hover:bg-slate-850/60 transition-all flex justify-between items-center bg-slate-950/40 border border-slate-900"
                    >
                      <span className="text-orange-400 font-bold">Origen</span>
                      <span className="text-[9px] font-mono text-slate-500">{aprsSource}</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedHexPart(selectedHexPart === 'PATH' ? null : 'PATH')}
                      className="text-left px-1.5 py-0.5 rounded hover:bg-slate-850/60 transition-all flex justify-between items-center bg-slate-950/40 border border-slate-900"
                    >
                      <span className="text-cyan-400">Digi Path</span>
                      <span className="text-[9px] font-mono text-slate-500"> {aprsPath.slice(0,6)}...</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedHexPart(selectedHexPart === 'CTRL' ? null : 'CTRL')}
                      className="text-left px-1.5 py-0.5 rounded hover:bg-slate-850/60 transition-all flex justify-between items-center bg-slate-950/40 border border-slate-900"
                    >
                      <span className="text-emerald-400 font-bold">Control</span>
                      <span className="text-[9px] font-mono text-slate-500">0x03</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedHexPart(selectedHexPart === 'PID' ? null : 'PID')}
                      className="text-left px-1.5 py-0.5 rounded hover:bg-slate-850/60 transition-all flex justify-between items-center bg-slate-950/40 border border-slate-900"
                    >
                      <span className="text-violet-400 font-bold">Prot. ID</span>
                      <span className="text-[9px] font-mono text-slate-500">0xF0</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {innerTab === 'consola' && (
          <div className="flex-1 flex flex-col gap-4">
            
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <Activity size={13} className="text-orange-400" />
                Histórico de Balizas y Control de Auditoría
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Pilar II Auditing Endpoint Link: EA4SAT-TNC (READY)
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full flex-1">
              
              {/* ANALYTICAL TRAFFIC PANEL (Bar Chart) */}
              <div className="lg:col-span-1 border border-slate-850 rounded-xl bg-slate-950/40 p-4 flex flex-col justify-between min-h-[350px]">
                <div>
                  <h3 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 mb-1">
                    <Activity size={12} className="text-orange-400" />
                    Volumen de Tráfico (Últimos 60 min)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mb-4">
                    Clasificación y recuento de tramas AX.25 emitidas por la estación local.
                  </p>
                </div>

                <div className="h-[210px] w-full mt-2 relative">
                  {aprsPackets.length === 0 || last60MinsTrafficData.every(d => d.value === 0) ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                      <span className="text-[10px] font-mono text-slate-600 bg-slate-900 border border-slate-850 px-2.5 py-1.5 rounded-lg">
                        Sin actividad en los últimos 60 min
                      </span>
                    </div>
                  ) : null}
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <BarChart
                      data={last60MinsTrafficData}
                      margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#0f172a', 
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#f8fafc'
                        }}
                        cursor={{ fill: '#1e293b', opacity: 0.2 }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {last60MinsTrafficData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-900 font-mono text-[9px]">
                  {last60MinsTrafficData.map((item) => (
                    <div key={item.type} className="flex items-center gap-1.5 justify-between px-2 py-1 bg-slate-900/40 rounded border border-slate-900">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-slate-400 font-medium">{item.name}</span>
                      </div>
                      <span className="text-slate-200 font-bold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AUDITING QUEUE LIST CONTAINER */}
              <div className="lg:col-span-2 border border-slate-850 rounded-xl bg-slate-950/40 p-4 flex flex-col gap-3 min-h-[400px]">
                
                {/* FILTRO DE DESCARTE / IGNORADO DE RUIDO APRS */}
                <div className="bg-slate-900/15 border border-slate-900 rounded-lg p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="text-orange-400" size={13} />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-sans font-bold text-slate-300">
                          Filtro Inteligente de Estaciones APRS
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          Ignorar automáticamente balizas sin telemetría ni parámetros de voz válidos.
                        </span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableTncIgnoreFilter}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setEnableTncIgnoreFilter(val);
                          localStorage.setItem('aprs_tnc_ignore_filter', val ? 'true' : 'false');
                          if (showToast) showToast(val ? 'Filtro adaptativo APRS activo' : 'Filtro deshabilitado: mostrando todo');
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-950 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-600 peer-checked:after:bg-slate-950"></div>
                    </label>
                  </div>

                  {enableTncIgnoreFilter && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-slate-900/50 text-[10.5px]">
                      {/* Checkboxes de criterios */}
                      <div className="flex flex-col gap-2 bg-slate-950/40 p-2 rounded border border-slate-900 select-none">
                        <span className="text-[8.5px] font-mono text-slate-500 leading-none">CRITERIOS DETECTADOS</span>
                        
                        <label className="flex items-center gap-2 text-slate-350 hover:text-slate-200 cursor-pointer transition-colors mt-1">
                          <input
                            type="checkbox"
                            checked={requireTelemetryOnly}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setRequireTelemetryOnly(val);
                              localStorage.setItem('aprs_require_telemetry_only', val ? 'true' : 'false');
                            }}
                            className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 cursor-pointer"
                          />
                          <div className="flex flex-col leading-tight">
                            <span className="text-[10px] font-sans font-medium">Requerir Telemetría Activa</span>
                            <span className="text-[8px] font-mono text-slate-500">Obligatorio: reportar sensores, clima (WX) o batería (T#).</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-2 text-slate-350 hover:text-slate-200 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={requireVoiceOnly}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setRequireVoiceOnly(val);
                              localStorage.setItem('aprs_require_voice_only', val ? 'true' : 'false');
                            }}
                            className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 cursor-pointer"
                          />
                          <div className="flex flex-col leading-tight">
                            <span className="text-[10px] font-sans font-medium">Requerir Info de Voz/Links</span>
                            <span className="text-[8px] font-mono text-slate-500">Obligatorio: frecuencias FM, subtonos (PL=) o repetidores.</span>
                          </div>
                        </label>
                      </div>

                      {/* Autorización / Exclusión */}
                      <div className="flex flex-col gap-2 bg-slate-950/40 p-2 rounded border border-slate-900 font-mono">
                        <span className="text-[8.5px] text-slate-500 leading-none">FILTRADO DE EXCLUSIVIDAD (CALLSIGN)</span>
                        
                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] text-slate-500">Lista Blanca (Bypass Filtro, sep. por comas)</label>
                          <input
                            type="text"
                            value={whitelistCallsigns}
                            onChange={(e) => {
                              const val = e.target.value;
                              setWhitelistCallsigns(val);
                              localStorage.setItem('aprs_whitelist_callsigns', val);
                            }}
                            placeholder="EA4SAT,ED4YAK"
                            className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-slate-700 text-slate-350 px-2 py-0.5 text-[10px] rounded outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] text-slate-500">Lista Negra (Rechazo Total, sep. por comas)</label>
                          <input
                            type="text"
                            value={blacklistCallsigns}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBlacklistCallsigns(val);
                              localStorage.setItem('aprs_blacklist_callsigns', val);
                            }}
                            placeholder="M0BAD,REPETIDOR-SPAM"
                            className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-slate-700 text-slate-350 px-2 py-0.5 text-[10px] rounded outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-between items-center text-[9px] font-mono leading-none text-slate-500 mt-1 gap-1">
                    <span className="flex items-center gap-1">
                      {enableTncIgnoreFilter ? (
                        <span className="inline-flex items-center gap-1.5 text-orange-400 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />
                          FILTRADO ACTIVADO: Ignorando tramas de ruido analógico
                        </span>
                      ) : (
                        <span className="text-slate-500">FILTRADO DESACTIVADO: Se procesan todas las señales del espectro</span>
                      )}
                    </span>
                    {enableTncIgnoreFilter && ignoredCount > 0 && (
                      <span className="bg-amber-950/50 text-amber-500 border border-amber-900/40 px-1.5 py-0.5 rounded font-black">
                        {ignoredCount} EN ESTADO IGNORED
                      </span>
                    )}
                  </div>
                </div>

                {/* CONTROLES DE VACIADO DE COLA Y CHAT */}
                <div className="flex flex-wrap justify-between items-center bg-slate-900/45 p-3.5 border border-slate-850 rounded-xl font-mono text-[10.5px] text-slate-400 gap-3">
                  <div className="flex items-center gap-1.5">
                    <Database size={12} className="text-slate-500" />
                    <span>Cola: <strong className="text-slate-200">{aprsPackets.length}</strong> tramas ({orderedPackets.length} filtradas)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Clear Chat (Messages Only) Button */}
                    {aprsPackets.some(pkt => pkt.aprsType === 'MESSAGE') && (
                      <button
                        onClick={() => {
                          if (window.confirm('¿Desea eliminar todo el historial de chat (mensajes directos) de la cola?')) {
                            const updated = aprsPackets.filter(pkt => pkt.aprsType !== 'MESSAGE');
                            setAprsPackets(updated);
                            localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));
                            if (showToast) showToast('Historial de chat (mensajes directos) eliminado.');
                            if (playBuzzerSound) playBuzzerSound(440, 0.1);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-950/45 hover:bg-pink-900/45 border border-pink-900/60 text-pink-400 rounded-lg hover:text-pink-300 font-bold transition-all cursor-pointer select-none"
                        title="Borrar todos los mensajes directos (Chat)"
                        id="delete-aprs-chat-btn"
                      >
                        <Trash2 size={11} />
                        Borrar Chat ({aprsPackets.filter(pkt => pkt.aprsType === 'MESSAGE').length})
                      </button>
                    )}

                    {/* Clear Entire Queue Button */}
                    {aprsPackets.length > 0 && (
                      <button
                        onClick={() => {
                          if (window.confirm('¿Está seguro de que desea limpiar toda la cola de paquetes de la consola?')) {
                            setAprsPackets([]);
                            localStorage.setItem('sat_aprs_packets', JSON.stringify([]));
                            if (showToast) showToast('Se han vaciado todas las tramas de la cola.');
                            if (playBuzzerSound) playBuzzerSound(300, 0.1);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-350 rounded-lg hover:text-slate-200 font-bold transition-all cursor-pointer select-none"
                        title="Borrar todas las tramas de la cola"
                        id="clear-all-aprs-packets-btn"
                      >
                        <Trash2 size={11} />
                        Vaciar Cola
                      </button>
                    )}
                  </div>
                </div>

                {aprsPackets.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
                    <Radio size={24} className="text-slate-700 mb-2" />
                    <p className="font-mono text-xs">Ningún paquete adaptado en cola del TNC.</p>
                    <p className="font-mono text-[10px] text-slate-600 mt-1 max-w-sm">
                      Utilice el &quot;Adaptador de Boletines&quot; para crear mensajes de emergencias y enviarlos para auditoría del CECOP.
                    </p>
                  </div>
                ) : orderedPackets.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
                    <Sliders size={24} className="text-orange-500/60 mb-2 animate-pulse" />
                    <p className="font-mono text-xs font-bold text-slate-300">Cola Vacía por Filtro Táctico Activo</p>
                    <p className="font-mono text-[10px] text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                      Hay <strong className="text-orange-400">{aprsPackets.length} tramas</strong> registradas en el receptor, pero ninguna cumple con el criterio de Telemetría o Enlace de Voz. Relaje las reglas o configure la lista blanca.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-[460px] space-y-3 pr-2">
                    {orderedPackets.map((pkt) => {
                      const isPending = pkt.status === 'PENDIENTE';
                      const isApproved = pkt.status === 'APROBADO';
                      const isRejected = pkt.status === 'RECHAZADO';
                      const isTransmitted = pkt.status === 'TRANSMITIDO';

                      let statusBadgeClass = "bg-slate-900 text-slate-400 border-slate-850";
                      if (isPending) statusBadgeClass = "bg-amber-950/40 text-amber-400 border-amber-900/60 animate-pulse";
                      if (isApproved) statusBadgeClass = "bg-emerald-950/40 text-emerald-400 border-emerald-900/60";
                      if (isRejected) statusBadgeClass = "bg-rose-950/40 text-rose-400 border-rose-900/60";
                      if (isTransmitted) statusBadgeClass = "bg-sky-950/40 text-sky-400 border-sky-900/60";

                      const containerClass = pkt.isEmergency
                        ? "bg-red-950/20 border-2 border-red-500/65 shadow-[0_0_15px_rgba(239,68,68,0.15)] rounded-lg p-3.5 pl-5 flex flex-col gap-2.5 transition-all hover:bg-red-950/35 relative overflow-hidden"
                        : "bg-slate-950/80 border border-slate-850 rounded-lg p-3.5 flex flex-col gap-2.5 transition-all hover:bg-slate-900/30";

                      return (
                        <div 
                          key={pkt.id}
                          className={containerClass}
                        >
                          {pkt.isEmergency && (
                            <div className="absolute top-0 left-0 h-full w-1.5 bg-gradient-to-b from-red-500 via-rose-500 to-red-600 animate-pulse" />
                          )}
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-200">
                                {pkt.packetString.split(':')[0]}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                ({pkt.timestamp})
                              </span>
                              {pkt.isEmergency && (
                                <span className="bg-red-600 text-white border border-red-500 text-[9px] font-mono px-2 py-0.5 rounded font-black uppercase tracking-wider animate-pulse flex items-center gap-1 shrink-0 shadow-sm">
                                  <ShieldAlert size={11} className="animate-bounce" />
                                  ALERTA CRÍTICA • ALTA PRIORIDAD
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono border px-2 py-0.5 rounded font-bold uppercase ${statusBadgeClass}`}>
                                {pkt.status}
                              </span>
                              {isTransmitted && (
                                <span className="text-[9px] font-mono text-sky-500">
                                  EMITIDO: {pkt.transmittedAt}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ORIGINAL EVENT DETAILS */}
                          <div className={`p-2.5 rounded border font-mono text-[10px] space-y-1 ${
                            pkt.isEmergency
                              ? "bg-red-950/30 border-red-900/40"
                              : "bg-slate-900/50 border-slate-900"
                          }`}>
                            <div className={`font-bold uppercase text-[9px] flex items-center gap-1 ${
                              pkt.isEmergency ? "text-red-400" : "text-slate-500"
                            }`}>
                              <Database size={10} />
                              Evento de Origen: {pkt.originalTitle}
                            </div>
                            <div className={pkt.isEmergency ? "text-red-200" : "text-slate-400"}>
                              {pkt.originalDetail}
                            </div>
                          </div>

                          {/* RAW APRS PACKET ENCAPSULATION */}
                          <div className={`p-2.5 rounded border font-mono text-xs flex justify-between items-center gap-4 ${
                            pkt.isEmergency
                              ? "bg-red-950/40 border-red-900/50"
                              : "bg-slate-950 border-slate-900"
                          }`}>
                            <div className={`${pkt.isEmergency ? "text-red-400 font-bold" : "text-orange-400"} break-all select-all p-0.5`}>
                              {pkt.packetString}
                            </div>
                            <div className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold shrink-0 ${
                              pkt.isEmergency ? "bg-red-950 text-red-500" : "bg-slate-900 text-slate-500"
                            }`}>
                              AX.25 {pkt.isEmergency ? "PRIORITY Payload" : "Payload"}
                            </div>
                          </div>

                          {/* AUDITING RESPONSE IF PRESENT */}
                          {(pkt.auditNotes || pkt.auditedBy) && (
                            <div className="bg-slate-900/30 border border-slate-850 p-2 rounded text-[10px] font-mono mt-0.5 flex justify-between items-center">
                              <div className="text-slate-400">
                                <span className="text-orange-400 font-bold">Firma CECOP Auditoría:</span> {pkt.auditNotes || "Revisión formal completada."}
                              </div>
                              <div className="text-right text-slate-500 text-[9px]">
                                Firmado por: {pkt.auditedBy || 'CO-CECOP01'} • {pkt.auditedAt}
                              </div>
                            </div>
                          )}

                          {/* PACKET CONTROLS */}
                          <div className="flex gap-2.5 justify-end">
                            {isPending && (
                              <div className="text-[10px] font-mono text-amber-500 flex items-center gap-1 animate-pulse">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                Esperando auditoría y aprobación formal del CECOP en Pilar II para habilitar transmisión FM...
                              </div>
                            )}

                            {isApproved && (
                              <button
                                onClick={() => handleTransmitPacket(pkt)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-sans font-bold text-xs px-4 py-1.5 rounded flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/20"
                              >
                                <Volume2 size={13} className="animate-bounce" />
                                RE-TRANSMITIR POR TNC (VHF 144.800)
                              </button>
                            )}

                            {isTransmitted && (
                              <button
                                onClick={() => handleTransmitPacket(pkt)}
                                className="bg-slate-850 hover:bg-slate-800 text-slate-300 font-sans font-bold text-xs px-4 py-1.5 rounded flex items-center gap-1.5 cursor-pointer border border-slate-800"
                              >
                                <Volume2 size={13} />
                                VOLVER A EMITIR FEED
                              </button>
                            )}

                            {isRejected && (
                              <div className="text-[10px] font-mono text-rose-500 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                Rechazado por el CECOP. Por favor corriga los parámetros antes de volver a solicitar auditoría.
                              </div>
                            )}

                            <button
                              onClick={() => handleDeletePacket(pkt.id)}
                              className="p-1.5 rounded hover:bg-slate-900 border border-slate-900 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"
                              title="Eliminar registro"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {innerTab === 'doc' && (
          <div className="border border-slate-850 rounded-xl bg-slate-950/30 p-6 space-y-4 max-w-4xl mx-auto flex flex-col justify-start min-h-[460px] font-sans">
            <div className="flex items-center gap-2">
              <FileCode className="text-orange-400" size={18} />
              <h3 className="text-sm font-bold text-slate-100 uppercase">ESPECIFICACIÓN DE RED APRS Y ENCAPSULACION EN AX.25</h3>
            </div>

            <div className="font-mono text-xs text-slate-400 space-y-3.5 leading-relaxed">
              <p>
                La red de alerta temprana por radio frecuencia del SAT utiliza tramas del protocolo <strong className="text-slate-200">AX.25 v2.0</strong> operando en modo <strong className="text-slate-200 font-bold">Unnumbered Information (UI)</strong>. Esto permite transmitir telemetría sin acuse de recibo de manera masiva a receptores analógicos y digitales sobre 144.800 MHz AFSK (módem Bell 202).
              </p>

              <div className="bg-slate-950 p-4 border border-slate-900 rounded-lg space-y-2">
                <div className="text-slate-200 font-bold border-b border-slate-900 pb-1.5 uppercase font-sans text-xs">Estructura Detallada de Trama AX.25 (UI)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div className="space-y-1.5">
                    <div><span className="text-rose-400 font-bold">Flag (0x7E):</span> Marca el inicio y fin de la transmisión HDLC binaria.</div>
                    <div><span className="text-yellow-400 font-bold">Address Destino:</span> Identifica el enrutador destino o tabla de símbolos. Padded por 6 bytes y SSID.</div>
                    <div><span className="text-orange-400 font-bold">Address Origen:</span> Indicativo físico emisor (p.ej. EA4SAT-1) codificado con bit-shifting.</div>
                  </div>
                  <div className="space-y-1.5">
                    <div><span className="text-emerald-400 font-bold">Control Field (0x03):</span> Define trama tipo UI para transmisiones de broadcast sin conexión.</div>
                    <div><span className="text-violet-400 font-bold">PID Field (0xF0):</span> Protocolo Layer 3 nulo, indicando formateo nativo APRS ASCII.</div>
                    <div><span className="text-sky-400 font-bold">FCS (CRC-16):</span> Suma de verificación polinómica CCITT para detectar errores de ruido FM.</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/30 p-4 border border-slate-850 rounded-lg space-y-2">
                <div className="text-slate-200 font-semibold border-b border-slate-900 pb-1 uppercase font-sans text-xs">Especificaciones del Formato APRS Utilizados</div>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong className="text-orange-400">Objetos de Alerta (Format ;)</strong>: Diseñado para posicionar incidentes temporales o dinámicos en el mapa del operador (p.ej. un epicentro de terremoto o el foco de un incendio). Lleva hora UTC de detección y el símbolo decorativo.
                  </li>
                  <li>
                    <strong className="text-orange-400">Boletines de Emergencia (Format :BLN#EMERG:)</strong>: Difusión crítica de texto con prioridad absoluta para alertar a la población civil. Aparece en pantalla parpadeando en la consola de radio del destinatario civil.
                  </li>
                  <li>
                    <strong className="text-orange-400">Balizas de Posicionamiento (Format =)</strong>: Posicionamiento instantáneo del núcleo coordinador central EA4SAT.
                  </li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => playPacketAfsktone()}
                  className="bg-slate-900 border border-slate-800 hover:bg-slate-850 px-3.5 py-1.5 rounded-lg text-[11px] font-sans font-bold text-orange-400 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Volume2 size={13} />
                  PROBAR GENERADOR TONOS AFSK (BELL-202)
                </button>
              </div>
            </div>
          </div>
        )}

        {innerTab === 'traductor' && (
          <div className="border border-slate-850 rounded-xl bg-slate-950/30 p-6 space-y-4 max-w-4xl mx-auto flex flex-col justify-start min-h-[460px] font-sans">
            <div className="flex items-center gap-2">
              <Compass className="text-orange-400" size={18} />
              <h3 className="text-sm font-bold text-slate-100 uppercase">Traductor Técnico de Tramas APRS Ambientales</h3>
            </div>

            <p className="font-mono text-xs text-slate-400 leading-relaxed">
              El siguiente módulo interactivo descifra en tiempo real las tramas de telemetría meteorológica (balizas WX) transmitidas por las estaciones APRS de emergencia. Selecciona o pasa el cursor sobre cada token codificado para visualizar la traducción directa y los cálculos físicos aplicados en base a la especificación técnica internacional de APRS.
            </p>

            {/* APRS WX frame Parser Explainer (Interactive) */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col gap-4 justify-between mt-2">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-slate-400 uppercase font-black tracking-widest block">Análisis Sintáctico y Semántico de la Trama</span>
                <span className="text-[10px] text-slate-400 font-sans leading-tight">
                  La trama generada por la estación climatológica local (Pilar VI Weather Station) es la siguiente:
                </span>
              </div>

              {/* Raw string block splitter */}
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-900 font-mono text-sm flex flex-wrap gap-1 items-center font-black select-none tracking-wider justify-center">
                {tokens.map((tok) => {
                  const matches = activeExplainToken === tok.code;
                  return (
                    <span
                      key={tok.code}
                      onMouseEnter={() => setActiveExplainToken(tok.code)}
                      onMouseLeave={() => setActiveExplainToken(null)}
                      onClick={() => setActiveExplainToken(matches ? null : tok.code)}
                      className={`px-1.5 rounded transition-colors cursor-help py-1.5 ${
                        matches 
                          ? 'bg-emerald-950 border border-emerald-500 ' + tok.color 
                          : 'hover:bg-slate-900 border border-transparent ' + tok.color
                      }`}
                    >
                      {tok.code}
                    </span>
                  );
                })}
              </div>

              {/* active explain tooltip display */}
              <div className="min-h-[75px] font-mono text-xs bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col justify-center">
                {activeExplainToken ? (
                  (() => {
                    const tok = tokens.find(t => t.code === activeExplainToken);
                    if (!tok) return null;
                    return (
                      <div>
                        <div className="font-extrabold text-[#10b981] flex items-center gap-1.5 font-sans text-xs">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          {tok.label} (Token: `{tok.code.trim()}`)
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1 leading-normal">{tok.desc}</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-[11px] text-slate-500 font-sans italic text-center py-2">
                    Pasa el ratón sobre los caracteres de la fila superior para traducción instantánea de RF.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-900/20 p-4 border border-slate-900 rounded-lg space-y-2 text-xs text-slate-400">
              <span className="font-sans font-bold text-slate-300 uppercase text-[10px] tracking-wider block">Reglas de Formateo de Balizas WX</span>
              <p className="leading-relaxed">
                La norma APRS indica que un paquete meteorológico sin posición geográfica comienza con el identificador <code className="text-pink-400 bg-slate-950 px-1 py-0.5 rounded font-mono font-bold">_</code>. A partir de allí, se concatena información fija de dirección del viento de 3 dígitos seguida de una barra inclinada <code className="text-slate-200">/</code> y velocidad del viento en nudos. Las demás variables físicas opcionales se formatean mediante letras clave identificadoras seguidas de sus correspondientes valores numéricos con padding estricto.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
