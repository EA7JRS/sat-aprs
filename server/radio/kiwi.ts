// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · KiwiSDR: un receptor de onda corta (0 a 30 MHz) que se usa por la red.
//
// El cliente abre un WebSocket (ws://equipo:8073/<número>/SND), dice quién es y pide una frecuencia y un
// modo; el receptor manda sonido (unas 12 000 muestras por segundo, de 16 bits) y, con cada bloque, el
// nivel de señal que mide. El protocolo es el de kiwiclient (github.com/jks-prv/kiwiclient, el cliente de
// referencia), leído de su código; no se copia nada de él. El mismo que usan EA7JRS/Wefax y EA7JRS/Navtex.
import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// ---- WebSocket (RFC 6455), lado cliente, sin TLS

export function peticionWs(equipo: string, puerto: number, numero: number, clave16: Buffer): string {
  return `GET /${numero}/SND HTTP/1.1\r\nHost: ${equipo}:${puerto}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${clave16.toString('base64')}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://${equipo}:${puerto}\r\n\r\n`;
}

export const wsAceptado = (respuesta: string) => /^HTTP\/1\.[01] 101/.test(respuesta);

/** Una trama del cliente (enmascarada, como pide la norma). opcode: 1 texto, 8 cierre, 10 pong. */
export function tramaWs(opcode: number, carga: Buffer, mascara: Buffer): Buffer {
  if (carga.length > 65535) throw new Error('trama demasiado larga');
  const cab = carga.length < 126 ? Buffer.from([0x80 | (opcode & 15), 0x80 | carga.length]) : Buffer.from([0x80 | (opcode & 15), 0x80 | 126, carga.length >> 8, carga.length & 255]);
  const c = Buffer.from(carga);
  for (let i = 0; i < c.length; i++) c[i] ^= mascara[i & 3];
  return Buffer.concat([cab, mascara.subarray(0, 4), c]);
}

export interface MensajeWs { opcode: number; carga: Buffer }

/** Junta los bytes que llegan en mensajes enteros (también los que vienen en varios trozos). */
export class LectorWs {
  private buf = Buffer.alloc(0);
  private trozos: Buffer[] = [];
  private opcodeTrozos = 0;
  constructor(private maximo = 4 << 20) {}

  /** Devuelve los mensajes completos; lanza si lo recibido no es un WebSocket. */
  dar(datos: Buffer): MensajeWs[] {
    const fuera: MensajeWs[] = [];
    this.buf = this.buf.length ? Buffer.concat([this.buf, datos]) : datos;
    for (;;) {
      if (this.buf.length < 2) break;
      if (this.buf[0] & 0x70) throw new Error('extensión de WebSocket que no se pidió');
      if (this.buf[1] & 0x80) throw new Error('un servidor no enmascara');
      let n = this.buf[1] & 127, cab = 2;
      if (n === 126) { if (this.buf.length < 4) break; n = this.buf.readUInt16BE(2); cab = 4; }
      else if (n === 127) { if (this.buf.length < 10) break; if (this.buf.readUInt32BE(2) !== 0) throw new Error('mensaje demasiado largo'); n = this.buf.readUInt32BE(6); cab = 10; }
      if (n > this.maximo) throw new Error('mensaje demasiado largo');
      if (this.buf.length < cab + n) break;
      const fin = (this.buf[0] & 0x80) !== 0, opcode = this.buf[0] & 15;
      const carga = this.buf.subarray(cab, cab + n);
      this.buf = this.buf.subarray(cab + n);
      if (opcode >= 8) { fuera.push({ opcode, carga: Buffer.from(carga) }); continue; }       // de control: nunca van troceadas
      if (!fin || opcode === 0) {
        if (opcode !== 0) this.opcodeTrozos = opcode;
        this.trozos.push(Buffer.from(carga));
        if (fin) { fuera.push({ opcode: this.opcodeTrozos, carga: Buffer.concat(this.trozos) }); this.trozos = []; }
      } else fuera.push({ opcode, carga: Buffer.from(carga) });
    }
    return fuera;
  }
}

// ---- mensajes del KiwiSDR

/** El valor de un nombre en el cuerpo de un MSG («audio_rate=12000 sample_rate=12001.135 …»); '' si no lleva valor; null si no está. */
export function valorMsg(cuerpo: string, nombre: string): string | null {
  for (const par of cuerpo.split(' ')) {
    if (par === nombre) return '';
    if (par.startsWith(nombre + '=')) return par.slice(nombre.length + 1);
  }
  return null;
}

