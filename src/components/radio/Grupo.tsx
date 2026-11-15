// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Radio · Principal: vigilancia de grupo (estilo ARTS) y emergencia remota
// (EAI), con las mismas reglas que el tracker APRS LoRa+.
import React, { useEffect, useState } from 'react';
import { Tarjeta } from '../shell/Etiquetas';
import { customFetch } from '../../utils/customFetch';
import { haceCuanto, horaUtc } from '../../utils/useAvisos';
import { TelemetryConfig } from '../../types';

type Guardar = (cambios: Partial<TelemetryConfig>) => Promise<boolean>;

interface Miembro {
  indicativo: string; exacto: boolean; estado: 'desconocido' | 'dentro' | 'fuera'; ultimo: string | null;
  oidoRf: number | null; oidoIs: number | null; desde: number; sondeado: number | null; km: number | null; rumbo: number | null;
  eai: { texto: string; cuando: number } | null; pong: number | null;
}
interface Datos {
  activo: boolean; txEnabled: boolean;
  ajustes: { indicativos: string; minutos: number; maxKm: number; sondeoS: number };
  miembros: Miembro[];
  cambios: Array<{ indicativo: string; estado: 'dentro' | 'fuera'; cuando: number; detalle: string }>;
}

const campo = 'w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-100 text-[15px]';
const boton = 'min-h-[40px] px-3 rounded-lg border border-slate-600 text-slate-100 text-sm font-semibold cursor-pointer hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';
const botonPrincipal = 'min-h-[44px] px-5 rounded-lg bg-sky-500 text-slate-950 font-bold cursor-pointer hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed';
const enlaceTexto = 'text-sm font-semibold text-sky-400 underline underline-offset-2 cursor-pointer';
const ESCALAS = [1, 2, 5, 10, 20, 50, 100, 250, 500];

const ETIQUETA: Record<Miembro['estado'], { texto: string; clase: string }> = {
  dentro: { texto: 'EN ALCANCE', clase: 'border-emerald-500 text-emerald-400' },
  fuera: { texto: 'FUERA', clase: 'border-red-500 text-red-400' },
  desconocido: { texto: 'ESPERANDO', clase: 'border-slate-600 text-slate-400' },
};

