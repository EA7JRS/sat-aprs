# Changelog - APRS S.A.T. EMCOM System

Este archivo registra el historial de versiones progresivas y cambios realizados en la consola de emergencias civiles y telecomunicaciones de emergencia REMER.

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
