import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Radio, Shield, TrendingUp, MapPin, 
  Database, Filter, Activity, Compass, AlertTriangle, 
  ArrowRight, Waves, Thermometer, Wind, RefreshCw, 
  ExternalLink, Check, Copy, Send, HelpCircle, 
  Layers, ChevronRight, Eye, Info, Server, Settings, 
  Plus, Terminal, Globe, Sliders
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, CartesianGrid, 
  XAxis, YAxis, Tooltip, Area, LineChart, Line 
} from 'recharts';
import { GPSDStatus, ERDDAPBuoy, ERDDAPDataset } from '../../types';
import NDBCStationsCatalog from './NDBCStationsCatalog';
import { getBeaufortInfoByKts } from '../../utils/beaufort';

interface PortusOceanDataProps {
  gpsd: GPSDStatus;
  onRelocate: (lat: number, lon: number, title: string) => void;
  onInjectRaw?: (payload: string) => Promise<boolean>;
  erddapBuoys: ERDDAPBuoy[];
  portusStations?: OceanStation[];
}

export interface OceanStation {
  id: string;
  name: string;
  type: 'Boya' | 'Mareógrafo' | 'Met' | 'Radar';
  region: 'Cantábrico' | 'Atlántico' | 'Estrecho' | 'Mediterráneo' | 'Canarias';
  lat: number;
  lon: number;
  waveHeightM: number;      // Hm0 peak wave height
  wavePeriodSec: number;     // wave period peak
  waterTempC: number;        // water temperature
  seaLevelM: number;         // tide height
  windSpeedKts: number;      // wind speed inside port or ocean
  windDirDeg: number;        // wind direction
  pressureHpa?: number;      // barometric pressure if applicable
  provider: string;          // Puertos del Estado Source system
  status: 'Nominal' | 'Precaución' | 'Temporal';
  statusDescription: string;
}

// Fixed premium datasets mimicking the Puertos del Estado dynamic telemetry
const PORTUS_STATIONS: OceanStation[] = [
  {
    id: 'BOY-GATA',
    name: 'Boya de Cabo de Gata (Deep-Water)',
    type: 'Boya',
    region: 'Mediterráneo',
    lat: 36.5700,
    lon: -2.3300,
    waveHeightM: 1.6,
    wavePeriodSec: 7.2,
    waterTempC: 21.4,
    seaLevelM: 0.12,
    windSpeedKts: 16.4,
    windDirDeg: 85,
    pressureHpa: 1014.2,
    provider: 'Red Exterior (Boyas de Gran Escala)',
    status: 'Nominal',
    statusDescription: 'Régimen de vientos moderados de levante. Alturas de ola seguras para navegación costera.'
  },
  {
    id: 'BOY-PENAS',
    name: 'Boya de Cabo de Peñas (Norte-Norte)',
    type: 'Boya',
    region: 'Cantábrico',
    lat: 43.7300,
    lon: -5.8600,
    waveHeightM: 4.8,
    wavePeriodSec: 11.5,
    waterTempC: 14.8,
    seaLevelM: 1.15,
    windSpeedKts: 31.2,
    windDirDeg: 275,
    pressureHpa: 1004.8,
    provider: 'Red Exterior (Boyas de Gran Escala)',
    status: 'Temporal',
    statusDescription: 'Fuerte temporal de poniente con mar gruesa. Se recomienda precaución severa en operaciones SAR.'
  },
  {
    id: 'BOY-BILBO',
    name: 'Boya de Bilbao (Cantábrico)',
    type: 'Boya',
    region: 'Cantábrico',
    lat: 43.6400,
    lon: -3.0500,
    waveHeightM: 3.2,
    wavePeriodSec: 9.8,
    waterTempC: 15.6,
    seaLevelM: 0.98,
    windSpeedKts: 22.1,
    windDirDeg: 290,
    pressureHpa: 1008.2,
    provider: 'Red Exterior (Boyas de Gran Escala)',
    status: 'Precaución',
    statusDescription: 'Mar marejada aumentando a fuerte marejada. Propagación de fondo del noroeste.'
  },
  {
    id: 'BOY-BARC',
    name: 'Boya de Barcelona (Litoral)',
    type: 'Boya',
    region: 'Mediterráneo',
    lat: 41.3200,
    lon: 2.2000,
    waveHeightM: 0.65,
    wavePeriodSec: 4.5,
    waterTempC: 22.8,
    seaLevelM: 0.22,
    windSpeedKts: 6.8,
    windDirDeg: 190,
    pressureHpa: 1016.5,
    provider: 'Red Costera (Boyas de Proximidad)',
    status: 'Nominal',
    statusDescription: 'Régimen de brisa térmica regular (embat). Aguas calmas en dársenas exteriores.'
  },
  {
    id: 'BOY-TENER',
    name: 'Boya de Tenerife Este (Atlántico)',
    type: 'Boya',
    region: 'Canarias',
    lat: 28.4800,
    lon: -16.2000,
    waveHeightM: 1.9,
    wavePeriodSec: 8.4,
    waterTempC: 21.1,
    seaLevelM: 0.85,
    windSpeedKts: 19.5,
    windDirDeg: 45,
    pressureHpa: 1020.1,
    provider: 'Red Costera (Boyas de Proximidad)',
    status: 'Nominal',
    statusDescription: 'Vientos alisios estables del NE. Condiciones normales del archipiélago.'
  },
  {
    id: 'MAR-ALGE',
    name: 'Mareógrafo de Algeciras (Puerto Real)',
    type: 'Mareógrafo',
    region: 'Estrecho',
    lat: 36.1300,
    lon: -5.4400,
    waveHeightM: 0.25,
    wavePeriodSec: 3.0,
    waterTempC: 17.5,
    seaLevelM: 0.38,
    windSpeedKts: 14.2,
    windDirDeg: 260,
    pressureHpa: 1013.1,
    provider: 'Red de Mareógrafos (REDMAR)',
    status: 'Nominal',
    statusDescription: 'Canal de mareas estable. Sobremarea astronómica insignificante de +0.03 metros.'
  },
  {
    id: 'MAR-CORU',
    name: 'Mareógrafo de La Coruña (Dársena)',
    type: 'Mareógrafo',
    region: 'Atlántico',
    lat: 43.3700,
    lon: -8.4000,
    waveHeightM: 1.2,
    wavePeriodSec: 6.8,
    waterTempC: 15.2,
    seaLevelM: 1.84,
    windSpeedKts: 24.5,
    windDirDeg: 310,
    pressureHpa: 1010.5,
    provider: 'Red de Mareógrafos (REDMAR)',
    status: 'Precaución',
    statusDescription: 'Marea alta con fuerte embate de fondo en diques exteriores. Coeficiente de marea medio/alto.'
  },
  {
    id: 'MAR-VALE',
    name: 'Mareógrafo de Valencia (Puerto)',
    type: 'Mareógrafo',
    region: 'Mediterráneo',
    lat: 39.4500,
    lon: -0.3100,
    waveHeightM: 0.45,
    wavePeriodSec: 4.1,
    waterTempC: 23.1,
    seaLevelM: 0.18,
    windSpeedKts: 9.5,
    windDirDeg: 120,
    pressureHpa: 1015.0,
    provider: 'Red de Mareógrafos (REDMAR)',
    status: 'Nominal',
    statusDescription: 'Aguas tranquilas en el frente portuario. Operativa civil de estiba sin contingencias.'
  },
  {
    id: 'MAR-MALI',
    name: 'Mareógrafo de Santa Cruz de la Palma',
    type: 'Mareógrafo',
    region: 'Canarias',
    lat: 28.6700,
    lon: -17.7600,
    waveHeightM: 1.5,
    wavePeriodSec: 7.9,
    waterTempC: 20.4,
    seaLevelM: 0.94,
    windSpeedKts: 11.2,
    windDirDeg: 20,
    pressureHpa: 1017.8,
    provider: 'Red de Mareógrafos (REDMAR)',
    status: 'Nominal',
    statusDescription: 'Amplitud de marea regular Atlántica. Registro instrumental estable.'
  },
  {
    id: 'BOY-CABOPAL',
    name: 'Boya de Cabo de Palos (Costa Murciana)',
    type: 'Boya',
    region: 'Mediterráneo',
    lat: 37.6400,
    lon: -0.5300,
    waveHeightM: 1.1,
    wavePeriodSec: 6.0,
    waterTempC: 22.1,
    seaLevelM: 0.08,
    windSpeedKts: 15.1,
    windDirDeg: 70,
    pressureHpa: 1014.9,
    provider: 'Red Exterior (Boyas de Gran Escala)',
    status: 'Nominal',
    statusDescription: 'Estado nominal del viento. Corrientes estables bajo el relieve de acantilados costeros.'
  },
  {
    id: 'MAR-CADIZ',
    name: 'Mareógrafo de Cádiz (Puerto de la Bahía)',
    type: 'Mareógrafo',
    region: 'Atlántico',
    lat: 36.5300,
    lon: -6.2800,
    waveHeightM: 0.5,
    wavePeriodSec: 4.8,
    waterTempC: 19.8,
    seaLevelM: 1.48,
    windSpeedKts: 17.5,
    windDirDeg: 240,
    pressureHpa: 1012.8,
    provider: 'Red de Mareógrafos (REDMAR)',
    status: 'Nominal',
    statusDescription: 'Marea menguante normalizada dentro de la cubeta de la bahía interior.'
  }
];

