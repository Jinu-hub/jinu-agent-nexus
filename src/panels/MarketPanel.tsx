// ─────────────────────────────────────────────────────────────────────────
// MarketPanel — Market Memory brief + voice + full report for a Seoul day
// ─────────────────────────────────────────────────────────────────────────
// Fetches existing HTTP APIs (no ChatAgent State). Language comes from
// Settings content_lang — independent of chat reply language.
//
// Publishing is a daily batch (~22:30 UTC). "Latest" is the newest
// market_date that actually has a final brief (GET /api/briefs/latest-date),
// not blindly Seoul yesterday — weekends/holidays often have no US-market row.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Check,
  FileText,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Tags,
  Volume2,
} from "lucide-react";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { MARKET_SUGGESTIONS } from "@/lib/market-suggestions";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";
import {
  ReportArticle,
  ReportKeywordChips,
  ReportReaderModal,
  ReportToc,
  SHOW_REPORT_TOPIC_CHIPS,
  SHOW_TOPIC_CHIP_ASK,
  SHOW_TOPIC_CHIP_STAR,
  SHOW_TOPICS_SECTION,
  extractReportSections,
  hasTopKeywords,
  jumpToSection,
} from "./ReportReader";
import { MyInterestsFold, SHOW_MY_INTERESTS } from "./MyInterestsFold";
import { BriefForYou, SHOW_BRIEF_FOR_YOU } from "./BriefForYou";
import {
  collectReportPreferenceKeys,
  fetchPreferences,
  isPreferenceSaved,
  mapTopicToPreference,
  removeInterest,
  saveInterest,
  type PreferenceRow,
  type TopicPreferenceSource,
} from "@/lib/topic-preference";

type BriefItem = {
  id: string;
  title: string | null;
  content: string | null;
  brief_type: string;
  content_type: string;
  lang_code: string;
  status: string;
  market_date: string | null;
  target_id?: string | null;
  metadata: unknown;
};

type VoiceItem = {
  id: string;
  title: string | null;
  duration_seconds: number | null;
  lang_code: string;
  status: string;
  market_date: string | null;
};

type ReportItem = {
  id: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  lang_code: string | null;
  market_date: string | null;
  report_type: string | null;
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
};

type BriefResponse = {
  ok: boolean;
  found?: boolean;
  marketDate?: string;
  lang?: string;
  item?: BriefItem | null;
  message?: string;
};

type VoiceResponse = {
  ok: boolean;
  found?: boolean;
  marketDate?: string;
  lang?: string;
  playPath?: string | null;
  item?: VoiceItem | null;
  message?: string;
};

type ReportResponse = {
  ok: boolean;
  found?: boolean;
  marketDate?: string;
  lang?: string;
  targetId?: string | null;
  item?: ReportItem | null;
  message?: string;
};

function seoulYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return seoulYmd(anchor);
}

/** Calendar Seoul yesterday — fallback only until /api/briefs/latest-date loads. */
function calendarYesterdayYmd(now: Date = new Date()): string {
  return shiftYmd(seoulYmd(now), -1);
}

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function cacheKey(marketDate: string, marketLang: string): string {
  return `${marketDate}|${marketLang}`;
}

