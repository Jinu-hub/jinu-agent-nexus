// ─────────────────────────────────────────────────────────────────────────
// use-market-day-data — catalog + latest-date + day slots for home UI
// ─────────────────────────────────────────────────────────────────────────
//
// ChatHelperRail pins to Latest; MarketPanel owns a date picker but shares
// the same fetch helpers (and promise cache) so `/` does not double-load.
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
  /** When true, always load Latest (helper rail). When false, date is controlled. */
  pinToLatest = false,
}: {
  lang: string;
  enabledSeriesKey: string;
  pinToLatest?: boolean;
}): {
  latestDate: string | null;
  date: string | null;
  setDate: (next: string | null | ((prev: string | null) => string | null)) => void;
  slots: MarketDaySlot[];
  loading: boolean;
  latestLoading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  refresh: () => void;
} {
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
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

  // Panel: reset the date picker when lang / enabled series change.
  useEffect(() => {
    if (pinToLatest) return;
    setDate(null);
    setSlots([]);
  }, [lang, enabledSeriesKey, pinToLatest]);

  // Resolve Latest whenever lang / enabled series / refresh changes.
  useEffect(() => {
    if (seriesIds.length === 0) {
      setLatestDate(null);
      setLatestLoading(false);
      if (pinToLatest) {
        setDate(null);
        setSlots([]);
        setLoading(false);
      }
      return;
    }

    let active = true;
    setLatestLoading(true);

    void fetchLatestMarketDate(lang, seriesIds)
      .then((next) => {
        if (!active) return;
        setLatestDate(next);
        if (pinToLatest) {
          setDate(next);
        } else {
          setDate((prev) => prev ?? next);
        }
      })
      .catch((err) => {
        if (!active) return;
        const fallback = calendarYesterdayYmd();
        setLatestDate(fallback);
        if (pinToLatest) {
          setDate(fallback);
        } else {
          setDate((prev) => prev ?? fallback);
        }
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
  }, [lang, enabledSeriesKey, pinToLatest, fetchGeneration]);

  // Load day slots for the active date.
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
