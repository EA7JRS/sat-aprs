import { useState } from 'react';
import { Terminal, Download, FileCode, CheckCircle, Info, BookOpen } from 'lucide-react';
import AprsValidator from '../radio/AprsValidator';

interface ScriptExporterProps {
  onInjectRaw?: (payload: string) => Promise<boolean>;
}

export default function ScriptExporter({ onInjectRaw }: ScriptExporterProps) {
  const [activeTab, setActiveTab] = useState<'script' | 'debian' | 'direwolf' | 'weewx' | 'aprx' | 'eco' | 'validate'>('script');
  const [copied, setCopied] = useState(false);

  // Raw Python script to display so that the user can copy/paste easily from inside the applet UI!
  const pythonScriptRaw = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
          APRS S.A.T. (Sistema de Alerta Temprana) - REMER / IARU
          Agente de Procesamiento de Eventos y Telemetría Crítica
================================================================================
"""
import os
import math
import time
import socket
import json
import ssl
from datetime import datetime, timezone
import urllib.request

CALLSIGN = "EA1URG-13"          # Indicativo APRS con SSID de telemetria/WX
APRS_PASSCODE = "18023"          # Codigo de autenticacion para APRS-IS
FILTER_RADIUS_KM = 200.0         # Radio de cobertura critica para sismos
OWM_API_KEY = ""                 # API Key de OpenWeatherMap (Opcional)

# ... [Para ver el script completo de 400 líneas, pulsa exportar archivo aprs_sat.py] ...
`;

  const copyToClipboard = () => {
    // Re-fetch the full script file or use a text snippet. Since we created /aprs_sat.py, 
    // we can specify the exact python file location and inform them that it is persisted in the root file!
    navigator.clipboard.writeText(`python3 /workspace/aprs_sat.py`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-slate-100 shadow-xl" id="script-exporter-component">
      <div className="flex items-center justify-between border-b border-slate-900 pb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="text-zinc-300 stroke-[1.5]" size={18} />
          <h2 className="font-sans font-bold text-sm tracking-wider uppercase text-slate-100">Guía de Ingeniería e Integración Estación Real</h2>
        </div>
        <div className="flex flex-wrap bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono gap-0.5">
          <button
            onClick={() => setActiveTab('script')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'script' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            aprs_sat.py
          </button>
          <button
            onClick={() => setActiveTab('debian')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'debian' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Paquetes Lnx
          </button>
          <button
            onClick={() => setActiveTab('direwolf')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'direwolf' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            direwolf (TNC)
          </button>
          <button
            onClick={() => setActiveTab('weewx')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'weewx' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            WeeWX Engine
          </button>
          <button
            onClick={() => setActiveTab('aprx')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'aprx' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            aprx.conf
          </button>
          <button
            onClick={() => setActiveTab('eco')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'eco' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🔋 Modo Eco (SAT)
          </button>
          <button
            onClick={() => setActiveTab('validate')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${activeTab === 'validate' ? 'bg-slate-950 text-emerald-400 font-bold border border-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🛡️ Validador APRS
          </button>
        </div>
      </div>

      <div className="text-xs font-mono">
        {/* TAB 1: PYTHON SCRIPT SUMMARY */}
        {activeTab === 'script' && (
          <div className="space-y-3">
            <div className="p-3.5 bg-slate-900/60 border border-slate-900 rounded-xl leading-relaxed text-slate-300 font-sans">
              <span className="font-mono text-emerald-400 font-black text-xs uppercase block mb-1">CÓDIGO FUENTE DE PRODUCCIÓN PERSISTIDO</span>
              <p className="text-[11px]">
                Hemos creado para ti el archivo definitivo autónomo <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">/aprs_sat.py</code> en el directorio raíz de este proyecto. Este script está diseñado para ejecutarse 24/7 en un nodo de radioaficionado (Ej: Raspberry Pi, Orange Pi, Servidores de Emergencia).
              </p>
            </div>

            <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-500 font-bold">Resumen de Importación de aprs_sat.py</span>
                <button
                  onClick={copyToClipboard}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded font-sans text-[10px] flex items-center gap-1.5 transition-all cursor-pointer"
                  id="btn-copy-py-cmd"
                >
                  <FileCode size={11} />
                  {copied ? '¡Copiado Comando!' : 'Comando Ejecución'}
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-[10.5px] rounded text-emerald-300 border border-slate-900 overflow-x-auto select-all max-h-[160px] leading-loose">
                {pythonScriptRaw}
              </pre>
              <div className="text-[9px] text-slate-500 mt-2 italic leading-relaxed">
                * Para ejecutar este script localmente en tu TNC usa el comando: <code className="text-emerald-500 bg-black px-1.5 py-0.5 rounded">python3 aprs_sat.py</code>. El script se conectará automáticamente a los sockets de gpsd (puerto 2947) y ntpsec para transmitir el WX a Direwolf.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LINUX DEBIAN SYSTEM DEPENDENCIES */}
        {activeTab === 'debian' && (
          <div className="space-y-3 font-sans text-slate-300">
            <h3 className="font-mono text-[11px] font-black uppercase text-emerald-400">Instalación del Ecosistema en el S.O.</h3>
            <p className="text-[11px] leading-relaxed">
              Para desplegar con éxito este nodo crítico de radio civil en Debian/Ubuntu/Raspberry Pi, ejecuta la secuencia de comandos para instalar el módem de software (Direwolf), el Igated/Digipeater (aprx), el daemon GNSS (gpsd), y la sincronización horaria PPS (ntpsec):
            </p>

            <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg font-mono text-[11px] text-emerald-400 space-y-1 select-all">
              <div># 1. Actualizar el gestor de paquetes de Debian</div>
              <div className="text-slate-100">sudo apt update && sudo apt install -y gpsd gpsd-clients ntpsec direwolf aprx git python3-pip</div>
              <div className="text-slate-500 mt-2 block"># 2. Configurar arranque automático de los servicios</div>
              <div className="text-slate-100">sudo systemctl enable gpsd ntpsec aprx</div>
              <div className="text-slate-100">sudo systemctl start gpsd ntpsec aprx</div>
            </div>

            <div className="bg-slate-900 border border-slate-900 p-3 rounded-lg text-[10px] space-y-2 font-mono">
              <span className="text-[10px] text-slate-400 uppercase font-black block">Configuración Crítica de gpsd (/etc/default/gpsd):</span>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Asigna el descriptor de tu receptor USB GNSS/GPS ublox en el archivo de configuración de gpsd de la siguiente manera para que el socket en el puerto 2947 se active en bucle:
              </p>
              <pre className="p-2 bg-slate-950 text-yellow-300 rounded border border-slate-950 text-[10.5px]">
                DEVICES="/dev/ttyUSB0"<br />
                GPSD_OPTIONS="-F /var/run/gpsd.sock -G"<br />
                USBAUTO="true"
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: DIREWOLF CONFIGURATION AND SOURCE COMPILATION */}
        {activeTab === 'direwolf' && (
          <div className="space-y-4 font-sans text-slate-300">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-black uppercase text-emerald-400">Compilación y Configuración de Direwolf Engine</h3>
              <span className="text-[10px] bg-emerald-950/50 border border-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded uppercase font-bold">
                Núcleo de Radio AX.25
              </span>
            </div>

            <div className="p-3 bg-emerald-950/10 border border-emerald-500/15 rounded-xl leading-relaxed text-slate-300 text-[11px]">
              <p>
                <strong>Direwolf</strong> (Decoded Information Receivers Extremely Wired on Lunchtime Infrared) es el módem de software y TNC (Terminal Node Controller) por excelencia en entornos Debian. Convierte las señales analógicas de audio VHF en tramas AX.25 puras a 1200 baudios, sirviendo como el puente crítico de RF del S.A.T.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-emerald-400 font-bold uppercase font-mono block">1. Compilación Recomendada en Debian:</span>
              <p className="text-[11px] leading-relaxed">
                Para obtener soporte nativo GPSD y las últimas optimizaciones de filtrado digital, es preferible compilar Direwolf desde el repositorio oficial de GitHub de WB2OSZ en lugar del paquete precompilado de apt:
              </p>
              <pre className="p-3 bg-slate-950 text-[10px] rounded text-emerald-300 border border-slate-900 overflow-x-auto select-all leading-normal font-mono">
                # Instalar dependencias de compilación en Debian<br />
                sudo apt install -y build-essential cmake libasound2-dev libudev-dev libgps-dev git<br />
                <br />
                # Clonar repositorio oficial de Direwolf<br />
                git clone https://github.com/wb2osz/direwolf.git && cd direwolf<br />
                <br />
                # Configurar y compilar<br />
                mkdir build && cd build<br />
                cmake ..<br />
                make -j$(nproc)<br />
                sudo make install<br />
                make install-conf
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-400 font-bold uppercase font-mono block">2. Configuración Recomendada de /etc/direwolf.conf para S.A.T.:</span>
                <span className="text-[9px] text-slate-500 italic font-mono">KISS TCP Port 8001</span>
              </div>
              <pre className="p-3 bg-slate-950 text-[10px] rounded text-yellow-300 border border-slate-900 overflow-x-auto select-all leading-loose font-mono">
                # =====================================================================<br />
                # ARCHIVO DE CONFIGURACIÓN DIREWOLF S.A.T. EMERGENCIAS (VHF 144.800 MHz)<br />
                # =====================================================================<br />
                <br />
                # Dispositivo de Audio (USB Soundcard index o subdevice en ALSA)<br />
                ADEVICE plughw:1,0<br />
                <br />
                # Canal y Velocidad del módem AFSK estándar APRS de radioafición<br />
                CHANNEL 0<br />
                MYCALL EA1URG-13<br />
                MODEM 1200<br />
                <br />
                # Control PTT del transceptor (Usa línea RTS de chip USB-Serial o GPIO en Pi)<br />
                PTT /dev/ttyUSB0 RTS<br />
                <br />
                # Sincronización GPS directa mediante puerto gpsd local en Debian<br />
                GPSD localhost<br />
                <br />
                # Servidores de Sockets de Red de Direwolf<br />
                AGWPORT 8000<br />
                KISSPORT 8001<br />
                <br />
                # Balizas periódicas directas desde Direwolf sobre RF local<br />
                CBEACON dest=APDIW1 info="S.A.T. NODO DE ALERTA VHF [Debian 13 Core]"
              </pre>
            </div>
          </div>
        )}

        {/* TAB 4: WEEWX CO-ENGINE INTEGRATION */}
        {activeTab === 'weewx' && (
          <div className="space-y-4 font-sans text-slate-300">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-black uppercase text-amber-400">WeeWX Weather Engine - Estación Meteorológica Profesional</h3>
              <span className="text-[10px] bg-amber-950/50 border border-amber-500/20 text-amber-300 font-mono px-2 py-0.5 rounded uppercase font-bold">
                Motor Meteorológico Secundario
              </span>
            </div>

            <div className="p-3 bg-amber-950/10 border border-amber-500/15 rounded-xl leading-relaxed text-slate-300 text-[11px]">
              <p>
                <strong>WeeWX</strong> es el orquestador principal para la recopilación, almacenamiento e informes meteorológicos de este S.A.T. Escrito en Python 3, interactúa con estaciones de hardware reales (Davis Vantage Pro2, Fine Offset, etc.) o simuladores tácticos, guardando registros consistentes en su base de datos SQLite y orquestando las Balizas WX sobre radio packet.
              </p>
              <p className="mt-1.5 text-xs">
                🌐 Repositorio oficial de desarrollo: <a href="https://github.com/weewx/weewx" target="_blank" className="text-amber-400 underline font-mono">https://github.com/weewx/weewx</a>
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-amber-400 font-bold uppercase font-mono block">1. Instalación de WeeWX V5+ en un Entorno Debian:</span>
              <p className="text-[11px] leading-relaxed">
                Recomendamos instalar WeeWX dentro de un entorno virtualizado de Python o mediante su repositorio oficial git para entornos limpios de Debian 13:
              </p>
              <pre className="p-3 bg-slate-950 text-[10px] rounded text-yellow-300 border border-slate-900 overflow-x-auto select-all leading-normal font-mono">
                # Clonar el código fuente de WeeWX directamente desde GitHub<br />
                git clone https://github.com/weewx/weewx.git /opt/weewx-src<br />
                cd /opt/weewx-src<br />
                <br />
                # Crear un Entorno Virtual de Python y activar<br />
                python3 -m venv /opt/weewx-venv<br />
                source /opt/weewx-venv/bin/activate<br />
                <br />
                # Instalar componentes requeridos<br />
                pip install --upgrade pip setuptools wheel<br />
                pip install .<br />
                <br />
                # Ejecutar el asistente de configuración guiada de WeeWX<br />
                weewxd --config=/etc/weewx/weewx.conf --bootstrap
              </pre>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-emerald-400 font-bold uppercase font-mono block">2. Configuración del Puente APRS CWOP en weewx.conf:</span>
              <p className="text-[11px] leading-relaxed">
                Para que WeeWX inyecte las balizas climatológicas en formato APRS directo hacia Direwolf (KISS TCP Port 8001), use el driver CWOP integrado:
              </p>
              <pre className="p-3 bg-slate-950 text-[10px] rounded text-emerald-300 border border-slate-900 overflow-x-auto select-all leading-loose font-mono">
                [StdRESTful]<br />
                # Habilita el servicio CWOP (Citizen Weather Observer Program / APRS)<br />
                [[CWOP]]<br />
                &nbsp;&nbsp;&nbsp;&nbsp;enable = true<br />
                &nbsp;&nbsp;&nbsp;&nbsp;station = EA1URG-13<br />
                &nbsp;&nbsp;&nbsp;&nbsp;passcode = 18023<br />
                &nbsp;&nbsp;&nbsp;&nbsp;server = localhost:8001  # Direcciona al puerto TNC KISS de Direwolf!<br />
                &nbsp;&nbsp;&nbsp;&nbsp;post_interval = 600      # Envío automático de telemetría climatológica cada 10 mins<br />
                &nbsp;&nbsp;&nbsp;&nbsp;log_success = true
              </pre>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-blue-400 font-bold uppercase font-mono block">3. Administración del servicio WeeWX del S.A.T.:</span>
              <p className="text-[11px] leading-relaxed">
                Habilite WeeWX como servicio nativo de systemd para garantizar arranque continuo e informes en tiempo real tras caídas del fluido eléctrico:
              </p>
              <pre className="p-3 bg-slate-950 text-[10px] rounded text-blue-300 border border-slate-900 overflow-x-auto select-all leading-normal font-mono">
                # Copiar archivo de unidad systemd de WeeWX<br />
                sudo cp /opt/weewx-src/util/systemd/weewx.service /etc/systemd/system/<br />
                <br />
                # Recargar systemd y arrancar servicio<br />
                sudo systemctl daemon-reload<br />
                sudo systemctl enable weewx.service<br />
                sudo systemctl start weewx.service<br />
                <br />
                # Consultar registros del servicio en tiempo real<br />
                sudo journalctl -u weewx.service -f
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: APRX CONF TEMPLATES */}
        {activeTab === 'aprx' && (
          <div className="space-y-3 font-sans text-slate-300">
            <h3 className="font-mono text-[11px] font-black uppercase text-emerald-400">Integración de pasarela de Packet Radio (/etc/aprx.conf)</h3>
            <p className="text-[11px] leading-relaxed">
              El demonio <code className="text-amber-400">aprx</code> actúa como IGate y Digipeater. Puede recibir las inyecciones de puertos de <code className="text-emerald-400">aprs_sat.py</code> y enviarlas tanto a servidores mundiales APRS-IS como a la portadora de radio VHF local de 144.800 MHz.
            </p>

            <div className="bg-slate-900 border border-slate-900 p-3 rounded-lg space-y-1.5 font-mono">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Sección de Interfaz KISS TCP en /etc/aprx.conf:</span>
              <p className="text-[10px] text-slate-500 leading-normal">
                Conecta aprx con el KISS TCP puerto 8001 que sirve Direwolf (el software TNC) para irradiar telemetry en RF:
              </p>
              <pre className="p-2.5 bg-slate-950 text-blue-300 rounded border border-slate-950 overflow-x-auto text-[10px] leading-loose select-all">
                mycall  EA1URG-13<br />
                myloc   lat 4025.00N lon 00342.00W<br />
                <br />
                &lt;aprsis&gt;<br />
                &nbsp;&nbsp;server   euro.aprs2.net   14580<br />
                &nbsp;&nbsp;filter   "m/200"<br />
                &lt;/aprsis&gt;<br />
                <br />
                &lt;interface&gt;<br />
                &nbsp;&nbsp;tcp-device   127.0.0.1   8001   KISS<br />
                &lt;/interface&gt;
              </pre>
            </div>

            <div className="p-2 bg-slate-900 border border-slate-900 rounded-lg text-[9px] text-slate-400 flex items-center gap-2 font-mono">
              <Info size={16} className="text-emerald-400 shrink-0" />
              <span>Con esta pasarela, los boletines de sismos detectados por el IGN dentro del radio crítico de 200 km serán digirepetidos automáticamente en RF local.</span>
            </div>
          </div>
        )}

        {/* TAB 5: ECO MODE BANDWIDTH & POWER OPTIMIZATION GUIDE */}
        {activeTab === 'eco' && (
          <div className="space-y-4 font-sans text-slate-300">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-black uppercase text-emerald-400">🔋 Guía de Optimización Energética y de Ancho de Banda (Modo Eco)</h3>
              <span className="text-[10px] bg-emerald-950/50 border border-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded uppercase font-bold">
                Low Power & Low Bandwidth
              </span>
            </div>

            <div className="p-3 bg-emerald-950/10 border border-emerald-500/15 rounded-xl leading-relaxed text-slate-300 text-[11px]">
              <p>
                En situaciones de colapso de red de distribución eléctrica o aislamiento táctico (operando bajo batería o energía solar), la estación debe conservar energía y optimizar enlaces de datos limitados (ej. telefonía satelital de emergencia, canales de datos de baja velocidad o radioenlaces APRS).
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-emerald-400 font-bold uppercase font-mono block">1. Comportamiento Inteligente en Modo Eco (S.A.T. Core):</span>
              <p className="text-[11px] leading-relaxed">
                Al activar el <strong>Modo Eco</strong> desde el panel de control táctico o detectar falta de fluido de red, el sistema redefine automáticamente sus parámetros operativos de software:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                <li>
                  <strong className="text-emerald-400">Sondeo de Amenazas Optimizado</strong>: La frecuencia del <code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">ThreatPollingEngine</code> se ralentiza de 30 a 120 segundos para evitar colapsar la conexión IP.
                </li>
                <li>
                  <strong className="text-emerald-400">Ahorro de API NOAA Space Weather</strong>: La vigencia del caché del viento solar (RTSW) y propagación HF del servidor aumenta de 1 a 5 minutos (<code className="text-yellow-400">300,000 ms</code>), evitando consultas redundantes a NOAA.
                </li>
                <li>
                  <strong className="text-emerald-400">Interfaz Visual Liviana</strong>: Se detienen las animaciones fluidas y animaciones 3D/pulse para conservar ciclos de CPU y prolongar la batería de la pantalla de visualización.
                </li>
              </ul>
            </div>

            <div className="space-y-2 text-[11px]">
              <span className="text-[10px] text-amber-400 font-bold uppercase font-mono block">2. Comandos Operativos de Debian para Ahorro en Hardware (NUC/Raspberry Pi):</span>
              <p className="leading-relaxed">
                Ejecuta estas secuencias para forzar la reducción de consumo eléctrico directamente en la terminal de tu estación real de campo:
              </p>
              <pre className="p-3 bg-slate-950 text-[10px] rounded text-yellow-300 border border-slate-900 overflow-x-auto select-all leading-normal font-mono">
                # Reducir frecuencia de la CPU a modo Conservación de Energía<br />
                sudo apt install -y cpufrequtils<br />
                sudo cpufreq-set -g powersave<br />
                <br />
                # Desactivar salida de vídeo HDMI en Raspberry Pi para ahorrar corriente<br />
                vcgencmd display_power 0<br />
                <br />
                # Detener servicios no esenciales del sistema operativo<br />
                sudo systemctl stop cups bluetooth wpa_supplicant
              </pre>
            </div>
          </div>
        )}

        {/* TAB 4: APRS VALIDATOR WITH OPTIONAL INJECTION */}
        {activeTab === 'validate' && (
          <AprsValidator onInjectRaw={onInjectRaw} />
        )}
      </div>
    </div>
  );
}
