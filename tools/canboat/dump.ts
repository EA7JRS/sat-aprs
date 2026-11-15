// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
// Para tools/canboat/run.sh: escribe las tramas NMEA 2000 de nuestros codificadores con los valores que deben llevar
// (una línea JSON por PGN); tools/canboat/canboat_check.py las decodifica con las definiciones de CANboat.
import {
  latLonRapida, cogSogRapida, horaSistema, viento, presion, temperaturaExt, xte, datosNav, mensajeSeguridadAis,
} from '../../server/conectividad/nmea2000';

const hex = (a: Uint8Array) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
const out = (pgn: number, a: Uint8Array, expect: Record<string, number | null>) =>
  console.log(JSON.stringify({ pgn, hex: hex(a), expect }));

out(129025, latLonRapida(36.5298765, -6.2912345), { Latitude: 36.5298765, Longitude: -6.2912345 });
out(129026, cogSogRapida(5, 1.2345, 3.21), { SID: 5, 'COG Reference': 0, COG: 1.2345, SOG: 3.21 });
out(126992, horaSistema(8, 20772 * 86400 + 45296.5), { SID: 8, Source: 0, Date: 20772, Time: 45296.5 });
out(130306, viento(2, 9.87, 4.3210, 0), { SID: 2, 'Wind Speed': 9.87, 'Wind Angle': 4.321, Reference: 0 });
out(130314, presion(3, 101325.4), { SID: 3, Instance: 0, Source: 0, Pressure: 101325.4 });
out(130316, temperaturaExt(4, 291.652), { SID: 4, Instance: 0, Source: 0, Temperature: 291.652, 'Set Temperature': null });
out(129283, xte(6, -42.37, false), { SID: 6, 'XTE mode': 0, 'Navigation Terminated': 0, XTE: -42.37 });
out(129284, datosNav(9, {
  distanciaM: 18520, demoraOrigenDestinoRad: 1.2345, demoraPosicionDestinoRad: 1.2001, wpOrigen: 4, wpDestino: 5,
  destLat: 36.5412345, destLon: -6.2987654, velAcercamientoMs: 2.57, enLlegada: true, loxodromica: true,
}), {
  SID: 9, 'Distance to Waypoint': 18520, 'Course/Bearing reference': 0, 'Perpendicular Crossed': 0, 'Arrival Circle Entered': 1,
  'Calculation Type': 1, 'Bearing, Origin to Destination Waypoint': 1.2345, 'Bearing, Position to Destination Waypoint': 1.2001,
  'Origin Waypoint Number': 4, 'Destination Waypoint Number': 5, 'Destination Latitude': 36.5412345,
  'Destination Longitude': -6.2987654, 'Waypoint Closing Velocity': 2.57,
});
out(129802, mensajeSeguridadAis(224123456, 0, 'AVISO ROJO'), { 'Message ID': 14, 'Repeat Indicator': 0, 'Source ID': 224123456, 'AIS Transceiver information': 0 });
