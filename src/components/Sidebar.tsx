"use client";

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Languages,
  Database,
  Cpu,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Globe,
  Moon,
  Sun
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "next-themes";

export type NavItem =
  | "translator"
  | "glossary"
  | "models"
  | "api-keys"
  | "settings";

interface SidebarProps {
  activeItem?: NavItem;
  onNavItemChange?: (item: NavItem) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenGuide?: () => void;
}

const navIconMap: Record<NavItem, React.ElementType> = {
  translator: Languages,
  glossary: BookOpen,
  models: Cpu,
  "api-keys": KeyRound,
  settings: Settings,
};

export function Sidebar({
  activeItem = "translator",
  onNavItemChange,
  collapsed = false,
  onToggleCollapse,
  onOpenGuide,
}: SidebarProps) {
  const { t, locale, toggleLocale } = useLanguage();
  const [hoveredItem, setHoveredItem] = useState<NavItem | null>(null);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // Prevent hydration mismatch — theme is undefined on server
  useEffect(() => { setMounted(true); }, []);

  const navItems: { id: NavItem; label: string; icon: React.ElementType }[] = [
    { id: "translator", label: t("nav.translator"), icon: navIconMap.translator },
    { id: "glossary", label: t("nav.glossary"), icon: navIconMap.glossary },
    { id: "models", label: t("nav.models"), icon: navIconMap.models },
    { id: "api-keys", label: t("nav.apiKeys"), icon: navIconMap["api-keys"] },
    { id: "settings", label: t("nav.settings"), icon: navIconMap.settings },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-border transition-all duration-300 ease-in-out",
        collapsed ? "w-14" : "w-60"
      )}
      dir={locale === "ar" ? "rtl" : undefined}
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            {/* App Logo */}
            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src="/logo.svg"
                alt="RDAT Copilot"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground tracking-wide">
                RDAT
              </span>
              <span className="text-[10px] text-muted-foreground -mt-0.5">
                {t("sidebar.copilot")} v1.0
              </span>
            </div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            "hover:bg-surface-hover text-muted-foreground hover:text-foreground"
          )}
          title={
            collapsed ? t("sidebar.expand") : t("sidebar.collapse")
          }
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = id === activeItem;
          const isHovered = id === hoveredItem;

          return (
            <button
              key={id}
              onClick={() => onNavItemChange?.(id)}
              onMouseEnter={() => setHoveredItem(id)}
              onMouseLeave={() => setHoveredItem(null)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 transition-colors",
                "text-sm",
                collapsed ? "justify-center px-0" : "",
                isActive
                  ? "bg-primary-muted/30 text-primary border-r-2 border-primary"
                  : isHovered
                    ? "bg-surface-hover text-foreground"
                    : "text-muted-foreground hover:text-foreground"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <span className="truncate">{label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Language Toggle + Footer */}
      <div className="border-t border-border">
        {mounted && (
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 transition-colors",
            "text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          )}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          {!collapsed && (
            <span className="truncate">
              {theme === "dark" ? (locale === "ar" ? "الوضع الفاتح" : "Light Mode") : (locale === "ar" ? "الوضع الداكن" : "Dark Mode")}
            </span>
          )}
        </button>
        )}

        <button
          onClick={toggleLocale}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 transition-colors",
            "text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          )}
          title={locale === "en" ? "التبديل إلى العربية" : "Switch to English"}
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <span className="truncate flex items-center gap-2">
              {locale === "en" ? "العربية" : "English"}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-bold",
                  "bg-primary/20 text-primary"
                )}
              >
                {locale === "en" ? "AR" : "EN"}
              </span>
            </span>
          )}
        </button>

        {/* Help/Guide Button */}
        {!collapsed && onOpenGuide && (
          <button
            onClick={onOpenGuide}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 transition-colors",
              "text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            )}
            title={locale === "en" ? "Quick Guide" : "دليل سريع"}
          >
            <BookOpen className="w-4 h-4 flex-shrink-0" />
            <span>{locale === "en" ? "Quick Guide" : "دليل سريع"}</span>
          </button>
        )}

        {/* User Area + Signature */}
        {!collapsed && (
          <div className="px-3 py-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center">
                <span className="text-[10px] font-medium text-primary">WM</span>
              </div>
              <span className="truncate">Waleed Mandour</span>
            </div>
            <div className="text-[10px] text-muted-foreground/40 leading-relaxed">
              Created by{" "}
              <a
                href="mailto:w.abumandour@squ.edu.om"
                className="text-muted-foreground/60 hover:text-primary transition-colors"
              >
                Dr. Waleed Mandour
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
