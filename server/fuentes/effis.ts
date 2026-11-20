// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · EFFIS (Sistema Europeo de Información sobre Incendios
// Forestales, Copernicus EMS). Datos CC BY 4.0, sin clave.
//
//  · Peligro de incendio: el índice FWI oficial de hoy y de los dos días
//    siguientes en el punto de la estación. WMS https://maps.effis.emergency.copernicus.eu/effis,
//    capa `mf010.fwi`, pedido como GeoTIFF float32 (valores, no colores).
//  · Áreas quemadas: perímetros cartografiados casi en tiempo real.
//    WFS https://maps.effis.emergency.copernicus.eu/gwis, capa `nrt.ba.poly`.
//
// Los servidores son MapServer y tienen sus trampas (documentadas y
// comprobadas en agent-engineering-studio/effis-client): los errores llegan
// con HTTP 200 y cuerpo XML; un día sin datos devuelve un ráster todo a cero;
// el WFS no filtra por fecha (se filtra aquí) y quiere los parámetros en
// minúsculas.

import type { Evento, Gravedad } from '../core/evento';

export const URL_EFFIS_WMS = 'https://maps.effis.emergency.copernicus.eu/effis';
export const URL_EFFIS_WFS = 'https://maps.effis.emergency.copernicus.eu/gwis';
const PASO = 0.05;      // grados por píxel
const MEDIO = 0.5;      // medio lado del recuadro alrededor de la estación

export interface Raster { ancho: number; alto: number; datos: Float32Array }

/** GeoTIFF sin comprimir de una banda float32, que es lo que sirve EFFIS. */
export function leerTiffFloat32(b: Buffer): Raster {
  if (b.length < 16) throw new Error('GeoTIFF vacío');
  const le = b.toString('latin1', 0, 2) === 'II';
  if (!le && b.toString('latin1', 0, 2) !== 'MM') throw new Error('EFFIS no devolvió un GeoTIFF');
  const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('EFFIS no devolvió un GeoTIFF');
  const ifd = u32(4);
  const n = u16(ifd);
  const etiquetas = new Map<number, { tipo: number; cuenta: number; pos: number }>();
  for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12; etiquetas.set(u16(o), { tipo: u16(o + 2), cuenta: u32(o + 4), pos: o + 8 }); }
  const valores = (tag: number): number[] => {
    const e = etiquetas.get(tag);
    if (!e) return [];
    const tam = e.tipo === 3 ? 2 : 4;
    const base = e.cuenta * tam <= 4 ? e.pos : u32(e.pos);
    return Array.from({ length: e.cuenta }, (_, i) => (tam === 2 ? u16(base + i * 2) : u32(base + i * 4)));
  };
  const ancho = valores(256)[0]; const alto = valores(257)[0];
  if (!ancho || !alto) throw new Error('GeoTIFF sin tamaño');
  if ((valores(259)[0] ?? 1) !== 1 || valores(258)[0] !== 32 || valores(339)[0] !== 3 || (valores(277)[0] ?? 1) !== 1) {
    throw new Error('GeoTIFF de EFFIS con un formato que no es float32 sin comprimir');
  }
  const inicios = valores(273); const tamanos = valores(279);
  const datos = new Float32Array(ancho * alto);
  let k = 0;
  for (let s = 0; s < inicios.length; s++) {
    for (let o = inicios[s]; o + 4 <= inicios[s] + tamanos[s] && k < datos.length; o += 4) datos[k++] = le ? b.readFloatLE(o) : b.readFloatBE(o);
  }
  if (k !== datos.length) throw new Error('GeoTIFF truncado');
  return { ancho, alto, datos };
}

/** Recuadro (oeste, sur, este, norte) alrededor del punto. */
export const recuadroFwi = (lat: number, lon: number) => ({ oeste: lon - MEDIO, sur: lat - MEDIO, este: lon + MEDIO, norte: lat + MEDIO });

/**
 * FWI en el punto; null si el ráster es todo ceros (EFFIS no tiene datos de
 * ese día). El mar vale cero también con datos: en la costa se toma el píxel
 * con valor más cercano, a dos celdas como mucho.
 */
