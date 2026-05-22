"use client";

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import { cn } from "@/lib/utils";
import { getLTE } from "@/lib/local-translation-engine";
import { usePrefetchStore } from "@/stores/prefetch-store";
import { useWebLLM } from "@/hooks/useWebLLM";
import { useGemini } from "@/hooks/useGemini";
import { useRAG } from "@/hooks/useRAG";
import { useLocalAgent } from "@/hooks/useLocalAgent";
import { MonacoSuggestionProvider } from "@/lib/monaco-suggestion-provider";
import { useTheme } from "next-themes";
import type { WebGPUInfo } from "@/components/StatusBar";
import type { LocalAgentState } from "@/hooks/useLocalAgent";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

interface TargetEditorProps {
  defaultValue?: string;
  onChange?: (value: string | undefined) => void;
  onCursorChange?: (lineNumber: number) => void;
  onMount?: (editor: editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => void;
  sourceLines?: string[];
  onWebgpuStateChange?: (state: WebGPUInfo) => void;
  onGeminiAvailableChange?: (available: boolean) => void;
  onRagStateChange?: (state: import("@/hooks/useRAG").RAGState) => void;
  onLocalAgentStateChange?: (state: LocalAgentState) => void;
  className?: string;
  direction?: "ltr" | "rtl";
  resetKey?: string;
}

const BASE_EDITOR_OPTIONS = {
  readOnly: false,
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  fontSize: 14,
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  renderLineHighlight: "all" as const,
  renderLineHighlightOnlyWhenFocus: true,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 16, bottom: 16 },
  bracketPairColorization: { enabled: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  contextmenu: true,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  autoClosingBrackets: "always" as const,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  suggest: { preview: false },
  tabCompletion: "on" as const,
  inlineSuggest: { enabled: true },
};

function computeInlineCompletionRemainder(prefix: string, suggestionText: string): string | null {
  const typed = prefix || "";
  const suggestion = suggestionText || "";

  if (!suggestion) return null;
  if (!typed) return suggestion;

  if (suggestion.startsWith(typed)) {
    const remainder = suggestion.slice(typed.length);
    return remainder.trimStart() || null;
  }

  if (typed.startsWith(suggestion)) {
    return null;
  }

  for (let overlap = Math.min(typed.length, suggestion.length); overlap > 0; overlap--) {
    if (typed.endsWith(suggestion.slice(0, overlap))) {
      const remainder = suggestion.slice(overlap);
      return remainder.trimStart() || null;
    }
  }

  return null;
}

interface WebLLMHandle { isReady: boolean; generateBurst: (source: string, prefix: string) => Promise<{ text: string } | null>; interruptGenerate: () => void }
interface GeminiHandle { isAvailable: boolean; generateBurst: (source: string, prefix: string) => Promise<{ text: string } | null>; interruptGenerate: () => void }
interface RAGHandle { state: { isCorpusLoaded: boolean }; search: (query: string, limit: number) => Promise<Array<{ ar: string }>> }
interface LocalAgentHandle { isReachable: boolean; isReady: boolean; generateBurst: (source: string, prefix: string) => Promise<{ text: string; channel: string } | null>; interruptGenerate: () => void }
interface PrefetchEntry { translation: string }

function registerGhostTextProvider(
  monaco: typeof import("monaco-editor"),
  sourceLinesRef: React.MutableRefObject<string[]>,
  webLLMRef: React.MutableRefObject<WebLLMHandle>,
  geminiRef: React.MutableRefObject<GeminiHandle>,
  ragRef: React.MutableRefObject<RAGHandle>,
  localAgentRef: React.MutableRefObject<LocalAgentHandle>,
  suggestionProvider: MonacoSuggestionProvider,
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>,
  getPrefetch: (line: number) => PrefetchEntry | null
): IDisposable {
  const provider = monaco.languages.registerInlineCompletionsProvider("plaintext", {
    provideInlineCompletions: async (model, position) => {
      const lineNumber = position.lineNumber;
      const sourceLine = sourceLinesRef.current[lineNumber - 1]?.trim();
      if (!sourceLine) {
        return { items: [] };
      }

      const currentLine = model.getLineContent(lineNumber);
      const prefix = currentLine.slice(0, position.column - 1);

      suggestionProvider.cancelPending();

      let suggestions = [];
      try {
        suggestions = await suggestionProvider.getSuggestions(sourceLine, prefix, {
          lte: async () => {
            const suggestion = getLTE().getSuggestion(sourceLine, prefix);
            return suggestion?.match ?? "";
          },
          prefetch: async () => {
            return getPrefetch(lineNumber)?.translation ?? "";
          },
          rag: async () => {
            if (!ragRef.current?.state?.isCorpusLoaded) return "";
            const hits = await ragRef.current.search(sourceLine, 1);
            return hits?.[0]?.ar ?? "";
          },
          localAgent: async () => {
            if (!localAgentRef.current?.isReachable) return "";
            const result = await localAgentRef.current.generateBurst(sourceLine, prefix);
            return result?.text ?? "";
          },
          webllm: async () => {
            if (!webLLMRef.current?.isReady) return "";
            const result = await webLLMRef.current.generateBurst(sourceLine, prefix);
            return result?.text ?? "";
          },
          gemini: async () => {
            if (!geminiRef.current?.isAvailable) return "";
            const result = await geminiRef.current.generateBurst(sourceLine, prefix);
            return result?.text ?? "";
          },
        });
      } catch (error) {
        console.error("[TargetEditor] Ghost text suggestion failed:", error);
        return { items: [] };
      }

      const items = suggestions
        .map((suggestion) => {
          const remainder = computeInlineCompletionRemainder(prefix, suggestion.text);
          if (!remainder) return null;
          return {
            insertText: remainder,
            range: new monaco.Range(lineNumber, position.column, lineNumber, position.column),
          };
        })
        .filter(Boolean);

      return { items: items as import("monaco-editor").languages.InlineCompletion[] };
    },

    freeInlineCompletions() {
      // No-op — provider has no external resources to clean up.
      // Monaco 0.52.2 InlineCompletionsProvider.freeInlineCompletions
    },
  });

  const editor = editorRef.current;
  const contentListener = editor?.onDidChangeModelContent(() => {
    suggestionProvider.cancelPending();
  });

  return {
    dispose() {
      provider.dispose();
      contentListener?.dispose();
    },
  } as IDisposable;
}

function EditorSkeleton() {
  return (
    <div className="h-full w-full bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-xs">جارٍ تحميل المحرر…</span>
      </div>
    </div>
  );
}

export function TargetEditor({
  defaultValue = "",
  onChange,
  onCursorChange,
  onMount,
  sourceLines = [],
  onWebgpuStateChange,
  onGeminiAvailableChange,
  onRagStateChange,
  onLocalAgentStateChange,
  className,
  direction = "rtl",
}: TargetEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const ghostProviderRef = useRef<IDisposable | null>(null);
  const suggestionProviderRef = useRef<MonacoSuggestionProvider | null>(null);
  const sourceLinesRef = useRef<string[]>(sourceLines);
  const getPrefetch = usePrefetchStore((s) => s.getPrefetch);
  
  const webLLM = useWebLLM();
  const gemini = useGemini();
  const rag = useRAG();
  const localAgent = useLocalAgent();
  const webLLMRef = useRef<WebLLMHandle>(webLLM);
  const geminiRef = useRef<GeminiHandle>(gemini);
  const ragRef = useRef<RAGHandle>(rag);
  const localAgentRef = useRef<LocalAgentHandle>(localAgent);

  useEffect(() => { sourceLinesRef.current = sourceLines; }, [sourceLines]);
  useEffect(() => { webLLMRef.current = webLLM; }, [webLLM]);
  useEffect(() => { geminiRef.current = gemini; }, [gemini]);
  useEffect(() => { ragRef.current = rag; }, [rag]);
  useEffect(() => { localAgentRef.current = localAgent; }, [localAgent]);

  useEffect(() => {
    const mappedState =
      webLLM.state === "recovering" ? "initializing" : webLLM.state;

    onWebgpuStateChange?.({
      state: mappedState,
      progress: webLLM.progress,
      error: webLLM.error,
    });
  }, [webLLM.state, webLLM.progress, webLLM.error, onWebgpuStateChange]);

  useEffect(() => {
    onGeminiAvailableChange?.(gemini.isAvailable);
  }, [gemini.isAvailable, onGeminiAvailableChange]);

  useEffect(() => {
    onRagStateChange?.(rag.state);
  }, [rag.state, onRagStateChange]);

  useEffect(() => {
    onLocalAgentStateChange?.(localAgent.state);
  }, [localAgent.state, onLocalAgentStateChange]);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const fontFamily = useMemo(
    () =>
      direction === "rtl"
        ? "'Noto Sans Arabic', 'JetBrains Mono', 'Fira Code', monospace"
        : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    [direction]
  );

  const editorOptions = useMemo(
    () => ({ ...BASE_EDITOR_OPTIONS, fontFamily }),
    [fontFamily]
  );

  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);

