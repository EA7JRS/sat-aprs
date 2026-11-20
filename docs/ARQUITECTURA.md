# Arquitectura de S.A.T.-APRS

© 2026 Manuel - EA7JRS · v1.36.0 · Uso de la consola: [MANUAL.md](MANUAL.md)

S.A.T.-APRS es una estación APRS de alerta temprana: recoge avisos de fuentes
oficiales de Internet y de receptores de radio, los convierte a protocolo APRS
y los retransmite por RF y a un servidor APRS-IS. Además funciona como estación
APRS y meteorológica, y muestra en un mapa todo lo que tiene coordenadas.

## Los tres flujos

| Flujo | Entra | Sale |
| :--- | :--- | :--- |
| **1. Avisos de emergencia** | Fuentes oficiales: IGN, AEMET, MeteoAlarm, NOAA (clima espacial y ciclones), NASA FIRMS, CAMS y EURDEP; y por RF con SDR propio, NAVTEX e Inmarsat-C | Objeto APRS con la posición y los datos + boletín de emergencia, por RF y APRS-IS |
| **2. Estación APRS y meteorológica** | GPS (posición fija o móvil), estación meteorológica propia, datos de Internet (OWM, IQAir, AEMET) | Baliza de posición y parte meteorológico APRS, según el perfil de usuario |
| **3. Mapa** | AIS, ADS-B, APRS recibido, tráfico de carreteras y cualquier dato con coordenadas | Capas sobre el mapa base de la consola. **No se retransmite.** |

## Posición y hora

El NUC integra **gpsd** (posición, fija o móvil) y **ntpsec** disciplinado por
el GPS, y es el servidor NTP de la red. La consola lee la posición de gpsd y
el estado real de ntpsec; las reglas de difusión usan siempre la posición
actual, así que el radio de avisos acompaña a la estación si se mueve.

## Programas con los que convive

El NUC es una estación de radio completa. S.A.T.-APRS no sustituye a estos
programas: se conecta a ellos por sus interfaces de red.

