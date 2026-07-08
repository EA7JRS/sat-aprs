/**
 * TYPES FOR APRS S.A.T. NUC EMER CONSOLE
 * Civil Protection Emergency & Radiocommunication Console
 * Expanded with: AIS (aiscatcher) & Pat (AX.25 Winlink)
 */

export interface GPSDStatus {
  lat: number;
  lon: number;
  alt: number;
  mode: number; // 0=No/unknown, 1=No fix, 2=2D, 3=3D
  speedKmh: number;
  satellitesUsed: number;
  satellitesVisible: number;
  time: string;
  isFallback: boolean;
  device: string;
}

export interface NTPSECStatus {
  stratum: number;
  offsetMs: number;
  delayMs: number;
  jitterMs: number;
  peer: string;
  status: 'synchronized' | 'unsynchronized' | 'hold';
}

export interface ForecastDay {
  date: string;
  tempMin: number;
  tempMax: number;
  humidityPct: number;
  windSpeedKts: number;
  windDirDeg: number;
  description: string;
  icon: string;
  pop: number; // Probability of precipitation (0.0 to 1.0)
}

export interface WeatherTelemetry {
  tempC: number;
  humidityPct: number;
  windSpeedKts: number;
  windDirDeg: number;
  gustKts: number;
  pressureHpa: number;
  rain1hIn: number;
  rain24hIn: number;
  time: string;
  rawAprsWx: string;
  forecast?: ForecastDay[];
}

export interface EarthquakeEvent {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  depthKm: number;
  magnitud: number;
  magType: string;
  localizacion: string; // IGN spanish localization
  distanciaKm: number; // calculated using Haversine
  enRango: boolean; // within configured filter radius (e.g., 200 km)
  aprsPacket?: string; // Formatted APRS Object
}

export interface NoaaSpaceAlert {
  id: string;
  issueTime: string;
  scaleType: 'G' | 'R' | 'S'; // G=Geomagnetic, R=Radio Blackout, S=Solar Radiation
  nivel: number; // 0 to 5
  descripcion: string;
  frecuenciasAfectadas: string;
  aprsPacket: string; // Formatted APRS Bulletin
}

// NEW: AIS Vessel Report (from aiscatcher / Comar SLR200G)
export interface AISVessel {
  mmsi: number;
  shipName: string;
  type: string; // Cargo, Passenger, High Speed, Tanker, Fishing, etc.
  latitude: number;
  longitude: number;
  speedKnots: number;
  headingDeg: number;
  destination: string;
  status: string; // Underway, Anchored, Moored, etc.
  lastReport: string;
  distanciaKm: number;
  enRango: boolean;
  aprsPacket?: string; // Formatted APRS marine report (Symbol: /s or ship)
}

// NEW: Pat Winlink / AX.25 status
export interface PatWinlinkStatus {
  connected: boolean;
  lastSync: string;
  outboxCount: number;
  inboxCount: number;
  ax25Port: string; // e.g., wl2k (VHF)
  localCallsign: string;
  targetBbs: string;
  activeSessionLog: string[];
}

// NEW: Intel NUC 5i3 Broadwell Debian 13 status diagnostics
export interface NucDiagnostics {
  cpuUsagePct: number;
  cpuTempC: number;
  ramUsagePct: number;
  ramUsedGb: number;
  ramTotalGb: number;
  uptime: string;
  loadAverage: string;
  debianVersion: string;
  services: {
    aprsc: 'active' | 'inactive' | 'failed';
    aprx: 'active' | 'inactive' | 'failed';
    direwolf: 'active' | 'inactive' | 'failed';
    gpsd: 'active' | 'inactive' | 'failed';
    ntpsec: 'active' | 'inactive' | 'failed';
    aiscatcher: 'active' | 'inactive' | 'failed';
    pat: 'active' | 'inactive' | 'failed';
    weewx: 'active' | 'inactive' | 'failed';
  };
}

