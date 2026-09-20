// ─────────────────────────────────────────────────────────────────────────
// ChatHelperRail — home left rail: Topics + Ask-in-chat prompts
// ─────────────────────────────────────────────────────────────────────────
//
// Chat is the hero on `/`. This rail is the sidekick: starred interests,
// report keywords (tap → pendingAsk), and canned Market prompts.
// Browse date + series tabs stay in sync with the Market panel (shared
// date store + market_focus_series_id).
//
// Report pages (`/<slug>`) do not use this rail.
// Fetch: shared `use-market-day-data` + `use-market-preferences` (cache).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, MessageSquare, Tags, X } from "lucide-react";

import type { ContentLang } from "../../worker/chat-agent/settings";
import {
  marketSuggestions,
  reportPageSuggestions,
} from "@/lib/market-suggestions";
import { buildTagLexicon } from "@/lib/market-tag-lexicon";
import {
  useMarketDayData,
  useReportSeriesCatalog,
  useTopicLabelMap,
} from "@/lib/use-market-day-data";
import { useMarketPreferences } from "@/lib/use-market-preferences";
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
import { collectReportPreferenceKeys } from "@/lib/topic-preference";
import { seriesTabLabel, useT } from "@/i18n/ui-lang";

type HelperRailTab = "topics" | "ask";

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
  const t = useT();
  const [interestsOnly, setInterestsOnly] = useState(false);
  const [railTab, setRailTab] = useState<HelperRailTab>("topics");

  const prefsEnabled = SHOW_MY_INTERESTS || SHOW_TOPIC_CHIP_STAR;
  const {
    preferences,
    preferencesLoading,
    preferencesError,
    toggleInterest,
    removeInterestRow,
  } = useMarketPreferences(prefsEnabled);

  const { enabledSeriesIds, enabledSeriesKey } =
    useReportSeriesCatalog(disabledReportSeries);

  const {
    latestDate,
    date,
    slots,
    loading,
    error: dayError,
  } = useMarketDayData({
    lang,
    enabledSeriesKey,
  });

  const error = dayError ?? preferencesError;

  useEffect(() => {
    setInterestsOnly(false);
  }, [date, lang]);

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

  const showTopicsTab = SHOW_TOPICS_SECTION && SHOW_REPORT_TOPIC_CHIPS;

  const topicLabelMap = useTopicLabelMap(
    lang,
    showTopicsTab && hasReport,
  );

  useEffect(() => {
    if (!showTopicsTab && railTab === "topics") setRailTab("ask");
  }, [showTopicsTab, railTab]);

  const seriesLabel = activeSlot
    ? seriesTabLabel(
        t,
        activeSlot.seriesSlug,
        activeSlot.seriesTabLabel || activeSlot.seriesTitle || "",
      ) || activeSlot.seriesTabLabel || activeSlot.seriesTitle
    : null;

  const dateLabel = date
    ? `${date === latestDate ? `${t("common.latest")} · ` : ""}${date}${
        seriesLabel ? ` · ${seriesLabel}` : ""
      }`
    : t("helper.pickDay");

  const askSuggestions = useMemo(
    () => (date ? reportPageSuggestions(date, lang) : marketSuggestions(lang)),
    [date, lang],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-3">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-tight">{t("helper.ask")}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {dateLabel}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground xl:hidden"
            title={t("helper.hide")}
            aria-label={t("helper.hide")}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {slots.length > 1 ? (
        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2"
          role="tablist"
          aria-label={t("helper.reportSeries")}
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex shrink-0 gap-1 border-b border-border px-3 py-2"
          role="tablist"
          aria-label={t("helper.ask")}
        >
          {showTopicsTab ? (
            <button
              type="button"
              role="tab"
              aria-selected={railTab === "topics"}
              onClick={() => setRailTab("topics")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                railTab === "topics"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              <Tags className="h-3 w-3 shrink-0" />
              {t("helper.topics")}
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={railTab === "ask"}
            onClick={() => setRailTab("ask")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              railTab === "ask"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            <MessageSquare className="h-3 w-3 shrink-0" />
            {t("helper.askInChat")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {railTab === "topics" && showTopicsTab ? (
            enabledSeriesIds.length === 0 ? (
              <p className="px-1 py-6 text-center text-[11px] italic text-muted-foreground">
                {t("helper.enableSeries")}
              </p>
            ) : loading ? (
              <div className="flex items-center gap-2 py-6 text-[11px] text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                {t("helper.loadingTopics")}
              </div>
            ) : (
              <div className="paper-surface space-y-3 px-3 py-2.5">
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
                    marketDate={date}
                    onAsk={onAskInChat}
                    preferences={preferences}
                    onToggleInterest={toggleInterest}
                    interestsOnly={interestsOnly}
                    labelMap={topicLabelMap}
                  />
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {error ?? t("helper.noKeywords")}
                  </p>
                )}
                {SHOW_TOPIC_CHIP_ASK || SHOW_TOPIC_CHIP_STAR ? (
                  <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                    {SHOW_TOPIC_CHIP_ASK ? t("helper.tapKeyword") : null}
                    {SHOW_TOPIC_CHIP_ASK && SHOW_TOPIC_CHIP_STAR
                      ? " · "
                      : null}
                    {SHOW_TOPIC_CHIP_STAR ? t("helper.starInterest") : null}
                  </p>
                ) : null}
              </div>
            )
          ) : (
            <div className="paper-surface space-y-2 px-3 py-2.5">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {t("helper.askHint")}
              </p>
              <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
                {askSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.prompt}
                    onClick={() => onAskInChat(s.prompt)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border border-border bg-background",
                      "px-2 py-1.5 text-left text-[10px] leading-snug text-foreground/85",
                      "hover:border-foreground/30 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <span className="mt-px shrink-0 font-mono text-[9px] text-muted-foreground">
                      ›
                    </span>
                    <span className="min-w-0 flex-1">{s.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && hasReport && railTab === "topics" ? (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
