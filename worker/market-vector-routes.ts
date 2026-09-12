// HTTP routes for Market Vectorize ingest — see market-vector.ts.

import {
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";
import { isMarketDateYmd } from "./market-date";
import { ingestMarketReport } from "./market-vector";

/**
 * HTTP routes:
 *   POST /api/market-vector/ingest — chunk + embed today's (or given) report
 *
 * Body (JSON, all optional):
 *   date / market_date  YYYY-MM-DD (via brief when item_id omitted)
 *   lang                default ko
 *   brief_type          default brief_30s
 *   content_type        default daily-market-issues
 *   item_id             skip brief; ingest this item_contents row
 *
 * Returns `null` if the path is not a market-vector route.
 */
export async function handleMarketVectorRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/market-vector/ingest") return null;

  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const blocked = supabaseServiceRoleGuard(env);
  if (blocked) return blocked;

  let body: Record<string, unknown> = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      } else {
        return Response.json(
          { ok: false, message: "body must be a JSON object" },
          { status: 400 },
        );
      }
    } catch {
      return Response.json(
        { ok: false, message: "invalid JSON body" },
        { status: 400 },
      );
    }
  }

  const dateRaw =
    str(body.date) ?? str(body.market_date) ?? undefined;
  if (dateRaw && !isMarketDateYmd(dateRaw)) {
    return Response.json(
      { ok: false, message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestMarketReport(env, {
      marketDate: dateRaw,
      lang: str(body.lang) ?? undefined,
      briefType: str(body.brief_type) ?? undefined,
      contentType: str(body.content_type) ?? undefined,
      itemId: str(body.item_id) ?? undefined,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest failed";
    const notFound =
      /not found|no item_contents|empty content|zero chunks/i.test(message);
    return Response.json(
      { ok: false, message },
      { status: notFound ? 404 : 502 },
    );
  }
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
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
