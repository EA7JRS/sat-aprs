import React, { useState, useEffect } from 'react';
import { 
  Cpu, ShieldCheck, Database, HardDrive, Clock, Radio, Activity, 
  RefreshCw, Send, Network, Server, ArrowUpRight, Zap, Target,
  CheckCircle2, AlertTriangle, AlertCircle, RefreshCcw, Layers, Terminal,
  Lock, Unlock, Save, FileText, RotateCcw, Info
} from 'lucide-react';
import { GPSDStatus, NTPSECStatus } from '../../types';

interface TelemetryProps {
  gpsd: GPSDStatus;
  ntp: NTPSECStatus;
  config?: any;
  configVerification?: any;
  onReverifyConfigs?: () => void;
}

interface SocketChannel {
  id: string;
  name: string;
  protocol: 'TCP' | 'UDP' | 'UNIX' | 'WSS' | 'HTTP';
  port: string;
  address: string;
  status: 'ONLINE' | 'STANDBY' | 'SYNCING' | 'REBOOTING' | 'ERROR';
  bytesRx: number;
  bytesTx: number;
  packets: number;
  lastEvent: string;
  color: string;
}

export default function TelemetryStatus({ gpsd, ntp, config, configVerification, onReverifyConfigs }: TelemetryProps) {
  // Filter state for sockets
  const [filter, setFilter] = useState<'all' | 'online' | 'standby' | 'error'>('all');
  
  // Sockets state
  const [sockets, setSockets] = useState<SocketChannel[]>([
    {
      id: 'direwolf',
      name: 'Direwolf TNC Listener',
      protocol: 'TCP',
      port: '8001',
      address: 'localhost',
      status: 'ONLINE',
      bytesRx: 145920,
      bytesTx: 18450,
      packets: 1459,
      lastEvent: 'KISS Frame [EA1YAL-4] demodulated successfully',
      color: 'emerald'
    },
    {
      id: 'aprx_gw',
      name: 'APRS-IS Gateway Uplink (APRX)',
      protocol: 'TCP',
      port: '14580',
      address: 'euro.aprs2.net',
      status: 'ONLINE',
      bytesRx: 289450,
      bytesTx: 95400,
      packets: 3840,
      lastEvent: 'Uplink transmission confirmed: EA1URG-10 beacon pushed',
      color: 'blue'
    },
    {
      id: 'weewx_loop',
      name: 'WeeWX Weather Loop Receiver',
      protocol: 'UNIX',
      port: 'sock',
      address: '/var/run/weewx.sock',
      status: 'ONLINE',
      bytesRx: 84200,
      bytesTx: 2100,
      packets: 842,
      lastEvent: 'LOOP packet received: WMR300 station sync ok',
      color: 'amber'
    },
    {
      id: 'sat_api',
      name: 'SAT REST Telemetry API Engine',
      protocol: 'HTTP',
      port: '3000',
      address: '0.0.0.0',
      status: 'ONLINE',
      bytesRx: 1859000,
      bytesTx: 4945320,
      packets: 12590,
      lastEvent: 'GET /api/telemetry 205 OK - Client 192.168.1.15',
      color: 'violet'
    },
    {
      id: 'ign_wss',
      name: 'IGN Seismological Ingestion Feed',
      protocol: 'WSS',
      port: '443',
      address: 'alertas.ign.es/sismos',
      status: 'STANDBY',
      bytesRx: 12400,
      bytesTx: 1800,
      packets: 139,
      lastEvent: 'Secured WebSocket connected. Waiting for seismic triggers.',
      color: 'rose'
    },
    {
      id: 'dgt_infocar',
      name: 'DGT Traffic Incidences Webhook',
      protocol: 'HTTP',
      port: '80',
      address: 'infocar.dgt.es/api',
      status: 'ONLINE',
      bytesRx: 45200,
      bytesTx: 950,
      packets: 312,
      lastEvent: 'Polled incidences range Sector-A6: Active (0 alerts)',
      color: 'cyan'
    },
    {
      id: 'aemet_radar',
      name: 'AEMET Radar Ingest Broker',
      protocol: 'UDP',
      port: '4005',
      address: 'radar-opendata.aemet.es',
      status: 'ONLINE',
      bytesRx: 952000,
      bytesTx: 0,
      packets: 1140,
      lastEvent: 'Chunk image packet [DBReflect:35] loaded into frame buffer',
      color: 'indigo'
    },
    {
      id: 'copciv_cap',
      name: 'Protección Civil - CAP ES Broadcast',
      protocol: 'UDP',
      port: '514',
      address: 'emergencias-cap.civil.es',
      status: 'STANDBY',
      bytesRx: 5410,
      bytesTx: 0,
      packets: 41,
      lastEvent: 'CAP-ES alert feed listener on standby - no warnings in buffer',
      color: 'teal'
    }
  ]);

  const [activeSocketLog, setActiveSocketLog] = useState<string | null>(null);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // SECURE CONFIG EDITOR STATE
  const [selectedConfig, setSelectedConfig] = useState<'direwolf' | 'aprx'>('direwolf');
  const [editorContent, setEditorContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isLoadingConfigs, setIsLoadingConfigs] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [isEditorUnlocked, setIsEditorUnlocked] = useState<boolean>(false);
  const [editorFeedback, setEditorFeedback] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);

  const fetchConfig = async (type: 'direwolf' | 'aprx') => {
    setIsLoadingConfigs(true);
    setEditorFeedback(null);
    try {
      const resp = await customFetch('/api/files/configs');
      const d = await resp.json();
      if (d) {
        const content = d[type] || '';
        setEditorContent(content);
        setOriginalContent(content);
      } else {
        setEditorFeedback({ type: 'error', message: 'Error al parsear los archivos de configuración desde el servidor.' });
      }
    } catch (e: any) {
      setEditorFeedback({ type: 'error', message: `No se pudo conectar con la API de configuración: ${e.message}` });
    } finally {
      setIsLoadingConfigs(false);
    }
  };

  useEffect(() => {
    fetchConfig(selectedConfig);
  }, [selectedConfig]);

  const runLocalValidation = (type: 'direwolf' | 'aprx', content: string): string[] => {
    const errors: string[] = [];
    if (!content || content.trim() === '') {
      errors.push('El archivo de configuración no puede estar completamente vacío.');
      return errors;
    }

    if (type === 'direwolf') {
      if (!/^\s*ADEVICE\s/mi.test(content)) {
        errors.push('Falta la directiva obligatoria "ADEVICE" (ej. ADEVICE plughw:1,0) para vincular la tarjeta de sonido.');
      }
      if (!/^\s*MYCALL\s/mi.test(content)) {
        errors.push('Falta la directiva obligatoria "MYCALL" para identificar la estación APRS.');
      }
      if (!/^\s*CHANNEL\s/mi.test(content)) {
        errors.push('Falta definir al menos un canal con la directiva "CHANNEL 0".');
      }
    } else if (type === 'aprx') {
      if (!/<\s*interface\s*>/i.test(content) || !/<\s*\/\s*interface\s*>/i.test(content)) {
        errors.push('Falta el bloque obligatorio de interfaz "<interface> ... </interface>" para vincular el puerto TNC (KISS/TCP).');
      }
      if (!/<\s*logging\s*>/i.test(content) || !/<\s*\/\s*logging\s*>/i.test(content)) {
        errors.push('Falta el bloque obligatorio de registro "<logging> ... </logging>" para definir las rutas de logs de APRX.');
      }
      if (!/^\s*mycall\s/mi.test(content)) {
        errors.push('Falta definir el indicativo principal con "mycall CALLSIGN" (ej. mycall EA1URG-10).');
      }
    }
    return errors;
  };

  const handleSaveConfig = async () => {
    const errors = runLocalValidation(selectedConfig, editorContent);
    if (errors.length > 0) {
      setEditorFeedback({
        type: 'error',
        message: `Validación rechazada. Corrija los siguientes errores obligatorios:\n${errors.join('\n')}`
      });
      return;
    }

    setIsSavingConfig(true);
    setEditorFeedback(null);
    try {
      const resp = await customFetch('/api/files/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedConfig, content: editorContent })
      });
      const d = await resp.json();
      if (d.success) {
        setEditorFeedback({
          type: 'success',
          message: `¡Archivo ${selectedConfig === 'direwolf' ? 'direwolf.conf' : 'aprx.conf'} guardado correctamente! (${d.path})`
        });
        setOriginalContent(editorContent);
        setIsEditorUnlocked(false);
        if (onReverifyConfigs) {
          onReverifyConfigs();
        }
      } else {
        setEditorFeedback({ type: 'error', message: d.error || 'Error desconocido al guardar el archivo.' });
      }
    } catch (e: any) {
      setEditorFeedback({ type: 'error', message: `Fallo de comunicación con el servidor: ${e.message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleLoadTemplate = () => {
    const defaultDirewolf = `# =====================================================================
# CONFIGURACIÓN GENERADA DE DIREWOLF SOFTWARE TNC (S.A.T. DEBIAN 13)
# =====================================================================
ADEVICE plughw:1,0
CHANNEL 0
MYCALL EA1URG-13
MODEM 1200
PTT /dev/ttyUSB0 RTS
GPSD localhost
CBEACON dest=APDIW1 info="S.A.T. NODO DE ALERTA VHF [Debian 13 Core]" every=10
`;

    const defaultAprx = `# ===============================================
# ARCHIVO DE CONFIGURACIÓN APRX S.A.T. EMERGENCIAS
# ===============================================
mycall      EA1URG-10
myloc       lat 4025.00N lon 00342.00W

<aprsis>
  server    rotate.aprs2.net   14580
  passcode  18023
  filter    "m/200"
</aprsis>

<logging>
  pidfile    /var/run/aprx.pid
  rflog      /var/log/aprx/aprx-rf.log
</logging>

<interface>
  tcp-device   127.0.0.1   8001   KISS
</interface>
`;

    const template = selectedConfig === 'direwolf' ? defaultDirewolf : defaultAprx;
    setEditorContent(template);
    setEditorFeedback({ type: 'warning', message: 'Se ha cargado la plantilla predeterminada recomendada. Recuerde adaptarla a su indicativo y puertos antes de guardar.' });
  };

  // A-GPS status state
  const [agpsStatus, setAgpsStatus] = useState({
    enabled: true,
    server: 'supl.google.com',
    lastSync: 'Nunca',
    ttff: 3.5
  });

  const toggleGpsSignal = async () => {
    try {
      const lost = gpsd.mode > 1 && !gpsd.isFallback;
      await customFetch('/api/gpsd/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: lost ? 1 : 3,
          forceFallback: lost,
          lat: lost ? undefined : 40.416775,
          lon: lost ? undefined : -3.703790,
          alt: lost ? undefined : 657
        })
      });
    } catch (e) {
      console.error("Error toggling GPS signal simulation:", e);
    }
  };

  useEffect(() => {
    if (config) {
      setAgpsStatus({
        enabled: config.agpsEnabled !== false,
        server: config.agpsServer || 'supl.google.com',
        lastSync: config.agpsLastSync || 'Nunca',
        ttff: config.agpsTtff !== undefined ? config.agpsTtff : 3.5
      });
    } else {
      try {
        const enabled = localStorage.getItem('agps_enabled') !== 'false';
        const server = localStorage.getItem('agps_server') || 'supl.google.com';
        const lastSync = localStorage.getItem('agps_last_sync') || 'Nunca';
        const ttff = Number(localStorage.getItem('agps_ttff') || '3.5');
        setAgpsStatus({ enabled, server, lastSync, ttff });
      } catch {
        // Ignore
      }
    }
  }, [config]);

  const [journalLogs, setJournalLogs] = useState<string>('');
  const [journalLoading, setJournalLoading] = useState<boolean>(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalSimulated, setJournalSimulated] = useState<boolean>(false);

  const fetchJournalLogs = async () => {
    setJournalLoading(true);
    setJournalError(null);
    try {
      const resp = await customFetch('/api/system/journal');
      const d = await resp.json();
      if (d && d.success) {
        setJournalLogs(d.logs);
        setJournalSimulated(!!d.simulated);
      } else {
        setJournalError(d.error || 'No se pudieron recuperar los registros.');
      }
    } catch (err: any) {
      setJournalError(err.message || String(err));
    } finally {
      setJournalLoading(false);
    }
  };

  useEffect(() => {
    fetchJournalLogs();
  }, []);

  // Background fluctuation simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setSockets(prevSockets => 
        prevSockets.map(sock => {
          if (sock.status !== 'ONLINE') return sock;
          
          // Randomly fluctuate packets and data bytes occasionally
          const activeTrigger = Math.random() > 0.4;
          if (!activeTrigger) return sock;

          const addedPackets = Math.floor(Math.random() * 3) + 1;
          const addedRxBytes = addedPackets * (Math.floor(Math.random() * 200) + 100);
          const addedTxBytes = Math.random() > 0.6 ? addedPackets * (Math.floor(Math.random() * 50) + 20) : 0;

          // Realistic random eventos based on type
          let customizedEvent = sock.lastEvent;
          if (Math.random() > 0.7) {
            const timeStr = new Date().toLocaleTimeString('es-ES');
            if (sock.id === 'direwolf') {
              const nodes = ['EA1URG-10', 'EB1TR-1', 'EA1RCI-3', 'EA1URG-13'];
              const chosenNode = nodes[Math.floor(Math.random() * nodes.length)];
              customizedEvent = `KISS Frame [${chosenNode}] demodulated successfully at ${timeStr}`;
            } else if (sock.id === 'aprx_gw') {
              customizedEvent = `Gateway synchronization completed: payload synced at ${timeStr}`;
            } else if (sock.id === 'sat_api') {
              customizedEvent = `GET /api/telemetry 200 OK - remote responder at ${timeStr}`;
            } else if (sock.id === 'weewx_loop') {
              customizedEvent = `LOOP packet gathered successfully. Wind/Temp records compiled.`;
            } else if (sock.id === 'aemet_radar') {
              customizedEvent = `Radar packet chunk deserialized successfully. Level: OK`;
            }
          }

          return {
            ...sock,
            packets: sock.packets + addedPackets,
            bytesRx: sock.bytesRx + addedRxBytes,
            bytesTx: sock.bytesTx + addedTxBytes,
            lastEvent: customizedEvent
          };
        })
      );
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const simulateGlobalPoll = () => {
    if (globalSyncing) return;
    setGlobalSyncing(true);
    setToastMessage('Sondeando el estado de todos los sockets del sistema SAT...');
    
    setTimeout(() => {
      setSockets(prev => 
        prev.map(sock => {
          if (sock.status === 'ERROR') {
            return { ...sock, status: 'ONLINE', lastEvent: 'Socket re-established automatically' };
          }
          if (sock.status === 'STANDBY') {
            return { ...sock, packets: sock.packets + 1, lastEvent: 'Secured ping loop verify - OK' };
          }
          return {
            ...sock,
            packets: sock.packets + Math.floor(Math.random() * 5) + 2,
            bytesRx: sock.bytesRx + Math.floor(Math.random() * 1500) + 200
          };
        })
      );
      setGlobalSyncing(false);
      setToastMessage('¡Todos los canales de red validados y sincronizados!');
      setTimeout(() => setToastMessage(null), 3500);
    }, 1500);
  };

  const forceRebootSocket = (id: string, name: string) => {
    setSockets(prev => 
      prev.map(sock => {
        if (sock.id === id) {
          return { ...sock, status: 'REBOOTING', lastEvent: 'Iniciando secuencia de reset e inserción de buffers...' };
        }
        return sock;
      })
    );

    setToastMessage(`Reiniciando descriptor de socket para: ${name}`);

    setTimeout(() => {
      setSockets(prev => 
        prev.map(sock => {
          if (sock.id === id) {
            return { 
              ...sock, 
              status: 'ONLINE', 
              packets: sock.packets + 1,
              lastEvent: `Socket RESTORED successfully. Listening bind active on ${sock.protocol}:${sock.port}`
            };
          }
          return sock;
        })
      );
      setToastMessage(`Canal '${name}' restaurado con éxito.`);
      setTimeout(() => setToastMessage(null), 3000);
    }, 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE': return 'bg-emerald-500 text-emerald-400 border-emerald-500/20';
      case 'STANDBY': return 'bg-rose-400 text-rose-300 border-rose-500/20';
      case 'SYNCING': return 'bg-cyan-400 text-cyan-300 border-cyan-500/20 animate-pulse';
      case 'REBOOTING': return 'bg-amber-400 text-amber-300 border-amber-500/20 animate-spin';
      default: return 'bg-red-500 text-red-400 border-red-500/20';
    }
  };

  const filteredSockets = sockets.filter(sock => {
    if (filter === 'all') return true;
    if (filter === 'online') return sock.status === 'ONLINE';
    if (filter === 'standby') return sock.status === 'STANDBY';
    if (filter === 'error') return sock.status === 'ERROR';
    return true;
  });

  const aggregateMetrics = () => {
    let totalPackets = 0;
    let totalRxMb = 0;
    let totalTxMb = 0;
    sockets.forEach(s => {
      totalPackets += s.packets;
      totalRxMb += s.bytesRx;
      totalTxMb += s.bytesTx;
    });
    return {
      totalPackets,
      totalRxMb: (totalRxMb / 1024 / 1024).toFixed(2),
      totalTxMb: (totalTxMb / 1024 / 1024).toFixed(2),
      activeCount: sockets.filter(s => s.status === 'ONLINE' || s.status === 'STANDBY').length
    };
  };

  const metrics = aggregateMetrics();

  return (
    <div className="flex flex-col gap-5 text-slate-100" id="telemetry-sockets-hub">
      
      {/* CARD: SINCRONIZADOR DE ARCHIVOS DE CONFIGURACIÓN TRAS REINICIO */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="text-pink-400 stroke-[1.5]" size={20} />
            <div>
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-pink-400 flex items-center gap-1.5">
                Sincronizador de Archivos de Configuración S.A.T.
              </h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                Verificación automática de existencia y validez de ficheros tras reinicios del NUC
              </p>
            </div>
          </div>
          <button
            onClick={onReverifyConfigs}
            className="px-3 py-1.5 bg-pink-950/40 hover:bg-pink-900/40 border border-pink-500/30 rounded-lg text-[10.5px] font-bold font-mono flex items-center gap-1.5 cursor-pointer text-pink-300 transition-all active:scale-95 shrink-0"
          >
            <RefreshCcw size={11} className="animate-spin-slow" /> Re-verificar Ahora
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {['aprx', 'direwolf', 'weewx', 'pat'].map((service) => {
            const verify = configVerification?.results?.[service];
            
            return (
              <div 
                key={service} 
                className={`bg-slate-900/40 border rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-all duration-300 ${
                  verify 
                    ? !verify.exists 
                      ? 'border-red-500/25 bg-red-950/5' 
                      : !verify.valid 
                        ? 'border-yellow-500/25 bg-yellow-950/5' 
                        : 'border-emerald-500/25 bg-emerald-950/5'
                    : 'border-slate-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-[9px] text-slate-500 uppercase font-black block tracking-wider">Servicio</span>
                    <h3 className="font-sans font-black text-xs uppercase text-slate-200 tracking-wide mt-0.5">{service}</h3>
                  </div>
                  {verify ? (
                    !verify.exists ? (
                      <span className="text-[8.5px] bg-red-950/80 border border-red-500/40 text-red-400 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                        AUSENTE
                      </span>
                    ) : !verify.valid ? (
                      <span className="text-[8.5px] bg-yellow-950/80 border border-yellow-500/40 text-yellow-400 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                        CORRUPTO
                      </span>
                    ) : (
                      <span className="text-[8.5px] bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                        VALIDADO
                      </span>
                    )
                  ) : (
                    <span className="text-[8.5px] bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider animate-pulse border border-slate-800">
                      PENDIENTE
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-[9px] font-mono text-slate-500 leading-snug">
                    Ruta: <span className="text-slate-400 font-semibold select-all block truncate" title={verify?.path}>{verify?.path || 'No detectada'}</span>
                  </div>
                  {verify && !verify.valid && (
                    <div className="bg-red-950/20 border border-red-900/30 p-2 rounded text-[9.5px] font-mono text-rose-400 leading-normal mt-2 select-all whitespace-pre-wrap max-h-[80px] overflow-y-auto">
                      ❌ {verify.error}
                    </div>
                  )}
                  {verify && verify.exists && verify.valid && (
                    <div className="text-[9.5px] text-emerald-400 font-mono mt-1 flex items-center gap-1.5">
                      <CheckCircle2 size={11} className="shrink-0" /> Integridad correcta
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CARD: EDITOR SEGURO DE ARCHIVOS DE CONFIGURACIÓN */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-pink-400 stroke-[1.5]" size={20} />
            <div>
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-pink-400">
                Editor de Configuración Seguro (Debian Core)
              </h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                Modificación en caliente con pre-validación de directivas vitales para Direwolf y Aprx
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setSelectedConfig('direwolf')}
              className={`px-3 py-1 text-[10.5px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                selectedConfig === 'direwolf'
                  ? 'bg-pink-950/60 border border-pink-500/40 text-pink-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              direwolf.conf
            </button>
            <button
              onClick={() => setSelectedConfig('aprx')}
              className={`px-3 py-1 text-[10.5px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                selectedConfig === 'aprx'
                  ? 'bg-pink-950/60 border border-pink-500/40 text-pink-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              aprx.conf
            </button>
          </div>
        </div>

        {isLoadingConfigs ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw size={24} className="animate-spin text-pink-400" />
            <span className="text-xs font-mono animate-pulse">Cargando archivo del sistema...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Main Code Editor Column */}
              <div className="lg:col-span-8 flex flex-col gap-3">
                {/* Action Bar */}
                <div className="flex flex-wrap justify-between items-center bg-slate-900/40 border border-slate-850 p-2 px-3 rounded-xl gap-2 font-mono text-[10.5px]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditorUnlocked(!isEditorUnlocked)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer select-none ${
                        isEditorUnlocked
                          ? 'bg-emerald-950/45 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-950/30 border-amber-500/20 text-amber-400'
                      }`}
                    >
                      {isEditorUnlocked ? <Unlock size={12} /> : <Lock size={12} />}
                      {isEditorUnlocked ? 'Editor Desbloqueado' : 'Habilitar Edición'}
                    </button>
                    {!isEditorUnlocked && (
                      <span className="text-[9.5px] text-slate-500 hidden sm:inline">
                        🔒 Desbloquee para modificar el archivo real en Debian
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleLoadTemplate}
                      disabled={!isEditorUnlocked}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-850 disabled:opacity-40 disabled:pointer-events-none border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg font-bold transition-all cursor-pointer"
                      title="Cargar una plantilla de configuración recomendada"
                    >
                      <FileText size={11} />
                      Plantilla Base
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('¿Desea descartar los cambios y restaurar el contenido original?')) {
                          setEditorContent(originalContent);
                          setEditorFeedback({ type: 'warning', message: 'Cambios descartados. Contenido restaurado.' });
                        }
                      }}
                      disabled={!isEditorUnlocked || editorContent === originalContent}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-850 disabled:opacity-40 disabled:pointer-events-none border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg font-bold transition-all cursor-pointer"
                      title="Restaurar el contenido original leído del disco"
                    >
                      <RotateCcw size={11} />
                      Descartar
                    </button>
                  </div>
                </div>

                {/* Code Textarea with Line Numbers simulation or clean view */}
                <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-950 text-slate-500 flex justify-between items-center text-[9.5px] font-mono">
                    <span>Ruta real: {selectedConfig === 'direwolf' ? '/etc/direwolf.conf' : '/etc/aprx.conf'}</span>
                    <span>{editorContent.split('\n').length} líneas | UTF-8</span>
                  </div>
                  <textarea
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    disabled={!isEditorUnlocked}
                    spellCheck={false}
                    className={`font-mono text-xs bg-slate-950/90 p-4 w-full h-[320px] focus:outline-none resize-y selection:bg-pink-500/20 leading-relaxed font-semibold transition-all ${
                      isEditorUnlocked
                        ? 'text-emerald-400 border-none'
                        : 'text-slate-400 opacity-90 border-none cursor-not-allowed select-none'
                    }`}
                    placeholder={`Escriba la configuración de ${selectedConfig === 'direwolf' ? 'Direwolf' : 'Aprx'} aquí...`}
                  />
                </div>
              </div>

              {/* Verification & Guidelines Column (col-span-4) */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                {/* Live Pre-Validation Box */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5 h-full">
                  <span className="font-mono text-[9px] text-slate-500 uppercase font-black tracking-wider block border-b border-slate-900 pb-1.5">
                    Pre-Validación del Servidor SAT
                  </span>

                  {runLocalValidation(selectedConfig, editorContent).length === 0 ? (
                    <div className="bg-emerald-950/25 border border-emerald-500/30 p-3 rounded-xl flex items-start gap-2.5 text-emerald-400 font-sans text-xs">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                      <div>
                        <h4 className="font-bold">Estructura Correcta</h4>
                        <p className="text-[10px] text-emerald-500 mt-0.5 leading-normal">
                          Cumple con las directivas mínimas de integridad. Listo para ser escrito en disco de Debian.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-rose-950/25 border border-rose-500/30 p-3 rounded-xl flex items-start gap-2.5 text-rose-400 font-sans text-xs">
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-400 animate-pulse" />
                      <div>
                        <h4 className="font-bold">Falta Directiva Obligatoria</h4>
                        <p className="text-[10px] text-rose-500 mt-0.5 leading-normal">
                          Se han detectado impedimentos para la ejecución correcta del daemon:
                        </p>
                        <ul className="list-disc pl-4 mt-1.5 space-y-1 text-[9.5px] text-rose-300 font-mono">
                          {runLocalValidation(selectedConfig, editorContent).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Tips & Specs Guide */}
                  <div className="mt-1 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <span className="font-mono text-[9px] text-slate-500 uppercase font-black tracking-wider block">
                        Especificación de Sintaxis
                      </span>
                      {selectedConfig === 'direwolf' ? (
                        <div className="font-mono text-[9.5px] text-slate-400 leading-normal space-y-2 bg-slate-950/40 p-2.5 border border-slate-900 rounded-lg">
                          <p>
                            <strong className="text-pink-400">ADEVICE:</strong> Vincula la tarjeta ALSA (ej. plughw:1,0).
                          </p>
                          <p>
                            <strong className="text-pink-400">CHANNEL 0:</strong> Inicia configuración de canal de radio.
                          </p>
                          <p>
                            <strong className="text-pink-400">MYCALL:</strong> Indicativo AX.25 principal (ej. EA1URG-13).
                          </p>
                          <p>
                            <strong className="text-pink-400">MODEM:</strong> Velocidad de modulación (1200 baudios en VHF).
                          </p>
                          <p>
                            <strong className="text-pink-400">PTT:</strong> Dispositivo de control TX (ej. /dev/ttyUSB0 RTS).
                          </p>
                        </div>
                      ) : (
                        <div className="font-mono text-[9.5px] text-slate-400 leading-normal space-y-2 bg-slate-950/40 p-2.5 border border-slate-900 rounded-lg">
                          <p>
                            <strong className="text-pink-400">mycall:</strong> Indicativo del igate de Internet (ej. EA1URG-10).
                          </p>
                          <p>
                            <strong className="text-pink-400">&lt;interface&gt;:</strong> Bloque para definir el puerto de conexión KISS TCP (normalmente localhost 8001).
                          </p>
                          <p>
                            <strong className="text-pink-400">&lt;logging&gt;:</strong> Define las rutas de log (ej. /var/log/aprx/aprx-rf.log).
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Main Save / Apply Buttons */}
                    <div className="pt-3 border-t border-slate-900 mt-3">
                      <button
                        onClick={handleSaveConfig}
                        disabled={!isEditorUnlocked || runLocalValidation(selectedConfig, editorContent).length > 0 || isSavingConfig}
                        className={`w-full py-2 border rounded-xl font-mono text-[11px] font-black tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 select-none ${
                          !isEditorUnlocked || runLocalValidation(selectedConfig, editorContent).length > 0
                            ? 'bg-slate-900 border-slate-850 text-slate-600 cursor-not-allowed'
                            : isSavingConfig
                              ? 'bg-pink-950/50 border-pink-500/25 text-pink-400 animate-pulse cursor-wait'
                              : 'bg-pink-950/80 hover:bg-pink-900/80 border-pink-500/40 text-pink-300 hover:text-pink-200 cursor-pointer active:scale-98 shadow-md'
                        }`}
                      >
                        <Save size={12} />
                        {isSavingConfig ? 'Guardando...' : 'Aplicar Cambios en Debian'}
                      </button>
                    </div>

                  </div>
                </div>
              </div>

            </div>

            {/* Feedback Alert banner */}
            {editorFeedback && (
              <div className={`p-3 rounded-xl border font-mono text-[10.5px] leading-normal flex items-start gap-2.5 ${
                editorFeedback.type === 'success'
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
                  : editorFeedback.type === 'warning'
                    ? 'bg-amber-950/30 border-amber-500/30 text-amber-400'
                    : 'bg-red-950/30 border-red-500/30 text-red-400'
              }`}>
                {editorFeedback.type === 'success' ? (
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-400" />
                ) : editorFeedback.type === 'warning' ? (
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-400" />
                ) : (
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-red-400" />
                )}
                <div className="whitespace-pre-wrap flex-1">
                  {editorFeedback.message}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 1. SECCIÓN DE CLOCK/NTP Y GEO GPSD (Bajo Nivel) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="text-violet-400 stroke-[1.5]" size={20} />
            <div>
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-violet-400">
                Canales de Sockets de Bajo Nivel y Tiempo Físico
              </h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                Estabilidad cronométrica PPS de hardware y enlaces atómicos GNSS
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[9px] bg-slate-900 px-2 py-0.5 rounded font-mono text-slate-400 border border-slate-800">
              STRATUM-1 MAPPED
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* NTPSEC Segment */}
          <div className="xl:col-span-6 bg-slate-900/40 border border-slate-900/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-900">
              <span className="font-mono text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <Clock size={15} className="text-blue-400" /> NTPSEC Sincronización Temporal
              </span>
              <span className="text-[9px] bg-blue-950/60 text-blue-300 px-2 py-0.5 rounded-lg uppercase font-mono font-bold border border-blue-500/20">
                PPS Físico
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 font-mono text-xs">
              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Estrato de Reloj</div>
                <div className="text-slate-200 mt-1 flex items-center gap-1.5 font-bold">
                  <span className={ntp.stratum === 1 ? 'text-blue-400 font-black' : 'text-slate-300'}>
                    Stratum {ntp.stratum}
                  </span>
                  {ntp.stratum === 1 && <ShieldCheck size={14} className="text-emerald-400 inline" />}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Dispositivo Maestro</div>
                <div className="text-slate-300 mt-1 truncate font-semibold" title={ntp.peer}>
                  {ntp.peer}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Offset de Tiempo</div>
                <div className="text-emerald-450 text-emerald-400 mt-1 font-black">
                  +{ntp.offsetMs.toFixed(4)} ms
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Jitter de Pulso (PPS)</div>
                <div className="text-blue-300 mt-1 font-semibold">
                  {ntp.jitterMs.toFixed(4)} ms
                </div>
              </div>
            </div>

            {/* Educational Note */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-900/60 text-[10px] text-slate-400 leading-normal flex items-start gap-2">
              <div className="text-blue-400 font-bold shrink-0 mt-0.5">ℹ REMER:</div>
              <p>
                El servidor de red APRS-IS y los nodos regionales rechazan severamente tramas con desvíos del sistema superiores a 30s para impedir retransmisiones maliciosas o bucles. El hardware de estrato uno asegura estabilidad de pulso a nivel microsegundo.
              </p>
            </div>
          </div>

          {/* GPSD Segment */}
          <div className="xl:col-span-6 bg-slate-900/40 border border-slate-900/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-900">
              <span className="font-mono text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <Radio size={15} className="text-emerald-400 animate-pulse" /> Satélites y Estado de Receptor GPSD
              </span>
              <span className="text-[9px] bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded-lg uppercase font-mono font-bold border border-emerald-500/20">
                SOCKET TCP (2947)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 font-mono text-xs">
              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Puerto del Driver</div>
                <div className="text-slate-200 mt-1 font-bold">
                  localhost:2947
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Dispositivo GNSS</div>
                <div className="text-slate-300 mt-1 truncate font-semibold" title={gpsd.device}>
                  {gpsd.device}
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Satélites Usados</div>
                <div className="text-slate-105 text-slate-200 font-bold mt-1">
                  {gpsd.satellitesUsed} <span className="text-[9.5px] font-normal text-slate-500">en uso</span> / {gpsd.satellitesVisible} <span className="text-[9.5px] font-normal text-slate-500">vis</span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Cálculo de Fijación</div>
                <div className="text-emerald-400 mt-1 font-black flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  {gpsd.mode === 3 ? '3D FIX (GNSS)' : gpsd.mode === 2 ? '2D FIX' : 'NO FIX'}
                </div>
              </div>
            </div>

            {/* Device details */}
            <div className="grid grid-cols-2 gap-2.5 text-[10px] font-mono text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-900">
              <div className="flex items-center gap-1.5">
                <Database size={12} className="text-emerald-400" />
                <span>Daemon: gpsd v3.25 stable</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive size={12} className="text-emerald-400" />
                <span>Baudrate: 9600 bps</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2 border-t border-slate-900/50 pt-2 mt-1 justify-between text-[9.5px]">
                <span className="flex items-center gap-1">
                  <Target size={12} className={agpsStatus.enabled ? "text-sky-400" : "text-slate-500"} />
                  <span>Asistencia A-GPS: <strong className={agpsStatus.enabled ? "text-sky-400" : "text-slate-500"}>{agpsStatus.enabled ? `ACTIVO (${agpsStatus.server})` : "DESACTIVADO"}</strong></span>
                </span>
                <span>
                  TTFF: <strong className={agpsStatus.enabled && agpsStatus.lastSync !== 'Nunca' ? "text-emerald-400" : "text-yellow-500"}>
                    {agpsStatus.enabled && agpsStatus.lastSync !== 'Nunca' ? `${agpsStatus.ttff}s (Instantáneo)` : "750s (Estándar)"}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 2. SECCIÓN AVANZADA: HILOS DE SOCKETS Y ENRUTAMIENTOS DAEMONS (Múltiples canales) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
        
        {/* Banner notification block */}
        {toastMessage && (
          <div className="bg-violet-950/80 border border-violet-500/20 text-violet-300 font-mono text-[11px] p-2 rounded-xl text-center font-bold animate-pulse">
            ✦ Msg: {toastMessage}
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Network className="text-emerald-400 stroke-[1.5]" size={20} />
            <div>
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-emerald-400">
                Área de Sockets, Descriptores y Pasarelas de Datos
              </h2>
              <p className="text-[10px] text-slate-550 text-slate-400 font-mono mt-0.5">
                Monitoreo activo de conexiones de red internas y flujos de emergencias crítico
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={simulateGlobalPoll}
              disabled={globalSyncing}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 cursor-pointer text-slate-300 transition-all disabled:opacity-40"
            >
              <RefreshCcw size={11} className={globalSyncing ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
              Sondear Canales
            </button>
            <span className="text-[11px] font-mono text-slate-500">|</span>
            <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800 text-[10px] font-bold font-mono">
              <button 
                onClick={() => setFilter('all')} 
                className={`px-2 py-0.5 rounded cursor-pointer ${filter === 'all' ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}
              >
                Todos ({sockets.length})
              </button>
              <button 
                onClick={() => setFilter('online')} 
                className={`px-2 py-0.5 rounded cursor-pointer ${filter === 'online' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500'}`}
              >
                On ({sockets.filter(s => s.status === 'ONLINE').length})
              </button>
              <button 
                onClick={() => setFilter('standby')} 
                className={`px-2 py-0.5 rounded cursor-pointer ${filter === 'standby' ? 'bg-slate-800 text-rose-400' : 'text-slate-500'}`}
              >
                Wait ({sockets.filter(s => s.status === 'STANDBY').length})
              </button>
            </div>
          </div>
        </div>

        {/* Aggregate statistics row of socket volumes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[10px] bg-slate-900/30 p-3 rounded-xl border border-slate-900">
          <div className="text-center p-2 border-r border-slate-900">
            <span className="text-slate-500 block uppercase font-bold text-[8.5px]">SOCKETS MONITOREADOS</span>
            <span className="text-slate-300 text-sm font-black mt-1 block">{metrics.activeCount} / {sockets.length}</span>
          </div>
          <div className="text-center p-2 border-r border-slate-900">
            <span className="text-slate-500 block uppercase font-bold text-[8.5px]">TRÁFICO TOTAL EMITIDO</span>
            <span className="text-emerald-400 text-sm font-black mt-1 block">{metrics.totalPackets} tramas</span>
          </div>
          <div className="text-center p-1.5 sm:p-2 border-r border-slate-900">
            <span className="text-slate-500 block uppercase font-bold text-[8.5px]">VOLUMEN RX ACUMULADO</span>
            <span className="text-blue-400 text-sm font-black mt-1 block">{metrics.totalRxMb} MB</span>
          </div>
          <div className="text-center p-2">
            <span className="text-slate-500 block uppercase font-bold text-[8.5px]">VOLUMEN TX ACUMULADO</span>
            <span className="text-violet-400 text-sm font-black mt-1 block">{metrics.totalTxMb} MB</span>
          </div>
        </div>

        {/* Socket list grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSockets.map((sock) => {
            const isSelected = activeSocketLog === sock.id;
            
            return (
              <div 
                key={sock.id}
                onClick={() => setActiveSocketLog(isSelected ? null : sock.id)}
                className={`bg-slate-900/40 border rounded-2xl p-4 transition-all duration-300 relative cursor-pointer select-none flex flex-col gap-3 justify-between ${
                  isSelected 
                    ? 'border-violet-500/50 bg-violet-950/5 shadow-md shadow-violet-500/5' 
                    : 'border-slate-900 hover:border-slate-800 hover:bg-slate-900/70'
                }`}
              >
                {/* Protocol badge & Pulse state */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded tracking-tight font-mono border uppercase ${
                      sock.protocol === 'TCP' ? 'bg-blue-950 text-blue-400 border-blue-500/20' :
                      sock.protocol === 'UDP' ? 'bg-cyan-950 text-cyan-400 border-cyan-500/20' :
                      sock.protocol === 'WSS' ? 'bg-rose-950 text-rose-400 border-rose-500/20' :
                      sock.protocol === 'HTTP' ? 'bg-violet-950 text-violet-400 border-violet-500/20' :
                      'bg-slate-950 text-slate-400 border-slate-800'
                    }`}>
                      {sock.protocol}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 font-mono">:{sock.port}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      sock.status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' :
                      sock.status === 'STANDBY' ? 'bg-rose-400 animate-ping' :
                      sock.status === 'REBOOTING' ? 'bg-amber-400 animate-spin' :
                      'bg-slate-800'
                    }`} />
                    <span className={`font-mono text-[9px] font-bold uppercase tracking-wider ${
                      sock.status === 'ONLINE' ? 'text-emerald-400' :
                      sock.status === 'STANDBY' ? 'text-rose-400' :
                      sock.status === 'REBOOTING' ? 'text-amber-400' :
                      'text-slate-500'
                    }`}>
                      {sock.status}
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="space-y-1">
                  <div className="font-sans font-bold text-xs uppercase text-slate-200">
                    {sock.name}
                  </div>
                  <div className="font-mono text-[9.5px] text-slate-500 leading-snug">
                    Bin: <span className="text-slate-400 select-all font-semibold">{sock.address}</span>
                  </div>
                </div>

                {/* Packet rate statistics & metrics */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-2 rounded-xl text-[9px] font-mono text-slate-400">
                  <div>
                    <span className="text-slate-600 block">TRAMAS</span>
                    <span className="font-bold text-slate-300 flex items-center gap-1 mt-0.5">
                      <Target size={10} className="text-emerald-400" />
                      {sock.packets} pkts
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 block">DATOS RX</span>
                    <span className="font-bold text-slate-300 block truncate mt-0.5">
                      {sock.bytesRx > 1024 * 1024 
                        ? `${(sock.bytesRx / 1024 / 1024).toFixed(1)} MB` 
                        : `${(sock.bytesRx / 1024).toFixed(1)} KB`
                      }
                    </span>
                  </div>
                </div>

                {/* Dynamic mini Wave indicator for visual appeal */}
                {sock.status === 'ONLINE' && (
                  <div className="h-4 flex items-end gap-0.5 mt-1 overflow-hidden" title="Tráfico de Socket instantáneo">
                    {Array.from({ length: 18 }).map((_, waveIdx) => {
                      const dynamicSeed = Math.floor(Math.sin((waveIdx + sock.packets) * 0.45) * 16) + 4;
                      return (
                        <div 
                          key={waveIdx} 
                          style={{ height: `${Math.min(100, Math.max(15, dynamicSeed))}%` }}
                          className={`w-full rounded-sm transition-all duration-300 ${
                            sock.id === 'direwolf' ? 'bg-emerald-500/20 group-hover:bg-emerald-500/40' :
                            sock.id === 'aprx_gw' ? 'bg-blue-500/20' :
                            sock.id === 'weewx_loop' ? 'bg-amber-500/20' :
                            sock.id === 'sat_api' ? 'bg-violet-500/20' : 'bg-slate-800'
                          }`}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Action buttons footer */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-900" onClick={e => e.stopPropagation()}>
                  <button
                    disabled={sock.status === 'REBOOTING'}
                    onClick={() => forceRebootSocket(sock.id, sock.name)}
                    className="flex-1 py-1 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-[10px] rounded-lg font-bold font-sans flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-40"
                    title="Reiniciar socket descriptor"
                  >
                    <RefreshCcw size={10} className="text-slate-400" />
                    Reset Puerto
                  </button>
                  <button
                    onClick={() => setActiveSocketLog(isSelected ? null : sock.id)}
                    className="px-2 py-1 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-[10px] rounded-lg font-bold font-sans text-slate-400"
                    title="Inspeccionar trama"
                  >
                    Ver Info
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Socket Ticker Event Log Viewer */}
        {activeSocketLog && (
          <div className="bg-black/90 rounded-2xl p-4 border border-violet-500/20 font-mono text-[10.5px] animate-fade-in flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-violet-950/40 pb-2 mb-1.5">
              <span className="text-violet-400 flex items-center gap-1.5 font-bold">
                <Terminal size={12} />
                MONITOR DE EVENTOS DEL DETECTOR: {
                  sockets.find(s => s.id === activeSocketLog)?.name.toUpperCase()
                }
              </span>
              <span className="text-slate-500 font-bold">SOCKET ACTIVE: {activeSocketLog}</span>
            </div>
            
            <div className="flex items-start gap-2 bg-slate-950/60 p-3 rounded-lg border border-slate-900">
              <span className="text-emerald-500">▶</span>
              <div>
                <p className="text-slate-350 text-slate-300 font-bold leading-normal">
                  {sockets.find(s => s.id === activeSocketLog)?.lastEvent}
                </p>
                <div className="text-[9.5px] text-slate-500 mt-2 flex items-center gap-4">
                  <span>Transport Protocol: {sockets.find(s => s.id === activeSocketLog)?.protocol}</span>
                  <span>Port Binding: {sockets.find(s => s.id === activeSocketLog)?.port}</span>
                  <span>Payload bytes Rx: {sockets.find(s => s.id === activeSocketLog)?.bytesRx} B</span>
                  <span>Payload bytes Tx: {sockets.find(s => s.id === activeSocketLog)?.bytesTx} B</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Informative footer */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900 border-dashed text-[10.5px] font-sans text-slate-400 space-y-1">
          <p>
            💡 <strong>Topología de Sockets de Emergencia:</strong> El sistema SAT mapea las llamadas y buffers de datos mediante canales persistentes en bucle local y pasarelas remotas para garantizar el acceso directo alterno de red en caso de corte total de la troncal de internet mediante radiofrecuencia (RF).
          </p>
        </div>

      </div>

      {/* 3. DIAGNÓSTICO DEL SISTEMA Y REGISTRO DE SERVICIOS (systemd journald) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4" id="systemd-journald-panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="text-violet-400 stroke-[1.5]" size={20} />
            <div>
              <h2 className="font-sans font-black text-sm tracking-wider uppercase text-violet-400">
                3. Registros de Servicio de Bajo Nivel (systemd journald)
              </h2>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                Consola de depuración para sat-aprs.service en el Intel NUC Debian 13
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {journalSimulated && (
              <span className="text-[8px] bg-amber-950 text-amber-400 uppercase tracking-widest font-mono font-bold px-2 py-0.5 rounded border border-amber-900/40">
                Entorno Simulado (Fallback)
              </span>
            )}
            <button
              onClick={fetchJournalLogs}
              disabled={journalLoading}
              className="px-2.5 py-1 bg-violet-950/60 hover:bg-violet-900/60 disabled:opacity-40 border border-violet-900/40 text-[10px] rounded font-bold font-mono text-violet-300 flex items-center gap-1 cursor-pointer transition-all uppercase"
              title="Recargar log de journalctl"
            >
              <RefreshCw size={10} className={`${journalLoading ? 'animate-spin' : ''}`} />
              Recargar Log
            </button>
          </div>
        </div>

        {journalError && (
          <div className="bg-red-950/40 border border-red-900/40 rounded-xl p-3 flex items-start gap-2 text-red-400 text-xs font-mono">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-bold">Error de consulta:</span> {journalError}
            </div>
          </div>
        )}

        <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden font-mono text-[11px] leading-relaxed relative">
          <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-950 text-slate-400 flex justify-between items-center text-[10px]">
            <span>bash: journalctl -u sat-aprs.service -n 50 --no-pager</span>
            <span className="text-slate-600">Última actualización: {new Date().toLocaleTimeString()}</span>
          </div>

          <div className="p-3 bg-black/95 text-slate-300 max-h-[350px] overflow-y-auto font-mono scrollbar-thin scrollbar-thumb-slate-800 selection:bg-violet-500/30 selection:text-white">
            {journalLoading && (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                <RefreshCw size={20} className="animate-spin text-violet-400" />
                <span className="text-[10px] animate-pulse">Adquiriendo buffer socket de journalctl...</span>
              </div>
            )}

            {!journalLoading && !journalLogs && (
              <div className="py-8 text-center text-slate-600">
                No hay registros disponibles.
              </div>
            )}

            {!journalLoading && journalLogs && journalLogs.split('\n').map((line, idx) => {
              if (line.trim() === '') return null;
              const isError = /error|fallo|failed|exception|rejected|refused/i.test(line);
              const isWarn = /warning|advertencia|timeout/i.test(line);
              const isNodedLog = line.includes('node[');
              
              let lineClass = "text-slate-300";
              if (isError) lineClass = "text-red-400 bg-red-950/20 font-bold";
              else if (isWarn) lineClass = "text-amber-400 bg-amber-950/10";
              else if (isNodedLog) lineClass = "text-emerald-300";

              return (
                <div key={idx} className={`hover:bg-slate-900/40 py-0.5 px-1.5 rounded transition-colors flex items-start gap-2.5 ${lineClass}`}>
                  <span className="text-slate-600 select-none text-right w-[20px] text-[9.5px]">{(idx + 1).toString().padStart(2, '0')}</span>
                  <span className="whitespace-pre-wrap select-text leading-normal break-all">
                    {line}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[10px] font-sans text-slate-500 leading-normal flex items-start gap-1 p-2 bg-slate-950/40 rounded-xl border border-slate-900/60">
          <span className="text-violet-400 font-bold">ℹ Análisis de Depuración:</span>
          <p>
            El servicio de node de sat-aprs en GNU/Linux Debian 13 registra todas las excepciones no capturadas. Si visualiza <strong className="text-red-400">ECONNREFUSED</strong> o errores de resolución DNS, compruebe que los deambones asociados <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 text-[10px]">gpsd.service</code> y <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 text-[10px]">direwolf.service</code> están cargados en los sockets de kernel correspondientes.
          </p>
        </div>
      </div>

    </div>
  );
}
