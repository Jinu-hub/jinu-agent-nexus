// ─────────────────────────────────────────────────────────────────────────
// ReportSurface — standalone `/<report_series.slug>` reading page
// ─────────────────────────────────────────────────────────────────────────
//
// Full-frame surface rendered instead of the chat shell (see src/main.tsx).
//
// Three depth tabs — how deeply you want to read the same day:
//   30초 브리프 → 나를 위한 요약 (interests × report) → 전문
// Voice sits *above* the depth tabs: it is the day's asset, not a depth, and a
// player inside a tab panel would unmount (and stop playing) on switch.
//
// Series: the path slug owns the route (`/daily-market-issues`). Companions
// from `report-pages.includeSeriesSlugs` (e.g. weekly-market-issues) load on
// the same page as same-day series tabs — no separate weekly URL.
// Optional `?series=<slug>` pins which slot is selected.
//
// It reads the same HTTP APIs as the Market panel:
//   GET  /settings               → content_lang (unless `?lang=` overrides)
//   GET  /api/report-series      → slug(s) → series rows
//   GET  /api/market/latest-date → newest market_date across page series
//   GET  /api/market/day         → brief + voice + full report slots
//   POST /api/market/for-you     → personalized summary (ReportForYou)
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import {
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Volume2,
} from "lucide-react";

import type { ChatAgent } from "../../worker/chat-agent";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { isContentLang } from "../../worker/chat-agent/settings";
import type { ReportSeriesRow } from "../../worker/report-series";
import { DEFAULT_INSTANCE_NAME } from "@/lib/agent-identity";
import { ReportChat } from "./ReportChat";
import { ReportForYou } from "./ReportForYou";
import { ReportFullText } from "./ReportFullText";
import { parseBriefBody, parseBriefParts } from "@/lib/brief-format";
import {
  buildTagLexicon,
  topicDisplayLabel,
} from "@/lib/market-tag-lexicon";
import {
  calendarYesterdayYmd,
  isMarketDateYmd,
  seoulYmd,
  shiftYmd,
} from "@/lib/market-date";
import type { ReportPage } from "@/lib/report-pages";
import { reportPageSeriesSlugs } from "@/lib/report-pages";
import { fetchTopicLabels } from "@/lib/topic-preference";
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

type VoiceSlot = {
  playPath: string;
  item: {
    title: string | null;
    duration_seconds: number | null;
    lang_code: string;
  };
};

type ReportItem = {
  id: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  report_type: string | null;
  lang_code: string | null;
  market_date: string | null;
  tags: unknown;
  countries: unknown;
  regions: unknown;
  metadata: unknown;
};

type DaySlot = {
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  seriesTabLabel: string;
  brief: BriefItem | null;
  voice: VoiceSlot | null;
  report: ReportItem | null;
};

type MarketDayResponse = {
  ok?: boolean;
  slots?: DaySlot[];
  message?: string;
};

