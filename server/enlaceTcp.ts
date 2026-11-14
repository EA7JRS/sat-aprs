// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Cliente TCP de líneas de texto con reconexión.
//
// Para los programas del equipo que sirven datos línea a línea por TCP
// (readsb/dump1090 en SBS, AIS-catcher o un servidor AIS en NMEA).

import net from 'net';

export type EstadoEnlace = 'parado' | 'conectando' | 'conectado' | 'desconectado';

export class EnlaceTcp {
  private socket: net.Socket | null = null;
  private destino: { host: string; puerto: number } | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private espera = 5000;
  estado: EstadoEnlace = 'parado';
  detalle = '';
  lineas = 0;

  constructor(private alRecibir: (linea: string) => void, private esperaMaxMs = 60_000) {}

  get destinoActual(): string {
    return this.destino ? `${this.destino.host}:${this.destino.puerto}` : '';
  }

  /** Conecta (o reconecta si el destino cambia). Con el mismo destino no hace nada. */
  iniciar(host: string, puerto: number) {
    if (this.destino && this.destino.host === host && this.destino.puerto === puerto) return;
    this.parar();
    this.destino = { host, puerto };
    this.espera = 5000;
    this.conectar();
  }

  parar() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.destino = null;
    this.socket?.destroy();
    this.socket = null;
    this.estado = 'parado';
    this.detalle = '';
  }

  private conectar() {
    const d = this.destino;
    if (!d) return;
    this.estado = 'conectando';
    const s = new net.Socket();
    this.socket = s;
    let resto = '';
    s.setEncoding('latin1');
    s.setKeepAlive(true, 30000);
    s.connect(d.puerto, d.host, () => {
      this.estado = 'conectado';
      this.detalle = '';
      this.espera = 5000;
    });
    s.on('data', (trozo: string) => {
      resto += trozo;
      if (resto.length > 262144) resto = resto.slice(-4096);
      const lineas = resto.split(/\r?\n/);
      resto = lineas.pop() ?? '';
      for (const linea of lineas) {
        if (!linea) continue;
        this.lineas++;
        try { this.alRecibir(linea); } catch { /* una línea rara no tira el enlace */ }
      }
    });
    const cerrar = (motivo: string) => {
      if (this.socket !== s) return;
      this.socket = null;
      s.destroy();
      if (!this.destino) return;
      this.estado = 'desconectado';
      this.detalle = motivo;
      this.temporizador = setTimeout(() => this.conectar(), this.espera);
      this.espera = Math.min(this.espera * 2, this.esperaMaxMs);
    };
    s.on('error', (e) => cerrar(e.message));
    s.on('close', () => cerrar('conexión cerrada'));
  }
}
