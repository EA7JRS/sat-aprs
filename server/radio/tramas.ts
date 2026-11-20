// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Tramas APRS: todo lo que entra y sale, en una lista.
//
//  · Entra por radio (KISS de Direwolf) y por APRS-IS; sale por la cola de
//    emisión (con el resultado: emitida o por qué no).
//  · Cada trama se clasifica por tipo (posición, Mic-E, mensaje, acuse,
//    boletín, objeto, ítem, estado, meteorología, telemetría, consulta,
//    terceros…) y se explica en castellano.
//  · Un analizador descompone una trama pegada a mano: no la emite.
// Vive en memoria: es lo último que ha pasado, no un archivo.

import { isValidCallsign, parseTnc2 } from '../aprs';
import { leerPosicionAprs } from '../aprsPosicion';
import { LatLon, gcDistanceKm, gcInitialBearing } from '../formulas/geo';
import { describirTrama, repetidorDe } from './direwolf';
import { leerMensajeAprs } from './mensajes';

export type ViaTrama = 'RF' | 'IS' | 'TX';
export type TipoTrama =
  | 'posicion' | 'mice' | 'meteo' | 'objeto' | 'item' | 'mensaje' | 'acuse' | 'boletin'
  | 'estado' | 'telemetria' | 'consulta' | 'terceros' | 'otro';

export const NOMBRE_TIPO: Record<TipoTrama, string> = {
  posicion: 'Posición', mice: 'Mic-E', meteo: 'Meteorología', objeto: 'Objeto', item: 'Ítem',
  mensaje: 'Mensaje', acuse: 'Acuse', boletin: 'Boletín', estado: 'Estado', telemetria: 'Telemetría',
  consulta: 'Consulta', terceros: 'Terceros', otro: 'Otro',
};

export interface TramaAprs {
  n: number;
  cuando: number;
  via: ViaTrama;
  origen: string;
  destino: string;
  ruta: string;
  info: string;
  tipo: TipoTrama;
  /** Solo en las de salida: null si salió; si no, por qué. */
  noEmitida?: string | null;
  /** Solo en las de salida que salen: «radio», «APRS-IS» o «radio y APRS-IS». */
  canales?: string;
}

