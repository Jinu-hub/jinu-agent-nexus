// ─────────────────────────────────────────────────────────────────────────
// ReportSurface — standalone `/<report_series.slug>` reading page
// ─────────────────────────────────────────────────────────────────────────
//
// Full-frame surface rendered instead of the chat shell (see src/main.tsx).
// First pass: Brief only, laid out as an article. Voice, full report and
// chat come later.
//
// No agent connection — it reads the same HTTP APIs as the Market panel:
//   GET /settings               → content_lang (unless `?lang=` overrides)
//   GET /api/report-series      → slug → series row
//   GET /api/market/latest-date → newest market_date for that series
//   GET /api/market/day         → brief for one market_date
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { ContentLang } from "../../worker/chat-agent/settings";
import { isContentLang } from "../../worker/chat-agent/settings";
import type { ReportSeriesRow } from "../../worker/report-series";
import { parseBriefBody, parseBriefParts } from "@/lib/brief-format";
import {
  calendarYesterdayYmd,
  isMarketDateYmd,
  seoulYmd,
  shiftYmd,
} from "@/lib/market-date";
import type { ReportPage } from "@/lib/report-pages";
import { cn } from "@/lib/utils";

type BriefItem = {
  id: string;
  title: string | null;
  content: string | null;
  brief_type: string;
  lang_code: string;
  market_date: string | null;
  metadata: unknown;
};

type MarketDayResponse = {
  ok?: boolean;
  slots?: Array<{ seriesId: string; brief: BriefItem | null }>;
  message?: string;
};

