import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Workspace Store — persists editor content to localStorage.
 *
 * Auto-saves source and target text so that user work is preserved
 * across page reloads and browser restarts. Uses Zustand persist
 * middleware with a debounced write strategy (writes on state change,
 * but React components should debounce rapid updates via onChange).
 */

interface WorkspaceState {
  /** Source language text (English by default, Arabic when swapped) */
  sourceContent: string;
  setSourceContent: (text: string) => void;

  /** Target language text (Arabic by default, English when swapped) */
  targetContent: string;
  setTargetContent: (text: string) => void;

  /** Whether the translation direction is swapped (AR→EN instead of EN→AR) */
  swapDirection: boolean;
  setSwapDirection: (swapped: boolean) => void;
  toggleSwapDirection: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      sourceContent: "",
      setSourceContent: (text) => set({ sourceContent: text }),

      targetContent: "",
      setTargetContent: (text) => set({ targetContent: text }),

      swapDirection: false,
      setSwapDirection: (swapped) => set({ swapDirection: swapped }),
      toggleSwapDirection: () => set((s) => ({ swapDirection: !s.swapDirection })),
    }),
    {
      name: "rdat-copilot-workspace",
      partialize: (state) => ({
        sourceContent: state.sourceContent,
        targetContent: state.targetContent,
        swapDirection: state.swapDirection,
      }),
    }
  )
);
