// ─────────────────────────────────────────────────────────────────────────
// Market topic labels — body-grounded display for Tags/Keywords (B안)
//
// Pipeline: cache (topic_labels) → exact/loose body match → LLM span pick
// (must appear in body). Persist successes to MyMemory topic_labels.
// Hint lexicon / polish helpers: `./lib/market-labels-helper`.
// ─────────────────────────────────────────────────────────────────────────

import { generateText } from "ai";

import { createModel } from "./ai";
import {
  getItemContentById,
  getTodayItemContent,
  type ItemContentRow,
} from "./item-contents";
import { isMarketDateYmd } from "./lib/market-date";
import {
  findBodySpan,
  groundInBody,
  isChipLike,
  isEnglishyKey,
  MAX_CHIP_CHARS,
  pickHintSpan,
  polishLabel,
  softTagDisplay,
  variantsFor,
} from "./lib/market-labels-helper";
import { MyMemory } from "./my-memory";
import { buildTagLexicon } from "../src/lib/market-tag-lexicon";
import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";
import { myMemoryStub } from "./lib/my-memory-stub";

// Re-export helpers for callers / tests that imported from this module.
export {
  findBodySpan,
  groundInBody,
  isChipLike,
  isEnglishyKey,
  LABEL_BODY_HINTS,
  polishLabel,
  TAG_SOFT_DISPLAY_KO,
} from "./lib/market-labels-helper";

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
  /**
   * MyMemory instance for topic_labels cache.
   * Cron ingest omits this → shared `default`. Interactive HTTP passes guest id.
   */
  instanceName?: string;
};

export type LabelResolvedBy =
  | "cache"
  | "exact"
  | "hint"
  | "english"
  | "llm"
  | "soft"
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

function memoryStub(
  env: Env,
  instanceName: string = DEFAULT_INSTANCE_NAME,
): DurableObjectStub<MyMemory> {
  return myMemoryStub(env, instanceName);
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
    `- Prefer a SHORT noun phrase that ALREADY APPEARS in the report body.\n` +
    `- Chip style: 1–4 words / about ≤${MAX_CHIP_CHARS} characters. ` +
    `No section headlines, no commas, no percentages, no trailing clauses.\n` +
    `- Good: "미 10년물 금리", "원유 공급", "긴축", "연준", "온디바이스", "인프라".\n` +
    `- Bad: "미 10년물 금리 5% 근접", "원유 탱커 운임, 사상 최고치 경신".\n` +
    `- role=keyword: if no body span, return null (do not invent).\n` +
    `- role=tag: if no body span, return a short natural ${lang} chip for the slug ` +
    `(e.g. on-device-ai → 온디바이스). Still keep it chip-short.\n` +
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
  const ko = lang === "ko" || lang.startsWith("ko");
  for (const p of slice) {
    const raw = parsed[p.key] ?? null;
    if (!raw) {
      out[p.key] = null;
      continue;
    }
    const grounded = groundInBody(body, raw);
    if (grounded) {
      out[p.key] = polishLabel(body, grounded) ?? grounded;
      continue;
    }
    // Tags may use a short KO chip even when the exact phrase is absent
    // (abstract EN slugs like on-device-ai → 온디바이스).
    if (p.role === "tag" && ko && isChipLike(raw) && /[가-힣]/.test(raw)) {
      out[p.key] = raw.trim();
      continue;
    }
    out[p.key] = null;
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

  const stub = memoryStub(env, options.instanceName ?? DEFAULT_INSTANCE_NAME);
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

    // Prefer body-grounded hints before soft chips (report language first).
    const hinted = pickHintSpan(body, key, aliases, lang);
    if (hinted) {
      accept(key, hinted, "hint", true);
      continue;
    }

    // Tags: KO chip when body has no usable span (on-device-ai → 온디바이스).
    if (input.role === "tag") {
      const soft = softTagDisplay(key, lang);
      if (soft) {
        accept(key, soft, "soft", true);
        continue;
      }
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
        const soft = softTagDisplay(key, lang);
        if (soft) {
          accept(key, soft, "soft", true);
          continue;
        }
        accept(key, key, "fallback", false);
      } else {
        droppedKeywords.push(key);
        resolvedBy[key] = "fallback";
      }
    }
  } else {
    for (const input of needLlm) {
      if (input.role === "tag") {
        const soft = softTagDisplay(input.key, lang);
        if (soft) {
          accept(input.key, soft, "soft", true);
          continue;
        }
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