export default function ReportSurface({ page }: { page: ReportPage }) {
  const params = new URLSearchParams(window.location.search);
  const langOverride = params.get("lang");
  const dateParam = params.get("date")?.trim();

  const [lang, setLang] = useState<ContentLang | null>(
    isContentLang(langOverride) ? langOverride : null,
  );
  const [series, setSeries] = useState<ReportSeriesRow | null>(null);
  const [seriesResolved, setSeriesResolved] = useState(false);
  const [date, setDate] = useState<string | null>(
    dateParam && isMarketDateYmd(dateParam) ? dateParam : null,
  );
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarToday = seoulYmd();

  // Content language follows Settings unless the URL pins one.
  useEffect(() => {
    if (lang) return;
    let active = true;
    void fetch("/settings")
      .then(async (res) => {
        const body = (await res.json()) as { content_lang?: unknown };
        if (!active) return;
        setLang(isContentLang(body.content_lang) ? body.content_lang : "ko");
      })
      .catch(() => {
        if (active) setLang("ko");
      });
    return () => {
      active = false;
    };
  }, [lang]);

  useEffect(() => {
    let active = true;
    void fetch("/api/report-series")
      .then(async (res) => {
        const body = (await res.json()) as {
          ok?: boolean;
          items?: ReportSeriesRow[];
          message?: string;
        };
        if (!active) return;
        if (!body.ok || !Array.isArray(body.items)) {
          throw new Error(body.message || `report-series HTTP ${res.status}`);
        }
        setSeries(body.items.find((row) => row.slug === page.slug) ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSeries(null);
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      })
      .finally(() => {
        if (active) setSeriesResolved(true);
      });
    return () => {
      active = false;
    };
  }, [page.slug]);

  const loadBrief = useCallback(
    async (seriesId: string, marketDate: string, marketLang: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          date: marketDate,
          lang: marketLang,
          series_id: seriesId,
        });
        const res = await fetch(`/api/market/day?${qs}`);
        const json = (await res.json()) as MarketDayResponse;
        if (!res.ok && !json.ok) {
          throw new Error(json.message || `market/day HTTP ${res.status}`);
        }
        setBrief(json.slots?.[0]?.brief ?? null);
      } catch (err) {
        setBrief(null);
        setError(err instanceof Error ? err.message : "Failed to load brief");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Newest published day for this series — also the initial date.
  useEffect(() => {
    if (!series || !lang) return;
    let active = true;
    const qs = new URLSearchParams({ lang, series_id: series.id });
    void fetch(`/api/market/latest-date?${qs}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          found?: boolean;
          marketDate?: string | null;
          seoulYesterday?: string;
          message?: string;
        };
        if (!active) return;
        if (!res.ok && !json.ok) {
          throw new Error(json.message || `latest-date HTTP ${res.status}`);
        }
        const next =
          json.found && typeof json.marketDate === "string"
            ? json.marketDate
            : (json.seoulYesterday ?? calendarYesterdayYmd());
        setLatestDate(next);
        setDate((prev) => prev ?? next);
      })
      .catch(() => {
        if (!active) return;
        const fallback = calendarYesterdayYmd();
        setLatestDate(fallback);
        setDate((prev) => prev ?? fallback);
      });
    return () => {
      active = false;
    };
  }, [series, lang]);

  useEffect(() => {
    if (!series || !lang || !date) return;
    void loadBrief(series.id, date, lang);
  }, [series, lang, date, loadBrief]);

  const parts = parseBriefParts(brief?.metadata);
  // Rows published before the structured metadata landed — read the prose.
  const fallback =
    parts.highlights.length === 0 && brief?.content
      ? parseBriefBody(brief.content)
      : null;
  const lead = parts.pulse ? [parts.pulse] : (fallback?.lead ?? []);
  const highlights =
    parts.highlights.length > 0
      ? parts.highlights.map((h) => ({
          headline: h.title,
          body: h.summary ? [h.summary] : [],
        }))
      : (fallback?.sections.map((s) => ({
          headline: s.headline,
          body: s.body,
        })) ?? []);
  const effectiveLatest = latestDate ?? calendarYesterdayYmd();
  const title = series?.title ?? page.fallbackTitle;

  return (
    <div className="report-warm flex h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-6 py-3">
          <a
            href="/"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Agent
          </a>
          <span
            aria-hidden
            className="h-3.5 w-px shrink-0 bg-border"
          />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight">
            {title}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {lang ?? "…"}
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-6 pb-3">
          <button
            type="button"
            disabled={loading || !date}
            onClick={() => setDate((d) => (d ? shiftYmd(d, -1) : d))}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date ?? ""}
            disabled={loading || !date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
            className={cn(
              "min-w-0 flex-1 rounded-full border border-border bg-card px-3 py-1.5",
              "font-mono text-xs tabular-nums",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-50",
            )}
          />
          <button
            type="button"
            disabled={loading || !date}
            onClick={() => setDate((d) => (d ? shiftYmd(d, 1) : d))}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={loading || date === effectiveLatest}
            onClick={() => setDate(effectiveLatest)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground",
              "hover:bg-accent hover:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
            title={`Newest published day · ${effectiveLatest}`}
          >
            Latest
          </button>
          <button
            type="button"
            disabled={loading || !date || date === calendarToday}
            onClick={() => setDate(calendarToday)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground",
              "hover:bg-accent hover:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
            title="Seoul calendar today (often not published yet)"
          >
            Today
          </button>
          <button
            type="button"
            disabled={loading || !series || !date || !lang}
            onClick={() => {
              if (series && date && lang) void loadBrief(series.id, date, lang);
            }}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-3xl px-6 py-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            {page.eyebrow}
          </p>

          {!seriesResolved || !lang || (loading && !brief) ? (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading…
            </div>
          ) : !series ? (
            <Notice title="Series not in the catalog">
              <code className="font-mono">{page.slug}</code> is missing from{" "}
              <code className="font-mono">report_series</code>. Check Supabase
              or the slug in <code className="font-mono">report-pages.ts</code>.
            </Notice>
          ) : !brief ? (
            <Notice title="Nothing published for this day">
              No final brief for{" "}
              <span className="font-mono text-foreground">{date}</span> /{" "}
              <span className="font-mono text-foreground">{lang}</span>. The
              daily batch runs around{" "}
              <span className="font-mono">22:30 UTC</span>, so the newest day is
              usually <span className="font-mono text-foreground">{effectiveLatest}</span>.
            </Notice>
          ) : (
            <>
              <h1 className="mt-3 text-4xl font-extrabold leading-[1.15] tracking-[-0.02em] text-balance">
                {brief.title ?? title}
              </h1>

              <p className="mt-4 font-mono text-[11px] tracking-wide text-muted-foreground">
                {[brief.market_date, brief.brief_type, brief.lang_code]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {lead.map((paragraph, i) => (
                <p
                  key={i}
                  className="mt-6 whitespace-pre-wrap text-[17px] leading-8 text-foreground/80"
                >
                  {paragraph}
                </p>
              ))}

              {highlights.length > 0 ? (
                <div className="mt-10 space-y-4">
                  {highlights.map((highlight, i) => (
                    <Highlight
                      key={i}
                      index={i + 1}
                      headline={highlight.headline}
                      body={highlight.body}
                    />
                  ))}
                </div>
              ) : null}

              {parts.reactions.length > 0 ? (
                <div className="mt-10 rounded-xl border border-border bg-card px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                    Market reaction
                  </p>
                  <dl className="mt-3 divide-y divide-border">
                    {parts.reactions.map((reaction, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                      >
                        <dt className="flex items-center gap-1.5 text-[13px] font-semibold">
                          {reaction.direction === "up" ? (
                            <TrendingUp className="h-3.5 w-3.5 text-primary" />
                          ) : reaction.direction === "down" ? (
                            <TrendingDown className="h-3.5 w-3.5 text-primary" />
                          ) : null}
                          {reaction.label}
                        </dt>
                        <dd className="text-[13px] tabular-nums text-muted-foreground">
                          {reaction.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {parts.takeaway ? (
                <div className="mt-4 rounded-xl bg-foreground px-5 py-5 text-background">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                    Takeaway
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7">
                    {parts.takeaway}
                  </p>
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p className="mt-8 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </article>
      </main>
    </div>
  );
}

function Highlight({
  index,
  headline,
  body,
}: {
  index: number;
  headline: string;
  body: string[];
}) {
  return (
    <section className="flex gap-5 rounded-xl border border-border bg-card px-5 py-4">
      <span
        aria-hidden
        className="w-8 shrink-0 pt-0.5 font-mono text-2xl font-extrabold tabular-nums text-primary"
      >
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold leading-snug tracking-tight text-balance">
          {headline}
        </h2>
        {body.map((paragraph, i) => (
          <p
            key={i}
            className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-border bg-card px-5 py-8">
      <p className="text-sm font-bold tracking-tight text-foreground">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
