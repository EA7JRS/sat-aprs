// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Lo que Direwolf da de verdad, para su pantalla.
//
//  · Las tramas que pasan por el enlace KISS, en los dos sentidos.
//  · Su registro CSV (opción LOGDIR de direwolf.conf, un archivo por día):
//    por cada trama recibida anota la estación oída, el nivel de audio y los
//    bits que ha tenido que corregir. Sin ese registro no hay niveles: no se
//    inventan.
//  · Los valores de direwolf.conf.
// Aquí solo se recoge y se resume; el servidor decide qué enseñar.

import fs from 'fs';
import path from 'path';
import { leerPosicionAprs } from '../aprsPosicion';
import { gcDistanceKm, gcInitialBearing, LatLon } from '../formulas/geo';
import { leerMensajeAprs } from './mensajes';

// ── direwolf.conf ───────────────────────────────────────────────────────────
export interface ConfDirewolf {
  indicativo: string | null;
  audio: string | null;
  muestreo: number | null;
  modem: string | null;
  ptt: string | null;
  puertoKiss: number | null;
  puertoAgw: number | null;
  /** En milisegundos (en el archivo van en unidades de 10 ms). */
  txDelayMs: number | null;
  txTailMs: number | null;
  fixBits: number | null;
  /** Carpeta del registro CSV (LOGDIR); null si no está activado. */
  carpetaLog: string | null;
  canales: number;
}

/** Lee direwolf.conf. Lo que no está queda en null (Direwolf usa entonces su valor de serie). */
export function leerConfDirewolf(texto: string): ConfDirewolf {
  const c: ConfDirewolf = {
    indicativo: null, audio: null, muestreo: null, modem: null, ptt: null, puertoKiss: null, puertoAgw: null,
    txDelayMs: null, txTailMs: null, fixBits: null, carpetaLog: null, canales: 0,
  };
  const n = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);
  for (const cruda of String(texto ?? '').split('\n')) {
    const l = cruda.replace(/#.*$/, '').trim();
    if (!l) continue;
    const [clave, ...resto] = l.split(/\s+/);
    const k = clave.toUpperCase();
    const v = resto.join(' ');
    if (k === 'MYCALL') c.indicativo = resto[0]?.toUpperCase() ?? null;
    else if (k === 'ADEVICE' || k === 'ADEVICE0') c.audio = v || null;
    else if (k === 'ARATE') c.muestreo = n(resto[0]);
    else if (k === 'CHANNEL') c.canales += 1;
    else if (k === 'MODEM' && c.modem === null) {
      const baudios = n(resto[0]);
      c.modem = baudios === null ? v : baudios === 1200 ? '1200 Bd AFSK' : baudios === 300 ? '300 Bd AFSK (HF)' : baudios === 9600 ? '9600 Bd G3RUH' : `${baudios} Bd`;
    } else if (k === 'PTT' && c.ptt === null) c.ptt = v || null;
    else if (k === 'KISSPORT') c.puertoKiss = n(resto[0]);
    else if (k === 'AGWPORT') c.puertoAgw = n(resto[0]);
    else if (k === 'TXDELAY') c.txDelayMs = n(resto[0]) === null ? null : n(resto[0])! * 10;
    else if (k === 'TXTAIL') c.txTailMs = n(resto[0]) === null ? null : n(resto[0])! * 10;
    else if (k === 'FIX_BITS') c.fixBits = n(resto[0]);
    else if (k === 'LOGDIR') c.carpetaLog = resto[0] || null;
  }
  if (c.canales === 0 && c.audio) c.canales = 1;
  return c;
}

// ── Registro CSV de Direwolf ────────────────────────────────────────────────
export interface LineaLog {
  canal: number;
  /** Momento (ms epoch). */
  cuando: number;
  origen: string;
  /** La estación que se oyó de verdad: el origen o el último repetidor. */
  oida: string;
  /** Nivel de audio de la trama (lo que Direwolf da antes del paréntesis). */
  nivel: number | null;
  /** Bits corregidos por FIX_BITS (0 = trama limpia). */
  corregidos: number;
}

/** Separa una línea CSV respetando las comillas (Direwolf entrecomilla los campos con comas). */
export function camposCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (comillas) {
      if (ch === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
      else if (ch === '"') comillas = false;
      else actual += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { campos.push(actual); actual = ''; }
    else actual += ch;
  }
  campos.push(actual);
  return campos;
}

