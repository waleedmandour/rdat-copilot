/**
 * Monaco Suggestion Provider — Four-Phase Async Suggestion Engine
 *
 * Architecture (Local-First, 6-channel cascade):
 *  Phase 1 (0-5ms):     LTE Smart Remainder (synchronous, in-memory)
 *  Phase 2 (0-50ms):    Prefetch Cache (idle-time pre-translations)
 *  Phase 3 (0-3000ms):  RAG + LocalAgent (parallel)
 *                         RAG: BM25 full-text search (Web Worker)
 *                         LocalAgent: FastAPI backend (TM + Ollama LLM)
 *  Phase 4 (0-5000ms):  WebLLM + Gemini (parallel, fallback channels)
 *                         WebLLM: in-browser WebGPU (always available)
 *                         Gemini: cloud API (opt-in only)
 *
 * Each channel runs independently with timeout isolation.
 * Deduplication and ranking applied before returning results.
 *
 * IMPORTANT: RTL rendering is handled by CSS rules in globals.css
 * (direction: ltr on .inline-suggestion with unicode-bidi: isolate).
 * Do NOT inject Unicode bidi control characters (U+202E, U+200F, etc.)
 * into suggestion text — they corrupt ghost text display and cursor
 * positioning.
 */

export type ChannelSource = "lte" | "rag" | "localAgent" | "webllm" | "gemini" | "prefetch";

export interface SuggestionResult {
  text: string;
  source: ChannelSource;
  latency: number;
  confidence: number;
  isBurst?: boolean; // true for 3-5 word burst, false for full
}

export interface ChannelResult {
  source: ChannelSource;
  text: string;
  latency: number;
  confidence: number;
  error?: string;
}

interface ChannelConfig {
  timeout: number; // milliseconds
  priority: number; // 0-100, higher wins
  retryCount?: number;
}

/**
 * Four-phase async suggestion engine with proper channel isolation
 * and stale-request cancellation.
 */
export class MonacoSuggestionProvider {
  private channelConfigs: Map<string, ChannelConfig> = new Map([
    ["lte", { timeout: 50, priority: 100 }],
    ["prefetch", { timeout: 50, priority: 75 }],
    ["rag", { timeout: 3000, priority: 80 }],
    ["localAgent", { timeout: 5000, priority: 85 }],  // Backend TM (fast) + Ollama LLM (slower)
    ["webllm", { timeout: 5000, priority: 60 }],
    ["gemini", { timeout: 3000, priority: 50 }],
  ]);

