// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketBrief — Market Memory daily market-issue brief
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayContentBrief() from worker/content-briefs.ts (Phase A).
// lang_code comes from ChatAgent Settings (content_lang), not chat UI language.
// Do not duplicate Supabase select logic here.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

import type { ChatAgent } from "../chat-agent";
import { getSettings } from "../chat-agent/settings";
import { getTodayContentBrief } from "../content-briefs";
import { isMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";
import {
  resolveToolMarketDate,
  seoulDateHints,
} from "./market-date-resolve";

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function createGetTodayMarketBriefTool(agent: ChatAgent, env: Env) {
  const { today, yesterday } = seoulDateHints();

  return tool({
    description:
      `Fetch today's market-issue briefing text from Market Memory (content_briefs). REQUIRED whenever the user asks for 브리핑 / briefing / 마켓 이슈 (text) — call EVERY time, even if shown earlier; never say already requested. Do NOT use this for 보이스/voice (use getTodayMarketVoice). Language from Settings content_lang — present title/content VERBATIM. Calendar: Asia/Seoul today=${today}, yesterday=${yesterday}. If the user omits the year (e.g. "9월 4일", "어제"), use ${today.slice(0, 4)} — never a past training-data year.`,
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe(
          `Optional market_date YYYY-MM-DD. Omit for Seoul today (${today}). For 어제/yesterday use ${yesterday}. Month/day without year → year ${today.slice(0, 4)}.`,
        ),
    }),
    execute: async ({ date }) => {
      if (!isSupabaseConfigured(env)) {
        return {
          ok: false as const,
          reason: "supabase_not_configured",
          message:
            "Supabase is not configured. Set SUPABASE_URL and a key in .dev.vars.",
        };
      }

      const resolved = resolveToolMarketDate(date);
      if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
        return {
          ok: false as const,
          reason: "invalid_date",
          message: "date must be YYYY-MM-DD",
        };
      }

      const { content_lang: lang } = getSettings(agent);

      try {
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
            briefType: result.briefType,
            contentType: result.contentType,
            requestedDate: resolved.requestedDate,
            message: `No final brief found for market_date=${result.marketDate} lang=${result.lang}. Do not invent content.`,
          };
        }

        const item = result.item;
        return {
          ok: true as const,
          found: true as const,
          marketDate: result.marketDate,
          lang: result.lang,
          briefType: result.briefType,
          contentType: result.contentType,
          id: item.id,
          title: item.title,
          content: item.content,
          pulse: metaString(item.metadata, "pulse"),
          takeaway: metaString(item.metadata, "takeaway"),
          requestedDate: resolved.requestedDate,
          correctedFrom,
          presentation:
            `Present title and content VERBATIM in lang=${result.lang}. Do not translate.`,
        };
      } catch (error) {
        return {
          ok: false as const,
          reason: "query_failed",
          message: error instanceof Error ? error.message : "query failed",
        };
      }
    },
  });
}
