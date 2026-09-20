// ─────────────────────────────────────────────────────────────────────────
// market-for-you — "read this report through my interests" (WORK_NOTES §10.14)
// ─────────────────────────────────────────────────────────────────────────
//
// Replaces the Brief `includes()` taste (`src/lib/brief-for-you.ts`) for the
// report page: the source is the confirmed full report, retrieved per
// interest through MARKET_VECTOR_DB, then summarized.
//
//   saved interests ∩ report tags/entities   (collectReportPreferenceKeys)
//     → vector query per interest            (queryMarketVectors)
//     → grounded per-interest summary        (createModel)
//
// Grounding rule carried over from §10.12: an interest the report does not
// cover is reported as absent, never filled in from model memory.
// ─────────────────────────────────────────────────────────────────────────

import { generateText } from "ai";

import { createModel } from "./ai";
import type { ItemContentRow } from "./item-contents";
import { isMarketDateYmd } from "./lib/market-date";
import { resolveOneReportForIngest } from "./market-item-resolve";
import { queryMarketVectors, type MarketVectorHit } from "./market-vector";
import {
  DEFAULT_INSTANCE_NAME,
  resolveInstanceNameFromRequest,
} from "../src/lib/agent-identity";
import { myMemoryStub } from "./lib/my-memory-stub";
import {
  collectReportPreferenceKeys,
  preferenceKey,
  type PreferenceRow,
} from "../src/lib/topic-preference";
import { interestDisplayLabel } from "../src/lib/market-tag-lexicon";

/** Interests summarized per request — keeps the prompt and latency bounded. */
const MAX_INTERESTS = 6;
/** Report paragraphs handed to the model per interest. */
const PASSAGES_PER_INTEREST = 3;

export type ForYouInterest = {
  kind: PreferenceRow["kind"];
  target: string;
  /** UI label — same as Topics (`interestDisplayLabel` + content_lang). */
  display: string;
  level: number;
};

export type ForYouSection = {
  interest: ForYouInterest;
  summary: string;
};

export type ForYouResult = {
  ok: true;
  /**
   * no-report   — nothing published / indexed for this day
   * no-interest — nothing starred yet (the tab sells the feature)
   * no-match    — interests exist but this report does not cover them
   * failed      — the report does cover them, but generation did not land
   * ready       — sections present
   *
   * `failed` exists so a flaky model call is never reported as "your topic
   * is not in this report" — that is a claim about the data, not about us.
   */
  state: "no-report" | "no-interest" | "no-match" | "failed" | "ready";
  marketDate: string;
  lang: string;
  itemId: string | null;
  /** All saved interests, matched first — the tuning chips echo these. */
  interests: ForYouInterest[];
  matched: ForYouInterest[];
  sections: ForYouSection[];
  cached: boolean;
  /** Set when the vector index had nothing and paragraphs were string-matched. */
  degraded?: boolean;
};

function memoryStub(env: Env, instanceName: string = DEFAULT_INSTANCE_NAME) {
  return myMemoryStub(env, instanceName);
}

