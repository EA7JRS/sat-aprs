import React, { useState, useMemo } from 'react';
import { Search, MapPin, Globe, HelpCircle, Import, Trash2, Check, Link, Server, Users, Sliders, Play } from 'lucide-react';
import { WIRESX_ROOMS_PRESET, parseWiresXRoomsRawText, WiresXRoom } from '../../data/wiresx';

interface WiresXRoomsDatabaseViewProps {
  onInjectRaw?: (packet: string) => void;
  showToast?: (message: string) => void;
  activeRoomsList?: string[];
  isLoadingStatus?: boolean;
  onRefreshStatus?: () => void;
}

export default function WiresXRoomsDatabaseView({ 
  onInjectRaw, 
  showToast, 
  activeRoomsList = [], 
  isLoadingStatus = false, 
  onRefreshStatus 
}: WiresXRoomsDatabaseViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [minNodes, setMinNodes] = useState<number>(0);
  const [isImporting, setIsImporting] = useState(false);
  const [rawImportText, setRawImportText] = useState('');

  // Loaded rooms combining presets with user-imported ones
  const [rooms, setRooms] = useState<WiresXRoom[]>(() => {
    try {
      const saved = localStorage.getItem('imported_wiresx_rooms');
      const parsed = saved ? JSON.parse(saved) : [];
      // Combine with presets, avoiding ID duplication
      const savedIds = new Set(parsed.map((r: WiresXRoom) => r.roomId));
      const filteredPresets = WIRESX_ROOMS_PRESET.filter(r => !savedIds.has(r.roomId));
      return [...filteredPresets, ...parsed];
    } catch {
      return WIRESX_ROOMS_PRESET;
    }
  });

  // Calculate stats
  const stats = useMemo(() => {
    const total = rooms.length;
    // Guess Spain rooms by ID starting with 21 or name having Spain, or Spain in desc
    const spainRooms = rooms.filter(r => 
      r.roomId.startsWith('21') || 
      r.name.toLowerCase().includes('spain') || 
      r.name.toLowerCase().includes('espana') || 
      r.description.toLowerCase().includes('españa') || 
      r.description.toLowerCase().includes('spain')
    ).length;
    const international = total - spainRooms;
    const imported = rooms.length - WIRESX_ROOMS_PRESET.length;
    const totalNodes = rooms.reduce((sum, r) => sum + (r.activeNodesCount || 0), 0);
    return { total, spainRooms, international, imported, totalNodes };
  }, [rooms]);

  // Unique country lists or region lists guess
  const countriesList = useMemo(() => {
    // Rooms don't explicitly have country field in WiresXRoom interface,
    // but we can parse it from description, or roomId (e.g. 210xx is Spain, 20xxx is USA, 212xx UK, 215xx France, etc.)
    return [
      { code: 'ALL', name: 'Todos los Países' },
      { code: 'ES', name: 'España (ID: 21xxx)' },
      { code: 'US', name: 'Estados Unidos (ID: 20xxx)' },
      { code: 'JP', name: 'Japón (ID: 20005...)' },
      { code: 'UK', name: 'Reino Unido (ID: 212xx)' },
      { code: 'FR', name: 'Francia (ID: 215xx)' },
      { code: 'OT', name: 'Otros Enlaces' }
    ];
  }, []);

  // Filter and sort rooms
  const filteredRooms = useMemo(() => {
    const filtered = rooms.filter(room => {
      const sLower = searchTerm.toLowerCase();
      const matchSearch =
        room.name.toLowerCase().includes(sLower) ||
        room.roomId.includes(sLower) ||
        room.description.toLowerCase().includes(sLower);

      // Guess country by roomId
      let matchCountry = true;
      if (selectedCountry !== 'ALL') {
        const id = room.roomId;
        if (selectedCountry === 'ES') {
          matchCountry = id.startsWith('21') && !id.startsWith('212') && !id.startsWith('215');
        } else if (selectedCountry === 'US') {
          matchCountry = id.startsWith('20') && id !== '20005';
        } else if (selectedCountry === 'JP') {
          matchCountry = id === '20005';
        } else if (selectedCountry === 'UK') {
          matchCountry = id.startsWith('212');
        } else if (selectedCountry === 'FR') {
          matchCountry = id.startsWith('215');
        } else if (selectedCountry === 'OT') {
          // Others
          matchCountry = !id.startsWith('21') && !id.startsWith('20');
        }
      }

      const matchNodes = room.activeNodesCount >= minNodes;

      return matchSearch && matchCountry && matchNodes;
    });

    // Sort by connected nodes (highest activity first)
    return filtered.sort((a, b) => b.activeNodesCount - a.activeNodesCount);
  }, [rooms, searchTerm, selectedCountry, minNodes]);

  const handleImportRooms = () => {
    if (!rawImportText.trim()) {
      if (showToast) showToast("⚠️ Por favor, pegue texto válido de la lista de salas activas.");
      return;
    }

    try {
      const parsed = parseWiresXRoomsRawText(rawImportText);
      if (parsed.length === 0) {
        if (showToast) showToast("❌ No se pudieron extraer salas válidas. Verifique el formato.");
        return;
      }

      const saved = localStorage.getItem('imported_wiresx_rooms');
      const existingImported: WiresXRoom[] = saved ? JSON.parse(saved) : [];
      
      const combined = [...existingImported];
      let addedCount = 0;
      
      parsed.forEach(room => {
        const exists = combined.some(r => r.roomId === room.roomId) || WIRESX_ROOMS_PRESET.some(r => r.roomId === room.roomId);
        if (!exists) {
          combined.push(room);
          addedCount++;
        }
      });

      localStorage.setItem('imported_wiresx_rooms', JSON.stringify(combined));
      
      // Update state
      const savedIds = new Set(combined.map(r => r.roomId));
      const filteredPresets = WIRESX_ROOMS_PRESET.filter(r => !savedIds.has(r.roomId));
      setRooms([...filteredPresets, ...combined]);
      
      setRawImportText('');
      setIsImporting(false);
      
      if (showToast) {
        showToast(`🎉 ¡Éxito! Se han importado ${addedCount} salas Wires-X activas adicionales de active_room2.php.`);
      }
    } catch (e) {
      console.error(e);
      if (showToast) showToast("❌ Error al procesar el texto de importación.");
    }
  };

  const handleClearImportedRooms = () => {
    if (window.confirm("¿Está seguro de que desea eliminar todas las salas importadas manualmente?")) {
      localStorage.removeItem('imported_wiresx_rooms');
      setRooms(WIRESX_ROOMS_PRESET);
      if (showToast) showToast("🗑️ Salas importadas eliminadas de la base de datos.");
    }
  };

  const handleConectarSala = (room: WiresXRoom) => {
    if (showToast) {
      showToast(`🌐 WIRES-X: Enviando comando de interconexión digital a la Sala ${room.name} (ID: ${room.roomId})`);
    }

    // Play linkage chime
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(660, audioCtx.currentTime); 
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); 
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc2.frequency.setValueAtTime(1109, audioCtx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.45);
      osc2.stop(audioCtx.currentTime + 0.45);
    } catch (e) {
      // Audio context error ignore
    }

    if (onInjectRaw) {
      // Inject digital network linkage packet representing active Room selection
      const packet = `S.A.T.>APRS,TCPIP*,qAC,WIRESX_ROOM:;SALA_LINK *111111zCONNECT_ROOM:${room.roomId} NAME:${room.name} NodesCount:${room.activeNodesCount}`;
      onInjectRaw(packet);
    }
  };

  const loadDemoText = () => {
    const demo = `21005\tSPAIN-CQ\tAlicante\tComunidad Valenciana\tSpain\t145\tSala general nacional española C4FM
21015\tCATALUNYA\tBarcelona\tCatalunya\tSpain\t48\tSala regional de catalunya para radioaficionados
21020\tANDALUCIA\tSevilla\tAndalucia\tSpain\t37\tSala de C4FM regional de Andalucia distrito 7
21030\tMADRID\tMadrid\tMadrid\tSpain\t54\tSala de la comunidad de Madrid y zona centro
20001\tARRL-ROOM\tNewington\tConnecticut\tUSA\t310\tAmerican Radio Relay League general room
20555\tCALIFORNIA\tLos Angeles\tCalifornia\tUSA\t180\tWest coast america connection network
21200\tUK-WIDE\tLondon\tGreater London\tUnited Kingdom\t245\tUnited Kingdom Fusion voice linking room`;
    setRawImportText(demo);
    if (showToast) showToast("📝 Texto de demostración cargado. Haga clic en 'Procesar e Importar'.");
  };

  return (
    <div className="space-y-5" id="wiresx-rooms-database-container">
      {/* STATS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Total Salas</span>
          <span className="text-xl font-sans font-black text-slate-100">{stats.total}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Salas España</span>
          <span className="text-xl font-sans font-black text-cyan-400">{stats.spainRooms}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Salas Internac.</span>
          <span className="text-xl font-sans font-black text-indigo-400">{stats.international}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Nodos Conectados</span>
          <span className="text-xl font-sans font-black text-amber-400">{stats.totalNodes}</span>
        </div>
        <div className="bg-slate-950/60 border border-slate-900/80 p-3.5 rounded-xl flex flex-col gap-1 shadow-md col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Importadas</span>
          <span className="text-xl font-sans font-black text-emerald-400">{stats.imported}</span>
        </div>
      </div>

      {/* SEARCH AND FILTERS PANEL */}
      <div className="bg-slate-950/80 border border-slate-900 p-4.5 rounded-xl space-y-4 shadow-lg">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Text Search Input */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar sala por ID, nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 transition-all font-sans"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 text-xs"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Country/Region Filter */}
          <div className="relative w-full lg:w-60">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <Globe size={14} />
            </span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/70 cursor-pointer appearance-none animate-none"
            >
              {countriesList.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Importer Panel Toggle Button */}
          <button
            onClick={() => setIsImporting(!isImporting)}
            className={`px-3 py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 border shrink-0 cursor-pointer ${
              isImporting 
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700'
            }`}
          >
            <Import size={14} />
            <span>Importador de Salas</span>
          </button>
        </div>

        {/* ACTIVITY SLIDER FILTER */}
        <div className="border-t border-slate-900/80 pt-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-500">
            <span className="flex items-center gap-1"><Users size={11} /> Filtrar por Actividad Mínima (Nodos Enlazados)</span>
            <span className="text-cyan-400 font-bold">{minNodes} nodos</span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="250"
              step="5"
              value={minNodes}
              onChange={(e) => setMinNodes(Number(e.target.value))}
              className="flex-1 h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded shrink-0 min-w-[50px] text-center">
              &gt;= {minNodes}
            </span>
          </div>
        </div>
      </div>

      {/* WEB DATA IMPORTER collapsible panel */}
      {isImporting && (
        <div className="bg-slate-950/90 border border-amber-500/20 p-5 rounded-2xl space-y-4 animate-fade-in shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <div className="flex items-center gap-2">
              <Import size={18} className="text-amber-400" />
              <h3 className="font-sans font-bold text-sm text-slate-100 uppercase tracking-wide">
                Importador de Salas Wires-X (desde yaesu.com)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadDemoText}
                className="text-[10px] bg-slate-900 text-slate-400 hover:text-slate-200 px-2 py-1 rounded font-mono border border-slate-800 cursor-pointer"
              >
                Cargar Demo
              </button>
              {stats.imported > 0 && (
                <button
                  onClick={handleClearImportedRooms}
                  className="text-[10px] bg-red-950/60 text-red-400 hover:bg-red-900/60 px-2 py-1 rounded font-mono border border-red-500/20 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={11} />
                  Limpiar BD
                </button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed space-y-2">
            <p>
              Actualice el listado de salas activas copiando la tabla directamente desde el portal oficial de Yaesu:
            </p>
            <ol className="list-decimal pl-5 space-y-1 font-mono text-slate-500 text-[10px]">
              <li>Abra la URL de salas activas: <a href="https://www.yaesu.com/jp/en/wires-x/id/active_room2.php" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">https://www.yaesu.com/jp/en/wires-x/id/active_room2.php <Link size={10} /></a></li>
              <li>Seleccione la tabla completa de salas activas (Ctrl+A / Cmd+A) y cópiela.</li>
              <li>Pegue el texto copiado en el recuadro inferior. El sistema extraerá automáticamente el identificador de sala, el nombre, la cantidad de nodos y la descripción.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <textarea
              className="w-full h-44 bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
              placeholder="Pegue aquí el texto copiado de la web de Yaesu active_room2.php..."
              value={rawImportText}
              onChange={(e) => setRawImportText(e.target.value)}
            />
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => {
                  setRawImportText('');
                  setIsImporting(false);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportRooms}
                className="px-4 py-1.5 bg-amber-500 text-slate-950 font-sans font-bold text-xs rounded-lg hover:bg-amber-400 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check size={13} className="stroke-[3]" />
                Procesar e Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESULTS GRID */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-slate-500 font-mono text-[10px] px-2 uppercase tracking-wider">
          <span>Salas Encontradas: <strong className="text-slate-200">{filteredRooms.length}</strong></span>
          {minNodes > 0 && (
            <button 
              onClick={() => setMinNodes(0)}
              className="text-cyan-400 hover:underline text-[9px] font-mono cursor-pointer"
            >
              Quitar filtro de actividad
            </button>
          )}
        </div>

        {filteredRooms.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-850 rounded-xl bg-slate-950/20">
            <HelpCircle size={32} className="mx-auto text-slate-600 mb-2.5" />
            <h4 className="text-xs font-bold text-slate-300 uppercase">Sin salas que cumplan los filtros</h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              No se han encontrado salas activas con los criterios establecidos. Ajuste la búsqueda, baje el límite de actividad o paste una lista fresca desde el importador.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredRooms.map((room) => {
              const isSpain = room.roomId.startsWith('21') && !room.roomId.startsWith('212') && !room.roomId.startsWith('215');
              const isRoomActive = activeRoomsList.includes(room.roomId);
              
              // Highlight active rooms
              const isHighlyActive = room.activeNodesCount >= 100;
              const isModeratelyActive = room.activeNodesCount >= 30;

              return (
                <div 
                  key={room.roomId}
                  className="bg-slate-950/70 border border-slate-900 hover:border-slate-800 rounded-xl p-4.5 transition-all duration-200 flex flex-col justify-between gap-4 shadow-md relative group hover:shadow-xl hover:bg-slate-950"
                >
                  <div className="space-y-2.5">
                    {/* Header: Name and ID */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 truncate">
                        <span className="font-mono text-sm font-black text-cyan-400 tracking-tight block uppercase truncate">
                          {room.name}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 shadow-inner">
                            ID: {room.roomId}
                          </span>
                          <span className={`text-[8px] font-mono font-black border px-1 py-0.5 rounded tracking-wide uppercase ${
                            isSpain 
                              ? 'bg-red-950/30 text-red-400 border-red-500/10' 
                              : 'bg-indigo-950/30 text-indigo-400 border-indigo-500/10'
                          }`}>
                            {isSpain ? 'ESPAÑA' : 'INTERNACIONAL'}
                          </span>
                          <span className={`text-[8px] font-mono font-black border px-1 py-0.5 rounded tracking-wide uppercase flex items-center gap-1 shadow-inner ${
                            isRoomActive 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${isRoomActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                            {isRoomActive ? 'ACTIVA' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>

                      {/* Active Nodes Badge */}
                      <div className={`px-2 py-1 rounded-lg border text-center font-mono shrink-0 shadow-inner flex flex-col justify-center min-w-[70px] ${
                        isHighlyActive ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' :
                        isModeratelyActive ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20' :
                        'bg-slate-900/60 text-slate-400 border-slate-800'
                      }`}>
                        <span className="text-sm font-black tracking-tight">{room.activeNodesCount}</span>
                        <span className="text-[7px] uppercase font-bold tracking-widest block">Nodos</span>
                      </div>
                    </div>

                    {/* Room Description */}
                    <div className="p-3 bg-slate-900/30 border border-slate-900/80 rounded-lg min-h-[50px] flex items-start gap-1.5">
                      <Server size={12} className="text-slate-500 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-slate-300 leading-normal font-sans">
                        {room.description}
                      </p>
                    </div>
                  </div>

                  {/* Card Footer: Action button */}
                  <div className="pt-3 border-t border-slate-900/80 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono text-slate-500 flex items-center gap-1">
                      <Link size={10} className="text-slate-500" />
                      Interconexión Digital C4FM
                    </span>

                    <button
                      onClick={() => handleConectarSala(room)}
                      className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    >
                      <Play size={10} className="fill-current" />
                      <span>Conectar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QUICK TUTORIAL BANNER */}
      <div className="p-4 bg-slate-900/30 border border-slate-900 rounded-xl text-slate-400 text-[11px] leading-relaxed flex items-start gap-2.5">
        <HelpCircle size={15} className="text-slate-500 shrink-0 mt-0.5" />
        <p>
          <strong>Operativa de Cambio de Sala (WIRES-X Rooms)</strong>: Cuando su transceptor Yaesu C4FM esté conectado a un nodo local sintonizado, puede cambiar la sala (Room) de conferencia global usando los comandos DTMF de su micrófono o la pantalla táctil de su equipo. Presione la tecla de búsqueda, o marque directamente <strong>#</strong> seguido de los 5 dígitos del ID de la sala (ej. <strong>#21005</strong> para SPAIN-CQ) y pulse PTT. El nodo se desconectará de la sala anterior y enlazará la nueva sala en milisegundos de forma automática.
        </p>
      </div>
    </div>
  );
}
