// ─────────────────────────────────────────────────────────────────────────
// BriefForYou — P4 taste: surface interest-matching Brief lines
// (string match now · vector later)
// ─────────────────────────────────────────────────────────────────────────

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  briefForYouExcerptLines,
  matchBriefForYou,
} from "@/lib/brief-for-you";
import type { PreferenceRow } from "@/lib/topic-preference";

export const SHOW_BRIEF_FOR_YOU = true;

const KIND_LABEL: Record<string, string> = {
  theme: "Theme",
  company: "Company",
  industry: "Industry",
  asset: "Asset",
};

export function BriefForYou({
  preferences,
  pulse,
  takeaway,
  content,
  className,
}: {
  preferences: PreferenceRow[];
  pulse?: string | null;
  takeaway?: string | null;
  content?: string | null;
  className?: string;
}) {
  if (!SHOW_BRIEF_FOR_YOU) return null;

  const hits = matchBriefForYou(preferences, { pulse, takeaway, content });
  if (hits.length === 0) return null;

  const lines = briefForYouExcerptLines(hits);

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Star className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
          For you
        </span>
        <span className="font-mono text-[9px] text-amber-800/70 dark:text-amber-300/70">
          from interests · taste
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {hits.map((hit) => (
          <span
            key={`${hit.kind}:${hit.target}`}
            className={cn(
              "inline-flex max-w-full items-center gap-0.5 rounded-md",
              "border border-amber-500/40 bg-background/60 px-1.5 py-0.5 text-[10px]",
            )}
          >
            <span className="font-mono text-[9px] uppercase text-muted-foreground">
              {KIND_LABEL[hit.kind] ?? hit.kind}
            </span>
            <span className="truncate text-foreground/85">{hit.target}</span>
          </span>
        ))}
      </div>
      <ul className="space-y-1 text-[10px] leading-relaxed text-foreground/90">
        {lines.map((hit) => (
          <li key={`${hit.target}:${hit.line}`} className="pl-0.5">
            <span className="font-medium text-amber-800 dark:text-amber-300">
              {hit.target}
            </span>
            <span className="text-muted-foreground"> · </span>
            <span>{hit.line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
