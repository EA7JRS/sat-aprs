// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Servicio de emisión NMEA 2000: envuelve EmisorN2k y TransporteSocketCan, expone estado y API, y toma los
// datos de la estación (posición de gpsd, meteo de la estación/Internet) por funciones que le pasa server.ts.

import express from 'express';
import {
  EmisorN2k, TransporteSocketCan, CONFIG_N2K_DEFECTO, type ConfigN2k, type FuentesN2k, type DatosNav,
} from './nmea2000';

/** Lo que el servidor le presta al servicio: lectores de datos y utilidades. */
export interface EngancheN2k {
  posicion(): { lat: number; lon: number; cogRad?: number; sogMs?: number } | null;
  horaUnix(): number | null;
  viento(): { velMs: number; direccionRad: number } | null;
  presionPa(): number | null;
  temperaturaK(): number | null;
  navegacion?(): DatosNav | null;
  /** Persistir la configuración (p. ej. en sat_config.json). */
  guardar(): void;
  /** ¿La petición puede cambiar y persistir la configuración? */
  autorizado(req: express.Request): boolean;
}

const CLAVES: (keyof ConfigN2k)[] = ['activo', 'interfaz', 'direccion', 'emitirGps', 'emitirMeteo', 'emitirNavegacion', 'emitirAvisos', 'mmsiPropio', 'unico'];

export class ServicioN2k {
  cfg: ConfigN2k;
  private emisor: EmisorN2k | null = null;
  private transporte: TransporteSocketCan | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ultError = '';

  constructor(guardada: Partial<ConfigN2k> | undefined, private enganche: EngancheN2k) {
    this.cfg = { ...CONFIG_N2K_DEFECTO, ...(guardada ?? {}) };
    if (this.cfg.activo) this.aplicar();
  }

  private fuentes(): FuentesN2k {
    return {
      posicion: () => this.enganche.posicion(),
      horaUnix: () => this.enganche.horaUnix(),
      viento: () => this.enganche.viento(),
      presionPa: () => this.enganche.presionPa(),
      temperaturaK: () => this.enganche.temperaturaK(),
      navegacion: () => this.enganche.navegacion?.() ?? null,
    };
  }

  /** Arranca o reinicia el bus según la configuración actual. */
  aplicar() {
    this.parar();
    if (!this.cfg.activo) return;
    try {
      this.transporte = new TransporteSocketCan(this.cfg.interfaz, (id, datos) => this.emisor?.alRecibir(id, datos, Date.now()));
      this.emisor = new EmisorN2k(this.transporte, this.cfg, this.fuentes());
      this.transporte.abrir().catch((e) => { this.ultError = String(e?.message ?? e); });
      this.emisor.arrancar(Date.now());
      this.timer = setInterval(() => this.emisor?.tick(Date.now()), 250);
      this.ultError = '';
    } catch (e) {
      this.ultError = String((e as Error)?.message ?? e);
      this.parar();
    }
  }

  parar() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.transporte?.cerrar();
    this.transporte = null;
    this.emisor = null;
  }

  /** Avisos de emergencia: se llama cuando salta un aviso (sismo, alerta...). */
  emitirAviso(texto: string) { this.emisor?.emitirAviso(Date.now(), texto); }

  estado() {
    return {
      activo: this.cfg.activo,
      interfaz: this.cfg.interfaz,
      direccion: this.emisor ? this.emisor.direccion() : -1,
      error: this.ultError || null,
    };
  }

  /** Rutas /api/nmea2000 (GET estado+config, POST config). */
  router(): express.Router {
    const r = express.Router();
    r.get('/api/nmea2000', (_req, res) => res.json({ config: this.cfg, estado: this.estado() }));
    r.post('/api/nmea2000', (req, res) => {
      if (!this.enganche.autorizado(req)) return res.status(403).json({ error: 'no autorizado' });
      const body = (req.body ?? {}) as Partial<ConfigN2k>;
      for (const k of CLAVES) if (body[k] !== undefined) (this.cfg as unknown as Record<string, unknown>)[k] = body[k];
      if (!this.cfg.interfaz) this.cfg.interfaz = 'can0';
      if (!(this.cfg.direccion >= 0 && this.cfg.direccion <= 251)) this.cfg.direccion = 60;
      this.enganche.guardar();
      this.aplicar();
      res.json({ config: this.cfg, estado: this.estado(), persistido: true });
    });
    return r;
  }
}
