// Shared Market Memory date resolution for chat tools.
// LLMs often invent the wrong year (e.g. 2025) for "어제" / "9월 4일".

import {
  isMarketDateYmd,
  marketDateYmdInTimeZone,
  shiftMarketDateYmd,
  withCurrentSeoulYear,
} from "../market-date";

export type ResolvedMarketDate = {
  /** First date to query (tool arg as given, if valid). */
  marketDate: string | undefined;
  /** Same MM-DD with Asia/Seoul current year — try if first query misses. */
  fallbackMarketDate?: string;
  requestedDate?: string;
};

/**
 * Resolve tool `date` for Market Memory reads.
 * - omit → undefined (domain helper uses Seoul today)
 * - year ≠ Seoul current year → keep requested first, offer current-year fallback
 */
export function resolveToolMarketDate(
  date: string | undefined,
  now: Date = new Date(),
): ResolvedMarketDate {
  const requested = date?.trim() || undefined;
  if (!requested) {
    return { marketDate: undefined };
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
} {
  const today = marketDateYmdInTimeZone(now);
  return {
    today,
    yesterday: shiftMarketDateYmd(today, -1),
  };
}
