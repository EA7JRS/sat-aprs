// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Fuente oficial de sismos.
//
// Descarga los terremotos recientes del Instituto Geográfico Nacional (IGN),
// con su feed RSS y el USGS como respaldos, y los entrega normalizados. Este
// módulo solo recoge datos: no decide qué se transmite ni conoce APRS.

import { Evento, Gravedad } from '../core/evento';

export interface Sismo {
  id: string;
  /** Hora del sismo en ISO 8601 (UTC). */
  time: string;
  latitude: number;
  longitude: number;
  depthKm: number;
  magnitud: number;
  magType: string;
  localizacion: string;
  fuente: string;
  /**
   * true si la fuente dio magnitud y hora. Cuando falta alguna se rellena
   * para poder mostrar el sismo en pantalla, pero no se anuncia por radio.
   */
  datosCompletos: boolean;
}

/** Aviso de la descarga para el registro de la consola. */
export type RegistroFuente = (origen: string, texto: string, ok: boolean) => void;

const URL_IGN = 'https://www.ign.es/web/resources/sismologia/tproximos/todos_visualizadores.js';
const URL_IGN_RSS = 'https://www.ign.es/ign/sismologia/sismos/sismos.xml';
const URL_USGS = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=27&maxlatitude=44&minlongitude=-18&maxlongitude=5&limit=200&minmagnitude=1.0';