/** Interpreta una línea del registro con su cabecera. Null si no es una trama. */
export function leerLineaLog(linea: string, cabecera: string[]): LineaLog | null {
  const c = camposCsv(linea.replace(/\r$/, ''));
  const campo = (nombre: string) => {
    const i = cabecera.indexOf(nombre);
    return i >= 0 ? (c[i] ?? '').trim() : '';
  };
  const origen = campo('source').toUpperCase();
  const utime = Number(campo('utime'));
  if (!origen || !Number.isFinite(utime) || utime <= 0) return null;
  const nivel = /^(-?\d+)/.exec(campo('level'));
  return {
    canal: Number(campo('chan')) || 0,
    cuando: utime * 1000,
    origen,
    oida: (campo('heard') || origen).toUpperCase(),
    nivel: nivel ? Number(nivel[1]) : null,
    corregidos: Number(campo('error')) || 0,
  };
}

/** Sigue el registro: lee lo nuevo del archivo más reciente de la carpeta. */
export class LectorLog {
  private archivo = '';
  private posicion = 0;
  private cabecera: string[] = [];
  private resto = '';
  ultimaLinea = 0;
  error = '';

  constructor(private alLeer: (l: LineaLog) => void) {}

  get actual(): string {
    return this.archivo;
  }

  /** Lee lo nuevo. `carpeta` es el LOGDIR de direwolf.conf. */
  leer(carpeta: string | null, ahora = Date.now()) {
    if (!carpeta) { this.archivo = ''; this.error = ''; return; }
    let reciente = '';
    try {
      // Un archivo por día; el nombre depende de la versión, así que vale el más reciente
      let mejor = 0;
      for (const nombre of fs.readdirSync(carpeta)) {
        if (!nombre.endsWith('.log')) continue;
        const ruta = path.join(carpeta, nombre);
        const m = fs.statSync(ruta).mtimeMs;
        if (m > mejor) { mejor = m; reciente = ruta; }
      }
      this.error = reciente ? '' : 'la carpeta del registro está vacía';
    } catch (e: any) {
      this.error = `no se puede leer ${carpeta}: ${e?.code ?? e?.message ?? e}`;
      return;
    }
    if (!reciente) return;
    if (reciente !== this.archivo) {
      // Al arrancar se leen solo los últimos 64 kB (la última hora, de sobra); un archivo nuevo, entero
      const primeraVez = this.archivo === '';
      this.archivo = reciente;
      this.cabecera = [];
      this.resto = '';
      try {
        const tam = fs.statSync(reciente).size;
        this.posicion = primeraVez ? Math.max(0, tam - 64 * 1024) : 0;
      } catch { this.posicion = 0; }
      if (this.posicion > 0) this.leerCabecera();
    }
    let tam = 0;
    try { tam = fs.statSync(reciente).size; } catch { return; }
    if (tam < this.posicion) { this.posicion = 0; this.cabecera = []; this.resto = ''; }
    if (tam === this.posicion) return;
    let trozo = '';
    try {
      const fd = fs.openSync(reciente, 'r');
      const buf = Buffer.alloc(Math.min(tam - this.posicion, 512 * 1024));
      fs.readSync(fd, buf, 0, buf.length, this.posicion);
      fs.closeSync(fd);
      this.posicion += buf.length;
      trozo = buf.toString('latin1');
    } catch (e: any) {
      this.error = `no se puede leer el registro: ${e?.message ?? e}`;
      return;
    }
    const lineas = (this.resto + trozo).split('\n');
    this.resto = lineas.pop() ?? '';
    if (this.descartarPrimera) { lineas.shift(); this.descartarPrimera = false; }
    for (const l of lineas) {
      if (!l.trim()) continue;
      if (l.startsWith('chan,')) { this.cabecera = camposCsv(l.trim()); continue; }
      if (this.cabecera.length === 0) continue;
      const leida = leerLineaLog(l, this.cabecera);
      if (leida) { this.ultimaLinea = ahora; this.alLeer(leida); }
    }
  }

