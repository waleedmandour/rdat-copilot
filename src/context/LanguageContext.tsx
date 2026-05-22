"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { translations, Locale } from "@/i18n/translations";

type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends string
          ? K
          : T[K] extends object
            ? `${K}.${DeepKeyOf<T[K]>}`
            : never
        : never;
    }[keyof T]
  : never;

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  isRTL: boolean;
  t: (key: DeepKeyOf<typeof translations.en>) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Read persisted locale from localStorage, default to "en"
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rdat-locale");
      if (saved === "ar" || saved === "en") return saved;
    }
    return "en";
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("rdat-locale", newLocale);
    // Also update the HTML dir attribute for proper RTL support
    if (typeof document !== "undefined") {
      document.documentElement.dir = newLocale === "ar" ? "rtl" : "ltr";
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next = prev === "en" ? "ar" : "en";
      localStorage.setItem("rdat-locale", next);
      if (typeof document !== "undefined") {
        document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
      }
      return next;
    });
  }, []);

  const isRTL = locale === "ar";

  const t = useCallback(
    (key: DeepKeyOf<typeof translations.en>): string => {
      const keys = key.split(".");
      let value: unknown = translations[locale];
      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          // Fallback to English
          value = translations.en;
          for (const fk of keys) {
            if (value && typeof value === "object" && fk in value) {
              value = (value as Record<string, unknown>)[fk];
            } else {
              return key;
            }
          }
          break;
        }
      }
      return typeof value === "string" ? value : key;
    },
    [locale]
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale, toggleLocale, isRTL, t }),
    [locale, toggleLocale, isRTL, t]
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
