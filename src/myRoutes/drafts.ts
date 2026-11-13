/**
 * Unsaved routes, kept on this device only (design/backend-v1-spec.md §4): a
 * draft can be bigger than localStorage likes (cleaned GPX up to 1 MB), so
 * IndexedDB. Where IndexedDB isn't available (some private windows), drafts
 * last until the page closes. Cleared on sign-out.
 */
import type { Draft } from './build';

const DB_NAME = 'anyonecanpace-drafts';
const STORE = 'drafts';

export interface DraftStore {
  list(): Promise<Draft[]>;
  get(id: string): Promise<Draft | undefined>;
  put(draft: Draft): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Drafts in memory only: the fallback, and for tests. */
export function memoryDraftStore(): DraftStore {
  const drafts = new Map<string, Draft>();
  return {
    list: async () => [...drafts.values()].sort((a, b) => b.createdAt - a.createdAt),
    get: async (id) => drafts.get(id),
    put: async (d) => void drafts.set(d.id, structuredClone(d)),
    remove: async (id) => void drafts.delete(id),
    clear: async () => drafts.clear(),
  };
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function indexedDbStore(idb: IDBFactory): DraftStore {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = idb.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        opened = null;
        reject(r.error);
      };
    });
    return opened;
  };
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    list: async () => ((await request((await store('readonly')).getAll())) as Draft[]).sort((a, b) => b.createdAt - a.createdAt),
    get: async (id) => (await request((await store('readonly')).get(id))) as Draft | undefined,
    put: async (d) => void (await request((await store('readwrite')).put(d))),
    remove: async (id) => void (await request((await store('readwrite')).delete(id))),
    clear: async () => void (await request((await store('readwrite')).clear())),
  };
}

let shared: DraftStore | null = null;

/** The device's draft store: IndexedDB, or memory if that's unavailable or fails to open. */
export function draftStore(): DraftStore {
  if (shared) return shared;
  const memory = memoryDraftStore();
  if (typeof indexedDB === 'undefined') return (shared = memory);
  const idb = indexedDbStore(indexedDB);
  // If IndexedDB fails (blocked storage), carry on in memory rather than losing the draft.
  const guarded = <A extends unknown[], R>(f: (...a: A) => Promise<R>, g: (...a: A) => Promise<R>) =>
    (...a: A) => f(...a).catch(() => g(...a));
  return (shared = {
    list: guarded(idb.list, memory.list),
    get: guarded(idb.get, memory.get),
    put: guarded(idb.put, memory.put),
    remove: guarded(idb.remove, memory.remove),
    clear: guarded(idb.clear, memory.clear),
  });
}
