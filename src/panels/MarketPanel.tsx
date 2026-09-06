// ─────────────────────────────────────────────────────────────────────────
// MarketPanel — Market Memory brief + voice + full report for a Seoul day
// ─────────────────────────────────────────────────────────────────────────
// Fetches existing HTTP APIs (no ChatAgent State). Language comes from
// Settings content_lang — independent of chat reply language.
//
// Publishing is a daily batch (~22:30 UTC), so the newest market_date is
// usually Asia/Seoul *yesterday*. The panel defaults to that day.
//
// Report (item_contents) loads lazily when the Report section is expanded.
// Wide reader modal + ## TOC: src/panels/ReportReader.tsx.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  FileText,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Volume2,
} from "lucide-react";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { MARKET_SUGGESTIONS } from "@/lib/market-suggestions";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";
import {
  ReportArticle,
  ReportReaderModal,
  ReportToc,
  extractReportSections,
  jumpToSection,
} from "./ReportReader";

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

/** Newest market_date is usually Seoul yesterday (daily batch ~22:30 UTC). */
function expectedLatestYmd(now: Date = new Date()): string {
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
  const expectedLatest = expectedLatestYmd();
  const [date, setDate] = useState(() => expectedLatestYmd());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [voice, setVoice] = useState<VoiceResponse | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportCacheKey, setReportCacheKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<"brief" | "report" | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(true);
  const [briefOpen, setBriefOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const reportScrollRef = useRef<HTMLDivElement>(null);

  const invalidateReport = useCallback(() => {
    setReport(null);
    setReportCacheKey(null);
    setReportOpen(false);
    setReportModalOpen(false);
  }, []);

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
    void load(date, lang);
  }, [date, lang, load]);

  const briefItem = brief?.found ? brief.item : null;
  const voiceItem = voice?.found ? voice.item : null;
  const playPath =
    voice?.found && typeof voice.playPath === "string" ? voice.playPath : null;
  const reportCached = reportCacheKey === cacheKey(date, lang);
  const reportItem =
    reportCached && report?.found ? (report.item ?? null) : null;
  const hasReportCandidate = Boolean(briefItem?.target_id);
  const hasReport = Boolean(reportItem?.content);
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
  const showingExpectedLatest = date === expectedLatest;
  const openLatest = () => setDate(expectedLatest);
  const hasVoice = Boolean(voiceItem && playPath);
  const hasBrief = Boolean(briefItem);

  // New day with content → Voice/Brief start expanded; Report stays collapsed.
  useEffect(() => {
    if (hasVoice) setVoiceOpen(true);
    if (hasBrief) setBriefOpen(true);
  }, [date, lang, hasVoice, hasBrief]);

  const toggleReport = () => {
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

  return (
    <section>
      <PanelHeader
        icon={Newspaper}
        title="Market"
        trailing={
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {lang}
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(date, lang)}
              className={cn(
                "rounded-md p-1 text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
            </button>
          </div>
        }
      />

      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          disabled={loading}
          onClick={() => setDate((d) => shiftYmd(d, -1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date}
          disabled={loading}
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
          disabled={loading}
          onClick={() => setDate((d) => shiftYmd(d, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={loading || showingExpectedLatest}
          onClick={openLatest}
          className={cn(
            "rounded-md px-2 py-1 text-[11px]",
            showingExpectedLatest
              ? "cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={`Expected newest market_date (Seoul yesterday · ${expectedLatest})`}
        >
          Latest
        </button>
        <button
          type="button"
          disabled={loading || date === calendarToday}
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

      <div className="mb-3 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
        <p>
          Language follows Settings → Market content language. Not chat reply
          language.
        </p>
        <p>
          Daily batch ~<span className="font-mono">22:30 UTC</span> — newest
          market_date is usually Seoul yesterday
          {showingExpectedLatest ? (
            <>
              {" "}
              · showing{" "}
              <span className="font-mono text-foreground">latest</span>
            </>
          ) : null}
          .
        </p>
      </div>

      {loading && !brief && !voice ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
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
                expectedLatest={expectedLatest}
                onOpenLatest={openLatest}
              />
            )}
          </MarketSection>

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
                <p className="text-[11px] font-medium leading-snug">
                  {briefItem!.title ?? "Untitled brief"}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {briefItem!.brief_type} · {briefItem!.lang_code} ·{" "}
                  {briefItem!.status}
                </p>
                {(pulse || takeaway) && (
                  <div className="space-y-1 rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {pulse && (
                      <p>
                        <span className="font-medium text-foreground">
                          Pulse:{" "}
                        </span>
                        {pulse}
                      </p>
                    )}
                    {takeaway && (
                      <p>
                        <span className="font-medium text-foreground">
                          Takeaway:{" "}
                        </span>
                        {takeaway}
                      </p>
                    )}
                  </div>
                )}
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
                expectedLatest={expectedLatest}
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
                expectedLatest={expectedLatest}
                onOpenLatest={openLatest}
              />
            )}
          </MarketSection>
        </div>
      )}

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
