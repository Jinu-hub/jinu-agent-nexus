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
