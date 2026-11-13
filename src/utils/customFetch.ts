/** Clave de localStorage con el token local de administrador (SAT_ADMIN_TOKEN). */
export const ADMIN_TOKEN_STORAGE_KEY = 'sat_admin_token';

/**
 * fetch() para la API de la consola. Si el operador ha introducido el token de
 * administrador de la estación, lo adjunta en la cabecera X-Admin-Token para
 * que el servidor lo compruebe. No interviene ningún servicio externo.
 */
export async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const originalFetch = window.fetch;
  try {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input && typeof input === 'object' && 'url' in input) {
      url = (input as any).url || '';
    }

    // Solo la API propia (mismo origen): el token nunca viaja a terceros
    const isOurApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

    if (isOurApi) {
      let adminToken: string | null = null;
      try {
        adminToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
      } catch {
        // localStorage no disponible (modo privado, iframe restringido...)
      }
      if (adminToken) {
        const newInit = { ...(init || {}) };
        const headers = new Headers(newInit.headers || {});
        if (!headers.has('X-Admin-Token')) headers.set('X-Admin-Token', adminToken);
        newInit.headers = headers;
        return originalFetch(input, newInit);
      }
    }
  } catch (e) {
    console.error('Error in customFetch:', e);
  }
  return originalFetch(input, init);
}

if (typeof window !== 'undefined') {
  (window as any).customFetch = customFetch;
  (globalThis as any).customFetch = customFetch;
}

declare global {
  const customFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}
