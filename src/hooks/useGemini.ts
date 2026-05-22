"use client";

import { useState, useCallback, useRef } from "react";
import { useSettingsStore } from "@/stores/settings-store";

interface GeminiResult {
  text: string;
  error: string | null;
}

/**
 * useGemini — Google Gemini Cloud Fallback (Channel 4).
 * 
 * Used when:
 *  - WebGPU is unsupported (no WebLLM)
 *  - Model hasn't been downloaded yet
 *  - User prefers cloud inference
 * 
 * API key is stored in localStorage via the Settings store.
 * Fetches from the official Gemini REST API.
 */
export function useGemini() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const apiKey = useSettingsStore((s) => s.geminiApiKey);
  const useCloud = useSettingsStore((s) => s.useCloudFallback);

  const isAvailable = Boolean(apiKey?.trim()) && useCloud;

  /**
   * Generate a burst of 3-5 Arabic words via Gemini.
   * 
   * Same prompt structure as WebLLM for consistency.
   */
  const generateBurst = useCallback(
    async (source: string, prefix: string): Promise<GeminiResult> => {
      if (!isAvailable) {
        return { text: "", error: "Gemini API key not configured" };
      }

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const temperature = useSettingsStore.getState().temperature;
      const burstTokens = useSettingsStore.getState().burstTokens;

      try {
        setIsGenerating(true);
        setError(null);

        const prompt = `You are a professional English-to-Arabic translator. Output ONLY the Arabic translation text, nothing else.

Translate this English text to Arabic:

${source}

The translator has already started typing: "${prefix}"

Continue from where they left off. Output only the remaining Arabic text (no more than ${burstTokens} words).`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortControllerRef.current.signal,
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                temperature,
                topP: 0.9,
                maxOutputTokens: burstTokens * 3,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        setIsGenerating(false);
        console.log(`[Gemini] Burst: "${text.substring(0, 60)}..."`);
        return { text, error: null };
      } catch (err: any) {
        if (err.name === "AbortError") {
          setIsGenerating(false);
          return { text: "", error: null };
        }
        console.error("[Gemini] Generation failed:", err);
        setError(err.message);
        setIsGenerating(false);
        return { text: "", error: err.message };
      }
    },
    [apiKey, isAvailable]
  );

  /**
   * Full sentence translation via Gemini.
   */
  const generateFullTranslation = useCallback(
    async (source: string): Promise<GeminiResult> => {
      if (!isAvailable) {
        return { text: "", error: "Gemini API key not configured" };
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setIsGenerating(true);
        setError(null);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortControllerRef.current.signal,
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are a professional English-to-Arabic translator. Output ONLY the Arabic translation, nothing else.\n\nTranslate this text to Arabic:\n\n${source}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: useSettingsStore.getState().temperature,
                topP: 0.9,
                maxOutputTokens: 256,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        setIsGenerating(false);
        console.log(`[Gemini] Full: "${text.substring(0, 80)}..."`);
        return { text, error: null };
      } catch (err: any) {
        if (err.name === "AbortError") {
          setIsGenerating(false);
          return { text: "", error: null };
        }
        console.error("[Gemini] Full translation failed:", err);
        setError(err.message);
        setIsGenerating(false);
        return { text: "", error: err.message };
      }
    },
    [apiKey, isAvailable]
  );

  /**
   * Interrupt any ongoing Gemini request.
   */
  const interruptGenerate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  return {
    isAvailable,
    isGenerating,
    error,
    generateBurst,
    generateFullTranslation,
    interruptGenerate,
  };
}
