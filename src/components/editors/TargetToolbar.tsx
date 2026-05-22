"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import {
  Copy,
  Download,
  Eraser,
  AlignRight,
  AlignLeft,
  FileText,
  CheckCircle,
  GraduationCap,
  ChevronDown,
  Keyboard,
} from "lucide-react";

interface TargetToolbarProps {
  targetText: string;
  onClear: () => void;
  onExplain?: () => void;
  onQA?: () => void;
  langLabel?: string;
}

export function TargetToolbar({ targetText, onClear, onExplain, onQA, langLabel = "AR" }: TargetToolbarProps) {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = targetText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExportTXT = () => {
    setShowExportMenu(false);
    const blob = new Blob([targetText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTMX = () => {
    setShowExportMenu(false);
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<tmx version="1.4"><header creationtool="RDAT" srclang="en-US" adminlang="en-US" datatype="plaintext" segtype="sentence" /><body>`;
    const footer = `</body></tmx>`;
    const sourceLines = (window as unknown as Record<string, string[]>).__lastSourceLines || [];
    const targetLines = targetText.split("\n");
    let body = "";
    for (let i = 0; i < Math.min(sourceLines.length, targetLines.length); i++) {
      if (sourceLines[i].trim() && targetLines[i].trim()) {
        body += `<tu><tuv xml:lang="en-US"><seg>${sourceLines[i].replace(/</g,"&lt;")}</seg></tuv><tuv xml:lang="ar-SA"><seg>${targetLines[i].replace(/</g,"&lt;")}</seg></tuv></tu>\n`;
      }
    }
    const blob = new Blob([header + body + footer], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memory-${Date.now()}.tmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportWord = () => {
    setShowExportMenu(false);
    const html = `<html><head><meta charset="utf-8"><style>body{direction: rtl; font-family: 'Arial'; font-size: 14pt;}</style></head><body>${targetText.split('\n').map(p => `<p>${p}</p>`).join('')}</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-word;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    const msg = isRTL
      ? "هل أنت متأكد من مسح كلا اللوحتين؟"
      : "Are you sure you want to clear both panes?";
    if (window.confirm(msg)) {
      onClear();
    }
  };

  // Close export dropdown when clicking outside
  React.useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      const menu = document.getElementById("export-dropdown");
      const btn = document.getElementById("export-btn");
      if (menu && !menu.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  const DirIcon = langLabel === "EN" ? AlignLeft : AlignRight;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-surface border-b border-border">
      {/* ── Clipboard Group ── */}
      <button
        onClick={handleCopy}
        disabled={!targetText.trim()}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all",
          copied
            ? "text-emerald-500 bg-emerald-500/10"
            : targetText.trim()
              ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
              : "text-muted-foreground/30 cursor-not-allowed"
        )}
        title={isRTL ? "نسخ الترجمة" : "Copy translation"}
      >
        <Copy className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {copied ? (isRTL ? "تم النسخ" : "Copied") : (isRTL ? "نسخ" : "Copy")}
        </span>
      </button>

      <div className="w-px h-4 bg-border/50 mx-1" />

      {/* ── AI Assist Group ── */}
      <button
        onClick={onQA}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
        )}
        title={isRTL ? "فحص الجودة — التحقق من الأرقام وعلامات الترقيم" : "QA Check — verify numbers and punctuation"}
      >
        <CheckCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{isRTL ? "فحص الجودة" : "QA"}</span>
      </button>

      <button
        onClick={onExplain}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
        )}
        title={isRTL ? "المعلم الذكي — شرح الترجمة بالذكاء الاصطناعي" : "AI Tutor — explain this translation with AI"}
      >
        <GraduationCap className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{isRTL ? "المعلم" : "Tutor"}</span>
      </button>

      <div className="w-px h-4 bg-border/50 mx-1" />

      {/* ── Export Group (Dropdown) ── */}
      <div className="relative">
        <button
          id="export-btn"
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={!targetText.trim()}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
            showExportMenu && targetText.trim()
              ? "text-primary bg-primary/10"
              : targetText.trim()
                ? "text-muted-foreground hover:text-primary hover:bg-primary/10"
                : "text-muted-foreground/30 cursor-not-allowed"
          )}
          title={isRTL ? "تصدير الترجمة" : "Export translation"}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isRTL ? "تصدير" : "Export"}</span>
          <ChevronDown className={cn("w-3 h-3 transition-transform", showExportMenu && "rotate-180")} />
        </button>

        {showExportMenu && targetText.trim() && (
          <div
            id="export-dropdown"
            className={cn(
              "absolute top-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-50 min-w-[160px] overflow-hidden",
              isRTL ? "right-0" : "left-0"
            )}
          >
            <button
              onClick={handleExportTXT}
              className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <div className="flex flex-col items-start">
                <span>{isRTL ? "ملف نصي" : "Plain Text"}</span>
                <span className="text-[9px] text-muted-foreground/50">.txt</span>
              </div>
            </button>
            <button
              onClick={handleExportTMX}
              className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-violet-400" />
              <div className="flex flex-col items-start">
                <span>{isRTL ? "ذاكرة الترجمة" : "Translation Memory"}</span>
                <span className="text-[9px] text-muted-foreground/50">.tmx</span>
              </div>
            </button>
            <button
              onClick={handleExportWord}
              className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <div className="flex flex-col items-start">
                <span>{isRTL ? "مستند Word" : "Word Document"}</span>
                <span className="text-[9px] text-muted-foreground/50">.doc</span>
              </div>
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-border/50 mx-1" />

      {/* ── Actions Group ── */}
      <button
        onClick={handleClear}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
        )}
        title={isRTL ? "مسح اللوحتين" : "Clear both panes"}
      >
        <Eraser className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{isRTL ? "مسح" : "Clear"}</span>
      </button>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Keyboard Shortcuts Hint ── */}
      <div className="hidden md:flex items-center gap-1 text-[9px] text-muted-foreground/30">
        <Keyboard className="w-3 h-3" />
        <span>{isRTL ? "Tab=قبول Ctrl+→=كلمة" : "Tab=Accept Ctrl+→=Word"}</span>
      </div>

      {/* ── Target Language Indicator ── */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 ml-1">
        <DirIcon className="w-3 h-3" />
        <span>{langLabel}</span>
      </div>
    </div>
  );
}
