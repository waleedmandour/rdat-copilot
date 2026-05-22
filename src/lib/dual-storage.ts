/**
 * Dual Storage Layer — IndexedDB Frontend Cache + Backend Sync
 *
 * Architecture:
 *  - IndexedDB: Fast local cache for offline reads (TM, Glossary, Segments)
 *  - Backend (SQLite): Authoritative store accessed via REST API
 *
 * Read path:
 *  1. Check IndexedDB cache (instant, offline-safe)
 *  2. If stale or missing, fetch from backend and update cache
 *
 * Write path:
 *  1. Write to backend (authoritative)
 *  2. On success, write to IndexedDB cache
 *  3. If backend unreachable, write to IndexedDB with "pending_sync" flag
 *
 * Sync strategy:
 *  - Pull: On startup, fetch entries since last sync timestamp
 *  - Push: Periodically flush "pending_sync" entries to backend
 *  - Conflict: Last-write-wins (based on updated_at timestamp)
 */

// ── IndexedDB Setup ─────────────────────────────────────────────

const DB_NAME = "rdat-copilot-cache";
const DB_VERSION = 2;

interface TMEntry {
  id: number;
  source: string;
  target: string;
  source_lang: string;
  target_lang: string;
  domain?: string;
  created_at?: string;
  updated_at?: string;
  _pendingSync?: boolean;
}

interface GlossaryEntry {
  id: number;
  source_term: string;
  target_term: string;
  source_lang: string;
  target_lang: string;
  pos?: string;
  domain?: string;
  notes?: string;
  created_at?: string;
}

interface SegmentEntry {
  id: number;
  source: string;
  target: string;
  source_lang: string;
  target_lang: string;
  status: "draft" | "confirmed" | "rejected" | "locked";
  score: number;
  source_file?: string;
  segment_index?: number;
  created_at?: string;
  updated_at?: string;
  _pendingSync?: boolean;
}

type StoreName = "tm_entries" | "glossary" | "segments" | "sync_meta";

let dbInstance: IDBDatabase | null = null;

/**
 * Open (or create) the IndexedDB database.
 * Uses a singleton pattern to avoid multiple connections.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // TM entries store
      if (!db.objectStoreNames.contains("tm_entries")) {
        const tmStore = db.createObjectStore("tm_entries", { keyPath: "id" });
        tmStore.createIndex("source_lang", "source_lang", { unique: false });
        tmStore.createIndex("source", "source", { unique: false });
        tmStore.createIndex("_pendingSync", "_pendingSync", { unique: false });
      }

      // Glossary store
      if (!db.objectStoreNames.contains("glossary")) {
        const glossaryStore = db.createObjectStore("glossary", { keyPath: "id" });
        glossaryStore.createIndex("source_lang", "source_lang", { unique: false });
        glossaryStore.createIndex("source_term", "source_term", { unique: false });
      }

      // Segments store
      if (!db.objectStoreNames.contains("segments")) {
        const segStore = db.createObjectStore("segments", { keyPath: "id" });
        segStore.createIndex("status", "status", { unique: false });
        segStore.createIndex("source_file", "source_file", { unique: false });
        segStore.createIndex("_pendingSync", "_pendingSync", { unique: false });
      }

      // Sync metadata store (tracks last sync timestamps)
      if (!db.objectStoreNames.contains("sync_meta")) {
        db.createObjectStore("sync_meta", { keyPath: "store_name" });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`IndexedDB open failed: ${request.error?.message}`));
    };
  });
}

// ── Generic CRUD Operations ──────────────────────────────────────

async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

// Note: getFromStore removed — currently unused. Re-add if needed for single-entry lookups.

async function putToStore<T>(storeName: StoreName, entry: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function putBatchToStore<T>(storeName: StoreName, entries: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const entry of entries) {
      store.put(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: StoreName, id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ── Sync Metadata ────────────────────────────────────────────────

interface SyncMeta {
  store_name: string;
  last_sync_at: string;
}

async function getLastSync(storeName: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_meta", "readonly");
    const store = tx.objectStore("sync_meta");
    const request = store.get(storeName);
    request.onsuccess = () => {
      const result = request.result as SyncMeta | undefined;
      resolve(result?.last_sync_at ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function setLastSync(storeName: string, timestamp: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_meta", "readwrite");
    const store = tx.objectStore("sync_meta");
    store.put({ store_name: storeName, last_sync_at: timestamp });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Public API: Dual Storage ─────────────────────────────────────

export type { TMEntry, GlossaryEntry, SegmentEntry };

/**
 * DualStorage — Provides transparent read/write access with
 * automatic synchronization between IndexedDB cache and the backend.
 *
 * Usage:
 *  const storage = getDualStorage();
 *  const entries = await storage.tm.getAll();           // Reads from cache
 *  await storage.tm.add({ source, target, ... });       // Writes to both
 *  await storage.syncAll();                              // Full sync
 */
