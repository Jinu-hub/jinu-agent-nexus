// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketBrief — Market Memory daily market-issue brief
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayContentBrief() from worker/content-briefs.ts (Phase A).
// lang_code comes from ChatAgent Settings (content_lang), not chat UI language.
// Chat answers briefly; full text lives in the Market sidebar panel.
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
  const { today, yesterday, latest } = seoulDateHints();

  return tool({
    description:
      `Fetch Market Memory brief text (content_briefs) for grounding. Use for interpret/compare/checklist questions about market briefs — not as a full reprint. Language = Settings content_lang. Dates: Asia/Seoul today=${today}, expected latest (omit date)=${latest}, yesterday=${yesterday}. Batch ~22:30 UTC so latest is usually yesterday. After the tool returns: answer the user's question briefly; do NOT paste the full content; point to Market tab Latest for the full text.`,
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe(
          `Optional market_date YYYY-MM-DD. Omit for expected latest (${latest}, Seoul yesterday). For calendar today use ${today}. For 어제 use ${yesterday}. Month/day without year → year ${today.slice(0, 4)}.`,
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
            usedExpectedLatest: resolved.usedExpectedLatest,
            message: `No final brief found for market_date=${result.marketDate} lang=${result.lang}. Do not invent content. Suggest Market tab date nav or another day.`,
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
          usedExpectedLatest: resolved.usedExpectedLatest,
          presentation:
            `Answer the user's question briefly using title/pulse/takeaway/content as evidence. Do NOT paste the full content into chat. One short line: full text is in Market tab (date ${result.marketDate}). Keep quoted snippets in lang=${result.lang}.`,
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
