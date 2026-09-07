// ─────────────────────────────────────────────────────────────────────────
// ReportReader — Market full-report wide reader (modal + ## TOC)
// Used by MarketPanel: Open wide reader / Brief Report badge / Maximize.
// T1 chips + T2 entities + T4 Ask + P1 star interests — toggles below.
// ─────────────────────────────────────────────────────────────────────────

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  topicChipAskPrompt,
  type TopicChipAskKind,
} from "@/lib/market-suggestions";
import {
  isPreferenceSaved,
  mapTopicToPreference,
  type PreferenceRow,
  type TopicPreferenceSource,
} from "@/lib/topic-preference";

// ── T1 topic chips (easy off-switches) ───────────────────────────────────
/** Master: hide chips in Topics section AND report modal when false. */
export const SHOW_REPORT_TOPIC_CHIPS = true;
/** Sidebar Topics section (outside Report). Ignored when master is false. */
export const SHOW_TOPICS_SECTION = true;

// ── T2 entities fold (easy off-switches) ─────────────────────────────────
/** Master: hide entities fold in Topics + modal when false. */
export const SHOW_REPORT_ENTITIES = true;
/** Sidebar Topics only. Ignored when master is false. */
export const SHOW_REPORT_ENTITIES_IN_TOPICS = true;

// ── T4 chip → Ask in chat (easy off-switch) ──────────────────────────────
/** When false, topic/entity chips stay non-clickable even if onAsk is passed. */
export const SHOW_TOPIC_CHIP_ASK = true;

// ── P1 chip → MyMemory star (easy off-switch) ────────────────────────────
/** When false, star buttons are hidden even if onToggleInterest is passed. */
export const SHOW_TOPIC_CHIP_STAR = true;

const TOPIC_TAG_LIMIT = 8;
const ENTITY_ITEM_LIMIT = 12;

/** Preferred display order; empty groups are skipped. */
const ENTITY_GROUP_ORDER = [
  "companies",
  "institutions",
  "technologies",
  "industries",
  "products",
  "indicators",
  "persons",
] as const;

const ENTITY_GROUP_LABELS: Record<string, string> = {
  companies: "Companies",
  institutions: "Institutions",
  technologies: "Technologies",
  industries: "Industries",
  products: "Products",
  indicators: "Indicators",
  persons: "Persons",
  countries: "Countries",
};

export type ReportTopicFields = {
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
};

