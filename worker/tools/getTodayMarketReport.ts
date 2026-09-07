// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketReport — Market Memory full digest (item_contents)
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayItemContent() from worker/item-contents.ts (Phase A).
// Returns title/summary/short excerpt only — full markdown stays in Market
// tab → Report. lang_code from ChatAgent Settings content_lang.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

import type { ChatAgent } from "../chat-agent";
import { getSettings } from "../chat-agent/settings";
import { getTodayItemContent } from "../item-contents";
import { isMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";
import {
  resolveToolMarketDate,
  seoulDateHints,
} from "./market-date-resolve";

/** Lead blurb for chat grounding — never the full markdown body. */
export function reportChatExcerpt(
  content: string | null,
  summary: string | null,
): string {
  const fromSummary = summary?.trim();
  if (fromSummary) return fromSummary.slice(0, 800);

  const body = (content ?? "").trim();
  if (!body) return "";
  const lead = body.split(/\n-----|\n##\s/)[0]?.trim() ?? body;
  return lead.slice(0, 800);
}

/** ### headings under ## 하이라이트 (max 5) for grounded highlight answers. */
export function reportHighlightHeadings(content: string | null): string[] {
  if (!content) return [];
  const after = content.split(/##\s*하이라이트/)[1];
  if (!after) return [];
  const section = after.split(/\n-----|\n##\s/)[0] ?? after;
  return [...section.matchAll(/^###\s+(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function createGetTodayMarketReportTool(agent: ChatAgent, env: Env) {
  const { today, yesterday, latestHint } = seoulDateHints();

  return tool({
    description:
      `Fetch Market Memory full report grounding (item_contents via brief.target_id). Use for 풀리포트 / digest / highlight questions — NOT a full reprint. Language = Settings content_lang. Dates: Asia/Seoul today=${today}, calendar yesterday=${yesterday}. Omit date → newest market_date with a final brief (often ${latestHint} on weekdays; earlier after weekends). After the tool returns: answer briefly from title/summary/excerpt/highlights; do NOT paste the full content; point to Market tab → Report.`,
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe(
          `Optional market_date YYYY-MM-DD. Omit for data-backed latest. For calendar today use ${today}. For 어제 use ${yesterday}. Month/day without year → year ${today.slice(0, 4)}.`,
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

      const { content_lang: lang } = getSettings(agent);
      const resolved = await resolveToolMarketDate(env, date, { lang });
      if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
        return {
          ok: false as const,
          reason: "invalid_date",
          message: "date must be YYYY-MM-DD",
        };
      }

      try {
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
            message: result.briefId
              ? `Brief exists but no active item_contents for market_date=${result.marketDate} lang=${result.lang}. Do not invent. Suggest Market tab Report or another day.`
              : `No brief/report for market_date=${result.marketDate} lang=${result.lang}. Do not invent content. Suggest Market tab date nav.`,
          };
        }

        const item = result.item;
        return {
          ok: true as const,
          found: true as const,
          marketDate: result.marketDate,
          lang: result.lang,
          id: item.id,
          title: item.title,
          summary: item.summary,
          excerpt: reportChatExcerpt(item.content, item.summary),
          highlights: reportHighlightHeadings(item.content),
          tags: item.tags,
          reportType: item.report_type,
          requestedDate: resolved.requestedDate,
          correctedFrom,
          usedExpectedLatest: resolved.usedExpectedLatest,
          usedDataBackedLatest: resolved.usedDataBackedLatest,
          presentation:
            `Answer the user's question briefly using title/summary/excerpt/highlights. Do NOT paste the full markdown into chat. One short line: full report is in Market tab → Report (date ${result.marketDate}). Keep quoted snippets in lang=${result.lang}.`,
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
