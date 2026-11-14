// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Mensajería APRS de la estación.
//
// Lee los mensajes dirigidos a la estación (por radio o por APRS-IS), contesta
// con el acuse de recibo, y lleva los que envía el operador: número de
// mensaje, reintentos y acuse. También recoge los boletines (BLN) que se oyen.
// Aquí solo está la lógica; quien emite es la cola de emisión del servidor,
// con su política (sin emisión activada no sale nada).

import { MAX_MESSAGE_TEXT, isValidCallsign, toAscii } from '../aprs';

export type ViaMensaje = 'RF' | 'IS';

export interface MensajeLeido {
  /** Destinatario tal como viene (sin espacios de relleno). */
  para: string;
  texto: string;
  /** Número de mensaje, si pide acuse. */
  id?: string;
  /** «ack» o «rej» si la trama es un acuse; el número va en `id`. */
  acuse?: 'ack' | 'rej';
}

/** Lee un campo de información APRS de tipo mensaje («:DESTINAT.:texto{id»). */
export function leerMensajeAprs(info: string): MensajeLeido | null {
  const m = /^:([A-Za-z0-9 \-]{9}):(.*)$/s.exec(info);
  if (!m) return null;
  const para = m[1].trim().toUpperCase();
  let texto = m[2].replace(/[\r\n]+$/, '');
  if (!para) return null;
  const acuse = /^(ack|rej)([A-Za-z0-9]{1,5})(\}[A-Za-z0-9]{0,2})?$/i.exec(texto);
  if (acuse) return { para, texto: '', id: acuse[2], acuse: acuse[1].toLowerCase() as 'ack' | 'rej' };
  // Número de mensaje al final: «{12» o, con acuse encadenado, «{12}34»
  let id: string | undefined;
  const cola = /\{([A-Za-z0-9]{1,5})(\}[A-Za-z0-9]{0,2})?$/.exec(texto);
  if (cola) {
    id = cola[1];
    texto = texto.slice(0, cola.index);
  }
  return { para, texto: texto.trimEnd(), id };
}

