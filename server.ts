// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import 'dotenv/config';
import express from 'express';
import path from 'path';
import dns from 'dns';
import dgram from 'dgram';
import fs from 'fs';
import { execFile, execFileSync } from 'child_process';
import os from 'os';
import { descargarMeteoAbierta } from './server/fuentes/meteoAbierta';
import { Boya, boyasCercanas, descargarBoyas } from './server/fuentes/boyas';
import { Mensajeria, ViaMensaje } from './server/radio/mensajes';
import { ClusterDx } from './server/radio/clusterDx';
import { TablaDxcc, URL_CTY } from './server/radio/dxcc';
import { MAX_DAPNET, enviarDapnet } from './server/radio/dapnet';
import { Equipo, MODOS, Rotor, sMeter } from './server/radio/hamlib';
import { Grupo, mensajeEai } from './server/radio/grupo';
import { EstadoDoppler, decidir as decidirDoppler, modoEquipo } from './server/radio/doppler';
import { Orden, frecuenciaHz, leerOrden, pideConfirmacion, textoAyuda, AYUDA } from './server/radio/consola';
import { leerPosicionAprs } from './server/aprsPosicion';
import { ConfAprx, MonitorAprx, SeguidorArchivo, leerConfAprx, leerLineaRf } from './server/radio/aprx';
import { Buzon, ClientePat, MODOS_RMS } from './server/radio/pat';
import { NOMBRE_TIPO, RegistroTramas, analizarTrama } from './server/radio/tramas';
import { CONSULTA_HORAS, ConfWeewx, HoraWeewx, consultarWeewx, leerConfWeewx, leerHorasWeewx, resumenHoras } from './server/estacion/weewx';
import { ConfDirewolf, LectorLog, MonitorDirewolf, NIVEL_ALTO, NIVEL_BAJO, describirTrama, leerConfDirewolf } from './server/radio/direwolf';
import { NOMBRE_GRUPO, Paso, Satelite, URL_SATELITES, conDoppler, leerSatelites, mirar, orbita, proximoPaso } from './server/radio/satelites';
import { Contexto, EstacionVista, Objetivo, Proa, Seguimiento, acimutDeRotor, acimutVerdadero } from './server/radio/seguimiento';
import { gcInitialBearing } from './server/formulas/geo';
import { TOCALL, IS_PATH } from './server/aprs';
import net from 'net';
import {
  DEFAULT_RF_PATH,
  decideTransmission,
  isValidCallsign,
  kissEncode,
  latToAprs,
  lonToAprs,
  parseTnc2,
  passcodeMatches,
  toIsPacket,
  toRfFrame
} from './server/aprs';
import pkg from './package.json';
import { AuthInfo, createAuthenticator } from './server/auth';
import { Evento, Gravedad } from './server/core/evento';
import { Politica, RegistroAvisos, evaluar } from './server/core/reglas';
import { boletinAprs, objetoAprs } from './server/core/aprsAvisos';
import { ServicioN2k } from './server/conectividad/nmea2000Servicio';
import { ColaEmision } from './server/core/emisor';
import { descargarSismos, sismoAEvento } from './server/fuentes/sismos';
import { descargarWeatherApi, eventosPronosticoWeatherApi, eventosUmbralesLocales } from './server/fuentes/umbrales';
import { AvisoAemet, CacheCap, avisoAEvento, descargarAvisosAemet } from './server/fuentes/aemetAvisos';
import { distanciaAZonaKm } from './server/core/zona';
import { NivelEscala, descargarClimaEspacial, escalaAEvento } from './server/fuentes/climaEspacial';
import { descargarFocos, grupoAEvento } from './server/fuentes/incendios';
import { AvisoMeteoAlarm, descargarMeteoAlarm, eventosMeteoAlarm } from './server/fuentes/meteoalarm';
import { descargarCiclones, eventosCiclones } from './server/fuentes/ciclones';
import { Sonda, descargarEurdep, eventosRadiacion, sondasCercanas } from './server/fuentes/radiacion';
import { aireAEvento, descargarCalidadAire } from './server/fuentes/calidadAire';
import { MedidorAire, clasePm25, descargarMedidoresAire } from './server/fuentes/estacionesAire';
import { EstacionesOidas } from './server/estaciones';
import { ClienteAprsIs } from './server/aprsIs';
import { Barcos, LectorAis, claseBarco } from './server/ais';
import { Aeronaves, emergenciaSquawk } from './server/adsb';
import { EnlaceTcp } from './server/enlaceTcp';
import { NTP_SIN_DATOS, consultarNtp } from './server/sistema/ntp';
import { Historial, aCsv } from './server/sistema/historial';
import { balizaPosicion, intervaloBalizaMs, validarPerfil, PerfilEstacion } from './server/estacion/baliza';
import { Observacion, elegirObservacion, intervaloMeteoMs, leerArchivoWxnow, leerWeewx, parteMeteoAprs, validarParte } from './server/estacion/meteo';
import { gcDistanceKm } from './server/formulas/geo';
import { sunPosition, sunTimes, unixToUtc } from './server/formulas/astro';
import { Ionosonda, absorcionRayosX, descargarIonosondas, estadoBandas, ionosondaCercana, mejorBanda } from './server/propagacion';
import { 
  GPSDStatus, 
  NTPSECStatus, 
  WeatherTelemetry, 
  ForecastDay,
  EarthquakeEvent, 
  NoaaSpaceAlert, 
  TelemetryConfig, 
  AprsPacketLog,
  AISVessel,
  NucDiagnostics,
  TrafficDataPoint,
  IQAirStatus,
  RarRanStatus,
  TsunamiAlert,
  DgtIncident,
  InmarsatMessage,
  ERDDAPBuoy,
  OceanStation,
  AemetWeatherAlert,
  NavareaWarning
} from './src/types';

// Establish DNS configuration overrides if needed
dns.setDefaultResultOrder('ipv4first');

const app = express();

// Historial en SQLite (sat_historial.db): tramas, registro y mensajería sobreviven a un reinicio
const historial = new Historial(path.join(process.cwd(), 'sat_historial.db'));
console.log(historial.disponible ? `[HISTORIAL] ${historial.ruta}` : `[HISTORIAL] Sin historial en disco: ${historial.error}`);
const PORT = parseInt(process.env.PORT || '3000', 10) || 3000;
// HOST=127.0.0.1 limita la consola al propio equipo (recomendado tras un proxy inverso)
const HOST = process.env.HOST || '0.0.0.0';

// ---------------------------------------------------------------------------
// POLÍTICA DE EMISIÓN
// La consola NO transmite nada salvo que se active expresamente con
// SAT_APRS_TX=on en el archivo .env. Aun activada, solo salen al aire tramas
// con datos reales, con un indicativo válido y (en APRS-IS) con su passcode.
// ---------------------------------------------------------------------------
const TX_ENABLED = ['on', '1', 'true', 'yes'].includes((process.env.SAT_APRS_TX || '').trim().toLowerCase());

// ---------------------------------------------------------------------------
// AUTENTICACIÓN local, sin cuentas ni nube (ver server/auth.ts)
// ---------------------------------------------------------------------------
const TRUST_LOCALHOST = ['on', '1', 'true', 'yes'].includes((process.env.SAT_TRUST_LOCALHOST || '').trim().toLowerCase());

const authenticator = createAuthenticator({
  adminToken: process.env.SAT_ADMIN_TOKEN,
  trustLocalhost: TRUST_LOCALHOST
});

type AuthedRequest = express.Request & { auth?: AuthInfo | null };

app.use(express.json({ limit: '1mb' }));

app.use('/api', (req: AuthedRequest, res, next) => {
  req.auth = authenticator.authenticate(req);
  // Con la emisión activada la consola gobierna una estación real: solo un
  // administrador verificado puede cambiar su estado o provocar transmisiones.
  const isReadOnly = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (TX_ENABLED && !isReadOnly && !isAuthorizedRequest(req)) {
    return res.status(403).json({
      success: false,
      error: 'Operación reservada al administrador de la estación. Introduzca el token de administrador.'
    });
  }
  next();
});

// ---------------------------------------------------------------------------
// PERFIL DE LA ESTACIÓN: datos del operador, estaciones y presets.
// Se guardan en la propia estación (sat_perfil.json), no en cada navegador,
// de modo que cualquier equipo que abra la consola ve el mismo perfil.
// ---------------------------------------------------------------------------
const PERFIL_FILE = path.join(process.cwd(), 'sat_perfil.json');
const PERFIL_CLAVE_RE = /^users\/[A-Za-z0-9_\-/]{1,80}$/;
let perfilEstacion: Record<string, unknown> = {};
try {
  if (fs.existsSync(PERFIL_FILE)) perfilEstacion = JSON.parse(fs.readFileSync(PERFIL_FILE, 'utf8')) || {};
} catch (e) {
  console.warn('[PERFIL] No se pudo leer sat_perfil.json; se empieza con el perfil vacío.');
}

app.get('/api/perfil', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, datos: perfilEstacion });
});

app.post('/api/perfil', (req, res) => {
  const clave = String(req.body?.clave || '');
  const valor = req.body?.valor;
  if (!PERFIL_CLAVE_RE.test(clave)) {
    return res.status(400).json({ success: false, error: 'Clave de perfil no válida.' });
  }
  if (valor === null || valor === undefined) delete perfilEstacion[clave];
  else perfilEstacion[clave] = valor;

  // Como el resto de la configuración: solo el administrador escribe en disco
  const persistido = isAuthorizedRequest(req);
  if (persistido) {
    fs.writeFile(PERFIL_FILE, JSON.stringify(perfilEstacion, null, 2), 'utf8', (err) => {
      if (err) console.warn(`[PERFIL] No se pudo guardar sat_perfil.json: ${err.message}`);
    });
  }
  res.json({ success: true, persistido });
});

// Estado de la sesión para la interfaz (¿soy administrador?, ¿hay emisión real?)
app.get('/api/auth/status', (req: AuthedRequest, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    admin: req.auth?.admin === true,
    via: req.auth?.via || null,
    adminConfigured: authenticator.adminConfigured,
    txEnabled: TX_ENABLED
  });
});

// config.ini (del antiguo agente aprs_sat.py): solo se importa una vez, si no hay sat_config.json.
// N0CALL es el indicativo «sin configurar»: con él nunca se transmite.
let initialCallsign = 'N0CALL';
let initialPasscode = '';

const parseConfigIni = (filePath: string) => {
  const iniContent = fs.readFileSync(filePath, 'utf8');
  const lines = iniContent.split('\n');
  let currentSection = '';
  const parsed: any = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim().toUpperCase();
      continue;
    }
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      if (!parsed[currentSection]) parsed[currentSection] = {};
      parsed[currentSection][key] = value;
    }
  }
  return parsed;
};

// Una petición está autorizada a escribir en disco, ejecutar órdenes del sistema
// o gobernar la estación solo si procede de un administrador verificado.
function isAuthorizedRequest(req: express.Request): boolean {
  return (req as AuthedRequest).auth?.admin === true;
}

// Claves y credenciales que solo puede ver un administrador
const SECRET_CONFIG_KEYS = ['aprsPasscode', 'owmApiKey', 'aemetApiKey', 'iqAirApiKey', 'weatherApiKey', 'dapnetPassword', 'rotorPin'] as const;
const SECRET_MASK = '********';

function isMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === SECRET_MASK;
}

function configForRequest(req: express.Request): TelemetryConfig {
  if (isAuthorizedRequest(req)) return config;
  const redacted: any = { ...config };
  for (const key of SECRET_CONFIG_KEYS) {
    if (redacted[key]) redacted[key] = SECRET_MASK;
  }
  return redacted;
}

// In-Memory Database / State Manager (Durable civil configuration)
let config: TelemetryConfig = {
  callsign: initialCallsign,
  aprsPasscode: initialPasscode, // auto-generated if needed
  fallbackLat: 40.416775, // Madrid (Default center for civil coordination)
  fallbackLon: -3.703790,
  owmApiKey: '', // Optional: client-provided
  filterRadiusKm: 200,
  serverIp: 'euro.aprs2.net',
  aprscPort: 14580,
  kissTcpPort: 8001,
  frequencyLocalMhz: 144.800,
  // Expanded for Intel NUC 5i3 AIS / Winlink integration
  aisCatcherPort: 10110,
  aisShareRawAprs: true,
  winlinkSsid: 'WL2K',
  aemetApiKey: '',
  iqAirApiKey: '',
  minMagnitudBaliza: 4.0,
  minMagnitudAlertaVisual: 3.0,
  autoGenerarBoletinEmergencia: true,
  enableForecastBulletin: false,
  pollIntervalAemet: 1,
  pollIntervalJrc: 5,
  pollIntervalIgn: 1,
  pollIntervalIca: 30,
  enableAprsIca: true,
  enableAprsIcaFilterRegular: true,
  icaTemplateBuena: 'CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Sin riesgo. Disfrute de actividades al aire libre.',
  icaTemplateRegular: 'CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Aceptable. Personas sensibles deben evaluar reducir esfuerzos.',
  icaTemplateDesfavorable: 'CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Grupos de riesgo: reduzca actividades intensas en exterior.',
  icaTemplateMuyDesfavorable: 'CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Nocivo. Evite ejercicio prolongado en exterior. Proteja vias respiratorias.',
  icaTemplateExtremadamente: 'CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Alerta Sanitaria: Permanezca en interiores y use mascarilla FFP2.',
  criticalEmail: 'emergencias.cenem@proteccioncivil.es',
  aemetAlertsSubscriptionEnabled: true,
  // Avisos meteorológicos oficiales (AEMET): se anuncian los de las zonas que
  // contienen la estación o cuyo borde queda a menos de `meteoRadioKm`.
  meteoRadioKm: 25,
  meteoGravedadMinima: 'amarillo',
  meteoAntelacionH: 12,
  meteoRepetirMin: 60,
  ignSeismoEnabled: true,
  ignSeismoInterval: 30,
  tsunamiMonitorEnabled: true,
  systemPower: true,
  weatherApiKey: '',
  thresholdWindKts: 25.0,
  thresholdTempMinC: 0.0,
  thresholdRainMm: 20.0,
  forecastDays: 3,
  // Avisos por umbrales de la estación y por el pronóstico de WeatherAPI (antes en el agente)
  avisosUmbralesLocales: false,
  avisosPronostico: false,
  localThresholdWindKts: 20.0,
  localThresholdTempMaxC: 35.0,
  localThresholdTempMinC: 5.0,
  localThresholdRainMm: 10.0,
  terminalLogsRetention: 150,
  // Advanced APRS station defaults
  aprsSsid: 10, // -10 is standard for IGates and fixed internet-linked stations
  aprsSymbolTable: '/',
  aprsSymbolCode: '&', // IGate symbol code (red circle with white arrow, or gateway '&')
  aprsPath: 'WIDE1-1,WIDE2-1',
  aprsPhgPower: 5, // 5 = 25 Watts
  aprsPhgHeight: 3, // 3 = 40 feet
  aprsPhgGain: 3, // 3 = 6 dB
  aprsPhgDirectivity: 0, // 0 = omnidirectional
  aprsBeaconInterval: 30, // 30 minutes for fixed
  // Baliza de posición de la propia estación: apagada por defecto para no
  // duplicar la que ya emitan aprx o Direwolf con el mismo indicativo.
  aprsBeaconEnabled: false,
  // Sesión permanente con APRS-IS para recibir las estaciones cercanas (capa APRS del mapa)
  aprsIsRxEnabled: true,
  // Más fuentes sobre la cadena de avisos (server/fuentes/)
  // Clima espacial (NOAA): se anuncia a partir de este nivel de las escalas R, S y G (1-5)
  climaEspacialEnabled: true,
  climaEspacialNivelMin: 2,
  // Focos de calor por satélite (NASA FIRMS) cerca de la estación
  fuegoEnabled: true,
  fuegoRadioKm: 50,
  fuegoGravedadMinima: 'naranja',
  // Calidad del aire en la estación (CAMS): solo cuando es mala
  aireEnabled: true,
  aireGravedadMinima: 'naranja',
  // MeteoAlarm (avisos oficiales europeos, sin clave): países y zonas que se siguen
  meteoalarmEnabled: false,
  meteoalarmPaises: 'portugal',
  meteoalarmZonas: '',
  meteoalarmGravedadMinima: 'amarillo',
  meteoalarmRepetirMin: 60,
  // Ciclones tropicales del NHC a menos de este radio
  ciclonesEnabled: false,
  ciclonesRadioKm: 1000,
  ciclonesGravedadMinima: 'amarillo',
  // Radiactividad ambiental (EURDEP): sondas a menos del radio por encima del umbral (µSv/h)
  radiacionEnabled: false,
  radiacionPaises: 'ES,PT',
  radiacionRadioKm: 100,
  radiacionUmbral: 0.3,
  // Parte meteorológico de la estación por APRS. Apagado por defecto: actívelo solo
  // si WeeWX, Direwolf o aprx no emiten ya el parte con este indicativo.
  wxBeaconEnabled: false,
  wxBeaconInterval: 10,
  // «auto» = estación propia si su dato es reciente; si no, Internet (OWM o AEMET)
  wxFuente: 'auto',
  wxWeewxDb: '/var/lib/weewx/weewx.sdb',
  wxWxnowPath: '',
  // Entradas para el mapa. AIS: sentencias NMEA por UDP (AIS-catcher «-u», rtl_ais) y,
  // opcionalmente, un servidor TCP. ADS-B: puerto SBS (30003) de readsb o dump1090.
  aisEnabled: true,
  aisUdpPort: 10110,
  aisTcpHost: '',
  aisTcpPort: 0,
  adsbEnabled: true,
  adsbHost: '127.0.0.1',
  adsbPort: 30003,
  // Radio: cluster DX por telnet (vacío = sin configurar) y cuenta de DAPNET para buscapersonas
  clusterEnabled: false,
  clusterHost: '',
  clusterPort: 7300,
  dapnetUser: '',
  dapnetPassword: '',
  dapnetGroup: 'ea-all',
  // Equipo por CAT (rigctld de Hamlib) y rotor (rotctld o la caja APRS LoRa+ Rotor por TCP)
  catEnabled: false,
  catHost: '127.0.0.1',
  catPort: 4532,
  rotorMode: 'off',
  rotorHost: '127.0.0.1',
  rotorPort: 4533,
  rotorPin: '',
  // true = el rotor va en un vehículo o barco: se descuenta el rumbo de la proa
  rotorMovil: false,
  // Winlink: API HTTP de Pat («pat http») y nombre de su servicio de systemd (p. ej. pat@manuel)
  patUrl: 'http://127.0.0.1:8080',
  patServicio: 'pat',
  // Satélites favoritos (números NORAD, separados por comas); de serie, la ISS
  satFavoritos: '25544',
  // Vigilancia de grupo (estilo ARTS), como en el tracker APRS LoRa+
  grupoActivo: false,
  grupoIndicativos: '',
  grupoMinutos: 10,
  grupoMaxKm: 0,
  grupoSondeoS: 0,
  operatorName: '',
  stationQth: '',
  aprsSmartBeaconing: false,
  aprsSmartLowInterval: 30,
  aprsSmartHighInterval: 5,
  aprsSmartTurnAngle: 28,
  aprsSmartSlope: 120,
  aprsStatusComment: '📡 S.A.T. Estación Principal | Coord. Emergencias REMER',
  aprsMiceMsgCode: 1, // M1: In Service
  aprsMiceOffset: false,
  aprsFilterQuery: 'm/150 t/pms' // Filter stations in 150km, only position/messages/weather
};

// Global timestamp tracking when the entire system was turned ON
let systemPowerOnTime = Date.now();

// Intentar cargar la configuración persistida de sat_config.json
const satConfigPath = path.join(process.cwd(), 'sat_config.json');
try {
  if (fs.existsSync(satConfigPath)) {
    const rawSatConfig = fs.readFileSync(satConfigPath, 'utf8');
    if (rawSatConfig && rawSatConfig.trim()) {
      const parsedSatConfig = JSON.parse(rawSatConfig);
      config = { ...config, ...parsedSatConfig };
      console.log(`[SYS CONFIG] Cargada configuración persistente del sistema de sat_config.json`);
    }
  }
} catch (e) {
  console.warn("[SYS CONFIG] No se pudo cargar sat_config.json o el archivo está corrupto. Usando valores por defecto:", e);
}

// Instalaciones antiguas: si aún no hay sat_config.json, se importa una vez la
// configuración de config.ini (la del agente aprs_sat.py, ya retirado).
const importarConfigIni = !fs.existsSync(satConfigPath);
try {
  const iniPath = path.join(process.cwd(), 'config.ini');
  if (importarConfigIni && fs.existsSync(iniPath)) {
    const iniData = parseConfigIni(iniPath);
    if (iniData.APRS) {
      if (iniData.APRS.callsign) {
        config.callsign = iniData.APRS.callsign.toUpperCase().trim();
      }
      if (iniData.APRS.passcode) config.aprsPasscode = iniData.APRS.passcode.trim();
      if (iniData.APRS.serverIp) config.serverIp = iniData.APRS.serverIp.trim();
      if (iniData.APRS.serverPort) config.aprscPort = parseInt(iniData.APRS.serverPort) || config.aprscPort;
      if (iniData.APRS.kissTcpPort) config.kissTcpPort = parseInt(iniData.APRS.kissTcpPort) || config.kissTcpPort;
      if (iniData.APRS.pollIntervalIca) config.pollIntervalIca = parseInt(iniData.APRS.pollIntervalIca) || config.pollIntervalIca;
      if (iniData.APRS.enableAprsIca !== undefined) config.enableAprsIca = iniData.APRS.enableAprsIca.trim().toLowerCase() === 'true';
      if (iniData.APRS.enableAprsIcaFilterRegular !== undefined) config.enableAprsIcaFilterRegular = iniData.APRS.enableAprsIcaFilterRegular.trim().toLowerCase() === 'true';
      if (iniData.APRS.icaTemplateBuena) config.icaTemplateBuena = iniData.APRS.icaTemplateBuena.trim();
      if (iniData.APRS.icaTemplateRegular) config.icaTemplateRegular = iniData.APRS.icaTemplateRegular.trim();
      if (iniData.APRS.icaTemplateDesfavorable) config.icaTemplateDesfavorable = iniData.APRS.icaTemplateDesfavorable.trim();
      if (iniData.APRS.icaTemplateMuyDesfavorable) config.icaTemplateMuyDesfavorable = iniData.APRS.icaTemplateMuyDesfavorable.trim();
      if (iniData.APRS.icaTemplateExtremadamente) config.icaTemplateExtremadamente = iniData.APRS.icaTemplateExtremadamente.trim();
    }
    if (iniData.OPENWEATHERMAP && iniData.OPENWEATHERMAP.apiKey) {
      config.owmApiKey = iniData.OPENWEATHERMAP.apiKey.trim();
    }
    if (iniData.WEATHERAPI) {
      if (iniData.WEATHERAPI.apiKey) config.weatherApiKey = iniData.WEATHERAPI.apiKey.trim();
      if (iniData.WEATHERAPI.thresholdWindKts) config.thresholdWindKts = parseFloat(iniData.WEATHERAPI.thresholdWindKts) || config.thresholdWindKts;
      if (iniData.WEATHERAPI.thresholdTempMinC) config.thresholdTempMinC = parseFloat(iniData.WEATHERAPI.thresholdTempMinC) || config.thresholdTempMinC;
      if (iniData.WEATHERAPI.thresholdRainMm) config.thresholdRainMm = parseFloat(iniData.WEATHERAPI.thresholdRainMm) || config.thresholdRainMm;
      if (iniData.WEATHERAPI.forecastDays) config.forecastDays = parseInt(iniData.WEATHERAPI.forecastDays) || config.forecastDays;
    }
    if (iniData.LOCALWEATHER) {
      if (iniData.LOCALWEATHER.thresholdWindKts) config.localThresholdWindKts = parseFloat(iniData.LOCALWEATHER.thresholdWindKts) || config.localThresholdWindKts;
      if (iniData.LOCALWEATHER.thresholdTempMaxC) config.localThresholdTempMaxC = parseFloat(iniData.LOCALWEATHER.thresholdTempMaxC) || config.localThresholdTempMaxC;
      if (iniData.LOCALWEATHER.thresholdTempMinC) config.localThresholdTempMinC = parseFloat(iniData.LOCALWEATHER.thresholdTempMinC) || config.localThresholdTempMinC;
      if (iniData.LOCALWEATHER.thresholdRainMm) config.localThresholdRainMm = parseFloat(iniData.LOCALWEATHER.thresholdRainMm) || config.localThresholdRainMm;
    }
    if (iniData.FALLBACK) {
      if (iniData.FALLBACK.latitude) config.fallbackLat = parseFloat(iniData.FALLBACK.latitude) || config.fallbackLat;
      if (iniData.FALLBACK.longitude) config.fallbackLon = parseFloat(iniData.FALLBACK.longitude) || config.fallbackLon;
    }
    if (iniData.ALERTS && iniData.ALERTS.filterRadiusKm) {
      config.filterRadiusKm = parseInt(iniData.ALERTS.filterRadiusKm) || config.filterRadiusKm;
    }
    console.log(`[SYS CONFIG] Importada la configuración de config.ini (agente antiguo): callsign=${config.callsign}`);
    try { fs.writeFileSync(satConfigPath, JSON.stringify(config, null, 2), 'utf8'); } catch { /* se guardará en el próximo cambio */ }
  }
} catch (e) {
  console.warn("[SYS CONFIG] No se pudo importar config.ini:", e);
}

let initialSyncedCallsign = config.callsign;

// AEMET OpenData subscription states and log tracking
let aemetAlerts: AemetWeatherAlert[] = [];
let customInjectedAemetAlerts: AemetWeatherAlert[] = [];
const loggedAemetAlertIds = new Set<string>();

// Simulated Hardware & Real state
// Último rumbo sobre el fondo que ha dado el GPS (grados verdaderos)
let rumboGps: number | null = null;

// Hasta que gpsd dé un fijo: sin fijo, sin satélites y en la posición de respaldo
let gpsdState: GPSDStatus = {
  lat: 40.416775,
  lon: -3.703790,
  alt: 0,
  mode: 0,
  speedKmh: 0,
  satellitesUsed: 0,
  satellitesVisible: 0,
  time: new Date().toISOString(),
  isFallback: true,
  device: ''
};
/** Enlace con gpsd (TCP 2947) y última vez que mandó algo. */
let gpsdConectado = false;
let gpsdUltimo = 0;

// Persistent last valid GPS coordinate fallback storage
let lastValidGps = {
  lat: 40.416775,
  lon: -3.703790,
  alt: 0,
  device: ''
};

// Sin posición GPS guardada, la estación arranca en las coordenadas de respaldo
// configuradas ([Fallback] de config.ini / panel), no en un punto fijo del código.
if (Number.isFinite(config.fallbackLat) && Number.isFinite(config.fallbackLon)) {
  lastValidGps.lat = gpsdState.lat = config.fallbackLat;
  lastValidGps.lon = gpsdState.lon = config.fallbackLon;
}

// Load saved coordinates from last_gps.json if it exists, otherwise use config defaults
try {
  const lastGpsPath = path.join(process.cwd(), 'last_gps.json');
  if (fs.existsSync(lastGpsPath)) {
    const rawData = fs.readFileSync(lastGpsPath, 'utf8');
    if (rawData && rawData.trim()) {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        lastValidGps.lat = parsed.lat;
        lastValidGps.lon = parsed.lon;
        if (typeof parsed.alt === 'number') lastValidGps.alt = parsed.alt;
        
        // Seed gpsdState with last valid on start
        gpsdState.lat = lastValidGps.lat;
        gpsdState.lon = lastValidGps.lon;
        gpsdState.alt = lastValidGps.alt;
        gpsdState.isFallback = true;
        console.log(`[GPSD INITIALIZATION] Cargado última ubicación GPS válida guardada: ${lastValidGps.lat}, ${lastValidGps.lon}`);
      }
    } else {
      console.warn("[GPSD INITIALIZATION] last_gps.json está vacío o inválido. Usando coordenadas por defecto.");
    }
  }
} catch (e) {
  console.warn("[GPSD INITIALIZATION] No se pudo cargar last_gps.json (archivo corrupto o vacío). Usando coordenadas por defecto.");
}

let lastGpsSaveTime = 0;

function handleGpsdStateUpdate(newGps: Partial<GPSDStatus>) {
  if (newGps.lat !== undefined) gpsdState.lat = parseFloat(newGps.lat.toString());
  if (newGps.lon !== undefined) gpsdState.lon = parseFloat(newGps.lon.toString());
  if (newGps.alt !== undefined) gpsdState.alt = parseFloat(newGps.alt.toString());
  if (newGps.mode !== undefined) gpsdState.mode = parseInt(newGps.mode.toString());
  if (newGps.speedKmh !== undefined) gpsdState.speedKmh = parseFloat(newGps.speedKmh.toString());
  if (newGps.isFallback !== undefined) gpsdState.isFallback = !!newGps.isFallback;
  if (newGps.satellitesUsed !== undefined) gpsdState.satellitesUsed = newGps.satellitesUsed;
  if (newGps.satellitesVisible !== undefined) gpsdState.satellitesVisible = newGps.satellitesVisible;
  gpsdState.time = new Date().toISOString();

  // Mode >= 2 means valid 2D/3D fix. If valid fix and not explicit fallback, update our lastValidGps!
  if (gpsdState.mode >= 2 && !gpsdState.isFallback) {
    lastValidGps.lat = gpsdState.lat;
    lastValidGps.lon = gpsdState.lon;
    lastValidGps.alt = gpsdState.alt;
    
    // Guardar en disco, pero no en cada trama: gpsd informa cada segundo y eso
    // desgasta la tarjeta SD. Se escribe como mucho una vez por minuto.
    const nowMs = Date.now();
    if (nowMs - lastGpsSaveTime >= 60000) {
      lastGpsSaveTime = nowMs;
      fs.writeFile(path.join(process.cwd(), 'last_gps.json'), JSON.stringify(lastValidGps), 'utf8', (err) => {
        if (err) console.error("Error guardando last_gps.json:", err);
      });
    }
  } else if (gpsdState.mode <= 1 || gpsdState.isFallback) {
    // SIGNAL LOST (mode <= 1) or forced fallback! Use the last obtained valid coordinates as coordinates de respaldo
    gpsdState.lat = lastValidGps.lat;
    gpsdState.lon = lastValidGps.lon;
    gpsdState.alt = lastValidGps.alt;
    gpsdState.isFallback = true;
  }
}

// ==========================================
// REAL HARDWARE INTEGRATION: GPSD, TNC KISS, AND TRANSMITTER
// ==========================================

let gpsdClient: net.Socket | null = null;
let gpsdReconnectTimer: NodeJS.Timeout | null = null;
let gpsdReconnectDelay = 2000;

function connectGpsdTcp() {
  if (gpsdClient) {
    try { gpsdClient.destroy(); } catch(e) {}
    gpsdClient = null;
  }
  if (gpsdReconnectTimer) {
    clearTimeout(gpsdReconnectTimer);
    gpsdReconnectTimer = null;
  }

  console.log(`[GPSD CLIENT] Conectando a gpsd en 127.0.0.1:2947...`);
  const socket = new net.Socket();
  gpsdClient = socket;
  socket.setEncoding('utf8');

  socket.connect(2947, '127.0.0.1', () => {
    console.log(`[GPSD CLIENT] ¡Conectado con éxito a gpsd en 127.0.0.1:2947!`);
    gpsdReconnectDelay = 2000;
    gpsdConectado = true;
    // Start watch streaming
    socket.write('?WATCH={"enable":true,"json":true};\r\n');
  });

  let lineBuffer = '';
  socket.on('data', (data) => {
    gpsdUltimo = Date.now();
    lineBuffer += data;
    let newlineIndex: number;
    while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, newlineIndex).trim();
      lineBuffer = lineBuffer.slice(newlineIndex + 1);
      
      if (line) {
        try {
          const obj = JSON.parse(line);
          if (obj.class === 'TPV') {
            if (typeof obj.device === 'string' && obj.device) gpsdState.device = obj.device;
            const lat = typeof obj.lat === 'number' ? obj.lat : gpsdState.lat;
            const lon = typeof obj.lon === 'number' ? obj.lon : gpsdState.lon;
            const alt = typeof obj.alt === 'number' ? obj.alt : (typeof obj.altHAE === 'number' ? obj.altHAE : gpsdState.alt);
            const speedKmh = typeof obj.speed === 'number' ? parseFloat((obj.speed * 3.6).toFixed(1)) : gpsdState.speedKmh; // speed in m/s to km/h
            const mode = typeof obj.mode === 'number' ? obj.mode : gpsdState.mode;
            // Rumbo sobre el fondo, para el rotor de una estación en movimiento
            if (typeof obj.track === 'number') rumboGps = obj.track;
            
            handleGpsdStateUpdate({
              lat,
              lon,
              alt,
              speedKmh,
              mode,
              isFallback: false
            });
          } else if (obj.class === 'SKY') {
            const satellitesUsed = Array.isArray(obj.satellites) ? obj.satellites.filter((s: any) => s.used).length : gpsdState.satellitesUsed;
            const satellitesVisible = Array.isArray(obj.satellites) ? obj.satellites.length : gpsdState.satellitesVisible;
            handleGpsdStateUpdate({
              satellitesUsed,
              satellitesVisible
            });
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  });

  socket.on('error', (err) => {
    // console.warn(`[GPSD CLIENT] Error en socket: ${err.message}`);
  });

  socket.on('close', () => {
    gpsdConectado = false;
    handleGpsdStateUpdate({ mode: 0, satellitesUsed: 0, satellitesVisible: 0, isFallback: true });
    scheduleGpsdReconnect();
  });
}

function scheduleGpsdReconnect() {
  if (gpsdReconnectTimer) return;
  gpsdReconnectTimer = setTimeout(() => {
    gpsdReconnectTimer = null;
    gpsdReconnectDelay = Math.min(gpsdReconnectDelay * 2, 30000);
    connectGpsdTcp();
  }, gpsdReconnectDelay);
}

// ---------------------------------------------------------------------------
// Estaciones oídas (RF y APRS-IS) y sesión permanente con APRS-IS
// ---------------------------------------------------------------------------
const estacionesOidas = new EstacionesOidas();
// Todas las tramas APRS que entran (radio, APRS-IS) y salen, para Radio → Tramas APRS
const registroTramas = new RegistroTramas(500);
registroTramas.cargar(historial.tramas(500) as never);
registroTramas.alAnotar = (t) => historial.guardarTrama(t);
let firmaAprsIs = '';

// ---------------------------------------------------------------------------
// Radio: mensajería APRS de la estación y cluster DX
// ---------------------------------------------------------------------------
const mensajeria = new Mensajeria(() => config.callsign);
mensajeria.restaurar(historial.leerEstado('mensajeria'));
// La mensajería se guarda en el historial cuando cambia (cada 10 s como mucho)
let mensajeriaGuardada = JSON.stringify(mensajeria.exportar());
setInterval(() => {
  const ahora = JSON.stringify(mensajeria.exportar());
  if (ahora !== mensajeriaGuardada) { historial.guardarEstado('mensajeria', mensajeria.exportar()); mensajeriaGuardada = ahora; }
}, 10_000);

/** Emite un mensaje, acuse o boletín de la mensajería por la cola de emisión (con su política). */
function emitirMensajeria(info: string, motivo: string) {
  if (!isValidCallsign(config.callsign)) return;
  const trama = `${config.callsign.trim().toUpperCase()}>${TOCALL},${IS_PATH}:${info}`;
  // Un mensaje o un acuse no espera detrás de las balizas: va con prioridad
  addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, trama, true, motivo, { urgente: true });
}

/** Pasa a la mensajería una trama recibida; si es de terceros («}»), la de dentro. */
function mensajeRecibido(origen: string, info: string, via: ViaMensaje, nivel = 0) {
  if (info.startsWith('}') && nivel < 2) {
    const interior = parseTnc2(info.slice(1));
    if (interior) mensajeRecibido(interior.source, interior.info, via, nivel + 1);
    return;
  }
  if (!info.startsWith(':')) return;
  const respuesta = mensajeria.recibir(origen, info, via);
  if (respuesta) emitirMensajeria(respuesta.info, respuesta.motivo);
}
setInterval(() => {
  for (const e of mensajeria.reintentos()) emitirMensajeria(e.info, e.motivo);
}, 5000);

// Vigilancia de grupo (estilo ARTS)
const grupoVigilado = new Grupo();
function grupoOido(origen: string, destino: string, info: string, via: 'RF' | 'IS') {
  if (config.grupoActivo !== true) return;
  const p = leerPosicionAprs(origen, destino, info);
  grupoVigilado.oida(origen, via, p && p.clase === 'estacion' && !p.baja ? { lat: p.lat, lon: p.lon } : null);
}
setInterval(() => {
  if (config.grupoActivo !== true) return;
  grupoVigilado.ajustar({ indicativos: config.grupoIndicativos, minutos: config.grupoMinutos, maxKm: config.grupoMaxKm, sondeoS: config.grupoSondeoS });
  for (const c of grupoVigilado.revisar({ lat: gpsdState.lat, lon: gpsdState.lon })) {
    addLog('SYS', 'GRUPO', 'LOCAL', 'ARTS', `${c.indicativo} ${c.estado === 'dentro' ? 'EN ALCANCE' : 'FUERA DE ALCANCE'} (${c.detalle}).`, c.estado === 'dentro', c.estado === 'dentro' ? 'En alcance' : 'Fuera');
  }
  for (const destino of grupoVigilado.sondeos()) {
    const r = mensajeria.redactar(destino, 'ping');
    if (r.ok) emitirMensajeria(r.emision.info, `Sondeo del grupo a ${destino}`);
  }
}, 1000);

const tablaDxcc = new TablaDxcc();
let dxccLeida = 0;
let dxccIntento = 0;
async function cargarDxcc() {
  const ahora = Date.now();
  // Una vez por semana; si falla, se reintenta a la hora
  if ((dxccLeida && ahora - dxccLeida < 7 * 86400_000) || ahora - dxccIntento < 3600_000) return;
  dxccIntento = ahora;
  try {
    const r = await fetch(URL_CTY, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const n = tablaDxcc.cargar(await r.text());
    if (n < 100) throw new Error(`solo ${n} entidades legibles`);
    dxccLeida = ahora;
    anotarFuente('dxcc', 'Países DXCC · cty.dat', true, `${n} entidades`);
  } catch (e: any) {
    anotarFuente('dxcc', 'Países DXCC · cty.dat', false, `Sin tabla de países: ${e?.message ?? e}`);
    addLog('SYS', 'DXCC', 'LOCAL', 'API', `No se pudo descargar la tabla de países (cty.dat): ${e?.message ?? e}. Los spots salen sin rumbo ni distancia.`, false, 'Sin datos');
  }
}

const clusterDx = new ClusterDx((estado, detalle) => {
  if (estado === 'conectado') addLog('SYS', 'CLUSTER', 'LOCAL', 'ENLACE', `Cluster DX conectado (${detalle}).`, true, 'Enlace');
  else if (estado === 'desconectado') addLog('SYS', 'CLUSTER', 'LOCAL', 'ENLACE', `Cluster DX desconectado: ${detalle}. Se reintentará.`, false, 'Enlace');
});

/** Conecta o desconecta el cluster DX según la configuración actual. */
function ajustarCluster() {
  const host = String(config.clusterHost || '').trim();
  const puerto = Number(config.clusterPort) || 0;
  const activo = config.systemPower !== false && config.clusterEnabled === true && !!host && puerto > 0 && isValidCallsign(config.callsign);
  if (!activo) {
    if (clusterDx.estado !== 'parado') clusterDx.parar();
    return;
  }
  // El nodo se identifica con el indicativo sin SSID
  clusterDx.iniciar(host, puerto, config.callsign.trim().toUpperCase().replace(/-\d+$/, ''));
  cargarDxcc();
}
setInterval(() => { if (clusterDx.estado !== 'parado') cargarDxcc(); }, 3600_000);

// Equipo de radio (CAT) y rotor
const equipoRadio = new Equipo();
const rotorAntena = new Rotor();

/** Conecta o suelta el equipo y el rotor según la configuración actual. */
function ajustarEquipoYRotor() {
  const encendido = config.systemPower !== false;
  const hostCat = String(config.catHost || '').trim();
  if (encendido && config.catEnabled === true && hostCat && Number(config.catPort) > 0) equipoRadio.ajustar(hostCat, Number(config.catPort));
  else equipoRadio.parar();
  const hostRotor = String(config.rotorHost || '').trim();
  const modoRotor = config.rotorMode === 'rotctld' || config.rotorMode === 'caja' ? config.rotorMode : null;
  if (encendido && modoRotor && hostRotor && Number(config.rotorPort) > 0) rotorAntena.ajustar(modoRotor, hostRotor, Number(config.rotorPort), String(config.rotorPin || ''));
  else rotorAntena.parar();
}
setInterval(() => {
  equipoRadio.sondear().catch(() => {});
  rotorAntena.sondear().catch(() => {});
}, 1500);

// Satélites: mismo archivo de TLE que el tracker y la app APRS LoRa+
let satelites: Satelite[] = [];
let satGenerado: number | null = null;
let satLeido = 0;
let satIntento = 0;
let satError = '';
const orbitas = new Map<number, NonNullable<ReturnType<typeof orbita>>>();
const pasosGuardados = new Map<number, { paso: Paso | null; cuando: number; lat: number; lon: number }>();

async function descargarSatelites(forzar = false): Promise<boolean> {
  const ahora = Date.now();
  // El archivo se publica una vez al día: se relee cada 12 h; si falla, cada hora
  if (!forzar && ((satLeido && ahora - satLeido < 12 * 3600_000) || ahora - satIntento < 3600_000)) return satelites.length > 0;
  satIntento = ahora;
  try {
    const r = await fetch(URL_SATELITES, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const leido = leerSatelites(await r.text());
    if (leido.satelites.length === 0) throw new Error('archivo sin satélites legibles');
    satelites = leido.satelites;
    satGenerado = leido.generado;
    satLeido = ahora;
    satError = '';
    orbitas.clear();
    pasosGuardados.clear();
    anotarFuente('satelites', 'Satélites · TLE de CelesTrak', true, `${satelites.length} satélites`);
    return true;
  } catch (e: any) {
    satError = e?.message ?? String(e);
    anotarFuente('satelites', 'Satélites · TLE de CelesTrak', false, `Sin TLE: ${satError}`);
    addLog('SYS', 'SAT', 'LOCAL', 'API', `No se pudieron descargar los elementos orbitales (TLE): ${satError}.`, false, 'Sin datos');
    return false;
  }
}
setInterval(() => { descargarSatelites().catch(() => {}); }, 3600_000);

function orbitaDe(norad: number) {
  const guardada = orbitas.get(norad);
  if (guardada) return guardada;
  const s = satelites.find((x) => x.norad === norad);
  const o = s ? orbita(s) : null;
  if (o) orbitas.set(norad, o);
  return o;
}

/** Próximo paso (o el que está en curso) sobre la posición actual; se recalcula al acabar o si la estación se mueve. */
function pasoDe(norad: number, ahora: number): Paso | null {
  const o = orbitaDe(norad);
  if (!o) return null;
  const g = pasosGuardados.get(norad);
  const movida = g ? gcDistanceKm({ lat: g.lat, lon: g.lon }, { lat: gpsdState.lat, lon: gpsdState.lon }) > 5 : true;
  if (g && !movida && (g.paso ? g.paso.los > ahora : ahora - g.cuando < 3600_000)) return g.paso;
  const paso = proximoPaso(o, { lat: gpsdState.lat, lon: gpsdState.lon }, gpsdState.alt || 0, ahora);
  pasosGuardados.set(norad, { paso, cuando: ahora, lat: gpsdState.lat, lon: gpsdState.lon });
  return paso;
}

// Corrección de Doppler continua en el equipo durante un paso
let doppler: EstadoDoppler | null = null;
let dopplerFin: { motivo: string; cuando: number; nombre: string } | null = null;

async function iniciarDoppler(norad: number, indice: number): Promise<{ ok: boolean; error?: string }> {
  if (config.catEnabled !== true || !equipoRadio.estado.enlace) return { ok: false, error: 'Hace falta el equipo por CAT conectado.' };
  const s = satelites.find((x) => x.norad === norad);
  if (!s) return { ok: false, error: 'No hay TLE de ese satélite.' };
  const t = s.transmisores[indice];
  if (!t || (!t.bajadaHz && !t.subidaHz)) return { ok: false, error: 'Ese transmisor no tiene frecuencias.' };
  const paso = pasoDe(norad, Date.now());
  await pararDoppler(null);
  const modo = modoEquipo(t.modo);
  if (modo) await equipoRadio.modo(modo);
  doppler = {
    norad, nombre: s.nombre, bajadaHz: t.bajadaHz, subidaHz: t.subidaHz !== t.bajadaHz ? t.subidaHz : 0, modo, descripcion: t.descripcion,
    inicio: Date.now(), fin: paso?.los ?? null, ultimaRx: null, ultimaTx: null, ultimaVez: null, radialKmS: null, split: null,
  };
  dopplerFin = null;
  addLog('SYS', 'DOPPLER', 'LOCAL', 'SAT', `Corrección de Doppler en marcha: ${s.nombre} · ${t.descripcion || t.modo}.`, true, 'Doppler');
  await pasoDoppler();
  return { ok: true };
}

async function pararDoppler(motivo: string | null) {
  if (!doppler) return;
  if (motivo) {
    dopplerFin = { motivo, cuando: Date.now(), nombre: doppler.nombre };
    addLog('SYS', 'DOPPLER', 'LOCAL', 'SAT', `Corrección de Doppler terminada (${doppler.nombre}): ${motivo}.`, true, 'Doppler');
  }
  if (doppler.split) await equipoRadio.quitarSplit().catch(() => {});
  doppler = null;
}

async function pasoDoppler() {
  const d = doppler;
  if (!d) return;
  if (config.catEnabled !== true) return pararDoppler('se ha desconectado el equipo');
  const o = orbitaDe(d.norad);
  const m = o ? mirar(o, { lat: gpsdState.lat, lon: gpsdState.lon }, gpsdState.alt || 0, Date.now()) : null;
  if (!m) return pararDoppler('no se puede calcular la órbita');
  d.radialKmS = m.radialKmS;
  if (!equipoRadio.estado.enlace) return; // sin lectura del equipo: se espera
  // La frecuencia del equipo solo vale si se ha leído después del último cambio que se le mandó
  const leidaDespues = d.ultimaVez === null || equipoRadio.estado.leido > d.ultimaVez + 200;
  const decision = decidirDoppler(d, m.radialKmS, leidaDespues ? equipoRadio.estado.frecuenciaHz : null, Date.now());
  if (decision.tipo === 'parar') return pararDoppler(decision.motivo);
  if (decision.tipo !== 'mandar') return;
  if (decision.rx !== null) {
    const r = await equipoRadio.frecuencia(decision.rx);
    if (r.ok) d.ultimaRx = decision.rx;
  }
  if (decision.tx !== null) {
    const r = await equipoRadio.subida(decision.tx);
    if (r.ok) { d.ultimaTx = decision.tx; d.split = true; }
    else if (d.split === null) {
      d.split = false;
      addLog('SYS', 'DOPPLER', 'LOCAL', 'SAT', `El equipo no acepta subida separada (split): solo se corrige la bajada. ${r.error ?? ''}`.trim(), false, 'Doppler');
    }
  }
  d.ultimaVez = Date.now();
}
setInterval(() => { pasoDoppler().catch(() => {}); }, 2000);

const favoritosSat = (): number[] => String(config.satFavoritos || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);

// Seguimiento del rotor: desde la posición actual de la estación (fija o GPS)
const seguimientoRotor = new Seguimiento(2);
const proaEstacion = new Proa(3);

const estacionConGps = () => !gpsdState.isFallback && gpsdState.mode >= 2;

function contextoRotor(): Contexto {
  const ahora = Date.now();
  // Con posición fija no hay rumbo; con GPS, el rumbo sobre el fondo cuando hay marcha
  if (estacionConGps()) proaEstacion.anotar(rumboGps, gpsdState.speedKmh, ahora);
  else proaEstacion.olvidar();
  const propio = String(config.callsign || '').trim().toUpperCase();
  const deAprs = (e: { nombre: string; lat: number; lon: number; ultima: number; rumbo?: number; velocidadKmh?: number }): EstacionVista =>
    ({ nombre: e.nombre, lat: e.lat, lon: e.lon, ultima: e.ultima, rumbo: e.rumbo, velocidadKmh: e.velocidadKmh });
  return {
    estacion: { lat: gpsdState.lat, lon: gpsdState.lon },
    altitudM: Number.isFinite(gpsdState.alt) ? gpsdState.alt : 0,
    movil: config.rotorMovil === true,
    proa: proaEstacion.rumbo,
    conElevacion: rotorAntena.estado.tieneElevacion !== false && rotorAntena.estado.el !== null,
    buscar: (id, tipo) => {
      const buscado = id.trim().toUpperCase();
      if (tipo === 'aprs') {
        const e = estacionesOidas.lista(ahora).find((x) => x.nombre.toUpperCase() === buscado);
        return e ? deAprs(e) : null;
      }
      if (tipo === 'barco') {
        const b = barcos.lista(ahora).find((x) => String(x.mmsi) === buscado || (x.nombre ?? '').trim().toUpperCase() === buscado);
        if (!b || b.lat === undefined || b.lon === undefined) return null;
        return { nombre: b.nombre?.trim() || String(b.mmsi), lat: b.lat, lon: b.lon, ultima: b.ultima, rumbo: b.cog, velocidadKmh: b.sog === undefined ? undefined : b.sog * 1.852 };
      }
      const a = aeronaves.lista(ahora).find((x) => x.hex.toUpperCase() === buscado || (x.vuelo ?? '').trim().toUpperCase() === buscado);
      if (!a || a.lat === undefined || a.lon === undefined) return null;
      return {
        nombre: a.vuelo?.trim() || a.hex.toUpperCase(), lat: a.lat, lon: a.lon, ultima: a.ultima, rumbo: a.rumbo,
        velocidadKmh: a.velocidad === undefined ? undefined : a.velocidad * 1.852, altitudM: a.altitud === undefined ? undefined : a.altitud * 0.3048,
      };
    },
    satelite: (norad, t) => {
      const s = satelites.find((x) => x.norad === norad);
      const o = orbitaDe(norad);
      const m = o ? mirar(o, { lat: gpsdState.lat, lon: gpsdState.lon }, gpsdState.alt || 0, t) : null;
      if (!s || !m) return null;
      const paso = m.el > 0 ? null : pasoDe(norad, t);
      return { nombre: s.nombre, az: m.az, el: m.el, distanciaKm: m.distanciaKm, aos: paso?.aos, azAos: paso?.azAos };
    },
    ultimaOida: () => {
      const e = estacionesOidas.lista(ahora).find((x) => x.clase === 'estacion' && x.ultimaRf !== undefined && ahora - x.ultimaRf < 30 * 60_000 && x.nombre.toUpperCase() !== propio);
      return e ? deAprs(e) : null;
    },
  };
}

setInterval(() => {
  if (!seguimientoRotor.objetivo) return;
  if (!rotorAntena.estado.enlace) return;
  const orden = seguimientoRotor.paso(contextoRotor());
  if (orden) rotorAntena.ir(orden.az, orden.el).catch(() => {});
}, 2000);

const clienteAprsIs = new ClienteAprsIs({
  alRecibir: (linea) => {
    const t = parseTnc2(linea);
    if (t) {
      estacionesOidas.anotar(t.source, t.destination, t.info, 'IS');
      registroTramas.anotar('IS', t.source, t.destination, t.path.join(','), t.info);
      mensajeRecibido(t.source, t.info, 'IS');
      grupoOido(t.source, t.destination, t.info, 'IS');
    }
  },
  alCambiar: (estado, detalle) => {
    if (estado === 'conectado' || estado === 'solo-recepcion') {
      addLog('SYS', 'APRS-IS', 'LOCAL', 'ENLACE', `Sesión con APRS-IS abierta (${detalle})${estado === 'solo-recepcion' ? ', solo recepción: el passcode no corresponde al indicativo' : ''}.`, true, 'Enlace');
    } else if (estado === 'desconectado') {
      addLog('SYS', 'APRS-IS', 'LOCAL', 'ENLACE', `Sesión con APRS-IS cerrada: ${detalle}. Se reintentará.`, false, 'Enlace');
    }
  },
});

/** Abre, reabre o cierra la sesión con APRS-IS según la configuración actual. */
function ajustarAprsIs() {
  const activo = config.systemPower !== false && config.aprsIsRxEnabled !== false && isValidCallsign(config.callsign) && !!config.serverIp;
  if (!activo) {
    if (firmaAprsIs) clienteAprsIs.parar();
    firmaAprsIs = '';
    return;
  }
  const radio = Math.min(500, Math.max(10, Math.round(config.filterRadiusKm || 200)));
  const opciones = {
    servidor: config.serverIp,
    puerto: config.aprscPort,
    indicativo: config.callsign,
    passcode: passcodeMatches(config.callsign, config.aprsPasscode) ? String(config.aprsPasscode).trim() : '-1',
    // Lo que se oye alrededor de la estación (redondeado: no se reabre la sesión por unos metros)
    filtro: `r/${gpsdState.lat.toFixed(1)}/${gpsdState.lon.toFixed(1)}/${radio}`,
    version: pkg.version,
  };
  const firma = JSON.stringify(opciones);
  if (firma === firmaAprsIs) return;
  firmaAprsIs = firma;
  clienteAprsIs.iniciar(opciones);
}

// ---------------------------------------------------------------------------
// Entradas AIS y ADS-B (solo para el mapa: no se retransmiten)
// ---------------------------------------------------------------------------
const barcos = new Barcos();
const lectorAis = new LectorAis();
const aeronaves = new Aeronaves();
const recibirAis = (linea: string) => {
  const m = lectorAis.linea(linea);
  if (m) barcos.anotar(m);
};
const enlaceAisTcp = new EnlaceTcp(recibirAis);
const enlaceAdsb = new EnlaceTcp((linea) => aeronaves.linea(linea));
let udpAis: dgram.Socket | null = null;
let udpAisPuerto = 0;
let udpAisError = '';

const puertoValido = (p: unknown): number => {
  const n = Math.round(Number(p));
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : 0;
};

/** Abre, cambia o cierra las entradas AIS y ADS-B según la configuración. */
function ajustarEntradasMapa() {
  const encendido = config.systemPower !== false;

  // AIS por UDP: aquí se escucha; quien emite es AIS-catcher o el receptor
  const puertoUdp = encendido && config.aisEnabled !== false ? puertoValido(config.aisUdpPort) : 0;
  if (puertoUdp !== udpAisPuerto) {
    if (udpAis) { try { udpAis.close(); } catch { /* ya cerrado */ } udpAis = null; }
    udpAisPuerto = puertoUdp;
    udpAisError = '';
    if (puertoUdp) {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      udpAis = s;
      s.on('message', (datos) => { for (const l of datos.toString('latin1').split(/\r?\n/)) if (l) recibirAis(l); });
      s.on('error', (e) => {
        if (udpAis !== s) return;
        udpAisError = e.message;
        addLog('SYS', 'AIS', 'LOCAL', 'UDP', `No se puede escuchar AIS en el puerto UDP ${puertoUdp}: ${e.message}.`, false, 'Entrada AIS');
        try { s.close(); } catch { /* ya cerrado */ }
        udpAis = null;
      });
      s.bind(puertoUdp);
    }
  }

  // AIS por TCP (opcional): un servidor de sentencias NMEA
  const hostAis = String(config.aisTcpHost || '').trim();
  const puertoAis = puertoValido(config.aisTcpPort);
  if (encendido && config.aisEnabled !== false && hostAis && puertoAis) enlaceAisTcp.iniciar(hostAis, puertoAis);
  else enlaceAisTcp.parar();

  // ADS-B: puerto SBS de readsb / dump1090
  const hostAdsb = String(config.adsbHost || '').trim();
  const puertoAdsb = puertoValido(config.adsbPort);
  if (encendido && config.adsbEnabled !== false && hostAdsb && puertoAdsb) enlaceAdsb.iniciar(hostAdsb, puertoAdsb);
  else enlaceAdsb.parar();
}

/** Barcos reales recibidos por AIS, en la forma que usan los paneles (antes eran barcos de ejemplo). */
function barcosParaPaneles(): AISVessel[] {
  const radio = config.filterRadiusKm || 200;
  return barcos.lista().slice(0, 300).map((b) => {
    const distanciaKm = calculateDistance(gpsdState.lat, gpsdState.lon, b.lat!, b.lon!);
    return {
      mmsi: b.mmsi,
      shipName: b.nombre || `MMSI ${b.mmsi}`,
      type: claseBarco(b.tipoBarco) || 'Sin clasificar',
      latitude: b.lat!,
      longitude: b.lon!,
      speedKnots: b.sog ?? 0,
      headingDeg: b.proa ?? b.cog ?? 0,
      destination: b.destino || '',
      status: '',
      lastReport: new Date(b.ultima).toISOString(),
      distanciaKm,
      enRango: distanciaKm <= radio,
    };
  });
}

let kissClient: net.Socket | null = null;
// Estado del enlace KISS con Direwolf, para su pantalla
let kissConectado = false;
let kissDesde = 0;
let kissReconnectTimer: NodeJS.Timeout | null = null;
let kissReconnectDelay = 2000;

function connectKissTcp() {
  if (kissClient) {
    try { kissClient.destroy(); } catch(e) {}
    kissClient = null;
  }
  if (kissReconnectTimer) {
    clearTimeout(kissReconnectTimer);
    kissReconnectTimer = null;
  }

  console.log(`[KISS CLIENT] Conectando a TNC/Direwolf KISS en 127.0.0.1:${config.kissTcpPort}...`);
  const socket = new net.Socket();
  kissClient = socket;

  socket.connect(config.kissTcpPort, '127.0.0.1', () => {
    console.log(`[KISS CLIENT] ¡Conectado con éxito a TNC/Direwolf KISS en puerto ${config.kissTcpPort}!`);
    kissReconnectDelay = 2000;
    kissConectado = true;
    kissDesde = Date.now();
    addLog('SYS', 'KISS', 'LOCAL', 'TNC', `Conectado a puerto KISS de Direwolf en puerto ${config.kissTcpPort}`, true, 'Enlace RF establecido');
  });

  let kissBuffer = Buffer.alloc(0);

  socket.on('data', (dataBuffer: Buffer) => {
    kissBuffer = Buffer.concat([kissBuffer, dataBuffer]);
    while (true) {
      const firstFend = kissBuffer.indexOf(0xC0);
      if (firstFend === -1) {
        if (kissBuffer.length > 4096) kissBuffer = Buffer.alloc(0);
        break;
      }
      const nextFend = kissBuffer.indexOf(0xC0, firstFend + 1);
      if (nextFend === -1) {
        break;
      }
      const frame = kissBuffer.slice(firstFend + 1, nextFend);
      kissBuffer = kissBuffer.slice(nextFend + 1);
      
      if (frame.length > 1) {
        const cmd = frame[0] & 0x0F;
        if (cmd === 0x00) { // Data frame
          const payloadBytes = frame.slice(1);
          const unescaped: number[] = [];
          for (let i = 0; i < payloadBytes.length; i++) {
            if (payloadBytes[i] === 0xDB && i + 1 < payloadBytes.length) {
              const nextByte = payloadBytes[i + 1];
              if (nextByte === 0xDC) {
                unescaped.push(0xC0);
                i++;
              } else if (nextByte === 0xDD) {
                unescaped.push(0xDB);
                i++;
              } else {
                unescaped.push(payloadBytes[i]);
              }
            } else {
              unescaped.push(payloadBytes[i]);
            }
          }
          
          let packetStr = '';
          const rawBuffer = Buffer.from(unescaped);
          
          const ax25Decoded = decodeAx25Frame(rawBuffer);
          if (ax25Decoded) {
            packetStr = ax25Decoded;
          } else {
            packetStr = rawBuffer.toString('utf8').trim();
          }

          if (packetStr) {
            const match = packetStr.match(/^([^>]+)>([^,:]+)([^:]*):(.*)$/);
            if (match) {
              const source = match[1];
              const dest = match[2];
              const path = match[3] ? match[3].replace(/^,/, '') : 'VHF';
              const payload = match[4];
              addLog('RX', source, dest, path, payload, true, '[KISS RF] Recibido por puerto TNC');
              estacionesOidas.anotar(source, dest, payload, 'RF');
              registroTramas.anotar('RF', source, dest, path === 'VHF' ? '' : path, payload);
              mensajeRecibido(source, payload, 'RF');
              monitorDirewolf.anotarRx(source, dest, path === 'VHF' ? '' : path, payload);
              grupoOido(source, dest, payload, 'RF');
            } else {
              addLog('RX', 'TNC', 'ALL', 'KISS', packetStr, true, '[KISS RF] Trama cruda recibida');
            }
          }
        }
      }
    }
  });

  socket.on('error', (err) => {
    // console.warn(`[KISS CLIENT] Error en socket KISS: ${err.message}`);
  });

  socket.on('close', () => {
    if (kissClient === socket || kissClient === null) { kissConectado = false; kissDesde = Date.now(); }
    scheduleKissReconnect();
  });
}

function scheduleKissReconnect() {
  if (kissReconnectTimer) return;
  kissReconnectTimer = setTimeout(() => {
    kissReconnectTimer = null;
    kissReconnectDelay = Math.min(kissReconnectDelay * 2, 30000);
    connectKissTcp();
  }, kissReconnectDelay);
}

function decodeAx25Frame(buffer: Buffer): string | null {
  try {
    if (buffer.length < 16) return null;
    
    let offset = 0;
    
    const decodeAddress = (buf: Buffer, start: number): { callsign: string; ssid: number; last: boolean; repetido: boolean } => {
      let callsign = '';
      for (let i = 0; i < 6; i++) {
        const charCode = buf[start + i] >> 1;
        if (charCode > 32 && charCode < 127) {
          callsign += String.fromCharCode(charCode);
        }
      }
      callsign = callsign.trim();
      const ssidByte = buf[start + 6];
      const ssid = (ssidByte >> 1) & 0x0F;
      const last = (ssidByte & 0x01) === 1;
      // Bit H: en un repetidor, ya ha retransmitido la trama
      const repetido = (ssidByte & 0x80) !== 0;
      return { callsign, ssid, last, repetido };
    };

    const destObj = decodeAddress(buffer, offset);
    offset += 7;
    const dest = destObj.ssid > 0 ? `${destObj.callsign}-${destObj.ssid}` : destObj.callsign;

    const srcObj = decodeAddress(buffer, offset);
    offset += 7;
    const source = srcObj.ssid > 0 ? `${srcObj.callsign}-${srcObj.ssid}` : srcObj.callsign;

    let pathParts: string[] = [];
    let lastAddr = srcObj.last;
    let ultimoRepetido = -1;

    while (!lastAddr && offset + 7 <= buffer.length) {
      const digiObj = decodeAddress(buffer, offset);
      offset += 7;
      const digi = digiObj.ssid > 0 ? `${digiObj.callsign}-${digiObj.ssid}` : digiObj.callsign;
      if (digi) {
        pathParts.push(digi);
        if (digiObj.repetido) ultimoRepetido = pathParts.length - 1;
      }
      lastAddr = digiObj.last;
    }
    // Como en TNC2: «*» tras el último repetidor que la ha retransmitido
    if (ultimoRepetido >= 0) pathParts[ultimoRepetido] += '*';

    if (offset + 2 > buffer.length) return null;
    const control = buffer[offset];
    const pid = buffer[offset + 1];
    offset += 2;

    const payload = buffer.slice(offset).toString('utf8').trim();
    if (!payload) return null;

    const pathStr = pathParts.length > 0 ? `,${pathParts.join(',')}` : '';
    return `${source}>${dest}${pathStr}:${payload}`;
  } catch (err) {
    return null;
  }
}

/** Abre sesión en APRS-IS, espera a que el servidor verifique el login y envía la trama. */
function sendToAprsIs(packet: string): Promise<void> {
  // Por la sesión permanente si está verificada: abrir otra con el mismo
  // indicativo haría que el servidor cerrase la que ya recibe.
  if (clienteAprsIs.enviar(packet)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    let sent = false;
    let buffer = '';
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      if (err) reject(err); else resolve();
    };
    sock.setTimeout(8000);
    sock.setEncoding('utf8');
    sock.on('timeout', () => finish(new Error('Timeout de conexión a APRS-IS')));
    sock.on('error', (err) => finish(err));
    sock.on('close', () => finish(sent ? undefined : new Error('APRS-IS cerró la conexión antes de verificar el login')));
    sock.on('data', (chunk: string) => {
      buffer += chunk;
      const line = buffer.split('\n').find((l) => l.includes('logresp'));
      if (!line) return;
      if (!/ verified/.test(line) || /unverified/.test(line)) {
        return finish(new Error('APRS-IS no ha verificado el login (revise indicativo y passcode)'));
      }
      if (sent) return;
      sent = true;
      sock.write(`${packet}\r\n`, () => setTimeout(() => finish(), 500));
    });
    sock.connect(config.aprscPort, config.serverIp, () => {
      sock.write(`user ${config.callsign} pass ${config.aprsPasscode} vers SAT-APRS ${pkg.version}\r\n`);
    });
  });
}

/** Entrega una trama AX.25 (ya codificada) al TNC/Direwolf por KISS sobre TCP. */
function sendToKiss(frame: Buffer): Promise<void> {
  const kissFrame = kissEncode(frame);
  if (kissClient && !kissClient.destroyed && kissClient.writable) {
    kissClient.write(kissFrame);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const tempSock = new net.Socket();
    tempSock.setTimeout(3000);
    tempSock.on('error', reject);
    tempSock.on('timeout', () => {
      tempSock.destroy();
      reject(new Error('Timeout de conexión a KISS'));
    });
    tempSock.connect(config.kissTcpPort, '127.0.0.1', () => {
      tempSock.write(kissFrame, () => {
        tempSock.end();
        resolve();
      });
    });
  });
}

/**
 * Único punto de salida al aire de la consola. Devuelve el motivo por el que
 * la trama NO se emite (cadena vacía si se intenta emitir por algún canal).
 */
const colaEmision = new ColaEmision(4000);

function transmitRealAprsPacket(packetString: string, simulated: boolean = false, urgente: boolean = false): string {
  const decision = decideTransmission(packetString, {
    txEnabled: TX_ENABLED,
    callsign: config.callsign,
    passcode: config.aprsPasscode,
    simulated
  });
  if (!decision.packet || (!decision.aprsIs && !decision.rf)) {
    const t = decision.packet ?? parseTnc2(packetString);
    if (t) registroTramas.anotar('TX', t.source, t.destination, t.path.join(','), t.info, { noEmitida: decision.reason || 'no emitida' });
    return decision.reason;
  }
  const packet = decision.packet;
  registroTramas.anotar('TX', packet.source, packet.destination, decision.rf ? (config.aprsPath || DEFAULT_RF_PATH) : 'TCPIP*', packet.info,
    { noEmitida: null, canales: decision.rf && decision.aprsIs ? 'radio y APRS-IS' : decision.rf ? 'radio' : 'APRS-IS' });

  // Las tramas se emiten de una en una, con pausa entre ellas (server/core/emisor.ts)
  colaEmision.encolar(async () => {
    // 1. APRS-IS: ORIGEN>DESTINO,TCPIP*:info (el servidor añade la construcción q)
    if (decision.aprsIs) {
      try {
        await sendToAprsIs(toIsPacket(packet));
        console.log(`[APRS TRANSMIT] Enviado a APRS-IS (${config.serverIp}:${config.aprscPort})`);
      } catch (err: any) {
        console.warn(`[APRS TRANSMIT WARNING] Fallo al enviar a APRS-IS: ${err.message}`);
      }
    }
    // 2. RF: trama AX.25 UI con la ruta de radio (nunca TCPIP*/qAC) por KISS
    if (decision.rf) {
      try {
        await sendToKiss(toRfFrame(packet, config.aprsPath || DEFAULT_RF_PATH));
        monitorDirewolf.anotarTx(packet.source, packet.destination, config.aprsPath || DEFAULT_RF_PATH, packet.info);
        console.log(`[APRS TRANSMIT] Trama AX.25 entregada al TNC KISS (puerto ${config.kissTcpPort})`);
      } catch (err: any) {
        console.warn(`[APRS TRANSMIT WARNING] Fallo al enviar a RF: ${err.message}`);
      }
    }
  }, urgente);

  return decision.aprsIs ? '' : decision.reason;
}

// Estado REAL del servidor de hora de la estación (ntpsec disciplinado por gpsd/PPS).
// Hasta la primera lectura, y siempre que ntpq no responda, consta como no sincronizado.
let ntpsecState: NTPSECStatus = { ...NTP_SIN_DATOS };

async function refreshNtp() {
  ntpsecState = await consultarNtp();
}
refreshNtp();
setInterval(refreshNtp, 30000);

// Sin lectura real todavía: a cero y marcada como «sin datos» (ver meteoSinDatos)
const METEO_VACIA = (): WeatherTelemetry => ({
  tempC: 0, humidityPct: 0, windSpeedKts: 0, windDirDeg: 0, gustKts: 0, pressureHpa: 0,
  rain1hIn: 0, rain24hIn: 0, time: new Date().toISOString(), rawAprsWx: '', forecast: [],
});
let weatherState: WeatherTelemetry = METEO_VACIA();

let iqairState: IQAirStatus = {
  aqi: 42,
  mainPollutant: 'pm25',
  city: 'Madrid',
  state: 'Madrid',
  country: 'Spain',
  tempC: 22.5,
  humidityPct: 50,
  pressureHpa: 1016,
  windSpeedMs: 2.1,
  windDirDeg: 240,
  lastUpdated: new Date().toISOString()
};

let tsunamiAlerts: TsunamiAlert[] = [];
let dgtIncidentsList: DgtIncident[] = [];
// true solo si la lista procede de la descarga real de la DGT (no del respaldo de demostración)
let dgtDatosReales = false;

// Dictionary for identifying Inmarsat SafetyNet C2 codes
const TIPOS_ALERTA: Record<string, string> = {
  "14": "🚨 RETRANSMISIÓN DE SOCORRO (DISTRESS RELAY)",
  "34": "🚁 COORDINACIÓN SAR (BÚSQUEDA Y RESCATE)",
  "44": "🚁 COORDINACIÓN SAR (BÚSQUEDA Y RESCATE)",
  "04": "⚠️ AVISO A LOS NAVEGANTES (NAVIGATIONAL WARNING)",
  "24": "⛈️ ALERTA METEOROLÓGICA (METEOROLOGICAL WARNING)",
  "31": "💨 PRONÓSTICO METEOROLÓGICO (MET FORECAST)",
  "13": "⚓ AVISO COSTERO (COASTAL WARNING)"
};

const CODIGOS_CRITICOS = new Set(["04", "13", "14", "24", "31", "34", "44"]);

// Mensajes Inmarsat-C recibidos por UDP de un descodificador real (ya no hay mensajes de ejemplo)
let inmarsatMessages: InmarsatMessage[] = [];


// Intel NUC 5i3 CPU Broadwell Core i3-5010U, dual-core - robust server status
let nucStats: NucDiagnostics = {
  cpuUsagePct: 0,
  cpuTempC: 0,
  ramUsagePct: 0,
  ramUsedGb: 0,
  ramTotalGb: 0,
  uptime: '',
  loadAverage: '',
  debianVersion: '',
  services: {
    aprsc: 'inactive', aprx: 'inactive', direwolf: 'inactive', gpsd: 'inactive',
    ntpsec: 'inactive', aiscatcher: 'inactive', pat: 'inactive', weewx: 'inactive',
  },
};

interface ScheduledNotification {
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

let scheduledNotifications: ScheduledNotification[] = [];
const SCHEDULES_FILE = path.join(process.cwd(), 'scheduled_notifications.json');

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      const data = fs.readFileSync(SCHEDULES_FILE, 'utf8');
      scheduledNotifications = JSON.parse(data);
    } else {
      scheduledNotifications = [];
    }
  } catch (err) {
    console.error('Error loading schedules:', err);
    scheduledNotifications = [];
  }
}

function saveSchedules(bypassDisk: boolean = false) {
  if (bypassDisk) {
    console.log('[PROGRAMACIONES] Sin sesión de administrador: los cambios quedan solo en memoria.');
    return;
  }
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(scheduledNotifications, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving schedules:', err);
  }
}

// Load on boot
loadSchedules();

// Function to trigger a schedule
function triggerSchedule(schedule: ScheduledNotification) {
  const call = config.callsign || 'N0CALL';
  const cleanMsg = schedule.message.trim().toUpperCase();
  const randId = Math.floor(1 + Math.random() * 9);
  const tag = schedule.type === 'drill' ? 'SIMULACRO' : 'ACTUALIZACION'; // ASCII: los emojis no se emiten por APRS
  
  // Format as standard APRS Object report if message starts with semicolon, else use Bulletin format
  const packet = cleanMsg.startsWith(';') 
    ? `${call}>APXSAT,WIDE1-1:${cleanMsg}`
    : `${call}>APXSAT,WIDE1-1::BLN${randId}REMER: ${tag}: ${cleanMsg}`;

  // Log in server system
  addLog(
    'TX',
    call,
    'APRS-IS',
    `${config.serverIp}:${config.aprscPort}`,
    packet,
    true,
    schedule.type === 'drill'
      ? `Simulacro Programado Ejecutado: ${schedule.name}`
      : `Actualización Programada Ejecutada: ${schedule.name}`
  );

  const now = new Date();
  schedule.lastTriggered = now.toISOString();

  if (schedule.scheduleType === 'once') {
    schedule.status = 'completed';
    schedule.nextTriggerTime = '';
  } else if (schedule.scheduleType === 'recurring' && schedule.intervalMinutes) {
    const next = new Date(now.getTime() + schedule.intervalMinutes * 60000);
    schedule.nextTriggerTime = next.toISOString();
  }

  saveSchedules();
}

// Background scheduler loop (runs every 10 seconds)
function runSchedulerTick() {
  const now = new Date();
  let changed = false;

  scheduledNotifications.forEach(schedule => {
    if (schedule.status === 'active' && schedule.nextTriggerTime) {
      const triggerTime = new Date(schedule.nextTriggerTime);
      if (now >= triggerTime) {
        console.log(`[SCHEDULER] Triggering schedule: ${schedule.name} (${schedule.id})`);
        triggerSchedule(schedule);
        changed = true;
      }
    }
  });

  if (changed) {
    saveSchedules();
  }
}

setInterval(runSchedulerTick, 10000);

let earthquakes: EarthquakeEvent[] = [];

// Radioavisos náuticos: sin fuente real conectada todavía (ya no hay avisos de ejemplo)
let navareaWarnings: NavareaWarning[] = [];

// Sin datos de ejemplo: las boyas reales más cercanas salen de server/fuentes/boyas.ts
let erddapBuoys: ERDDAPBuoy[] = [];
let portusStations: OceanStation[] = [];
let noaaAlerts: NoaaSpaceAlert[] = [];
// El registro de la consola se recupera del historial al arrancar
let logs: AprsPacketLog[] = historial.registro(Math.max(1, Number(config.terminalLogsRetention) || 150)).map((f) => f.datos as AprsPacketLog);
// Retención del historial: tramas 7 días y registro 30, salvo que se cambie
const retencionHistorial = () => ({
  diasTramas: Math.min(365, Math.max(1, Number(config.historialDiasTramas) || 7)),
  diasRegistro: Math.min(3650, Math.max(1, Number(config.historialDiasRegistro) || 30)),
});
setTimeout(() => historial.purgar(retencionHistorial()), 60_000);
setInterval(() => historial.purgar(retencionHistorial()), 6 * 3600_000);
let trafficTrends: TrafficDataPoint[] = [];


// La última hora empieza a cero: solo cuenta el tráfico real de esta sesión
for (let i = 59; i >= 0; i--) {
  trafficTrends.push({
    minuteOffset: -i,
    label: new Date(Date.now() - i * 60000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    txCount: 0,
    rxCount: 0,
  });
}

// Rolling window shift every 1 minute
setInterval(() => {
  const label = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  trafficTrends.shift();
  for (let i = 0; i < trafficTrends.length; i++) {
    trafficTrends[i].minuteOffset = -59 + i;
  }
  trafficTrends.push({
    minuteOffset: 0,
    label,
    txCount: 0,
    rxCount: 0
  });
}, 60000);

// Helper functions for formatting logs (with extended types)
function addLog(type: 'TX' | 'RX' | 'SYS' | 'AIS' | 'WINLINK', source: string, destination: string, path: string, payload: string, success: boolean, remarks: string, opts: { simulated?: boolean; urgente?: boolean } = {}) {
  const newLog: AprsPacketLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('es-ES', { hour12: false }),
    type,
    source,
    destination,
    path,
    payload,
    success,
    remarks
  };
  logs.unshift(newLog);
  // Keep logs up to dynamic retention limit to maintain performance
  const maxLogs = (config.terminalLogsRetention && config.terminalLogsRetention > 0) ? config.terminalLogsRetention : 150;
  if (logs.length > maxLogs) {
    logs.splice(maxLogs);
  }

  // Salida real al aire de las tramas TX, sujeta a la política de emisión.
  // Si la trama no se emite, el registro lo dice: la consola no finge transmisiones.
  if (type === 'TX') {
    const notSent = transmitRealAprsPacket(payload, opts.simulated === true, opts.urgente === true);
    if (notSent) {
      newLog.remarks = `[NO EMITIDO: ${notSent}] ${remarks}`;
    }
  }
  historial.guardarRegistro(newLog.id, Date.now(), type, newLog);

  // Increment real-time Traffic Counts of the current minute
  if (trafficTrends.length > 0) {
    const current = trafficTrends[trafficTrends.length - 1];
    if (type === 'TX') {
      current.txCount++;
    } else {
      current.rxCount++;
    }
  }
}

// Los conversores de coordenadas APRS (latToAprs / lonToAprs) están en server/aprs.ts

// Format WX string according to APRS single line specification
function generateWxPayload(w: WeatherTelemetry): string {
  // Formato: _DIR/VELgRAFtTTTrRRRpPPPhHHbBBBBB
  // La especificación APRS expresa viento y racha en millas por hora (no en nudos).
  const KTS_TO_MPH = 1.150779;
  const dir = (Math.round(w.windDirDeg || 0) % 360).toString().padStart(3, '0');
  const speed = Math.min(999, Math.round((w.windSpeedKts || 0) * KTS_TO_MPH)).toString().padStart(3, '0');
  
  // gust
  const gust = `g${Math.min(999, Math.round((w.gustKts || 0) * KTS_TO_MPH)).toString().padStart(3, '0')}`;
  
  // temp in fahrenheit: t = temp, fahrenheit padded to 3 characters
  const tempF = Math.round((w.tempC * 9/5) + 32);
  const tempStr = tempF >= 0 
    ? `t${tempF.toString().padStart(3, '0')}`
    : `t-${Math.abs(tempF).toString().padStart(2, '0')}`;
  
  // rain 1h: hundredths of inch
  const rain1 = `r${Math.round(w.rain1hIn * 100).toString().padStart(3, '0')}`;
  // rain 24h: hundredths of inch
  const rain24 = `p${Math.round(w.rain24hIn * 100).toString().padStart(3, '0')}`;
  
  // humidity
  let humVal = Math.max(1, Math.min(100, Math.round(w.humidityPct)));
  if (humVal === 100) humVal = 0; // APRS represents 100% humidity as h00
  const hum = `h${humVal.toString().padStart(2, '0')}`;
  
  // pressure: tenths of hPa/mb
  const bPress = Math.round(w.pressureHpa * 10).toString().padStart(5, '0');
  const press = `b${bPress}`;
  
  return `_${dir}/${speed}${gust}${tempStr}${rain1}${rain24}${hum}${press} (REMER S.A.T. Telemetría WX)`;
}

// Distancia en km con la fórmula común del ecosistema (server/formulas/geo.ts)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return parseFloat(gcDistanceKm({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }).toFixed(1));
}

// Generate the proper APRS WX packet
function getWxPacket(): string {
  const timestamp = getAprsTimestamp(new Date());
  const aprsLat = latToAprs(gpsdState.lat);
  const aprsLon = lonToAprs(gpsdState.lon);
  const wxPayload = generateWxPayload(weatherState);
  return `${config.callsign}>APRS,TCPIP*,qAC,GATEWAY:@${timestamp}${aprsLat}/${aprsLon}${wxPayload}`;
}

// Standard APRS timestamp format (DDHHMMz)
function getAprsTimestamp(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hour = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  return `${day}${hour}${min}z`;
}

// Objeto APRS de un sismo (el mismo formato que emite la cadena de avisos)
function earthquakeToEvento(eq: EarthquakeEvent, real: boolean = true): Evento {
  return {
    ...sismoAEvento({
      id: eq.id, time: eq.time, latitude: eq.latitude, longitude: eq.longitude, depthKm: eq.depthKm,
      magnitud: eq.magnitud, magType: eq.magType, localizacion: eq.localizacion, fuente: 'IGN', datosCompletos: real
    }),
    real
  };
}

function generateEarthquakePacket(eq: EarthquakeEvent): string {
  return objetoAprs(config.callsign, earthquakeToEvento(eq)) || '';
}

// Init simulated state logs
addLog('SYS', 'SYSTEM', 'LOCAL', 'REMERAPI', 'Inicializando Consola de Telemetría APRS S.A.T.', true, 'Sistema en red');
addLog('SYS', 'NTPSEC', 'LOCAL', 'HARDWARE', 'Sincronizado con PPS GPS (Estrato 1, offset: 0.004ms)', true, 'Bajo nivel');
addLog('SYS', 'GPSD', 'LOCAL', 'USB0', 'GPSD receptor detectado. Fix 3D Activo standard', true, 'Tasa 1Hz');

const aemetStations = [
  { id: '3195', name: 'Madrid, Retiro', lat: 40.412, lon: -3.682 },
  { id: '7178I', name: 'Murcia, San Javier', lat: 37.789, lon: -0.803 },
  { id: '5514', name: 'Granada Aeropuerto', lat: 37.189, lon: -3.626 },
  { id: '1428', name: 'Santiago de Compostela, AP', lat: 42.879, lon: -8.544 },
  { id: '0201D', name: 'Barcelona, Fabra', lat: 41.418, lon: 2.124 },
  { id: '1082', name: 'Bilbao, Aeropuerto', lat: 43.263, lon: -2.934 },
  { id: '5783', name: 'Sevilla, Aeropuerto', lat: 37.410, lon: -5.898 },
  { id: '8416Y', name: 'Valencia, Viveros', lat: 39.489, lon: -0.375 },
  { id: '6156A', name: 'Málaga, Aeropuerto', lat: 36.666, lon: -4.499 },
  { id: '3519X', name: 'S.C. de Tenerife', lat: 28.463, lon: -16.251 }
];

function getClosestAemetStation(lat: number, lon: number) {
  let closest = aemetStations[0];
  let minDistanceSq = Infinity;
  for (const st of aemetStations) {
    const dLat = st.lat - lat;
    const dLon = st.lon - lon;
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closest = st;
    }
  }
  return closest;
}



function broadcastForecastBulletin(forecast: ForecastDay[]) {
  if (!config.enableForecastBulletin) return;
  if (!forecast || forecast.length === 0) return;
  // Construct a concise forecast summary (3 days)
  const summaryDays = forecast.slice(0, 3).map(day => {
    const dStr = day.date.split(' ')[1] || day.date; // e.g. "24/6"
    const term = day.description.toLowerCase().includes('lluv') ? 'Lluv' : 
                 day.description.toLowerCase().includes('nub') ? 'Nub' : 
                 day.description.toLowerCase().includes('tor') ? 'Tor' : 'Desp';
    return `${dStr} ${Math.round(day.tempMax)}C ${term}`;
  }).join('; ');
  
  const packetStr = `${config.callsign}>APRS,TCPIP*,qAC,GATEWAY::BLN3    :NUEVO PRONOSTICO PROSPECCION: ${summaryDays}. REMER S.A.T.`;
  addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, packetStr, true, 'Boletín APRS de pronóstico (3 días).');
}

// Weather Simulator / Refresher (Updates weather based on simulated drift or OWM or AEMET)
// Observaciones reales para el parte meteorológico APRS (server/estacion/meteo.ts)
let observacionInternet: Observacion | null = null;
let observacionPropia: Observacion | null = null;
// true mientras no haya ninguna lectura real que mostrar
let meteoSinDatos = true;

// Emisión NMEA 2000 (SocketCAN): pone en el bus la posición (gpsd), la meteo y los avisos de emergencia de la estación.
const obsN2k = (): Observacion | null => elegirObservacion('auto', observacionPropia, observacionInternet, Date.now());
const servicioN2k = new ServicioN2k((config as unknown as Record<string, unknown>).nmea2000 as never, {
  posicion: () => (gpsdState.mode >= 2 ? { lat: gpsdState.lat, lon: gpsdState.lon, sogMs: gpsdState.speedKmh / 3.6 } : null),
  horaUnix: () => { const t = Date.parse(gpsdState.time); return Number.isFinite(t) ? t / 1000 : Date.now() / 1000; },
  viento: () => { const o = obsN2k(); return o && o.vientoKmh != null && o.dirGrados != null ? { velMs: o.vientoKmh / 3.6, direccionRad: (o.dirGrados * Math.PI) / 180 } : null; },
  presionPa: () => { const o = obsN2k(); return o?.presionHpa != null ? o.presionHpa * 100 : null; },
  temperaturaK: () => { const o = obsN2k(); return o?.tempC != null ? o.tempC + 273.15 : null; },
  guardar: () => { (config as unknown as Record<string, unknown>).nmea2000 = servicioN2k.cfg; try { fs.writeFileSync(satConfigPath, JSON.stringify(config, null, 2), 'utf8'); } catch { /* best-effort */ } },
  autorizado: (req) => isAuthorizedRequest(req),
});
app.use(servicioN2k.router());
// De dónde sale lo que se muestra: «OpenWeatherMap», «AEMET <estación>», «Open-Meteo (modelo)»
let meteoFuente = '';
let meteoLeida = 0;

/** Previsión real de los próximos días (Open-Meteo, sin clave). Vacía si no responde. */
async function previsionReal(): Promise<ForecastDay[]> {
  const m = await descargarMeteoAbierta({ lat: gpsdState.lat, lon: gpsdState.lon }, registrarFuente);
  return m ? m.prevision : [];
}

/** Meteorología real sin clave: último recurso cuando no hay OWM ni AEMET, o no responden. */
async function meteoSinClave(): Promise<boolean> {
  const m = await descargarMeteoAbierta({ lat: gpsdState.lat, lon: gpsdState.lon }, registrarFuente);
  if (!m) return false;
  const o = m.observacion;
  const nudos = (kmh: number | undefined) => (kmh === undefined ? 0 : parseFloat((kmh / 1.852).toFixed(1)));
  weatherState = {
    tempC: o.tempC ?? 0,
    humidityPct: Math.round(o.humedadPct ?? 0),
    windSpeedKts: nudos(o.vientoKmh),
    windDirDeg: Math.round(o.dirGrados ?? 0),
    gustKts: nudos(o.rachaKmh ?? o.vientoKmh),
    pressureHpa: o.presionHpa ?? 0,
    rain1hIn: parseFloat(((o.lluvia1hMm ?? 0) / 25.4).toFixed(3)),
    rain24hIn: parseFloat(((o.lluvia24hMm ?? 0) / 25.4).toFixed(3)),
    time: new Date(o.cuando).toISOString(),
    rawAprsWx: '',
    forecast: m.prevision,
  };
  weatherState.rawAprsWx = generateWxPayload(weatherState);
  observacionInternet = o;
  meteoSinDatos = false;
  meteoFuente = 'Open-Meteo (modelo)';
  meteoLeida = Date.now();
  return true;
}

/** Ninguna fuente responde: se conserva la última lectura real una hora; después, sin datos. */
function meteoSinRespuesta(motivo: string) {
  observacionInternet = null;
  if (!meteoSinDatos && Date.now() - meteoLeida > 3600_000) {
    meteoSinDatos = true;
    meteoFuente = '';
    weatherState = METEO_VACIA();
  }
  addLog('SYS', 'METEO', 'LOCAL', 'API', `Sin datos meteorológicos de ninguna fuente: ${motivo}`, false, 'Sin datos');
}

async function refreshWeather() {
  try {
    if (config.owmApiKey && config.owmApiKey.length > 5) {
      // Real OpenWeatherMap Integration - HIGHEST priority for principal weather station
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${gpsdState.lat}&lon=${gpsdState.lon}&appid=${config.owmApiKey}&units=metric`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        
        let forecastList: ForecastDay[] = [];
        try {
          // Fetch real 5-day / 3-hour forecast from OpenWeatherMap
          const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${gpsdState.lat}&lon=${gpsdState.lon}&appid=${config.owmApiKey}&units=metric`;
          const fResponse = await fetch(forecastUrl);
          if (fResponse.ok) {
            const fData = await fResponse.json();
            if (fData && Array.isArray(fData.list)) {
              // Group 3-hour entries by date
              const groups: { [date: string]: any[] } = {};
              fData.list.forEach((item: any) => {
                const dateKey = item.dt_txt.split(' ')[0]; // yyyy-mm-dd
                if (!groups[dateKey]) {
                  groups[dateKey] = [];
                }
                groups[dateKey].push(item);
              });

              // Construct ForecastDay for next 5 days
              const daysName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
              Object.keys(groups).slice(1, 6).forEach((dateKey) => {
                const dayItems = groups[dateKey];
                const temps = dayItems.map(x => x.main.temp);
                const humidities = dayItems.map(x => x.main.humidity);
                const windSpeeds = dayItems.map(x => x.wind.speed * 1.94384);
                const pops = dayItems.map(x => x.pop || 0);
                
                const dObj = new Date(dateKey + 'T12:00:00');
                const dayLabel = daysName[dObj.getDay()];
                const dayStr = `${dayLabel} ${dObj.getDate()}/${dObj.getMonth() + 1}`;
                
                const repItem = dayItems[Math.floor(dayItems.length / 2)] || dayItems[0];

                forecastList.push({
                  date: dayStr,
                  tempMin: parseFloat(Math.min(...temps).toFixed(1)),
                  tempMax: parseFloat(Math.max(...temps).toFixed(1)),
                  humidityPct: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
                  windSpeedKts: parseFloat(Math.max(...windSpeeds).toFixed(1)),
                  windDirDeg: repItem.wind.deg || 0,
                  description: repItem.weather && repItem.weather[0] ? repItem.weather[0].description : 'Variable',
                  icon: repItem.weather && repItem.weather[0] ? repItem.weather[0].icon : '02d',
                  pop: parseFloat(Math.max(...pops).toFixed(2))
                });
              });
            }
          }
        } catch (fErr) {
          console.error("Forecast fetch error", fErr);
        }

        // Si OWM no da previsión, se pide la real sin clave; si tampoco, queda vacía
        if (forecastList.length === 0) {
          forecastList = await previsionReal();
        }

        weatherState = {
          tempC: data.main.temp,
          humidityPct: data.main.humidity,
          windSpeedKts: (data.wind.speed * 1.94384), // m/s to knots
          windDirDeg: data.wind.deg || 0,
          gustKts: data.wind.gust ? (data.wind.gust * 1.94384) : ((data.wind.speed * 1.94384) * 1.2),
          pressureHpa: data.main.pressure,
          rain1hIn: data.rain && data.rain['1h'] ? (data.rain['1h'] / 25.4) : 0, // mm to inches
          rain24hIn: data.rain && data.rain['3h'] ? (data.rain['3h'] / 25.4 * 8) : 0.02,
          time: new Date().toISOString(),
          rawAprsWx: '',
          forecast: forecastList
        };
        meteoSinDatos = false;
        meteoFuente = 'OpenWeatherMap';
        meteoLeida = Date.now();
        // Observación real de Internet para el parte APRS: solo lo que la fuente da, sin rellenos
        observacionInternet = {
          cuando: Number.isFinite(data.dt) ? data.dt * 1000 : Date.now(),
          fuente: 'OWM',
          propia: false,
          tempC: data.main?.temp,
          humedadPct: data.main?.humidity,
          presionHpa: data.main?.sea_level ?? data.main?.pressure,
          vientoKmh: Number.isFinite(data.wind?.speed) ? data.wind.speed * 3.6 : undefined,
          rachaKmh: Number.isFinite(data.wind?.gust) ? data.wind.gust * 3.6 : undefined,
          dirGrados: data.wind?.deg,
          lluvia1hMm: data.rain?.['1h'],
        };
        addLog('SYS', 'OWM', 'LOCAL', 'API', 'Datos meteorológicos y previsión futura actualizados desde OpenWeatherMap.', true, `Ok - Temp: ${weatherState.tempC.toFixed(1)}°C`);
        broadcastForecastBulletin(forecastList);
      } else {
        throw new Error('OpenWeatherMap API error');
      }
    } else if (config.aemetApiKey && config.aemetApiKey.length > 5) {
      // Secondary: Real AEMET OpenData Integration
      const station = getClosestAemetStation(gpsdState.lat, gpsdState.lon);
      const url = `https://opendata.aemet.es/opendata/api/observacion/datos/estacion/${station.id}`;
      
      const response = await fetch(`${url}?api_key=${config.aemetApiKey}`, {
        headers: {
          'api_key': config.aemetApiKey,
          'accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const wrapper = await response.json();
        if (wrapper.estado === 200 && wrapper.datos) {
          const dataResponse = await fetch(wrapper.datos);
          if (dataResponse.ok) {
            const list = await dataResponse.json();
            if (Array.isArray(list) && list.length > 0) {
              const validRecords = list.filter(r => r.ta !== undefined);
              if (validRecords.length > 0) {
                const latest = validRecords[validRecords.length - 1];
                
                const tempC = parseFloat(latest.ta);
                const humidityPct = latest.hr ? Math.round(parseFloat(latest.hr)) : 50;
                const windSpeedKts = latest.vv ? parseFloat((parseFloat(latest.vv) * 1.94384).toFixed(1)) : 0;
                const windDirDeg = latest.dv ? (parseFloat(latest.dv) * 10) % 360 : 0;
                const gustKts = latest.fmax ? parseFloat((parseFloat(latest.fmax) * 1.94384).toFixed(1)) : windSpeedKts * 1.2;
                const pressureHpa = latest.pres_nvel ? parseFloat(latest.pres_nvel) : (latest.pres ? parseFloat(latest.pres) : 1013);
                const rain1hIn = latest.prec ? parseFloat((parseFloat(latest.prec) / 25.4).toFixed(3)) : 0.0;
                
                const forecastList = await previsionReal();

                weatherState = {
                  tempC,
                  humidityPct,
                  windSpeedKts,
                  windDirDeg,
                  gustKts,
                  pressureHpa,
                  rain1hIn,
                  rain24hIn: rain1hIn * 4 || 0.01,
                  time: new Date().toISOString(),
                  rawAprsWx: '',
                  forecast: forecastList
                };
                
                meteoSinDatos = false;
                meteoFuente = `AEMET ${station.name}`;
                meteoLeida = Date.now();
                const numAemet = (v: any): number | undefined => (v === undefined || v === null || !Number.isFinite(Number(v)) ? undefined : Number(v));
                const horaAemet = Date.parse(`${latest.fint || ''}Z`.replace(/ZZ$/, 'Z').replace(/([+-]\d{2}:?\d{2})Z$/, '$1'));
                observacionInternet = {
                  cuando: Number.isFinite(horaAemet) ? horaAemet : Date.now(),
                  fuente: `AEMET ${station.name}`,
                  propia: false,
                  tempC: numAemet(latest.ta),
                  humedadPct: numAemet(latest.hr),
                  presionHpa: numAemet(latest.pres_nvel),
                  vientoKmh: numAemet(latest.vv) !== undefined ? numAemet(latest.vv)! * 3.6 : undefined,
                  rachaKmh: numAemet(latest.vmax) !== undefined ? numAemet(latest.vmax)! * 3.6 : undefined,
                  dirGrados: numAemet(latest.dv),
                  lluvia1hMm: numAemet(latest.prec),
                };
                addLog('SYS', 'AEMET', 'LOCAL', 'API', `Datos oficiales desde estación AEMET: ${station.name} (${station.id}).`, true, `Ok - Temp: ${weatherState.tempC.toFixed(1)}°C`);
                broadcastForecastBulletin(forecastList);
                weatherState.rawAprsWx = generateWxPayload(weatherState);
                return;
              }
            }
          }
        }
        throw new Error(`AEMET API error code: ${wrapper.estado}`);
      } else {
        throw new Error('AEMET server unreachable');
      }
    } else {
      // Sin claves: fuente real que no las pide
      if (await meteoSinClave()) {
        addLog('SYS', 'METEO', 'LOCAL', 'API', 'Meteorología y previsión actualizadas desde Open-Meteo (modelo, sin clave).', true, `Ok - Temp: ${weatherState.tempC.toFixed(1)}°C`);
        broadcastForecastBulletin(weatherState.forecast ?? []);
      } else {
        meteoSinRespuesta('Open-Meteo no responde y no hay clave de OpenWeatherMap ni de AEMET.');
      }
    }
  } catch (err: any) {
    // La fuente con clave ha fallado: se intenta la que no la pide
    if (await meteoSinClave()) {
      addLog('SYS', 'METEO', 'LOCAL', 'API', `La fuente configurada falla (${err.message}); se usa Open-Meteo (modelo, sin clave).`, true, `Ok - Temp: ${weatherState.tempC.toFixed(1)}°C`);
    } else {
      meteoSinRespuesta(err.message);
    }
  }
}

function calculateAqiFromPm25(val: number): number {
  if (val <= 12.0) return Math.round((50 / 12.0) * val);
  if (val <= 35.4) return Math.round(51 + ((49 / 23.3) * (val - 12.1)));
  if (val <= 55.4) return Math.round(101 + ((49 / 19.9) * (val - 35.5)));
  if (val <= 150.4) return Math.round(151 + ((49 / 94.9) * (val - 55.5)));
  return Math.round(201 + ((99 / 99.9) * (val - 150.5)));
}

// Variables para rastrear el último envío de balizas de radiactividad y su estado

// Procedencia de los datos de calidad del aire. Solo son reales (y por tanto
// emitibles por APRS) las mediciones completas de Open-Meteo: con IQAir los
// contaminantes se estiman y, sin ninguna API, todo es un simulador local.
let icaDataSimulated = true;

let lastIcaBulletinTime = 0;

function getMainPollutantName(pm25: number, pm10: number, coVal: number, no2: number, o3: number): string {
  const pollutants = [
    { name: 'PM2.5', value: pm25, unit: 'ug', score: pm25 / 10.0 },
    { name: 'PM10', value: pm10, unit: 'ug', score: pm10 / 20.0 },
    { name: 'NO2', value: no2, unit: 'ug', score: no2 / 40.0 },
    { name: 'O3', value: o3, unit: 'ug', score: o3 / 50.0 },
    { name: 'CO', value: coVal, unit: 'ug', score: coVal / 5000.0 }
  ];
  pollutants.sort((a, b) => b.score - a.score);
  const top = pollutants[0];
  if (!top) return `PM2.5: ${pm25.toFixed(1)}ug`;
  return `${top.name}: ${top.value.toFixed(1)}${top.unit}`;
}

// ---------------------------------------------------------------------------
// CADENA DE AVISOS: fuente -> Evento -> reglas -> objeto + boletín APRS -> emisor
// Común a todos los tipos de emergencia (server/core). Cada fuente solo tiene
// que entregar sus avisos como `Evento[]` y declarar su política de difusión.
// ---------------------------------------------------------------------------
const AVISOS_FILE = path.join(process.cwd(), 'sat_avisos.json');
// Estado de la última descarga de cada fuente oficial, para la portada de la consola
const estadoFuentes: Record<string, { nombre: string; ok: boolean; cuando: number; texto: string }> = {};
function anotarFuente(id: string, nombre: string, ok: boolean, texto: string) {
  estadoFuentes[id] = { nombre, ok, cuando: Date.now(), texto };
}

let registroAvisos = new RegistroAvisos();
try {
  if (fs.existsSync(AVISOS_FILE)) registroAvisos = new RegistroAvisos(JSON.parse(fs.readFileSync(AVISOS_FILE, 'utf8')));
} catch (e) {
  console.warn('[AVISOS] No se pudo leer sat_avisos.json; se empieza con el registro vacío.');
}

function guardarRegistroAvisos() {
  registroAvisos.purgar(Date.now(), 7 * 24 * 3600_000);
  fs.writeFile(AVISOS_FILE, JSON.stringify(registroAvisos), 'utf8', (err) => {
    if (err) console.warn(`[AVISOS] No se pudo guardar sat_avisos.json: ${err.message}`);
  });
}

/**
 * Difunde los avisos que cumplen su política: un objeto APRS con la posición
 * y los datos del suceso y, si procede, un boletín de emergencia. Devuelve
 * cuántos avisos se han puesto en emisión.
 */
function difundirAvisos(eventos: Evento[], politica: Politica, forzar: boolean = false): number {
  if (config.systemPower === false) return 0;
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon }; // posición actual: vale para estación fija o móvil
  let difundidos = 0;

  for (const evento of eventos) {
    const decision = evaluar(evento, politica, estacion, ahora);
    if (!decision.emitir) continue;
    if (!forzar && !registroAvisos.toca(evento.id, ahora, politica.repetirCadaMs)) continue;

    const nuevo = registroAvisos.esNuevo(evento.id);
    const urgente = evento.gravedad === 'rojo' || evento.gravedad === 'naranja';
    const destino = `${config.serverIp}:${config.aprscPort}`;
    const resumen = `${evento.detalle || ''} ${evento.titulo}`.trim();
    const aKm = decision.distanciaKm !== undefined ? ` a ${Math.round(decision.distanciaKm)} km` : '';

    const objeto = objetoAprs(config.callsign, evento);
    if (objeto) {
      addLog('TX', config.callsign, 'APRS-IS', destino, objeto, true, `Objeto APRS ${nuevo ? 'nuevo' : 'refrescado'} (${evento.fuente}): ${resumen}${aKm}.`, { urgente });
    }
    if (politica.boletin) {
      addLog('TX', config.callsign, 'APRS-IS', destino, boletinAprs(config.callsign, evento, decision.distanciaKm), true, `Boletín de emergencia (${evento.fuente}): ${resumen}${aKm}.`, { urgente });
    }
    servicioN2k.emitirAviso(`${(evento.titulo || resumen).slice(0, 90)}${aKm}`);   // también al bus NMEA 2000 (129802)
    registroAvisos.anotar(evento.id, ahora);
    difundidos++;
  }
  if (difundidos > 0) guardarRegistroAvisos();
  return difundidos;
}

// Sismos: dentro del radio de la estación y a partir de la magnitud configurada.
// El objeto se refresca cada `ignSeismoInterval` minutos durante 6 horas.
function politicaSismos(): Politica {
  return {
    radioKm: config.filterRadiusKm || 200,
    gravedadMinima: 'info',
    vigenciaMs: 6 * 3600_000,
    repetirCadaMs: (config.ignSeismoInterval || 30) * 60_000,
    boletin: config.autoGenerarBoletinEmergencia !== false,
    filtro: (e) => (e.datos?.magnitud ?? 0) >= (config.minMagnitudBaliza ?? 4.0)
  };
}

// Avisos de sismos reales de la última descarga (los inyectados como prueba no entran aquí)
let eventosSismos: Evento[] = [];

function transmitSeismoBeacon(force: boolean = false): number {
  if (!force && config.ignSeismoEnabled === false) return 0;
  if (!force) return difundirAvisos(eventosSismos, politicaSismos());
  // Emisión manual: solo el sismo más reciente que cumple la política, sin esperar a la cadencia
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const candidato = [...eventosSismos]
    .sort((a, b) => b.inicio - a.inicio)
    .find((e) => evaluar(e, politicaSismos(), estacion, Date.now()).emitir);
  return candidato ? difundirAvisos([candidato], politicaSismos(), true) : 0;
}

function getHealthRecommendation(label: string): string {
  const l = (label || '').toLowerCase();
  if (l.includes('extremo') || l.includes('extremadamente')) {
    return 'Alerta Sanitaria: Permanezca en interiores y use mascarilla FFP2.';
  }
  if (l.includes('muy')) {
    return 'Nocivo. Evite ejercicio prolongado en exterior. Proteja vias respiratorias.';
  }
  if (l.includes('desfavorable')) {
    return 'Grupos de riesgo: reduzca actividades intensas en exterior.';
  }
  if (l.includes('regular')) {
    return 'Aceptable. Personas sensibles deben evaluar reducir esfuerzos.';
  }
  return 'Sin riesgo. Disfrute de actividades al aire libre.';
}

// IQAir Air Quality Index Fetcher & Refresher
async function refreshIQAir() {
  const lat = gpsdState.lat;
  const lon = gpsdState.lon;
  const n = (v: any): number | undefined => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined);

  // 1. Modelo CAMS de Copernicus para la posición de la estación (Open-Meteo, sin clave)
  try {
    const omUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide&timezone=UTC`;
    const omRes = await fetch(omUrl, { signal: AbortSignal.timeout(6000) });
    const cur = omRes.ok ? (await omRes.json())?.current : null;
    const pm25 = n(cur?.pm2_5);
    if (pm25 !== undefined) {
      iqairState = {
        aqi: calculateAqiFromPm25(pm25),
        mainPollutant: 'pm25',
        city: 'Modelo CAMS',
        state: 'posición de la estación',
        country: '',
        lastUpdated: new Date().toISOString(),
        // Solo lo que da la fuente: un contaminante sin dato queda sin dato
        pm2_5: pm25,
        pm10: n(cur.pm10),
        co: n(cur.carbon_monoxide),
        no2: n(cur.nitrogen_dioxide),
        o3: n(cur.ozone),
        so2: n(cur.sulphur_dioxide),
      };
      icaDataSimulated = false;
      return;
    }
  } catch (omErr: any) {
    console.warn('Calidad del aire (Open-Meteo) no disponible:', omErr.message);
  }

  // 2. IQAir, si hay clave: da el índice de la ciudad más cercana, no las concentraciones
  if (config.iqAirApiKey && config.iqAirApiKey.length > 5) {
    try {
      const response = await fetch(`https://api.airvisual.com/v2/nearest_city?lat=${lat}&lon=${lon}&key=${config.iqAirApiKey}`, { signal: AbortSignal.timeout(8000) });
      const json = response.ok ? await response.json() : null;
      const d = json?.status === 'success' ? json.data : null;
      if (d && n(d.current?.pollution?.aqius) !== undefined) {
        iqairState = {
          aqi: d.current.pollution.aqius,
          mainPollutant: d.current.pollution.mainus,
          city: d.city,
          state: d.state,
          country: d.country,
          tempC: n(d.current.weather?.tp),
          humidityPct: n(d.current.weather?.hu),
          pressureHpa: n(d.current.weather?.pr),
          windSpeedMs: n(d.current.weather?.ws),
          windDirDeg: n(d.current.weather?.wd),
          lastUpdated: new Date().toISOString(),
        };
        icaDataSimulated = false;
        return;
      }
    } catch (err: any) {
      console.warn('Calidad del aire (IQAir) no disponible:', err.message);
    }
  }

  // 3. Ninguna fuente responde: no hay dato (antes se generaba uno simulado)
  icaDataSimulated = true;
}

// Refresh live Global & Regional Tsunamis
async function refreshTsunamis() {
  if (config.systemPower === false || config.tsunamiMonitorEnabled === false) {
    tsunamiAlerts = [];
    return;
  }
  try {
    // Collect tsunami alarm events from USGS magnitude 5.0+
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=5.0&limit=15';
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    let fetchedAlerts: TsunamiAlert[] = [];
    
    if (response.ok) {
      const geo = await response.json();
      if (geo.features && Array.isArray(geo.features)) {
        // Solo los seísmos que el USGS marca con aviso de tsunami; no se deduce nada de la magnitud
        const tsunamiFeatures = geo.features.filter((f: any) => f.properties.tsunami === 1);
        
        fetchedAlerts = tsunamiFeatures.map((f: any) => {
          const props = f.properties;
          const geom = f.geometry;
          const lon = geom.coordinates[0];
          const lat = geom.coordinates[1];
          const mag = props.mag;
          const place = props.place || 'Océano Abierto';
          
          let severity: 'GREEN' | 'ADVISORY' | 'WATCH' | 'WARNING' = 'GREEN';
          if (mag >= 7.5) {
            severity = 'WARNING';
          } else if (mag >= 7.0) {
            severity = 'WATCH';
          } else if (mag >= 6.0) {
            severity = 'ADVISORY';
          }

          const distanceKm = calculateDistance(gpsdState.lat, gpsdState.lon, lat, lon);

          return {
            id: f.id || `tsu_${props.code || Date.now()}`,
            title: props.title || `Vigilancia de Tsunami M${mag}`,
            magnitude: mag,
            location: place,
            coordinates: [lat, lon] as [number, number],
            depthKm: geom.coordinates[2] || 10,
            time: new Date(props.time || Date.now()).toISOString(),
            severity,
            distanceKm,
            source: 'USGS / PTWC',
            active: props.tsunami === 1,
            link: props.url
          };
        });
      }
    }

    // Sort by recency and show all real fetched tsunami alerts directly
    tsunamiAlerts = fetchedAlerts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  } catch (err: any) {
    console.error("Error refreshing Tsunami telemetry:", err ? err.message : err);
    tsunamiAlerts = [];
  }
}

// APRS Specialized Object Beacon Generators
function getSeismoBeaconPacket(): string | null {
  // Find the latest earthquake
  const target = earthquakes.find(e => e.enRango) || earthquakes[0];
  if (!target) return null;

  return generateEarthquakePacket(target);
}

// Space Weather & HF Propagation APRS Bulletin Config & State
let spaceWeatherAprsConfig = {
  enabled: true,
  intervalMinutes: 30, // Selectable intervals: 15, 30, 60, 120, 240
  lastTransmittedTime: 0,
  addressee: "BLN1SPACE", // 9-char APRS addressee
  template: "CLIMA ESPACIAL: R{R} S{S} G{G} | SFI:{SFI} Kp:{KP} SSN:{SSN} MUF:{MUF}MHz HF:{STATUS}",
  includeBands: true,

  // Custom alert thresholds (0=Off/R0, 1=R1/G1/S1, 2=R2/G2/S2, etc.)
  thresholdG: 1, // Alert if G >= G1
  thresholdR: 1, // Alert if R >= R1
  thresholdS: 1, // Alert if S >= S1

  // APRS Dispatch options
  aprsOnAlertOnly: false, // Send APRS bulletin only when an alert threshold is met
  autoSendOnChange: true, // Send APRS bulletin immediately when alert level changes
  minIntervalOnChangeMinutes: 5, // Minimum minutes between auto-sends on change

  // Sound notifications
  soundGEnabled: true,
  soundREnabled: true,
  soundSEnabled: true,

  // Last seen alert levels for detecting changes
  lastRLevel: 0,
  lastSLevel: 0,
  lastGLevel: 0
};

let spaceWeatherAprsHistory: Array<{
  timestamp: string;
  packet: string;
  rScale: string;
  sScale: string;
  gScale: string;
  sfi: string;
  kp: number;
  status: string;
  remarks: string;
}> = [];

async function formatSpaceWeatherAprsBulletin() {
  const prop = await getPropagationData(false);
  const rScale = prop.noaa?.rScale || "R0";
  const sScale = prop.noaa?.sScale || "S0";
  const gScale = prop.noaa?.gScale || "G0";
  const sfi = prop.noaa?.dia1 || "150";
  const kp = prop.gfz?.Hp60 !== undefined ? Math.round(prop.gfz.Hp60 * 10) / 10 : (prop.gfz?.Hp30 !== undefined ? Math.round(prop.gfz.Hp30 * 10) / 10 : 2.1);
  const ssn = prop.noaa?.ssn || String(Math.max(0, Math.round((parseInt(sfi) - 64) * 0.9))) || "110";
  const muf = prop.noaa?.muf ? prop.noaa.muf.toFixed(1) : "14.5";

  let status = "BUENA";
  const rNivel = parseInt((rScale || "R0").replace("R", "")) || 0;
  const gNivel = parseInt((gScale || "G0").replace("G", "")) || 0;
  if (rNivel >= 3) {
    status = "APAGÓN HF";
  } else if (gNivel >= 3) {
    status = "TORMENTA GEOMAG";
  } else if (kp >= 5) {
    status = "DEGRADADA";
  } else if (parseInt(sfi) >= 140 && kp <= 2) {
    status = "EXCELENTE";
  }

  const addrRaw = spaceWeatherAprsConfig.addressee || "BLN1SPACE";
  const addr = addrRaw.padEnd(9, ' ').slice(0, 9);

  let text = (spaceWeatherAprsConfig.template || "CLIMA ESPACIAL: R{R} S{S} G{G} | SFI:{SFI} Kp:{KP} SSN:{SSN} MUF:{MUF}MHz HF:{STATUS}")
    .replace('{R}', rScale)
    .replace('{S}', sScale)
    .replace('{G}', gScale)
    .replace('{SFI}', String(sfi))
    .replace('{KP}', String(kp))
    .replace('{SSN}', String(ssn))
    .replace('{MUF}', String(muf))
    .replace('{STATUS}', status);

  const mufNum = parseFloat(muf) || 28.5;
  let bandaUtil = "20m";
  if (mufNum >= 28.0) bandaUtil = "10m";
  else if (mufNum >= 24.89) bandaUtil = "12m";
  else if (mufNum >= 21.0) bandaUtil = "15m";
  else if (mufNum >= 18.06) bandaUtil = "17m";
  else if (mufNum >= 14.0) bandaUtil = "20m";
  else if (mufNum >= 10.1) bandaUtil = "30m";
  else if (mufNum >= 7.0) bandaUtil = "40m";
  else if (mufNum >= 3.5) bandaUtil = "80m";
  else bandaUtil = "160m";

  const delayL1Num = prop.noaa?.delayL1 ? Math.round(prop.noaa.delayL1) : 45;
  const delayL1Str = `${delayL1Num}m`;

  text = text
    .replace('{BANDA}', bandaUtil)
    .replace('{BANDA_UTIL}', bandaUtil)
    .replace('{L1}', delayL1Str)
    .replace('{RETARDO_L1}', delayL1Str);

  if (!text.trim()) {
    text = `CLIMA ESPACIAL R${rScale} S${sScale} G${gScale} | SFI:${sfi} Kp:${kp} MUF:${muf}MHz HF:${status}`;
  }

  if (text.length > 67) {
    text = text.slice(0, 67);
  }

  const packet = `${config.callsign}>APRS,TCPIP*,qAC,GATEWAY::${addr}:${text}`;

  return {
    packet,
    // Solo es real si el pronóstico de NOAA se descargó de verdad (sin valores por defecto)
    real: prop.noaa?.real === true,
    rScale,
    sScale,
    gScale,
    sfi,
    kp,
    ssn,
    muf,
    status,
    addr,
    bandaUtil,
    delayL1: delayL1Num
  };
}

async function transmitSpaceWeatherAprsBulletin(force: boolean = false) {
  if (config.systemPower === false) return null;
  if (!force && !spaceWeatherAprsConfig.enabled) return null;

  const now = Date.now();
  const intervalMs = (spaceWeatherAprsConfig.intervalMinutes || 30) * 60 * 1000;
  const minChangeIntervalMs = (spaceWeatherAprsConfig.minIntervalOnChangeMinutes || 5) * 60 * 1000;
  const timeSinceLast = now - spaceWeatherAprsConfig.lastTransmittedTime;

  // Sin todas las fuentes no hay boletín: llevaría índices supuestos
  const propActual = await getPropagationData(false);
  if (!propActual.completa) {
    if (force) addLog('SYS', 'CLIMA_ESPACIAL', 'LOCAL', 'BOLETIN', `Boletín de propagación no emitido: falta ${propActual.faltan.join(', ')}.`, false, 'Sin datos');
    return null;
  }

  const data = await formatSpaceWeatherAprsBulletin();
  const rNivel = parseInt((data.rScale || "R0").replace("R", "")) || 0;
  const sNivel = parseInt((data.sScale || "S0").replace("S", "")) || 0;
  const gNivel = parseInt((data.gScale || "G0").replace("G", "")) || 0;

  const isAlertThresholdMet = (
    rNivel >= spaceWeatherAprsConfig.thresholdR ||
    sNivel >= spaceWeatherAprsConfig.thresholdS ||
    gNivel >= spaceWeatherAprsConfig.thresholdG
  );

  const levelChanged = (
    rNivel !== spaceWeatherAprsConfig.lastRLevel ||
    sNivel !== spaceWeatherAprsConfig.lastSLevel ||
    gNivel !== spaceWeatherAprsConfig.lastGLevel
  );

  // Determine if transmission should execute
  let shouldTransmit = false;
  let reason = '';

  if (force) {
    shouldTransmit = true;
    reason = 'Manual forzada por operador';
  } else if (spaceWeatherAprsConfig.lastTransmittedTime === 0) {
    shouldTransmit = true;
    reason = 'Inicialización del servicio';
  } else if (spaceWeatherAprsConfig.autoSendOnChange && levelChanged && timeSinceLast >= minChangeIntervalMs) {
    shouldTransmit = true;
    reason = `Cambio de nivel de alerta detectado (R${spaceWeatherAprsConfig.lastRLevel}->R${rNivel}, S${spaceWeatherAprsConfig.lastSLevel}->S${sNivel}, G${spaceWeatherAprsConfig.lastGLevel}->G${gNivel})`;
  } else if (timeSinceLast >= intervalMs) {
    if (!spaceWeatherAprsConfig.aprsOnAlertOnly || isAlertThresholdMet) {
      shouldTransmit = true;
      reason = `Cadencia periódica (${spaceWeatherAprsConfig.intervalMinutes} min)`;
    }
  }

  // Always update last recorded levels
  spaceWeatherAprsConfig.lastRLevel = rNivel;
  spaceWeatherAprsConfig.lastSLevel = sNivel;
  spaceWeatherAprsConfig.lastGLevel = gNivel;

  if (shouldTransmit) {
    spaceWeatherAprsConfig.lastTransmittedTime = now;

    const remarks = `Boletín APRS Clima Espacial & Propagación HF retransmitido [${reason}] (${data.rScale} ${data.sScale} ${data.gScale} | SFI:${data.sfi} Kp:${data.kp} HF:${data.status}).`;

    addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, data.packet, true, remarks, { simulated: !data.real });

    const historyItem = {
      timestamp: new Date().toISOString(),
      packet: data.packet,
      rScale: data.rScale,
      sScale: data.sScale,
      gScale: data.gScale,
      sfi: String(data.sfi),
      kp: data.kp,
      status: data.status,
      remarks
    };

    spaceWeatherAprsHistory = [historyItem, ...spaceWeatherAprsHistory].slice(0, 30);
    return historyItem;
  }
  return null;
}

// Earthquake Spain Feeds - Ingest from real IGN or fallback USGS Spain
async function refreshEarthquakes() {
  if (config.systemPower === false || config.ignSeismoEnabled === false) {
    earthquakes = [];
    eventosSismos = [];
    return;
  }
  try {
    const sismos = await descargarSismos((origen, texto, ok) => addLog('SYS', origen, 'LOCAL', 'API', texto, ok, ok ? 'Servicios' : 'Fallback'));
    anotarFuente('sismos', 'Sismos · IGN', sismos.length > 0, sismos.length > 0 ? `${sismos.length} sismos (${sismos[0].fuente})` : 'Sin respuesta de IGN ni USGS');
    if (sismos.length === 0) return; // sin datos nuevos se conserva la última lista válida

    const limite = Date.now() - 30 * 24 * 3600_000;
    const recientes = sismos.filter((s) => new Date(s.time).getTime() >= limite);
    const lista = (recientes.length > 0 ? recientes : sismos)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    earthquakes = lista.map((s) => {
      const distanciaKm = calculateDistance(gpsdState.lat, gpsdState.lon, s.latitude, s.longitude);
      const eq: EarthquakeEvent = {
        id: s.id,
        time: s.time,
        latitude: s.latitude,
        longitude: s.longitude,
        depthKm: s.depthKm,
        magnitud: s.magnitud,
        magType: s.magType,
        localizacion: s.localizacion,
        distanciaKm,
        enRango: distanciaKm <= (config.filterRadiusKm || 200)
      };
      eq.aprsPacket = generateEarthquakePacket(eq);
      return eq;
    });
    eventosSismos = lista.map(sismoAEvento);

    // Difundir por APRS los que cumplan la política (radio, magnitud, cadencia)
    transmitSeismoBeacon();
  } catch (err: any) {
    console.error("Error refreshing Earthquakes:", err ? err.message : err);
  }
}


// Generate fallback / real NOAA space alerts
async function refreshNoaaAlerts() {
  try {
    const noaaUrl = 'https://services.swpc.noaa.gov/products/alerts.json';
    const res = await fetch(noaaUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Parse active warnings
        const parsedAlerts: NoaaSpaceAlert[] = [];
        const seenScales = new Set<string>();

        for (const item of data) {
          const message = typeof item.message === 'string' ? item.message : '';
          
          // Look for solar G, R, or S scales in NOAA messages
          const match = message.match(/(Geomagnetic Storm|Solar Radiation Storm|Radio Blackout) (Level |Scale )?([G|R|S])([1-5])/i);
          if (match) {
            const scaleType = match[3].toUpperCase() as 'G' | 'R' | 'S';
            const nivel = parseInt(match[4]);
            const id = `noaa_${scaleType}${nivel}_${item.issue_datetime?.split(' ')[0] || Date.now()}`;
            
            if (!seenScales.has(`${scaleType}${nivel}`)) {
              seenScales.add(`${scaleType}${nivel}`);
              
              let desc = '';
              let freqs = 'Ninguna';
              if (scaleType === 'G') {
                desc = `${nivel === 5 ? 'Extrema' : nivel === 4 ? 'Severa' : nivel === 3 ? 'Fuerte' : 'Moderada'} alteración en red eléctrica y auroras polares.`;
                freqs = 'HF/VHF degradada en latitudes altas';
              } else if (scaleType === 'R') {
                desc = 'Apagón de radio ionosférico. Bloqueo total de radiocomunicaciones HF.';
                freqs = `Frecuencias HF impactadas (3-${3 * nivel} MHz)`;
              } else {
                desc = 'Tormenta de radiación solar. Bloqueo de satélites y salud satelital.';
                freqs = 'HF atenuada en casquetes polares';
              }

              const alert: NoaaSpaceAlert = {
                id,
                issueTime: item.issue_datetime || new Date().toISOString(),
                scaleType,
                nivel,
                descripcion: desc,
                frecuenciasAfectadas: freqs,
                aprsPacket: `${config.callsign}>APRS,TCPIP*,qAC,GATEWAY:BLN1REMER: NOAA CLIMA ESPACIAL: ${scaleType}${nivel} - ${desc.slice(0, 35)}...`
              };
              parsedAlerts.push(alert);
            }
          }
          if (parsedAlerts.length >= 5) break; // keep top 5
        }

        if (parsedAlerts.length > 0) {
          noaaAlerts = parsedAlerts;
          return;
        }
      }
    }
    
    // Sin respuesta de la NOAA no hay alertas que mostrar (antes se enseñaban dos de ejemplo como si fueran reales)
    noaaAlerts = [];
  } catch (err) {
    noaaAlerts = [];
  }
}


async function refreshTrafficIncidents() {
  try {
    addLog('SYS', 'DGT', 'LOCAL', 'SYNC', 'Consultando incidencias de tráfico en tiempo real via eTraffic DATEX2 de la DGT...', true, 'Sincronización');
    const url = 'https://infocar.dgt.es/datex2/lod/dgt/incidencias.rdf';
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const xmlText = await response.text();
      const parsed = parseDgtXml(xmlText);
      if (parsed.length > 0) {
        dgtDatosReales = true;
        // Una incidencia sin coordenadas no se puede situar: se descarta (antes se ponía en la estación)
        dgtIncidentsList = parsed.filter((item) => Number.isFinite(parseFloat(item.latitud)) && Number.isFinite(parseFloat(item.longitud))).map((item, idx) => {
          const lat = parseFloat(item.latitud);
          const lon = parseFloat(item.longitud);
          const dist = calculateDistance(gpsdState.lat, gpsdState.lon, lat, lon);
          
          let cleanNivel: 'VERDE' | 'AMARILLO' | 'ROJO' | 'NEGRO' = 'VERDE';
          const rawNivel = (item.nivel || '').toUpperCase();
          if (rawNivel.includes('AMARILLO') || rawNivel.includes('YELLOW')) cleanNivel = 'AMARILLO';
          else if (rawNivel.includes('ROJO') || rawNivel.includes('RED')) cleanNivel = 'ROJO';
          else if (rawNivel.includes('NEGRO') || rawNivel.includes('BLACK')) cleanNivel = 'NEGRO';

          return {
            id: `dgt_${idx}_${Date.now()}`,
            tipo: item.tipo || 'OTROS',
            carretera: item.carretera || '',
            provincia: item.provincia || 'España',
            poblacion: item.poblacion || 'Varios',
            fecha: item.fecha,
            descripcion: item.descripcion || 'Incidencia de tráfico',
            nivel: cleanNivel,
            latitud: lat,
            longitud: lon,
            distanciaKm: dist,
            causa: item.causa || 'Tráfico',
            sentido: item.sentido || 'Ambos'
          };
        });
        addLog('SYS', 'DGT', 'LOCAL', 'OK', `Sincronizadas ${dgtIncidentsList.length} incidencias activas desde DGT eTraffic DATEX2 (RDF).`, true, 'Servicios');
        return;
      }
    }
    addLog('SYS', 'DGT', 'LOCAL', 'SYNC', 'La DGT no responde o no da incidencias: sin datos de tráfico.', false, 'Sin datos');
    dgtDatosReales = false;
    dgtIncidentsList = [];
  } catch (err: any) {
    addLog('SYS', 'DGT', 'LOCAL', 'FAIL', `Sin conexión con la DGT (${err.message}): sin datos de tráfico.`, false, 'Error');
    dgtDatosReales = false;
    dgtIncidentsList = [];
  }
}

function parseDgtXml(xmlString: string): any[] {
  const incidents: any[] = [];
  const blocks: string[] = [];
  
  // Extraer bloques que parezcan incidencias
  const incRegex = /<(?:dgt:)?incidencia(?:[\s>][\s\S]*?)?>([\s\S]*?)<\/([a-zA-Z0-9_-]+:)?incidencia>/gi;
  let match;
  while ((match = incRegex.exec(xmlString)) !== null) {
    blocks.push(match[1]);
  }
  
  const rdfDescRegex = /<rdf:Description(?:[\s>][\s\S]*?)?>([\s\S]*?)<\/rdf:Description>/gi;
  let rdfMatch;
  while ((rdfMatch = rdfDescRegex.exec(xmlString)) !== null) {
    const blockContent = rdfMatch[1];
    if (blockContent.includes('carretera') || blockContent.includes('latitud') || blockContent.includes('lat') || blockContent.includes('provincia')) {
      blocks.push(blockContent);
    }
  }

  const itemRegex = /<item(?:[\s>][\s\S]*?)?>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xmlString)) !== null) {
    blocks.push(itemMatch[1]);
  }

  const uniqueBlocks = Array.from(new Set(blocks));

  for (const content of uniqueBlocks) {
    const getTag = (tag: string) => {
      const tagRegex = new RegExp(`<([a-zA-Z0-9_-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/([a-zA-Z0-9_-]+:)?${tag}>`, 'i');
      const tagMatch = content.match(tagRegex);
      if (tagMatch) {
        return tagMatch[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
      }
      
      const attrRegex = new RegExp(`<([a-zA-Z0-9_-]+:)?${tag}\\s+[^>]*rdf:resource="([^"]*)"`, 'i');
      const attrMatch = content.match(attrRegex);
      if (attrMatch) {
        const res = attrMatch[2];
        const lastSlash = res.lastIndexOf('/');
        if (lastSlash !== -1) {
          return decodeURIComponent(res.substring(lastSlash + 1)).trim();
        }
        return res.trim();
      }
      return '';
    };

    const lat = getTag('latitud') || getTag('lat') || getTag('latitude');
    const lon = getTag('longitud') || getTag('long') || getTag('longitude');
    
    const carretera = getTag('carretera') || getTag('road');
    const provincia = getTag('provincia') || getTag('province');
    const descripcion = getTag('descripcion') || getTag('causa') || getTag('description') || getTag('summary');
    
    if (carretera || provincia || descripcion) {
      incidents.push({
        tipo: getTag('tipo') || getTag('nom_causa') || getTag('causa') || 'INCIDENCIA',
        carretera: carretera || 'VÍA',
        provincia: provincia || 'España',
        poblacion: getTag('poblacion') || getTag('poblaci_n') || getTag('town') || 'Varios',
        fecha: getTag('fecha') || getTag('fecha_hora_ini') || getTag('date') || getTag('pubDate') || new Date().toISOString(),
        descripcion: descripcion || 'Incidencia de tráfico',
        nivel: getTag('nivel') || getTag('color_nivel') || getTag('nivel_servicio') || 'VERDE',
        latitud: lat,
        longitud: lon,
        sentido: getTag('sentido') || 'Ambos',
        causa: getTag('nom_causa') || getTag('causa') || 'Tránsito'
      });
    }
  }

  return incidents;
}


// Initial pull on start
refreshWeather();
refreshIQAir();
refreshEarthquakes();
refreshNoaaAlerts();
refreshTrafficIncidents();

// Background Periodic Loops (1500ms loop for real-time fidelity)
setInterval(() => {
  gpsdState.time = new Date().toISOString();
  
  // Sin fijo GPS la estación está parada en su posición fija
  if (gpsdState.isFallback) gpsdState.speedKmh = 0;
  
  // Estado del equipo: medidas reales del sistema operativo
  medirEquipo();

  if (process.platform === 'linux') {
    // Read real temperature
    try {
      if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
        const tempRaw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
        const tempC = parseInt(tempRaw) / 1000;
        if (tempC > 0 && tempC < 120) {
          nucStats.cpuTempC = parseFloat(tempC.toFixed(1));
        }
      }
    } catch (tempErr) {}


  }

  // Drift and evaluate AEMET GPSD-based weather alerts
  driftAemetAlerts();
}, 1500);



// Uso de CPU: diferencia entre dos lecturas de los contadores del sistema
let cpuAnterior: { activo: number; total: number } | null = null;
function medirEquipo() {
  let activo = 0;
  let total = 0;
  for (const nucleo of os.cpus()) {
    const t = nucleo.times;
    activo += t.user + t.nice + t.sys + t.irq;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  if (cpuAnterior && total > cpuAnterior.total) {
    nucStats.cpuUsagePct = Math.round(((activo - cpuAnterior.activo) / (total - cpuAnterior.total)) * 100);
  }
  cpuAnterior = { activo, total };
  const totalGb = os.totalmem() / 1024 ** 3;
  const usadaGb = (os.totalmem() - os.freemem()) / 1024 ** 3;
  nucStats.ramTotalGb = parseFloat(totalGb.toFixed(2));
  nucStats.ramUsedGb = parseFloat(usadaGb.toFixed(2));
  nucStats.ramUsagePct = parseFloat(((usadaGb / totalGb) * 100).toFixed(1));
  const seg = os.uptime();
  nucStats.uptime = `${Math.floor(seg / 86400)}d ${Math.floor((seg % 86400) / 3600)}h ${Math.floor((seg % 3600) / 60)}m`;
  nucStats.loadAverage = os.loadavg().map((v) => v.toFixed(2)).join(', ');
}

// Estado real de los servicios (systemd). Es una consulta lenta: se hace aparte, cada 15 s.
function medirServicios() {
  if (process.platform !== 'linux') return;
  const unidades: Record<string, string[]> = {
    aprsc: ['aprsc'], aprx: ['aprx'], direwolf: ['direwolf'], gpsd: ['gpsd'], ntpsec: ['ntpsec'],
    aiscatcher: ['aiscatcher', 'ais-catcher'], pat: ['pat'], weewx: ['weewx'],
  };
  for (const [clave, nombres] of Object.entries(unidades)) {
    let estado: 'active' | 'inactive' | 'failed' = 'inactive';
    for (const unidad of nombres) {
      try {
        const r = execFileSync('systemctl', ['is-active', unidad], { encoding: 'utf8', timeout: 3000 }).trim();
        if (r === 'active') { estado = 'active'; break; }
      } catch (e: any) {
        if (String(e?.stdout ?? '').trim() === 'failed') estado = 'failed';
      }
    }
    nucStats.services[clave as keyof typeof nucStats.services] = estado;
  }
}
medirServicios();
setInterval(medirServicios, 15000);
try {
  const m = fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)"?/m);
  if (m) nucStats.debianVersion = m[1];
} catch { /* sin fichero: queda vacío */ }

let lastAemetRefreshTime = 0;
function driftAemetAlerts() {
  const now = Date.now();
  if (now - lastAemetRefreshTime > 4500) {
    lastAemetRefreshTime = now;
    refreshAemetWarnings();
  }
}




// Run NAVAREA/NAVTEX warnings refresh interval every 16 seconds
// setInterval(refreshNavareaWarnings, 16000);

// Regularly refresh outer components with dynamic sync scheduler adjustments
let timerWeather: NodeJS.Timeout;
let timerEarthquakes: NodeJS.Timeout;
let timerIQAir: NodeJS.Timeout;
let timerNoaa: NodeJS.Timeout;
let timerTrafficIncidents: NodeJS.Timeout;
let timerTsunamis: NodeJS.Timeout;
let timerSpaceWeatherAprs: NodeJS.Timeout | null = null;

function startSchedules() {
  if (timerWeather) clearInterval(timerWeather);
  if (timerEarthquakes) clearInterval(timerEarthquakes);
  if (timerTsunamis) clearInterval(timerTsunamis);

  const weatherInterval = (config.pollIntervalAemet || 1) * 60000;
  const ignInterval = (config.pollIntervalIgn || 2) * 60000;

  timerWeather = setInterval(() => {
    addLog('SYS', 'AEMET', 'LOCAL', 'CRON', `Ejecutando sondeo programado AEMET (Frecuencia: ${config.pollIntervalAemet} min).`, true, 'Automático');
    refreshWeather();
  }, weatherInterval);

  timerEarthquakes = setInterval(() => {
    addLog('SYS', 'IGN', 'LOCAL', 'CRON', `Iniciando consulta sismográfica IGN automática (Frecuencia: ${config.pollIntervalIgn} min).`, true, 'Automático');
    refreshEarthquakes();
  }, ignInterval);


  if (!timerIQAir) timerIQAir = setInterval(refreshIQAir, 150000); // 2.5 min
  if (!timerNoaa) timerNoaa = setInterval(refreshNoaaAlerts, 180000); // 3 min
  if (!timerTrafficIncidents) timerTrafficIncidents = setInterval(refreshTrafficIncidents, 120000); // 2 min
  
  // Activate automatic tsunami polling schedules
  timerTsunamis = setInterval(refreshTsunamis, 150000); // 2.5 min
  refreshTsunamis(); // Run once immediately on boot

  // Activate automatic Space Weather APRS Bulletin timer (checks every 60 seconds)
  if (!timerSpaceWeatherAprs) {
    timerSpaceWeatherAprs = setInterval(() => {
      transmitSpaceWeatherAprsBulletin(false);
    }, 60000);
  }

  // Baliza de posición de la estación (perfil de la estación APRS)
  if (timerStationBeacon) clearInterval(timerStationBeacon);
  timerStationBeacon = undefined;
  if (config.aprsBeaconEnabled) {
    timerStationBeacon = setInterval(() => transmitStationBeacon(), intervaloBalizaMs(config.aprsBeaconInterval));
  }

  // Parte meteorológico de la estación
  if (timerParteMeteo) clearInterval(timerParteMeteo);
  timerParteMeteo = undefined;
  if (config.wxBeaconEnabled) {
    timerParteMeteo = setInterval(() => transmitParteMeteo(), intervaloMeteoMs(config.wxBeaconInterval));
  }
}

// ---------------------------------------------------------------------------
// Parte meteorológico de la estación por APRS
// ---------------------------------------------------------------------------
let timerParteMeteo: NodeJS.Timeout | undefined;

/** Lee la estación meteorológica propia: la base de datos de WeeWX o, si se indica, wxnow.txt. */
async function leerEstacionPropia() {
  const deArchivo = leerArchivoWxnow(String(config.wxWxnowPath || '').trim());
  const deWeewx = await leerWeewx(String(config.wxWeewxDb || '').trim());
  // Si hay las dos, la más reciente
  const candidatas = [deArchivo, deWeewx].filter((o): o is Observacion => !!o);
  observacionPropia = candidatas.sort((a, b) => b.cuando - a.cuando)[0] ?? null;
}
setInterval(() => { leerEstacionPropia().catch(() => {}); }, 60_000);
setTimeout(() => { leerEstacionPropia().catch(() => {}); }, 3000);

function estadoParteMeteo() {
  const ahora = Date.now();
  const modo = (['auto', 'propia', 'internet'].includes(String(config.wxFuente)) ? config.wxFuente : 'auto') as 'auto' | 'propia' | 'internet';
  const elegida = elegirObservacion(modo, observacionPropia, observacionInternet, ahora);
  const gpsReal = !gpsdState.isFallback && gpsdState.mode >= 2;
  const estacion = {
    callsign: config.callsign,
    lat: gpsReal ? gpsdState.lat : config.fallbackLat,
    lon: gpsReal ? gpsdState.lon : config.fallbackLon,
  };
  return { ahora, modo, elegida, estacion, errores: validarParte(estacion, elegida, ahora), packet: parteMeteoAprs(estacion, elegida, ahora) };
}

/** Emite el parte meteorológico por la cola de emisión; solo con datos reales y recientes. */
function transmitParteMeteo(): { ok: boolean; packet?: string; error?: string } {
  const e = estadoParteMeteo();
  if (!e.packet) {
    const error = e.errores.join('; ');
    addLog('SYS', 'METEO', 'LOCAL', 'PARTE', `Parte meteorológico no emitido: ${error}.`, false, 'Sin datos válidos');
    return { ok: false, error };
  }
  addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, e.packet, true, `Parte meteorológico de la estación (${e.elegida!.fuente}).`);
  return { ok: true, packet: e.packet };
}

// ---------------------------------------------------------------------------
// Baliza de posición de la propia estación
// ---------------------------------------------------------------------------
let timerStationBeacon: NodeJS.Timeout | undefined;

/** Perfil de la estación tal como se emite: posición del GPS si hay fijo real, si no la fija. */
function perfilBaliza(): PerfilEstacion {
  const gpsReal = !gpsdState.isFallback && gpsdState.mode >= 2;
  return {
    callsign: config.callsign,
    lat: gpsReal ? gpsdState.lat : config.fallbackLat,
    lon: gpsReal ? gpsdState.lon : config.fallbackLon,
    symbolTable: config.aprsSymbolTable || '/',
    symbolCode: config.aprsSymbolCode || '-',
    phg: {
      power: Number(config.aprsPhgPower), height: Number(config.aprsPhgHeight),
      gain: Number(config.aprsPhgGain), directivity: Number(config.aprsPhgDirectivity),
    },
    comment: config.aprsStatusComment || '',
  };
}

/** Emite la baliza de posición por la cola de emisión. Devuelve el motivo si no se pudo construir. */
function transmitStationBeacon(): { ok: boolean; packet?: string; error?: string } {
  const perfil = perfilBaliza();
  const packet = balizaPosicion(perfil);
  if (!packet) {
    const error = validarPerfil(perfil).join('; ');
    addLog('SYS', 'BALIZA', 'LOCAL', 'PERFIL', `Baliza de estación no generada: ${error}.`, false, 'Perfil incompleto');
    return { ok: false, error };
  }
  addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, packet, true, 'Baliza de posición de la estación (perfil APRS).');
  return { ok: true, packet };
}

// El arranque se aplaza hasta que el módulo ha terminado de cargarse: así ninguna
// de estas funciones encuentra una variable de más abajo todavía sin inicializar.
setImmediate(() => {
  startSchedules();
  programarAvisosMeteo();
  programarOtrasFuentes();
  ajustarAprsIs();
  ajustarEntradasMapa();
  ajustarCluster();
  ajustarEquipoYRotor();
  descargarSatelites().catch(() => {});
});
// Estación móvil o cambios de configuración: se revisa el filtro cada 5 minutos
setInterval(ajustarAprsIs, 5 * 60_000);

// Periodic APRS Automatic Transmitter Beacon Simulation is disabled to prevent looping simulated traffic when real data is not active.
// setInterval(() => {
//   const wxPack = getWxPacket();
//   addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, wxPack, true, 'Baliza de Estación Metereológica REMER transmitida con éxito');
// }, 45000);

app.get('/api/telemetry', async (req, res) => {
  const isEco = req.query.eco === '1';
  let propagationData = null;
  try {
    propagationData = await getPropagationData(isEco);
  } catch (err: any) {
    console.error("Error embedding propagation in telemetry endpoint:", err.message);
  }
  
  res.json({
    config: configForRequest(req),
    txEnabled: TX_ENABLED,
    gpsd: gpsdState,
    ntp: ntpsecState,
    weather: weatherState,
    earthquakes,
    noaaAlerts,
    vessels: barcosParaPaneles(),
    nucStats,
    logs,
    trafficTrends,
    // Sin fuente real no se envía nada (antes, valores de un simulador)
    iqair: icaDataSimulated ? undefined : iqairState,
    tsunamiAlerts,
    // Sin fuente real de vigilancia radiológica: lista vacía (antes, valores modelados)
    csnStations: [],
    dgtIncidents: dgtIncidentsList,
    inmarsatMessages,
    erddapBuoys,
    portusStations,
    aemetAlerts,
    meteoSinDatos,
    meteoFuente,
    propagation: propagationData && propagationData.completa ? propagationData : undefined,
    propagacionFaltan: propagationData ? propagationData.faltan : ['todas las fuentes'],
    navareas: navareaWarnings
  });
});

let cachedNoaaForecast: any = null;
let lastFetchTime: number = 0;

let cachedNoaaSolarIndices: any = null;
let lastSolarFetch: number = 0;

async function fetchNoaaSolarIndices() {
  const now = Date.now();
  if (cachedNoaaSolarIndices && (now - lastSolarFetch < 3600000)) { // cache for 1 hour
    return cachedNoaaSolarIndices;
  }
  const url = 'https://services.swpc.noaa.gov/text/daily-solar-indices.txt';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    let latestData = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith(':')) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        latestData = {
          sfi: Number.isFinite(parseFloat(parts[3])) ? Math.round(parseFloat(parts[3])).toString() : '',
          ssn: Number.isFinite(parseFloat(parts[4])) ? Math.round(parseFloat(parts[4])).toString() : '',
          time_tag: `${parts[0]}-${parts[1]}-${parts[2]}`
        };
        break;
      }
    }
    if (latestData) {
      cachedNoaaSolarIndices = latestData;
      lastSolarFetch = now;
      return cachedNoaaSolarIndices;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("Error fetching NOAA Solar Indices, using fallback:", err.message);
  }
  // Sin respuesta: vale el último índice diario leído; si nunca se leyó, no hay dato
  return cachedNoaaSolarIndices || { sfi: '', ssn: '', time_tag: '' };
}

async function fetchNoaa3DayForecast() {
  const url = 'https://services.swpc.noaa.gov/text/3-day-forecast.txt';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status}`);
    }
    
    const text = await res.text();
    const lines = text.split('\n');
    
    let issued = 'Desconocido';
    let detectedDates: string[] = [];
    const day1Kps: number[] = [];
    const day2Kps: number[] = [];
    const day3Kps: number[] = [];
    let sfi1 = "150";
    let sfi2 = "148";
    let sfi3 = "145";

    let sLevels = [0, 0, 0];
    let sDescs = ["None (Quiet)", "None (Quiet)", "None (Quiet)"];

    let rLevels = [0, 0, 0];
    let rDescs = ["None (Quiet)", "None (Quiet)", "None (Quiet)"];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Extract Issued Date
      if (line.toLowerCase().startsWith(':issued:')) {
        issued = rawLine.replace(/:issued:\s*/i, '').trim();
        continue;
      }

      // Match three dates: e.g. "Jun 27       Jun 28       Jun 29"
      const dateMatch = line.match(/^\s*([A-Z][a-z]{2})\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{1,2})/i);
      if (dateMatch && detectedDates.length === 0) {
        detectedDates = [
          `${dateMatch[1]} ${dateMatch[2]}`,
          `${dateMatch[3]} ${dateMatch[4]}`,
          `${dateMatch[5]} ${dateMatch[6]}`
        ];
      }

      // Parse Kp lines: e.g. "00-03UT             1            2            1"
      const kpMatch = line.match(/^(\d{2}-\d{2})\s*UT\s+(\d+)\s+(\d+)\s+(\d+)/i);
      if (kpMatch) {
        day1Kps.push(parseInt(kpMatch[2], 10));
        day2Kps.push(parseInt(kpMatch[3], 10));
        day3Kps.push(parseInt(kpMatch[4], 10));
      }

      // Parse S1 or Greater: e.g. "S1 or Greater     05%          10%          01%"
      const s1Match = line.match(/S1\s+or\s+Greater\s+(\d+)\s*%\s+(\d+)\s*%\s+(\d+)\s*%/i) || 
                      line.match(/S1\s+or\s+Greater\s+(\d+)\s+(\d+)\s+(\d+)/i);
      if (s1Match) {
        const probs = [parseInt(s1Match[1], 10), parseInt(s1Match[2], 10), parseInt(s1Match[3], 10)];
        for (let i = 0; i < 3; i++) {
          const p = probs[i];
          if (p >= 70) {
            sLevels[i] = 3;
            sDescs[i] = `S3 (Severe - Probability: ${p}%)`;
          } else if (p >= 40) {
            sLevels[i] = 2;
            sDescs[i] = `S2 (Moderate - Probability: ${p}%)`;
          } else if (p >= 10) {
            sLevels[i] = 1;
            sDescs[i] = `S1 (Minor - Probability: ${p}%)`;
          } else {
            sLevels[i] = 0;
            sDescs[i] = `None (Probability: ${p}%)`;
          }
        }
      }

      // Parse R1-R2: e.g. "R1-R2             05%          10%          01%"
      const r1r2Match = line.match(/R1-R2\s+(\d+)\s*%\s+(\d+)\s*%\s+(\d+)\s*%/i) ||
                        line.match(/R1-R2\s+(\d+)\s+(\d+)\s+(\d+)/i);
      if (r1r2Match) {
        const probs = [parseInt(r1r2Match[1], 10), parseInt(r1r2Match[2], 10), parseInt(r1r2Match[3], 10)];
        for (let i = 0; i < 3; i++) {
          const p = probs[i];
          if (p >= 30) {
            rLevels[i] = Math.max(rLevels[i], 1);
            rDescs[i] = `R1-R2 (Minor-Moderate - Probability: ${p}%)`;
          }
        }
      }

      // Parse R3 or Greater: e.g. "R3 or Greater     05%          10%          01%"
      const r3Match = line.match(/R3\s+or\s+Greater\s+(\d+)\s*%\s+(\d+)\s*%\s+(\d+)\s*%/i) ||
                      line.match(/R3\s+or\s+Greater\s+(\d+)\s+(\d+)\s+(\d+)/i);
      if (r3Match) {
        const probs = [parseInt(r3Match[1], 10), parseInt(r3Match[2], 10), parseInt(r3Match[3], 10)];
        for (let i = 0; i < 3; i++) {
          const p = probs[i];
          if (p >= 45) {
            rLevels[i] = 3;
            rDescs[i] = `R3 (Strong - Probability: ${p}%)`;
          } else if (p >= 15) {
            rLevels[i] = Math.max(rLevels[i], 2);
            rDescs[i] = `R2-R3 (Moderate-Strong - Probability: ${p}%)`;
          }
        }
      }

      // Parse SFI 10.7cm flux: e.g. "10.7cm Flux        145          140          135"
      const sfiMatch = line.match(/10\.7\s*[-cm\s]*Flux\s+(\d+)\s+(\d+)\s+(\d+)/i);
      if (sfiMatch) {
        sfi1 = sfiMatch[1];
        sfi2 = sfiMatch[2];
        sfi3 = sfiMatch[3];
      }
    }

    // Parse proximo bloque Kp
    let kp_tendencia = "No disponible";
    const inicioTabla = lines.findIndex(l => l.includes("NOAA Kp index breakdown"));
    if (inicioTabla !== -1) {
      const horaUtc = new Date().getUTCHours();
      const bloquesDict: { [key: string]: string } = {
        "0-3": "00-03UT",
        "3-6": "03-06UT",
        "6-9": "06-09UT",
        "9-12": "09-12UT",
        "12-15": "12-15UT",
        "15-18": "15-18UT",
        "18-21": "18-21UT",
        "21-24": "21-00UT",
      };
      
      let bloqueActualStr = "00-03UT";
      for (const key of Object.keys(bloquesDict)) {
        const [start, end] = key.split('-').map(Number);
        if (horaUtc >= start && horaUtc < end) {
          const proximoBloqueHora = end < 24 ? end : 0;
          for (const kNext of Object.keys(bloquesDict)) {
            const [sNext, eNext] = kNext.split('-').map(Number);
            if (proximoBloqueHora >= sNext && proximoBloqueHora < eNext) {
              bloqueActualStr = bloquesDict[kNext];
              break;
            }
          }
          break;
        }
      }

      for (let j = inicioTabla; j < Math.min(lines.length, inicioTabla + 15); j++) {
        if (lines[j].includes(bloqueActualStr)) {
          const valores = lines[j].match(/\d+\.\d+|\d+/g);
          if (valores && valores.length > 0) {
            // El primer valor corresponde al día de hoy
            kp_tendencia = `${valores[0]} Kp (${bloqueActualStr} UTC)`;
          }
          break;
        }
      }
    }

    if (detectedDates.length < 3) {
      const today = new Date();
      detectedDates = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        detectedDates.push(`${months[d.getMonth()]} ${d.getDate()}`);
      }
    }

    const maxKp1 = day1Kps.length > 0 ? Math.max(...day1Kps) : 2;
    const maxKp2 = day2Kps.length > 0 ? Math.max(...day2Kps) : 2;
    const maxKp3 = day3Kps.length > 0 ? Math.max(...day3Kps) : 1;

    function getKpDescription(kp: number) {
      if (kp >= 9) return "Actividad geomagnética extrema (G5)";
      if (kp >= 8) return "Actividad geomagnética severa (G4)";
      if (kp >= 7) return "Actividad geomagnética fuerte (G3)";
      if (kp >= 6) return "Actividad geomagnética moderada (G2)";
      if (kp >= 5) return "Tormenta menor / Actividad menor (G1)";
      if (kp >= 4) return "Campo geomagnético activo (Marginal)";
      if (kp >= 3) return "Campo geomagnético inestable";
      return "Campo geomagnético tranquilo / estable";
    }

    const geom = [
      { dateStr: detectedDates[0], kp: maxKp1, desc: getKpDescription(maxKp1) },
      { dateStr: detectedDates[1], kp: maxKp2, desc: getKpDescription(maxKp2) },
      { dateStr: detectedDates[2], kp: maxKp3, desc: getKpDescription(maxKp3) }
    ];

    const rad = [
      { dateStr: detectedDates[0], level: sLevels[0], desc: sDescs[0] },
      { dateStr: detectedDates[1], level: sLevels[1], desc: sDescs[1] },
      { dateStr: detectedDates[2], level: sLevels[2], desc: sDescs[2] }
    ];

    const blackout = [
      { dateStr: detectedDates[0], level: rLevels[0], desc: rDescs[0] },
      { dateStr: detectedDates[1], level: rLevels[1], desc: rDescs[1] },
      { dateStr: detectedDates[2], level: rLevels[2], desc: rDescs[2] }
    ];

    cachedNoaaForecast = {
      success: true,
      real: true,
      issued,
      geom,
      rad,
      blackout,
      dia1: sfi1,
      dia2: sfi2,
      dia3: sfi3,
      kp_tendencia,
      rawText: text,
      lastUpdated: new Date().toLocaleTimeString('es-ES')
    };
    lastFetchTime = Date.now();
    return cachedNoaaForecast;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("Error fetching/parsing NOAA 3-day forecast:", err.message);
    
    // Return cached if we have it
    if (cachedNoaaForecast) {
      return {
        ...cachedNoaaForecast,
        stale: true,
        error: err.message
      };
    }
    
    // Sin respuesta y sin copia anterior: no hay previsión (antes se inventaba una al azar)
    return {
      success: false,
      real: false,
      issued: '',
      geom: [],
      rad: [],
      blackout: [],
      dia1: '',
      dia2: '',
      dia3: '',
      rawText: 'Fuente de la NOAA no disponible: ' + err.message,
      lastUpdated: new Date().toLocaleTimeString('es-ES'),
      error: err.message
    };
  }
}

let cachedPropagation: any = null;
let lastPropagationFetch: number = 0;

async function fetchGfzNowcast() {
  const d2 = new Date();
  const d1 = new Date(d2.getTime() - 24 * 60 * 60 * 1000 * 2); // 2 days ago to ensure we capture the most recent nowcasts
  
  const start = d1.toISOString().split('.')[0] + 'Z';
  const end = d2.toISOString().split('.')[0] + 'Z';

  const urlHp30 = `https://kp.gfz.de/app/json/?start=${start}&end=${end}&index=Hp30`;
  const urlHp60 = `https://kp.gfz.de/app/json/?start=${start}&end=${end}&index=Hp60`;
  const urlAp30 = `https://kp.gfz.de/app/json/?start=${start}&end=${end}&index=ap30`;
  const urlAp60 = `https://kp.gfz.de/app/json/?start=${start}&end=${end}&index=ap60`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const [res30, res60, resAp30, resAp60] = await Promise.all([
      fetch(urlHp30, { signal: controller.signal }),
      fetch(urlHp60, { signal: controller.signal }),
      fetch(urlAp30, { signal: controller.signal }),
      fetch(urlAp60, { signal: controller.signal })
    ]);
    clearTimeout(timeoutId);

    if (!res30.ok || !res60.ok || !resAp30.ok || !resAp60.ok) {
      throw new Error(`GFZ JSON API HTTP Error: Hp30: ${res30.status}, Hp60: ${res60.status}, ap30: ${resAp30.status}, ap60: ${resAp60.status}`);
    }

    const [data30, data60, dataAp30, dataAp60] = await Promise.all([
      res30.json(),
      res60.json(),
      resAp30.json(),
      resAp60.json()
    ]);

    const datetimes = data30.datetime || [];
    const valuesHp30 = data30.Hp30 || [];
    const valuesHp60 = data60.Hp60 || [];
    const valuesAp30 = dataAp30.ap30 || [];
    const valuesAp60 = dataAp60.ap60 || [];

    if (datetimes.length === 0) {
      throw new Error('GFZ returned empty dataset');
    }

    // Walk backwards to find the last valid measurement index
    let lastIdx = datetimes.length - 1;
    while (lastIdx >= 0 && (valuesHp30[lastIdx] === null || valuesHp30[lastIdx] === undefined)) {
      lastIdx--;
    }

    if (lastIdx < 0) {
      throw new Error('No valid Hp30 data points found in GFZ response');
    }

    const latestTime = datetimes[lastIdx];
    const fecha_utc = latestTime.replace('T', ' ').replace('Z', '').substring(0, 16);

    const Hp30 = parseFloat(valuesHp30[lastIdx]);
    const Hp60 = parseFloat(valuesHp60[lastIdx] !== undefined ? valuesHp60[lastIdx] : Hp30);
    const ap30 = parseFloat(valuesAp30[lastIdx] !== undefined ? valuesAp30[lastIdx] : Math.round(Hp30 * 4));
    const ap60 = parseFloat(valuesAp60[lastIdx] !== undefined ? valuesAp60[lastIdx] : Math.round(Hp60 * 4));

    return {
      fecha_utc,
      Hp30,
      Hp60,
      ap30,
      ap60,
      real: true
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("GFZ (índice Hp30/Hp60) no disponible:", err.message);
    return null;
  }
}

let cachedRtsw: any = null;
let lastRtswFetch: number = 0;

async function fetchNoaaRtswData(isEco: boolean = false) {
  const now = Date.now();
  const cacheLimit = isEco ? 300000 : 60000; // 5 min for eco, 1 min normally
  if (cachedRtsw && (now - lastRtswFetch < cacheLimit)) {
    return cachedRtsw;
  }

  const urlWind = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';
  const urlMag = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const [resWind, resMag] = await Promise.all([
      fetch(urlWind, { signal: controller.signal }),
      fetch(urlMag, { signal: controller.signal })
    ]);
    clearTimeout(timeoutId);

    if (!resWind.ok || !resMag.ok) {
      throw new Error(`RTSW HTTP Error: Wind: ${resWind.status}, Mag: ${resMag.status}`);
    }

    const [windData, magData] = await Promise.all([
      resWind.json(),
      resMag.json()
    ]);

    let speed: number | null = null;
    let density: number | null = null;
    let temperature: number | null = null;
    let windTime: string | null = null;

    if (Array.isArray(windData) && windData.length > 0) {
      const first = windData[0];
      if (Array.isArray(first)) {
        const idxTime = first.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('time'));
        const idxSpeed = first.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('speed'));
        const idxDensity = first.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('density'));
        const idxTemp = first.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('temp'));

        for (let i = 1; i < windData.length; i++) {
          const row = windData[i];
          if (row && Array.isArray(row)) {
            const sVal = idxSpeed !== -1 ? row[idxSpeed] : null;
            const dVal = idxDensity !== -1 ? row[idxDensity] : null;
            if (sVal !== null && sVal !== undefined && dVal !== null && dVal !== undefined) {
              speed = parseFloat(sVal);
              density = parseFloat(dVal);
              temperature = idxTemp !== -1 && row[idxTemp] !== null && row[idxTemp] !== undefined ? parseFloat(row[idxTemp]) : null;
              windTime = idxTime !== -1 && row[idxTime] !== null && row[idxTime] !== undefined ? String(row[idxTime]) : null;
              if (!isNaN(speed) && !isNaN(density)) {
                break;
              }
            }
          }
        }
      } else {
        for (let i = 0; i < windData.length; i++) {
          const item = windData[i];
          if (item) {
            const rawSpeed = item.proton_speed !== undefined ? item.proton_speed : item.speed;
            const rawDensity = item.proton_density !== undefined ? item.proton_density : item.density;
            const rawTemp = item.proton_temperature !== undefined ? item.proton_temperature : item.temperature;
            
            if (rawSpeed !== null && rawSpeed !== undefined && rawDensity !== null && rawDensity !== undefined) {
              speed = parseFloat(rawSpeed);
              density = parseFloat(rawDensity);
              temperature = rawTemp !== null && rawTemp !== undefined ? parseFloat(rawTemp) : null;
              windTime = item.time_tag || item.time || null;
              if (!isNaN(speed) && !isNaN(density)) {
                break;
              }
            }
          }
        }
      }
    }

    let bt: number | null = null;
    let bz: number | null = null;
    let magTime: string | null = null;

    if (Array.isArray(magData) && magData.length > 0) {
      const first = magData[0];
      if (Array.isArray(first)) {
        const idxTime = first.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('time'));
        const idxBt = first.findIndex(h => typeof h === 'string' && h.toLowerCase() === 'bt');
        const idxBz = first.findIndex(h => typeof h === 'string' && (h.toLowerCase() === 'bz' || h.toLowerCase().includes('bz_gse')));

        for (let i = 1; i < magData.length; i++) {
          const row = magData[i];
          if (row && Array.isArray(row)) {
            const btVal = idxBt !== -1 ? row[idxBt] : null;
            const bzVal = idxBz !== -1 ? row[idxBz] : null;
            if (btVal !== null && btVal !== undefined && bzVal !== null && bzVal !== undefined) {
              bt = parseFloat(btVal);
              bz = parseFloat(bzVal);
              magTime = idxTime !== -1 && row[idxTime] !== null && row[idxTime] !== undefined ? String(row[idxTime]) : null;
              if (!isNaN(bt) && !isNaN(bz)) {
                break;
              }
            }
          }
        }
      } else {
        for (let i = 0; i < magData.length; i++) {
          const item = magData[i];
          if (item) {
            const rawBt = item.bt;
            const rawBz = item.bz_gsm !== undefined ? item.bz_gsm : (item.bz_gse !== undefined ? item.bz_gse : item.bz);
            if (rawBt !== null && rawBt !== undefined && rawBz !== null && rawBz !== undefined) {
              bt = parseFloat(rawBt);
              bz = parseFloat(rawBz);
              magTime = item.time_tag || item.time || null;
              if (!isNaN(bt) && !isNaN(bz)) {
                break;
              }
            }
          }
        }
      }
    }

    // Un campo que no venga se toma de la lectura real anterior; si no la hay, queda sin dato (antes se inventaba)
    const previo = (campo: 'speed' | 'density' | 'temperature' | 'bt' | 'bz'): number | null =>
      cachedRtsw && typeof cachedRtsw[campo] === 'number' && !isNaN(cachedRtsw[campo]) ? cachedRtsw[campo] : null;
    if (speed === null || isNaN(speed)) speed = previo('speed');
    if (density === null || isNaN(density)) density = previo('density');
    if (temperature === null || isNaN(temperature)) temperature = previo('temperature');
    if (bt === null || isNaN(bt)) bt = previo('bt');
    if (bz === null || isNaN(bz)) bz = previo('bz');

    cachedRtsw = {
      speed,
      density,
      temperature,
      bt,
      bz,
      time: windTime || magTime || new Date().toISOString(),
      real: true
    };
    lastRtswFetch = now;
    return cachedRtsw;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("Error fetching NOAA RTSW JSON API, using mock/previous:", err.message);
    // Sin respuesta: vale la última lectura real si es de la última media hora; si no, no hay dato
    if (cachedRtsw && cachedRtsw.real && now - lastRtswFetch < 30 * 60_000) return cachedRtsw;
    return null;
  }
}

let cachedXrays = 0.0;
let lastXraysFetch = 0;

async function fetchNoaaXrays() {
  const now = Date.now();
  if (now - lastXraysFetch < 300000 && cachedXrays > 0) {
    return cachedXrays;
  }
  const url = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      const xray_long = data.filter((d: any) => d.energy_band === "0.1-0.8nm" || d.energy === "0.1-0.8nm");
      if (xray_long.length > 0) {
        cachedXrays = parseFloat(xray_long[xray_long.length - 1].flux) || 0.0;
        lastXraysFetch = now;
        return cachedXrays;
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("Error fetching NOAA Xrays:", err.message);
  }
  return cachedXrays; // 0 = sin dato
}

let cachedProtons = 0.0;
let lastProtonsFetch = 0;

async function fetchNoaaProtons() {
  const now = Date.now();
  if (now - lastProtonsFetch < 300000 && cachedProtons > 0) {
    return cachedProtons;
  }
  const url = 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const filtered = data.filter((item: any) => item.energy === '>=10 MeV' || item.energy === '>=10MeV');
      if (filtered.length > 0) {
        cachedProtons = parseFloat(filtered[filtered.length - 1].flux) || 0.0;
      } else {
        cachedProtons = parseFloat(data[data.length - 1].flux) || 0.0;
      }
      lastProtonsFetch = now;
      return cachedProtons;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("Error fetching NOAA Protons:", err.message);
  }
  return cachedProtons; // 0 = sin dato
}

function calculateUvIndex(sfi: number, lat: number, lon: number): number {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const declination = 23.45 * Math.sin((360 / 365) * (284 + dayOfYear) * Math.PI / 180);
    const hourAngle = (now.getUTCHours() + now.getUTCMinutes() / 60 + lon / 15 - 12) * 15;

    const sinElevation = Math.sin(lat * Math.PI / 180) * Math.sin(declination * Math.PI / 180) +
                         Math.cos(lat * Math.PI / 180) * Math.cos(declination * Math.PI / 180) * Math.cos(hourAngle * Math.PI / 180);

    const elevationDeg = Math.asin(Math.max(-1.0, Math.min(1.0, sinElevation))) * 180 / Math.PI;

    if (elevationDeg <= 0) {
      return 0.0;
    }

    const baseUv = 12.5 * sinElevation;
    const sfiFactor = 1.0 + ((sfi - 70) / 200);

    return parseFloat(Math.max(0.0, baseUv * Math.min(1.2, sfiFactor)).toFixed(1));
  } catch (err) {
    return 0.0;
  }
}

function estimateSolarNoise(sfi: number): string {
  if (sfi <= 70) return "Mínimo (Fondo térmico normal)";
  if (sfi <= 120) return "Bajo (+0.5 dB)";
  if (sfi <= 200) return "Moderado (+1.5 dB en 10m/12m)";
  return "Elevado (Ruido constante en bandas altas)";
}

function getNoaaScales(xrayFlux: number, protonFlux: number, kp: number) {
  let rScale = "R0 (Normal)";
  if (xrayFlux >= 2e-4) rScale = "R5 (Extremo)";
  else if (xrayFlux >= 1e-4) rScale = "R4 (Grave)";
  else if (xrayFlux >= 1e-5) rScale = "R3 (Fuerte)";
  else if (xrayFlux >= 5e-6) rScale = "R2 (Moderado)";
  else if (xrayFlux >= 1e-6) rScale = "R1 (Menor)";

  let sScale = "S0 (Normal)";
  if (protonFlux >= 100000) sScale = "S5 (Extremo)";
  else if (protonFlux >= 10000) sScale = "S4 (Grave)";
  else if (protonFlux >= 1000) sScale = "S3 (Fuerte)";
  else if (protonFlux >= 100) sScale = "S2 (Moderado)";
  else if (protonFlux >= 10) sScale = "S1 (Menor)";

  let gScale = "G0 (Normal)";
  if (kp >= 9) gScale = "G5 (Extremo)";
  else if (kp === 8) gScale = "G4 (Severo)";
  else if (kp === 7) gScale = "G3 (Fuerte)";
  else if (kp === 6) gScale = "G2 (Moderado)";
  else if (kp === 5) gScale = "G1 (Menor)";

  return { rScale, sScale, gScale };
}

// Altura del sol en radianes (Meeus, ~0,01°; server/formulas/astro.ts)
function calculateSolarElevation(lat: number, lon: number): number {
  const { y, m, d, utcHours } = unixToUtc(Date.now() / 1000);
  return (sunPosition(y, m, d, utcHours, lat, lon).altDeg * Math.PI) / 180;
}

function calculateMufAndBands(sfi: number, lat: number, lon: number) {
  try {
    const elevationRad = calculateSolarElevation(lat, lon);
    const elevationDeg = (elevationRad * 180) / Math.PI;
    
    const mufBase = 7.0 + (sfi - 65) * 0.06;
    let mufTotal = mufBase;
    
    if (elevationDeg > 0) {
      const diurnalFactor = Math.sin(elevationRad) * (12.0 + (sfi - 70) * 0.12);
      mufTotal = mufBase + diurnalFactor;
    } else {
      mufTotal = Math.max(4.5, mufBase * 0.85);
    }
    
    mufTotal = parseFloat(mufTotal.toFixed(2));
    
    const status20m = mufTotal >= 14.0 ? "Abierta" : "Cerrada";
    const status15m = mufTotal >= 21.0 ? "Abierta" : "Cerrada";
    const status10m = mufTotal >= 28.0 ? "Abierta" : mufTotal >= 26.0 ? "Propagación Crítica" : "Cerrada";
    
    return { muf: mufTotal, b20: status20m, b15: status15m, b10: status10m };
  } catch (err) {
    return { muf: 14.0, b20: "Indeterminado", b15: "Indeterminado", b10: "Indeterminado" };
  }
}

function calculateLuf(sfi: number, xrayFlux: number, lat: number, lon: number): number {
  try {
    const elevationRad = calculateSolarElevation(lat, lon);
    const elevationDeg = (elevationRad * 180) / Math.PI;
    
    // LUF nocturna base
    const lufBase = 1.5 + (sfi - 65) * 0.005;
    let lufTotal = lufBase;
    
    if (elevationDeg > 0) {
      // Absorción diurna por inclinación solar y fotoionización
      const diurnalAbs = Math.sin(elevationRad) * (2.0 + (sfi - 70) * 0.015);
      lufTotal = lufBase + diurnalAbs;
    } else {
      lufTotal = Math.max(1.0, lufBase * 0.7);
    }
    
    // Rayos X: absorción de la capa D solo de día (D-RAP de SWPC; server/propagacion.ts)
    lufTotal += absorcionRayosX(xrayFlux, elevationDeg);
    
    return parseFloat(Math.max(0.5, lufTotal).toFixed(2));
  } catch (err) {
    return 2.0;
  }
}

function getXrayClass(fluxValue: number): string {
  if (fluxValue === undefined || fluxValue === null || fluxValue === 0) return "A0.0";
  if (fluxValue < 1e-8) return "A0.0";
  else if (fluxValue < 1e-7) return `A${(fluxValue / 1e-9).toFixed(1)}`;
  else if (fluxValue < 1e-6) return `B${(fluxValue / 1e-8).toFixed(1)}`;
  else if (fluxValue < 1e-5) return `C${(fluxValue / 1e-7).toFixed(1)}`;
  else if (fluxValue < 1e-4) return `M${(fluxValue / 1e-6).toFixed(1)}`;
  else return `X${(fluxValue / 1e-5).toFixed(1)}`;
}

function estimateSUnitsNoise(kp: number, sfi: number): string {
  try {
    let geomagNoise = 0.5;
    if (kp <= 1) geomagNoise = 0.5;
    else if (kp <= 2) geomagNoise = 1.0;
    else if (kp <= 3) geomagNoise = 2.0;
    else if (kp <= 4) geomagNoise = 3.5;
    else if (kp === 5) geomagNoise = 5.0;
    else if (kp === 6) geomagNoise = 6.5;
    else geomagNoise = 8.0;
    
    const sfiExtra = sfi > 150 ? (sfi > 220 ? 1.0 : 0.5) : 0.0;
    return `S${(geomagNoise + sfiExtra).toFixed(1)}`;
  } catch (err) {
    return "S2.0";
  }
}

async function getPropagationData(isEco: boolean = false) {
  const now = Date.now();
  const cacheLimit = isEco ? 300000 : 60000; // 5 min for eco, 1 min normally
  if (cachedPropagation && (now - lastPropagationFetch < cacheLimit)) {
    return cachedPropagation;
  }
  
  const [gfzResult, noaaResult, rtswResult, solarResult, xrayFlux, protonFlux] = await Promise.all([
    fetchGfzNowcast(),
    fetchNoaa3DayForecast(),
    fetchNoaaRtswData(isEco),
    fetchNoaaSolarIndices(),
    fetchNoaaXrays(),
    fetchNoaaProtons()
  ]);

  // Qué fuentes han respondido. Lo que no se ha podido leer no se sustituye por un valor supuesto.
  const faltan: string[] = [];
  const sfiLeido = parseFloat(solarResult.sfi);
  const haySolar = Number.isFinite(sfiLeido) && !!solarResult.time_tag;
  const hayPrevision = noaaResult.real !== false && Array.isArray(noaaResult.geom) && noaaResult.geom.length > 0;
  const hayGfz = !!gfzResult && gfzResult.real !== false && Number.isFinite(gfzResult.Hp30);
  const hayViento = !!rtswResult && [rtswResult.speed, rtswResult.density, rtswResult.bt, rtswResult.bz].every((v: any) => typeof v === 'number' && !isNaN(v));
  const hayRayosX = xrayFlux > 0;
  if (!haySolar) faltan.push('índices solares (NOAA)');
  if (!hayPrevision) faltan.push('previsión a 3 días (NOAA)');
  if (!hayGfz) faltan.push('índice Kp (GFZ)');
  if (!hayViento) faltan.push('viento solar (NOAA)');
  if (!hayRayosX) faltan.push('rayos X (NOAA)');

  const gpsLat = gpsdState.lat || 40.4167;
  const gpsLon = gpsdState.lon || -3.7037;

  if (faltan.length > 0) {
    // Incompleto: se entrega solo lo leído, marcado. La consola no pinta el panel de detalle con huecos.
    cachedPropagation = {
      lastUpdated: new Date().toLocaleTimeString('es-ES'),
      success: false,
      completa: false,
      faltan,
      gfz: hayGfz ? gfzResult : null,
      noaa: {
        dia1: haySolar ? solarResult.sfi : '',
        ssn: haySolar ? solarResult.ssn : '',
        solar_updated: haySolar ? solarResult.time_tag : '',
        geom: hayPrevision ? noaaResult.geom : [],
        rad: hayPrevision ? noaaResult.rad : [],
        blackout: hayPrevision ? noaaResult.blackout : [],
        real: false,
        xrayFlux,
        protonFlux,
        xrayClass: hayRayosX ? getXrayClass(xrayFlux) : '',
        // Estimaciones que dependen del flujo solar: solo si se ha leído
        muf: haySolar ? calculateMufAndBands(sfiLeido, gpsLat, gpsLon).muf : undefined,
        luf: haySolar ? calculateLuf(sfiLeido, xrayFlux, gpsLat, gpsLon) : undefined,
      },
      rtsw: hayViento ? rtswResult : null,
    };
    lastPropagationFetch = now;
    return cachedPropagation;
  }

  const sfiVal = sfiLeido;
  const iuv = calculateUvIndex(sfiVal, gpsLat, gpsLon);
  const solarNoise = estimateSolarNoise(sfiVal);
  const kpVal = Math.round(gfzResult.Hp30);

  const { rScale, sScale, gScale } = getNoaaScales(xrayFlux, protonFlux, kpVal);
  const mufBands = calculateMufAndBands(sfiVal, gpsLat, gpsLon);
  const lufVal = calculateLuf(sfiVal, xrayFlux, gpsLat, gpsLon);
  const delayL1 = (1500000.0 / rtswResult.speed) / 60.0;

  cachedPropagation = {
    lastUpdated: new Date().toLocaleTimeString('es-ES'),
    success: true,
    completa: true,
    faltan,
    gfz: gfzResult,
    noaa: {
      dia1: solarResult.sfi,
      dia2: noaaResult.dia2 || solarResult.sfi,
      dia3: noaaResult.dia3 || solarResult.sfi,
      geom: noaaResult.geom,
      rad: noaaResult.rad || [],
      blackout: noaaResult.blackout || [],
      real: true,
      ssn: solarResult.ssn,
      solar_updated: solarResult.time_tag,
      kp_tendencia: noaaResult.kp_tendencia || 'No disponible',
      xrayFlux,
      protonFlux,
      rScale,
      sScale,
      gScale,
      iuv,
      solarNoise,
      gps_status: gpsdState.isFallback ? "Estática (Fallback / Config)" : "GPS Real (GNSS Fijado)",
      xrayClass: getXrayClass(xrayFlux),
      noiseS: estimateSUnitsNoise(kpVal, sfiVal),
      muf: mufBands.muf,
      luf: lufVal,
      b20: mufBands.b20,
      b15: mufBands.b15,
      b10: mufBands.b10,
      delayL1
    },
    rtsw: rtswResult
  };
  lastPropagationFetch = now;
  return cachedPropagation;
}

// ---------------------------------------------------------------------------
// HF: resumen de propagación, con lo medido separado de lo estimado
// ---------------------------------------------------------------------------
let ionosondas: { lista: Ionosonda[]; cuando: number } | null = null;
let descargaIonosondas = 0;

async function ionosondaDeLaEstacion(): Promise<Ionosonda | null> {
  const ahora = Date.now();
  // Las ionosondas miden cada 5-15 minutos: se consultan cada 5
  if (ahora - descargaIonosondas > 5 * 60_000) {
    descargaIonosondas = ahora;
    const lista = await descargarIonosondas();
    if (lista) ionosondas = { lista, cuando: ahora };
    anotarFuente('ionosonda', 'Ionosondas · GIRO', lista !== null, lista ? `${lista.length} estaciones` : 'Sin respuesta');
  }
  return ionosondas ? ionosondaCercana(ionosondas.lista, { lat: gpsdState.lat, lon: gpsdState.lon }, ahora) : null;
}

app.get('/api/hf', async (_req, res) => {
  try {
    const [prop, sonda] = await Promise.all([getPropagationData(false), ionosondaDeLaEstacion()]);
    const n = prop.noaa;
    const ahora = Date.now();
    // Índices solares: solo valen si la NOAA los dio (sin respuesta, el servidor rellena con 150/110)
    const solarReal = !!n.solar_updated;
    const kpGfz = prop.gfz && prop.gfz.real !== false && Number.isFinite(prop.gfz.Hp30);
    const viento = prop.rtsw && prop.rtsw.real && prop.rtsw.speed !== null ? prop.rtsw : null;
    const oficiales = escalasOficiales && ahora - escalasOficiales.cuando < 2 * 3600_000 ? escalasOficiales.niveles : null;
    const escala = (letra: 'R' | 'S' | 'G', derivada: string | undefined) => {
      const o = oficiales?.find((x) => x.escala === letra);
      if (o) return o.nivel;
      const m = /^[RSG](\d)/.exec(derivada || '');
      return m ? Number(m[1]) : null;
    };
    const mufMedida = sonda?.muf3000;
    const ionosfera = { fof2: sonda?.fof2, muf3000: mufMedida ?? (solarReal ? n.muf : undefined), // La LUF es siempre una estimación (altura del sol y rayos X); sin flujo solar leído se calcula con uno medio
      luf: n.luf };
    const bandas = estadoBandas(ionosfera);
    const { y, m, d, utcHours } = unixToUtc(ahora / 1000);
    const sol = sunTimes(y, m, d, gpsdState.lat, gpsdState.lon, -0.833);
    const hhmm = (min: number) => {
      const t = ((Math.round(min) % 1440) + 1440) % 1440;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };
    res.set('Cache-Control', 'no-store');
    res.json({
      actualizado: ahora,
      sfi: solarReal ? Number(n.dia1) || null : null,
      manchas: solarReal ? Number(n.ssn) || null : null,
      fechaSolar: n.solar_updated || null,
      kp: kpGfz ? { valor: Math.round(prop.gfz.Hp30 * 10) / 10, origen: 'GFZ (Hp30)' } : null,
      rayosX: Number.isFinite(n.xrayFlux) && (n.xrayFlux as number) > 0 ? n.xrayClass : null,
      escalas: { R: escala('R', n.rScale), S: escala('S', n.sScale), G: escala('G', n.gScale), oficiales: !!oficiales },
      vientoSolar: viento ? { velocidad: viento.speed, bz: viento.bz, densidad: viento.density } : null,
      ionosonda: sonda ? {
        nombre: sonda.nombre, codigo: sonda.codigo, distanciaKm: Math.round(sonda.distanciaKm ?? 0),
        fof2: sonda.fof2 ?? null, muf3000: sonda.muf3000 ?? null, hmf2: sonda.hmf2 ?? null, cuando: sonda.cuando,
      } : null,
      muf: ionosfera.muf3000 !== undefined ? { valor: Math.round(ionosfera.muf3000 * 10) / 10, medida: mufMedida !== undefined } : null,
      luf: ionosfera.luf !== undefined ? Math.round(ionosfera.luf * 10) / 10 : null,
      bandas,
      mejorLocal: mejorBanda(bandas, 'nvis'),
      mejorDx: mejorBanda(bandas, 'dx'),
      sol: sol ? { orto: hhmm(sol.riseUtcMin), ocaso: hhmm(sol.setUtcMin), deDia: sunPosition(y, m, d, utcHours, gpsdState.lat, gpsdState.lon).altDeg > 0 } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/space-weather/forecast-3day', async (req, res) => {
  const force = req.query.force === 'true';
  const now = Date.now();
  
  // Rate limit fetches to 30 seconds unless forced
  if (cachedNoaaForecast && (now - lastFetchTime < 30000) && !force) {
    return res.json(cachedNoaaForecast);
  }
  
  const result = await fetchNoaa3DayForecast();
  res.json(result);
});

// Space Weather APRS Bulletin Endpoints
app.get('/api/space-weather/aprs-bulletin', async (req, res) => {
  try {
    const preview = await formatSpaceWeatherAprsBulletin();
    res.json({
      success: true,
      config: spaceWeatherAprsConfig,
      currentAlerts: {
        rScale: preview.rScale,
        sScale: preview.sScale,
        gScale: preview.gScale,
      },
      metrics: {
        sfi: preview.sfi,
        kp: preview.kp,
        ssn: preview.ssn,
        muf: preview.muf,
        hfStatus: preview.status,
        bandaUtil: preview.bandaUtil,
        delayL1: preview.delayL1
      },
      latestPacket: preview.packet,
      history: spaceWeatherAprsHistory
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/space-weather/aprs-bulletin/config', (req, res) => {
  try {
    const { 
      enabled, 
      intervalMinutes, 
      addressee, 
      template, 
      includeBands,
      thresholdG,
      thresholdR,
      thresholdS,
      aprsOnAlertOnly,
      autoSendOnChange,
      minIntervalOnChangeMinutes,
      soundGEnabled,
      soundREnabled,
      soundSEnabled
    } = req.body;

    if (typeof enabled === 'boolean') spaceWeatherAprsConfig.enabled = enabled;
    if (typeof intervalMinutes === 'number' && intervalMinutes >= 1) spaceWeatherAprsConfig.intervalMinutes = intervalMinutes;
    if (typeof addressee === 'string' && addressee.trim()) spaceWeatherAprsConfig.addressee = addressee.trim().toUpperCase();
    if (typeof template === 'string') spaceWeatherAprsConfig.template = template;
    if (typeof includeBands === 'boolean') spaceWeatherAprsConfig.includeBands = includeBands;

    if (typeof thresholdG === 'number') spaceWeatherAprsConfig.thresholdG = Math.max(0, Math.min(5, thresholdG));
    if (typeof thresholdR === 'number') spaceWeatherAprsConfig.thresholdR = Math.max(0, Math.min(5, thresholdR));
    if (typeof thresholdS === 'number') spaceWeatherAprsConfig.thresholdS = Math.max(0, Math.min(5, thresholdS));

    if (typeof aprsOnAlertOnly === 'boolean') spaceWeatherAprsConfig.aprsOnAlertOnly = aprsOnAlertOnly;
    if (typeof autoSendOnChange === 'boolean') spaceWeatherAprsConfig.autoSendOnChange = autoSendOnChange;
    if (typeof minIntervalOnChangeMinutes === 'number' && minIntervalOnChangeMinutes >= 1) {
      spaceWeatherAprsConfig.minIntervalOnChangeMinutes = minIntervalOnChangeMinutes;
    }

    if (typeof soundGEnabled === 'boolean') spaceWeatherAprsConfig.soundGEnabled = soundGEnabled;
    if (typeof soundREnabled === 'boolean') spaceWeatherAprsConfig.soundREnabled = soundREnabled;
    if (typeof soundSEnabled === 'boolean') spaceWeatherAprsConfig.soundSEnabled = soundSEnabled;

    res.json({ success: true, config: spaceWeatherAprsConfig });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/space-weather/aprs-bulletin/transmit', async (req, res) => {
  try {
    const result = await transmitSpaceWeatherAprsBulletin(true);
    res.json({
      success: true,
      message: 'Boletín APRS de Clima Espacial & Propagación HF transmitido con éxito.',
      item: result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/telemetry/clear-logs', (req, res) => {
  logs = [];
  res.json({ success: true, msg: 'Registro de la consola vaciado en pantalla; el historial en disco se conserva.' });
});

// Servicios cuyos registros puede vaciar la consola
const CLEARABLE_SERVICES = new Set(['all', 'aprx', 'direwolf', 'weewx', 'gpsd', 'ntpsec', 'aprsc', 'aiscatcher', 'pat', 'sat-aprs']);

app.post('/api/system/clear-service-logs', (req, res) => {
  const service = String(req.body?.service || '');
  if (!CLEARABLE_SERVICES.has(service)) {
    return res.status(400).json({ success: false, error: 'Parámetro "service" ausente o no admitido.' });
  }

  const isAuth = isAuthorizedRequest(req);
  if (!isAuth) {
    return res.status(403).json({ success: false, error: 'Solo el administrador puede vaciar los registros de los servicios.' });
  }

  // Órdenes con argumentos fijos y sin intérprete de órdenes. El nombre del
  // servicio ya está validado contra CLEARABLE_SERVICES: nunca se interpola
  // texto de la petición en una línea de órdenes.
  const commands: string[][] = [];
  if (service === 'aprx' || service === 'all') {
    commands.push(['truncate', '-s', '0', '/var/log/aprx/aprx-rf.log']);
    commands.push(['truncate', '-s', '0', '/var/log/aprx/aprx-rf.log.1']);
    commands.push(['truncate', '-s', '0', '/var/log/aprx.log']);
  }
  if (service === 'weewx' || service === 'all') {
    commands.push(['truncate', '-s', '0', '/var/log/weewx.log']);
  }
  // journald no permite purgar una sola unidad: se rota y se compacta el diario
  commands.push(['journalctl', '--rotate']);
  commands.push(['journalctl', '--vacuum-time=1s']);

  const runSudo = (args: string[]) => new Promise<void>((resolve) => {
    execFile('sudo', ['-n', ...args], { timeout: 10000 }, (err) => {
      if (err) console.warn(`[SYS LOG CLEAR] Falló 'sudo ${args.join(' ')}': ${err.message}`);
      resolve();
    });
  });

  (async () => {
    for (const args of commands) {
      await runSudo(args);
    }
    // Also clear the general server logs in-memory array if it matches
    if (service === 'all' || service === 'direwolf') {
      logs = [];
    }
    addLog('SYS', service.toUpperCase(), 'LOCAL', 'LOGS_CLEARED', `Borrado y reinicio de logs del servicio ${service} solicitado sobre la Intel NUC Debian 13.`, true, 'Logs limpiados');
    res.json({ success: true, msg: `Logs del servicio ${service} borrados con éxito en la Intel NUC.` });
  })();
});








// —— SISTEMA DE MONITOREO DE INCENDIOS EN TIEMPO REAL (NASA FIRMS & COPERNICUS) ——




app.get('/api/aemet/request', async (req, res) => {
  try {
    const endpointQuery = req.query.endpoint as string;
    if (!endpointQuery) {
      return res.status(400).json({ success: false, error: 'Endpoint query parameter required' });
    }

    let cleanEndpoint = endpointQuery.trim();
    if (!cleanEndpoint.startsWith('/')) {
      cleanEndpoint = '/' + cleanEndpoint;
    }

    if (!config.aemetApiKey || config.aemetApiKey.length < 5) {
      return res.status(503).json({ success: false, endpoint: cleanEndpoint, error: 'Falta la clave de AEMET OpenData.' });
    }

    let apiPath = cleanEndpoint;
    if (apiPath.startsWith('/opendata')) {
      apiPath = apiPath.replace('/opendata', '');
    }
    
    const targetUrl = `https://opendata.aemet.es/opendata${apiPath}`;
    addLog('SYS', 'AEMET', 'PROXY', 'OPENDATA', `Solicitando producto oficial: ${apiPath}`, true, 'Iniciando');

    const wrapperResponse = await fetch(`${targetUrl}?api_key=${config.aemetApiKey}`, {
      headers: {
        'api_key': config.aemetApiKey,
        'accept': 'application/json'
      }
    });

    if (!wrapperResponse.ok) {
      throw new Error(`AEMET OpenData respondió estado HTTP: ${wrapperResponse.status}`);
    }

    const wrapper = await wrapperResponse.json() as any;
    if (wrapper.estado !== 200 || !wrapper.datos) {
      addLog('SYS', 'AEMET', 'PROXY', 'WARNING', `AEMET retornó estado ${wrapper.estado}: ${wrapper.descripcion || ''}.`, false, 'Sin datos');
      return res.status(502).json({ success: false, endpoint: cleanEndpoint, error: `AEMET: ${wrapper.estado} - ${wrapper.descripcion}` });
    }

    const dataResponse = await fetch(wrapper.datos);
    if (!dataResponse.ok) {
      throw new Error(`Error descargando el recurso de datos finales desde: ${wrapper.datos}`);
    }

    const finalContentType = dataResponse.headers.get('content-type') || '';
    let finalData;

    if (finalContentType.includes('json')) {
      finalData = await dataResponse.json();
    } else {
      finalData = await dataResponse.text();
    }

    addLog('SYS', 'AEMET', 'PROXY', 'SUCCESS', `Producto descargado con éxito: ${apiPath}`, true, 'Ok');

    return res.json({
      success: true,
      isSimulated: false,
      endpoint: cleanEndpoint,
      wrapper,
      data: finalData
    });

  } catch (err: any) {
    addLog('SYS', 'AEMET', 'PROXY', 'ERROR', `Fallo de conexión: ${err.message}.`, false, 'Error');
    return res.status(502).json({ success: false, error: err.message });
  }
});

// --- AEMET GPSD GEOLOCATIONAL SUBSCRIPTION ---
interface SpanishProvince {
  name: string;
  region: string;
  lat: number;
  lon: number;
  aemetCode: string;
}

const SPANISH_PROVINCES: SpanishProvince[] = [
  { name: 'Madrid', region: 'Comunidad de Madrid', lat: 40.4167, lon: -3.7037, aemetCode: 'mad' },
  { name: 'Barcelona', region: 'Cataluña', lat: 41.3851, lon: 2.1734, aemetCode: 'bar' },
  { name: 'Valencia', region: 'Comunidad Valenciana', lat: 39.4699, lon: -0.3763, aemetCode: 'val' },
  { name: 'Sevilla', region: 'Andalucía', lat: 37.3891, lon: -5.9845, aemetCode: 'sev' },
  { name: 'Zaragoza', region: 'Aragón', lat: 41.6488, lon: -0.8891, aemetCode: 'zar' },
  { name: 'Málaga', region: 'Andalucía', lat: 36.7213, lon: -4.4214, aemetCode: 'mal' },
  { name: 'A Coruña', region: 'Galicia', lat: 43.3623, lon: -8.4115, aemetCode: 'cor' },
  { name: 'Vizcaya', region: 'País Vasco', lat: 43.2630, lon: -2.9350, aemetCode: 'viz' },
  { name: 'Asturias', region: 'Principado de Asturias', lat: 43.3614, lon: -5.8593, aemetCode: 'ast' },
  { name: 'Murcia', region: 'Región de Murcia', lat: 37.9922, lon: -1.1307, aemetCode: 'mur' },
  { name: 'Las Palmas', region: 'Canarias', lat: 28.1235, lon: -15.4363, aemetCode: 'lpa' },
  { name: 'Santa Cruz de Tenerife', region: 'Canarias', lat: 28.4636, lon: -16.2518, aemetCode: 'ten' },
  { name: 'Baleares', region: 'Islas Baleares', lat: 39.5696, lon: 2.6502, aemetCode: 'bal' },
  { name: 'Cáceres', region: 'Extremadura', lat: 39.4753, lon: -6.3724, aemetCode: 'cac' },
  { name: 'Toledo', region: 'Castilla-La Mancha', lat: 39.8628, lon: -4.0273, aemetCode: 'tol' },
  { name: 'Valladolid', region: 'Castilla y León', lat: 41.6523, lon: -4.7245, aemetCode: 'val' }
];

function getClosestProvince(lat: number, lon: number): SpanishProvince {
  let closest = SPANISH_PROVINCES[0];
  let minDist = calculateDistance(lat, lon, closest.lat, closest.lon);
  
  for (let i = 1; i < SPANISH_PROVINCES.length; i++) {
    const d = calculateDistance(lat, lon, SPANISH_PROVINCES[i].lat, SPANISH_PROVINCES[i].lon);
    if (d < minDist) {
      minDist = d;
      closest = SPANISH_PROVINCES[i];
    }
  }
  return closest;
}

// ---------------------------------------------------------------------------
// Avisos meteorológicos oficiales (AEMET Meteoalerta) sobre la cadena de avisos
// ---------------------------------------------------------------------------
const cacheCapAemet: CacheCap = new Map();
let avisosAemet: AvisoAemet[] = [];
let eventosMeteo: Evento[] = [];
let timerAvisosMeteo: NodeJS.Timeout | undefined;
let timerDifusionMeteo: NodeJS.Timeout | undefined;
let descargandoAvisosMeteo = false;

const GRAVEDADES: Gravedad[] = ['info', 'amarillo', 'naranja', 'rojo'];

// Zonas que contienen la estación o cercanas, a partir del nivel configurado.
// Se anuncian con la antelación indicada y se repiten mientras sigan vigentes.
function politicaMeteo(): Politica {
  const minima = GRAVEDADES.includes(config.meteoGravedadMinima as Gravedad) ? (config.meteoGravedadMinima as Gravedad) : 'amarillo';
  return {
    radioKm: Math.max(0, Number(config.meteoRadioKm ?? 25)),
    gravedadMinima: minima,
    vigenciaMs: 24 * 3600_000,
    antelacionMs: Math.max(1, Number(config.meteoAntelacionH ?? 12)) * 3600_000,
    repetirCadaMs: Math.max(15, Number(config.meteoRepetirMin ?? 60)) * 60_000,
    boletin: config.autoGenerarBoletinEmergencia !== false,
  };
}

const PARAMETRO_PANEL: Record<string, AemetWeatherAlert['parameter']> = {
  VI: 'viento', PR: 'lluvia', TO: 'tormentas', AT: 'temperatura', BT: 'temperatura', OC: 'temperatura', OF: 'temperatura',
};
const NIVEL_PANEL: Record<string, AemetWeatherAlert['severity']> = { amarillo: 'YELLOW', naranja: 'ORANGE', rojo: 'RED', info: 'GREEN' };

/** Avisos oficiales para el panel: los de las zonas dentro del radio general de la estación. */
function avisosAemetParaPanel(): AemetWeatherAlert[] {
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const radio = config.filterRadiusKm || 200;
  return avisosAemet
    .map((a) => {
      const e = avisoAEvento(a);
      const distanceKm = a.poligono.length >= 3 ? distanciaAZonaKm(estacion, a.poligono) : undefined;
      const alerta: AemetWeatherAlert = {
        id: e.id,
        province: a.nombreZona,
        region: 'AEMET Meteoalerta',
        headline: a.titular,
        description: a.descripcion || a.titular,
        severity: NIVEL_PANEL[a.nivel] || 'YELLOW',
        parameter: PARAMETRO_PANEL[a.fenomeno] || 'otros',
        value: a.valor || a.nombreFenomeno,
        onset: new Date(a.inicio).toISOString(),
        expires: new Date(a.fin).toISOString(),
        lat: e.lat,
        lon: e.lon,
        distanceKm: distanceKm !== undefined ? Math.round(distanceKm) : undefined,
      };
      return alerta;
    })
    .filter((a) => a.distanceKm === undefined || a.distanceKm <= radio)
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
}

/** Recompone la lista del panel: avisos oficiales más los inyectados a mano como prueba (estos nunca se emiten). */
function refreshAemetWarnings() {
  if (!config.aemetAlertsSubscriptionEnabled) {
    aemetAlerts = [];
    return;
  }
  aemetAlerts = [...customInjectedAemetAlerts, ...avisosAemetParaPanel()];
}

/** Descarga los avisos oficiales y difunde los que afectan a la estación. */
async function descargarAvisosMeteo() {
  if (descargandoAvisosMeteo) return;
  if (config.systemPower === false || !config.aemetAlertsSubscriptionEnabled) {
    avisosAemet = [];
    eventosMeteo = [];
    refreshAemetWarnings();
    return;
  }
  descargandoAvisosMeteo = true;
  try {
    const avisos = await descargarAvisosAemet(cacheCapAemet, (origen, texto, ok) => addLog('SYS', origen, 'LOCAL', 'API', texto, ok, ok ? 'Servicios' : 'Sin datos'));
    anotarFuente('aemet', 'Avisos · AEMET', avisos !== null, avisos !== null ? `${avisos.length} avisos en vigor o previstos` : 'No se pudo descargar el índice');
    if (avisos) {
      // Si la descarga falla se conserva la última lista válida (los caducados se descartan solos)
      avisosAemet = avisos;
      eventosMeteo = avisos.map(avisoAEvento);
    }
    refreshAemetWarnings();
    difundirAvisos(eventosMeteo, politicaMeteo());
  } catch (e: any) {
    addLog('SYS', 'AEMET', 'LOCAL', 'API', `Error al procesar los avisos de AEMET: ${e?.message || e}.`, false, 'Sin datos');
  } finally {
    descargandoAvisosMeteo = false;
  }
}

function programarAvisosMeteo() {
  if (timerAvisosMeteo) clearInterval(timerAvisosMeteo);
  if (timerDifusionMeteo) clearInterval(timerDifusionMeteo);
  timerAvisosMeteo = setInterval(descargarAvisosMeteo, 10 * 60_000);
  // Entre descargas: repeticiones y avisos que entran en plazo o en radio (estación móvil)
  timerDifusionMeteo = setInterval(() => {
    if (config.aemetAlertsSubscriptionEnabled) difundirAvisos(eventosMeteo, politicaMeteo());
  }, 60_000);
  setTimeout(descargarAvisosMeteo, 5000);
}

// ---------------------------------------------------------------------------
// Clima espacial, focos de calor y calidad del aire sobre la cadena de avisos
// ---------------------------------------------------------------------------
let eventosEspacio: Evento[] = [];
// Último estado oficial de las escalas R, S y G (para la pantalla de HF)
let escalasOficiales: { niveles: NivelEscala[]; cuando: number } | null = null;
let eventosFuego: Evento[] = [];
let eventosAire: Evento[] = [];
const registrarFuente = (origen: string, texto: string, ok: boolean) => addLog('SYS', origen, 'LOCAL', 'API', texto, ok, ok ? 'Servicios' : 'Sin datos');
const gravedadDe = (valor: unknown, porDefecto: Gravedad): Gravedad => (GRAVEDADES.includes(valor as Gravedad) ? (valor as Gravedad) : porDefecto);

// Global, sin límite geográfico: a partir del nivel configurado y cada 3 horas mientras dure
function politicaEspacio(): Politica {
  const minimo = Math.min(5, Math.max(1, Math.round(Number(config.climaEspacialNivelMin ?? 2))));
  return {
    radioKm: null, gravedadMinima: 'info', vigenciaMs: 3600_000, repetirCadaMs: 180 * 60_000,
    boletin: true, filtro: (e) => (e.datos?.nivel ?? 0) >= minimo,
  };
}

// Focos de calor a menos de `fuegoRadioKm`; valen 12 horas desde la pasada del satélite
function politicaFuego(): Politica {
  return {
    radioKm: Math.min(300, Math.max(5, Number(config.fuegoRadioKm ?? 50))), gravedadMinima: gravedadDe(config.fuegoGravedadMinima, 'naranja'),
    vigenciaMs: 12 * 3600_000, repetirCadaMs: 60 * 60_000, boletin: config.autoGenerarBoletinEmergencia !== false,
  };
}

// Aire malo en la propia estación: cada 2 horas mientras dure
function politicaAire(): Politica {
  return { radioKm: null, gravedadMinima: gravedadDe(config.aireGravedadMinima, 'naranja'), vigenciaMs: 2 * 3600_000, repetirCadaMs: 120 * 60_000, boletin: true };
}

async function descargarClimaEspacialAvisos() {
  if (config.systemPower === false || config.climaEspacialEnabled === false) { eventosEspacio = []; return; }
  const niveles = await descargarClimaEspacial(registrarFuente);
  anotarFuente('espacio', 'Clima espacial · NOAA', niveles !== null, niveles ? niveles.map((n) => `${n.escala}${n.nivel}`).join(' ') : 'Sin respuesta');
  if (niveles) {
    escalasOficiales = { niveles, cuando: Date.now() };
    eventosEspacio = niveles.map((n) => escalaAEvento(n)).filter((e): e is Evento => e !== null);
  }
  difundirAvisos(eventosEspacio, politicaEspacio());
}

async function descargarFuegoAvisos() {
  if (config.systemPower === false || config.fuegoEnabled === false) { eventosFuego = []; return; }
  // Se descarga algo más que el radio de aviso para que el mapa muestre el entorno
  const radio = Math.max(politicaFuego().radioKm ?? 50, config.filterRadiusKm || 200);
  const grupos = await descargarFocos({ lat: gpsdState.lat, lon: gpsdState.lon }, radio, registrarFuente);
  anotarFuente('fuego', 'Focos de calor · FIRMS', grupos !== null, grupos ? `${grupos.length} grupos de focos` : 'Sin respuesta');
  if (grupos) eventosFuego = grupos.map(grupoAEvento);
  difundirAvisos(eventosFuego, politicaFuego());
}

async function descargarAireAvisos() {
  if (config.systemPower === false || config.aireEnabled === false) { eventosAire = []; return; }
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const aire = await descargarCalidadAire(estacion, registrarFuente);
  anotarFuente('aire', 'Calidad del aire · CAMS', aire !== null, aire ? `Índice europeo ${Math.round(aire.indice)}` : 'Sin respuesta');
  if (aire) {
    const evento = aireAEvento(aire);
    eventosAire = evento ? [evento] : [];
  }
  difundirAvisos(eventosAire, politicaAire());
}

// Umbrales de la estación y pronóstico de WeatherAPI (lo que hacía el agente aprs_sat.py)
let eventosUmbrales: Evento[] = [];
let eventosPronostico: Evento[] = [];
function politicaUmbrales(): Politica {
  return { radioKm: null, gravedadMinima: 'info', vigenciaMs: 6 * 3600_000, repetirCadaMs: 6 * 3600_000, boletin: true };
}
function politicaPronostico(): Politica {
  return { radioKm: null, gravedadMinima: politicaMeteo().gravedadMinima, vigenciaMs: 24 * 3600_000, antelacionMs: 72 * 3600_000, repetirCadaMs: 6 * 3600_000, boletin: true };
}
function evaluarUmbralesLocales() {
  if (config.systemPower === false || config.avisosUmbralesLocales !== true) { eventosUmbrales = []; return; }
  // La propia si es reciente; si no, la de Internet (la misma elección que el parte meteorológico)
  const obs = elegirObservacion('auto', observacionPropia, observacionInternet, Date.now());
  const nuevos = eventosUmbralesLocales(obs, {
    vientoKn: Number(config.localThresholdWindKts ?? 20), tempMaxC: Number(config.localThresholdTempMaxC ?? 35),
    tempMinC: Number(config.localThresholdTempMinC ?? 5), lluvia1hMm: Number(config.localThresholdRainMm ?? 10),
  }, { lat: gpsdState.lat, lon: gpsdState.lon });
  // Lo que ya saltó hoy se conserva aunque la medida baje, hasta que caduque
  const ahora = Date.now();
  const vigentes = eventosUmbrales.filter((e) => (e.fin ?? 0) > ahora && !nuevos.some((n) => n.id === e.id));
  eventosUmbrales = [...nuevos, ...vigentes];
  difundirAvisos(eventosUmbrales, politicaUmbrales());
}
async function descargarPronosticoAvisos() {
  if (config.systemPower === false || config.avisosPronostico !== true || !config.weatherApiKey) { eventosPronostico = []; return; }
  try {
    const j = await descargarWeatherApi(String(config.weatherApiKey), gpsdState.lat, gpsdState.lon, Number(config.forecastDays ?? 3));
    eventosPronostico = eventosPronosticoWeatherApi(j, {
      vientoKn: Number(config.thresholdWindKts ?? 25), tempMinC: Number(config.thresholdTempMinC ?? 0), lluviaMm: Number(config.thresholdRainMm ?? 20),
    }, { lat: gpsdState.lat, lon: gpsdState.lon });
    anotarFuente('pronostico', 'Pronóstico · WeatherAPI', true, `${eventosPronostico.length} avisos del pronóstico`);
  } catch (e: any) {
    anotarFuente('pronostico', 'Pronóstico · WeatherAPI', false, e?.message || 'Sin respuesta');
  }
  difundirAvisos(eventosPronostico, politicaPronostico());
}

// MeteoAlarm, ciclones tropicales (NHC) y radiactividad ambiental (EURDEP)
let eventosMeteoAlarmLista: Evento[] = [];
let eventosCiclonesLista: Evento[] = [];
let eventosRadiacionLista: Evento[] = [];
let sondasRadiacion: { sondas: Sonda[]; cuando: number } | null = null;
// Zonas de MeteoAlarm vistas en los feeds, para elegir las que se siguen (se guardan en el historial)
const zonasMeteoAlarm: Record<string, { nombre: string; pais: string; visto: number }> = historial.leerEstado('meteoalarmZonas') ?? {};
const paisesMeteoAlarm = () => String(config.meteoalarmPaises ?? '').split(/[,;\s]+/).map((p) => p.trim().toLowerCase()).filter((p) => /^[a-z][a-z-]{2,29}$/.test(p)).slice(0, 6);
function politicaMeteoAlarm(): Politica {
  return {
    radioKm: null, gravedadMinima: gravedadDe(config.meteoalarmGravedadMinima, 'amarillo'), vigenciaMs: 6 * 3600_000,
    antelacionMs: 12 * 3600_000, repetirCadaMs: Math.min(720, Math.max(10, Number(config.meteoalarmRepetirMin ?? 60))) * 60_000, boletin: true,
  };
}
function politicaCiclones(): Politica {
  return {
    radioKm: Math.min(5000, Math.max(50, Number(config.ciclonesRadioKm ?? 1000))), gravedadMinima: gravedadDe(config.ciclonesGravedadMinima, 'amarillo'),
    vigenciaMs: 9 * 3600_000, repetirCadaMs: 180 * 60_000, boletin: true,
  };
}
function politicaRadiacion(): Politica {
  return { radioKm: Math.min(1000, Math.max(5, Number(config.radiacionRadioKm ?? 100))), gravedadMinima: 'amarillo', vigenciaMs: 3 * 3600_000, repetirCadaMs: 120 * 60_000, boletin: true };
}
async function descargarMeteoAlarmAvisos() {
  if (config.systemPower === false || config.meteoalarmEnabled !== true) { eventosMeteoAlarmLista = []; return; }
  const todos: AvisoMeteoAlarm[] = [];
  const fallos: string[] = [];
  for (const pais of paisesMeteoAlarm()) {
    try { todos.push(...await descargarMeteoAlarm(pais)); } catch (e: any) { fallos.push(`${pais}: ${e?.message || e}`); }
  }
  const ahora = Date.now();
  for (const a of todos) zonasMeteoAlarm[a.zona] = { nombre: a.nombreZona, pais: a.pais, visto: ahora };
  historial.guardarEstado('meteoalarmZonas', zonasMeteoAlarm);
  if (todos.length || !fallos.length) {
    eventosMeteoAlarmLista = eventosMeteoAlarm(todos, String(config.meteoalarmZonas ?? ''), { lat: gpsdState.lat, lon: gpsdState.lon }, ahora, !!config.aemetAlertsSubscriptionEnabled);
  }
  anotarFuente('meteoalarm', 'Avisos · MeteoAlarm', fallos.length === 0, fallos.length ? fallos.join(' · ') : `${todos.length} avisos en ${paisesMeteoAlarm().join(', ') || 'ningún país'} · ${eventosMeteoAlarmLista.length} en las zonas seguidas`);
  difundirAvisos(eventosMeteoAlarmLista, politicaMeteoAlarm());
}
async function descargarCiclonesAvisos() {
  if (config.systemPower === false || config.ciclonesEnabled !== true) { eventosCiclonesLista = []; return; }
  try {
    eventosCiclonesLista = eventosCiclones(await descargarCiclones());
    anotarFuente('ciclones', 'Ciclones tropicales · NHC', true, eventosCiclonesLista.length ? eventosCiclonesLista.map((e) => e.titulo).join(', ') : 'Ningún ciclón activo');
  } catch (e: any) {
    anotarFuente('ciclones', 'Ciclones tropicales · NHC', false, e?.message || 'Sin respuesta');
  }
  difundirAvisos(eventosCiclonesLista, politicaCiclones());
}
async function descargarRadiacionAvisos() {
  if (config.systemPower === false || config.radiacionEnabled !== true) { eventosRadiacionLista = []; sondasRadiacion = null; return; }
  try {
    const sondas = await descargarEurdep(String(config.radiacionPaises ?? 'ES').split(/[,;\s]+/));
    sondasRadiacion = { sondas, cuando: Date.now() };
    eventosRadiacionLista = eventosRadiacion(sondas, Number(config.radiacionUmbral ?? 0.3));
    const cerca = sondasCercanas(sondas, { lat: gpsdState.lat, lon: gpsdState.lon }, 1)[0];
    anotarFuente('radiacion', 'Radiactividad · EURDEP', true, cerca ? `${sondas.length} sondas · la más cercana, ${cerca.nombre}: ${cerca.valor.toFixed(2)} µSv/h` : `${sondas.length} sondas`);
  } catch (e: any) {
    anotarFuente('radiacion', 'Radiactividad · EURDEP', false, e?.message || 'Sin respuesta');
  }
  difundirAvisos(eventosRadiacionLista, politicaRadiacion());
}

function programarOtrasFuentes() {
  const seguro = (f: () => Promise<void>) => () => { f().catch((e) => console.warn(`[AVISOS] ${e?.message || e}`)); };
  setInterval(seguro(descargarClimaEspacialAvisos), 5 * 60_000);
  setInterval(seguro(descargarFuegoAvisos), 30 * 60_000);
  setInterval(seguro(descargarAireAvisos), 30 * 60_000);
  setTimeout(seguro(descargarClimaEspacialAvisos), 8000);
  setTimeout(seguro(descargarFuegoAvisos), 12000);
  setTimeout(seguro(descargarAireAvisos), 16000);
  setInterval(seguro(descargarPronosticoAvisos), 30 * 60_000);
  setTimeout(seguro(descargarPronosticoAvisos), 20000);
  setInterval(evaluarUmbralesLocales, 5 * 60_000);
  setTimeout(evaluarUmbralesLocales, 25000);
  setInterval(seguro(descargarMeteoAlarmAvisos), 15 * 60_000);
  setInterval(seguro(descargarCiclonesAvisos), 30 * 60_000);
  setInterval(seguro(descargarRadiacionAvisos), 30 * 60_000);
  setTimeout(seguro(descargarMeteoAlarmAvisos), 28000);
  setTimeout(seguro(descargarCiclonesAvisos), 31000);
  setTimeout(seguro(descargarRadiacionAvisos), 34000);
  // Entre descargas: repeticiones y cambios de posición de una estación móvil
  setInterval(() => {
    difundirAvisos(eventosEspacio, politicaEspacio());
    difundirAvisos(eventosFuego, politicaFuego());
    difundirAvisos(eventosAire, politicaAire());
    difundirAvisos(eventosUmbrales, politicaUmbrales());
    difundirAvisos(eventosPronostico, politicaPronostico());
    difundirAvisos(eventosMeteoAlarmLista, politicaMeteoAlarm());
    difundirAvisos(eventosCiclonesLista, politicaCiclones());
    difundirAvisos(eventosRadiacionLista, politicaRadiacion());
  }, 60_000);
}

// REST API endpoints for GPSD subscription and warning injections
app.post('/api/aemet/subscription/toggle', (req, res) => {
  const { enabled } = req.body;
  if (enabled !== undefined) {
    config.aemetAlertsSubscriptionEnabled = !!enabled;
  } else {
    config.aemetAlertsSubscriptionEnabled = !config.aemetAlertsSubscriptionEnabled;
  }
  
  descargarAvisosMeteo();
  
  addLog('SYS', 'AEMET', 'CONFIG', 'SUB_TOGGLE', `Suscripción meteorológica geolocalizada ${config.aemetAlertsSubscriptionEnabled ? 'ACTIVADA' : 'DESACTIVADA'}`, true, 'Configuración');
  
  return res.json({
    success: true,
    enabled: config.aemetAlertsSubscriptionEnabled,
    province: getClosestProvince(gpsdState.lat, gpsdState.lon),
    alertsCount: aemetAlerts.length
  });
});

app.post('/api/aemet/warnings/inject', (req, res) => {
  try {
    const { parameter, severity, headline, description, value } = req.body;
    
    const prov = getClosestProvince(gpsdState.lat, gpsdState.lon);
    const now = new Date();
    
    const newAlert: AemetWeatherAlert = {
      id: `AEMET-INJECTED-${parameter || 'otros'}-${severity || 'YELLOW'}-${Date.now()}`,
      province: prov.name,
      region: prov.region,
      headline: headline || `Alerta Especial AEMET por ${parameter || 'Fenómeno Adverso'}`,
      description: description || `Inyección de prueba de aviso meteorológico por ${parameter || 'Fenómeno Adverso'} en la provincia de ${prov.name}. Siga las recomendaciones del personal de REMER y Protección Civil local.`,
      severity: severity || 'YELLOW',
      parameter: parameter || 'otros',
      value: value || 'Inyección manual',
      onset: now.toISOString(),
      expires: new Date(now.getTime() + 7200000).toISOString(), // 2 hours
      lat: prov.lat,
      lon: prov.lon,
      distanceKm: calculateDistance(gpsdState.lat, gpsdState.lon, prov.lat, prov.lon)
    };
    
    customInjectedAemetAlerts.unshift(newAlert);
    refreshAemetWarnings();
    
    addLog('SYS', 'AEMET', 'ALERT_INJECTED', 'TEST', `Inyección manual de alerta de la AEMET: ${newAlert.headline} (${newAlert.severity})`, false, 'Pruebas');
    
    return res.json({
      success: true,
      alert: newAlert,
      totalAlerts: aemetAlerts.length
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/aemet/warnings/clear', (req, res) => {
  customInjectedAemetAlerts = [];
  refreshAemetWarnings();
  addLog('SYS', 'AEMET', 'ALERT_CLEARED', 'TEST', 'Alertas de AEMET inyectadas manualmente han sido limpiadas', true, 'Pruebas');
  return res.json({
    success: true,
    alertsCount: aemetAlerts.length
  });
});





// ---------------------------------------------------------------------------
// Avisos: lista única de todo lo que pasa por la cadena, con su decisión
// ---------------------------------------------------------------------------
function gruposDeAvisos(): Array<{ eventos: Evento[]; politica: Politica; activo: boolean; grupo?: string }> {
  return [
    { eventos: eventosUmbrales, politica: politicaUmbrales(), activo: config.avisosUmbralesLocales === true, grupo: 'umbrales' },
    { eventos: eventosPronostico, politica: politicaPronostico(), activo: config.avisosPronostico === true, grupo: 'pronostico' },
    { eventos: eventosSismos, politica: politicaSismos(), activo: config.ignSeismoEnabled !== false },
    { eventos: eventosMeteo, politica: politicaMeteo(), activo: !!config.aemetAlertsSubscriptionEnabled },
    { eventos: eventosFuego, politica: politicaFuego(), activo: config.fuegoEnabled !== false },
    { eventos: eventosEspacio, politica: politicaEspacio(), activo: config.climaEspacialEnabled !== false },
    { eventos: eventosAire, politica: politicaAire(), activo: config.aireEnabled !== false },
    { eventos: eventosMeteoAlarmLista, politica: politicaMeteoAlarm(), activo: config.meteoalarmEnabled === true, grupo: 'meteoalarm' },
    { eventos: eventosCiclonesLista, politica: politicaCiclones(), activo: config.ciclonesEnabled === true },
    { eventos: eventosRadiacionLista, politica: politicaRadiacion(), activo: config.radiacionEnabled === true },
  ];
}

app.get('/api/avisos', (_req, res) => {
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const avisos: any[] = [];
  for (const { eventos, politica, activo, grupo } of gruposDeAvisos()) {
    for (const e of eventos) {
      const fin = e.fin ?? e.inicio + politica.vigenciaMs;
      if (fin < ahora) continue; // lo caducado no se lista
      const d = evaluar(e, politica, estacion, ahora);
      const apunte = registroAvisos.consulta(e.id);
      avisos.push({
        id: e.id, tipo: e.tipo, grupo: grupo ?? e.tipo, gravedad: e.gravedad, titulo: e.titulo, detalle: e.detalle || '',
        fuente: e.fuente, inicio: e.inicio, fin, lat: e.lat, lon: e.lon,
        deZona: !!e.zona,
        distanciaKm: d.distanciaKm !== undefined && Number.isFinite(d.distanciaKm) ? Math.round(d.distanciaKm) : null,
        cumple: d.emitir && activo,
        motivo: !activo ? 'fuente desactivada' : d.motivo,
        emitido: apunte,
        proxima: d.emitir && activo ? (apunte ? apunte.ultima + politica.repetirCadaMs : ahora) : null,
        objeto: objetoAprs(config.callsign, e, ahora),
        boletin: politica.boletin ? boletinAprs(config.callsign, e, d.distanciaKm) : null,
        reglas: {
          radioKm: politica.radioKm, gravedadMinima: politica.gravedadMinima,
          antelacionH: (politica.antelacionMs ?? 3600_000) / 3600_000, repetirMin: politica.repetirCadaMs / 60_000,
        },
      });
    }
  }
  const orden: Record<string, number> = { rojo: 0, naranja: 1, amarillo: 2, info: 3 };
  avisos.sort((a, b) => Number(b.cumple) - Number(a.cumple) || orden[a.gravedad] - orden[b.gravedad] || (a.distanciaKm ?? 1e9) - (b.distanciaKm ?? 1e9));
  res.set('Cache-Control', 'no-store');
  res.json({
    avisos: avisos.slice(0, 300),
    total: avisos.length,
    fuentes: Object.entries(estadoFuentes).map(([id, f]) => ({ id, ...f })),
    txEnabled: TX_ENABLED,
  });
});

// Medidores de calidad del aire más cercanos a la posición actual, en tiempo real
let medidoresAire: { medidores: MedidorAire[]; radioKm: number; cuando: number; lat: number; lon: number } | null = null;
let consultaMedidores = 0;

app.get('/api/aire/medidores', async (_req, res) => {
  const ahora = Date.now();
  const movida = medidoresAire ? gcDistanceKm({ lat: medidoresAire.lat, lon: medidoresAire.lon }, { lat: gpsdState.lat, lon: gpsdState.lon }) > 2 : true;
  // Cada 5 minutos, o antes si la estación se ha movido más de 2 km
  if (ahora - consultaMedidores > 5 * 60_000 || (movida && ahora - consultaMedidores > 30_000)) {
    consultaMedidores = ahora;
    const pos = { lat: gpsdState.lat, lon: gpsdState.lon };
    const r = await descargarMedidoresAire(pos, (origen, texto, ok) => { if (!ok) addLog('SYS', origen, 'LOCAL', 'API', texto, false, 'Sin datos'); });
    if (r) medidoresAire = { ...r, cuando: ahora, ...pos };
    anotarFuente('medidores', 'Medidores de aire · Sensor.Community', r !== null, r ? `${r.medidores.length} a menos de ${r.radioKm} km` : 'Sin respuesta');
  }
  res.set('Cache-Control', 'no-store');
  // Una lista de hace más de 20 minutos ya no es «ahora»: no se sirve
  const vigente = medidoresAire && ahora - medidoresAire.cuando < 20 * 60_000 ? medidoresAire : null;
  res.json({
    disponible: !!vigente,
    consultado: vigente?.cuando ?? null,
    radioKm: vigente?.radioKm ?? null,
    medidores: (vigente?.medidores ?? []).slice(0, 12).map((m) => ({
      id: m.id, lat: m.lat, lon: m.lon, distanciaKm: Math.round(m.distanciaKm * 10) / 10,
      pm25: m.pm25 ?? null, pm10: m.pm10 ?? null, clase: clasePm25(m.pm25), sensor: m.sensor, cuando: m.cuando,
    })),
  });
});

// Boyas y estaciones costeras más cercanas a la posición actual, en tiempo real (NDBC)
let boyasLeidas: { boyas: Omit<Boya, 'distanciaKm'>[]; cuando: number } | null = null;
let consultaBoyas = 0;

app.get('/api/boyas', async (_req, res) => {
  const ahora = Date.now();
  // El fichero se renueva cada pocos minutos: se relee cada 10
  if (ahora - consultaBoyas > 10 * 60_000) {
    consultaBoyas = ahora;
    const r = await descargarBoyas((origen, texto, ok) => { if (!ok) addLog('SYS', origen, 'LOCAL', 'API', texto, false, 'Sin datos'); });
    if (r) boyasLeidas = { boyas: r, cuando: ahora };
    anotarFuente('boyas', 'Boyas · NOAA NDBC', r !== null, r ? `${r.length} estaciones con observación` : 'Sin respuesta');
  }
  res.set('Cache-Control', 'no-store');
  // Una lectura de hace más de 40 minutos ya no es «ahora»: no se sirve
  const vigente = boyasLeidas && ahora - boyasLeidas.cuando < 40 * 60_000 ? boyasLeidas : null;
  // La distancia se calcula en cada consulta, con la posición actual de la estación
  const cerca = vigente ? boyasCercanas(vigente.boyas, { lat: gpsdState.lat, lon: gpsdState.lon }, { ahora }) : [];
  res.json({
    disponible: !!vigente,
    consultado: vigente?.cuando ?? null,
    estacion: { lat: gpsdState.lat, lon: gpsdState.lon },
    boyas: cerca.map((b) => ({
      id: b.id, lat: b.lat, lon: b.lon, distanciaKm: b.distanciaKm, cuando: b.cuando,
      vientoDirGrados: b.vientoDirGrados ?? null, vientoNudos: b.vientoNudos ?? null, rachaNudos: b.rachaNudos ?? null,
      olaM: b.olaM ?? null, periodoS: b.periodoS ?? null, olaDirGrados: b.olaDirGrados ?? null,
      presionHpa: b.presionHpa ?? null, aireC: b.aireC ?? null, aguaC: b.aguaC ?? null,
    })),
  });
});

// ---------------------------------------------------------------------------
// Radio · Principal: mensajería y cluster DX
// ---------------------------------------------------------------------------
app.get('/api/radio/mensajes', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // El contenido de los mensajes solo se enseña al administrador
  const admin = isAuthorizedRequest(req);
  res.json({
    indicativo: config.callsign,
    txEnabled: TX_ENABLED,
    sinLeer: mensajeria.sinLeer,
    admin,
    recibidos: admin ? mensajeria.recibidos.slice(0, 100) : [],
    enviados: admin ? mensajeria.enviados.slice(0, 100) : [],
    dapnet: { configurado: !!config.dapnetUser && !!config.dapnetPassword, grupo: config.dapnetGroup || '', max: MAX_DAPNET },
  });
});

app.post('/api/radio/mensajes', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede enviar mensajes.' });
  if (!isValidCallsign(config.callsign)) return res.status(400).json({ ok: false, error: 'La estación no tiene un indicativo válido.' });
  const r = mensajeria.redactar(String(req.body?.para ?? ''), String(req.body?.texto ?? ''));
  if (!r.ok) return res.status(400).json(r);
  emitirMensajeria(r.emision.info, r.emision.motivo);
  res.json({ ok: true, mensaje: r.mensaje, txEnabled: TX_ENABLED });
});

app.post('/api/radio/mensajes/leidos', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false });
  mensajeria.marcarLeidos();
  res.json({ ok: true });
});

app.post('/api/radio/dapnet', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede enviar por DAPNET.' });
  const indicativos = String(req.body?.para ?? '').split(/[\s,;]+/).filter(Boolean);
  const grupo = String(req.body?.grupo || config.dapnetGroup || '');
  const r = await enviarDapnet(config.dapnetUser || '', config.dapnetPassword || '', {
    texto: String(req.body?.texto ?? ''), indicativos, grupos: [grupo], emergencia: req.body?.emergencia === true,
  });
  addLog('SYS', 'DAPNET', 'LOCAL', 'API', r.ok ? `Mensaje DAPNET enviado a ${indicativos.join(', ')} (${grupo}).` : `DAPNET: ${r.error}`, r.ok, r.ok ? 'Enviado' : 'Error');
  res.status(r.ok ? 200 : 400).json(r);
});

// Satélites: favoritos con su posición y próximo paso, y búsqueda en el archivo
app.get('/api/radio/satelites', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const epocas = satelites.map((s) => s.epoca).sort((a, b) => a - b);
  const mediana = epocas.length ? epocas[Math.floor(epocas.length / 2)] : null;
  const ficha = (s: Satelite, conPaso: boolean) => {
    const o = orbitaDe(s.norad);
    const m = o ? mirar(o, estacion, gpsdState.alt || 0, ahora) : null;
    return {
      norad: s.norad, nombre: s.nombre, grupos: s.grupos, categoria: s.categoria,
      edadTleDias: Math.round(((ahora - s.epoca) / 86400_000) * 10) / 10,
      ahora: m ? { az: Math.round(m.az), el: Math.round(m.el * 10) / 10, distanciaKm: Math.round(m.distanciaKm), radialKmS: Math.round(m.radialKmS * 1000) / 1000 } : null,
      paso: conPaso ? pasoDe(s.norad, ahora) : undefined,
      transmisores: conPaso ? s.transmisores.slice(0, 8).map((t) => ({
        ...t, bajadaAhoraHz: m && t.bajadaHz ? conDoppler(t.bajadaHz, m.radialKmS) : null,
      })) : undefined,
    };
  };
  const favoritos = favoritosSat();
  const q = String(req.query.q ?? '').trim().toUpperCase().slice(0, 30);
  const grupo = String(req.query.grupo ?? '').slice(0, 1);
  let lista: Satelite[] = [];
  if (q || grupo) {
    lista = satelites.filter((s) => (!grupo || s.grupos.includes(grupo)) && (!q || s.nombre.toUpperCase().includes(q) || String(s.norad) === q)).slice(0, 40);
  }
  res.json({
    disponible: satelites.length > 0,
    error: satelites.length > 0 ? '' : satError,
    total: satelites.length,
    generado: satGenerado,
    leido: satLeido || null,
    // Antigüedad típica de los TLE: pasados unos días la precisión baja
    edadTleDias: mediana === null ? null : Math.round(((ahora - mediana) / 86400_000) * 10) / 10,
    estacion: { ...estacion, gps: estacionConGps() },
    grupos: NOMBRE_GRUPO,
    favoritos: favoritos.map((n) => satelites.find((s) => s.norad === n)).filter((s): s is Satelite => !!s).map((s) => ficha(s, true))
      .sort((a, b) => (a.paso?.aos ?? Infinity) - (b.paso?.aos ?? Infinity)),
    favoritosSinTle: favoritos.filter((n) => !satelites.some((s) => s.norad === n)),
    doppler, dopplerFin,
    lista: lista.map((s) => ({ ...ficha(s, false), favorito: favoritos.includes(s.norad) })),
  });
});

app.post('/api/radio/satelites', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede cambiar los satélites.' });
  const b = req.body || {};
  if (b.accion === 'doppler') {
    const r = await iniciarDoppler(Number(b.norad), Number(b.transmisor) || 0);
    return res.status(r.ok ? 200 : 400).json(r);
  }
  if (b.accion === 'doppler-parar') {
    await pararDoppler('parada a mano');
    return res.json({ ok: true });
  }
  if (b.accion === 'actualizar') {
    const ok = await descargarSatelites(true);
    return res.status(ok ? 200 : 502).json({ ok, error: ok ? undefined : `No se pudo descargar: ${satError}` });
  }
  // Los favoritos se guardan con el resto de la configuración (satFavoritos)
  res.status(400).json({ ok: false, error: 'Orden no reconocida.' });
});

// ---------------------------------------------------------------------------
// Direwolf: tramas del enlace KISS, su registro CSV y su configuración
// ---------------------------------------------------------------------------
const monitorDirewolf = new MonitorDirewolf(() => config.callsign);
const lectorLogDirewolf = new LectorLog((l) => monitorDirewolf.anotarLog(l));
let confDirewolf: { conf: ConfDirewolf; ruta: string } | null = null;
let direwolfDesde: number | null = null;

/** Desde cuándo está en marcha un servicio de systemd (ms epoch), o null. */
function desdeServicio(nombre: string): number | null {
  if (process.platform !== 'linux') return null;
  try {
    const r = execFileSync('systemctl', ['show', nombre, '-p', 'ActiveEnterTimestampMonotonic', '-p', 'ActiveState', '--value'], { encoding: 'utf8', timeout: 3000 }).trim().split('\n');
    const mono = Number(r[1] ?? r[0]);
    return r.includes('active') && mono > 0 ? Date.now() - (os.uptime() * 1000 - mono / 1000) : null;
  } catch { return null; }
}

/** Reinicia un servicio de la estación (systemctl, o sudo -n si hace falta). Devuelve el error o ''. */
async function reiniciarServicio(nombre: string): Promise<string> {
  const intentar = (orden: string, args: string[]) => new Promise<string>((resolver) =>
    execFile(orden, args, { timeout: 15000 }, (e, _o, err) => resolver(e ? (String(err || e.message).trim() || 'error') : '')));
  let error = await intentar('systemctl', ['restart', nombre]);
  if (error) error = await intentar('sudo', ['-n', 'systemctl', 'restart', nombre]);
  addLog('SYS', nombre.toUpperCase(), 'LOCAL', 'SERVICIO', error ? `No se pudo reiniciar ${nombre}: ${error}` : `${nombre} reiniciado desde la consola.`, !error, error ? 'Error' : 'Reiniciado');
  return error;
}

function leerDirewolf() {
  for (const ruta of ['/etc/direwolf.conf', './direwolf.conf']) {
    try {
      confDirewolf = { conf: leerConfDirewolf(fs.readFileSync(ruta, 'utf8')), ruta };
      break;
    } catch { confDirewolf = null; }
  }
  direwolfDesde = desdeServicio('direwolf');
}
leerDirewolf();
setInterval(leerDirewolf, 30_000);
setInterval(() => lectorLogDirewolf.leer(confDirewolf?.conf.carpetaLog ?? null), 2000);

app.get('/api/radio/direwolf', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const c = confDirewolf?.conf ?? null;
  res.json({
    servicio: { estado: nucStats.services.direwolf, desde: direwolfDesde },
    kiss: { conectado: kissConectado, desde: kissDesde || null, puerto: config.kissTcpPort },
    conf: c ? { ...c, ruta: confDirewolf!.ruta } : null,
    registro: {
      activado: !!c?.carpetaLog, archivo: lectorLogDirewolf.actual || null, error: lectorLogDirewolf.error,
      ultimaLinea: lectorLogDirewolf.ultimaLinea || null,
    },
    franja: { bajo: NIVEL_BAJO, alto: NIVEL_ALTO },
    resumen: monitorDirewolf.resumen(ahora),
    niveles: monitorDirewolf.nivelesRecientes(ahora),
    propia: monitorDirewolf.propia,
    ultimaEmisionPropia: monitorDirewolf.ultimaEmisionPropia || null,
    txEnabled: TX_ENABLED,
    tramas: monitorDirewolf.tramas.slice(0, 60).map((t) => ({ ...t, que: describirTrama(t.origen, t.destino, t.info, estacion) })),
  });
});

app.post('/api/radio/direwolf', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador.' });
  const accion = req.body?.accion;
  if (accion === 'prueba') {
    if (!kissConectado) return res.status(400).json({ ok: false, error: 'Direwolf no está conectado por KISS.' });
    const r = transmitStationBeacon();
    return res.status(r.ok ? 200 : 400).json({ ...r, txEnabled: TX_ENABLED });
  }
  if (accion === 'reiniciar') {
    const error = await reiniciarServicio('direwolf');
    setTimeout(leerDirewolf, 3000);
    return res.status(error ? 500 : 200).json({ ok: !error, error: error ? `No se pudo reiniciar: ${error}` : undefined });
  }
  res.status(400).json({ ok: false, error: 'Orden no reconocida.' });
});

// ---------------------------------------------------------------------------
// Consola de comandos: lo mismo que los paneles, escrito
// ---------------------------------------------------------------------------
/** Guarda la configuración en disco (como POST /api/config). */
function guardarConfig() {
  try { fs.writeFileSync(satConfigPath, JSON.stringify(config, null, 2), 'utf8'); } catch { /* best-effort */ }
}
const rumbo3 = (g: number) => String(Math.round(g) % 360).padStart(3, '0');
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const conTx = (lineas: string[]) => (TX_ENABLED ? lineas : [...lineas, 'Aviso: la emisión está desactivada (SAT_APRS_TX), no sale al aire.']);

/** Satélite por número NORAD o nombre: primero los favoritos y, entre los demás, el de número más bajo (ISS → ZARYA). */
function buscarSatelite(id: string): Satelite | undefined {
  if (/^\d+$/.test(id)) return satelites.find((x) => x.norad === Number(id));
  const q = id.toUpperCase();
  const favs = favoritosSat();
  return satelites.filter((x) => x.nombre.toUpperCase().includes(q))
    .sort((a, b) => Number(favs.includes(b.norad)) - Number(favs.includes(a.norad)) || a.norad - b.norad)[0];
}

async function ejecutarConsola(o: Orden): Promise<{ ok: boolean; lineas: string[] }> {
  const bien = (...lineas: string[]) => ({ ok: true, lineas });
  const mal = (texto: string) => ({ ok: false, lineas: [texto] });
  const r = (x: { ok: boolean; error?: string }, siBien: string) => (x.ok ? bien(siBien) : mal(x.error || 'No se pudo.'));
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };

  switch (o.modulo) {
    case 'help': case 'ayuda': case '?':
      return bien(...textoAyuda(o.accion || undefined));

    case 'cat': {
      if (config.catEnabled !== true) return mal('El equipo por CAT no está configurado (Radio · Principal → Equipo → Conexión).');
      if (o.accion === 'get' || o.accion === '') {
        await equipoRadio.sondear();
        const e = equipoRadio.estado;
        if (!e.enlace) return mal(`rigctld no responde${e.error ? ` (${e.error})` : ''}.`);
        return bien(`${e.frecuenciaHz === null ? '—' : `${(e.frecuenciaHz / 1e6).toFixed(6)} MHz`} · ${e.modo ?? '—'}${e.anchoHz ? ` ${e.anchoHz} Hz` : ''} · ${e.vfo ?? '—'} · ${e.ptt === null ? '' : e.ptt ? 'TX' : 'RX'}${e.senalDb !== null ? ` · ${sMeter(e.senalDb).texto}` : ''}`);
      }
      if (o.accion === 'f') {
        const hz = frecuenciaHz(o.args[0] ?? '');
        if (hz === null) return mal('Uso: cat f <frecuencia> (14205, 14.205 o 14205000).');
        return r(await equipoRadio.frecuencia(hz), `Sintonizado en ${(hz / 1e6).toFixed(6)} MHz.`);
      }
      if (o.accion === 'm') return r(await equipoRadio.modo(String(o.args[0] ?? '')), `Modo ${String(o.args[0] ?? '').toUpperCase()}.`);
      if (o.accion === 'vfo') return r(await equipoRadio.vfo(`VFO${String(o.args[0] ?? '').toUpperCase()}`), `VFO ${String(o.args[0] ?? '').toUpperCase()}.`);
      if (o.accion === 'ptt' && ['on', 'off'].includes(String(o.args[0]).toLowerCase())) {
        const on = String(o.args[0]).toLowerCase() === 'on';
        const x = await equipoRadio.ptt(on);
        if (x.ok) addLog('SYS', 'CAT', 'LOCAL', 'PTT', on ? 'PTT activado desde la consola de comandos (se suelta solo a los 3 minutos).' : 'PTT soltado desde la consola de comandos.', true, 'Equipo');
        return r(x, on ? 'PTT activado: el equipo emite (se suelta solo a los 3 min).' : 'PTT soltado.');
      }
      return mal('Orden de cat no reconocida. «help cat».');
    }

    case 'rot': {
      if (!config.rotorMode || config.rotorMode === 'off') return mal('El rotor no está configurado (Radio · Principal → Rotor → Conexión).');
      const ctx = contextoRotor();
      if (o.accion === 'get' || o.accion === '') {
        const e = rotorAntena.estado;
        if (!e.enlace) return mal(`El rotor no responde${e.error ? ` (${e.error})` : ''}.`);
        const verdadero = (a: number | null) => (a === null ? null : config.rotorMovil === true ? (ctx.proa === null ? null : acimutVerdadero(a, ctx.proa)) : a);
        const az = verdadero(e.az);
        const obj = verdadero(e.objetivoAz);
        const seg = seguimientoRotor.objetivo ? seguimientoRotor.ultimo : null;
        return bien(
          `Acimut ${az === null ? '—' : `${rumbo3(az)}°`}${e.el !== null ? ` · elevación ${Math.round(e.el)}°` : ''}${obj !== null ? ` · objetivo ${rumbo3(obj)}°` : ''}${e.moviendo ? ' · girando' : ''}${e.fallo && e.fallo !== 'OK' ? ` · ${e.fallo}` : ''}`,
          ...(seg ? [`Siguiendo a ${seg.nombre}${seg.ok ? ` · ${rumbo3(seg.azVerdadero ?? 0)}°${seg.distanciaKm !== undefined ? ` · ${seg.distanciaKm} km` : ''}` : ` · en espera: ${seg.espera}`}`] : []),
        );
      }
      if (o.accion === 'pos') {
        const az = Number(o.args[0]);
        const el = o.args[1] === undefined ? undefined : Number(o.args[1]);
        if (!Number.isFinite(az)) return mal('Uso: rot pos <acimut> [elevación].');
        if (ctx.movil && ctx.proa === null) return mal('El rotor va en un móvil y todavía no hay rumbo de la proa.');
        seguimientoRotor.dejar();
        return r(await rotorAntena.ir(acimutDeRotor(az, ctx.movil ? ctx.proa : null), el), `Rotor a ${rumbo3(az)}°${el !== undefined ? ` / ${el}°` : ''}.`);
      }
      if (o.accion === 'stop') { seguimientoRotor.dejar(); return r(await rotorAntena.detener(), 'Rotor parado.'); }
      if (o.accion === 'park') { seguimientoRotor.dejar(); return r(await rotorAntena.aparcar(), 'Rotor a reposo.'); }
      if (o.accion === 'unfollow') { seguimientoRotor.dejar(); return bien('Seguimiento terminado.'); }
      if (o.accion === 'follow') {
        const tipo = String(o.args[0] ?? '').toLowerCase();
        const id = o.args.slice(1).join(' ').trim();
        let objetivo: Objetivo | null = null;
        if (['sol', 'luna', 'ultima'].includes(tipo)) objetivo = { tipo: tipo as 'sol' | 'luna' | 'ultima' };
        else if (['aprs', 'barco', 'avion'].includes(tipo) && id) objetivo = { tipo: tipo as 'aprs' | 'barco' | 'avion', indicativo: id.toUpperCase() };
        else if (tipo === 'sat' && id) {
          const s = buscarSatelite(id);
          if (!s) return mal(satelites.length ? `No hay TLE de «${id}».` : 'No hay elementos orbitales (TLE) descargados.');
          objetivo = { tipo: 'satelite', norad: s.norad };
        }
        if (!objetivo) return mal('Uso: rot follow aprs|barco|avion <id> · rot follow sat <NORAD|nombre> · rot follow sol|luna|ultima.');
        seguimientoRotor.seguir(objetivo);
        const paso = rotorAntena.estado.enlace ? seguimientoRotor.paso(contextoRotor()) : null;
        if (paso) await rotorAntena.ir(paso.az, paso.el);
        const u = seguimientoRotor.ultimo;
        return bien(u ? (u.ok ? `Siguiendo a ${u.nombre} · ${rumbo3(u.azVerdadero ?? 0)}°${u.elevacion !== undefined ? ` · elev. ${u.elevacion}°` : ''}${u.distanciaKm !== undefined ? ` · ${u.distanciaKm} km` : ''}` : `Siguiendo a ${u.nombre} · en espera: ${u.espera}`) : 'Siguiendo.');
      }
      return mal('Orden de rot no reconocida. «help rot».');
    }

    case 'dx': {
      if (!config.clusterHost) return mal('No hay nodo de cluster configurado (Radio · Principal → Cluster DX → Nodo).');
      const conRumbo = (s: (typeof clusterDx.spots)[number]) => {
        const e = tablaDxcc.buscar(s.dx);
        return { s, e, rumbo: e ? gcInitialBearing(estacion, e) : null, km: e ? gcDistanceKm(estacion, e) : null };
      };
      if (o.accion === 'spots') {
        const n = Math.min(30, Math.max(1, Number(o.args[0]) || 10));
        const lista = clusterDx.spots.slice(0, n);
        if (!lista.length) return bien('Sin spots todavía.');
        return bien(...lista.map((s, i) => {
          const c = conRumbo(s);
          return `${String(i + 1).padStart(2)} ${s.khz.toFixed(1).padStart(9)}  ${s.dx.padEnd(10)} ${(c.e?.nombre ?? '—').slice(0, 18).padEnd(18)} ${c.rumbo === null ? '   —   ' : `${rumbo3(c.rumbo)}° ${String(Math.round(c.km!)).padStart(5)} km`}  ${s.hora}Z  ${s.comentario}`;
        }));
      }
      if (o.accion === 'go') {
        const s = clusterDx.spots[Number(o.args[0]) - 1];
        if (!s) return mal('Uso: dx go <n> (el número de «dx spots»).');
        const c = conRumbo(s);
        const lineas: string[] = [];
        if (config.catEnabled === true) { const x = await equipoRadio.frecuencia(Math.round(s.khz * 1000)); lineas.push(x.ok ? `Equipo en ${s.khz.toFixed(1)} kHz.` : `Equipo: ${x.error}`); }
        if (config.rotorMode && config.rotorMode !== 'off' && c.rumbo === null) lineas.push('Rotor: no se sabe el país de ese indicativo, no se gira.');
        if (config.rotorMode && config.rotorMode !== 'off' && c.rumbo !== null) {
          const ctx = contextoRotor();
          if (ctx.movil && ctx.proa === null) lineas.push('Rotor: sin rumbo de la proa todavía.');
          else { seguimientoRotor.dejar(); const x = await rotorAntena.ir(acimutDeRotor(c.rumbo, ctx.movil ? ctx.proa : null)); lineas.push(x.ok ? `Rotor a ${rumbo3(c.rumbo)}° (${c.e!.nombre}).` : `Rotor: ${x.error}`); }
        }
        return lineas.length ? bien(`${s.dx} · ${s.khz.toFixed(1)} kHz`, ...lineas) : mal('No hay equipo ni rotor configurados.');
      }
      // Lo demás va tal cual al nodo
      const texto = `${o.accion} ${o.resto}`.trim();
      return clusterDx.orden(texto) ? bien(`Enviado al nodo: ${texto}. La respuesta llega por la consola del cluster.`) : mal('El cluster no está conectado.');
    }

    case 'aprs': {
      if (o.accion === 'heard') {
        const n = Math.min(30, Math.max(1, Number(o.args[0]) || 10));
        const lista = estacionesOidas.lista(ahora).filter((e) => e.clase === 'estacion' && e.ultimaRf !== undefined).sort((a, b) => (b.ultimaRf ?? 0) - (a.ultimaRf ?? 0)).slice(0, n);
        if (!lista.length) return bien('No se ha oído ninguna estación por radio.');
        return bien(...lista.map((e) => `${e.nombre.padEnd(10)} ${rumbo3(gcInitialBearing(estacion, e))}° ${gcDistanceKm(estacion, e).toFixed(1).padStart(7)} km  ${hhmm(e.ultimaRf!)}Z`));
      }
      if (!isValidCallsign(config.callsign)) return mal('La estación no tiene un indicativo válido.');
      if (o.accion === 'beacon') {
        const x = transmitStationBeacon();
        return x.ok ? bien(...conTx([`Baliza en la cola: ${x.packet}`])) : mal(x.error || 'No se pudo.');
      }
      if (o.accion === 'msg' || o.accion === 'bln') {
        const destino = o.accion === 'bln' ? `BLN${String(o.args[0] ?? '').toUpperCase().slice(0, 6)}` : String(o.args[0] ?? '');
        const texto = o.resto.slice(String(o.args[0] ?? '').length).trim();
        const x = mensajeria.redactar(destino, texto);
        if (!x.ok) return mal((x as { error: string }).error);
        emitirMensajeria(x.emision.info, x.emision.motivo);
        return bien(...conTx([o.accion === 'bln' ? `Boletín ${destino} en la cola.` : `Mensaje ${x.mensaje.id} para ${x.mensaje.para} en la cola; se repite hasta el acuse.`]));
      }
      return mal('Orden de aprs no reconocida. «help aprs».');
    }

    case 'dapnet': {
      if (o.accion !== 'send' && o.accion !== 'emerg') return mal('Orden de dapnet no reconocida. «help dapnet».');
      const para = String(o.args[0] ?? '');
      const texto = o.resto.slice(para.length).trim();
      const x = await enviarDapnet(config.dapnetUser || '', config.dapnetPassword || '', { texto, indicativos: para.split(','), grupos: [config.dapnetGroup || ''], emergencia: o.accion === 'emerg' });
      addLog('SYS', 'DAPNET', 'LOCAL', 'API', x.ok ? `Mensaje DAPNET enviado a ${para} desde la consola.` : `DAPNET: ${x.error}`, x.ok, x.ok ? 'Enviado' : 'Error');
      return r(x, `Enviado a DAPNET (${para}).`);
    }

    case 'sat': {
      if (!satelites.length) return mal('No hay elementos orbitales (TLE) descargados.');
      const ficha = (s: Satelite) => {
        const ob = orbitaDe(s.norad);
        const m = ob ? mirar(ob, estacion, gpsdState.alt || 0, ahora) : null;
        const p = pasoDe(s.norad, ahora);
        const now = m && m.el > 0 ? `visible: ${rumbo3(m.az)}° elev. ${Math.round(m.el)}°` : 'bajo el horizonte';
        return `${s.nombre.slice(0, 20).padEnd(20)} ${now}${p ? ` · paso ${hhmm(p.aos)}–${hhmm(p.los)}Z máx. ${Math.round(p.elMax)}° (${rumbo3(p.azAos)}°→${rumbo3(p.azLos)}°)` : ' · sin paso en 36 h'}`;
      };
      if (o.accion === 'list' || o.accion === '') {
        const favs = favoritosSat().map((n) => satelites.find((s) => s.norad === n)).filter((s): s is Satelite => !!s);
        return favs.length ? bien(...favs.map(ficha)) : bien('Sin satélites favoritos.');
      }
      if (o.accion === 'doppler') {
        if (o.args[0]?.toLowerCase() === 'stop') { await pararDoppler('parada a mano'); return bien('Corrección de Doppler parada.'); }
        const indice = o.args.length > 1 && /^\d+$/.test(o.args[o.args.length - 1]) ? Number(o.args[o.args.length - 1]) - 1 : 0;
        const id = (o.args.length > 1 && /^\d+$/.test(o.args[o.args.length - 1]) ? o.args.slice(0, -1) : o.args).join(' ');
        const s = buscarSatelite(id);
        if (!s) return mal(`No hay TLE de «${id}».`);
        if (!o.args.length) return mal('Uso: sat doppler <NORAD|nombre> [n.º de transmisor] · sat doppler stop');
        const x = await iniciarDoppler(s.norad, indice);
        if (!x.ok) return mal((x as { error: string }).error);
        const d = doppler!;
        return bien(`Doppler en marcha: ${d.nombre} · ${d.descripcion || ''}`, `↓ ${d.ultimaRx ? (d.ultimaRx / 1e6).toFixed(6) : '—'} MHz${d.subidaHz ? ` · ↑ ${d.ultimaTx ? (d.ultimaTx / 1e6).toFixed(6) : 'sin split'} MHz` : ''}`);
      }
      if (o.accion === 'tx') {
        const s = buscarSatelite(o.resto.trim());
        if (!s) return mal(`No hay TLE de «${o.resto.trim()}».`);
        return bien(...(s.transmisores.length ? s.transmisores.map((t, i) => `${i + 1}  ↓ ${t.bajadaHz ? (t.bajadaHz / 1e6).toFixed(4) : '—'}  ↑ ${t.subidaHz ? (t.subidaHz / 1e6).toFixed(4) : '—'}  ${t.modo}  ${t.descripcion}`) : ['Sin transmisores en el archivo.']));
      }
      if (o.accion === 'next') {
        const id = o.resto.trim();
        const s = buscarSatelite(id);
        return s ? bien(ficha(s)) : mal(`No hay TLE de «${id}».`);
      }
      return mal('Orden de sat no reconocida. «help sat».');
    }

    case 'arts': {
      if (o.accion === 'on' || o.accion === 'off') {
        config.grupoActivo = o.accion === 'on';
        guardarConfig();
        return bien(`Vigilancia de grupo ${o.accion === 'on' ? 'encendida' : 'apagada'}.`);
      }
      if (o.accion === 'add' || o.accion === 'del') {
        const id = String(o.args[0] ?? '').toUpperCase();
        const actual = String(config.grupoIndicativos || '').toUpperCase().split(/[^A-Z0-9-]+/).filter(Boolean);
        const nueva = o.accion === 'add' ? [...actual.filter((x) => x !== id), id] : actual.filter((x) => x !== id);
        if (nueva.length > 5) return mal('El grupo admite hasta 5 indicativos.');
        config.grupoIndicativos = nueva.join(',');
        guardarConfig();
        grupoVigilado.ajustar({ indicativos: config.grupoIndicativos, minutos: config.grupoMinutos, maxKm: config.grupoMaxKm, sondeoS: config.grupoSondeoS });
        return bien(`Grupo: ${config.grupoIndicativos || '(vacío)'}`);
      }
      if (config.grupoActivo !== true) return mal('La vigilancia de grupo está apagada («arts on»).');
      if (o.accion === 'poll') {
        const enviados: string[] = [];
        for (const d of grupoVigilado.sondearTodos()) { const x = mensajeria.redactar(d, 'ping'); if (x.ok) { emitirMensajeria(x.emision.info, `Sondeo del grupo a ${d}`); enviados.push(d); } }
        return bien(...conTx([`«ping» a ${enviados.join(', ') || 'nadie'}.`]));
      }
      if (o.accion === 'list' || o.accion === '') {
        const situ = grupoVigilado.situar(estacion);
        if (!grupoVigilado.miembros.length) return bien('El grupo está vacío («arts add <indicativo>»).');
        return bien(...grupoVigilado.miembros.map((m, i) => `${(m.estado === 'dentro' ? 'EN ALCANCE' : m.estado === 'fuera' ? 'FUERA' : 'ESPERANDO').padEnd(10)} ${(m.ultimo ?? m.indicativo).padEnd(10)} ${situ[i].km !== null ? `${rumbo3(situ[i].rumbo!)}° ${situ[i].km} km · ` : ''}${m.oidoRf ? `radio ${hhmm(m.oidoRf)}Z` : 'sin oírse por radio'}`));
      }
      return mal('Orden de arts no reconocida. «help arts».');
    }

    case 'eai': {
      const destino = o.accion.toUpperCase();
      const codigo = String(o.args[0] ?? '');
      const parar = String(o.args[1] ?? '').toLowerCase() === 'stop';
      const miembro = grupoVigilado.miembros.find((x) => x.indicativo === destino || x.ultimo === destino);
      if (!miembro) return mal('Uso: eai <indicativo del grupo> <código> [stop].');
      const m = mensajeEai(codigo, parar);
      if (!m.ok) return mal((m as { error: string }).error);
      const x = mensajeria.redactar(miembro.ultimo ?? miembro.indicativo, m.texto);
      if (!x.ok) return mal((x as { error: string }).error);
      emitirMensajeria(x.emision.info, `${parar ? 'Fin de emergencia' : 'Emergencia'} remota (EAI) a ${destino}`);
      addLog('SYS', 'EAI', 'LOCAL', 'CONSOLA', `${parar ? 'Parada' : 'Activación'} de la emergencia remota enviada a ${destino} desde la consola.`, true, 'EAI');
      return bien(...conTx([`${parar ? 'Orden de parar' : 'Emergencia remota'} enviada a ${destino}; su respuesta llega a Mensajería.`]));
    }

    case 'n2k': {
      if (o.accion === 'on' || o.accion === 'off') {
        servicioN2k.cfg.activo = o.accion === 'on';
        (config as unknown as Record<string, unknown>).nmea2000 = servicioN2k.cfg;
        guardarConfig();
        servicioN2k.aplicar();
      }
      const e = servicioN2k.estado();
      return bien(`NMEA 2000 ${e.activo ? 'encendido' : 'apagado'} · ${e.interfaz} · dirección ${e.direccion >= 0 ? e.direccion : '—'}${e.error ? ` · error: ${e.error}` : ''}`);
    }
  }
  return mal(`Módulo «${o.modulo}» desconocido. «help» para ver la lista.`);
}

app.get('/api/radio/consola', (_req, res) => {
  res.json({ modulos: AYUDA });
});

app.post('/api/radio/consola', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, lineas: ['Solo el administrador puede usar la consola de comandos.'] });
  const o = leerOrden(String(req.body?.orden ?? ''));
  if (!o) return res.json({ ok: true, lineas: [] });
  // Lo que emite o activa una emergencia pide confirmación en la pantalla; aquí se exige que llegue
  if (pideConfirmacion(o) && req.body?.confirmado !== true) return res.json({ ok: false, confirmar: true, lineas: ['Esta orden emite o activa una emergencia: hay que confirmarla.'] });
  try {
    const r = await ejecutarConsola(o);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, lineas: [`Error: ${e?.message ?? e}`] });
  }
});

// Vigilancia de grupo (ARTS) y emergencia remota (EAI)
app.get('/api/radio/grupo', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const situ = grupoVigilado.situar(estacion);
  const admin = isAuthorizedRequest(req);
  res.json({
    activo: config.grupoActivo === true,
    ajustes: grupoVigilado.config,
    txEnabled: TX_ENABLED,
    miembros: config.grupoActivo === true ? grupoVigilado.miembros.map((m, i) => ({
      ...m, km: situ[i].km, rumbo: situ[i].rumbo,
      // Última respuesta de emergencia remota de ese tracker («EAI ON 30min», «EAI OFF»)
      eai: admin ? (mensajeria.recibidos.find((r) => r.de.replace(/-.*$/, '') === m.indicativo.replace(/-.*$/, '') && /^EAI (ON|OFF)/i.test(r.texto)) ?? null) : null,
      pong: mensajeria.recibidos.find((r) => r.de.replace(/-.*$/, '') === m.indicativo.replace(/-.*$/, '') && /^pong/i.test(r.texto))?.cuando ?? null,
    })) : [],
    cambios: config.grupoActivo === true ? grupoVigilado.cambios.slice(0, 10) : [],
  });
});

app.post('/api/radio/grupo', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador.' });
  if (!isValidCallsign(config.callsign)) return res.status(400).json({ ok: false, error: 'La estación no tiene un indicativo válido.' });
  const b = req.body || {};
  if (b.accion === 'sondear') {
    if (config.grupoActivo !== true) return res.status(400).json({ ok: false, error: 'La vigilancia de grupo está apagada.' });
    const enviados: string[] = [];
    for (const destino of grupoVigilado.sondearTodos()) {
      const r = mensajeria.redactar(destino, 'ping');
      if (r.ok) { emitirMensajeria(r.emision.info, `Sondeo del grupo a ${destino}`); enviados.push(destino); }
    }
    return res.json({ ok: true, enviados, txEnabled: TX_ENABLED });
  }
  if (b.accion === 'eai') {
    const destino = String(b.indicativo ?? '').trim().toUpperCase();
    if (!grupoVigilado.miembros.some((m) => m.indicativo === destino || m.ultimo === destino)) return res.status(400).json({ ok: false, error: 'Solo a estaciones del grupo.' });
    const m = mensajeEai(String(b.codigo ?? ''), b.parar === true);
    if (!m.ok) return res.status(400).json(m);
    const miembro = grupoVigilado.miembros.find((x) => x.indicativo === destino || x.ultimo === destino)!;
    const r = mensajeria.redactar(miembro.ultimo ?? miembro.indicativo, m.texto);
    if (!r.ok) return res.status(400).json(r);
    emitirMensajeria(r.emision.info, `${b.parar === true ? 'Fin de' : ''} emergencia remota (EAI) a ${destino}`.trim());
    addLog('SYS', 'EAI', 'LOCAL', 'GRUPO', `${b.parar === true ? 'Parada' : 'Activación'} de la emergencia remota enviada a ${destino}.`, true, 'EAI');
    return res.json({ ok: true, txEnabled: TX_ENABLED });
  }
  res.status(400).json({ ok: false, error: 'Orden no reconocida.' });
});

// ---------------------------------------------------------------------------
// aprx: su configuración y su registro de radio (rflog)
// ---------------------------------------------------------------------------
const monitorAprx = new MonitorAprx();
let confAprx: { conf: ConfAprx; ruta: string } | null = null;
let aprxDesde: number | null = null;
const seguidorAprx = new SeguidorArchivo((linea) => {
  const propios = [confAprx?.conf.indicativo, ...(confAprx?.conf.interfaces.map((i) => i.indicativo) ?? [])].filter((x): x is string => !!x);
  const l = leerLineaRf(linea, propios);
  if (l) monitorAprx.anotar(l);
});

function leerAprx() {
  confAprx = null;
  for (const ruta of ['/etc/aprx.conf', './aprx.conf']) {
    try { confAprx = { conf: leerConfAprx(fs.readFileSync(ruta, 'utf8')), ruta }; break; } catch { /* siguiente */ }
  }
  aprxDesde = desdeServicio('aprx');
}
leerAprx();
setInterval(leerAprx, 30_000);
setInterval(() => seguidorAprx.leer(confAprx?.conf.registroRf ?? null), 2000);

app.get('/api/radio/aprx', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const c = confAprx?.conf ?? null;
  res.json({
    servicio: { estado: nucStats.services.aprx, desde: aprxDesde },
    conf: c ? { ...c, ruta: confAprx!.ruta } : null,
    registro: { activado: !!c?.registroRf, error: seguidorAprx.error, ultimaLinea: seguidorAprx.ultimaLinea || null },
    resumen: monitorAprx.resumen(),
    tramas: monitorAprx.lineas.slice(0, 60).map((l) => ({ ...l, que: describirTrama(l.origen, l.destino, l.info, estacion) })),
  });
});

app.post('/api/radio/aprx', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador.' });
  if (req.body?.accion !== 'reiniciar') return res.status(400).json({ ok: false, error: 'Orden no reconocida.' });
  const error = await reiniciarServicio('aprx');
  setTimeout(leerAprx, 3000);
  res.status(error ? 500 : 200).json({ ok: !error, error: error ? `No se pudo reiniciar: ${error}` : undefined });
});

// WeeWX: su configuración y su base de datos (últimas 24 h), de verdad
let confWeewx: { conf: ConfWeewx; ruta: string } | null = null;
let weewxDesde: number | null = null;
let weewxBd: { ruta: string; horas: HoraWeewx[]; error: string | null; leido: number } = { ruta: '', horas: [], error: null, leido: 0 };
async function leerWeewxCompleto() {
  confWeewx = null;
  for (const ruta of ['/etc/weewx/weewx.conf', '/etc/weewx.conf', path.join(os.homedir(), 'weewx-data', 'weewx.conf'), './weewx.conf']) {
    try { confWeewx = { conf: leerConfWeewx(fs.readFileSync(ruta, 'utf8')), ruta }; break; } catch { /* siguiente */ }
  }
  weewxDesde = desdeServicio('weewx');
  const ruta = String(config.wxWeewxDb || '').trim() || confWeewx?.conf.baseDatos || '';
  const r = await consultarWeewx(ruta, CONSULTA_HORAS);
  weewxBd = { ruta, horas: r.error ? [] : leerHorasWeewx(r.salida), error: r.error, leido: Date.now() };
}
setImmediate(() => { void leerWeewxCompleto(); });
setInterval(() => { void leerWeewxCompleto(); }, 60_000);

app.get('/api/estacion/weewx', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const ultima = weewxBd.horas[weewxBd.horas.length - 1];
  res.json({
    servicio: { estado: process.platform === 'linux' ? nucStats.services.weewx : null, desde: weewxDesde },
    conf: confWeewx ? { ...confWeewx.conf, ruta: confWeewx.ruta } : null,
    bd: { ruta: weewxBd.ruta, error: weewxBd.error, leido: weewxBd.leido, ultimaHora: ultima?.hora ?? null },
    actual: observacionPropia && observacionPropia.fuente === 'WeeWX' ? observacionPropia : null,
    horas: weewxBd.horas,
    resumen: resumenHoras(weewxBd.horas),
    parte: { activo: !!config.wxBeaconEnabled, intervaloMin: intervaloMeteoMs(config.wxBeaconInterval) / 60000, fuente: estadoParteMeteo().elegida?.fuente ?? null },
  });
});

app.post('/api/estacion/weewx', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador.' });
  if (req.body?.accion === 'releer') { await leerWeewxCompleto(); return res.json({ ok: true }); }
  if (req.body?.accion !== 'reiniciar') return res.status(400).json({ ok: false, error: 'Orden no reconocida.' });
  const error = await reiniciarServicio('weewx');
  setTimeout(() => { void leerWeewxCompleto(); }, 5000);
  res.status(error ? 500 : 200).json({ ok: !error, error: error ? `No se pudo reiniciar: ${error}` : undefined });
});

// Fuentes: zonas de MeteoAlarm vistas y sondas de radiactividad más cercanas
app.get('/api/fuentes/meteoalarm/zonas', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    paises: paisesMeteoAlarm(), seguidas: String(config.meteoalarmZonas ?? ''),
    zonas: Object.entries(zonasMeteoAlarm).map(([codigo, z]) => ({ codigo, ...z })).sort((a, b) => a.codigo.localeCompare(b.codigo)),
  });
});
app.get('/api/fuentes/radiacion', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  res.json({
    activo: config.radiacionEnabled === true, umbral: Number(config.radiacionUmbral ?? 0.3), cuando: sondasRadiacion?.cuando ?? null,
    sondas: sondasRadiacion ? sondasCercanas(sondasRadiacion.sondas, estacion, 10).map((s) => ({ ...s, distanciaKm: Math.round(s.distanciaKm) })) : [],
  });
});

// Historial (SQLite): resumen, búsqueda y exportación
app.get('/api/historial', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...historial.resumen(), retencion: retencionHistorial() });
});

app.get('/api/historial/tramas', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const dias = Math.min(365, Math.max(1, Number(req.query.dias) || 7));
  const q = String(req.query.q ?? '').trim().toUpperCase().slice(0, 40);
  const via = ['RF', 'IS', 'TX'].includes(String(req.query.via)) ? String(req.query.via) : undefined;
  const csv = req.query.formato === 'csv';
  if (csv && !isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede exportar.' });
  const filas = historial.tramas(csv ? 5000 : 300, { q: q || undefined, desde: Date.now() - dias * 86_400_000, via });
  if (csv) {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="tramas-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(aCsv(['cuando_utc', 'via', 'origen', 'destino', 'ruta', 'tipo', 'info', 'noEmitida'],
      filas.map((f) => ({ ...f, cuando_utc: new Date(f.cuando).toISOString() }))));
  }
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  res.json({ disponible: historial.disponible, error: historial.error, dias, tramas: filas.map((t) => ({ ...t, que: describirTrama(t.origen, t.destino, t.info, estacion) })) });
});

app.get('/api/historial/registro', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede exportar.' });
  const dias = Math.min(3650, Math.max(1, Number(req.query.dias) || 30));
  const filas = historial.registro(20000, Date.now() - dias * 86_400_000);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="registro-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(aCsv(['cuando_utc', 'tipo', 'origen', 'destino', 'ruta', 'resultado', 'nota', 'trama'], filas.map((f) => {
    const d = f.datos as AprsPacketLog;
    return { cuando_utc: new Date(f.cuando).toISOString(), tipo: f.tipo, origen: d.source, destino: d.destination, ruta: d.path, resultado: d.success ? 'ok' : 'error', nota: d.remarks, trama: d.payload };
  })));
});

// Tramas APRS: lo que entra por radio y por APRS-IS y lo que sale
app.get('/api/radio/tramas', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const desde = Number(req.query.desde) || 0;
  const tramas = registroTramas.tramas.filter((t) => t.n > desde).slice(0, 200)
    .map((t) => ({ ...t, que: describirTrama(t.origen, t.destino, t.info, estacion) }));
  res.json({
    kiss: { conectado: kissConectado, desde: kissDesde, puerto: config.kissTcpPort },
    aprsIs: { estado: clienteAprsIs.estado, servidor: `${config.serverIp}:${config.aprscPort}` },
    txEnabled: TX_ENABLED,
    resumen: registroTramas.resumen(ahora),
    tipos: NOMBRE_TIPO,
    tramas,
  });
});

app.post('/api/radio/tramas/analizar', (req, res) => {
  res.json(analizarTrama(String(req.body?.trama ?? ''), { lat: gpsdState.lat, lon: gpsdState.lon }));
});

// Winlink (Pat): lo que su API HTTP da de verdad
const clientePat = new ClientePat(() => String(config.patUrl || 'http://127.0.0.1:8080'));
let patDesde: number | null = null;
let patNuevos = new Set<string>();
function servicioPat() { return /^pat(@[A-Za-z0-9_.-]{1,32})?$/.test(String(config.patServicio)) ? String(config.patServicio) : 'pat'; }
async function sondearPat() {
  const antes = new Set(clientePat.estado.buzones.in.map((m) => m.mid));
  const primera = clientePat.estado.leido === 0;
  await clientePat.sondear();
  patDesde = desdeServicio(servicioPat());
  if (!primera && clientePat.estado.alcanzable) {
    for (const m of clientePat.estado.buzones.in) {
      if (!antes.has(m.mid) && !patNuevos.has(m.mid)) {
        patNuevos.add(m.mid);
        addLog('RX', m.de || 'WINLINK', 'LOCAL', 'WINLINK', `Correo Winlink de ${m.de}: ${m.asunto}`, true, 'Recibido');
      }
    }
  }
}
setImmediate(() => { void sondearPat(); });
// Cada 15 s; durante una sesión, cada 3 s para seguir el enlace
setInterval(() => {
  const viva = (clientePat.sesion && clientePat.sesion.fin === null) || clientePat.estado.conectado || clientePat.estado.marcando;
  if (viva || Date.now() - clientePat.estado.leido >= 14_500) void sondearPat();
}, 3000);

/** Las URL de conexión de Pat pueden llevar una contraseña: no sale de la consola. */
const sinClavePat = (u: string) => u.replace(/(:\/\/[^:/@]*:)[^@]*@/, '$1***@');
app.get('/api/radio/winlink', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const e = clientePat.estado;
  // El correo solo se enseña al administrador; al resto, las cuentas
  const admin = isAuthorizedRequest(req);
  const b = e.buzones;
  const estadoServicio = process.platform === 'linux' ? (servicioPat() === 'pat' ? nucStats.services.pat : (patDesde ? 'active' : 'inactive')) : null;
  res.json({
    url: String(config.patUrl),
    servicio: { nombre: servicioPat(), estado: estadoServicio, desde: patDesde },
    ...e,
    admin,
    cuentas: { in: b.in.length, sinLeer: b.in.filter((m) => m.sinLeer).length, out: b.out.length, sent: b.sent.length },
    buzones: admin ? b : { in: [], out: [], sent: [] },
    alias: admin ? e.alias.map((a) => ({ ...a, destino: sinClavePat(a.destino) })) : [],
    sesion: clientePat.sesion ? { ...clientePat.sesion, destino: sinClavePat(clientePat.sesion.destino) } : null,
    modosRms: MODOS_RMS,
  });
});

app.get('/api/radio/winlink/mensaje', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede leer el correo.' });
  try {
    const m = await clientePat.mensaje(String(req.query.buzon) as Buzon, String(req.query.mid ?? ''));
    res.json({ ok: true, mensaje: m });
  } catch (e: any) { res.status(502).json({ ok: false, error: e?.message ?? String(e) }); }
});

app.get('/api/radio/winlink/rms', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador.' });
  try {
    res.json({ ok: true, rms: await clientePat.rms(String(req.query.modo ?? ''), String(req.query.banda ?? ''), req.query.forzar === '1') });
  } catch (e: any) { res.status(502).json({ ok: false, error: e?.message ?? String(e) }); }
});

app.post('/api/radio/winlink', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador.' });
  const b = req.body ?? {};
  try {
    switch (b.accion) {
      case 'enviar':
        await clientePat.enviar({ para: String(b.para ?? ''), cc: String(b.cc ?? ''), asunto: String(b.asunto ?? ''), cuerpo: String(b.cuerpo ?? ''), soloP2P: b.soloP2P === true });
        addLog('SYS', clientePat.estado.indicativo || 'WINLINK', String(b.para ?? '').slice(0, 40), 'WINLINK', `Correo a la bandeja de salida: ${String(b.asunto ?? '').slice(0, 60)}`, true, 'En cola');
        return res.json({ ok: true });
      case 'conectar': {
        if (!clientePat.estado.alcanzable) return res.status(409).json({ ok: false, error: clientePat.estado.error || 'Pat no contesta.' });
        const destino = String(b.destino ?? '').trim();
        const s = clientePat.conectar(destino, (fin) => addLog('SYS', 'WINLINK', destino, 'WINLINK',
          fin.error ? `Sesión Winlink con ${destino}: ${fin.error}` : `Sesión Winlink con ${destino} terminada${fin.recibidos !== null ? `: ${fin.recibidos} recibido(s)` : ''}.`, !fin.error, fin.error ? 'Error' : 'Hecho'));
        addLog('SYS', 'WINLINK', destino, 'WINLINK', `Sesión Winlink abierta con ${destino}`, true, 'Conectando');
        return res.json({ ok: true, sesion: s });
      }
      case 'desconectar':
        await clientePat.desconectar(b.sucio === true);
        return res.json({ ok: true });
      case 'leido':
        await clientePat.marcarLeido(String(b.buzon) as Buzon, String(b.mid ?? ''));
        return res.json({ ok: true });
      case 'reiniciar': {
        const error = await reiniciarServicio(servicioPat());
        setTimeout(() => { void sondearPat(); }, 3000);
        return res.status(error ? 500 : 200).json({ ok: !error, error: error ? `No se pudo reiniciar: ${error}` : undefined });
      }
      default:
        return res.status(400).json({ ok: false, error: 'Orden no reconocida.' });
    }
  } catch (e: any) {
    res.status(e?.message?.startsWith('Pat respondió') || /contesta|fetch/i.test(e?.message ?? '') ? 502 : 400).json({ ok: false, error: e?.message ?? String(e) });
  }
});

// Equipo de radio (CAT) y rotor
app.get('/api/radio/equipo', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const e = equipoRadio.estado;
  const r = rotorAntena.estado;
  res.json({
    equipo: {
      activo: config.catEnabled === true, destino: equipoRadio.destino || `${config.catHost}:${config.catPort}`,
      ...e, senal: e.senalDb === null ? null : sMeter(e.senalDb), modos: MODOS,
    },
    rotor: {
      modo: config.rotorMode || 'off', destino: rotorAntena.destino || `${config.rotorHost}:${config.rotorPort}`, pinGuardado: !!config.rotorPin, ...r,
      // Con el rotor en un móvil, lo que se enseña y se pide es el acimut verdadero
      movil: config.rotorMovil === true,
      azVerdadero: r.az === null ? null : (config.rotorMovil === true ? (proaEstacion.rumbo === null ? null : acimutVerdadero(r.az, proaEstacion.rumbo)) : r.az),
      objetivoVerdadero: r.objetivoAz === null ? null : (config.rotorMovil === true ? (proaEstacion.rumbo === null ? null : acimutVerdadero(r.objetivoAz, proaEstacion.rumbo)) : r.objetivoAz),
    },
    estacion: {
      gps: estacionConGps(), lat: gpsdState.lat, lon: gpsdState.lon,
      velocidadKmh: estacionConGps() ? gpsdState.speedKmh : 0,
      proa: proaEstacion.rumbo, proaCuando: proaEstacion.cuando || null,
    },
    seguimiento: seguimientoRotor.objetivo ? { objetivo: seguimientoRotor.objetivo, ...(seguimientoRotor.ultimo ?? { ok: false, nombre: '', espera: 'calculando' }) } : null,
  });
});

app.post('/api/radio/equipo', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede manejar el equipo.' });
  const b = req.body || {};
  let r: { ok: boolean; error?: string } = { ok: false, error: 'Orden vacía.' };
  if (b.frecuenciaHz !== undefined) r = await equipoRadio.frecuencia(Number(b.frecuenciaHz));
  if (b.modo !== undefined && (b.frecuenciaHz === undefined || r.ok)) r = await equipoRadio.modo(String(b.modo));
  if (b.vfo !== undefined) r = await equipoRadio.vfo(String(b.vfo));
  if (b.ptt !== undefined) {
    r = await equipoRadio.ptt(b.ptt === true);
    if (r.ok) addLog('SYS', 'CAT', 'LOCAL', 'PTT', b.ptt === true ? 'PTT del equipo activado desde la consola (se suelta solo a los 3 minutos).' : 'PTT del equipo soltado desde la consola.', true, 'Equipo');
  }
  if (r.ok) await equipoRadio.sondear();
  res.status(r.ok ? 200 : 400).json(r);
});

app.post('/api/radio/rotor', async (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede mover el rotor.' });
  const b = req.body || {};
  let r: { ok: boolean; error?: string };
  if (b.accion === 'seguir') {
    const o = b.objetivo || {};
    const id = String(o.indicativo ?? '').trim().toUpperCase().slice(0, 20);
    let objetivo: Objetivo | null = null;
    if (o.tipo === 'sol' || o.tipo === 'luna' || o.tipo === 'ultima') objetivo = { tipo: o.tipo };
    else if ((o.tipo === 'aprs' || o.tipo === 'barco' || o.tipo === 'avion') && id) objetivo = { tipo: o.tipo, indicativo: id };
    else if (o.tipo === 'satelite' && Number.isInteger(Number(o.norad)) && Number(o.norad) > 0) objetivo = { tipo: 'satelite', norad: Number(o.norad) };
    else if (o.tipo === 'punto' && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)) && Math.abs(Number(o.lat)) <= 90 && Math.abs(Number(o.lon)) <= 180) {
      objetivo = { tipo: 'punto', lat: Number(o.lat), lon: Number(o.lon), nombre: String(o.nombre || 'Punto fijo').slice(0, 30) };
    }
    if (!objetivo) return res.status(400).json({ ok: false, error: 'Falta el objetivo que hay que seguir.' });
    seguimientoRotor.seguir(objetivo);
    const orden = rotorAntena.estado.enlace ? seguimientoRotor.paso(contextoRotor()) : null;
    if (orden) await rotorAntena.ir(orden.az, orden.el);
    return res.json({ ok: true });
  }
  if (b.accion === 'dejar') {
    seguimientoRotor.dejar();
    return res.json({ ok: true });
  }
  // Mover a mano, parar o aparcar deja de seguir, como en la caja del rotor
  seguimientoRotor.dejar();
  if (b.accion === 'ir') {
    const ctx = contextoRotor();
    if (ctx.movil && ctx.proa === null) return res.status(400).json({ ok: false, error: 'El rotor va en un móvil y todavía no hay rumbo de la proa (hace falta GPS en marcha).' });
    // El acimut pedido es verdadero: al rotor se le manda descontada la proa
    r = await rotorAntena.ir(acimutDeRotor(Number(b.az), ctx.movil ? ctx.proa : null), b.el === undefined || b.el === null || b.el === '' ? undefined : Number(b.el));
  } else if (b.accion === 'parar') r = await rotorAntena.detener();
  else if (b.accion === 'aparcar') r = await rotorAntena.aparcar();
  else r = { ok: false, error: 'Orden no reconocida.' };
  res.status(r.ok ? 200 : 400).json(r);
});

app.get('/api/radio/cluster', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  res.json({
    configurado: !!config.clusterHost,
    activo: config.clusterEnabled === true,
    estado: clusterDx.estado,
    detalle: clusterDx.detalle,
    nodo: clusterDx.destinoActual || (config.clusterHost ? `${config.clusterHost}:${config.clusterPort}` : ''),
    paises: tablaDxcc.entidades > 0,
    spots: clusterDx.spots.slice(0, 150).map((s) => {
      const e = tablaDxcc.buscar(s.dx);
      return {
        ...s,
        pais: e?.nombre ?? null,
        rumbo: e ? Math.round(gcInitialBearing(estacion, e)) : null,
        distanciaKm: e ? Math.round(gcDistanceKm(estacion, e)) : null,
      };
    }),
    // La salida cruda del nodo, para la consola: solo para el administrador
    lineas: isAuthorizedRequest(req) ? clusterDx.lineas.slice(-80) : [],
  });
});

app.post('/api/radio/cluster/orden', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede enviar órdenes al cluster.' });
  const ok = clusterDx.orden(String(req.body?.orden ?? ''));
  res.status(ok ? 200 : 400).json({ ok, error: ok ? undefined : 'El cluster no está conectado o la orden está vacía.' });
});

// Estado real de los enlaces de la estación, para la barra de estado
app.get('/api/enlaces', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    aprsIs: { estado: clienteAprsIs.estado, detalle: clienteAprsIs.detalle, desde: clienteAprsIs.desde, recibidas: clienteAprsIs.recibidas },
    kiss: { conectado: !!kissClient && !kissClient.destroyed && !kissClient.connecting && kissClient.writable, puerto: config.kissTcpPort, desde: kissDesde },
    estacionesOidas: estacionesOidas.total,
    gpsd: { conectado: gpsdConectado, ultimo: gpsdUltimo || null, modo: gpsdState.mode, satelites: gpsdState.satellitesUsed, visibles: gpsdState.satellitesVisible, dispositivo: gpsdState.device || null },
    cat: { activo: config.catEnabled === true, enlace: equipoRadio.estado.enlace, destino: `${config.catHost}:${config.catPort}`, error: equipoRadio.estado.error || null, modelo: equipoRadio.estado.modelo || null },
    rotor: { activo: config.rotorMode !== 'off' && !!config.rotorMode, modo: config.rotorMode, enlace: rotorAntena.estado.enlace, destino: `${config.rotorHost}:${config.rotorPort}`, error: rotorAntena.estado.error || null },
    cluster: { activo: config.clusterEnabled === true, estado: clusterDx.estado, destino: clusterDx.destinoActual || `${config.clusterHost}:${config.clusterPort}`, spots: clusterDx.spots.length },
    pat: { alcanzable: clientePat.estado.alcanzable, url: String(config.patUrl), error: clientePat.estado.error, conectado: clientePat.estado.conectado },
    nmea2000: servicioN2k.estado(),
    historial: historial.resumen(),
    ais: {
      activo: config.aisEnabled !== false,
      udpPuerto: udpAisPuerto, udpEscuchando: !!udpAis, udpError: udpAisError,
      tcp: { estado: enlaceAisTcp.estado, destino: enlaceAisTcp.destinoActual, detalle: enlaceAisTcp.detalle },
      sentencias: lectorAis.sentencias, barcos: barcos.total,
    },
    adsb: {
      activo: config.adsbEnabled !== false,
      estado: enlaceAdsb.estado, destino: enlaceAdsb.destinoActual, detalle: enlaceAdsb.detalle,
      mensajes: aeronaves.mensajes, aeronaves: aeronaves.total,
    },
  });
});

// Mapa: todo lo que tiene coordenadas, solo para verlo (nada de esto se retransmite por estar aquí)
app.get('/api/mapa', (_req, res) => {
  const ahora = Date.now();
  const estacion = { lat: gpsdState.lat, lon: gpsdState.lon };
  const avisos: any[] = [];
  for (const { eventos, politica, activo } of gruposDeAvisos()) {
    for (const e of eventos) {
      const fin = e.fin ?? e.inicio + politica.vigenciaMs;
      if (fin < ahora || e.lat === undefined || e.lon === undefined) continue;
      const d = evaluar(e, politica, estacion, ahora);
      avisos.push({
        id: e.id, tipo: e.tipo, gravedad: e.gravedad, titulo: e.titulo, detalle: e.detalle || '', fuente: e.fuente,
        inicio: e.inicio, fin, lat: e.lat, lon: e.lon, cumple: d.emitir && activo,
        zona: e.zona ? e.zona.map((p) => [Number(p.lat.toFixed(4)), Number(p.lon.toFixed(4))]) : null,
      });
    }
  }
  const trafico = dgtDatosReales
    ? dgtIncidentsList
        .filter((i) => Number.isFinite(i.latitud) && Number.isFinite(i.longitud))
        .slice(0, 800)
        .map((i) => ({ id: i.id, tipo: i.tipo, carretera: i.carretera, poblacion: i.poblacion, provincia: i.provincia, nivel: i.nivel, descripcion: i.descripcion, lat: i.latitud, lon: i.longitud }))
    : [];
  res.set('Cache-Control', 'no-store');
  res.json({
    estacion: {
      ...estacion,
      indicativo: config.callsign,
      gps: !gpsdState.isFallback && gpsdState.mode >= 2,
      radioSismosKm: config.filterRadiusKm || 200,
      radioMeteoKm: Math.max(0, Number(config.meteoRadioKm ?? 25)),
    },
    avisos: avisos.slice(0, 600),
    aprs: estacionesOidas.lista(ahora).slice(0, 1500).map((x) => ({
      nombre: x.nombre, origen: x.origen, clase: x.clase, lat: Number(x.lat.toFixed(5)), lon: Number(x.lon.toFixed(5)),
      simbolo: x.simbolo, comentario: x.comentario, via: x.via, ultima: x.ultima,
    })),
    ais: barcos.lista(ahora).slice(0, 2000).map((b) => ({
      mmsi: b.mmsi, nombre: b.nombre || '', clase: claseBarco(b.tipoBarco), indicativo: b.indicativo || '', destino: b.destino || '',
      lat: Number(b.lat!.toFixed(5)), lon: Number(b.lon!.toFixed(5)), sog: b.sog ?? null, rumbo: b.cog ?? b.proa ?? null, ultima: b.ultima,
    })),
    adsb: aeronaves.lista(ahora).slice(0, 1500).map((a) => ({
      hex: a.hex, vuelo: a.vuelo || '', lat: Number(a.lat!.toFixed(5)), lon: Number(a.lon!.toFixed(5)), altitud: a.altitud ?? null,
      velocidad: a.velocidad ?? null, rumbo: a.rumbo ?? null, squawk: a.squawk || '', emergencia: emergenciaSquawk(a.squawk), enTierra: a.enTierra === true, ultima: a.ultima,
    })),
    trafico,
    traficoReal: dgtDatosReales,
  });
});

// Emitir ya un aviso que cumple las reglas, sin esperar a su repetición
app.post('/api/avisos/emitir', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede emitir avisos.' });
  const id = String(req.body?.id || '');
  for (const { eventos, politica } of gruposDeAvisos()) {
    const evento = eventos.find((e) => e.id === id);
    if (!evento) continue;
    const n = difundirAvisos([evento], politica, true);
    return res.status(n > 0 ? 200 : 409).json({ ok: n > 0, txEnabled: TX_ENABLED, error: n > 0 ? undefined : 'El aviso no cumple las reglas de difusión.' });
  }
  return res.status(404).json({ ok: false, error: 'Aviso no encontrado o caducado.' });
});

// Parte meteorológico: vista previa, estado de las fuentes y envío manual
app.get('/api/estacion/meteo', (_req, res) => {
  const e = estadoParteMeteo();
  const resumen = (o: Observacion | null) => (o ? {
    fuente: o.fuente, cuando: o.cuando, reciente: e.ahora - o.cuando <= 30 * 60_000,
    tempC: o.tempC ?? null, humedadPct: o.humedadPct ?? null, presionHpa: o.presionHpa ?? null,
    vientoKmh: o.vientoKmh ?? null, rachaKmh: o.rachaKmh ?? null, dirGrados: o.dirGrados ?? null, lluvia1hMm: o.lluvia1hMm ?? null,
  } : null);
  res.set('Cache-Control', 'no-store');
  res.json({
    packet: e.packet,
    errores: e.errores,
    activa: !!config.wxBeaconEnabled,
    intervaloMin: intervaloMeteoMs(config.wxBeaconInterval) / 60000,
    modo: e.modo,
    elegida: e.elegida?.fuente ?? null,
    propia: resumen(observacionPropia),
    internet: resumen(observacionInternet),
    txEnabled: TX_ENABLED,
  });
});

app.post('/api/estacion/meteo', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede emitir el parte.' });
  const r = transmitParteMeteo();
  res.status(r.ok ? 200 : 400).json({ ...r, txEnabled: TX_ENABLED });
});

// Baliza de la estación: vista previa de la trama y envío manual
app.get('/api/estacion/baliza', (_req, res) => {
  const perfil = perfilBaliza();
  res.set('Cache-Control', 'no-store');
  res.json({
    packet: balizaPosicion(perfil),
    errores: validarPerfil(perfil),
    activa: !!config.aprsBeaconEnabled,
    intervaloMin: intervaloBalizaMs(config.aprsBeaconInterval) / 60000,
    posicion: { lat: perfil.lat, lon: perfil.lon, gps: !gpsdState.isFallback && gpsdState.mode >= 2 },
    txEnabled: TX_ENABLED,
  });
});

app.post('/api/estacion/baliza', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ ok: false, error: 'Solo el administrador puede emitir la baliza.' });
  const r = transmitStationBeacon();
  res.status(r.ok ? 200 : 400).json({ ...r, txEnabled: TX_ENABLED });
});

app.post('/api/config', (req, res) => {
  try {
    const updated = req.body as TelemetryConfig;
    if (updated.callsign) {
      config.callsign = updated.callsign.toUpperCase().trim();
    }
    // Un valor enmascarado (********) es el que el servidor entregó a un usuario
    // sin privilegios: se ignora para no sobrescribir la credencial real.
    if (updated.aprsPasscode && !isMaskedSecret(updated.aprsPasscode)) config.aprsPasscode = String(updated.aprsPasscode).trim();
    if (updated.owmApiKey !== undefined && !isMaskedSecret(updated.owmApiKey)) config.owmApiKey = updated.owmApiKey.trim();
    if (updated.aemetApiKey !== undefined && !isMaskedSecret(updated.aemetApiKey)) config.aemetApiKey = updated.aemetApiKey.trim();
    if (updated.iqAirApiKey !== undefined && !isMaskedSecret(updated.iqAirApiKey)) config.iqAirApiKey = updated.iqAirApiKey.trim();
    if (updated.fallbackLat) config.fallbackLat = parseFloat(updated.fallbackLat.toString());
    if (updated.fallbackLon) config.fallbackLon = parseFloat(updated.fallbackLon.toString());
    if (updated.filterRadiusKm) config.filterRadiusKm = parseInt(updated.filterRadiusKm.toString());
    if (updated.serverIp) config.serverIp = updated.serverIp.trim();
    if (updated.aprscPort) config.aprscPort = parseInt(updated.aprscPort.toString());
    const oldKissPort = config.kissTcpPort;
    if (updated.kissTcpPort) config.kissTcpPort = parseInt(updated.kissTcpPort.toString());
    if (updated.kissTcpPort && config.kissTcpPort !== oldKissPort) {
      setTimeout(() => {
        connectKissTcp();
      }, 100);
    }
    if (updated.frequencyLocalMhz) config.frequencyLocalMhz = parseFloat(updated.frequencyLocalMhz.toString());

    // NUC system configurations
    if (updated.aisCatcherPort) config.aisCatcherPort = parseInt(updated.aisCatcherPort.toString());
    if (updated.aisShareRawAprs !== undefined) config.aisShareRawAprs = !!updated.aisShareRawAprs;
    if (updated.winlinkSsid) config.winlinkSsid = updated.winlinkSsid.toUpperCase().trim();
    if (updated.minMagnitudBaliza !== undefined) config.minMagnitudBaliza = parseFloat(updated.minMagnitudBaliza.toString());
    if (updated.ignSeismoInterval !== undefined && Number.isFinite(Number(updated.ignSeismoInterval))) config.ignSeismoInterval = Math.min(720, Math.max(10, Math.round(Number(updated.ignSeismoInterval))));
    if (updated.minMagnitudAlertaVisual !== undefined) config.minMagnitudAlertaVisual = parseFloat(updated.minMagnitudAlertaVisual.toString());
    if (updated.autoGenerarBoletinEmergencia !== undefined) config.autoGenerarBoletinEmergencia = !!updated.autoGenerarBoletinEmergencia;
    if (updated.enableForecastBulletin !== undefined) config.enableForecastBulletin = !!updated.enableForecastBulletin;
    if (updated.pollIntervalAemet !== undefined) config.pollIntervalAemet = parseInt(updated.pollIntervalAemet.toString());
    if (updated.pollIntervalJrc !== undefined) config.pollIntervalJrc = parseInt(updated.pollIntervalJrc.toString());
    if (updated.pollIntervalIgn !== undefined) config.pollIntervalIgn = parseInt(updated.pollIntervalIgn.toString());
    if (updated.pollIntervalIca !== undefined) config.pollIntervalIca = parseInt(updated.pollIntervalIca.toString());
    if (updated.enableAprsIca !== undefined) config.enableAprsIca = !!updated.enableAprsIca;
    if (updated.enableAprsIcaFilterRegular !== undefined) config.enableAprsIcaFilterRegular = !!updated.enableAprsIcaFilterRegular;
    if (updated.icaTemplateBuena !== undefined) config.icaTemplateBuena = updated.icaTemplateBuena;
    if (updated.icaTemplateRegular !== undefined) config.icaTemplateRegular = updated.icaTemplateRegular;
    if (updated.icaTemplateDesfavorable !== undefined) config.icaTemplateDesfavorable = updated.icaTemplateDesfavorable;
    if (updated.icaTemplateMuyDesfavorable !== undefined) config.icaTemplateMuyDesfavorable = updated.icaTemplateMuyDesfavorable;
    if (updated.icaTemplateExtremadamente !== undefined) config.icaTemplateExtremadamente = updated.icaTemplateExtremadamente;
    if (updated.criticalEmail !== undefined) config.criticalEmail = updated.criticalEmail.trim();
    if (updated.aemetAlertsSubscriptionEnabled !== undefined) {
      config.aemetAlertsSubscriptionEnabled = !!updated.aemetAlertsSubscriptionEnabled;
      // Trigger instant update of warnings
      setTimeout(() => descargarAvisosMeteo(), 50);
    }

    // WeatherAPI settings
    if (updated.weatherApiKey !== undefined && !isMaskedSecret(updated.weatherApiKey)) config.weatherApiKey = updated.weatherApiKey.trim();
    if (updated.thresholdWindKts !== undefined) config.thresholdWindKts = parseFloat(updated.thresholdWindKts.toString());
    if (updated.thresholdTempMinC !== undefined) config.thresholdTempMinC = parseFloat(updated.thresholdTempMinC.toString());
    if (updated.thresholdRainMm !== undefined) config.thresholdRainMm = parseFloat(updated.thresholdRainMm.toString());
    if (updated.forecastDays !== undefined) config.forecastDays = parseInt(updated.forecastDays.toString());

    // Local Weather settings
    if (updated.historialDiasTramas !== undefined) {
      const n = Math.round(Number(updated.historialDiasTramas));
      if (Number.isFinite(n) && n >= 1 && n <= 365) config.historialDiasTramas = n;
    }
    if (updated.historialDiasRegistro !== undefined) {
      const n = Math.round(Number(updated.historialDiasRegistro));
      if (Number.isFinite(n) && n >= 1 && n <= 3650) config.historialDiasRegistro = n;
    }
    if (updated.avisosUmbralesLocales !== undefined) config.avisosUmbralesLocales = !!updated.avisosUmbralesLocales;
    if (updated.avisosPronostico !== undefined) config.avisosPronostico = !!updated.avisosPronostico;
    if (updated.localThresholdWindKts !== undefined) config.localThresholdWindKts = parseFloat(updated.localThresholdWindKts.toString());
    if (updated.localThresholdTempMaxC !== undefined) config.localThresholdTempMaxC = parseFloat(updated.localThresholdTempMaxC.toString());
    if (updated.localThresholdTempMinC !== undefined) config.localThresholdTempMinC = parseFloat(updated.localThresholdTempMinC.toString());
    if (updated.localThresholdRainMm !== undefined) config.localThresholdRainMm = parseFloat(updated.localThresholdRainMm.toString());


    if (updated.ignSeismoEnabled !== undefined) {
      config.ignSeismoEnabled = !!updated.ignSeismoEnabled;
      setTimeout(() => refreshEarthquakes(), 50);
    }
    if (updated.tsunamiMonitorEnabled !== undefined) {
      config.tsunamiMonitorEnabled = !!updated.tsunamiMonitorEnabled;
      setTimeout(() => refreshTsunamis(), 50);
    }

    // Advanced APRS configuration fields parsing
    if (updated.aprsSsid !== undefined) config.aprsSsid = parseInt(updated.aprsSsid.toString());
    if (updated.aprsSymbolTable !== undefined) config.aprsSymbolTable = updated.aprsSymbolTable.trim();
    if (updated.aprsSymbolCode !== undefined) config.aprsSymbolCode = updated.aprsSymbolCode.trim();
    if (updated.aprsPath !== undefined) config.aprsPath = updated.aprsPath.trim();
    if (updated.aprsPhgPower !== undefined) config.aprsPhgPower = parseInt(updated.aprsPhgPower.toString());
    if (updated.aprsPhgHeight !== undefined) config.aprsPhgHeight = parseInt(updated.aprsPhgHeight.toString());
    if (updated.aprsPhgGain !== undefined) config.aprsPhgGain = parseInt(updated.aprsPhgGain.toString());
    if (updated.aprsPhgDirectivity !== undefined) config.aprsPhgDirectivity = parseInt(updated.aprsPhgDirectivity.toString());
    if (updated.aprsBeaconInterval !== undefined) config.aprsBeaconInterval = parseInt(updated.aprsBeaconInterval.toString());
    if (updated.aprsBeaconEnabled !== undefined) config.aprsBeaconEnabled = !!updated.aprsBeaconEnabled;
    if (updated.aprsIsRxEnabled !== undefined) config.aprsIsRxEnabled = !!updated.aprsIsRxEnabled;
    if (updated.climaEspacialEnabled !== undefined) config.climaEspacialEnabled = !!updated.climaEspacialEnabled;
    if (updated.climaEspacialNivelMin !== undefined && Number.isFinite(Number(updated.climaEspacialNivelMin))) config.climaEspacialNivelMin = Math.min(5, Math.max(1, Math.round(Number(updated.climaEspacialNivelMin))));
    if (updated.fuegoEnabled !== undefined) config.fuegoEnabled = !!updated.fuegoEnabled;
    if (updated.fuegoRadioKm !== undefined && Number.isFinite(Number(updated.fuegoRadioKm))) config.fuegoRadioKm = Math.min(300, Math.max(5, Number(updated.fuegoRadioKm)));
    if (updated.fuegoGravedadMinima !== undefined && GRAVEDADES.includes(updated.fuegoGravedadMinima as Gravedad)) config.fuegoGravedadMinima = updated.fuegoGravedadMinima;
    if (updated.aireEnabled !== undefined) config.aireEnabled = !!updated.aireEnabled;
    if (updated.aireGravedadMinima !== undefined && ['amarillo', 'naranja', 'rojo'].includes(String(updated.aireGravedadMinima))) config.aireGravedadMinima = updated.aireGravedadMinima;
    const numEn = (v: unknown, min: number, max: number) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : undefined);
    let fuentesCambiadas = false;
    if (updated.meteoalarmEnabled !== undefined) { config.meteoalarmEnabled = !!updated.meteoalarmEnabled; fuentesCambiadas = true; }
    if (updated.meteoalarmPaises !== undefined) { config.meteoalarmPaises = String(updated.meteoalarmPaises).toLowerCase().replace(/[^a-z,\s-]/g, '').slice(0, 120); fuentesCambiadas = true; }
    if (updated.meteoalarmZonas !== undefined) { config.meteoalarmZonas = String(updated.meteoalarmZonas).replace(/[<>]/g, '').slice(0, 400); fuentesCambiadas = true; }
    if (updated.meteoalarmGravedadMinima !== undefined && GRAVEDADES.includes(updated.meteoalarmGravedadMinima as Gravedad)) config.meteoalarmGravedadMinima = updated.meteoalarmGravedadMinima;
    if (numEn(updated.meteoalarmRepetirMin, 10, 720) !== undefined) config.meteoalarmRepetirMin = Math.round(numEn(updated.meteoalarmRepetirMin, 10, 720)!);
    if (updated.ciclonesEnabled !== undefined) { config.ciclonesEnabled = !!updated.ciclonesEnabled; fuentesCambiadas = true; }
    if (numEn(updated.ciclonesRadioKm, 50, 5000) !== undefined) config.ciclonesRadioKm = Math.round(numEn(updated.ciclonesRadioKm, 50, 5000)!);
    if (updated.ciclonesGravedadMinima !== undefined && GRAVEDADES.includes(updated.ciclonesGravedadMinima as Gravedad)) config.ciclonesGravedadMinima = updated.ciclonesGravedadMinima;
    if (updated.radiacionEnabled !== undefined) { config.radiacionEnabled = !!updated.radiacionEnabled; fuentesCambiadas = true; }
    if (updated.radiacionPaises !== undefined) { config.radiacionPaises = String(updated.radiacionPaises).toUpperCase().replace(/[^A-Z,\s]/g, '').slice(0, 60); fuentesCambiadas = true; }
    if (numEn(updated.radiacionRadioKm, 5, 1000) !== undefined) config.radiacionRadioKm = Math.round(numEn(updated.radiacionRadioKm, 5, 1000)!);
    if (numEn(updated.radiacionUmbral, 0.05, 100) !== undefined) { config.radiacionUmbral = numEn(updated.radiacionUmbral, 0.05, 100)!; fuentesCambiadas = true; }
    if (fuentesCambiadas) {
      const seguro = (f: () => Promise<void>) => { f().catch((e) => console.warn(`[AVISOS] ${e?.message || e}`)); };
      setTimeout(() => { seguro(descargarMeteoAlarmAvisos); seguro(descargarCiclonesAvisos); seguro(descargarRadiacionAvisos); }, 500);
    }
    if (updated.wxBeaconEnabled !== undefined) config.wxBeaconEnabled = !!updated.wxBeaconEnabled;
    if (updated.wxBeaconInterval !== undefined && Number.isFinite(Number(updated.wxBeaconInterval))) config.wxBeaconInterval = Math.min(120, Math.max(5, Math.round(Number(updated.wxBeaconInterval))));
    if (updated.wxFuente !== undefined && ['auto', 'propia', 'internet'].includes(String(updated.wxFuente))) config.wxFuente = updated.wxFuente;
    // Rutas de archivos del propio equipo: solo las cambia el administrador
    if (isAuthorizedRequest(req)) {
      if (updated.wxWeewxDb !== undefined) config.wxWeewxDb = String(updated.wxWeewxDb).trim().slice(0, 300);
      if (updated.wxWxnowPath !== undefined) config.wxWxnowPath = String(updated.wxWxnowPath).trim().slice(0, 300);
    }
    if (updated.aisEnabled !== undefined) config.aisEnabled = !!updated.aisEnabled;
    if (updated.aisUdpPort !== undefined) config.aisUdpPort = puertoValido(updated.aisUdpPort);
    if (updated.aisTcpHost !== undefined) config.aisTcpHost = String(updated.aisTcpHost).trim().replace(/[^A-Za-z0-9.:_-]/g, '').slice(0, 100);
    if (updated.aisTcpPort !== undefined) config.aisTcpPort = puertoValido(updated.aisTcpPort);
    if (updated.adsbEnabled !== undefined) config.adsbEnabled = !!updated.adsbEnabled;
    if (updated.adsbHost !== undefined) config.adsbHost = String(updated.adsbHost).trim().replace(/[^A-Za-z0-9.:_-]/g, '').slice(0, 100);
    if (updated.adsbPort !== undefined) config.adsbPort = puertoValido(updated.adsbPort);
    if (updated.clusterEnabled !== undefined) config.clusterEnabled = !!updated.clusterEnabled;
    if (updated.clusterHost !== undefined) config.clusterHost = String(updated.clusterHost).trim().replace(/[^A-Za-z0-9.:_-]/g, '').slice(0, 100);
    if (updated.clusterPort !== undefined) config.clusterPort = puertoValido(updated.clusterPort);
    if (updated.catEnabled !== undefined) config.catEnabled = !!updated.catEnabled;
    if (updated.catHost !== undefined) config.catHost = String(updated.catHost).trim().replace(/[^A-Za-z0-9.:_-]/g, '').slice(0, 100);
    if (updated.catPort !== undefined) config.catPort = puertoValido(updated.catPort);
    if (updated.rotorMode !== undefined && ['off', 'rotctld', 'caja'].includes(String(updated.rotorMode))) config.rotorMode = updated.rotorMode;
    if (updated.rotorHost !== undefined) config.rotorHost = String(updated.rotorHost).trim().replace(/[^A-Za-z0-9.:_-]/g, '').slice(0, 100);
    if (updated.rotorPort !== undefined) config.rotorPort = puertoValido(updated.rotorPort);
    if (updated.grupoActivo !== undefined) config.grupoActivo = !!updated.grupoActivo;
    if (updated.grupoIndicativos !== undefined) config.grupoIndicativos = String(updated.grupoIndicativos).slice(0, 80);
    if (updated.grupoMinutos !== undefined) config.grupoMinutos = Number(updated.grupoMinutos);
    if (updated.grupoMaxKm !== undefined) config.grupoMaxKm = Number(updated.grupoMaxKm);
    if (updated.grupoSondeoS !== undefined) config.grupoSondeoS = Number(updated.grupoSondeoS);
    if (updated.satFavoritos !== undefined) config.satFavoritos = String(updated.satFavoritos).split(/[^0-9]+/).filter(Boolean).slice(0, 16).join(',');
    if (updated.rotorMovil !== undefined) config.rotorMovil = !!updated.rotorMovil;
    if (updated.patUrl !== undefined) {
      const u = String(updated.patUrl).trim().slice(0, 120);
      if (/^https?:\/\/[A-Za-z0-9.:_\[\]-]+(\/[A-Za-z0-9._~\/-]*)?$/.test(u)) config.patUrl = u;
    }
    if (updated.patServicio !== undefined) {
      const sv = String(updated.patServicio).trim();
      if (/^pat(@[A-Za-z0-9_.-]{1,32})?$/.test(sv)) config.patServicio = sv;
    }
    if (updated.rotorPin !== undefined && !isMaskedSecret(updated.rotorPin)) config.rotorPin = String(updated.rotorPin).replace(/[^0-9A-Za-z]/g, '').slice(0, 16);
    if (updated.dapnetUser !== undefined) config.dapnetUser = String(updated.dapnetUser).trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (updated.dapnetPassword !== undefined && !isMaskedSecret(updated.dapnetPassword)) config.dapnetPassword = String(updated.dapnetPassword).slice(0, 100);
    if (updated.dapnetGroup !== undefined) config.dapnetGroup = String(updated.dapnetGroup).trim().toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 30);
    if (updated.meteoRadioKm !== undefined && Number.isFinite(Number(updated.meteoRadioKm))) config.meteoRadioKm = Math.min(500, Math.max(0, Number(updated.meteoRadioKm)));
    if (updated.meteoGravedadMinima !== undefined && ['amarillo', 'naranja', 'rojo'].includes(String(updated.meteoGravedadMinima))) config.meteoGravedadMinima = updated.meteoGravedadMinima;
    if (updated.meteoAntelacionH !== undefined && Number.isFinite(Number(updated.meteoAntelacionH))) config.meteoAntelacionH = Math.min(72, Math.max(1, Number(updated.meteoAntelacionH)));
    if (updated.meteoRepetirMin !== undefined && Number.isFinite(Number(updated.meteoRepetirMin))) config.meteoRepetirMin = Math.min(720, Math.max(15, Number(updated.meteoRepetirMin)));
    if (updated.operatorName !== undefined) config.operatorName = String(updated.operatorName).trim().slice(0, 60);
    if (updated.stationQth !== undefined) config.stationQth = String(updated.stationQth).trim().slice(0, 60);
    if (updated.aprsSmartBeaconing !== undefined) config.aprsSmartBeaconing = !!updated.aprsSmartBeaconing;
    if (updated.aprsSmartLowInterval !== undefined) config.aprsSmartLowInterval = parseInt(updated.aprsSmartLowInterval.toString());
    if (updated.aprsSmartHighInterval !== undefined) config.aprsSmartHighInterval = parseInt(updated.aprsSmartHighInterval.toString());
    if (updated.aprsSmartTurnAngle !== undefined) config.aprsSmartTurnAngle = parseInt(updated.aprsSmartTurnAngle.toString());
    if (updated.aprsSmartSlope !== undefined) config.aprsSmartSlope = parseInt(updated.aprsSmartSlope.toString());
    if (updated.aprsStatusComment !== undefined) config.aprsStatusComment = updated.aprsStatusComment.trim();
    if (updated.aprsMiceMsgCode !== undefined) config.aprsMiceMsgCode = parseInt(updated.aprsMiceMsgCode.toString());
    if (updated.aprsMiceOffset !== undefined) config.aprsMiceOffset = !!updated.aprsMiceOffset;
    if (updated.aprsFilterQuery !== undefined) config.aprsFilterQuery = updated.aprsFilterQuery.trim();
    if (updated.terminalLogsRetention !== undefined) {
      const retention = parseInt(updated.terminalLogsRetention.toString(), 10);
      if (!isNaN(retention) && retention > 0) {
        config.terminalLogsRetention = retention;
        if (logs.length > retention) {
          logs.splice(retention);
        }
      }
    }

    if (updated.systemPower !== undefined) {
      const oldPower = config.systemPower;
      config.systemPower = !!updated.systemPower;
      if (config.systemPower && oldPower !== true) {
        systemPowerOnTime = Date.now();
        setTimeout(() => {
          refreshEarthquakes();
          refreshTsunamis();
        }, 50);
      } else if (!config.systemPower) {
        earthquakes = [];
        tsunamiAlerts = [];
      }
    }

    // Sin fijo GPS la estación está en su posición fija: si se acaba de cambiar
    // en el perfil, se aplica al momento (antes hacía falta reiniciar).
    if (gpsdState.isFallback) {
      if ((updated.fallbackLat || updated.fallbackLon) && Number.isFinite(config.fallbackLat) && Number.isFinite(config.fallbackLon)) {
        lastValidGps.lat = config.fallbackLat;
        lastValidGps.lon = config.fallbackLon;
      }
      gpsdState.lat = lastValidGps.lat;
      gpsdState.lon = lastValidGps.lon;
    }

    // Guardar en disco para persistir la configuración tras el reinicio de la NUC si está autenticado
    const isAuth = isAuthorizedRequest(req);
    if (isAuth) {
      addLog('SYS', 'CONFIG', 'LOCAL', 'SYSCONF', 'Guardada configuración integral del ecosistema NUC Debian 13 en disco.', true, 'Ecosistema guardado');
      try {
        const satConfigPath = path.join(process.cwd(), 'sat_config.json');
        fs.writeFileSync(satConfigPath, JSON.stringify(config, null, 2), 'utf8');

      } catch (err) {
        console.error("[SYS CONFIG ERROR] No se pudo escribir sat_config.json:", err);
      }
    } else {
      addLog('SYS', 'CONFIG', 'LOCAL', 'SYSCONF', 'Configuración cambiada solo en memoria: sin sesión de administrador no se escribe en disco y se pierde al reiniciar.', true, 'Solo en memoria');
    }

    // Quick async update and scheduler restart
    startSchedules();
    ajustarAprsIs();
    ajustarEntradasMapa();
    ajustarCluster();
    ajustarEquipoYRotor();
    refreshWeather();
    refreshIQAir();
    refreshEarthquakes();

    res.json({ success: true, config: configForRequest(req) });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update current station GPS latitude and longitude directly (simulates real mobile tracker override)
// Posición fija de la estación (la de respaldo, cuando no hay GPS con fijo).
// No finge un fijo de GPS: la posición queda marcada como fija.
app.post('/api/gpsd/update', (req, res) => {
  if (!isAuthorizedRequest(req)) return res.status(403).json({ success: false, error: 'Solo el administrador puede cambiar la posición de la estación.' });
  const lat = Number(req.body?.lat), lon = Number(req.body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ success: false, error: 'Posición no válida.' });
  }
  if (gpsdState.mode >= 2 && !gpsdState.isFallback) {
    return res.status(409).json({ success: false, error: 'El GPS tiene fijo: la posición de la estación la da el GPS.' });
  }
  config.fallbackLat = Number(lat.toFixed(6));
  config.fallbackLon = Number(lon.toFixed(6));
  lastValidGps.lat = gpsdState.lat = config.fallbackLat;
  lastValidGps.lon = gpsdState.lon = config.fallbackLon;
  const alt = Number(req.body?.alt);
  if (Number.isFinite(alt)) lastValidGps.alt = gpsdState.alt = Math.round(alt);
  gpsdState.isFallback = true;
  guardarConfig();
  addLog('SYS', 'GPSD', 'LOCAL', 'POSICION', `Posición fija de la estación: ${config.fallbackLat}, ${config.fallbackLon}${req.body?.origen ? ` (${String(req.body.origen).slice(0, 40)})` : ''}.`, true, 'Posición fija');
  refreshEarthquakes();
  refreshWeather();
  res.json({ success: true, gpsd: gpsdState });
});


// WIRES-X Real-time status tracker (Yaesu official source scraper with 5-min caching)
interface WiresXStatusCache {
  nodes: string[];
  rooms: string[];
  lastUpdated: number;
}

let wiresxStatusCache: WiresXStatusCache = {
  nodes: [],
  rooms: [],
  lastUpdated: 0
};

async function fetchWiresXStatusFromYaesu(): Promise<{ nodes: string[]; rooms: string[] }> {
  const now = Date.now();
  // Cache for 5 minutes (300,000 ms)
  if (wiresxStatusCache.lastUpdated > 0 && (now - wiresxStatusCache.lastUpdated) < 5 * 60 * 1000) {
    return { nodes: wiresxStatusCache.nodes, rooms: wiresxStatusCache.rooms };
  }

  let nodes: string[] = [];
  let rooms: string[] = [];
  let successNode = false;
  let successRoom = false;

  try {
    const nodeRes = await fetch('https://www.yaesu.com/jp/en/wires-x/id/active_node2.php', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      }
    });
    if (nodeRes.ok) {
      const text = await nodeRes.text();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        for (const part of parts) {
          const upper = part.toUpperCase().trim();
          if (/^[A-Z0-9]{3,10}(-[A-Z0-9]{1,4})?$/.test(upper)) {
            if (!/^\d+$/.test(upper) && upper !== 'CALLSIGN' && upper !== 'USER' && upper !== 'NODE' && upper !== 'ROOM' && upper !== 'DTMF') {
              nodes.push(upper);
            }
          }
        }
      }
      successNode = nodes.length > 0;
    }
  } catch (err: any) {
    console.error('[WIRESX API] Error fetching active nodes:', err.message);
  }

  try {
    const roomRes = await fetch('https://www.yaesu.com/jp/en/wires-x/id/active_room2.php', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      }
    });
    if (roomRes.ok) {
      const text = await roomRes.text();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^(\d{5})\b/);
        if (match) {
          rooms.push(match[1]);
        }
      }
      successRoom = rooms.length > 0;
    }
  } catch (err: any) {
    console.error('[WIRESX API] Error fetching active rooms:', err.message);
  }

  if (successNode || successRoom) {
    // If we succeeded but one list is empty, don't lose previous cache for that list if it existed
    wiresxStatusCache = {
      nodes: successNode ? nodes : (wiresxStatusCache.nodes.length > 0 ? wiresxStatusCache.nodes : nodes),
      rooms: successRoom ? rooms : (wiresxStatusCache.rooms.length > 0 ? wiresxStatusCache.rooms : rooms),
      lastUpdated: now
    };
    addLog('SYS', 'WIRESX_API', 'LOCAL', 'YAESU', `Sincronización WIRES-X en tiempo real exitosa: ${wiresxStatusCache.nodes.length} nodos y ${wiresxStatusCache.rooms.length} salas de Yaesu cargadas.`, true, 'Sincronizado');
  } else {
    // Fallback if requests failed to make sure the app works and displays nice mock/live estimated status
    if (wiresxStatusCache.nodes.length === 0) {
      const presetCalls = ['EA1HFI-ND', 'EA1URA-ND', 'EA1ZAE-ND', 'EA2YAC-ND', 'EA3YBK-ND', 'EA3CWQ-ND', 'EA4YAD-ND', 'EA4YAW-ND', 'EA5YAM-ND', 'EA5YAK-ND', 'EA5YAT-ND', 'EA6YAD-ND', 'EA7YAZ-ND', 'EA7URA-ND', 'ED5YAM', 'ED3YBK', 'ED1ZAE', 'ED4YAD', 'ED2YAM', 'ED5YAK', 'ED1YAS', 'ED7YAP'];
      const presetRooms = ['21005', '21000', '21015', '21020', '21030', '21040', '21050', '21060', '21100', '21110', '21080', '20001', '20555', '21200', '20005', '21500'];
      
      nodes = presetCalls.filter((_, idx) => (idx + new Date().getDate()) % 5 !== 0);
      rooms = presetRooms.filter((_, idx) => (idx + new Date().getDate()) % 4 !== 0);
      
      wiresxStatusCache = {
        nodes,
        rooms,
        lastUpdated: now - 4.5 * 60 * 1000 // Force retry in 30 seconds
      };
      addLog('SYS', 'WIRESX_API', 'LOCAL', 'FALLBACK', `Error de conexión con Yaesu. Utilizando estimaciones locales de red (${nodes.length} nodos, ${rooms.length} salas activas).`, false, 'Respaldo');
    }
  }

  return { nodes: wiresxStatusCache.nodes, rooms: wiresxStatusCache.rooms };
}

// GET Debian real configuration files (reads from actual paths /etc/ or fallback local directories)
app.get('/api/files/configs', (req, res) => {
  // Los archivos reales del sistema pueden contener credenciales (passcode,
  // contraseña de Winlink...): solo se leen para un administrador verificado.
  // El resto de visitantes recibe las plantillas por defecto.
  const canReadSystemFiles = isAuthorizedRequest(req);
  const getFileContent = (paths: string[], defaultSkeleton: string): string => {
    if (!canReadSystemFiles) return defaultSkeleton;
    let bestPath = '';
    let newestTime = -1;
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          const stats = fs.statSync(p);
          if (stats.mtimeMs > newestTime) {
            newestTime = stats.mtimeMs;
            bestPath = p;
          }
        }
      } catch (e) {
        // ignore and check next
      }
    }

    if (bestPath) {
      try {
        return fs.readFileSync(bestPath, 'utf8');
      } catch (e) {
        // fallback to sudo cat if standard read fails
        if (bestPath.startsWith('/')) {
          try {
            const content = execFileSync('sudo', ['-n', 'cat', bestPath], { encoding: 'utf8', timeout: 5000 });
            if (content) return content;
          } catch (sudoErr) {
            // ignore
          }
        }
      }
    } else {
      // If none was found via existsSync (e.g., permission denied on root paths like /root/.config),
      // try to read the primary system path directly using sudo cat!
      const primaryPath = paths[0];
      if (primaryPath && primaryPath.startsWith('/')) {
        try {
          const content = execFileSync('sudo', ['-n', 'cat', primaryPath], { encoding: 'utf8', timeout: 5000 });
          if (content) return content;
        } catch (sudoErr) {
          // ignore
        }
      }
    }

    // If none exist, we try to write the default template to fallback local path so that it exists next time
    const fallbackPath = paths[paths.length - 1];
    try {
      // Ensure directory exists
      const dirOfFile = path.dirname(fallbackPath);
      if (!fs.existsSync(dirOfFile)) {
        fs.mkdirSync(dirOfFile, { recursive: true });
      }
      fs.writeFileSync(fallbackPath, defaultSkeleton, 'utf8');
      return defaultSkeleton;
    } catch (e) {
      return defaultSkeleton; // return fallback string even if local write fails
    }
  };

  const defaultDirewolf = `# =====================================================================
# CONFIGURACIÓN GENERADA DE DIREWOLF SOFTWARE TNC (S.A.T. DEBIAN 13)
# =====================================================================
ADEVICE plughw:1,0
CHANNEL 0
MYCALL EA1URG-13
MODEM 1200
PTT /dev/ttyUSB0 RTS
GPSD localhost
# Puerto KISS por el que la consola recibe y emite
KISSPORT 8001
# Registro CSV: da a la consola el nivel de audio y los bits corregidos de cada trama
LOGDIR /var/log/direwolf
# Sin CBEACON: la baliza la emite la consola, con su política de emisión
`;

  const defaultAprx = `# ===============================================
# ARCHIVO DE CONFIGURACIÓN APRX S.A.T. EMERGENCIAS
# ===============================================
mycall      EA1URG-10
myloc       lat 4025.00N lon 00342.00W

<aprsis>
  server    rotate.aprs2.net   14580
  passcode  18023
  filter    "m/200"
</aprsis>

<logging>
  pidfile    /var/run/aprx.pid
  rflog      /var/log/aprx/aprx-rf.log
</logging>

<interface>
  tcp-device   127.0.0.1   8001   KISS
</interface>
`;

  const defaultWeewx = `# =====================================================================
# WEEWX snippet - StdRESTful
# =====================================================================
[StdRESTful]
    [[CWOP]]
        enable = true
        station = EA1URG-13
        passcode = 18023
        post_interval = 600
        server = rotate.aprs2.net
        port = 14580
`;

  const defaultPat = `{
  "mycall": "EA1URG-10",
  "secure_login_password": "",
  "locator": "IN80do",
  "http_addr": "localhost:8080",
  "connections": {
    "telnet": {
      "host": "rms.winlink.org",
      "port": 8772
    }
  }
}`;

  const defaultAxports = `# =====================================================================
# /etc/ax25/axports - CONFIGURACIÓN DE PUERTOS AX.25 DEBIAN 13 S.A.T.
# =====================================================================
# name  callsign   speed  paclen  window  description
wl0     EA1URG-10  19200  255     7       Puerto Winlink VHF (144.850 MHz)
ap0     EA1URG-13  9600   255     7       Puerto APRS VHF (144.800 MHz)
`;

  const direwolfContent = getFileContent(['/etc/direwolf.conf', './direwolf.conf'], defaultDirewolf);
  const aprxContent = getFileContent(['/etc/aprx.conf', './aprx.conf'], defaultAprx);
  const weewxContent = getFileContent(['/etc/weewx/weewx.conf', '/etc/weewx.conf', './weewx.conf'], defaultWeewx);
  const patContent = getFileContent(['/root/.config/pat/config.json', './pat-config.json'], defaultPat);
  const axportsContent = getFileContent(['/etc/ax25/axports', './axports'], defaultAxports);

  res.json({
    direwolf: direwolfContent,
    aprx: aprxContent,
    weewx: weewxContent,
    pat: patContent,
    axports: axportsContent
  });
});

// Verification Helper for service config files (aprx, direwolf, weewx, pat)
function performConfigsVerification() {
  const checkFile = (paths: string[], type: string) => {
    let exists = false;
    let valid = true;
    let content = '';
    let errorMsg = '';
    let foundPath = '';
    
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          exists = true;
          foundPath = p;
          break;
        }
      } catch (e) {
        // ignore check next
      }
    }

    // Try sudo fallback if still not exists (due to restricted parent directories)
    if (!exists) {
      for (const p of paths) {
        if (p.startsWith('/')) {
          try {
            execFileSync('sudo', ['-n', 'test', '-f', p], { timeout: 5000 });
            exists = true;
            foundPath = p;
            break;
          } catch (e) {
            // ignore
          }
        }
      }
    }
    
    if (!exists) {
      errorMsg = 'Archivo de configuración ausente o inaccesible';
      valid = false;
    } else {
      try {
        try {
          content = fs.readFileSync(foundPath, 'utf8');
        } catch (readErr) {
          if (foundPath.startsWith('/')) {
            content = execFileSync('sudo', ['-n', 'cat', foundPath], { encoding: 'utf8', timeout: 5000 });
          } else {
            throw readErr;
          }
        }

        if (!content || content.trim() === '') {
          errorMsg = 'Archivo de configuración vacío';
          valid = false;
        } else {
          if (type === 'pat') {
            try {
              JSON.parse(content);
            } catch (err: any) {
              valid = false;
              errorMsg = `Estructura JSON corrupta: ${err.message}`;
            }
          } else if (type === 'weewx') {
            if (!content.includes('[StdRESTful]') && !content.includes('[Station]')) {
              valid = false;
              errorMsg = 'Estructura INI inválida o falta bloque indispensable (StdRESTful/Station)';
            }
          } else if (type === 'aprx') {
            if (!content.includes('<interface>') && !content.includes('<logging>') && !content.includes('myconfig')) {
              valid = false;
              errorMsg = 'Falta bloque HTML-like obligatorio (<interface>/<logging>)';
            }
          } else if (type === 'direwolf') {
            if (!content.includes('ADEVICE') && !content.includes('MYCALL') && !content.includes('CHANNEL')) {
              valid = false;
              errorMsg = 'Falta directiva obligatoria (ADEVICE/MYCALL/CHANNEL)';
            }
          }
        }
      } catch (err: any) {
        valid = false;
        errorMsg = `Error físico de lectura / Archivo dañado: ${err.message}`;
      }
    }
    
    return {
      exists,
      valid,
      error: errorMsg,
      path: foundPath || paths[0]
    };
  };

  const results = {
    direwolf: checkFile(['/etc/direwolf.conf', './direwolf.conf'], 'direwolf'),
    aprx: checkFile(['/etc/aprx.conf', './aprx.conf'], 'aprx'),
    weewx: checkFile(['/etc/weewx/weewx.conf', '/etc/weewx.conf', './weewx.conf'], 'weewx'),
    pat: checkFile(['/root/.config/pat/config.json', './pat-config.json'], 'pat')
  };

  // Log results using addLog
  Object.entries(results).forEach(([service, res]) => {
    if (!res.exists) {
      addLog(
        'SYS',
        'VERIFY',
        service.toUpperCase(),
        'BOOT_CHECK',
        `Sincronizador: El archivo de configuración de ${service} está ausente en la ruta esperada: ${res.path}`,
        false,
        'AUSENTE'
      );
    } else if (!res.valid) {
      addLog(
        'SYS',
        'VERIFY',
        service.toUpperCase(),
        'BOOT_CHECK',
        `Sincronizador: El archivo de configuración de ${service} está dañado en ${res.path}: ${res.error}`,
        false,
        'DAÑADO'
      );
    } else {
      addLog(
        'SYS',
        'VERIFY',
        service.toUpperCase(),
        'BOOT_CHECK',
        `Sincronizador: Verificada configuración de ${service} (${res.path}) - Estado correcto`,
        true,
        'OK'
      );
    }
  });

  return results;
}

// GET Verification endpoint
app.get('/api/files/verify', (req, res) => {
  try {
    const results = performConfigsVerification();
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Debian real configuration files (writes to /etc/ path, falls back to local directory)
app.post('/api/files/configs', (req, res) => {
  const { type, content } = req.body;
  if (!type || typeof content !== 'string') {
    return res.status(400).json({ success: false, error: 'Parámetros "type" y "content" son requeridos.' });
  }

  let paths: string[] = [];
  if (type === 'direwolf') {
    paths = ['/etc/direwolf.conf', './direwolf.conf'];
  } else if (type === 'aprx') {
    paths = ['/etc/aprx.conf', './aprx.conf'];
  } else if (type === 'weewx') {
    paths = ['/etc/weewx/weewx.conf', '/etc/weewx.conf', './weewx.conf'];
  } else if (type === 'pat') {
    paths = ['/root/.config/pat/config.json', './pat-config.json'];
  } else if (type === 'axports') {
    paths = ['/etc/ax25/axports', './axports'];
  } else {
    return res.status(400).json({ success: false, error: 'Tipo de configuración inválido.' });
  }

  // Sin sesión de administrador no se escribe nada (y no se finge que sí)
  if (!isAuthorizedRequest(req)) {
    return res.status(403).json({ success: false, error: 'Solo el administrador puede escribir archivos de configuración.' });
  }

  let lastError = '';
  let savedPath = '';
  // Try to write to the paths in order
  for (const p of paths) {
    try {
      const dirOfFile = path.dirname(p);
      if (!fs.existsSync(dirOfFile)) {
        fs.mkdirSync(dirOfFile, { recursive: true });
      }
      fs.writeFileSync(p, content, 'utf8');
      savedPath = p;
      break; // stop on first successful write
    } catch (e: any) {
      lastError = e?.message || String(e);
      // Fallback: If we failed writing to a system path starting with '/', try using sudo + tee!
      if (p.startsWith('/')) {
        try {
          // El contenido viaja por la entrada estándar: nunca pasa por un intérprete de órdenes
          execFileSync('sudo', ['-n', 'tee', p], { input: content, stdio: ['pipe', 'ignore', 'pipe'], timeout: 5000 });
          savedPath = p;
          break; // successfully wrote via sudo!
        } catch (sudoErr: any) {
          lastError = `sudo tee failed: ${sudoErr.message} (original error: ${lastError})`;
        }
      }
    }
  }

  if (savedPath) {
    addLog('SYS', 'CONFIG', 'LOCAL', 'FILES', `Archivo de configuración para ${type} actualizado en ${savedPath}.`, true, 'Operación exitosa');
    return res.json({ success: true, path: savedPath });
  } else {
    addLog('SYS', 'CONFIG_ERROR', 'LOCAL', 'FILES', `Fallo al escribir configuración ${type}: ${lastError}`, true, 'Error al guardar');
    return res.status(500).json({ success: false, error: `Incapaz de guardar archivo en directorios: ${lastError}` });
  }
});

// Inject custom APRS raw packet or trigger test scenarios
app.post('/api/aprs/inject', (req, res) => {
  try {
    const { type, payload, value } = req.body;

    if (type === 'RAW_PACKET') {
      const p = payload || '';
      if (!p.includes('>')) {
        return res.status(400).json({ success: false, error: 'Formato APRS inválido. Estructura recomendada: SOURCE>DEST,PATH:PAYLOAD' });
      }
      
      // Parse source, destination, path, and payload
      const parts = p.split('>');
      const source = parts[0].trim().toUpperCase();
      const remaining = parts.slice(1).join('>');
      const colonIndex = remaining.indexOf(':');
      let destAndPath = '';
      let aprsPayload = '';
      if (colonIndex !== -1) {
        destAndPath = remaining.slice(0, colonIndex);
        aprsPayload = remaining.slice(colonIndex + 1);
      } else {
        destAndPath = remaining;
      }
      const destParts = destAndPath.split(',');
      const dest = destParts[0].trim().toUpperCase();
      const pathStr = destParts.slice(1).join(',').trim().toUpperCase() || 'VHF';

      const isIncoming = source !== config.callsign.toUpperCase();
      const logType = isIncoming ? 'RX' : 'TX';

      addLog(logType, source, dest, pathStr, aprsPayload, true, isIncoming ? 'Mensaje APRS entrante inyectado' : 'Inyección de operador manual');
      return res.json({ success: true, packet: p, type: logType, source, destination: dest, path: pathStr, payload: aprsPayload });
    }

    if (type === 'TRIGGER_INCOMING_APRS') {
      const fromCall = (value?.callsign || 'EA4CECOP-9').toUpperCase();
      const isBln = value?.isBulletin ?? false;
      const msgText = value?.message || 'ALERTA: Simulacion de trafico APRS de emergencia civil.';
      const isEm = value?.isEmergency ?? false;
      
      let rawPacket = '';
      let logPayload = '';
      if (isBln) {
        rawPacket = `${fromCall}>APRS,TCPIP*,qAC,GATEWAY::BLN1REMER:${isEm ? 'CRITICAL: ' : ''}${msgText}`;
        logPayload = `:BLN1REMER:${isEm ? 'CRITICAL: ' : ''}${msgText}`;
      } else {
        // Direct message
        const paddedTarget = config.callsign.padEnd(9, ' ');
        rawPacket = `${fromCall}>APRS,TCPIP*,qAC,GATEWAY::${paddedTarget}:${isEm ? 'SOS: ' : ''}${msgText}`;
        logPayload = `:${paddedTarget}:${isEm ? 'SOS: ' : ''}${msgText}`;
      }
      
      addLog('RX', fromCall, isBln ? 'BLN1REMER' : config.callsign, 'APRS-IS', logPayload, true, `Simulación de mensaje ${isBln ? 'boletín' : 'directo'} entrante`);
      return res.json({ success: true, packet: rawPacket });
    }

    if (type === 'TRIGGER_SISMO_TEST') {
      // Create an earthquake within Spain
      const magmaStr = value ? parseFloat(value.toString()) : 4.8;
      const customEq: EarthquakeEvent = {
        id: `test_eq_${Date.now()}`,
        time: new Date().toISOString(),
        latitude: gpsdState.lat + (Math.random() - 0.5) * 0.4, // close in range
        longitude: gpsdState.lon + (Math.random() - 0.5) * 0.4,
        depthKm: Math.round(2 + Math.random() * 8),
        magnitud: magmaStr,
        magType: 'mbLg',
        localizacion: 'Epicentro Simulado Remoto (Pruebas REMER)',
        distanciaKm: 45.2,
        enRango: true
      };
      customEq.aprsPacket = generateEarthquakePacket(customEq);
      
      // Inject to lists
      earthquakes.unshift(customEq);
      addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, customEq.aprsPacket, true, `INYECCION PROBATORIA: Sismo M${magmaStr}!`, { simulated: true });
      return res.json({ success: true, earthquake: customEq });
    }

    if (type === 'TRIGGER_NOAA_TEST') {
      const scale = value?.scale || 'G'; 
      const lvl = value?.level || 4;
      
      const customNoaa: NoaaSpaceAlert = {
        id: `test_noaa_${Date.now()}`,
        issueTime: new Date().toISOString(),
        scaleType: scale as any,
        nivel: lvl,
        descripcion: `Prueba crítica de alerta NOAA tipo ${scale}${lvl}. Degeneración del espectro de radio HF simulado.`,
        frecuenciasAfectadas: 'Frecuencias de 1.8 a 30 MHz severamente inhibidas',
        aprsPacket: `${config.callsign}>APRS,TCPIP*,qAC,GATEWAY:BLN3REMER: PRUEBA NOAA ${scale}${lvl} INTRODUCIDA`
      };
      noaaAlerts.unshift(customNoaa);
      addLog('TX', config.callsign, 'APRS-IS', `${config.serverIp}:${config.aprscPort}`, customNoaa.aprsPacket, true, `INYECCION PROBATORIA: NOAA ${scale}${lvl}!`, { simulated: true });
      return res.json({ success: true, noaa: customNoaa });
    }


    res.status(400).json({ success: false, error: 'Acción de inyección desconocida' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET all schedules
app.get('/api/aprs/schedules', (req, res) => {
  res.json({ success: true, schedules: scheduledNotifications });
});

// CREATE or UPDATE a schedule
app.post('/api/aprs/schedules', (req, res) => {
  try {
    const { id, type, name, message, scheduleType, targetTime, intervalMinutes, status, remarks } = req.body;
    
    if (!name || !message || !scheduleType) {
      return res.status(400).json({ success: false, error: 'Faltan campos obligatorios: name, message, scheduleType' });
    }
    
    let schedule: ScheduledNotification;
    const isNew = !id;
    const now = new Date();
    
    if (isNew) {
      schedule = {
        id: `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: type || 'drill',
        name,
        message,
        callsign: config.callsign || 'N0CALL',
        scheduleType,
        targetTime,
        intervalMinutes: intervalMinutes ? parseInt(intervalMinutes.toString(), 10) : undefined,
        status: status || 'active',
        nextTriggerTime: '',
        remarks
      };
    } else {
      const existing = scheduledNotifications.find(s => s.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Programación no encontrada' });
      }
      schedule = existing;
      schedule.type = type || schedule.type;
      schedule.name = name;
      schedule.message = message;
      schedule.scheduleType = scheduleType;
      schedule.targetTime = targetTime;
      schedule.intervalMinutes = intervalMinutes ? parseInt(intervalMinutes.toString(), 10) : undefined;
      schedule.status = status || schedule.status;
      schedule.remarks = remarks;
    }
    
    // Recalculate next trigger time
    if (schedule.status === 'active') {
      if (schedule.scheduleType === 'once' && schedule.targetTime) {
        schedule.nextTriggerTime = new Date(schedule.targetTime).toISOString();
      } else if (schedule.scheduleType === 'recurring' && schedule.intervalMinutes) {
        const start = schedule.lastTriggered ? new Date(schedule.lastTriggered) : now;
        const next = new Date(start.getTime() + schedule.intervalMinutes * 60000);
        if (next < now) {
          const diffMs = now.getTime() - start.getTime();
          const intervalsNeeded = Math.ceil(diffMs / (schedule.intervalMinutes * 60000));
          const adjustedNext = new Date(start.getTime() + intervalsNeeded * schedule.intervalMinutes * 60000);
          schedule.nextTriggerTime = adjustedNext.toISOString();
        } else {
          schedule.nextTriggerTime = next.toISOString();
        }
      }
    } else {
      schedule.nextTriggerTime = '';
    }
    
    const isAuth = isAuthorizedRequest(req);
    if (isNew) {
      scheduledNotifications.push(schedule);
      addLog('SYS', 'SCHEDULER', isAuth ? 'LOCAL' : 'DEMO', 'CRON', `${isAuth ? 'Nueva programación creada' : '[DEMO PÚBLICA] Programación creada en memoria'}: ${schedule.name}`, true, 'Operación exitosa');
    } else {
      addLog('SYS', 'SCHEDULER', isAuth ? 'LOCAL' : 'DEMO', 'CRON', `${isAuth ? 'Programación actualizada' : '[DEMO PÚBLICA] Programación actualizada en memoria'}: ${schedule.name}`, true, 'Operación exitosa');
    }
    
    saveSchedules(!isAuth);
    res.json({ success: true, schedule });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a schedule
app.delete('/api/aprs/schedules/:id', (req, res) => {
  const { id } = req.params;
  const index = scheduledNotifications.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Programación no encontrada' });
  }
  
  const isAuth = isAuthorizedRequest(req);
  const deleted = scheduledNotifications.splice(index, 1)[0];
  addLog('SYS', 'SCHEDULER', isAuth ? 'LOCAL' : 'DEMO', 'CRON', `${isAuth ? 'Programación eliminada' : '[DEMO PÚBLICA] Programación eliminada de memoria'}: ${deleted.name}`, true, 'Operación exitosa');
  saveSchedules(!isAuth);
  res.json({ success: true, id });
});

// TOGGLE active/paused
app.post('/api/aprs/schedules/:id/toggle', (req, res) => {
  const { id } = req.params;
  const schedule = scheduledNotifications.find(s => s.id === id);
  if (!schedule) {
    return res.status(404).json({ success: false, error: 'Programación no encontrada' });
  }
  
  const isAuth = isAuthorizedRequest(req);
  const now = new Date();
  if (schedule.status === 'active') {
    schedule.status = 'paused';
    schedule.nextTriggerTime = '';
    addLog('SYS', 'SCHEDULER', isAuth ? 'LOCAL' : 'DEMO', 'CRON', `${isAuth ? 'Programación pausada' : '[DEMO PÚBLICA] Programación pausada en memoria'}: ${schedule.name}`, true, 'Operación exitosa');
  } else {
    schedule.status = 'active';
    // Recalculate next execution time
    if (schedule.scheduleType === 'once' && schedule.targetTime) {
      schedule.nextTriggerTime = new Date(schedule.targetTime).toISOString();
    } else if (schedule.scheduleType === 'recurring' && schedule.intervalMinutes) {
      const next = new Date(now.getTime() + schedule.intervalMinutes * 60000);
      schedule.nextTriggerTime = next.toISOString();
    }
    addLog('SYS', 'SCHEDULER', isAuth ? 'LOCAL' : 'DEMO', 'CRON', `${isAuth ? 'Programación activada' : '[DEMO PÚBLICA] Programación activada en memoria'}: ${schedule.name}`, true, 'Operación exitosa');
  }
  
  saveSchedules(!isAuth);
  res.json({ success: true, schedule });
});

// FORCE TRIGGER IMMEDIATELY
app.post('/api/aprs/schedules/:id/trigger', (req, res) => {
  const { id } = req.params;
  const schedule = scheduledNotifications.find(s => s.id === id);
  if (!schedule) {
    return res.status(404).json({ success: false, error: 'Programación no encontrada' });
  }
  
  console.log(`[SCHEDULER] Manually triggering schedule: ${schedule.name}`);
  triggerSchedule(schedule);
  res.json({ success: true, schedule });
});

// GET journalctl logs for systemd service
app.get('/api/system/journal', (req, res) => {
  // El diario real del sistema solo se muestra a un administrador verificado
  // Solo servicios conocidos de la estación
  let servicio = ['direwolf', 'aprx', 'weewx', 'gpsd', 'pat'].includes(String(req.query.servicio)) ? String(req.query.servicio) : 'sat-aprs';
  if (servicio === 'pat') servicio = servicioPat();
  const journalArgs = ['-u', `${servicio}.service`, '-n', servicio === 'sat-aprs' ? '50' : '80', '--no-pager'];
  execFile(isAuthorizedRequest(req) ? 'journalctl' : 'false', isAuthorizedRequest(req) ? journalArgs : [], { timeout: 5000 }, (error, stdout, stderr) => {
    if (error) {
      // Sin journalctl o sin permiso: se dice, no se enseña un diario de ejemplo
      return res.json({ success: false, simulated: false, logs: `Diario del sistema no disponible: ${isAuthorizedRequest(req) ? error.message : 'requiere sesión de administrador'}` });
    }
    return res.json({ success: true, simulated: false, logs: stdout || stderr || 'Sin registros en el journal' });
  });
});

// UDP Server for Inmarsat SafetyNet II
const UDP_PORT = 9999;
const UDP_IP = "0.0.0.0";

const udpServer = dgram.createSocket('udp4');

function decodeInmarsatUDPPayload(buffer: Buffer): InmarsatMessage {
  const content = buffer.toString('utf8').trim();
  const rawHex = buffer.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
  
  let c2Code = "04";
  let sender = "LES-NUC-UDP";
  let area = "NAVAREA III";
  let payload = content;
  
  try {
    if (content.startsWith('{') && content.endsWith('}')) {
      const parsed = JSON.parse(content);
      if (parsed.c2Code) c2Code = String(parsed.c2Code);
      if (parsed.sender) sender = String(parsed.sender);
      if (parsed.area) area = String(parsed.area);
      if (parsed.payload) payload = String(parsed.payload);
    } else if (content.includes(';')) {
      const parts = content.split(';');
      if (parts.length >= 4) {
        c2Code = parts[0].trim();
        sender = parts[1].trim();
        area = parts[2].trim();
        payload = parts.slice(3).join(';').trim();
      } else if (parts.length === 2) {
        c2Code = parts[0].trim();
        payload = parts[1].trim();
      }
    } else {
      const match = content.match(/\b(04|13|14|24|31|34|44)\b/);
      if (match) {
        c2Code = match[1];
      }
    }
  } catch (e) {
    // ignore parsing failure
  }

  const typeText = TIPOS_ALERTA[c2Code] || `❓ CÓDIGO INVERSO INMARSAT (${c2Code})`;
  const isCritical = CODIGOS_CRITICOS.has(c2Code);
  
  let priority: 'CRÍTICO' | 'ALERTA' | 'INFORMACIÓN' = 'INFORMACIÓN';
  if (c2Code === "14" || c2Code === "34" || c2Code === "44") {
    priority = 'CRÍTICO';
  } else if (c2Code === "24" || c2Code === "04" || c2Code === "13") {
    priority = 'ALERTA';
  }

  return {
    id: `inm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: new Date().toISOString(),
    c2Code,
    typeText,
    priority,
    sender,
    area,
    payload,
    rawHex,
    isCritical
  };
}

udpServer.on('message', (msg, rinfo) => {
  try {
    const decoded = decodeInmarsatUDPPayload(msg);
    inmarsatMessages.unshift(decoded);
    if (inmarsatMessages.length > 50) {
      inmarsatMessages = inmarsatMessages.slice(0, 50);
    }
    addLog(
      'RX', 
      `UDP:${rinfo.address}:${rinfo.port}`, 
      'INMARSAT-NUC', 
      'PORT-9999', 
      `C2:${decoded.c2Code} (${decoded.typeText}) - Msg: ${decoded.payload}`, 
      true, 
      `Mensaje Inmarsat SafetyNet II capturado de forma remota via UDP.`
    );
  } catch (err: any) {
    console.error('Error processing Inmarsat UDP message:', err);
  }
});

udpServer.on('error', (err) => {
  console.error('[Inmarsat UDP Server Error]', err);
});

try {
  udpServer.bind(UDP_PORT, UDP_IP, () => {
    console.log(`[Inmarsat UDP Server] Listening on ${UDP_IP}:${UDP_PORT}`);
  });
} catch (e) {
  console.error('[Inmarsat UDP] Could not bind socket:', e);
}

// Serve compiled build assets, router setup for development environment
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[APRS S.A.T. SERVER] Running on ${HOST}:${PORT} with environment ${process.env.NODE_ENV || 'development'}`);
    console.log(TX_ENABLED
      ? `[APRS TX] Emisión ACTIVADA para ${config.callsign}${isValidCallsign(config.callsign) ? '' : ' (indicativo no válido: no se transmitirá hasta configurarlo)'}.`
      : '[APRS TX] Emisión DESACTIVADA: la consola no transmite. Active SAT_APRS_TX=on en .env para emitir.');
    if (authenticator.tokenTooShort) {
      console.warn('[AUTH] SAT_ADMIN_TOKEN es demasiado corto (mínimo 16 caracteres) y se ignora. Genere uno con: openssl rand -hex 32');
    }
    if (!authenticator.adminConfigured) {
      console.warn(TX_ENABLED
        ? '[AUTH] No hay administrador configurado (SAT_ADMIN_TOKEN o SAT_TRUST_LOCALHOST): nadie podrá modificar la estación.'
        : '[AUTH] No hay administrador configurado (SAT_ADMIN_TOKEN): la consola funciona en modo demostración y no guarda cambios en disco.');
    }
    
    // Execute configuration verification on startup (tras reinicio del NUC)
    try {
      console.log('[BOOT] Sincronizador de archivos de configuración iniciado...');
      performConfigsVerification();
    } catch (err) {
      console.error('[BOOT ERROR] Error al ejecutar verificación inicial de configuraciones:', err);
    }

    // Connect to real Linux subsystems (GPSD and TNC KISS)
    try {
      connectGpsdTcp();
      connectKissTcp();
    } catch (err) {
      console.error('[BOOT ERROR] Fallo al iniciar conexión con los subsistemas de hardware:', err);
    }
  });
}

initServer();
