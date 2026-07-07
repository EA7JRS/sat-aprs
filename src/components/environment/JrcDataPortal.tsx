import { useState, useEffect, FormEvent } from 'react';
import { 
  Database, Search, Filter, Compass, Download, RefreshCw, 
  ExternalLink, Info, Calendar, MapPin, Layers, ShieldAlert, 
  CheckCircle, HelpCircle, Code, ChevronRight, Activity, LineChart, AlertCircle,
  Radio, Map, Power, AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, BarChart, Bar, Cell, Legend, PieChart, Pie
} from 'recharts';

interface ResourceType {
  name: string;
  format: string;
  size: string;
}

interface JrcDataset {
  pid: string;
  title: string;
  description: string;
  publisher: string;
  issued: string;
  modified: string;
  themes: string[];
  spatial: string;
  temporal: string;
  status: string;
  citation: string;
  metrics?: {
    totalBurntHectares?: number;
    activeFireFociCount?: number;
    severityIndex?: string;
    averageDoseRateUsVh?: number;
    reportingStationsCount?: number;
    safetyStatus?: string;
    carbonTonsCo2e?: number;
    pm25AverageUgm3?: number;
    trendPercentage?: number;
    alertLevelsActive?: number;
    dischargeMaxM3s?: number;
    probabilityPct?: number;
    activeRedAlerts?: number;
    activeOrangeAlerts?: number;
    earthquakeIndicatorCount?: number;
    cadmiumAvgMgKg?: number;
    leadAvgMgKg?: number;
    degradationRiskIndex?: string;
  };
  resources: ResourceType[];
}

