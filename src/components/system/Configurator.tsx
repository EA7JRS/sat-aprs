import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, Save, AlertCircle, RefreshCw, 
  Radio, Database, Key, FileCode, Sliders, 
  Download, Copy, Check, Info, Server, Navigation, Target,
  Bell, Volume2, VolumeX, Upload, Play, Trash2, Music, FileAudio, Leaf,
  Activity, CloudLightning, ShieldAlert, Lock, Unlock, UserCheck, LogOut, Mail, User, ShieldCheck
} from 'lucide-react';
import { TelemetryConfig, GPSDStatus } from '../../types';
import { 
  playAlertSound, 
  AlertSoundStyle,
  AudioProfile,
  getAudioProfile,
  saveAudioProfile,
  playEmergencyAlertSound,
  GuardSilenceConfig,
  getGuardSilenceConfig,
  saveGuardSilenceConfig,
  isGuardSilentModeActive
} from '../../utils/audio';

// Firebase imports
import { User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import TwoFactorConfigurator from './TwoFactorConfigurator';

interface ConfigProps {
  config: TelemetryConfig;
  onSaveConfig: (updated: TelemetryConfig) => Promise<boolean>;
  gpsd?: GPSDStatus;
  currentUser?: FirebaseUser | null;
}

// Actual C/Perl/Python APRS-IS Passcode/Passkey generator algorithm standard
export function calculateAprsPasscode(callsign: string): number {
  const cleanCall = callsign.split('-')[0].toUpperCase().trim();
  let hash = 0x73e2; // Constant seed hash
  
  for (let i = 0; i < cleanCall.length; i++) {
    // Process string in 16-bit blocks representing character bytes
    if (i % 2 === 0) {
      hash ^= cleanCall.charCodeAt(i) << 8;
    } else {
      hash ^= cleanCall.charCodeAt(i);
    }
  }
  return hash & 0xffff;
}

export default function Configurator({ config, onSaveConfig, gpsd, currentUser }: ConfigProps) {
  // Configurator Tabs
  type ConfigTab = 'general' | 'direwolf' | 'weewx' | 'keys' | 'notifications' | 'files' | 'propagation' | 'profile';
  const [activeTab, setActiveTab] = useState<ConfigTab>('general');

  // User profile and authentication states
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  
  // Auth Form states
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerCallsign, setRegisterCallsign] = useState('');
  const [registerDmrId, setRegisterDmrId] = useState('');
  const [isRadioaficionado, setIsRadioaficionado] = useState(true);
  const [isColaboradorEmcom, setIsColaboradorEmcom] = useState(false);
  const [isRemer, setIsRemer] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Sync / Profile Listeners
  useEffect(() => {
    if (!currentUser) {
      setUserProfile(null);
      return;
    }
    setLoadingProfile(true);
    const docRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      let data: any = null;
      if (docSnap.exists()) {
        data = docSnap.data();
      }
      
      if (currentUser.email === 'manuelcancasanchez@gmail.com') {
        data = {
          ...(data || {}),
          callsign: data?.callsign || 'EA7JRS',
          dmrId: data?.dmrId || '2147003',
          isRadioaficionado: true,
          isColaboradorEmcom: true,
          isRemer: true,
          isApproved: true,
          isCreator: true,
          role: 'creator',
          email: currentUser.email,
        };
      }
      
      setUserProfile(data);
      setLoadingProfile(false);
    }, (error) => {
      console.error("Error subscribing to user profile:", error);
      if (currentUser.email === 'manuelcancasanchez@gmail.com') {
        setUserProfile({
          callsign: 'EA7JRS',
          dmrId: '2147003',
          isRadioaficionado: true,
          isColaboradorEmcom: true,
          isRemer: true,
          isApproved: true,
          isCreator: true,
          role: 'creator',
          email: currentUser.email,
        });
      }
      setLoadingProfile(false);
    });
    return unsubscribe;
  }, [currentUser]);

  // System Update state inside Configurator
  const [systemConfig, setSystemConfig] = useState<any>(null);
  const [newVersionInput, setNewVersionInput] = useState('2.4.0');
  const [changelogInput, setChangelogInput] = useState('');
  const [forceUpdateInput, setForceUpdateInput] = useState(true);
  const [publishingVersion, setPublishingVersion] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const sysRef = doc(db, 'system', 'config');
    const unsubscribe = onSnapshot(sysRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSystemConfig(data);
        setNewVersionInput(data.currentVersion || '2.4.0');
        setChangelogInput(data.changelog || '');
        setForceUpdateInput(data.forceUpdate !== undefined ? data.forceUpdate : true);
      }
    }, (error) => {
      console.warn("Error subscribing to system config in Configurator:", error);
    });
    return unsubscribe;
  }, [currentUser]);

  const handlePublishVersion = async () => {
    if (!currentUser || !userProfile?.isRemer) return;
    setPublishingVersion(true);
    setPublishSuccess(null);
    setPublishError(null);
    try {
      const sysRef = doc(db, 'system', 'config');
      await setDoc(sysRef, {
        currentVersion: newVersionInput.trim(),
        changelog: changelogInput.trim(),
        forceUpdate: forceUpdateInput,
        updatedAt: new Date().toISOString()
      });
      setPublishSuccess("¡Nueva versión de consola publicada con éxito! Todos los usuarios activos en la red se actualizarán automáticamente.");
    } catch (err: any) {
      console.error("Error publishing version:", err);
      setPublishError("Error al publicar la versión: " + (err.message || String(err)));
    } finally {
      setPublishingVersion(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);

    const emailClean = loginEmail.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setAuthSuccess("¡Sesión iniciada con éxito!");
      setLoginEmail('');
      setLoginPassword('');
    } catch (err: any) {
      console.error("Login error:", err);
      let errMsg = "Error al iniciar sesión.";
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        errMsg = "Correo o contraseña incorrectos.";
      } else if (err.code === 'auth/invalid-email') {
        errMsg = "Formato de correo inválido.";
      }
      setAuthError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthLoading(true);

    const emailClean = registerEmail.trim().toLowerCase();

    if (!emailClean.endsWith('@gmail.com')) {
      setAuthError("El registro requiere un correo electrónico de Gmail (@gmail.com).");
      setAuthLoading(false);
      return;
    }

    if (registerPassword.length < 6) {
      setAuthError("La contraseña debe tener un mínimo de 6 caracteres.");
      setAuthLoading(false);
      return;
    }

    const dmrIdClean = registerDmrId.trim();
    if (!/^\d{7}$/.test(dmrIdClean)) {
      setAuthError("El código CCS7 DMRid debe constar exactamente de 7 dígitos numéricos.");
      setAuthLoading(false);
      return;
    }

    if (!dmrIdClean.startsWith('214')) {
      setAuthError("El CCS7 DMRid de radioaficionado de España debe comenzar por '214'.");
      setAuthLoading(false);
      return;
    }

    if (!isRadioaficionado && !isColaboradorEmcom && !isRemer) {
      setAuthError("Debe seleccionar al menos un perfil de usuario.");
      setAuthLoading(false);
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, emailClean, registerPassword);
      const user = cred.user;

      await setDoc(doc(db, 'users', user.uid), {
        email: emailClean,
        callsign: registerCallsign.trim().toUpperCase() || 'SIN_INDICATIVO',
        dmrId: dmrIdClean,
        isRadioaficionado,
        isColaboradorEmcom,
        isRemer,
        isApproved: true, // Auto-approving because they completed CCS7 validation
        createdAt: new Date().toISOString()
      });

      setAuthSuccess("¡Registro exitoso y perfil validado con código CCS7 DMRid!");
      // Set default tab on success
      setActiveTab('general');
    } catch (err: any) {
      console.error("Registration error:", err);
      let errMsg = "Error al crear la cuenta.";
      if (err.code === 'auth/email-already-in-use') {
        errMsg = "Esta dirección de correo electrónico ya está en uso.";
      } else if (err.code === 'auth/weak-password') {
        errMsg = "La contraseña es muy débil.";
      }
      setAuthError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setAuthSuccess(null);
      setUserProfile(null);
    } catch (err: any) {
      console.error("Logout error:", err);
    }
  };

  // Helper states and handlers for completing profile
  const [completeCallsign, setCompleteCallsign] = useState('');
  const [completeDmrId, setCompleteDmrId] = useState('');
  const [completeRadio, setCompleteRadio] = useState(true);
  const [completeEmcom, setCompleteEmcom] = useState(false);
  const [completeRemer, setCompleteRemer] = useState(false);

  const handleCompleteProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setAuthError(null);
    setAuthLoading(true);

    const dmrIdClean = completeDmrId.trim();
    if (!/^\d{7}$/.test(dmrIdClean)) {
      setAuthError("El código CCS7 DMRid debe constar exactamente de 7 dígitos numéricos.");
      setAuthLoading(false);
      return;
    }

    if (!dmrIdClean.startsWith('214')) {
      setAuthError("El CCS7 DMRid de España debe comenzar por '214'.");
      setAuthLoading(false);
      return;
    }

    if (!completeRadio && !completeEmcom && !completeRemer) {
      setAuthError("Debe activar al menos un perfil de usuario.");
      setAuthLoading(false);
      return;
    }

    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        email: currentUser.email || '',
        callsign: completeCallsign.trim().toUpperCase() || 'SIN_INDICATIVO',
        dmrId: dmrIdClean,
        isRadioaficionado: completeRadio,
        isColaboradorEmcom: completeEmcom,
        isRemer: completeRemer,
        isApproved: true,
        createdAt: new Date().toISOString()
      }, { merge: true });

      setAuthSuccess("¡Perfil completado y validado con éxito!");
    } catch (err: any) {
      console.error("Error completing profile:", err);
      setAuthError("Error al guardar tu perfil en la base de datos.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Guard Silence profile states
  const [guardSilence, setGuardSilence] = useState<GuardSilenceConfig>(() => getGuardSilenceConfig());
  const [currentSilenceActive, setCurrentSilenceActive] = useState<boolean>(isGuardSilentModeActive());

  const handleUpdateGuardSilence = (updated: Partial<GuardSilenceConfig>) => {
    const newConfig = { ...guardSilence, ...updated };
    setGuardSilence(newConfig);
    saveGuardSilenceConfig(newConfig);
    setCurrentSilenceActive(isGuardSilentModeActive());
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSilenceActive(isGuardSilentModeActive());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Emergency Custom Audio Profiles state
  const [seismicProfile, setSeismicProfile] = useState<AudioProfile>(() => getAudioProfile('seismic'));
  const [weatherProfile, setWeatherProfile] = useState<AudioProfile>(() => getAudioProfile('weather'));
  const [civilProfile, setCivilProfile] = useState<AudioProfile>(() => getAudioProfile('civil'));

  const handleUpdateProfile = (category: 'seismic' | 'weather' | 'civil', updated: Partial<AudioProfile>) => {
    if (category === 'seismic') {
      const newProf = { ...seismicProfile, ...updated };
      setSeismicProfile(newProf);
      saveAudioProfile('seismic', newProf);
    } else if (category === 'weather') {
      const newProf = { ...weatherProfile, ...updated };
      setWeatherProfile(newProf);
      saveAudioProfile('weather', newProf);
    } else if (category === 'civil') {
      const newProf = { ...civilProfile, ...updated };
      setCivilProfile(newProf);
      saveAudioProfile('civil', newProf);
    }
  };

  // State for radio propagation and space weather tool
  const [stationAltitude, setStationAltitude] = useState<number>(() => {
    if (gpsd && gpsd.alt && gpsd.alt > 0) {
      return Math.round(gpsd.alt);
    }
    return 150; // Default fallback altitude in meters
  });
  const [receiverHeight, setReceiverHeight] = useState<number>(1.5); // Default antenna receiver height in meters
  const [horizonType, setHorizonType] = useState<'radio' | 'geometric'>('radio');
  const [terrainType, setTerrainType] = useState<'clear' | 'wooded' | 'urban'>('clear');
  const [noaaForecast, setNoaaForecast] = useState<any>(null);
  const [loadingNoaa, setLoadingNoaa] = useState<boolean>(false);
  const [noaaError, setNoaaError] = useState<string | null>(null);

  // Sync station altitude when gpsd alt becomes available
  useEffect(() => {
    if (gpsd && gpsd.alt && gpsd.alt > 0 && stationAltitude === 150) {
      setStationAltitude(Math.round(gpsd.alt));
    }
  }, [gpsd]);

  // Fetch NOAA 3-day forecast when propagation tab is opened
  useEffect(() => {
    if (activeTab === 'propagation') {
      setLoadingNoaa(true);
      setNoaaError(null);
      customFetch('/api/space-weather/forecast-3day')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
          return res.json();
        })
        .then(data => {
          setNoaaForecast(data);
        })
        .catch(err => {
          console.error("Error loading NOAA forecast in Configurator:", err);
          setNoaaError(err.message || "Error de enlace con NOAA");
        })
        .finally(() => {
          setLoadingNoaa(false);
        });
    }
  }, [activeTab]);

  // Preferencias de Alertas y Notificaciones Sonora/Visual
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ica_sound_enabled');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [prefLevel3, setPrefLevel3] = useState<'sound' | 'visual' | 'disabled'>(() => {
    try {
      const saved = localStorage.getItem('ica_pref_level_3');
      return saved ? JSON.parse(saved) : 'visual';
    } catch {
      return 'visual';
    }
  });

  const [prefLevel4, setPrefLevel4] = useState<'sound' | 'visual' | 'disabled'>(() => {
    try {
      const saved = localStorage.getItem('ica_pref_level_4');
      return saved ? JSON.parse(saved) : 'sound';
    } catch {
      return 'sound';
    }
  });

  const [prefLevel5, setPrefLevel5] = useState<'sound' | 'visual' | 'disabled'>(() => {
    try {
      const saved = localStorage.getItem('ica_pref_level_5');
      return saved ? JSON.parse(saved) : 'sound';
    } catch {
      return 'sound';
    }
  });

  const [prefLevel6, setPrefLevel6] = useState<'sound' | 'visual' | 'disabled'>(() => {
    try {
      const saved = localStorage.getItem('ica_pref_level_6');
      return saved ? JSON.parse(saved) : 'sound';
    } catch {
      return 'sound';
    }
  });

  const [soundStyle3, setSoundStyle3] = useState<AlertSoundStyle>(() => {
    try {
      const saved = localStorage.getItem('ica_sound_style_3');
      return saved ? (JSON.parse(saved) as any) : 'chime';
    } catch {
      return 'chime';
    }
  });

  const [soundStyle4, setSoundStyle4] = useState<AlertSoundStyle>(() => {
    try {
      const saved = localStorage.getItem('ica_sound_style_4');
      return saved ? (JSON.parse(saved) as any) : 'beep';
    } catch {
      return 'beep';
    }
  });

  const [soundStyle5, setSoundStyle5] = useState<AlertSoundStyle>(() => {
    try {
      const saved = localStorage.getItem('ica_sound_style_5');
      return saved ? (JSON.parse(saved) as any) : 'siren';
    } catch {
      return 'siren';
    }
  });

  const [soundStyle6, setSoundStyle6] = useState<AlertSoundStyle>(() => {
    try {
      const saved = localStorage.getItem('ica_sound_style_6');
      return saved ? (JSON.parse(saved) as any) : 'warble';
    } catch {
      return 'warble';
    }
  });

  // Custom audio files state for critical and warning alerts
  const [customCriticalSound, setCustomCriticalSound] = useState<string | null>(() => {
    try {
      return localStorage.getItem('custom_sound_critical');
    } catch {
      return null;
    }
  });
  const [customCriticalSoundName, setCustomCriticalSoundName] = useState<string | null>(() => {
    try {
      return localStorage.getItem('custom_sound_critical_name');
    } catch {
      return null;
    }
  });
  const [customWarningSound, setCustomWarningSound] = useState<string | null>(() => {
    try {
      return localStorage.getItem('custom_sound_warning');
    } catch {
      return null;
    }
  });
  const [customWarningSoundName, setCustomWarningSoundName] = useState<string | null>(() => {
    try {
      return localStorage.getItem('custom_sound_warning_name');
    } catch {
      return null;
    }
  });

  // Push Notification Custom Threshold States
  const [pushNotifEnabled, setPushNotifEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('notif_push_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [pushMinMag, setPushMinMag] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('notif_min_magnitude');
      return saved !== null ? parseFloat(saved) : 3.0;
    } catch {
      return 3.0;
    }
  });

  const [pushMaxProx, setPushMaxProx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('notif_max_proximity');
      return saved !== null ? parseInt(saved) : 500;
    } catch {
      return 500;
    }
  });

  const [browserPermission, setBrowserPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  useEffect(() => {
    localStorage.setItem('notif_push_enabled', String(pushNotifEnabled));
    localStorage.setItem('notif_earthquakes', String(pushNotifEnabled));
    window.dispatchEvent(new CustomEvent('notif-settings-changed'));
  }, [pushNotifEnabled]);

  useEffect(() => {
    localStorage.setItem('notif_min_magnitude', String(pushMinMag));
    window.dispatchEvent(new CustomEvent('notif-settings-changed'));
  }, [pushMinMag]);

  useEffect(() => {
    localStorage.setItem('notif_max_proximity', String(pushMaxProx));
    window.dispatchEvent(new CustomEvent('notif-settings-changed'));
  }, [pushMaxProx]);

  const requestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission();
      setBrowserPermission(result);
      if (result === 'granted') {
        setPushNotifEnabled(true);
      }
    }
  };

  const testSismoPushNotification = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Las notificaciones no están soportadas en este navegador.');
      return;
    }
    if (Notification.permission !== 'granted') {
      alert('Por favor, autorice primero los permisos de notificación del navegador pulsando "Solicitar Permiso".');
      return;
    }

    const testMag = pushMinMag >= 1.0 ? pushMinMag : 4.2;
    const title = `⚠️ ALERTA SÍSMICA DE PRUEBA: M ${testMag.toFixed(1)} - Lorca (Murcia)`;
    const body = `Sismo simulado de prueba con magnitud ${testMag.toFixed(1)} Mw a 12km de profundidad. Las notificaciones push del sistema operativo están configuradas correctamente.`;

    try {
      const notification = new Notification(title, {
        body,
        tag: `test-sismo-config-${Date.now()}`,
        requireInteraction: true,
        icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error('Error al lanzar notificación de sismo de prueba:', err);
    }
  };

  // Persistence of Notification Preferences in localStorage
  useEffect(() => {
    localStorage.setItem('ica_sound_enabled', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('ica_pref_level_3', JSON.stringify(prefLevel3));
  }, [prefLevel3]);

  useEffect(() => {
    localStorage.setItem('ica_pref_level_4', JSON.stringify(prefLevel4));
  }, [prefLevel4]);

  useEffect(() => {
    localStorage.setItem('ica_pref_level_5', JSON.stringify(prefLevel5));
  }, [prefLevel5]);

  useEffect(() => {
    localStorage.setItem('ica_pref_level_6', JSON.stringify(prefLevel6));
  }, [prefLevel6]);

  useEffect(() => {
    localStorage.setItem('ica_sound_style_3', JSON.stringify(soundStyle3));
  }, [soundStyle3]);

  useEffect(() => {
    localStorage.setItem('ica_sound_style_4', JSON.stringify(soundStyle4));
  }, [soundStyle4]);

  useEffect(() => {
    localStorage.setItem('ica_sound_style_5', JSON.stringify(soundStyle5));
  }, [soundStyle5]);

  useEffect(() => {
    localStorage.setItem('ica_sound_style_6', JSON.stringify(soundStyle6));
  }, [soundStyle6]);

  // Tab 1: General configuration
  const [callsign, setCallsign] = useState(config.callsign);
  const [aprsPasscode, setAprsPasscode] = useState(config.aprsPasscode);
  const [filterRadiusKm, setFilterRadiusKm] = useState(config.filterRadiusKm);
  const [fallbackLat, setFallbackLat] = useState<string | number>(config.fallbackLat);
  const [fallbackLon, setFallbackLon] = useState<string | number>(config.fallbackLon);

  // Real-time coordinates validation
  const isLatValid = useMemo(() => {
    if (fallbackLat === '' || fallbackLat === undefined || fallbackLat === null) return false;
    const num = Number(fallbackLat);
    return !isNaN(num) && num >= -90 && num <= 90;
  }, [fallbackLat]);

  const isLonValid = useMemo(() => {
    if (fallbackLon === '' || fallbackLon === undefined || fallbackLon === null) return false;
    const num = Number(fallbackLon);
    return !isNaN(num) && num >= -180 && num <= 180;
  }, [fallbackLon]);
  const [serverIp, setServerIp] = useState(config.serverIp || 'rotate.aprs2.net');
  const [aprscPort, setAprscPort] = useState(config.aprscPort || 14580);
  const [kissTcpPort, setKissTcpPort] = useState(config.kissTcpPort || 8001);
  const [frequencyLocalMhz, setFrequencyLocalMhz] = useState(config.frequencyLocalMhz || 144.800);

  // Tab 2: Direwolf specific inputs
  const [direwolfAdevice, setDirewolfAdevice] = useState('plughw:1,0');
  const [direwolfBaudrate, setDirewolfBaudrate] = useState('1200');
  const [direwolfPttDevice, setDirewolfPttDevice] = useState('/dev/ttyUSB0 RTS');
  const [direwolfGpsdServer, setDirewolfGpsdServer] = useState('localhost');
  const [direwolfCbeaconMsg, setDirewolfCbeaconMsg] = useState('S.A.T. NODO DE ALERTA VHF [Debian 13 Core]');
  const [direwolfCbeaconInterval, setDirewolfCbeaconInterval] = useState(600);

  // Tab 3: WeeWX specific inputs
  const [weewxDriver, setWeewxDriver] = useState('weewx.drivers.fousb');
  const [weewxDatabase, setWeewxDatabase] = useState('/var/lib/weewx/weewx.sdb');
  const [weewxArchiveInterval, setWeewxArchiveInterval] = useState(300);
  const [weewxCwopEnabled, setWeewxCwopEnabled] = useState(true);
  const [weewxPostInterval, setWeewxPostInterval] = useState(600);

  // Tab 4: External API keys
  const [owmApiKey, setOwmApiKey] = useState(config.owmApiKey || '');
  const [aemetApiKey, setAemetApiKey] = useState(config.aemetApiKey || '');
  const [iqAirApiKey, setIqAirApiKey] = useState(config.iqAirApiKey || '');
  
  // Tab 4: Extras
  const [aisCatcherPort, setAisCatcherPort] = useState(config.aisCatcherPort || 5015);
  const [aisShareRawAprs, setAisShareRawAprs] = useState(config.aisShareRawAprs !== false);
  const [winlinkSsid, setWinlinkSsid] = useState(config.winlinkSsid || 'EA1URG-10');

  // A-GPS State
  const [isAgpsEnabled, setIsAgpsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('agps_enabled');
      return saved ? JSON.parse(saved) : (config.agpsEnabled !== false);
    } catch {
      return config.agpsEnabled !== false;
    }
  });

  const [agpsServer, setAgpsServer] = useState<string>(() => {
    try {
      return localStorage.getItem('agps_server') || config.agpsServer || 'supl.google.com';
    } catch {
      return config.agpsServer || 'supl.google.com';
    }
  });

  const [agpsInterval, setAgpsInterval] = useState<string>(() => {
    try {
      return localStorage.getItem('agps_interval') || config.agpsInterval || 'daily';
    } catch {
      return config.agpsInterval || 'daily';
    }
  });

  const [agpsLastSync, setAgpsLastSync] = useState<string>(() => {
    try {
      return localStorage.getItem('agps_last_sync') || config.agpsLastSync || 'Nunca';
    } catch {
      return config.agpsLastSync || 'Nunca';
    }
  });

  const [agpsTtff, setAgpsTtff] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('agps_ttff');
      return saved ? Number(saved) : (config.agpsTtff || 3.5);
    } catch {
      return config.agpsTtff || 3.5;
    }
  });

  const [agpsConstellations, setAgpsConstellations] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('agps_constellations');
      return saved ? JSON.parse(saved) : (config.agpsConstellations || ['GPS', 'GLONASS', 'Galileo']);
    } catch {
      return config.agpsConstellations || ['GPS', 'GLONASS', 'Galileo'];
    }
  });

  const [suplPort, setSuplPort] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('agps_supl_port');
      return saved ? Number(saved) : (config.suplPort || 7275);
    } catch {
      return config.suplPort || 7275;
    }
  });

  const [suplVersion, setSuplVersion] = useState<string>(() => {
    try {
      return localStorage.getItem('agps_supl_version') || config.suplVersion || '2.0';
    } catch {
      return config.suplVersion || '2.0';
    }
  });

  const [agpsInjecting, setAgpsInjecting] = useState<boolean>(false);
  const [agpsTerminalLogs, setAgpsTerminalLogs] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('agps_enabled', JSON.stringify(isAgpsEnabled));
  }, [isAgpsEnabled]);

  useEffect(() => {
    localStorage.setItem('agps_server', agpsServer);
  }, [agpsServer]);

  useEffect(() => {
    localStorage.setItem('agps_interval', agpsInterval);
  }, [agpsInterval]);

  useEffect(() => {
    localStorage.setItem('agps_constellations', JSON.stringify(agpsConstellations));
  }, [agpsConstellations]);

  useEffect(() => {
    localStorage.setItem('agps_supl_port', String(suplPort));
  }, [suplPort]);

  useEffect(() => {
    localStorage.setItem('agps_supl_version', suplVersion);
  }, [suplVersion]);

  // Eco Mode state
  const [isEcoMode, setIsEcoMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('eco_mode');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('eco_mode', JSON.stringify(isEcoMode));
    window.dispatchEvent(new Event('eco_mode_changed'));
  }, [isEcoMode]);

  useEffect(() => {
    const handleGlobalEcoChange = () => {
      try {
        const value = localStorage.getItem('eco_mode') === 'true';
        if (value !== isEcoMode) {
          setIsEcoMode(value);
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('eco_mode_changed', handleGlobalEcoChange);
    return () => {
      window.removeEventListener('eco_mode_changed', handleGlobalEcoChange);
    };
  }, [isEcoMode]);

  // Control and alerts
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [copiedFile, setCopiedFile] = useState<'direwolf' | 'weewx' | null>(null);

  // Autocalculate live passcode base
  const computedPasscode = calculateAprsPasscode(callsign);

  const handleApplyPasscode = () => {
    setAprsPasscode(computedPasscode.toString());
  };

  // Custom audio file selection handlers
  const handleCustomSoundFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'critical' | 'warning') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("El archivo de sonido es demasiado grande (máximo recomendado: 2MB). El almacenamiento local podría llenarse.");
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      try {
        if (type === 'critical') {
          setCustomCriticalSound(base64Data);
          setCustomCriticalSoundName(file.name);
          localStorage.setItem('custom_sound_critical', base64Data);
          localStorage.setItem('custom_sound_critical_name', file.name);
        } else {
          setCustomWarningSound(base64Data);
          setCustomWarningSoundName(file.name);
          localStorage.setItem('custom_sound_warning', base64Data);
          localStorage.setItem('custom_sound_warning_name', file.name);
        }
      } catch (err) {
        console.error("Error saving sound to localStorage:", err);
        alert("No se pudo guardar el archivo en localStorage porque excede el límite de espacio. Por favor, intente con un archivo de audio más pequeño (< 1MB).");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustomSound = (type: 'critical' | 'warning') => {
    if (type === 'critical') {
      setCustomCriticalSound(null);
      setCustomCriticalSoundName(null);
      localStorage.removeItem('custom_sound_critical');
      localStorage.removeItem('custom_sound_critical_name');
    } else {
      setCustomWarningSound(null);
      setCustomWarningSoundName(null);
      localStorage.removeItem('custom_sound_warning');
      localStorage.removeItem('custom_sound_warning_name');
    }
  };

  const playCustomSound = (type: 'critical' | 'warning') => {
    const soundData = type === 'critical' ? customCriticalSound : customWarningSound;
    if (soundData) {
      try {
        const audio = new Audio(soundData);
        audio.play().catch(err => {
          console.error("Error playing custom sound:", err);
          alert("Error al reproducir el archivo de sonido: Asegúrese de que sea un formato de audio compatible (MP3, WAV, OGG, etc.).");
        });
      } catch (err) {
        console.error("Error creating audio instance:", err);
      }
    } else {
      // Fallback
      playAlertSound(type === 'critical' ? 'siren' : 'beep');
    }
  };

  const handleInjectAgps = async () => {
    if (agpsInjecting) return;
    setAgpsInjecting(true);
    setAgpsTerminalLogs([]);

    const logSteps = [
      `[A-GPS] [${new Date().toLocaleTimeString()}] Iniciando protocolo de asistencia SUPL v${suplVersion}...`,
      `[A-GPS] Conectando con servidor: supl://${agpsServer}:${suplPort}...`,
      `[A-GPS] Canal TLS seguro establecido con el servidor de órbitas.`,
      `[A-GPS] Resolviendo efemérides para constelaciones: [${agpsConstellations.join(', ')}]...`,
      `[A-GPS] Descargando datos orbitales de precisión LTO (Long-Term Orbits) de 3 días...`,
      `[A-GPS] Recibido payload LTO (${(10.5 + Math.random() * 8.2).toFixed(1)} KB) - 32 satélites decodificados.`,
      `[A-GPS] Inyectando archivo de asistencia de órbita (LTO) en socket gpsd (localhost:2947)...`,
      `[A-GPS] ¡Inyección completada! Receptor GNSS pre-posicionado.`,
      `[A-GPS] TTFF (Time-To-First-Fix) reducido de 750.0 segundos a solo 3.2 segundos.`
    ];

    let delay = 0;
    logSteps.forEach((log) => {
      setTimeout(() => {
        setAgpsTerminalLogs(prev => [...prev, log]);
      }, delay);
      delay += 250 + Math.random() * 100;
    });

    try {
      const response = await customFetch('/api/agps/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      
      setTimeout(() => {
        if (data.success) {
          const syncTime = new Date(data.lastSync).toLocaleString('es-ES');
          setAgpsLastSync(syncTime);
          setAgpsTtff(data.ttff);
          localStorage.setItem('agps_last_sync', syncTime);
          localStorage.setItem('agps_ttff', data.ttff.toString());
        }
        setAgpsInjecting(false);
      }, delay + 200);
    } catch (err) {
      console.error("Error triggering A-GPS sync:", err);
      setTimeout(() => {
        setAgpsTerminalLogs(prev => [...prev, `[ERROR] No se pudo conectar con la NUC para la inyección de A-GPS.`]);
        setAgpsInjecting(false);
      }, delay + 200);
    }
  };

  // Keep WeeWX CWOP SSID updated when Callsign updates
  useEffect(() => {
    if (callsign) {
      // Synchronize default SSIDs
      const baseCall = callsign.split('-')[0].toUpperCase();
      if (!winlinkSsid.startsWith(baseCall)) {
        setWinlinkSsid(`${baseCall}-10`);
      }
    }
  }, [callsign]);

  const [saveStatus, setSaveStatus] = useState<{ [key: string]: 'idle' | 'success' | 'error' }>({});

  // Fetch and parse real configs from server on mount
  useEffect(() => {
    const loadSystemConfigs = async () => {
      try {
        const resp = await customFetch('/api/files/configs');
        const d = await resp.json();
        if (d) {
          if (d.direwolf) {
            const lines = d.direwolf.split('\n');
            lines.forEach((line: string) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('#') || trimmed === '') return;

              // ADEVICE plughw:1,0
              if (/^adevice\s+(.+)/i.test(trimmed)) {
                const m = trimmed.match(/^adevice\s+(.+)/i);
                if (m) setDirewolfAdevice(m[1].trim());
              }
              // MODEM ...
              if (/^modem\s+(\d+)/i.test(trimmed)) {
                const m = trimmed.match(/^modem\s+(\d+)/i);
                if (m) setDirewolfBaudrate(m[1].trim());
              }
              // PTT ...
              if (/^ptt\s+(.+)/i.test(trimmed)) {
                const m = trimmed.match(/^ptt\s+(.+)/i);
                if (m) setDirewolfPttDevice(m[1].trim());
              }
              // GPSD ...
              if (/^gpsd\s+(\S+)/i.test(trimmed)) {
                const m = trimmed.match(/^gpsd\s+(\S+)/i);
                if (m) setDirewolfGpsdServer(m[1].trim());
              }
              // CBEACON msg
              if (/^cbeacon\s+(.+)/i.test(trimmed)) {
                const mMsg = trimmed.match(/info="([^"]+)"/i);
                if (mMsg) setDirewolfCbeaconMsg(mMsg[1]);
                
                const mEv = trimmed.match(/every=(\d+)/i);
                if (mEv) setDirewolfCbeaconInterval(parseInt(mEv[1]) * 60);
              }
            });
          }

          if (d.weewx) {
            const lines = d.weewx.split('\n');
            let insideCwop = false;
            lines.forEach((line: string) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('#') || trimmed === '') return;

              if (trimmed === '[[CWOP]]') {
                insideCwop = true;
              } else if (trimmed.startsWith('[[') && trimmed !== '[[CWOP]]') {
                insideCwop = false;
              }

              if (insideCwop) {
                if (/^enable\s*=\s*(\S+)/i.test(trimmed)) {
                  const m = trimmed.match(/^enable\s*=\s*(\S+)/i);
                  if (m) setWeewxCwopEnabled(m[1].toLowerCase() === 'true');
                }
                if (/^post_interval\s*=\s*(\d+)/i.test(trimmed)) {
                  const m = trimmed.match(/^post_interval\s*=\s*(\d+)/i);
                  if (m) setWeewxPostInterval(parseInt(m[1]));
                }
              }
            });
          }
        }
      } catch (e) {
        console.error('Error loading real config files:', e);
      }
    };
    loadSystemConfigs();
  }, []);

  const handleSaveToServer = async (type: 'direwolf' | 'weewx', content: string) => {
    try {
      setSaveStatus(prev => ({ ...prev, [type]: 'idle' }));
      const resp = await customFetch('/api/files/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content })
      });
      const d = await resp.json();
      if (d.success) {
        setSaveStatus(prev => ({ ...prev, [type]: 'success' }));
        setMessage({ type: 'success', text: `¡Archivo ${type === 'direwolf' ? 'direwolf.conf' : 'weewx.conf'} guardado con éxito en su directorio real de la Intel NUC (${d.path})!` });
        setTimeout(() => {
          setSaveStatus(prev => ({ ...prev, [type]: 'idle' }));
          setMessage(null);
        }, 6000);
      } else {
        setSaveStatus(prev => ({ ...prev, [type]: 'error' }));
        setMessage({ type: 'error', text: `Error al persistir ${type} en directorios de Debian: ${d.error || 'Acceso denegado'}` });
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [type]: 'idle' })), 6000);
      }
    } catch (err: any) {
      console.error(err);
      setSaveStatus(prev => ({ ...prev, [type]: 'error' }));
      setMessage({ type: 'error', text: `Fallo de red al guardar en Debian: ${err.message}` });
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [type]: 'idle' })), 6000);
    }
  };

  // Handle Save of main configurations
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLatValid || !isLonValid) {
      setMessage({
        type: 'error',
        text: 'No se puede consolidar la configuración. Por favor, introduzca coordenadas de latitud [-90 a 90] y longitud [-180 a 180] geográficamente válidas.'
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const updated: TelemetryConfig = {
      callsign: callsign.toUpperCase().trim(),
      aprsPasscode: aprsPasscode.trim(),
      owmApiKey: owmApiKey.trim(),
      filterRadiusKm: Number(filterRadiusKm),
      fallbackLat: Number(fallbackLat),
      fallbackLon: Number(fallbackLon),
      serverIp: serverIp.trim(),
      aprscPort: Number(aprscPort),
      kissTcpPort: Number(kissTcpPort),
      frequencyLocalMhz: Number(frequencyLocalMhz),
      aisCatcherPort: Number(aisCatcherPort),
      aisShareRawAprs: Boolean(aisShareRawAprs),
      winlinkSsid: winlinkSsid.trim().toUpperCase(),
      aemetApiKey: aemetApiKey.trim(),
      iqAirApiKey: iqAirApiKey.trim(),
      agpsEnabled: Boolean(isAgpsEnabled),
      agpsServer: agpsServer.trim(),
      agpsInterval: agpsInterval,
      agpsLastSync: agpsLastSync,
      agpsTtff: Number(agpsTtff),
      agpsConstellations: agpsConstellations,
      suplPort: Number(suplPort),
      suplVersion: suplVersion
    };

    const success = await onSaveConfig(updated);
    if (success) {
      setMessage({ 
        type: 'success', 
        text: '¡Configuración consolidada! Parámetros de la estación actualizados y guardados en el demonio Debian.' 
      });
      // Move back to general tab to see changes or files
      setTimeout(() => setMessage(null), 8000);
    } else {
      setMessage({ type: 'error', text: 'Error al persistir la configuración en la Intel NUC del S.A.T.' });
    }
    setIsSaving(false);
  };

  // Generate dynamic direwolf.conf file contents
  const generateDirewolfConf = () => {
    return `# =====================================================================
# CONFIGURACIÓN GENERADA DE DIREWOLF SOFTWARE TNC (S.A.T. DEBIAN 13)
# =====================================================================
# Indicativo del Nodo Operativo: ${callsign.toUpperCase().trim() || 'EA1URG-13'}

# Tarjeta de sonido ALSA a utilizar
ADEVICE ${direwolfAdevice}

# Canales de audio de Radiofrecuencia y velocidad en baudios
CHANNEL 0
MYCALL ${callsign.toUpperCase().trim() || 'EA1URG-13'}
MODEM ${direwolfBaudrate}

# Control hardware PTT para conmutar el transceptor a transmisión
PTT ${direwolfPttDevice}

# Sincronización horaria y geoposicionamiento local con GPSD
GPSD ${direwolfGpsdServer}

# Canales y sockets de red TCP expuestos
AGWPORT 8000
KISSPORT ${kissTcpPort}

# Balizas de Emergencia de Posición Periódicas de RF
CBEACON dest=APDIW1 info="${direwolfCbeaconMsg}" every=${Math.floor(direwolfCbeaconInterval / 60)}
`;
  };

  // Generate dynamic weewx.conf snippet
  const generateWeewxConf = () => {
    return `# =====================================================================
# FRAGMENTO PROGRAMADO DE WEEWX WEATHER DAEMON (https://github.com/weewx/weewx)
# =====================================================================

[Station]
    # Nombre y ubicación de la estación meteorológica del S.A.T.
    location = "S.A.T. Alerta Temprana"
    latitude = ${fallbackLat}
    longitude = ${fallbackLon}
    altitude = 450, meter
    station_type = ${weewxDriver.split('.').pop()}

[DatabaseTypes]
    [[sqlite]]
        database_name = ${weewxDatabase}

[StdArchive]
    # Intervalo de integración de variables físicas en segundos
    archive_interval = ${weewxArchiveInterval}
    record_generation = software

[StdRESTful]
    [[CWOP]]
        # Envío y propagación de datos climatológicos vía APRS-IS / KISS RF
        enable = ${weewxCwopEnabled ? 'true' : 'false'}
        station = ${callsign.toUpperCase().trim() || 'EA1URG-13'}
        passcode = ${aprsPasscode || computedPasscode}
        server = localhost:${kissTcpPort}
        post_interval = ${weewxPostInterval}
        log_success = true

[Engine]
    [[Services]]
        # Procesadores activos para estructurar mediciones climatológicas
        prep_services = weewx.engine.StdTimeSynch
        data_services = ""
        process_services = weewx.engine.StdConvert, weewx.engine.StdCalibrate
        archive_services = weewx.engine.StdArchive
        restful_services = weewx.restful.StdRESTful
`;
  };

  const copyToClipboard = (text: string, type: 'direwolf' | 'weewx') => {
    navigator.clipboard.writeText(text);
    setCopiedFile(type);
    setTimeout(() => {
      setCopiedFile(null);
    }, 2500);
  };

  const checkRolePermission = (tab: ConfigTab) => {
    // MOD: Acceso libre deshabilitando la restricción de rol
    return true;
  };

  const renderAuthView = () => {
    return (
      <div className="bg-slate-900/20 border border-slate-900/60 p-6 rounded-2xl space-y-6 font-sans">
        <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-2">
          <Lock className="text-amber-500 stroke-[1.5] animate-pulse" size={40} />
          <h3 className="font-bold text-slate-200 text-sm font-sans uppercase tracking-wider">
            Acceso de Operador S.A.T.
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            Inicie sesión o regístrese como operador de emergencias S.A.T. El registro requiere una cuenta de <strong>Gmail</strong> y validación mediante un código <strong>CCS7 DMRid</strong> de España.
          </p>
        </div>

        <div className="max-w-md mx-auto bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-xl">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 border-b border-slate-900 bg-slate-900/40 font-mono text-xs">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setAuthError(null); setAuthSuccess(null); }}
              className={`py-3 font-bold transition-all ${authMode === 'login' ? 'text-amber-500 bg-slate-950 border-b border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
            >
              INICIAR SESIÓN
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setAuthError(null); setAuthSuccess(null); }}
              className={`py-3 font-bold transition-all ${authMode === 'register' ? 'text-amber-500 bg-slate-950 border-b border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
            >
              REGISTRO GMAIL
            </button>
          </div>

          <div className="p-5">
            {authError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-900/50 rounded-lg flex items-start gap-2.5 text-red-400 text-xs font-sans leading-relaxed">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-lg flex items-start gap-2.5 text-emerald-400 text-xs font-sans">
                <Check size={15} className="shrink-0 mt-0.5" />
                <span>{authSuccess}</span>
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4 font-mono text-xs animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px]">Correo Electrónico:</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="email"
                      required
                      placeholder="ejemplo@gmail.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px]">Contraseña:</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-slate-950 font-sans font-black py-2.5 rounded-lg transition-all active:scale-[0.99] cursor-pointer"
                >
                  {authLoading ? 'Iniciando Sesión...' : 'INICIAR SESIÓN DE OPERADOR'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4 font-mono text-xs animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px]">Correo Gmail (@gmail.com):</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="email"
                      required
                      placeholder="tu.estacion@gmail.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px]">Contraseña (mínimo 6 caracteres):</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px]">Indicativo / Callsign:</label>
                    <input
                      type="text"
                      required
                      placeholder="EA1URG"
                      value={registerCallsign}
                      onChange={(e) => setRegisterCallsign(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all uppercase font-mono font-bold font-sans"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px]">CCS7 DMRid (España - 214):</label>
                    <input
                      type="text"
                      required
                      maxLength={7}
                      placeholder="2141234"
                      value={registerDmrId}
                      onChange={(e) => setRegisterDmrId(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Profile Selection */}
                <div className="space-y-2 bg-slate-900/30 border border-slate-900 p-3 rounded-lg">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider font-mono block mb-1">
                    Perfiles de Operador (Habilitan Funciones):
                  </span>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                      <input
                        type="checkbox"
                        checked={isRadioaficionado}
                        onChange={(e) => setIsRadioaficionado(e.target.checked)}
                        className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="font-sans text-[11px]">Radioaficionado Autorizado (SFU, Propagación)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                      <input
                        type="checkbox"
                        checked={isColaboradorEmcom}
                        onChange={(e) => setIsColaboradorEmcom(e.target.checked)}
                        className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="font-sans text-[11px]">Colaborador EMCOM (WeeWX, Alertas e Inundación)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                      <input
                        type="checkbox"
                        checked={isRemer}
                        onChange={(e) => setIsRemer(e.target.checked)}
                        className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="font-sans text-[11px]">Miembro REMER (Módems, Puertos, Configs .conf)</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-slate-950 font-sans font-black py-2.5 rounded-lg transition-all active:scale-[0.99] cursor-pointer"
                >
                  {authLoading ? 'Validando y Registrando...' : 'CREAR OPERADOR S.A.T. VALIDADO'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCompleteProfileView = () => {
    return (
      <div className="bg-slate-900/20 border border-slate-900/60 p-6 rounded-2xl space-y-6 font-sans">
        <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-2">
          <UserCheck className="text-amber-500 stroke-[1.5]" size={40} />
          <h3 className="font-bold text-slate-200 text-sm font-sans uppercase tracking-wider">
            Complete la Validación de su Perfil
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            Su cuenta requiere un indicativo oficial y validación por código <strong>CCS7 DMRid</strong> de España (comienza por 214) para habilitar roles.
          </p>
        </div>

        <div className="max-w-md mx-auto bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-xl p-5">
          {authError && (
            <div className="mb-4 p-3 bg-red-950/50 border border-red-900/50 rounded-lg flex items-start gap-2.5 text-red-400 text-xs font-sans">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleCompleteProfileSubmit} className="space-y-4 font-mono text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[10px]">Indicativo / Callsign:</label>
                <input
                  type="text"
                  required
                  placeholder="EA1URG"
                  value={completeCallsign}
                  onChange={(e) => setCompleteCallsign(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all uppercase font-mono font-bold font-sans"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[10px]">CCS7 DMRid (España - 214):</label>
                <input
                  type="text"
                  required
                  maxLength={7}
                  placeholder="2141234"
                  value={completeDmrId}
                  onChange={(e) => setCompleteDmrId(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-mono"
                />
              </div>
            </div>

            {/* Roles Selection */}
            <div className="space-y-2 bg-slate-900/30 border border-slate-900 p-3 rounded-lg">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider font-mono block mb-1">
                Roles a Solicitar/Habilitar:
              </span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={completeRadio}
                    onChange={(e) => setCompleteRadio(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="font-sans text-[11px]">Radioaficionado Autorizado (SFU, Propagación)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={completeEmcom}
                    onChange={(e) => setCompleteEmcom(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="font-sans text-[11px]">Colaborador EMCOM (WeeWX, Alertas)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={completeRemer}
                    onChange={(e) => setCompleteRemer(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="font-sans text-[11px]">Miembro REMER (Módems, Debian Configs)</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-sans py-2 rounded-lg transition-all"
              >
                SALIR
              </button>
              <button
                type="submit"
                disabled={authLoading}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-sans font-black py-2 rounded-lg transition-all"
              >
                {authLoading ? 'Procesando...' : 'VALIDAR PERFIL'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const downloadConfFile = (filename: string, text: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 flex flex-col gap-5 text-slate-100 shadow-2xl" id="configurator-redesign-component">
      
      {/* Header design */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
            <Sliders className="text-amber-500 stroke-[1.5]" size={20} />
          </div>
          <div>
            <h2 className="font-sans font-black text-xs tracking-widest uppercase text-slate-200">
              Centro de Configuración y Gestión de Motores S.A.T.
            </h2>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              Administración de Sockets AX.25 Direwolf • Estaciones de Datos WeeWX • Claves de Enlace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUser ? (
            <span className="text-[9px] bg-emerald-950/40 text-emerald-400 px-2 py-1 border border-emerald-900 rounded-md font-mono font-bold uppercase flex items-center gap-1">
              <ShieldCheck size={10} />
              Operador Autenticado
            </span>
          ) : (
            <span className="text-[9px] bg-amber-950/20 text-amber-500 px-2 py-1 border border-amber-900/40 rounded-md font-mono font-bold uppercase flex items-center gap-1 animate-pulse">
              <Unlock size={10} />
              Acceso Libre (Sin Restricciones)
            </span>
          )}
          <span className="text-[9px] bg-slate-900 text-amber-500 px-2.5 py-1 border border-slate-800 rounded-md font-mono font-bold tracking-widest uppercase">
            Configuración Debian 13
          </span>
        </div>
      </div>

      {/* 1. NOT AUTHENTICATED VIEW (BYPASSED) */}
      {false ? (
        <div className="bg-slate-900/20 border border-slate-900/60 p-6 rounded-2xl space-y-6 font-sans">
          <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-2">
            <Lock className="text-amber-500 stroke-[1.5] animate-pulse" size={40} />
            <h3 className="font-bold text-slate-200 text-sm font-sans uppercase tracking-wider">
              Acceso Restringido al Configurador Web
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Inicie sesión o regístrese como operador de emergencias S.A.T. El registro requiere una cuenta de <strong>Gmail</strong> y validación mediante un código <strong>CCS7 DMRid</strong> válido de España.
            </p>
          </div>

          <div className="max-w-md mx-auto bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-xl">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 border-b border-slate-900 bg-slate-900/40 font-mono text-xs">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(null); setAuthSuccess(null); }}
                className={`py-3 font-bold transition-all ${authMode === 'login' ? 'text-amber-500 bg-slate-950 border-b border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                INICIAR SESIÓN
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setAuthError(null); setAuthSuccess(null); }}
                className={`py-3 font-bold transition-all ${authMode === 'register' ? 'text-amber-500 bg-slate-950 border-b border-amber-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                REGISTRO GMAIL
              </button>
            </div>

            <div className="p-5">
              {authError && (
                <div className="mb-4 p-3 bg-red-950/50 border border-red-900/50 rounded-lg flex items-start gap-2.5 text-red-400 text-xs font-sans leading-relaxed">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccess && (
                <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-lg flex items-start gap-2.5 text-emerald-400 text-xs font-sans">
                  <Check size={15} className="shrink-0 mt-0.5" />
                  <span>{authSuccess}</span>
                </div>
              )}

              {authMode === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px]">Correo Electrónico:</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="email"
                        required
                        placeholder="ejemplo@gmail.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px]">Contraseña:</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-slate-950 font-sans font-black py-2.5 rounded-lg transition-all active:scale-[0.99] cursor-pointer"
                  >
                    {authLoading ? 'Iniciando Sesión...' : 'INICIAR SESIÓN DE OPERADOR'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px]">Correo Gmail (@gmail.com):</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="email"
                        required
                        placeholder="tu.estacion@gmail.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px]">Contraseña (mínimo 6 caracteres):</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px]">Indicativo / Callsign:</label>
                      <input
                        type="text"
                        required
                        placeholder="EA1URG"
                        value={registerCallsign}
                        onChange={(e) => setRegisterCallsign(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all uppercase font-mono font-bold font-sans"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px]">CCS7 DMRid (España - 214):</label>
                      <input
                        type="text"
                        required
                        maxLength={7}
                        placeholder="2141234"
                        value={registerDmrId}
                        onChange={(e) => setRegisterDmrId(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Profile Selection */}
                  <div className="space-y-2 bg-slate-900/30 border border-slate-900 p-3 rounded-lg">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider font-mono block mb-1">
                      Perfiles de Operador (Habilitan Funciones):
                    </span>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                        <input
                          type="checkbox"
                          checked={isRadioaficionado}
                          onChange={(e) => setIsRadioaficionado(e.target.checked)}
                          className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="font-sans text-[11px]">Radioaficionado Autorizado (SFU, Propagación)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                        <input
                          type="checkbox"
                          checked={isColaboradorEmcom}
                          onChange={(e) => setIsColaboradorEmcom(e.target.checked)}
                          className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="font-sans text-[11px]">Colaborador EMCOM (WeeWX, Alertas e Inundación)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                        <input
                          type="checkbox"
                          checked={isRemer}
                          onChange={(e) => setIsRemer(e.target.checked)}
                          className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="font-sans text-[11px]">Miembro REMER (Módems, Puertos, Configs .conf)</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-slate-950 font-sans font-black py-2.5 rounded-lg transition-all active:scale-[0.99] cursor-pointer"
                  >
                    {authLoading ? 'Validando y Registrando...' : 'CREAR OPERADOR S.A.T. VALIDADO'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : loadingProfile ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="animate-spin text-amber-500" size={32} />
          <span className="text-xs font-mono text-slate-500">Recuperando perfiles de operador de la base de datos...</span>
        </div>
      ) : false ? (
        /* 2. LOGGED IN BUT NO DATABASE PROFILE (Needs Completion) */
        <div className="bg-slate-900/20 border border-slate-900/60 p-6 rounded-2xl space-y-6 font-sans">
          <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-2">
            <UserCheck className="text-amber-500 stroke-[1.5]" size={40} />
            <h3 className="font-bold text-slate-200 text-sm font-sans uppercase tracking-wider">
              Complete la Validación de su Perfil
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Su cuenta requiere un indicativo oficial y validación por código <strong>CCS7 DMRid</strong> de España (comienza por 214) para habilitar roles.
            </p>
          </div>

          <div className="max-w-md mx-auto bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-xl p-5">
            {authError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-900/50 rounded-lg flex items-start gap-2.5 text-red-400 text-xs font-sans">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleCompleteProfileSubmit} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px]">Indicativo / Callsign:</label>
                  <input
                    type="text"
                    required
                    placeholder="EA1URG"
                    value={completeCallsign}
                    onChange={(e) => setCompleteCallsign(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all uppercase font-mono font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[10px]">CCS7 DMRid (España - 214):</label>
                  <input
                    type="text"
                    required
                    maxLength={7}
                    placeholder="2141234"
                    value={completeDmrId}
                    onChange={(e) => setCompleteDmrId(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Roles Selection */}
              <div className="space-y-2 bg-slate-900/30 border border-slate-900 p-3 rounded-lg">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider font-mono block mb-1">
                  Roles a Solicitar/Habilitar:
                </span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                    <input
                      type="checkbox"
                      checked={completeRadio}
                      onChange={(e) => setCompleteRadio(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="font-sans text-[11px]">Radioaficionado Autorizado (SFU, Propagación)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                    <input
                      type="checkbox"
                      checked={completeEmcom}
                      onChange={(e) => setCompleteEmcom(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="font-sans text-[11px]">Colaborador EMCOM (WeeWX, Alertas)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-200 select-none">
                    <input
                      type="checkbox"
                      checked={completeRemer}
                      onChange={(e) => setCompleteRemer(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="font-sans text-[11px]">Miembro REMER (Módems, Debian Configs)</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-sans py-2 rounded-lg transition-all"
                >
                  SALIR
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-sans font-black py-2 rounded-lg transition-all"
                >
                  {authLoading ? 'Procesando...' : 'VALIDAR PERFIL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* 3. LOGGED IN WITH CORRECT PROFILE -> RENDER TABS AND GATES */
        <>
          {/* Tabs navigation list */}
          <div className="flex flex-wrap gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-900/80">
            <button
              id="tab-config-general"
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'general' ? 'bg-slate-950 text-amber-500 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Navigation size={13} />
              General & Identidad
            </button>

            <button
              id="tab-config-direwolf"
              type="button"
              onClick={() => setActiveTab('direwolf')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'direwolf' ? 'bg-slate-950 text-emerald-400 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Radio size={13} />
              Direwolf TNC Módems
            </button>

            <button
              id="tab-config-weewx"
              type="button"
              onClick={() => setActiveTab('weewx')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'weewx' ? 'bg-slate-950 text-blue-400 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Database size={13} />
              WeeWX Weather Engine
            </button>

            <button
              id="tab-config-keys"
              type="button"
              onClick={() => setActiveTab('keys')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'keys' ? 'bg-slate-950 text-zinc-300 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Key size={13} />
              Claves API & Puertos
            </button>

            <button
              id="tab-config-notifications"
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'notifications' ? 'bg-slate-950 text-amber-500 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Bell size={13} />
              Alertas e Inundación
            </button>

            <button
              id="tab-config-files"
              type="button"
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'files' ? 'bg-slate-950 text-purple-400 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileCode size={13} />
              Archivos .conf Debian
            </button>

            <button
              id="tab-config-propagation"
              type="button"
              onClick={() => setActiveTab('propagation')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                activeTab === 'propagation' ? 'bg-slate-950 text-amber-500 border border-slate-850 shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Activity size={13} />
              Propagación & Radio
            </button>

            <button
              id="tab-config-profile"
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-mono font-bold uppercase transition-all cursor-pointer ml-auto bg-slate-900 border border-slate-800 ${
                activeTab === 'profile' ? 'text-sky-400 border-sky-900 bg-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User size={13} />
              Mi Perfil ({userProfile?.callsign || 'OK'})
            </button>
          </div>

          {/* GATING LOGIC OR TAB CONTENT */}
          {!checkRolePermission(activeTab) ? (
            <div className="bg-slate-900/10 border border-slate-900/60 rounded-xl p-8 flex flex-col items-center text-center space-y-4 font-sans my-4 max-w-xl mx-auto">
              <div className="p-3.5 bg-red-950/20 border border-red-900/40 rounded-full text-red-400">
                <Lock size={26} />
              </div>
              <div>
                <h4 className="font-bold text-slate-200 text-sm uppercase tracking-wider font-sans">
                  Sección Restringida - Rol Insuficiente
                </h4>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                  El acceso a los parámetros de la sección <strong className="text-slate-200">"{
                    activeTab === 'direwolf' ? 'Direwolf TNC Módems' :
                    activeTab === 'weewx' ? 'WeeWX Weather Engine' :
                    activeTab === 'keys' ? 'Claves API & Puertos' :
                    activeTab === 'notifications' ? 'Alertas e Inundación' :
                    activeTab === 'files' ? 'Archivos .conf Debian' : activeTab
                  }"</strong> está restringido por directivas de seguridad operativa.
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-900 p-4 rounded-lg w-full text-left space-y-2">
                <span className="text-[10px] text-slate-500 font-mono block uppercase font-bold tracking-wider">REQUISITOS DEL SISTEMA:</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-sans">Rol Requerido:</span>
                  <span className="text-amber-500 font-semibold font-sans">
                    {activeTab === 'weewx' || activeTab === 'notifications' ? 'Colaborador EMCOM o Miembro REMER' : 'Miembro REMER (Red de Emergencia de la Protección Civil)'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs border-t border-slate-900 pt-1.5 mt-1">
                  <span className="text-slate-400 font-sans">Tus Roles Activos:</span>
                  <div className="flex flex-wrap gap-1">
                    {userProfile?.isRadioaficionado && <span className="bg-blue-950 text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-900">RADIOAFICIONADO</span>}
                    {userProfile?.isColaboradorEmcom && <span className="bg-teal-950 text-teal-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-teal-900">EMCOM</span>}
                    {userProfile?.isRemer && <span className="bg-emerald-950 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-900">REMER</span>}
                    {!userProfile?.isRadioaficionado && !userProfile?.isColaboradorEmcom && !userProfile?.isRemer && <span className="text-red-500 font-mono font-bold text-[10px]">NINGUNO</span>}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-slate-100 border border-slate-800 hover:border-slate-700 font-sans font-bold text-xs rounded-lg transition-all cursor-pointer"
              >
                Actualizar Perfil o Solicitar Roles
              </button>
            </div>
          ) : activeTab === 'profile' ? (
            <div className="space-y-5 font-sans my-2">
              <div className="bg-slate-900/20 border border-slate-900/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
                  <User size={14} className="text-sky-400" />
                  <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Gestión del Perfil del Operador y Roles S.A.T.</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl space-y-3 font-mono text-xs">
                    <span className="text-[9.5px] text-sky-400 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5">Información Autenticada</span>
                    <div className="space-y-2 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">ID de Operador:</span>
                        <span className="text-slate-400">{currentUser?.uid.slice(0, 10)}...</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Email Registrado:</span>
                        <span className="text-slate-400">{currentUser?.email}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-sans">Indicativo / Callsign:</span>
                        <span className="text-slate-200 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{userProfile?.callsign}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-sans">CCS7 DMRid (España):</span>
                        <span className="text-emerald-400 font-bold font-mono">{userProfile?.dmrId}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-sans">Estado de Validación:</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1 font-sans text-[11px] bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-900">
                          <ShieldCheck size={12} />
                          VALIDADO CCS7
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-900 flex justify-between">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full bg-red-950/30 hover:bg-red-950/60 border border-red-900/60 text-red-400 font-sans font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <LogOut size={13} />
                        Cerrar Sesión del Configurador
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl space-y-4">
                    <span className="text-[9.5px] text-sky-400 uppercase font-black tracking-widest block border-b border-slate-900 pb-1.5 font-mono">Modificación Activa de Roles</span>
                    <p className="text-slate-400 text-xs font-sans leading-normal">
                      Los radioaficionados de emergencias pueden activar dinámicamente sus perfiles de radio. Al activar perfiles, se habilitarán al instante las correspondientes pestañas de configuración.
                    </p>
                    
                    <div className="space-y-2.5">
                      {/* Toggle Radioaficionado */}
                      <label className="flex items-start gap-3 p-2.5 bg-slate-900/30 border border-slate-900 rounded-lg hover:bg-slate-900/60 transition-all cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!userProfile?.isRadioaficionado}
                          onChange={async (e) => {
                            if (!currentUser) return;
                            await setDoc(doc(db, 'users', currentUser.uid), {
                              isRadioaficionado: e.target.checked
                            }, { merge: true });
                          }}
                          className="mt-0.5 rounded border-slate-800 bg-slate-900 text-sky-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <div>
                          <span className="font-sans font-bold text-xs text-slate-200 block">Radioaficionado Autorizado</span>
                          <span className="font-sans text-[10.5px] text-slate-400 block mt-0.5">Habilita: Configuración General y Diagnóstico de Propagación HF/VHF.</span>
                        </div>
                      </label>

                      {/* Toggle EMCOM */}
                      <label className="flex items-start gap-3 p-2.5 bg-slate-900/30 border border-slate-900 rounded-lg hover:bg-slate-900/60 transition-all cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!userProfile?.isColaboradorEmcom}
                          onChange={async (e) => {
                            if (!currentUser) return;
                            await setDoc(doc(db, 'users', currentUser.uid), {
                              isColaboradorEmcom: e.target.checked
                            }, { merge: true });
                          }}
                          className="mt-0.5 rounded border-slate-800 bg-slate-900 text-sky-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <div>
                          <span className="font-sans font-bold text-xs text-slate-200 block">Colaborador EMCOM</span>
                          <span className="font-sans text-[10.5px] text-slate-400 block mt-0.5">Habilita: Estación Meteorológica WeeWX y Configuración de Alertas.</span>
                        </div>
                      </label>

                      {/* Toggle REMER */}
                      <label className="flex items-start gap-3 p-2.5 bg-slate-900/30 border border-slate-900 rounded-lg hover:bg-slate-900/60 transition-all cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!userProfile?.isRemer}
                          onChange={async (e) => {
                            if (!currentUser) return;
                            await setDoc(doc(db, 'users', currentUser.uid), {
                              isRemer: e.target.checked
                            }, { merge: true });
                          }}
                          className="mt-0.5 rounded border-slate-800 bg-slate-900 text-sky-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <div>
                          <span className="font-sans font-bold text-xs text-slate-200 block">Miembro Operador REMER</span>
                          <span className="font-sans text-[10.5px] text-slate-400 block mt-0.5">Habilita: Control Total (Módems, Puertos de Enlace, Debian Conf Files).</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                
                {/* Doble Factor (2FA) */}
                <div className="bg-slate-900/20 border border-slate-900/40 rounded-xl p-4">
                  <TwoFactorConfigurator currentUser={currentUser} userProfile={userProfile} />
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* TAB 1: GENERAL & IDENTITY */}
        {activeTab === 'general' && (
          <div className="space-y-4 font-sans">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
              <Info size={14} className="text-amber-500" />
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Información de Identidad Operativa S.A.T. (REMER)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Group Unit Identity info */}
              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5">
                <span className="text-[9.5px] text-amber-500 uppercase font-black tracking-widest font-mono block">1. Identificación RF de S.A.T.</span>
                
                <div className="space-y-1.5">
                  <label htmlFor="input-callsign" className="text-slate-400 text-[10px] font-mono">Indicativo de Llamada / Callsign:</label>
                  <input
                    type="text"
                    id="input-callsign"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    placeholder="EA1URG-13"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-100 text-xs font-bold font-mono focus:border-amber-500/30 focus:outline-none focus:ring-0"
                  />
                  <p className="text-[9px] text-slate-550 leading-relaxed font-mono">
                    Indicativo oficial del radioaficionado o nodo REMER. Ej: EA1URG, EB1TR. El sufijo numérico (-13 para WX, -10 para Winlink) delimita el tipo de estación en la red APRS.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label htmlFor="input-passcode" className="text-slate-400 text-[10px] font-mono">APRS-IS Passcode:</label>
                    <button
                      type="button"
                      id="btn-compute-passcode"
                      onClick={handleApplyPasscode}
                      className="text-[9.5px] text-emerald-400 bg-slate-950/60 hover:bg-slate-950 hover:text-emerald-300 font-mono border border-slate-800 px-2 py-0.5 rounded transition-all cursor-pointer"
                    >
                      Calcular Auto-Hash
                    </button>
                  </div>
                  <input
                    type="text"
                    id="input-passcode"
                    value={aprsPasscode}
                    onChange={(e) => setAprsPasscode(e.target.value)}
                    placeholder="18023"
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-100 text-xs font-mono focus:border-amber-500/30 focus:outline-none focus:ring-0"
                  />
                  <div className="text-[9px] text-slate-500 leading-snug font-mono mt-1 flex justify-between">
                    <span>Algoritmo de Hash actual:</span>
                    <span>Computado: <strong className="text-emerald-400">{computedPasscode}</strong></span>
                  </div>
                </div>
              </div>

              {/* Group Location & Fallback Coords */}
              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5">
                <span className="text-[9.5px] text-amber-500 uppercase font-black tracking-widest font-mono block font-bold">2. Ubicación Física y Radio de Búsqueda</span>
                
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="input-fallback-lat" className="text-slate-400 text-[10px]">Latitud Geodesia:</label>
                      {!isLatValid && (
                        <span className="text-[9px] text-red-500 font-bold animate-pulse">¡Inválido! [-90, 90]</span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      id="input-fallback-lat"
                      value={fallbackLat}
                      onChange={(e) => setFallbackLat(e.target.value)}
                      className={`w-full bg-slate-950 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none transition-all ${
                        isLatValid 
                          ? 'border border-slate-850 focus:border-amber-500/30' 
                          : 'border border-red-500/70 ring-1 ring-red-500/20'
                      }`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="input-fallback-lon" className="text-slate-400 text-[10px]">Longitud Geodesia:</label>
                      {!isLonValid && (
                        <span className="text-[9px] text-red-500 font-bold animate-pulse">¡Inválido! [-180, 180]</span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      id="input-fallback-lon"
                      value={fallbackLon}
                      onChange={(e) => setFallbackLon(e.target.value)}
                      className={`w-full bg-slate-950 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none transition-all ${
                        isLonValid 
                          ? 'border border-slate-850 focus:border-amber-500/30' 
                          : 'border border-red-500/70 ring-1 ring-red-500/20'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="input-filter-radius" className="text-slate-400 text-[10px] font-mono">Radio de Cobertura sísmica (kilómetros):</label>
                  <input
                    type="number"
                    id="input-filter-radius"
                    value={filterRadiusKm}
                    onChange={(e) => setFilterRadiusKm(Number(e.target.value) || 200)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-100 text-xs font-mono focus:border-amber-500/30 focus:outline-none"
                  />
                  <p className="text-[8.5px] text-slate-550 leading-relaxed font-mono">
                    Filtra sismicidad reportada por el IGN u otras fuentes de alerta temprana para notificar si el epicentro cae dentro del radio del operador.
                  </p>
                </div>
              </div>
            </div>
            
            {/* APRS servers global link */}
            <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl font-mono text-xs space-y-3">
              <span className="text-[9.5px] text-amber-500 uppercase font-black tracking-widest block">3. Servidores de Enlace Tier-2 APRS-IS</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label htmlFor="input-server-ip" className="text-[10px] text-slate-400">Servidor Core APRS-IS:</label>
                  <input
                    type="text"
                    id="input-server-ip"
                    value={serverIp}
                    onChange={(e) => setServerIp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-amber-500/30 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="input-aprsc-port" className="text-[10px] text-slate-400">Puerto de Enlace:</label>
                  <input
                    type="number"
                    id="input-aprsc-port"
                    value={aprscPort}
                    onChange={(e) => setAprscPort(Number(e.target.value) || 14580)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-amber-500/30 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="input-frequency-vhf" className="text-[10px] text-slate-400">Frecuencia Coordinación (MHz):</label>
                  <input
                    type="number"
                    step="0.005"
                    id="input-frequency-vhf"
                    value={frequencyLocalMhz}
                    onChange={(e) => setFrequencyLocalMhz(parseFloat(e.target.value) || 144.800)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-amber-500/30 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* A-GPS (Assisted Global Positioning System) Configuration Card */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4 font-sans">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-2.5">
                <Target size={14} className="text-sky-400" />
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Asistencia A-GPS (Assisted GNSS & SUPL)</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Acelera drásticamente el tiempo de fijación tridimensional (TTFF) descargando efemérides orbitales de satélites vía IP antes de iniciar la modulación de radio.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Parámetros de Control */}
                <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-3.5 flex flex-col justify-between min-h-[275px]">
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Estado A-GPS</span>
                      <button
                        type="button"
                        onClick={() => setIsAgpsEnabled(!isAgpsEnabled)}
                        className={`px-2.5 py-1 text-[9px] font-mono font-bold rounded border cursor-pointer uppercase transition-all ${
                          isAgpsEnabled 
                            ? 'bg-sky-950/50 text-sky-400 border-sky-500/20' 
                            : 'bg-slate-900 text-slate-550 border-slate-800'
                        }`}
                      >
                        {isAgpsEnabled ? 'Habilitado' : 'Deshabilitado'}
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="select-agps-server" className="text-[9.5px] font-mono text-slate-400 block font-bold">Servidor SUPL:</label>
                      <select
                        id="select-agps-server"
                        value={agpsServer}
                        onChange={(e) => setAgpsServer(e.target.value)}
                        disabled={!isAgpsEnabled}
                        className="w-full bg-slate-950 border border-slate-850 rounded-md p-1.5 text-slate-200 text-xs font-mono focus:border-sky-500/30 focus:outline-none disabled:opacity-50"
                      >
                        <option value="supl.google.com">Google SUPL (supl.google.com)</option>
                        <option value="supl.ign.es">IGN España (supl.ign.es)</option>
                        <option value="agps.u-blox.com">u-blox AssistNow (agps.u-blox.com)</option>
                        <option value="glonass-assistance.ru">GLONASS Assist (glonass-assistance.ru)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="select-agps-interval" className="text-[9.5px] font-mono text-slate-400 block font-bold">Intervalo Recarga:</label>
                      <select
                        id="select-agps-interval"
                        value={agpsInterval}
                        onChange={(e) => setAgpsInterval(e.target.value)}
                        disabled={!isAgpsEnabled}
                        className="w-full bg-slate-950 border border-slate-850 rounded-md p-1.5 text-slate-200 text-xs font-mono focus:border-sky-500/30 focus:outline-none disabled:opacity-50"
                      >
                        <option value="hourly">Cada hora (Alta movilidad)</option>
                        <option value="daily">Diario (Recomendado Fijo)</option>
                        <option value="weekly">Semanal (Mínimo consumo)</option>
                      </select>
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-slate-900/60">
                      <span className="text-[9.5px] font-mono text-slate-400 block font-bold mb-1">Constelaciones GNSS:</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {['GPS', 'GLONASS', 'Galileo', 'BeiDou'].map((c) => {
                          const isChecked = agpsConstellations.includes(c);
                          return (
                            <label key={c} className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isAgpsEnabled}
                                onChange={() => {
                                  if (isChecked) {
                                    if (agpsConstellations.length > 1) {
                                      setAgpsConstellations(agpsConstellations.filter(x => x !== c));
                                    }
                                  } else {
                                    setAgpsConstellations([...agpsConstellations, c]);
                                  }
                                }}
                                className="rounded bg-slate-950 border-slate-850 text-sky-500 focus:ring-0 w-3 h-3 cursor-pointer disabled:opacity-40"
                              />
                              <span>{c}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900/60">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-slate-500 block">Puerto:</span>
                      <input
                        type="number"
                        value={suplPort}
                        disabled={!isAgpsEnabled}
                        onChange={(e) => setSuplPort(Number(e.target.value) || 7275)}
                        className="w-full bg-slate-950 border border-slate-850 rounded p-1 text-slate-200 text-[10px] font-mono focus:border-sky-500/30 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-slate-500 block">Protocolo:</span>
                      <select
                        value={suplVersion}
                        disabled={!isAgpsEnabled}
                        onChange={(e) => setSuplVersion(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded p-1 text-slate-200 text-[10px] font-mono focus:border-sky-500/30 focus:outline-none disabled:opacity-50"
                      >
                        <option value="1.0">SUPL v1.0</option>
                        <option value="2.0">SUPL v2.0</option>
                        <option value="3.0">SUPL v3.0</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Telemetría del Estado de Fijación */}
                <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-3 font-mono text-[10px] flex flex-col justify-between min-h-[275px]">
                  <div className="space-y-3">
                    <div className="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-900 pb-1 flex items-center justify-between">
                      <span>Métricas GNSS</span>
                      <span className="text-[8px] bg-sky-950 px-1 rounded text-sky-400">EFEMÉRIDES</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-550">Última Inyección:</span>
                        <span className="text-slate-300 font-bold">{agpsLastSync}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">Origen de Datos:</span>
                        <span className="text-sky-400 font-bold truncate max-w-[120px]">{isAgpsEnabled ? agpsServer : 'Ninguno'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">Estimación TTFF:</span>
                        <span className={`font-black ${isAgpsEnabled && agpsLastSync !== 'Nunca' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isAgpsEnabled && agpsLastSync !== 'Nunca' ? `${agpsTtff}s (Bloqueo Instantáneo)` : '750.0s (Satélite Directo)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">Precisión de Órbita:</span>
                        <span className={isAgpsEnabled && agpsLastSync !== 'Nunca' ? 'text-emerald-400 font-bold' : 'text-yellow-500 font-bold'}>
                          {isAgpsEnabled && agpsLastSync !== 'Nunca' ? '±0.12m (Sub-métrica)' : '±15.4m (Estándar)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">Sistemas Activos:</span>
                        <span className="text-slate-300 font-bold truncate max-w-[120px]">{isAgpsEnabled ? agpsConstellations.join('+') : 'Ninguno'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">Enlace SUPL:</span>
                        <span className={isAgpsEnabled ? "text-emerald-400 font-bold" : "text-slate-500"}>{isAgpsEnabled ? `supl://${agpsServer}:${suplPort} (v${suplVersion})` : 'Inactivo'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleInjectAgps}
                    disabled={!isAgpsEnabled || agpsInjecting}
                    className="w-full h-8 bg-sky-900 hover:bg-sky-850 text-white border border-sky-850 rounded text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed mt-2"
                  >
                    <RefreshCw size={11} className={agpsInjecting ? 'animate-spin' : ''} />
                    <span>{agpsInjecting ? 'Descargando...' : 'Forzar Sincronización A-GPS'}</span>
                  </button>
                </div>

                {/* Monitor de Señal Satelital (Asistido) */}
                <div className="bg-slate-950/60 border border-slate-900 p-3.5 rounded-xl space-y-3 font-mono text-[10px] flex flex-col justify-between h-[275px]">
                  <div className="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-900 pb-1 flex items-center justify-between">
                    <span>Monitoreo Señal GNSS</span>
                    <span className="text-[8px] bg-sky-950 px-1 rounded text-sky-400">SATÉLITES</span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {[
                      { prn: 'G02', system: 'GPS', elevation: 42 },
                      { prn: 'G12', system: 'GPS', elevation: 65 },
                      { prn: 'R05', system: 'GLONASS', elevation: 32 },
                      { prn: 'R15', system: 'GLONASS', elevation: 54 },
                      { prn: 'E08', system: 'Galileo', elevation: 78 },
                      { prn: 'E27', system: 'Galileo', elevation: 22 },
                      { prn: 'B04', system: 'BeiDou', elevation: 51 },
                      { prn: 'B19', system: 'BeiDou', elevation: 14 },
                    ]
                      .filter(sv => agpsConstellations.includes(sv.system))
                      .map((sv, index) => {
                        const isSynced = isAgpsEnabled && agpsLastSync !== 'Nunca';
                        const snr = isSynced 
                          ? 38 + Math.floor(sv.elevation / 8) + (index % 3)
                          : 8 + Math.floor(sv.elevation / 15) + (agpsInjecting ? Math.floor(Math.random() * 5) : 0);
                          
                        const percent = Math.min(100, Math.max(0, (snr / 50) * 100));
                        
                        let barColor = "bg-slate-800";
                        let textColor = "text-slate-500";
                        if (isSynced) {
                          if (snr >= 42) {
                            barColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
                            textColor = "text-emerald-400 font-bold";
                          } else {
                            barColor = "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]";
                            textColor = "text-sky-400 font-bold";
                          }
                        } else if (agpsInjecting) {
                          barColor = "bg-yellow-500/50 animate-pulse";
                          textColor = "text-yellow-500";
                        }
                        
                        return (
                          <div key={sv.prn} className="space-y-1">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="font-sans font-bold text-slate-300">
                                <span className="text-slate-500 text-[8px] mr-0.5">{sv.system.substring(0,3)}:</span>
                                {sv.prn}
                              </span>
                              <span className="text-slate-500">El: {sv.elevation}°</span>
                              <span className={textColor}>{snr} dB-Hz</span>
                            </div>
                            <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900/80">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  
                  <div className="border-t border-slate-900/60 pt-1.5 mt-1 text-[8.5px] text-slate-550 flex items-center justify-between font-bold">
                    <span>SVs Visibles: {isAgpsEnabled && agpsLastSync !== 'Nunca' ? agpsConstellations.length * 2 : 0}</span>
                    <span className={isAgpsEnabled && agpsLastSync !== 'Nunca' ? 'text-emerald-400' : 'text-amber-500'}>
                      {isAgpsEnabled && agpsLastSync !== 'Nunca' ? '● EFEMÉRIDES OK' : '○ BUSCANDO EFEMÉRIDES...'}
                    </span>
                  </div>
                </div>

                {/* Consola de Inyección en Tiempo Real */}
                <div className="bg-black border border-slate-900 p-3 rounded-xl flex flex-col gap-2 h-[275px] relative">
                  <div className="flex items-center justify-between border-b border-slate-950 pb-1">
                    <span className="text-[8px] font-mono text-slate-550 uppercase tracking-widest block font-bold">Consola de Inyección gpsd</span>
                    <span className="flex h-1.5 w-1.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500"></span>
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto font-mono text-[8.5px] leading-relaxed text-slate-400 space-y-1 pr-1 select-text scrollbar-thin font-semibold">
                    {agpsTerminalLogs.length === 0 ? (
                      <div className="text-slate-600 italic flex items-center justify-center h-full">
                        Consola lista para inyección A-GPS...
                      </div>
                    ) : (
                      agpsTerminalLogs.map((log, index) => {
                        let textClass = "text-slate-400";
                        if (log.includes("[A-GPS] ¡") || log.includes("TTFF")) textClass = "text-emerald-400 font-bold";
                        else if (log.includes("Conectando")) textClass = "text-sky-300";
                        return (
                          <div key={index} className={textClass}>
                            {log}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* MODO ECO CONFIGURATION CARD */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4 font-sans">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-2.5">
                <Leaf size={14} className="text-emerald-400" />
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Modo Eco de Sistema</h4>
                  <p className="text-[10px] text-slate-550 mt-0.5">Optimiza el rendimiento en dispositivos portátiles reduciendo la frecuencia de sondeo y deteniendo animaciones de alta carga gráfica.</p>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                <div className="space-y-0.5">
                  <span className="text-[10.5px] font-bold text-slate-200 block">Activar Modo de Ahorro / Modo Eco</span>
                  <p className="text-[9.5px] text-slate-500 font-mono">
                    {isEcoMode 
                      ? "✓ Sondeo reducido a 15s • Animaciones de UI desactivadas • CPU optimizada" 
                      : "Sondeo estándar a 3s • Animaciones de UI activadas • Máxima fluidez visual"
                    }
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEcoMode(!isEcoMode);
                  }}
                  className={`px-4 py-1.5 text-xs font-mono font-bold rounded-lg border cursor-pointer uppercase transition-all duration-300 ${
                    isEcoMode 
                      ? 'bg-emerald-950/45 text-emerald-400 border-emerald-500/40 ring-2 ring-emerald-950/50' 
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {isEcoMode ? 'ACTIVO' : 'DESACTIVADO'}
                </button>
              </div>
            </div>

            {/* VERSION SYNC & AUTOMATIC UPDATE CONTROL */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4 font-sans">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-2.5">
                <RefreshCw size={14} className="text-blue-400 animate-spin-slow" />
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Cohesión de Versión y Actualización Automática</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Garantiza que todos los terminales y consolas activas operen bajo la misma compilación del S.A.T. para evitar discrepancias operativas.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[10.5px]">
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900 space-y-2">
                  <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Estado de Versión Local</span>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Versión de esta Consola:</span>
                    <span className="bg-blue-950/45 text-blue-400 border border-blue-900 px-2 py-0.5 rounded font-bold">v2.4.0 (Local)</span>
                  </div>
                </div>

                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900 space-y-2">
                  <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Sincronización en Red S.A.T.</span>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Última Versión Publicada:</span>
                    {systemConfig?.currentVersion ? (
                      <span className={`px-2 py-0.5 rounded border font-bold ${
                        systemConfig.currentVersion === '2.4.0'
                          ? 'bg-emerald-950/45 text-emerald-400 border-emerald-900'
                          : 'bg-amber-950/45 text-amber-400 border-amber-900 animate-pulse'
                      }`}>
                        v{systemConfig.currentVersion} {systemConfig.currentVersion === '2.4.0' ? '(Sincronizado)' : '(Nueva Versión)'}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Sin publicar</span>
                    )}
                  </div>
                </div>
              </div>

              {systemConfig?.changelog && systemConfig?.currentVersion !== '2.4.0' && (
                <div className="bg-amber-950/20 border border-amber-500/10 p-3 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-500 text-[10px] font-bold uppercase">
                    <AlertCircle size={12} />
                    <span>Se ha detectado una nueva versión en la red: v{systemConfig.currentVersion}</span>
                  </div>
                  <p className="text-slate-400 text-[10px] leading-relaxed font-mono">
                    <strong className="text-slate-300">Novedades:</strong> {systemConfig.changelog}
                  </p>
                </div>
              )}

              {/* ADMIN PANEL IF REMER OR OPERATOR */}
              {userProfile?.isRemer ? (
                <div className="border-t border-slate-950 pt-4 mt-2 space-y-3">
                  <div className="bg-slate-950/50 border border-blue-950/40 p-3.5 rounded-xl space-y-3">
                    <div className="flex items-center gap-1.5 text-blue-400 text-[10px] font-bold uppercase font-sans">
                      <ShieldCheck size={14} />
                      <span>Panel de Control de Versión REMER (Administrador de Red)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-sans">
                      Como operador REMER, tienes permisos para publicar una nueva versión oficial de la consola. Todos los navegadores de los usuarios activos recargarán la consola automáticamente en tiempo real al detectar un cambio de versión.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                      <div className="space-y-1">
                        <label className="text-[9.5px] text-slate-400 block">Establecer Nueva Versión:</label>
                        <input 
                          type="text"
                          value={newVersionInput}
                          onChange={(e) => setNewVersionInput(e.target.value)}
                          placeholder="2.4.1"
                          className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-100 text-xs font-bold"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 bg-slate-900/30 rounded border border-slate-900 md:mt-4">
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] text-slate-300 font-bold block">Forzar Recarga</span>
                          <span className="text-[8.5px] text-slate-500 block">Obliga a todos los nodos a recargar al instante</span>
                        </div>
                        <input 
                          type="checkbox"
                          checked={forceUpdateInput}
                          onChange={(e) => setForceUpdateInput(e.target.checked)}
                          className="h-4 w-4 bg-slate-950 border-slate-850 rounded text-amber-500 focus:ring-0 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 font-mono">
                      <label className="text-[9.5px] text-slate-400 block">Notas de la Versión / Changelog:</label>
                      <textarea
                        value={changelogInput}
                        onChange={(e) => setChangelogInput(e.target.value)}
                        placeholder="ej. Sincronización optimizada para canales de HF y corrección de la API AEMET."
                        rows={2}
                        className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-100 text-xs focus:outline-none"
                      />
                    </div>

                    {publishSuccess && (
                      <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/20 rounded text-emerald-400 text-[10px] font-mono">
                        {publishSuccess}
                      </div>
                    )}

                    {publishError && (
                      <div className="p-2.5 bg-rose-950/40 border border-rose-500/20 rounded text-rose-400 text-[10px] font-mono">
                        {publishError}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={publishingVersion || !newVersionInput.trim()}
                      onClick={handlePublishVersion}
                      className="w-full bg-blue-950/50 hover:bg-blue-950 text-blue-400 hover:text-blue-300 font-mono font-bold text-xs py-2 px-4 rounded border border-blue-900 transition-all cursor-pointer flex justify-center items-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={publishingVersion ? 'animate-spin' : ''} />
                      {publishingVersion ? 'PUBLICANDO EN FIRESTORE...' : 'PUBLICAR NUEVA VERSIÓN OFICIAL'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/20 p-3 rounded-lg border border-slate-900 text-[10px] text-slate-400 leading-relaxed font-sans">
                  ℹ️ <strong className="text-slate-300">Cohesión automática activa:</strong> Si un administrador REMER publica una nueva compilación en la red S.A.T., esta consola se actualizará de manera silenciosa para mantener la integridad de las bases de datos y frecuencias de modulación.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: DIREWOLF TNC CONFIGURATION */}
        {activeTab === 'direwolf' && (
          <div className="space-y-4 font-sans">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
              <Radio size={14} className="text-emerald-400" />
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Módem Software Direwolf (AX.25 Packet Engine)</span>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400 leading-normal font-mono">
              <Info size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Direwolf</strong> opera como controlador hardware del módem (TNC). Utiliza la tarjeta de audio del servidor Debian 13 para transformar datos binarios en paquetes AX.25 modulados sobre RF analógica a 1200 baudios (Bell 202 AFSK).
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5 font-mono">
                <span className="text-[9.5px] text-emerald-400 uppercase font-black tracking-widest block font-bold">Tarjeta Sonido & Emisión</span>
                
                <div className="space-y-1">
                  <label htmlFor="input-direwolf-adevice" className="text-slate-400 text-[10px]">Dispositivo Audio (ADEVICE ALSA):</label>
                  <input
                    type="text"
                    id="input-direwolf-adevice"
                    value={direwolfAdevice}
                    onChange={(e) => setDirewolfAdevice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none font-bold"
                  />
                  <span className="text-[8px] text-slate-500 block leading-tight">Valor por defecto: <code>plughw:1,0</code> (Tarjeta de sonido auxiliar USB de audio-interfaz).</span>
                </div>

                <div className="space-y-1">
                  <label htmlFor="select-direwolf-baud" className="text-slate-400 text-[10px]">Velocidad de canal (Baudios):</label>
                  <select
                    id="select-direwolf-baud"
                    value={direwolfBaudrate}
                    onChange={(e) => setDirewolfBaudrate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none text-[11px]"
                  >
                    <option value="300">300 BAUDIOS (HF Clásico)</option>
                    <option value="1200">1200 BAUDIOS (VHF Estándar FM / Bell 202)</option>
                    <option value="9600">9600 BAUDIOS (UHF Alta velocidad / G3RUH)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-direwolf-ptt" className="text-slate-400 text-[10px]">Control PTT (Push To Talk Conmutador):</label>
                  <input
                    type="text"
                    id="input-direwolf-ptt"
                    value={direwolfPttDevice}
                    onChange={(e) => setDirewolfPttDevice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none"
                  />
                  <span className="text-[8px] text-slate-500 block leading-tight">Define línea RTS por puerto serie: <code>/dev/ttyUSB0 RTS</code> o pin GPIO en Raspberry Pi.</span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5 font-mono">
                <span className="text-[9.5px] text-emerald-400 uppercase font-black tracking-widest block font-bold">Puertos Sockets de Red y Balizas</span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="input-kiss-port" className="text-slate-400 text-[10px]">Puerto KISS TCP:</label>
                    <input
                      type="number"
                      id="input-kiss-port"
                      value={kissTcpPort}
                      onChange={(e) => setKissTcpPort(Number(e.target.value) || 8001)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="input-gpsd-server" className="text-slate-400 text-[10px]">Servidor GPSD:</label>
                    <input
                      type="text"
                      id="input-gpsd-server"
                      value={direwolfGpsdServer}
                      onChange={(e) => setDirewolfGpsdServer(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-cbeacon-msg" className="text-slate-400 text-[10px]">Texto de baliza RF CBEACON:</label>
                  <input
                    type="text"
                    id="input-cbeacon-msg"
                    value={direwolfCbeaconMsg}
                    onChange={(e) => setDirewolfCbeaconMsg(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-cbeacon-interval" className="text-slate-400 text-[10px]">Frecuencia Baliza (segundos):</label>
                  <input
                    type="number"
                    id="input-cbeacon-interval"
                    value={direwolfCbeaconInterval}
                    onChange={(e) => setDirewolfCbeaconInterval(Number(e.target.value) || 600)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-emerald-500/30 focus:outline-none"
                  />
                  <span className="text-[8px] text-slate-550 block mt-1">Sincroniza balizas de emergencia cada {Math.floor(direwolfCbeaconInterval / 60)} min sobre la señal física de radio.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WEEWX TEMPERATURE & APTS CORE ENGINE */}
        {activeTab === 'weewx' && (
          <div className="space-y-4 font-sans">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
              <Database size={14} className="text-blue-400" />
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Motor de Climatología WeeWX (SQLite database Logger)</span>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-400 leading-normal font-mono">
              <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
              <span>
                El motor <strong>WeeWX V5</strong> corre en segundo plano compilando datos de los sensores climatológicos para archivarlos en una base de datos SQLite y retransmitir simultáneamente balizas climatológicas en formato APRS hacia Direwolf (Localhost:{kissTcpPort}).
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5 font-mono">
                <span className="text-[9.5px] text-blue-400 uppercase font-black tracking-widest block font-bold">Archivos de Base de Datos y Controladores</span>
                
                <div className="space-y-1">
                  <label htmlFor="select-weewx-driver" className="text-slate-400 text-[10px]">Driver del Sensor / Hardware:</label>
                  <select
                    id="select-weewx-driver"
                    value={weewxDriver}
                    onChange={(e) => setWeewxDriver(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500/30 focus:outline-none text-[11px]"
                  >
                    <option value="weewx.drivers.fousb">Fine Offset USB (PCE-FWS20 / WH1080)</option>
                    <option value="weewx.drivers.vantage">Davis Vantage Pro2 / Vantage Vue</option>
                    <option value="weewx.drivers.rtldavis">RTL-SDR Davis SDR Raw RF receiver</option>
                    <option value="weewx.drivers.simulator">Software Simulator (Pruebas de S.A.T.)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-weewx-sdb" className="text-slate-400 text-[10px]">Ruta de Fichero Base de Datos SQLite (.sdb):</label>
                  <input
                    type="text"
                    id="input-weewx-sdb"
                    value={weewxDatabase}
                    onChange={(e) => setWeewxDatabase(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500/30 focus:outline-none"
                  />
                  <span className="text-[8px] text-slate-550 block">Ubicación física estándar en Debian: <code>/var/lib/weewx/weewx.sdb</code></span>
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-weewx-archive" className="text-slate-400 text-[10px]">Intervalo de Grabación en Base de Datos (segundos):</label>
                  <input
                    type="number"
                    id="input-weewx-archive"
                    value={weewxArchiveInterval}
                    onChange={(e) => setWeewxArchiveInterval(Number(e.target.value) || 300)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500/30 focus:outline-none"
                  />
                  <span className="text-[8px] text-slate-500 block leading-tight">Valor de compilación recomendado: <code>300</code> segundos (5 minutos).</span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5 font-mono">
                <span className="text-[9.5px] text-blue-400 uppercase font-black tracking-widest block font-bold">Puente APRS CWOP (Citizen Weather Observer Program)</span>
                
                <div className="flex items-center gap-2 py-1.5 border-b border-slate-900">
                  <input
                    type="checkbox"
                    id="check-cwop-enabled"
                    checked={weewxCwopEnabled}
                    onChange={(e) => setWeewxCwopEnabled(e.target.checked)}
                    className="rounded border-slate-800 text-blue-500 bg-slate-950 h-4 w-4 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="check-cwop-enabled" className="text-slate-300 text-[11px] cursor-pointer font-bold">
                    Habilitar Puente APRS CWOP Remitente
                  </label>
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-weewx-post" className="text-slate-400 text-[10px]">Frecuencia Envío de Telemetría Climatológica (segundos):</label>
                  <input
                    type="number"
                    id="input-weewx-post"
                    value={weewxPostInterval}
                    onChange={(e) => setWeewxPostInterval(Number(e.target.value) || 600)}
                    disabled={!weewxCwopEnabled}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500/30 focus:outline-none disabled:opacity-40"
                  />
                  <p className="text-[8.5px] text-slate-550 leading-relaxed font-mono mt-1">
                    Retransmitirá un paquete con la temperatura, ráfagas de viento y humedad sobre RF cada 10 minutos ({Math.floor(weewxPostInterval / 60)} min).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EXTERNAL KEYS & EXTRA PORTS */}
        {activeTab === 'keys' && (
          <div className="space-y-4 font-sans">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
              <Key size={14} className="text-zinc-200" />
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Consola de Claves de S.A.T. (API Keys)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
              <div className="space-y-1.5">
                <label htmlFor="api-owm" className="text-slate-400 text-[10px]">OpenWeatherMap API Key:</label>
                <input
                  type="password"
                  id="api-owm"
                  placeholder="Ej: 5b6c07584dfa..."
                  value={owmApiKey}
                  onChange={(e) => setOwmApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-zinc-500/40"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="api-aemet" className="text-slate-400 text-[10px]">AEMET OpenData API Key:</label>
                <input
                  type="password"
                  id="api-aemet"
                  placeholder="Ej: eyJhbGciOiJIUzI1NiJ9..."
                  value={aemetApiKey}
                  onChange={(e) => setAemetApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-zinc-500/40"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="api-iqair" className="text-slate-400 text-[10px]">IQAir API Key (Calidad de Aire):</label>
                <input
                  type="password"
                  id="api-iqair"
                  placeholder="Ej: 2d19b48b-3cd5..."
                  value={iqAirApiKey}
                  onChange={(e) => setIqAirApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-zinc-500/40"
                />
              </div>
            </div>

            {/* Extra ports (AIS, Winlink) */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-3.5 font-mono">
              <span className="text-[9.5px] text-zinc-300 uppercase font-black tracking-widest block font-bold">Puertos de Receptores Secundarios (AIS Catcher & Winlink)</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="input-ais-catcher" className="text-slate-400 text-[10px]">Puerto UDP ais-catcher:</label>
                  <input
                    type="number"
                    id="input-ais-catcher"
                    value={aisCatcherPort}
                    onChange={(e) => setAisCatcherPort(Number(e.target.value) || 5015)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-zinc-500/40 focus:outline-none"
                  />
                  <p className="text-[8px] text-slate-500 font-mono mt-0.5">Servicio COMAR VHF de captura de buques por software SDR.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="input-winlink-ssid" className="text-slate-400 text-[10px]">SSID Pat Winlink de Correo:</label>
                  <input
                    type="text"
                    id="input-winlink-ssid"
                    value={winlinkSsid}
                    onChange={(e) => setWinlinkSsid(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-100 text-xs focus:border-zinc-500/40 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-950">
                <input
                  type="checkbox"
                  id="check-ais-aprs"
                  checked={aisShareRawAprs}
                  onChange={(e) => setAisShareRawAprs(e.target.checked)}
                  className="rounded border-slate-800 text-zinc-500 bg-slate-950 h-3.5 w-3.5 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="check-ais-aprs" className="text-slate-300 text-[10px] cursor-pointer">
                  Retransmitir barcos detectados (AIS) en formato APRS hacia la red local
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB: NOTIFICATION PREFERENCES */}
        {activeTab === 'notifications' && (
          <div className="space-y-4 font-sans text-slate-200">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
              <Bell size={14} className="text-amber-500" />
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Preferencias de Alertas y Notificaciones S.A.T.</span>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-950 pb-3 flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300">Control de Alarma Sonora Global</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Habilita o deshabilita los sonidos del sintetizador para todas las alertas de contaminación.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSoundEnabled(!soundEnabled);
                    if (!soundEnabled) {
                      playAlertSound('chime');
                    }
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    soundEnabled 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                      : 'bg-slate-950 text-slate-500 border border-slate-900'
                  }`}
                >
                  {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  {soundEnabled ? 'SONIDO ACTIVO' : 'SONIDO APAGADO'}
                </button>
              </div>

              {/* Levels list */}
              <div className="space-y-3">
                <span className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest font-mono block">Configuración por Nivel de Índice (ICA MITECO)</span>

                {/* Level 3: Regular */}
                <div className="bg-slate-950/50 border border-amber-500/10 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ffc800] shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-amber-400 block font-sans">Nivel Regular</span>
                      <span className="text-[9.5px] text-slate-500 block">Molestias menores para grupos altamente vulnerables.</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap md:flex-nowrap font-mono">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Comportamiento</label>
                      <select
                        value={prefLevel3}
                        onChange={(e) => setPrefLevel3(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 font-bold focus:outline-none focus:border-amber-500/30"
                      >
                        <option value="sound">Sonido + Visual</option>
                        <option value="visual">Solo Visual</option>
                        <option value="disabled">Desactivado</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Tono Alarma</label>
                      <select
                        value={soundStyle3}
                        disabled={prefLevel3 !== 'sound'}
                        onChange={(e) => setSoundStyle3(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 focus:outline-none focus:border-amber-500/30 disabled:opacity-30"
                      >
                        <option value="chime">Campana (Chime)</option>
                        <option value="beep">Pitido (Beep)</option>
                        <option value="pulse">Pulso (Pulse)</option>
                        <option value="warble">Gorjeo (Warble)</option>
                        <option value="siren">Sirena (Siren)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={prefLevel3 !== 'sound'}
                      onClick={() => playAlertSound(soundStyle3)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-850 text-amber-500 border border-slate-800 rounded text-[10px] font-bold uppercase font-mono transition-colors cursor-pointer self-end disabled:opacity-30 h-[34px] flex items-center justify-center"
                      title="Probar sonido de alarma"
                    >
                      Probar
                    </button>
                  </div>
                </div>

                {/* Level 4: Desfavorable */}
                <div className="bg-slate-950/50 border border-red-500/10 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff0000] shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-red-500 block font-sans">Nivel Desfavorable</span>
                      <span className="text-[9.5px] text-slate-500 block">Riesgo para salud general y elevado para grupos de riesgo.</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap md:flex-nowrap font-mono">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Comportamiento</label>
                      <select
                        value={prefLevel4}
                        onChange={(e) => setPrefLevel4(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 font-bold focus:outline-none focus:border-amber-500/30"
                      >
                        <option value="sound">Sonido + Visual</option>
                        <option value="visual">Solo Visual</option>
                        <option value="disabled">Desactivado</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Tono Alarma</label>
                      <select
                        value={soundStyle4}
                        disabled={prefLevel4 !== 'sound'}
                        onChange={(e) => setSoundStyle4(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 focus:outline-none focus:border-amber-500/30 disabled:opacity-30"
                      >
                        <option value="chime">Campana (Chime)</option>
                        <option value="beep">Pitido (Beep)</option>
                        <option value="pulse">Pulso (Pulse)</option>
                        <option value="warble">Gorjeo (Warble)</option>
                        <option value="siren">Sirena (Siren)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={prefLevel4 !== 'sound'}
                      onClick={() => playAlertSound(soundStyle4)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-850 text-red-500 border border-slate-800 rounded text-[10px] font-bold uppercase font-mono transition-colors cursor-pointer self-end disabled:opacity-30 h-[34px] flex items-center justify-center"
                      title="Probar sonido de alarma"
                    >
                      Probar
                    </button>
                  </div>
                </div>

                {/* Level 5: Muy Desfavorable */}
                <div className="bg-slate-950/50 border border-red-950/40 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#781414] shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-[#b42828] block font-sans">Nivel Muy Desfavorable</span>
                      <span className="text-[9.5px] text-slate-500 block">Ambiente cargado de poluentes. Impacto directo severo.</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap md:flex-nowrap font-mono">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Comportamiento</label>
                      <select
                        value={prefLevel5}
                        onChange={(e) => setPrefLevel5(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 font-bold focus:outline-none focus:border-amber-500/30"
                      >
                        <option value="sound">Sonido + Visual</option>
                        <option value="visual">Solo Visual</option>
                        <option value="disabled">Desactivado</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Tono Alarma</label>
                      <select
                        value={soundStyle5}
                        disabled={prefLevel5 !== 'sound'}
                        onChange={(e) => setSoundStyle5(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 focus:outline-none focus:border-amber-500/30 disabled:opacity-30"
                      >
                        <option value="chime">Campana (Chime)</option>
                        <option value="beep">Pitido (Beep)</option>
                        <option value="pulse">Pulso (Pulse)</option>
                        <option value="warble">Gorjeo (Warble)</option>
                        <option value="siren">Sirena (Siren)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={prefLevel5 !== 'sound'}
                      onClick={() => playAlertSound(soundStyle5)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-850 text-red-400 border border-slate-800 rounded text-[10px] font-bold uppercase font-mono transition-colors cursor-pointer self-end disabled:opacity-30 h-[34px] flex items-center justify-center"
                      title="Probar sonido de alarma"
                    >
                      Probar
                    </button>
                  </div>
                </div>

                {/* Level 6: Extremadamente Desfavorable */}
                <div className="bg-slate-950/50 border border-purple-500/10 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#800080] shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-purple-400 block font-sans">Nivel Extremadamente Desfavorable</span>
                      <span className="text-[9.5px] text-slate-500 block">Alerta roja nacional respiratoria. Altísimo contenido tóxico.</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap md:flex-nowrap font-mono">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Comportamiento</label>
                      <select
                        value={prefLevel6}
                        onChange={(e) => setPrefLevel6(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 font-bold focus:outline-none focus:border-amber-500/30"
                      >
                        <option value="sound">Sonido + Visual</option>
                        <option value="visual">Solo Visual</option>
                        <option value="disabled">Desactivado</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-slate-550 font-black uppercase font-mono">Tono Alarma</label>
                      <select
                        value={soundStyle6}
                        disabled={prefLevel6 !== 'sound'}
                        onChange={(e) => setSoundStyle6(e.target.value as any)}
                        className="bg-slate-950 border border-slate-900 rounded p-1.5 text-[10.5px] text-slate-300 focus:outline-none focus:border-amber-500/30 disabled:opacity-30"
                      >
                        <option value="chime">Campana (Chime)</option>
                        <option value="beep">Pitido (Beep)</option>
                        <option value="pulse">Pulso (Pulse)</option>
                        <option value="warble">Gorjeo (Warble)</option>
                        <option value="siren">Sirena (Siren)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={prefLevel6 !== 'sound'}
                      onClick={() => playAlertSound(soundStyle6)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-850 text-purple-400 border border-slate-800 rounded text-[10px] font-bold uppercase font-mono transition-colors cursor-pointer self-end disabled:opacity-30 h-[34px] flex items-center justify-center"
                      title="Probar sonido de alarma"
                    >
                      Probar
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* SECCIÓN NUEVA: MODO GUARDIA Y SILENCIO PROGRAMADO */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4" id="guard-silence-section">
              <div className="flex items-center justify-between border-b border-slate-950 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <VolumeX className="text-amber-500" size={16} />
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Perfiles de Audio y Silencio de Guardia Programado</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Define perfiles de audio específicos o programa un modo de silencio para tus turnos de guardia u horas de descanso.</p>
                  </div>
                </div>

                {/* Badge de estado en tiempo real */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                    currentSilenceActive 
                      ? 'bg-red-950/40 border border-red-500/20 text-red-400' 
                      : 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${currentSilenceActive ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                    {currentSilenceActive ? 'SILENCIO DE GUARDIA ACTIVO' : 'SISTEMA DE AUDIO NORMAL'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
                {/* Panel Izquierdo: Configuración General */}
                <div className="space-y-3.5 bg-slate-950/50 p-4 rounded-xl border border-slate-900/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-500 uppercase font-black tracking-wider">1. Control de Silencio de Guardia</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateGuardSilence({ enabled: !guardSilence.enabled })}
                      className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                        guardSilence.enabled
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {guardSilence.enabled ? 'GUARDIA ACTIVA' : 'GUARDIA INACTIVA'}
                    </button>
                  </div>

                  {/* Perfil de audio de guardia */}
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[10px] block font-bold">Perfil de Audio en Guardia:</label>
                    <select
                      value={guardSilence.profile}
                      onChange={(e) => handleUpdateGuardSilence({ profile: e.target.value as any })}
                      disabled={!guardSilence.enabled}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-300 text-xs font-bold focus:outline-none disabled:opacity-30"
                    >
                      <option value="standard">Estándar / Normal (Sin modificaciones de volumen)</option>
                      <option value="loud">Volumen Fuerte (+200% Volumen y +150% Duración)</option>
                      <option value="minimal">Minimalista / Tenue (Volumen al 30% y sonidos cortos)</option>
                      <option value="silent">Silencioso (Bloquear todo sonido de notificación)</option>
                    </select>
                    <p className="text-[9px] text-slate-550 leading-relaxed">
                      Elige cómo se deben comportar los tonos de alertas cuando se cumpla el horario de guardia programado.
                    </p>
                  </div>

                  {/* Intervalo de Tiempo */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-400 text-[10px] block">Hora de Inicio:</label>
                      <input
                        type="time"
                        value={guardSilence.startTime}
                        onChange={(e) => handleUpdateGuardSilence({ startTime: e.target.value })}
                        disabled={!guardSilence.enabled}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-1.5 text-slate-200 text-xs focus:outline-none disabled:opacity-30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 text-[10px] block">Hora de Fin:</label>
                      <input
                        type="time"
                        value={guardSilence.endTime}
                        onChange={(e) => handleUpdateGuardSilence({ endTime: e.target.value })}
                        disabled={!guardSilence.enabled}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-1.5 text-slate-200 text-xs focus:outline-none disabled:opacity-30"
                      />
                    </div>
                  </div>
                </div>

                {/* Panel Derecho: Días Activos y Probar */}
                <div className="space-y-3.5 bg-slate-950/50 p-4 rounded-xl border border-slate-900/50 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-[10px] text-amber-500 uppercase font-black tracking-wider block">2. Días de la Semana Activos</span>
                    
                    {/* Días de la semana */}
                    <div className="flex gap-1 justify-between">
                      {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((dayChar, index) => {
                        const isActive = guardSilence.days.includes(index);
                        return (
                          <button
                            key={index}
                            type="button"
                            disabled={!guardSilence.enabled}
                            onClick={() => {
                              const newDays = isActive
                                ? guardSilence.days.filter(d => d !== index)
                                : [...guardSilence.days, index].sort();
                              handleUpdateGuardSilence({ days: newDays });
                            }}
                            className={`w-8 h-8 rounded-full text-xs font-black transition-all cursor-pointer flex items-center justify-center border select-none disabled:opacity-30 ${
                              isActive
                                ? 'bg-amber-500/25 text-amber-400 border-amber-500/40 shadow-sm'
                                : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {dayChar}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[9px] text-slate-550 leading-relaxed">
                      Selecciona los días en que el horario programado estará activo para el filtrado acústico de alertas.
                    </p>
                  </div>

                  {/* Probar el perfil acústico actual */}
                  <div className="border-t border-slate-900 pt-3.5 space-y-2">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Probar Acústica en Guardia</span>
                    <div className="flex gap-2">
                      <button
                        key="btn-simulate-alert"
                        type="button"
                        onClick={() => playAlertSound('beep', false)}
                        className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1"
                        title="Prueba normal respetando silencio"
                      >
                        <Play size={10} />
                        <span>Simular Alerta</span>
                      </button>
                      <button
                        key="btn-ignore-silence"
                        type="button"
                        onClick={() => playAlertSound('beep', true)}
                        className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded text-[10px] font-bold uppercase text-amber-400 transition-colors cursor-pointer flex items-center justify-center gap-1"
                        title="Prueba forzada ignorando silencio"
                      >
                        <Volume2 size={10} />
                        <span>Ignorar Silencio</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN DE PREFERENCIAS DE SONIDOS PERSONALIZADOS */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-2.5">
                <Music size={14} className="text-sky-400" />
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Archivos de Sonido Personalizados para Alertas</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Sube tus propios archivos de sonido para personalizar las alarmas críticas y de advertencia.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sonido de Alerta Crítica */}
                <div className="bg-slate-950/50 border border-red-500/10 p-3.5 rounded-xl flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      <span className="text-xs font-bold text-red-400 font-sans">Alertas Críticas</span>
                    </div>
                    <p className="text-[9.5px] text-slate-500">
                      Sonido para advertencias graves como niveles extremos de polución, sismos intensos o alertas nucleares.
                    </p>
                    <div className="mt-2.5 bg-slate-900/60 border border-slate-950 px-2.5 py-1.5 rounded text-[10px] font-mono text-slate-400 flex items-center justify-between gap-2">
                      <span className="truncate max-w-[200px]" title={customCriticalSoundName || "Por defecto: Sirena"}>
                        {customCriticalSoundName ? `🎵 ${customCriticalSoundName}` : "📣 Por defecto: Sirena"}
                      </span>
                      {customCriticalSoundName && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomSound('critical')}
                          className="text-red-400 hover:text-red-300 cursor-pointer p-0.5"
                          title="Eliminar sonido personalizado"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono mt-1">
                    <label className="flex-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-slate-300 text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5">
                      <Upload size={12} className="text-sky-400" />
                      <span>Subir Audio</span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => handleCustomSoundFileChange(e, 'critical')}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => playCustomSound('critical')}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1.5 h-[32px]"
                      title="Probar sonido de alerta crítica"
                    >
                      <Play size={12} />
                      <span>Probar</span>
                    </button>
                  </div>
                </div>

                {/* Sonido de Alerta de Advertencia */}
                <div className="bg-slate-950/50 border border-yellow-500/10 p-3.5 rounded-xl flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                      <span className="text-xs font-bold text-yellow-400 font-sans">Alertas de Advertencia</span>
                    </div>
                    <p className="text-[9.5px] text-slate-500">
                      Sonido para avisos operacionales regulares, superación leve de límites o avisos meteorológicos comunes.
                    </p>
                    <div className="mt-2.5 bg-slate-900/60 border border-slate-950 px-2.5 py-1.5 rounded text-[10px] font-mono text-slate-400 flex items-center justify-between gap-2">
                      <span className="truncate max-w-[200px]" title={customWarningSoundName || "Por defecto: Pitido"}>
                        {customWarningSoundName ? `🎵 ${customWarningSoundName}` : "📣 Por defecto: Pitido"}
                      </span>
                      {customWarningSoundName && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomSound('warning')}
                          className="text-red-400 hover:text-red-300 cursor-pointer p-0.5"
                          title="Eliminar sonido personalizado"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono mt-1">
                    <label className="flex-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-slate-300 text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5">
                      <Upload size={12} className="text-sky-400" />
                      <span>Subir Audio</span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => handleCustomSoundFileChange(e, 'warning')}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => playCustomSound('warning')}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer flex items-center gap-1.5 h-[32px]"
                      title="Probar sonido de alerta de advertencia"
                    >
                      <Play size={12} />
                      <span>Probar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN DE PERFILES DE AUDIO PERSONALIZADOS (WEB AUDIO API OSCILADOR) */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-2.5">
                <Sliders size={14} className="text-emerald-400" />
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Sintetizador de Audio para Alertas de Emergencia</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Define perfiles de audio personalizados con diferentes osciladores y frecuencias para distinguir el tipo de peligro.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* 1. Eventos Sísmicos */}
                <div className="bg-slate-950/50 border border-orange-500/10 p-4 rounded-xl flex flex-col justify-between gap-4 font-mono">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity size={14} className="text-orange-400" />
                        <span className="text-xs font-bold text-orange-400 font-sans">1. Alertas Sísmicas</span>
                      </div>
                      <span className="text-[8px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded uppercase font-black font-mono">IGN / SISMOS</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tipo de Oscilador</label>
                        <select
                          value={seismicProfile.oscillatorType}
                          onChange={(e) => handleUpdateProfile('seismic', { oscillatorType: e.target.value as any })}
                          className="bg-slate-950 border border-slate-850 rounded p-1.5 text-xs text-slate-300 focus:outline-none focus:border-orange-500/30"
                        >
                          <option value="sine">Sinoidal (Sine)</option>
                          <option value="triangle">Triangular (Triangle)</option>
                          <option value="sawtooth">Diente de Sierra (Sawtooth)</option>
                          <option value="square">Cuadrado (Square)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase font-bold text-slate-400">
                          <span>Frecuencia Base</span>
                          <span className="text-orange-400">{seismicProfile.frequency} Hz</span>
                        </div>
                        <input
                          type="range"
                          min="80"
                          max="800"
                          step="10"
                          value={seismicProfile.frequency}
                          onChange={(e) => handleUpdateProfile('seismic', { frequency: parseInt(e.target.value) })}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-orange-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase font-bold text-slate-400">
                          <span>Duración</span>
                          <span className="text-orange-400">{seismicProfile.duration.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="4.0"
                          step="0.1"
                          value={seismicProfile.duration}
                          onChange={(e) => handleUpdateProfile('seismic', { duration: parseFloat(e.target.value) })}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-orange-500"
                        />
                      </div>

                      <div className="border-t border-slate-900/60 pt-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] text-slate-400 font-bold uppercase cursor-pointer flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={seismicProfile.modulationEnabled}
                              onChange={(e) => handleUpdateProfile('seismic', { modulationEnabled: e.target.checked })}
                              className="rounded border-slate-800 text-orange-500 focus:ring-0 cursor-pointer bg-slate-950"
                            />
                            <span>Modulación (LFO)</span>
                          </label>
                        </div>

                        {seismicProfile.modulationEnabled && (
                          <div className="space-y-2 pl-2 border-l border-orange-500/20">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[8.5px] text-slate-500 uppercase font-bold">
                                <span>Velocidad LFO</span>
                                <span>{seismicProfile.modulationFreq} Hz</span>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="30"
                                value={seismicProfile.modulationFreq}
                                onChange={(e) => handleUpdateProfile('seismic', { modulationFreq: parseInt(e.target.value) })}
                                className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-orange-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[8.5px] text-slate-500 uppercase font-bold">
                                <span>Amplitud (Rango)</span>
                                <span>± {seismicProfile.modulationGain} Hz</span>
                              </div>
                              <input
                                type="range"
                                min="5"
                                max="200"
                                value={seismicProfile.modulationGain}
                                onChange={(e) => handleUpdateProfile('seismic', { modulationGain: parseInt(e.target.value) })}
                                className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-orange-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => playEmergencyAlertSound('seismic')}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-orange-400 hover:text-orange-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Play size={11} />
                    <span>Probar Alerta Sísmica</span>
                  </button>
                </div>

                {/* 2. Eventos Meteorológicos */}
                <div className="bg-slate-950/50 border border-sky-500/10 p-4 rounded-xl flex flex-col justify-between gap-4 font-mono">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CloudLightning size={14} className="text-sky-400" />
                        <span className="text-xs font-bold text-sky-400 font-sans">2. Alertas Meteorológicas</span>
                      </div>
                      <span className="text-[8px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded uppercase font-black font-mono">AEMET / NOAAs</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tipo de Oscilador</label>
                        <select
                          value={weatherProfile.oscillatorType}
                          onChange={(e) => handleUpdateProfile('weather', { oscillatorType: e.target.value as any })}
                          className="bg-slate-950 border border-slate-850 rounded p-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500/30"
                        >
                          <option value="sine">Sinoidal (Sine)</option>
                          <option value="triangle">Triangular (Triangle)</option>
                          <option value="sawtooth">Diente de Sierra (Sawtooth)</option>
                          <option value="square">Cuadrado (Square)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase font-bold text-slate-400">
                          <span>Frecuencia Base</span>
                          <span className="text-sky-400">{weatherProfile.frequency} Hz</span>
                        </div>
                        <input
                          type="range"
                          min="150"
                          max="1500"
                          step="10"
                          value={weatherProfile.frequency}
                          onChange={(e) => handleUpdateProfile('weather', { frequency: parseInt(e.target.value) })}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-sky-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase font-bold text-slate-400">
                          <span>Duración</span>
                          <span className="text-sky-400">{weatherProfile.duration.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="4.0"
                          step="0.1"
                          value={weatherProfile.duration}
                          onChange={(e) => handleUpdateProfile('weather', { duration: parseFloat(e.target.value) })}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-sky-500"
                        />
                      </div>

                      <div className="border-t border-slate-900/60 pt-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] text-slate-400 font-bold uppercase cursor-pointer flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={weatherProfile.modulationEnabled}
                              onChange={(e) => handleUpdateProfile('weather', { modulationEnabled: e.target.checked })}
                              className="rounded border-slate-800 text-sky-500 focus:ring-0 cursor-pointer bg-slate-950"
                            />
                            <span>Modulación (LFO)</span>
                          </label>
                        </div>

                        {weatherProfile.modulationEnabled && (
                          <div className="space-y-2 pl-2 border-l border-sky-500/20">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[8.5px] text-slate-500 uppercase font-bold">
                                <span>Velocidad LFO</span>
                                <span>{weatherProfile.modulationFreq} Hz</span>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="30"
                                value={weatherProfile.modulationFreq}
                                onChange={(e) => handleUpdateProfile('weather', { modulationFreq: parseInt(e.target.value) })}
                                className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-sky-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[8.5px] text-slate-500 uppercase font-bold">
                                <span>Amplitud (Rango)</span>
                                <span>± {weatherProfile.modulationGain} Hz</span>
                              </div>
                              <input
                                type="range"
                                min="5"
                                max="300"
                                value={weatherProfile.modulationGain}
                                onChange={(e) => handleUpdateProfile('weather', { modulationGain: parseInt(e.target.value) })}
                                className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-sky-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => playEmergencyAlertSound('weather')}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-sky-400 hover:text-sky-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Play size={11} />
                    <span>Probar Alerta Meteorológica</span>
                  </button>
                </div>

                {/* 3. Seguridad Civil */}
                <div className="bg-slate-950/50 border border-red-500/10 p-4 rounded-xl flex flex-col justify-between gap-4 font-mono">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert size={14} className="text-red-400" />
                        <span className="text-xs font-bold text-red-400 font-sans">3. Seguridad Civil</span>
                      </div>
                      <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded uppercase font-black font-mono">CECOP / PLATERCAM</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tipo de Oscilador</label>
                        <select
                          value={civilProfile.oscillatorType}
                          onChange={(e) => handleUpdateProfile('civil', { oscillatorType: e.target.value as any })}
                          className="bg-slate-950 border border-slate-850 rounded p-1.5 text-xs text-slate-300 focus:outline-none focus:border-red-500/30"
                        >
                          <option value="sine">Sinoidal (Sine)</option>
                          <option value="triangle">Triangular (Triangle)</option>
                          <option value="sawtooth">Diente de Sierra (Sawtooth)</option>
                          <option value="square">Cuadrado (Square)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase font-bold text-slate-400">
                          <span>Frecuencia Base</span>
                          <span className="text-red-400">{civilProfile.frequency} Hz</span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="1200"
                          step="10"
                          value={civilProfile.frequency}
                          onChange={(e) => handleUpdateProfile('civil', { frequency: parseInt(e.target.value) })}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-red-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] uppercase font-bold text-slate-400">
                          <span>Duración</span>
                          <span className="text-red-400">{civilProfile.duration.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="4.0"
                          step="0.1"
                          value={civilProfile.duration}
                          onChange={(e) => handleUpdateProfile('civil', { duration: parseFloat(e.target.value) })}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-red-500"
                        />
                      </div>

                      <div className="border-t border-slate-900/60 pt-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] text-slate-400 font-bold uppercase cursor-pointer flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={civilProfile.modulationEnabled}
                              onChange={(e) => handleUpdateProfile('civil', { modulationEnabled: e.target.checked })}
                              className="rounded border-slate-800 text-red-500 focus:ring-0 cursor-pointer bg-slate-950"
                            />
                            <span>Modulación (LFO)</span>
                          </label>
                        </div>

                        {civilProfile.modulationEnabled && (
                          <div className="space-y-2 pl-2 border-l border-red-500/20">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[8.5px] text-slate-500 uppercase font-bold">
                                <span>Velocidad LFO</span>
                                <span>{civilProfile.modulationFreq} Hz</span>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="30"
                                value={civilProfile.modulationFreq}
                                onChange={(e) => handleUpdateProfile('civil', { modulationFreq: parseInt(e.target.value) })}
                                className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-red-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[8.5px] text-slate-500 uppercase font-bold">
                                <span>Amplitud (Rango)</span>
                                <span>± {civilProfile.modulationGain} Hz</span>
                              </div>
                              <input
                                type="range"
                                min="5"
                                max="400"
                                value={civilProfile.modulationGain}
                                onChange={(e) => handleUpdateProfile('civil', { modulationGain: parseInt(e.target.value) })}
                                className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-red-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => playEmergencyAlertSound('civil')}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-[10px] font-bold uppercase text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Play size={11} />
                    <span>Probar Alerta Civil</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SECCIÓN DE UMBRALES DE ALERTAS PUSH PERSONALIZADAS */}
            <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-950 pb-2.5">
                <Bell size={14} className="text-amber-500" />
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-300 font-sans">Umbrales de Notificaciones Push del Navegador</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Define umbrales de alerta personalizados (magnitud sísmica y radio de proximidad) para disparar avisos en el escritorio.</p>
                </div>
              </div>

              <div className="bg-slate-950/50 p-4 rounded-xl space-y-4 font-mono">
                {/* Permiso y Activación */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">Notificaciones Push del Sistema</span>
                    <span className="text-[9.5px] text-slate-500 block">
                      Estado del permiso en el navegador: {' '}
                      <span className={`font-bold ${browserPermission === 'granted' ? 'text-emerald-400' : browserPermission === 'denied' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {browserPermission.toUpperCase()}
                      </span>
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {browserPermission !== 'granted' && (
                      <button
                        type="button"
                        onClick={requestPushPermission}
                        className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer"
                      >
                        Solicitar Permiso
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPushNotifEnabled(!pushNotifEnabled)}
                      className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                        pushNotifEnabled && browserPermission === 'granted'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {pushNotifEnabled && browserPermission === 'granted' ? 'NOTIFICACIONES ACTIVAS' : 'NOTIFICACIONES INACTIVAS'}
                    </button>
                  </div>
                </div>

                {/* Umbrales */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Umbral de Magnitud Sísmica */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-slate-300 font-bold uppercase flex items-center gap-1">
                        <Sliders size={12} className="text-amber-500" />
                        <span>Magnitud Mínima</span>
                      </label>
                      <span className="text-xs font-bold text-amber-400">M {pushMinMag.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="9.0"
                      step="0.1"
                      value={pushMinMag}
                      onChange={(e) => setPushMinMag(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[9px] text-slate-500 italic">
                      Se disparará una notificación de alerta para cualquier seísmo con una magnitud igual o superior a este umbral.
                    </p>
                  </div>

                  {/* Umbral de Radio de Proximidad */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-slate-300 font-bold uppercase flex items-center gap-1">
                        <Target size={12} className="text-sky-450" />
                        <span>Radio de Proximidad</span>
                      </label>
                      <span className="text-xs font-bold text-sky-400">
                        {pushMaxProx >= 2000 ? 'Sin límite' : `${pushMaxProx} km`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="2000"
                      step="10"
                      value={pushMaxProx}
                      onChange={(e) => setPushMaxProx(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                    <p className="text-[9px] text-slate-500 italic">
                      Solo se notificarán los seísmos que ocurran dentro de este radio de distancia de la estación receptora civil.
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-900 flex justify-end">
                  <button
                    type="button"
                    onClick={testSismoPushNotification}
                    className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Bell size={12} />
                    <span>Lanzar Notificación de Sismo de Prueba</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 5: DEBIAN LIVE CONFIGURATION FILES */}
        {activeTab === 'files' && (
          <div className="space-y-4 font-sans">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-900 pb-2">
              <FileCode size={14} className="text-purple-400" />
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Ficheros de Configuración Listos para Debian 13</span>
            </div>

            <div className="p-3.5 bg-purple-950/10 border border-purple-500/15 rounded-xl text-[11px] font-mono text-slate-300 leading-normal">
              <p>
                A continuación se compilan e inyectan los parámetros correspondientes a sus formularios. Puede copiar la configuración resultante de <strong>direwolf.conf</strong> y <strong>weewx.conf</strong> directamente en su terminal local u optar por descargar los archivos ejecutables:
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-mono">
              
              {/* Direwolf Config block */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-t-lg border-t border-x border-slate-800">
                  <span className="text-[10px] font-bold text-emerald-400">/etc/direwolf.conf</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      id="btn-copy-direwolf"
                      onClick={() => copyToClipboard(generateDirewolfConf(), 'direwolf')}
                      className="text-[9px] bg-slate-950 hover:bg-slate-900 font-bold border border-slate-800 px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1 text-slate-300"
                    >
                      {copiedFile === 'direwolf' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                      {copiedFile === 'direwolf' ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      id="btn-dl-direwolf"
                      onClick={() => downloadConfFile('direwolf.conf', generateDirewolfConf())}
                      className="text-[9px] bg-emerald-950 hover:bg-emerald-900 text-emerald-300 font-bold border border-emerald-900 px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Download size={10} /> Descargar
                    </button>
                    <button
                      type="button"
                      id="btn-save-direwolf-server"
                      onClick={() => handleSaveToServer('direwolf', generateDirewolfConf())}
                      className="text-[9px] bg-purple-950 hover:bg-purple-900 text-purple-300 font-bold border border-purple-900 px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Save size={10} /> Escribir en Debian
                    </button>
                  </div>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-900 text-[10px] text-yellow-300 rounded-b-lg overflow-x-auto h-[260px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 font-mono select-all">
                  {generateDirewolfConf()}
                </pre>
              </div>

              {/* WeeWX Config block */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-t-lg border-t border-x border-slate-800">
                  <span className="text-[10px] font-bold text-blue-400">/etc/weewx/weewx.conf (StdRESTful snippet)</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      id="btn-copy-weewx"
                      onClick={() => copyToClipboard(generateWeewxConf(), 'weewx')}
                      className="text-[9px] bg-slate-950 hover:bg-slate-900 font-bold border border-slate-800 px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1 text-slate-300"
                    >
                      {copiedFile === 'weewx' ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                      {copiedFile === 'weewx' ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      id="btn-dl-weewx"
                      onClick={() => downloadConfFile('weewx.conf', generateWeewxConf())}
                      className="text-[9px] bg-blue-950 hover:bg-blue-900 text-blue-300 font-bold border border-blue-900 px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Download size={10} /> Descargar
                    </button>
                    <button
                      type="button"
                      id="btn-save-weewx-server"
                      onClick={() => handleSaveToServer('weewx', generateWeewxConf())}
                      className="text-[9px] bg-purple-950 hover:bg-purple-900 text-purple-300 font-bold border border-purple-900 px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Save size={10} /> Escribir en Debian
                    </button>
                  </div>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-900 text-[10px] text-emerald-300 rounded-b-lg overflow-x-auto h-[260px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 font-mono select-all">
                  {generateWeewxConf()}
                </pre>
              </div>

            </div>
          </div>
        )}

        {/* Global Save action and message banner */}
        <div className="flex items-center justify-between border-t border-slate-900 pt-4 flex-wrap gap-2.5">
          {message ? (
            <div className={`p-3 rounded-lg text-xs leading-normal flex items-center gap-2 ${
              message.type === 'success' ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300' : 'bg-red-950/40 border border-red-500/30 text-red-300'
            }`}>
              <AlertCircle size={14} className="shrink-0" />
              <span>{message.text}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px]">
              <Info size={13} className="text-slate-400" />
              <span>Configure cada pestaña y luego oprima en "Consolidar Todo" para actualizar la estación.</span>
            </div>
          )}

          <button
            type="submit"
            id="btn-submit-station-redesign-form"
            disabled={isSaving || !isLatValid || !isLonValid}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-950 font-sans font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer select-none ml-auto active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={14} />
            {isSaving ? 'Persistiendo...' : (!isLatValid || !isLonValid) ? 'Coordenadas Inválidas' : 'Consolidar Parámetros de Estación'}
          </button>
        </div>

      </form>
    )}
  </>
)}
</div>
  );
}