function EmptyHint({
  kind,
  date,
  lang,
  calendarToday,
  expectedLatest,
  onOpenLatest,
}: {
  kind: "voice" | "brief" | "report";
  date: string;
  lang: string;
  calendarToday: string;
  expectedLatest: string;
  onOpenLatest: () => void;
}) {
  const isCalendarToday = date === calendarToday;
  const isExpectedLatest = date === expectedLatest;
  const label =
    kind === "voice" ? "voice" : kind === "brief" ? "brief" : "full report";

  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
      {isCalendarToday ? (
        <p>
          No {label} for calendar today ({date} / {lang}). Daily batch runs
          around <span className="font-mono">22:30 UTC</span>, so today&apos;s
          market_date is usually published tomorrow. Newest is typically{" "}
          <span className="font-mono text-foreground">{expectedLatest}</span>.
        </p>
      ) : isExpectedLatest ? (
        <p>
          No completed {label} for expected latest ({date} / {lang}). The
          pipeline may still be running after{" "}
          <span className="font-mono">~22:30 UTC</span>.
        </p>
      ) : (
        <p>
          No completed {label} for {date} / {lang}.
        </p>
      )}
      {!isExpectedLatest && (
        <button
          type="button"
          onClick={onOpenLatest}
          className={cn(
            "rounded-md border border-border bg-background px-2 py-1",
            "font-mono text-[10px] text-foreground",
            "hover:bg-accent",
          )}
        >
          Open latest · {expectedLatest}
        </button>
      )}
    </div>
  );
}

/** Collapse only when content exists; empty states stay always-open (no toggle). */
function MarketSection({
  icon: Icon,
  title,
  collapsible,
  open,
  onToggle,
  summary,
  trailing,
  children,
}: {
  icon: typeof Volume2;
  title: string;
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  summary?: string | null;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const titleRow = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="text-xs font-medium">{title}</p>
      {collapsible && !open && summary ? (
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {summary}
        </span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {collapsible && (
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      )}
    </>
  );

  return (
    <div className="paper-inset px-3 py-2.5">
      <div
        className={cn(
          "flex items-center gap-1",
          (open || !collapsible) && "mb-2",
        )}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            {titleRow}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {titleRow}
          </div>
        )}
        {trailing}
      </div>
      {(!collapsible || open) && children}
    </div>
  );
}

