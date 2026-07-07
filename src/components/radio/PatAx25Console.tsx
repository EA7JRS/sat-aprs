import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  Inbox, 
  Settings, 
  Globe, 
  Radio, 
  RefreshCw, 
  Terminal, 
  Save, 
  Trash, 
  AlertTriangle, 
  Play, 
  Square, 
  ExternalLink,
  Search,
  Sliders,
  HardDrive,
  FileCode,
  CheckCircle,
  FileText,
  Clock,
  ArrowRight
} from 'lucide-react';

interface RMSChannel {
  callsign: string;
  frequency: string;
  mode: 'AX.25 1200' | 'VARA FM' | 'VARA HF' | 'ARDOP' | 'PACTOR III';
  locator: string;
  distanceKm: number;
  bearing: string;
  status: 'ONLINE' | 'STANDBY' | 'MAINTENANCE';
  city: string;
}

interface OutboxMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  sizeBytes: number;
}

interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  timestamp: string;
}

const INITIAL_RMS_CHANNELS: RMSChannel[] = [
  { callsign: 'EA1URG-10', frequency: 'VHF 144.850 MHz', mode: 'AX.25 1200', locator: 'IN80do', distanceKm: 8, bearing: 'NNE', status: 'ONLINE', city: 'Santiago (Local)' },
  { callsign: 'EA4URE-10', frequency: 'VHF 144.975 MHz', mode: 'VARA FM', locator: 'IN80do', distanceKm: 12.5, bearing: 'SE', status: 'ONLINE', city: 'Madrid Norte' },
  { callsign: 'EA1RCI-10', frequency: 'HF 7.045 MHz', mode: 'VARA HF', locator: 'IN72ki', distanceKm: 245, bearing: 'NW', status: 'ONLINE', city: 'Cantabria RMS' },
  { callsign: 'EA2RCF-10', frequency: 'VHF 144.850 MHz', mode: 'AX.25 1200', locator: 'IN91om', distanceKm: 310, bearing: 'NE', status: 'STANDBY', city: 'Zaragoza Central' },
  { callsign: 'EA3RCO-10', frequency: 'HF 14.110 MHz', mode: 'PACTOR III', locator: 'JN11cn', distanceKm: 520, bearing: 'E', status: 'ONLINE', city: 'Barcelona Mar' },
  { callsign: 'ED3YAK-10', frequency: 'VHF 144.950 MHz', mode: 'VARA FM', locator: 'JN11cl', distanceKm: 508, bearing: 'E', status: 'ONLINE', city: 'Tarragona Costas' },
  { callsign: 'F8KFH-10', frequency: 'HF 14.108 MHz', mode: 'VARA HF', locator: 'JN29xe', distanceKm: 1150, bearing: 'NNE', status: 'ONLINE', city: 'RMS Francia Sur' },
  { callsign: 'G8ZRE-10', frequency: 'HF 7.048 MHz', mode: 'ARDOP', locator: 'IO83te', distanceKm: 1420, bearing: 'N', status: 'MAINTENANCE', city: 'RMS Reino Unido' }
];

const INITIAL_INBOX: InboxMessage[] = [
  {
    id: 'msg-01',
    from: 'EA1URG (Protección Civil)',
    subject: 'INFORME DE ENSAYO RED SAT-APRS ESPAÑA',
    body: 'Handshake inicial completado correctamente. Servidores de correo Winlink se sincronizaron con éxito sobre repetidor local. Todo correcto.',
    timestamp: '2026-06-22 10:15'
  },
  {
    id: 'msg-02',
    from: 'SYSTEM (Winlink RMS)',
    subject: 'Welcome to Winlink EA Node',
    body: 'Thanks for connecting to EA1URG Winlink gateway. Your locator is IN80do. Active modes: AX.25, VARA FM. Have a great radio session.',
    timestamp: '2026-06-22 10:17'
  }
];

interface PatAx25ConsoleProps {
  callsign?: string;
}

