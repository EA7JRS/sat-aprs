// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · HackRF One como receptor de APRS en FM (VHF y UHF): de sus muestras al sonido que lee Direwolf.
//
// El HackRF entrega 2,4 millones de muestras complejas de 8 bits por segundo. Se sintoniza 300 kHz por debajo
// del canal (su propia portadora, en el centro, queda lejos), se trae el canal al centro, se filtra y se reduce
// a 48 000 muestras por segundo en dos pasos (entre 10 y entre 5) y se saca la modulación de frecuencia.
// Solo recibe: aquí no hay nada que ponga el HackRF a emitir (hackrf_transfer se llama siempre con -r).

export const HACKRF_RITMO = 2_400_000;      // muestras por segundo que se piden al HackRF
export const HACKRF_SONIDO = 48_000;        // muestras por segundo del sonido que sale
export const HACKRF_DESVIO_HZ = 300_000;    // cuánto por debajo del canal se sintoniza

export interface AjustesHackrf { mhz: number; lna: number; vga: number; amp: boolean; serie: string; puertoKiss: number }
export const HACKRF_DE_SERIE: AjustesHackrf = { mhz: 144.8, lna: 24, vga: 30, amp: false, serie: '', puertoKiss: 8012 };

const escalon = (v: number, max: number, paso: number) => { const n = Math.max(0, Math.min(max, Math.round(Number(v) || 0))); return n - (n % paso); };

/** Las ganancias que el HackRF admite: la de FI de 8 en 8 hasta 40 dB, la de banda base de 2 en 2 hasta 62. */
export function gananciasHackrf(lna: number, vga: number) { return { lna: escalon(lna, 40, 8), vga: escalon(vga, 62, 2) }; }

/** ¿Es una frecuencia (MHz) que el HackRF sintoniza y donde tiene sentido buscar APRS en FM? */
export function mhzHackrfValida(mhz: number): boolean { return Number.isFinite(mhz) && mhz >= 28 && mhz <= 1300; }

/** Los argumentos de hackrf_transfer para recibir (nunca -t). */
export function argsHackrf(a: AjustesHackrf): string[] {
  const g = gananciasHackrf(a.lna, a.vga);
  const args = ['-r', '-', '-f', String(Math.round(a.mhz * 1e6) - HACKRF_DESVIO_HZ), '-s', String(HACKRF_RITMO), '-b', '1750000', '-l', String(g.lna), '-g', String(g.vga), '-a', a.amp ? '1' : '0'];
  if (/^[0-9a-fA-F]{4,32}$/.test(a.serie)) args.push('-d', a.serie);
  return args;
}

/** La configuración del Direwolf que escucha ese sonido: 1200 baudios, sin emisión, KISS en su propio puerto. */
export function confDirewolfHackrf(indicativo: string, puertoKiss: number): string {
  const yo = /^[A-Z0-9]{3,6}(-\d{1,2})?$/.test(indicativo.trim().toUpperCase()) ? indicativo.trim().toUpperCase() : 'N0CALL';
  return [
    '# Generado por S.A.T.-APRS+: APRS en FM recibido con un HackRF One. Solo escucha.',
    'ADEVICE stdin null', `ARATE ${HACKRF_SONIDO}`, 'ACHANNELS 1', 'CHANNEL 0', `MYCALL ${yo}`,
    'MODEM 1200', 'AGWPORT 0',
    'KISSPORT 0',                 // sin el puerto de serie (8001), que es del Direwolf de la emisora
    `KISSPORT ${puertoKiss}`, '',
  ].join('\n');
}

export function argsDirewolfHackrf(rutaConf: string): string[] {
  return ['-c', rutaConf, '-r', String(HACKRF_SONIDO), '-n', '1', '-b', '16', '-t', '0', '-q', 'hd', '-'];
}

/** Coeficientes de un paso bajo (sinc con ventana de Blackman), con ganancia 1. corte: fracción de la velocidad de muestras. */
function pasoBajo(n: number, corte: number): Float32Array {
  const h = new Float32Array(n); let suma = 0;
  for (let i = 0; i < n; i++) {
    const x = i - (n - 1) / 2, w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (n - 1));
    h[i] = (Math.abs(x) < 1e-9 ? 2 * corte : Math.sin(2 * Math.PI * corte * x) / (Math.PI * x)) * w; suma += h[i];
  }
  for (let i = 0; i < n; i++) h[i] /= suma;
  return h;
}

/**
 * Receptor de FM estrecha: muestras de 8 bits con signo (I, Q) a 2,4 MS/s con el canal 300 kHz por encima del
 * centro → sonido de 16 bits a 48 kS/s (la salida de un discriminador, sin desénfasis: lo que quiere Direwolf).
 */