async function descargarIgn(): Promise<any[]> {
  const res = await fetch(URL_IGN, {
    headers: { 'User-Agent': 'Mozilla/5.0 (S.A.T.-APRS)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return extraerSismosIgn(await res.text());
}

/** El visor del IGN publica varias variables JavaScript con colecciones GeoJSON. */
export function extraerSismosIgn(texto: string): any[] {
  const features: any[] = [];
  const vistos = new Set<string>();
  for (const m of texto.matchAll(/var\s+[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]*?\});/g)) {
    let coleccion: any;
    try {
      coleccion = JSON.parse(m[1]);
    } catch {
      continue;
    }
    for (const f of Array.isArray(coleccion?.features) ? coleccion.features : []) {
      const id = f?.properties?.evid || f?.id;
      if (id && vistos.has(id)) continue;
      if (id) vistos.add(id);
      features.push(f);
    }
  }
  return features;
}

async function descargarIgnRss(): Promise<any[]> {
  const res = await fetch(URL_IGN_RSS, { headers: { 'User-Agent': 'Mozilla/5.0 (S.A.T.-APRS)' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return extraerSismosRss(await res.text());
}

export function extraerSismosRss(xml: string): any[] {
  const features: any[] = [];
  const campo = (item: string, ...nombres: string[]) => {
    for (const n of nombres) {
      const m = item.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, 'i'));
      if (m) return m[1].trim();
    }
    return '';
  };
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    const lat = parseFloat(campo(item, 'geo:lat', 'lat'));
    const lon = parseFloat(campo(item, 'geo:long', 'long'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const titulo = campo(item, 'title');
    const guion = titulo.indexOf('-');
    const magTexto = guion > 0 ? titulo.slice(0, guion).replace(/[^0-9.]/g, '') : '';
    features.push({
      id: campo(item, 'link') || undefined,
      properties: {
        mag: magTexto ? parseFloat(magTexto) : undefined,
        loc: guion > 0 ? titulo.slice(guion + 1).trim() : titulo,
        fecha: campo(item, 'pubDate') || undefined,
      },
      geometry: { coordinates: [lon, lat] },
    });
  }
  return features;
}

async function descargarUsgs(): Promise<any[]> {
  const res = await fetch(URL_USGS, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const geo: any = await res.json();
  return Array.isArray(geo?.features) ? geo.features : [];
}

function horaIso(props: any): string | null {
  const fecha = props.fecha || props.fechalocal;
  if (typeof fecha === 'string' && fecha.trim().length >= 8) {
    const texto = fecha.trim();
    // El IGN da «AAAA/MM/DD HH:MM:SS» en UTC; el RSS, una fecha RFC 822
    const candidato = /^\d{4}[/-]\d{2}[/-]\d{2}/.test(texto)
      ? new Date(texto.replace(/\//g, '-').replace(' ', 'T').replace(/Z?$/, 'Z'))
      : new Date(texto);
    if (!isNaN(candidato.getTime())) return candidato.toISOString();
  }
  if (props.time !== undefined && props.time !== null) {
    const d = new Date(props.time);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** Normaliza un elemento GeoJSON de cualquiera de las fuentes. null si no tiene coordenadas. */
export function normalizarSismo(f: any, fuente: string): Sismo | null {
  const props = f?.properties || {};
  const coords = f?.geometry?.coordinates || [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;

  const magBruta = props.mag ?? props.magnitud;
  const mag = magBruta === undefined || magBruta === null || magBruta === '' ? NaN : Number(magBruta);
  const profundidad = Number(props.depth ?? props.prof ?? coords[2]);
  const hora = horaIso(props);

  let lugar = String(props.loc || props.place || 'Peninsula Iberica');
  const de = lugar.match(/\bof\s+(.+)$/); // USGS: «12 km NE of Granada, Spain»
  if (de) lugar = de[1].trim();

  return {
    id: String(f.id || props.evid || props.code || `${hora || 'sin-hora'}_${lat.toFixed(3)}_${lon.toFixed(3)}`),
    time: hora || new Date().toISOString(),
    latitude: lat,
    longitude: lon,
    depthKm: Number.isFinite(profundidad) ? profundidad : 0,
    magnitud: Number.isFinite(mag) ? mag : 2.0,
    magType: String(props.magtype || props.magType || 'mbLg'),
    localizacion: lugar,
    fuente,
    datosCompletos: Number.isFinite(mag) && hora !== null,
  };
}

/** Descarga los sismos recientes probando las fuentes por orden de preferencia. */
export async function descargarSismos(registro: RegistroFuente = () => {}): Promise<Sismo[]> {
  const fuentes: Array<[string, () => Promise<any[]>]> = [
    ['IGN', descargarIgn],
    ['IGN-RSS', descargarIgnRss],
    ['USGS', descargarUsgs],
  ];
  for (const [nombre, descargar] of fuentes) {
    try {
      const features = await descargar();
      const sismos = features.map((f) => normalizarSismo(f, nombre)).filter((s): s is Sismo => s !== null);
      if (sismos.length > 0) {
        registro(nombre, `Recuperados ${sismos.length} sismos de ${nombre}.`, true);
        return sismos;
      }
      registro(nombre, `${nombre} no devolvió sismos. Probando la siguiente fuente...`, false);
    } catch (err: any) {
      registro(nombre, `Fallo consultando ${nombre} (${err?.message || err}). Probando la siguiente fuente...`, false);
    }
  }
  return [];
}

/** Gravedad orientativa según la magnitud. */
export function gravedadSismo(magnitud: number): Gravedad {
  if (magnitud >= 5) return 'rojo';
  if (magnitud >= 4) return 'naranja';
  if (magnitud >= 3) return 'amarillo';
  return 'info';
}

/** Convierte un sismo en un aviso del modelo común. */
export function sismoAEvento(s: Sismo): Evento {
  return {
    id: `sismo:${s.id}`,
    tipo: 'sismo',
    gravedad: gravedadSismo(s.magnitud),
    titulo: s.localizacion,
    detalle: `M${s.magnitud.toFixed(1)} Prof:${Math.round(s.depthKm)}km`,
    lat: s.latitude,
    lon: s.longitude,
    inicio: new Date(s.time).getTime(),
    fuente: s.fuente.startsWith('IGN') ? 'IGN' : s.fuente,
    real: s.datosCompletos,
    datos: { magnitud: s.magnitud, profundidadKm: s.depthKm },
  };
}
