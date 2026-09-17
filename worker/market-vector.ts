// ─────────────────────────────────────────────────────────────────────────
// Market report → Vectorize ingest (MARKET_VECTOR_DB)
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 14.1: ingest. Phase 14.2: queryMarketVectors + metadata filters.
// Vector id: mr_{itemId}_{lang}_{chunkIndex} so ko/en coexist (B안).
// For you / prefetch wiring = Phase 14.3+.
// ─────────────────────────────────────────────────────────────────────────

import { embed, embedMany } from "ai";

import { createEmbedder } from "./ai";
import { chunkMarkdown } from "./ingest";
import { isMarketDateYmd, marketDateYmdInTimeZone } from "./lib/market-date";
import {
  listReportsForMarketDay,
  resolveEnabledSeriesIds,
  resolveOneReportForIngest,
  type ResolvedMarketReport,
} from "./market-item-resolve";
import { resolveMarketLabels } from "./market-labels";
import { listReportSeries } from "./report-series";

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
  /** YYYY-MM-DD. Resolves via market_memory_items when itemId omitted. */
  marketDate?: string;
  lang?: string;
  /** @deprecated Ignored — ingest uses item_contents / mmi, not content_briefs. */
  briefType?: string;
  /** @deprecated Ignored — ingest uses item_contents / mmi, not content_briefs. */
  contentType?: string;
  /** Load this item_contents row directly. */
  itemId?: string;
  /** Ingest the report for this series on marketDate. */
  seriesId?: string;
  /** Override enabled series list (otherwise ChatAgent settings + catalog). */
  seriesIds?: string[];
  disabledReportSeries?: string[];
};

export type IngestMarketReportResult = {
  ok: true;
  itemId: string;
  marketDate: string;
  lang: string;
  chunks: number;
  deletedIds: number;
  title: string | null;
  seriesId?: string;
  seriesSlug?: string;
  /** Present when post-ingest label resolve ran (or failed softly). */
  labels?: {
    ok: boolean;
    count: number;
    droppedKeywords: number;
    error?: string;
  };
};

export type IngestMarketReportsBatchResult = {
  ok: true;
  batch: true;
  marketDate: string;
  lang: string;
  ingested: IngestMarketReportResult[];
  skipped: Array<{
    seriesId: string;
    seriesSlug: string;
    itemId?: string;
    reason: string;
  }>;
};

export function marketChunkVectorId(
  itemId: string,
  lang: string,
  chunkIndex: number,
): string {
  const safeLang = (lang.trim().toLowerCase() || "ko").replace(/[^a-z0-9_-]/g, "");
  return `mr_${itemId}_${safeLang}_${chunkIndex}`;
}

/** Pre-lang id scheme — swept on delete so old ko/en overwrite leftovers go away. */
function legacyMarketChunkVectorId(itemId: string, chunkIndex: number): string {
  return `mr_${itemId}_${chunkIndex}`;
}

/**
 * Delete chunk ids for one item + lang (and legacy ids without lang).
 * Missing ids are fine — Vectorize deleteByIds is idempotent per batch.
 */
export async function deleteMarketVectorsForItem(
  env: Env,
  itemId: string,
  lang: string,
): Promise<number> {
  const id = itemId.trim();
  if (!id) return 0;

  const safeLang = (lang.trim().toLowerCase() || "ko").replace(/[^a-z0-9_-]/g, "");
  const ids = [
    ...Array.from({ length: MARKET_VECTOR_MAX_CHUNKS }, (_, i) =>
      marketChunkVectorId(id, safeLang, i),
    ),
    ...Array.from({ length: MARKET_VECTOR_MAX_CHUNKS }, (_, i) =>
      legacyMarketChunkVectorId(id, i),
    ),
  ];
  for (let i = 0; i < ids.length; i += 100) {
    await env.MARKET_VECTOR_DB.deleteByIds(ids.slice(i, i + 100));
  }
  return ids.length;
}

