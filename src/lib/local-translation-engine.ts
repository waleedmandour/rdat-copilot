/**
 * Local Translation Engine (LTE) — Channel 0
 *
 * A blazing-fast (<5ms) synchronous phrase-table/n-gram matcher.
 * Does NOT use neural networks. Operates purely on:
 *  1. Exact/partial string matching
 *  2. "Smart Remainder" prefix completion
 *  3. N-gram overlap scoring
 *
 * Loaded at startup from /public/data/default-corpus-en-ar.json.
 * All data lives in memory — zero I/O after initialization.
 */

interface CorpusEntry {
  en: string;
  ar: string;
  type: string;
}

interface LTEResult {
  match: string;       // The matched Arabic translation
  source: string;      // The source English text
  remainder: string;   // Smart remainder to complete
  score: number;       // 0-1 match confidence
  type: "exact" | "partial" | "ngram" | "sentence-split";
}

/**
 * Split a multi-sentence text into individual sentences.
 * Handles common sentence boundaries: . ! ? followed by space or end.
 * Preserves abbreviations like "e.g." and "i.e." by requiring
 * a following space before splitting.
 */
function splitSentences(text: string): string[] {
  // Split on sentence boundaries (. ! ?) followed by a space and uppercase/quote
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return sentences;
}

/**
 * Normalize text for comparison:
 *  - Lowercase, trim, collapse whitespace
 *  - Remove trailing punctuation for prefix matching
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?،؛]+$/, "")
    .trim();
}

/**
 * Compute n-gram overlap similarity (character trigrams).
 * Returns a 0-1 score.
 */
function ngramSimilarity(a: string, b: string): number {
  const getTrigrams = (s: string): Set<string> => {
    const trigrams = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) {
      trigrams.add(s.substring(i, i + 3));
    }
    return trigrams;
  };

  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);

  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  // Jaccard similarity
  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Local Translation Engine class.
 *
 * Loads the corpus into an efficient in-memory index and provides
 * instant phrase matching with "Smart Remainder" completion.
 */
export class LocalTranslationEngine {
  private corpus: CorpusEntry[] = [];
  private normalizedIndex: Map<string, CorpusEntry> = new Map();

  /**
   * Load corpus entries into memory.
   */
  load(entries: CorpusEntry[]) {
    this.corpus = entries;
    this.normalizedIndex.clear();

    for (const entry of entries) {
      const key = normalize(entry.en);
      this.normalizedIndex.set(key, entry);
    }

    console.log(`[LTE] Loaded ${entries.length} corpus entries into memory.`);
  }

  /**
   * Get a suggestion for the given source text and target prefix.
   *
   * Algorithm:
   *  0. If source contains multiple sentences, match each individually
   *  1. Find the best matching English source (exact → partial → n-gram)
   *  2. Check if the corresponding Arabic starts with the user's prefix
   *  3. Return the "Smart Remainder" (what's left after the prefix)
   *
   * @param sourceText  The English source segment (full line or paragraph)
   * @param targetPrefix What the user has already typed in Arabic
   * @returns LTEResult or null if no match found
   */
  getSuggestion(sourceText: string, targetPrefix: string): LTEResult | null {
    if (!sourceText.trim()) return null;

    const normalizedSource = normalize(sourceText);

    // ── Step 0: Multi-sentence matching ─────────────────────────
    // If the source contains multiple sentences, try matching each
    // sentence individually against the corpus and concatenate results.
    // This is the ROOT CAUSE fix: corpus stores individual sentences
    // but source text often has multi-sentence paragraphs.
    const sentences = splitSentences(sourceText);
    if (sentences.length > 1) {
      const multiResult = this.getMultiSentenceSuggestion(sentences, targetPrefix);
      if (multiResult) return multiResult;
    }

    // Step 1: Try exact match first (O(1) hash lookup)
    const exactMatch = this.normalizedIndex.get(normalizedSource);
    if (exactMatch) {
      const result = this.computeRemainder(
        exactMatch.en,
        exactMatch.ar,
        targetPrefix,
        "exact",
        1.0
      );
      if (result) return result;
    }

    // Step 2: Try partial/prefix match on source
    // Find entries where the source starts with or contains the query
    let bestPartial: { entry: CorpusEntry; score: number } | null = null;

    for (const [key, entry] of this.normalizedIndex) {
      // Check if source text contains this corpus key (or vice versa)
      if (key.includes(normalizedSource) || normalizedSource.includes(key)) {
        const score = key.length / Math.max(key.length, normalizedSource.length);
        if (!bestPartial || score > bestPartial.score) {
          bestPartial = { entry, score: score * 0.85 }; // Penalize partial
        }
      }
    }

    if (bestPartial && bestPartial.score > 0.4) {
      const result = this.computeRemainder(
        bestPartial.entry.en,
        bestPartial.entry.ar,
        targetPrefix,
        "partial",
        bestPartial.score
      );
      if (result) return result;
    }

    // Step 3: N-gram similarity fallback
    let bestNgram: { entry: CorpusEntry; score: number } | null = null;

    for (const entry of this.corpus) {
      const sim = ngramSimilarity(normalizedSource, normalize(entry.en));
      if (!bestNgram || sim > bestNgram.score) {
        bestNgram = { entry, score: sim };
      }
    }

    if (bestNgram && bestNgram.score > 0.25) {
      const result = this.computeRemainder(
        bestNgram.entry.en,
        bestNgram.entry.ar,
        targetPrefix,
        "ngram",
        bestNgram.score
      );
      if (result) return result;
    }

    return null;
  }

