// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Baliza de posición de la propia estación.
//
// Construye, a partir del perfil de la estación, la trama de posición APRS
// («!lat/lon» + símbolo + extensión PHG + comentario). Funciones puras: quién
// puede emitirla y cuándo lo decide la política de emisión del servidor.

import { TOCALL, IS_PATH, isValidCallsign, latToAprs, lonToAprs, toAscii } from '../aprs';

export interface PerfilEstacion {
  /** Indicativo con el que se emite, con su SSID (p. ej. «EA7XXX-10»). */
  callsign: string;
  lat: number;
  lon: number;
  /** Tabla de símbolos: «/» primaria, «\» alternativa o carácter de superposición. */
  symbolTable?: string;
  symbolCode?: string;
  /** Dígitos PHG (potencia, altura, ganancia, directividad), 0-9 cada uno. */
  phg?: { power: number; height: number; gain: number; directivity: number } | null;
  comment?: string;
}

/** Con extensión de datos (PHG) el comentario se queda en 36 caracteres; sin ella, 43. */
export const MAX_COMENTARIO = 43;
export const MAX_COMENTARIO_CON_PHG = 36;
/** Intervalo mínimo de la baliza de una estación (minutos), para no saturar el canal. */
export const MIN_INTERVALO_BALIZA_MIN = 5;

const digito = (n: number): string | null =>
  Number.isInteger(n) && n >= 0 && n <= 9 ? String(n) : null;

/** Extensión «PHGphgd», o cadena vacía si algún dígito no es válido. */
export function extensionPhg(phg: PerfilEstacion['phg']): string {
  if (!phg) return '';
  const d = [phg.power, phg.height, phg.gain, phg.directivity].map(digito);
  return d.every((x) => x !== null) ? `PHG${d.join('')}` : '';
}

/** La posición es utilizable: dentro de rango y distinta de 0,0 (sin configurar). */
export function posicionValida(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}

/** Problemas del perfil que impiden emitir la baliza (lista vacía = correcto). */
export function validarPerfil(perfil: PerfilEstacion): string[] {
  const errores: string[] = [];
  if (!isValidCallsign(perfil.callsign)) errores.push('indicativo no válido o de plantilla');
  if (!posicionValida(perfil.lat, perfil.lon)) errores.push('posición de la estación sin configurar');
  const tabla = perfil.symbolTable ?? '/';
  if (!/^[/\\0-9A-Z]$/.test(tabla)) errores.push('tabla de símbolos no válida');
  const codigo = perfil.symbolCode ?? '-';
  if (!/^[\x21-\x7e]$/.test(codigo)) errores.push('código de símbolo no válido');
  return errores;
}

/** Campo de información de la baliza: «!DDMM.hhN/DDDMM.hhW-PHG5330comentario». */
export function infoBaliza(perfil: PerfilEstacion): string {
  const phg = extensionPhg(perfil.phg);
  const max = phg ? MAX_COMENTARIO_CON_PHG : MAX_COMENTARIO;
  const comentario = toAscii(perfil.comment ?? '').replace(/\s+/g, ' ').trim().slice(0, max).trimEnd();
  return `!${latToAprs(perfil.lat)}${perfil.symbolTable ?? '/'}${lonToAprs(perfil.lon)}${perfil.symbolCode ?? '-'}${phg}${comentario}`;
}

/** Trama TNC2 completa de la baliza, o null si el perfil no permite emitirla. */
export function balizaPosicion(perfil: PerfilEstacion): string | null {
  if (validarPerfil(perfil).length > 0) return null;
  return `${perfil.callsign.trim().toUpperCase()}>${TOCALL},${IS_PATH}:${infoBaliza(perfil)}`;
}

/** Intervalo efectivo de la baliza en milisegundos (nunca por debajo del mínimo). */
export function intervaloBalizaMs(minutos: number | undefined): number {
  const m = Number.isFinite(minutos) ? Number(minutos) : 30;
  return Math.max(MIN_INTERVALO_BALIZA_MIN, m) * 60000;
}
