// ─────────────────────────────────────────────────────────────────────────
// P0 — Topics chip → MyMemory preference mapping
// P1 — thin HTTP helpers for /memory/preferences (+ star event)
// ─────────────────────────────────────────────────────────────────────────
//
// Mapping (fixed for P0/P1):
//   tag / place              → theme
//   entity.companies|
//     institutions           → company
//   entity.industries        → industry
//   entity.technologies|
//     products|indicators|
//     persons|countries|…    → theme
//
// Places stay theme for now (no geo kind yet).
// category = product domain (default market); kind = chip type above.
// ─────────────────────────────────────────────────────────────────────────

import { authFetch } from "./auth-fetch";
import {
  DEFAULT_PREFERENCE_CATEGORY,
  normalizePreferenceCategory,
  type PreferenceCategory,
} from "./preference-category";

export type PreferenceKind = "industry" | "company" | "asset" | "theme";

export type { PreferenceCategory };
export { DEFAULT_PREFERENCE_CATEGORY, normalizePreferenceCategory };

export type PreferenceRow = {
  category: PreferenceCategory;
  kind: PreferenceKind;
  target: string;
  level: number;
  /** Preferred UI label from first star; null → show target / lexicon. */
  display?: string | null;
  updated_at: string;
};

export type TopicPreferenceSource =
  | { source: "tag"; label: string; display?: string }
  | { source: "place"; label: string; display?: string }
  | { source: "entity"; group: string; label: string; display?: string };

/** Explicit star save level (1–5). */
export const INTEREST_STAR_LEVEL = 5;

const COMPANY_GROUPS = new Set(["companies", "institutions"]);
const INDUSTRY_GROUPS = new Set(["industries"]);

/** Match key within a category (report tags ↔ preference kind/target). */
export function preferenceKey(kind: PreferenceKind, target: string): string {
  return `${kind}:${preferenceTargetKey(target)}`;
}

/** Kind-agnostic target — Tag OpenAI and Company OpenAI share this. */
export function preferenceTargetKey(target: string): string {
  return target.trim().toLowerCase();
}

/** Unique id across categories for saved-state sets. */
export function preferenceId(
  category: PreferenceCategory | null | undefined,
  kind: PreferenceKind,
  target: string,
): string {
  return `${normalizePreferenceCategory(category)}:${preferenceKey(kind, target)}`;
}

export function mapTopicToPreference(
  input: TopicPreferenceSource,
): { kind: PreferenceKind; target: string } | null {
  const target = input.label.trim();
  if (!target) return null;

  if (input.source === "tag" || input.source === "place") {
    return { kind: "theme", target };
  }

  const group = input.group.trim().toLowerCase();
  if (COMPANY_GROUPS.has(group)) {
    return { kind: "company", target };
  }
  if (INDUSTRY_GROUPS.has(group)) {
    return { kind: "industry", target };
  }
  // technologies, products, indicators, persons, countries, unknown → theme
  return { kind: "theme", target };
}

export function isPreferenceSaved(
  prefs: PreferenceRow[],
  kind: PreferenceKind,
  target: string,
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): boolean {
  const id = preferenceId(category, kind, target);
  return prefs.some(
    (p) => preferenceId(p.category, p.kind, p.target) === id,
  );
}

/** Saved rows for one target (any kind) within a category. */
export function preferencesForTarget(
  prefs: PreferenceRow[],
  target: string,
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): PreferenceRow[] {
  const t = preferenceTargetKey(target);
  if (!t) return [];
  const cat = normalizePreferenceCategory(category);
  return prefs.filter(
    (p) =>
      normalizePreferenceCategory(p.category) === cat &&
      preferenceTargetKey(p.target) === t,
  );
}

