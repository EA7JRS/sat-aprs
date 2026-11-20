// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · Consola de comandos de Radio · Principal.
//
// Todo lo que hacen los paneles también se puede escribir: «módulo orden
// argumentos». Aquí está la lectura de la línea y la ayuda; quien ejecuta es
// el servidor, con las mismas funciones (y la misma política de emisión) que
// los botones. Los nombres siguen, donde existen, los del rotor, el Display y
// la app APRS LoRa+ (pos, stop, park, follow, ping/pong, EAI...).

export interface Orden { modulo: string; accion: string; args: string[]; resto: string }

export const AYUDA: Record<string, { titulo: string; ordenes: Array<[string, string]> }> = {
  cat: {
    titulo: 'Equipo por CAT (rigctld)',
    ordenes: [
      ['cat get', 'frecuencia, modo, VFO, PTT y S-meter'],
      ['cat f <frecuencia>', 'sintoniza: 14205 (kHz), 14.205 (MHz) o 14205000 (Hz)'],
      ['cat m <modo>', 'USB, LSB, CW, CWR, AM, FM, RTTY, PKTUSB…'],
      ['cat vfo a|b', 'cambia de VFO'],
      ['cat ptt on|off', 'emite o suelta (se suelta solo a los 3 min)'],
    ],
  },
  rot: {
    titulo: 'Rotor (rotctld o caja APRS LoRa+ Rotor)',
    ordenes: [
      ['rot get', 'acimut, elevación, objetivo y seguimiento'],
      ['rot pos <az> [el]', 'va a ese acimut (verdadero) y elevación'],
      ['rot stop · rot park', 'para · aparca (también deja de seguir)'],
      ['rot follow aprs|barco|avion <id>', 'sigue a una estación, un barco (MMSI o nombre) o una aeronave'],
      ['rot follow sat <NORAD|nombre>', 'sigue a un satélite'],
      ['rot follow sol|luna|ultima', 'sol, luna o la última estación oída por radio'],
      ['rot unfollow', 'deja de seguir'],
    ],
  },
  dx: {
    titulo: 'Cluster DX',
    ordenes: [
      ['dx spots [n]', 'últimos spots con país, rumbo y distancia'],
      ['dx go <n>', 'sintoniza el equipo y gira el rotor al spot n'],
      ['dx <orden del nodo>', 'pasa la orden al nodo: dx sh/dx 10 on 20m, dx sh/wwv, dx dx 14205 EA7XYZ 59'],
    ],
  },
  aprs: {
    titulo: 'APRS (por la cola de emisión)',
    ordenes: [
      ['aprs msg <indicativo> <texto>', 'mensaje con acuse (67 caracteres)'],
      ['aprs bln <n> <texto>', 'boletín BLNn'],
      ['aprs beacon', 'emite ahora la baliza de la estación'],
      ['aprs heard [n]', 'últimas estaciones oídas por radio'],
    ],
  },
  dapnet: {
    titulo: 'DAPNET (buscapersonas)',
    ordenes: [
      ['dapnet send <ind[,ind]> <texto>', 'mensaje (80 caracteres) al grupo de transmisores configurado'],
      ['dapnet emerg <ind[,ind]> <texto>', 'igual, con prioridad de emergencia'],
    ],
  },
  sat: {
    titulo: 'Satélites',
    ordenes: [
      ['sat list', 'favoritos: dónde están y su próximo paso'],
      ['sat next <NORAD|nombre>', 'próximo paso de un satélite'],
      ['sat tx <NORAD|nombre>', 'sus transmisores, numerados'],
      ['sat doppler <NORAD|nombre> [n]', 'el equipo sigue el Doppler del transmisor n durante el paso'],
      ['sat doppler stop', 'deja de corregir'],
    ],
  },
  arts: {
    titulo: 'Grupo de estaciones (ARTS)',
    ordenes: [
      ['arts list', 'estado de cada miembro'],
      ['arts poll', '«ping» a todo el grupo'],
      ['arts add|del <indicativo>', 'añade o quita un miembro (hasta 5)'],
      ['arts on|off', 'enciende o apaga la vigilancia'],
    ],
  },
  eai: {
    titulo: 'Emergencia remota',
    ordenes: [['eai <indicativo> <código> [stop]', 'activa (o para) la emergencia en un tracker del grupo']],
  },
  n2k: {
    titulo: 'NMEA 2000 (Conectividad)',
    ordenes: [['n2k estado', 'bus, interfaz y dirección'], ['n2k on|off', 'enciende o apaga la salida al bus']],
  },
};

/** Órdenes que mueven, emiten o cambian algo: piden confirmación en la consola. */
export function pideConfirmacion(o: Orden): boolean {
  // En «eai <indicativo> <código> [stop]» la acción es el indicativo
  return (o.modulo === 'cat' && o.accion === 'ptt' && o.args[0]?.toLowerCase() === 'on') || (o.modulo === 'eai' && o.args[1]?.toLowerCase() !== 'stop');
}

/** Separa la línea en módulo, acción y argumentos. Null si está vacía. */
export function leerOrden(linea: string): Orden | null {
  const limpia = String(linea ?? '').replace(/[\r\n\x00-\x1f]/g, ' ').trim().slice(0, 300);
  if (!limpia) return null;
  const [modulo = '', accion = '', ...args] = limpia.split(/\s+/);
  // «resto» conserva el texto tal cual tras la acción (mensajes con espacios, órdenes al cluster)
  const tras = limpia.slice(limpia.indexOf(modulo) + modulo.length).trimStart();
  const resto = tras.slice(accion.length).trimStart();
  return { modulo: modulo.toLowerCase(), accion: accion.toLowerCase(), args, resto };
}

/**
 * Frecuencia escrita a mano a hercios: con punto o coma decimal son MHz
 * (14.205), un número menor de 1 000 000 son kHz (14205, 145825) y uno mayor
 * son Hz (14205000).
 */
export function frecuenciaHz(texto: string): number | null {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (t.includes('.')) return Math.round(n * 1e6);
  return n < 1_000_000 ? Math.round(n * 1000) : Math.round(n);
}

export function textoAyuda(modulo?: string): string[] {
  const m = modulo?.toLowerCase();
  if (m && AYUDA[m]) return [AYUDA[m].titulo, ...AYUDA[m].ordenes.map(([o, d]) => `  ${o.padEnd(34)} ${d}`)];
  return [
    'Escribe «módulo orden». Módulos: ' + Object.keys(AYUDA).join(', ') + '.',
    '«help <módulo>» muestra sus órdenes. Lo que mueve o emite respeta la política de emisión.',
  ];
}
