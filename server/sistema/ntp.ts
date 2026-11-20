// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Estado real del servidor de hora (ntpsec).
//
// La estación es además el servidor NTP de la red, disciplinado por el GPS
// (gpsd + PPS). Aquí se consulta el estado real con `ntpq`; si no se puede
// leer, se dice claramente que no hay sincronización comprobada: nunca se
// muestra un «Stratum 1» que no se haya verificado.

import { execFile } from 'child_process';

export interface EstadoNtp {
  stratum: number;
  offsetMs: number;
  delayMs: number;
  jitterMs: number;
  peer: string;
  status: 'synchronized' | 'unsynchronized' | 'hold';
}

export const NTP_SIN_DATOS: EstadoNtp = {
  stratum: 16,
  offsetMs: 0,
  delayMs: 0,
  jitterMs: 0,
  peer: 'ntpsec no disponible',
  status: 'unsynchronized',
};

/** Variables del sistema de `ntpq -c rv` («clave=valor, clave=valor...»). */
export function leerVariables(salida: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of salida.matchAll(/([a-z_]+)=("[^"]*"|[^,\s]+)/gi)) {
    vars[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, '');
  }
  return vars;
}

export interface ParNtp { marca: string; remoto: string; refid: string; stratum: number; alcance: number; delayMs: number; offsetMs: number; jitterMs: number }

/** Tabla de pares de `ntpq -pn`. La marca inicial indica el papel: «o» PPS, «*» par del sistema. */
export function leerPares(salida: string): ParNtp[] {
  const pares: ParNtp[] = [];
  for (const linea of salida.split('\n')) {
    const m = /^([ x.\-+#*o])(\S+)\s+(\S+)\s+(\d+)\s+\S\s+\S+\s+\S+\s+([0-7]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(linea);
    if (!m) continue;
    pares.push({
      marca: m[1], remoto: m[2], refid: m[3].replace(/^\.|\.$/g, ''), stratum: parseInt(m[4], 10),
      alcance: parseInt(m[5], 8), delayMs: parseFloat(m[6]), offsetMs: parseFloat(m[7]), jitterMs: parseFloat(m[8]),
    });
  }
  return pares;
}

/** Combina las dos salidas de ntpq en el estado que muestra la consola. */
export function interpretarNtp(salidaRv: string, salidaPares: string): EstadoNtp {
  const vars = leerVariables(salidaRv);
  const pares = leerPares(salidaPares);
  const elegido = pares.find((p) => p.marca === 'o') || pares.find((p) => p.marca === '*');

  const stratum = parseInt(vars.stratum ?? '', 10);
  const leap = vars.leap ?? '';
  if (!Number.isFinite(stratum)) return NTP_SIN_DATOS;

  // leap=11 (o stratum 16) significa «reloj sin sincronizar»
  const sincronizado = stratum < 16 && leap !== '11' && leap !== '3' && !!elegido;
  const numero = (texto: string | undefined, alternativa: number) => {
    const n = parseFloat(texto ?? '');
    return Number.isFinite(n) ? n : alternativa;
  };
  return {
    stratum,
    offsetMs: numero(vars.offset, elegido?.offsetMs ?? 0),
    delayMs: elegido?.delayMs ?? numero(vars.rootdelay, 0),
    jitterMs: numero(vars.sys_jitter, elegido?.jitterMs ?? 0),
    peer: elegido ? `${elegido.remoto} (${elegido.refid})` : 'sin par seleccionado',
    status: sincronizado ? 'synchronized' : pares.length > 0 ? 'hold' : 'unsynchronized',
  };
}

function ntpq(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ntpq', args, { timeout: 4000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

/** Consulta ntpsec. Si `ntpq` no está o no responde, devuelve «sin datos». */
export async function consultarNtp(): Promise<EstadoNtp> {
  try {
    const [rv, pares] = await Promise.all([ntpq(['-c', 'rv']), ntpq(['-pn'])]);
    return interpretarNtp(rv, pares);
  } catch {
    return NTP_SIN_DATOS;
  }
}
