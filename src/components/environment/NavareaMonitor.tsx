import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, Anchor, AlertTriangle, Search, Filter, 
  MapPin, Send, RefreshCw, ExternalLink, Compass, 
  Layers, Info, Download, BookOpen, Radio, Ship,
  Terminal, Wifi, Check, ChevronRight, AlertCircle, Inbox, Cpu, Bell,
  Maximize2, X, Globe, Calendar, User
} from 'lucide-react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { GPSDStatus, InmarsatMessage } from '../../types';

export interface NavareaMonitorProps {
  gpsd: GPSDStatus;
  onRelocate: (lat: number, lon: number, title: string) => void;
  onInjectRaw?: (payload: string) => Promise<boolean>;
  warnings?: NavareaWarning[];
  inmarsatMessages?: InmarsatMessage[];
}

export interface NavareaWarning {
  id: string; // e.g., "NAV3-0145/26"
  navareaType: 'NAVAREA III' | 'Armada Española' | 'NAVTEX';
  category: 'Gunnery / Ejercicios' | 'Navigational Hazard' | 'Cable Laying' | 'Search & Rescue' | 'Rig Move' | 'Military Operations';
  title: string;
  lat: number;
  lon: number;
  areaDescription: string;
  originator: string; // e.g. "IHM Cadiz", "NAVAREA III Coordinator"
  broadcastTime: string;
  cancelTime?: string;
  rawText: string;
  urgency: 'ALERTA CRÍTICA' | 'PRECAUCIÓN' | 'INFORMATIVO';
  subArea?: 'III' | 'III-B' | 'III-C' | string;
}

export const INITIAL_NAVAREA_WARNINGS: NavareaWarning[] = [
  {
    id: 'E-0312/26',
    navareaType: 'Armada Española',
    category: 'Gunnery / Ejercicios',
    title: 'Ejercicios de Tiro con Fuego Real - Zona Delta (Golfo de Cádiz)',
    lat: 36.3500,
    lon: -6.4500,
    areaDescription: 'Golfo de Cádiz, polígono de tiro militar de la Armada Española de El Retín. Prohibida navegación y fondeo.',
    originator: 'IHM (Instituto Hidrográfico de la Marina)',
    broadcastTime: '2026-06-19 08:30 UTC',
    cancelTime: '2026-06-21 18:00 UTC',
    urgency: 'ALERTA CRÍTICA',
    rawText: 'NAVAREA WARNING ARMADA 0312/26\nGOLFO DE CADIZ. BAJO EL RETIN.\n1. EJERCICIOS DE TIRO CON FUEGO REAL DE ARMAS DE GRAN CALIBRE DEL 19 AL 21 DE JUNIO DE 1200 A 1800 UTC EN AREA DELIMITADA POR:\n40-25N 006-25W\n36-35N 006-45W\n36-10N 006-15W\n2. NAVEGACION, PESCA Y FONDEO ESTRICTAMENTE PROHIBIDOS DENTRO DEL SECTOR DE IMPACTOS.\nCANCELAR ESTE MENSAJE EL 211900 UTC JUN 26.',
    subArea: 'III-B',
  },
  {
    id: 'IHM-0341/26',
    navareaType: 'Armada Española',
    category: 'Military Operations',
    title: 'Maniobras Flotilla de Submarinos de la Armada - Cartagena',
    lat: 37.5210,
    lon: -0.9850,
    areaDescription: 'Costa de Murcia / Alrededores de Cartagena. Ejercicios subacuáticos del Buque S-81 "Isaac Peral".',
    originator: 'IHM Armada Española (Aplicación Navareas HTML/XML)',
    broadcastTime: '2026-06-19 12:45 UTC',
    urgency: 'PRECAUCIÓN',
    rawText: 'AVISO AL NAVEGANTE IHM-ARMADA 0341/26\nCOSTA DE CARTAGENA.\n1. OPERACIONES DE INMERSIÓN Y ADIESTRAMIENTO DE SUBMARINO S-81 "ISAAC PERAL" EN EL ÁREA COMPRENDIDA ENTRE CAP DE L/AGUILA Y CABO TIÑOSO.\n2. TODO BUQUE EN TRÁNSITO DEBERÁ MANTENER UNA ESCUCHA PERMANENTE EN VHF CANAL 16 Y CANAL 73, QUEDANDO PROHIBIDO PASAR A MENOS DE 2 MILLAS NÁUTICAS DE LOS BUQUES DE APOYO MILITAR "YSIRE" Y "NEPTUNO".\nCANCELAR MENSAJE EL 221800 UTC JUN 26.',
    subArea: 'III-B',
  },
  {
    id: 'SASEMAR-0824/26',
    navareaType: 'NAVTEX',
    category: 'Search & Rescue',
    title: 'Aviso Salvamento Marítimo SASEMAR: velero desarbolado a la deriva',
    lat: 38.8500,
    lon: 0.2500,
    areaDescription: 'Este de Cabo la Nao. Velero de recreo francés desarbolado y sin propulsión motora.',
    originator: 'radioavisos.salvamentomaritimo.es (Centro de Coordinación de Valencia)',
    broadcastTime: '2026-06-19 16:20 UTC',
    urgency: 'ALERTA CRÍTICA',
    rawText: 'RADIOAVISO SASEMAR VALENCIA 0824/26\nCABO LA NAO. ISLA IBIZA CHANNEL.\n1. EXTREMAR PRECAUCIÓN. VELERO RECREATIVO "LE PAPILLON" FRANCÉS CON SEIS TRIPULANTES A BORDO DESARBOLADO Y A LA DERIVA POR ROTURA DE TIMÓN EN POSICIÓN ESTIMADA 38-51N 000-15E.\n2. HELICÓPTERO "HELIMER 203" Y EMBARCACIÓN "SALVAMAR SABIK" PROCEDEN A LA CONFLUENCIA DE RESCATE.\n3. TODOS LOS BUQUES EN RUTA DEBERÁN SOLICITAR ACTUALIZACIÓN DE DERROTEROS DIRECTOS.',
    subArea: 'III',
  },
  {
    id: 'NAV3-0418/26',
    navareaType: 'NAVAREA III',
    category: 'Navigational Hazard',
    title: 'Contenedores a la Deriva - Canal de Sicilia',
    lat: 37.1500,
    lon: 11.4500,
    areaDescription: 'Estrecho de Sicilia. Siete contenedores semi-sumergidos de 40 pies a la deriva tras colisión de portacontenedores.',
    originator: 'NAVAREA III coordinator (Spain/IHM)',
    broadcastTime: '2026-06-19 14:15 UTC',
    urgency: 'ALERTA CRÍTICA',
    rawText: 'NAVAREA III WARNING 0418/26\nSICILY STRAIT. EAST OF PANTELLERIA ISLAND.\n1. SEVEN DRIFTING SEMI-SUBMERGED 40 FEET ISO CONTAINERS REPORTED IN VICINITY OF 37-15.0N 011-45.0E. DANGEROUS TO NAVIGATION.\n2. ALL SHIPS IN VICINITY REQUESTED TO KEEP SHARP LOOKOUT AND PASS WITH WIDE BERTH.\nREPORTS TO NAVAREA THREE COORDINATOR.',
    subArea: 'III-C',
  },
  {
    id: 'NAV3-0402/26',
    navareaType: 'NAVAREA III',
    category: 'Cable Laying',
    title: 'Operación Submarina de Tendido de Cable de Fibra - Mar de Alborán',
    lat: 36.1200,
    lon: -4.3500,
    areaDescription: 'Mar de Alborán, Buque cablero "ILE DE SEIN" operando a baja velocidad y remolcando hidrófonos acústicos.',
    originator: 'IHM Armada / NAVAREA III',
    broadcastTime: '2026-06-18 09:20 UTC',
    cancelTime: '2026-06-29 23:59 UTC',
    urgency: 'PRECAUCIÓN',
    rawText: 'NAVAREA 3 WARNING 0402/26\nALBORAN SEA.\n1. CABLE LAYING OPERATIONS BY M/V ILE DE SEIN / FNDW IN PROGRESS ALONG THE TRACK JOINING:\n36-15.5N 004-45.0W\n36-05.2N 004-12.0W\n2. WIDE BERTH OF 1.0 NAUTICAL MILES REQUESTED. SHIP IS RESTRICTED IN HER ABILITY TO MANEUVER.\nCANCEL THIS MSG 292359 UTC JUN 26.',
    subArea: 'III-B',
  },
  {
    id: 'NAV3-0427/26',
    navareaType: 'NAVAREA III',
    category: 'Rig Move',
    title: 'Movimiento de Plataforma de Perforación "Key Singapore"',
    lat: 31.9500,
    lon: 31.1000,
    areaDescription: 'Costa de Egipto, Delta de Nilo. Remolque de plataforma offshore autoelevable.',
    originator: 'Egypt Coastal Radio AST',
    broadcastTime: '2026-06-19 11:45 UTC',
    urgency: 'INFORMATIVO',
    rawText: 'NAVAREA III 0427/26\nEGYPT COAST - ROSETTA AREA.\n1. RIG MOVE OF JACK-UP RIG "KEY SINGAPORE" IN PROGRESS FROM 31-52.0N 031-03.0E TO POSITION 31-59.5N 031-15.2E.\n2. CANAL SECURITY EXCLUSION ZONE OF 2.0 MILES ESTABLISHED. TOWAGE COMPOSED OF THREE TUGS BROADCASTING AIS CLASS A.',
    subArea: 'III-C',
  },
  {
    id: 'NAV3-0422/26',
    navareaType: 'NAVAREA III',
    category: 'Military Operations',
    title: 'Maniobras y Tiro de Misiles Reales - Zona Este del Mediterráneo',
    lat: 34.4500,
    lon: 21.3005,
    areaDescription: 'Mediterráneo Oriental, sur de la Isla de Creta. Operaciones de ataque con misiles aire-gallo.',
    originator: 'NAVAREA III Coordinating Center',
    broadcastTime: '2026-06-18 19:40 UTC',
    cancelTime: '2026-06-20 23:59 UTC',
    urgency: 'ALERTA CRÍTICA',
    rawText: 'NAVAREA THREE 0422/26\nEASTERN MEDITERRANEAN SEA - SOUTH CRETE.\n1. NAVAL MISSILE FIRING EXERCISES BY MILITARY VESSELS ON 18 TO 20 JUNE FROM 0500 TO 2100 UTC IN AREA BOUNDED BY:\n34-45N 021-30E\n34-45N 022-15E\n34-10N 022-15E\n34-10N 021-30E\n2. DANGEROUS AREA UNFIT FOR NAVIGATION OR FLIGHT OVERHEAD.\n3. KEEP RADIO WATCH ON VHF CH-16 AND SECURE CH-70.',
    subArea: 'III-C',
  },
  {
    id: 'E-0319/26',
    navareaType: 'Armada Española',
    category: 'Navigational Hazard',
    title: 'Faro de Isla de Alborán Apagado de Forma Temporal',
    lat: 35.9380,
    lon: -3.0330,
    areaDescription: 'Isla de Alborán. Luz principal del faro número internacional D-1192 fuera de servicio.',
    originator: 'IHM (Armada Española)',
    broadcastTime: '2026-06-19 15:10 UTC',
    urgency: 'PRECAUCIÓN',
    rawText: 'NAVAREA WARNING ARMADA 0319/26\nISLA DE ALBORAN.\nFARO NUMERO INTERNACIONAL D-1192 (FI2 W 10S 25M 10M) APAGADO TEMPORALMENTE POR AVERIA EN EL GRUPO DE BATERIAS DE EMERGENCIA Y SOPORTE SOLAR.\nNAVEGANTES EXTREMEN PRECAUCION.',
    subArea: 'III-B',
  },
  {
    id: 'NTX-2204',
    navareaType: 'NAVTEX',
    category: 'Search & Rescue',
    title: 'Operación SAR de Migrantes a la Deriva - Sur de Almería',
    lat: 35.9800,
    lon: -2.8500,
    areaDescription: 'Mar de Alborán. Helicóptero de salvamento marítimo y patrullera operando en zona.',
    originator: 'Salvamento Marítimo Almería (CCS)',
    broadcastTime: '2026-06-19 15:45 UTC',
    urgency: 'ALERTA CRÍTICA',
    rawText: 'NAVTEX CH-B MRCC ALMERIA\nCOASTAL WARNING 2204 / JUN 19\nALBORAN SEA SOUTH.\n1. SEARCH AND RESCUE OPERATION IN PROGRESS FOR DRIFTING DEFLATED PNEUMATIC BOAT WITH SEVERAL PEOPLE ON BOARD IN COORDS 35-58.8N 002-51.0W.\n2. COSPAS-SARSAT BEACONS ACTIVE.\n3. ALL SHIPS REQUESTED TO KEEP LOOKOUT, VHF WATCH CH-16 AND REPORT TO MRCC ALMERIA.',
    subArea: 'III-B',
  },
  {
    id: 'E-0298/26',
    navareaType: 'Armada Española',
    category: 'Navigational Hazard',
    title: 'Boya Meteorológica "Cabo de Peñas" Fuera de Posición (Garreando)',
    lat: 43.7100,
    lon: -5.9200,
    areaDescription: 'Costa de Asturias. Elemento de fondeo roto. Boya a la deriva.',
    originator: 'IHM Cadiz',
    broadcastTime: '2026-06-17 12:00 UTC',
    urgency: 'PRECAUCIÓN',
    rawText: 'AVISO NAUTICO ARMADA 0298/26\nCANTABRICO. CABO DE PEÑAS.\nBOYA DE MEDIDA OCEANOGRAFICA DATAWELL DIRECCIONAL FUERA DE SU FONDEO NOMINAL. GARREANDO AL COMPAS DEL TEMPORAL DEL NORDOESTE.\nULTIMA POSICION REPORTADA: 43-42.6N 005-55.2W.\nDANGEROUS TO OBSTRUCTION.',
    subArea: 'III',
  }
];

