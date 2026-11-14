# Arquitectura de S.A.T.-APRS

© 2026 Manuel - EA7JRS

S.A.T.-APRS es una estación APRS de alerta temprana: recoge avisos de fuentes
oficiales de Internet y de receptores de radio, los convierte a protocolo APRS
y los retransmite por RF y a un servidor APRS-IS. Además funciona como estación
APRS y meteorológica, y muestra en un mapa todo lo que tiene coordenadas.

## Los tres flujos

| Flujo | Entra | Sale |
| :--- | :--- | :--- |
| **1. Avisos de emergencia** | Fuentes oficiales (IGN, AEMET, MeteoAlarm, NOAA, FIRMS, Protección Civil, radiación…) y RF (NAVTEX, Inmarsat) | Objeto APRS con la posición y los datos + boletín de emergencia, por RF y APRS-IS |
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
| Direwolf | Módem/TNC para APRS por RF | KISS sobre TCP |
| aprx | Digipeater e I-Gate | Archivo de configuración |
| AX.25 nativo, Pat Winlink | Correo por radio | Configuración; estado |
| Hamlib (`rigctld`) | Control CAT de los equipos | TCP 4532 (pendiente) |
| AIS-catcher, readsb | Recepción AIS y ADS-B con los RTL-SDR | TCP/UDP (pendiente) |
| SDR++, SDRconnect (RSPdx-R2) | Recepción SDR general | Fuente de audio/IQ para decodificadores (pendiente) |
| WSJT-X | Modos digitales | UDP 2237 (pendiente) |
| WeeWX | Estación meteorológica | Archivo/HTTP (pendiente) |

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

El agente `aprs_sat.py` se retirará cuando sus funciones estén portadas (ver
el estado más abajo). Mientras tanto, solo uno de los dos debe transmitir.

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
| Sismos (IGN, respaldo USGS) | Hecho: primera fuente sobre la cadena |
| Hora de la estación (ntpsec + gpsd/PPS) | Hecho: estado real leído con `ntpq` (`server/sistema/ntp.ts`) |
| Avisos meteorológicos de AEMET (CAP, por zonas) | Hecho (`server/fuentes/aemetAvisos.ts`, `server/core/zona.ts`); sin probar aún contra el índice real de AEMET |
| Clima espacial (NOAA), incendios (FIRMS), calidad del aire | En `server.ts`; pendientes de pasar a `server/fuentes/` |
| Huracanes, tornados, Protección Civil, radiación (EURDEP) | Sin fuente real todavía |
| Fórmulas comunes con APRS LoRa+ | Hecho (`server/formulas/`) |
| Perfil de la estación (operador, estaciones, presets) | Hecho: guardado en la estación (`sat_perfil.json`) |
| Perfil de la estación APRS y baliza de posición (`server/estacion/baliza.ts`) | Hecho |
| Estación meteorológica: envío de datos propios y de Internet | Pendiente |
| Entradas por RF: AIS, ADS-B, NAVTEX, Inmarsat | AIS y ADS-B reales en el mapa; NAVTEX e Inmarsat, y los paneles antiguos de AIS, siguen simulados |
| Mapa con capas | Hecho con Estación, Avisos y Tráfico (`src/pages/Mapa.tsx`, `/api/mapa`); con la capa APRS desde la v1.11.0 (`server/aprsPosicion.ts`, `server/estaciones.ts`, `server/aprsIs.ts`); AIS y ADS-B desde la v1.12.0 (`server/ais.ts`, `server/adsb.ts`, `server/enlaceTcp.ts`) |
| Configuración de Direwolf/aprx desde la consola | Existe; pendiente de revisar |
| Persistencia en SQLite | Pendiente (hoy, archivos JSON) |
| `server.ts` | Aún contiene el resto de la lógica; se irá vaciando bloque a bloque |
