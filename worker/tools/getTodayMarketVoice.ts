// ─────────────────────────────────────────────────────────────────────────
// Tool: getTodayMarketVoice — Market Memory Voice briefing (meta + play URL)
//
// PATTERN: SERVER-SIDE TOOL WITH ENV + SHARED DOMAIN QUERY
// ─────────────────────────────────────────────────────────────────────────
// Reuses getTodayContentAudio() from worker/content-audio.ts.
// Returns metadata + /api/audio/file/:id — does NOT stream MP3 bytes into chat.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

import { getTodayContentAudio } from "../content-audio";
import { isMarketDateYmd } from "../market-date";
import { isSupabaseConfigured } from "../supabase";

export function createGetTodayMarketVoiceTool(env: Env) {
  return tool({
    description:
      "Fetch today's market-issue Voice briefing from Market Memory (content_audio → R2). Use when the user asks for voice briefing, 보이스 브리핑, 음성 브리핑, listen to today's brief, play market audio, or similar. Returns a playPath URL for the MP3 — do not invent audio content. Optional date overrides Seoul calendar today.",
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
        const result = await getTodayContentAudio(env, {
          marketDate: dateTrimmed || undefined,
          lang: lang?.trim() || undefined,
        });

        if (!result.item) {
          return {
            ok: true as const,
            found: false as const,
            marketDate: result.marketDate,
            lang: result.lang,
            audioType: result.audioType,
            contentType: result.contentType,
            message: `No completed voice brief found for market_date=${result.marketDate} lang=${result.lang}.`,
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
          howToPlay: `Open ${playPath} (same origin) to stream the MP3. Tell the user the title and duration; they can play via that URL.`,
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
