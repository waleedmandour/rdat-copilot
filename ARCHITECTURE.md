# Architecture

This document describes the system architecture of RDAT Copilot, a local-first AI-powered Computer-Assisted Translation (CAT) tool for English-to-Arabic professional translation.

---

## Overview

RDAT Copilot follows a **local-first architecture** where the frontend is a static Progressive Web App (PWA) deployed on GitHub Pages, and the backend runs locally on the user's machine via Docker or Python. The system is designed to work fully offline after initial load, with the local FastAPI backend providing the only network dependency for LLM-powered features.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User's Browser                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   Next.js Static PWA                          │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │  │
│  │  │ Monaco Editor│  │   Zustand    │  │    IndexedDB Cache   │  │  │
│  │  │ (Source+     │  │   Stores     │  │  (TM, Glossary,      │  │  │
│  │  │  Target)     │  │ (Settings,   │  │   Segments)          │  │  │
│  │  └──────┬───────┘  │  Workspace) │  └──────────┬───────────┘  │  │
│  │         │          └──────┬──────┘             │              │  │
│  │         │                 │                    │              │  │
│  │  ┌──────▼─────────────────▼────────────────────▼───────────┐  │  │
│  │  │              Ghost Text Provider (Monaco)                │  │  │
│  │  │                                                          │  │  │
│  │  │  Ch0: LTE (<5ms)    Ch1: RAG/SQLite (~50ms)             │  │  │
│  │  │  Ch2: Ollama (~200ms)  Ch3: WebLLM (~500ms)             │  │  │
│  │  │  Ch4: Gemini (~3s)                                      │  │  │
│  │  └─────────────────────────┬───────────────────────────────┘  │  │
│  └────────────────────────────┼──────────────────────────────────┘  │
│                               │ HTTP/SSE                            │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │              FastAPI Backend (localhost:8000)                  │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │  Orchestrator │  │ Ollama Client│  │  SQLite + FTS5     │  │  │
│  │  │  (Retrieve →  │  │ (Streaming   │  │  (TM, Glossary,    │  │  │
│  │  │   Suggest →   │  │  Inference)  │  │   Segments)        │  │  │
│  │  │   Validate)   │  │              │  │                    │  │  │
│  │  └──────┬────────┘  └──────┬───────┘  └────────────────────┘  │  │
│  └─────────┼──────────────────┼──────────────────────────────────┘  │
│            │                  │                                      │
└────────────┼──────────────────┼──────────────────────────────────────┘
             │                  │
    ┌────────▼────────┐  ┌──────▼───────┐
    │  rdat_copilot.db│  │    Ollama    │
    │  (SQLite WAL)   │  │  (localhost:  │
    │                 │  │   11434)     │
    └─────────────────┘  │  qwen2.5:7b  │
                         └──────────────┘
```

---

## 5-Channel Suggestion Cascade

The core innovation is a **cascading multi-channel suggestion system** that delivers increasingly better translation suggestions. Lower-latency channels produce results first; if a higher-quality channel finishes later, its result replaces the current suggestion.

### Channel 0: LTE (Local Translation Engine)

- **Latency**: <5ms (synchronous)
- **Implementation**: `src/lib/local-translation-engine.ts`
- **Strategy**: Phrase-table lookup with exact matching, partial matching, and N-gram completion. Runs entirely in the browser's main thread using a pre-loaded JSON corpus.
- **When it wins**: Exact sentence matches from the corpus produce instant ghost text.

### Channel 1: RAG (SQLite + FTS5 via Backend)

- **Latency**: ~50ms
- **Implementation**: `backend/app/orchestrator.py` → `tm_search_fts5()` + `glossary_lookup()`
- **Strategy**: The backend queries its SQLite database using FTS5 full-text search with BM25 ranking. Glossary terms found in the source text are injected into the LLM prompt for consistency. Results with score >= 0.85 are returned immediately without calling the LLM.
- **When it wins**: High-confidence TM matches from the database that exactly or closely match the source.

### Channel 2: Ollama LLM (Backend SSE Streaming)

- **Latency**: ~200ms (first token), streaming
- **Implementation**: `backend/app/ollama_client.py` → `ollama_stream()`
- **Strategy**: Sends the source text (plus glossary terms) to a locally running Ollama instance. The default model is `qwen2.5:7b`, which provides superior Arabic translation quality. Tokens stream back via SSE for real-time ghost text rendering.
- **When it wins**: When no TM match exists and the user needs a neural translation.

### Channel 3: WebLLM (WebGPU Fallback)

- **Latency**: ~500ms (first token after model load)
- **Implementation**: `src/hooks/useWebLLM.ts` + `@mlc-ai/web-llm`
- **Strategy**: Runs a small LLM (Gemma 2B/4B, Llama 3, Phi-3) directly in the browser using WebGPU. Models are cached in IndexedDB after first download. This channel activates when the backend is unreachable.
- **When it wins**: When the user has no backend running but has WebGPU and a downloaded model.

### Channel 4: Gemini (Cloud, Opt-In)

- **Latency**: ~3s
- **Implementation**: `src/hooks/useGemini.ts` + `@google/generative-ai`
- **Strategy**: Calls Google's Gemini API for cloud-based translation. Only activated when the user explicitly provides an API key in Settings. This is a privacy-optional channel.
- **When it wins**: When local models produce poor results and the user opts in to cloud processing.

---

## Data Flow

### Translation Request Flow

```
User types in Source Editor (LTR)
       │
       ▼
