// ─────────────────────────────────────────────────────────────────────────
// Market day — enabled report_series slots for one market_date
// ─────────────────────────────────────────────────────────────────────────
//
// Resolves content via market_memory_items (series_id + current_content_id
// → item_contents). Brief / voice match brief.target_id / audio.target_id.
// ─────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_BRIEF_LANG,
  DEFAULT_BRIEF_STATUS,
  DEFAULT_BRIEF_TYPE,
  type ContentBriefRow,
} from "./content-briefs";
import {
  COMPLETED_AUDIO_STATUS,
  DEFAULT_VOICE_AUDIO_TYPE,
  type ContentAudioRow,
} from "./content-audio-domain";
import { listReportSeries, type ReportSeriesRow } from "./report-series";
import {
  getItemContentById,
  type ItemContentRow,
} from "./item-contents";
import {
  parseSeriesIdsFromUrl,
  reportSeriesDisplayTitle,
  reportSeriesTabLabel,
} from "./report-series";
import {
  createSupabaseClient,
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";
import {
  isMarketDateYmd,
  marketDateYmdInTimeZone,
  shiftMarketDateYmd,
} from "./lib/market-date";

const MARKET_MEMORY_ITEMS_TABLE = "market_memory_items";

const CONTENT_BRIEFS_SELECT =
  "id, target_type, target_id, content_type, brief_type, lang_code, title, content, status, market_date, model_info, metadata, created_at, updated_at";

const CONTENT_AUDIO_SELECT =
  "id, target_type, target_id, content_type, audio_type, lang_code, title, script, duration_seconds, storage_provider, storage_key, status, market_date, model_info, metadata, created_at, updated_at";

type MarketMemoryItemRow = {
  id: string;
  series_id: string;
  current_content_id: string;
};

export type MarketDayVoiceSlot = {
  playPath: string;
  item: Omit<ContentAudioRow, "script">;
};

export type MarketDaySlot = {
  seriesId: string;
  seriesSlug: string;
  /** Full title — tooltips, a11y. */
  seriesTitle: string;
  /** Short tab label in Market panel. */
  seriesTabLabel: string;
  marketMemoryItemId: string;
  targetId: string;
  brief: ContentBriefRow | null;
  voice: MarketDayVoiceSlot | null;
  report: ItemContentRow | null;
};

export type MarketDayResult = {
  marketDate: string;
  lang: string;
  slots: MarketDaySlot[];
};

export type LatestMarketDayDateResult = {
  lang: string;
  marketDate: string | null;
  calendarToday: string;
  seoulYesterday: string;
};

export async function getMarketDaySlots(
  env: Env,
  options: {
    marketDate?: string;
    lang?: string;
    seriesIds: string[];
  },
): Promise<MarketDayResult> {
  const marketDate =
    options.marketDate?.trim() || marketDateYmdInTimeZone();
  const lang = options.lang?.trim() || DEFAULT_BRIEF_LANG;
  const seriesIds = [...new Set(options.seriesIds.map((id) => id.trim()))].filter(
    Boolean,
  );

  if (seriesIds.length === 0) {
    return { marketDate, lang, slots: [] };
  }

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

  const slots: MarketDaySlot[] = [];

  for (const row of mmis) {
    const targetId = row.current_content_id.trim();
    if (!targetId) continue;

    const series = seriesById.get(row.series_id);
    if (!series) continue;

    const report = await getItemContentById(env, targetId, lang);

    const { data: briefData } = await client
      .from("content_briefs")
      .select(CONTENT_BRIEFS_SELECT)
      .eq("target_id", targetId)
      .eq("market_date", marketDate)
      .eq("lang_code", lang)
      .eq("brief_type", DEFAULT_BRIEF_TYPE)
      .eq("status", DEFAULT_BRIEF_STATUS)
      .not("content", "is", null)
      .neq("content", "")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .overrideTypes<ContentBriefRow, { merge: false }>();

    const { data: audioData } = await client
      .from("content_audio")
      .select(CONTENT_AUDIO_SELECT)
      .eq("target_id", targetId)
      .eq("market_date", marketDate)
      .eq("lang_code", lang)
      .eq("audio_type", DEFAULT_VOICE_AUDIO_TYPE)
      .eq("status", COMPLETED_AUDIO_STATUS)
      .not("storage_key", "is", null)
      .neq("storage_key", "")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .overrideTypes<ContentAudioRow, { merge: false }>();

    const voiceRow = audioData ?? null;
    const voice: MarketDayVoiceSlot | null = voiceRow
      ? {
          playPath: `/api/audio/file/${voiceRow.id}`,
          item: stripAudioScript(voiceRow),
        }
      : null;

    slots.push({
      seriesId: row.series_id,
      seriesSlug: series.slug,
      seriesTitle: reportSeriesDisplayTitle(series),
      seriesTabLabel: reportSeriesTabLabel(series),
      marketMemoryItemId: row.id,
      targetId,
      brief: briefData ?? null,
      voice,
      report,
    });
  }

  return { marketDate, lang, slots };
}

export async function getLatestMarketDayDate(
  env: Env,
  options: { lang?: string; seriesIds: string[] },
): Promise<LatestMarketDayDateResult> {
  const lang = options.lang?.trim() || DEFAULT_BRIEF_LANG;
  const seriesIds = [...new Set(options.seriesIds.map((id) => id.trim()))].filter(
    Boolean,
  );
  const calendarToday = marketDateYmdInTimeZone();
  const seoulYesterday = shiftMarketDateYmd(calendarToday, -1);

  if (seriesIds.length === 0) {
    return {
      lang,
      marketDate: null,
      calendarToday,
      seoulYesterday,
    };
  }

  const client = createSupabaseClient(env, { privileged: true });

  const { data, error } = await client
    .from(MARKET_MEMORY_ITEMS_TABLE)
    .select("market_date")
    .eq("status", "done")
    .in("series_id", seriesIds)
    .not("current_content_id", "is", null)
    .not("market_date", "is", null)
    .order("market_date", { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<{ market_date: string }, { merge: false }>();

  if (error) {
    throw new Error(`latest market_date query failed: ${error.message}`);
  }

  return {
    lang,
    marketDate: data?.market_date ?? null,
    calendarToday,
    seoulYesterday,
  };
}

function stripAudioScript(row: ContentAudioRow): Omit<ContentAudioRow, "script"> {
  const { script: _script, ...rest } = row;
  return rest;
}

export async function handleMarketDayRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/api/market/day" &&
    url.pathname !== "/api/market/latest-date"
  ) {
    return null;
  }

  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const blocked = supabaseServiceRoleGuard(env);
  if (blocked) return blocked;

  const seriesIds = parseSeriesIdsFromUrl(url);

  if (url.pathname === "/api/market/latest-date") {
    try {
      const result = await getLatestMarketDayDate(env, {
        lang: url.searchParams.get("lang") ?? undefined,
        seriesIds,
      });
      return Response.json({
        ok: true,
        found: result.marketDate !== null,
        marketDate: result.marketDate,
        lang: result.lang,
        calendarToday: result.calendarToday,
        seoulYesterday: result.seoulYesterday,
      });
    } catch (error) {
      return queryFailed(error);
    }
  }

  const dateParam = url.searchParams.get("date")?.trim() || undefined;
  if (dateParam && !isMarketDateYmd(dateParam)) {
    return Response.json(
      { ok: false, message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  if (seriesIds.length === 0) {
    return Response.json(
      {
        ok: false,
        message: "pass at least one series_id (enabled Market Content)",
      },
      { status: 400 },
    );
  }

  try {
    const result = await getMarketDaySlots(env, {
      marketDate: dateParam,
      lang: url.searchParams.get("lang") ?? undefined,
      seriesIds,
    });
    return Response.json({
      ok: true,
      marketDate: result.marketDate,
      lang: result.lang,
      count: result.slots.length,
      slots: result.slots,
    });
  } catch (error) {
    return queryFailed(error);
  }
}

function queryFailed(error: unknown): Response {
  return Response.json(
    {
      ok: false,
      message: error instanceof Error ? error.message : "query failed",
    },
    { status: 502 },
  );
}

function supabaseServiceRoleGuard(env: Env): Response | null {
  if (!isSupabaseConfigured(env)) {
    return Response.json(
      {
        ok: false,
        configured: false,
        message:
          "Set SUPABASE_URL and a usable key in .dev.vars (local) or via wrangler secret put (production).",
      },
      { status: 503 },
    );
  }

  if (!getSupabaseAccessMode(env, { privileged: true })) {
    return Response.json(
      {
        ok: false,
        configured: true,
        message:
          "Set SUPABASE_SERVICE_ROLE_KEY for Worker-side market_memory_items reads.",
      },
      { status: 503 },
    );
  }

  return null;
}
