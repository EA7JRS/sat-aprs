// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Telegrafía (CW) oída con un receptor: de las muestras de sonido al texto.
//
// El receptor ya entrega la señal filtrada (un tono de unos 500 Hz en un filtro de 300 Hz), así que basta con
// medir cuánta señal hay cada pocos milisegundos (la envolvente), separar señal de ruido con un umbral que sale
// de la propia grabación, medir puntos y rayas y traducirlos. No hace falta saber la velocidad: se deduce.
// Sirve para confirmar por su indicativo las balizas NCDXF / IARU (22 palabras por minuto) y para oír otras
// balizas de telegrafía («VVV DE EA7XXX IM76HR»).

export const PASO_MS = 4;              // cada cuánto se mide la envolvente

const MORSE: Record<string, string> = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
  '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
  '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z',
  '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9',
  '-..-.': '/', '..--..': '?', '.-.-.-': '.', '--..--': ',', '-...-': '=',
};
const A_MORSE: Record<string, string> = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/**
 * Saca la envolvente de un sonido: guarda las muestras que le van dando (PCM de 16 bits, little endian, mono) y
 * da la raíz de la potencia media de cada PASO_MS, con la hora de cada medida. Guarda los últimos `segundos`.
 */
export class Envolvente {
  private valores: Float32Array;
  private horas: Float64Array;
  private n = 0;                        // medidas guardadas (las últimas, en orden)
  private suma = 0;
  private cuenta = 0;
  private porPaso = 0;

  constructor(segundos = 40) {
    const cap = Math.ceil(segundos * 1000 / PASO_MS);
    this.valores = new Float32Array(cap); this.horas = new Float64Array(cap);
  }

  /** Muestras nuevas; `ms` es la hora a la que llegó el final del trozo. */
  dar(pcm: Buffer, ritmo: number, ms: number) {
    const porPaso = Math.max(8, Math.round(ritmo * PASO_MS / 1000));
    if (porPaso !== this.porPaso) { this.porPaso = porPaso; this.suma = 0; this.cuenta = 0; }
    const total = pcm.length >> 1;
    for (let i = 0; i < total; i++) {
      const v = pcm.readInt16LE(2 * i);
      this.suma += v * v;
      if (++this.cuenta === porPaso) {
        this.meter(Math.sqrt(this.suma / porPaso), ms - (total - 1 - i) * 1000 / ritmo);
        this.suma = 0; this.cuenta = 0;
      }
    }
  }

  private meter(valor: number, ms: number) {
    if (this.n === this.valores.length) { this.valores.copyWithin(0, 1); this.horas.copyWithin(0, 1); this.n--; }
    this.valores[this.n] = valor; this.horas[this.n] = ms; this.n++;
  }

  /** Las medidas entre dos horas. */
  tramo(desdeMs: number, hastaMs: number): Float32Array {
    let a = 0; while (a < this.n && this.horas[a] < desdeMs) a++;
    let b = a; while (b < this.n && this.horas[b] < hastaMs) b++;
    return this.valores.slice(a, b);
  }

  vaciar() { this.n = 0; this.suma = 0; this.cuenta = 0; }
}

export interface LecturaCw { texto: string; ppm: number; snrDb: number }

const VACIA: LecturaCw = { texto: '', ppm: 0, snrDb: 0 };

/**
 * Lee la telegrafía de una envolvente (una medida cada `pasoMs`). Da el texto, la velocidad en palabras por
 * minuto y cuánto sobresale la señal del ruido. Sin señal clara no da nada: prefiere callar a inventar.
 */
