// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Escala Beaufort y anemómetro de cazoletas por pulsos.
// Portado del núcleo del plotter APRS LoRa+ (wind.cpp).

const BEAUFORT_TOP_KN = [0, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63]; // límite superior de cada fuerza

/** Fuerza Beaufort 0..12, con el viento redondeado al nudo. */
export function beaufort(knots: number): number {
  const k = Math.round(knots < 0 || !Number.isFinite(knots) ? 0 : knots);
  for (let f = 0; f < 12; f++) if (k <= BEAUFORT_TOP_KN[f]) return f;
  return 12;
}

const BEAUFORT_NAMES_ES = ['Calma', 'Ventolina', 'Flojito', 'Flojo', 'Bonancible', 'Fresquito', 'Fresco', 'Frescachón',
  'Temporal', 'Temporal fuerte', 'Temporal duro', 'Temporal muy duro', 'Temporal huracanado'];

export function beaufortNameEs(force: number): string {
  return BEAUFORT_NAMES_ES[force < 0 ? 0 : force > 12 ? 12 : Math.trunc(force)];
}

/**
 * Cuenta pulsos de un anemómetro de cazoletas (interruptor de láminas) con
 * filtro de rebotes y los convierte en nudos. Tiempos en microsegundos.
 */
export class PulseAnemometer {
  private static readonly MAX = 256;
  private t: number[] = new Array(PulseAnemometer.MAX).fill(0);
  private head = 0;
  private n = 0;
  private last = 0;
  private any = false;
  private total = 0;
  private gust = 0;

  /** knotsPerHz: nudos por cada pulso por segundo (1,2 de partida, sin calibrar). */
  constructor(private factorKnPerHz = 1.2, private debounceUs = 5000, private windowUs = 3_000_000, private calmUs = 5_000_000) {}

  setFactor(knotsPerHz: number): void { this.factorKnPerHz = knotsPerHz; }
  get factor(): number { return this.factorKnPerHz; }
  get gustKnots(): number { return this.gust; }
  get pulseCount(): number { return this.total; }
  resetGust(): void { this.gust = 0; }

  /** Registra un pulso; false si se descarta por rebote. */
  pulse(nowUs: number): boolean {
    if (this.any && nowUs - this.last < this.debounceUs) return false;
    this.last = nowUs;
    this.any = true;
    this.total++;
    this.t[this.head] = nowUs;
    this.head = (this.head + 1) % PulseAnemometer.MAX;
    if (this.n < PulseAnemometer.MAX) this.n++;
    return true;
  }

  /** Velocidad media de la ventana en nudos; 0 en calma. */
  knots(nowUs: number): number {
    const MAX = PulseAnemometer.MAX;
    if (!this.any || nowUs - this.last > this.calmUs) return 0;
    let cnt = 0, first = 0, lastT = 0;
    for (let i = 0; i < this.n; i++) {
      const t = this.t[(this.head - 1 - i + 2 * MAX) % MAX];
      if (nowUs - t > this.windowUs) break;
      if (cnt === 0) lastT = t;
      first = t;
      cnt++;
    }
    let hz = 0;
    if (cnt >= 2 && lastT > first) hz = ((cnt - 1) * 1e6) / (lastT - first);
    else if (this.n >= 2) { // viento flojo: intervalo entre los dos últimos pulsos
      const a = this.t[(this.head - 1 + MAX) % MAX], b = this.t[(this.head - 2 + MAX) % MAX];
      if (a > b) hz = 1e6 / (a - b);
    }
    const kn = hz * this.factorKnPerHz;
    if (kn > this.gust) this.gust = kn;
    return kn;
  }
}