export function fwiEnPunto(r: Raster, caja: ReturnType<typeof recuadroFwi>, lat: number, lon: number): number | null {
  if (!r.datos.some((v) => v !== 0)) return null;
  const col = Math.min(r.ancho - 1, Math.max(0, Math.floor(((lon - caja.oeste) / (caja.este - caja.oeste)) * r.ancho)));
  const fila = Math.min(r.alto - 1, Math.max(0, Math.floor(((caja.norte - lat) / (caja.norte - caja.sur)) * r.alto)));
  const en = (f: number, c: number) => (f >= 0 && f < r.alto && c >= 0 && c < r.ancho ? r.datos[f * r.ancho + c] : NaN);
  const centro = en(fila, col);
  if (Number.isFinite(centro) && centro > 0) return centro;
  let mejor: { d: number; v: number } | null = null;
  for (let df = -2; df <= 2; df++) for (let dc = -2; dc <= 2; dc++) {
    const v = en(fila + df, col + dc);
    const d = df * df + dc * dc;
    if (Number.isFinite(v) && v > 0 && (!mejor || d < mejor.d)) mejor = { d, v };
  }
  return mejor ? mejor.v : 0;
}

/** Clases de peligro de EFFIS por el valor del FWI. */
export function clasePeligro(fwi: number): { nombre: string; gravedad: Gravedad | null } {
  if (fwi >= 50) return { nombre: 'extremo', gravedad: 'rojo' };
  if (fwi >= 38) return { nombre: 'muy alto', gravedad: 'naranja' };
  if (fwi >= 21.3) return { nombre: 'alto', gravedad: 'amarillo' };
  if (fwi >= 11.2) return { nombre: 'moderado', gravedad: null };
  if (fwi >= 5.2) return { nombre: 'bajo', gravedad: null };
  return { nombre: 'muy bajo', gravedad: null };
}

export interface PeligroDia { dia: string; fwi: number | null }

