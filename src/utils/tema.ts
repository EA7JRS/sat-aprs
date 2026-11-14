// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Color de la consola. El usuario elige entre claro, oscuro, táctico (rojo de
// baja luminosidad para no perder la visión nocturna), el del sistema o
// automático; este último, por defecto, pone claro de día y oscuro de noche
// según el sol en la posición de la estación.
import { useCallback, useEffect, useState } from 'react';
import { getSunriseSunset, isNightTime } from './suncalc';

export type TemaElegido = 'auto' | 'sistema' | 'claro' | 'oscuro' | 'tactico';
export type TemaEfectivo = 'claro' | 'oscuro' | 'tactico';

export const TEMAS: Array<{ id: TemaElegido; nombre: string }> = [
  { id: 'auto', nombre: 'Automático' },
  { id: 'sistema', nombre: 'Sistema' },
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
  { id: 'tactico', nombre: 'Táctico' },
];

/** Color del tema táctico: cada uno es una gama única de baja luminosidad. */
export type ColorTactico = 'ambar' | 'rojo' | 'verde' | 'azul';

export const COLORES_TACTICO: Array<{ id: ColorTactico; nombre: string; fondo: string; texto: string }> = [
  { id: 'ambar', nombre: 'Ámbar', fondo: '#0b0402', texto: '#e8b7a1' },
  { id: 'rojo', nombre: 'Rojo', fondo: '#0c0202', texto: '#eba3a3' },
  { id: 'verde', nombre: 'Verde', fondo: '#030b03', texto: '#a8dea8' },
  { id: 'azul', nombre: 'Azul nocturno', fondo: '#03060a', texto: '#a8c3e0' },
];

const CLAVE = 'sat_tema';
const CLAVE_TACTICO = 'sat_tema_tactico';
const esColorTactico = (v: unknown): v is ColorTactico => COLORES_TACTICO.some((c) => c.id === v);

/** Color táctico guardado; ámbar si no hay ninguno. */
export function colorTacticoGuardado(almacen: Pick<Storage, 'getItem'>): ColorTactico {
  const v = almacen.getItem(CLAVE_TACTICO);
  return esColorTactico(v) ? v : 'ambar';
}

const esTema = (v: unknown): v is TemaElegido => TEMAS.some((t) => t.id === v);

/** Tema que se aplica de hecho. */
export function resolverTema(elegido: TemaElegido, entorno: { esNoche: boolean; sistemaOscuro: boolean }): TemaEfectivo {
  if (elegido === 'auto') return entorno.esNoche ? 'oscuro' : 'claro';
  if (elegido === 'sistema') return entorno.sistemaOscuro ? 'oscuro' : 'claro';
  return elegido;
}

/** Preferencia guardada; quien venía de los modos antiguos conserva lo que tenía. */
export function temaGuardado(almacen: Pick<Storage, 'getItem'>): TemaElegido {
  const v = almacen.getItem(CLAVE);
  if (esTema(v)) return v;
  if (almacen.getItem('nightModeAuto') === 'false') {
    if (almacen.getItem('dayMode') === 'true') return 'claro';
    if (almacen.getItem('nightMode') === 'true') return 'tactico';
    return 'oscuro';
  }
  return 'auto';
}

export interface OpcionesNoche {
  lat: number;
  lon: number;
  /** true = por el sol en la posición de la estación; false = por horario fijo. */
  solar: boolean;
  horaInicio: number;
  horaFin: number;
}

export function esDeNoche(o: OpcionesNoche, ahora = new Date()): boolean {
  if (o.solar) {
    const sol = getSunriseSunset(o.lat, o.lon, ahora);
    return isNightTime(ahora.getHours() + ahora.getMinutes() / 60, sol.sunrise, sol.sunset);
  }
  const h = ahora.getHours();
  return o.horaInicio > o.horaFin ? h >= o.horaInicio || h < o.horaFin : h >= o.horaInicio && h < o.horaFin;
}

export function useTema(noche: OpcionesNoche) {
  const [elegido, setElegidoEstado] = useState<TemaElegido>(() => {
    try { return temaGuardado(window.localStorage); } catch { return 'auto'; }
  });
  const [deNoche, setDeNoche] = useState(() => esDeNoche(noche));
  const [sistemaOscuro, setSistemaOscuro] = useState(() => {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return true; }
  });

  const [colorTactico, setColorTacticoEstado] = useState<ColorTactico>(() => {
    try { return colorTacticoGuardado(window.localStorage); } catch { return 'ambar'; }
  });
  const setColorTactico = useCallback((c: ColorTactico) => {
    setColorTacticoEstado(c);
    try { window.localStorage.setItem(CLAVE_TACTICO, c); } catch { /* sin almacenamiento */ }
  }, []);

  const setElegido = useCallback((t: TemaElegido) => {
    setElegidoEstado(t);
    try { window.localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento */ }
  }, []);

  // Día o noche en la estación (solo importa en automático, pero es barato)
  useEffect(() => {
    const mirar = () => setDeNoche(esDeNoche(noche));
    mirar();
    const t = setInterval(mirar, 30000);
    return () => clearInterval(t);
  }, [noche.lat, noche.lon, noche.solar, noche.horaInicio, noche.horaFin]);

  // Preferencia del sistema operativo, y cambios hechos en otra pestaña
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const alCambiar = (e: MediaQueryListEvent) => setSistemaOscuro(e.matches);
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', alCambiar);
    } catch { /* navegador sin matchMedia */ }
    const alGuardar = (e: StorageEvent) => {
      if (e.key === CLAVE && esTema(e.newValue)) setElegidoEstado(e.newValue);
      if (e.key === CLAVE_TACTICO && esColorTactico(e.newValue)) setColorTacticoEstado(e.newValue);
    };
    window.addEventListener('storage', alGuardar);
    return () => {
      mq?.removeEventListener('change', alCambiar);
      window.removeEventListener('storage', alGuardar);
    };
  }, []);

  return { elegido, setElegido, efectivo: resolverTema(elegido, { esNoche: deNoche, sistemaOscuro }), colorTactico, setColorTactico };
}
