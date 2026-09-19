// ─────────────────────────────────────────────────────────────────────────
// market-fetch — shared HTTP for home helper rail + Market panel
// ─────────────────────────────────────────────────────────────────────────
//
// In-flight (+ short TTL) promise cache so ChatHelperRail and MarketPanel
// do not double-hit /api/report-series · latest-date · day · topic-labels
// when both mount on `/`.
// ─────────────────────────────────────────────────────────────────────────

import type { ReportSeriesRow } from "../../worker/report-series";
import { calendarYesterdayYmd } from "@/lib/market-date";
import { fetchTopicLabels } from "@/lib/topic-preference";

export type MarketBriefItem = {
  id: string;
  title: string | null;
  content: string | null;
  brief_type: string;
  content_type: string;
  lang_code: string;
  status: string;
  market_date: string | null;
  target_id?: string | null;
  metadata: unknown;
};

export type MarketVoiceItem = {
  id: string;
  title: string | null;
  duration_seconds: number | null;
  lang_code: string;
  status: string;
  market_date: string | null;
};

export type MarketReportItem = {
  id: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  lang_code: string | null;
  market_date: string | null;
  report_type: string | null;
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
};

export type MarketDaySlot = {
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  seriesTabLabel: string;
  marketMemoryItemId: string;
  targetId: string;
  brief: MarketBriefItem | null;
  voice: {
    playPath: string;
    item: MarketVoiceItem;
  } | null;
  report: MarketReportItem | null;
};

type CacheEntry<T> = {
  promise: Promise<T>;
  /** Resolved value kept briefly so remounts skip a second trip. */
  value?: T;
  expiresAt?: number;
};

const TTL_MS = 30_000;
const cache = new Map<string, CacheEntry<unknown>>();

/** Bumped on invalidate so every useMarketDayData remounts its loads. */
let fetchGeneration = 0;
const generationListeners = new Set<() => void>();

export function subscribeMarketFetchGeneration(listener: () => void): () => void {
  generationListeners.add(listener);
  return () => {
    generationListeners.delete(listener);
  };
}

export function getMarketFetchGeneration(): number {
  return fetchGeneration;
}

function appendSeriesIds(qs: URLSearchParams, seriesIds: string[]): void {
  for (const id of seriesIds) qs.append("series_id", id);
}

function seriesKey(seriesIds: string[]): string {
  return [...seriesIds].sort().join(",");
}

async function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit) {
    if (hit.value !== undefined && (hit.expiresAt ?? 0) > Date.now()) {
      return hit.value;
    }
    return hit.promise;
  }
  const promise = run()
    .then((value) => {
      const entry = cache.get(key) as CacheEntry<T> | undefined;
      if (entry && entry.promise === promise) {
        entry.value = value;
        entry.expiresAt = Date.now() + TTL_MS;
      }
      return value;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, { promise });
  return promise;
}

/** Drop one key or the whole cache (Market Refresh). */
export function invalidateMarketFetch(prefix?: string): void {
  if (!prefix) {
    cache.clear();
  } else {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }
  fetchGeneration += 1;
  for (const listener of generationListeners) listener();
}

export async function fetchReportSeriesCatalog(): Promise<ReportSeriesRow[]> {
  return cached("report-series", async () => {
    const res = await fetch("/api/report-series");
    const body = (await res.json()) as {
      ok?: boolean;
      items?: ReportSeriesRow[];
    };
    if (!res.ok || !body.ok || !Array.isArray(body.items)) return [];
    return body.items;
  });
}

export async function fetchLatestMarketDate(
  lang: string,
  seriesIds: string[],
): Promise<string> {
  if (seriesIds.length === 0) return calendarYesterdayYmd();
  const key = `latest-date|${lang}|${seriesKey(seriesIds)}`;
  return cached(key, async () => {
    const qs = new URLSearchParams({ lang });
    appendSeriesIds(qs, seriesIds);
    const res = await fetch(`/api/market/latest-date?${qs}`);
    const json = (await res.json()) as {
      ok?: boolean;
      found?: boolean;
      marketDate?: string | null;
      seoulYesterday?: string;
      message?: string;
    };
    if (!res.ok && !json.ok) {
      throw new Error(json.message || `latest-date HTTP ${res.status}`);
    }
    if (json.found && typeof json.marketDate === "string") {
      return json.marketDate;
    }
    return json.seoulYesterday ?? calendarYesterdayYmd();
  });
}

export async function fetchMarketDaySlots(
  date: string,
  lang: string,
  seriesIds: string[],
): Promise<MarketDaySlot[]> {
  if (seriesIds.length === 0) return [];
  const key = `market-day|${date}|${lang}|${seriesKey(seriesIds)}`;
  return cached(key, async () => {
    const qs = new URLSearchParams({ date, lang });
    appendSeriesIds(qs, seriesIds);
    const res = await fetch(`/api/market/day?${qs}`);
    const json = (await res.json()) as {
      ok?: boolean;
      slots?: MarketDaySlot[];
      message?: string;
    };
    if (!res.ok && !json.ok) {
      throw new Error(json.message || `market/day HTTP ${res.status}`);
    }
    return json.slots ?? [];
  });
}

export async function fetchTopicLabelMap(
  lang: string,
): Promise<Record<string, string> | null> {
  const key = `topic-labels|${lang}`;
  return cached(key, async () => {
    try {
      return await fetchTopicLabels(undefined, lang);
    } catch {
      return null;
    }
  });
}
