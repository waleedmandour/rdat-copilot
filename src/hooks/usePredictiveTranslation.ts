"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePrefetchStore } from "@/stores/prefetch-store";
import { getLTE } from "@/lib/local-translation-engine";

/**
 * requestIdleCallback shim for Safari.
 */
const idleCallback =
  typeof window !== "undefined" && "requestIdleCallback" in window
    ? (cb: (deadline: { timeRemaining: () => number }) => void) =>
        (window as any).requestIdleCallback(cb)
    : (cb: () => void) => setTimeout(cb, 100);

const cancelIdle =
  typeof window !== "undefined" && "cancelIdleCallback" in window
    ? (handle: number) => (window as any).cancelIdleCallback(handle)
    : (handle: number) => clearTimeout(handle);

/**
 * usePredictiveTranslation — Idle Prefetch Engine.
 *
 * When the user's cursor is on Line N, this hook uses requestIdleCallback
 * to queue translations for lines N+1 and N+2 in the background.
 *
 * For Phase 4: Uses LTE's best full-sentence match.
 * For Phase 5: Will route to WebGPU LLM for higher quality.
 */
export function usePredictiveTranslation() {
  const idleHandleRef = useRef<number | null>(null);
  const lastActiveLineRef = useRef<number | null>(null);

  const { activeLine, sourceLines, setPrefetch, getPrefetch } =
    usePrefetchStore();

  const prefetchAhead = useCallback(
    (line: number) => {
      const lte = getLTE();

      // Prefetch N+1 and N+2
      for (let offset = 1; offset <= 2; offset++) {
        const targetLine = line + offset;
        const sourceLineText = sourceLines[targetLine - 1]; // 0-indexed

        // Skip if already cached or no source text
        if (!sourceLineText?.trim()) continue;
        if (getPrefetch(targetLine)) continue;

        // Use LTE to get the best full-sentence translation
        const suggestion = lte.getSuggestion(sourceLineText.trim(), "");

        if (suggestion) {
          setPrefetch(targetLine, {
            translation: suggestion.match,
            source: sourceLineText.trim(),
            timestamp: Date.now(),
            engine: "lte",
          });

          console.log(
            `[RDAT Prefetch] Line ${targetLine}: "${suggestion.match.substring(0, 40)}..."`
          );
        }
      }
    },
    [sourceLines, setPrefetch, getPrefetch]
  );

  // Trigger prefetch when active line changes
  useEffect(() => {
    if (activeLine === null || activeLine === lastActiveLineRef.current) return;
    lastActiveLineRef.current = activeLine;

    // Cancel any pending idle callback
    if (idleHandleRef.current !== null) {
      cancelIdle(idleHandleRef.current);
    }

    // Schedule prefetch during idle time (non-blocking)
    idleHandleRef.current = idleCallback(() => {
      prefetchAhead(activeLine);
      idleHandleRef.current = null;
    });

    return () => {
      if (idleHandleRef.current !== null) {
        cancelIdle(idleHandleRef.current);
        idleHandleRef.current = null;
      }
    };
  }, [activeLine, prefetchAhead]);

  return { prefetchAhead };
}
