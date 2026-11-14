// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Fuente oficial de avisos meteorológicos (AEMET, Meteoalerta).
//
// AEMET publica sus avisos de fenómenos adversos como documentos CAP 1.2, uno
// por zona y fenómeno, y un índice RSS que los enlaza. No hace falta clave.
// Cada aviso trae el nivel (amarillo, naranja, rojo), el fenómeno, su valor
// umbral, la vigencia y el polígono de la zona afectada. Este módulo solo
// recoge y normaliza: no decide qué se transmite ni conoce APRS.

import { Evento, Gravedad } from '../core/evento';
import { Punto, centroZona, leerPoligonoCap } from '../core/zona';
import { RegistroFuente } from './sismos';

/** Índice nacional de avisos en vigor o previstos. */
export const URL_AEMET_AVISOS = 'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAE_RSS.xml';
const PREFIJO_CAP = 'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/';

/** Tope de documentos por ciclo: en un temporal nacional puede haber cientos. */
const MAX_CAP_POR_CICLO = 150;
const DESCARGAS_SIMULTANEAS = 4;

export interface AvisoAemet {
  /** Identificador CAP del documento. */
  identificador: string;
  /** Alert, Update o Cancel. */
  tipoMensaje: string;
  /** Momento de emisión (ms epoch). */
  enviado: number;
  /** Código de zona de Meteoalerta (6 cifras: comunidad, provincia, zona). */
  zona: string;
  nombreZona: string;
  /** Código del fenómeno (PR lluvias, VI viento, TO tormentas, NE nevadas...). */
  fenomeno: string;
  nombreFenomeno: string;
  nivel: Gravedad;
  /** Valor umbral del aviso tal como lo da AEMET («15 mm», «70 km/h»...). */
  valor: string;
  probabilidad: string;
  inicio: number;
  fin: number;
  titular: string;
  descripcion: string;
  poligono: Punto[];
}

