// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Balizas NCDXF / IARU (International Beacon Project) y la propagación que se mide con ellas.
//
// Dieciocho balizas repartidas por el mundo emiten por turno en cinco frecuencias, diez segundos cada una,
// en un ciclo de tres minutos alineado con la hora UTC: se sabe cuál suena en cada momento sin descifrar su
// indicativo. Aquí se anota el nivel que mide un receptor en la ranura de cada baliza y cuánto sobresale del
// ruido de esa banda. Es lo que se oye ahora mismo; VOACAP da la mediana del mes.
//
// La lista y el orden son los de la tabla oficial de NCDXF (ncdxf.org/beacon/beaconlocations.html); la
// posición es el centro del localizador que da esa tabla.

export interface Baliza { indicativo: string; pais: string; lugar: string; locator: string }

export const BALIZAS: Baliza[] = [
  { indicativo: '4U1UN', pais: 'Naciones Unidas', lugar: 'Nueva York', locator: 'FN30as' },
  { indicativo: 'VE8AT', pais: 'Canadá', lugar: 'Inuvik', locator: 'CP38gh' },
  { indicativo: 'W6WX', pais: 'Estados Unidos', lugar: 'Mt. Umunhum', locator: 'CM97bd' },
  { indicativo: 'KH6RS', pais: 'Hawái', lugar: 'Maui', locator: 'BL10ts' },
  { indicativo: 'ZL6B', pais: 'Nueva Zelanda', lugar: 'Masterton', locator: 'RE78tw' },
  { indicativo: 'VK6RBP', pais: 'Australia', lugar: 'Rolystone', locator: 'OF87av' },
  { indicativo: 'JA2IGY', pais: 'Japón', lugar: 'Mt. Asama', locator: 'PM84jk' },
  { indicativo: 'RR9O', pais: 'Rusia', lugar: 'Novosibirsk', locator: 'NO14kx' },
  { indicativo: 'VR2B', pais: 'Hong Kong', lugar: 'Hong Kong', locator: 'OL72bg' },
  { indicativo: '4S7B', pais: 'Sri Lanka', lugar: 'Colombo', locator: 'MJ96wv' },
  { indicativo: 'ZS6DN', pais: 'Sudáfrica', lugar: 'Pretoria', locator: 'KG33xi' },
  { indicativo: '5Z4B', pais: 'Kenia', lugar: 'Kikuyu', locator: 'KI88hr' },
  { indicativo: '4X6TU', pais: 'Israel', lugar: 'Tel Aviv', locator: 'KM72jb' },
  { indicativo: 'OH2B', pais: 'Finlandia', lugar: 'Lohja', locator: 'KP20eh' },
  { indicativo: 'CS3B', pais: 'Madeira', lugar: 'São Jorge', locator: 'IM12jt' },
  { indicativo: 'LU4AA', pais: 'Argentina', lugar: 'Buenos Aires', locator: 'GF05tj' },
  { indicativo: 'OA4B', pais: 'Perú', lugar: 'Lima', locator: 'FH17mw' },
  { indicativo: 'YV5B', pais: 'Venezuela', lugar: 'Caracas', locator: 'FK60nd' },
];

/** Las cinco frecuencias, en kHz. Cada baliza empieza en 14 100 y sube una banda cada diez segundos. */
export const BANDAS_IBP = [
  { khz: 14100, nombre: '20 m' }, { khz: 18110, nombre: '17 m' }, { khz: 21150, nombre: '15 m' }, { khz: 24930, nombre: '12 m' }, { khz: 28200, nombre: '10 m' },
];

export const RANURA_S = 10, CICLO_S = 180;

/** La ranura (0 a 17) del ciclo de tres minutos, alineado con la medianoche UTC. */
export function ranuraIbp(ms: number): number {
  const s = ((Math.floor(ms / 1000) % 86400) + 86400) % 86400;
  return Math.floor((s % CICLO_S) / RANURA_S);
}

/** Qué baliza (su índice) suena en una banda (0 a 4) en ese instante: la de la banda N empezó N ranuras antes. */
export function balizaEn(banda: number, ms: number): number {
  return ((ranuraIbp(ms) - banda) % BALIZAS.length + BALIZAS.length) % BALIZAS.length;
}

export interface MedidaIbp { baliza: number; banda: number; cuando: number; dbm: number; sobreRuido: number; oida: boolean }

/** Decibelios sobre el ruido a partir de los cuales una ranura se da por «oída». */
export const UMBRAL_OIDA_DB = 6;

