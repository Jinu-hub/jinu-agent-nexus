// ─────────────────────────────────────────────────────────────────────────
// content_briefs — Market Memory daily brief / market-issue text
// ─────────────────────────────────────────────────────────────────────────
//
// Product role:
//   Supabase content_briefs = shared "Today in 30s" / market-issue copy
//   Cloudflare Worker       = read path for curl + chat tool
//
// Phase A: GET /api/briefs/today — curl verification.
// Phase B: getTodayMarketBrief chat tool reuses getTodayContentBrief().
// ─────────────────────────────────────────────────────────────────────────

import {
  createSupabaseClient,
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";
import {
  isMarketDateYmd,
  marketDateYmdInTimeZone,
  shiftMarketDateYmd,
} from "./market-date";

export const CONTENT_BRIEFS_TABLE = "content_briefs";

/** Default product slice for "오늘의 마켓 이슈 브리핑". */
export const DEFAULT_BRIEF_LANG = "ko";
export const DEFAULT_BRIEF_TYPE = "brief_30s";
export const DEFAULT_BRIEF_CONTENT_TYPE = "daily-market-issues";
export const DEFAULT_BRIEF_STATUS = "final";

const CONTENT_BRIEFS_SELECT =
  "id, target_type, target_id, content_type, brief_type, lang_code, title, content, status, market_date, model_info, metadata, created_at, updated_at";

export type ContentBriefRow = {
  id: string;
  target_type: string;
  target_id: string;
  content_type: string;
  brief_type: string;
  lang_code: string;
  title: string | null;
  content: string | null;
  status: string;
  market_date: string | null;
  model_info: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type GetTodayContentBriefOptions = {
  /** YYYY-MM-DD. Default: Asia/Seoul calendar today. */
  marketDate?: string;
  lang?: string;
  briefType?: string;
  contentType?: string;
  status?: string;
};

export type TodayContentBriefResult = {
  marketDate: string;
  lang: string;
  briefType: string;
  contentType: string;
  status: string;
  item: ContentBriefRow | null;
};

export type LatestContentBriefMarketDateResult = {
  lang: string;
  briefType: string;
  contentType: string;
  status: string;
  /** Most recent market_date with a matching final brief, or null. */
  marketDate: string | null;
  /** Asia/Seoul calendar today / yesterday (for UI hints). */
  calendarToday: string;
  seoulYesterday: string;
};

/**
 * Newest market_date that actually has a final brief for this product slice.
 * Prefer this over "Seoul yesterday" — weekends / holidays often have no row.
 */
export async function getLatestContentBriefMarketDate(
  env: Env,
  options: Omit<GetTodayContentBriefOptions, "marketDate"> = {},
): Promise<LatestContentBriefMarketDateResult> {
  const lang = options.lang?.trim() || DEFAULT_BRIEF_LANG;
  const briefType = options.briefType?.trim() || DEFAULT_BRIEF_TYPE;
  const contentType =
    options.contentType?.trim() || DEFAULT_BRIEF_CONTENT_TYPE;
  const status = options.status?.trim() || DEFAULT_BRIEF_STATUS;
  const calendarToday = marketDateYmdInTimeZone();
  const seoulYesterday = shiftMarketDateYmd(calendarToday, -1);

  const client = createSupabaseClient(env, { privileged: true });

  const { data, error } = await client
    .from(CONTENT_BRIEFS_TABLE)
    .select("market_date")
    .eq("lang_code", lang)
    .eq("brief_type", briefType)
    .eq("content_type", contentType)
    .eq("status", status)
    .not("content", "is", null)
    .neq("content", "")
    .not("market_date", "is", null)
    .order("market_date", { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<{ market_date: string }, { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    lang,
    briefType,
    contentType,
    status,
    marketDate: data?.market_date ?? null,
    calendarToday,
    seoulYesterday,
  };
}

/**
 * Fetch one final brief for the given market day / lang / type.
 * Uses service_role (trusted Worker read), matching content_audio.
 */
export async function getTodayContentBrief(
  env: Env,
  options: GetTodayContentBriefOptions = {},
): Promise<TodayContentBriefResult> {
  const marketDate =
    options.marketDate?.trim() || marketDateYmdInTimeZone();
  const lang = options.lang?.trim() || DEFAULT_BRIEF_LANG;
  const briefType = options.briefType?.trim() || DEFAULT_BRIEF_TYPE;
  const contentType =
    options.contentType?.trim() || DEFAULT_BRIEF_CONTENT_TYPE;
  const status = options.status?.trim() || DEFAULT_BRIEF_STATUS;

  const client = createSupabaseClient(env, { privileged: true });

  const { data, error } = await client
    .from(CONTENT_BRIEFS_TABLE)
    .select(CONTENT_BRIEFS_SELECT)
    .eq("market_date", marketDate)
    .eq("lang_code", lang)
    .eq("brief_type", briefType)
    .eq("content_type", contentType)
    .eq("status", status)
    .not("content", "is", null)
    .neq("content", "")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<ContentBriefRow, { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    marketDate,
    lang,
    briefType,
    contentType,
    status,
    item: data ?? null,
  };
}

/**
 * HTTP routes for content briefs:
 *   GET /api/briefs/today — one brief for market_date (query overrides)
 *   GET /api/briefs/latest-date — newest market_date with a final brief
 *
 * Query params (all optional):
 *   date          YYYY-MM-DD (today route only; default: Asia/Seoul today)
 *   lang          default ko
 *   brief_type    default brief_30s
 *   content_type  default daily-market-issues
 *
 * Returns `null` if the path is not a briefs route.
 */
export async function handleBriefsRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/api/briefs/today" &&
    url.pathname !== "/api/briefs/latest-date"
  ) {
    return null;
  }

  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const blocked = supabaseServiceRoleGuard(env);
  if (blocked) return blocked;

  if (url.pathname === "/api/briefs/latest-date") {
    try {
      const result = await getLatestContentBriefMarketDate(env, {
        lang: url.searchParams.get("lang") ?? undefined,
        briefType: url.searchParams.get("brief_type") ?? undefined,
        contentType: url.searchParams.get("content_type") ?? undefined,
      });

      return Response.json({
        ok: true,
        found: result.marketDate !== null,
        marketDate: result.marketDate,
        lang: result.lang,
        briefType: result.briefType,
        contentType: result.contentType,
        status: result.status,
        calendarToday: result.calendarToday,
        seoulYesterday: result.seoulYesterday,
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "query failed",
        },
        { status: 502 },
      );
    }
  }

  const dateParam = url.searchParams.get("date")?.trim() || undefined;
  if (dateParam && !isMarketDateYmd(dateParam)) {
    return Response.json(
      {
        ok: false,
        message: "date must be YYYY-MM-DD",
      },
      { status: 400 },
    );
  }

  try {
    const result = await getTodayContentBrief(env, {
      marketDate: dateParam,
      lang: url.searchParams.get("lang") ?? undefined,
      briefType: url.searchParams.get("brief_type") ?? undefined,
      contentType: url.searchParams.get("content_type") ?? undefined,
    });

    return Response.json({
      ok: true,
      marketDate: result.marketDate,
      lang: result.lang,
      briefType: result.briefType,
      contentType: result.contentType,
      status: result.status,
      found: result.item !== null,
      item: result.item,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "query failed",
      },
      { status: 502 },
    );
  }
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
          "Set SUPABASE_SERVICE_ROLE_KEY for Worker-side content_briefs reads.",
      },
      { status: 503 },
    );
  }

  return null;
}
