import React, { useState, useMemo } from 'react';
import { Database, ShieldAlert, Activity, Globe, Compass, Radio, Layout, CheckCircle, Info } from 'lucide-react';
import CsnStationsDatabase from './CsnStationsDatabase';
import JrcDataPortal from '../environment/JrcDataPortal';
import { CsnReaStation, GPSDStatus, RarRanStatus } from '../../types';

interface RadiologicalNetworksProps {
  stations: CsnReaStation[];
  gpsd: GPSDStatus;
  onRelocate: (lat: number, lon: number) => void;
  rarRan?: RarRanStatus;
}

export default function RadiologicalNetworks({ stations, gpsd, onRelocate, rarRan }: RadiologicalNetworksProps) {
  const [activeSubTab, setActiveSubTab] = useState<'csn' | 'jrc'>('csn');

  // Compute stats for Spain REA (CSN)
  const csnStats = useMemo(() => {
    if (!stations || stations.length === 0) {
      return { total: 0, avg: 0, maxStation: null };
    }
    
    let sum = 0;
    let maxVal = -1;
    let maxSt: CsnReaStation | null = null;
    
    stations.forEach(st => {
      // simulate same live values variance as defined in CsnStationsDatabase for consistency
      let codeSum = 0;
      for (let i = 0; i < st.id.length; i++) {
        codeSum += st.id.charCodeAt(i);
      }
      const hourSeed = new Date().getHours() + (new Date().getMinutes() / 60);
      const fluctuation = Math.sin(codeSum + hourSeed) * 0.006;
      const liveValue = parseFloat((st.baseVal + fluctuation).toFixed(3));
      
      sum += liveValue;
      if (liveValue > maxVal) {
        maxVal = liveValue;
        maxSt = st;
      }
    });

    return {
      total: stations.length,
      avg: parseFloat((sum / stations.length).toFixed(4)),
      maxStation: maxSt
    };
  }, [stations]);

  return (
    <div className="flex flex-col gap-5" id="radiological-networks-workspace">
      
      {/* INTEGRATED EXECUTIVE CONTROL HEADER */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-xl text-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-950/40 border border-yellow-500/30 text-yellow-400 rounded-xl shrink-0 animate-pulse">
              <Radio size={24} />
            </div>
            <div>
              <span className="text-[10px] text-yellow-550 text-yellow-405 text-yellow-450 font-black tracking-widest uppercase block font-mono">Consola Unificada de Teledetección</span>
              <h2 className="font-sans font-bold text-slate-100 text-lg flex items-center gap-2">
                Redes de Alerta Radiológica Integradas — CSN & JRC Europa
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Monitoreo redundante de dosis de radiación ambiental gama del Consejo de Seguridad Nuclear (España) y la plataforma EURDEP del Joint Research Centre de la Comisión Europea.
              </p>
            </div>
          </div>

          {/* REDUNDANT STATUS LIGHT */}
          <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2 text-xs font-mono">
            <div className="space-y-0.5">
              <div className="text-[9px] text-slate-500 uppercase">Seguridad Radiológica</div>
              <div className="text-emerald-400 font-bold flex items-center gap-1.5 leading-none">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                <span>Niveles Normales Escala EURDEP</span>
              </div>
            </div>
          </div>
        </div>

        {/* COMBINED MULTI-NETWORK STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-900/80">
          
          <div className="bg-slate-900/50 border border-slate-850 p-3.5 rounded-lg flex items-center justify-between font-sans">
            <div className="space-y-1">
              <span className="text-[9.5px] text-slate-500 font-mono uppercase block">Suscritos CSN REA (España)</span>
              <div className="text-xl font-black text-slate-100 font-mono">{csnStats.total} <span className="text-xs font-sans font-bold text-slate-400">estaciones</span></div>
            </div>
            <Activity className="text-emerald-500/80" size={24} />
          </div>

          <div className="bg-slate-900/50 border border-slate-850 p-3.5 rounded-lg flex items-center justify-between font-sans">
            <div className="space-y-1">
              <span className="text-[9.5px] text-slate-500 font-mono uppercase block">Promedio Radiación (REA)</span>
              <div className="text-xl font-black text-yellow-400 font-mono">{csnStats.avg.toFixed(3)} <span className="text-xs font-sans text-slate-400">µSv/h</span></div>
            </div>
            <Globe className="text-yellow-500/80" size={24} />
          </div>

          <div className="bg-slate-900/50 border border-slate-850 p-3.5 rounded-lg flex items-center justify-between font-sans">
            <div className="space-y-1">
              <span className="text-[9.5px] text-slate-500 font-mono uppercase block">Estación Pico Máximo (REA)</span>
              <div className="text-xs font-bold text-slate-200 truncate max-w-[170px]">{csnStats.maxStation?.name || 'Ninguna'}</div>
              <div className="text-[10px] text-red-400 font-mono">
                {csnStats.maxStation?.baseVal ? `${csnStats.maxStation.baseVal.toFixed(3)} µSv/h` : '0.000'} | {csnStats.maxStation?.provincia || 'n/a'}
              </div>
            </div>
            <ShieldAlert className="text-red-500/80" size={24} />
          </div>

        </div>

        {/* COMBINED SUB-TABS SELECTOR */}
        <div className="flex gap-2 mt-5 bg-slate-900/80 p-1 rounded-lg border border-slate-800 shrink-0 w-fit">
          <button
            onClick={() => setActiveSubTab('csn')}
            className={`px-4 py-2 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'csn'
                ? 'bg-emerald-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Database size={13} />
            Red de Alerta CSN (España)
          </button>
          
          <button
            onClick={() => setActiveSubTab('jrc')}
            className={`px-4 py-2 rounded-md font-sans text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'jrc'
                ? 'bg-emerald-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Globe size={13} />
            JRC Joint Research Centre (Europa)
          </button>
        </div>

      </div>

      {/* RENDER DYNAMIC SUB-WORKSPACE COMPONENT */}
      <div className="w-full">
        {activeSubTab === 'csn' ? (
          <div className="animate-fadeIn">
            <CsnStationsDatabase 
              stations={stations} 
              gpsd={gpsd} 
              onRelocate={onRelocate} 
              rarRan={rarRan}
            />
          </div>
        ) : (
          <div className="animate-fadeIn">
            <JrcDataPortal />
          </div>
        )}
      </div>

    </div>
  );
}
