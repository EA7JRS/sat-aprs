// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Seguimiento del rotor, con la estación fija o en movimiento.
//
// Mismo planteamiento que la caja APRS LoRa+ Rotor, el tracker y la app:
//  · Los ángulos se calculan desde la posición actual de la estación: la fija
//    del perfil o la del GPS si se mueve.
//  · Una estación APRS que se mueve se apunta a su posición ESTIMADA ahora,
//    con su último rumbo y velocidad (300 s como máximo).
//  · Con el rotor montado en un vehículo o un barco, el acimut que se pide y
//    el que se enseña son verdaderos: al rotor se le manda el acimut menos el
//    rumbo de la proa, y se vuelve a apuntar cuando el rumbo cambia.
//  · Sol y luna, con refracción, para medir la antena o para rebote lunar.
// Aquí solo hay cálculo; quien mueve el rotor es el servidor.

import { LatLon, gcDestination, gcDistanceKm, gcInitialBearing, norm360 } from '../formulas/geo';
import { moonPosition, refractionDeg, sunPosition, unixToUtc } from '../formulas/astro';

export type Objetivo =
  | { tipo: 'aprs'; indicativo: string }
  /** Barco oído por AIS (MMSI o nombre) o aeronave oída por ADS-B (vuelo o dirección ICAO). */
  | { tipo: 'barco'; indicativo: string }
  | { tipo: 'avion'; indicativo: string }
  | { tipo: 'ultima' }
  | { tipo: 'punto'; lat: number; lon: number; nombre: string }
  | { tipo: 'sol' }
  | { tipo: 'luna' };

export interface EstacionVista {
  nombre: string;
  lat: number;
  lon: number;
  /** Momento de su última posición (ms epoch). */
  ultima: number;
  rumbo?: number;
  velocidadKmh?: number;
  /** Altitud sobre el nivel del mar, en metros (aeronaves). */
  altitudM?: number;
}

/** Tiempo máximo que se extrapola la posición de una estación en movimiento. */
export const MAX_ESTIMA_S = 300;
const KM_POR_MILLA = 1.852;

/** Posición estimada ahora de una estación, con su último rumbo y velocidad. */
export function posicionEstimada(e: EstacionVista, ahora: number): { pos: LatLon; estimada: boolean } {
  const pos = { lat: e.lat, lon: e.lon };
  if (e.rumbo === undefined || e.velocidadKmh === undefined || e.velocidadKmh < 1) return { pos, estimada: false };
  const seg = Math.min(MAX_ESTIMA_S, Math.max(0, (ahora - e.ultima) / 1000));
  if (seg < 5) return { pos, estimada: false };
  const millas = (e.velocidadKmh * seg) / 3600 / KM_POR_MILLA;
  return { pos: gcDestination(pos, e.rumbo, millas), estimada: true };
}

/** Diferencia angular con signo, de −180 a 180. */
export const difAngulo = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

/** Acimut que hay que dar al rotor: el verdadero menos el rumbo de la proa, si va montado en un móvil. */
export function acimutDeRotor(verdadero: number, proa: number | null): number {
  return norm360(verdadero - (proa ?? 0));
}

/** Acimut verdadero al que apunta el rotor, a partir del suyo y de la proa. */
export function acimutVerdadero(rotor: number, proa: number | null): number {
  return norm360(rotor + (proa ?? 0));
}

/**
 * Rumbo de la proa de una estación móvil. Sin compás, se toma el rumbo sobre
 * el fondo del GPS, que solo es fiable en marcha: parado se conserva el último.
 */
export class Proa {
  rumbo: number | null = null;
  /** Momento de la última lectura válida (ms epoch). */
  cuando = 0;

  constructor(private minKmh = 3) {}

  anotar(rumboGps: number | undefined | null, velocidadKmh: number, ahora = Date.now()): number | null {
    if (rumboGps !== undefined && rumboGps !== null && Number.isFinite(rumboGps) && velocidadKmh >= this.minKmh) {
      this.rumbo = norm360(rumboGps);
      this.cuando = ahora;
    }
    return this.rumbo;
  }

  olvidar() {
    this.rumbo = null;
    this.cuando = 0;
  }
}

export interface Contexto {
  /** Posición actual de la estación (fija o GPS). */
  estacion: LatLon;
  /** Altitud de la estación en metros, para la elevación de las aeronaves. */
  altitudM?: number;
  /** true si el rotor va en un vehículo o barco y hay que descontar el rumbo. */
  movil: boolean;
  /** Rumbo de la proa, si se conoce. */
  proa: number | null;
  /** Estación APRS, barco o aeronave por su identificador. */
  buscar: (indicativo: string, tipo: 'aprs' | 'barco' | 'avion') => EstacionVista | null;
  /** Última estación oída directamente por radio. */
  ultimaOida: () => EstacionVista | null;
  /** El rotor tiene elevación. */
  conElevacion: boolean;
}

export interface Calculo {
  /** Hay adónde apuntar. Si es false, `espera` dice por qué. */
  ok: boolean;
  espera?: string;
  nombre: string;
  /** Acimut verdadero y elevación del objetivo. */
  azVerdadero?: number;
  elevacion?: number;
  /** Acimut que se manda al rotor (descontada la proa si va en un móvil). */
  azRotor?: number;
  distanciaKm?: number;
  /** La posición del objetivo es estimada (estación en movimiento). */
  estimada?: boolean;
}

