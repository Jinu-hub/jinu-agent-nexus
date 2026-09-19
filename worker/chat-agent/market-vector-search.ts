// ─────────────────────────────────────────────────────────────────────────
// §14.3 — Chat turn → MARKET_VECTOR_DB search (user query / 「keyword」)
// Not MyMemory ★ prefetch; that path stays string interestHits.
// ─────────────────────────────────────────────────────────────────────────

import { isMarketDateYmd } from "../lib/market-date";
import {
  CHAT_VECTOR_HIT_LIMIT,
  CHAT_VECTOR_MIN_SCORE,
  CHAT_VECTOR_QUERY_ALIASES,
  CHAT_VECTOR_TOP_K_PER_QUERY,
} from "../lib/market-vector-defaults";
import type { ReportChatKeywords } from "../lib/report-keywords";
import {
  queryMarketVectors,
  textIncludesQuery,
  type MarketVectorHit,
} from "../market-vector";
import {
  expandQueriesFromLexicon,
  tagLexiconFromEntries,
  type TagLexeme,
} from "../../src/lib/market-tag-lexicon";
import { DEFAULT_INSTANCE_NAME } from "../../src/lib/agent-identity";

/** Re-export — weak matches below this are treated as no hit (unless lexical). */
export { CHAT_VECTOR_MIN_SCORE };

