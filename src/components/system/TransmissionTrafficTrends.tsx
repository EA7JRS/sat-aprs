import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  Tooltip, CartesianGrid, Legend 
} from 'recharts';
import { Activity, ArrowUpRight, ArrowDownLeft, Zap, Radio } from 'lucide-react';
import { TrafficDataPoint } from '../../types';

interface TransmissionTrafficTrendsProps {
  trafficTrends: TrafficDataPoint[];
}

export default function TransmissionTrafficTrends({ trafficTrends = [] }: TransmissionTrafficTrendsProps) {
  // Compute some beautiful summary statistics for the last 60 minutes
  const stats = useMemo(() => {
    let totalTx = 0;
    let totalRx = 0;
    let maxTx = 0;
    let maxRx = 0;

    trafficTrends.forEach(d => {
      totalTx += d.txCount;
      totalRx += d.rxCount;
      if (d.txCount > maxTx) maxTx = d.txCount;
      if (d.rxCount > maxRx) maxRx = d.rxCount;
    });

    return {
      totalTx,
      totalRx,
      maxTx,
      maxRx,
      totalPackets: totalTx + totalRx,
      avgTxPerMin: parseFloat((totalTx / Math.max(1, trafficTrends.length)).toFixed(2)),
      avgRxPerMin: parseFloat((totalRx / Math.max(1, trafficTrends.length)).toFixed(2))
    };
  }, [trafficTrends]);

  // Show every 10th label on XAxis to keep it clean, plus first and last
  const formatXAxis = (tickItem: any, index: number) => {
    if (index === 0) return tickItem;
    if (index === trafficTrends.length - 1) return 'Ahora';
    if (index % 10 === 0) return tickItem;
    return '';
  };

  // Custom polished Tooltip Component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950/95 border border-slate-800 p-2.5 rounded-lg shadow-xl font-mono text-xs">
          <p className="text-[10px] text-slate-500 font-bold mb-1.5 border-b border-slate-900 pb-1">
            HORA REGISTRO: {label}
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                Transmisiones (TX):
              </span>
              <span className="text-slate-100 font-extrabold">{payload[0]?.value ?? 0} pkt</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-blue-400 font-semibold">
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                Recepciones (RX):
              </span>
              <span className="text-slate-100 font-extrabold">{payload[1]?.value ?? 0} pkt</span>
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-slate-900/65 pt-1.5 text-[10px]">
              <span className="text-slate-400">Tráfico Total:</span>
              <span className="text-yellow-400 font-bold font-mono">
                {((payload[0]?.value ?? 0) + (payload[1]?.value ?? 0))} pkt/m
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-slate-100 shadow-xl" id="traffic-trends-chart">
      
      {/* Visual Title Header */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-3" id="traffic-trends-header">
        <div className="flex items-center gap-2">
          <Activity className="text-emerald-400 animate-pulse stroke-[1.5]" size={20} />
          <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-emerald-400">
            Tendencias de Tráfico y Modulación de Radio (Última Hora)
          </h2>
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 font-semibold px-2 py-0.5 border border-emerald-500/30 rounded">
            📡 ANALIZADOR: ACTIVO
          </span>
          <span className="text-[10px] font-mono bg-slate-900 text-slate-400 px-2 py-0.5 border border-slate-800 rounded">
            INTERVALO: 60s
          </span>
        </div>
      </div>

      {/* Numerical Stats Widgets Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        
        {/* Stat 1: Transmisiones Totales */}
        <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex flex-col justify-between">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
            <ArrowUpRight className="text-emerald-400" size={12} />
            Transmisiones (TX)
          </div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-xl font-extrabold text-emerald-400">{stats.totalTx}</span>
            <span className="text-[9px] text-slate-500">paquetes</span>
          </div>
          <div className="text-[9.5px] text-slate-400 mt-1 pb-0.5 border-t border-slate-900 pt-1.5 flex justify-between">
            <span>Máx pico:</span>
            <span className="text-slate-200 font-bold">{stats.maxTx} pkt/m</span>
          </div>
        </div>

        {/* Stat 2: Recepciones Totales */}
        <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex flex-col justify-between">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
            <ArrowDownLeft className="text-blue-400" size={12} />
            Recepciones (RX)
          </div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-xl font-extrabold text-blue-400">{stats.totalRx}</span>
            <span className="text-[9px] text-slate-500">paquetes</span>
          </div>
          <div className="text-[9.5px] text-slate-400 mt-1 pb-0.5 border-t border-slate-900 pt-1.5 flex justify-between">
            <span>Máx pico:</span>
            <span className="text-slate-200 font-bold">{stats.maxRx} pkt/m</span>
          </div>
        </div>

        {/* Stat 3: Tráfico total de red */}
        <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex flex-col justify-between">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
            <Zap className="text-yellow-400" size={11} />
            Volumen Total RF
          </div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-xl font-extrabold text-yellow-400">{stats.totalPackets}</span>
            <span className="text-[9px] text-slate-500">tráfico</span>
          </div>
          <div className="text-[9.5px] text-slate-400 mt-1 pb-0.5 border-t border-slate-900 pt-1.5 flex justify-between">
            <span>Media TX:</span>
            <span className="text-slate-200 font-bold">{stats.avgTxPerMin}/min</span>
          </div>
        </div>

        {/* Stat 4: Frecuencia Muestras */}
        <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex flex-col justify-between">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
            <Radio className="text-purple-400" size={11} />
            Muestras Guardadas
          </div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-xl font-extrabold text-purple-400">{trafficTrends.length} / 60</span>
            <span className="text-[9px] text-slate-500">puntos</span>
          </div>
          <div className="text-[9.5px] text-slate-400 mt-1 pb-0.5 border-t border-slate-900 pt-1.5 flex justify-between">
            <span>Servidor APRS-IS:</span>
            <span className="text-emerald-500 font-bold">ONLINE</span>
          </div>
        </div>

      </div>

      {/* Main Recharts Container Layer */}
      <div className="h-[210px] w-full bg-slate-950 border border-slate-900 rounded-xl p-2 md:p-3 relative overflow-hidden flex flex-col justify-center">
        {trafficTrends.length === 0 ? (
          <div className="text-center text-slate-500 text-xs font-mono py-8">
            Cargando telemetría de modulación de ondas...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300} minWidth={300} minHeight={300}>
            <AreaChart
              data={trafficTrends}
              margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
            >
              <defs>
                {/* Emerald Gradient for TX */}
                <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                {/* Blue Gradient for RX */}
                <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#1e293b" 
                opacity={0.3} 
                vertical={false}
              />

              <XAxis 
                dataKey="label" 
                stroke="#475569"
                fontSize={9}
                fontFamily="monospace"
                tickFormatter={formatXAxis}
                tickLine={false}
                axisLine={{ stroke: '#1e293b' }}
              />

              <YAxis 
                stroke="#475569"
                fontSize={9}
                fontFamily="monospace"
                tickLine={false}
                axisLine={{ stroke: '#1e293b' }}
                allowDecimals={false}
              />

              <Tooltip content={<CustomTooltip />} />

              <Legend 
                verticalAlign="top" 
                height={28}
                content={() => (
                  <div className="flex justify-end gap-4 text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                      Emisión de Radio (TX)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                      Recepción de Radio (RX)
                    </span>
                  </div>
                )}
              />

              <Area 
                type="monotone" 
                dataKey="txCount" 
                name="TX (Emisión)"
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorTx)" 
                activeDot={{ r: 4, strokeWidth: 1 }}
              />
              <Area 
                type="monotone" 
                dataKey="rxCount" 
                name="RX (Recepción)"
                stroke="#3b82f6" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill="url(#colorRx)" 
                activeDot={{ r: 4, strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
