# S.A.T. - APRS
### Servicio de Alerta Temprana por APRS 

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescript.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

El **S.A.T. APRS Dashboard** es una estación de trabajo digital unificada para operadores de radioafición (IARU/ITU) y redes de telecomunicaciones de emergencia en entornos de catástrofe y misiones críticas. Emula y visualiza el comportamiento de componentes de software de radio esenciales, permitiendo el monitoreo interactivo de señales de RF, la calibración de hardware de audio en tiempo real y la gestión operativa ante catástrofes.

S.A.T.- APRS es un Servicio de Alerta Tempara por radio APRS, es una verdadera estación APRS y herramienta de gestion para grupos voluntariados y gubernamentales dedicados al área de emeregencias.

Se trata de un centro avanzado robusto y eficiente completamente autónomo que integra geolocalización y sincronización horaria vía satélite en tiempo real, una estación meteorológica, una pasarela SMS, sistema de correo electronico Winlink y receptores SDR y/o físicos para AIS, NAVTEX y SafeNet II de Inmarsat.

Además, es una herramienta para grupos de emergencias ante situaciones severas y criticas para la gestión y coordinación supervisada que se encarga de proporcionar mensajes de difusión tipo bolentines informativos y mensajes de alertas integrales sobre condiciones adversas actuales para su información y difusión via radio. 

S.A.T.-APRS como estación de radio desatendida operando las 24/7, permite generar paquetes de datos APRS con un campo de información definido por el usuario y transmitirlos a intervalos específicos. Esto posibilita la transmisión de balizas, objetos, datos meteorológicos y telemetría, así como la difusión inteligente de boletines informativos o mensajes de alerta.

S.A.T.-APRS tiene la capacidad y objetivo de transmitir alertas e información posterior ante todo tipo de evento, peligros u otros riesgos para salvaguardar la salud y seguridad pública.

S.A.T.-APRS es un producto creado y desarrollado por EA7JRS, el autor exime toda responsabilidad debida a un uso y configuración incorrectos por parte del operador de radio como usuario final.

---

## 🛰️ Módulos de la Estación de Trabajo

### 1. Terminal Direwolf
Un TNC (Terminal Node Controller) por software de alto rendimiento para decodificar señales AX.25 sobre AFSK y GMSK:
- **Osciloscopio**: Renderiza visualizaciones dinámicas de señales analógicas analizadas por el demodulador.
- **Analizador de Espectro (FFT FFT-DSP)**: Permite observar en tiempo real la firma de frecuencia y las bandas de paso para Bell 202 (VHF), Bell 103 (HF) y GMSK.
- **Control de Ganancia Automática (AGC)**: Estabiliza los trazos de entrada de audio para evitar la distorsión del osciloscopio y la saturación de los decodificadores analógicos de banda base.
- **Detector Automático de Baudios DSP**: Analiza los cruces por cero e intervalos espectrales de la portadora para identificar automáticamente si la transmisión entrante es de **300 bps (HF)**, **1200 bps (VHF)** o **9600 bps (UHF)**. Permite el autotune de sincronización rápida mediante un solo clic.

### 2. Pasarela Aprx
Emulación completa del software de enrutamiento IGate y Digipeater APRS de uso estándar en redes terrestres:
- **Visor Topológico de Enrutamiento**: Visualiza los saltos de paquetes (`WIDE1-1`, `WIDE2-1`, etc.).
- **Inspección de Tramas**: Diagnóstico y trazabilidad del flujo de tramas AX.25 de telemetría a APRS-IS.

### 3. Cliente Pat Winlink
Gestión y transferencia de correo electrónico y reportes de incidentes por radio de alta frecuencia (HF/VHF) usando el protocolo de sesión ARQ AX.25:
- **Buzón Operativo**: Bandejas de entrada, salida, borradores y enviados.
- **Plantillas de Emergencia**: Creación rápida de partes de incidencias conformes a estándares de protección civil.

### 4. Consola Meteorológica WeeWX y servicios meteorológicos
Recopilación y retransmisión de datos meteorológicos locales mediante telemetría APRS:
- **WeeWX Local**: Monitoreo de presión barométrica, humedad, radiación solar e índice UV.
- **Portal AEMET OpenData**: Integración y descarga de avisos meteorológicos nacionales reales.

