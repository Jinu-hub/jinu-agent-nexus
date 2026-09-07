// ─────────────────────────────────────────────────────────────────────────
// MyInterestsFold — saved MyMemory preferences (P1)
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronDown, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreferenceRow } from "@/lib/topic-preference";

export const SHOW_MY_INTERESTS = true;

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
  className,
}: {
  preferences: PreferenceRow[];
  loading?: boolean;
  onRemove?: (row: PreferenceRow) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  if (!SHOW_MY_INTERESTS) return null;

  const count = preferences.length;

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
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-border px-2 py-2">
          {loading ? (
            <p className="text-[10px] text-muted-foreground">Loading…</p>
          ) : count === 0 ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Star a Topics chip to save an interest here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {preferences.map((row) => (
                <span
                  key={`${row.kind}:${row.target}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-0.5 rounded-md",
                    "border border-border bg-background pl-1.5 text-[10px]",
                  )}
                >
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    {KIND_LABEL[row.kind] ?? row.kind}
                  </span>
                  <span className="truncate text-foreground/85">{row.target}</span>
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
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
