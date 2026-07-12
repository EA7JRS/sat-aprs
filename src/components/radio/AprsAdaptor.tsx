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
  Compass,
  MessageSquare,
  Inbox,
  CheckCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Bell,
  BellOff
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
  isAprsPopupEnabled?: boolean;
  setIsAprsPopupEnabled?: (val: boolean) => void;
  aprsPopupFilter?: 'ALL' | 'MICE_EMG' | 'MICE_PRIO';
  setAprsPopupFilter?: (val: 'ALL' | 'MICE_EMG' | 'MICE_PRIO') => void;
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

// --- MULTI-PROTOCOL DECENAS DE CÁLCULOS RIGUROSOS APRS & MIC-E EN ESPAÑOL ---

export interface ParsedAprsResult {
  source: string;
  destination: string;
  path: string[];
  type: string;
  latitude?: number;
  longitude?: number;
  symbolTable?: string;
  symbolCode?: string;
  isEmergency: boolean;
  messageText?: string;
  msgId?: string;
  recipient?: string;
  comment?: string;
  originalStr: string;
  rawTypeChar?: string;
}

export function encodeMicELatitude(lat: number, isSouth: boolean, msgCode: number, isCustom: boolean = false): { destination: string; steps: string[] } {
  const latAbs = Math.abs(lat);
  const latDeg = Math.floor(latAbs);
  const latMin = (latAbs - latDeg) * 60;
  
  const d1 = Math.floor(latDeg / 10);
  const d2 = latDeg % 10;
  const d3 = Math.floor(latMin / 10);
  const d4 = Math.floor(latMin) % 10;
  const d5 = Math.floor((latMin % 1) * 10);
  const d6_val = Math.round((latMin - Math.floor(latMin)) * 100) % 10;
  
  const digits = [d1, d2, d3, d4, d5, d6_val];
  const bits = [
    (msgCode & 4) ? 1 : 0, // A
    (msgCode & 2) ? 1 : 0, // B
    (msgCode & 1) ? 1 : 0  // C
  ];
  
  let dest = '';
  const steps: string[] = [];
  
  for (let i = 0; i < 6; i++) {
    const digit = digits[i];
    let char = '';
    let explanation = '';
    
    if (i < 3) {
      const bit = bits[i];
      if (!isCustom) {
        if (bit === 0) {
          char = String.fromCharCode(0x41 + digit); // A-J
          explanation = `Byte ${i+1} (${['A','B','C'][i]}=0): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x41 + digit).toString(16).toUpperCase()})`;
        } else {
          char = String.fromCharCode(0x50 + digit); // P-Y
          explanation = `Byte ${i+1} (${['A','B','C'][i]}=1): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x50 + digit).toString(16).toUpperCase()})`;
        }
      } else {
        if (bit === 0) {
          char = String.fromCharCode(0x4B + digit); // K-T
          explanation = `Byte ${i+1} (Custom ${['A','B','C'][i]}=0): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x4B + digit).toString(16).toUpperCase()})`;
        } else {
          char = String.fromCharCode(0x50 + digit); // P-Y
          explanation = `Byte ${i+1} (Custom ${['A','B','C'][i]}=1): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x50 + digit).toString(16).toUpperCase()})`;
        }
      }
    } else if (i === 3) {
      if (!isSouth) {
        char = String.fromCharCode(0x41 + digit); // A-J (North, Lat Offset = North)
        explanation = `Byte 4 (Hemisferio Norte): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x41 + digit).toString(16).toUpperCase()})`;
      } else {
        char = String.fromCharCode(0x4B + digit); // K-T (South)
        explanation = `Byte 4 (Hemisferio Sur): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x4B + digit).toString(16).toUpperCase()})`;
      }
    } else if (i === 4) {
      // Longitude Offset is standard 0 for western Europe
      char = String.fromCharCode(0x41 + digit); // A-J
      explanation = `Byte 5 (Longitud < 100°): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x41 + digit).toString(16).toUpperCase()})`;
    } else {
      const isWest = true; // West
      if (!isWest) {
        char = String.fromCharCode(0x41 + digit); // East
        explanation = `Byte 6 (Hemisferio Este): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x41 + digit).toString(16).toUpperCase()})`;
      } else {
        char = String.fromCharCode(0x4B + digit); // West
        explanation = `Byte 6 (Hemisferio Oeste): Dígito Latitud ${digit} se codifica como '${char}' (0x${(0x4B + digit).toString(16).toUpperCase()})`;
      }
    }
    
    dest += char;
    steps.push(explanation);
  }
  
  return { destination: dest, steps };
}

export function decodeMicEPacket(dest: string): { latitude: number; isSouth: boolean; isWest: boolean; isOffset: boolean; msgCode: number; msgText: string; steps: string[] } {
  const steps: string[] = [];
  let latVal = 0;
  let isSouth = false;
  let isWest = false;
  let isOffset = false;
  let bitA = 0;
  let bitB = 0;
  let bitC = 0;
  let isCustom = false;
  
  const dDigits: number[] = [];
  
  for (let i = 0; i < 6; i++) {
    const char = dest.charAt(i).toUpperCase();
    const code = char.charCodeAt(0);
    let digit = 0;
    
    if (code >= 0x41 && code <= 0x4A) { // A-J
      digit = code - 0x41;
      if (i === 0) bitA = 0;
      if (i === 1) bitB = 0;
      if (i === 2) bitC = 0;
      if (i === 3) isSouth = false;
      if (i === 4) isOffset = false;
      if (i === 5) isWest = false;
      steps.push(`Byte ${i+1} ('${char}'): Dígito ${digit}, bit de mensaje ${['A','B','C','N/S','LonOffset','E/W'][i] || ''}=0, standard`);
    } else if (code >= 0x4B && code <= 0x54) { // K-T
      digit = code - 0x4B;
      if (i === 0) { bitA = 0; isCustom = true; }
      if (i === 1) { bitB = 0; isCustom = true; }
      if (i === 2) { bitC = 0; isCustom = true; }
      if (i === 3) isSouth = true;
      if (i === 4) isOffset = true;
      if (i === 5) isWest = true;
      steps.push(`Byte ${i+1} ('${char}'): Dígito ${digit}, bit de mensaje ${['A','B','C','N/S','LonOffset','E/W'][i] || ''}=0 (Custom/Alt)`);
    } else if (code >= 0x50 && code <= 0x59) { // P-Y
      digit = code - 0x50;
      if (i === 0) bitA = 1;
      if (i === 1) bitB = 1;
      if (i === 2) bitC = 1;
      if (i === 3) isSouth = true;
      if (i === 4) isOffset = true;
      if (i === 5) isWest = true;
      steps.push(`Byte ${i+1} ('${char}'): Dígito ${digit}, bit de mensaje ${['A','B','C','N/S','LonOffset','E/W'][i] || ''}=1`);
    } else if (code >= 0x30 && code <= 0x39) { // 0-9
      digit = code - 0x30;
      steps.push(`Byte ${i+1} ('${char}'): Dígito ${digit} (Compatibilidad de canal directo sin prioridad)`);
    } else {
      steps.push(`Byte ${i+1} ('${char}'): Inválido o carácter especial fuera de estándar`);
    }
    
    dDigits.push(digit);
  }
  
  const latDeg = dDigits[0] * 10 + dDigits[1];
  const latMin = dDigits[2] * 10 + dDigits[3] + dDigits[4] / 10 + dDigits[5] / 100;
  latVal = latDeg + latMin / 60;
  if (isSouth) latVal = -latVal;
  
  const msgCode = (bitA << 2) | (bitB << 1) | bitC;
  const MSG_MAP = [
    "M0: Off Duty / Fuera de Servicio",
    "M1: In Service / En Servicio",
    "M2: En Route / En Ruta",
    "M3: Returning / Regresando",
    "M4: Committed / Comprometido",
    "M5: Special / Tránsito Especial",
    "M6: Priority / Prioritario",
    "EMG: EMERGENCY / EMERGENCIA CRÍTICA"
  ];
  const msgText = (isCustom ? "Custom " : "") + (MSG_MAP[msgCode] || "Estado no estándar");
  
  return {
    latitude: latVal,
    isSouth,
    isWest,
    isOffset,
    msgCode,
    msgText,
    steps
  };
}

