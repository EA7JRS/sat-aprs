// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Cliente de cluster DX (telnet).
//
// Se conecta a un nodo de cluster (DXSpider, AR-Cluster, CC Cluster), se
// identifica con el indicativo de la estación y recoge los spots según
// llegan. Admite órdenes del operador (sh/dx, dx...). Solo conexión y lectura:
// el rumbo y la distancia los añade quien lo usa.

import net from 'net';

export interface Spot {
  /** Frecuencia en kHz. */
  khz: number;
  dx: string;
  /** Quién lo anuncia. */
  de: string;
  comentario: string;
  /** Hora del spot «HHMM» UTC, tal como la da el nodo. */
  hora: string;
  /** Momento en que se recibió (ms epoch). */
  cuando: number;
  banda: string;
}

const BANDAS: Array<[number, number, string]> = [
  [135, 138, '2200 m'], [472, 479, '630 m'], [1800, 2000, '160 m'], [3500, 4000, '80 m'], [5250, 5450, '60 m'],
  [7000, 7300, '40 m'], [10100, 10150, '30 m'], [14000, 14350, '20 m'], [18068, 18168, '17 m'], [21000, 21450, '15 m'],
  [24890, 24990, '12 m'], [28000, 29700, '10 m'], [50000, 54000, '6 m'], [70000, 70500, '4 m'], [144000, 148000, '2 m'],
  [430000, 440000, '70 cm'], [1240000, 1300000, '23 cm'],
];

export function bandaDe(khz: number): string {
  for (const [desde, hasta, nombre] of BANDAS) if (khz >= desde && khz <= hasta) return nombre;
  return '';
}

/** Lee una línea de spot: «DX de EA5BY:     14205.0  VP8LP        Falkland 59            1243Z». */
export function leerSpot(linea: string, ahora = Date.now()): Spot | null {
  const m = /^DX de\s+([A-Z0-9\/\-#]+):\s*(\d+(?:\.\d+)?)\s+([A-Z0-9\/\-]+)\s+(.*?)\s*(\d{4})Z(?:\s+\S+)?\s*$/i.exec(linea.replace(/[\x00-\x1f\x7f]/g, ''));
  if (!m) return null;
  const khz = Number(m[2]);
  if (!Number.isFinite(khz) || khz <= 0) return null;
  return {
    khz, dx: m[3].toUpperCase(), de: m[1].toUpperCase().replace(/-#$|#$/, ''), comentario: m[4].trim(), hora: m[5], cuando: ahora, banda: bandaDe(khz),
  };
}

export type EstadoCluster = 'parado' | 'conectando' | 'conectado' | 'desconectado';

export class ClusterDx {
  private socket: net.Socket | null = null;
  private destino: { host: string; puerto: number; indicativo: string } | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private espera = 10_000;
  private identificado = false;
  estado: EstadoCluster = 'parado';
  detalle = '';
  desde = 0;
  spots: Spot[] = [];
  /** Últimas líneas tal cual, para la consola. */
  lineas: Array<{ cuando: number; texto: string; mia?: boolean }> = [];

  constructor(private alCambiar: (estado: EstadoCluster, detalle: string) => void = () => {}, private maxSpots = 300) {}

  get destinoActual(): string {
    return this.destino ? `${this.destino.host}:${this.destino.puerto}` : '';
  }

  private cambiar(estado: EstadoCluster, detalle = '') {
    if (estado === this.estado && detalle === this.detalle) return;
    this.estado = estado;
    this.detalle = detalle;
    this.desde = Date.now();
    this.alCambiar(estado, detalle);
  }

  /** Conecta (o reconecta si cambia el nodo o el indicativo). Con lo mismo no hace nada. */
  iniciar(host: string, puerto: number, indicativo: string) {
    const d = this.destino;
    if (d && d.host === host && d.puerto === puerto && d.indicativo === indicativo) return;
    this.parar();
    this.destino = { host, puerto, indicativo };
    this.espera = 10_000;
    this.conectar();
  }

  parar() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.destino = null;
    this.socket?.destroy();
    this.socket = null;
    this.cambiar('parado');
  }

  private anotar(texto: string, mia = false) {
    this.lineas.push({ cuando: Date.now(), texto, mia });
    if (this.lineas.length > 200) this.lineas.splice(0, this.lineas.length - 200);
  }

  /** Procesa una línea del nodo (pública para las pruebas). */
  linea(texto: string) {
    const limpia = texto.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trimEnd();
    if (!limpia.trim()) return;
    const spot = leerSpot(limpia);
    if (spot) {
      this.spots.unshift(spot);
      if (this.spots.length > this.maxSpots) this.spots.length = this.maxSpots;
    }
    this.anotar(limpia);
  }

  private conectar() {
    const d = this.destino;
    if (!d) return;
    this.cambiar('conectando', `${d.host}:${d.puerto}`);
    this.identificado = false;
    const s = new net.Socket();
    this.socket = s;
    let resto = '';
    s.setEncoding('latin1');
    s.setKeepAlive(true, 30_000);
    s.setTimeout(15 * 60_000); // un nodo vivo manda algo mucho antes
    const identificar = () => {
      if (this.identificado || this.socket !== s) return;
      this.identificado = true;
      s.write(`${d.indicativo}\r\n`);
      this.cambiar('conectado', `${d.host}:${d.puerto} como ${d.indicativo}`);
      this.espera = 10_000;
    };
    s.connect(d.puerto, d.host, () => {
      // Lo normal es que el nodo pida «login:»; si no pregunta, se manda el indicativo a los 3 s
      setTimeout(identificar, 3000);
    });
    s.on('data', (trozo: string) => {
      // Negociación telnet (IAC ...): se descarta
      resto += trozo.replace(/\xff[\xfb-\xfe]./g, '');
      if (!this.identificado && /(login|call(sign)?|indicativo)[^\n]*[:>]\s*$/i.test(resto)) identificar();
      const partes = resto.split(/\r?\n/);
      resto = partes.pop() ?? '';
      for (const p of partes) this.linea(p);
      if (resto.length > 2000) resto = '';
    });
    const cerrar = (motivo: string) => {
      if (this.socket !== s) return;
      this.socket = null;
      s.destroy();
      this.cambiar('desconectado', motivo);
      if (this.destino) {
        this.temporizador = setTimeout(() => this.conectar(), this.espera);
        this.espera = Math.min(this.espera * 2, 5 * 60_000);
      }
    };
    s.on('timeout', () => cerrar('sin datos del nodo'));
    s.on('error', (e) => cerrar(e.message));
    s.on('close', () => cerrar('el nodo cerró la conexión'));
  }

  /** Envía una orden al nodo (sh/dx, dx 14205 EA7XYZ...). */
  orden(texto: string): boolean {
    const limpia = texto.replace(/[\r\n\x00-\x1f]/g, ' ').trim().slice(0, 200);
    if (!limpia || !this.socket || this.estado !== 'conectado') return false;
    this.socket.write(`${limpia}\r\n`);
    this.anotar(limpia, true);
    return true;
  }
}
