// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Lectura de ADS-B en formato SBS-1 (BaseStation).
//
// Es el texto que readsb, dump1090 y derivados sirven en el puerto 30003:
// una línea «MSG,n,...» por mensaje. Cada tipo trae una parte (matrícula de
// vuelo, posición, velocidad...), así que se van juntando por dirección ICAO.

export interface Aeronave {
  /** Dirección ICAO de 24 bits en hexadecimal. */
  hex: string;
  vuelo?: string;
  lat?: number;
  lon?: number;
  /** Altitud en pies. */
  altitud?: number;
  /** Velocidad sobre el suelo en nudos. */
  velocidad?: number;
  /** Rumbo en grados. */
  rumbo?: number;
  squawk?: string;
  enTierra?: boolean;
  ultima: number;
}

const numero = (t: string | undefined): number | undefined => {
  if (t === undefined || t.trim() === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** Campos que aporta una línea SBS, o null si no es un mensaje de aeronave. */
export function leerSbs(linea: string): Partial<Aeronave> & { hex: string } | null {
  const c = linea.trim().split(',');
  if (c[0] !== 'MSG' || c.length < 11) return null;
  const hex = (c[4] || '').trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex) || hex === '000000') return null;
  const a: Partial<Aeronave> & { hex: string } = { hex };
  const vuelo = (c[10] || '').trim();
  if (vuelo) a.vuelo = vuelo.replace(/[^A-Z0-9-]/gi, '').slice(0, 8);
  const altitud = numero(c[11]);
  if (altitud !== undefined && altitud > -2000 && altitud < 100000) a.altitud = altitud;
  const velocidad = numero(c[12]);
  if (velocidad !== undefined && velocidad >= 0 && velocidad < 4000) a.velocidad = velocidad;
  const rumbo = numero(c[13]);
  if (rumbo !== undefined && rumbo >= 0 && rumbo <= 360) a.rumbo = rumbo;
  const lat = numero(c[14]);
  const lon = numero(c[15]);
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    a.lat = lat;
    a.lon = lon;
  }
  const squawk = (c[17] || '').trim();
  if (/^[0-7]{4}$/.test(squawk)) a.squawk = squawk;
  const tierra = (c[21] || '').trim();
  if (tierra === '-1' || tierra === '1') a.enTierra = true;
  else if (tierra === '0') a.enTierra = false;
  return a;
}

/** Códigos de transpondedor de emergencia. */
export function emergenciaSquawk(squawk: string | undefined): string {
  if (squawk === '7500') return 'Interferencia ilícita';
  if (squawk === '7600') return 'Fallo de radio';
  if (squawk === '7700') return 'Emergencia';
  return '';
}

export class Aeronaves {
  private mapa = new Map<string, Aeronave>();
  mensajes = 0;
  constructor(private caducidadMs = 90_000, private maximo = 3000) {}

  /** Procesa una línea SBS. */
  linea(texto: string, ahora = Date.now()) {
    const a = leerSbs(texto);
    if (!a) return;
    this.mensajes++;
    const previo = this.mapa.get(a.hex) ?? { hex: a.hex, ultima: ahora };
    Object.assign(previo, a, { ultima: ahora });
    this.mapa.delete(a.hex);
    this.mapa.set(a.hex, previo);
    if (this.mapa.size > this.maximo) {
      const primero = this.mapa.keys().next().value;
      if (primero !== undefined) this.mapa.delete(primero);
    }
  }

  /** Aeronaves vigentes con posición, de la más reciente a la más antigua. */
  lista(ahora = Date.now()): Aeronave[] {
    for (const [k, v] of this.mapa) if (ahora - v.ultima > this.caducidadMs) this.mapa.delete(k);
    return [...this.mapa.values()].filter((a) => a.lat !== undefined && a.lon !== undefined).reverse();
  }

  get total(): number { return this.mapa.size; }
}