| Programa | Papel | Enlace con S.A.T.-APRS |
| :--- | :--- | :--- |
| gpsd | Posición GPS, fija o móvil | TCP 2947 (JSON) |
| ntpsec | Servidor de hora de la red | `ntpq` |
| Direwolf | Módem/TNC para APRS por RF | KISS sobre TCP 8001; registro CSV (`LOGDIR`) para el nivel de audio |
| aprx (fork [EA7JRS/aprx](https://github.com/EA7JRS/aprx)) | Digipeater e iGate | `aprx.conf` y su registro de radio (`rflog`) |
| Pat | Winlink | API HTTP de `pat http` (8080) |
| Hamlib `rigctld` / `rotctld` | Equipo por CAT y rotor | TCP 4532 / 4533, protocolo extendido |
| Caja APRS LoRa+ Rotor | Rotor | TCP 4534, JSON con PIN |
| Nodo DX (DXSpider, AR-Cluster…) | Cluster DX | Telnet |
| DAPNET | Buscapersonas | API HTTPS de hampager.de |
| AIS-catcher / rtl_ais, readsb / dump1090 | Recepción AIS y ADS-B | UDP 10110 (o TCP) · SBS TCP 30003 |
| WeeWX | Estación meteorológica | Su base de datos o `wxnow.txt` |
| SocketCAN | Salida NMEA 2000 a un plotter | `can0`, 250 kbit/s |
| SDR++, SDRconnect, WSJT-X | Recepción SDR y modos digitales | Pendiente |

## Fórmulas comunes con APRS LoRa+

`server/formulas/` reúne los cálculos físicos, náuticos, astronómicos y
meteorológicos. Los usan tanto el servidor como la consola web.

| Módulo | Contenido | Origen |
| :--- | :--- | :--- |
| `geo` | Círculo máximo, loxodrómica, Vincenty (WGS84), desvío de ruta | Plotter |
| `astro` | Orto, ocaso y crepúsculos; posición del sol; luna (fase, posición, salida y puesta); refracción | Plotter |
| `wxcalc` | Punto de rocío, humedad, enfriamiento por viento, índice de calor, sensación térmica, presión al nivel del mar | Plotter |
| `wind` | Escala Beaufort, anemómetro de pulsos | Plotter |
| `motion` | CPA/TCPA, viento real y aparente, VMG, corriente | Plotter |
| `units` | Sistemas de unidades náutico, métrico e imperial | Plotter |
| `wmm` | Modelo Magnético Mundial WMM2025: declinación, inclinación, intensidad | Plotter |
| `wxextra` | Presión de vapor, humedad absoluta, bulbo húmedo (Stull), humidex, temperatura aparente, base de nubes, densidad del aire, altitud de presión, tendencia barométrica, categorías UV y de lluvia | Nuevas |
| `nautica` | Horizonte, alcance geográfico, velocidad de casco, escala Douglas, rosa de rumbos | Nuevas |
| `radio` | Localizador Maidenhead, pérdida en espacio libre, horizonte radio, Fresnel, dBm, PIRE, ROE, S-meter, alcance PHG | Nuevas |
| `fisica` | Energía sísmica, llegada de ondas P y S, dosis de radiación | Nuevas |

Los módulos marcados «Plotter» son el porte a TypeScript del núcleo del
plotter APRS LoRa+ (`lib/plotter_core`), con los mismos nombres de función.
`tests/formulas.test.ts` los compara con los resultados del código C++
original en 300 casos (`tests/fixtures/plotter-core-ref.json`), de modo que
la estación y los equipos del ecosistema dan exactamente los mismos valores.
Las nuevas se comprueban contra valores publicados de cada referencia.

## Un solo servicio, en TypeScript

Todo corre en un único servicio Node.js escrito en TypeScript:

- El trabajo es de red y de espera (descargar, escuchar sockets, temporizar),
  que es donde Node rinde mejor, y un solo proceso basta para todo.
- El servidor y la consola web comparten lenguaje y tipos de datos.
- Un único proceso transmite: no hay balizas duplicadas.
- El trabajo pesado de radio no se reescribe: lo hacen programas nativos ya
  probados (Direwolf, aprx, AIS-catcher, readsb, gpsd), a los que el servicio
  se conecta por TCP/UDP.

El agente en Python `aprs_sat.py` se retiró en la v1.36.0. Sus avisos por
umbrales de la estación y por el pronóstico de WeatherAPI están en la cadena
de avisos (`server/fuentes/umbrales.ts`); el resto ya lo hacía el servicio.

## La cadena de avisos

```
fuente ──▶ Evento ──▶ reglas ──▶ objeto + boletín APRS ──▶ política de emisión ──▶ cola ──▶ APRS-IS / RF
```

| Pieza | Archivo | Qué hace |
| :--- | :--- | :--- |
| Fuente | `server/fuentes/*.ts` | Descarga o escucha, y entrega `Evento[]`. No sabe nada de APRS. |
| Evento | `server/core/evento.ts` | Formato común: tipo, gravedad, posición, vigencia, origen y si el dato es real. |
| Reglas | `server/core/reglas.ts` | Radio alrededor de la estación, gravedad y umbral mínimos, vigencia y cadencia de repetición. Recuerda lo ya emitido (`sat_avisos.json`). |
| Formato | `server/core/aprsAvisos.ts` | Convierte el aviso en objeto (símbolo según el tipo) y boletín de emergencia. |
| Política | `server/aprs.ts` | Última barrera: emisión activada, dato real, indicativo válido, passcode. |
| Cola | `server/core/emisor.ts` | Una transmisión cada vez, con pausa; lo urgente primero. |

Ejemplo: un sismo del IGN de magnitud 4,5 a 177 km de la estación produce

```
EA7XXX-13>APZSAT:;EQ131901 *131901z3709.00N\00400.60WQM4.5 Prof:9km Salar.GR
EA7XXX-13>APZSAT::BLN2SISMO:EMERGENCIA SISMO M4.5 Prof:9km Salar.GR a 177km (IGN)
```

y el objeto se refresca cada 30 minutos durante 6 horas. Fuera del radio, por
debajo de la magnitud configurada o con datos incompletos, no se emite nada.

### Añadir una fuente nueva

1. Crear `server/fuentes/<nombre>.ts` con una función que devuelva `Evento[]`.
   Si un dato falta o es de prueba, `real: false`.
2. Declarar su `Politica` (radio, gravedad mínima, vigencia, repetición).
3. Llamar a `difundirAvisos(eventos, politica)` desde su temporizador.

## Estado de la reorganización

| Bloque | Estado |
| :--- | :--- |
| Protocolo APRS/AX.25/KISS y política de emisión | Hecho (`server/aprs.ts`) |
| Autenticación local | Hecho (`server/auth.ts`) |
| Cadena de avisos y cola de emisión | Hecho (`server/core/`) |
| Sismos (IGN, respaldo USGS y ShakeNet) | Hecho: primera fuente sobre la cadena |
| Hora de la estación (ntpsec + gpsd/PPS) | Hecho: estado real leído con `ntpq` (`server/sistema/ntp.ts`) |
| Avisos meteorológicos de AEMET (CAP, por zonas) | Hecho (`server/fuentes/aemetAvisos.ts`, `server/core/zona.ts`); sin probar aún contra el índice real de AEMET |
| Clima espacial (NOAA), focos de calor (FIRMS), calidad del aire (CAMS) | Hecho (`server/fuentes/climaEspacial.ts`, `incendios.ts`, `calidadAire.ts`); sin probar aún contra las fuentes reales |
| MeteoAlarm, ciclones tropicales (NHC), radiación (EURDEP) | Hecho en la v1.38.0 (`server/fuentes/meteoalarm.ts`, `ciclones.ts`, `radiacion.ts`); sin probar aún contra las fuentes reales |
| Tornados, Protección Civil | Sin fuente pública utilizable: el SPC solo cubre EE. UU. y no se conoce un feed público de los avisos de Protección Civil (ES-Alert llega por difusión celular a los móviles) |
| Fórmulas comunes con APRS LoRa+ | Hecho (`server/formulas/`) |
| Perfil de la estación (operador, estaciones, presets) | Hecho: guardado en la estación (`sat_perfil.json`) |
| Perfil de la estación APRS y baliza de posición (`server/estacion/baliza.ts`) | Hecho |
| Estación meteorológica: parte APRS con datos propios (WeeWX, wxnow.txt) o de Internet | Hecho (`server/estacion/meteo.ts`) |
| Entradas por RF: AIS, ADS-B, NAVTEX, Inmarsat | AIS y ADS-B reales. NAVTEX desde la v1.39.0: SDR → `tools/navtex/navtex.sh` (rtl_fm o rx_fm + navtex_rx_from_file) → archivo que lee `server/radio/navtex.ts`. Inmarsat-C EGC desde la v1.39.0: InmarScope por UDP (JSON) → `server/radio/egc.ts`. Fuera la entrada UDP antigua (puerto 9999), que inventaba área y emisor |
| Mapa con capas | Hecho con Estación, Avisos y Tráfico (`src/pages/Mapa.tsx`, `/api/mapa`); con la capa APRS desde la v1.11.0 (`server/aprsPosicion.ts`, `server/estaciones.ts`, `server/aprsIs.ts`); AIS y ADS-B desde la v1.12.0 (`server/ais.ts`, `server/adsb.ts`, `server/enlaceTcp.ts`) |
| Configuración de Direwolf/aprx desde la consola | Hecho: generador de `direwolf.conf` (sin `CBEACON`, con `LOGDIR`) y editor de archivos `.conf` |
| Radio (`server/radio/`) | Hecho: mensajería APRS y DAPNET, cluster DX con DXCC, Hamlib (equipo y rotor), caja APRS LoRa+ Rotor, seguimiento, satélites y Doppler, grupo ARTS/EAI, consola de comandos, Direwolf, aprx y Pat |
| Salida NMEA 2000 (`server/conectividad/`) | Hecho; PGN contrastados con CANboat en la CI; sin probar con un bus real |
| Pantallas con partes de demostración | Rehechas en la v1.33.0: Tramas APRS (`server/radio/tramas.ts`), WeeWX (`server/estacion/weewx.ts`), enlaces de Sistema → Equipo (`/api/enlaces`). Fuera el A-GPS simulado. En la v1.34.0 se retiran Coordinación y los paneles de demostración de Pruebas |
| Persistencia en SQLite | Hecho para el historial (`server/sistema/historial.ts`, `sat_historial.db` con `node:sqlite`): tramas, registro y mensajería sobreviven a un reinicio, con retención y exportación a CSV. La configuración y los avisos emitidos siguen en JSON |
| `server.ts` | Aún contiene el resto de la lógica; se irá vaciando bloque a bloque |
