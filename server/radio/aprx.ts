// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Lo que aprx da de verdad, para su pantalla.
//
//  · aprx.conf: indicativo, conexión a APRS-IS, interfaces, digipeater, balizas.
//  · Su registro de radio (opción rflog de <logging>): una línea por trama,
//    «fecha hora PUERTO DIR [*|#]TNC2». DIR es R (recibida y pasada a
//    APRS-IS), d (recibida y descartada: «*» = sin APRS-IS, «#» = rechazada,
//    p. ej. duplicada) o T (emitida: repetida por el digipeater o baliza).
// Sin registro no hay cifras: se dice, no se inventan.

import fs from 'fs';

// ── aprx.conf ───────────────────────────────────────────────────────────────
export interface InterfazAprx { tipo: 'serie' | 'tcp' | 'ax25' | 'otro'; dispositivo: string; indicativo: string | null; emite: boolean }
export interface ConfAprx {
  indicativo: string | null;
  posicion: string | null;
  aprsis: { servidor: string | null; puerto: number | null; filtro: string | null; conPasscode: boolean } | null;
  interfaces: InterfazAprx[];
  digipeater: { transmisor: string; fuentes: string[] } | null;
  balizas: number;
  registroRf: string | null;
  registroAprx: string | null;
}

/** Lee aprx.conf. `$mycall` se sustituye por el indicativo. */
export function leerConfAprx(texto: string): ConfAprx {
  const c: ConfAprx = { indicativo: null, posicion: null, aprsis: null, interfaces: [], digipeater: null, balizas: 0, registroRf: null, registroAprx: null };
  const pila: string[] = [];
  let interfaz: InterfazAprx | null = null;
  const lineas = String(texto ?? '').split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  // Primero el indicativo, para poder sustituir $mycall
  for (const l of lineas) { const m = /^mycall\s+(\S+)/i.exec(l); if (m) c.indicativo = m[1].toUpperCase(); }
  const valor = (v: string) => (v.toLowerCase() === '$mycall' ? c.indicativo ?? v : v.replace(/^"|"$/g, ''));
  for (const l of lineas) {
    const abre = /^<(\w+)>$/.exec(l);
    const cierra = /^<\/(\w+)>$/.exec(l);
    if (abre) {
      const b = abre[1].toLowerCase();
      pila.push(b);
      if (b === 'aprsis') c.aprsis = { servidor: null, puerto: null, filtro: null, conPasscode: false };
      if (b === 'interface') interfaz = { tipo: 'otro', dispositivo: '', indicativo: null, emite: false };
      if (b === 'digipeater') c.digipeater = { transmisor: '', fuentes: [] };
      if (b === 'beacon') c.balizas += 1;
      continue;
    }
    if (cierra) {
      const b = pila.pop();
      if (b === 'interface' && interfaz) {
        if (!interfaz.indicativo) interfaz.indicativo = c.indicativo;
        c.interfaces.push(interfaz);
        interfaz = null;
      }
      continue;
    }
    const [clave, ...resto] = l.split(/\s+/);
    const k = clave.toLowerCase();
    const bloque = pila[pila.length - 1] ?? '';
    if (bloque === '') {
      if (k === 'myloc') c.posicion = resto.join(' ');
    } else if (bloque === 'aprsis' && c.aprsis) {
      if (k === 'server') { c.aprsis.servidor = resto[0] ?? null; c.aprsis.puerto = resto[1] ? Number(resto[1]) || null : 14580; }
      else if (k === 'filter') c.aprsis.filtro = [c.aprsis.filtro, resto.join(' ').replace(/"/g, '')].filter(Boolean).join(' ');
      else if (k === 'passcode') c.aprsis.conPasscode = !!resto[0] && resto[0] !== '-1';
    } else if (bloque === 'logging') {
      if (k === 'rflog') c.registroRf = resto[0] ?? null;
      else if (k === 'aprxlog') c.registroAprx = resto[0] ?? null;
    } else if (bloque === 'interface' && interfaz) {
      if (k === 'serial-device') { interfaz.tipo = 'serie'; interfaz.dispositivo = resto.join(' '); }
      else if (k === 'tcp-device') { interfaz.tipo = 'tcp'; interfaz.dispositivo = `${resto[0] ?? ''}:${resto[1] ?? ''}${resto[2] ? ` ${resto[2]}` : ''}`; }
      else if (k === 'ax25-device') { interfaz.tipo = 'ax25'; interfaz.dispositivo = valor(resto[0] ?? ''); }
      else if (k === 'callsign') interfaz.indicativo = valor(resto[0] ?? '').toUpperCase();
      else if (k === 'tx-ok') interfaz.emite = /^(true|yes|on|1)$/i.test(resto[0] ?? '');
    } else if (bloque === 'digipeater' && c.digipeater) {
      if (k === 'transmitter') c.digipeater.transmisor = valor(resto[0] ?? '').toUpperCase();
    } else if (bloque === 'source' && c.digipeater) {
      if (k === 'source') c.digipeater.fuentes.push(valor(resto[0] ?? '').toUpperCase());
    }
  }
  // Las interfaces ax25-device usan el indicativo como nombre
  for (const i of c.interfaces) if (i.tipo === 'ax25' && !i.indicativo) i.indicativo = i.dispositivo.toUpperCase();
  return c;
}

// ── Registro de radio (rflog) ───────────────────────────────────────────────
export type Resultado = 'pasada' | 'sin-aprsis' | 'rechazada' | 'descartada' | 'repetida' | 'baliza' | 'emitida' | 'de-aprsis';

export interface LineaRf {
  cuando: number;
  puerto: string;
  sentido: 'R' | 'd' | 'T';
  resultado: Resultado;
  origen: string;
  destino: string;
  ruta: string;
  info: string;
}

/**
 * Una línea del registro. La hora es la del equipo, sin zona: se interpreta
 * como hora local del servidor, que es lo que escribe aprx.
 */
export function leerLineaRf(linea: string, propios: string[] = []): LineaRf | null {
  const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d(?:\.\d+)?) (\S+)\s+([RdT]) ([*#]?)(.*)$/.exec(linea.replace(/\r$/, ''));
  if (!m) return null;
  const cuando = new Date(`${m[1]}T${m[2]}`).getTime();
  const t = /^([^>\s]+)>([^,:]+)([^:]*):(.*)$/.exec(m[6]);
  if (!t || !Number.isFinite(cuando)) return null;
  const sentido = m[4] as 'R' | 'd' | 'T';
  const origen = t[1].toUpperCase();
  const puerto = m[3];
  let resultado: Resultado;
  if (sentido === 'T') {
    const yo = propios.map((p) => p.toUpperCase());
    resultado = yo.includes(origen) || origen === puerto.toUpperCase() ? 'baliza' : 'repetida';
  } else if (puerto.toUpperCase() === 'APRSIS') resultado = 'de-aprsis';
  else if (sentido === 'R') resultado = 'pasada';
  else resultado = m[5] === '*' ? 'sin-aprsis' : m[5] === '#' ? 'rechazada' : 'descartada';
  return {
    cuando, puerto, sentido, resultado, origen, destino: t[2],
    ruta: t[3].replace(/^,/, ''),
    // aprx escribe los bytes no imprimibles como <0x..>
    info: t[4].replace(/<0x([0-9a-f]{2})>/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))),
  };
}

/** Sigue un archivo de registro según crece; empieza por el final de lo que ya hay. */
export class SeguidorArchivo {
  private ruta = '';
  private posicion = 0;
  private resto = '';
  private inodo = 0;
  error = '';
  ultimaLinea = 0;

  constructor(private alLeer: (linea: string) => void, private arranque = 128 * 1024) {}

  leer(ruta: string | null, ahora = Date.now()) {
    if (!ruta) { this.ruta = ''; this.error = ''; return; }
    let st: fs.Stats;
    try { st = fs.statSync(ruta); } catch (e: any) { this.error = `no se puede leer ${ruta}: ${e?.code ?? e?.message ?? e}`; return; }
    this.error = '';
    let primera = false;
    if (ruta !== this.ruta || st.ino !== this.inodo || st.size < this.posicion) {
      // Archivo nuevo o rotado: al arrancar, solo la cola; tras una rotación, entero
      primera = this.ruta === '';
      this.ruta = ruta;
      this.inodo = st.ino;
      this.posicion = primera ? Math.max(0, st.size - this.arranque) : 0;
      this.resto = '';
    }
    if (st.size === this.posicion) return;
    try {
      const fd = fs.openSync(ruta, 'r');
      const buf = Buffer.alloc(Math.min(st.size - this.posicion, 1024 * 1024));
      fs.readSync(fd, buf, 0, buf.length, this.posicion);
      fs.closeSync(fd);
      const cortada = primera && this.posicion > 0;
      this.posicion += buf.length;
      const lineas = (this.resto + buf.toString('latin1')).split('\n');
      this.resto = lineas.pop() ?? '';
      if (cortada) lineas.shift(); // la primera, leída desde la mitad
      for (const l of lineas) if (l.trim()) { this.ultimaLinea = ahora; this.alLeer(l); }
    } catch (e: any) {
      this.error = `no se puede leer el registro: ${e?.message ?? e}`;
    }
  }
}

const HORA = 3600_000;

export class MonitorAprx {
  lineas: LineaRf[] = [];
  constructor(private max = 2000) {}

  anotar(l: LineaRf) {
    this.lineas.unshift(l);
    if (this.lineas.length > this.max) this.lineas.length = this.max;
  }

  resumen(ahora = Date.now()) {
    const hora = this.lineas.filter((l) => ahora - l.cuando < HORA && l.cuando - ahora < 60_000);
    const cuenta = (r: Resultado) => hora.filter((l) => l.resultado === r).length;
    const rf = hora.filter((l) => l.sentido !== 'T' && l.resultado !== 'de-aprsis');
    const minutoActual = Math.floor(ahora / 60_000);
    const minutos = Array.from({ length: 60 }, (_, i) => ({ minuto: (minutoActual - 59 + i) * 60_000, recibidas: 0, emitidas: 0 }));
    for (const l of hora) {
      if (l.resultado === 'de-aprsis') continue;
      const i = Math.floor(l.cuando / 60_000) - (minutoActual - 59);
      if (i >= 0 && i < 60) minutos[i][l.sentido === 'T' ? 'emitidas' : 'recibidas'] += 1;
    }
    const porPuerto = new Map<string, { recibidas: number; pasadas: number; emitidas: number }>();
    for (const l of hora) {
      if (l.resultado === 'de-aprsis') continue;
      const p = porPuerto.get(l.puerto) ?? { recibidas: 0, pasadas: 0, emitidas: 0 };
      if (l.sentido === 'T') p.emitidas += 1; else { p.recibidas += 1; if (l.resultado === 'pasada') p.pasadas += 1; }
      porPuerto.set(l.puerto, p);
    }
    const ultimaPasada = this.lineas.find((l) => l.resultado === 'pasada')?.cuando ?? null;
    const ultimaSinAprsis = this.lineas.find((l) => l.resultado === 'sin-aprsis')?.cuando ?? null;
    return {
      recibidas: rf.length,
      estaciones: new Set(rf.map((l) => l.origen)).size,
      pasadas: cuenta('pasada'),
      sinAprsis: cuenta('sin-aprsis'),
      rechazadas: cuenta('rechazada') + cuenta('descartada'),
      repetidas: cuenta('repetida'),
      balizas: cuenta('baliza'),
      deAprsis: cuenta('de-aprsis'),
      minutos,
      puertos: [...porPuerto.entries()].map(([puerto, v]) => ({ puerto, ...v })).sort((a, b) => b.recibidas + b.emitidas - (a.recibidas + a.emitidas) || a.puerto.localeCompare(b.puerto)),
      // La pasarela a APRS-IS: lo último que se sabe por el registro
      pasarela: ultimaPasada === null && ultimaSinAprsis === null ? null
        : (ultimaSinAprsis ?? 0) > (ultimaPasada ?? 0) ? { funciona: false, desde: ultimaSinAprsis } : { funciona: true, desde: ultimaPasada },
    };
  }
}
