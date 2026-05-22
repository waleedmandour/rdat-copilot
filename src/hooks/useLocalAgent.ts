"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  TRANSLATE_STREAM_URL,
  LOCAL_BACKEND_URL,
  isBackendReachable,
  getBackendHealth,
  type BackendHealth,
} from "@/lib/local-config";

export type LocalAgentState =
  | "disconnected"   // Backend unreachable
  | "connecting"     // Checking backend health
  | "connected"      // Backend healthy, model not confirmed
  | "ready"          // Backend + Ollama model loaded
  | "generating"     // Actively streaming from SSE
  | "error";

interface GlossaryTerm {
  source_term: string;
  target_term: string;
  pos?: string;
  domain?: string;
}

interface ValidationResult {
  is_valid: boolean;
  warnings: string[];
  errors: string[];
  score: number;
}

interface LocalAgentResult {
  text: string;
  channel: "tm" | "llm" | "error";
  score?: number;
  matchType?: string;
  glossaryTerms?: GlossaryTerm[];
  validation?: ValidationResult;
  error?: string;
}

/**
 * useLocalAgent — SSE Streaming Hook for FastAPI Backend (Channel 1/2).
 *
 * Connects to the local FastAPI backend at localhost:8000.
 * Provides two primary operations:
 *  1. generateBurst() — SSE streaming for ghost text (debounced, per-keystroke)
 *  2. generateFullTranslation() — full sentence translation via REST
 *
 * Architecture: This hook serves as Channel 1 (TM via backend) and Channel 2
 * (Ollama LLM via backend) in the 5-channel suggestion cascade.
 * When the backend is unreachable, the hook returns empty results and
 * the provider falls through to WebLLM (Channel 3) or Gemini (Channel 4).
 *
 * SSE Protocol:
 *  POST /translate/stream
 *  Body: { source: string, prefix: string, max_tokens?: number }
 *  Response: text/event-stream
 *    data: {"channel": "tm", "text": "...", "score": 0.9, "match_type": "fts5"}
 *    data: {"channel": "glossary", "terms": [...]}
 *    data: {"channel": "llm", "text": "token"}
 *    data: {"channel": "validate", "is_valid": true, "score": 0.95, ...}
 *    data: [DONE]
 */
