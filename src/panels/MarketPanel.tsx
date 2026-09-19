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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Check,
  FileText,
  LoaderCircle,
  Maximize2,
  Newspaper,
  RefreshCw,
  Volume2,
} from "lucide-react";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { hidesReportSummaryBlurb } from "../../worker/report-series";
import { readingHrefForSeriesSlug } from "@/lib/report-pages";
import { calendarYesterdayYmd, metaString, seoulYmd, shiftYmd } from "@/lib/market-date";
import {
  useMarketDayData,
  useReportSeriesCatalog,
  useTopicLabelMap,
} from "@/lib/use-market-day-data";
import { useMarketPreferences } from "@/lib/use-market-preferences";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";
import {
  ReportArticle,
  ReportReaderModal,
  ReportToc,
  SHOW_REPORT_TOPIC_CHIPS,
  SHOW_TOPIC_CHIP_STAR,
  extractReportSections,
  jumpToSection,
} from "./ReportReader";
import { SHOW_MY_INTERESTS } from "./MyInterestsFold";
import { BriefForYou, SHOW_BRIEF_FOR_YOU } from "./BriefForYou";

function slotCacheKey(
  marketDate: string,
  marketLang: string,
  seriesId: string,
): string {
  return `${marketDate}|${marketLang}|${seriesId}`;
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
  disabledReportSeries,
  marketFocusSeriesId,
  onAskInChat,
  onMarketFocusSeriesChange,
}: {
  contentLang: ContentLang | null;
  disabledReportSeries: string[];
  /** Settings-backed series focus — stay in sync with the home helper rail. */
  marketFocusSeriesId?: string | null;
  /** Send a Market Memory example prompt into the left chat. */
  onAskInChat?: (prompt: string) => void;
  /** Persist Market tab selection for chat vector / report prefetch scope. */
  onMarketFocusSeriesChange?: (seriesId: string) => void;
}) {
  const lang = contentLang ?? "ko";
  const calendarToday = seoulYmd();
  const calendarYesterday = calendarYesterdayYmd();
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"brief" | "report" | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [topicsLoadKey, setTopicsLoadKey] = useState<string | null>(null);
  const reportScrollRef = useRef<HTMLDivElement>(null);
  const helpWrapRef = useRef<HTMLDivElement>(null);

  const prefsEnabled =
    SHOW_MY_INTERESTS || SHOW_TOPIC_CHIP_STAR || SHOW_BRIEF_FOR_YOU;
  const {
    preferences,
    preferencesError,
    toggleInterest,
    reloadPreferences,
  } = useMarketPreferences(prefsEnabled);

  const { enabledSeriesIds, enabledSeriesKey } =
    useReportSeriesCatalog(disabledReportSeries);

  const {
    latestDate,
    date,
    setDate,
    slots: daySlots,
    loading,
    latestLoading,
    error: dayError,
    setError,
    refresh,
  } = useMarketDayData({
    lang,
    enabledSeriesKey,
    pinToLatest: false,
  });

  const error = dayError ?? preferencesError;

  // Close reader when the day payload reloads.
  useEffect(() => {
    setReportOpen(false);
    setReportModalOpen(false);
    setTopicsLoadKey(null);
  }, [date, lang, enabledSeriesKey]);

  useEffect(() => {
    if (daySlots.length === 0) {
      setActiveSeriesId(null);
      return;
    }
    setActiveSeriesId((prev) => {
      const focus = marketFocusSeriesId?.trim();
      if (focus && daySlots.some((s) => s.seriesId === focus)) return focus;
      if (prev && daySlots.some((s) => s.seriesId === prev)) return prev;
      return daySlots[0]?.seriesId ?? null;
    });
  }, [daySlots, marketFocusSeriesId]);

  useEffect(() => {
    if (!activeSeriesId) return;
    onMarketFocusSeriesChange?.(activeSeriesId);
  }, [activeSeriesId, onMarketFocusSeriesChange]);

  useEffect(() => {
    const focus = marketFocusSeriesId?.trim();
    if (!focus) return;
    if (!daySlots.some((s) => s.seriesId === focus)) return;
    setActiveSeriesId((prev) => (prev === focus ? prev : focus));
  }, [marketFocusSeriesId, daySlots]);

  const activeSlot = useMemo(() => {
    if (daySlots.length === 0) return null;
    if (activeSeriesId) {
      const hit = daySlots.find((s) => s.seriesId === activeSeriesId);
      if (hit) return hit;
    }
    return daySlots[0] ?? null;
  }, [daySlots, activeSeriesId]);

  const briefItem = activeSlot?.brief ?? null;
  const voiceItem = activeSlot?.voice?.item ?? null;
  const playPath = activeSlot?.voice?.playPath ?? null;
  const reportItem = activeSlot?.report ?? null;
  const showReportSummaryBlurb =
    Boolean(reportItem?.summary?.trim()) &&
    !hidesReportSummaryBlurb(activeSlot?.seriesSlug);
  const hasReportCandidate = Boolean(activeSlot?.targetId);
  const hasReport = Boolean(reportItem?.content);
  const reportCheckedMissing =
    Boolean(activeSlot) && hasReportCandidate && !hasReport;
  const readingHref = useMemo(
    () =>
      activeSlot?.seriesSlug
        ? readingHrefForSeriesSlug(activeSlot.seriesSlug, { date, lang })
        : null,
    [activeSlot?.seriesSlug, date, lang],
  );
  const readingHrefFull = useMemo(
    () =>
      activeSlot?.seriesSlug
        ? readingHrefForSeriesSlug(activeSlot.seriesSlug, {
            date,
            lang,
            tab: "full",
          })
        : null,
    [activeSlot?.seriesSlug, date, lang],
  );

  const topicLabelMap = useTopicLabelMap(
    lang,
    SHOW_REPORT_TOPIC_CHIPS && reportModalOpen && hasReport,
  );

  // Keep topicsLoadKey so modal reopen on same slot skips thrash.
  useEffect(() => {
    if (!SHOW_REPORT_TOPIC_CHIPS) return;
    if (!reportModalOpen) return;
    if (!date || !activeSeriesId || !hasReport) return;
    const key = slotCacheKey(date, lang, activeSeriesId);
    if (topicsLoadKey === key) return;
    setTopicsLoadKey(key);
  }, [
    reportModalOpen,
    date,
    lang,
    activeSeriesId,
    hasReport,
    topicsLoadKey,
  ]);

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

  // New day / series tab → Brief expanded; Voice / Report collapsed.
  useEffect(() => {
    setVoiceOpen(false);
    setReportOpen(false);
    if (hasBrief) setBriefOpen(true);
  }, [date, lang, activeSeriesId, hasBrief]);

  const toggleReport = () => {
    if (!date) return;
    setReportOpen((wasOpen) => !wasOpen);
  };

  /** Expand report section and open wide reader when content exists. */
  const openReportReader = useCallback(() => {
    if (!date || !reportItem?.content) return;
    setReportOpen(true);
    setReportModalOpen(true);
  }, [date, reportItem?.content]);

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
                refresh();
                void reloadPreferences();
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

      {daySlots.length > 1 ? (
        <div
          className="mb-2 flex gap-1 overflow-x-auto pb-0.5"
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
                  "max-w-44 shrink-0 truncate rounded-md px-2 py-1 text-[11px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                title={slot.seriesTitle}
              >
                {slot.seriesTabLabel || slot.seriesTitle}
              </button>
            );
          })}
        </div>
      ) : null}

      {readingHref ? (
        <a
          href={readingHref}
          className={cn(
            "mb-2 inline-flex items-center gap-0.5 text-[10px]",
            "text-muted-foreground hover:text-primary",
          )}
        >
          이 리포트 크게 보기
          <ArrowUpRight className="h-3 w-3" />
        </a>
      ) : null}

      {enabledSeriesIds.length === 0 ? (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Turn on at least one series under Settings → Market → Content.
        </p>
      ) : (latestLoading && !date) || (loading && daySlots.length === 0) ? (
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
                    disabled={loading || !hasReport}
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

          <MarketSection
            icon={FileText}
            title="Report"
            collapsible={hasReportCandidate || hasReport}
            open={reportOpen}
            onToggle={toggleReport}
            summary={reportCollapsedSummary}
            trailing={
              <div className="flex items-center gap-0.5">
                {readingHrefFull ? (
                  <a
                    href={readingHrefFull}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="이 리포트 크게 보기"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {hasReportCandidate || hasReport ? (
                  <button
                    type="button"
                    disabled={loading || !hasReport}
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
            {reportOpen && loading && !hasReport ? (
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
                {showReportSummaryBlurb ? (
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
                {readingHrefFull ? (
                  <a
                    href={readingHrefFull}
                    className={cn(
                      "flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5",
                      "text-[10px] text-muted-foreground",
                      "hover:border-foreground/30 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    이 리포트 크게 보기
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : (
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
                )}
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
          summary={showReportSummaryBlurb ? reportItem.summary : null}
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
          labelMap={topicLabelMap}
        />
      ) : null}
    </section>
  );
}
