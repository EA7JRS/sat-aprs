import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TermIcon, Send, AlertTriangle, Zap, Trash2 } from 'lucide-react';
import { AprsPacketLog } from '../../types';

interface TerminalProps {
  logs: AprsPacketLog[];
  onInjectRaw: (payload: string) => Promise<boolean>;
  onTriggerSismoTest: (magnitude: number) => Promise<void>;
  onTriggerNoaaTest: (scale: 'G' | 'R' | 'S', level: number) => Promise<void>;
  onClearLogs?: () => Promise<void>;
}

export default function TerminalLogs({ logs, onInjectRaw, onTriggerSismoTest, onTriggerNoaaTest, onClearLogs }: TerminalProps) {
  const [rawPacket, setRawPacket] = useState('');
  const [testMagnitude, setTestMagnitude] = useState(4.5);
  const [testNoaaScale, setTestNoaaScale] = useState<'G' | 'R' | 'S'>('G');
  const [testNoaaLevel, setTestNoaaLevel] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll terminal to top on new logs
  useEffect(() => {
    if (terminalEndRef.current) {
      // logs are unshifted, so the newest is at the top. 
      // If we want terminal feel, newest can be at top or bottom. We display logs sorted, 
      // where newest is at the top of the stream.
    }
  }, [logs]);

  const handleSendRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPacket.trim()) return;
    setIsSubmitting(true);
    const success = await onInjectRaw(rawPacket);
    if (success) {
      setRawPacket('');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-slate-100 shadow-xl" id="terminal-component">
      <div className="flex items-center gap-2 border-b border-slate-900 pb-3">
        <TermIcon className="text-emerald-500 stroke-[1.5]" size={18} />
        <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-emerald-500">Terminal TNC de Tráfico de Paquetes APRS</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LOG TERMINAL (9 cols) */}
        <div className="lg:col-span-9 flex flex-col bg-slate-950 border-2 border-slate-900 rounded-lg overflow-hidden h-[330px]">
          {/* Terminal Title Belt */}
          <div className="bg-slate-900 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono border-b border-slate-950 text-slate-400">
            <span>PACKET MONITOR [9600 BAUD / KISS MODE]</span>
            <div className="flex items-center gap-3">
              {onClearLogs && (
                <button
                  type="button"
                  onClick={onClearLogs}
                  className="flex items-center gap-1 text-[9.5px] font-mono font-bold text-red-400 hover:text-red-300 transition-colors uppercase cursor-pointer"
                  title="Borrar búfer de logs del Terminal"
                  id="btn-clear-terminal-logs"
                >
                  <Trash2 size={11} className="stroke-[2]" />
                  Limpiar Logs
                </button>
              )}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                LIVE FEED
              </span>
            </div>
          </div>

          {/* Terminal Screen screen */}
          <div className="p-3 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed select-text space-y-1.5 bg-[#020804] text-emerald-500 shadow-inner scrollbar-thin scrollbar-thumb-slate-800">
            {logs.length > 0 ? (
              logs.map((log) => {
                let badgeColor = 'text-blue-400 border border-blue-500/20 bg-blue-950/20';
                let directionMarker = '⚡';
                if (log.type === 'TX') {
                  badgeColor = 'text-emerald-400 border border-emerald-500/20 bg-emerald-950/20';
                  directionMarker = '➔';
                } else if (log.type === 'RX') {
                  badgeColor = 'text-yellow-500 border border-yellow-500/20 bg-yellow-950/20';
                  directionMarker = '➔';
                }

                return (
                  <div key={log.id} className="border-b border-emerald-950/35 pb-1.5 hover:bg-slate-950/25 px-1 rounded transition-colors">
                    <span className="text-[9px] text-emerald-600 block">{log.timestamp}</span>
                    <div className="flex items-start gap-1 flex-wrap mt-0.5">
                      <span className={`px-1 rounded text-[8px] font-extrabold ${badgeColor}`}>
                        {directionMarker} {log.type}
                      </span>
                      <span className="text-slate-300 font-bold">{log.source}</span>
                      <span className="text-emerald-700">▸</span>
                      <span className="text-slate-400">{log.destination}</span>
                      <span className="text-slate-500">[{log.path}]</span>
                    </div>
                    {/* Raw Packet Payload */}
                    <div className="text-slate-200 mt-1 break-all bg-emerald-950/10 p-1.5 border border-emerald-900/30 rounded font-black max-w-full">
                      {log.payload}
                    </div>
                    <span className="text-[10px] text-emerald-500/60 block mt-0.5 leading-snug">
                      ⚙ {log.remarks}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-emerald-700/60 text-center py-20 italic">
                A la espera de transmisiones en la red...
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* DIAGNOSTIC CONTROL PANEL (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-3 justify-start">
          {/* Custom RAW Injector */}
          <form onSubmit={handleSendRaw} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5 h-full flex flex-col justify-between">
            <div>
              <span className="font-mono text-[10px] text-emerald-500 uppercase font-black block tracking-wider mb-1">Inyector de Paquetes</span>
              <span className="text-[8.5px] text-slate-400 font-mono block leading-snug mb-3">
                Inyecta tramas manuales AX.25 por la interfaz TNC Direwolf. Formato: ORIGEN&gt;DEST,ROUTING:PAYLOAD
              </span>
              <input
                type="text"
                placeholder="EA3URG>APRS,TCPIP*::REMER-1 :ALERTA SISMICA"
                value={rawPacket}
                onChange={(e) => setRawPacket(e.target.value)}
                disabled={isSubmitting}
                className="bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/60 w-full mb-2"
                id="raw-paquete-input"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !rawPacket.trim()}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              id="btn-send-raw"
            >
              <Send size={13} />
              <span>Inyectar Tramda</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
