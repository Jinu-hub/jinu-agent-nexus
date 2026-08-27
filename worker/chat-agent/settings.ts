// ─────────────────────────────────────────────────────────────────────────
// ChatAgent runtime settings — current values + change history
// ─────────────────────────────────────────────────────────────────────────
//
// These are application settings, not Cloudflare infrastructure settings.
// They belong to the ChatAgent Durable Object so every instance can keep
// its own runtime policy in SQLite.
// ─────────────────────────────────────────────────────────────────────────

import type { SqlAgentHost } from "./agent-host";

export type ChatSettings = {
  alarm_enabled: boolean;
  message_cleanup_enabled: boolean;
  message_retention_seconds: number;
  alarm_interval_seconds: number;
  updated_at: string;
};

export type ChatSettingsPatch = Partial<
  Pick<
    ChatSettings,
    | "alarm_enabled"
    | "message_cleanup_enabled"
    | "message_retention_seconds"
    | "alarm_interval_seconds"
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
  updated_at: string;
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  alarm_enabled: true,
  message_cleanup_enabled: true,
  message_retention_seconds: 300,
  alarm_interval_seconds: 60,
  updated_at: "",
};

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
  void agent.sql`
    INSERT OR IGNORE INTO settings (
      id,
      alarm_enabled,
      message_cleanup_enabled,
      message_retention_seconds,
      alarm_interval_seconds,
      updated_at
    )
    VALUES (1, 1, 1, 300, 60, ${new Date().toISOString()})
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
      updated_at
    FROM settings
    WHERE id = 1
  `[0];

  if (!row) return { ...DEFAULT_CHAT_SETTINGS };
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
    updated_at: new Date().toISOString(),
  };

  validateSettings(next);

  const settingNames: Array<keyof ChatSettingsPatch> = [
    "alarm_enabled",
    "message_cleanup_enabled",
    "message_retention_seconds",
    "alarm_interval_seconds",
  ];
  const changed = settingNames.filter((name) => current[name] !== next[name]);

  if (changed.length === 0) return current;

  void agent.sql`
    UPDATE settings
    SET
      alarm_enabled = ${next.alarm_enabled ? 1 : 0},
      message_cleanup_enabled = ${next.message_cleanup_enabled ? 1 : 0},
      message_retention_seconds = ${next.message_retention_seconds},
      alarm_interval_seconds = ${next.alarm_interval_seconds},
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
  return {
    alarm_enabled: row.alarm_enabled === 1,
    message_cleanup_enabled: row.message_cleanup_enabled === 1,
    message_retention_seconds: row.message_retention_seconds,
    alarm_interval_seconds: row.alarm_interval_seconds,
    updated_at: row.updated_at,
  };
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
}
