// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Primitivas del protocolo APRS / AX.25 / KISS para la consola.
// Funciones puras (sin red ni estado) para poder probarlas de forma aislada.

/** Destino (TOCALL). «APZxxx» es el rango reservado a software experimental. */
export const TOCALL = 'APZSAT';
/** Ruta que se anuncia a APRS-IS: el servidor añade su propia construcción «q». */
export const IS_PATH = 'TCPIP*';
export const DEFAULT_RF_PATH = 'WIDE1-1,WIDE2-1';

/** Indicativos de ejemplo/plantilla con los que nunca se debe transmitir. */
const PLACEHOLDER_CALLSIGNS = new Set([
  'N0CALL', 'NOCALL', 'MYCALL', 'CALL', 'CALLSI', 'CALLSING', 'CALLSIGN',
  'EA1URG', // indicativo de ejemplo usado en la documentación del proyecto
]);

/** Destinos genéricos o ajenos que se sustituyen por el TOCALL del proyecto. */
const GENERIC_TOCALLS = new Set(['APRS', 'APXSAT']);

const CALL_RE = /^([A-Z0-9]{1,6})(?:-([0-9]|1[0-5]))?$/;
/** Elementos de ruta propios de APRS-IS (TCPIP*, TCPXX*, construcciones qAx). */
const INTERNET_PATH_RE = /^(TCPIP\*?|TCPXX\*?|q[A-Za-z]{2})$/;

export interface Tnc2Packet {
  source: string;
  destination: string;
  path: string[];
  info: string;
}

export function splitCallsign(callsign: string | undefined | null): { base: string; ssid: number } | null {
  if (!callsign) return null;
  const m = CALL_RE.exec(String(callsign).trim().toUpperCase());
  if (!m) return null;
  return { base: m[1], ssid: m[2] ? parseInt(m[2], 10) : 0 };
}

/**
 * Indicativo apto para transmitir: formato AX.25 (base de 3 a 6 caracteres con
 * al menos una letra y una cifra, SSID 0-15) y que no sea uno de plantilla.
 */
export function isValidCallsign(callsign: string | undefined | null): boolean {
  const parts = splitCallsign(callsign);
  if (!parts) return false;
  const { base } = parts;
  if (base.length < 3 || PLACEHOLDER_CALLSIGNS.has(base)) return false;
  return /[0-9]/.test(base) && /[A-Z]/.test(base);
}

/** Passcode de APRS-IS que corresponde al indicativo (se ignora el SSID). */
export function aprsPasscode(callsign: string): number {
  const base = String(callsign).trim().toUpperCase().split('-')[0];
  let code = 0x73e2;
  for (let i = 0; i < base.length; i++) {
    code ^= base.charCodeAt(i) << (i % 2 === 0 ? 8 : 0);
  }
  return code & 0x7fff;
}

export function passcodeMatches(callsign: string, passcode: string | number | undefined | null): boolean {
  const text = String(passcode ?? '').trim();
  if (!/^\d+$/.test(text)) return false;
  return parseInt(text, 10) === aprsPasscode(callsign);
}

/**
 * Reduce un texto a ASCII imprimible (sin tildes ni emojis). No colapsa los
 * espacios: los campos de ancho fijo de APRS (destinatarios, nombres de objeto)
 * dependen de ellos.
 */
export function toAscii(text: string): string {
  return String(text ?? '')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N').replace(/[º°]/g, 'o')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '');
}

function degMin(value: number, degDigits: number, maxDeg: number): string {
  const clamped = Math.min(Math.abs(value), maxDeg);
  const hundredths = Math.round(clamped * 6000); // centésimas de minuto
  const deg = Math.floor(hundredths / 6000);
  const rem = hundredths % 6000;
  const min = Math.floor(rem / 100).toString().padStart(2, '0');
  const frac = (rem % 100).toString().padStart(2, '0');
  return `${deg.toString().padStart(degDigits, '0')}${min}.${frac}`;
}

/** Latitud decimal -> «DDMM.hhN», redondeando sin producir nunca «60.00». */
export function latToAprs(lat: number): string {
  return degMin(lat, 2, 90) + (lat >= 0 ? 'N' : 'S');
}

/** Longitud decimal -> «DDDMM.hhW». */
export function lonToAprs(lon: number): string {
  return degMin(lon, 3, 180) + (lon >= 0 ? 'E' : 'W');
}

/** Descompone una trama TNC2 «ORIGEN>DESTINO,RUTA:info». */
export function parseTnc2(packet: string): Tnc2Packet | null {
  const m = /^([^>\s]+)>([^,:\s]+)((?:,[^,:\s]+)*):([\s\S]+)$/.exec(String(packet ?? ''));
  if (!m) return null;
  return {
    source: m[1].toUpperCase(),
    destination: m[2].toUpperCase(),
    path: m[3] ? m[3].slice(1).split(',') : [],
    info: m[4],
  };
}

function normalizedDestination(destination: string): string {
  return GENERIC_TOCALLS.has(destination) ? TOCALL : destination;
}

/** Longitud máxima del texto de un mensaje o boletín APRS. */
export const MAX_MESSAGE_TEXT = 67;

/**
 * Campo de información listo para emitir: en ASCII y, si es un mensaje o
 * boletín («:DESTINAT.:texto»), con el texto recortado a los 67 caracteres
 * que admite el protocolo (lo que sobra no lo muestra ningún receptor).
 */
export function normalizeInfo(info: string): string {
  const ascii = toAscii(info);
  const m = /^(:[^:]{9}:)(.*)$/s.exec(ascii);
  if (!m) return ascii;
  return m[1] + m[2].slice(0, MAX_MESSAGE_TEXT).trimEnd();
}

