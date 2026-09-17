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
    fallbackTitle: "Market Issues Report",
    includeSeriesSlugs: ["weekly-market-issues"],
  },
  {
    slug: "weekly-ai-issues",
    eyebrow: "Weekly AI issues",
    fallbackTitle: "Weekly AI Issues Digest",
  },
];

export function reportPagePath(slug: string): string {
  return `/${slug}`;
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