### 5. Centro de Coordinación Operativa (CECOP)
Consola táctica unificada para la gestión de emergencias:
- **Incendios Forestales**: Monitoreo de perímetros, velocidad de avance, recursos aéreos y terrestres desplegados.
- **Indicadores Sísmicos IGN**: Captura de actividad tectónica reciente mediante micro-sismógrafos.
- **Radioavisos Marítimos (NAVAREA)**: Descifrado y reporte de avisos a navegantes, boletines hidrográficos (IHM Armada) y rescates activos de SASEMAR.

---

## 🛠️ Especificaciones Técnicas y Parámetros del Aire

| Parámetro | AFSK 300 bps (HF) | AFSK 1200 bps (VHF) | GMSK 9600 bps (UHF) |
| :--- | :--- | :--- | :--- |
| **Estándar Frecuencia** | `10.1473 MHz USB` | `144.800 MHz FM-N` | `432.500 MHz FM-W` |
| **Estándar Módem** | Bell 103 (SSB) | Bell 202 (FM) | GMSK (Direct Varactor) |
| **Tonos (Mark/Space)**| 2020 Hz / 2220 Hz | 1200 Hz / 2200 Hz | Banda Base Directa |
| **Ancho de Banda** | 500 Hz | 12.5 kHz | 25.0 kHz |
| **Sincronización** | PLL Phase Lock | PLL Phase Lock | Bit Sync Recovery |

---

## 🚀 Arquitectura de Desarrollo

Este proyecto está construido sobre un stack moderno y eficiente diseñado para baja latencia e interfaces tácticas de alta fidelidad:
- **Framework Principal**: React 18+ con TypeScript.
- **Sistema de Compilación**: Vite (HMR desactivado en la plataforma de desarrollo interactivo).
- **Estilos Visuales**: Tailwind CSS integrado mediante arquitectura de temas de alto contraste.
- **Animaciones e Interacciones**: Motion (`motion/react`) para efectos fluidos y de transición CRT-phosphor.
- **Detección de Coordenadas**: Geolocalización integrada en navegador con visualizadores de cartografía locales hiperprecisos.

## 💾 Instalación y Actualización en Debian 13 (Trixie)

Este sistema avanzado está diseñado para operar de manera autónoma las 24/7 en servidores o dispositivos integrados que ejecuten **Debian 13 (Trixie)** o **Raspberry Pi OS (Trixie)**.

### 📋 Requisitos del Sistema
* **Sistema Operativo:** Debian 13.x o Raspberry Pi OS (Trixie) de 64 bits.
* **Memoria RAM:** Mínimo 4 GB (Se recomiendan 8 GB o más para un rendimiento óptimo).
* **Conectividad:** Conexión permanente a Internet (Fibra, LTE/5G o Satélite) para la descarga automática de boletines oficiales, alertas del IGN/AEMET e inyección/extracción de datos APRS-IS.
* **Hardware de Radio (Opcional):** TNC de audio (SDR, tarjeta de sonido externa, interfaces EasyDigi o transceptores con módem integrado).

---

## 🛠️ Guía de Instalación desde Cero

La arquitectura se divide en dos componentes independientes que operan en paralelo:
1. **Consola Web Táctica (React + Express):** El panel de control y visor táctil accesible en el puerto `3000`.
2. **Agente S.A.T. Sentinel (`aprs_sat.py`):** Un demonio/script en Python que se ejecuta en segundo plano recopilando sensores físicos (GPSD, WX) y APIs de emergencia para emitir las balizas y boletines vía RF (APRS) y APRS-IS.

### 📦 Fase 0: Preparación del Sistema Operativo
Ejecute los siguientes comandos en su terminal para actualizar la base del sistema e instalar las herramientas de compilación, red y dependencias de radioaficionados:

