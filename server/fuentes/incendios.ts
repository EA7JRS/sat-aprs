// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Focos de calor vistos desde satélite (NASA FIRMS).
//
// FIRMS publica las anomalías térmicas que detectan los sensores VIIRS y
// MODIS en las últimas 24 horas. Un foco NO es un incendio confirmado: puede
// ser una quema agrícola o una instalación industrial. Por eso se descartan
// los de baja confianza, se agrupan los cercanos y el aviso dice siempre
// «foco de calor por satélite». Este módulo solo recoge y normaliza.

import { Evento, Gravedad } from '../core/evento';
import { gcDistanceKm } from '../formulas/geo';
import { RegistroFuente } from './sismos';

export const URLS_FIRMS = [
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Europe_24h.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6.1_Europe_24h.csv',
];

export interface Foco {
  lat: number;
  lon: number;
  /** Potencia radiativa del fuego en MW. */
  frp: number;
  /** Momento de la pasada del satélite (ms epoch). */
  cuando: number;
}

/**
 * Lee un CSV de FIRMS. Se quedan los focos de confianza nominal o alta
 * (VIIRS: «n» o «h»; MODIS: 50 % o más).
 */
export function leerCsvFirms(texto: string): Foco[] {
  const lineas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const cab = lineas[0].split(',').map((c) => c.trim().toLowerCase());
  const col = (nombre: string) => cab.indexOf(nombre);
  const [iLat, iLon, iFrp, iFecha, iHora, iConf] = [col('latitude'), col('longitude'), col('frp'), col('acq_date'), col('acq_time'), col('confidence')];
  if (iLat < 0 || iLon < 0 || iFecha < 0 || iHora < 0) return [];
  const focos: Foco[] = [];
  for (const linea of lineas.slice(1)) {
    const c = linea.split(',');
    const lat = Number(c[iLat]);
    const lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const conf = (c[iConf] ?? '').trim().toLowerCase();
    const fiable = iConf < 0 || conf === 'n' || conf === 'h' || conf === 'nominal' || conf === 'high' || (/^\d+$/.test(conf) && Number(conf) >= 50);
    if (!fiable) continue;
    const hora = String(c[iHora] ?? '').trim().padStart(4, '0');
    const cuando = Date.parse(`${(c[iFecha] ?? '').trim()}T${hora.slice(0, 2)}:${hora.slice(2, 4)}:00Z`);
    if (!Number.isFinite(cuando)) continue;
    const frp = Number(c[iFrp]);
    focos.push({ lat, lon, frp: Number.isFinite(frp) && frp > 0 ? frp : 0, cuando });
  }
  return focos;
}

export interface GrupoFocos {
  lat: number;
  lon: number;
  focos: number;
  /** Suma de la potencia radiativa en MW. */
  frp: number;
  /** Pasada más reciente (ms epoch). */
  cuando: number;
}

/** Agrupa los focos que distan menos de `radioKm` del centro de un grupo (el mismo fuego visto en varios píxeles). */
export function agruparFocos(focos: Foco[], radioKm = 3): GrupoFocos[] {
  const grupos: Array<GrupoFocos & { sumLat: number; sumLon: number }> = [];
  for (const f of [...focos].sort((a, b) => b.frp - a.frp)) {
    const g = grupos.find((x) => gcDistanceKm({ lat: x.lat, lon: x.lon }, f) <= radioKm);
    if (g) {
      g.focos++;
      g.frp += f.frp;
      g.sumLat += f.lat;
      g.sumLon += f.lon;
      g.lat = g.sumLat / g.focos;
      g.lon = g.sumLon / g.focos;
      g.cuando = Math.max(g.cuando, f.cuando);
    } else {
      grupos.push({ lat: f.lat, lon: f.lon, focos: 1, frp: f.frp, cuando: f.cuando, sumLat: f.lat, sumLon: f.lon });
    }
  }
  return grupos.map(({ sumLat: _a, sumLon: _b, ...g }) => g);
}

/** Importancia del grupo por número de focos y potencia. */
export function gravedadFocos(g: GrupoFocos): Gravedad {
  if (g.focos >= 20 || g.frp >= 500) return 'rojo';
  if (g.focos >= 5 || g.frp >= 100) return 'naranja';
  if (g.focos >= 2 || g.frp >= 20) return 'amarillo';
  return 'info';
}

export function grupoAEvento(g: GrupoFocos): Evento {
  // Celda de ~1 km: identifica el mismo fuego entre pasadas; el nombre del objeto sale de ella
  const celda = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`;
  let h = 0;
  for (const c of celda) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const dia = new Date(g.cuando).toISOString().slice(0, 10).replace(/-/g, '');
  return {
    id: `FIRMS-${celda}-${dia}`,
    tipo: 'incendio',
    gravedad: gravedadFocos(g),
    titulo: 'Foco de calor por satelite',
    detalle: `${g.focos} ${g.focos === 1 ? 'punto' : 'puntos'} ${Math.round(g.frp)}MW`,
    lat: g.lat,
    lon: g.lon,
    nombre: `FG${h.toString(36).toUpperCase().padStart(7, '0').slice(-7)}`,
    inicio: g.cuando,
    fuente: 'FIRMS',
    real: true,
    datos: { focos: g.focos, frp: g.frp },
  };
}

/**
 * Descarga los focos de las últimas 24 h en torno a un punto. Se filtra por
 * distancia antes de agrupar: en verano hay decenas de miles en Europa.
 * Devuelve null si ningún archivo se pudo descargar.
 */
export async function descargarFocos(centro: { lat: number; lon: number }, radioKm: number, registrar: RegistroFuente = () => {}): Promise<GrupoFocos[] | null> {
  const cercanos: Foco[] = [];
  let descargados = 0;
  for (const url of URLS_FIRMS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (S.A.T.-APRS)' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const f of leerCsvFirms(await res.text())) {
        if (gcDistanceKm(centro, f) <= radioKm) cercanos.push(f);
      }
      descargados++;
    } catch { /* se intenta con los demás satélites */ }
  }
  if (descargados === 0) {
    registrar('FIRMS', 'No se pudieron descargar los focos de calor de NASA FIRMS.', false);
    return null;
  }
  const grupos = agruparFocos(cercanos);
  registrar('FIRMS', `Focos de calor (NASA FIRMS): ${cercanos.length} puntos en ${grupos.length} grupos a menos de ${Math.round(radioKm)} km.`, true);
  return grupos;
}
