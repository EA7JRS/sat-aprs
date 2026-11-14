// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Estaciones y objetos APRS oídos, para la capa APRS del mapa.
//
// Guarda la última posición de cada uno, por dónde llegó (RF o APRS-IS) y
// cuándo. Vive en memoria: es una foto de lo que se oye, no un archivo.

import { PosicionAprs, leerPosicionAprs } from './aprsPosicion';

export type Via = 'RF' | 'IS';

export interface EstacionOida extends Omit<PosicionAprs, 'baja'> {
  /** Último canal por el que se oyó; RF prevalece durante un rato sobre APRS-IS. */
  via: Via;
  /** Momento de la última trama (ms epoch). */
  ultima: number;
  /** Última vez que se oyó directamente por radio. */
  ultimaRf?: number;
  tramas: number;
}

const MAX_ESTACIONES = 3000;
/** Una estación oída por RF sigue marcada como RF aunque luego llegue por Internet. */
const RETENCION_RF_MS = 30 * 60_000;

export class EstacionesOidas {
  private mapa = new Map<string, EstacionOida>();

  constructor(private caducidadMs = 2 * 3600_000) {}

  /** Anota una trama recibida. Devuelve la estación si la trama llevaba posición. */
  anotar(origen: string, destino: string, info: string, via: Via, ahora = Date.now()): EstacionOida | null {
    const p = leerPosicionAprs(origen, destino, info);
    if (!p) return null;
    if (p.baja) {
      this.mapa.delete(p.nombre);
      return null;
    }
    const previa = this.mapa.get(p.nombre);
    const ultimaRf = via === 'RF' ? ahora : previa?.ultimaRf;
    const { baja: _baja, ...datos } = p;
    const estacion: EstacionOida = {
      ...datos,
      via: ultimaRf !== undefined && ahora - ultimaRf <= RETENCION_RF_MS ? 'RF' : via,
      ultima: ahora,
      ultimaRf,
      tramas: (previa?.tramas ?? 0) + 1,
    };
    this.mapa.delete(p.nombre); // la reinserción la deja como la más reciente
    this.mapa.set(p.nombre, estacion);
    if (this.mapa.size > MAX_ESTACIONES) {
      const masAntigua = this.mapa.keys().next().value;
      if (masAntigua !== undefined) this.mapa.delete(masAntigua);
    }
    return estacion;
  }

  /** Estaciones vigentes, de la más reciente a la más antigua. */
  lista(ahora = Date.now()): EstacionOida[] {
    for (const [nombre, e] of this.mapa) {
      if (ahora - e.ultima > this.caducidadMs) this.mapa.delete(nombre);
    }
    return [...this.mapa.values()].reverse();
  }

  get total(): number {
    return this.mapa.size;
  }
}
