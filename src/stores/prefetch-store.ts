import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

/**
 * Prefetch Store — caches AI translations by line number with reactivity.
 *
 * When the user is on Line N, lines N+1 and N+2 are translated
 * in the background and stored here. The Ghost Text provider
 * checks this cache first before calling the engine.
 * 
 * Features:
 *  - Reactive subscriptions with subscribeWithSelector
 *  - Automatic cache trimming when > 100 entries
 *  - Proper Map handling for entries
 */

interface PrefetchEntry {
  translation: string;
  source: string;
  timestamp: number;
  engine: "lte" | "rag" | "webllm" | "gemini";
}

interface PrefetchState {
  /** Map<lineNumber, PrefetchEntry> */
  cache: Map<number, PrefetchEntry>;

  /** Set a cached translation for a line */
  setPrefetch: (line: number, entry: PrefetchEntry) => void;

  /** Get a cached translation for a line */
  getPrefetch: (line: number) => PrefetchEntry | null;

  /** Clear cache for a line */
  clearPrefetch: (line: number) => void;

  /** Clear entire cache */
  clearAll: () => void;

  /** Get cache size */
  getCacheSize: () => number;

  /** Currently active line being edited */
  activeLine: number | null;
  setActiveLine: (line: number | null) => void;

  /** Source lines text (for context) */
  sourceLines: string[];
  setSourceLines: (lines: string[]) => void;
}

export const usePrefetchStore = create<PrefetchState>()(
  subscribeWithSelector((set, get) => ({
    cache: new Map(),
    activeLine: null,
    sourceLines: [],

    setPrefetch: (line, entry) => {
      set((state) => {
        const newCache = new Map(state.cache);
        newCache.set(line, entry);

        // Trim cache if > 100 entries (keep most recent)
        if (newCache.size > 100) {
          const entries = Array.from(newCache.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp)
            .slice(0, 100);
          const trimmedCache = new Map(entries);
          return { cache: trimmedCache };
        }

        return { cache: newCache };
      });
    },

    getPrefetch: (line) => {
      return get().cache.get(line) ?? null;
    },

    clearPrefetch: (line) => {
      set((state) => {
        const newCache = new Map(state.cache);
        newCache.delete(line);
        return { cache: newCache };
      });
    },

    clearAll: () => {
      set({ cache: new Map() });
    },

    getCacheSize: () => {
      return get().cache.size;
    },

    setActiveLine: (line) => {
      set({ activeLine: line });
    },

    setSourceLines: (lines) => {
      set({ sourceLines: lines });
    },
  }))
);

/**
 * Hook for reactive cache updates.
 * Subscribes to cache changes and triggers component re-renders.
 */
export function usePrefetchUpdates() {
  return usePrefetchStore((state) => ({
    cache: state.cache,
    cacheSize: state.cache.size,
    activeLine: state.activeLine,
  }));
}

/**
 * Hook for cache management operations.
 */
export function usePrefetchActions() {
  return usePrefetchStore((state) => ({
    setPrefetch: state.setPrefetch,
    getPrefetch: state.getPrefetch,
    clearPrefetch: state.clearPrefetch,
    clearAll: state.clearAll,
    getCacheSize: state.getCacheSize,
    setActiveLine: state.setActiveLine,
    setSourceLines: state.setSourceLines,
  }));
}
