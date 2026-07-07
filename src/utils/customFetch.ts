import { auth } from './firebase';

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

    const isOurApi = url && (url.startsWith('/api/') || url.includes('/api/'));
    
    if (isOurApi) {
      const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
      if (user) {
        const newInit = { ...(init || {}) };
        const headers = new Headers(newInit.headers || {});
        if (!headers.has('X-User-UID')) {
          headers.set('X-User-UID', user.uid);
        }
        if (!headers.has('X-User-Email')) {
          headers.set('X-User-Email', user.email || '');
        }
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
