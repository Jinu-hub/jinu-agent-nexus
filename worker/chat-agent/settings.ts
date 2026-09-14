// ─────────────────────────────────────────────────────────────────────────
// ChatAgent runtime settings — current values + change history
// ─────────────────────────────────────────────────────────────────────────
//
// These are application settings, not Cloudflare infrastructure settings.
// They belong to the ChatAgent Durable Object so every instance can keep
// its own runtime policy in SQLite.
// ─────────────────────────────────────────────────────────────────────────

import type { SqlAgentHost } from "./agent-host";

/** Market Memory (Supabase) content language — not chat UI language. */
export type ContentLang = "ko" | "en";

export const CONTENT_LANGS = ["ko", "en"] as const;
export const DEFAULT_CONTENT_LANG: ContentLang = "ko";

export function isContentLang(value: unknown): value is ContentLang {
  return value === "ko" || value === "en";
}

/**
 * Side-panel tab ids that can be hidden from the strip.
 * `settings` is always visible so the user can turn tabs back on.
 */
export const TOGGLEABLE_PANELS = [
  "market",
  "memory",
  "skills",
  "files",
  "tools",
  "sources",
  "browser",
  "schedules",
  "extensions",
  "mcp",
] as const;

export type ToggleablePanel = (typeof TOGGLEABLE_PANELS)[number];

export const TOGGLEABLE_PANEL_LABELS: Record<ToggleablePanel, string> = {
  market: "Market",
  memory: "Memory",
  skills: "Skills",
  files: "Files",
  tools: "Tools",
  sources: "Sources",
  browser: "Browser",
  schedules: "Schedules",
  extensions: "Extensions",
  mcp: "MCP",
};

const TOGGLEABLE_PANEL_SET = new Set<string>(TOGGLEABLE_PANELS);

export function isToggleablePanel(value: unknown): value is ToggleablePanel {
  return typeof value === "string" && TOGGLEABLE_PANEL_SET.has(value);
}

