import { auth } from './firebase';

/** Clave de localStorage con el token local de administrador (SAT_ADMIN_TOKEN). */
export const ADMIN_TOKEN_STORAGE_KEY = 'sat_admin_token';

/**
 * fetch() para la API de la consola. Adjunta la identidad del operador de forma
 * que el servidor pueda VERIFICARLA:
 *  - el token de identidad de Firebase (firmado por Google, caduca en 1 hora), y/o
 *  - el token local de administrador, para operar sin Internet.
 * El servidor ya no acepta cabeceras declarativas como X-User-UID o X-User-Email.
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

    // Solo la API propia (mismo origen): las credenciales nunca viajan a terceros
    const isOurApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

    if (isOurApi) {
      const newInit = { ...(init || {}) };
      const headers = new Headers(newInit.headers || {});

      const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
      if (user && !headers.has('Authorization')) {
        try {
          headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
        } catch (tokenErr) {
          // Sin conexión no se puede renovar el token: la petición sale sin él
          console.warn('No se pudo obtener el token de sesión:', tokenErr);
        }
      }

      try {
        const adminToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
        if (adminToken && !headers.has('X-Admin-Token')) {
          headers.set('X-Admin-Token', adminToken);
        }
      } catch {
        // localStorage no disponible (modo privado, iframe restringido...)
      }

      newInit.headers = headers;
      return originalFetch(input, newInit);
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
