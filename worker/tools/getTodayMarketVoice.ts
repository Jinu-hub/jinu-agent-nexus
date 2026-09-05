// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketVoice — Market Memory Voice briefing (meta + play URL)
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayContentAudio() from worker/content-audio.ts.
// Returns metadata + /api/audio/file/:id — does NOT stream MP3 bytes into chat.
// lang_code comes from ChatAgent Settings (content_lang), not chat UI language.
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
  const { today, yesterday } = seoulDateHints();

  return tool({
    description:
      `Fetch today's market-issue Voice briefing from Market Memory (content_audio → R2). REQUIRED whenever the user asks for 보이스, voice, 음성 브리핑, listen, or play market audio — call this tool EVERY time, even if you already returned a player for the same date. Never say the user already requested it; never answer from memory alone. Returns a playPath URL for the MP3 — do not invent audio content. Language comes from Settings (content_lang: ko|en). Calendar: Asia/Seoul today=${today}, yesterday=${yesterday}. If the user omits the year (e.g. "9월 4일", "어제"), use ${today.slice(0, 4)} — never a past training-data year.`,
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
            message: `No completed voice brief found for market_date=${result.marketDate} lang=${result.lang}. Do not invent audio or reuse a previous day's player.`,
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
          howToPlay: `Open ${playPath} (same origin) to stream the MP3. Tell the user the title and duration in lang=${result.lang} without translating; they can play via that URL.`,
          presentation:
            `Title is in lang=${result.lang}. Do not translate the title.`,
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
