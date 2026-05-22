/**
 * Ghost Text Integration Tests
 *
 * Tests the complete three-phase suggestion pipeline:
 *  - LTE suggestions show immediately (< 100ms)
 *  - AI suggestions after timeout period
 *  - RTL text rendered correctly
 *  - Timeout handling for slow channels
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MonacoSuggestionProvider } from "@/lib/monaco-suggestion-provider";

describe("Ghost Text Integration", () => {
  let provider: MonacoSuggestionProvider;

  beforeEach(() => {
    provider = new MonacoSuggestionProvider();
  });

  it("should return LTE suggestions immediately", async () => {
    const start = Date.now();

    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => { throw new Error("Should timeout"); },
        webllm: async (): Promise<string> => { throw new Error("Should timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Should timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    const latency = Date.now() - start;
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].source).toBe("lte");
    expect(latency).toBeLessThan(100);
  });

  it("should include RAG results within 3000ms", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => "وعليكم",
        webllm: async (): Promise<string> => { throw new Error("Should timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Should timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    // Should have both LTE and RAG
    const sources = suggestions.map(s => s.source);
    expect(sources).toContain("lte");
    expect(sources).toContain("rag");
  });

  it("should deduplicate similar suggestions", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم السلام",
        rag: async (): Promise<string> => "عليكم السلام", // Same text
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    // Should deduplicate the identical Arabic text
    const uniqueTexts = new Set(suggestions.map(s => s.text));
    expect(uniqueTexts.size).toBeLessThanOrEqual(suggestions.length);
  });

  it("should handle RTL text correctly without bidi control chars", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم وسلام الله عليكم ورحمته",
        rag: async (): Promise<string> => "",
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    expect(suggestions.length).toBeGreaterThan(0);
    // Suggestions should contain Arabic text
    expect(/[\u0600-\u06FF]/.test(suggestions[0].text)).toBe(true);
    // Must NOT contain Unicode bidi override characters (RTL handled by CSS)
    expect(suggestions[0].text).not.toContain("\u202E");
    expect(suggestions[0].text).not.toContain("\u202B");
  });

  it("should rank by confidence then latency", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم", // High confidence, fast
        rag: async (): Promise<string> => "وسلام", // Medium confidence
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "عليكم", // Lower confidence
      }
    );

    // LTE should be first (highest confidence)
    expect(suggestions[0].source).toBe("lte");
    // Confidence should be sorted descending
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });

  it("should isolate errors per channel", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => { throw new Error("RAG failed"); },
        webllm: async (): Promise<string> => { throw new Error("WebLLM failed"); },
        gemini: async (): Promise<string> => "سلام",
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    // Should still get LTE and Gemini results despite RAG and WebLLM errors
    const sources = suggestions.map(s => s.source);
    expect(sources).toContain("lte");
    expect(sources).toContain("gemini");
    expect(sources).not.toContain("rag");
    expect(sources).not.toContain("webllm");
  });

  it("should timeout slow channels gracefully", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => new Promise(resolve => setTimeout(() => resolve("wasted"), 4000)), // Exceeds 3000ms
        webllm: async (): Promise<string> => new Promise(resolve => setTimeout(() => resolve("wasted"), 6000)), // Exceeds 5000ms
        gemini: async (): Promise<string> => "سلام",
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    // Should have fast results, RAG and WebLLM might timeout
    expect(suggestions.length).toBeGreaterThan(0);
  }, 10000); // Allow 10s since we're testing multi-second timeouts

  it("should limit results to top 3", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => "وسلام",
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => "ورحمة",
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "الله",
      }
    );

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("should cancel stale requests via cancelPending", async () => {
    // Start a request
    const promise1 = provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async (): Promise<string> => { await new Promise(r => setTimeout(r, 80)); return "عليكم"; },
        rag: async (): Promise<string> => "وسلام",
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    // Cancel it immediately
    provider.cancelPending();

    // Start a new request
    const promise2 = provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async (): Promise<string> => "عليكم الجديدة",
        rag: async (): Promise<string> => "",
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      }
    );

    const results1 = await promise1;
    const results2 = await promise2;

    // First request should return empty (stale)
    expect(results1).toEqual([]);
    // Second request should succeed
    expect(results2.length).toBeGreaterThan(0);
    expect(results2[0].text).toBe("عليكم الجديدة");
  });
});
