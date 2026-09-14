import { useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, Settings2 } from "lucide-react";
import type {
  ChatSettings,
  ContentLang,
  ToggleablePanel,
} from "../../worker/chat-agent/settings";
import {
  CONTENT_LANGS,
  TOGGLEABLE_PANELS,
  TOGGLEABLE_PANEL_LABELS,
} from "../../worker/chat-agent/settings";
import type {
  ReportSeriesContentGroup,
  ReportSeriesRow,
} from "../../worker/report-series";
import { groupReportSeriesForSettings } from "../../worker/report-series";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";

function SettingSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="paper-inset flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <SettingSwitch
        checked={checked}
        disabled={disabled}
        label={title}
        onChange={onChange}
      />
    </div>
  );
}

function SoonBadge() {
  return (
    <span className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
      soon
    </span>
  );
}

export function SettingsPanel({
  settings,
  loading,
  updating,
  error,
  onToggleAlarm,
  onToggleCleanup,
  onContentLangChange,
  onTogglePanelVisibility,
  onToggleReportSeries,
}: {
  settings: ChatSettings | null;
  loading: boolean;
  updating: boolean;
  error: string | null;
  onToggleAlarm: (enabled: boolean) => Promise<void>;
  onToggleCleanup: (enabled: boolean) => Promise<void>;
  onContentLangChange: (lang: ContentLang) => Promise<void>;
  onTogglePanelVisibility: (
    panel: ToggleablePanel,
    visible: boolean,
  ) => Promise<void>;
  /** Enable/disable one or more report_series.slug values together. */
  onToggleReportSeries: (slugs: string[], enabled: boolean) => Promise<void>;
}) {
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [groups, setGroups] = useState<ReportSeriesContentGroup[] | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSeriesLoading(true);
    setSeriesError(null);
    void fetch("/api/report-series")
      .then(async (res) => {
        const body = (await res.json()) as {
          ok?: boolean;
          items?: ReportSeriesRow[];
          groups?: ReportSeriesContentGroup[];
          message?: string;
        };
        if (!active) return;
        if (!res.ok || !body.ok || !Array.isArray(body.items)) {
          setSeriesError(body.message ?? "Failed to load report series.");
          setGroups([]);
          return;
        }
        setGroups(
          Array.isArray(body.groups) && body.groups.length > 0
            ? body.groups
            : groupReportSeriesForSettings(body.items),
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSeriesError(
          err instanceof Error ? err.message : "Failed to load report series.",
        );
        setGroups([]);
      })
      .finally(() => {
        if (active) setSeriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hidden = new Set(settings?.hidden_panels ?? []);
  const disabledSeries = new Set(settings?.disabled_report_series ?? []);
  const hiddenCount = settings?.hidden_panels.length ?? 0;
  const visibleCount = TOGGLEABLE_PANELS.length - hiddenCount;
  const panelsSummary =
    hiddenCount === 0
      ? `${TOGGLEABLE_PANELS.length} tabs shown`
      : `${visibleCount} shown · ${hiddenCount} hidden`;

  const controllableGroups = (groups ?? []).filter((g) => !g.soon);
  const enabledSeriesCount = controllableGroups.filter((g) =>
    g.controllableSlugs.every((slug) => !disabledSeries.has(slug)),
  ).length;
  const marketSummary = seriesLoading
    ? `lang ${settings?.content_lang ?? "…"}`
    : controllableGroups.length === 0
      ? `${settings?.content_lang ?? "ko"}`
      : `${settings?.content_lang ?? "ko"} · ${enabledSeriesCount}/${controllableGroups.length} series`;

  return (
    <section>
      <PanelHeader
        icon={Settings2}
        title="Settings"
        trailing={
          updating ? (
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
          ) : null
        }
      />

      {loading && !settings ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Loading settings…
        </div>
      ) : settings ? (
        <div className="space-y-2">
          <div className="paper-inset px-3 py-2.5">
            <button
              type="button"
              onClick={() => setMarketOpen((v) => !v)}
              aria-expanded={marketOpen}
              className={cn(
                "flex w-full items-center gap-1.5 text-left",
                marketOpen && "mb-2",
              )}
            >
              <p className="text-xs font-medium">Market</p>
              {!marketOpen && (
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                  {marketSummary}
                </span>
              )}
              {marketOpen && <span className="min-w-0 flex-1" />}
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  marketOpen && "rotate-180",
                )}
              />
            </button>
            {marketOpen && (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Content
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    Choose which Market Memory series to use. Weekly and daily
                    market issues share one switch. Inactive catalog entries
                    stay off until they ship.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {seriesLoading && !groups ? (
                      <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
                        <LoaderCircle className="size-3 animate-spin" />
                        Loading series…
                      </div>
                    ) : groups && groups.length > 0 ? (
                      groups.map((group) => {
                        const soon = group.soon;
                        const enabled = soon
                          ? false
                          : group.controllableSlugs.every(
                              (slug) => !disabledSeries.has(slug),
                            );
                        return (
                          <div
                            key={group.id}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5",
                              soon ? "bg-muted/25 opacity-70" : "bg-muted/40",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-medium">
                                  {group.title}
                                </span>
                                {soon && <SoonBadge />}
                              </div>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                {group.detail}
                              </p>
                            </div>
                            <SettingSwitch
                              checked={enabled}
                              disabled={updating || soon}
                              label={
                                soon
                                  ? `${group.title} (coming soon)`
                                  : `Use ${group.title}`
                              }
                              onChange={(nextEnabled) =>
                                void onToggleReportSeries(
                                  group.controllableSlugs.length > 0
                                    ? group.controllableSlugs
                                    : group.slugs,
                                  nextEnabled,
                                )
                              }
                            />
                          </div>
                        );
                      })
                    ) : (
                      <p className="py-1 text-[11px] text-muted-foreground">
                        {seriesError ?? "No report series found."}
                      </p>
                    )}
                    {seriesError && groups && groups.length > 0 && (
                      <p className="text-[10px] text-destructive">
                        {seriesError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/50 pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Language
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    Preferred lang_code for Market Memory briefs and voice
                    (Supabase). Independent of chat reply language.
                  </p>
                  <div className="mt-2.5 flex gap-1.5">
                    {CONTENT_LANGS.map((lang) => {
                      const selected = settings.content_lang === lang;
                      return (
                        <button
                          key={lang}
                          type="button"
                          disabled={updating}
                          aria-pressed={selected}
                          onClick={() => void onContentLangChange(lang)}
                          className={cn(
                            "min-w-12 rounded-md px-3 py-1.5 font-mono text-xs transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                          )}
                        >
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="paper-inset px-3 py-2.5">
            <button
              type="button"
              onClick={() => setPanelsOpen((v) => !v)}
              aria-expanded={panelsOpen}
              className={cn(
                "flex w-full items-center gap-1.5 text-left",
                panelsOpen && "mb-2",
              )}
            >
              <p className="text-xs font-medium">Panel tabs</p>
              {!panelsOpen && (
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                  {panelsSummary}
                </span>
              )}
              {panelsOpen && <span className="min-w-0 flex-1" />}
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  panelsOpen && "rotate-180",
                )}
              />
            </button>
            {panelsOpen && (
              <>
                <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  Show or hide side-panel tabs. Settings stays available so you
                  can turn tabs back on.
                </p>
                <div className="space-y-1.5">
                  {TOGGLEABLE_PANELS.map((panel) => {
                    const visible = !hidden.has(panel);
                    return (
                      <div
                        key={panel}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5"
                      >
                        <span className="text-xs font-medium">
                          {TOGGLEABLE_PANEL_LABELS[panel]}
                        </span>
                        <SettingSwitch
                          checked={visible}
                          disabled={updating}
                          label={`Show ${TOGGLEABLE_PANEL_LABELS[panel]} tab`}
                          onChange={(nextVisible) =>
                            void onTogglePanelVisibility(panel, nextVisible)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <SettingRow
            title="Alarm scheduling"
            description="Allow the agent to schedule background cleanup work."
            checked={settings.alarm_enabled}
            disabled={updating}
            onChange={(enabled) => void onToggleAlarm(enabled)}
          />
          <SettingRow
            title="Message cleanup"
            description="Delete messages older than the configured retention period."
            checked={settings.message_cleanup_enabled}
            disabled={updating}
            onChange={(enabled) => void onToggleCleanup(enabled)}
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="paper-inset px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Retention</p>
              <p className="mt-1 font-mono text-xs">
                {formatDuration(settings.message_retention_seconds)}
              </p>
            </div>
            <div className="paper-inset px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Interval</p>
              <p className="mt-1 font-mono text-xs">
                {formatDuration(settings.alarm_interval_seconds)}
              </p>
            </div>
          </div>

          <p className="pt-1 text-[10px] text-muted-foreground">
            Updated {formatUpdatedAt(settings.updated_at)}
          </p>
        </div>
      ) : (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Settings are unavailable.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  if (Number.isInteger(minutes)) return `${minutes}m`;
  return `${seconds}s`;
}

function formatUpdatedAt(updatedAt: string): string {
  if (!updatedAt) return "never";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}