/** Star state for Topics chips — Tag OpenAI covers Company OpenAI and vice versa. */
export function isTargetSaved(
  prefs: PreferenceRow[],
  target: string,
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): boolean {
  return preferencesForTarget(prefs, target, category).length > 0;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

function addMapped(
  keys: Set<string>,
  source: TopicPreferenceSource,
): void {
  const mapped = mapTopicToPreference(source);
  if (mapped) keys.add(preferenceKey(mapped.kind, mapped.target));
}

/**
 * P2 — preference keys present in a report's tags / places / entities.
 * Used for "in today’s report" badges and interests-only filter.
 */
export function collectReportPreferenceKeys(report: {
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
}): Set<string> {
  const keys = new Set<string>();
  for (const tag of asStringList(report.tags)) {
    addMapped(keys, { source: "tag", label: tag });
  }
  for (const place of [
    ...asStringList(report.countries),
    ...asStringList(report.regions),
  ]) {
    addMapped(keys, { source: "place", label: place });
  }

  const meta = report.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return keys;
  const entities = (meta as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    return keys;
  }
  for (const [group, value] of Object.entries(
    entities as Record<string, unknown>,
  )) {
    for (const label of asStringList(value)) {
      addMapped(keys, { source: "entity", group, label });
    }
  }
  return keys;
}

/**
 * True when this interest appears in the report under any kind.
 * Tag OpenAI (theme) matches Company OpenAI in entities and vice versa —
 * users follow the name, not the chip taxonomy.
 */
export function interestInReport(
  row: Pick<PreferenceRow, "kind" | "target">,
  reportKeys: Set<string> | null | undefined,
): boolean {
  if (!reportKeys || reportKeys.size === 0) return false;
  if (reportKeys.has(preferenceKey(row.kind, row.target))) return true;
  const target = preferenceTargetKey(row.target);
  if (!target) return false;
  for (const key of reportKeys) {
    const colon = key.indexOf(":");
    if (colon >= 0 && key.slice(colon + 1) === target) return true;
  }
  return false;
}

/**
 * When the same target is saved under multiple kinds, keep one row for
 * For-you / personalization (prefer higher level, then more specific kind).
 */
const PREFERENCE_KIND_SPECIFICITY: Record<PreferenceKind, number> = {
  company: 0,
  industry: 1,
  asset: 2,
  theme: 3,
};

export function dedupePreferencesByTarget(
  prefs: PreferenceRow[],
): PreferenceRow[] {
  const sorted = [...prefs].sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    const aSpec = PREFERENCE_KIND_SPECIFICITY[a.kind] ?? 99;
    const bSpec = PREFERENCE_KIND_SPECIFICITY[b.kind] ?? 99;
    if (aSpec !== bSpec) return aSpec - bSpec;
    return a.target.localeCompare(b.target);
  });
  const seen = new Set<string>();
  const out: PreferenceRow[] = [];
  for (const row of sorted) {
    const t = preferenceTargetKey(row.target);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(row);
  }
  return out;
}

const PREFERENCE_KIND_ORDER: Record<PreferenceKind, number> = {
  theme: 0,
  company: 1,
  industry: 2,
  asset: 3,
};

/** Sort: kind (Tag/theme → Company → Industry → Asset), then in-report, level, target. */
export function sortPreferencesForReport(
  prefs: PreferenceRow[],
  reportKeys: Set<string> | null | undefined,
): PreferenceRow[] {
  return [...prefs].sort((a, b) => {
    const aKind = PREFERENCE_KIND_ORDER[a.kind] ?? 99;
    const bKind = PREFERENCE_KIND_ORDER[b.kind] ?? 99;
    if (aKind !== bKind) return aKind - bKind;
    const aIn = interestInReport(a, reportKeys) ? 0 : 1;
    const bIn = interestInReport(b, reportKeys) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    if (b.level !== a.level) return b.level - a.level;
    return a.target.localeCompare(b.target);
  });
}

export async function fetchPreferences(
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): Promise<PreferenceRow[]> {
  const qs = new URLSearchParams();
  const cat = normalizePreferenceCategory(category);
  qs.set("category", cat);
  const res = await authFetch(`/memory/preferences?${qs}`);
  if (!res.ok) {
    throw new Error(`preferences HTTP ${res.status}`);
  }
  const json = (await res.json()) as PreferenceRow[] | { error?: string };
  if (!Array.isArray(json)) {
    throw new Error(
      typeof json === "object" && json && "error" in json && json.error
        ? String(json.error)
        : "Invalid preferences response",
    );
  }
  return json;
}

