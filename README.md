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
│                 • Synchronous, <50ms                              │
│                 • Exact → Partial → N-gram matching               │
│                 • Smart Remainder prefix completion               │
│                                                                   │
│  0ms ───────▶  Channel 3: Prefetch Cache                          │
│                 • requestIdleCallback queued translations         │
│                 • Lines N+1, N+2 translated in background         │
│                                                                   │
│  ~3s ────────▶ Channel 1: RAG (Vector DB + BM25)                  │
│                 • Orama full-text search in Web Worker            │
│                 • BGE-M3 embeddings for semantic ranking           │
│                                                                   │
│  ~3s ────────▶ Channel 2: Gemini (Cloud Fallback)                 │
│                 • gemini-2.0-flash via REST API                   │
│                 • Activated when WebGPU unavailable               │
│                                                                   │
│  ~5s ────────▶ Channel 3: WebLLM (WebGPU)                         │
│                 • Support for Gemma 2B, 4B, Llama 3, Phi-3        │
│                 • CreateWebWorkerMLCEngine (off-thread)           │
│                 • 3-5 word burst continuation                     │
│                 • First load requires model download (~1.5-4.5GB) │
└──────────────────────────────────────────────────────────────────┘
```

### Channel Details

| Channel | Engine | Latency | Quality | Offline? |
|---------|--------|---------|---------|----------|
| **0** | LTE (Phrase Table) | <5ms | Good (exact matches) | ✅ Yes |
| **1** | RAG (Vector DB + BM25) | ~3s | Very Good (contextual) | ✅ Yes* |
| **2** | Gemini (Cloud) | ~3s | Excellent (neural) | ❌ No |
| **3** | WebLLM (WebGPU) | ~5s | Excellent (neural) | ✅ Yes* |
| **4** | Prefetch Cache | <5ms | Good (cached) | ✅ Yes |

*\*Requires initial model download during first session.*

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ and npm
- **Modern Browser** with WebGPU support (Chrome 113+, Edge 113+)

### Installation

```bash
# Clone the repository
git clone https://github.com/waleedmandour/rdat-pwa.git
cd rdat-pwa

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

### PWA Installation
The app registers as a PWA automatically when served over HTTPS (or localhost). Install it via your browser's "Add to Home Screen" or "Install App" option for a native-like experience.

---

## 📁 Project Structure

```
rdat-copilot/
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
│   │   ├── useRAG.ts                   # RAG worker hook
│   │   ├── useWebLLM.ts                # WebGPU engine hook
│   │   ├── useGemini.ts                # Gemini cloud hook
│   │   └── usePredictiveTranslation.ts # Idle prefetch hook
│   ├── i18n/
│   │   └── translations.ts             # EN/AR translation dicts
│   ├── lib/
│   │   ├── local-translation-engine.ts # Channel 0: LTE class
│   │   ├── monaco-suggestion-provider.ts # Monaco async pipelines
│   │   └── utils.ts                    # cn() utility
│   ├── stores/
│   │   ├── prefetch-store.ts           # Translation cache (Zustand)
│   │   └── settings-store.ts           # User preferences (persisted)
│   └── workers/
│       └── rag-worker.ts               # Web Worker (Orama + Transformers.js)
├── next.config.mjs                     # Next.js + PWA + webpack config
├── tailwind.config.js                  # Tailwind CSS configuration
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
  url          = {https://github.com/waleedmandour/rdat-pwa},
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
