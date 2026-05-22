import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Settings Store — persists user preferences to localStorage.
 * 
 * Stores:
 *  - Gemini API Key
 *  - WebLLM model selection
 *  - Translation preferences
 *  - UI preferences
 */

interface SettingsState {
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  
  webLLMModel: string;
  setWebLLMModel: (model: string) => void;
  
  activeCorpus: string;
  setActiveCorpus: (corpus: string) => void;
  
  useCloudFallback: boolean;
  setUseCloudFallback: (enabled: boolean) => void;
  
  burstTokens: number;
  setBurstTokens: (tokens: number) => void;
  
  temperature: number;
  setTemperature: (temp: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      geminiApiKey: "",
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      
      webLLMModel: "gemma-2b-it-q4f32_1-MLC",
      setWebLLMModel: (model) => set({ webLLMModel: model }),
      
      activeCorpus: "default-corpus-en-ar",
      setActiveCorpus: (corpus) => set({ activeCorpus: corpus }),
      
      useCloudFallback: false,
      setUseCloudFallback: (enabled) => set({ useCloudFallback: enabled }),
      
      burstTokens: 10,
      setBurstTokens: (tokens) => set({ burstTokens: tokens }),
      
      temperature: 0.3,
      setTemperature: (temp) => set({ temperature: temp }),
    }),
    {
      name: "rdat-copilot-settings",
      partialize: (state) => ({
        geminiApiKey: state.geminiApiKey,
        webLLMModel: state.webLLMModel,
        activeCorpus: state.activeCorpus,
        useCloudFallback: state.useCloudFallback,
        burstTokens: state.burstTokens,
        temperature: state.temperature,
      }),
    }
  )
);
