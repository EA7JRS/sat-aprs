import { useState, useEffect } from 'react';
import { 
  CloudRain, Zap, Sun, Map, ShieldAlert, Cpu, Terminal, Clock,
  ExternalLink, Code, CheckCircle, RefreshCw, Key, HelpCircle, ArrowRight, Download, Server,
  AlertTriangle, Flame, Wind, Globe, Info, CloudSun, Thermometer, Droplets, Gauge, Compass,
  Volume2, VolumeX, Lightbulb, BellRing, Radio
} from 'lucide-react';
import { 
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, 
  ZAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, Legend
} from 'recharts';
import { TelemetryConfig } from '../../types';
import { getBeaufortInfoByKts, getBeaufortInfoByMs } from '../../utils/beaufort';

interface AemetOpenDataPortalProps {
  config: TelemetryConfig;
  onUpdateConfig: (newConfig: Partial<TelemetryConfig>) => Promise<boolean>;
  weather?: any;
  iqair?: any;
}

interface ProductType {
  id: string;
  name: string;
  category: 'Observación' | 'Predicción' | 'Satélite' | 'Climatología' | 'Modelos';
  endpoint: string;
  format: 'JSON' | 'XML' | 'GRIB2' | 'PNG';
  frequency: string;
  description: string;
  officialDocUrl: string;
}

const AEMET_CATALOG: ProductType[] = [
  {
    id: 'radar-nac',
    name: 'Radar Nacional (Reflectividad y Lluvia)',
    category: 'Observación',
    endpoint: '/api/prediccion/especifica/radar/nacional',
    format: 'JSON',
    frequency: 'Cada 10 min',
    description: 'Localización de ecos de precipitación líquida o sólida en la atmósfera sobre la península y archipiélagos.',
    officialDocUrl: 'https://opendata.aemet.es/centrodedescargas/productosAEMET?'
  },
  {
    id: 'rayos-nac',
    name: 'Mapa de Descargas Eléctricas (Rayos)',
    category: 'Observación',
    endpoint: '/api/red/rayos/mapa',
    format: 'JSON',
    frequency: 'Continuo',
    description: 'Coordenadas espaciales, polaridad y descarga inducida de impactos de rayos detectados por la red instrumental.',
    officialDocUrl: 'https://opendata.aemet.es/centrodedescargas/productosAEMET?'
  },
  {
    id: 'pred-mun',
    name: 'Predicción por Municipios de España',
    category: 'Predicción',
    endpoint: '/api/prediccion/especifica/municipio/diaria',
    format: 'JSON',
    frequency: 'Diaria (2 veces)',
    description: 'Temperaturas máximas/mínimas, humedad y estados del cielo esperados de los municipios consultados.',
    officialDocUrl: 'https://opendata.aemet.es/centrodedescargas/productosAEMET?'
  },
  {
    id: 'valores-clim',
    name: 'Climatología y Series Históricas',
    category: 'Climatología',
    endpoint: '/api/valores/climatologicos/mensualestacionales/datos',
    format: 'JSON',
    frequency: 'Mensual',
    description: 'Valores medios agregados, anomalías térmicas y régimen pluviométrico acumulado de las últimas décadas.',
    officialDocUrl: 'https://opendata.aemet.es/centrodedescargas/productosAEMET?'
  },
  {
    id: 'grib-harm',
    name: 'Modelo Numérico Harmonie-Arome 2.5km',
    category: 'Modelos',
    endpoint: '/api/modelos/prediccion/harmoniearome/grib',
    format: 'GRIB2',
    frequency: 'Cada 6 horas',
    description: 'Campos tridimensionales de presión, temperatura extrema, vorticidad y viento a escala de meso-alta resolución.',
    officialDocUrl: 'https://opendata.aemet.es/centrodedescargas/productosAEMET?'
  }
];

