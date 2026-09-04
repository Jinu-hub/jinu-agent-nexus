// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketBrief — Market Memory daily market-issue brief
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayContentBrief() from worker/content-briefs.ts (Phase A).
// Do not duplicate Supabase select logic here.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

import { getTodayContentBrief } from "../content-briefs";
import { isMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function createGetTodayMarketBriefTool(env: Env) {
  return tool({
    description:
      "Fetch today's market-issue briefing text from Market Memory (content_briefs). Use when the user asks for today's market briefing, market issues, 오늘의 마켓 브리핑, 마켓 이슈, Today in 30 Seconds, or similar. Prefer this over guessing. Optional date overrides Seoul calendar today.",
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe(
          "Optional market_date YYYY-MM-DD. Omit for Asia/Seoul today. Use when the user names a specific day.",
        ),
      lang: z
        .string()
        .optional()
        .describe("Language code. Default ko. Examples: ko, en, ja."),
    }),
    execute: async ({ date, lang }) => {
      if (!isSupabaseConfigured(env)) {
        return {
          ok: false as const,
          reason: "supabase_not_configured",
          message:
            "Supabase is not configured. Set SUPABASE_URL and a key in .dev.vars.",
        };
      }

      const dateTrimmed = date?.trim();
      if (dateTrimmed && !isMarketDateYmd(dateTrimmed)) {
        return {
          ok: false as const,
          reason: "invalid_date",
          message: "date must be YYYY-MM-DD",
        };
      }

      try {
        const result = await getTodayContentBrief(env, {
          marketDate: dateTrimmed || undefined,
          lang: lang?.trim() || undefined,
        });

        if (!result.item) {
          return {
            ok: true as const,
            found: false as const,
            marketDate: result.marketDate,
            lang: result.lang,
            briefType: result.briefType,
            contentType: result.contentType,
            message: `No final brief found for market_date=${result.marketDate} lang=${result.lang}.`,
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
