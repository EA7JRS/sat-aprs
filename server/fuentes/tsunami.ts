// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Mensajes de tsunami de tsunami.gov (NOAA): los feeds Atom del
// PTWC (Pacífico, Caribe y resto del mundo) y del NTWC (EE. UU. y Canadá).
// Es el mismo lector que el de la app Android y el plotter APRS LoRa+
// (OfficialAlerts.tsunamiEntry). La categoría la da el centro de alerta:
// Warning (rojo), Advisory (naranja), Watch (amarillo), Information (info).
// No se deduce nada de la magnitud.

import type { Evento, Gravedad } from '../core/evento';

export const URL_TSUNAMI = [
  'https://www.tsunami.gov/events/xml/PHEBAtom.xml',
  'https://www.tsunami.gov/events/xml/PAAQAtom.xml',
];

export interface MensajeTsunami {
  id: string;
  region: string;
  categoria: string;
  gravedad: Gravedad;
  magnitud: string;
  emitido: number;
  lat: number | null;
  lon: number | null;
  cancelado: boolean;
}

const CAMPOS = ['Category', 'Bulletin Issue Time', 'Preliminary Magnitude', 'Lat/Lon', 'Affected Region', 'Note', 'Definition'];
const limpio = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xml = (e: string, nombre: string) => {
  const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`).exec(e);
  return m ? limpio(m[1]).replace(/\s+/g, ' ').trim() : '';
};

export function leerEntradaTsunami(e: string): MensajeTsunami | null {
  const region = xml(e, 'title');
  const resumen = xml(e, 'summary');
  if (!region && !resumen) return null;
  const campo = (nombre: string) => {
    let p = resumen.indexOf(nombre);
    if (p < 0) return '';
    p += nombre.length;
    while (p < resumen.length && (resumen[p] === ':' || resumen[p] === ' ')) p++;
    const fines = CAMPOS.map((c) => resumen.indexOf(c, p)).filter((i) => i >= 0);
    return resumen.slice(p, fines.length ? Math.min(...fines) : resumen.length).trim();
  };
  const categoria = campo('Category');
  const c = categoria.toLowerCase();
  const cancelado = c.includes('cancel');
  const gravedad: Gravedad = cancelado ? 'info' : c.includes('warning') ? 'rojo' : c.includes('advisory') ? 'naranja' : c.includes('watch') ? 'amarillo' : 'info';
  const bt = /(\d{4})\.(\d{1,2})\.(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})/.exec(campo('Bulletin Issue Time'));
  const emitido = bt ? Date.UTC(+bt[1], +bt[2] - 1, +bt[3], +bt[4], +bt[5], +bt[6]) : Date.parse(xml(e, 'updated'));
  if (!Number.isFinite(emitido)) return null;
  const n = (s: string) => (s !== '' && Number.isFinite(Number(s)) ? Number(s) : null);
  return {
    id: xml(e, 'id') || `${region}@${emitido}`, region, categoria: categoria || 'message', gravedad,
    magnitud: campo('Preliminary Magnitude'), emitido, lat: n(xml(e, 'geo:lat')), lon: n(xml(e, 'geo:long')), cancelado,
  };
}

export function leerFeedTsunami(doc: string): MensajeTsunami[] {
  return [...String(doc ?? '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => leerEntradaTsunami(m[1])).filter((m): m is MensajeTsunami => !!m);
}

const CATEGORIA: Record<Gravedad, string> = { rojo: 'Alerta de tsunami', naranja: 'Aviso de tsunami', amarillo: 'Vigilancia de tsunami', info: 'Informacion de tsunami' };

/** Mensajes de las últimas 24 horas, sin las cancelaciones. */
export function eventosTsunami(mensajes: MensajeTsunami[], ahora = Date.now()): Evento[] {
  return mensajes.filter((m) => !m.cancelado && ahora - m.emitido < 24 * 3600_000).map((m) => ({
    id: `tsunami-${m.id}`.replace(/\s+/g, '_').slice(0, 120), tipo: 'tsunami' as const, gravedad: m.gravedad,
    detalle: `${CATEGORIA[m.gravedad]}${m.magnitud ? ` M${m.magnitud.replace(/\(.*$/, '')}` : ''}`, titulo: m.region.slice(0, 60),
    lat: m.lat ?? undefined, lon: m.lon ?? undefined,
    inicio: m.emitido, fin: m.emitido + 24 * 3600_000, fuente: 'tsunami.gov', real: true,
  }));
}

export async function descargarTsunami(): Promise<MensajeTsunami[]> {
  const todos: MensajeTsunami[] = [];
  let fallos = 0;
  for (const url of URL_TSUNAMI) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'S.A.T.-APRS+' } });
      if (!r.ok) throw new Error(String(r.status));
      todos.push(...leerFeedTsunami(await r.text()));
    } catch { fallos++; }
  }
  if (fallos === URL_TSUNAMI.length) throw new Error('tsunami.gov no responde');
  const vistos = new Set<string>();
  return todos.filter((m) => !vistos.has(m.id) && vistos.add(m.id)).sort((a, b) => b.emitido - a.emitido);
}
