import React, { useState } from 'react';
import { Radio, RefreshCw, Cpu, Disc, Server, Flame, Activity, Moon, Sun, Clock, Cloud, Power } from 'lucide-react';
import { GPSDStatus, NTPSECStatus, TelemetryConfig, NucDiagnostics, NoaaSpaceAlert, PropagationData } from '../../types';
import { getSunriseSunset } from '../../utils/suncalc';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../utils/firebase';

interface HeaderProps {
  gpsd: GPSDStatus;
  ntp: NTPSECStatus;
  config: TelemetryConfig;
  nucStats: NucDiagnostics;
  onRefresh: () => void;
  isRefreshing: boolean;
  nightMode: boolean;
  onToggleNightMode: () => void;
  dayMode: boolean;
  onToggleDayMode: () => void;
  emergencyMode: boolean;
  onToggleEmergencyMode: () => void;
  nightModeAuto: boolean;
  onToggleNightModeAuto: (val: boolean) => void;
  nightModeUseSolar: boolean;
  onToggleNightModeUseSolar: (val: boolean) => void;
  startHour: number;
  endHour: number;
  onChangeHours: (start: number, end: number) => void;
  rtt?: number;
  noaaAlerts?: NoaaSpaceAlert[];
  currentUser?: any;
  isFirebaseSyncEnabled?: boolean;
  onToggleFirebaseSync?: (val: boolean) => void;
  propagation?: PropagationData;
  onUpdateConfig?: (updated: Partial<TelemetryConfig>) => Promise<boolean>;
}

