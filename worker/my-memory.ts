// ─────────────────────────────────────────────────────────────────────────
// MyMemory — personalization Durable Object (SQLite)
// ─────────────────────────────────────────────────────────────────────────
//
// Product role: structured "My Market Memory" beside KV NOTES.
//
//   preferences     — current interests (industry/company/asset/theme + level)
//   preference_events — append-only hide/show/star/less/report_click history
//   weights         — derived scores for Brief personalization (recomputed)
//
// Challenge pattern borrowed: DO + own SQLite + change history (+ visitor
// geo when present). Not a counter — preferences & feedback instead.
//
// Instance name: "default" (single-user). Multi-user → idFromName(userId).
// ─────────────────────────────────────────────────────────────────────────

import { DurableObject } from "cloudflare:workers";

export type PreferenceKind = "industry" | "company" | "asset" | "theme";
export type PreferenceAction =
  | "star"
  | "less"
  | "hide"
  | "show"
  | "report_click";

export type PreferenceRow = {
  kind: PreferenceKind;
  target: string;
  level: number;
  updated_at: string;
};

export type PreferenceEventRow = {
  id: number;
  action: PreferenceAction;
  kind: string | null;
  target: string;
  meta: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
};

export type WeightRow = {
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
    });
  }

  // ── Preferences (current state) ───────────────────────────────────────

  upsertPreference(input: {
    kind: PreferenceKind;
    target: string;
    level: number;
    geo?: VisitorGeo;
  }): PreferenceRow {
    const kind = input.kind;
    const target = input.target.trim();
    const level = Math.round(input.level);
    if (!KINDS.has(kind)) throw new Error(`invalid kind: ${kind}`);
    if (!target) throw new Error("target required");
    if (level < 1 || level > 5) throw new Error("level must be 1–5");

    const updated_at = nowIso();
    this.ctx.storage.sql.exec(
      `INSERT INTO preferences (kind, target, level, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, target) DO UPDATE SET
         level = excluded.level,
         updated_at = excluded.updated_at`,
      kind,
      target,
      level,
      updated_at,
    );

    this.recomputeWeights();

    return { kind, target, level, updated_at };
  }

  listPreferences(): PreferenceRow[] {
    return this.ctx.storage.sql
      .exec<PreferenceRow>(
        `SELECT kind, target, level, updated_at
         FROM preferences
         ORDER BY level DESC, updated_at DESC`,
      )
      .toArray();
  }

  deletePreference(kind: PreferenceKind, target: string): { deleted: boolean } {
    if (!KINDS.has(kind)) throw new Error(`invalid kind: ${kind}`);
    const t = target.trim();
    this.ctx.storage.sql.exec(
      `DELETE FROM preferences WHERE kind = ? AND target = ?`,
      kind,
      t,
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM weights WHERE kind = ? AND target = ?`,
      kind,
      t,
    );
    this.recomputeWeights();
    return { deleted: true };
  }

  // ── Events (append-only history) ──────────────────────────────────────

  recordEvent(input: {
    action: PreferenceAction;
    kind?: PreferenceKind | null;
    target: string;
    meta?: unknown;
    geo?: VisitorGeo;
  }): PreferenceEventRow {
    if (!ACTIONS.has(input.action)) {
      throw new Error(`invalid action: ${input.action}`);
    }
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
          `DELETE FROM weights WHERE kind = ? AND target = ?`,
          input.kind,
          target,
        );
      }
    }
    if (input.kind && input.action === "star") {
      // Bump or create preference at least level 4 if missing/lower
      const existing = this.ctx.storage.sql
        .exec<{ level: number }>(
          `SELECT level FROM preferences WHERE kind = ? AND target = ?`,
          input.kind,
          target,
        )
        .toArray()[0];
      const level = Math.max(existing?.level ?? 0, 4);
      const updated_at = nowIso();
      this.ctx.storage.sql.exec(
        `INSERT INTO preferences (kind, target, level, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, target) DO UPDATE SET
           level = excluded.level,
           updated_at = excluded.updated_at`,
        input.kind,
        target,
        level,
        updated_at,
      );
    }
    if (input.kind && input.action === "less") {
      const existing = this.ctx.storage.sql
        .exec<{ level: number }>(
          `SELECT level FROM preferences WHERE kind = ? AND target = ?`,
          input.kind,
          target,
        )
        .toArray()[0];
      if (existing) {
        const level = Math.max(1, existing.level - 1);
        this.ctx.storage.sql.exec(
          `UPDATE preferences SET level = ?, updated_at = ? WHERE kind = ? AND target = ?`,
          level,
          nowIso(),
          input.kind,
          target,
        );
      }
    }

    const row = this.insertEvent({
      action: input.action,
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
        `SELECT id, action, kind, target, meta, ip, city, country, created_at
         FROM preference_events
         ORDER BY id DESC
         LIMIT ?`,
        n,
      )
      .toArray();
  }

  // ── Weights (derived for Brief ranking) ───────────────────────────────

  listWeights(): WeightRow[] {
    return this.ctx.storage.sql
      .exec<WeightRow>(
        `SELECT kind, target, score, updated_at
         FROM weights
         ORDER BY score DESC, updated_at DESC`,
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
        (action, kind, target, meta, ip, city, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.action,
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
        `SELECT id, action, kind, target, meta, ip, city, country, created_at
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
        kind: string | null;
        target: string;
      }>(
        `SELECT action, kind, target FROM preference_events ORDER BY id ASC`,
      )
      .toArray();

    type Agg = { score: number; hidden: boolean };
    const map = new Map<string, Agg>();
    const keyOf = (kind: string, target: string) => `${kind}::${target}`;

    for (const p of prefs) {
      map.set(keyOf(p.kind, p.target), {
        score: p.level * 20,
        hidden: false,
      });
    }

    for (const e of events) {
      const kind = e.kind ?? "theme";
      const k = keyOf(kind, e.target);
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
      const sep = k.indexOf("::");
      const kind = k.slice(0, sep);
      const target = k.slice(sep + 2);
      const score = Math.max(0, agg.score);
      if (score <= 0) continue;
      this.ctx.storage.sql.exec(
        `INSERT INTO weights (kind, target, score, updated_at) VALUES (?, ?, ?, ?)`,
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