/** Radar como el del tracker: norte arriba, la estación en el centro, escala automática. */
function Radar({ miembros }: { miembros: Miembro[] }) {
  const conPos = miembros.filter((m) => m.km !== null && m.rumbo !== null);
  const lejos = Math.max(0, ...conPos.map((m) => m.km as number));
  const escala = ESCALAS.find((e) => e >= lejos * 1.1) ?? ESCALAS[ESCALAS.length - 1];
  const R = 70;
  const color = (e: Miembro['estado']) => (e === 'dentro' ? '#34d399' : e === 'fuera' ? '#f87171' : '#94a3b8');
  return (
    <svg role="img" aria-label={`Radar del grupo, escala ${escala} km`} viewBox="0 0 170 170" className="w-[170px] h-[170px] shrink-0" id="grupo-radar">
      <circle cx="85" cy="85" r={R} className="fill-slate-950 stroke-slate-700" strokeWidth="1.5" />
      <circle cx="85" cy="85" r={R / 2} fill="none" className="stroke-slate-800" strokeDasharray="3 4" />
      <line x1="85" y1="15" x2="85" y2="155" className="stroke-slate-800" />
      <line x1="15" y1="85" x2="155" y2="85" className="stroke-slate-800" />
      <text x="85" y="11" textAnchor="middle" fontSize="11" className="fill-slate-300" fontWeight="700">N</text>
      <text x="158" y="160" textAnchor="end" fontSize="10" className="fill-slate-400">{escala} km</text>
      <circle cx="85" cy="85" r="3.5" fill="#38bdf8" />
      {conPos.map((m, i) => {
        const r = Math.min(1, (m.km as number) / escala) * R;
        const a = ((m.rumbo as number) * Math.PI) / 180;
        const x = 85 + r * Math.sin(a);
        const y = 85 - r * Math.cos(a);
        return (
          <g key={m.indicativo}>
            <circle cx={x} cy={y} r="4.5" fill={color(m.estado)} stroke="#0f172a" strokeWidth="1" />
            {/* Etiquetas alternadas arriba y abajo para que no se pisen las de estaciones cercanas */}
            <text x={x + (i % 2 ? -6 : 6)} y={y + (i % 2 ? 13 : -6)} textAnchor={i % 2 ? 'end' : 'start'} fontSize="9.5" className="fill-slate-200" fontFamily="ui-monospace, monospace">{m.indicativo}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Grupo({ admin, config, onGuardar }: { admin: boolean; config: TelemetryConfig; onGuardar: Guardar }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const [ajustes, setAjustes] = useState(false);
  const [lista, setLista] = useState(config.grupoIndicativos ?? '');
  const [minutos, setMinutos] = useState(String(config.grupoMinutos ?? 10));
  const [maxKm, setMaxKm] = useState(String(config.grupoMaxKm ?? 0));
  const [sondeo, setSondeo] = useState(String(config.grupoSondeoS ?? 0));
  const [eaiDe, setEaiDe] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/radio/grupo').then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) { setDatos(j); setAhora(Date.now()); } }).catch(() => {});
    leer();
    const t = setInterval(leer, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [vuelta]);

  const guardar = async (activar: boolean) => {
    const ok = await onGuardar({ grupoActivo: activar, grupoIndicativos: lista, grupoMinutos: Number(minutos) || 10, grupoMaxKm: Number(maxKm) || 0, grupoSondeoS: Number(sondeo) || 0 });
    setAviso(ok ? null : { ok: false, texto: 'No se pudo guardar.' });
    if (ok) { setAjustes(false); setTimeout(() => setVuelta((v) => v + 1), 1200); }
  };
  const mandar = async (cuerpo: Record<string, unknown>, bien: string) => {
    try {
      const r = await customFetch('/api/radio/grupo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setAviso({ ok: false, texto: j.error || 'No se pudo.' });
      else setAviso(j.txEnabled ? { ok: true, texto: bien } : { ok: false, texto: 'La emisión está desactivada: el mensaje no sale al aire.' });
    } catch { setAviso({ ok: false, texto: 'Sin conexión con la consola.' }); }
    setVuelta((v) => v + 1);
  };
  const eai = (indicativo: string, parar: boolean) => {
    if (!parar && !window.confirm(`Se va a activar la emergencia remota en ${indicativo}: su tracker emitirá SOS durante el tiempo que tenga configurado. ¿Seguir?`)) return;
    mandar({ accion: 'eai', indicativo, codigo, parar }, parar ? `Orden de parar la emergencia enviada a ${indicativo}.` : `Emergencia remota enviada a ${indicativo}. Su respuesta aparece aquí y en Mensajería.`);
  };

  const dentro = datos?.miembros.filter((m) => m.estado === 'dentro').length ?? 0;
  const mostrarAjustes = ajustes || (datos && !datos.activo && admin);

  return (
    <Tarjeta aria-label="Grupo de estaciones" className="flex flex-col gap-3" id="grupo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold text-slate-100">Grupo de estaciones (ARTS)</h2>
          {datos?.activo && <span className="text-sm text-slate-400">plazo {datos.ajustes.minutos} min{datos.ajustes.maxKm ? ` · hasta ${datos.ajustes.maxKm} km` : ''}{datos.ajustes.sondeoS ? ` · sondeo cada ${datos.ajustes.sondeoS} s` : ''}</span>}
        </div>
        <div className="flex items-center gap-3">
          {datos?.activo && datos.miembros.length > 0 && <span className={`text-sm font-semibold ${dentro === datos.miembros.length ? 'text-emerald-400' : 'text-amber-300'}`} id="grupo-resumen">{dentro} de {datos.miembros.length} en alcance</span>}
          {admin && <button type="button" className={enlaceTexto} onClick={() => setAjustes((v) => !v)}>Ajustes</button>}
        </div>
      </div>

      {mostrarAjustes && (
        <div className="border border-slate-700 rounded-lg p-3 flex flex-col gap-3" id="grupo-ajustes">
          <p className="text-sm text-slate-300">Hasta 5 indicativos. Con SSID solo vale ese; sin SSID, cualquiera de la estación. Se considera en alcance quien se oye por radio dentro del plazo.</p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex-1 basis-60 text-xs text-slate-400 flex flex-col gap-1">Indicativos
              <input className={`${campo} font-mono`} id="grupo-lista" value={lista} onChange={(e) => setLista(e.target.value.toUpperCase())} placeholder="EA7KZ-9, EA7URS" spellCheck={false} />
            </label>
            <label className="basis-24 text-xs text-slate-400 flex flex-col gap-1">Plazo (min)
              <input className={`${campo} font-mono`} value={minutos} onChange={(e) => setMinutos(e.target.value)} inputMode="numeric" />
            </label>
            <label className="basis-24 text-xs text-slate-400 flex flex-col gap-1">Máx. km (0 = sin)
              <input className={`${campo} font-mono`} value={maxKm} onChange={(e) => setMaxKm(e.target.value)} inputMode="numeric" />
            </label>
            <label className="basis-28 text-xs text-slate-400 flex flex-col gap-1">Sondeo (s, 0 = no)
              <input className={`${campo} font-mono`} value={sondeo} onChange={(e) => setSondeo(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonPrincipal} disabled={!lista.trim()} onClick={() => guardar(true)}>{datos?.activo ? 'Guardar' : 'Activar'}</button>
            {datos?.activo && <button type="button" className={boton} onClick={() => guardar(false)}>Apagar</button>}
          </div>
          <p className="text-[13px] text-slate-400">El sondeo manda un mensaje «ping» a quien lleva ese tiempo sin oírse; los trackers APRS LoRa+ responden «pong». Mínimo 60 s.</p>
        </div>
      )}
      {datos && !datos.activo && !admin && <p className="text-sm text-slate-400">La vigilancia de grupo está apagada.</p>}

      {datos?.activo && (
        <div className="flex flex-wrap gap-4 items-start">
          <Radar miembros={datos.miembros} />
          <div className="flex-1 basis-72 min-w-0 flex flex-col">
            {datos.miembros.map((m) => (
              <div key={m.indicativo} className="py-2 border-t border-slate-800 first:border-t-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 w-[100px] text-center border rounded-md text-xs font-bold py-0.5 tracking-wide ${ETIQUETA[m.estado].clase}`}>{ETIQUETA[m.estado].texto}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-slate-100">{m.ultimo ?? m.indicativo}</div>
                    <div className="text-[13px] text-slate-400">
                      {m.km !== null ? `${m.km.toLocaleString('es-ES')} km · ${String(m.rumbo).padStart(3, '0')}° · ` : ''}
                      {m.oidoRf ? `por radio ${haceCuanto(m.oidoRf, ahora)}` : 'sin oírse por radio'}
                      {m.oidoIs && (!m.oidoRf || m.oidoIs > m.oidoRf) ? ` · por APRS-IS ${haceCuanto(m.oidoIs, ahora)}` : ''}
                      {m.pong && (!m.sondeado || m.pong >= m.sondeado - 60_000) ? ` · respondió al sondeo ${haceCuanto(m.pong, ahora)}` : m.sondeado ? ` · sondeado ${haceCuanto(m.sondeado, ahora)}` : ''}
                    </div>
                  </div>
                  {admin && <button type="button" className={enlaceTexto} aria-expanded={eaiDe === m.indicativo} onClick={() => setEaiDe(eaiDe === m.indicativo ? null : m.indicativo)}>EAI</button>}
                </div>
                {m.eai && <div className={`text-[13px] font-semibold ${/ON/i.test(m.eai.texto) ? 'text-red-400' : 'text-emerald-400'}`}>Emergencia remota: «{m.eai.texto}» · {horaUtc(m.eai.cuando)} UTC</div>}
                {eaiDe === m.indicativo && (
                  <div className="flex flex-wrap gap-2 items-end border border-red-900 rounded-lg p-2" id="grupo-eai">
                    <label className="basis-32 text-xs text-slate-400 flex flex-col gap-1">Código EAI de su tracker
                      <input className={`${campo} font-mono`} type="password" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="off" />
                    </label>
                    <button type="button" className="min-h-[44px] px-4 rounded-lg bg-red-500 text-slate-950 font-bold cursor-pointer disabled:opacity-50" disabled={codigo.trim().length < 4} onClick={() => eai(m.ultimo ?? m.indicativo, false)}>Activar emergencia</button>
                    <button type="button" className={boton} disabled={codigo.trim().length < 4} onClick={() => eai(m.ultimo ?? m.indicativo, true)}>Parar</button>
                    <p className="basis-full text-[12px] text-slate-400">Solo funciona si ese tracker tiene la EAI activada con este código y a esta estación entre los indicativos autorizados.</p>
                  </div>
                )}
              </div>
            ))}
            {admin && datos.miembros.length > 0 && (
              <div className="pt-2"><button type="button" className={boton} id="grupo-sondear" onClick={() => mandar({ accion: 'sondear' }, 'Sondeo enviado a todo el grupo.')}>Sondear ahora</button></div>
            )}
          </div>
        </div>
      )}

      {datos?.activo && datos.cambios.length > 0 && (
        <div className="flex flex-col gap-0.5" id="grupo-cambios">
          <div className="text-xs text-slate-400">Últimos cambios</div>
          {datos.cambios.slice(0, 5).map((c, i) => (
            <div key={i} className="text-[13px] text-slate-300"><span className="font-mono text-slate-400">{horaUtc(c.cuando)}</span> {c.indicativo} <span className={c.estado === 'dentro' ? 'text-emerald-400' : 'text-red-400'}>{c.estado === 'dentro' ? 'en alcance' : 'fuera'}</span> · {c.detalle}</div>
          ))}
        </div>
      )}
      {aviso && <p className={`text-sm ${aviso.ok ? 'text-emerald-400' : 'text-amber-300'}`} role="status">{aviso.texto}</p>}
    </Tarjeta>
  );
}
