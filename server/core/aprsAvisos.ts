// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Conversión de avisos a tramas APRS.
//
// Cada aviso produce hasta dos tramas:
//   - un OBJETO con la posición del suceso, su símbolo y sus datos, que
//     aparece en el mapa de cualquier cliente APRS, y
//   - un BOLETÍN de emergencia dirigido a todas las estaciones.
// La ruta (TCPIP* hacia APRS-IS, WIDEn-N hacia RF) la pone el emisor.

import { TOCALL, latToAprs, lonToAprs, toAscii } from '../aprs';
import { Evento, Gravedad, TipoEmergencia } from './evento';

interface Estilo {
  /** Tabla y código del símbolo APRS del objeto. */
  simbolo: [string, string];
  /** Prefijo del nombre del objeto (2 letras). */
  prefijo: string;
  /** Grupo del boletín (máx. 5 caracteres): BLN<n><grupo>. */
  grupo: string;
  /** Palabra que encabeza el boletín. */
  rotulo: string;
}

const ESTILOS: Record<TipoEmergencia, Estilo> = {
  sismo:          { simbolo: ['\\', 'Q'], prefijo: 'EQ', grupo: 'SISMO', rotulo: 'SISMO' },
  tsunami:        { simbolo: ['\\', '!'], prefijo: 'TS', grupo: 'TSUNA', rotulo: 'TSUNAMI' },
  meteo:          { simbolo: ['\\', 'W'], prefijo: 'WX', grupo: 'METEO', rotulo: 'METEO' },
  huracan:        { simbolo: ['\\', '@'], prefijo: 'HU', grupo: 'HURAC', rotulo: 'HURACAN' },
  tornado:        { simbolo: ['\\', 't'], prefijo: 'TO', grupo: 'TORNA', rotulo: 'TORNADO' },
  incendio:       { simbolo: ['/', ':'],  prefijo: 'FG', grupo: 'FUEGO', rotulo: 'FUEGO' },
  radiacion:      { simbolo: ['\\', '!'], prefijo: 'RD', grupo: 'RADIA', rotulo: 'RADIACION' },
  clima_espacial: { simbolo: ['\\', '!'], prefijo: 'SW', grupo: 'ESPAC', rotulo: 'CLIMA ESPACIAL' },
  calidad_aire:   { simbolo: ['\\', '!'], prefijo: 'AQ', grupo: 'AIRE', rotulo: 'AIRE' },
  maritimo:       { simbolo: ['\\', '!'], prefijo: 'MA', grupo: 'MARIT', rotulo: 'AVISO MARITIMO' },
  otro:           { simbolo: ['\\', '!'], prefijo: 'EM', grupo: 'EMERG', rotulo: 'AVISO' },
};

/** Línea de boletín por gravedad: los más graves ocupan las primeras líneas. */
const LINEA_BOLETIN: Record<Gravedad, number> = { rojo: 1, naranja: 2, amarillo: 3, info: 4 };

const MAX_COMENTARIO_OBJETO = 43;
const MAX_TEXTO_BOLETIN = 67;

function limpio(texto: string): string {
  return toAscii(texto).replace(/[|~{]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sello(ms: number): string {
  const d = new Date(ms);
  const dos = (n: number) => n.toString().padStart(2, '0');
  return `${dos(d.getUTCDate())}${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}z`;
}

/**
 * Nombre de objeto único de 9 caracteres: prefijo del tipo + día, hora y
 * minuto UTC del suceso. Dos sucesos distintos no comparten nombre, así que
 * uno no «mueve» en el mapa el objeto del otro.
 */
export function nombreObjeto(evento: Evento): string {
  const propio = limpio(evento.nombre || '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 9);
  if (propio) return propio.padEnd(9, ' ');
  return (ESTILOS[evento.tipo].prefijo + sello(evento.inicio).slice(0, 6)).padEnd(9, ' ');
}

/** Objeto APRS con la posición y los datos del suceso; null si no tiene coordenadas. */
export function objetoAprs(indicativo: string, evento: Evento, ahora: number = Date.now()): string | null {
  if (evento.lat === undefined || evento.lon === undefined) return null;
  const [tabla, codigo] = ESTILOS[evento.tipo].simbolo;
  const comentario = limpio([evento.detalle, evento.titulo].filter(Boolean).join(' ')).slice(0, MAX_COMENTARIO_OBJETO).trim();
  // Un aviso previsto aún no ha empezado: el objeto se fecha entonces en el momento de emitirlo
  const info = `;${nombreObjeto(evento)}*${sello(Math.min(evento.inicio, ahora))}${latToAprs(evento.lat)}${tabla}${lonToAprs(evento.lon)}${codigo}${comentario}`;
  return `${indicativo.toUpperCase()}>${TOCALL}:${info}`;
}

/** Boletín APRS de emergencia (:BLNnGRUPO:texto, máx. 67 caracteres). */
export function boletinAprs(indicativo: string, evento: Evento, distanciaKm?: number): string {
  const estilo = ESTILOS[evento.tipo];
  const destinatario = `BLN${LINEA_BOLETIN[evento.gravedad]}${estilo.grupo}`.padEnd(9, ' ');
  const urgente = evento.gravedad === 'rojo' || evento.gravedad === 'naranja';
  const cuerpo = [
    evento.detalle || '',
    evento.titulo,
    distanciaKm !== undefined && distanciaKm >= 1 ? `a ${Math.round(distanciaKm)}km` : '',
  ].filter(Boolean).join(' ');
  const cabecera = `${urgente ? 'EMERGENCIA ' : ''}${estilo.rotulo}`;
  // Si no cabe en 67 caracteres se prescinde, por este orden, de la palabra
  // «EMERGENCIA» (la línea del boletín ya indica la gravedad) y de la fuente.
  const variantes = [
    `${cabecera} ${cuerpo} (${evento.fuente})`,
    `${estilo.rotulo} ${cuerpo} (${evento.fuente})`,
    `${estilo.rotulo} ${cuerpo}`,
  ].map(limpio);
  const texto = (variantes.find((v) => v.length <= MAX_TEXTO_BOLETIN) ?? variantes[0]).slice(0, MAX_TEXTO_BOLETIN).trim();
  return `${indicativo.toUpperCase()}>${TOCALL}::${destinatario}:${texto}`;
}
