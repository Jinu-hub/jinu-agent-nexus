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
// ─────────────────────────────────────────────────────────────────────────

export type PreferenceKind = "industry" | "company" | "asset" | "theme";

export type PreferenceRow = {
  kind: PreferenceKind;
  target: string;
  level: number;
  updated_at: string;
};

export type TopicPreferenceSource =
  | { source: "tag"; label: string }
  | { source: "place"; label: string }
  | { source: "entity"; group: string; label: string };

/** Explicit star save level (1–5). */
export const INTEREST_STAR_LEVEL = 5;

const COMPANY_GROUPS = new Set(["companies", "institutions"]);
const INDUSTRY_GROUPS = new Set(["industries"]);

export function preferenceKey(kind: PreferenceKind, target: string): string {
  return `${kind}:${target.trim().toLowerCase()}`;
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
): boolean {
  const key = preferenceKey(kind, target);
  return prefs.some((p) => preferenceKey(p.kind, p.target) === key);
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

export function interestInReport(
  row: PreferenceRow,
  reportKeys: Set<string> | null | undefined,
): boolean {
  if (!reportKeys || reportKeys.size === 0) return false;
  return reportKeys.has(preferenceKey(row.kind, row.target));
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

export async function fetchPreferences(): Promise<PreferenceRow[]> {
  const res = await fetch("/memory/preferences");
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
): Promise<PreferenceRow> {
  const body = {
    kind,
    target: target.trim(),
    level: INTEREST_STAR_LEVEL,
  };
  const res = await fetch("/memory/preferences", {
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
  void fetch("/memory/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "star",
      kind,
      target: body.target,
      meta: { source: "topics_chip" },
    }),
  });

  return row;
}

export async function removeInterest(
  kind: PreferenceKind,
  target: string,
): Promise<void> {
  const res = await fetch("/memory/preferences", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, target: target.trim() }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || `remove interest HTTP ${res.status}`);
  }
}
