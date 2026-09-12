// HTTP routes for Market Vectorize — see market-vector.ts.

import {
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";
import { isMarketDateYmd } from "./market-date";
import {
  clearMarketVectors,
  ingestMarketReport,
  queryMarketVectors,
} from "./market-vector";

/**
 * HTTP routes:
 *   POST /api/market-vector/ingest — chunk + embed report → MARKET_VECTOR_DB
 *   POST /api/market-vector/query  — similarity search (scoped to one item_id)
 *   POST /api/market-vector/clear  — delete Vectorize chunks for one report
 *
 * Returns `null` if the path is not a market-vector route.
 */
export async function handleMarketVectorRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/market-vector/ingest") {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleIngestPost(request, env);
  }

  if (pathname === "/api/market-vector/query") {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    // Resolves item_contents (same as ingest) → needs service_role.
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleQueryPost(request, env);
  }

  if (pathname === "/api/market-vector/clear") {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleClearPost(request, env);
  }

  return null;
}

async function handleClearPost(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const dateRaw = str(body.date) ?? str(body.market_date) ?? undefined;
  const itemId = str(body.item_id);
  if (!itemId && (!dateRaw || !isMarketDateYmd(dateRaw))) {
    return Response.json(
      {
        ok: false,
        message: "Provide item_id and/or date (YYYY-MM-DD) to resolve the report",
      },
      { status: 400 },
    );
  }
  if (dateRaw && !isMarketDateYmd(dateRaw)) {
    return Response.json(
      { ok: false, message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const result = await clearMarketVectors(env, {
      marketDate: dateRaw,
      lang: str(body.lang) ?? undefined,
      briefType: str(body.brief_type) ?? undefined,
      contentType: str(body.content_type) ?? undefined,
      itemId: itemId ?? undefined,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "clear failed";
    const notFound = /not found|no item_contents/i.test(message);
    return Response.json(
      { ok: false, message },
      { status: notFound ? 404 : 502 },
    );
  }
}

async function handleIngestPost(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const dateRaw = str(body.date) ?? str(body.market_date) ?? undefined;
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

async function handleQueryPost(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const dateRaw = str(body.date) ?? str(body.market_date) ?? undefined;
  const itemId = str(body.item_id);
  if (!itemId && (!dateRaw || !isMarketDateYmd(dateRaw))) {
    return Response.json(
      {
        ok: false,
        message: "Provide item_id and/or date (YYYY-MM-DD) to resolve the report",
      },
      { status: 400 },
    );
  }
  if (dateRaw && !isMarketDateYmd(dateRaw)) {
    return Response.json(
      { ok: false, message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const queries = coerceQueries(body);
  if (queries.length === 0) {
    return Response.json(
      {
        ok: false,
        message:
          'Provide "queries": ["…"] and/or "query": "…" (interest targets).',
      },
      { status: 400 },
    );
  }

  try {
    const result = await queryMarketVectors(env, {
      queries,
      marketDate: dateRaw,
      lang: str(body.lang) ?? undefined,
      briefType: str(body.brief_type) ?? undefined,
      contentType: str(body.content_type) ?? undefined,
      itemId,
      topKPerQuery: num(body.top_k_per_query) ?? num(body.topKPerQuery),
      hitLimit: num(body.hit_limit) ?? num(body.hitLimit),
      minScore: num(body.min_score) ?? num(body.minScore),
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "query failed";
    const notFound = /not found|no item_contents/i.test(message);
    return Response.json(
      { ok: false, message },
      { status: notFound ? 404 : 502 },
    );
  }
}

function coerceQueries(body: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (Array.isArray(body.queries)) {
    for (const q of body.queries) {
      if (typeof q === "string" && q.trim()) out.push(q.trim());
    }
  }
  const single = str(body.query);
  if (single) out.push(single);
  return out;
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return Response.json(
      { ok: false, message: "body must be a JSON object" },
      { status: 400 },
    );
  } catch {
    return Response.json(
      { ok: false, message: "invalid JSON body" },
      { status: 400 },
    );
  }
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
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