export function parseGenericAprs(rawStr: string): ParsedAprsResult {
  const result: ParsedAprsResult = {
    source: 'UNKNOWN',
    destination: 'APRS',
    path: [],
    type: 'DESCONOCIDO',
    isEmergency: false,
    originalStr: rawStr
  };

  try {
    const mainParts = rawStr.split(':');
    if (mainParts.length < 2) {
      return result;
    }

    const header = mainParts[0];
    const payload = mainParts.slice(1).join(':');

    const headerParts = header.split('>');
    if (headerParts.length >= 2) {
      result.source = headerParts[0].trim();
      const destAndPath = headerParts[1].split(',');
      result.destination = destAndPath[0].trim();
      result.path = destAndPath.slice(1).map(p => p.trim());
    } else {
      result.source = header.trim();
    }

    result.messageText = payload;

    if (payload.startsWith('=')) {
      result.type = 'BEACON (Posición sin timestamp)';
      result.rawTypeChar = '=';
      const match = payload.match(/^=(\d{4}\.\d{2}[NS])(.)(\d{5}\.\d{2}[EW])(.)(.*)$/);
      if (match) {
        result.symbolTable = match[2];
        result.symbolCode = match[4];
        result.comment = match[5];
        const latStr = match[1];
        const lonStr = match[3];
        const latVal = parseFloat(latStr.substring(0, 2)) + parseFloat(latStr.substring(2, 7)) / 60;
        const latSign = latStr.endsWith('S') ? -1 : 1;
        result.latitude = latVal * latSign;
        const lonVal = parseFloat(lonStr.substring(0, 3)) + parseFloat(lonStr.substring(3, 8)) / 60;
        const lonSign = lonStr.endsWith('W') ? -1 : 1;
        result.longitude = lonVal * lonSign;
      }
    } else if (payload.startsWith('@')) {
      result.type = 'BEACON (Posición con timestamp)';
      result.rawTypeChar = '@';
      const match = payload.match(/^@\d{6}[hz\/](\d{4}\.\d{2}[NS])(.)(\d{5}\.\d{2}[EW])(.)(.*)$/);
      if (match) {
        result.symbolTable = match[2];
        result.symbolCode = match[4];
        result.comment = match[5];
        const latStr = match[1];
        const lonStr = match[3];
        const latVal = parseFloat(latStr.substring(0, 2)) + parseFloat(latStr.substring(2, 7)) / 60;
        const latSign = latStr.endsWith('S') ? -1 : 1;
        result.latitude = latVal * latSign;
        const lonVal = parseFloat(lonStr.substring(0, 3)) + parseFloat(lonStr.substring(3, 8)) / 60;
        const lonSign = lonStr.endsWith('W') ? -1 : 1;
        result.longitude = lonVal * lonSign;
      }
    } else if (payload.startsWith(';')) {
      result.type = 'OBJECT (Alerta de incidente)';
      result.rawTypeChar = ';';
      const match = payload.match(/^;(.{9})(.)\d{6}[hz\/](\d{4}\.\d{2}[NS])(.)(\d{5}\.\d{2}[EW])(.)(.*)$/);
      if (match) {
        result.symbolTable = match[4];
        result.symbolCode = match[6];
        result.comment = match[7];
        const latStr = match[3];
        const lonStr = match[5];
        const latVal = parseFloat(latStr.substring(0, 2)) + parseFloat(latStr.substring(2, 7)) / 60;
        const latSign = latStr.endsWith('S') ? -1 : 1;
        result.latitude = latVal * latSign;
        const lonVal = parseFloat(lonStr.substring(0, 3)) + parseFloat(lonStr.substring(3, 8)) / 60;
        const lonSign = lonStr.endsWith('W') ? -1 : 1;
        result.longitude = lonVal * lonSign;
      }
    } else if (payload.startsWith(':')) {
      if (payload.startsWith(':BLN') || /:BLN\d/i.test(payload)) {
        result.type = 'BULLETIN (Boletín civil)';
        result.rawTypeChar = ':';
        const blnMatch = payload.match(/^:BLN(\d)[^:]*:(.*)$/i);
        if (blnMatch) {
          result.comment = blnMatch[2];
          result.recipient = `BLN${blnMatch[1]}`;
        }
        if (payload.toUpperCase().includes('EMERG') || payload.toUpperCase().includes('ALERTA')) {
          result.isEmergency = true;
        }
      } else {
        result.type = 'MESSAGE (Mensaje directo SMS)';
        result.rawTypeChar = ':';
        const msgMatch = payload.match(/^:([^:]+):(.*?)$/);
        if (msgMatch) {
          result.recipient = msgMatch[1].trim();
          let msgText = msgMatch[2];
          const ackMatch = msgText.match(/\{([a-zA-Z0-9]+)$/);
          if (ackMatch) {
            result.msgId = ackMatch[1];
            msgText = msgText.replace(/\{([a-zA-Z0-9]+)$/, '');
          }
          result.comment = msgText;
          if (msgText.toUpperCase().includes('SOS') || msgText.toUpperCase().includes('EMERGENCIA') || msgText.toUpperCase().includes('HELP')) {
            result.isEmergency = true;
          }
        }
      }
    } else if (payload.startsWith('_')) {
      result.type = 'WEATHER (Meteo sin posición)';
      result.rawTypeChar = '_';
      result.comment = 'Datos de telemetría de estación de clima (temperatura, viento, humedad)';
    } else {
      const dest = result.destination;
      const isMiceDest = /^[A-Z0-9]{6}$/.test(dest) && !dest.startsWith('AP') && !dest.startsWith('Q');
      if (isMiceDest) {
        result.type = 'MIC-E (Trama de posición comprimida)';
        const mice = decodeMicEPacket(dest);
        result.latitude = mice.latitude;
        result.isEmergency = mice.msgCode === 7;
        result.comment = `Estado Mic-E: ${mice.msgText}. Hemisferio: ${mice.isSouth ? 'Sur' : 'Norte'}/${mice.isWest ? 'Oeste' : 'Este'}.`;
      } else {
        result.type = 'TRAMA DESCONOCIDA / COMENTARIO';
        result.comment = payload;
      }
    }
  } catch (err) {
    result.type = 'ERROR AL DECODIFICAR';
    result.comment = 'La sintaxis de la trama no se ajusta al estándar de especificación APRS.';
  }

  return result;
}

export default function AprsAdaptor({
  earthquakes,
  csnStations,
  dgtIncidents,
  navareas,
  aprsPackets,
  setAprsPackets,
  playBuzzerSound,
  showToast,
  weather,
  isAprsPopupEnabled = true,
  setIsAprsPopupEnabled,
  aprsPopupFilter = 'ALL',
  setAprsPopupFilter
}: AprsAdaptorProps) {
  
  const [innerTab, setInnerTab] = useState<'adaptar' | 'consola' | 'traductor' | 'doc' | 'mensajeria' | 'yaesu'>('adaptar');
  const [activeExplainToken, setActiveExplainToken] = useState<string | null>(null);

  // Yaesu FTM-400DR emulation states
  const [yaesuSubTab, setYaesuSubTab] = useState<'station_list' | 'aprs_msg' | 'smart_beacon' | 'status_config'>('station_list');
  const [yaesuActiveStationId, setYaesuActiveStationId] = useState<string | null>(null);
  const [yaesuSpeed, setYaesuSpeed] = useState(25); // km/h slider
  const [yaesuHeading, setYaesuHeading] = useState(120); // degrees slider
  const [yaesuSteeringAngle, setYaesuSteeringAngle] = useState(0); // degrees
  const [yaesuIsSmartBeaconActive, setYaesuIsSmartBeaconActive] = useState(true);
  const [yaesuBeaconIntervalSec, setYaesuBeaconIntervalSec] = useState(120); // seconds left
  const [yaesuSmartBeaconLog, setYaesuSmartBeaconLog] = useState<string[]>(['[SISTEMA] SmartBeaconing iniciado. Intervalo de reposo: 300s']);
  const [yaesuStatusSlot, setYaesuStatusSlot] = useState(0);
  const [yaesuStatusComments, setYaesuStatusComments] = useState<string[]>([
    '144.800MHz REMER EA4SAT-1',
    'COORD: MADRID GATEWAY',
    'PILAR II EMCOM SYSTEM OK',
    'YAESU FTM-400DR EMULATION',
    'ESTACION MOVIL RED SAT'
  ]);
  const [yaesuInputStatusText, setYaesuInputStatusText] = useState('');
  const [yaesuSelectedMsgIndex, setYaesuSelectedMsgIndex] = useState<number | null>(null);
  const [yaesuTxActive, setYaesuTxActive] = useState(false);

  const yaesuStationList = [
    { id: '1', callsign: 'EA4CECOP-1', symbol: '[', lat: 40.4189, lon: -3.6919, comment: 'Puesto de Mando CECOP', type: 'fija', timestamp: '10:45:12' },
    { id: '2', callsign: 'ED4YAK-2', symbol: '>', lat: 40.4530, lon: -3.7262, comment: 'Radioclub UPM Escuela', type: 'móvil', timestamp: '11:12:05' },
    { id: '3', callsign: 'EA1MNT-5', symbol: '/', lat: 40.8423, lon: -3.9576, comment: 'Meteo Refugio Peñalara', type: 'clima', timestamp: '11:30:41' },
    { id: '4', callsign: 'REMER-M40', symbol: 'L', lat: 40.4167, lon: -3.7037, comment: 'Mesa Red Coordinación', type: 'fija', timestamp: '09:15:22' }
  ];

  const getStationMetrics = (stnLat: number, stnLon: number) => {
    const myLat = 40.416775;
    const myLon = -3.703790;
    const distance = calculateDistanceKm(myLat, myLon, stnLat, stnLon);
    const bearing = calculateBearing(myLat, myLon, stnLat, stnLon);
    const bearingName = getBearingName(bearing);
    return { distance, bearing, bearingName };
  };

  // Estados añadidos para analizador dinámico de APRS y simulador Mic-E
  const [aprsTranslateTab, setAprsTranslateTab] = useState<'weather' | 'generic' | 'mice'>('weather');
  const [analyzerInput, setAnalyzerInput] = useState('EA4SAT>APCE01,WIDE1-1::EA4CECOP :QSL recibido. Operativo.{msg32');
  const [miceEncLat, setMiceEncLat] = useState(40.4167);
  const [miceEncLon, setMiceEncLon] = useState(-3.7037);
  const [miceEncSouth, setMiceEncSouth] = useState(false);
  const [miceEncMsgCode, setMiceEncMsgCode] = useState(2); // M2: En Route
  const [miceEncCustom, setMiceEncCustom] = useState(false);

  // Retransmisión y bucles ACK reales de APRS
  const [retryStates, setRetryStates] = useState<Record<string, { attempt: number, maxAttempts: number, nextRetrySec: number, status: 'WAITING_ACK' | 'ACKED' | 'FAILED' }>>({});

  // APRS Bidirectional Messaging States
  const [chatMessageText, setChatMessageText] = useState('');
  const [chatSelectedCallsign, setChatSelectedCallsign] = useState('EA4CECOP');
  const [chatViewMode, setChatViewMode] = useState<'chat' | 'inbox' | 'outbox'>('chat');
  const [requireChatAck, setRequireChatAck] = useState(true);
  const [autoAckEnabled, setAutoAckEnabled] = useState(true);
  
  // Simulated incoming message states
  const [simulatedSender, setSimulatedSender] = useState('ED4YAK-2');
  const [simulatedText, setSimulatedText] = useState('Recibido fuerte y claro por aquí en Madrid, 73!');
  const [simulatedAckReq, setSimulatedAckReq] = useState(true);

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

  // Haversine formula to compute actual distance in Km between two points
  function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Calculate compass bearing degree from point 1 to point 2
  function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  function getBearingName(deg: number): string {
    const d = deg % 360;
    if (d > 337.5 || d <= 22.5) return 'N';
    if (d > 22.5 && d <= 67.5) return 'NE';
    if (d > 67.5 && d <= 112.5) return 'E';
    if (d > 112.5 && d <= 157.5) return 'SE';
    if (d > 157.5 && d <= 202.5) return 'S';
    if (d > 202.5 && d <= 247.5) return 'SO';
    if (d > 247.5 && d <= 292.5) return 'O';
    return 'NO';
  }

  // Dynamic SmartBeaconing calculation based on speed
  const calculateSmartBeaconInterval = (speedVal: number) => {
    const lowSpeed = 5;
    const highSpeed = 70;
    const slowRate = 1800; // 30 min
    const fastRate = 120;  // 2 min
    
    if (speedVal <= lowSpeed) return slowRate;
    if (speedVal >= highSpeed) return fastRate;
    
    // Linear interpolation
    const ratio = (highSpeed - speedVal) / (highSpeed - lowSpeed);
    return Math.round(fastRate + (slowRate - fastRate) * ratio);
  };

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

  // Bucle de Simulación de retransmisión de trama y Backoff Exponencial AX.25 / APRS
  useEffect(() => {
    const timer = setInterval(() => {
      setRetryStates(prev => {
        const next = { ...prev };
        let updatedAny = false;
        
        Object.keys(next).forEach(pId => {
          const state = next[pId];
          if (state.status === 'WAITING_ACK') {
            updatedAny = true;
            if (state.nextRetrySec > 1) {
              next[pId] = { ...state, nextRetrySec: state.nextRetrySec - 1 };
            } else {
              const nextAttempt = state.attempt + 1;
              if (nextAttempt > state.maxAttempts) {
                next[pId] = { ...state, attempt: nextAttempt, status: 'FAILED', nextRetrySec: 0 };
                setAprsPackets(currentPackets => 
                  currentPackets.map(p => 
                    p.id === pId ? { ...p, auditNotes: '⚠️ ERROR: ACK no recibido tras 5 retransmisiones (timeout AX.25)' } : p
                  )
                );
              } else {
                const nextWait = 4 * nextAttempt; // Backoff exponencial: 8s, 12s, 16s...
                next[pId] = { ...state, attempt: nextAttempt, nextRetrySec: nextWait };
                playPacketAfsktone();
                setAprsPackets(currentPackets => 
                  currentPackets.map(p => 
                    p.id === pId ? { ...p, auditNotes: `Retransmitiendo (Intento ${nextAttempt}/5) en ${nextWait}s...` } : p
                  )
                );
              }
            }
          }
        });
        
        return updatedAny ? next : prev;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [setAprsPackets]);

  // SmartBeaconing countdown timer
  useEffect(() => {
    if (!yaesuIsSmartBeaconActive || innerTab !== 'yaesu') return;
    
    const interval = setInterval(() => {
      setYaesuBeaconIntervalSec(prev => {
        if (prev <= 1) {
          // Trigger Beacon TX!
          setYaesuTxActive(true);
          playPacketAfsktone();
          
          // Generate simulated packet string
          const activeComment = yaesuStatusComments[yaesuStatusSlot] || 'PILAR II EMCOM';
          const lat = 40.416775;
          const lon = -3.703790;
          const { latStr, lonStr } = convertToAprsCoords(lat, lon);
          const payload = `!${latStr}/${lonStr}>${activeComment} [SPD:${yaesuSpeed}km/h]`;
          
          const newPkt: AprsPacket = {
            id: `yaesu-sb-${Date.now()}`,
            sourceEventId: 'yaesu-smartbeacon',
            eventType: 'manual',
            originalTitle: `SMARTBEACON EMITIDO (MÓVIL)`,
            originalDetail: `Transmisión automática por algoritmo SmartBeaconing (${yaesuSpeed} km/h).`,
            timestamp: new Date().toLocaleTimeString(),
            latitude: lat,
            longitude: lon,
            callsign: aprsSource,
            destination: 'APWY40', // APYaesu400
            path: 'WIDE1-1,WIDE2-1',
            aprsType: 'BEACON',
            symbol: '>',
            messageText: payload,
            packetString: `${aprsSource}>APWY40,WIDE1-1,WIDE2-1:${payload}`,
            status: 'TRANSMITIDO',
            isEmergency: false,
            auditNotes: `SmartBeaconing: Intervalo recalculado en base a velocidad de ${yaesuSpeed} Km/h.`
          };
          
          setAprsPackets(current => [newPkt, ...current]);
          
          setYaesuSmartBeaconLog(l => [
            `[${new Date().toLocaleTimeString()}] 🚀 Baliza enviada por SmartBeaconing! Intervalo: ${calculateSmartBeaconInterval(yaesuSpeed)}s. Comentario: "${activeComment}"`,
            ...l
          ].slice(0, 30));
          
          setTimeout(() => setYaesuTxActive(false), 800);
          
          // Reset countdown to the dynamic interval according to speed
          return calculateSmartBeaconInterval(yaesuSpeed);
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [yaesuIsSmartBeaconActive, yaesuSpeed, yaesuStatusSlot, yaesuStatusComments, innerTab, aprsSource, setAprsPackets]);

  // Corner-peg beaconing simulation (Giro brusco en curvas)
  useEffect(() => {
    if (innerTab !== 'yaesu' || !yaesuIsSmartBeaconActive || yaesuSpeed <= 5) return;
    
    // If steering angle is sharp (absolute value >= 28 deg)
    if (Math.abs(yaesuSteeringAngle) >= 28) {
      setYaesuTxActive(true);
      playPacketAfsktone();
      
      const activeComment = yaesuStatusComments[yaesuStatusSlot] || 'PILAR II EMCOM';
      const lat = 40.416775;
      const lon = -3.703790;
      const { latStr, lonStr } = convertToAprsCoords(lat, lon);
      const payload = `!${latStr}/${lonStr}>Giro: ${yaesuSteeringAngle}° - ${activeComment}`;
      
      const newPkt: AprsPacket = {
        id: `yaesu-turn-${Date.now()}`,
        sourceEventId: 'yaesu-smartbeacon-turn',
        eventType: 'manual',
        originalTitle: `SMARTBEACON DETECTADO GIRO (${yaesuSteeringAngle}°)`,
        originalDetail: `Transmisión de baliza por ángulo de giro de ${yaesuSteeringAngle}° mayor a 28°.`,
        timestamp: new Date().toLocaleTimeString(),
        latitude: lat,
        longitude: lon,
        callsign: aprsSource,
        destination: 'APWY40',
        path: 'WIDE1-1,WIDE2-1',
        aprsType: 'BEACON',
        symbol: '>',
        messageText: payload,
        packetString: `${aprsSource}>APWY40,WIDE1-1,WIDE2-1:${payload}`,
        status: 'TRANSMITIDO',
        isEmergency: false,
        auditNotes: `SmartBeaconing: Transmisión por giro brusco de ${yaesuSteeringAngle}° (Corner-Pegging).`
      };
      
      setAprsPackets(current => [newPkt, ...current]);
      
      setYaesuSmartBeaconLog(l => [
        `[${new Date().toLocaleTimeString()}] ↩️ ¡Corner-Pegging TX! Giro brusco de ${yaesuSteeringAngle}° detectado. Forzando transmisión de baliza inmediata.`,
        ...l
      ].slice(0, 30));
      
      // Reset the countdown to avoid transmitting twice too close
      setYaesuBeaconIntervalSec(calculateSmartBeaconInterval(yaesuSpeed));
      
      // Reset steering angle slider to 0 after short delay so it behaves like returning steering wheel
      const resetTimer = setTimeout(() => {
        setYaesuSteeringAngle(0);
      }, 1000);
      
      setTimeout(() => setYaesuTxActive(false), 800);
      return () => clearTimeout(resetTimer);
    }
  }, [yaesuSteeringAngle, innerTab, yaesuIsSmartBeaconActive, yaesuSpeed, yaesuStatusSlot, yaesuStatusComments, aprsSource, setAprsPackets]);

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

  // APRS Chat messaging helpers
  const handleSendChatMessage = (textToSubmit?: string, recipientOverride?: string) => {
    const text = (textToSubmit !== undefined ? textToSubmit : chatMessageText).trim();
    const recipient = (recipientOverride || chatSelectedCallsign || 'EA4CECOP').toUpperCase();
    if (!text) return;

    const msgId = Math.floor(Math.random() * 90) + 10; // 10 to 99
    const ackSuffix = requireChatAck ? `{msg${msgId}` : '';
    const fullTextMsg = `${text}${ackSuffix}`.slice(0, 67);

    const paddedRecipient = recipient.slice(0, 9).padEnd(9, ' ');
    const packetString = `${aprsSource}>${aprsDest},${aprsPath}::${paddedRecipient}:${fullTextMsg}`;

    const newPacket: AprsPacket = {
      id: `chat-sent-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sourceEventId: 'chat-sent',
      eventType: 'manual',
      originalTitle: `MENSAJE DIRECTO ENVIADO A ${recipient}`,
      originalDetail: text,
      timestamp: new Date().toLocaleTimeString(),
      latitude: 40.416775,
      longitude: -3.703790,
      callsign: aprsSource,
      destination: recipient,
      path: aprsPath,
      aprsType: 'MESSAGE',
      symbol: '>',
      messageText: text,
      packetString: packetString,
      status: 'TRANSMITIDO',
      isEmergency: false,
      auditNotes: requireChatAck ? `Esperando ACK (${ackSuffix})...` : 'Emitido sin solicitud de acuse.'
    };

    const updated = [newPacket, ...aprsPackets];
    setAprsPackets(updated);
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

    setChatMessageText('');
    playPacketAfsktone();
    if (showToast) showToast(`✉️ Transmitiendo SMS APRS a ${recipient}...`);

    if (requireChatAck) {
      setRetryStates(prev => ({
        ...prev,
        [newPacket.id]: {
          attempt: 1,
          maxAttempts: 5,
          nextRetrySec: 4,
          status: 'WAITING_ACK'
        }
      }));

      // Si el ACK automático está activo, simular la respuesta después de un pequeño retardo.
      // Hacemos que ocurra tras 6 segundos para que pase al menos por un reenvío y demuestre el protocolo de backoff de AX.25.
      if (autoAckEnabled) {
        setTimeout(() => {
          setRetryStates(prev => {
            const state = prev[newPacket.id];
            if (state && state.status === 'WAITING_ACK') {
              handleManualConfirmAck(newPacket.id);
            }
            return prev;
          });
        }, 6500);
      }
    }
  };

  const handleManualConfirmAck = (packetId: string) => {
    setRetryStates(prev => {
      if (prev[packetId]) {
        return {
          ...prev,
          [packetId]: { ...prev[packetId], status: 'ACKED', nextRetrySec: 0 }
        };
      }
      return prev;
    });
    
    setAprsPackets(currentPackets => {
      const updatedPackets = currentPackets.map(pkt => {
        if (pkt.id === packetId) {
          return {
            ...pkt,
            auditNotes: `ACK Recibido ✔ (Confirmación de enlace)`
          };
        }
        return pkt;
      });
      localStorage.setItem('sat_aprs_packets', JSON.stringify(updatedPackets));
      return updatedPackets;
    });
    if (showToast) showToast('🔔 ACK de confirmación de trama registrado con éxito.');
    if (playBuzzerSound) playBuzzerSound(880, 0.12, 'sine');
  };

  const handleSimulateIncomingMessage = () => {
    const sender = simulatedSender.trim().toUpperCase() || 'ED4YAK-2';
    const text = simulatedText.trim() || 'Recibido fuerte y claro por aquí en Madrid, 73!';
    if (!text) return;

    const msgId = Math.floor(Math.random() * 90) + 10;
    const ackSuffix = simulatedAckReq ? `{inc${msgId}` : '';
    const fullText = `${text}${ackSuffix}`.slice(0, 67);

    const paddedMyCall = aprsSource.slice(0, 9).padEnd(9, ' ');
    const packetString = `${sender}>APRS,WIDE1-1::${paddedMyCall}:${fullText}`;

    const newPacket: AprsPacket = {
      id: `chat-recv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sourceEventId: 'chat-received',
      eventType: 'manual',
      originalTitle: `MENSAJE DIRECTO RECIBIDO DE ${sender}`,
      originalDetail: text,
      timestamp: new Date().toLocaleTimeString(),
      latitude: 40.416775,
      longitude: -3.703790,
      callsign: sender,
      destination: aprsSource,
      path: 'WIDE1-1',
      aprsType: 'MESSAGE',
      symbol: '>',
      messageText: text,
      packetString: packetString,
      status: 'TRANSMITIDO',
      isEmergency: false,
      auditNotes: simulatedAckReq ? `Pendiente de ACK (${ackSuffix})` : 'Recibido sin solicitud de acuse.'
    };

    const updated = [newPacket, ...aprsPackets];
    setAprsPackets(updated);
    localStorage.setItem('sat_aprs_packets', JSON.stringify(updated));

    if (showToast) showToast(`📬 Mensaje recibido de ${sender}: "${text}"`);
    playPacketAfsktone();

    if (simulatedAckReq && autoAckEnabled) {
      setTimeout(() => {
        const ackReplyText = `ack${msgId}`;
        const paddedSender = sender.slice(0, 9).padEnd(9, ' ');
        const ackPacketStr = `${aprsSource}>${aprsDest},${aprsPath}::${paddedSender}:${ackReplyText}`;

        const ackPacket: AprsPacket = {
          id: `chat-ack-sent-${Date.now()}`,
          sourceEventId: 'chat-sent',
          eventType: 'manual',
          originalTitle: `ACK EMITIDO A ${sender}`,
          originalDetail: `Acuse de recibo para id: ${msgId}`,
          timestamp: new Date().toLocaleTimeString(),
          latitude: 40.416775,
          longitude: -3.703790,
          callsign: aprsSource,
          destination: sender,
          path: aprsPath,
          aprsType: 'MESSAGE',
          symbol: '>',
          messageText: `ack${msgId}`,
          packetString: ackPacketStr,
          status: 'TRANSMITIDO',
          isEmergency: false,
          auditNotes: `Confirmación enviada automáticamente para: ${ackReplyText}`
        };

        setAprsPackets(currentPackets => {
          const marked = currentPackets.map(pkt => {
            if (pkt.id === newPacket.id) {
              return {
                ...pkt,
                auditNotes: `ACK Confirmado ✔ (Auto-ACK enviado)`
              };
            }
            return pkt;
          });
          const withAck = [ackPacket, ...marked];
          localStorage.setItem('sat_aprs_packets', JSON.stringify(withAck));
          return withAck;
        });

        if (showToast) showToast(`⚡ Auto-ACK transmitido a ${sender}`);
        playPacketAfsktone();
      }, 1500);
    }
  };

  const handleManualSendAck = (incomingPacket: AprsPacket) => {
    const msgText = incomingPacket.messageText || '';
    const match = incomingPacket.packetString.match(/\{inc(\d+)/) || incomingPacket.packetString.match(/\{msg(\d+)/) || incomingPacket.packetString.match(/\{([a-zA-Z0-9]+)/);
    const ackId = match ? match[1] : '1';
    
    const sender = incomingPacket.callsign;
    const ackReplyText = `ack${ackId}`;
    const paddedSender = sender.slice(0, 9).padEnd(9, ' ');
    const ackPacketStr = `${aprsSource}>${aprsDest},${aprsPath}::${paddedSender}:${ackReplyText}`;

    const ackPacket: AprsPacket = {
      id: `chat-ack-sent-${Date.now()}`,
      sourceEventId: 'chat-sent',
      eventType: 'manual',
      originalTitle: `ACK EMITIDO A ${sender}`,
      originalDetail: `Acuse de recibo para id: ${ackId}`,
      timestamp: new Date().toLocaleTimeString(),
      latitude: 40.416775,
      longitude: -3.703790,
      callsign: aprsSource,
      destination: sender,
      path: aprsPath,
      aprsType: 'MESSAGE',
      symbol: '>',
      messageText: `ack${ackId}`,
      packetString: ackPacketStr,
      status: 'TRANSMITIDO',
      isEmergency: false,
      auditNotes: `Confirmación manual enviada para: ${ackReplyText}`
    };

    setAprsPackets(currentPackets => {
      const updated = currentPackets.map(pkt => {
        if (pkt.id === incomingPacket.id) {
          return {
            ...pkt,
            auditNotes: `ACK Confirmado ✔ (Acuse manual enviado)`
          };
        }
        return pkt;
      });
      const withAck = [ackPacket, ...updated];
      localStorage.setItem('sat_aprs_packets', JSON.stringify(withAck));
      return withAck;
    });

    if (showToast) showToast(`✉️ Acuse de recibo (ACK) enviado a ${sender}`);
    playPacketAfsktone();
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
        <div className="bg-slate-950 border border-slate-850 p-1 rounded-lg flex flex-wrap items-center gap-1.5 self-stretch md:self-auto justify-start md:justify-end">
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
            onClick={() => setInnerTab('mensajeria')}
            className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer relative ${
              innerTab === 'mensajeria'
                ? 'bg-orange-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare size={13} />
            Mensajería SMS APRS
            {aprsPackets.some(p => p.aprsType === 'MESSAGE' && p.auditNotes?.includes('Pendiente')) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-slate-950 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setInnerTab('yaesu')}
            className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer relative ${
              innerTab === 'yaesu'
                ? 'bg-orange-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio size={13} />
            Consola FTM-400DR
            <span className="absolute -top-1 -right-1 px-1 py-0.2 text-[7px] font-bold bg-orange-600 text-slate-950 rounded-full border border-slate-950 animate-pulse">
              YAESU
            </span>
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
          
          {setIsAprsPopupEnabled && (
            <button
              onClick={() => setIsAprsPopupEnabled(!isAprsPopupEnabled)}
              title={isAprsPopupEnabled ? "Desactivar Ventana Emergente de Tráfico APRS" : "Activar Ventana Emergente de Tráfico APRS"}
              className={`px-3 py-1.5 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                isAprsPopupEnabled
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/60'
                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400 hover:bg-slate-850'
              }`}
            >
              {isAprsPopupEnabled ? <Bell size={13} className="animate-bounce" /> : <BellOff size={13} />}
              <span className="hidden sm:inline">Pop-up: {isAprsPopupEnabled ? 'ACTIVO' : 'INACTIVO'}</span>
            </button>
          )}
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

        {innerTab === 'yaesu' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 flex-1 font-sans">
            
            {/* COLUMNA IZQUIERDA: EL SIMULADOR DEL FRONT PANEL DE LA YAESU FTM-400DR (7 columnas en XL) */}
            <div className="xl:col-span-7 flex flex-col gap-4">
              
              {/* EL CUERPO FISICO DEL FRONT PANEL DE LA FTM-400DR */}
              <div className="bg-neutral-900 border-4 border-neutral-800 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col" id="yaesu-radio-bezel">
                
                {/* Cabecera del chasis físico (botones físicos simulados, LED de TX/RX) */}
                <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 px-4 py-2 border-b border-neutral-950 flex justify-between items-center text-[10px] text-neutral-400 font-mono">
                  <div className="flex items-center gap-3">
                    <span className="font-sans font-black text-slate-100 tracking-wider">YAESU</span>
                    <span className="text-orange-500 font-bold">FTM-400DR / DE</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* LED de TX / RX */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold">TX/RX</span>
                      <div className={`w-3.5 h-3.5 rounded-full border border-neutral-950 transition-all ${
                        yaesuTxActive 
                          ? 'bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse' 
                          : yaesuIsSmartBeaconActive && yaesuSpeed > 5
                            ? 'bg-green-600 shadow-[0_0_8px_#16a34a] animate-pulse'
                            : 'bg-neutral-950'
                      }`} />
                    </div>
                    
                    {/* GPS Lock status */}
                    <div className="flex items-center gap-1 text-[9px]">
                      <span className="text-emerald-400 font-bold">GPS LOCK</span>
                      <Globe size={11} className="text-emerald-400 animate-spin" style={{ animationDuration: '8s' }} />
                    </div>
                  </div>
                </div>

                {/* PANTALLA TÁCTIL LCD DIGITAL (Fondo azul marino/grisáceo brillante retro-digital de alta fidelidad) */}
                <div className="bg-slate-950 p-3 flex flex-col gap-2.5 aspect-[4/3] sm:aspect-[16/10] justify-between relative" style={{ minHeight: '380px' }} id="yaesu-lcd-screen">
                  
                  {/* Fila superior de información (Top Status bar) */}
                  <div className="flex justify-between items-center text-[10px] font-mono text-cyan-400 border-b border-slate-900 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="bg-cyan-950 px-1 py-0.2 rounded text-[9px] font-bold text-cyan-400 border border-cyan-900/40">APRS</span>
                      <span className="text-slate-400">1200 bps</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <span>[🛰️ GPS: 3D]</span>
                      </div>
                      <span className="text-slate-400">S-D MODE</span>
                      <span className="text-amber-500 font-bold">{new Date().toLocaleTimeString().substring(0, 5)}</span>
                    </div>
                  </div>

                  {/* Fila de frecuencias A-Band y B-Band (Estilo Yaesu) */}
                  <div className="grid grid-cols-2 gap-2 border-b border-slate-900 pb-2">
                    <div className="bg-slate-900/50 p-1.5 rounded border border-slate-900/80 flex flex-col justify-between">
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                        <span>BAND A (APRS VHF)</span>
                        <span className="text-orange-400 font-bold">TX/RX</span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-xl font-mono font-black tracking-tight text-slate-100">144.800</span>
                        <span className="text-xs font-mono text-slate-400">MHz</span>
                      </div>
                      {/* S-Meter */}
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[8px] text-slate-500 font-mono">S:</span>
                        <div className="flex-1 h-1.5 bg-slate-950 rounded overflow-hidden flex gap-0.5">
                          <div className="w-1/6 h-full bg-emerald-500" />
                          <div className="w-1/6 h-full bg-emerald-500" />
                          <div className="w-1/6 h-full bg-emerald-500" />
                          <div className="w-1/6 h-full bg-emerald-500" />
                          <div className="w-1/6 h-full bg-yellow-500" />
                          <div className="w-1/6 h-full bg-rose-500" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900/30 p-1.5 rounded border border-slate-900/40 flex flex-col justify-between">
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                        <span>BAND B (VOICE EMCOM)</span>
                        <span>RX ONLY</span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-lg font-mono font-bold text-slate-400">430.825</span>
                        <span className="text-[10px] font-mono text-slate-500">MHz</span>
                      </div>
                      {/* S-Meter */}
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[8px] text-slate-500 font-mono">S:</span>
                        <div className="flex-1 h-1.5 bg-slate-950 rounded overflow-hidden flex gap-0.5">
                          <div className="w-1/6 h-full bg-emerald-600/40" />
                          <div className="w-1/6 h-full bg-emerald-600/40" />
                          <div className="w-1/6 h-full bg-neutral-800" />
                          <div className="w-1/6 h-full bg-neutral-800" />
                          <div className="w-1/6 h-full bg-neutral-800" />
                          <div className="w-1/6 h-full bg-neutral-800" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECTOR DINÁMICO CENTRAL DE LA PANTALLA TÁCTIL (Aquí renderizamos la sub-tab LCD de la radio) */}
                  <div className="flex-1 bg-slate-950 border border-slate-900 rounded p-2 flex flex-col overflow-hidden min-h-[180px]">
                    
                    {/* Sub-tabs táctiles de la radio (Lista, Msg, SmartBeacon, Comentarios) */}
                    <div className="grid grid-cols-4 gap-1 border-b border-slate-900 pb-1.5 mb-2 shrink-0">
                      <button
                        onClick={() => { setYaesuSubTab('station_list'); setYaesuActiveStationId(null); }}
                        className={`py-1 rounded text-[10px] font-mono font-bold transition-all text-center ${
                          yaesuSubTab === 'station_list'
                            ? 'bg-cyan-500 text-slate-950 shadow-md'
                            : 'bg-slate-900 text-cyan-400 hover:bg-slate-850'
                        }`}
                      >
                        [ LISTA ]
                      </button>
                      <button
                        onClick={() => setYaesuSubTab('smart_beacon')}
                        className={`py-1 rounded text-[10px] font-mono font-bold transition-all text-center ${
                          yaesuSubTab === 'smart_beacon'
                            ? 'bg-cyan-500 text-slate-950 shadow-md'
                            : 'bg-slate-900 text-cyan-400 hover:bg-slate-850'
                        }`}
                      >
                        [ BALIZA SB ]
                      </button>
                      <button
                        onClick={() => setYaesuSubTab('aprs_msg')}
                        className={`py-1 rounded text-[10px] font-mono font-bold transition-all text-center ${
                          yaesuSubTab === 'aprs_msg'
                            ? 'bg-cyan-500 text-slate-950 shadow-md'
                            : 'bg-slate-900 text-cyan-400 hover:bg-slate-850'
                        }`}
                      >
                        [ MENSAJES ]
                      </button>
                      <button
                        onClick={() => setYaesuSubTab('status_config')}
                        className={`py-1 rounded text-[10px] font-mono font-bold transition-all text-center ${
                          yaesuSubTab === 'status_config'
                            ? 'bg-cyan-500 text-slate-950 shadow-md'
                            : 'bg-slate-900 text-cyan-400 hover:bg-slate-850'
                        }`}
                      >
                        [ COMENTARIO ]
                      </button>
                    </div>

                    {/* CONTENIDO INTERNO DE LA PANTALLA TÁCTIL */}
                    <div className="flex-1 overflow-y-auto flex flex-col text-xs">
                      
                      {/* SUB TAB 1: STATION LIST (LISTA DE ESTACIONES RECIBIDAS) */}
                      {yaesuSubTab === 'station_list' && !yaesuActiveStationId && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded">
                            <span>ESTACIONES APRS LOCALES RECIBIDAS (VHF)</span>
                            <span>DISTANCIA / RUMBO</span>
                          </div>
                          
                          <div className="space-y-1 overflow-y-auto max-h-[140px] pr-1">
                            {yaesuStationList.map((stn) => {
                              const metrics = getStationMetrics(stn.lat, stn.lon);
                              return (
                                <div
                                  key={stn.id}
                                  onClick={() => setYaesuActiveStationId(stn.id)}
                                  className="bg-slate-900/40 hover:bg-slate-900 border border-slate-900 hover:border-cyan-500/30 px-2 py-1.5 rounded flex justify-between items-center cursor-pointer transition-all"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-cyan-400 text-xs w-18">{stn.callsign}</span>
                                    <span className="bg-slate-950 text-slate-500 border border-slate-850 px-1 rounded font-mono text-[9px]">
                                      {stn.symbol}
                                    </span>
                                    <span className="text-[10px] text-slate-400 truncate max-w-[130px] sm:max-w-[180px]">{stn.comment}</span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300 font-bold shrink-0">
                                    <span>{metrics.distance.toFixed(1)} km</span>
                                    <span className="bg-cyan-950/40 text-cyan-400 border border-cyan-900/30 px-1 py-0.2 rounded font-bold">
                                      {metrics.bearingName} {Math.round(metrics.bearing)}°
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* DETALLE DE UNA ESTACIÓN SELECCIONADA EN LA PANTALLA YAESU */}
                      {yaesuSubTab === 'station_list' && yaesuActiveStationId && (() => {
                        const selectedStn = yaesuStationList.find(s => s.id === yaesuActiveStationId);
                        if (!selectedStn) return null;
                        const metrics = getStationMetrics(selectedStn.lat, selectedStn.lon);
                        
                        return (
                          <div className="flex flex-col gap-2 flex-1">
                            <button
                              onClick={() => setYaesuActiveStationId(null)}
                              className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 self-start cursor-pointer"
                            >
                              &larr; Volver a Lista de Estaciones
                            </button>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 flex-1 bg-slate-900/40 border border-slate-900 p-2.5 rounded-lg">
                              
                              {/* Lado izquierdo: Datos detallados de telemetría */}
                              <div className="sm:col-span-7 space-y-1.5 text-xs text-slate-300 font-mono">
                                <div className="flex justify-between border-b border-slate-900 pb-1">
                                  <span className="text-cyan-400 font-bold text-sm">{selectedStn.callsign}</span>
                                  <span className="text-[10px] text-slate-500">Último contacto: {selectedStn.timestamp}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                                  <div><strong className="text-slate-500">Lat:</strong> {selectedStn.lat.toFixed(5)}</div>
                                  <div><strong className="text-slate-500">Lon:</strong> {selectedStn.lon.toFixed(5)}</div>
                                  <div><strong className="text-slate-500">Rumbo:</strong> {metrics.bearingName} ({Math.round(metrics.bearing)}°)</div>
                                  <div><strong className="text-slate-500">Dist:</strong> {metrics.distance.toFixed(2)} Km</div>
                                  <div><strong className="text-slate-500">Tipo:</strong> <span className="uppercase text-orange-400 font-bold">{selectedStn.type}</span></div>
                                  <div><strong className="text-slate-500">Símbolo:</strong> {selectedStn.symbol}</div>
                                </div>
                                <div className="border-t border-slate-900 pt-1 text-[10px] mt-1">
                                  <strong className="text-cyan-500">Boletín / Comentario de Estado:</strong>
                                  <div className="text-slate-200 mt-0.5 italic">&quot;{selectedStn.comment}&quot;</div>
                                </div>
                              </div>
                              
                              {/* Lado derecho: Widget visual de brújula analógica Yaesu Compass */}
                              <div className="sm:col-span-5 flex flex-col items-center justify-center border-l border-slate-900 pl-2">
                                <div className="relative w-24 h-24 rounded-full border-2 border-slate-800 bg-slate-950 flex items-center justify-center">
                                  {/* Cardínales */}
                                  <span className="absolute top-0.5 text-[8px] text-slate-500 font-bold">N</span>
                                  <span className="absolute bottom-0.5 text-[8px] text-slate-500 font-bold">S</span>
                                  <span className="absolute left-1 text-[8px] text-slate-500 font-bold">O</span>
                                  <span className="absolute right-1 text-[8px] text-slate-500 font-bold">E</span>
                                  
                                  {/* Centro */}
                                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full z-10" />
                                  
                                  {/* Aguja giratoria */}
                                  <div
                                    className="absolute inset-0 flex items-center justify-center transition-transform"
                                    style={{ transform: `rotate(${metrics.bearing}deg)` }}
                                  >
                                    {/* SVG de aguja militar */}
                                    <svg className="w-full h-full p-1" viewBox="0 0 100 100">
                                      {/* Aguja norte roja */}
                                      <polygon points="50,5 55,50 45,50" fill="#ef4444" />
                                      {/* Aguja sur azul */}
                                      <polygon points="50,95 55,50 45,50" fill="#3b82f6" />
                                    </svg>
                                  </div>
                                </div>
                                <span className="text-[9px] text-slate-500 font-mono mt-1 text-center font-bold uppercase tracking-wide">
                                  Rumbo Relativo ({Math.round(metrics.bearing)}° {metrics.bearingName})
                                </span>
                              </div>
                              
                            </div>
                          </div>
                        );
                      })()}

                      {/* SUB TAB 2: SMARTBEACONING SIMULATOR */}
                      {yaesuSubTab === 'smart_beacon' && (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 flex-1">
                          
                          {/* Control de velocidad y giro para probar SmartBeaconing */}
                          <div className="sm:col-span-6 flex flex-col gap-2 bg-slate-900/30 p-2 rounded border border-slate-900">
                            <span className="text-[10px] font-bold text-cyan-400 font-mono uppercase tracking-wide">SIMULAR VEHÍCULO MÓVIL EN RUTA</span>
                            
                            {/* Control de Velocidad */}
                            <div>
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                                <span>Velocidad Actual:</span>
                                <span className="text-orange-400 font-bold">{yaesuSpeed} Km/h</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="120"
                                value={yaesuSpeed}
                                onChange={(e) => {
                                  const speed = parseInt(e.target.value, 10);
                                  setYaesuSpeed(speed);
                                  // Recalculate beacon interval based on speed change
                                  setYaesuBeaconIntervalSec(calculateSmartBeaconInterval(speed));
                                }}
                                className="w-full accent-cyan-500 mt-1 cursor-pointer h-1.5 rounded-lg bg-slate-800"
                              />
                            </div>

                            {/* Control de Giro (Corner-Pegging) */}
                            <div>
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                                <span>Giro Volante (Curva):</span>
                                <span className="text-orange-400 font-bold">{yaesuSteeringAngle}°</span>
                              </div>
                              <input
                                type="range"
                                min="-60"
                                max="60"
                                value={yaesuSteeringAngle}
                                onChange={(e) => setYaesuSteeringAngle(parseInt(e.target.value, 10))}
                                className="w-full accent-cyan-500 mt-1 cursor-pointer h-1.5 rounded-lg bg-slate-800"
                              />
                              <span className="text-[8px] text-slate-500 font-mono block mt-1">
                                Un giro absoluto &gt; 28° (Turn Angle) dispara una baliza inmediata de giro (Corner-Pegging).
                              </span>
                            </div>

                            {/* Status de SmartBeaconing */}
                            <div className="bg-slate-950 p-1.5 border border-slate-900 rounded space-y-1 text-[9px] font-mono">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Próxima baliza en:</span>
                                <span className="text-cyan-400 font-bold animate-pulse">{yaesuBeaconIntervalSec} seg</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Intervalo base dinámico:</span>
                                <span className="text-slate-300 font-bold">{calculateSmartBeaconInterval(yaesuSpeed)}s</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Algoritmo SmartBeaconing:</span>
                                <span className={`px-1 py-0.2 rounded font-bold ${yaesuIsSmartBeaconActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-slate-900 text-slate-500'}`}>
                                  {yaesuIsSmartBeaconActive ? 'ACTIVO' : 'INACTIVO'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Log de ejecuciones de SmartBeaconing */}
                          <div className="sm:col-span-6 flex flex-col gap-1.5 bg-slate-950 p-2 rounded border border-slate-900 overflow-hidden">
                            <span className="text-[9px] font-mono font-bold text-slate-400 border-b border-slate-900 pb-1 uppercase">Terminal de Telemetría (SmartBeacon)</span>
                            <div className="flex-1 overflow-y-auto font-mono text-[8.5px] text-slate-400 space-y-1 max-h-[120px] pr-1 scrollbar-thin">
                              {yaesuSmartBeaconLog.length === 0 ? (
                                <div className="text-slate-600 italic">Esperando eventos de movimiento de baliza...</div>
                              ) : (
                                yaesuSmartBeaconLog.map((log, lIdx) => (
                                  <div key={lIdx} className="leading-snug">
                                    {log.includes('Giro') || log.includes('Pegging') ? (
                                      <span className="text-yellow-400 font-bold">{log}</span>
                                    ) : log.includes('🚀') ? (
                                      <span className="text-emerald-400 font-bold">{log}</span>
                                    ) : (
                                      <span>{log}</span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          
                        </div>
                      )}

                      {/* SUB TAB 3: YAESU APRS MESSAGE THREAD EMULATOR */}
                      {yaesuSubTab === 'aprs_msg' && (
                        <div className="flex flex-col gap-2 flex-1">
                          
                          {/* Visor de hilos de mensajes */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 flex-1">
                            
                            {/* Lista de hilos de indicativos */}
                            <div className="sm:col-span-4 bg-slate-900/30 p-1.5 rounded border border-slate-900 max-h-[140px] overflow-y-auto space-y-1">
                              <span className="text-[8.5px] font-bold text-slate-500 font-mono block border-b border-slate-950 pb-1 uppercase">HILOS SMS</span>
                              {['EA4CECOP', 'ED4YAK-2', 'EA1MNT', 'REMER-M4'].map((call, idx) => (
                                <div
                                  key={call}
                                  onClick={() => setYaesuSelectedMsgIndex(idx)}
                                  className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-all flex justify-between items-center ${
                                    yaesuSelectedMsgIndex === idx
                                      ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800'
                                      : 'hover:bg-slate-900 text-slate-400'
                                  }`}
                                >
                                  <span>{call}</span>
                                  <span className="bg-slate-950 text-[8px] text-slate-500 px-1 rounded font-bold">
                                    {idx === 0 ? '4' : '1'} msg
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Contenido del chat del hilo */}
                            <div className="sm:col-span-8 bg-slate-950 p-2 rounded border border-slate-900 flex flex-col justify-between max-h-[140px] overflow-hidden">
                              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-[10px] font-mono">
                                {yaesuSelectedMsgIndex === null ? (
                                  <div className="flex flex-col items-center justify-center h-full text-slate-600 italic text-[9px]">
                                    Seleccione un hilo para abrir el chat de la FTM-400DR
                                  </div>
                                ) : yaesuSelectedMsgIndex === 0 ? (
                                  <div className="space-y-1.5">
                                    <div className="bg-slate-900 text-slate-300 p-1 rounded max-w-[85%] self-start leading-snug">
                                      <span className="text-[8px] text-slate-500 block">EA4CECOP • 10:45 AM</span>
                                      ¿Están operativos en la banda VHF APRS Pilar II?
                                    </div>
                                    <div className="bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 p-1 rounded max-w-[85%] ml-auto leading-snug text-right">
                                      <span className="text-[8px] text-cyan-600 block">TÚ • 10:46 AM</span>
                                      Afirmativo. Recibido por baliza SmartBeacon.
                                    </div>
                                    <div className="bg-slate-900 text-slate-300 p-1 rounded max-w-[85%] self-start leading-snug">
                                      <span className="text-[8px] text-slate-500 block">EA4CECOP • 10:47 AM</span>
                                      Excelente. Enviamos telemetría de prueba con acuse.
                                    </div>
                                    <div className="bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 p-1 rounded max-w-[85%] ml-auto leading-snug text-right">
                                      <span className="text-[8px] text-cyan-600 block">TÚ • 10:48 AM</span>
                                      QSL. ACK Registrado con éxito. 73.
                                    </div>
                                  </div>
                                ) : yaesuSelectedMsgIndex === 1 ? (
                                  <div className="space-y-1.5">
                                    <div className="bg-slate-900 text-slate-300 p-1 rounded max-w-[85%] self-start leading-snug">
                                      <span className="text-[8px] text-slate-500 block">ED4YAK-2 • 11:12 AM</span>
                                      Recibido fuerte y claro por aquí en Madrid, 73!
                                    </div>
                                    <div className="bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 p-1 rounded max-w-[85%] ml-auto leading-snug text-right">
                                      <span className="text-[8px] text-cyan-600 block">TÚ • 11:15 AM</span>
                                      Saludos al Radioclub UPM! QSL 73.
                                    </div>
                                  </div>
                                ) : yaesuSelectedMsgIndex === 2 ? (
                                  <div className="space-y-1.5">
                                    <div className="bg-slate-900 text-slate-300 p-1 rounded max-w-[85%] self-start leading-snug">
                                      <span className="text-[8px] text-slate-500 block">EA1MNT • 11:30 AM</span>
                                      Temperatura en refugio Peñalara: -2C, viento 15Kts.
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="bg-slate-900 text-slate-300 p-1 rounded max-w-[85%] self-start leading-snug">
                                      <span className="text-[8px] text-slate-500 block">REMER-M4 • 09:15 AM</span>
                                      Boletín Sismo adaptado y enrutado con éxito.
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Teclado rápido Yaesu para contestar con un toque */}
                              {yaesuSelectedMsgIndex !== null && (
                                <div className="border-t border-slate-900 pt-1.5 mt-1">
                                  <div className="flex gap-1 justify-end shrink-0">
                                    <button
                                      onClick={() => {
                                        playPacketAfsktone();
                                        setYaesuSmartBeaconLog(l => [`[${new Date().toLocaleTimeString()}] SMS: QSL 73`, ...l]);
                                        if (showToast) showToast('SMS APRS Enviado de forma rápida.');
                                      }}
                                      className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 px-2 py-0.5 rounded text-[8.5px] font-mono cursor-pointer"
                                    >
                                      [ QSL 73 ]
                                    </button>
                                    <button
                                      onClick={() => {
                                        playPacketAfsktone();
                                        setYaesuSmartBeaconLog(l => [`[${new Date().toLocaleTimeString()}] SMS: OPERATIVO QRV`, ...l]);
                                        if (showToast) showToast('SMS APRS Enviado de forma rápida.');
                                      }}
                                      className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 px-2 py-0.5 rounded text-[8.5px] font-mono cursor-pointer"
                                    >
                                      [ QRV OK ]
                                    </button>
                                    <button
                                      onClick={() => {
                                        playPacketAfsktone();
                                        setYaesuSmartBeaconLog(l => [`[${new Date().toLocaleTimeString()}] SMS: SOS EMERGENCE`, ...l]);
                                        if (showToast) showToast('SMS DE EMERGENCIA APRS EMITIDO!');
                                      }}
                                      className="bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded text-[8.5px] font-mono cursor-pointer animate-pulse"
                                    >
                                      [ SOS EMER ]
                                    </button>
                                  </div>
                                </div>
                              )}

                            </div>
                          </div>
                          
                        </div>
                      )}

                      {/* SUB TAB 4: YAESU STATUS TEXT SLOTS CONFIGURATION */}
                      {yaesuSubTab === 'status_config' && (
                        <div className="flex flex-col gap-2 flex-1">
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                            <span>CONFIGURACIÓN DE RANURAS DE MENSAJE DE ESTADO (STATUS TEXT SLOTS)</span>
                            <span className="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded">FTM-400DR MEMORY</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 flex-1">
                            
                            {/* Lista de ranuras (Slots 1 a 5) */}
                            <div className="md:col-span-6 space-y-1 max-h-[140px] overflow-y-auto">
                              {yaesuStatusComments.map((txt, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    setYaesuStatusSlot(idx);
                                    setYaesuInputStatusText(txt);
                                  }}
                                  className={`p-1.5 rounded border text-[10px] font-mono cursor-pointer transition-all flex justify-between items-center ${
                                    yaesuStatusSlot === idx
                                      ? 'bg-orange-950/40 border-orange-500/50 text-orange-400'
                                      : 'bg-slate-900/40 border-slate-900 text-slate-400 hover:bg-slate-900'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] bg-slate-950 px-1 py-0.2 rounded font-bold">SLOT {idx + 1}</span>
                                    <span className="truncate max-w-[150px]">{txt}</span>
                                  </div>
                                  
                                  {yaesuStatusSlot === idx && (
                                    <span className="text-[8.5px] bg-orange-950 text-orange-400 border border-orange-800 px-1 rounded font-bold uppercase shrink-0">
                                      ACTIVO
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Editor de la ranura seleccionada */}
                            <div className="md:col-span-6 bg-slate-950 p-2.5 rounded border border-slate-900 flex flex-col justify-between max-h-[140px]">
                              <div className="space-y-1.5 font-mono text-[10px]">
                                <span className="text-slate-500">Editar Slot Seleccionado ({yaesuStatusSlot + 1}):</span>
                                <input
                                  type="text"
                                  maxLength={36}
                                  placeholder="Ingrese comentario de estado (Max 36)"
                                  value={yaesuInputStatusText}
                                  onChange={(e) => {
                                    setYaesuInputStatusText(e.target.value);
                                    const copy = [...yaesuStatusComments];
                                    copy[yaesuStatusSlot] = e.target.value;
                                    setYaesuStatusComments(copy);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-850 p-1.5 text-cyan-400 font-mono text-xs rounded outline-none focus:border-cyan-500"
                                />
                              </div>
                              
                              <div className="text-[8.5px] text-slate-500 font-mono leading-relaxed mt-2">
                                💡 Este comentario se empaqueta al final de sus balizas de telemetría automática de Pilar II de manera transparente para que otros operadores locales puedan leer su estado operativo al recibir sus paquetes.
                              </div>
                            </div>
                            
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                  
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA: DOCUMENTACIÓN DIDÁCTICA Y CONFIGURADOR DE SMARTBEACONING DE YAESU (5 columnas en XL) */}
            <div className="xl:col-span-5 flex flex-col gap-4">
              
              {/* EXPLICACIÓN DEL MANUAL YAESU APRS */}
              <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-4 flex flex-col gap-3 font-mono text-xs">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                  <FileText size={15} className="text-orange-400" />
                  <h3 className="text-sm font-sans font-bold text-slate-100 uppercase">ANÁLISIS DE BRECHA Y ESPECIFICACIÓN YAESU</h3>
                </div>
                
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Siguiendo el manual técnico oficial de la <strong className="text-slate-200 font-bold">Yaesu FTM-400DR</strong> (Secciones APRS), hemos adaptado el comportamiento de enrutamiento móvil y posicionamiento al proyecto Pilar II:
                </p>

                <div className="space-y-2.5 text-[10px] text-slate-300 mt-1">
                  <div className="p-2 rounded bg-slate-950 border border-slate-900">
                    <span className="text-cyan-400 font-black">1. SmartBeaconing (Algoritmo Tony Arnerich)</span>
                    <p className="text-slate-400 text-[9.5px] mt-1 leading-normal">
                      Ajusta automáticamente el envío de balizas. Al estar estacionario o a baja velocidad (&lt; 5 Km/h), espacia las balizas hasta 30 min (1800s) para evitar colapsar la frecuencia. A alta velocidad (&gt; 70 Km/h), acorta el intervalo a 2 min (120s) para una traza precisa en mapa.
                    </p>
                  </div>

                  <div className="p-2 rounded bg-slate-950 border border-slate-900">
                    <span className="text-cyan-400 font-black">2. Corner-Pegging (Giro brusco por curvas)</span>
                    <p className="text-slate-400 text-[9.5px] mt-1 leading-normal">
                      Independientemente del temporizador, si la estación realiza un giro de trayectoria mayor a <strong className="text-yellow-400 font-bold">28 grados</strong> en carretera, la radio emite una baliza instantánea para que el trazo en el mapa de CECOP no dibuje rectas irreales, sino que copie fielmente la carretera.
                    </p>
                  </div>

                  <div className="p-2 rounded bg-slate-950 border border-slate-900">
                    <span className="text-cyan-400 font-black">3. S-D (Status/Data) Mode y S-Meter</span>
                    <p className="text-slate-400 text-[9.5px] mt-1 leading-normal">
                      La Yaesu FTM-400DR implementa una pantalla táctil dual donde se ve la intensidad de recepción RSSI de la red local (S-Meter analógico) y se leen los boletines meteorológicos (WX) y de alertas de emergencia de otros operadores con su rumbo y distancia real.
                    </p>
                  </div>
                </div>
              </div>

              {/* AJUSTES ADICIONALES DE PARÁMETROS SMARTBEACONING DE YAESU */}
              <div className="bg-slate-900/20 border border-slate-850 p-4 rounded-xl flex flex-col gap-3">
                <span className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={13} className="text-orange-400" />
                  Ajustes Avanzados Yaesu APRS
                </span>
                
                <div className="space-y-3 font-mono text-[10px] text-slate-400">
                  <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-900">
                    <span>Simulación de SmartBeaconing</span>
                    <button
                      onClick={() => {
                        setYaesuIsSmartBeaconActive(!yaesuIsSmartBeaconActive);
                        setYaesuSmartBeaconLog(l => [`[SISTEMA] SmartBeaconing ${!yaesuIsSmartBeaconActive ? 'ACTIVADO' : 'DESACTIVADO'}`, ...l]);
                      }}
                      className={`px-3 py-1 rounded text-slate-950 font-sans font-black text-[10px] cursor-pointer ${
                        yaesuIsSmartBeaconActive 
                          ? 'bg-emerald-500 hover:bg-emerald-400' 
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {yaesuIsSmartBeaconActive ? 'ACTIVADO' : 'DESACTIVADO'}
                    </button>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded border border-slate-900 space-y-2">
                    <div className="text-slate-300 font-bold border-b border-slate-900 pb-1 flex justify-between">
                      <span>TABLA DE PARÁMETROS COMPATIBLE YAESU</span>
                      <span className="text-cyan-400 font-normal">EEPROM MEMORY</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[9px] leading-relaxed">
                      <div><strong className="text-slate-500">LOW SPEED:</strong> 5 km/h</div>
                      <div><strong className="text-slate-500">HIGH SPEED:</strong> 70 km/h</div>
                      <div><strong className="text-slate-500">SLOW RATE:</strong> 1800 seg</div>
                      <div><strong className="text-slate-500">FAST RATE:</strong> 120 seg</div>
                      <div><strong className="text-slate-500">TURN ANGLE:</strong> 28 deg</div>
                      <div><strong className="text-slate-500">TURN TIME:</strong> 15 seg</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setYaesuTxActive(true);
                      playPacketAfsktone();
                      
                      const activeComment = yaesuStatusComments[yaesuStatusSlot] || 'PILAR II EMCOM';
                      const lat = 40.416775;
                      const lon = -3.703790;
                      const { latStr, lonStr } = convertToAprsCoords(lat, lon);
                      const payload = `!${latStr}/${lonStr}>MANUAL TX - ${activeComment}`;
                      
                      const newPkt: AprsPacket = {
                        id: `yaesu-manual-${Date.now()}`,
                        sourceEventId: 'yaesu-manual-trigger',
                        eventType: 'manual',
                        originalTitle: `BALIZA MANUAL (FTM-400DR)`,
                        originalDetail: `Transmisión manual forzada desde el panel de control táctil de la radio.`,
                        timestamp: new Date().toLocaleTimeString(),
                        latitude: lat,
                        longitude: lon,
                        callsign: aprsSource,
                        destination: 'APWY40',
                        path: 'WIDE1-1,WIDE2-1',
                        aprsType: 'BEACON',
                        symbol: '>',
                        messageText: payload,
                        packetString: `${aprsSource}>APWY40,WIDE1-1,WIDE2-1:${payload}`,
                        status: 'TRANSMITIDO',
                        isEmergency: false,
                        auditNotes: `Baliza manual forzada por el operador desde consola táctil Yaesu.`
                      };
                      
                      setAprsPackets(current => [newPkt, ...current]);
                      
                      setYaesuSmartBeaconLog(l => [
                        `[${new Date().toLocaleTimeString()}] 🔘 Baliza manual forzada. Transmitiendo por TNC...`,
                        ...l
                      ].slice(0, 30));
                      
                      setYaesuBeaconIntervalSec(calculateSmartBeaconInterval(yaesuSpeed));
                      setTimeout(() => setYaesuTxActive(false), 800);
                    }}
                    className="w-full bg-orange-600 hover:bg-orange-500 text-slate-950 font-sans font-black text-xs py-2 rounded flex items-center justify-center gap-1.5 shadow-lg shadow-orange-950/20 cursor-pointer"
                  >
                    <Send size={13} />
                    FORZAR TRANSMISIÓN DE BALIZA YAESU (TX NOW)
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {innerTab === 'doc' && (
          <div className="border border-slate-850 rounded-xl bg-slate-950/30 p-6 space-y-5 max-w-4xl mx-auto flex flex-col justify-start min-h-[460px] font-sans">
            <div className="flex items-center justify-between border-b border-slate-850/60 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="text-orange-400" size={18} />
                <h3 className="text-sm font-bold text-slate-100 uppercase">ESPECIFICACIÓN DE RED APRS Y ENCAPSULACION EN AX.25</h3>
              </div>
              <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono font-bold">APRS v1.2 / v1.0.1 COMPLIANT</span>
            </div>

            <div className="font-mono text-xs text-slate-400 space-y-4.5 leading-relaxed">
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

              {/* MIC-E DATA FORMAT PROTOCOL REFERENCE CARD */}
              <div className="bg-slate-900/40 border border-slate-850 rounded-lg p-4 space-y-3 font-sans">
                <div className="flex items-center gap-2 text-orange-400 border-b border-slate-850 pb-2">
                  <Cpu size={14} />
                  <span className="text-xs font-bold uppercase tracking-wide">Protocolo de Compresión Mic-E (Mic-Encoder)</span>
                </div>
                
                <div className="text-xs text-slate-300 space-y-2">
                  <p className="font-sans leading-relaxed text-slate-400">
                    Diseñado originalmente por TAPR para enviar ráfagas de datos ultra-cortas (aprox. 1/3 de segundo) al soltar el botón PTT. Mic-E empaqueta la telemetría en campos estructurales no estándar para ahorrar ancho de banda, permitiendo que un paquete completo ocupe <strong className="text-orange-400 font-semibold">tan solo 25 bytes</strong>.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-mono text-[11px]">
                    <div className="bg-slate-950 p-3 rounded border border-slate-900 space-y-1.5">
                      <span className="text-orange-400 font-sans font-bold block uppercase text-[10px]">1. Dirección de Destino (7 Bytes)</span>
                      <ul className="space-y-1 text-slate-400 list-disc list-inside">
                        <li>Codifica los dígitos de la <strong className="text-slate-200">Latitud</strong>.</li>
                        <li>Contiene el identificador de <strong className="text-slate-200">Mensaje de 3-bits</strong>.</li>
                        <li>Codifica flags de dirección (E/W, N/S) y path digi.</li>
                      </ul>
                    </div>
                    
                    <div className="bg-slate-950 p-3 rounded border border-slate-900 space-y-1.5">
                      <span className="text-orange-400 font-sans font-bold block uppercase text-[10px]">2. Campo de Información (9+ Bytes)</span>
                      <ul className="space-y-1 text-slate-400 list-disc list-inside">
                        <li>Codifica la <strong className="text-slate-200">Longitud</strong> comprimida.</li>
                        <li>Lleva <strong className="text-slate-200">Velocidad y Rumbo</strong> en 3 bytes.</li>
                        <li>Símbolo APRS e información opcional de <strong className="text-slate-200">telemetría, altitud y localizador Maidenhead</strong>.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] font-mono text-slate-400 block mb-1.5 uppercase font-bold tracking-wide">Mapeo Estándar de Mensajes Mic-E (APRS 1.2 Spec)</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[10px]">
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-emerald-400 font-bold">M0 (000)</span>
                      <span className="text-slate-400 text-[9px]">Off Duty / Fuera de Serv.</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-emerald-400 font-bold">M1 (001)</span>
                      <span className="text-slate-400 text-[9px]">In Service / En Servicio</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-emerald-400 font-bold">M2 (010)</span>
                      <span className="text-slate-400 text-[9px]">En Route / En Ruta</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-amber-400 font-bold">M3 (011)</span>
                      <span className="text-slate-400 text-[9px]">Returning / Regresando</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-amber-400 font-bold">M4 (100)</span>
                      <span className="text-slate-400 text-[9px]">Committed / Comprometido</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-sky-400 font-bold">M5 (101)</span>
                      <span className="text-slate-400 text-[9px]">Special / Tránsito Especial</span>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded border border-slate-850/40 flex flex-col">
                      <span className="text-orange-400 font-bold">M6 (110)</span>
                      <span className="text-slate-400 text-[9px]">Priority / Prioritario</span>
                    </div>
                    <div className="bg-red-950/40 p-2 rounded border border-red-900/30 flex flex-col col-span-2">
                      <span className="text-red-400 font-bold">EMERGENCY (111)</span>
                      <span className="text-slate-400 text-[9px]">Emergencia Crítica (SOS / QRR / MED)</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[9.5px] text-slate-500 font-sans leading-relaxed">
                    * Los códigos <strong className="text-slate-400">C0 a C6</strong> representan los mismos bits de ID pero marcados como mensajes personalizados de grupo (Custom Messages), permitiendo coordinar tareas locales específicas o eventos deportivos/de rescate sin gastar tiempo de transmisión por voz.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/20 p-4 border border-slate-850 rounded-lg space-y-2">
                <div className="text-slate-200 font-semibold border-b border-slate-900 pb-1 uppercase font-sans text-xs">Especificaciones del Formato APRS Utilizados</div>
                <ul className="list-disc pl-5 space-y-1.5 font-sans">
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

              <div className="flex justify-end gap-3 pt-2">
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

        {innerTab === 'mensajeria' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 font-sans">
            
            {/* LADO IZQUIERDO: CONFIGURACIÓN DE EMISIONES Y SIMULADOR */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              
              {/* PANEL DE CONTROL / MI IDENTIDAD */}
              <div className="bg-slate-900/45 border border-slate-850 p-4 rounded-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                  <Sliders className="text-orange-400" size={16} />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Control de Estación SMS</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1 uppercase">Mi Indicativo Local (TNC)</label>
                    <div className="bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-slate-400 flex items-center justify-between">
                      <span className="text-orange-400 font-bold">{aprsSource}</span>
                      <span className="text-[8px] bg-orange-950/50 text-orange-400 border border-orange-900/40 px-1.5 py-0.5 rounded uppercase font-black font-sans">Activo</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1 uppercase">Indicativo Destinatario</label>
                    <input
                      type="text"
                      value={chatSelectedCallsign}
                      onChange={(e) => setChatSelectedCallsign(e.target.value.toUpperCase())}
                      placeholder="P.EJ. EA4CECOP"
                      className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 font-mono text-xs text-orange-300 focus:border-orange-500 outline-none uppercase"
                    />
                  </div>

                  {/* QUICK SELECT CONTACTS */}
                  <div>
                    <label className="text-[9px] font-mono text-slate-500 block mb-1 uppercase">Contactos APRS Frecuentes</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { call: 'EA4CECOP', desc: 'CECOP Central' },
                        { call: 'ED4YAK-2', desc: 'Radioclub UPM' },
                        { call: 'EA4SAT-3', desc: 'Móvil GPS' },
                        { call: 'EA1MNT', desc: 'Refugio Montaña' }
                      ].map((c) => (
                        <button
                          key={c.call}
                          type="button"
                          onClick={() => {
                            setChatSelectedCallsign(c.call);
                            setChatViewMode('chat');
                          }}
                          className={`p-1.5 rounded border text-left font-mono transition-all cursor-pointer ${
                            chatSelectedCallsign === c.call
                              ? 'bg-orange-500/10 border-orange-500 text-orange-300 font-bold'
                              : 'bg-slate-950 border-slate-900 hover:border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="text-[10px] leading-tight">{c.call}</div>
                          <div className="text-[8px] text-slate-500 font-sans truncate">{c.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PROTOCOL OPTIONS */}
                  <div className="space-y-2 pt-2 border-t border-slate-850/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400 uppercase">Solicitar Confirmación (ACK)</span>
                      <input
                        type="checkbox"
                        checked={requireChatAck}
                        onChange={(e) => setRequireChatAck(e.target.checked)}
                        className="w-3.5 h-3.5 text-orange-500 bg-slate-950 border-slate-800 rounded focus:ring-orange-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400 uppercase">Auto-Ack Automático</span>
                      <input
                        type="checkbox"
                        checked={autoAckEnabled}
                        onChange={(e) => setAutoAckEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 text-orange-500 bg-slate-950 border-slate-800 rounded focus:ring-orange-500 cursor-pointer"
                      />
                    </div>
                    {setIsAprsPopupEnabled && (
                      <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-850/40">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-orange-400 uppercase font-bold">Pop-up Alertas Entrantes</span>
                          <input
                            type="checkbox"
                            checked={isAprsPopupEnabled}
                            onChange={(e) => setIsAprsPopupEnabled(e.target.checked)}
                            className="w-3.5 h-3.5 text-orange-500 bg-slate-950 border-slate-800 rounded focus:ring-orange-500 cursor-pointer"
                          />
                        </div>
                        {isAprsPopupEnabled && setAprsPopupFilter && (
                          <div className="space-y-1">
                            <span className="text-[8.5px] font-mono text-slate-500 uppercase block">Filtro de Pop-ups</span>
                            <select
                              value={aprsPopupFilter}
                              onChange={(e) => setAprsPopupFilter(e.target.value as any)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-slate-300 outline-none focus:border-orange-500 cursor-pointer"
                            >
                              <option value="ALL">📬 Todos los mensajes/boletines</option>
                              <option value="MICE_EMG">🚨 Solo Emergencias Críticas (Mic-E / QRR)</option>
                              <option value="MICE_PRIO">⚠️ Prioritarios y Especiales (Mic-E / SAR)</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SIMULADOR ENTRANTE (PRUEBAS) */}
              <div className="bg-slate-900/45 border border-slate-850 p-4 rounded-xl space-y-3.5">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                  <Sparkles className="text-orange-400" size={16} />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Inyector de Señales RF (Pruebas)</h3>
                </div>

                <div className="space-y-2.5">
                  <p className="text-[9.5px] font-sans text-slate-400 leading-normal">
                    Utiliza este simulador para generar tráfico APRS entrante y comprobar la lógica de acuses (ACK) bidireccionales en el visor.
                  </p>

                  <div>
                    <label className="text-[9px] font-mono text-slate-500 block mb-0.5 uppercase">Estación Emisora Simulada</label>
                    <select
                      value={simulatedSender}
                      onChange={(e) => setSimulatedSender(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded px-2 py-1 font-mono text-[11px] text-slate-350 focus:border-orange-500 outline-none"
                    >
                      <option value="ED4YAK-2">ED4YAK-2 (Radioclub UPM)</option>
                      <option value="EA1MNT">EA1MNT (Refugio Montaña)</option>
                      <option value="EA4SAT-3">EA4SAT-3 (Móvil GPS)</option>
                      <option value="EA4CECOP">EA4CECOP (CECOP Principal)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-slate-500 block mb-0.5 uppercase">Texto del Mensaje de Prueba</label>
                    <textarea
                      value={simulatedText}
                      onChange={(e) => setSimulatedText(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-850 rounded px-2 py-1 font-sans text-[11px] text-slate-300 focus:border-orange-500 outline-none resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Solicitar mi ACK (Acuse)</span>
                    <input
                      type="checkbox"
                      checked={simulatedAckReq}
                      onChange={(e) => setSimulatedAckReq(e.target.checked)}
                      className="w-3.5 h-3.5 text-orange-500 bg-slate-950 border-slate-800 rounded focus:ring-orange-500 cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSimulateIncomingMessage}
                    className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-750 text-orange-400 font-mono font-bold text-[10px] py-1.5 rounded transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Radio size={12} className="animate-pulse" />
                    INYECTAR MENSAJE EN 144.800 MHz
                  </button>
                </div>
              </div>

            </div>

            {/* LADO DERECHO: INTERFAZ DE MENSAJERÍA */}
            <div className="lg:col-span-8 flex flex-col bg-slate-950/80 border border-slate-850 rounded-xl overflow-hidden min-h-[480px]">
              
              {/* SUB NAV MODOS DE VISTA */}
              <div className="bg-slate-900/60 border-b border-slate-850 p-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {[
                    { mode: 'chat', label: 'Historial de Conversación', icon: MessageSquare },
                    { mode: 'inbox', label: 'Inbox (Recibidos)', icon: Inbox, count: aprsPackets.filter(p => p.aprsType === 'MESSAGE' && (p.sourceEventId === 'chat-received' || p.sourceEventId === 'received')).length },
                    { mode: 'outbox', label: 'Outbox (Enviados)', icon: Send, count: aprsPackets.filter(p => p.aprsType === 'MESSAGE' && p.sourceEventId === 'chat-sent').length }
                  ].map((btn) => {
                    const Icon = btn.icon;
                    const isActive = chatViewMode === btn.mode;
                    return (
                      <button
                        key={btn.mode}
                        type="button"
                        onClick={() => setChatViewMode(btn.mode as any)}
                        className={`px-2.5 py-1.5 rounded-lg font-sans text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                          isActive
                            ? 'bg-slate-800 text-orange-400 border border-slate-700'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        <Icon size={12} />
                        <span>{btn.label}</span>
                        {btn.count !== undefined && btn.count > 0 && (
                          <span className="bg-slate-950 text-slate-400 text-[9px] px-1.5 py-0.5 rounded font-black font-mono border border-slate-850 leading-none">
                            {btn.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="text-[10px] font-mono text-slate-500 pr-1 select-none">
                  Canal: <strong className="text-slate-350">VHF Ch1 (144.800 MHz)</strong>
                </div>
              </div>

              {/* RENDER CHAT VIEWS */}
              <div className="flex-1 p-4 flex flex-col justify-between overflow-hidden">
                
                {chatViewMode === 'chat' && (
                  <div className="flex-1 flex flex-col justify-between overflow-hidden gap-3">
                    
                    {/* CHAT BUBBLES BLOCK */}
                    <div className="flex-1 overflow-y-auto max-h-[340px] space-y-2.5 pr-1 pb-2">
                      <div className="text-center py-2">
                        <span className="bg-slate-900 text-slate-500 font-mono text-[8px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-850/60">
                          Sintonizado con {chatSelectedCallsign} • Encriptación Desactivada (RF Pública)
                        </span>
                      </div>

                      {(() => {
                        // Find all message packets belonging to the active conversation
                        const contact = chatSelectedCallsign.toUpperCase();
                        const activeConversationMessages = aprsPackets
                          .filter(pkt => pkt.aprsType === 'MESSAGE' && (
                            (pkt.callsign.toUpperCase() === contact && (pkt.sourceEventId === 'chat-received' || pkt.sourceEventId === 'received')) ||
                            (pkt.destination.toUpperCase() === contact && pkt.sourceEventId === 'chat-sent')
                          ))
                          .reverse();

                        if (activeConversationMessages.length === 0) {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-500">
                              <MessageSquare size={36} className="text-slate-800 mb-2" />
                              <p className="font-mono text-xs font-bold text-slate-400">Sin mensajes anteriores con {chatSelectedCallsign}</p>
                              <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-normal">
                                Escribe un mensaje de radio de banda corta a continuación o inyecta una simulación para probar la comunicación APRS bidireccional.
                              </p>
                            </div>
                          );
                        }

                        return activeConversationMessages.map((msg) => {
                          const isSent = msg.sourceEventId === 'chat-sent';
                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col ${isSent ? 'items-end' : 'items-start'} max-w-[85%] ${
                                isSent ? 'ml-auto' : 'mr-auto'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 mb-0.5 px-1">
                                <span className={isSent ? 'text-orange-450 font-bold' : 'text-slate-350 font-bold'}>
                                  {isSent ? 'TÚ (LOCAL)' : msg.callsign}
                                </span>
                                <span>•</span>
                                <span>{msg.timestamp}</span>
                              </div>

                              <div
                                className={`p-3 rounded-2xl text-xs font-mono break-all leading-normal relative ${
                                  isSent
                                    ? 'bg-orange-950/25 border border-orange-900/40 text-orange-200 rounded-tr-none'
                                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
                                }`}
                              >
                                {msg.messageText}
                              </div>

                              <div className="flex items-center gap-1.5 text-[8.5px] font-mono text-slate-500 mt-0.5 px-1">
                                {isSent ? (
                                  <>
                                    <span>Trama: <code className="text-[8px] bg-slate-900 px-1 py-0.5 rounded text-orange-500/80">{msg.packetString.split(':')[msg.packetString.split(':').length - 1]}</code></span>
                                    <span>•</span>
                                    {retryStates[msg.id] ? (
                                      <span className="inline-flex items-center gap-1">
                                        {retryStates[msg.id].status === 'WAITING_ACK' && (
                                          <span className="text-amber-500 flex items-center gap-1 font-bold">
                                            <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse inline-block" />
                                            Enviando (Intento {retryStates[msg.id].attempt}/5 • Reenvío en {retryStates[msg.id].nextRetrySec}s)
                                          </span>
                                        )}
                                        {retryStates[msg.id].status === 'ACKED' && (
                                          <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                            <CheckCircle2 size={10} className="text-emerald-450" />
                                            ACK Confirmado ✔
                                          </span>
                                        )}
                                        {retryStates[msg.id].status === 'FAILED' && (
                                          <span className="text-rose-500 font-bold">
                                            ⚠️ Error: Sin ACK (5 reintentos)
                                          </span>
                                        )}
                                        
                                        {retryStates[msg.id].status === 'WAITING_ACK' && (
                                          <button
                                            type="button"
                                            onClick={() => handleManualConfirmAck(msg.id)}
                                            className="ml-1 text-[7.5px] bg-emerald-950/80 text-emerald-400 hover:text-emerald-350 px-1 py-0.5 rounded border border-emerald-900/50 cursor-pointer select-none font-bold"
                                            title="Simular llegada de ACK de confirmación"
                                          >
                                            Simular ACK
                                          </button>
                                        )}
                                      </span>
                                    ) : (
                                      <span className={msg.auditNotes?.includes('✔') ? 'text-emerald-500 font-bold' : 'text-slate-550'}>
                                        {msg.auditNotes || 'Enviado'}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span>Ruta: <code className="text-[8px] bg-slate-900 px-1 py-0.5 rounded text-slate-450">{msg.path}</code></span>
                                    {msg.auditNotes?.includes('Pendiente') && (
                                      <>
                                        <span>•</span>
                                        <button
                                          type="button"
                                          onClick={() => handleManualSendAck(msg)}
                                          className="text-[8px] bg-orange-950 text-orange-400 hover:text-orange-350 px-1.5 py-0.5 rounded font-bold border border-orange-900/60 cursor-pointer"
                                        >
                                          Enviar ACK Manual
                                        </button>
                                      </>
                                    )}
                                    {msg.auditNotes?.includes('✔') && (
                                      <>
                                        <span>•</span>
                                        <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                          <CheckCircle2 size={9} />
                                          ACK Confirmado
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* MESSAGE WRITER COMPOSER */}
                    <div className="border-t border-slate-850/60 pt-3 flex flex-col gap-2">
                      {/* Botones rápidos de código Q y mensajes tácticos estándar de la especificación APRS */}
                      <div className="flex flex-wrap gap-1 items-center pb-1 border-b border-slate-900/60 select-none">
                        <span className="text-[8.5px] font-mono text-slate-500 uppercase tracking-wider mr-1">Códigos Rápidos:</span>
                        {[
                          { label: 'QSL', val: 'QSL recibido fuerte y claro.' },
                          { label: 'QRV', val: 'Estación QRV (Lista para tráfico).' },
                          { label: 'QSY', val: 'QSY a VHF 144.800 MHz.' },
                          { label: '73', val: 'Saludos cordiales, 73!' },
                          { label: 'SOS', val: '⚠️ SOS - EMISIÓN DE SOCORRO ACTIVA.' },
                          { label: 'OK', val: 'Todo operativo y sin daños.' },
                          { label: 'MED', val: '🚨 Se requiere apoyo médico avanzado.' },
                          { label: 'EVAC', val: 'Iniciando evacuación del sector.' }
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => setChatMessageText(btn.val)}
                            className="text-[8px] font-mono bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-350 hover:text-orange-400 px-1.5 py-0.5 rounded cursor-pointer transition-all"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSendChatMessage();
                        }}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={chatMessageText}
                          onChange={(e) => setChatMessageText(e.target.value)}
                          maxLength={67}
                          placeholder={`Escribe un mensaje SMS APRS para ${chatSelectedCallsign} (máx. 67 carac.)...`}
                          className="flex-1 bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-orange-500 px-3.5 py-2 text-xs font-mono text-slate-200 rounded-lg outline-none transition-all"
                        />
                        <button
                          type="submit"
                          disabled={!chatMessageText.trim()}
                          className={`px-4 py-2 bg-orange-600 hover:bg-orange-500 text-slate-950 font-mono font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow ${
                            !chatMessageText.trim() ? 'opacity-50 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500' : ''
                          }`}
                        >
                          <Send size={12} />
                          TRANSMITIR
                        </button>
                      </form>

                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 px-1 leading-none select-none">
                        <span>Límite AX.25: {chatMessageText.length} / 67 caracteres</span>
                        {requireChatAck && (
                          <span className="text-orange-400/80">Se añadirá ID de confirmación automática de acuse de recibo.</span>
                        )}
                      </div>
                    </div>

                  </div>
                )}

                {chatViewMode === 'inbox' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1">
                      {aprsPackets.filter(p => p.aprsType === 'MESSAGE' && (p.sourceEventId === 'chat-received' || p.sourceEventId === 'received')).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-650">
                          <Inbox size={32} className="text-slate-800 mb-2" />
                          <p className="font-mono text-xs font-bold text-slate-400">Bandeja de Entrada Vacía</p>
                          <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-normal">
                            No se han recibido mensajes directos desde el módem todavía.
                          </p>
                        </div>
                      ) : (
                        aprsPackets
                          .filter(p => p.aprsType === 'MESSAGE' && (p.sourceEventId === 'chat-received' || p.sourceEventId === 'received'))
                          .map((pkt) => {
                            const isPendingAck = pkt.auditNotes?.includes('Pendiente');
                            return (
                              <div
                                key={pkt.id}
                                className="bg-slate-900/60 border border-slate-850 p-3.5 rounded-lg flex flex-col gap-2 transition-all hover:bg-slate-900/90"
                              >
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-200 font-bold">{pkt.callsign}</span>
                                    <span className="text-slate-500">({pkt.timestamp})</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <ArrowDownLeft size={10} className="text-emerald-500" />
                                    <span className="text-emerald-500 font-bold uppercase tracking-wider text-[8px] bg-emerald-950/40 border border-emerald-900/50 px-1.5 py-0.5 rounded">
                                      INCOMING RF
                                    </span>
                                  </div>
                                </div>

                                <div className="text-xs font-mono text-slate-300 bg-slate-950/85 p-2 rounded border border-slate-900 leading-normal">
                                  {pkt.messageText}
                                </div>

                                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 leading-none">
                                  <span>Raw: <code className="text-[8px] text-slate-450">{pkt.packetString}</code></span>
                                  <div className="flex items-center gap-2">
                                    {isPendingAck ? (
                                      <button
                                        type="button"
                                        onClick={() => handleManualSendAck(pkt)}
                                        className="bg-orange-500 text-slate-950 font-bold px-2 py-0.5 rounded text-[8px] uppercase hover:bg-orange-400 transition-all cursor-pointer"
                                      >
                                        Enviar ACK Manual
                                      </button>
                                    ) : (
                                      <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                        <CheckCircle2 size={10} />
                                        {pkt.auditNotes || 'Confirmado'}
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChatSelectedCallsign(pkt.callsign);
                                        setChatViewMode('chat');
                                      }}
                                      className="bg-slate-955 text-slate-300 hover:text-orange-400 border border-slate-800 hover:border-orange-900/60 px-2 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all"
                                    >
                                      Responder
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                )}

                {chatViewMode === 'outbox' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1">
                      {aprsPackets.filter(p => p.aprsType === 'MESSAGE' && p.sourceEventId === 'chat-sent').length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-650">
                          <Send size={32} className="text-slate-800 mb-2" />
                          <p className="font-mono text-xs font-bold text-slate-400">Bandeja de Salida Vacía</p>
                          <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-normal">
                            No has enviado ningún mensaje directo todavía.
                          </p>
                        </div>
                      ) : (
                        aprsPackets
                          .filter(p => p.aprsType === 'MESSAGE' && p.sourceEventId === 'chat-sent')
                          .map((pkt) => {
                            const isAcked = pkt.auditNotes?.includes('✔');
                            return (
                              <div
                                key={pkt.id}
                                className="bg-slate-900/60 border border-slate-850 p-3.5 rounded-lg flex flex-col gap-2 transition-all hover:bg-slate-900/90"
                              >
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Destinatario:</span>
                                    <span className="text-orange-300 font-bold">{pkt.destination}</span>
                                    <span className="text-slate-500">({pkt.timestamp})</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <ArrowUpRight size={10} className="text-orange-400" />
                                    <span className="text-orange-400 font-bold uppercase tracking-wider text-[8px] bg-orange-950/20 border border-orange-900/30 px-1.5 py-0.5 rounded">
                                      OUTGOING RF
                                    </span>
                                  </div>
                                </div>

                                <div className="text-xs font-mono text-orange-200 bg-slate-950/85 p-2 rounded border border-slate-900 leading-normal">
                                  {pkt.messageText}
                                </div>

                                <div className="bg-slate-900/20 border border-slate-900/80 p-2 rounded text-[8px] font-mono text-slate-500 leading-relaxed">
                                  <div className="text-slate-400 uppercase font-bold text-[7.5px] tracking-wide mb-0.5">Mapeo Hexadecimal de la Trama AX.25 (UI)</div>
                                  <div className="break-all text-slate-450 leading-normal font-mono">
                                    {generateAx25MockHex(pkt.callsign, pkt.destination, pkt.path || 'WIDE1-1', pkt.messageText).hex}
                                  </div>
                                </div>

                                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 leading-none">
                                  <span>Raw: <code className="text-[8px] text-slate-450">{pkt.packetString}</code></span>
                                  <div className="flex items-center gap-1.5">
                                    {isAcked ? (
                                      <span className="text-emerald-500 font-bold flex items-center gap-0.5 bg-emerald-950/20 border border-emerald-900/30 px-1.5 py-0.5 rounded uppercase text-[8px]">
                                        <CheckCheck size={10} />
                                        ACK Recibido
                                      </span>
                                    ) : (
                                      <span className="text-amber-500 font-bold flex items-center gap-0.5 bg-amber-950/20 border border-amber-900/30 px-1.5 py-0.5 rounded uppercase text-[8px] animate-pulse">
                                        <Clock size={10} />
                                        Esperando ACK
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChatSelectedCallsign(pkt.destination);
                                        setChatViewMode('chat');
                                      }}
                                      className="bg-slate-955 text-slate-300 hover:text-orange-400 border border-slate-800 hover:border-orange-900/60 px-2 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all"
                                    >
                                      Chat
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {innerTab === 'traductor' && (
          <div className="border border-slate-850 rounded-xl bg-slate-950/30 p-6 space-y-4 max-w-4xl mx-auto flex flex-col justify-start min-h-[500px] font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-850/60 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="text-orange-400 animate-spin-slow" size={20} />
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Centro de Análisis y Compresión APRS</h3>
              </div>
              
              {/* Sub-tabs selector for the Translator area */}
              <div className="flex bg-slate-900/60 p-0.5 rounded-lg border border-slate-850 text-[10px] font-mono font-bold">
                <button
                  type="button"
                  onClick={() => setAprsTranslateTab('weather')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer transition-all ${
                    aprsTranslateTab === 'weather' ? 'bg-orange-600 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Telemetría WX
                </button>
                <button
                  type="button"
                  onClick={() => setAprsTranslateTab('generic')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer transition-all ${
                    aprsTranslateTab === 'generic' ? 'bg-orange-600 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Analizador Genérico
                </button>
                <button
                  type="button"
                  onClick={() => setAprsTranslateTab('mice')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer transition-all ${
                    aprsTranslateTab === 'mice' ? 'bg-orange-600 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Compresor Mic-E
                </button>
              </div>
            </div>

            {/* TAB 1: WEATHER TELEMETRY PARSER */}
            {aprsTranslateTab === 'weather' && (
              <div className="space-y-4">
                <p className="font-mono text-[10.5px] text-slate-400 leading-relaxed">
                  El siguiente módulo interactivo descifra en tiempo real las tramas de telemetría meteorológica (balizas WX) transmitidas por las estaciones APRS de emergencia. Selecciona o pasa el cursor sobre cada token codificado para visualizar la traducción directa y los cálculos físicos aplicados en base a la especificación técnica internacional de APRS.
                </p>

                {/* APRS WX frame Parser Explainer (Interactive) */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col gap-4 justify-between">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] text-orange-450 uppercase font-black tracking-widest block">Análisis Sintáctico y Semántico de la Trama WX</span>
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
                  <p className="leading-relaxed font-sans text-[11px]">
                    La norma APRS indica que un paquete meteorológico sin posición geográfica comienza con el identificador <code className="text-pink-400 bg-slate-950 px-1 py-0.5 rounded font-mono font-bold">_</code>. A partir de allí, se concatena la dirección del viento de 3 dígitos seguida de una barra inclinada <code className="text-slate-200">/</code> y velocidad en nudos. Las demás variables físicas opcionales se formatean mediante letras clave identificadoras seguidas de sus correspondientes valores numéricos con padding estricto.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: GENERIC PACKET ANALYZER & DECODER */}
            {aprsTranslateTab === 'generic' && (
              <div className="space-y-4">
                <p className="font-mono text-[10.5px] text-slate-400 leading-relaxed">
                  Inserta cualquier trama de radiofrecuencia APRS cruda en formato TNC (o selecciona una plantilla rápida) para descifrarla de forma recursiva según los estándares de enrutación y encapsulación AX.25.
                </p>

                {/* Templates Selector */}
                <div className="flex flex-wrap gap-2 select-none items-center">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mr-1">Plantillas Spec:</span>
                  {[
                    { label: 'Mensaje SMS Directo', data: 'EA4SAT>APRS,WIDE1-1,WIDE2-1::EA4CECOP :QSL recibido. Red local operativa.{msg42' },
                    { label: 'Posición sin Timestamp', data: 'EA4SAT>APCE01,WIDE1-1:=4025.12N/00342.34W#Unidad Movil SAT 1' },
                    { label: 'Boletín Civil Emergencias', data: 'ED4YAK>BLN1EMERG,WIDE1-1::BLN1EMERG:INCENDIO RESTRICCION SECTOR NORTE. CONFINAR.' },
                    { label: 'Alerta Objeto sísmico', data: 'EA4SAT-3>APRS,WIDE1-1:;SISM-IGN  *211242z4025.12N/00342.34W[Sismo Detectado IGN' },
                    { label: 'Trama Comprimida Mic-E', data: 'EA4SAT>S42P12,WIDE1-1:`102/003g005v' }
                  ].map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setAnalyzerInput(tpl.data)}
                      className="text-[9.5px] bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-350 px-2.5 py-1 rounded-md transition-colors cursor-pointer font-sans"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Entrada de trama AX.25 / APRS (Formato TNC):</label>
                  <input
                    type="text"
                    value={analyzerInput}
                    onChange={(e) => setAnalyzerInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-orange-500 px-3.5 py-2 text-xs font-mono text-slate-200 rounded-lg outline-none transition-all"
                    placeholder="SENDER>DEST,PATH:PAYLOAD"
                  />
                </div>

                {/* Analysis Results Display */}
                {(() => {
                  const p = parseGenericAprs(analyzerInput);
                  return (
                    <div className="bg-slate-900/35 border border-slate-850 rounded-xl p-5 space-y-4 font-mono text-xs text-slate-300">
                      <div className="flex flex-wrap justify-between items-center border-b border-slate-850 pb-2 gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                          <Activity size={12} className="text-orange-400" />
                          Resultado de la Decodificación Recursiva
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-[9.5px] font-black border uppercase ${
                          p.isEmergency 
                            ? 'bg-rose-950/50 text-rose-400 border-rose-900/40 animate-pulse'
                            : 'bg-slate-950 text-orange-400 border-slate-800'
                        }`}>
                          {p.type}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Indicativo de Origen (Source Callsign):</span>
                          <span className="text-slate-200 font-bold text-xs">{p.source}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Indicativo de Destino (Destination Address):</span>
                          <span className="text-slate-200 font-bold text-xs">{p.destination}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Ruta de Digipeaters (AX.25 Routing Path):</span>
                          <span className="text-slate-300">{p.path.length > 0 ? p.path.join(' ➔ ') : 'VÍA DIRECTA (Sin repetidores)'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Carácter Identificador de Protocolo:</span>
                          <span className="text-orange-400 font-bold">{p.rawTypeChar ? `"${p.rawTypeChar}"` : 'No aplicable'}</span>
                        </div>

                        {p.latitude !== undefined && p.longitude !== undefined && (
                          <div className="col-span-1 md:col-span-2 bg-slate-950/60 p-3 border border-slate-900 rounded-lg flex items-center justify-between">
                            <div className="space-y-1">
                              <span className="text-slate-550 block text-[9px] uppercase tracking-widest font-black leading-none">Coordenadas de Posición Extraídas</span>
                              <div className="text-xs text-emerald-400 font-bold">
                                Lat: {p.latitude.toFixed(6)}° {p.latitude >= 0 ? 'N' : 'S'} • Lon: {p.longitude.toFixed(6)}° {p.longitude >= 0 ? 'E' : 'W'}
                              </div>
                            </div>
                            <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-1 rounded font-bold uppercase select-none">GPS LOCK ✔</span>
                          </div>
                        )}

                        {p.recipient && (
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Estación Receptora / Filtro de Boletín:</span>
                            <span className="text-orange-300 font-bold">{p.recipient}</span>
                          </div>
                        )}

                        {p.msgId && (
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Identificador de Mensaje (Message ID):</span>
                            <span className="text-sky-400 font-bold">`{p.msgId}` (Requiere respuesta ACK)</span>
                          </div>
                        )}

                        <div className="col-span-1 md:col-span-2">
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Mensaje o Comentarios Decodificados:</span>
                          <p className="bg-slate-950 p-3 rounded-lg border border-slate-900 text-slate-200 break-words italic leading-relaxed text-xs">
                            {p.comment || 'Ningún comentario o mensaje de texto adjunto.'}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-850 pt-2.5 text-[9px] text-slate-500 flex flex-wrap gap-x-4">
                        <span>Encapsulación: <strong className="text-slate-400">AX.25 UI (Unnumbered Info)</strong></span>
                        <span>Control Byte: <strong className="text-slate-400">0x03</strong></span>
                        <span>PID Byte: <strong className="text-slate-400">0xF0 (APRS)</strong></span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB 3: MIC-E COMPRESSOR & ENCODER PLAYGROUND */}
            {aprsTranslateTab === 'mice' && (
              <div className="space-y-4">
                <p className="font-mono text-[10.5px] text-slate-400 leading-relaxed">
                  Mic-E es un protocolo altamente optimizado que comprime la latitud en el campo de dirección de destino (7 bytes) de la cabecera AX.25, utilizando desplazamientos ASCII bit-shifted para comprimir el ancho de banda analógico. Experimenta con el codificador matemático y decodificador en tiempo real.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Codificador panel */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-3">
                    <span className="text-[10px] font-mono text-orange-400 uppercase font-black tracking-widest block border-b border-slate-850 pb-1.5">CODIFICADOR MIC-E MATEMÁTICO</span>
                    
                    <div className="space-y-2 text-xs">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase">Latitud (Grados decimales, e.g. Madrid: 40.4167)</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={miceEncLat}
                          onChange={(e) => setMiceEncLat(parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-850 px-2 py-1 text-slate-200 font-mono rounded"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-[9px] text-slate-500 uppercase">Hemisferio de Latitud</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setMiceEncSouth(false)}
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-colors ${!miceEncSouth ? 'bg-orange-600 text-slate-950' : 'bg-slate-950 text-slate-400'}`}
                          >
                            Norte (N)
                          </button>
                          <button
                            type="button"
                            onClick={() => setMiceEncSouth(true)}
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-colors ${miceEncSouth ? 'bg-orange-600 text-slate-950' : 'bg-slate-950 text-slate-400'}`}
                          >
                            Sur (S)
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] text-slate-500 uppercase">Código de Estado de Mensaje Mic-E</label>
                        <select
                          value={miceEncMsgCode}
                          onChange={(e) => setMiceEncMsgCode(parseInt(e.target.value, 10))}
                          className="bg-slate-950 border border-slate-850 px-2 py-1.5 text-slate-200 font-sans rounded outline-none text-xs"
                        >
                          <option value={0}>M0: Off Duty / Fuera de Servicio</option>
                          <option value={1}>M1: In Service / En Servicio</option>
                          <option value={2}>M2: En Route / En Ruta</option>
                          <option value={3}>M3: Returning / Regresando</option>
                          <option value={4}>M4: Committed / Comprometido</option>
                          <option value={5}>M5: Special / Tránsito Especial</option>
                          <option value={6}>M6: Priority / Prioritario</option>
                          <option value={7}>EMG: EMERGENCY / EMERGENCIA CRÍTICA</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[9px] text-slate-500 uppercase">Usar bits de prioridad alternativos</span>
                        <input
                          type="checkbox"
                          checked={miceEncCustom}
                          onChange={(e) => setMiceEncCustom(e.target.checked)}
                          className="cursor-pointer"
                        />
                      </div>
                    </div>

                    {(() => {
                      const enc = encodeMicELatitude(miceEncLat, miceEncSouth, miceEncMsgCode, miceEncCustom);
                      return (
                        <div className="pt-3 border-t border-slate-850 space-y-2">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">DESTINO AX.25 GENERADO (6 bytes):</span>
                          <div className="bg-slate-950 p-2 border border-slate-900 rounded font-mono text-sm text-center text-orange-400 font-extrabold tracking-widest uppercase">
                            {enc.destination}
                          </div>

                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Pasos de Codificación (ASCII Shift):</span>
                          <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1">
                            {enc.steps.map((st, i) => (
                              <div key={i} className="text-[9.5px] font-mono text-slate-400 bg-slate-950/40 p-1.5 border border-slate-900/60 rounded leading-tight">
                                {st}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Decodificador rápido */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col justify-between h-full">
                    <div className="space-y-3 flex-1">
                      <span className="text-[10px] font-mono text-orange-400 uppercase font-black tracking-widest block border-b border-slate-850 pb-1.5">DECODIFICADOR EXPRESO MIC-E</span>
                      
                      <div className="space-y-1 text-xs">
                        <label className="text-[9px] text-slate-500 uppercase">Dirección de Destino Mic-E de 6 caracteres (e.g. `S42P12` o `T42P12`):</label>
                        <input
                          type="text"
                          maxLength={6}
                          defaultValue="S42P12"
                          id="mice-decoder-input-box"
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().slice(0, 6);
                            const box = document.getElementById('mice-decoder-results-area');
                            const stepsBox = document.getElementById('mice-decoder-steps-area');
                            if (val.length === 6 && box) {
                              const dec = decodeMicEPacket(val);
                              box.innerHTML = `
                                <div class="text-xs space-y-1.5">
                                  <div><strong class="text-slate-455">Latitud Decodificada:</strong> <span class="text-emerald-400 font-bold">${dec.latitude.toFixed(5)}° ${dec.isSouth ? 'Sur' : 'Norte'}</span></div>
                                  <div><strong class="text-slate-455">Estado del Mensaje:</strong> <span class="text-orange-450 font-bold">${dec.msgText}</span></div>
                                  <div><strong class="text-slate-455">Hemisferio de Longitud:</strong> <span class="text-slate-200">${dec.isWest ? 'Oeste' : 'Este'}</span></div>
                                  <div><strong class="text-slate-455">Desplazamiento Longitud:</strong> <span class="text-slate-200">${dec.isOffset ? '>= 100°' : '< 100°'}</span></div>
                                </div>
                              `;
                              if (stepsBox) {
                                stepsBox.innerHTML = dec.steps.map(s => `<div class="text-[9px] font-mono text-slate-450 border-b border-slate-900 pb-1">${s}</div>`).join('');
                              }
                            }
                          }}
                          className="w-full bg-slate-950 border border-slate-850 hover:border-slate-800 focus:border-orange-500 px-2 py-1 text-slate-200 font-mono rounded outline-none text-xs text-center tracking-widest font-black"
                        />
                      </div>

                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-900 mt-2 min-h-[90px] flex items-center justify-center text-[10px]" id="mice-decoder-results-area">
                        {(() => {
                          const dec = decodeMicEPacket('S42P12');
                          return (
                            <div className="text-xs space-y-1.5 w-full">
                              <div><strong className="text-slate-400">Latitud Decodificada:</strong> <span className="text-emerald-400 font-bold">{dec.latitude.toFixed(5)}° {dec.isSouth ? 'Sur' : 'Norte'}</span></div>
                              <div><strong className="text-slate-400">Estado del Mensaje:</strong> <span className="text-orange-400 font-bold">{dec.msgText}</span></div>
                              <div><strong className="text-slate-400">Hemisferio de Longitud:</strong> <span className="text-slate-200">{dec.isWest ? 'Oeste' : 'Este'}</span></div>
                              <div><strong className="text-slate-400">Desplazamiento Longitud:</strong> <span className="text-slate-200">{dec.isOffset ? '>= 100°' : '< 100°'}</span></div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-1 pt-3 border-t border-slate-850">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Desglose de bytes decodificados:</span>
                      <div className="max-h-[110px] overflow-y-auto space-y-1 text-[9px] pr-1" id="mice-decoder-steps-area">
                        {decodeMicEPacket('S42P12').steps.map((s, i) => (
                          <div key={i} className="text-slate-400 border-b border-slate-900 pb-1">
                            {s}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
