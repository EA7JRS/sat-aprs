# Manual de uso de S.A.T.-APRS+

© 2026 Manuel - EA7JRS · versión de la consola: **v1.46.1**

Este manual explica qué hace cada pantalla de la consola, cómo se usa y qué hace falta tener en marcha en el equipo para que muestre datos. La instalación está en el [README](../README.md#️-guía-de-instalación-desde-cero) y el funcionamiento interno en [ARQUITECTURA.md](ARQUITECTURA.md).

## Índice

1. [Antes de empezar](#1-antes-de-empezar)
2. [Puesta en marcha paso a paso](#2-puesta-en-marcha-paso-a-paso)
3. [Inicio](#3-inicio)
4. [Avisos](#4-avisos)
5. [Estación](#5-estación)
6. [Mapa](#6-mapa)
7. [Radio](#7-radio)
8. [Sistema](#8-sistema)
9. [Consola de comandos: referencia](#9-consola-de-comandos-referencia)
10. [Casos de uso](#10-casos-de-uso)
11. [Solución de problemas](#11-solución-de-problemas)
12. [Servicios, puertos y archivos](#12-servicios-puertos-y-archivos)

---

## 1. Antes de empezar

### Una estación real

Lo que emite S.A.T.-APRS+ sale al aire y a la red APRS-IS mundial **con su indicativo**. La consola nunca transmite datos simulados o de prueba, pero lo real sí: un aviso, un mensaje, una baliza o el PTT del equipo. Por eso:

- **La emisión viene apagada.** Se activa en el archivo `.env` con `SAT_APRS_TX=on` y reiniciando el servicio. Mientras esté apagada, la consola funciona igual pero avisa de que «no sale al aire».
- **Sin un indicativo válido no se emite nada**, y sin el passcode correcto no se envía nada a APRS-IS.
- **Lo que transmite por radio pide confirmación**: el PTT del equipo (que además se suelta solo a los 3 minutos), la emergencia remota (EAI) y las sesiones de Winlink por radio.

### Administrador y visitantes

Cualquiera que abra la consola puede **ver** el estado de la estación. Para **cambiar** algo (ajustes, archivos `.conf`, mover el rotor, emitir, leer el correo) hace falta ser administrador:

- Con el botón **«Acceder»** y el token de `SAT_ADMIN_TOKEN` (en `.env`). El token se pide una vez por navegador.
- O, en la propia pantalla de la estación, con `SAT_TRUST_LOCALHOST=on`.

Sin ningún administrador configurado, la consola funciona en **modo demostración**: se puede tocar todo, pero no se guarda nada en disco.

Los mensajes APRS, el correo de Winlink y los detalles de las estaciones del grupo solo se muestran al administrador; a los visitantes, solo las cuentas.

### Moverse por la consola

- **Seis secciones** en la barra lateral (abajo en el móvil): Inicio, Avisos, Estación, Mapa, Radio y Sistema. Cada una tiene sus pantallas en pestañas.
- **Barra de estado** (arriba): indicativo y las alertas de la estación, como «Emisión desactivada», «APRS-IS sin sesión», «RF sin Direwolf», «Posición fija» u «Hora sin sincronizar». Cada una indica dónde se arregla.
- **Color**: automático (sigue la hora del sol), del sistema, claro, oscuro o **táctico** (ámbar, rojo, verde o azul) para operar de noche sin perder la visión nocturna.
- Todas las horas de radio van en **UTC**.

---

## 2. Puesta en marcha paso a paso

| Paso | Dónde | Qué |
| :--- | :--- | :--- |
| 1 | `.env` | `SAT_ADMIN_TOKEN` (o `SAT_TRUST_LOCALHOST=on`). Deje `SAT_APRS_TX=off` hasta el paso 8. |
| 2 | Estación → Perfil | Indicativo y SSID, passcode de APRS-IS, posición (GPS, coordenadas o locator), símbolo, PHG, comentario y ruta. |
| 3 | Sistema → Configuración | Claves de API opcionales (AEMET, OpenWeatherMap…). Sin ellas la meteorología sale de Open-Meteo. |
| 4 | Avisos → En vigor | Abra un aviso y ajuste las **reglas** de su tipo: radio en km, nivel mínimo y cada cuánto se repite. |
| 5 | Equipo (fuera de la consola) | gpsd con el GPS, ntpsec, Direwolf con `KISSPORT 8001` y `LOGDIR /var/log/direwolf`, aprx con `rflog`. Compruebe en Radio → Direwolf y Radio → aprx que se ven en marcha. |
| 6 | Radio → Principal | Conecte lo que tenga: equipo (rigctld), rotor (rotctld o la caja APRS LoRa+ Rotor), cluster DX, cuenta de DAPNET, satélites favoritos y grupo ARTS. |
| 7 | Inicio | Revise que las fuentes responden y que la posición y la hora son las reales. |
| 8 | `.env` | Con todo comprobado, `SAT_APRS_TX=on` y reinicie el servicio (`sudo systemctl restart sat-aprs`). |

> Si ya emite la baliza con aprx o Direwolf con el mismo indicativo, deje apagada la baliza de la consola para no duplicarla.

---

## 3. Inicio

La portada responde de un vistazo a cuatro preguntas:

- **¿Pasa algo en mi zona?** Los avisos activos que cumplen sus reglas. «Ver todos» lleva a Avisos.
- **¿Cómo está la estación?** Posición (de gpsd o fija), hora (ntpsec), baliza y meteorología actual.
- **¿Qué se ha emitido?** Las últimas tramas que han salido.
- **¿Responden las fuentes?** El estado de cada fuente oficial: si contestó, cuándo, y el error si falló.

---

## 4. Avisos

### En vigor

Todos los avisos que ha recibido la cadena, separados en dos grupos:

- **Se difunden**: cumplen las reglas (dentro del radio, nivel suficiente, vigentes). Para cada uno se ve la trama del **objeto APRS** (en el lugar del suceso) y la del **boletín**, cuándo se emitió y cuándo se repetirá.
- **Fuera de tus reglas**: se muestran pero no se emiten, con el motivo (fuera del radio, gravedad inferior a la mínima, aviso caducado, aún no está próximo…).

Al abrir un aviso:

- **Reglas** del tipo de aviso, editables por el administrador. Valores de serie:

  | Tipo | Radio | Umbral | Otros |
  | :--- | :--- | :--- | :--- |
  | Meteorológicos (AEMET) | 25 km | nivel amarillo | se anuncia con 12 h de antelación; se repite cada 60 min |
  | Sismos (IGN) | 200 km | magnitud 4 | se repite cada 30 min |
  | Focos de calor (FIRMS) | 50 km | nivel naranja | — |
  | Clima espacial (NOAA) | — | escala R, S o G 2 | — |
  | Calidad del aire (CAMS) | — | nivel naranja | — |
  | Umbrales de la estación | en la estación | viento 20 kn, calor 35 °C, frío 5 °C, lluvia 10 mm/h | un aviso por tipo y día; se activa en Sistema → Configuración → Claves API |
  | Pronóstico (WeatherAPI) | en la estación | sus avisos oficiales; viento 25 kn, helada 0 °C, lluvia 20 mm al día | hasta 3 días; necesita la clave de WeatherAPI |
  | MeteoAlarm | las zonas que se siguen | nivel amarillo | se repite cada 60 min; con AEMET activado no repite las zonas de España |
  | Ciclones tropicales (NHC) | 1000 km | nivel amarillo (depresión), naranja (tormenta), rojo (huracán) | se repite cada 3 h |
  | Radiactividad (EURDEP) | 100 km | 0,3 µSv/h (amarillo; ×3 naranja; ×10 rojo) | medidas de las últimas 12 h, sin validar |

  | Tsunamis (tsunami.gov) | 3000 km | nivel amarillo (vigilancia); aviso naranja, alerta rojo | mensajes de las últimas 24 h del PTWC y el NTWC; la categoría es la del centro de alerta |
  | NWS de EE. UU. | en la estación | nivel naranja | tornados, tormentas severas, huracanes…; solo cubre EE. UU. |
  | Sismos de fuera de España (EMSC) | por magnitud y distancia | nivel amarillo | M3,5 o más a menos de 15°, últimas 24 h; no repite los del IGN |
  | Peligro de incendio (EFFIS) | en la estación | nivel naranja (muy alto); alto amarillo, extremo rojo | índice FWI oficial de hoy y de los dos días siguientes |
  | Áreas quemadas (EFFIS) | 100 km | amarillo; naranja desde 500 ha, rojo desde 5000 ha | perímetros cartografiados en los últimos 10 días |
  | NASA EONET | 300 km | todo entra en amarillo | inundaciones, tormentas severas, volcanes, deslizamientos e incendios abiertos |

  MeteoAlarm, ciclones, radiactividad, EMSC, EFFIS, NWS y EONET vienen apagadas y se encienden en **Sistema → Configuración → Claves API & Puertos → Más fuentes de avisos**:
  - **MeteoAlarm** (EUMETNET): avisos oficiales de los servicios meteorológicos europeos, sin clave. Su feed no trae el contorno de las zonas, así que se indica qué zonas sigue la estación: por su código EMMA_ID (`PT014`) o por una parte del nombre (`Algarve`). La pantalla muestra las zonas que han tenido aviso, para elegirlas con un toque. Útil cerca de la frontera (Portugal, Francia, Andorra) o si AEMET está apagado.
  - **Ciclones tropicales** del Centro Nacional de Huracanes de EE. UU. (`CurrentStorms.json`): clase, intensidad, presión y posición del último aviso; el objeto APRS va en el centro del ciclón.
  - **EMSC** (Centro Sismológico Euro-Mediterráneo, CC BY 4.0): sismos de Portugal, Marruecos, Argelia, Italia o el Atlántico, que el IGN no da. El nivel es el de la app Android, por magnitud y distancia: amarillo M4 a menos de 100 km, M5 a menos de 600 o M6 a menos de 2000; naranja M5 a menos de 300, M6 a menos de 1000 o M7,5 a menos de 3000; rojo M6 a menos de 300 o M7 a menos de 1000. Un sismo que ya figura en la lista del IGN (menos de 60 km, 90 s y 0,6 de magnitud de diferencia) no se repite.
  - **EFFIS** (Sistema Europeo de Información sobre Incendios Forestales, Copernicus; datos CC BY 4.0): el **peligro de incendio** es el índice FWI oficial en el punto de la estación, con las clases de EFFIS (muy bajo, bajo, moderado, alto, muy alto, extremo); la pantalla muestra el valor de los tres días. Es la capa de peligro de incendios del mapa de la Red de Alerta Nacional de Protección Civil, tomada de la fuente europea. Si EFFIS no tiene datos de un día, se dice «sin datos»: no se toma por «sin peligro». Las **áreas quemadas** son los perímetros que EFFIS cartografía por satélite, con sus hectáreas; el objeto APRS va en el centro del perímetro.
  - **NWS** y **NASA EONET** son las fuentes de tornados y de sucesos naturales de la app Android APRS LoRa+, con el mismo lector. El NWS da los avisos en vigor para el punto de la estación y solo cubre Estados Unidos: en España la fuente responde «fuera de cobertura» y no hay avisos. EONET es mundial pero no da gravedad.
  - **Radiactividad ambiental**: la última tasa de dosis gamma de las sondas de EURDEP (entre ellas, las de la REA del CSN), de los datos abiertos que publica la BfS alemana. La tabla de la pantalla da las cinco sondas más cercanas; la más cercana alimenta también la regla «Radiación» de las notificaciones. Son medidas sin validar: revise las condiciones de uso de EURDEP antes de difundir más allá de la estación.

- **«Emitir ahora»** pone el aviso en la cola de emisión sin esperar a la repetición. Con la emisión apagada se registra, pero no sale.

Los sismos tienen además su tabla con fecha, magnitud, profundidad, lugar y distancia.

### Salud

Temperaturas y salud, solo con datos reales: los avisos de temperatura en vigor de la cadena de Avisos, las máximas y mínimas previstas en la posición de la estación (Open-Meteo) y el acceso a los dos paneles oficiales, el **índice Kairós** del Instituto de Salud Carlos III (riesgo de mortalidad atribuible a temperaturas extremas, tres niveles, a seis días) y **Meteosalud** del Ministerio de Sanidad. Ninguno de los dos publica sus datos en un formato legible por la consola, así que sus niveles no se muestran ni se difunden. Es de consulta; no emite nada.

---

## 5. Estación

### Estación y meteo

La observación actual (temperatura, viento, humedad, presión y lluvia). La consola indica la **fuente**: OpenWeatherMap o AEMET (observaciones, con clave) u Open-Meteo (modelo, sin clave). Si ninguna responde, lo dice y no muestra nada; nunca hay datos inventados. Debajo, los **medidores de calidad del aire** más cercanos (Sensor.Community).

### Perfil

El perfil APRS de la estación:

| Campo | Notas |
| :--- | :--- |
| Titular, indicativo y SSID | La consola valida el indicativo. |
| Passcode de APRS-IS | Avisa si no corresponde al indicativo. |
| Posición | Del GPS (gpsd) o fija: por coordenadas, por locator Maidenhead o con el botón flotante «Posición fija desde este dispositivo». Con el GPS en fijo, manda el GPS. |
| Símbolo, PHG y comentario | Lo que verán las demás estaciones. |
| Ruta | De serie `WIDE1-1,WIDE2-1`. |
| Baliza de posición | Apagada de serie, con su intervalo. En el perfil técnico, más abajo: SmartBeaconing, rutas y Mic-E. |
| Parte meteorológico por APRS | De dónde salen los datos: estación propia (base de datos de WeeWX o `wxnow.txt`) o Internet. |

### WeeWX

Lo que da WeeWX de verdad, leído de su configuración (`weewx.conf`) y de su base de datos (SQLite, en solo lectura con `sqlite3`):

- **Estado**: el servicio, si la base de datos se lee y cuándo fue la última lectura, y si el parte meteorológico por APRS está activo y con qué datos.
- **Lectura actual**: temperatura, humedad, presión con su tendencia de 3 h, viento y dirección, y lluvia de la última hora. Debajo de cada valor, los extremos de las últimas 24 h.
- **Gráficas de 24 h**: temperatura, presión, humedad y viento medio, con medias por hora. Al pasar el dedo o el ratón se lee cada hora.
- **Configuración**: tipo de estación, ubicación, intervalo de archivo y base de datos. Desde aquí se puede «Leer de nuevo», «Ver registro» y «Reiniciar servicio».

La base de datos que se lee es la de Estación → Perfil → «Parte meteorológico por APRS» (de serie `/var/lib/weewx/weewx.sdb`), o si no la de `weewx.conf`. Hace falta la orden `sqlite3` (`sudo apt install sqlite3`) y que el usuario de la consola pueda leer el archivo. Si no se puede, la pantalla dice por qué y no muestra gráficas.

---

## 6. Mapa

### Mapa

Un mapa base (OpenStreetMap) con capas que se encienden y apagan; la elección se recuerda en el navegador:

| Capa | Qué muestra | De dónde |
| :--- | :--- | :--- |
| Estación | Su posición | gpsd o la posición fija |
| Avisos | Sismos y zonas de aviso de AEMET; los que se difunden, resaltados | La cadena de avisos |
| APRS | Estaciones oídas por radio y por APRS-IS, distinguidas | Direwolf (KISS) y APRS-IS |
| AIS | Barcos | AIS-catcher o rtl_ais por UDP 10110 (o un servidor TCP) |
| ADS-B | Aeronaves | readsb o dump1090, puerto SBS 30003 |
| Tráfico | Incidencias de la DGT | DGT (DATEX II) |

**Nada de lo que aparece en el mapa se retransmite.** Sin Internet se siguen viendo las capas, pero no el fondo.

### Tráfico

Las incidencias de la DGT en lista, con filtros por tipo, nivel (verde, amarillo, rojo, negro), distancia y rumbo desde la estación.

### Boyas

Las boyas y estaciones costeras más cercanas de la NOAA (NDBC), con su distancia: ola, viento, presión, temperatura del aire y del agua, y la hora de la observación.

---

## 7. Radio

### 7.1 Principal

La estación de radio en una pantalla. Cada panel dice qué le falta si no está configurado; los ajustes los cambia el administrador desde el propio panel.

#### Equipo (CAT)

Con **Hamlib** (`rigctld`, de serie en `127.0.0.1:4532`) maneja cualquier equipo que Hamlib soporte.

- Muestra la frecuencia, el modo, el VFO y el **S-meter** con la escala de colores IARU de los demás equipos APRS LoRa+.
- Permite sintonizar, cambiar de modo y de VFO, y emitir con el **PTT**. El PTT pide confirmación y se suelta solo a los 3 minutos.

Para arrancar `rigctld` con su equipo, por ejemplo un IC-7300 por USB:
```
rigctld -m 3073 -r /dev/ttyUSB0 -s 115200 -t 4532
```
(`rigctl -l` lista los modelos.)

#### Rotor

Dos formas de conectarlo:

- **rotctld** de Hamlib (de serie en el puerto 4533).
- La **caja APRS LoRa+ Rotor** por TCP 4534, con su PIN.

La **esfera** muestra el acimut, el objetivo, la proa (si la estación se mueve) y la elevación. Hay botones para ir a un acimut, parar y aparcar.

**Seguimiento**: el rotor sigue a un objetivo y se resitúa cada vez que cambia 2° o más. Objetivos posibles:
- una estación APRS;
- un barco (AIS), por MMSI o nombre;
- una aeronave (ADS-B);
- la última estación oída por radio;
- un punto;
- el Sol o la Luna;
- un satélite.

Si el objetivo deja de oírse, su posición se **estima** por su último rumbo y velocidad durante 5 minutos como máximo. Se marca con `~`.

**Estación en movimiento** (SUV, velero): active «el rotor va en un vehículo o barco». La posición sale del GPS y el acimut verdadero se convierte en ángulo respecto a la proa con el rumbo del GPS. El rumbo solo se toma en marcha (3 km/h o más); parado se conserva el último, y hasta tener uno el seguimiento espera.

#### Satélites

- **Actualizar TLE** descarga los elementos orbitales y los transmisores, igual que el resto del ecosistema APRS LoRa+ (CelesTrak + SatNOGS).
- **Favoritos** (de serie la ISS): dónde están ahora, su próximo paso (sale → máximo → se pone) y si es visible.
- Para cada transmisor: subida, bajada y modo. Desde ahí se puede **Sintonizar**, **Seguir con el rotor** o **Seguir Doppler**:
  - El equipo se resintoniza solo durante el paso: bajada a f·(1 − v/c) y, si tiene subida distinta y el equipo acepta split, subida a f·(1 + v/c).
  - Solo se reenvía la frecuencia cuando el cambio pasa de 1 kHz en FM o de 50 Hz en los demás modos.
  - Termina al ponerse el satélite o si usted mueve el dial.

#### Cluster DX

Cliente telnet de un nodo DX (DXSpider, AR-Cluster…; de serie el puerto 7300).

- Cada spot llega con **país, rumbo y distancia** (tabla `cty.dat`) y su banda.
- Al tocar la frecuencia de un spot se puede sintonizar el equipo y girar el rotor, según se elija.
- Las órdenes del nodo se escriben en la línea del panel, por ejemplo `sh/dx 10 on 20m`.

#### Grupo de estaciones (ARTS)

Vigila hasta **5 indicativos**, como el tracker APRS LoRa+. Con SSID solo vale ese; sin SSID, cualquiera.

- **En alcance**: se ha oído **por radio** dentro del plazo (10 min de serie) y, si hay distancia máxima, más cerca. Lo oído solo por APRS-IS se anota aparte: no es estar en alcance.
- **Sondeo** opcional (60 a 3600 s): envía «ping» a quien lleva ese tiempo sin oírse; los trackers APRS LoRa+ responden «pong».
- El **radar** sitúa a cada miembro por rumbo y distancia.
- **Emergencia remota (EAI)**: activa la emergencia en un tracker del grupo que la tenga habilitada con un código de 4 a 10 letras o cifras. Se envía el mensaje `EAI <código>` y el tracker contesta `EAI ON …`; para pararla, `EAI STOP <código>`. Pide confirmación.

#### Mensajería

- **APRS**: mensajes con acuse (67 caracteres). Se reintentan a los 30, 60, 120 y 240 s si no llega el acuse. Se responde desde el propio mensaje, y también se pueden enviar boletines `BLNn`.
- **DAPNET** (buscapersonas): con su cuenta de hampager.de, mensajes de 80 caracteres al grupo de transmisores (de serie `ea-all`), normales o de emergencia.

#### Consola de comandos

Todo lo anterior también se puede escribir como «módulo orden argumentos». Tiene historial con ↑ ↓, botones de módulo y la referencia de órdenes, que al tocarlas se copian en la línea. Vea la [referencia completa](#9-consola-de-comandos-referencia).

### 7.2 Direwolf

Lo que da Direwolf de verdad:
- **Estado** del servicio, de la conexión KISS (puerto 8001) y del canal.
- **Tráfico** por minuto de la última hora, recibidas y emitidas.
- **Tramas en directo**, explicadas en castellano («posición de EA7XXX-9 a 12 km», «mensaje para…»), con el digipeater por el que llegaron.
- **Nivel de audio** de cada estación recibida, para ajustar el volumen de la radio. Lo ideal es entre 30 y 70; fuera de ese margen se marca.
- La **configuración** leída de `direwolf.conf`, «Ver registro», «Reiniciar servicio» y **«Emitir baliza de prueba»**, que sí sale al aire si la emisión está activada.

El nivel de audio y los bits corregidos salen del registro CSV de Direwolf: hace falta `LOGDIR /var/log/direwolf` en `direwolf.conf`. Sin él, la pantalla explica cómo activarlo.

### 7.3 HF y propagación

- **Bandas ahora**: qué bandas abren para enlace local y regional (NVIS, 0-400 km) y para larga distancia (3000 km).
- **Ionosfera medida**: la ionosonda más cercana, con foF2, MUF y su antigüedad.
- **Sol y campo magnético**: índices SFI, Kp y escalas de la NOAA.
- **Detalle**: viento solar y previsión a 3 días. Si falta alguna fuente, se dice cuál y no se rellena con cifras supuestas.

### 7.4 aprx

Lo que da aprx de verdad, a partir de `aprx.conf` y de su **registro de radio** (`rflog`):

- Estado del servicio, de la **pasarela a APRS-IS** (si pasa tramas o las pierde por falta de conexión), del digipeater y de las interfaces.
- Cifras de la última hora: recibidas, pasadas a APRS-IS, descartadas (duplicadas o no válidas) y repetidas.
- Tráfico por minuto y cifras por interfaz.
- Registro en directo con el resultado de cada trama: a APRS-IS, sin APRS-IS, rechazada, repetida, baliza o de APRS-IS.

Sin `rflog /var/log/aprx/aprx-rf.log` dentro de `<logging>`, la pantalla lo explica y no muestra cifras. aprx se instala desde el fork [EA7JRS/aprx](https://github.com/EA7JRS/aprx) con `sudo sh tools/instalar-aprx.sh`.

### 7.5 Tramas APRS

Todo lo que entra y sale, en una lista:

- **Estado**: radio (KISS de Direwolf), APRS-IS y emisión. Cifras de la última hora por radio, por APRS-IS y emitidas.
- **En directo**: las últimas tramas, filtradas por vía (radio, APRS-IS, emitidas), por tipo y por indicativo o texto.
  - Cada trama se explica en castellano: posición a tantos km y rumbo, mensaje para…, boletín, objeto, Mic-E, meteorología, telemetría, estado…
  - Las emitidas dicen por dónde salieron o **por qué no salieron** (emisión desactivada, sin indicativo válido…).
  - Aquí están las 500 últimas, también tras un reinicio.
- **Historial**: todas las tramas guardadas en disco (7 días, ajustable), con búsqueda por indicativo o texto, por días y por vía. Muestra las 300 más recientes que cumplen el filtro; el administrador las exporta a CSV (hasta 5000).
- **Analizador**: al tocar una trama, o al pegar una a mano, la descompone en sus campos (origen, ruta, por dónde llegó, posición, rumbo y velocidad, PHG, altitud, texto y número de mensaje, telemetría…) y avisa de lo que no cumple: un indicativo no válido, una ruta mala, un texto de más de 67 caracteres… **Solo analiza: no emite nada.**

Los mensajes se envían desde Radio → Principal → Mensajería. Cuando llega un mensaje para la estación, sale un aviso en pantalla; su botón «Responder» lo envía de verdad por la mensajería, con acuse y reintentos.

### 7.6 Winlink

El correo por radio que lleva **Pat**, a través de su API HTTP (`pat http`, de serie en `http://127.0.0.1:8080`):

- **Estado**: servicio, si Pat contesta (con su indicativo y locator), si hay enlace y con quién, y las cuentas del buzón.
- **Buzón**: entrada, salida y enviados. Al abrir un mensaje se marca como leído en Pat. Desde ahí se puede **Responder** (con cita) o **Redactar** uno nuevo. Lo redactado queda en la **bandeja de salida**: no se transmite hasta la próxima sesión.
- **Sesión**: con los **alias de conexión** de Pat o una URL (`ax25:///EA7XXX-10`, `varafm:///…`, `ardop:///…`, `telnet`).
  - Pide confirmación y avisa si va a transmitir por radio.
  - Al terminar muestra cuántos mensajes llegaron o por qué falló.
  - La sesión se puede cortar.
- **Pasarelas RMS** por modo y banda, con distancia, rumbo, frecuencia y predicción, de la lista que Pat descarga de winlink.org.
- **Ajustes**: la dirección de la API de Pat y el nombre de su servicio. El paquete de Debian lo instala como `pat@<usuario>`; si no coincide, la pantalla dice «Fuera de systemd».

El indicativo, la contraseña de Winlink y los alias se configuran en Pat (su `config.json` o su propia web).

### 7.7 NAVTEX e Inmarsat

Radioavisos náuticos recibidos con un SDR propio. Los dos receptores vienen apagados y se encienden en esta misma pantalla (con la sesión de administrador).

**NAVTEX** (518 kHz; también 490 kHz o 4209,5 kHz):

1. Instale el descodificador y el servicio: `sudo sh tools/navtex/instalar.sh`. Compila `navtex_rx_from_file` de [fventuri/navtex](https://github.com/fventuri/navtex) (GPL-3.0; es el descodificador NAVTEX de fldigi) e instala `sat-navtex`.
2. Ajuste `/etc/default/sat-navtex`:
   - **RTL-SDR** (`SDR=rtlsdr`, con `rtl_fm`): la RTL-SDR Blog V3 necesita muestreo directo para 518 kHz (`DIRECTO=2`, entrada Q); la V4 sintoniza HF por sí sola.
   - **SDRplay RSPdx-R2** y otros equipos SoapySDR (`SDR=soapy`, con `rx_fm` de rx_tools y SoapySDRPlay3): `SOAPY=driver=sdrplay` y, si hace falta, `ANTENA`.
   - `FRECUENCIA`, `PPM`, `GANANCIA` y `SALIDA` (de serie `/var/lib/sat-aprs/navtex.txt`).
3. Arránquelo: `sudo systemctl enable --now sat-navtex`.
4. En la pantalla, encienda NAVTEX con el mismo archivo. Con «Estaciones que se siguen» (las letras B1, por ejemplo `GX`) se dejan fuera las lejanas que entran de noche.

**NAVTEX desde otro equipo de la red.** Si el receptor está en otro equipo (por ejemplo, un NUC dedicado a SDR), no hace falta lo anterior:

1. En ese equipo, instale el receptor del fork [EA7JRS/Navtex](https://github.com/EA7JRS/Navtex) y sus servicios (`sudo sh tools/instalar-servicios.sh`). Vale con SDRplay o con RTL-SDR, y recibe 518 y 490 kHz a la vez.
2. Abra allí el puerto de su interfaz web (8080) a la red local.
3. En esta pantalla, encienda NAVTEX, elija «Receptor Navtex en la red» y escriba su dirección, por ejemplo `http://sdr.local:8080`.

La consola le pregunta cada minuto por los mensajes nuevos. El estado dice si contesta, con qué equipo recibe y si le están llegando muestras.

La consola lee el archivo según crece y separa los mensajes `ZCZC B1B2B3B4 … NNNN`: estación, tema y número, el grupo fecha-hora y la primera posición que aparezca en el texto. Si llega otra cabecera sin el `NNNN`, o pasan 15 minutos, el mensaje queda como «cortado». Los temas **A, B, D y L** (los que un receptor no puede rechazar) pasan a Avisos: D (salvamento) rojo, B (meteorológico) naranja, A y L (navegantes) amarillo; de serie se difunden desde naranja. Con posición, el objeto APRS va allí y cuenta el radio (400 km); sin posición, solo boletín.

**Inmarsat-C EGC** (SafetyNET, banda L):

- El descodificador es [InmarScope](https://github.com/SarahRoseLives/InmarScope) (GPL-3.0; RTL-SDR, SDRplay, Airspy…; necesita una antena de banda L hacia el satélite). En su salida de mensajes, active el envío por **UDP** a `127.0.0.1:5556` con formato **JSON** (5556 es su puerto de serie).
- La consola junta los trozos de un mismo mensaje y da su prioridad: **Socorro** rojo, **Urgencia** naranja, **Seguridad** amarillo y **Rutina** solo se muestra. Con posición en el texto, el objeto va allí y cuenta el radio (500 km).

Los mensajes de los dos receptores se guardan en el historial y valen 12 horas desde la última vez que se reciben. Radio, nivel mínimo y repetición se cambian desde el aviso, en Avisos.

---

## 8. Sistema

### Equipo

- **Estado del NUC**: CPU, temperatura, memoria y servicios de systemd.
- **GPS y hora**: fijo, satélites y dispositivo según gpsd, y el estado de ntpsec.
- **Enlaces de la estación**: cada enlace real de la consola con su estado, con qué está conectado y qué ha pasado por él:
  - APRS-IS y Direwolf (KISS);
  - gpsd;
  - AIS y ADS-B;
  - equipo (rigctld), rotor y cluster DX;
  - Pat y NMEA 2000.
- **Historial en disco** (`sat_historial.db`): cuántas tramas y entradas del registro guarda, desde cuándo y cuánto ocupa. El administrador cambia los días que se conservan (tramas 7 y registro 30, de serie) y exporta las dos cosas a CSV. Lo más antiguo se borra cada 6 horas.
- **Perfiles del operador, avisos sonoros y diario de systemd.**

### Configuración

Pestañas:

| Pestaña | Qué se ajusta |
| :--- | :--- |
| General & Identidad | Indicativo, passcode, posición de respaldo, radio de cobertura sísmica, servidor APRS-IS y modo eco |
| Direwolf TNC Módems | Tarjeta de sonido, módem, PTT, gpsd y puerto KISS; genera `direwolf.conf` sin `CBEACON` y con `LOGDIR` |
| WeeWX Weather Engine | Controlador, base de datos e intervalos de WeeWX |
| Claves API & Puertos | Claves de OpenWeatherMap, AEMET, IQAir y WeatherAPI; umbrales meteorológicos; más fuentes de avisos (MeteoAlarm, NHC, EURDEP) |
| Alertas e Inundación | Alarmas sonoras, tonos y silencio programado de guardia; color, sonido y zoom del aviso en pantalla para las tramas con `!EMERGENCY!`, `!PRIORITY!` o `!SPECIAL!` |
| Archivos .conf Debian | Ver, validar y editar `direwolf.conf`, `aprx.conf`, `weewx.conf`, el `config.json` de Pat y `axports` |
| Estación APRS | El mismo perfil que Estación → Perfil |

Las claves y contraseñas guardadas se muestran como `********` y no salen nunca de la consola.

### Conectividad

**Salida NMEA 2000** por SocketCAN (adaptador CAN a 250 kbit/s, interfaz `can0` de serie). El NUC reclama una dirección en el bus y envía los datos **propios** de la estación a un plotter (Garmin GPSMAP y otros):

| Dato | PGN |
| :--- | :--- |
| Posición, rumbo y velocidad del GPS | 129025, 129026 |
| Hora | 126992 |
| Viento, presión y temperatura | 130306, 130314, 130316 |
| Navegación, si hay objetivo o ruta | 129283, 129284 |
| Avisos de emergencia, como mensaje de seguridad AIS | 129802 |

Lo recibido por radio (AIS, ADS-B, APRS) **no** se reenvía al bus. Para levantar la interfaz:
```
sudo ip link set can0 up type can bitrate 250000
```

### Pruebas y simulación

Para ensayar sin emitir: el terminal de tramas, con su inyector de un sismo, una alerta de clima espacial o una trama APRS de prueba. Todo lo que entra por aquí se ve en pantalla pero **nunca se transmite**; en el registro aparece como `[NO EMITIDO: datos simulados o de prueba]`.

---

## 9. Consola de comandos: referencia

Formato: `módulo orden argumentos`. `help` lista los módulos y `help <módulo>` sus órdenes. Solo para el administrador; lo que mueve o emite respeta la política de emisión, y las órdenes marcadas con ⚠ piden confirmación.

Las frecuencias se escriben así: con decimales son MHz (`14.205`), un número menor de 1 000 000 son kHz (`14205`, `145825`) y uno mayor son Hz (`14205000`).

| Orden | Qué hace |
| :--- | :--- |
| **`cat`** · equipo por CAT (rigctld) | |
| `cat get` | Frecuencia, modo, VFO, PTT y S-meter |
| `cat f <frecuencia>` | Sintoniza |
| `cat m <modo>` | USB, LSB, CW, CWR, AM, FM, RTTY, PKTUSB… |
| `cat vfo a\|b` | Cambia de VFO |
| `cat ptt on\|off` | ⚠ Emite o suelta (se suelta solo a los 3 min) |
| **`rot`** · rotor | |
| `rot get` | Acimut, elevación, objetivo y seguimiento |
| `rot pos <az> [el]` | Va a ese acimut verdadero y elevación |
| `rot stop` · `rot park` | Para · aparca (también deja de seguir) |
| `rot follow aprs\|barco\|avion <id>` | Sigue a una estación, un barco (MMSI o nombre) o una aeronave |
| `rot follow sat <NORAD\|nombre>` | Sigue a un satélite |
| `rot follow sol\|luna\|ultima` | Sol, Luna o la última estación oída por radio |
| `rot unfollow` | Deja de seguir |
| **`dx`** · cluster DX | |
| `dx spots [n]` | Últimos spots con país, rumbo y distancia |
| `dx go <n>` | Sintoniza el equipo y gira el rotor al spot n |
| `dx <orden del nodo>` | Pasa la orden al nodo: `dx sh/dx 10 on 20m`, `dx sh/wwv`, `dx dx 14205 EA7XYZ 59` |
| **`aprs`** | |
| `aprs msg <indicativo> <texto>` | Mensaje con acuse (67 caracteres) |
| `aprs bln <n> <texto>` | Boletín BLNn |
| `aprs beacon` | Emite ahora la baliza de la estación |
| `aprs heard [n]` | Últimas estaciones oídas por radio |
| **`dapnet`** | |
| `dapnet send <ind[,ind]> <texto>` | Mensaje (80 caracteres) al grupo de transmisores |
| `dapnet emerg <ind[,ind]> <texto>` | Igual, con prioridad de emergencia |
| **`sat`** · satélites | |
| `sat list` | Favoritos: dónde están y su próximo paso |
| `sat next <NORAD\|nombre>` | Próximo paso |
| `sat tx <NORAD\|nombre>` | Sus transmisores, numerados |
| `sat doppler <NORAD\|nombre> [n]` | El equipo sigue el Doppler del transmisor n durante el paso |
| `sat doppler stop` | Deja de corregir |
| **`arts`** · grupo de estaciones | |
| `arts list` | Estado de cada miembro |
| `arts poll` | «ping» a todo el grupo |
| `arts add\|del <indicativo>` | Añade o quita un miembro (hasta 5) |
| `arts on\|off` | Enciende o apaga la vigilancia |
| **`eai`** · emergencia remota | |
| `eai <indicativo> <código>` | ⚠ Activa la emergencia en un tracker del grupo |
| `eai <indicativo> <código> stop` | La para |
| **`n2k`** · NMEA 2000 | |
| `n2k estado` | Bus, interfaz y dirección |
| `n2k on\|off` | Enciende o apaga la salida al bus |

Ejemplos:
```
sat doppler ISS 1
rot follow sat ISS
dx sh/dx 20 on 40m
dx go 3
aprs msg EA7XYZ-9 QRV en 145.500, 73
arts add EA7KZ-9
eai EA7KZ-9 MONTE24
```

---

## 10. Casos de uso

### Estación fija de alerta temprana para su comarca

1. Perfil con su indicativo, passcode y la posición de la estación.
2. En Avisos, abra un aviso de cada tipo y ajuste sus **reglas** a su comarca (por ejemplo 40 km para meteorología y 150 km para sismos) y el umbral.
3. Compruebe en Inicio que IGN y AEMET responden y, con `SAT_APRS_TX=on`, deje la estación en marcha.
4. Cuando entre un aviso dentro de sus reglas, la estación emite el objeto en el lugar y el boletín, y los repite mientras siga vigente. En Avisos se ve qué se emitió y cuándo se repetirá.

### Estación móvil en el SUV o el velero

- gpsd con el GPS del vehículo: la posición, el radio de avisos y la baliza acompañan a la estación.
- En Rotor, active **el rotor va en un vehículo o barco**: los ángulos se calculan respecto a la proa con el rumbo del GPS.
- En el velero, la salida **NMEA 2000** lleva al plotter la posición, el viento, la presión y los avisos de emergencia.

### Un paso de la ISS por el repetidor

1. Satélites → **Actualizar TLE**; la ISS ya es favorito.
2. Antes del paso, en su transmisor de FM: **Seguir con el rotor** y **Seguir Doppler**.
3. El equipo corrige la bajada (y la subida, si admite split) y el rotor la sigue. Al ponerse, todo termina solo.

Desde la consola: `rot follow sat ISS` y `sat doppler ISS 1`.

### Salida de montaña con un grupo de trackers

1. Grupo de estaciones: añada a los trackers del grupo (hasta 5), con plazo de 10 min y una distancia máxima.
2. Active el **sondeo** (por ejemplo cada 300 s): quien no se oiga recibe un «ping».
3. El radar muestra dónde está cada uno y quién está **fuera** de alcance.
4. Si alguien no responde y lo necesita, **Activar emergencia** con el código EAI que tenga configurado su tracker.

### Un parte por Winlink, por VHF

1. Radio → Winlink → **Redactar**: destinatario (indicativo o correo), asunto y texto. Queda en Salida.
2. **Pasarelas RMS** → modo Packet, banda 2 m: elija la más cercana.
3. Conecte con el alias de Pat de esa pasarela, o escriba `ax25:///EA7XXX-10`, y confirme.
4. Al terminar se ve cuántos mensajes llegaron; lo enviado pasa a Enviados.

### Trabajar un spot del cluster

En Cluster DX, toque la frecuencia del spot: el equipo sintoniza y el rotor gira hacia el país. Desde la consola: `dx spots`, y luego `dx go <n>`.

---

## 11. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| :--- | :--- | :--- |
| «Emisión desactivada» en la barra | `SAT_APRS_TX` no está en `on` | Edite `.env` y reinicie `sat-aprs` |
| «APRS-IS sin sesión» | Sin Internet, servidor caído o passcode incorrecto | Estación → Perfil indica si el passcode corresponde al indicativo |
| «RF sin Direwolf» | Direwolf parado o sin `KISSPORT 8001` | Radio → Direwolf: estado, «Ver registro» |
| Direwolf sin nivel de audio | Falta `LOGDIR` o la consola no puede leer la carpeta | `LOGDIR /var/log/direwolf` y permisos de lectura |
| aprx sin cifras | Falta `rflog` en `aprx.conf` | Añádalo dentro de `<logging>` y reinicie aprx |
| aprx no arranca tras instalarlo | `STARTAPRX="no"` en `/etc/default/aprx` | `sudo sh tools/instalar-aprx.sh` lo deja en `"yes"` |
| Winlink: «Pat no contesta» | `pat http` parado o en otra dirección | `sudo systemctl enable --now pat@<usuario>`; revise `http_addr` |
| Winlink: «Fuera de systemd» | El servicio se llama `pat@<usuario>` | Radio → Winlink → Ajustes → servicio |
| Equipo o rotor «sin enlace» | `rigctld` o `rotctld` parados, o puerto distinto | Arránquelos y revise host y puerto en su panel |
| El Doppler se para solo | Se movió el dial del equipo, o se puso el satélite | Vuelva a pulsar «Seguir Doppler» |
| «Posición fija» | gpsd sin fijo o sin GPS | `cgps` para comprobar el GPS |
| WeeWX sin gráficas | Falta `sqlite3`, la ruta de la base de datos no es la buena o no se puede leer | Estación → WeeWX dice el motivo; `sudo apt install sqlite3` y revise la ruta en Estación → Perfil |
| «Hora sin sincronizar» | ntpsec sin fuente válida | `ntpq -p` |
| No se guardan los cambios | No es administrador, o no hay ninguno configurado (modo demostración) | «Acceder» con el token, o configure `SAT_ADMIN_TOKEN` |
| No sé dónde va el token | El acceso de administrador está en la barra superior | «Entrar como administrador» y pegue el valor de `SAT_ADMIN_TOKEN` de `/opt/sat-aprs/.env` |
| El actualizador dice «el puerto 3000 lo ocupa otro proceso» | Queda en marcha un servicio de la versión antigua (`sat-aprs-web`, pm2…) | `sudo sh tools/instalar.sh` retira los antiguos; o `sudo systemctl disable --now <nombre>` y `sudo sh tools/actualizar.sh --aqui` |
| «sudo: a password is required» al guardar un `.conf` o reiniciar un servicio | Falta el permiso del usuario de servicio | `sudo sh tools/instalar.sh` instala `/etc/sudoers.d/sat-aprs` |
| APRS-IS «desconectado» con un servidor local (aprsc) | El servidor local está parado | `systemctl status aprsc`; la consola dice el motivo y reintenta cada minuto como mucho |
| WeeWX: «en modo simulador» | `station_type = Simulator` en `weewx.conf` | Sus valores son inventados y la consola no los usa. Con una estación real: `weectl station reconfigure` |
| Tras actualizar, la consola no arranca | Fallo de arranque de la versión nueva | El actualizador enseña el registro y la orden exacta para volver a la versión anterior; la configuración está en `copias/<fecha>/` |

El diario de cada servicio se ve desde su pantalla («Ver registro») o con `journalctl -u <servicio>`.

---

## 12. Servicios, puertos y archivos

**Mantenimiento por SSH** (detalle en el README, «Procedimiento de Actualización»):

| Para | Orden |
| :--- | :--- |
| Ver si hay versión nueva | `sudo sh /opt/sat-aprs/tools/actualizar.sh --comprobar` |
| Actualizar | `sudo sh /opt/sat-aprs/tools/actualizar.sh` |
| Montar la consola o migrar desde una carpeta antigua | `sudo sh tools/instalar.sh [--desde /opt/sat-aprs.antiguo]` |
| Registro en vivo | `journalctl -u sat-aprs -f` |
| Reiniciar | `sudo systemctl restart sat-aprs` |


| Servicio | Para qué | Enlace con la consola |
| :--- | :--- | :--- |
| `sat-aprs` | La consola y el servicio | HTTP 3000 |
| gpsd | Posición GPS | TCP 2947 |
| ntpsec | Hora | `ntpq` |
| Direwolf | Módem/TNC | KISS TCP 8001; registro CSV en `/var/log/direwolf` |
| aprx | iGate y digipeater | `/etc/aprx.conf` y `rflog` |
| rigctld (Hamlib) | Equipo por CAT | TCP 4532 |
| rotctld (Hamlib) | Rotor | TCP 4533 |
| Caja APRS LoRa+ Rotor | Rotor | TCP 4534 (JSON, con PIN) |
| Nodo DX | Cluster | Telnet (7300 de serie) |
| DAPNET | Buscapersonas | `hampager.de` (HTTPS) |
| Pat | Winlink | HTTP 8080 (`pat http`) |
| AIS-catcher / rtl_ais | AIS | UDP 10110 (o TCP) |
| readsb / dump1090 | ADS-B | SBS TCP 30003 |
| `sat-navtex` (tools/navtex) | NAVTEX con SDR | Archivo `/var/lib/sat-aprs/navtex.txt` |
| `navtex-receiver`, `navtex-web` (EA7JRS/Navtex, en este u otro equipo) | NAVTEX en 518 y 490 kHz | HTTP `8080` (`/api/messages`, `/api/status`) |
| InmarScope | Inmarsat-C EGC | UDP 5556 (JSON) |
| WeeWX | Estación meteorológica | Parte por `wxnow.txt` o su base de datos |
| SocketCAN | NMEA 2000 | `can0`, 250 kbit/s |

Archivos de la consola, en su carpeta de instalación:

| Archivo | Qué guarda |
| :--- | :--- |
| `.env` | Emisión, token de administrador, red |
| `sat_config.json` | Ajustes de la consola (los guarda la propia consola) |
| `sat_perfil.json` | Perfil del operador, estaciones y presets |
| `sat_avisos.json` | Avisos ya emitidos y cuándo se repiten |
| `copias/<fecha>/` | Copias de la configuración y del historial que hace `tools/actualizar.sh` antes de cada actualización (las diez últimas) |
| `sat_historial.db` (y `-wal`, `-shm`) | Historial en SQLite: tramas, registro de la consola y mensajería, que sobreviven a un reinicio |
| `config.ini` | Del agente antiguo, ya retirado: se importa una vez si no hay `sat_config.json` |

Ninguno de ellos está en git: las actualizaciones no los tocan.
