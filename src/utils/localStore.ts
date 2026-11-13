// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Manuel - EA7JRS
//
// Almacén del perfil de la estación (operador, estaciones, presets).
//
// Los datos viven en la propia estación: el servidor los guarda en
// sat_perfil.json (GET/POST /api/perfil) y cualquier navegador que abra la
// consola ve el mismo perfil. localStorage se usa solo como copia para pintar
// al instante y para seguir funcionando si el servidor no responde. Ofrece
// una API mínima de documentos y colecciones con suscripción a cambios.

const PREFIX = 'sat_store:';
const CHANGE_EVENT = 'sat_store_changed';

export interface DocRef { kind: 'doc'; path: string }
export interface CollectionRef { kind: 'collection'; path: string }

export interface DocSnapshot {
  id: string;
  exists(): boolean;
  data(): any;
}

export interface CollectionSnapshot {
  docs: DocSnapshot[];
  forEach(cb: (doc: DocSnapshot) => void): void;
}

/** Marcador del almacén (se mantiene para que las rutas se lean igual). */
export const db = { local: true } as const;

function read(path: string): any {
  try {
    const raw = window.localStorage.getItem(PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(path: string, value: any): void {
  if (value === null || value === undefined) window.localStorage.removeItem(PREFIX + path);
  else window.localStorage.setItem(PREFIX + path, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: path }));
}

function write(path: string, value: any): void {
  writeLocal(path, value);
  // Se guarda también en la estación; si falla, queda la copia de este navegador
  customFetch('/api/perfil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: path, valor: value }),
  }).catch((err) => console.warn('No se pudo guardar el perfil en la estación:', err));
}

/** Trae el perfil guardado en la estación; lo que haya allí manda sobre la copia local. */
export async function sincronizarPerfil(): Promise<boolean> {
  try {
    const res = await customFetch('/api/perfil');
    if (!res.ok) return false;
    const datos: Record<string, unknown> = (await res.json()).datos || {};
    for (const [path, value] of Object.entries(datos)) {
      if (JSON.stringify(read(path)) !== JSON.stringify(value)) writeLocal(path, value);
    }
    // Lo que solo existía en este navegador (perfil creado antes) se sube a la estación
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) || '';
      if (!key.startsWith(PREFIX)) continue;
      const path = key.slice(PREFIX.length);
      if (!(path in datos)) write(path, read(path));
    }
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  void sincronizarPerfil();
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function snapshotOf(id: string, value: any): DocSnapshot {
  return { id, exists: () => value !== null && value !== undefined, data: () => value };
}

function collectionSnapshot(path: string): CollectionSnapshot {
  const items: Record<string, any> = read(path) || {};
  const docs = Object.entries(items).map(([id, value]) => snapshotOf(id, value));
  return { docs, forEach: (cb) => docs.forEach(cb) };
}

export function doc(_db: unknown, ...segments: string[]): DocRef {
  return { kind: 'doc', path: segments.join('/') };
}

export function collection(_db: unknown, ...segments: string[]): CollectionRef {
  return { kind: 'collection', path: segments.join('/') };
}

/** Un documento de una colección vive dentro del objeto de su colección. */
function splitDocPath(path: string): { parent: string; id: string } | null {
  const parts = path.split('/');
  if (parts.length < 4 || parts.length % 2 !== 0) return null; // users/local es un documento raíz
  return { parent: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] };
}

function readDoc(ref: DocRef): any {
  const nested = splitDocPath(ref.path);
  if (!nested) return read(ref.path);
  return (read(nested.parent) || {})[nested.id] ?? null;
}

function writeDoc(ref: DocRef, value: any): void {
  const nested = splitDocPath(ref.path);
  if (!nested) return write(ref.path, value);
  const items = read(nested.parent) || {};
  if (value === null) delete items[nested.id];
  else items[nested.id] = value;
  write(nested.parent, items);
}

export async function getDoc(ref: DocRef): Promise<DocSnapshot> {
  return snapshotOf(ref.path.split('/').pop() || '', readDoc(ref));
}

export async function setDoc(ref: DocRef, data: any, options?: { merge?: boolean }): Promise<void> {
  writeDoc(ref, options?.merge ? { ...(readDoc(ref) || {}), ...data } : data);
}

/** Como setDoc con mezcla: crea el documento si aún no existe. */
export async function updateDoc(ref: DocRef, data: any): Promise<void> {
  writeDoc(ref, { ...(readDoc(ref) || {}), ...data });
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  writeDoc(ref, null);
}

export async function addDoc(ref: CollectionRef, data: any): Promise<DocRef> {
  const id = newId();
  const items = read(ref.path) || {};
  items[id] = data;
  write(ref.path, items);
  return { kind: 'doc', path: `${ref.path}/${id}` };
}

/** Suscripción a un documento o colección; devuelve la función para cancelarla. */
export function onSnapshot(ref: DocRef, next: (snap: DocSnapshot) => void, onError?: (e: unknown) => void): () => void;
export function onSnapshot(ref: CollectionRef, next: (snap: CollectionSnapshot) => void, onError?: (e: unknown) => void): () => void;
export function onSnapshot(ref: DocRef | CollectionRef, next: (snap: any) => void, onError?: (e: unknown) => void): () => void {
  const emit = () => {
    try {
      if (ref.kind === 'collection') next(collectionSnapshot(ref.path));
      else next(snapshotOf(ref.path.split('/').pop() || '', readDoc(ref)));
    } catch (e) {
      if (onError) onError(e);
    }
  };
  const watched = ref.kind === 'doc' ? (splitDocPath(ref.path)?.parent || ref.path) : ref.path;
  const onChange = (e: Event) => {
    const path = (e as CustomEvent).detail;
    if (!path || path === watched) emit();
  };
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === PREFIX + watched) emit();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  queueMicrotask(emit);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
