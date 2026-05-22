"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/i18n/translations";
import {
  Languages,
  BookOpen,
  Keyboard,
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
  Globe,
} from "lucide-react";

const featureIconMap = [Sparkles, Shield, Zap, Sparkles];

export function WelcomeTab() {
  const { t, locale } = useLanguage();
  const isRTL = locale === "ar";

  const cards = translations[locale].welcome.cards;
  const shortcuts = translations[locale].welcome.shortcutList;

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background",
        isRTL ? "text-right" : "text-left"
      )}
      dir={isRTL ? "rtl" : undefined}
    >
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Languages className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isRTL ? t("welcome.greeting") : t("welcome.greeting")}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isRTL ? t("welcome.subtitle") : t("welcome.subtitle")}
              </p>
            </div>
          </div>

          {/* Feature highlights bar */}
          <div className="flex items-center gap-4 mt-4">
            {[
              { icon: Globe, label: isRTL ? "عربي" : "EN↔AR" },
              { icon: Shield, label: isRTL ? "بدون إنترنت" : "Offline" },
              { icon: Zap, label: isRTL ? "محلي" : "Local AI" },
              { icon: Sparkles, label: isRTL ? "ذكاء اصطناعي" : "AI-Powered" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-muted-foreground"
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Start Guide */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {isRTL ? t("welcome.quickStart") : t("welcome.quickStart")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {isRTL ? t("welcome.quickStartAr") : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map((card, i) => {
              const Icon = featureIconMap[i] ?? Sparkles;
              return (
                <div
                  key={card.step}
                  className="group relative bg-surface border border-border rounded-xl p-5 transition-all hover:border-primary/40 hover:bg-surface-hover"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-muted/40 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {card.step}
                        </span>
                        <h3 className="text-sm font-semibold text-foreground">
                          {isRTL ? card.title : card.title}
                        </h3>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isRTL ? card.description : card.description}
                  </p>
                  {isRTL && (
                    <p className="text-[10px] text-muted-foreground/50 mt-1.5 italic">
                      {card.descriptionAr}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-6">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {isRTL ? t("welcome.shortcuts") : t("welcome.shortcuts")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {isRTL ? t("welcome.shortcutsAr") : ""}
            </span>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/50">
                  <th
                    className={cn(
                      "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                      isRTL ? "text-right" : "text-left"
                    )}
                  >
                    {isRTL ? "المفتاح" : "Key"}
                  </th>
                  <th
                    className={cn(
                      "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                      isRTL ? "text-right" : "text-left"
                    )}
                  >
                    {isRTL ? "الإجراء" : "Action"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shortcuts.map((sc, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-border/50 last:border-0 transition-colors hover:bg-surface-hover/30"
                    )}
                  >
                    <td className="px-5 py-3">
                      <kbd
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-md",
                          "bg-background border border-border text-xs font-mono text-foreground",
                          "shadow-sm"
                        )}
                      >
                        {sc.keys}
                      </kbd>
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 text-muted-foreground",
                        isRTL ? "text-right" : "text-left"
                      )}
                    >
                      {isRTL ? sc.action : sc.action}
                      {isRTL && (
                        <span className="text-[10px] text-muted-foreground/40 mr-2 italic">
                          {sc.actionAr}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-center gap-4 py-6 border-t border-border">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-3">
              {isRTL ? t("welcome.getStarted") : t("welcome.getStarted")}
            </p>
            <div
              className={cn(
                "flex items-center gap-2 text-xs text-primary animate-pulse"
              )}
            >
              <ArrowRight
                className={cn("w-4 h-4", isRTL ? "rotate-180" : "")}
              />
              <span>
                {isRTL
                  ? "افتح محرر الترجمة من الشريط الجانبي"
                  : "Open Translation Editor from the sidebar"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