export const NOMBRE_OBJETIVO: Record<Objetivo['tipo'], string> = { aprs: 'Estación APRS', barco: 'Barco (AIS)', avion: 'Aeronave (ADS-B)', ultima: 'Última estación oída', punto: 'Punto fijo', sol: 'Sol', luna: 'Luna' };

/** Adónde hay que apuntar ahora. */
export function calcular(objetivo: Objetivo, ctx: Contexto, ahora = Date.now()): Calculo {
  if (ctx.movil && ctx.proa === null) {
    return { ok: false, nombre: NOMBRE_OBJETIVO[objetivo.tipo], espera: 'sin rumbo de la proa todavía: hace falta GPS en marcha' };
  }
  const acabar = (nombre: string, azVerdadero: number, extra: Partial<Calculo> = {}): Calculo => ({
    ok: true, nombre, azVerdadero: Math.round(azVerdadero * 10) / 10, azRotor: Math.round(acimutDeRotor(azVerdadero, ctx.movil ? ctx.proa : null) * 10) / 10, ...extra,
  });

  if (objetivo.tipo === 'sol' || objetivo.tipo === 'luna') {
    const t = unixToUtc(ahora / 1000);
    const p = objetivo.tipo === 'sol'
      ? sunPosition(t.y, t.m, t.d, t.utcHours, ctx.estacion.lat, ctx.estacion.lon)
      : moonPosition(t.y, t.m, t.d, t.utcHours, ctx.estacion.lat, ctx.estacion.lon);
    const nombre = NOMBRE_OBJETIVO[objetivo.tipo];
    const altura = p.altDeg + refractionDeg(p.altDeg); // lo que ve la antena
    if (altura < 0) return { ok: false, nombre, espera: `bajo el horizonte (${altura.toFixed(1)}°)`, azVerdadero: Math.round(p.azDeg * 10) / 10, elevacion: Math.round(altura * 10) / 10 };
    return acabar(nombre, p.azDeg, { elevacion: ctx.conElevacion ? Math.round(altura * 10) / 10 : undefined });
  }

  if (objetivo.tipo === 'punto') {
    const destino = { lat: objetivo.lat, lon: objetivo.lon };
    return acabar(objetivo.nombre, gcInitialBearing(ctx.estacion, destino), { distanciaKm: Math.round(gcDistanceKm(ctx.estacion, destino) * 10) / 10 });
  }

  const e = objetivo.tipo === 'ultima' ? ctx.ultimaOida() : ctx.buscar(objetivo.indicativo, objetivo.tipo);
  if (!e) {
    return { ok: false, nombre: objetivo.tipo === 'ultima' ? NOMBRE_OBJETIVO.ultima : objetivo.indicativo, espera: objetivo.tipo === 'ultima' ? 'no se ha oído ninguna estación por radio' : 'todavía no se ha oído su posición' };
  }
  const { pos, estimada } = posicionEstimada(e, ahora);
  const distanciaKm = gcDistanceKm(ctx.estacion, pos);
  if (distanciaKm < 0.05) return { ok: false, nombre: e.nombre, espera: 'está en el mismo sitio que la estación' };
  // El «~» marca, como en el tracker y la app, que la posición es estimada
  // Aeronave: elevación geométrica, con la caída por la curvatura de la Tierra
  let elevacion: number | undefined;
  if (e.altitudM !== undefined && ctx.conElevacion) {
    const dM = distanciaKm * 1000;
    const altura = e.altitudM - (ctx.altitudM ?? 0) - (dM * dM) / (2 * 6371000);
    elevacion = Math.max(0, Math.round(((Math.atan2(altura, dM) * 180) / Math.PI) * 10) / 10);
  }
  return acabar(`${e.nombre}${estimada ? '~' : ''}`, gcInitialBearing(ctx.estacion, pos), { distanciaKm: Math.round(distanciaKm * 10) / 10, estimada, elevacion });
}

/** Lleva el objetivo en curso y decide cuándo hay que volver a mover el rotor. */
export class Seguimiento {
  objetivo: Objetivo | null = null;
  ultimo: Calculo | null = null;
  private mandadoAz: number | null = null;
  private mandadoEl: number | null = null;

  /** `pasoGrados`: no se mueve el rotor por menos de esto. */
  constructor(private pasoGrados = 2) {}

  seguir(objetivo: Objetivo) {
    this.objetivo = objetivo;
    this.ultimo = null;
    this.mandadoAz = null;
    this.mandadoEl = null;
  }

  dejar() {
    this.objetivo = null;
    this.ultimo = null;
    this.mandadoAz = null;
    this.mandadoEl = null;
  }

  /** Recalcula; devuelve la orden para el rotor si toca moverlo, o null. */
  paso(ctx: Contexto, ahora = Date.now()): { az: number; el?: number } | null {
    if (!this.objetivo) return null;
    const c = calcular(this.objetivo, ctx, ahora);
    this.ultimo = c;
    if (!c.ok || c.azRotor === undefined) return null;
    const cambiaAz = this.mandadoAz === null || Math.abs(difAngulo(c.azRotor, this.mandadoAz)) >= this.pasoGrados;
    const cambiaEl = c.elevacion !== undefined && (this.mandadoEl === null || Math.abs(c.elevacion - this.mandadoEl) >= this.pasoGrados);
    if (!cambiaAz && !cambiaEl) return null;
    this.mandadoAz = c.azRotor;
    if (c.elevacion !== undefined) this.mandadoEl = c.elevacion;
    return { az: c.azRotor, el: c.elevacion };
  }
}
