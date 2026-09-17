// Resolve item_contents for Market Memory via market_memory_items (no brief).

import { getItemContentById, type ItemContentRow } from "./item-contents";
import { getChatAgentSettings } from "./market-settings";
import { isMarketDateYmd, marketDateYmdInTimeZone } from "./lib/market-date";
import {
  enabledReportSeriesRows,
  listReportSeries,
  type ReportSeriesRow,
} from "./report-series";
import { createSupabaseClient } from "./supabase";

const MARKET_MEMORY_ITEMS_TABLE = "market_memory_items";

type MarketMemoryItemRow = {
  id: string;
  series_id: string;
  current_content_id: string;
};

export type ResolvedMarketReport = {
  seriesId: string;
  seriesSlug: string;
  marketMemoryItemId: string;
  item: ItemContentRow;
  marketDate: string;
  lang: string;
};

export type ResolveEnabledSeriesOptions = {
  /** Explicit series uuid list — skips settings. */
  seriesIds?: string[];
  /** Opt-out slugs; default from ChatAgent settings when omitted. */
  disabledReportSeries?: string[];
  /** When true and seriesIds empty, read disabled_report_series from DO. */
  useChatSettings?: boolean;
};

/** Enabled catalog series ids (Settings Content toggles). */
export async function resolveEnabledSeriesIds(
  env: Env,
  options: ResolveEnabledSeriesOptions = {},
): Promise<string[]> {
  const explicit = (options.seriesIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }

  let disabled = options.disabledReportSeries;
  if (disabled === undefined && options.useChatSettings !== false) {
    try {
      const settings = await getChatAgentSettings(env);
      disabled = settings.disabled_report_series;
    } catch {
      disabled = [];
    }
  }

  const catalog = await listReportSeries(env);
  return enabledReportSeriesRows(catalog, disabled ?? []).map((row) => row.id);
}

export type ListReportsForDayOptions = {
  marketDate?: string;
  lang?: string;
  seriesIds: string[];
};

/**
 * One row per matching market_memory_items (series + date) with loadable report body.
 */
export async function listReportsForMarketDay(
  env: Env,
  options: ListReportsForDayOptions,
): Promise<ResolvedMarketReport[]> {
  const marketDate =
    options.marketDate?.trim() || marketDateYmdInTimeZone();
  if (!isMarketDateYmd(marketDate)) {
    throw new Error("marketDate must be YYYY-MM-DD");
  }
  const lang = (options.lang?.trim() || "ko").toLowerCase();
  const seriesIds = [...new Set(options.seriesIds.map((id) => id.trim()))].filter(
    Boolean,
  );
  if (seriesIds.length === 0) return [];

  const client = createSupabaseClient(env, { privileged: true });
  const catalog = await listReportSeries(env);
  const seriesById = new Map<string, ReportSeriesRow>();
  for (const row of catalog) {
    if (seriesIds.includes(row.id)) seriesById.set(row.id, row);
  }

  const { data: rows, error } = await client
    .from(MARKET_MEMORY_ITEMS_TABLE)
    .select("id, series_id, current_content_id")
    .eq("market_date", marketDate)
    .eq("status", "done")
    .in("series_id", seriesIds)
    .not("current_content_id", "is", null);

  if (error) {
    throw new Error(`market_memory_items query failed: ${error.message}`);
  }

  const mmis = (rows ?? []) as MarketMemoryItemRow[];
  mmis.sort((a, b) => {
    const sa = seriesById.get(a.series_id);
    const sb = seriesById.get(b.series_id);
    const orderDiff =
      (sa?.display_order ?? 999) - (sb?.display_order ?? 999);
    if (orderDiff !== 0) return orderDiff;
    return (sa?.slug ?? "").localeCompare(sb?.slug ?? "");
  });

  const out: ResolvedMarketReport[] = [];

  for (const row of mmis) {
    const series = seriesById.get(row.series_id);
    if (!series) continue;
    const targetId = row.current_content_id.trim();
    if (!targetId) continue;

    const item = await getItemContentById(env, targetId, lang);
    if (!item?.content?.trim()) continue;

    const itemDate = item.market_date?.trim();
    const resolvedDate =
      itemDate && isMarketDateYmd(itemDate) ? itemDate : marketDate;

    out.push({
      seriesId: row.series_id,
      seriesSlug: series.slug,
      marketMemoryItemId: row.id,
      item,
      marketDate: resolvedDate,
      lang,
    });
  }

  return out;
}

/** Single report: item_id or series_id + date, else first enabled slot for the day. */
export async function resolveOneReportForIngest(
  env: Env,
  options: {
    marketDate?: string;
    lang?: string;
    itemId?: string;
    seriesId?: string;
    seriesIds?: string[];
    disabledReportSeries?: string[];
  },
): Promise<ResolvedMarketReport> {
  const lang = (options.lang?.trim() || "ko").toLowerCase();

  if (options.itemId?.trim()) {
    const item = await getItemContentById(env, options.itemId.trim(), lang);
    if (!item?.content?.trim()) {
      throw new Error(`item_contents not found: ${options.itemId.trim()}`);
    }
    const marketDate =
      item.market_date?.trim() && isMarketDateYmd(item.market_date)
        ? item.market_date
        : options.marketDate?.trim() || marketDateYmdInTimeZone();
    return {
      seriesId: "",
      seriesSlug: "",
      marketMemoryItemId: "",
      item,
      marketDate,
      lang,
    };
  }

  const marketDate =
    options.marketDate?.trim() || marketDateYmdInTimeZone();

  if (options.seriesId?.trim()) {
    const reports = await listReportsForMarketDay(env, {
      marketDate,
      lang,
      seriesIds: [options.seriesId.trim()],
    });
    const hit = reports[0];
    if (!hit) {
      throw new Error(
        `no item_contents for series_id=${options.seriesId.trim()} market_date=${marketDate} lang=${lang}`,
      );
    }
    return hit;
  }

  const seriesIds =
    options.seriesIds ??
    (await resolveEnabledSeriesIds(env, {
      disabledReportSeries: options.disabledReportSeries,
      useChatSettings: true,
    }));

  const reports = await listReportsForMarketDay(env, {
    marketDate,
    lang,
    seriesIds,
  });
  if (reports.length === 0) {
    throw new Error(
      `no item_contents for market_date=${marketDate} lang=${lang} (enabled series: ${seriesIds.length})`,
    );
  }
  return reports[0];
}