export default function JrcDataPortal() {
  const [datasets, setDatasets] = useState<JrcDataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<JrcDataset | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');
  const [apiIsSimulated, setApiIsSimulated] = useState<boolean>(true);
  const [isOfficialConnected, setIsOfficialConnected] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'meta' | 'visualizer' | 'scripting'>('meta');
  const [scriptLanguage, setScriptLanguage] = useState<'curl' | 'python' | 'node'>('curl');

  // REMAP Stations integrated states
  const [portalView, setPortalView] = useState<'remap' | 'datasets'>('remap'); // Default to remap so the stations database is open on first display
  const [remapStations, setRemapStations] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);
  const [stationHistory, setStationHistory] = useState<any[]>([]);
  const [remapSearch, setRemapSearch] = useState<string>('');
  const [remapCountry, setRemapCountry] = useState<string>('ALL');
  const [remapStatus, setRemapStatus] = useState<string>('all');
  const [stationsLoading, setStationsLoading] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [sirenActive, setSirenActive] = useState<boolean>(false);
  const [triggeringAlert, setTriggeringAlert] = useState<boolean>(false);

  // Load datasets on mount & query changes
  const fetchJrcDatasets = async (query: string = '', theme: string = 'all') => {
    setLoading(true);
    setErrorNotice(null);
    try {
      const response = await customFetch(`/api/jrc/datasets?q=${encodeURIComponent(query)}&theme=${encodeURIComponent(theme)}`);
      if (response.ok) {
        const body = await response.json();
        const resultsList = body.datasets || [];
        setDatasets(resultsList);
        setApiIsSimulated(!!body.isSimulated);
        setIsOfficialConnected(!body.isSimulated);
        
        // Pick first dataset if none selected or the previous is not in list
        if (resultsList.length > 0) {
          // If previous exists find it, otherwise select first
          const found = resultsList.find((d: any) => d.pid === selectedDataset?.pid);
          setSelectedDataset(found || resultsList[0]);
        } else {
          setSelectedDataset(null);
        }
      } else {
        throw new Error(`La API respondió con código ${response.status}`);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Fallo de conexión.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch REMAP stations database
  const fetchRemapStations = async () => {
    setStationsLoading(true);
    try {
      const resp = await customFetch(`/api/jrc/remap-stations?q=${encodeURIComponent(remapSearch)}&country=${encodeURIComponent(remapCountry)}&status=${encodeURIComponent(remapStatus)}`);
      if (resp.ok) {
        const data = await resp.json();
        const list = data.stations || [];
        setRemapStations(list);
        setSirenActive(!!data.sirenActive);
        
        // Auto-select first station if empty, or match existing
        if (list.length > 0) {
          const current = list.find((s: any) => s.id === selectedStation?.id);
          setSelectedStation(current || list[0]);
        } else {
          setSelectedStation(null);
        }
      }
    } catch (err) {
      console.error("Error fetching REMAP stations list:", err);
    } finally {
      setStationsLoading(false);
    }
  };

  // Fetch 24h radioactivity history for selected station
  const fetchStationHistory = async (stationId: string) => {
    if (!stationId) return;
    setHistoryLoading(true);
    try {
      const resp = await customFetch(`/api/jrc/remap-stations/${stationId}/history`);
      if (resp.ok) {
        const data = await resp.json();
        setStationHistory(data.history || []);
      }
    } catch (err) {
      console.error("Error fetching station history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Trigger test-incident simulations
  const toggleNuclearAlert = async (stationId: string, activate: boolean) => {
    setTriggeringAlert(true);
    try {
      const resp = await customFetch('/api/jrc/remap-stations/trigger-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, active: activate })
      });
      if (resp.ok) {
        const data = await resp.json();
        setSirenActive(!!data.sirenActive);
        // Instant refreshing of values
        await fetchRemapStations();
        if (selectedStation) {
          await fetchStationHistory(selectedStation.id);
        }
      }
    } catch (err) {
      console.error("Error triggering REMAP nuclear alert simulation:", err);
    } finally {
      setTriggeringAlert(false);
    }
  };

  // Effects loading
  useEffect(() => {
    fetchJrcDatasets(searchQuery, selectedTheme);
  }, []);

  useEffect(() => {
    fetchRemapStations();
  }, [remapSearch, remapCountry, remapStatus]);

  useEffect(() => {
    if (selectedStation?.id) {
      fetchStationHistory(selectedStation.id);
    }
  }, [selectedStation?.id]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchJrcDatasets(searchQuery, selectedTheme);
  };

  const handleThemeFilter = (theme: string) => {
    setSelectedTheme(theme);
    fetchJrcDatasets(searchQuery, theme);
  };

  const triggerDownloadSimulated = (filename: string) => {
    setDownloadSuccess(filename);
    setTimeout(() => setDownloadSuccess(null), 3000);

    // Create a dummy JSON file and download it
    const dataObj = {
      source: "European Commission Joint Research Centre (JRC) Data Portal Proxy",
      disclaimer: "Legal Notice: This dataset is republished for civil protection telemetry testing. Re-use under JRC conditions.",
      extractedAt: new Date().toISOString(),
      datasetId: selectedDataset?.pid,
      title: selectedDataset?.title,
      spatialExtent: selectedDataset?.spatial,
      content: {
        simulation_active: true,
        metrics: selectedDataset?.metrics,
        status: selectedDataset?.status,
        series: getAnalyticalData()
      }
    };

    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDataset?.pid || 'jrc_dataset'}_export.json`;
    a.click();
  };

  // Helper to generate chart series depending on active dataset
  const getAnalyticalData = () => {
    if (!selectedDataset) return [];

    const pid = selectedDataset.pid;
    if (pid.includes('effis')) {
      // Wildfire Area Hectares (Spain)
      return [
        { year: '2019', hectareas: 83200, focos: 8 },
        { year: '2020', hectareas: 65900, focos: 5 },
        { year: '2021', hectareas: 94100, focos: 11 },
        { year: '2022', hectareas: 308100, focos: 32 }, // Heatwave year
        { year: '2023', hectareas: 89000, focos: 10 },
        { year: '2024', hectareas: 76400, focos: 9 },
        { year: '2025', hectareas: 112000, focos: 12 },
        { year: '2026', hectareas: 142300, focos: 14 }
      ];
    } else if (pid.includes('eurdep')) {
      // Nuclear Gamma Dose Rate in last 8 hours
      return [
        { hora: '10:00', doseRates: 0.112, avg: 0.115 },
        { hora: '11:00', doseRates: 0.114, avg: 0.115 },
        { hora: '12:00', doseRates: 0.115, avg: 0.115 },
        { hora: '13:00', doseRates: 0.117, avg: 0.115 },
        { hora: '14:00', doseRates: 0.121, avg: 0.115 }, // slightly higher
        { hora: '15:00', doseRates: 0.115, avg: 0.115 },
        { hora: '16:00', doseRates: 0.114, avg: 0.115 },
        { hora: '17:00', doseRates: 0.115, avg: 0.115 }
      ];
    } else if (pid.includes('edgar')) {
      // Atmospheric emissions distribution (Sector Breakdown in ktons CO2eq)
      return [
        { name: 'Power Industry', value: 92400 },
        { name: 'Combustion & Heating', value: 41200 },
        { name: 'Road Transport', value: 72100 },
        { name: 'Agriculture (CH4/N2O)', value: 24300 },
        { name: 'Industrial Waste', value: 17800 }
      ];
    } else if (pid.includes('efas')) {
      // Hydrological Hydrograph River Flow
      return [
        { dia: 'Jun 12', caudal: 420, threshold: 1200 },
        { dia: 'Jun 13', caudal: 512, threshold: 1200 },
        { dia: 'Jun 14', caudal: 640, threshold: 1200 },
        { dia: 'Jun 15', caudal: 950, threshold: 1200 }, // Rain storm
        { dia: 'Jun 16', caudal: 1440, threshold: 1200 }, // OVER THRESHOLD
        { dia: 'Jun 17', caudal: 1100, threshold: 1200 },
        { dia: 'Jun 18', caudal: 810, threshold: 1200 },
        { dia: 'Jun 19', caudal: 715, threshold: 1200 }
      ];
    } else if (pid.includes('gdacs')) {
      // GDACS disasters indicators (Events by continent)
      return [
        { type: 'Terremotos', count: 5, fill: '#ef4444' },
        { type: 'Tormentas/Ciclones', count: 12, fill: '#fbbf24' },
        { type: 'Inundaciones', count: 8, fill: '#3b82f6' },
        { type: 'Sequías', count: 3, fill: '#10b981' },
        { type: 'Erupciones Volcano', count: 2, fill: '#ec4899' }
      ];
    } else if (pid.includes('esdac')) {
      // Topsoil Heavy Metals (mg / kg) vs EC Target
      return [
        { metal: 'Cobre (Cu)', actual: 12.4, maxSafety: 50.0 },
        { metal: 'Mercurio (Hg)', actual: 0.04, maxSafety: 1.0 },
        { metal: 'Plomo (Pb)', actual: 15.4, maxSafety: 100.0 },
        { metal: 'Cadmio (Cd)', actual: 0.18, maxSafety: 3.0 }
      ];
    }

    return [
      { name: 'Hitos', valor: 45 },
      { name: 'Muestras', valor: 60 },
      { name: 'Estudios', valor: 30 }
    ];
  };

  const getAPIClientScript = () => {
    if (!selectedDataset) return '';

    const endpointUrl = `https://data.jrc.ec.europa.eu/api/v2/datasets/${selectedDataset.pid}`;
    
    if (scriptLanguage === 'curl') {
      return `# Consultar metadatos oficiales del dataset JRC usando cURL
curl -X GET "${endpointUrl}" \\
     -H "accept: application/json"`;
    }

    if (scriptLanguage === 'node') {
      return `// Sincronizador de metadatos JRC Europa en Node.js (ESM)
import fetch from 'node-fetch';

const DATASET_PID = '${selectedDataset.pid}';
const JRC_API_URL = \`https://data.jrc.ec.europa.eu/api/v2/datasets/\${DATASET_PID}\`;

async function syncJrcReport() {
  try {
    const response = await customFetch(JRC_API_URL, {
      headers: { 'accept': 'application/json' }
    });
    
    if (!response.ok) throw new Error(\`Network error: \${response.status}\`);
    const payload = await response.json();
    
    console.log('----- REPORTE OFICIAL JRC -----');
    console.log('PID:', payload.pid || '${selectedDataset.pid}');
    console.log('Título:', payload.title || '${selectedDataset.title}');
    console.log('Modificado:', payload.modified || '${selectedDataset.modified}');
    console.log('Recursos descargables:', payload.resources?.length || 0);
  } catch (error) {
    console.error('Error de contacto JRC:', error.message);
  }
}

syncJrcReport();`;
    }

    // Python script
    return `# Sincronizador de metadatos JRC Europa en Python (requests)
import requests

dataset_pid = "${selectedDataset.pid}"
url = f"https://data.jrc.ec.europa.eu/api/v2/datasets/{dataset_pid}"

try:
    response = requests.get(url, headers={"accept": "application/json"})
    response.raise_for_status()
    payload = response.json()
    
    print("----- REPORTE CIENTÍFICO JRC CORTE COMISIÓN EUROPEA -----")
    print(f"PID: {payload.get('pid', dataset_pid)}")
    print(f"Título: {payload.get('title', '${selectedDataset.title}')}")
    print(f"Publicador: {payload.get('publisher', 'DG JRC')}")
    print(f"Espacial: {payload.get('spatial', '${selectedDataset.spatial}')}")
except Exception as e:
    print("Error de enlace API v2 de JRC:", e)`;
  };

  return (
    <div className="flex flex-col gap-4 font-mono text-xs" id="jrc-science-portal">
      
      {/* MODULE MAIN TITLE HEADER */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2.5 bg-indigo-950/40 border border-indigo-400/30 text-indigo-400 font-bold rounded text-[10px] uppercase">
              EU Joint Research Centre (JRC) v2
            </div>
            <span className="text-[10px] text-slate-500 font-mono">• PORTAL DE CIENCIA Y TELEMETRÍA DE LA COMISIÓN EUROPEA</span>
          </div>
          
          <h1 className="font-sans font-extrabold text-lg text-slate-100 tracking-tight flex items-center gap-2">
            <Database className="text-indigo-400 animate-pulse" size={18} />
            Ecosistema de Datos Abiertos de Emergencia y Riesgos Científicos
          </h1>
          
          <p className="text-xs text-slate-300 font-serif leading-relaxed">
            Consola científica enlazada directamente con la API pública v2 de <strong className="text-slate-200">data.jrc.ec.europa.eu</strong>. Acceda de forma sincronizada al repositorio analítico del Centro de Investigación Conjunta (JRC). Monitoree incendios forestales (EFFIS), emisiones regionales (EDGAR), caudales de inundación (EFAS) y radiación continental recombinada en tiempo real.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <a
            href="https://data.jrc.ec.europa.eu/swagger?urls.primaryName=Public+API+v2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] bg-slate-900 border border-slate-800 hover:border-indigo-400/30 hover:bg-slate-800 text-indigo-300 px-3.5 py-2.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Swagger API v2 Oficial</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* SECTOR SELECTOR: DATASETS CATALOG VS REMAP STATIONS DB */}
      <div className="grid grid-cols-1 md:grid-cols-2 bg-slate-950 p-1.5 rounded-xl border border-slate-900 gap-1 select-none text-center">
        <button
          onClick={() => setPortalView('remap')}
          className={`py-3 px-4 rounded-lg font-sans font-bold text-xs flex items-center justify-center gap-2.5 cursor-pointer transition-all ${
            portalView === 'remap'
              ? 'bg-indigo-950/45 border border-indigo-500/40 text-slate-100 shadow-md shadow-indigo-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Radio size={14} className={sirenActive ? 'text-red-500 animate-pulse' : 'text-indigo-400'} />
          <span>Monitoreo Radiológico REMAP (Advanced.aspx)</span>
          {sirenActive && (
            <span className="px-1.5 py-0.5 rounded bg-red-600 text-slate-50 text-[8px] font-sans font-bold uppercase animate-bounce">
              Sirena Alerta
            </span>
          )}
        </button>

        <button
          onClick={() => setPortalView('datasets')}
          className={`py-3 px-4 rounded-lg font-sans font-bold text-xs flex items-center justify-center gap-2.5 cursor-pointer transition-all ${
            portalView === 'datasets'
              ? 'bg-indigo-950/45 border border-indigo-500/40 text-slate-100 shadow-md shadow-indigo-950/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Database size={14} className="text-indigo-400" />
          <span>Repositorio de Datasets JRC v2 Commons</span>
        </button>
      </div>

      {portalView === 'datasets' && (
        <>

      {/* FILTER BUTTONS ROW */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-3 rounded-lg border border-slate-900">
        
        {/* Topic Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Todos los Temas' },
            { id: 'Wildfires', label: '🔥 Incendios & EFFIS' },
            { id: 'Radioactivity', label: '☢️ Radiación & REM' },
            { id: 'Atmosphere and Emissions', label: '💨 Atmósfera & EDGAR' },
            { id: 'Hydro-meteorology', label: '🌊 Hidrología & EFAS' },
            { id: 'Natural Disasters', label: '🌋 Emergencias GDACS' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleThemeFilter(item.id)}
              className={`px-3 py-1.5 rounded text-[10px] font-bold font-sans cursor-pointer transition-colors ${
                (item.id === 'all' && selectedTheme === 'all') || selectedTheme === item.id || (item.id !== 'all' && selectedTheme.toLowerCase().includes(item.id.toLowerCase()))
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-2">
          <div className={`p-1 px-2.5 rounded-full flex items-center gap-1.5 text-[10px] border ${
            isOfficialConnected 
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-400' 
              : 'bg-amber-950/30 border-amber-500/40 text-amber-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOfficialConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'}`} />
            <span>
              {isOfficialConnected ? 'API JRC EN VIVO (Conectado)' : 'FALLBACK COGNITIVO (Simulado)'}
            </span>
          </div>

          <button
            onClick={() => fetchJrcDatasets(searchQuery, selectedTheme)}
            disabled={loading}
            className="p-1.5 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-50 cursor-pointer"
            title="Refrescar catálogo científico desde la CE"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* CORE WORKSPACE SECTION: SEARCH BAR & LEFT / RIGHT SPLIT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        
        {/* SIDEBAR: SEARCH & DATASETS RESULTS COLUMN */}
        <div className="xl:col-span-1 flex flex-col gap-4">
          
          {/* SEARCH FORM */}
          <form onSubmit={handleSearchSubmit} className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-2 shadow-md">
            <h3 className="font-sans font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <Compass size={14} className="text-indigo-400" />
              Filtrar Catálogo Europeo
            </h3>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar (ej. fire, nuclear, efas, spain...)"
                className="w-full bg-slate-905 bg-slate-900 border border-slate-800 rounded px-3 py-2 pl-8 text-slate-200 focus:outline-none focus:border-indigo-500 text-[11px]"
              />
              <Search size={12} className="absolute left-2.5 top-3 text-slate-500" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-1.5 bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-500/30 rounded font-sans font-bold text-[10px] hover:text-white transition-all cursor-pointer"
            >
              {loading ? 'Consultando JRC...' : 'Buscar Datasets'}
            </button>
          </form>

          {/* DATASETS RESULTS CATALOG */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-2 shadow-md">
            
            <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-slate-900">
              <span className="font-bold">RESULTADOS ({datasets.length})</span>
              <span>Comisión Europea • DG JRC</span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <RefreshCw size={24} className="animate-spin text-indigo-400" />
                <span className="text-slate-500 text-[10px]">Descargando catálogo técnico de la CE...</span>
              </div>
            ) : datasets.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
                <AlertCircle size={20} className="text-slate-600" />
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-400 block">Sin coincidencias</span>
                  <span className="text-slate-500 text-[10px] leading-relaxed">No se encontraron datasets con estos filtros en el portal. Pruebe otra búsqueda.</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[450px] overflow-y-auto scrollbar-thin">
                {datasets.map((dataset) => {
                  const isSelected = selectedDataset?.pid === dataset.pid;
                  return (
                    <button
                      key={dataset.pid}
                      onClick={() => {
                        setSelectedDataset(dataset);
                        setActiveAnalysisTab('meta');
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 ${
                        isSelected 
                          ? 'bg-indigo-950/20 border-indigo-500/40 text-indigo-200' 
                          : 'bg-slate-900/50 border-slate-900/70 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {dataset.themes.slice(0, 2).map((t, idx) => (
                            <span 
                              key={idx} 
                              className="px-1 py-0.2 text-[8px] bg-slate-950 border border-slate-800 text-indigo-300 rounded font-sans uppercase font-bold"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <h4 className="font-sans font-bold text-[11px] text-slate-200 leading-tight">
                          {dataset.title}
                        </h4>
                      </div>

                      <p className="text-[10px] line-clamp-2 text-slate-400 italic">
                        {dataset.description}
                      </p>

                      <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1.5 border-t border-slate-900">
                        <span className="font-mono">PID: {dataset.pid.substring(0, 24)}...</span>
                        <span>{dataset.modified}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            
          </div>

        </div>

        {/* WORKSPACE DETAILED EXPLORER: METADATA & GRAPHICAL ANALYTICAL PREVIEW */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          
          {selectedDataset ? (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4 shadow-md">
              
              {/* SELECTED HEADER */}
              <div className="border-b border-slate-900 pb-3.5 space-y-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[9px] text-indigo-400 font-bold block uppercase tracking-wider">
                      DATASET REPORT • persistent raw ID: {selectedDataset.pid}
                    </span>
                    <h2 className="font-sans font-extrabold text-base text-slate-100 tracking-tight leading-tight">
                      {selectedDataset.title}
                    </h2>
                  </div>

                  <span className="px-2 py-0.5 select-none bg-indigo-950/40 border border-indigo-400/30 text-indigo-300 rounded text-[9px] font-sans font-extrabold uppercase">
                    {selectedDataset.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-mono pt-1">
                  <span className="flex items-center gap-1">
                    <MapPin size={11} className="text-slate-500" />
                    Región: <strong className="text-slate-300">{selectedDataset.spatial}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={11} className="text-slate-500" />
                    Temporal: <strong className="text-slate-300">{selectedDataset.temporal}</strong>
                  </span>
                </div>
              </div>

              {/* THREE MAIN WORKSPACE ACTIONS: META / ANALYTICS VISUALIZER / SCRIPT-API CODE */}
              <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-900">
                <button
                  onClick={() => setActiveAnalysisTab('meta')}
                  className={`flex-1 py-2 rounded text-[10px] font-bold font-sans flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    activeAnalysisTab === 'meta' 
                      ? 'bg-indigo-600/90 text-white' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Info size={11} />
                  Ficha de Metadatos
                </button>
                <button
                  onClick={() => setActiveAnalysisTab('visualizer')}
                  className={`flex-1 py-2 rounded text-[10px] font-bold font-sans flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    activeAnalysisTab === 'visualizer' 
                      ? 'bg-indigo-600/90 text-white' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LineChart size={11} />
                  Analítica Integrada (Gráficos)
                </button>
                <button
                  onClick={() => setActiveAnalysisTab('scripting')}
                  className={`flex-1 py-2 rounded text-[10px] font-bold font-sans flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    activeAnalysisTab === 'scripting' 
                      ? 'bg-indigo-600/90 text-white' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code size={11} />
                  Enlace de Integración API
                </button>
              </div>

              {/* PAGE SUB-SECTIONS COMPARED */}
              
              {/* VIEW 1: DATASET METADATA DETAILS */}
              {activeAnalysisTab === 'meta' && (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* ABSTRACT AND INTRODUCTION DESCRIPTION */}
                  <div className="space-y-2">
                    <h3 className="font-sans font-bold text-slate-200 text-xs">Resumen Técnico (Abstract)</h3>
                    <p className="text-xs text-slate-300 font-serif leading-relaxed italic bg-slate-900/30 p-3.5 rounded-lg border border-slate-900/50">
                      &ldquo;{selectedDataset.description}&rdquo;
                    </p>
                  </div>

                  {/* DETAILS KEY-VALUES GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1.5">
                    
                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-900 flex flex-col gap-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Procedencia & Citaciones</span>
                      <div className="space-y-1.5 text-slate-400">
                        <div>• Autor / Editor: <strong className="text-slate-200">{selectedDataset.publisher}</strong></div>
                        <div>• Fecha de Emisión: <strong className="text-slate-200">{selectedDataset.issued}</strong></div>
                        <div>• Última Revisión: <strong className="text-slate-200">{selectedDataset.modified}</strong></div>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-900 flex flex-col gap-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Gobernanza de Datos Abiertos</span>
                      <div className="space-y-1.5 text-slate-400">
                        <div>• Formado de Origen: <strong className="text-slate-200">NetCDF, GeoJSON, GRIB2</strong></div>
                        <div>• Licencia: <strong className="text-slate-200">Creative Commons Attribution 4.0</strong></div>
                        <div>• Sincronización: <strong className="text-emerald-400">Libre de Clave (Public Open)</strong></div>
                      </div>
                    </div>

                  </div>

                  <div className="bg-slate-900/30 p-3.5 rounded-lg border border-slate-900 space-y-2">
                    <h4 className="text-[10px] text-slate-400 font-bold uppercase">Cita Oficial para Estudios Oficiales:</h4>
                    <p className="text-[10px] text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 leading-normal select-all">
                      {selectedDataset.citation}
                    </p>
                  </div>

                  {/* DOWNLOADABLE RAW RESOURCES LIST */}
                  <div className="space-y-2 pt-2">
                    <h3 className="font-sans font-bold text-slate-200 text-xs">Recursos y Archivos Científicos Disponibles</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {selectedDataset.resources.map((resItem, idx) => (
                        <div 
                          key={idx}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-3 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="space-y-0.5 max-w-[70%]">
                            <span className="font-sans font-extrabold text-[11px] text-slate-100 block truncate">{resItem.name}</span>
                            <span className="text-[9px] text-slate-500">Peso: {resItem.size} | Formato: {resItem.format}</span>
                          </div>

                          <button 
                            onClick={() => triggerDownloadSimulated(resItem.name)}
                            className="p-2 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-white rounded border border-indigo-400/30 transition-colors cursor-pointer flex items-center gap-1.5"
                            title="Descargar payload JSON local comprimido"
                          >
                            <Download size={12} />
                            <span className="text-[10px] font-bold font-sans">Descargar</span>
                          </button>
                        </div>
                      ))}
                    </div>

                    {downloadSuccess && (
                      <div className="p-2 py-1.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 rounded text-[10px] flex items-center gap-1.5">
                        <CheckCircle size={12} />
                        <span>Fichero &quot;{downloadSuccess}&quot; preparado y descargado con éxito desde el servidor proxy JRC.</span>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* VIEW 2: GRAPHICAL ANALYTICAL PREVIEW (CHARTS) */}
              {activeAnalysisTab === 'visualizer' && (
                <div className="space-y-4 animate-fade-in">
                  
                  {/* METRICS HEADER CARDS */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    
                    {selectedDataset.pid.includes('effis') && (
                      <>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Total Superficie Quemada</span>
                          <span className="text-sm font-sans font-extrabold text-red-400 block mt-1">142,300 Hectáreas</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Acumulado peninsular Iberia 2026</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Focos de Incendio Activos</span>
                          <span className="text-sm font-sans font-extrabold text-amber-400 block mt-1">14 focos</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Detectado por Sentinel VIIRS</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 col-span-2 md:col-span-1">
                          <span className="text-[9px] text-slate-500 uppercase block">Índice de Gravedad JRC</span>
                          <span className="text-sm font-sans font-extrabold text-red-500 block mt-1">ALTO / SEVERO</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Preocupante (Secas estacionales)</span>
                        </div>
                      </>
                    )}

                    {selectedDataset.pid.includes('eurdep') && (
                      <>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Dosis de Gamma Promedio</span>
                          <span className="text-sm font-sans font-extrabold text-emerald-400 block mt-1">0.115 µSv/h</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Fondo radiactivo natural estable</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Estaciones Integradas</span>
                          <span className="text-sm font-sans font-extrabold text-blue-400 block mt-1">4,320 Sondas</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Red EURDEP Unión Europea</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 col-span-2 md:col-span-1">
                          <span className="text-[9px] text-slate-500 uppercase block">Seguridad del Sistema</span>
                          <span className="text-sm font-sans font-extrabold text-emerald-400 block mt-1">NOMINAL ESTABLE</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Cero anomalías detectadas hoy</span>
                        </div>
                      </>
                    )}

                    {selectedDataset.pid.includes('edgar') && (
                      <>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Emisiones CO2 Equivalentes</span>
                          <span className="text-sm font-sans font-extrabold text-amber-500 block mt-1">247.8 Millones Ton</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Cálculo sectorial EDGAR Iberia</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Concentración PM2.5 Media</span>
                          <span className="text-sm font-sans font-extrabold text-emerald-400 block mt-1">11.2 µg/m³</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Ligeramente superior a objetivo OMS</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 col-span-2 md:col-span-1">
                          <span className="text-[9px] text-slate-500 uppercase block">Variación Interanual</span>
                          <span className="text-sm font-sans font-extrabold text-emerald-400 block mt-1">-3.4% Decadente</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Reducción leve por energía limpia</span>
                        </div>
                      </>
                    )}

                    {selectedDataset.pid.includes('efas') && (
                      <>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Umbrales Críticos Activos</span>
                          <span className="text-sm font-sans font-extrabold text-amber-400 block mt-1">2 Alertas</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">En cuencas de ríos principales</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Caudal Máximo Simulado</span>
                          <span className="text-sm font-sans font-extrabold text-blue-400 block mt-1">1,840 m³/s</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Pico de crecida en hidrograma</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 col-span-2 md:col-span-1">
                          <span className="text-[9px] text-slate-500 uppercase block">Probabilidad Desborde</span>
                          <span className="text-sm font-sans font-extrabold text-red-400 block mt-1">88% (EXTREMO)</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Alerta en tramo alto del Ebro</span>
                        </div>
                      </>
                    )}

                    {selectedDataset.pid.includes('gdacs') && (
                      <>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Alertas Rojas Activas</span>
                          <span className="text-sm font-sans font-extrabold text-red-500 block mt-1">1 Alerta Roja</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Sismicidad de impacto alto</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Alertas Naranjas Activas</span>
                          <span className="text-sm font-sans font-extrabold text-amber-500 block mt-1">3 Alertas</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Inundaciones continentales</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 col-span-2 md:col-span-1">
                          <span className="text-[9px] text-slate-500 uppercase block">Indicadores Sísmicos</span>
                          <span className="text-sm font-sans font-extrabold text-indigo-400 block mt-1">5 Terremotos</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Monitoreados en las últimas 24h</span>
                        </div>
                      </>
                    )}

                    {selectedDataset.pid.includes('esdac') && (
                      <>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Plomo Promedio Topsoil</span>
                          <span className="text-sm font-sans font-extrabold text-yellow-400 block mt-1">15.4 mg/kg</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">LUCAS soil sampling survey</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900">
                          <span className="text-[9px] text-slate-500 uppercase block">Cadmio Promedio</span>
                          <span className="text-sm font-sans font-extrabold text-emerald-400 block mt-1">0.18 mg/kg</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Muy por debajo de umbral nocivo</span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-900 col-span-2 md:col-span-1">
                          <span className="text-[9px] text-slate-500 uppercase block">Riesgo de Degradación</span>
                          <span className="text-sm font-sans font-extrabold text-amber-400 block mt-1">MEDIO (Erosión)</span>
                          <span className="text-[9px] text-slate-500 mt-1 block">Alerta en regiones semiáridas</span>
                        </div>
                      </>
                    )}

                  </div>

                  {/* VISUALIZER DYNAMIC RENDERER USING RECHARTS */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-3">
                    
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                      <h4 className="text-[10px] text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Activity size={12} className="text-indigo-400" />
                        Serie Analítica en Tiempo Real (Representación de Base de Datos JRC):
                      </h4>
                      <span className="text-[9px] text-slate-500">Unidad: Unidades de la Comisión Europea</span>
                    </div>

                    <div className="h-[240px]">
                      
                      {/* 1. EFFIS GRAPH: FIRES AND BURNT AREA */}
                      {selectedDataset.pid.includes('effis') && (
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <AreaChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorHectareas" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="year" stroke="#475569" fontSize={9} />
                            <YAxis name="Ha" stroke="#475569" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                            <Legend wrapperStyle={{ fontSize: '9px' }} />
                            <Area type="monotone" dataKey="hectareas" name="Área Quemada (Hectáreas)" stroke="#ef4444" fillOpacity={1} fill="url(#colorHectareas)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}

                      {/* 2. EURDEP RADIATION GRAPH */}
                      {selectedDataset.pid.includes('eurdep') && (
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <AreaChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorDoses" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="hora" stroke="#475569" fontSize={9} />
                            <YAxis domain={[0.08, 0.15]} stroke="#475569" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                            <Legend wrapperStyle={{ fontSize: '9px' }} />
                            <Area type="monotone" dataKey="doseRates" name="Dosis Medida (µSv/h)" stroke="#10b981" fillOpacity={1} fill="url(#colorDoses)" />
                            <Area type="monotone" dataKey="avg" name="Fondo Promedio" stroke="#3b82f6" strokeDasharray="5 5" fill="none" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}

                      {/* 3. EDGAR EMISSIONS PIE */}
                      {selectedDataset.pid.includes('edgar') && (
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <BarChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                            <YAxis name="ktons" stroke="#475569" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                            <Bar dataKey="value" name="Emisión CO2 Equivalente (ktons)" fill="#fbbf24">
                              {getAnalyticalData().map((entry: any, index: number) => {
                                const colors = ['#f87171', '#fbbf24', '#38bdf8', '#818cf8', '#34d399'];
                                return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}

                      {/* 4. EFAS HYDROGRAPH ROUTING */}
                      {selectedDataset.pid.includes('efas') && (
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <AreaChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorCaudal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="dia" stroke="#475569" fontSize={9} />
                            <YAxis stroke="#475569" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                            <Legend wrapperStyle={{ fontSize: '9px' }} />
                            <Area type="monotone" dataKey="caudal" name="Caudal de Río (m³/s)" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCaudal)" />
                            <Area type="monotone" dataKey="threshold" name="Umbral Crítico Inundación" stroke="#ef4444" strokeDasharray="3 3" fill="none" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}

                      {/* 5. GDACS DISASTERS BY CATEGORY */}
                      {selectedDataset.pid.includes('gdacs') && (
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <BarChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="type" stroke="#475569" fontSize={9} />
                            <YAxis stroke="#475569" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                            <Bar dataKey="count" name="Llamados de Alerta Activos" fill="#e2e8f0">
                              {getAnalyticalData().map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}

                      {/* 6. ESDAC TOPSOIL SOILS */}
                      {selectedDataset.pid.includes('esdac') && (
                        <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                          <BarChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="metal" stroke="#475569" fontSize={9} />
                            <YAxis stroke="#475569" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                            <Legend wrapperStyle={{ fontSize: '9px' }} />
                            <Bar dataKey="actual" name="Concentración Real (mg/kg)" fill="#a78bfa" />
                            <Bar dataKey="maxSafety" name="Límite Máximo Ecológico (mg/kg)" fill="#f87171" opacity={0.3} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}

                    </div>

                    <p className="text-[10px] text-slate-500 leading-normal bg-slate-950 p-2.5 rounded border border-slate-800">
                      ℹ️ <strong>Nota científica:</strong> Esta gráfica de telemetría mapea las variables provistas por el modelo de datos de la Comisión Europea. Los picos y desbordes estimulan alertas acústicas e informadoras en los terminales municipales de REMER.
                    </p>

                  </div>

                </div>
              )}

              {/* VIEW 3: INTEGRATION API CODE SCRIPTS */}
              {activeAnalysisTab === 'scripting' && (
                <div className="space-y-4 animate-fade-in">
                  
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-900 pb-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Scripting y Automatización de Ciencia</span>
                      <h3 className="font-sans font-bold text-xs text-slate-200 font-sans">Canal de Configuración y Enlace de Descarga de Metadatos JRC</h3>
                    </div>

                    {/* Selector de lenguajes */}
                    <div className="flex bg-slate-900 border border-slate-800 rounded p-0.5">
                      {['curl', 'node', 'python'].map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setScriptLanguage(lang as any)}
                          className={`px-2.5 py-1 rounded text-[9px] font-bold font-sans cursor-pointer uppercase ${
                            scriptLanguage === lang ? 'bg-indigo-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-normal font-serif">
                    Para integrar los reportes JRC con vuestra propia consola de terminal y crear tareas programadas de bajo nivel (ej. cronjobs en Debian), use el siguiente snippet adaptado:
                  </p>

                  <div className="relative">
                    <pre className="p-4 bg-slate-900 border border-slate-900 rounded-lg text-[10px] text-slate-300 overflow-x-auto font-mono leading-relaxed select-all">
                      {getAPIClientScript()}
                    </pre>
                    <div className="absolute right-3 top-3 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[9px] text-slate-500">
                      {scriptLanguage === 'curl' ? 'BASH' : scriptLanguage === 'node' ? 'JS (ESM)' : 'PYTHON 3'}
                    </div>
                  </div>

                </div>
              )}

            </div>
          ) : (
            <div className="p-16 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center text-center gap-3 bg-slate-950">
              <Database size={32} className="text-slate-700 animate-bounce" />
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-slate-300">Seleccione un dataset cientifico JRC</h4>
                <p className="text-[11px] text-slate-405 text-slate-500 max-w-sm">
                  Utilice el menú de búsqueda y los filtros de la izquierda para seleccionar un dataset del catálogo europeo y desplegar su ficha de metadatos completa, gráficos y scripts de sincronización.
                </p>
              </div>
            </div>
          )}

        </div>

      </div>
      </>
    )}

    {/* VIEW 2: EURDEP/REMAP LIVE STATIONS DATABASE MONITOR */}
    {portalView === 'remap' && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 animate-fade-in" id="remap-stations-view">
        
        {/* COLUMN 1: STATIONS LIST AND FILTERS SIDEBAR */}
        <div className="xl:col-span-1 flex flex-col gap-4">
          
          {/* SEARCH AND FILTERS CARD */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3.5 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <h3 className="font-sans font-bold text-slate-200 text-xs flex items-center gap-2">
                <Filter size={13} className="text-indigo-400" />
                Filtrar Red REMAP
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">EURDEP Network v2</span>
            </div>

            {/* SEARCH INPUT */}
            <div className="space-y-1 font-sans">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Código o Nombre Estación</label>
              <div className="relative">
                <input
                  type="text"
                  value={remapSearch}
                  onChange={(e) => setRemapSearch(e.target.value)}
                  placeholder="Buscar (ej. ES0002, Almaraz, Paris...)"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 pl-8 text-slate-200 focus:outline-none focus:border-indigo-500 text-[11px]"
                />
                <Search size={12} className="absolute left-2.5 top-3 text-slate-500" />
              </div>
            </div>

            {/* COUNTRY SELECTOR */}
            <div className="space-y-1 font-sans">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">País / Autoridad de Enlace</label>
              <select
                value={remapCountry}
                onChange={(e) => setRemapCountry(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-slate-300 focus:outline-none focus:border-indigo-500 text-[11px]"
              >
                <option value="ALL">🌍 Todos los Países (Europa)</option>
                <option value="ES">🇪🇸 España (CSN REA)</option>
                <option value="FR">🇫🇷 Francia (IRSN Téléray)</option>
                <option value="PT">🇵🇹 Portugal (APA RADNET)</option>
                <option value="DE">🇩🇪 Alemania (BfS ODL-Info)</option>
                <option value="IT">🇮🇹 Italia (ISPRA RESORAD)</option>
                <option value="CH">🇨🇭 Suiza (ENSI MADUK)</option>
                <option value="BE">🇧🇪 Bélgica (FANC TELERAD)</option>
              </select>
            </div>

            {/* STATUS FILTER */}
            <div className="space-y-1 font-sans">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Estado Radiológico</label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-0.5 rounded border border-slate-800 text-center">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'NORMAL', label: 'Nominal' },
                  { id: 'alert', label: 'Alerta ☢️' }
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setRemapStatus(st.id)}
                    className={`py-1.5 rounded text-[9px] font-bold cursor-pointer transition-colors ${
                      remapStatus === st.id 
                        ? 'bg-indigo-600 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {sirenActive && (
              <div className="bg-red-950/20 border border-red-500/55 rounded-lg p-3 flex items-start gap-2.5 animate-pulse font-sans">
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5 animate-bounce" size={14} />
                <div className="space-y-0.5">
                  <span className="text-[10px] text-red-200 font-bold block leading-snug">ALTA DOSIS DETECTADA</span>
                  <p className="text-[9px] text-red-400 leading-normal">
                    Sirenas civiles activadas. Balizas repetidas inyectadas automáticamente a la red S.A.T. de protección civil.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* STATIONS DISPLAY LIST CONTAINER */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-2 shadow-md">
            <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-slate-900 font-sans">
              <span className="font-bold uppercase tracking-wider">Estaciones REMAP ({remapStations.length})</span>
              <span>Frecuencia: 10m/1h</span>
            </div>

            {stationsLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="animate-spin text-indigo-400" size={24} />
                <span className="text-[10px] text-slate-500">Filtrando estaciones REMAP...</span>
              </div>
            ) : remapStations.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center gap-2">
                <AlertCircle className="text-slate-600" size={20} />
                <div className="space-y-1">
                  <span className="font-bold text-slate-400 block text-xs font-sans">Ninguna estación</span>
                  <p className="text-[10px] text-slate-500 max-w-xs leading-normal">
                    No hay estaciones que coincidan con los criterios de búsqueda o filtros radiológicos suministrados.
                    Es posible que deba simular una alerta para visualizar registros en este filtro.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto scrollbar-thin">
                {remapStations.map((st) => {
                  const isSelected = selectedStation?.id === st.id;
                  const valColor = st.status === 'ALARM' 
                    ? 'text-red-400 font-black' 
                    : st.status === 'WARN' 
                      ? 'text-amber-500 font-bold' 
                      : 'text-emerald-400';
                  
                  const countryFlag = st.country === 'ES' ? '🇪🇸' : st.country === 'FR' ? '🇫🇷' : st.country === 'PT' ? '🇵🇹' : st.country === 'DE' ? '🇩🇪' : st.country === 'IT' ? '🇮🇹' : st.country === 'CH' ? '🇨🇭' : st.country === 'BE' ? '🇧🇪' : '🌍';

                  return (
                    <button
                      key={st.id}
                      onClick={() => setSelectedStation(st)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-indigo-950/25 border-indigo-500/40 text-indigo-200' 
                          : 'bg-slate-900/45 border-slate-900/60 text-slate-400 hover:border-slate-805 hover:border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono select-none">
                          <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded font-sans font-bold text-slate-300">
                            {countryFlag} {st.id}
                          </span>
                          <span className="text-slate-500">{st.network}</span>
                        </div>
                        <h4 className="font-sans font-bold text-[11px] text-slate-200 truncate pr-1">
                          {st.name}
                        </h4>
                        <div className="text-[9px] text-slate-500 font-mono">
                          Distancia: <span className="text-indigo-400 font-bold">{st.distanciaKm.toLocaleString('es-ES')} km</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-0.5 font-mono select-none">
                        <span className={`${valColor} text-[11px]`}>
                          {st.valueNsvh} <span className="text-[8px] text-slate-500 font-normal">nSv/h</span>
                        </span>
                        <span className="text-[9px] text-slate-505 text-slate-500">
                          ({st.valueUsvh} µSv/h)
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 2 & 3: STATION CONSOLE MONITOR DASHBOARD */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          {selectedStation ? (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 flex flex-col gap-5 shadow-md">
              
              {/* STATION HEADER CARD */}
              <div className="border-b border-slate-900 pb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap select-none">
                    <span className="px-2.5 py-0.5 bg-slate-900 border border-slate-800 text-slate-100 font-mono font-bold rounded text-[9px] uppercase tracking-wider">
                      {selectedStation.country === 'ES' ? '🇪🇸 España' : selectedStation.country === 'FR' ? '🇫🇷 Francia' : selectedStation.country === 'PT' ? '🇵🇹 Portugal' : selectedStation.country === 'DE' ? '🇩🇪 Alemania' : selectedStation.country === 'IT' ? '🇮🇹 Italia' : selectedStation.country === 'CH' ? '🇨🇭 Suiza' : selectedStation.country === 'BE' ? '🇧🇪 Bélgica' : '🌍 Europa'}
                    </span>
                    <span className="text-[10px] text-slate-550 text-slate-500 font-mono">ID Estación: {selectedStation.id}</span>
                  </div>
                  <h2 className="font-sans font-extrabold text-base text-slate-100 tracking-tight leading-tight">
                    {selectedStation.name}
                  </h2>
                </div>

                <div className="shrink-0 flex items-center select-none font-sans font-bold">
                  <span className={`px-2.5 py-1 select-none rounded text-[10px] border flex items-center gap-1.5 ${
                    selectedStation.status === 'ALARM'
                      ? 'bg-red-950/40 border-red-500/50 text-red-400 animate-pulse'
                      : selectedStation.status === 'WARN'
                        ? 'bg-amber-950/40 border-amber-500/50 text-amber-400'
                        : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedStation.status === 'ALARM' ? 'bg-red-500' : selectedStation.status === 'WARN' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    NIVEL {selectedStation.status}
                  </span>
                </div>
              </div>

              {/* METRICS READOUT GRID */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* METRIC 1: LIVE GAMMA RAYS VALUE */}
                <div className="md:col-span-2 bg-slate-900 p-4 rounded-xl border border-slate-850 flex flex-col justify-between gap-3.5 shadow-inner">
                  <div>
                    <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider block font-sans">Tasa de Dosis Gamma Ambiente (Live)</span>
                    <span className="text-[10px] text-slate-500 font-mono block">Ambient Gamma Dose Rate</span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-sans font-black text-3xl text-slate-50 tracking-tight leading-none">
                      {selectedStation.valueNsvh}
                    </span>
                    <span className="text-slate-400 font-bold text-xs font-sans">nSv/h</span>
                    <span className="text-slate-600 font-mono text-[10px]">|</span>
                    <span className="font-mono text-slate-300 text-sm font-bold">{selectedStation.valueUsvh} µSv/h</span>
                  </div>

                  <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-2 flex items-center justify-between font-mono">
                    <span>Frecuencia: {selectedStation.frequency}</span>
                    <span>Historial: {selectedStation.status !== 'NORMAL' ? '🚨 DESVIADO' : '⚖️ NOMINAL'}</span>
                  </div>
                </div>

                {/* METRICS DETAIL BLOCK (COORDINATES, ALTITUDE) */}
                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-850 flex flex-col justify-between gap-1 select-none font-mono text-[10px] text-slate-400">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-sans">Ubicación y Sensor</span>
                  <div className="border-b border-slate-850 pb-1.5 flex items-center justify-between">
                    <span>Elevación:</span>
                    <strong className="text-slate-300">{selectedStation.alt} m</strong>
                  </div>
                  <div className="border-b border-slate-850 pb-1.5 flex items-center justify-between">
                    <span>Altura Sensor:</span>
                    <strong className="text-slate-300">{selectedStation.sensorHeight} m</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Autoridad:</span>
                    <strong className="text-slate-300 truncate max-w-[120px]" title={selectedStation.network}>{selectedStation.network}</strong>
                  </div>
                </div>

                {/* PROXIMITY CARD */}
                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-850 flex flex-col justify-between gap-1 select-none font-mono text-[10px] text-slate-400">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block font-sans">Coordenadas del Receptor</span>
                  <div className="border-b border-slate-850 pb-1.5 flex items-center justify-between">
                    <span>Latitud GD:</span>
                    <strong className="text-slate-200">{selectedStation.lat.toFixed(5)}</strong>
                  </div>
                  <div className="border-b border-slate-850 pb-1.5 flex items-center justify-between">
                    <span>Longitud GD:</span>
                    <strong className="text-slate-200">{selectedStation.lon.toFixed(5)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Vínculo SAT:</span>
                    <span className="text-indigo-400 font-bold">{selectedStation.distanciaKm.toLocaleString('es-ES')} km</span>
                  </div>
                </div>

              </div>

              {/* GRAPHICAL CHART PREVIEW: Recharts Area chart */}
              <div className="space-y-2">
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider block font-sans">Registro Continuo de las Últimas 24 Horas de Tasa de Dosis</span>
                
                <div className="bg-slate-900/55 p-4 rounded-xl border border-slate-850 h-52 shadow-inner">
                  {historyLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="animate-spin text-indigo-400" size={20} />
                      <span className="text-[10px] text-slate-500">Sincronizando base de datos histórica JRC EURDEP...</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                      <AreaChart data={getAnalyticalData() as any} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorDoseHist" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={selectedStation.status === 'ALARM' ? '#ef4444' : '#6366f1'} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={selectedStation.status === 'ALARM' ? '#ef4444' : '#6366f1'} stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                        <YAxis stroke="#475569" fontSize={9} />
                        <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '9px', fontFamily: 'monospace' }} />
                        <Area 
                          type="monotone" 
                          dataKey="valueNsvh" 
                          name="Tasa Gamma (nSv/h)" 
                          stroke={selectedStation.status === 'ALARM' ? '#f87171' : '#818cf8'} 
                          fillOpacity={1} 
                          fill="url(#colorDoseHist)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <p className="text-[9px] text-slate-500 italic text-right leading-none select-none">
                  * Los datos muestran la oscilación natural de radiación de fondo geológica. Un desvío superior a 250 nSv/h activa balizas críticas de REMER.
                </p>
              </div>

              {/* ADVANCED ACTIONS CONTROL PANEL */}
              <div className="border-t border-slate-900 pt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 select-none">
                
                {/* SIREN TESTING CAPABILITY */}
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-950/30 border border-indigo-400/20 rounded-lg shrink-0">
                    <Radio size={16} className={sirenActive ? 'text-red-500 animate-pulse' : 'text-indigo-400'} />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-sans font-bold text-slate-300 block leading-tight">Simulador del Plan de Emergencia Nuclear</span>
                    <p className="text-[9px] text-slate-500 leading-tight">Inyecte un escenario artificial de desborde radiológico para tests de transmisión.</p>
                  </div>
                </div>

                {/* EMERGENCY TRIGGER BUTTONS */}
                <div className="flex flex-wrap items-center gap-2 font-sans font-bold text-[10px]">
                  {selectedStation.status === 'ALARM' ? (
                    <button
                      onClick={() => toggleNuclearAlert(selectedStation.id, false)}
                      disabled={triggeringAlert}
                      className="px-4 py-2.5 bg-slate-900 border border-red-500/35 hover:bg-slate-800 text-red-400 rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <Power size={11} className="text-red-500 animate-pulse" />
                      <span>Detener Simulación</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleNuclearAlert(selectedStation.id, true)}
                      disabled={triggeringAlert || sirenActive}
                      className={`px-4 py-2.5 bg-red-950/45 border border-red-500/30 hover:bg-red-900/40 text-red-300 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${sirenActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                      title={sirenActive ? "Ya hay un simulacro nuclear en funcionamiento en otra estación" : "Provocar alerta radiológica ficticia"}
                    >
                      <AlertTriangle size={11} className="text-red-500 animate-bounce" />
                      <span>Inyectar Fuga Radiológica</span>
                    </button>
                  )}

                  {/* RE-EXPORT SELECTED HISTORIC SERIES */}
                  <button
                    onClick={() => {
                      const csvLines = ["ID Estación,País,Nombre,Latitud,Longitud,Red", `${selectedStation.id},${selectedStation.country},"${selectedStation.name}",${selectedStation.lat},${selectedStation.lon},"${selectedStation.network}"`, "", "Timestamp,Hora,Tasa_Dosis_nSv_h,Tasa_Dosis_uSv_h"];
                      const dataLines = stationHistory.map(h => `${h.timestamp},${h.label},${h.valueNsvh},${h.valueUsvh}`);
                      const csvContent = "data:text/csv;charset=utf-8," + [...csvLines, ...dataLines].join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", `jrc_remap_${selectedStation.id}_dose_rate_log.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Download size={11} />
                    <span>Exportar CSV Estación</span>
                  </button>
                </div>

              </div>

            </div>
          ) : (
            <div className="py-24 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center text-center gap-3 bg-slate-950">
              <Radio size={32} className="text-slate-700 animate-pulse" />
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-slate-300">Seleccione una Estación REMAP</h4>
                <p className="text-[11px] text-slate-500 max-w-sm leading-normal">
                  Haga click en una de las estaciones meteorológicas radiológicas de la lista de la izquierda para monitorizar su histórico de 24 horas y comprobar el estado civil.
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
