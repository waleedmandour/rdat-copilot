# API Reference

Complete reference for the RDAT Copilot FastAPI backend. The backend runs at `http://localhost:8000` by default.

**Interactive docs**: When the backend is running, visit [http://localhost:8000/docs](http://localhost:8000/docs) for the Swagger UI or [http://localhost:8000/redoc](http://localhost:8000/redoc) for ReDoc.

---

## Base URL

```
http://localhost:8000
```

Override with `NEXT_PUBLIC_LOCAL_BACKEND_URL` environment variable on the frontend.

---

## Health Check

### `GET /health`

Returns the backend health status including Ollama availability, SQLite status, and data counts.

**Response**:

```json
{
  "status": "ok",
  "ollama": true,
  "sqlite": true,
  "model": "qwen2.5:7b",
  "modelLoaded": true,
  "version": "0.2.0",
  "counts": {
    "tm": 10,
    "glossary": 10,
    "segments": 0
  }
}
```

**Fields**:

| Field         | Type    | Description                                      |
|--------------|---------|--------------------------------------------------|
| `status`     | string  | One of: `ok`, `degraded`, `down`                 |
| `ollama`     | boolean | Whether Ollama is reachable                      |
| `sqlite`     | boolean | Whether SQLite database is functional             |
| `model`      | string? | Currently loaded Ollama model name               |
| `modelLoaded`| boolean | Whether a model is loaded and ready              |
| `version`    | string  | Backend version                                  |
| `counts`     | object  | Entry counts for TM, glossary, and segments      |

**Status values**:
- `ok` — Both Ollama and SQLite are working
- `degraded` — SQLite works but Ollama is unreachable (TM search works, LLM translation does not)
- `down` — SQLite is not working

---

## Translation

### `POST /translate/stream`

SSE streaming translation endpoint. Implements the full Retrieve → Suggest → Validate pipeline.

**Request body**:

```json
{
  "source": "The future of translation technology",
  "prefix": "مستقبل",
  "max_tokens": 30
}
```

| Field        | Type   | Required | Default | Description                           |
|-------------|--------|----------|---------|---------------------------------------|
| `source`    | string | Yes      | —       | English source text to translate      |
| `prefix`    | string | No       | `""`    | Arabic text user has already typed    |
| `max_tokens`| int    | No       | 30      | Maximum LLM output words              |

**Response**: `text/event-stream`

SSE events are JSON objects prefixed with `data: `:

```
data: {"channel": "glossary", "terms": [...]}

data: {"channel": "tm", "text": "...", "score": 0.92, "match_type": "exact"}

data: {"channel": "llm", "text": "token"}

data: {"channel": "validate", "is_valid": true, "score": 0.95, "warnings": [], "errors": []}

data: [DONE]
```

**Event channels**:

| Channel     | Description                                          |
|------------|------------------------------------------------------|
| `glossary` | Glossary terms found in the source text              |
| `tm`       | Translation Memory match (may skip LLM if score >= 0.85) |
| `llm`      | Ollama LLM token (streamed one token at a time)      |
| `validate` | Quality validation result on the final translation   |

**TM match types**: `exact`, `fts5`, `like`

**Pipeline behavior**:
- If a TM match has score >= 0.85, the LLM is **skipped** and the TM result is returned immediately
- If a TM match has score < 0.85, both the TM result and LLM result are sent
- Glossary terms are always sent first if found
- Validation runs on the final translation (TM or LLM)

---

### `POST /translate`

Non-streaming full paragraph translation. Returns the complete translation as JSON.

**Request body**:

```json
{
  "source": "The future of translation technology lies in the seamless integration of artificial intelligence with human expertise.",
  "max_tokens": 256,
  "validate": true
}
```

| Field        | Type    | Required | Default | Description                           |
|-------------|---------|----------|---------|---------------------------------------|
| `source`    | string  | Yes      | —       | English source text                  |
| `max_tokens`| int     | No       | 256     | Maximum LLM output tokens            |
| `validate`  | boolean | No       | false   | Whether to run quality validation    |

**Response**:

```json
{
  "translation": "يكمن مستقبل تكنولوجيا الترجمة في التكامل السلس بين الذكاء الاصطناعي والخبرة البشرية.",
  "channel": "llm",
  "model": "ollama",
  "glossary": [
    {"source_term": "translation", "target_term": "ترجمة", "pos": "noun", "domain": "general"}
  ],
  "validation": {
    "is_valid": true,
    "score": 0.95,
    "warnings": [],
    "errors": []
  }
}
```

---

## Translation Memory

### `GET /tm/search`

Search TM by source text using FTS5 full-text search.

**Query parameters**:

| Param  | Type | Required | Default | Description          |
|--------|------|----------|---------|----------------------|
| `q`    | string | Yes    | —       | Search query         |
| `limit`| int    | No     | 5       | Maximum results      |

**Response**:

```json
{
  "results": [
    {"source": "...", "target": "...", "score": 0.92}
  ],
  "count": 1
}
```

---

### `POST /tm/search`

POST variant of TM search, returning detailed match information including match type.

**Request body**:

```json
{
  "query": "translation technology",
  "limit": 5
}
```

**Response**:

```json
{
  "results": [
    {
      "id": 1,
      "source": "The future of translation technology...",
      "target": "يكمن مستقبل تكنولوجيا الترجمة...",
      "score": 0.92,
      "match_type": "fts5"
    }
  ],
  "count": 1
}
```

---

### `POST /tm/entries`

Add a new TM entry.

**Request body**:

```json
{
  "source": "Hello world",
  "target": "مرحبا بالعالم",
  "source_lang": "en",
  "target_lang": "ar",
  "domain": "general"
}
```

| Field         | Type   | Required | Default | Description               |
|--------------|--------|----------|---------|---------------------------|
| `source`     | string | Yes      | —       | Source text               |
| `target`     | string | Yes      | —       | Target text               |
| `source_lang`| string | No       | `"en"`  | Source language code      |
| `target_lang`| string | No       | `"ar"`  | Target language code      |
| `domain`     | string | No       | null    | Domain tag                |

**Response**:

```json
{
  "status": "ok",
  "id": 11,
  "message": "Entry added"
}
```

---

### `POST /tm/bulk-import`

Bulk import TM entries.

**Request body**:

```json
{
  "entries": [
    {"source": "Hello", "target": "مرحبا"},
    {"source": "Goodbye", "target": "وداعا"}
  ]
}
```

**Response**:

```json
{
  "status": "ok",
  "imported": 2,
  "message": "Imported 2 entries"
}
```

---

### `GET /tm/entries`

List TM entries with pagination.

**Query parameters**:

| Param   | Type | Default | Description          |
|---------|------|---------|----------------------|
| `limit` | int  | 100     | Results per page     |
| `offset`| int  | 0       | Skip N entries       |

**Response**:

```json
{
  "entries": [
    {
      "id": 1,
      "source": "...",
      "target": "...",
      "source_lang": "en",
      "target_lang": "ar",
      "domain": null,
      "created_at": "2025-01-15 10:30:00",
      "updated_at": "2025-01-15 10:30:00"
    }
  ],
  "count": 10
}
```

---

### `GET /tm/entries/{entry_id}`

Get a single TM entry by ID.

**Response**: The TM entry object or `404` if not found.

---

### `PUT /tm/entries/{entry_id}`

Update an existing TM entry. Only non-null fields are updated.

**Request body**:

```json
{
  "target": "ترجمة محدثة",
  "domain": "technology"
}
```

---

### `DELETE /tm/entries/{entry_id}`

Delete a TM entry. Returns `404` if not found.

---

### `GET /tm/count`

Get total TM entry count.

**Response**: `{"count": 10}`

---

### `GET /sync/tm`

Sync endpoint for the dual storage layer. Returns TM entries updated after a timestamp.

**Query parameters**:

| Param   | Type   | Required | Description                              |
|---------|--------|----------|------------------------------------------|
| `since` | string | No       | ISO timestamp — only return entries after this time |

**Response**:

```json
{
  "entries": [...],
  "count": 5
}
```

---

## Glossary

### `GET /glossary/search`

Search glossary by source or target term using FTS5 with LIKE fallback.

**Query parameters**:

| Param  | Type   | Required | Default | Description       |
|--------|--------|----------|---------|-------------------|
| `q`    | string | Yes      | —       | Search query      |
| `limit`| int    | No       | 20      | Maximum results   |

---

### `GET /glossary/lookup`

Look up glossary terms that appear in a given source text. Used by the orchestrator for glossary-aware prompts.

**Query parameters**:

| Param | Type   | Required | Description                  |
|-------|--------|----------|------------------------------|
| `q`   | string | Yes      | Source text to search within |

**Response**:

```json
{
  "entries": [
    {"source_term": "translation", "target_term": "ترجمة", "pos": "noun", "domain": "general"}
  ],
  "count": 1
}
```

---

### `POST /glossary/entries`

Add a new glossary entry.

**Request body**:

```json
{
  "source_term": "machine translation",
  "target_term": "ترجمة آلية",
  "source_lang": "en",
  "target_lang": "ar",
  "pos": "noun",
  "domain": "technology",
  "notes": "Standard term in NLP literature"
}
```

---

### `POST /glossary/bulk-import`

Bulk import glossary entries.

**Request body**:

```json
{
  "entries": [
    {"source_term": "AI", "target_term": "ذكاء اصطناعي", "pos": "noun"},
    {"source_term": "NLP", "target_term": "معالجة اللغة الطبيعية", "pos": "noun"}
  ]
}
```

---

### `GET /glossary/entries`

List glossary entries with pagination.

**Query parameters**: `limit` (default: 100), `offset` (default: 0)

---

### `GET /glossary/entries/{entry_id}`

Get a single glossary entry by ID.

---

### `PUT /glossary/entries/{entry_id}`

Update a glossary entry. Only non-null fields are updated.

---

### `DELETE /glossary/entries/{entry_id}`

Delete a glossary entry.

---

### `GET /glossary/count`

Get total glossary entry count.

---

### `GET /sync/glossary`

Sync endpoint for the dual storage layer. Returns glossary entries created after a timestamp.

**Query parameters**: `since` (optional ISO timestamp)

---

## Segments

### `POST /segments`

Create a new translation segment.

**Request body**:

```json
{
  "source": "Hello world",
  "target": "مرحبا بالعالم",
  "source_lang": "en",
  "target_lang": "ar",
  "status": "draft",
  "score": 0.0,
  "source_file": "document.txt",
  "segment_index": 0
}
```

| Field            | Type   | Required | Default    | Description                                    |
|-----------------|--------|----------|------------|------------------------------------------------|
| `source`        | string | Yes      | —          | Source text                                    |
| `target`        | string | No       | `""`       | Target text                                    |
| `source_lang`   | string | No       | `"en"`     | Source language code                            |
| `target_lang`   | string | No       | `"ar"`     | Target language code                            |
| `status`        | string | No       | `"draft"`  | One of: draft, confirmed, rejected, locked     |
| `score`         | float  | No       | 0.0        | Translation quality score                      |
| `source_file`   | string | No       | null       | Source file name                               |
| `segment_index` | int    | No       | null       | Position within source file                    |

---

### `POST /segments/bulk`

Bulk create segments from a source file.

**Request body**:

```json
{
  "segments": [
    {"source": "First sentence."},
    {"source": "Second sentence."}
  ],
  "source_file": "document.txt"
}
```

---

### `GET /segments`

List segments with optional filtering.

**Query parameters**:

| Param         | Type   | Required | Default | Description                    |
|--------------|--------|----------|---------|--------------------------------|
| `limit`      | int    | No       | 100     | Results per page               |
| `offset`     | int    | No       | 0       | Skip N entries                 |
| `status`     | string | No       | null    | Filter by status               |
| `source_file`| string | No       | null    | Filter by source file name     |

---

### `GET /segments/{segment_id}`

Get a single segment by ID.

---

### `PUT /segments/{segment_id}`

Update a segment. Only non-null fields are updated.

**Request body**:

```json
{
  "target": "ترجمة محدثة",
  "status": "confirmed",
  "score": 0.95
}
```

---

### `DELETE /segments/{segment_id}`

Delete a segment.

---

### `GET /segments/count`

Get segment count, optionally filtered by status.

**Query parameters**: `status` (optional)

---

## Validation

### `POST /validate`

Run quality validation checks on a translation pair.

**Request body**:

```json
{
  "source": "The future of translation technology",
  "target": "مستقبل تكنولوجيا الترجمة"
}
```

**Response**:

```json
{
  "is_valid": true,
  "score": 0.95,
  "warnings": [],
  "errors": []
}
```

**Checks performed**:

| Check                    | Error/Warning | Description                                           |
|--------------------------|---------------|-------------------------------------------------------|
| Empty target             | Error         | Target text is empty                                  |
| Length ratio             | Error         | Target is less than 30% of source length              |
| Length ratio             | Warning       | Target is more than 300% of source length             |
| Number preservation      | Error         | Numbers in source are missing in target               |
| Arabic character ratio   | Error         | Less than 10% Arabic chars in target (>10 chars)      |
| Arabic character ratio   | Warning       | Less than 30% Arabic chars in target (>10 chars)      |
| Untranslated English     | Warning       | More than 3 suspicious English words in target        |

**Score calculation**: Each check contributes 0.0 (fail), 0.5 (warning), or 1.0 (pass). The overall score is the average of all check scores.

---

## Error Responses

All endpoints return standard HTTP error codes:

| Status | Meaning                          |
|--------|----------------------------------|
| 400    | Bad request (validation error)   |
| 404    | Resource not found               |
| 422    | Unprocessable entity (Pydantic)  |
| 500    | Internal server error            |

Error response format:

```json
{
  "detail": "Error message describing what went wrong"
}
```
