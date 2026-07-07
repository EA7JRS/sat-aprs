import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, Terminal, Volume2, Activity, Play, Settings, RefreshCw, 
  Cpu, HardDrive, Share2, Compass, Waves, CheckCircle2, AlertTriangle, 
  Send, Server, ShieldAlert, BarChart3, ChevronRight, Sliders, ToggleLeft, HelpCircle
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area
} from 'recharts';

import { getBeaufortInfoByKts } from '../../utils/beaufort';
import { customFetch } from '../../utils/customFetch';

interface DirewolfConsoleProps {
  weather?: {
    tempC: number;
    windSpeedKts: number;
    pressureHpa: number;
  };
  callsign?: string;
  systemLogs?: any[];
}

// Generate packet rate trend data over 24 hours
const generateTelemetryHistory = () => {
  const data = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600 * 1000);
    const hourStr = time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    data.push({
      time: hourStr,
      packetRate: Math.round(15 + Math.sin((i / 24) * Math.PI * 2) * 8 + Math.random() * 5),
      noiseFloor: parseFloat((-92.4 + Math.sin(i / 4) * 2.5 + Math.random() * 0.8).toFixed(1)),
      decodeSuccess: parseFloat((96.5 + Math.sin(i / 8) * 2 + Math.random() * 1.2).toFixed(1))
    });
  }
  return data;
};

