// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · NAVTEX recibido con un SDR propio.
//
// El receptor es el programa Navtex (github.com/EA7JRS/Navtex), en este equipo
// o en otro de la red: recibe 518 y 490 kHz a la vez, o 4209,5 kHz, con un
// SDRplay o un RTL-SDR, y guarda los mensajes «ZCZC B1B2B3B4 … NNNN». La consola
// le pregunta por su API: mensajes, estado de los dos receptores, ajustes y
// la tabla de estaciones.
//
//   B1 estación transmisora (A–Z), B2 tema, B3B4 número.
//   Temas que un receptor no puede rechazar: A, B, D y L.

import type { Evento, Gravedad } from '../core/evento';
import { posicionEnTexto } from '../core/posicionTexto';

export const TEMAS_NAVTEX: Record<string, string> = {
  A: 'Aviso a los navegantes', B: 'Aviso meteorológico', C: 'Hielos', D: 'Búsqueda y salvamento / piratería',
  E: 'Previsión meteorológica', F: 'Practicaje', G: 'AIS', H: 'LORAN', I: 'Reservado', J: 'Navegación por satélite',
  K: 'Otras ayudas electrónicas', L: 'Aviso a los navegantes (adicional)', T: 'Prueba', V: 'Servicio especial',
  W: 'Servicio especial', X: 'Servicio especial', Y: 'Servicio especial', Z: 'Sin mensajes',
};
const GRAVEDAD_TEMA: Record<string, Gravedad> = { D: 'rojo', B: 'naranja', A: 'amarillo', L: 'amarillo' };

export interface MensajeNavtex {
  /** Estación, tema y número: «GA12». */
  cabecera: string;
  estacion: string;
  tema: string;
  numero: number;
  texto: string;
  /** Grupo fecha-hora del mensaje si lo trae («062040 UTC NOV 21»). */
  dtg: string | null;
  recibido: number;
  /** Sin «NNNN»: el mensaje se cortó (llegó otra cabecera o se acabó la señal). */
  incompleto: boolean;
  posicion: { lat: number; lon: number } | null;
}

