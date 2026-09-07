// Server-side Market Memory prefetch for chat turns.
// GLM often reasons then ends without tool calls (hang / empty reply).
// beforeTurn injects authoritative JSON so the model can answer without tools.

import type { ChatAgent } from "./ChatAgent";
import { getSettings } from "./settings";
import { getTodayContentAudio } from "../content-audio";
import { getTodayContentBrief } from "../content-briefs";
import { getTodayItemContent } from "../item-contents";
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
import {
  detectMarketMemoryIntent,
  type MarketMemoryIntent,
} from "./market-intent";

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

async function loadBrief(
  agent: ChatAgent,
  env: Env,
  date: string | undefined,
) {
  const { content_lang: lang } = getSettings(agent);
  const resolved = await resolveToolMarketDate(env, date, { lang });
  if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
    return {
      ok: false as const,
      reason: "invalid_date",
      requestedDate: resolved.requestedDate,
    };
  }

  let result = await getTodayContentBrief(env, {
    marketDate: resolved.marketDate,
    lang,
  });
  let correctedFrom: string | undefined;

  if (
    !result.item &&
    resolved.fallbackMarketDate &&
    resolved.fallbackMarketDate !== resolved.marketDate
  ) {
    const retry = await getTodayContentBrief(env, {
      marketDate: resolved.fallbackMarketDate,
      lang,
    });
    if (retry.item) {
      correctedFrom = resolved.marketDate;
      result = retry;
    }
  }

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
  const resolved = await resolveToolMarketDate(env, date, { lang });
  if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
    return {
      ok: false as const,
      reason: "invalid_date",
      requestedDate: resolved.requestedDate,
    };
  }

  let result = await getTodayContentAudio(env, {
    marketDate: resolved.marketDate,
    lang,
  });
  let correctedFrom: string | undefined;

  if (
    !result.item &&
    resolved.fallbackMarketDate &&
    resolved.fallbackMarketDate !== resolved.marketDate
  ) {
    const retry = await getTodayContentAudio(env, {
      marketDate: resolved.fallbackMarketDate,
      lang,
    });
    if (retry.item) {
      correctedFrom = resolved.marketDate;
      result = retry;
    }
  }

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
  const resolved = await resolveToolMarketDate(env, date, { lang });
  if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
    return {
      ok: false as const,
      reason: "invalid_date",
      requestedDate: resolved.requestedDate,
    };
  }

  let result = await getTodayItemContent(env, {
    marketDate: resolved.marketDate,
    lang,
  });
  let correctedFrom: string | undefined;

  if (
    !result.item &&
    resolved.fallbackMarketDate &&
    resolved.fallbackMarketDate !== resolved.marketDate
  ) {
    const retry = await getTodayItemContent(env, {
      marketDate: resolved.fallbackMarketDate,
      lang,
    });
    if (retry.item) {
      correctedFrom = resolved.marketDate;
      result = retry;
    }
  }

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
): string | undefined {
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

  try {
    if (intent.kind === "voice") {
      const voice = await loadVoice(agent, env, resolveAskDate(intent, hints));
      return JSON.stringify(
        {
          intent: "voice",
          seoulHints: hints,
          voice,
          instruction:
            "Reply briefly with title/duration if found. Direct the user to Market tab → Latest to listen. Do not invent a transcript. Do not call getTodayMarketVoice unless this block is missing the needed date.",
        },
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
      return JSON.stringify(
        {
          intent: "compare",
          seoulHints: hints,
          briefs: { earlier: a, later: b },
          instruction:
            "Compare tone/themes using pulse/takeaway/title (and excerpts if needed). Answer the comparison only — short natural language. Do NOT paste full content. Do NOT emit <tool_call> or XML tool markup — facts are already here. One line: full text in Market tab by date. later ≈ data-backed latest (not blindly calendar yesterday).",
        },
        null,
        2,
      );
    }

    if (intent.kind === "reportVsBrief") {
      const askDate = resolveAskDate(intent, hints);
      const [brief, report] = await Promise.all([
        loadBrief(agent, env, askDate),
        loadReport(agent, env, askDate),
      ]);
      return JSON.stringify(
        {
          intent: "reportVsBrief",
          seoulHints: hints,
          brief,
          report,
          instruction:
            "Same-day Brief vs Report — content only, not format. Product fact: Brief is usually distilled FROM Report highlights (pulse/takeaway ≈ highlight themes), so do NOT say 'Brief is short / Report is long' or 'Brief compresses, Report expands' — that is empty. Instead: (1) name 1–2 themes both share; (2) name what Report adds beyond Brief (e.g. 주요/추가 항목, extra companies/events, 마무리, 용어) using summary/excerpt/highlights vs brief pulse/takeaway/excerpt; (3) if they largely align, say so in one line. Short natural language. No full markdown dump. No <tool_call>/XML. One line: details in Market tab → Brief / Report.",
        },
        null,
        2,
      );
    }

    if (intent.kind === "report") {
      const report = await loadReport(
        agent,
        env,
        resolveAskDate(intent, hints),
      );
      const keywordsOnly = Boolean(intent.keywordsOnly);
      return JSON.stringify(
        {
          intent: "report",
          fullTextAsk: Boolean(intent.fullText),
          keywordsOnly,
          seoulHints: hints,
          report,
          instruction: intent.fullText
            ? "User wants the FULL report. Do NOT paste content/excerpt into chat. Do NOT emit <tool_call> or XML. Reply in 1–2 short lines pointing to Market tab → Report (include marketDate)."
            : keywordsOnly
              ? "User wants KEYWORDS only. Answer from report.keywords (tags, places, companies, institutions, technologies, industries, products) — short bullet or comma list. Do NOT invent names missing from keywords. Do NOT paste excerpt/full report. Do NOT emit <tool_call>/XML. One short line: more detail in Market tab → Topics."
              : "Answer briefly using title/summary/excerpt/highlights/keywords in natural language. Do NOT paste the full report. Do NOT emit <tool_call> or XML — facts are already here. One short line: Market tab → Report / Topics.",
        },
        null,
        2,
      );
    }

    // brief / fullText
    const brief = await loadBrief(agent, env, resolveAskDate(intent, hints));
    const fullTextAsk = intent.kind === "fullText";
    return JSON.stringify(
      {
        intent: intent.kind,
        seoulHints: hints,
        brief,
        instruction: fullTextAsk
          ? "User wants the FULL brief. Do NOT paste content/excerpt into chat. Reply in 1–2 short lines pointing to Market tab → Brief / Latest (include marketDate). Tools unnecessary."
          : "Answer the user's question briefly using title/pulse/takeaway/excerpt as evidence. Do NOT paste the full brief. One short line: Market tab → Latest for the full text. Do not call getTodayMarketBrief unless a needed date is missing.",
      },
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