export function normalizeHiddenPanels(value: unknown): ToggleablePanel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ToggleablePanel>();
  const out: ToggleablePanel[] = [];
  for (const item of value) {
    if (!isToggleablePanel(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  out.sort(
    (a, b) => TOGGLEABLE_PANELS.indexOf(a) - TOGGLEABLE_PANELS.indexOf(b),
  );
  return out;
}

function sameHiddenPanels(a: ToggleablePanel[], b: ToggleablePanel[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

export type ChatSettings = {
  alarm_enabled: boolean;
  message_cleanup_enabled: boolean;
  message_retention_seconds: number;
  alarm_interval_seconds: number;
  /** Preferred lang_code for content_briefs / content_audio reads. */
  content_lang: ContentLang;
  /** Panel tab values omitted from the App tab strip (Settings always shown). */
  hidden_panels: ToggleablePanel[];
  /**
   * report_series.slug values the user opted out of.
   * Active catalog rows default ON; inactive ("soon") rows are never usable.
   */
  disabled_report_series: string[];
  /**
   * report_series.id for the Market panel tab the user is viewing.
   * Drives chat keyword vector search + report prefetch scope.
   */
  market_focus_series_id: string;
  updated_at: string;
};

export type ChatSettingsPatch = Partial<
  Pick<
    ChatSettings,
    | "alarm_enabled"
    | "message_cleanup_enabled"
    | "message_retention_seconds"
    | "alarm_interval_seconds"
    | "content_lang"
    | "hidden_panels"
    | "disabled_report_series"
    | "market_focus_series_id"
  >
>;

export type SettingEvent = {
  id: number;
  setting_name: string;
  old_value: string;
  new_value: string;
  changed_at: string;
  source: string;
};

type StoredSettings = {
  id: number;
  alarm_enabled: number;
  message_cleanup_enabled: number;
  message_retention_seconds: number;
  alarm_interval_seconds: number;
  content_lang: string;
  hidden_panels: string;
  disabled_report_series: string;
  market_focus_series_id: string;
  updated_at: string;
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  alarm_enabled: true,
  message_cleanup_enabled: true,
  message_retention_seconds: 300,
  alarm_interval_seconds: 60,
  content_lang: DEFAULT_CONTENT_LANG,
  hidden_panels: [],
  disabled_report_series: [],
  market_focus_series_id: "",
  updated_at: "",
};

/** Normalize slug list for disabled_report_series (unique, non-empty strings). */
export function normalizeDisabledReportSeries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

export function ensureSettings(agent: SqlAgentHost): void {
  void agent.sql`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      alarm_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (alarm_enabled IN (0, 1)),
      message_cleanup_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (message_cleanup_enabled IN (0, 1)),
      message_retention_seconds INTEGER NOT NULL DEFAULT 300
        CHECK (message_retention_seconds >= 60),
      alarm_interval_seconds INTEGER NOT NULL DEFAULT 60
        CHECK (alarm_interval_seconds >= 60),
      content_lang TEXT NOT NULL DEFAULT 'ko'
        CHECK (content_lang IN ('ko', 'en')),
      hidden_panels TEXT NOT NULL DEFAULT '[]',
      disabled_report_series TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )
  `;
  void agent.sql`
    CREATE TABLE IF NOT EXISTS setting_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_name TEXT NOT NULL,
      old_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      source TEXT NOT NULL
    )
  `;
  // Existing DOs — add columns if missing.
  const columns = agent.sql<{ name: string }>`PRAGMA table_info(settings)`;
  if (!columns.some((col) => col.name === "content_lang")) {
    void agent.sql`
      ALTER TABLE settings
      ADD COLUMN content_lang TEXT NOT NULL DEFAULT 'ko'
    `;
  }
  if (!columns.some((col) => col.name === "hidden_panels")) {
    void agent.sql`
      ALTER TABLE settings
      ADD COLUMN hidden_panels TEXT NOT NULL DEFAULT '[]'
    `;
  }
  if (!columns.some((col) => col.name === "disabled_report_series")) {
    void agent.sql`
      ALTER TABLE settings
      ADD COLUMN disabled_report_series TEXT NOT NULL DEFAULT '[]'
    `;
  }
  if (!columns.some((col) => col.name === "market_focus_series_id")) {
    void agent.sql`
      ALTER TABLE settings
      ADD COLUMN market_focus_series_id TEXT NOT NULL DEFAULT ''
    `;
  }
  void agent.sql`
    INSERT OR IGNORE INTO settings (
      id,
      alarm_enabled,
      message_cleanup_enabled,
      message_retention_seconds,
      alarm_interval_seconds,
      content_lang,
      hidden_panels,
      disabled_report_series,
      market_focus_series_id,
      updated_at
    )
    VALUES (
      1,
      1,
      1,
      300,
      60,
      ${DEFAULT_CONTENT_LANG},
      '[]',
      '[]',
      '',
      ${new Date().toISOString()}
    )
  `;
}

export function getSettings(agent: SqlAgentHost): ChatSettings {
  ensureSettings(agent);
  const row = agent.sql<StoredSettings>`
    SELECT
      id,
      alarm_enabled,
      message_cleanup_enabled,
      message_retention_seconds,
      alarm_interval_seconds,
      content_lang,
      hidden_panels,
      disabled_report_series,
      market_focus_series_id,
      updated_at
    FROM settings
    WHERE id = 1
  `[0];

  if (!row) {
    return {
      ...DEFAULT_CHAT_SETTINGS,
      hidden_panels: [],
      disabled_report_series: [],
      market_focus_series_id: "",
    };
  }
  return fromStored(row);
}

export function updateSettings(
  agent: SqlAgentHost,
  patch: ChatSettingsPatch,
  source = "api",
): ChatSettings {
  const allowedNames = new Set<keyof ChatSettingsPatch>([
    "alarm_enabled",
    "message_cleanup_enabled",
    "message_retention_seconds",
    "alarm_interval_seconds",
    "content_lang",
    "hidden_panels",
    "disabled_report_series",
    "market_focus_series_id",
  ]);
  for (const name of Object.keys(patch)) {
    if (!allowedNames.has(name as keyof ChatSettingsPatch)) {
      throw new Error(`unknown setting: ${name}`);
    }
  }

  const current = getSettings(agent);
  const next: ChatSettings = {
    ...current,
    ...patch,
    hidden_panels:
      patch.hidden_panels !== undefined
        ? normalizeHiddenPanels(patch.hidden_panels)
        : current.hidden_panels,
    disabled_report_series:
      patch.disabled_report_series !== undefined
        ? normalizeDisabledReportSeries(patch.disabled_report_series)
        : current.disabled_report_series,
    market_focus_series_id:
      patch.market_focus_series_id !== undefined
        ? normalizeMarketFocusSeriesId(patch.market_focus_series_id)
        : current.market_focus_series_id,
    updated_at: new Date().toISOString(),
  };

  validateSettings(next);

  const settingNames: Array<keyof ChatSettingsPatch> = [
    "alarm_enabled",
    "message_cleanup_enabled",
    "message_retention_seconds",
    "alarm_interval_seconds",
    "content_lang",
    "hidden_panels",
    "disabled_report_series",
    "market_focus_series_id",
  ];
  const changed = settingNames.filter((name) => {
    if (name === "hidden_panels") {
      return !sameHiddenPanels(current.hidden_panels, next.hidden_panels);
    }
    if (name === "disabled_report_series") {
      return !sameStringList(
        current.disabled_report_series,
        next.disabled_report_series,
      );
    }
    return current[name] !== next[name];
  });

  if (changed.length === 0) return current;

  void agent.sql`
    UPDATE settings
    SET
      alarm_enabled = ${next.alarm_enabled ? 1 : 0},
      message_cleanup_enabled = ${next.message_cleanup_enabled ? 1 : 0},
      message_retention_seconds = ${next.message_retention_seconds},
      alarm_interval_seconds = ${next.alarm_interval_seconds},
      content_lang = ${next.content_lang},
      hidden_panels = ${JSON.stringify(next.hidden_panels)},
      disabled_report_series = ${JSON.stringify(next.disabled_report_series)},
      market_focus_series_id = ${next.market_focus_series_id},
      updated_at = ${next.updated_at}
    WHERE id = 1
  `;

  for (const name of changed) {
    void agent.sql`
      INSERT INTO setting_events (
        setting_name,
        old_value,
        new_value,
        changed_at,
        source
      )
      VALUES (
        ${name},
        ${JSON.stringify(current[name])},
        ${JSON.stringify(next[name])},
        ${next.updated_at},
        ${source}
      )
    `;
  }

  return next;
}

export function listSettingEvents(
  agent: SqlAgentHost,
  limit = 100,
): SettingEvent[] {
  ensureSettings(agent);
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500);
  return agent.sql<SettingEvent>`
    SELECT id, setting_name, old_value, new_value, changed_at, source
    FROM setting_events
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `;
}

function fromStored(row: StoredSettings): ChatSettings {
  let parsedPanels: unknown = [];
  try {
    parsedPanels = JSON.parse(row.hidden_panels || "[]");
  } catch {
    parsedPanels = [];
  }
  let parsedSeries: unknown = [];
  try {
    parsedSeries = JSON.parse(row.disabled_report_series || "[]");
  } catch {
    parsedSeries = [];
  }
  return {
    alarm_enabled: row.alarm_enabled === 1,
    message_cleanup_enabled: row.message_cleanup_enabled === 1,
    message_retention_seconds: row.message_retention_seconds,
    alarm_interval_seconds: row.alarm_interval_seconds,
    content_lang: isContentLang(row.content_lang)
      ? row.content_lang
      : DEFAULT_CONTENT_LANG,
    hidden_panels: normalizeHiddenPanels(parsedPanels),
    disabled_report_series: normalizeDisabledReportSeries(parsedSeries),
    market_focus_series_id: normalizeMarketFocusSeriesId(
      row.market_focus_series_id ?? "",
    ),
    updated_at: row.updated_at,
  };
}

/** Trim; empty clears Market panel focus (chat uses first enabled series). */
export function normalizeMarketFocusSeriesId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function validateSettings(settings: ChatSettings): void {
  if (typeof settings.alarm_enabled !== "boolean") {
    throw new Error("alarm_enabled must be a boolean");
  }
  if (typeof settings.message_cleanup_enabled !== "boolean") {
    throw new Error("message_cleanup_enabled must be a boolean");
  }
  if (
    !Number.isInteger(settings.message_retention_seconds) ||
    settings.message_retention_seconds < 60
  ) {
    throw new Error("message_retention_seconds must be an integer >= 60");
  }
  if (
    !Number.isInteger(settings.alarm_interval_seconds) ||
    settings.alarm_interval_seconds < 60
  ) {
    throw new Error("alarm_interval_seconds must be an integer >= 60");
  }
  if (!isContentLang(settings.content_lang)) {
    throw new Error("content_lang must be 'ko' or 'en'");
  }
  if (!Array.isArray(settings.hidden_panels)) {
    throw new Error("hidden_panels must be an array");
  }
  for (const id of settings.hidden_panels) {
    if (!isToggleablePanel(id)) {
      throw new Error(`hidden_panels contains unknown panel: ${String(id)}`);
    }
  }
  if (!Array.isArray(settings.disabled_report_series)) {
    throw new Error("disabled_report_series must be an array");
  }
  for (const slug of settings.disabled_report_series) {
    if (typeof slug !== "string" || !slug.trim()) {
      throw new Error("disabled_report_series must contain non-empty strings");
    }
  }
  if (typeof settings.market_focus_series_id !== "string") {
    throw new Error("market_focus_series_id must be a string");
  }
}
