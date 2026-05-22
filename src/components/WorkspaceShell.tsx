"use client";

import React, { useState, useEffect } from "react";
import { Sidebar, NavItem } from "./Sidebar";
import { StatusBar, EngineMode, GTRStatus } from "./StatusBar";
import type { WebGPUInfo } from "./StatusBar";
import type { RAGState } from "@/hooks/useRAG";
import type { LocalAgentState } from "@/hooks/useLocalAgent";
import { WelcomeTab } from "./WelcomeTab";
import { TranslationWorkspace } from "./editors/TranslationWorkspace";
import { SettingsPanel } from "./Settings";
import { AiModelsView } from "./AiModelsView";
import { ApiKeysView } from "./ApiKeysView";
import { GlossaryView } from "./GlossaryView";
import { QuickGuideModal, hasSeenGuide } from "./QuickGuideModal";
import { InstallPWAButton } from "./InstallPWAButton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "next-themes";
import { Sun, Moon, HelpCircle, Loader2 } from "lucide-react";

interface WorkspaceShellProps {
  children?: React.ReactNode;
  className?: string;
}

export function WorkspaceShell({ className }: WorkspaceShellProps) {
  const { t, locale } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState<NavItem>("translator");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === "undefined") return false;
    return !hasSeenGuide();
  });

  const [webgpuInfo, setWebgpuInfo] = useState<WebGPUInfo>({ state: "unavailable" });
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [ragState, setRagState] = useState<RAGState>({
    isWorkerReady: false,
    isCorpusLoaded: false,
    isLoading: true,
    error: null,
    corpusSize: 0,
    modelsLoaded: false,
  });
  const [localAgentState, setLocalAgentState] = useState<LocalAgentState>("disconnected");

  // Hydration: track client-side mount for theme toggle.
  // Standard React pattern — setState in effect is necessary here to
  // defer the mounted check until after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration detection
    setMounted(true);
  }, []);

  const isDark = theme === "dark";

  // Placeholder status props
  const engineMode: EngineMode = "hybrid";
  const gtrStatus: GTRStatus = ragState.corpusSize > 0 ? "active" : "zero-shot";

  // Derive overall system ready state
  const isLTEReady = !ragState.isLoading && ragState.corpusSize > 0;

  const navTitleMap: Record<NavItem, string> = {
    translator: t("workspace.title.translator"),
    glossary: t("workspace.title.glossary"),
    models: t("workspace.title.models"),
    "api-keys": t("workspace.title.apiKeys"),
    settings: t("workspace.title.settings"),
  };

  // Render active view
  const renderView = () => {
    switch (activeNav) {
      case "translator":
        return (
          <TranslationWorkspace
            onWebgpuStateChange={setWebgpuInfo}
            onGeminiAvailableChange={setGeminiAvailable}
            onRagStateChange={setRagState}
            onLocalAgentStateChange={setLocalAgentState}
          />
        );
      case "glossary":
        return <GlossaryView />;
      case "models":
        return <AiModelsView />;
      case "api-keys":
        return <ApiKeysView />;
      case "settings":
        return <SettingsPanel />;
      default:
        return <WelcomeTab />;
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-screen w-screen overflow-hidden bg-background",
        className
      )}
      dir={locale === "ar" ? "rtl" : undefined}
    >
      <InstallPWAButton />
      {/* Main Content Area: Sidebar + Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Explorer) */}
        <Sidebar
          activeItem={activeNav}
          onNavItemChange={setActiveNav}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onOpenGuide={() => setShowGuide(true)}
        />

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar (Title/Actions) */}
          <header className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {navTitleMap[activeNav]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              {mounted && (
                <button
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className="p-1.5 rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-all duration-200"
                  title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {isDark ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Help Button */}
              <button
                onClick={() => setShowGuide(true)}
                className="p-1.5 rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
                title={locale === "en" ? "Quick Guide" : "دليل سريع"}
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* Ready Indicator */}
              <div className="flex items-center gap-1.5 ml-1">
                {isLTEReady ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-xs text-primary">
                      {locale === "ar" ? "جاهز" : "Ready"}
                    </span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                    <span className="text-xs text-muted-foreground">
                      {locale === "ar" ? "جاري التحميل…" : "Loading…"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Workspace Content */}
          <div className="flex-1 overflow-hidden bg-background">
            {renderView()}
          </div>
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        engineMode={engineMode}
        gtrStatus={gtrStatus}
        webgpuInfo={webgpuInfo}
        geminiAvailable={geminiAvailable}
        ragState={ragState}
        localAgentState={localAgentState}
        segmentCount={0}
        wordCount={0}
      />

      {/* Quick Guide Modal */}
      <QuickGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
