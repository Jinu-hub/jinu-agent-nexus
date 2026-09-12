// ─────────────────────────────────────────────────────────────────────────
// report-topics — Topics chips / Keywords / Entities (Market Report)
// Split from ReportReader for portability; re-exported by ReportReader.tsx.
// ─────────────────────────────────────────────────────────────────────────

import {
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Star } from "lucide-react";
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
export const SHOW_REPORT_ENTITIES = false;
/** Sidebar Topics only. Ignored when master is false. */
export const SHOW_REPORT_ENTITIES_IN_TOPICS = false;

// ── T4 chip → Ask in chat (easy off-switch) ──────────────────────────────
/** When false, topic/entity chips stay non-clickable even if onAsk is passed. */
export const SHOW_TOPIC_CHIP_ASK = true;

// ── P1 chip → MyMemory star (easy off-switch) ────────────────────────────
/** When false, star buttons are hidden even if onToggleInterest is passed. */
export const SHOW_TOPIC_CHIP_STAR = true;

const TOPIC_TAG_LIMIT = 8;
const ENTITY_ITEM_LIMIT = 12;
/** Rotated entity/place picks (tags shown separately, not capped here). */
export const TOP_KEYWORD_LIMIT = 10;

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

const ENTITY_GROUP_ORDER_SET = new Set<string>(ENTITY_GROUP_ORDER);

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

/** Chip prefix like My interests (Company Fortum). */
const KEYWORD_SECTION_LABELS: Record<string, string> = {
  companies: "Company",
  institutions: "Institution",
  technologies: "Technology",
  industries: "Industry",
  products: "Product",
  indicators: "Indicator",
  persons: "Person",
  countries: "Place",
};

function keywordSectionLabel(source: TopicPreferenceSource): string {
  if (source.source === "place") return "Place";
  if (source.source === "tag") return "Tag";
  return KEYWORD_SECTION_LABELS[source.group] ?? source.group;
}

/** Display order: Company → Institution → … → Place (within group, keep pick order). */
function keywordSectionSortKey(source: TopicPreferenceSource): number {
  if (source.source === "place") return ENTITY_GROUP_ORDER.length + 1;
  if (source.source === "tag") return ENTITY_GROUP_ORDER.length + 2;
  if (source.source === "entity") {
    const idx = (ENTITY_GROUP_ORDER as readonly string[]).indexOf(source.group);
    return idx >= 0 ? idx : ENTITY_GROUP_ORDER.length;
  }
  return ENTITY_GROUP_ORDER.length + 3;
}

function sortKeywordsForDisplay(keywords: TopKeyword[]): TopKeyword[] {
  return [...keywords].sort((a, b) => {
    const aSec = keywordSectionSortKey(a.source);
    const bSec = keywordSectionSortKey(b.source);
    if (aSec !== bSec) return aSec - bSec;
    return a.label.localeCompare(b.label);
  });
}

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

export type TopKeyword = {
  /** Normalized dedupe key. */
  key: string;
  /** Original label for Ask / preference mapping. */
  label: string;
  /** UPPERCASE display for chips. */
  display: string;
  askKind: TopicChipAskKind;
  source: TopicPreferenceSource;
};

type KeywordCandidate = {
  label: string;
  askKind: TopicChipAskKind;
  source: TopicPreferenceSource;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

/** Places owns geo — hide entities.countries in legacy entities fold. */
const ENTITY_GROUPS_HIDDEN_IN_UI = new Set(["countries"]);

/** Normalize for overlap: "AI" ≈ "ai", "oil-prices" ≈ "oil prices". */
function normalizeTopicLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isKeywordSaved(
  source: TopicPreferenceSource,
  preferences: PreferenceRow[],
): boolean {
  const mapped = mapTopicToPreference(source);
  return (
    mapped != null &&
    isPreferenceSaved(preferences, mapped.kind, mapped.target)
  );
}

function toTopKeyword(c: KeywordCandidate): TopKeyword {
  const label = c.label.trim();
  return {
    key: normalizeTopicLabel(label),
    label,
    display: label.toLocaleUpperCase(),
    askKind: c.askKind,
    source: c.source,
  };
}

/**
 * Places (`countries`+`regions`) + `entities.countries` — merge/dedupe,
 * keep first occurrence (array head ≈ higher score).
 */
function buildPlacesQueue(
  fields: ReportTopicFields & { metadata?: unknown },
): KeywordCandidate[] {
  const out: KeywordCandidate[] = [];
  const seen = new Set<string>();
  const pushPlace = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = normalizeTopicLabel(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      label: trimmed,
      askKind: "place",
      source: { source: "place", label: trimmed },
    });
  };

  for (const label of asStringList(fields.countries)) pushPlace(label);
  for (const label of asStringList(fields.regions)) pushPlace(label);

  const meta = fields.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const entities = (meta as { entities?: unknown }).entities;
    if (entities && typeof entities === "object" && !Array.isArray(entities)) {
      for (const label of asStringList(
        (entities as Record<string, unknown>).countries,
      )) {
        pushPlace(label);
      }
    }
  }
  return out;
}