/** Tipo de trama según su campo de información (APRS 1.0.1, cap. 5). */
export function tipoTrama(origen: string, destino: string, info: string): TipoTrama {
  const t = info.replace(/^\s+/, '');
  if (!t) return 'otro';
  if (t.startsWith('}')) return 'terceros';
  const m = leerMensajeAprs(t);
  if (m) {
    if (m.acuse) return 'acuse';
    if (/^BLN/.test(m.para) || /^NWS/.test(m.para)) return 'boletin';
    if (/^(PARM|UNIT|EQNS|BITS)\./.test(m.texto)) return 'telemetria';
    return 'mensaje';
  }
  if (t.startsWith('T#')) return 'telemetria';
  if (t.startsWith('>')) return 'estado';
  if (t.startsWith('_')) return 'meteo';
  if (t.startsWith('?')) return 'consulta';
  if (t.startsWith(';')) return 'objeto';
  if (t.startsWith(')')) return 'item';
  if (/^[`'\x1c\x1d]/.test(t)) return 'mice';
  const p = leerPosicionAprs(origen, destino, t);
  if (p) return p.simbolo.endsWith('_') ? 'meteo' : 'posicion';
  return 'otro';
}

export class RegistroTramas {
  tramas: TramaAprs[] = [];
  private contador = 0;
  /** Se llama con cada trama anotada (el historial la guarda en SQLite). */
  alAnotar: ((t: TramaAprs) => void) | null = null;
  constructor(private max = 500) {}

  /** Carga las tramas guardadas (de la más nueva a la más antigua). */
  cargar(tramas: TramaAprs[]) {
    this.tramas = tramas.slice(0, this.max);
    this.contador = Math.max(this.contador, ...this.tramas.map((t) => t.n), 0);
  }

  anotar(via: ViaTrama, origen: string, destino: string, ruta: string, info: string, extra: { noEmitida?: string | null; canales?: string; cuando?: number } = {}): TramaAprs {
    const t: TramaAprs = {
      n: ++this.contador,
      cuando: extra.cuando ?? Date.now(),
      via,
      origen: origen.toUpperCase(),
      destino: destino.toUpperCase(),
      ruta,
      info,
      tipo: tipoTrama(origen, destino, info),
    };
    if (via === 'TX') {
      t.noEmitida = extra.noEmitida ?? null;
      if (extra.canales) t.canales = extra.canales;
    }
    this.tramas.unshift(t);
    if (this.tramas.length > this.max) this.tramas.length = this.max;
    try { this.alAnotar?.(t); } catch { /* el historial no debe parar la recepción */ }
    return t;
  }

  /** Cifras de la última hora por vía y por tipo. */
  resumen(ahora = Date.now()) {
    const hora = this.tramas.filter((t) => ahora - t.cuando <= 3600_000);
    const porVia: Record<ViaTrama, number> = { RF: 0, IS: 0, TX: 0 };
    const porTipo: Partial<Record<TipoTrama, number>> = {};
    const estaciones = new Set<string>();
    for (const t of hora) {
      porVia[t.via]++;
      porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1;
      if (t.via !== 'TX') estaciones.add(t.origen);
    }
    return { porVia, porTipo, estaciones: estaciones.size, total: hora.length };
  }
}

// ── Analizador ──────────────────────────────────────────────────────────────
export interface Campo { nombre: string; valor: string }
export interface Analisis {
  ok: boolean;
  error?: string;
  avisos: string[];
  origen?: string;
  destino?: string;
  ruta?: string[];
  info?: string;
  tipo?: TipoTrama;
  nombreTipo?: string;
  que?: string;
  campos: Campo[];
  posicion?: { lat: number; lon: number; simbolo: string; distanciaKm: number | null; rumbo: number | null };
}

const RUTA_INTERNET = /^(TCPIP|TCPXX|q[A-Z]{2})\*?$/i;
const ELEMENTO_RUTA = /^[A-Z0-9]{1,6}(-([0-9]|1[0-5]))?\*?$/i;
const fmt = (n: number, d = 4) => n.toFixed(d).replace(/\.?0+$/, '');

/**
 * Descompone una trama TNC2 («ORIGEN>DESTINO,RUTA:info»): qué es, sus
 * campos y lo que no cumple. Solo lee; no emite nada.
 */
export function analizarTrama(texto: string, estacion: LatLon | null): Analisis {
  const linea = String(texto ?? '').replace(/[\r\n]+$/, '').trim().slice(0, 600);
  if (!linea) return { ok: false, error: 'Pega una trama: ORIGEN>DESTINO,RUTA:información', avisos: [], campos: [] };
  const t = parseTnc2(linea);
  if (!t) return { ok: false, error: 'No es una trama TNC2: falta «>» o «:» (ORIGEN>DESTINO,RUTA:información).', avisos: [], campos: [] };
  const avisos: string[] = [];
  const campos: Campo[] = [];
  if (!isValidCallsign(t.source)) avisos.push(`El origen «${t.source}» no es un indicativo AX.25 válido (hasta 6 letras o cifras y SSID 0-15).`);
  if (!/^[A-Z0-9]{1,6}(-([0-9]|1[0-5]))?$/.test(t.destination)) avisos.push(`El destino «${t.destination}» no es válido en AX.25.`);
  const rutaRf = t.path.filter((p) => !RUTA_INTERNET.test(p));
  const malos = rutaRf.filter((p) => !ELEMENTO_RUTA.test(p));
  if (malos.length) avisos.push(`Elementos de ruta no válidos en AX.25: ${malos.join(', ')}.`);
  if (rutaRf.length > 8) avisos.push('Más de 8 repetidores en la ruta: AX.25 no los admite.');
  if (t.info.length > 256) avisos.push(`El campo de información tiene ${t.info.length} caracteres (máximo 256).`);
  if (/[^\x20-\x7e]/.test(t.info.replace(/^[`'][\s\S]{8}/, ''))) avisos.push('El campo de información lleva caracteres fuera del ASCII imprimible.');

  const tipo = tipoTrama(t.source, t.destination, t.info);
  const via = t.path.some((p) => RUTA_INTERNET.test(p)) ? 'APRS-IS' : 'radio';
  campos.push({ nombre: 'Origen', valor: t.source });
  campos.push({ nombre: 'Destino', valor: t.destination });
  campos.push({ nombre: 'Ruta', valor: t.path.length ? t.path.join(',') : '(directa)' });
  campos.push({ nombre: 'Llegó por', valor: via === 'APRS-IS' ? `APRS-IS${t.path.find((p) => /^q[A-Z]{2}$/i.test(p)) ? ` (${t.path.find((p) => /^q[A-Z]{2}$/i.test(p))})` : ''}` : (repetidorDe(t.path.join(',')) ? `radio, por ${repetidorDe(t.path.join(','))}` : 'radio') });

  let posicion: Analisis['posicion'];
  const m = leerMensajeAprs(t.info);
  if (m) {
    campos.push({ nombre: 'Para', valor: m.para });
    if (m.acuse) campos.push({ nombre: m.acuse === 'ack' ? 'Acusa recibo del mensaje' : 'Rechaza el mensaje', valor: m.id ?? '' });
    else {
      campos.push({ nombre: 'Texto', valor: m.texto });
      campos.push({ nombre: 'Número', valor: m.id ?? '(sin acuse)' });
      if (m.texto.length > 67) avisos.push(`El texto tiene ${m.texto.length} caracteres (máximo 67).`);
    }
    if (!/^[A-Za-z0-9 \-]{9}$/.test(t.info.slice(1, 10))) avisos.push('El destinatario debe ocupar 9 caracteres, rellenado con espacios.');
  } else {
    const p = leerPosicionAprs(t.source, t.destination, t.info);
    if (p) {
      if (p.clase !== 'estacion') campos.push({ nombre: p.clase === 'objeto' ? 'Objeto' : 'Ítem', valor: `${p.nombre}${p.baja ? ' (baja)' : ''}` });
      campos.push({ nombre: 'Latitud', valor: `${fmt(p.lat)}°` });
      campos.push({ nombre: 'Longitud', valor: `${fmt(p.lon)}°` });
      campos.push({ nombre: 'Símbolo', valor: `${p.simbolo} (tabla «${p.simbolo[0]}», código «${p.simbolo[1]}»)` });
      if (p.rumbo !== undefined && p.velocidadKmh !== undefined) campos.push({ nombre: 'Rumbo y velocidad', valor: `${Math.round(p.rumbo)}° · ${Math.round(p.velocidadKmh)} km/h` });
      const alt = /\/A=(-?\d{5,6})/.exec(t.info);
      if (alt) campos.push({ nombre: 'Altitud', valor: `${Math.round(Number(alt[1]) * 0.3048)} m` });
      const phg = /PHG(\d)(\d)(\d)(\d)/.exec(t.info);
      if (phg) {
        const pot = Number(phg[1]) ** 2, alto = Math.round(10 * 2 ** Number(phg[2]) * 0.3048);
        campos.push({ nombre: 'PHG', valor: `${pot} W · ${alto} m sobre el terreno · ${phg[3]} dB · ${phg[4] === '0' ? 'omnidireccional' : `hacia ${Number(phg[4]) * 45}°`}` });
      }
      if (p.comentario) campos.push({ nombre: 'Comentario', valor: p.comentario });
      const d = estacion ? gcDistanceKm(estacion, p) : null;
      posicion = { lat: p.lat, lon: p.lon, simbolo: p.simbolo, distanciaKm: d, rumbo: estacion ? gcInitialBearing(estacion, p) : null };
      if (d !== null) campos.push({ nombre: 'Desde la estación', valor: `${d < 10 ? d.toFixed(1) : Math.round(d)} km al ${String(Math.round(posicion.rumbo!)).padStart(3, '0')}°` });
    } else if (tipo === 'estado') {
      campos.push({ nombre: 'Estado', valor: t.info.slice(1) });
    } else if (tipo === 'telemetria' && t.info.startsWith('T#')) {
      const v = t.info.slice(2).split(',');
      campos.push({ nombre: 'Secuencia', valor: v[0] ?? '' });
      campos.push({ nombre: 'Valores analógicos', valor: v.slice(1, 6).join(' · ') });
      if (v[6]) campos.push({ nombre: 'Bits', valor: v[6].slice(0, 8) });
    } else if (tipo === 'terceros') {
      const dentro = parseTnc2(t.info.slice(1));
      if (dentro) campos.push({ nombre: 'Trama interior', valor: `${dentro.source}>${dentro.destination}${dentro.path.length ? ',' + dentro.path.join(',') : ''}:${dentro.info}` });
    } else if (tipo === 'otro') {
      avisos.push('No se reconoce el tipo de trama APRS por su primer carácter.');
    }
  }
  return {
    ok: true, avisos, campos, posicion,
    origen: t.source, destino: t.destination, ruta: t.path, info: t.info,
    tipo, nombreTipo: NOMBRE_TIPO[tipo], que: describirTrama(t.source, t.destination, t.info, estacion),
  };
}

/**
 * Texto para mostrar: las tramas se guardan byte a byte (latin1) para no perder
 * nada; si esos bytes son UTF-8 válido («Región»), se enseñan como tal.
 */
export function textoLegible(s: string): string {
  if (!/[\x80-\xff]/.test(s)) return s;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(s, 'latin1')); } catch { return s; }
}
