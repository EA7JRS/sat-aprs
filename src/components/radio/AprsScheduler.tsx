import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Calendar, 
  RotateCw, 
  AlertTriangle, 
  Send, 
  CheckCircle2, 
  X,
  Info,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ScheduledNotification } from '../../types';

interface AprsSchedulerProps {
  onScheduleTriggered?: () => void;
}

interface DrillTemplate {
  name: string;
  type: 'drill' | 'status_update';
  message: string;
  remarks: string;
  icon: string;
}

const SAFETY_DRILL_TEMPLATES: DrillTemplate[] = [
  {
    name: "SIMULACRO EVACUACION TSUNAMI",
    type: "drill",
    message: ";TSUNAMI  *261400h4025.00N/00342.00WEALERTA TSUNAMI SIMULADO - COTA 15M",
    remarks: "Simulacro de evacuación por tsunami coordinado con salvamento marítimo y REMER.",
    icon: "🌊"
  },
  {
    name: "SIMULACRO ACCIDENTE QUIMICO",
    type: "drill",
    message: ";CHEM_LEAK*261400h4025.00N/00342.00WESIMULACRO FUGA QUIMICA - CONFINAMIENTO",
    remarks: "Ejercicio de confinamiento y sellado ante fuga simulada de materiales peligrosos.",
    icon: "☣️"
  },
  {
    name: "SIMULACRO INCENDIO FORESTAL",
    type: "drill",
    message: ";WILDFIRE *261400h4025.00N/00342.00WESIMULACRO INCENDIO - EVACUAR POR RUTA A",
    remarks: "Ejercicio de evacuación por incendio forestal con avance sobre núcleos urbanos.",
    icon: "🔥"
  },
  {
    name: "SIMULACRO SISMICO AUTOPROTECCION",
    type: "drill",
    message: ";EARTHQUAK*261400h4025.00N/00342.00WESIMULACRO SISMICO - PROTEGERSE BAJO MESA",
    remarks: "Instrucciones de auto-protección y posterior evacuación de instalaciones críticas.",
    icon: "🌋"
  },
  {
    name: "DIFUSION PERIODICA REMER",
    type: "status_update",
    message: ";REMER-HQ *261400h4025.00N/00342.00W_REMER CIVIL DEFENSA ACTIVA - TELEMETRIA OK",
    remarks: "Reporte de prueba programada periódico para control de cobertura y propagación.",
    icon: "📡"
  }
];

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  parsed?: {
    objectName: string;
    isActive: boolean;
    timestamp: string;
    latitude: string;
    symbolTable: string;
    longitude: string;
    symbolCode: string;
    comment: string;
  };
}