/** La posición que declara el receptor, del valor de «load_cfg» (JSON codificado como URL, con el dato codificado otra vez). */
export function posicionCfg(valor: string): { lat: number; lon: number } | null {
  let t = valor;
  for (let i = 0; i < 2; i++) { try { t = decodeURIComponent(t); } catch { /* se queda como está */ } }
  const m = /"rx_gps"\s*:\s*"\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)"/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** Por qué no atiende el KiwiSDR, o null si el mensaje no es una negativa. */
export function negativa(cuerpo: string): string | null {
  if (valorMsg(cuerpo, 'too_busy') !== null) return 'todos sus canales están ocupados';
  const b = valorMsg(cuerpo, 'badp');
  if (b !== null && b !== '0') return b === '1' ? 'contraseña equivocada, o los canales sin contraseña están ocupados' : b === '5' ? 'no admite dos conexiones desde la misma dirección' : 'no deja entrar a este cliente';
  if (valorMsg(cuerpo, 'down') !== null) return 'está fuera de servicio';
  if (valorMsg(cuerpo, 'redirect') !== null) return 'manda a sus visitantes a otro receptor';
  return null;
}

export type ModoKiwi = 'usb' | 'lsb' | 'cw' | 'am';

/** Las órdenes que arrancan el sonido en un modo y una frecuencia (kHz, la del dial). desplazamiento: el del propio receptor (un conversor). */
export function ordenesSonido(modo: ModoKiwi, khz: number, bajo: number, alto: number, desplazamientoKhz = 0, agc = true): string[] {
  return [
    'SET squelch=0 max=0', 'SET genattn=0', 'SET gen=0 mix=-1', 'SET ident_user=SAT-APRS',
    `SET mod=${modo} low_cut=${Math.round(bajo)} high_cut=${Math.round(alto)} freq=${(khz - desplazamientoKhz).toFixed(3)}`,
    `SET agc=${agc ? 1 : 0} hang=0 thresh=-100 slope=6 decay=1000 manGain=50`,
    'SET compression=0', 'SET keepalive',
  ];
}

export const SND_ESTEREO = 0x08, SND_COMPRIMIDO = 0x10, SND_SATURADO = 0x02;

/** Un bloque de sonido (lo que sigue a las letras «SND»): el nivel que mide el receptor y las muestras, pasadas a little endian. */
export function sonidoSnd(cuerpo: Buffer): { flags: number; dbm: number; pcm: Buffer | null } | null {
  if (cuerpo.length < 7) return null;
  const flags = cuerpo[0], dbm = 0.1 * cuerpo.readUInt16BE(5) - 127;
  if (flags & (SND_ESTEREO | SND_COMPRIMIDO)) return { flags, dbm, pcm: null };      // no es sonido mono sin comprimir
  const n = (cuerpo.length - 7) >> 1;
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(cuerpo.readInt16BE(7 + 2 * i), 2 * i);
  return { flags, dbm, pcm };
}

// ---- el cliente

export interface AjustesKiwi { equipo: string; puerto: number; clave: string }
export interface Sintonia { modo: ModoKiwi; khz: number; bajo: number; alto: number; agc?: boolean }

/**
 * Una conexión con un KiwiSDR: un canal del receptor. Eventos: 'sonido' (Buffer, PCM de 16 bits little endian,
 * mono), 'nivel' (dBm), 'ritmo' (muestras por segundo), 'posicion' ({lat, lon}), 'fin' (motivo).
 */
export class CanalKiwi extends EventEmitter {
  private s: net.Socket | null = null;
  private lector = new LectorWs();
  private arriba = false;
  private cabecera = '';
  private latido: NodeJS.Timeout | null = null;
  private desplazamiento = 0;
  private pedido = false;
  ritmo = 0;
  conectado = false;
  motivo = '';
  desde = 0;

  constructor(private aj: AjustesKiwi, private sintonia: Sintonia, private numero = (Math.floor(Date.now() / 1000) + process.pid) >>> 0) { super(); }

  private texto(t: string) { this.s?.write(tramaWs(1, Buffer.from(t), crypto.randomBytes(4))); }

  abrir() {
    const s = net.connect({ host: this.aj.equipo, port: this.aj.puerto });
    this.s = s;
    s.setTimeout(20_000, () => this.cerrar('el KiwiSDR dejó de contestar'));
    s.on('connect', () => s.write(peticionWs(this.aj.equipo, this.aj.puerto, this.numero, crypto.randomBytes(16))));
    s.on('error', (e) => this.cerrar(`no se pudo conectar: ${e.message}`));
    s.on('close', () => this.cerrar(this.conectado ? 'el KiwiSDR cerró la conexión (los públicos limitan el tiempo de cada visitante)' : 'no se pudo conectar'));
    s.on('data', (d: Buffer) => {
      try {
        if (!this.arriba) {
          this.cabecera += d.toString('latin1');
          const fin = this.cabecera.indexOf('\r\n\r\n');
          if (fin < 0) { if (this.cabecera.length > 4096) this.cerrar('no contesta como un KiwiSDR'); return; }
          if (!wsAceptado(this.cabecera)) { this.cerrar(`no contesta como un KiwiSDR (${this.cabecera.split('\r\n')[0].slice(0, 60)})`); return; }
          this.arriba = true;
          this.texto(`SET auth t=kiwi p=${this.aj.clave || '#'}`);
          this.latido = setInterval(() => this.texto('SET keepalive'), 1000);
          d = Buffer.from(this.cabecera.slice(fin + 4), 'latin1');
          if (!d.length) return;
        }
        for (const m of this.lector.dar(d)) this.mensaje(m);
      } catch (e: any) { this.cerrar(`lo que manda el KiwiSDR no se entiende: ${e?.message ?? e}`); }
    });
  }

  private mensaje(m: MensajeWs) {
    if (m.opcode === 8) { this.cerrar('el KiwiSDR cerró la conexión (los públicos limitan el tiempo de cada visitante)'); return; }
    if (m.opcode === 9) { this.s?.write(tramaWs(10, m.carga.subarray(0, 125), crypto.randomBytes(4))); return; }
    if (m.opcode > 2 || m.carga.length < 3) return;
    const sello = m.carga.subarray(0, 3).toString('latin1');
    if (sello === 'MSG') {
      const cuerpo = m.carga.subarray(3).toString('latin1').trim();
      const no = negativa(cuerpo);
      if (no) { this.cerrar(`el KiwiSDR no atiende: ${no}`); return; }
      const off = valorMsg(cuerpo, 'freq_offset'); if (off) this.desplazamiento = Number(off) || 0;
      const ar = valorMsg(cuerpo, 'audio_rate'); if (ar) this.texto(`SET AR OK in=${parseInt(ar, 10)} out=44100`);
      const sr = valorMsg(cuerpo, 'sample_rate');
      if (sr && !this.pedido) {
        const r = Number(sr);
        if (!(r >= 8000 && r <= 48000)) { this.cerrar('el KiwiSDR dice una velocidad de muestras imposible'); return; }
        this.ritmo = r; this.pedido = true; this.conectado = true; this.desde = Date.now();
        this.emit('ritmo', r);
        this.pedir();
      }
      const cfg = valorMsg(cuerpo, 'load_cfg');
      if (cfg) { const p = posicionCfg(cfg); if (p) this.emit('posicion', p); }
    } else if (sello === 'SND' && this.pedido) {
      const b = sonidoSnd(m.carga.subarray(3));
      if (!b) return;
      this.emit('nivel', b.dbm, (b.flags & SND_SATURADO) !== 0);
      if (b.pcm && b.pcm.length) this.emit('sonido', b.pcm);
    }
  }

  private pedir() {
    const t = this.sintonia;
    for (const o of ordenesSonido(t.modo, t.khz, t.bajo, t.alto, this.desplazamiento, t.agc !== false)) this.texto(o);
  }

  /** Cambia de frecuencia o de modo sin soltar el canal. */
  sintonizar(t: Sintonia) { this.sintonia = t; if (this.pedido) this.pedir(); }

  cerrar(motivo = '') {
    if (this.latido) { clearInterval(this.latido); this.latido = null; }
    const s = this.s; this.s = null;
    if (!s) return;
    this.conectado = false; this.motivo = motivo;
    s.removeAllListeners(); s.on('error', () => { /* ya da igual */ }); s.destroy();
    this.emit('fin', motivo);
  }
}
