// Shared Market Memory date resolution for chat tools.
// LLMs often invent the wrong year (e.g. 2025) for "어제" / "9월 4일".
// Omit date → Seoul yesterday (same "Latest" as Market panel; daily ~22:30 UTC batch).

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
  /** True when tool omitted date and we defaulted to Seoul yesterday. */
  usedExpectedLatest?: boolean;
};

/**
 * Resolve tool `date` for Market Memory reads.
 * - omit → Seoul yesterday (expected latest / Market panel Latest)
 * - year ≠ Seoul current year → keep requested first, offer current-year fallback
 */
export function resolveToolMarketDate(
  date: string | undefined,
  now: Date = new Date(),
): ResolvedMarketDate {
  const requested = date?.trim() || undefined;
  if (!requested) {
    const { yesterday } = seoulDateHints(now);
    return {
      marketDate: yesterday,
      usedExpectedLatest: true,
    };
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

/** Seoul today / yesterday strings for tool descriptions (refreshed each getTools). */
export function seoulDateHints(now: Date = new Date()): {
  today: string;
  yesterday: string;
  /** Alias: expected newest market_date after ~22:30 UTC batch. */
  latest: string;
} {
  const today = marketDateYmdInTimeZone(now);
  const yesterday = shiftMarketDateYmd(today, -1);
  return {
    today,
    yesterday,
    latest: yesterday,
  };
}
