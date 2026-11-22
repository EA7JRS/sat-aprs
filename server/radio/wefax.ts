// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Wefax (EA7JRS/Wefax): el receptor de radiofacsímil meteorológico de la red, que además
// ejecuta VOACAP. De él se toman las cartas recibidas y la predicción de un circuito de onda corta
// (de un transmisor a donde está ese receptor). Funciones puras: lo que llega de la red se lee campo a
// campo y no se pasa tal cual al navegador.

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Ruta de la consulta de un circuito a Wefax; null si los números no pueden ser un circuito (VOACAP: 2 a 30 MHz). */
export function rutaCircuito(lat: number, lon: number, khz: number[], kw: number): string | null {
  if (![lat, lon, kw, ...khz].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || khz.length < 1 || khz.length > 11 || khz.some((k) => k < 2000 || k > 30000) || kw < 0.001 || kw > 1000) return null;
  return `/api/voacap?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&khz=${khz.map((k) => k.toFixed(1)).join(',')}&kw=${kw.toFixed(3)}`;
}

export interface CircuitoHf {
  ok: boolean;
  /** Por qué no hay predicción, en claro. */
  motivo: string;
  km: number | null;
  manchas: number | null;
  mes: number | null;
  ruido: number | null;
  umbral: number | null;
  khz: number[];
  /** Por frecuencia, 24 horas UTC: parte de los días del mes (0..1) en que la señal llega con el umbral pedido. */
  fiabilidad: Array<Array<number | null>>;
  /** Por frecuencia, 24 horas UTC: señal sobre ruido mediana, dB en 1 Hz. */
  senal: Array<Array<number | null>>;
}

const MOTIVOS: Record<string, string> = {
  'voacap not installed': 'VOACAP no está instalado en el equipo de Wefax (tools/instalar-voacap.sh)',
  'no sunspot number': 'Wefax no tiene el número de manchas solares del mes (su pestaña Receptor)',
  'no position': 'Wefax no tiene posición',
  'the prediction failed': 'VOACAP no dio resultado',
};

const filas = (v: unknown, n: number): Array<Array<number | null>> =>
  Array.isArray(v) && v.length === n && v.every((f) => Array.isArray(f) && f.length === 24) ? v.map((f: unknown[]) => f.map(num)) : [];

/** Respuesta de /api/voacap de Wefax. */
export function leerCircuito(j: any): CircuitoHf {
  const vacio: CircuitoHf = { ok: false, motivo: 'respuesta no válida', km: null, manchas: null, mes: null, ruido: null, umbral: null, khz: [], fiabilidad: [], senal: [] };
  if (!j || typeof j !== 'object' || Array.isArray(j)) return vacio;
  if (j.ok !== true) {
    const w = typeof j.why === 'string' ? j.why.replace(/[\u0000-\u001f]/g, ' ').slice(0, 120) : '';
    return { ...vacio, motivo: MOTIVOS[w] ?? (w || 'Wefax no pudo calcularlo') };
  }
  const khz = Array.isArray(j.khz) ? j.khz.map(num).filter((k: number | null): k is number => k !== null).slice(0, 11) : [];
  const fiabilidad = filas(j.rel, khz.length);
  if (!khz.length || !fiabilidad.length) return vacio;
  return { ok: true, motivo: '', km: num(j.km), manchas: num(j.ssn), mes: num(j.month), ruido: num(j.noise), umbral: num(j.snr), khz, fiabilidad, senal: filas(j.snr, khz.length) };
}

/** Horas UTC en que una frecuencia llega la mitad de los días o más, en tramos: «07-10, 16-18». */
export function horasBuenas(fiabilidad: Array<number | null>, minimo = 0.5): string {
  const b = Array.from({ length: 24 }, (_, h) => (fiabilidad[h] ?? 0) >= minimo);
  if (b.every(Boolean)) return 'todo el día';
  if (!b.some(Boolean)) return '';
  // se empieza tras un hueco, para que un tramo que cruza la medianoche salga entero
  const primera = b.findIndex((x, h) => x && !b[(h + 23) % 24]);
  const tramos: string[] = [];
  for (let i = 0; i < 24;) {
    const h = (primera + i) % 24;
    if (!b[h]) { i++; continue; }
    let n = 1;
    while (n < 24 - i && b[(h + n) % 24]) n++;
    tramos.push(`${String(h).padStart(2, '0')}-${String((h + n) % 24).padStart(2, '0')}`);
    i += n;
  }
  return tramos.join(', ');
}

export interface CartaWefax { id: number; recibida: string; estacion: string; titulo: string; khz: number; lineas: number; completa: boolean }

/** Lista de /api/charts de Wefax, la más nueva primero. */
export function leerCartas(j: unknown, maximo = 30): CartaWefax[] {
  if (!Array.isArray(j)) return [];
  const limpio = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');
  return j.slice(0, maximo).flatMap((c: any) => {
    const id = num(c?.id);
    if (id === null || id < 0 || !Number.isInteger(id)) return [];
    const recibida = limpio(c.received, 24);
    return [{ id, recibida: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(recibida) ? recibida : '', estacion: limpio(c.station, 24), titulo: limpio(c.title, 200),
      khz: num(c.khz) ?? 0, lineas: num(c.height) ?? 0, completa: c.ended === 'stop' }];
  });
}

/** Frecuencias de las bandas de aficionado de HF, para pedir un circuito sin elegir frecuencia. */
export const BANDAS_CIRCUITO_KHZ = [3650, 5360, 7100, 10120, 14150, 18100, 21200, 24930, 28500];

/**
 * Las escalas oficiales de la NOAA (R apagón de radio, S tormenta de radiación, G tormenta geomagnética, 0 a 5) en el
 * ajuste «space.wx» que entienden Wefax y Navtex: «R1S0G2T1795370000» (T, hora unix de la lectura). null si no cuadran.
 */
export function ajusteClimaEspacial(niveles: Array<{ escala: string; nivel: number }>, cuandoMs: number): string | null {
  const n = (l: string) => { const v = niveles.find((x) => x.escala === l)?.nivel ?? 0; return Number.isInteger(v) && v >= 0 && v <= 5 ? v : null; };
  const r = n('R'), sv = n('S'), g = n('G'), t = Math.floor(cuandoMs / 1000);
  if (r === null || sv === null || g === null || !Number.isFinite(t) || t < 1_000_000_000) return null;
  return `R${r}S${sv}G${g}T${t}`;
}