export default function NavareaMonitor({ 
  gpsd, 
  onRelocate, 
  onInjectRaw, 
  warnings = INITIAL_NAVAREA_WARNINGS,
  inmarsatMessages = []
}: NavareaMonitorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubArea, setSelectedSubArea] = useState<string>('all');
  const [proximityLimit, setProximityLimit] = useState<string>('all');
  const [alertThresholdKm, setAlertThresholdKm] = useState<number>(300);
  const [selectedWarning, setSelectedWarning] = useState<NavareaWarning | null>(INITIAL_NAVAREA_WARNINGS[0]);
  const [expandedWarning, setExpandedWarning] = useState<NavareaWarning | null>(null);

  const [readWarningIds, setReadWarningIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('navarea_read_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const toggleReadWarning = (id: string) => {
    setReadWarningIds(prev => {
      const updated = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try {
        localStorage.setItem('navarea_read_ids', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  // Helper to convert decimal degrees to Degrees Minutes Seconds (DMS)
  const formatToDMS = (value: number, isLat: boolean) => {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutesDecimal = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);
    const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const paddedDegs = isLat ? String(degrees).padStart(2, '0') : String(degrees).padStart(3, '0');
    return `${paddedDegs}° ${String(minutes).padStart(2, '0')}' ${seconds}" ${direction}`;
  };

  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<'database' | 'portals' | 'map' | 'inmarsat'>('database');
  const [aprsStatus, setAprsStatus] = useState<{ success: boolean; msg: string } | null>(null);

  // States for Inmarsat SafetyNet II Panel
  const [selectedInmId, setSelectedInmId] = useState<string | null>(null);
  const [triggerC2Code, setTriggerC2Code] = useState<string>('14');
  const [triggerSender, setTriggerSender] = useState<string>('LES-AOR-W');
  const [triggerArea, setTriggerArea] = useState<string>('METAREA II');
  const [triggerPayload, setTriggerPayload] = useState<string>('');
  const [triggerSubmitting, setTriggerSubmitting] = useState<boolean>(false);
  const [triggerResult, setTriggerResult] = useState<{ success: boolean; msg: string } | null>(null);

  const activeInmarsatMessage = useMemo(() => {
    if (inmarsatMessages.length === 0) return null;
    if (!selectedInmId) return inmarsatMessages[0];
    return inmarsatMessages.find(m => m.id === selectedInmId) || inmarsatMessages[0];
  }, [inmarsatMessages, selectedInmId]);

  // Calculates distance to warnings from operator QTH
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1200);
  };

  const enhancedWarnings = useMemo(() => {
    return warnings.map(w => {
      return {
        ...w,
        distanceKm: calculateDistance(gpsd.lat, gpsd.lon, w.lat, w.lon)
      };
    });
  }, [warnings, gpsd.lat, gpsd.lon]);

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
              
    let brng = Math.atan2(y, x);
    brng = (brng * 180) / Math.PI;
    return (brng + 360) % 360;
  };

  const getCardinalDirection = (bearing: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
  };

  const proximityAlerts = useMemo(() => {
    return enhancedWarnings.filter(w => {
      const isDistressOrHazard = 
        w.urgency === 'ALERTA CRÍTICA' || 
        w.category === 'Search & Rescue' ||
        w.category === 'Navigational Hazard';
      return isDistressOrHazard && w.distanceKm <= alertThresholdKm;
    }).sort((a, b) => a.distanceKm - b.distanceKm);
  }, [enhancedWarnings, alertThresholdKm]);

  const filteredWarnings = useMemo(() => {
    return enhancedWarnings.filter(w => {
      const matchesSearch = 
        w.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
        w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.rawText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.areaDescription.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'all' || w.navareaType === selectedType;
      const matchesCategory = selectedCategory === 'all' || w.category === selectedCategory;

      const matchesSubArea = selectedSubArea === 'all' || 
        (selectedSubArea === 'N/A' ? !w.subArea : w.subArea === selectedSubArea);

      const matchesProximity = proximityLimit === 'all' || 
        (w.distanceKm <= parseFloat(proximityLimit));

      return matchesSearch && matchesType && matchesCategory && matchesSubArea && matchesProximity;
    });
  }, [enhancedWarnings, searchQuery, selectedType, selectedCategory, selectedSubArea, proximityLimit]);

  const activeWarning = useMemo(() => {
    if (!selectedWarning) return null;
    return enhancedWarnings.find(w => w.id === selectedWarning.id) || selectedWarning;
  }, [selectedWarning, enhancedWarnings]);

  // Statistics for category urgency
  const statsData = useMemo(() => {
    const categories = ['Gunnery / Ejercicios', 'Navigational Hazard', 'Cable Laying', 'Search & Rescue', 'Rig Move', 'Military Operations'];
    return categories.map(cat => {
      const count = warnings.filter(w => w.category === cat).length;
      return {
        name: cat.split(' / ')[0], // simplify label
        'Cantidad de Avisos': count
      };
    });
  }, [warnings]);

  // Handle injection of a NAVAREA / NAVTEX alert as an APRS Bulletin/Object
  const handleTransmitWarningAPRS = async () => {
    if (!activeWarning) return;

    // APRS Maritime Safety / Bulletin format:
    // {OperatorCallsign}>APXSAT,{Path}:;{ObjectName}*{Time}z{LAT}{Table}{LON}{Code}{WarningDetails}
    // We format ObjectName to be 9 characters padded: e.g. "NAV3_0418"
    const callsign = 'EA1URG-15'; // Marine auxiliary command station SSID
    const path = 'WIDE1-1,WIDE2-1';
    
    // Clean and pad object name to exactly 9 characters
    const origId = activeWarning.id.replace('/', '_').substring(0, 9);
    const objectName = origId.padEnd(9, ' ');

    // Convert decimal latitude/longitude coordinates to APRS degrees & deciminutes format
    const latAbs = Math.abs(activeWarning.lat);
    const latDeg = Math.floor(latAbs);
    const latMin = ((latAbs - latDeg) * 60).toFixed(2).padStart(5, '0');
    const latHemi = activeWarning.lat >= 0 ? 'N' : 'S';
    const formattedLat = `${latDeg.toString().padStart(2, '0')}${latMin}${latHemi}`;

    const lonAbs = Math.abs(activeWarning.lon);
    const lonDeg = Math.floor(lonAbs);
    const lonMin = ((lonAbs - lonDeg) * 60).toFixed(2).padStart(5, '0');
    const lonHemi = activeWarning.lon >= 0 ? 'E' : 'W';
    const formattedLon = `${lonDeg.toString().padStart(3, '0')}${lonMin}${lonHemi}`;

    // APRS Object standard format:
    // ;OBJECTNAME*191500z4025.00N/00342.00W#NAVAREAWX Alert
    const timeStamp = '191500'; // simulated UTC time stamp
    
    // We use primary table "/" with "!" for emergency sign or "h" to designate maritime hazards
    const table = '/';
    const symbolCode = activeWarning.urgency === 'ALERTA CRÍTICA' ? '!' : 'h';

    const shortDescription = activeWarning.title.substring(0, 43);
    const payload = `${callsign}>APXSAT,${path}:;${objectName}*${timeStamp}z${formattedLat}${table}${formattedLon}${symbolCode}RA-M: ${activeWarning.id} ${shortDescription}`;

    try {
      if (onInjectRaw) {
        const result = await onInjectRaw(payload);
        if (result) {
          setAprsStatus({
            success: true,
            msg: `✓ Boletín de aviso NAVAREA inyectado con éxito: ${activeWarning.id}`
          });
        } else {
          setAprsStatus({
            success: false,
            msg: 'Error al despachar el paquete: Enlace TNC rechazó la trama por formato.'
          });
        }
      } else {
        setAprsStatus({
          success: true,
          msg: `✓ [Simulado] Baliza Objeto: ${payload}`
        });
      }
    } catch {
      setAprsStatus({
        success: false,
        msg: 'Error del microcontrolador TNC: Conexión denegada'
      });
    }

    setTimeout(() => {
      setAprsStatus(null);
    }, 6000);
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-200" id="navarea-panel-root">
      
      {/* SECTOR HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 p-4 rounded-xl border border-slate-900 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/35 rounded-xl shrink-0 text-indigo-400">
            <Anchor size={20} className="animate-spin-slow text-yellow-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 select-none">
              <span className="text-[10px] bg-red-950 border border-red-500/30 text-red-300 font-mono font-bold px-1.5 py-0.2 rounded uppercase">
                Seguridad Marítima (COMSAR)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">XML Feed Armada & NAVAREA III</span>
            </div>
            <h1 className="text-sm font-extrabold text-slate-105 text-slate-100 tracking-tight flex items-center gap-1.5">
              Consola Integrada de Avisos de Navegación NAVAREA / NAVTEX
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 select-none flex-wrap">
          {/* TAB 1: Base de Datos */}
          <button
            onClick={() => setActiveView('database')}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeView === 'database'
                ? 'bg-indigo-950/40 border-indigo-500 text-indigo-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="btn-view-database"
          >
            <BookOpen size={13} />
            <span>Avisos Agrupados</span>
          </button>

          {/* TAB 2: Portales Oficiales */}
          <button
            onClick={() => setActiveView('portals')}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeView === 'portals'
                ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="btn-view-portals"
          >
            <Layers size={13} />
            <span>Portales Oficiales (IHM / SASEMAR)</span>
          </button>

          {/* TAB 3: Navtex.lv Mapping */}
          <button
            onClick={() => setActiveView('map')}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeView === 'map'
                ? 'bg-amber-950/40 border-amber-500 text-amber-200 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="btn-view-map"
          >
            <Radio size={13} className={activeView === 'map' ? 'animate-pulse text-amber-400' : ''} />
            <span>Visor Cartográfico</span>
          </button>

          {/* TAB 4: Inmarsat SafetyNet II */}
          <button
            onClick={() => setActiveView('inmarsat')}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeView === 'inmarsat'
                ? 'bg-sky-950/40 border-sky-500 text-sky-305 text-sky-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="btn-view-inmarsat"
          >
            <Wifi size={13} className={activeView === 'inmarsat' ? 'animate-pulse text-sky-400' : ''} />
            <span>Inmarsat SafetyNet II</span>
          </button>

          <button
            onClick={handleRefresh}
            className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
            title="Refrescar fuentes de avisos naúticos"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* BANNER DE ALERTA DE PROXIMIDAD DE SOCORRO */}
      <AnimatePresence>
        {proximityAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="bg-gradient-to-r from-red-950/80 via-slate-950/90 to-red-950/80 border border-red-500/40 rounded-xl p-4 shadow-[0_0_20px_rgba(239,68,68,0.15)] flex flex-col gap-3"
            id="proximity-distress-banner"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-900/30 pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <div>
                  <h2 className="text-xs font-extrabold text-red-400 uppercase tracking-wider flex items-center gap-2 select-none">
                    <AlertTriangle className="text-red-500 animate-bounce shrink-0" size={14} />
                    Alerta de Socorro / Riesgo en Rango Crítico
                  </h2>
                  <p className="text-[10px] text-slate-450 font-sans mt-0.5 select-none">
                    Se han detectado <span className="text-red-400 font-bold">{proximityAlerts.length}</span> avisos de alta prioridad dentro de su radio de seguridad configurado.
                  </p>
                </div>
              </div>

              {/* Threshold adjustment control inside the banner */}
              <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 self-start sm:self-auto select-none">
                <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider font-mono">
                  Ajustar Umbral:
                </span>
                <input
                  type="range"
                  min="50"
                  max="1500"
                  step="25"
                  value={alertThresholdKm}
                  onChange={(e) => setAlertThresholdKm(Number(e.target.value))}
                  className="w-24 sm:w-32 accent-red-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] font-mono font-black text-red-400 bg-red-950/45 px-1.5 py-0.5 rounded border border-red-500/20">
                  {alertThresholdKm} km
                </span>
              </div>
            </div>

            {/* List of active warnings in banner */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {proximityAlerts.slice(0, 3).map((alert) => {
                const bearing = calculateBearing(gpsd.lat, gpsd.lon, alert.lat, alert.lon);
                const cardinal = getCardinalDirection(bearing);
                
                return (
                  <div
                    key={alert.id}
                    onClick={() => {
                      setSelectedWarning(alert);
                      setActiveView('database');
                    }}
                    className="p-3 bg-red-950/10 hover:bg-red-950/20 border border-red-900/25 hover:border-red-500/35 rounded-lg cursor-pointer transition-all flex flex-col gap-2 relative overflow-hidden group select-none"
                  >
                    <div className="flex items-center justify-between text-[8px] font-mono">
                      <span className="px-1.5 py-0.5 bg-red-950/50 text-red-400 font-black border border-red-500/20 rounded uppercase tracking-wider">
                        {alert.urgency}
                      </span>
                      <span className="text-slate-500 group-hover:text-red-300 font-bold transition-colors">
                        {alert.id}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-sans font-bold text-slate-100 text-[11px] line-clamp-1 group-hover:text-red-200 transition-colors">
                        {alert.title}
                      </h4>
                      <p className="text-[9.5px] text-slate-400 line-clamp-1 mt-0.5 font-sans">
                        {alert.areaDescription}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-red-900/15 pt-1.5 mt-0.5 text-[10px] font-mono">
                      <div className="flex items-center gap-1 text-red-450 font-black">
                        <MapPin size={10} className="text-red-500" />
                        <span>{alert.distanceKm.toFixed(1)} km</span>
                      </div>
                      <div className="flex items-center gap-1 text-yellow-500/80 font-bold">
                        <Compass size={11} className="text-yellow-500 animate-spin-slow" />
                        <span>Rumbo: {Math.round(bearing)}° ({cardinal})</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {proximityAlerts.length > 3 && (
              <div className="text-[9px] text-center font-mono text-slate-500 select-none">
                y {proximityAlerts.length - 3} avisos de peligro adicionales en el rango configurado. Pulse sobre cualquier aviso para centrar e inspeccionar en la base de datos.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {activeView === 'map' ? (
        /* NAVTEX.LV AND NAVAREA VISUAL MAPPING IFRAME portal */
        <div className="grid grid-cols-1 gap-4 animate-fade-in" id="navtex-iframe-content">
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] text-amber-500 font-mono uppercase tracking-wider block">Sistema Global de Socorro y Seguridad Marítimos (GMDSS)</span>
                <h3 className="font-sans font-bold text-slate-200 text-xs">Visor de Radiobalizas y Teletipos Navtex.lv</h3>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="https://navtex.lv/"
                  target="_blank"
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-lg text-[10px] font-bold font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Abrir navtex.lv Original</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-850 rounded-lg p-3 text-[11px] text-slate-400 leading-normal flex items-start gap-2.5 select-none">
              <Info className="text-amber-400 shrink-0 mt-0.5" size={14} />
              <div className="space-y-0.5 font-sans">
                <p>
                  El visualizador cartográfico <strong>Navtex.lv</strong> plotea avisos náuticos de socorro, avisos de tempestad, alertas meteorológicas y ejercicios militares en un mapa interactivo mundial, decodificando las balizas emitidas por las estaciones costeras en 518 kHz.
                </p>
                <p className="text-slate-500 font-mono text-[9px] mt-1">
                  * Cooperaciones cruzadas: IHM Armada (navareas_crudo.xml) y Coordinador del Mediterráneo Navarea III.
                </p>
              </div>
            </div>

            {/* IFRAME BODY */}
            <div className="w-full h-[650px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative shadow-inner">
              <iframe
                src="https://navtex.lv/"
                title="Navtex.lv Maritime Warning Live Visualizer"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-popups allowance-forms"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      ) : activeView === 'portals' ? (
        /* PORTALES OFICIALES INTEGRADOS DE CONSULTA DEDICADA: SASEMAR E IHM ARMADA ESPAÑOLA */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fade-in" id="navareas-integrated-portals">
          
          {/* COLUMNA 1: PANEL EXPLICATIVO E INTEGRACIÓN DE ENLACES (7 COLS) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            
            {/* PORTAL 1: IHM NAVAREAS XML FEED */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-xl flex flex-col gap-4">
              <div className="flex items-start justify-between border-b border-slate-900 pb-3">
                <div className="flex gap-3">
                  <div className="p-2.5 bg-sky-950/40 border border-sky-500/30 rounded-xl text-sky-400 shrink-0">
                    <Anchor size={18} />
                  </div>
                  <div>
                    <span className="text-[9px] text-sky-400 font-mono font-bold uppercase tracking-wider block">Ministerio de Defensa — Armada Española</span>
                    <h3 className="font-sans font-bold text-slate-100 text-sm">Instituto Hidrográfico de la Marina (IHM)</h3>
                    <p className="text-[11px] text-slate-500 font-sans mt-0.5">Portal de Publicación de Avisos Náuticos Navareas XML / HTML</p>
                  </div>
                </div>

                <a
                  href="https://armada.defensa.gob.es/ihm/Aplicaciones/Navareas/Index_Navareas_xml.html"
                  target="_blank"
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-slate-100 rounded-lg text-[10px] font-bold font-sans flex items-center gap-1.5 transition-colors cursor-pointer select-none"
                >
                  <span>Abrir Portal IHM</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <div className="text-[11.5px] leading-relaxed text-slate-400 space-y-2.5 font-sans">
                <p>
                  Como miembro y coordinador náutico internacional del subárea del <strong>Mediterráneo Occidental dentro del Área NAVAREA III</strong>, el IHM de la Armada recopila, procesa y difunde la información de seguridad marítima que afecta a las costas españolas y zonas adyacentes.
                </p>
                <p>
                  La página oficial de la Armada publica un feed dinámico compatible con tecnología XML enriquecida para que los sistemas EGC (Enhanced Group Call) y de radiodifusión decodifiquen de forma instantánea avisos de tiro militar, faros fuera de servicio y zonas peligrosas de exclusión.
                </p>
              </div>

              {/* SIMULATION / METADATA FOR THE IHM PORTAL FEED */}
              <div className="bg-slate-900/45 border border-slate-900 rounded-lg p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 font-mono text-[10px]">
                <div className="space-y-0.5">
                  <span className="text-slate-500 uppercase tracking-widest block text-[8px]">Dirección Canal XML Regulador</span>
                  <span className="text-slate-300 break-all select-all">/ihm/Aplicaciones/Navareas/Index_Navareas_xml.html</span>
                </div>
                <div className="px-2 py-0.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-bold rounded">
                  ✓ Enlace de Consulta Oficial
                </div>
              </div>
            </div>

            {/* PORTAL 2: SASEMAR RADIOAVISOS */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-xl flex flex-col gap-4">
              <div className="flex items-start justify-between border-b border-slate-900 pb-3">
                <div className="flex gap-3">
                  <div className="p-2.5 bg-orange-950/40 border border-orange-500/30 rounded-xl text-orange-400 shrink-0">
                    <Ship size={18} />
                  </div>
                  <div>
                    <span className="text-[9px] text-orange-400 font-mono font-bold uppercase tracking-wider block">Ministerio de Transportes y Movilidad</span>
                    <h3 className="font-sans font-bold text-slate-100 text-sm">Salvamento Marítimo (SASEMAR)</h3>
                    <p className="text-[11px] text-slate-500 font-sans mt-0.5">Portal Unificado de Radioavisos Costeros e Incidentes en Curso</p>
                  </div>
                </div>

                <a
                  href="https://radioavisos.salvamentomaritimo.es/"
                  target="_blank"
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-slate-100 rounded-lg text-[10px] font-bold font-sans flex items-center gap-1.5 transition-colors cursor-pointer select-none"
                >
                  <span>Abrir Portal SASEMAR</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <div className="text-[11.5px] leading-relaxed text-slate-400 space-y-2.5 font-sans">
                <p>
                  La Sociedad de Salvamento y Seguridad Marítima emite de forma coordinada a través de sus centros de comunicaciones (CCS) los <strong>radioavisos náuticos costeros</strong> que informan a los navegantes en tiempo real sobre buques a la deriva, pérdida de boyas, operaciones de rescate marítimo, rescates en helicóptero y riesgos inmediatos.
                </p>
                <p>
                  A través de su sitio web oficial, SASEMAR unifica y digitaliza la cartografía de todos los avisos emitidos en las distintas regiones de búsqueda y rescate (Atlántico Norte, Estrecho, Mediterráneo y Canarias), logrando que cualquier embarcación menor o pescador costero tenga acceso sin necesidad de un transceptor NAVTEX clásico a bordo.
                </p>
              </div>

              {/* TECHNICAL ENDPOINT */}
              <div className="bg-slate-900/45 border border-slate-900 rounded-lg p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 font-mono text-[10px]">
                <div className="space-y-0.5">
                  <span className="text-slate-500 uppercase tracking-widest block text-[8px]">Dirección Canal SASEMAR</span>
                  <span className="text-slate-300 break-all select-all">https://radioavisos.salvamentomaritimo.es</span>
                </div>
                <div className="px-2 py-0.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-bold rounded">
                  ✓ Transmisión Pública HTTPS
                </div>
              </div>
            </div>

          </div>

          {/* COLUMNA 2: GUIAS DE OPERACION GMDSS Y CONSOLA DE EMISION DE RADIOAVISOS EN ESPAÑA (5 COLS) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            
            {/* PANEL DE CONEXIÓN DE FRECUENCIAS */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 shadow-xl flex flex-col gap-3">
              <span className="text-[9.5px] text-yellow-500 font-bold uppercase tracking-widest font-mono border-b border-slate-900 pb-2 flex items-center gap-2">
                <Radio size={12} className="text-yellow-500 animate-pulse" />
                Plan de Transmisiones Navtex / España
              </span>

              <div className="text-[11px] text-slate-400 leading-relaxed font-sans space-y-2.5">
                <p>
                  España cuenta con estaciones costeras estratégicas que transmiten avisos marítimos programados e inmediatos de Salvamento Marítimo y la Armada:
                </p>

                <div className="space-y-2 font-mono text-[10px]">
                  <div className="flex items-center justify-between border-b border-slate-905 border-slate-850 pb-1 text-slate-300">
                    <div>
                      <span>⚓ <strong>A Coruña Coastal Radio</strong> [D]</span>
                      <div className="text-[9px] text-slate-500">Regiones Galicia y Cantábrico</div>
                    </div>
                    <span className="text-yellow-500 font-bold">518 kHz (Int)</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-905 border-slate-850 pb-1 text-slate-300">
                    <div>
                      <span>⚓ <strong>Tarifa Coastal Radio</strong> [G]</span>
                      <div className="text-[9px] text-slate-500">Estrecho de Gibraltar y Golfo de Cádiz</div>
                    </div>
                    <span className="text-yellow-500 font-bold">518 kHz (Int)</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-905 border-slate-850 pb-1 text-slate-300">
                    <div>
                      <span>⚓ <strong>Almería Coastal Radio</strong> [W]</span>
                      <div className="text-[9px] text-slate-500">Mar de Alborán y Mediterráneo Sur</div>
                    </div>
                    <span className="text-yellow-500 font-bold">518 kHz (Int)</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-905 border-slate-850 pb-1 text-slate-300">
                    <div>
                      <span>⚓ <strong>Cabo de la Nao Radio</strong> [M]</span>
                      <div className="text-[9px] text-slate-500">Canal de Baleares e Ibiza</div>
                    </div>
                    <span className="text-yellow-500 font-bold">490 kHz (Esp)</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <div>
                      <span>⚓ <strong>Las Palmas Radio</strong> [I]</span>
                      <div className="text-[9px] text-slate-500">Archipiélago Canario y Sahara Este</div>
                    </div>
                    <span className="text-yellow-500 font-bold">518 kHz (Int)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SIMULADOR DE CAPTURA DE TELETIPOS NAVTEX EN VIVO */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 shadow-xl flex flex-col gap-3 flex-1 justify-between">
              <div className="space-y-1">
                <span className="text-[9.5px] text-indigo-400 font-bold uppercase tracking-widest font-mono block">Simulador de Decodificación de Radioavisos</span>
                <p className="text-[11px] text-slate-500 leading-normal font-sans">
                  El sistema emula la consulta automática a los teletipos publicados en los portales del IHM y SASEMAR para transformarlos en objetos APRS de alerta inmediata.
                </p>
              </div>

              {/* LIVE SIMULATED RECEPTION LOG */}
              <div className="bg-black/90 p-3 rounded-lg border border-slate-850 h-44 overflow-y-auto font-mono text-[10px] text-emerald-400 leading-relaxed scrollbar-thin select-text my-2">
                <div>[SYSTEM COMSAR-INTEGRATION INITIALIZED]</div>
                <div>[STATUS: CONNECTING TO SASEMAR SECURE GATEWAY...]</div>
                <div>[OK] radioavisos.salvamentomaritimo.es responded 200 OK</div>
                <div>[FEED] Parsed 15 new active coastal bulletins.</div>
                <div>[STATUS: CONNECTING TO IHM DEFENSE SERVER...]</div>
                <div>[OK] Index_Navareas_xml.html parsed successfully.</div>
                <div className="text-yellow-500">--- BULLETIN RECEIVED [SASEMAR-0824/26] ---</div>
                <div>ZE047 SASEMAR VALENCIA RAD-AV</div>
                <div>COORDINACIO MARITIMA DESARBOLADO EN BALEARS</div>
                <div className="text-yellow-500">--- END OF DECODE WORK ---</div>
                <div className="text-slate-500">Waiting for next XML pull in 15s...</div>
              </div>

              <div className="text-[10px] font-sans text-slate-400 leading-relaxed bg-slate-900 p-2.5 rounded-lg border border-slate-850 flex items-start gap-2">
                <Info size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <p>
                  Ambos portales oficiales de la Armada y SASEMAR están completamente interconectados a la base de datos para simular y agrupar los teletipos recibidos de forma digitalizada. Use la solapa <strong>Avisos Agrupados</strong> para revisarlos y fijarlos en el radar principal.
                </p>
              </div>
            </div>

          </div>

        </div>
      ) : activeView === 'inmarsat' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fade-in" id="inmarsat-monitor-view">
          {/* LEFT COLUMN: LIVE FEED LOGS (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-xl h-[680px]">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sky-505 bg-sky-500 animate-pulse"></span>
                  <span className="font-mono text-[9.5px] bg-sky-950 text-sky-400 font-bold px-2 py-0.5 border border-sky-850/40 rounded">
                    UDP: 0.0.0.0:9999
                  </span>
                  <h3 className="font-sans font-bold text-slate-100 text-xs">Live SafetyNet II Feed</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {inmarsatMessages.length} recibidos
                </span>
              </div>

              {/* Summary metadata */}
              <div className="bg-slate-900/50 border border-slate-900 rounded-lg p-2 text-[10px] text-slate-400 font-mono space-y-1">
                <div className="flex items-center justify-between">
                  <span>Códigos C2 Decodificando:</span>
                  <span className="text-amber-500 font-semibold text-[9.5px]">04, 13, 14, 24, 31, 34, 44</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Protocolo de Capa:</span>
                  <span className="text-slate-350 text-slate-300">Ethernet UDP (GMDSS)</span>
                </div>
              </div>

              {/* List container */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                {inmarsatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-600">
                    <Inbox size={24} />
                    <span className="text-xs font-semibold">Esperando datagramas en puerto 9999...</span>
                  </div>
                ) : (
                  inmarsatMessages.map((m) => {
                    const isSelected = activeInmarsatMessage?.id === m.id;
                    const isCritical = m.isCritical;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedInmId(m.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer select-none space-y-2 ${
                          isSelected 
                            ? 'bg-slate-900 border-sky-500 shadow-md ring-1 ring-sky-500/20' 
                            : isCritical 
                              ? 'bg-red-950/15 hover:bg-slate-900 border-red-900/40' 
                              : 'bg-slate-905 bg-slate-900/30 hover:bg-slate-900 border-slate-900'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[8.5px] uppercase tracking-wider ${
                            m.priority === 'CRÍTICO' 
                              ? 'bg-red-950 text-red-400 border border-red-500/30' 
                              : m.priority === 'ALERTA'
                                ? 'bg-amber-955 bg-amber-950 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-900 text-slate-300 border border-slate-800'
                          }`}>
                            {m.priority}
                          </span>
                          <span className="text-slate-550 text-slate-500 font-mono text-[9px]">
                            {new Date(m.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10.5px] font-bold text-slate-200 block truncate leading-tight">
                            {m.typeText}
                          </span>
                          <div className="flex gap-2 text-[9px] font-mono text-slate-500 uppercase">
                            <span>LES: <strong className="text-slate-400">{m.sender}</strong></span>
                            <span>•</span>
                            <span>Zona: <strong className="text-slate-400">{m.area}</strong></span>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-450 text-slate-400 line-clamp-2 leading-relaxed">
                          {m.payload}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: DETAILED DECODER & INJECTION FORM (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* INSPECTOR PANEL */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
              <div className="border-b border-slate-905 border-slate-900 pb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Terminal size={14} />
                  <h4 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wider">
                    Decodificador de Mensajes SafetyNet II
                  </h4>
                </div>
                {activeInmarsatMessage && (
                  <span className="text-[9px] font-mono bg-indigo-950 border border-indigo-505 border-indigo-505/30 px-2 py-0.5 rounded text-indigo-300">
                    C2 Code: {activeInmarsatMessage.c2Code}
                  </span>
                )}
              </div>

              {activeInmarsatMessage ? (
                <div className="space-y-3">
                  {/* Metadata Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
                    <div className="bg-slate-900 border border-slate-900 p-2 rounded-lg">
                      <span className="text-slate-500 block uppercase text-[8.5px] font-bold">Estación Emisora (LES)</span>
                      <strong className="text-slate-300 block mt-0.5">{activeInmarsatMessage.sender}</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-900 p-2 rounded-lg">
                      <span className="text-slate-500 block uppercase text-[8.5px] font-bold">Área Delimitada</span>
                      <strong className="text-slate-300 block mt-0.5">{activeInmarsatMessage.area}</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-900 p-2 rounded-lg">
                      <span className="text-slate-500 block uppercase text-[8.5px] font-bold">Prioridad Canal</span>
                      <strong className={`block mt-0.5 ${
                        activeInmarsatMessage.priority === 'CRÍTICO' ? 'text-red-400' : 'text-amber-400'
                      }`}>{activeInmarsatMessage.priority}</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-900 p-2 rounded-lg">
                      <span className="text-slate-500 block uppercase text-[8.5px] font-bold">Timestamp UTC</span>
                      <strong className="text-slate-300 block mt-0.5 text-[9.5px]">
                        {new Date(activeInmarsatMessage.time).toISOString().replace('T', ' ').substring(0, 19)}
                      </strong>
                    </div>
                  </div>

                  {/* Decodified Body */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-sans">
                      Contenido Decodificado del Boletín GMDSS/SafetyNet:
                    </span>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 h-36 overflow-y-auto font-mono text-[10.5px] text-green-400/90 whitespace-pre-wrap leading-relaxed select-text shadow-inner scrollbar-thin">
                      {activeInmarsatMessage.payload}
                    </div>
                  </div>

                  {/* Hex Frame view */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-sans">
                      Trama binaria capturada del socket UDP de la NUC (Hex):
                    </span>
                    <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-900 font-mono text-[9.5px] text-indigo-300 break-all select-all leading-relaxed max-h-16 overflow-y-auto scrollbar-thin">
                      {activeInmarsatMessage.rawHex || "FF FD 01 CC AB C2 14 AE 21 00 BB CC DD DE EE FF"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center gap-2 select-none text-slate-600">
                  <Inbox size={32} className="animate-bounce" />
                  <span className="text-xs">No hay alertas seleccionadas</span>
                </div>
              )}
            </div>

            {/* BROADCAST / UDP SIMULATOR PANEL */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
              <div className="border-b border-slate-900 pb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sky-400">
                  <Cpu size={14} className="animate-pulse" />
                  <h4 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wider">
                    Simulador de Transmisión UDP Inmarsat (NUC Local)
                  </h4>
                </div>
                <span className="text-[9px] font-sans font-bold bg-slate-900 text-slate-500 border border-slate-850 rounded px-2 py-0.5">
                  DEPURACIÓN SAT
                </span>
              </div>

              <p className="text-[10px] text-slate-400 leading-normal mb-1">
                Simula el envío de un datagrama UDP en la NUC local. El decodificador escuchará el paquete en el puerto <strong className="text-sky-400 font-mono">9999</strong>, extraerá el código C2, asignará prioridades y presentará la traducción inmediata.
              </p>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (triggerSubmitting) return;
                setTriggerSubmitting(true);
                setTriggerResult(null);

                try {
                  const res = await customFetch('/api/inmarsat/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      c2Code: triggerC2Code,
                      sender: triggerSender,
                      area: triggerArea,
                      payload: triggerPayload || `ALERTA DE SEGURIDAD MARITIMA: INCIDENTE SIMULADO EN CURSO EN ${triggerArea.toUpperCase()}. PROCEDER CON MAXIMA PRECAUCION.`
                    })
                  });
                  const json = await res.json();
                  if (json.success) {
                    setTriggerResult({ success: true, msg: `✓ Datagrama UDP transmitido e interceptado con éxito en el puerto 9999.` });
                    setTriggerPayload('');
                    if (json.message) {
                      setSelectedInmId(json.message.id);
                    }
                  } else {
                    setTriggerResult({ success: false, msg: `Error: ${json.error || 'Fallo desconocido'}` });
                  }
                } catch (err: any) {
                  setTriggerResult({ success: false, msg: `Error de red: ${err.message}` });
                } finally {
                  setTriggerSubmitting(false);
                }
              }} className="space-y-3.5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* C2 Selector */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-slate-400 block font-sans">1. Código C2:</label>
                    <select
                      value={triggerC2Code}
                      onChange={(e) => setTriggerC2Code(e.target.value)}
                      className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 focus:border-sky-505 focus:outline-none rounded-lg p-2 text-[10.5px] text-slate-200 cursor-pointer font-sans"
                    >
                      <option value="14">14 - 🚨 DISTRESS RELAY</option>
                      <option value="34">34 - 🚁 SAR COORD (B&R)</option>
                      <option value="44">44 - 🚁 SAR AUX AIR</option>
                      <option value="04">04 - ⚠️ NAVIGATIONAL WARNING</option>
                      <option value="24">24 - ⛈️ MET WARNING</option>
                      <option value="31">31 - 💨 MET FORECAST</option>
                      <option value="13">13 - ⚓ COASTAL WARNING</option>
                    </select>
                  </div>

                  {/* LES SENDER */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-slate-400 block font-sans">2. Emisor (LES):</label>
                    <input
                      type="text"
                      value={triggerSender}
                      onChange={(e) => setTriggerSender(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-sky-505 focus:outline-none rounded-lg p-2 text-[10.5px] text-slate-200 font-mono"
                      placeholder="LES-AOR-E"
                      required
                    />
                  </div>

                  {/* AREA */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-slate-400 block font-sans">3. Zona / Área:</label>
                    <input
                      type="text"
                      value={triggerArea}
                      onChange={(e) => setTriggerArea(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-sky-505 focus:outline-none rounded-lg p-2 text-[10.5px] text-slate-200 font-mono"
                      placeholder="METAREA III"
                      required
                    />
                  </div>
                </div>

                {/* Templates row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-slate-500 font-bold block font-sans mr-1">Plantillas rápidas:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTriggerC2Code("14");
                      setTriggerSender("LES-AOR-W");
                      setTriggerArea("METAREA II");
                      setTriggerPayload("DISTRESS RELAY: VESSEL 'SAN JUAN' SINKING AFTER HIT BY FLIGHT REEF AT 36N 008W, 5 LIVES ON BOARD.");
                    }}
                    className="text-[9px] font-sans bg-slate-900 hover:bg-slate-850 hover:text-sky-400 border border-slate-800 text-slate-400 px-2 py-1 rounded cursor-pointer"
                  >
                    Socorro S.O.S.
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTriggerC2Code("34");
                      setTriggerSender("MADRID MRCC");
                      setTriggerArea("BALEAR S.A.T.");
                      setTriggerPayload("COORDINACIÓN DE BÚSQUEDA Y RESCATE: PATRULLERA SALVAMAR Y HELICÓPTERO COOPERANDO EN MAR DE MENOR.");
                    }}
                    className="text-[9px] font-sans bg-slate-900 hover:bg-slate-850 hover:text-sky-400 border border-slate-800 text-slate-400 px-2 py-1 rounded cursor-pointer"
                  >
                    Búsqueda SAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTriggerC2Code("24");
                      setTriggerSender("COPT METEO");
                      setTriggerArea("NAVAREA III");
                      setTriggerPayload("AVISO METEOROCLIMATICO: TEMPESTAD SEVERA EN EL GOLFO DE LEON CON OLAS MAYORES A 6 METROS.");
                    }}
                    className="text-[9px] font-sans bg-slate-900 hover:bg-slate-850 hover:text-sky-400 border border-slate-800 text-slate-400 px-2 py-1 rounded cursor-pointer"
                  >
                    Temporal Meteo
                  </button>
                </div>

                {/* Payload Area */}
                <div className="space-y-1">
                  <label className="text-[9.5px] font-bold text-slate-400 block font-sans">
                    4. Cuerpo del mensaje (Payload decodificable):
                  </label>
                  <textarea
                    value={triggerPayload}
                    onChange={(e) => setTriggerPayload(e.target.value)}
                    placeholder="Escribe el teletipo marítimo. (Si lo dejas vacío, se autogenerará uno realista para pruebas)."
                    rows={2.5}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-sky-505 focus:outline-none rounded-lg p-2 text-[10.5px] text-slate-200 font-mono"
                  />
                </div>

                {/* Feedback status */}
                {triggerResult && (
                  <div className={`p-2 rounded text-[10px] font-mono leading-normal font-medium ${
                    triggerResult.success
                      ? 'bg-emerald-950/25 border border-emerald-500/35 text-emerald-300'
                      : 'bg-red-950/25 border border-red-500/35 text-red-300'
                  }`}>
                    {triggerResult.msg}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={triggerSubmitting}
                  className="w-full py-2 bg-sky-500 hover:bg-sky-405 hover:bg-sky-400 text-slate-950 font-sans font-black text-xs uppercase tracking-wider rounded-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 select-none"
                >
                  <Send size={12} className="text-slate-950" />
                  <span>{triggerSubmitting ? 'Transmitiendo...' : 'Enviar Datagrama UDP Simulado'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : (
        /* BALIZAS DATABASE & XML MONITOR */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 animate-fade-in" id="navareas-core-dashboard">
          
          {/* COLUMN 1: STATIONS LIST AND FILTERS SIDEBAR (4 COLS) */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            
            {/* SEARCH AND REGIONS PANEL */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <h3 className="font-sans font-bold text-slate-200 text-xs flex items-center gap-2">
                  <Filter size={13} className="text-indigo-400" />
                  Filtrar Alertas de Navegación
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Radioavisos IHM Feed</span>
              </div>

              {/* SEARCH INPUT */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Búsqueda por palabra clave o ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar (ej. Tiro, Retín, Deriva...)"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 text-[11px]"
                  />
                  <Search size={12} className="absolute right-3 top-3 text-slate-500" />
                </div>
              </div>

              {/* SOURCE COMSAR FEED */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Canal Emisión / Autoridad Emisora
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:outline-none focus:border-indigo-500 text-[11px]"
                >
                  <option value="all">🌍 Todos los Canales (Navareas / Navtex)</option>
                  <option value="Armada Española">🇪🇸 Armada Española (IHM XML Crudo)</option>
                  <option value="NAVAREA III">🌐 Coordinador Internacional NAVAREA III</option>
                  <option value="NAVTEX">⚓ Emisiones Costeras NAVTEX 518 kHz</option>
                </select>
              </div>

              {/* CATEGORY SELECTOR */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Categoría del Incidente Náutico
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:outline-none focus:border-indigo-500 text-[11px]"
                >
                  <option value="all">⚓ Todas las Categorías de Alerta</option>
                  <option value="Gunnery / Ejercicios">💥 Ejercicios de Tiro / Fuego Real</option>
                  <option value="Navigational Hazard">⚠️ Obstáculo / Faro / Contenedor</option>
                  <option value="Cable Laying">🔌 Tendidos de Carga / Cables Submarinos</option>
                  <option value="Search & Rescue">🚁 Salvamento Marítimo & Socorro (SAR)</option>
                  <option value="Rig Move">⚓ Escoltas y Plataformas Offshore</option>
                  <option value="Military Operations">🎖️ Operaciones Navales de Defensa</option>
                </select>
              </div>

              {/* SUB-AREAS SELECTOR */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Sub-área Geográfica
                </label>
                <select
                  value={selectedSubArea}
                  onChange={(e) => setSelectedSubArea(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:outline-none focus:border-indigo-500 text-[11px]"
                  id="select-sub-area"
                >
                  <option value="all">🗺️ Todas las Sub-áreas (NAV III / JRC)</option>
                  <option value="III">Sub-área III (Central / Alborán / Baleares)</option>
                  <option value="III-B">Sub-área III-B (Estrecho / Atlántico Oeste)</option>
                  <option value="III-C">Sub-área III-C (Mediterráneo Oriental / Sicilia)</option>
                  <option value="N/A">Sin Sub-área Asignada</option>
                </select>
              </div>

              {/* PROXIMITY DISTANCE FILTER */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Filtrar por Proximidad (QTH Operador)
                </label>
                <select
                  value={proximityLimit}
                  onChange={(e) => setProximityLimit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:outline-none focus:border-indigo-500 text-[11px]"
                  id="select-proximity"
                >
                  <option value="all">🚀 Sin límite de distancia (Todo QTH)</option>
                  <option value="200">🔴 Rango Crítico / Cercano (&lt; 200 km)</option>
                  <option value="500">🟡 Región de Influencia Directa (&lt; 500 km)</option>
                  <option value="1000">🔵 Cuenca Regional Ampliada (&lt; 1000 km)</option>
                </select>
              </div>

              {/* DYNAMIC PROXIMITY DISTRESS ALERT THRESHOLD */}
              <div className="space-y-1.5 pt-2.5 border-t border-slate-900/60">
                <label className="text-[9px] text-red-400 font-bold uppercase tracking-wider block flex items-center justify-between">
                  <span>Umbral de Alerta de Socorro</span>
                  <span className="font-mono text-red-300 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-500/20 text-[9.5px]">
                    {alertThresholdKm} km
                  </span>
                </label>
                <input
                  type="range"
                  min="50"
                  max="1500"
                  step="25"
                  value={alertThresholdKm}
                  onChange={(e) => setAlertThresholdKm(Number(e.target.value))}
                  className="w-full accent-red-500 h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                  <span>50 km</span>
                  <span>750 km</span>
                  <span>1500 km</span>
                </div>
              </div>
            </div>

            {/* REAL STATS COUNTERS */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex flex-col gap-2 shadow-md">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono border-b border-slate-900 pb-1.5 block">Categorías de Traspaso</span>
              <div className="h-32">
                <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                  <BarChart data={statsData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#475569" fontSize={8} />
                    <YAxis stroke="#475569" fontSize={8} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px' }} />
                    <Bar dataKey="Cantidad de Avisos" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* STATIONS LIST */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-2 shadow-md">
              <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-slate-900">
                <span className="font-bold uppercase tracking-wider font-sans">Avisos Activos ({filteredWarnings.length})</span>
                <span className="font-mono">Total: {warnings.length}</span>
              </div>

              {filteredWarnings.length === 0 ? (
                <div className="py-16 text-center text-slate-600 flex flex-col items-center justify-center gap-2">
                  <Anchor size={24} className="opacity-40 animate-pulse text-indigo-400" />
                  <span className="text-[11px] font-sans">Ninguna baliza militar o civil con estos filtros</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto scrollbar-thin">
                  <AnimatePresence initial={false}>
                    {filteredWarnings.map((w) => {
                      const isSelected = activeWarning?.id === w.id;
                      const isRead = readWarningIds.includes(w.id);
                      const isWithinProximity = w.distanceKm < 200;
                      const urgencyStyle = w.urgency === 'ALERTA CRÍTICA'
                        ? 'bg-red-950/40 border-red-500/30 text-red-100/80 text-red-400'
                        : w.urgency === 'PRECAUCIÓN'
                          ? 'bg-amber-950/40 border-amber-500/30 text-amber-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400';

                      return (
                        <motion.div
                          key={w.id}
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                          layoutId={`navarea-item-${w.id}`}
                        >
                          <button
                            onClick={() => setSelectedWarning(w)}
                            className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 relative overflow-hidden ${
                              isSelected 
                                ? 'bg-indigo-950/25 border-indigo-500/40 text-indigo-200 shadow-sm shadow-indigo-950/30 ring-1 ring-indigo-500/20' 
                                : isWithinProximity
                                  ? isRead
                                    ? 'bg-rose-950/10 border-rose-900/40 text-slate-500/70 opacity-70 hover:opacity-100 hover:bg-rose-950/20 shadow-sm'
                                    : 'bg-rose-950/25 border-rose-500/55 text-slate-300 shadow-[0_0_12px_rgba(239,68,68,0.18)] hover:border-rose-450 animate-pulse-subtle'
                                  : isRead
                                    ? 'bg-slate-950/20 border-slate-950/50 text-slate-500/75 opacity-60 saturate-50 hover:bg-slate-900 hover:opacity-100 hover:saturate-100'
                                    : 'bg-slate-900/45 border-slate-900/60 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                            }`}
                          >
                            {/* Proximity left accent bar style decoration */}
                            {isWithinProximity && (
                              <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                                isRead ? 'bg-rose-500/40' : 'bg-red-500'
                              }`} />
                            )}

                            <div className="flex items-center justify-between w-full select-none text-[8px] font-mono leading-none ps-1.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded font-black border ${urgencyStyle}`}>
                                  {w.urgency}
                                </span>
                                {w.subArea && (
                                  <span className="px-1.5 py-0.5 rounded font-black border border-indigo-500/30 bg-indigo-950/40 text-indigo-400 uppercase tracking-widest text-[7px]" title={`Sub-área ${w.subArea}`}>
                                    ZONA: {w.subArea}
                                  </span>
                                )}
                                {isWithinProximity && (
                                  <span className={`px-1 py-0.5 rounded font-black border flex items-center gap-0.5 ${
                                    isRead 
                                      ? 'border-rose-500/20 bg-rose-950/20 text-rose-400/80' 
                                      : 'border-red-500/35 bg-red-950/50 text-red-300 animate-pulse'
                                  }`} title="Alerta de Proximidad < 200 km del GPSD">
                                    <AlertTriangle size={7} /> &lt; 200 KM
                                  </span>
                                )}
                                {isRead && (
                                  <span className="px-1 py-0.5 rounded font-bold border border-emerald-500/20 bg-emerald-950/40 text-emerald-400 text-[6.5px] uppercase tracking-wide" title="Leído">
                                    LEÍDO
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <span>{w.id}</span>
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedWarning(w);
                                  }}
                                  className="p-1 hover:bg-slate-800/80 hover:text-indigo-400 rounded transition-colors cursor-pointer"
                                  title="Expandir aviso náutico"
                                >
                                  <Maximize2 size={9} />
                                </span>
                              </div>
                            </div>

                            <div className="space-y-0.5 ps-1.5">
                              <h4 className={`font-sans font-bold text-[11px] line-clamp-1 transition-all ${
                                isRead && !isSelected 
                                  ? 'text-slate-500/90' 
                                  : isWithinProximity && !isSelected 
                                    ? 'text-rose-200' 
                                    : 'text-slate-200'
                              }`}>
                                {w.title}
                              </h4>
                              <div className="flex items-center justify-between flex-wrap gap-1 text-[9px] font-mono text-slate-500">
                                <span>
                                  Distancia QTH: <strong className={`font-extrabold ${isWithinProximity ? 'text-rose-400' : 'text-yellow-500/80'}`}>{w.distanceKm.toLocaleString('es-ES')} km</strong>
                                </span>
                                {isWithinProximity && !isRead && (
                                  <span className="text-[8px] font-sans text-red-400/90 font-bold animate-pulse">¡ZONA CRÍTICA!</span>
                                )}
                              </div>
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2 & 3: STATION CONSOLE MONITOR DASHBOARD (8 COLS) */}
          <div className="xl:col-span-8 flex flex-col gap-4">
            {activeWarning ? (
              <motion.div 
                key={activeWarning.id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="bg-slate-950 border border-slate-900 rounded-xl p-5 flex flex-col gap-5 shadow-xl"
              >
                
                {/* STATION HEADER CARD */}
                <div className="border-b border-slate-900 pb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
                  <div className="space-y-1 font-sans">
                    <div className="flex items-center gap-1.5 flex-wrap select-none">
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-indigo-300 font-mono font-bold rounded text-[9px] uppercase tracking-wider">
                        ⚓ {activeWarning.navareaType} Feed
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">ID Registro: {activeWarning.id}</span>
                    </div>
                    <h2 className="font-sans font-extrabold text-base text-slate-100 tracking-tight leading-none flex items-center gap-2">
                       {activeWarning.title}
                    </h2>
                  </div>

                   <div className="shrink-0 flex items-center gap-2 select-none font-sans font-bold flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => toggleReadWarning(activeWarning.id)}
                      className={`px-2.5 py-1 border rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
                        readWarningIds.includes(activeWarning.id)
                          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                      title={readWarningIds.includes(activeWarning.id) ? 'Marcar como pendiente de lectura' : 'Marcar como leído'}
                    >
                      <Check size={10} className={readWarningIds.includes(activeWarning.id) ? 'text-emerald-400' : 'text-slate-500'} />
                      <span>{readWarningIds.includes(activeWarning.id) ? 'LEÍDO' : 'CONFIRMAR LECTURA'}</span>
                    </button>

                    <button
                      onClick={() => setExpandedWarning(activeWarning)}
                      className="px-2.5 py-1 bg-indigo-950 border border-indigo-800 hover:bg-indigo-900 text-indigo-300 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-all"
                      title="Ampliar detalle y mapa en pantalla completa"
                    >
                      <Maximize2 size={10} />
                      <span>AMPLIAR</span>
                    </button>
                    <span className={`px-2.5 py-1 select-none rounded text-[10px] border flex items-center gap-1.5 ${
                      activeWarning.urgency === 'ALERTA CRÍTICA'
                        ? 'bg-red-950/40 border-red-500/50 text-red-400 animate-pulse'
                        : activeWarning.urgency === 'PRECAUCIÓN'
                          ? 'bg-amber-950/40 border-amber-500/50 text-amber-400'
                          : 'bg-sky-950/30 border-sky-500/40 text-sky-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        activeWarning.urgency === 'ALERTA CRÍTICA' ? 'bg-red-500' : activeWarning.urgency === 'PRECAUCIÓN' ? 'bg-amber-500' : 'bg-sky-450 bg-sky-400'
                      }`} />
                      {activeWarning.urgency}
                    </span>
                  </div>
                </div>

                {/* DETAILED BULLET POINTS AND COORDINATE CHECKS */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  {/* METADATA COMSAR */}
                  <div className="md:col-span-8 bg-slate-900/50 rounded-xl p-4 border border-slate-850 flex flex-col gap-3 font-sans">
                    <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider block">Detalle de la Alerta & Cobertura Coactiva</span>
                    
                    <div className="space-y-2 text-[11px] leading-relaxed text-slate-400">
                      <div>
                        <strong className="text-slate-300">Área Geográfica:</strong> {activeWarning.areaDescription}
                      </div>
                      {activeWarning.subArea && (
                        <div>
                          <strong className="text-slate-300">Sub-área NAVAREA:</strong> <span className="text-indigo-400 font-bold font-mono">ZONA {activeWarning.subArea}</span>
                        </div>
                      )}
                      <div>
                        <strong className="text-slate-300">Origen Emisor / Firma:</strong> {activeWarning.originator}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-850">
                        <div>
                          <strong className="text-slate-300">Fecha Emisión:</strong> <span className="font-mono text-zinc-300 text-[10px]">{activeWarning.broadcastTime}</span>
                        </div>
                        <div>
                          <strong className="text-slate-300">Expira:</strong> <span className="font-mono text-zinc-300 text-[10px]">{activeWarning.cancelTime || 'Permanente (Hasta cancelación)'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COORD CARD */}
                  <div className="md:col-span-4 bg-slate-900 p-3.5 rounded-xl border border-slate-850 flex flex-col justify-between font-mono text-[10px] text-slate-400 select-all">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-sans">Localizador Marino</span>
                    <div className="border-b border-slate-850 pb-1.5 flex items-center justify-between">
                      <span>Latitud GD:</span>
                      <strong className="text-slate-200">{activeWarning.lat.toFixed(4)}</strong>
                    </div>
                    <div className="border-b border-slate-850 pb-1.5 flex items-center justify-between">
                      <span>Longitud GD:</span>
                      <strong className="text-slate-200">{activeWarning.lon.toFixed(4)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Rango QTH:</span>
                      <span className={`font-bold transition-colors ${
                        activeWarning.distanceKm < 200
                          ? 'text-rose-400 animate-pulse'
                          : 'text-indigo-400'
                      }`}>
                        {activeWarning.distanceKm.toLocaleString('es-ES')} km
                        {activeWarning.distanceKm < 200 && ' (¡CERCANO!)'}
                      </span>
                    </div>
                  </div>

                </div>

                {/* RAW TELETYPE MENSAJE CRUDO DE TELETIPO SECRETO */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-[9.5px] text-indigo-400 font-bold uppercase tracking-wider block">Teletipo Crudo XML Armada Española / NAVTEX 518 kHz</span>
                    <span className="text-[9px] text-slate-500 font-mono">CC-B GMDSS Feed</span>
                  </div>

                  <div className="bg-black/85 p-4 rounded-xl border border-slate-850 h-52 overflow-y-auto font-mono text-[10.5px] text-green-400/90 whitespace-pre-wrap leading-relaxed select-text shadow-inner scrollbar-thin">
                    {activeWarning.rawText}
                  </div>
                </div>

                {/* EMERGENCY BROADCAST AND EXPLOITATION AS APRS PACKET */}
                <div className="border-t border-slate-900 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 select-none">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-950/30 border border-indigo-400/20 rounded-lg shrink-0 text-indigo-400">
                      <Radio size={15} />
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold text-slate-300 block leading-tight">Retransmisión Objeto AX.25 APRS</span>
                      <p className="text-[9px] text-slate-500 font-sans leading-tight">Inyectar la anomalía marítima al bus para su ploteo en el Radar APRS.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-center text-[10px] font-bold font-sans">
                    {/* RELOCATE RADAR */}
                    <button
                      onClick={() => onRelocate(activeWarning.lat, activeWarning.lon, activeWarning.title)}
                      className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MapPin size={11} className="text-yellow-500" />
                      <span>Ploter en Radar (Fijar QTH)</span>
                    </button>

                    {/* TRANSMIT OBJECT */}
                    <button
                      onClick={handleTransmitWarningAPRS}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-505 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Send size={11} />
                      <span>Emitir Boletín APRS</span>
                    </button>
                  </div>
                </div>

                {aprsStatus && (
                  <div className={`p-2.5 rounded border text-[10px] font-mono leading-normal shadow-sm select-all ${
                    aprsStatus.success 
                      ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-300' 
                      : 'bg-red-950/25 border-red-500/35 text-red-300'
                  }`}>
                    {aprsStatus.msg}
                  </div>
                )}

              </motion.div>
            ) : (
              <div className="py-24 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center text-center gap-3 bg-slate-950">
                <Anchor size={36} className="text-slate-700 animate-pulse" />
                <div className="space-y-1 font-sans">
                  <h4 className="font-bold text-slate-300">Seleccione un Boletín NAVAREA</h4>
                  <p className="text-[11px] text-slate-500 max-w-sm leading-normal">
                    Filtre o seleccione un radioaviso de las aguas territoriales españolas e internacionales para visualizar el teletipo y fijar coordenadas.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* EXPANDED DETAILS MODAL PORTAL */}
      <AnimatePresence>
        {expandedWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* MODAL HEADER */}
              <div className="flex items-center justify-between border-b border-slate-800 p-5 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border shrink-0 ${
                    expandedWarning.urgency === 'ALERTA CRÍTICA'
                      ? 'bg-red-950/40 border-red-500/30 text-red-400 font-bold'
                      : expandedWarning.urgency === 'PRECAUCIÓN'
                        ? 'bg-amber-950/45 border-amber-550/35 text-amber-400 font-bold'
                        : 'bg-sky-950/40 border-sky-505/30 text-sky-400 font-bold'
                  }`}>
                    <Anchor size={20} className={expandedWarning.urgency === 'ALERTA CRÍTICA' ? 'animate-pulse' : ''} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-850 text-indigo-300 uppercase tracking-widest">
                        {expandedWarning.navareaType}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Registro: {expandedWarning.id}</span>
                    </div>
                    <h3 className="font-sans font-extrabold text-sm md:text-base text-slate-100 tracking-tight leading-tight mt-0.5">
                      {expandedWarning.title}
                    </h3>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedWarning(null)}
                  className="p-2 text-slate-400 hover:text-slate-100 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Cerrar ventana de detalles"
                >
                  <X size={16} />
                </button>
              </div>

              {/* MODAL BODY (SCROLLABLE CONTENEDOR) */}
              <div className="p-6 overflow-y-auto flex flex-col gap-6 scrollbar-thin">
                
                {/* TOP CARDS GRID: INFORMATION AND VECTOR MAP */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* LEFT PANE: KEY DETAILS (5 COLS) */}
                  <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-4">
                    
                    {/* DETAILS CARD */}
                    <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 flex flex-col gap-4 font-sans text-xs">
                      <div className="border-b border-slate-850 pb-2">
                        <span className="text-[9px] text-indigo-400 font-mono font-bold uppercase tracking-widest block">Metadatos de la Baliza</span>
                      </div>

                      <div className="space-y-3 text-slate-300">
                        <div className="flex justify-between border-b border-slate-850/40 pb-2 flex-wrap gap-2">
                          <span className="text-slate-500">Categoría:</span>
                          <strong className="text-slate-200">{expandedWarning.category}</strong>
                        </div>
                        {expandedWarning.subArea && (
                          <div className="flex justify-between border-b border-slate-850/40 pb-2 flex-wrap gap-2">
                            <span className="text-slate-500">Sub-área NAVAREA:</span>
                            <strong className="text-indigo-400 font-mono font-bold">ZONA {expandedWarning.subArea}</strong>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-slate-850/40 pb-2 flex-wrap gap-2">
                          <span className="text-slate-500">Origen Emisor:</span>
                          <strong className="text-slate-200">{expandedWarning.originator}</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-850/40 pb-2 flex-wrap gap-2">
                          <span className="text-slate-500">Fecha Emisión:</span>
                          <strong className="text-slate-200 font-mono text-[11px]">{expandedWarning.broadcastTime}</strong>
                        </div>
                        <div className="flex justify-between border-b border-slate-850/40 pb-2 flex-wrap gap-2">
                          <span className="text-slate-500">Expiración:</span>
                          <strong className="text-slate-200 font-mono text-[11px]">{expandedWarning.cancelTime || 'Permanente (Hasta cancelación)'}</strong>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-850/40 pb-2 flex-wrap gap-2">
                          <span className="text-slate-500">Nivel de Urgencia:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold border ${
                            expandedWarning.urgency === 'ALERTA CRÍTICA'
                              ? 'bg-red-950/50 border-red-500/30 text-red-400'
                              : expandedWarning.urgency === 'PRECAUCIÓN'
                                ? 'bg-amber-950/50 border-amber-500/30 text-amber-400'
                                : 'bg-sky-950/40 border-sky-500/30 text-sky-400'
                          }`}>
                            {expandedWarning.urgency}
                          </span>
                        </div>
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <span className="text-slate-500">Estado de Lectura:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold border ${
                            readWarningIds.includes(expandedWarning.id)
                              ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}>
                            {readWarningIds.includes(expandedWarning.id) ? 'LEÍDO' : 'PENDIENTE'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* COORD CARD IN DMS */}
                    <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-850 flex flex-col gap-4">
                      <div>
                        <span className="text-[9px] text-indigo-400 font-mono font-bold uppercase tracking-widest block">Geolocalización Náutica Precisa</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs font-mono text-slate-300">
                        <div className="bg-slate-900 border border-slate-850 p-3 rounded-lg flex flex-col justify-between">
                          <span className="text-slate-500 text-[9px] block mb-1 font-sans">LATITUD (GD)</span>
                          <strong className="text-slate-100 text-[13px]">{expandedWarning.lat.toFixed(6)}</strong>
                          <span className="text-indigo-400 text-[9.5px] block mt-1">{formatToDMS(expandedWarning.lat, true)}</span>
                        </div>
                        <div className="bg-slate-900 border border-slate-850 p-3 rounded-lg flex flex-col justify-between">
                          <span className="text-slate-500 text-[9px] block mb-1 font-sans">LONGITUD (GD)</span>
                          <strong className="text-slate-100 text-[13px]">{expandedWarning.lon.toFixed(6)}</strong>
                          <span className="text-indigo-400 text-[9.5px] block mt-1">{formatToDMS(expandedWarning.lon, false)}</span>
                        </div>
                      </div>

                      <div className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-xl flex items-center justify-between text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Compass size={14} className="text-indigo-400" />
                          <span>Distancia al QTH del Operador:</span>
                        </div>
                        <strong className="text-yellow-500 font-mono text-sm">{expandedWarning.distanceKm.toLocaleString('es-ES')} km</strong>
                      </div>
                    </div>

                    {/* GEOGRAPHIC SCOPE */}
                    <div className="bg-slate-950/40 p-4 border border-slate-850/80 rounded-xl text-xs font-sans text-slate-400">
                      <strong className="text-slate-300 block mb-1">Área de Cobertura Náutica:</strong>
                      <p className="leading-relaxed">{expandedWarning.areaDescription}</p>
                    </div>

                  </div>

                  {/* RIGHT PANE: VECTOR MAP RECORTADO (7 COLS) */}
                  <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-3">
                    <div className="flex items-center justify-between font-sans">
                      <span className="text-[9px] text-indigo-400 font-mono font-bold uppercase tracking-widest block font-bold">Carta Náutica Digital Remota</span>
                      <span className="text-[9px] text-slate-500 font-mono">Zoom Local: ~60 Millas Náuticas</span>
                    </div>

                    {/* MAP CARD SVG CONTAINER */}
                    <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden h-96">
                      
                      <style>{`
                        @keyframes radarSweepCustom {
                          from { transform: rotate(0deg); }
                          to { transform: rotate(360deg); }
                        }
                        .animate-radar-sweep-custom {
                          transform-origin: 200px 200px;
                          animation: radarSweepCustom 5s linear infinite;
                        }
                      `}</style>

                      {/* Vector Map representation */}
                      <svg viewBox="0 0 400 400" className="w-full h-full text-slate-800">
                        <defs>
                          <radialGradient id="radar-glow-custom" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(99, 102, 241, 0.15)" />
                            <stop offset="100%" stopColor="rgba(99, 102, 241, 0)" />
                          </radialGradient>
                          <linearGradient id="grid-fade" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgba(14, 116, 144, 0.1)" />
                            <stop offset="100%" stopColor="rgba(99, 102, 241, 0.15)" />
                          </linearGradient>
                        </defs>
                        
                        {/* Grid Background */}
                        <rect width="400" height="400" fill="url(#radar-glow-custom)" />
                        <rect width="400" height="400" fill="url(#grid-fade)" opacity="0.4" />
                        
                        {/* Dynamic Grid coordinate lines depending on custom lat and lon */}
                        {[-2, -1, 0, 1, 2].map((offset, idx) => {
                          const latVal = (expandedWarning.lat + offset * 0.15).toFixed(3);
                          const lonVal = (expandedWarning.lon + offset * 0.15).toFixed(3);
                          const pos = 40 + idx * 80;
                          return (
                            <g key={idx}>
                              {/* Horizontal latitude lines */}
                              <line x1="10" y1={pos} x2="390" y2={pos} stroke="rgba(71, 85, 105, 0.3)" strokeDasharray="3,3" />
                              <text x="15" y={pos - 4} className="fill-slate-500 font-mono text-[8px]">{latVal}°N</text>
                              
                              {/* Vertical longitude lines */}
                              <line x1={pos} y1="10" x2={pos} y2="390" stroke="rgba(71, 85, 105, 0.3)" strokeDasharray="3,3" />
                              <text x={pos + 4} y="385" className="fill-slate-500 font-mono text-[8px]">{lonVal}°E</text>
                            </g>
                          );
                        })}

                        {/* Concentric distance rings */}
                        <circle cx="200" cy="200" r="60" fill="none" stroke="rgba(129, 140, 248, 0.18)" strokeWidth="1" />
                        <circle cx="200" cy="200" r="120" fill="none" stroke="rgba(129, 140, 248, 0.12)" strokeWidth="1" strokeDasharray="4,4" />
                        <circle cx="200" cy="200" r="170" fill="none" stroke="rgba(129, 140, 248, 0.06)" strokeWidth="1" />
                        
                        <text x="200" y="135" className="fill-slate-500 font-mono text-[8px] text-center" textAnchor="middle">20 NM</text>
                        <text x="200" y="75" className="fill-slate-500 font-mono text-[8px] text-center" textAnchor="middle">40 NM</text>
                        <text x="200" y="25" className="fill-slate-500 font-mono text-[8px] text-center" textAnchor="middle">60 NM</text>

                        {/* Compass Rose decoration */}
                        <g transform="translate(350, 55) scale(0.65)">
                          <circle cx="0" cy="0" r="30" fill="none" stroke="rgba(244, 63, 94, 0.15)" strokeWidth="1" />
                          <line x1="-35" y1="0" x2="35" y2="0" stroke="rgba(244, 63, 94, 0.25)" />
                          <line x1="0" y1="-35" x2="0" y2="35" stroke="rgba(244, 63, 94, 0.25)" />
                          <polygon points="0,-35 4,-5 0,-2 0,-35" className="fill-rose-500/40" />
                          <polygon points="0,-35 -4,-5 0,-2 0,-35" className="fill-rose-600/20" />
                          <polygon points="0,35 4,5 0,2 0,35" className="fill-slate-600" />
                          <polygon points="0,35 -4,5 0,2 0,35" className="fill-slate-700" />
                          <polygon points="35,0 5,4 2,0 35,0" className="fill-slate-600" />
                          <polygon points="-35,0 -5,4 -2,0 -35,0" className="fill-slate-700" />
                          <text x="0" y="-39" className="fill-rose-400 font-sans font-bold text-[10px] text-center" textAnchor="middle">N</text>
                        </g>

                        {/* Rotating Radar Sweep Line */}
                        <line x1="200" y1="200" x2="380" y2="250" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1.5" className="animate-radar-sweep-custom" />

                        {/* Mock stylized coastal outline to look like "mapa local recortado de área afectada" */}
                        <path 
                          d="M 10 120 Q 80 145 140 90 T 260 170 T 390 100" 
                          fill="none" 
                          stroke="rgba(14, 116, 144, 0.3)" 
                          strokeWidth="2.5" 
                        />
                        <path 
                          d="M 20 280 Q 150 240 220 310 T 380 250" 
                          fill="none" 
                          stroke="rgba(14, 116, 144, 0.2)" 
                          strokeWidth="1.5" 
                          strokeDasharray="5,3" 
                        />
                        <text x="90" y="125" className="fill-slate-600 font-sans italic text-[8.5px]">Profundidad 100m</text>
                        <text x="210" y="295" className="fill-slate-600 font-sans italic text-[8.5px]">Profundidad 200m</text>

                        {/* Center Core crosshair */}
                        <line x1="180" y1="200" x2="220" y2="200" stroke="rgba(239, 68, 68, 0.4)" strokeWidth="1" />
                        <line x1="200" y1="180" x2="200" y2="220" stroke="rgba(239, 68, 68, 0.4)" strokeWidth="1" />

                        {/* Pulse Beacon animation */}
                        <circle cx="200" cy="200" r="18" fill="rgba(239, 68, 68, 0.15)" className="animate-ping" style={{ animationDuration: '3.5s' }} />
                        <circle cx="200" cy="200" r="10" fill="rgba(239, 68, 68, 0.3)" className="animate-pulse" />
                        <circle cx="200" cy="200" r="4" className="fill-red-500" />
                        
                        {/* Tag indicating epicenter coordinates */}
                        <g transform="translate(210, 185)">
                          <rect x="0" y="0" width="125" height="32" rx="4" className="fill-slate-900/90 stroke-red-500/40" strokeWidth="1" />
                          <text x="6" y="12" className="fill-red-400 font-mono font-bold text-[8.5px]">{expandedWarning.id}</text>
                          <text x="6" y="24" className="fill-slate-300 font-mono text-[7.5px]">{expandedWarning.category}</text>
                        </g>
                      </svg>

                      {/* HUD Corner Text Metrics overlay */}
                      <div className="absolute top-3 left-3 bg-slate-950/85 border border-slate-800/80 px-2.5 py-1.5 rounded-lg font-mono text-[8px] leading-tight text-slate-400 space-y-0.5 pointer-events-none select-none">
                        <div>GMDSS MARINE TELEMETRY</div>
                        <div className="text-indigo-400 font-bold">GRID ONLINE: ACTIVE</div>
                        <div>SENSING RANGE: 60 NM</div>
                        <div>CONTOUR: ISOBATHY-PLOT</div>
                      </div>

                      <div className="absolute top-3 right-3 bg-slate-950/85 border border-slate-800/80 px-2.5 py-1.5 rounded-lg font-mono text-[8px] leading-tight text-slate-400 pointer-events-none select-none">
                        <div className="text-emerald-500 font-bold">GPS REF CENTER</div>
                        <div>LAT: {expandedWarning.lat.toFixed(6)}</div>
                        <div>LON: {expandedWarning.lon.toFixed(6)}</div>
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 border border-slate-800/80 px-3 py-1.5 rounded-lg font-mono text-[8.5px] leading-tight text-slate-400 flex items-center justify-between select-none">
                        <span className="text-yellow-505 text-yellow-500">REF COORD: {formatToDMS(expandedWarning.lat, true)}, {formatToDMS(expandedWarning.lon, false)}</span>
                        <span className="text-indigo-400 font-bold">{expandedWarning.distanceKm.toLocaleString('es-ES')} km de QTH</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* BOTTOM BLOCK: RAW TELETYPE IN FULL GLORY */}
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between font-sans">
                    <span className="text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-widest block">Mensaje de Teletipo Completo Decodificado (GMDSS-NAVTEX)</span>
                    <span className="text-[9px] text-slate-500 font-mono">CC-B Frecuencia: 518 kHz</span>
                  </div>

                  <div className="bg-black/90 p-5 rounded-xl border border-slate-850 h-56 overflow-y-auto font-mono text-[11.5px] text-green-400/90 whitespace-pre-wrap leading-relaxed select-text shadow-inner scrollbar-thin">
                    {expandedWarning.rawText}
                  </div>
                </div>

              </div>

              {/* MODAL FOOTER */}
              <div className="border-t border-slate-800 p-5 bg-slate-950/40 rounded-b-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 select-none shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-950/30 border border-indigo-400/20 rounded-lg shrink-0 text-indigo-400">
                    <Radio size={16} />
                  </div>
                  <div>
                    <span className="text-[11px] font-sans font-bold text-slate-200 block leading-tight">Retransmisión Integrada & Control Operativo</span>
                    <p className="text-[9.5px] text-slate-500 font-sans leading-tight">Inyecte esta anomalía marítima en el radar principal o emita boletín a frecuencias HF terrestres.</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => {
                      toggleReadWarning(expandedWarning.id);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      readWarningIds.includes(expandedWarning.id)
                        ? 'bg-emerald-950 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-955'
                    }`}
                  >
                    <Check size={13} />
                    <span>{readWarningIds.includes(expandedWarning.id) ? 'Leído (Reestablecer)' : 'Confirmar lectura'}</span>
                  </button>

                  <button
                    onClick={() => {
                      onRelocate(expandedWarning.lat, expandedWarning.lon, expandedWarning.title);
                      setExpandedWarning(null);
                    }}
                    className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 rounded-xl text-slate-300 text-xs font-bold font-sans flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <MapPin size={13} className="text-yellow-500" />
                    <span>Localizar / Plotear en Radar</span>
                  </button>

                  <button
                    onClick={() => {
                      handleTransmitWarningAPRS();
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-indigo-950"
                  >
                    <Send size={13} />
                    <span>Emitir Boletín APRS</span>
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
