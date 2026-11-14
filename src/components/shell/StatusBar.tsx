// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// Barra de estado: lo imprescindible de la estación, siempre a la vista.
import React, { useEffect, useState } from 'react';
import AdminAccess from '../system/AdminAccess';
import { GPSDStatus, NTPSECStatus, TelemetryConfig } from '../../types';
import { isValidCallsign } from '../../../server/aprs';
import { customFetch } from '../../utils/customFetch';

interface Enlaces {
  aprsIs: { estado: 'parado' | 'conectando' | 'conectado' | 'solo-recepcion' | 'desconectado'; detalle: string; recibidas: number };
  kiss: { conectado: boolean; puerto: number };
  estacionesOidas: number;
}

interface Props {
  config: TelemetryConfig;
  gpsd: GPSDStatus;
  ntp: NTPSECStatus;
  txEnabled: boolean;
}

function Chip({ estado, children, titulo }: { estado: 'bien' | 'aviso' | 'neutro'; children: React.ReactNode; titulo?: string }) {
  const clase = estado === 'bien'
    ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300'
    : estado === 'aviso'
      ? 'border-amber-700 bg-amber-950/40 text-amber-300'
      : 'border-slate-700 text-slate-300';
  return (
    <span title={titulo} className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[13px] whitespace-nowrap ${clase}`}>
      {estado !== 'neutro' && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${estado === 'bien' ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
      {children}
    </span>
  );
}

export default function StatusBar({ config, gpsd, ntp, txEnabled }: Props) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Estado real de los enlaces (sesión con APRS-IS y puerto KISS de Direwolf)
  const [enlaces, setEnlaces] = useState<Enlaces | null>(null);
  useEffect(() => {
    let vivo = true;
    const leer = () => customFetch('/api/enlaces').then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo) setEnlaces(j); }).catch(() => { if (vivo) setEnlaces(null); });
    leer();
    const t = setInterval(leer, 10000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const is = enlaces?.aprsIs;
  const textoIs = !is ? null
    : is.estado === 'conectado' ? 'APRS-IS conectado'
    : is.estado === 'solo-recepcion' ? 'APRS-IS solo recepción'
    : is.estado === 'conectando' ? 'APRS-IS conectando…'
    : is.estado === 'parado' ? 'APRS-IS sin sesión'
    : 'APRS-IS desconectado';

  const indicativoOk = isValidCallsign(config.callsign);
  const gpsReal = !gpsd.isFallback && gpsd.mode >= 2;
  const horaOk = ntp.status === 'synchronized';

  return (
    <header id="barra-estado" className="flex flex-wrap items-center gap-2 px-4 lg:px-6 py-3 border-b border-slate-800 bg-slate-950">
      <span className={`font-mono text-xl mr-1 ${indicativoOk ? 'text-slate-100' : 'text-amber-300'}`} title={indicativoOk ? 'Indicativo de la estación' : 'Indicativo sin configurar: no se transmite'}>
        {config.callsign}
      </span>
      <Chip estado={txEnabled && indicativoOk ? 'bien' : 'aviso'} titulo="SAT_APRS_TX en .env">
        {!txEnabled ? 'Emisión desactivada' : indicativoOk ? 'Emisión activada' : 'Sin indicativo: no emite'}
      </Chip>
      {textoIs && (
        <Chip estado={is!.estado === 'conectado' ? 'bien' : is!.estado === 'parado' ? 'neutro' : 'aviso'} titulo={is!.detalle ? `${is!.detalle} · ${is!.recibidas} tramas recibidas` : 'Sesión con el servidor APRS-IS'}>
          {textoIs}
        </Chip>
      )}
      {enlaces && (
        <Chip estado={enlaces.kiss.conectado ? 'bien' : 'aviso'} titulo={`Puerto KISS ${enlaces.kiss.puerto} de Direwolf`}>
          {enlaces.kiss.conectado ? 'RF · Direwolf' : 'RF sin Direwolf'}
        </Chip>
      )}
      <Chip estado={gpsReal ? 'bien' : 'neutro'}>
        {gpsReal ? `GPS ${gpsd.mode === 3 ? '3D' : '2D'} · ${gpsd.satellitesUsed} sat` : 'Posición fija'}
      </Chip>
      <Chip estado={horaOk ? 'bien' : 'aviso'} titulo={`ntpsec · stratum ${ntp.stratum}`}>
        {horaOk ? `Hora ±${Math.abs(ntp.offsetMs).toFixed(1)} ms` : 'Hora sin sincronizar'}
      </Chip>
      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-lg text-slate-400" id="reloj-utc">{ahora.toISOString().slice(11, 19)} UTC</span>
        <AdminAccess />
      </div>
    </header>
  );
}
