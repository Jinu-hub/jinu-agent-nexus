// ─────────────────────────────────────────────────────────────────────────
// HomeReportExits — shell → dedicated report pages
// ─────────────────────────────────────────────────────────────────────────
//
// `/` stays the agent shell. These links leave it for a reading surface
// registered in REPORT_PAGES. The empty-state cards are the landing
// exit; the header links stay after the first message.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { isContentLang } from "../../worker/chat-agent/settings";
import type { ReportSeriesRow } from "../../worker/report-series";
import {
  REPORT_PAGES,
  reportPageNavLabel,
  reportPagePath,
  reportPageSeriesSlugs,
} from "@/lib/report-pages";
import { cn } from "@/lib/utils";

export function ReportNavLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Reports"
      className={cn("flex items-center gap-3", className)}
    >
      {REPORT_PAGES.map((page) => (
        <a
          key={page.slug}
          href={reportPagePath(page.slug)}
          className="text-[11px] font-medium text-muted-foreground hover:text-primary"
        >
          {reportPageNavLabel(page)}
        </a>
      ))}
    </nav>
  );
}

export function ReportLandingCards() {
  const dates = useLatestReportDates();

  return (
    <section className="space-y-3 self-stretch">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
        읽을 리포트
      </h2>
      <div className="grid gap-2">
        {REPORT_PAGES.map((page) => {
          const latest = dates[page.slug];
          return (
            <a
              key={page.slug}
              href={reportPagePath(page.slug)}
              className={cn(
                "group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3",
                "hover:border-primary/50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  {page.eyebrow}
                </span>
                <span className="mt-1 block text-sm font-semibold tracking-tight">
                  {page.fallbackTitle}
                </span>
                {latest ? (
                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                    Latest · {latest}
                  </span>
                ) : null}
              </span>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
            </a>
          );
        })}
      </div>
    </section>
  );
}

function useLatestReportDates(): Record<string, string> {
  const [dates, setDates] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [settingsRes, seriesRes] = await Promise.all([
          fetch("/settings"),
          fetch("/api/report-series"),
        ]);
        const settings = (await settingsRes.json()) as { content_lang?: unknown };
        const seriesJson = (await seriesRes.json()) as {
          ok?: boolean;
          items?: ReportSeriesRow[];
        };
        if (!active || !seriesJson.ok || !Array.isArray(seriesJson.items)) {
          return;
        }
        const lang = isContentLang(settings.content_lang)
          ? settings.content_lang
          : "ko";
        const idBySlug = new Map(
          seriesJson.items.map((row) => [row.slug, row.id]),
        );

        const entries = await Promise.all(
          REPORT_PAGES.map(async (page) => {
            const qs = new URLSearchParams({ lang });
            for (const slug of reportPageSeriesSlugs(page)) {
              const id = idBySlug.get(slug);
              if (id) qs.append("series_id", id);
            }
            if (!qs.has("series_id")) return [page.slug, ""] as const;
            const res = await fetch(`/api/market/latest-date?${qs}`);
            const json = (await res.json()) as {
              found?: boolean;
              marketDate?: string | null;
            };
            const date =
              json.found && typeof json.marketDate === "string"
                ? json.marketDate
                : "";
            return [page.slug, date] as const;
          }),
        );
        if (!active) return;
        const next: Record<string, string> = {};
        for (const [slug, date] of entries) {
          if (date) next[slug] = date;
        }
        setDates(next);
      } catch {
        /* cards still work without a date line */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return dates;
}
