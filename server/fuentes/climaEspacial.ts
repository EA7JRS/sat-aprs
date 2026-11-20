// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Fuente oficial de clima espacial (NOAA SWPC).
//
// El Centro de Predicción del Clima Espacial de la NOAA publica el estado
// actual de sus tres escalas: R (apagones de radio en HF), S (tormentas de
// radiación solar) y G (tormentas geomagnéticas), cada una de 0 a 5. Para un
// radioaficionado la R es la más directa: un R3 deja la HF inutilizable en el
// lado diurno. Este módulo solo recoge y normaliza.

import { Evento, Gravedad } from '../core/evento';
import { RegistroFuente } from './sismos';

export const URL_ESCALAS_NOAA = 'https://services.swpc.noaa.gov/products/noaa-scales.json';

export type EscalaNoaa = 'R' | 'S' | 'G';
export interface NivelEscala { escala: EscalaNoaa; nivel: number; cuando: number }

const NOMBRE: Record<EscalaNoaa, string> = {
  R: 'Apagon de radio HF',
  S: 'Tormenta de radiacion solar',
  G: 'Tormenta geomagnetica',
};
const GRADO = ['', 'menor', 'moderado', 'fuerte', 'severo', 'extremo'];
const GRADO_F = ['', 'menor', 'moderada', 'fuerte', 'severa', 'extrema'];

/** Estado actual de las escalas a partir de «noaa-scales.json» (la entrada «0» es la actual). */
export function leerEscalasNoaa(json: any, ahora = Date.now()): NivelEscala[] {
  const actual = json?.['0'];
  if (!actual || typeof actual !== 'object') return [];
  const cuando = Date.parse(`${actual.DateStamp ?? ''}T${actual.TimeStamp ?? ''}Z`);
  const niveles: NivelEscala[] = [];
  for (const escala of ['R', 'S', 'G'] as const) {
    const n = Number(actual[escala]?.Scale);
    if (Number.isInteger(n) && n >= 0 && n <= 5) niveles.push({ escala, nivel: n, cuando: Number.isFinite(cuando) ? cuando : ahora });
  }
  return niveles;
}

/** Nivel de aviso equivalente: 1 informativo, 2 amarillo, 3 naranja, 4 y 5 rojo. */
export function gravedadEscala(nivel: number): Gravedad {
  return nivel >= 4 ? 'rojo' : nivel === 3 ? 'naranja' : nivel === 2 ? 'amarillo' : 'info';
}

/**
 * Aviso de clima espacial. No tiene posición (afecta a todo el planeta): se
 * difunde como boletín. Vale mientras la escala siga activa: cada descarga
 * renueva su vigencia, y al bajar la escala caduca solo.
 */
export function escalaAEvento(n: NivelEscala, ahora = Date.now(), vigenciaMs = 45 * 60_000): Evento | null {
  if (n.nivel < 1) return null;
  const dia = new Date(ahora).toISOString().slice(0, 10).replace(/-/g, '');
  const grado = (n.escala === 'R' ? GRADO : GRADO_F)[n.nivel];
  return {
    // Un aviso por escala, nivel y día: si sube de nivel se anuncia de nuevo
    id: `NOAA-${n.escala}${n.nivel}-${dia}`,
    tipo: 'clima_espacial',
    gravedad: gravedadEscala(n.nivel),
    titulo: `${NOMBRE[n.escala]} ${grado}`,
    detalle: `${n.escala}${n.nivel}`,
    inicio: Math.min(n.cuando, ahora),
    fin: ahora + vigenciaMs,
    fuente: 'NOAA',
    real: true,
    datos: { nivel: n.nivel },
  };
}

/** Descarga el estado de las escalas. null si la NOAA no responde (se conserva lo anterior). */
export async function descargarClimaEspacial(registrar: RegistroFuente = () => {}): Promise<NivelEscala[] | null> {
  try {
    const res = await fetch(URL_ESCALAS_NOAA, { headers: { 'User-Agent': 'Mozilla/5.0 (S.A.T.-APRS+)' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const niveles = leerEscalasNoaa(await res.json());
    if (niveles.length === 0) throw new Error('formato no reconocido');
    registrar('NOAA', `Clima espacial (NOAA): ${niveles.map((n) => `${n.escala}${n.nivel}`).join(' ')}.`, true);
    return niveles;
  } catch (e: any) {
    registrar('NOAA', `No se pudo leer el clima espacial de la NOAA: ${e?.message || e}.`, false);
    return null;
  }
}
