// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sistema · Equipo: los enlaces de la consola con los programas y equipos de
// la estación, tal como están ahora (de /api/enlaces). Cada fila dice si hay
// enlace, con qué, y qué ha pasado por él. Nada se rellena si no hay dato.
import React, { useEffect, useState } from 'react';
import { Tarjeta } from '../shell/Etiquetas';
import { customFetch } from '../../utils/customFetch';
import { haceCuanto } from '../../utils/useAvisos';

type Fila = { nombre: string; ok: boolean | null; estado: string; destino: string; detalle: string };

function filas(e: any, ahora: number): Fila[] {
  if (!e) return [];
  const f: Fila[] = [];
  const isOk = e.aprsIs?.estado === 'conectado' || e.aprsIs?.estado === 'solo-recepcion';
  f.push({
    nombre: 'APRS-IS', ok: e.aprsIs?.estado === 'parado' ? null : isOk,
    estado: { conectado: 'Conectado', 'solo-recepcion': 'Solo recepción', conectando: 'Conectando', desconectado: 'Desconectado', parado: 'Parado' }[e.aprsIs?.estado as string] ?? String(e.aprsIs?.estado ?? '—'),
    destino: e.aprsIs?.detalle || '—', detalle: `${e.aprsIs?.recibidas ?? 0} tramas recibidas${e.aprsIs?.desde ? ` · desde ${haceCuanto(e.aprsIs.desde, ahora)}` : ''}`,
  });
  f.push({ nombre: 'Direwolf (KISS)', ok: !!e.kiss?.conectado, estado: e.kiss?.conectado ? 'Conectado' : 'Sin conexión', destino: `127.0.0.1:${e.kiss?.puerto ?? '—'}`, detalle: `${e.estacionesOidas ?? 0} estaciones y objetos oídos` });
  const g = e.gpsd;
  if (g) {
    const fijo = g.modo >= 3 ? 'Fijo 3D' : g.modo === 2 ? 'Fijo 2D' : 'Sin fijo';
    f.push({ nombre: 'gpsd', ok: g.conectado ? g.modo >= 2 : false, estado: g.conectado ? fijo : 'Sin conexión', destino: '127.0.0.1:2947', detalle: g.conectado ? `${g.satelites} de ${g.visibles} satélites${g.dispositivo ? ` · ${g.dispositivo}` : ''}${g.ultimo ? ` · último dato ${haceCuanto(g.ultimo, ahora)}` : ''}` : 'la posición es la de respaldo' });
  }
  if (e.ais) {
    const tcp = e.ais.tcp?.destino ? ` · TCP ${e.ais.tcp.destino} ${e.ais.tcp.estado}` : '';
    f.push({ nombre: 'AIS', ok: !e.ais.activo ? null : e.ais.udpEscuchando, estado: !e.ais.activo ? 'Apagado' : e.ais.udpEscuchando ? 'Escuchando' : 'Sin escucha', destino: `UDP ${e.ais.udpPuerto ?? '—'}${tcp}`, detalle: e.ais.udpError || `${e.ais.sentencias ?? 0} sentencias · ${e.ais.barcos ?? 0} barcos` });
  }
  if (e.adsb) f.push({ nombre: 'ADS-B', ok: !e.adsb.activo ? null : e.adsb.estado === 'conectado', estado: !e.adsb.activo ? 'Apagado' : ({ conectado: 'Conectado', conectando: 'Conectando', desconectado: 'Sin conexión', parado: 'Parado' } as Record<string, string>)[e.adsb.estado] ?? e.adsb.estado, destino: e.adsb.destino || '—', detalle: e.adsb.detalle || `${e.adsb.mensajes ?? 0} mensajes · ${e.adsb.aeronaves ?? 0} aeronaves` });
  if (e.cat) f.push({ nombre: 'Equipo (rigctld)', ok: !e.cat.activo ? null : e.cat.enlace, estado: !e.cat.activo ? 'Sin configurar' : e.cat.enlace ? 'Conectado' : 'Sin enlace', destino: e.cat.destino, detalle: e.cat.error || e.cat.modelo || '—' });
  if (e.rotor) f.push({ nombre: e.rotor.modo === 'caja' ? 'Rotor (caja APRS LoRa+)' : 'Rotor (rotctld)', ok: !e.rotor.activo ? null : e.rotor.enlace, estado: !e.rotor.activo ? 'Sin configurar' : e.rotor.enlace ? 'Conectado' : 'Sin enlace', destino: e.rotor.destino, detalle: e.rotor.error || '—' });
  if (e.cluster) f.push({ nombre: 'Cluster DX', ok: !e.cluster.activo ? null : e.cluster.estado === 'conectado', estado: !e.cluster.activo ? 'Sin configurar' : e.cluster.estado, destino: e.cluster.activo ? (e.cluster.destino || '—') : '—', detalle: `${e.cluster.spots ?? 0} spots` });
  if (e.pat) f.push({ nombre: 'Pat (Winlink)', ok: e.pat.alcanzable, estado: e.pat.alcanzable ? (e.pat.conectado ? 'En sesión' : 'Contesta') : 'No contesta', destino: e.pat.url, detalle: e.pat.error || '—' });
  if (e.nmea2000) f.push({ nombre: 'NMEA 2000', ok: !e.nmea2000.activo ? null : !e.nmea2000.error && e.nmea2000.direccion >= 0, estado: !e.nmea2000.activo ? 'Apagado' : e.nmea2000.error ? 'Error' : 'En el bus', destino: e.nmea2000.interfaz || '—', detalle: e.nmea2000.error || (e.nmea2000.direccion >= 0 ? `dirección ${e.nmea2000.direccion}` : '—') });
  return f;
}

