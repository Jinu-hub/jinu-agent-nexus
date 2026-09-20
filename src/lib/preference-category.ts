// ─────────────────────────────────────────────────────────────────────────
// Preference category — product domain axis (≠ PreferenceKind)
// ─────────────────────────────────────────────────────────────────────────
//
// kind = chip entity type (theme / company / industry / asset)
// category = product surface (market / entertainment / sports / …)
// PK for MyMemory preferences: (category, kind, target)
// ─────────────────────────────────────────────────────────────────────────

/** Known product categories today; storage accepts any normalized slug. */
export const KNOWN_PREFERENCE_CATEGORIES = [
  "market",
  "entertainment",
  "sports",
] as const;

export type KnownPreferenceCategory =
  (typeof KNOWN_PREFERENCE_CATEGORIES)[number];

/** Category string stored on preference rows (slug). */
export type PreferenceCategory = string;

export const DEFAULT_PREFERENCE_CATEGORY: KnownPreferenceCategory = "market";

/**
 * Lowercase slug; empty / missing → `market`.
 * Allows future categories beyond the known list.
 */
export function normalizePreferenceCategory(
  raw?: string | null,
): PreferenceCategory {
  const c = (raw ?? "").trim().toLowerCase();
  if (!c) return DEFAULT_PREFERENCE_CATEGORY;
  // Keep storage keys stable: letters, digits, underscore, hyphen only.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(c)) return DEFAULT_PREFERENCE_CATEGORY;
  return c;
}