/** Huella corta del texto: el mismo aviso repetido cada 4 horas tiene la misma. */
function huella(t: string): string {
  let h = 2166136261;
  for (const c of t.replace(/\s+/g, ' ').trim()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
export const claveNavtex = (m: Pick<MensajeNavtex, 'cabecera' | 'texto'>) => `${m.cabecera}-${huella(m.texto)}`;

function mensaje(cab: string, cuerpo: string, recibido: number, incompleto: boolean): MensajeNavtex | null {
  const texto = cuerpo.replace(/\r/g, '').replace(/[^\x20-\x7e\n]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (texto.length < 8) return null;
  return {
    cabecera: cab, estacion: cab[0], tema: cab[1], numero: Number(cab.slice(2)),
    texto, dtg: /^\s*(\d{6} ?UTC [A-Z]{3} \d{2,4})/m.exec(texto)?.[1] ?? null,
    recibido, incompleto, posicion: posicionEnTexto(texto),
  };
}

/**
 * Mensajes del receptor NAVTEX en red (fork EA7JRS/Navtex), tal como los da
 * su API `GET /api/messages?since=<id>`:
 *   {"id":5,"bbbb":"EE39","freq":490,"received":"2026-11-22T07:38:00Z","complete":false,"message":"ZCZC EE39\n…"}
 * Recibe 518 y 490 kHz a la vez, o 4209,5 kHz (onda corta) si se le pide. Devuelve los mensajes y el mayor id visto,
 * para pedir la próxima vez solo los nuevos.
 */
export interface MensajeNavtexRed extends MensajeNavtex {
  freq: number | null;
  /** Identificador en el receptor, para pedirle que lo borre. */
  idReceptor?: number;
  /** Caracteres que no se pudieron recibir, y si la recepción se da por buena (menos de un 4 %, OMI MSC.148(77)). */
  errores?: number | null;
  satisfactorio?: boolean | null;
  /** Si llegó en el turno de su letra. */
  enTurno?: boolean | null;
}
export function mensajesDeReceptor(j: unknown, ahora = Date.now()): { mensajes: MensajeNavtexRed[]; ultimoId: number; ultimoOido: number } {
  const mensajes: MensajeNavtexRed[] = [];
  let ultimoId = 0;
  let ultimoOido = 0;
  for (const x of (Array.isArray(j) ? j : [])) {
    const id = Number(x?.id);
    if (Number.isInteger(id) && id > ultimoId) ultimoId = id;
    const cab = String(x?.bbbb ?? '').toUpperCase();
    if (!/^[A-Z]{2}\d\d$/.test(cab) || typeof x?.message !== 'string') continue;
    // El texto llega con su cabecera y, si se cerró, con el NNNN: se quitan
    const cuerpo = x.message.replace(/\r/g, '').split('\n')
      .filter((l: string, i: number) => !(i === 0 && /ZCZC/.test(l))).join('\n').replace(/\n?\s*NNNN\s*$/, '');
    const cuando = Date.parse(String(x?.received ?? ''));
    // Una hora del receptor en el futuro o absurda no se cree: vale la de la consola
    const creible = (t: number) => Number.isFinite(t) && t <= ahora + 5 * 60_000 && t > ahora - 7 * 86400_000;
    // «heard» (Navtex 1.2): la última vez que se oyó; el receptor ya no guarda otra vez lo que la estación repite
    const oido = Number(x?.heard) * 1000;
    if (typeof x?.heard === 'number' && creible(oido) && x.heard > ultimoOido) ultimoOido = x.heard;
    const recibido = typeof x?.heard === 'number' && creible(oido) && (!creible(cuando) || oido > cuando) ? oido : creible(cuando) ? cuando : ahora;
    const m = mensaje(cab, cuerpo, recibido, x?.complete === false);
    const freq = Number(x?.freq);
    // 4209 es el canal de onda corta, 4209,5 kHz
    if (m) mensajes.push({
      ...m, freq: freq === 518 || freq === 490 || freq === 4209 ? freq : null, idReceptor: Number.isInteger(id) && id > 0 ? id : undefined,
      errores: Number.isInteger(x?.errors) && x.errors >= 0 ? x.errors : null,
      satisfactorio: typeof x?.satisfactory === 'boolean' ? x.satisfactory : null, enTurno: typeof x?.in_slot === 'boolean' ? x.in_slot : null,
    });
  }
  return { mensajes, ultimoId, ultimoOido };
}

/** Dirección del receptor en red: solo http(s)://equipo[:puerto], sin ruta ni credenciales. */
export function urlReceptorValida(texto: string): string | null {
  const t = String(texto ?? '').trim().replace(/\/+$/, '');
  if (!t) return null;
  try {
    const u = new URL(t);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null;
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

export function eventoNavtex(m: MensajeNavtex, vigenciaMs: number): Evento | null {
  const gravedad = GRAVEDAD_TEMA[m.tema] ?? 'info';
  // La primera línea con contenido que no es el grupo fecha-hora
  const lineas = m.texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const util = lineas.find((l) => !/^\d{6} ?UTC/.test(l)) ?? lineas[0] ?? '';
  return {
    id: `navtex-${claveNavtex(m)}`, tipo: 'maritimo', gravedad,
    detalle: `NAVTEX ${m.cabecera}`, titulo: util.slice(0, 60),
    lat: m.posicion?.lat, lon: m.posicion?.lon,
    nombre: `NTX${m.cabecera}`,
    inicio: m.recibido, fin: m.recibido + vigenciaMs, fuente: `NAVTEX ${m.estacion}`, real: true,
  };
}

// ---------------------------------------------------------------------------
// Estaciones NAVTEX (la tabla que publica el receptor: UIT, Tabla 4, y Wikipedia para 4209,5 kHz)

export interface EstacionNavtex {
  area: string; pais: string; nombre: string; lat: number | null; lon: number | null;
  khz: 518 | 490 | 4209; letra: string; horas: string[]; alcanceMn: number | null; idioma: string; activa: boolean; fuente: string;
}
export interface FuenteEstaciones { nombre: string; titulo: string; fecha: string; url: string }

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Lee `estaciones.json` del receptor. Lo que no encaja se descarta: nunca se inventa una estación. */
export function estacionesDeReceptor(j: unknown): { estaciones: EstacionNavtex[]; fuentes: FuenteEstaciones[] } {
  const o = (j && typeof j === 'object' ? j : {}) as any;
  const estaciones: EstacionNavtex[] = [];
  for (const x of (Array.isArray(o.estaciones) ? o.estaciones : []).slice(0, 2000)) {
    const khz = Number(x?.khz);
    const letra = String(x?.letra ?? '').toUpperCase();
    if ((khz !== 518 && khz !== 490 && khz !== 4209) || !/^[A-Z]$/.test(letra)) continue;
    const lat = Number(x?.lat), lon = Number(x?.lon);
    const conPos = x?.lat !== null && x?.lon !== null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const alcance = Number(x?.alcance);
    estaciones.push({
      area: texto(x?.area, 8), pais: texto(x?.pais, 60), nombre: texto(x?.nombre, 80),
      lat: conPos ? lat : null, lon: conPos ? lon : null, khz, letra,
      horas: (Array.isArray(x?.horas) ? x.horas : []).filter((h: unknown) => typeof h === 'string' && /^([01]\d|2[0-3])[0-5]\d$/.test(h)).slice(0, 48),
      alcanceMn: x?.alcance !== null && Number.isFinite(alcance) && alcance > 0 ? alcance : null,
      idioma: texto(x?.idioma, 40), activa: x?.estado === 'activa', fuente: texto(x?.fuente, 20),
    });
  }
  const fuentes = (Array.isArray(o.fuentes) ? o.fuentes : []).slice(0, 8)
    .map((f: any) => ({ nombre: texto(f?.nombre, 20), titulo: texto(f?.titulo, 160), fecha: texto(f?.fecha, 10), url: /^https:\/\//.test(String(f?.url)) ? texto(f.url, 200) : '' }));
  return { estaciones, fuentes };
}

/** Próxima emisión (ms) de una estación con esas horas UTC «HHMM», o null si no tiene. */
export function proximaEmision(horas: string[], ahora = Date.now()): number | null {
  const d = new Date(ahora);
  let mejor: number | null = null;
  for (const h of horas) {
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(h.slice(0, 2)), Number(h.slice(2)));
    if (t <= ahora) t += 86400_000;
    if (mejor === null || t < mejor) mejor = t;
  }
  return mejor;
}
/** ¿Está emitiendo ahora? Cada turno dura 10 minutos. */
export const emitiendoAhora = (horas: string[], ahora = Date.now()): boolean => {
  const p = proximaEmision(horas, ahora - 600_000);
  return p !== null && p <= ahora;
};

const KM_MN = 1.852;
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface EstacionVista extends EstacionNavtex { km: number | null; mn: number | null; enAlcance: boolean; proxima: number | null; emitiendo: boolean }
/** Las estaciones con su distancia, ordenadas de cerca a lejos (las que no tienen posición, al final). */
export function estacionesPorDistancia(lista: EstacionNavtex[], pos: { lat: number; lon: number } | null, ahora = Date.now()): EstacionVista[] {
  return lista.map((e) => {
    const km = pos && e.lat !== null && e.lon !== null ? distanciaKm(pos, { lat: e.lat, lon: e.lon }) : null;
    const mn = km === null ? null : km / KM_MN;
    return { ...e, km: km === null ? null : Math.round(km), mn: mn === null ? null : Math.round(mn), enAlcance: mn !== null && e.alcanceMn !== null && mn <= e.alcanceMn, proxima: proximaEmision(e.horas, ahora), emitiendo: emitiendoAhora(e.horas, ahora) };
  }).sort((a, b) => (a.km === null ? 1 : 0) - (b.km === null ? 1 : 0) || (a.km ?? 0) - (b.km ?? 0) || a.khz - b.khz || a.letra.localeCompare(b.letra));
}

// ---------------------------------------------------------------------------
// Ajustes de los dos receptores. Las mismas reglas que aplica el receptor (valid_setting):
// la consola no le manda nada que él fuera a rechazar, ni una clave que no sea de un receptor.
const UNA_DE = (v: string, ...ops: string[]) => ops.includes(v);
export function ajusteReceptorValido(clave: string, valor: string): boolean {
  if (typeof valor !== 'string') return false;
  // Conservación de los mensajes y salida NMEA 0183 del receptor (Navtex 1.2)
  if (clave === 'retention_hours') return /^\d{2,4}$/.test(valor) && Number(valor) >= 72 && Number(valor) <= 8760;
  if (clave === 'nrx.udp') return valor === '' || (/^[A-Za-z0-9.-]{1,70}:\d{1,5}$/.test(valor) && Number(valor.split(':')[1]) >= 1 && Number(valor.split(':')[1]) <= 65535);
  if (clave === 'nrx.tcp') return /^\d{1,5}$/.test(valor) && (Number(valor) === 0 || (Number(valor) >= 1024 && Number(valor) <= 65535));
  const m = /^rx[12]\.(enabled|source|band|hf_slots|port|bias|serial|direct|upconv|gain|ppm)$/.exec(String(clave));
  if (!m) return false;
  switch (m[1]) {
    case 'enabled': case 'bias': return UNA_DE(valor, '0', '1');
    case 'source': return UNA_DE(valor, 'sdrplay', 'rtlsdr');
    case 'band': return UNA_DE(valor, 'mf', 'hf', 'auto');
    case 'hf_slots': return valor === '' || (/^(([01]\d|2[0-3])[0-5]\d)(,([01]\d|2[0-3])[0-5]\d){0,35}$/.test(valor));
    case 'port': return UNA_DE(valor, 'A', 'B', 'C');
    case 'serial': return /^[A-Za-z0-9_-]{0,32}$/.test(valor);
    case 'direct': return UNA_DE(valor, 'auto', '0', '1', '2');
    case 'upconv': return /^\d{1,10}$/.test(valor);
    case 'gain': return valor === 'auto' || /^\d{1,2}(\.\d)?$/.test(valor);
    case 'ppm': return /^-?\d{1,3}$/.test(valor);
    default: return false;
  }
}

/** Posición «lat,lon» como la quiere el receptor (5 decimales). */
export const posicionParaReceptor = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

// ---------------------------------------------------------------------------
// Sacar los mensajes: a un archivo y al bus NMEA 2000

const nombreKhz = (f: number | null | undefined) => (f === 4209 ? '4209.5' : f ? String(f) : '');
const fechaUtc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

/** Los mensajes en texto o en CSV (RFC 4180), del más antiguo al más reciente. */
export function exportarNavtex(mensajes: MensajeNavtexRed[], csv: boolean): string {
  const lista = [...mensajes].sort((a, b) => a.recibido - b.recibido);
  if (!csv) {
    return lista.map((m) => `==== ${m.cabecera}  ${nombreKhz(m.freq) ? `${nombreKhz(m.freq)} kHz  ` : ''}recibido ${fechaUtc(m.recibido)} UTC${m.incompleto ? '  cortado' : ''}${m.errores ? `  ${m.errores} caracteres mal` : ''} ====\r\nZCZC ${m.cabecera}\r\n${m.texto.replace(/\r?\n/g, '\r\n')}\r\n`).join('\r\n');
  }
  // Una celda que empieza por = + - @ la ejecutaría una hoja de cálculo como fórmula
  const celda = (t: string) => `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
  const filas = lista.map((m) => [m.cabecera, nombreKhz(m.freq), fechaUtc(m.recibido), m.incompleto ? 0 : 1, m.errores ?? '', TEMAS_NAVTEX[m.tema] ?? m.tema,
    m.posicion ? m.posicion.lat : '', m.posicion ? m.posicion.lon : '', m.texto].map((c) => (typeof c === 'string' ? celda(c) : String(c))).join(','));
  return ['cabecera,khz,recibido_utc,completo,caracteres_mal,tema,lat,lon,texto', ...filas].join('\r\n') + '\r\n';
}

/**
 * Un mensaje NAVTEX para el bus NMEA 2000. No hay PGN de NAVTEX: va como mensajes de seguridad AIS
 * (129802), que solo admiten el juego de caracteres de 6 bits del AIS y poco más de cien caracteres,
 * así que el texto se parte, en un espacio si se puede, y cada trozo dice qué mensaje es y qué parte.
 */
export function trozosNavtexN2k(m: Pick<MensajeNavtex, 'cabecera' | 'texto'>, maximo = 110, maxTrozos = 30): string[] {
  // Lo que no existe en el AIS de 6 bits (minúsculas, tildes, el asterisco sí existe) pasa a mayúsculas o a «?»
  const limpio = m.texto.toUpperCase().replace(/\s+/g, ' ').replace(/[^ -_]/g, '?').trim();
  const trozos: string[] = [];
  const sitio = maximo - `NAVTEX ${m.cabecera} 00/00 `.length;
  for (let resto = limpio; resto && trozos.length < maxTrozos;) {
    let n = Math.min(sitio, resto.length);
    if (n < resto.length) { const sp = resto.lastIndexOf(' ', n); if (sp > n / 2) n = sp; }
    trozos.push(resto.slice(0, n).trim());
    resto = resto.slice(n).trim();
    if (resto && trozos.length === maxTrozos) trozos[maxTrozos - 1] = `${trozos[maxTrozos - 1].slice(0, sitio - 4)} ...`;
  }
  return trozos.map((t, i) => `NAVTEX ${m.cabecera} ${i + 1}/${trozos.length} ${t}`);
}
