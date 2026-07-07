import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, ChevronRight, ChevronLeft, HelpCircle, 
  Radio, Layers, ShieldCheck, Check, Compass, 
  Cpu, Activity, Flame, Ship, Globe, Map, 
  Settings, AlertTriangle, BookOpen, Terminal, Sparkles
} from 'lucide-react';

interface HelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  playBuzzerSound?: (freq?: number, duration?: number, type?: OscillatorType) => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export default function HelpOverlay({ 
  isOpen, 
  onClose, 
  playBuzzerSound, 
  activeTab, 
  setActiveTab 
}: HelpOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  
  // Interactive Pillar Playground state
  const [selectedPillarInfo, setSelectedPillarInfo] = useState<number>(0);
  
  // Interactive AX.25 Simulator state
  const [selectedAlertType, setSelectedAlertType] = useState<'sismo' | 'incendio' | 'meteo'>('sismo');
  const [txState, setTxState] = useState<'idle' | 'preamble' | 'transmitting' | 'success'>('idle');
  const [txProgress, setTxProgress] = useState(0);
  const [txLog, setTxLog] = useState<string[]>([]);
  
  // Interactive Geodesy Validator state
  const [testLat, setTestLat] = useState('40.4167');
  const [testLon, setTestLon] = useState('-3.7037');

  const totalSteps = 5;

  // Sync ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      } else if (e.key === 'ArrowRight' && isOpen && currentStep < totalSteps - 1) {
        nextStep();
      } else if (e.key === 'ArrowLeft' && isOpen && currentStep > 0) {
        prevStep();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  // Audio simulation of AFSK 1200 baud Bell 202 tones
  const playAfskSimulation = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Simulate quick alternate tones (1200 Hz mark and 2200 Hz space) representing radio packet AFSK
      let time = ctx.currentTime;
      const duration = 1.2; // total sound duration
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.02, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      // alternate frequency rapidly
      const steps = 18;
      const stepTime = duration / steps;
      for (let i = 0; i < steps; i++) {
        const freq = i % 2 === 0 ? 1200 : 2200;
        osc.frequency.setValueAtTime(freq, time + i * stepTime);
      }
      
      osc.start(time);
      osc.stop(time + duration);
    } catch (e) {
      // Fallback to simpler buzzer
      if (playBuzzerSound) {
        playBuzzerSound(1200, 0.2, 'sine');
        setTimeout(() => playBuzzerSound(2200, 0.2, 'sine'), 150);
      }
    }
  };

  const handleNext = () => {
    if (playBuzzerSound) playBuzzerSound(880, 0.05, 'sine');
    nextStep();
  };

  const handlePrev = () => {
    if (playBuzzerSound) playBuzzerSound(784, 0.05, 'sine');
    prevStep();
  };

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1));
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  // Launch simulated AX.25 RF Transmission
  const startAx25Transmission = () => {
    if (txState !== 'idle') return;
    
    // Play initial beep
    if (playBuzzerSound) playBuzzerSound(1000, 0.1, 'triangle');
    
    setTxState('preamble');
    setTxProgress(0);
    setTxLog(['[TNC] Conmutando canal a modo transmisión (PTT ON)', '[TNC] Generando preámbulo TXDELAY (300ms) de sincronización de portadora...']);
    
    let interval = setInterval(() => {
      setTxProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTxState('transmitting');
          
          // Play AFSK sound
          playAfskSimulation();
          setTxLog(current => [
            ...current,
            '[TNC] Transmitiendo trama AX.25 en modo broadcast UI (Unnumbered Information)',
            `[RF] Modulando tonos AFSK (Bell 202: 1200Hz / 2200Hz) sobre 144.800 MHz`,
            `[RF] PUSH -> EA1URG-10 via WIDE1-1, WIDE2-1...`
          ]);

          setTimeout(() => {
            setTxState('success');
            setTxLog(current => [
              ...current,
              '[TNC] Transmisión finalizada. PTT OFF. Retornando a modo escucha (RX).',
              '✓ ¡Trama de emergencia propagada en la red local!'
            ]);
            if (playBuzzerSound) playBuzzerSound(1046, 0.15, 'sine');
          }, 1400);

          return 100;
        }
        return prev + 25;
      });
    }, 200);
  };

  const resetAx25Sim = () => {
    setTxState('idle');
    setTxProgress(0);
    setTxLog([]);
    if (playBuzzerSound) playBuzzerSound(600, 0.08, 'sine');
  };

  // Geodetic coordinate validation check
  const isLatValid = useMemo(() => {
    const num = Number(testLat);
    return !isNaN(num) && testLat.trim() !== '' && num >= -90 && num <= 90;
  }, [testLat]);

  const isLonValid = useMemo(() => {
    const num = Number(testLon);
    return !isNaN(num) && testLon.trim() !== '' && num >= -180 && num <= 180;
  }, [testLon]);

  // Pillar list details
  const pillarsList = [
    {
      id: 1,
      title: 'Pilar I: Sondeo y Diagnóstico',
      color: 'border-emerald-500 text-emerald-400 bg-emerald-950/10',
      desc: 'Monitorea peligros naturales en tiempo real. Incluye sismos (IGN), incendios forestales (hotspots de satélites VIIRS/MODIS de NASA y trayectorias Copernicus), alertas climáticas (AEMET), y boyas oceanográficas (Portus).',
      tip: 'Puedes cambiar el estilo del mapa base entre Táctico, Callejero y Satélite desde la barra de capas del Radar para analizar caminos forestales y relieve rural durante incendios.'
    },
    {
      id: 2,
      title: 'Pilar II: Verificación y CECOP',
      color: 'border-blue-500 text-blue-400 bg-blue-950/10',
      desc: 'El Centro de Coordinación Operativa (CECOP) audita, aprueba y redacta boletines informativos de protección civil. Es la última barrera de control antes de la transmisión sobre radio analógica o redes APRS.',
      tip: 'Aquí se aprueban las tramas automáticas del monitor sísmico y satelital antes de conmutar el transmisor principal.'
    },
    {
      id: 3,
      title: 'Pilar III: Canales Marítimos',
      color: 'border-indigo-500 text-indigo-400 bg-indigo-950/10',
      desc: 'Supervisión de boyas meteorológicas del catálogo internacional de la NDBC y decodificación de mensajes marítimos NAVTEX emitidos sobre 518 kHz para el cuadrante del Atlántico y Mediterráneo.',
      tip: 'Permite interceptar avisos de temporal racheado, boyas a la deriva y ejercicios militares en aguas territoriales de España.'
    },
    {
      id: 4,
      title: 'Pilar IV: Respuesta y Evacuación',
      color: 'border-red-500 text-red-400 bg-red-950/10',
      desc: 'Gestión de planes de seguridad nacional, alertas acústicas (buzzer militar), y simulaciones de crisis integradas (desbordamiento de ríos, incidentes nucleares).',
      tip: 'Haz clic en "Emisión de Emergencia" en el menú flotante para inyectar una señal analógica prioritaria de advertencia civil.'
    },
    {
      id: 5,
      title: 'Pilar V: Sistema y Configuración',
      color: 'border-amber-500 text-amber-400 bg-amber-950/10',
      desc: 'Control central de la consola. Permite definir el indicativo de llamada (Callsign), la latitud y longitud base para el cálculo de distancias (antena de geodesia), claves del servidor APRS-IS y puertos TCP de modulación de radio.',
      tip: 'Las coordenadas base introducidas aquí son validadas en tiempo real para evitar que se transmitan tramas APRS corruptas.'
    },
    {
      id: 6,
      title: 'Pilar VI: WeeWX (Meteorología)',
      color: 'border-cyan-500 text-cyan-400 bg-cyan-950/10',
      desc: 'Interfaz de telemetría climatológica. Conecta con sensores meteorológicos locales y de estrato físico para formatear reportes periódicos de temperatura, viento, ráfagas, y humedad.',
      tip: 'Permite inyectar datos sintéticos para calibrar el envío de balizas APRS meteorológicas.'
    },
    {
      id: 7,
      title: 'Pilar VII: Direwolf (TNC)',
      color: 'border-pink-500 text-pink-400 bg-pink-950/10',
      desc: 'Consola del software TNC (Terminal Node Controller) militar. Se encarga de la codificación y decodificación en software de audio analógico FM en tramas digitales AFSK a 1200 baudios.',
      tip: 'Puedes visualizar el búfer y forzar ráfagas de calibración de audio para probar el PTT físico.'
    },
    {
      id: 8,
      title: 'Pilar VIII: APRX (Ruteador)',
      color: 'border-violet-500 text-violet-400 bg-violet-950/10',
      desc: 'Administrador de rutas de paquetes APRS de radioaficionados. Define las reglas para repetir (digipeat) paquetes recibidos desde radio y subirlos a la red global de servidores de internet (APRS-IS).',
      tip: 'Es vital para mantener la redundancia si el enlace satelital o de fibra local falla durante el sismo.'
    },
    {
      id: 9,
      title: 'Pilar IX: Adaptación APRS',
      color: 'border-teal-500 text-teal-400 bg-teal-950/10',
      desc: 'Validador técnico de tramas AX.25. Analiza las cabeceras, SSIDs (identificador de estación), e iconos de símbolos de los paquetes de radio recibidos en tiempo real para filtrar tramas mal formadas.',
      tip: 'Utiliza esta herramienta para diagnosticar por qué una estación móvil o de emergencia no está siendo decodificada.'
    },
    {
      id: 10,
      title: 'Pilar X: Pat Winlink (E-mail HF)',
      color: 'border-orange-500 text-orange-400 bg-orange-950/10',
      desc: 'Control del sistema de correo electrónico por ondas de radio de Alta Frecuencia (HF). Permite redactar correos para agencias del gobierno o de salvamento militar y enviarlos sin conexión de internet.',
      tip: 'Ideal para coordinar asistencia interprovincial o con buques mercantes en altamar.'
    }
  ];

  const simulatedAx25Bytes = useMemo(() => {
    if (selectedAlertType === 'sismo') {
      return '7E 82 82 98 9E 90 8A 62 8E 82 96 A4 92 8E 60 03 F0 3D 34 30 32 34 2E 31 32 4E 2F 30 30 33 34 32 2E 32 32 57 23 45 53 50 2D 45 51 3A 20 53 69 73 6D 6F 20 4D 34 2E 32 20 45 73 70 61 6E 61 7E';
    } else if (selectedAlertType === 'incendio') {
      return '7E 82 82 98 9E 90 8A 62 8E 82 96 A4 92 8E 60 03 F0 3D 34 30 32 34 2E 31 32 4E 2F 30 30 33 34 32 2E 32 32 57 23 45 53 50 2D 46 49 52 45 3A 20 49 6E 63 65 6E 64 69 6F 20 41 63 74 69 76 6F 7E';
    } else {
      return '7E 82 82 98 9E 90 8A 62 8E 82 96 A4 92 8E 60 03 F0 3D 34 30 32 34 2E 31 32 4E 2F 30 30 33 34 32 2E 32 32 57 23 45 53 50 2D 57 58 3A 20 54 6F 72 6D 65 6E 74 61 20 56 69 65 6E 74 6F 7E';
    }
  }, [selectedAlertType]);

  const decodedPayloadText = useMemo(() => {
    if (selectedAlertType === 'sismo') {
      return `[EMERGENCIA S.A.T.] EA1URG-10>APRS,WIDE1-1:=4024.12N/00342.22W#SISMO DETECTADO M4.2 - EPICENTRO EN ZONA CENTRAL - ESTADO ALERTA REMER`;
    } else if (selectedAlertType === 'incendio') {
      return `[EMERGENCIA S.A.T.] EA1URG-10>APRS,WIDE1-1:=4024.12N/00342.22W#ALERTA DE INCENDIO ACTIVO - FOCO TERMICO VIIRS 38MW - RIESGO DE PROPAGACION`;
    } else {
      return `[EMERGENCIA S.A.T.] EA1URG-10>APRS,WIDE1-1:=4024.12N/00342.22W#AVISO METEOROLÓGICO EXTREMO - RACHAS DE VIENTO >90KM/H - PRECAUCION DE RUTA`;
    }
  }, [selectedAlertType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      {/* Modal Card container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_0_50px_rgba(16,185,129,0.15)] animate-in fade-in zoom-in duration-300">
        
        {/* HEADER */}
        <div className="bg-slate-950/80 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/45 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen size={20} className="animate-pulse" />
            </div>
            <div>
              <h2 className="font-sans font-black text-slate-100 text-sm tracking-wide uppercase flex items-center gap-1.5">
                Consola S.A.T. <span className="text-emerald-400">Guía de Operaciones</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-mono">REMER Red Civil de Emergencias de España • Manual Interactivo</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center bg-slate-950/40 cursor-pointer transition-all active:scale-95"
            title="Cerrar Guía (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* STEPPER METADATA */}
        <div className="bg-slate-950/40 px-6 py-3 border-b border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">Módulo {currentStep + 1} de {totalSteps}:</span>
            <span className="text-slate-200">
              {currentStep === 0 && 'Introducción y Misión'}
              {currentStep === 1 && 'Navegación de Pilares'}
              {currentStep === 2 && 'Simulación de Transmisión RF (AX.25)'}
              {currentStep === 3 && 'Capas de Radar y Análisis Rural'}
              {currentStep === 4 && 'Validación Geodésica de Antena'}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div 
                key={i} 
                className={`w-4 h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep 
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] w-8' 
                    : i < currentStep 
                      ? 'bg-emerald-800' 
                      : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* BODY SLIDES (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* SLIDE 0: INTRO */}
          {currentStep === 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-7 space-y-4">
                  <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded font-bold uppercase tracking-wider font-mono">
                    Sistema de Alerta Temprana Civil (S.A.T.)
                  </span>
                  <h3 className="font-sans font-black text-slate-100 text-lg leading-snug">
                    Redundancia en Comunicaciones de Emergencia para la Protección del Ciudadano
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    La consola S.A.T. de la red REMER opera como una estación de comando táctico civil. Su objetivo principal es recibir, consolidar y propagar datos críticos en situaciones de sismos, incendios forestales, tormentas climáticas extremas o riesgos radiológicos.
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    A través de enlaces de radiofrecuencia VHF/UHF, telemetría satelital Copernicus y datos meteorológicos automáticos, el S.A.T. garantiza que la información se difunda de forma segura incluso cuando los servicios convencionales de telecomunicación fallan.
                  </p>
                </div>
                
                <div className="md:col-span-5 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />
                  <Radio size={40} className="text-emerald-400 animate-pulse mb-3" />
                  <span className="font-mono text-slate-300 font-bold text-xs uppercase tracking-widest mb-1">EA1URG ESTACIÓN BASE</span>
                  <span className="font-mono text-slate-500 text-[9px] mb-4">REMER ZONA OPERATIVA CENTRAL</span>
                  
                  <div className="w-full space-y-2 border-t border-slate-800/80 pt-4 text-left font-mono text-[9px] text-slate-400">
                    <div className="flex justify-between">
                      <span>Frecuencia APRS:</span>
                      <span className="text-slate-200">144.800 MHz FM</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Protocolo de Datos:</span>
                      <span className="text-slate-200">AX.25 v2.0 AFSK</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cobertura Nominal:</span>
                      <span className="text-slate-200">500 KM (Sondeo Local)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sincronización NTP:</span>
                      <span className="text-emerald-400">✓ Stratum 1 GPSD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Core Features Quick List */}
              <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-950/50 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-sans font-bold text-xs text-slate-200 uppercase">Detección Pasiva</h4>
                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">Sondeo redundante de sismos IGN, Copernicus y boyas del Estado.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-sans font-bold text-xs text-slate-200 uppercase">Radio Enrutamiento</h4>
                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">APRX rutea tramas locales e internet en modo simplex/repetidor.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-rose-950/50 border border-rose-500/20 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-rose-400" />
                  </div>
                  <div>
                    <h4 className="font-sans font-bold text-xs text-slate-200 uppercase">Alerta Inmediata</h4>
                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">Activación inmediata de balizas acústicas y de texto de emergencia.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 1: PILLARS NAV */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1.5">
                <span className="text-[10px] bg-indigo-950/60 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
                  Soportes Estructurales del S.A.T.
                </span>
                <h3 className="font-sans font-black text-slate-100 text-base uppercase">
                  Los 10 Pilares Operativos
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para estructurar la información sin sobrecargar al operador, la consola S.A.T. divide sus componentes tácticos en 10 pilares. Haz clic en cualquiera de los pilares abajo para ver qué hace, su importancia operativa y trucos de control:
                </p>
              </div>

              {/* Pillars Interactive Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[10px]">
                {pillarsList.map((p, index) => {
                  const isSelected = selectedPillarInfo === index;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPillarInfo(index);
                        if (playBuzzerSound) playBuzzerSound(700 + index * 40, 0.05, 'sine');
                      }}
                      className={`p-2.5 border rounded-xl text-center flex flex-col justify-center items-center gap-1 transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-950/20 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/20 font-bold scale-[1.02]' 
                          : 'bg-slate-950/50 border-slate-850 hover:bg-slate-950 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-[11px] font-black">PIILAR {p.id}</span>
                      <span className="truncate w-full text-[8.5px] uppercase font-sans font-semibold">
                        {p.title.split(':')[1].trim()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Detail box for selected pillar */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 text-slate-600 font-mono text-3xl font-black select-none pointer-events-none">
                  #0{pillarsList[selectedPillarInfo].id}
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${pillarsList[selectedPillarInfo].id === 1 ? 'bg-emerald-400' : pillarsList[selectedPillarInfo].id === 4 ? 'bg-red-400' : 'bg-cyan-400'}`} />
                  <h4 className="font-sans font-black text-slate-200 text-xs uppercase tracking-wide">
                    {pillarsList[selectedPillarInfo].title}
                  </h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {pillarsList[selectedPillarInfo].desc}
                </p>
                <div className="bg-slate-900 border-l-2 border-emerald-500 px-3 py-2 rounded text-[10.5px] text-slate-300 font-mono flex items-start gap-1.5">
                  <span className="text-emerald-400 font-black">TRUCO:</span>
                  <span>{pillarsList[selectedPillarInfo].tip}</span>
                </div>

                {/* Direct Tab Relocator Shortcut */}
                {setActiveTab && (
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => {
                        const targetTabs = [
                          'monitor', 'cecop', 'portus', 'alertas', 'configuracion',
                          'weewx', 'direwolf', 'aprx', 'aprs-is', 'winlink'
                        ];
                        const tab = targetTabs[selectedPillarInfo];
                        setActiveTab(tab);
                        onClose();
                        if (playBuzzerSound) playBuzzerSound(1000, 0.1, 'sine');
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 text-[10px] font-sans font-bold rounded-lg border border-slate-700 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Map size={11} /> Ir directo a esta Sección en Consola
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SLIDE 2: AX.25 SIMULATOR */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1.5">
                <span className="text-[10px] bg-rose-950/60 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
                  Sistemas de Transmisión de Emergencia RF
                </span>
                <h3 className="font-sans font-black text-slate-100 text-base uppercase">
                  Tecnología de Radio y Protocolo AX.25
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cuando la infraestructura de datos terrestres colapsa, el S.A.T. utiliza el transceptor VHF principal en 144.800 MHz para emitir balizas informativas. Esto se codifica mediante el protocolo <strong className="text-slate-200">AX.25 v2.0</strong>, emitiendo ráfagas analógicas AFSK de 1200 baudios.
                </p>
              </div>

              {/* Simulator Playground Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                
                {/* Left Controller Panel (5 cols) */}
                <div className="md:col-span-5 bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <span className="text-[10px] text-emerald-400 uppercase font-black block tracking-wider">
                      1. Elegir Tipo de Incidencia
                    </span>
                    <div className="space-y-1.5">
                      {[
                        { id: 'sismo', label: 'Terremoto Crítico (IGN)', icon: <Activity size={13} className="text-red-400" /> },
                        { id: 'incendio', label: 'Incendio Forestal (VIIRS)', icon: <Flame size={13} className="text-orange-400" /> },
                        { id: 'meteo', label: 'Temporal Severo (AEMET)', icon: <AlertTriangle size={13} className="text-yellow-400" /> }
                      ].map((item) => (
                        <button
                          key={item.id}
                          disabled={txState !== 'idle'}
                          onClick={() => {
                            setSelectedAlertType(item.id as any);
                            if (playBuzzerSound) playBuzzerSound(600, 0.05, 'sine');
                          }}
                          className={`w-full py-2 px-3 text-left rounded-lg border text-xs font-sans flex items-center justify-between transition-all ${
                            txState !== 'idle' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            selectedAlertType === item.id 
                              ? 'border-emerald-500 bg-emerald-950/15 text-emerald-300 font-bold' 
                              : 'border-slate-850 bg-slate-950/60 text-slate-400 hover:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {item.icon}
                            <span>{item.label}</span>
                          </div>
                          <span className={`w-2 h-2 rounded-full ${selectedAlertType === item.id ? 'bg-emerald-400 animate-ping' : 'bg-transparent'}`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-850 pt-4">
                    {txState === 'idle' && (
                      <button
                        onClick={startAx25Transmission}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-slate-100 font-sans font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.25)] active:scale-95"
                      >
                        <Radio size={14} className="animate-pulse" /> SIMULAR EMISIÓN AX.25 RF
                      </button>
                    )}

                    {(txState === 'preamble' || txState === 'transmitting') && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-amber-400">
                          <span className="animate-pulse flex items-center gap-1.5">
                            <Radio size={12} className="animate-spin" /> 
                            {txState === 'preamble' ? 'EMITIENDO TXDELAY PREÁMBULO...' : 'TRANSMITIENDO DATOS RF...'}
                          </span>
                          <span>{txProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="bg-gradient-to-r from-red-500 to-amber-500 h-full transition-all duration-200" 
                            style={{ width: `${txProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {txState === 'success' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-sans font-bold justify-center bg-emerald-950/25 py-2 px-3 border border-emerald-500/20 rounded-lg">
                          <Check size={14} /> ¡TRANSMISIÓN COMPLETADA!
                        </div>
                        <button
                          onClick={resetAx25Sim}
                          className="w-full py-1.5 bg-slate-850 hover:bg-slate-700 text-slate-300 text-[10px] font-sans font-bold rounded-lg transition-all cursor-pointer"
                        >
                          Liberar Transmisor (Reset)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Monitor & Logs (7 cols) */}
                <div className="md:col-span-7 bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col justify-between font-mono text-[10px] space-y-3 overflow-hidden">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 text-slate-500">
                      <span className="flex items-center gap-1"><Terminal size={11} /> MONITOR DEL TRANSMISOR TNC-VHF</span>
                      <span className="text-[9px]">144.800 MHz FM</span>
                    </div>
                    <div className="min-h-[70px] space-y-1 text-slate-300 max-h-[100px] overflow-y-auto">
                      {txLog.length === 0 ? (
                        <span className="text-slate-600 block text-center py-4 italic">Operador en modo Escucha (RX). Canal libre de interferencias.</span>
                      ) : (
                        txLog.map((log, i) => (
                          <div key={i} className="leading-tight truncate">
                            <span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-850 pt-2.5">
                    <span className="text-[9.5px] text-slate-500 block uppercase font-bold tracking-wider">
                      Representación Binaria de Trama AX.25 (Hexadecimal):
                    </span>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-[9px] text-emerald-400 break-all leading-normal max-h-[50px] overflow-y-auto select-all">
                      {simulatedAx25Bytes}
                    </div>
                    <div className="flex items-center gap-1.5 text-[8px] text-slate-500">
                      <span className="px-1 bg-red-950 text-red-400 border border-red-500/20 font-bold rounded">0x7E</span> Bandera Inicio/Fin
                      <span className="px-1 bg-blue-950 text-blue-400 border border-blue-500/20 font-bold rounded">0x03</span> Control UI
                      <span className="px-1 bg-amber-950 text-amber-400 border border-amber-500/20 font-bold rounded">0xF0</span> PID No-Capa3
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-900/50 border border-slate-800/80 rounded-lg p-2 text-slate-400 text-[9px]">
                    <span className="text-[8.5px] text-slate-500 uppercase block font-bold">Mensaje Decodificado APRS:</span>
                    <p className="leading-relaxed font-semibold italic text-slate-200">
                      {decodedPayloadText}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 3: RADAR MAP */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-7 space-y-4">
                  <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded font-bold uppercase tracking-wider font-mono">
                    Análisis Cartográfico y Telemetría
                  </span>
                  <h3 className="font-sans font-black text-slate-100 text-lg leading-snug">
                    Tácticas de Mapas Base para Protección Rural de Incendios
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    El radar de la Consola S.A.T. es una herramienta de proyección táctica de alta fidelidad. Permite localizar eventos con vectores dinámicos (dirección de vientos, propagación de sismos y rutas aéreas).
                  </p>
                  <div className="space-y-2.5">
                    <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl space-y-2 text-xs">
                      <h4 className="font-sans font-bold text-slate-300 uppercase text-[10px] flex items-center gap-1.5">
                        <Layers size={12} className="text-emerald-400" /> Selección de Capa Terrestre
                      </h4>
                      <p className="text-slate-400 text-[10.5px]">
                        Utiliza el nuevo selector integrado de <strong>Estilo de Mapa Base</strong> para alternar entre:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-slate-400 text-[10px] ml-1.5">
                        <li><strong className="text-slate-200">Mapa Táctico:</strong> Un fondo negro limpio de alto contraste, ideal para operaciones nocturnas de radio y enfoque absoluto.</li>
                        <li><strong className="text-slate-200">Mapa Callejero:</strong> Agrega vías principales, núcleos urbanos y ríos de España para planificar carreteras de escape.</li>
                        <li><strong className="text-slate-200">Mapa Satélite:</strong> Proyecta capas de bosques, cortafuegos y relieve topográfico. <strong>Crítico para evaluar incendios forestales activos en áreas de densa vegetación rural.</strong></li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div className="md:col-span-5 space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3.5 relative overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                      <span className="font-mono text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Map size={13} className="text-emerald-400" /> Capas de Telemetría
                      </span>
                      <span className="text-[9px] bg-slate-900 border border-slate-800 text-emerald-400 px-1 py-0.5 rounded font-mono font-bold">LIVE</span>
                    </div>

                    <div className="space-y-2 font-sans text-[10px] text-slate-300">
                      <div className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-850">
                        <span className="flex items-center gap-2">
                          <Activity size={13} className="text-red-400 animate-pulse" /> Sismos (IGN)
                        </span>
                        <span className="text-slate-500 text-[9px]">Sondeo 5m</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-850">
                        <span className="flex items-center gap-2">
                          <Flame size={13} className="text-orange-400 animate-bounce" /> Incendios Forestales
                        </span>
                        <span className="text-slate-500 text-[9px]">Focos Térmicos NASA</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-850">
                        <span className="flex items-center gap-2">
                          <Ship size={13} className="text-blue-400 animate-pulse" /> Boyas Portus (AIS)
                        </span>
                        <span className="text-slate-500 text-[9px]">Flota Marítima</span>
                      </div>
                    </div>

                    <div className="bg-emerald-950/15 border border-emerald-500/20 rounded-xl p-3 text-[9.5px] leading-relaxed text-emerald-400">
                      📌 <strong>¿Sabías que?</strong> Al hacer clic en un foco de incendio en el mapa se despliega un vector de propagación estimativo que simula la dirección y velocidad de propagación impulsada por vientos de superficie locales.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 4: COORDINATES VALIDATOR */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1.5">
                <span className="text-[10px] bg-amber-950/60 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono">
                  Geodesia de Estación Base y Enlace
                </span>
                <h3 className="font-sans font-black text-slate-100 text-base uppercase">
                  Validación de Coordenadas de Respaldo en Tiempo Real
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para que las balizas APRS transmitan tu posición correcta en la red civil de radio, tus coordenadas base deben ser geográficamente impecables. El Pilar V (Configuración) valida las entradas en vivo para evitar transmitir coordenadas aberrantes.
                </p>
              </div>

              {/* Interactive Sandbox Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                
                {/* Lat/Lon validation Sandbox Form (6 cols) */}
                <div className="md:col-span-6 bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-4">
                  <span className="text-[10px] text-amber-400 uppercase font-black block tracking-wider flex items-center gap-1">
                    <Settings size={12} /> Probador de Entradas Geodésicas
                  </span>

                  <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Latitud:</span>
                        {isLatValid ? (
                          <span className="text-emerald-400 font-bold">Válido</span>
                        ) : (
                          <span className="text-red-500 font-bold">Inválido</span>
                        )}
                      </div>
                      <input 
                        type="text"
                        value={testLat}
                        onChange={(e) => {
                          setTestLat(e.target.value);
                          if (playBuzzerSound) playBuzzerSound(800, 0.03, 'sine');
                        }}
                        placeholder="Ej. 40.4167"
                        className={`w-full bg-slate-950 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none transition-all border ${
                          isLatValid ? 'border-slate-850 focus:border-emerald-500/30' : 'border-red-500/70 ring-1 ring-red-500/20'
                        }`}
                      />
                      <span className="text-[8px] text-slate-500 block">Rango [-90 a 90]</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Longitud:</span>
                        {isLonValid ? (
                          <span className="text-emerald-400 font-bold">Válido</span>
                        ) : (
                          <span className="text-red-500 font-bold">Inválido</span>
                        )}
                      </div>
                      <input 
                        type="text"
                        value={testLon}
                        onChange={(e) => {
                          setTestLon(e.target.value);
                          if (playBuzzerSound) playBuzzerSound(800, 0.03, 'sine');
                        }}
                        placeholder="Ej. -3.7037"
                        className={`w-full bg-slate-950 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none transition-all border ${
                          isLonValid ? 'border-slate-850 focus:border-emerald-500/30' : 'border-red-500/70 ring-1 ring-red-500/20'
                        }`}
                      />
                      <span className="text-[8px] text-slate-500 block">Rango [-180 a 180]</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-3 text-[10px] text-slate-400 font-mono space-y-1">
                    <span className="text-slate-500 uppercase block font-bold text-[8.5px]">Cálculo Técnico Geodésico:</span>
                    <div>Estado Global: {isLatValid && isLonValid ? (
                      <span className="text-emerald-400 font-bold">HABILITADO PARA GUARDAR</span>
                    ) : (
                      <span className="text-red-400 font-bold">BLOQUEADO POR SEGURIDAD</span>
                    )}</div>
                    <div>Proyección UTM Estimada: {isLatValid && isLonValid ? (
                      <span className="text-slate-200">Huso 30N - X: {Math.round(440300 + Number(testLon)*8000)}m, Y: {Math.round(4474500 + Number(testLat)*5000)}m</span>
                    ) : (
                      <span className="text-slate-600">Error de sintaxis o rango</span>
                    )}</div>
                  </div>
                </div>

                {/* Right Summary Block (6 cols) */}
                <div className="md:col-span-6 bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col justify-between font-sans text-xs space-y-3">
                  <div className="space-y-2">
                    <h4 className="font-sans font-black text-slate-200 text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-400" /> Protocolo de Salvaguarda
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Si introduces un valor de coordenadas que excede los límites físicos terrestres, el sistema del Configurator bloqueará el botón de guardado e iluminará las celdas en rojo para evitar un fallo catastrófico en la modulación del módem.
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      El servidor GPSD del NUC está configurado de forma autónoma, pero el fallback asegura que tu estación base mantenga cobertura si las antenas GPS terrestres quedan sepultadas o destruidas en la zona de sismo.
                    </p>
                  </div>

                  <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 font-mono text-[9px] text-amber-400 flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500 animate-pulse" />
                    <div>
                      <span className="font-bold block uppercase">ATENCIÓN EN PILAR V:</span>
                      Al modificar la posición, la distancia matemática a todos los terremotos del IGN y barcos Portus se recalcula inmediatamente en el radar principal para redefinir el radio de alerta útil.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* FOOTER NAV CONTROLS */}
        <div className="bg-slate-950/80 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 hover:text-white font-sans font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed select-none active:scale-95"
          >
            <ChevronLeft size={14} /> Atrás
          </button>

          <span className="text-[10px] font-mono text-slate-500">
            Navega usando los botones o <kbd className="bg-slate-900 px-1 py-0.5 rounded border border-slate-800">←</kbd> <kbd className="bg-slate-900 px-1 py-0.5 rounded border border-slate-800">→</kbd> del teclado
          </span>

          {currentStep < totalSteps - 1 ? (
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-sans font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.2)] active:scale-95"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={() => {
                if (playBuzzerSound) playBuzzerSound(1046, 0.15, 'sine');
                onClose();
              }}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95"
            >
              <Check size={14} /> Entendido, cerrar guía
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