  /**
   * Match multiple sentences individually and concatenate Arabic translations.
   * Used when the source text is a multi-sentence paragraph.
   */
  private getMultiSentenceSuggestion(
    sentences: string[],
    targetPrefix: string
  ): LTEResult | null {
    const arabicParts: string[] = [];
    let totalScore = 0;
    let matchedCount = 0;
    const matchedSources: string[] = [];

    for (const sentence of sentences) {
      const result = this.findBestSentenceMatch(sentence, targetPrefix);
      if (result) {
        arabicParts.push(result.match);
        totalScore += result.score;
        matchedCount++;
        matchedSources.push(result.source);
      }
    }

    // Require at least one sentence match
    if (matchedCount === 0) return null;

    const avgScore = totalScore / sentences.length;
    const fullArabic = arabicParts.join(' ');
    const fullSource = matchedSources.join(' ');

    const remainderResult = this.computeRemainder(
      fullSource,
      fullArabic,
      targetPrefix,
      "sentence-split",
      avgScore
    );

    return remainderResult;
  }

  /**
   * Find the best matching corpus entry for a single sentence.
   * Uses exact → partial (threshold 0.4) → n-gram (threshold 0.25) fallback.
   */
  private findBestSentenceMatch(
    sourceText: string,
    targetPrefix: string
  ): LTEResult | null {
    const normalizedSource = normalize(sourceText);

    // Exact match
    const exactMatch = this.normalizedIndex.get(normalizedSource);
    if (exactMatch) {
      return this.computeRemainder(exactMatch.en, exactMatch.ar, targetPrefix, "exact", 1.0);
    }

    // Partial match
    let bestPartial: { entry: CorpusEntry; score: number } | null = null;
    for (const [key, entry] of this.normalizedIndex) {
      if (key.includes(normalizedSource) || normalizedSource.includes(key)) {
        const score = key.length / Math.max(key.length, normalizedSource.length);
        if (!bestPartial || score > bestPartial.score) {
          bestPartial = { entry, score: score * 0.85 };
        }
      }
    }
    if (bestPartial && bestPartial.score > 0.4) {
      const result = this.computeRemainder(
        bestPartial.entry.en, bestPartial.entry.ar, targetPrefix, "partial", bestPartial.score
      );
      if (result) return result;
    }

    // N-gram fallback
    let bestNgram: { entry: CorpusEntry; score: number } | null = null;
    for (const entry of this.corpus) {
      const sim = ngramSimilarity(normalizedSource, normalize(entry.en));
      if (!bestNgram || sim > bestNgram.score) {
        bestNgram = { entry, score: sim };
      }
    }
    if (bestNgram && bestNgram.score > 0.25) {
      return this.computeRemainder(
        bestNgram.entry.en, bestNgram.entry.ar, targetPrefix, "ngram", bestNgram.score
      );
    }

    return null;
  }

