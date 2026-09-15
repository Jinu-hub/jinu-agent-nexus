// ─────────────────────────────────────────────────────────────────────────
// Market Vector Cron — daily ingest into MARKET_VECTOR_DB
// ─────────────────────────────────────────────────────────────────────────
//
// Schedule: wrangler `triggers.crons` — must stay in sync with MARKET_VECTOR_CRONS.
//   00:05 UTC (= KST 09:05) — primary (5 min after voice 00:00)
//   01:05 UTC (= KST 10:05) — catch-up (5 min after voice 01:00)
// Each tick: previous UTC day × langs (default ko,en) → ingestMarketReportsForDay
// (Settings Content ON series). Empty day / lang → soft skip (no throw).
// ─────────────────────────────────────────────────────────────────────────

import { getSupabaseAccessMode, isSupabaseConfigured } from "./supabase";
import {
  ingestMarketReportsForDay,
  type IngestMarketReportsBatchResult,
} from "./market-vector";

/** Primary tick — must match wrangler.jsonc `triggers.crons`. */
export const MARKET_VECTOR_CRON = "5 0 * * *";
/** Catch-up tick — late reports that miss 00:05. */
export const MARKET_VECTOR_CRON_CATCHUP = "5 1 * * *";

export const MARKET_VECTOR_CRONS = [
  MARKET_VECTOR_CRON,
  MARKET_VECTOR_CRON_CATCHUP,
] as const;

export function isMarketVectorCron(cron: string): boolean {
  return (MARKET_VECTOR_CRONS as readonly string[]).includes(cron);
}

const DEFAULT_LANGS = ["ko", "en"] as const;

export type MarketVectorCronLangResult =
  | {
      lang: string;
      status: "ok";
      ingested: number;
      skipped: IngestMarketReportsBatchResult["skipped"];
      seriesSlugs: string[];
    }
  | {
      lang: string;
      status: "empty";
      message: string;
    }
  | {
      lang: string;
      status: "error";
      message: string;
    };

export type MarketVectorCronResult = {
  ok: true;
  cron: string;
  targetMarketDate: string;
  langs: string[];
  byLang: MarketVectorCronLangResult[];
};

export type MarketVectorCronSkip = {
  ok: false;
  reason: "supabase_not_configured" | "supabase_no_service_role";
  cron: string;
};

function previousUtcDateYmd(now: Date = new Date()): string {
  const prev = new Date(now);
  prev.setUTCDate(now.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

function resolveCronLangs(env: Env): string[] {
  const raw = env.MARKET_VECTOR_CRON_LANGS?.trim();
  if (!raw) return [...DEFAULT_LANGS];
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parsed.length === 0) return [...DEFAULT_LANGS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lang of parsed) {
    if (seen.has(lang)) continue;
    seen.add(lang);
    out.push(lang);
  }
  return out;
}

function isEmptyIngestError(message: string): boolean {
  return /no reports ingested/i.test(message);
}

/**
 * One Cron tick: ingest Settings-ON series reports for the previous UTC
 * day for each configured lang. Empty ingest is not a failure (catch-up
 * may pick late rows up later).
 */
export async function runMarketVectorCron(
  env: Env,
  cron: string = MARKET_VECTOR_CRON,
): Promise<MarketVectorCronResult | MarketVectorCronSkip> {
  if (!isSupabaseConfigured(env)) {
    return { ok: false, reason: "supabase_not_configured", cron };
  }
  if (!getSupabaseAccessMode(env, { privileged: true })) {
    return { ok: false, reason: "supabase_no_service_role", cron };
  }

  const targetMarketDate = previousUtcDateYmd();
  const langs = resolveCronLangs(env);
  const byLang: MarketVectorCronLangResult[] = [];

  for (const lang of langs) {
    try {
      const result = await ingestMarketReportsForDay(env, {
        marketDate: targetMarketDate,
        lang,
      });
      byLang.push({
        lang,
        status: "ok",
        ingested: result.ingested.length,
        skipped: result.skipped,
        seriesSlugs: result.ingested
          .map((row) => row.seriesSlug)
          .filter((slug): slug is string => Boolean(slug)),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ingest failed";
      if (isEmptyIngestError(message)) {
        byLang.push({ lang, status: "empty", message });
      } else {
        byLang.push({ lang, status: "error", message });
      }
    }
  }

  return {
    ok: true,
    cron,
    targetMarketDate,
    langs,
    byLang,
  };
}
