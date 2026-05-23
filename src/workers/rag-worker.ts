/**
 * RAG Worker — State Machine Implementation
 *
 * Three-phase state machine with proper initialization sequence:
 *  Phase 1: Initialize hash-based embedding system (always available)
 *  Phase 2: Index corpus using Orama full-text search (BM25)
 *  Phase 3: Process search requests with timeout handling
 *
 * FIX: Removed broken vector search (Orama schema lacked vector property).
 * Now uses BM25 full-text search which is reliable and requires no plugins.
 * Queue requests during initialization to prevent data loss.
 */

import { create, insertMultiple, search as oramaSearch, type AnyOrama } from "@orama/orama";

interface WorkerState {
  status: "idle" | "initializing" | "indexing" | "ready" | "error";
  modelsLoaded: boolean;
  corpusIndexed: boolean;
  totalIndexed: number;
  error: string | null;
}

// Global state
const state: WorkerState = {
  status: "idle",
  modelsLoaded: false,
  corpusIndexed: false,
  totalIndexed: 0,
  error: null,
};

let db: AnyOrama | null = null;

interface WorkerRequestPayload {
  query?: string;
  limit?: number;
  entries?: Array<{ en: string; ar: string; type: string }>;
}

// Queue for requests during initialization
const requestQueue: Array<{ type: string; payload: WorkerRequestPayload; id: string }> = [];

interface CorpusEntry {
  en: string;
  ar: string;
  type: string;
  index: number;
}

interface SearchResult {
  score: number;
  en: string;
  ar: string;
  type: string;
  index: number;
}

/**
 * Phase 1: Initialize embedding/text search system.
 * Always succeeds since we use BM25 full-text search (no ML deps).
 */
async function initializeModels(): Promise<void> {
  if (state.modelsLoaded) return;

  try {
    state.status = "initializing";
    state.error = null;
    self.postMessage({ type: "STATE_CHANGE", payload: { status: "initializing" } });

    console.log("[RAG Worker] Initializing BM25 full-text search system");
    
    // BM25 text search is always available — no external dependencies needed
    state.modelsLoaded = true;
    console.log("[RAG Worker] Search system initialized (BM25 full-text)");
    self.postMessage({ type: "MODELS_READY", payload: { model: "bm25-fulltext" } });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    state.status = "error";
    state.error = errMsg || "Unknown error";
    console.error("[RAG Worker] Initialization failed:", err);
    self.postMessage({
      type: "INIT_ERROR",
      payload: { error: `Failed to initialize: ${errMsg || "Unknown error"}` },
    });
  }
}

/**
 * Initialize Orama database with proper schema.
 * Uses string properties for BM25 full-text search on English text.
 */
async function initDB(): Promise<void> {
  if (db) return;

  try {
    console.log("[RAG Worker] Initializing Orama database...");
    db = await create({
      schema: {
        en: "string",   // BM25 full-text search on English source
        ar: "string",   // Stored as-is for retrieval
        type: "string", // Document type (tm, glossary, etc.)
        index: "number", // Original corpus index
      },
    });
    console.log("[RAG Worker] Database initialized");
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[RAG Worker] Failed to initialize database:", err);
    throw new Error(`Database initialization failed: ${errMsg}`);
  }
}

/**
 * Phase 2: Index corpus after models load (batch size 10).
 * No embedding needed — Orama handles BM25 indexing internally.
 */
async function indexCorpus(entries: Array<{ en: string; ar: string; type: string }>): Promise<void> {
  if (!state.modelsLoaded) {
    console.warn("[RAG Worker] Models not loaded, initializing...");
    await initializeModels();
    if (!state.modelsLoaded) {
      state.error = "Models initialization failed";
      throw new Error("Models not available");
    }
  }

  try {
    state.status = "indexing";
    console.log(`[RAG Worker] Starting corpus indexing: ${entries.length} entries`);
    self.postMessage({ type: "STATE_CHANGE", payload: { status: "indexing" } });

    if (!db) await initDB();

    const corpusEntries: CorpusEntry[] = entries.map((entry, index) => ({
      en: entry.en || "",
      ar: entry.ar || "",
      type: entry.type || "tm",
      index,
    }));

    // Process in batches of 10 to avoid memory spikes
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < corpusEntries.length; i += batchSize) {
      const batch = corpusEntries.slice(i, i + batchSize);
      
      try {
        await insertMultiple(db!, batch);
        processed += batch.length;
      } catch (batchErr: unknown) {
        console.error(`[RAG Worker] Batch ${i / batchSize} failed:`, batchErr);
        // Continue with next batch
      }

      // Report progress every batch
      self.postMessage({
        type: "INDEXING_PROGRESS",
        payload: { processed, total: corpusEntries.length },
      });
    }

    state.corpusIndexed = true;
    state.totalIndexed = processed;
    state.status = "ready";
    console.log(`[RAG Worker] Corpus indexed: ${processed}/${corpusEntries.length} entries`);

    // CRITICAL: Notify main thread that indexing is complete
    self.postMessage({
      type: "INDEXING_COMPLETE",
      payload: { count: processed },
    });

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    state.status = "error";
    state.error = errMsg;
    console.error("[RAG Worker] Corpus indexing failed:", err);
    self.postMessage({
      type: "INDEXING_ERROR",
      payload: { error: `Indexing failed: ${errMsg}` },
    });
  }
}

