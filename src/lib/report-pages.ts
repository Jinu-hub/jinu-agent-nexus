// ─────────────────────────────────────────────────────────────────────────
// Report pages — standalone `/<report_series.slug>` surfaces
// ─────────────────────────────────────────────────────────────────────────
//
// A report series can own a full-frame reading page at its own path
// (`/daily-market-issues`), separate from the chat shell's Market panel.
// Only slugs listed here get a route; every other series stays panel-only.
// ─────────────────────────────────────────────────────────────────────────

export type ReportPage = {
  /** report_series.slug — also the URL path segment. */
  slug: string;
  /** Small label above the title. */
  eyebrow: string;
  /** Heading shown until the catalog row loads. */
  fallbackTitle: string;
};

export const REPORT_PAGES: ReportPage[] = [
  {
    slug: "daily-market-issues",
    eyebrow: "Daily market issues",
    fallbackTitle: "Market Issues Report",
  },
];

export function reportPagePath(slug: string): string {
  return `/${slug}`;
}

/** Resolve a browser pathname to a report page (trailing slash tolerated). */
export function matchReportPage(pathname: string): ReportPage | null {
  const slug = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!slug) return null;
  return REPORT_PAGES.find((page) => page.slug === slug) ?? null;
}
