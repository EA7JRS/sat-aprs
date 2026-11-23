# Changelog - S.A.T.-APRS+

Historial de versiones de la consola S.A.T.-APRS+.

## [v1.55.0] - 2026-11-23
- **Radio · APRS LoRa+**, pantalla nueva para los trackers [APRS LoRa+](https://github.com/EA7JRS/APRS-LoRa-Plus) de la estación (hasta 4), según la vista previa aprobada.
  - **Enlace KISS por WiFi** permanente con cada tracker (puerto 8001, «KISS over WiFi» de su WebUI): lo que oyen por LoRa entra en Tramas, Estaciones, el mapa y la mensajería como cualquier trama de radio. Oídas en la última hora, estaciones distintas y **ocupación del canal** estimada con el tiempo en el aire de cada trama (fórmula de Semtech, con el SF, el ancho de banda y el CR del tracker).
  - **Estado del tracker** leído de su `GET /api/status` (firmware posterior a la 5.4.7): indicativo, versión, modo, frecuencia y parámetros LoRa, batería, SmartBeacon, digipetidor, ruta. Con un firmware anterior, solo el enlace KISS.
  - **Comprobación** de lo que se ve desde fuera, con las reglas de «Config check» de la WebUI del tracker: NOCALL, frecuencia fuera de los canales digitales del plan de la IARU Región 1, parámetros distintos de SF12 / 125 kHz / CR 4/5 en 433,775 MHz, ruta de más de dos saltos, digipetidor en una estación móvil, KISS por Bluetooth y por WiFi a la vez.
  - **Reparto de funciones** con una columna para LoRa, y avisos: la misma baliza desde la consola y el tracker, dos trackers con el mismo indicativo o los dos de digipetidor.
  - **Avisos urgentes por LoRa** (desactivado de serie): si no salen por VHF, o siempre por las dos bandas, con la ruta que se elija (`WIDE1-1`). «Probar la emisión por LoRa» emite un estado de prueba. Respeta `SAT_APRS_TX`.
  - **Paso a APRS-IS** de lo oído por LoRa (desactivado de serie), con las reglas de un iGate de solo recepción (no pasa `TCPIP`, `NOGATE`, `RFONLY`, consultas ni terceros que ya vinieron de internet).
  - Ajustes en la propia pantalla (`/api/radio/lora`, `/api/radio/lora/config`, `/api/radio/lora/orden`, solo el administrador): `loraEquipos`, `loraIntervalo`, `loraRuta`, `loraIgate`, `loraRespaldo`, `loraSiempre`.
- Comprobado con 212 pruebas, comprobación de tipos y la consola en marcha contra un tracker de pega (TNC KISS por TCP y `/api/status`), con captura de la pantalla. **Sin probar con un tracker de verdad**: falta ver el enlace con la placa, el `/api/status` del firmware nuevo y una emisión real por LoRa.

## [v1.54.0] - 2026-11-22
- **Radio · WX3in1**, pantalla nueva para el Microsat WX3in1 Plus 2.0 de la estación (firmware v1.13), según la vista previa aprobada.
  - **Sesión telnet** permanente: `print version`, `print stats`, `print voltage` y `print rfheard` cada minuto y los mensajes de depuración que se elijan. Recibidas y repetidas por minuto (mensajes «(RF)» y «(DIGI)» del equipo), eficiencia de decodificación, tensión, estaciones oídas y registro filtrable. Lo que el equipo escribe y la consola no reconoce se enseña tal cual (administrador), no se supone.
  - **Configuración (wx3cfg)**: se carga el `.cfg` del equipo y se comprueba con `tools/wx3cfg.py` 1.1.0, de [EA7JRS/wx3in1](https://github.com/EA7JRS/wx3in1) (mismas reglas que el Configurador v1.13 y buenas prácticas APRS); copia corregida para cargar por USB y calculadora de passcode.
  - **Reparto de funciones** entre Direwolf, aprx y el WX3in1 (digipetidor, iGate, APRS-IS a radio, balizas, parte meteorológico, avisos) y aviso de choques: dos digipetidores, dos pasarelas de APRS-IS a radio, la misma baliza o dos partes meteorológicos. «Digi solo en el WX3in1» comenta las líneas `DIGIPEAT` de `direwolf.conf` (con copia) y reinicia Direwolf; «Digi solo en Direwolf» descarga el `.cfg` sin digipetidor.
  - **Vía de emisión de respaldo** (desactivada de serie): un aviso urgente que Direwolf no acepta sale por el servidor APRS-IS simple del WX3in1. Respeta `SAT_APRS_TX`.
  - **Statistics upload**: la consola recibe en `/wx3in1/estadisticas` las estadísticas que manda el equipo y las guarda tal cual (su formato no está documentado). Solo del propio equipo o de la red local.
  - Ajustes en la propia pantalla (`/api/radio/wx3in1/config`, solo el administrador): `wx3in1Equipo`, `wx3in1Telnet`, `wx3in1Usuario`, `wx3in1Clave` (secreta), `wx3in1Depuracion`, `wx3in1Intervalo`, `wx3in1IsPuerto`, `wx3in1IsUsuario`, `wx3in1IsClave` (secreta), `wx3in1Respaldo`.
- Necesita `python3` en el equipo para comprobar el `.cfg` (Debian lo trae).
- Comprobado con 204 pruebas, comprobación de tipos, compilación y la consola en marcha contra un WX3in1 de pega (telnet con negociación, usuario y contraseña, depuración continua, servidor APRS-IS simple y petición HTTP de estadísticas), con captura de la pantalla. **Sin probar con un WX3in1 de verdad**: el formato de `print stats` y `print rfheard` no está documentado, y lo que no se reconozca se verá en «Ver las respuestas tal cual».

## [v1.53.0] - 2026-11-22
- **KiwiSDR** (HF y propagación): un receptor de onda corta de la red como fuente, solo de recepción, en dos canales suyos.
  - **APRS de onda corta** a 300 baudios: el sonido va a un segundo Direwolf que solo escucha (sin PTT, KISS en el puerto 8011) y las tramas entran en Tramas y Estaciones como las de radio; no se contestan. De serie 10 147,6 kHz USB.
  - **Propagación medida con las balizas NCDXF / IARU**: nivel de cada baliza en su ranura de diez segundos y decibelios sobre el ruido, en las cinco bandas (una vuelta, 15 minutos). La baliza se reconoce por la hora, no por su indicativo.
  - Ajustes en el propio panel (`/api/kiwi`, `/api/kiwi/config`, solo el administrador): `kiwiEquipo`, `kiwiPuerto`, `kiwiClave` (secreta), `kiwiAprs`, `kiwiAprsKhz`, `kiwiAprsBanda`, `kiwiIbp`.
- Cliente KiwiSDR propio (`server/radio/kiwi.ts`), con el protocolo del cliente de referencia, kiwiclient; el mismo de Wefax 0.4.0 y Navtex 1.8.0.
- Comprobado con 196 pruebas, comprobación de tipos, compilación y la consola en marcha contra un KiwiSDR de pega (tramas APRS de 300 baudios generadas con `gen_packets` y descodificadas por Direwolf; niveles de baliza simulados). **Sin probar con un KiwiSDR de verdad** ni con señales del aire. Un KiwiSDR no recibe VHF ni 433 MHz.

## [v1.52.0] - 2026-11-22
- HF y propagación: **circuito de onda corta con VOACAP** (`/api/hf/circuito`). **Motor propio**: con VOACAP instalado en este equipo (`sudo sh tools/instalar-voacap.sh`, opcional) se calcula aquí, hasta la posición de la consola, sin depender de ningún otro equipo; si no lo está, se le pide a [Wefax](https://github.com/EA7JRS/Wefax) 0.3.0, que lo calcula hasta su receptor. De una posición o localizador, en una frecuencia o en las bandas de aficionado de HF; fiabilidad de ahora, horas buenas y tira de 24 horas. Y **últimas cartas de radiofacsímil** (`/api/wefax/cartas`), con enlace a cada una.
- **Aviso de clima espacial a Wefax y Navtex**: las escalas oficiales de la NOAA (R, S, G) se envían a los receptores de la red cuando cambian y cada media hora (ajuste `space.wx` de Wefax 0.3.0 y Navtex 1.7.3), para que avisen de un apagón de radio o una tormenta que la predicción mensual no ve.
- Ajustes nuevos (Marítimo > NAVTEX): `wefaxUrl`, la dirección de Wefax, y `voacapManchas`, para fijar a mano el número de manchas solares del motor propio. Sin escribirlo se usa **la media de los cerca de 30 días** de los índices solares diarios de la NOAA que la consola ya descarga (o, si faltara, la estimación con el flujo: (flujo − 64) × 0,9), y la pantalla dice de cuántos días es. Es la misma regla que usa Wefax.
- El motor propio supone 145 dBW de ruido (residencial), 40 dB-Hz de umbral, transmisor sin ganancia y antena de látigo en recepción. Es la mediana del mes.
- Comprobado con 188 pruebas, comprobación de tipos y compilación; el módulo del motor propio, ejecutado contra voacapl 16.1207W real (mismos resultados que Wefax). **Sin probar** la pantalla en un navegador, la ruta con la consola en marcha, el instalador en ningún equipo ni la consulta a un Wefax en marcha.

## [v1.51.0] - 2026-11-22
- NAVTEX: **los mensajes ya no se pueden borrar a mano** (OMI MSC.508(105), 6.1.1: el usuario no debe poder borrar mensajes de la memoria). Fuera «Borrar este mensaje» y «Borrar todos»; `/api/navtex/borrar` contesta 410. Salen solos al cumplir su plazo. Va con Navtex 1.7.0, que hace lo mismo.
- NAVTEX · Receptores: ajuste **Gestión de alertas del puente** de la salida NMEA 0183 del receptor (`nrx.bam`; sentencias `ALF`, `ALC`, `HBT` y orden `ACN`; Navtex 1.7.0).

## [v1.50.0] - 2026-11-22
- NAVTEX: **«Conservar siempre»** en cada mensaje (OMI MSC.508(105), 6.1.2). Lo marca en la consola y en el receptor, no se borra al cumplir el plazo y «Borrar todos» lo respeta. Hasta 50. Pide Navtex 1.5.0 o posterior para que el receptor también lo conserve.
- Probado contra el servidor real de Navtex 1.6.0.

---

## [v1.49.1] - 2026-11-22
- Normas al día: la norma de funcionamiento NAVTEX vigente de la OMI es la MSC.508(105) (equipos instalados desde 2024), que sustituye a la MSC.148(77); se cita ya en la consola y en la documentación. `docs/NORMAS.md` tiene una tabla nueva con la edición vigente de cada norma y cuáles se han leído.
- Sin cambios de funcionamiento. El marcado de mensajes para conservarlos siempre, nuevo en Navtex 1.5.0, se hace por ahora en la interfaz de Navtex.

---

## [v1.49.0] - 2026-11-22
- NAVTEX: la pantalla enseña la **alarma de búsqueda y salvamento** del receptor (mensajes del tema D sin reconocer) y permite reconocerla (administrador). Pide Navtex 1.3.0.
- Receptores: se puede elegir la forma de la sentencia `NRX` del receptor, Furuno o IEC 61097-6.
- Documentación: nuevo `docs/NORMAS.md`, con las normas, especificaciones y reglamentos que contempla la consola (radioaficionado, APRS, AX.25, NAVTEX, AIS, NMEA 0183 y 2000, CAP), lo que aplica de cada una y lo que no.

---

## [v1.48.0] - 2026-11-22
### NAVTEX: borrar, guardar y sacar los mensajes
Pide el receptor [Navtex](https://github.com/EA7JRS/Navtex) 1.2.0 para lo nuevo; con uno anterior todo sigue como en la v1.47.
- **Borrar** un mensaje o todos desde la consola (administrador): se borra también en el receptor, que lo recuerda 72 horas para no traerlo de vuelta.
- **Guardar** todos los mensajes en un archivo de texto o CSV.
- **Repeticiones y calidad.** Navtex 1.2 ya no guarda otra vez lo que la estación repite (OMI MSC.148(77)); la consola le pregunta qué ha vuelto a oír y mantiene vigente el aviso. Cada mensaje dice cuántos caracteres llegaron mal, si la recepción se da por buena (menos de un 4 %) y si llegó en el turno de su letra; una copia buena sustituye a la que llegó con errores.
- **NMEA 0183.** Desde Receptores se ajustan la conservación de los mensajes y la salida `NRX` del receptor (UDP y TCP).
- **NMEA 2000.** Nueva opción «NAVTEX: texto entero» (apagada de serie): cada mensaje nuevo de las estaciones que se siguen sale al bus por partes numeradas en el PGN 129802, una cada dos segundos. NMEA 2000 no tiene mensaje propio de NAVTEX. Solo lo recién recibido; nada por radio.
- Probado con el servidor real de Navtex 1.2.0 y grabaciones de prueba. La salida al bus NMEA 2000 solo está probada con las comprobaciones del programa: falta verla en un bus real y en el plotter.

---

## [v1.47.0] - 2026-11-22
### Navtex, integrado en la consola
- **Pantalla completa.** Radio → NAVTEX e Inmarsat muestra ahora lo que antes solo estaba en la interfaz del receptor [Navtex](https://github.com/EA7JRS/Navtex): el estado de sus dos receptores, sus ajustes (equipo, banda, horario de onda corta, toma de antena, número de serie, muestreo directo, ganancia, corrección, alimentación de la antena), la última señal en cada frecuencia y su GPS. Los ajustes se cambian desde la consola, solo con la sesión de administrador; la consola solo manda al receptor claves y valores conocidos.
- **Estaciones.** Tabla de estaciones de 518, 490 y 4209,5 kHz ordenada por distancia a la posición de la consola, con alcance, próxima emisión y «emitiendo ahora»; próximas emisiones de las estaciones que se siguen; y elegir las letras que se siguen desde la propia tabla, o de una vez las que quedan en alcance. Los datos son los que publica el receptor (UIT, Tabla 4, 2017; Wikipedia para 4209,5 kHz).
- **Posición compartida.** Si el receptor no tiene GPS, la consola le da la posición de la estación (nunca la de fábrica). Se puede quitar.
- **Mapa.** Nueva capa «Estaciones NAVTEX»: rombo relleno si la estación queda en alcance, hueco si no.
- **Instalación.** `sudo sh tools/instalar-navtex.sh` instala o actualiza Navtex en el mismo equipo, elige un puerto libre para su interfaz (8081 en adelante, solo local salvo `--red`), instala sus servicios y enciende NAVTEX en la consola.
- **Se retira la cadena antigua.** Desaparecen `tools/navtex/` (rtl_fm o rx_fm + descodificador de fldigi), el servicio `sat-navtex` y la lectura del archivo `/var/lib/sat-aprs/navtex.txt`, con sus ajustes `navtexArchivo` y `navtexOrigen`. Navtex es la única vía. Quien la usara: `sudo sh tools/instalar-navtex.sh`, que la desinstala y deja Navtex en su lugar; hasta entonces NAVTEX avisa de que falta la dirección del receptor.
- Probado con el servidor real de Navtex 1.1.0 y mensajes descodificados de grabaciones de prueba. No probado todavía con el instalador en un equipo con systemd ni con mensajes recibidos por antena.

---

## [v1.46.1] - 2026-11-22
- NAVTEX desde un receptor en la red: se reconoce el canal de onda corta, 4209,5 kHz, que el receptor EA7JRS/Navtex puede escuchar en lugar de 518 y 490 kHz.

---

## [v1.46.0] - 2026-11-22
### NAVTEX desde un receptor en la red
- Radio → NAVTEX e Inmarsat: nuevo origen «Receptor Navtex en la red», además del descodificador en el propio equipo. La consola pregunta cada minuto a un receptor del fork [EA7JRS/Navtex](https://github.com/EA7JRS/Navtex) (SDRplay o RTL-SDR, en otro equipo) por los mensajes nuevos. Ese receptor escucha 518 y 490 kHz a la vez, y cada mensaje dice por cuál llegó.
- Los mensajes entran en la misma cadena que los demás: lista, mapa si traen posición, avisos por APRS y salida NMEA 2000.
- El estado dice si el receptor contesta, qué equipo usa y si está recibiendo muestras; si no, el motivo (no se encuentra el equipo, rechaza la conexión, no contesta).
- Una copia completa de un mensaje sustituye a la cortada recibida antes.
- Solo se admite la dirección del equipo (`http://equipo:puerto`), y solo la cambia el administrador.
- Probado con el servidor real del fork y una recepción real de Mondolfo Radio; **sin probar aún entre los dos NUC de la estación**.

---

## [v1.45.1] - 2026-11-20
### Documentación al día tras la primera prueba en el equipo real
- README y arquitectura: la tabla de estado dice qué se comprobó el 20-11-2026 en el NUC contra los servicios reales (IGN, AEMET, NOAA, FIRMS, CAMS, GIRO, Sensor.Community, CelesTrak, tsunami.gov, NHC, EMSC, EFFIS, EONET y Pat) y qué sigue sin probar: MeteoAlarm, EURDEP, NWS, WeatherAPI, y todo lo que necesita radio, GPS, SDR, bus NMEA 2000 o una estación meteorológica.
- Manual: versión al día y seis casos nuevos en «Solución de problemas», salidos de esa prueba (token, puerto ocupado por la versión antigua, permiso de `sudo`, APRS-IS con servidor local, WeeWX en simulador, vuelta atrás tras actualizar).
- Dos textos de la consola que hablaban de «simular una estación» con WeeWX, corregidos: los datos de Internet se presentan como lo que son.

---

## [v1.45.0] - 2026-11-20
### El proyecto pasa a llamarse S.A.T.-APRS+
- Nombre visible nuevo en la consola, el README, el manual, la arquitectura y los textos por defecto: **S.A.T.-APRS+**, en línea con el ecosistema APRS LoRa+.
- No cambia nada de la instalación: el repositorio, el servicio `sat-aprs`, la carpeta `/opt/sat-aprs`, los archivos `sat_*.json` y la identificación ante APRS-IS (`vers SAT-APRS`) siguen igual. Basta con actualizar.

---

## [v1.44.7] - 2026-11-20
### WeeWX en modo simulador no cuenta como estación
- En la primera prueba real, WeeWX estaba con el controlador `Simulator` y la consola tomaba sus valores inventados como medida propia. Ahora, si `weewx.conf` dice `station_type = Simulator`, la consola **no usa** esos datos (ni en el parte meteorológico, ni en los umbrales, ni como observación propia), lo anota en el registro y lo avisa en rojo en Estación → WeeWX.
- `weewx.conf` se lee con el permiso de `sudo` del usuario de servicio cuando no es legible directamente: antes la pantalla decía que no lo encontraba.

---

## [v1.44.6] - 2026-11-20
- Tramas APRS, Direwolf, aprx e historial: los textos en UTF-8 se muestran con sus tildes («Región», no «RegiÃ³n»). Las tramas se siguen guardando y descodificando byte a byte.

---

## [v1.44.5] - 2026-11-20
### APRS-IS: motivo del fallo y reconexión más rápida
- Si el servidor APRS-IS rechazaba la conexión y estaba puesto como `localhost`, la consola mostraba «desconectado» sin motivo (Node da un error agregado sin mensaje al fallar IPv6 e IPv4). Ahora dice el motivo (`connect ECONNREFUSED …`).
- La espera entre reintentos crecía hasta 5 minutos; ahora, hasta 1. Con el servidor de vuelta, la consola reconecta en un minuto como mucho.

---

## [v1.44.4] - 2026-11-20
- El acceso de administrador de la barra superior se lee: botón «Entrar como administrador» de tamaño normal, en vez de un rótulo de 9 px que decía «Modo demostración · Acceder».

---

## [v1.44.3] - 2026-11-20
### Pat ya no se busca en /root
- La comprobación de archivos de configuración buscaba el `config.json` de Pat en `/root/.config/pat/`, de cuando la consola corría como root, y dejaba «sudo: a password is required» en el registro al arrancar. Ahora lo busca en la carpeta del usuario del servicio (`pat@usuario` → `/home/usuario/.config/pat/config.json`) y solo usa `sudo` para los archivos de `/etc`.

---

## [v1.44.2] - 2026-11-20
### Instalación: permisos y token de administrador
- `tools/instalar.sh` instala `/etc/sudoers.d/sat-aprs` (de `tools/sudoers-sat-aprs`, comprobado con `visudo`): lo justo para que el usuario de servicio lea y escriba `direwolf.conf`, `aprx.conf`, `axports` y `weewx.conf`, reinicie esos servicios y vacíe sus registros. Sin esto, la consola como `satapr` daba «sudo: a password is required».
- Si `.env` no tiene `SAT_ADMIN_TOKEN`, crea uno y lo muestra al final: sin él la consola no guarda cambios.

---

## [v1.44.1] - 2026-11-20
### Instalación: el servicio web antiguo
- `tools/instalar.sh` retira también `sat-aprs-web.service` y `sat-aprs-py.service`, nombres de instalaciones anteriores. En la primera prueba real, el servicio web antiguo seguía ocupando el puerto 3000 y el nuevo no podía arrancar.
- `tools/actualizar.sh` ya no da por bueno que «alguien» conteste en el puerto: comprueba que quien escucha es el servicio de la consola y, si es otro proceso, lo dice y lo señala.

---

## [v1.44.0] - 2026-11-20
### Instalar y actualizar con una orden, por SSH
- **`tools/actualizar.sh`**: `sudo sh tools/actualizar.sh` hace copia de la configuración y del historial (`copias/<fecha>/`, las diez últimas), trae la versión nueva, instala dependencias y compila con la consola en marcha, reinicia el servicio y comprueba que responde. Si la compilación falla, vuelve a la versión anterior sin parar la consola. `--comprobar` solo dice si hay versión nueva; `--forzar` y `--aqui` recompilan y reinician.
- **`tools/instalar.sh`**: monta la consola (Node.js 22, `.env`, usuario de servicio, unidad de systemd, compilación y arranque) y retira los restos de una instalación antigua: el servicio y los archivos del agente Python. Con `--desde <carpeta antigua>` trae la configuración y el historial. Se puede repetir.
- README: procedimiento de actualización rehecho, migración desde una instalación antigua y tabla de órdenes útiles por SSH.

---

## [v1.43.0] - 2026-11-20
### Salud, con datos reales
- **Avisos → Salud rehecha** (`src/pages/Salud.tsx`). La pantalla anterior era de las antiguas: avisos de AEMET escritos a mano (con fecha de junio que se cambiaba a la de hoy), temperaturas de muestra cuando fallaba la consulta, umbrales por provincia sin fuente, un «nivel de riesgo» calculado por la consola y un botón que inyectaba un objeto con un indicativo ajeno. Fuera todo.
- Ahora muestra: los avisos de temperatura en vigor de la cadena de Avisos, las máximas y mínimas previstas en la posición de la estación (Open-Meteo) y el acceso a los dos paneles oficiales, el **índice Kairós** del Instituto de Salud Carlos III y **Meteosalud** del Ministerio de Sanidad.
- Kairós y Meteosalud no publican sus datos en un formato legible: la consola enlaza a ellos y no muestra ni difunde niveles propios.
- Anotado en la arquitectura, para la campaña: el Índice de Riesgo de Incendio Forestal de Andalucía (REDIAM).

---

## [v1.42.0] - 2026-11-20
### Sismos de fuera de España (EMSC)
- **`server/fuentes/emsc.ts`**: servicio FDSN del Centro Sismológico Euro-Mediterráneo (SeismicPortal, CC BY 4.0, sin clave). Sismos de M3,5 o más de las últimas 24 horas a menos de 15° de la estación.
- Mismo lector y mismos niveles que la app Android (`OfficialAlerts.emsc`, `quakeLevel`): la gravedad sale de la magnitud y de la distancia. De serie se difunde desde amarillo.
- Los sismos que ya da el IGN no se repiten (menos de 60 km, 90 s y 0,6 de magnitud de diferencia).
- Apagada de serie; en Sistema → Configuración → Claves API & Puertos → Más fuentes de avisos.

---

## [v1.41.0] - 2026-11-20
### Peligro de incendio y áreas quemadas de EFFIS
- **`server/fuentes/effis.ts`**, del Sistema Europeo de Información sobre Incendios Forestales (Copernicus EMS, datos CC BY 4.0, sin clave):
  - **Peligro de incendio**: el índice FWI oficial en el punto de la estación, hoy y los dos días siguientes (WMS `mf010.fwi`, pedido como GeoTIFF float32 y leído sin dependencias). Aviso con peligro alto (amarillo), muy alto (naranja) y extremo (rojo); de serie se difunde desde naranja. Un ráster todo a cero es «sin datos», no «sin peligro».
  - **Áreas quemadas**: perímetros cartografiados casi en tiempo real (WFS `nrt.ba.poly`) dentro del radio (100 km) y de los últimos 10 días, con sus hectáreas; objeto APRS en el centro.
- Las peculiaridades de los servidores de EFFIS (errores con HTTP 200, capa `mf010` en vez de la documentada, WFS sin filtro de fecha) están tomadas de `agent-engineering-studio/effis-client`; las pruebas usan sus respuestas reales del 2-11-2026.
- Apagadas de serie; en Sistema → Configuración → Claves API & Puertos → Más fuentes de avisos. `/api/fuentes/peligro-incendio`.
- Revisadas y no conectadas: el mapa de la Red de Alerta Nacional (sus capas son AEMET, IGN y este mismo peligro de incendio) e incendiosespaña.es (sin API ni licencia de datos).

---

## [v1.40.0] - 2026-11-20
### Las fuentes de avisos de la app Android
- **Tsunamis de tsunami.gov** (`server/fuentes/tsunami.ts`): los feeds Atom del PTWC y del NTWC, con el lector de la app (`OfficialAlerts.tsunamiEntry`). La categoría es la del centro de alerta: alerta (rojo), aviso (naranja), vigilancia (amarillo), información. Entran en Avisos con radio (3000 km de serie) y objeto en el epicentro. **Sustituye** a la lista anterior, que tomaba los seísmos del USGS con marca de tsunami y les ponía la gravedad según la magnitud.
- **NWS de EE. UU.** (`server/fuentes/nws.ts`, `api.weather.gov/alerts/active?point=`): avisos en vigor para el punto de la estación; los de tornado salen como TORNADO, los de huracán como HURACAN. Solo cubre EE. UU.: fuera, la fuente dice «fuera de cobertura». Apagada de serie.
- **NASA EONET** (`server/fuentes/eonet.ts`): sucesos naturales abiertos (inundaciones, tormentas severas, volcanes, deslizamientos, incendios) con su última posición; sin gravedad propia, entran en amarillo dentro del radio (300 km). Apagada de serie.
- Se encienden en Sistema → Configuración → Claves API & Puertos → Más fuentes de avisos; reglas editables desde Avisos.
- Tornados en España y Protección Civil siguen sin fuente pública.

---

## [v1.39.0] - 2026-11-20
### NAVTEX e Inmarsat-C con SDR
- **Radio → NAVTEX e Inmarsat**, pantalla nueva: estado de los dos receptores, mensajes con su tema o prioridad, texto completo y ajustes.
- **NAVTEX** (`server/radio/navtex.ts`, `tools/navtex/`): `navtex.sh` sintoniza 1 kHz por debajo de 518 kHz en USB con `rtl_fm` (RTL-SDR; V3 con muestreo directo) o `rx_fm` (SoapySDR: SDRplay RSPdx-R2 y otros) y pasa el audio a `navtex_rx_from_file` de fventuri/navtex (el descodificador de fldigi), que escribe en `/var/lib/sat-aprs/navtex.txt`. `instalar.sh` lo compila e instala el servicio `sat-navtex`. La consola lee el archivo según crece y separa los mensajes `ZCZC … NNNN` (estación, tema, número, fecha-hora y posición). Probado con la grabación real de Mondolfo del propio descodificador, remuestreada a 12 kHz.
- **Inmarsat-C EGC** (`server/radio/egc.ts`): escucha por UDP (127.0.0.1:5556, el puerto de serie de InmarScope) las líneas JSON de InmarScope, completas o compactas; junta los trozos de un mismo mensaje.
- Los dos pasan a **Avisos** (grupos «navtex» y «egc»): NAVTEX por tema (D rojo, B naranja, A y L amarillo), EGC por prioridad (Socorro, Urgencia, Seguridad). La primera posición del texto (`36-05.2N 005-21.0W` y variantes, `server/core/posicionTexto.ts`) sitúa el objeto APRS y aplica el radio; sin posición, solo boletín. Vienen apagados; de serie se difunde desde naranja.
- Los mensajes se guardan en el historial y alimentan la lista de radioavisos de las notificaciones del navegador.
- **Fuera la entrada UDP antigua de Inmarsat** (puerto 9999, en todas las interfaces): ponía «NAVAREA III» y «LES-NUC-UDP» cuando el mensaje no traía área ni emisor, y daba descripciones erróneas de los códigos de servicio.

---

## [v1.38.0] - 2026-11-20
### Tres fuentes nuevas sin clave
- **MeteoAlarm** (`server/fuentes/meteoalarm.ts`): los avisos oficiales de los servicios meteorológicos europeos, del feed Atom de cada país (`feeds.meteoalarm.org`). El feed no trae el contorno de las zonas: la estación sigue las que se le indiquen, por código EMMA_ID o por nombre, y en pantalla aparecen las zonas que han tenido aviso para elegirlas. Con AEMET activado no repite las zonas de España. Objeto en la estación con nombre estable por zona y fenómeno (`PT014VI`).
- **Ciclones tropicales del NHC** (`server/fuentes/ciclones.ts`, `CurrentStorms.json`): clase, categoría, intensidad y presión del último aviso; objeto en el centro del ciclón (`HUOPHELIA`). Depresión amarillo, tormenta naranja, huracán rojo; 1000 km de radio de serie.
- **Radiactividad ambiental de EURDEP** (`server/fuentes/radiacion.ts`): la última tasa de dosis gamma de cada sonda, de los datos abiertos de la BfS (WFS `opendata:eurdep_latestValue`). Avisa desde el umbral (0,3 µSv/h de serie) dentro del radio (100 km); naranja desde 3 veces y rojo desde 10. Dice «sin validar» cuando lo está. La sonda más cercana alimenta la regla «Radiación» de las notificaciones, que hasta ahora no tenía dato.
- Las tres vienen **apagadas** y se ajustan en Sistema → Configuración → Claves API & Puertos → **Más fuentes de avisos**; sus reglas, también desde el aviso.
- `/api/fuentes/meteoalarm/zonas` y `/api/fuentes/radiacion`.
- **Tornados y Protección Civil, sin fuente**: el SPC de la NOAA solo cubre EE. UU. y no se conoce un feed público de los avisos de Protección Civil (ES-Alert llega por difusión celular a los móviles). Sin fuente real no se conecta nada.
- Avisos de WeatherAPI: el detalle dice qué es y el título dónde, como en AEMET. Antes la lista mostraba «aviso oficial» o «pronostico» como titular.

---

## [v1.37.0] - 2026-11-20
### Historial en SQLite
- **`sat_historial.db`** (`server/sistema/historial.ts`, con `node:sqlite` de Node.js 22.13 o posterior, sin dependencias nativas). Sobrevive a un reinicio:
  - las **tramas** que entran por radio y por APRS-IS y las que salen, con el motivo si no se emitieron;
  - el **registro** de la consola;
  - la **mensajería**: recibidos, enviados y el número de mensaje. Lo que estaba pendiente de acuse al apagar queda «sin acuse»: no se reintenta solo.
- **Retención**: tramas 7 días y registro 30, de serie; se cambia en Sistema → Equipo → Historial en disco. Lo más antiguo se borra cada 6 horas.
- **Radio → Tramas APRS → Historial**: búsqueda en disco por indicativo o texto, días y vía; exportación a CSV para el administrador (`/api/historial/tramas?formato=csv`). El registro también se exporta (`/api/historial/registro`).
- Si este Node.js no trae `node:sqlite`, la consola sigue en memoria y lo dice en Sistema → Equipo.
- **Fuera tres respuestas fingidas** para quien no es administrador: vaciar los registros de un servicio y escribir un archivo `.conf` decían «hecho (simulado)»; ahora responden que hace falta la sesión de administrador. Al cambiar la configuración sin sesión, el registro dice que el cambio queda solo en memoria.
- Node.js 22.13 o posterior (`engines`); `npm start` oculta el aviso de módulo experimental de `node:sqlite`.

---

## [v1.36.0] - 2026-11-20
### Fuera el agente Python: un solo servicio
- **Retirado `aprs_sat.py`**, junto con `aprs_proto.py`, `weather_services.py`, `config.ini.example`, sus pruebas, el trabajo de Python de la CI y `npm run test:py`. Todo lo que se emite sale de la consola, por una única cola con su política de emisión.
- **Lo que solo hacía el agente, ahora en la cadena de avisos** (`server/fuentes/umbrales.ts`), con las mismas reglas, el mismo registro y la misma pantalla de Avisos:
  - **Umbrales de la estación**: viento (o racha), calor, frío y lluvia por hora. Usa la observación real: la propia si es reciente, si no la de Internet; sin observación reciente no hay aviso. Un aviso por tipo y día, con objeto en la estación y boletín `BLN3METEO`.
  - **Pronóstico de WeatherAPI** (con clave): sus avisos oficiales (Extreme → rojo, Severe → naranja, Moderate → amarillo) y los días que pasan los umbrales de viento, helada y lluvia, hasta 3 días.
  - Los dos vienen **apagados** y se encienden en Sistema → Configuración → Claves API. Sus umbrales se cambian también desde el aviso, en Avisos (`grupo` «umbrales» o «pronostico» en `/api/avisos`).
  - Fuera los campos de la «fuente de datos del clima local» y su intervalo, que solo usaba el agente (admitía «simulated»).
- **`config.ini`**: ya no se escribe al guardar. Si no hay `sat_config.json`, se importa una vez al arrancar, para las instalaciones que vienen del agente. Antes mandaba sobre la configuración de la consola en cada arranque.
- **Sistema → Configuración**: fuera el exportador del script del agente y el gráfico de bloques que lo ponía en el centro.
- README, manual y arquitectura al día: un único servicio de systemd, y cómo retirar el del agente al actualizar.

---

## [v1.35.1] - 2026-11-20
### Dos restos
- **Reglas de notificación sin valores supuestos**: sin datos meteorológicos, la temperatura, el viento, la lluvia, la humedad y la presión quedan «sin dato» y su regla no salta. Antes tomaban 22,5 °C, 4 nudos, 0 mm, 50 % y 1016,2 hPa. Lo mismo con la radiación, que no tiene fuente.
- **Ajustes de los códigos SOS** (`!EMERGENCY!`, `!PRIORITY!`, `!SPECIAL!`: color, sonido y zoom del aviso en pantalla), de vuelta en **Sistema → Configuración → Alertas e Inundación**. Se habían quedado sin pantalla al retirar los paneles de demostración de Pruebas. El botón «Guardar» ya no dice que guarda en la nube: se guarda en este navegador.

---

## [v1.35.0] - 2026-11-20
### HF y sismos
- **Rayos X en la LUF, solo de día**: la absorción de la capa D por una fulguración (clase X 8 MHz, M 4, C 1,5, B 0,5 con el sol en el cenit) crece con cos(cenit)^0,75 y es cero de noche, como el modelo D-RAP de SWPC (`absorcionRayosX` en `server/propagacion.ts`). Antes, `server.ts` la sumaba entera también de noche y el monitor de propagación ponía una décima. Es la misma fórmula que usan el tracker APRS LoRa+ y su app.
- **ShakeNet (Raspberry Shake) como cuarta fuente de sismos**, tras IGN, IGN-RSS y USGS: servicio FDSN de QuakeLink en formato texto, mismo recuadro de la Península, últimos 7 días (`extraerSismosFdsnTexto`). Son localizaciones automáticas de la red Raspberry Shake; sus condiciones de uso no están publicadas.
- Sismos del USGS: la regla que deja solo el lugar («12 km NE of Granada, Spain» → «Granada, Spain») ya no recorta nombres como «Strait of Gibraltar».

---

## [v1.34.0] - 2026-11-15
### Fuera lo innecesario
- **Fuera la pantalla Avisos · Coordinación** (`CecopDashboard`, unas 3800 líneas). Era un cuaderno que se guardaba solo en el navegador, con matriz de riesgo, cola de firma, unidades y actividad de canal sin fuente detrás. Lo útil ya está en su sitio: los avisos en «En vigor», el grupo ARTS, la mensajería y el equipo en Radio · Principal.
- Fuera también lo que solo la alimentaba:
  - el «nivel CECOP» y sus notificaciones;
  - la lista local de paquetes APRS del navegador (`sat_aprs_packets`).
- **Aviso de mensaje recibido**: «Reconocer» marca como leídos los mensajes en la mensajería de la estación.
- **Sistema · Pruebas y simulación**: queda solo el terminal de tramas con su inyector (sismo, clima espacial o trama de prueba, que nunca se emiten). Se retiran dos paneles de demostración:
  - `ThreatPollingEngine`, con caudales de ríos que variaban al azar;
  - `AlertMonitor`, con centros de coordinación escritos a mano.
- **Ayuda de la consola rehecha**: las seis secciones con lo que hay en cada una, un botón para ir a cada pantalla y el enlace al manual. Sustituye a la antigua guía de «diez pilares», que tenía un simulador AX.25 con bytes inventados.
- Notificaciones: sin fuente de radiación conectada, la radiación ya no toma un valor supuesto (0,12 µSv/h).

---

## [v1.33.0] - 2026-11-15
### Fuera lo simulado que quedaba en pantallas
- **Radio · Tramas APRS, nueva** (`src/pages/TramasAprs.tsx`, `server/radio/tramas.ts`, `GET /api/radio/tramas`, `POST /api/radio/tramas/analizar`):
  - todo lo que entra por radio (KISS) y por APRS-IS y todo lo que sale, clasificado por tipo y explicado en castellano;
  - las emitidas dicen por dónde salieron o por qué no;
  - filtros por vía, tipo e indicativo;
  - **analizador** de tramas: campos, posición, PHG, altitud, telemetría, terceros, y lo que no cumple. Solo analiza: no emite nada.
  - Fuera la pantalla antigua (`AprsAdaptor`), cuya mensajería marcaba los mensajes como «TRANSMITIDO» sin enviarlos.
- **Aviso de mensaje recibido**:
  - solo salta con los mensajes **para la estación**, no con los de otros que se oyen ni con los acuses;
  - «Responder» **envía de verdad** por la mensajería, con acuse y reintentos; antes no enviaba nada;
  - fuera las coordenadas que mostraba, que eran las de la estación y no las del remitente.
- **Estación · WeeWX, nueva** (`src/pages/Weewx.tsx`, `server/estacion/weewx.ts`, `GET/POST /api/estacion/weewx`):
  - la lectura actual y las últimas 24 h hora a hora, sacadas de la base de datos de WeeWX con `sqlite3` en solo lectura: temperatura, presión con tendencia, humedad, viento y lluvia, con sus extremos;
  - gráficas con lectura al pasar el dedo;
  - lo que dice `weewx.conf`, más «Ver registro» y «Reiniciar servicio».
  - Fuera la consola antigua (`WeewxConsole`), con historial y valores inventados.
- **Sistema · Equipo**: el panel de «sockets» con contadores y eventos aleatorios se sustituye por **los enlaces reales** de la estación (`/api/enlaces`, ampliado): APRS-IS, Direwolf, gpsd, AIS, ADS-B, equipo, rotor, cluster, Pat y NMEA 2000. Fuera también los datos de GPS escritos a mano («gpsd v3.25», «9600 bps»).
- **Fuera el A-GPS simulado**: no había cliente SUPL. Fingía una sincronización «exitosa» al arrancar, cada día y cada 5 minutos sin movimiento. Se retiran la ruta, el temporizador, los ajustes y su tarjeta en Configuración.
- **gpsd**: al arrancar ya no se dan 9 satélites ni un receptor u-blox inventados. Sin gpsd, el estado queda sin fijo y en la posición fija.
- **La posición de la estación ya no se puede falsear**:
  - `POST /api/gpsd/update` solo cambia la **posición fija** (de respaldo); es para el administrador, y si el GPS tiene fijo, se rechaza;
  - antes, tocar una incidencia de tráfico o un sismo «movía» la estación allí como si fuera un fijo de GPS, y eso cambiaba la baliza y el radio de avisos;
  - el botón flotante pone la posición fija en la del dispositivo, con confirmación.
- **Latencia NTP**: si la consola no contesta, no se inventa una medida.
- **Coordinación**: fuera la actividad de canal aleatoria y el ruido añadido a las lecturas de radiación. Queda pendiente de rehacer.
- **Configuración**: fuera la pestaña «Propagación & Radio», que estaba vacía.
- Arreglos de ancho en el móvil en Configuración y Coordinación.

---

## [v1.32.2] - 2026-11-15
### Documentación al día
- **Manual de uso nuevo** ([`docs/MANUAL.md`](docs/MANUAL.md)):
  - primeros pasos y qué se emite y cuándo;
  - cada sección y pantalla de la consola;
  - referencia completa de la consola de comandos;
  - casos de uso (estación fija de alerta, estación móvil, paso de la ISS, grupo de montaña, parte por Winlink, spot del cluster);
  - solución de problemas, y servicios, puertos y archivos.
- **README** reescrito al estado real: qué hace hoy, la consola sección a sección, carpetas del código (`server/radio/`, `server/conectividad/`, `tools/`), seguridad de emisión (un solo transmisor, confirmaciones), requisitos e instalación de Hamlib, can-utils y Pat. Ya no describe funciones simuladas que se retiraron (osciloscopio y espectro de Direwolf, emulación de aprx).
- Las pantallas que aún tienen partes de demostración se dicen claramente: WeeWX, Tramas APRS (su mensajería no se envía), Coordinación, contadores de Sistema → Equipo y A-GPS de Configuración. La pestaña «Propagación & Radio» de Configuración está vacía.
- **ARQUITECTURA.md**: programas con los que convive y estado de cada bloque, actualizados.

---

## [v1.32.1] - 2026-11-15
### aprx desde el fork EA7JRS/aprx
- **`tools/instalar-aprx.sh`**: compila el paquete `.deb` del fork [EA7JRS/aprx](https://github.com/EA7JRS/aprx) (que compila en Debian 13 con GCC 14 y recupera el `kiss.c` original) y lo instala en lugar del aprx de Debian, respetando `/etc/aprx.conf`. Lo retiene en apt (`apt-mark hold`) para que no vuelva el de la distribución, se asegura de que arranque (`STARTAPRX="yes"`) y avisa si falta el registro de radio (`rflog`) que usa la pantalla Radio · aprx.
- README: la instalación ya no toma aprx de Debian; usa el script (paso 1.2).

---

## [v1.32.0] - 2026-11-15
### Radio · Winlink: el correo de Pat, de verdad
- **Pantalla nueva** (`src/pages/Winlink.tsx`, `server/radio/pat.ts`, `GET/POST /api/radio/winlink`): habla con la **API HTTP de Pat** («pat http», de serie en `http://127.0.0.1:8080`). Estado del servicio y de Pat, enlace (llamando, conectado, con quién), y el buzón real: entrada, salida y enviados.
- **Leer** un mensaje (se marca como leído en Pat), **responder** con cita y **redactar**: el mensaje queda en la bandeja de salida de Pat; no se transmite al pulsar.
- **Sesión**: con los alias de conexión de Pat o una URL (`ax25:///…`, `varafm:///…`, `telnet`), con confirmación que avisa de que Pat transmitirá por radio. Muestra el resultado (recibidos o fallo) y se puede cortar. Durante la sesión se sigue el enlace cada 3 s.
- **Pasarelas RMS** por modo y banda, con distancia, rumbo, frecuencia y predicción, de la lista que Pat descarga de winlink.org.
- El correo solo se enseña al administrador; a los demás, las cuentas. Las contraseñas de las URL de conexión no salen de la consola.
- Ajustes nuevos `patUrl` y `patServicio` (por ejemplo `pat@usuario`, como lo instala el paquete de Debian); «Ver registro» y «Reiniciar servicio» usan ese servicio. Los correos nuevos de entrada quedan en el registro de la consola.
- Si Pat no contesta, se dice cómo arrancarlo; no hay buzón de ejemplo.
- Fuera el buzón simulado del servidor (`patState`, la inyección `TRIGGER_WINLINK_SYNC` y `patStatus` en la telemetría) y la pantalla antigua (`PatAx25Console`).

### Sistema · Configuración: direwolf.conf sin CBEACON
- El generador de `direwolf.conf` ya no escribe una `CBEACON` (que transmitía por su cuenta, fuera de la política de emisión) y añade `LOGDIR /var/log/direwolf`, como la plantilla del servidor. Fuera los campos de texto e intervalo de esa baliza.

---

## [v1.31.0] - 2026-11-15
### Radio · aprx: solo lo que aprx da de verdad
- **Pantalla nueva** (`src/pages/Aprx.tsx`, `server/radio/aprx.ts`, `GET/POST /api/radio/aprx`): estado del servicio, de la **pasarela a APRS-IS** (si está pasando tramas o las pierde por falta de conexión), del digipeater y de las interfaces; recibidas, pasadas a APRS-IS, descartadas y repetidas en la última hora; tráfico por minuto; cifras **por interfaz**; registro en directo con el resultado de cada trama (a APRS-IS, sin APRS-IS, rechazada, repetida, baliza, de APRS-IS) y qué es.
- Todo sale de `aprx.conf` y del **registro de radio de aprx** (`rflog`), que la consola sigue según crece, también tras rotarlo. Sin registro, la pantalla explica cómo activarlo y no muestra cifras. El passcode no se muestra.
- «Ver registro» (`journalctl -u aprx`) y «Reiniciar servicio» (administrador, con confirmación).
- Fuera la pantalla antigua, con latencias, señal y ruido simulados (`AprxConsole`). El editor de `aprx.conf` sigue en Sistema → Configuración → «Archivos .conf Debian».
- Las piezas comunes de las pantallas de servicios (estado, cifras, gráfica por minuto) pasan a `src/components/radio/Piezas.tsx`.

---

## [v1.30.0] - 2026-11-15
### Satélites: corrección de Doppler continua
- **«Seguir Doppler»** en cada transmisor de un satélite (`server/radio/doppler.ts`): el equipo se resintoniza solo durante el paso. La **bajada** se corrige a f·(1 − v/c) y, si el transmisor tiene **subida** distinta y el equipo acepta split (`S 1 VFOB` / `I <frecuencia>` de rigctld), también la subida a f·(1 + v/c). Si el equipo no acepta split se dice y solo se corrige la bajada.
- Pone el modo del equipo según el del transmisor (FM para FM, AFSK, FSK, GMSK…; CW; USB para BPSK) y solo vuelve a mandar la frecuencia cuando el cambio pasa de 1 kHz en FM o de 50 Hz en los demás.
- Termina sola al ponerse el satélite, o **si se mueve el dial del equipo**; al terminar quita el split. El panel muestra la frecuencia corregida, el desvío y cuándo termina.
- Consola: `sat tx <satélite>` lista sus transmisores y `sat doppler <satélite> [n]` / `sat doppler stop`.
- `rigctld`: nuevas órdenes de subida separada en `server/radio/hamlib.ts`.

---

## [v1.29.0] - 2026-11-15
### Radio · Principal: consola de comandos
- **Consola de comandos** (`server/radio/consola.ts`, `GET/POST /api/radio/consola`): todo lo que hacen los paneles, escrito como «módulo orden argumentos». Módulos `cat` (frecuencia, modo, VFO, PTT), `rot` (posición, parar, aparcar, seguir a una estación, barco, aeronave, satélite, sol o luna), `dx` (spots con país, rumbo y distancia; `dx go <n>` sintoniza y gira; el resto pasa al nodo), `aprs` (mensaje, boletín, baliza, oídas), `dapnet`, `sat` (favoritos y próximo paso), `arts` (lista, sondeo, añadir, quitar, encender), `eai` y `n2k`. `help [módulo]` muestra las órdenes.
- Mismos nombres que el rotor, el Display y la app APRS LoRa+ donde existen (`pos`, `stop`, `park`, `follow`, `ping`/`pong`, `EAI`).
- Usa las mismas funciones que los botones: política de emisión, PTT con corte a los 3 minutos, y **confirmación** obligatoria para el PTT y la emergencia remota (también la exige el servidor). Solo para el administrador.
- Historial con ↑ ↓, registro de la sesión guardado en el navegador, botones de módulo y la referencia de órdenes, que al tocarlas se copian en la línea.
- Al buscar un satélite por nombre se prefieren los favoritos y, entre los demás, el de número NORAD más bajo («ISS» → ISS (ZARYA)).

---

## [v1.28.0] - 2026-11-15
### Radio · Principal: grupo de estaciones (ARTS) y emergencia remota (EAI)
- **Vigilancia de grupo** (`server/radio/grupo.ts`, `GET/POST /api/radio/grupo`), con las mismas reglas que el tracker APRS LoRa+: hasta 5 indicativos (con SSID solo vale ese; sin SSID, cualquiera), **EN ALCANCE** si se ha oído **por radio** dentro del plazo (10 min de serie) y, si se fija, más cerca que la distancia máxima; si no, **FUERA**. Al arrancar se espera un plazo antes de dar a nadie por perdido. Lo oído por APRS-IS se muestra aparte: no es estar en alcance de radio.
- Cada cambio queda en el registro y en la lista de «Últimos cambios». **Radar** como el del tracker (norte arriba, escala automática) con distancia y rumbo de cada miembro.
- **Sondeo**: automático (60 a 3600 s) o a mano, con un mensaje «ping» a quien no se oye; los trackers APRS LoRa+ responden «pong» y se indica.
- **Emergencia remota (EAI)**: «EAI <código>» o «EAI STOP <código>» a un tracker del grupo que la tenga activada con ese código; su respuesta («EAI ON …», «EAI OFF») aparece en el panel y en Mensajería. Con confirmación, solo el administrador y por la cola de emisión.

---

## [v1.27.0] - 2026-11-15
### Radio · Direwolf: solo lo que Direwolf da de verdad
- **Pantalla nueva** (`src/pages/Direwolf.tsx`, `server/radio/direwolf.ts`, `GET/POST /api/radio/direwolf`): estado del servicio (systemd, y desde cuándo está en marcha), del enlace KISS, del audio y módem y del PTT; recibidas, emitidas, nivel de audio medio y tramas con bits corregidos en la última hora; tráfico por minuto; tramas en directo **explicadas** (posición con distancia y rumbo, mensaje, acuse, boletín, estado, telemetría…), por qué repetidor llegaron y con su nivel de audio, y al tocarlas, enteras en texto y hexadecimal.
- **Nivel de audio por estación**, con la franja buena (30 a 70) marcada, para ajustar el volumen. Sale del **registro CSV de Direwolf** (`LOGDIR`), que la consola sigue según crece; sin registro, la pantalla explica cómo activarlo y no muestra niveles.
- **Configuración** leída de `direwolf.conf` (indicativo, módem, tarjeta, PTT, puertos, TXDELAY/TXTAIL, FIX_BITS, LOGDIR), con su registro del sistema (`journalctl -u direwolf`) y **reiniciar el servicio** (administrador, con confirmación).
- **Prueba de emisión**: emite la baliza de la estación y dice qué repetidor la devolvió y a los cuántos segundos.
- Las tramas recibidas por KISS marcan con `*` el repetidor que las retransmitió (bit H de AX.25), como en TNC2.
- La plantilla de `direwolf.conf` incluye `KISSPORT 8001` y `LOGDIR /var/log/direwolf`, y ya no lleva `CBEACON`: la baliza la emite la consola, con su política de emisión.
- **Fuera** el espectro, las formas de onda, el audio y el módem simulados de la pantalla antigua (`DirewolfConsole`, `NucConsole`, `TransmissionTrafficTrends`). El terminal de tramas con inyección de pruebas pasa a **Sistema → Pruebas y simulación**.

---

## [v1.26.0] - 2026-11-14
### Conectividad: salida NMEA 2000 (SocketCAN)
- **El NUC como nodo NMEA 2000** (`server/conectividad/nmea2000.ts`, `nmea2000Servicio.ts`): por **SocketCAN** (adaptador CAN, 250 kbit/s) reclama una dirección ISO (PGN 60928 / petición 59904, con defensa y negociación) y pone en el bus los datos propios de la estación para un plotter. Requiere `can-utils` (`cansend` / `candump`); sin dependencias nativas de Node.
- **PGN emitidos**: posición y COG/SOG del **GPS (gpsd)** (129025 / 129026) y la hora (126992); **meteorología** de la estación o de Internet — viento (130306), presión (130314) y temperatura de rango ampliado (130316); **navegación** si hay objetivo o ruta (129283 cross-track, 129284 datos de navegación, fast packet); y los **avisos de emergencia** como **mensaje de seguridad AIS** (129802), en el mismo punto donde se despachan por APRS. Formatos contrastados con las definiciones de canboat y con el plotter APRS LoRa+.
- **Lo recibido por RF (AIS, ADS-B, APRS) no se retransmite**: sigue siendo solo para el mapa.
- **Consola**: nueva pantalla **Conectividad** en la sección Sistema (enciende el bus, interfaz, dirección, qué grupos emitir, MMSI para el 129802 y estado del bus); API `/api/nmea2000`.
- Pruebas: `tests/nmea2000.test.ts` (9 casos). Sin probar con un bus NMEA 2000 real.

## [v1.25.0] - 2026-11-14
### Satélites: descarga de TLE, pasos y seguimiento
- **Descarga de elementos orbitales (TLE)** (`server/radio/satelites.ts`): el mismo archivo `sats_all.txt` que usan el tracker y la app APRS LoRa+ (rama `satdata` de APRS-LoRa-Plus; TLE de CelesTrak y transmisores de SatNOGS DB, CC BY-SA 4.0). Se relee cada 12 horas y a petición («Actualizar TLE»); la pantalla dice cuántos satélites hay y la antigüedad de los TLE, y avisa si pasan de una semana.
- **Satélites favoritos** (de serie, la ISS): dónde están ahora y su **próximo paso** desde la posición actual de la estación (fija o GPS): cuándo sale, elevación máxima y acimut de salida, culminación y puesta. Búsqueda por nombre, número NORAD o grupo para añadir más.
- **Transmisores** de cada satélite (bajada, subida, modo, velocidad, CTCSS), con la frecuencia de bajada **corregida de Doppler** mientras está a la vista, y «Sintonizar» si hay equipo por CAT.
- **Seguir con el rotor**: nuevo objetivo de seguimiento; bajo el horizonte espera, y dos minutos antes se coloca por donde sale.
- Órbitas con SGP4 (biblioteca `satellite.js`, MIT). Sin TLE no se muestra ninguna posición ni paso.

---

## [v1.24.0] - 2026-11-14
### Rotor: seguimiento con la estación fija o en movimiento
- **Seguimiento de objetivos** (`server/radio/seguimiento.ts`), como en la caja APRS LoRa+ Rotor, el tracker y la app: una estación APRS, la última oída por radio, un barco (AIS), una aeronave (ADS-B, con elevación), el Sol o la Luna (con refracción). El rotor solo se mueve cuando el cambio pasa de 2°.
- **Objetivos en movimiento**: se apunta a la posición **estimada ahora**, con el último rumbo y velocidad del objetivo (5 minutos como máximo); el nombre lleva `~` mientras es estimada. Las posiciones APRS guardan ya rumbo y velocidad (sin comprimir, comprimidas y Mic-E).
- **Estación fija o por GPS**: los ángulos se calculan siempre desde la posición actual de la estación, la fija del perfil o la del GPS, y la pantalla dice cuál se usa.
- **Rotor en un vehículo o barco** (opción): el acimut que se pide y el que se enseña son verdaderos; al rotor se le manda descontando el rumbo de la proa y se vuelve a apuntar cuando el rumbo cambia. El rumbo es el del GPS en marcha (3 km/h o más); parado se conserva el último, y sin rumbo el rotor no se mueve y se indica.
- Mover a mano, parar o aparcar deja de seguir.

---

## [v1.23.0] - 2026-11-14
### Radio · Principal: equipo por CAT y rotor
- **Equipo de radio por CAT** (`server/radio/hamlib.ts`): cliente de `rigctld`, así que vale para cualquier equipo que Hamlib maneje. Muestra frecuencia, VFO, modo, filtro, RX/TX y S-meter; permite cambiar de banda, modo y VFO, sintonizar una frecuencia y accionar el PTT (con confirmación, y se suelta solo a los 3 minutos).
- **Rotor**, por dos vías: `rotctld` de Hamlib o la caja **APRS LoRa+ Rotor** por su protocolo JSON (TCP 4534, con PIN), que además da el objetivo, si gira y sus avisos (viento, atasco). Brújula con acimut y objetivo, pasos de 5°, ir a un acimut y elevación, aparcar y parar.
- **Tocar la frecuencia de un spot** del cluster sintoniza el equipo y gira el rotor a su rumbo (cada cosa se puede desmarcar).
- Sin enlace con el equipo o el rotor no se muestra ninguna lectura; lo que un equipo no da (por ejemplo el S-meter) se indica como tal.
- Las órdenes al equipo y al rotor son solo para el administrador.
- La **esfera del rotor** va graduada cada 5° y numerada cada 30°, con aguja de punta y contrapeso y un índice en el borde para el objetivo.
- El **S-meter** usa la misma escala de color que el rotor, el Display y la app Android: colores IARU, 9 tramos S y 6 sobre S9, los apagados al 15 %.

---

## [v1.22.0] - 2026-11-14
### Radio · Principal: cluster DX y mensajería
- **Pantalla nueva «Principal»** en Radio, la consola de operación. Empieza con dos módulos; el equipo por CAT, el rotor, el grupo de estaciones y la consola de comandos llegarán después.
- **Cluster DX** (`server/radio/clusterDx.ts`): cliente telnet para nodos DXSpider, AR-Cluster o CC Cluster. Entra con el indicativo de la estación, recoge los spots según llegan y los enseña con banda, **país, rumbo y distancia** desde la posición actual (`server/radio/dxcc.ts`, con el fichero público cty.dat). Filtro por banda, órdenes al nodo (`sh/dx`, `sh/wwv`, `dx …`) y consola con su salida. Se reconecta solo.
- **Mensajería APRS** (`server/radio/mensajes.ts`): bandeja con los mensajes dirigidos a la estación, por radio o por APRS-IS, y los boletines que se oyen. Contesta con el **acuse de recibo**, no duplica los repetidos, y los mensajes que escribe el operador se repiten hasta cinco veces mientras no llegue el acuse. También envía boletines (`BLNn`). Mensajes y acuses van con prioridad en la cola de emisión y respetan su política: sin emisión activada no sale nada.
- **DAPNET** (`server/radio/dapnet.ts`): envío a buscapersonas con la cuenta de hampager.de del operador, con prioridad de emergencia opcional. La contraseña se guarda como secreto.
- El número de mensaje (`{12`) ya no se pierde al recortar un texto de 67 caracteres.
- El contenido de los mensajes y la consola del cluster solo se muestran al administrador.

---

## [v1.21.0] - 2026-11-14
### El servidor deja de simular: meteorología, boyas, tráfico y equipo
- **Meteorología siempre real** (`server/fuentes/meteoAbierta.ts`): sin clave de OpenWeatherMap ni de AEMET, o si fallan, se usa Open-Meteo (sin clave): estado actual y previsión de cinco días en la posición de la estación, indicado en pantalla como dato de modelo. Desaparecen el simulador de clima, la previsión inventada y las «microfluctuaciones» que alteraban cada 1,5 s los valores leídos. Si ninguna fuente responde, se conserva una hora la última lectura real y después se muestra «sin datos».
- **Boyas más cercanas, en tiempo real** (`server/fuentes/boyas.ts`, `GET /api/boyas`): la pantalla Boyas enseña la última observación de las boyas y estaciones costeras del NDBC de la NOAA más próximas a la posición actual (ola, viento, presión, aire, agua), sin rellenar lo que una boya no mide. Sustituye a las boyas y mareógrafos de ejemplo, cuyos valores variaban al azar.
- **Estado del equipo real**: uso de CPU, memoria, carga, tiempo encendido y versión del sistema se leen del sistema operativo (antes, la CPU y la memoria eran valores al azar). El estado de los servicios se consulta cada 15 s en lugar de cada 1,5 s.
- **Tráfico de la DGT**: si la DGT no responde no hay incidencias (antes, seis de ejemplo); las incidencias sin coordenadas se descartan en vez de situarse en la estación.
- **Tsunamis**: solo los seísmos que el USGS marca con aviso de tsunami; se retiran la altura de ola estimada al azar y la deducción por magnitud.
- **Clima espacial**: fuera la variación al azar de las alertas y de la previsión a 3 días.
- **Gráfica de tráfico APRS**: empieza a cero y solo cuenta tramas reales (antes, una hora de actividad inventada).
- **Fuera**: radar y rayos simulados, catálogo y estaciones de radiación del JRC de ejemplo (y su pantalla, que ya no se usaba), observaciones NDBC inventadas, diario del sistema de ejemplo y las respuestas simuladas del acceso a AEMET OpenData. Rutas retiradas: `/api/erddap/*`, `/api/ndbc/latest-obs`, `/api/jrc/*`, `/api/navareas/simulate` y `/api/space-weather/propagacion`.

---

## [v1.20.0] - 2026-11-14
### Sin datos de demostración ni valores supuestos
- **Retirados los datos de demostración** de NAVTEX, Inmarsat, AIS y radiación: los avisos náuticos y mensajes Inmarsat de ejemplo, los barcos inventados alrededor de la estación y los valores de radiación modelados, con sus balizas y sus pantallas (Marítimos y Radiación). La entrada real de Inmarsat-C por UDP se conserva. Los paneles que mostraban barcos reciben ahora los **reales recibidos por AIS**.
- **Clima espacial sin relleno**: cuando una fuente no responde ya no se inventa el dato (antes, un Kp, un viento solar y una previsión a 3 días al azar, o un flujo solar de 150). El panel de detalle de HF y el boletín de propagación solo aparecen y se emiten con todas las fuentes leídas; si falta alguna, se dice cuál.
- **Calidad del aire sin relleno**: los contaminantes que la fuente no da quedan sin dato, y sin ninguna fuente no se muestra nada (antes, un simulador).
- **Medidores de aire más cercanos, en tiempo real** (`server/fuentes/estacionesAire.ts`, `GET /api/aire/medidores`): sustituye a la lista fija de doce estaciones con valores inventados. Lee de la red Sensor.Community los medidores de partículas alrededor de la posición actual de la estación, ordenados por distancia, con PM2,5, PM10 y la antigüedad de cada lectura. Está en **Estación y meteo**.
- **Retiradas cuatro rutas sin uso**: `/api/navareas/feed-source`, `/api/navareas/test-parse`, `/api/wiresx/status` y `/api/nuc/service`.

---

## [v1.19.0] - 2026-11-14
### Limpieza del servidor
- **Retirado el subsistema antiguo de incendios**: los focos de ejemplo fijos, los inyectados a mano, la «propagación» pseudoaleatoria que los movía, su baliza APRS, el análisis con IA y sus rutas (`/api/wildfires/*`). Los focos de calor son ya solo los reales de NASA FIRMS, por la cadena de avisos.
- **Coordinación** y la herramienta de pruebas leen esos focos reales en lugar de la lista de ejemplo (`src/utils/focos.ts`).
- **Retiradas las rutas sin uso** de las pantallas eliminadas: `/api/ica/*`, `/api/seismo/beacon/transmit`, `/api/earthquakes/refresh`, y la baliza antigua de calidad del aire.
- **Fuera la dependencia de Gemini** (`@google/genai`) y su clave en `.env.example`: ya no hay ninguna función que use IA externa.
- La fórmula de propagación del fuego de Rothermel se conserva, en la biblioteca de fórmulas (`server/formulas/fuego.ts`).
- En total, unas 900 líneas menos en `server.ts`.

---

## [v1.18.0] - 2026-11-14
### Limpieza de las pantallas antiguas de Avisos
- **Retiradas** las pantallas de Sismos, Meteorología, Incendios y Calidad del aire: su función la hace ya la lista «En vigor», con datos de fuentes oficiales, sus reglas y sus tramas. Eran unas 12.000 líneas que mezclaban datos reales con otros de demostración. Siguen en el historial de git (hasta la v1.17.0) por si se quiere recuperar algo, como las gráficas estadísticas de sismos.
- **Catálogo de sismos recientes** en Avisos: los sismos de los últimos días de la fuente oficial, se anuncien o no, con magnitud, profundidad, lugar y distancia.
- **Demostración, señalada**: Marítimos (NAVTEX, Inmarsat) y Radiación llevan «(demo)» en su pestaña y una franja que explica que no tienen todavía una fuente real. Salud y Coordinación indican qué parte es de consulta o de demostración.
- Los enlaces internos a una pantalla retirada llevan a la lista de avisos.

---

## [v1.17.0] - 2026-11-14
### Limpieza de pantallas antiguas y de datos duplicados
- **Estación y meteo** queda en lo que es: la meteorología de la estación. Se quitan el rótulo fijo «APRS-IS enlace activo» (el estado real está en la barra superior), el registro de tráfico (está en Radio) y las tres listas de alertas (están en Avisos).
- **Meteorología simulada, señalada**: cuando no hay clave de OpenWeatherMap ni de AEMET, la pantalla lo dice con un aviso. La portada solo enseña meteorología real (estación propia o Internet) y, si no la hay, lo indica en lugar de mostrar cifras del simulador.
- **Emisiones duplicadas o sin fuente real, retiradas**: la baliza y el boletín periódicos de calidad del aire (la sustituye el aviso de la cadena, solo cuando el aire es malo) y la baliza automática de radiación (no tiene todavía una fuente real). Dejan de llenar el registro de «no emitido». El boletín de propagación HF se mantiene.
- **Sin datos de relleno**: si la NOAA no responde ya no se muestran dos alertas de clima espacial de ejemplo, y una estación sin GPS deja de simular cambios de velocidad en el registro.
- Las herramientas para inyectar sucesos de prueba pasan a **Sistema → Pruebas y simulación**, y los avisos sonoros y notificaciones del navegador a **Sistema → Equipo**.

---

## [v1.16.0] - 2026-11-14
### HF y propagación, mejorado y en directo
- **Se conserva todo** lo que había en la pantalla de propagación (índices, viento solar, escalas, previsión de la NOAA, boletín APRS y sus ajustes). Pasa a **Radio → HF y propagación** y se le antepone un resumen nuevo.
- **Bandas ahora** (`server/propagacion.ts`): para cada banda de 160 a 10 m, si sirve para enlace **local y regional (NVIS, 0-400 km)** y para **larga distancia**, con la mejor banda de cada tipo. El enlace local es el que importa en una emergencia.
- **Ionosfera medida**: foF2, MUF a 3000 km y altura de la capa F2 de la **ionosonda más cercana** (red GIRO), con su distancia y la antigüedad de la medida. Antes la MUF era solo una estimación a partir del flujo solar; ahora se usa la medida cuando la hay y se dice cuál de las dos es.
- **Escalas R, S y G oficiales** de la NOAA en lugar de deducidas, cuando están disponibles.
- **Lo que no se puede leer se muestra como «—»**: antes, si la NOAA no respondía, se enseñaban un flujo solar de 150 y 110 manchas como si fueran reales.
- **En directo**: el resumen se relee cada 30 segundos, con un indicador de antigüedad; las ionosondas y las escalas se consultan cada 5 minutos. Nueva tarjeta **«HF ahora»** en la portada (`GET /api/hf`).
- El panel antiguo sigue ahora al color de la consola: sus tarjetas blancas pasan a oscuras en los temas oscuros.

---

## [v1.15.0] - 2026-11-14
### Clima espacial, focos de calor y calidad del aire en la cadena de avisos
- **Clima espacial** (`server/fuentes/climaEspacial.ts`): estado actual de las escalas R (apagones de radio en HF), S (radiación solar) y G (tormentas geomagnéticas) de la NOAA. Boletín `BLNnESPAC` a partir de la escala 2, repetido cada 3 horas mientras dure; si sube de nivel se anuncia de nuevo.
- **Focos de calor por satélite** (`server/fuentes/incendios.ts`): anomalías térmicas de NASA FIRMS (VIIRS y MODIS) a menos de 50 km de la estación. Se descartan las de baja confianza y se agrupan las cercanas; objeto en el mapa y boletín `BLNnFUEGO` cuando el grupo tiene 5 puntos o 100 MW o más. El aviso dice siempre «foco de calor por satélite»: no es un incendio confirmado.
- **Calidad del aire** (`server/fuentes/calidadAire.ts`): índice europeo calculado por Copernicus CAMS para la posición de la estación. Boletín `BLNnAIRE` solo cuando el aire es muy malo o peor.
- Los tres aparecen en **Avisos**, con sus reglas editables, en el **mapa** (los focos) y en **Fuentes** de la portada.
- La baliza automática de incendios anterior queda retirada: emitía un foco elegido de una lista que mezclaba focos reales con otros de demostración.

---

## [v1.14.0] - 2026-11-14
### Parte meteorológico de la estación por APRS
- **Parte meteorológico** (`server/estacion/meteo.ts`): trama APRS completa con posición y hora de la medida (viento, racha, temperatura, lluvia, humedad y presión). Lo que la fuente no da se envía como puntos, tal como pide el protocolo; no se rellena con valores supuestos.
- **Estación propia**: lee el último registro de la base de datos de **WeeWX** (con la orden `sqlite3`, en solo lectura, en cualquiera de sus tres sistemas de unidades) o un archivo **wxnow.txt**.
- **Datos de Internet** (OpenWeatherMap o AEMET) como alternativa; en ese caso la trama dice de dónde vienen. Tres modos: automático (la propia y, si falta, Internet), solo propia o solo Internet.
- **Solo datos reales y recientes**: con más de 30 minutos de antigüedad, o con el simulador de la consola, el parte no se emite.
- Se configura en **Estación → Perfil**, con el estado de cada fuente, la vista previa de la trama y «Emitir parte ahora». Apagado por defecto, para no duplicar el parte que ya emitan WeeWX, Direwolf o aprx (`GET/POST /api/estacion/meteo`).

### Corrección
- Al cambiar la **posición fija** en el perfil se aplica al momento. Antes la estación seguía en la posición anterior hasta reiniciar, y con ella el radio de los avisos.

---

## [v1.13.1] - 2026-11-14
### Color del tema táctico
- El tema **Táctico** se puede poner en cuatro colores: **Ámbar** (el de la v1.13.0, por defecto), **Rojo**, **Verde** y **Azul nocturno**. Con Táctico elegido aparece un segundo selector junto al de color; la elección se guarda en cada navegador.
- Cada color es una gama única de baja luminosidad que cambia toda la consola, incluido el fondo del mapa.

---

## [v1.13.0] - 2026-11-14
### Color de la consola
- **Selector de color** en la barra de estado: **Automático** (por defecto), **Sistema**, **Claro**, **Oscuro** y **Táctico**. La elección se guarda en cada navegador.
  - *Automático*: claro de día y oscuro de noche, según el sol en la posición de la estación (o por horario fijo, si así se ajusta en Sistema).
  - *Sistema*: el claro u oscuro que tenga el sistema operativo o el navegador.
  - *Táctico*: una sola gama rojo-ámbar de baja luminosidad, para no perder la visión nocturna; atenúa también el fondo del mapa.
- Los temas redefinen la paleta completa (`src/index.css`) en lugar de retocar componentes uno a uno, así que cambian toda la consola a la vez. Sustituyen a los antiguos «modo claro» y «modo noche»; el modo claro anterior dejaba paneles oscuros con texto oscuro.
- El nivel de los avisos (amarillo, naranja, rojo) conserva sus colores en todos los temas. El modo de emergencia sigue siendo un aviso visual aparte.

---

## [v1.12.0] - 2026-11-14
### AIS y ADS-B reales en el mapa
- **AIS** (`server/ais.ts`): lectura de sentencias NMEA `!AIVDM` (posiciones de clase A, clase B y largo alcance, y datos estáticos para el nombre, el indicativo, el tipo y el destino), con reensamblado de fragmentos y suma de comprobación. Entrada por **UDP** (puerto 10110; AIS-catcher con `-u`, rtl_ais, un receptor) y, opcionalmente, por **TCP** contra un servidor de sentencias.
- **ADS-B** (`server/adsb.ts`): lectura del formato SBS-1 (BaseStation) que readsb y dump1090 sirven en el puerto 30003; resalta los códigos de emergencia 7500, 7600 y 7700.
- **Capas AIS y ADS-B** en el mapa: una flecha orientada al rumbo, con nombre o vuelo, velocidad, altitud y antigüedad. Los barcos se conservan 20 minutos y las aeronaves 90 segundos.
- **Entradas AIS y ADS-B** configurables desde la propia página del mapa (puertos y servidores), con su estado: si se escucha, si hay conexión y cuánto se ha recibido.
- Solo son para verlos en el mapa: no se retransmiten por APRS. Los paneles antiguos de AIS siguen usando datos de demostración.

---

## [v1.11.0] - 2026-11-14
### Recepción APRS y capa APRS del mapa
- **Lectura de posiciones APRS** (`server/aprsPosicion.ts`): posición sin comprimir y comprimida, objetos, ítems, Mic-E y tramas de terceros.
- **Estaciones oídas** (`server/estaciones.ts`): última posición de cada estación u objeto, por dónde llegó (radio o APRS-IS) y cuándo. Se conservan dos horas.
- **Capa APRS en el mapa**: en verde lo oído por radio (puerto KISS de Direwolf), en violeta lo recibido por APRS-IS; los objetos, como cuadrados.
- **Sesión permanente con APRS-IS** (`server/aprsIs.ts`): una sola sesión para recibir (con filtro por radio alrededor de la estación) y para emitir, con reconexión automática. Antes se abría una conexión por cada trama emitida y no se recibía nada. Solo se abre con un indicativo válido; con un passcode que no corresponda queda en solo recepción. Se desactiva con `aprsIsRxEnabled`.
- **Barra de estado**: estado real de la sesión con APRS-IS y del enlace con Direwolf (`GET /api/enlaces`).

---

## [v1.10.0] - 2026-11-14
### Mapa con capas
- **Sección Mapa**: mapa base de OpenStreetMap (Leaflet) con capas que se encienden y apagan: **Estación** (posición y radio de avisos), **Avisos** (sismos como puntos y zonas de AEMET como polígonos, por color de nivel; resaltados los que la estación difunde) y **Tráfico** (incidencias de la DGT). Lo que se ve en el mapa no se retransmite.
- Solo se pintan datos reales: si la DGT no responde, la capa de tráfico queda vacía en lugar de mostrar las incidencias de demostración. Las capas APRS, AIS y ADS-B figuran como pendientes.
- `GET /api/mapa` sirve los datos con posición.

### Reglas de avisos desde la consola
- En **Avisos**, el administrador cambia las reglas de cada tipo: radio, nivel mínimo, antelación y repetición de los avisos meteorológicos; radio, magnitud mínima y repetición de los sismos.

---

## [v1.9.0] - 2026-11-14
### Avisos meteorológicos oficiales de AEMET en la cadena de avisos
- **Nueva fuente `server/fuentes/aemetAvisos.ts`**: lee los avisos de Meteoalerta que AEMET publica en formato CAP (sin clave), con su nivel, fenómeno, valor, vigencia y el polígono de la zona.
- **Avisos de zona** (`server/core/zona.ts`): se anuncia un aviso si la estación (fija o móvil) está dentro de la zona o a menos de `meteoRadioKm` (25 km) de su borde. Objeto APRS en el centro de la zona, con nombre estable por fenómeno y zona (p. ej. `PR614102`), y boletín `BLNnMETEO`.
- Se anuncian con antelación (`meteoAntelacionH`, 12 h), se repiten mientras siguen vigentes (`meteoRepetirMin`, 60 min) y se vuelven a anunciar al instante si suben de nivel. Las actualizaciones sustituyen al aviso anterior y las cancelaciones lo retiran.
- **El panel de avisos de AEMET muestra ya avisos reales.** Antes los fabricaba la propia consola a partir del viento y la lluvia del momento y los presentaba como avisos de AEMET.
- Los boletines que no caben en 67 caracteres prescinden primero de la palabra «EMERGENCIA» y después de la fuente, antes de cortar el nombre del lugar.

### Consola reorganizada
- **Seis secciones** en un menú lateral (Inicio, Avisos, Estación, Mapa, Radio, Sistema) en lugar de los 10 «pilares» y las 11 pestañas. Todas las pantallas anteriores siguen estando, repartidas en su sección (`src/navigation.ts`).
- **Barra de estado** única: indicativo, emisión, GPS, hora y acceso de administrador.
- **Inicio**: avisos activos en la zona, estado de la estación, últimas emisiones y estado de las fuentes, en una sola pantalla (la portada anterior medía más de 7.000 píxeles de alto).
- **Avisos**: lista única de sismos y avisos meteorológicos; cada uno indica si se ha emitido o por qué no, sus tramas APRS y las reglas que se le aplican, con «Emitir ahora» para el administrador (`GET /api/avisos`, `POST /api/avisos/emitir`).
- **Estación → Perfil** abre directamente el perfil de la estación APRS. El estado detallado del equipo y los modos de pantalla pasan a Sistema.
- **Mapa**: la sección existe y explica qué capas tendrá; el visor sigue pendiente.

---

## [v1.8.0] - 2026-11-13
### Fórmulas comunes con el ecosistema APRS LoRa+
- **`server/formulas/`**: porte a TypeScript de las fórmulas del núcleo del plotter APRS LoRa+ (geodesia, sol y luna, meteorología, Beaufort, movimiento relativo, unidades y Modelo Magnético Mundial WMM2025), con los mismos nombres. Se comparan con el código C++ original en 300 casos.
- **Fórmulas nuevas** para la estación, cada una con su referencia: bulbo húmedo, humidex, temperatura aparente, humedad absoluta, base de nubes, densidad del aire, altitud de presión, tendencia barométrica; horizonte, alcance geográfico, escala Douglas; localizador Maidenhead, pérdida en espacio libre, horizonte radio, Fresnel, dBm, PIRE, ROE, S-meter, alcance PHG; energía sísmica, llegada de ondas P y S, dosis de radiación.
- La consola usa ya las fórmulas comunes para distancias, demoras, Beaufort, orto y ocaso y altura del sol (antes tenía copias propias, menos precisas).

### Repositorio
- **Historial reescrito (14-11-2026)** para retirar credenciales y datos personales antiguos. Los clones anteriores deben hacer `git fetch origin && git reset --hard origin/main`.
- **Licencia GPL-3.0-or-later**, la misma del resto del ecosistema APRS LoRa+ (archivo `LICENSE` y cabeceras; antes las cabeceras declaraban Apache 2.0 y no había archivo de licencia) y README puesto al día: qué está operativo, qué es demostración y qué falta.

### Consola
- **Logotipo de APRS LoRa+** en la cabecera y en la pestaña del navegador.
- **Perfil de la estación guardado en la estación** (`sat_perfil.json`, `GET/POST /api/perfil`): operador, estaciones y presets se ven igual desde cualquier navegador. Antes quedaban solo en el navegador donde se crearon.
- **Perfil de la estación APRS** (Configuración → «Estación APRS»): titular y localidad, indicativo y SSID (un único dato, ya no van por separado), passcode de APRS-IS con comprobación al momento, posición fija por coordenadas o por locator (o tomada del GPS) y vista previa de la trama.
- **Baliza de posición de la estación** (`server/estacion/baliza.ts`): posición, símbolo, PHG y comentario del perfil; usa el GPS si hay fijo y si no la posición fija. Apagada por defecto para no duplicar la de aprx o Direwolf; intervalo mínimo de 5 minutos; botón «Emitir baliza ahora» para el administrador (`GET/POST /api/estacion/baliza`). Sale por la cola y la política de emisión comunes.
- Corregido el passcode que mostraba el configurador: se calculaba con 16 bits en lugar de 15 y podía no coincidir con el real.
- La versión que muestra la consola y la que anuncia a APRS-IS es ya la del proyecto (antes ponían «v2.4.0» y «2.1» fijos).
- `docs/ARQUITECTURA.md`: programas con los que convive el servicio (gpsd, ntpsec, Direwolf, aprx, Hamlib, Pat, AIS-catcher, readsb, SDR++, SDRconnect, WSJT-X, WeeWX) y tabla de fórmulas.

---

## [v1.7.0] - 2026-11-13
### Nueva base: cadena común de avisos
- **Modelo común de aviso** (`server/core/evento.ts`): cualquier fuente, oficial o de RF, entrega sus avisos en el mismo formato, con su procedencia y si el dato es real.
- **Reglas de difusión** (`server/core/reglas.ts`): radio alrededor de la posición actual de la estación (fija o móvil), gravedad y umbral mínimos, vigencia y cadencia de repetición. Lo ya emitido se recuerda en `sat_avisos.json` y no se repite tras un reinicio.
- **Formato APRS por tipo de emergencia** (`server/core/aprsAvisos.ts`): objeto con la posición, el símbolo y los datos del suceso, más boletín de emergencia (`BLNnGRUPO`, línea según la gravedad).
- **Cola única de emisión** (`server/core/emisor.ts`): todas las transmisiones de la consola salen de una en una, con pausa entre ellas y las urgentes primero.
- **Sismos sobre la nueva cadena** (`server/fuentes/sismos.ts`): un sismo oficial dentro del radio y sobre la magnitud configurada emite un objeto propio (`EQddhhmm`) y un boletín de emergencia, y se refresca durante 6 horas. Antes se repetía indefinidamente el último sismo de toda España, aunque estuviera fuera del radio o fuese muy débil. Los sismos sin magnitud o sin hora en la fuente se muestran pero no se anuncian.
- **Estado real del servidor de hora** (`server/sistema/ntp.ts`): la consola lee ntpsec con `ntpq` (stratum, par seleccionado, offset, jitter). Antes mostraba siempre «Stratum 1 sincronizado» con valores aleatorios, hubiera o no sincronización.
- `docs/ARQUITECTURA.md`: los tres flujos del sistema, la cadena de avisos, cómo añadir una fuente y el estado de la reorganización.

---

## [v1.6.0] - 2026-11-13
### Eliminado: Firebase
- **La consola ya no depende de Firebase** (Authentication ni Firestore) ni de ningún otro servicio en la nube. Eliminados el SDK (`firebase`), `firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules` y `src/utils/firebase.ts`.
- **Administración con token local**: el administrador se identifica con `SAT_ADMIN_TOKEN` (mínimo 16 caracteres) desde el nuevo botón «Acceder» de la consola (`AdminAccess`), o con `SAT_TRUST_LOCALHOST`. Funciona sin Internet. Desaparece `SAT_ADMIN_EMAILS`. Nuevo `GET /api/auth/status`.
- **Datos del operador en el navegador**: perfil, estaciones y presets (`src/utils/localStore.ts`), lista de servidores APRS-IS, ajustes SOS y de sonido. Las plantillas de boletín ICA se guardan en la configuración de la estación (`/api/config`).
- Eliminados el registro e inicio de sesión de operadores, los roles (REMER/EMCOM), la sincronización «en la nube», el aviso de versión publicado desde Firestore y el 2FA/acceso por QR (`PrivateLoginGate`, `TwoFactorConfigurator`, `TwoFactorVerificationGate`, `totp.ts`; dependencias `otpauth` y `jsqr`).

---

## [v1.5.0] - 2026-11-13
### Seguridad de emisión (nada simulado sale al aire)
- **Política de emisión única** (`server/aprs.ts`, `decideTransmission`): toda trama TX de la consola pasa por un único control. La consola no transmite salvo `SAT_APRS_TX=on`; nunca emite datos simulados o de prueba; exige un indicativo válido (no de plantilla), que el origen de la trama sea el de la estación y, en APRS-IS, el passcode correcto. Las tramas no emitidas quedan registradas como `[NO EMITIDO: motivo]`.
- **Fuentes marcadas como simuladas** y por tanto no emitibles: radiación REA/REMAP (modelo local), sismos y alertas NOAA de prueba, incendios que no proceden de NASA FIRMS, calidad del aire sin medición de Open-Meteo, pronóstico del simulador y clima espacial con valores por defecto.
- **Agente `aprs_sat.py`**: eliminadas las alertas inventadas que se transmitían con la configuración por defecto (pronóstico «simulado» de viento y helada, picos aleatorios de la estación local «simulated», meteorología estática sin clave de OpenWeatherMap y avisos «didácticos» de AEMET/MeteoAlarm/DWD/Met Office cuando la fuente fallaba). Los datos simulados solo existen con `--simulate`, que obliga a `--dry-run`.
- Nuevos modos `--dry-run`, `--simulate` y `--once` para probar sin transmitir.

### Seguridad de la consola
- **Autenticación verificada en el servidor** (`server/auth.ts`): ya no se confía en las cabeceras `X-User-UID` / `X-User-Email`, que cualquiera podía enviar (el mecanismo definitivo, sin Firebase, es el de la v1.6.0).
- Con la emisión activada, toda operación que modifica la estación exige un administrador.
- **Corregida una inyección de órdenes** en `/api/system/clear-service-logs` (el nombre del servicio se interpolaba en una línea de `sudo`). Todas las órdenes del sistema usan ahora argumentos fijos, sin intérprete de órdenes.
- **Eliminada la contraseña del creador** embebida en `PrivateLoginGate.tsx` y el botón de «Master Bypass».
- Las claves API, el passcode y los archivos reales del sistema solo se entregan a un administrador.
- El agente verifica los certificados TLS de todas las fuentes (antes desactivado).
- `.env` se carga de verdad (`dotenv`); nuevas variables `HOST` y `PORT`.

### Protocolo APRS
- **RF real desde el agente**: se envían tramas AX.25 UI codificadas por KISS (antes se enviaba texto TNC2, que Direwolf descarta), con escapado KISS y la ruta de radio configurada. Las rutas de Internet (`TCPIP*`, `qAC`) ya no pueden salir por RF.
- **APRS-IS**: ruta `TCPIP*` sin construcciones `q` inventadas, y se espera a que el servidor verifique el login antes de enviar.
- **Boletines del agente válidos**: formato `:BLNnNOMBRE:texto` (faltaba el `:` inicial), destinatario de 9 caracteres, texto en ASCII y limitado a 67 caracteres.
- Coordenadas sin el desbordamiento `60.00` en los minutos; viento y racha en mph como exige la especificación; símbolo de terremoto `\Q` en los objetos sísmicos del agente.
- Destino experimental `APZSAT` en lugar de `APRS`/`APXSAT` (rango de Xastir).

### Corregido
- Sismos del agente: magnitud mínima y antigüedad máxima configurables, nombres de objeto únicos, historial persistente (`sat_state.json`) para no repetir anuncios al reiniciar, y un evento defectuoso ya no detiene el resto del ciclo.
- Avisos meteorológicos: soporte del feed Atom de MeteoAlarm, filtro por zonas de la estación (`meteoAreaFilter`), descarte de avisos caducados e identificadores estables.
- `config.ini`: el servidor ignoraba todas las secciones salvo `[APRS]` (comparaba nombres en mayúsculas con claves en minúsculas); la posición de respaldo configurada ahora se aplica al arrancar.
- GPS: los contadores de satélites se actualizan; `last_gps.json` se escribe como mucho una vez por minuto (antes, cada segundo).
- `npm run start` arranca en modo producción; Vite solo se carga en desarrollo; un único temporizador de baliza de incendios.

### Repositorio
- `config.ini` y `sat_config.json` dejan de versionarse (plantilla en `config.ini.example`); eliminados los `__pycache__`.
- Pruebas automáticas: `npm test` y `npm run test:py`.
- README: guía de instalación corregida (unidades systemd, variables de entorno, actualización) y sección de seguridad de emisión.

---

## [v1.4.4] - 2026-09-28
### Eliminado & Optimizado
- **Eliminación del Visualizador de Cartografía y Tráfico Táctico S.A.T.**:
  - Eliminado el contenedor del mapa táctico y gonio-radar (`RadarMap`) del Tier 2 del panel central en `App.tsx`.
  - Eliminado el archivo de componente completo `RadarMap.tsx` y su exportación en `components/index.ts`.
  - Reestructurado el Tier 2 del cuadro de mandos para dar ancho completo y prominencia al panel de telemetría meteorológica LCD local (`WeatherStation`).
  - Depurado el modal emergente de paquetes APRS entrantes ajustando los botones de acción directos a 2 columnas (Cerrar y Responder).

---

## [v1.4.3] - 2026-09-28
### Eliminado & Optimizado
- **Eliminación de la Guía de Repetidores y Nodos WIRES-X**:
  - Eliminada la pestaña y botón de navegación "Guía de Repetidores" (`tab-repetidores-trigger`) en la barra de subpestañas del Pilar I en `App.tsx`.
  - Eliminado el componente contenedor `RepeaterDatabaseView` y los submódulos asociados `WiresXDatabaseView` y `WiresXRoomsDatabaseView`.
  - Retiradas las bases de datos locales estáticas de repetidores nacionales (`repeaters.ts`) y nodos/salas de conferencia (`wiresx.ts`).
  - Limpieza de tipos de navegación interna y exportaciones en `components/index.ts`.

---

## [v1.4.2] - 2026-09-28
### Eliminado & Optimizado
- **Eliminación de la Consola Yaesu FTM-400DR**:
  - Eliminado el simulador del panel frontal y pantalla táctil del transceptor Yaesu FTM-400DR / DE en `AprsAdaptor.tsx`.
  - Eliminada la pestaña de navegación "Consola FTM-400DR" y sus submódulos (lista de estaciones escuchadas, brújula analógica Compass, simulación de SmartBeaconing / corner-pegging, chat rápido y configuración de slots de texto de memoria).
  - Eliminados los estados locales, temporizadores de cuenta atrás de baliza, calibración S-Meter VHF y rutinas de cálculo asociadas.
  - Reducción de más de 1.100 líneas de código superfluo en el componente adaptador APRS, optimizando el rendimiento y simplificando el flujo de trabajo del operador.

---

## [v1.4.1] - 2026-09-28
### Eliminado & Depurado
- **Eliminación del Espectrómetro y Calculador de Ruido y SNR (ITU-R P.372-15)**:
  - Eliminado el módulo de modelado de factores de ruido externo según la recomendación UIT-R P.372-15 en `PropagacionMonitor.tsx`.
  - Eliminados los controles interactivos de frecuencia, entornos electromagnéticos (ciudad, residencial, rural, rural silencioso), parámetros de enlace y filtros de FI.
  - Eliminado el gráfico de densidad espectral de ruido y la calculadora de estimación de SNR / S-Meter asociada.
  - Limpieza de dependencias, reduciendo el bundle de la vista de propagación ionosférica y optimizando el rendimiento general.

---

## [v1.4.0] - 2026-07-29
### Mejorado, Refinado & Depurado
- **Sincronización y Refinado de Baliza Sísmica APRS (`SEISMO`)**:
  - Transmisión automatizada y sincronizada de la baliza de posición APRS de objeto `SEISMO` desde el servidor (`server.ts`) respetando la cadencia del intervalo configurado (`config.ignSeismoInterval`).
  - Selección dinámica inteligente del terremoto más relevante (priorizando sismos en rango de cobertura y más próximos a la estación).
  - Formato del comentario de la trama SEISMO normalizado a la sintaxis limpia de APRS: `MAG:<magnitud> <localizacion> (Prof:<depth>km)`, eliminando palabras redundantes ("sismo", "Magnitud:", "Lugar:", "Fuente: IGN").
  - Incorporado un control de emisión manual en la interfaz `IgnEarthquakeIndicators.tsx` para forzar el disparo inmediato de la baliza `SEISMO` mediante el endpoint `/api/seismo/beacon/transmit`.

- **Visualización y Filtrado Sísmico Orientado a la Estación**:
  - Implementado sistema de ordenación multimodatario con el modo predeterminado **"Recientes y Próximos"**, que prioriza los terremotos registrados recientemente y más cercanos a la estación.
  - Incorporados selectores rápidos para ordenar por **Proximidad ("Cercanos")**, **Fecha/Hora** o **Magnitud**.
  - Paginación predeterminada a los 25 sismos más relevantes con botón de despliegue completo ("Ver todos los sismos") para evitar la sobrecarga de datos en la pantalla del operador.

- **Regulación de Cadencia de Boletines ICA (`BLN2AQI`) y Contaminante Predominante**:
  - Corregida la frecuencia de emisión del boletín público `BLN2AQI` en `refreshIQAir()`, asegurando que sólo se difunda respetando los intervalos definidos por nivel de gravedad o cambio de estado y eliminando la saturación del canal APRS.
  - Formato del boletín adaptado para mostrar **únicamente el contaminante predominante** con su valor numérico y unidad (ej. `(PM2.5: 10.2ug)`), sustituyendo el volcado anterior de múltiples contaminantes.

- **Mantenimiento y Calidad de Código**:
  - Actualización de tipos e interfaces en `src/types.ts` (`TelemetryConfig`, `ignSeismoInterval`).
  - Verificación exitosa del linter TypeScript (`npm run lint`) y compilación limpia del proyecto.

---

## [v1.3.1] - 2026-07-25
### Mejorado & Depurado
- **Intervalos Dinámicos de Transmisión por Nivel ICA (`server.ts` & `IcaAirQualityMonitor.tsx`)**:
  - Implementado motor de cálculo dinamizado de temporizador para boletines de calidad de aire (ICA/AQI) según la gravedad del nivel detectado:
    - **Regular (L3)**: 45 minutos.
    - **Desfavorable (L4)**: 30 minutos.
    - **Muy Desfavorable (L5)**: 20 minutos.
    - **Extremo (L6)**: 10 minutos.
    - **Buena (L1/L2)**: 60 minutos (o valor base configurado).
  - Añadido selector dinámico en la interfaz que informa de la cadencia automática por nivel ICA.

- **Plantillas de Boletines de Calidad de Aire con Recomendaciones Sanitarias (`server.ts` & `IcaAirQualityMonitor.tsx`)**:
  - Actualizado el contexto de las plantillas editables incorporando recomendaciones específicas de salud para cada nivel ICA:
    - **Buena (0-50 / 60m)**: `CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Sin riesgo. Disfrute de actividades al aire libre.`
    - **Regular (51-100 / L3 / 45m)**: `CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Aceptable. Personas sensibles deben evaluar reducir esfuerzos.`
    - **Desfavorable (101-150 / L4 / 30m)**: `CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Grupos de riesgo: reduzca actividades intensas en exterior.`
    - **Muy Desfavorable (151-200 / L5 / 20m)**: `CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Nocivo. Evite ejercicio prolongado en exterior. Proteja vias respiratorias.`
    - **Extremo (>200 / L6 / 10m)**: `CALIDAD AIRE - ICA: {aqi} {label} ({mainPollutant}) Alerta Sanitaria: Permanezca en interiores y use mascarilla FFP2.`
  - Añadida resolución automática y reemplazo de la variable dinámica `{mainPollutant}` (o `{contaminante principal}` / `{contaminante}`), calculando el contaminante dominante (PM2.5, PM10, CO, O3, NO2) en base al índice de riesgo relativo en tiempo real.
  - Actualizada la vista previa en el panel de control de `IcaAirQualityMonitor.tsx` para reflejar con precisión el texto final que será transmitido a través de la red APRS.

---

## [v1.3.0] - 2026-07-25
### Mejorado & Depurado
- **Caché de Datos Satelitales NASA FIRMS y Protección Servidor (`server.ts`)**:
  - Implementado sistema de caché en memoria con TTL de 10 minutos (`FIRMS_CACHE_TTL_MS`) para las consultas de focos térmicos satelitales NASA FIRMS (VIIRS y MODIS).
  - Eliminados cuellos de botella y riesgos de saturación de sockets HTTP durante sondeos periódicos masivos.
  - Fusionado de fuentes de datos mediante mapeo único por identificador y coordenadas entre datos satelitales reales NRT, focos de emergencia simulados por operadores y catálogo base de España.
  - Corrección de variables de estado sin declarar en la respuesta JSON del endpoint `/api/wildfires/latest`.

- **Optimización de Interfaz del Monitor de Incendios (`src/components/emergency/WildfireMonitor.tsx`)**:
  - **Filtro de Proximidad a Poblaciones**: Establecido por defecto el filtro de proximidad en `< 50 km` ("Urgente") para destacar de inmediato las amenazas críticas cercanas a núcleos urbanos.
  - **Colapso Controlado de Acordeones**: Modificado el estado inicial de grupos de provincias a colapsado por defecto (`{}`) para evitar el auto-despliegue masivo y la sobrecarga visual de listas en el panel del operador.
  - **Sincronización de Coordenadas de Grid (GPSD & Estación Base)**: Ajustado el indicador de coordenadas de cuadrícula del mapa para sincronizarse dinámicamente con las coordenadas GPSD activas (en vivo) o las coordenadas fijas de la estación base configuradas en el NUC.
  - **Actualizaciones Silenciosas en Segundo Plano (`isRefreshing`)**: Creado un estado independiente de actualización para que las sincronizaciones automáticas cada 45 segundos preserven la selección activa del usuario y no muestren pantallas de carga/pestañeo innecesarias.
  - **Sincronización Reactiva de Configuración Base**: Añadido efecto `useEffect` para actualizar automáticamente las coordenadas de respaldo locales al cambiar la configuración de la estación (`config.fallbackLat` / `config.fallbackLon`).

- **Sincronización en Motor de Amenazas (`src/components/emergency/ThreatPollingEngine.tsx`)**:
  - Adaptada la lectura del endpoint `/api/wildfires/latest` para interpretar correctamente tanto listas directas como objetos estructurados (`json.hotspots`), garantizando interoperabilidad completa entre subsistemas del CECOP.

- **Verificación Estricta del Sistema**:
  - Pasada validación completa de TypeScript (`npm run lint` / `tsc --noEmit`) sin errores.
  - Verificada la compilación completa de producción (`compile_applet`) y reinicio limpio del servidor de desarrollo (`restart_dev_server`).

---

## [v1.2.0] - 2026-07-13
### Mejorado & Depurado
- **Auditoría de Sockets de Hardware (KISS y GPSD)**:
  - Verificado el comportamiento de los sockets TCP locales en `server.ts` (`gpsd` en puerto 2947 y TNC/Direwolf KISS) frente a pérdidas de conexión física.
  - Asegurado el correcto funcionamiento del temporizador de reintento exponencial para evitar picos de uso de CPU y garantizar la autoreparación inmediata del enlace de radiofrecuencia (AX25) en situaciones críticas de emergencia.
- **Validación del Compilador y Linter en React**:
  - Ejecutada una auditoría estricta de tipos de TypeScript en todo el proyecto frontend (`npm run lint`), certificando la ausencia de discrepancias o declaraciones implícitas peligrosas.
  - Comprobada la compilación completa de producción con Vite (`npm run build`) generando un bundle optimizado y libre de errores de importación circular o dependencias rotas.
- **Refinamiento de "Pilar IV: Respuesta" & Presets de Estación**:
  - Pulido el flujo estético del componente de administración `UserProfileManager` para alinear los inputs de configuración de indicativo (Callsign), SSID y balizas.
  - Optimizado el diseño de los bloques de Presets con diseño responsive mejorado, tipografías monoespaciadas legibles de alta visibilidad para operadores civiles e inyección de Toasts dinámicos en pantalla.
- **Alineación de Seguridad y Telemetría del Servidor**:
  - Verificado el uso del cliente API de Gemini con el SDK moderno `@google/genai` y la correcta configuración de cabeceras de telemetría de desarrollo.

---

## [v1.1.0] - 2026-07-12
### Añadido
- **Módulo de Alertas Meteorológicas Multi-Agencia en Python (`aprs_sat.py`)**:
  - Integración del gestor `WeatherAlertsManager` que consulta múltiples fuentes nacionales e internacionales (AEMET, MeteoAlarm, DWD y Met Office).
  - Emisión automatizada de boletines meteorológicos formateados bajo especificaciones del protocolo APRS.
  - Almacenamiento persistente del estado de consultas e identificación inteligente de duplicados para evitar la retransmisión de alertas previamente emitidas.
  - Lectura dinámica de la clave API de AEMET desde la configuración persistente del operador (`sat_config.json`).
- **Sección de Perfiles y Presets en Pilar IV: Respuesta (`src/App.tsx` & `src/components/system/UserProfileManager.tsx`)**:
  - Implementación de un gestor visual de presets de estación en la columna de respuesta del Pilar IV.
  - Persistencia segura y bidireccional en Google Cloud Firestore vinculada al perfil del operador activo (`users/{uid}/presets`).
  - Soporte completo para crear, editar, eliminar y precargar presets por defecto con roles tácticos (como *CECOP Coordinador Central*, *iGate Redundante* y *Unidad Móvil de Campaña*).
  - Mecanismo de aplicación en un clic ("Aplicar Preset Activo") que actualiza de inmediato el indicativo de llamada (Callsign), SSID y comentario de baliza activa del NUC mediante `UserProfileManager`.
- **Integración con Sistemas de Notificación**:
  - Generación de toasts dinámicos en pantalla al activar perfiles para mantener informado al operador de manera visual.

### Modificado
- Adaptado el linter y compilado del frontend en React para certificar una compilación libre de errores.
- Actualización de tipos TypeScript para dar soporte a las configuraciones rápidas de estación.

---

## [v1.0.0] - Lanzamiento Inicial
### Añadido
- Arquitectura central de los Pilares I al X para la monitorización de riesgos en tiempo real (Sismos, Incendios, Avisos Meteorológicos, Canales de Emergencia y Tráfico Marítimo NAVTEX).
- Consola de Auditoría de tramas de radio para el CECOP (Pilar II).
- Adaptador y compilador de tramas APRS (AX.25).
