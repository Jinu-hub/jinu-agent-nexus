// ─────────────────────────────────────────────────────────────────────────
// MyMemory — personalization Durable Object (SQLite)
// ─────────────────────────────────────────────────────────────────────────
//
// Product role: structured "My Market Memory" beside KV NOTES.
//
//   preferences     — current interests (category + industry/company/asset/theme + level)
//   preference_events — append-only hide/show/star/less/report_click history
//   weights         — derived scores for Brief personalization (recomputed)
//
// PK for preferences/weights: (category, kind, target).
// category = product domain (market / entertainment / sports); kind = chip type.
//
// Challenge pattern borrowed: DO + own SQLite + change history (+ visitor
// geo when present). Not a counter — preferences & feedback instead.
//
// Instance name: per-browser guest id (Phase 1) or future auth userId.
// Cron / shared topic-label bootstrap still use "default".
// ─────────────────────────────────────────────────────────────────────────

import { DurableObject } from "cloudflare:workers";
import {
  DEFAULT_PREFERENCE_CATEGORY,
  normalizePreferenceCategory,
  type PreferenceCategory,
} from "../src/lib/preference-category";

export type PreferenceKind = "industry" | "company" | "asset" | "theme";
export type PreferenceAction =
  | "star"
  | "less"
  | "hide"
  | "show"
  | "report_click";

export type { PreferenceCategory };
export { DEFAULT_PREFERENCE_CATEGORY, normalizePreferenceCategory };

export type PreferenceRow = {
  /** Product domain: market / entertainment / sports / … */
  category: PreferenceCategory;
  kind: PreferenceKind;
  target: string;
  level: number;
  /** Preferred UI label (frozen on first star). Storage key stays `target`. */
  display: string | null;
  updated_at: string;
};

export type TopicLabelRow = {
  key: string;
  lang: string;
  display: string;
  updated_at: string;
};

export type PreferenceEventRow = {
  id: number;
  action: PreferenceAction;
  category: PreferenceCategory | null;
  kind: string | null;
  target: string;
  meta: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
};

export type WeightRow = {
  category: PreferenceCategory;
  kind: string;
  target: string;
  score: number;
  updated_at: string;
};

export type VisitorGeo = {
  ip: string | null;
  city: string | null;
  country: string | null;
};

const KINDS = new Set<PreferenceKind>([
  "industry",
  "company",
  "asset",
  "theme",
]);
const ACTIONS = new Set<PreferenceAction>([
  "star",
  "less",
  "hide",
  "show",
  "report_click",
]);

function nowIso(): string {
  return new Date().toISOString();
}

