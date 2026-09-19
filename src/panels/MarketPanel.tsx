// ─────────────────────────────────────────────────────────────────────────
// MarketPanel — Market Memory brief + voice + full report for a Seoul day
// ─────────────────────────────────────────────────────────────────────────
// Fetches existing HTTP APIs (no ChatAgent State). Language comes from
// Settings content_lang — independent of chat reply language.
//
// Publishing is a daily batch (~22:30 UTC). "Latest" is the newest
// market_date that actually has a final brief (GET /api/briefs/latest-date),
// not blindly Seoul yesterday — weekends/holidays often have no US-market row.
//
// Slim home (`SHOW_MARKET_WORKBENCH = false`): voice + pulse/takeaway +
// brief body + report blurb + reading CTA. Topics/Ask live in ChatHelperRail;
// full Brief/Voice/Report folds stay behind the flag for easy rollback.
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
import { hidesBriefLeadSummary, hidesReportSummaryBlurb } from "../../worker/report-series";
import { readingHrefForSeriesSlug } from "@/lib/report-pages";
import { calendarYesterdayYmd, metaString, seoulYmd, shiftYmd } from "@/lib/market-date";
import {
  useMarketDayData,
  useReportSeriesCatalog,
  useTopicLabelMap,
} from "@/lib/use-market-day-data";
import { useMarketPreferences } from "@/lib/use-market-preferences";
import { cn } from "@/lib/utils";
import { seriesTabLabel, useT } from "@/i18n/ui-lang";
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

