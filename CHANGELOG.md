# Changelog - APRS S.A.T. EMCOM System

Este archivo registra el historial de versiones progresivas y cambios realizados en la consola de emergencias civiles y telecomunicaciones de emergencia REMER.

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