export function MarketPanel({
  contentLang,
  onAskInChat,
}: {
  contentLang: ContentLang | null;
  /** Send a Market Memory example prompt into the left chat. */
  onAskInChat?: (prompt: string) => void;
}) {
  const lang = contentLang ?? "ko";
  const calendarToday = seoulYmd();
  const calendarYesterday = calendarYesterdayYmd();
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [latestLoading, setLatestLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [voice, setVoice] = useState<VoiceResponse | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportCacheKey, setReportCacheKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<"brief" | "report" | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [topicsLoadKey, setTopicsLoadKey] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [interestsOnly, setInterestsOnly] = useState(false);
  const reportScrollRef = useRef<HTMLDivElement>(null);
  const helpWrapRef = useRef<HTMLDivElement>(null);

  const invalidateReport = useCallback(() => {
    setReport(null);
    setReportCacheKey(null);
    setTopicsLoadKey(null);
    setReportOpen(false);
    setReportModalOpen(false);
  }, []);

  const loadPreferences = useCallback(async () => {
    if (!SHOW_MY_INTERESTS && !SHOW_TOPIC_CHIP_STAR && !SHOW_BRIEF_FOR_YOU) {
      return;
    }
    setPreferencesLoading(true);
    try {
      setPreferences(await fetchPreferences());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load interests",
      );
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  const toggleInterest = useCallback(async (source: TopicPreferenceSource) => {
    const mapped = mapTopicToPreference(source);
    if (!mapped) return;
    const saved = isPreferenceSaved(
      preferences,
      mapped.kind,
      mapped.target,
    );
    try {
      if (saved) {
        await removeInterest(mapped.kind, mapped.target);
        setPreferences((prev) =>
          prev.filter(
            (p) =>
              !(
                p.kind === mapped.kind &&
                p.target.trim().toLowerCase() ===
                  mapped.target.trim().toLowerCase()
              ),
          ),
        );
      } else {
        const row = await saveInterest(mapped.kind, mapped.target);
        setPreferences((prev) => {
          const without = prev.filter(
            (p) =>
              !(
                p.kind === row.kind &&
                p.target.trim().toLowerCase() ===
                  row.target.trim().toLowerCase()
              ),
          );
          return [row, ...without];
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update interest",
      );
    }
  }, [preferences]);

  const removeInterestRow = useCallback(async (row: PreferenceRow) => {
    try {
      await removeInterest(row.kind, row.target);
      setPreferences((prev) =>
        prev.filter(
          (p) =>
            !(
              p.kind === row.kind &&
              p.target.trim().toLowerCase() === row.target.trim().toLowerCase()
            ),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove interest",
      );
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const loadReport = useCallback(
    async (marketDate: string, marketLang: string) => {
      const key = cacheKey(marketDate, marketLang);
      setReportLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          date: marketDate,
          lang: marketLang,
        });
        const res = await fetch(`/api/reports/today?${qs}`);
        const json = (await res.json()) as ReportResponse;
        if (!res.ok && !json.ok) {
          throw new Error(json.message || `reports HTTP ${res.status}`);
        }
        setReport(json);
        setReportCacheKey(key);
        return json;
      } catch (err) {
        setReport(null);
        setReportCacheKey(null);
        setError(
          err instanceof Error ? err.message : "Failed to load full report",
        );
        return null;
      } finally {
        setReportLoading(false);
      }
    },
    [],
  );

  const loadLatestDate = useCallback(async (marketLang: string) => {
    setLatestLoading(true);
    try {
      const qs = new URLSearchParams({ lang: marketLang });
      const res = await fetch(`/api/briefs/latest-date?${qs}`);
      const json = (await res.json()) as {
        ok?: boolean;
        found?: boolean;
        marketDate?: string | null;
        seoulYesterday?: string;
        message?: string;
      };
      if (!res.ok && !json.ok) {
        throw new Error(json.message || `latest-date HTTP ${res.status}`);
      }
      const next =
        json.found && typeof json.marketDate === "string"
          ? json.marketDate
          : (json.seoulYesterday ?? calendarYesterdayYmd());
      setLatestDate(next);
      setDate((prev) => prev ?? next);
    } catch (err) {
      const fallback = calendarYesterdayYmd();
      setLatestDate(fallback);
      setDate((prev) => prev ?? fallback);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to resolve latest market_date",
      );
    } finally {
      setLatestLoading(false);
    }
  }, []);

  const load = useCallback(
    async (marketDate: string, marketLang: string) => {
      setLoading(true);
      setError(null);
      invalidateReport();
      try {
        const qs = new URLSearchParams({
          date: marketDate,
          lang: marketLang,
        });
        const [briefRes, voiceRes] = await Promise.all([
          fetch(`/api/briefs/today?${qs}`),
          fetch(`/api/audio/today?${qs}`),
        ]);
        const briefJson = (await briefRes.json()) as BriefResponse;
        const voiceJson = (await voiceRes.json()) as VoiceResponse;

        if (!briefRes.ok && !briefJson.ok) {
          throw new Error(briefJson.message || `briefs HTTP ${briefRes.status}`);
        }
        if (!voiceRes.ok && !voiceJson.ok) {
          throw new Error(voiceJson.message || `audio HTTP ${voiceRes.status}`);
        }

        setBrief(briefJson);
        setVoice(voiceJson);
      } catch (err) {
        setBrief(null);
        setVoice(null);
        setError(
          err instanceof Error ? err.message : "Failed to load Market Memory",
        );
      } finally {
        setLoading(false);
      }
    },
    [invalidateReport],
  );

  useEffect(() => {
    setDate(null);
    void loadLatestDate(lang);
  }, [lang, loadLatestDate]);

  useEffect(() => {
    if (!date) return;
    void load(date, lang);
  }, [date, lang, load]);

  const briefItem = brief?.found ? brief.item : null;
  const voiceItem = voice?.found ? voice.item : null;
  const playPath =
    voice?.found && typeof voice.playPath === "string" ? voice.playPath : null;
  const reportCached =
    date !== null && reportCacheKey === cacheKey(date, lang);
  const reportItem =
    reportCached && report?.found ? (report.item ?? null) : null;
  const hasReportCandidate = Boolean(briefItem?.target_id);
  const hasReport = Boolean(reportItem?.content);
  const reportKeys =
    hasReport && reportItem
      ? collectReportPreferenceKeys(reportItem)
      : null;
  const reportCheckedMissing =
    reportCached && report !== null && !report.found;

  const copyText = async (
    which: "brief" | "report",
    title: string | null | undefined,
    content: string | null | undefined,
  ) => {
    if (!content) return;
    const text = [title, content].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Clipboard copy failed");
    }
  };

  const pulse = metaString(briefItem?.metadata, "pulse");
  const takeaway = metaString(briefItem?.metadata, "takeaway");
  const effectiveLatest = latestDate ?? calendarYesterday;
  const showingExpectedLatest = date !== null && date === effectiveLatest;
  const openLatest = () => setDate(effectiveLatest);
  const hasVoice = Boolean(voiceItem && playPath);
  const hasBrief = Boolean(briefItem);

  // New day → Brief starts expanded; Voice / Topics / Report stay collapsed.
  useEffect(() => {
    setVoiceOpen(false);
    setTopicsOpen(false);
    setReportOpen(false);
    setInterestsOnly(false);
    if (hasBrief) setBriefOpen(true);
  }, [date, lang, hasBrief]);

  // Topics reads tags from item_contents — reuse report fetch (no personalization yet).
  useEffect(() => {
    if (!SHOW_TOPICS_SECTION || !SHOW_REPORT_TOPIC_CHIPS) return;
    if (!topicsOpen || !date || !hasReportCandidate) return;
    const key = cacheKey(date, lang);
    if (reportCacheKey === key || topicsLoadKey === key || reportLoading) return;
    setTopicsLoadKey(key);
    void loadReport(date, lang);
  }, [
    topicsOpen,
    date,
    lang,
    hasReportCandidate,
    reportCacheKey,
    topicsLoadKey,
    reportLoading,
    loadReport,
  ]);

  const toggleTopics = () => {
    if (!date) return;
    setTopicsOpen((wasOpen) => {
      const next = !wasOpen;
      if (
        next &&
        hasReportCandidate &&
        reportCacheKey !== cacheKey(date, lang) &&
        !reportLoading
      ) {
        setTopicsLoadKey(cacheKey(date, lang));
        void loadReport(date, lang);
      }
      return next;
    });
  };

  const toggleReport = () => {
    if (!date) return;
    setReportOpen((wasOpen) => {
      const next = !wasOpen;
      if (next && reportCacheKey !== cacheKey(date, lang) && !reportLoading) {
        void loadReport(date, lang);
      }
      return next;
    });
  };

  /** Load report if needed, expand section, open wide reader. */
  const openReportReader = useCallback(async () => {
    if (!date) return;
    setReportOpen(true);
    let item =
      reportCacheKey === cacheKey(date, lang) && report?.found
        ? report.item
        : null;
    if (!item?.content) {
      const json = await loadReport(date, lang);
      item = json?.found ? (json.item ?? null) : null;
    }
    if (item?.content) setReportModalOpen(true);
  }, [date, lang, loadReport, report, reportCacheKey]);

  const reportCollapsedSummary =
    reportItem?.title ??
    (hasReportCandidate ? "Tap to load full report" : null);

  const reportSections = reportItem?.content
    ? extractReportSections(reportItem.content)
    : [];
  const reportMeta = reportItem
    ? [
        reportItem.report_type ?? "digest-report",
        reportItem.lang_code,
        reportItem.market_date,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const reportDateMismatch =
    reportItem?.market_date && reportItem.market_date !== date
      ? `Report market_date ${reportItem.market_date} ≠ panel ${date}`
      : null;

  useEffect(() => {
    if (!helpOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!helpWrapRef.current?.contains(event.target as Node)) {
        setHelpOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [helpOpen]);

  return (
    <section>
      <PanelHeader
        icon={Newspaper}
        title="Market"
        trailing={
          <div className="flex items-center gap-1.5">
            <div
              ref={helpWrapRef}
              className="relative"
              onMouseEnter={() => setHelpOpen(true)}
              onMouseLeave={() => setHelpOpen(false)}
            >
              <button
                type="button"
                aria-expanded={helpOpen}
                aria-label="Market panel help"
                onClick={() => setHelpOpen((v) => !v)}
                className={cn(
                  "rounded-md p-1 text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-foreground",
                  helpOpen && "bg-accent text-foreground",
                )}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
              {helpOpen ? (
                <div
                  role="tooltip"
                  className={cn(
                    "absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-border",
                    "bg-background px-2.5 py-2 shadow-md",
                  )}
                >
                  <div className="space-y-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    <p>
                      Language follows Settings → Market content language. Not
                      chat reply language.
                    </p>
                    <p>
                      Latest = newest day with a final brief (not always Seoul
                      yesterday — weekends/holidays may be empty)
                      {showingExpectedLatest && date ? (
                        <>
                          {" "}
                          · showing{" "}
                          <span className="font-mono text-foreground">
                            {date}
                          </span>
                        </>
                      ) : null}
                      .
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {lang}
            </span>
            <button
              type="button"
              disabled={loading || latestLoading}
              onClick={() => {
                void loadLatestDate(lang);
                void loadPreferences();
                if (date) void load(date, lang);
              }}
              className={cn(
                "rounded-md p-1 text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title="Refresh"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  (loading || latestLoading) && "animate-spin",
                )}
              />
            </button>
          </div>
        }
      />

      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          disabled={loading || !date}
          onClick={() => setDate((d) => (d ? shiftYmd(d, -1) : d))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date ?? ""}
          disabled={loading || latestLoading || !date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5",
            "font-mono text-xs tabular-nums",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50",
          )}
        />
        <button
          type="button"
          disabled={loading || !date}
          onClick={() => setDate((d) => (d ? shiftYmd(d, 1) : d))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={loading || latestLoading || showingExpectedLatest}
          onClick={openLatest}
          className={cn(
            "rounded-md px-2 py-1 text-[11px]",
            showingExpectedLatest
              ? "cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={`Newest market_date with a final brief · ${effectiveLatest}`}
        >
          Latest
        </button>
        <button
          type="button"
          disabled={loading || !date || date === calendarToday}
          onClick={() => setDate(calendarToday)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] text-muted-foreground",
            "hover:bg-accent hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
          title="Seoul calendar today (often not published yet)"
        >
          Today
        </button>
      </div>

      {(latestLoading && !date) || (loading && !brief && !voice) ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Loading…
        </div>
      ) : date ? (
        <div className="space-y-3">
          {hasBrief ? (
            <BriefForYou
              preferences={preferences}
              pulse={pulse}
              takeaway={takeaway}
              content={briefItem!.content}
            />
          ) : null}
          <MarketSection
            icon={Newspaper}
            title="Brief"
            collapsible={hasBrief}
            open={briefOpen}
            onToggle={() => setBriefOpen((v) => !v)}
            summary={briefItem?.title}
            trailing={
              <div className="flex items-center gap-1">
                {hasReportCandidate ? (
                  <button
                    type="button"
                    disabled={reportLoading}
                    onClick={() => void openReportReader()}
                    className={cn(
                      "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]",
                      "text-muted-foreground hover:bg-accent hover:text-foreground",
                      "disabled:opacity-50",
                    )}
                    title="Open full report reader"
                  >
                    Report
                  </button>
                ) : null}
                {briefItem?.content ? (
                  <button
                    type="button"
                    onClick={() =>
                      void copyText("brief", briefItem.title, briefItem.content)
                    }
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Copy title + content"
                  >
                    {copied === "brief" ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null}
              </div>
            }
          >
            {hasBrief ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-[11px] font-medium leading-snug">
                    {briefItem!.title ?? "Untitled brief"}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {briefItem!.brief_type} · {briefItem!.lang_code}
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
                  {briefItem!.content}
                </div>
              </div>
            ) : (
              <EmptyHint
                kind="brief"
                date={date}
                lang={lang}
                calendarToday={calendarToday}
                expectedLatest={effectiveLatest}
                onOpenLatest={openLatest}
              />
            )}
          </MarketSection>

          <MarketSection
            icon={Volume2}
            title="Voice"
            collapsible={hasVoice}
            open={voiceOpen}
            onToggle={() => setVoiceOpen((v) => !v)}
            summary={voiceItem?.title}
            trailing={
              briefItem && !voiceItem ? (
                <span className="text-[10px] text-muted-foreground">
                  Brief ready · Voice pending
                </span>
              ) : null
            }
          >
            {hasVoice ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-snug text-foreground">
                  {voiceItem!.title ?? "Voice briefing"}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {voiceItem!.duration_seconds != null
                    ? `${voiceItem!.duration_seconds}s`
                    : "—"}
                  {" · "}
                  {voiceItem!.lang_code}
                </p>
                <audio
                  className="w-full"
                  controls
                  preload="metadata"
                  src={playPath!}
                >
                  <a href={playPath!} target="_blank" rel="noreferrer">
                    Download MP3
                  </a>
                </audio>
              </div>
            ) : (
              <EmptyHint
                kind="voice"
                date={date}
                lang={lang}
                calendarToday={calendarToday}
                expectedLatest={effectiveLatest}
                onOpenLatest={openLatest}
              />
            )}
          </MarketSection>

          {SHOW_TOPICS_SECTION && SHOW_REPORT_TOPIC_CHIPS ? (
            <MarketSection
              icon={Tags}
              title="Topics"
              collapsible={hasReportCandidate || hasReport}
              open={topicsOpen}
              onToggle={toggleTopics}
              summary={
                hasReport
                  ? "tags + rotated keywords"
                  : hasReportCandidate
                    ? "From full report"
                    : null
              }
            >
              {topicsOpen && reportLoading && !hasReport ? (
                <div className="space-y-3">
                  {SHOW_MY_INTERESTS ? (
                    <MyInterestsFold
                      preferences={preferences}
                      loading={preferencesLoading}
                      onRemove={removeInterestRow}
                      reportKeys={reportKeys}
                      interestsOnly={interestsOnly}
                      onInterestsOnlyChange={setInterestsOnly}
                    />
                  ) : null}
                  <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Loading topics…
                  </div>
                </div>
              ) : hasReport ? (
                <div className="space-y-3">
                  {SHOW_MY_INTERESTS ? (
                    <MyInterestsFold
                      preferences={preferences}
                      loading={preferencesLoading}
                      onRemove={removeInterestRow}
                      reportKeys={reportKeys}
                      interestsOnly={interestsOnly}
                      onInterestsOnlyChange={setInterestsOnly}
                    />
                  ) : null}
                  {hasTopKeywords(reportItem!) ? (
                    <ReportKeywordChips
                      tags={reportItem!.tags}
                      countries={reportItem!.countries}
                      regions={reportItem!.regions}
                      metadata={reportItem!.metadata}
                      marketDate={date}
                      onAsk={onAskInChat}
                      preferences={preferences}
                      onToggleInterest={toggleInterest}
                      interestsOnly={interestsOnly}
                    />
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      No keywords on this report.
                    </p>
                  )}
                  {(onAskInChat && SHOW_TOPIC_CHIP_ASK) ||
                  SHOW_TOPIC_CHIP_STAR ? (
                    <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                      {onAskInChat && SHOW_TOPIC_CHIP_ASK
                        ? "Tap a keyword to ask in chat"
                        : null}
                      {onAskInChat &&
                      SHOW_TOPIC_CHIP_ASK &&
                      SHOW_TOPIC_CHIP_STAR
                        ? " · "
                        : null}
                      {SHOW_TOPIC_CHIP_STAR
                        ? "Star to save an interest"
                        : null}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  {SHOW_MY_INTERESTS ? (
                    <MyInterestsFold
                      preferences={preferences}
                      loading={preferencesLoading}
                      onRemove={removeInterestRow}
                      reportKeys={reportKeys}
                      interestsOnly={interestsOnly}
                      onInterestsOnlyChange={setInterestsOnly}
                    />
                  ) : null}
                  {reportCheckedMissing && hasBrief ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      No report keywords for this day / language.
                    </p>
                  ) : hasReportCandidate ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Expand to load keywords from the full report.
                    </p>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Keywords appear when a full report is linked to the brief.
                    </p>
                  )}
                </div>
              )}
            </MarketSection>
          ) : null}

          <MarketSection
            icon={FileText}
            title="Report"
            collapsible={hasReportCandidate || hasReport}
            open={reportOpen}
            onToggle={toggleReport}
            summary={reportCollapsedSummary}
            trailing={
              <div className="flex items-center gap-0.5">
                {hasReportCandidate || hasReport ? (
                  <button
                    type="button"
                    disabled={reportLoading}
                    onClick={() => void openReportReader()}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                    title="Open wide reader"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {hasReport ? (
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        "report",
                        reportItem!.title,
                        reportItem!.content,
                      )
                    }
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Copy title + full report"
                  >
                    {copied === "report" ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null}
              </div>
            }
          >
            {reportOpen && reportLoading ? (
              <div className="flex items-center gap-2 py-3 text-[11px] text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                Loading full report…
              </div>
            ) : hasReport ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium leading-snug">
                  {reportItem!.title ?? "Untitled report"}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {reportMeta}
                </p>
                {reportDateMismatch ? (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">
                    {reportDateMismatch}
                  </p>
                ) : null}
                {reportItem!.summary ? (
                  <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {reportItem!.summary}
                  </p>
                ) : null}
                <ReportToc
                  sections={reportSections}
                  onJump={(id) =>
                    jumpToSection(reportScrollRef.current, id)
                  }
                />
                <ReportArticle
                  content={reportItem!.content!}
                  sections={reportSections}
                  scrollRef={reportScrollRef}
                  compact
                  className="max-h-64"
                />
                <button
                  type="button"
                  onClick={() => void openReportReader()}
                  className={cn(
                    "w-full rounded-md border border-border bg-background px-2 py-1.5",
                    "text-[10px] text-muted-foreground",
                    "hover:border-foreground/30 hover:bg-accent hover:text-foreground",
                  )}
                >
                  Open wide reader
                </button>
              </div>
            ) : reportCheckedMissing && hasBrief ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Brief ready · Full report missing for this day / language.
              </p>
            ) : (
              <EmptyHint
                kind="report"
                date={date}
                lang={lang}
                calendarToday={calendarToday}
                expectedLatest={effectiveLatest}
                onOpenLatest={openLatest}
              />
            )}
          </MarketSection>
        </div>
      ) : null}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {hasReport && reportItem?.content ? (
        <ReportReaderModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          title={reportItem.title ?? "Untitled report"}
          meta={reportMeta}
          summary={reportItem.summary}
          content={reportItem.content}
          dateMismatch={reportDateMismatch}
          tags={reportItem.tags}
          countries={reportItem.countries}
          regions={reportItem.regions}
          metadata={reportItem.metadata}
          marketDate={date}
          onAsk={onAskInChat}
          preferences={preferences}
          onToggleInterest={toggleInterest}
          interestsOnly={interestsOnly}
        />
      ) : null}

      {onAskInChat && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium text-foreground">
              Ask in chat
            </p>
          </div>
          <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
            Chat interprets · full text / voice stay in this tab.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MARKET_SUGGESTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.prompt}
                onClick={() => onAskInChat(s.prompt)}
                className={cn(
                  "rounded-md border border-border bg-background px-2 py-1",
                  "text-[10px] text-muted-foreground",
                  "hover:border-foreground/30 hover:bg-accent hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
