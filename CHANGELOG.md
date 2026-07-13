# Changelog - APRS S.A.T. EMCOM System

Este archivo registra el historial de versiones progresivas y cambios realizados en la consola de emergencias civiles y telecomunicaciones de emergencia REMER.

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
