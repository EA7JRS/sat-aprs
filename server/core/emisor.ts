// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Cola única de emisión.
//
// Todas las transmisiones de la consola pasan por aquí, de una en una y con
// una pausa entre ellas, para no pisar el canal de radio con ráfagas cuando
// varias fuentes generan avisos a la vez. Las tramas urgentes se adelantan.

export type Envio = () => void | Promise<void>;

interface Tarea { envio: Envio; urgente: boolean }

export class ColaEmision {
  private cola: Tarea[] = [];
  private ocupada = false;

  constructor(
    /** Pausa mínima entre dos transmisiones consecutivas. */
    private readonly pausaMs: number = 4000,
    /** Tope de tramas en espera: por encima se descartan las no urgentes más antiguas. */
    private readonly maxPendientes: number = 40,
  ) {}

  get pendientes(): number {
    return this.cola.length;
  }

  encolar(envio: Envio, urgente = false): void {
    const tarea = { envio, urgente };
    if (urgente) {
      // Detrás de las urgentes que ya esperan, delante de todo lo demás
      const i = this.cola.findIndex((t) => !t.urgente);
      if (i === -1) this.cola.push(tarea);
      else this.cola.splice(i, 0, tarea);
    } else {
      this.cola.push(tarea);
    }
    while (this.cola.length > this.maxPendientes) {
      const i = this.cola.findIndex((t) => !t.urgente);
      this.cola.splice(i === -1 ? 0 : i, 1);
    }
    void this.procesar();
  }

  private async procesar(): Promise<void> {
    if (this.ocupada) return;
    this.ocupada = true;
    try {
      while (this.cola.length > 0) {
        const tarea = this.cola.shift()!;
        try {
          await tarea.envio();
        } catch (err: any) {
          console.warn(`[EMISOR] Fallo en una transmisión: ${err?.message || err}`);
        }
        if (this.cola.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.pausaMs));
        }
      }
    } finally {
      this.ocupada = false;
    }
  }
}
