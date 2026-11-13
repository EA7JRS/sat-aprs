// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Perfil de la estación APRS: los datos del usuario con los que la consola se
// identifica y se sitúa (titular, indicativo y SSID, passcode de APRS-IS,
// posición fija y localizador) y la baliza de posición que se emite con ellos.
import React, { useMemo, useState } from 'react';
import { UserRound, MapPin, Radio, Check, AlertCircle, Send, LocateFixed } from 'lucide-react';
import { isValidCallsign, passcodeMatches, splitCallsign } from '../../../server/aprs';
import { balizaPosicion, validarPerfil, MIN_INTERVALO_BALIZA_MIN } from '../../../server/estacion/baliza';
import { maidenhead, maidenheadToLatLon } from '../../../server/formulas/radio';
import { customFetch } from '../../utils/customFetch';
import { useAdminSession } from '../../utils/session';
import { GPSDStatus } from '../../types';

const SSIDS: Array<[number, string]> = [
  [0, 'Estación fija principal'], [1, 'Estación adicional / digipeater'], [2, 'Estación adicional / digipeater'],
  [3, 'Estación adicional'], [4, 'Estación adicional'], [5, 'Teléfono u otra red'], [6, 'Operación especial / satélite'],
  [7, 'Portátil de mano'], [8, 'Embarcación / segundo móvil'], [9, 'Móvil principal'], [10, 'IGate / enlace a Internet'],
  [11, 'Globo / aeronave'], [12, 'Tracker / APRStt'], [13, 'Estación meteorológica'], [14, 'Camión / transporte'], [15, 'Estación adicional'],
];

export interface StationProfileProps {
  operatorName: string; setOperatorName: (v: string) => void;
  stationQth: string; setStationQth: (v: string) => void;
  /** Indicativo completo, con SSID, tal como se emite. */
  callsign: string; setCallsign: (v: string) => void;
  passcode: string; setPasscode: (v: string) => void;
  lat: string | number; setLat: (v: string) => void;
  lon: string | number; setLon: (v: string) => void;
  beaconEnabled: boolean; setBeaconEnabled: (v: boolean) => void;
  beaconInterval: number;
  symbolTable: string; symbolCode: string;
  phg: { power: number; height: number; gain: number; directivity: number };
  comment: string;
  gpsd?: GPSDStatus;
  saving: boolean;
  onSave: () => void;
}

const inputCls = 'w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs font-mono focus:border-amber-500/40 focus:outline-none';
const labelCls = 'text-slate-400 text-[10px] block font-bold font-mono';