  /**
   * Compute the "Smart Remainder" — the completion text after the prefix.
   *
   * Uses fuzzy prefix alignment so that even if the user's typed text
   * doesn't character-for-character match the start of the corpus Arabic,
   * we can still find the best continuation point and return only the
   * remainder — avoiding the duplicate-text ghost-text bug.
   */
  private computeRemainder(
    source: string,
    fullArabic: string,
    targetPrefix: string,
    matchType: LTEResult["type"],
    baseScore: number
  ): LTEResult | null {
    const trimmedPrefix = targetPrefix.trim();
    const trimmedArabic = fullArabic.trim();

    // No prefix typed — return the full Arabic as the suggestion
    if (!trimmedPrefix) {
      return {
        match: fullArabic,
        source,
        remainder: fullArabic,
        score: baseScore,
        type: matchType,
      };
    }

    // Exact prefix match — return only the remainder after the prefix
    if (trimmedArabic.startsWith(trimmedPrefix)) {
      const remainder = trimmedArabic.substring(trimmedPrefix.length).trimStart();
      // CRITICAL: If remainder is empty, the user has already typed the
      // complete translation. Return null (no suggestion) instead of falling
      // back to the full Arabic — that would create duplicate ghost text
      // that blocks or interferes with user input.
      if (!remainder) return null;
      return {
        match: fullArabic,
        source,
        remainder,
        score: baseScore,
        type: matchType,
      };
    }

    // Fuzzy prefix alignment: find the best split point in the Arabic text
    // where the user's prefix aligns. This handles minor typing differences
    // (e.g. missing/extra characters) without returning the entire Arabic as remainder.
    const alignment = this.findBestAlignment(trimmedPrefix, trimmedArabic);

    if (alignment.score > 0.5) {
      // Good alignment found — return remainder from the alignment point
      const remainder = trimmedArabic.substring(alignment.arabicOffset).trimStart();
      // CRITICAL: Same as exact match — if remainder is empty after alignment,
      // there's nothing to suggest. Return null to let other channels try.
      if (!remainder) return null;
      return {
        match: fullArabic,
        source,
        remainder,
        score: baseScore * alignment.score,
        type: matchType,
      };
    }

    // Prefix doesn't match at all — skip this channel so we don't show
    // duplicate ghost text. Returning null lets the caller try other channels.
    return null;
  }

  /**
   * Find the best alignment between a typed prefix and the full Arabic text.
   * Uses character-level similarity to determine how many characters of
   * the Arabic the user has likely already typed.
   *
   * @returns The offset into fullArabic where the remainder should start,
   *          and a similarity score (0-1) indicating alignment quality.
   */
  private findBestAlignment(
    prefix: string,
    fullArabic: string
  ): { arabicOffset: number; score: number } {
    const prefixLen = prefix.length;
    const arabicLen = fullArabic.length;

    // Try aligning the prefix at several candidate offsets in the Arabic text
    let bestOffset = 0;
    let bestScore = 0;

    // Search window: try offsets from 0 to 1.5x the prefix length
    // (user might have typed slightly more or fewer characters)
    const maxOffset = Math.min(Math.ceil(prefixLen * 1.5), arabicLen);
    const step = Math.max(1, Math.floor(prefixLen / 10)); // sample for performance

    for (let offset = step; offset <= maxOffset; offset += step) {
      const candidate = fullArabic.substring(0, offset);
      const similarity = ngramSimilarity(normalize(prefix), normalize(candidate));

      if (similarity > bestScore) {
        bestScore = similarity;
        bestOffset = offset;
      }
    }

    return { arabicOffset: bestOffset, score: bestScore };
  }

  /**
   * Search the corpus by English text — returns top-k matches.
   * Used for finding relevant translations without RAG.
   */
  search(sourceText: string, limit = 5): Array<{
    en: string;
    ar: string;
    score: number;
    type: string;
  }> {
    const normalizedSource = normalize(sourceText);

    const scored = this.corpus.map((entry) => {
      const key = normalize(entry.en);
      const similarity = ngramSimilarity(normalizedSource, key);
      return { ...entry, score: similarity };
    });

    return scored
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ en, ar, score, type }) => ({ en, ar, score, type }));
  }

  /**
   * Get corpus statistics.
   */
  getStats() {
    return {
      entries: this.corpus.length,
      indexedKeys: this.normalizedIndex.size,
    };
  }

  /**
   * Get all corpus entries. Used for displaying glossary/table views.
   */
  getAll(): Array<{ en: string; ar: string; score: number; type: string }> {
    return this.corpus.map((entry) => ({
      en: entry.en,
      ar: entry.ar,
      score: 1.0,
      type: entry.type,
    }));
  }
}

// Singleton instance for global access
let lteInstance: LocalTranslationEngine | null = null;

/**
 * Get or create the LTE singleton.
 */
export function getLTE(): LocalTranslationEngine {
  if (!lteInstance) {
    lteInstance = new LocalTranslationEngine();
  }
  return lteInstance;
}