export default function PatAx25Console({ callsign = 'EA1URG-10' }: PatAx25ConsoleProps) {
  // Pat service states
  const [patActive, setPatActive] = useState<boolean>(true);
  const [patConnecting, setPatConnecting] = useState<boolean>(false);
  const [patLogs, setPatLogs] = useState<string[]>([
    '[Pat Mail Server] Iniciado en puerto local 8080.',
    '[Pat Mail Server] Servidor backend escuchando en http://localhost:8080',
    '[Pat Mail Server] Sesiones AX.25 en espera sobre wl0 y ap0.'
  ]);

  useEffect(() => {
    if (callsign) {
      setBeaconText(`${callsign} S.A.T-APRS Winlink Gateway - Activo 144.850 MHz`);
    }
  }, [callsign]);

  // Winlink Forms
  const [formTo, setFormTo] = useState<string>('');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formBody, setFormBody] = useState<string>('');
  const [showCompose, setShowCompose] = useState<boolean>(false);

  // Queues
  const [outbox, setOutbox] = useState<OutboxMessage[]>([
    {
      id: 'out-01',
      to: 'REMEDY-PC@winlink.org',
      subject: 'Prueba de telecomunicaciones satelitales - SAT',
      body: 'Transmitido sobre balizas AX.25 usando el terminal portátil SAT-APRS y un Intel NUC Debian 13.',
      timestamp: '2026-06-22 11:30',
      sizeBytes: 154
    }
  ]);
  const [inbox, setInbox] = useState<InboxMessage[]>(INITIAL_INBOX);
  const [activeMessage, setActiveMessage] = useState<InboxMessage | OutboxMessage | null>(null);

  // Channels filter
  const [rmsSearch, setRmsSearch] = useState<string>('');
  const [rmsChannels, setRmsChannels] = useState<RMSChannel[]>(INITIAL_RMS_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState<RMSChannel | null>(INITIAL_RMS_CHANNELS[0]);
  const [patWebUrl, setPatWebUrl] = useState<string>('http://localhost:8080');

  // AX.25 Tools States
  const [axportsContent, setAxportsContent] = useState<string>('');
  const [patConfigContent, setPatConfigContent] = useState<string>('');
  const [activeConfigTab, setActiveConfigTab] = useState<'pat' | 'axports'>('pat');
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  const [configSuccess, setConfigSuccess] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Interactive Live axlisten Sniffer
  const [axlistenActive, setAxlistenActive] = useState<boolean>(false);
  const [axTraffic, setAxTraffic] = useState<string[]>([
    'wl0: fm EA1URG-10 to APDIW1 via WIDE1-1,WIDE2-1 ctl UI pid=F0 [11:15:30]',
    'wl0: fm EA4URE-10 to BEACON ctl UI pid=F0 [11:15:45] <UI> RMS Gate EA4URE-10 Active on 144.975MHz VaraFM',
    'wl0: fm EA1RCI-10 to APD102 ctl UI pid=F0 [11:16:10] <UI> [Gater] Cantabria internet-gateway on-air',
  ]);

  // Interactive beacon
  const [beaconInterval, setBeaconInterval] = useState<number>(10);
  const [beaconText, setBeaconText] = useState<string>('EA1URG-10 S.A.T-APRS Winlink Gateway - Activo 144.850 MHz');
  const [beaconLogs, setBeaconLogs] = useState<string[]>([]);

  // mheard station list
  const [mheardList, setMheardList] = useState([
    { call: 'EA1URG-10', port: 'wl0', count: 42, lastHeard: 'Hace 1 min', mode: 'AX.25' },
    { call: 'EA4URE-10', port: 'wl0', count: 18, lastHeard: 'Hace 4 min', mode: 'VARA' },
    { call: 'EA1RCI-10', port: 'wl0', count: 2, lastHeard: 'Hace 12 min', mode: 'VARA' },
    { call: 'EB1KAA-12', port: 'ap0', count: 6, lastHeard: 'Hace 18 min', mode: 'AX.25' },
    { call: 'EA2RCF-10', port: 'wl0', count: 1, lastHeard: 'Hace 1 hora', mode: 'AX.25' }
  ]);

  // Load backend configurations
  const loadConfigs = async () => {
    try {
      const r = await customFetch('/api/files/configs');
      const d = await r.json();
      if (d) {
        if (d.pat) setPatConfigContent(d.pat);
        if (d.axports) setAxportsContent(d.axports);
      }
    } catch (err) {
      console.error('Error al cargar configuraciones de Pat/Axports:', err);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // Save backend config files
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigSuccess(false);
    setConfigError(null);
    const content = activeConfigTab === 'pat' ? patConfigContent : axportsContent;
    try {
      const r = await customFetch('/api/files/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: activeConfigTab, content })
      });
      const resData = await r.json();
      if (resData && resData.success) {
        setConfigSuccess(true);
        setTimeout(() => setConfigSuccess(false), 3000);
      } else {
        setConfigError(resData.error || 'No se pudo guardar el archivo');
      }
    } catch (err: any) {
      setConfigError(err.message || String(err));
    } finally {
      setConfigValue();
      setConfigSaving(false);
    }
  };

  const setConfigValue = () => {
    // If we changed callsigns in pat file, parse and make it dynamic
    try {
      if (activeConfigTab === 'pat') {
        const obj = JSON.parse(patConfigContent);
        if (obj.mycall) {
          // Sync UI
        }
      }
    } catch (_) {}
  };

  // Filter channels
  useEffect(() => {
    if (!rmsSearch.trim()) {
      setRmsChannels(INITIAL_RMS_CHANNELS);
    } else {
      const q = rmsSearch.toLowerCase();
      setRmsChannels(INITIAL_RMS_CHANNELS.filter(c => 
        c.callsign.toLowerCase().includes(q) || 
        c.mode.toLowerCase().includes(q) || 
        c.city.toLowerCase().includes(q)
      ));
    }
  }, [rmsSearch]);

  // Toggle PAT Service
  const togglePatService = async () => {
    const nextState = !patActive;
    setPatActive(nextState);
    if (!nextState) {
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [Pat Mail Server] Servidor PAT detenido.`]);
    } else {
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [Pat Mail Server] Servidor PAT iniciado en http://localhost:8080/`]);
    }
  };

  // Run Winlink Email connection (telnet or radio fallback)
  const runWinlinkConnect = (mode: 'telnet' | 'ax.25', targetChannel?: RMSChannel) => {
    if (patConnecting) return;
    setPatConnecting(true);
    const timeStr = new Date().toLocaleTimeString();
    
    setPatLogs(prev => [...prev, `[${timeStr}] Initiating mail session via ${mode.toUpperCase()}...`]);
    
    if (mode === 'telnet') {
      setPatLogs(prev => [...prev, `[${timeStr}] Sincronizando con telnet://rms.winlink.org:8772`]);
    } else {
      const target = targetChannel || selectedChannel;
      setPatLogs(prev => [...prev, `[${timeStr}] Conectando al Gateway RMS [${target?.callsign ?? 'EA1URG-10'}] en Frecuencia: ${target?.frequency ?? 'VHF 144.850 MHz'}`]);
      setPatLogs(prev => [...prev, `[${timeStr}] Enviando trama de enlace SABM sobre canal wl0...`]);
    }

    // Simulate transfer stages
    setTimeout(() => {
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Enlace AX.25 de nivel 2 establecido.`]);
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Handshake Winlink completado. Logged in.`]);
    }, 1200);

    setTimeout(() => {
      const totalOutboxCount = outbox.length;
      if (totalOutboxCount > 0) {
        setPatLogs(prev => [
          ...prev, 
          `[${new Date().toLocaleTimeString()}] Transmitiendo mensaje de salida saliente: ${outbox[0].id} destinario ${outbox[0].to} (${outbox[0].sizeBytes} bytes)...`
        ]);
        // transfer mail
        setOutbox([]);
        setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Transmisión completada satisfactoriamente.`]);
      } else {
        setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Outbox vacío. No hay correo que adjuntar/enviar.`]);
      }
    }, 2800);

    setTimeout(() => {
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Comprobando pila de entrada (Inbox)...`]);
      // Simular recibir un correo de prueba de control civil
      const mockRecv: InboxMessage = {
        id: `msg-${Date.now()}`,
        from: selectedChannel ? `${selectedChannel.callsign.split('-')[0]}@winlink.org` : 'EA1URG-10@winlink.org',
        subject: `Respuesta de baliza ${selectedChannel ? selectedChannel.callsign : 'EA1URG'}`,
        body: `Recibido enlace de emergencia. Intensidad del enlace AX.25 excelente. Modo: ${selectedChannel ? selectedChannel.mode : 'AX.25 1200'}. Operador remoto listo.`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
      };
      setInbox(prev => [mockRecv, ...prev]);
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Recibido (1) nuevo mensaje de correo Winlink.`]);
    }, 4200);

    setTimeout(() => {
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sesión finalizada por el host remoto. Desconectando.`]);
      setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Enlace AX.25 colgado. Retorno a escucha.`]);
      setPatConnecting(false);
    }, 5500);
  };

  // Send composing
  const handleComposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTo || !formSubject || !formBody) return;

    const newMsg: OutboxMessage = {
      id: `out-${Date.now().toString().slice(-4)}`,
      to: formTo,
      subject: formSubject,
      body: formBody,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      sizeBytes: formBody.length + formSubject.length + 32
    };

    setOutbox(prev => [...prev, newMsg]);
    setFormTo('');
    setFormSubject('');
    setFormBody('');
    setShowCompose(false);
    setPatLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [Fórmula Winlink] Nuevo mensaje preparado en la bandeja de salida (Outbox).`]);
  };

  // Simulates live axlisten traffic
  useEffect(() => {
    if (!axlistenActive) return;
    const interval = setInterval(() => {
      const randomCalls = ['EB1KAA-12', 'EA1URG-13', 'EA1RCI-10', 'EA4URE-10', 'EA3RCO', 'EA2RCF-8'];
      const randomTo = ['APDIW1', 'APRX29', 'BEACON', 'CQ', 'IDENT'];
      const call = randomCalls[Math.floor(Math.random() * randomCalls.length)];
      const to = randomTo[Math.floor(Math.random() * randomTo.length)];
      const info = [
        '<UI> S.A.T. Nodo de Radio VHF Escucha activa',
        `<UI> Trama de telemetría de emergencia`,
        '<UI> Sismología sismógrafo IGN acoplado',
        `Connect Request to ${to}`,
        `Disconnect Request`,
        `<UI> weewx meteo temp=22.4C hum=45% bar=1013.2hPa`
      ][Math.floor(Math.random() * 6)];

      const line = `wl0: fm ${call} to ${to} ctl UI pid=F0 [${new Date().toLocaleTimeString()}] ${info}`;
      setAxTraffic(prev => [line, ...prev.slice(0, 30)]);
    }, 3800);

    return () => clearInterval(interval);
  }, [axlistenActive]);

  // Command-line Trigger custom beacon
  const triggerBeacon = () => {
    const timeStr = new Date().toLocaleTimeString();
    const formatted = `wl0: fm EA1URG-10 to BEACON ctl UI pid=F0 [${timeStr}] <UI> ${beaconText}`;
    setBeaconLogs(prev => [`[${timeStr}] Transmitiendo baliza AX.25 sobre puerto wl0...`, `[${timeStr}] RF TX ON (144.850 MHz AFSK)`, `[${timeStr}] RF TX OFF (Packet de exitoso)`, ...prev]);
    setAxTraffic(prev => [formatted, ...prev]);
  };

  return (
    <div className="flex flex-col gap-6" id="pat-winlink-ax25-container">
      
      {/* HEADER EXCLUSIVO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-violet-950/60 border border-violet-500/30 flex items-center justify-center">
                <Mail className="text-violet-400 stroke-[1.5]" size={24} />
              </div>
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-violet-950 text-violet-300 font-bold px-2 py-0.5 rounded border border-violet-800/20 tracking-wider">
                  S.O. DEBIAN 13 NATIVO
                </span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-800/20 tracking-wider">
                  STANDALONE
                </span>
              </div>
              <h1 className="font-sans font-black text-lg text-slate-100 uppercase tracking-tight mt-1">
                Pilar X: Pat Winlink Client & AX.25 Subsystem
              </h1>
              <p className="text-xs text-slate-400 max-w-2xl mt-1 leading-relaxed">
                Gestión unificada de correo de contingencia por radio de Winlink a través de Pat y de la pila nativa del kernel GNU/Linux AX.25 para radiocomunicación de baja velocidad por balizas o BBS.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-mono">ESTADO MOTOR PAT</span>
                <span className="text-xs font-bold font-mono text-emerald-400 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${patActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                  {patActive ? 'ACTIVO (PORT 8080)' : 'DETENIDO'}
                </span>
              </div>
              <button
                onClick={togglePatService}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  patActive 
                    ? 'bg-red-950/30 hover:bg-red-950/60 text-red-400 border-red-900/30' 
                    : 'bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-400 border-emerald-900/30'
                }`}
                title={patActive ? 'Detener Servicio Pat' : 'Iniciar Servicio Pat'}
              >
                {patActive ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BLOQUE DE TRES COLUMNAS PRINCIPALES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUMNA DE CORREO WINLINK CLIENTE PAT (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* BANCO DE CORREO (INBOX / OUTBOX / ENLACE) */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="text-violet-400" size={18} />
                <h2 className="font-sans font-bold text-sm text-slate-200 uppercase tracking-wider">
                  Terminal de Correo Winlink (Bandeja SAT)
                </h2>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCompose(!showCompose)}
                  className="px-2.5 py-1 bg-violet-950 text-violet-300 hover:bg-violet-900 border border-violet-850 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Send size={11} />
                  Redactar Correo
                </button>
              </div>
            </div>

            {/* BOTÓN CONEXIÓN MANUAL RAPIDA */}
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-900 grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <div>
                <p className="text-xs font-bold text-slate-300">Conexión de Correo de Emergencia</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Active las pasarelas enviando y descargando tramas con la red Winlink mundial.
                </p>
              </div>
              <div className="flex justify-end gap-1.5 flex-wrap">
                <button
                  onClick={() => runWinlinkConnect('telnet')}
                  disabled={patConnecting || !patActive}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 disabled:opacity-40 border border-slate-800 rounded font-mono text-[10px] font-black text-slate-300 flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Globe size={11} className="text-blue-400" />
                  TELNET (INTERNET)
                </button>
                <button
                  onClick={() => runWinlinkConnect('ax.25')}
                  disabled={patConnecting || !patActive}
                  className="px-2.5 py-1.5 bg-violet-950 hover:bg-violet-900 disabled:opacity-40 border border-violet-850 rounded font-mono text-[10px] font-black text-violet-300 flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Radio size={11} className="text-emerald-400" />
                  RADIO AX.25
                </button>
              </div>
            </div>

            {/* COMPOSE FORM COMPONENT (IF TOGGLED) */}
            {showCompose && (
              <form onSubmit={handleComposeSubmit} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <span className="text-xs font-bold text-violet-400 flex items-center gap-1">
                    <Send size={12} /> Redactar Correo de Contingencia (Winlink format)
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setShowCompose(false)}
                    className="text-slate-500 hover:text-slate-300 text-[10px] uppercase font-mono font-bold"
                  >
                    Cancelar
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-mono uppercase mb-1">Destinatario (e.g. EA4URE / callsign@winlink.org)</label>
                    <input
                      type="text"
                      required
                      value={formTo}
                      onChange={(e) => setFormTo(e.target.value)}
                      placeholder="EA1URG / manuel@gmail.com"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-mono uppercase mb-1">Asunto / Referencia</label>
                    <input
                      type="text"
                      required
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      placeholder="ESTADO DE CARRETERAS EN SANTIAGO"
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-mono uppercase mb-1">Texto del mensaje (Sea conciso para transmisiones RF)</label>
                  <textarea
                    required
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder="Se reporta inundación en el tramo de acceso norte de la carretera. No hay suministro local...."
                    rows={4}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 font-sans text-xs font-black text-white rounded shadow transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Encolar en Outbox</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </form>
            )}

            {/* INBOX E OUTBOX SUMMARY PANEL */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              
              {/* SIDEBAR LISTS (INBOX & OUTBOX SECTIONS) */}
              <div className="md:col-span-5 flex flex-col gap-3">
                <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-900 flex flex-col gap-2 h-[220px] overflow-y-auto">
                  <div className="text-[10px] font-bold text-slate-500 font-mono uppercase border-b border-slate-900 pb-1 flex justify-between items-center">
                    <span>📤 OUTBOX ({outbox.length})</span>
                    <span className="text-[8px] text-amber-500 animate-pulse">Pendiente de TX</span>
                  </div>
                  {outbox.length === 0 ? (
                    <p className="text-[10px] text-slate-600 italic py-4 text-center">No hay correos en cola</p>
                  ) : (
                    outbox.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setActiveMessage(m)}
                        className={`text-left text-[11px] p-1.5 rounded border transition-all ${
                          activeMessage?.id === m.id 
                            ? 'bg-amber-950/20 border-amber-600/50 text-amber-300' 
                            : 'bg-slate-900/60 border-slate-850 hover:bg-slate-850 text-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold truncate max-w-[80px]">{m.to}</span>
                          <span className="text-[8px] text-slate-500 font-mono">{m.sizeBytes} B</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.subject}</div>
                      </button>
                    ))
                  )}

                  <div className="text-[10px] font-bold text-slate-500 font-mono uppercase border-b border-slate-900 pb-1 pt-2 flex justify-between items-center">
                    <span>📩 INBOX ({inbox.length})</span>
                  </div>
                  {inbox.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveMessage(m)}
                      className={`text-left text-[11px] p-1.5 rounded border transition-all ${
                        activeMessage?.id === m.id 
                          ? 'bg-violet-950/20 border-violet-600/50 text-violet-300' 
                          : 'bg-slate-900/60 border-slate-850 hover:bg-slate-850 text-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold truncate max-w-[90px]">{m.from}</span>
                        <span className="text-[8px] text-slate-500 font-mono">{m.timestamp.substring(11)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.subject}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* MESSAGE PREVIEWER */}
              <div className="md:col-span-7 bg-slate-950 rounded-xl p-3 border border-slate-900 flex flex-col justify-between h-[220px]">
                {activeMessage ? (
                  <div className="flex flex-col gap-2 overflow-y-auto leading-relaxed h-[180px] text-xs h-full">
                    <div className="border-b border-slate-900 pb-2">
                      <div className="flex justify-between text-[10px] font-mono text-slate-500 uppercase">
                        <span>Origen/Dest: <strong className="text-violet-400">{'from' in activeMessage ? activeMessage.from : activeMessage.to}</strong></span>
                        <span>{activeMessage.timestamp}</span>
                      </div>
                      <h3 className="font-sans font-bold text-slate-200 text-xs mt-1">
                        Asunto: {activeMessage.subject}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed py-1 bg-black/30 p-2 rounded border border-slate-900">
                      {activeMessage.body}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center text-slate-600 h-full py-12">
                    <Mail size={24} className="text-slate-800" />
                    <span className="text-[10px] uppercase font-mono tracking-wider mt-1.5">No hay mensaje seleccionado</span>
                    <span className="text-[9px] mt-0.5">Haga clic en un elemento del outbox o inbox para previsualizar.</span>
                  </div>
                )}
                {activeMessage && (
                  <div className="flex justify-end pt-2 border-t border-slate-900 mt-2">
                    <button
                      onClick={() => {
                        if ('from' in activeMessage) {
                          setInbox(prev => prev.filter(m => m.id !== activeMessage.id));
                        } else {
                          setOutbox(prev => prev.filter(m => m.id !== activeMessage.id));
                        }
                        setActiveMessage(null);
                      }}
                      className="text-[9px] text-red-400 hover:text-red-300 flex items-center gap-1 font-mono uppercase bg-red-950/10 px-2 py-1 rounded border border-red-900/10 cursor-pointer"
                    >
                      <Trash size={9} /> Eliminar
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* INTEGRACIÓN DEL SERVIDOR WEB LOCAL DE PAT (PAT WEB UI CONTROLLER) */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 flex flex-col gap-2">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sliders size={13} className="text-violet-400" />
                  Acceso a la Interfaz Web Local de Pat (Go Engine)
                </span>
                <span className="text-[9px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded font-mono">
                  Enrutamiento Directo
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Por defecto, Pat proporciona un servidor de correo con una interfaz web integrada de gran potencia. Puede acceder a él directamente en los puertos de red del host:
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                <div className="bg-slate-900/50 p-2.5 rounded border border-slate-850 flex items-center justify-between">
                  <div>
                    <span className="block text-[8px] text-slate-500 font-mono">PUERTO WEB LOCAL</span>
                    <span className="text-xs font-bold font-mono text-violet-400">{patWebUrl}</span>
                  </div>
                  <a
                    href={patWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 bg-violet-950 hover:bg-violet-900 rounded text-violet-300 border border-violet-850"
                    title="Abrir Pat Web"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="bg-slate-900/50 p-2.5 rounded border border-slate-850 flex flex-col justify-center">
                  <label className="block text-[8px] text-slate-500 font-mono uppercase">Dirección de Red Remota</label>
                  <input
                    type="text"
                    value={patWebUrl}
                    onChange={(e) => setPatWebUrl(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold font-mono text-slate-300 p-0 focus:ring-0 focus:outline-none w-full"
                    placeholder="http://localhost:8080"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* TERMINAL DE DEBUG DE PAT */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Terminal size={14} className="text-violet-400" />
                Terminal Log del Motor de Correo Pat (Telesecuridad)
              </span>
              <button 
                onClick={async () => {
                  setPatLogs([]);
                  try {
                    await customFetch('/api/system/clear-service-logs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ service: 'pat' })
                    });
                  } catch (err) {
                    console.error('Error clearing pat logs:', err);
                  }
                }}
                className="text-[9px] text-slate-500 hover:text-slate-300 font-mono uppercase"
              >
                Limpiar Terminal
              </button>
            </div>

            <div className="bg-black/95 p-3 rounded-xl border border-slate-950 h-[150px] overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-300 scrollbar-thin scrollbar-thumb-slate-800">
              {patLogs.length === 0 ? (
                <p className="text-slate-600">Terminal vacía, esperando señales...</p>
              ) : (
                patLogs.map((log, i) => {
                  let logClass = "text-slate-400";
                  if (log.includes('Initiating') || log.includes('Sincronizando')) logClass = "text-yellow-300 font-bold";
                  else if (log.includes('establecido') || log.includes('Handshake') || log.includes('completada')) logClass = "text-emerald-400";
                  else if (log.includes('Falló') || log.includes('Error')) logClass = "text-red-400";
                  
                  return (
                    <div key={i} className={`py-0.5 ${logClass}`}>
                      &gt; {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: RMS FINDER Y AX.25 BAJO NIVEL (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* BUSCADOR DE CANALES WINLINK RMS CHANNELS */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="font-sans font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Globe className="text-emerald-400" size={18} />
                Buscador Winlink RMS Channels (España/EA)
              </h2>
              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                Verifique los repetidores y enlaces coordinados con la base de datos de <a href="https://cms.winlink.org:444/GatewayChannels.aspx" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-0.5">cms.winlink.org <ExternalLink size={8} /></a>.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-500" size={13} />
              <input
                type="text"
                value={rmsSearch}
                onChange={(e) => setRmsSearch(e.target.value)}
                placeholder="Filtrar por indicativo, modo (VARA, AX.25)..."
                className="w-full bg-slate-950 border border-slate-850 rounded-lg py-2 pl-9 pr-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="bg-slate-950 rounded-xl p-2 border border-slate-900 max-h-[220px] overflow-y-auto flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {rmsChannels.length === 0 ? (
                <p className="text-[10px] text-slate-650 italic text-center py-6">No se encontraron canales que coincidan.</p>
              ) : (
                rmsChannels.map((c) => {
                  const isSelected = selectedChannel?.callsign === c.callsign;
                  return (
                    <button
                      key={c.callsign}
                      type="button"
                      onClick={() => setSelectedChannel(c)}
                      className={`text-left text-xs p-2.5 rounded-lg border transition-all flex flex-col gap-1 ${
                        isSelected 
                          ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-300' 
                          : 'bg-slate-900/60 border-slate-850 hover:bg-slate-850 text-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-bold text-slate-100 flex items-center gap-1">
                          <Radio size={11} className={isSelected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
                          {c.callsign}
                        </span>
                        <span className={`text-[8px] font-mono font-black border px-1.5 py-0.2 rounded ${
                          c.status === 'ONLINE' ? 'bg-emerald-950 text-emerald-400 border-emerald-900/40' :
                          c.status === 'STANDBY' ? 'bg-blue-950 text-blue-400 border-blue-900/40' :
                          'bg-red-950 text-red-400 border-red-900/40'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-400 mt-1">
                        <span>Frencuencia: <strong className="text-slate-200">{c.frequency}</strong></span>
                        <span>Modo: <strong className="text-slate-250 text-violet-400">{c.mode}</strong></span>
                        <span>Ubicación: <strong className="text-slate-200">{c.city}</strong></span>
                        <span>Distancia: <strong className="text-slate-300">{c.distanceKm} km ({c.bearing})</strong></span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedChannel && (
              <div className="bg-slate-950 border border-slate-900 p-3 rounded-xl flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 font-mono">RMS SELECCIONADO</span>
                  <span className="text-[9px] text-slate-500 font-mono">Locator: {selectedChannel.locator}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-400">{selectedChannel.callsign}</span>
                  <span className="text-xs text-slate-300">({selectedChannel.city})</span>
                </div>
                <button
                  onClick={() => runWinlinkConnect('ax.25', selectedChannel)}
                  disabled={patConnecting || selectedChannel.status !== 'ONLINE'}
                  className="w-full py-1.5 bg-emerald-950 hover:bg-emerald-900 disabled:opacity-40 text-emerald-400 font-bold font-mono text-xs border border-emerald-900/40 rounded cursor-pointer transition-all uppercase flex items-center justify-center gap-1.5"
                >
                  <Send size={11} />
                  Acoplar y Realizar Conexión de Correo
                </button>
              </div>
            )}
          </div>

          {/* CONFIGURACIÓN BAJO NIVEL (axports / config.json) */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-sans font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileCode className="text-violet-400" size={18} />
                Editor de Configuración de Red
              </h2>

              <div className="flex gap-1 bg-slate-950 p-0.5 rounded border border-slate-850">
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('pat')}
                  className={`px-2 py-1 text-[10px] font-mono leading-none rounded font-bold ${
                    activeConfigTab === 'pat' ? 'bg-violet-950 text-violet-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  pat.json
                </button>
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('axports')}
                  className={`px-2 py-1 text-[10px] font-mono leading-none rounded font-bold ${
                    activeConfigTab === 'axports' ? 'bg-violet-950 text-violet-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  axports
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 leading-none">
                <span>Ruta de edición real en Debian:</span>
                <span className="text-slate-400 font-bold">
                  {activeConfigTab === 'pat' ? '/root/.config/pat/config.json' : '/etc/ax25/axports'}
                </span>
              </div>
              
              <textarea
                value={activeConfigTab === 'pat' ? patConfigContent : axportsContent}
                onChange={(e) => activeConfigTab === 'pat' ? setPatConfigContent(e.target.value) : setAxportsContent(e.target.value)}
                rows={7}
                className="w-full bg-slate-950 border border-slate-900 hover:border-slate-850 font-mono text-[10.5px] p-3 text-slate-300 leading-relaxed rounded-xl focus:outline-none focus:border-violet-500 overflow-x-auto select-all"
              />
            </div>

            {configError && (
              <div className="bg-red-950/40 border border-red-900/40 text-red-450 p-2 text-[10px] font-mono rounded-lg">
                Error: {configError}
              </div>
            )}

            <div className="flex justify-between items-center">
              <div>
                {configSuccess && (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1 animate-pulse">
                    <CheckCircle size={10} /> Escrito en Debye de forma impecable!
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={configSaving}
                onClick={handleSaveConfig}
                className="px-3 py-1.5 bg-purple-950 hover:bg-purple-900 border border-purple-900/40 text-purple-300 font-mono font-bold text-[10px] rounded cursor-pointer transition-all flex items-center gap-1.5 uppercase"
              >
                <Save size={11} />
                {configSaving ? 'Escribiendo...' : 'Escribir en Debian'}
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* BLOQUE HERRAMIENTAS AX.25 DE BAJO NIVEL DEBIAN */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="ax25-linux-native-suite">
        
        {/* PANEL DE AXLISTEN E SNIFFER DE PAQUETES (7 COLS) */}
        <div className="md:col-span-7 bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="text-emerald-400" size={18} />
              <div>
                <h3 className="font-sans font-bold text-sm text-slate-200 uppercase tracking-wider">
                  Telesniffer de Paquetes de Radio (axlisten)
                </h3>
                <p className="text-[9.5px] text-slate-500 font-mono leading-none mt-0.5">
                  Decodificación cruda del protocolo AX.25 Nivel 2 en tiempo real desde puertos KISS en Debian
                </p>
              </div>
            </div>

            <button
              onClick={() => setAxlistenActive(!axlistenActive)}
              className={`px-3 py-1 rounded font-mono text-[10px] font-black transition-all cursor-pointer ${
                axlistenActive 
                  ? 'bg-amber-950 text-amber-400 border border-amber-900' 
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-900'
              }`}
            >
              {axlistenActive ? 'PARAR ESCUCHA' : 'MONITORIZAR RF (KISS)'}
            </button>
          </div>

          <div className="bg-black/95 p-3 rounded-xl border border-slate-950 h-[190px] overflow-y-auto font-mono text-[9.5px] text-slate-400 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
            {axTraffic.map((line, idx) => {
              const isUI = line.includes('ctl UI');
              let c = 'text-slate-400';
              if (isUI) c = 'text-emerald-400/90';
              if (line.includes('weewx')) c = 'text-amber-400/90';
              if (line.includes('Connect Request')) c = 'text-blue-400 font-bold';
              if (line.includes('Disconnect')) c = 'text-red-400';

              return (
                <div key={idx} className={`py-0.5 whitespace-nowrap hover:bg-slate-900/50 px-1 border-b border-slate-950/20 ${c}`}>
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        {/* HERRAMIENTAS AX.25: mheard y Balizas beacons (5 COLS) */}
        <div className="md:col-span-5 flex flex-col gap-6">
          
          {/* LANZAMIENTO CONTROLADO DE BALIZAS AX.25 (beacon) */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Radio size={14} className="text-emerald-400" />
                Lanzador de Balizas de Radio (ax25-beacon)
              </span>
              <span className="text-[8px] bg-slate-950 border border-slate-850 font-mono text-slate-500 px-2 py-0.5 rounded leading-none">
                bin/beacon
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[8px] text-slate-500 font-mono uppercase mb-0.5">Texto del beacon (info)</label>
                  <input
                    type="text"
                    value={beaconText}
                    onChange={(e) => setBeaconText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-[10.5px] font-mono text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] text-slate-500 font-mono uppercase mb-0.5">Intervalo (S.)</label>
                  <input
                    type="number"
                    value={beaconInterval}
                    onChange={(e) => setBeaconInterval(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-[10.5px] font-mono text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[9px] text-slate-500 font-mono leading-none">Configurado sobre puerto local wl0</span>
                <button
                  type="button"
                  onClick={triggerBeacon}
                  className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-900/40 text-emerald-400 text-[10px] font-bold font-mono rounded cursor-pointer transition-all uppercase"
                >
                  Transmitir Baliza YA
                </button>
              </div>

              {beaconLogs.length > 0 && (
                <div className="bg-black/95 p-2 rounded-lg border border-slate-950 max-h-[80px] overflow-y-auto text-[9px] font-mono text-slate-500 leading-normal scrollbar-thin">
                  {beaconLogs.map((bl, i) => (
                    <div key={i}>{bl}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ESCUCHADOS APÉNDICE (ax25 mheard list) */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Clock size={14} className="text-violet-400" />
                Estaciones Escuchadas en Directo (mheard)
              </span>
              <span className="text-[8px] bg-slate-950 border border-slate-850 font-mono text-slate-500 px-2 py-0.5 rounded leading-none">
                usr/bin/mheard
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[10.5px]">
                <thead>
                  <tr className="border-b border-slate-950 text-slate-500">
                    <th className="pb-1.5 font-normal uppercase">Indicativo</th>
                    <th className="pb-1.5 font-normal uppercase">Puerto</th>
                    <th className="pb-1.5 font-normal uppercase text-center">Tramas</th>
                    <th className="pb-1.5 font-normal uppercase text-right">Último Oído</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-950/35">
                  {mheardList.map((st, idx) => (
                    <tr key={idx} className="text-slate-300 hover:bg-slate-950/20">
                      <td className="py-1.5 font-black text-slate-100">{st.call}</td>
                      <td className="py-1.5 text-violet-400">{st.port}</td>
                      <td className="py-1.5 text-center text-slate-400">{st.count}</td>
                      <td className="py-1.5 text-right text-slate-500">{st.lastHeard}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={() => {
                  setMheardList(prev => prev.map(item => ({
                    ...item,
                    count: item.count + Math.floor(Math.random() * 3),
                    lastHeard: 'Hace 0 s'
                  })));
                }}
                className="text-[9px] text-slate-500 hover:text-slate-350 font-mono flex items-center gap-0.5 cursor-pointer uppercase"
              >
                <RefreshCw size={8} /> Forzar Escaner
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
