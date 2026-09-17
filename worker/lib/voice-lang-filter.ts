// ─────────────────────────────────────────────────────────────────────────
// Voice Cron — lang_code include / exclude filter
// ─────────────────────────────────────────────────────────────────────────
//
// Configured via wrangler vars (comma-separated, case-insensitive):
//   AUDIO_CRON_LANG_INCLUDE — allowlist; empty = disabled (use exclude)
//   AUDIO_CRON_LANG_EXCLUDE — blocklist; default "ja"
//
// Examples:
//   EXCLUDE=ja, INCLUDE=        → all except Japanese
//   EXCLUDE=, INCLUDE=ko,en     → Korean and English only
//   EXCLUDE=, INCLUDE=          → all languages
//
// When INCLUDE is non-empty, EXCLUDE is ignored.
// ─────────────────────────────────────────────────────────────────────────

export type VoiceLangFilter = {
  /** Non-null = only these lang codes. */
  include: Set<string> | null;
  exclude: Set<string>;
};

export function parseVoiceLangList(value: string | undefined): Set<string> {
  if (!value?.trim()) return new Set();
  return new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function resolveVoiceLangFilter(env: Env): VoiceLangFilter {
  const include = parseVoiceLangList(env.AUDIO_CRON_LANG_INCLUDE);
  const exclude = parseVoiceLangList(env.AUDIO_CRON_LANG_EXCLUDE);
  return {
    include: include.size > 0 ? include : null,
    exclude,
  };
}

export function matchesVoiceLangFilter(
  langCode: string,
  filter: VoiceLangFilter,
): boolean {
  const lang = langCode.trim().toLowerCase();
  if (!lang) return false;
  if (filter.include) return filter.include.has(lang);
  if (filter.exclude.size > 0) return !filter.exclude.has(lang);
  return true;
}

export function describeVoiceLangFilter(filter: VoiceLangFilter): string {
  if (filter.include) {
    return `include=[${[...filter.include].join(",")}]`;
  }
  if (filter.exclude.size > 0) {
    return `exclude=[${[...filter.exclude].join(",")}]`;
  }
  return "all languages";
}
