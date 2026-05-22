/**
 * Local-First Configuration Utility
 *
 * Centralizes all backend endpoint configuration.
 * Defaults to localhost:8000 (FastAPI backend).
 * Override via NEXT_PUBLIC_LOCAL_BACKEND_URL env var.
 *
 * Frontend → GitHub Pages (static)
 * Backend  → localhost:8000 (FastAPI + Ollama)
 */

/** Base URL for the local FastAPI backend */
export const LOCAL_BACKEND_URL =
  process.env.NEXT_PUBLIC_LOCAL_BACKEND_URL || "http://localhost:8000";

/** Full endpoint for SSE translation streaming */
export const TRANSLATE_STREAM_URL = `${LOCAL_BACKEND_URL}/translate/stream`;

/** Full endpoint for TM/Glossary search */
export const TM_SEARCH_URL = `${LOCAL_BACKEND_URL}/tm/search`;

/** Full endpoint for health check */
export const HEALTH_CHECK_URL = `${LOCAL_BACKEND_URL}/health`;

/** Full endpoint for sync (pull latest TM from backend) */
export const SYNC_TM_URL = `${LOCAL_BACKEND_URL}/sync/tm`;

/** Full endpoint for sync (pull latest glossary from backend) */
export const SYNC_GLOSSARY_URL = `${LOCAL_BACKEND_URL}/sync/glossary`;

/** Full endpoint for translation validation */
export const VALIDATE_URL = `${LOCAL_BACKEND_URL}/validate`;

/** Full endpoint for segments CRUD */
export const SEGMENTS_URL = `${LOCAL_BACKEND_URL}/segments`;

/** Full endpoint for glossary CRUD */
export const GLOSSARY_URL = `${LOCAL_BACKEND_URL}/glossary/entries`;

/** Full endpoint for bulk TM import */
export const TM_BULK_IMPORT_URL = `${LOCAL_BACKEND_URL}/tm/bulk-import`;

/** Request timeout for non-streaming endpoints (ms) */
export const BACKEND_TIMEOUT_MS = 5000;

/** SSE reconnection delay (ms) */
export const SSE_RECONNECT_DELAY_MS = 3000;

/** Sync interval for pulling backend data to IndexedDB cache (ms) */
export const SYNC_INTERVAL_MS = 60_000; // 1 minute

/**
 * Check whether the local FastAPI backend is reachable.
 * Uses a lightweight GET /health endpoint with a short timeout.
 *
 * @returns true if backend responded with 200, false otherwise
 */
export async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_CHECK_URL, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the backend health status with details.
 * Returns structured info about Ollama, SQLite, and model status.
 */
export interface BackendHealth {
  status: "ok" | "degraded" | "down";
  ollama: boolean;
  sqlite: boolean;
  model: string | null;
  modelLoaded: boolean;
  version: string;
}

export async function getBackendHealth(): Promise<BackendHealth | null> {
  try {
    const res = await fetch(HEALTH_CHECK_URL, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendHealth;
  } catch {
    return null;
  }
}

/**
 * Run translation validation on the backend.
 * Sends a source/target pair and receives quality check results.
 */
export interface ValidationResult {
  is_valid: boolean;
  warnings: string[];
  errors: string[];
  score: number;
}

export async function validateTranslation(
  source: string,
  target: string
): Promise<ValidationResult | null> {
  try {
    const res = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      body: JSON.stringify({ source, target }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ValidationResult;
  } catch {
    return null;
  }
}