Target Editor detects change → triggers suggestion pipeline
       │
       ├── Ch0: LTE lookup (sync, <5ms)
       │     └── If match → show ghost text immediately
       │
       ├── Ch1+2: POST /translate/stream (SSE)
       │     │
       │     ├── Phase 1 (Retrieve):
       │     │     ├── FTS5 search on tm_entries
       │     │     └── Glossary lookup (term matching)
       │     │
       │     ├── If TM score >= 0.85:
       │     │     ├── Send TM result (channel: "tm")
       │     │     ├── Run validation
       │     │     └── Send validation (channel: "validate")
       │     │     └── [DONE] — skip LLM
       │     │
       │     ├── Phase 2 (Suggest):
       │     │     ├── Build glossary-aware prompt
       │     │     ├── Stream Ollama tokens (channel: "llm")
       │     │     └── Collect full translation
       │     │
       │     └── Phase 3 (Validate):
       │           ├── Length ratio check
       │           ├── Number preservation
       │           ├── Arabic character detection
       │           └── Send validation (channel: "validate")
       │
       ├── Ch3: WebLLM (if backend unreachable)
       │
       └── Ch4: Gemini (if API key provided + others fail)
```

### SSE Event Protocol

The `/translate/stream` endpoint returns `text/event-stream` with JSON data events:

```
data: {"channel": "glossary", "terms": [{"source_term": "translation", "target_term": "ترجمة", "pos": "noun", "domain": "general"}]}

data: {"channel": "tm", "text": "يكمن مستقبل تكنولوجيا الترجمة في...", "score": 0.92, "match_type": "exact"}

data: {"channel": "llm", "text": "يكمن"}

data: {"channel": "llm", "text": " مستقبل"}

data: {"channel": "validate", "is_valid": true, "score": 0.95, "warnings": [], "errors": []}

data: [DONE]
```

---

## Dual Storage Architecture

RDAT Copilot uses a **dual storage** pattern where the backend's SQLite database is the authoritative store, and the frontend's IndexedDB acts as a read-through cache with offline write-back.

### Storage Topology

```
┌─────────────────────────────────────────────────────────┐
│                     Backend (SQLite)                     │
│                  Authoritative Store                     │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ tm_entries  │  │  glossary  │  │    segments       │  │
│  │ + FTS5      │  │ + FTS5     │  │ (translation      │  │
│  │ + triggers  │  │ + triggers │  │  unit tracking)   │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
│                                                         │
│  Sync endpoints: /sync/tm, /sync/glossary               │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (incremental sync)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Frontend (IndexedDB)                    │
│                   Cached Store                          │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ tm_entries  │  │  glossary  │  │    segments       │  │
│  │ (cached)    │  │ (cached)   │  │ (cached +         │  │
│  │             │  │            │  │  pendingSync)     │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ sync_meta (last sync timestamps per store)         │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Read Path

