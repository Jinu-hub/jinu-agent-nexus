// ─────────────────────────────────────────────────────────────────────────
// ReportForYou — "나를 위한 요약" tab on the report page
// ─────────────────────────────────────────────────────────────────────────
//
// The one tab that differs per reader: saved interests ∩ this report, then
// a grounded summary of the report passages that cover them. All of that
// happens server side (`POST /api/market/for-you`, worker/market-for-you.ts);
// this component owns the four states and the star chips that tune them.
//
// Starring is not decoration here — it changes the interest set, which
// changes the server's cache key, which regenerates the summary. So the
// chips live at the bottom of this tab rather than in the article.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, Sparkles, Star } from "lucide-react";

import { pickTopKeywords } from "@/panels/report-topics";
import {
  buildTagLexicon,
  topicDisplayLabel,
} from "@/lib/market-tag-lexicon";
import { authFetch } from "@/lib/auth-fetch";
import {
  DEFAULT_PREFERENCE_CATEGORY,
  fetchPreferences,
  fetchTopicLabels,
  isPreferenceSaved,
  mapTopicToPreference,
  removeInterest,
  saveInterest,
  type PreferenceRow,
  type TopicPreferenceSource,
} from "@/lib/topic-preference";
import { topicChipAskPrompt } from "@/lib/market-suggestions";
import { cn } from "@/lib/utils";
import { interestKindLabel, useT, useUiLang } from "@/i18n/ui-lang";

export type ForYouReport = {
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
};

type Interest = {
  kind: PreferenceRow["kind"];
  target: string;
  display: string;
  level: number;
};

type ForYouResponse = {
  ok?: boolean;
  state?: "no-report" | "no-interest" | "no-match" | "failed" | "ready";
  interests?: Interest[];
  matched?: Interest[];
  sections?: Array<{ interest: Interest; summary: string }>;
  cached?: boolean;
  degraded?: boolean;
  message?: string;
};

export function ReportForYou({
  seriesId,
  marketDate,
  lang,
  report,
  onAsk,
}: {
  seriesId: string;
  marketDate: string;
  lang: string;
  report: ForYouReport | null;
  onAsk?: (prompt: string) => void;
}) {
  const [data, setData] = useState<ForYouResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PreferenceRow[]>([]);
  const [labelMap, setLabelMap] = useState<Record<string, string> | null>(null);
  const t = useT();

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch("/api/market/for-you", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            date: marketDate,
            lang,
            series_id: seriesId,
            refresh,
          }),
        });
        const json = (await res.json()) as ForYouResponse;
        if (!res.ok && !json.ok) {
          throw new Error(json.message || `for-you HTTP ${res.status}`);
        }
        setData(json);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : t("forYou.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [seriesId, marketDate, lang],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void fetchPreferences(DEFAULT_PREFERENCE_CATEGORY)
      .then((rows) => {
        if (active) setPreferences(rows);
      })
      .catch(() => {
        if (active) setPreferences([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchTopicLabels(undefined, lang)
      .then((map) => {
        if (active) setLabelMap(map);
      })
      .catch(() => {
        if (active) setLabelMap(null);
      });
    return () => {
      active = false;
    };
  }, [lang]);

  const toggleInterest = useCallback(
    async (source: TopicPreferenceSource) => {
      const mapped = mapTopicToPreference(source);
      if (!mapped) return;
      const saved = isPreferenceSaved(
        preferences,
        mapped.kind,
        mapped.target,
        DEFAULT_PREFERENCE_CATEGORY,
      );
      try {
        if (saved) {
          await removeInterest(
            mapped.kind,
            mapped.target,
            DEFAULT_PREFERENCE_CATEGORY,
          );
        } else {
          await saveInterest(
            mapped.kind,
            mapped.target,
            source.display ?? null,
            DEFAULT_PREFERENCE_CATEGORY,
          );
        }
        setPreferences(await fetchPreferences(DEFAULT_PREFERENCE_CATEGORY));
        // The interest set is the server's cache key — a new set is a new
        // summary, so this refetch is a cache miss by construction.
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("forYou.saveFailed"));
      }
    },
    [preferences, load],
  );

  const state = data?.state;
  const sections = data?.sections ?? [];

  return (
    <div className="mt-8">
      {loading && !data ? (
        <div className="flex items-center gap-2.5 py-16 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t("forYou.loading")}
        </div>
      ) : state === "ready" ? (
        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={`${section.interest.kind}:${section.interest.target}`}
              className="rounded-xl border border-border bg-card px-5 py-4"
            >
              <div className="flex items-center gap-1.5">
                <Star className="h-3 w-3 shrink-0 fill-current text-primary" />
                <h2 className="text-base font-bold tracking-tight">
                  {section.interest.display}
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {interestKindLabel(t, section.interest.kind)}
                </span>
              </div>
              <p className="mt-2 text-[15px] leading-7 text-foreground/80">
                {section.summary}
              </p>
            </section>
          ))}

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1">
              {t("forYou.grounded")}
              {data?.degraded ? t("forYou.degraded") : null}
              {data?.cached ? t("forYou.cached") : null}
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(true)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2 py-1",
                "hover:bg-accent hover:text-foreground disabled:opacity-50",
              )}
              title={t("forYou.regenerate")}
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              {t("forYou.regenerate")}
            </button>
          </div>
        </div>
      ) : state === "no-interest" ? (
        <Pitch
          title={t("forYou.noInterestTitle")}
          body={t("forYou.noInterestBody")}
        />
      ) : state === "no-match" ? (
        <Pitch
          title={t("forYou.noMatchTitle")}
          body={
            data?.interests && data.interests.length > 0
              ? t("forYou.noMatchBody", {
                  list: data.interests.map((i) => i.display).join(", "),
                })
              : t("forYou.noMatchEmpty")
          }
        />
      ) : state === "no-report" ? (
        <Pitch
          title={t("forYou.noReportTitle")}
          body={t("forYou.noReportBody")}
        />
      ) : state === "failed" ? (
        <Pitch
          title={t("forYou.failedTitle")}
          body={t("forYou.failedBody")}
          action={
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(true)}
              className={cn(
                "mt-4 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5",
                "text-[11px] font-semibold text-primary-foreground",
                "hover:opacity-90 disabled:opacity-50",
              )}
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              {t("forYou.retry")}
            </button>
          }
        />
      ) : null}

      {error ? (
        <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {report ? (
        <TuningChips
          report={report}
          marketDate={marketDate}
          preferences={preferences}
          labelMap={labelMap}
          onToggle={(source) => void toggleInterest(source)}
          onAsk={onAsk}
        />
      ) : null}
    </div>
  );
}

