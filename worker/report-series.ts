// ─────────────────────────────────────────────────────────────────────────
// report_series — Market Memory content catalog (Supabase)
// ─────────────────────────────────────────────────────────────────────────
//
// Catalog of Market content series (weekly AI, weekly market, daily, …).
// Settings UI uses this list to let the user opt into which series to use.
// `is_active = false` rows stay visible as "soon" (not user-toggleable).
//
// Reads use the service role (RLS on report_series is authenticated-only).
// ─────────────────────────────────────────────────────────────────────────

import {
  createSupabaseClient,
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";

const REPORT_SERIES_TABLE = "report_series";

const REPORT_SERIES_SELECT =
  "id, slug, title, description, is_active, display_order, created_at, updated_at";

export type ReportSeriesRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * Settings Content rows — some catalog slugs share one toggle.
 * weekly + daily market issues are one product surface.
 */
export type ReportSeriesContentGroup = {
  id: string;
  title: string;
  /** Subtitle under the title (e.g. joined slugs). */
  detail: string;
  slugs: string[];
  /** True when every member is catalog-inactive → soon badge, no toggle. */
  soon: boolean;
  /** Members that participate in enable/disable (catalog-active only). */
  controllableSlugs: string[];
  displayOrder: number;
};

/** Slugs that share a single Settings Content toggle. */
const MARKET_ISSUES_GROUP_SLUGS = [
  "weekly-market-issues",
  "daily-market-issues",
] as const;

const MARKET_ISSUES_GROUP_ID = "market-issues";
const MARKET_ISSUES_GROUP_TITLE = "Market Issues Report";

/** Display-title overrides for Settings Content (catalog title may differ). */
const SERIES_TITLE_OVERRIDES: Record<string, string> = {
  "daily-market-issues-kr": "Market Issues Report (KR)",
};

/** Short labels for Market panel same-day tabs (avoid truncation). */
const SERIES_TAB_LABELS: Record<string, string> = {
  "weekly-ai-issues": "Weekly AI",
  "weekly-market-issues": "Weekly Market",
  "daily-market-issues": "Daily",
  "daily-market-issues-kr": "Market (KR)",
};

/**
 * Series whose lead copy (report `summary`, brief pulse/takeaway) usually
 * repeats the body — hide those leads in Market UI (data/chat unchanged).
 */
const HIDE_REDUNDANT_LEAD_SLUGS = new Set([
  "weekly-ai-issues",
  "weekly-market-issues",
  "daily-market-issues",
]);

function hidesRedundantLead(
  seriesSlug: string | null | undefined,
): boolean {
  const slug = seriesSlug?.trim();
  return Boolean(slug && HIDE_REDUNDANT_LEAD_SLUGS.has(slug));
}

/** True when Market Report UI should omit the gray summary block. */
export function hidesReportSummaryBlurb(
  seriesSlug: string | null | undefined,
): boolean {
  return hidesRedundantLead(seriesSlug);
}

/** True when slim Market card should skip pulse/takeaway and start at Brief. */
export function hidesBriefLeadSummary(
  seriesSlug: string | null | undefined,
): boolean {
  return hidesRedundantLead(seriesSlug);
}

/** UI / API label for a catalog row (Settings Content rows). */
export function reportSeriesDisplayTitle(row: ReportSeriesRow): string {
  return SERIES_TITLE_OVERRIDES[row.slug] ?? row.title;
}

/** Compact tab label for Market panel day switcher. */
export function reportSeriesTabLabel(row: ReportSeriesRow): string {
  if (SERIES_TAB_LABELS[row.slug]) return SERIES_TAB_LABELS[row.slug];
  const display = reportSeriesDisplayTitle(row);
  const trimmed = display.replace(/\s+Report$/i, "").trim();
  return trimmed || row.slug;
}

/** Catalog rows the user has left ON (active catalog + not in disabled slugs). */
export function enabledReportSeriesRows(
  items: ReportSeriesRow[],
  disabledSlugs: string[],
): ReportSeriesRow[] {
  const disabled = new Set(disabledSlugs);
  return items.filter((row) => row.is_active && !disabled.has(row.slug));
}

/** Parse `series_id` (repeat) or `series_ids` (comma) from a request URL. */
export function parseSeriesIdsFromUrl(url: URL): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [
    ...url.searchParams.getAll("series_id"),
    ...(url.searchParams.get("series_ids")?.split(",") ?? []),
  ]) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Collapse catalog rows into Settings Content groups.
 * Unknown slugs stay as one-row groups keyed by slug.
 */
export function groupReportSeriesForSettings(
  items: ReportSeriesRow[],
): ReportSeriesContentGroup[] {
  const bySlug = new Map(items.map((row) => [row.slug, row]));
  const consumed = new Set<string>();
  const groups: ReportSeriesContentGroup[] = [];

  const marketMembers = MARKET_ISSUES_GROUP_SLUGS.map((slug) =>
    bySlug.get(slug),
  ).filter((row): row is ReportSeriesRow => Boolean(row));

  if (marketMembers.length > 0) {
    for (const row of marketMembers) consumed.add(row.slug);
    const controllableSlugs = marketMembers
      .filter((row) => row.is_active)
      .map((row) => row.slug);
    groups.push({
      id: MARKET_ISSUES_GROUP_ID,
      title: MARKET_ISSUES_GROUP_TITLE,
      detail: marketMembers.map((row) => row.slug).join(" · "),
      slugs: marketMembers.map((row) => row.slug),
      soon: controllableSlugs.length === 0,
      controllableSlugs,
      displayOrder: Math.min(...marketMembers.map((row) => row.display_order)),
    });
  }

  for (const row of items) {
    if (consumed.has(row.slug)) continue;
    groups.push({
      id: row.slug,
      title: SERIES_TITLE_OVERRIDES[row.slug] ?? row.title,
      detail: row.description?.trim() || row.slug,
      slugs: [row.slug],
      soon: !row.is_active,
      controllableSlugs: row.is_active ? [row.slug] : [],
      displayOrder: row.display_order,
    });
  }

  groups.sort((a, b) => a.displayOrder - b.displayOrder);
  return groups;
}

/**
 * List all report_series rows ordered for Settings UI.
 * Includes inactive ("soon") rows — callers decide how to render them.
 */
export async function listReportSeries(env: Env): Promise<ReportSeriesRow[]> {
  const supabase = createSupabaseClient(env, { privileged: true });
  const { data, error } = await supabase
    .from(REPORT_SERIES_TABLE)
    .select(REPORT_SERIES_SELECT)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`report_series query failed: ${error.message}`);
  }

  return (data ?? []) as ReportSeriesRow[];
}

/**
 * GET /api/report-series — full catalog for Settings content toggles.
 * Also returns `groups` (weekly+daily market issues collapsed).
 */
export async function handleReportSeriesRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/report-series") return null;

  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const blocked = supabaseServiceRoleGuard(env);
  if (blocked) return blocked;

  try {
    const items = await listReportSeries(env);
    const groups = groupReportSeriesForSettings(items);
    return Response.json({
      ok: true,
      count: items.length,
      items,
      groups,
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
          "Set SUPABASE_SERVICE_ROLE_KEY for Worker-side report_series reads.",
      },
      { status: 503 },
    );
  }

  return null;
}
