// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Historial en SQLite (sat_historial.db).
//
// Lo que antes se perdía al reiniciar:
//  · tramas APRS que entran y salen (Radio · Tramas APRS);
//  · el registro de la consola (emisiones, avisos, servicios);
//  · el estado de la mensajería (recibidos, enviados y sus acuses).
// Usa el módulo `node:sqlite` de Node.js (22.13 o posterior, sin dependencias
// nativas). Si no está, la consola sigue en memoria y lo dice.

import fs from 'fs';

export interface Retencion { diasTramas: number; diasRegistro: number }
export interface FilaTrama { n: number; cuando: number; via: string; origen: string; destino: string; ruta: string; info: string; tipo: string; noEmitida?: string | null; canales?: string }
export interface FilaRegistro { id: string; cuando: number; tipo: string; datos: unknown }

type Db = {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): unknown; get(...a: unknown[]): any; all(...a: unknown[]): any[] };
  close(): void;
};

function abrir(ruta: string): Db {
  // getBuiltinModule vale igual en ESM (tsx) y en el paquete CJS; sin `node:sqlite`
  // devuelve undefined y la consola sigue en memoria.
  const mod = (process as unknown as { getBuiltinModule?: (n: string) => any }).getBuiltinModule?.('node:sqlite');
  if (!mod?.DatabaseSync) throw new Error('No such built-in module: node:sqlite');
  return new mod.DatabaseSync(ruta) as Db;
}

export class Historial {
  disponible = false;
  error: string | null = null;
  private db: Db | null = null;
  private st: Record<string, ReturnType<Db['prepare']>> = {};

