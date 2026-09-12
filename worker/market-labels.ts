// ─────────────────────────────────────────────────────────────────────────
// Market topic labels — body-grounded display for Tags/Keywords (B안)
//
// Pipeline: cache (topic_labels) → exact/loose body match → LLM span pick
// (must appear in body). Persist successes to MyMemory topic_labels.
// Intended post-step after market-vector ingest (cron later).
// ─────────────────────────────────────────────────────────────────────────

import { generateText } from "ai";

import { createModel } from "./ai";
import {
  getItemContentById,
  getTodayItemContent,
  type ItemContentRow,
} from "./item-contents";
import { isMarketDateYmd } from "./market-date";
import { MyMemory } from "./my-memory";
import { buildTagLexicon } from "../src/lib/market-tag-lexicon";
import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";

export type LabelRole = "tag" | "keyword";

export type LabelKeyInput = {
  key: string;
  role: LabelRole;
  aliases?: string[];
};

export type ResolveMarketLabelsOptions = {
  marketDate?: string;
  lang?: string;
  itemId?: string;
  /** If omitted, collect tags + entity/place candidates from the report. */
  keys?: LabelKeyInput[];
  /** Skip LLM (exact/cache/hint only) — useful for tests. */
  skipLlm?: boolean;
  /** Ignore topic_labels cache (re-pick + overwrite). */
  force?: boolean;
  bodyExcerptChars?: number;
};

export type LabelResolvedBy =
  | "cache"
  | "exact"
  | "hint"
  | "english"
  | "llm"
  | "fallback";

export type ResolveMarketLabelsResult = {
  ok: true;
  itemId: string;
  marketDate: string;
  lang: string;
  /** key → display (Tags always; Keywords only when body span found). */
  labels: Record<string, string>;
  /** Keyword keys with no body span (dropped from Keywords UI). */
  droppedKeywords: string[];
  resolvedBy: Record<string, LabelResolvedBy>;
};

const DEFAULT_EXCERPT = 10_000;
const MAX_LLM_KEYS = 40;
/** Soft cap for chip display (Korean syllables / short EN phrases). */
const MAX_CHIP_CHARS = 18;
const MAX_CHIP_TOKENS = 4;

/**
 * Body-grounded fallback candidates for common EN slugs (KO reports).
 * Only used when the string appears in the body — never invented.
 */
const LABEL_BODY_HINTS: Record<string, string[]> = {
  bonds: ["국채", "채권", "국채금리", "채권시장", "장기채"],
  "fixed income": ["국채", "채권", "채권시장"],
  "policy-tightening": ["긴축", "긴축 기조", "금리 인상", "통화정책"],
  "energy-supply-shortfall": [
    "원유 공급",
    "공급 부족",
    "공급 감소",
    "원유 공급 부족",
    "에너지",
  ],
  "10y-treasury-yield": ["10년물 금리", "미 10년물 금리", "10년물", "장기금리"],
  "10-year treasury yield": ["10년물 금리", "미 10년물 금리", "10년물"],
  "short-term treasury yields": ["단기 국채금리", "단기", "국채금리"],
  "core cpi": ["근원 CPI", "근원 물가", "CPI"],
  cpi: ["CPI", "소비자물가", "물가"],
  energy: ["에너지", "에너지 시장", "원유", "유가"],
  shipping: ["운임", "탱커 운임", "원유 탱커 운임", "VLCC"],
  "federal reserve": ["연준", "Fed"],
  "us treasury": ["재무부", "국채"],
  "international energy agency": ["국제에너지기구", "IEA"],
  us: ["미국"],
  "saudi arabia": ["사우디"],
  global: ["글로벌"],
};

function memoryStub(env: Env): DurableObjectStub<MyMemory> {
  const id = env.MyMemory.idFromName(DEFAULT_INSTANCE_NAME);
  return env.MyMemory.get(id);
}

function looseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ASCII-heavy keys (oil-prices, OpenAI, S&P500) — Tags keep English when lang=en. */
export function isEnglishyKey(key: string): boolean {
  const t = key.trim();
  if (!t) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  return !/[^\x00-\x7F]/.test(t);
}

function variantsFor(key: string, aliases: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  };
  push(key);
  if (key.includes("-")) push(key.replace(/-/g, " "));
  if (/\s/.test(key)) push(key.replace(/\s+/g, "-"));
  for (const a of aliases) push(a);
  return out;
}

