// ─────────────────────────────────────────────────────────────────────────
// ChatHelperRail — home left rail: Topics + Ask-in-chat prompts
// ─────────────────────────────────────────────────────────────────────────
//
// Chat is the hero on `/`. This rail is the sidekick: starred interests,
// Latest-report keywords (tap → pendingAsk), and canned Market prompts.
// It always reads the newest published day (not the Market panel date
// picker) so "what can I ask right now" stays aligned with chat prefetch.
//
// Report pages (`/<slug>`) do not use this rail.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, MessageSquare, Tags, X } from "lucide-react";

import type { ContentLang } from "../../worker/chat-agent/settings";
import {
  enabledReportSeriesRows,
  type ReportSeriesRow,
} from "../../worker/report-series";
import { MARKET_SUGGESTIONS } from "@/lib/market-suggestions";
import { buildTagLexicon } from "@/lib/market-tag-lexicon";
import { calendarYesterdayYmd } from "@/lib/market-date";
import { cn } from "@/lib/utils";
import {
  ReportKeywordChips,
  SHOW_REPORT_TOPIC_CHIPS,
  SHOW_TOPIC_CHIP_ASK,
  SHOW_TOPIC_CHIP_STAR,
  SHOW_TOPICS_SECTION,
  hasTopKeywords,
} from "@/panels/ReportReader";
import { MyInterestsFold, SHOW_MY_INTERESTS } from "@/panels/MyInterestsFold";
import {
  collectReportPreferenceKeys,
  fetchPreferences,
  fetchTopicLabels,
  isPreferenceSaved,
  mapTopicToPreference,
  removeInterest,
  saveInterest,
  type PreferenceRow,
  type TopicPreferenceSource,
} from "@/lib/topic-preference";

type ReportItem = {
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
};

type DaySlot = {
  seriesId: string;
  seriesTitle: string;
  seriesTabLabel: string;
  report: ReportItem | null;
};

function appendSeriesIds(qs: URLSearchParams, seriesIds: string[]): void {
  for (const id of seriesIds) qs.append("series_id", id);
}