export default function DirewolfConsole({ weather, callsign, systemLogs }: DirewolfConsoleProps) {
  // Console operational states
  const [activeTab, setActiveTab] = useState<'tnc' | 'metrics' | 'ax25' | 'settings'>('tnc');
  const [isRunning, setIsRunning] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oscTimeRef = useRef(0);
  const fftTimeRef = useRef(0);

  const [frequency, setFrequency] = useState('144.800'); // MHz Standard AFSK Europe
  const [kissClients, setKissClients] = useState([
    { id: 'aprx', app: 'APRX Gateway Daemon', port: 8001, packets: 1459, connectedSince: '6d 12h' },
    { id: 'syslog', app: 'SAT Core Telemetry', port: 8001, packets: 842, connectedSince: '12d 4h' }
  ]);
  
  // Audio state
  const [inputVolume, setInputVolume] = useState(48);
  const [squelch, setSquelch] = useState(15);
  const [agcEnabled, setAgcEnabled] = useState(true);
  const [isDcdActive, setIsDcdActive] = useState(false);
  const [isTxActive, setIsTxActive] = useState(false);
  const [baudRate, setBaudRate] = useState<1200 | 9600 | 300>(1200);
  const [fmBandwidth, setFmBandwidth] = useState<'narrow' | 'wide' | 'ssb'>('narrow');

  // Automatic Baud Rate Detection states
  const [incomingSignalBaud, setIncomingSignalBaud] = useState<1200 | 9600 | 300 | null>(null);
  const [detectedBaudRate, setDetectedBaudRate] = useState<1200 | 9600 | 300 | null>(null);
  const [isBaudDetecting, setIsBaudDetecting] = useState(false);
  const [baudLockStatus, setBaudLockStatus] = useState<'locked' | 'mismatch' | 'searching' | 'idle'>('idle');
  
  // Custom Packet Builder
  const [srcCall, setSrcCall] = useState('EA1URG-13');

  useEffect(() => {
    if (callsign) {
      setSrcCall(callsign);
    }
  }, [callsign]);
  const [destCall, setDestCall] = useState('APDIW1');
  const [path, setPath] = useState('WIDE1-1,WIDE2-1');
  const [payload, setPayload] = useState('S.A.T. NODO COORD-VHF ACTIVADO [MODO SAT]');
  const [txLog, setTxLog] = useState<string[]>([]);
  
  const [terminalTab, setTerminalTab] = useState<'traffic' | 'connection'>('traffic');
  
  // Terminal Logs (Real Packets only)
  const [logs, setLogs] = useState<string[]>([]);

  // System/Connection logs
  const [connectionLogs, setConnectionLogs] = useState<string[]>([
    'Direwolf software TNC version 1.7.3-stable initializing...',
    'Operating System: Debian GNU/Linux 13 (trixie) - modern ARM64 NUC architecture',
    'Audio input soundcard channel map: plughw:1,0 (ALSA Device: C-Media USB Headset)',
    'Line-in audio calibration sequence loaded. Normalizing signal bounds.',
    'Port 8001 (KISS TCP Socket) initialized. Direct binder listening active.',
    'GPSD connected successfully onto localhost:2947. 3D Position Fix verified.',
    'Channel 0: Modulation format is standard AFSK 1200 Baud (Bell 202 tones 1200/2200 Hz)',
    '[OK] direwolf.service running inside background daemon mode.',
    `[INFO] Frequency set to standard VHF digital voice/data channel: 144.800 MHz`,
    'System synced with NTP public timeservers. Standard clock drift: -0.02ms'
  ]);

  // Calibration settings
  const [txDelay, setTxDelay] = useState(250); // ms
  const [txTail, setTxTail] = useState(50); // ms
  const [pttControl, setPttControl] = useState('/dev/ttyUSB0 RTS');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  
  // Real system-driven stats
  const [stats, setStats] = useState({
    packetsTx: 0,
    packetsRx: 0,
    crcErrors: 0,
    dutyCycle: 0.0, // %
    activeBeacons: 0,
    uptime: '1d 02h 15m'
  });

  const [graphData, setGraphData] = useState(() => generateTelemetryHistory());

  // Real-time Canvas Oscilloscope render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let t = oscTimeRef.current; // continuous time variable

    // Set physical canvas dimensions based on client bounding box
    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = (rect?.width || 600) * (window.devicePixelRatio || 1);
      canvas.height = (rect?.height || 120) * (window.devicePixelRatio || 1);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      if (!ctx || !canvas) return;

      const w = canvas.width;
      const h = canvas.height;

      // Determine colors based on active modulation format
      let traceColor = '#10b981'; // Emerald green for HF AFSK 300
      let gridColor = 'rgba(16, 185, 129, 0.05)';
      let gridLinesColor = 'rgba(16, 185, 129, 0.12)';
      let sampleRateText = 'Smp: 11.025 kHz';
      let timeScaleText = 'Time: 5.0 ms/div';
      let voltScaleText = 'Volt: 200 mV/div';
      let modeName = 'AFSK 300 bps (HF)';

      if (baudRate === 9600) {
        traceColor = '#06b6d4'; // Cyan for GMSK 9600
        gridColor = 'rgba(6, 182, 212, 0.05)';
        gridLinesColor = 'rgba(6, 182, 212, 0.12)';
        sampleRateText = 'Smp: 96.000 kHz';
        timeScaleText = 'Time: 0.2 ms/div';
        voltScaleText = 'Volt: 500 mV/div';
        modeName = 'GMSK 9600 bps (VHF)';
      } else if (baudRate === 1200) {
        traceColor = '#f59e0b'; // Amber for AFSK 1200
        gridColor = 'rgba(245, 158, 11, 0.05)';
        gridLinesColor = 'rgba(245, 158, 11, 0.12)';
        sampleRateText = 'Smp: 44.100 kHz';
        timeScaleText = 'Time: 1.0 ms/div';
        voltScaleText = 'Volt: 300 mV/div';
        modeName = 'AFSK 1200 bps (VHF)';
      }

      // Calculate signal gain factor based on inputVolume and AGC state
      // 48/100 is treated as the nominal level (0 dB / 1.0x gain)
      const rawScale = inputVolume / 48;
      const agcGain = agcEnabled ? (1 / Math.max(0.1, rawScale)) : 1.0;
      const totalGain = rawScale * agcGain;

      // Clear with CRT-phosphor deep black/slate background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, w, h);

      // Draw Grid / Reticle
      ctx.lineWidth = 1;
      ctx.strokeStyle = gridLinesColor;
      
      const numGridX = 10;
      const numGridY = 6;
      
      // Draw vertical grid lines
      for (let i = 1; i < numGridX; i++) {
        const xCoord = (w / numGridX) * i;
        ctx.beginPath();
        if (i === numGridX / 2) {
          ctx.setLineDash([4, 4]); // center line is dashed
        } else {
          ctx.setLineDash([1, 10]);
        }
        ctx.moveTo(xCoord, 0);
        ctx.lineTo(xCoord, h);
        ctx.stroke();
      }

      // Draw horizontal grid lines
      for (let i = 1; i < numGridY; i++) {
        const yCoord = (h / numGridY) * i;
        ctx.beginPath();
        if (i === numGridY / 2) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([1, 10]);
        }
        ctx.moveTo(0, yCoord);
        ctx.lineTo(w, yCoord);
        ctx.stroke();
      }
      ctx.setLineDash([]); // Reset line dash

      // Calculate Waveform coordinates
      ctx.beginPath();
      ctx.lineWidth = 2.2 * (window.devicePixelRatio || 1);
      ctx.strokeStyle = traceColor;
      
      // Apply neon glowing effect
      ctx.shadowBlur = 8 * (window.devicePixelRatio || 1);
      ctx.shadowColor = traceColor;

      const halfH = h / 2;
      const totalPoints = Math.min(Math.floor(w), 800); // sample points

      // Time variables progression speed based on baudrate & running state
      const timeStep = isRunning ? (baudRate === 9600 ? 0.7 : baudRate === 300 ? 0.15 : 0.4) : 0;
      t += timeStep;
      oscTimeRef.current = t;

      for (let i = 0; i < totalPoints; i++) {
        const x = (w / totalPoints) * i;
        const normX = i / totalPoints;
        
        let y = 0;

        if (!isRunning) {
          // Stationary horizontal baseline with tiny thermal noise
          y = (Math.sin(normX * 50) * 0.01) + (Math.random() - 0.5) * 0.005;
        } else if (!isTxActive && !isDcdActive) {
          // Noise floor / squelched background (Carrier absent)
          if (baudRate === 300) {
            // Rough SSB atmospheric crackle
            y = (Math.sin(normX * 80 + t) * 0.03) + (Math.random() - 0.5) * 0.08;
          } else {
            // FM Discriminator high frequency hiss
            y = (Math.sin(normX * 160 + t) * 0.04) + (Math.random() - 0.5) * 0.12;
          }
        } else if (isDcdActive) {
          // ACTIVE RECEIVE DEMODULATION (Carrier present, demodulator syncing)
          if (baudRate === 9600) {
            // GMSK modulation signal + some channel noise
            let sig = 0;
            for (let k = 1; k <= 3; k++) {
              sig += Math.sin(normX * (15 * k) + t * (0.3 * k));
            }
            sig = Math.tanh(sig * 0.85); // pulse shaper
            const noise = (Math.random() - 0.5) * 0.15;
            y = sig * 0.65 + noise;
          } else if (baudRate === 300) {
            // HF 300 bps Bell 103 (flickering/fading with atmospherics)
            const isMark = Math.sin(normX * 12 + t * 0.05) > 0;
            const waveFreq = isMark ? 35 : 38; // frequency shifts
            const fade = 0.6 + 0.4 * Math.sin(t * 0.05);
            const sig = Math.sin(normX * waveFreq + t * 0.12) * fade;
            const staticNoise = (Math.random() - 0.5) * 0.12;
            y = sig * 0.7 + staticNoise;
          } else {
            // VHF 1200 bps AFSK Bell 202
            const isMark = Math.sin(normX * 8 + t * 0.1) > 0;
            const waveFreq = isMark ? 25 : 45; // 1200 Hz vs 2200 Hz
            const sig = Math.sin(normX * waveFreq + t * 0.25);
            const noise = (Math.random() - 0.5) * 0.08;
            y = sig * 0.75 + noise;
          }
        } else if (isTxActive) {
          // CLEAN TRANSMITTED OUTBOUND SIGNAL (No noise, solid integrity)
          if (baudRate === 9600) {
            let sig = 0;
            for (let k = 1; k <= 3; k++) {
              sig += Math.sin(normX * (15 * k) + t * (0.4 * k));
            }
            y = Math.tanh(sig * 0.95) * 0.85; // Perfect GMSK pulse shaping
          } else if (baudRate === 300) {
            const isMark = Math.sin(normX * 12 + t * 0.08) > 0;
            const waveFreq = isMark ? 35 : 38;
            y = Math.sin(normX * waveFreq + t * 0.2) * 0.85; // Solid HF phase-continuous signal
          } else {
            const isMark = Math.sin(normX * 8 + t * 0.15) > 0;
            const waveFreq = isMark ? 25 : 45;
            y = Math.sin(normX * waveFreq + t * 0.35) * 0.85; // Perfect AFSK 1200 output
          }
        }

        // Apply gain scaling (AGC vs fixed gain) and clip at safety limit
        let processedY = y * totalGain;
        if (processedY > 1.25) processedY = 1.25;
        if (processedY < -1.25) processedY = -1.25;

        const plotY = halfH + processedY * (h * 0.38);
        if (i === 0) {
          ctx.moveTo(x, plotY);
        } else {
          ctx.lineTo(x, plotY);
        }
      }

      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow for text and other lines

      // Draw horizontal center reference line in trace color (very faint)
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.moveTo(0, halfH);
      ctx.lineTo(w, halfH);
      ctx.stroke();

      // Draw Oscilloscope Calibration Info Texts in green/amber/cyan mono styling
      ctx.fillStyle = traceColor;
      ctx.font = `bold ${Math.max(9, 10 * (window.devicePixelRatio || 1))}px monospace`;
      ctx.textBaseline = 'top';
      
      const margin = 10 * (window.devicePixelRatio || 1);
      const lineHeight = 14 * (window.devicePixelRatio || 1);

      // Top Right - Calibration metrics
      ctx.textAlign = 'right';
      ctx.fillText(sampleRateText, w - margin, margin);
      ctx.fillText(timeScaleText, w - margin, margin + lineHeight);
      ctx.fillText(voltScaleText, w - margin, margin + lineHeight * 2);

      // Bottom Right - Trigger & Mode Status
      ctx.textAlign = 'right';
      const triggerState = isTxActive ? 'TRIG: PTT [TX]' : isDcdActive ? 'TRIG: LOCK [RX]' : 'TRIG: AUTO [HISS]';
      ctx.fillText(triggerState, w - margin, h - margin - lineHeight * 1.3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(modeName, w - margin, h - margin - 2);

      // Top Left - AGC Status overlay
      ctx.textAlign = 'left';
      ctx.fillStyle = agcEnabled ? '#10b981' : '#ef4444';
      ctx.fillText(agcEnabled ? `AGC: ON (${(20 * Math.log10(agcGain)).toFixed(1)} dB)` : 'AGC: OFF (0.0 dB)', margin, margin);

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [baudRate, isTxActive, isDcdActive, isRunning, agcEnabled, inputVolume]);

  // Real-time Canvas Spectrum Analyzer (FFT) render loop
  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let t = fftTimeRef.current; // continuous time variable

    // Set physical canvas dimensions based on client bounding box
    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = (rect?.width || 300) * (window.devicePixelRatio || 1);
      canvas.height = (rect?.height || 120) * (window.devicePixelRatio || 1);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Keep track of peak hold values
    const numBins = 128;
    const peakHold = new Array(numBins).fill(-100);

    const render = () => {
      if (!ctx || !canvas) return;

      const w = canvas.width;
      const h = canvas.height;

      // Determine styling colors based on active modulation format
      let traceColor = '#10b981'; // Emerald green for HF AFSK 300
      let gridColor = 'rgba(16, 185, 129, 0.05)';
      let gridLinesColor = 'rgba(16, 185, 129, 0.12)';
      let modeLabel = 'ANÁLISIS FFT: 500 Hz SSB BPF';
      let freqMaxLabel = '4.0 kHz';
      let freqMinLabel = '0.0 kHz';

      if (baudRate === 9600) {
        traceColor = '#06b6d4'; // Cyan for GMSK 9600
        gridColor = 'rgba(6, 182, 212, 0.05)';
        gridLinesColor = 'rgba(6, 182, 212, 0.12)';
        modeLabel = 'ANÁLISIS FFT: 25.0 kHz WIDE FM';
        freqMaxLabel = '12.0 kHz';
        freqMinLabel = '0.0 kHz';
      } else if (baudRate === 1200) {
        traceColor = '#f59e0b'; // Amber for AFSK 1200
        gridColor = 'rgba(245, 158, 11, 0.05)';
        gridLinesColor = 'rgba(245, 158, 11, 0.12)';
        modeLabel = 'ANÁLISIS FFT: 12.5 kHz NARROW FM';
        freqMaxLabel = '4.0 kHz';
        freqMinLabel = '0.0 kHz';
      }

      // Clear background with CRT-phosphor deep black/slate background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, w, h);

      // Draw Grid / Reticle
      ctx.lineWidth = 1;
      ctx.strokeStyle = gridLinesColor;
      
      const numGridX = 10;
      const numGridY = 5;
      
      // Vertical grid lines
      for (let i = 1; i < numGridX; i++) {
        const xCoord = (w / numGridX) * i;
        ctx.beginPath();
        ctx.setLineDash([1, 10]);
        ctx.moveTo(xCoord, 0);
        ctx.lineTo(xCoord, h);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let i = 1; i < numGridY; i++) {
        const yCoord = (h / numGridY) * i;
        ctx.beginPath();
        if (i === numGridY - 1) {
          ctx.setLineDash([4, 4]); // Reference base line
        } else {
          ctx.setLineDash([1, 10]);
        }
        ctx.moveTo(0, yCoord);
        ctx.lineTo(w, yCoord);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Time variable for animations
      t += 0.15;
      fftTimeRef.current = t;

      // Draw Bandpass filter window shading (highlighting active channel bandwidth)
      ctx.fillStyle = baudRate === 9600 
        ? 'rgba(6, 182, 212, 0.04)' 
        : baudRate === 300 
          ? 'rgba(16, 185, 129, 0.08)' 
          : 'rgba(245, 158, 11, 0.04)';
      
      let filterStartPct = 0;
      let filterEndPct = 1;

      if (baudRate === 1200) {
        // Narrow FM: 300 to 3000 Hz in a 0-4000 Hz scale
        filterStartPct = 300 / 4000;
        filterEndPct = 3000 / 4000;
      } else if (baudRate === 300) {
        // HF SSB: 1870 to 2370 Hz in a 0-4000 Hz scale
        filterStartPct = 1870 / 4000;
        filterEndPct = 2370 / 4000;
      } else if (baudRate === 9600) {
        // Wide FM GMSK: 0 to 9600 Hz in a 0-12000 Hz scale
        filterStartPct = 0;
        filterEndPct = 9600 / 12000;
      }

      ctx.fillRect(filterStartPct * w, 0, (filterEndPct - filterStartPct) * w, h);

      // Draw filter boundary vertical lines
      ctx.strokeStyle = baudRate === 9600 
        ? 'rgba(6, 182, 212, 0.2)' 
        : baudRate === 300 
          ? 'rgba(16, 185, 129, 0.4)' 
          : 'rgba(245, 158, 11, 0.2)';
      ctx.lineWidth = 1;
      
      // Draw left/right bounds of the bandpass filter if not wide open
      if (baudRate !== 9600) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(filterStartPct * w, 0); ctx.lineTo(filterStartPct * w, h);
        ctx.moveTo(filterEndPct * w, 0); ctx.lineTo(filterEndPct * w, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Calculate signal level offset for FFT
      // If AGC is active, the level is normalized (0 dB offset).
      // If AGC is inactive, the levels are shifted according to inputVolume.
      const rawScale = inputVolume / 48;
      const offsetDb = agcEnabled ? 0 : 20 * Math.log10(rawScale);

      // Generate spectrum bin data
      const binData: number[] = [];
      const isSignalActive = isTxActive || isDcdActive;

      // Fast toggle simulations (flickering of digital packet bits)
      const pulseSpeed = baudRate === 9600 ? 0.9 : baudRate === 300 ? 0.08 : 0.4;
      const bitSwitch = Math.sin(t * pulseSpeed) > 0;

      for (let i = 0; i < numBins; i++) {
        const norm = i / (numBins - 1);
        let freq = 0;
        let db = -95; // Base noise floor in dB

        if (baudRate === 9600) {
          freq = norm * 12000; // 0 - 12 kHz

          // Wide-FM noise floor
          db = -75 + Math.sin(norm * Math.PI) * 5;

          if (isSignalActive) {
            // GMSK smooth lobe: shaped like sinc^2(f) filtered by gaussian filter
            // Main lobe centered around 0 to ~4800 Hz
            const centerLobe = 1 - Math.min(1, freq / 5000);
            const mainLobeDb = -35 + centerLobe * 25 + Math.sin(freq * 0.001 - t) * 1.5;
            // Roll off
            db = Math.max(db, mainLobeDb);
          }
        } else if (baudRate === 1200) {
          freq = norm * 4000; // 0 - 4 kHz

          // Narrow FM bandpass response: rolls off below 300 Hz and above 3000 Hz
          let bpfAttenuation = 0;
          if (freq < 300) {
            bpfAttenuation = -35 * (1 - freq / 300);
          } else if (freq > 3000) {
            bpfAttenuation = -45 * (Math.min(1, (freq - 3000) / 1000));
          }
          db = -80 + bpfAttenuation;

          if (isSignalActive) {
            // AFSK Tones at 1200 Hz and 2200 Hz
            // alternate which tone is dominant to simulate real AFSK modulation!
            const markLevel = bitSwitch ? -25 : -40;
            const spaceLevel = bitSwitch ? -40 : -25;

            const markPeak = markLevel - Math.pow((freq - 1200) / 100, 2) * 5;
            const spacePeak = spaceLevel - Math.pow((freq - 2200) / 100, 2) * 5;

            db = Math.max(db, markPeak, spacePeak);
          }
        } else {
          // AFSK 300 (HF SSB)
          freq = norm * 4000; // 0 - 4 kHz

          // High-Q bandpass filter centered at 2120 Hz (2020 and 2220 tones)
          // 500 Hz filter bounds: 1870 Hz - 2370 Hz
          let bpfAttenuation = 0;
          if (freq < 1870) {
            bpfAttenuation = -55 * (1 - freq / 1870);
          } else if (freq > 2370) {
            bpfAttenuation = -55 * (Math.min(1, (freq - 2370) / 800));
          }
          db = -85 + bpfAttenuation;

          if (isSignalActive) {
            // HF AFSK Tones at 2020 Hz and 2220 Hz
            const markLevel = bitSwitch ? -20 : -35;
            const spaceLevel = bitSwitch ? -35 : -20;

            const markPeak = markLevel - Math.pow((freq - 2020) / 45, 2) * 8;
            const spacePeak = spaceLevel - Math.pow((freq - 2220) / 45, 2) * 8;

            db = Math.max(db, markPeak, spacePeak);
          }
        }

        // Apply dB offset depending on gain / AGC setting
        db += offsetDb;

        // Add real-time grass (thermal noise jitter)
        const jitter = isRunning ? (Math.random() - 0.5) * 4 : 0;
        db += jitter;

        // Clip dB level to reasonable range for drawing (-100 dB to -10 dB)
        db = Math.max(-100, Math.min(-10, db));
        binData.push(db);

        // Update peak hold
        if (db > peakHold[i] || !isRunning) {
          peakHold[i] = db;
        } else {
          // Slow decay for peak hold
          peakHold[i] = Math.max(-100, peakHold[i] - 0.15);
        }
      }

      // Draw Filled Spectrum Area
      ctx.beginPath();
      const dbToY = (val: number) => {
        // Map -100 dB to h - 10, -10 dB to 15
        const pct = (val - (-100)) / 90; // 0 to 1
        return h - 10 - pct * (h - 25);
      };

      ctx.moveTo(0, h);
      for (let i = 0; i < numBins; i++) {
        const x = (w / (numBins - 1)) * i;
        const y = dbToY(binData[i]);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      
      // Fill Gradient matching the active color scheme
      const fillGradient = ctx.createLinearGradient(0, 0, 0, h);
      fillGradient.addColorStop(0, traceColor + '44'); // Translucent
      fillGradient.addColorStop(0.5, traceColor + '18');
      fillGradient.addColorStop(1, traceColor + '02');
      ctx.fillStyle = fillGradient;
      ctx.fill();

      // Draw Trace Line
      ctx.beginPath();
      ctx.strokeStyle = traceColor;
      ctx.lineWidth = 1.8 * (window.devicePixelRatio || 1);
      ctx.shadowBlur = 6 * (window.devicePixelRatio || 1);
      ctx.shadowColor = traceColor;

      for (let i = 0; i < numBins; i++) {
        const x = (w / (numBins - 1)) * i;
        const y = dbToY(binData[i]);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // Draw Peak Hold Line
      ctx.beginPath();
      ctx.strokeStyle = traceColor + '55'; // half transparent
      ctx.lineWidth = 1;
      for (let i = 0; i < numBins; i++) {
        const x = (w / (numBins - 1)) * i;
        const y = dbToY(peakHold[i]);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw Bandwidth indicator markers and labels (e.g., center frequency, peak labels)
      ctx.fillStyle = traceColor;
      ctx.font = `bold ${Math.max(9, 10 * (window.devicePixelRatio || 1))}px monospace`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';

      // Draw horizontal labels on spectrum
      const labelMarginY = h - 3;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(freqMinLabel, 5, labelMarginY);
      
      ctx.textAlign = 'center';
      if (baudRate === 1200) {
        ctx.fillText('1.2k (Mark)', (1200 / 4000) * w, labelMarginY);
        ctx.fillText('2.2k (Space)', (2200 / 4000) * w, labelMarginY);
      } else if (baudRate === 300) {
        ctx.fillText('2.02k (Mark)', (2020 / 4000) * w, labelMarginY);
        ctx.fillText('2.22k (Space)', (2220 / 4000) * w, labelMarginY);
      } else if (baudRate === 9600) {
        ctx.fillText('4.8k Lobe', (4800 / 12000) * w, labelMarginY);
        ctx.fillText('9.6k BW', (9600 / 12000) * w, labelMarginY);
      }

      ctx.textAlign = 'right';
      ctx.fillText(freqMaxLabel, w - 5, labelMarginY);

      // Top Left: Mode details & active spectrum status
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = traceColor;
      ctx.fillText(modeLabel, 10, 10);
      
      // Draw dB markers
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `8px monospace`;
      ctx.fillText('-10 dB', 6, dbToY(-10));
      ctx.fillText('-50 dB', 6, dbToY(-50));
      ctx.fillText('-90 dB', 6, dbToY(-90));

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [baudRate, isTxActive, isDcdActive, isRunning, agcEnabled, inputVolume]);

  // Audio simulation loops (DISABLED by user request to turn off simulation mode and loops)
  useEffect(() => {
    // Both background loop and simulated automatic updates are disabled.
    return;
  }, [isRunning, baudRate]);

  // Synchronize stats and append real packet traffic from systemLogs to the terminal
  const [lastLogLength, setLastLogLength] = useState(0);

  useEffect(() => {
    if (!systemLogs) return;

    // Filter real packets (TX, RX, WINLINK, AIS)
    const packetLogs = systemLogs.filter(l => l.type === 'TX' || l.type === 'RX' || l.type === 'WINLINK' || l.type === 'AIS');
    const rxCount = packetLogs.filter(l => l.type === 'RX' || l.type === 'AIS' || l.type === 'WINLINK').length;
    const txCount = packetLogs.filter(l => l.type === 'TX').length;

    setStats({
      packetsTx: txCount,
      packetsRx: rxCount,
      crcErrors: 0,
      dutyCycle: parseFloat((txCount * 0.1).toFixed(1)),
      activeBeacons: packetLogs.filter(l => l.type === 'TX' && l.payload?.includes('MET')).length,
      uptime: '1d 02h 15m'
    });

    if (systemLogs.length > lastLogLength) {
      const newEntries = systemLogs.slice(lastLogLength);
      const formattedEntries: string[] = [];
      const formattedConnEntries: string[] = [];

      newEntries.forEach(l => {
        if (l.type === 'RX' || l.type === 'TX' || l.type === 'WINLINK' || l.type === 'AIS') {
          const rxHeader = l.type === 'RX' ? '[AFSK RX]' : l.type === 'TX' ? '[AFSK TX]' : `[${l.type}]`;
          formattedEntries.push(`[DCD CH0] Portadora detectada (${l.type})...`);
          formattedEntries.push(`${rxHeader} ${l.source}>${l.destination},${l.path || 'WIDE1-1'}:${l.payload}`);
          
          // Trigger dynamic visual waveform burst on the oscilloscope canvas!
          if (l.type === 'TX') {
            setIsTxActive(true);
            setTimeout(() => setIsTxActive(false), 1200);
          } else {
            setIsDcdActive(true);
            setTimeout(() => setIsDcdActive(false), 1200);
          }
        } else if (l.type === 'SYS') {
          if (l.source === 'DIREWOLF' || l.destination === 'DIREWOLF' || l.remarks?.toLowerCase().includes('direwolf') || l.payload?.toLowerCase().includes('direwolf') || l.payload?.toLowerCase().includes('tnc')) {
            formattedConnEntries.push(`[${l.timestamp || new Date().toLocaleTimeString('es-ES')}] [DIREWOLF SYS] ${l.payload} (${l.remarks})`);
          }
        }
      });

      if (formattedEntries.length > 0) {
        setLogs(prev => [...prev, ...formattedEntries]);
      }
      if (formattedConnEntries.length > 0) {
        setConnectionLogs(prev => [...prev, ...formattedConnEntries]);
      }
    }
    setLastLogLength(systemLogs.length);
  }, [systemLogs, lastLogLength]);

  // DSP Correlator & Automatic Baud Rate Detection simulation loop
  useEffect(() => {
    let timerId: NodeJS.Timeout;

    if (!isRunning) {
      setBaudLockStatus('idle');
      setIsBaudDetecting(false);
      setDetectedBaudRate(null);
      setIncomingSignalBaud(null);
      return;
    }

    if (isTxActive) {
      // Local Tx is always coherent with the selected baudRate
      setIncomingSignalBaud(baudRate);
      setIsBaudDetecting(true);
      setBaudLockStatus('searching');

      timerId = setTimeout(() => {
        setIsBaudDetecting(false);
        setDetectedBaudRate(baudRate);
        setBaudLockStatus('locked');
      }, 400); // 400ms analysis window
    } else if (isDcdActive) {
      // Rx signal is active
      setIsBaudDetecting(true);
      setBaudLockStatus('searching');

      timerId = setTimeout(() => {
        setIsBaudDetecting(false);
        // Measure symbols and lock
        const actualIncoming = incomingSignalBaud || baudRate;
        setDetectedBaudRate(actualIncoming);
        if (actualIncoming === baudRate) {
          setBaudLockStatus('locked');
        } else {
          setBaudLockStatus('mismatch');
        }
      }, 550); // 550ms lock-in time
    } else {
      // Signal cleared
      setBaudLockStatus('idle');
      setIsBaudDetecting(false);
      setDetectedBaudRate(null);
      setIncomingSignalBaud(null);
    }

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [isDcdActive, isTxActive, baudRate, incomingSignalBaud, isRunning]);

  // Transmit Packet Routine
  const handleTransmitCustomAPRS = () => {
    if (isTxActive) return;
    setIsTxActive(true);

    const timestamp = new Date().toLocaleTimeString('es-ES');
    const formedFrame = `${srcCall}>${destCall},${path}:!${payload}`;
    
    // Play realistic AX.25 AFSK Bell 202 1200 bps packet "screech"
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
          const dBytes = encodeCallsign(destCall || 'APDW17', false);
          const sBytes = encodeCallsign(srcCall || 'EA4URS', true);
          bytes.push(...dBytes, ...sBytes);
        } catch {
          // fallback bytes if parsing fails
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
                bits.push(0); // Stuff a zero bit after five consecutive ones
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
        
        // Synthesize audio buffer
        const sampleRate = audioCtx.sampleRate;
        const currentBaudRate = baudRate; // Use state variable
        const samplesPerBit = sampleRate / currentBaudRate;
        
        let scrambledBits: number[] = [];
        if (currentBaudRate === 9600) {
          // G3RUH Scrambling: polynomial 1 + x^5 + x^17 for 9600 GMSK packet radio
          let sReg = new Uint8Array(17);
          for (let i = 0; i < 17; i++) sReg[i] = Math.random() > 0.5 ? 1 : 0;
          for (const bit of nrziBits) {
            const bScrambled = bit ^ sReg[4] ^ sReg[16];
            scrambledBits.push(bScrambled);
            for (let i = 16; i > 0; i--) {
              sReg[i] = sReg[i - 1];
            }
            sReg[0] = bScrambled;
          }
        } else {
          scrambledBits = nrziBits;
        }

        const totalSamples = Math.ceil(scrambledBits.length * samplesPerBit);
        const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
        const data = buffer.getChannelData(0);

        if (currentBaudRate === 1200) {
          // Mode A: AX.25 AFSK 1200 Baud (Bell 202 tones 1200 / 2200 Hz)
          const markFreq = 1200;  // Hz (binary 1)
          const spaceFreq = 2200; // Hz (binary 0)
          let phase = 0;
          
          for (let i = 0; i < totalSamples; i++) {
            const bitIndex = Math.floor(i / samplesPerBit);
            if (bitIndex >= scrambledBits.length) break;
            
            const isSpace = scrambledBits[bitIndex] === 1;
            const freq = isSpace ? spaceFreq : markFreq;
            
            data[i] = Math.sin(phase);
            phase += (2 * Math.PI * freq) / sampleRate;
          }
          
          // Apply realistic Narrow FM (NFM) 12.5 kHz audio channel modeling
          try {
            const temp = new Float32Array(totalSamples);
            
            // 1. Apply pre-emphasis to raw AFSK
            let lastRaw = 0;
            for (let i = 0; i < totalSamples; i++) {
              temp[i] = data[i] - 0.95 * lastRaw;
              lastRaw = data[i];
            }

            // 2. Apply de-emphasis (the receiver response)
            let deEmphasisState = 0;
            for (let i = 0; i < totalSamples; i++) {
              deEmphasisState = deEmphasisState * 0.92 + temp[i] * 0.08;
              data[i] = deEmphasisState;
            }

            // 3. Add faint analog NFM discriminator white noise floor
            for (let i = 0; i < totalSamples; i++) {
              const noise = (Math.random() * 2 - 1) * 0.015;
              data[i] = data[i] * 0.85 + noise;
            }

            // 4. Add squelch tail
            const tailSamples = Math.floor(sampleRate * 0.025);
            if (totalSamples > tailSamples) {
              for (let i = totalSamples - tailSamples; i < totalSamples; i++) {
                const ratio = (i - (totalSamples - tailSamples)) / tailSamples;
                const staticNoise = (Math.random() * 2 - 1) * 0.22;
                data[i] = data[i] * (1 - ratio) + staticNoise * ratio * Math.sin(ratio * Math.PI);
              }
            }

            // 5. Normalize
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
        } else if (currentBaudRate === 300) {
          // Mode C: AX.25 HF AFSK 300 Baud (Bell 103 / HF-APRS, mark = 2020 Hz, space = 2220 Hz, shift = 200 Hz, USB SSB)
          const markFreq = 2020;  // Hz (binary 1)
          const spaceFreq = 2220; // Hz (binary 0)
          let phase = 0;
          
          for (let i = 0; i < totalSamples; i++) {
            const bitIndex = Math.floor(i / samplesPerBit);
            if (bitIndex >= scrambledBits.length) break;
            
            const isSpace = scrambledBits[bitIndex] === 1;
            const freq = isSpace ? spaceFreq : markFreq;
            
            data[i] = Math.sin(phase);
            phase += (2 * Math.PI * freq) / sampleRate;
          }
          
          // Apply realistic HF SSB / USB 500 Hz Bandpass Filtering modeling
          try {
            const temp = new Float32Array(totalSamples);
            for (let i = 0; i < totalSamples; i++) {
              temp[i] = data[i];
            }

            // 500 Hz Bandpass Filter centered at 2120 Hz (middle of 2020 and 2220 Hz)
            const f0 = 2120;
            const bandwidth = 500;
            const w0 = (2 * Math.PI * f0) / sampleRate;
            const qFactor = f0 / bandwidth;
            const alphaFilter = Math.sin(w0) / (2 * qFactor);
            const b0 = alphaFilter;
            const b1 = 0;
            const b2 = -alphaFilter;
            const a0 = 1 + alphaFilter;
            const a1 = -2 * Math.cos(w0);
            const a2 = 1 - alphaFilter;

            const nb0 = b0 / a0;
            const nb1 = b1 / a0;
            const nb2 = b2 / a0;
            const na1 = a1 / a0;
            const na2 = a2 / a0;

            let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            for (let i = 0; i < totalSamples; i++) {
              const x0 = temp[i];
              const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
              data[i] = y0;
              x2 = x1;
              x1 = x0;
              y2 = y1;
              y1 = y0;
            }

            // Add HF ionospheric fading static hiss and atmospheric noise floor (QRN)
            let fadePhase = 0;
            for (let i = 0; i < totalSamples; i++) {
              fadePhase += (2 * Math.PI * 1.5) / sampleRate; // 1.5 Hz slow fading
              const fade = 0.75 + 0.25 * Math.sin(fadePhase);
              const staticNoise = (Math.random() * 2 - 1) * 0.045; // atmospheric background
              data[i] = data[i] * fade * 0.8 + staticNoise;
            }

            // Squelch tail release (very short since SSB is continuous)
            const tailSamples = Math.floor(sampleRate * 0.015);
            if (totalSamples > tailSamples) {
              for (let i = totalSamples - tailSamples; i < totalSamples; i++) {
                const ratio = (i - (totalSamples - tailSamples)) / tailSamples;
                const staticNoise = (Math.random() * 2 - 1) * 0.18;
                data[i] = data[i] * (1 - ratio) + staticNoise * ratio * Math.sin(ratio * Math.PI);
              }
            }

            // Normalize
            let maxVal = 0.0001;
            for (let i = 0; i < totalSamples; i++) {
              const absVal = Math.abs(data[i]);
              if (absVal > maxVal) maxVal = absVal;
            }
            for (let i = 0; i < totalSamples; i++) {
              data[i] = data[i] / maxVal;
            }
          } catch (err) {
            console.error("HF SSB/USB audio channel modeling error:", err);
          }
        } else {
          // Mode B: AX.25 GMSK 9600 Baud (FM Wide direct baseband discriminator)
          // 1. Create a raw bipolar NRZ signal from the scrambled bits (+1.0 / -1.0)
          const rawNRZ = new Float32Array(totalSamples);
          for (let i = 0; i < totalSamples; i++) {
            const bitIndex = Math.floor(i / samplesPerBit);
            if (bitIndex >= scrambledBits.length) break;
            rawNRZ[i] = scrambledBits[bitIndex] === 1 ? 1.0 : -1.0;
          }

          // 2. Pass NRZ through Gaussian pulse-shaping filter (representing BT=0.3 GMSK pulse shaping)
          // We use a normalized 7-tap Gaussian FIR filter kernel
          const gKernel = [0.06, 0.15, 0.23, 0.26, 0.23, 0.15, 0.06];
          const temp = new Float32Array(totalSamples);
          for (let i = 0; i < totalSamples; i++) {
            let sum = 0;
            for (let j = 0; j < 7; j++) {
              const idx = i - 3 + j;
              const val = (idx >= 0 && idx < totalSamples) ? rawNRZ[idx] : 0;
              sum += gKernel[j] * val;
            }
            temp[i] = sum;
          }

          // 3. For GMSK 9600, discriminator audio is directly the baseband filtered signal.
          // Add a typical high-frequency Wide FM receiver discriminator hiss/noise floor.
          for (let i = 0; i < totalSamples; i++) {
            const noise = (Math.random() * 2 - 1) * 0.07;
            data[i] = temp[i] * 0.75 + noise;
          }

          // 4. Add dynamic Wide FM squelch tail (sharp louder static burst and pop "chhhk")
          const tailSamples = Math.floor(sampleRate * 0.035);
          if (totalSamples > tailSamples) {
            for (let i = totalSamples - tailSamples; i < totalSamples; i++) {
              const ratio = (i - (totalSamples - tailSamples)) / tailSamples;
              const staticNoise = (Math.random() * 2 - 1) * 0.45;
              data[i] = data[i] * (1 - ratio) + staticNoise * ratio * Math.sin(ratio * Math.PI);
            }
          }

          // 5. Normalize
          let maxVal = 0.0001;
          for (let i = 0; i < totalSamples; i++) {
            const absVal = Math.abs(data[i]);
            if (absVal > maxVal) maxVal = absVal;
          }
          for (let i = 0; i < totalSamples; i++) {
            data[i] = data[i] / maxVal;
          }
        }
        
        // Create audio source node
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        
        // Lowpass filter to simulate analog speaker roll-off
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        // For 9600 baud GMSK we need higher cut-off frequency than 1200 baud AFSK. For HF 300 bps we set it to 3000 Hz.
        filter.frequency.value = currentBaudRate === 9600 ? 8000 : currentBaudRate === 300 ? 3000 : 3500;
        
        const gainNode = audioCtx.createGain();
        // Slightly softer gain for GMSK high speed noise to prevent irritation while remaining realistic
        gainNode.gain.setValueAtTime(currentBaudRate === 9600 ? 0.04 : 0.05, audioCtx.currentTime);
        
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        source.start();
      }
    } catch (e) {
      console.warn("Browser audio constraint:", e);
    }

    const txModeLabel = baudRate === 9600 ? 'GMSK 9600 FMW' : baudRate === 300 ? 'AFSK 300 SSB/USB' : 'AFSK 1200 FMN';
    const txBandLabel = baudRate === 300 ? 'HF' : 'VHF';

    setLogs(prev => [
      ...prev,
      `[${txBandLabel} TX] Triggering PTT RTS on sound driver port via ${pttControl}...`,
      `[${txBandLabel} TX] Transmitting AX.25 frame (${txDelay}ms pre-carrier delay mapped) [${txModeLabel}]`
    ]);

    setTimeout(() => {
      setLogs(prev => [
        ...prev,
        `[${txBandLabel} TX] Frame queued out: ${formedFrame}`,
        `[${txBandLabel} TX] Carrier released successfully. PTT deactivated.`
      ]);

      setStats(prev => ({
        ...prev,
        packetsTx: prev.packetsTx + 1
      }));

      setStatusMsg(`Éxito: Paquete AX.25 emitido en ${frequency} MHz [${baudRate === 9600 ? 'GMSK 9600' : baudRate === 300 ? 'AFSK 300 HF' : 'AFSK 1200'}]`);
      setTimeout(() => setStatusMsg(null), 3500);
      setIsTxActive(false);
    }, 1500);
  };

  const showStatusBanner = (action: string) => {
    setStatusMsg(`Acción enviada: ${action}`);
    setTimeout(() => setStatusMsg(null), 3000);
    
    const timeStr = new Date().toLocaleTimeString('es-ES');
    setLogs(prev => [...prev, `[SYSTEM] ${timeStr} - Command invoked: ${action}`]);
  };

  const handleBaudRateChange = (val: 1200 | 9600 | 300) => {
    setBaudRate(val);
    if (val === 9600) {
      setFmBandwidth('wide');
      setFrequency('432.500'); // Standard high-speed packet frequency
      setLogs(prev => [
        ...prev,
        `[SYS] Cambiando formato de modulación en Canal 0 a AX.25 GMSK 9600 Baudios`,
        `[SYS] Ancho de banda FM configurado en WIDE (25.0 kHz) para varactor directo`,
        `[SYS] Frecuencia de escucha de alta velocidad sintonizada en 432.500 MHz`
      ]);
      showStatusBanner('Modo conmutado a AX.25 GMSK 9600 Baudios (FM Wide)');
    } else if (val === 300) {
      setFmBandwidth('ssb');
      setFrequency('10.1473'); // Key frequency for HF 30m APRS USB
      setLogs(prev => [
        ...prev,
        `[SYS] Cambiando formato de modulación en Canal 0 a AX.25 BaseAFSK 300 Baudios (Bell 103)`,
        `[SYS] Modo de radio sintonizado en Banda Lateral Superior (USB SSB)`,
        `[SYS] Tono de Audio Mark: 2020 Hz, Tono Space: 2220 Hz (Separación / Shift de 200 Hz)`,
        `[SYS] Filtro paso banda de audio sintonizado a 500 Hz de ancho`,
        `[SYS] Frecuencia de canal de RF HF asignada en 10.1473 MHz USB`
      ]);
      showStatusBanner('Modo conmutado a HF AX.25 300 Baudios USB (10.1473 MHz)');
    } else {
      setFmBandwidth('narrow');
      setFrequency('144.800'); // Standard APRS frequency
      setLogs(prev => [
        ...prev,
        `[SYS] Cambiando formato de modulación en Canal 0 a AX.25 AFSK 1200 Baudios`,
        `[SYS] Ancho de banda FM configurado en NARROW (12.5 kHz) con pre/de-emphasis`,
        `[SYS] Frecuencia estándar APRS sintonizada en 144.800 MHz`
      ]);
      showStatusBanner('Modo conmutado a AX.25 AFSK 1200 Baudios (FM Narrow)');
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-slate-100 flex flex-col gap-0" id="direwolf-pillar-exclusive-interactive-console">
      
      {/* HEADER SECTION */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className="bg-emerald-950/40 border border-emerald-500/20 p-2.5 rounded-xl text-emerald-400 h-11 w-11 flex items-center justify-center shrink-0">
            <Radio size={24} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-emerald-400">
                Pilar Radio: Servidor TNC Direwolf Core
              </h2>
              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold tracking-tight">
                V1.7.3 DEV
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-tight">
              Módem software TNC de modulación AFSK y enrutador de paquetes APRS AX.25
            </p>
          </div>
        </div>

        {/* Daemon State & Switcher */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800/80 flex items-center gap-3">
            <span className="text-[9px] text-slate-500 uppercase font-black font-mono">TNC Socket State:</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
              <span className={`font-mono text-[10px] font-bold ${isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                {isRunning ? 'DIREWOLF_ONLINE' : 'DIREWOLF_STOPPED'}
              </span>
            </div>
          </div>

          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
            <span className="text-[9px] text-slate-500 uppercase font-black font-mono">Modo:</span>
            <span className="font-mono text-[10px] font-bold text-red-450 text-red-400 uppercase">
              REAL (Sistemas Locales)
            </span>
          </div>
          
          <button 
            onClick={() => {
              setIsRunning(!isRunning);
              showStatusBanner(isRunning ? 'Parada de servicio direwolf.service' : 'Arranque de servicio direwolf.service');
            }}
            className={`px-3 py-1.5 text-xs font-bold font-sans rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              isRunning ? 'bg-red-950/30 text-red-400 border border-red-500/30 hover:bg-red-900/20' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-extrabold'
            }`}
          >
            <Play size={10} />
            {isRunning ? 'Apagar TNC' : 'Iniciar TNC'}
          </button>
        </div>
      </div>

      {/* QUICK ACTIONS BAR & SUBTAB NAVIGATION */}
      <div className="bg-slate-900/30 border-b border-slate-850 p-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Navigation tabs within the Direwolf controller */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button 
            onClick={() => setActiveTab('tnc')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tnc' ? 'bg-emerald-400 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Terminal size={13} />
            Consola TNC
          </button>
          
          <button 
            onClick={() => setActiveTab('metrics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'metrics' ? 'bg-emerald-400 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <BarChart3 size={13} />
            Estadísticas y Tráfico
          </button>

          <button 
            onClick={() => setActiveTab('ax25')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'ax25' ? 'bg-emerald-400 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Send size={13} />
            Inyector AX.25 Manual
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'settings' ? 'bg-emerald-400 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Sliders size={13} />
            Hardware & Puertos
          </button>
        </div>

        {/* Tune Frequency tuner, dynamic action inside status bar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden h-7 text-[11px] font-mono shrink-0">
            <span className="bg-slate-900 border-r border-slate-800 px-2 text-slate-500 font-bold uppercase flex items-center h-full">Canal RF:</span>
            <select
              value={frequency}
              onChange={(e) => {
                setFrequency(e.target.value);
                showStatusBanner(`Cambio de canal RF de sintonización a ${e.target.value} MHz`);
              }}
              className="bg-black text-amber-400 px-2 py-0.5 outline-none font-bold h-full cursor-pointer focus:ring-0"
            >
              <option value="144.800">144.800 MHz (APRS EU VHF)</option>
              <option value="144.390">144.390 MHz (APRS NA VHF)</option>
              <option value="432.500">432.500 MHz (APRS GMSK 9600)</option>
              <option value="10.1473">10.1473 MHz (APRS HF SSB/USB)</option>
              <option value="145.825">145.825 MHz (APRS ISS Satélite)</option>
            </select>
          </div>
          
          <button 
            onClick={() => showStatusBanner('Sincronizando reloj militar GPSD contra satélites')}
            className="p-1 px-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded text-xs font-bold flex items-center gap-1 transition-all cursor-pointer h-7"
          >
            <RefreshCw size={11} className="text-emerald-400" />
            Sinc GPS
          </button>
        </div>

      </div>

      {statusMsg && (
        <div className="bg-emerald-950/85 border-b border-emerald-500/20 p-2 text-center text-xs text-emerald-450 text-emerald-400 font-mono font-bold animate-pulse">
          ✓ {statusMsg}
        </div>
      )}

      {/* CORE INNER SUB-VIEWS */}
      <div className="p-4 flex-1">
        
        {/* SUBTAB 1: TNC REALTIME AUDIT & CHANNEL VISUALIZER */}
        {activeTab === 'tnc' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 animate-fade-in">
            
            {/* Embedded Active TNC Logs Terminal (cols: 8) */}
            <div className="xl:col-span-8 bg-black border border-slate-800 p-4 rounded-xl relative overflow-hidden flex flex-col justify-between min-h-[350px]">
              {/* Scanline CRT aesthetic overlay */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-emerald-500/5 shadow-[0_0_12px_2px_rgba(16,185,129,0.1)] pointer-events-none animate-pulse" />
              
              <div className="flex items-center justify-between border-b border-emerald-950/30 pb-2 mb-3 font-mono text-[11px] text-emerald-400 font-black shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                  <span>KISS MODULATION LOGS • FREQ {frequency} MHZ</span>
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
                          body: JSON.stringify({ service: 'direwolf' })
                        });
                      } catch (err) {
                        console.error('Error clearing direwolf logs:', err);
                      }
                    }}
                    type="button"
                    className="text-red-400 hover:text-red-300 text-[9.5px] font-mono font-bold cursor-pointer transition-colors mr-2 uppercase"
                    title="Limpiar logs de Direwolf"
                  >
                    [Limpiar Logs]
                  </button>
                  <span>SQUELCH Threshold: {squelch}dB</span>
                  <span className="text-slate-600">baud rate: 1200</span>
                </div>
              </div>

              {/* Subtabs to separate system status and packet traffic logs */}
              <div className="flex items-center gap-2 mb-2.5 bg-slate-950 p-1 rounded-lg border border-slate-900 self-start">
                <button
                  onClick={() => setTerminalTab('traffic')}
                  className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                    terminalTab === 'traffic'
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  📟 TRÁFICO DE PAQUETES (AFSK)
                </button>
                <button
                  onClick={() => setTerminalTab('connection')}
                  className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                    terminalTab === 'connection'
                      ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  🔌 ESTADO DEL DEMONIO TNC
                </button>
              </div>

              {/* Scrollable logs terminal */}
              <div className="flex-1 bg-[#050505] p-3 rounded-lg border border-emerald-955/20 h-[220px] overflow-y-auto space-y-1.5 font-mono text-[10.5px] scrollbar-thin scrollbar-thumb-slate-900 flex flex-col justify-between">
                <div>
                  {terminalTab === 'traffic' ? (
                    logs.length === 0 ? (
                      <div className="text-slate-500 flex flex-col items-center justify-center py-14 gap-2 text-center select-none">
                        <span className="animate-pulse text-emerald-400 font-extrabold text-[11px] tracking-wider uppercase">Waiting for data...</span>
                        <span className="text-[9.5px] text-slate-600 font-medium">No se han decodificado paquetes de radio por AFSK aún.</span>
                      </div>
                    ) : (
                      logs.slice(-30).map((logLine, idx) => (
                        <div key={idx} className="leading-relaxed flex items-start gap-1">
                          <span className="text-emerald-900 select-none font-bold shrink-0">❖</span>
                          <span className={
                            logLine.startsWith('[VHF TX]') ? 'text-amber-400 font-bold' :
                            logLine.startsWith('[AFSK RX]') || logLine.startsWith('[VHF RX]') ? 'text-emerald-400 font-semibold' :
                            logLine.startsWith('[DCD CH0]') ? 'text-cyan-400 font-black' :
                            logLine.includes('[OK]') ? 'text-emerald-500 font-extrabold' : 
                            logLine.includes('[INFO]') ? 'text-indigo-400' : 'text-slate-400'
                          }>
                            {logLine}
                          </span>
                        </div>
                      ))
                    )
                  ) : (
                    connectionLogs.length === 0 ? (
                      <div className="text-slate-500 flex flex-col items-center justify-center py-14 gap-2 text-center select-none">
                        <span className="text-indigo-400 font-extrabold text-[11px] tracking-wider uppercase">Sin eventos de TNC</span>
                        <span className="text-[9.5px] text-slate-600 font-medium">No se han registrado eventos de estado del TNC Direwolf.</span>
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
                    Pila de datos modulando tramas AX.25 en micro-tono...
                  </div>
                )}
              </div>

              {/* Terminal indicator metrics footer */}
              <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono text-slate-400 gap-2 shrink-0">
                <span className="flex items-center gap-1"><Cpu size={11} className="text-indigo-400" /> ALSA Kernel Driver: active on 144.800 MHz</span>
                <span className="bg-emerald-950/50 border border-emerald-800/30 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  AX25 CRC CHECKSUM: AUTO-FORCE
                </span>
              </div>
            </div>

            {/* Micro VU-Meter, Calibration controls on side column (cols: 4) */}
            <div className="xl:col-span-4 flex flex-col gap-3.5">
              
              {/* ALSA Line in visualizer */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 flex flex-col justify-between font-mono gap-3.5">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-800 pb-1.5">
                  AUDIO LINE-IN CALIBRATION
                </span>

                {/* Level VU Meter and Slider */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Volume2 size={13} className="text-emerald-400" /> NIVEL DE ENTRADA ALSA
                    </span>
                    <span className="text-emerald-400 font-black">{inputVolume} / 100</span>
                  </div>

                  {/* VU Meter representation bar */}
                  <div className="grid grid-cols-10 gap-0.5 h-3 bg-slate-900 rounded overflow-hidden p-0.5 border border-slate-800">
                    {Array.from({ length: 10 }).map((_, i) => {
                      const threshold = (i + 1) * 10;
                      const isActive = inputVolume >= threshold;
                      let colorClass = 'bg-slate-950';
                      if (isActive) {
                        if (threshold <= 60) colorClass = 'bg-emerald-500';
                        else if (threshold <= 80) colorClass = 'bg-yellow-500';
                        else colorClass = 'bg-red-500 animate-ping';
                      }
                      return <div key={i} className={`h-full rounded-sm transition-colors duration-200 ${colorClass}`} />;
                    })}
                  </div>

                  {/* Manual inputVolume Slider control */}
                  <input 
                    type="range" 
                    min={10} 
                    max={100} 
                    value={inputVolume}
                    onChange={(e) => setInputVolume(parseInt(e.target.value))}
                    className="w-full accent-emerald-400 bg-slate-800 h-1 rounded outline-none cursor-pointer mt-1"
                  />

                  <div className="flex items-center justify-between text-[8.5px] text-slate-500">
                    <span>MÍN (10)</span>
                    <span className="text-emerald-500 font-bold">AJUSTE MANUAL</span>
                    <span>MÁX (100)</span>
                  </div>
                </div>

                {/* AGC Hardware Switch & Gain indicator */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Cpu size={13} className="text-indigo-400" /> CONTROL DE GANANCIA (AGC)
                    </span>
                    <button
                      onClick={() => setAgcEnabled(!agcEnabled)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all border cursor-pointer ${
                        agcEnabled 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}
                    >
                      {agcEnabled ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] mt-1">
                    <span className="text-slate-500">Atenuación/Ganancia AGC:</span>
                    <span className={`font-bold font-mono ${agcEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {agcEnabled 
                        ? `${(20 * Math.log10(48 / Math.max(1, inputVolume))).toFixed(1)} dB` 
                        : '0.0 dB (Fijo)'}
                    </span>
                  </div>

                  <div className="text-[8.5px] text-slate-500 leading-normal">
                    {agcEnabled 
                      ? '✓ Normaliza automáticamente balizas de baja y alta señal para evitar saturación en el osciloscopio.'
                      : '✗ Ganancia fija de 0 dB. El tamaño del trazo en el osciloscopio fluctuará directamente con el volumen.'}
                  </div>
                </div>

                {/* Squelch Control */}
                <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[10px]">
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Hardware Squelch:</span>
                    <span className="font-bold text-amber-400">{squelch} dB</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={50} 
                    value={squelch}
                    onChange={(e) => setSquelch(parseInt(e.target.value))}
                    className="w-full accent-emerald-400 bg-slate-800 h-1 rounded outline-none cursor-pointer"
                  />
                  <span className="text-[8.5px] text-slate-500 block">Squelch suprime audios débiles para filtrar ruidos espurios de VHF.</span>
                </div>
              </div>

              {/* Hardware DCD & PTT indicators */}
              <div className="bg-slate-905 bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 font-mono">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5">
                  TNC HARDWARE COUPLER STATUS
                </span>

                <div className="grid grid-cols-2 gap-2">
                  
                  <div className="bg-slate-900/50 p-2.5 rounded border border-slate-850 flex flex-col justify-center items-center text-center gap-1">
                    <span className="text-[8.5px] text-slate-400 uppercase">Carrier (DCD)</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${isDcdActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-slate-800'}`} />
                      <span className={`font-bold text-[10px] ${isDcdActive ? 'text-green-400' : 'text-slate-500'}`}>
                        {isDcdActive ? 'DETECTADO' : 'SILENCIO'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 p-2.5 rounded border border-slate-850 flex flex-col justify-center items-center text-center gap-1">
                    <span className="text-[8.5px] text-slate-400 uppercase">Transmit (PTT)</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${isTxActive ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-slate-800'}`} />
                      <span className={`font-bold text-[10px] ${isTxActive ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                        {isTxActive ? 'TX ACTIVA' : 'STANDBY'}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Force transmitter warning test button */}
                <button
                  disabled={isTxActive}
                  onClick={handleTransmitCustomAPRS}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-emerald-500/30 hover:border-emerald-400 text-emerald-400 font-sans font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                >
                  <Activity size={12} className={isTxActive ? 'animate-spin' : ''} />
                  Emitir Baliza de Emergencia VHF
                </button>
              </div>

              {/* Coherence & Auto-Baud Detection status */}
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 font-mono">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5 flex items-center justify-between">
                  <span>DETECTOR DE BAUDIOS (DSP)</span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] bg-slate-900 text-cyan-400 border border-cyan-500/20">AUTO-DSP</span>
                </span>

                {/* State based rendering */}
                {baudLockStatus === 'idle' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-400">
                      <div className="h-2 w-2 rounded-full bg-slate-700 animate-pulse" />
                      <span className="text-xs font-bold">ESPERANDO SEÑAL (HISS)</span>
                    </div>
                    <div className="h-1 bg-slate-900 rounded overflow-hidden relative">
                      <div className="absolute inset-y-0 left-0 w-1/3 bg-slate-800 rounded animate-pulse" />
                    </div>
                    <p className="text-[8.5px] text-slate-500 leading-normal">
                      Demodulador en escucha pasiva. El analizador de transiciones espectrales medirá la tasa de símbolos automáticamente cuando se detecte una portadora entrante.
                    </p>
                  </div>
                )}

                {baudLockStatus === 'searching' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-cyan-400">
                      <span className="animate-spin text-xs">⚙️</span>
                      <span className="text-xs font-bold animate-pulse">SINCRO EN PROGRESO...</span>
                    </div>
                    {/* Animated Progress bar */}
                    <div className="h-1 bg-slate-900 rounded overflow-hidden relative">
                      <div className="absolute inset-y-0 left-0 h-full bg-cyan-400 rounded animate-pulse" style={{ width: '65%' }} />
                    </div>
                    <p className="text-[8.5px] text-cyan-500 leading-normal">
                      Midiendo intervalos de cruce por cero y correlación de bit-rate... (PLL phase locking).
                    </p>
                  </div>
                )}

                {baudLockStatus === 'locked' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                        <span className="text-xs font-bold">✓ SEÑAL COHERENTE</span>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-black">
                        {detectedBaudRate} BPS
                      </span>
                    </div>
                    
                    <div className="bg-slate-900/40 p-2 rounded border border-slate-900 space-y-1 text-[9px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Modulación Detectada:</span>
                        <span className="font-bold text-slate-200">
                          {detectedBaudRate === 9600 ? 'GMSK (9600 bps)' : detectedBaudRate === 300 ? 'Bell 103 (300 bps HF)' : 'Bell 202 (1200 bps VHF)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Parámetros de Modo:</span>
                        <span className="font-bold text-emerald-400">AJUSTE CORRECTO</span>
                      </div>
                    </div>
                    <p className="text-[8.5px] text-slate-500 leading-normal">
                      La tasa de símbolos de la señal entrante coincide perfectamente con la modulación y baudios configurados en el demodulador.
                    </p>
                  </div>
                )}

                {baudLockStatus === 'mismatch' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-400">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-ping" />
                        <span className="text-xs font-bold animate-pulse">⚠️ CONFLICTO DE BAUDIOS</span>
                      </div>
                      <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-black">
                        {detectedBaudRate} BPS DETECTADO
                      </span>
                    </div>

                    <div className="bg-red-950/20 p-2.5 rounded border border-red-900/30 space-y-1.5 text-[9px] text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tasa en el Canal:</span>
                        <span className="font-black text-red-400">{detectedBaudRate} bps</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Configurado actual:</span>
                        <span className="font-bold text-slate-450 text-red-300">{baudRate} bps</span>
                      </div>
                      <p className="text-[8px] text-red-400 leading-normal font-sans pt-1 border-t border-red-950/30">
                        La modulación de la portadora entrante no coincide con los parámetros seleccionados en su estación.
                      </p>
                    </div>

                    {/* Auto-tune action button */}
                    <button
                      onClick={() => {
                        if (detectedBaudRate) {
                          handleBaudRateChange(detectedBaudRate);
                        }
                      }}
                      className="w-full py-1.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/40 hover:border-red-400 text-red-400 rounded-lg text-[9.5px] font-black transition-all cursor-pointer flex items-center justify-center gap-1 uppercase"
                    >
                      <RefreshCw size={10} className="animate-spin-slow" />
                      AUTO-ACOPLAR A {detectedBaudRate} BPS
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* SUBTAB 2: HISTORICAL PACKET METRICS CHARTS */}
        {activeTab === 'metrics' && (
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fade-in flex flex-col gap-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-emerald-450 text-emerald-450" size={16} />
                <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100">
                  Eficiencia y Tráfico del Enrutador Direwolf (Últimas 24h)
                </h3>
              </div>

              {/* Status summary figures */}
              <div className="flex items-center gap-4 text-[10px] font-mono text-slate-405 text-slate-400">
                <div>CRC ERRORS: <span className="font-bold text-red-400">{stats.crcErrors} pkts</span></div>
                <div>AVG DUTY CYCLE: <span className="font-bold text-emerald-400">{stats.dutyCycle}%</span></div>
                <div>ACTIVE GATEWAYS: <span className="font-bold text-amber-400">{stats.activeBeacons}</span></div>
              </div>
            </div>

            {/* Recharts graph of incoming packets/noise ratios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Packet decode rate area chart */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">VOLUMEN DE PAQUETES DECODIFICADOS (pkts / hora)</span>
                <div className="h-[210px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <AreaChart data={graphData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="glowDecode" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                      <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                      <YAxis stroke="#4b5563" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="packetRate" name="Tasa de Recepción" stroke="#10b981" fillOpacity={1} fill="url(#glowDecode)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Decode success efficiency lines */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">PRECISIÓN DE CRC & NIVEL DE RUIDO (dB)</span>
                <div className="h-[210px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                    <LineChart data={graphData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                      <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                      <YAxis stroke="#4b5563" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="decodeSuccess" name="Decodificado Exitoso %" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="noiseFloor" name="Nivel Ruido Base (dB)" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 border-dashed text-[10.5px] font-sans text-slate-400">
              💡 <strong>Enrutamiento Estático:</strong> Direwolf actúa de forma conjunta con el enrutador APRX para inyectar paquetes recibidos directamente sobre la infraestructura general y base de datos, garantizando una topología híbrida redundante de comunicaciones críticas de defensa civil.
            </div>

          </div>
        )}

        {/* SUBTAB 3: MANUAL AX.25 PACKET BUILDER INJECTOR */}
        {activeTab === 'ax25' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-fade-in font-mono text-[11px]">
            
            {/* Packet inputs and parameters (cols: 5) */}
            <div className="md:col-span-5 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 space-y-3">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
                <Send size={12} className="text-emerald-400" /> Parámetros AX.25 (Header Frame)
              </span>

              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Callsign Origen:</label>
                    <input 
                      type="text" 
                      value={srcCall}
                      onChange={(e) => setSrcCall(e.target.value.toUpperCase())}
                      className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Callsign Destino:</label>
                    <input 
                      type="text" 
                      value={destCall}
                      onChange={(e) => setDestCall(e.target.value.toUpperCase())}
                      className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-slate-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Modulación y Baudios:</label>
                    <select
                      value={baudRate}
                      onChange={(e) => handleBaudRateChange(parseInt(e.target.value, 10) as 1200 | 9600 | 300)}
                      className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-emerald-400"
                    >
                      <option value={1200}>1200 bps (AFSK Bell 202)</option>
                      <option value={9600}>9600 bps (GMSK G3RUH)</option>
                      <option value={300}>300 bps (AFSK Bell 103 HF)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Ancho de Banda / Modo Radio:</label>
                    <select
                      value={fmBandwidth}
                      onChange={(e) => setFmBandwidth(e.target.value as 'narrow' | 'wide' | 'ssb')}
                      className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-slate-300"
                    >
                      <option value="narrow">Narrow FM (12.5 kHz)</option>
                      <option value="wide">Wide FM (25.0 kHz)</option>
                      <option value="ssb">USB SSB (~500 Hz BPF)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Enrutamiento APRS (Path):</label>
                  <input 
                    type="text" 
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-bold text-slate-300"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-slate-400 block uppercase font-bold mb-0.5">Información / Telepatía Payload:</label>
                  <textarea 
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    rows={2}
                    className="w-full bg-black border border-slate-800 rounded-lg p-1.5 px-2.5 outline-none font-sans text-xs text-slate-200 resize-none"
                    placeholder="Escriba el payload del beacon..."
                  />
                </div>

                <div className="pt-1.5">
                  <button 
                    onClick={handleTransmitCustomAPRS}
                    disabled={isTxActive || !isRunning}
                    className="w-full py-2 bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
                  >
                    <Send size={11} />
                    Inyectar y Modular {baudRate === 9600 ? 'GMSK 9600' : baudRate === 300 ? 'AFSK 300 HF' : 'AFSK 1200'} (Emitir RF)
                  </button>
                </div>
              </div>
            </div>

            {/* Simulated Live Radio Spectrum output display (cols: 7) */}
            <div className="md:col-span-7 bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3">
              <span className="text-slate-550 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5 flex items-center justify-between">
                <span>DEMODULADOR DE RADIOFANS Y OSCILADOR SÍNCRO</span>
                <span className="text-[8.5px] bg-emerald-950/40 text-emerald-400 px-1.5 rounded font-bold">
                  {baudRate === 9600 ? '9600 BPS GMSK • CH0 (WIDE)' : baudRate === 300 ? '300 BPS HF-AFSK • CH0 (USB)' : '1200 BPS AFSK • CH0 (NARROW)'}
                </span>
              </span>

              {/* Dual Visualizer Grid: Oscilloscope & Spectrum Analyzer */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* Real-time Oscilloscope */}
                <div className="h-[135px] bg-black rounded-lg border border-slate-900 relative overflow-hidden">
                  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

                  {/* Overlaid status banner */}
                  <div className="absolute top-2 left-3 text-[9px] text-slate-400 font-mono tracking-wider flex items-center gap-1.5 z-10 bg-black/75 px-2 py-0.5 rounded border border-slate-900/40">
                    <span className={`h-1.5 w-1.5 rounded-full ${isTxActive ? 'bg-amber-400 animate-ping' : isDcdActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-700'}`} />
                    <span>
                      {isTxActive 
                        ? `PTT ACTIVE: 3.2W RF OUTPUT [${baudRate === 9600 ? 'GMSK 9600 FMW' : baudRate === 300 ? 'AFSK 300 SSB/USB' : 'AFSK 1200 FMN'}]` 
                        : isDcdActive 
                          ? `SIGNAL SYNCH ACTIVE: LOCK ON [${baudRate === 9600 ? 'GMSK 9600' : baudRate === 300 ? 'AFSK 300 HF' : 'AFSK 1200'}]` 
                          : 'OSCILLOSCOPE: CARRIER ABSENT'}
                    </span>
                  </div>
                </div>

                {/* Real-time FFT Spectrum Analyzer */}
                <div className="h-[135px] bg-black rounded-lg border border-slate-900 relative overflow-hidden">
                  <canvas ref={spectrumCanvasRef} className="absolute inset-0 w-full h-full block" />

                  {/* Overlaid status banner */}
                  <div className="absolute top-2 right-3 text-[9px] text-slate-400 font-mono tracking-wider flex items-center gap-1.5 z-10 bg-black/75 px-2 py-0.5 rounded border border-slate-900/40">
                    <span>ANCHO DE BANDA: {baudRate === 9600 ? '25.0 kHz (WIDE)' : baudRate === 300 ? '500 Hz (HF SSB)' : '12.5 kHz (NARROW)'}</span>
                  </div>
                </div>
              </div>

              {/* Informative help note */}
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-900 leading-normal text-slate-400 text-[10px]">
                {baudRate === 9600 ? (
                  <>
                    <span className="text-cyan-400 font-extrabold block mb-0.5">Especificación AX.25 GMSK 9600 Baudios (Wide FM):</span>
                    Modo de alta velocidad que utiliza modulación por desplazamiento de fase mínima Gaussiana (GMSK) y aleatorización (scrambling) G3RUH. Al suprimir subportadoras, los datos de 9600 bps se inyectan directamente sobre el modulador de FM de banda ancha (Wide FM, 25 kHz), logrando una transferencia de datos de alto rendimiento e inmunidad al ruido.
                  </>
                ) : baudRate === 300 ? (
                  <>
                    <span className="text-emerald-400 font-extrabold block mb-0.5">Especificación AX.25 BaseAFSK (Bell 103) 300 Baudios (HF SSB/USB):</span>
                    Modulación estándar para bandas de HF (como la frecuencia de 10.1473 MHz USB en la banda de 30m). Utiliza modulación por desplazamiento de frecuencia de audio (AFSK) a 300 bps con tonos de audio en 2020 Hz (Mark) y 2220 Hz (Space), resultando en un Shift de 200 Hz. El canal de banda lateral única (SSB/USB) opera con un filtro paso banda estrecho de ~500 Hz para maximizar la relación señal/ruido (SNR) bajo ruido atmosférico (QRN) y desvanecimiento selectivo (Fading).
                  </>
                ) : (
                  <>
                    <span className="text-amber-500 font-extrabold block mb-0.5">Especificación AX.25 AFSK 1200 Baudios (Narrow FM):</span>
                    Las tramas utilizan un campo de cabecera con llamada de origen y destino codificado en SSID base (7 bits por octeto). El protocolo se monta sobre AFSK modulando tonos de portadora de audio de 1200 bps (Bell 202, 1200/2200 Hz) sobre FM estrecha (Narrow FM, 12.5 kHz), permitiendo alcance radial de contingencia.
                  </>
                )}
              </div>

            </div>

          </div>
        )}

        {/* SUBTAB 4: HARDWARE ADJUSTMENTS AND NETWORK SOCKETS */}
        {activeTab === 'settings' && (
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fade-in flex flex-col gap-4">
            
            <div className="border-b border-slate-800 pb-2.5">
              <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100 flex items-center gap-2">
                <Settings size={14} className="text-emerald-400" />
                Ajustes de Interfaz Física, Sockets KISS y TNC Virtual
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-[11px]">
              
              {/* Box 1: Sockets configurations */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col gap-3">
                <span className="text-emerald-400 hover:text-emerald-350 font-bold block uppercase border-b border-slate-900 pb-1 flex items-center gap-1"><Server size={12} /> Interfaces KISS TCP</span>
                
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400">Puerto de Escucha Direwolf:</span>
                    <div className="bg-slate-900 rounded p-1.5 font-bold text-slate-205 flex items-center justify-between border border-slate-850">
                      <span>KISS PORT (TCP)</span>
                      <span className="text-amber-400">8001</span>
                    </div>
                  </div>
                  
                  <div className="bg-slate-900/40 border border-slate-900 p-2 text-[10px] text-slate-400 leading-relaxed rounded">
                    Soporta múltiples clientes multas simultáneos como aprx, xastir, YAAC o UI-View32 inyectando sobre tramas KISS estándar de bytes en crudo.
                  </div>
                </div>
              </div>

              {/* Box 2: Calibration parameters */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-emerald-400 font-bold block uppercase border-b border-slate-905 pb-1 flex items-center gap-1 border-slate-900"><Sliders size={12} /> Tiempos de Retardo RF (TX)</span>
                  
                  <div className="space-y-2 mt-2">
                    <div className="flex justify-between items-center text-slate-400 leading-none">
                      <span>TX Delay (preámbulo):</span>
                      <span className="font-bold text-slate-205 text-slate-200">{txDelay} ms</span>
                    </div>
                    <input 
                      type="range" 
                      min={50} 
                      max={600} 
                      step={10}
                      value={txDelay}
                      onChange={(e) => setTxDelay(parseInt(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer text-xs"
                    />

                    <div className="flex justify-between items-center text-slate-400 leading-none pt-2">
                      <span>TX Tail (tiempo de cola):</span>
                      <span className="font-bold text-slate-200">{txTail} ms</span>
                    </div>
                    <input 
                      type="range" 
                      min={10} 
                      max={200} 
                      step={10}
                      value={txTail}
                      onChange={(e) => setTxTail(parseInt(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer text-xs"
                    />
                  </div>
                </div>

                <span className="text-[9px] text-slate-500 block leading-tight">
                  Valores típicos para transceptores FM estándar: TXD 250ms garantiza apertura segura del squelch externo.
                </span>
              </div>

              {/* Box 3: PTT hardware link control */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col justify-between gap-3">
                <div>
                  <span className="text-emerald-400 font-bold block uppercase border-b border-slate-905 pb-1 flex items-center gap-1 border-slate-900"><Sliders size={12} /> Línea de Control PTT</span>
                  
                  <div className="space-y-2 mt-2">
                    <label className="text-[10px] text-slate-400 block font-bold">Modo de conmutación física:</label>
                    <select 
                      value={pttControl}
                      onChange={(e) => {
                        setPttControl(e.target.value);
                        showStatusBanner(`Línea PTT configurada en: ${e.target.value}`);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 outline-none font-bold text-slate-200"
                    >
                      <option value="/dev/ttyUSB0 RTS">Serial /dev/ttyUSB0 RTS Line</option>
                      <option value="/dev/ttyUSB0 DTR">Serial /dev/ttyUSB0 DTR Line</option>
                      <option value="GPIO 25">Raspberry Pi GPIO Pin 25</option>
                      <option value="VOX">VOX Automático por Detección de Audio</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-950 text-[9.5px] text-slate-450 text-slate-400 leading-normal">
                  PTT conmutará la portadora de radio actuando sobre el circuito transistorizado acoplado a la línea seleccionada.
                </div>
              </div>

            </div>

            {/* Clients currently connected list info block */}
            <div className="bg-slate-950 border border-slate-900 rounded-lg p-3">
              <span className="font-mono text-[10px] text-slate-500 uppercase block mb-2 font-bold tracking-widest">SOCKET KISS ACTIVOS (CLIENTES CONECTADOS EN TIEMPO REAL)</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 font-mono text-[10.5px]">
                {kissClients.map((client, idx) => (
                  <div key={idx} className="bg-slate-900/40 p-2.5 rounded border border-slate-850 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      <div>
                        <p className="font-bold text-slate-250 text-slate-200">{client.app}</p>
                        <p className="text-[9.5px] text-slate-500">Conexión local: Port {client.port} • TCP Loopback</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className="bg-slate-950 px-2 py-0.5 rounded text-[10px] font-bold text-emerald-400 border border-slate-850">
                        {client.packets} pkts
                      </span>
                      <p className="text-[9px] text-slate-500 mt-1">Conectado: {client.connectedSince}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