1. Frontend checks IndexedDB cache first (instant, offline-safe)
2. If the cache is stale or empty, fetch from backend and update cache
3. Background sync runs every 60 seconds to keep cache fresh

### Write Path

1. Write to backend first (authoritative)
2. On success, write to IndexedDB cache
3. If backend is unreachable, write to IndexedDB with `_pendingSync: true` flag
4. Next successful sync pushes pending entries to the backend

### Conflict Resolution

**Last-write-wins** based on `updated_at` timestamp. This simple strategy works well for a single-user local-first application where only one user is editing at a time.

---

## Database Schema

### SQLite (Backend)

The SQLite database uses WAL journal mode and foreign key enforcement. All tables have FTS5 virtual table mirrors with automatic sync triggers.

#### `tm_entries` — Translation Memory

| Column       | Type      | Description                          |
|-------------|-----------|--------------------------------------|
| `id`        | INTEGER   | Auto-incrementing primary key        |
| `source`    | TEXT      | Source language text                 |
| `target`    | TEXT      | Target language text                 |
| `source_lang` | TEXT    | Source language code (default: 'en') |
| `target_lang` | TEXT    | Target language code (default: 'ar') |
| `domain`    | TEXT      | Domain tag (e.g., 'legal', 'medical')|
| `created_at`| TIMESTAMP | Auto-set on insert                   |
| `updated_at`| TIMESTAMP | Auto-updated on modification         |

#### `glossary` — Terminology

| Column        | Type      | Description                          |
|--------------|-----------|--------------------------------------|
| `id`         | INTEGER   | Auto-incrementing primary key        |
| `source_term`| TEXT      | Source language term                 |
| `target_term`| TEXT      | Target language term                 |
| `source_lang`| TEXT      | Source language code                 |
| `target_lang`| TEXT      | Target language code                 |
| `pos`        | TEXT      | Part of speech (noun, adjective, etc.)|
| `domain`     | TEXT      | Domain tag                           |
| `notes`      | TEXT      | Usage notes                          |
| `created_at` | TIMESTAMP | Auto-set on insert                   |

#### `segments` — Translation Unit Tracking

| Column           | Type      | Description                                  |
|-----------------|-----------|----------------------------------------------|
| `id`            | INTEGER   | Auto-incrementing primary key                |
| `source`        | TEXT      | Source text                                  |
| `target`        | TEXT      | Translated text (default: empty)             |
| `source_lang`   | TEXT      | Source language code                         |
| `target_lang`   | TEXT      | Target language code                         |
| `status`        | TEXT      | One of: draft, confirmed, rejected, locked   |
| `score`         | REAL      | Translation quality score (0.0-1.0)          |
| `source_file`   | TEXT      | Source file name                             |
| `segment_index` | INTEGER   | Position within source file                  |
| `created_at`    | TIMESTAMP | Auto-set on insert                           |
| `updated_at`    | TIMESTAMP | Auto-updated on modification                 |

### IndexedDB (Frontend Cache)

The frontend IndexedDB (`rdat-copilot-cache`, version 2) mirrors the backend tables with an additional `_pendingSync` boolean flag on mutable stores. A `sync_meta` store tracks the last sync timestamp per store name.

---

## Frontend Architecture

### Component Hierarchy

```
RootLayout
├── ThemeProvider
│   └── LanguageProvider
│       └── WorkspaceShell
│           ├── Sidebar (navigation: Translator, Glossary, Models, Keys, Settings)
│           ├── Main Content Area
│           │   ├── TranslationWorkspace (default view)
│           │   │   ├── SourceToolbar
│           │   │   ├── SourceEditor (Monaco, LTR, read-only)
│           │   │   ├── TargetToolbar
│           │   │   └── TargetEditor (Monaco, RTL, ghost text)
│           │   ├── GlossaryView
│           │   ├── AiModelsView
│           │   ├── ApiKeysView
│           │   └── Settings
│           └── StatusBar (channel states, DB counts, segment/word counts)
```

### State Management

- **Zustand** stores for settings and workspace state (persisted to localStorage)
- **React hooks** for data fetching (`useLocalAgent`, `useDualStorage`, `useRAG`, `useWebLLM`, `useGemini`)
- **Monaco editor** uses uncontrolled mode (`defaultValue` + `resetKey`) with `freeInlineCompletions` API

