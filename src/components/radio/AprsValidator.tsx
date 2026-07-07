import { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Compass, 
  Send, 
  HelpCircle, 
  Settings, 
  Activity, 
  Radio, 
  Check, 
  Zap, 
  Info, 
  Network
} from 'lucide-react';

interface AprsValidatorProps {
  onInjectRaw?: (payload: string) => Promise<boolean>;
}

interface SymbolPreset {
  name: string;
  table: string;
  code: string;
  description: string;
  category: 'Fijo' | 'Móvil' | 'Emergencia' | 'Servicios';
  emoji: string;
}

const SYMBOL_PRESETS: SymbolPreset[] = [
  { name: 'Emergencia / REMER', table: '\\', code: 'E', description: 'Sello estándar de Protección Civil e IARU para Redes de Emergencias Colectivas.', category: 'Emergencia', emoji: '🛡️' },
  { name: 'Estación Meteorológica', table: '/', code: '_', description: 'Transmisor automático de telemetría climatológica y ambiental (WX).', category: 'Servicios', emoji: '🌦️' },
  { name: 'Digirepetidor / Nodo', table: '/', code: '#', description: 'Repetidor simplex de red de Packet Radio de canal ancho.', category: 'Servicios', emoji: '📡' },
  { name: 'Puesto de Mando (SAR)', table: '/', code: 'S', description: 'Centro táctico de coordinación de búsqueda y salvamento en catástrofes.', category: 'Emergencia', emoji: '⛺' },
  { name: 'Servidor IGate', table: '/', code: '&', description: 'Pasarela que enlaza la portadora RF local con los servidores del APRS-IS.', category: 'Servicios', emoji: '🌐' },
  { name: 'Ambulancia / Médico', table: '/', code: 'a', description: 'Ventanilla asignada a transporte médico, triajes de primera intervención y asistencia civil.', category: 'Emergencia', emoji: '🚑' },
  { name: 'Coche / Radio Móvil', table: '/', code: '>', description: 'Móvil terrestre estándar (vehículos ligeros, inspectores, patrullas).', category: 'Móvil', emoji: '🚙' },
  { name: 'Estación Fija / QTH', table: '/', code: '-', description: 'Estación de radio fija residencial de radioaficionado o centro de base civil.', category: 'Fijo', emoji: '🏠' },
  { name: 'Camión de Bomberos', table: '/', code: 'v', description: 'Unidad pesada contra incendios forestales u operadores tácticos asignados.', category: 'Servicios', emoji: '🚒' },
  { name: 'Walkie-Talkie / HT', table: '/', code: '[', description: 'Unidad portátil personal (operador a pie, despliegues rápidos en montaña).', category: 'Móvil', emoji: '🚶' },
];

const SSID_GUIDELINES: Record<string, string> = {
  '0': 'Principal / Estación fija principal de casa o club sin SSID marcado.',
  '1': 'Estaciones adicionales fijas, digipeaters secundarios, o enlaces redundantes.',
  '2': 'Estaciones fijas secundarias alternas o digirepetidores tácticos.',
  '5': 'Dispositivos portátiles por redes inalámbricas estables de Internet (APRS-IS, dmr, smartphones).',
  '7': 'Unidades portátiles manuales (Walkie-talkies o HT que transmiten a baja potencia).',
  '8': 'Unidades móviles náuticas (botes salvavidas, embarcaciones fluviales, Cruz Roja de Mar).',
  '9': 'Unidades móviles terrestres (Vehículos principales con transceptores de potencia media/alta).',
  '10': 'Internet Gateways (IGates) que absorben RF y alimentan las bases mundiales IP.',
  '11': 'Globos de telemetría altitudinal o satélites de órbita baja (Loon balloons, cubésats).',
  '12': 'Dispositivos con transmisión unidireccional automática (balizas sondas de bajo coste).',
  '13': 'Estaciones meteorológicas digitales directas u otros nodos automáticos de telemetría (WX).',
  '14': 'Vehículos pesados de transporte, remolques o camiones cisterna de logística.',
  '15': 'Estación repetidora HF de larga distancia o gateways multibanda.'
};

