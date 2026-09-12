// Server-side Market Memory prefetch for chat turns.
// GLM often reasons then ends without tool calls (hang / empty reply).
// beforeTurn injects authoritative JSON so the model can answer without tools.

import type { ChatAgent } from "./ChatAgent";
import { getSettings } from "./settings";
import { getTodayContentAudio } from "../content-audio";
import { getTodayContentBrief } from "../content-briefs";
import { getTodayItemContent } from "../item-contents";
import { metaString, withResolvedMarketDate } from "../market-memory-load";
import { isMarketDateYmd, shiftMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";
import {
  resolveToolMarketDate,
  seoulDateHints,
} from "../tools/market-date-resolve";
import {
  reportChatExcerpt,
  reportHighlightHeadings,
} from "../tools/getTodayMarketReport";
import { reportChatKeywords } from "../report-keywords";
import type { ReportChatKeywords } from "../report-keywords";
import {
  detectMarketMemoryIntent,
  type MarketMemoryIntent,
} from "./market-intent";
import {
  interestsInstructionClause,
  loadUserInterests,
  resolveInterestHits,
  type CompactInterest,
} from "./user-interests";
import {
  extractMarketDateFromText,
  extractQuotedQueries,
  runChatVectorSearch,
  vectorSearchInstructionClause,
  type ChatVectorSearchResult,
} from "./market-vector-search";

/** Attach compact userInterests (+ interestHits) to a prefetch payload. */
function withUserInterests<T extends Record<string, unknown>>(
  payload: T,
  interests: CompactInterest[],
  opts?: {
    keywords?: ReportChatKeywords | null;
    snippets?: Array<string | null | undefined>;
    /** Always expose interestHits (even []) so the model can see the field. */
    includeHits?: boolean;
  },
): T & {
  userInterests: CompactInterest[];
  interestHits?: string[];
} {
  const keywords = opts?.keywords;
  const snippets = opts?.snippets;
  const includeHits =
    opts?.includeHits === true || keywords != null || Boolean(snippets?.length);
  const interestHits = resolveInterestHits(interests, keywords, snippets);
  const hasHits = interestHits.length > 0;
  const instruction =
    typeof payload.instruction === "string"
      ? payload.instruction + interestsInstructionClause(hasHits)
      : payload.instruction;

  return {
    ...payload,
    instruction,
    userInterests: interests,
    ...(includeHits ? { interestHits } : {}),
  };
}

/** §14.3 — attach vectorSearch when the user message has 「keyword」 queries. */
async function withVectorSearch<T extends Record<string, unknown>>(
  env: Env,
  payload: T,
  opts: {
    userText: string;
    marketDate?: string;
    lang?: string;
  },
): Promise<T & { vectorSearch?: ChatVectorSearchResult }> {
  const queries = extractQuotedQueries(opts.userText);
  if (queries.length === 0) return payload;

  const search = await runChatVectorSearch(env, {
    queries,
    marketDate: opts.marketDate,
    lang: opts.lang,
  });
  const instruction =
    typeof payload.instruction === "string"
      ? payload.instruction + vectorSearchInstructionClause(search)
      : payload.instruction;

  return {
    ...payload,
    instruction,
    vectorSearch: search,
  };
}

function reportSnippets(report: {
  title?: string | null;
  summary?: string | null;
  excerpt?: string | null;
  highlights?: string[] | null;
}): Array<string | null | undefined> {
  return [
    report.title,
    report.summary,
    report.excerpt,
    ...(Array.isArray(report.highlights) ? report.highlights : []),
  ];
}

function briefSnippets(brief: {
  title?: string | null;
  pulse?: string | null;
  takeaway?: string | null;
  contentExcerpt?: string | null;
}): Array<string | null | undefined> {
  return [brief.title, brief.pulse, brief.takeaway, brief.contentExcerpt];
}

async function loadBrief(
  agent: ChatAgent,
  env: Env,
  date: string | undefined,
) {
  const { content_lang: lang } = getSettings(agent);
  const loaded = await withResolvedMarketDate(env, date, lang, (marketDate) =>
    getTodayContentBrief(env, { marketDate, lang }),
  );
  if (!loaded.ok) {
    return {
      ok: false as const,
      reason: "invalid_date" as const,
      requestedDate: loaded.resolved.requestedDate,
    };
  }

  const { resolved, result, correctedFrom } = loaded;

  if (!result.item) {
    return {
      ok: true as const,
      found: false as const,
      marketDate: result.marketDate,
      lang: result.lang,
      requestedDate: resolved.requestedDate,
      usedExpectedLatest: resolved.usedExpectedLatest,
      usedDataBackedLatest: resolved.usedDataBackedLatest,
    };
  }

  const item = result.item;
  return {
    ok: true as const,
    found: true as const,
    marketDate: result.marketDate,
    lang: result.lang,
    title: item.title,
    pulse: metaString(item.metadata, "pulse"),
    takeaway: metaString(item.metadata, "takeaway"),
    // Cap body so the system prompt stays small; panel has the full text.
    contentExcerpt: (item.content ?? "").slice(0, 1200),
    requestedDate: resolved.requestedDate,
    correctedFrom,
    usedExpectedLatest: resolved.usedExpectedLatest,
    usedDataBackedLatest: resolved.usedDataBackedLatest,
  };
}

async function loadVoice(
  agent: ChatAgent,
  env: Env,
  date: string | undefined,
) {
  const { content_lang: lang } = getSettings(agent);
  const loaded = await withResolvedMarketDate(env, date, lang, (marketDate) =>
    getTodayContentAudio(env, { marketDate, lang }),
  );
  if (!loaded.ok) {
    return {
      ok: false as const,
      reason: "invalid_date" as const,
      requestedDate: loaded.resolved.requestedDate,
    };
  }

  const { resolved, result, correctedFrom } = loaded;

  if (!result.item) {
    return {
      ok: true as const,
      found: false as const,
      marketDate: result.marketDate,
      lang: result.lang,
      requestedDate: resolved.requestedDate,
      usedExpectedLatest: resolved.usedExpectedLatest,
      usedDataBackedLatest: resolved.usedDataBackedLatest,
    };
  }

  const item = result.item;
  return {
    ok: true as const,
    found: true as const,
    marketDate: result.marketDate,
    lang: result.lang,
    title: item.title,
    durationSeconds: item.duration_seconds,
    playPath: `/api/audio/file/${item.id}`,
    requestedDate: resolved.requestedDate,
    correctedFrom,
    usedExpectedLatest: resolved.usedExpectedLatest,
    usedDataBackedLatest: resolved.usedDataBackedLatest,
  };
}

async function loadReport(
  agent: ChatAgent,
  env: Env,
  date: string | undefined,
) {
  const { content_lang: lang } = getSettings(agent);
  const loaded = await withResolvedMarketDate(env, date, lang, (marketDate) =>
    getTodayItemContent(env, { marketDate, lang }),
  );
  if (!loaded.ok) {
    return {
      ok: false as const,
      reason: "invalid_date" as const,
      requestedDate: loaded.resolved.requestedDate,
    };
  }

  const { resolved, result, correctedFrom } = loaded;

  if (!result.item) {
    return {
      ok: true as const,
      found: false as const,
      marketDate: result.marketDate,
      lang: result.lang,
      briefId: result.briefId,
      targetId: result.targetId,
      requestedDate: resolved.requestedDate,
      usedExpectedLatest: resolved.usedExpectedLatest,
      usedDataBackedLatest: resolved.usedDataBackedLatest,
    };
  }

  const item = result.item;
  return {
    ok: true as const,
    found: true as const,
    marketDate: result.marketDate,
    lang: result.lang,
    title: item.title,
    summary: item.summary,
    excerpt: reportChatExcerpt(item.content, item.summary),
    highlights: reportHighlightHeadings(item.content),
    keywords: reportChatKeywords(item),
    reportType: item.report_type,
    requestedDate: resolved.requestedDate,
    correctedFrom,
    usedExpectedLatest: resolved.usedExpectedLatest,
    usedDataBackedLatest: resolved.usedDataBackedLatest,
  };
}

function resolveAskDate(
  intent: MarketMemoryIntent,
  hints: ReturnType<typeof seoulDateHints>,
  userText?: string,
): string | undefined {
  const fromText = userText ? extractMarketDateFromText(userText) : undefined;
  if (fromText) return fromText;
  if (intent.kind === "compare") return undefined;
  if (intent.dateHint === "today") return hints.today;
  // Calendar yesterday only when user said 어제 — not "latest"
  if (intent.dateHint === "yesterday") return hints.yesterday;
  // latest or omit → undefined → resolveToolMarketDate uses data-backed latest
  return undefined;
}

/**
 * Build a system-prompt block with Market Memory facts for this user turn.
 * Returns null when the turn is not a Market Memory ask.
 */
export async function buildMarketPrefetchBlock(
  agent: ChatAgent,
  env: Env,
  userText: string,
): Promise<string | null> {
  const intent = detectMarketMemoryIntent(userText);
  if (!intent) return null;

  if (!isSupabaseConfigured(env)) {
    return JSON.stringify(
      {
        intent: intent.kind,
        ok: false,
        reason: "supabase_not_configured",
        instruction:
          "Tell the user Market Memory is unavailable (Supabase not configured). Do not invent briefs.",
      },
      null,
      2,
    );
  }

  const hints = seoulDateHints();
  const userInterests = await loadUserInterests(env);

  try {
    if (intent.kind === "voice") {
      const voice = await loadVoice(
        agent,
        env,
        resolveAskDate(intent, hints, userText),
      );
      return JSON.stringify(
        withUserInterests(
          {
            intent: "voice",
            seoulHints: hints,
            voice,
            instruction:
              "Reply briefly with title/duration if found. Direct the user to Market tab → Latest to listen. Do not invent a transcript. Do not call getTodayMarketVoice unless this block is missing the needed date.",
          },
          userInterests,
        ),
        null,
        2,
      );
    }

    if (intent.kind === "compare") {
      const { content_lang: lang } = getSettings(agent);
      const latestResolved = await resolveToolMarketDate(env, undefined, {
        lang,
      });
      const dayB =
        latestResolved.marketDate && isMarketDateYmd(latestResolved.marketDate)
          ? latestResolved.marketDate
          : hints.yesterday;
      const dayA = shiftMarketDateYmd(dayB, -1);
      const [a, b] = await Promise.all([
        loadBrief(agent, env, dayA),
        loadBrief(agent, env, dayB),
      ]);
      const snippets = [
        ...("title" in a ? briefSnippets(a) : []),
        ...("title" in b ? briefSnippets(b) : []),
      ];
      return JSON.stringify(
        withUserInterests(
          {
            intent: "compare",
            seoulHints: hints,
            briefs: { earlier: a, later: b },
            instruction:
              "Compare tone/themes using pulse/takeaway/title (and excerpts if needed). Answer the comparison only — short natural language. Do NOT paste full content. Do NOT emit <tool_call> or XML tool markup — facts are already here. One line: full text in Market tab by date. later ≈ data-backed latest (not blindly calendar yesterday).",
          },
          userInterests,
          { snippets, includeHits: true },
        ),
        null,
        2,
      );
    }

    if (intent.kind === "reportVsBrief") {
      const { content_lang: lang } = getSettings(agent);
      const askDate = resolveAskDate(intent, hints, userText);
      const [brief, report] = await Promise.all([
        loadBrief(agent, env, askDate),
        loadReport(agent, env, askDate),
      ]);
      const reportKw =
        report && "keywords" in report
          ? (report.keywords as ReportChatKeywords)
          : null;
      const snippets = [
        ...("title" in brief ? briefSnippets(brief) : []),
        ...("title" in report && "summary" in report
          ? reportSnippets(report)
          : []),
      ];
      const marketDate =
        (report && "marketDate" in report && typeof report.marketDate === "string"
          ? report.marketDate
          : undefined) ??
        (brief && "marketDate" in brief && typeof brief.marketDate === "string"
          ? brief.marketDate
          : undefined) ??
        askDate;
      return JSON.stringify(
        await withVectorSearch(
          env,
          withUserInterests(
            {
              intent: "reportVsBrief",
              seoulHints: hints,
              brief,
              report,
              instruction:
                "Same-day Brief vs Report — content only, not format. Product fact: Brief is usually distilled FROM Report highlights (pulse/takeaway ≈ highlight themes), so do NOT say 'Brief is short / Report is long' or 'Brief compresses, Report expands' — that is empty. Instead: (1) name 1–2 themes both share; (2) name what Report adds beyond Brief (e.g. 주요/추가 항목, extra companies/events, 마무리, 용어) using summary/excerpt/highlights vs brief pulse/takeaway/excerpt; (3) if they largely align, say so in one line. Short natural language. No full markdown dump. No <tool_call>/XML. One line: details in Market tab → Brief / Report.",
            },
            userInterests,
            { keywords: reportKw, snippets, includeHits: true },
          ),
          { userText, marketDate, lang },
        ),
        null,
        2,
      );
    }

    if (intent.kind === "report") {
      const { content_lang: lang } = getSettings(agent);
      const askDate = resolveAskDate(intent, hints, userText);
      const report = await loadReport(agent, env, askDate);
      const keywordsOnly = Boolean(intent.keywordsOnly);
      const reportKw =
        report && "keywords" in report
          ? (report.keywords as ReportChatKeywords)
          : null;
      const snippets =
        report && "summary" in report ? reportSnippets(report) : [];
      const marketDate =
        report && "marketDate" in report && typeof report.marketDate === "string"
          ? report.marketDate
          : askDate;
      const quoted = extractQuotedQueries(userText);
      const baseInstruction = intent.fullText
        ? "User wants the FULL report. Do NOT paste content/excerpt into chat. Do NOT emit <tool_call> or XML. Reply in 1–2 short lines pointing to Market tab → Report (include marketDate)."
        : keywordsOnly && quoted.length === 0
          ? "User wants KEYWORDS only. Answer from report.keywords (tags, places, companies, institutions, technologies, industries, products) — short bullet or comma list. Do NOT invent names missing from keywords. Do NOT paste excerpt/full report. Do NOT emit <tool_call>/XML. One short line: more detail in Market tab → Topics. If interestHits is non-empty, list those FIRST before other keywords."
          : quoted.length > 0
            ? "User asked about a specific keyword in the full report. Prefer vectorSearch.hits when present."
            : "Answer briefly using title/summary/excerpt/highlights/keywords in natural language. Do NOT paste the full report. Do NOT emit <tool_call> or XML — facts are already here. If interestHits is non-empty, lead with those themes (first bullet), then other highlights. One short line: Market tab → Report / Topics.";
      return JSON.stringify(
        await withVectorSearch(
          env,
          withUserInterests(
            {
              intent: "report",
              fullTextAsk: Boolean(intent.fullText),
              keywordsOnly,
              seoulHints: hints,
              report,
              instruction: baseInstruction,
            },
            userInterests,
            { keywords: reportKw, snippets, includeHits: true },
          ),
          { userText, marketDate, lang },
        ),
        null,
        2,
      );
    }

    // brief / fullText
    const { content_lang: lang } = getSettings(agent);
    const askDate = resolveAskDate(intent, hints, userText);
    const brief = await loadBrief(agent, env, askDate);
    const fullTextAsk = intent.kind === "fullText";
    const snippets = "title" in brief ? briefSnippets(brief) : [];
    const marketDate =
      brief && "marketDate" in brief && typeof brief.marketDate === "string"
        ? brief.marketDate
        : askDate;
    return JSON.stringify(
      await withVectorSearch(
        env,
        withUserInterests(
          {
            intent: intent.kind,
            seoulHints: hints,
            brief,
            instruction: fullTextAsk
              ? "User wants the FULL brief. Do NOT paste content/excerpt into chat. Reply in 1–2 short lines pointing to Market tab → Brief / Latest (include marketDate). Tools unnecessary."
              : "Answer the user's question briefly using title/pulse/takeaway/excerpt as evidence. Do NOT paste the full brief. One short line: Market tab → Latest for the full text. Do not call getTodayMarketBrief unless a needed date is missing.",
          },
          userInterests,
          { snippets, includeHits: true },
        ),
        { userText, marketDate, lang },
      ),
      null,
      2,
    );
  } catch (error) {
    return JSON.stringify(
      {
        intent: intent.kind,
        ok: false,
        reason: "prefetch_failed",
        message: error instanceof Error ? error.message : "prefetch failed",
        instruction:
          "Say Market Memory lookup failed. Do not invent content. Suggest Market tab or retry.",
      },
      null,
      2,
    );
  }
}
