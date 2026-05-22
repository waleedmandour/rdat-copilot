"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import {
  X,
  Languages,
  Keyboard,
  BookOpen,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface QuickGuideModalProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "rdat_guide_seen";

export function QuickGuideModal({ open, onClose }: QuickGuideModalProps) {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";
  const [activeTab, setActiveTab] = useState<"en" | "ar">(isRTL ? "ar" : "en");

  const handleSeen = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose();
  };

  if (!open) return null;

  const features = activeTab === "en" ? [
    {
      icon: Languages,
      title: "Source/Target Sync",
      description: "Two synchronized panes: English (Source) on the left, Arabic (Target) on the right. When you click on any line in the Target pane, the corresponding Source line highlights automatically in blue — helping you never lose your place.",
      tip: "Click any line in Arabic to see the English highlight",
    },
    {
      icon: Keyboard,
      title: "Ghost Text Autocomplete",
      description: "As you type in Arabic, gray ghost text appears suggesting completions. These come from our AI engines (LTE, WebLLM, or Gemini) and appear inline — just like GitHub Copilot for code.",
      tips: [
        { key: "Tab", action: "Accept full suggestion" },
        { key: "Ctrl + →", action: "Accept next word only" },
        { key: "Esc", action: "Dismiss suggestion" },
        { key: "Alt + ]", action: "Cycle alternatives" },
      ],
    },
    {
      icon: BookOpen,
      title: "GTR Glossary & Vector DB",
      description: "Access the Glossary panel to view and manage translation term pairs. Upload your own corpus JSON files to customize suggestions. The vector database provides semantic search for contextually relevant translations.",
      tip: "Navigate via sidebar → GTR Glossary",
    },
    {
      icon: CheckCircle2,
      title: "AI Tutor & QA Linter",
      description: "Ask the built-in AI Tutor to explain translation choices or run the QA Linter to spot number mismatches, punctuation errors, and terminology violations instantly.",
      tip: "Use the 🎓 and 🔍 icons in the Target pane toolbar",
    },
    {
      icon: Languages,
      title: "Document Exports & TMX",
      description: "Translate your texts while preserving structure. Export translated sessions directly to MS Word (.doc) or save your Translation Memories (.tmx) for your portfolio.",
      tip: "Export icons are available in the Target pane toolbar",
    }
  ] : [
    {
      icon: Languages,
      title: "مزامنة المصدر والهدف",
      description: "لوحتان متزامنتان: الإنجليزية (المصدر) على اليسار والعربية (الهدف) على اليمين. عند النقر على أي سطر في لوحة الهدف، يتم تمييز السطر المقابل في المصدر تلقائياً باللون الأزرق.",
      tip: "انقر على أي سطر بالعربية لرؤية التمييز الإنجليزي",
    },
    {
      icon: Keyboard,
      title: "الإكمال التلقائي بالنص الشبحي",
      description: "أثناء الكتابة بالعربية، يظهر نص رمادي شفاف يقترح إكمالات. تأتي من محركات الذكاء الاصطناعي وتظهر مضمّنة - تماماً مثل GitHub Copilot.",
      tips: [
        { key: "Tab", action: "قبول الاقتراح كاملاً" },
        { key: "Ctrl + →", action: "قبول الكلمة التالية فقط" },
        { key: "Esc", action: "تجاهل الاقتراح" },
        { key: "Alt + ]", action: "التبديل بين البدائل" },
      ],
    },
    {
      icon: BookOpen,
      title: "مسرد GTR وقاعدة بيانات المتجهات",
      description: "افتح لوحة المسرد لعرض وإدارة أزواج المصطلحات. حمّل ملفات JSON الخاصة بك لتخصيص الاقتراحات. توفر قاعدة بيانات المتجهات بحثاً دلالياً لترجمات ذات صلة سياقية.",
      tip: "انتقل عبر الشريط الجانبي ← مسرد GTR",
    },
    {
      icon: CheckCircle2,
      title: "المعلم الذكي وفحص الجودة",
      description: "اطلب من المعلم الذكي شرح اختيارات الترجمة أو شغل فاحص الجودة (QA Linter) لاكتشاف الأرقام المفقودة وأخطاء علامات الترقيم والمصطلحات فوراً.",
      tip: "استخدم أيقونات 🎓 و 🔍 في شريط لوحة الهدف",
    },
    {
      icon: Languages,
      title: "تصدير المستندات و TMX",
      description: "ترجم نصوصك مع الحفاظ على هيكلها. صُدّر جلساتك المترجمة مباشرة كملف MS Word (.doc) أو احفظ ذاكرات الترجمة (.tmx) لملفك المهني.",
      tip: "أيقونات التصدير متوفرة في شريط لوحة الهدف",
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSeen}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative w-full max-w-2xl max-h-[85vh] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        )}
        dir={isRTL ? "rtl" : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {activeTab === "en" ? "Welcome to RDAT Copilot" : "مرحباً بك في المساعد RDAT"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeTab === "en" ? "Quick Start Guide" : "دليل البدء السريع"}
              </p>
            </div>
          </div>
          <button
            onClick={handleSeen}
            className="p-2 rounded-lg hover:bg-surface-hover text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border/50">
          <button
            onClick={() => setActiveTab("en")}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
              activeTab === "en"
                ? "bg-primary text-background"
                : "bg-surface-hover text-muted-foreground hover:text-foreground"
            )}
          >
            English
          </button>
          <button
            onClick={() => setActiveTab("ar")}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
              activeTab === "ar"
                ? "bg-primary text-background"
                : "bg-surface-hover text-muted-foreground hover:text-foreground"
            )}
          >
            العربية
          </button>
        </div>

        {/* Content */}
        <div
          className={cn(
            "flex-1 overflow-y-auto px-6 py-5 space-y-5",
            activeTab === "ar" ? "text-right" : ""
          )}
          dir={activeTab === "ar" ? "rtl" : undefined}
          lang={activeTab === "ar" ? "ar" : undefined}
        >
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div key={i} className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-primary-muted/30 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                  {"tip" in feature && feature.tip && (
                    <div className="flex items-center gap-1.5 text-[11px] text-primary/70">
                      <ArrowRight className="w-3 h-3" />
                      <span>{feature.tip}</span>
                    </div>
                  )}
                  {"tips" in feature && feature.tips && (
                    <div className="space-y-1 mt-2">
                      {feature.tips.map((t, j) => (
                        <div key={j} className="flex items-center gap-2 text-[11px]">
                          <kbd className="px-2 py-0.5 rounded bg-background border border-border text-[10px] font-mono text-foreground">
                            {t.key}
                          </kbd>
                          <span className="text-muted-foreground">{t.action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className={cn(
            "flex items-center justify-between px-6 py-4 border-t border-border bg-surface/50",
            activeTab === "ar" ? "text-right" : ""
          )}
        >
          <p className="text-[10px] text-muted-foreground/50">
            {activeTab === "en"
              ? "You can reopen this guide anytime from the Help button in the sidebar."
              : "يمكنك إعادة فتح هذا الدليل في أي وقت من زر المساعدة في الشريط الجانبي."}
          </p>
          <button
            onClick={handleSeen}
            className="px-5 py-2 rounded-lg bg-primary text-background text-xs font-semibold hover:bg-primary-hover transition-colors"
          >
            {activeTab === "en" ? "Get Started" : "ابدأ الآن"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Check if the guide has been seen before.
 */
export function hasSeenGuide(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

/**
 * Mark the guide as seen.
 */
export function markGuideSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, "true");
}