export interface TelemetryConfig {
  callsign: string;
  aprsPasscode: string;
  fallbackLat: number;
  fallbackLon: number;
  owmApiKey: string;
  filterRadiusKm: number;
  serverIp: string;
  aprscPort: number;
  kissTcpPort: number;
  frequencyLocalMhz: number;
  // Expanded configs
  aisCatcherPort: number;
  aisShareRawAprs: boolean;
  winlinkSsid: string;
  aemetApiKey?: string;
  iqAirApiKey?: string;
  minMagnitudBaliza?: number;
  minMagnitudAlertaVisual?: number;
  autoGenerarBoletinEmergencia?: boolean;
  pollIntervalAemet?: number;
  pollIntervalJrc?: number;
  pollIntervalIgn?: number;
  criticalEmail?: string;
  aemetAlertsSubscriptionEnabled?: boolean;
  agpsEnabled?: boolean;
  agpsServer?: string;
  agpsInterval?: string;
  agpsLastSync?: string;
  agpsTtff?: number;
  agpsConstellations?: string[];
  suplPort?: number;
  suplVersion?: string;
  ignSeismoEnabled?: boolean;
  tsunamiMonitorEnabled?: boolean;
  systemPower?: boolean;
  weatherApiKey?: string;
  thresholdWindKts?: number;
  thresholdTempMinC?: number;
  thresholdRainMm?: number;
  forecastDays?: number;
}

export interface IQAirStatus {
  aqi: number;
  mainPollutant: string;
  city: string;
  state: string;
  country: string;
  tempC?: number;
  humidityPct?: number;
  pressureHpa?: number;
  windSpeedMs?: number;
  windDirDeg?: number;
  lastUpdated?: string;
  pm2_5?: number;
  pm10?: number;
  co?: number;
  no2?: number;
  o3?: number;
  so2?: number;
  rawAprsAqi?: string;
}

export interface RarRanStatus {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  valueUsVh: number; // Radiation gamma dose rate in uSv/h
  status: 'NORMAL' | 'ALERT' | 'HEAVY';
  distanciaKm: number;
}

export interface TsunamiAlert {
  id: string;
  title: string;
  magnitude: number;
  location: string;
  coordinates: [number, number];
  depthKm: number;
  time: string;
  severity: 'GREEN' | 'ADVISORY' | 'WATCH' | 'WARNING';
  distanceKm?: number;
  source: string;
  active: boolean;
  maxWaveHeightMeter?: number;
  etaSpain?: string;
  link?: string;
}

export interface AprsPacketLog {
  id: string;
  timestamp: string;
  type: 'TX' | 'RX' | 'SYS' | 'AIS' | 'WINLINK'; 
  source: string;
  destination: string;
  path: string;
  payload: string;
  success: boolean;
  remarks: string;
}

export interface TrafficDataPoint {
  minuteOffset: number; // e.g. -59 to 0
  label: string; // e.g. "14:02"
  txCount: number;
  rxCount: number;
}

export interface CsnReaStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  baseVal: number;
  provincia?: string;
  tipo?: string;
}

export interface DgtIncident {
  id: string;
  tipo: string;
  carretera: string;
  provincia: string;
  poblacion: string;
  fecha: string;
  descripcion: string;
  nivel: 'VERDE' | 'AMARILLO' | 'ROJO' | 'NEGRO';
  latitud: number;
  longitud: number;
  distanciaKm?: number;
  causa?: string;
  sentido?: string;
}

export interface InmarsatMessage {
  id: string;
  time: string;
  c2Code: string;
  typeText: string;
  priority: 'CRÍTICO' | 'ALERTA' | 'INFORMACIÓN';
  sender: string;
  area: string;
  payload: string;
  rawHex?: string;
  isCritical: boolean;
}

export interface ERDDAPDataset {
  id: string;
  name: string;
  serverUrl: string;
  variables: string[];
  lastUpdate: string;
}