/**
 * Lleva la cuenta de un ciclo en una banda: recibe los niveles que manda el receptor (varios por segundo) y, al
 * acabar el ciclo, da el nivel de cada baliza y cuánto sobresale del ruido.
 *
 * El nivel de una ranura es el percentil 80 de sus lecturas (la baliza manda su indicativo y cuatro rayas de
 * potencia decreciente: no está al máximo los diez segundos). El ruido de la banda es la cuarta ranura más
 * floja del ciclo: con dieciocho balizas en todo el mundo, nunca llegan las dieciocho a la vez.
 * Los dos primeros y el último segundo de cada ranura no cuentan: el reloj y el camino de la señal no son exactos.
 */
export class CicloIbp {
  private lecturas: number[][] = Array.from({ length: BALIZAS.length }, () => []);
  constructor(readonly banda: number) {}

  anotar(ms: number, dbm: number) {
    if (!Number.isFinite(dbm)) return;
    const enRanura = (((ms / 1000) % RANURA_S) + RANURA_S) % RANURA_S;
    if (enRanura < 2 || enRanura > 9) return;
    this.lecturas[ranuraIbp(ms)].push(dbm);
  }

  /** Ranuras con lecturas suficientes para contar. */
  ranurasMedidas(): number { return this.lecturas.filter((l) => l.length >= 5).length; }

  /** Las medidas del ciclo, o [] si no se han medido al menos doce ranuras (el ruido no se sabría). */
  cerrar(ahora: number): MedidaIbp[] {
    const nivel = this.lecturas.map((l) => {
      if (l.length < 5) return null;
      const o = [...l].sort((a, b) => a - b);
      return o[Math.min(o.length - 1, Math.floor(o.length * 0.8))];
    });
    const medidos = nivel.filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (medidos.length < 12) return [];
    const ruido = medidos[3];
    const fuera: MedidaIbp[] = [];
    nivel.forEach((dbm, ranura) => {
      if (dbm === null) return;
      const baliza = ((ranura - this.banda) % BALIZAS.length + BALIZAS.length) % BALIZAS.length;
      const sobre = Math.round((dbm - ruido) * 10) / 10;
      fuera.push({ baliza, banda: this.banda, cuando: ahora, dbm: Math.round(dbm * 10) / 10, sobreRuido: sobre, oida: sobre >= UMBRAL_OIDA_DB });
    });
    return fuera;
  }

  /** El ruido del ciclo (dBm), o null si aún no se sabe. */
  ruido(): number | null {
    const m = this.lecturas.filter((l) => l.length >= 5).map((l) => { const o = [...l].sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.floor(o.length * 0.8))]; }).sort((a, b) => a - b);
    return m.length >= 12 ? m[3] : null;
  }
}

/** La tabla de lo medido: la última medida de cada baliza en cada banda, y el ruido de cada banda. */
export class TablaIbp {
  private celdas = new Map<string, MedidaIbp>();
  ruido: Array<{ dbm: number; cuando: number } | null> = BANDAS_IBP.map(() => null);

  anotar(medidas: MedidaIbp[], ruidoDbm: number | null) {
    for (const m of medidas) this.celdas.set(`${m.baliza}/${m.banda}`, m);
    if (medidas.length && ruidoDbm !== null) this.ruido[medidas[0].banda] = { dbm: Math.round(ruidoDbm * 10) / 10, cuando: medidas[0].cuando };
  }

  /** Lo medido en las últimas `horas`, por baliza y banda (null donde no hay medida reciente). */
  cuadro(ahora: number, horas = 2): Array<Array<MedidaIbp | null>> {
    return BALIZAS.map((_, b) => BANDAS_IBP.map((_, f) => {
      const m = this.celdas.get(`${b}/${f}`);
      return m && ahora - m.cuando < horas * 3600_000 ? m : null;
    }));
  }
}

/** La sintonía para oír una banda en CW: la baliza suena como un tono de 500 Hz, con un filtro de 300 Hz. */
export function sintoniaIbp(banda: number) {
  return { modo: 'cw' as const, khz: BANDAS_IBP[banda].khz - 0.5, bajo: 350, alto: 650, agc: false };
}

/** Centro de un localizador de 6 caracteres. */
export function centroLocator(loc: string): { lat: number; lon: number } {
  const l = loc.toUpperCase();
  const lon = (l.charCodeAt(0) - 65) * 20 - 180 + Number(l[2]) * 2 + (l.charCodeAt(4) - 65) / 12 + 1 / 24;
  const lat = (l.charCodeAt(1) - 65) * 10 - 90 + Number(l[3]) + (l.charCodeAt(5) - 65) / 24 + 1 / 48;
  return { lat, lon };
}
