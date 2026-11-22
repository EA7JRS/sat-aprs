// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Lo que la consola hace con un KiwiSDR: recibir APRS de onda corta (un canal, con un Direwolf
// que solo escucha) y medir la propagación con las balizas NCDXF / IARU (otro canal, que va de banda en banda).
// Solo recibe. Usa dos canales del KiwiSDR de continuo: con uno público, pida permiso a su dueño.
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { CanalKiwi } from './kiwi';
import { AjustesAprsHf, argsDirewolfHf, confDirewolfHf, tramasKiss } from './aprsHf';
import { BALIZAS, BANDAS_IBP, CICLO_S, CicloIbp, TablaIbp, balizaEn, sintoniaIbp } from './ibp';

export interface AjustesEstacionKiwi {
  equipo: string; puerto: number; clave: string;
  aprs: boolean; aprsHf: AjustesAprsHf;
  ibp: boolean;
  indicativo: string;
}

const REINTENTO_MS = 60_000;           // un KiwiSDR lleno o que corta no se vuelve a pedir cada pocos segundos

export class EstacionKiwi {
  posicion: { lat: number; lon: number } | null = null;
  // APRS de onda corta
  private canalAprs: CanalKiwi | null = null;
  private dw: ChildProcess | null = null;
  private kiss: net.Socket | null = null;
  private relojAprs: NodeJS.Timeout | null = null;
  aprs = { estado: 'apagado', motivo: '', tramas: 0, ultima: 0, nivel: null as number | null, desde: 0 };
  // balizas
  private canalIbp: CanalKiwi | null = null;
  private relojIbp: NodeJS.Timeout | null = null;
  private tic: NodeJS.Timeout | null = null;
  private ciclo: CicloIbp | null = null;
  private cicloN = -1;
  private bandaIbp = 0;
  tabla = new TablaIbp();
  ibp = { estado: 'apagado', motivo: '', banda: 0, ciclos: 0, saturado: false, desde: 0 };

  constructor(private ajustes: () => AjustesEstacionKiwi, private alRecibir: (ax25: Buffer) => void, private anotar: (texto: string) => void, private binDirewolf = 'direwolf') {}

  /** Arranca o rehace lo que digan los ajustes. */
  aplicar() {
    this.parar();
    const a = this.ajustes();
    if (!a.equipo) return;
    if (a.aprs) this.abrirAprs();
    if (a.ibp) this.abrirIbp();
  }

  parar() {
    for (const r of [this.relojAprs, this.relojIbp, this.tic]) if (r) clearTimeout(r);
    this.relojAprs = this.relojIbp = this.tic = null;
    this.cerrarAprs(); this.aprs.estado = 'apagado'; this.aprs.motivo = '';
    this.canalIbp?.removeAllListeners(); this.canalIbp?.cerrar(); this.canalIbp = null;
    this.ciclo = null; this.ibp.estado = 'apagado'; this.ibp.motivo = '';
  }

  // ---- APRS de onda corta

  private cerrarAprs() {
    this.canalAprs?.removeAllListeners(); this.canalAprs?.cerrar(); this.canalAprs = null;
    if (this.kiss) { this.kiss.removeAllListeners(); this.kiss.on('error', () => {}); this.kiss.destroy(); this.kiss = null; }
    if (this.dw) { this.dw.removeAllListeners(); try { this.dw.stdin?.destroy(); this.dw.kill(); } catch { /* ya no está */ } this.dw = null; }
  }

  private falloAprs(motivo: string) {
    this.cerrarAprs();
    this.aprs.estado = 'sin enlace'; this.aprs.motivo = motivo;
    this.anotar(`KiwiSDR, APRS de onda corta: ${motivo}. Se reintenta en un minuto.`);
    this.relojAprs = setTimeout(() => { if (this.ajustes().aprs && this.ajustes().equipo) this.abrirAprs(); }, REINTENTO_MS);
  }

  private abrirAprs() {
    const a = this.ajustes();
    const hf = a.aprsHf;
    this.aprs.estado = 'conectando'; this.aprs.motivo = '';
    const canal = new CanalKiwi({ equipo: a.equipo, puerto: a.puerto, clave: a.clave }, { modo: hf.banda, khz: hf.khz, bajo: hf.banda === 'usb' ? 300 : -2700, alto: hf.banda === 'usb' ? 2700 : -300 });
    this.canalAprs = canal;
    canal.on('posicion', (p) => { this.posicion = p; });
    canal.on('nivel', (dbm: number) => { this.aprs.nivel = Math.round(dbm); });
    canal.on('fin', (motivo: string) => this.falloAprs(motivo || 'se cortó'));
    canal.on('ritmo', (ritmo: number) => {
      // el Direwolf que escucha: su configuración, y el sonido por su entrada
      const conf = path.join(os.tmpdir(), `sat-aprs-kiwi-hf-${process.pid}.conf`);
      try { fs.writeFileSync(conf, confDirewolfHf(a.indicativo, ritmo, hf.puertoKiss), { mode: 0o600 }); } catch (e: any) { this.falloAprs(`no se pudo escribir la configuración de Direwolf: ${e?.message ?? e}`); return; }
      let dw: ChildProcess;
      try { dw = spawn(this.binDirewolf, argsDirewolfHf(conf, ritmo), { stdio: ['pipe', 'ignore', 'ignore'] }); } catch (e: any) { this.falloAprs(`no se pudo arrancar Direwolf: ${e?.message ?? e}`); return; }
      this.dw = dw;
      dw.on('error', (e) => this.falloAprs(`no se pudo arrancar Direwolf (${e.message})`));
      dw.on('exit', () => { if (this.dw === dw) this.falloAprs('Direwolf se paró'); });
      dw.stdin?.on('error', () => { /* se cerró: lo dice «exit» */ });
      canal.on('sonido', (pcm: Buffer) => { if (dw.stdin?.writable && dw.stdin.writableLength < 1 << 20) dw.stdin.write(pcm); });
      // su puerto KISS tarda un momento en abrirse
      setTimeout(() => this.conectarKiss(hf.puertoKiss, 0), 1500);
    });
    canal.abrir();
  }

