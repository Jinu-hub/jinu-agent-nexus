// ─────────────────────────────────────────────────────────────────────────
// Market report → Vectorize ingest (MARKET_VECTOR_DB)
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 14.1: ingest. Phase 14.2: queryMarketVectors + metadata filters.
// For you / prefetch wiring = Phase 14.3+.
// ─────────────────────────────────────────────────────────────────────────

import { embed, embedMany } from "ai";

import { createEmbedder } from "./ai";
import { chunkMarkdown } from "./ingest";
import {
  getItemContentById,
  getTodayItemContent,
  type ItemContentRow,
} from "./item-contents";
import { isMarketDateYmd } from "./market-date";

/** Sweep ceiling when replacing an item's chunks (orphan high indices). */
export const MARKET_VECTOR_MAX_CHUNKS = 200;

export type MarketVectorMeta = {
  item_id: string;
  market_date: string;
  lang: string;
  chunk_index: number;
  /** Chunk body for Phase 2 retrieval (no DO SQLite side store). */
  text: string;
};

export type IngestMarketReportOptions = {
  /** YYYY-MM-DD. Used with getTodayItemContent when itemId omitted. */
  marketDate?: string;
  lang?: string;
  briefType?: string;
  contentType?: string;
  /** If set, load this item_contents row directly (skip brief resolve). */
  itemId?: string;
};

export type IngestMarketReportResult = {
  ok: true;
  itemId: string;
  marketDate: string;
  lang: string;
  chunks: number;
  deletedIds: number;
  title: string | null;
};

export function marketChunkVectorId(itemId: string, chunkIndex: number): string {
  return `mr_${itemId}_${chunkIndex}`;
}

function normalizeLang(raw: string | null | undefined, fallback: string): string {
  const t = (raw ?? fallback).trim().toLowerCase();
  return t || fallback;
}

function normalizeMarketDate(
  raw: string | null | undefined,
  fallback: string,
): string {
  const t = (raw ?? "").trim();
  if (t && isMarketDateYmd(t)) return t;
  if (fallback && isMarketDateYmd(fallback)) return fallback;
  throw new Error("item_contents.market_date missing or invalid");
}

/**
 * Delete deterministic chunk ids for an item (0 .. MAX-1).
 * Missing ids are fine — Vectorize deleteByIds is idempotent per batch.
 */
export async function deleteMarketVectorsForItem(
  env: Env,
  itemId: string,
): Promise<number> {
  const id = itemId.trim();
  if (!id) return 0;

  const ids = Array.from({ length: MARKET_VECTOR_MAX_CHUNKS }, (_, i) =>
    marketChunkVectorId(id, i),
  );
  for (let i = 0; i < ids.length; i += 100) {
    await env.MARKET_VECTOR_DB.deleteByIds(ids.slice(i, i + 100));
  }
  return ids.length;
}

async function resolveItemForIngest(
  env: Env,
  options: IngestMarketReportOptions,
): Promise<{
  item: ItemContentRow;
  marketDate: string;
  lang: string;
}> {
  const langFallback = (options.lang ?? "ko").trim() || "ko";

  if (options.itemId?.trim()) {
    const item = await getItemContentById(env, options.itemId.trim());
    if (!item) {
      throw new Error(`item_contents not found: ${options.itemId.trim()}`);
    }
    const marketDate = normalizeMarketDate(
      item.market_date,
      options.marketDate ?? "",
    );
    const lang = normalizeLang(item.lang_code, langFallback);
    return { item, marketDate, lang };
  }

  const result = await getTodayItemContent(env, {
    marketDate: options.marketDate,
    lang: options.lang,
    briefType: options.briefType,
    contentType: options.contentType,
  });
  if (!result.item) {
    throw new Error(
      `no item_contents for market_date=${result.marketDate} lang=${result.lang}`,
    );
  }
  const marketDate = normalizeMarketDate(
    result.item.market_date,
    result.marketDate,
  );
  const lang = normalizeLang(result.item.lang_code, result.lang);
  return { item: result.item, marketDate, lang };
}

/**
 * Ingest one full report into MARKET_VECTOR_DB.
 * Replaces any previous vectors for the same item_id.
 */
export async function ingestMarketReport(
  env: Env,
  options: IngestMarketReportOptions = {},
): Promise<IngestMarketReportResult> {
  const { item, marketDate, lang } = await resolveItemForIngest(env, options);
  const content = item.content?.trim() ?? "";
  if (!content) {
    throw new Error(`item_contents ${item.id} has empty content`);
  }

  const texts = chunkMarkdown(content);
  if (texts.length === 0) {
    throw new Error(`item_contents ${item.id} produced zero chunks`);
  }
  if (texts.length > MARKET_VECTOR_MAX_CHUNKS) {
    throw new Error(
      `too many chunks (${texts.length}); max ${MARKET_VECTOR_MAX_CHUNKS}`,
    );
  }

  const deletedIds = await deleteMarketVectorsForItem(env, item.id);

  const { embeddings } = await embedMany({
    model: createEmbedder(env),
    values: texts,
  });

  const vectors = texts.map((text, i) => {
    const meta: MarketVectorMeta = {
      item_id: item.id,
      market_date: marketDate,
      lang,
      chunk_index: i,
      text,
    };
    return {
      id: marketChunkVectorId(item.id, i),
      values: embeddings[i],
      metadata: meta,
    };
  });

  // Vectorize upsert batches — keep under typical limits.
  for (let i = 0; i < vectors.length; i += 100) {
    await env.MARKET_VECTOR_DB.upsert(vectors.slice(i, i + 100));
  }

  return {
    ok: true,
    itemId: item.id,
    marketDate,
    lang,
    chunks: texts.length,
    deletedIds,
    title: item.title,
  };
}