/** Stable across reorderings — the summary only depends on the set. */
async function hashInterests(interests: ForYouInterest[]): Promise<string> {
  const canonical = interests
    .map((i) => preferenceKey(i.kind, i.target))
    .sort()
    .join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Short tokens ("ai", "us") need boundaries so "said" ≠ "ai". */
function mentions(haystackLower: string, target: string): boolean {
  const t = target.trim().toLowerCase();
  if (!t) return false;
  if (t.length <= 2) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(t)}(?:[^a-z0-9]|$)`).test(
      haystackLower,
    );
  }
  return haystackLower.includes(t);
}

/**
 * Fallback for reports that were never ingested into Vectorize (or when the
 * query fails): plain paragraph match on the report body. Same spirit as
 * `brief-for-you`, but against the full report instead of the 30s brief.
 */
function matchParagraphs(content: string, terms: string[]): string[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 24 && !p.startsWith("#"));
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const lower = paragraph.toLowerCase();
    if (terms.some((t) => mentions(lower, t))) out.push(paragraph);
    if (out.length >= PASSAGES_PER_INTEREST) break;
  }
  return out;
}

async function resolveDisplayLabels(
  env: Env,
  targets: string[],
  lang: string,
  instanceName: string,
): Promise<Record<string, string>> {
  try {
    return await memoryStub(env, instanceName).getTopicLabelsByKeys(
      targets,
      lang,
    );
  } catch {
    return {};
  }
}

/** Model answer meaning "these passages do not cover the interest". */
const NO_COVERAGE = "NONE";

/**
 * One interest per call. Batching them into a numbered JSON list looks
 * cheaper, but the flash model drifts on the numbering and hands back the
 * energy paragraph as the OpenAI summary — misattribution is worse than an
 * extra request, and these run in parallel anyway.
 */
function buildPrompt(
  report: ItemContentRow,
  lang: string,
  interest: ForYouInterest,
  texts: string[],
): string {
  return [
    `You re-read one market report for a reader who follows "${interest.display}".`,
    `Report: ${report.title ?? "(untitled)"} (${report.market_date ?? "?"})`,
    "",
    `Write 1-2 sentences on what this report says about "${interest.display}",`,
    "staying close to the wording of the passages below. Rules:",
    "- Use only those passages. No outside knowledge.",
    "- Keep every figure attached to the subject it has in the passage. If you",
    "  cannot tell what a number refers to, leave the number out.",
    "- Do not open with the report's own scaffolding labels (중요성:, 하이라이트,",
    "  주요 항목); state the fact itself.",
    `- If the passages are not actually about "${interest.display}", reply with`,
    `  exactly ${NO_COVERAGE} and nothing else.`,
    lang === "ko" ? "- Write in Korean." : "- Write in English.",
    "- Plain sentences only. No heading, no bullet, no JSON, no quotes.",
    "",
    "Passages:",
    ...texts.map((t) => `- ${t}`),
  ].join("\n");
}

/** Strip the shapes the model adds around a plain answer. */
function cleanSummary(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  text = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  text = text.replace(/^\s*\d+\s*[.)]\s*/, "");
  text = text.replace(/^["'「『]|["'」』]$/g, "").trim();
  if (!text || text.toUpperCase().startsWith(NO_COVERAGE)) return null;
  return text;
}

export type ForYouOptions = {
  marketDate?: string;
  lang?: string;
  seriesId?: string;
  itemId?: string;
  /** Skip the cache read (Regenerate button). */
  refresh?: boolean;
  /** MyMemory instance (guest id from cookie/header). */
  instanceName?: string;
};

export async function buildForYou(
  env: Env,
  options: ForYouOptions,
): Promise<ForYouResult> {
  const lang = (options.lang?.trim() || "ko").toLowerCase();
  const instanceName = options.instanceName ?? DEFAULT_INSTANCE_NAME;

  let resolved: Awaited<ReturnType<typeof resolveOneReportForIngest>>;
  try {
    resolved = await resolveOneReportForIngest(env, {
      marketDate: options.marketDate,
      lang,
      itemId: options.itemId,
      seriesId: options.seriesId,
    });
  } catch {
    return {
      ok: true,
      state: "no-report",
      marketDate: options.marketDate ?? "",
      lang,
      itemId: null,
      interests: [],
      matched: [],
      sections: [],
      cached: false,
    };
  }

  const report = resolved.item;
  const base = {
    ok: true as const,
    marketDate: resolved.marketDate,
    lang: resolved.lang,
    itemId: report.id,
    cached: false,
  };

  let preferences: PreferenceRow[];
  try {
    const rows = await memoryStub(env, instanceName).listPreferences();
    preferences = Array.isArray(rows) ? rows : [];
  } catch {
    preferences = [];
  }

  const labels = await resolveDisplayLabels(
    env,
    preferences.map((p) => p.target),
    resolved.lang,
    instanceName,
  );
  // Same lang-aware chip label as Topics My interests (skip Hangul frozen
  // display when content_lang is en).
  const toInterest = (row: PreferenceRow): ForYouInterest => ({
    kind: row.kind,
    target: row.target,
    display: interestDisplayLabel(row.target, {
      preferenceDisplay: row.display,
      labelMap: labels,
      contentLang: resolved.lang,
    }),
    level: row.level,
  });

  const reportKeys = collectReportPreferenceKeys(report);
  const matchedRows = preferences.filter((row) =>
    reportKeys.has(preferenceKey(row.kind, row.target)),
  );
  // Highest star level first — that is the order the sections appear in.
  const matchedSorted = [...matchedRows].sort(
    (a, b) => b.level - a.level || a.target.localeCompare(b.target),
  );
  const matched = matchedSorted.slice(0, MAX_INTERESTS).map(toInterest);
  const interests = preferences.map(toInterest);

  if (preferences.length === 0) {
    return { ...base, state: "no-interest", interests, matched: [], sections: [] };
  }
  if (matched.length === 0) {
    return { ...base, state: "no-match", interests, matched: [], sections: [] };
  }

  const interestHash = await hashInterests(matched);
  if (!options.refresh) {
    try {
      const hit = await memoryStub(env, instanceName).getForYouSummary(
        report.id,
        resolved.lang,
        interestHash,
      );
      if (hit) {
        const cached = JSON.parse(hit) as {
          sections: ForYouSection[];
          degraded?: boolean;
        };
        // Re-resolve displays for current lang (cached JSON may freeze KO labels).
        const byKey = new Map(
          matched.map((i) => [`${i.kind}:${i.target}`, i] as const),
        );
        const sections = cached.sections.map((section) => {
          const fresh = byKey.get(
            `${section.interest.kind}:${section.interest.target}`,
          );
          return fresh
            ? { ...section, interest: { ...section.interest, display: fresh.display } }
            : section;
        });
        return {
          ...base,
          state: "ready",
          interests,
          matched,
          sections,
          cached: true,
          ...(cached.degraded ? { degraded: true } : {}),
        };
      }
    } catch {
      /* cache miss behaves like no cache */
    }
  }

  // ── Retrieve report passages per interest ───────────────────────────────
  // Query UI label + slug + any frozen star label (KO star / EN body, etc.).
  const interestByQuery = new Map<string, ForYouInterest>();
  for (const row of matchedSorted.slice(0, MAX_INTERESTS)) {
    const interest = toInterest(row);
    interestByQuery.set(interest.display, interest);
    interestByQuery.set(interest.target, interest);
    const frozen = row.display?.trim();
    if (frozen) interestByQuery.set(frozen, interest);
  }

  let hits: MarketVectorHit[];
  try {
    const search = await queryMarketVectors(env, {
      queries: [...interestByQuery.keys()],
      itemId: report.id,
      marketDate: resolved.marketDate,
      lang: resolved.lang,
      topKPerQuery: PASSAGES_PER_INTEREST,
      hitLimit: 20,
    });
    hits = search.hits;
  } catch {
    hits = [];
  }

  const byInterest = new Map<string, string[]>();
  for (const hit of hits) {
    const interest = interestByQuery.get(hit.query);
    if (!interest) continue;
    const key = preferenceKey(interest.kind, interest.target);
    const texts = byInterest.get(key) ?? [];
    if (texts.length >= PASSAGES_PER_INTEREST || texts.includes(hit.text)) {
      continue;
    }
    texts.push(hit.text);
    byInterest.set(key, texts);
  }

  let degraded = false;
  const passages = matched.map((interest) => {
    const fromVectors =
      byInterest.get(preferenceKey(interest.kind, interest.target)) ?? [];
    if (fromVectors.length > 0) return { interest, texts: fromVectors };
    degraded = true;
    return {
      interest,
      texts: matchParagraphs(report.content ?? "", [
        interest.display,
        interest.target,
      ]),
    };
  });

  const usable = passages.filter((p) => p.texts.length > 0);
  if (usable.length === 0) {
    return { ...base, state: "no-match", interests, matched, sections: [] };
  }

  // ── Summarize ───────────────────────────────────────────────────────────
  let anyAnswered = false;
  const results = await Promise.all(
    usable.map(async ({ interest, texts }) => {
      let raw: string;
      try {
        // Same GLM-4.7-flash guard as market-labels: thinking mode eats the
        // output budget and returns empty `text` on grounded tasks.
        const result = await generateText({
          model: createModel(env),
          prompt: buildPrompt(report, resolved.lang, interest, texts),
          // Grounded extraction, not writing — sampling only invents numbers.
          temperature: 0,
          maxOutputTokens: 512,
          providerOptions: {
            "workers-ai": {
              reasoning_effort: null,
              chat_template_kwargs: { enable_thinking: false },
            },
          },
        });
        raw = (result.text || result.reasoningText || "").trim();
      } catch (error) {
        console.warn("[market-for-you] llm failed", interest.target, error);
        return null;
      }
      if (raw) anyAnswered = true;
      const summary = cleanSummary(raw);
      return summary ? { interest, summary } : null;
    }),
  );

  const sections = results.filter((s): s is ForYouSection => s !== null);

  if (sections.length === 0) {
    // The model answered and declined = the report really is silent on these.
    // No answer at all = our generation failed. Those are different claims.
    return {
      ...base,
      state: anyAnswered ? "no-match" : "failed",
      interests,
      matched,
      sections: [],
    };
  }

  try {
    await memoryStub(env, instanceName).putForYouSummary(
      report.id,
      resolved.lang,
      interestHash,
      JSON.stringify({ sections, degraded }),
    );
  } catch {
    /* cache write is best-effort */
  }

  return {
    ...base,
    state: "ready",
    interests,
    matched,
    sections,
    ...(degraded ? { degraded: true } : {}),
  };
}

/**
 * HTTP route:
 *   POST /api/market/for-you — { date, lang, series_id?, item_id?, refresh? }
 *
 * Returns `null` if the path is not this route.
 */
export async function handleMarketForYouRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname !== "/api/market/for-you") return null;
  if (request.method !== "POST") {
    return Response.json({ ok: false, message: "method not allowed" }, {
      status: 405,
    });
  }

  let body: Record<string, unknown> = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return Response.json(
        { ok: false, message: "body must be a JSON object" },
        { status: 400 },
      );
    }
  }

  const str = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };

  const date = str(body.date) ?? str(body.market_date);
  if (date && !isMarketDateYmd(date)) {
    return Response.json(
      { ok: false, message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const result = await buildForYou(env, {
      marketDate: date,
      lang: str(body.lang),
      seriesId: str(body.series_id),
      itemId: str(body.item_id),
      refresh: body.refresh === true,
      instanceName: resolveInstanceNameFromRequest(request),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "for-you failed",
      },
      { status: 502 },
    );
  }
}