export default function EnlacesEquipo() {
  const [e, setE] = useState<any>(null);
  const [error, setError] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/enlaces').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (vivo) { setE(j); setError(false); setAhora(Date.now()); } }).catch(() => { if (vivo) setError(true); });
    leer();
    const t = setInterval(leer, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const lista = filas(e, ahora);
  const conEnlace = lista.filter((f) => f.ok === true).length;
  const conFallo = lista.filter((f) => f.ok === false).length;
  return (
    <Tarjeta aria-label="Enlaces de la estación" className="flex flex-col gap-3" id="enlaces-equipo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Enlaces de la estación</h2>
        {e && <span className="text-sm text-slate-400">{conEnlace} con enlace · {conFallo} sin enlace · se actualiza cada 5 s</span>}
      </div>
      {!e ? <p className="text-sm text-slate-400">{error ? 'No se pudo consultar la consola.' : 'Consultando…'}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" id="enlaces-tabla">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="font-normal py-1 pr-3">Enlace</th><th className="font-normal py-1 pr-3">Estado</th><th className="font-normal py-1 pr-3">Con</th><th className="font-normal py-1">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.nombre} className="border-t border-slate-800 align-top">
                  <td className="py-2 pr-3 font-semibold text-slate-100 whitespace-nowrap">{f.nombre}</td>
                  <td className={`py-2 pr-3 whitespace-nowrap font-semibold ${f.ok === null ? 'text-slate-400' : f.ok ? 'text-emerald-400' : 'text-red-400'}`}>● {f.estado}</td>
                  <td className="py-2 pr-3 font-mono text-slate-300 break-all">{f.destino}</td>
                  <td className="py-2 text-slate-300 break-words">{f.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[13px] text-slate-400">Los enlaces se ajustan en su pantalla: Radio → Principal (equipo, rotor, cluster), Radio → Winlink, Sistema → Conectividad (NMEA 2000) y Sistema → Configuración (APRS-IS, KISS, AIS, ADS-B).</p>
    </Tarjeta>
  );
}
