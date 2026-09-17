// ─────────────────────────────────────────────────────────────────────────
// §14.3 — Chat turn → MARKET_VECTOR_DB search (user query / 「keyword」)
// Not MyMemory ★ prefetch; that path stays string interestHits.
// ─────────────────────────────────────────────────────────────────────────

import { isMarketDateYmd } from "../lib/market-date";
import {
  queryMarketVectors,
  type MarketVectorHit,
} from "../market-vector";
import {
  expandQueriesFromLexicon,
  tagLexiconFromEntries,
  type TagLexeme,
} from "../../src/lib/market-tag-lexicon";
import { DEFAULT_INSTANCE_NAME } from "../../src/lib/agent-identity";

/** Default floor — weak matches below this are treated as no hit. */
export const CHAT_VECTOR_MIN_SCORE = 0.68;

/** Normalize one user/tag query (+ optional report lexicon) into variants. */
export function expandChatVectorQueries(
  raw: string,
  tagLexicon?: TagLexeme[] | null,
  labelMap?: Record<string, string> | null,
): string[] {
  return expandQueriesFromLexicon(
    raw,
    tagLexiconFromEntries(tagLexicon ?? undefined),
    labelMap,
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
    /** Market panel tab → report_series.id (scopes Vectorize to that report). */
    seriesId?: string;
    itemId?: string;
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

  const labelMap = await (async () => {
    try {
      const id = env.MyMemory.idFromName(DEFAULT_INSTANCE_NAME);
      const stub = env.MyMemory.get(id);
      return await stub.getTopicLabelsByKeys(
        userQueries,
        opts.lang ?? undefined,
      );
    } catch {
      return {} as Record<string, string>;
    }
  })();

  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const q of userQueries) {
    for (const v of expandChatVectorQueries(q, opts.tagLexicon, labelMap)) {
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
      seriesId: opts.seriesId,
      itemId: opts.itemId,
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
  userText?: string,
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
  const label =
    search.queries.length === 1
      ? search.queries[0]
      : search.queries.join(" / ");
  const explain = isVectorExplainAsk(userText);
  const bulletHint = explain
    ? Math.min(Math.max(search.hits.length + 1, 3), 5)
    : Math.min(Math.max(search.hits.length, 2), 4);
  const depth = explain
    ? `${bulletHint} bullets (min 3, max 5); each bullet may be 1–2 sentences; cover cause/effect when present in hits`
    : `${bulletHint} bullets (min 2, max 4); each bullet = one line / one sentence`;
  return (
    " CRITICAL: keyword ask — answer ONLY from vectorSearch.hits text. " +
    "Do NOT invent. Do NOT pad with unrelated highlights/추가 항목. " +
    "Do NOT mention scores, hit counts, vectorSearch, embeddings, or prefetch JSON.\n" +
    "OUTPUT SHAPE (markdown; blank lines required):\n" +
    `1) First line only: **「${label}」** (use this display phrase; not an English slug unless the user typed one)\n` +
    "2) Blank line\n" +
    `3) ${depth}\n` +
    "4) Blank line between bullets\n" +
    "5) Final line only: 원문·리포트는 Market 탭.\n" +
    "No other sections, no nested headers, no score footnotes."
  );
}

/** True when the user asked for explanation (not a short tip). */
export function isVectorExplainAsk(userText?: string): boolean {
  if (!userText?.trim()) return false;
  return /관련\s*내용에\s*대해\s*설명|설명해\s*줘|자세히|상세히|풀어\s*줘/.test(
    userText,
  );
}