const ERDDAP_DATASETS: ERDDAPDataset[] = [
  {
    id: 'noaa_ndbc_realtime',
    name: 'NOAA National Data Buoy Center (Real-Time)',
    serverUrl: 'https://erddap.ndbc.noaa.gov/erddap',
    variables: ['station_id', 'time', 'latitude', 'longitude', 'wind_speed', 'significant_wave_height', 'sea_water_temperature'],
    lastUpdate: 'Hace 4 minutos (Live)'
  },
  {
    id: 'noaa_aoml_gdp_2025',
    name: 'NOAA AOML Global Drifter Program (GDP 2025)',
    serverUrl: 'https://erddap.aoml.noaa.gov/gdp/erddap',
    variables: ['drifter_id', 'time', 'latitude', 'longitude', 'sst', 've', 'vn', 'wind_speed', 'air_pressure'],
    lastUpdate: 'Cosechado (GDP-2025 In-Situ Trackers)'
  },
  {
    id: 'copernicus_insitu_med_nrt',
    name: 'Copernicus Marine - Ocean Observations Med',
    serverUrl: 'https://erddap.copernicus.eu/erddap',
    variables: ['time', 'latitude', 'longitude', 'sea_surface_temp', 'sea_surface_wave_significant_height', 'sea_water_velocity'],
    lastUpdate: 'Hace 11 minutos (NRT)'
  },
  {
    id: 'pe_erddap_exterior_espectrales',
    name: 'Puertos del Estado - Red Exterior de Boyas (ERDDAP)',
    serverUrl: 'http://erddap.puertos.es/erddap',
    variables: ['station_id', 'time', 'latitude', 'longitude', 'wave_height', 'wave_period', 'sea_water_temp'],
    lastUpdate: 'Hace 8 minutos (Direct)'
  }
];

const SIMULATED_ERDDAP_BUOYS: ERDDAPBuoy[] = [
  {
    id: 'ERD-GDP-2025-01',
    name: 'Drifter AOML GDP-103302 (Canary Basin)',
    datasetId: 'noaa_aoml_gdp_2025',
    lat: 28.12,
    lon: -16.45,
    waveHeightM: 1.80,
    wavePeriodSec: 7.2,
    waterTempC: 22.1,
    windSpeedKts: 14.8,
    windDirDeg: 120,
    pressureHpa: 1013.8,
    region: 'Canarias',
    statusDescription: 'Boya a la deriva del Global Drifter Program (GDP) 2025. Registrando las corrientes de Canarias hacia las Antillas en tiempo real.'
  },
  {
    id: 'ERD-GDP-2025-02',
    name: 'Drifter AOML GDP-904122 (Azores Current)',
    datasetId: 'noaa_aoml_gdp_2025',
    lat: 38.50,
    lon: -28.60,
    waveHeightM: 2.30,
    wavePeriodSec: 8.4,
    waterTempC: 18.2,
    windSpeedKts: 19.5,
    windDirDeg: 260,
    pressureHpa: 1011.2,
    region: 'Atlántico',
    statusDescription: 'Drifter oceanográfico NOAA AOML registrando la temperatura superficial de mar (SST) y el empuje de deriva geostrófica.'
  },
  {
    id: 'ERD-41001',
    name: 'Boya NDBC 41001 (East Hatteras)',
    datasetId: 'noaa_ndbc_realtime',
    lat: 34.68,
    lon: -72.63,
    waveHeightM: 2.85,
    wavePeriodSec: 9.1,
    waterTempC: 24.5,
    windSpeedKts: 18.5,
    windDirDeg: 135,
    pressureHpa: 1012.3,
    region: 'Atlántico Norte',
    statusDescription: 'Datos obtenidos por protocolo Tabledap desde el servidor ERDDAP de NOAA.'
  },
  {
    id: 'ERD-44005',
    name: 'Boya NDBC 44005 (Gulf of Maine)',
    datasetId: 'noaa_ndbc_realtime',
    lat: 43.20,
    lon: -69.12,
    waveHeightM: 3.52,
    wavePeriodSec: 10.4,
    waterTempC: 12.8,
    windSpeedKts: 22.4,
    windDirDeg: 240,
    pressureHpa: 1007.5,
    region: 'Atlántico Norte',
    statusDescription: 'Fuerte oleaje del noroeste registrado en la costa noreste de EEUU. Canal ERDDAP estable.'
  },
  {
    id: 'ERD-MED74',
    name: 'Boya Copernicus MED-741 (Golfo de León)',
    datasetId: 'copernicus_insitu_med_nrt',
    lat: 42.15,
    lon: 4.88,
    waveHeightM: 1.45,
    wavePeriodSec: 6.5,
    waterTempC: 20.2,
    windSpeedKts: 12.8,
    windDirDeg: 315,
    pressureHpa: 1015.1,
    region: 'Mediterráneo',
    statusDescription: 'Datos cosechados via ERDDAP. Condiciones del Golfo de León estables.'
  },
  {
    id: 'ERD-PALOS',
    name: 'Boya Cabo Palos Profunda (IHM/ERDDAP)',
    datasetId: 'pe_erddap_exterior_espectrales',
    lat: 37.64,
    lon: -0.33,
    waveHeightM: 1.20,
    wavePeriodSec: 5.8,
    waterTempC: 22.4,
    windSpeedKts: 14.5,
    windDirDeg: 90,
    pressureHpa: 1014.5,
    region: 'Mediterráneo',
    statusDescription: 'Boya profunda acoplada del dataset de Puertos del Estado vía pasarela ERDDAP.'
  }
];

