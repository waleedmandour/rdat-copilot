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

/** Full endpoint for sync (pull latest TM/Glossary from backend) */
export const SYNC_URL = `${LOCAL_BACKEND_URL}/sync/tm`;

/** Request timeout for non-streaming endpoints (ms) */
export const BACKEND_TIMEOUT_MS = 5000;

/** SSE reconnection delay (ms) */
export const SSE_RECONNECT_DELAY_MS = 3000;

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