/** Normalize one user/tag query (+ optional report lexicon) into variants. */
export function expandChatVectorQueries(
  raw: string,
  tagLexicon?: TagLexeme[] | null,
  labelMap?: Record<string, string> | null,
): string[] {
  const fromLexicon = expandQueriesFromLexicon(
    raw,
    tagLexiconFromEntries(tagLexicon ?? undefined),
    labelMap,
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  for (const v of fromLexicon) push(v);
  const aliasKey = raw.trim().toLowerCase();
  const aliases =
    CHAT_VECTOR_QUERY_ALIASES[raw.trim()] ??
    CHAT_VECTOR_QUERY_ALIASES[aliasKey] ??
    [];
  for (const a of aliases) push(a);
  // Also expand aliases of already-expanded lexicon forms (slug → KO).
  for (const v of [...out]) {
    const more =
      CHAT_VECTOR_QUERY_ALIASES[v] ??
      CHAT_VECTOR_QUERY_ALIASES[v.toLowerCase()] ??
      [];
    for (const a of more) push(a);
  }
  return out;
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
  /**
   * When set, hits came from report keywords/highlights after Vectorize empty
   * (literal string match only).
   */
  fallback?: "keywords_highlights";
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

function flattenKeywordCorpus(
  keywords: ReportChatKeywords | null | undefined,
): string[] {
  if (!keywords) return [];
  return [
    ...keywords.companies.map((n) => `companies: ${n}`),
    ...keywords.institutions.map((n) => `institutions: ${n}`),
    ...keywords.technologies.map((n) => `technologies: ${n}`),
    ...keywords.industries.map((n) => `industries: ${n}`),
    ...keywords.products.map((n) => `products: ${n}`),
    ...keywords.tags.map((n) => `tags: ${n}`),
    ...keywords.places.map((n) => `places: ${n}`),
  ];
}

/**
 * When Vectorize returns no hits, keep literal matches from report
 * highlights / keywords so chat does not claim "not in report" while Topics
 * shows the name.
 */
export function buildKeywordHighlightFallbackHits(
  queries: string[],
  opts: {
    keywords?: ReportChatKeywords | null;
    highlights?: string[] | null;
    tagLexicon?: TagLexeme[] | null;
  },
): ChatVectorHit[] {
  const userQueries = queries.map((q) => q.trim()).filter(Boolean);
  if (userQueries.length === 0) return [];

  const highlights = (opts.highlights ?? []).filter(
    (h): h is string => typeof h === "string" && h.trim().length > 0,
  );
  const keywordLines = flattenKeywordCorpus(opts.keywords);

  const hits: ChatVectorHit[] = [];
  const seenText = new Set<string>();

  const tryPush = (query: string, text: string, score: number) => {
    const t = text.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seenText.has(key)) return;
    seenText.add(key);
    hits.push({
      query,
      text: t,
      score,
      chunkIndex: -1,
    });
  };

  // Prefer highlight headings (narrative) over bare keyword labels.
  for (const q of userQueries) {
    const matchVars = expandChatVectorQueries(q, opts.tagLexicon);
    for (const h of highlights) {
      if (matchVars.some((v) => textIncludesQuery(h, v))) {
        tryPush(q, h, 1);
      }
    }
  }
  for (const q of userQueries) {
    const matchVars = expandChatVectorQueries(q, opts.tagLexicon);
    for (const line of keywordLines) {
      if (matchVars.some((v) => textIncludesQuery(line, v))) {
        tryPush(q, line, 0.95);
      }
    }
  }

  return hits.slice(0, CHAT_VECTOR_HIT_LIMIT);
}

/** Fill empty vectorSearch from keywords/highlights when literal match exists. */
export function withKeywordHighlightFallback(
  search: ChatVectorSearchResult,
  opts: {
    keywords?: ReportChatKeywords | null;
    highlights?: string[] | null;
    tagLexicon?: TagLexeme[] | null;
  },
): ChatVectorSearchResult {
  if (search.error) return search;
  if (!search.empty && search.hits.length > 0) return search;

  const hits = buildKeywordHighlightFallbackHits(search.queries, opts);
  if (hits.length === 0) return search;

  return {
    ...search,
    hits,
    empty: false,
    fallback: "keywords_highlights",
  };
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
      topKPerQuery: CHAT_VECTOR_TOP_K_PER_QUERY,
      hitLimit: CHAT_VECTOR_HIT_LIMIT,
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
      "). Say lookup failed in one friendly line; do not invent keyword content."
    );
  }
  if (search.empty || search.hits.length === 0) {
    return (
      " vectorSearch.hits is empty for queries " +
      JSON.stringify(search.queries) +
      ". Tell the user gently that this report has no close match for that keyword. " +
      "Do not invent facts. Do not use unrelated report fields to fake a match."
    );
  }
  const label =
    search.queries.length === 1
      ? search.queries[0]
      : search.queries.join(" / ");
  const explain = isVectorExplainAsk(userText);
  const fromFallback = search.fallback === "keywords_highlights";
  const bulletHint = explain
    ? Math.min(Math.max(search.hits.length + 1, 3), 5)
    : Math.min(Math.max(search.hits.length, 2), 4);
  const depth = explain
    ? `${bulletHint} markdown bullets (min 3, max 5); each bullet 1–2 sentences; cover cause/effect when present in hits`
    : `${bulletHint} markdown bullets (min 2, max 4); each bullet = one line / one sentence`;
  const sourceNote = fromFallback
    ? " Hits are from report highlights/keywords (vector empty; literal match only). " +
      "If a hit is only a keyword label (e.g. companies: Intel) without a narrative highlight, " +
      "say it appears in Topics (home sidebar) — do not invent story details.\n"
    : "";
  return (
    " CRITICAL: keyword ask — answer ONLY from vectorSearch.hits text. " +
    "Do NOT invent. Do NOT pad with unrelated highlights/추가 항목. " +
    "Do NOT mention scores, hit counts, vectorSearch, embeddings, fallback, or prefetch JSON.\n" +
    "When hits are non-empty you MUST summarize concrete facts from those texts. " +
    "Never deflect with '내용이 많아요 / 직접 확인하세요 / Market 팀' instead of answering. " +
    "Prefer narrative / highlight sentences over glossary lines (- **TERM**: …).\n" +
    "VOICE LOCK (RULE 5b): Korean commentary = 해요체 ONLY for the whole reply " +
    "(…해요/…예요/…이에요/…졌어요). " +
    "Do NOT mix …다/…이다/…습니다/…었다 in the same answer. " +
    "Do NOT change the Market footer into …확인할 수 있습니다. " +
    "No filler openers. Never collapse into one paragraph.\n" +
    sourceNote +
    "OUTPUT SHAPE (markdown; follow exactly):\n" +
    `**「${label}」**\n` +
    "\n" +
    "- (fact from hits, ends with …해요/…예요)\n" +
    "\n" +
    "- (fact from hits, ends with …해요/…예요)\n" +
    "\n" +
    `(use ${depth}; each bullet on its own "- " line; blank line between bullets)\n` +
    "\n" +
    "원문·리포트는 Market 탭.\n" +
    "Forbidden: paragraph walls; ★ heading; nested headers; 습니다 footer variants; score footnotes."
  );
}

/** True when the user asked for explanation (not a short tip). */
export function isVectorExplainAsk(userText?: string): boolean {
  if (!userText?.trim()) return false;
  return /관련\s*내용에\s*대해\s*설명|설명해\s*줘|자세히|상세히|풀어\s*줘/.test(
    userText,
  );
}
