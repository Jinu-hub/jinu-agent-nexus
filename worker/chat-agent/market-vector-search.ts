// ─────────────────────────────────────────────────────────────────────────
// §14.3 — Chat turn → MARKET_VECTOR_DB search (user query / 「keyword」)
// Not MyMemory ★ prefetch; that path stays string interestHits.
// ─────────────────────────────────────────────────────────────────────────

import { isMarketDateYmd } from "../market-date";
import {
  queryMarketVectors,
  type MarketVectorHit,
} from "../market-vector";
import {
  expandQueriesFromLexicon,
  tagLexiconFromEntries,
  type TagLexeme,
} from "../../src/lib/market-tag-lexicon";

/** Default floor — weak matches below this are treated as no hit. */
export const CHAT_VECTOR_MIN_SCORE = 0.68;

/** Normalize one user/tag query (+ optional report lexicon) into variants. */
export function expandChatVectorQueries(
  raw: string,
  tagLexicon?: TagLexeme[] | null,
): string[] {
  return expandQueriesFromLexicon(
    raw,
    tagLexiconFromEntries(tagLexicon ?? undefined),
  );
}

export type ChatVectorHit = {
  query: string;
  text: string;
  score: number;
  chunkIndex: number;
};

export type ChatVectorSearchResult = {
  queries: string[];
  marketDate: string | null;
  lang: string | null;
  itemId: string | null;
  hits: ChatVectorHit[];
  /** True when query ran but nothing passed minScore / empty index. */
  empty: boolean;
  error?: string;
};

/** Pull 「…」 / 『…』 / "…" / '…' search terms from the user message. */
export function extractQuotedQueries(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /「([^」]+)」/g,
    /『([^』]+)』/g,
    /"([^"]+)"/g,
    /'([^']+)'/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const t = m[1]?.trim() ?? "";
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

/** First YYYY-MM-DD in the message, if valid. */
export function extractMarketDateFromText(text: string): string | undefined {
  const m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (!m?.[1] || !isMarketDateYmd(m[1])) return undefined;
  return m[1];
}

function toChatHits(hits: MarketVectorHit[]): ChatVectorHit[] {
  return hits.map((h) => ({
    query: h.query,
    text: h.text,
    score: h.score,
    chunkIndex: h.chunkIndex,
  }));
}

/**
 * Run report-scoped vector search for chat prefetch.
 * `marketDate` omit → same resolve as ingest/query (data-backed latest via brief).
 */
export async function runChatVectorSearch(
  env: Env,
  opts: {
    queries: string[];
    marketDate?: string;
    lang?: string;
    /** From item_contents.metadata.tags.core (+ label_ko when present). */
    tagLexicon?: TagLexeme[] | null;
  },
): Promise<ChatVectorSearchResult> {
  const userQueries = opts.queries.map((q) => q.trim()).filter(Boolean);
  if (userQueries.length === 0) {
    return {
      queries: [],
      marketDate: null,
      lang: null,
      itemId: null,
      hits: [],
      empty: true,
    };
  }

  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const q of userQueries) {
    for (const v of expandChatVectorQueries(q, opts.tagLexicon)) {
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      expanded.push(v);
    }
  }

  try {
    const result = await queryMarketVectors(env, {
      queries: expanded,
      marketDate: opts.marketDate,
      lang: opts.lang,
      topKPerQuery: 2,
      hitLimit: 3,
      minScore: CHAT_VECTOR_MIN_SCORE,
    });
    const hits = toChatHits(result.hits);
    return {
      queries: userQueries,
      marketDate: result.marketDate,
      lang: result.lang,
      itemId: result.itemId,
      hits,
      empty: hits.length === 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "vector search failed";
    return {
      queries: userQueries,
      marketDate: opts.marketDate ?? null,
      lang: opts.lang ?? null,
      itemId: null,
      hits: [],
      empty: true,
      error: message,
    };
  }
}

/** Prefetch instruction when vectorSearch is attached. */
export function vectorSearchInstructionClause(
  search: ChatVectorSearchResult,
): string {
  if (search.error) {
    return (
      " vectorSearch failed (" +
      search.error +
      "). Say lookup failed briefly; do not invent keyword content."
    );
  }
  if (search.empty || search.hits.length === 0) {
    return (
      " CRITICAL: vectorSearch.hits is empty for queries " +
      JSON.stringify(search.queries) +
      ". Tell the user this report has no close match for that keyword. " +
      "Do NOT invent facts. Do NOT use unrelated report fields to fake a match."
    );
  }
  return (
    " CRITICAL: The user asked about specific keyword(s). " +
    "Answer ONLY from vectorSearch.hits text (report chunks). " +
    "Lead with those points; keep it short. " +
    "Do NOT invent. Do NOT pad with unrelated highlights/추가 항목. " +
    "One short line: full report in Market tab."
  );
}