export class MyMemory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS preferences (
          kind TEXT NOT NULL,
          target TEXT NOT NULL,
          level INTEGER NOT NULL CHECK(level >= 1 AND level <= 5),
          updated_at TEXT NOT NULL,
          PRIMARY KEY (kind, target)
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS preference_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          kind TEXT,
          target TEXT NOT NULL,
          meta TEXT,
          ip TEXT,
          city TEXT,
          country TEXT,
          created_at TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS weights (
          kind TEXT NOT NULL,
          target TEXT NOT NULL,
          score REAL NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (kind, target)
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_preference_events_created
        ON preference_events (created_at DESC)
      `);
      // "For you" report summaries. Output is a pure function of
      // (report, language, interest set), so the interest hash is part of
      // the key — starring something invalidates it without a delete.
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS for_you_summaries (
          item_id TEXT NOT NULL,
          lang TEXT NOT NULL,
          interest_hash TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (item_id, lang, interest_hash)
        )
      `);
      this.migrateTopicLabelsTable();
      // Prefer display label for My interests (first star). Ignore if column exists.
      try {
        this.ctx.storage.sql.exec(
          `ALTER TABLE preferences ADD COLUMN display TEXT`,
        );
      } catch {
        /* column already present */
      }
      this.migratePreferencesCategory();
    });
  }

  /**
   * Add product `category` axis: PK (category, kind, target).
   * Existing rows → `market`. Same for weights; events get a category column.
   *
   * Important: always consume SQL cursors (`.toArray()` / `.one()`). Leaving a
   * SELECT open locks the DO SQLite and breaks later topic_labels reads
   * (`SQLITE_LOCKED`) — FE then falls back to raw slugs.
   */
  private migratePreferencesCategory(): void {
    const prefsHaveCategory = this.tableHasColumn("preferences", "category");
    const weightsHaveCategory = this.tableHasColumn("weights", "category");

    if (!prefsHaveCategory) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE preferences_cat (
          category TEXT NOT NULL,
          kind TEXT NOT NULL,
          target TEXT NOT NULL,
          level INTEGER NOT NULL CHECK(level >= 1 AND level <= 5),
          display TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (category, kind, target)
        )
      `);
      try {
        this.ctx.storage.sql.exec(
          `INSERT INTO preferences_cat
            (category, kind, target, level, display, updated_at)
           SELECT ?, kind, target, level, display, updated_at FROM preferences`,
          DEFAULT_PREFERENCE_CATEGORY,
        );
      } catch {
        /* preferences missing columns or empty — ok */
        try {
          this.ctx.storage.sql.exec(
            `INSERT INTO preferences_cat
              (category, kind, target, level, display, updated_at)
             SELECT ?, kind, target, level, NULL, updated_at FROM preferences`,
            DEFAULT_PREFERENCE_CATEGORY,
          );
        } catch {
          /* fresh install with empty table */
        }
      }
      this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS preferences`);
      this.ctx.storage.sql.exec(
        `ALTER TABLE preferences_cat RENAME TO preferences`,
      );
    }

    if (!weightsHaveCategory) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE weights_cat (
          category TEXT NOT NULL,
          kind TEXT NOT NULL,
          target TEXT NOT NULL,
          score REAL NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (category, kind, target)
        )
      `);
      try {
        this.ctx.storage.sql.exec(
          `INSERT INTO weights_cat (category, kind, target, score, updated_at)
           SELECT ?, kind, target, score, updated_at FROM weights`,
          DEFAULT_PREFERENCE_CATEGORY,
        );
      } catch {
        /* empty / missing */
      }
      this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS weights`);
      this.ctx.storage.sql.exec(`ALTER TABLE weights_cat RENAME TO weights`);
    }

    if (!this.tableHasColumn("preference_events", "category")) {
      try {
        this.ctx.storage.sql.exec(
          `ALTER TABLE preference_events ADD COLUMN category TEXT`,
        );
      } catch {
        /* race / already present */
      }
    }
    this.ctx.storage.sql.exec(
      `UPDATE preference_events
       SET category = ?
       WHERE category IS NULL OR TRIM(category) = ''`,
      DEFAULT_PREFERENCE_CATEGORY,
    );
  }

  /** PRAGMA table_info — cursor always drained. */
  private tableHasColumn(table: string, column: string): boolean {
    const allowed = new Set([
      "preferences",
      "weights",
      "preference_events",
      "topic_labels",
    ]);
    if (!allowed.has(table)) return false;
    try {
      const rows = this.ctx.storage.sql
        .exec<{ name: string }>(`PRAGMA table_info(${table})`)
        .toArray();
      return rows.some((r) => r.name === column);
    } catch {
      return false;
    }
  }

  /** topic_labels: (key, lang) — KO/EN body spans must not overwrite each other. */
  private migrateTopicLabelsTable(): void {
    if (this.tableHasColumn("topic_labels", "lang")) return;

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS topic_labels_lang (
        key TEXT NOT NULL,
        lang TEXT NOT NULL,
        display TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key, lang)
      )
    `);
    try {
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO topic_labels_lang (key, lang, display, updated_at)
         SELECT key, 'ko', display, updated_at FROM topic_labels`,
      );
    } catch {
      /* old table missing — fresh install */
    }
    this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS topic_labels`);
    this.ctx.storage.sql.exec(
      `ALTER TABLE topic_labels_lang RENAME TO topic_labels`,
    );
  }

  // ── Preferences (current state) ───────────────────────────────────────

  upsertPreference(input: {
    category?: PreferenceCategory | null;
    kind: PreferenceKind;
    target: string;
    level: number;
    /** Set only when preference has no display yet (first star label). */
    display?: string | null;
    geo?: VisitorGeo;
  }): PreferenceRow {
    const category = normalizePreferenceCategory(input.category);
    const kind = input.kind;
    const target = input.target.trim();
    const level = Math.round(input.level);
    if (!KINDS.has(kind)) throw new Error(`invalid kind: ${kind}`);
    if (!target) throw new Error("target required");
    if (level < 1 || level > 5) throw new Error("level must be 1–5");

    const displayIn =
      typeof input.display === "string" && input.display.trim()
        ? input.display.trim()
        : null;

    const updated_at = nowIso();
    this.ctx.storage.sql.exec(
      `INSERT INTO preferences (category, kind, target, level, display, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(category, kind, target) DO UPDATE SET
         level = excluded.level,
         display = COALESCE(preferences.display, excluded.display),
         updated_at = excluded.updated_at`,
      category,
      kind,
      target,
      level,
      displayIn,
      updated_at,
    );

    this.recomputeWeights();

    return this.getPreference(category, kind, target)!;
  }

  getPreference(
    category: PreferenceCategory | null | undefined,
    kind: PreferenceKind,
    target: string,
  ): PreferenceRow | null {
    const cat = normalizePreferenceCategory(category);
    return (
      this.ctx.storage.sql
        .exec<PreferenceRow>(
          `SELECT category, kind, target, level, display, updated_at
           FROM preferences
           WHERE category = ? AND kind = ? AND target = ?`,
          cat,
          kind,
          target.trim(),
        )
        .toArray()[0] ?? null
    );
  }

  /**
   * List preferences. Pass `category` to scope; omit / null = all categories.
   */
  listPreferences(category?: PreferenceCategory | null): PreferenceRow[] {
    if (category != null && String(category).trim()) {
      const cat = normalizePreferenceCategory(category);
      return this.ctx.storage.sql
        .exec<PreferenceRow>(
          `SELECT category, kind, target, level, display, updated_at
           FROM preferences
           WHERE category = ?
           ORDER BY level DESC, updated_at DESC`,
          cat,
        )
        .toArray();
    }
    return this.ctx.storage.sql
      .exec<PreferenceRow>(
        `SELECT category, kind, target, level, display, updated_at
         FROM preferences
         ORDER BY category ASC, level DESC, updated_at DESC`,
      )
      .toArray();
  }

  // ── Topic display labels (key + lang → body span) ─────────────────────

  private normalizeLabelLang(lang?: string | null): string {
    const l = (lang ?? "ko").trim().toLowerCase();
    return l || "ko";
  }

  upsertTopicLabel(
    key: string,
    display: string,
    lang?: string | null,
  ): TopicLabelRow {
    const k = key.trim();
    const d = display.trim();
    const lg = this.normalizeLabelLang(lang);
    if (!k) throw new Error("key required");
    if (!d) throw new Error("display required");
    const updated_at = nowIso();
    this.ctx.storage.sql.exec(
      `INSERT INTO topic_labels (key, lang, display, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key, lang) DO UPDATE SET
         display = excluded.display,
         updated_at = excluded.updated_at`,
      k,
      lg,
      d,
      updated_at,
    );
    return { key: k, lang: lg, display: d, updated_at };
  }

  upsertTopicLabels(
    entries: Array<{ key: string; display: string; lang?: string | null }>,
    lang?: string | null,
  ): TopicLabelRow[] {
    const out: TopicLabelRow[] = [];
    for (const e of entries) {
      out.push(this.upsertTopicLabel(e.key, e.display, e.lang ?? lang));
    }
    return out;
  }

  listTopicLabels(lang?: string | null): TopicLabelRow[] {
    const lg = lang != null && String(lang).trim() ? this.normalizeLabelLang(lang) : null;
    if (lg) {
      return this.ctx.storage.sql
        .exec<TopicLabelRow>(
          `SELECT key, lang, display, updated_at
           FROM topic_labels
           WHERE lang = ?
           ORDER BY updated_at DESC`,
          lg,
        )
        .toArray();
    }
    return this.ctx.storage.sql
      .exec<TopicLabelRow>(
        `SELECT key, lang, display, updated_at
         FROM topic_labels
         ORDER BY updated_at DESC`,
      )
      .toArray();
  }

  getTopicLabel(key: string, lang?: string | null): TopicLabelRow | null {
    const k = key.trim();
    if (!k) return null;
    const lg = this.normalizeLabelLang(lang);
    return (
      this.ctx.storage.sql
        .exec<TopicLabelRow>(
          `SELECT key, lang, display, updated_at
           FROM topic_labels WHERE key = ? AND lang = ?`,
          k,
          lg,
        )
        .toArray()[0] ?? null
    );
  }

  getTopicLabelsByKeys(
    keys: string[],
    lang?: string | null,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const lg = this.normalizeLabelLang(lang);
    for (const raw of keys) {
      const row = this.getTopicLabel(raw, lg);
      if (row) out[row.key] = row.display;
    }
    return out;
  }

  getForYouSummary(
    itemId: string,
    lang: string,
    interestHash: string,
  ): string | null {
    const row = this.ctx.storage.sql
      .exec<{ payload: string }>(
        `SELECT payload FROM for_you_summaries
         WHERE item_id = ? AND lang = ? AND interest_hash = ?`,
        itemId,
        lang,
        interestHash,
      )
      .toArray()[0];
    return row?.payload ?? null;
  }

  putForYouSummary(
    itemId: string,
    lang: string,
    interestHash: string,
    payload: string,
  ): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO for_you_summaries (item_id, lang, interest_hash, payload, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, lang, interest_hash) DO UPDATE SET
         payload = excluded.payload,
         created_at = excluded.created_at`,
      itemId,
      lang,
      interestHash,
      payload,
      nowIso(),
    );
    // Rewriting a report drifts stale rows in; keep the newest few hundred.
    this.ctx.storage.sql.exec(
      `DELETE FROM for_you_summaries WHERE rowid NOT IN (
         SELECT rowid FROM for_you_summaries ORDER BY created_at DESC LIMIT 200
       )`,
    );
  }

  deletePreference(
    kind: PreferenceKind,
    target: string,
    category?: PreferenceCategory | null,
  ): { deleted: boolean } {
    if (!KINDS.has(kind)) throw new Error(`invalid kind: ${kind}`);
    const cat = normalizePreferenceCategory(category);
    const t = target.trim();
    this.ctx.storage.sql.exec(
      `DELETE FROM preferences WHERE category = ? AND kind = ? AND target = ?`,
      cat,
      kind,
      t,
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM weights WHERE category = ? AND kind = ? AND target = ?`,
      cat,
      kind,
      t,
    );
    this.recomputeWeights();
    return { deleted: true };
  }

  // ── Events (append-only history) ──────────────────────────────────────

  recordEvent(input: {
    action: PreferenceAction;
    category?: PreferenceCategory | null;
    kind?: PreferenceKind | null;
    target: string;
    meta?: unknown;
    geo?: VisitorGeo;
  }): PreferenceEventRow {
    if (!ACTIONS.has(input.action)) {
      throw new Error(`invalid action: ${input.action}`);
    }
    const category = normalizePreferenceCategory(input.category);
    const target = input.target.trim();
    if (!target) throw new Error("target required");
    if (input.kind != null && !KINDS.has(input.kind)) {
      throw new Error(`invalid kind: ${input.kind}`);
    }

    // Mirror hide/show into preference level when kind is known.
    if (input.kind && (input.action === "hide" || input.action === "show")) {
      if (input.action === "hide") {
        // Keep preference row but mark via events; optional soft-delete of weight
        this.ctx.storage.sql.exec(
          `DELETE FROM weights WHERE category = ? AND kind = ? AND target = ?`,
          category,
          input.kind,
          target,
        );
      }
    }
    if (input.kind && input.action === "star") {
      // Bump or create preference at least level 4 if missing/lower
      const existing = this.ctx.storage.sql
        .exec<{ level: number }>(
          `SELECT level FROM preferences
           WHERE category = ? AND kind = ? AND target = ?`,
          category,
          input.kind,
          target,
        )
        .toArray()[0];
      const level = Math.max(existing?.level ?? 0, 4);
      const updated_at = nowIso();
      this.ctx.storage.sql.exec(
        `INSERT INTO preferences (category, kind, target, level, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(category, kind, target) DO UPDATE SET
           level = excluded.level,
           updated_at = excluded.updated_at`,
        category,
        input.kind,
        target,
        level,
        updated_at,
      );
    }
    if (input.kind && input.action === "less") {
      const existing = this.ctx.storage.sql
        .exec<{ level: number }>(
          `SELECT level FROM preferences
           WHERE category = ? AND kind = ? AND target = ?`,
          category,
          input.kind,
          target,
        )
        .toArray()[0];
      if (existing) {
        const level = Math.max(1, existing.level - 1);
        this.ctx.storage.sql.exec(
          `UPDATE preferences SET level = ?, updated_at = ?
           WHERE category = ? AND kind = ? AND target = ?`,
          level,
          nowIso(),
          category,
          input.kind,
          target,
        );
      }
    }

    const row = this.insertEvent({
      action: input.action,
      category,
      kind: input.kind ?? null,
      target,
      meta:
        input.meta === undefined ? null : JSON.stringify(input.meta),
      geo: input.geo,
    });
    this.recomputeWeights();
    return row;
  }

  listEvents(limit = 100): PreferenceEventRow[] {
    const n = Math.min(Math.max(1, limit), 500);
    return this.ctx.storage.sql
      .exec<PreferenceEventRow>(
        `SELECT id, action, category, kind, target, meta, ip, city, country, created_at
         FROM preference_events
         ORDER BY id DESC
         LIMIT ?`,
        n,
      )
      .toArray();
  }

  // ── Weights (derived for Brief ranking) ───────────────────────────────

  listWeights(category?: PreferenceCategory | null): WeightRow[] {
    if (category != null && String(category).trim()) {
      const cat = normalizePreferenceCategory(category);
      return this.ctx.storage.sql
        .exec<WeightRow>(
          `SELECT category, kind, target, score, updated_at
           FROM weights
           WHERE category = ?
           ORDER BY score DESC, updated_at DESC`,
          cat,
        )
        .toArray();
    }
    return this.ctx.storage.sql
      .exec<WeightRow>(
        `SELECT category, kind, target, score, updated_at
         FROM weights
         ORDER BY category ASC, score DESC, updated_at DESC`,
      )
      .toArray();
  }

  getProfile(): {
    preferences: PreferenceRow[];
    weights: WeightRow[];
    events: PreferenceEventRow[];
  } {
    return {
      preferences: this.listPreferences(),
      weights: this.listWeights(),
      events: this.listEvents(50),
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private insertEvent(input: {
    action: PreferenceAction;
    category: PreferenceCategory;
    kind: string | null;
    target: string;
    meta: string | null;
    geo?: VisitorGeo;
  }): PreferenceEventRow {
    const created_at = nowIso();
    const ip = input.geo?.ip ?? null;
    const city = input.geo?.city ?? null;
    const country = input.geo?.country ?? null;

    this.ctx.storage.sql.exec(
      `INSERT INTO preference_events
        (action, category, kind, target, meta, ip, city, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.action,
      input.category,
      input.kind,
      input.target,
      input.meta,
      ip,
      city,
      country,
      created_at,
    );

    const row = this.ctx.storage.sql
      .exec<PreferenceEventRow>(
        `SELECT id, action, category, kind, target, meta, ip, city, country, created_at
         FROM preference_events
         ORDER BY id DESC
         LIMIT 1`,
      )
      .one();
    return row;
  }

  /**
   * Simple score for Brief personalization:
   *   base = preference.level * 20
   *   + star * 15, report_click * 8, show * 5
   *   − less * 12, hide * 40
   * Hidden targets (latest hide without later show) score → 0 and stay out.
   */
  private recomputeWeights(): void {
    const prefs = this.listPreferences();
    const events = this.ctx.storage.sql
      .exec<{
        action: PreferenceAction;
        category: string | null;
        kind: string | null;
        target: string;
      }>(
        `SELECT action, category, kind, target FROM preference_events ORDER BY id ASC`,
      )
      .toArray();

    type Agg = { score: number; hidden: boolean };
    const map = new Map<string, Agg>();
    const SEP = "\x1f";
    const keyOf = (category: string, kind: string, target: string) =>
      `${category}${SEP}${kind}${SEP}${target}`;

    for (const p of prefs) {
      map.set(keyOf(p.category, p.kind, p.target), {
        score: p.level * 20,
        hidden: false,
      });
    }

    for (const e of events) {
      const category = normalizePreferenceCategory(e.category);
      const kind = e.kind ?? "theme";
      const k = keyOf(category, kind, e.target);
      const cur = map.get(k) ?? { score: 0, hidden: false };
      switch (e.action) {
        case "star":
          cur.score += 15;
          cur.hidden = false;
          break;
        case "report_click":
          cur.score += 8;
          break;
        case "show":
          cur.score += 5;
          cur.hidden = false;
          break;
        case "less":
          cur.score -= 12;
          break;
        case "hide":
          cur.score -= 40;
          cur.hidden = true;
          break;
      }
      map.set(k, cur);
    }

    this.ctx.storage.sql.exec(`DELETE FROM weights`);
    const updated_at = nowIso();
    for (const [k, agg] of map) {
      if (agg.hidden) continue;
      const [category, kind, target] = k.split(SEP);
      const score = Math.max(0, agg.score);
      if (score <= 0) continue;
      this.ctx.storage.sql.exec(
        `INSERT INTO weights (category, kind, target, score, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        category,
        kind,
        target,
        score,
        updated_at,
      );
    }
  }
}

/** Read visitor geo from a Worker Request (challenge-style). */
export function visitorGeoFromRequest(request: Request): VisitorGeo {
  const ip = request.headers.get("CF-Connecting-IP");
  const cf = request.cf as
    | { city?: string; country?: string }
    | undefined;
  return {
    ip,
    city: typeof cf?.city === "string" ? cf.city : null,
    country: typeof cf?.country === "string" ? cf.country : null,
  };
}
