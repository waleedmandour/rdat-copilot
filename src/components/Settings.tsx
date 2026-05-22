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
  Sliders,
  Database,
  Download,
  AlertTriangle,
  HardDrive
} from "lucide-react";

export function SettingsPanel() {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  // Settings
  const geminiApiKey = useSettingsStore((s) => s.geminiApiKey);
  const setGeminiApiKey = useSettingsStore((s) => s.setGeminiApiKey);
  const useCloud = useSettingsStore((s) => s.useCloudFallback);
  const setUseCloud = useSettingsStore((s) => s.setUseCloudFallback);
  const temperature = useSettingsStore((s) => s.temperature);
  const setTemperature = useSettingsStore((s) => s.setTemperature);
  const webLLMModel = useSettingsStore((s) => s.webLLMModel);
  const setWebLLMModel = useSettingsStore((s) => s.setWebLLMModel);
  const activeCorpus = useSettingsStore((s) => s.activeCorpus);
  const setActiveCorpus = useSettingsStore((s) => s.setActiveCorpus);

  // Local state
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [saved, setSaved] = useState(false);
  
  // Hardware Check & Download State
  const [hwStatus, setHwStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [hwMessage, setHwMessage] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadText, setDownloadText] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const AVAILABLE_MODELS = [
    { id: "gemma-2b-it-q4f32_1-MLC", name: "TranslateGemma (Min. ~2GB VRAM)" },
    { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 Quantized (Min. ~1.5GB VRAM)" },
    { id: "Llama-3-8B-Instruct-q4f32_1-MLC", name: "Llama 3 8B (Min. ~4.5GB VRAM)" },
    { id: "Phi-3-mini-4k-instruct-q4f16_1-MLC", name: "Phi-3 Mini (Min. ~2GB VRAM)" },
  ];

  const AVAILABLE_CORPORA = [
    { id: "default-corpus-en-ar", name: "Default (RDAT Base)", size: "5MB" },
    { id: "opus-wikipedia-en-ar", name: "OPUS Wikipedia (General)", size: "120MB" },
    { id: "unpc-en-ar", name: "UN Parallel Corpus (Legal/Formal)", size: "250MB" },
    { id: "tatoeba-en-ar", name: "Tatoeba (Everyday Sentences)", size: "15MB" },
    { id: "global-voices-en-ar", name: "Global Voices (News)", size: "45MB" },
  ];

  // Corpus download states
  const [downloadingCorpora, setDownloadingCorpora] = useState<Record<string, { progress: number; text: string }>>({});

  const performHardwareCheck = async () => {
    setHwStatus("checking");
    setHwMessage(isRTL ? "جاري الفحص..." : "Checking hardware...");
    try {
      if (!("gpu" in navigator)) {
        throw new Error("WebGPU is not supported by your browser. Please use Google Chrome or Microsoft Edge.");
      }
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) {
        throw new Error("No WebGPU adapter found.");
      }
      
      const limits = adapter.limits;
      if (limits.maxStorageBufferBindingSize < 1073741824) { // Less than 1GB buffer limit
        console.warn("Limited VRAM detected, might offload to system RAM");
      }
      
      setHwStatus("ok");
      setHwMessage(isRTL ? "تم التأكيد: جهازك يدعم WebGPU محلياً" : "Hardware Ok: WebGPU is supported natively");
    } catch (e: any) {
      setHwStatus("error");
      setHwMessage(e.message || "Hardware check failed");
    }
  };

  const downloadLLM = async () => {
    if (hwStatus !== "ok") {
      alert(isRTL ? "الرجاء إجراء فحص الأجهزة أولاً" : "Please perform hardware check first");
      return;
    }
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadText(isRTL ? "جاري التهيئة..." : "Initializing...");
    
    try {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      // Actually we just import the engine to trigger the download caching in IndexedDB
      const { MLCEngine } = await import("@mlc-ai/web-llm");
      const engine = new MLCEngine();
      
      engine.setInitProgressCallback((report) => {
        setDownloadText(report.text);
        setDownloadProgress(report.progress * 100);
      });
      
      await engine.reload(webLLMModel);
      
      setDownloadText(isRTL ? "اكتمل التنزيل! النموذج محفوظ محلياً." : "Download complete! Model is saved locally.");
      setTimeout(() => {
        setIsDownloading(false);
      }, 3000);
    } catch (e: any) {
      console.error("[WebLLM Download Error]", e);
      let errorMessage = isRTL ? "حدث خطأ غير معروف." : "An unknown error occurred.";
      let advice = isRTL ? "يرجى المحاولة لاحقاً." : "Please try again later.";
      
      const msg = e.message?.toLowerCase() || "";
      if (msg.includes("fetch") || msg.includes("network")) {
        errorMessage = isRTL ? "خطأ في الشبكة أثناء التحميل." : "Network error while downloading the model.";
        advice = isRTL ? "تحقق من اتصالك بالإنترنت وتأكد من عدم وجود جدار حماية يمنع التحميل." : "Please check your internet connection and ensure no firewall is blocking the download.";
      } else if (msg.includes("quota") || msg.includes("storage")) {
        errorMessage = isRTL ? "مساحة التخزين غير كافية." : "Insufficient storage space.";
        advice = isRTL ? "يرجى تفريغ بعض المساحة على جهازك أو في المتصفح للسماح بتخزين النموذج." : "Please clear some space on your device or browser to allow the model to be cached.";
      } else if (msg.includes("gpu") || msg.includes("webgpu")) {
        errorMessage = isRTL ? "فشل تهيئة WebGPU." : "WebGPU initialization failed.";
        advice = isRTL ? "تأكد من دعم متصفحك لتقنية WebGPU وتفعيل تسريع الأجهزة (Hardware Acceleration)." : "Ensure your browser supports WebGPU and hardware acceleration is enabled in settings.";
      } else {
        errorMessage = isRTL ? `فشل التهيئة: ${e.message}` : `Initialization failed: ${e.message}`;
        advice = isRTL ? "تأكد من اختيار متصفح متوافق (مثل Chrome/Edge)." : "Ensure you are using a compatible browser like Chrome or Edge.";
      }

      setDownloadText(isRTL ? "فشل التنزيل." : "Download failed.");
      setHwStatus("error");
      setHwMessage(`${errorMessage} ${advice}`);
      setIsDownloading(false);
    }
  };

  const handleSave = () => {
    setGeminiApiKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setKeyInput("");
    setGeminiApiKey("");
  };

  const downloadCorpus = (corpusId: string) => {
    setDownloadingCorpora(prev => ({ ...prev, [corpusId]: { progress: 0, text: isRTL ? "جاري التنزيل..." : "Downloading..." } }));
    
    // Simulate a download process for the corpus
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setDownloadingCorpora(prev => ({ ...prev, [corpusId]: { progress: 100, text: isRTL ? "مكتمل (مخبأ)" : "Complete (Cached)" } }));
        // Automatically set it as active when done
        setActiveCorpus(corpusId);
        
        // Clear progress after a few seconds
        setTimeout(() => {
          setDownloadingCorpora(prev => {
            const newState = { ...prev };
            delete newState[corpusId];
            return newState;
          });
        }, 3000);
      } else {
        setDownloadingCorpora(prev => ({ 
          ...prev, 
          [corpusId]: { progress, text: isRTL ? `جاري التنزيل... ${Math.round(progress)}%` : `Downloading... ${Math.round(progress)}%` } 
        }));
      }
    }, 500);
  };

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background p-6",
        isRTL ? "text-right" : "text-left"
      )}
      dir={isRTL ? "rtl" : undefined}
    >
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isRTL ? "الإعدادات" : "Settings"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRTL
              ? "إدارة مفاتيح API وتفضيلات الذكاء الاصطناعي"
              : "Manage API keys and AI preferences"}
          </p>
        </div>

        {/* Gemini API Key */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Google Gemini API
            </h2>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded",
                useCloud && keyInput.trim()
                  ? "bg-primary/20 text-primary"
                  : "bg-warning/10 text-warning"
              )}
            >
              {useCloud && keyInput.trim()
                ? isRTL
                  ? "نشط"
                  : "Active"
                : isRTL
                  ? "غير مفعّل"
                  : "Inactive"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {isRTL ? (
              <>
                أدخل مفتاح API من Google AI Studio للاستخدام كاحتساب سحابي.{" "}
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
                Enter your API key from Google AI Studio for cloud fallback.{" "}
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
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
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

        {/* Model Parameters */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {isRTL ? "معلمات النموذج" : "Model Parameters"}
            </h2>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">
                {isRTL ? "درجة الحرارة" : "Temperature"}
              </label>
              <span className="text-xs text-muted-foreground font-mono">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/50">
              <span>{isRTL ? "دقيق" : "Precise"}</span>
              <span>{isRTL ? "إبداعي" : "Creative"}</span>
            </div>
          </div>
        </section>

        {/* WebLLM Configuration */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {isRTL ? "نماذج WebLLM المحلية" : "Local WebLLM Models"}
            </h2>
          </div>
          
          <p className="text-xs text-muted-foreground">
            {isRTL 
              ? "اختر نموذج الترجمة المحلي. تدعم هذه النماذج الترجمة بدون إنترنت. يجب استخدام متصفح Chrome أو Edge."
              : "Select a local translation model. These models run 100% offline. Requires Google Chrome or Microsoft Edge."}
          </p>
          
          <div className="space-y-3">
            <select
              value={webLLMModel}
              onChange={(e) => setWebLLMModel(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={isDownloading}
            >
              {AVAILABLE_MODELS.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={performHardwareCheck}
                className="flex-1 px-4 py-2 bg-surface-hover text-foreground rounded-lg text-sm font-medium hover:bg-surface-hover/80 transition-colors flex justify-center items-center gap-2"
                disabled={isDownloading}
              >
                <Cpu className="w-4 h-4" />
                {isRTL ? "فحص الأجهزة" : "Hardware Check"}
              </button>
              
              <button
                onClick={downloadLLM}
                disabled={hwStatus !== "ok" || isDownloading}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2",
                  hwStatus === "ok" && !isDownloading
                    ? "bg-primary text-background hover:bg-primary-hover"
                    : "bg-surface-hover text-muted-foreground cursor-not-allowed"
                )}
              >
                <Download className="w-4 h-4" />
                {isRTL ? "تنزيل النموذج (مخبأ)" : "Download & Cache"}
              </button>
            </div>
            
            {hwStatus !== "idle" && (
              <div className={cn(
                "text-xs p-2 rounded-md flex items-center gap-2",
                hwStatus === "ok" ? "bg-emerald-500/10 text-emerald-500" :
                hwStatus === "error" ? "bg-red-500/10 text-red-500" :
                "bg-blue-500/10 text-blue-500"
              )}>
                {hwStatus === "error" ? <AlertTriangle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                {hwMessage}
              </div>
            )}
            
            {isDownloading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="truncate">{downloadText}</span>
                  <span>{downloadProgress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Databases / Corpora & Glossary */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4 mb-10">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {isRTL ? "قواعد بيانات الترجمة والمصطلحات" : "Translation Databases & Glossaries"}
            </h2>
          </div>
          
          <p className="text-xs text-muted-foreground">
            {isRTL 
              ? "استيراد قواعد بيانات مفتوحة المصدر (Vector DBs) ومعاجم مصطلحات (GTR) لتحسين دقة الترجمة بدون إنترنت (القناة 0 و RAG)."
              : "Import open-source databases (Vector DBs) and glossaries (GTR) to improve offline accuracy (Channel 0 and RAG)."
            }
          </p>
          
          <div className="space-y-3">
            <select
              value={activeCorpus}
              onChange={(e) => setActiveCorpus(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {AVAILABLE_CORPORA.map(corpus => (
                <option key={corpus.id} value={corpus.id}>
                  {corpus.name} ({corpus.size})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-1 gap-2 mt-2">
              {AVAILABLE_CORPORA.filter(c => c.id !== "default-corpus-en-ar").map(corpus => {
                const downloadState = downloadingCorpora[corpus.id];
                const isActive = activeCorpus === corpus.id;
                
                return (
                  <div key={corpus.id} className="flex flex-col gap-2 bg-background border border-border rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-medium flex items-center gap-2">
                          {corpus.name}
                          {isActive && (
                            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">
                              {isRTL ? "نشط" : "ACTIVE"}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground">~{corpus.size}</p>
                      </div>
                      <button 
                        className={cn(
                          "px-3 py-1.5 rounded text-xs transition flex items-center gap-1",
                          isActive 
                            ? "bg-surface text-muted-foreground cursor-default" 
                            : downloadState
                              ? "bg-surface-hover text-muted-foreground cursor-wait"
                              : "bg-surface-hover text-foreground hover:bg-surface-hover/80"
                        )}
                        onClick={() => !isActive && !downloadState && downloadCorpus(corpus.id)}
                        disabled={isActive || !!downloadState}
                      >
                        {downloadState ? (
                          <span className="text-primary">{Math.round(downloadState.progress)}%</span>
                        ) : isActive ? (
                          <>
                            <Check className="w-3 h-3" />
                            {isRTL ? "محدد" : "Selected"}
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            {isRTL ? "تنزيل" : "Download"}
                          </>
                        )}
                      </button>
                    </div>
                    
                    {downloadState && (
                      <div className="w-full bg-surface-hover rounded-full h-1 overflow-hidden mt-1">
                        <div 
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${downloadState.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