export function ChatHelperRail({
  contentLang,
  disabledReportSeries,
  marketFocusSeriesId,
  onAskInChat,
  onMarketFocusSeriesChange,
  onClose,
}: {
  contentLang: ContentLang | null;
  disabledReportSeries: string[];
  marketFocusSeriesId?: string | null;
  onAskInChat: (prompt: string) => void;
  onMarketFocusSeriesChange?: (seriesId: string) => void;
  /** Narrow-viewport drawer close. Omitted when the rail is docked. */
  onClose?: () => void;
}) {
  const lang = contentLang ?? "ko";
  const [catalog, setCatalog] = useState<ReportSeriesRow[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [topicLabelMap, setTopicLabelMap] = useState<Record<
    string,
    string
  > | null>(null);
  const [interestsOnly, setInterestsOnly] = useState(false);

  const enabledSeriesIds = useMemo(
    () =>
      enabledReportSeriesRows(catalog, disabledReportSeries).map((row) => row.id),
    [catalog, disabledReportSeries],
  );
  const enabledSeriesKey = enabledSeriesIds.join(",");

  useEffect(() => {
    let active = true;
    void fetch("/api/report-series")
      .then(async (res) => {
        const body = (await res.json()) as {
          ok?: boolean;
          items?: ReportSeriesRow[];
        };
        if (!active || !res.ok || !body.ok || !Array.isArray(body.items)) return;
        setCatalog(body.items);
      })
      .catch(() => {
        if (active) setCatalog([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadPreferences = useCallback(async () => {
    if (!SHOW_MY_INTERESTS && !SHOW_TOPIC_CHIP_STAR) return;
    setPreferencesLoading(true);
    try {
      setPreferences(await fetchPreferences());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interests");
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const toggleInterest = useCallback(
    async (source: TopicPreferenceSource) => {
      const mapped = mapTopicToPreference(source);
      if (!mapped) return;
      const saved = isPreferenceSaved(preferences, mapped.kind, mapped.target);
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
          const row = await saveInterest(
            mapped.kind,
            mapped.target,
            source.display ?? null,
          );
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
    },
    [preferences],
  );

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
      setError(err instanceof Error ? err.message : "Failed to remove interest");
    }
  }, []);

  useEffect(() => {
    const seriesIds = enabledSeriesKey
      ? enabledSeriesKey.split(",").filter(Boolean)
      : [];
    if (seriesIds.length === 0) {
      setLatestDate(null);
      setSlots([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setInterestsOnly(false);
    setTopicLabelMap(null);

    void (async () => {
      try {
        const latestQs = new URLSearchParams({ lang });
        appendSeriesIds(latestQs, seriesIds);
        const latestRes = await fetch(`/api/market/latest-date?${latestQs}`);
        const latestJson = (await latestRes.json()) as {
          ok?: boolean;
          found?: boolean;
          marketDate?: string | null;
          seoulYesterday?: string;
          message?: string;
        };
        if (!latestRes.ok && !latestJson.ok) {
          throw new Error(latestJson.message || `latest-date HTTP ${latestRes.status}`);
        }
        const date =
          latestJson.found && typeof latestJson.marketDate === "string"
            ? latestJson.marketDate
            : (latestJson.seoulYesterday ?? calendarYesterdayYmd());
        if (!active) return;
        setLatestDate(date);

        const dayQs = new URLSearchParams({ date, lang });
        appendSeriesIds(dayQs, seriesIds);
        const dayRes = await fetch(`/api/market/day?${dayQs}`);
        const dayJson = (await dayRes.json()) as {
          ok?: boolean;
          slots?: DaySlot[];
          message?: string;
        };
        if (!dayRes.ok && !dayJson.ok) {
          throw new Error(dayJson.message || `market/day HTTP ${dayRes.status}`);
        }
        if (!active) return;
        setSlots(dayJson.slots ?? []);
      } catch (err) {
        if (!active) return;
        setLatestDate(calendarYesterdayYmd());
        setSlots([]);
        setError(
          err instanceof Error ? err.message : "Failed to load topics",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [lang, enabledSeriesKey]);

  const activeSlot = useMemo(() => {
    if (slots.length === 0) return null;
    const focus = marketFocusSeriesId?.trim();
    if (focus) {
      const hit = slots.find((s) => s.seriesId === focus);
      if (hit) return hit;
    }
    return slots[0] ?? null;
  }, [slots, marketFocusSeriesId]);

  useEffect(() => {
    if (!activeSlot) return;
    onMarketFocusSeriesChange?.(activeSlot.seriesId);
  }, [activeSlot, onMarketFocusSeriesChange]);

  const reportItem = activeSlot?.report ?? null;
  const hasReport = Boolean(reportItem);
  const reportKeys =
    hasReport && reportItem
      ? collectReportPreferenceKeys(reportItem)
      : null;
  const tagLexicon = useMemo(
    () => (reportItem ? buildTagLexicon(reportItem.metadata) : null),
    [reportItem],
  );

  useEffect(() => {
    if (!SHOW_TOPICS_SECTION || !SHOW_REPORT_TOPIC_CHIPS) return;
    if (!hasReport) return;
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
  }, [hasReport, lang, activeSlot?.seriesId]);

  const seriesLabel =
    activeSlot?.seriesTabLabel || activeSlot?.seriesTitle || null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-3">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-tight">Ask</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {latestDate
              ? `Latest · ${latestDate}${seriesLabel ? ` · ${seriesLabel}` : ""}`
              : "Latest report topics"}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground xl:hidden"
            title="Hide helper"
            aria-label="Hide helper"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {slots.length > 1 ? (
        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2"
          role="tablist"
          aria-label="Report series"
        >
          {slots.map((slot) => {
            const selected = slot.seriesId === activeSlot?.seriesId;
            return (
              <button
                key={slot.seriesId}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onMarketFocusSeriesChange?.(slot.seriesId)}
                className={cn(
                  "max-w-36 shrink-0 truncate rounded-md px-2 py-1 text-[11px] transition-colors",
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {enabledSeriesIds.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] italic text-muted-foreground">
            Turn on at least one series under Settings → Market → Content.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 py-6 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            Loading topics…
          </div>
        ) : SHOW_TOPICS_SECTION && SHOW_REPORT_TOPIC_CHIPS ? (
          <div className="paper-inset space-y-3 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Tags className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs font-medium">Topics</p>
            </div>
            {SHOW_MY_INTERESTS ? (
              <MyInterestsFold
                preferences={preferences}
                loading={preferencesLoading}
                onRemove={removeInterestRow}
                reportKeys={reportKeys}
                interestsOnly={interestsOnly}
                onInterestsOnlyChange={setInterestsOnly}
                tagLexicon={tagLexicon}
                labelMap={topicLabelMap}
                contentLang={lang}
              />
            ) : null}
            {hasReport && reportItem && hasTopKeywords(reportItem) ? (
              <ReportKeywordChips
                tags={reportItem.tags}
                countries={reportItem.countries}
                regions={reportItem.regions}
                metadata={reportItem.metadata}
                marketDate={latestDate}
                onAsk={onAskInChat}
                preferences={preferences}
                onToggleInterest={toggleInterest}
                interestsOnly={interestsOnly}
                labelMap={topicLabelMap}
              />
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {error ?? "No keywords on the latest report."}
              </p>
            )}
            {(SHOW_TOPIC_CHIP_ASK || SHOW_TOPIC_CHIP_STAR) ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                {SHOW_TOPIC_CHIP_ASK ? "Tap a keyword to ask in chat" : null}
                {SHOW_TOPIC_CHIP_ASK && SHOW_TOPIC_CHIP_STAR ? " · " : null}
                {SHOW_TOPIC_CHIP_STAR ? "Star to save an interest" : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {error && hasReport ? (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] font-medium text-foreground">Ask in chat</p>
        </div>
        <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
          Chat interprets · full text stays in Market / the reading page.
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
    </div>
  );
}
