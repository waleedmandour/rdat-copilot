# User Guide

Welcome to RDAT Copilot — your AI-powered English-to-Arabic translation environment. This guide covers everything you need to get started and make the most of the tool.

---

## Getting Started

### What is RDAT Copilot?

RDAT Copilot is a professional Computer-Assisted Translation (CAT) tool that works like an AI Code Copilot (e.g., GitHub Copilot), but for English-to-Arabic translation. As you type or view source text, it shows ghost text suggestions that you can accept, modify, or ignore.

### Key Features

- **Ghost text suggestions** appear automatically as you translate
- **5-channel AI cascade** provides instant to high-quality suggestions
- **Offline-capable** — works without internet after initial setup
- **IDE-grade editor** with Monaco (same editor as VS Code)
- **Translation Memory** learns from your past translations
- **Glossary support** ensures terminology consistency
- **Quality validation** checks your translations automatically

### System Requirements

| Requirement     | Minimum                    | Recommended               |
|----------------|----------------------------|---------------------------|
| Browser        | Chrome 113+, Edge 113+    | Latest Chrome             |
| RAM            | 4 GB                       | 8 GB+ (for Ollama)       |
| Disk Space     | 500 MB (frontend only)     | 8 GB+ (with Ollama model) |
| Internet       | Initial load only          | For cloud fallback (optional) |

---

## Using the Translation Editor

### Interface Layout

The main interface has three areas:

1. **Sidebar** (left) — Navigation between Translation Editor, Glossaries, AI Models, API Keys, and Settings
2. **Editor Area** (center) — Split-pane with source (English, left) and target (Arabic, right)
3. **Status Bar** (bottom) — Shows channel states, database counts, and statistics

### Source Editor (Left Pane)

The source editor displays the English text you want to translate. It is read-only — you can load text via:
- **Open File** button in the toolbar (supports `.txt` and `.docx` files)
- Typing directly into the editor (when no file is loaded)

### Target Editor (Right Pane)

The target editor is where you type your Arabic translation. As you work, ghost text suggestions appear in gray:

- **Gray text** = AI suggestion (not yet committed)
- **Black text** = Your confirmed translation

### Working with Ghost Text

Ghost text suggestions appear automatically. Here's how to interact with them:

| Action          | Shortcut     | What it does                           |
|----------------|-------------|----------------------------------------|
| Accept all     | `Tab`       | Accept the entire ghost text suggestion |
| Accept word    | `Ctrl + →`  | Accept the next word of the suggestion  |
| Dismiss        | `Esc`       | Dismiss the current suggestion          |
| Cycle options  | `Alt + ]`   | Switch between alternative suggestions  |

### Toolbar Actions

The target editor toolbar provides these actions:

| Button  | Description                                         |
|---------|-----------------------------------------------------|
| Copy    | Copy the target text to clipboard                   |
| QA      | Run quality assurance checks on the translation     |
| Tutor   | Get an AI explanation of the translation            |
| Export  | Export the translation as a file                    |
| Clear   | Clear both source and target text                   |

---

## AI Suggestion Channels

RDAT Copilot uses 5 channels that work together. Faster channels produce suggestions first; higher-quality channels may replace them:

### Channel 0: Instant Match (<5ms)

The Local Translation Engine checks a built-in phrase table for exact and partial matches. If the source sentence was seen before, you get an instant suggestion.

### Channel 1: Translation Memory (~50ms)

The backend searches the SQLite Translation Memory using full-text search. This finds similar sentences from your past translations. High-confidence matches (85%+) are shown immediately without waiting for the LLM.

### Channel 2: Neural Translation (~200ms)

Ollama (a local LLM running qwen2.5:7b) generates a neural translation. Tokens stream in one at a time, so you see the suggestion build up in real-time. This is the primary translation channel.

**Prerequisite**: The backend must be running (see Setup section).

### Channel 3: WebGPU Fallback (~500ms)

If the backend is not running but your browser supports WebGPU, a small model (e.g., Gemma 2B) runs directly in your browser. The first time you use this, it needs to download the model (~1.5-4.5 GB).

### Channel 4: Cloud Translation (~3s)

Google Gemini provides cloud-based translation as a fallback. **This is opt-in** — you must provide an API key in Settings. When enabled, it activates when local channels don't produce good results.

---

## Setup: Running the Backend

For the best experience (Channels 1 and 2), you need the backend running locally.

### Step 1: Install Ollama

