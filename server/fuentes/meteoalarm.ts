// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Avisos meteorológicos de MeteoAlarm (EUMETNET).
//
// MeteoAlarm reúne los avisos oficiales de los servicios meteorológicos
// europeos (AEMET en España, IPMA en Portugal, Météo-France…) en un feed Atom
// por país, sin clave: https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<país>
// Cada entrada es un aviso para una zona (código EMMA_ID y nombre), con su
// nivel, fenómeno y vigencia. El feed no trae la geometría de la zona: la
// estación sigue las zonas que se le indiquen (por código o por nombre).
// Datos de EUMETNET/MeteoAlarm bajo condiciones equivalentes a CC BY 4.0.

import type { Evento, Gravedad } from '../core/evento';

export const URL_METEOALARM = (pais: string) => `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${encodeURIComponent(pais)}`;

export interface AvisoMeteoAlarm {
  pais: string;
  zona: string;       // EMMA_ID (p. ej. ES084)
  nombreZona: string;
  evento: string;     // «Moderate rain warning»
  gravedad: Gravedad;
  inicio: number;
  fin: number;
  identificador: string;
  tipoMensaje: string;
  estado: string;
}

function texto(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').trim();
}
const campo = (xml: string, nombre: string) => {
  const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`).exec(xml);
  return m ? texto(m[1]) : '';
};

const GRAVEDAD: Record<string, Gravedad> = { minor: 'info', moderate: 'amarillo', severe: 'naranja', extreme: 'rojo' };

/** Entradas del feed Atom de un país. */
export function leerFeedMeteoAlarm(xml: string, pais: string): AvisoMeteoAlarm[] {
  const avisos: AvisoMeteoAlarm[] = [];
  for (const m of String(xml ?? '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const geocode = /<cap:geocode>([\s\S]*?)<\/cap:geocode>/.exec(e)?.[1] ?? '';
    const zona = campo(geocode, 'value');
    const evento = campo(e, 'cap:event');
    const inicio = Date.parse(campo(e, 'cap:onset') || campo(e, 'cap:effective'));
    const fin = Date.parse(campo(e, 'cap:expires'));
    if (!zona || !evento || !Number.isFinite(inicio) || !Number.isFinite(fin)) continue;
    avisos.push({
      pais, zona, nombreZona: campo(e, 'cap:areaDesc') || zona, evento,
      gravedad: GRAVEDAD[campo(e, 'cap:severity').toLowerCase()] ?? 'info',
      inicio, fin, identificador: campo(e, 'cap:identifier') || campo(e, 'id'),
      tipoMensaje: campo(e, 'cap:message_type') || campo(e, 'cap:msgType'), estado: campo(e, 'cap:status'),
    });
  }
  return avisos;
}

// Fenómeno en castellano a partir del texto del aviso (los nombres de MeteoAlarm)
const FENOMENOS: Array<[RegExp, string]> = [
  [/thunder/i, 'tormentas'], [/rain.?flood|flood/i, 'inundaciones'], [/rain/i, 'lluvia'], [/wind/i, 'viento'],
  [/snow|ice/i, 'nieve y hielo'], [/fog/i, 'niebla'], [/high.?temp|heat/i, 'calor'], [/low.?temp|cold|frost/i, 'frio'],
  [/coastal/i, 'costeros'], [/forest.?fire|fire/i, 'incendios'], [/avalanche/i, 'aludes'], [/marine/i, 'maritimo'], [/drought/i, 'sequia'],
];
// Dos letras por fenómeno para el nombre del objeto APRS (zona + fenómeno: «PT014VI»)
const SIGLA: Record<string, string> = {
  tormentas: 'TO', inundaciones: 'IN', lluvia: 'LL', viento: 'VI', 'nieve y hielo': 'NE', niebla: 'NI', calor: 'CA',
  frio: 'FR', costeros: 'CO', incendios: 'IF', aludes: 'AL', maritimo: 'MA', sequia: 'SE',
};
export function fenomeno(evento: string): string {
  return FENOMENOS.find(([re]) => re.test(evento))?.[1] ?? evento.replace(/\s*warning\s*$/i, '').toLowerCase();
}
const NIVEL: Record<Gravedad, string> = { info: 'Verde', amarillo: 'Amarillo', naranja: 'Naranja', rojo: 'Rojo' };

/** Lista de zonas que sigue la estación: «ES084, Campiña sevillana» → códigos y trozos de nombre. */
export function zonasSeguidas(texto: string): { codigos: Set<string>; nombres: string[] } {
  const codigos = new Set<string>();
  const nombres: string[] = [];
  for (const t of String(texto ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
    if (/^[A-Z]{2}\d{3,}$/i.test(t)) codigos.add(t.toUpperCase());
    else nombres.push(t.toLowerCase());
  }
  return { codigos, nombres };
}

export function sigueZona(a: Pick<AvisoMeteoAlarm, 'zona' | 'nombreZona'>, z: ReturnType<typeof zonasSeguidas>): boolean {
  if (z.codigos.has(a.zona.toUpperCase())) return true;
  const n = a.nombreZona.toLowerCase();
  return z.nombres.some((t) => n.includes(t));
}

/**
 * Avisos en vigor o previstos de las zonas seguidas, como eventos en la
 * posición de la estación (la zona la ha elegido el operador). Con `sinEspana`
 * se dejan fuera las zonas españolas, que ya llegan de AEMET directamente.
 */
export function eventosMeteoAlarm(avisos: AvisoMeteoAlarm[], zonas: string, estacion: { lat: number; lon: number }, ahora = Date.now(), sinEspana = false): Evento[] {
  const z = zonasSeguidas(zonas);
  const ev = new Map<string, Evento>();
  for (const a of avisos) {
    if (a.estado && a.estado !== 'Actual') continue;
    if (/cancel/i.test(a.tipoMensaje) || a.fin < ahora) continue;
    if (sinEspana && a.zona.toUpperCase().startsWith('ES')) continue;
    if (!sigueZona(a, z)) continue;
    const f = fenomeno(a.evento);
    // Una zona y un fenómeno por día de inicio: las actualizaciones no duplican el aviso
    const id = `meteoalarm-${a.zona}-${f.replace(/\s+/g, '_')}-${new Date(a.inicio).toISOString().slice(0, 10)}-${a.gravedad}`;
    if (ev.has(id) && (ev.get(id)!.fin ?? 0) >= a.fin) continue;
    ev.set(id, {
      id, tipo: 'meteo', gravedad: a.gravedad,
      // Como en AEMET: el detalle dice qué (nivel y fenómeno) y el título, dónde
      titulo: a.nombreZona.slice(0, 60), detalle: `${NIVEL[a.gravedad].toUpperCase()} ${f.charAt(0).toUpperCase()}${f.slice(1)}`,
      nombre: `${a.zona.replace(/[^A-Za-z0-9]/g, '')}${SIGLA[f] ?? 'WX'}`.slice(0, 9),
      lat: estacion.lat, lon: estacion.lon,
      inicio: a.inicio, fin: a.fin, fuente: 'MeteoAlarm', real: true,
    });
  }
  return [...ev.values()];
}

export async function descargarMeteoAlarm(pais: string): Promise<AvisoMeteoAlarm[]> {
  const r = await fetch(URL_METEOALARM(pais), { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'S.A.T.-APRS' } });
  if (!r.ok) throw new Error(`MeteoAlarm (${pais}) respondió ${r.status}`);
  return leerFeedMeteoAlarm(await r.text(), pais);
}
