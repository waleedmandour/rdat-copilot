"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getDualStorage,
  resetDualStorage,
  type TMEntry,
  type GlossaryEntry,
  type SegmentEntry,
} from "@/lib/dual-storage";
import { isBackendReachable } from "@/lib/local-config";
import { SYNC_INTERVAL_MS } from "@/lib/local-config";

export interface DualStorageState {
  /** Number of TM entries in local cache */
  tmCount: number;
  /** Number of glossary entries in local cache */
  glossaryCount: number;
  /** Number of segments in local cache */
  segmentCount: number;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Last sync result */
  lastSyncResult: {
    tm: number;
    glossary: number;
    pushed: number;
  } | null;
  /** Whether backend is reachable */
  isBackendReachable: boolean;
  /** Last sync timestamp */
  lastSyncAt: string | null;
  /** Error message if sync failed */
  syncError: string | null;
}

/**
 * useDualStorage — React hook for the dual storage layer.
 *
 * Provides:
 *  - Counts of cached entries (TM, Glossary, Segments)
 *  - Automatic periodic sync from backend to IndexedDB
 *  - Manual sync trigger
 *  - CRUD operations for all entity types
 *  - Search capabilities against the local cache
 *
 * The hook automatically pulls data from the backend on mount
 * and then every SYNC_INTERVAL_MS (60 seconds) to keep the
 * local IndexedDB cache fresh.
 */
export function useDualStorage() {
  const [state, setState] = useState<DualStorageState>({
    tmCount: 0,
    glossaryCount: 0,
    segmentCount: 0,
    isSyncing: false,
    lastSyncResult: null,
    isBackendReachable: false,
    lastSyncAt: null,
    syncError: null,
  });

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storage = getDualStorage();

  // ── Refresh counts from IndexedDB ────────────────────────────
  const refreshCounts = useCallback(async () => {
    try {
      const [tmCount, glossaryCount, segmentCount] = await Promise.all([
        storage.tm.count(),
        storage.glossary.count(),
        storage.segments.count(),
      ]);
      setState((prev) => ({
        ...prev,
        tmCount,
        glossaryCount,
        segmentCount,
      }));
    } catch (err) {
      console.error("[DualStorage] Failed to refresh counts:", err);
    }
  }, [storage]);

  // ── Sync from backend ────────────────────────────────────────
  const syncFromBackend = useCallback(async () => {
    setState((prev) => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      const reachable = await isBackendReachable();
      setState((prev) => ({ ...prev, isBackendReachable: reachable }));

      if (!reachable) {
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          syncError: "Backend unreachable",
        }));
        return;
      }

      const result = await storage.sync.syncAll();
      const now = new Date().toISOString();

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncResult: {
          tm: result.pulled.tm,
          glossary: result.pulled.glossary,
          pushed: result.pushed,
        },
        lastSyncAt: now,
      }));

      // Refresh counts after sync
      await refreshCounts();
    } catch (err) {
      console.error("[DualStorage] Sync failed:", err);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        syncError: err instanceof Error ? err.message : "Sync failed",
      }));
    }
  }, [storage, refreshCounts]);

  // ── Initial sync and periodic refresh ────────────────────────
  useEffect(() => {
    // Initial sync
    syncFromBackend();
    refreshCounts();

    // Periodic sync
    syncIntervalRef.current = setInterval(() => {
      syncFromBackend();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncFromBackend, refreshCounts]);

  // ── TM Operations ────────────────────────────────────────────
  const addTMEntry = useCallback(
    async (entry: Omit<TMEntry, "id">) => {
      const result = await storage.tm.add(entry);
      await refreshCounts();
      return result;
    },
    [storage, refreshCounts]
  );

  const searchTM = useCallback(
    async (query: string, limit?: number) => {
      return storage.tm.search(query, limit);
    },
    [storage]
  );

  const getAllTM = useCallback(async () => {
    return storage.tm.getAll();
  }, [storage]);

  const removeTMEntry = useCallback(
    async (id: number) => {
      await storage.tm.remove(id);
      await refreshCounts();
    },
    [storage, refreshCounts]
  );

  // ── Glossary Operations ──────────────────────────────────────
  const addGlossaryEntry = useCallback(
    async (entry: Omit<GlossaryEntry, "id">) => {
      const result = await storage.glossary.add(entry);
      await refreshCounts();
      return result;
    },
    [storage, refreshCounts]
  );

  const searchGlossary = useCallback(
    async (query: string) => {
      return storage.glossary.search(query);
    },
    [storage]
  );

  const getAllGlossary = useCallback(async () => {
    return storage.glossary.getAll();
  }, [storage]);

  const removeGlossaryEntry = useCallback(
    async (id: number) => {
      await storage.glossary.remove(id);
      await refreshCounts();
    },
    [storage, refreshCounts]
  );

  // ── Segment Operations ───────────────────────────────────────
  const addSegment = useCallback(
    async (entry: Omit<SegmentEntry, "id">) => {
      const result = await storage.segments.add(entry);
      await refreshCounts();
      return result;
    },
    [storage, refreshCounts]
  );

  const updateSegment = useCallback(
    async (entry: SegmentEntry) => {
      const result = await storage.segments.update(entry);
      await refreshCounts();
      return result;
    },
    [storage, refreshCounts]
  );

  const getAllSegments = useCallback(async () => {
    return storage.segments.getAll();
  }, [storage]);

  const getSegmentsByFile = useCallback(
    async (file: string) => {
      return storage.segments.getByFile(file);
    },
    [storage]
  );

  const removeSegment = useCallback(
    async (id: number) => {
      await storage.segments.remove(id);
      await refreshCounts();
    },
    [storage, refreshCounts]
  );

  // ── Reset ────────────────────────────────────────────────────
  const resetAll = useCallback(async () => {
    await resetDualStorage();
    await refreshCounts();
    setState((prev) => ({
      ...prev,
      lastSyncResult: null,
      lastSyncAt: null,
    }));
  }, [refreshCounts]);

  return {
    // State
    ...state,

    // Sync operations
    syncFromBackend,
    resetAll,

    // TM operations
    addTMEntry,
    searchTM,
    getAllTM,
    removeTMEntry,

    // Glossary operations
    addGlossaryEntry,
    searchGlossary,
    getAllGlossary,
    removeGlossaryEntry,

    // Segment operations
    addSegment,
    updateSegment,
    getAllSegments,
    getSegmentsByFile,
    removeSegment,
  };
}