const TABS = [
  { id: "brief", label: "30초 브리프" },
  { id: "for-you", label: "나를 위한 요약" },
  { id: "full", label: "전문" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

export default function ReportSurface({ page }: { page: ReportPage }) {
  const params = new URLSearchParams(window.location.search);
  const langOverride = params.get("lang");
  const dateParam = params.get("date")?.trim();
  const tabParam = params.get("tab");
  /** Initial `?series=` only — later tab clicks own selection via state. */
  const seriesSlugFromUrlRef = useRef(params.get("series")?.trim() || null);

  const [lang, setLang] = useState<ContentLang | null>(
    isContentLang(langOverride) ? langOverride : null,
  );
  /** Catalog row for the path slug — missing → hard error. */
  const [pageSeries, setPageSeries] = useState<ReportSeriesRow | null>(null);
  /** Path + companion series that exist in the catalog. */
  const [pageSeriesRows, setPageSeriesRows] = useState<ReportSeriesRow[]>([]);
  const [seriesResolved, setSeriesResolved] = useState(false);
  const [date, setDate] = useState<string | null>(
    dateParam && isMarketDateYmd(dateParam) ? dateParam : null,
  );
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [daySlots, setDaySlots] = useState<DaySlot[]>([]);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [tab, setTab] = useState<TabId>(isTabId(tabParam) ? tabParam : "brief");
  const [topicLabelMap, setTopicLabelMap] = useState<Record<
    string,
    string
  > | null>(null);
  const [pendingAsk, setPendingAsk] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Topic chip → chat. Opening the panel is part of the action; a prompt
  // sent into a hidden column would look like nothing happened.
  const askInChat = (text: string) => {
    setChatOpen(true);
    setPendingAsk({ text, nonce: Date.now() });
  };

  // Shareable depth tab — and the depth survives date / series navigation.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "brief") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

  // Shareable series slot when the page hosts more than one slug.
  useEffect(() => {
    const url = new URL(window.location.href);
    const active = daySlots.find((s) => s.seriesId === activeSeriesId);
    if (!active || daySlots.length <= 1) {
      url.searchParams.delete("series");
    } else {
      url.searchParams.set("series", active.seriesSlug);
    }
    window.history.replaceState(null, "", url);
  }, [activeSeriesId, daySlots]);

  const calendarToday = seoulYmd();

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    name: DEFAULT_INSTANCE_NAME,
  });

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
    const wanted = reportPageSeriesSlugs(page);
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
        const bySlug = new Map(body.items.map((row) => [row.slug, row]));
        const rows = wanted
          .map((slug) => bySlug.get(slug))
          .filter((row): row is ReportSeriesRow => Boolean(row));
        setPageSeries(bySlug.get(page.slug) ?? null);
        setPageSeriesRows(rows);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPageSeries(null);
        setPageSeriesRows([]);
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      })
      .finally(() => {
        if (active) setSeriesResolved(true);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const seriesIdsKey = pageSeriesRows.map((r) => r.id).join(",");

  // The setters are listed because React Compiler infers them as deps and
  // refuses to compile the component otherwise; they are stable, so this is
  // still the `[]` callback the load effect below needs.
  const loadDay = useCallback(
    async (seriesIds: string[], marketDate: string, marketLang: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          date: marketDate,
          lang: marketLang,
        });
        for (const id of seriesIds) qs.append("series_id", id);
        const res = await fetch(`/api/market/day?${qs}`);
        const json = (await res.json()) as MarketDayResponse;
        if (!res.ok && !json.ok) {
          throw new Error(json.message || `market/day HTTP ${res.status}`);
        }
        const slots = json.slots ?? [];
        setDaySlots(slots);
        setActiveSeriesId((prev) => {
          if (prev && slots.some((s) => s.seriesId === prev)) return prev;
          const want = seriesSlugFromUrlRef.current;
          if (want) {
            const bySlug = slots.find((s) => s.seriesSlug === want);
            if (bySlug) return bySlug.seriesId;
          }
          // Prefer the path slug when both daily + weekly publish that day.
          const primary = slots.find((s) => s.seriesSlug === page.slug);
          return primary?.seriesId ?? slots[0]?.seriesId ?? null;
        });
      } catch (err) {
        setDaySlots([]);
        setActiveSeriesId(null);
        setError(err instanceof Error ? err.message : "Failed to load day");
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setDaySlots, setActiveSeriesId, page.slug],
  );

  // Newest published day across path + companion series — also the initial date.
  useEffect(() => {
    if (pageSeriesRows.length === 0 || !lang) return;
    let active = true;
    const qs = new URLSearchParams({ lang });
    for (const row of pageSeriesRows) qs.append("series_id", row.id);
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
  }, [seriesIdsKey, lang, pageSeriesRows]);

  useEffect(() => {
    if (pageSeriesRows.length === 0 || !lang || !date) return;
    void loadDay(
      pageSeriesRows.map((r) => r.id),
      date,
      lang,
    );
  }, [seriesIdsKey, lang, date, loadDay, pageSeriesRows]);

  // Chat's Market scope is a single setting shared with the panel's tab.
  // Pin it to the slot on screen so answers cite that report.
  useEffect(() => {
    if (!activeSeriesId) return;
    void agent.stub
      .updateSettings({ market_focus_series_id: activeSeriesId })
      .catch(() => {
        // Chat still works, it just falls back to the panel's last tab.
      });
  }, [activeSeriesId, agent.stub]);

  // Same body-grounded map Topics uses — metadata.tags.core often has no
  // label_ko, so the header would otherwise show raw slugs.
  useEffect(() => {
    if (!lang) return;
    let active = true;
    void fetchTopicLabels(undefined, lang)
      .then((map) => {
        if (active) setTopicLabelMap(map);
      })
      .catch(() => {
        if (active) setTopicLabelMap(null);
      });
    return () => {
      active = false;
    };
  }, [lang]);

  const activeSlot =
    daySlots.find((s) => s.seriesId === activeSeriesId) ?? daySlots[0] ?? null;
  const brief = activeSlot?.brief ?? null;
  const voice = activeSlot?.voice ?? null;
  const report = activeSlot?.report ?? null;

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
  const title =
    activeSlot?.seriesTitle ?? pageSeries?.title ?? page.fallbackTitle;
  const hasReport = Boolean(report?.content?.trim());
  const headline = brief?.title ?? report?.title ?? title;
  const tagLexicon = report ? buildTagLexicon(report.metadata) : null;
  const tags = Array.isArray(report?.tags)
    ? report.tags.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      )
    : [];
  // Tabs are depths of the same day; without a report only the brief exists.
  const activeTab: TabId = hasReport ? tab : "brief";
  const metaKind =
    activeTab === "full"
      ? (report?.report_type ?? "full-report")
      : activeTab === "for-you"
        ? "for-you"
        : (brief?.brief_type ?? null);
  const metaDate =
    activeTab === "full"
      ? (report?.market_date ?? brief?.market_date ?? date)
      : (brief?.market_date ?? date);
  const metaLang =
    activeTab === "full"
      ? (report?.lang_code ?? brief?.lang_code ?? lang)
      : (brief?.lang_code ?? lang);
  const emptyLoading = loading && !brief && !hasReport && daySlots.length === 0;

  // Full report is long — surface a back-to-top once the reader has scrolled
  // past the voice/tabs chrome. Other tabs stay short enough without it.
  useEffect(() => {
    const el = mainRef.current;
    if (!el || activeTab !== "full") {
      setShowScrollTop(false);
      return;
    }
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > 480);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeTab, date]);

  return (
    <div className="report-warm flex h-full bg-background text-foreground">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-6 py-3">
            <a
              href="/"
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title="Back to home"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Home
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
            {!chatOpen ? (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1",
                  "text-[11px] font-semibold text-primary-foreground hover:opacity-90",
                )}
                title="Ask about this report"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Ask
              </button>
            ) : null}
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
              disabled={loading || pageSeriesRows.length === 0 || !date || !lang}
              onClick={() => {
                if (pageSeriesRows.length > 0 && date && lang) {
                  void loadDay(
                    pageSeriesRows.map((r) => r.id),
                    date,
                    lang,
                  );
                }
              }}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>

          {daySlots.length > 1 ? (
            <div
              className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-6 pb-3"
              role="tablist"
              aria-label="Reports for this day"
            >
              {daySlots.map((slot) => {
                const selected = slot.seriesId === activeSeriesId;
                return (
                  <button
                    key={slot.seriesId}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveSeriesId(slot.seriesId)}
                    className={cn(
                      "max-w-44 shrink-0 truncate rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    title={slot.seriesTitle}
                  >
                    {slot.seriesTabLabel || slot.seriesTitle}
                  </button>
                );
              })}
            </div>
          ) : null}
        </header>

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
          <article className="mx-auto w-full max-w-3xl px-6 py-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              {page.eyebrow}
            </p>

            {!seriesResolved || !lang || emptyLoading ? (
              <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading…
              </div>
            ) : !pageSeries ? (
              <Notice title="Series not in the catalog">
                <code className="font-mono">{page.slug}</code> is missing from{" "}
                <code className="font-mono">report_series</code>. Check Supabase
                or the slug in <code className="font-mono">report-pages.ts</code>.
              </Notice>
            ) : !brief && !hasReport ? (
              <Notice title="Nothing published for this day">
                No market-issues brief/report for{" "}
                <span className="font-mono text-foreground">{date}</span> /{" "}
                <span className="font-mono text-foreground">{lang}</span>
                {pageSeriesRows.length > 1 ? (
                  <>
                    {" "}
                    across{" "}
                    <span className="font-mono text-foreground">
                      {pageSeriesRows.map((r) => r.slug).join(", ")}
                    </span>
                  </>
                ) : null}
                . Newest published day is usually{" "}
                <span className="font-mono text-foreground">{effectiveLatest}</span>.
              </Notice>
            ) : (
              <>
                <h1 className="mt-3 text-4xl font-extrabold leading-[1.15] tracking-[-0.02em] text-balance">
                  {headline}
                </h1>

                <p className="mt-4 font-mono text-[11px] tracking-wide text-muted-foreground">
                  {[metaDate, metaKind, metaLang].filter(Boolean).join(" · ")}
                </p>

                {/* What the day is about, at a glance. The starrable chips
                    live in the For-you tab where they change something. */}
                {tags.length > 0 ? (
                  <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {tags.map((tag) => (
                      <span key={tag} className="whitespace-nowrap">
                        #{topicDisplayLabel(tag, tagLexicon, topicLabelMap)}
                      </span>
                    ))}
                  </p>
                ) : null}

                {/* Above the tabs on purpose — voice belongs to the day, not
                    to one depth, and switching tabs would stop playback. */}
                {voice ? <VoicePlayer voice={voice} /> : null}

                <TabBar
                  active={activeTab}
                  onSelect={setTab}
                  disabled={hasReport ? null : "full report not published"}
                />

                {activeTab === "full" ? (
                  <ReportFullText content={report?.content ?? ""} />
                ) : activeTab === "for-you" ? (
                  activeSlot && date && lang ? (
                    <ReportForYou
                      seriesId={activeSlot.seriesId}
                      marketDate={date}
                      lang={lang}
                      report={report}
                      onAsk={askInChat}
                    />
                  ) : null
                ) : (
                  <BriefBody
                    lead={lead}
                    highlights={highlights}
                    reactions={parts.reactions}
                    takeaway={parts.takeaway}
                  />
                )}
              </>
            )}

            {error ? (
              <p className="mt-8 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </article>
        </main>

        {showScrollTop ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
            <div className="relative w-full max-w-3xl">
              <button
                type="button"
                onClick={() => {
                  mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  // Sit in the gutter just past the article — not on the glyphs,
                  // and not against the far column edge.
                  "pointer-events-auto absolute bottom-0 left-full ml-3",
                  "flex h-10 w-10 items-center justify-center",
                  "rounded-full border border-border bg-card text-foreground shadow-md",
                  "hover:border-primary/40 hover:text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                title="맨 위로"
                aria-label="맨 위로"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {chatOpen ? (
        <aside
          className={cn(
            "flex flex-col border-border bg-background",
            // Narrow viewports have no room for two columns — slide the
            // chat over the article instead of squeezing it.
            "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30",
            "max-lg:w-full max-lg:max-w-sm max-lg:border-l max-lg:shadow-2xl",
            "lg:w-104 lg:shrink-0 lg:border-l",
          )}
        >
          <ReportChat
            agent={agent}
            marketDate={date}
            pendingAsk={pendingAsk}
            onPendingAskConsumed={() => setPendingAsk(null)}
            onClose={() => setChatOpen(false)}
          />
        </aside>
      ) : null}
    </div>
  );
}

function TabBar({
  active,
  onSelect,
  disabled,
}: {
  active: TabId;
  onSelect: (tab: TabId) => void;
  /** Reason the report-backed tabs are off, or null when they work. */
  disabled: string | null;
}) {
  return (
    <div className="mt-8 flex gap-5 border-b border-border">
      {TABS.map((t) => {
        const off = disabled != null && t.id !== "brief";
        return (
          <button
            key={t.id}
            type="button"
            disabled={off}
            title={off ? disabled : undefined}
            onClick={() => onSelect(t.id)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-[13px] font-semibold tracking-tight",
              active === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              off && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function BriefBody({
  lead,
  highlights,
  reactions,
  takeaway,
}: {
  lead: string[];
  highlights: Array<{ headline: string; body: string[] }>;
  reactions: Array<{
    label: string;
    value: string;
    direction: "up" | "down" | null;
  }>;
  takeaway: string | null;
}) {
  return (
    <>
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

      {reactions.length > 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            Market reaction
          </p>
          <dl className="mt-3 divide-y divide-border">
            {reactions.map((reaction, i) => (
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

      {takeaway ? (
        <div className="mt-4 rounded-xl bg-foreground px-5 py-5 text-background">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            Takeaway
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7">
            {takeaway}
          </p>
        </div>
      ) : null}
    </>
  );
}

function VoicePlayer({ voice }: { voice: VoiceSlot }) {
  const { playPath, item } = voice;
  const duration =
    item.duration_seconds != null ? `${item.duration_seconds}s` : null;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
          Listen
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {[duration, item.lang_code].filter(Boolean).join(" · ")}
        </span>
      </div>
      <audio className="mt-2.5 w-full" controls preload="metadata" src={playPath}>
        <a href={playPath} target="_blank" rel="noreferrer">
          Download MP3
        </a>
      </audio>
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