/** Trama para APRS-IS: siempre «ORIGEN>DESTINO,TCPIP*:info» en ASCII. */
export function toIsPacket(packet: Tnc2Packet): string {
  return `${packet.source}>${normalizedDestination(packet.destination)},${IS_PATH}:${normalizeInfo(packet.info)}`;
}

/**
 * Ruta de RF de una trama: los repetidores AX.25 que ya lleve (sin los
 * elementos de Internet) o, si no lleva ninguno, la ruta por defecto.
 */
export function rfPathFor(packet: Tnc2Packet, defaultPath: string = DEFAULT_RF_PATH): string[] {
  const own = packet.path.filter((p) => !INTERNET_PATH_RE.test(p) && splitCallsign(p.replace(/\*$/, '')));
  if (own.length > 0 && own.length === packet.path.filter((p) => !INTERNET_PATH_RE.test(p)).length) {
    return own;
  }
  return defaultPath.split(',').map((p) => p.trim()).filter(Boolean);
}

function encodeAddress(callsign: string, last: boolean, repeated = false): Buffer {
  const parts = splitCallsign(callsign);
  if (!parts) throw new Error(`Dirección AX.25 no válida: ${callsign}`);
  const buf = Buffer.alloc(7);
  const padded = parts.base.padEnd(6, ' ');
  for (let i = 0; i < 6; i++) buf[i] = padded.charCodeAt(i) << 1;
  buf[6] = 0x60 | (parts.ssid << 1) | (repeated ? 0x80 : 0) | (last ? 0x01 : 0);
  return buf;
}

/**
 * Codifica una trama AX.25 UI (control 0x03, PID 0xF0). Lanza un error si
 * alguna dirección no es AX.25 válida, de modo que nunca se emite por RF una
 * ruta de Internet como «TCPIP*» o «qAC».
 */
export function encodeAx25Ui(source: string, destination: string, path: string[], info: string): Buffer {
  if (path.length > 8) throw new Error('AX.25 admite un máximo de 8 repetidores');
  for (const digi of path) {
    if (INTERNET_PATH_RE.test(digi)) throw new Error(`«${digi}» es una ruta de Internet y no puede emitirse por RF`);
  }
  const payload = Buffer.from(toAscii(info), 'ascii');
  if (payload.length === 0) throw new Error('El campo de información está vacío');
  if (payload.length > 256) throw new Error('El campo de información supera los 256 bytes');

  const parts: Buffer[] = [
    encodeAddress(destination, false),
    encodeAddress(source, path.length === 0),
  ];
  path.forEach((digi, i) => {
    parts.push(encodeAddress(digi.replace(/\*$/, ''), i === path.length - 1, digi.endsWith('*')));
  });
  parts.push(Buffer.from([0x03, 0xf0]), payload);
  return Buffer.concat(parts);
}

/** Trama AX.25 lista para RF a partir de una trama TNC2. */
export function toRfFrame(packet: Tnc2Packet, defaultPath: string = DEFAULT_RF_PATH): Buffer {
  return encodeAx25Ui(packet.source, normalizedDestination(packet.destination), rfPathFor(packet, defaultPath), normalizeInfo(packet.info));
}

/** Encapsula una trama AX.25 en KISS (comando de datos) con su escapado. */
export function kissEncode(frame: Buffer, port = 0): Buffer {
  const out: number[] = [0xc0, (port & 0x0f) << 4];
  for (const b of frame) {
    if (b === 0xc0) out.push(0xdb, 0xdc);
    else if (b === 0xdb) out.push(0xdb, 0xdd);
    else out.push(b);
  }
  out.push(0xc0);
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// Política de emisión
// ---------------------------------------------------------------------------
export interface TxContext {
  /** Interruptor maestro (SAT_APRS_TX=on). Apagado, la consola no emite nada. */
  txEnabled: boolean;
  callsign: string;
  passcode: string | number | undefined | null;
  /** La trama procede de datos simulados, de prueba o modelados. */
  simulated?: boolean;
}

export interface TxDecision {
  /** Se puede inyectar en APRS-IS. */
  aprsIs: boolean;
  /** Se puede emitir por RF. */
  rf: boolean;
  /** Motivo por el que no se emite (total o parcialmente), para el registro. */
  reason: string;
  packet: Tnc2Packet | null;
}

/**
 * Decide si una trama puede salir al aire. Las reglas, por orden:
 *  1. La emisión debe estar activada expresamente.
 *  2. Los datos simulados o de prueba no se emiten jamás.
 *  3. La trama debe ser TNC2 válida y su origen, el indicativo de la estación.
 *  4. El indicativo debe ser real (no uno de plantilla).
 *  5. En APRS-IS, además, el passcode debe corresponder al indicativo.
 */
export function decideTransmission(rawPacket: string, ctx: TxContext): TxDecision {
  const blocked = (reason: string, packet: Tnc2Packet | null = null): TxDecision => ({ aprsIs: false, rf: false, reason, packet });

  if (!ctx.txEnabled) return blocked('emisión desactivada (SAT_APRS_TX=on para activarla)');
  if (ctx.simulated) return blocked('datos simulados o de prueba');

  const packet = parseTnc2(rawPacket);
  if (!packet) return blocked('la trama no tiene formato TNC2');
  if (!isValidCallsign(ctx.callsign)) return blocked(`indicativo no válido o de plantilla (${ctx.callsign})`, packet);
  if (packet.source !== String(ctx.callsign).trim().toUpperCase()) {
    return blocked(`el origen de la trama (${packet.source}) no es el indicativo de la estación`, packet);
  }

  const aprsIs = passcodeMatches(ctx.callsign, ctx.passcode);
  return {
    aprsIs,
    rf: true,
    reason: aprsIs ? '' : 'el passcode no corresponde al indicativo: solo RF',
    packet,
  };
}