/** Campo de información de un mensaje: destinatario a 9 caracteres y, si se da, número. */
export function infoMensaje(para: string, texto: string, id?: string): string {
  const limpio = toAscii(texto).replace(/[|~{]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_TEXT);
  return `:${para.toUpperCase().padEnd(9, ' ').slice(0, 9)}:${limpio}${id ? `{${id}` : ''}`;
}

export function infoAcuse(para: string, id: string): string {
  return `:${para.toUpperCase().padEnd(9, ' ').slice(0, 9)}:ack${id}`;
}

export interface MensajeRecibido {
  clave: string;
  de: string;
  para: string;
  texto: string;
  id?: string;
  via: ViaMensaje;
  cuando: number;
  /** Veces que ha llegado (el remitente repite hasta recibir el acuse). */
  veces: number;
  leido: boolean;
  boletin: boolean;
}

export type EstadoEnvio = 'pendiente' | 'recibido' | 'rechazado' | 'sin-acuse';

export interface MensajeEnviado {
  clave: string;
  para: string;
  texto: string;
  id: string;
  cuando: number;
  intentos: number;
  ultimoIntento: number;
  estado: EstadoEnvio;
  acuseCuando?: number;
}

/** Segundos de espera antes de cada reintento (el primero sale al momento). */
export const REINTENTOS_S = [30, 60, 120, 240];
const MAX_GUARDADOS = 200;
const VENTANA_DUPLICADO_MS = 30 * 60_000;

export interface Emision {
  /** Trama TNC2 lista para la cola de emisión. */
  info: string;
  motivo: string;
}

export class Mensajeria {
  recibidos: MensajeRecibido[] = [];
  enviados: MensajeEnviado[] = [];
  private contador = 0;

  /** `indicativo` devuelve el de la estación en cada momento (puede cambiar en la configuración). */
  constructor(private indicativo: () => string) {}

  private soyYo(destino: string): boolean {
    return destino === this.indicativo().trim().toUpperCase();
  }

  /**
   * Procesa una trama recibida. Devuelve lo que hay que emitir como respuesta
   * (el acuse), o null. Los mensajes repetidos se vuelven a confirmar, pero no
   * se duplican en la bandeja.
   */
  recibir(origen: string, info: string, via: ViaMensaje, ahora = Date.now()): Emision | null {
    const m = leerMensajeAprs(info);
    if (!m) return null;
    const de = origen.trim().toUpperCase();
    const esBoletin = /^(BLN|NWS)/.test(m.para);

    if (m.acuse) {
      if (!this.soyYo(m.para) || !m.id) return null;
      const enviado = this.enviados.find((e) => e.id === m.id && e.para === de && e.estado === 'pendiente');
      if (enviado) {
        enviado.estado = m.acuse === 'ack' ? 'recibido' : 'rechazado';
        enviado.acuseCuando = ahora;
      }
      return null;
    }
    if (!esBoletin && !this.soyYo(m.para)) return null;
    if (de === this.indicativo().trim().toUpperCase()) return null; // eco de lo que emite la propia estación
    if (!m.texto && !m.id) return null;

    const clave = esBoletin ? `${de}>${m.para}:${m.texto}` : `${de}:${m.id ?? m.texto}`;
    const previo = this.recibidos.find((r) => r.clave === clave && ahora - r.cuando < VENTANA_DUPLICADO_MS);
    if (previo) {
      previo.veces += 1;
      if (via === 'RF') previo.via = 'RF';
    } else {
      this.recibidos.unshift({ clave, de, para: m.para, texto: m.texto, id: m.id, via, cuando: ahora, veces: 1, leido: false, boletin: esBoletin });
      if (this.recibidos.length > MAX_GUARDADOS) this.recibidos.length = MAX_GUARDADOS;
    }
    if (esBoletin || !m.id) return null;
    return { info: infoAcuse(de, m.id), motivo: `Acuse del mensaje ${m.id} de ${de}` };
  }

  /** Prepara un mensaje del operador. Devuelve el error si no se puede enviar. */
  redactar(para: string, texto: string, ahora = Date.now()): { ok: true; mensaje: MensajeEnviado; emision: Emision } | { ok: false; error: string } {
    const destino = para.trim().toUpperCase();
    const esBoletin = /^BLN[0-9A-Z]/.test(destino) && destino.length <= 9;
    if (!esBoletin && !isValidCallsign(destino)) return { ok: false, error: 'El destinatario no es un indicativo válido.' };
    const limpio = toAscii(texto).replace(/[|~{]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!limpio) return { ok: false, error: 'El mensaje está vacío.' };
    if (limpio.length > MAX_MESSAGE_TEXT) return { ok: false, error: `El mensaje pasa de ${MAX_MESSAGE_TEXT} caracteres.` };
    this.contador = (this.contador % 99999) + 1;
    const id = String(this.contador);
    const mensaje: MensajeEnviado = {
      clave: `${destino}:${id}:${ahora}`, para: destino, texto: limpio, id, cuando: ahora,
      intentos: 1, ultimoIntento: ahora,
      // Un boletín no tiene acuse: sale una vez y queda como enviado
      estado: esBoletin ? 'recibido' : 'pendiente',
    };
    this.enviados.unshift(mensaje);
    if (this.enviados.length > MAX_GUARDADOS) this.enviados.length = MAX_GUARDADOS;
    return { ok: true, mensaje, emision: { info: infoMensaje(destino, limpio, esBoletin ? undefined : id), motivo: `Mensaje ${id} para ${destino}` } };
  }

  /** Reintentos que tocan ahora. Tras el último sin acuse, el mensaje queda «sin acuse». */
  reintentos(ahora = Date.now()): Emision[] {
    const emisiones: Emision[] = [];
    for (const e of this.enviados) {
      if (e.estado !== 'pendiente') continue;
      const espera = REINTENTOS_S[e.intentos - 1];
      if (espera === undefined) {
        if (ahora - e.ultimoIntento >= REINTENTOS_S[REINTENTOS_S.length - 1] * 1000) e.estado = 'sin-acuse';
        continue;
      }
      if (ahora - e.ultimoIntento < espera * 1000) continue;
      e.intentos += 1;
      e.ultimoIntento = ahora;
      emisiones.push({ info: infoMensaje(e.para, e.texto, e.id), motivo: `Mensaje ${e.id} para ${e.para} (intento ${e.intentos})` });
    }
    return emisiones;
  }

  marcarLeidos() {
    for (const r of this.recibidos) r.leido = true;
  }

  get sinLeer(): number {
    return this.recibidos.filter((r) => !r.leido && !r.boletin).length;
  }
}
