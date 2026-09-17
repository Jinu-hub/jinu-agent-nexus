// ─────────────────────────────────────────────────────────────────────────
// Market date helpers — calendar day in a product timezone
// ─────────────────────────────────────────────────────────────────────────
//
// Market Memory rows key off `market_date` (YYYY-MM-DD). "Today" for
// briefs / issues is the Seoul calendar day unless a caller overrides.
// Voice Cron may use a different rule (e.g. previous UTC day) — keep
// those call sites explicit; do not silently reuse this helper there.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_MARKET_TIMEZONE = "Asia/Seoul";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` looks like YYYY-MM-DD. */
export function isMarketDateYmd(value: string): boolean {
  return YMD_RE.test(value);
}

/**
 * Calendar YYYY-MM-DD in `timeZone` for `now`.
 * Uses `en-CA` so the formatted string is already `YYYY-MM-DD`.
 */
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

/**
 * Shift a calendar YYYY-MM-DD by `deltaDays` in the given timezone.
 * Implemented via UTC noon anchor so DST edges don't flip the day.
 */
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

/** Replace YYYY with Asia/Seoul's current calendar year; keep MM-DD. */
export function withCurrentSeoulYear(
  ymd: string,
  now: Date = new Date(),
): string {
  if (!isMarketDateYmd(ymd)) {
    throw new Error(`invalid market date: ${ymd}`);
  }
  const currentYear = marketDateYmdInTimeZone(now).slice(0, 4);
  return `${currentYear}-${ymd.slice(5)}`;
}
