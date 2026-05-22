# RDAT Copilot: AI-Powered Translation Co-Writing IDE

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![WebGPU](https://img.shields.io/badge/AI-WebGPU-purple)](https://www.w3.org/TR/webgpu/)
[![PWA](https://img.shields.io/badge/PWA-Offline%20First-green)](https://web.dev/progressive-web-apps/)
[![DOI](https://img.shields.io/badge/DOI-10.17605%2FOSF.IO%2FGAQ4K-blue)](https://doi.org/10.17605/OSF.IO/GAQ4K)

A state-of-the-art, **offline-capable** Computer-Assisted Translation (CAT) tool built as a Progressive Web App. RDAT Copilot operates exactly like an AI Code Copilot (e.g., GitHub Copilot), but for **English ↔ Arabic** professional translation.

> 📖 **OSF Project Archive:** [https://osf.io/gaq4k/](https://osf.io/gaq4k/)

---

## ✨ Key Features

- **🖥️ IDE-Grade Interface** — Professional dark-themed split-pane editor mirroring VS Code with native RTL support for Arabic
- **🤖 Multi-Channel AI** — 5-channel ghost text cascade: LTE (instant) → RAG (semantic) → WebLLM (local GPU) → Gemini (cloud) → Prefetch (idle)
- **🌐 Offline-First** — Fully functional without internet after initial load; local AI inference via WebGPU
- **🔤 Native RTL** — Monaco Editor with RTL ghost text via CSS `unicode-bidi: isolate` (Monaco has no native `direction` option)
- **⌨️ Copilot UX** — Ghost text completions, `Ctrl+→` word-by-word accept, `Tab` commit, `Alt+]` cycle alternatives
- **🧠 RAG-Powered** — Vector database (Orama) + BGE-M3 embeddings for contextually relevant translation suggestions
- **🔒 Privacy-First** — All AI processing happens in-browser; no data leaves your machine unless you opt into cloud fallback

---

## 🏗️ Architecture: The 5-Channel Translation Engine

RDAT Copilot uses a cascading multi-channel architecture that delivers instant suggestions while progressively higher-quality results arrive in the background:

```
┌──────────────────────────────────────────────────────────────────┐
│                   Ghost Text Provider (Monaco)                    │
│                                                                   │
│  0ms ───────▶  Channel 0: LTE (Local Translation Engine)         │
│                 • Synchronous, <5ms                               │
│                 • Exact → Partial → N-gram matching               │
│                 • Smart Remainder prefix completion               │
│                                                                   │
│  ~50ms ─────▶  Channel 1: RAG (Backend SQLite + FTS5)            │
│                 • FastAPI backend at localhost:8000                │
│                 • FTS5 full-text search + BM25 ranking             │
│                 • Glossary lookup + term injection                 │
│                                                                   │
│  ~200ms ─────▶ Channel 2: Ollama LLM (Backend SSE Streaming)     │
│                 • qwen2.5:7b via FastAPI /translate/stream        │
│                 • SSE ghost text with token-by-token rendering    │
│                 • Glossary-aware prompts for domain accuracy      │
│                                                                   │
│  ~500ms ─────▶ Channel 3: WebLLM (WebGPU Fallback)               │
│                 • Gemma 2B/4B, Llama 3, Phi-3 via WebGPU         │
│                 • CreateWebWorkerMLCEngine (off-thread)           │
│                 • 3-5 word burst continuation                     │
│                                                                   │
│  ~3s ────────▶ Channel 4: Gemini (Cloud, Opt-In)                 │
│                 • gemini-2.0-flash via REST API                   │
│                 • Only activated when user provides API key       │
│                                                                   │
│  After LLM ──▶ Validation Pipeline                                │
│                 • Length ratio check                               │
│                 • Number preservation verification                 │
│                 • Arabic character detection                       │
│                 • Untranslated segment detection                   │
│                                                                   │
│  Continuous ──▶ Dual Storage Sync                                 │
│                 • SQLite (backend, authoritative)                  │
│                 • IndexedDB (frontend, cached)                     │
│                 • Incremental pull + pending push                  │
└──────────────────────────────────────────────────────────────────┘
```

### Channel Details

| Channel | Engine | Latency | Quality | Offline? |
|---------|--------|---------|---------|----------|
| **0** | LTE (Phrase Table) | <5ms | Good (exact matches) | ✅ Yes |
| **1** | RAG (SQLite + FTS5) | ~50ms | Very Good (contextual) | ✅ Yes* |
| **2** | Ollama LLM (Backend) | ~200ms | Excellent (neural) | ✅ Yes* |
| **3** | WebLLM (WebGPU) | ~500ms | Excellent (neural) | ✅ Yes* |
| **4** | Gemini (Cloud) | ~3s | Excellent (neural) | ❌ No |

*\*Requires Ollama backend running locally for Channels 1-2, or WebGPU model download for Channel 3.*

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ and npm
- **Modern Browser** with WebGPU support (Chrome 113+, Edge 113+)

### Installation

```bash
# Clone the repository
git clone https://github.com/waleedmandour/rdat-copilot.git
cd rdat-copilot

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
```

The static export is generated in `./out` and deployed to GitHub Pages automatically via CI/CD.

### Backend (FastAPI + Ollama)

The local backend provides LLM-powered translation via Ollama and a SQLite Translation Memory:

```bash
# Option 1: Run directly (recommended)
./scripts/start-backend.sh

# Option 2: Run with Docker
./scripts/start-backend.sh --docker

# Option 3: Manual start
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Prerequisites for the backend:
- **Ollama** installed and running (`ollama serve`)
- **qwen2.5:7b** model pulled (`ollama pull qwen2.5:7b`)
- **Python 3.12+** and pip

### PWA Installation
The app registers as a PWA automatically when served over HTTPS (or localhost). Install it via your browser's "Add to Home Screen" or "Install App" option for a native-like experience.

---

## 📁 Project Structure

```
rdat-copilot/
├── .github/
│   └── workflows/
│       ├── deploy.yml               # CI/CD: Frontend → GitHub Pages
│       └── backend-ci.yml           # CI: Backend lint + test
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app + CORS + startup
│   │   ├── db.py                    # SQLite schema + FTS5 + seed data
│   │   ├── orchestrator.py          # Retrieve → Suggest → Validate pipeline
│   │   ├── ollama_client.py         # Ollama streaming client
│   │   └── routes/
│   │       ├── health.py            # /health endpoint
│   │       ├── translate.py         # /translate/stream (SSE) + /translate (REST)
│   │       ├── tm.py                # TM CRUD + search + bulk import
│   │       ├── glossary.py          # Glossary CRUD + search
│   │       ├── segments.py          # Segment tracking CRUD
│   │       └── validate.py          # Translation validation
│   ├── tests/
│   │   └── test_health.py           # Backend API tests
│   ├── requirements.txt             # Python dependencies
│   └── pyproject.toml               # Ruff + pytest config
├── scripts/
│   ├── start-backend.sh             # Backend startup (local / Docker)
│   └── deploy-pages.sh              # Manual frontend deployment
├── public/
│   ├── data/
│   │   └── default-corpus-en-ar.json   # 15 bilingual sentence pairs
│   ├── icons/                          # PWA 3D SVG & PNG icons
│   ├── manifest.json                   # PWA manifest
│   └── sw.js                           # Service Worker (generated)
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout + LanguageProvider
│   │   ├── page.tsx                    # Entry point → WorkspaceShell
│   │   └── globals.css                 # Tailwind + dark theme vars
│   ├── components/
│   │   ├── editors/
│   │   │   ├── SourceEditor.tsx        # English pane (LTR, read-only)
│   │   │   ├── TargetEditor.tsx        # Arabic pane (RTL, ghost text)
│   │   │   ├── SegmentHighlighter.tsx  # Cross-pane line sync
│   │   │   └── TranslationWorkspace.tsx# Split-pane orchestrator
│   │   ├── Sidebar.tsx                 # Navigation explorer
│   │   ├── StatusBar.tsx               # Dynamic AI state badges & Progress bars
│   │   ├── WorkspaceShell.tsx          # Main IDE layout
│   │   ├── WelcomeTab.tsx              # Bilingual welcome screen
│   │   ├── GlossaryView.tsx            # Open-Source DBs & Terminologies
│   │   ├── AiModelsView.tsx            # AI Models configurations
│   │   └── Settings.tsx                # DB, API keys + model params
│   ├── context/
│   │   └── LanguageContext.tsx         # EN/AR i18n context
│   ├── hooks/
│   │   ├── useLocalAgent.ts           # SSE streaming hook (Channel 1/2)
│   │   ├── useDualStorage.ts          # SQLite ↔ IndexedDB sync hook
│   │   ├── useRAG.ts                   # RAG worker hook
│   │   ├── useWebLLM.ts                # WebGPU engine hook
│   │   ├── useGemini.ts                # Gemini cloud hook
│   │   └── usePredictiveTranslation.ts # Idle prefetch hook
│   ├── i18n/
│   │   └── translations.ts             # EN/AR translation dicts
│   ├── lib/
│   │   ├── dual-storage.ts             # IndexedDB cache + backend sync
│   │   ├── local-config.ts             # Backend URL config + health check
│   │   ├── local-translation-engine.ts # Channel 0: LTE class
│   │   ├── monaco-suggestion-provider.ts # Monaco async pipelines
│   │   └── utils.ts                    # cn() utility
│   ├── stores/
│   │   ├── prefetch-store.ts           # Translation cache (Zustand)
│   │   └── settings-store.ts           # User preferences (persisted)
│   └── workers/
│       └── rag-worker.ts               # Web Worker (Orama + Transformers.js)
├── Dockerfile                          # Backend Docker image
├── docker-compose.yml                  # Backend + volume orchestration
├── .env.example                        # Frontend environment template
├── backend/.env.example                # Backend environment template
├── next.config.mjs                     # Next.js + PWA + export config
├── vitest.config.ts                    # Vitest test orchestrator
├── LICENSE                             # MIT License
├── CITATION.cff                        # Academic citation metadata
└── README.md                           # This file
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + →` | Accept next word of ghost text |
| `Tab` | Accept full suggestion |
| `Esc` | Dismiss suggestion |
| `Alt + ]` | Cycle through suggestion alternatives |

---

## 🌐 Internationalization

RDAT Copilot is fully bilingual (English / Arabic) with a built-in language toggle in the sidebar:

- **UI Labels** — All navigation, status badges, and settings translate dynamically
- **RTL Layout** — When Arabic is selected, the sidebar and status bar switch to `dir="rtl"`. Monaco ghost text uses CSS `direction: ltr` + `unicode-bidi: isolate` on `.inline-suggestion` to fix RTL rendering (Monaco has no native `direction` option)
- **Font** — Noto Sans Arabic is loaded automatically for crisp Arabic rendering

---

## 🔧 Configuration

### Gemini API Key
1. Navigate to **Settings** in the sidebar
2. Paste your API key from [Google AI Studio](https://aistudio.google.com/apikey)
3. Enable "Use cloud fallback" to activate Gemini when WebGPU is unavailable

### WebGPU & Local WebLLM Requirements
- Chrome 113+ or Edge 113+
- Hardware-backed WebGPU context
- ~1.5GB to ~4.5GB download for local Neural Models (e.g. Gemma 4) cached in `IndexedDB`.

### GTR Glossaries & Vector DB Corpora
- Open-source Vector DB sets (like OPUS Wikipedia En-Ar) are available for one-click downloading right from the `Settings` or `GTR Glossary` screens. These directly upgrade your Channel 0 and RAG pipelines for superior Contextual matches locally.

---

## 📖 Citation

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

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Dr. Waleed Mandour**  
Sultan Qaboos University  
📧 [w.abumandour@squ.edu.om](mailto:w.abumandour@squ.edu.om)

---

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code-grade editor component
- [MLC AI / WebLLM](https://github.com/mlc-ai/web-llm) — In-browser LLM inference
- [Transformers.js](https://huggingface.co/docs/transformers.js) — Client-side ML embeddings
- [Orama](https://docs.oramasearch.com/) — In-memory vector search
- [Next.js](https://nextjs.org/) — React framework with App Router
- [Zustand](https://github.com/pmndrs/zustand) — Lightweight state management

---

<p align="center">
  <em>Built with ❤️ for the translation community</em>
</p>