export interface ERDDAPBuoy {
  id: string;
  name: string;
  datasetId: string;
  lat: number;
  lon: number;
  waveHeightM: number;
  wavePeriodSec: number;
  waterTempC: number;
  windSpeedKts: number;
  windDirDeg: number;
  pressureHpa: number;
  region: 'Cantábrico' | 'Atlántico' | 'Estrecho' | 'Mediterráneo' | 'Canarias' | 'Atlántico Norte' | 'Pacífico';
  statusDescription: string;
  lastUpdatedTime?: string;
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

export interface AemetWeatherAlert {
  id: string;
  province: string;
  region: string;
  headline: string;
  description: string;
  severity: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  parameter: 'viento' | 'lluvia' | 'tormentas' | 'temperatura' | 'otros';
  value: string;
  onset: string;
  expires: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
}

export interface PropagationData {
  lastUpdated: string;
  success: boolean;
  gfz: {
    fecha_utc: string;
    Hp30: number;
    Hp60: number;
    ap30: number;
    ap60: number;
    real: boolean;
  };
  noaa: {
    dia1: string;
    dia2: string;
    dia3: string;
    geom: Array<{ dateStr: string; kp: number; desc: string }>;
    rad: Array<{ dateStr: string; level: number; desc: string }>;
    blackout: Array<{ dateStr: string; level: number; desc: string }>;
    real: boolean;
    ssn?: string;
    solar_updated?: string;
    kp_tendencia?: string;
  };
  rtsw?: {
    speed: number | null;
    density: number | null;
    temperature: number | null;
    bt: number | null;
    bz: number | null;
    time: string;
    real: boolean;
  };
}

export interface ServerTelemetryData {
  config: TelemetryConfig;
  gpsd: GPSDStatus;
  ntp: NTPSECStatus;
  weather: WeatherTelemetry;
  earthquakes: EarthquakeEvent[];
  noaaAlerts: NoaaSpaceAlert[];
  vessels: AISVessel[]; // Extended
  patStatus: PatWinlinkStatus; // Extended
  nucStats: NucDiagnostics; // Extended
  logs: AprsPacketLog[];
  trafficTrends: TrafficDataPoint[];
  iqair?: IQAirStatus;
  rarRan?: RarRanStatus;
  tsunamiAlerts?: TsunamiAlert[];
  csnStations?: CsnReaStation[];
  dgtIncidents?: DgtIncident[];
  inmarsatMessages?: InmarsatMessage[];
  erddapBuoys?: ERDDAPBuoy[];
  portusStations?: OceanStation[];
  aemetAlerts?: AemetWeatherAlert[];
  propagation?: PropagationData;
  navareas?: NavareaWarning[];
}

// —— FIRE MONITOR SYSTEM TYPES (NASA & COPERNICUS) ——
export interface WildfireHotspot {
  id: string;
  lat: number;
  lon: number;
  brightnessK: number;
  frpMw: number;
  confidence: number | string;
  satellite: 'MODIS' | 'VIIRS';
  instrument: string;
  date: string;
  time: string;
  region: string;
  source: 'NASA FIRMS' | 'Copernicus EFFIS' | 'IncendiosEspaña';
  dangerLevel: 'Bajo' | 'Moderado' | 'Alto' | 'Extremo';
}

export interface RegionalFireRisk {
  region: string;
  fwi: number;
  riskLevel: 'Bajo' | 'Moderado' | 'Alto' | 'Muy Alto' | 'Extremo';
  tempC: number;
  humidityPct: number;
  windSpeedKts: number;
  focosActivos: number;
}

export interface ScheduledNotification {
  id: string;
  type: 'drill' | 'status_update';
  name: string;
  message: string;
  callsign: string;
  scheduleType: 'once' | 'recurring';
  targetTime?: string;
  intervalMinutes?: number;
  lastTriggered?: string;
  nextTriggerTime: string;
  status: 'active' | 'paused' | 'completed';
  remarks?: string;
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



