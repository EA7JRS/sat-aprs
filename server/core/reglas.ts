// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Reglas de difusión de avisos.
//
// Deciden, para cada aviso, si debe emitirse ahora: que sea real, que esté
// vigente, que caiga dentro del radio de la estación (fija o móvil), que
// alcance la gravedad mínima y que no se haya emitido ya hace poco.

import { gcDistanceKm } from '../formulas/geo';
import { Evento, Gravedad, ORDEN_GRAVEDAD } from './evento';

export interface Posicion { lat: number; lon: number }

/** Política de difusión de un tipo de emergencia. */
export interface Politica {
  /** Radio en km alrededor de la estación; null = sin límite geográfico. */
  radioKm: number | null;
  gravedadMinima: Gravedad;
  /** Tiempo durante el que un aviso sin fecha de fin se sigue anunciando. */
  vigenciaMs: number;
  /** Cada cuánto se repite el aviso mientras siga vigente (refresca el objeto). */
  repetirCadaMs: number;
  /** Además del objeto con la posición, emitir un boletín de emergencia. */
  boletin: boolean;
  /** Condición adicional propia del tipo (p. ej. magnitud mínima). */
  filtro?: (evento: Evento) => boolean;
}

export interface Decision { emitir: boolean; motivo: string; distanciaKm?: number }

/** Distancia por círculo máximo en km (la fórmula común del ecosistema, server/formulas/geo.ts). */
export function distanciaKm(a: Posicion, b: Posicion): number {
  return gcDistanceKm(a, b);
}

/** ¿Cumple el aviso las condiciones para difundirse desde esta estación? */
export function evaluar(evento: Evento, politica: Politica, estacion: Posicion, ahora: number): Decision {
  if (!evento.real) return { emitir: false, motivo: 'dato simulado o incompleto' };

  const fin = evento.fin ?? evento.inicio + politica.vigenciaMs;
  if (ahora > fin) return { emitir: false, motivo: 'aviso caducado' };
  if (evento.inicio > ahora + 3600_000) return { emitir: false, motivo: 'fecha del aviso en el futuro' };

  if (ORDEN_GRAVEDAD[evento.gravedad] < ORDEN_GRAVEDAD[politica.gravedadMinima]) {
    return { emitir: false, motivo: 'gravedad inferior a la mínima' };
  }
  if (politica.filtro && !politica.filtro(evento)) {
    return { emitir: false, motivo: 'no alcanza el umbral configurado' };
  }

  let distancia: number | undefined;
  if (evento.lat !== undefined && evento.lon !== undefined) {
    distancia = distanciaKm(estacion, { lat: evento.lat, lon: evento.lon });
    if (politica.radioKm !== null && distancia > politica.radioKm) {
      return { emitir: false, motivo: 'fuera del radio de la estación', distanciaKm: distancia };
    }
  }
  return { emitir: true, motivo: '', distanciaKm: distancia };
}

interface Apunte { primera: number; ultima: number; veces: number }

/**
 * Memoria de los avisos ya emitidos, para no repetirlos tras un reinicio y
 * para respetar la cadencia de repetición. Se guarda como JSON.
 */
export class RegistroAvisos {
  private apuntes = new Map<string, Apunte>();

  constructor(datos?: Record<string, Apunte>) {
    for (const [id, a] of Object.entries(datos || {})) {
      if (a && typeof a.ultima === 'number') this.apuntes.set(id, a);
    }
  }

  /** true si el aviso no se ha emitido nunca o ya toca repetirlo. */
  toca(id: string, ahora: number, repetirCadaMs: number): boolean {
    const a = this.apuntes.get(id);
    return !a || ahora - a.ultima >= repetirCadaMs;
  }

  esNuevo(id: string): boolean {
    return !this.apuntes.has(id);
  }

  anotar(id: string, ahora: number): void {
    const a = this.apuntes.get(id);
    if (a) {
      a.ultima = ahora;
      a.veces += 1;
    } else {
      this.apuntes.set(id, { primera: ahora, ultima: ahora, veces: 1 });
    }
  }

  /** Olvida los avisos sin actividad desde hace más de `antiguedadMs`. */
  purgar(ahora: number, antiguedadMs: number): void {
    for (const [id, a] of this.apuntes) {
      if (ahora - a.ultima > antiguedadMs) this.apuntes.delete(id);
    }
  }

  toJSON(): Record<string, Apunte> {
    return Object.fromEntries(this.apuntes);
  }
}