  private leerCabecera() {
    try {
      const fd = fs.openSync(this.archivo, 'r');
      const buf = Buffer.alloc(1024);
      const n = fs.readSync(fd, buf, 0, 1024, 0);
      fs.closeSync(fd);
      const primera = buf.toString('latin1', 0, n).split('\n')[0];
      if (primera.startsWith('chan,')) this.cabecera = camposCsv(primera.trim());
      // Lo leído desde la mitad empieza con una línea cortada: se descarta
      this.resto = '';
      this.descartarPrimera = true;
    } catch { /* sin cabecera: no se interpreta nada hasta la siguiente */ }
  }
  private descartarPrimera = false;
}

// ── Qué es cada trama ───────────────────────────────────────────────────────
const rumbo3 = (g: number) => String(Math.round(g) % 360).padStart(3, '0');

export function describirTrama(origen: string, destino: string, info: string, estacion: LatLon | null): string {
  const t = info.trim();
  if (!t) return 'Trama vacía';
  if (t.startsWith('}')) return 'Trama de terceros (pasarela)';
  const m = leerMensajeAprs(t);
  if (m) {
    if (m.acuse) return `Acuse ${m.acuse === 'ack' ? 'de' : 'rechazando'} mensaje ${m.id} para ${m.para}`;
    if (/^BLN/.test(m.para)) return `Boletín ${m.para} · «${m.texto.slice(0, 40)}»`;
    if (/^(PARM|UNIT|EQNS|BITS)\./.test(m.texto)) return `Definición de telemetría para ${m.para}`;
    return `Mensaje para ${m.para} · «${m.texto.slice(0, 40)}»`;
  }
  if (t.startsWith('T#')) return 'Telemetría';
  if (t.startsWith('>')) return `Estado · «${t.slice(1, 41).trim()}»`;
  if (t.startsWith('_')) return 'Meteorología (sin posición)';
  if (t.startsWith('?')) return 'Consulta';
  const p = leerPosicionAprs(origen, destino, t);
  if (p) {
    const partes: string[] = [];
    const tipo = p.clase === 'objeto' ? `Objeto ${p.nombre}` : p.clase === 'item' ? `Ítem ${p.nombre}` : /^[`']/.test(t) ? 'Mic-E' : p.simbolo.endsWith('_') ? 'Meteorología' : 'Posición';
    partes.push(p.baja ? `${tipo} (baja)` : tipo);
    if (estacion) {
      const d = gcDistanceKm(estacion, p);
      partes.push(`${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km al ${rumbo3(gcInitialBearing(estacion, p))}°`);
    }
    if (p.velocidadKmh !== undefined && p.rumbo !== undefined) partes.push(`${Math.round(p.velocidadKmh)} km/h al ${rumbo3(p.rumbo)}°`);
    if (p.comentario) partes.push(`«${p.comentario.slice(0, 30)}»`);
    return partes.join(' · ');
  }
  return 'Otro tipo de trama';
}

// ── Resumen de lo que pasa por Direwolf ─────────────────────────────────────
export interface Trama {
  cuando: number;
  sentido: 'RX' | 'TX';
  origen: string;
  destino: string;
  ruta: string;
  info: string;
  /** Repetidor por el que llegó (el último marcado con «*»). */
  via: string | null;
  nivel: number | null;
  corregidos: number | null;
}

export interface NivelEstacion { estacion: string; nivel: number; cuando: number; tramas: number }

export const NIVEL_BAJO = 30;
export const NIVEL_ALTO = 70;
const HORA = 3600_000;

/** Último repetidor que marcó la ruta con «*» (WIDE1-1*, EA7RCC-10*...). */
export function repetidorDe(ruta: string): string | null {
  const marcados = ruta.split(',').map((x) => x.trim()).filter((x) => x.endsWith('*')).map((x) => x.slice(0, -1).toUpperCase());
  const real = marcados.filter((x) => !/^(WIDE|TRACE|RELAY|TCPIP|QA[A-Z])/i.test(x));
  return real.length ? real[real.length - 1] : marcados.length ? marcados[marcados.length - 1] : null;
}

export class MonitorDirewolf {
  tramas: Trama[] = [];
  niveles = new Map<string, NivelEstacion>();
  private lineas: LineaLog[] = [];
  /** Última vez que se oyó por radio una trama propia repetida por otro. */
  propia: { por: string; cuando: number; trasSegundos: number | null } | null = null;
  ultimaEmisionPropia = 0;

  constructor(private propio: () => string, private max = 300) {}

  private recortar(ahora: number) {
    if (this.tramas.length > this.max) this.tramas.length = this.max;
    this.lineas = this.lineas.filter((l) => ahora - l.cuando < HORA);
  }

  anotarRx(origen: string, destino: string, ruta: string, info: string, ahora = Date.now()) {
    const o = origen.toUpperCase();
    const via = repetidorDe(ruta);
    const t: Trama = { cuando: ahora, sentido: 'RX', origen: o, destino, ruta, info, via, nivel: null, corregidos: null };
    // El registro de Direwolf suele llegar a la vez o un poco después; si ya está, se une ahora
    const l = this.lineas.find((x) => x.origen === o && Math.abs(x.cuando - ahora) < 10_000 && !(x as any).usada);
    if (l) { t.nivel = l.nivel; t.corregidos = l.corregidos; (l as any).usada = true; }
    this.tramas.unshift(t);
    const yo = this.propio().trim().toUpperCase();
    if (yo && o === yo && via) {
      this.propia = { por: via, cuando: ahora, trasSegundos: this.ultimaEmisionPropia && ahora - this.ultimaEmisionPropia < 120_000 ? Math.round((ahora - this.ultimaEmisionPropia) / 1000) : null };
    }
    this.recortar(ahora);
  }

  anotarTx(origen: string, destino: string, ruta: string, info: string, ahora = Date.now()) {
    const o = origen.toUpperCase();
    this.tramas.unshift({ cuando: ahora, sentido: 'TX', origen: o, destino, ruta, info, via: null, nivel: null, corregidos: null });
    if (o === this.propio().trim().toUpperCase()) this.ultimaEmisionPropia = ahora;
    this.recortar(ahora);
  }

  /** Una línea del registro de Direwolf. */
  anotarLog(l: LineaLog, ahora = Date.now()) {
    if (l.nivel !== null) {
      const previo = this.niveles.get(l.oida);
      this.niveles.set(l.oida, { estacion: l.oida, nivel: l.nivel, cuando: l.cuando, tramas: (previo?.tramas ?? 0) + 1 });
    }
    // Se une a la trama recibida del mismo origen, si ya llegó por KISS
    const t = this.tramas.find((x) => x.sentido === 'RX' && x.origen === l.origen && x.nivel === null && x.corregidos === null && Math.abs(x.cuando - l.cuando) < 10_000);
    if (t) { t.nivel = l.nivel; t.corregidos = l.corregidos; (l as any).usada = true; }
    this.lineas.push(l);
    this.recortar(ahora);
  }

  /** Cifras de la última hora y tráfico por minuto (60 casillas, la última es el minuto actual). */
  resumen(ahora = Date.now()) {
    const hora = this.tramas.filter((t) => ahora - t.cuando < HORA);
    const rx = hora.filter((t) => t.sentido === 'RX');
    const tx = hora.filter((t) => t.sentido === 'TX');
    const conNivel = this.lineas.filter((l) => l.nivel !== null);
    const minutoActual = Math.floor(ahora / 60_000);
    const minutos = Array.from({ length: 60 }, (_, i) => ({ minuto: (minutoActual - 59 + i) * 60_000, rx: 0, tx: 0 }));
    for (const t of hora) {
      const i = Math.floor(t.cuando / 60_000) - (minutoActual - 59);
      if (i >= 0 && i < 60) minutos[i][t.sentido === 'RX' ? 'rx' : 'tx'] += 1;
    }
    return {
      recibidas: rx.length,
      estaciones: new Set(rx.map((t) => t.origen)).size,
      emitidas: tx.length,
      // Del registro: solo si lo hay
      conRegistro: this.lineas.length,
      nivelMedio: conNivel.length ? Math.round(conNivel.reduce((s, l) => s + (l.nivel as number), 0) / conNivel.length) : null,
      corregidas: this.lineas.filter((l) => l.corregidos > 0).length,
      minutos,
    };
  }

  /** Niveles por estación oída, de la última hora, lo más reciente arriba. */
  nivelesRecientes(ahora = Date.now(), cuantas = 12): NivelEstacion[] {
    return [...this.niveles.values()].filter((n) => ahora - n.cuando < HORA).sort((a, b) => b.cuando - a.cuando).slice(0, cuantas);
  }
}
