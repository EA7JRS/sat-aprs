// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Conexión permanente con APRS-IS.
//
// Una sola sesión para recibir (con filtro de servidor) y para emitir. Tener
// una única sesión importa: los servidores APRS-IS cierran la sesión anterior
// cuando el mismo indicativo abre otra. Se reconecta sola, con espera creciente (de 5 s a 1 min).

import net from 'net';

export type EstadoAprsIs = 'parado' | 'conectando' | 'conectado' | 'solo-recepcion' | 'desconectado';

export interface OpcionesAprsIs {
  servidor: string;
  puerto: number;
  indicativo: string;
  /** Passcode; con uno que no corresponda la sesión queda en solo recepción. */
  passcode: string;
  /** Filtro de servidor (p. ej. «r/37.4/-6.0/150»). */
  filtro: string;
  version: string;
}

export interface EventosAprsIs {
  /** Trama TNC2 recibida (las líneas de servicio, que empiezan por #, no llegan aquí). */
  alRecibir: (linea: string) => void;
  alCambiar?: (estado: EstadoAprsIs, detalle: string) => void;
}

const SILENCIO_MAX_MS = 120_000; // el servidor manda un latido cada ~20 s

export class ClienteAprsIs {
  private socket: net.Socket | null = null;
  private opciones: OpcionesAprsIs | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private vigilante: NodeJS.Timeout | null = null;
  private espera = 5000;
  private ultimoDato = 0;
  estado: EstadoAprsIs = 'parado';
  detalle = '';
  desde = 0;
  recibidas = 0;

  constructor(private eventos: EventosAprsIs) {}

  private cambiar(estado: EstadoAprsIs, detalle = '') {
    if (estado === this.estado && detalle === this.detalle) return;
    this.estado = estado;
    this.detalle = detalle;
    this.desde = Date.now();
    this.eventos.alCambiar?.(estado, detalle);
  }

  /** Abre la sesión (o la reabre con otras opciones). */
  iniciar(opciones: OpcionesAprsIs) {
    this.parar();
    this.opciones = opciones;
    this.espera = 5000;
    this.conectar();
  }

  parar() {
    if (this.temporizador) clearTimeout(this.temporizador);
    if (this.vigilante) clearInterval(this.vigilante);
    this.temporizador = this.vigilante = null;
    this.opciones = null;
    this.socket?.destroy();
    this.socket = null;
    this.cambiar('parado');
  }

  private conectar() {
    const o = this.opciones;
    if (!o) return;
    this.cambiar('conectando', `${o.servidor}:${o.puerto}`);
    const s = new net.Socket();
    this.socket = s;
    let resto = '';
    s.setEncoding('latin1'); // un byte = un carácter: no se pierden tramas con bytes fuera de ASCII
    s.setKeepAlive(true, 30000);
    s.connect(o.puerto, o.servidor, () => {
      this.ultimoDato = Date.now();
      s.write(`user ${o.indicativo} pass ${o.passcode || '-1'} vers SAT-APRS ${o.version}${o.filtro ? ` filter ${o.filtro}` : ''}\r\n`);
    });
    s.on('data', (trozo: string) => {
      this.ultimoDato = Date.now();
      resto += trozo;
      if (resto.length > 65536) resto = resto.slice(-4096);
      const lineas = resto.split(/\r?\n/);
      resto = lineas.pop() ?? '';
      for (const linea of lineas) {
        if (!linea) continue;
        if (linea[0] === '#') {
          if (linea.includes('logresp')) {
            const verificado = / verified/.test(linea) && !/unverified/.test(linea);
            this.espera = 5000;
            this.cambiar(verificado ? 'conectado' : 'solo-recepcion', (/server (\S+)/.exec(linea)?.[1] || o.servidor).replace(/,$/, ''));
          }
          continue;
        }
        this.recibidas++;
        try {
          this.eventos.alRecibir(linea);
        } catch { /* una trama rara no tira la sesión */ }
      }
    });
    const cerrar = (motivo: string) => {
      if (this.socket !== s) return;
      this.socket = null;
      s.destroy();
      if (!this.opciones) return;
      this.cambiar('desconectado', motivo);
      this.temporizador = setTimeout(() => this.conectar(), this.espera);
      this.espera = Math.min(this.espera * 2, 60_000);
    };
    // Con «localhost» Node prueba ::1 y 127.0.0.1 y, si fallan las dos, da un AggregateError sin mensaje
    s.on('error', (e: NodeJS.ErrnoException & { errors?: Error[] }) => cerrar(e.message || e.errors?.[0]?.message || e.code || 'no se pudo conectar'));
    s.on('close', () => cerrar('conexión cerrada'));

    if (this.vigilante) clearInterval(this.vigilante);
    this.vigilante = setInterval(() => {
      if (this.socket === s && Date.now() - this.ultimoDato > SILENCIO_MAX_MS) cerrar('sin respuesta del servidor');
    }, 30_000);
  }

  /** La sesión está verificada y puede emitir. */
  get puedeEmitir(): boolean {
    return this.estado === 'conectado' && !!this.socket && this.socket.writable;
  }

  /** Envía una trama por la sesión abierta. false si no hay sesión verificada. */
  enviar(trama: string): boolean {
    if (!this.puedeEmitir || !this.socket) return false;
    this.socket.write(Buffer.from(`${trama}\r\n`, 'latin1'));
    return true;
  }
}
