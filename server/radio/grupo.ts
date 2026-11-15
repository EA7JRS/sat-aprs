// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Vigilancia de grupo (estilo ARTS) y emergencia remota (EAI).
//
// Igual que en el tracker APRS LoRa+ (pages_utils.cpp, «Vigilancia de grupo»):
//  · Hasta 5 indicativos. Con SSID solo vale ese; sin SSID, cualquiera.
//  · Una estación está EN ALCANCE si se ha oído POR RADIO dentro del plazo
//    (10 min de serie) y, si hay distancia máxima, más cerca que ella. Si no,
//    FUERA. Al arrancar se espera un plazo antes de dar a nadie por perdido.
//    Lo oído por APRS-IS se anota aparte: no es estar en alcance de radio.
//  · Sondeo opcional (60 a 3600 s): mensaje «ping» a quien lleva ese tiempo
//    sin oírse; los trackers APRS LoRa+ responden «pong».
//  · Emergencia remota: mensaje «EAI <código>» (o «EAI STOP <código>») a un
//    tracker que la tenga activada con ese código; contesta «EAI ON …» u «EAI OFF».
// Aquí solo está la lógica; el servidor emite por su cola de emisión.

import { LatLon, gcDistanceKm, gcInitialBearing } from '../formulas/geo';

export const MAX_GRUPO = 5;

export type EstadoMiembro = 'desconocido' | 'dentro' | 'fuera';

export interface Miembro {
  /** Como se escribió (en mayúsculas): EA7KZ-9 o EA7KZ. */
  indicativo: string;
  /** Lleva SSID: solo coincide ese. */
  exacto: boolean;
  estado: EstadoMiembro;
  /** Indicativo completo con el que se oyó por última vez por radio. */
  ultimo: string | null;
  /** Última vez oído por radio / por APRS-IS (ms epoch). */
  oidoRf: number | null;
  oidoIs: number | null;
  pos: LatLon | null;
  posCuando: number | null;
  /** Desde cuándo está en su estado actual. */
  desde: number;
  sondeado: number | null;
}

export interface AjustesGrupo {
  indicativos: string;
  /** Minutos sin oírse por radio para pasar a FUERA (1 a 120). */
  minutos: number;
  /** Distancia máxima en km (0 = sin límite). */
  maxKm: number;
  /** Segundos entre sondeos (0 = sin sondeo; si no, 60 a 3600). */
  sondeoS: number;
}

export interface Cambio { indicativo: string; estado: 'dentro' | 'fuera'; cuando: number; detalle: string }

/** «EA7AAA-7, ea7bbb» → indicativos válidos en mayúsculas, como en el tracker (3 a 10 caracteres A-Z 0-9 -). */
export function leerIndicativos(lista: string, max = MAX_GRUPO): string[] {
  const vistos = new Set<string>();
  for (const t of String(lista ?? '').toUpperCase().split(/[^A-Z0-9-]+/)) {
    if (t.length >= 3 && t.length <= 10 && /^[A-Z0-9]+(-[0-9A-Z]{1,2})?$/.test(t) && vistos.size < max) vistos.add(t);
  }
  return [...vistos];
}

export function coincide(m: Pick<Miembro, 'indicativo' | 'exacto'>, origen: string): boolean {
  const o = origen.trim().toUpperCase();
  return m.exacto ? o === m.indicativo : o.replace(/-.*$/, '') === m.indicativo;
}

export function normalizarAjustes(a: Partial<AjustesGrupo>): AjustesGrupo {
  const n = (v: unknown, def: number) => (Number.isFinite(Number(v)) ? Number(v) : def);
  const sondeo = Math.round(n(a.sondeoS, 0));
  return {
    indicativos: leerIndicativos(a.indicativos ?? '').join(','),
    minutos: Math.min(120, Math.max(1, Math.round(n(a.minutos, 10)))),
    maxKm: Math.min(500, Math.max(0, Math.round(n(a.maxKm, 0)))),
    sondeoS: sondeo <= 0 ? 0 : Math.min(3600, Math.max(60, sondeo)),
  };
}

export class Grupo {
  miembros: Miembro[] = [];
  cambios: Cambio[] = [];
  private ajustes: AjustesGrupo = normalizarAjustes({});
  private inicio = 0;
  private ultimoSondeo = 0;

  /** Cambia la lista o los plazos. Los miembros que siguen conservan lo que se sabe de ellos. */
  ajustar(a: Partial<AjustesGrupo>, ahora = Date.now()) {
    const nuevos = normalizarAjustes(a);
    if (nuevos.indicativos !== this.ajustes.indicativos) {
      const antes = new Map(this.miembros.map((m) => [m.indicativo, m]));
      this.miembros = leerIndicativos(nuevos.indicativos).map((c) => antes.get(c) ?? {
        indicativo: c, exacto: c.includes('-'), estado: 'desconocido', ultimo: null, oidoRf: null, oidoIs: null, pos: null, posCuando: null, desde: ahora, sondeado: null,
      });
      this.inicio = ahora;
    }
    this.ajustes = nuevos;
  }