  const onMountRef = useRef(onMount);
  useEffect(() => { onMountRef.current = onMount; }, [onMount]);

  const getPrefetchRef = useRef(getPrefetch);
  useEffect(() => { getPrefetchRef.current = getPrefetch; }, [getPrefetch]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      editor.updateOptions({ readOnly: false, theme: isDark ? "rdat-dark" : "rdat-light", fontFamily });

      monaco.editor.defineTheme("rdat-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: { "editor.inlineSuggest.foreground": "#64748b" },
      });
      monaco.editor.defineTheme("rdat-light", {
        base: "vs",
        inherit: true,
        rules: [],
        colors: { "editor.inlineSuggest.foreground": "#94a3b8" },
      });

      if (ghostProviderRef.current) ghostProviderRef.current.dispose();
      if (!suggestionProviderRef.current) suggestionProviderRef.current = new MonacoSuggestionProvider();

      ghostProviderRef.current = registerGhostTextProvider(
        monaco,
        sourceLinesRef,
        webLLMRef,
        geminiRef,
        ragRef,
        localAgentRef,
        suggestionProviderRef.current,
        editorRef,
        getPrefetchRef.current
      );

      onMountRef.current?.(editor, monaco);

      editor.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.(e.position.lineNumber);
      });
    },
    [isDark, fontFamily]
  );

  useEffect(() => {
    return () => {
      ghostProviderRef.current?.dispose();
      suggestionProviderRef.current?.dispose();
      webLLMRef.current.interruptGenerate();
      geminiRef.current.interruptGenerate();
      localAgentRef.current.interruptGenerate();
    };
  }, []);

  return (
    <div className={cn("h-full w-full", className)} dir={direction}>
      <MonacoEditor
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        defaultValue={defaultValue}
        onChange={onChange}
        options={editorOptions}
        onMount={handleEditorDidMount}
        theme={isDark ? "rdat-dark" : "rdat-light"}
      />
    </div>
  );
}
