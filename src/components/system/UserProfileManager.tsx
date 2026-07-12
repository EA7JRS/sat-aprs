import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { 
  User as UserIcon, 
  Settings, 
  Radio, 
  ShieldAlert, 
  Check, 
  Save, 
  Plus, 
  Trash2, 
  Edit2, 
  PlusCircle, 
  MapPin, 
  Activity, 
  Volume2, 
  Mail, 
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Lock,
  Sliders,
  Play
} from 'lucide-react';
import TwoFactorConfigurator from './TwoFactorConfigurator';

interface UserProfileManagerProps {
  currentUser: any;
  userProfile: any;
  onRefreshProfile?: () => void;
  defaultSubTab?: 'profile' | 'alerts' | 'stations' | 'security' | 'presets';
  onApplyPreset?: (callsign: string, aprsStatusComment: string) => void;
}

interface StationPreset {
  id?: string;
  name: string;
  callsign: string;
  ssid: string;
  aprsStatusComment: string;
  frequency?: string;
  power?: number;
  createdAt?: string;
}

interface Station {
  id?: string;
  callsign: string;
  type: 'iGate' | 'Digipeater' | 'WX Station' | 'Mobile Node' | 'CECOP Central';
  latitude: number;
  longitude: number;
  status: 'Online' | 'Offline' | 'Testing';
  frequency: string;
  power: number;
  description: string;
  createdAt: string;
}

