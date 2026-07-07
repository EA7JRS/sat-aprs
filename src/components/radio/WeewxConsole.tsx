import React, { useState, useEffect, useRef } from 'react';
import { 
  CloudSun, Wind, Thermometer, Droplets, Gauge, Compass, 
  Terminal, Shield, Database, Cpu, Play, RefreshCw, 
  FileCode, Settings, Check, AlertTriangle, PlayCircle, BarChart3, HelpCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line 
} from 'recharts';
import { getBeaufortInfoByKts } from '../../utils/beaufort';
import { customFetch } from '../../utils/customFetch';

interface WeewxConsoleProps {
  weather: {
    tempC: number;
    windSpeedKts: number;
    windDirDeg: number;
    humidityPct: number;
    pressureHpa: number;
    rain1hIn: number;
    rain24hIn: number;
    gustKts: number;
  };
  iqair?: {
    aqi: number;
    city: string;
    mainPollutant: string;
  };
  callsign?: string;
}

// Simulated historic records for Recharts
const generateInitialTrends = (baseTemp: number, basePress: number) => {
  const data = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600 * 1000);
    const hourStr = time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    // Add realistic wave variations
    const tempOffset = Math.sin((i / 24) * Math.PI * 2) * 4 + (Math.random() * 0.5 - 0.25);
    const pressOffset = Math.cos((i / 24) * Math.PI * 2) * 5 + (Math.random() * 0.3 - 0.15);
    const windOffset = Math.max(2, 6 + Math.sin((i / 12) * Math.PI) * 4 + (Math.random() * 2));
    const rainAccum = Math.max(0, 0.4 + Math.sin((i / 8) * Math.PI) * 0.3);

    data.push({
      time: hourStr,
      temp: parseFloat((baseTemp + tempOffset).toFixed(1)),
      pressure: parseFloat((basePress + pressOffset).toFixed(1)),
      windSpeed: parseFloat((windOffset).toFixed(1)),
      rain: parseFloat((rainAccum).toFixed(2)),
      aqi: Math.round(40 + Math.random() * 15 + Math.sin(i / 3) * 10)
    });
  }
  return data;
};

