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
| Avisos meteorológicos (AEMET, MeteoAlarm) | Pendiente de portar del agente Python |
| Clima espacial (NOAA), incendios (FIRMS), calidad del aire | En `server.ts`; pendientes de pasar a `server/fuentes/` |
| Huracanes, tornados, Protección Civil, radiación (EURDEP) | Sin fuente real todavía |
| Estación meteorológica y perfil de usuario | Pendiente |
| Entradas por RF: AIS, ADS-B, NAVTEX, Inmarsat | AIS, NAVTEX e Inmarsat son hoy simulados; ADS-B no existe |
| Mapa con capas | Pendiente (el visor anterior se retiró en la v1.4.4) |
| Configuración de Direwolf/aprx desde la consola | Existe; pendiente de revisar |
| Persistencia en SQLite | Pendiente (hoy, archivos JSON) |
| `server.ts` | Aún contiene el resto de la lógica; se irá vaciando bloque a bloque |
