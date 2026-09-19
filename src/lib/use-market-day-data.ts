// ─────────────────────────────────────────────────────────────────────────
// use-market-day-data — catalog + latest-date + day slots for home UI
// ─────────────────────────────────────────────────────────────────────────
//
// ChatHelperRail and MarketPanel share fetch helpers (promise cache) and a
// module browse-date store so the Ask rail follows the Market date picker
// (and series focus via settings.market_focus_series_id).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  enabledReportSeriesRows,
  type ReportSeriesRow,
} from "../../worker/report-series";
import { calendarYesterdayYmd } from "@/lib/market-date";
import {
  fetchLatestMarketDate,
  fetchMarketDaySlots,
  fetchReportSeriesCatalog,
  fetchTopicLabelMap,
  getMarketFetchGeneration,
  invalidateMarketFetch,
  subscribeMarketFetchGeneration,
  type MarketDaySlot,
} from "@/lib/market-fetch";

type DateUpdater =
  | string
  | null
  | ((prev: string | null) => string | null);

/** Home Ask + Market browse the same calendar day. */
let sharedBrowseDate: string | null = null;
const browseDateListeners = new Set<() => void>();

function subscribeBrowseDate(listener: () => void): () => void {
  browseDateListeners.add(listener);
  return () => {
    browseDateListeners.delete(listener);
  };
}

function getBrowseDate(): string | null {
  return sharedBrowseDate;
}

function setBrowseDate(next: DateUpdater): void {
  const resolved = typeof next === "function" ? next(sharedBrowseDate) : next;
  if (resolved === sharedBrowseDate) return;
  sharedBrowseDate = resolved;
  for (const listener of browseDateListeners) listener();
}

export function useReportSeriesCatalog(disabledReportSeries: string[]): {
  catalog: ReportSeriesRow[];
  enabledSeriesIds: string[];
  enabledSeriesKey: string;
} {
  const [catalog, setCatalog] = useState<ReportSeriesRow[]>([]);

  useEffect(() => {
    let active = true;
    void fetchReportSeriesCatalog()
      .then((items) => {
        if (active) setCatalog(items);
      })
      .catch(() => {
        if (active) setCatalog([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const enabledSeriesIds = useMemo(
    () =>
      enabledReportSeriesRows(catalog, disabledReportSeries).map((row) => row.id),
    [catalog, disabledReportSeries],
  );

  return {
    catalog,
    enabledSeriesIds,
    enabledSeriesKey: enabledSeriesIds.join(","),
  };
}

export function useMarketDayData({
  lang,
  enabledSeriesKey,
}: {
  lang: string;
  enabledSeriesKey: string;
}): {
  latestDate: string | null;
  date: string | null;
  setDate: (next: DateUpdater) => void;
  slots: MarketDaySlot[];
  loading: boolean;
  latestLoading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  refresh: () => void;
} {
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const date = useSyncExternalStore(
    subscribeBrowseDate,
    getBrowseDate,
    getBrowseDate,
  );
  const setDate = useCallback((next: DateUpdater) => {
    setBrowseDate(next);
  }, []);
  const [slots, setSlots] = useState<MarketDaySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [latestLoading, setLatestLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGeneration = useSyncExternalStore(
    subscribeMarketFetchGeneration,
    getMarketFetchGeneration,
    getMarketFetchGeneration,
  );

  const seriesIds = useMemo(
    () => (enabledSeriesKey ? enabledSeriesKey.split(",").filter(Boolean) : []),
    [enabledSeriesKey],
  );

  // Reset browse date when lang / enabled series change.
  useEffect(() => {
    setBrowseDate(null);
    setSlots([]);
  }, [lang, enabledSeriesKey]);

  // Resolve Latest whenever lang / enabled series / refresh changes.
  useEffect(() => {
    if (seriesIds.length === 0) {
      setLatestDate(null);
      setLatestLoading(false);
      setBrowseDate(null);
      setSlots([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLatestLoading(true);

    void fetchLatestMarketDate(lang, seriesIds)
      .then((next) => {
        if (!active) return;
        setLatestDate(next);
        setBrowseDate((prev) => prev ?? next);
      })
      .catch((err) => {
        if (!active) return;
        const fallback = calendarYesterdayYmd();
        setLatestDate(fallback);
        setBrowseDate((prev) => prev ?? fallback);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to resolve latest market_date",
        );
      })
      .finally(() => {
        if (active) setLatestLoading(false);
      });

    return () => {
      active = false;
    };
    // seriesIds identity via enabledSeriesKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, enabledSeriesKey, fetchGeneration]);

  // Load day slots for the shared browse date.
  useEffect(() => {
    if (!date || seriesIds.length === 0) {
      if (!date) setSlots([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void fetchMarketDaySlots(date, lang, seriesIds)
      .then((next) => {
        if (!active) return;
        setSlots(next);
      })
      .catch((err) => {
        if (!active) return;
        setSlots([]);
        setError(
          err instanceof Error ? err.message : "Failed to load Market Memory",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, lang, enabledSeriesKey, fetchGeneration]);

  const refresh = useCallback(() => {
    invalidateMarketFetch();
  }, []);

  return {
    latestDate,
    date,
    setDate,
    slots,
    loading,
    latestLoading,
    error,
    setError,
    refresh,
  };
}

export function useTopicLabelMap(
  lang: string,
  enabled: boolean,
): Record<string, string> | null {
  const [map, setMap] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMap(null);
      return;
    }
    let active = true;
    void fetchTopicLabelMap(lang).then((next) => {
      if (active) setMap(next);
    });
    return () => {
      active = false;
    };
  }, [lang, enabled]);

  return map;
}
