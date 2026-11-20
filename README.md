<p align="center"><a href="https://ea7jrs.github.io/APRS-LoRa-Plus/"><img src="assets/aprs-lora-plus-banner.jpg" alt="APRS LoRa+ · Tracker · APRS · Map · Alerts" width="100%"></a></p>

# S.A.T. - APRS
### Servicio de Alerta Temprana por APRS 

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescript.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Licencia GPL v3](https://img.shields.io/badge/Licencia-GPL_v3-blue?style=for-the-badge)](LICENSE)
[![Donar con PayPal](https://img.shields.io/badge/Donar-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/ea7jrs)

**S.A.T.-APRS** (Servicio de Alerta Temprana por APRS) convierte un PC pequeño con Debian (un Intel NUC, por ejemplo) en una **estación APRS de emergencias desatendida, 24/7**, para radioaficionados y grupos de voluntariado de emergencias.

- Vigila **fuentes oficiales** (IGN, AEMET, NOAA, NASA FIRMS, Copernicus CAMS y, si se encienden, MeteoAlarm, los ciclones del NHC y la radiactividad de EURDEP…) y, cuando algo ocurre dentro del radio que elijas alrededor de la estación (fija o móvil), emite un **objeto APRS** en el lugar del suceso y un **boletín de emergencia**, por radio y por APRS-IS.
- Funciona como **estación APRS y meteorológica**: baliza de posición, parte meteorológico, mensajería con acuse, grupo de estaciones (ARTS) y emergencia remota (EAI).
- Es la **consola de la estación de radio**: equipo por CAT, rotor, cluster DX, satélites con Doppler, Direwolf, aprx y Winlink (Pat), y la salida NMEA 2000 hacia un plotter.

Todo con datos reales. Lo que se usa para ensayar (sucesos de prueba) se ve en pantalla pero **nunca sale al aire**.

S.A.T.-APRS forma parte del ecosistema [APRS LoRa+](https://ea7jrs.github.io/APRS-LoRa-Plus/) (tracker, app Android, Display, Rotor, plotter, pasarela NMEA 2000) y comparte con él fórmulas, órdenes y formatos.

📘 **[Manual de uso](docs/MANUAL.md)** · 🏗️ [Arquitectura](docs/ARQUITECTURA.md) · 📝 [Cambios por versión](CHANGELOG.md)

> El autor no se hace responsable de un uso o una configuración incorrectos por parte del operador. Lo que emite la estación sale con **su** indicativo: lea [Seguridad de emisión](#-seguridad-de-emisión-léalo-antes-de-transmitir) antes de activar la transmisión.

---

## 📌 Qué hace hoy (v1.36.0)

La consola tiene seis secciones: **Inicio, Avisos, Estación, Mapa, Radio y Sistema**, con color automático, claro, oscuro o táctico (ámbar, rojo, verde o azul nocturno), y se usa también desde el móvil.

| Función | Estado |
| :--- | :--- |
| Emisión APRS real por APRS-IS y por RF (KISS/AX.25), con cola única y política de emisión | Operativo |
| Sismos del IGN (respaldo USGS y ShakeNet de Raspberry Shake): objeto y boletín según distancia y magnitud | Operativo |
| Avisos meteorológicos oficiales de AEMET (Meteoalerta, por zonas): objeto y boletín | Operativo desde la v1.9.0; pendiente de validar en la estación |
| Clima espacial (NOAA), focos de calor por satélite (NASA FIRMS) y calidad del aire (CAMS): avisos por APRS | Operativo desde la v1.15.0; pendiente de validar en la estación |
| Perfil de la estación APRS y baliza de posición | Operativo |
| Posición por gpsd y estado real de ntpsec | Operativo |
| Parte meteorológico por APRS con datos de WeeWX, wxnow.txt, OpenWeatherMap o AEMET | Operativo desde la v1.14.0 |
| Meteorología de la consola: OpenWeatherMap, AEMET u Open-Meteo (sin clave), nunca simulada | Operativo desde la v1.21.0; pendiente de validar en la estación |
| Medidores de calidad del aire más cercanos (Sensor.Community) | Operativo desde la v1.20.0; pendiente de validar en la estación |
| Boyas y estaciones costeras más cercanas (NOAA NDBC) | Operativo desde la v1.21.0; pendiente de validar en la estación |
| Mapa con capas: estación, avisos, APRS (radio y APRS-IS), AIS, ADS-B y tráfico de la DGT | Operativo desde la v1.12.0 |
| HF y propagación: bandas para NVIS y larga distancia, ionosonda más cercana, índices solares | Operativo desde la v1.16.0; pendiente de validar en la estación |
| Radio · Principal: cluster DX (país, rumbo y distancia), mensajería APRS con acuse y DAPNET | Operativo desde la v1.22.0; pendiente de validar en la estación |
| Radio · Principal: equipo por CAT (`rigctld`) y rotor (`rotctld` o la caja APRS LoRa+ Rotor) | Operativo desde la v1.23.0; pendiente de validar en la estación |
| Rotor: seguimiento de estaciones APRS, barcos, aeronaves, Sol y Luna; estación fija o en movimiento | Operativo desde la v1.24.0; pendiente de validar en la estación |
| Satélites: TLE, próximos pasos, transmisores, Doppler continuo en el equipo (con split) y seguimiento con el rotor | Operativo desde la v1.25.0; pendiente de validar en la estación |
| Grupo de estaciones (ARTS) con sondeo y emergencia remota (EAI), como en el tracker APRS LoRa+ | Operativo desde la v1.28.0; pendiente de validar en la estación |
| Consola de comandos de Radio (`cat`, `rot`, `dx`, `aprs`, `dapnet`, `sat`, `arts`, `eai`, `n2k`) | Operativo desde la v1.29.0; pendiente de validar en la estación |
| Radio · Direwolf: estado, tramas explicadas, nivel de audio por estación, configuración y prueba de emisión | Operativo desde la v1.27.0; pendiente de validar en la estación |
| Radio · aprx: pasarela a APRS-IS, digipeater e interfaces, desde `aprx.conf` y su registro de radio | Operativo desde la v1.31.0; pendiente de validar en la estación |
| Radio · Winlink: buzón, redacción, sesiones y pasarelas RMS a través de la API HTTP de Pat | Operativo desde la v1.32.0; sin probar con un Pat real |
| Conectividad · salida NMEA 2000 (SocketCAN): posición, hora, meteorología y avisos al bus, para un plotter | Operativo desde la v1.26.0; sin probar con un bus NMEA 2000 real |
| aprx desde el fork [EA7JRS/aprx](https://github.com/EA7JRS/aprx), que compila en Debian 13 (`tools/instalar-aprx.sh`) | Operativo desde la v1.32.1 |
| Radio · Tramas APRS: todo lo que entra (radio y APRS-IS) y sale, explicado, y analizador de tramas | Operativo desde la v1.33.0 |
| Estación · WeeWX: lectura actual y 24 h desde la base de datos de WeeWX | Operativo desde la v1.33.0; pendiente de validar con una estación real |
| Sistema · Equipo: enlaces reales de la estación (APRS-IS, KISS, gpsd, AIS, ADS-B, CAT, rotor, cluster, Pat, NMEA 2000) | Operativo desde la v1.33.0 |
| Ayuda de la consola: las seis secciones, con acceso a cada pantalla y enlace al manual | Operativo desde la v1.34.0 |
| Avisos por umbrales de la estación y por el pronóstico de WeatherAPI, en la cadena de avisos (antes en el agente Python, ya retirado) | Operativo desde la v1.36.0; pendiente de validar en la estación |
| Radio · NAVTEX e Inmarsat: NAVTEX con RTL-SDR o SDRplay (`tools/navtex/`) e Inmarsat-C EGC desde InmarScope por UDP; sus avisos, por APRS | Operativo desde la v1.39.0; la cadena NAVTEX probada con una grabación real, sin probar aún con el SDR en la estación |
| Avisos de MeteoAlarm (por zonas), ciclones tropicales (NHC) y radiactividad ambiental (EURDEP), sin clave | Operativo desde la v1.38.0; sin probar aún contra las fuentes reales |
| Tsunamis de tsunami.gov (PTWC y NTWC), avisos del NWS de EE. UU. (tornados, tormentas severas…) y sucesos de NASA EONET: las fuentes de la app Android APRS LoRa+ | Operativo desde la v1.40.0; sin probar aún contra las fuentes reales. El NWS solo cubre EE. UU. |
| Tornados en España, Protección Civil | Sin fuente pública: no se conoce un feed de avisos de tornado para Europa ni de Protección Civil (ES-Alert llega por difusión celular a los móviles) |

---

## 🧭 La consola, sección a sección

El detalle de cada pantalla, con ejemplos de uso, está en el **[manual](docs/MANUAL.md)**.

| Sección | Pantallas | Para qué |
| :--- | :--- | :--- |
| **Inicio** | Inicio | Avisos activos en tu zona, estado de la estación (posición, hora, baliza, meteo), últimas emisiones y si las fuentes responden. |
| **Avisos** | En vigor · Salud | Todos los avisos de la cadena, los que se difunden y los que no (y por qué), con sus tramas APRS; Plan Meteosalud del Ministerio de Sanidad. |
| **Estación** | Estación y meteo · Perfil · WeeWX | Meteorología actual y calidad del aire cercana; perfil APRS de la estación (indicativo, posición, símbolo, baliza); WeeWX con sus últimas 24 h. |
| **Mapa** | Mapa · Tráfico · Boyas | Capas con todo lo que llega con coordenadas (solo se ve, no se retransmite); incidencias de la DGT; boyas cercanas. |
| **Radio** | Principal · Direwolf · HF y propagación · aprx · Tramas APRS · Winlink | La estación de radio: equipo, rotor, satélites, cluster, grupo ARTS, mensajes y consola de comandos; los servicios de radio del equipo. |
| **Sistema** | Equipo · Configuración · Conectividad · Pruebas y simulación | Estado del equipo, ajustes y archivos `.conf`, salida NMEA 2000 y herramientas de ensayo (nada de ellas se emite). |

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
| `server/fuentes/` | Fuentes oficiales: sismos (IGN), avisos (AEMET y MeteoAlarm), clima espacial (NOAA), focos de calor (FIRMS), calidad del aire (CAMS), ciclones (NHC) y radiactividad (EURDEP) |
| `server/estacion/` | Baliza de posición y parte meteorológico de la estación |
| `server/radio/` | Radio: mensajería APRS, DAPNET, cluster DX y tabla DXCC, Hamlib (equipo y rotor) y caja APRS LoRa+ Rotor, seguimiento, satélites y Doppler, grupo ARTS/EAI, consola de comandos, Direwolf, aprx y Pat (Winlink) |
| `server/conectividad/` | Salida NMEA 2000 por SocketCAN |
| `server/formulas/` | Fórmulas comunes con el plotter APRS LoRa+ |
| `server/ais.ts`, `server/adsb.ts`, `server/enlaceTcp.ts` | Entradas AIS y ADS-B para el mapa |
| `server/propagacion.ts`, `server/sistema/` | HF y propagación; estado del equipo (ntpsec) |
| `server.ts` | Servidor Express; contiene aún el resto de la lógica, que se va pasando a las carpetas anteriores |
| `src/` | Consola web: React 19, Vite y Tailwind CSS (`src/pages/` una pantalla por archivo, `src/navigation.ts` las secciones) |
| `tools/` | `instalar-aprx.sh` (aprx desde el fork), `navtex/` (receptor NAVTEX con SDR) y `canboat/` (comprobación de los PGN de NMEA 2000) |
| `tests/` | Pruebas de protocolo, emisión, avisos, fórmulas y radio |

## 📡 Seguridad de emisión (léalo antes de transmitir)

S.A.T.-APRS es una estación real: lo que emite llega a la red APRS-IS mundial y al aire con su indicativo. Por eso el sistema aplica estas reglas y **no hay forma de saltárselas desde la interfaz**:

1. **Nada simulado sale al aire.** Lo que se inyecta desde «Pruebas y simulación» (un sismo o un aviso de prueba) se muestra en pantalla pero nunca se transmite. En el registro aparecen marcados como `[NO EMITIDO: datos simulados o de prueba]`.
2. **Sin indicativo válido no se transmite.** Con el indicativo de plantilla (`N0CALL`) o uno mal formado, el sistema no emite ni por Internet ni por radio.
3. **APRS-IS exige su passcode.** Si el passcode no corresponde al indicativo, no se inyecta nada en APRS-IS (la RF no lo necesita).
4. **La consola web no transmite por defecto.** Hay que activarla expresamente con `SAT_APRS_TX=on` en `.env`. Con la emisión activada, solo un administrador verificado puede modificar la estación o provocar transmisiones.
5. **Un solo transmisor.** Todo lo que se emite sale de la consola, por una única cola con su política de emisión. Si aprx o Direwolf emiten ya la baliza con el mismo indicativo, deje apagada la de la consola.
6. **Confirmación antes de transmitir.** El PTT del equipo (que se suelta solo a los 3 minutos), la emergencia remota EAI y las sesiones de Winlink por radio piden confirmación, también desde la consola de comandos.

Las tramas se emiten con el destino experimental `APZSAT`, la ruta `TCPIP*` hacia APRS-IS y la ruta de radio configurada (por defecto `WIDE1-1,WIDE2-1`) como tramas AX.25 reales por KISS.

---

## 💾 Instalación y Actualización en Debian 13 (Trixie)

Este sistema está diseñado para operar de manera autónoma las 24/7 en servidores o dispositivos integrados que ejecuten **Debian 13 (Trixie)** o **Raspberry Pi OS (Trixie)**.

### 📋 Requisitos del Sistema
* **Sistema Operativo:** Debian 13.x o Raspberry Pi OS (Trixie) de 64 bits.
* **Memoria RAM:** Mínimo 4 GB (se recomiendan 8 GB o más).
* **Conectividad:** Conexión a Internet para la descarga de boletines oficiales (IGN, AEMET/MeteoAlarm, NOAA) y el enlace con APRS-IS.
* **Receptor GPS (recomendado):** posición y hora para gpsd y ntpsec.
* **Hardware de radio (opcional):** interfaz de audio para Direwolf (tarjeta de sonido USB, Digirig, EasyDigi…), equipo con CAT para Hamlib, rotor con `rotctld` o la caja APRS LoRa+ Rotor, receptores RTL-SDR para AIS y ADS-B, adaptador CAN para NMEA 2000.

---

## 🛠️ Guía de Instalación desde Cero

Un solo servicio en Node.js: la consola web, en el puerto `3000`, y todo el trabajo de la estación (fuentes, cadena de avisos, emisión y radio). Se apoya en los programas nativos de Debian (Direwolf, aprx, gpsd, Hamlib, Pat, WeeWX…), a los que se conecta por TCP/UDP. El antiguo agente en Python (`aprs_sat.py`) se retiró en la v1.36.0: lo que hacía está en el servicio.

### 📦 Fase 0: Preparación del Sistema Operativo

```bash
# 0.1- Actualizar el sistema
sudo apt update && sudo apt full-upgrade -y

# 0.2- Utilidades esenciales
sudo apt install -y git build-essential net-tools sqlite3

# 0.3- Sincronización horaria de precisión y posicionamiento (receptor GPS)
sudo apt install -y gpsd gpsd-clients pps-tools ntpsec

# 0.4- Ecosistema de radioafición y redes AX.25
#      (aprx no se instala de Debian: va desde el fork EA7JRS/aprx, en el paso 1.2)
sudo apt install -y ax25-tools direwolf

# 0.5- Opcionales, según el equipo de la estación:
#      Hamlib (equipo por CAT y rotor: rigctld, rotctld)
sudo apt install -y libhamlib-utils
#      NMEA 2000 por SocketCAN
sudo apt install -y can-utils
#      Pat (Winlink): paquete .deb de https://github.com/la5nta/pat/releases ;
#      luego, como su usuario:  sudo systemctl enable --now pat@<usuario>
#      WeeWX (estación meteorológica): https://www.weewx.com/docs/5.3/quickstarts/debian/
#      AIS-catcher (AIS): https://www.aiscatcher.org/quickstart
```

---

### 🖥️ Fase 1: Despliegue de la Consola Web (Node.js)

```bash
# 1.1- Descargar el repositorio
sudo git clone https://github.com/EA7JRS/sat-aprs.git /opt/sat-aprs
cd /opt/sat-aprs

# 1.2- aprx desde el fork EA7JRS/aprx: compila en Debian 13, sustituye al de
#      Debian (respeta /etc/aprx.conf), queda retenido en apt y arrancado
sudo sh tools/instalar-aprx.sh

# 1.3- Instalar Node.js 22 (22.13 o posterior: el historial usa node:sqlite)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 1.4- Instalar dependencias
npm ci

# 1.5- Variables de entorno
cp .env.example .env
nano .env        # SAT_ADMIN_TOKEN, SAT_APRS_TX...

# 1.6- Compilar y arrancar
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

> **Sin cuentas ni nube.** La consola no depende de ningún servicio externo de autenticación o base de datos: el administrador se identifica con el token local (botón «Acceder» de la consola), que funciona también sin Internet. El perfil del operador, sus estaciones y presets se guardan en la propia estación (`sat_perfil.json`) y se ven igual desde cualquier navegador; los sonidos, en cada navegador. Sin un administrador configurado, los cambios de configuración quedan solo en memoria; el historial de tramas y del registro sí se guarda (`sat_historial.db`).

#### 1.7- Perfil de la estación

En la consola, **Estación → Perfil**: titular, indicativo y SSID, passcode de APRS-IS (la consola indica si corresponde al indicativo), posición fija por coordenadas o locator (o tomada del GPS), símbolo, PHG, comentario y ruta. La **baliza de posición** viene apagada: actívela solo si aprx o Direwolf no emiten ya la suya con el mismo indicativo.

---

### ⚙️ Fase 2: Servicio del sistema

> **Desde el agente antiguo (`aprs_sat.py`):** si aún no hay `sat_config.json`, la consola importa una vez su `config.ini` (indicativo, passcode, servidor, posición de respaldo, claves y umbrales). Después, todo se ajusta en la consola. Desactive el servicio antiguo: `sudo systemctl disable --now sat-aprs-agent.service`.

#### 2.1- Unidad de systemd

Sustituya `/opt/sat-aprs` y el usuario si procede:

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
# Usuario de servicio sin privilegios, dueño de la instalación
sudo useradd --system --home /opt/sat-aprs --shell /usr/sbin/nologin satapr
sudo chown -R satapr: /opt/sat-aprs

sudo systemctl daemon-reload
sudo systemctl enable --now sat-aprs.service
sudo systemctl status gpsd ntpsec aprx direwolf sat-aprs.service
```

> Se recomienda no ejecutar los servicios como `root`. Si quiere que la consola edite los archivos de `/etc` (Direwolf, aprx, WeeWX), conceda al usuario de servicio solo las órdenes `sudo` necesarias (`tee`, `cat`, `test`, `truncate`, `journalctl`) en `/etc/sudoers.d/`.

---

## 🔄 Procedimiento de Actualización

```bash
cd /opt/sat-aprs
sudo systemctl stop sat-aprs.service

# Copia de seguridad de su configuración local
cp .env .env.bak
cp sat_config.json sat_config.json.bak 2>/dev/null
cp sat_historial.db sat_historial.db.bak 2>/dev/null   # con el servicio parado

git pull --ff-only     # si falla, vea la nota sobre el 14-11-2026

npm ci
npm run build

sudo systemctl start sat-aprs.service
journalctl -u sat-aprs.service -f -n 50
```

> **aprx del fork:** para traer la última versión de [EA7JRS/aprx](https://github.com/EA7JRS/aprx), vuelva a ejecutar `sudo sh tools/instalar-aprx.sh`.

> **Clones anteriores al 14-11-2026:** ese día se reescribió el historial del repositorio y `git pull` falla. Con la copia de seguridad hecha: `git fetch origin && git reset --hard origin/main`.

> **Al actualizar desde una versión anterior a la 1.36.0:** el agente Python se ha retirado. Pare y desactive su servicio (`sudo systemctl disable --now sat-aprs-agent.service`) y borre su unidad (`sudo rm /etc/systemd/system/sat-aprs-agent.service`). Si aún no tenía `sat_config.json`, la consola importa su `config.ini` la primera vez.

> **Al actualizar desde una versión anterior a la 1.5.0:** `config.ini` y `sat_config.json` han dejado de estar versionados en git, y git los borrará al traer esta versión. Haga la copia de seguridad de arriba y restáurela después. A partir de entonces las actualizaciones ya no tocan su configuración.

---

## 🧪 Pruebas

```bash
npm run lint       # comprobación de tipos (TypeScript)
npm test           # protocolo APRS, emisión, autenticación, avisos, baliza, NTP, fórmulas y radio
                   # (mensajería, Hamlib, satélites, Doppler, ARTS, consola, Direwolf, aprx, Pat)
```

---

## 🛠️ Archivos de Configuración de los Servicios de Radio
La consola genera y valida, en **Sistema → Configuración → «Archivos .conf Debian»**, las plantillas de los servicios nativos de Debian (`/etc` o `/etc/ax25/`):
* **`direwolf.conf`:** módem de software AFSK 1200 baudios / GMSK 9600 baudios, con `KISSPORT 8001` para la consola. Con `LOGDIR /var/log/direwolf` (carpeta legible por la consola), la pantalla **Radio → Direwolf** muestra el nivel de audio y los bits corregidos de cada trama. Sin `CBEACON`: la baliza la emite la consola, con su política de emisión.
* **`aprx.conf`:** digipeater / I-Gate APRS. Con `rflog /var/log/aprx/aprx-rf.log` dentro de `<logging>`, la pantalla **Radio → aprx** muestra el tráfico.
* **`weewx.conf`:** telemetría meteorológica.
* **`pat` (`config.json`) y `axports`:** puertos de radio para Winlink / AX.25. La pantalla **Radio → Winlink** habla con Pat por su API HTTP (`http_addr`, de serie `localhost:8080`).

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
