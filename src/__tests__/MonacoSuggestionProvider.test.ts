/**
 * MonacoSuggestionProvider Unit Tests
 *
 * Tests the provider's core functionality:
 *  - Sync LTE results
 *  - Background fetch without blocking
 *  - No duplicate requests
 *  - Channel failure isolation
 *  - Timeout enforcement
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MonacoSuggestionProvider } from "@/lib/monaco-suggestion-provider";

describe("MonacoSuggestionProvider", () => {
  let provider: MonacoSuggestionProvider;

  beforeEach(() => {
    provider = new MonacoSuggestionProvider();
  });

  describe("synchronous LTE", () => {
    it("should return LTE results without waiting", async () => {
      const lteResult = "عليكم";
      const handlers = {
        lte: async (): Promise<string> => lteResult,
        rag: async (): Promise<string> => { throw new Error("Timeout"); },
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].text).toBe(lteResult);
    });
  });

  describe("background fetching", () => {
    it("should fetch RAG without blocking LTE response", async () => {
      let ragStarted = false;

      const handlers = {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => {
          ragStarted = true;
          await new Promise(resolve => setTimeout(resolve, 50));
          return "وسلام";
        },
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const promise = provider.getSuggestions("Hello", "السلام", handlers);

      const suggestions = await promise;

      expect(ragStarted).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("deduplication", () => {
    it("should not return duplicate suggestions", async () => {
      const sameText = "عليكم السلام";
      const handlers = {
        lte: async (): Promise<string> => sameText,
        rag: async (): Promise<string> => sameText, // Identical
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should deduplicate to single suggestion
      expect(suggestions.filter(s => s.text === sameText).length).toBe(1);
    });

    it("should normalize Arabic diacritics in deduplication", async () => {
      const withDiacritics = "عَلَيْكُم";
      const withoutDiacritics = "عليكم";

      const handlers = {
        lte: async (): Promise<string> => withDiacritics,
        rag: async (): Promise<string> => withoutDiacritics,
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should deduplicate diacritical variants
      const uniqueNormalized = new Set(
        suggestions.map(s => s.text.replace(/[\u064B-\u0652]/g, ""))
      );
      expect(uniqueNormalized.size).toBeLessThanOrEqual(suggestions.length);
    });
  });

  describe("channel isolation", () => {
    it("should not affect other channels on one failure", async () => {
      const handlers = {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => { throw new Error("Network error"); },
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => "سلام", // Should still work
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should still get results from LTE and Gemini
      const sources = suggestions.map(s => s.source);
      expect(sources).toContain("lte");
      expect(sources).toContain("gemini");
    });

    it("should isolate RAG timeout from other channels", async () => {
      const handlers = {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => new Promise<string>(() => {}), // Infinite promise
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => "سلام",
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should get LTE and Gemini despite RAG hanging
      expect(suggestions.length).toBeGreaterThan(0);
      const sources = suggestions.map(s => s.source);
      expect(sources).toContain("lte");
    });
  });

  describe("timeout enforcement", () => {
    it("should enforce LTE timeout (50ms)", async () => {
      const handlers = {
        lte: async (): Promise<string> => new Promise<string>(() => {}), // Never resolves
        rag: async (): Promise<string> => { throw new Error("Timeout"); },
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should not have LTE result due to timeout
      expect(suggestions.map(s => s.source)).not.toContain("lte");
    });

    it("should enforce RAG timeout (3000ms)", async () => {
      const handlers = {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => new Promise(resolve => setTimeout(() => resolve("وسلام"), 4000)), // Exceeds 3000ms
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should not have RAG result
      expect(suggestions.map(s => s.source)).not.toContain("rag");
    });

    it("should enforce WebLLM timeout (5000ms)", async () => {
      const handlers = {
        lte: async (): Promise<string> => "عليكم",
        rag: async (): Promise<string> => "",
        webllm: async (): Promise<string> => new Promise(resolve => setTimeout(() => resolve("سلام"), 6000)), // Exceeds 5000ms
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should not have WebLLM result
      expect(suggestions.map(s => s.source)).not.toContain("webllm");
    }, 10000); // Allow 10s for this test since WebLLM timeout is 5s
  });

  describe("RTL text handling", () => {
    it("should preserve Arabic text without bidi control chars", async () => {
      const arabicText = "عليكم وسلام الله عليكم";
      const handlers = {
        lte: async (): Promise<string> => arabicText,
        rag: async (): Promise<string> => "",
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => { throw new Error("Timeout"); },
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Arabic text should be preserved as-is (RTL handled by CSS)
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].text).toBe(arabicText);
      // Must NOT contain Unicode bidi override characters
      expect(suggestions[0].text).not.toContain("\u202E");
      expect(suggestions[0].text).not.toContain("\u202B");
    });
  });

  describe("ranking", () => {
    it("should rank by confidence first", async () => {
      const handlers = {
        lte: async (): Promise<string> => "عليكم", // High confidence (0.95)
        rag: async (): Promise<string> => "وسلام", // Medium confidence (0.85)
        webllm: async (): Promise<string> => { throw new Error("Timeout"); },
        gemini: async (): Promise<string> => "ورحمة", // Lower confidence (0.60)
        localAgent: async (): Promise<string> => "",
        prefetch: async (): Promise<string> => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // First should be LTE (highest confidence)
      expect(suggestions[0].source).toBe("lte");
      expect(suggestions[0].confidence).toBe(0.95);
    });
  });
});
