// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Corrección de Doppler continua durante un paso de satélite.
//
// Con el transmisor elegido, el equipo se resintoniza mientras dura el paso:
// la bajada a f·(1 − v/c) y, si el equipo acepta subida separada (split), la
// subida a f·(1 + v/c), con v la velocidad radial (positiva al alejarse).
// Solo se vuelve a mandar cuando el cambio pasa de la tolerancia del modo, y
// se deja de corregir al acabar el paso o si el operador mueve el dial.
// Aquí solo está el cálculo y las decisiones; quien manda al equipo es el servidor.

export const C_KM_S = 299_792.458;

/** Frecuencia que se recibe en tierra de un satélite que emite en `hz`. */
export const bajadaConDoppler = (hz: number, radialKmS: number) => Math.round(hz * (1 - radialKmS / C_KM_S));
/** Frecuencia a la que hay que emitir para que el satélite reciba `hz`. */
export const subidaConDoppler = (hz: number, radialKmS: number) => Math.round(hz * (1 + radialKmS / C_KM_S));

/** Modo del equipo para el modo del transmisor (según SatNOGS). Null: no se toca. */
export function modoEquipo(modoSat: string): string | null {
  const m = String(modoSat ?? '').toUpperCase().trim();
  if (m === 'CW') return 'CW';
  if (m === 'USB' || m === 'LSB') return m;
  if (/^(BPSK|PSK)/.test(m)) return 'USB';
  if (/^(FM|FMN|AFSK|FSK|GMSK|GFSK|MSK|SSTV)/.test(m)) return 'FM';
  return null; // LoRa, banda L, STD-C, LRPT…: no es cosa del equipo de radio
}

/** Cuánto puede desviarse la frecuencia antes de volver a mandarla, según el modo. */
export function toleranciaHz(modo: string | null): number {
  return modo === 'FM' ? 1000 : 50;
}

export interface EstadoDoppler {
  norad: number;
  nombre: string;
  /** Frecuencias nominales del transmisor (0 = no tiene). */
  bajadaHz: number;
  subidaHz: number;
  modo: string | null;
  descripcion: string;
  inicio: number;
  /** Puesta del paso en curso o del próximo (ms epoch); al pasarla se termina. */
  fin: number | null;
  ultimaRx: number | null;
  ultimaTx: number | null;
  ultimaVez: number | null;
  radialKmS: number | null;
  /** Subida separada: null sin probar, false si el equipo no la acepta. */
  split: boolean | null;
}

export type Decision =
  | { tipo: 'nada' }
  | { tipo: 'mandar'; rx: number | null; tx: number | null }
  | { tipo: 'parar'; motivo: string };

/**
 * Qué hacer en este momento. `dialHz` es la frecuencia que da el equipo ahora
 * (null si no se sabe); si se aleja mucho de la última que se mandó es que el
 * operador ha movido el dial, y se deja de corregir.
 */
export function decidir(e: EstadoDoppler, radialKmS: number, dialHz: number | null, ahora: number): Decision {
  if (e.fin !== null && ahora > e.fin + 30_000) return { tipo: 'parar', motivo: 'ha terminado el paso' };
  const tol = toleranciaHz(e.modo);
  if (dialHz !== null && e.ultimaRx !== null && Math.abs(dialHz - e.ultimaRx) > Math.max(5 * tol, 3000)) {
    return { tipo: 'parar', motivo: 'se ha movido el dial del equipo' };
  }
  const rx = e.bajadaHz > 0 ? bajadaConDoppler(e.bajadaHz, radialKmS) : null;
  const tx = e.subidaHz > 0 && e.split !== false ? subidaConDoppler(e.subidaHz, radialKmS) : null;
  const cambiaRx = rx !== null && (e.ultimaRx === null || Math.abs(rx - e.ultimaRx) >= tol);
  const cambiaTx = tx !== null && (e.ultimaTx === null || Math.abs(tx - e.ultimaTx) >= tol);
  if (!cambiaRx && !cambiaTx) return { tipo: 'nada' };
  return { tipo: 'mandar', rx: cambiaRx ? rx : null, tx: cambiaTx ? tx : null };
}
