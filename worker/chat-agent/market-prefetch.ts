// Server-side Market Memory prefetch for chat turns.
// GLM often reasons then ends without tool calls (hang / empty reply).
// beforeTurn injects authoritative JSON so the model can answer without tools.

import type { ChatAgent } from "./ChatAgent";
import { getSettings } from "./settings";
import { getTodayContentAudio } from "../content-audio";
import { getTodayContentBrief } from "../content-briefs";
import { isMarketDateYmd, shiftMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";
import {
  resolveToolMarketDate,
  seoulDateHints,
} from "../tools/market-date-resolve";
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
  const resolved = resolveToolMarketDate(date);
  if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
    return {
      ok: false as const,
      reason: "invalid_date",
      requestedDate: resolved.requestedDate,
    };
  }

  const { content_lang: lang } = getSettings(agent);
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
  };
}

async function loadVoice(
  agent: ChatAgent,
  env: Env,
  date: string | undefined,
) {
  const resolved = resolveToolMarketDate(date);
  if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
    return {
      ok: false as const,
      reason: "invalid_date",
      requestedDate: resolved.requestedDate,
    };
  }

  const { content_lang: lang } = getSettings(agent);
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
  };
}

function resolveAskDate(
  intent: MarketMemoryIntent,
  hints: ReturnType<typeof seoulDateHints>,
): string | undefined {
  if (intent.kind === "compare") return undefined;
  if (intent.dateHint === "today") return hints.today;
  if (intent.dateHint === "yesterday" || intent.dateHint === "latest") {
    return hints.yesterday;
  }
  // omit → tool default (expected latest = yesterday)
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
      const dayA = shiftMarketDateYmd(hints.today, -2); // 그제
      const dayB = hints.yesterday; // 어제 / expected latest
      const [a, b] = await Promise.all([
        loadBrief(agent, env, dayA),
        loadBrief(agent, env, dayB),
      ]);
      return JSON.stringify(
        {
          intent: "compare",
          seoulHints: hints,
          briefs: { dayBeforeYesterday: a, yesterday: b },
          instruction:
            "Compare tone/themes using pulse/takeaway/title (and excerpts if needed). Answer the comparison only — short. Do NOT paste full content. One line: full text in Market tab by date. Do not call getTodayMarketBrief unless a date is missing here.",
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
          ? "User wants the FULL brief. Do NOT paste content/excerpt into chat. Reply in 1–2 short lines pointing to Market tab → Latest (include marketDate). Tools unnecessary."
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
