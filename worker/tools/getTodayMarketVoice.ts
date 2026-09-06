// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketVoice — Market Memory Voice briefing (meta + play URL)
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayContentAudio() from worker/content-audio.ts.
// Returns metadata + /api/audio/file/:id — does NOT stream MP3 bytes into chat.
// Full listening UI is the Market sidebar; chat keeps replies short.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

import type { ChatAgent } from "../chat-agent";
import { getSettings } from "../chat-agent/settings";
import { getTodayContentAudio } from "../content-audio";
import { isMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";
import {
  resolveToolMarketDate,
  seoulDateHints,
} from "./market-date-resolve";

export function createGetTodayMarketVoiceTool(agent: ChatAgent, env: Env) {
  const { today, yesterday, latest } = seoulDateHints();

  return tool({
    description:
      `Fetch Market Memory Voice meta + playPath (content_audio → R2). Use when the user asks about voice/오디오. Prefer pointing them to Market tab Latest player for listening. Omit date → expected latest ${latest} (Seoul yesterday). Calendar today=${today}. Language = Settings content_lang. Do not invent audio.`,
    inputSchema: z.object({
      date: z
        .string()
        .optional()
        .describe(
          `Optional market_date YYYY-MM-DD. Omit for expected latest (${latest}). For calendar today use ${today}. For 어제 use ${yesterday}. Month/day without year → year ${today.slice(0, 4)}.`,
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
            audioType: result.audioType,
            contentType: result.contentType,
            requestedDate: resolved.requestedDate,
            usedExpectedLatest: resolved.usedExpectedLatest,
            message: `No completed voice brief found for market_date=${result.marketDate} lang=${result.lang}. Do not invent audio. Suggest Market tab Latest or another day.`,
          };
        }

        const item = result.item;
        const playPath = `/api/audio/file/${item.id}`;
        return {
          ok: true as const,
          found: true as const,
          marketDate: result.marketDate,
          lang: result.lang,
          audioType: result.audioType,
          contentType: result.contentType,
          id: item.id,
          title: item.title,
          durationSeconds: item.duration_seconds,
          storageKey: item.storage_key,
          playPath,
          requestedDate: resolved.requestedDate,
          correctedFrom,
          usedExpectedLatest: resolved.usedExpectedLatest,
          howToPlay: `Inline player may appear in the tool card; prefer Market tab Latest for listening. Title/duration in lang=${result.lang}.`,
          presentation:
            `Reply briefly (title + duration). Prefer directing the user to Market tab for playback. Do not invent transcript.`,
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