1. Download Ollama from [ollama.com](https://ollama.com)
2. Install and start it (`ollama serve`)
3. Pull the translation model:
   ```bash
   ollama pull qwen2.5:7b
   ```

### Step 2: Start the Backend

**Option A: Docker (recommended)**

1. Install [Docker](https://docs.docker.com/get-docker/)
2. Run:
   ```bash
   ./scripts/start-backend.sh --docker
   ```

**Option B: Python**

1. Install Python 3.12+
2. Run:
   ```bash
   ./scripts/start-backend.sh
   ```

### Step 3: Verify

Open [http://localhost:8000/health](http://localhost:8000/health) — you should see a JSON response with `"status": "ok"`.

The status bar in RDAT Copilot will update to show the backend connection status within 15 seconds.

---

## Glossary Management

The Glossary ensures consistent terminology across translations. When a glossary term appears in the source text, the AI is instructed to use the approved translation.

### Viewing Glossary Entries

Click **Glossaries & Vector DBs** in the sidebar to view all glossary entries. Use the search bar to filter by term.

### Adding Glossary Entries

1. Navigate to the Glossary view
2. Click "Add Entry"
3. Fill in:
   - **Source Term** (English, e.g., "machine translation")
   - **Target Term** (Arabic, e.g., "ترجمة آلية")
   - **Part of Speech** (noun, adjective, verb, etc.)
   - **Domain** (technology, legal, medical, etc.)
   - **Notes** (optional usage notes)

### How Glossaries Affect Translation

When you translate a sentence containing glossary terms, the backend:
1. Identifies which glossary terms appear in the source
2. Injects a reference table into the LLM prompt
3. Instructs the model to use the glossary translations consistently

This is especially important for:
- Technical terminology (e.g., "translation memory" → "ذاكرة الترجمة")
- Domain-specific terms (e.g., legal, medical)
- Project-specific terminology

---

## Translation Memory

The Translation Memory (TM) stores your past translations and reuses them for similar sentences. Over time, as you build your TM, translations become faster and more consistent.

### How TM Works

1. When you translate a sentence, it can be saved to the TM
2. When a new source sentence is similar to a TM entry, the match is shown as a suggestion
3. Exact matches (100%) are shown immediately without calling the LLM
4. Fuzzy matches (70%+) are shown alongside LLM suggestions

### TM Match Types

| Match Type | Score Range | Behavior                                    |
|-----------|-------------|---------------------------------------------|
| Exact     | 100% (1.0)  | Shown immediately, LLM skipped              |
| FTS5      | 70-95%      | Shown immediately, LLM also called          |
| Partial   | <70%        | Shown if no better match, LLM preferred     |

---

## Quality Validation

The QA Check (Quality Assurance) button runs automatic validation on your translation. It checks:

1. **Length Ratio** — Is the Arabic text a reasonable length compared to the English?
2. **Number Preservation** — Are all numbers from the source present in the translation?
3. **Arabic Characters** — Does the translation actually contain Arabic text?
4. **Untranslated Segments** — Are there suspicious English words in the Arabic text?

Each check produces a pass, warning, or error. The overall score is the average of all check scores.

### Understanding the Score

| Score  | Meaning                      |
|--------|------------------------------|
| 0.9-1.0 | Excellent — no issues       |
| 0.7-0.9 | Good — minor warnings       |
| 0.5-0.7 | Fair — some issues to review|
| < 0.5  | Poor — significant problems  |

---

## Settings

### AI Models

Configure which AI models are available:
- **Ollama Model**: Select from installed models (default: qwen2.5:7b)
- **WebGPU Model**: Select browser-based model (requires WebGPU)
- **Temperature**: Controls translation creativity (0.1-1.0, default: 0.3)

### API Keys

Add your Google Gemini API key to enable Channel 4 (cloud translation):
1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Paste it in the API Keys view
3. Enable "Use cloud fallback"

### General

- **Language**: Switch UI between English and Arabic
- **Theme**: Light or Dark mode
- **Backend URL**: Override the default `http://localhost:8000`

---

## Keyboard Shortcuts

| Shortcut     | Action                              |
|-------------|-------------------------------------|
| `Tab`       | Accept full ghost text suggestion   |
| `Ctrl + →`  | Accept next word of suggestion      |
| `Esc`       | Dismiss current suggestion          |
| `Alt + ]`   | Cycle to next suggestion alternative|

---

## Offline Usage

RDAT Copilot is designed to work offline after initial setup:

1. **Frontend**: Works offline as a PWA after first visit (service worker caches assets)
2. **Channel 0 (LTE)**: Always works offline (browser-based phrase table)
3. **Channel 3 (WebGPU)**: Works offline if a model has been downloaded previously
4. **Channels 1+2 (Backend)**: Require the local backend to be running — this needs Ollama but not internet

For full offline capability, make sure:
- You've visited the app at least once while online (to cache the PWA)
- You have a WebGPU model downloaded (via AI Models settings)
- The backend is running locally (doesn't need internet, just Ollama)

---

## Installing as a PWA

RDAT Copilot can be installed as a Progressive Web App for a native-like experience:

1. Open the app in Chrome or Edge
2. Click the install icon in the address bar (or the "Install App" button)
3. The app opens in its own window without browser controls
4. It appears in your taskbar/dock and start menu

Benefits of PWA installation:
- Faster startup (no address bar, no browser UI)
- Desktop integration (taskbar, dock, shortcuts)
- Better offline support
- More screen space for the translation editor