  private lastRequestId: string = "";
  private dedupeCache: Map<string, SuggestionResult> = new Map();
  private cacheClearInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cache expires every 60 seconds
    this.cacheClearInterval = setInterval(() => {
      this.dedupeCache.clear();
    }, 60000);
  }

  /**
   * Dispose of resources (clear the interval timer).
   * Should be called when the provider is no longer needed.
   */
  dispose(): void {
    if (this.cacheClearInterval !== null) {
      clearInterval(this.cacheClearInterval);
      this.cacheClearInterval = null;
    }
    this.dedupeCache.clear();
    this.cancelPending();
  }

  /**
   * Cancel any in-flight request by bumping the request ID.
   * Called when the user types a new character so stale results
   * from a previous invocation are discarded.
   */
  cancelPending(): void {
    this.lastRequestId = `cancelled_${Date.now()}`;
  }

  /**
   * Main entry point: Orchestrate four-phase suggestion pipeline.
   *
   * @param sourceLine - Original English text
   * @param prefix - Current Arabic prefix typed by user
   * @param handlers - Channel-specific handlers
   * @returns Promise<SuggestionResult[]> sorted by confidence and latency
   */
  async getSuggestions(
    sourceLine: string,
    prefix: string,
    handlers: {
      lte: () => Promise<string>;
      rag: () => Promise<string>;
      localAgent: () => Promise<string>;
      webllm: () => Promise<string>;
      gemini: () => Promise<string>;
      prefetch: () => Promise<string>;
    }
  ): Promise<SuggestionResult[]> {
    const requestId = `${Date.now()}_${Math.random()}`;
    this.lastRequestId = requestId;

    const results: ChannelResult[] = [];

    const isStale = () => requestId !== this.lastRequestId;

    try {
      // Phase 1: LTE (synchronous, immediate)
      try {
        const lteResult = await this.withTimeout(handlers.lte(), 50, "lte");
        if (lteResult.text && !isStale()) {
          results.push({
            source: "lte",
            text: lteResult.text,
            latency: lteResult.latency,
            confidence: 0.95,
          });
        }
      } catch (err) {
        console.warn("[MonacoProvider] LTE error or timeout:", err);
      }

      if (isStale()) return [];

      // Phase 2: Prefetch cache (near-instant)
      try {
        const prefetchResult = await this.withTimeout(handlers.prefetch(), 50, "prefetch");
        if (prefetchResult.text && !isStale()) {
          results.push({
            source: "prefetch",
            text: prefetchResult.text,
            latency: prefetchResult.latency,
            confidence: 0.75,
          });
        }
      } catch (err) {
        console.warn("[MonacoProvider] Prefetch error or timeout:", err);
      }

      if (isStale()) return [];

      // Phase 3: RAG + LocalAgent (parallel)
      // LocalAgent includes both TM results (fast) and Ollama inference (slower)
      const phase3Results = await Promise.allSettled([
        this.withTimeout(handlers.rag(), 3000, "rag"),
        this.withTimeout(handlers.localAgent(), 5000, "localAgent"),
      ]);

      for (const result of phase3Results) {
        if (result.status === "fulfilled" && result.value && !isStale()) {
          const { source, text, latency } = result.value;
          if (text) {
            results.push({
              source,
              text,
              latency,
              confidence: source === "localAgent" ? 0.85 : 0.80,
            });
          }
        }
      }

      if (isStale()) return [];

      // Phase 4: WebLLM + Gemini (parallel fallback channels)
      const phase4Results = await Promise.allSettled([
        this.withTimeout(handlers.webllm(), 5000, "webllm"),
        this.withTimeout(handlers.gemini(), 3000, "gemini"),
      ]);

      for (const result of phase4Results) {
        if (result.status === "fulfilled" && result.value && !isStale()) {
          const { source, text, latency } = result.value;
          if (text) {
            results.push({
              source,
              text,
              latency,
              confidence: source === "webllm" ? 0.70 : 0.60,
            });
          }
        }
      }
    } catch (err) {
      console.error("[MonacoProvider] Pipeline error:", err);
    }

    if (isStale()) return [];

    // Deduplicate and rank results
    return this.dedupeAndRank(results);
  }

  /**
   * Wrapper for timeout handling with source identification.
   */
  private async withTimeout(
    promise: Promise<string>,
    timeoutMs: number,
    source: ChannelSource
  ): Promise<{ source: ChannelSource; text: string; latency: number }> {
    const start = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${source} timeout`)), timeoutMs);
      promise.then(
        text => {
          clearTimeout(timer);
          resolve({ source, text, latency: performance.now() - start });
        },
        err => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Deduplicate results and rank by confidence + latency.
   */
  private dedupeAndRank(results: ChannelResult[]): SuggestionResult[] {
    const uniqueResults = new Map<string, ChannelResult>();

    // Keep best match from each source (prefer higher confidence, then shorter text)
    for (const result of results) {
      const key = this.getNormalizedKey(result.text);
      const existing = uniqueResults.get(key);
      if (
        !existing ||
        result.confidence > existing.confidence ||
        (result.confidence === existing.confidence && result.text.length < existing.text.length)
      ) {
        uniqueResults.set(key, result);
      }
    }

    // Convert and rank
    const suggestions: SuggestionResult[] = Array.from(uniqueResults.values())
      .map((r) => ({
        text: r.text,
        source: r.source as ChannelSource,
        latency: r.latency,
        confidence: r.confidence,
      }))
      .sort((a, b) => {
        // Primary: confidence (higher first)
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        // Secondary: latency (lower first, prefer fast results)
        return a.latency - b.latency;
      })
      .slice(0, 3); // Return top 3 suggestions

    return suggestions;
  }

  /**
   * Normalize text for deduplication (handle Arabic diacritics, spaces).
   */
  private getNormalizedKey(text: string): string {
    return text
      .replace(/[\u064B-\u0652]/g, "") // Remove Arabic diacritics
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * Calculate ghost text range for Monaco inline completion.
   */
  static calculateGhostTextRange(
    lineNumber: number,
    column: number
  ): { start: number; end: number } {
    return {
      start: column,
      end: column,
    };
  }
}
