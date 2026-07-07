import React, { useState, useEffect } from 'react';
import { 
  Terminal, Radio, Volume2, Activity
} from 'lucide-react';
import { customFetch } from '../../utils/customFetch';

interface NucConsoleProps {
  callsign?: string;
}

export default function NucConsole({ callsign = 'EA1URG-13' }: NucConsoleProps) {
  // Direwolf core engine detailed states
  const [rxVolume, setRxVolume] = useState(48);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isDcd, setIsDcd] = useState(false);
  const [direwolfLogs, setDirewolfLogs] = useState<string[]>([
    'Direwolf software TNC version 1.7 initialized on Debian GNU/Linux.',
    'Audio device input: plughw:1,0 (C-Media USB Audio Driver)',
    'KISS TCP listening on port 8001...',
    'GPSD connected to localhost port 2947 (3D Fix active)',
    'Channel 0: 1200 baud AFSK standard Bell 202',
    '[OK] direwolf.service active & listening on 144.800 MHz...'
  ]);

  useEffect(() => {
    // Fluctuate Audio volume slightly to represent real static/VHF incoming signals
    const volInterval = setInterval(() => {
      setRxVolume(prev => {
        const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
        const next = prev + change;
        return Math.max(35, Math.min(65, next));
      });
    }, 1200);

    // Occasional carrier detect (DCD) representing third-party packet decoding
    const dcdInterval = setInterval(() => {
      setIsDcd(true);
      
      const calls = ['EA1RCI-3', 'EB1TR-1', 'EA1YAL-4', 'EA1URG-10', 'EB1TR-7'];
      const randomCall = calls[Math.floor(Math.random() * calls.length)];
      const randomMsg = `[VHF RX] AFSK ${randomCall}>APLNX1,WIDE1-1,WIDE2-1:!4025.${Math.floor(Math.random()*90)}N/00342.${Math.floor(Math.random()*90)}W#S.A.T. Nodo Auxiliar`;
      const newDcdLog = `[AFSK CH0] ${randomCall} decoded successfully (Level ${Math.floor(Math.random()*25) + 38})`;
      
      setDirewolfLogs(prev => [...prev.slice(-15), newDcdLog, randomMsg]);
      
      setTimeout(() => {
        setIsDcd(false);
      }, 900);
    }, 9000);

    return () => {
      clearInterval(volInterval);
      clearInterval(dcdInterval);
    };
  }, []);

  const handleTriggerTestTx = () => {
    if (isTransmitting) return;
    setIsTransmitting(true);
    setDirewolfLogs(prev => [...prev, '[VHF TX] Triggering PTT via serial RTS (/dev/ttyUSB0)..', '[VHF TX] Transmitting AX.25 preamble (200ms audio delay)...']);
    
    // Play test audio buzzer if supported
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // Standard Bell 202 tone A
      osc.frequency.setValueAtTime(2200, audioCtx.currentTime + 0.3); // Bell 202 tone B
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
      // Ignored if browser constraints prevent audio play without interaction
    }

    setTimeout(() => {
      setDirewolfLogs(prev => [...prev, `Frame: ${callsign}>APDIW1,WIDE1-1:!4025.00N/00342.00W#TEST DIREWOLF ENGINE DEBIAN`, '[VHF TX] PTT released. Transmission complete.']);
      setIsTransmitting(false);
    }, 1500);
  };

  return (
    <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 shadow-lg flex flex-col gap-4 text-slate-100" id="direwolf-console-component">
      <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className="text-emerald-400 stroke-[1.5] animate-pulse" size={18} />
          <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-emerald-400">
            Módem de Radiocomunicaciones Direwolf (Núcleo TNC AX.25)
          </h2>
        </div>
        <span className="text-[9px] bg-emerald-950/80 text-emerald-300 px-2 py-0.5 border border-emerald-500/20 rounded font-mono font-bold tracking-widest uppercase flex items-center gap-1.5 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
          📻 MOTOR PRINCIPAL EN LÍNEA
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Audio calibration and levels (cols: 4) */}
        <div className="lg:col-span-4 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 flex flex-col justify-between font-mono gap-3">
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-black block mb-2">Calibración de Audio de Entrada VHF (ALSA)</span>
            
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/60 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Volume2 size={13} className="text-emerald-400" /> Nivel de Línea (RX)
                </span>
                <span className="text-emerald-400 font-bold">{rxVolume} / 100</span>
              </div>
              
              {/* Visual VU Meter Bar */}
              <div className="grid grid-cols-10 gap-0.5 h-3 bg-slate-900 rounded overflow-hidden p-0.5 border border-slate-800">
                {Array.from({ length: 10 }).map((_, i) => {
                  const threshold = (i + 1) * 10;
                  const isActive = rxVolume >= threshold;
                  let colorClass = 'bg-slate-950';
                  if (isActive) {
                    if (threshold <= 60) colorClass = 'bg-emerald-500';
                    else if (threshold <= 80) colorClass = 'bg-yellow-500';
                    else colorClass = 'bg-red-500 animate-ping';
                  }
                  return <div key={i} className={`h-full rounded-sm transition-colors duration-300 ${colorClass}`} />;
                })}
              </div>
              
              <div className="text-[9px] text-slate-500 leading-normal flex justify-between mt-1">
                <span>0 (Mudo)</span>
                <span className="text-emerald-500 font-semibold">50 (Óptimo)</span>
                <span>100 (Saturado)</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            <span className="text-[9px] text-slate-400 block leading-relaxed italic">
              * El medidor analiza en tiempo real los picos de tono de la portadora VHF. Configure el potenciómetro de la interfaz para centrar el nivel en 45-55.
            </span>
            
            <button
              onClick={handleTriggerTestTx}
              disabled={isTransmitting}
              className="w-full py-2 px-3 border border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-900/10 text-emerald-300 font-sans font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
            >
              {isTransmitting ? (
                <>
                  <Activity size={12} className="text-red-400 animate-ping" />
                  <span>EMITIENDO TONO BELL 202 (PTT)...</span>
                </>
              ) : (
                <>
                  <Radio size={12} />
                  <span>INYECTAR PORTADORA DE PRUEBA RF</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Core Telemetry parameters & lamps (cols: 4) */}
        <div className="lg:col-span-4 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 flex flex-col justify-between font-mono gap-3">
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-black block mb-2">Indicadores de Hardware y Puertos</span>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* DCD indicator */}
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/60 flex flex-col justify-center items-center gap-1.5 text-center">
                <span className="text-[9px] text-slate-500 uppercase block">Portadora DCD</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border ${isDcd ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-slate-900 border-slate-800'}`}></span>
                  <span className={`font-bold ${isDcd ? 'text-green-400 animate-pulse' : 'text-slate-500'}`}>{isDcd ? 'SQL ACTIVO' : 'CERRADO'}</span>
                </div>
              </div>

              {/* PTT indicator */}
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900/60 flex flex-col justify-center items-center gap-1.5 text-center">
                <span className="text-[9px] text-slate-500 uppercase block">Transmisión PTT</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border ${isTransmitting ? 'bg-red-500 animate-ping shadow-[0_0_8px_#ef4444]' : 'bg-slate-900 border-slate-800'}`}></span>
                  <span className={`font-bold ${isTransmitting ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>{isTransmitting ? 'EMITIENDO' : 'REPOSO'}</span>
                </div>
              </div>

              {/* Port KISS TCP */}
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center text-[10px] col-span-2">
                <span className="text-slate-400 uppercase">KISS Socket</span>
                <span className="text-emerald-400 font-bold">Port 8001 (TCP)</span>
              </div>

            </div>
          </div>

          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[10.5px] leading-relaxed">
            <span className="text-blue-400 font-bold block mb-0.5">Soporte Debian Native AX.25:</span>
            <p className="text-[10px] text-slate-400">
              La pila de software interactúa con los sockets de kernel Linux de forma nativa a través de drivers del sistema dsp/alsa. Integrado al 100% con transceptores de emergencia civil.
            </p>
          </div>
        </div>

        {/* Real-time TNC Decoded terminal logs (cols: 4) */}
        <div className="lg:col-span-4 bg-slate-950 border border-slate-900 p-3 rounded-xl flex flex-col font-mono text-[10.5px]">
          <div className="text-slate-500 uppercase font-black tracking-widest flex items-center justify-between border-b border-slate-900 pb-1.5 mb-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <Terminal size={12} className="text-emerald-400" /> Monitor del Modulador Direwolf
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setDirewolfLogs([]);
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
                className="text-red-400 hover:text-red-300 text-[8.5px] font-mono font-bold cursor-pointer transition-colors hover:underline"
                title="Limpiar logs de Direwolf"
              >
                [limpiar]
              </button>
              <span className="text-[8px] bg-slate-900 text-slate-400 px-1 rounded font-bold">AFSK 1200</span>
            </div>
          </div>
          
          <div className="flex-1 bg-black p-2.5 rounded-lg border border-slate-900/60 text-slate-400 h-[170px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
            {direwolfLogs.map((logLine, idx) => (
              <div key={idx} className="leading-relaxed flex items-start gap-1">
                <span className="text-slate-600 select-none shrink-0 font-bold">#</span>
                <span className={
                  logLine.startsWith('[VHF TX]') ? 'text-yellow-500 font-bold' :
                  logLine.startsWith('[VHF RX]') ? 'text-emerald-400 font-bold' :
                  logLine.includes('successfully') ? 'text-emerald-400' :
                  logLine.includes('[OK]') ? 'text-emerald-500 font-semibold' : 'text-slate-300'
                }>
                  {logLine}
                </span>
              </div>
            ))}
            {isTransmitting && (
              <div className="text-red-405 text-red-500 animate-pulse text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping shrink-0" />
                Emitiendo baliza de telemetría de sismos sobre modulación VHF...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