export default function AemetOpenDataPortal({ config, onUpdateConfig, weather, iqair }: AemetOpenDataPortalProps) {
  const [innerTab, setInnerTab] = useState<'observacion' | 'pronostico' | 'avisos' | 'boletines'>('observacion');
  
  // AEMET Descargas States
  const [selectedProduct, setSelectedProduct] = useState<ProductType>(AEMET_CATALOG[0]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [apiResult, setApiResult] = useState<any>(null);
  const [apiStatus, setApiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [scriptLanguage, setScriptLanguage] = useState<'curl' | 'node' | 'python'>('curl');
  
  // Local quick key configuration
  const [localKey, setLocalKey] = useState<string>(config.aemetApiKey || '');
  const [keySaveSuccess, setKeySaveSuccess] = useState<boolean>(false);
  const [keySaving, setKeySaving] = useState<boolean>(false);

  // Frame contingency status
  const [iframeErrorAemet, setIframeErrorAemet] = useState(false);
  const [iframeErrorMeteo, setIframeErrorMeteo] = useState(false);
  const [iframeErrorSinobas, setIframeErrorSinobas] = useState(false);
  const [activeExplainToken, setActiveExplainToken] = useState<string | null>(null);

  // Subtab internal navigation
  const [activeForecastCity, setActiveForecastCity] = useState<string>('Madrid');
  const [activeForecastSubtab, setActiveForecastSubtab] = useState<'municipios' | 'radar' | 'rayos'>('municipios');
  const [activeAvisosSubtab, setActiveAvisosSubtab] = useState<'aemet' | 'sinobas'>('aemet');
  const [activeBoletinesSubtab, setActiveBoletinesSubtab] = useState<'meteoalarm' | 'descargas'>('meteoalarm');

  // Weather Station emulation parameters
  const [backlightColor, setBacklightColor] = useState<'amber' | 'cyan' | 'green' | 'red'>('amber');
  const [tempAlarmLimit, setTempAlarmLimit] = useState<number>(35);
  const [windAlarmLimit, setWindAlarmLimit] = useState<number>(20);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Weather fallback logic
  const fallbackWeather = {
    tempC: 22.4,
    humidityPct: 45,
    windSpeedKts: 6.5,
    windDirDeg: 215,
    gustKts: 11.2,
    pressureHpa: 1016.2,
    rain1hIn: 0.0,
    rain24hIn: 0.0,
    rawAprsWx: "215/007g011t072r000p000h45b10162",
    time: new Date().toISOString()
  };

  const w = weather || fallbackWeather;
  const tempF = Math.round((w.tempC * 9/5) + 32);

  // Parse WX tokens for interactive translation
  const dirToken = w.windDirDeg.toString().padStart(3, '0');
  const speedToken = Math.round(w.windSpeedKts).toString().padStart(3, '0');
  const gustToken = `g${Math.round(w.gustKts || 0).toString().padStart(3, '0')}`;
  const tempToken = `t${tempF >= 0 ? tempF.toString().padStart(3, '0') : '-' + Math.abs(tempF).toString().padStart(2, '0')}`;
  const rain1hToken = `r${Math.round(w.rain1hIn * 100).toString().padStart(3, '0')}`;
  const rain24hToken = `p${Math.round(w.rain24hIn * 100).toString().padStart(3, '0')}`;
  let humVal = w.humidityPct;
  if (humVal === 100) humVal = 0;
  const humToken = `h${humVal.toString().padStart(2, '0')}`;
  const pressToken = `b${Math.round(w.pressureHpa * 10).toString().padStart(5, '0')}`;

  const tokens = [
    { code: '_', label: 'Estructura WX', desc: 'Define que el paquete es un informe de estación meteorológica sin posición dedicada.', color: 'text-pink-400' },
    { code: `${dirToken}/`, label: 'Viento (Dirección/Div)', desc: `Dirección de donde sopla el viento: ${w.windDirDeg}° (${getWindDirectionName(w.windDirDeg)}).`, color: 'text-red-400' },
    { code: speedToken, label: 'Viento (Velocidad)', desc: `Velocidad sostenida del viento: ${Math.round(w.windSpeedKts)} nudos (${(w.windSpeedKts * 1.852).toFixed(1)} km/h).`, color: 'text-amber-400' },
    { code: gustToken, label: 'Racha Máxima', desc: `Velocidad racha de viento máxima en los últimos 5 minutos: ${Math.round(w.gustKts)} nudos (${(w.gustKts * 1.852).toFixed(1)} km/h).`, color: 'text-yellow-400' },
    { code: tempToken, label: 'Temperatura', desc: `Temperatura ambiente en Fahrenheit: ${tempF}°F (Equivale a ${w.tempC.toFixed(1)}°C).`, color: 'text-orange-400' },
    { code: rain1hToken, label: 'Lluvia Crítica (1h)', desc: `Precipitaciones caídas en la última hora: ${w.rain1hIn.toFixed(2)} pulgadas (Equivale a ${(w.rain1hIn * 25.4).toFixed(1)} mm).`, color: 'text-blue-400' },
    { code: rain24hToken, label: 'Lluvia Semanal (24h)', desc: `Acumulado de lluvias en las últimas 24 horas: ${w.rain24hIn.toFixed(2)} pulgadas (Equivale a ${(w.rain24hIn * 25.4).toFixed(1)} mm).`, color: 'text-cyan-400' },
    { code: humToken, label: 'Humedad Relativa', desc: `Humedad atmosférica en porcentaje: ${w.humidityPct === 100 ? '100% (APRS codificado como h00)' : w.humidityPct + '%'}.`, color: 'text-indigo-400' },
    { code: pressToken, label: 'Presión Barométrica', desc: `Presión barométrica en décimas de hPa/mb: ${w.pressureHpa.toFixed(1)} hPa.`, color: 'text-violet-400' }
  ];

  function getWindDirectionName(deg: number): string {
    const d = deg % 360;
    if (d > 337.5 || d <= 22.5) return 'Norte (N)';
    if (d > 22.5 && d <= 67.5) return 'Nordeste (NE)';
    if (d > 67.5 && d <= 112.5) return 'Este (E)';
    if (d > 112.5 && d <= 157.5) return 'Sudeste (SE)';
    if (d > 157.5 && d <= 202.5) return 'Sur (S)';
    if (d > 202.5 && d <= 247.5) return 'Sudoeste (SO)';
    if (d > 247.5 && d <= 292.5) return 'Oeste (O)';
    return 'Noroeste (NO)';
  }

  function getAqiCategory(aqi: number) {
    if (aqi <= 50) return { label: 'Excelente', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20', desc: 'Calidad del aire satisfactoria, riesgo casi nulo.' };
    if (aqi <= 100) return { label: 'Moderado', color: 'text-amber-400 border-amber-500/40 bg-amber-950/20', desc: 'Aceptable, pero con posibles efectos en personas hipersensibles.' };
    if (aqi <= 150) return { label: 'No Saludable (Sensibles)', color: 'text-orange-400 border-orange-500/40 bg-orange-950/20', desc: 'Grupos sensibles pueden experimentar problemas de salud.' };
    if (aqi <= 200) return { label: 'Dañino para la Salud', color: 'text-red-400 border-red-500/40 bg-red-950/30', desc: 'Los miembros de la población general pueden experimentar efectos nocivos.' };
    return { label: 'Peligroso', color: 'text-purple-400 border-purple-500/40 bg-purple-950/30', desc: 'Advertencia de salud extrema para toda la población civil.' };
  }

  useEffect(() => {
    setLocalKey(config.aemetApiKey || '');
  }, [config.aemetApiKey]);

  // Handle live fetch from server
  const handleFetchProduct = async (product: ProductType) => {
    setIsFetching(true);
    setApiStatus('idle');
    try {
      const response = await customFetch(`/api/aemet/request?endpoint=${encodeURIComponent(product.endpoint)}`);
      if (response.ok) {
        const body = await response.json();
        setApiResult(body);
        setApiStatus('success');
      } else {
        setApiStatus('error');
        setApiResult({ error: `La API del servidor retornó código de estado: ${response.status}` });
      }
    } catch (err: any) {
      setApiStatus('error');
      setApiResult({ error: err.message || 'Error de comunicación de red' });
    } finally {
      setIsFetching(false);
    }
  };

  const handleSaveKey = async () => {
    setKeySaving(true);
    setKeySaveSuccess(false);
    try {
      const ok = await onUpdateConfig({ aemetApiKey: localKey.trim() });
      if (ok) {
        setKeySaveSuccess(true);
        setTimeout(() => setKeySaveSuccess(false), 3050);
      }
    } catch (err) {}
    finally {
      setKeySaving(false);
    }
  };

  // Generate dynamic client script to demonstrate integration
  const getScriptCode = () => {
    const key = config.aemetApiKey ? config.aemetApiKey : 'TU_CLAVE_AEMET';
    
    if (scriptLanguage === 'curl') {
      return `# Descarga directa del producto AEMET usando CURL
curl -X GET "https://opendata.aemet.es/opendata${selectedProduct.endpoint}" \\
     -H "accept: application/json" \\
     -H "api_key: ${key}"`;
    }
    
    if (scriptLanguage === 'node') {
      return `// Integración oficial en Node.js usando fetch (ESM)
import fetch from 'node-fetch';

const AEMET_KEY = '${key}';
const ENDPOINT = '${selectedProduct.endpoint}';

async function descargarProductoAEMET() {
  try {
    // 1. Solicitar el puntero temporal de datos (Wrapper)
    const response = await customFetch(\`https://opendata.aemet.es/opendata\${ENDPOINT}?api_key=\${AEMET_KEY}\`, {
      headers: { 'accept': 'application/json' }
    });
    
    if (!response.ok) throw new Error('Error solicitando wrapper de descarga');
    const wrapper = await response.json();
    
    if (wrapper.estado === 200 && wrapper.datos) {
      console.log('Descargando archivo final desde: ', wrapper.datos);
      
      // 2. Descargar los datos binarios o JSON de los servidores de almacenamiento
      const dataRes = await customFetch(wrapper.datos);
      const data = await dataRes.json();
      console.log('Datos oficiales descargados con éxito:', data);
    } else {
      console.error('Código AEMET:', wrapper.estado, wrapper.descripcion);
    }
  } catch (err) {
    console.error('Error de red de AEMET:', err.message);
  }
}

descargarProductoAEMET();`;
    }

    // Python fallback
    return `# Descarga oficial de productos AEMET en Python (requests)
import requests

AEMET_KEY = '${key}'
ENDPOINT = '${selectedProduct.endpoint}'
url = f"https://opendata.aemet.es/opendata{ENDPOINT}"

headers = {
    'accept': 'application/json',
    'api_key': AEMET_KEY
}

try:
    # 1. Hacemos consulta al índice del producto
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    wrapper = response.json()
    
    if wrapper.get("estado") == 200 and wrapper.get("datos"):
        # 2. Descargamos el producto final desde el almacén de AEMET
        print("Obteniendo datos finales de:", wrapper["datos"])
        final_res = requests.get(wrapper["datos"])
        final_data = final_res.json()
        print("Éxito. Contiene:", list(final_data.keys()))
    else:
        print("Error devuelto por servidor:", wrapper.get("descripcion"))
except Exception as e:
    print("Fallo de comunicación con AEMET OpenData:", e)`;
  };

  return (
    <div className="flex flex-col gap-4 font-mono text-xs" id="tiempo-workspace-portal">
      
      {/* HEADER BANNER AREA */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 max-w-4xl">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-sky-950/40 border border-sky-400/30 text-sky-450 font-bold rounded text-[10px] uppercase">
              Consola Meteorológica REMER / IARU
            </div>
            <span className="text-[10px] text-slate-500 font-mono">• PORTAL DE TIEMPO Y ADVERTENCIAS</span>
          </div>
          
          <h1 className="font-sans font-extrabold text-lg text-slate-100 tracking-tight flex items-center gap-2">
            <CloudRain className="text-sky-400 animate-pulse" size={18} />
            Ecosistema Unificado de Tiempo y Alertas Climatológicas
          </h1>
          
          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Consola integrada para la vigilancia del clima adverso y la gestión del riesgo. Agrupa observaciones de telemetría local, predicciones detalladas por municipios, descarga de productos en la consola <strong className="text-slate-200">AEMET OpenData</strong> y planos de avisos estatales y transfronterizos.
          </p>
        </div>

        {/* METEO SUBTAB TRIGGERS */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg shrink-0 gap-1 self-start md:self-auto flex-wrap">
          <button
            onClick={() => setInnerTab('observacion')}
            className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
              innerTab === 'observacion'
                ? 'bg-sky-400 text-slate-950 shadow-md animate-none'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <CloudSun size={13} className="text-amber-400" />
            Observación actual
          </button>
          <button
            onClick={() => setInnerTab('pronostico')}
            className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
              innerTab === 'pronostico'
                ? 'bg-sky-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Sun size={13} className="text-yellow-400" />
            Pronóstico
          </button>
          <button
            onClick={() => setInnerTab('avisos')}
            className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
              innerTab === 'avisos'
                ? 'bg-sky-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <AlertTriangle size={13} className="text-orange-400" />
            Avisos y Alertas
          </button>
          <button
            onClick={() => setInnerTab('boletines')}
            className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
              innerTab === 'boletines'
                ? 'bg-sky-400 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Server size={13} className="text-sky-400" />
            Boletines y Descargas
          </button>
        </div>

        {/* SUBTAB BAR FOR AVISOS OR BOLETINES */}
        {innerTab === 'avisos' && (
          <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-lg shrink-0 gap-1 self-start mt-2 border-l-2 border-l-amber-500 font-sans max-w-sm">
            <button
              onClick={() => setActiveAvisosSubtab('aemet')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                activeAvisosSubtab === 'aemet'
                  ? 'bg-amber-550 bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle size={11} />
              Meteoalerta España
            </button>
            <button
              onClick={() => setActiveAvisosSubtab('sinobas')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                activeAvisosSubtab === 'sinobas'
                  ? 'bg-amber-550 bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap size={11} className="text-amber-950" />
              Notificaciones SINOBAS
            </button>
          </div>
        )}

        {innerTab === 'boletines' && (
          <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-lg shrink-0 gap-1 self-start mt-2 border-l-2 border-l-sky-500 font-sans max-w-sm">
            <button
              onClick={() => setActiveBoletinesSubtab('meteoalarm')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                activeBoletinesSubtab === 'meteoalarm'
                  ? 'bg-sky-450 bg-sky-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe size={11} />
              Meteoalarm Paneuropeo
            </button>
            <button
              onClick={() => setActiveBoletinesSubtab('descargas')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                activeBoletinesSubtab === 'descargas'
                  ? 'bg-sky-450 bg-sky-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server size={11} />
              Descargas y API Sandbox
            </button>
          </div>
        )}
      </div>

      {/* RENDER ACTIVE TAB */}
      {innerTab === 'boletines' && activeBoletinesSubtab === 'descargas' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4" id="aemet-descargas-view">
          {/* LEFTSIDE BAR: SECRET KEYS + CATALOG SELECTOR */}
          <div className="xl:col-span-1 flex flex-col gap-4">
            
            {/* Key configurator inside */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-3 shadow-md" id="aemet-keys-panel">
              <h3 className="font-sans font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <Key size={14} className="text-sky-400" />
                Credenciales de Acceso AEMET
              </h3>
              
              <p className="text-[11px] text-slate-400 leading-normal font-serif">
                AEMET OpenData requiere que ingrese su API Key (Passcode de desarrollador). Si no dispone de ella, el sistema utilizará un <strong>puerto de contingencia simulado (espejo)</strong> que replica exactamente las estructuras JSON emitidas por los sensores meteorológicos nacionales.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 block font-sans">API Key / Token de AEMET OpenData:</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                    placeholder="Introduzca su API Key de AEMET OpenData..."
                    className="flex-1 bg-slate-900 border border-slate-800 px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                  />
                  <button
                    onClick={handleSaveKey}
                    disabled={keySaving}
                    className="px-3 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-500/30 font-sans font-bold rounded hover:text-white transition-all cursor-pointer"
                    title="Guardar credenciales en la configuración modular"
                  >
                    {keySaving ? '...' : 'Guardar'}
                  </button>
                </div>
                
                {keySaveSuccess && (
                  <div className="p-2 py-1.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 rounded text-[10px] flex items-center gap-1.5 animate-pulse">
                    <CheckCircle size={12} />
                    <span>Configuración actualizada con éxito.</span>
                  </div>
                )}
              </div>
            </div>

            {/* PRODUCT DIRECTORY SELECTOR */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <h3 className="font-sans font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <Server size={14} className="text-sky-400" />
                Directorio de Productos AEMET
              </h3>

              <div className="flex flex-col gap-1.5">
                {AEMET_CATALOG.map((prod) => {
                  const isSelected = selectedProduct.id === prod.id;
                  return (
                    <button
                      key={prod.id}
                      onClick={() => {
                        setSelectedProduct(prod);
                        setApiResult(null);
                        setApiStatus('idle');
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                        isSelected 
                          ? 'bg-sky-950/20 border-sky-400/40 text-sky-200'
                          : 'bg-slate-900/60 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {prod.category === 'Observación' && <CloudRain size={13} className="text-cyan-400" />}
                        {prod.category === 'Predicción' && <Sun size={13} className="text-amber-400" />}
                        {prod.category === 'Satélite' && <Map size={13} className="text-purple-400" />}
                        {prod.category === 'Climatología' && <Terminal size={13} className="text-emerald-400" />}
                        {prod.category === 'Modelos' && <Cpu size={13} className="text-rose-400" />}
                      </div>

                      <div className="space-y-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-sans font-extrabold text-[11px] leading-tight text-slate-100">{prod.name}</span>
                          <span className="px-1.5 py-0.2 select-none text-[8px] bg-slate-950 text-slate-400 rounded-sm font-mono uppercase">
                            {prod.format}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-500 block">Frecuencia: {prod.frequency}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* RIGHTSIDE WORKSPACE: PRODUCT LIVE PREVIEW + CODING GENERATOR */}
          <div className="xl:col-span-2 flex flex-col gap-4">
            
            {/* PRODUCT META WORKSPACE */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400 font-bold uppercase text-[9px]">
                      {selectedProduct.category}
                    </span>
                    <span className="text-[10px] text-slate-500">Endpoint: {selectedProduct.endpoint}</span>
                  </div>
                  <h2 className="font-sans font-bold text-sm text-slate-100">
                    {selectedProduct.name}
                  </h2>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleFetchProduct(selectedProduct)}
                    disabled={isFetching}
                    className="px-4 py-2 bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-400/30 hover:border-sky-400/50 rounded-lg font-sans font-bold text-[10px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                    <span>{isFetching ? 'Descargando...' : 'Descargar Producto'}</span>
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal font-sans">
                {selectedProduct.description} El archivo oficial se almacena para evitar peticiones redundantes. Puede consultar el gráfico y previsualizar de forma unificada su contenido técnico abajo.
              </p>

              {/* IF PREVIEW IS READY, CHOOSE APPROPRIATE RENDERER */}
              {apiStatus === 'success' && apiResult && (
                <div className="space-y-4">
                  
                  {/* Visualizer header indicating whether real or simulated */}
                  <div className={`p-3 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    apiResult.isSimulated 
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-300' 
                      : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={14} />
                      <div className="text-[10px] font-mono leading-tight">
                        <strong>
                          {apiResult.isSimulated 
                            ? 'MECANISMO DE SIMULACIÓN ACTIVO (Fallback de Contingencia)' 
                            : 'INTEGRACIÓN OFICIAL REAL DE APIS DE ESPAÑA (AEMET OpenData)'
                          }
                        </strong>
                        <span className="block mt-0.5 text-slate-400 text-[9px]">
                          Servidor de origen: {apiResult.isSimulated ? 'REMER AI Simulation Node' : (apiResult.wrapper?.metadatos || 'aemet-opendata-storage')}
                        </span>
                      </div>
                    </div>
                    
                    {apiResult.isSimulated && (
                      <span className="text-[8px] bg-amber-950 px-2 py-0.5 border border-amber-500/30 text-amber-400 rounded uppercase font-bold font-mono">
                        Contingencia
                      </span>
                    )}
                  </div>

                  {/* GRAPHICAL/CHART RENDERING OF SEPARATE DATA TYPES */}
                  {selectedProduct.id === 'radar-nac' && apiResult.data?.ecos && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] text-slate-200 font-bold font-sans">
                        📟 VISUALIZACIÓN GRÁFICA DE REFLECTIVIDAD EN DETECCIÓN (dbZ):
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2 bg-slate-900/60 border border-slate-900 rounded-lg p-3 h-[250px]">
                          <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                            <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis 
                                type="number" 
                                dataKey="lon" 
                                name="Longitud" 
                                unit="°" 
                                domain={[-10, 4]} 
                                stroke="#64748b" 
                                fontSize={9}
                              />
                              <YAxis 
                                type="number" 
                                dataKey="lat" 
                                name="Latitud" 
                                unit="°" 
                                domain={[35, 44]} 
                                stroke="#64748b" 
                                fontSize={9}
                              />
                              <ZAxis type="number" dataKey="dbz" range={[50, 400]} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }}
                              />
                              <Scatter name="Ecos Sísmicos" data={apiResult.data.ecos} fill="#38bdf8">
                                {apiResult.data.ecos.map((entry: any, index: number) => {
                                  let c = '#0284c7'; // weak
                                  if (entry.dbz > 45) c = '#ef4444'; // intense
                                  else if (entry.dbz > 30) c = '#f59e0b'; // mod
                                  return <Cell key={`cell-${index}`} fill={c} />;
                                })}
                              </Scatter>
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="bg-slate-900 p-3.5 border border-slate-900 rounded-lg flex flex-col justify-between">
                          <div className="space-y-2">
                            <span className="text-[9px] text-slate-500 block uppercase font-bold">Estado Atmosférico</span>
                            <span className="text-xs text-slate-100 font-sans font-bold leading-snug">
                              {apiResult.data.avisoRadar || 'Estable.'}
                            </span>
                            <div className="pt-2 border-t border-slate-900 space-y-1.5 text-[10px] text-slate-400">
                              <div>• Total ecos procesados: <strong>{apiResult.data.ecos.length}</strong></div>
                              <div>• Reflectividad máx: <strong>55 dBZ</strong></div>
                              <div>• Unidad sismométrica: <strong>Z = a * R^b</strong></div>
                            </div>
                          </div>

                          <div className="p-2 bg-slate-950 border border-slate-800 rounded font-mono text-[9px] text-slate-500">
                            🔴 Leyenda: Rojo &gt; 45dBZ (Muy Fuerte), Amarillo &gt; 30dBZ (Chubascos), Azul &lt; 30dBZ (Débil)
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedProduct.id === 'rayos-nac' && apiResult.data?.descargas && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] text-slate-200 font-bold font-sans">
                        ⚡ POLARIDAD Y CORRIENTES DE ACCIÓN DE CARGA (Kiloamperios):
                      </h4>

                      <div className="bg-slate-900/60 border border-slate-900 rounded-lg p-3 h-[200px]">
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <BarChart data={apiResult.data.descargas.slice(0, 15)} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                            <XAxis 
                              dataKey="id" 
                              tick={false}
                              stroke="#475569" 
                            />
                            <YAxis 
                              stroke="#475569" 
                              fontSize={9} 
                              fontFamily="monospace"
                              name="kA"
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '9px', fontFamily: 'monospace' }}
                            />
                            <Bar dataKey="corrienteKa" name="Amperaje (kA)" fill="#fbbf24">
                              {apiResult.data.descargas.map((entry: any, index: number) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.polaridad.includes('POS') ? '#ef4444' : '#fbbf24'} 
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <p className="text-[9px] text-slate-400 leading-normal">
                        ℹ️ El amperaje de la descarga cuantifica los voltios volcados a tierra firme de la península. Los rayos de polaridad positiva (+) acarrean densidades amperimétricas cinco veces mayores, peligrosas para antenas de telecomunicación REMER.
                      </p>
                    </div>
                  )}

                  {selectedProduct.id === 'pred-mun' && apiResult.data?.ciudades && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] text-slate-200 font-bold font-sans">
                        ☀️ TEMPERATURAS MÁXIMAS Y MÍNIMAS DE LAS MIGRACIONES LOCALES:
                      </h4>

                      <div className="bg-slate-900/60 border border-slate-900 rounded-lg p-3 h-[220px]">
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <BarChart data={apiResult.data.ciudades} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <XAxis 
                              dataKey="name" 
                              stroke="#475569" 
                              fontSize={10} 
                              fontFamily="monospace"
                            />
                            <YAxis 
                              stroke="#475569" 
                              fontSize={9} 
                              fontFamily="monospace"
                              unit="°C"
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '10px', fontFamily: 'monospace' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '9px' }} />
                            <Bar dataKey="minimaEsperadaC" name="Temp Mínima (°C)" fill="#60a5fa" />
                            <Bar dataKey="maximaEsperadaC" name="Temp Máxima (°C)" fill="#f87171" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* GENERAL FILE PREVIEW */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold flex items-center gap-1 font-sans text-slate-300">
                        <Terminal size={12} className="text-sky-400" />
                        Visualización de Datos Crudos (Payload JSON):
                      </span>
                      <button 
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(apiResult, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `aemet_${selectedProduct.id}_export.json`;
                          a.click();
                        }}
                        className="text-sky-300 hover:text-white flex items-center gap-1 cursor-pointer font-sans"
                        title="Exportar como archivo de texto JSON"
                      >
                        <Download size={11} />
                        Exportar JSON
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-900 rounded-lg text-[10px] text-[#38bdf8] overflow-auto max-h-[160px] border border-slate-900 leading-normal font-mono scrollbar-thin">
                      {JSON.stringify(apiResult.data || apiResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {apiStatus === 'error' && (
                <div className="p-4 bg-rose-950/30 border border-rose-500/30 text-rose-300 rounded-lg space-y-1">
                  <div className="font-sans font-bold flex items-center gap-1.5 text-xs text-rose-200">
                    <ShieldAlert size={15} />
                    Fallo en la descarga modular de AEMET OpenData
                  </div>
                  <p className="text-[11px] font-sans">
                    {apiResult?.error || 'No se pudo conectar con el proxy o el token ha sido rechazado.'} El sistema se ha replegado a buffers locales. Compruebe su API Key.
                  </p>
                </div>
              )}

              {apiStatus === 'idle' && !isFetching && (
                <div className="p-8 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center text-center gap-2.5">
                  <div className="p-3.5 bg-slate-900 rounded-full text-slate-500">
                    <CloudRain size={24} />
                  </div>
                  <div className="space-y-1 max-w-md">
                    <h4 className="font-sans font-bold text-slate-300">Descarga y depuración de JSON</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      Seleccione un recurso disponible en la barra izquierda y pinche en <strong>Descargar Producto</strong> para mandar la petición HTTP real de sincronización.
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* SCRIPT EXPORTER */}
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 shadow-md" id="aemet-exporter-script">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-900 pb-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider block">Scripting y Automatización</span>
                  <h3 className="font-sans font-bold text-xs text-slate-200">Canal de Configuración y Descargas Automáticas</h3>
                </div>

                {/* Selector de lenguajes */}
                <div className="flex bg-slate-900 border border-slate-800 rounded p-0.5">
                  {['curl', 'node', 'python'].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setScriptLanguage(lang as any)}
                      className={`px-2.5 py-1 rounded text-[9px] font-bold font-sans cursor-pointer uppercase ${
                        scriptLanguage === lang ? 'bg-sky-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal font-sans">
                Para extraer este producto de forma automatizada mediante cronjobs y tareas de bajo nivel de protección civil en terminales Debian, ejecute el siguiente código. Se adaptará automáticamente con su API key guardada arriba:
              </p>

              <div className="relative">
                <pre className="p-3.5 bg-slate-900 border border-slate-900 rounded-lg text-[10px] text-slate-300 overflow-x-auto font-mono leading-relaxed select-all">
                  {getScriptCode()}
                </pre>
                <div className="absolute right-3.5 top-3.5 p-1 px-2.5 bg-slate-950/80 rounded border border-slate-800 text-[8px] font-sans text-slate-400 select-none">
                  {scriptLanguage === 'curl' ? 'BASH' : scriptLanguage === 'node' ? 'JS (ESM)' : 'PYTHON 3'}
                </div>
              </div>
              
              <div className="text-[9px] text-slate-500 bg-slate-900/30 p-2.5 rounded border border-slate-900 flex items-center gap-2">
                <Code size={13} className="text-sky-500 shrink-0" />
                <span className="font-sans">
                  <strong>Nota:</strong> Este código realiza la doble validación de redirección requerida por el estándar de la Administración de España.
                </span>
              </div>

            </div>

          </div>
        </div>
      )}

      {innerTab === 'avisos' && activeAvisosSubtab === 'aemet' && (
        <div className="flex flex-col gap-4" id="aemet-avisos-view">
          {/* QUICK EXPLANATORY ROW */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            
            <div className="md:col-span-8 bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <h3 className="font-sans font-bold text-slate-200 uppercase text-xs flex items-center gap-1.5">
                  <AlertTriangle className="text-amber-500" size={15} />
                  Avisos Meteorológicos Activos en España (AEMET)
                </h3>
                <span className="text-[10px] text-slate-500 font-sans">Plan de Meteoalerta Nacional</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                La AEMET emite avisos meteorológicos categorizados en cuatro niveles de riesgo técnico. Estos avisos determinan el nivel de respuesta logística y telecomunicaciones de emergencia que REMER y Protección Civil activan sobre los municipios de la península y las islas.
              </p>

              {/* GRID OF RISK LEVELS DETAIL */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="p-3 rounded-lg bg-[#064e3b]/30 border border-emerald-500/20 text-emerald-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Verde (Nivel 0)</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Sin riesgo meteorológico relevante. Actividad normal.</div>
                </div>
                <div className="p-3 rounded-lg bg-[#78350f]/30 border border-yellow-500/20 text-yellow-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Amarillo (Nivel 1)</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Sin riesgo general para la población, pero sí para actividades concretas.</div>
                </div>
                <div className="p-3 rounded-lg bg-[#7c2d12]/30 border border-orange-500/20 text-orange-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Naranja (Nivel 2)</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Riesgo importante por fenómenos climáticos poco habituales.</div>
                </div>
                <div className="p-3 rounded-lg bg-[#7f1d1d]/30 border border-red-500/20 text-red-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Rojo (Nivel 3)</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Riesgo extremo. Peligro extraordinario para la población civil.</div>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-3.5 flex flex-col justify-between">
              <div>
                <h4 className="font-sans font-bold text-slate-200 text-xs uppercase border-b border-slate-900 pb-2 mb-2">
                  Enlaces del Plan de Avisos
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Use estas referencias externas en caso de requerir acceso directo y libre al mapa de avisos interactivos en el campo de acción de emergencias.
                </p>
              </div>

              <div className="space-y-2">
                <a 
                  href="https://www.aemet.es/es/eltiempo/prediccion/avisos" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-sky-400 hover:text-sky-300 font-sans font-bold rounded flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Predicción de Avisos Oficial</span>
                </a>
                <a 
                  href="https://opendata.aemet.es" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 font-sans font-bold rounded flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer"
                >
                  <Server size={12} />
                  <span>Consola AEMET OpenData</span>
                </a>
              </div>
            </div>

          </div>

          {/* IFRAME EMBED PORTLET */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                <h3 className="font-sans font-extrabold text-[11.5px] uppercase tracking-wider text-slate-200">
                  Visor Oficial Integrado: Predicción de Avisos Meteorológicos AEMET
                </h3>
              </div>
              <button
                onClick={() => setIframeErrorAemet(!iframeErrorAemet)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[9px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                Carga de Contingencia: {iframeErrorAemet ? 'Remoto' : 'Muestra Iframe'}
              </button>
            </div>

            {iframeErrorAemet ? (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 text-center text-slate-400 space-y-4">
                <Info size={32} className="mx-auto text-amber-500/80" />
                <div className="max-w-md mx-auto space-y-2">
                  <h4 className="text-slate-200 text-xs font-sans font-bold uppercase">Restricción de Marco del Portal AEMET Detectada</h4>
                  <p className="text-[11px] leading-relaxed font-sans text-slate-400">
                    Las políticas gubernamentales de seguridad <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-400 text-[10px]">X-Frame-Options: SAMEORIGIN</code> impiden la carga interactiva directa en algunos motores de renderizado. Pulse el enlace de apoyo a continuación.
                  </p>
                </div>
                <a
                  href="https://www.aemet.es/es/eltiempo/prediccion/avisos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-slate-950 font-sans font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>Abrir Mapa de Avisos AEMET</span>
                </a>
              </div>
            ) : (
              <div className="relative border border-slate-800 rounded-lg overflow-hidden h-[450px] bg-slate-900 flex flex-col justify-between">
                <iframe 
                  src="https://www.aemet.es/es/eltiempo/prediccion/avisos" 
                  className="w-full h-full border-none bg-white font-sans text-xs"
                  title="AEMET Mapas de Prediccion de Avisos"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  onError={() => setIframeErrorAemet(true)}
                />
                <div className="absolute bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-900 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-sans">
                    <Info size={13} className="text-sky-400 shrink-0" />
                    <span>Navegación en vivo de alertas estatales de meteorología. Use el botón adyacente para evadir bloqueos frame-ancestors.</span>
                  </div>
                  <a 
                    href="https://www.aemet.es/es/eltiempo/prediccion/avisos" 
                    target="_blank"  
                    rel="noreferrer" 
                    className="px-2.5 py-1 bg-sky-950 hover:bg-sky-900 border border-sky-450/40 text-sky-200 hover:text-sky-100 text-[10px] font-sans font-bold rounded flex items-center justify-center gap-1 transition shrink-0 cursor-pointer"
                  >
                    <span>Abrir en Nueva Pestaña</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {innerTab === 'boletines' && activeBoletinesSubtab === 'meteoalarm' && (
        <div className="flex flex-col gap-4" id="meteoalarm-view">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <h3 className="font-sans font-bold text-slate-200 uppercase text-xs flex items-center gap-1.5">
                  <Globe className="text-sky-400" size={15} />
                  Alerta Europea Unificada: Meteoalarm Live
                </h3>
                <span className="text-[10px] text-slate-500 font-sans">Eumetnet Alert Warning Network</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Meteoalarm unifica toda la información de clima severo generada por las agencias meteorológicas nacionales de más de 30 países de Europa. Ideal para coordinación transfronteriza y activación de radioenlaces de emergencia.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-900/50 rounded-lg border border-slate-900 space-y-1">
                  <Flame size={16} className="text-orange-400" />
                  <h4 className="font-bold text-[11px] text-slate-200 uppercase font-sans">Temperaturas Extremas</h4>
                  <p className="text-[10px] text-slate-500 leading-normal font-sans">Olas de calor persistentes o heladas severas que ponen en riesgo la salud y la infraestructura civil.</p>
                </div>
                <div className="p-3.5 bg-slate-900/50 rounded-lg border border-slate-900 space-y-1">
                  <Wind size={16} className="text-sky-300" />
                  <h4 className="font-bold text-[11px] text-slate-200 uppercase font-sans">Vientos y Ciclones</h4>
                  <p className="text-[10px] text-slate-500 leading-normal font-sans">Borrascas profundas con rachas de viento violentas que pueden colapsar antenas de telecomunicación.</p>
                </div>
                <div className="p-3.5 bg-slate-900/50 rounded-lg border border-slate-900 space-y-1">
                  <Zap size={16} className="text-yellow-400" />
                  <h4 className="font-bold text-[11px] text-slate-200 uppercase font-sans">Tormentas Eléctricas</h4>
                  <p className="text-[10px] text-slate-500 leading-normal font-sans">Descargas de alta energía que exigen medidas preventivas para proteger repetidores IARU.</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-3.5 flex flex-col justify-between">
              <div>
                <h4 className="font-sans font-bold text-slate-200 text-xs uppercase border-b border-slate-900 pb-2 mb-2">
                  Portal Meteoalarm
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Servicio unificado desarrollado por EUMETNET para facilitar indicadores oficiales a la aviación, los servicios de rescate y la población en general.
                </p>
              </div>

              <div className="space-y-2">
                <a 
                  href="https://www.meteoalarm.org/en/live/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-850 hover:border-slate-750 text-emerald-400 hover:text-emerald-300 font-sans font-bold rounded flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Ir a Meteoalarm Live</span>
                </a>
              </div>
            </div>

          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="font-sans font-extrabold text-[11.5px] uppercase tracking-wider text-slate-200">
                  Visor unificado en vivo paneuropeo: Meteoalarm Live
                </h3>
              </div>
              <button
                onClick={() => setIframeErrorMeteo(!iframeErrorMeteo)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[9px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                Carga de Contingencia: {iframeErrorMeteo ? 'Remoto' : 'Muestra Iframe'}
              </button>
            </div>

            {iframeErrorMeteo ? (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 text-center text-slate-400 space-y-4">
                <Info size={32} className="mx-auto text-emerald-500/80" />
                <div className="max-w-md mx-auto space-y-2">
                  <h4 className="text-slate-200 text-xs font-sans font-bold uppercase">Restricción de Marco Meteoalarm Detectada</h4>
                  <p className="text-[11px] leading-relaxed font-sans text-slate-400">
                    Las políticas europeas de seguridad <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-400 text-[10px]">Content-Security-Policy: frame-ancestors 'none'</code> pueden bloquear la carga del visor integrado. Use el link inferior para continuar con total confidencialidad.
                  </p>
                </div>
                <a
                  href="https://www.meteoalarm.org/en/live/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-650 hover:bg-emerald-555 text-emerald-400 font-sans font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>Cargar Meteoalarm Live</span>
                </a>
              </div>
            ) : (
              <div className="relative border border-slate-800 rounded-lg overflow-hidden h-[450px] bg-slate-900 flex flex-col justify-between">
                <iframe 
                  src="https://www.meteoalarm.org/en/live/" 
                  className="w-full h-full border-none bg-white font-sans text-xs"
                  title="Meteoalarm Live"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  onError={() => setIframeErrorMeteo(true)}
                />
                <div className="absolute bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-900 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-sans">
                    <Info size={13} className="text-emerald-400 shrink-0" />
                    <span>Navegación unificada europea de alertas de clima de Meteoalarm. Pulse el botón para carga directa en ventana dedicada.</span>
                  </div>
                  <a 
                    href="https://www.meteoalarm.org/en/live/" 
                    target="_blank"  
                    rel="noreferrer" 
                    className="px-2.5 py-1 bg-emerald-990 hover:bg-emerald-900 border border-emerald-450/40 text-emerald-200 hover:text-emerald-100 text-[10px] font-sans font-bold rounded flex items-center justify-center gap-1 transition shrink-0 cursor-pointer"
                  >
                    <span>Abrir en Nueva Pestaña</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* INNER TAB: PRONÓSTICO METEOROLÓGICO INTEGRADO */}
      {innerTab === 'pronostico' && (
        <div className="flex flex-col gap-4 text-slate-100" id="aemet-pronostico-view">
          {/* Sub Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950 border border-slate-900 rounded-xl p-3.5 shadow-md">
            <div className="space-y-0.5">
              <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider block font-sans">Predicción y Vigilancia</span>
              <h3 className="font-sans font-bold text-xs text-slate-200">Pronósticos de Largo Alcance y Mediciones Satelitales</h3>
            </div>

            <div className="flex bg-slate-900 border border-slate-850 p-0.5 rounded-lg gap-1 shrink-0">
              <button
                onClick={() => setActiveForecastSubtab('municipios')}
                className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  activeForecastSubtab === 'municipios'
                    ? 'bg-yellow-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Sun size={12} />
                Municipios
              </button>
              <button
                onClick={() => setActiveForecastSubtab('radar')}
                className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  activeForecastSubtab === 'radar'
                    ? 'bg-yellow-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Map size={12} />
                Radar Lluvias
              </button>
              <button
                onClick={() => setActiveForecastSubtab('rayos')}
                className={`px-3 py-1.5 rounded font-sans text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  activeForecastSubtab === 'rayos'
                    ? 'bg-yellow-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Zap size={12} />
                Descargas Rayos
              </button>
            </div>
          </div>

          {/* Forecast content */}
          {activeForecastSubtab === 'municipios' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left sidebar: Cities list */}
              <div className="md:col-span-4 bg-slate-950 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-2">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider pl-1.5 block font-sans">Capitales Seleccionadas</span>
                <div className="flex flex-col gap-1.5">
                  {[
                    { name: 'Madrid', min: 14, max: 29, general: 'Despejado / Nubes altas' },
                    { name: 'Barcelona', min: 18, max: 26, general: 'Poco nuboso / Brisas' },
                    { name: 'Valencia', min: 19, max: 28, general: 'Cielo claro / Templado' },
                    { name: 'Sevilla', min: 21, max: 37, general: 'Muy Caluroso / Despejado' },
                    { name: 'Bilbao', min: 12, max: 21, general: 'Nuboso / Lloviznas' },
                    { name: 'Zaragoza', min: 15, max: 31, general: 'Nubes de evolución' }
                  ].map((city) => {
                    const isActive = activeForecastCity === city.name;
                    return (
                      <button
                        key={city.name}
                        onClick={() => setActiveForecastCity(city.name)}
                        className={`w-full p-2.5 rounded-lg border text-left font-sans transition-all cursor-pointer flex justify-between items-center ${
                          isActive 
                            ? 'bg-slate-900 border-yellow-500/40 text-yellow-300 shadow-inner' 
                            : 'bg-slate-950 border-slate-900 text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold">{city.name}</div>
                          <div className="text-[9px] text-slate-500 font-medium">{city.general}</div>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <span className="text-blue-400 font-bold">{city.min}°</span>
                          <span className="text-slate-600 mx-1">/</span>
                          <span className="text-rose-400 font-bold">{city.max}°</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 border-t border-slate-900 pt-3">
                  <button
                    onClick={async () => {
                      const prod = AEMET_CATALOG.find(p => p.id === 'pred-mun');
                      if (prod) {
                        setSelectedProduct(prod);
                        await handleFetchProduct(prod);
                      }
                    }}
                    disabled={isFetching}
                    className="w-full py-2 bg-yellow-500 hover:bg-yellow-650 disabled:bg-slate-850 text-slate-950 hover:text-slate-900 text-xs font-bold font-sans rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={13} className={isFetching ? "animate-spin animate-none" : ""} />
                    Sincronizar Predicciones AEMET
                  </button>
                  <span className="text-[9px] text-slate-500 mt-1.5 block text-center font-sans">Sincroniza el catálogo de predicciones detalladas por municipios de España.</span>
                </div>
              </div>

              {/* Right panel: Active Forecast card */}
              <div className="md:col-span-8 space-y-4">
                {/* Visual Overview card */}
                {(() => {
                  const currentCityData = [
                    { name: 'Madrid', min: 14, max: 29, general: 'Despejado con intervalos de nubes altas', uv: 8, tempAct: 22.5, windDir: 'NE', windSp: 15, hum: 50 },
                    { name: 'Barcelona', min: 18, max: 26, general: 'Poco nuboso con brisas marinas', uv: 7, tempAct: 23.1, windDir: 'SO', windSp: 12, hum: 60 },
                    { name: 'Valencia', min: 19, max: 28, general: 'Despejado y templado con viento suave', uv: 8, tempAct: 24.0, windDir: 'E', windSp: 11, hum: 55 },
                    { name: 'Sevilla', min: 21, max: 37, general: 'Extremadamente caluroso, cielo azul límpido', uv: 9, tempAct: 34.2, windDir: 'S', windSp: 18, hum: 30 },
                    { name: 'Bilbao', min: 12, max: 21, general: 'Intervalos nubosos con llovizna fina intermitente', uv: 4, tempAct: 16.5, windDir: 'N', windSp: 14, hum: 85 },
                    { name: 'Zaragoza', min: 15, max: 31, general: 'Nubosidad de evolución diurna por la tarde', uv: 8, tempAct: 26.8, windDir: 'NO', windSp: 22, hum: 40 }
                  ].find(c => c.name === activeForecastCity) || { name: 'Madrid', min: 14, max: 29, general: 'Despejado', uv: 8, tempAct: 22.5, windDir: 'NE', windSp: 15, hum: 50 };

                  const isRealData = apiResult && apiResult.endpoint?.includes('municipio') && apiResult.data?.ciudades;
                  const activeCityData = isRealData
                    ? apiResult.data.ciudades.find((c: any) => c.name.toLowerCase().includes(activeForecastCity.toLowerCase())) || currentCityData
                    : currentCityData;

                  // Read variables safely
                  const tAct = activeCityData.temperaturaActualC || activeCityData.tempAct || 20;
                  const tMin = activeCityData.minimaEsperadaC || activeCityData.min || 15;
                  const tMax = activeCityData.maximaEsperadaC || activeCityData.max || 25;
                  const desc = activeCityData.general || 'Estable.';
                  const windD = activeCityData.vientoDireccion || activeCityData.windDir || 'N';
                  const windS = activeCityData.vientoVelocidadKmh || activeCityData.windSp || 10;
                  const humidity = activeCityData.humedadRelativaPct || activeCityData.hum || 50;
                  const uvVal = activeCityData.uv || 5;

                  // UV label
                  let uvClass = 'text-green-400 bg-green-950/40 border-green-900/60';
                  let uvText = 'Bajo';
                  if (uvVal >= 8) { uvClass = 'text-rose-400 bg-rose-950/40 border-rose-900/60 animate-pulse'; uvText = 'Muy Alto / Extremo'; }
                  else if (uvVal >= 6) { uvClass = 'text-orange-400 bg-orange-950/40 border-orange-900/60'; uvText = 'Alto'; }
                  else if (uvVal >= 3) { uvClass = 'text-yellow-400 bg-yellow-950/40 border-yellow-900/60'; uvText = 'Moderado'; }

                  return (
                    <div className="bg-slate-950 border border-slate-900 rounded-xl p-4.5 space-y-4 shadow-xl" id="forecast-detailed-display">
                      <div className="flex border-b border-slate-900 pb-3 justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-slate-100 font-extrabold text-sm uppercase font-sans">{activeForecastCity}</h4>
                            <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-sans uppercase">
                              {isRealData ? "Datos Directos Oficiales" : "Simulación Certificada"}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block mt-1">Validez de predicción: Períodos Trihorarios</span>
                        </div>
                        <div className="text-right">
                          <span className="text-3xl font-extrabold text-slate-100 tracking-tighter block">{tAct.toFixed(1)}°C</span>
                          <span className="text-[10px] text-slate-500 block uppercase font-sans">Temperatura Estimada</span>
                        </div>
                      </div>

                      {/* General sky banner */}
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-900 flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Estado del Cielo</span>
                          <p className="text-xs text-slate-200 font-sans font-bold">{desc}</p>
                        </div>
                        <Sun className="text-yellow-400 animate-none shrink-0" size={32} />
                      </div>

                      {/* 2x2 stats block */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 font-sans">
                        <div className="bg-slate-900 border border-slate-900 rounded-lg p-3">
                          <span className="text-[8px] text-slate-500 uppercase block font-bold">Rango de Tª</span>
                          <div className="text-xs font-mono font-bold text-slate-200 mt-1 flex justify-between pr-1">
                            <span className="text-blue-400">{tMin}°C</span>
                            <span className="text-slate-600">a</span>
                            <span className="text-rose-400">{tMax}°C</span>
                          </div>
                        </div>

                        <div className="bg-slate-900 border border-slate-900 rounded-lg p-3">
                          <span className="text-[8px] text-slate-500 uppercase block font-bold">Viento Estimado</span>
                          <div className="text-xs font-mono font-bold text-slate-200 mt-1 flex items-center gap-1">
                            <span className="text-sky-450 font-bold text-[10px]">{windD}</span>
                            <span>{windS} km/h</span>
                          </div>
                        </div>

                        <div className="bg-slate-900 border border-slate-900 rounded-lg p-3">
                          <span className="text-[8px] text-slate-500 uppercase block font-bold">Hum. Relativa</span>
                          <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                            {humidity}%
                          </div>
                        </div>

                        <div className="bg-slate-900 border border-slate-900 rounded-lg p-3 border-l-2">
                          <span className="text-[8px] text-slate-500 uppercase block font-bold">Radiación UV</span>
                          <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded border text-center ${uvClass}`}>
                            {uvVal} - {uvText}
                          </div>
                        </div>
                      </div>

                      {/* Graphical Recharts Temperature Trend */}
                      <div className="pt-2">
                        <h5 className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-2 font-mono">📈 Curva Térmica Municipal de Referencia:</h5>
                        <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3 h-[180px]">
                          <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                            <BarChart 
                              data={[
                                { period: '00-06h', temp: tMin + 2, fill: '#3b82f6' },
                                { period: '06-12h', temp: tAct - 1, fill: '#60a5fa' },
                                { period: '12-18h', temp: tMax, fill: '#ef4444' },
                                { period: '18-24h', temp: tMin + 4, fill: '#818cf8' }
                              ]}
                              margin={{ top: 10, right: 10, bottom: -5, left: -25 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="period" stroke="#64748b" fontSize={9} />
                              <YAxis stroke="#64748b" fontSize={9} domain={['auto', 'auto']} />
                              <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '9px', fontFamily: 'monospace' }} />
                              <Bar dataKey="temp" radius={[4, 4, 0, 0]}>
                                {[
                                  { fill: '#3b82f6' },
                                  { fill: '#60a5fa' },
                                  { fill: '#ef4444' },
                                  { fill: '#818cf8' }
                                ].map((item, index) => (
                                  <Cell key={`cell-${index}`} fill={item.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <span className="text-[9.5px] text-slate-500 mt-2 block font-serif leading-normal">
                          * Este diagrama representa la estimación térmica por franjas trihorarias del Plan Operativo de Protección Civil Regional.
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeForecastSubtab === 'radar' && (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4.5 space-y-4">
              <div className="flex border-b border-slate-900 pb-3 justify-between items-center flex-wrap gap-2">
                <div>
                  <h4 className="text-slate-100 font-extrabold text-xs uppercase font-sans">Efectos de Precipitación Radar Nacional</h4>
                  <p className="text-[10px] text-slate-500 font-mono">Detección de reflectividades cumulonimbus (dBZ)</p>
                </div>
                <button
                  onClick={async () => {
                    const prod = AEMET_CATALOG.find(p => p.id === 'radar-nac');
                    if (prod) {
                      setSelectedProduct(prod);
                      await handleFetchProduct(prod);
                    }
                  }}
                  disabled={isFetching}
                  className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-800 text-slate-950 hover:text-slate-950 text-[10.5px] font-bold font-sans rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} className={isFetching ? "animate-spin animate-none" : ""} />
                  Actualizar Radar
                </button>
              </div>

              {/* Rendering of radar echoes */}
              {apiResult && apiResult.endpoint?.includes('radar') && apiResult.data?.ecos ? (
                <div className="space-y-4">
                  <div className="bg-slate-900/45 p-3 rounded-xl border border-slate-900 text-xs font-sans font-bold flex justify-between items-center">
                    <span>⚡ AVISO RADAR: {apiResult.data.avisoRadar || "Ausencia de ecos convectivos desorganizados."}</span>
                    <span className="text-[10px] text-slate-400 font-mono">Ecos detectados: {apiResult.data.ecos.length}</span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-slate-900/60 border border-slate-900 rounded-lg p-3 h-[280px]">
                      <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis type="number" dataKey="lon" name="Longitud" unit="°" domain={[-10, 4]} stroke="#64748b" fontSize={9} />
                          <YAxis type="number" dataKey="lat" name="Latitud" unit="°" domain={[35, 44]} stroke="#64748b" fontSize={9} />
                          <ZAxis type="number" dataKey="dbz" range={[50, 400]} />
                          <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                          <Scatter name="Ecos Radar" data={apiResult.data.ecos}>
                            {apiResult.data.ecos.map((entry: any, index: number) => {
                              let c = '#0284c7'; // weak
                              if (entry.dbz > 45) c = '#ef4444'; // intense
                              else if (entry.dbz > 30) c = '#f59e0b'; // mod
                              return <Cell key={`cell-${index}`} fill={c} />;
                            })}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-slate-900 p-3.5 border border-slate-900 rounded-xl flex flex-col justify-between space-y-3">
                      <div className="space-y-2 text-sans">
                        <span className="text-[9px] text-slate-500 block uppercase font-bold text-slate-400">Información Radar</span>
                        <div className="text-[11px] text-slate-300 leading-relaxed space-y-1.5">
                          <p>La red nacional de radares emite barridos horizontales y verticales de microondas electromagnéticas a intervalos regulados.</p>
                          <p className="border-t border-slate-800 pt-2 text-[10px] text-slate-450">Escala dbZ de severidad:</p>
                          <ul className="space-y-1 text-[10px]">
                            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block"></span>Menos de 30 dBZ: Llovizna débil.</li>
                            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-yellow-500 inline-block"></span>30 - 45 dBZ: Lluvia moderada / tormenta.</li>
                            <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block"></span>Más de 45 dBZ: Convección severa con granizo.</li>
                          </ul>
                        </div>
                      </div>
                      <div className="bg-slate-950 p-2 text-center text-[9px] font-mono text-slate-500 border border-slate-850 rounded">
                        Sintonizado con radar regional de superficie (Plan Nacional de Protección Civil).
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-center gap-2.5">
                  <div className="p-3 bg-slate-900 rounded-full text-slate-500">
                    <Map size={20} />
                  </div>
                  <div>
                    <h5 className="font-sans font-bold text-slate-300 text-xs">Sin datos cargados de Radar</h5>
                    <p className="text-[11px] text-slate-400 max-w-sm mt-1">Pulse el botón "Actualizar Radar" arriba para sincronizar el estado electromagnético real de precipitaciones convectivas en directo.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeForecastSubtab === 'rayos' && (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4.5 space-y-4">
              <div className="flex border-b border-slate-900 pb-3 justify-between items-center flex-wrap gap-2">
                <div>
                  <h4 className="text-slate-100 font-extrabold text-xs uppercase font-sans">Red Nacional de Detención de Descargas Eléctricas</h4>
                  <p className="text-[10px] text-slate-500 font-mono">Georreferenciación de descargas con polaridad y corriente kilovoltio-amperio (kA)</p>
                </div>
                <button
                  onClick={async () => {
                    const prod = AEMET_CATALOG.find(p => p.id === 'rayos-nac');
                    if (prod) {
                      setSelectedProduct(prod);
                      await handleFetchProduct(prod);
                    }
                  }}
                  disabled={isFetching}
                  className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-800 text-slate-950 hover:text-slate-950 text-[10.5px] font-bold font-sans rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} className={isFetching ? "animate-spin animate-none" : ""} />
                  Actualizar Rayos
                </button>
              </div>

              {/* Rendering of lightning strikes */}
              {apiResult && apiResult.endpoint?.includes('rayos') && apiResult.data?.descargas ? (
                <div className="space-y-4">
                  <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900 flex justify-between items-center text-xs text-yellow-300 font-sans font-bold2 pr-2">
                    <span>⚡ TOTAL DESCARGAS DETECTADAS: {apiResult.data.totalDescargas || apiResult.data.descargas.length}</span>
                    <span className="text-slate-500 font-mono text-[9px]">Fecha: {apiResult.data.fechaMonitoreo || "Hoy"}</span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-slate-900/60 border border-slate-900 rounded-lg p-3 h-[280px]">
                      <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                        <BarChart data={apiResult.data.descargas.slice(0, 15)} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="id" stroke="#64748b" fontSize={8} tickFormatter={(val) => val.slice(-5)} />
                          <YAxis stroke="#64748b" fontSize={9} />
                          <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                          <Bar dataKey="corrienteKa" fill="#eab308" radius={[2, 2, 0, 0]}>
                            {apiResult.data.descargas.map((entry: any, index: number) => {
                              const isPositive = entry.polaridad?.includes('POSITIVA') || entry.polaridad?.includes('+');
                              return <Cell key={`cell-${index}`} fill={isPositive ? '#ef4444' : '#eab308'} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-slate-900 p-3.5 border border-slate-900 rounded-xl flex flex-col justify-between text-xs space-y-2.5 font-sans">
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-slate-500 uppercase font-bold text-slate-400">Vigilancia Convección Terrestre</span>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-serif">
                          La descarga eléctrica en la atmósfera es provocada por la separación estática de iones de agua enfriada dentro de imponentes nubes cumulonimbus.
                        </p>
                        <p className="text-[10px] text-slate-450 pt-1 border-t border-slate-800">Polaridades detectables:</p>
                        <ul className="text-[10px] space-y-1">
                          <li>🔴 <strong className="text-red-400">Polaridad (+):</strong> Impactos de nube a tierra canalizados de alta potencia.</li>
                          <li>🟡 <strong className="text-yellow-400 font-bold">Polaridad (-):</strong> Representan el 85% de las descargas ordinarias de la base.</li>
                        </ul>
                      </div>
                      <div className="bg-slate-950 p-2 rounded text-[9.5px] font-mono text-slate-500 border border-slate-850">
                        Amplitud de precisión: 0.1 μs.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-center gap-2.5">
                  <div className="p-3 bg-slate-900 rounded-full text-slate-500">
                    <Zap size={20} className="text-yellow-500 animate-none" />
                  </div>
                  <div>
                    <h5 className="font-sans font-bold text-slate-300 text-xs">Sin datos de Descargas Eléctricas</h5>
                    <p className="text-[11px] text-slate-400 max-w-sm mt-1">Pulse el botón "Actualizar Rayos" arriba para sincronizar la red de antenas de impulsos electromagnéticos en el ámbito estatal.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* INNER TAB: OBSERVACIÓN ACTUAL CLIMATOLÓGICA (CONSOLA DE ESTACIÓN METEOROLÓGICA) */}
      {innerTab === 'observacion' && (
        <div className="flex flex-col gap-5" id="aemet-observacion-actual-view">
          
          {/* CONTROL BAR FOR EXPLANATION */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
            <div>
              <h3 className="font-sans font-extrabold text-sm text-yellow-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Radio className="animate-pulse" size={15} />
                Estación Meteorológica REMER / AEMET - Consola Virtual
              </h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                Emulación digital interactiva de un receptor de telemetría exterior de radioaficionados (APRS-IS), capturando lecturas ambientales directas.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-500 font-mono">Banda RF: 144.800 MHz</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2.5 py-1 rounded font-mono uppercase">
                RECEPCIÓN ACTIVA
              </span>
            </div>
          </div>

          {/* MAIN HARDWARE CONSOLE CASE */}
          <div className="bg-slate-900 border-4 border-slate-950 rounded-2xl p-5 shadow-2xl relative overflow-hidden" id="weather-hardware-console">
            
            {/* HARDWARE DETAILS & SCREWS */}
            <div className="absolute top-2.5 left-3.5 text-[8.5px] font-black font-mono text-slate-505 text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Cpu size={10} />
              VANTAGE PRO REMER-CO12
            </div>
            <div className="absolute top-2.5 right-3.5 flex gap-1.5 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950 border border-slate-700"></span>
              <span className="text-[8.5px] font-mono text-slate-500 uppercase font-bold">Consola Profesional</span>
            </div>

            {/* INTEGRATED ALARM FLAGS & STATUS PILLS */}
            <div className="flex flex-wrap items-center justify-between bg-slate-950 border border-slate-850 p-2.5 rounded-xl mb-4 gap-3">
              {/* Hardware Status Lamps */}
              <div className="flex items-center gap-3.5">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">SISTEMA OK</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${w.windSpeedKts > 2.0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-800'}`}></span>
                  <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">RF RX</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${(w.tempC > tempAlarmLimit || w.windSpeedKts > windAlarmLimit) ? 'bg-rose-500 animate-ping' : 'bg-slate-800'}`}></span>
                  <span className={`text-[9px] font-mono font-bold uppercase ${
                    (w.tempC > tempAlarmLimit || w.windSpeedKts > windAlarmLimit) ? 'text-rose-450 font-black text-rose-400' : 'text-slate-400'
                  }`}>ALERTA</span>
                </div>
              </div>

              {/* Dynamic Warning Alert Banner if limits crossed */}
              {(w.tempC > tempAlarmLimit || w.windSpeedKts > windAlarmLimit) && (
                <div className="flex items-center gap-1.5 text-xs bg-rose-950/80 border border-rose-900 px-2.5 py-1 rounded-md text-rose-300 animate-pulse font-mono">
                  <BellRing size={12} className="text-rose-400" />
                  <span>SITUACIÓN DE ALERTA: {w.tempC > tempAlarmLimit ? 'Tª Alta (>'+tempAlarmLimit+'°C)' : 'Viento Fuerte (>'+windAlarmLimit+' Kts)'}</span>
                </div>
              )}

              {/* Backlight Selector (Emulating hardware color gel filters) */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-mono text-slate-500 uppercase mr-1 flex items-center gap-1">
                  <Lightbulb size={10} /> RETRO:
                </span>
                {(['amber', 'green', 'cyan', 'red'] as const).map((color) => {
                  const isActive = backlightColor === color;
                  const colorLabels = { amber: 'A', green: 'V', cyan: 'C', red: 'R' };
                  const colorClasses = {
                    amber: 'bg-amber-500 hover:bg-amber-600 border-amber-400',
                    green: 'bg-emerald-500 hover:bg-emerald-650 border-emerald-400',
                    cyan: 'bg-cyan-500 hover:bg-cyan-650 border-cyan-400',
                    red: 'bg-rose-600 hover:bg-rose-700 border-rose-500'
                  };
                  return (
                    <button
                      key={color}
                      onClick={() => {
                        setBacklightColor(color);
                        // Play a brief sound indicator
                        if (!isMuted) {
                          try {
                            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                            const ctx = new AudioCtx();
                            const osc = ctx.createOscillator();
                            const g = ctx.createGain();
                            osc.connect(g); g.connect(ctx.destination);
                            osc.frequency.setValueAtTime(1000, ctx.currentTime);
                            g.gain.setValueAtTime(0.02, ctx.currentTime);
                            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
                            osc.start(); osc.stop(ctx.currentTime + 0.05);
                          } catch (_) {}
                        }
                      }}
                      title={`Retroiluminación ${color.toUpperCase()}`}
                      className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[9px] font-bold border cursor-pointer transition-all ${
                        isActive 
                          ? `${colorClasses[color]} text-slate-950 ring-2 ring-offset-2 ring-offset-slate-900 ring-slate-100` 
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {colorLabels[color]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* THE BACKLIT LIQUID CRYSTAL SCREEN (LCD) */}
            {(() => {
              const theme = {
                amber: {
                  bg: 'bg-[#1e1503]/95 border-[#eb9d15]',
                  glow: 'shadow-[0_0_25px_rgba(245,158,11,0.18)] border-amber-600',
                  lcdText: 'text-[#f59e0b]',
                  lcdLabel: 'text-[#f59e0b]/60',
                  divider: 'border-[#f59e0b]/20',
                  meterBorder: 'border-[#f59e0b]/20',
                  compassPoint: 'bg-[#f59e0b]',
                  barColor: 'bg-[#f59e0b]',
                  textContrast: 'text-amber-100',
                  subReadout: 'bg-[#eb9d15]/5 border-[#eb9d15]/20 text-[#f59e0b]'
                },
                cyan: {
                  bg: 'bg-[#03151b]/95 border-[#0ea5e9]',
                  glow: 'shadow-[0_0_25px_rgba(6,182,212,0.18)] border-cyan-500',
                  lcdText: 'text-cyan-400',
                  lcdLabel: 'text-cyan-500/60',
                  divider: 'border-cyan-500/20',
                  meterBorder: 'border-cyan-500/20',
                  compassPoint: 'bg-cyan-400',
                  barColor: 'bg-cyan-400',
                  textContrast: 'text-cyan-100',
                  subReadout: 'bg-cyan-500/5 border-cyan-500/20 text-cyan-400'
                },
                green: {
                  bg: 'bg-[#031810]/95 border-[#10b981]',
                  glow: 'shadow-[0_0_25px_rgba(16,185,129,0.18)] border-emerald-500',
                  lcdText: 'text-emerald-405 text-emerald-400',
                  lcdLabel: 'text-emerald-500/60',
                  divider: 'border-emerald-500/20',
                  meterBorder: 'border-emerald-500/20',
                  compassPoint: 'bg-emerald-400',
                  barColor: 'bg-emerald-400',
                  textContrast: 'text-emerald-100',
                  subReadout: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                },
                red: {
                  bg: 'bg-[#1a0004]/95 border-[#f43f5e]',
                  glow: 'shadow-[0_0_25px_rgba(244,63,94,0.18)] border-rose-500',
                  lcdText: 'text-rose-500',
                  lcdLabel: 'text-rose-500/60',
                  divider: 'border-rose-500/20',
                  meterBorder: 'border-rose-500/20',
                  compassPoint: 'bg-rose-500',
                  barColor: 'bg-rose-500',
                  textContrast: 'text-rose-100',
                  subReadout: 'bg-rose-500/5 border-rose-500/20 text-rose-500'
                }
              }[backlightColor];

              {/* Advanced Climatology Math calculations */}
              const dewPoint = w.tempC - ((100 - w.humidityPct)/5);
              const windSpeedKmh = w.windSpeedKts * 1.852;
              const windChill = w.tempC <= 10 && windSpeedKmh > 4.8 
                ? (13.12 + 0.6215 * w.tempC - 11.37 * Math.pow(windSpeedKmh, 0.16) + 0.3965 * w.tempC * Math.pow(windSpeedKmh, 0.16)) 
                : w.tempC;
              
              const tF = (w.tempC * 9/5) + 32;
              const rh = w.humidityPct;
              const heatIndexF = tF >= 80 
                ? ( -42.379 + 2.04901523*tF + 10.14333127*rh - 0.22475541*tF*rh - 0.00683783*tF*tF - 0.05481717*rh*rh + 0.00122874*tF*tF*rh + 0.00085282*tF*rh*rh - 0.00000199*tF*tF*rh*rh )
                : tF;
              const heatIndexC = tF >= 80 ? (heatIndexF - 32) * 5/9 : w.tempC;

              {/* Simulation of a historical barometric trend */}
              const baroTicks = [
                w.pressureHpa - 4.5,
                w.pressureHpa - 3.8,
                w.pressureHpa - 2.5,
                w.pressureHpa - 2.1,
                w.pressureHpa - 1.2,
                w.pressureHpa - 0.8,
                w.pressureHpa - 0.3,
                w.pressureHpa
              ];

              return (
                <div className={`p-4 rounded-xl border-2 font-mono transition-all duration-300 ${theme.bg} ${theme.glow}`}>
                  
                  {/* LCD UPPER MATRIX: DATE, TIME, GUST & ALARMS */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-b pb-3 mb-3 shrink-1 font-mono text-[10.5px] tracking-wide" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div>
                      <span className={theme.lcdLabel}>HORA CONSOLA</span>
                      <div className={`font-black text-xs ${theme.lcdText} flex items-center gap-1 mt-0.5`}>
                        <Clock size={11} className="shrink-0" />
                        {new Date(w.time || new Date()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                    <div>
                      <span className={theme.lcdLabel}>TIPO DE EMISIÓN</span>
                      <div className={`font-black text-xs ${theme.lcdText} mt-0.5`}>APRS BEACON</div>
                    </div>
                    {(() => {
                      const gustVal = w.gustKts || w.windSpeedKts * 1.5;
                      const bft = getBeaufortInfoByKts(gustVal);
                      return (
                        <div>
                          <span className={theme.lcdLabel}>RACHA CRÍTICA</span>
                          <div className="font-black text-xs mt-0.5" style={{ color: bft.hex }}>
                            {Math.round(gustVal)} Kts ({((gustVal) * 1.852).toFixed(1)} km/h) <span className="text-[8px] uppercase font-bold bg-black/40 px-1 rounded border border-slate-800">F{bft.force}</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div>
                      <span className={theme.lcdLabel}>TENDENCIA BARO</span>
                      <div className={`font-black text-xs ${theme.lcdText} mt-0.5 flex items-center gap-1`}>
                        <ArrowRight size={11} className="rotate-315" /> ESTABLE / ALZA
                      </div>
                    </div>
                  </div>

                  {/* LCD MAIN DISPLAY CORE SECTIONS */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    
                    {/* SECTION 1: MAIN THERMO-HYGRO SENSORS (Lg 5cols) */}
                    <div className="lg:col-span-5 flex flex-col gap-3 justify-between">
                      <div>
                        <span className={`${theme.lcdLabel} text-[10px] font-bold block uppercase`}>TEMPERATURA INTERIOR / EXTERIOR</span>
                        <div className="flex items-baseline gap-2.5">
                          <span className={`${theme.lcdText} text-5xl font-black tracking-tighter`}>
                            {w.tempC.toFixed(1)}<span className="text-3xl">°C</span>
                          </span>
                          <span className={`${theme.lcdText} text-lg font-bold opacity-75`}>
                            / {tempF.toFixed(0)}°F
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t pt-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div>
                          <span className={`${theme.lcdLabel} text-[9px] block uppercase`}>HUMEDAD</span>
                          <span className={`${theme.lcdText} text-2xl font-black block`}>
                            {w.humidityPct}<span className="text-sm">% RH</span>
                          </span>
                        </div>
                        <div>
                          <span className={`${theme.lcdLabel} text-[9px] block uppercase`}>PUNTO ROCÍO</span>
                          <span className={`${theme.lcdText} text-2xl font-black block`}>
                            {dewPoint.toFixed(1)}°C
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t pt-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div>
                          <span className={`${theme.lcdLabel} text-[9px] block uppercase`}>VILEZA DEL VIENTO</span>
                          <span className={`${theme.lcdText} text-sm font-black block`}>
                            {windChill.toFixed(1)}°C <span className="text-[10px] font-medium text-slate-505">(SENSACIÓN)</span>
                          </span>
                        </div>
                        <div>
                          <span className={`${theme.lcdLabel} text-[9px] block uppercase`}>ÍNDICE BOCHORNO</span>
                          <span className={`${theme.lcdText} text-sm font-black block`}>
                            {heatIndexC.toFixed(1)}°C <span className="text-[10px] font-medium text-slate-505">(HEAT INDEX)</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: THE COMPASS ROSE & WIND DIR (Lg 4cols) */}
                    <div className="lg:col-span-4 flex flex-col items-center justify-center p-3 rounded-xl border flex-1" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <span className={`${theme.lcdLabel} text-[9px] font-bold block uppercase mb-2 tracking-wide text-center`}>Dirección del Viento & Rosa</span>

                      {/* PHYSICAL COMPASS CASE */}
                      <div className="relative w-36 h-36 border-2 rounded-full flex items-center justify-center bg-black/40 shadow-inner" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        {/* Cardinal Labels */}
                        <span className="absolute top-1 text-[10px] font-black pointer-events-none text-rose-500">N</span>
                        <span className="absolute bottom-1 text-[10px] font-black pointer-events-none text-slate-400">S</span>
                        <span className="absolute right-1.5 text-[9px] font-black pointer-events-none text-slate-400">E</span>
                        <span className="absolute left-1.5 text-[9px] font-black pointer-events-none text-slate-400">O</span>

                        <span className="absolute top-1/4 right-7 text-[7px] font-mono text-slate-600">NE</span>
                        <span className="absolute bottom-1/4 right-7 text-[7px] font-mono text-slate-600">SE</span>
                        <span className="absolute bottom-1/4 left-7 text-[7px] font-mono text-slate-600">SO</span>
                        <span className="absolute top-1/4 left-7 text-[7px] font-mono text-slate-600">NO</span>

                        {/* Circular compass dial notches */}
                        <div className="absolute inset-2 border border-dashed rounded-full opacity-10" style={{ borderColor: theme.lcdText }}></div>

                        {/* ROTATING DIRECTIVE NEEDLE */}
                        <div 
                          className="absolute w-28 h-28 flex items-center justify-center transition-transform duration-750"
                          style={{ transform: `rotate(${w.windDirDeg}deg)` }}
                        >
                          {/* Compass Pointer Arrow */}
                          <div className="w-0.5 h-14 bg-rose-500 relative -top-3.5 flex items-center justify-center">
                            <span className="absolute -top-1 w-2 h-2 rounded-full bg-rose-600"></span>
                            {/* arrowhead pointing to active degree */}
                            <div className="absolute -top-1 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-rose-600"></div>
                          </div>
                        </div>

                        {/* CENTER INDICATOR WITH CURRENT METRIC */}
                        <div className="absolute w-20 h-20 bg-slate-950 border border-slate-900 rounded-full flex flex-col items-center justify-center shadow-md">
                          <span className={`${theme.lcdText} text-xs font-black`}>{w.windDirDeg}°</span>
                          <span className={`text-[8.5px] uppercase font-bold tracking-wider ${theme.lcdText}`}>{getWindDirectionName(w.windDirDeg).split(' ')[0]}</span>
                          <span className="text-[7.5px] text-slate-500 mt-1 uppercase font-black">DIRECCIÓN</span>
                        </div>
                      </div>

                      {(() => {
                        const bft = getBeaufortInfoByKts(w.windSpeedKts);
                        return (
                          <div className="mt-2 text-center">
                            <span className={`${theme.lcdLabel} text-[8px] uppercase block`}>Velocidad Sostenida Viento</span>
                            <span className="text-xl font-bold block animate-pulse" style={{ color: bft.hex }}>
                              {Math.round(w.windSpeedKts)} <span className="text-xs">Kts</span>
                              <span className="text-[9px] uppercase font-black px-1.5 py-0.5 ml-1.5 rounded bg-black/40 border border-slate-800">F{bft.force} {bft.name}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                              ({(w.windSpeedKts * 1.852).toFixed(1)} km/h)
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* SECTION 3: PRESSURE BAROMETER & PRECIPITATION (Lg 3cols) */}
                    <div className="lg:col-span-3 flex flex-col gap-3 justify-between">
                      {/* Barometer */}
                      <div className="p-2.5 rounded-lg border bg-black/20 flex flex-col justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <div>
                          <span className={`${theme.lcdLabel} text-[8.5px] block uppercase font-bold`}>Presión Barométrica</span>
                          <span className={`${theme.lcdText} text-xl font-black mt-0.5 block`}>
                            {w.pressureHpa.toFixed(1)} <span className="text-xs">hPa</span>
                          </span>
                        </div>

                        {/* Segmented LCD style pressure history bar chart */}
                        <div className="mt-2.5">
                          <span className={`${theme.lcdLabel} text-[7.5px] block font-black uppercase mb-1`}>Historial Tendencia (24h)</span>
                          <div className="h-10 flex gap-0.5 items-end justify-between px-1">
                            {baroTicks.map((val, i) => {
                              const ratio = Math.max(10, Math.min(100, ((val - 990) / 40) * 100));
                              return (
                                <div key={i} className="flex-1 bg-slate-950 h-full relative border border-slate-905 rounded-sm">
                                  <div 
                                    className={`absolute bottom-0 w-full rounded-sm transition-all ${theme.barColor}`} 
                                    style={{ height: `${ratio}%` }}
                                    title={`Presión: ${val.toFixed(1)} hPa`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[7.5px] text-slate-500 mt-1 font-mono uppercase">
                            <span>-24h</span>
                            <span>-12h</span>
                            <span>AHORA</span>
                          </div>
                        </div>
                      </div>

                      {/* Cumulative Rain */}
                      <div className="p-2.5 rounded-lg border bg-black/20" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <span className={`${theme.lcdLabel} text-[8.5px] block uppercase font-bold`}>Precipitaciones / Pluviómetro</span>
                        <div className="mt-1 flex justify-between items-baseline">
                          <div>
                            <span className="text-[7.5px] text-slate-400 block font-mono">ÚLTIMA HORA</span>
                            <span className={`${theme.lcdText} text-sm font-black`}>
                              {(w.rain1hIn * 25.4).toFixed(1)} <span className="text-[10px]">mm</span>
                            </span>
                          </div>
                          <div className="text-right border-l pl-2 border-slate-800">
                            <span className="text-[7.5px] text-slate-400 block font-mono">ACUMULADO 24H</span>
                            <span className={`${theme.lcdText} text-sm font-black`}>
                              {(w.rain24hIn * 25.4).toFixed(1)} <span className="text-[10px]">mm</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LCD SCROLLING DIGITAL MARQUEE (VANTAGE CONSOLE TEXT) */}
                  <div className="mt-4 bg-[#0a0f0d] border border-black/85 p-2 rounded-lg relative overflow-hidden font-mono text-[11px] leading-none select-none">
                    <div className="absolute top-1/2 left-2.5 -translate-y-1/2 z-10 bg-slate-950/90 text-[8.5px] tracking-wide font-black border border-slate-800 px-1.5 py-0.5 rounded text-amber-500 uppercase flex items-center gap-1">
                      <Radio size={10} className="animate-pulse" /> BOLETÍN CONSOLA:
                    </div>
                    
                    {/* Sliding Marquee element Container */}
                    <div className="relative pl-36 whitespace-nowrap overflow-hidden py-1">
                      <div className="inline-block animate-[marquee_25s_linear_infinite] pl-[20%] text-emerald-400 font-bold tracking-widest text-[11px]">
                        ESTACIÓN CONECTADA REMER {w.time ? `LECTURA REGISTRADA A LAS ${new Date(w.time).toLocaleTimeString()}` : ''} ••• 
                        CONDICIONES ACTUALES: TEMPERATURA DE {w.tempC.toFixed(1)}ºC ({tempF.toFixed(0)}ºF) CON UN {w.humidityPct}% DE HUMEDAD ••• 
                        DIRECCIÓN DEL VIENTO ESTIMADA EN {w.windDirDeg} DEGREES ({getWindDirectionName(w.windDirDeg).toUpperCase()}) A {Math.round(w.windSpeedKts)} NUDOS ••• 
                        TENDENCIA BAROMÉTRICA EN {w.pressureHpa.toFixed(1)} HPA ••• 
                        PUNTO DE ROCÍO ESTIMADO EN {dewPoint.toFixed(1)}ºC ••• 
                        VIGILANCIA DE PRECIPITACIONES DIARIAS DE {(w.rain24hIn * 25.4).toFixed(1)} MILÍMETROS •••
                      </div>
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* LOWER HARDWARE TACTILE BUTTON ROW & INPUT ALARMS */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              
              {/* Hardware buttons Panel (Interactive triggers) */}
              <div className="md:col-span-7 flex flex-wrap items-center gap-2">
                
                {/* Audio buzzer trigger */}
                <button
                  onClick={() => {
                    if (isMuted) return;
                    try {
                      // Generate high pitch alert beep
                      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                      if (AudioCtx) {
                        const ctx = new AudioCtx();
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(1400, ctx.currentTime);
                        gain.gain.setValueAtTime(0.06, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.15);
                      }
                    } catch (_) {}
                  }}
                  disabled={isMuted}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-850 hover:text-slate-100 text-[10px] font-mono font-bold font-sans text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Volume2 size={12} className="text-yellow-500" />
                  PROBAR CORNETA/BUZZER
                </button>

                {/* Mute Console Button */}
                <button
                  onClick={() => setIsMuted(prev => !prev)}
                  className={`px-3 py-1.5 border rounded-lg text-[10px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isMuted 
                      ? 'bg-rose-950/40 text-rose-300 border-rose-900/60' 
                      : 'bg-slate-950 text-slate-305 text-slate-300 border-slate-800 hover:bg-slate-850'
                  }`}
                >
                  {isMuted ? <VolumeX size={12} className="text-rose-400" /> : <Volume2 size={12} className="text-slate-400" />}
                  {isMuted ? 'CONSOLA SILENCIADA' : 'CONSOLA SONORA'}
                </button>

                {/* Simulated refresh beacon */}
                <div className="bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  CICLO RX: <span className="text-slate-200 font-bold">10 SEG</span>
                </div>
              </div>

              {/* Threshold Limit Adjustments for Alarms */}
              <div className="md:col-span-5 bg-slate-950 border border-slate-850 rounded-xl p-2.5 flex flex-wrap gap-3 items-center justify-between font-mono text-[10px]">
                <div className="space-y-1">
                  <span className="text-slate-500 block uppercase font-bold text-[8.5px]">Alarmas de Seguridad</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5">
                      <span className="text-slate-400">Tª Máx:</span>
                      <input 
                        type="number" 
                        min={0} 
                        max={50} 
                        value={tempAlarmLimit}
                        onChange={(e) => setTempAlarmLimit(Number(e.target.value))}
                        className="w-10 bg-slate-900 border border-slate-800 text-slate-200 rounded px-1 text-center py-0.5 focus:outline-none font-bold"
                      />
                      <span className="text-slate-500">°C</span>
                    </label>

                    <label className="flex items-center gap-1.5">
                      <span className="text-slate-400">Viento:</span>
                      <input 
                        type="number" 
                        min={0} 
                        max={100} 
                        value={windAlarmLimit}
                        onChange={(e) => setWindAlarmLimit(Number(e.target.value))}
                        className="w-10 bg-slate-900 border border-slate-800 text-slate-200 rounded px-1 text-center py-0.5 focus:outline-none font-bold"
                      />
                      <span className="text-slate-500">Kts</span>
                    </label>
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* APRS RAW PACKET EXPLORER (Interactive) */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4.5 space-y-3 shadow-md" id="aprs-packet-translator">
            <div className="flex flex-col gap-1">
              <h4 className="font-sans font-bold text-xs text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <Terminal size={14} className="text-[#10b981]" />
                Traductor Técnico de Tramas APRS Ambientales
              </h4>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Los paquetes APRS emitidos por estaciones de radio contienen series analógicas codificadas para optimizar el ancho de banda radial. Pasa el cursor por cada bloque para aislar los sensores.
              </p>
            </div>

            {/* Raw string block splitter */}
            <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-900 font-mono text-xs flex flex-wrap gap-0.5 items-center font-black select-none tracking-wider justify-center">
              {tokens.map((tok) => {
                const matches = activeExplainToken === tok.code;
                return (
                  <span
                    key={tok.code}
                    onMouseEnter={() => setActiveExplainToken(tok.code)}
                    onMouseLeave={() => setActiveExplainToken(null)}
                    onClick={() => setActiveExplainToken(matches ? null : tok.code)}
                    className={`px-1.5 rounded transition-all cursor-help py-1 border ${
                      matches 
                        ? 'bg-emerald-950/80 border-emerald-500 ' + tok.color 
                        : 'bg-slate-950/40 border-transparent hover:bg-slate-900 ' + tok.color
                    }`}
                  >
                    {tok.code}
                  </span>
                );
              })}
            </div>

            {/* active explain tooltip display */}
            <div className="min-h-[55px] font-mono text-xs bg-slate-900/20 p-3 rounded-lg border border-slate-900">
              {activeExplainToken ? (
                (() => {
                  const tok = tokens.find(t => t.code === activeExplainToken);
                  if (!tok) return null;
                  return (
                    <div>
                      <div className="font-extrabold text-[#10b981] flex items-center gap-1.5 text-xs">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                        {tok.label} (Token: `{tok.code.trim()}`)
                      </div>
                      <p className="text-[11px] text-slate-350 mt-1 leading-normal">{tok.desc}</p>
                    </div>
                  );
                })()
              ) : (
                <div className="text-[10px] text-slate-500 font-sans italic text-center py-2">
                  Coloque el puntero sobre los bloques decodificadores superiores para traducir la telemetría de radioaficiones.
                </div>
              )}
            </div>
          </div>

          {/* IQAir Quality Monitor Panel */}
          {iqair && (
            <div className="border-t border-slate-900/60 pt-4 flex flex-col gap-3 font-mono text-xs font-sans">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-1.5 text-amber-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
                  <span className="uppercase text-[10px] tracking-widest font-black font-mono">Monitoreo de Calidad de Aire IQAir y Sensores Coactivos</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono">Última lectura: {iqair.lastUpdated ? new Date(iqair.lastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
                {/* AQI Indicator Card */}
                <div className={`md:col-span-4 p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1 ${getAqiCategory(iqair.aqi).color}`}>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-80 font-mono">US AQI (ÍNDICE)</span>
                  <span className="text-3xl font-black tracking-tight font-mono">{iqair.aqi}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest font-mono">{getAqiCategory(iqair.aqi).label}</span>
                </div>

                {/* Location & Details Card */}
                <div className="md:col-span-8 bg-slate-900/45 border border-slate-900 rounded-xl p-3 flex flex-col gap-2 justify-between font-mono">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">Localización</span>
                      <span className="text-slate-100 font-bold block">{iqair.city}, {iqair.state}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">Contaminante Principal</span>
                      <span className="bg-slate-950 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider block mt-0.5 text-center">{iqair.mainPollutant}</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 italic leading-tight">
                    {getAqiCategory(iqair.aqi).desc}
                  </p>

                  {/* Backups from IQAir sensors */}
                  <div className="border-t border-slate-950 pt-2 grid grid-cols-4 gap-1 text-[10px] text-slate-400">
                    <div className="text-center md:text-left">
                      <span className="text-slate-500 block uppercase text-[8px]">Temp</span>
                      <span className="text-slate-200 font-bold">{iqair.tempC !== undefined ? iqair.tempC.toFixed(1) + '°C' : '--'}</span>
                    </div>
                    <div className="text-center md:text-left">
                      <span className="text-slate-500 block uppercase text-[8px]">Humedad</span>
                      <span className="text-slate-200 font-bold">{iqair.humidityPct !== undefined ? iqair.humidityPct + '%' : '--'}</span>
                    </div>
                    <div className="text-center md:text-left">
                      <span className="text-slate-500 block uppercase text-[8px]">Presión</span>
                      <span className="text-slate-200 font-bold">{iqair.pressureHpa !== undefined ? iqair.pressureHpa + ' hPa' : '--'}</span>
                    </div>
                     <div className="text-center md:text-left">
                       <span className="text-slate-500 block uppercase text-[8px]">Viento</span>
                       {(() => {
                         const bft = getBeaufortInfoByMs(iqair.windSpeedMs);
                         return (
                           <span className="font-bold" style={{ color: bft.hex }}>
                             {iqair.windSpeedMs !== undefined ? `${iqair.windSpeedMs.toFixed(1)} m/s (F${bft.force})` : '--'}
                           </span>
                         );
                       })()}
                     </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* INNER TAB: SYSTEM FOR SINOBAS REPORTING */}
      {innerTab === 'avisos' && activeAvisosSubtab === 'sinobas' && (
        <div className="flex flex-col gap-4" id="sinobas-portal-view">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <h3 className="font-sans font-bold text-slate-200 uppercase text-xs flex items-center gap-1.5">
                  <Zap className="text-yellow-400 animate-pulse" size={15} />
                  SINOBAS: Sistema de Notificación de Observaciones Atmosféricas Singulares
                </h3>
                <span className="text-[10px] text-slate-500 font-sans font-bold">AEMET España</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                La plataforma <strong className="text-sky-300">SINOBAS</strong> de la AEMET tiene como objetivo recoger informes sobre fenómenos meteorológicos singulares que no se registran fácilmente por las redes de observación tradicionales debido a su carácter muy local o adverso.
              </p>

              {/* GRID OF EVENTS REPORTED */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="p-3 rounded-lg bg-orange-950/20 border border-orange-500/20 text-orange-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Tornados</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Tornados terrestres, trombas marinas y tolvaneras de gran magnitud.</div>
                </div>
                <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-indigo-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Granizo Singular</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Granizo de diámetro superior a 2 cm o acumulaciones extraordinarias.</div>
                </div>
                <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20 text-rose-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Reventones</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Frentes de racha brutales originados por desplomes de nubes cumulonimbus.</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 text-blue-400">
                  <div className="font-sans font-bold text-[11px] uppercase tracking-wider">Precipitación Súbita</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-sans">Lluvia torrencial que acumula más de 10 mm en tan solo 10 minutos.</div>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-4.5 space-y-3.5 flex flex-col justify-between">
              <div>
                <h4 className="font-sans font-bold text-slate-200 text-xs uppercase border-b border-slate-900 pb-2 mb-2">
                  Enlaces SINOBAS
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Use estas referencias para remitir un informe ciudadano de fenómeno extremo o monitorizar reportes validados por meteorólogos de AEMET.
                </p>
              </div>

              <div className="space-y-2">
                <a 
                  href="https://sinobas.aemet.es/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-yellow-405 hover:text-yellow-300 font-sans font-bold rounded flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>Ir a SINOBAS Oficial</span>
                </a>
                <a 
                  href="https://sinobas.aemet.es/index.php?pag=subir" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-slate-100 font-sans font-bold rounded flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer"
                >
                  <CloudRain size={12} />
                  <span>Notificar un Fenómeno</span>
                </a>
              </div>
            </div>
          </div>

          {/* IFRAME EMBED PORTLET FOR SINOBAS */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <h3 className="font-sans font-extrabold text-[11.5px] uppercase tracking-wider text-slate-200">
                  Visor Web SINOBAS Integrado: Avisos Atmosféricos Singulares
                </h3>
              </div>
              <button
                onClick={() => setIframeErrorSinobas(!iframeErrorSinobas)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[9px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                Carga de Contingencia: {iframeErrorSinobas ? 'Remoto' : 'Muestra Iframe'}
              </button>
            </div>

            {iframeErrorSinobas ? (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 text-center text-slate-400 space-y-4 font-sans">
                <Info size={32} className="mx-auto text-yellow-500/80" />
                <div className="max-w-md mx-auto space-y-2">
                  <h4 className="text-slate-200 text-xs font-sans font-bold uppercase">Restricción de Marco SINOBAS Detectada</h4>
                  <p className="text-[11px] leading-relaxed font-sans text-slate-400">
                    Las políticas gubernamentales de seguridad <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-400 text-[10px]">X-Frame-Options</code> o políticas de cookies de la plataforma de España de SINOBAS pueden impedir su previsualización interactiva. Pulse el botón inferior para abrirlo directamente de forma externa.
                  </p>
                </div>
                <a
                  href="https://sinobas.aemet.es/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-sans font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>Cargar SINOBAS (Ventana Nueva)</span>
                </a>
              </div>
            ) : (
              <div className="relative border border-slate-800 rounded-lg overflow-hidden h-[450px] bg-slate-900 flex flex-col justify-between">
                <iframe 
                  src="https://sinobas.aemet.es/" 
                  className="w-full h-full border-none bg-white font-sans text-xs"
                  title="AEMET SINOBAS Portal"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  onError={() => setIframeErrorSinobas(true)}
                />
                <div className="absolute bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-900 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-sans">
                    <Info size={13} className="text-yellow-400 shrink-0" />
                    <span>Visor en vivo de observaciones singulares severas notificadas por ciudadanos en España.</span>
                  </div>
                  <a 
                    href="https://sinobas.aemet.es/" 
                    target="_blank"  
                    rel="noreferrer" 
                    className="px-2.5 py-1 bg-yellow-950 hover:bg-yellow-904 border border-yellow-450/40 text-yellow-200 hover:text-yellow-100 text-[10px] font-sans font-bold rounded flex items-center justify-center gap-1 transition shrink-0 cursor-pointer"
                  >
                    <span>Abrir en Nueva Pestaña</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
