// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Principal: consola de comandos. Todo lo de los paneles, escrito.
import React, { useEffect, useRef, useState } from 'react';
import { Tarjeta } from '../shell/Etiquetas';
import { customFetch } from '../../utils/customFetch';

interface Linea { cuando: number; texto: string; tipo: 'orden' | 'bien' | 'mal' }
type Ayuda = Record<string, { titulo: string; ordenes: Array<[string, string]> }>;

const dos = (n: number) => String(n).padStart(2, '0');
const hora = (ms: number) => { const d = new Date(ms); return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`; };

function leerGuardado<T>(clave: string, def: T): T {
  try { const v = localStorage.getItem(clave); return v ? (JSON.parse(v) as T) : def; } catch { return def; }
}
function guardar(clave: string, valor: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento: solo en memoria */ }
}

export default function ConsolaComandos({ admin }: { admin: boolean }) {
  const [lineas, setLineas] = useState<Linea[]>(() => leerGuardado<Linea[]>('sat-consola-lineas', []));
  const [historial, setHistorial] = useState<string[]>(() => leerGuardado<string[]>('sat-consola-historial', []));
  const [posicion, setPosicion] = useState<number | null>(null);
  const [orden, setOrden] = useState('');
  const [ocupada, setOcupada] = useState(false);
  const [ayuda, setAyuda] = useState<Ayuda | null>(null);
  const [verAyuda, setVerAyuda] = useState(false);
  const salida = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { customFetch('/api/radio/consola').then((r) => r.json()).then((j) => setAyuda(j.modulos)).catch(() => {}); }, []);
  useEffect(() => { guardar('sat-consola-lineas', lineas.slice(-200)); if (salida.current) salida.current.scrollTop = salida.current.scrollHeight; }, [lineas]);
  useEffect(() => { guardar('sat-consola-historial', historial.slice(-50)); }, [historial]);

  const anotar = (nuevas: Linea[]) => setLineas((l) => [...l, ...nuevas].slice(-200));

  const ejecutar = async (texto: string, confirmado = false) => {
    const t = texto.trim();
    if (!t) return;
    if (!confirmado) {
      anotar([{ cuando: Date.now(), texto: t, tipo: 'orden' }]);
      setHistorial((h) => [...h.filter((x) => x !== t), t].slice(-50));
    }
    setPosicion(null);
    setOrden('');
    if (/^(clear|cls|limpiar)$/i.test(t)) { setLineas([]); return; }
    setOcupada(true);
    try {
      const r = await customFetch('/api/radio/consola', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden: t, confirmado }) });
      const j = await r.json().catch(() => ({ ok: false, lineas: ['Respuesta no válida.'] }));
      if (j.confirmar && !confirmado) {
        setOcupada(false);
        if (window.confirm(`«${t}»: esta orden emite o activa una emergencia. ¿Ejecutarla?`)) return ejecutar(t, true);
        anotar([{ cuando: Date.now(), texto: 'Cancelada.', tipo: 'mal' }]);
        return;
      }
      anotar((j.lineas as string[] ?? []).map((texto) => ({ cuando: Date.now(), texto, tipo: j.ok ? 'bien' : 'mal' })));
    } catch {
      anotar([{ cuando: Date.now(), texto: 'Sin conexión con la consola.', tipo: 'mal' }]);
    }
    setOcupada(false);
    entrada.current?.focus();
  };

  const tecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && historial.length) {
      e.preventDefault();
      const p = posicion === null ? historial.length - 1 : Math.max(0, posicion - 1);
      setPosicion(p); setOrden(historial[p]);
    } else if (e.key === 'ArrowDown' && posicion !== null) {
      e.preventDefault();
      const p = posicion + 1;
      if (p >= historial.length) { setPosicion(null); setOrden(''); } else { setPosicion(p); setOrden(historial[p]); }
    }
  };

  if (!admin) {
    return (
      <Tarjeta aria-label="Consola de comandos" id="consola">
        <h2 className="text-lg font-semibold text-slate-100">Consola de comandos</h2>
        <p className="text-sm text-slate-400 mt-1">Solo para el administrador de la estación.</p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta aria-label="Consola de comandos" className="flex flex-col gap-3" id="consola">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Consola de comandos</h2>
          <span className="text-sm text-slate-400">lo mismo que los paneles, escrito · ↑ ↓ para el historial</span>
        </div>
        <div className="flex gap-4">
          <button type="button" className="text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer" aria-expanded={verAyuda} onClick={() => setVerAyuda((v) => !v)}>{verAyuda ? 'Ocultar órdenes' : 'Ver órdenes'}</button>
          <button type="button" className="text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer" onClick={() => setLineas([])}>Limpiar</button>
        </div>
      </div>

      <div ref={salida} id="consola-salida" role="log" aria-live="polite" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-[13px] leading-relaxed h-64 overflow-auto">
        {lineas.length === 0 && <div className="text-slate-500">Escribe «help» para empezar. Por ejemplo: rot follow sat ISS · dx spots · cat f 14205 · aprs msg EA7KZ-9 hola</div>}
        {lineas.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            {l.tipo === 'orden'
              ? <><span className="text-slate-500">{hora(l.cuando)} &gt; </span><span className="text-slate-100">{l.texto}</span></>
              : <span className={l.tipo === 'bien' ? 'text-emerald-400' : 'text-amber-300'}>{'           '}{l.texto}</span>}
          </div>
        ))}
      </div>

      <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); ejecutar(orden); }}>
        <label className="flex-1 basis-72 text-xs text-slate-400 flex flex-col gap-1">Orden
          <input ref={entrada} id="consola-orden" value={orden} onChange={(e) => { setOrden(e.target.value); setPosicion(null); }} onKeyDown={tecla}
            className="w-full min-h-[44px] bg-slate-950 border border-sky-600 rounded-lg px-3 text-slate-100 font-mono text-[15px]" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="módulo orden argumentos" />
        </label>
        <button type="submit" className="min-h-[44px] px-5 rounded-lg bg-sky-500 text-slate-950 font-bold cursor-pointer hover:bg-sky-400 disabled:opacity-50" disabled={ocupada || !orden.trim()}>Ejecutar</button>
        <button type="button" className="min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-100 font-semibold cursor-pointer hover:border-slate-400" onClick={() => ejecutar('rot stop')}>Parar rotor</button>
      </form>
      {ayuda && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Módulos">
          {Object.keys(ayuda).map((m) => (
            <button key={m} type="button" className="min-h-[36px] px-3 rounded-full border border-slate-700 text-slate-300 text-sm font-mono cursor-pointer hover:border-slate-500" onClick={() => { setOrden(`${m} `); entrada.current?.focus(); }}>{m}</button>
          ))}
        </div>
      )}
      {verAyuda && ayuda && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3" id="consola-ayuda">
          {(Object.entries(ayuda) as Array<[string, Ayuda[string]]>).map(([m, a]) => (
            <div key={m} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <div className="text-slate-100 font-semibold">{a.titulo}</div>
              {a.ordenes.map(([o, d]) => (
                <button key={o} type="button" className="w-full text-left flex gap-2 py-1 border-t border-slate-800 first:border-t-0 cursor-pointer hover:bg-slate-900" onClick={() => { setOrden(o.replace(/[<\[].*$/, '').replace(/\|.*$/, '').trim() + ' '); entrada.current?.focus(); }}>
                  <code className="basis-1/2 shrink-0 font-mono text-[13px] text-sky-400 break-words">{o}</code>
                  <span className="text-[13px] text-slate-300">{d}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="text-[13px] text-slate-400">Lo que mueve o emite pasa por las mismas comprobaciones que los botones: política de emisión, PTT con corte a los 3 minutos y confirmación para PTT y emergencias.</p>
    </Tarjeta>
  );
}
