// ─────────────────────────────────────────────────────────────────────────
// BriefForYou — P4 taste: collapsed row → modal with chips + sentences
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useState } from "react";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  briefForYouExcerptLines,
  matchBriefForYou,
  type BriefForYouHit,
} from "@/lib/brief-for-you";
import type { PreferenceRow } from "@/lib/topic-preference";

export const SHOW_BRIEF_FOR_YOU = true;

const KIND_LABEL: Record<string, string> = {
  theme: "Theme",
  company: "Company",
  industry: "Industry",
  asset: "Asset",
};

function InterestChips({ hits }: { hits: BriefForYouHit[] }) {
  return (
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
  );
}

function InterestLines({ hits }: { hits: BriefForYouHit[] }) {
  const lines = briefForYouExcerptLines(hits);
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-2 text-[11px] leading-relaxed text-foreground/90">
      {lines.map((hit) => (
        <li key={`${hit.target}:${hit.line}`} className="pl-0.5">
          <span className="font-medium text-amber-800 dark:text-amber-300">
            {hit.target}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="whitespace-pre-wrap wrap-break-word">{hit.line}</span>
        </li>
      ))}
    </ul>
  );
}

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
  const [open, setOpen] = useState(false);
  const titleId = useId();

  if (!SHOW_BRIEF_FOR_YOU) return null;

  const hits = matchBriefForYou(preferences, { pulse, takeaway, content });
  if (hits.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-left",
          "hover:bg-amber-500/15",
          className,
        )}
        title="Open For you"
      >
        <Star className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
          For you
        </span>
        <span className="font-mono text-[9px] text-amber-800/70 dark:text-amber-300/70">
          from interests · taste
        </span>
        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] text-amber-800 dark:text-amber-300">
          {hits.length}
        </span>
      </button>

      <BriefForYouModal
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        hits={hits}
      />
    </>
  );
}

function BriefForYouModal({
  open,
  onClose,
  titleId,
  hits,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  hits: BriefForYouHit[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-background/70 p-0 sm:items-center sm:justify-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "flex max-h-full w-full flex-col border border-border bg-background shadow-lg",
          "sm:max-h-[min(80vh,640px)] sm:max-w-md sm:rounded-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <p
              id={titleId}
              className="flex flex-wrap items-center gap-1.5 text-sm font-medium"
            >
              <Star className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              For you
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              from interests · taste
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <InterestChips hits={hits} />
          <InterestLines hits={hits} />
        </div>
      </div>
    </div>
  );
}
