"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Cpu, Cloud, Zap, Database, Search, Server, HardDrive, RefreshCw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { RAGState } from "@/hooks/useRAG";
import type { LocalAgentState } from "@/hooks/useLocalAgent";

export type EngineMode = "hybrid" | "local" | "cloud";
export type GTRStatus = "active" | "zero-shot";
export type WebGPUState = "ready" | "unavailable" | "idle" | "loading" | "downloading" | "generating" | "error" | "initializing";

export interface WebGPUInfo {
  state: WebGPUState;
  progress?: { text: string; percentage: number };
  error?: string | null;
}

interface StatusBarProps {
  engineMode?: EngineMode;
  gtrStatus?: GTRStatus;
  webgpuInfo?: WebGPUInfo;
  geminiAvailable?: boolean;
  ragState?: RAGState;
  localAgentState?: LocalAgentState;
  segmentCount?: number;
  wordCount?: number;
  /** Dual storage sync info */
  storageInfo?: {
    tmCount: number;
    glossaryCount: number;
    segmentCount: number;
    isSyncing: boolean;
    isBackendReachable: boolean;
    lastSyncAt: string | null;
  };
}

const EngineModeBadge: React.FC<{ mode: EngineMode }> = ({ mode }) => {
  const { t } = useLanguage();
  const config = {
    hybrid: {
      label: t("status.engine.hybrid"),
      bg: "bg-primary-muted text-primary",
      icon: <Zap className="w-3 h-3" />,
    },
    local: {
      label: t("status.engine.local"),
      bg: "bg-blue-900/40 text-blue-400",
      icon: <Cpu className="w-3 h-3" />,
    },
    cloud: {
      label: t("status.engine.cloud"),
      bg: "bg-purple-900/40 text-purple-400",
      icon: <Cloud className="w-3 h-3" />,
    },
  };
  const { label, bg, icon } = config[mode];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        bg
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
};

const GTRBadge: React.FC<{ status: GTRStatus }> = ({ status }) => {
  const { t } = useLanguage();
  const isActive = status === "active";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        isActive ? "bg-primary-muted text-primary" : "bg-warning-bg text-warning"
      )}
    >
      <Database className="w-3 h-3" />
      <span>{isActive ? t("status.gtr.active") : t("status.gtr.zeroShot")}</span>
    </div>
  );
};

const WebGPUBadge: React.FC<{ info: WebGPUInfo }> = ({ info }) => {
  const { t, locale } = useLanguage();
  const isRTL = locale === "ar";

  const safeState: WebGPUState = 
    ["ready", "unavailable", "idle", "loading", "downloading", "generating", "error", "initializing"]
      .includes(info.state as string) 
      ? info.state as WebGPUState
      : "loading";

  const config: Record<WebGPUState, { icon: React.ReactNode; bg: string; label: string }> = {
    ready: {
      icon: <Wifi className="w-3 h-3" />,
      bg: "bg-primary-muted text-primary",
      label: t("status.webgpu.ready"),
    },
    idle: {
      icon: <Wifi className="w-3 h-3" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: isRTL ? "WebGPU متاح" : "WebGPU Available",
    },
    unavailable: {
      icon: <WifiOff className="w-3 h-3" />,
      bg: "bg-surface-hover text-muted-foreground",
      label: isRTL ? "WebGPU غير متاح" : "WebGPU N/A",
    },
    loading: {
      icon: <Cpu className="w-3 h-3 animate-pulse" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: t("status.webgpu.loading"),
    },
    initializing: {
      icon: <Cpu className="w-3 h-3 animate-pulse" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: isRTL ? "تهيئة..." : "Initializing...",
    },
    downloading: {
      icon: <Cpu className="w-3 h-3 animate-pulse" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: isRTL ? "جاري التنزيل..." : "Downloading...",
    },
    generating: {
      icon: <Zap className="w-3 h-3 animate-pulse" />,
      bg: "bg-primary/20 text-primary",
      label: isRTL ? "يولّد..." : "Generating...",
    },
    error: {
      icon: <WifiOff className="w-3 h-3" />,
      bg: "bg-error-bg text-error",
      label: isRTL ? "خطأ WebGPU" : "WebGPU Error",
    },
  };

  const { icon, bg } = config[safeState] ?? config.loading;

  let label: React.ReactNode;
  if (safeState === "downloading" && info.progress) {
    label = (
      <div className="flex items-center gap-2">
        <span>WebGPU</span>
        <div className="w-16 h-1.5 bg-background rounded-full overflow-hidden">
          <div className="bg-primary h-full" style={{ width: `${info.progress.percentage}%` }} />
        </div>
        <span>{info.progress.percentage.toFixed(0)}%</span>
      </div>
    );
  } else if (safeState === "error" && info.error) {
    label = info.error.substring(0, 30);
  } else {
    label = config[safeState]?.label ?? "";
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        bg
      )}
    >
      {icon}
      <span className="truncate" title={info.progress?.text || info.error || undefined}>
        {label}
      </span>
    </div>
  );
};