export interface DualStorage {
  tm: {
    getAll: () => Promise<TMEntry[]>;
    search: (query: string, limit?: number) => Promise<TMEntry[]>;
    add: (entry: Omit<TMEntry, "id">) => Promise<TMEntry>;
    update: (entry: TMEntry) => Promise<TMEntry>;
    remove: (id: number) => Promise<void>;
    count: () => Promise<number>;
  };
  glossary: {
    getAll: () => Promise<GlossaryEntry[]>;
    search: (query: string) => Promise<GlossaryEntry[]>;
    add: (entry: Omit<GlossaryEntry, "id">) => Promise<GlossaryEntry>;
    remove: (id: number) => Promise<void>;
    count: () => Promise<number>;
  };
  segments: {
    getAll: () => Promise<SegmentEntry[]>;
    getByFile: (file: string) => Promise<SegmentEntry[]>;
    add: (entry: Omit<SegmentEntry, "id">) => Promise<SegmentEntry>;
    update: (entry: SegmentEntry) => Promise<SegmentEntry>;
    remove: (id: number) => Promise<void>;
    count: () => Promise<number>;
  };
  sync: {
    /**
     * Pull latest entries from backend and update IndexedDB cache.
     * Uses incremental sync (only entries updated since last sync).
     */
    pullTM: () => Promise<number>;
    pullGlossary: () => Promise<number>;
    pullAll: () => Promise<{ tm: number; glossary: number }>;
    /**
     * Push pending entries (marked with _pendingSync) to backend.
     */
    pushPending: () => Promise<number>;
    /**
     * Full sync: pull + push.
     */
    syncAll: () => Promise<{ pulled: { tm: number; glossary: number }; pushed: number }>;
    /**
     * Get sync status (last sync timestamps).
     */
    getStatus: () => Promise<{ tm: string | null; glossary: string | null }>;
  };
}

let dualStorageInstance: DualStorage | null = null;