/** Upsert preference at star level and record a star event. */
export async function saveInterest(
  kind: PreferenceKind,
  target: string,
  display?: string | null,
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): Promise<PreferenceRow> {
  const cat = normalizePreferenceCategory(category);
  const trimmed = target.trim();
  const all = await fetchPreferences(cat);
  const same = preferencesForTarget(all, trimmed, cat);
  if (same.length > 0) {
    const canonical = dedupePreferencesByTarget(same)[0]!;
    const incomingSpec = PREFERENCE_KIND_SPECIFICITY[kind] ?? 99;
    const bestSpec = PREFERENCE_KIND_SPECIFICITY[canonical.kind] ?? 99;
    if (incomingSpec > bestSpec) {
      return canonical;
    }
    for (const row of same) {
      await removeInterest(row.kind, row.target, cat);
    }
  }

  const body = {
    category: cat,
    kind,
    target: trimmed,
    level: INTEREST_STAR_LEVEL,
    display:
      typeof display === "string" && display.trim() ? display.trim() : undefined,
  };
  const res = await authFetch("/memory/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || `save interest HTTP ${res.status}`);
  }
  const row = (await res.json()) as PreferenceRow;

  // Best-effort history — preference already saved if this fails.
  void authFetch("/memory/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "star",
      category: cat,
      kind,
      target: body.target,
      meta: { source: "topics_chip", display: body.display ?? null },
    }),
  });

  return row;
}

export async function fetchTopicLabels(
  keys?: string[],
  lang?: string | null,
): Promise<Record<string, string>> {
  const qs = new URLSearchParams();
  if (keys && keys.length > 0) qs.set("keys", keys.join(","));
  if (lang?.trim()) qs.set("lang", lang.trim().toLowerCase());
  const q = qs.toString();
  const url = q ? `/memory/topic-labels?${q}` : "/memory/topic-labels";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`topic-labels HTTP ${res.status}`);
  }
  const json = (await res.json()) as
    | Record<string, string>
    | Array<{ key: string; display: string; lang?: string }>
    | { error?: string };
  if (Array.isArray(json)) {
    const out: Record<string, string> = {};
    for (const row of json) {
      if (row.key && row.display) out[row.key] = row.display;
    }
    return out;
  }
  if (json && typeof json === "object" && !("error" in json)) {
    return json as Record<string, string>;
  }
  throw new Error(
    typeof json === "object" && json && "error" in json && json.error
      ? String(json.error)
      : "Invalid topic-labels response",
  );
}

export async function removeInterest(
  kind: PreferenceKind,
  target: string,
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): Promise<void> {
  const cat = normalizePreferenceCategory(category);
  const res = await authFetch("/memory/preferences", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: cat,
      kind,
      target: target.trim(),
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || `remove interest HTTP ${res.status}`);
  }
}

/** Unstar every kind row for this target (one OpenAI, not tag vs company). */
export async function removeInterestsForTarget(
  target: string,
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): Promise<void> {
  const cat = normalizePreferenceCategory(category);
  const rows = preferencesForTarget(await fetchPreferences(cat), target, cat);
  await Promise.all(
    rows.map((row) => removeInterest(row.kind, row.target, cat)),
  );
}

/** Toggle star from a Topics chip — merge kinds on save, clear all on remove. */
export async function toggleTopicPreference(
  source: TopicPreferenceSource,
  prefs: PreferenceRow[],
  category: PreferenceCategory | null | undefined = DEFAULT_PREFERENCE_CATEGORY,
): Promise<PreferenceRow[]> {
  const mapped = mapTopicToPreference(source);
  if (!mapped) return prefs;
  const cat = normalizePreferenceCategory(category);
  const t = preferenceTargetKey(mapped.target);
  const withoutTarget = (list: PreferenceRow[]) =>
    list.filter(
      (p) =>
        !(
          normalizePreferenceCategory(p.category) === cat &&
          preferenceTargetKey(p.target) === t
        ),
    );

  const same = preferencesForTarget(prefs, mapped.target, cat);
  if (same.length > 0) {
    const canonical = dedupePreferencesByTarget(same)[0]!;
    const incomingSpec = PREFERENCE_KIND_SPECIFICITY[mapped.kind] ?? 99;
    const bestSpec = PREFERENCE_KIND_SPECIFICITY[canonical.kind] ?? 99;
    if (incomingSpec < bestSpec) {
      const row = await saveInterest(
        mapped.kind,
        mapped.target,
        source.display ?? null,
        cat,
      );
      return [row, ...withoutTarget(prefs)];
    }
    if (incomingSpec > bestSpec) {
      return prefs;
    }
    if (canonical.kind === mapped.kind) {
      await removeInterestsForTarget(mapped.target, cat);
      return withoutTarget(prefs);
    }
    await removeInterestsForTarget(mapped.target, cat);
    return withoutTarget(prefs);
  }

  const row = await saveInterest(
    mapped.kind,
    mapped.target,
    source.display ?? null,
    cat,
  );
  return [row, ...withoutTarget(prefs)];
}