function Pitch({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8">
      <p className="text-sm font-bold tracking-tight">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action}
    </div>
  );
}

function TuningChips({
  report,
  marketDate,
  preferences,
  labelMap,
  onToggle,
  onAsk,
}: {
  report: ForYouReport;
  marketDate: string;
  preferences: PreferenceRow[];
  labelMap: Record<string, string> | null;
  onToggle: (source: TopicPreferenceSource) => void;
  onAsk?: (prompt: string) => void;
}) {
  const t = useT();
  const lexicon = buildTagLexicon(report.metadata);
  const tags = Array.isArray(report.tags)
    ? report.tags.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      )
    : [];
  // Unlike the panel, keywords without a resolved label are kept — this is a
  // tuning surface, so every candidate must be starrable. Dedupe runs on the
  // shown label, not the raw one: "bonds" and "fixed income" both resolve to
  // 국채 and would otherwise appear as two identical chips.
  const seen = new Set(
    tags.map((t) => topicDisplayLabel(t, lexicon, labelMap).toLowerCase()),
  );
  const keywords = pickTopKeywords(report, { limit: 14 })
    .filter((kw) => {
      const shown = topicDisplayLabel(kw.label, lexicon, labelMap).toLowerCase();
      if (seen.has(shown)) return false;
      seen.add(shown);
      return true;
    })
    .slice(0, 10);

  if (tags.length === 0 && keywords.length === 0) return null;

  return (
    <div className="mt-10 border-t border-border pt-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
        {t("forYou.tune")}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {t("forYou.tuneHelp")}
        {onAsk ? t("forYou.tuneAsk") : null}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Chip
            key={`tag:${tag}`}
            label={topicDisplayLabel(tag, lexicon, labelMap)}
            rawLabel={tag}
            kindLabel={t("forYou.kind.tag")}
            source={{ source: "tag", label: tag }}
            marketDate={marketDate}
            askKind="tag"
            preferences={preferences}
            onToggle={onToggle}
            onAsk={onAsk}
          />
        ))}
        {keywords.map((kw) => (
          <Chip
            key={kw.key}
            label={topicDisplayLabel(kw.label, lexicon, labelMap)}
            rawLabel={kw.label}
            source={kw.source}
            marketDate={marketDate}
            askKind={kw.askKind}
            preferences={preferences}
            onToggle={onToggle}
            onAsk={onAsk}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  rawLabel,
  kindLabel,
  source,
  askKind,
  marketDate,
  preferences,
  onToggle,
  onAsk,
}: {
  label: string;
  rawLabel: string;
  kindLabel?: string;
  source: TopicPreferenceSource;
  askKind: Parameters<typeof topicChipAskPrompt>[0];
  marketDate: string;
  preferences: PreferenceRow[];
  onToggle: (source: TopicPreferenceSource) => void;
  onAsk?: (prompt: string) => void;
}) {
  const mapped = mapTopicToPreference(source);
  const saved =
    mapped != null &&
    isPreferenceSaved(
      preferences,
      mapped.kind,
      mapped.target,
      DEFAULT_PREFERENCE_CATEGORY,
    );
  const shown = label.trim() || rawLabel;
  const { lang } = useUiLang();
  const t = useT();

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border",
        saved ? "border-primary/50 bg-primary/10" : "border-border bg-card",
      )}
    >
      <button
        type="button"
        disabled={!onAsk}
        onClick={() =>
          onAsk?.(topicChipAskPrompt(askKind, shown, marketDate, lang))
        }
        title={onAsk ? `${t("topics.askChip")}: ${rawLabel}` : rawLabel}
        className={cn(
          "min-w-0 truncate rounded-l-full py-1 pl-3 pr-1.5 text-xs",
          onAsk && "hover:text-primary",
        )}
      >
        {kindLabel ? (
          <span className="mr-1 font-mono text-[9px] uppercase text-muted-foreground">
            {kindLabel}
          </span>
        ) : null}
        {shown}
      </button>
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => onToggle({ ...source, display: shown })}
        title={saved ? `관심사 해제: ${rawLabel}` : `관심사로 저장: ${rawLabel}`}
        className={cn(
          "shrink-0 rounded-r-full py-1 pl-0.5 pr-2.5",
          saved ? "text-primary" : "text-muted-foreground/50 hover:text-primary",
        )}
      >
        <Star className={cn("h-3 w-3", saved && "fill-current")} />
      </button>
    </span>
  );
}
