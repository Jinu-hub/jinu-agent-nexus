// ─────────────────────────────────────────────────────────────────────────
// MyInterestsFold — saved MyMemory preferences (P1) + in-report (P2)
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronDown, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  interestInReport,
  sortPreferencesForReport,
  type PreferenceRow,
} from "@/lib/topic-preference";

export const SHOW_MY_INTERESTS = true;
/** P2 — “Interests in this report” filter toggle under Topics. */
export const SHOW_INTERESTS_ONLY_FILTER = true;

const KIND_LABEL: Record<string, string> = {
  theme: "Theme",
  company: "Company",
  industry: "Industry",
  asset: "Asset",
};

export function MyInterestsFold({
  preferences,
  loading,
  onRemove,
  reportKeys,
  interestsOnly,
  onInterestsOnlyChange,
  className,
}: {
  preferences: PreferenceRow[];
  loading?: boolean;
  onRemove?: (row: PreferenceRow) => void;
  /** Preference keys found in the loaded report (P2). */
  reportKeys?: Set<string> | null;
  interestsOnly?: boolean;
  onInterestsOnlyChange?: (next: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  if (!SHOW_MY_INTERESTS) return null;

  const sorted = sortPreferencesForReport(preferences, reportKeys);
  const visible =
    interestsOnly && reportKeys
      ? sorted.filter((row) => interestInReport(row, reportKeys))
      : sorted;
  const count = preferences.length;
  const visibleCount = visible.length;
  const inReportCount = reportKeys
    ? sorted.filter((row) => interestInReport(row, reportKeys)).length
    : 0;
  const showFilter =
    SHOW_INTERESTS_ONLY_FILTER &&
    Boolean(onInterestsOnlyChange) &&
    Boolean(reportKeys && reportKeys.size > 0);

  return (
    <div className={cn("rounded-md border border-border bg-muted/20", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1.5 text-left",
          "hover:bg-accent/40",
        )}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <Star className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-[11px] font-medium text-foreground">
          My interests
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {loading ? "…" : count}
        </span>
        {!loading && reportKeys && inReportCount > 0 ? (
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-800 dark:text-amber-300">
            {inReportCount} in report
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-border px-2 py-2">
          {showFilter ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={Boolean(interestsOnly)}
                onChange={(e) => onInterestsOnlyChange?.(e.target.checked)}
                className="size-3 rounded border-border"
              />
              Show interests in this report only
            </label>
          ) : null}
          {loading ? (
            <p className="text-[10px] text-muted-foreground">Loading…</p>
          ) : count === 0 ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Star a Topics chip to save an interest here.
            </p>
          ) : visibleCount === 0 ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              None of your interests appear in this report.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {visible.map((row) => {
                const inReport = interestInReport(row, reportKeys);
                return (
                  <span
                    key={`${row.kind}:${row.target}`}
                    className={cn(
                      "inline-flex max-w-full items-center gap-0.5 rounded-md",
                      "border pl-1.5 text-[10px]",
                      inReport
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-border bg-background",
                    )}
                  >
                    <span className="font-mono text-[9px] uppercase text-muted-foreground">
                      {KIND_LABEL[row.kind] ?? row.kind}
                    </span>
                    <span className="truncate text-foreground/85">
                      {row.target}
                    </span>
                    {inReport ? (
                      <span className="shrink-0 pr-0.5 font-mono text-[9px] text-amber-700 dark:text-amber-300">
                        in report
                      </span>
                    ) : null}
                    {onRemove ? (
                      <button
                        type="button"
                        title={`Remove ${row.target}`}
                        onClick={() => onRemove(row)}
                        className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