### Key Hooks

| Hook                | Purpose                                    | Channel  |
|---------------------|--------------------------------------------|----------|
| `useLocalAgent`     | SSE streaming from FastAPI backend         | Ch1 + Ch2|
| `useDualStorage`    | IndexedDB ↔ SQLite sync + CRUD            | Storage  |
| `useRAG`            | Orama vector search in Web Worker          | Legacy   |
| `useWebLLM`         | WebGPU inference via @mlc-ai/web-llm       | Ch3      |
| `useGemini`         | Cloud Gemini API (opt-in)                  | Ch4      |
| `usePredictiveTranslation` | Idle prefetch for next lines      | Cache    |

---

## Backend Architecture

### FastAPI Application Structure

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, startup event
│   ├── db.py            # SQLite setup, schema, FTS5, seed data
│   ├── orchestrator.py  # Retrieve → Suggest → Validate pipeline
│   ├── ollama_client.py # Ollama streaming/non-streaming client
│   └── routes/
│       ├── health.py    # GET /health
│       ├── translate.py # POST /translate/stream, POST /translate
│       ├── tm.py        # TM CRUD + search + sync + bulk import
│       ├── glossary.py  # Glossary CRUD + search + sync
│       ├── segments.py  # Segment CRUD + bulk create
│       └── validate.py  # POST /validate
├── tests/
│   └── test_health.py   # Backend API tests
├── requirements.txt
└── pyproject.toml       # Ruff + pytest config
```

### Orchestrator Pipeline

The `orchestrator.py` implements a three-phase translation pipeline:

1. **Retrieve**: Search SQLite TM using FTS5 (exact match → BM25 ranking → LIKE fallback) + glossary term lookup
2. **Suggest**: If TM score < 0.85, call Ollama LLM with glossary-aware prompt. Stream tokens via SSE.
3. **Validate**: Run quality checks on the final translation (length ratio, number preservation, Arabic detection, untranslated segments)

### Ollama Integration

- Default model: `qwen2.5:7b` (configurable via `OLLAMA_MODEL` env var)
- System prompt instructs the model to output only Arabic text with no explanations
- Glossary terms are injected into the user prompt as a reference table
- Temperature: 0.3, top_p: 0.9 for deterministic but natural output
- Streaming uses `httpx` async streaming with line-by-line JSON parsing

---

## Deployment Architecture

### GitHub Pages (Frontend)

The frontend builds as a static export (`output: 'export'`) with `basePath: '/rdat-copilot'`. GitHub Actions automatically deploys on every push to the `main` branch.

### Local Backend (Docker or Python)

The backend runs locally since it needs access to:
1. **Ollama** on `localhost:11434` for LLM inference
2. **SQLite** file on the local filesystem for data persistence

Two deployment options:
- **Docker**: `docker compose up -d` — isolated, reproducible, with health checks
- **Python**: `./scripts/start-backend.sh` — creates venv, installs deps, starts uvicorn

### CORS Configuration

The backend allows requests from:
- `https://waleedmandour.github.io` (GitHub Pages)
- `http://localhost:3000/3001` (local development)

---

## Security Model

- **No data leaves the machine** unless the user explicitly opts into Channel 4 (Gemini cloud)
- **No authentication** — the backend only listens on localhost
- **CORS** restricts access to known frontend origins
- **Docker** runs as non-root user (`appuser`) with read-only application code
- **SQLite WAL mode** ensures safe concurrent reads from the frontend cache sync
- **API keys** (Gemini) stored in browser localStorage, never sent to the backend

---

## Performance Considerations

- **Ghost text latency**: Channel 0 LTE provides <5ms response for cached matches
- **FTS5 search**: Sub-millisecond BM25 ranking on the SQLite database
- **SSE streaming**: Ollama tokens appear in real-time (~200ms first token)
- **IndexedDB cache**: Eliminates repeated backend fetches for TM/Glossary data
- **Web Worker**: RAG processing (Orama) runs off-thread to avoid blocking the UI
- **WAL journal mode**: Allows concurrent reads while the backend writes
- **Static export**: No server-side rendering overhead; CDN-servable HTML/JS/CSS
