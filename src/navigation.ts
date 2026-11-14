// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Navegación de la consola: seis secciones, cada una con sus pantallas.
// Es el único sitio donde se decide qué va dónde.

export type Pantalla =
  | 'inicio'
  | 'avisos' | 'sismos-ign' | 'aemet-portal' | 'incendios' | 'navareas' | 'radiological' | 'propagacion' | 'ica' | 'salud' | 'cecop-dashboard'
  | 'monitor' | 'perfil' | 'weewx-pillar'
  | 'mapa' | 'dgt' | 'portus'
  | 'direwolf-pillar' | 'aprx-pillar' | 'aprs-adaptor' | 'pat-pillar'
  | 'sistema' | 'engineering' | 'pruebas';

export type IdSeccion = 'inicio' | 'avisos' | 'estacion' | 'mapa' | 'radio' | 'sistema';

export interface Seccion {
  id: IdSeccion;
  nombre: string;
  pantallas: Array<{ id: Pantalla; nombre: string }>;
}

export const SECCIONES: Seccion[] = [
  { id: 'inicio', nombre: 'Inicio', pantallas: [{ id: 'inicio', nombre: 'Inicio' }] },
  {
    id: 'avisos', nombre: 'Avisos', pantallas: [
      { id: 'avisos', nombre: 'En vigor' },
      { id: 'sismos-ign', nombre: 'Sismos' },
      { id: 'aemet-portal', nombre: 'Meteorología' },
      { id: 'incendios', nombre: 'Incendios' },
      { id: 'navareas', nombre: 'Marítimos' },
      { id: 'radiological', nombre: 'Radiación' },
      { id: 'ica', nombre: 'Calidad del aire' },
      { id: 'salud', nombre: 'Salud' },
      { id: 'cecop-dashboard', nombre: 'Coordinación' },
    ],
  },
  {
    id: 'estacion', nombre: 'Estación', pantallas: [
      { id: 'monitor', nombre: 'Estación y meteo' },
      { id: 'perfil', nombre: 'Perfil' },
      { id: 'weewx-pillar', nombre: 'WeeWX' },
    ],
  },
  {
    id: 'mapa', nombre: 'Mapa', pantallas: [
      { id: 'mapa', nombre: 'Mapa' },
      { id: 'dgt', nombre: 'Tráfico' },
      { id: 'portus', nombre: 'Boyas' },
    ],
  },
  {
    id: 'radio', nombre: 'Radio', pantallas: [
      { id: 'direwolf-pillar', nombre: 'Direwolf' },
      { id: 'propagacion', nombre: 'HF y propagación' },
      { id: 'aprx-pillar', nombre: 'aprx' },
      { id: 'aprs-adaptor', nombre: 'Tramas APRS' },
      { id: 'pat-pillar', nombre: 'Winlink' },
    ],
  },
  {
    id: 'sistema', nombre: 'Sistema', pantallas: [
      { id: 'sistema', nombre: 'Equipo' },
      { id: 'engineering', nombre: 'Configuración' },
      { id: 'pruebas', nombre: 'Pruebas y simulación' },
    ],
  },
];

export function seccionDe(pantalla: Pantalla): Seccion {
  return SECCIONES.find((s) => s.pantallas.some((p) => p.id === pantalla)) ?? SECCIONES[0];
}
