// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · De un indicativo a su país (entidad DXCC) y su situación.
//
// Usa el fichero público cty.dat (country-files.com), el mismo que emplean los
// programas de concursos: cada entidad con su latitud y longitud y la lista de
// prefijos que le corresponden. Sirve para dar rumbo y distancia a un spot.
// Si el fichero no se ha podido descargar, no hay país: no se supone ninguno.

export const URL_CTY = 'https://www.country-files.com/cty/cty.dat';

export interface Entidad {
  nombre: string;
  continente: string;
  lat: number;
  lon: number;
  /** Prefijo principal (EA, F, VP8...). */
  prefijo: string;
}

export class TablaDxcc {
  private prefijos = new Map<string, Entidad>();
  private exactos = new Map<string, Entidad>();
  private largoMax = 1;

  get entidades(): number {
    return new Set(this.prefijos.values()).size;
  }

  /** Carga el contenido de cty.dat. Devuelve cuántas entidades ha leído. */
  cargar(texto: string): number {
    this.prefijos.clear();
    this.exactos.clear();
    this.largoMax = 1;
    // Cada entidad: una línea de cabecera con ocho campos acabados en «:» y,
    // debajo, sus prefijos separados por comas hasta el «;».
    const registros = String(texto ?? '').replace(/\r/g, '').split(';');
    for (const registro of registros) {
      const m = /^\s*([^:\n]+):\s*(\d+):\s*(\d+):\s*([A-Z]{2}):\s*(-?[\d.]+):\s*(-?[\d.]+):\s*(-?[\d.]+):\s*([^:\s]+):\s*([\s\S]*)$/.exec(registro);
      if (!m) continue;
      const lat = Number(m[5]);
      const lon = -Number(m[6]); // en cty.dat la longitud oeste es positiva
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const entidad: Entidad = { nombre: m[1].trim(), continente: m[4], lat, lon, prefijo: m[8].replace(/^\*/, '') };
      for (let alias of m[9].split(',')) {
        alias = alias.trim().replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>|\{[^}]*\}|~[^~]*~/g, ''); // zonas y correcciones: no hacen falta
        if (!alias) continue;
        if (alias.startsWith('=')) this.exactos.set(alias.slice(1).toUpperCase(), entidad);
        else {
          const p = alias.toUpperCase();
          this.prefijos.set(p, entidad);
          if (p.length > this.largoMax) this.largoMax = p.length;
        }
      }
    }
    return this.entidades;
  }

  /** Entidad de un indicativo: coincidencia exacta o el prefijo más largo. */
  buscar(indicativo: string): Entidad | null {
    let c = String(indicativo ?? '').toUpperCase().trim().replace(/-\d+$/, '');
    if (!c) return null;
    const exacto = this.exactos.get(c);
    if (exacto) return exacto;
    // Con barra: manda el trozo que designa el país (EA8/DL1ABC, DL1ABC/EA8). Se ignoran /P, /M, /QRP...
    if (c.includes('/')) {
      const trozos = c.split('/').filter((t) => !/^(P|M|MM|AM|QRP|A|B|LH|\d)$/.test(t));
      if (trozos.length === 0) return null;
      c = trozos.reduce((a, b) => (b.length < a.length ? b : a));
    }
    for (let n = Math.min(this.largoMax, c.length); n >= 1; n--) {
      const e = this.prefijos.get(c.slice(0, n));
      if (e) return e;
    }
    return null;
  }
}