```bash
# 0.1- Actualizar repositorios y el núcleo de Debian
sudo apt update && sudo apt upgrade -y
sudo apt full-upgrade -y

# 0.2- Instalar utilidades esenciales de compilación, python y redes
sudo apt install -y git build-essential net-tools python3 python3-pip python3-venv

# 0.3- Herramientas para sincronización horaria de precisión y posicionamiento (Receptor GPS)
sudo apt install -y gpsd gpsd-clients pps-tools ntpsec

# 0.4- Ecosistema de Radioafición y Redes AX.25 (Módem y Enrutador)
sudo apt install -y ax25-tools aprx direwolf

# 0.5- Siga las instrucciones oficiales de WeeWX (Estación Meteorológica) para Debian 13:
# https://www.weewx.com/docs/5.3/quickstarts/debian/

# 0.6- Siga las instrucciones de instalación de AIS-Catcher (Receptor Marítimo AIS):
# https://www.aiscatcher.org/quickstart
```

---

### 🖥️ Fase 1: Despliegue de la Consola Web (Node.js)

La consola web unifica el backend de Express y el frontend de React sobre un único proceso Node.js escuchando en el puerto `3000`.

```bash
# 1.1- Descargar el repositorio oficial
git clone https://github.com/EA7JRS/sat-aprs.git
cd sat-aprs

# 1.2- Instalar Node.js v20 (LTS Recomendada para Debian 13)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 1.3- Instalar dependencias del proyecto
npm install

# 1.4- Configurar Variables de Entorno (.env)
# Copie la plantilla de configuración e introduzca sus credenciales privadas:
cp .env.example .env
nano .env

# 1.5- Compilación para Producción
# Genera el bundle optimizado del frontend y empaqueta el servidor Express:
npm run build

# 1.6- Iniciar el Servicio en Producción
npm run start
```

---

### 🐍 Fase 2: Configuración del Agente de Telemetría (Python)

El agente de telemetría `aprs_sat.py` automatiza la adquisición de datos de sensores y APIs en tiempo real. Se recomienda aislarlo en un entorno virtual de Python (`venv`).

```bash
# 2.1- Crear e inicializar el entorno virtual de Python
python3 -m venv venv
source venv/bin/activate

# 2.2- Instalar dependencias requeridas por el agente
pip install --upgrade pip
pip install requests urllib3
```

#### 2.3- Configuración del Operador
Abra el archivo `aprs_sat.py` con su editor de texto favorito y ajuste los parámetros de su estación:
```python
# ==============================================================================
# CONFIGURACIÓN DE LA ESTACIÓN (Modificar según necesidad)
# ==============================================================================
CALLSIGN = "CALLSING-10"          # Su indicativo de llamada de radioaficionado con SSID
APRS_PASSCODE = "12345"         # Su código APRS-IS (passcode de validación)
FILTER_RADIUS_KM = 200.0        # Cobertura crítica de monitoreo sísmico
OWM_API_KEY = "SU_API_KEY_AQUÍ" # Clave de API de OpenWeatherMap (Opcional)
```

#### 2.4- Automatización y Persistencia con Systemd (Servicio del Sistema)
Para garantizar que el agente de telemetría funcione de manera ininterrumpida las 24/7 y se recupere automáticamente de reinicios o fallos del sistema, regístrelo como un servicio del sistema:

2.4.1.- Cree el archivo de configuración del servicio:
```bash
sudo nano /etc/systemd/system/sat-aprs.service
```

2.4.2.- Introduzca el siguiente contenido (asegúrese de reemplazar `/opt/sat-aprs` por la ruta absoluta de su instalación):
```ini
[Unit]
Description=S.A.T. - APRS Sentinel Agent
After=network.target gpsd.service

[Service]
Type=simple
User=root
Group=root
Environment=PYTHONUNBUFFERED=1
WorkingDirectory=/opt/sat-aprs
ExecStart=/opt/sat-aprs/venv/bin/python3 aprs_sat.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aprs-sat

[Install]
WantedBy=multi-user.target
```

2.4.3.- Cree el archivo de configuración del servicio:
```bash
sudo nano /etc/systemd/system/sat-aprs-agent.service
```

2.4.4- Introduzca el siguiente contenido

