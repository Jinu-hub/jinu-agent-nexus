// ─────────────────────────────────────────────────────────────────────────
// P3 — compact MyMemory preferences for Market Memory chat prefetch
// ─────────────────────────────────────────────────────────────────────────

import { DEFAULT_INSTANCE_NAME } from "../../src/lib/agent-identity";
import type { PreferenceRow } from "../my-memory";
import type { ReportChatKeywords } from "../report-keywords";

const INTEREST_LIMIT = 12;
const HIT_LIMIT = 5;

export type CompactInterest = {
  kind: string;
  target: string;
  level: number;
};

export function compactInterests(rows: PreferenceRow[]): CompactInterest[] {
  return rows.slice(0, INTEREST_LIMIT).map((r) => ({
    kind: r.kind,
    target: r.target,
    level: r.level,
  }));
}

/** Best-effort read from MyMemory DO (same instance as /memory/preferences). */
export async function loadUserInterests(env: Env): Promise<CompactInterest[]> {
  try {
    const id = env.MyMemory.idFromName(DEFAULT_INSTANCE_NAME);
    const stub = env.MyMemory.get(id);
    const rows = await stub.listPreferences();
    return compactInterests(Array.isArray(rows) ? rows : []);
  } catch {
    return [];
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Short tokens (ai, us) need boundaries so "said" ≠ "ai". */
function textMentionsTarget(blobLower: string, target: string): boolean {
  const t = target.trim().toLowerCase();
  if (!t) return false;
  if (t.length <= 2) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(t)}(?:[^a-z0-9]|$)`).test(
      blobLower,
    );
  }
  return blobLower.includes(t);
}

/** Targets that appear in this report's compact keywords (case-insensitive). */
export function interestHitsInKeywords(
  interests: CompactInterest[],
  keywords: ReportChatKeywords | undefined | null,
): string[] {
  if (!keywords || interests.length === 0) return [];
  const pool = new Set(
    [
      ...keywords.tags,
      ...keywords.places,
      ...keywords.companies,
      ...keywords.institutions,
      ...keywords.technologies,
      ...keywords.industries,
      ...keywords.products,
    ].map((s) => s.trim().toLowerCase()),
  );
  const hits: string[] = [];
  for (const row of interests) {
    const key = row.target.trim().toLowerCase();
    if (key && pool.has(key)) hits.push(row.target);
  }
  return hits;
}

/** Soft hits: interest string appears in title/summary/excerpt/etc. */
export function interestHitsInSnippets(
  interests: CompactInterest[],
  snippets: Array<string | null | undefined>,
): string[] {
  if (interests.length === 0) return [];
  const blob = snippets
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n")
    .toLowerCase();
  if (!blob) return [];
  const hits: string[] = [];
  for (const row of interests) {
    if (textMentionsTarget(blob, row.target)) hits.push(row.target);
  }
  return hits;
}

/** Keyword exact first, then snippet soft-hits; capped. */
export function resolveInterestHits(
  interests: CompactInterest[],
  keywords?: ReportChatKeywords | null,
  snippets?: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of [
    ...interestHitsInKeywords(interests, keywords),
    ...interestHitsInSnippets(interests, snippets ?? []),
  ]) {
    const key = hit.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= HIT_LIMIT) break;
  }
  return out;
}

/**
 * Appended to prefetch instruction when userInterests may be present.
 * Soft wording when no hits; hard lead-bullet rule when interestHits non-empty.
 */
export function interestsInstructionClause(hasConfirmedHits: boolean): string {
  if (hasConfirmedHits) {
    return (
      " CRITICAL personalization: interestHits is non-empty. " +
      "Put at least one interestHits item in the FIRST bullet or first sentence, " +
      "using only prefetched title/summary/excerpt/highlights/keywords/pulse/takeaway — " +
      "do NOT bury hits only in a trailing tag dump. " +
      "Then cover other major themes. Mention at most 3 interestHits in the lead. " +
      "Do NOT invent facts about hits unsupported by prefetch."
    );
  }
  return (
    " userInterests = starred MyMemory preferences from Topics. " +
    "If any clearly appear in this turn's content, mention them early; " +
    "otherwise answer normally — do not force-fit. " +
    "Do NOT invent news about an interest unsupported by prefetched facts."
  );
}
