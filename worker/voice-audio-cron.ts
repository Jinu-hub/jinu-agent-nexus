// ─────────────────────────────────────────────────────────────────────────
// Voice Audio Cron — drain script_ready queue (Phase 6)
// ─────────────────────────────────────────────────────────────────────────
//
// Schedule: wrangler `triggers.crons` — must stay in sync with VOICE_AUDIO_CRONS.
//   00:00 UTC (= KST 09:00) — primary drain
//   01:00 UTC (= KST 10:00) — catch-up for late script_ready (often en ~00:01+)
// Each tick: list pending (with lang filter) → generateVoiceAudio per row until
// batch limit or queue empty. Zero pending → no TTS, no R2 writes.
// Both ticks use previous UTC day as targetMarketDate (same window).
// ─────────────────────────────────────────────────────────────────────────

import {
  generateVoiceAudio,
  listPendingContentAudio,
} from "./content-audio-domain";
import { getSupabaseAccessMode, isSupabaseConfigured } from "./supabase";
import {
  describeVoiceLangFilter,
  resolveVoiceLangFilter,
} from "./voice-lang-filter";

/** Primary tick — must match wrangler.jsonc `triggers.crons`. */
export const VOICE_AUDIO_CRON = "0 0 * * *";
/** Catch-up tick — late EN/etc. scripts that miss 00:00. */
export const VOICE_AUDIO_CRON_CATCHUP = "0 1 * * *";

export const VOICE_AUDIO_CRONS = [
  VOICE_AUDIO_CRON,
  VOICE_AUDIO_CRON_CATCHUP,
] as const;

export function isVoiceAudioCron(cron: string): boolean {
  return (VOICE_AUDIO_CRONS as readonly string[]).includes(cron);
}

const DEFAULT_BATCH_LIMIT = 10;

export type VoiceAudioCronItemResult =
  | { id: string; ok: true; status: string; storage_key: string | null }
  | { id: string; ok: false; reason: string };

export type VoiceAudioCronResult = {
  ok: true;
  cron: string;
  targetMarketDate: string;
  langFilter: string;
  pendingMatched: number;
  attempted: number;
  completed: number;
  failed: number;
  items: VoiceAudioCronItemResult[];
};

export type VoiceAudioCronSkip = {
  ok: false;
  reason: "supabase_not_configured" | "supabase_no_service_role";
  cron: string;
};

function parseBatchLimit(env: Env): number {
  const raw = env.AUDIO_CRON_BATCH_LIMIT?.trim();
  if (!raw) return DEFAULT_BATCH_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_LIMIT;
  return Math.min(n, 50);
}

function previousUtcDateYmd(now: Date = new Date()): string {
  const prev = new Date(now);
  prev.setUTCDate(now.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

/**
 * One Cron tick: process up to AUDIO_CRON_BATCH_LIMIT pending rows whose
 * market_date is the previous UTC day and whose lang_code passes the filter.
 * Uses generateVoiceAudio (claim + TTS + R2 + completed).
 */
export async function runVoiceAudioCron(
  env: Env,
  cron: string = VOICE_AUDIO_CRON,
): Promise<VoiceAudioCronResult | VoiceAudioCronSkip> {
  if (!isSupabaseConfigured(env)) {
    return { ok: false, reason: "supabase_not_configured", cron };
  }
  if (!getSupabaseAccessMode(env, { privileged: true })) {
    return { ok: false, reason: "supabase_no_service_role", cron };
  }

  const langFilter = resolveVoiceLangFilter(env);
  const targetMarketDate = previousUtcDateYmd();
  const pending = await listPendingContentAudio(env, {
    langFilter,
    marketDate: targetMarketDate,
  });
  const batchLimit = parseBatchLimit(env);
  const items: VoiceAudioCronItemResult[] = [];
  let completed = 0;
  let failed = 0;

  for (const row of pending) {
    if (items.length >= batchLimit) break;

    const result = await generateVoiceAudio(env, row.id);
    if (result.ok) {
      completed += 1;
      items.push({
        id: row.id,
        ok: true,
        status: result.item.status,
        storage_key: result.item.storage_key,
      });
    } else {
      failed += 1;
      const reason =
        typeof result.body.reason === "string"
          ? result.body.reason
          : typeof result.body.message === "string"
            ? result.body.message
            : "generate_failed";
      items.push({ id: row.id, ok: false, reason });
    }
  }

  return {
    ok: true,
    cron,
    targetMarketDate,
    langFilter: describeVoiceLangFilter(langFilter),
    pendingMatched: pending.length,
    attempted: items.length,
    completed,
    failed,
    items,
  };
}
