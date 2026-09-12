// ─────────────────────────────────────────────────────────────────────────
// Market report → Vectorize ingest (MARKET_VECTOR_DB)
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 14.1: chunk item_contents markdown, embed, upsert with metadata
// (item_id, market_date, lang, chunk_index, text). Deterministic vector
// ids so re-ingest can deleteByIds without a side store.
// Query / For you wiring = Phase 14.2+.
// ─────────────────────────────────────────────────────────────────────────

import { embedMany } from "ai";

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
