// ─────────────────────────────────────────────────────────────────────────
// Market Vectorize query knobs (HTTP defaults + chat 「keyword」 prefetch)
// ─────────────────────────────────────────────────────────────────────────
//
// Keep chat topK higher than the HTTP default: short entity queries
// (e.g. "Intel") often rank the literal-mention chunk below #2, and
// lexical rescue only runs on returned candidates.

/** Soft floor for chat keyword search — below this needs textIncludesQuery. */
export const CHAT_VECTOR_MIN_SCORE = 0.68;

/**
 * Candidates per query for chat prefetch.
 * Was 2; raised so lexical rescue can see lower-ranked literal mentions.
 */
export const CHAT_VECTOR_TOP_K_PER_QUERY = 8;

/** Max hits attached to Prefetched Market Memory. */
export const CHAT_VECTOR_HIT_LIMIT = 3;

/** HTTP `/api/market-vector/query` default when body omits top_k. */
export const DEFAULT_TOP_K_PER_QUERY = 2;

/** HTTP query default when body omits hit_limit. */
export const DEFAULT_HIT_LIMIT = 3;
