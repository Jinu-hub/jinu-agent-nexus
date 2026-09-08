// ─────────────────────────────────────────────────────────────────────────
// P4 taste — Brief “For you” matching (string / preference level)
// Not vector search — preview of later personalization.
// ─────────────────────────────────────────────────────────────────────────

import type { PreferenceRow } from "./topic-preference";

const LINE_HIT_LIMIT = 3;
const CHIP_HIT_LIMIT = 6;

export type BriefForYouHit = {
  kind: PreferenceRow["kind"];
  target: string;
  level: number;
  /** Brief line that mentioned this interest (trimmed). */
  line: string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineMentionsTarget(lineLower: string, target: string): boolean {
  const t = target.trim().toLowerCase();
  if (!t) return false;
  if (t.length <= 2) {
    return new RegExp(
      `(?:^|[^a-z0-9가-힣])${escapeRegExp(t)}(?:[^a-z0-9가-힣]|$)`,
    ).test(lineLower);
  }
  return lineLower.includes(t);
}

function briefLines(input: {
  pulse?: string | null;
  takeaway?: string | null;
  content?: string | null;
}): string[] {
  const raw = [input.pulse, input.takeaway, input.content]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n");
  return raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function clipLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

/**
 * Find Brief lines that mention saved interests.
 * Sorted by preference level desc; one entry per interest (first matching line).
 */
export function matchBriefForYou(
  preferences: PreferenceRow[],
  brief: {
    pulse?: string | null;
    takeaway?: string | null;
    content?: string | null;
  },
): BriefForYouHit[] {
  if (preferences.length === 0) return [];
  const lines = briefLines(brief);
  if (lines.length === 0) return [];

  const prefs = [...preferences].sort((a, b) => b.level - a.level);
  const hits: BriefForYouHit[] = [];
  const seenTarget = new Set<string>();

  for (const pref of prefs) {
    if (hits.length >= CHIP_HIT_LIMIT) break;
    const key = pref.target.trim().toLowerCase();
    if (!key || seenTarget.has(key)) continue;

    const line = lines.find((l) =>
      lineMentionsTarget(l.toLowerCase(), pref.target),
    );
    if (!line) continue;

    seenTarget.add(key);
    hits.push({
      kind: pref.kind,
      target: pref.target,
      level: pref.level,
      line: clipLine(line),
    });
  }

  return hits;
}

/** Distinct excerpt lines for the For-you list (max 3). */
export function briefForYouExcerptLines(
  hits: BriefForYouHit[],
): BriefForYouHit[] {
  const out: BriefForYouHit[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const k = hit.line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(hit);
    if (out.length >= LINE_HIT_LIMIT) break;
  }
  return out;
}
