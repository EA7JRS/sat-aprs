// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
//
// S.A.T.-APRS · Envío de mensajes a buscapersonas por DAPNET (hampager.de).
//
// DAPNET es la red de buscapersonas de radioaficionados. Se envía con la
// cuenta del operador (usuario y contraseña de hampager.de). Un mensaje admite
// 80 caracteres. Solo envía: la recepción es cosa de los buscapersonas.

export const URL_DAPNET = 'https://hampager.de/api/calls';
export const MAX_DAPNET = 80;

export interface EnvioDapnet {
  texto: string;
  /** Indicativos destinatarios (registrados en DAPNET). */
  indicativos: string[];
  /** Grupos de transmisores (p. ej. «ea-all»). */
  grupos: string[];
  emergencia?: boolean;
}

/** Cuerpo de la petición, o el error si los datos no valen. */
export function cuerpoDapnet(e: EnvioDapnet): { ok: true; cuerpo: Record<string, unknown> } | { ok: false; error: string } {
  const texto = String(e.texto ?? '').replace(/\s+/g, ' ').trim();
  const indicativos = e.indicativos.map((i) => i.trim().toLowerCase()).filter((i) => /^[a-z0-9]{3,10}$/.test(i));
  const grupos = e.grupos.map((g) => g.trim().toLowerCase()).filter((g) => /^[a-z0-9\-]{2,30}$/.test(g));
  if (!texto) return { ok: false, error: 'El mensaje está vacío.' };
  if (texto.length > MAX_DAPNET) return { ok: false, error: `El mensaje pasa de ${MAX_DAPNET} caracteres.` };
  if (indicativos.length === 0) return { ok: false, error: 'Falta al menos un indicativo destinatario.' };
  if (grupos.length === 0) return { ok: false, error: 'Falta el grupo de transmisores.' };
  return { ok: true, cuerpo: { text: texto, callSignNames: indicativos, transmitterGroupNames: grupos, emergency: e.emergencia === true } };
}

export async function enviarDapnet(usuario: string, clave: string, e: EnvioDapnet): Promise<{ ok: boolean; error?: string }> {
  const c = cuerpoDapnet(e);
  if (!c.ok) return c;
  if (!usuario || !clave) return { ok: false, error: 'Falta la cuenta de DAPNET (usuario y contraseña de hampager.de).' };
  try {
    const r = await fetch(URL_DAPNET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${usuario}:${clave}`).toString('base64')}` },
      body: JSON.stringify(c.cuerpo),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'DAPNET rechaza el usuario o la contraseña.' };
    if (!r.ok) return { ok: false, error: `DAPNET respondió HTTP ${r.status}.` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `Sin conexión con DAPNET: ${err?.message ?? err}` };
  }
}
