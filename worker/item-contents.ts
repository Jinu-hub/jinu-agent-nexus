// ─────────────────────────────────────────────────────────────────────────
// item_contents — Market Memory full report (digest) text
// ─────────────────────────────────────────────────────────────────────────
//
// Product role:
//   Supabase item_contents = shared full markdown report ("풀리포트")
//   content_briefs.target_id → item_contents.id
//   Cloudflare Worker       = read path for curl + (later) panel / chat
//
// Phase A: GET /api/reports/today — brief → target_id → item_contents.
// ─────────────────────────────────────────────────────────────────────────

import { getTodayContentBrief } from "./content-briefs";
import {
  createSupabaseClient,
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";
import { isMarketDateYmd } from "./market-date";

export const ITEM_CONTENTS_TABLE = "item_contents";

/**
 * Product read fields for digest full reports.
 * (No `status` column — use `is_active` / `is_public`.)
 */
const ITEM_CONTENTS_SELECT =
  "id, title, content, summary, lang_code, market_date, report_type, report_tier, category, tags, countries, regions, is_active, is_public, created_at, metadata";

export type ItemContentRow = {
  id: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  lang_code: string | null;
  market_date: string | null;
  report_type: string | null;
  report_tier: string | null;
  category: string | null;
  tags: unknown;
  countries: unknown;
  regions: unknown;
  is_active: boolean | null;
  is_public: boolean | null;
  created_at: string | null;
  metadata: unknown;
};

export type GetTodayItemContentOptions = {
  /** YYYY-MM-DD. Default: Asia/Seoul calendar today (via brief helper). */
  marketDate?: string;
  lang?: string;
  briefType?: string;
  contentType?: string;
  status?: string;
};

export type TodayItemContentResult = {
  marketDate: string;
  lang: string;
  briefType: string;
  contentType: string;
  briefStatus: string;
  briefId: string | null;
  targetType: string | null;
  targetId: string | null;
  item: ItemContentRow | null;
};

/**
 * Resolve today's brief, then load item_contents by brief.target_id.
 * Uses service_role (trusted Worker read), matching content_briefs.
 */
export async function getTodayItemContent(
  env: Env,
  options: GetTodayItemContentOptions = {},
): Promise<TodayItemContentResult> {
  const briefResult = await getTodayContentBrief(env, options);

  const base: TodayItemContentResult = {
    marketDate: briefResult.marketDate,
    lang: briefResult.lang,
    briefType: briefResult.briefType,
    contentType: briefResult.contentType,
    briefStatus: briefResult.status,
    briefId: briefResult.item?.id ?? null,
    targetType: briefResult.item?.target_type ?? null,
    targetId: briefResult.item?.target_id ?? null,
    item: null,
  };

  const targetId = briefResult.item?.target_id?.trim();
  if (!targetId) {
    return base;
  }

  const client = createSupabaseClient(env, { privileged: true });

  const { data, error } = await client
    .from(ITEM_CONTENTS_TABLE)
    .select(ITEM_CONTENTS_SELECT)
    .eq("id", targetId)
    .eq("is_active", true)
    .not("content", "is", null)
    .neq("content", "")
    .maybeSingle()
    .overrideTypes<ItemContentRow, { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...base,
    item: data ?? null,
  };
}

/**
 * HTTP routes for full reports:
 *   GET /api/reports/today — one item_contents row via today's brief.target_id
 *
 * Query params (all optional; same as briefs/today):
 *   date          YYYY-MM-DD (default: Asia/Seoul today)
 *   lang          default ko
 *   brief_type    default brief_30s
 *   content_type  default daily-market-issues
 *
 * Returns `null` if the path is not a reports route.
 */
export async function handleReportsRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/reports/today") return null;

  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const blocked = supabaseServiceRoleGuard(env);
  if (blocked) return blocked;

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
    const result = await getTodayItemContent(env, {
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
      briefStatus: result.briefStatus,
      briefId: result.briefId,
      targetType: result.targetType,
      targetId: result.targetId,
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
          "Set SUPABASE_SERVICE_ROLE_KEY for Worker-side item_contents reads.",
      },
      { status: 503 },
    );
  }

  return null;
}