/** Un aviso por día con peligro alto, muy alto o extremo. */
export function eventosPeligroIncendio(dias: PeligroDia[], estacion: { lat: number; lon: number }): Evento[] {
  const ev: Evento[] = [];
  for (const d of dias) {
    if (d.fwi === null) continue;
    const c = clasePeligro(d.fwi);
    if (!c.gravedad) continue;
    const t = Date.parse(`${d.dia}T00:00:00Z`);
    ev.push({
      id: `effis-fwi-${d.dia}-${c.gravedad}`, tipo: 'incendio', gravedad: c.gravedad,
      detalle: `Peligro de incendio ${c.nombre}`, titulo: `FWI ${Math.round(d.fwi)} el ${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
      lat: estacion.lat, lon: estacion.lon, nombre: `FWI${d.dia.slice(5, 7)}${d.dia.slice(8, 10)}`,
      inicio: t, fin: t + 86_400_000, fuente: 'EFFIS', real: true, datos: { fwi: d.fwi },
    });
  }
  return ev;
}

async function pedir(url: string, ms: number): Promise<{ tipo: string; cuerpo: Buffer }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'S.A.T.-APRS+' } });
  if (!r.ok) throw new Error(`EFFIS respondió ${r.status}`);
  return { tipo: r.headers.get('content-type') ?? '', cuerpo: Buffer.from(await r.arrayBuffer()) };
}
/** MapServer contesta 200 con XML cuando falla: se saca el motivo. */
const motivoXml = (b: Buffer) => /<ServiceException[^>]*>\s*([\s\S]*?)\s*<\/ServiceException>/.exec(b.toString('utf8', 0, 2000))?.[1]?.slice(0, 160) ?? 'respuesta que no es la esperada';

export async function descargarFwi(lat: number, lon: number, dia: string): Promise<number | null> {
  const c = recuadroFwi(lat, lon);
  const lado = String(Math.round((2 * MEDIO) / PASO));
  // WMS 1.3.0 con EPSG:4326: la latitud va primero
  const q = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'mf010.fwi', STYLES: '', CRS: 'EPSG:4326',
    BBOX: `${c.sur},${c.oeste},${c.norte},${c.este}`, WIDTH: lado, HEIGHT: lado, FORMAT: 'image/tiff', TIME: dia,
  });
  const { tipo, cuerpo } = await pedir(`${URL_EFFIS_WMS}?${q}`, 30_000);
  if (!tipo.startsWith('image/tiff')) throw new Error(`EFFIS (FWI): ${motivoXml(cuerpo)}`);
  return fwiEnPunto(leerTiffFloat32(cuerpo), c, lat, lon);
}

// ── Áreas quemadas ─────────────────────────────────────────────────────────
export interface AreaQuemada { id: string; inicio: number; fin: number | null; hectareas: number | null; lat: number; lon: number }

const fechaUtc = (s: unknown) => { const t = Date.parse(`${String(s ?? '').trim().replace(' ', 'T')}Z`); return Number.isFinite(t) ? t : null; };

/** Perímetros del GeoJSON con su centro; los que no traen fecha se dejan fuera (no se sabe si son de ahora). */
export function leerAreasQuemadas(j: any): AreaQuemada[] {
  if (!j || !Array.isArray(j.features)) throw new Error('EFFIS (áreas quemadas) no devolvió una colección GeoJSON');
  const areas: AreaQuemada[] = [];
  for (const f of j.features) {
    const p = f?.properties ?? {};
    const inicio = fechaUtc(p.initialdate ?? p.firedate ?? p.FIREDATE ?? p.fire_date);
    const g = f?.geometry;
    const anillos: number[][][] = g?.type === 'Polygon' ? [g.coordinates?.[0]] : g?.type === 'MultiPolygon' ? (g.coordinates ?? []).map((x: any) => x?.[0]) : [];
    const pts = anillos.flat().filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    const id = String(p.fire_id ?? p.id ?? '').trim();
    if (inicio === null || !pts.length || !id) continue;
    const ha = Number(p.area);
    areas.push({
      id, inicio, fin: fechaUtc(p.finaldate), hectareas: Number.isFinite(ha) && ha > 0 ? ha : null,
      lat: pts.reduce((s, c) => s + c[1], 0) / pts.length, lon: pts.reduce((s, c) => s + c[0], 0) / pts.length,
    });
  }
  return areas;
}

/** Las áreas cuya última cartografía es de los últimos `dias`: amarillo, naranja desde 500 ha y rojo desde 5000 ha. */
export function eventosAreasQuemadas(areas: AreaQuemada[], dias: number, ahora = Date.now()): Evento[] {
  return areas.filter((a) => ahora - (a.fin ?? a.inicio) < dias * 86_400_000 && a.inicio <= ahora).map((a) => {
    const ha = a.hectareas ?? 0;
    const gravedad: Gravedad = ha >= 5000 ? 'rojo' : ha >= 500 ? 'naranja' : 'amarillo';
    const d = new Date(a.inicio).toISOString();
    return {
      id: `effis-ba-${a.id}`, tipo: 'incendio' as const, gravedad,
      detalle: `Area quemada${a.hectareas ? ` ${Math.round(a.hectareas)}ha` : ''}`, titulo: `Incendio del ${d.slice(8, 10)}/${d.slice(5, 7)}`,
      lat: Math.round(a.lat * 1e5) / 1e5, lon: Math.round(a.lon * 1e5) / 1e5, nombre: `BA${a.id}`.slice(0, 9),
      inicio: a.inicio, fin: ahora + 6 * 3600_000, fuente: 'EFFIS', real: true, datos: { hectareas: ha },
    };
  });
}

export async function descargarAreasQuemadas(lat: number, lon: number, radioKm: number): Promise<AreaQuemada[]> {
  const dLat = radioKm / 111; const dLon = radioKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  // MapServer: claves en minúsculas, solo el recuadro (con `filter` la conexión se corta)
  const q = new URLSearchParams({
    service: 'WFS', version: '1.1.0', request: 'GetFeature', typename: 'nrt.ba.poly', outputformat: 'geojson', srsname: 'EPSG:4326',
    bbox: `${(lon - dLon).toFixed(4)},${(lat - dLat).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat + dLat).toFixed(4)}`, maxfeatures: '5000',
  });
  const { cuerpo } = await pedir(`${URL_EFFIS_WFS}?${q}`, 60_000);
  if (!cuerpo.length) return [];
  let j: any;
  try { j = JSON.parse(cuerpo.toString('utf8')); } catch { throw new Error(`EFFIS (áreas quemadas): ${motivoXml(cuerpo)}`); }
  return leerAreasQuemadas(j);
}
