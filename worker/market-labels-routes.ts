// HTTP routes for market topic label resolve — see market-labels.ts.

import { isMarketDateYmd } from "./market-date";
import { resolveMarketLabels } from "./market-labels";
import {
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";

/**
 *   POST /api/market-labels/resolve — body-grounded Tags/Keywords labels
 * Returns null if path is not a market-labels route.
 */
export async function handleMarketLabelsRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/market-labels/resolve") return null;

  if (request.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const blocked = supabaseServiceRoleGuard(env);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, message: "invalid JSON" }, { status: 400 });
  }

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  const dateRaw = str(body.date) ?? str(body.market_date);
  if (dateRaw && !isMarketDateYmd(dateRaw)) {
    return Response.json(
      { ok: false, message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const result = await resolveMarketLabels(env, {
      marketDate: dateRaw,
      lang: str(body.lang),
      itemId: str(body.item_id),
      skipLlm: body.skip_llm === true,
      force: body.force === true,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "resolve failed";
    const notFound = /not found|no item_contents/i.test(message);
    return Response.json(
      { ok: false, message },
      { status: notFound ? 404 : 502 },
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