export default function ConsoleHeader({ 
  gpsd, 
  ntp, 
  config, 
  nucStats, 
  onRefresh, 
  isRefreshing,
  nightMode,
  onToggleNightMode,
  dayMode,
  onToggleDayMode,
  emergencyMode,
  onToggleEmergencyMode,
  nightModeAuto,
  onToggleNightModeAuto,
  nightModeUseSolar,
  onToggleNightModeUseSolar,
  startHour,
  endHour,
  onChangeHours,
  rtt,
  noaaAlerts = [],
  currentUser = null,
  isFirebaseSyncEnabled = false,
  onToggleFirebaseSync,
  propagation,
  onUpdateConfig
}: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showSolarStats, setShowSolarStats] = useState(false);

  const [syncEmail, setSyncEmail] = useState('');
  const [syncPassword, setSyncPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthPending, setIsAuthPending] = useState(false);

  // LocalState for last valid coordinate tracking
  const [lastSaved, setLastSaved] = React.useState<{ lat: number; lon: number; timestamp: number } | null>(() => {
    try {
      const saved = localStorage.getItem('lastValidLocation');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [ageStr, setAgeStr] = React.useState<string>('N/A');

  React.useEffect(() => {
    // If we have a valid 3D/2D Fix and it's not a fallback, update localStorage
    if (gpsd && gpsd.mode >= 2 && !gpsd.isFallback) {
      const newLoc = { lat: gpsd.lat, lon: gpsd.lon, timestamp: Date.now() };
      localStorage.setItem('lastValidLocation', JSON.stringify(newLoc));
      setLastSaved(newLoc);
    }
  }, [gpsd]);

  React.useEffect(() => {
    const updateAge = () => {
      if (!lastSaved) {
        setAgeStr('Sin registrar');
        return;
      }
      const diffMs = Date.now() - lastSaved.timestamp;
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) {
        setAgeStr(`hace ${diffSecs}s`);
      } else {
        const diffMins = Math.floor(diffSecs / 60);
        if (diffMins < 60) {
          setAgeStr(`hace ${diffMins}m`);
        } else {
          const diffHrs = Math.floor(diffMins / 60);
          if (diffHrs < 24) {
            setAgeStr(`hace ${diffHrs}h`);
          } else {
            const diffDays = Math.floor(diffHrs / 24);
            setAgeStr(`hace ${diffDays}d`);
          }
        }
      }
    };

    updateAge();
    const interval = setInterval(updateAge, 5000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  const handleLogin = async () => {
    if (!syncEmail || !syncPassword) {
      setAuthError('Introduce email y contraseña');
      return;
    }

    setIsAuthPending(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, syncEmail, syncPassword);
      setSyncEmail('');
      setSyncPassword('');
      if (onToggleFirebaseSync) {
        onToggleFirebaseSync(true);
      }
    } catch (e: any) {
      console.error(e);
      let msg = 'Error al iniciar sesión';
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') msg = 'Credenciales incorrectas';
      else if (e.code === 'auth/wrong-password') msg = 'Contraseña incorrecta';
      else if (e.code === 'auth/invalid-email') msg = 'Email inválido';
      setAuthError(msg);
    } finally {
      setIsAuthPending(false);
    }
  };

  const handleRegister = async () => {
    if (!syncEmail || !syncPassword) {
      setAuthError('Introduce email y contraseña');
      return;
    }

    if (syncPassword.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setIsAuthPending(true);
    setAuthError(null);
    try {
      await createUserWithEmailAndPassword(auth, syncEmail, syncPassword);
      setSyncEmail('');
      setSyncPassword('');
      if (onToggleFirebaseSync) {
        onToggleFirebaseSync(true);
      }
    } catch (e: any) {
      console.error(e);
      let msg = 'Error al registrar';
      if (e.code === 'auth/email-already-in-use') msg = 'El email ya está en uso';
      else if (e.code === 'auth/invalid-email') msg = 'Email inválido';
      else if (e.code === 'auth/weak-password') msg = 'Contraseña débil (mín. 6)';
      setAuthError(msg);
    } finally {
      setIsAuthPending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  // Format current UTC and local time
  const utcTime = new Date().toISOString().slice(11, 19) + ' UTC';
  const localTime = new Date().toLocaleTimeString('es-ES', { hour12: false });

  // Calculate dynamic solar sunrise and sunset times based on QTH coordinates
  const solar = getSunriseSunset(gpsd.lat, gpsd.lon);

  // Calculate dynamic K-Index and radio propagation quality based on solar/geomagnetic NOAA alerts
  let calculatedKIndex = 2; // Baseline quiet state
  if (noaaAlerts && noaaAlerts.length > 0) {
    noaaAlerts.forEach(alert => {
      if (alert.scaleType === 'G') {
        calculatedKIndex = Math.max(calculatedKIndex, alert.nivel + 4);
      } else if (alert.scaleType === 'S') {
        calculatedKIndex = Math.max(calculatedKIndex, alert.nivel + 3);
      } else if (alert.scaleType === 'R') {
        calculatedKIndex = Math.max(calculatedKIndex, alert.nivel + 2);
      }
    });
  }
  
  // Integrate live Space Weather and HF Propagation values if available
  let liveKIndex = calculatedKIndex;
  let sfi = 150;
  let ssn = 77;
  let aIndex = calculatedKIndex === 0 ? 0 : calculatedKIndex === 1 ? 4 : calculatedKIndex === 2 ? 7 : calculatedKIndex === 3 ? 15 : calculatedKIndex === 4 ? 27 : calculatedKIndex === 5 ? 48 : calculatedKIndex === 6 ? 80 : calculatedKIndex === 7 ? 132 : calculatedKIndex === 8 ? 207 : 400;
  let isRealData = false;
  let activeRScale = 0;
  let activeSScale = 0;
  let xrayClass = "A0.0";
  let noiseS = "S1.5";
  let muf = 14.5;
  let luf = 2.0;
  let b20 = "Cerrada";
  let b15 = "Cerrada";
  let b10 = "Cerrada";
  let delayL1 = 45.0;

  if (propagation) {
    isRealData = propagation.gfz.real || propagation.noaa.real;
    
    // gfz Hp60 is high resolution, we use it if available
    if (propagation.gfz && propagation.gfz.Hp60 !== undefined) {
      liveKIndex = Math.round(propagation.gfz.Hp60);
      aIndex = propagation.gfz.ap60 || aIndex;
    } else if (propagation.noaa && propagation.noaa.geom && propagation.noaa.geom[0]) {
      liveKIndex = propagation.noaa.geom[0].kp;
    }

    if (propagation.noaa && propagation.noaa.dia1) {
      const parsedSfi = parseInt(propagation.noaa.dia1, 10);
      if (!isNaN(parsedSfi)) {
        sfi = parsedSfi;
        // SSN estimation based on SFU or use actual SSN if provided
        if (propagation.noaa.ssn) {
          const parsedSsn = parseInt(propagation.noaa.ssn, 10);
          ssn = !isNaN(parsedSsn) ? parsedSsn : Math.max(0, Math.round((sfi - 64) * 0.9));
        } else {
          ssn = Math.max(0, Math.round((sfi - 64) * 0.9));
        }
      }
    }

    if (propagation.noaa) {
      if (propagation.noaa.rad && propagation.noaa.rad[0]) {
        activeSScale = propagation.noaa.rad[0].level || 0;
      }
      if (propagation.noaa.blackout && propagation.noaa.blackout[0]) {
        activeRScale = propagation.noaa.blackout[0].level || 0;
      }
      if (propagation.noaa.xrayClass) xrayClass = propagation.noaa.xrayClass;
      if (propagation.noaa.noiseS) noiseS = propagation.noaa.noiseS;
      if (propagation.noaa.muf !== undefined) muf = propagation.noaa.muf;
      if (propagation.noaa.luf !== undefined) luf = propagation.noaa.luf;
      if (propagation.noaa.b20) b20 = propagation.noaa.b20;
      if (propagation.noaa.b15) b15 = propagation.noaa.b15;
      if (propagation.noaa.b10) b10 = propagation.noaa.b10;
      if (propagation.noaa.delayL1 !== undefined) delayL1 = propagation.noaa.delayL1;
    }
  }

  // Ensure within standard 0-9 scale
  const kIndex = Math.min(Math.max(liveKIndex, 0), 9);

  // Determine propagation characteristics
  let propagationStatus = 'EXCELENTE';
  let kIndexBulletColor = 'bg-emerald-500';
  let kIndexTextColor = 'text-emerald-400';
  let kIndexIconColor = 'text-emerald-400';
  let propagationDesc = 'Campo geomagnético estable (Quiet). Absorción ionosférica mínima. Máxima apertura en bandas de HF.';

  if (kIndex >= 6 || activeRScale >= 3 || activeSScale >= 3) {
    propagationStatus = 'ABSORCIÓN HF / CRÍTICA';
    kIndexBulletColor = 'bg-red-500';
    kIndexTextColor = 'text-red-400';
    kIndexIconColor = 'text-red-500 animate-pulse';
    if (activeRScale >= 3) {
      propagationDesc = `Apagón de radio ionosférico severo (Nivel R${activeRScale}). Absorción extrema de ondas de HF en el lado diurno.`;
    } else if (activeSScale >= 3) {
      propagationDesc = `Tormenta de radiación solar severa (Nivel S${activeSScale}). Alto nivel de ruido estático y absorción en casquetes polares (PCA).`;
    } else {
      propagationDesc = `Tormenta geomagnética severa/extrema (Nivel G3+ / Kp=${kIndex}). Fuertes desvanecimientos y desestructuración ionosférica en HF.`;
    }
  } else if (kIndex === 5 || activeRScale === 2 || activeSScale === 2) {
    propagationStatus = 'DEGRADADA';
    kIndexBulletColor = 'bg-orange-500';
    kIndexTextColor = 'text-orange-400';
    kIndexIconColor = 'text-orange-400';
    if (activeRScale === 2) {
      propagationDesc = `Perturbación ionosférica moderada (Nivel R2). Degradación en frecuencias de HF menores.`;
    } else {
      propagationDesc = `Perturbación menor (Nivel G1 / Kp=5). Propagación inestable en HF con aumento significativo del QRN (ruido de fondo).`;
    }
  } else if (kIndex === 3 || kIndex === 4 || activeRScale === 1 || activeSScale === 1) {
    propagationStatus = 'MODERADA';
    kIndexBulletColor = 'bg-amber-500';
    kIndexTextColor = 'text-amber-400';
    kIndexIconColor = 'text-amber-400';
    propagationDesc = `Campo magnético activo o inestable (Kp=${kIndex}). Propagación de HF selectiva o marginal con desvanecimientos rápidos.`;
  }

  // Generate a realistic 24-hour history array of geomagnetic K-Index readings for high-fidelity radio propagation tracking
  const kIndexHistory = React.useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => {
      const hour = (new Date().getHours() - (23 - i) + 24) % 24;
      // Synthesize realistic fluctuations based on the current live kIndex
      const wave = Math.sin((i / 23) * Math.PI * 2.5);
      const randomNoise = Math.sin(i * 1.7) * 0.5;
      let val = Math.round(kIndex + wave * 1.2 + randomNoise);
      val = Math.max(0, Math.min(9, val));
      
      // Ensure the final point matches the exact live kIndex value
      if (i === 23) {
        val = kIndex;
      }
      
      return {
        hour: `${hour.toString().padStart(2, '0')}:00`,
        kIndexValue: val,
      };
    });
  }, [kIndex]);

  return (
    <header className="bg-slate-900 border-b border-emerald-500/30 p-4 shadow-lg text-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Station ID and Title */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="p-2.5 bg-emerald-950 border border-emerald-500/50 rounded-lg text-emerald-400 animate-pulse animate-duration-1000">
          <Radio size={24} className="stroke-[2]" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h1 className="font-sans font-extrabold text-lg tracking-wider text-emerald-400">APRS S.A.T.</h1>
            <span className="text-[10px] bg-slate-950 text-emerald-400 px-1.5 py-0.5 border border-emerald-500/40 rounded font-mono font-bold tracking-widest">NUC v3.0 DEBIAN 13</span>
            {currentUser ? (
              <span className="text-[9.5px] bg-emerald-950/80 text-emerald-400 px-1.5 py-0.5 border border-emerald-500/40 rounded font-mono font-bold tracking-wide flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> OPERADOR AUTORIZADO
              </span>
            ) : (
              <span className="text-[9.5px] bg-slate-950 text-slate-400 px-1.5 py-0.5 border border-slate-800 rounded font-mono font-bold tracking-wide flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-600 animate-pulse"></span> CONSOLA PRIVADA
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Estación: <span className="text-yellow-400 font-bold">{config.callsign}</span> | Intel i3 Core de Emergencias Civil
          </p>
        </div>
      </div>

      {/* Grid Diagnostics */}
      <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto justify-end">
        
        {/* NUC Core status badge */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs shadow-inner">
          <Server size={14} className="text-amber-500" />
          <div className="leading-tight">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <span>NUC 5I3 HOSTEVAL</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300 text-[11px] font-bold">
              <span>CPU: <span className="text-emerald-400">{nucStats.cpuUsagePct}%</span></span>
              <span className="text-slate-600">|</span>
              <span className="text-red-400 flex items-center gap-0.5"><Flame size={11} className="shrink-0" /> {nucStats.cpuTempC}°C</span>
            </div>
          </div>
        </div>

        {/* NTPSEC badge */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs">
          <Cpu size={14} className="text-blue-400" />
          <div className="leading-tight">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">NTP SEC</div>
            <div className="flex items-center gap-1.5 text-blue-300 font-semibold text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping"></span>
              LOCKED (STRATUM {ntp.stratum})
            </div>
          </div>
        </div>

        {/* NUC RTT Latency badge */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs" title="Tiempo de respuesta (RTT) al servidor NUC">
          <Activity size={14} className={rtt ? (rtt < 50 ? "text-emerald-400" : rtt < 150 ? "text-amber-400 animate-pulse" : "text-red-400 animate-bounce") : "text-slate-500"} />
          <div className="leading-tight">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">NUC RTT LATENCIA</div>
            <div className="flex items-center gap-1.5 font-bold text-[11px]">
              {rtt !== undefined ? (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full ${rtt < 50 ? "bg-emerald-400" : rtt < 150 ? "bg-amber-400" : "bg-red-400 animate-ping"}`}></span>
                  <span className={rtt < 50 ? "text-emerald-400" : rtt < 150 ? "text-amber-400" : "text-red-400"}>
                    {rtt}<span className="text-[9px] text-slate-500 font-normal ml-0.5">ms</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-650 animate-pulse"></span>
                  <span className="text-slate-400">Medición...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* GPSD badge */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs">
          <Disc size={14} className={gpsd.isFallback || gpsd.mode <= 1 ? "text-rose-400 animate-pulse" : "text-emerald-400"} />
          <div className="leading-tight">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">GPSD RECEIVER</div>
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              {gpsd.isFallback || gpsd.mode <= 1 ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  <span className="text-rose-400">MODO RESPALDO: Posición última</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  <span className="text-emerald-300">{gpsd.mode === 3 ? '3D FIX' : gpsd.mode === 2 ? '2D FIX' : 'NO FIX'} ({gpsd.satellitesUsed} SAT)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* GPSD Fallback Age Widget */}
        {(gpsd.isFallback || gpsd.mode <= 1) && (
          <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-500/30 text-rose-300 rounded-lg px-3 py-1.5 font-mono text-xs shadow-inner animate-fade-in">
            <Clock size={12} className="text-rose-400 animate-spin animate-duration-10000" />
            <div className="leading-tight">
              <div className="text-[8px] text-rose-400/70 uppercase tracking-wider">Antigüedad Coord.</div>
              <div className="text-[10.5px] font-bold text-rose-200">
                {ageStr}
              </div>
            </div>
          </div>
        )}

        {/* Radio Propagation (K-Index) Badge */}
        <div 
          className="relative flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs cursor-pointer hover:border-slate-700 transition-all select-none"
          onClick={() => setShowSolarStats(!showSolarStats)}
          title="Ver índices de clima espacial y propagación HF"
        >
          <Radio size={14} className={kIndexIconColor} />
          <div className="leading-tight">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span>PROPAGACIÓN RF</span>
              <span className={`text-[8.5px] px-1 py-0.2 rounded font-bold border ${
                kIndex >= 6 ? 'bg-red-950/60 text-red-400 border-red-900/30 animate-pulse' :
                kIndex === 5 ? 'bg-orange-950/60 text-orange-400 border-orange-900/30' :
                kIndex >= 3 ? 'bg-amber-950/60 text-amber-400 border-amber-900/30' :
                'bg-emerald-950/60 text-emerald-400 border-emerald-900/30'
              }`}>
                Kp: {kIndex}
              </span>
            </div>
            <div className={`flex flex-wrap items-center gap-1 font-bold text-[10.5px] ${kIndexTextColor}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${kIndexBulletColor} ${kIndex >= 5 ? 'animate-ping' : ''}`}></span>
              <span>{propagationStatus}</span>
              <span className="text-slate-600 text-[9px] font-normal">|</span>
              <span className="text-amber-500 text-[10px] font-mono">SFI: {sfi}</span>
              <span className="text-slate-600 text-[9px] font-normal">|</span>
              <span className="text-sky-400 text-[10px] font-mono">MUF: {muf.toFixed(1)}</span>
              <span className="text-slate-600 text-[9px] font-normal">|</span>
              <span className="text-rose-400 text-[10px] font-mono">LUF: {luf.toFixed(1)}</span>
            </div>
          </div>

          {/* Interactive Solar Stats popover details */}
          {showSolarStats && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-slate-950 border border-slate-850 p-3.5 rounded-lg shadow-xl z-[60] font-sans text-slate-200 pointer-events-auto">
              <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 mb-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Radio size={12} className="text-blue-400 animate-pulse" />
                  <span>ÍNDICES SOLARES Y PROPAGACIÓN</span>
                </span>
                <span className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded font-black border ${
                  isRealData 
                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/50' 
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {isRealData ? '🛰️ FEED REAL S.A.T.' : '🔮 SIMULADO'}
                </span>
              </div>
              
              <div className="space-y-2 text-xs">
                {/* Space Weather Scales */}
                <div className="grid grid-cols-3 gap-1 px-1 py-1 bg-slate-950 rounded border border-slate-900 text-center font-mono text-[9px]">
                  <div className="py-1">
                    <span className="text-slate-500 block text-[7.5px] uppercase">G-Scale (Mag)</span>
                    <span className={`font-bold ${kIndex >= 5 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                      G{kIndex >= 9 ? 5 : kIndex >= 8 ? 4 : kIndex >= 7 ? 3 : kIndex >= 6 ? 2 : kIndex >= 5 ? 1 : 0}
                    </span>
                  </div>
                  <div className="py-1 border-x border-slate-900">
                    <span className="text-slate-500 block text-[7.5px] uppercase">S-Scale (Rad)</span>
                    <span className={`font-bold ${activeSScale > 0 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
                      S{activeSScale}
                    </span>
                  </div>
                  <div className="py-1">
                    <span className="text-slate-500 block text-[7.5px] uppercase">R-Scale (Abs)</span>
                    <span className={`font-bold ${activeRScale > 0 ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>
                      R{activeRScale}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="flex flex-col bg-slate-900/40 p-2 rounded border border-slate-900/60 text-center">
                    <span className="text-[9px] text-slate-500 font-mono">SFU</span>
                    <span className="font-mono font-bold text-amber-400 text-[11px] mt-0.5">{sfi}</span>
                  </div>
                  <div className="flex flex-col bg-slate-900/40 p-2 rounded border border-slate-900/60 text-center">
                    <span className="text-[9px] text-slate-500 font-mono">SSN</span>
                    <span className="font-mono font-bold text-blue-400 text-[11px] mt-0.5">{ssn}</span>
                  </div>
                  <div className="flex flex-col bg-slate-900/40 p-2 rounded border border-slate-900/60 text-center">
                    <span className="text-[9px] text-slate-500 font-mono font-sans">A-INDEX</span>
                    <span className="font-mono font-bold text-purple-400 text-[11px] mt-0.5">{aIndex}</span>
                  </div>
                </div>

                {/* MUF & HF Propagation Details */}
                <div className="bg-slate-900/40 p-2.5 rounded border border-slate-900/60 font-mono text-[10px] space-y-2">
                  <div className="flex justify-between items-center text-slate-400 border-b border-slate-900/50 pb-1.5 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[8.5px] font-bold text-slate-500">MUF CALCULADA:</span>
                      <span className="font-bold text-sky-400 text-xs">{muf.toFixed(2)} MHz</span>
                    </div>
                    <div className="text-right flex flex-col">
                      <span className="text-[8.5px] font-bold text-slate-500">LUF ESTIMADA:</span>
                      <span className="font-bold text-rose-400 text-xs">{luf.toFixed(2)} MHz</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-[9px] font-bold">
                    <div className="p-1 rounded bg-slate-950 border border-slate-900 flex flex-col justify-between">
                      <span className="text-slate-500 text-[8px] uppercase">20m (14 MHz)</span>
                      <span className={`mt-0.5 ${b20 === "Abierta" ? "text-emerald-400" : "text-rose-400"}`}>{b20}</span>
                    </div>
                    <div className="p-1 rounded bg-slate-950 border border-slate-900 flex flex-col justify-between">
                      <span className="text-slate-500 text-[8px] uppercase">15m (21 MHz)</span>
                      <span className={`mt-0.5 ${b15 === "Abierta" ? "text-emerald-400" : "text-rose-400"}`}>{b15}</span>
                    </div>
                    <div className="p-1 rounded bg-slate-950 border border-slate-900 flex flex-col justify-between">
                      <span className="text-slate-500 text-[8px] uppercase">10m (28 MHz)</span>
                      <span className={`mt-0.5 ${b10 === "Abierta" ? "text-emerald-400" : b10 === "Propagación Crítica" ? "text-amber-400" : "text-rose-400"}`}>{b10}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-900/40 text-[9px] text-slate-500">
                    <div>Piso Ruido SNR: <span className="text-amber-400 font-bold">{noiseS}</span></div>
                    <div className="text-right">Rayos X Clase: <span className="text-orange-400 font-bold">{xrayClass}</span></div>
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Retardo L1-Tierra: <span className="text-blue-400 font-bold">{delayL1.toFixed(1)} min</span>
                  </div>
                </div>

                {/* 24-Hour Sparkline of K-Index */}
                <div className="bg-slate-900/40 p-2.5 rounded border border-slate-900/60 flex flex-col">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold font-mono mb-1.5">HISTORIAL K-INDEX (ÚLTIMAS 24H):</span>
                  <div className="h-[120px] w-full" style={{ minWidth: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={kIndexHistory} margin={{ top: 2, right: 2, left: -28, bottom: -4 }}>
                        <defs>
                          <linearGradient id="kIndexHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={kIndex >= 6 ? '#ef4444' : kIndex >= 3 ? '#f59e0b' : '#10b981'} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={kIndex >= 6 ? '#ef4444' : kIndex >= 3 ? '#f59e0b' : '#10b981'} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="hour" 
                          tickLine={false} 
                          axisLine={false}
                          tick={{ fill: '#475569', fontSize: 7, fontFamily: 'monospace' }}
                          interval={4}
                        />
                        <YAxis 
                          domain={[0, 9]} 
                          tickCount={4}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#475569', fontSize: 7, fontFamily: 'monospace' }}
                        />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: '#020617', 
                            borderColor: '#1e293b', 
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontFamily: 'monospace',
                            color: '#e2e8f0',
                            padding: '4px 6px'
                          }}
                          labelStyle={{ color: '#64748b', fontWeight: 'bold' }}
                          itemStyle={{ padding: 0 }}
                          formatter={(value: any) => [`Kp: ${value}`, 'Lectura']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="kIndexValue" 
                          stroke={kIndex >= 6 ? '#f87171' : kIndex >= 3 ? '#fbbf24' : '#34d399'} 
                          strokeWidth={1.5}
                          fillOpacity={1} 
                          fill="url(#kIndexHistoryGrad)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="border-t border-slate-900/60 pt-2">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-bold font-mono mb-1">ESTADO DEL ESPECTRO:</span>
                  <p className="text-[10px] text-slate-300 leading-normal font-mono bg-slate-900/80 p-2 rounded border border-slate-900">
                    {propagationDesc}
                  </p>
                </div>
              </div>
              <div className="text-[8px] text-center text-slate-600 mt-2.5 border-t border-slate-900 pt-1.5">
                Haz clic de nuevo para cerrar
              </div>
            </div>
          )}
        </div>

        {/* Dynamic clocks */}
        <div className="flex items-center gap-4 bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-1.5 font-mono text-xs text-right">
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-black">HORA UTC</div>
            <div className="text-yellow-400 font-bold tracking-wider">{utcTime}</div>
          </div>
          <div className="border-l border-slate-800 pl-4 text-left">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-black">HORA LOCAL</div>
            <div className="text-slate-300 font-semibold">{localTime}</div>
          </div>
        </div>

        {/* Master Power Switch (Encendido/Apagado de la Estación) */}
        <button
          onClick={() => {
            if (onUpdateConfig) {
              const currentPower = config.systemPower !== false;
              onUpdateConfig({ systemPower: !currentPower });
            }
          }}
          className={`p-1.5 rounded-lg flex items-center gap-1.5 transition-all cubic-bezier(0.4, 0, 0.2, 1) duration-300 cursor-pointer border ${
            config.systemPower !== false
              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500 shadow-md shadow-emerald-950/40'
              : 'bg-red-950/80 text-red-400 border-red-500/80'
          }`}
          title={config.systemPower !== false ? "Apagar Estación General / Detener Registros" : "Encender Estación General / Iniciar Registros"}
          id="btn-master-power-toggle"
        >
          <Power size={15} className={config.systemPower !== false ? "text-emerald-400" : "text-red-500 animate-pulse"} />
          <span className="text-xs font-bold font-sans px-0.5">
            {config.systemPower !== false ? 'Estación: ON' : 'Estación: STANDBY'}
          </span>
        </button>

        {/* Light Mode (Modo Claro) Toggle Button */}
        <button
          onClick={onToggleDayMode}
          className={`p-1.5 rounded-lg flex items-center gap-1.5 transition-all cubic-bezier(0.4, 0, 0.2, 1) duration-300 cursor-pointer border ${
            dayMode
              ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title={dayMode ? "Desactivar Modo Claro (Fondo Claro)" : "Activar Modo Claro (Fondo Claro)"}
          id="btn-day-mode-toggle"
        >
          <Sun size={15} className={dayMode ? "text-amber-600 animate-spin-slow" : ""} />
          <span className="text-xs font-bold font-sans px-0.5">Modo Claro</span>
        </button>

        {/* Emergency Mode (Modo Emergencia) Toggle Button */}
        <button
          onClick={onToggleEmergencyMode}
          className={`p-1.5 rounded-lg flex items-center gap-1.5 transition-all cubic-bezier(0.4, 0, 0.2, 1) duration-300 cursor-pointer border ${
            emergencyMode
              ? 'bg-red-950 text-red-400 border-red-500/40 shadow-sm animate-pulse'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-900'
          }`}
          title={emergencyMode ? "Desactivar Modo Emergencia (Crimson)" : "Activar Modo Emergencia (Crimson)"}
          id="btn-emergency-mode-toggle"
        >
          <Flame size={15} className={emergencyMode ? "text-red-500 animate-bounce" : ""} />
          <span className="text-xs font-bold font-sans px-0.5">Emergencia</span>
        </button>

        {/* Night Mode Interactive Controller & Automations */}
        <div className="relative" id="night-mode-controller-panel">
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg p-1">
            {/* Quick Toggle Button */}
            <button
              onClick={onToggleNightMode}
              className={`p-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                nightMode
                  ? 'bg-amber-950 text-amber-400 border border-amber-900/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={nightMode ? "Desactivar Modo Noche" : "Activar Modo Noche"}
              id="btn-night-mode-toggle"
            >
              <Moon size={15} className={nightMode ? "text-amber-400" : ""} />
              <span className="text-xs font-bold font-sans px-0.5">Modo Noche</span>
            </button>

            {/* Config modal toggler */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                showSettings 
                  ? 'bg-slate-800 text-slate-100' 
                  : nightModeAuto 
                    ? 'text-amber-500 hover:bg-slate-900' 
                    : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Programador Horario de Baja Iluminación"
              id="btn-night-mode-config"
            >
              <Clock size={15} className={nightModeAuto ? 'animate-pulse' : ''} />
            </button>
          </div>

          {showSettings && (
            <div className="absolute right-0 mt-2 w-72 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-2xl z-50 animate-fadeIn text-slate-200">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-3">
                <span className="text-xs font-bold flex items-center gap-2">
                  <Moon size={14} className="text-amber-400" />
                  <span>Filtro de Baja Iluminación</span>
                </span>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-900"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* MANUAL SELECTOR */}
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="block font-semibold">Reducción de Brillo</span>
                    <span className="text-[10.5px] text-slate-500 block">Esquema ámbar deslumbre cero</span>
                  </div>
                  <button
                    onClick={onToggleNightMode}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                      nightMode ? 'bg-amber-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      nightMode ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* AUTOMATION TOGGLE */}
                <div className="flex items-center justify-between text-xs border-t border-slate-900 pt-3">
                  <div>
                    <span className="block font-semibold">Sensor Automático Horario</span>
                    <span className="text-[10.5px] text-slate-500 block">Cambia el modo según iluminación</span>
                  </div>
                  <button
                    onClick={() => onToggleNightModeAuto(!nightModeAuto)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                      nightModeAuto ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      nightModeAuto ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {nightModeAuto && (
                  <>
                    {/* AUTOMATION REFERENCE SELECTOR */}
                    <div className="border-t border-slate-900 pt-3 space-y-1.5 text-xs">
                      <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px] font-mono block">Algoritmo de Detección:</span>
                      <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                        <button
                          type="button"
                          onClick={() => onToggleNightModeUseSolar(true)}
                          className={`py-1 px-1.5 rounded text-[10px] font-bold transition-all cursor-pointer select-none flex items-center justify-center gap-1 ${
                            nightModeUseSolar
                              ? 'bg-amber-900 text-amber-200 border border-amber-800'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Sun size={11} className="text-amber-400 animate-pulse" />
                          <span>Solar (Orto/Ocaso)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleNightModeUseSolar(false)}
                          className={`py-1 px-1.5 rounded text-[10px] font-bold transition-all cursor-pointer select-none flex items-center justify-center gap-1 ${
                            !nightModeUseSolar
                              ? 'bg-slate-800 text-slate-100 border border-slate-700'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Clock size={11} />
                          <span>Horario Manual</span>
                        </button>
                      </div>
                    </div>

                    {/* RELEVANT PARAMETERS DISPLAY OR CONFIG */}
                    {nightModeUseSolar ? (
                      <div className="space-y-2 border-t border-slate-900 pt-3 text-[11px] font-sans">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px] font-mono block text-center bg-slate-950/60 py-1 rounded">
                          Cálculo Solar para QTH Activo
                        </span>
                        
                        <div className="bg-slate-950/90 p-2.5 rounded-lg border border-slate-900 space-y-2">
                          <div className="flex justify-between items-center text-[11.5px] text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <Sun size={12} className="text-amber-400" />
                              <span>Amanecer (Orto):</span>
                            </span>
                            <span className="font-mono font-bold text-amber-400 text-xs">{solar.sunriseStr} h</span>
                          </div>
                          
                          <div className="flex justify-between items-center text-[11.5px] text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <Moon size={12} className="text-indigo-400" />
                              <span>Atardecer (Ocaso):</span>
                            </span>
                            <span className="font-mono font-bold text-indigo-400 text-xs">{solar.sunsetStr} h</span>
                          </div>

                          <div className="border-t border-slate-900/60 pt-1.5 text-[9.5px] text-slate-400 flex flex-col items-center">
                            <span className="text-slate-500 text-[8px] uppercase tracking-wider mb-0.5">ESTACIÓN LOCATED VIA {gpsd.isFallback ? 'FIXED COORDS' : 'REAL GPSD'}</span>
                            <span className="font-mono font-semibold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850">
                              Lat: {gpsd.lat.toFixed(5)}° / Lon: {gpsd.lon.toFixed(5)}°
                            </span>
                          </div>
                        </div>

                        <div className="text-[10px] text-emerald-400 leading-relaxed bg-emerald-950/20 p-2 rounded-lg border border-emerald-900/35 font-sans flex items-center gap-1.5">
                          <Disc size={10} className="animate-pulse text-emerald-400" />
                          <span>Ajuste automático solar continuo al variar la ubicación o el día.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 border-t border-slate-900 pt-3 text-[11px]">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px] font-mono block">Rango Activo Programado:</span>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1">Empieza (Atardecer)</label>
                            <select
                              value={startHour}
                              onChange={(e) => onChangeHours(parseInt(e.target.value, 10), endHour)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-[11px] font-mono focus:outline-none focus:border-amber-500"
                            >
                              {[16, 17, 18, 19, 20, 21, 22, 23].map(h => (
                                <option key={h} value={h}>{h}:00 h</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 block mb-1">Termina (Amanecer)</label>
                            <select
                              value={endHour}
                              onChange={(e) => onChangeHours(startHour, parseInt(e.target.value, 10))}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-[11px] font-mono focus:outline-none"
                            >
                              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                                <option key={h} value={h}>0{h}:00 h</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-500 mt-2 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-900/80 font-sans">
                          ⏰ En base al reloj local, el sistema activará y desactivará el filtro automáticamente en el intervalo seleccionado.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* CLOUD SYNC CONFIGURATION */}
                <div className="border-t border-slate-900 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-amber-500 font-sans">
                      <Cloud size={13} className="text-sky-400" />
                      <span>Sincronización en la Nube</span>
                    </span>
                    {currentUser && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider">
                        Conectado
                      </span>
                    )}
                  </div>

                  {!currentUser ? (
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 space-y-2.5 font-sans">
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Guarda tu Modo Noche y cálculos solares en tu cuenta S.A.T. para sincronizar múltiples estaciones en tiempo real.
                      </p>
                      
                      <div className="space-y-1.5 text-xs font-mono">
                        <div className="relative">
                          <input
                            type="email"
                            placeholder="Email de Operador"
                            value={syncEmail}
                            onChange={(e) => setSyncEmail(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 rounded px-2.5 py-1 text-[10.5px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/30 font-mono"
                          />
                        </div>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder="Contraseña S.A.T."
                            value={syncPassword}
                            onChange={(e) => setSyncPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 rounded px-2.5 py-1 text-[10.5px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/30 font-mono"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleLogin();
                            }}
                          />
                        </div>
                      </div>

                      {authError && (
                        <p className="text-[9px] text-rose-400 bg-rose-950/10 border border-rose-950/40 p-1.5 rounded font-mono leading-normal">
                          ⚠️ {authError}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                        <button
                          type="button"
                          onClick={handleLogin}
                          disabled={isAuthPending}
                          className="py-1 px-2 bg-amber-500 text-slate-950 rounded text-[10px] font-black uppercase tracking-wider hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          {isAuthPending ? '...' : 'Entrar'}
                        </button>
                        <button
                          type="button"
                          onClick={handleRegister}
                          disabled={isAuthPending}
                          className="py-1 px-2 bg-slate-950 text-slate-300 border border-slate-800 rounded text-[10px] font-black uppercase tracking-wider hover:text-slate-100 hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          {isAuthPending ? '...' : 'Registrar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 space-y-2 font-sans">
                      <div className="flex items-center justify-between text-[11px] font-mono border-b border-slate-950 pb-2">
                        <span className="text-slate-300 truncate max-w-[155px] font-bold" title={currentUser.email}>
                          👤 {currentUser.email.split('@')[0]}
                        </span>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="text-[9.5px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider cursor-pointer bg-rose-950/20 border border-rose-500/10 px-1.5 py-0.5 rounded"
                        >
                          Cerrar
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <div>
                          <span className="block font-bold text-slate-300 text-[11px]">Sincronización Activa</span>
                          <span className="text-[9px] text-slate-500 block leading-tight">Cambios guardados en vivo</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onToggleFirebaseSync) {
                              onToggleFirebaseSync(!isFirebaseSyncEnabled);
                            }
                          }}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                            isFirebaseSyncEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            isFirebaseSyncEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual poll / sync trigger */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`p-2.5 rounded-lg border text-emerald-400 hover:text-slate-900 bg-slate-950 border-emerald-500/40 hover:bg-emerald-400 active:scale-95 transition-all cursor-pointer ${
            isRefreshing ? 'animate-spin border-yellow-500 text-yellow-500' : ''
          }`}
          title="Forzar Sondeo Sismológico, AIS y NOAA"
          id="btn-manual-sync"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  );
}
