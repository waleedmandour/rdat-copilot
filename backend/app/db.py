"""
SQLite Database Setup — Translation Memory + Glossary + Segments

Schema:
  - tm_entries: bilingual sentence pairs with source language info
  - glossary: terminology entries with part-of-speech and domain tags
  - segments: translation segments with confirmation status
  - tm_fts: FTS5 full-text search index on tm_entries
  - glossary_fts: FTS5 full-text search index on glossary

Dual Storage:
  - SQLite (backend): Authoritative store, FTS5 search, triggers
  - IndexedDB (frontend): Cached copy for offline reads, syncs via /sync endpoints
"""

import os

import aiosqlite

DB_PATH = os.environ.get("RDAT_DB_PATH", "rdat_copilot.db")


async def get_db() -> aiosqlite.Connection:
    """Get async database connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    """Create tables, indexes, FTS5 virtual tables, and seed demo data."""
    db = await get_db()
    try:
        await db.executescript("""
            -- ── Translation Memory ─────────────────────────────────
            CREATE TABLE IF NOT EXISTS tm_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                source_lang TEXT NOT NULL DEFAULT 'en',
                target_lang TEXT NOT NULL DEFAULT 'ar',
                domain TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Auto-update updated_at on row change
            CREATE TRIGGER IF NOT EXISTS trg_tm_updated_at
            AFTER UPDATE ON tm_entries
            FOR EACH ROW
            BEGIN
                UPDATE tm_entries SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id AND NEW.updated_at IS OLD.updated_at;
            END;

            -- ── Glossary ───────────────────────────────────────────
            CREATE TABLE IF NOT EXISTS glossary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_term TEXT NOT NULL,
                target_term TEXT NOT NULL,
                source_lang TEXT NOT NULL DEFAULT 'en',
                target_lang TEXT NOT NULL DEFAULT 'ar',
                pos TEXT,
                domain TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- ── Segments (translation unit tracking) ──────────────
            CREATE TABLE IF NOT EXISTS segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                target TEXT NOT NULL DEFAULT '',
                source_lang TEXT NOT NULL DEFAULT 'en',
                target_lang TEXT NOT NULL DEFAULT 'ar',
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft', 'confirmed', 'rejected', 'locked')),
                score REAL DEFAULT 0.0,
                source_file TEXT,
                segment_index INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Auto-update segments.updated_at on row change
            CREATE TRIGGER IF NOT EXISTS trg_segments_updated_at
            AFTER UPDATE ON segments
            FOR EACH ROW
            BEGIN
                UPDATE segments SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id AND NEW.updated_at IS OLD.updated_at;
            END;

            -- ── Indexes ────────────────────────────────────────────
            CREATE INDEX IF NOT EXISTS idx_tm_source ON tm_entries(source_lang, source);
            CREATE INDEX IF NOT EXISTS idx_tm_target ON tm_entries(target_lang, target);
            CREATE INDEX IF NOT EXISTS idx_tm_domain ON tm_entries(domain);
            CREATE INDEX IF NOT EXISTS idx_glossary_source ON glossary(source_lang, source_term);
            CREATE INDEX IF NOT EXISTS idx_glossary_domain ON glossary(domain);
            CREATE INDEX IF NOT EXISTS idx_segments_status ON segments(status);
            CREATE INDEX IF NOT EXISTS idx_segments_file ON segments(source_file, segment_index);

            -- ── FTS5 Full-Text Search ──────────────────────────────
            -- External content FTS5 tables for fast fuzzy matching.
            -- Content is mirrored from the main tables via triggers.

            CREATE VIRTUAL TABLE IF NOT EXISTS tm_fts USING fts5(
                source,
                target,
                content='tm_entries',
                content_rowid='id',
                tokenize='unicode61'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS glossary_fts USING fts5(
                source_term,
                target_term,
                content='glossary',
                content_rowid='id',
                tokenize='unicode61'
            );

            -- ── FTS5 sync triggers (keep FTS in sync with base tables) ──
            -- TM entries
            CREATE TRIGGER IF NOT EXISTS trg_tm_fts_insert AFTER INSERT ON tm_entries BEGIN
                INSERT INTO tm_fts(rowid, source, target) VALUES (NEW.id, NEW.source, NEW.target);
            END;
            CREATE TRIGGER IF NOT EXISTS trg_tm_fts_delete AFTER DELETE ON tm_entries BEGIN
                INSERT INTO tm_fts(tm_fts, rowid, source, target) VALUES('delete', OLD.id, OLD.source, OLD.target);
            END;
            CREATE TRIGGER IF NOT EXISTS trg_tm_fts_update AFTER UPDATE ON tm_entries BEGIN
                INSERT INTO tm_fts(tm_fts, rowid, source, target) VALUES('delete', OLD.id, OLD.source, OLD.target);
                INSERT INTO tm_fts(rowid, source, target) VALUES (NEW.id, NEW.source, NEW.target);
            END;

            -- Glossary entries
            CREATE TRIGGER IF NOT EXISTS trg_glossary_fts_insert AFTER INSERT ON glossary BEGIN
                INSERT INTO glossary_fts(rowid, source_term, target_term) VALUES (NEW.id, NEW.source_term, NEW.target_term);
            END;
            CREATE TRIGGER IF NOT EXISTS trg_glossary_fts_delete AFTER DELETE ON glossary BEGIN
                INSERT INTO glossary_fts(glossary_fts, rowid, source_term, target_term) VALUES('delete', OLD.id, OLD.source_term, OLD.target_term);
            END;
            CREATE TRIGGER IF NOT EXISTS trg_glossary_fts_update AFTER UPDATE ON glossary BEGIN
                INSERT INTO glossary_fts(glossary_fts, rowid, source_term, target_term) VALUES('delete', OLD.id, OLD.source_term, OLD.target_term);
                INSERT INTO glossary_fts(rowid, source_term, target_term) VALUES (NEW.id, NEW.source_term, NEW.target_term);
            END;

            -- ── Seed Demo Data ─────────────────────────────────────
            INSERT OR IGNORE INTO tm_entries (id, source, target, source_lang, target_lang)
            SELECT * FROM (
                SELECT 1, 'The future of translation technology lies in the seamless integration of artificial intelligence with human expertise.',
                       'يكمن مستقبل تكنولوجيا الترجمة في التكامل السلس بين الذكاء الاصطناعي والخبرة البشرية.', 'en', 'ar'
                UNION ALL
                SELECT 2, 'Computer-assisted translation tools have evolved significantly, moving from simple terminology management to sophisticated neural machine translation systems.',
                       'فقد تطورت أدوات الترجمة بمساعدة الحاسوب بشكل ملحوظ، منتقلة من إدارة المصطلحات البسيطة إلى أنظمة الترجمة الآلية العصبية المتطورة.', 'en', 'ar'
                UNION ALL
                SELECT 3, 'Modern translators work in hybrid environments where AI provides initial suggestions and human linguists refine the output.',
                       'يعمل المترجمون الحديثون في بيئات هجينة حيث يقدم الذكاء الاصطناعي اقتراحات أولية ويقوم اللغويون البشر بتحسين المخرجات.', 'en', 'ar'
                UNION ALL
                SELECT 4, 'The key challenge in machine translation remains context preservation.',
                       'يظل الحفاظ على السياق التحدي الرئيسي في الترجمة الآلية.', 'en', 'ar'
                UNION ALL
                SELECT 5, 'Quality assurance in translation involves multiple layers: terminology consistency, grammatical correctness, cultural appropriateness, and domain accuracy.',
                       'تشمل ضمان الجودة في الترجمة طبقات متعددة: اتساق المصطلحات، والصحة النحوية، والملاءمة الثقافية، والدقة المتخصصة.', 'en', 'ar'
                UNION ALL
                SELECT 6, 'The emergence of real-time collaboration features has transformed how translation teams work together.',
                       'غيّر ظهور ميزات التعاون في الوقت الفعلي طريقة عمل فرق الترجمة معاً.', 'en', 'ar'
                UNION ALL
                SELECT 7, 'Cloud-based platforms allow multiple linguists to work on the same project simultaneously.',
                       'تتيح المنصات السحابية لعدة لغويين العمل على نفس المشروع في وقت واحد.', 'en', 'ar'
                UNION ALL
                SELECT 8, 'Unlike human translators who understand cultural nuances and idiomatic expressions, AI systems rely on statistical patterns and training data.',
                       'فعلى عكس المترجمين البشر الذين يفهمون الفروق الثقافية والتعبيرات الاصطلاحية، تعتمد أنظمة الذكاء الاصطناعي على الأنماط الإحصائية وبيانات التدريب.', 'en', 'ar'
                UNION ALL
                SELECT 9, 'Professional translators use glossaries, translation memories, and style guides to maintain standards across large projects.',
                       'ويستخدم المترجمون المحترفون المسارد وقواعد الترجمة وأدلة الأسلوب للحفاظ على المعايير عبر المشاريع الكبيرة.', 'en', 'ar'
                UNION ALL
                SELECT 10, 'This collaborative approach ensures both efficiency and quality, particularly for specialized domains like legal, medical, and technical translation.',
                       'يضمن هذا النهج التعاوني الكفاءة والجودة معاً، لا سيما في المجالات المتخصصة مثل الترجمة القانونية والطبية والتقنية.', 'en', 'ar'
            ) AS seed
            WHERE NOT EXISTS (SELECT 1 FROM tm_entries LIMIT 1);

            -- Seed glossary entries
            INSERT OR IGNORE INTO glossary (id, source_term, target_term, pos, domain)
            SELECT * FROM (
                SELECT 1, 'translation', 'ترجمة', 'noun', 'general'
                UNION ALL
                SELECT 2, 'machine translation', 'ترجمة آلية', 'noun', 'technology'
                UNION ALL
                SELECT 3, 'artificial intelligence', 'ذكاء اصطناعي', 'noun', 'technology'
                UNION ALL
                SELECT 4, 'glossary', 'مسرد', 'noun', 'linguistics'
                UNION ALL
                SELECT 5, 'translation memory', 'ذاكرة الترجمة', 'noun', 'technology'
                UNION ALL
                SELECT 6, 'neural', 'عصبي', 'adjective', 'technology'
                UNION ALL
                SELECT 7, 'quality assurance', 'ضمان الجودة', 'noun', 'general'
                UNION ALL
                SELECT 8, 'terminology', 'مصطلحات', 'noun', 'linguistics'
                UNION ALL
                SELECT 9, 'context', 'سياق', 'noun', 'linguistics'
                UNION ALL
                SELECT 10, 'linguist', 'لغوي', 'noun', 'linguistics'
            ) AS gseed
            WHERE NOT EXISTS (SELECT 1 FROM glossary LIMIT 1);
        """)
        await db.commit()
        print(f"[DB] Database initialized at {DB_PATH}")
    finally:
        await db.close()