export type ClearMarketVectorsOptions = IngestMarketReportOptions;

export type ClearMarketVectorsResult = {
  ok: true;
  itemId: string;
  marketDate: string;
  lang: string;
  deletedIds: number;
};

/** Resolve report then delete its Vectorize chunks for that lang (no re-ingest). */
export async function clearMarketVectors(
  env: Env,
  options: ClearMarketVectorsOptions = {},
): Promise<ClearMarketVectorsResult> {
  const resolved = await resolveItemForIngest(env, options);
  const deletedIds = await deleteMarketVectorsForItem(
    env,
    resolved.item.id,
    resolved.lang,
  );
  return {
    ok: true,
    itemId: resolved.item.id,
    marketDate: resolved.marketDate,
    lang: resolved.lang,
    deletedIds,
  };
}

async function resolveItemForIngest(
  env: Env,
  options: IngestMarketReportOptions,
): Promise<ResolvedMarketReport> {
  return resolveOneReportForIngest(env, {
    marketDate: options.marketDate,
    lang: options.lang,
    itemId: options.itemId,
    seriesId: options.seriesId,
    seriesIds: options.seriesIds,
    disabledReportSeries: options.disabledReportSeries,
  });
}

async function ingestResolvedReport(
  env: Env,
  resolved: ResolvedMarketReport,
): Promise<IngestMarketReportResult> {
  const { item, marketDate, lang } = resolved;
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

  const deletedIds = await deleteMarketVectorsForItem(env, item.id, lang);

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
      id: marketChunkVectorId(item.id, lang, i),
      values: embeddings[i],
      metadata: meta,
    };
  });

  // Vectorize upsert batches — keep under typical limits.
  for (let i = 0; i < vectors.length; i += 100) {
    await env.MARKET_VECTOR_DB.upsert(vectors.slice(i, i + 100));
  }

  // Post-ingest hook (cron will call the same path later): body-grounded labels.
  let labels: IngestMarketReportResult["labels"];
  try {
    const resolved = await resolveMarketLabels(env, {
      itemId: item.id,
      lang,
      marketDate,
    });
    labels = {
      ok: true,
      count: Object.keys(resolved.labels).length,
      droppedKeywords: resolved.droppedKeywords.length,
    };
  } catch (error) {
    labels = {
      ok: false,
      count: 0,
      droppedKeywords: 0,
      error: error instanceof Error ? error.message : "label resolve failed",
    };
  }

  return {
    ok: true,
    itemId: item.id,
    marketDate,
    lang,
    chunks: texts.length,
    deletedIds,
    title: item.title,
    seriesId: resolved.seriesId || undefined,
    seriesSlug: resolved.seriesSlug || undefined,
    labels,
  };
}

/**
 * Ingest one full report into MARKET_VECTOR_DB.
 * Replaces previous vectors for the same item_id + lang (ko/en coexist).
 */
export async function ingestMarketReport(
  env: Env,
  options: IngestMarketReportOptions = {},
): Promise<IngestMarketReportResult> {
  const resolved = await resolveItemForIngest(env, options);
  return ingestResolvedReport(env, resolved);
}

/**
 * Ingest every enabled-series report for a market day (Settings Content ON).
 * Skips series with no mmi row or empty content; fails when nothing ingested.
 */