export function useLocalAgent() {
  const [state, setState] = useState<LocalAgentState>("disconnected");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const [lastGlossaryTerms, setLastGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Periodic health check ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      if (cancelled) return;
      try {
        setState("connecting");
        const healthInfo = await getBackendHealth();
        if (cancelled) return;

        if (healthInfo) {
          setHealth(healthInfo);
          if (healthInfo.status === "ok" && healthInfo.modelLoaded) {
            setState("ready");
          } else if (healthInfo.status === "ok" || healthInfo.status === "degraded") {
            setState("connected");
          } else {
            setState("error");
          }
        } else {
          setHealth(null);
          setState("disconnected");
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setState("disconnected");
        }
      }
    };

    // Initial check
    checkHealth();

    // Periodic checks
    healthCheckIntervalRef.current = setInterval(checkHealth, 15000);

    return () => {
      cancelled = true;
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, []);

  /**
   * Generate a burst suggestion via SSE streaming.
   *
   * The backend pipeline: Retrieve (TM + Glossary) → Suggest (Ollama) → Validate → stream back.
   * We collect all SSE events and return the best result.
   * TM results arrive first (fast, ~50ms), then LLM tokens stream in.
   *
   * @param source - English source text
   * @param prefix - Arabic text the user has already typed
   * @returns Best available translation from the backend
   */
  const generateBurst = useCallback(
    async (source: string, prefix: string): Promise<LocalAgentResult> => {
      // Skip if backend is not reachable
      if (state === "disconnected" || state === "connecting") {
        return { text: "", channel: "error", error: "Backend unreachable" };
      }

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setState("generating");

        const response = await fetch(TRANSLATE_STREAM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            source,
            prefix,
            max_tokens: 30,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          setState("connected");
          return { text: "", channel: "error", error: errorText };
        }

        if (!response.body) {
          setState("connected");
          return { text: "", channel: "error", error: "No response body" };
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let tmResult = "";
        let tmScore = 0;
        let tmMatchType = "";
        let llmResult = "";
        let glossaryTerms: GlossaryTerm[] = [];
        let validation: ValidationResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.channel === "tm" && parsed.text) {
                tmResult = parsed.text;
                tmScore = parsed.score ?? 0;
                tmMatchType = parsed.match_type ?? "";
              } else if (parsed.channel === "glossary" && parsed.terms) {
                glossaryTerms = parsed.terms;
              } else if (parsed.channel === "llm" && parsed.text) {
                llmResult += parsed.text;
              } else if (parsed.channel === "validate") {
                validation = {
                  is_valid: parsed.is_valid ?? true,
                  warnings: parsed.warnings ?? [],
                  errors: parsed.errors ?? [],
                  score: parsed.score ?? 0,
                };
              }
            } catch {
              // Malformed SSE data — skip
            }
          }
        }

        // Prefer TM result (fast + high confidence), fall back to LLM
        const result = tmResult || llmResult;
        setState("ready");

        // Store glossary and validation in state for UI access
        if (glossaryTerms.length > 0) {
          setLastGlossaryTerms(glossaryTerms);
        }
        if (validation) {
          setLastValidation(validation);
        }

        if (result) {
          console.log(
            `[LocalAgent] Burst (${tmResult ? "tm" : "llm"}, score: ${tmScore || "n/a"}): "${result.substring(0, 60)}..."`
          );
          return {
            text: result,
            channel: tmResult ? "tm" : "llm",
            score: tmScore || undefined,
            matchType: tmMatchType || undefined,
            glossaryTerms: glossaryTerms.length > 0 ? glossaryTerms : undefined,
            validation: validation || undefined,
          };
        }

        return { text: "", channel: "error", error: "No suggestion from backend" };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { text: "", channel: "error" };
        }
        console.error("[LocalAgent] Burst generation failed:", err);
        setState("connected");
        return { text: "", channel: "error", error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    [state]
  );

  /**
   * Full sentence translation via REST endpoint (non-streaming).
   * Uses POST /translate for complete paragraph translation.
   */
  const generateFullTranslation = useCallback(
    async (source: string): Promise<LocalAgentResult> => {
      if (state === "disconnected" || state === "connecting") {
        return { text: "", channel: "error", error: "Backend unreachable" };
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${LOCAL_BACKEND_URL}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({ source, max_tokens: 256, validate: true }),
        });

        if (!response.ok) {
          return { text: "", channel: "error", error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const text = data?.translation?.trim() || "";
        const channel = data?.channel || "llm";

        // Store validation results
        if (data?.validation) {
          setLastValidation(data.validation);
        }
        if (data?.glossary) {
          setLastGlossaryTerms(data.glossary);
        }

        console.log(`[LocalAgent] Full: "${text.substring(0, 80)}..."`);
        return {
          text,
          channel,
          glossaryTerms: data?.glossary,
          validation: data?.validation,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { text: "", channel: "error" };
        }
        return { text: "", channel: "error", error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
    [state]
  );

  /**
   * Interrupt any ongoing SSE stream or REST request.
   */
  const interruptGenerate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => (prev === "generating" ? "ready" : prev));
  }, []);

  /**
   * Manual health check trigger.
   */
  const checkBackend = useCallback(async () => {
    const reachable = await isBackendReachable();
    if (reachable) {
      const healthInfo = await getBackendHealth();
      setHealth(healthInfo);
      if (healthInfo?.modelLoaded) {
        setState("ready");
      } else {
        setState("connected");
      }
    } else {
      setHealth(null);
      setState("disconnected");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    state,
    health,
    lastValidation,
    lastGlossaryTerms,
    isReachable: state !== "disconnected" && state !== "connecting",
    isReady: state === "ready",
    isGenerating: state === "generating",
    generateBurst,
    generateFullTranslation,
    interruptGenerate,
    checkBackend,
  };
}
