# RDAT Copilot: AI-Powered Translation Co-Writing IDE

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com/)
[![WebGPU](https://img.shields.io/badge/AI-WebGPU-purple)](https://www.w3.org/TR/webgpu/)
[![PWA](https://img.shields.io/badge/PWA-Offline%20First-green)](https://web.dev/progressive-web-apps/)
[![DOI](https://img.shields.io/badge/DOI-10.17605%2FOSF.IO%2FGAQ4K-blue)](https://doi.org/10.17605/OSF.IO/GAQ4K)

A **local-first**, offline-capable Computer-Assisted Translation (CAT) tool built as a Progressive Web App. RDAT Copilot operates like an AI Code Copilot (e.g., GitHub Copilot), but for **English → Arabic** professional translation — showing ghost text suggestions as you type, powered by a 6-channel cascading AI engine.

> **OSF Project Archive:** [https://osf.io/gaq4k/](https://osf.io/gaq4k/)

---

## Key Features

- **IDE-Grade Editor** — Monaco-based split-pane with native RTL support for Arabic, custom dark/light themes, and VS Code-grade editing
- **6-Channel Ghost Text Cascade** — LTE (instant) → Prefetch (cached) → RAG (Orama) → LocalAgent (TM + Ollama LLM) → WebLLM (WebGPU) → Gemini (cloud, opt-in)
- **Local-First Architecture** — Static PWA on GitHub Pages + FastAPI backend on localhost; no data leaves your machine unless you opt in
- **Dual Storage** — SQLite (backend, authoritative) + IndexedDB (frontend, cached) with incremental sync and offline write-back
- **SSE Streaming** — Real-time ghost text via Server-Sent Events from the Ollama LLM through the FastAPI backend
- **Translation Memory** — FTS5 full-text search with BM25 ranking; high-confidence matches skip the LLM entirely
- **Glossary Management** — Domain-aware terminology injection into LLM prompts for consistent translations
- **Quality Validation** — Automated checks for length ratio, number preservation, Arabic character detection, and untranslated segments
- **Copilot UX** — Ghost text completions, `Tab` commit, `Ctrl+→` word-by-word accept, `Esc` dismiss, `Alt+]` cycle alternatives

---

## Architecture: The 6-Channel Translation Engine

RDAT Copilot uses a four-phase, six-channel cascading suggestion architecture. Faster channels produce results first; if a higher-quality channel finishes later, its result replaces the current suggestion. Each channel runs independently with timeout isolation, deduplication, and confidence-based ranking.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Ghost Text Provider (Monaco)                       │
│                                                                       │
│  Phase 1 (0-5ms) ────── Channel 0: LTE (Local Translation Engine)   │
│                           • Synchronous, <5ms                         │
│                           • Exact → Partial → N-gram matching        │
│                           • Smart Remainder prefix completion         │
│                                                                       │
│  Phase 2 (0-50ms) ───── Channel 1: Prefetch (Idle-Time Cache)       │
│                           • Pre-translated lines from idle prefetch   │
│                           • Near-instant from Zustand memory store    │
│                                                                       │
│  Phase 3 (0-3000ms) ─── Channel 2: RAG (Orama + Web Worker)         │
│                           • Orama vector search in Web Worker         │
│                           • BGE-M3 embeddings via Transformers.js     │
│                           • Falls back to LTE if Worker unavailable   │
│                           ── Channel 3: LocalAgent (FastAPI Backend)  │
│                           • TM search via FTS5 + BM25 (~50ms)        │
│                           • Ollama LLM streaming via SSE (~200ms)    │
│                           • Glossary-aware prompts for domain accuracy│
│                                                                       │
│  Phase 4 (0-5000ms) ─── Channel 4: WebLLM (WebGPU Fallback)         │
│                           • Gemma 2B/4B via @mlc-ai/web-llm          │
│                           • CreateWebWorkerMLCEngine (off-thread)     │
│                           • Auto-loads if model is cached in browser  │
│                           ── Channel 5: Gemini (Cloud, Opt-In)        │
│                           • gemini-2.0-flash via REST API             │
│                           • Only activated when user provides API key │
│                                                                       │
│  After LLM ───────────── Validation Pipeline                          │
│                           • Length ratio check                         │
│                           • Number preservation verification          │
│                           • Arabic character detection                 │
│                           • Untranslated segment detection             │
│                                                                       │
│  Continuous ──────────── Dual Storage Sync                            │
│                           • SQLite (backend, authoritative)            │
│                           • IndexedDB (frontend, cached)              │
│                           • Incremental pull + pending push            │
└──────────────────────────────────────────────────────────────────────┘
```

### Channel Details

| Ch | Engine | Latency | Quality | Offline? | Implementation |
|----|--------|---------|---------|----------|----------------|
| **0** | LTE (Phrase Table) | <5ms | Good (exact matches) | Yes | `src/lib/local-translation-engine.ts` |
| **1** | Prefetch (Idle Cache) | ~0ms | Good (cached) | Yes | `src/stores/prefetch-store.ts` + `src/hooks/usePredictiveTranslation.ts` |
| **2** | RAG (Orama + Web Worker) | ~50ms | Very Good (contextual) | Yes | `src/hooks/useRAG.ts` + `src/workers/rag-worker.ts` |
| **3** | LocalAgent (TM + Ollama) | ~50ms TM / ~200ms LLM | Excellent (neural) | Yes* | `src/hooks/useLocalAgent.ts` + `backend/app/orchestrator.py` |
| **4** | WebLLM (WebGPU) | ~500ms | Excellent (neural) | Yes* | `src/hooks/useWebLLM.ts` + `@mlc-ai/web-llm` |
| **5** | Gemini (Cloud) | ~3s | Excellent (neural) | No | `src/hooks/useGemini.ts` + `@google/generative-ai` |

*\*Channels 3 requires the local FastAPI backend + Ollama. Channel 4 requires WebGPU + a downloaded model. Neither requires internet.*

### Backend Pipeline: Retrieve → Suggest → Validate

The LocalAgent (Channel 3) implements a three-phase pipeline on the backend:

1. **Retrieve** — Search SQLite TM using FTS5 (exact match → BM25 ranking → LIKE fallback) + glossary term lookup
2. **Suggest** — If TM score < 0.85, call Ollama LLM with glossary-aware prompt. Stream tokens via SSE.
3. **Validate** — Run quality checks on the final translation (length ratio, number preservation, Arabic detection, untranslated segments)

If a TM match has score >= 0.85, the LLM is skipped entirely and the TM result is returned immediately with validation.

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend build & development |
| Python | 3.12+ | Backend API server (optional) |
| Ollama | Latest | Local LLM inference (optional) |
| Docker | Optional | Containerized backend deployment |

### Frontend Only (Channels 0, 1, 2, 4)

```bash
# Clone the repository
git clone https://github.com/waleedmandour/rdat-copilot.git
cd rdat-copilot

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Channels 0–2 and 4 work without any backend.

### Backend (Channels 3 + 5)

For the best experience with TM search and Ollama neural translation:

```bash
# 1. Install Ollama and pull the default model
ollama pull qwen2.5:7b

# 2. Start the backend (auto-creates Python venv)
./scripts/start-backend.sh

# Or start with Docker
./scripts/start-backend.sh --docker
```

Verify at [http://localhost:8000/health](http://localhost:8000/health) — you should see `{"status": "ok", "ollama": true, ...}`.

### Production Build

```bash
npm run build
```

The static export is generated in `./out` and deployed to GitHub Pages automatically via CI/CD on every push to `main`.

### PWA Installation

The app registers as a PWA automatically when served over HTTPS (or localhost). Install it via your browser's "Add to Home Screen" or "Install App" option for a native-like experience with offline support.

---

## Deployment

| Component | Where | How |
|-----------|-------|-----|
| Frontend | GitHub Pages | Static export, auto-deployed via `deploy.yml` workflow |
| Backend | User's machine | Docker or Python, connects to Ollama |
| LLM | User's machine | Ollama with `qwen2.5:7b` model (default) |

### GitHub Pages Setup

1. Go to **Settings → Pages → Source** and select **GitHub Actions**
2. Push to `main` to trigger the first deployment
3. The site will be available at `https://<username>.github.io/rdat-copilot/`

### Docker Deployment

```bash
docker compose up -d          # Start backend
docker compose logs -f        # View logs
docker compose down           # Stop
docker compose up -d --build  # Rebuild after code changes
```

### Environment Variables

**Frontend** (build-time, `.env.local`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_LOCAL_BACKEND_URL` | `http://localhost:8000` | Backend URL for API calls |

**Backend** (runtime, `backend/.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `RDAT_DB_PATH` | `rdat_copilot.db` | SQLite database file path |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Default LLM model |
| `UVICORN_HOST` | `0.0.0.0` | Bind host |
| `UVICORN_PORT` | `8000` | Bind port |

---

## Project Structure

```
rdat-copilot/
├── .github/
│   └── workflows/
│       ├── deploy.yml               # CI/CD: Frontend → GitHub Pages
│       └── backend-ci.yml           # CI: Backend ruff lint + pytest
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app + CORS + startup
│   │   ├── db.py                    # SQLite schema + FTS5 + seed data
│   │   ├── orchestrator.py          # Retrieve → Suggest → Validate pipeline
│   │   ├── ollama_client.py         # Ollama streaming/non-streaming client
│   │   └── routes/
│   │       ├── health.py            # GET /health
│   │       ├── translate.py         # POST /translate/stream (SSE) + POST /translate
│   │       ├── tm.py                # TM CRUD + search + bulk import + sync
│   │       ├── glossary.py          # Glossary CRUD + search + lookup + sync
│   │       ├── segments.py          # Segment tracking CRUD + bulk
│   │       └── validate.py          # POST /validate
│   ├── tests/
│   │   └── test_health.py           # Backend API tests (5 tests)
│   ├── requirements.txt             # Python dependencies
│   └── pyproject.toml               # Ruff + pytest config
├── scripts/
│   ├── start-backend.sh             # Backend startup (local venv / Docker)
│   └── deploy-pages.sh              # Manual frontend deployment
├── public/
│   ├── data/
│   │   └── default-corpus-en-ar.json   # Bilingual sentence pairs for LTE
│   ├── icons/                          # PWA icons (16–512px)
│   ├── manifest.json                   # PWA manifest (GitHub Pages paths)
│   └── sw.js                           # Service Worker (PWA caching)
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout + LanguageProvider
│   │   ├── page.tsx                    # Entry point → WorkspaceShell
│   │   └── globals.css                 # Tailwind 4 + dark theme vars
│   ├── components/
│   │   ├── editors/
│   │   │   ├── SourceEditor.tsx        # English pane (LTR, read-only)
│   │   │   ├── SourceToolbar.tsx       # Source editor toolbar
│   │   │   ├── TargetEditor.tsx        # Arabic pane (RTL, ghost text)
│   │   │   ├── TargetToolbar.tsx       # Target editor toolbar (Copy, QA, Tutor, Export)
│   │   │   ├── SegmentHighlighter.tsx  # Cross-pane line sync
│   │   │   ├── TranslationWorkspace.tsx # Split-pane orchestrator
│   │   │   └── index.ts               # Barrel export
│   │   ├── Sidebar.tsx                 # Navigation explorer
│   │   ├── StatusBar.tsx               # Dynamic AI state badges & progress
│   │   ├── WorkspaceShell.tsx          # Main IDE layout
│   │   ├── WelcomeTab.tsx              # Bilingual welcome screen
│   │   ├── GlossaryView.tsx            # Terminology & open-source DBs
│   │   ├── AiModelsView.tsx            # AI Models configuration
│   │   ├── ApiKeysView.tsx             # API key management (Gemini)
│   │   ├── Settings.tsx                # General preferences
│   │   ├── ThemeProvider.tsx           # Dark/light theme toggle
│   │   ├── QuickGuideModal.tsx         # First-run quick guide
│   │   └── InstallPWAButton.tsx        # PWA install prompt
│   ├── context/
│   │   └── LanguageContext.tsx         # EN/AR i18n context
│   ├── hooks/
│   │   ├── useLocalAgent.ts           # SSE streaming hook (Channel 3: TM + Ollama)
│   │   ├── useDualStorage.ts          # SQLite ↔ IndexedDB sync hook
│   │   ├── useRAG.ts                  # RAG worker + LTE hook (Channel 2)
│   │   ├── useWebLLM.ts              # WebGPU engine hook (Channel 4)
│   │   ├── useGemini.ts              # Gemini cloud hook (Channel 5)
│   │   └── usePredictiveTranslation.ts # Idle prefetch hook (Channel 1)
│   ├── i18n/
│   │   └── translations.ts           # EN/AR translation dicts
│   ├── lib/
│   │   ├── dual-storage.ts           # IndexedDB cache + backend sync
│   │   ├── local-config.ts           # Backend URL config + health check
│   │   ├── local-translation-engine.ts # Channel 0: LTE class
│   │   ├── monaco-suggestion-provider.ts # Four-phase async pipeline
│   │   └── utils.ts                  # cn() utility
│   ├── stores/
│   │   ├── prefetch-store.ts         # Translation cache (Zustand)
│   │   ├── settings-store.ts         # User preferences (persisted to localStorage)
│   │   └── workspace-store.ts        # Editor content (persisted to localStorage)
│   └── workers/
│       └── rag-worker.ts             # Web Worker (Orama + Transformers.js)
├── docs/
│   ├── api-reference.md             # Complete backend API reference (22 endpoints)
│   ├── deployment.md                # Deployment guide (GitHub Pages, Docker, Python)
│   └── user-guide.md                # End-user documentation
├── Dockerfile                        # Multi-stage backend image (non-root, health check)
├── docker-compose.yml                # Backend + persistent volume orchestration
├── ARCHITECTURE.md                   # Full system architecture with diagrams
├── CONTRIBUTING.md                   # Developer guide and PR process
├── .env.example                      # Frontend environment template
├── backend/.env.example              # Backend environment template
├── next.config.mjs                   # Next.js + PWA + static export config
├── vitest.config.ts                  # Vitest test orchestrator
├── LICENSE                           # MIT License
├── CITATION.cff                      # Academic citation metadata
└── README.md                         # This file
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Accept full ghost text suggestion |
| `Ctrl + →` | Accept next word of suggestion |
| `Esc` | Dismiss current suggestion |
| `Alt + ]` | Cycle through suggestion alternatives |

---

## Internationalization

RDAT Copilot is fully bilingual (English / Arabic) with a built-in language toggle in the sidebar:

- **UI Labels** — All navigation, status badges, and settings translate dynamically
- **RTL Layout** — When Arabic is selected, the sidebar and status bar switch to `dir="rtl"`. Monaco ghost text uses CSS `direction: ltr` + `unicode-bidi: isolate` on `.inline-suggestion` to fix RTL rendering (Monaco has no native `direction` option)
- **Font** — Noto Sans Arabic is loaded automatically for crisp Arabic rendering

---

## Configuration

### Ollama Model

The default model is `qwen2.5:7b`, which provides the best Arabic translation quality among 7B-class models. Change it via the `OLLAMA_MODEL` environment variable or in Settings.

```bash
# Alternative models
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull gemma2:9b
```

### Gemini API Key (Channel 5)

1. Navigate to **API Keys** in the sidebar
2. Paste your key from [Google AI Studio](https://aistudio.google.com/apikey)
3. Enable "Use cloud fallback" to activate Gemini when local channels are unavailable

### WebGPU & Local WebLLM (Channel 4)

- Chrome 113+ or Edge 113+ required
- Hardware-backed WebGPU context
- ~1.5 GB to ~4.5 GB download for browser-based models (e.g., Gemma 2B/4B), cached in browser storage
- Models auto-load on next visit if previously cached

---

## API Reference

When the backend is running, interactive API documentation is available at:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

The backend exposes 22 endpoints across 6 route groups: Health, Translation (SSE + REST), Translation Memory, Glossary, Segments, and Validation. See [`docs/api-reference.md`](docs/api-reference.md) for the complete reference.

---

## Testing

### Frontend Tests

```bash
npm run test:run    # Run all 72 tests
npm run test        # Watch mode
npm run test:ui     # UI mode
```

Tests use **Vitest** with `jsdom` environment. Test files are in `src/__tests__/`.

### Backend Tests

```bash
cd backend
python -m pytest tests/ -v
```

Backend tests use `pytest-asyncio` with in-memory SQLite (`:memory:`).

### Linting

```bash
# Frontend
npm run lint

# Backend
cd backend
ruff check app/
ruff format --check app/
```

---

## Citation

If you use this software in your research, teaching, or publications, please cite it as follows:

```bibtex
@software{mandour2026_rdat_copilot,
  author       = {Mandour, Waleed},
  title        = {{RDAT Copilot: AI-Powered Translation Co-Writing IDE}},
  year         = {2026},
  url          = {https://github.com/waleedmandour/rdat-copilot},
  doi          = {10.17605/OSF.IO/GAQ4K},
  version      = {1.0.0},
  license      = {MIT},
  affiliation  = {Sultan Qaboos University}
}
```

Or use the **Cite this repository** button on GitHub (powered by `CITATION.cff`).

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Author

**Dr. Waleed Mandour**
Sultan Qaboos University
[w.abumandour@squ.edu.om](mailto:w.abumandour@squ.edu.om)

---

## Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code-grade editor component
- [MLC AI / WebLLM](https://github.com/mlc-ai/web-llm) — In-browser LLM inference via WebGPU
- [Transformers.js](https://huggingface.co/docs/transformers.js) — Client-side ML embeddings
- [Orama](https://docs.oramasearch.com/) — In-memory vector search engine
- [Ollama](https://ollama.com/) — Local LLM inference runtime
- [FastAPI](https://fastapi.tiangolo.com/) — High-performance Python backend framework
- [Next.js](https://nextjs.org/) — React framework with App Router and static export
- [Zustand](https://github.com/pmndrs/zustand) — Lightweight state management with persistence
