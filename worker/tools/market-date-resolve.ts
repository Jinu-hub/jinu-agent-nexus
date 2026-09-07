// Shared Market Memory date resolution for chat tools.
// LLMs often invent the wrong year (e.g. 2025) for "어제" / "9월 4일".
// Omit date / "latest" → newest market_date that has a final brief (not
// blindly Seoul yesterday — weekends/holidays often have no US-market row).

import { getLatestContentBriefMarketDate } from "../content-briefs";
import {
  isMarketDateYmd,
  marketDateYmdInTimeZone,
  shiftMarketDateYmd,
  withCurrentSeoulYear,
} from "../market-date";

export type ResolvedMarketDate = {
  /** Date passed to Supabase after resolution. */
  marketDate: string | undefined;
  /** Same MM-DD with Asia/Seoul current year — try if first query misses. */
  fallbackMarketDate?: string;
  requestedDate?: string;
  /** True when tool omitted date (or asked for latest) and we resolved it. */
  usedExpectedLatest?: boolean;
  /** True when resolution came from content_briefs max(market_date). */
  usedDataBackedLatest?: boolean;
};

export type ResolveToolMarketDateOptions = {
  lang?: string;
  now?: Date;
};

/**
 * Resolve tool `date` for Market Memory reads.
 * - omit → newest day with a final brief (fallback: Seoul yesterday)
 * - year ≠ Seoul current year → keep requested first, offer current-year fallback
 */
export async function resolveToolMarketDate(
  env: Env,
  date: string | undefined,
  options: ResolveToolMarketDateOptions = {},
): Promise<ResolvedMarketDate> {
  const now = options.now ?? new Date();
  const requested = date?.trim() || undefined;
  if (!requested) {
    return resolveDataBackedLatest(env, options.lang, now);
  }
  if (!isMarketDateYmd(requested)) {
    return { marketDate: requested, requestedDate: requested };
  }

  const today = marketDateYmdInTimeZone(now);
  const currentYear = today.slice(0, 4);
  if (requested.startsWith(`${currentYear}-`)) {
    return { marketDate: requested, requestedDate: requested };
  }

  return {
    marketDate: requested,
    requestedDate: requested,
    fallbackMarketDate: withCurrentSeoulYear(requested, now),
  };
}

async function resolveDataBackedLatest(
  env: Env,
  lang: string | undefined,
  now: Date,
): Promise<ResolvedMarketDate> {
  const { yesterday } = seoulDateHints(now);
  try {
    const latest = await getLatestContentBriefMarketDate(env, { lang });
    if (latest.marketDate) {
      return {
        marketDate: latest.marketDate,
        usedExpectedLatest: true,
        usedDataBackedLatest: true,
      };
    }
  } catch {
    // Fall through to calendar yesterday.
  }
  return {
    marketDate: yesterday,
    usedExpectedLatest: true,
    usedDataBackedLatest: false,
  };
}

/** Seoul today / yesterday strings for tool descriptions (refreshed each getTools). */
export function seoulDateHints(now: Date = new Date()): {
  today: string;
  yesterday: string;
  /**
   * Calendar heuristic only (Seoul yesterday). Runtime omit-date uses
   * getLatestContentBriefMarketDate — may be earlier after weekends.
   */
  latestHint: string;
} {
  const today = marketDateYmdInTimeZone(now);
  const yesterday = shiftMarketDateYmd(today, -1);
  return {
    today,
    yesterday,
    latestHint: yesterday,
  };
}