export class ReceptorFm {
  private static readonly N1 = 40; private static readonly D1 = 10; private static readonly N2 = 61; private static readonly D2 = 5;
  private h1 = pasoBajo(ReceptorFm.N1, 60_000 / HACKRF_RITMO);          // deja ±60 kHz; lo que se plegaría sobre el canal, fuera
  private h2 = pasoBajo(ReceptorFm.N2, 7_500 / (HACKRF_RITMO / 10));     // el canal: ±7,5 kHz
  private i1 = new Float32Array(2 * ReceptorFm.N1); private q1 = new Float32Array(2 * ReceptorFm.N1);
  private i2 = new Float32Array(2 * ReceptorFm.N2); private q2 = new Float32Array(2 * ReceptorFm.N2);
  private p1 = 0; private f1 = 0; private p2 = 0; private f2 = 0;
  private fase = 0;                    // de la mezcla: 300 kHz son un octavo de la velocidad de muestras
  private ai = 0; private aq = 0;      // la muestra anterior del canal
  private sueltoByte = -1;             // un byte que quedó sin pareja
  private pot = 0; private nPot = 0;
  /** Nivel del canal respecto al fondo de escala del HackRF (dBFS), o null sin muestras. */
  nivel: number | null = null;
  private static readonly COS = Float32Array.from({ length: 8 }, (_, k) => Math.cos(-2 * Math.PI * k / 8));
  private static readonly SEN = Float32Array.from({ length: 8 }, (_, k) => Math.sin(-2 * Math.PI * k / 8));

  /** Da el sonido que sale de un trozo de muestras. */
  dar(iq: Buffer): Buffer {
    const { N1, D1, N2, D2, COS, SEN } = ReceptorFm;
    const fuera = Buffer.alloc(Math.ceil((iq.length / 2 + 1) / (D1 * D2) + 2) * 2);
    let n = 0, k = 0;
    const total = iq.length;
    while (k < total) {
      let vi: number, vq: number;
      if (this.sueltoByte !== -1) { vi = this.sueltoByte; vq = iq.readInt8(k++); this.sueltoByte = -1; }
      else if (k + 1 < total) { vi = iq.readInt8(k); vq = iq.readInt8(k + 1); k += 2; }
      else { this.sueltoByte = iq.readInt8(k); break; }
      const c = COS[this.fase], s = SEN[this.fase]; this.fase = (this.fase + 1) & 7;
      const mi = vi * c - vq * s, mq = vi * s + vq * c;
      this.i1[this.p1] = this.i1[this.p1 + N1] = mi; this.q1[this.p1] = this.q1[this.p1 + N1] = mq;
      if (++this.p1 === N1) this.p1 = 0;
      if (++this.f1 < D1) continue;
      this.f1 = 0;
      let si = 0, sq = 0;
      for (let j = 0, b = this.p1; j < N1; j++, b++) { si += this.h1[j] * this.i1[b]; sq += this.h1[j] * this.q1[b]; }
      this.i2[this.p2] = this.i2[this.p2 + N2] = si; this.q2[this.p2] = this.q2[this.p2 + N2] = sq;
      if (++this.p2 === N2) this.p2 = 0;
      if (++this.f2 < D2) continue;
      this.f2 = 0;
      let ci = 0, cq = 0;
      for (let j = 0, b = this.p2; j < N2; j++, b++) { ci += this.h2[j] * this.i2[b]; cq += this.h2[j] * this.q2[b]; }
      // discriminador: el giro de fase entre dos muestras; ±3 kHz de desviación dan ±0,39 rad a 48 kS/s
      const giro = Math.atan2(cq * this.ai - ci * this.aq, ci * this.ai + cq * this.aq);
      this.ai = ci; this.aq = cq;
      this.pot += ci * ci + cq * cq;
      if (++this.nPot === 4800) { this.nivel = Math.round(100 * Math.log10(this.pot / 4800 / (127 * 127) + 1e-12)) / 10; this.pot = 0; this.nPot = 0; }
      fuera.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(giro * 26000))), 2 * n++);
    }
    return fuera.subarray(0, 2 * n);
  }
}

/** Muestras de prueba: un sonido (16 bits, 48 kS/s) modulado en FM como lo entregaría el HackRF, con ruido. Nunca se emite. */
export function muestrasFm(sonido: Int16Array, desviacionHz: number, amplitud: number, ruido: number, azar: () => number = Math.random): Buffer {
  const porMuestra = HACKRF_RITMO / HACKRF_SONIDO, total = Math.floor(sonido.length * porMuestra);
  const iq = Buffer.alloc(total * 2);
  let fase = 0;
  const g = () => (azar() + azar() + azar() + azar() - 2) * 1.73;
  for (let i = 0; i < total; i++) {
    const x = i / porMuestra, a = Math.floor(x), v = (sonido[a] + (sonido[Math.min(sonido.length - 1, a + 1)] - sonido[a]) * (x - a)) / 32768;
    fase += 2 * Math.PI * (HACKRF_DESVIO_HZ + desviacionHz * v) / HACKRF_RITMO;
    if (fase > Math.PI) fase -= 2 * Math.PI;
    iq.writeInt8(Math.max(-127, Math.min(127, Math.round(amplitud * Math.cos(fase) + ruido * g()))), 2 * i);
    iq.writeInt8(Math.max(-127, Math.min(127, Math.round(amplitud * Math.sin(fase) + ruido * g()))), 2 * i + 1);
  }
  return iq;
}
