// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Todos los avisos de la cadena en una sola lista: los que la estación
// difunde y los que no (y por qué), con las tramas APRS de cada uno.
import React, { useMemo, useState } from 'react';
import { Dato, Nivel, Tarjeta } from '../components/shell/Etiquetas';
import { Aviso, NOMBRE_TIPO, distanciaLegible, tituloAviso, horaUtc, useAvisos, vigenciaLegible } from '../utils/useAvisos';
import { customFetch } from '../utils/customFetch';
import { useAdminSession } from '../utils/session';

function Fila({ a, elegido, onElegir }: { a: Aviso; elegido: boolean; onElegir: () => void }) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegido}
      className={`w-full text-left rounded-xl p-3.5 flex flex-wrap items-center gap-3.5 cursor-pointer border ${
        elegido ? 'border-sky-500 bg-slate-900' : a.cumple ? 'border-slate-800 bg-slate-900 hover:border-slate-600' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
      }`}
    >
      <Nivel gravedad={a.gravedad} />
      <span className="flex-1 basis-60 min-w-0">
        <span className="block text-[17px] font-semibold text-slate-100">{tituloAviso(a)}</span>
        <span className="block text-sm text-slate-400">{a.titulo} · {vigenciaLegible(a.inicio, a.fin)} · {a.fuente}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-sm text-slate-300">{distanciaLegible(a)}</span>
        <span className={`block text-[13px] ${a.cumple ? (a.emitido ? 'text-emerald-400 font-semibold' : 'text-slate-300') : 'text-slate-400'}`}>
          {a.cumple ? (a.emitido ? `Emitido ${horaUtc(a.emitido.ultima)}` : 'Pendiente de emitir') : a.motivo.charAt(0).toUpperCase() + a.motivo.slice(1)}
        </span>
      </span>
    </button>
  );
}

