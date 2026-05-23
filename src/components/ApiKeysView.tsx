"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useLanguage } from "@/context/LanguageContext";
import {
  KeyRound,
  ExternalLink,
  Check,
  X,
  Eye,
  EyeOff,
  Cloud,
  Cpu,
  Shield,
  Zap,
} from "lucide-react";

/**
 * API Keys Page — dedicated page for managing API keys.
 * Accessible from the "API Keys" sidebar item.
 * The Gemini API key is also available in Settings, but this page
 * provides a focused, streamlined experience for key management.
 */
export function ApiKeysView() {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  // Settings
  const geminiApiKey = useSettingsStore((s) => s.geminiApiKey);
  const setGeminiApiKey = useSettingsStore((s) => s.setGeminiApiKey);
  const useCloud = useSettingsStore((s) => s.useCloudFallback);
  const setUseCloud = useSettingsStore((s) => s.setUseCloudFallback);

  // Local state
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setGeminiApiKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setKeyInput("");
    setGeminiApiKey("");
  };

  const isKeyActive = useCloud && keyInput.trim();

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background",
        isRTL ? "text-right" : "text-left"
      )}
      dir={isRTL ? "rtl" : undefined}
    >
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isRTL ? "مفاتيح API" : "API Keys"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isRTL
                  ? "إدارة مفاتيح الوصول لخدمات الذكاء الاصطناعي"
                  : "Manage access keys for AI services"}
              </p>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-3 mt-4">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs",
                isKeyActive
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-surface border-border text-muted-foreground"
              )}
            >
              {isKeyActive ? (
                <Zap className="w-3.5 h-3.5" />
              ) : (
                <Shield className="w-3.5 h-3.5" />
              )}
              <span>
                {isKeyActive
                  ? isRTL
                    ? "نشط"
                    : "Active"
                  : isRTL
                    ? "غير مفعّل"
                    : "Inactive"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-muted-foreground">
              <Cloud className="w-3.5 h-3.5" />
              <span>{isRTL ? "سحابي" : "Cloud"}</span>
            </div>
          </div>
        </div>

        {/* Gemini API Key Section */}
        <section className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Google Gemini API
            </h2>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded",
                isKeyActive
                  ? "bg-primary/20 text-primary"
                  : "bg-warning/10 text-warning"
              )}
            >
              {isKeyActive
                ? isRTL
                  ? "نشط"
                  : "Active"
                : isRTL
                  ? "غير مفعّل"
                  : "Inactive"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {isRTL ? (
              <>
                أدخل مفتاح API من Google AI Studio لاستخدام نموذج Gemini
                كاحتساب سحابي عند عدم توفر WebGPU محلياً. يعمل هذا المفتاح
                كقناة احتياطية ضمن خط أنابيب المقترحات المتعدد القنوات.{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-1"
                >
                  الحصول على مفتاح
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            ) : (
              <>
                Enter your API key from Google AI Studio to use the Gemini model
                as a cloud fallback when WebGPU is not available locally. This key
                powers the cloud channel in the multi-channel suggestion pipeline.{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-1"
                >
                  Get a key
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </p>

          {/* Key Input */}
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className={cn(
                "w-full bg-background border border-border rounded-lg px-4 py-2.5 pr-20",
                "text-sm text-foreground placeholder:text-muted-foreground/40",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              )}
            />
            <div className={cn(
              "absolute top-1/2 -translate-y-1/2 flex items-center gap-1",
              isRTL ? "left-2" : "right-2"
            )}>
              <button
                onClick={() => setShowKey((v) => !v)}
                className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              {keyInput && (
                <button
                  onClick={handleReset}
                  className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!keyInput.trim()}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                keyInput.trim()
                  ? "bg-primary text-background hover:bg-primary-hover"
                  : "bg-surface-hover text-muted-foreground cursor-not-allowed"
              )}
            >
              <span className="flex items-center gap-1.5">
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {isRTL ? "تم الحفظ" : "Saved"}
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    {isRTL ? "حفظ المفتاح" : "Save Key"}
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Cloud Fallback Toggle */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">
                {isRTL
                  ? "استخدام الاحتساب السحابي عند عدم توفر WebGPU"
                  : "Use cloud fallback when WebGPU unavailable"}
              </span>
            </div>
            <button
              onClick={() => setUseCloud(!useCloud)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                useCloud ? "bg-primary" : "bg-surface-hover"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-background transition-all",
                  useCloud
                    ? isRTL
                      ? "right-0.5"
                      : "left-0.5"
                    : isRTL
                      ? "right-5"
                      : "left-0.5"
                )}
              />
            </button>
          </div>
        </section>

        {/* Security Notice */}
        <div className="mt-6 p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isRTL ? "ملاحظة أمنية" : "Security Notice"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isRTL
                  ? "يتم تخزين مفتاح API محلياً في متصفحك فقط باستخدام localStorage. لا يتم إرسال المفتاح إلى أي خوادم خارجية باستثناء Google AI Studio للاستدلال. لا تشارك مفتاح API مع أي شخص."
                  : "Your API key is stored locally in your browser using localStorage only. It is never sent to any external servers except Google AI Studio for inference. Do not share your API key with anyone."}
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-6 p-4 bg-surface border border-border rounded-xl">
          <h3 className="text-sm font-medium text-foreground mb-2">
            {isRTL ? "كيف يعمل مفتاح Gemini" : "How the Gemini Key Works"}
          </h3>
          <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              {isRTL
                ? "عند تفعيل المفتاح، يعمل Gemini كإحدى القنوات الخمس في خط أنابيب المقترحات المتعدد القنوات:"
                : "When enabled, Gemini operates as one of five channels in the multi-channel suggestion pipeline:"}
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { ch: "LTE", desc: isRTL ? "محلي فوري (تزامني)" : "Local instant (synchronous)" },
                { ch: "Prefetch", desc: isRTL ? "مخبأ مسبق (تزامني)" : "Prefetch cache (synchronous)" },
                { ch: "RAG", desc: isRTL ? "بحث في قاعدة البيانات (3 ثوانٍ)" : "Database search (3s)" },
                { ch: "WebLLM", desc: isRTL ? "نموذج محلي WebGPU (5 ثوانٍ)" : "Local WebGPU model (5s)" },
                { ch: "Gemini", desc: isRTL ? "سحابي عبر API (3 ثوانٍ)" : "Cloud via API (3s)" },
              ].map(({ ch, desc }) => (
                <div key={ch} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded w-16 text-center">
                    {ch}
                  </span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