export async function ingestMarketReportsForDay(
  env: Env,
  options: IngestMarketReportOptions = {},
): Promise<IngestMarketReportsBatchResult> {
  const lang = (options.lang?.trim() || "ko").toLowerCase();
  const marketDate =
    options.marketDate?.trim() || marketDateYmdInTimeZone();
  if (!isMarketDateYmd(marketDate)) {
    throw new Error("marketDate must be YYYY-MM-DD");
  }

  const seriesIds = await resolveEnabledSeriesIds(env, {
    seriesIds: options.seriesIds,
    disabledReportSeries: options.disabledReportSeries,
    useChatSettings: true,
  });

  const catalog = await listReportSeries(env);
  const slugById = new Map(catalog.map((row) => [row.id, row.slug]));

  const reports = await listReportsForMarketDay(env, {
    marketDate,
    lang,
    seriesIds,
  });

  const ingested: IngestMarketReportResult[] = [];
  const skipped: IngestMarketReportsBatchResult["skipped"] = [];

  const foundSeries = new Set(reports.map((r) => r.seriesId));
  for (const id of seriesIds) {
    if (!foundSeries.has(id)) {
      skipped.push({
        seriesId: id,
        seriesSlug: slugById.get(id) ?? "",
        reason: "no market_memory_items row with content for this date",
      });
    }
  }

  for (const resolved of reports) {
    try {
      ingested.push(await ingestResolvedReport(env, resolved));
    } catch (error) {
      skipped.push({
        seriesId: resolved.seriesId,
        seriesSlug: resolved.seriesSlug,
        itemId: resolved.item.id,
        reason: error instanceof Error ? error.message : "ingest failed",
      });
    }
  }

  if (ingested.length === 0) {
    throw new Error(
      `no reports ingested for market_date=${marketDate} lang=${lang}`,
    );
  }

  return {
    ok: true,
    batch: true,
    marketDate,
    lang,
    ingested,
    skipped,
  };
}

// ─── Phase 14.2 query ─────────────────────────────────────────────────────

/** Metadata properties that must be indexed for Vectorize filters. */
export const MARKET_VECTOR_FILTER_PROPERTIES = [
  "market_date",
  "lang",
  "item_id",
] as const;

/**
 * When true, Vectorize query filter includes `lang` (Settings / request lang).
 * Off for now so ko/en chunks for the same item can both match; flip back on later.
 */
export const MARKET_VECTOR_QUERY_FILTER_BY_LANG = true;

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
  /** YYYY-MM-DD — mmi resolve when itemId omitted. */
  marketDate?: string;
  lang?: string;
  /** @deprecated Ignored for resolve. */
  briefType?: string;
  /** @deprecated Ignored for resolve. */
  contentType?: string;
  itemId?: string;
  seriesId?: string;
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
 * Lexical safety net: chunk text already contains the query string
 * (case / hyphen / whitespace insensitive). Used so clear mentions like
 * "Hugging Face" are not dropped solely for minScore (NVIDIA-heavy chunks).
 */
export function textIncludesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  const tLoose = t.replace(/[\s_-]+/g, "");
  const qLoose = q.replace(/[\s_-]+/g, "");
  return qLoose.length >= 2 && tLoose.includes(qLoose);
}

/**
 * Same resolve path as ingest: item_id or brief → item_contents.
 * item_id is always present when a report exists.
 */
async function resolveQueryItem(
  env: Env,
  options: QueryMarketVectorsOptions,
): Promise<{ itemId: string; marketDate: string; lang: string }> {
  const resolved = await resolveItemForIngest(env, {
    marketDate: options.marketDate,
    lang: options.lang,
    itemId: options.itemId,
    seriesId: options.seriesId,
  });
  return {
    itemId: resolved.item.id,
    marketDate: resolved.marketDate,
    lang: resolved.lang,
  };
}

/**
 * Similarity search scoped to one report (item_id + market_date;
 * lang filter optional via MARKET_VECTOR_QUERY_FILTER_BY_LANG).
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
    ...(MARKET_VECTOR_QUERY_FILTER_BY_LANG ? { lang: scope.lang } : {}),
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
      const meta = (m.metadata ?? undefined) as
        | Record<string, unknown>
        | undefined;
      const text = metaString(meta, "text");
      if (!text) continue;
      // Soft floor: keep below-minScore hits when the chunk literally mentions
      // the query (avoids "Hugging Face" empty while the report names it).
      if (
        minScore !== undefined &&
        m.score < minScore &&
        !textIncludesQuery(text, query)
      ) {
        continue;
      }

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