export function validateAprsMessage(msg: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!msg) {
    errors.push('El payload del mensaje no puede estar vacío.');
    return { isValid: false, errors, warnings };
  }

  if (!msg.startsWith(';')) {
    errors.push('Error de Sintaxis APRS: Debe iniciar con el identificador de objeto de APRS (";") para ser mapeado correctamente en los terminales.');
    return { isValid: false, errors, warnings };
  }
  
  if (msg.length < 30) {
    errors.push('Longitud insuficiente. Un objeto APRS estándar debe contener identificador (";"), nombre (9 chars), estado (1 char), timestamp (7 chars), lat/lon (17 chars), símbolo y comentarios (min. 30 caracteres).');
    return { isValid: false, errors, warnings };
  }
  
  const objectName = msg.substring(1, 10);
  if (objectName.length < 9) {
    errors.push('El identificador del objeto debe tener exactamente 9 caracteres (rellene con espacios si es necesario).');
  } else if (!/^[A-Z0-9_\- ]{9}$/i.test(objectName)) {
    errors.push('El nombre del objeto contiene caracteres no permitidos. Use solo letras, números, guiones o espacios (longitud 9).');
  }
  
  const stateChar = msg.charAt(10);
  if (stateChar !== '*' && stateChar !== '_') {
    warnings.push(`Carácter de estado inusual "${stateChar}". El estándar APRS recomienda "*" para objetos activos o "_" para inactivos.`);
  }
  
  const timestamp = msg.substring(11, 18);
  if (!/^\d{6}[hz\/]$/i.test(timestamp)) {
    errors.push(`Timestamp inválido "${timestamp}". Debe ser de 7 caracteres con formato DDHHMMh (ej. 261400h), DDHHMMz o DDHHMM/.`);
  }
  
  const latStr = msg.substring(18, 26);
  if (!/^\d{4}\.\d{2}[NS]$/i.test(latStr)) {
    errors.push(`Latitud inválida "${latStr}". Debe tener el formato DDMM.hhN/S (ej. 4025.00N).`);
  } else {
    const latVal = parseFloat(latStr.substring(0, 2)) + parseFloat(latStr.substring(2, 4)) / 60;
    if (latVal > 90) {
      errors.push(`Latitud fuera de rango: ${latStr}. Grados no deben superar 90.`);
    }
  }
  
  const tableChar = msg.charAt(26);
  if (tableChar !== '/' && tableChar !== '\\') {
    warnings.push(`Tabla de símbolos inusual "${tableChar}". Se recomienda "/" (primaria) o "\\" (alternativa).`);
  }
  
  const lonStr = msg.substring(27, 35);
  if (!/^\d{5}\.\d{2}[EW]$/i.test(lonStr)) {
    errors.push(`Longitud inválida "${lonStr}". Debe tener el formato DDDMM.hhE/W (ej. 00342.00W).`);
  } else {
    const lonVal = parseFloat(lonStr.substring(0, 3)) + parseFloat(lonStr.substring(3, 5)) / 60;
    if (lonVal > 180) {
      errors.push(`Longitud fuera de rango: ${lonStr}. Grados no deben superar 180.`);
    }
  }
  
  const codeChar = msg.charAt(35);
  if (!codeChar || codeChar.trim() === '') {
    errors.push('Falta el código de icono APRS en la posición 35.');
  }
  
  const comment = msg.substring(36);
  if (!comment || comment.trim() === '') {
    warnings.push('Se recomienda añadir un comentario/comentarios legibles después del código de icono.');
  }
  
  const isValid = errors.length === 0;
  
  return {
    isValid,
    errors,
    warnings,
    parsed: isValid ? {
      objectName,
      isActive: stateChar === '*',
      timestamp,
      latitude: latStr,
      symbolTable: tableChar,
      longitude: lonStr,
      symbolCode: codeChar,
      comment
    } : undefined
  };
}

