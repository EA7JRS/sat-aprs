// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Piezas comunes de las pantallas de servicios de Radio (Direwolf, aprx, Winlink).
import React from 'react';
import { Tarjeta } from '../shell/Etiquetas';

const dos = (n: number) => String(n).padStart(2, '0');
export const horaSeg = (ms: number) => { const d = new Date(ms); return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`; };
export const horaMin = (ms: number) => { const d = new Date(ms); return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`; };

export function duracion(desde: number, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - desde) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function Estado({ titulo, ok, texto, detalle, id }: { titulo: string; ok: boolean | null; texto: string; detalle: React.ReactNode; id: string }) {
  const color = ok === null ? 'text-slate-400' : ok ? 'text-emerald-400' : 'text-red-400';
  return (
    <Tarjeta className="flex-1 basis-56 min-w-0 flex flex-col gap-1" id={id}>
      <div className="text-xs text-slate-400">{titulo}</div>
      <div className={`text-[15px] font-semibold ${color}`}>● {texto}</div>
      <div className="text-[13px] text-slate-400 break-words">{detalle}</div>
    </Tarjeta>
  );
}

export function Cifra({ titulo, valor, detalle, color = 'text-slate-100', id }: { titulo: string; valor: string; detalle: string; color?: string; id?: string }) {
  return (
    <Tarjeta className="flex-1 basis-40 min-w-0 flex flex-col gap-0.5" id={id}>
      <div className="text-xs text-slate-400">{titulo}</div>
      <div className={`font-mono text-3xl leading-tight ${color}`}>{valor}</div>
      <div className="text-[13px] text-slate-400">{detalle}</div>
    </Tarjeta>
  );
}


/** Gráfica de barras por minuto de la última hora, con dos series apiladas. */
export function GraficaMinutos({ minutos, etiquetas, id }: {
  minutos: Array<{ minuto: number; a: number; b: number }>; etiquetas: [string, string]; id?: string;
}) {
  const max = Math.max(1, ...minutos.map((m) => m.a + m.b));
  const total = (k: 'a' | 'b') => minutos.reduce((s, m) => s + m[k], 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 text-[13px] text-slate-300 justify-end">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />{etiquetas[0]}</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300" />{etiquetas[1]}</span>
      </div>
      <div role="img" aria-label={`Por minuto en la última hora: ${total('a')} ${etiquetas[0].toLowerCase()} y ${total('b')} ${etiquetas[1].toLowerCase()}`} className="flex items-end gap-[2px] h-24 border-b border-slate-800" id={id}>
        {minutos.map((m) => (
          <div key={m.minuto} className="flex-1 h-full flex flex-col justify-end gap-px" title={`${horaMin(m.minuto)} UTC · ${m.a} ${etiquetas[0].toLowerCase()}, ${m.b} ${etiquetas[1].toLowerCase()}`}>
            {m.b > 0 && <span className="bg-amber-300 rounded-[1px]" style={{ height: `${(m.b / max) * 100}%` }} />}
            {m.a > 0 && <span className="bg-sky-500 rounded-[1px]" style={{ height: `${(m.a / max) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="flex justify-between font-mono text-xs text-slate-400">
        {[0, 15, 30, 45, 59].map((i) => <span key={i}>{horaMin(minutos[i].minuto)}</span>)}
      </div>
    </div>
  );
}
