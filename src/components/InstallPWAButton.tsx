"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Download, X } from "lucide-react";

/**
 * InstallPWAButton — Shows a dismissable install banner.
 *
 * Lifecycle:
 *  1. On mount, checks if the app is already installed (standalone mode)
 *  2. Listens for `beforeinstallprompt` event from the browser
 *  3. When the event fires, shows the banner with "Install" button
 *  4. User can click "Install" to trigger the native install prompt
 *  5. User can dismiss the banner (remembered in sessionStorage)
 *  6. After successful install, hides the banner permanently
 *
 * PWA Install Requirements (Chrome):
 *  - Served over HTTPS
 *  - Valid manifest.json with name, icons (192px + 512px), start_url, display
 *  - Registered service worker with fetch handler
 *  - Valid PNG icons (not empty/0-byte files)
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "rdat-install-dismissed";

export function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Check if already installed (standalone mode or iOS PWA)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true // iOS Safari
    );
  });
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "true";
  });

  useEffect(() => {

    // Listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Listen for appinstalled event (user may install from browser menu)
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setIsInstalled(true);
      }
    } catch (err) {
      console.warn("[InstallPWA] Install prompt failed:", err);
    }

    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "true");
    setDeferredPrompt(null);
  }, []);

  if (isInstalled || isDismissed || !deferredPrompt) return null;

  return (
    <div className="w-full bg-primary/10 border-b border-primary/20 text-foreground px-4 py-2.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-primary/20 rounded-md text-primary">
          <Download className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Install App</span>
          <span className="text-xs text-muted-foreground">
            Install the app on your device for quick access and offline capabilities.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="px-4 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-md transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
