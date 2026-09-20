import { useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, Settings2 } from "lucide-react";
import type {
  ChatSettings,
  ContentLang,
  ToggleablePanel,
} from "../../worker/chat-agent/settings";
import { CONTENT_LANGS, TOGGLEABLE_PANELS } from "../../worker/chat-agent/settings";
import type {
  ReportSeriesContentGroup,
  ReportSeriesRow,
} from "../../worker/report-series";
import { groupReportSeriesForSettings } from "../../worker/report-series";
import { seriesGroupTitle, useT, type TFn } from "@/i18n/ui-lang";
import type { MessageKey } from "@/i18n/messages";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";
import { AuthAccountCard } from "./AuthAccountCard";

const PANEL_LABEL_KEYS: Record<ToggleablePanel, MessageKey> = {
  market: "panels.market",
  memory: "panels.memory",
  skills: "panels.skills",
  files: "panels.files",
  tools: "panels.tools",
  sources: "panels.sources",
  browser: "panels.browser",
  schedules: "panels.schedules",
  extensions: "panels.extensions",
  mcp: "panels.mcp",
};

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

function SoonBadge({ t }: { t: TFn }) {
  return (
    <span className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
      {t("common.soon")}
    </span>
  );
}

export function SettingsPanel({
  settings,
  loading,
  updating,
  error,
  onContentLangChange,
  onTogglePanelVisibility,
  onToggleReportSeries,
}: {
  settings: ChatSettings | null;
  loading: boolean;
  updating: boolean;
  error: string | null;
  onContentLangChange: (lang: ContentLang) => Promise<void>;
  onTogglePanelVisibility: (
    panel: ToggleablePanel,
    visible: boolean,
  ) => Promise<void>;
  /** Enable/disable one or more report_series.slug values together. */
  onToggleReportSeries: (slugs: string[], enabled: boolean) => Promise<void>;
}) {
  const t = useT();
  const { isAdmin } = useAuth();
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
          setSeriesError(body.message ?? t("settings.seriesLoadFailed"));
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
          err instanceof Error ? err.message : t("settings.seriesLoadFailed"),
        );
        setGroups([]);
      })
      .finally(() => {
        if (active) setSeriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const hidden = new Set(settings?.hidden_panels ?? []);
  const disabledSeries = new Set(settings?.disabled_report_series ?? []);
  const hiddenCount = settings?.hidden_panels.length ?? 0;
  const visibleCount = TOGGLEABLE_PANELS.length - hiddenCount;
  const panelsSummary =
    hiddenCount === 0
      ? t("settings.tabsAllShown", { n: TOGGLEABLE_PANELS.length })
      : t("settings.tabsSummary", {
          shown: visibleCount,
          hidden: hiddenCount,
        });

  const controllableGroups = (groups ?? []).filter((g) => !g.soon);
  const enabledSeriesCount = controllableGroups.filter((g) =>
    g.controllableSlugs.every((slug) => !disabledSeries.has(slug)),
  ).length;
  const marketSummary = seriesLoading
    ? t("common.loading")
    : controllableGroups.length === 0
      ? ""
      : t("settings.seriesCount", {
          enabled: enabledSeriesCount,
          total: controllableGroups.length,
        });

  return (
    <section>
      <PanelHeader
        icon={Settings2}
        title={t("settings.title")}
        trailing={
          updating ? (
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
          ) : null
        }
      />

      {loading && !settings ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {t("settings.loading")}
        </div>
      ) : (
        <div className="space-y-2">
          <AuthAccountCard />
          {settings ? (
            <>
          <div className="paper-inset px-3 py-2.5">
            <p className="text-xs font-medium">{t("settings.language")}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.languageHelp")}
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
              <p className="text-xs font-medium">{t("settings.market")}</p>
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
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("settings.marketContent")}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {t("settings.marketContentHelp")}
                </p>
                <div className="mt-2 space-y-1.5">
                  {seriesLoading && !groups ? (
                    <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
                      <LoaderCircle className="size-3 animate-spin" />
                      {t("settings.loadingSeries")}
                    </div>
                  ) : groups && groups.length > 0 ? (
                    groups.map((group) => {
                      const soon = group.soon;
                      const title = seriesGroupTitle(t, group.id, group.title);
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
                                {title}
                              </span>
                              {soon && <SoonBadge t={t} />}
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
                                ? t("settings.seriesSoon", { title })
                                : t("settings.seriesUse", { title })
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
                      {seriesError ?? t("settings.noSeries")}
                    </p>
                  )}
                  {seriesError && groups && groups.length > 0 && (
                    <p className="text-[10px] text-destructive">
                      {seriesError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {isAdmin ? (
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
              <p className="text-xs font-medium">{t("settings.panelTabs")}</p>
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
                  {t("settings.panelTabsHelp")}
                </p>
                <div className="space-y-1.5">
                  {TOGGLEABLE_PANELS.map((panel) => {
                    const visible = !hidden.has(panel);
                    const title = t(PANEL_LABEL_KEYS[panel]);
                    return (
                      <div
                        key={panel}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5"
                      >
                        <span className="text-xs font-medium">{title}</span>
                        <SettingSwitch
                          checked={visible}
                          disabled={updating}
                          label={t("settings.showTab", { title })}
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
          ) : null}

          <p className="pt-1 text-[10px] text-muted-foreground">
            {t("settings.updated", {
              when: formatUpdatedAt(settings.updated_at, t),
            })}
          </p>
            </>
          ) : (
            <p className="panel-empty px-3 py-6 text-center text-xs italic">
              {t("settings.unavailable")}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function formatUpdatedAt(updatedAt: string, t: TFn): string {
  if (!updatedAt) return t("common.never");
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  return date.toLocaleString();
}
