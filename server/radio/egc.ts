// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Inmarsat-C EGC (SafetyNET) recibido con un SDR propio.
//
// El descodificador va fuera de la consola: InmarScope (GPL-3.0, RTL-SDR,
// SDRplay, Airspy…) manda cada mensaje EGC por UDP como una línea JSON, el
// formato STD-C de inmarsat-sniffer:
//   {"source":"InmarScope","type":"egc","service":"SafetyNET, …","priority":"Urgency",
//    "msg_id":1234,"presentation":0,"time_utc":"12:34:56","downlink_mhz":1537.7,
//    "text":"…","timestamp":1795139171}
// o, en su formato compacto, {"ut":…,"sv":…,"pr":…,"f":…,"tx":…}.
// Un mensaje largo llega en varios trozos con el mismo msg_id: cada envío
// trae el texto acumulado, así que se queda el más largo.

import type { Evento, Gravedad } from '../core/evento';
import { posicionEnTexto } from '../core/posicionTexto';

export interface MensajeEgc {
  clave: string;
  servicio: string;
  prioridad: string;
  msgId: number | null;
  hora: string | null;
  mhz: number | null;
  texto: string;
  recibido: number;
  posicion: { lat: number; lon: number } | null;
}

const GRAVEDAD: Record<string, Gravedad> = { distress: 'rojo', urgency: 'naranja', safety: 'amarillo', routine: 'info' };
const PRIORIDAD: Record<string, string> = { distress: 'Socorro', urgency: 'Urgencia', safety: 'Seguridad', routine: 'Rutina' };
export const prioridadEs = (p: string) => PRIORIDAD[p.toLowerCase()] ?? p;

/** Una línea JSON de InmarScope. Devuelve null si no es un mensaje EGC con texto. */
export function leerEgc(linea: string, ahora = Date.now()): MensajeEgc | null {
  let j: any;
  try { j = JSON.parse(linea); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const compacto = j.type === undefined && (j.sv !== undefined || j.tx !== undefined);
  if (!compacto && j.type !== 'egc') return null;   // ACARS, LES… no son EGC
  const servicio = String((compacto ? j.sv : j.service) ?? '').trim();
  const prioridad = String((compacto ? j.pr : j.priority) ?? '').trim();
  const texto = String((compacto ? j.tx : j.text) ?? '').replace(/\r/g, '').trim();
  if (!texto || prioridad === 'Terminal' || /^\(presentation \d+/.test(texto)) return null;
  const msgId = Number.isFinite(Number(j.msg_id)) ? Number(j.msg_id) : null;
  const mhz = Number(compacto ? j.f : j.downlink_mhz);
  const ts = Number(j.timestamp);
  return {
    // Sin msg_id (formato compacto) la clave es el principio del texto
    clave: msgId !== null && msgId > 0 ? `${servicio}|${msgId}` : `${servicio}|${texto.slice(0, 60)}`,
    servicio, prioridad, msgId, hora: String((compacto ? j.ut : j.time_utc) ?? '') || null,
    mhz: Number.isFinite(mhz) && mhz > 0 ? mhz : null, texto,
    recibido: Number.isFinite(ts) && ts > 1e9 ? ts * 1000 : ahora, posicion: posicionEnTexto(texto),
  };
}

/** Junta los trozos de un mismo mensaje: se queda el texto más largo y la última recepción. */
export function juntarEgc(lista: MensajeEgc[], m: MensajeEgc, max = 200): MensajeEgc[] {
  const i = lista.findIndex((x) => x.clave === m.clave && m.recibido - x.recibido < 6 * 3600_000);
  if (i >= 0) {
    const a = lista[i];
    const texto = m.texto.length >= a.texto.length ? m.texto : a.texto;
    lista[i] = { ...a, texto, recibido: Math.max(a.recibido, m.recibido), posicion: a.posicion ?? posicionEnTexto(texto) };
    return lista;
  }
  return [m, ...lista].slice(0, max);
}

export function eventoEgc(m: MensajeEgc, vigenciaMs: number): Evento {
  const lineas = m.texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const servicio = m.servicio.replace(/^SafetyNET,\s*/i, '');
  return {
    id: `egc-${m.clave}`.replace(/\s+/g, '_').slice(0, 120), tipo: 'maritimo',
    gravedad: GRAVEDAD[m.prioridad.toLowerCase()] ?? 'info',
    detalle: `EGC ${prioridadEs(m.prioridad)}`, titulo: (lineas[0] ?? servicio).slice(0, 60),
    lat: m.posicion?.lat, lon: m.posicion?.lon,
    nombre: m.msgId ? `EGC${m.msgId}`.slice(0, 9) : undefined,
    inicio: m.recibido, fin: m.recibido + vigenciaMs, fuente: 'Inmarsat-C', real: true,
  };
}