export function leerCw(env: Float32Array, pasoMs = PASO_MS): LecturaCw {
  const n = env.length;
  if (n < 400 / pasoMs) return VACIA;
  // suavizado de tres medidas: quita el rizado del propio tono
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = (env[Math.max(0, i - 1)] + env[i] + env[Math.min(n - 1, i + 1)]) / 3;
  const orden = Float32Array.from(s).sort();
  const ruido = orden[Math.floor(n * 0.25)], pico = orden[Math.floor(n * 0.985)];
  if (!(ruido >= 0) || pico <= 0) return VACIA;
  const snrDb = 20 * Math.log10(pico / Math.max(ruido, 1e-3));
  if (snrDb < 8) return VACIA;                                   // menos que eso y el umbral corta ruido
  // umbral a medio camino (en decibelios) entre el ruido y la señal, con histéresis
  const medio = Math.sqrt(Math.max(ruido, 1e-3) * pico), sube = medio * 1.12, baja = medio * 0.89;
  const tramos: Array<{ on: boolean; ms: number }> = [];
  let on = s[0] > sube, desde = 0;
  for (let i = 1; i <= n; i++) {
    const sigue = i < n ? (on ? s[i] > baja : s[i] <= sube) : false;
    if (!sigue) { tramos.push({ on, ms: (i - desde) * pasoMs }); on = !on; desde = i; }
  }
  // fuera los chasquidos y los huecos de menos de 12 ms: se suman al tramo de al lado
  const limpios: typeof tramos = [];
  for (const t of tramos) {
    const u = limpios[limpios.length - 1];
    if (t.ms < 12 && u) u.ms += t.ms;
    else if (u && u.on === t.on) u.ms += t.ms;
    else limpios.push({ ...t });
  }
  const marcas = limpios.filter((t) => t.on).map((t) => t.ms).filter((m) => m < 700);      // sin las rayas largas de las balizas
  if (marcas.length < 4) return VACIA;
  // el punto: dos grupos de duraciones (puntos y rayas), partiendo de la más corta y la más larga
  const o = [...marcas].sort((a, b) => a - b);
  let c1 = o[Math.floor(o.length * 0.15)], c2 = o[Math.floor(o.length * 0.9)];
  for (let v = 0; v < 12; v++) {
    let s1 = 0, n1 = 0, s2 = 0, n2 = 0;
    for (const m of o) { if (Math.abs(m - c1) <= Math.abs(m - c2)) { s1 += m; n1++; } else { s2 += m; n2++; } }
    if (n1) c1 = s1 / n1; if (n2) c2 = s2 / n2;
  }
  let punto: number;
  if (c2 / c1 >= 2 && c2 / c1 <= 4.5) punto = (c1 + c2 / 3) / 2;
  else {
    // todo puntos o todo rayas: lo dicen los huecos entre marcas, que dentro de una letra miden un punto
    const huecos = limpios.filter((t) => !t.on).map((t) => t.ms).sort((a, b) => a - b);
    const hueco = huecos.length ? huecos[Math.floor(huecos.length * 0.25)] : c1;
    punto = c1 > 2 * hueco ? c1 / 3 : c1;
  }
  if (!(punto >= 20 && punto <= 240)) return VACIA;               // de 5 a 60 palabras por minuto
  let texto = '', letra = '';
  const cierra = () => { if (letra) { texto += MORSE[letra] ?? '?'; letra = ''; } };
  limpios.forEach((t, i) => {
    if (t.on) {
      if (t.ms >= 7 * punto) { cierra(); texto += '_'; }            // una raya larga (portadora): no es una letra
      else letra += t.ms < 2 * punto ? '.' : '-';
    } else if (i > 0 && i < limpios.length - 1) {
      if (t.ms >= 2 * punto) cierra();
      if (t.ms >= 5 * punto && !texto.endsWith(' ')) texto += ' ';
    }
  });
  cierra();
  return { texto: texto.trim(), ppm: Math.round(1200 / punto), snrDb: Math.round(snrDb * 10) / 10 };
}

/** ¿Sale ese indicativo en lo leído? Solo vale entero: una letra de menos o de más no confirma nada. */
export function confirmaIndicativo(texto: string, indicativo: string): boolean {
  return texto.replace(/[ _]/g, '').includes(indicativo.toUpperCase());
}

const RE_INDICATIVO = /^(?:[A-Z0-9]{1,3}\/)?[A-Z0-9]{1,2}[0-9][A-Z0-9]{0,3}[A-Z](?:\/[A-Z0-9]{1,4})?$/;
const RE_LOCATOR = /^[A-R]{2}[0-9]{2}(?:[A-X]{2})?$/;

export interface BalizaCw { indicativo: string; locator: string }

/** Las estaciones que se identifican en un texto de baliza: lo que sigue a cada «DE» y, si lo dice, su localizador. */
export function balizasEnTexto(texto: string): BalizaCw[] {
  const p = texto.toUpperCase().replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  const fuera: BalizaCw[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    if (p[i] !== 'DE') continue;
    const ind = p[i + 1];
    if (ind.length < 3 || !RE_INDICATIVO.test(ind)) continue;
    let locator = '';
    for (let k = i + 2; k < Math.min(p.length, i + 5); k++) if (RE_LOCATOR.test(p[k])) { locator = p[k]; break; }
    fuera.push({ indicativo: ind, locator });
  }
  return fuera;
}