  get config(): AjustesGrupo {
    return this.ajustes;
  }

  /** Una trama oída (por radio o por APRS-IS), con su posición si la lleva. */
  oida(origen: string, via: 'RF' | 'IS', pos: LatLon | null, ahora = Date.now()) {
    for (const m of this.miembros) {
      if (!coincide(m, origen)) continue;
      if (via === 'RF') { m.oidoRf = ahora; m.ultimo = origen.trim().toUpperCase(); }
      else m.oidoIs = ahora;
      if (pos) { m.pos = pos; m.posCuando = ahora; }
    }
  }

  /**
   * Revisa los estados (una vez por segundo basta). Devuelve los cambios a
   * EN ALCANCE o FUERA, que también se guardan en `cambios`.
   */
  revisar(estacion: LatLon | null, ahora = Date.now()): Cambio[] {
    if (this.inicio === 0) this.inicio = ahora;
    const plazo = this.ajustes.minutos * 60_000;
    const nuevos: Cambio[] = [];
    for (const m of this.miembros) {
      let siguiente: EstadoMiembro;
      let detalle = '';
      if (m.oidoRf === null) {
        siguiente = ahora - this.inicio > plazo ? 'fuera' : 'desconocido';
        detalle = 'no se ha oído por radio';
      } else {
        const reciente = ahora - m.oidoRf <= plazo;
        const km = estacion && m.pos ? gcDistanceKm(estacion, m.pos) : null;
        const lejos = this.ajustes.maxKm > 0 && km !== null && km > this.ajustes.maxKm;
        siguiente = reciente && !lejos ? 'dentro' : 'fuera';
        detalle = !reciente ? `sin oírse por radio desde hace ${Math.round((ahora - m.oidoRf) / 60_000)} min` : lejos ? `a ${Math.round(km!)} km, más de ${this.ajustes.maxKm}` : 'oída por radio';
      }
      if (siguiente !== m.estado) {
        m.estado = siguiente;
        m.desde = ahora;
        if (siguiente !== 'desconocido') nuevos.push({ indicativo: m.indicativo, estado: siguiente, cuando: ahora, detalle });
      }
    }
    if (nuevos.length) {
      this.cambios.unshift(...nuevos.reverse());
      if (this.cambios.length > 50) this.cambios.length = 50;
    }
    return nuevos;
  }

  /** A quién hay que mandar «ping» ahora (sondeo automático). */
  sondeos(ahora = Date.now()): string[] {
    const cada = this.ajustes.sondeoS * 1000;
    if (cada <= 0 || this.miembros.length === 0) return [];
    if (this.ultimoSondeo === 0) { this.ultimoSondeo = ahora; return []; }
    if (ahora - this.ultimoSondeo < cada) return [];
    this.ultimoSondeo = ahora;
    return this.marcarSondeo(this.miembros.filter((m) => m.oidoRf === null || ahora - m.oidoRf >= cada), ahora);
  }

  /** Sondeo a mano: a todos. */
  sondearTodos(ahora = Date.now()): string[] {
    return this.marcarSondeo(this.miembros, ahora);
  }

  private marcarSondeo(lista: Miembro[], ahora: number): string[] {
    for (const m of lista) m.sondeado = ahora;
    // Al indicativo exacto si se conoce (el tracker responde al suyo)
    return lista.map((m) => m.ultimo ?? m.indicativo);
  }

  /** Rumbo y distancia de cada miembro con posición. */
  situar(estacion: LatLon | null): Array<{ indicativo: string; km: number | null; rumbo: number | null }> {
    return this.miembros.map((m) => ({
      indicativo: m.indicativo,
      km: estacion && m.pos ? Math.round(gcDistanceKm(estacion, m.pos) * 10) / 10 : null,
      rumbo: estacion && m.pos ? Math.round(gcInitialBearing(estacion, m.pos)) : null,
    }));
  }
}

/** Texto del mensaje de emergencia remota. El código: 4 a 10 caracteres, sin espacios. */
export function mensajeEai(codigo: string, parar: boolean): { ok: true; texto: string } | { ok: false; error: string } {
  const c = String(codigo ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(c)) return { ok: false, error: 'El código EAI tiene de 4 a 10 letras o cifras.' };
  return { ok: true, texto: parar ? `EAI STOP ${c}` : `EAI ${c}` };
}
