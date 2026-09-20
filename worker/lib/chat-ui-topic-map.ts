// ─────────────────────────────────────────────────────────────────────────
// chat-ui-topic-map — Settings-lang display chips for keyword Ask answers
// ─────────────────────────────────────────────────────────────────────────
//
// Mirrors home Topics Keywords (kind + display) using topic_labels +
// tag lexicon — same resolution path as the FE chips, so chat does not
// invent slug→KO translations.
// ─────────────────────────────────────────────────────────────────────────

import { DEFAULT_INSTANCE_NAME } from "../../src/lib/agent-identity";
import { myMemoryStub } from "./my-memory-stub";
import {
  tagLexiconFromEntries,
  topicDisplayLabel,
  type TagLexeme,
} from "../../src/lib/market-tag-lexicon";
import { TAG_SOFT_DISPLAY_KO } from "./market-labels-helper";
import type { ReportChatKeywords } from "./report-keywords";

export type ChatUiTopicChip = {
  /** Uppercase bucket, e.g. TAG / INSTITUTION / PLACE */
  kind: string;
  /** Canonical key (slug / raw) for ★ / grounding */
  key: string;
  /** Settings-lang display (topic_labels → lexicon → soft KO → key) */
  display: string;
};

const BUCKETS: Array<{
  kind: string;
  pick: (kw: ReportChatKeywords) => string[];
}> = [
  { kind: "TAG", pick: (kw) => kw.tags },
  { kind: "PLACE", pick: (kw) => kw.places },
  { kind: "COMPANY", pick: (kw) => kw.companies },
  { kind: "INSTITUTION", pick: (kw) => kw.institutions },
  { kind: "TECHNOLOGY", pick: (kw) => kw.technologies },
  { kind: "INDUSTRY", pick: (kw) => kw.industries },
  { kind: "PRODUCT", pick: (kw) => kw.products },
];

/** All raw keys from the compact keywords object. */
export function flattenReportKeywordKeys(
  keywords: ReportChatKeywords | null | undefined,
): string[] {
  if (!keywords) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { pick } of BUCKETS) {
    for (const raw of pick(keywords)) {
      const k = raw.trim();
      if (!k) continue;
      const id = k.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(k);
    }
  }
  return out;
}

/** MyMemory topic_labels — always shared `"default"` (not guest/user). */
export async function loadTopicLabelMap(
  env: Env,
  keys: string[],
  lang: string | null | undefined,
  _instanceName?: string,
): Promise<Record<string, string>> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    return await myMemoryStub(env, DEFAULT_INSTANCE_NAME).getTopicLabelsByKeys(
      unique,
      lang ?? undefined,
    );
  } catch {
    return {};
  }
}

function resolveChipDisplay(
  key: string,
  lexicon: ReturnType<typeof tagLexiconFromEntries>,
  labelMap: Record<string, string>,
  lang: string | null | undefined,
): string {
  const shown = topicDisplayLabel(key, lexicon, labelMap).trim() || key;
  if (shown !== key.trim()) return shown;
  const lg = (lang ?? "ko").trim().toLowerCase();
  if (lg.startsWith("ko")) {
    const soft =
      TAG_SOFT_DISPLAY_KO[key.toLowerCase()] ??
      TAG_SOFT_DISPLAY_KO[key] ??
      null;
    if (soft?.trim()) return soft.trim();
  }
  return shown;
}

/**
 * UI-shaped tag map for chat: KIND + display label per chip.
 * Prefer labeled keys when a labelMap is present (same as FE Keywords).
 */
export function buildChatUiTopicMap(
  keywords: ReportChatKeywords | null | undefined,
  opts: {
    labelMap?: Record<string, string> | null;
    tagLexicon?: TagLexeme[] | null;
    lang?: string | null;
    /** Drop chips with no resolved label when map has entries (FE Keywords). */
    requireLabel?: boolean;
    limit?: number;
  } = {},
): ChatUiTopicChip[] {
  if (!keywords) return [];
  const labelMap = opts.labelMap ?? {};
  const lexicon = tagLexiconFromEntries(opts.tagLexicon ?? null);
  const requireLabel =
    opts.requireLabel !== false && Object.keys(labelMap).length > 0;
  const limit = opts.limit ?? 24;
  const chips: ChatUiTopicChip[] = [];
  const seen = new Set<string>();

  for (const { kind, pick } of BUCKETS) {
    for (const raw of pick(keywords)) {
      const key = raw.trim();
      if (!key) continue;
      const id = `${kind}:${key.toLowerCase()}`;
      if (seen.has(id)) continue;
      const display = resolveChipDisplay(
        key,
        lexicon,
        labelMap,
        opts.lang,
      );
      if (requireLabel) {
        const mapped =
          labelMap[key] ??
          labelMap[key.toLowerCase()] ??
          null;
        const softOk =
          (opts.lang ?? "ko").toLowerCase().startsWith("ko") &&
          Boolean(
            TAG_SOFT_DISPLAY_KO[key.toLowerCase()] ?? TAG_SOFT_DISPLAY_KO[key],
          );
        if (!mapped && !softOk && display === key) continue;
      }
      seen.add(id);
      chips.push({ kind, key, display });
      if (chips.length >= limit) return chips;
    }
  }
  return chips;
}

/** Compact lines for the model OUTPUT SHAPE. */
export function formatChatUiTopicMapLines(chips: ChatUiTopicChip[]): string[] {
  return chips.map((c) => `- ${c.kind} ${c.display}`);
}