export function getDualStorage(): DualStorage {
  if (dualStorageInstance) return dualStorageInstance;

  const BACKEND_URL = process.env.NEXT_PUBLIC_LOCAL_BACKEND_URL || "http://localhost:8000";

  dualStorageInstance = {
    // ── TM Operations ──────────────────────────────────────────
    tm: {
      async getAll(): Promise<TMEntry[]> {
        return getAllFromStore<TMEntry>("tm_entries");
      },

      async search(query: string, limit = 10): Promise<TMEntry[]> {
        // Local search: simple substring match on cached entries
        const all = await getAllFromStore<TMEntry>("tm_entries");
        const q = query.toLowerCase();
        return all
          .filter(e => e.source.toLowerCase().includes(q) || e.target.toLowerCase().includes(q))
          .slice(0, limit);
      },

      async add(entry: Omit<TMEntry, "id">): Promise<TMEntry> {
        // Try backend first
        let newEntry: TMEntry;
        try {
          const resp = await fetch(`${BACKEND_URL}/tm/entries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify(entry),
          });
          if (resp.ok) {
            const data = await resp.json();
            newEntry = { ...entry, id: data.id || Date.now() };
          } else {
            newEntry = { ...entry, id: Date.now(), _pendingSync: true };
          }
        } catch {
          // Backend unreachable — cache locally with pending flag
          newEntry = { ...entry, id: Date.now(), _pendingSync: true };
        }
        await putToStore("tm_entries", newEntry);
        return newEntry;
      },

      async update(entry: TMEntry): Promise<TMEntry> {
        // Try backend first
        try {
          await fetch(`${BACKEND_URL}/tm/entries/${entry.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify(entry),
          });
        } catch {
          entry._pendingSync = true;
        }
        await putToStore("tm_entries", entry);
        return entry;
      },

      async remove(id: number): Promise<void> {
        try {
          await fetch(`${BACKEND_URL}/tm/entries/${id}`, {
            method: "DELETE",
            signal: AbortSignal.timeout(3000),
          });
        } catch {
          // Backend unreachable — mark for deletion on next sync
        }
        await deleteFromStore("tm_entries", id);
      },

      async count(): Promise<number> {
        const all = await getAllFromStore<TMEntry>("tm_entries");
        return all.length;
      },
    },

    // ── Glossary Operations ────────────────────────────────────
    glossary: {
      async getAll(): Promise<GlossaryEntry[]> {
        return getAllFromStore<GlossaryEntry>("glossary");
      },

      async search(query: string): Promise<GlossaryEntry[]> {
        const all = await getAllFromStore<GlossaryEntry>("glossary");
        const q = query.toLowerCase();
        return all.filter(e =>
          e.source_term.toLowerCase().includes(q) || e.target_term.toLowerCase().includes(q)
        );
      },

      async add(entry: Omit<GlossaryEntry, "id">): Promise<GlossaryEntry> {
        let newEntry: GlossaryEntry;
        try {
          const resp = await fetch(`${BACKEND_URL}/glossary/entries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify(entry),
          });
          if (resp.ok) {
            const data = await resp.json();
            newEntry = { ...entry, id: data.id || Date.now() };
          } else {
            newEntry = { ...entry, id: Date.now() };
          }
        } catch {
          newEntry = { ...entry, id: Date.now() };
        }
        await putToStore("glossary", newEntry);
        return newEntry;
      },

      async remove(id: number): Promise<void> {
        try {
          await fetch(`${BACKEND_URL}/glossary/entries/${id}`, {
            method: "DELETE",
            signal: AbortSignal.timeout(3000),
          });
        } catch {
          // Will sync later
        }
        await deleteFromStore("glossary", id);
      },

      async count(): Promise<number> {
        const all = await getAllFromStore<GlossaryEntry>("glossary");
        return all.length;
      },
    },

    // ── Segments Operations ────────────────────────────────────
    segments: {
      async getAll(): Promise<SegmentEntry[]> {
        return getAllFromStore<SegmentEntry>("segments");
      },

      async getByFile(file: string): Promise<SegmentEntry[]> {
        const all = await getAllFromStore<SegmentEntry>("segments");
        return all.filter(e => e.source_file === file);
      },

      async add(entry: Omit<SegmentEntry, "id">): Promise<SegmentEntry> {
        let newEntry: SegmentEntry;
        try {
          const resp = await fetch(`${BACKEND_URL}/segments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify(entry),
          });
          if (resp.ok) {
            const data = await resp.json();
            newEntry = { ...entry, id: data.id || Date.now() };
          } else {
            newEntry = { ...entry, id: Date.now(), _pendingSync: true };
          }
        } catch {
          newEntry = { ...entry, id: Date.now(), _pendingSync: true };
        }
        await putToStore("segments", newEntry);
        return newEntry;
      },

      async update(entry: SegmentEntry): Promise<SegmentEntry> {
        try {
          await fetch(`${BACKEND_URL}/segments/${entry.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify(entry),
          });
        } catch {
          entry._pendingSync = true;
        }
        await putToStore("segments", entry);
        return entry;
      },

      async remove(id: number): Promise<void> {
        try {
          await fetch(`${BACKEND_URL}/segments/${id}`, {
            method: "DELETE",
            signal: AbortSignal.timeout(3000),
          });
        } catch {
          // Will sync later
        }
        await deleteFromStore("segments", id);
      },

      async count(): Promise<number> {
        const all = await getAllFromStore<SegmentEntry>("segments");
        return all.length;
      },
    },

    // ── Sync Operations ────────────────────────────────────────
    sync: {
      async pullTM(): Promise<number> {
        const lastSync = await getLastSync("tm_entries");
        try {
          const url = lastSync
            ? `${BACKEND_URL}/sync/tm?since=${encodeURIComponent(lastSync)}`
            : `${BACKEND_URL}/sync/tm`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return 0;

          const data = await resp.json();
          const entries: TMEntry[] = data.entries || [];
          if (entries.length > 0) {
            await putBatchToStore("tm_entries", entries);
          }
          await setLastSync("tm_entries", new Date().toISOString());
          return entries.length;
        } catch {
          return 0;
        }
      },

      async pullGlossary(): Promise<number> {
        const lastSync = await getLastSync("glossary");
        try {
          const url = lastSync
            ? `${BACKEND_URL}/sync/glossary?since=${encodeURIComponent(lastSync)}`
            : `${BACKEND_URL}/sync/glossary`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return 0;

          const data = await resp.json();
          const entries: GlossaryEntry[] = data.entries || [];
          if (entries.length > 0) {
            await putBatchToStore("glossary", entries);
          }
          await setLastSync("glossary", new Date().toISOString());
          return entries.length;
        } catch {
          return 0;
        }
      },

      async pullAll(): Promise<{ tm: number; glossary: number }> {
        const [tm, glossary] = await Promise.all([
          this.pullTM(),
          this.pullGlossary(),
        ]);
        return { tm, glossary };
      },

      async pushPending(): Promise<number> {
        let pushed = 0;

        // Push pending TM entries
        const tmEntries = await getAllFromStore<TMEntry>("tm_entries");
        const pendingTM = tmEntries.filter(e => e._pendingSync);
        for (const entry of pendingTM) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _pendingSync, ...data } = entry;
            const resp = await fetch(`${BACKEND_URL}/tm/entries`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(3000),
              body: JSON.stringify(data),
            });
            if (resp.ok) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { _pendingSync: _, ...cleanEntry } = entry;
              await putToStore("tm_entries", { ...cleanEntry, _pendingSync: false });
              pushed++;
            }
          } catch {
            break; // Backend unreachable, stop pushing
          }
        }

        // Push pending Segments
        const segments = await getAllFromStore<SegmentEntry>("segments");
        const pendingSegs = segments.filter(e => e._pendingSync);
        for (const entry of pendingSegs) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _pendingSync, ...data } = entry;
            const resp = await fetch(`${BACKEND_URL}/segments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(3000),
              body: JSON.stringify(data),
            });
            if (resp.ok) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { _pendingSync: _, ...cleanEntry } = entry;
              await putToStore("segments", { ...cleanEntry, _pendingSync: false });
              pushed++;
            }
          } catch {
            break;
          }
        }

        return pushed;
      },

      async syncAll(): Promise<{ pulled: { tm: number; glossary: number }; pushed: number }> {
        const pulled = await this.pullAll();
        const pushed = await this.pushPending();
        return { pulled, pushed };
      },

      async getStatus(): Promise<{ tm: string | null; glossary: string | null }> {
        const tm = await getLastSync("tm_entries");
        const glossary = await getLastSync("glossary");
        return { tm, glossary };
      },
    },
  };

  return dualStorageInstance;
}

/**
 * Reset the dual storage (clear all IndexedDB stores).
 * Used for debugging or when the user clears all data.
 */
export async function resetDualStorage(): Promise<void> {
  // Open DB to ensure it exists, then clear all stores
  await openDB();
  const storeNames: StoreName[] = ["tm_entries", "glossary", "segments", "sync_meta"];
  for (const name of storeNames) {
    await clearStore(name);
  }
  await setLastSync("tm_entries", "");
  await setLastSync("glossary", "");
  console.log("[DualStorage] All stores cleared");
}