  private conectarKiss(puerto: number, intento: number) {
    if (!this.dw) return;
    const k = net.connect(puerto, '127.0.0.1');
    let resto = Buffer.alloc(0);
    k.on('connect', () => { this.kiss = k; this.aprs.estado = 'recibiendo'; this.aprs.desde = Date.now(); const h = this.ajustes().aprsHf; this.anotar(`KiwiSDR: APRS de onda corta en ${h.khz} kHz ${h.banda.toUpperCase()}`); });
    k.on('data', (d: Buffer) => {
      const r = tramasKiss(resto.length ? Buffer.concat([resto, d]) : d);
      resto = r.resto;
      for (const t of r.tramas) { this.aprs.tramas++; this.aprs.ultima = Date.now(); try { this.alRecibir(t); } catch { /* una trama rara no para la recepción */ } }
    });
    k.on('error', () => { /* lo dice «close» */ });
    k.on('close', () => {
      if (this.kiss === k) { this.kiss = null; if (this.dw) this.falloAprs('se perdió el enlace con Direwolf'); return; }
      if (this.dw && intento < 8) setTimeout(() => this.conectarKiss(puerto, intento + 1), 1500);
      else if (this.dw) this.falloAprs('Direwolf no abre su puerto KISS');
    });
  }

  // ---- balizas NCDXF / IARU

  private abrirIbp() {
    const a = this.ajustes();
    this.ibp.estado = 'conectando'; this.ibp.motivo = '';
    this.ciclo = null; this.cicloN = -1;
    // otro número de conexión que el canal de APRS
    const canal = new CanalKiwi({ equipo: a.equipo, puerto: a.puerto, clave: a.clave }, sintoniaIbp(this.bandaIbp), ((Math.floor(Date.now() / 1000) + process.pid + 1) >>> 0));
    this.canalIbp = canal;
    canal.on('posicion', (p) => { this.posicion = p; });
    canal.on('ritmo', () => { this.ibp.estado = 'midiendo'; this.ibp.desde = Date.now(); this.anotar('KiwiSDR: midiendo las balizas NCDXF / IARU'); });
    canal.on('nivel', (dbm: number, saturado: boolean) => { this.ibp.saturado = saturado; this.nivelIbp(Date.now(), dbm); });
    canal.on('fin', (motivo: string) => {
      this.canalIbp = null; this.ciclo = null;
      this.ibp.estado = 'sin enlace'; this.ibp.motivo = motivo || 'se cortó';
      this.anotar(`KiwiSDR, balizas: ${this.ibp.motivo}. Se reintenta en un minuto.`);
      this.relojIbp = setTimeout(() => { if (this.ajustes().ibp && this.ajustes().equipo) this.abrirIbp(); }, REINTENTO_MS);
    });
    canal.abrir();
  }

  /** Un nivel del canal de balizas. Cada ciclo de tres minutos se cierra la banda y se pasa a la siguiente. */
  nivelIbp(ms: number, dbm: number) {
    const n = Math.floor(ms / (CICLO_S * 1000));
    if (n !== this.cicloN) {
      if (this.ciclo) {
        const medidas = this.ciclo.cerrar(ms);
        // un ciclo cogido a medias (el primero) no da medidas: la banda se repite entera
        if (medidas.length) {
          this.tabla.anotar(medidas, this.ciclo.ruido()); this.ibp.ciclos++;
          this.bandaIbp = (this.bandaIbp + 1) % BANDAS_IBP.length;
          this.canalIbp?.sintonizar(sintoniaIbp(this.bandaIbp));
        }
      }
      this.cicloN = n; this.ciclo = new CicloIbp(this.bandaIbp); this.ibp.banda = this.bandaIbp;
    }
    this.ciclo!.anotar(ms, dbm);
  }

  /** Lo que enseña la consola. */
  estado(ahora = Date.now()) {
    const a = this.ajustes();
    return {
      equipo: a.equipo, puerto: a.puerto, conClave: a.clave !== '', posicion: this.posicion,
      aprs: { activo: a.aprs, khz: a.aprsHf.khz, banda: a.aprsHf.banda, ...this.aprs },
      ibp: {
        activo: a.ibp, ...this.ibp,
        bandas: BANDAS_IBP, balizas: BALIZAS,
        ahora: BANDAS_IBP.map((_, f) => balizaEn(f, ahora)),
        cuadro: this.tabla.cuadro(ahora), ruido: this.tabla.ruido,
      },
    };
  }
}
