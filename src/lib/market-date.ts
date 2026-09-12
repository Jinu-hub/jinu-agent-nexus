// ─────────────────────────────────────────────────────────────────────────
// Market date helpers (frontend) — Asia/Seoul calendar YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────
// Mirrors worker/market-date.ts for the Vite app (no Worker import in UI).

export const DEFAULT_MARKET_TIMEZONE = "Asia/Seoul";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isMarketDateYmd(value: string): boolean {
  return YMD_RE.test(value);
}

/** Calendar YYYY-MM-DD in Asia/Seoul (alias: seoulYmd). */
export function marketDateYmdInTimeZone(
  now: Date = new Date(),
  timeZone: string = DEFAULT_MARKET_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function seoulYmd(now: Date = new Date()): string {
  return marketDateYmdInTimeZone(now);
}

export function shiftMarketDateYmd(
  ymd: string,
  deltaDays: number,
  timeZone: string = DEFAULT_MARKET_TIMEZONE,
): string {
  if (!isMarketDateYmd(ymd)) {
    throw new Error(`invalid market date: ${ymd}`);
  }
  const [y, m, d] = ymd.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return marketDateYmdInTimeZone(anchor, timeZone);
}

export function shiftYmd(ymd: string, deltaDays: number): string {
  return shiftMarketDateYmd(ymd, deltaDays);
}

/** Calendar Seoul yesterday — fallback until /api/briefs/latest-date loads. */
export function calendarYesterdayYmd(now: Date = new Date()): string {
  return shiftMarketDateYmd(seoulYmd(now), -1);
}

export function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
