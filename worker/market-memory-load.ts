// Shared Market Memory resolve → fetch → year-fallback retry.
// Used by getTodayMarket* tools and market-prefetch loaders.

import { isMarketDateYmd } from "./market-date";
import {
  resolveToolMarketDate,
  type ResolvedMarketDate,
} from "./tools/market-date-resolve";

export function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export type ResolvedMarketLoad<T> =
  | { ok: false; reason: "invalid_date"; resolved: ResolvedMarketDate }
  | {
      ok: true;
      resolved: ResolvedMarketDate;
      result: T;
      correctedFrom?: string;
    };

/**
 * Resolve tool/panel `date`, fetch once, then retry with fallbackMarketDate
 * when the first query has no item (wrong LLM year, etc.).
 */
export async function withResolvedMarketDate<T extends { item: unknown }>(
  env: Env,
  date: string | undefined,
  lang: string,
  fetchFn: (marketDate: string | undefined) => Promise<T>,
): Promise<ResolvedMarketLoad<T>> {
  const resolved = await resolveToolMarketDate(env, date, { lang });
  if (resolved.marketDate && !isMarketDateYmd(resolved.marketDate)) {
    return { ok: false, reason: "invalid_date", resolved };
  }

  let result = await fetchFn(resolved.marketDate);
  let correctedFrom: string | undefined;

  if (
    !result.item &&
    resolved.fallbackMarketDate &&
    resolved.fallbackMarketDate !== resolved.marketDate
  ) {
    const retry = await fetchFn(resolved.fallbackMarketDate);
    if (retry.item) {
      correctedFrom = resolved.marketDate;
      result = retry;
    }
  }

  return { ok: true, resolved, result, correctedFrom };
}