export type ReportEntityGroup = {
  key: string;
  label: string;
  items: string[];
  extra: number;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

export function ReportTopicChips({
  tags,
  countries,
  regions,
  className,
  marketDate,
  onAsk,
  preferences,
  onToggleInterest,
}: ReportTopicFields & {
  className?: string;
  /** Panel market_date for Ask prompts (YYYY-MM-DD). */
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences?: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
}) {
  if (!SHOW_REPORT_TOPIC_CHIPS) return null;
  if (!hasReportTopicFields({ tags, countries, regions })) return null;

  const allTags = asStringList(tags);
  const tagList = allTags.slice(0, TOPIC_TAG_LIMIT);
  const tagExtra = Math.max(0, allTags.length - tagList.length);
  const placeList = [
    ...asStringList(countries).map((c) => ({ key: `c:${c}`, label: c })),
    ...asStringList(regions).map((r) => ({ key: `r:${r}`, label: r })),
  ];
  const askEnabled = Boolean(onAsk) && SHOW_TOPIC_CHIP_ASK;
  const starEnabled = Boolean(onToggleInterest) && SHOW_TOPIC_CHIP_STAR;
  const prefs = preferences ?? [];

  return (
    <div className={cn("space-y-2", className)}>
      {tagList.length > 0 ? (
        <div>
          <TopicFieldLabel>
            Tags
            <span className="ml-1 font-mono font-normal normal-case tracking-normal text-muted-foreground/60">
              {allTags.length}
            </span>
          </TopicFieldLabel>
          <div className="flex flex-wrap gap-1">
            {tagList.map((tag) => (
              <TopicChip
                key={`tag:${tag}`}
                label={tag}
                askKind="tag"
                source={{ source: "tag", label: tag }}
                marketDate={marketDate}
                onAsk={askEnabled ? onAsk : undefined}
                preferences={prefs}
                onToggleInterest={starEnabled ? onToggleInterest : undefined}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-foreground/85"
              />
            ))}
            {tagExtra > 0 ? (
              <span className="self-center font-mono text-[10px] text-muted-foreground/70">
                +{tagExtra} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {placeList.length > 0 ? (
        <div>
          <TopicFieldLabel>
            Places
            <span className="ml-1 font-mono font-normal normal-case tracking-normal text-muted-foreground/60">
              {placeList.length}
            </span>
          </TopicFieldLabel>
          <div className="flex flex-wrap gap-1">
            {placeList.map((place) => (
              <TopicChip
                key={place.key}
                label={place.label}
                askKind="place"
                source={{ source: "place", label: place.label }}
                marketDate={marketDate}
                onAsk={askEnabled ? onAsk : undefined}
                preferences={prefs}
                onToggleInterest={starEnabled ? onToggleInterest : undefined}
                className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopicChip({
  label,
  askKind,
  source,
  marketDate,
  onAsk,
  preferences,
  onToggleInterest,
  className,
}: {
  label: string;
  askKind: TopicChipAskKind;
  source: TopicPreferenceSource;
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
  className?: string;
}) {
  const mapped = mapTopicToPreference(source);
  const saved =
    mapped != null &&
    isPreferenceSaved(preferences, mapped.kind, mapped.target);

  return (
    <span className="inline-flex max-w-full items-center gap-0.5">
      {onAsk ? (
        <button
          type="button"
          title={`Ask in chat: ${label}`}
          onClick={() => onAsk(topicChipAskPrompt(askKind, label, marketDate))}
          className={cn(
            className,
            "cursor-pointer transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            saved && "ring-1 ring-amber-500/40",
          )}
        >
          {label}
        </button>
      ) : (
        <span className={cn(className, saved && "ring-1 ring-amber-500/40")}>
          {label}
        </span>
      )}
      {onToggleInterest && mapped ? (
        <button
          type="button"
          title={saved ? `Remove interest: ${label}` : `Save interest: ${label}`}
          aria-pressed={saved}
          onClick={() => onToggleInterest(source)}
          className={cn(
            "rounded-md p-0.5 transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            saved
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground/50 hover:text-muted-foreground",
          )}
        >
          <Star className={cn("h-3 w-3", saved && "fill-current")} />
        </button>
      ) : null}
    </span>
  );
}

function TopicFieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function hasReportTopicFields({
  tags,
  countries,
  regions,
}: ReportTopicFields): boolean {
  return (
    asStringList(tags).length > 0 ||
    asStringList(countries).length > 0 ||
    asStringList(regions).length > 0
  );
}

/** Read `metadata.entities` — only non-empty string lists. */
export function parseReportEntityGroups(
  metadata: unknown,
): ReportEntityGroup[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const entities = (metadata as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    return [];
  }
  const bag = entities as Record<string, unknown>;
  const keys = [
    ...ENTITY_GROUP_ORDER.filter((k) => k in bag),
    ...Object.keys(bag)
      .filter((k) => !(ENTITY_GROUP_ORDER as readonly string[]).includes(k))
      .sort(),
  ];
  const groups: ReportEntityGroup[] = [];
  for (const key of keys) {
    const all = asStringList(bag[key]);
    if (all.length === 0) continue;
    const items = all.slice(0, ENTITY_ITEM_LIMIT);
    groups.push({
      key,
      label: ENTITY_GROUP_LABELS[key] ?? key,
      items,
      extra: Math.max(0, all.length - items.length),
    });
  }
  return groups;
}

export function hasReportEntityGroups(metadata: unknown): boolean {
  return parseReportEntityGroups(metadata).length > 0;
}

/**
 * Collapsed-by-default entities fold (T2). T4 Ask + P1 star via chip props.
 * `placement`: topics = sidebar Topics; modal = wide reader.
 */
export function ReportEntitiesFold({
  metadata,
  placement = "modal",
  className,
  marketDate,
  onAsk,
  preferences,
  onToggleInterest,
}: {
  metadata?: unknown;
  placement?: "topics" | "modal";
  className?: string;
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences?: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!SHOW_REPORT_ENTITIES) return null;
  if (placement === "topics" && !SHOW_REPORT_ENTITIES_IN_TOPICS) return null;

  const groups = parseReportEntityGroups(metadata);
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.items.length + g.extra, 0);
  const preview = groups
    .slice(0, 3)
    .map((g) => g.label)
    .join(" · ");
  const askEnabled = Boolean(onAsk) && SHOW_TOPIC_CHIP_ASK;
  const starEnabled = Boolean(onToggleInterest) && SHOW_TOPIC_CHIP_STAR;
  const prefs = preferences ?? [];

  return (
    <div className={cn("rounded-md border border-border bg-muted/20", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-1.5 px-2 py-1.5 text-left",
          "hover:bg-accent/40",
        )}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-[11px] font-medium text-foreground">
              Named entities
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {total}
            </span>
          </span>
          {!open ? (
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {preview}
              {groups.length > 3 ? " · …" : ""}
              {" · "}
              tap to expand
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="space-y-2.5 border-t border-border px-2 py-2">
          {groups.map((group) => {
            const count = group.items.length + group.extra;
            return (
              <div key={group.key}>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-foreground">
                    {group.label}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {count}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.items.map((item) => (
                    <TopicChip
                      key={`${group.key}:${item}`}
                      label={item}
                      askKind="entity"
                      source={{
                        source: "entity",
                        group: group.key,
                        label: item,
                      }}
                      marketDate={marketDate}
                      onAsk={askEnabled ? onAsk : undefined}
                      preferences={prefs}
                      onToggleInterest={
                        starEnabled ? onToggleInterest : undefined
                      }
                      className="rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-[10px] leading-snug text-foreground/85"
                    />
                  ))}
                  {group.extra > 0 ? (
                    <span className="self-center font-mono text-[10px] text-muted-foreground/70">
                      +{group.extra} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

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
            <ReportTopicChips
              tags={tags}
              countries={countries}
              regions={regions}
              marketDate={marketDate}
              onAsk={onAsk}
              preferences={preferences}
              onToggleInterest={onToggleInterest}
            />
            <ReportEntitiesFold
              metadata={metadata}
              placement="modal"
              marketDate={marketDate}
              onAsk={onAsk}
              preferences={preferences}
              onToggleInterest={onToggleInterest}
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