  constructor(readonly ruta: string | null) {
    if (!ruta) { this.error = 'sin archivo'; return; }
    try {
      this.db = abrir(ruta);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS tramas (
          id INTEGER PRIMARY KEY AUTOINCREMENT, cuando INTEGER NOT NULL, via TEXT NOT NULL,
          origen TEXT NOT NULL, destino TEXT NOT NULL, ruta TEXT NOT NULL, info TEXT NOT NULL, tipo TEXT NOT NULL,
          no_emitida TEXT, canales TEXT);
        CREATE INDEX IF NOT EXISTS tramas_cuando ON tramas(cuando);
        CREATE INDEX IF NOT EXISTS tramas_origen ON tramas(origen, cuando);
        CREATE TABLE IF NOT EXISTS registro (
          id TEXT PRIMARY KEY, cuando INTEGER NOT NULL, tipo TEXT NOT NULL, datos TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS registro_cuando ON registro(cuando);
        CREATE TABLE IF NOT EXISTS estado (
          clave TEXT PRIMARY KEY, cuando INTEGER NOT NULL, valor TEXT NOT NULL);
      `);
      const p = (sql: string) => this.db!.prepare(sql);
      this.st = {
        trama: p('INSERT INTO tramas (cuando, via, origen, destino, ruta, info, tipo, no_emitida, canales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
        registro: p('INSERT OR REPLACE INTO registro (id, cuando, tipo, datos) VALUES (?, ?, ?, ?)'),
        estado: p('INSERT OR REPLACE INTO estado (clave, cuando, valor) VALUES (?, ?, ?)'),
        leerEstado: p('SELECT valor FROM estado WHERE clave = ?'),
      };
      this.disponible = true;
    } catch (e: any) {
      this.db = null;
      this.error = /node:sqlite|Cannot find module|No such built-in/i.test(String(e?.message ?? e))
        ? 'este Node.js no trae node:sqlite (hace falta la 22.13 o posterior)'
        : String(e?.message ?? e);
    }
  }

  private seguro<T>(f: () => T, porDefecto: T): T {
    if (!this.db) return porDefecto;
    try { return f(); } catch (e: any) { this.error = String(e?.message ?? e); return porDefecto; }
  }

  guardarTrama(t: Omit<FilaTrama, 'n'>): void {
    this.seguro(() => this.st.trama.run(t.cuando, t.via, t.origen, t.destino, t.ruta, t.info, t.tipo, t.noEmitida ?? null, t.canales ?? null), undefined);
  }

  /** Las últimas tramas, de la más nueva a la más antigua; con `q`, solo las de ese indicativo o texto. */
  tramas(limite = 500, opciones: { q?: string; desde?: number; via?: string } = {}): FilaTrama[] {
    return this.seguro(() => {
      const donde: string[] = [];
      const args: unknown[] = [];
      if (opciones.desde) { donde.push('cuando >= ?'); args.push(opciones.desde); }
      if (opciones.via) { donde.push('via = ?'); args.push(opciones.via); }
      if (opciones.q) { donde.push('(origen LIKE ? OR destino LIKE ? OR info LIKE ?)'); const q = `%${opciones.q.replace(/[%_]/g, '')}%`; args.push(q, q, q); }
      const sql = `SELECT id AS n, cuando, via, origen, destino, ruta, info, tipo, no_emitida AS noEmitida, canales FROM tramas${donde.length ? ` WHERE ${donde.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
      return this.db!.prepare(sql).all(...args, Math.max(1, Math.min(5000, limite))).map((f) => {
        const r: FilaTrama = { ...f };
        if (r.via !== 'TX') { delete r.noEmitida; delete r.canales; } else if (r.canales === null) delete r.canales;
        return r;
      });
    }, []);
  }

  guardarRegistro(id: string, cuando: number, tipo: string, datos: unknown): void {
    this.seguro(() => this.st.registro.run(id, cuando, tipo, JSON.stringify(datos)), undefined);
  }

  /** Últimas entradas del registro (de la más nueva a la más antigua). */
  registro(limite = 150, desde = 0): FilaRegistro[] {
    return this.seguro(() => this.db!.prepare('SELECT id, cuando, tipo, datos FROM registro WHERE cuando >= ? ORDER BY cuando DESC, rowid DESC LIMIT ?')
      .all(desde, Math.max(1, Math.min(20000, limite)))
      .map((f) => ({ id: f.id, cuando: f.cuando, tipo: f.tipo, datos: JSON.parse(f.datos) })), []);
  }

  guardarEstado(clave: string, valor: unknown, cuando = Date.now()): void {
    this.seguro(() => this.st.estado.run(clave, cuando, JSON.stringify(valor)), undefined);
  }

  leerEstado<T>(clave: string): T | null {
    return this.seguro(() => {
      const f = this.st.leerEstado.get(clave);
      return f ? (JSON.parse(f.valor) as T) : null;
    }, null);
  }

  /** Borra lo que pasa de la retención. Devuelve cuántas filas quitó. */
  purgar(r: Retencion, ahora = Date.now()): number {
    return this.seguro(() => {
      const a = this.db!.prepare('DELETE FROM tramas WHERE cuando < ?').run(ahora - Math.max(1, r.diasTramas) * 86_400_000) as { changes?: number };
      const b = this.db!.prepare('DELETE FROM registro WHERE cuando < ?').run(ahora - Math.max(1, r.diasRegistro) * 86_400_000) as { changes?: number };
      return Number(a?.changes ?? 0) + Number(b?.changes ?? 0);
    }, 0);
  }

  resumen() {
    const cuenta = (t: string) => this.seguro(() => Number(this.db!.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n ?? 0), 0);
    const primero = (t: string) => this.seguro(() => (this.db!.prepare(`SELECT MIN(cuando) AS c FROM ${t}`).get()?.c as number | null) ?? null, null);
    let bytes: number | null = null;
    try { if (this.ruta) bytes = fs.statSync(this.ruta).size + (fs.existsSync(`${this.ruta}-wal`) ? fs.statSync(`${this.ruta}-wal`).size : 0); } catch { bytes = null; }
    return {
      disponible: this.disponible, error: this.error, ruta: this.ruta, bytes,
      tramas: cuenta('tramas'), registro: cuenta('registro'),
      desdeTramas: primero('tramas'), desdeRegistro: primero('registro'),
    };
  }

  cerrar() { this.seguro(() => this.db!.close(), undefined); this.db = null; this.disponible = false; }
}

/** CSV sencillo (RFC 4180) para exportar. */
export function aCsv(columnas: string[], filas: Array<Record<string, unknown>>): string {
  const campo = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columnas.join(','), ...filas.map((f) => columnas.map((c) => campo(f[c])).join(','))].join('\r\n') + '\r\n';
}