function Detalle({ a, txEnabled, onEmitido }: { a: Aviso; txEnabled: boolean; onEmitido: () => void }) {
  const session = useAdminSession();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const emitir = async () => {
    setMensaje('Enviando…');
    try {
      const r = await customFetch('/api/avisos/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
      const j = await r.json();
      setMensaje(r.ok ? (j.txEnabled ? 'Aviso puesto en la cola de emisión.' : 'Registrado, pero no emitido: la emisión está desactivada.') : `No enviado: ${j.error}`);
      onEmitido();
    } catch {
      setMensaje('No se pudo contactar con el servidor.');
    }
  };

  return (
    <Tarjeta aria-label="Detalle del aviso" className="flex flex-col gap-4" id="detalle-aviso">
      <div>
        <div className="text-xs text-slate-400">Aviso seleccionado · {a.fuente}</div>
        <div className="text-xl font-semibold text-slate-100">{tituloAviso(a)}</div>
        <div className="text-sm text-slate-300">{a.titulo}</div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-slate-400">Lo que se emite por APRS</div>
        {[a.objeto, a.boletin].filter(Boolean).map((t) => (
          <code key={t} className="block font-mono text-[12.5px] text-sky-300 bg-slate-950 border border-slate-800 rounded-lg p-2.5 break-all">{t}</code>
        ))}
        {!a.objeto && <p className="text-[13px] text-slate-400">Sin posición: no genera objeto en el mapa.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Dato rotulo="Vigencia">{vigenciaLegible(a.inicio, a.fin)}</Dato>
        <Dato rotulo="Respecto a la estación">{distanciaLegible(a)}</Dato>
        <Dato rotulo="Última emisión">{a.emitido ? `${horaUtc(a.emitido.ultima)} UTC · ${a.emitido.veces} ${a.emitido.veces === 1 ? 'vez' : 'veces'}` : 'Nunca'}</Dato>
        <Dato rotulo="Próxima">{a.proxima ? (a.proxima <= Date.now() ? 'En el próximo ciclo' : `${horaUtc(a.proxima)} UTC`) : 'No se emite'}</Dato>
      </div>

      {!a.cumple && <p className="text-sm text-amber-300">No se difunde: {a.motivo}.</p>}

      <div className="border-t border-slate-800 pt-3.5 flex flex-col gap-2.5">
        <div className="font-semibold text-slate-100">Reglas de este tipo de aviso</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Dato rotulo="Radio">{a.reglas.radioKm === null ? 'Sin límite' : `${a.reglas.radioKm} km${a.deZona ? ' del borde de la zona' : ''}`}</Dato>
          <Dato rotulo="Nivel mínimo">{a.reglas.gravedadMinima.charAt(0).toUpperCase() + a.reglas.gravedadMinima.slice(1)}</Dato>
          <Dato rotulo="Antelación">{a.reglas.antelacionH} h</Dato>
          <Dato rotulo="Repetición">Cada {a.reglas.repetirMin} min</Dato>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          id="aviso-emitir"
          onClick={emitir}
          disabled={!a.cumple || !session.isAdmin}
          title={!session.isAdmin ? 'Solo el administrador' : !a.cumple ? 'El aviso no cumple las reglas' : 'Emite el objeto y el boletín ahora'}
          className="min-h-[44px] px-4 rounded-lg bg-sky-400 text-slate-950 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          Emitir ahora
        </button>
        {!txEnabled && <span className="text-[13px] text-amber-300">Emisión desactivada: nada sale al aire.</span>}
        {mensaje && <span className="text-[13px] text-slate-300" id="aviso-mensaje">{mensaje}</span>}
      </div>
    </Tarjeta>
  );
}

export default function Avisos() {
  const { avisos, total, txEnabled, error, recargar } = useAvisos();
  const [tipo, setTipo] = useState<string>('todos');
  const [elegidoId, setElegidoId] = useState<string | null>(null);

  const tipos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const a of avisos) cuenta.set(a.tipo, (cuenta.get(a.tipo) || 0) + 1);
    return [...cuenta.entries()];
  }, [avisos]);

  const visibles = tipo === 'todos' ? avisos : avisos.filter((a) => a.tipo === tipo);
  const cumplen = visibles.filter((a) => a.cumple);
  const resto = visibles.filter((a) => !a.cumple);
  const elegido = visibles.find((a) => a.id === elegidoId) ?? visibles[0] ?? null;

  const chip = (id: string, texto: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={tipo === id}
      onClick={() => setTipo(id)}
      className={`min-h-[44px] px-4 rounded-full border cursor-pointer whitespace-nowrap ${
        tipo === id ? 'border-sky-500 bg-sky-950 text-slate-50 font-semibold' : 'border-slate-800 text-slate-300 hover:border-slate-600'
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div className="flex flex-col gap-4" id="pagina-avisos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-100">Avisos</h1>
        <div className="flex flex-wrap gap-2">
          {chip('todos', `Todos · ${avisos.length}`)}
          {tipos.map(([t, n]) => chip(t, `${NOMBRE_TIPO[t] || t} · ${n}`))}
        </div>
      </div>

      {error && <Tarjeta className="text-amber-300">No se pudo consultar la lista de avisos.</Tarjeta>}
      {!error && avisos.length === 0 && (
        <Tarjeta className="text-slate-300">No hay avisos en vigor en las fuentes conectadas (sismos del IGN y avisos de AEMET).</Tarjeta>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        <section aria-label="Lista de avisos" className="flex-[1.5] basis-[30rem] min-w-0 flex flex-col gap-2.5">
          {cumplen.map((a) => <div key={a.id}><Fila a={a} elegido={elegido?.id === a.id} onElegir={() => setElegidoId(a.id)} /></div>)}
          {resto.length > 0 && (
            <h2 className="mt-2 text-base font-semibold text-slate-400">Fuera de tus reglas: se muestran, no se emiten</h2>
          )}
          {resto.slice(0, 60).map((a) => <div key={a.id}><Fila a={a} elegido={elegido?.id === a.id} onElegir={() => setElegidoId(a.id)} /></div>)}
          {(resto.length > 60 || total > avisos.length) && (
            <p className="text-sm text-slate-400">Hay más avisos lejanos que no se listan.</p>
          )}
        </section>
        {elegido && (
          <aside className="flex-1 basis-80 min-w-0 lg:sticky lg:top-4">
            <Detalle a={elegido} txEnabled={txEnabled} onEmitido={recargar} />
          </aside>
        )}
      </div>
    </div>
  );
}