const RAGBadge: React.FC<{ ragState?: RAGState }> = ({ ragState }) => {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  if (!ragState) return null;

  if (ragState.isCorpusLoaded) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary-muted text-primary">
        <Search className="w-3 h-3" />
        <span>{isRTL ? "RAG ✓" : "RAG ✓"} {ragState.corpusSize}</span>
      </div>
    );
  }

  if (ragState.isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-hover text-muted-foreground">
        <Search className="w-3 h-3 animate-pulse" />
        <span>{isRTL ? "RAG جاري التحميل" : "RAG Loading"}</span>
      </div>
    );
  }

  if (ragState.error) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-warning-bg text-warning" title={ragState.error}>
        <Database className="w-3 h-3" />
        <span>LTE {ragState.corpusSize > 0 ? `✓${ragState.corpusSize}` : ""}</span>
      </div>
    );
  }

  if (ragState.corpusSize > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-hover text-muted-foreground">
        <Database className="w-3 h-3" />
        <span>LTE ✓ {ragState.corpusSize}</span>
      </div>
    );
  }

  return null;
};

const LocalAgentBadge: React.FC<{ state: LocalAgentState }> = ({ state: agentState }) => {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  const config: Record<string, { icon: React.ReactNode; bg: string; label: string }> = {
    disconnected: {
      icon: <Server className="w-3 h-3" />,
      bg: "bg-surface-hover text-muted-foreground",
      label: isRTL ? "الخادم غير متصل" : "Server Off",
    },
    connecting: {
      icon: <Server className="w-3 h-3 animate-pulse" />,
      bg: "bg-yellow-900/40 text-yellow-400",
      label: isRTL ? "جاري الاتصال..." : "Connecting...",
    },
    connected: {
      icon: <Server className="w-3 h-3" />,
      bg: "bg-yellow-900/40 text-yellow-400",
      label: isRTL ? "الخادم متصل" : "Server On",
    },
    ready: {
      icon: <Server className="w-3 h-3" />,
      bg: "bg-emerald-900/40 text-emerald-400",
      label: isRTL ? "Ollama جاهز" : "Ollama ✓",
    },
    generating: {
      icon: <Zap className="w-3 h-3 animate-pulse" />,
      bg: "bg-primary/20 text-primary",
      label: isRTL ? "يولّد..." : "Generating...",
    },
    error: {
      icon: <Server className="w-3 h-3" />,
      bg: "bg-error-bg text-error",
      label: isRTL ? "خطأ الخادم" : "Server Err",
    },
  };

  const { icon, bg, label } = config[agentState] ?? config.disconnected;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        bg
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
};

const StorageBadge: React.FC<{ info: NonNullable<StatusBarProps["storageInfo"]> }> = ({ info }) => {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  const totalEntries = info.tmCount + info.glossaryCount + info.segmentCount;
  const isSyncing = info.isSyncing;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        info.isBackendReachable
          ? "bg-emerald-900/30 text-emerald-400"
          : "bg-surface-hover text-muted-foreground"
      )}
      title={
        isRTL
          ? `ذاكرة الترجمة: ${info.tmCount} | المسرد: ${info.glossaryCount} | الشرائح: ${info.segmentCount}${info.lastSyncAt ? ` | آخر مزامنة: ${new Date(info.lastSyncAt).toLocaleTimeString("ar")}` : ""}`
          : `TM: ${info.tmCount} | Glossary: ${info.glossaryCount} | Segments: ${info.segmentCount}${info.lastSyncAt ? ` | Last sync: ${new Date(info.lastSyncAt).toLocaleTimeString()}` : ""}`
      }
    >
      {isSyncing ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <HardDrive className="w-3 h-3" />
      )}
      <span>
        {isRTL ? "ذاكرة" : "DB"} {totalEntries > 0 ? totalEntries : "—"}
      </span>
    </div>
  );
};

export function StatusBar({
  engineMode = "hybrid",
  gtrStatus = "zero-shot",
  webgpuInfo = { state: "loading" },
  geminiAvailable = false,
  ragState,
  localAgentState = "disconnected",
  segmentCount = 0,
  wordCount = 0,
  storageInfo,
}: StatusBarProps) {
  const { t, locale } = useLanguage();
  const isRTL = locale === "ar";

  return (
    <footer
      className="h-7 bg-sidebar border-t border-border flex items-center justify-between px-3 text-xs select-none"
      dir={isRTL ? "rtl" : undefined}
    >
      {/* Left Section: Engine Status */}
      <div className="flex items-center gap-3">
        <EngineModeBadge mode={engineMode} />
        <GTRBadge status={gtrStatus} />
        <WebGPUBadge info={webgpuInfo} />
        {geminiAvailable && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-400">
            <Cloud className="w-3 h-3" />
            <span>Gemini</span>
          </div>
        )}
        <RAGBadge ragState={ragState} />
        <LocalAgentBadge state={localAgentState} />
        {storageInfo && <StorageBadge info={storageInfo} />}
      </div>

      {/* Right Section: Document Stats */}
      <div className="flex items-center gap-4 text-muted-foreground">
        <span>
          {t("status.segments")}{" "}
          <span className="text-foreground font-medium">{segmentCount}</span>
        </span>
        <span>
          {t("status.words")}{" "}
          <span className="text-foreground font-medium">{wordCount}</span>
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {t("status.footer")}
        </span>
      </div>
    </footer>
  );
}
