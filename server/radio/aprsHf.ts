// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS+ · APRS de onda corta (300 baudios) recibido con un KiwiSDR.
//
// El sonido del KiwiSDR se entrega por la entrada estándar a un segundo Direwolf, que solo escucha: no tiene
// PTT ni salida de sonido, así que no puede emitir. Sus tramas salen por un puerto KISS propio.
//
// Frecuencias habituales: 10 147,6 kHz en banda lateral superior (30 m) y 14 105 kHz en la inferior (20 m),
// con tonos de 1600 y 1800 Hz.

export interface AjustesAprsHf { khz: number; banda: 'usb' | 'lsb'; puertoKiss: number }

export const APRS_HF_DE_SERIE: AjustesAprsHf = { khz: 10147.6, banda: 'usb', puertoKiss: 8011 };

/** La configuración del Direwolf que escucha: sonido por la entrada estándar, sin emisión, KISS en su propio puerto. */
export function confDirewolfHf(indicativo: string, ritmo: number, puertoKiss: number): string {
  const yo = /^[A-Z0-9]{3,6}(-\d{1,2})?$/.test(indicativo.trim().toUpperCase()) ? indicativo.trim().toUpperCase() : 'N0CALL';
  return [
    '# Generado por S.A.T.-APRS+: APRS de onda corta recibido con un KiwiSDR. Solo escucha.',
    'ADEVICE stdin null',
    `ARATE ${Math.round(ritmo)}`,
    'ACHANNELS 1',
    'CHANNEL 0',
    `MYCALL ${yo}`,
    // siete descodificadores separados 30 Hz: una estación fuera de frecuencia también se lee
    'MODEM 300 1600:1800 7@30',
    'AGWPORT 0',
    'KISSPORT 0',                 // sin el puerto de serie (8001), que es del Direwolf de VHF
    `KISSPORT ${puertoKiss}`,
    '',
  ].join('\n');
}

/** Los argumentos de ese Direwolf. */
export function argsDirewolfHf(rutaConf: string, ritmo: number): string[] {
  return ['-c', rutaConf, '-r', String(Math.round(ritmo)), '-n', '1', '-b', '16', '-t', '0', '-q', 'hd', '-'];
}

/** Saca las tramas KISS de datos de lo recibido; devuelve las tramas (AX.25, sin escapes) y lo que queda por completar. */
export function tramasKiss(buf: Buffer): { tramas: Buffer[]; resto: Buffer } {
  const tramas: Buffer[] = [];
  let b = buf;
  for (;;) {
    const a = b.indexOf(0xc0);
    if (a < 0) return { tramas, resto: b.length > 4096 ? Buffer.alloc(0) : b };
    const z = b.indexOf(0xc0, a + 1);
    if (z < 0) return { tramas, resto: b.subarray(a) };
    const t = b.subarray(a + 1, z);
    b = b.subarray(z);                                   // el cierre de una vale de comienzo de la siguiente
    if (t.length > 1 && (t[0] & 0x0f) === 0) {
      const fuera: number[] = [];
      for (let i = 1; i < t.length; i++) {
        if (t[i] === 0xdb && i + 1 < t.length) { fuera.push(t[i + 1] === 0xdc ? 0xc0 : t[i + 1] === 0xdd ? 0xdb : t[i + 1]); i++; }
        else fuera.push(t[i]);
      }
      tramas.push(Buffer.from(fuera));
    }
  }
}

/** La frecuencia del dial que equivale en la otra banda lateral (los tonos caen en el mismo sitio del aire). */
export function centroAprsHf(a: AjustesAprsHf): number {
  return a.banda === 'usb' ? a.khz + 1.7 : a.khz - 1.7;
}
