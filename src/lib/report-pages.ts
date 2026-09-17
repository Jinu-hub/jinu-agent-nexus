// ─────────────────────────────────────────────────────────────────────────
// Report pages — standalone `/<report_series.slug>` surfaces
// ─────────────────────────────────────────────────────────────────────────
//
// A report series can own a full-frame reading page at its own path
// (`/daily-market-issues`), separate from the chat shell's Market panel.
// Only slugs listed here get a route; every other series stays panel-only.
//
// A page can also *include* other catalog slugs (no extra URL). Example:
// `/daily-market-issues` loads daily + weekly-market-issues as same-day
// series tabs — weekly does not get its own `/weekly-market-issues` route.
// ─────────────────────────────────────────────────────────────────────────

export type ReportPage = {
  /** report_series.slug — also the URL path segment. */
  slug: string;
  /** Small label above the title. */
  eyebrow: string;
  /** Compact header link on the chat shell. Falls back to `eyebrow`. */
  navLabel?: string;
  /** Heading shown until the catalog row loads. */
  fallbackTitle: string;
  /**
   * Extra `report_series.slug`s shown on this page (same-day tabs).
   * Not routed; only the path slug is in the URL.
   */
  includeSeriesSlugs?: string[];
};

export const REPORT_PAGES: ReportPage[] = [
  {
    slug: "daily-market-issues",
    eyebrow: "Market issues",
    navLabel: "Market",
    fallbackTitle: "Market Issues Report",
    includeSeriesSlugs: ["weekly-market-issues"],
  },
  {
    slug: "weekly-ai-issues",
    eyebrow: "Weekly AI issues",
    navLabel: "Weekly AI",
    fallbackTitle: "Weekly AI Issues Digest",
  },
];

export function reportPagePath(slug: string): string {
  return `/${slug}`;
}

export function reportPageNavLabel(page: ReportPage): string {
  return page.navLabel?.trim() || page.eyebrow;
}

/** Path slug + companions — order is primary first, then includes. */
export function reportPageSeriesSlugs(page: ReportPage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of [page.slug, ...(page.includeSeriesSlugs ?? [])]) {
    const s = slug.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Resolve a browser pathname to a report page (trailing slash tolerated). */
export function matchReportPage(pathname: string): ReportPage | null {
  const slug = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!slug) return null;
  return REPORT_PAGES.find((page) => page.slug === slug) ?? null;
}

/** Page that hosts this catalog slug — path owner or an `includeSeriesSlugs` companion. */
export function findReportPageForSeriesSlug(seriesSlug: string): ReportPage | null {
  const slug = seriesSlug.trim();
  if (!slug) return null;
  return (
    REPORT_PAGES.find((page) => reportPageSeriesSlugs(page).includes(slug)) ??
    null
  );
}

/**
 * Dedicated reading URL for a catalog slug, or `null` if it has no page.
 * Companion slugs (e.g. weekly-market-issues) keep the owner's path and
 * pin `?series=`. Optional `date` / `lang` / `tab` match ReportSurface.
 */
export function readingHrefForSeriesSlug(
  seriesSlug: string,
  opts?: { date?: string | null; lang?: string | null; tab?: string | null },
): string | null {
  const slug = seriesSlug.trim();
  const page = findReportPageForSeriesSlug(slug);
  if (!page) return null;
  const params = new URLSearchParams();
  const date = opts?.date?.trim();
  const lang = opts?.lang?.trim();
  const tab = opts?.tab?.trim();
  if (date) params.set("date", date);
  if (lang) params.set("lang", lang);
  if (tab) params.set("tab", tab);
  if (slug !== page.slug) params.set("series", slug);
  const qs = params.toString();
  return qs ? `${reportPagePath(page.slug)}?${qs}` : reportPagePath(page.slug);
}