// ─── Phase 14.2 query ─────────────────────────────────────────────────────

/** Metadata properties that must be indexed for Vectorize filters. */
export const MARKET_VECTOR_FILTER_PROPERTIES = [
  "market_date",
  "lang",
  "item_id",
] as const;

const DEFAULT_TOP_K_PER_QUERY = 2;
const DEFAULT_HIT_LIMIT = 3;
const MAX_QUERIES = 8;

export type MarketVectorHit = {
  id: string;
  score: number;
  query: string;
  itemId: string;
  marketDate: string;
  lang: string;
  chunkIndex: number;
  text: string;
};

export type QueryMarketVectorsOptions = {
  queries: string[];
  /** YYYY-MM-DD — used with brief resolve when itemId omitted. */
  marketDate?: string;
  lang?: string;
  briefType?: string;
  contentType?: string;
  /** Prefer this item_contents.id; otherwise resolve via brief+date/lang. */
  itemId?: string;
  topKPerQuery?: number;
  hitLimit?: number;
  minScore?: number;
};

export type QueryMarketVectorsResult = {
  ok: true;
  marketDate: string;
  lang: string;
  /** Always set — resolved from item_contents (same as ingest). */
  itemId: string;
  queries: string[];
  hits: MarketVectorHit[];
};

function normalizeQueries(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of raw) {
    const t = q.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

function metaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!meta) return "";
  const v = meta[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function metaNumber(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): number {
  if (!meta) return -1;
  const v = meta[key];
  return typeof v === "number" ? v : -1;
}

/**
 * Same resolve path as ingest: item_id or brief → item_contents.
 * item_id is always present when a report exists.
 */
async function resolveQueryItem(
  env: Env,
  options: QueryMarketVectorsOptions,
): Promise<{ itemId: string; marketDate: string; lang: string }> {
  const { item, marketDate, lang } = await resolveItemForIngest(env, {
    marketDate: options.marketDate,
    lang: options.lang,
    briefType: options.briefType,
    contentType: options.contentType,
    itemId: options.itemId,
  });
  return { itemId: item.id, marketDate, lang };
}

/**
 * Similarity search scoped to one report (item_id + market_date + lang).
 */
export async function queryMarketVectors(
  env: Env,
  options: QueryMarketVectorsOptions,
): Promise<QueryMarketVectorsResult> {
  const queries = normalizeQueries(options.queries ?? []);
  if (queries.length === 0) {
    throw new Error("queries must be a non-empty string array");
  }

  const scope = await resolveQueryItem(env, options);
  const filter: VectorizeVectorMetadataFilter = {
    item_id: scope.itemId,
    market_date: scope.marketDate,
    lang: scope.lang,
  };

  const topK = Math.min(
    Math.max(options.topKPerQuery ?? DEFAULT_TOP_K_PER_QUERY, 1),
    10,
  );
  const hitLimit = Math.min(
    Math.max(options.hitLimit ?? DEFAULT_HIT_LIMIT, 1),
    20,
  );
  const minScore =
    typeof options.minScore === "number" && Number.isFinite(options.minScore)
      ? options.minScore
      : undefined;

  const best = new Map<string, MarketVectorHit>();

  for (const query of queries) {
    const { embedding } = await embed({
      model: createEmbedder(env),
      value: query,
    });
    const matches = await env.MARKET_VECTOR_DB.query(Array.from(embedding), {
      topK,
      returnMetadata: "all",
      filter,
    });

    for (const m of matches.matches) {
      if (minScore !== undefined && m.score < minScore) continue;
      const meta = (m.metadata ?? undefined) as
        | Record<string, unknown>
        | undefined;
      const text = metaString(meta, "text");
      if (!text) continue;

      const hit: MarketVectorHit = {
        id: m.id,
        score: m.score,
        query,
        itemId: metaString(meta, "item_id") || scope.itemId,
        marketDate: metaString(meta, "market_date") || scope.marketDate,
        lang: metaString(meta, "lang") || scope.lang,
        chunkIndex: metaNumber(meta, "chunk_index"),
        text,
      };

      const prev = best.get(m.id);
      if (!prev || hit.score > prev.score) best.set(m.id, hit);
    }
  }

  const hits = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, hitLimit);

  return {
    ok: true,
    marketDate: scope.marketDate,
    lang: scope.lang,
    itemId: scope.itemId,
    queries,
    hits,
  };
}
