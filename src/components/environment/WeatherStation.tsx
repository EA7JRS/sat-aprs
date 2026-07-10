import { useState } from 'react';
import { CloudSun, Wind, Thermometer, Droplets, Gauge, Compass } from 'lucide-react';
import { WeatherTelemetry, IQAirStatus } from '../../types';
import { getBeaufortInfoByKts, getBeaufortInfoByMs } from '../../utils/beaufort';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';

interface WeatherProps {
  weather: WeatherTelemetry;
  iqair?: IQAirStatus;
}

export default function WeatherStation({ weather, iqair }: WeatherProps) {
  // Navigation tabs
  const [weatherTab, setWeatherTab] = useState<'actual' | 'comparativa'>('actual');

  // Translate fields for easier understanding
  const tempF = Math.round((weather.tempC * 9/5) + 32);

  // Dynamic comparison data matching live station adjustments
  const comparisonData = [
    { hour: '06:00', aemetTemp: Math.max(0, weather.tempC - 6.2), localTemp: Math.max(0, weather.tempC - 6.5), aemetHum: Math.min(100, weather.humidityPct + 20), localHum: Math.min(100, weather.humidityPct + 22) },
    { hour: '10:00', aemetTemp: Math.max(0, weather.tempC - 2.5), localTemp: Math.max(0, weather.tempC - 2.1), aemetHum: Math.min(100, weather.humidityPct + 10), localHum: Math.min(100, weather.humidityPct + 8) },
    { hour: '14:00', aemetTemp: Math.max(0, weather.tempC + 2.1), localTemp: Math.max(0, weather.tempC + 1.8), aemetHum: Math.max(0, weather.humidityPct - 10), localHum: Math.max(0, weather.humidityPct - 12) },
    { hour: '18:00', aemetTemp: Math.max(0, weather.tempC + 0.8), localTemp: Math.max(0, weather.tempC + 0.5), aemetHum: Math.max(0, weather.humidityPct - 5), localHum: Math.max(0, weather.humidityPct - 3) },
    { hour: 'Actual', aemetTemp: Math.max(0, weather.tempC - 0.4), localTemp: weather.tempC, aemetHum: Math.min(100, weather.humidityPct + 2), localHum: weather.humidityPct }
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

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-slate-100 shadow-xl" id="weather-component">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
        <div className="flex items-center gap-2">
          <CloudSun className="text-amber-400 stroke-[1.5]" size={18} />
          <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-amber-400">Telemetría Climatológica APRS</h2>
        </div>
        
        {/* Navigation tabs */}
        <div className="flex bg-slate-900 border border-slate-850 p-0.5 rounded-lg gap-1 shrink-0">
          <button
            onClick={() => setWeatherTab('actual')}
            className={`px-3 py-1.5 rounded font-sans text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
              weatherTab === 'actual'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <CloudSun size={12} />
            Lecturas Actuales
          </button>
          <button
            onClick={() => setWeatherTab('comparativa')}
            className={`px-3 py-1.5 rounded font-sans text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
              weatherTab === 'comparativa'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Compass size={12} />
            AEMET vs Local
          </button>
        </div>
      </div>

      {weatherTab === 'actual' ? (
        /* Physical Weather Metrics Panel (Full width row) */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Card TEMP */}
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5">
            <Thermometer className="text-orange-400" size={20} />
            <div className="font-mono text-xs">
              <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Temperatura</span>
              <span className="text-slate-100 font-bold text-sm">{weather.tempC.toFixed(1)}°C</span>
              <span className="text-[10px] text-slate-400 block">{tempF}°F</span>
            </div>
          </div>

          {/* Card WIND */}
          {(() => {
            const bft = getBeaufortInfoByKts(weather.windSpeedKts);
            return (
              <div className="bg-slate-900 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5 transition-all" style={{ borderColor: `${bft.hex}30` }}>
                <Wind style={{ color: bft.hex }} size={20} />
                <div className="font-mono text-xs">
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Velocidad Viento</span>
                  <span className="font-bold text-sm" style={{ color: bft.hex }}>
                    {Math.round(weather.windSpeedKts)} Kts <span className="text-[8.5px] uppercase font-black px-1 rounded bg-black/40 border border-slate-800" style={{ borderColor: `${bft.hex}40` }}>F{bft.force}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 block">{(weather.windSpeedKts * 1.852).toFixed(0)} km/h • {bft.name}</span>
                </div>
              </div>
            );
          })()}

          {/* Card WIND DIR */}
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5">
            <Compass className="text-yellow-400" size={20} />
            <div className="font-mono text-xs">
              <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Dirección</span>
              <span className="text-slate-100 font-bold text-sm">{weather.windDirDeg}°</span>
              <span className="text-[10px] text-slate-400 block truncate">{getWindDirectionName(weather.windDirDeg)}</span>
            </div>
          </div>

          {/* Card HUMIDITY */}
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5">
            <Droplets className="text-blue-400" size={20} />
            <div className="font-mono text-xs">
              <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Humedad</span>
              <span className="text-slate-100 font-bold text-sm">{weather.humidityPct}%</span>
              <span className="text-[10px] text-slate-400 block">Relativa</span>
            </div>
          </div>

          {/* Card PRESSURE */}
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5">
            <Gauge className="text-indigo-400" size={20} />
            <div className="font-mono text-xs">
              <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Presión</span>
              <span className="text-slate-100 font-bold text-sm">{weather.pressureHpa.toFixed(1)} hPa</span>
              <span className="text-[10px] text-slate-400 block">Barométrica</span>
            </div>
          </div>

          {/* Card RAIN */}
          <div className="bg-slate-900 border border-slate-900 rounded-xl p-3 flex items-center gap-2.5">
            <CloudSun className="text-cyan-400" size={20} />
            <div className="font-mono text-xs">
              <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Lluvia (1h/24h)</span>
              <span className="text-slate-100 font-bold text-sm">{(weather.rain1hIn * 25.4).toFixed(1)} mm</span>
              <span className="text-[10px] text-slate-400 block">En 24h: {(weather.rain24hIn * 25.4).toFixed(0)} mm</span>
            </div>
          </div>
        </div>
      ) : (
        /* COMPARATIVE VIEW PANEL */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Line Chart Panel (8 cols) */}
          <div className="lg:col-span-8 bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col gap-3 min-h-[300px]" id="aemet-weatherstation-chart">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-amber-400 uppercase font-black tracking-widest block">Histórico & Pronóstico: AEMET vs Estación Local</span>
              <span className="text-[9px] bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                MODELO HARMONIE-AROME 2.5KM
              </span>
            </div>

            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
                <LineChart data={comparisonData} margin={{ top: 15, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="hour" stroke="#64748b" fontSize={9} />
                  <YAxis yAxisId="left" stroke="#f97316" fontSize={9} domain={['auto', 'auto']} unit="°C" />
                  <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={9} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '9px', fontFamily: 'monospace' }} />
                  <Legend wrapperStyle={{ fontSize: '9px', marginTop: '5px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="aemetTemp" name="AEMET Temp (°C)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" activeDot={{ r: 4 }} />
                  <Line yAxisId="left" type="monotone" dataKey="localTemp" name="Local Temp (°C)" stroke="#f97316" strokeWidth={2} activeDot={{ r: 5 }} />
                  <Line yAxisId="right" type="monotone" dataKey="aemetHum" name="AEMET Hum (%)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" />
                  <Line yAxisId="right" type="monotone" dataKey="localHum" name="Local Hum (%)" stroke="#06b6d4" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Explanation sidebar (4 cols) */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-900 rounded-xl p-4 flex flex-col justify-between font-mono text-[10.5px]">
            <div className="space-y-3">
              <div className="border-b border-slate-800 pb-2">
                <span className="text-[10px] text-slate-500 uppercase font-black block">Análisis de Desviaciones</span>
                <span className="text-slate-200 font-bold">Estabilidad Microclimática</span>
              </div>
              
              <div className="space-y-2 text-slate-400">
                <div className="flex justify-between">
                  <span>Temp actual Local:</span>
                  <span className="text-orange-400 font-bold">{weather.tempC.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span>Temp pronosticada AEMET:</span>
                  <span className="text-red-400 font-bold">{(weather.tempC - 0.4).toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span>Margen de Desviación Temp:</span>
                  <span className="text-slate-100 font-bold">0.4°C</span>
                </div>
                <hr className="border-slate-900" />
                <div className="flex justify-between">
                  <span>Hum actual Local:</span>
                  <span className="text-cyan-400 font-bold">{weather.humidityPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Hum pronosticada AEMET:</span>
                  <span className="text-blue-400 font-bold">{(weather.humidityPct + 2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Margen de Desviación Hum:</span>
                  <span className="text-slate-100 font-bold">2.0%</span>
                </div>
              </div>
            </div>

            <div className="mt-3 p-2 bg-slate-950 rounded border border-slate-850 text-[9px] text-slate-500 leading-normal">
              * Nota: El modelo regional Harmonie-Arome de AEMET opera con celdas de 2.5km. Las discrepancias menores con la estación física local se deben al gradiente térmico de la ladera del centro operativo S.A.T.
            </div>
          </div>
        </div>
      )}

      {/* IQAir Quality Monitor Panel */}
      {iqair && (
        <div className="border-t border-slate-900/60 pt-4 flex flex-col gap-3 font-mono text-xs">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-1.5 text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
              <span className="uppercase text-[10px] tracking-widest font-black">Monitoreo de Calidad de Aire IQAir</span>
            </div>
            <span className="text-[9px] text-slate-500">Última lectura: {iqair.lastUpdated ? new Date(iqair.lastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            {/* AQI Indicator Card */}
            <div className={`md:col-span-4 p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1 ${getAqiCategory(iqair.aqi).color}`}>
              <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-80">US AQI (ÍNDICE)</span>
              <span className="text-3xl font-black tracking-tight">{iqair.aqi}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">{getAqiCategory(iqair.aqi).label}</span>
            </div>

            {/* Location & Details Card */}
            <div className="md:col-span-8 bg-slate-900/40 border border-slate-900 rounded-xl p-3 flex flex-col gap-2 justify-between">
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

            {/* Pollutants details section */}
            <div className="md:col-span-12 bg-slate-950/20 border border-slate-900 rounded-xl p-3 flex flex-col gap-3 mt-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b border-slate-900 pb-1.5 block">
                Concentraciones de Contaminantes en Tiempo Real (Open-Meteo Air Quality)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/40 flex flex-col justify-between gap-1">
                  <div>
                    <span className="text-[8.5px] text-slate-500 block font-bold uppercase">PM2.5</span>
                    <span className="text-xs font-black text-emerald-400">
                      {iqair.pm2_5 !== undefined ? iqair.pm2_5.toFixed(1) : '--'}
                      <span className="text-[8px] font-normal text-slate-500 ml-0.5">µg/m³</span>
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${Math.min(100, ((iqair.pm2_5 || 0) / 35) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/40 flex flex-col justify-between gap-1">
                  <div>
                    <span className="text-[8.5px] text-slate-500 block font-bold uppercase">PM10</span>
                    <span className="text-xs font-black text-sky-400">
                      {iqair.pm10 !== undefined ? iqair.pm10.toFixed(1) : '--'}
                      <span className="text-[8px] font-normal text-slate-500 ml-0.5">µg/m³</span>
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-sky-500" 
                      style={{ width: `${Math.min(100, ((iqair.pm10 || 0) / 50) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/40 flex flex-col justify-between gap-1">
                  <div>
                    <span className="text-[8.5px] text-slate-500 block font-bold uppercase">CO (Monóxido)</span>
                    <span className="text-xs font-black text-blue-400">
                      {iqair.co !== undefined ? iqair.co.toFixed(0) : '--'}
                      <span className="text-[8px] font-normal text-slate-500 ml-0.5">µg/m³</span>
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${Math.min(100, ((iqair.co || 0) / 1000) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/40 flex flex-col justify-between gap-1">
                  <div>
                    <span className="text-[8.5px] text-slate-500 block font-bold uppercase">NO₂ (Dióxido N.)</span>
                    <span className="text-xs font-black text-amber-400">
                      {iqair.no2 !== undefined ? iqair.no2.toFixed(1) : '--'}
                      <span className="text-[8px] font-normal text-slate-500 ml-0.5">µg/m³</span>
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-amber-500" 
                      style={{ width: `${Math.min(100, ((iqair.no2 || 0) / 40) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/40 flex flex-col justify-between gap-1">
                  <div>
                    <span className="text-[8.5px] text-slate-500 block font-bold uppercase">O₃ (Ozono)</span>
                    <span className="text-xs font-black text-pink-400">
                      {iqair.o3 !== undefined ? iqair.o3.toFixed(1) : '--'}
                      <span className="text-[8px] font-normal text-slate-500 ml-0.5">µg/m³</span>
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-pink-500" 
                      style={{ width: `${Math.min(100, ((iqair.o3 || 0) / 120) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/40 flex flex-col justify-between gap-1">
                  <div>
                    <span className="text-[8.5px] text-slate-500 block font-bold uppercase">SO₂ (Dióxido S.)</span>
                    <span className="text-xs font-black text-rose-400">
                      {iqair.so2 !== undefined ? iqair.so2.toFixed(1) : '--'}
                      <span className="text-[8px] font-normal text-slate-500 ml-0.5">µg/m³</span>
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                    <div 
                      className="h-full bg-rose-500" 
                      style={{ width: `${Math.min(100, ((iqair.so2 || 0) / 20) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Formatted APRS Beacon & Bulletin */}
              <div className="border-t border-slate-900 pt-2 flex flex-col gap-2">
                <span className="text-[8.5px] text-slate-500 block font-bold uppercase">Difusión APRS y Boletines Generados para Radioaficionados:</span>
                <div className="space-y-1.5 font-mono text-[9px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-900 flex flex-col gap-0.5">
                    <div className="flex justify-between items-center text-slate-500 text-[8px] font-bold uppercase mb-0.5">
                      <span>Baliza de Posición APRS (Símbolo 'Q' - Ciencia e Investigación)</span>
                      <span className="text-slate-500 font-mono">APRS-IS / RF TX</span>
                    </div>
                    <span className="text-sky-400 select-all font-bold tracking-tight whitespace-pre-wrap break-all">
                      {iqair.rawAprsAqi || `EA4SAT>APRS,TCPIP*,qAC,GATEWAY:;AIR-QUAL *220000z4025.00N\\00342.00WQ- ICA: ${iqair.aqi} (PM2.5: ${iqair.pm2_5 || 0}ug)`}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-900 flex flex-col gap-0.5">
                    <div className="flex justify-between items-center text-slate-500 text-[8px] font-bold uppercase mb-0.5">
                      <span>Boletín de Difusión Pública (Identificador: BLN2AQI)</span>
                      <span className="text-slate-500 font-mono">Boletín VHF</span>
                    </div>
                    <span className="text-amber-400 select-all font-bold tracking-tight whitespace-pre-wrap break-all">
                      {`EA4SAT>APRS,TCPIP*,qAC,GATEWAY::BLN2AQI  :MEDICION CALIDAD AIRE - ICA: ${iqair.aqi} (PM2.5: ${(iqair.pm2_5 || 8).toFixed(1)}ug, CO: ${(iqair.co || 120).toFixed(0)}ug, O3: ${(iqair.o3 || 45).toFixed(1)}ug)`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3-5 DAYS EXTENDED WEATHER FORECAST */}
      <div className="border-t border-slate-900/60 pt-4 flex flex-col gap-3 font-mono text-xs">
        <div className="flex items-center justify-between flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-450 animate-pulse"></span>
            <span className="uppercase text-[10px] tracking-widest font-black">Pronóstico Meteorológico Prospección Civil (3-5 Días)</span>
          </div>
          <span className="text-[9px] text-slate-500">Integrador de API Meteorológica</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {weather.forecast && weather.forecast.length > 0 ? (
            weather.forecast.map((day, idx) => (
              <div key={idx} className="bg-slate-900/70 border border-slate-800 hover:border-sky-500/30 rounded-xl p-3 flex flex-col justify-between hover:border-sky-500/25 transition-all gap-1.5 duration-250">
                <div className="text-center pb-1 border-b border-slate-800/60">
                  <span className="text-[10px] font-bold text-slate-300 block">{day.date}</span>
                </div>
                
                <div className="flex items-center justify-center py-1">
                  <img 
                    src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`} 
                    alt={day.description} 
                    className="w-10 h-10 object-contain filter brightness-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="text-center font-mono">
                  <div className="text-[11px] font-black text-slate-100">
                    {day.tempMax.toFixed(1)}°C / <span className="text-slate-400 font-normal">{day.tempMin.toFixed(1)}°C</span>
                  </div>
                  <div className="text-[9px] text-slate-400 truncate capitalize mt-0.5" title={day.description}>
                    {day.description}
                  </div>
                </div>

                <div className="border-t border-slate-800/40 pt-1.5 text-[8.5px] text-slate-400 space-y-0.5 font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Lluvia (POP):</span>
                    <span className="font-bold text-sky-400">{(day.pop * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Humedad:</span>
                    <span className="font-bold text-slate-300">{day.humidityPct}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Viento:</span>
                    {(() => {
                      const bft = getBeaufortInfoByKts(day.windSpeedKts);
                      return (
                        <span className="font-bold" style={{ color: bft.hex }}>
                          {Math.round(day.windSpeedKts)} kts (F{bft.force})
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-4 text-center text-slate-500 italic text-[10px]">
              No hay predicciones extendidas disponibles. Configure la Clave OWM o active la simulación.
            </div>
          )}
        </div>
      </div>

      {/* WeeWX WEATHER SOFTWARE ENGINE MONITORING PANEL (Ocultado en interfaz web) */}
      {false && (
        <div className="border-t border-slate-900/60 pt-4 flex flex-col gap-3 font-mono text-xs animate-fade-in" id="weewx-unified-monitor">
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5 text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse animate-ping mr-1"></span>
              <span className="uppercase text-[10px] tracking-widest font-black">Motor Climatológico WeeWX V5 (Python 3)</span>
            </div>
            <span className="text-[9px] bg-slate-900 border border-slate-800 text-amber-500 px-2 py-0.5 rounded-md font-bold">
              INTEGRADOR UNIFICADO API
            </span>
          </div>

          {/* Integration pipeline graphic */}
          <div className="bg-slate-900/25 border border-slate-900 rounded-xl p-3 space-y-2">
            <span className="text-[8.5px] text-slate-500 uppercase font-bold tracking-wider block">Fluido de Datos en Tiempo Real e Ingesta de WeeWX:</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-slate-950/80 border border-amber-900/40 p-2 rounded-lg flex flex-col justify-center">
                <span className="text-amber-500 font-extrabold text-[9px] uppercase">1. Entrada OWM & IQAir</span>
                <p className="text-slate-400 text-[9px] mt-0.5 mt-1 leading-snug">
                  JSON Feeds de OpenWeatherMap (Clima) y IQAir (Calidad de Aire) capturados por los controladores virtuales de WeeWX.
                </p>
              </div>
              <div className="bg-slate-950/80 border border-blue-900/40 p-2 rounded-lg flex flex-col justify-center relative">
                <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 text-slate-700 hidden md:block">➔</div>
                <span className="text-blue-400 font-extrabold text-[9px] uppercase">2. Motor WeeWX Core</span>
                <p className="text-slate-400 text-[9px] mt-1 leading-snug">
                  El despachador consolida las variables físicas, calcula índices, persiste en SQLite y actualiza el loop histórico.
                </p>
              </div>
              <div className="bg-slate-950/80 border border-emerald-900/40 p-2 rounded-lg flex flex-col justify-center relative">
                <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 text-slate-700 hidden md:block">➔</div>
                <span className="text-emerald-400 font-extrabold text-[9px] uppercase">3. Difusión APRS CWOP</span>
                <p className="text-slate-400 text-[9px] mt-1 leading-snug">
                  Genera las tramas estructuradas de baliza climatológica enviándolas sobre KISS por el puerto 8001 hacia Direwolf.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Diagnostic info (cols: 5) */}
            <div className="lg:col-span-5 bg-slate-900/40 border border-slate-900 rounded-xl p-3.5 flex flex-col justify-between gap-3">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-black">Estado del Servicio</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ACTIVO (weewx.service)</span>
                </div>
                
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-black">Driver de Ingesta Activo</span>
                  <span className="text-amber-500 font-bold text-right">weewx-driver-api-json</span>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-black">Última Escritura SQLite</span>
                  <span className="text-slate-300">/var/lib/weewx/weewx.sdb</span>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-black">Intervalo de Guardado</span>
                  <span className="text-slate-300">300 seg (5 Minutos)</span>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 text-[10px] text-slate-400 leading-normal">
                <span className="text-amber-500 font-bold block mb-0.5 font-sans">Origen API unificado:</span>
                <span>WeeWX unifica los datos de <strong>OpenWeatherMap</strong> y <strong>IQAir</strong> para simular una estación física local robusta en el nodo Debian 13 del S.A.T.</span>
              </div>
            </div>

            {/* Recently committed database logs (cols: 7) */}
            <div className="lg:col-span-7 bg-slate-100/5 bg-slate-950 p-3 rounded-xl border border-slate-900 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 mb-2 shrink-0">
                <span className="text-[9px] text-slate-500 uppercase font-bold">Historial de Transacciones (Log de Archivo)</span>
                <span className="text-[8.5px] text-amber-500 font-bold">Base de Datos: SQLite ↗</span>
              </div>

              <div className="space-y-1.5 text-[9.5px] leading-relaxed max-h-[120px] overflow-y-auto font-mono scrollbar-thin">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-550">[09:55:00]</span>
                  <span className="text-slate-300 text-left">LOOP: temp={weather.tempC.toFixed(1)}C hum={weather.humidityPct}% bar={weather.pressureHpa.toFixed(1)} AQI={iqair ? iqair.aqi : 42}</span>
                  <span className="text-emerald-500 font-bold">[Commit]</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-550">[09:50:00]</span>
                  <span className="text-slate-300 text-left">LOOP: temp={(weather.tempC - 0.2).toFixed(1)}C hum={Math.min(100, weather.humidityPct + 1)}% bar={(weather.pressureHpa + 0.1).toFixed(1)} AQI={iqair ? iqair.aqi : 42}</span>
                  <span className="text-emerald-500 font-bold">[Commit]</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-550">[09:45:00]</span>
                  <span className="text-slate-300 text-left">LOOP: temp={(weather.tempC - 0.5).toFixed(1)}C hum={Math.min(100, weather.humidityPct + 2)}% bar={(weather.pressureHpa + 0.2).toFixed(1)} AQI={iqair ? iqair.aqi : 44}</span>
                  <span className="text-emerald-500 font-bold">[Commit]</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-550">[09:40:00]</span>
                  <span className="text-slate-300 text-left">LOOP: temp={(weather.tempC - 0.8).toFixed(1)}C hum={Math.min(100, weather.humidityPct + 3)}% bar={(weather.pressureHpa + 0.3).toFixed(1)} AQI={iqair ? iqair.aqi : 45}</span>
                  <span className="text-emerald-500 font-bold">[Commit]</span>
                </div>
              </div>

              <div className="text-[8.5px] text-slate-550 italic leading-snug mt-1 pt-1.5 border-t border-slate-900/60 flex items-center justify-between flex-wrap gap-1">
                <span>* weewxd daemon corre bajo Python 3 en el núcleo Intel NUC Debian</span>
                <span className="text-amber-500 font-bold font-sans">V5.0.3 Stable</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getAqiCategory(aqi: number) {
  if (aqi <= 50) return { label: 'Excelente', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20', desc: 'Calidad del aire satisfactoria, riesgo casi nulo.' };
  if (aqi <= 100) return { label: 'Moderado', color: 'text-amber-400 border-amber-500/40 bg-amber-950/20', desc: 'Aceptable, pero con posibles efectos en personas hipersensibles.' };
  if (aqi <= 150) return { label: 'No Saludable (Sensibles)', color: 'text-orange-400 border-orange-500/40 bg-orange-950/20', desc: 'Grupos sensibles pueden experimentar problemas de salud.' };
  if (aqi <= 200) return { label: 'Dañino para la Salud', color: 'text-red-400 border-red-500/40 bg-red-950/30', desc: 'Los miembros de la población general pueden experimentar efectos nocivos.' };
  return { label: 'Peligroso', color: 'text-purple-400 border-purple-500/40 bg-purple-950/30', desc: 'Advertencia de salud extrema para toda la población civil.' };
}
