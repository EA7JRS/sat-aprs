# S.A.T.-APRS+ · Normas, especificaciones y reglamentos

© 2026 Manuel - EA7JRS · versión de la consola: **v1.50.0** · ediciones comprobadas el 22 de noviembre de 2026 · [Manual](MANUAL.md) · [Arquitectura](ARQUITECTURA.md)

Este documento dice qué normas y especificaciones contempla la consola, qué aplica de cada una y qué no.

> **S.A.T.-APRS+ no es un equipo homologado ni un servicio oficial de alertas.** Difunde por APRS avisos que publican organismos oficiales y lo que recibe por radio; no sustituye a esos organismos, al 112, a ES-Alert ni a los equipos que la normativa marítima exige a bordo. La salida NMEA 2000 no está certificada por la NMEA.

## Resumen

| Ámbito | Norma o especificación | Qué se aplica |
| :--- | :--- | :--- |
| Emisión de radioaficionado | Reglamento de Radiocomunicaciones de la UIT (edición de 2024), artículo 25; en España, Orden IET/1311/2013, en vigor | Identificación con el indicativo en cada trama, emisión en claro, y varios seguros que impiden emitir sin indicativo válido |
| APRS | APRS Protocol Reference 1.0.1 | Posiciones, objetos, boletines, mensajes con acuse, meteorología y telemetría |
| APRS-IS | Especificación de APRS-IS (aprs-is.net) | Acceso con indicativo y passcode, ruta `TCPIP*`, construcción «q» del servidor |
| Radiopaquete | AX.25 versión 2.2 y protocolo KISS | Tramas UI reales hacia Direwolf |
| NAVTEX | UIT-R M.540-2, OMI MSC.508(105) (la vigente desde 2024), Manual NAVTEX de 2023, IEC 61097-6 | Lo aplica el receptor [Navtex](https://github.com/EA7JRS/Navtex); la consola lo respeta al recoger sus mensajes |
| AIS | UIT-R M.1371 | Lectura de los mensajes de posición y de datos estáticos; el mensaje 14 de texto de seguridad, dentro de NMEA 2000 |
| NMEA 0183 | IEC 61162-1 | Sentencias `!AIVDM` / `!AIVDO` de entrada; la salida `NRX` es del receptor Navtex |
| NMEA 2000 | IEC 61162-3; ISO 11783-3 y 11783-5 | Reclamación de dirección, transporte rápido y nueve PGN, contrastados con CANboat |
| Avisos oficiales | OASIS Common Alerting Protocol 1.2 | Lectura de los avisos de AEMET: nivel, fenómeno, vigencia y zona |
| Licencia | GNU GPL versión 3 o posterior | Todo el código propio |

## Emisión: reglamentos de radioaficionado

La consola gobierna una estación real. Lo que emite sale con el indicativo de su titular, que es quien responde de la emisión.

| Requisito | De dónde sale | En la consola |
| :--- | :--- | :--- |
| Las estaciones de aficionado se identifican con su indicativo | Reglamento de Radiocomunicaciones, artículo 25; Orden IET/1311/2013 | Cada trama lleva el indicativo. Con un indicativo de plantilla (`N0CALL`…) o mal formado no se emite, ni por radio ni por Internet |
| Las emisiones no se cifran para ocultar su significado | Reglamento de Radiocomunicaciones, artículo 25 | Todo se emite en claro, en los formatos públicos de APRS |
| Solo emite quien tiene autorización | Orden IET/1311/2013 | La emisión viene apagada (`SAT_APRS_TX=on` para activarla) y, activada, solo un administrador verificado puede cambiar la estación o provocar transmisiones |
| No se emiten señales falsas o engañosas | Reglamento de Radiocomunicaciones, artículo 15 | Nada simulado o de prueba sale al aire: queda marcado `[NO EMITIDO: datos simulados o de prueba]` |
| Acceso a APRS-IS con el passcode del indicativo | APRS-IS | Si el passcode no corresponde al indicativo, no se inyecta nada en APRS-IS |
| Un solo transmisor por indicativo y control del tiempo de emisión | Buenas prácticas de APRS | Cola única con política de emisión; el PTT se suelta solo a los 3 minutos; EAI, PTT y Winlink por radio piden confirmación |

**Lo que queda a cargo del titular:** tener la autorización de radioaficionado en vigor, usar las frecuencias y potencias de su licencia y, si la estación va a funcionar desatendida como baliza, repetidor digital o pasarela, comprobar en el reglamento de su país si necesita una autorización específica. La consola no lo comprueba.

**Recepción.** NAVTEX, AIS, ADS-B e Inmarsat-C se reciben; la consola no emite en esas bandas.

## APRS, APRS-IS y AX.25

| Requisito | Especificación | En la consola |
| :--- | :--- | :--- |
| Formatos de posición, objeto, ítem, boletín, mensaje y acuse | APRS Protocol Reference 1.0.1 | `server/aprs.ts`, `server/core/aprsAvisos.ts`; el analizador de Radio → Tramas APRS los descompone campo a campo |
| Destino (TOCALL) que identifica el programa | Registro de TOCALL de APRS | `APZSAT`, del rango `APZ` reservado a programas experimentales. **Pendiente:** pedir un TOCALL propio en el registro aprs-deviceid |
| Ruta de radio con alias `WIDEn-N` | Paradigma «New-N» de APRS | Por defecto `WIDE1-1,WIDE2-1`, ajustable |
| En APRS-IS, el cliente anuncia `TCPIP*` y el servidor añade la construcción «q» | APRS-IS | Así se emite; la consola no fabrica construcciones «q» |
| Tramas UI de AX.25 por un TNC en modo KISS | AX.25 versión 2.2; KISS | Tramas reales hacia Direwolf por KISS TCP |

## NAVTEX

Las reglas de un receptor NAVTEX las aplica el programa Navtex; están detalladas, apartado por apartado, en su documento [docs/NORMAS.md](https://github.com/EA7JRS/Navtex/blob/main/docs/NORMAS.md). La consola añade esto:

| Requisito | Norma | En la consola |
| :--- | :--- | :--- |
| Los temas A, B, D y L no se pueden rechazar | Manual NAVTEX de la OMI, 5.3.4 | Son los que pasan a Avisos; los demás solo se muestran |
| Un mensaje ya recibido no se vuelve a presentar | UIT-R M.540-2; OMI MSC.508(105), 6.2 | La repetición no crea otro aviso: solo mantiene vigente el que hay |
| El usuario puede marcar mensajes para conservarlos siempre | OMI MSC.508(105), 6.1.2 | Botón «Conservar siempre», que lo marca también en el receptor |
| Recepción buena por debajo del 4 % de errores | OMI MSC.508(105), 6.2.3 | Cada mensaje enseña sus caracteres mal recibidos; una copia buena sustituye a la que llegó con errores |
| La información de búsqueda y salvamento da una alarma que solo se apaga a mano | OMI MSC.508(105), 7; IEC 61097-6, 4.3.9 | La pantalla enseña la alarma del receptor y permite reconocerla (administrador). El mensaje salta además como aviso rojo |
| Turno de diez minutos por letra cada cuatro horas | Manual NAVTEX de la OMI, 5.2.5 | Tabla de estaciones con sus horas y próximas emisiones; cada mensaje dice si llegó fuera de su turno |
| Salida normalizada del mensaje | IEC 61097-6, anexo C (sentencia `NRX`) | La da el receptor; la consola solo la ajusta |

## AIS, NMEA 0183 y NMEA 2000

| Requisito | Norma | En la consola |
| :--- | :--- | :--- |
| Mensajes AIS de posición (1, 2, 3, 18, 19 y 27) y de datos estáticos (5 y 24) | UIT-R M.1371 | Se leen de las sentencias `!AIVDM` / `!AIVDO` (IEC 61162-1) que entregan AIS-catcher, rtl_ais o un receptor AIS |
| Reclamación de dirección en el bus | ISO 11783-5 | La consola reclama una dirección y la defiende o cambia si otro equipo la disputa |
| Mensajes de más de ocho bytes | ISO 11783-3 (transporte rápido de NMEA 2000) | Implementado y comprobado |
| Formato de cada PGN | NMEA 2000 (IEC 61162-3) | 129025, 129026, 126992, 130306, 130314, 130316, 129283, 129284 y 129802, contrastados en cada subida con la base de datos de CANboat v9.2.0 (`tools/canboat/run.sh`). **No es una certificación de la NMEA** |
| Texto de seguridad | UIT-R M.1371, mensaje 14, dentro del PGN 129802 | Avisos de emergencia y, si se pide, el texto entero de cada mensaje NAVTEX por partes. Solo por el bus: la consola **no emite AIS por radio**, así que no interviene en el reparto de tiempos (TDMA) del AIS |

**NAVTEX y NMEA 2000.** No existe un PGN de NMEA 2000 para el texto de NAVTEX. La consola no inventa uno: usa el 129802, que es el mensaje normalizado que lleva texto de seguridad.

## Avisos oficiales

| Requisito | Especificación | En la consola |
| :--- | :--- | :--- |
| Avisos en Common Alerting Protocol | OASIS CAP 1.2 | Avisos de AEMET: identificador, nivel, fenómeno, umbral, vigencia y polígono de la zona (`server/fuentes/aemetAvisos.ts`) |
| No alterar el aviso oficial | Condiciones de reutilización de cada fuente | El aviso se difunde con su nivel y su fuente; la consola solo decide si lo emite según el radio y el nivel mínimo elegidos |

Las demás fuentes (IGN, EMSC, USGS, NOAA, NASA FIRMS, Copernicus…) se leen en el formato que publica cada una; sus condiciones de uso están en el [manual](MANUAL.md).

## Lo que no se aplica o no se cumple

- **Homologación.** La consola no está ensayada ni aprobada como equipo marino ni como sistema de alerta pública.
- **Certificación NMEA 2000.** Los PGN se contrastan con CANboat, que es una base de datos hecha por ingeniería inversa; no hay certificación de la NMEA.
- **TOCALL registrado.** Se usa el rango experimental `APZ`.
- **Autorizaciones de la estación.** Son del titular; la consola no las comprueba.
- **Inmarsat-C EGC (SafetyNET).** Se reciben los mensajes que descodifica InmarScope; no se ha contrastado con el manual SafetyNET de la OMI.

## Ediciones vigentes

Comprobado el 22 de noviembre de 2026:

| Norma | Edición vigente | Observaciones |
| :--- | :--- | :--- |
| Reglamento de radioaficionados de España | Orden IET/1311/2013, en vigor | La Resolución de 29 de julio de 2026 (BOE-A-2026-17504) desarrolla su artículo 27, sobre los distintivos con sufijo de una letra; no cambia nada de lo que aplica la consola |
| Reglamento de Radiocomunicaciones de la UIT | Edición de 2024 | No se ha leído su texto |
| UIT-R M.540 | M.540-2 (1990), en vigor | Leída |
| Normas de funcionamiento NAVTEX de la OMI | MSC.508(105), de 2022, para equipos instalados desde el 1 de enero de 2024; antes, MSC.148(77) | Leídas las dos |
| Manual NAVTEX de la OMI | Edición de 2023 (MSC.1/Circ.1403/Rev.2) | Leído |
| IEC 61097-6 | Edición 2.2 (2005 con enmiendas de 2011 y 2019) | Leída solo la de 2005; las enmiendas son de pago |
| IEC 61162-1 | Edición 6 | No se ha leído |
| APRS Protocol Reference | 1.0.1, con los añadidos 1.1 y 1.2 publicados después en aprs.org | La consola sigue la 1.0.1 |
| OASIS CAP | 1.2 | Es la que publica AEMET |

Las demás (UIT-R M.1371, IEC 61162-3, ISO 11783, AX.25) no se han comprobado: se citan sin número de edición.

## Documentos de referencia

- UIT, Reglamento de Radiocomunicaciones, artículos 15 y 25.
- España: [Orden IET/1311/2013](https://boe.es/buscar/act.php?id=BOE-A-2013-7624), Reglamento de uso del dominio público radioeléctrico por radioaficionados.
- APRS Protocol Reference, versión 1.0.1; documentación de APRS-IS en aprs-is.net.
- AX.25 Link Access Protocol for Amateur Packet Radio, versión 2.2; «The KISS TNC».
- UIT-R M.540-2; OMI MSC.508(105) y, antes, MSC.148(77); Manual NAVTEX de la OMI, edición de 2023; IEC 61097-6. Enlaces en el documento de normas de Navtex.
- España: [Resolución de 29 de julio de 2026](https://www.boe.es/boe/dias/2026/08/10/pdfs/BOE-A-2026-17504.pdf), sobre distintivos de llamada con sufijo de una letra.
- UIT-R M.1371; IEC 61162-1 y 61162-3; ISO 11783-3 y 11783-5; [CANboat](https://canboat.github.io/canboat/).
- OASIS, Common Alerting Protocol 1.2.

De estos documentos, para este trabajo se han leído los de NAVTEX (22 de noviembre de 2026). Los demás se citan por lo que el código aplica de ellos; los números de artículo del Reglamento de Radiocomunicaciones y los de las normas de pago (UIT-R M.1371, IEC, ISO) no se han contrastado con su texto. Si encuentra una diferencia entre este documento, la consola y una norma, vale la norma: abra una incidencia en el repositorio.