export default function UserProfileManager({ 
  currentUser, 
  userProfile, 
  onRefreshProfile,
  defaultSubTab = 'profile',
  onApplyPreset
}: UserProfileManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'alerts' | 'stations' | 'security' | 'presets'>(defaultSubTab);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Profile Form States
  const [callsign, setCallsign] = useState('');
  const [dmrId, setDmrId] = useState('');
  const [isRadioaficionado, setIsRadioaficionado] = useState(false);
  const [isColaboradorEmcom, setIsColaboradorEmcom] = useState(false);
  const [isRemer, setIsRemer] = useState(false);
  const [bio, setBio] = useState('');
  const [operatorName, setOperatorName] = useState('');

  // Alert Preference Form States
  const [minMagnitudAlertaVisual, setMinMagnitudAlertaVisual] = useState(3.0);
  const [minMagnitudBaliza, setMinMagnitudBaliza] = useState(4.0);
  const [autoGenerarBoletinEmergencia, setAutoGenerarBoletinEmergencia] = useState(true);
  const [ignSeismoEnabled, setIgnSeismoEnabled] = useState(true);
  const [tsunamiMonitorEnabled, setTsunamiMonitorEnabled] = useState(true);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
  const [airQualityThresholdPM25, setAirQualityThresholdPM25] = useState(35.0);

  // Configured Stations States
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [isAddingStation, setIsAddingStation] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);

  // Station Form States
  const [stCallsign, setStCallsign] = useState('');
  const [stType, setStType] = useState<'iGate' | 'Digipeater' | 'WX Station' | 'Mobile Node' | 'CECOP Central'>('iGate');
  const [stLat, setStLat] = useState('40.4167');
  const [stLon, setStLon] = useState('-3.7037');
  const [stStatus, setStStatus] = useState<'Online' | 'Offline' | 'Testing'>('Online');
  const [stFreq, setStFreq] = useState('144.800 MHz');
  const [stPower, setStPower] = useState('25');
  const [stDesc, setStDesc] = useState('');

  // Configured Presets States
  const [presets, setPresets] = useState<StationPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // Preset Form States
  const [prName, setPrName] = useState('');
  const [prCallsign, setPrCallsign] = useState('');
  const [prSsid, setPrSsid] = useState('0');
  const [prBeacon, setPrBeacon] = useState('');

  // Initialize profile form
  useEffect(() => {
    if (userProfile) {
      setCallsign(userProfile.callsign || '');
      setDmrId(userProfile.dmrId || '');
      setIsRadioaficionado(!!userProfile.isRadioaficionado);
      setIsColaboradorEmcom(!!userProfile.isColaboradorEmcom);
      setIsRemer(!!userProfile.isRemer);
      setBio(userProfile.bio || '');
      setOperatorName(userProfile.operatorName || '');

      // Load Alert Preferences if available
      const prefs = userProfile.alertPrefs || {};
      setMinMagnitudAlertaVisual(prefs.minMagnitudAlertaVisual ?? 3.0);
      setMinMagnitudBaliza(prefs.minMagnitudBaliza ?? 4.0);
      setAutoGenerarBoletinEmergencia(prefs.autoGenerarBoletinEmergencia ?? true);
      setIgnSeismoEnabled(prefs.ignSeismoEnabled ?? true);
      setTsunamiMonitorEnabled(prefs.tsunamiMonitorEnabled ?? true);
      setSoundAlertsEnabled(prefs.soundAlertsEnabled ?? true);
      setEmailAlertsEnabled(prefs.emailAlertsEnabled ?? false);
      setAirQualityThresholdPM25(prefs.airQualityThresholdPM25 ?? 35.0);
    }
  }, [userProfile]);

  // Subscribe to stations subcollection
  useEffect(() => {
    if (!currentUser) return;

    setLoadingStations(true);
    const stationsColRef = collection(db, 'users', currentUser.uid, 'stations');
    
    const unsubscribe = onSnapshot(stationsColRef, (snapshot) => {
      const list: Station[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Station);
      });
      // Sort by callsign
      list.sort((a, b) => a.callsign.localeCompare(b.callsign));
      setStations(list);
      setLoadingStations(false);
    }, (error) => {
      console.error("Error reading configured stations:", error);
      setLoadingStations(false);
    });

    return unsubscribe;
  }, [currentUser]);

  // Subscribe to presets subcollection
  useEffect(() => {
    if (!currentUser) return;

    setLoadingPresets(true);
    const presetsColRef = collection(db, 'users', currentUser.uid, 'presets');
    
    const unsubscribe = onSnapshot(presetsColRef, (snapshot) => {
      const list: StationPreset[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as StationPreset);
      });
      // Sort by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setPresets(list);
      setLoadingPresets(false);
    }, (error) => {
      console.error("Error reading station presets:", error);
      setLoadingPresets(false);
    });

    return unsubscribe;
  }, [currentUser]);

  // Handle Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        callsign: callsign.trim().toUpperCase(),
        dmrId: dmrId.trim(),
        isRadioaficionado,
        isColaboradorEmcom,
        isRemer,
        bio: bio.trim(),
        operatorName: operatorName.trim(),
        updatedAt: new Date().toISOString()
      });

      setSuccessMsg('¡Datos de perfil guardados correctamente en la base de datos!');
      if (onRefreshProfile) onRefreshProfile();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setErrorMsg(`No se pudo actualizar el perfil: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Alert Preferences
  const handleSaveAlertPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        alertPrefs: {
          minMagnitudAlertaVisual: parseFloat(minMagnitudAlertaVisual.toString()),
          minMagnitudBaliza: parseFloat(minMagnitudBaliza.toString()),
          autoGenerarBoletinEmergencia: !!autoGenerarBoletinEmergencia,
          ignSeismoEnabled: !!ignSeismoEnabled,
          tsunamiMonitorEnabled: !!tsunamiMonitorEnabled,
          soundAlertsEnabled: !!soundAlertsEnabled,
          emailAlertsEnabled: !!emailAlertsEnabled,
          airQualityThresholdPM25: parseFloat(airQualityThresholdPM25.toString())
        },
        updatedAt: new Date().toISOString()
      });

      setSuccessMsg('¡Preferencias de alertas personales actualizadas correctamente!');
      if (onRefreshProfile) onRefreshProfile();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error updating alert preferences:", err);
      setErrorMsg(`No se pudieron guardar las preferencias: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Add/Edit Station
  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!stCallsign.trim()) {
      setErrorMsg('El indicativo de estación es obligatorio.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const stationData = {
      callsign: stCallsign.trim().toUpperCase(),
      type: stType,
      latitude: parseFloat(stLat) || 40.4167,
      longitude: parseFloat(stLon) || -3.7037,
      status: stStatus,
      frequency: stFreq.trim() || '144.800 MHz',
      power: parseInt(stPower) || 25,
      description: stDesc.trim(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingStationId) {
        // Edit station
        const stationDocRef = doc(db, 'users', currentUser.uid, 'stations', editingStationId);
        await updateDoc(stationDocRef, stationData);
        setSuccessMsg('¡Estación modificada con éxito!');
      } else {
        // Add new station
        const stationsColRef = collection(db, 'users', currentUser.uid, 'stations');
        await addDoc(stationsColRef, {
          ...stationData,
          createdAt: new Date().toISOString()
        });
        setSuccessMsg('¡Nueva estación de telecomunicación registrada con éxito!');
      }

      // Reset form
      setStCallsign('');
      setStDesc('');
      setStLat('40.4167');
      setStLon('-3.7037');
      setStPower('25');
      setEditingStationId(null);
      setIsAddingStation(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error saving station:", err);
      setErrorMsg(`Error al guardar la estación: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Populate Demo Stations
  const handleLoadDemoStations = async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);

    const demoStations: Omit<Station, 'id'>[] = [
      {
        callsign: `${callsign || 'EA7JRS'}-10`,
        type: 'iGate',
        latitude: 36.7212,
        longitude: -4.4214,
        status: 'Online',
        frequency: '144.800 MHz',
        power: 50,
        description: 'iGate RX/TX Redundante - Malaga, Yaesu FTM-400XDE + Raspberry Pi 4 + Direwolf',
        createdAt: new Date().toISOString()
      },
      {
        callsign: `${callsign || 'EA7JRS'}-3`,
        type: 'WX Station',
        latitude: 36.7512,
        longitude: -4.4814,
        status: 'Online',
        frequency: '144.800 MHz',
        power: 10,
        description: 'Estación Meteorológica APRS Directa - Davis Vantage Pro 2 + WeeWX',
        createdAt: new Date().toISOString()
      },
      {
        callsign: `${callsign || 'EA7JRS'}-15`,
        type: 'Mobile Node',
        latitude: 40.4167,
        longitude: -3.7037,
        status: 'Testing',
        frequency: '144.800 MHz',
        power: 5,
        description: 'Nodo móvil táctico - Kenwood TH-D74 144/430MHz APRS KISS Bluetooth',
        createdAt: new Date().toISOString()
      }
    ];

    try {
      const stationsColRef = collection(db, 'users', currentUser.uid, 'stations');
      for (const st of demoStations) {
        await addDoc(stationsColRef, st);
      }
      setSuccessMsg('¡Estaciones de demostración cargadas correctamente en su perfil!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error loading demo stations:", err);
      setErrorMsg(`Error al cargar demostración: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Edit Station Init Form
  const startEditStation = (station: Station) => {
    if (!station.id) return;
    setEditingStationId(station.id);
    setStCallsign(station.callsign);
    setStType(station.type);
    setStLat(station.latitude.toString());
    setStLon(station.longitude.toString());
    setStStatus(station.status);
    setStFreq(station.frequency);
    setStPower(station.power.toString());
    setStDesc(station.description);
    setIsAddingStation(true);
    setErrorMsg(null);
  };

  // Delete Station
  const handleDeleteStation = async (stationId: string) => {
    if (!currentUser || !window.confirm('¿Está seguro de que desea eliminar permanentemente esta estación?')) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const stationDocRef = doc(db, 'users', currentUser.uid, 'stations', stationId);
      await deleteDoc(stationDocRef);
      setSuccessMsg('Estación eliminada correctamente.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error deleting station:", err);
      setErrorMsg(`No se pudo eliminar la estación: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Start Edit Preset Form
  const startEditPreset = (preset: StationPreset) => {
    if (!preset.id) return;
    setEditingPresetId(preset.id);
    setPrName(preset.name);
    setPrCallsign(preset.callsign);
    setPrSsid(preset.ssid || '0');
    setPrBeacon(preset.aprsStatusComment);
    setIsAddingPreset(true);
    setErrorMsg(null);
  };

  // Save/Update Preset
  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!prName.trim() || !prCallsign.trim()) {
      setErrorMsg('El nombre de preset y el indicativo son obligatorios.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const presetData = {
      name: prName.trim(),
      callsign: prCallsign.trim().toUpperCase(),
      ssid: prSsid,
      aprsStatusComment: prBeacon.trim() || '📡 S.A.T. Estación Auxiliar • REMER',
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingPresetId) {
        const presetDocRef = doc(db, 'users', currentUser.uid, 'presets', editingPresetId);
        await updateDoc(presetDocRef, presetData);
        setSuccessMsg('¡Preset de estación modificado con éxito!');
      } else {
        const presetsColRef = collection(db, 'users', currentUser.uid, 'presets');
        await addDoc(presetsColRef, {
          ...presetData,
          createdAt: new Date().toISOString()
        });
        setSuccessMsg('¡Nuevo preset de estación guardado en Firestore!');
      }

      // Reset form
      setPrName('');
      setPrCallsign('');
      setPrSsid('0');
      setPrBeacon('');
      setEditingPresetId(null);
      setIsAddingPreset(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error saving preset:", err);
      setErrorMsg(`Error al guardar el preset: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete Preset
  const handleDeletePreset = async (presetId: string) => {
    if (!currentUser || !window.confirm('¿Está seguro de que desea eliminar este preset?')) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const presetDocRef = doc(db, 'users', currentUser.uid, 'presets', presetId);
      await deleteDoc(presetDocRef);
      setSuccessMsg('Preset eliminado correctamente.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error deleting preset:", err);
      setErrorMsg(`No se pudo eliminar el preset: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load Default Presets
  const handleLoadDefaultPresets = async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);

    const defaultPresetsList: Omit<StationPreset, 'id'>[] = [
      {
        name: 'CECOP Coordinador Central',
        callsign: 'EA4SAT',
        ssid: '15',
        aprsStatusComment: '⛺ CECOP Coordinación Central • Emergencias REMER Proteccion Civil',
        createdAt: new Date().toISOString()
      },
      {
        name: 'iGate Redundante S.A.T.',
        callsign: 'EA4SAT',
        ssid: '10',
        aprsStatusComment: '📡 PILAR IV: Red S.A.T. • iGate RX/TX Internet Gateway Activo',
        createdAt: new Date().toISOString()
      },
      {
        name: 'Unidad de Movilidad Táctica',
        callsign: 'EA4SAT',
        ssid: '9',
        aprsStatusComment: '🚒 EMCOM Unidad Móvil de Despliegue Rápido de Emergencias',
        createdAt: new Date().toISOString()
      }
    ];

    try {
      const presetsColRef = collection(db, 'users', currentUser.uid, 'presets');
      for (const pr of defaultPresetsList) {
        await addDoc(presetsColRef, pr);
      }
      setSuccessMsg('¡Presets por defecto cargados correctamente en su perfil de Firestore!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error loading default presets:", err);
      setErrorMsg(`Error al cargar presets por defecto: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl" id="operator-profile-manager">
      {/* HEADER */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-950/50 border border-emerald-500/20 text-emerald-400 rounded-lg">
            <UserIcon size={18} className="animate-pulse" />
          </div>
          <div>
            <h3 className="font-sans font-extrabold text-sm text-slate-100 tracking-wider uppercase">
              GESTIÓN DE PERFIL Y ESTACIONES DE OPERADOR
            </h3>
            <p className="text-[10px] text-slate-400 font-mono tracking-wide mt-0.5">
              ID OPERADOR: <span className="text-slate-200 font-bold">{currentUser?.uid}</span> • SESIÓN: <span className="text-emerald-400 font-black">ACTIVA</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-slate-500 uppercase">Estado Perfil:</span>
          {userProfile?.isApproved ? (
            <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-black uppercase">
              ✔ VERIFICADO REMER
            </span>
          ) : (
            <span className="bg-amber-950/50 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-black uppercase">
              ⚠ PENDIENTE APROBACIÓN
            </span>
          )}
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex border-b border-slate-900 bg-slate-900/40 p-1 gap-1 font-mono text-[11px]">
        <button
          type="button"
          onClick={() => { setActiveSubTab('profile'); setErrorMsg(null); }}
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'profile'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <UserIcon size={13} />
          Mi Perfil
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('alerts'); setErrorMsg(null); }}
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'alerts'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <ShieldAlert size={13} />
          Alertas Personales
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('stations'); setErrorMsg(null); }}
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'stations'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Radio size={13} />
          Mis Estaciones ({stations.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('presets'); setErrorMsg(null); }}
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'presets'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Sliders size={13} />
          Mis Presets ({presets.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('security'); setErrorMsg(null); }}
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'security'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Lock size={13} />
          Seguridad 2FA
        </button>
      </div>

      {/* NOTIFICATIONS */}
      {errorMsg && (
        <div className="bg-rose-950/30 border border-rose-500/20 p-3 text-rose-300 font-mono text-xs flex items-start gap-2 animate-fade-in">
          <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 text-emerald-300 font-mono text-xs flex items-start gap-2 animate-fade-in">
          <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="p-4">
        {/* SUB-TAB 1: MI PERFIL */}
        {activeSubTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4 font-mono text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Email de Registro (No editable)</label>
                <input
                  type="email"
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full bg-slate-900/50 border border-slate-900 rounded-lg px-3 py-2 text-slate-500 font-bold focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Nombre de Operador / Responsable</label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Escriba su nombre completo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Indicativo de Radioaficionado (Callsign)</label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="e.g. EA7JRS"
                  maxLength={10}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold uppercase placeholder-slate-700"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">CCS7 DMR ID (7 dígitos)</label>
                <input
                  type="text"
                  value={dmrId}
                  onChange={(e) => setDmrId(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 2147003"
                  maxLength={7}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold placeholder-slate-700"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Biografía / Notas de Hardware Táctico</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Describa brevemente su estación base, antenas, o rol civil EMCOM..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/30"
              />
            </div>

            <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-xl space-y-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Homologación y Licencias Especiales:</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="flex items-start gap-2.5 p-2 bg-slate-950/40 rounded-lg border border-slate-900 cursor-pointer hover:bg-slate-950/80 transition-all">
                  <input
                    type="checkbox"
                    checked={isRadioaficionado}
                    onChange={(e) => setIsRadioaficionado(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 accent-emerald-500 mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-slate-300 block">Radioaficionado</span>
                    <span className="text-[9px] text-slate-500">Licencia de Telecomunicaciones</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 bg-slate-950/40 rounded-lg border border-slate-900 cursor-pointer hover:bg-slate-950/80 transition-all">
                  <input
                    type="checkbox"
                    checked={isColaboradorEmcom}
                    onChange={(e) => setIsColaboradorEmcom(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 accent-emerald-500 mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-slate-300 block">Colaborador EMCOM</span>
                    <span className="text-[9px] text-slate-500">Comunicaciones de Emergencia</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 bg-slate-950/40 rounded-lg border border-slate-900 cursor-pointer hover:bg-slate-950/80 transition-all">
                  <input
                    type="checkbox"
                    checked={isRemer}
                    onChange={(e) => setIsRemer(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 accent-emerald-500 mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-slate-300 block">Miembro REMER</span>
                    <span className="text-[9px] text-slate-500">Red de Emergencia del Estado</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-sans font-black text-xs uppercase tracking-widest rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              >
                {loading ? (
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent rounded-full" />
                ) : (
                  <Save size={13} />
                )}
                <span>{loading ? 'Guardando...' : 'Aplicar Cambios de Perfil'}</span>
              </button>
            </div>
          </form>
        )}

        {/* SUB-TAB 2: ALERT PREFERENCES */}
        {activeSubTab === 'alerts' && (
          <form onSubmit={handleSaveAlertPrefs} className="space-y-4 font-mono text-xs">
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans mb-3">
              Configure sus preferencias de alertas de estación personales. Estas configuraciones controlan qué sismos, niveles de contaminación y otros eventos peligrosos detonan llamadas visuales persistentes o alertas audibles sintetizadas en su consola de operador local.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* MAGNITUD VISUAL */}
              <div className="p-3 bg-slate-900/40 border border-slate-900 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-amber-500" />
                    Umbral Alerta Visual Sísmica
                  </span>
                  <span className="bg-amber-950 text-amber-500 font-bold px-1.5 py-0.5 rounded text-[10px]">
                    M {minMagnitudAlertaVisual.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-600">M1.0</span>
                  <input
                    type="range"
                    min="1.0"
                    max="9.0"
                    step="0.1"
                    value={minMagnitudAlertaVisual}
                    onChange={(e) => setMinMagnitudAlertaVisual(parseFloat(e.target.value))}
                    className="flex-1 accent-amber-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-600">M9.0</span>
                </div>
                <p className="text-[10px] text-slate-500 font-sans leading-tight mt-1">
                  Magnitud Richter mínima para activar el parpadeo de emergencia rojo en el mapa táctico de su terminal.
                </p>
              </div>

              {/* MAGNITUD BALIZA */}
              <div className="p-3 bg-slate-900/40 border border-slate-900 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Radio size={14} className="text-emerald-500" />
                    Umbral Inyección de Baliza APRS
                  </span>
                  <span className="bg-emerald-950 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-[10px]">
                    M {minMagnitudBaliza.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-600">M1.0</span>
                  <input
                    type="range"
                    min="1.0"
                    max="9.0"
                    step="0.1"
                    value={minMagnitudBaliza}
                    onChange={(e) => setMinMagnitudBaliza(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-600">M9.0</span>
                </div>
                <p className="text-[10px] text-slate-500 font-sans leading-tight mt-1">
                  Magnitud sísmica para radiodifundir automáticamente alertas como objetos sismológicos en radiofrecuencia (AX25).
                </p>
              </div>

              {/* CALIDAD AIRE PM2.5 */}
              <div className="p-3 bg-slate-900/40 border border-slate-900 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Activity size={14} className="text-rose-500" />
                    Umbral Alarma Calidad Aire PM2.5
                  </span>
                  <span className="bg-rose-950 text-rose-400 font-bold px-1.5 py-0.5 rounded text-[10px]">
                    {airQualityThresholdPM25.toFixed(1)} µg/m³
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-600">5.0</span>
                  <input
                    type="range"
                    min="5.0"
                    max="150.0"
                    step="1.0"
                    value={airQualityThresholdPM25}
                    onChange={(e) => setAirQualityThresholdPM25(parseFloat(e.target.value))}
                    className="flex-1 accent-rose-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-600">150.0</span>
                </div>
                <p className="text-[10px] text-slate-500 font-sans leading-tight mt-1">
                  Concentración de partículas finas PM2.5 máxima permitida antes de emitir un aviso de riesgo de salud respiratoria.
                </p>
              </div>

              {/* INTEGRACION CANALES MONITORES */}
              <div className="p-3 bg-slate-900/40 border border-slate-900 rounded-lg space-y-2.5">
                <span className="text-slate-300 font-bold block">Toggles de Monitorización Activa</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ignSeismoEnabled}
                      onChange={(e) => setIgnSeismoEnabled(e.target.checked)}
                      className="w-3.5 h-3.5 text-emerald-600 bg-slate-950 border-slate-800 rounded accent-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400">Monitor IGN Sismos</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tsunamiMonitorEnabled}
                      onChange={(e) => setTsunamiMonitorEnabled(e.target.checked)}
                      className="w-3.5 h-3.5 text-emerald-600 bg-slate-950 border-slate-800 rounded accent-emerald-500"
                    />
                    <span className="text-[10px] text-slate-400">Monitor Tsunamis NOAA</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-xl space-y-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Métodos de Notificación y Alarma:</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-start gap-2.5 p-2 bg-slate-950/40 rounded-lg border border-slate-900 cursor-pointer hover:bg-slate-950/80 transition-all">
                  <input
                    type="checkbox"
                    checked={soundAlertsEnabled}
                    onChange={(e) => setSoundAlertsEnabled(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 accent-emerald-500 mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-slate-300 block flex items-center gap-1">
                      <Volume2 size={11} className="text-emerald-500" /> Alerta de Audio
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">Sintetizador por voz local</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 bg-slate-950/40 rounded-lg border border-slate-900 cursor-pointer hover:bg-slate-950/80 transition-all">
                  <input
                    type="checkbox"
                    checked={emailAlertsEnabled}
                    onChange={(e) => setEmailAlertsEnabled(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 accent-emerald-500 mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-slate-300 block flex items-center gap-1">
                      <Mail size={11} className="text-emerald-500" /> Alerta de Email
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">Aviso crítico en su casilla</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 bg-slate-950/40 rounded-lg border border-slate-900 cursor-pointer hover:bg-slate-950/80 transition-all">
                  <input
                    type="checkbox"
                    checked={autoGenerarBoletinEmergencia}
                    onChange={(e) => setAutoGenerarBoletinEmergencia(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 accent-emerald-500 mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-slate-300 block flex items-center gap-1">
                      <Radio size={11} className="text-emerald-500" /> Boletines APRS
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">Autogeneración ::BLN1</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-sans font-black text-xs uppercase tracking-widest rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              >
                {loading ? (
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent rounded-full" />
                ) : (
                  <Save size={13} />
                )}
                <span>{loading ? 'Sincronizando...' : 'Guardar Preferencias de Alertas'}</span>
              </button>
            </div>
          </form>
        )}

        {/* SUB-TAB 3: CONFIGURAR ESTACIONES */}
        {activeSubTab === 'stations' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
              <div>
                <span className="font-bold text-slate-200 block">Estaciones Configuradas de Operador</span>
                <span className="text-[10px] text-slate-500 font-sans block leading-tight">Agregue, edite o desactive sus repetidores, iGates y estaciones meteorológicas personales</span>
              </div>
              <div className="flex gap-2">
                {stations.length === 0 && (
                  <button
                    type="button"
                    onClick={handleLoadDemoStations}
                    disabled={loading}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-300 font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase text-[9.5px]"
                  >
                    <Sparkles size={11} className="text-amber-500" /> Cargar Demo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingStation(!isAddingStation);
                    setEditingStationId(null);
                    // Reset form
                    setStCallsign('');
                    setStDesc('');
                    setStLat('40.4167');
                    setStLon('-3.7037');
                    setStPower('25');
                  }}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-sans font-black rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase text-[10px] tracking-wide"
                >
                  <Plus size={13} />
                  {isAddingStation && !editingStationId ? 'Cancelar' : 'Nueva Estación'}
                </button>
              </div>
            </div>

            {/* STATION FORM */}
            {isAddingStation && (
              <form onSubmit={handleSaveStation} className="bg-slate-900/40 border-2 border-emerald-500/10 rounded-xl p-4 space-y-4 animate-fade-in">
                <div className="text-emerald-400 font-black flex items-center gap-1.5 text-[10px] uppercase border-b border-slate-900 pb-2">
                  <PlusCircle size={14} />
                  {editingStationId ? 'Modificar Estación de Radio' : 'Registrar Nueva Estación / Nodo de Red'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Indicativo + SSID</label>
                    <input
                      type="text"
                      required
                      value={stCallsign}
                      onChange={(e) => setStCallsign(e.target.value)}
                      placeholder="e.g. EA7JRS-10"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold uppercase placeholder-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Tipo de Estación</label>
                    <select
                      value={stType}
                      onChange={(e: any) => setStType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    >
                      <option value="iGate">iGate RX/TX</option>
                      <option value="Digipeater">Digipeater Red Local</option>
                      <option value="WX Station">Estación Meteo (WX)</option>
                      <option value="Mobile Node">Nodo Móvil APRS</option>
                      <option value="CECOP Central">CECOP Central</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Estado de Operación</label>
                    <select
                      value={stStatus}
                      onChange={(e: any) => setStStatus(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    >
                      <option value="Online">Activo (Online)</option>
                      <option value="Offline">Inactivo (Offline)</option>
                      <option value="Testing">En Pruebas (Testing)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Latitud Coordenada</label>
                    <input
                      type="text"
                      required
                      value={stLat}
                      onChange={(e) => setStLat(e.target.value)}
                      placeholder="e.g. 36.7212"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Longitud Coordenada</label>
                    <input
                      type="text"
                      required
                      value={stLon}
                      onChange={(e) => setStLon(e.target.value)}
                      placeholder="e.g. -4.4214"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Frecuencia de Uso</label>
                    <input
                      type="text"
                      value={stFreq}
                      onChange={(e) => setStFreq(e.target.value)}
                      placeholder="144.800 MHz"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Potencia TX (Vatios)</label>
                    <input
                      type="number"
                      value={stPower}
                      onChange={(e) => setStPower(e.target.value)}
                      placeholder="25"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Descripción de Hardware / Antenas</label>
                    <input
                      type="text"
                      value={stDesc}
                      onChange={(e) => setStDesc(e.target.value)}
                      placeholder="e.g. Diamond X-200 a 10m de altura, SDR RTL, Software Direwolf"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 placeholder-slate-800"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end border-t border-slate-900 pt-3">
                  <button
                    type="button"
                    onClick={() => { setIsAddingStation(false); setEditingStationId(null); }}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-800 text-slate-400 font-sans font-bold rounded-lg cursor-pointer hover:bg-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-sans font-black rounded-lg cursor-pointer flex items-center gap-1 uppercase tracking-wide"
                  >
                    {loading ? 'Procesando...' : editingStationId ? 'Aplicar Modificaciones' : 'Crear Estación'}
                  </button>
                </div>
              </form>
            )}

            {/* STATIONS LIST */}
            {loadingStations ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <RefreshCw className="animate-spin text-emerald-500" size={16} />
                <span className="text-slate-500 font-mono text-[10px]">Cargando canal de base de datos de estaciones...</span>
              </div>
            ) : stations.length === 0 ? (
              <div className="border border-dashed border-slate-850 rounded-xl p-8 text-center text-slate-500 space-y-2">
                <Radio size={28} className="mx-auto text-slate-700 block" />
                <p className="font-sans font-medium text-[11px]">No tiene ninguna estación o nodo de radio configurado.</p>
                <p className="text-[10px] text-slate-600 max-w-sm mx-auto font-sans leading-relaxed">
                  Registre su equipamiento local para monitorear el tráfico de telemetría de forma integrada o pulse &quot;Cargar Demo&quot; para rellenar con nodos preconfigurados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-900 rounded-xl">
                <table className="w-full text-left border-collapse font-mono text-[10px] text-slate-300">
                  <thead className="bg-slate-900/40 text-[9px] uppercase font-black text-slate-500 tracking-wider border-b border-slate-900">
                    <tr>
                      <th className="p-2.5">Indicativo</th>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Coordenadas</th>
                      <th className="p-2.5">Freq</th>
                      <th className="p-2.5">Power</th>
                      <th className="p-2.5">Hardware</th>
                      <th className="p-2.5 text-center">Estado</th>
                      <th className="p-2.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-950 bg-slate-950/20">
                    {stations.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="p-2.5 font-bold text-slate-100 flex items-center gap-1">
                          <Radio size={11} className="text-emerald-500" />
                          {st.callsign}
                        </td>
                        <td className="p-2.5">
                          <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850/60 font-semibold text-slate-400">
                            {st.type}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 flex items-center gap-0.5 whitespace-nowrap">
                          <MapPin size={10} className="text-slate-500" />
                          {st.latitude.toFixed(4)}, {st.longitude.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-slate-400">{st.frequency}</td>
                        <td className="p-2.5 text-slate-400">{st.power} W</td>
                        <td className="p-2.5 text-slate-500 truncate max-w-[150px]" title={st.description}>
                          {st.description || '—'}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border leading-none ${
                            st.status === 'Online'
                              ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400'
                              : st.status === 'Offline'
                              ? 'bg-rose-950/40 border-rose-500/20 text-rose-400'
                              : 'bg-amber-950/40 border-amber-500/20 text-amber-500 animate-pulse'
                          }`}>
                            ● {st.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditStation(st)}
                              className="p-1 hover:bg-slate-900 hover:text-emerald-400 rounded transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => st.id && handleDeleteStation(st.id)}
                              className="p-1 hover:bg-slate-900 hover:text-rose-400 rounded transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 5: PRESETS DE ESTACIÓN */}
        {activeSubTab === 'presets' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
              <div>
                <span className="font-bold text-slate-200 block">Perfiles de Estación / Presets Rápidos (Firestore)</span>
                <span className="text-[10px] text-slate-500 font-sans block leading-tight">Define y almacena combinaciones preestablecidas de Indicativo, SSID y comentarios de balizas de estado para activarlas instantáneamente</span>
              </div>
              <div className="flex gap-2">
                {presets.length === 0 && (
                  <button
                    type="button"
                    onClick={handleLoadDefaultPresets}
                    disabled={loading}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-300 font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase text-[9.5px]"
                  >
                    <Sparkles size={11} className="text-amber-500" /> Cargar por Defecto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPreset(!isAddingPreset);
                    setEditingPresetId(null);
                    setPrName('');
                    setPrCallsign('');
                    setPrSsid('0');
                    setPrBeacon('');
                  }}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-sans font-black rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase text-[10px] tracking-wide"
                >
                  <Plus size={13} />
                  {isAddingPreset && !editingPresetId ? 'Cancelar' : 'Nuevo Preset'}
                </button>
              </div>
            </div>

            {/* PRESET FORM */}
            {isAddingPreset && (
              <form onSubmit={handleSavePreset} className="bg-slate-900/40 border-2 border-emerald-500/10 rounded-xl p-4 space-y-4 animate-fade-in" id="preset-creation-form">
                <div className="text-emerald-400 font-black flex items-center gap-1.5 text-[10px] uppercase border-b border-slate-900 pb-2">
                  <PlusCircle size={14} />
                  {editingPresetId ? 'Modificar Preset de Estación' : 'Crear Nuevo Preset de Operación S.A.T.'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Nombre del Preset</label>
                    <input
                      type="text"
                      required
                      value={prName}
                      onChange={(e) => setPrName(e.target.value)}
                      placeholder="e.g. iGate de Campaña"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold placeholder-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Llamada (Indicativo)</label>
                    <input
                      type="text"
                      required
                      value={prCallsign}
                      onChange={(e) => setPrCallsign(e.target.value)}
                      placeholder="e.g. EA7JRS"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold uppercase placeholder-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">SSID APRS</label>
                    <select
                      value={prSsid}
                      onChange={(e) => setPrSsid(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 font-bold"
                    >
                      <option value="0">Ninguno (-0)</option>
                      <option value="1">-1 (VHF Packet)</option>
                      <option value="2">-2 (VHF Packet)</option>
                      <option value="3">-3 (Weather Station)</option>
                      <option value="4">-4 (HF Packet)</option>
                      <option value="5">-5 (Mobile Link)</option>
                      <option value="7">-7 (Handheld HT)</option>
                      <option value="8">-8 (Maritime RV)</option>
                      <option value="9">-9 (Primary Mobile)</option>
                      <option value="10">-10 (iGate Gateway)</option>
                      <option value="11">-11 (Airborne/Balloon)</option>
                      <option value="12">-12 (One-way Tracker)</option>
                      <option value="13">-13 (Weather Station)</option>
                      <option value="14">-14 (Trucks/Fleet)</option>
                      <option value="15">-15 (HF Multiport Digi)</option>
                    </select>
                  </div>

                  <div className="space-y-1 sm:col-span-3">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Baliza Predefinida (Comentario de Estado)</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        value={prBeacon}
                        onChange={(e) => setPrBeacon(e.target.value)}
                        placeholder="e.g. 📡 S.A.T. Nodo iGate Activo | Soporte Comunicaciones Emergencia"
                        maxLength={64}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500/30 placeholder-slate-800"
                      />
                      <span className="text-[9px] text-slate-500 whitespace-nowrap">{prBeacon.length}/64</span>
                    </div>
                    {/* QUICK SELECTIONS */}
                    <div className="pt-2 flex flex-wrap gap-1.5">
                      <span className="text-[9px] text-slate-500 uppercase flex items-center font-bold">Plantillas Rápidas:</span>
                      {[
                        "📡 PILAR IV: Red S.A.T. • Operativo en Emergencias",
                        "🚒 EMCOM Unidad Móvil de Despliegue Rápido",
                        "⛈️ S.A.T. WX Nodo Meteorológico de Respaldo",
                        "⛺ CECOP Coordinación y Telecomunicaciones Civiles REMER"
                      ].map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          onClick={() => setPrBeacon(tpl)}
                          className="px-2 py-0.5 bg-slate-950 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-slate-200 rounded text-[9px] cursor-pointer transition-all"
                        >
                          {tpl.length > 25 ? tpl.substring(0, 25) + "..." : tpl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end border-t border-slate-900 pt-3">
                  <button
                    type="button"
                    onClick={() => { setIsAddingPreset(false); setEditingPresetId(null); }}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-800 text-slate-400 font-sans font-bold rounded-lg cursor-pointer hover:bg-slate-900"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-sans font-black rounded-lg cursor-pointer flex items-center gap-1 uppercase tracking-wide"
                  >
                    {loading ? 'Procesando...' : editingPresetId ? 'Aplicar Modificaciones' : 'Crear Preset'}
                  </button>
                </div>
              </form>
            )}

            {/* PRESETS LIST */}
            {loadingPresets ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <RefreshCw className="animate-spin text-emerald-500" size={16} />
                <span className="text-slate-500 font-mono text-[10px]">Cargando presets de estación desde Firestore...</span>
              </div>
            ) : presets.length === 0 ? (
              <div className="border border-dashed border-slate-850 rounded-xl p-8 text-center text-slate-500 space-y-2">
                <Sliders size={28} className="mx-auto text-slate-700 block" />
                <p className="font-sans font-medium text-[11px]">No tiene ningún preset de estación guardado.</p>
                <p className="text-[10px] text-slate-600 max-w-sm mx-auto font-sans leading-relaxed">
                  Cree combinaciones de llamadas, SSID y balizas para configuraciones rápidas de emergencia o pulse &quot;Cargar por Defecto&quot; para precargar ejemplos de telecomunicaciones.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {presets.map((pr) => {
                  const fullCallsign = pr.ssid && pr.ssid !== '0' ? `${pr.callsign}-${pr.ssid}` : pr.callsign;
                  return (
                    <div key={pr.id} className="bg-slate-950/40 border border-slate-900 rounded-xl p-3 flex flex-col justify-between gap-3 hover:border-slate-800 hover:bg-slate-950/80 transition-all">
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-bold text-slate-200 text-xs block">{pr.name}</span>
                            <span className="text-[11px] text-emerald-400 font-bold block mt-1 tracking-wider">
                              📡 TRAMA: <span className="bg-emerald-950 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[10px]">{fullCallsign}</span>
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEditPreset(pr)}
                              className="p-1 hover:bg-slate-900 hover:text-emerald-400 rounded transition-colors text-slate-500 cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => pr.id && handleDeletePreset(pr.id)}
                              className="p-1 hover:bg-slate-900 hover:text-rose-400 rounded transition-colors text-slate-500 cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2.5 bg-slate-900/60 border border-slate-900/80 p-2 rounded-lg font-mono text-[10px] text-slate-400 italic">
                          &quot;{pr.aprsStatusComment}&quot;
                        </div>
                      </div>

                      {onApplyPreset && (
                        <button
                          type="button"
                          onClick={() => onApplyPreset(fullCallsign, pr.aprsStatusComment)}
                          className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 hover:text-slate-900 font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wide text-[9.5px] transition-all"
                        >
                          <Play size={10} />
                          Aplicar Preset Activo
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: SEGURIDAD (MFA) */}
        {activeSubTab === 'security' && (
          <div className="space-y-2">
            <TwoFactorConfigurator currentUser={currentUser} userProfile={userProfile} />
          </div>
        )}
      </div>
    </div>
  );
}
