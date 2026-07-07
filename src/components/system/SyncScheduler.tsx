import React, { useState } from 'react';
import { Clock, RefreshCw, AlertTriangle, CloudRain, Shield, Activity, HelpCircle, Check, Info } from 'lucide-react';
import { TelemetryConfig } from '../../types';

interface SyncSchedulerProps {
  config: TelemetryConfig;
  onSaveConfig: (updatedConfig: TelemetryConfig) => Promise<boolean>;
  currentUser?: any;
}

export default function SyncScheduler({ config, onSaveConfig, currentUser }: SyncSchedulerProps) {
  // Local state for polling intervals
  const [aemetMins, setAemetMins] = useState<number>(config.pollIntervalAemet || 1);
  const [jrcMins, setJrcMins] = useState<number>(config.pollIntervalJrc || 5);
  const [ignMins, setIgnMins] = useState<number>(config.pollIntervalIgn || 2);
  
  // Status flags
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  
  // Manual trigger states for instant feedback
  const [triggeringApi, setTriggeringApi] = useState<string | null>(null);
  const [triggerLog, setTriggerLog] = useState<string[]>([]);

  const handleUpdateIntervals = async (aemet: number, jrc: number, ign: number) => {
    setSaving(true);
    setSavedSuccess(false);
    setErrorText(null);
    try {
      const updatedConfig = {
        ...config,
        pollIntervalAemet: aemet,
        pollIntervalJrc: jrc,
        pollIntervalIgn: ign,
      };
      const ok = await onSaveConfig(updatedConfig);
      if (ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        setErrorText('No se pudo guardar la configuración en el servidor.');
      }
    } catch (err: any) {
      setErrorText('Error al enviar la consulta: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleForceManualPoll = async (apiName: string) => {
    setTriggeringApi(apiName);
    const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const logMsg = `[${timestamp}] Comando de sondeo inmediato emitido para ${apiName}...`;
    setTriggerLog(prev => [logMsg, ...prev].slice(0, 5));

    try {
      let endpoint = '';
      if (apiName === 'AEMET') endpoint = '/api/aemet/request?endpoint=/observacion/datos/estacion/3195'; // Choose closer
      else if (apiName === 'JRC') endpoint = '/api/jrc/remap-stations';
      else if (apiName === 'IGN') endpoint = '/api/telemetry'; // The core telemetry route re-triggers

      const res = await customFetch(endpoint);
      if (res.ok) {
        const doneMsg = `[${new Date().toLocaleTimeString('es-ES', { hour12: false })}] ✓ Sincronización forzada de ${apiName} completada con éxito.`;
        setTriggerLog(prev => [doneMsg, ...prev].slice(0, 5));
      } else {
        throw new Error(`Código de estado del servidor: ${res.status}`);
      }
    } catch (err: any) {
      const errMsg = `[${new Date().toLocaleTimeString('es-ES', { hour12: false })}] ⚠ Error en sondeo forzado para ${apiName}: ${err.message}`;
      setTriggerLog(prev => [errMsg, ...prev].slice(0, 5));
    } finally {
      setTimeout(() => setTriggeringApi(null), 1200);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 font-sans text-slate-100" id="sync-scheduler-panel">
      <div className="flex items-start justify-between border-b border-slate-900 pb-3">
        <div className="flex gap-2.5 items-center">
          <div className="p-2 bg-indigo-950/50 border border-indigo-500/30 rounded-lg text-indigo-400">
            <Clock size={16} className="animate-spin-slow" />
          </div>
          <div>
            <h3 className="font-sans font-bold text-slate-100 text-[13px] uppercase tracking-wider">Planificador de Sincronización Remota</h3>
            <p className="text-[10.5px] text-slate-500 font-sans mt-0.5">Define intervalos de consulta en minutos para cada API externa.</p>
          </div>
        </div>

        {savedSuccess && (
          <span className="px-2 py-1 bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono text-[9px] font-bold rounded animate-pulse">
            ✓ Guardado
          </span>
        )}
      </div>

      {/* CORE INPUT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        
        {/* AEMET CONTROL CARD */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 justify-between hover:border-sky-950 transition-colors">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sky-400 font-mono font-bold text-[10px] uppercase tracking-wider">
              <CloudRain size={13} />
              AEMET Climatología
            </span>
            <p className="text-[10px] text-slate-500 leading-normal">
              Agencia Estatal de Meteorología. Sondeo de estaciones costeras y radares regionales oficiales.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-semibold">Intervalo de sondeo:</span>
              <span className="text-[11px] font-mono font-bold text-sky-300 bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-900/40">
                {aemetMins} {aemetMins === 1 ? 'min' : 'mins'}
              </span>
            </div>

            {/* Interval quick select buttons */}
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 5, 10].map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setAemetMins(m);
                    handleUpdateIntervals(m, jrcMins, ignMins);
                  }}
                  disabled={saving}
                  className={`py-1 rounded font-mono text-[10px] font-bold transition-all cursor-pointer ${
                    aemetMins === m
                      ? 'bg-sky-900/40 border border-sky-500 text-sky-200'
                      : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>

            <div className="flex gap-2 text-[10px] items-center pt-1">
              <input
                type="range"
                min="1"
                max="60"
                value={aemetMins}
                onChange={(e) => setAemetMins(parseInt(e.target.value, 10))}
                onMouseUp={() => handleUpdateIntervals(aemetMins, jrcMins, ignMins)}
                onTouchEnd={() => handleUpdateIntervals(aemetMins, jrcMins, ignMins)}
                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
          </div>

          <button
            onClick={() => handleForceManualPoll('AEMET')}
            disabled={triggeringApi !== null}
            className="w-full mt-1.5 py-1.5 bg-slate-950 hover:bg-sky-950/30 border border-slate-900 hover:border-sky-900 text-[10px] text-slate-400 hover:text-sky-300 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
          >
            <RefreshCw size={11} className={triggeringApi === 'AEMET' ? 'animate-spin' : ''} />
            <span>Consultar AEMET Ahora</span>
          </button>
        </div>

        {/* JRC CONTROL CARD */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 justify-between hover:border-emerald-950 transition-colors">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-[10px] uppercase tracking-wider">
              <Shield size={13} />
              JRC REMAP / EURDEP
            </span>
            <p className="text-[10px] text-slate-500 leading-normal">
              Joint Research Centre de la Comisión Europea. Vigilancia radiológica y datasets científicos.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-semibold">Intervalo de sondeo:</span>
              <span className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                {jrcMins} {jrcMins === 1 ? 'min' : 'mins'}
              </span>
            </div>

            {/* Interval quick select buttons */}
            <div className="grid grid-cols-4 gap-1">
              {[1, 5, 10, 15].map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setJrcMins(m);
                    handleUpdateIntervals(aemetMins, m, ignMins);
                  }}
                  disabled={saving}
                  className={`py-1 rounded font-mono text-[10px] font-bold transition-all cursor-pointer ${
                    jrcMins === m
                      ? 'bg-emerald-905 bg-emerald-900/40 border border-emerald-500 text-emerald-200'
                      : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>

            <div className="flex gap-2 text-[10px] items-center pt-1">
              <input
                type="range"
                min="1"
                max="60"
                value={jrcMins}
                onChange={(e) => setJrcMins(parseInt(e.target.value, 10))}
                onMouseUp={() => handleUpdateIntervals(aemetMins, jrcMins, ignMins)}
                onTouchEnd={() => handleUpdateIntervals(aemetMins, jrcMins, ignMins)}
                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          <button
            onClick={() => handleForceManualPoll('JRC')}
            disabled={triggeringApi !== null}
            className="w-full mt-1.5 py-1.5 bg-slate-950 hover:bg-emerald-950/30 border border-slate-900 hover:border-emerald-900 text-[10px] text-slate-400 hover:text-emerald-300 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
          >
            <RefreshCw size={11} className={triggeringApi === 'JRC' ? 'animate-spin' : ''} />
            <span>Consultar JRC Ahora</span>
          </button>
        </div>

        {/* IGN CONTROL CARD */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3 justify-between hover:border-orange-950 transition-colors">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-orange-400 font-mono font-bold text-[10px] uppercase tracking-wider">
              <Activity size={13} />
              IGN Instituto Geográfico
            </span>
            <p className="text-[10px] text-slate-500 leading-normal">
              FDSN Sismológico Nacional. Escaneo en vivo de la actividad de placas y alertas de tsunami.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-semibold">Intervalo de sondeo:</span>
              <span className="text-[11px] font-mono font-bold text-orange-300 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-900/40">
                {ignMins} {ignMins === 1 ? 'min' : 'mins'}
              </span>
            </div>

            {/* Interval quick select buttons */}
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 5, 10].map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setIgnMins(m);
                    handleUpdateIntervals(aemetMins, jrcMins, m);
                  }}
                  disabled={saving}
                  className={`py-1 rounded font-mono text-[10px] font-bold transition-all cursor-pointer ${
                    ignMins === m
                      ? 'bg-orange-900/40 border border-orange-500 text-orange-200'
                      : 'bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>

            <div className="flex gap-2 text-[10px] items-center pt-1">
              <input
                type="range"
                min="1"
                max="60"
                value={ignMins}
                onChange={(e) => setIgnMins(parseInt(e.target.value, 10))}
                onMouseUp={() => handleUpdateIntervals(aemetMins, jrcMins, ignMins)}
                onTouchEnd={() => handleUpdateIntervals(aemetMins, jrcMins, ignMins)}
                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          </div>

          <button
            onClick={() => handleForceManualPoll('IGN')}
            disabled={triggeringApi !== null}
            className="w-full mt-1.5 py-1.5 bg-slate-950 hover:bg-orange-950/30 border border-slate-900 hover:border-orange-900 text-[10px] text-slate-400 hover:text-orange-300 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
          >
            <RefreshCw size={11} className={triggeringApi === 'IGN' ? 'animate-spin' : ''} />
            <span>Consultar IGN Ahora</span>
          </button>
        </div>

      </div>

      {errorText && (
        <div className="bg-red-950/40 border border-red-500/30 text-red-400 text-[11px] p-2.5 rounded-lg flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <p>{errorText}</p>
        </div>
      )}

      {/* FOOTER METADATA & SIMPLE CONSOLE LOG */}
      <div className="bg-black/80 rounded-lg border border-slate-900 p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider">Historial de Ejecución del Programador Cortocircuitado</span>
          <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
            <span className="h-1 w-1 bg-emerald-400 rounded-full animate-ping" />
            Servicios Cron Activos
          </span>
        </div>

        {triggerLog.length > 0 ? (
          <div className="font-mono text-[9.5px] text-slate-400 space-y-1 h-14 overflow-y-auto scrollbar-thin">
            {triggerLog.map((log, idx) => (
              <div key={idx} className={log.includes('✓') ? 'text-emerald-400' : log.includes('⚠') ? 'text-red-400' : 'text-slate-400'}>
                {log}
              </div>
            ))}
          </div>
        ) : (
          <div className="font-mono text-[9px] text-slate-500 italic py-2 text-center flex items-center justify-center gap-1.5">
            <Info size={11} />
            Sin solicitudes manuales emitidas en esta sesión. El Daemon cron correrá de fondo periódicamente.
          </div>
        )}
      </div>
    </div>
  );
}