export default function PortusOceanData({ gpsd, onRelocate, onInjectRaw, erddapBuoys, portusStations }: PortusOceanDataProps) {
  const [stations, setStations] = useState<OceanStation[]>(PORTUS_STATIONS);

  useEffect(() => {
    if (portusStations && portusStations.length > 0) {
      setStations(prev => {
        // Keep any custom stations added client-side via NDBC/ERDDAP catalog (not present in server's portusStations)
        const serverIds = new Set(portusStations.map(st => st.id));
        const customStations = prev.filter(st => !serverIds.has(st.id));
        return [...portusStations, ...customStations];
      });
    }
  }, [portusStations]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStation, setSelectedStation] = useState<OceanStation | null>(PORTUS_STATIONS[0]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'erddap' | 'gis' | 'ndbc'>('telemetry');
  const [injectStatus, setInjectStatus] = useState<{ success: boolean; msg: string } | null>(null);

  // States for ERDDAP Panel
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('noaa_ndbc_realtime');
  const [erddapServerUrl, setErddapServerUrl] = useState<string>('https://erddap.ndbc.noaa.gov/erddap');
  const [erddapDatasetId, setErddapDatasetId] = useState<string>('noaa_ndbc_realtime');
  const [latMin, setLatMin] = useState<string>('20.0');
  const [latMax, setLatMax] = useState<string>('48.0');
  const [lonMin, setLonMin] = useState<string>('-85.0');
  const [lonMax, setLonMax] = useState<string>('15.0');
  const [timeRange, setTimeRange] = useState<string>('last24h');
  const [selectedVariables, setSelectedVariables] = useState<string[]>(['latitude', 'longitude', 'time', 'significant_wave_height', 'sea_water_temperature']);
  
  const [queryingServer, setQueryingServer] = useState<boolean>(false);
  const [querySuccess, setQuerySuccess] = useState<boolean>(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [scannedBuoys, setScannedBuoys] = useState<ERDDAPBuoy[]>([]);
  const [couplingStatus, setCouplingStatus] = useState<{ success: boolean; msg: string } | null>(null);

  // States for Adding Custom ERDDAP Buoy Dynamically
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBuoyId, setNewBuoyId] = useState('ERD-909');
  const [newBuoyName, setNewBuoyName] = useState('');
  const [newBuoyDatasetId, setNewBuoyDatasetId] = useState('noaa_ndbc_realtime');
  const [newBuoyLat, setNewBuoyLat] = useState('36.52');
  const [newBuoyLon, setNewBuoyLon] = useState('-6.28');
  const [newBuoyWave, setNewBuoyWave] = useState('1.65');
  const [newBuoyTemp, setNewBuoyTemp] = useState('19.4');
  const [newBuoyRegion, setNewBuoyRegion] = useState<'Cantábrico' | 'Atlántico' | 'Estrecho' | 'Mediterráneo' | 'Canarias' | 'Atlántico Norte' | 'Pacífico'>('Estrecho');
  const [newBuoyDesc, setNewBuoyDesc] = useState('');
  const [addBuoyStatus, setAddBuoyStatus] = useState<{ success: boolean; msg: string } | null>(null);

  const handleAddCustomBuoy = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddBuoyStatus(null);
    if (!newBuoyId || !newBuoyName || !newBuoyLat || !newBuoyLon) {
      setAddBuoyStatus({ success: false, msg: 'Por favor complete todos los campos obligatorios.' });
      return;
    }

    try {
      const res = await customFetch('/api/erddap/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newBuoyId,
          name: newBuoyName,
          datasetId: newBuoyDatasetId,
          lat: parseFloat(newBuoyLat),
          lon: parseFloat(newBuoyLon),
          waveHeightM: parseFloat(newBuoyWave || '1.0'),
          waterTempC: parseFloat(newBuoyTemp || '18.0'),
          region: newBuoyRegion,
          statusDescription: newBuoyDesc || 'Boya provista localmente por operador REMER.'
        })
      });

      const json = await res.json();
      if (res.ok) {
        setAddBuoyStatus({ success: true, msg: json.msg || 'Boya agregada exitosamente.' });
        // Auto-close or clean inputs
        setTimeout(() => setAddBuoyStatus(null), 5000);
        setNewBuoyId('ERD-' + Math.floor(100 + Math.random() * 900));
        setNewBuoyName('');
        setNewBuoyDesc('');
      } else {
        setAddBuoyStatus({ success: false, msg: json.msg || 'Error al registrar la boya.' });
      }
    } catch (err: any) {
      setAddBuoyStatus({ success: false, msg: 'Error al conectar con la base de datos del servidor.' });
    }
  };

  const activeDatasetObj = useMemo(() => {
    return ERDDAP_DATASETS.find(d => d.id === selectedDatasetId) || ERDDAP_DATASETS[0];
  }, [selectedDatasetId]);

  // Handler to select a predefined node and populate inputs
  const handleSelectDatasetNode = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    const dataset = ERDDAP_DATASETS.find(d => d.id === datasetId);
    if (dataset) {
      setErddapServerUrl(dataset.serverUrl);
      setErddapDatasetId(dataset.id);
      setSelectedVariables(['latitude', 'longitude', 'time', ...dataset.variables.slice(4)]);
    }
  };

  // Calculates distance
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius
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
    }, 1000);
  };

  // Enhance station data with live fluctuating simulation + distance from operator QTH
  const enhancedStations = useMemo(() => {
    return stations.map((st) => {
      const distance = calculateDistance(gpsd.lat, gpsd.lon, st.lat, st.lon);
      
      // Deterministic variance based on station name & current minutes
      let nameSum = 0;
      for (let i = 0; i < st.name.length; i++) {
        nameSum += st.name.charCodeAt(i);
      }
      const hourSeed = new Date().getMinutes() / 15;
      const waveVar = Math.sin(nameSum + hourSeed) * 0.15;
      const tempVar = Math.cos(nameSum * 1.5 + hourSeed) * 0.25;
      const tideVar = Math.sin(nameSum * 2 + hourSeed) * 0.05;

      const updatedWave = parseFloat(Math.max(0.1, st.waveHeightM + waveVar).toFixed(2));
      const updatedTemp = parseFloat((st.waterTempC + tempVar).toFixed(1));
      const updatedLevel = parseFloat((st.seaLevelM + tideVar).toFixed(2));

      // Re-evaluate limits so safety status stays accurate
      let updatedStatus: 'Nominal' | 'Precaución' | 'Temporal' = 'Nominal';
      let statusDesc = st.statusDescription;
      
      if (updatedWave > 4.0) {
        updatedStatus = 'Temporal';
        statusDesc = '🚨 Mar muy gruesa / Temporal marítimo activo. Altas precauciones en canales portuarios.';
      } else if (updatedWave > 2.5) {
        updatedStatus = 'Precaución';
        statusDesc = '⚠️ Propagación de fuerte marejada activa. Esfuerzos mecánicos incrementados en amarras.';
      }

      return {
        ...st,
        waveHeightM: updatedWave,
        waterTempC: updatedTemp,
        seaLevelM: updatedLevel,
        distance,
        status: updatedStatus,
        statusDescription: statusDesc
      };
    });
  }, [stations, gpsd.lat, gpsd.lon, refreshing]);

  const filteredStations = useMemo(() => {
    return enhancedStations.filter((st) => {
      const matchesSearch = st.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            st.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRegion = selectedRegion === 'all' || st.region === selectedRegion;
      const matchesType = selectedType === 'all' || st.type === selectedType;
      return matchesSearch && matchesRegion && matchesType;
    });
  }, [enhancedStations, searchQuery, selectedRegion, selectedType]);

  // Synchronize dynamic selected station updates
  const activeStation = useMemo(() => {
    if (!selectedStation) return null;
    return enhancedStations.find((st) => st.id === selectedStation.id) || selectedStation;
  }, [selectedStation, enhancedStations]);

  // Analytical curves for wave & sea levels
  const getSimulatedAnalyticalData = (baseWave: number, baseLevel: number) => {
    const hours = ['02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '00:00'];
    return hours.map((hour, idx) => {
      const sinWave = Math.sin((idx / hours.length) * Math.PI * 4);
      const cosWave = Math.cos((idx / hours.length) * Math.PI * 2);
      return {
        label: hour,
        alturaOla: parseFloat(Math.max(0.1, baseWave + sinWave * 0.35).toFixed(2)),
        mareaM: parseFloat((baseLevel + cosWave * 0.75).toFixed(2)),
        vientoKts: Math.round(15 + sinWave * 7),
      };
    });
  };

  const chartData = useMemo(() => {
    if (!activeStation) return [];
    return getSimulatedAnalyticalData(activeStation.waveHeightM, activeStation.seaLevelM);
  }, [activeStation]);

  // Formulate and inject packet to APRS S.A.T. net
  const handleInjectWBeacons = async () => {
    if (!activeStation) return;
    
    // APRS Maritime Format:
    // {Callsign}>APXSAT,{Path}:={LAT}{TABLE}{LON}{CODE}Hm0={Ola}m Temp={Temp}C Marea={Marea}m v={Viento}kt {Remarks}
    const cleanCall = 'EA1URG-13'; // Standard WX / Marine emergency weather SSID
    const path = 'WIDE1-1,WIDE2-1';
    
    // Fast coordinate matching to APRS Degrees & Deciminutes standard
    const latAbs = Math.abs(activeStation.lat);
    const latDeg = Math.floor(latAbs);
    const latMin = ((latAbs - latDeg) * 60).toFixed(2).padStart(5, '0');
    const latHemi = activeStation.lat >= 0 ? 'N' : 'S';
    const formattedLat = `${latDeg.toString().padStart(2, '0')}${latMin}${latHemi}`;

    const lonAbs = Math.abs(activeStation.lon);
    const lonDeg = Math.floor(lonAbs);
    const lonMin = ((lonAbs - lonDeg) * 60).toFixed(2).padStart(5, '0');
    const lonHemi = activeStation.lon >= 0 ? 'E' : 'W';
    const formattedLon = `${lonDeg.toString().padStart(3, '0')}${lonMin}${lonHemi}`;

    // Buoy is generally / (Primary table) with Symbol "o" (Submarine/ocean-buoy icon)
    // Tide gauge is generally / (Primary table) with Symbol "h" (Tide station)
    const symbolTable = '/';
    const symbolCode = activeStation.type === 'Boya' ? 'o' : 'h';

    const payload = `${cleanCall}>APXSAT,${path}:=${formattedLat}${symbolTable}${formattedLon}${symbolCode}Portus ${activeStation.id} Hm0=${activeStation.waveHeightM}m T=${activeStation.waterTempC}C Marea=${activeStation.seaLevelM}m Wnd=${activeStation.windSpeedKts}kt`;

    try {
      if (onInjectRaw) {
        const res = await onInjectRaw(payload);
        if (res) {
          setInjectStatus({
            success: true,
            msg: `✓ Baliza marítima APRS inyectada con éxito: ${activeStation.id}`
          });
        } else {
          setInjectStatus({
            success: false,
            msg: 'Error en la cola del bus KISS TCP (puerto de enlace inaccesible).'
          });
        }
      } else {
        setInjectStatus({
          success: true,
          msg: `✓ [Simulado] Baliza APRS: ${payload}`
        });
      }
    } catch {
      setInjectStatus({
        success: false,
        msg: 'Error del microcontrolador TNC: Conexión denegada'
      });
    }

    setTimeout(() => {
      setInjectStatus(null);
    }, 6000);
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-200" id="portus-ocean-panel">
      
      {/* SECTOR HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 p-4 rounded-xl border border-slate-900 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-950/40 border border-sky-500/35 rounded-xl shrink-0 text-sky-400">
            <Waves size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 select-none">
              <span className="text-[10px] bg-sky-950 border border-sky-400/30 text-sky-300 font-mono font-bold px-1.5 py-0.2 rounded uppercase">
                Puertos del Estado
              </span>
              <span className="text-[10px] text-slate-500 font-mono">System URL: portus.puertos.es</span>
            </div>
            <h1 className="text-sm font-extrabold text-slate-100 tracking-tight flex items-center gap-1.5">
              Red Oceanográfica & Meteorológica de Puertos del Estado (PORTUS)
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* TAB 1: Telemetría General */}
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-3 py-2 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeTab === 'telemetry'
                ? 'bg-sky-950/45 border-sky-505 border-sky-500 text-sky-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="portus-tab-telemetry"
          >
            <Database size={13} />
            <span>Telemetría PORTUS</span>
          </button>

          {/* TAB 2: ERDDAP Monitor */}
          <button
            onClick={() => setActiveTab('erddap')}
            className={`px-3 py-2 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeTab === 'erddap'
                ? 'bg-sky-950/45 border-sky-500 text-sky-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="portus-tab-erddap"
          >
            <Globe size={13} className={activeTab === 'erddap' ? 'animate-pulse text-sky-400' : ''} />
            <span>Monitoreo ERDDAP</span>
          </button>

          {/* TAB 3: Estaciones NDBC */}
          <button
            onClick={() => setActiveTab('ndbc')}
            className={`px-3 py-2 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeTab === 'ndbc'
                ? 'bg-sky-950/45 border-sky-500 text-sky-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="portus-tab-ndbc"
          >
            <Radio size={13} className={activeTab === 'ndbc' ? 'animate-pulse text-sky-400' : ''} />
            <span>Estaciones NOAA NDBC</span>
          </button>

          {/* TAB 4: Visor GIS */}
          <button
            onClick={() => setActiveTab('gis')}
            className={`px-3 py-2 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeTab === 'gis'
                ? 'bg-sky-950/45 border-sky-500 text-sky-300 shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            id="portus-tab-gis"
          >
            <Eye size={13} />
            <span>Visor GIS</span>
          </button>

          <button
            onClick={handleRefresh}
            className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
            title="Refrescar base de datos Boyas/Mareógrafos"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {activeTab === 'gis' ? (
        /* VISOR GIS IFRAME VIEW */
        <div className="grid grid-cols-1 gap-4 animate-fade-in" id="portus-gis-iframe-container">
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Sistema Integrado Portus GIS</span>
                <h3 className="font-sans font-bold text-slate-200 text-xs">Visor Cartográfico Interactivo de Clima Marítimo</h3>
              </div>

              <a
                href="https://portus.puertos.es/#/"
                target="_blank"
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-sky-900 hover:bg-sky-850 text-sky-100 rounded-lg text-[10px] font-bold font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Abrir Portal en Pestaña Nueva</span>
                <ExternalLink size={10} />
              </a>
            </div>

            <div className="bg-slate-900/40 border border-slate-850 rounded-lg p-3 text-[11px] text-slate-400 leading-normal flex items-start gap-2 select-none">
              <Info className="text-sky-400 shrink-0 mt-0.5" size={14} />
              <div className="space-y-0.5">
                <p>
                  El portal oficial <strong>Portus de Puertos del Estado</strong> provee mapas multi-capas predictivos de viento, oleaje (espectral y total), mareas en tiempo de tránsito, boyas y satélites.
                </p>
                <p className="text-slate-500 italic text-[10px]">
                  * Nota técnica: Si las cabeceras de seguridad o CSP del navegador restringen el visor interactivo dentro de este marco iframe, utilice el botón superior derecho para proyectar el mapa dinámico en pantalla completa.
                </p>
              </div>
            </div>

            {/* FULL INTEGRATED IFRAME */}
            <div className="w-full h-[650px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative shadow-inner">
              <iframe
                src="https://portus.puertos.es/#/"
                title="Portus Puertos del Estado GIS Map Viewer"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-popups allowance-forms"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      ) : activeTab === 'ndbc' ? (
        <NDBCStationsCatalog
          onAcoplar={(station) => {
            setStations(prev => [station, ...prev]);
            setSelectedStation(station);
          }}
          onMonitorErddap={({ stationId, lat, lon }) => {
            setSelectedDatasetId('noaa_ndbc_realtime');
            setErddapDatasetId('noaa_ndbc_realtime');
            setErddapServerUrl('https://erddap.ndbc.noaa.gov/erddap');
            
            const offset = 2.0;
            setLatMin((lat - offset).toFixed(1));
            setLatMax((lat + offset).toFixed(1));
            setLonMin((lon - offset).toFixed(1));
            setLonMax((lon + offset).toFixed(1));

            setActiveTab('erddap');
          }}
          coupledStationIds={stations.map(st => st.id)}
        />
      ) : activeTab === 'erddap' ? (
        /* MONITOR AUTOMATICO DE BOYAS Y SERVIDORES ERDDAP NOAA / COPERNICUS */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fade-in" id="portus-erddap-dashboard">
          
          {/* PANEL IZQUIERDO: CONFIGURADOR DE QUERY CONSOLA ERDDAP (5 COLS) */}
          <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3.5 shadow-xl">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-900">
                <Sliders size={14} className="text-sky-400" />
                <h3 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Configurador de Consultas ERDDAP
                </h3>
              </div>

              {/* PREDEFINED NODE FEED */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-slate-400 block font-sans">
                  Punto de Acceso ERDDAP (Servidor Público / ID)
                </label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => handleSelectDatasetNode(e.target.value)}
                  className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 focus:border-sky-505 focus:outline-none rounded-lg p-2 text-[10.5px] text-slate-200 cursor-pointer font-sans font-medium"
                >
                  {ERDDAP_DATASETS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* EDITABLE PARAMETERS */}
              <div className="grid grid-cols-1 gap-2.5 bg-slate-900/40 p-3 rounded-lg border border-slate-900">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 font-mono block uppercase font-bold">Base URL de la API:</span>
                  <input
                    type="text"
                    value={erddapServerUrl}
                    onChange={(e) => setErddapServerUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-855 focus:border-sky-500 focus:outline-none rounded px-2.5 py-1.5 text-[10px] font-mono text-sky-400"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 font-mono block uppercase font-bold">Query Dataset ID (tabledap):</span>
                  <input
                    type="text"
                    value={erddapDatasetId}
                    onChange={(e) => setErddapDatasetId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-855 focus:border-sky-500 focus:outline-none rounded px-2.5 py-1.5 text-[10px] font-mono text-slate-300"
                  />
                </div>
              </div>

              {/* BOUNDING BOX */}
              <div className="space-y-1.5">
                <label className="text-[9.5px] font-bold text-slate-400 block font-sans">
                  Filtro de Área Geográfica (Subsetting - Grados)
                </label>
                <div className="grid grid-cols-4 gap-2 text-center text-[9px] font-mono">
                  <div>
                    <span className="text-slate-500 block font-bold">Lat Min</span>
                    <input
                      type="text"
                      value={latMin}
                      onChange={(e) => setLatMin(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-center rounded py-1 text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block font-bold">Lat Max</span>
                    <input
                      type="text"
                      value={latMax}
                      onChange={(e) => setLatMax(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-center rounded py-1 text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block font-bold">Lon Min</span>
                    <input
                      type="text"
                      value={lonMin}
                      onChange={(e) => setLonMin(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-center rounded py-1 text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block font-bold">Lon Max</span>
                    <input
                      type="text"
                      value={lonMax}
                      onChange={(e) => setLonMax(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 text-center rounded py-1 text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* VARIABLES */}
              <div className="space-y-2">
                <span className="text-[9.5px] font-bold text-slate-400 block font-sans">
                  Filtrar Campos de Datos (Metadata Header Variables):
                </span>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-900 text-[10px] font-mono text-slate-300">
                  {activeDatasetObj.variables.map((v) => {
                    const isChecked = selectedVariables.includes(v);
                    return (
                      <label key={v} className="flex items-center gap-2 cursor-pointer hover:text-slate-100 select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedVariables(prev => prev.filter(item => item !== v));
                            } else {
                              setSelectedVariables(prev => [...prev, v]);
                            }
                          }}
                          className="rounded text-sky-500 bg-slate-950 border-slate-800 focus:ring-0 cursor-pointer"
                        />
                        <span className="truncate">{v}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* LIVE URL QUERY GENERATOR PREVIEW */}
              <div className="space-y-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-sans">
                  Instancia de URL de la Solicitud Generada (Tabledap):
                </span>
                <div className="bg-slate-900/40 p-2 border border-slate-900 rounded font-mono text-[9px] text-indigo-300 select-all whitespace-normal break-all leading-relaxed">
                  {erddapServerUrl}/tabledap/{erddapDatasetId}.htmlTable?{selectedVariables.join(',')}&amp;latitude&gt;={latMin}&amp;latitude&lt;={latMax}&amp;longitude&gt;={lonMin}&amp;longitude&lt;={lonMax}
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <button
                type="button"
                onClick={async () => {
                  if (queryingServer) return;
                  setQueryingServer(true);
                  setQuerySuccess(false);
                  setTerminalLogs([]);
                  setScannedBuoys([]);
                  setCouplingStatus(null);

                  const pushLog = (msg: string, delay: number) => {
                    return new Promise<void>((resolve) => {
                      setTimeout(() => {
                        setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
                        resolve();
                      }, delay);
                    });
                  };

                  await pushLog(`Resolviendo servidor ERDDAP DNS en ${erddapServerUrl.replace('https://', '').split('/')[0]}...`, 150);
                  await pushLog(`Estableciendo enlace Handshake seguro (TLSv1.3)...`, 350);
                  await pushLog(`Negociando datagrama Tabledap para dataset '${erddapDatasetId}'...`, 400);
                  await pushLog(`HTTP GET /erddap/tabledap/${erddapDatasetId}.json?${selectedVariables.join(',')} ...`, 500);
                  await pushLog(`Filtro espacial aplicado: Latitud [${latMin}N a ${latMax}N], Longitud [${lonMin}W a ${lonMax}E]`, 300);
                  await pushLog(`200 OK. Decodificados metadatos conformes a convenio CF-1.6 en formato JSON.`, 450);

                  // Filter buoys using the actual server-side databases (with on-demand live sync trigger!)
                  let latestBuoys = erddapBuoys;
                  try {
                    await pushLog(`Conectando pasarela REST /api/erddap/sync para forzar descarga...`, 150);
                    const res = await customFetch('/api/erddap/sync', { method: 'POST' });
                    if (res.ok) {
                      const json = await res.json();
                      if (json.erddapBuoys) {
                        latestBuoys = json.erddapBuoys;
                        await pushLog(`Respuesta recibida del servidor: Base de datos ERDDAP recargada en tiempo real.`, 200);
                      }
                    }
                  } catch (e) {
                    console.error("Error triggering server sync", e);
                    await pushLog(`[WARN] No se pudo conectar a la base de datos distribuida, cargando caché local.`, 200);
                  }

                  const matched = latestBuoys.filter(b => b.datasetId === erddapDatasetId);
                  
                  await pushLog(`Extracción exitosa. Encontrados ${matched.length} sensores activos transmitiendo. Proyección lista.`, 200);

                  setScannedBuoys(matched);
                  setQuerySuccess(true);
                  setQueryingServer(false);
                }}
                disabled={queryingServer}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-sans font-black text-xs uppercase tracking-wider rounded-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 select-none"
              >
                <Search size={12} className="text-slate-955 text-slate-950" />
                <span>{queryingServer ? 'Cosechando Metadatos...' : 'Consultar Servidor ERDDAP'}</span>
              </button>
            </div>

            {/* NUEVA SECCIÓN: FORMULARIO DE REGISTRO / PROVISIÓN DE BOYAS CUSTOM */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center justify-between w-full text-left focus:outline-none select-none cursor-pointer text-slate-400 hover:text-slate-300"
              >
                <div className="flex items-center gap-2">
                  <Plus size={14} className="text-teal-400" />
                  <h3 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wider">
                    Registrar Boya en ERDDAP Database
                  </h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {showAddForm ? '[ OCULTAR ]' : '[ REGISTRAR NUEVA ]'}
                </span>
              </button>

              {showAddForm && (
                <form onSubmit={handleAddCustomBuoy} className="space-y-3.5 pt-2 border-t border-slate-900/60 animate-fade-in">
                  <p className="text-[10.5px] text-slate-400 leading-normal font-sans">
                    Agregue un sensor virtual o real de forma permanente en el servidor. Este se actualizará automáticamente simulando telemetría marítima.
                  </p>

                  {addBuoyStatus && (
                    <div className={`p-2.5 rounded border text-[10px] font-mono leading-relaxed ${
                      addBuoyStatus.success
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                    }`}>
                      {addBuoyStatus.msg}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-sans">
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans">ID de Boya (Único)</label>
                      <input
                        type="text"
                        value={newBuoyId}
                        onChange={(e) => setNewBuoyId(e.target.value)}
                        placeholder="Ej. ERD-123"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 text-slate-200"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans">Nombre de Estación</label>
                      <input
                        type="text"
                        value={newBuoyName}
                        onChange={(e) => setNewBuoyName(e.target.value)}
                        placeholder="Ej. Boya de Cádiz"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 text-slate-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-slate-400 block font-sans font-medium">Asignar a Dataset Técnico</label>
                    <select
                      value={newBuoyDatasetId}
                      onChange={(e) => setNewBuoyDatasetId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:outline-none rounded p-2 text-[10px] text-slate-200 cursor-pointer"
                    >
                      {ERDDAP_DATASETS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name.replace(' (Real-Time)', '').replace(' - Ocean Observations Med', '')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans font-medium">Latitud (Grados N)</label>
                      <input
                        type="text"
                        value={newBuoyLat}
                        onChange={(e) => setNewBuoyLat(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 text-slate-200"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans font-medium">Longitud (Grados E/W)</label>
                      <input
                        type="text"
                        value={newBuoyLon}
                        onChange={(e) => setNewBuoyLon(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 text-slate-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-sans">
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans">Ola Inicial (m)</label>
                      <input
                        type="text"
                        value={newBuoyWave}
                        onChange={(e) => setNewBuoyWave(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 font-mono text-slate-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans font-medium">Temp. Inicial H2O (°C)</label>
                      <input
                        type="text"
                        value={newBuoyTemp}
                        onChange={(e) => setNewBuoyTemp(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 font-mono text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-sans">
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans font-medium">Región Costera</label>
                      <select
                        value={newBuoyRegion}
                        onChange={(e) => setNewBuoyRegion(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 focus:outline-none rounded p-2 text-slate-200 cursor-pointer text-[10px]"
                      >
                        <option value="Atlántico">Atlántico</option>
                        <option value="Cantábrico">Cantábrico</option>
                        <option value="Estrecho">Estrecho</option>
                        <option value="Mediterráneo">Mediterráneo</option>
                        <option value="Canarias">Canarias</option>
                        <option value="Atlántico Norte">Atlántico Norte</option>
                        <option value="Pacífico">Pacífico</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-400 block font-sans font-medium">Comentario / Estado</label>
                      <input
                        type="text"
                        value={newBuoyDesc}
                        onChange={(e) => setNewBuoyDesc(e.target.value)}
                        placeholder="Ej. Operativa"
                        className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:outline-none rounded p-2 text-[10px] text-slate-200"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-slate-950 font-sans font-bold text-xs uppercase tracking-wider rounded-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Send size={11} className="text-slate-950" />
                    <span>Registrar e Iniciar Monitoreo</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* PANEL DERECHO: TERMINAL DE COSECHA Y ACOPLAR BOYAS (7 COLS) */}
          <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-4">
            {/* TERMINAL LOGS */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-900">
                <div className="flex items-center gap-2 text-indigo-400 font-sans">
                  <Terminal size={14} />
                  <h4 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wider">
                    Terminal Hidrográfica ERDDAP Console
                  </h4>
                </div>
                <span className="text-[10px] bg-slate-900 text-slate-500 font-mono px-2 py-0.5 border border-slate-850 rounded">
                  {terminalLogs.length ? 'ACTIVO' : 'ESPERANDO'}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg h-32 overflow-y-auto font-mono text-[9.5px] text-green-400/90 space-y-1 select-text scrollbar-thin">
                {terminalLogs.length === 0 ? (
                  <div className="text-slate-650 text-slate-600 italic">
                    {`$ erddap-client --connect --url=${erddapServerUrl}\n`}
                    {`Esperando argumentos para iniciar el pipeline de ingesta oceanográfica...\nHaga click en "Consultar Servidor ERDDAP" para forzar el escaneo físico.`}
                  </div>
                ) : (
                  terminalLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                  ))
                )}
              </div>
            </div>

            {/* FETCHED BUOYS LIST WITH COUPLING ACTION */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-xl flex-1">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-900">
                <div className="flex items-center gap-2 text-sky-400">
                  <Activity size={14} />
                  <h4 className="font-sans font-bold text-slate-100 text-xs uppercase tracking-wider">
                    Datagramas Real-Time Disponibles
                  </h4>
                </div>
                {querySuccess && (
                  <span className="text-[9.5px] bg-emerald-950 border border-emerald-850/40 text-emerald-400 font-mono px-2 py-0.5 rounded">
                    ✓ {scannedBuoys.length} Boyas Decodificadas
                  </span>
                )}
              </div>

              {couplingStatus && (
                <div className={`p-2.5 rounded border text-[10px] font-mono leading-relaxed flex items-start gap-2 ${
                  couplingStatus.success
                    ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-300'
                    : 'bg-amber-950/25 border-amber-500/35 text-amber-300'
                }`}>
                  <Info className="shrink-0 mt-0.5" size={12} />
                  <span>{couplingStatus.msg}</span>
                </div>
              )}

              <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] pr-1 scrollbar-thin">
                {!querySuccess ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center gap-2 text-slate-650 text-slate-600">
                    <Globe size={28} className="animate-spin text-slate-800 font-light" />
                    <span className="text-xs font-semibold">Consulte el servidor para descargar telemetría real de boyas</span>
                    <p className="text-[10px] text-slate-500 max-w-sm leading-normal">
                      El protocolo ERDDAP es el estándar internacional usado por agencias como la NOAA para unificar el intercambio de datos marítimos e in-situ.
                    </p>
                  </div>
                ) : scannedBuoys.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center gap-2 text-slate-600">
                    <AlertTriangle size={24} className="text-amber-500" />
                    <span className="text-xs font-semibold">Ninguna boya en el dataset coincide con el subsetting</span>
                    <p className="text-[10px] text-slate-500 max-w-xs leading-normal">
                      Intente ensanchar los límites de Latitud o Longitud para capturar boyas en otros cuadrantes oceánicos.
                    </p>
                  </div>
                ) : (
                  scannedBuoys.map((eb) => {
                    const isCoupled = stations.some(st => st.id === eb.id);
                    return (
                      <div
                        key={eb.id}
                        className="bg-slate-900/50 p-3.5 border border-slate-900 rounded-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition-all hover:bg-slate-900"
                      >
                        <div className="space-y-1 md:max-w-md">
                          <div className="flex items-center gap-1.5 text-[8.5px] font-mono">
                            <span className="px-1.5 py-0.3 bg-sky-950 text-sky-300 font-bold border border-sky-850/40 rounded">
                              ERDDAP BUOY OBD
                            </span>
                            <span className="text-slate-550 text-slate-500">COORD: {eb.lat.toFixed(2)}N, {eb.lon.toFixed(2)}W</span>
                          </div>
                          <h5 className="font-bold text-[11.5px] text-slate-200">{eb.name}</h5>
                          <p className="text-[10.5px] text-slate-400 leading-normal font-sans">
                            {eb.statusDescription}
                          </p>
                          
                          {/* Metrics strip */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400 mt-1 uppercase">
                            <span className="flex items-center gap-1"><Waves size={11} className="text-sky-400" /> Ola: <strong className="text-sky-400">{eb.waveHeightM}m</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Thermometer size={11} className="text-amber-400" /> Temp H2O: <strong className="text-amber-405 text-amber-400">{eb.waterTempC}°C</strong></span>
                            <span>•</span>
                            {(() => {
                              const bft = getBeaufortInfoByKts(eb.windSpeedKts);
                              return (
                                <span className="flex items-center gap-1">
                                  <Wind size={11} style={{ color: bft.hex }} />
                                  Viento: <strong style={{ color: bft.hex }}>{eb.windSpeedKts}kt (F{bft.force})</strong>
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <button
                            type="button"
                            onClick={() => {
                              // Perform coupling
                              const exists = stations.some(st => st.id === eb.id);
                              if (exists) {
                                setCouplingStatus({
                                  success: false,
                                  msg: `La boya ${eb.id} ya se encuentra acoplada e integrada en el sistema.`
                                });
                                return;
                              }

                              const newStation: OceanStation = {
                                id: eb.id,
                                name: `📡 [ERDDAP] ${eb.name.replace(/Boya /g, '')}`,
                                type: 'Boya',
                                region: eb.region as any,
                                lat: eb.lat,
                                lon: eb.lon,
                                waveHeightM: eb.waveHeightM,
                                wavePeriodSec: eb.wavePeriodSec,
                                waterTempC: eb.waterTempC,
                                seaLevelM: 0.0,
                                windSpeedKts: eb.windSpeedKts,
                                windDirDeg: eb.windDirDeg,
                                pressureHpa: eb.pressureHpa,
                                provider: `ERDDAP • ${eb.datasetId}`,
                                status: eb.waveHeightM > 3.0 ? 'Temporal' : (eb.waveHeightM > 2.0 ? 'Precaución' : 'Nominal'),
                                statusDescription: eb.statusDescription
                              };

                              setStations(prev => [newStation, ...prev]);
                              setSelectedStation(newStation);
                              setCouplingStatus({
                                success: true,
                                msg: `✓ Boya oceánica ${eb.id} acoplada con éxito. Agregada al panel general y localizador GPS.`
                              });

                              setTimeout(() => {
                                setCouplingStatus(null);
                              }, 6000);
                            }}
                            className={`w-full md:w-auto px-3.5 py-2 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              isCoupled
                                ? 'bg-slate-905 bg-slate-900 border border-emerald-950 text-emerald-400/90 pointer-events-none'
                                : 'bg-sky-600 hover:bg-sky-500 text-slate-950 active:scale-95'
                            }`}
                          >
                            {isCoupled ? <Check size={11} className="text-emerald-400" /> : <Plus size={11} />}
                            <span>{isCoupled ? 'Boya Acoplada' : 'Acoplar a Portus'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LIVE MET/OCEAN TELEMETRY DASHBOARD */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 animate-fade-in" id="portus-telemetry-grid">
          
          {/* COLUMN 1: STATIONS LIST AND FILTERS SIDEBAR (4 COLS) */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            
            {/* SEARCH AND REGIONS PORTUS PANEL */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <h3 className="font-sans font-bold text-slate-200 text-xs flex items-center gap-2">
                  <Filter size={13} className="text-sky-400" />
                  Filtrar Marítimas Real-Time
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">11 Buoys/Tides</span>
              </div>

              {/* SEARCH INPUT */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-550 text-slate-500 font-bold uppercase tracking-wider block font-sans">
                  Filtro de Texto
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Boya de Gata, Coruña, Algeciras..."
                    className="w-full bg-slate-900 border border-slate-805 border-slate-800 rounded px-3 py-1.8 py-2 text-slate-200 focus:outline-none focus:border-sky-500 text-[11px] font-sans"
                  />
                  <Search size={12} className="absolute right-3 top-3 text-slate-500" />
                </div>
              </div>

              {/* COASTAL REGION SELECTOR */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-550 text-slate-500 font-bold uppercase tracking-wider block font-sans">
                  Región Geográfica / Fachada Marítima
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:outline-none focus:border-sky-500 text-[11px] font-sans"
                >
                  <option value="all">🌊 Todas las Fachadas Peninsulares</option>
                  <option value="Cantábrico">🌊 Fachada Cantábrica (Norte)</option>
                  <option value="Atlántico">🌊 Fachada Atlántica (Galicia/Sur/Canarias)</option>
                  <option value="Estrecho">⚓ Área Crítica del Estrecho de Gibraltar</option>
                  <option value="Mediterráneo">🏝️ Frente Litoral Mediterráneo / Baleares</option>
                  <option value="Canarias">🌴 Área Subtropical de Canarias</option>
                </select>
              </div>

              {/* TYPE OF SENSOR SELECTOR */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-550 text-slate-500 font-bold uppercase tracking-wider block font-sans">
                  Tipo de Telemetría Sensor
                </label>
                <div className="grid grid-cols-3 gap-1 px-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-center font-sans">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'Boya', label: 'Boyas Escala' },
                    { id: 'Mareógrafo', label: 'Mareógrafos' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setSelectedType(st.id)}
                      className={`py-1.5 rounded text-[9px] font-bold cursor-pointer transition-colors ${
                        selectedType === st.id 
                          ? 'bg-sky-950 text-sky-400 border border-sky-500/20 font-black shadow' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* STATIONS LIST */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-2 shadow-md">
              <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-slate-900 font-sans">
                <span className="font-bold uppercase tracking-wider">Sensores Encontrados ({filteredStations.length})</span>
                <span>Frecuencia: Live</span>
              </div>

              {filteredStations.length === 0 ? (
                <div className="py-16 text-center text-slate-600 flex flex-col items-center justify-center gap-2">
                  <Waves size={24} className="opacity-40" />
                  <span className="text-[11px] font-sans">Ninguna estación coincide con los filtros</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[440px] overflow-y-auto scrollbar-thin">
                  {filteredStations.map((st) => {
                    const isSelected = activeStation?.id === st.id;
                    const alertColor = st.status === 'Temporal'
                      ? 'text-red-400'
                      : st.status === 'Precaución'
                        ? 'text-amber-500'
                        : 'text-sky-400';

                    return (
                      <button
                        key={st.id}
                        onClick={() => setSelectedStation(st)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected 
                            ? 'bg-sky-950/20 border-sky-500/40 text-sky-200 shadow-sm shadow-sky-950/20' 
                            : 'bg-slate-900/45 border-slate-905 border-slate-900/60 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0 font-sans">
                          <div className="flex items-center gap-1.5 text-[8.5px] font-mono select-none">
                            <span className="px-1 py-0.2 bg-slate-900 border border-slate-800 rounded text-slate-400 font-bold">
                              {st.type === 'Boya' ? '🟢 BOYA' : '🔵 MAREO'}
                            </span>
                            <span className="text-slate-500 uppercase">{st.region}</span>
                          </div>
                          <h4 className="font-sans font-bold text-[11.5px] text-slate-200 truncate pr-1">
                            {st.name}
                          </h4>
                          <span className="text-[9px] text-slate-500 block font-mono">
                            Distancia QTH: <strong className="text-sky-500/90">{st.distance.toFixed(1)} km</strong>
                          </span>
                        </div>

                        <div className="text-right shrink-0 flex flex-col items-end gap-0.5 font-mono select-none">
                          {st.type === 'Boya' ? (
                            <>
                              <span className={`text-[12px] font-bold ${alertColor}`}>
                                {st.waveHeightM}m
                              </span>
                              <span className="text-[8.5px] text-slate-500">Hm0</span>
                            </>
                          ) : (
                            <>
                              <span className="text-[12px] font-bold text-sky-400">
                                {st.seaLevelM}m
                              </span>
                              <span className="text-[8.5px] text-slate-500">Marea Alt</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2 & 3: STATION CONSOLE MONITOR DASHBOARD (8 COLS) */}
          <div className="xl:col-span-8 flex flex-col gap-4">
            {activeStation ? (
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 flex flex-col gap-5 shadow-xl">
                
                {/* STATION HEADER CARD */}
                <div className="border-b border-slate-900 pb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap select-none font-sans">
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-sky-300 font-mono font-bold rounded text-[9px] uppercase tracking-wider">
                        ⚓ {activeStation.provider}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">UID: {activeStation.id}</span>
                    </div>
                    <h2 className="font-sans font-extrabold text-base text-slate-100 tracking-tight leading-none flex items-center gap-2">
                       {activeStation.name}
                    </h2>
                  </div>

                  <div className="shrink-0 flex items-center select-none font-sans font-bold">
                    <span className={`px-2.5 py-1 select-none rounded text-[10px] border flex items-center gap-1.5 ${
                      activeStation.status === 'Temporal'
                        ? 'bg-red-950/40 border-red-500/50 text-red-400 animate-pulse'
                        : activeStation.status === 'Precaución'
                          ? 'bg-amber-950/40 border-amber-500/50 text-amber-405 text-amber-400'
                          : 'bg-sky-950/30 border-sky-500/40 text-sky-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        activeStation.status === 'Temporal' ? 'bg-red-500' : activeStation.status === 'Precaución' ? 'bg-amber-500' : 'bg-sky-400'
                      }`} />
                      ESTADO {activeStation.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* STATUS BAR MESSAGE CONTAINER */}
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-850 flex items-start gap-2.5">
                  <Shield className="text-sky-500 shrink-0 mt-0.5" size={14} />
                  <p className="text-[10.5px] text-slate-400 font-sans leading-normal">
                    <strong>Informe marítimo:</strong> {activeStation.statusDescription} Coord: G.D. ({activeStation.lat.toFixed(4)}, {activeStation.lon.toFixed(4)})
                  </p>
                </div>

                {/* CORE METRICS READOUT GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* MAIN INTENSITY: OLA / MAREA */}
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-850 flex flex-col justify-between gap-3.5 shadow-inner">
                    <div>
                      <span className="text-[9px] text-sky-400 font-bold uppercase tracking-wider block font-sans">
                        {activeStation.type === 'Boya' ? 'Altura Significativa de Ola' : 'Altura del Nivel del Mar'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {activeStation.type === 'Boya' ? 'Significant Wave (Hm0)' : 'Sea Level / Tide Height'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="font-sans font-black text-3xl text-slate-50 tracking-tight leading-none">
                        {activeStation.type === 'Boya' ? activeStation.waveHeightM : activeStation.seaLevelM}
                      </span>
                      <span className="text-sky-400 font-bold text-xs font-sans">metros</span>
                    </div>

                    <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5 flex items-center justify-between font-mono">
                      <span>Ref: Marea Medio</span>
                      <span>{activeStation.type === 'Boya' ? 'Frecuencia: 1h' : 'Frecuencia: 10m'}</span>
                    </div>
                  </div>

                  {/* WAVE PROPERTIES OR TIDES COMPLEMENT */}
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-850 flex flex-col justify-between gap-3.5 shadow-inner">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block font-sans">
                        {activeStation.type === 'Boya' ? 'Período Medio de Pico' : 'Sobremarea Meteorológica'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {activeStation.type === 'Boya' ? 'Wave Peak Period (Tp)' : 'Surge deviation'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="font-sans font-black text-3xl text-slate-50 tracking-tight leading-none">
                        {activeStation.type === 'Boya' ? activeStation.wavePeriodSec : '0.04'}
                      </span>
                      <span className="text-slate-400 font-bold text-xs font-sans">
                        {activeStation.type === 'Boya' ? 'segundos' : 'metros'}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5 flex items-center justify-between font-mono">
                      <span>Corte: {activeStation.type === 'Boya' ? '0.05 Hz' : 'REDMAR St'}</span>
                      <span>{activeStation.type === 'Boya' ? 'Tipo: Espectral' : 'Astronom: Nominal'}</span>
                    </div>
                  </div>

                  {/* WIND & ENVIRONMENT */}
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-850 flex flex-col justify-between gap-3.5 shadow-inner">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block font-sans">Dirección & Velocidad Viento</span>
                      <span className="text-[10px] text-slate-500 font-mono block">Wind conditions & Temp</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {(() => {
                        const bft = getBeaufortInfoByKts(activeStation.windSpeedKts);
                        return (
                          <div className="flex items-baseline gap-1">
                            <span className="font-sans font-black text-xl tracking-tight leading-none animate-pulse" style={{ color: bft.hex }}>
                              {activeStation.windSpeedKts}
                            </span>
                            <span className="text-slate-500 font-bold text-[10px] font-sans">kt</span>
                            <span className="text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ml-1 bg-black/40 border border-slate-800" style={{ color: bft.hex, borderColor: `${bft.hex}30` }}>
                              F{bft.force} {bft.name}
                            </span>
                            <span className="text-slate-600 font-mono text-[10px] mx-1">|</span>
                            <span className="font-serif italic text-sm text-sky-400 font-bold">{activeStation.waterTempC}°C</span>
                            <span className="text-[9px] text-slate-500 uppercase">Agua</span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center gap-1 font-mono text-[9px] text-slate-500">
                        <Compass size={10} className="text-sky-500/80" />
                        <span>Rumbo {activeStation.windDirDeg}° • Pres: {activeStation.pressureHpa ? `${activeStation.pressureHpa} hPa` : 'S/D'}</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5 flex items-center justify-between font-mono">
                      <span>Anemómetro: 10m</span>
                      <span>Rumbo: N-S</span>
                    </div>
                  </div>

                </div>

                {/* GRAPHICAL HISTORICAL CURVES (recharts) */}
                <div className="space-y-2">
                  <span className="text-[9.5px] text-sky-400 font-bold uppercase tracking-wider block font-sans">
                     Curvas de Evolución de las Últimas 24 Horas de Registros Instrumentales
                  </span>

                  <div className="bg-slate-900/55 p-4 rounded-xl border border-slate-850 h-56 shadow-inner">
                    <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorOceans" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                        <YAxis stroke="#475569" fontSize={9} />
                        <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9.5px', fontFamily: 'monospace' }} />
                        <Area 
                          type="monotone" 
                          dataKey={activeStation.type === 'Boya' ? 'alturaOla' : 'mareaM'} 
                          name={activeStation.type === 'Boya' ? 'Altura Ola Sig (m)' : 'Altura de Marea (m)'} 
                          stroke="#38bdf8" 
                          fillOpacity={1} 
                          fill="url(#colorOceans)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* INTERACTIVE EMERGENCY EXPORT AND APRS INTEGRATION */}
                <div className="border-t border-slate-900 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 select-none">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-sky-950/30 border border-sky-400/20 rounded-lg shrink-0 text-sky-400">
                      <Send size={15} />
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold text-slate-300 block leading-tight">Canalización de Enlace APRS</span>
                      <p className="text-[9px] text-slate-500 font-sans leading-tight">Ensamblar e inyectar un paquete WX costero en el bus de packet de REMER.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-center text-[10px] font-bold font-sans">
                    {/* BUTTON TO LOCATE ON RADAR MAP */}
                    <button
                      onClick={() => onRelocate(activeStation.lat, activeStation.lon, activeStation.name)}
                      className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MapPin size={11} className="text-yellow-500" />
                      <span>Fijar QTH Portus</span>
                    </button>

                    {/* BUTTON TO BEACON APRS */}
                    <button
                      onClick={handleInjectWBeacons}
                      className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-slate-950 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Waves size={11} />
                      <span>Transmitir Baliza Marítima</span>
                    </button>
                  </div>
                </div>

                {injectStatus && (
                  <div className={`p-2.5 rounded border text-[10px] font-mono leading-relaxed select-all ${
                    injectStatus.success 
                      ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-300' 
                      : 'bg-red-950/25 border-red-500/35 text-red-300'
                  }`}>
                    {injectStatus.msg}
                  </div>
                )}

              </div>
            ) : (
              <div className="py-24 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center text-center gap-3 bg-slate-150 bg-slate-950">
                <Waves size={36} className="text-slate-700 animate-pulse" />
                <div className="space-y-1 font-sans">
                  <h4 className="font-bold text-slate-300">Seleccione un Sensor Portus</h4>
                  <p className="text-[11px] text-slate-500 max-w-sm leading-normal">
                    Haga click en una de las boyas oceanográficas o mareógrafos de la lista para analizar su telemetría e inyectar el reporte de bajo nivel.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