/** Full Brief/Voice/Report workbench on the home Market tab. Off = slim card. */
export const SHOW_MARKET_WORKBENCH = false;

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
  const t = useT();
  const label =
    kind === "voice"
      ? t("market.label.voice")
      : kind === "brief"
        ? t("market.label.brief")
        : t("market.label.report");

  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
      {isCalendarToday ? (
        <p>
          {t("market.emptyToday", {
            label,
            date,
            lang,
            latest: expectedLatest,
          })}
        </p>
      ) : isExpectedLatest ? (
        <p>
          {t("market.emptyLatest", { label, date, lang })}
        </p>
      ) : (
        <p>{t("market.emptyOther", { label, date, lang })}</p>
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
          {t("market.openLatest", { date: expectedLatest })}
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
  const t = useT();
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
  const showBriefLead =
    !hidesBriefLeadSummary(activeSlot?.seriesSlug);
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
      setError(t("market.clipboardFailed"));
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
    (hasReportCandidate ? t("market.tapToLoadReport") : null);

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
      ? t("market.dateMismatch", {
          reportDate: reportItem.market_date,
          panelDate: date ?? "",
        })
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
        title={t("market.title")}
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
                aria-label={t("market.help")}
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
                    <p>{t("market.helpLang")}</p>
                    <p>
                      {t("market.helpLatest")}
                      {showingExpectedLatest && date ? (
                        <>
                          {" "}
                          · {t("market.helpShowing")}{" "}
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
              title={t("common.refresh")}
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
          title={t("market.prevDay")}
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
          title={t("market.nextDay")}
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
          title={t("market.latestTitle", { date: effectiveLatest })}
        >
          {t("common.latest")}
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
          title={t("market.todayTitle")}
        >
          {t("common.today")}
        </button>
      </div>

      {daySlots.length > 1 ? (
        <div
          className="mb-2 flex gap-1 overflow-x-auto pb-0.5"
          role="tablist"
          aria-label={t("market.dayReports")}
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
                {seriesTabLabel(
                  t,
                  slot.seriesSlug,
                  slot.seriesTabLabel || slot.seriesTitle,
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {readingHref && SHOW_MARKET_WORKBENCH ? (
        <a
          href={readingHref}
          className={cn(
            "mb-2 inline-flex items-center gap-0.5 text-[10px]",
            "text-muted-foreground hover:text-primary",
          )}
        >
          {t("market.openWide")}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      ) : null}

      {enabledSeriesIds.length === 0 ? (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          {t("helper.enableSeries")}
        </p>
      ) : (latestLoading && !date) || (loading && daySlots.length === 0) ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {t("market.loading")}
        </div>
      ) : date && !SHOW_MARKET_WORKBENCH ? (
        <div className="space-y-3">
          <div className="paper-surface space-y-2.5 px-3 py-2.5">
            <div className="space-y-1">
              <p className="text-[11px] font-medium leading-snug text-foreground">
                {briefItem?.title ??
                  reportItem?.title ??
                  activeSlot?.seriesTitle ??
                  t("market.memory")}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {[
                  date,
                  lang,
                  hasVoice ? t("market.meta.voice") : null,
                  hasReport ? t("market.meta.report") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {hasVoice && playPath ? (
              <div className="space-y-1.5">
                <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                  {t("market.voice")}
                </p>
                <audio
                  className="w-full"
                  controls
                  preload="metadata"
                  src={playPath}
                >
                  <a href={playPath} target="_blank" rel="noreferrer">
                    {t("market.downloadMp3")}
                  </a>
                </audio>
              </div>
            ) : null}
            {showBriefLead && pulse ? (
              <p className="text-[11px] leading-relaxed text-foreground/90">
                {pulse}
              </p>
            ) : null}
            {showBriefLead && takeaway ? (
              <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {takeaway}
              </p>
            ) : null}
            {hasBrief ? (
              <div
                className={cn(
                  "space-y-1.5",
                  (hasVoice && playPath) ||
                    (showBriefLead && (pulse || takeaway))
                    ? "border-t border-border/60 pt-2"
                    : null,
                )}
              >
                <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                  {t("market.brief")}
                </p>
                <div className="max-h-[min(32rem,calc(100dvh-20rem))] overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
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
            {hasBrief ? (
              <BriefForYou
                preferences={preferences}
                pulse={pulse}
                takeaway={takeaway}
                content={briefItem!.content}
              />
            ) : null}
            {showReportSummaryBlurb ? (
              <div className="space-y-1.5 border-t border-border/60 pt-2">
                <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                  {t("market.report")}
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {reportItem!.summary}
                </p>
              </div>
            ) : reportCheckedMissing ? (
              <p className="border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                {t("market.reportMissing")}
              </p>
            ) : null}
          </div>
          {readingHref ? (
            <a
              href={readingHref}
              className={cn(
                "flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-2",
                "text-[11px] font-medium text-foreground",
                "hover:border-primary/40 hover:bg-accent hover:text-primary",
              )}
            >
              {t("market.openWide")}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ) : (
            <p className="text-center text-[10px] text-muted-foreground">
              {t("market.noReadingPage")}
            </p>
          )}
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
            title={t("market.brief")}
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
                    title={t("market.openReader")}
                  >
                    {t("market.report")}
                  </button>
                ) : null}
                {briefItem?.content ? (
                  <button
                    type="button"
                    onClick={() =>
                      void copyText("brief", briefItem.title, briefItem.content)
                    }
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={t("market.copyBrief")}
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
                    {briefItem!.title ?? t("market.untitledBrief")}
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
            title={t("market.voice")}
            collapsible={hasVoice}
            open={voiceOpen}
            onToggle={() => setVoiceOpen((v) => !v)}
            summary={voiceItem?.title}
            trailing={
              briefItem && !voiceItem ? (
                <span className="text-[10px] text-muted-foreground">
                  {t("market.briefReadyVoicePending")}
                </span>
              ) : null
            }
          >
            {hasVoice ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-snug text-foreground">
                  {voiceItem!.title ?? t("market.voiceBriefing")}
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
                    {t("market.downloadMp3")}
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
            title={t("market.report")}
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
                    title={t("market.openWide")}
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
                    title={t("market.openWideReader")}
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
                    title={t("market.copyReport")}
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
                {t("market.loadingReport")}
              </div>
            ) : hasReport ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium leading-snug">
                  {reportItem!.title ?? t("market.untitledReport")}
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
                    {t("market.openWide")}
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
                    {t("market.openWideReader")}
                  </button>
                )}
              </div>
            ) : reportCheckedMissing && hasBrief ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("market.briefReadyReportMissing")}
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

      {SHOW_MARKET_WORKBENCH && hasReport && reportItem?.content ? (
        <ReportReaderModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          title={reportItem.title ?? t("market.untitledReport")}
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