export interface OidaCw { khz: number; indicativo: string; locator: string; snrDb: number; ppm: number; veces: number; primera: number; ultima: number }

/**
 * Las balizas de telegrafía oídas. Un indicativo leído una sola vez puede ser un error de lectura: no cuenta
 * hasta que se lee dos veces en la misma frecuencia en menos de media hora (la misma regla que los «skimmers»
 * de la Reverse Beacon Network, que piden verlo repetido).
 */
export class OidasCw {
  private vistas = new Map<string, { cuando: number; locator: string }>();
  private lista = new Map<string, OidaCw>();

  /** Lo leído en una frecuencia. Devuelve las que quedan confirmadas con esta lectura. */
  anotar(khz: number, lectura: LecturaCw, ms: number): OidaCw[] {
    const nuevas: OidaCw[] = [];
    for (const b of balizasEnTexto(lectura.texto)) {
      const clave = `${khz}/${b.indicativo}`;
      const ya = this.lista.get(clave);
      if (ya) { ya.veces++; ya.ultima = ms; ya.snrDb = lectura.snrDb; ya.ppm = lectura.ppm; if (b.locator) ya.locator = b.locator; continue; }
      const antes = this.vistas.get(clave);
      if (antes && ms - antes.cuando < 30 * 60_000) {
        const o: OidaCw = { khz, indicativo: b.indicativo, locator: b.locator || antes.locator, snrDb: lectura.snrDb, ppm: lectura.ppm, veces: 2, primera: antes.cuando, ultima: ms };
        this.lista.set(clave, o); this.vistas.delete(clave); nuevas.push(o);
      } else this.vistas.set(clave, { cuando: ms, locator: b.locator });
    }
    return nuevas;
  }

  /** Las oídas en las últimas `horas`, la más reciente primero. */
  recientes(ahora: number, horas = 6): OidaCw[] {
    return [...this.lista.values()].filter((o) => ahora - o.ultima < horas * 3600_000).sort((a, b) => b.ultima - a.ultima);
  }
}

/** Las frecuencias (kHz) de una lista escrita a mano: separadas por comas o espacios, de 100 a 30 000, ocho como mucho. */
export function frecuenciasCw(texto: string): number[] {
  const f: number[] = [];
  for (const t of String(texto).split(/[\s,;]+/)) {
    const k = Number(t.replace(',', '.'));
    if (t !== '' && Number.isFinite(k) && k >= 100 && k <= 30000 && !f.includes(Math.round(k * 100) / 100)) f.push(Math.round(k * 100) / 100);
    if (f.length === 8) break;
  }
  return f;
}

/** La sintonía para oír una baliza de telegrafía: tono de 500 Hz, filtro de 400 Hz (las balizas no clavan la frecuencia). */
export function sintoniaCw(khz: number) { return { modo: 'cw' as const, khz: khz - 0.5, bajo: 300, alto: 700, agc: false }; }

/** Sonido de prueba: un texto en telegrafía (PCM de 16 bits) con ruido. Nunca se emite: solo para las pruebas. */
export function sonidoCw(texto: string, ppm: number, ritmo: number, amplitud: number, ruido: number, tonoHz = 500, azar: () => number = Math.random): Buffer {
  const punto = 1.2 / ppm;
  const trozos: Array<[boolean, number]> = [[false, 0.4]];
  for (const palabra of texto.toUpperCase().split(' ')) {
    for (const c of palabra) {
      if (c === '_') { trozos.push([true, 1.0], [false, 3 * punto]); continue; }
      const m = A_MORSE[c]; if (!m) continue;
      for (const e of m) trozos.push([true, e === '.' ? punto : 3 * punto], [false, punto]);
      trozos.push([false, 2 * punto]);
    }
    trozos.push([false, 4 * punto]);
  }
  trozos.push([false, 0.4]);
  const total = Math.round(trozos.reduce((a, [, s]) => a + s, 0) * ritmo);
  const pcm = Buffer.alloc(total * 2);
  let i = 0;
  const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += azar(); return (u - 3) * 1.41; };
  for (const [on, s] of trozos) {
    const fin = Math.min(total, i + Math.round(s * ritmo));
    for (; i < fin; i++) {
      const v = (on ? amplitud * Math.sin(2 * Math.PI * tonoHz * i / ritmo) : 0) + ruido * gauss();
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), 2 * i);
    }
  }
  return pcm;
}
