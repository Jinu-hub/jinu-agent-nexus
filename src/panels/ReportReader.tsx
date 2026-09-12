// ─────────────────────────────────────────────────────────────────────────
// ReportReader — Market full-report wide reader (modal + ## TOC)
// Topics UI lives in report-topics.tsx (re-exported below for stable imports).
// ─────────────────────────────────────────────────────────────────────────

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PreferenceRow,
  TopicPreferenceSource,
} from "@/lib/topic-preference";
import { ReportKeywordChips } from "./report-topics";

export {
  SHOW_REPORT_TOPIC_CHIPS,
  SHOW_TOPICS_SECTION,
  SHOW_REPORT_ENTITIES,
  SHOW_REPORT_ENTITIES_IN_TOPICS,
  SHOW_TOPIC_CHIP_ASK,
  SHOW_TOPIC_CHIP_STAR,
  TOP_KEYWORD_LIMIT,
  pickTopKeywords,
  hasTopKeywords,
  ReportKeywordChips,
  ReportTopicChips,
  hasReportTopicFields,
  parseReportEntityGroups,
  hasReportEntityGroups,
  ReportEntitiesFold,
  type ReportTopicFields,
  type ReportEntityGroup,
  type TopKeyword,
} from "./report-topics";

export type ReportSection = {
  title: string;
  id: string;
};

export function extractReportSections(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(/^##\s+(.+)$/gm)) {
    const title = match[1].trim();
    if (!title) continue;
    let id = `rpt-${slugifyHeading(title)}`;
    if (seen.has(id)) id = `${id}-${seen.size}`;
    seen.add(id);
    sections.push({ title, id });
  }
  return sections;
}

function slugifyHeading(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\uac00-\ud7a3-]/g, "")
      .slice(0, 48) || "section"
  );
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (typeof node === "object" && "props" in node) {
    const el = node as { props?: { children?: ReactNode } };
    return flattenText(el.props?.children);
  }
  return "";
}

export function ReportToc({
  sections,
  onJump,
  className,
}: {
  sections: ReportSection[];
  onJump: (id: string) => void;
  className?: string;
}) {
  if (sections.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onJump(s.id)}
          className={cn(
            "rounded-md border border-border bg-background px-1.5 py-0.5",
            "text-[10px] text-muted-foreground",
            "hover:border-foreground/30 hover:bg-accent hover:text-foreground",
          )}
        >
          {s.title}
        </button>
      ))}
    </div>
  );
}

export function jumpToSection(container: HTMLElement | null, id: string) {
  if (!container) return;
  const el = container.querySelector(`#${CSS.escape(id)}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** In-panel or modal article with ## ids for TOC. */
export function ReportArticle({
  content,
  sections,
  scrollRef,
  className,
  compact,
}: {
  content: string;
  sections: ReportSection[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** Tighter type for sidebar preview. */
  compact?: boolean;
}) {
  const idForTitle = new Map(sections.map((s) => [s.title, s.id]));

  return (
    <div
      ref={scrollRef}
      className={cn(
        "overflow-y-auto leading-relaxed",
        compact ? "text-[11px]" : "text-[12px]",
        compact
          ? "[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-xs"
          : "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm",
        "[&_h2]:scroll-mt-3 [&_h2]:font-semibold",
        "[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-[11px] [&_h3]:font-semibold",
        "[&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5",
        "[&_hr]:my-3 [&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children, ...props }) => {
            const text = flattenText(children);
            const id = idForTitle.get(text);
            return (
              <h2 id={id} {...props}>
                {children}
              </h2>
            );
          },
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ReportReaderModal({
  open,
  onClose,
  title,
  meta,
  summary,
  content,
  dateMismatch,
  tags,
  countries,
  regions,
  metadata,
  marketDate,
  onAsk,
  preferences,
  onToggleInterest,
  interestsOnly,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: string | null;
  summary?: string | null;
  content: string;
  dateMismatch?: string | null;
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences?: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
  interestsOnly?: boolean;
}) {
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sections = extractReportSections(content);

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
          "flex h-full w-full flex-col border border-border bg-background shadow-lg",
          "sm:h-[min(90vh,880px)] sm:max-w-2xl sm:rounded-lg",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <p id={titleId} className="text-sm font-medium leading-snug">
              {title}
            </p>
            {meta ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                {meta}
              </p>
            ) : null}
            {dateMismatch ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                {dateMismatch}
              </p>
            ) : null}
            <ReportKeywordChips
              tags={tags}
              countries={countries}
              regions={regions}
              metadata={metadata}
              marketDate={marketDate}
              onAsk={onAsk}
              preferences={preferences}
              onToggleInterest={onToggleInterest}
              interestsOnly={interestsOnly}
            />
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

        <div className="space-y-2 border-b border-border px-3 py-2">
          {summary ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {summary}
            </p>
          ) : null}
          <ReportToc
            sections={sections}
            onJump={(id) => jumpToSection(scrollRef.current, id)}
          />
        </div>

        <ReportArticle
          content={content}
          sections={sections}
          scrollRef={scrollRef}
          className="min-h-0 flex-1 px-3 py-3"
        />
      </div>
    </div>
  );
}
