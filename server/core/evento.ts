// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Modelo común de aviso.
//
// Toda fuente (oficial de Internet o recibida por RF) entrega sus avisos en
// este formato. A partir de aquí el sistema ya no sabe de dónde vienen: las
// reglas deciden si se emiten y el formateador los convierte a APRS. Añadir
// una fuente nueva consiste en escribir un módulo que devuelva `Evento[]`.

export type TipoEmergencia =
  | 'sismo'
  | 'tsunami'
  | 'meteo'
  | 'huracan'
  | 'tornado'
  | 'incendio'
  | 'radiacion'
  | 'clima_espacial'
  | 'maritimo'
  | 'otro';

/** Niveles de aviso, de menor a mayor (los colores de AEMET/MeteoAlarm). */
export type Gravedad = 'info' | 'amarillo' | 'naranja' | 'rojo';

export const ORDEN_GRAVEDAD: Record<Gravedad, number> = { info: 0, amarillo: 1, naranja: 2, rojo: 3 };

export interface Evento {
  /** Identificador estable que da la fuente: es la clave para no repetir avisos. */
  id: string;
  tipo: TipoEmergencia;
  gravedad: Gravedad;
  /** Texto corto que identifica el aviso (lugar, fenómeno...). */
  titulo: string;
  /** Datos breves para el comentario del objeto APRS (magnitud, profundidad...). */
  detalle?: string;
  /** Posición del suceso. Sin coordenadas no hay objeto APRS, solo boletín. */
  lat?: number;
  lon?: number;
  /** Momento del suceso o inicio de la vigencia (ms epoch). */
  inicio: number;
  /** Fin de la vigencia si la fuente lo indica (ms epoch). */
  fin?: number;
  /** Organismo o canal de origen: «IGN», «AEMET», «NAVTEX»... */
  fuente: string;
  /** false = dato simulado, de prueba o incompleto: nunca sale al aire. */
  real: boolean;
  /** Valores numéricos propios del tipo (p. ej. magnitud) para las reglas. */
  datos?: Record<string, number>;
}