```bash
[Unit]
Description=S.A.T.-APRS Agent
After=gpsd.service network.target

[Service]
Type=simple
User=root
Group=root
Environment=PYTHONUNBUFFERED=1
WorkingDirectory=/opt/sat-aprs
ExecStart=/opt/sat-aprs/venv/bin/python3 aprs_sat.py
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=aprs-sat

[Install]
WantedBy=multi-user.target
```
2.4.5.- Registre, active y arranque el servicio de sistema:
```bash
sudo systemctl daemon-reload
sudo systemctl enable sat-aprs.service sat-aprs-agent.service
sudo systemctl start sat-aprs.service sat-aprs-agent.service
```
2.4.5.- Verifique
```bash
sudo systemctl status gpsd ntpsec aprx direwolf pat sat-aprs.service sat-aprs-agent.service
```

---

## 🔄 Procedimiento de Actualización (Upgrade) en Debian 13

Si ya tiene una versión de S.A.T.-APRS corriendo en producción sobre Debian 13, siga estos pasos detallados para realizar una actualización limpia y sin pérdida de configuraciones locales:

```bash
# 1. Acceder al directorio de instalación
cd /opt/sat-aprs

# 2. Detener los servicios en ejecución para evitar bloqueos de archivos
sudo systemctl stop sat-aprs.service
# Si tiene configurado pm2 o systemd para la consola web, deténgalos (ej. pm2 stop sat-aprs)

# 3. Guardar una copia de seguridad de sus archivos de configuración locales
cp .env .env.bak
cp aprs_sat.py aprs_sat.py.bak

# 4. Descargar los últimos cambios del repositorio oficial de GitHub
git fetch --all
git reset --hard origin/main

# 5. Restaurar sus configuraciones locales (.env y parámetros del agente)
# Puede comparar los archivos guardados para aplicar nuevos parámetros si existieran:
mv .env.bak .env
# Nota: Si el archivo aprs_sat.py ha tenido cambios estructurales significativos,
# aplique manualmente sus constantes (CALLSIGN, PASSCODE) en el nuevo aprs_sat.py.

# 6. Actualizar las dependencias de Node.js e iniciar la compilación
npm install
npm run build

# 7. Actualizar las dependencias de Python dentro del entorno virtual
source venv/bin/activate
pip install --upgrade -r requirements.txt 2>/dev/null || pip install --upgrade requests urllib3
deactivate

# 8. Recargar configuraciones de systemd y reiniciar los servicios
sudo systemctl daemon-reload
sudo systemctl restart sat-aprs.service

# 9. Verificar que el agente de telemetría está operando correctamente
sudo systemctl status sat-aprs.service
# Ver los registros de telemetría en vivo:
journalctl -u sat-aprs.service -f -n 50
```

---

## 🛠️ Resumen de Archivos de Configuración Incluidos
El repositorio incluye plantillas optimizadas para el despliegue de software nativo de radioaficionados en los directorios de configuración de Debian (`/etc` o `/etc/ax25/`):
* **`direwolf.conf`:** Configuración del módem de software para decodificación AFSK de 1200 baudios y GMSK de 9600 baudios.
* **`aprx.conf`:** Configuración del enrutador como digipeater/I-Gate APRS inteligente.
* **`weewx.conf`:** Estructura para captar telemetría meteorológica y propagarla.
* **`pat-config.json` y `axports`:** Estructuras completas de puertos radio TNC para Winlink / AX.25.
* **`ais-catcher`:** Directivas para decodificar tramas NMEA de seguridad marítima AIS.

---

## 🛡️ Estándares de Seguridad de Radioaficionados
Esta consola promueve el uso ético del espectro electromagnético. Las emulaciones de tramas de balizas AX.25 generadas por el simulador se adhieren a la normativa internacional de la UIT y la legislación local de telecomunicaciones:
- **Identificación Obligatoria**: Todas las tramas salientes inyectan indicativos de llamada de estación de radioaficionado válidos (ej. `EA1URG-13`).
- **Uso sin Cifrado**: Conforme al reglamento de radioaficionados, las transmisiones se realizan en texto claro y legible por cualquier estación de escucha terrestre o satelital (ISS / Satélites LEO).
