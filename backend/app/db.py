"""
SQLite Database Setup — Translation Memory + Glossary

Schema:
  - tm_entries: bilingual sentence pairs with source language info
  - glossary: terminology entries with part-of-speech and domain tags
"""

import aiosqlite
import os

DB_PATH = os.environ.get("RDAT_DB_PATH", "rdat_copilot.db")


async def get_db() -> aiosqlite.Connection:
    """Get async database connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    """Create tables if they don't exist."""
    db = await get_db()
    try:
        await db.executescript("""
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

            CREATE INDEX IF NOT EXISTS idx_tm_source ON tm_entries(source_lang, source);
            CREATE INDEX IF NOT EXISTS idx_tm_target ON tm_entries(target_lang, target);
            CREATE INDEX IF NOT EXISTS idx_glossary_source ON glossary(source_lang, source_term);

            -- Seed demo data if table is empty
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
            ) AS seed
            WHERE NOT EXISTS (SELECT 1 FROM tm_entries LIMIT 1);
        """)
        await db.commit()
        print(f"[DB] Database initialized at {DB_PATH}")
    finally:
        await db.close()