/** Per-section queues for round-robin (tags excluded — shown separately). */
function buildRotationQueues(
  fields: ReportTopicFields & { metadata?: unknown },
): KeywordCandidate[][] {
  const queues: KeywordCandidate[][] = [];
  const meta = fields.metadata;
  const record =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? ((meta as { entities?: unknown }).entities as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const entities =
    record && typeof record === "object" && !Array.isArray(record)
      ? record
      : null;

  const pushGroup = (group: string, labels: string[]) => {
    if (labels.length === 0) return;
    queues.push(
      labels.map((label) => ({
        label,
        askKind: "entity" as const,
        source: { source: "entity" as const, group, label },
      })),
    );
  };

  if (entities) {
    for (const group of ENTITY_GROUP_ORDER) {
      pushGroup(group, asStringList(entities[group]));
    }
    const extraGroups = Object.keys(entities)
      .filter(
        (g) =>
          !ENTITY_GROUP_ORDER_SET.has(g) &&
          !ENTITY_GROUPS_HIDDEN_IN_UI.has(g),
      )
      .sort();
    for (const group of extraGroups) {
      pushGroup(group, asStringList(entities[group]));
    }
  }

  const places = buildPlacesQueue(fields);
  if (places.length > 0) queues.push(places);

  return queues;
}

/**
 * Round-robin across entity groups + merged places (no tags).
 * Each turn: take the next unused head of each section (score ≈ array order).
 * Labels already in Tags are skipped so the next rank in that section is used.
 */
export function pickTopKeywords(
  fields: ReportTopicFields & { metadata?: unknown },
  opts?: {
    limit?: number;
    preferences?: PreferenceRow[];
    interestsOnly?: boolean;
  },
): TopKeyword[] {
  const limit = opts?.limit ?? TOP_KEYWORD_LIMIT;
  const prefs = opts?.preferences ?? [];

  let queues = buildRotationQueues(fields);
  if (opts?.interestsOnly) {
    queues = queues
      .map((q) => q.filter((c) => isKeywordSaved(c.source, prefs)))
      .filter((q) => q.length > 0);
  }

  const cursors = queues.map(() => 0);
  const seen = new Set<string>();
  for (const tag of asStringList(fields.tags)) {
    const key = normalizeTopicLabel(tag);
    if (key) seen.add(key);
  }
  const picked: TopKeyword[] = [];

  while (picked.length < limit) {
    let progressed = false;
    for (let i = 0; i < queues.length; i++) {
      const queue = queues[i]!;
      while (cursors[i]! < queue.length) {
        const candidate = queue[cursors[i]!]!;
        cursors[i]! += 1;
        const kw = toTopKeyword(candidate);
        if (!kw.key || seen.has(kw.key)) continue;
        seen.add(kw.key);
        picked.push(kw);
        progressed = true;
        break;
      }
      if (picked.length >= limit) break;
    }
    if (!progressed) break;
  }

  return picked;
}

export function hasTopKeywords(
  fields: ReportTopicFields & { metadata?: unknown },
): boolean {
  return (
    asStringList(fields.tags).length > 0 ||
    pickTopKeywords(fields, { limit: 1 }).length > 0
  );
}

/** Tags (full, as before) + rotated entity/place keywords (max 10, collapsible). */
export function ReportKeywordChips({
  tags,
  countries,
  regions,
  metadata,
  className,
  marketDate,
  onAsk,
  preferences,
  onToggleInterest,
  interestsOnly,
  limit = TOP_KEYWORD_LIMIT,
}: ReportTopicFields & {
  metadata?: unknown;
  className?: string;
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences?: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
  interestsOnly?: boolean;
  limit?: number;
}) {
  const [keywordsOpen, setKeywordsOpen] = useState(false);
  if (!SHOW_REPORT_TOPIC_CHIPS) return null;

  const prefs = preferences ?? [];
  const askEnabled = Boolean(onAsk) && SHOW_TOPIC_CHIP_ASK;
  const starEnabled = Boolean(onToggleInterest) && SHOW_TOPIC_CHIP_STAR;

  const allTags = asStringList(tags);
  let tagList = allTags.slice(0, TOPIC_TAG_LIMIT);
  let tagExtra = Math.max(0, allTags.length - tagList.length);
  if (interestsOnly) {
    tagList = allTags.filter((tag) =>
      isKeywordSaved({ source: "tag", label: tag }, prefs),
    );
    tagExtra = 0;
  }

  const keywords = sortKeywordsForDisplay(
    pickTopKeywords(
      { tags, countries, regions, metadata },
      { limit, preferences: prefs, interestsOnly },
    ),
  );

  const hasAny = tagList.length > 0 || keywords.length > 0;
  if (!hasAny) {
    if (
      interestsOnly &&
      hasTopKeywords({ tags, countries, regions, metadata })
    ) {
      return (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          No starred tags / keywords in this report.
        </p>
      );
    }
    return null;
  }

  const tagChipClass =
    "rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground/85";
  const keywordChipClass =
    "inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background py-0.5 pl-1.5 pr-1.5 text-[10px]";

  return (
    <div className={cn("space-y-2", className)}>
      {tagList.length > 0 ? (
        <div>
          <TopicFieldLabel>
            Tags
            <span className="ml-1 font-mono font-normal normal-case tracking-normal text-muted-foreground/60">
              {interestsOnly ? tagList.length : allTags.length}
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
                className={tagChipClass}
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
      {keywords.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/20">
          <button
            type="button"
            aria-expanded={keywordsOpen}
            onClick={() => setKeywordsOpen((v) => !v)}
            className={cn(
              "flex w-full items-center gap-1.5 px-2 py-1.5 text-left",
              "hover:bg-accent/40",
            )}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                keywordsOpen && "rotate-180",
              )}
            />
            <span className="text-[11px] font-medium text-foreground">
              Keywords
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {keywords.length}
              <span className="text-muted-foreground/50">/{limit}</span>
            </span>
          </button>
          {keywordsOpen ? (
            <div className="flex flex-wrap gap-1 border-t border-border px-2 py-2">
              {keywords.map((kw) => (
                <TopicChip
                  key={kw.key}
                  label={kw.label}
                  sectionLabel={keywordSectionLabel(kw.source)}
                  askKind={kw.askKind}
                  source={kw.source}
                  marketDate={marketDate}
                  onAsk={askEnabled ? onAsk : undefined}
                  preferences={prefs}
                  onToggleInterest={starEnabled ? onToggleInterest : undefined}
                  className={keywordChipClass}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
  interestsOnly,
}: ReportTopicFields & {
  className?: string;
  /** Panel market_date for Ask prompts (YYYY-MM-DD). */
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences?: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
  /** P2 — only show chips that are already starred. */
  interestsOnly?: boolean;
}) {
  if (!SHOW_REPORT_TOPIC_CHIPS) return null;
  if (!hasReportTopicFields({ tags, countries, regions })) return null;

  const prefs = preferences ?? [];
  const askEnabled = Boolean(onAsk) && SHOW_TOPIC_CHIP_ASK;
  const starEnabled = Boolean(onToggleInterest) && SHOW_TOPIC_CHIP_STAR;

  const allTags = asStringList(tags);
  let tagList = allTags.slice(0, TOPIC_TAG_LIMIT);
  let tagExtra = Math.max(0, allTags.length - tagList.length);
  let placeList = [
    ...asStringList(countries).map((c) => ({ key: `c:${c}`, label: c })),
    ...asStringList(regions).map((r) => ({ key: `r:${r}`, label: r })),
  ];

  if (interestsOnly) {
    tagList = allTags.filter((tag) => {
      const mapped = mapTopicToPreference({ source: "tag", label: tag });
      return (
        mapped != null &&
        isPreferenceSaved(prefs, mapped.kind, mapped.target)
      );
    });
    tagExtra = 0;
    placeList = placeList.filter((place) => {
      const mapped = mapTopicToPreference({
        source: "place",
        label: place.label,
      });
      return (
        mapped != null &&
        isPreferenceSaved(prefs, mapped.kind, mapped.target)
      );
    });
    if (tagList.length === 0 && placeList.length === 0) {
      return (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          No starred tags / places in this report.
        </p>
      );
    }
  }

  if (tagList.length === 0 && placeList.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {tagList.length > 0 ? (
        <div>
          <TopicFieldLabel>
            Tags
            <span className="ml-1 font-mono font-normal normal-case tracking-normal text-muted-foreground/60">
              {interestsOnly ? tagList.length : allTags.length}
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
                className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
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
  sectionLabel,
  askKind,
  source,
  marketDate,
  onAsk,
  preferences,
  onToggleInterest,
  className,
}: {
  label: string;
  /** Optional section prefix (Company / Place) — My interests style. */
  sectionLabel?: string;
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
  const askLabel = source.label;
  const body = sectionLabel ? (
    <>
      <span className="font-mono text-[9px] uppercase text-muted-foreground">
        {sectionLabel}
      </span>
      <span className="truncate text-foreground/85">{label}</span>
    </>
  ) : (
    label
  );

  return (
    <span className="inline-flex max-w-full items-center gap-0.5">
      {onAsk ? (
        <button
          type="button"
          title={`Ask in chat: ${askLabel}`}
          onClick={() =>
            onAsk(topicChipAskPrompt(askKind, askLabel, marketDate))
          }
          className={cn(
            className,
            "cursor-pointer transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            saved && "ring-1 ring-amber-500/40",
          )}
        >
          {body}
        </button>
      ) : (
        <span className={cn(className, saved && "ring-1 ring-amber-500/40")}>
          {body}
        </span>
      )}
      {onToggleInterest && mapped ? (
        <button
          type="button"
          title={
            saved ? `Remove interest: ${askLabel}` : `Save interest: ${askLabel}`
          }
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
  opts?: { omitGroupKeys?: ReadonlySet<string> },
): ReportEntityGroup[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const entities = (metadata as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    return [];
  }
  const bag = entities as Record<string, unknown>;
  const omit = opts?.omitGroupKeys;
  const keys = [
    ...ENTITY_GROUP_ORDER.filter((k) => k in bag),
    ...Object.keys(bag)
      .filter((k) => !(ENTITY_GROUP_ORDER as readonly string[]).includes(k))
      .sort(),
  ];
  const groups: ReportEntityGroup[] = [];
  for (const key of keys) {
    if (omit?.has(key)) continue;
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
  return (
    parseReportEntityGroups(metadata, {
      omitGroupKeys: ENTITY_GROUPS_HIDDEN_IN_UI,
    }).length > 0
  );
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
  interestsOnly,
}: {
  metadata?: unknown;
  placement?: "topics" | "modal";
  className?: string;
  marketDate?: string | null;
  onAsk?: (prompt: string) => void;
  preferences?: PreferenceRow[];
  onToggleInterest?: (source: TopicPreferenceSource) => void;
  interestsOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!SHOW_REPORT_ENTITIES) return null;
  if (placement === "topics" && !SHOW_REPORT_ENTITIES_IN_TOPICS) return null;

  const prefs = preferences ?? [];
  const askEnabled = Boolean(onAsk) && SHOW_TOPIC_CHIP_ASK;
  const starEnabled = Boolean(onToggleInterest) && SHOW_TOPIC_CHIP_STAR;

  let groups = parseReportEntityGroups(metadata, {
    omitGroupKeys: ENTITY_GROUPS_HIDDEN_IN_UI,
  });
  if (interestsOnly) {
    groups = groups
      .map((group) => {
        const items = group.items.filter((item) => {
          const mapped = mapTopicToPreference({
            source: "entity",
            group: group.key,
            label: item,
          });
          return (
            mapped != null &&
            isPreferenceSaved(prefs, mapped.kind, mapped.target)
          );
        });
        return { ...group, items, extra: 0 };
      })
      .filter((g) => g.items.length > 0);
    if (groups.length === 0) {
      return (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          No starred entities in this report.
        </p>
      );
    }
  }
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.items.length + g.extra, 0);
  const preview = groups
    .slice(0, 3)
    .map((g) => g.label)
    .join(" · ");
  // Auto-expand when filtering so matches are visible.
  const foldOpen = interestsOnly ? true : open;

  return (
    <div className={cn("rounded-md border border-border bg-muted/20", className)}>
      <button
        type="button"
        aria-expanded={foldOpen}
        onClick={() => {
          if (!interestsOnly) setOpen((v) => !v);
        }}
        className={cn(
          "flex w-full items-start gap-1.5 px-2 py-1.5 text-left",
          "hover:bg-accent/40",
          interestsOnly && "cursor-default",
        )}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            foldOpen && "rotate-180",
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
          {!foldOpen ? (
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {preview}
              {groups.length > 3 ? " · …" : ""}
              {" · "}
              tap to expand
            </span>
          ) : null}
        </span>
      </button>
      {foldOpen ? (
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
