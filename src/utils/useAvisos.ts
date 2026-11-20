// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Avisos de la cadena común (sismos, meteorología...) con la decisión de
// difusión de cada uno, tal como los sirve /api/avisos.
import { useCallback, useEffect, useState } from 'react';
import { customFetch } from './customFetch';

export type Gravedad = 'info' | 'amarillo' | 'naranja' | 'rojo';

export interface Aviso {
  /** Grupo de reglas: el tipo, o «umbrales» / «pronostico» para los avisos de la estación. */
  grupo?: string;
  id: string;
  tipo: string;
  gravedad: Gravedad;
  titulo: string;
  detalle: string;
  fuente: string;
  inicio: number;
  fin: number;
  lat?: number;
  lon?: number;
  deZona: boolean;
  distanciaKm: number | null;
  /** Cumple las reglas de difusión de la estación. */
  cumple: boolean;
  motivo: string;
  emitido: { primera: number; ultima: number; veces: number } | null;
  proxima: number | null;
  objeto: string | null;
  boletin: string | null;
  reglas: { radioKm: number | null; gravedadMinima: Gravedad; antelacionH: number; repetirMin: number };
}

export interface EstadoFuente { id: string; nombre: string; ok: boolean; cuando: number; texto: string }

export interface DatosAvisos { avisos: Aviso[]; total: number; fuentes: EstadoFuente[]; txEnabled: boolean }

const VACIO: DatosAvisos = { avisos: [], total: 0, fuentes: [], txEnabled: false };

export function useAvisos(cadaMs = 15000) {
  const [datos, setDatos] = useState<DatosAvisos>(VACIO);
  const [error, setError] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const r = await customFetch('/api/avisos');
      if (!r.ok) throw new Error(String(r.status));
      setDatos(await r.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    recargar();
    const t = setInterval(recargar, cadaMs);
    return () => clearInterval(t);
  }, [recargar, cadaMs]);

  return { ...datos, error, recargar };
}

const dos = (n: number) => String(n).padStart(2, '0');

/** «14:05» en UTC. */
export function horaUtc(ms: number): string {
  const d = new Date(ms);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** «hoy 14:00–20:00 UTC», «mañana 00:00–04:00 UTC» o con fecha. */
export function vigenciaLegible(inicio: number, fin: number, ahora = Date.now()): string {
  const dia = (ms: number) => Math.floor(ms / 86400000);
  const nombre = (ms: number) => {
    const n = dia(ms) - dia(ahora);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === -1) return 'ayer';
    const d = new Date(ms);
    return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}`;
  };
  const b = fin + 1000;
  const hasta = dia(b) === dia(inicio) ? horaUtc(b) : `${nombre(b)} ${horaUtc(b)}`;
  return `${nombre(inicio)} ${horaUtc(inicio)}–${hasta} UTC`;
}

/** Qué es el aviso, sin el nivel ni la vigencia abreviada que ya se muestran aparte. */
export function tituloAviso(a: { detalle: string; titulo: string }): string {
  const texto = (a.detalle || a.titulo)
    .replace(/^(ROJO|NARANJA|AMARILLO|INFO)\s+/i, '')
    .replace(/\s+\d{2}\/\d{2}-(\d{2}\/)?\d{2}z$/, '');
  return texto || a.titulo;
}

/** Dónde queda el aviso respecto a la estación. */
export function distanciaLegible(a: Aviso): string {
  if (a.distanciaKm === null) return 'Sin posición';
  if (a.deZona) return a.distanciaKm === 0 ? 'Dentro de la zona' : `A ${a.distanciaKm} km del borde`;
  return `A ${a.distanciaKm} km`;
}

/** «hace 2 min». */
export function haceCuanto(ms: number, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - ms) / 60000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

export const NOMBRE_TIPO: Record<string, string> = {
  sismo: 'Sismos', meteo: 'Meteo', tsunami: 'Tsunamis', incendio: 'Incendios', maritimo: 'Marítimos',
  clima_espacial: 'Clima espacial', calidad_aire: 'Calidad del aire', radiacion: 'Radiación', huracan: 'Huracanes', tornado: 'Tornados', otro: 'Otros',
};
