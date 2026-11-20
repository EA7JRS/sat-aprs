// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · NAVTEX recibido con un SDR propio.
//
// La cadena va fuera de la consola (tools/navtex/navtex.sh): rtl_fm (RTL-SDR)
// o rx_fm (SoapySDR: SDRplay RSPdx-R2 y otros) en USB a 1 kHz por debajo de
// 518 kHz, y el descodificador navtex_rx_from_file (fventuri/navtex, el de
// fldigi) escribiendo los caracteres en un archivo. La consola lee lo que se
// va añadiendo al archivo y separa los mensajes «ZCZC B1B2B3B4 … NNNN».
//
//   B1 estación transmisora (A–Z), B2 tema, B3B4 número.
//   Temas que un receptor no puede rechazar: A, B, D y L.

import fs from 'fs';
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
 * Separa los mensajes de la corriente de caracteres del descodificador.
 * Devuelve los mensajes cerrados y lo que queda pendiente (un mensaje a medias).
 */
export function separarNavtex(buffer: string, recibido = Date.now()): { mensajes: MensajeNavtex[]; resto: string } {
  const mensajes: MensajeNavtex[] = [];
  const re = /ZCZC ([A-Z])([A-Z])(\d\d)[^\n]*\n/g;
  const cabeceras: Array<{ cab: string; desde: number; inicio: number }> = [];
  for (const m of buffer.matchAll(re)) cabeceras.push({ cab: m[1] + m[2] + m[3], desde: m.index!, inicio: m.index! + m[0].length });
  let consumido = 0;
  for (let i = 0; i < cabeceras.length; i++) {
    const c = cabeceras[i];
    const siguiente = cabeceras[i + 1]?.desde ?? buffer.length;
    const tramo = buffer.slice(c.inicio, siguiente);
    const fin = tramo.indexOf('NNNN');
    if (fin >= 0) {
      const m = mensaje(c.cab, tramo.slice(0, fin), recibido, false);
      if (m) mensajes.push(m);
      consumido = c.inicio + fin + 4;
    } else if (i + 1 < cabeceras.length) {
      // Llegó otra cabecera sin el final de este: se da por cortado
      const m = mensaje(c.cab, tramo, recibido, true);
      if (m) mensajes.push(m);
      consumido = siguiente;
    } else {
      consumido = c.desde;   // el último sigue abierto
    }
  }
  if (!cabeceras.length) consumido = Math.max(0, buffer.length - 64);   // sin cabecera, solo se guarda la cola
  return { mensajes, resto: buffer.slice(consumido).slice(-20_000) };
}

/** Un mensaje que lleva más de 15 minutos abierto se cierra como cortado. */
export function cerrarPendiente(resto: string, abiertoDesde: number, ahora = Date.now()): MensajeNavtex | null {
  if (ahora - abiertoDesde < 15 * 60_000) return null;
  const m = /ZCZC ([A-Z])([A-Z])(\d\d)[^\n]*\n([\s\S]*)$/.exec(resto);
  return m ? mensaje(m[1] + m[2] + m[3], m[4], abiertoDesde, true) : null;
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

/** Lee lo que se va añadiendo a un archivo (como `tail -f`), sin perderse si rota o se vacía. */
export class ColaArchivo {
  private posicion = -1;
  private ino = -1;
  error: string | null = null;
  ultimoDato = 0;
  constructor(readonly ruta: string) {}

  leerNuevo(): string {
    try {
      const st = fs.statSync(this.ruta);
      if (this.posicion < 0 || st.ino !== this.ino) {
        // Primera vez: se empieza por el final (lo anterior ya se leyó o es viejo), salvo un archivo recién creado
        this.posicion = this.posicion < 0 ? Math.max(0, st.size - 64 * 1024) : 0;
        this.ino = st.ino;
      }
      if (st.size < this.posicion) this.posicion = 0;   // se vació
      if (st.size === this.posicion) { this.error = null; return ''; }
      const fd = fs.openSync(this.ruta, 'r');
      try {
        const n = Math.min(st.size - this.posicion, 1024 * 1024);
        const buf = Buffer.alloc(n);
        fs.readSync(fd, buf, 0, n, this.posicion);
        this.posicion += n;
        this.error = null;
        this.ultimoDato = Date.now();
        return buf.toString('latin1');
      } finally { fs.closeSync(fd); }
    } catch (e: any) {
      this.error = e?.code === 'ENOENT' ? 'no existe el archivo (¿está en marcha el descodificador?)' : String(e?.message ?? e);
      return '';
    }
  }
}