/**
 * Find the first body span matching any variant (case-insensitive / loose).
 * Returns the original body substring casing when possible.
 */
export function findBodySpan(body: string, variants: string[]): string | null {
  if (!body) return null;
  const lower = body.toLowerCase();
  for (const v of variants) {
    const i = lower.indexOf(v.toLowerCase());
    if (i >= 0) return body.slice(i, i + v.length);
  }
  const bodyLoose = looseKey(body);
  for (const v of variants) {
    const loose = looseKey(v);
    if (!loose || loose.length < 2) continue;
    if (bodyLoose.includes(loose)) return v;
  }
  return null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

function entityNames(metadata: unknown, group: string): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const entities = (metadata as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    return [];
  }
  const list = (entities as Record<string, unknown>)[group];
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string" && entry.trim()) {
      out.push(entry.trim());
      continue;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>;
      const name =
        (typeof rec.name === "string" && rec.name.trim()) ||
        (typeof rec.label === "string" && rec.label.trim()) ||
        (typeof rec.tag === "string" && rec.tag.trim()) ||
        (typeof rec.slug === "string" && rec.slug.trim()) ||
        "";
      if (name) out.push(name);
    }
  }
  return out;
}

/** Default key set for a report (tags + places + entities). */
export function collectLabelKeysFromItem(item: ItemContentRow): LabelKeyInput[] {
  const lexicon = buildTagLexicon(item.metadata);
  const aliasOf = (key: string): string[] => {
    const lex = lexicon.bySlug.get(key.toLowerCase());
    return lex ? [...lex.aliases, lex.display].filter(Boolean) : [];
  };

  const keys: LabelKeyInput[] = [];
  const seen = new Set<string>();
  const add = (key: string, role: LabelRole) => {
    const k = key.trim();
    if (!k) return;
    const id = `${role}:${k.toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    keys.push({ key: k, role, aliases: aliasOf(k) });
  };

  for (const tag of asStringList(item.tags)) add(tag, "tag");
  for (const p of [
    ...asStringList(item.countries),
    ...asStringList(item.regions),
  ]) {
    add(p, "keyword");
  }
  for (const group of [
    "companies",
    "institutions",
    "industries",
    "technologies",
    "products",
    "persons",
    "indicators",
  ]) {
    for (const name of entityNames(item.metadata, group)) {
      add(name, "keyword");
    }
  }
  return keys;
}

async function resolveItem(
  env: Env,
  options: ResolveMarketLabelsOptions,
): Promise<{ item: ItemContentRow; marketDate: string; lang: string }> {
  const langFallback = (options.lang ?? "ko").trim() || "ko";
  if (options.itemId?.trim()) {
    const item = await getItemContentById(
      env,
      options.itemId.trim(),
      langFallback,
    );
    if (!item) throw new Error(`item_contents not found: ${options.itemId}`);
    const marketDate = (item.market_date ?? options.marketDate ?? "").trim();
    if (!isMarketDateYmd(marketDate)) {
      throw new Error("item_contents.market_date missing or invalid");
    }
    const lang = (item.lang_code ?? langFallback).trim().toLowerCase() || "ko";
    return { item, marketDate, lang };
  }
  const result = await getTodayItemContent(env, {
    marketDate: options.marketDate,
    lang: options.lang,
  });
  if (!result.item) {
    throw new Error(
      `no item_contents for market_date=${result.marketDate} lang=${result.lang}`,
    );
  }
  const marketDate = (result.item.market_date ?? result.marketDate).trim();
  if (!isMarketDateYmd(marketDate)) {
    throw new Error("item_contents.market_date missing or invalid");
  }
  const lang =
    (result.item.lang_code ?? result.lang).trim().toLowerCase() || "ko";
  return { item: result.item, marketDate, lang };
}

function excerptBody(body: string, max: number): string {
  if (body.length <= max) return body;
  return body.slice(0, max);
}

function parseLlmLabelMap(text: string): Record<string, string | null> {
  const raw = text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
      else out[k] = null;
    }
    return out;
  } catch {
    return {};
  }
}

/** Grounded check: candidate must appear in body. Returns body-casing span. */
export function groundInBody(body: string, candidate: string): string | null {
  const c = candidate.trim();
  if (!c) return null;
  const i = body.toLowerCase().indexOf(c.toLowerCase());
  if (i >= 0) return body.slice(i, i + c.length);
  const looseBody = looseKey(body);
  const looseCand = looseKey(c);
  if (looseCand && looseBody.includes(looseCand)) return c;
  return null;
}

/** True when span is chip-sized (not a headline / clause). */
export function isChipLike(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.length > MAX_CHIP_CHARS) return false;
  if (/[,，、|]/.test(t)) return false;
  if (/%/.test(t)) return false;
  if (/\d/.test(t) && t.length > 12) return false;
  if (t.split(/\s+/).filter(Boolean).length > MAX_CHIP_TOKENS) return false;
  return true;
}

/**
 * Trim a grounded span into a tag/keyword chip while staying in the body.
 * e.g. "원유 탱커 운임, 사상 최고치 경신" → "원유 탱커 운임"
 *      "미 10년물 금리 5% 근접" → "미 10년물 금리"
 */
export function polishLabel(body: string, raw: string): string | null {
  const grounded0 = groundInBody(body, raw);
  if (!grounded0) return null;

  let s = grounded0.trim();
  // First clause before list / em-dash separators (keep hyphenated EN tokens).
  const clause = s.split(/[,，、·|/]| — | – | —/)[0]?.trim() ?? s;
  if (clause) s = clause;

  const tryGround = (cand: string): string | null => {
    const g = groundInBody(body, cand);
    return g && isChipLike(g) ? g : null;
  };

  const direct = tryGround(s);
  if (direct) return direct;

  // Drop trailing tokens (esp. numeric / % tails) until chip-sized + grounded.
  const tokens = s.split(/\s+/).filter(Boolean);
  for (let n = tokens.length; n >= 1; n--) {
    const hit = tryGround(tokens.slice(0, n).join(" "));
    if (hit) return hit;
  }

  // Last resort: clause if grounded (may still be slightly long).
  return groundInBody(body, s) ?? grounded0;
}

function hintsForKey(key: string, aliases: string[], lang: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v || v.length < 2) return;
    const id = v.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    out.push(v);
  };
  // KO hint lexicon only for Korean reports (EN body won't contain them).
  if (lang === "ko" || lang.startsWith("ko")) {
    const mapped = LABEL_BODY_HINTS[key.toLowerCase()];
    if (mapped) for (const h of mapped) push(h);
  }
  for (const a of aliases) push(a);
  return out;
}

function pickHintSpan(
  body: string,
  key: string,
  aliases: string[],
  lang: string,
): string | null {
  const span = findBodySpan(body, hintsForKey(key, aliases, lang));
  if (!span) return null;
  return polishLabel(body, span) ?? span;
}

async function llmPickSpans(
  env: Env,
  body: string,
  pending: LabelKeyInput[],
  lang: string,
): Promise<Record<string, string | null>> {
  if (pending.length === 0) return {};
  const slice = pending.slice(0, MAX_LLM_KEYS);
  const catalog = slice.map((p) => ({
    key: p.key,
    role: p.role,
    aliases: (p.aliases ?? []).slice(0, 6),
  }));

  const prompt =
    `You pick display labels for market report topic chips.\n` +
    `Report language: ${lang}\n` +
    `Rules:\n` +
    `- For each key, return a SHORT noun phrase that ALREADY APPEARS in the report body ` +
    `(same language as the report when possible).\n` +
    `- Chip style: 1–4 words / about ≤${MAX_CHIP_CHARS} characters. ` +
    `No section headlines, no commas, no percentages, no trailing clauses.\n` +
    `- Good: "미 10년물 금리", "원유 공급", "긴축", "연준".\n` +
    `- Bad: "미 10년물 금리 5% 근접", "원유 탱커 운임, 사상 최고치 경신".\n` +
    `- Do NOT invent translations that are not in the body.\n` +
    `- If no suitable short span exists in the body, return null for that key.\n` +
    `- Prefer the most natural surface form (e.g. "OpenAI" not "openai").\n` +
    `Return ONLY a JSON object mapping each key string to a string or null.\n\n` +
    `Keys:\n${JSON.stringify(catalog)}\n\n` +
    `Report body:\n"""${body}"""\n`;

  // GLM-4.7-flash defaults to thinking and often burns maxOutputTokens on
  // CoT with empty `text` — disable thinking for this grounded JSON pick.
  const result = await generateText({
    model: createModel(env),
    prompt,
    maxOutputTokens: 2048,
    providerOptions: {
      "workers-ai": {
        reasoning_effort: null,
        chat_template_kwargs: { enable_thinking: false },
      },
    },
  });

  const rawText = (result.text || result.reasoningText || "").trim();
  if (!rawText) {
    console.warn(
      "[market-labels] llm empty output",
      "finishReason=",
      result.finishReason,
      "pending=",
      slice.length,
    );
    return Object.fromEntries(slice.map((p) => [p.key, null]));
  }

  const parsed = parseLlmLabelMap(rawText);
  const out: Record<string, string | null> = {};
  for (const p of slice) {
    const raw = parsed[p.key] ?? null;
    if (!raw) {
      out[p.key] = null;
      continue;
    }
    const grounded = groundInBody(body, raw);
    if (!grounded) {
      out[p.key] = null;
      continue;
    }
    out[p.key] = polishLabel(body, grounded) ?? grounded;
  }
  return out;
}

/**
 * Resolve display labels for a report. Persists successful spans to topic_labels.
 */
export async function resolveMarketLabels(
  env: Env,
  options: ResolveMarketLabelsOptions = {},
): Promise<ResolveMarketLabelsResult> {
  const { item, marketDate, lang } = await resolveItem(env, options);
  const body = item.content?.trim() ?? "";
  if (!body) throw new Error(`item_contents ${item.id} has empty content`);

  const keys =
    options.keys && options.keys.length > 0
      ? options.keys
      : collectLabelKeysFromItem(item);

  const stub = memoryStub(env);
  const cache: Record<string, string> = options.force
    ? {}
    : await stub.getTopicLabelsByKeys(
        keys.map((k) => k.key),
        lang,
      );

  const labels: Record<string, string> = {};
  const droppedKeywords: string[] = [];
  const resolvedBy: ResolveMarketLabelsResult["resolvedBy"] = {};
  const needLlm: LabelKeyInput[] = [];
  const toPersist: Array<{ key: string; display: string }> = [];

  const excerpt = excerptBody(
    body,
    options.bodyExcerptChars ?? DEFAULT_EXCERPT,
  );

  const accept = (
    key: string,
    display: string,
    by: LabelResolvedBy,
    persist: boolean,
  ) => {
    labels[key] = display;
    resolvedBy[key] = by;
    if (persist) toPersist.push({ key, display });
  };

  for (const input of keys) {
    const key = input.key.trim();
    if (!key) continue;
    const aliases = input.aliases ?? [];

    const cached = cache[key];
    if (cached) {
      const polished = polishLabel(body, cached);
      if (polished) {
        accept(key, polished, "cache", polished !== cached);
        continue;
      }
      // Stale long/ungroundable cache → re-resolve
    }

    const exact = findBodySpan(body, variantsFor(key, aliases));
    if (exact) {
      const polished = polishLabel(body, exact) ?? exact;
      accept(key, polished, "exact", true);
      continue;
    }

    const hinted = pickHintSpan(body, key, aliases, lang);
    if (hinted) {
      accept(key, hinted, "hint", true);
      continue;
    }

    if (input.role === "tag" && isEnglishyKey(key) && lang === "en") {
      accept(key, key, "english", true);
      continue;
    }

    needLlm.push(input);
  }

  if (!options.skipLlm && needLlm.length > 0) {
    const llmMap = await llmPickSpans(env, excerpt, needLlm, lang);
    for (const input of needLlm) {
      const key = input.key;
      const picked = llmMap[key] ?? null;
      if (picked) {
        accept(key, picked, "llm", true);
        continue;
      }
      // Second chance: hints after LLM miss (aliases-only may have been thin).
      const hinted = pickHintSpan(body, key, input.aliases ?? [], lang);
      if (hinted) {
        accept(key, hinted, "hint", true);
        continue;
      }
      if (input.role === "tag") {
        accept(key, key, "fallback", false);
      } else {
        droppedKeywords.push(key);
        resolvedBy[key] = "fallback";
      }
    }
  } else {
    for (const input of needLlm) {
      if (input.role === "tag") {
        accept(input.key, input.key, "fallback", false);
      } else {
        droppedKeywords.push(input.key);
        resolvedBy[input.key] = "fallback";
      }
    }
  }

  if (toPersist.length > 0) {
    await stub.upsertTopicLabels(toPersist, lang);
  }

  return {
    ok: true,
    itemId: item.id,
    marketDate,
    lang,
    labels,
    droppedKeywords,
    resolvedBy,
  };
}
