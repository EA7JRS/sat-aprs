import React, { useState, useEffect } from 'react';
import { ShieldAlert, Volume2, ZoomIn, Save, RefreshCw, Palette, Sparkles, HelpCircle } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../../utils/firebase';

export interface SOSSetting {
  color: string;
  soundProfile: 'pulse' | 'continuous' | 'siren';
  frequency: number;
  zoomLevel: number;
}

export interface SOSSettingsMap {
  [code: string]: SOSSetting;
}

export const DEFAULT_SOS_SETTINGS: SOSSettingsMap = {
  '!EMERGENCY!': {
    color: '#ef4444', // Red
    soundProfile: 'siren',
    frequency: 1100,
    zoomLevel: 15,
  },
  '!PRIORITY!': {
    color: '#f97316', // Orange
    soundProfile: 'pulse',
    frequency: 880,
    zoomLevel: 12,
  },
  '!SPECIAL!': {
    color: '#eab308', // Yellow
    soundProfile: 'continuous',
    frequency: 660,
    zoomLevel: 10,
  }
};

const COLOR_PRESETS = [
  { hex: '#ef4444', name: 'Rojo Vibrante' },
  { hex: '#f97316', name: 'Naranja Alerta' },
  { hex: '#eab308', name: 'Amarillo Civil' },
  { hex: '#06b6d4', name: 'Celeste Marítimo' },
  { hex: '#a855f7', name: 'Púrpura Especial' },
  { hex: '#10b981', name: 'Verde Operaciones' }
];

interface SOSConfigurationProps {
  onSettingsChange?: (settings: SOSSettingsMap) => void;
  isExtremeContrast?: boolean;
}