function Estado({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`text-[10px] font-mono flex items-start gap-1 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
      {ok ? <Check size={11} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

export default function StationProfile(p: StationProfileProps) {
  const session = useAdminSession();
  const [envio, setEnvio] = useState<string | null>(null);

  const partes = splitCallsign(p.callsign);
  const base = partes ? partes.base : p.callsign.split('-')[0].toUpperCase();
  const ssid = partes ? partes.ssid : 0;
  const componer = (b: string, s: number) => p.setCallsign(s > 0 ? `${b}-${s}` : b);

  const indicativoOk = isValidCallsign(p.callsign);
  const passOculto = /^\*+$/.test(p.passcode || '');
  const passOk = !passOculto && passcodeMatches(p.callsign, p.passcode);

  const lat = Number(p.lat);
  const lon = Number(p.lon);
  const posOk = p.lat !== '' && p.lon !== '' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const locator = posOk ? maidenhead(lat, lon) : '';
  const [locatorTxt, setLocatorTxt] = useState<string | null>(null);

  const perfil = useMemo(() => ({
    callsign: p.callsign, lat, lon, symbolTable: p.symbolTable, symbolCode: p.symbolCode, phg: p.phg, comment: p.comment,
  }), [p.callsign, lat, lon, p.symbolTable, p.symbolCode, p.phg, p.comment]);
  const errores = posOk ? validarPerfil(perfil) : ['posición de la estación sin configurar'];
  const trama = errores.length === 0 ? balizaPosicion(perfil) : null;

  const gpsReal = !!p.gpsd && !p.gpsd.isFallback && p.gpsd.mode >= 2;

  const aplicarLocator = (txt: string) => {
    setLocatorTxt(txt);
    const pos = /^[A-Ra-r]{2}\d{2}([A-Xa-x]{2})?$/.test(txt.trim()) ? maidenheadToLatLon(txt.trim()) : null;
    if (pos) {
      p.setLat(pos.lat.toFixed(5));
      p.setLon(pos.lon.toFixed(5));
    }
  };

  const emitirAhora = async () => {
    setEnvio('Enviando…');
    try {
      const r = await customFetch('/api/estacion/baliza', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) setEnvio(`No enviada: ${j.error || 'error'}`);
      else setEnvio(j.txEnabled ? 'Baliza puesta en la cola de emisión.' : 'Baliza registrada, pero NO emitida: la emisión está desactivada (SAT_APRS_TX).');
    } catch {
      setEnvio('No se pudo contactar con el servidor.');
    }
    setTimeout(() => setEnvio(null), 8000);
  };

  return (
    <div id="station-user-profile" className="bg-slate-900/30 border border-slate-900/80 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2.5 border-b border-slate-900 pb-3">
        <UserRound size={16} className="text-amber-500" />
        <div>
          <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider font-mono">Perfil de la estación</h3>
          <p className="text-[10.5px] text-slate-500 mt-0.5">
            Datos del usuario con los que la estación se identifica y se sitúa en la red APRS.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        {/* Identidad */}
        <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl space-y-3">
          <span className="text-[9.5px] text-amber-500 font-black tracking-wider uppercase font-mono flex items-center gap-1.5">
            <Radio size={11} /> Identidad
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="perfil-titular" className={labelCls}>Titular / operador</label>
              <input id="perfil-titular" className={inputCls} value={p.operatorName} maxLength={60}
                onChange={(e) => p.setOperatorName(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="space-y-1">
              <label htmlFor="perfil-qth" className={labelCls}>Localidad (QTH)</label>
              <input id="perfil-qth" className={inputCls} value={p.stationQth} maxLength={60}
                onChange={(e) => p.setStationQth(e.target.value)} placeholder="Población" />
            </div>
            <div className="space-y-1">
              <label htmlFor="perfil-indicativo" className={labelCls}>Indicativo</label>
              <input id="perfil-indicativo" className={`${inputCls} font-bold uppercase`} value={base} maxLength={6}
                onChange={(e) => componer(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), ssid)} placeholder="Indicativo" />
            </div>
            <div className="space-y-1">
              <label htmlFor="perfil-ssid" className={labelCls}>SSID</label>
              <select id="perfil-ssid" className={inputCls} value={ssid} onChange={(e) => componer(base, Number(e.target.value))}>
                {SSIDS.map(([n, txt]) => <option key={n} value={n}>-{n}: {txt}</option>)}
              </select>
            </div>
          </div>
          <Estado ok={indicativoOk}>
            {indicativoOk
              ? <>En el aire: <b>{p.callsign.toUpperCase()}</b></>
              : 'Indicativo no válido o de ejemplo: con él la consola no transmite.'}
          </Estado>

          <div className="space-y-1">
            <label htmlFor="perfil-passcode" className={labelCls}>Passcode de APRS-IS</label>
            <input id="perfil-passcode" type="password" autoComplete="off" className={inputCls} value={p.passcode}
              onChange={(e) => p.setPasscode(e.target.value)} />
            {passOculto
              ? <Estado ok={false}>Oculto: solo lo ve y lo cambia el administrador.</Estado>
              : <Estado ok={passOk}>{passOk
                  ? 'Corresponde al indicativo: se puede enviar a APRS-IS.'
                  : 'No corresponde al indicativo: solo se emitirá por RF.'}</Estado>}
          </div>
        </div>

        {/* Posición y baliza */}
        <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl space-y-3">
          <span className="text-[9.5px] text-amber-500 font-black tracking-wider uppercase font-mono flex items-center gap-1.5">
            <MapPin size={11} /> Posición fija y baliza
          </span>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label htmlFor="perfil-lat" className={labelCls}>Latitud</label>
              <input id="perfil-lat" type="number" step="any" className={inputCls} value={p.lat}
                onChange={(e) => { setLocatorTxt(null); p.setLat(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <label htmlFor="perfil-lon" className={labelCls}>Longitud</label>
              <input id="perfil-lon" type="number" step="any" className={inputCls} value={p.lon}
                onChange={(e) => { setLocatorTxt(null); p.setLon(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <label htmlFor="perfil-locator" className={labelCls}>Locator</label>
              <input id="perfil-locator" className={`${inputCls} uppercase`} maxLength={6}
                value={locatorTxt ?? locator} onChange={(e) => aplicarLocator(e.target.value)} />
            </div>
          </div>
          {!posOk && <Estado ok={false}>Coordenadas fuera de rango.</Estado>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" id="perfil-usar-gps" disabled={!gpsReal}
              onClick={() => { setLocatorTxt(null); p.setLat(p.gpsd!.lat.toFixed(5)); p.setLon(p.gpsd!.lon.toFixed(5)); }}
              className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-300 hover:border-amber-500/40 disabled:opacity-40 flex items-center gap-1.5">
              <LocateFixed size={11} /> Usar posición del GPS
            </button>
            <span className="text-[10px] text-slate-500 font-mono">
              {gpsReal ? 'GPS con fijo: en móvil la baliza usa la posición del GPS.' : 'Sin fijo GPS: se usa la posición fija.'}
            </span>
          </div>

          <label htmlFor="perfil-baliza" className="flex items-start gap-2 cursor-pointer pt-1">
            <input id="perfil-baliza" type="checkbox" className="mt-0.5 accent-amber-500" checked={p.beaconEnabled}
              onChange={(e) => p.setBeaconEnabled(e.target.checked)} />
            <span className="text-[11px] text-slate-300">
              Emitir la baliza de posición cada {Math.max(MIN_INTERVALO_BALIZA_MIN, Number(p.beaconInterval) || 30)} min
              <span className="block text-[10px] text-slate-500">
                Déjalo apagado si aprx o Direwolf ya emiten la baliza con este indicativo.
              </span>
            </span>
          </label>

          <div className="space-y-1">
            <span className={labelCls}>Trama de la baliza</span>
            <code id="perfil-trama" className="block bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-sky-300 font-mono break-all">
              {trama || `No se puede generar: ${errores.join('; ')}.`}
            </code>
            <p className="text-[10px] text-slate-500">Símbolo, PHG, comentario, ruta e intervalo se ajustan más abajo.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" id="perfil-guardar" onClick={p.onSave} disabled={p.saving || !posOk}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs px-5 py-2 rounded-lg">
          {p.saving ? 'Guardando…' : 'Guardar perfil'}
        </button>
        <button type="button" id="perfil-emitir" onClick={emitirAhora} disabled={!session.isAdmin || !trama}
          title={session.isAdmin ? 'Emite la baliza con el perfil guardado' : 'Solo el administrador'}
          className="border border-slate-700 hover:border-amber-500/50 disabled:opacity-40 text-slate-200 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5">
          <Send size={12} /> Emitir baliza ahora
        </button>
        {!session.txEnabled && <span className="text-[10px] text-amber-400 font-mono">Emisión desactivada (SAT_APRS_TX): nada sale al aire.</span>}
        {envio && <span id="perfil-envio" className="text-[10px] text-slate-300 font-mono">{envio}</span>}
      </div>
    </div>
  );
}
