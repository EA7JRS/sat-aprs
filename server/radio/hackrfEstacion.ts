// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Lo que la consola hace con un HackRF One: recibir APRS en FM (1200 baudios) en una frecuencia
// de VHF o UHF, con un Direwolf aparte que solo escucha. hackrf_transfer da las muestras, aquí se saca el sonido
// y Direwolf lo descodifica. Solo recibe: el HackRF nunca se pone a emitir desde aquí.
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { AjustesHackrf, ReceptorFm, argsDirewolfHackrf, argsHackrf, confDirewolfHackrf, gananciasHackrf } from './hackrf';
import { tramasKiss } from './aprsHf';

export interface AjustesEstacionHackrf { activo: boolean; radio: AjustesHackrf; indicativo: string }

const REINTENTO_MS = 30_000;

export class EstacionHackrf {
  private hk: ChildProcess | null = null;
  private dw: ChildProcess | null = null;
  private kiss: net.Socket | null = null;
  private reloj: NodeJS.Timeout | null = null;
  private rx: ReceptorFm | null = null;
  private dicho = '';                  // lo último que dijo hackrf_transfer por su salida de errores
  e = { estado: 'apagado', motivo: '', tramas: 0, ultima: 0, desde: 0, muestras: 0 };

  constructor(private ajustes: () => AjustesEstacionHackrf, private alRecibir: (ax25: Buffer) => void, private anotar: (texto: string) => void, private binHackrf = 'hackrf_transfer', private binDirewolf = 'direwolf') {}

  aplicar() {
    this.parar();
    if (this.ajustes().activo) this.abrir();
  }

  parar() {
    if (this.reloj) clearTimeout(this.reloj); this.reloj = null;
    this.cerrar(); this.e.estado = 'apagado'; this.e.motivo = '';
  }

  private cerrar() {
    if (this.kiss) { this.kiss.removeAllListeners(); this.kiss.on('error', () => {}); this.kiss.destroy(); this.kiss = null; }
    for (const p of [this.hk, this.dw]) if (p) { p.removeAllListeners(); p.stdout?.removeAllListeners(); try { p.stdin?.destroy(); p.kill(); } catch { /* ya no está */ } }
    this.hk = this.dw = null; this.rx = null;
  }

  private fallo(motivo: string) {
    this.cerrar();
    this.e.estado = 'sin equipo'; this.e.motivo = motivo;
    this.anotar(`HackRF: ${motivo}. Se reintenta en medio minuto.`);
    this.reloj = setTimeout(() => { if (this.ajustes().activo) this.abrir(); }, REINTENTO_MS);
  }

  private abrir() {
    const a = this.ajustes();
    this.e.estado = 'arrancando'; this.e.motivo = ''; this.e.muestras = 0; this.dicho = '';
    const conf = path.join(os.tmpdir(), `sat-aprs-hackrf-${process.pid}.conf`);
    try { fs.writeFileSync(conf, confDirewolfHackrf(a.indicativo, a.radio.puertoKiss), { mode: 0o600 }); } catch (e: any) { this.fallo(`no se pudo escribir la configuración de Direwolf: ${e?.message ?? e}`); return; }
    let dw: ChildProcess, hk: ChildProcess;
    try { dw = spawn(this.binDirewolf, argsDirewolfHackrf(conf), { stdio: ['pipe', 'ignore', 'ignore'] }); } catch (e: any) { this.fallo(`no se pudo arrancar Direwolf: ${e?.message ?? e}`); return; }
    this.dw = dw;
    dw.on('error', (e) => this.fallo(`no se pudo arrancar Direwolf (${e.message})`));
    dw.on('exit', () => { if (this.dw === dw) this.fallo('Direwolf se paró'); });
    dw.stdin?.on('error', () => { /* se cerró: lo dice «exit» */ });
    try { hk = spawn(this.binHackrf, argsHackrf(a.radio), { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e: any) { this.fallo(`no se pudo arrancar hackrf_transfer: ${e?.message ?? e}`); return; }
    this.hk = hk;
    const rx = new ReceptorFm(); this.rx = rx;
    hk.on('error', (e: any) => this.fallo(e?.code === 'ENOENT' ? 'falta el programa hackrf_transfer (paquete «hackrf»)' : `no se pudo arrancar hackrf_transfer (${e.message})`));
    hk.on('exit', () => { if (this.hk === hk) this.fallo(motivoHackrf(this.dicho)); });
    hk.stderr?.on('data', (d: Buffer) => { this.dicho = (this.dicho + d.toString('latin1')).slice(-600); });
    hk.stdout?.on('data', (d: Buffer) => {
      this.e.muestras += d.length >> 1;
      const pcm = rx.dar(d);
      if (pcm.length && dw.stdin?.writable && dw.stdin.writableLength < 1 << 20) dw.stdin.write(pcm);
    });
    // el puerto KISS de Direwolf tarda un momento en abrirse
    setTimeout(() => this.conectarKiss(a.radio.puertoKiss, 0), 1500);
  }

  private conectarKiss(puerto: number, intento: number) {
    if (!this.dw) return;
    const k = net.connect(puerto, '127.0.0.1');
    let resto = Buffer.alloc(0);
    k.on('connect', () => { this.kiss = k; this.e.estado = 'recibiendo'; this.e.desde = Date.now(); this.anotar(`HackRF: APRS en ${this.ajustes().radio.mhz} MHz`); });
    k.on('data', (d: Buffer) => {
      const r = tramasKiss(resto.length ? Buffer.concat([resto, d]) : d);
      resto = r.resto;
      for (const t of r.tramas) { this.e.tramas++; this.e.ultima = Date.now(); try { this.alRecibir(t); } catch { /* una trama rara no para la recepción */ } }
    });
    k.on('error', () => { /* lo dice «close» */ });
    k.on('close', () => {
      if (this.kiss === k) { this.kiss = null; if (this.dw) this.fallo('se perdió el enlace con Direwolf'); return; }
      if (this.dw && intento < 8) setTimeout(() => this.conectarKiss(puerto, intento + 1), 1500);
      else if (this.dw) this.fallo('Direwolf no abre su puerto KISS');
    });
  }

  /** Lo que enseña la consola. */
  estado() {
    const a = this.ajustes(), g = gananciasHackrf(a.radio.lna, a.radio.vga);
    return { activo: a.activo, mhz: a.radio.mhz, lna: g.lna, vga: g.vga, amp: a.radio.amp, serie: a.radio.serie, ...this.e, nivel: this.e.estado === 'recibiendo' ? this.rx?.nivel ?? null : null };
  }
}

/** Por qué se paró hackrf_transfer, en claro, a partir de lo que dijo. */
export function motivoHackrf(dicho: string): string {
  if (/not found|No HackRF/i.test(dicho)) return 'no se encuentra ningún HackRF (¿enchufado?)';
  if (/busy|in use|LIBUSB_ERROR_BUSY/i.test(dicho)) return 'el HackRF lo está usando otro programa';
  if (/access|permission|LIBUSB_ERROR_ACCESS/i.test(dicho)) return 'sin permiso para abrir el HackRF (regla de udev: grupo plugdev)';
  const ultima = dicho.trim().split('\n').pop() ?? '';
  return ultima ? `hackrf_transfer se paró: ${ultima.slice(0, 120)}` : 'hackrf_transfer se paró';
}
