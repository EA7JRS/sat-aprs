// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Sección del mapa. El visor con capas está pendiente; mientras tanto se dice
// con claridad qué mostrará y dónde están hoy los datos con coordenadas.
import React from 'react';
import { Pantalla } from '../navigation';
import { Tarjeta } from '../components/shell/Etiquetas';

const CAPAS = [
  ['Avisos', 'Sismos y zonas con aviso de AEMET'],
  ['APRS', 'Estaciones y objetos recibidos por RF y APRS-IS'],
  ['AIS', 'Embarcaciones (AIS-catcher, AISHub)'],
  ['ADS-B', 'Aeronaves (readsb)'],
  ['Tráfico', 'Incidencias de carreteras'],
];

export default function Mapa({ onIr }: { onIr: (p: Pantalla) => void }) {
  return (
    <div className="flex flex-col gap-4" id="pagina-mapa">
      <h1 className="text-2xl font-semibold text-slate-100">Mapa</h1>
      <Tarjeta className="flex flex-col gap-3">
        <p className="text-slate-200">El mapa con capas todavía no está hecho. Mostrará, sobre un mapa base, todo lo que llega con coordenadas; nada de ello se retransmite.</p>
        <ul className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {CAPAS.map(([nombre, texto]) => (
            <li key={nombre} className="border border-slate-800 rounded-lg px-3 py-2.5">
              <div className="font-semibold text-slate-100">{nombre}</div>
              <div className="text-[13px] text-slate-400">{texto}</div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-400">
          Por ahora, los datos con posición se consultan en sus listas:{' '}
          <button type="button" className="text-sky-400 font-semibold cursor-pointer" onClick={() => onIr('dgt')}>Tráfico</button>
          {' y '}
          <button type="button" className="text-sky-400 font-semibold cursor-pointer" onClick={() => onIr('portus')}>Boyas</button>.
        </p>
      </Tarjeta>
    </div>
  );
}
