// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Manuel - EA7JRS
import { customFetch } from './customFetch';

/** Descarga un archivo de la API con la sesión de administrador. Devuelve el error, si lo hay. */
export async function descargar(url: string, nombre: string): Promise<string | null> {
  try {
    const r = await customFetch(url);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return j.error || `La consola respondió ${r.status}.`;
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return null;
  } catch {
    return 'Sin conexión con la consola.';
  }
}
