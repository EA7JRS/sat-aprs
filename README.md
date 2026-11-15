<p align="center"><a href="https://ea7jrs.github.io/APRS-LoRa-Plus/"><img src="assets/aprs-lora-plus-banner.jpg" alt="APRS LoRa+ · Tracker · APRS · Map · Alerts" width="100%"></a></p>

# S.A.T. - APRS
### Servicio de Alerta Temprana por APRS 

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescript.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Licencia GPL v3](https://img.shields.io/badge/Licencia-GPL_v3-blue?style=for-the-badge)](LICENSE)
[![Donar con PayPal](https://img.shields.io/badge/Donar-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/ea7jrs)

El **S.A.T. APRS Dashboard** es una estación de trabajo digital unificada para operadores de radioafición (IARU/ITU) y redes de telecomunicaciones de emergencia en entornos de catástrofe y misiones críticas. Emula y visualiza el comportamiento de componentes de software de radio esenciales, permitiendo el monitoreo interactivo de señales de RF, la calibración de hardware de audio en tiempo real y la gestión operativa ante catástrofes.

S.A.T.-APRS es un Servicio de Alerta Temprana por radio APRS: una verdadera estación APRS y herramienta de gestión para grupos de voluntariado y gubernamentales dedicados al área de emergencias.

Se trata de un centro avanzado robusto y eficiente completamente autónomo que integra geolocalización y sincronización horaria vía satélite en tiempo real, una estación meteorológica, una pasarela SMS, sistema de correo electrónico Winlink y receptores SDR y/o físicos para AIS, NAVTEX y SafeNet II de Inmarsat.

Además, es una herramienta para grupos de emergencias ante situaciones severas y críticas para la gestión y coordinación supervisada, que se encarga de proporcionar mensajes de difusión tipo boletines informativos y mensajes de alerta integrales sobre condiciones adversas actuales para su información y difusión vía radio.

S.A.T.-APRS como estación de radio desatendida operando las 24/7, permite generar paquetes de datos APRS con un campo de información definido por el usuario y transmitirlos a intervalos específicos. Esto posibilita la transmisión de balizas, objetos, datos meteorológicos y telemetría, así como la difusión inteligente de boletines informativos o mensajes de alerta.

S.A.T.-APRS tiene la capacidad y objetivo de transmitir alertas e información posterior ante todo tipo de evento, peligros u otros riesgos para salvaguardar la salud y seguridad pública.

S.A.T.-APRS es un producto creado y desarrollado por EA7JRS, el autor exime toda responsabilidad debida a un uso y configuración incorrectos por parte del operador de radio como usuario final.

---

## 📌 Qué hace hoy (v1.29.0)

S.A.T.-APRS forma parte del ecosistema [APRS LoRa+](https://ea7jrs.github.io/APRS-LoRa-Plus/) y trabaja en tres frentes:

1. **Avisos de emergencia.** Recoge avisos de fuentes oficiales y, si ocurren dentro del radio configurado alrededor de la estación (fija o móvil), emite un **objeto APRS** en el lugar del suceso y un **boletín de emergencia**, por radio y por APRS-IS.
2. **Estación APRS y meteorológica.** Con el **perfil de la estación** (indicativo y SSID, passcode, posición o GPS, símbolo, PHG, comentario) emite su baliza de posición.
3. **Consola web.** Organizada en seis secciones (Inicio, Avisos, Estación, Mapa, Radio y Sistema), con color automático, del sistema, claro, oscuro o táctico (ámbar, rojo, verde o azul nocturno). Configura la estación y los servicios de radio del equipo (Direwolf, aprx, Pat, WeeWX) y muestra el estado del GPS y de la hora (gpsd y ntpsec).

| Función | Estado |
| :--- | :--- |
| Emisión APRS real por APRS-IS y por RF (KISS/AX.25), con cola única y política de emisión | Operativo |
| Sismos del IGN (respaldo USGS): objeto y boletín por radio y distancia | Operativo |
| Avisos meteorológicos oficiales de AEMET (Meteoalerta, por zonas): objeto y boletín | Operativo desde la v1.9.0; pendiente de validar en la estación |
| Perfil de la estación APRS y baliza de posición | Operativo |
| Parte meteorológico por APRS con datos de WeeWX, wxnow.txt, OWM o AEMET | Operativo desde la v1.14.0 |
| Posición por gpsd y estado real de ntpsec | Operativo |
| Fórmulas físicas, náuticas, astronómicas, meteorológicas y de radio (`server/formulas/`) | Operativo |
| HF y propagación en directo: bandas para enlace local (NVIS) y de larga distancia, ionosonda más cercana, índices solares | Operativo desde la v1.16.0; pendiente de validar en la estación |
| Clima espacial (NOAA), focos de calor por satélite (NASA FIRMS) y calidad del aire (CAMS): avisos por APRS | Operativo desde la v1.15.0; pendiente de validar en la estación |
| Medidores de calidad del aire más cercanos, en tiempo real (Sensor.Community) | Operativo desde la v1.20.0; pendiente de validar en la estación |
| Meteorología de la consola: OpenWeatherMap, AEMET u Open-Meteo (sin clave), nunca simulada | Operativo desde la v1.21.0; pendiente de validar en la estación |
| Boyas y estaciones costeras más cercanas, en tiempo real (NOAA NDBC) | Operativo desde la v1.21.0; pendiente de validar en la estación |
| Radio · Principal: cluster DX (con país, rumbo y distancia), mensajería APRS con acuse y envío por DAPNET | Operativo desde la v1.22.0; pendiente de validar en la estación |
| Radio · Principal: equipo por CAT (`rigctld`) y rotor (`rotctld` o la caja APRS LoRa+ Rotor); un spot sintoniza y gira | Operativo desde la v1.23.0; pendiente de validar en la estación |
| Rotor: seguimiento de estaciones APRS, barcos, aeronaves, Sol y Luna, con la estación fija o en movimiento y objetivos en movimiento | Operativo desde la v1.24.0; pendiente de validar en la estación |
| Satélites: descarga de TLE, próximos pasos, transmisores con Doppler y seguimiento con el rotor | Operativo desde la v1.25.0; pendiente de validar en la estación |
| Conectividad · salida NMEA 2000 (SocketCAN): posición (gpsd), hora, meteorología y avisos de emergencia al bus, para un plotter | Operativo desde la v1.26.0; sin probar con un bus NMEA 2000 real |
| Radio · Direwolf: estado, tramas explicadas, nivel de audio por estación (registro CSV de Direwolf), configuración y prueba de emisión | Operativo desde la v1.27.0; pendiente de validar en la estación |
| Grupo de estaciones (ARTS) con sondeo y emergencia remota (EAI), como en el tracker APRS LoRa+ | Operativo desde la v1.28.0; pendiente de validar en la estación |
| Consola de comandos de Radio (cat, rot, dx, aprs, dapnet, sat, arts, eai, n2k) | Operativo desde la v1.29.0; pendiente de validar en la estación |
| NAVTEX e Inmarsat | Sin fuente real conectada (los datos de ejemplo se han retirado) |
| Radiación, huracanes, tornados, Protección Civil | Sin fuente real todavía |
| Mapa con capas: estación, avisos (sismos y zonas de AEMET) y tráfico de la DGT | Operativo desde la v1.10.0 |
| Recepción APRS por radio (KISS) y por APRS-IS, y capa APRS del mapa | Operativo desde la v1.11.0 |
| AIS (NMEA por UDP/TCP: AIS-catcher, rtl_ais) y ADS-B (SBS de readsb/dump1090) en el mapa | Operativo desde la v1.12.0 |

Los paneles de demostración enseñan cómo quedará cada módulo; lo simulado va marcado y no sale al aire. El detalle de la arquitectura y del plan está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y los cambios de cada versión en [`CHANGELOG.md`](CHANGELOG.md).

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

### 6. Conectividad · Salida NMEA 2000

- **El NUC como nodo NMEA 2000** por **SocketCAN** (adaptador CAN, 250 kbit/s): reclama una dirección en el bus y pone en él los datos **propios** de la estación para un plotter (Garmin GPSMAP y otros).
- **Datos emitidos**: posición, rumbo y velocidad del **GPS (gpsd)** (PGN 129025/129026) y la hora (126992); **meteorología** de la estación/Internet — viento (130306), presión (130314) y temperatura (130316); **navegación** si hay objetivo o ruta (129283/129284); y los **avisos de emergencia** como **mensaje de seguridad AIS** (129802), además de por APRS.
- Lo recibido por RF (**AIS, ADS-B, APRS**) **no** se retransmite: es solo para el mapa.
- Se configura en **Sistema → Conectividad**. Requiere `can-utils` y la interfaz levantada: `sudo ip link set can0 up type can bitrate 250000`.

---

## 🛠️ Especificaciones Técnicas y Parámetros del Aire

| Parámetro | AFSK 300 bps (HF) | AFSK 1200 bps (VHF) | GMSK 9600 bps (UHF) | LoRa ~300 bps (UHF) |
| :--- | :--- | :--- | :--- | :--- |
| **Estándar Frecuencia** | `10.1473 MHz USB` | `144.800 MHz FM-N` | `432.500 MHz FM-W` | `433.775 MHz` |
| **Estándar Módem** | Bell 103 (SSB) | Bell 202 (FM) | GMSK (Direct Varactor) | LoRa CSS (SX127x / SX126x) |
| **Tonos (Mark/Space)**| 2020 Hz / 2220 Hz | 1200 Hz / 2200 Hz | Banda Base Directa | Sin tonos: SF12, CR 4/5 |
| **Ancho de Banda** | 500 Hz | 12.5 kHz | 25.0 kHz | 125 kHz |
| **Sincronización** | PLL Phase Lock | PLL Phase Lock | Bit Sync Recovery | Preámbulo de 8 símbolos, sync word `0x12` |

> **LoRa**: parámetros habituales de APRS sobre LoRa en Europa, los mismos del ecosistema [APRS LoRa+](https://github.com/EA7JRS/APRS-LoRa-Plus). La estación no lleva radio LoRa propia: el enlace se hace a través de un tracker o gateway APRS LoRa+.

---

## 🚀 Arquitectura de Desarrollo

Un único servicio en **Node.js y TypeScript** (consola, fuentes y emisión) que habla por TCP/UDP con los programas nativos del equipo: Direwolf, aprx, gpsd, ntpsec, Hamlib, Pat, AIS-catcher, WeeWX…

| Carpeta | Contenido |
| :--- | :--- |
| `server/aprs.ts` | Protocolo APRS / AX.25 / KISS y política de emisión |
| `server/aprsIs.ts`, `server/aprsPosicion.ts`, `server/estaciones.ts` | Sesión con APRS-IS, lectura de posiciones recibidas y estaciones oídas |
| `server/core/` | Cadena de avisos: evento común, reglas de difusión, formato APRS por tipo de emergencia y cola de emisión |
| `server/fuentes/` | Fuentes oficiales: sismos (IGN), avisos (AEMET), clima espacial (NOAA), focos de calor (FIRMS) y calidad del aire (CAMS) |
| `server/estacion/` | Baliza de posición y parte meteorológico de la estación |
| `server/formulas/` | Fórmulas comunes con el plotter APRS LoRa+ |
| `server/ais.ts`, `server/adsb.ts`, `server/enlaceTcp.ts` | Entradas AIS y ADS-B para el mapa |
| `server/sistema/` | Estado del equipo (ntpsec) |
| `server.ts` | Servidor Express; contiene aún el resto de la lógica, que se va pasando a las carpetas anteriores |
| `src/` | Consola web: React 19, Vite y Tailwind CSS |
| `aprs_sat.py` | Agente en Python, que se retirará cuando todo esté portado al servicio |
| `tests/` | Pruebas de protocolo, emisión, avisos, fórmulas y agente |

## 📡 Seguridad de emisión (léalo antes de transmitir)

S.A.T.-APRS es una estación real: lo que emite llega a la red APRS-IS mundial y al aire con su indicativo. Por eso el sistema aplica estas reglas y **no hay forma de saltárselas desde la interfaz**:

1. **Nada simulado sale al aire.** Lo que se inyecta desde «Pruebas y simulación» (un sismo o un aviso de prueba) se muestra en pantalla pero nunca se transmite. En el registro aparecen marcados como `[NO EMITIDO: datos simulados o de prueba]`.
2. **Sin indicativo válido no se transmite.** Con el indicativo de plantilla (`N0CALL`) o uno mal formado, el sistema no emite ni por Internet ni por radio.
3. **APRS-IS exige su passcode.** Si el passcode no corresponde al indicativo, no se inyecta nada en APRS-IS (la RF no lo necesita).
4. **La consola web no transmite por defecto.** Hay que activarla expresamente con `SAT_APRS_TX=on` en `.env`. Con la emisión activada, solo un administrador verificado puede modificar la estación o provocar transmisiones.
5. **Un solo transmisor.** El agente `aprs_sat.py` es quien emite las balizas y boletines automáticos. Si lo ejecuta, deje la consola con `SAT_APRS_TX=off` para no duplicar el tráfico.

Las tramas se emiten con el destino experimental `APZSAT`, la ruta `TCPIP*` hacia APRS-IS y la ruta de radio configurada (por defecto `WIDE1-1,WIDE2-1`) como tramas AX.25 reales por KISS.

---

## 💾 Instalación y Actualización en Debian 13 (Trixie)

Este sistema está diseñado para operar de manera autónoma las 24/7 en servidores o dispositivos integrados que ejecuten **Debian 13 (Trixie)** o **Raspberry Pi OS (Trixie)**.

### 📋 Requisitos del Sistema
* **Sistema Operativo:** Debian 13.x o Raspberry Pi OS (Trixie) de 64 bits.
* **Memoria RAM:** Mínimo 4 GB (se recomiendan 8 GB o más).
* **Conectividad:** Conexión a Internet para la descarga de boletines oficiales (IGN, AEMET/MeteoAlarm, NOAA) y el enlace con APRS-IS.
* **Hardware de Radio (Opcional):** TNC de audio (SDR, tarjeta de sonido externa, interfaces EasyDigi o transceptores con módem integrado).

---

## 🛠️ Guía de Instalación desde Cero

La arquitectura se divide en dos componentes independientes:
1. **Consola Web (React + Express):** el panel de control, accesible en el puerto `3000`.
2. **Agente S.A.T. Sentinel (`aprs_sat.py`):** un demonio en Python que recopila sensores (GPSD) y fuentes oficiales, y emite las balizas y boletines vía RF y APRS-IS.

### 📦 Fase 0: Preparación del Sistema Operativo

```bash
# 0.1- Actualizar el sistema
sudo apt update && sudo apt full-upgrade -y

# 0.2- Utilidades esenciales
sudo apt install -y git build-essential net-tools python3 python3-venv sqlite3

# 0.3- Sincronización horaria de precisión y posicionamiento (receptor GPS)
sudo apt install -y gpsd gpsd-clients pps-tools ntpsec

# 0.4- Ecosistema de radioafición y redes AX.25
sudo apt install -y ax25-tools aprx direwolf

# 0.5- WeeWX (estación meteorológica): https://www.weewx.com/docs/5.3/quickstarts/debian/
# 0.6- AIS-Catcher (receptor marítimo AIS): https://www.aiscatcher.org/quickstart
```

---

### 🖥️ Fase 1: Despliegue de la Consola Web (Node.js)

```bash
# 1.1- Descargar el repositorio
sudo git clone https://github.com/EA7JRS/sat-aprs.git /opt/sat-aprs
cd /opt/sat-aprs

# 1.2- Instalar Node.js 20 LTS o superior
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 1.3- Instalar dependencias
npm ci

# 1.4- Variables de entorno
cp .env.example .env
nano .env        # SAT_ADMIN_TOKEN, SAT_APRS_TX...

# 1.5- Compilar y arrancar
npm run build
npm run start
```

Variables principales de `.env` (todas documentadas en `.env.example`):

| Variable | Para qué sirve |
| :--- | :--- |
| `SAT_APRS_TX` | `on` permite que la consola transmita. Por defecto `off`. |
| `SAT_ADMIN_TOKEN` | Token local de administrador (mín. 16 caracteres; `openssl rand -hex 32`). |
| `SAT_TRUST_LOCALHOST` | `on` trata como administrador al navegador del propio equipo, sin token. |
| `HOST` / `PORT` | Interfaz y puerto de escucha (`HOST=127.0.0.1` tras un proxy con TLS). |

> **Sin cuentas ni nube.** La consola no depende de ningún servicio externo de autenticación o base de datos: el administrador se identifica con el token local (botón «Acceder» de la consola), que funciona también sin Internet. El perfil del operador, sus estaciones y presets se guardan en la propia estación (`sat_perfil.json`) y se ven igual desde cualquier navegador; los sonidos, en cada navegador. Sin un administrador configurado, la consola funciona en modo demostración: nada se escribe en disco.

#### 1.6- Perfil de la estación

En la consola, **Configuración → «Estación APRS»**: titular, indicativo y SSID, passcode de APRS-IS (la consola indica si corresponde al indicativo), posición fija por coordenadas o locator (o tomada del GPS), símbolo, PHG, comentario y ruta. La **baliza de posición** viene apagada: actívela solo si aprx o Direwolf no emiten ya la suya con el mismo indicativo.

---

### 🐍 Fase 2: Configuración del Agente (Python)

El agente solo usa la biblioteca estándar de Python 3: no hay dependencias que instalar.

```bash
# 2.1- Crear su configuración a partir de la plantilla
cp config.ini.example config.ini
nano config.ini
```

Lo imprescindible en `config.ini`:

```ini
[APRS]
callsign = EA7XXX-13        ; su indicativo con SSID
passcode = 12345            ; el passcode de APRS-IS de SU indicativo
rfPath = WIDE1-1,WIDE2-1

[Fallback]
latitude = 37.3891          ; posición de la estación sin GPS
longitude = -5.9845

[Alerts]
minMagnitude = 3.0          ; magnitud mínima de los sismos anunciados
meteoAreaFilter = Sevilla,Cadiz   ; zonas de los avisos meteorológicos oficiales
```

```bash
# 2.2- Comprobar qué emitiría, sin transmitir nada
python3 aprs_sat.py --dry-run --once

# 2.3- Probar toda la cadena con datos simulados (tampoco transmite)
python3 aprs_sat.py --simulate --once
```

#### 2.4- Servicios del sistema (systemd)

Dos unidades, una por componente (sustituya `/opt/sat-aprs` y el usuario si procede):

```bash
sudo nano /etc/systemd/system/sat-aprs.service
```
```ini
[Unit]
Description=S.A.T.-APRS Consola Web
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=satapr
WorkingDirectory=/opt/sat-aprs
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
SyslogIdentifier=sat-aprs

[Install]
WantedBy=multi-user.target
```

```bash
sudo nano /etc/systemd/system/sat-aprs-agent.service
```
```ini
[Unit]
Description=S.A.T.-APRS Agente Sentinel
After=network-online.target gpsd.service
Wants=network-online.target

[Service]
Type=simple
User=satapr
Environment=PYTHONUNBUFFERED=1
WorkingDirectory=/opt/sat-aprs
ExecStart=/usr/bin/python3 aprs_sat.py
Restart=always
RestartSec=10
SyslogIdentifier=sat-aprs-agent

[Install]
WantedBy=multi-user.target
```

```bash
# Usuario de servicio sin privilegios, dueño de la instalación
sudo useradd --system --home /opt/sat-aprs --shell /usr/sbin/nologin satapr
sudo chown -R satapr: /opt/sat-aprs

sudo systemctl daemon-reload
sudo systemctl enable --now sat-aprs.service sat-aprs-agent.service
sudo systemctl status gpsd ntpsec aprx direwolf sat-aprs.service sat-aprs-agent.service
```

> Se recomienda no ejecutar los servicios como `root`. Si quiere que la consola edite los archivos de `/etc` (Direwolf, aprx, WeeWX), conceda al usuario de servicio solo las órdenes `sudo` necesarias (`tee`, `cat`, `test`, `truncate`, `journalctl`) en `/etc/sudoers.d/`.

---

## 🔄 Procedimiento de Actualización

```bash
cd /opt/sat-aprs
sudo systemctl stop sat-aprs.service sat-aprs-agent.service

# Copia de seguridad de su configuración local
cp .env .env.bak
cp config.ini config.ini.bak 2>/dev/null
cp sat_config.json sat_config.json.bak 2>/dev/null

git pull --ff-only     # si falla, vea la nota sobre el 14-11-2026

npm ci
npm run build

sudo systemctl start sat-aprs.service sat-aprs-agent.service
journalctl -u sat-aprs-agent.service -f -n 50
```

> **Clones anteriores al 14-11-2026:** ese día se reescribió el historial del repositorio y `git pull` falla. Con la copia de seguridad hecha: `git fetch origin && git reset --hard origin/main`.

> **Al actualizar desde una versión anterior a la 1.5.0:** `config.ini` y `sat_config.json` han dejado de estar versionados en git, y git los borrará al traer esta versión. Haga la copia de seguridad de arriba y restáurela después (`cp config.ini.bak config.ini`). A partir de entonces las actualizaciones ya no tocan su configuración.

---

## 🧪 Pruebas

```bash
npm run lint       # comprobación de tipos (TypeScript)
npm test           # protocolo APRS, emisión, autenticación, avisos, baliza, NTP y fórmulas
npm run test:py    # agente: tramas, filtros de sismos, avisos y seguridad de emisión
```

---

## 🛠️ Archivos de Configuración de los Servicios de Radio
La consola genera y valida, desde el panel de configuración, las plantillas de los servicios nativos de Debian (`/etc` o `/etc/ax25/`):
* **`direwolf.conf`:** módem de software AFSK 1200 baudios / GMSK 9600 baudios. Con `LOGDIR /var/log/direwolf` (carpeta legible por la consola), la pantalla **Radio → Direwolf** muestra el nivel de audio y los bits corregidos de cada trama.
* **`aprx.conf`:** digipeater / I-Gate APRS.
* **`weewx.conf`:** telemetría meteorológica.
* **`pat` (`config.json`) y `axports`:** puertos de radio para Winlink / AX.25.

---

## 🛡️ Estándares de Seguridad de Radioaficionados
Esta consola promueve el uso ético del espectro electromagnético. Las tramas que emite se atienen a la normativa internacional de la UIT y a la legislación local de telecomunicaciones:
- **Identificación Obligatoria**: Todas las tramas salientes llevan el indicativo de la estación, y el sistema se niega a transmitir si no es un indicativo válido.
- **Uso sin Cifrado**: Conforme al reglamento de radioaficionados, las transmisiones se realizan en texto claro y legible por cualquier estación de escucha terrestre o satelital (ISS / Satélites LEO).

---

## ☕ Apoya el proyecto
S.A.T.-APRS es un proyecto personal de EA7JRS. Si te resulta útil, puedes invitarme a un café:

[![Donar con PayPal](https://img.shields.io/badge/Donar-PayPal.me%2Fea7jrs-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/ea7jrs)

---

## 📄 Licencia

[GNU General Public License v3.0 o posterior](LICENSE), como el resto del ecosistema APRS LoRa+. © 2026 Manuel - EA7JRS

## Referencia de formatos NMEA 2000: CANboat

Los PGN que emite la salida NMEA 2000 se contrastan con la base de datos de **[CANboat](https://canboat.github.io/canboat/)** (Apache-2.0), release fijada **v9.2.0**: `tools/canboat/run.sh` baja `canboat.json` y decodifica con él las tramas de `server/conectividad/nmea2000.ts` (129025, 129026, 126992, 130306, 130314, 130316, 129283, 129284, 129802). La CI lo ejecuta en cada subida.