export default function AprsScheduler({ onScheduleTriggered }: AprsSchedulerProps) {
  const [schedules, setSchedules] = useState<ScheduledNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'drill' | 'status_update'>('drill');
  const [message, setMessage] = useState('');
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring'>('once');
  const [targetTime, setTargetTime] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState('15');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validation = validateAprsMessage(message);

  // Load schedules on mount
  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await customFetch('/api/aprs/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
        setError(null);
      } else {
        setError('Error al cargar la lista de programaciones.');
      }
    } catch (err: any) {
      console.error(err);
      setError('Fallo de conexión con el servidor de sincronización.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 8000); // Poll every 8s
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      alert('Por favor complete todos los campos mandatorios.');
      return;
    }

    const validation = validateAprsMessage(message);
    if (!validation.isValid) {
      alert(`Sintaxis APRS Inválida:\n\n${validation.errors.join('\n')}\n\nPor favor, corrija el formato del mensaje antes de guardar.`);
      return;
    }

    if (scheduleType === 'once' && !targetTime) {
      alert('Por favor seleccione la fecha y hora de inyección.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type,
        name: name.trim(),
        message: message.trim(),
        scheduleType,
        targetTime: scheduleType === 'once' ? targetTime : undefined,
        intervalMinutes: scheduleType === 'recurring' ? parseInt(intervalMinutes, 10) : undefined,
        remarks: remarks.trim() || undefined,
        status: 'active'
      };

      const res = await customFetch('/api/aprs/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Reset form
        setName('');
        setMessage('');
        setRemarks('');
        setTargetTime('');
        setShowAddForm(false);
        fetchSchedules();
        if (onScheduleTriggered) onScheduleTriggered();
      } else {
        const data = await res.json();
        alert(`Error al guardar: ${data.error || 'Intente de nuevo'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Fallo de transporte TCP al comunicarse con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await customFetch(`/api/aprs/schedules/${id}/toggle`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchSchedules();
        if (onScheduleTriggered) onScheduleTriggered();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta programación?')) return;
    try {
      const res = await customFetch(`/api/aprs/schedules/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchSchedules();
        if (onScheduleTriggered) onScheduleTriggered();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleForceTrigger = async (id: string) => {
    try {
      const res = await customFetch(`/api/aprs/schedules/${id}/trigger`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('✓ Transmisión APRS programada forzada e inyectada manualmente.');
        fetchSchedules();
        if (onScheduleTriggered) onScheduleTriggered();
      } else {
        alert('Fallo al forzar la inyección.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'Nunca';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div id="aprs-scheduler-card" className="bg-slate-900/90 border border-slate-700/60 rounded-lg p-4 font-mono shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>

      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-500" />
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider">
              Pilar IV: Sincronizador de Respuesta (APRS)
            </h3>
            <p className="text-[9.5px] text-slate-400">Programación de Simulacros y Boletines de Emergencia</p>
          </div>
        </div>

        <button
          id="btn-toggle-scheduler-form"
          onClick={() => setShowAddForm(!showAddForm)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] rounded transition-all font-semibold ${
            showAddForm 
              ? 'bg-rose-950/85 text-rose-300 border border-rose-500/30 hover:bg-rose-900/80' 
              : 'bg-amber-950/80 text-amber-300 border border-amber-500/30 hover:bg-amber-900/80'
          }`}
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? 'Cerrar' : 'Programar Emisión'}
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.form 
            id="aprs-schedule-create-form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border border-amber-500/20 bg-slate-950/60 rounded p-3 mb-4 flex flex-col gap-3"
            onSubmit={handleSubmit}
          >
            <div className="border-b border-slate-800/80 pb-2.5 mb-1">
              <span className="text-[9.5px] text-amber-500 font-bold tracking-wider uppercase block mb-1.5 flex items-center gap-1">
                ⚡ Plantillas Rápidas de Simulacro y Estado
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
                {SAFETY_DRILL_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    type="button"
                    onClick={() => {
                      setName(tmpl.name);
                      setType(tmpl.type);
                      setMessage(tmpl.message);
                      setRemarks(tmpl.remarks);
                    }}
                    className="p-1.5 bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 hover:border-amber-500/40 rounded flex flex-col items-center text-center gap-1 transition-all cursor-pointer group"
                    title={tmpl.remarks}
                  >
                    <span className="text-xs group-hover:scale-110 transition-transform">{tmpl.icon}</span>
                    <span className="text-[8.5px] text-slate-300 font-bold tracking-tight line-clamp-1 group-hover:text-amber-400">
                      {tmpl.name.replace("SIMULACRO ", "").replace("DIFUSION ", "")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-[10px]">Identificador / Nombre del Evento</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Simulacro Evacuación Nacional"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-900 border border-slate-700/70 p-1.5 rounded text-slate-200 outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-[10px]">Categoría del Mensaje</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('drill')}
                    className={`p-1.5 rounded border text-center transition-all ${
                      type === 'drill'
                        ? 'bg-amber-950/80 text-amber-300 border-amber-500/50 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    ⚠️ Simulacro (Drill)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('status_update')}
                    className={`p-1.5 rounded border text-center transition-all ${
                      type === 'status_update'
                        ? 'bg-blue-950/80 text-blue-300 border-blue-500/50 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    ℹ️ Boletín de Estado
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-slate-400 text-[10px]">Payload del Mensaje (APRS Object / Remark)</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  placeholder="ej. ;TSUNAMI  *261400h4025.00N/00342.00WEALERTA TSUNAMI SIMULADO"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={`bg-slate-900 border p-1.5 rounded text-slate-200 outline-none transition-colors placeholder:text-slate-600 font-mono text-xs ${
                    message 
                      ? validation.isValid 
                        ? 'border-emerald-500/70 focus:border-emerald-500' 
                        : 'border-rose-500/70 focus:border-rose-500'
                      : 'border-slate-700/70 focus:border-amber-500'
                  }`}
                />
                <p className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Info className="w-3 h-3 text-amber-500" />
                  Se prefiere el formato estándar de Objeto APRS: <code className="text-amber-400 bg-slate-950 px-1 py-0.2 rounded font-mono">;NOMBRE   *TIMESTAMPCOORDSREMARKS</code>
                </p>

                {/* Live APRS Syntax Validation Panel */}
                {message && (
                  <div className="mt-2 border rounded-lg p-3 bg-slate-950/80 font-sans text-xs flex flex-col gap-2 transition-all border-slate-800">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 mb-1 select-none">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-amber-500" />
                        Analizador de Sintaxis APRS en Tiempo Real
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        validation.isValid 
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/20' 
                          : 'bg-rose-950/80 text-rose-300 border border-rose-500/20 animate-pulse'
                      }`}>
                        {validation.isValid ? '✓ COMPATIBLE' : '✗ ERROR DE SINTAXIS'}
                      </span>
                    </div>

                    {/* Breakdown of parsed elements */}
                    {validation.isValid && validation.parsed && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/60 p-2 rounded border border-slate-800/40 text-[10px] font-mono">
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase leading-none">Nombre de Objeto</span>
                          <span className="text-amber-400 font-bold">{validation.parsed.objectName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase leading-none">Timestamp</span>
                          <span className="text-sky-400 font-bold">{validation.parsed.timestamp}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase leading-none">Coordenadas</span>
                          <span className="text-emerald-400 font-bold">{validation.parsed.latitude} / {validation.parsed.longitude}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase leading-none">Sello / Icono</span>
                          <span className="text-indigo-400 font-bold">{validation.parsed.symbolTable}{validation.parsed.symbolCode}</span>
                        </div>
                        <div className="col-span-2 sm:col-span-4 border-t border-slate-850 pt-1 mt-1 font-sans text-slate-300 text-[10px] leading-tight">
                          <span className="text-slate-500 font-mono text-[9px] uppercase block mb-0.5">Comentarios de Emergencia</span>
                          <span className="italic">"{validation.parsed.comment || '(Sin comentarios)'}"</span>
                        </div>
                      </div>
                    )}

                    {/* Errors list */}
                    {validation.errors.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {validation.errors.map((err, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-rose-400 text-[10.5px] leading-snug">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500 mt-0.5" />
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings list */}
                    {validation.warnings.length > 0 && (
                      <div className="flex flex-col gap-1 border-t border-slate-850/60 pt-1.5 mt-1">
                        {validation.warnings.map((warn, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-amber-400 text-[10px] leading-tight">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                            <span>{warn}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-[10px]">Esquema de Repetición</label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value as 'once' | 'recurring')}
                  className="bg-slate-900 border border-slate-700/70 p-1.5 rounded text-slate-200 outline-none focus:border-amber-500 transition-colors"
                >
                  <option value="once">Emisión Única (Futuro)</option>
                  <option value="recurring">Difusión Periódica (Recurrente)</option>
                </select>
              </div>

              {scheduleType === 'once' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-[10px]">Fecha y Hora Local de Difusión</label>
                  <input
                    type="datetime-local"
                    required
                    value={targetTime}
                    onChange={(e) => setTargetTime(e.target.value)}
                    className="bg-slate-900 border border-slate-700/70 p-1.5 rounded text-slate-200 outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-[10px]">Frecuencia / Intervalo de Inyección</label>
                  <select
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(e.target.value)}
                    className="bg-slate-900 border border-slate-700/70 p-1.5 rounded text-slate-200 outline-none focus:border-amber-500 transition-colors"
                  >
                    <option value="1">Cada 1 minuto (Pruebas)</option>
                    <option value="5">Cada 5 minutos</option>
                    <option value="15">Cada 15 minutos</option>
                    <option value="30">Cada 30 minutos</option>
                    <option value="60">Cada 1 hora</option>
                    <option value="360">Cada 6 horas</option>
                    <option value="1440">Cada 24 horas</option>
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-slate-400 text-[10px]">Anotaciones Técnicas o Canal (Opcional)</label>
                <input
                  type="text"
                  placeholder="ej. Inyección coordinada con REMER Zona 1 VHF"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="bg-slate-900 border border-slate-700/70 p-1.5 rounded text-slate-200 outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold p-2 rounded transition-all text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Inscribiendo...' : 'Confirmar e Inscribir en TNC'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2.5 max-h-[350px] overflow-y-auto pr-1">
        {loading && schedules.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-[10.5px]">
            <RotateCw className="w-4 h-4 animate-spin mx-auto mb-2 text-amber-500/60" />
            Sincronizando tareas programadas con la TNC local...
          </div>
        ) : error ? (
          <div className="border border-red-900/50 bg-red-950/20 text-red-400 p-2.5 rounded text-[10px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div>
              <strong>Error de Sincronización:</strong> {error}
            </div>
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-[10px] border border-dashed border-slate-800 rounded">
            No hay transmisiones periódicas o simulacros en agenda.
            <br />
            Haga clic en <strong className="text-amber-400">Programar Emisión</strong> para agendar una.
          </div>
        ) : (
          schedules.map((schedule) => {
            const isActive = schedule.status === 'active';
            const isCompleted = schedule.status === 'completed';
            const isDrill = schedule.type === 'drill';

            return (
              <div 
                key={schedule.id}
                className={`p-2.5 rounded border transition-all flex flex-col gap-2 relative group ${
                  isCompleted 
                    ? 'bg-slate-950/40 border-slate-800/40 opacity-60' 
                    : isActive 
                      ? isDrill
                        ? 'bg-[#1a1610] border-amber-500/20'
                        : 'bg-[#0f1826] border-blue-500/20'
                      : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        isDrill 
                          ? 'bg-amber-950/90 text-amber-300 border border-amber-500/30' 
                          : 'bg-blue-950/90 text-blue-300 border border-blue-500/30'
                      }`}>
                        {isDrill ? '⚠️ SIMULACRO' : 'ℹ️ ACTUALIZACION'}
                      </span>
                      <span className={`text-[8.5px] px-1 py-0.5 rounded ${
                        isCompleted 
                          ? 'bg-slate-800 text-slate-400' 
                          : isActive 
                            ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-slate-950 text-slate-500 border border-slate-800'
                      }`}>
                        {isCompleted ? 'COMPLETADO' : isActive ? 'ACTIVO' : 'PAUSADO'}
                      </span>
                      <strong className="text-slate-200 text-[11px] leading-none">{schedule.name}</strong>
                    </div>
                    
                    <div className="bg-slate-950/60 border border-slate-800/60 px-2 py-1 rounded text-[10px] text-emerald-400 break-all select-all font-mono mt-1">
                      {schedule.callsign || 'EA1URG-13'}&gt;APXSAT::{schedule.message.toUpperCase()}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    {!isCompleted && (
                      <button
                        onClick={() => handleToggle(schedule.id)}
                        title={isActive ? 'Pausar programación' : 'Activar programación'}
                        className={`p-1 rounded transition-colors ${
                          isActive 
                            ? 'text-amber-500 hover:bg-amber-500/10' 
                            : 'text-emerald-500 hover:bg-emerald-500/10'
                        }`}
                      >
                        {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleForceTrigger(schedule.id)}
                      title="Transmitir payload ahora (Prueba)"
                      className="p-1 rounded text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-cyan-400/10" />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      title="Eliminar"
                      className="p-1 rounded text-rose-500 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-slate-400 border-t border-slate-800/40 pt-1.5 mt-0.5">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>
                      {schedule.scheduleType === 'once' ? 'Único' : `Cada ${schedule.intervalMinutes}m`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Última: {formatDateTime(schedule.lastTriggered)}</span>
                  </div>
                  {isActive && schedule.nextTriggerTime && (
                    <div className="col-span-2 flex items-center gap-1 text-[8.5px] text-amber-500/90 font-bold bg-amber-500/5 px-1.5 py-0.5 rounded mt-0.5">
                      <Clock className="w-3 h-3 animate-pulse text-amber-500" />
                      <span>Siguiente Emisión: {formatDateTime(schedule.nextTriggerTime)}</span>
                    </div>
                  )}
                  {schedule.remarks && (
                    <div className="col-span-2 text-slate-500 italic mt-0.5 text-[8.5px] border-l border-slate-700/50 pl-1.5 truncate">
                      {schedule.remarks}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
