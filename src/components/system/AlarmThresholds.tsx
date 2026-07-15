import React, { useState } from 'react';
import { ShieldAlert, Radio, Megaphone, Save, Check, AlertCircle, Sparkles, Cloud } from 'lucide-react';
import { TelemetryConfig } from '../../types';

interface AlarmThresholdsProps {
  config: TelemetryConfig;
  onSaveConfig: (updated: TelemetryConfig) => Promise<boolean>;
  currentUser?: any;
}

export default function AlarmThresholds({ config, onSaveConfig, currentUser }: AlarmThresholdsProps) {
  const [minMagnitudBaliza, setMinMagnitudBaliza] = useState(config.minMagnitudBaliza ?? 4.0);
  const [minMagnitudAlertaVisual, setMinMagnitudAlertaVisual] = useState(config.minMagnitudAlertaVisual ?? 3.0);
  const [autoGenerarBoletinEmergencia, setAutoGenerarBoletinEmergencia] = useState(config.autoGenerarBoletinEmergencia ?? true);
  const [enableForecastBulletin, setEnableForecastBulletin] = useState(config.enableForecastBulletin ?? false);
  const [ignSeismoEnabled, setIgnSeismoEnabled] = useState(config.ignSeismoEnabled ?? true);
  const [tsunamiMonitorEnabled, setTsunamiMonitorEnabled] = useState(config.tsunamiMonitorEnabled ?? true);
  
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccess(false);

    const updated: TelemetryConfig = {
      ...config,
      minMagnitudBaliza: parseFloat(minMagnitudBaliza.toString()),
      minMagnitudAlertaVisual: parseFloat(minMagnitudAlertaVisual.toString()),
      autoGenerarBoletinEmergencia: !!autoGenerarBoletinEmergencia,
      enableForecastBulletin: !!enableForecastBulletin,
      ignSeismoEnabled: !!ignSeismoEnabled,
      tsunamiMonitorEnabled: !!tsunamiMonitorEnabled
    };

    const isOk = await onSaveConfig(updated);
    setIsSaving(false);
    if (isOk) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setErrorMsg('No se pudo actualizar los umbrales de seguridad.');
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-slate-900 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-red-500 animate-pulse animate-duration-1000" size={18} />
          <h3 className="font-sans font-bold text-sm text-slate-100 tracking-wider uppercase">
            Gestión de Umbrales de Alarma Sísmica
          </h3>
        </div>
        <span className="bg-red-950/40 text-red-400 text-[10px] px-2 py-0.5 rounded border border-red-900/30 font-black tracking-widest uppercase">
          REMER S.A.T.
        </span>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Configura los niveles de filtrado y activación para las balizas APRS nacionales y alertas críticas. Los sismos por debajo de estos umbrales se registrarán de forma silenciosa e interna.
      </p>

      <div className="space-y-4 pt-1">
        {/* threshold slider 1: beacon activation */}
        <div className="space-y-1.5 p-3 bg-slate-900/40 rounded-lg border border-slate-900/60">
          <div className="flex items-center justify-between">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Radio size={14} className="text-emerald-500" />
              Balizas Automáticas
            </label>
            <span className="bg-emerald-950 text-emerald-400 font-bold px-2 py-0.5 rounded text-xs">
              M {minMagnitudBaliza.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-slate-500">M1.0</span>
            <input
              type="range"
              min="1.0"
              max="9.0"
              step="0.1"
              value={minMagnitudBaliza}
              onChange={(e) => setMinMagnitudBaliza(parseFloat(e.target.value))}
              className="flex-1 accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
              id="beacon-threshold-slider"
            />
            <span className="text-[10px] text-slate-500">M9.0</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Magnitud mínima del sismo para inyectar y radiodifundir automáticamente el objeto sismológico <span className="text-slate-300 font-black">SEISMO</span> en la red APRS.
          </p>
        </div>

        {/* threshold slider 2: visual alert */}
        <div className="space-y-1.5 p-3 bg-slate-900/40 rounded-lg border border-slate-900/60">
          <div className="flex items-center justify-between">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-amber-500" />
              Alertas Visuales Críticas
            </label>
            <span className="bg-amber-950 text-amber-500 font-bold px-2 py-0.5 rounded text-xs">
              M {minMagnitudAlertaVisual.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-slate-500">M1.0</span>
            <input
              type="range"
              min="1.0"
              max="9.0"
              step="0.1"
              value={minMagnitudAlertaVisual}
              onChange={(e) => setMinMagnitudAlertaVisual(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
              id="visual-threshold-slider"
            />
            <span className="text-[10px] text-slate-500">M9.0</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Nivel sísmico para detonar avisos visuales flash, banners de emergencia persistentes y modulación de color roja en las pantallas de radar táctico.
          </p>
        </div>

        {/* ESTADOS DE ACTIVACIÓN DIRECTA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sismógrafo IGN */}
          <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-900 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Radio size={14} className={ignSeismoEnabled ? "text-emerald-500 animate-pulse" : "text-slate-500"} />
                Sismógrafo IGN España
              </span>
              <button
                type="button"
                onClick={() => setIgnSeismoEnabled(!ignSeismoEnabled)}
                className={`text-[9px] font-black uppercase px-2.5 py-1 rounded transition-all cursor-pointer border ${
                  ignSeismoEnabled 
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30' 
                    : 'bg-red-950/30 text-red-400 border-red-500/30'
                }`}
              >
                {ignSeismoEnabled ? '● ENCENDIDO' : '○ APAGADO'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Determina si el detector consulta la red FDSNWS oficial en busca de registros vivos o si detiene toda captura.
            </p>
          </div>

          {/* Monitor de Tsunamis */}
          <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-900 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <ShieldAlert size={14} className={tsunamiMonitorEnabled ? "text-cyan-500 animate-pulse" : "text-slate-500"} />
                Monitor de Tsunamis
              </span>
              <button
                type="button"
                onClick={() => setTsunamiMonitorEnabled(!tsunamiMonitorEnabled)}
                className={`text-[9px] font-black uppercase px-2.5 py-1 rounded transition-all cursor-pointer border ${
                  tsunamiMonitorEnabled 
                    ? 'bg-cyan-950 text-cyan-400 border-cyan-500/30' 
                    : 'bg-red-950/30 text-red-400 border-red-500/30'
                }`}
              >
                {tsunamiMonitorEnabled ? '● ENCENDIDO' : '○ APAGADO'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Determina si se monitorizan mareas en boyas de alerta del NOAA PTWC / ERDDAP o si se suspende el sistema.
            </p>
          </div>
        </div>

        {/* boolean checkbox: emergency bulletin */}
        <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-900/60 flex items-start gap-3">
          <div className="flex items-center h-4 mt-0.5">
            <input
              type="checkbox"
              id="emergency-bulletin-checkbox"
              checked={autoGenerarBoletinEmergencia}
              onChange={(e) => setAutoGenerarBoletinEmergencia(e.target.checked)}
              className="w-3.5 h-3.5 text-red-600 bg-slate-950 border-slate-800 rounded focus:ring-red-500 focus:ring-2 accent-red-600"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="emergency-bulletin-checkbox" className="text-slate-300 font-bold flex items-center gap-1.5 cursor-pointer">
              <Megaphone size={13} className="text-red-500 shrink-0" />
              Autogenerar Boletín / Mensaje de Emergencia APRS-IS
            </label>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Trasmite de forma paralela un boletín general de alta prioridad (<span className="text-red-400 font-semibold font-mono">::BLN1</span>) avisando a todos los nodos con la etiqueta <span className="bg-slate-950 px-1 py-0.5 rounded text-red-400">EMERGENCIA SISMICA</span> para activar las alarmas sonoras civiles.
            </p>
          </div>
        </div>

        {/* boolean checkbox: forecast bulletin */}
        <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-900/60 flex items-start gap-3">
          <div className="flex items-center h-4 mt-0.5">
            <input
              type="checkbox"
              id="forecast-bulletin-checkbox"
              checked={enableForecastBulletin}
              onChange={(e) => setEnableForecastBulletin(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 bg-slate-950 border-slate-800 rounded focus:ring-blue-500 focus:ring-2 accent-blue-600"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="forecast-bulletin-checkbox" className="text-slate-300 font-bold flex items-center gap-1.5 cursor-pointer">
              <Cloud size={13} className="text-blue-500 shrink-0" />
              Emitir Boletín de Pronóstico Meteorológico (BLN3)
            </label>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Transmite periódicamente un boletín con el pronóstico de previsión de 3 a 5 días (<span className="text-blue-400 font-semibold font-mono">::BLN3</span>) para operadores civiles de la red REMER S.A.T.
            </p>
          </div>
        </div>

        {/* Save button and status */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-slate-100 font-bold border border-red-500 rounded-lg cursor-pointer transition-all"
            id="save-thresholds-btn"
          >
            {isSaving ? (
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : success ? (
              <Check size={14} className="text-white" />
            ) : (
              <Save size={14} />
            )}
            <span>{success ? 'Umbrales Aplicados' : 'Guardar Umbrales'}</span>
          </button>

          {success && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <Sparkles size={11} />
              Umbrales de ingeniería sincronizados con TNC.
            </span>
          )}

          {errorMsg && (
            <span className="text-[10px] text-red-400 flex items-center gap-1">
              <AlertCircle size={11} />
              {errorMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