export default function WeewxConsole({ weather, iqair, callsign }: WeewxConsoleProps) {
  // Console state
  const [activeSubTab, setActiveSubTab] = useState<'console' | 'charts' | 'sqlite' | 'conf'>('console');
  const [isRunning, setIsRunning] = useState(true);
  const [driverMode, setDriverMode] = useState<'simulator' | 'hardware'>('hardware');
  const [weewxLogs, setWeewxLogs] = useState<string[]>([]);
  const [customQuery, setCustomQuery] = useState('SELECT datetime, outTemp, barometer, rain FROM archive ORDER BY datetime DESC LIMIT 5;');
  const [queryOutput, setQueryOutput] = useState<any[]>([]);
  const [isQueryExecuting, setIsQueryExecuting] = useState(false);
  const [activeChartSource, setActiveChartSource] = useState<'temp' | 'press' | 'wind' | 'rain' | 'aqi'>('temp');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({
    recordsCount: 249584,
    dbSizeMb: 34.2,
    schemaVersion: 23,
    archiveInterval: 300,
    uptime: '12d 4h 32m',
    totalRainToday: 2.4 // mm
  });

  // Trends
  const [chartData, setChartData] = useState(() => generateInitialTrends(weather.tempC, weather.pressureHpa));

  // Auto-logs stream simulator
  useEffect(() => {
    // Initial setup logs
    const initialLogs = [
      '[INFO] weewx.engine: Initializing weewxd daemon version 5.0.3...',
      '[INFO] weewx.engine: Using Python 3.11.2 (main, Mar 13 2023, 11:15:32)',
      '[INFO] weewx.engine: Platform Linux-6.1.0-9-amd64-x86_64-with-glibc2.36 (Debian 12)',
      '[INFO] weewx.engine: Config file parsed successfully (/etc/weewx/weewx.conf)',
      `[INFO] weewx.engine: Database module loaded. SQLite path: /var/lib/weewx/weewx.sdb`,
      `[INFO] weewx.engine: Loading station driver: weewx.drivers.${driverMode === 'simulator' ? 'simulator' : 'fousb'}`,
      `[OK] weewx.engine: Connected to station simulator. Serial/USB ID: SAT-NUC-F012`,
      '[INFO] weewx.engine: StdTimeSynch service loaded. Syncing clocks at interval 3600s',
      '[INFO] weewx.engine: StdConvert service loaded. Targeted systems: METRIC',
      '[INFO] weewx.engine: StdCalibrate service loaded. Applying calibration offsets',
      '[INFO] weewx.engine: StdArchive service loaded. Write archive interval: 300s',
      '[INFO] weewx.engine: StdRESTful service loaded. Direct exports active: CWOP, AEMET-Push',
      '[INFO] weewx.engine: System daemon weewx.service registered on systemd root. Starting MainLoop...',
      `[OK] weewx.engine: Engine is running in background. Standard loop active.`
    ];
    setWeewxLogs(initialLogs);
  }, []);

  // Periodic LOOP simulator tick
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      // Create new live measurements offsets
      const randomOffset = (Math.random() * 0.4 - 0.2);
      const currentTemp = (weather.tempC + randomOffset).toFixed(1);
      const currentHum = Math.round(weather.humidityPct + (Math.random() * 2 - 1));
      const currentPress = (weather.pressureHpa + (Math.random() * 0.2 - 0.1)).toFixed(1);
      const currentWind = (weather.windSpeedKts + (Math.random() * 1.5 - 0.75)).toFixed(1);
      const currentAqi = iqair ? iqair.aqi : 45;

      const timestamp = new Date().toLocaleTimeString('es-ES');
      const aprsPacket = `_12061412c272s002g004t072r000p000h45b10168 (${timestamp})`;

      // Compile logs
      const logsToAppend = [
        `[LOOP] weewx.engine: New sensor frame received (Driver: ${driverMode.toUpperCase()})`,
        `       ├─ data: outTemp=${currentTemp}°C, humidity=${currentHum}%, barometer=${currentPress}hPa, wind=${currentWind}kts, AQI=${currentAqi}`,
        `       └─ binding: Synced with server cache. Mapping variables to database schema.`,
        `[REST] weewx.restful: Transmitting CWOP/APRS packet to server gateway...`,
        `       └─ packet: CWOP-BEACON01>APRS,TCPIP*,qAC,WEEWX-GATE:${aprsPacket}`
      ];

      setWeewxLogs(prev => [...prev.slice(-35), ...logsToAppend]);

      // Add a periodic archive commit
      if (Math.random() > 0.7) {
        const timeNow = new Date();
        const archLog = `[ARCHIVE] weewx.manager: COMMITTED record to SQLite archive table. Datetime=${Math.floor(timeNow.getTime() / 1000)} (timestamp), rowid=${stats.recordsCount + 1}`;
        setWeewxLogs(prev => [...prev.slice(-35), archLog]);
        
        // Boost data count
        setStats(prev => ({
          ...prev,
          recordsCount: prev.recordsCount + 1,
          dbSizeMb: parseFloat((prev.dbSizeMb + 0.01).toFixed(3))
        }));

        // Append to charts
        const hourStr = timeNow.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        setChartData(prev => {
          const updated = [...prev.slice(1)];
          updated.push({
            time: hourStr,
            temp: parseFloat(currentTemp),
            pressure: parseFloat(currentPress),
            windSpeed: parseFloat(currentWind),
            rain: parseFloat((prev[prev.length - 1].rain + (Math.random() > 0.8 ? 0.2 : 0)).toFixed(2)),
            aqi: currentAqi
          });
          return updated;
        });
      }

    }, 7000);

    return () => clearInterval(interval);
  }, [isRunning, weather, iqair, driverMode, stats.recordsCount]);

  // Execute interactive SQL queries
  const handleExecuteQuery = () => {
    setIsQueryExecuting(true);
    setStatusMessage(null);

    setTimeout(() => {
      // Mock data according to query
      const now = Math.floor(new Date().getTime() / 1000);
      let results: any[] = [];
      
      if (customQuery.toLowerCase().includes('select') && customQuery.toLowerCase().includes('archive')) {
        results = Array.from({ length: 5 }).map((_, i) => ({
          dateTime: now - i * 300,
          outTemp: parseFloat((weather.tempC - i * 0.2).toFixed(1)),
          barometer: parseFloat((weather.pressureHpa - i * 0.1).toFixed(1)),
          rain: i === 2 ? 0.2 : 0.0,
          windSpeed: Math.round(weather.windSpeedKts + i)
        }));
      } else {
        results = [
          { error: "Query syntax valid, but target table is limited inside preview. Try standard 'SELECT * FROM archive' tables." }
        ];
      }

      setQueryOutput(results);
      setIsQueryExecuting(false);
      
      const sqlLog = `[SQLITE] Query executed successfully via pysqlite3 backend (took 14ms). ${results.length} rows returned.`;
      setWeewxLogs(prev => [...prev, sqlLog]);
    }, 850);
  };

  // Actions triggers
  const triggerAction = (actionName: string, detail: string) => {
    setStatusMessage(`Comando enviado al daemon: ${actionName}`);
    setTimeout(() => setStatusMessage(null), 4000);

    const timestamp = new Date().toLocaleTimeString('es-ES');
    let triggerLog = `[SYSTEM] ${timestamp} - Command executed: ${detail}...`;

    if (actionName === 'restart') {
      triggerLog = `[SYSTEM] stdout: restarting weewx.service...\n[INFO] weewx.engine: Shutdown signal received. Closing SQL connections.\n[INFO] Shutting driver...\n[INFO] Daemon weewx successfully restarted.`;
    } else if (actionName === 'generate') {
      triggerLog = `[HTMLGEN] stdout: weewx.report: Generating skins/Seasons templates...\n[HTMLGEN] Generated index.html, weekly.html, monthly.html (6.2 MB) in 1.48 seconds. Copying files to /var/www/html/weewx.`;
    } else if (actionName === 'write') {
      triggerLog = `[ARCHIVE] weewx.manager: FORCED instant sqlite page write block commit. Committing memory loops to table 'archive' (OK).`;
      setStats(prev => ({
        ...prev,
        recordsCount: prev.recordsCount + 1,
        dbSizeMb: parseFloat((prev.dbSizeMb + 0.02).toFixed(2))
      }));
    }

    setWeewxLogs(prev => [...prev, ...triggerLog.split('\n')]);
  };

  const getAqiSeverity = (aqi: number) => {
    if (aqi <= 50) return { label: 'Bueno', color: 'text-emerald-400' };
    if (aqi <= 100) return { label: 'Moderado', color: 'text-yellow-400' };
    return { label: 'Insalubre', color: 'text-orange-500' };
  };

  // Calculated values
  const outTempF = parseFloat(((weather.tempC * 9/5) + 32).toFixed(1));
  const dewPointC = parseFloat((weather.tempC - ((100 - weather.humidityPct) / 5)).toFixed(1));
  const heatIndexC = parseFloat((weather.tempC + 0.5 * (weather.tempC + 61.0 + ((weather.tempC - 68.0) * 1.2) + (weather.humidityPct * 0.094))).toFixed(1));

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-slate-100 flex flex-col gap-0" id="weewx-pillar-comprehensive-module">
      
      {/* 1. Header & Main Indicators */}
      <div className="bg-slate-900/90 border-b border-slate-800 p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-amber-950/40 border border-amber-500/20 p-2 rounded-lg text-amber-500 h-10 w-10 flex items-center justify-center shrink-0">
            <CloudSun size={22} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-black text-sm tracking-widest uppercase text-amber-500">
                Pilar Meteorológico WeeWX Core
              </h2>
              <span className="text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1.5 py-0.2 rounded font-mono font-bold">
                DAEMON V5.0.3 Stable
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-tight">
              Motor concentrador de sensores climáticos e ingestión SQLite bajo Python 3
            </p>
          </div>
        </div>

        {/* Engine status controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800/80 flex items-center gap-3">
            <span className="text-[9px] text-slate-500 uppercase font-black font-mono">Estado del servicio:</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
              <span className={`font-mono text-11px font-bold ${isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                {isRunning ? 'WEEWXD_ACTIVO' : 'WEEWXD_PARADO'}
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => setIsRunning(!isRunning)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              isRunning ? 'bg-red-950/20 text-red-400 border border-red-500/30 hover:bg-red-900/10' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-extrabold'
            }`}
          >
            <PlayCircle size={13} />
            {isRunning ? 'Parar Motor' : 'Arrancar Motor'}
          </button>
        </div>
      </div>

      {/* Main Grid: Control Actions and SubTabs selection */}
      <div className="bg-slate-900/30 border-b border-slate-850 p-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Navigation tabs inside the pillar */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button 
            onClick={() => setActiveSubTab('console')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'console' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Shield size={13} />
            Consola Meteorológica CRT
          </button>
          
          <button 
            onClick={() => setActiveSubTab('charts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'charts' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <BarChart3 size={13} />
            Gráficos del Histórico
          </button>

          <button 
            onClick={() => setActiveSubTab('sqlite')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'sqlite' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Database size={13} />
            BBDD SQLite (weewx.sdb)
          </button>

          <button 
            onClick={() => setActiveSubTab('conf')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'conf' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileCode size={13} />
            Parámetros de Configuración
          </button>
        </div>

        {/* Dynamic actions bar */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <button 
            onClick={() => triggerAction('write', 'force SQL archive commit')}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded font-bold transition-all cursor-pointer flex items-center gap-1"
          >
            <Database size={11} className="text-amber-500" />
            Commit SQL
          </button>
          <button 
            onClick={() => triggerAction('generate', 'rebuild skins reports')}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded font-bold transition-all cursor-pointer flex items-center gap-1"
          >
            <RefreshCw size={11} className="text-blue-400 animate-spin-slow" />
            Generar Informes
          </button>
          <button 
            onClick={() => triggerAction('restart', 'sudo systemctl restart weewx')}
            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded font-bold transition-all cursor-pointer flex items-center gap-1"
          >
            <Cpu size={11} className="text-red-400" />
            Reiniciar Daemon
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-950/85 border-b border-emerald-500/20 p-2 text-center text-[11px] text-emerald-400 font-mono font-bold animate-pulse">
          ✓ {statusMessage}
        </div>
      )}

      {/* 2. Middle Content depending on Active Sub-Tab */}
      <div className="p-4 flex-1">
        
        {/* SUBTAB 1: CONSOLE VIEW */}
        {activeSubTab === 'console' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 animate-fade-in">
            
            {/* CRT monitor display block */}
            <div className="xl:col-span-8 bg-black border border-slate-800 p-4 rounded-xl shadow-inner relative overflow-hidden flex flex-col justify-between min-h-[360px]">
              
              {/* Retro scanlines aesthetic effect */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-emerald-500/5 shadow-[0_0_10px_2px_rgba(234,179,8,0.15)] pointer-events-none animate-pulse" />
              
              {/* Top title line */}
              <div className="flex items-center justify-between border-b border-emerald-900/30 pb-2 mb-3.5 font-mono text-[11px] text-amber-500 font-black">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="tracking-widest">LOOP INTERRUPT DISPLAY (WEEWX V5 TERMINAL)</span>
                </div>
                <span>UPTIME: {stats.uptime}</span>
              </div>

              {/* Data CRT Metrics grid of sensors */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 font-mono">
                
                {/* Temp field */}
                <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between">
                  <span className="text-[9px] text-[#4ea05e] uppercase">Temp Exterior</span>
                  <div className="my-1.5 text-center">
                    <span className="text-2xl font-black text-[#69f584]">{weather.tempC.toFixed(1)}°C</span>
                    <span className="text-[10px] text-slate-550 block mt-0.5">{outTempF}°F</span>
                  </div>
                  <div className="text-[8px] text-slate-500 flex justify-between">
                    <span>Dewpt: {dewPointC}°C</span>
                    <span>Hi: {heatIndexC}°C</span>
                  </div>
                </div>

                {/* Wind field */}
                {(() => {
                  const bftWind = getBeaufortInfoByKts(weather.windSpeedKts);
                  const bftGust = getBeaufortInfoByKts(weather.gustKts);
                  return (
                    <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between">
                      <span className="text-[9px] text-[#4ea05e] uppercase flex justify-between items-center">
                        <span>Viento medio</span>
                        <span className="text-[7.5px] font-extrabold uppercase px-1 rounded" style={{ backgroundColor: `${bftWind.hex}20`, color: bftWind.hex }}>
                          F{bftWind.force} {bftWind.name}
                        </span>
                      </span>
                      <div className="my-1.5 text-center">
                        <span className="text-2xl font-black transition-all" style={{ color: bftWind.hex }}>{Math.round(weather.windSpeedKts)} Kts</span>
                        <span className="text-[10px] block mt-0.5 transition-all text-slate-550">{(weather.windSpeedKts * 1.852).toFixed(1)} km/h</span>
                      </div>
                      <div className="text-[8px] text-slate-500 flex justify-between items-center">
                        <span>Dir: {weather.windDirDeg}°</span>
                        <span>Racha: <strong style={{ color: bftGust.hex }}>{weather.gustKts}kts</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Hum value */}
                <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between">
                  <span className="text-[9px] text-[#4ea05e] uppercase">Humedad interior/ext</span>
                  <div className="my-1.5 text-center">
                    <span className="text-2xl font-black text-[#e8db58]">{weather.humidityPct}%</span>
                    <span className="text-[10px] text-slate-550 block mt-0.5">Humedad de aire</span>
                  </div>
                  <div className="text-[8px] text-slate-500 flex justify-between">
                    <span>Min: 35%</span>
                    <span>Máx: 100%</span>
                  </div>
                </div>

                {/* Pressure field */}
                <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between">
                  <span className="text-[9px] text-[#4ea05e] uppercase">Barómetro</span>
                  <div className="my-1.5 text-center">
                    <span className="text-2xl font-black text-[#bb69f5]">{weather.pressureHpa.toFixed(1)}</span>
                    <span className="text-[9px] text-slate-550 block mt-0.5">hPa / mb (S.L.)</span>
                  </div>
                  <div className="text-[8px] text-slate-500 flex justify-between">
                    <span>Tendencia: +0.2</span>
                    <span>Alt: 649m</span>
                  </div>
                </div>

                {/* Rain field */}
                <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between">
                  <span className="text-[9px] text-[#4ea05e] uppercase">Precipitaciones</span>
                  <div className="my-1.5 text-center">
                    <span className="text-2xl font-black text-[#4f9ef7]">{(weather.rain1hIn * 25.4).toFixed(1)} mm</span>
                    <span className="text-[10px] text-slate-550 block mt-0.5">Tasa: {(weather.rain1hIn * 12.7).toFixed(1)} mm/h</span>
                  </div>
                  <div className="text-[8px] text-slate-500 flex justify-between">
                    <span>Hoy: 2.4mm</span>
                    <span>En 24h: {(weather.rain24hIn * 25.4).toFixed(1)}mm</span>
                  </div>
                </div>

                {/* Additional Indices */}
                <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between">
                  <span className="text-[9px] text-[#4ea05e] uppercase">Otros Índices</span>
                  <div className="my-1 text-[11px] leading-relaxed text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Punt. Rocío:</span>
                      <span className="font-bold text-amber-300">{dewPointC}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">I. Calor:</span>
                      <span className="font-bold text-orange-400">{heatIndexC}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sens. Aparente:</span>
                      <span className="font-bold text-[#69f584]">{((weather.tempC - 1)).toFixed(1)}°C</span>
                    </div>
                  </div>
                  <div className="text-[8px] text-slate-500 text-center uppercase font-bold">Calculados por StdConvert</div>
                </div>

                {/* Air Quality Integration in Loop */}
                <div className="bg-[#050505] p-3 border border-emerald-950 rounded-lg flex flex-col justify-between col-span-2">
                  <span className="text-[9px] text-[#4ea05e] uppercase">Calidad del Aire Integrada en WeeWX</span>
                  {iqair ? (
                    <div className="grid grid-cols-2 gap-2 my-1">
                      <div className="text-center bg-[#0d0d0d] p-1.5 rounded border border-slate-900">
                        <span className="text-[9px] text-slate-500 block">US AQI</span>
                        <span className="text-lg font-black text-amber-400">{iqair.aqi}</span>
                        <span className={`text-[8.5px] font-bold block ${getAqiSeverity(iqair.aqi).color}`}>{getAqiSeverity(iqair.aqi).label}</span>
                      </div>
                      <div className="text-left flex flex-col justify-center font-sans text-[10px] leading-tight text-slate-400">
                        <p className="font-bold text-slate-200">Ciudad: {iqair.city}</p>
                        <p className="text-[9px] text-slate-500 mt-1">Sincronizado vía api driver de forma automática cada 5m.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3 text-[10px] text-slate-500 italic">No hay datos de aire disponibles</div>
                  )}
                  <span className="text-[7.5px] text-slate-500 block text-right">Inyectado en base de datos SQLite</span>
                </div>

              </div>

              {/* Console status footer */}
              <div className="mt-4 pt-2 border-t border-emerald-900/20 flex flex-col sm:flex-row items-center justify-between text-[9.5px] font-mono text-slate-400 gap-2">
                <span>STATION HARDWARE: {driverMode === 'simulator' ? 'Software Simulator (Python loop test)' : 'FineOffset USB (Direct Ingestion)'}</span>
                <span className="bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/30 flex items-center gap-1">
                  <Settings size={10} />
                  KISS TCP GATEWAY ACTIVE ON PORT 14580
                </span>
              </div>
            </div>

            {/* Quick driver side bar parameters config (cols: 4) */}
            <div className="xl:col-span-4 flex flex-col gap-3.5">
              
              {/* Architecture and data flows information */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 flex flex-col justify-between gap-3.5">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-800 pb-1.5">
                  ESQUEMA DE CONTROLADOR DEL DRIVER
                </span>
                
                <div className="space-y-3 font-mono text-xs">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-[9px] text-amber-500 uppercase font-bold block mb-1">Inyecciones Simulación:</span>
                    <p className="text-[10.5px] text-slate-400 leading-normal mb-2">
                      Inyecta un dato extremo o una tormenta de prueba en el acumulador del motor WeeWX para gatillar alertas en el SAT:
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => {
                          const randWind = parseFloat((35 + Math.random() * 15).toFixed(1));
                          triggerAction('storm', 'simulate test high-wind hurricane storm');
                          setWeewxLogs(prev => [...prev, `[SIMULATE] Triggered extreme weather alert. Injecting extreme wind frame: speed=${randWind}kts, gust=${randWind + 12}kts. outTemp=14.2C`]);
                        }}
                        className="p-1 px-2 text-[10px] bg-red-955/35 border border-red-500/20 text-red-300 hover:bg-red-950/45 rounded font-bold transition-all cursor-pointer text-center"
                      >
                        ⚡ Tormenta Viento
                      </button>
                      <button 
                        onClick={() => {
                          const randRain = parseFloat((12 + Math.random() * 8).toFixed(1));
                          triggerAction('rain', 'simulate test critical flashflood precipitation');
                          setWeewxLogs(prev => [...prev, `[SIMULATE] Triggered critical flood alert. Injecting flashflood rain frame: rain1h=${randRain}mm, rain24h=${randRain + 20}mm`]);
                        }}
                        className="p-1 px-2 text-[10px] bg-blue-955/35 border border-blue-500/20 text-blue-300 hover:bg-blue-950/45 rounded font-bold transition-all cursor-pointer text-center"
                      >
                        ⛈️ Lluvia Torrencial
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-[10px] text-slate-400 leading-normal">
                    <span className="text-emerald-400 font-bold block mb-1 font-sans">Compilados de Reportes HTML:</span>
                    <p className="text-[9px] leading-relaxed mb-1.5">
                      WeeWX almacena los históricos en SQLite y un motor secundario compila ficheros HTML y gráficas utilizando el motor de skins de python.
                    </p>
                    <span className="text-slate-500 font-mono italic">Directorios locales: `/var/www/html/weewx`</span>
                  </div>
                </div>
              </div>

              {/* Mini logs widget console inside the column */}
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex flex-col font-mono text-[10px]">
                <div className="text-slate-500 uppercase font-black tracking-widest flex items-center justify-between border-b border-slate-900 pb-1.5 mb-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <Terminal size={11} className="text-amber-500" /> Monitor del Daemon weewxd
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setWeewxLogs([]);
                        try {
                          await customFetch('/api/system/clear-service-logs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ service: 'weewx' })
                          });
                        } catch (err) {
                          console.error('Error clearing weewx logs:', err);
                        }
                      }}
                      type="button"
                      className="text-red-400 hover:text-red-300 text-[8.5px] font-mono font-bold cursor-pointer transition-colors hover:underline"
                      title="Limpiar logs de syslog de weewx"
                    >
                      [limpiar]
                    </button>
                    <span className="text-[8px] bg-slate-900 text-slate-400 px-1 rounded font-bold">syslog</span>
                  </div>
                </div>
                
                <div className="flex-1 bg-black p-2 rounded-lg border border-slate-900/80 text-slate-400 h-[120px] overflow-y-auto space-y-1.5 font-mono scrollbar-thin scrollbar-thumb-slate-800">
                  {weewxLogs.length === 0 ? (
                    <span className="text-slate-600 block">Arrancando monitor syslog logs...</span>
                  ) : (
                    weewxLogs.slice(-15).map((log, idx) => (
                      <div key={idx} className="leading-tight flex items-start gap-1">
                        <span className="text-slate-700 select-none shrink-0 font-bold">•</span>
                        <span className={
                          log.includes('[ERROR]') ? 'text-red-400 font-bold' :
                          log.includes('[OK]') ? 'text-emerald-400 font-semibold' :
                          log.includes('[LOOP]') ? 'text-[#e8db58]' :
                          log.includes('[ARCHIVE]') ? 'text-blue-400 font-extrabold' : 'text-slate-400'
                        }>
                          {log}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* SUBTAB 2: CHARTS DETAIL VIEW */}
        {activeSubTab === 'charts' && (
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 animate-fade-in flex flex-col gap-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="text-amber-500" size={17} />
                <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100">
                  Análisis Histórico de Variables WeeWX (Últimas 24 Horas)
                </h3>
              </div>
              
              {/* Chart selector buttons */}
              <div className="flex items-center flex-wrap gap-1 font-mono text-[9px]">
                <button 
                  onClick={() => setActiveChartSource('temp')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${activeChartSource === 'temp' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 hover:bg-slate-900 border border-slate-800'}`}
                >
                  外 Temp
                </button>
                <button 
                  onClick={() => setActiveChartSource('press')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${activeChartSource === 'press' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 hover:bg-slate-900 border border-slate-800'}`}
                >
                  Pressure
                </button>
                <button 
                  onClick={() => setActiveChartSource('wind')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${activeChartSource === 'wind' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 hover:bg-slate-900 border border-slate-800'}`}
                >
                  Wind
                </button>
                <button 
                  onClick={() => setActiveChartSource('rain')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${activeChartSource === 'rain' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 hover:bg-slate-900 border border-slate-800'}`}
                >
                  Precip
                </button>
                <button 
                  onClick={() => setActiveChartSource('aqi')}
                  className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${activeChartSource === 'aqi' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 hover:bg-slate-900 border border-slate-800'}`}
                >
                  Air AQI
                </button>
              </div>
            </div>

            {/* Recharts container component */}
            <div className="h-[280px] w-full bg-slate-950 p-2 border border-slate-900/60 rounded-lg">
              <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                {activeChartSource === 'temp' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradientTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#101827" />
                    <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                    <YAxis stroke="#4b5563" fontSize={9} domain={['dataMin - 1', 'dataMax + 1']} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="temp" name="Temp Exterior (°C)" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#gradientTemp)" />
                  </AreaChart>
                ) : activeChartSource === 'press' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradientPress" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#101827" />
                    <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                    <YAxis stroke="#4b5563" fontSize={9} domain={['dataMin - 2', 'dataMax + 2']} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="pressure" name="Barómetro (hPa)" stroke="#a855f7" strokeWidth={1.5} fillOpacity={1} fill="url(#gradientPress)" />
                  </AreaChart>
                ) : activeChartSource === 'wind' ? (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#101827" />
                    <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                    <YAxis stroke="#4b5563" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="windSpeed" name="Viento (Kts)" stroke="#22d3ee" strokeWidth={2} activeDot={{ r: 6 }} />
                  </LineChart>
                ) : activeChartSource === 'rain' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradientRain" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#101827" />
                    <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                    <YAxis stroke="#4b5563" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="rain" name="Lluvia acumulada (mm)" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#gradientRain)" />
                  </AreaChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#101827" />
                    <XAxis dataKey="time" stroke="#4b5563" fontSize={9} />
                    <YAxis stroke="#4b5563" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1f2937', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="aqi" name="Calidad Aire US AQI" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="font-sans text-[10.5px] leading-relaxed text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-900 border-dashed">
              <span>💡 weewx monitoriza los máximos y mínimos anuales de cada variable climatológica de forma automatizada por el sistema de archivado que calcula sumatorios de lluvia histórica que luego se exponen sobre mapas y consolas locales.</span>
            </div>

          </div>
        )}

        {/* SUBTAB 3: SQLITE DATABASE VIEW AND SIMULATED SQL CLIENT */}
        {activeSubTab === 'sqlite' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-fade-in">
            
            {/* SQL table schemas descriptor (cols: 5) */}
            <div className="md:col-span-4 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 space-y-3 font-mono text-[11px]">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
                <Database size={12} className="text-amber-500" /> Esfinge SQLite BBDD
              </span>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ubicación Fichero:</span>
                  <span className="font-bold text-slate-300">weewx.sdb</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Motor de Base:</span>
                  <span className="font-bold text-slate-300">SQLite v3.40.1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Registros Totales:</span>
                  <span className="font-bold text-amber-400">{stats.recordsCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Espacio en Disco:</span>
                  <span className="font-bold text-slate-300">{stats.dbSizeMb.toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Esquema Versión:</span>
                  <span className="font-bold text-blue-400">w_schema (v{stats.schemaVersion})</span>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 leading-normal space-y-1.5">
                <span className="text-slate-550 uppercase font-bold text-[9px] block">Tablas Principales:</span>
                <p className="text-[10px] text-slate-400">
                  <strong>archive</strong>: Almacena los loops consolidados de cada 5 minutos.<br />
                  <strong>archive_day_outtemp</strong>: Índices diarios (máx, mín, medias) de temperatura.<br />
                  <strong>archive_day_rain</strong>: Índices diarios del acumulador de precipitaciones.
                </p>
              </div>
            </div>

            {/* Simulated interactive DB client (cols: 8) */}
            <div className="md:col-span-8 bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 font-mono text-[11px]">
              <span className="text-slate-500 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5 flex items-center justify-between">
                <span>CONSOLA SQL CLIENT INLINE (INTERACTIVA)</span>
                <span className="text-[9px] bg-slate-900 text-slate-400 px-1 py-0.2 rounded font-mono font-bold">SQLITE ENGINE</span>
              </span>

              <div className="space-y-1.5">
                <label className="text-slate-400 text-[10px] uppercase font-bold">Inyectar sentencia SQL para depurar:</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    className="flex-1 bg-black border border-slate-800 focus:border-amber-400 px-3 py-1.5 text-xs text-amber-400 rounded-lg outline-none font-mono"
                    placeholder="Sentencia SQL..."
                  />
                  <button 
                    disabled={isQueryExecuting}
                    onClick={handleExecuteQuery}
                    className="px-4 py-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 font-extrabold rounded-lg transition-all cursor-pointer disabled:opacity-50 text-xs flex items-center gap-1.5"
                  >
                    {isQueryExecuting ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                    Ejecutar
                  </button>
                </div>
              </div>

              {/* Outputs display frame */}
              <div className="flex-1 bg-black p-3 rounded-lg border border-slate-900/60 text-slate-300 min-h-[140px] max-h-[180px] overflow-auto">
                {queryOutput.length === 0 ? (
                  <span className="text-slate-550 italic text-[10px] block py-3 text-center">Inserte consulta o use "SELECT datetime, outTemp, barometer, rain FROM archive ORDER BY datetime DESC LIMIT 5;" y pinche en ejecutar.</span>
                ) : (
                  <table className="w-full text-left text-[10px] leading-relaxed border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="py-1">dateTime (UNIX)</th>
                        <th className="py-1">dateTime (ISO)</th>
                        <th className="py-1">TempC</th>
                        <th className="py-1">Pressure hPa</th>
                        <th className="py-1 font-bold">Rain mm</th>
                        <th className="py-1">WindKts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queryOutput.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-900 hover:bg-slate-900/40 text-slate-300">
                          {row.error ? (
                            <td colSpan={6} className="py-2 text-yellow-505 text-amber-500 italic font-bold">{row.error}</td>
                          ) : (
                            <>
                              <td className="py-1 text-slate-450 text-slate-500">{row.dateTime}</td>
                              <td className="py-1 text-slate-200">{new Date(row.dateTime * 1000).toLocaleTimeString('es-ES')}</td>
                              <td className="py-1 text-emerald-400 font-bold">{row.outTemp}</td>
                              <td className="py-1 text-slate-300">{row.barometer}</td>
                              <td className="py-1 text-blue-400 font-bold">{row.rain}</td>
                               <td className="py-1 font-bold animate-pulse" style={{ color: getBeaufortInfoByKts(row.windSpeed).hex }}>{row.windSpeed}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 4: CONF STIPPET EDITOR */}
        {activeSubTab === 'conf' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-fade-in font-mono text-[11px]">
            
            {/* Parameters inputs (cols: 5) */}
            <div className="md:col-span-5 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 space-y-3.5">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
                <Settings size={12} className="text-amber-505 text-amber-500" /> Variables de Ingesta
              </span>

              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Intervalo de Guardado (segundos):</label>
                  <select 
                    value={stats.archiveInterval}
                    onChange={(e) => setStats(prev => ({ ...prev, archiveInterval: parseInt(e.target.value) }))}
                    className="bg-slate-950 border border-slate-850 rounded-md p-1.5 outline-none font-bold text-slate-200"
                  >
                    <option value={60}>60 s (1 Minuto - Loops rápidos)</option>
                    <option value={300}>300 s (5 Minutos - Calibración estándar)</option>
                    <option value={600}>600 s (10 Minutos - Mayor almacenamiento)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold">Driver de Ingesta Meteorológico:</label>
                  <select 
                    value={driverMode}
                    onChange={(e) => setDriverMode(e.target.value as any)}
                    className="bg-slate-950 border border-slate-850 rounded-md p-1.5 outline-none font-bold text-slate-200"
                  >
                    <option value="hardware">weewx.drivers.fousb (Fine Offset USB Standard)</option>
                    <option value="simulator">weewx.drivers.simulator (Software Simulator - Pruebas)</option>
                  </select>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[10px] text-slate-400 leading-normal">
                  <span className="text-amber-500 font-bold block mb-1">Mapeos de Conversión:</span>
                  <span>Al usar la unidad de conversión de <strong>weewx.engine.StdConvert</strong> las unidades se configuran automáticamente para persistir en metros, hPa y grados Celsius, facilitando exportaciones de red civil.</span>
                </div>
              </div>
            </div>

            {/* Generated clean weewx.conf panel (cols: 7) */}
            <div className="md:col-span-7 bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3">
              <span className="text-slate-550 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5 flex items-center justify-between">
                <span>/etc/weewx/weewx.conf (Skins & DB Fragment)</span>
                <span className="text-[9px] bg-slate-900 text-blue-400 px-1.5 py-0.2 rounded font-bold">weewx.conf</span>
              </span>

              <div className="bg-black p-3 rounded-lg border border-slate-900/60 font-mono text-[9.5px] leading-relaxed text-slate-300 max-h-[220px] overflow-auto scrollbar-thin">
                <span className="text-slate-500 font-bold"># FRAGMENTO CONFIGURATIVO MOTOR WEEWX GENERADO POR S.A.T. CONTROL</span><br />
                <span className="text-slate-600 font-bold">[Station]</span><br />
                &nbsp;&nbsp;&nbsp;&nbsp;station_type = {driverMode === 'simulator' ? 'Simulator' : 'FineOffsetUSB'}<br />
                &nbsp;&nbsp;&nbsp;&nbsp;latitude = {weather.tempC === 0 ? '40.4167' : '40.2514'}<br />
                &nbsp;&nbsp;&nbsp;&nbsp;longitude = -3.4214<br />
                &nbsp;&nbsp;&nbsp;&nbsp;altitude = 649, meter<br /><br />
                <span className="text-slate-600 font-bold">[StdArchive]</span><br />
                &nbsp;&nbsp;&nbsp;&nbsp;archive_interval = {stats.archiveInterval}<br />
                &nbsp;&nbsp;&nbsp;&nbsp;loop_seconds = 10<br />
                &nbsp;&nbsp;&nbsp;&nbsp;record_generation = software<br />
                &nbsp;&nbsp;&nbsp;&nbsp;data_binding = wx_binding<br /><br />
                <span className="text-slate-600 font-bold">[DataBindings]</span><br />
                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-blue-400">[[wx_binding]]</span><br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;database = archive_sqlite<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;table_name = archive<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;schema = weewx.schemas.w_schema<br /><br />
                <span className="text-slate-600 font-bold">[Databases]</span><br />
                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-blue-400">[[archive_sqlite]]</span><br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;database_name = /var/lib/weewx/weewx.sdb<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;driver = weedb.sqlite
              </div>

              <div className="text-[9px] text-slate-500 leading-normal bg-slate-900/20 p-2 rounded border border-slate-900 flex justify-between items-center">
                <span>Estructura de base INI procesable por Python.</span>
                <span className="text-blue-400 font-bold select-all">Copy segment</span>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
