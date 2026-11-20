// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Primera posición escrita en un aviso náutico.
//
// Los radioavisos (NAVTEX, SafetyNET) dan las posiciones en texto, casi
// siempre como grados y minutos: «36-05.2N 005-21.0W», «36 05N 005 21W»,
// «3605.2N 00521.0W», «36°05'N 005°21'W». Se toma la primera; si no hay
// ninguna, el aviso no tiene posición (y no se inventa).

export interface Punto { lat: number; lon: number }

const SEP = String.raw`[-\s°º]*`;
const MIN = String.raw`(\d{1,2}(?:[.,]\d+)?)\s*['’′]?`;
const RE = new RegExp(
  String.raw`(?<![\d.])(\d{1,2})${SEP}${MIN}\s*([NS])[\s,/]*(\d{1,3})${SEP}${MIN}\s*([EW])(?![A-Z])`, 'i');
// Formato compacto sin separador: 3605.2N 00521.0W
const RE_PEGADO = /(?<![\d.])(\d{2})(\d{2}(?:[.,]\d+)?)\s*([NS])[\s,/]*(\d{3})(\d{2}(?:[.,]\d+)?)\s*([EW])(?![A-Z])/i;

export function posicionEnTexto(texto: string): Punto | null {
  const t = String(texto ?? '').toUpperCase();
  const m = RE_PEGADO.exec(t) ?? RE.exec(t);
  if (!m) return null;
  const n = (s: string) => Number(s.replace(',', '.'));
  const latG = n(m[1]); const latM = n(m[2]); const lonG = n(m[4]); const lonM = n(m[5]);
  if (latG > 90 || lonG > 180 || latM >= 60 || lonM >= 60) return null;
  const lat = (latG + latM / 60) * (m[3] === 'S' ? -1 : 1);
  const lon = (lonG + lonM / 60) * (m[6] === 'W' ? -1 : 1);
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
}