export default function SOSConfiguration({ onSettingsChange, isExtremeContrast = false }: SOSConfigurationProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<SOSSettingsMap>(() => {
    try {
      const stored = localStorage.getItem('alert_monitor_sos_settings');
      return stored ? JSON.parse(stored) : DEFAULT_SOS_SETTINGS;
    } catch {
      return DEFAULT_SOS_SETTINGS;
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // Sync settings with Firestore in real-time
  useEffect(() => {
    if (!currentUser) return;
    const docRef = doc(db, 'system', 'sos_config');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const fetchedSettings = data.settings || data.sosSettings;
        if (fetchedSettings) {
          setSettings(fetchedSettings);
          localStorage.setItem('alert_monitor_sos_settings', JSON.stringify(fetchedSettings));
          if (onSettingsChange) onSettingsChange(fetchedSettings);
        }
      }
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'system/sos_config');
      } catch (e) {
        console.error('Error fetching global SOS configuration:', e);
      }
    });
    return unsubscribe;
  }, [currentUser]);

  const handleUpdateField = <K extends keyof SOSSetting>(code: string, field: K, value: SOSSetting[K]) => {
    const updated = {
      ...settings,
      [code]: {
        ...settings[code],
        [field]: value
      }
    };
    setSettings(updated);
    localStorage.setItem('alert_monitor_sos_settings', JSON.stringify(updated));
    if (onSettingsChange) onSettingsChange(updated);
  };

  const handleSaveToCloud = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      localStorage.setItem('alert_monitor_sos_settings', JSON.stringify(settings));
      if (currentUser) {
        const docRef = doc(db, 'system', 'sos_config');
        await setDoc(docRef, { 
          settings: settings,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.email || currentUser.uid
        }, { merge: true });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving SOS settings to cloud:', error);
      try {
        handleFirestoreError(error, OperationType.WRITE, 'system/sos_config');
      } catch (e) {}
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setSettings(DEFAULT_SOS_SETTINGS);
    localStorage.setItem('alert_monitor_sos_settings', JSON.stringify(DEFAULT_SOS_SETTINGS));
    if (onSettingsChange) onSettingsChange(DEFAULT_SOS_SETTINGS);
    if (currentUser) {
      try {
        const docRef = doc(db, 'system', 'sos_config');
        await setDoc(docRef, { 
          settings: DEFAULT_SOS_SETTINGS,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.email || currentUser.uid
        }, { merge: true });
      } catch (error) {
        console.error('Error resetting SOS settings in cloud:', error);
        try {
          handleFirestoreError(error, OperationType.WRITE, 'system/sos_config');
        } catch (e) {}
      }
    }
  };

  const triggerPreviewSound = (freq: number, soundType: 'pulse' | 'continuous' | 'siren') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      if (soundType === 'pulse') {
        const playBeep = (delay: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + delay);
          gainNode.gain.setValueAtTime(0, now + delay);
          gainNode.gain.linearRampToValueAtTime(0.04, now + delay + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
          osc.start(now + delay);
          osc.stop(now + delay + 0.15);
        };
        playBeep(0);
        playBeep(0.2);
        playBeep(0.4);
      } else if (soundType === 'continuous') {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else if (soundType === 'siren') {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = 'sawtooth';
        
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.25);
        osc.frequency.linearRampToValueAtTime(freq, now + 0.5);
        osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.75);
        osc.frequency.linearRampToValueAtTime(freq, now + 1.0);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.03, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        
        osc.start(now);
        osc.stop(now + 1.0);
      }
    } catch (_) {}
  };

  return (
    <div className="bg-slate-900/20 border border-slate-900/60 p-4 rounded-xl flex flex-col gap-4 font-mono w-full" id="sos-config-component">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-rose-500 animate-pulse" size={16} />
          <span className="text-xs uppercase font-bold text-slate-200">Asignación de Códigos SOS (APRS)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-2 py-1 bg-slate-950 border border-slate-850 rounded hover:border-slate-700 text-[10px] text-slate-400 font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="Restaurar valores de fábrica"
          >
            <RefreshCw size={10} />
            <span>Por Defecto</span>
          </button>
          <button
            type="button"
            onClick={handleSaveToCloud}
            disabled={isSaving}
            className={`px-3 py-1.5 rounded text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              saveSuccess 
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' 
                : 'bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-500/30 hover:border-rose-500/50'
            }`}
          >
            <Save size={11} className={isSaving ? 'animate-spin' : ''} />
            <span>{isSaving ? 'Sincronizando...' : saveSuccess ? '¡Guardado!' : 'Sincronizar Cloud'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {Object.keys(DEFAULT_SOS_SETTINGS).map((code) => {
          const cfg = settings[code] || DEFAULT_SOS_SETTINGS[code];
          return (
            <div 
              key={code} 
              className={`p-3.5 rounded-lg border flex flex-col gap-3.5 transition-all ${
                isExtremeContrast 
                  ? 'bg-black border-2 border-white' 
                  : 'bg-slate-950/60 border-slate-850 hover:border-slate-800'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="flex items-center gap-2">
                  <span 
                    className="w-2.5 h-2.5 rounded-full animate-ping shrink-0" 
                    style={{ backgroundColor: cfg.color }}
                  />
                  <span className="text-xs font-bold font-mono tracking-wider text-slate-100" style={{ color: cfg.color }}>
                    {code}
                  </span>
                </div>
                <span className="text-[9px] bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-850 text-slate-500 uppercase">
                  APRS Emergency Parser
                </span>
              </div>

              {/* Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10.5px]">
                {/* Visual Color Mapping */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9.5px] uppercase text-slate-500 font-bold flex items-center gap-1">
                    <Palette size={11} />
                    Color Visual:
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {COLOR_PRESETS.map((p) => {
                      const isSelected = cfg.color === p.hex;
                      return (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => handleUpdateField(code, 'color', p.hex)}
                          className={`h-6 rounded border transition-all cursor-pointer relative flex items-center justify-center ${
                            isSelected 
                              ? 'border-white ring-1 ring-white/50 scale-105' 
                              : 'border-transparent hover:scale-102'
                          }`}
                          style={{ backgroundColor: p.hex }}
                          title={p.name}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-black/80 ring-1 ring-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sound Profile and Frequency */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9.5px] uppercase text-slate-500 font-bold flex items-center gap-1">
                    <Volume2 size={11} />
                    Sonido y Frecuencia:
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-1.5">
                      <select
                        value={cfg.soundProfile}
                        onChange={(e) => handleUpdateField(code, 'soundProfile', e.target.value as any)}
                        className="bg-black/40 border border-slate-800 text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-slate-700 cursor-pointer flex-1 text-[10px]"
                      >
                        <option value="pulse">Pulse (Seno)</option>
                        <option value="continuous">Continuous (Triang)</option>
                        <option value="siren">Siren (Sierra)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => triggerPreviewSound(cfg.frequency, cfg.soundProfile)}
                        className="p-1.5 rounded bg-slate-900 border border-slate-850 hover:border-slate-750 text-slate-400 cursor-pointer transition-colors hover:text-slate-200"
                        title="Probar sonido SOS"
                      >
                        <Volume2 size={11} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-black/20 p-1.5 rounded border border-slate-900">
                      <span className="text-[9.5px] text-slate-500 font-mono">Frecuencia:</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min="300"
                          max="1800"
                          step="50"
                          value={cfg.frequency}
                          onChange={(e) => handleUpdateField(code, 'frequency', parseInt(e.target.value))}
                          className="w-16 accent-rose-500 h-1 cursor-pointer bg-slate-800 rounded"
                        />
                        <span className="font-bold text-slate-300 font-mono text-[10px] w-10 text-right">{cfg.frequency}Hz</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map Zoom Level */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9.5px] uppercase text-slate-500 font-bold flex items-center gap-1">
                    <ZoomIn size={11} />
                    Zoom de Mapa:
                  </span>
                  <div className="flex flex-col justify-between h-full bg-black/20 p-2 rounded border border-slate-900 gap-1.5">
                    <p className="text-[9px] text-slate-500 leading-tight">Nivel de aproximación para centrar evento en el mapa operacional:</p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <input
                        type="range"
                        min="5"
                        max="18"
                        step="1"
                        value={cfg.zoomLevel}
                        onChange={(e) => handleUpdateField(code, 'zoomLevel', parseInt(e.target.value))}
                        className="flex-1 accent-rose-500 h-1 cursor-pointer bg-slate-800 rounded"
                      />
                      <span className="font-bold text-slate-300 font-mono text-[10.5px] w-12 text-right">Zoom {cfg.zoomLevel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