/**
 * Phase 3: Handle search requests with timeout.
 * Uses BM25 full-text search on the English text.
 */
async function handleSearchRequest(query: string, limit: number = 3): Promise<SearchResult[]> {
  if (!db) {
    throw new Error("Database not initialized");
  }

  try {
    const results = await oramaSearch(db!, {
      term: query,
      properties: ["en"],  // Search English source text
      limit,
      tolerance: 2,         // Allow some fuzziness in matching
    });

    return results.hits.map((hit) => {
      const doc = hit.document as unknown as { en: string; ar: string; type: string; index: number };
      return {
        score: hit.score,
        en: doc.en,
        ar: doc.ar,
        type: doc.type,
        index: doc.index,
      };
    });
  } catch (err: unknown) {
    throw new Error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Process queued requests after initialization completes.
 */
async function processQueue(): Promise<void> {
  const queue = [...requestQueue];
  requestQueue.length = 0;

  for (const { type, payload, id } of queue) {
    if (type === "SEARCH") {
      try {
        const hits = await handleSearchRequest(payload.query ?? "", payload.limit ?? 3);
        self.postMessage({
          type: "SEARCH_RESULTS",
          payload: { id, hits, query: payload.query ?? "" },
        });
      } catch (err: unknown) {
        self.postMessage({
          type: "SEARCH_ERROR",
          payload: { id, error: err instanceof Error ? err.message : String(err), query: payload.query ?? "" },
        });
      }
    } else if (type === "INGEST_CORPUS") {
      try {
        if (payload?.entries && state.modelsLoaded) {
          await indexCorpus(payload.entries);
        }
      } catch (err: unknown) {
        self.postMessage({
          type: "INDEXING_ERROR",
          payload: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  }
}

/**
 * Main message handler with state transitions.
 */
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case "INIT_MODELS":
        await initializeModels();
        break;

      case "INGEST_CORPUS":
        // Queue if models not ready, but DON'T index here — let processQueue handle it
        if (!state.modelsLoaded) {
          requestQueue.push({ type: "INGEST_CORPUS", payload, id: "ingest" });
          if (state.status === "idle") {
            await initializeModels();
          }
          // After models are loaded, processQueue will handle the queued INGEST_CORPUS
          await processQueue();
        } else {
          // Models already loaded — index directly
          await indexCorpus(payload.entries);
          await processQueue();
        }
        break;

      case "SEARCH":
        if (!state.corpusIndexed) {
          requestQueue.push({ type, payload, id: payload.id });
          if (state.status === "idle") {
            await initializeModels();
          }
        } else {
          try {
            const hits = await handleSearchRequest(payload.query, payload.limit);
            self.postMessage({
              type: "SEARCH_RESULTS",
              payload: { id: payload.id, hits, query: payload.query },
            });
          } catch (err: unknown) {
            self.postMessage({
              type: "SEARCH_ERROR",
              payload: { id: payload.id, error: err instanceof Error ? err.message : String(err), query: payload.query },
            });
          }
        }
        break;

      case "STATUS":
        self.postMessage({
          type: "STATUS_RESPONSE",
          payload: { state },
        });
        break;

      default:
        console.warn(`[RAG Worker] Unknown message type: ${type}`);
    }
  } catch (err: unknown) {
    console.error("[RAG Worker] Handler error:", err);
    self.postMessage({
      type: "ERROR",
      payload: { error: err instanceof Error ? err.message : String(err) },
    });
  }
};

// Signal worker is ready
self.postMessage({ type: "WORKER_READY", payload: {} });
