// ─────────────────────────────────────────────────────────────────────────
// HomeReportExits — shell → dedicated report pages
// ─────────────────────────────────────────────────────────────────────────
//
// `/` stays the agent shell. Header shows *categories* (Market today;
// Enter / Sports later). Hover / click / touch opens the page menu.
// Empty-state cards group the same way under each category.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { isContentLang } from "../../worker/chat-agent/settings";
import type { ReportSeriesRow } from "../../worker/report-series";
import {
  REPORT_NAV_CATEGORIES,
  REPORT_PAGES,
  reportPageNavLabel,
  reportPagePath,
  reportPageSeriesSlugs,
  reportPagesForCategory,
  type ReportNavCategory,
  type ReportPage,
} from "@/lib/report-pages";
import { cn } from "@/lib/utils";
import { useT, type TFn } from "@/i18n/ui-lang";
import type { MessageKey } from "@/i18n/messages";

export function ReportNavLinks({ className }: { className?: string }) {
  const t = useT();
  return (
    <nav
      aria-label={t("chat.navCategories")}
      className={cn("flex items-center gap-3", className)}
    >
      {REPORT_NAV_CATEGORIES.map((category) => (
        <ReportCategoryMenu key={category.id} category={category} />
      ))}
    </nav>
  );
}

function ReportCategoryMenu({ category }: { category: ReportNavCategory }) {
  const pages = reportPagesForCategory(category);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const t = useT();
  const categoryLabel = navCategoryLabel(t, category);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pages.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => {
          setOpen((v) => {
            // Already open on a fine pointer: keep open (hover owns close).
            // Touch / closed: toggle so tap opens and second tap closes.
            if (
              v &&
              window.matchMedia("(hover: hover) and (pointer: fine)").matches
            ) {
              return true;
            }
            return !v;
          });
        }}
        className={cn(
          "inline-flex items-center gap-0.5 text-[11px] font-medium",
          "text-muted-foreground hover:text-primary",
          open && "text-primary",
        )}
      >
        {categoryLabel}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={categoryLabel}
          className={cn(
            "absolute left-0 top-full z-40 pt-1",
            "min-w-44",
          )}
        >
          <div
            className={cn(
              "rounded-md border border-border bg-background py-1 shadow-md",
            )}
          >
            {pages.map((page) => (
              <a
                key={page.slug}
                role="menuitem"
                href={reportPagePath(page.slug)}
                className={cn(
                  "block px-3 py-1.5 text-[11px] font-medium",
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => setOpen(false)}
              >
                {pageNavLabel(t, page)}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ReportLandingCards() {
  const dates = useLatestReportDates();
  const t = useT();
  const categorized = new Set(
    REPORT_NAV_CATEGORIES.flatMap((c) => c.pageSlugs),
  );
  const orphanPages = REPORT_PAGES.filter((p) => !categorized.has(p.slug));

  return (
    <section className="space-y-5 self-stretch">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
        {t("chat.themesHeading")}
      </h2>
      {REPORT_NAV_CATEGORIES.map((category) => {
        const pages = reportPagesForCategory(category);
        if (pages.length === 0) return null;
        return (
          <div key={category.id} className="space-y-2">
            <h3 className="text-[11px] font-semibold tracking-tight text-foreground">
              {navCategoryLabel(t, category)}
            </h3>
            <div className="grid gap-2">
              {pages.map((page) => (
                <ReportLandingCard
                  key={page.slug}
                  page={page}
                  latest={dates[page.slug]}
                />
              ))}
            </div>
          </div>
        );
      })}
      {orphanPages.length > 0 ? (
        <div className="grid gap-2">
          {orphanPages.map((page) => (
            <ReportLandingCard
              key={page.slug}
              page={page}
              latest={dates[page.slug]}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReportLandingCard({
  page,
  latest,
}: {
  page: ReportPage;
  latest?: string;
}) {
  const t = useT();
  return (
    <a
      href={reportPagePath(page.slug)}
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3",
        "hover:border-primary/50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
          {pageEyebrow(t, page)}
        </span>
        <span className="mt-1 block text-sm font-semibold tracking-tight">
          {pageTitle(t, page)}
        </span>
        {latest ? (
          <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
            {t("chat.latestDate", { date: latest })}
          </span>
        ) : null}
      </span>
      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
    </a>
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

function navCategoryLabel(t: TFn, category: ReportNavCategory): string {
  if (category.id === "market") return t("chat.nav.market");
  return category.label;
}

function pageKeys(slug: string): {
  eyebrow: MessageKey;
  nav: MessageKey;
  title: MessageKey;
} | null {
  if (slug === "daily-market-issues") {
    return {
      eyebrow: "chat.page.daily.eyebrow",
      nav: "chat.page.daily.nav",
      title: "chat.page.daily.title",
    };
  }
  if (slug === "weekly-ai-issues") {
    return {
      eyebrow: "chat.page.weeklyAi.eyebrow",
      nav: "chat.page.weeklyAi.nav",
      title: "chat.page.weeklyAi.title",
    };
  }
  return null;
}

function pageEyebrow(t: TFn, page: ReportPage): string {
  const keys = pageKeys(page.slug);
  return keys ? t(keys.eyebrow) : page.eyebrow;
}

function pageNavLabel(t: TFn, page: ReportPage): string {
  const keys = pageKeys(page.slug);
  return keys ? t(keys.nav) : reportPageNavLabel(page);
}

function pageTitle(t: TFn, page: ReportPage): string {
  const keys = pageKeys(page.slug);
  return keys ? t(keys.title) : page.fallbackTitle;
}