export default function AprsValidator({ onInjectRaw }: AprsValidatorProps) {
  const [callsign, setCallsign] = useState('EA1URG');
  const [ssid, setSsid] = useState('13');
  const [aprsPath, setAprsPath] = useState('WIDE1-1,WIDE2-1');
  const [symbolTable, setSymbolTable] = useState('/');
  const [symbolCode, setSymbolCode] = useState('_');
  const [remarks, setRemarks] = useState('Consola REMER en alerta');
  
  // Simulated injection states
  const [injecting, setInjecting] = useState(false);
  const [injectStatus, setInjectStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Validation results
  const [score, setScore] = useState(100);
  const [rating, setRating] = useState<'ÓPTIMO' | 'ADVERTENCIA' | 'RECHAZADO'>('ÓPTIMO');
  
  const [rules, setRules] = useState<{
    callsign: { ok: boolean; val: 'valid' | 'warn' | 'invalid'; text: string };
    ssid: { ok: boolean; val: 'valid' | 'warn'; text: string };
    path: { ok: boolean; val: 'valid' | 'warn' | 'invalid'; text: string };
    symbol: { ok: boolean; val: 'valid' | 'warn'; text: string };
  }>({
    callsign: { ok: true, val: 'valid', text: '' },
    ssid: { ok: true, val: 'valid', text: '' },
    path: { ok: true, val: 'valid', text: '' },
    symbol: { ok: true, val: 'valid', text: '' },
  });

  // Calculate APRS validations
  useEffect(() => {
    let currentScore = 100;
    
    // 1. CALLSIGN VALIDATION
    const cleanCall = callsign.trim().toUpperCase();
    const callsignRegex = /^[A-Z0-9]{3,6}$/;
    let callsignOk = true;
    let callsignVal: 'valid' | 'warn' | 'invalid' = 'valid';
    let callsignText = 'Formato de indicativo ITU estándar de radioaficionado.';

    if (!cleanCall) {
      callsignOk = false;
      callsignVal = 'invalid';
      callsignText = 'El campo del Indicativo (Callsign) no puede estar vacío.';
      currentScore -= 40;
    } else if (!callsignRegex.test(cleanCall)) {
      callsignOk = false;
      callsignVal = 'invalid';
      callsignText = 'Indicativo inválido. Debe tener entre 3 y 6 letras/números (ej. EA1URG, W3APL, G4BIP) sin símbolos ni SSID.';
      currentScore -= 30;
    }

    // 2. SSID VALIDATION
    const ssidNum = parseInt(ssid, 10);
    let ssidOk = true;
    let ssidVal: 'valid' | 'warn' = 'valid';
    let ssidText = SSID_GUIDELINES[ssid] || 'SSID genérico APRS.';

    if (isNaN(ssidNum) || ssidNum < 0 || ssidNum > 15) {
      ssidOk = false;
      ssidVal = 'warn';
      ssidText = 'SSID fuera de rango. Debería ser un número entero entre 0 y 15 según el estándar AX.25.';
      currentScore -= 15;
    } else {
      // Check suitability of SSID with symbol table
      if (symbolCode === '_' && ssidNum !== 13) {
        ssidVal = 'warn';
        ssidText = 'Desvío de Recomendación: Se prefiere SSID -13 para estaciones meteorológicas automáticas para identificar el servicio rápidamente.';
        currentScore -= 5;
      } else if ((symbolCode === '>' || symbolCode === '[') && ssidNum !== 9 && ssidNum !== 7) {
        ssidVal = 'warn';
        ssidText = 'Sugerencia IARU: Para unidades móviles (>) se sugiere usar SSID -9, y para portátiles HT ([) el SSID -7.';
        currentScore -= 5;
      }
    }

    // 3. PATH VALIDATION
    const cleanPath = aprsPath.trim();
    let pathOk = true;
    let pathVal: 'valid' | 'warn' | 'invalid' = 'valid';
    let pathText = 'Trayecto de digirepetidores recomendado por la IARU (New-N Paradigm).';

    if (!cleanPath) {
      pathOk = false;
      pathVal = 'invalid';
      pathText = 'La ruta APRS está vacía. Su paquete no llegará muy lejos de su antena sin digis.';
      currentScore -= 20;
    } else if (cleanPath.includes(' ')) {
      pathOk = false;
      pathVal = 'invalid';
      pathText = 'La ruta APRS tiene espacios en blanco. Los espacios terminarán el encabezado AX.25 abruptamente, causando descartes.';
      currentScore -= 35;
    } else {
      const items = cleanPath.split(',');
      let deprecatedActive = false;
      let tooManyHops = false;
      let misconfiguredN = false;
      let totalHops = 0;

      // Check each comma-separated routing item
      items.forEach(item => {
        const itemUpper = item.toUpperCase();
        
        // Legacy path components (RELAY, WIDE (no SSID), TRACE)
        const isLegacy = ['RELAY', 'WIDE', 'TRACE'].includes(itemUpper);
        if (isLegacy) {
          deprecatedActive = true;
        }

        // New-N checking (WIDEn-N, TRACEn-N)
        const newNMatch = itemUpper.match(/^(WIDE|TRACE)([1-9])-([0-9])$/);
        if (newNMatch) {
          const limit = parseInt(newNMatch[2], 10);
          const remaining = parseInt(newNMatch[3], 10);
          
          totalHops += remaining;

          if (limit > 2) {
            tooManyHops = true; // WIDE3 or higher
          }
          if (remaining > limit) {
            misconfiguredN = true; // e.g. WIDE1-2
          }
        } else if (!isLegacy && itemUpper !== 'TCPIP' && itemUpper !== 'TCPIP*') {
          // Custom local callsigns as digipeater hop is valid in some cases, so let's allow but count
          totalHops += 1;
        }
      });

      if (deprecatedActive) {
        pathOk = false;
        pathVal = 'invalid';
        pathText = 'Peligro de inundación por ruta obsoleta (RELAY, WIDE sin-N). Prohibido por los estándares IARU modernos.';
        currentScore -= 25;
      } else if (tooManyHops) {
        pathOk = false;
        pathVal = 'warn';
        pathText = 'Trayecto de alta dilatación (WIDE3-x, WIDE4-x). Genera bucles y congestión de red innecesaria.';
        currentScore -= 15;
      } else if (totalHops > 3) {
        pathOk = false;
        pathVal = 'warn';
        pathText = `Lote excesivo: ${totalHops} saltos de propagación total. La IARU recomienda un máximo de 2 o 3 saltos simultáneos en redes de emergencia.`;
        currentScore -= 15;
      } else if (misconfiguredN) {
        pathOk = false;
        pathVal = 'warn';
        pathText = 'Ruta con SSID inusual (ej. WIDE1-2): Los saltos restantes no deben exceder el límite inicial máximo del nodo.';
        currentScore -= 8;
      }
    }

    // 4. SYMBOL VALIDATION
    let symbolOk = true;
    let symbolVal: 'valid' | 'warn' = 'valid';
    let symbolText = 'Par de símbolos APRS correcto.';

    if (symbolTable !== '/' && symbolTable !== '\\') {
      symbolOk = false;
      symbolVal = 'warn';
      symbolText = 'Identificador de tabla desconocido. Use "/" (primaria) o "\\" (alterna).';
      currentScore -= 10;
    } else if (!symbolCode || symbolCode.length !== 1) {
      symbolOk = false;
      symbolVal = 'warn';
      symbolText = 'Debe indicar un solo caracter de código para el símbolo.';
      currentScore -= 10;
    } else if (symbolTable === '\\' && symbolCode === 'E') {
      symbolText = '✓ Sello de Emergencia IARU/Ecosonda REMER. Altamente priorizado por la red civil de radioaficionados.';
    }

    // Apply limits and calculate rating
    const finalScore = Math.max(0, currentScore);
    setScore(finalScore);

    if (finalScore >= 85) {
      setRating('ÓPTIMO');
    } else if (finalScore >= 50) {
      setRating('ADVERTENCIA');
    } else {
      setRating('RECHAZADO');
    }

    setRules({
      callsign: { ok: callsignOk, val: callsignVal, text: callsignText },
      ssid: { ok: ssidOk, val: ssidVal, text: ssidText },
      path: { ok: pathOk, val: pathVal, text: pathText },
      symbol: { ok: symbolOk, val: symbolVal, text: symbolText },
    });

  }, [callsign, ssid, aprsPath, symbolTable, symbolCode]);

  // Construct and render simulated APRS packet
  const buildRawPacket = () => {
    const cleanCall = callsign.trim().toUpperCase() || 'EA1URG';
    const ssidStr = ssid !== '' ? `-${ssid}` : '';
    const cleanPath = aprsPath.trim().toUpperCase() || 'WIDE1-1';
    
    // Position payload using coordinate placeholders of Madrid Central (QTH)
    // Format: ={LATITUDE}{SYMBOL_TABLE}{LONGITUDE}{SYMBOL_CODE}{REMARKS}
    const latStr = '4025.00N';
    const lonStr = '00342.00W';
    
    return `${cleanCall}${ssidStr}>APXSAT,${cleanPath}:=${latStr}${symbolTable}${lonStr}${symbolCode}${remarks.trim()}`;
  };

  const handleSelectPreset = (p: SymbolPreset) => {
    setSymbolTable(p.table);
    setSymbolCode(p.code);
  };

  const handleInjectSimulator = async () => {
    if (rating === 'RECHAZADO') {
      setInjectStatus({
        success: false,
        message: 'No se puede inyectar. Su paquete viola las directrices y redundaría en rechazo definitivo por las TNCs de REMER.'
      });
      return;
    }

    setInjecting(true);
    setInjectStatus(null);
    const packetPayload = buildRawPacket();

    try {
      if (onInjectRaw) {
        const result = await onInjectRaw(packetPayload);
        if (result) {
          setInjectStatus({
            success: true,
            message: '✓ ¡Paquete AX.25 validado e inyectado con éxito en el terminal TNC APRS!'
          });
        } else {
          setInjectStatus({
            success: false,
            message: 'Fallo al despachar el paquete. El microservidor de red de la consola indica un error de transmisión de transporte TCP.'
          });
        }
      } else {
        // Fallback simulation in UI alone
        await new Promise((r) => setTimeout(r, 1200));
        setInjectStatus({
          success: true,
          message: '✓ [Simulado] Paquete emitido al puerto KISS 8001 / Enrutado por pasarela de radioafición.'
        });
      }
    } catch (err) {
      setInjectStatus({
        success: false,
        message: 'Error de respuesta del nodo TNC: ' + (err as Error).message
      });
    } finally {
      setInjecting(false);
      // Auto clear simulation status
      setTimeout(() => {
        setInjectStatus(null);
      }, 7000);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fade-in text-slate-200 mt-2 font-sans" id="aprs-validate-tool">
      
      {/* LEFT FORM COLUMN (7 COLS) */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        
        {/* INPUT PARAMETERS CARD */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Settings className="text-emerald-400 shrink-0" size={15} />
            <span className="font-mono text-xs text-slate-300 font-bold uppercase tracking-wider">Identificación y Enrutamiento de Estación</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* CALLSIGN INPUT */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Indicativo (Callsign)</label>
              <input
                type="text"
                maxLength={6}
                value={callsign}
                onChange={(e) => setCallsign(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                placeholder="EA1URG"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-xs uppercase"
              />
            </div>

            {/* SSID SELECT DROPDOWN */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">SSID AX.25 (Uso Táctico)</label>
              <select
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
              >
                <option value="0">-0 Home Base (Sin SSID)</option>
                <option value="1">-1 Baliza Enlace HF</option>
                <option value="2">-2 Repetidor Auxiliar</option>
                <option value="5">-5 Smart Device / APRS-IS</option>
                <option value="7">-7 Portable HT (Walkie-Talkie)</option>
                <option value="8">-8 Marítima / Embarcaciones</option>
                <option value="9">-9 Estación Móvil (Vehículo)</option>
                <option value="10">-10 IGate Directo a Internet</option>
                <option value="11">-11 Telemetría / Globo / Sat</option>
                <option value="12">-12 Baliza unidireccional</option>
                <option value="13">-13 Estación Meteorológica / WX</option>
                <option value="14">-14 Camiones / Logística Remolque</option>
                <option value="15">-15 Consola de Emergencias HF</option>
              </select>
            </div>

            {/* DIGIPEATING PATH INPUT */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Trayecto Digipeater (APRS Path)</label>
              <input
                type="text"
                value={aprsPath}
                onChange={(e) => setAprsPath(e.target.value.replace(/\s+/g, ''))} // No spaces allowed
                placeholder="WIDE1-1,WIDE2-1"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* TABLE AND CODE SELECTORS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-900">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Tabla Símbolos</label>
                <select
                  value={symbolTable}
                  onChange={(e) => setSymbolTable(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                >
                  <option value="/">/ (Primaria)</option>
                  <option value="\">\ (Alternativa)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Código Icono</label>
                <input
                  type="text"
                  maxLength={1}
                  value={symbolCode}
                  onChange={(e) => setSymbolCode(e.target.value.substring(0, 1))}
                  placeholder="_"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-100 text-center focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
              </div>
            </div>

            {/* TELEMETRY REMARKS */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Texto Informativo (Remarks)</label>
              <input
                type="text"
                maxLength={45}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Consola REMER en alerta"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>
          </div>
        </div>

        {/* SYMBOL PRESET SELECTION GRID */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5 justify-between">
            <div className="flex items-center gap-2">
              <Radio className="text-indigo-400 shrink-0 animate-pulse" size={14} />
              <span className="font-mono text-xs text-slate-300 font-bold uppercase tracking-wider">Iconografía Estándar IARU para Catástrofes</span>
            </div>
            <span className="text-[9px] text-slate-500 font-mono">Selector Rápido</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
            {SYMBOL_PRESETS.map((p) => {
              const active = symbolTable === p.table && symbolCode === p.code;
              return (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => handleSelectPreset(p)}
                  className={`p-2 rounded-lg border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    active 
                      ? 'bg-indigo-950/45 border-indigo-500 text-indigo-200' 
                      : 'bg-slate-950/65 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title={p.description}
                >
                  <span className="text-lg">{p.emoji}</span>
                  <span className="font-sans font-bold text-[9px] leading-tight truncate w-full">{p.name}</span>
                  <span className="font-mono text-[8px] px-1 py-0.2 bg-slate-900 border border-slate-800/65 rounded text-indigo-400 font-bold">
                    {p.table}{p.code}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* RIGHT COMPLIANCE COLUMN (5 COLS) */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        
        {/* COMPLIANCE RATING CARD */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-3.5 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2.5 select-none font-sans">
            <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-wider block">Dictamen de Compatibilidad</span>
            <span className="text-[10px] text-slate-600 font-mono">IARU Region-1 Std</span>
          </div>

          {/* SPEEDOMETER / SCORE DISPLAY */}
          <div className="flex items-center justify-between bg-slate-900/60 p-3.5 rounded-xl border border-slate-900/70">
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Índice Compliance</span>
              <div className="flex items-baseline gap-1.5 font-mono select-none">
                <span className={`text-3xl font-black ${
                  score >= 85 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-500' : 'text-red-400'
                }`}>
                  {score}%
                </span>
                <span className="text-slate-500 text-xs">Alineado</span>
              </div>
            </div>

            <div className="text-right flex flex-col items-end gap-1 font-sans">
              <span className={`px-2.5 py-0.8 rounded text-[10px] font-bold border ${
                rating === 'ÓPTIMO' 
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400' 
                  : rating === 'ADVERTENCIA' 
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-400' 
                    : 'bg-red-950/40 border-red-500/40 text-red-400'
              }`}>
                {rating}
              </span>
              <span className="text-[9px] text-slate-500 italic">
                {rating === 'ÓPTIMO' ? 'Seguro para inyección' : rating === 'ADVERTENCIA' ? 'Riesgo de denegación' : 'No inyectable'}
              </span>
            </div>
          </div>

          {/* RULES LIST */}
          <div className="space-y-2.5 font-sans">
            {/* CALLSIGN RULE */}
            <div className="flex items-start gap-2 text-xs border-b border-slate-900/50 pb-2">
              {rules.callsign.val === 'valid' ? (
                <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={13} />
              ) : rules.callsign.val === 'warn' ? (
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={13} />
              ) : (
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5 animate-pulse" size={13} />
              )}
              <div className="space-y-0.5 leading-tight">
                <span className="font-bold text-slate-300 block text-[10px]">Indicativo Radioaficionado</span>
                <p className="text-[10px] text-slate-500">{rules.callsign.text}</p>
              </div>
            </div>

            {/* SSID RULE */}
            <div className="flex items-start gap-2 text-xs border-b border-slate-900/50 pb-2">
              {rules.ssid.val === 'valid' ? (
                <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={13} />
              ) : (
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={13} />
              )}
              <div className="space-y-0.5 leading-tight">
                <span className="font-bold text-slate-300 block text-[10px]">Asignación SSID (AX.25 SSID)</span>
                <p className="text-[10px] text-slate-500">{rules.ssid.text}</p>
              </div>
            </div>

            {/* PATH RULE */}
            <div className="flex items-start gap-2 text-xs border-b border-slate-900/50 pb-2">
              {rules.path.val === 'valid' ? (
                <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={13} />
              ) : rules.path.val === 'warn' ? (
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={13} />
              ) : (
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5 animate-pulse" size={13} />
              )}
              <div className="space-y-0.5 leading-tight">
                <span className="font-bold text-slate-300 block text-[10px]">Enrutamiento de Saltos (APs Path)</span>
                <p className="text-[10px] text-slate-500">{rules.path.text}</p>
              </div>
            </div>

            {/* SYMBOL RULE */}
            <div className="flex items-start gap-2 text-xs">
              {rules.symbol.val === 'valid' ? (
                <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={13} />
              ) : (
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={13} />
              )}
              <div className="space-y-0.5 leading-tight">
                <span className="font-bold text-slate-300 block text-[10px]">Identificador Simbólico (IARU Icons)</span>
                <p className="text-[10px] text-slate-500">{rules.symbol.text}</p>
              </div>
            </div>
          </div>
        </div>

        {/* GENERATED PACKET DISPLAY CARD */}
        <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-3 shadow-md font-mono text-xs">
          <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">APRS Packet AX.25 Payload Generada</span>
          
          <div className="p-3 bg-black/75 rounded border border-slate-900 leading-relaxed font-semibold break-all text-[11px] select-all relative overflow-hidden group">
            {/* CALLSIGN IN YELLOW */}
            <span className="text-yellow-400">{callsign.trim().toUpperCase() || 'EA1URG'}</span>
            <span className="text-slate-400">-{ssid}</span>
            {/* TOCALL AND PATH IN MAGENTA */}
            <span className="text-purple-400">&gt;APXSAT</span>
            <span className="text-cyan-400">,{aprsPath.trim().toUpperCase() || 'WIDE1-1'}</span>
            <span className="text-slate-500">:</span>
            {/* POSITION DATA */}
            <span className="text-amber-200">=4025.00N</span>
            {/* TABLE CHAR */}
            <span className="text-emerald-400 font-black px-0.5 bg-emerald-950/70 border border-emerald-500/20 rounded">{symbolTable}</span>
            <span className="text-amber-200">00342.00W</span>
            {/* CODE CHAR */}
            <span className="text-emerald-400 font-black px-0.5 bg-emerald-950/70 border border-emerald-500/20 rounded">{symbolCode}</span>
            {/* SPECIAL REMARKS TEXT */}
            <span className="text-slate-100 italic">{remarks.trim()}</span>

            <span className="absolute right-1 top-1 bg-slate-900 text-[8px] text-slate-500 px-1 py-0.2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              RAW PACKET
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleInjectSimulator}
              disabled={injecting || rating === 'RECHAZADO'}
              className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer uppercase font-sans tracking-wide transition-all ${
                rating === 'RECHAZADO'
                  ? 'bg-slate-900 border border-slate-900/60 text-slate-600 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 shadow-md shadow-emerald-900/10'
              }`}
            >
              <Send size={12} className={injecting ? 'animate-ping' : ''} />
              <span>{injecting ? 'Transmitiendo Baliza...' : 'Inyectar Paquete en la Red'}</span>
            </button>

            {injectStatus && (
              <div className={`p-2.5 rounded border text-[10px] font-sans ${
                injectStatus.success 
                  ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-300' 
                  : 'bg-red-950/25 border-red-500/35 text-red-300'
              } animate-pulse`}>
                {injectStatus.message}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