// ---------------------------------------------------------------------------
// Lectura de XML (los documentos CAP son planos y regulares: basta con esto)
// ---------------------------------------------------------------------------
function entidades(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

/** Texto del primer elemento con ese nombre (con o sin prefijo de espacio de nombres). */
function etiqueta(xml: string, nombre: string): string {
  const m = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`).exec(xml);
  return m ? entidades(m[1]) : '';
}

function bloques(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

/** Pares valueName → value de los elementos <parameter>, <eventCode> o <geocode>. */
function pares(xml: string, nombre: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const b of bloques(xml, nombre)) {
    const clave = etiqueta(b, 'valueName');
    if (clave) salida[clave] = etiqueta(b, 'value');
  }
  return salida;
}

const NIVELES: Record<string, Gravedad> = { amarillo: 'amarillo', naranja: 'naranja', rojo: 'rojo' };
const SEVERIDAD_CAP: Record<string, Gravedad> = { moderate: 'amarillo', severe: 'naranja', extreme: 'rojo' };

/** Enlaces a documentos CAP que aparecen en el índice RSS/Atom de AEMET. */
export function extraerEnlacesCap(indice: string): string[] {
  const vistos = new Set<string>();
  for (const m of String(indice ?? '').matchAll(/https?:\/\/www\.aemet\.es\/documentos_d\/eltiempo\/prediccion\/avisos\/cap\/[A-Za-z0-9_.-]+\.xml/g)) {
    vistos.add(m[0].replace(/^http:/, 'https:'));
  }
  return [...vistos];
}

/**
 * Interpreta un documento CAP de AEMET. Devuelve null si no es un aviso
 * utilizable: sin nivel (verde), sin vigencia, sin zona o de prueba.
 */
export function leerCap(xml: string): AvisoAemet | null {
  if (!/<(?:[\w-]+:)?alert[\s>]/.test(xml)) return null;
  if (etiqueta(xml, 'status').toLowerCase() !== 'actual') return null; // Test, Exercise, Draft...

  const infos = bloques(xml, 'info');
  const info = infos.find((i) => /^es/i.test(etiqueta(i, 'language'))) ?? infos[0];
  if (!info) return null;

  const parametros = pares(info, 'parameter');
  const codigos = pares(info, 'eventCode');
  const area = bloques(info, 'area')[0] ?? '';
  const geocodigos = pares(area, 'geocode');

  const nivel = NIVELES[(parametros['AEMET-Meteoalerta nivel'] || '').toLowerCase()]
    ?? SEVERIDAD_CAP[etiqueta(info, 'severity').toLowerCase()];
  if (!nivel) return null;

  const inicio = Date.parse(etiqueta(info, 'onset') || etiqueta(info, 'effective'));
  const fin = Date.parse(etiqueta(info, 'expires'));
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null;

  const zona = (geocodigos['AEMET-Meteoalerta zona'] || '').trim();
  const nombreZona = etiqueta(area, 'areaDesc');
  if (!zona && !nombreZona) return null;

  const [fenomeno = '', nombreFenomeno = ''] = (codigos['AEMET-Meteoalerta fenomeno'] || '').split(';');
  // «P1;Precipitación acumulada en una hora;15 mm» → «15 mm»
  const valor = (parametros['AEMET-Meteoalerta parametro'] || '').split(';').pop()?.trim() || '';

  return {
    identificador: etiqueta(xml, 'identifier'),
    tipoMensaje: etiqueta(xml, 'msgType') || 'Alert',
    enviado: Date.parse(etiqueta(xml, 'sent')) || inicio,
    zona,
    nombreZona,
    fenomeno: fenomeno.trim().toUpperCase(),
    nombreFenomeno: nombreFenomeno.trim() || etiqueta(info, 'event'),
    nivel,
    valor,
    probabilidad: parametros['AEMET-Meteoalerta probabilidad'] || '',
    inicio,
    fin,
    titular: etiqueta(info, 'headline') || etiqueta(info, 'event'),
    descripcion: etiqueta(info, 'description'),
    poligono: leerPoligonoCap(etiqueta(area, 'polygon')),
  };
}

/** Clave de un aviso: misma zona, fenómeno y comienzo = el mismo aviso (y sus actualizaciones). */
function claveAviso(a: AvisoAemet): string {
  return `${a.zona || a.nombreZona}|${a.fenomeno || a.nombreFenomeno}|${a.inicio}`;
}

/**
 * De varios documentos sobre el mismo aviso se queda con el último emitido;
 * si ese es una cancelación, el aviso desaparece. Quita también los caducados.
 */
export function avisosVigentes(avisos: AvisoAemet[], ahora: number): AvisoAemet[] {
  const ultimo = new Map<string, AvisoAemet>();
  for (const a of avisos) {
    const k = claveAviso(a);
    const previo = ultimo.get(k);
    if (!previo || a.enviado >= previo.enviado) ultimo.set(k, a);
  }
  return [...ultimo.values()]
    .filter((a) => a.tipoMensaje.toLowerCase() !== 'cancel' && a.fin > ahora)
    .sort((a, b) => a.inicio - b.inicio);
}

const dos = (n: number) => n.toString().padStart(2, '0');

/** Vigencia compacta en UTC: «10/00-04z» o, si cambia de día, «09/22-10/02z». */
export function vigenciaCorta(inicio: number, fin: number): string {
  const a = new Date(inicio);
  const b = new Date(fin + 1000); // 03:59:59 → 04:00
  const desde = `${dos(a.getUTCDate())}/${dos(a.getUTCHours())}`;
  const hasta = a.getUTCDate() === b.getUTCDate() ? dos(b.getUTCHours()) : `${dos(b.getUTCDate())}/${dos(b.getUTCHours())}`;
  return `${desde}-${hasta}z`;
}

/** Convierte el aviso al modelo común. Sin polígono no tiene posición: no se puede situar ni filtrar. */
export function avisoAEvento(a: AvisoAemet): Evento {
  const centro = centroZona(a.poligono);
  const valor = a.valor.replace(/\s+/g, '');
  return {
    // El nivel forma parte del identificador: si el aviso sube de nivel se anuncia de nuevo
    id: `AEMET-${claveAviso(a)}|${a.nivel}`,
    tipo: 'meteo',
    gravedad: a.nivel,
    titulo: a.nombreZona,
    detalle: [a.nivel.toUpperCase(), a.nombreFenomeno, valor, vigenciaCorta(a.inicio, a.fin)].filter(Boolean).join(' '),
    lat: centro?.lat,
    lon: centro?.lon,
    zona: a.poligono.length >= 3 ? a.poligono : undefined,
    // Objeto estable por zona y fenómeno: «PR610404»
    nombre: a.zona && a.fenomeno ? `${a.fenomeno.slice(0, 2)}${a.zona.slice(0, 6)}` : undefined,
    inicio: a.inicio,
    fin: a.fin,
    fuente: 'AEMET',
    // Sin zona delimitada no se puede saber si afecta a la estación: se muestra, no se emite
    real: a.poligono.length >= 3,
    datos: { enviado: a.enviado },
  };
}

async function descargarTexto(url: string, tiempoMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (S.A.T.-APRS)' },
    signal: AbortSignal.timeout(tiempoMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Caché de documentos CAP ya leídos (son inmutables: cada actualización es un
 * documento nuevo). null = documento descargado pero no utilizable.
 */
export type CacheCap = Map<string, AvisoAemet | null>;

/**
 * Descarga los avisos de AEMET en vigor o previstos. Devuelve null si el
 * índice no se pudo descargar (se conserva entonces la última lista válida).
 */
export async function descargarAvisosAemet(
  cache: CacheCap,
  registrar: RegistroFuente = () => {},
  urlIndice: string = URL_AEMET_AVISOS,
): Promise<AvisoAemet[] | null> {
  let enlaces: string[];
  try {
    const indice = await descargarTexto(urlIndice, 12000);
    enlaces = extraerEnlacesCap(indice).filter((u) => u.startsWith(PREFIJO_CAP));
    const entradas = (indice.match(/<(item|entry)[\s>]/g) || []).length;
    if (enlaces.length === 0 && entradas > 1) {
      // Varias entradas y ningún documento CAP: el formato del índice ha cambiado
      registrar('AEMET', `El índice de avisos de AEMET tiene ${entradas} entradas pero ningún documento CAP reconocible.`, false);
    }
  } catch (e: any) {
    registrar('AEMET', `No se pudo descargar el índice de avisos de AEMET: ${e?.message || e}.`, false);
    return null;
  }

  // Lo que ya no está en el índice ha dejado de estar en vigor: fuera de la caché
  const vigentes = new Set(enlaces);
  for (const url of cache.keys()) if (!vigentes.has(url)) cache.delete(url);

  const pendientes = enlaces.filter((u) => !cache.has(u)).slice(0, MAX_CAP_POR_CICLO);
  let fallos = 0;
  for (let i = 0; i < pendientes.length; i += DESCARGAS_SIMULTANEAS) {
    await Promise.all(pendientes.slice(i, i + DESCARGAS_SIMULTANEAS).map(async (url) => {
      try {
        cache.set(url, leerCap(await descargarTexto(url, 10000)));
      } catch {
        fallos++; // se reintenta en el ciclo siguiente
      }
    }));
  }

  const avisos = avisosVigentes([...cache.values()].filter((a): a is AvisoAemet => a !== null), Date.now());
  registrar('AEMET', `Avisos de AEMET: ${avisos.length} en vigor o previstos (${enlaces.length} documentos, ${pendientes.length} nuevos${fallos ? `, ${fallos} fallidos` : ''}).`, true);
  return avisos;
}
