// ─────────────────────────────────────────────────────────────────────────
// Market topic lexicon — from report metadata (not hardcoded maps)
//
// tags.core[]:
//   { tag|slug, label_ko?, label?, display?, aliases?: string[] }
// entities.*[]:
//   string | { name|label|slug|tag, label_ko?, label?, display?, aliases?: string[] }
// Optional: metadata.tag_labels / tagLabels — { [slug]: "한글" }
//
// Storage / Ask stay canonical slug/name. UI uses display (label_ko first).
// Vector expand uses aliases + display from the same lexicon.
// ─────────────────────────────────────────────────────────────────────────

export type TagLexeme = {
  slug: string;
  /** UI label: label_ko → label → display → slug */
  display: string;
  aliases: string[];
};

export type TagLexicon = {
  /** lower(slug) → lexeme */
  bySlug: Map<string, TagLexeme>;
  /** lower(slug|alias|display) → slug */
  lookup: Map<string, string>;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = asTrimmedString(v);
    if (s) out.push(s);
  }
  return out;
}

function pickDisplay(row: Record<string, unknown>, slug: string): string {
  return (
    asTrimmedString(row.label_ko) ??
    asTrimmedString(row.labelKo) ??
    asTrimmedString(row.label) ??
    asTrimmedString(row.display) ??
    slug
  );
}

function emptyLexicon(): TagLexicon {
  return { bySlug: new Map(), lookup: new Map() };
}

/** Collapse punctuation so "10-year Treasury" ≈ "10 year treasury". */
function looseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function indexKey(lexicon: TagLexicon, key: string, slug: string): void {
  const t = key.trim();
  if (!t) return;
  lexicon.lookup.set(t.toLowerCase(), slug);
  if (t.includes("-")) {
    lexicon.lookup.set(t.replace(/-/g, " ").toLowerCase(), slug);
  }
  if (/\s/.test(t)) {
    lexicon.lookup.set(t.replace(/\s+/g, "-").toLowerCase(), slug);
  }
  const loose = looseKey(t);
  if (loose) lexicon.lookup.set(loose, slug);
}

function indexLexeme(lexicon: TagLexicon, lexeme: TagLexeme): void {
  const slugKey = lexeme.slug.toLowerCase();
  const prev = lexicon.bySlug.get(slugKey);
  if (prev) {
    // Merge aliases; prefer non-slug display when newly richer.
    const aliases = new Set(
      [...prev.aliases, ...lexeme.aliases].map((a) => a.trim()).filter(Boolean),
    );
    const display =
      lexeme.display !== lexeme.slug
        ? lexeme.display
        : prev.display !== prev.slug
          ? prev.display
          : lexeme.display;
    const merged: TagLexeme = {
      slug: prev.slug,
      display,
      aliases: [...aliases],
    };
    lexicon.bySlug.set(slugKey, merged);
    indexKey(lexicon, merged.slug, merged.slug);
    indexKey(lexicon, merged.display, merged.slug);
    for (const a of merged.aliases) indexKey(lexicon, a, merged.slug);
    return;
  }

  lexicon.bySlug.set(slugKey, lexeme);
  indexKey(lexicon, lexeme.slug, lexeme.slug);
  indexKey(lexicon, lexeme.display, lexeme.slug);
  for (const a of lexeme.aliases) indexKey(lexicon, a, lexeme.slug);
}

/**
 * Attach a name into the lexicon. If it already resolves to a tag/entity
 * slug (incl. loose match), merge as alias instead of a duplicate entry.
 */
function indexNameIntoLexicon(
  lexicon: TagLexicon,
  name: string,
  opts?: { display?: string; aliases?: string[] },
): void {
  const n = name.trim();
  if (!n) return;
  const existing =
    lexicon.lookup.get(n.toLowerCase()) ??
    lexicon.lookup.get(looseKey(n)) ??
    null;
  if (existing) {
    const extra = [n, ...(opts?.aliases ?? [])].filter(
      (a) => a.toLowerCase() !== existing.toLowerCase(),
    );
    indexLexeme(lexicon, {
      slug: existing,
      display: opts?.display ?? existing,
      aliases: extra,
    });
    return;
  }
  indexLexeme(lexicon, {
    slug: n,
    display: opts?.display ?? n,
    aliases: opts?.aliases ?? [],
  });
}

function indexEntityEntry(lexicon: TagLexicon, entry: unknown): void {
  if (typeof entry === "string") {
    indexNameIntoLexicon(lexicon, entry);
    return;
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
  const rec = entry as Record<string, unknown>;
  const slug =
    asTrimmedString(rec.tag) ??
    asTrimmedString(rec.slug) ??
    asTrimmedString(rec.name) ??
    asTrimmedString(rec.label) ??
    null;
  if (!slug) return;
  indexNameIntoLexicon(lexicon, slug, {
    display: pickDisplay(rec, slug),
    aliases: asStringList(rec.aliases),
  });
}

/** Parse report metadata into a topic lexicon (tags.core + entities + label maps). */
export function buildTagLexicon(metadata: unknown): TagLexicon {
  const lexicon = emptyLexicon();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return lexicon;
  }
  const meta = metadata as Record<string, unknown>;

  // 1) tags.core first — canonical slugs + aliases
  const tagsBag = meta.tags;
  if (tagsBag && typeof tagsBag === "object" && !Array.isArray(tagsBag)) {
    const core = (tagsBag as { core?: unknown }).core;
    if (Array.isArray(core)) {
      for (const row of core) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const rec = row as Record<string, unknown>;
        const slug =
          asTrimmedString(rec.tag) ?? asTrimmedString(rec.slug) ?? null;
        if (!slug) continue;
        indexLexeme(lexicon, {
          slug,
          display: pickDisplay(rec, slug),
          aliases: asStringList(rec.aliases),
        });
      }
    }
  }

  for (const key of ["tag_labels", "tagLabels"] as const) {
    const bag = meta[key];
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) continue;
    for (const [slugRaw, labelRaw] of Object.entries(
      bag as Record<string, unknown>,
    )) {
      const slug = slugRaw.trim();
      const label = asTrimmedString(labelRaw);
      if (!slug || !label) continue;
      indexLexeme(lexicon, { slug, display: label, aliases: [] });
    }
  }

  // 2) entities.* — same process; merge into tag when name matches slug/alias
  const entities = meta.entities;
  if (entities && typeof entities === "object" && !Array.isArray(entities)) {
    for (const group of Object.values(entities as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue;
      for (const entry of group) indexEntityEntry(lexicon, entry);
    }
  }

  return lexicon;
}

export function serializeTagLexicon(lexicon: TagLexicon): TagLexeme[] {
  return [...lexicon.bySlug.values()];
}

export function tagLexiconFromEntries(
  entries: TagLexeme[] | null | undefined,
): TagLexicon {
  const lexicon = emptyLexicon();
  if (!entries?.length) return lexicon;
  for (const e of entries) {
    const slug = e.slug?.trim();
    if (!slug) continue;
    indexLexeme(lexicon, {
      slug,
      display: (e.display ?? slug).trim() || slug,
      aliases: Array.isArray(e.aliases) ? e.aliases.filter(Boolean) : [],
    });
  }
  return lexicon;
}

/** Resolve a chip/query string to the canonical slug when known. */
export function resolveTagSlug(
  raw: string,
  lexicon: TagLexicon | null | undefined,
): string | null {
  const t = raw.trim();
  if (!t || !lexicon) return null;
  return (
    lexicon.lookup.get(t.toLowerCase()) ??
    lexicon.lookup.get(looseKey(t)) ??
    null
  );
}

/** UI label: lexicon display when known, else original. */
export function topicDisplayLabel(
  raw: string,
  lexicon: TagLexicon | null | undefined,
  labelMap?: Record<string, string> | null,
): string {
  const t = raw.trim();
  if (!t) return t;
  if (labelMap) {
    const direct = labelMap[t] ?? labelMap[t.toLowerCase()];
    if (direct) return direct;
    const slug = resolveTagSlug(t, lexicon);
    if (slug) {
      const via = labelMap[slug] ?? labelMap[slug.toLowerCase()];
      if (via) return via;
    }
  }
  const slug = resolveTagSlug(t, lexicon);
  if (!slug || !lexicon) return t;
  return lexicon.bySlug.get(slug.toLowerCase())?.display ?? t;
}

/** Interest chip: preference.display → labelMap → lexicon → target.
 * When content lang is `en`, skip a Hangul-only frozen preference display
 * so EN report tags are not stuck on a KO star label.
 */
export function interestDisplayLabel(
  target: string,
  opts?: {
    preferenceDisplay?: string | null;
    lexicon?: TagLexicon | null;
    labelMap?: Record<string, string> | null;
    /** Market content language (Settings). */
    contentLang?: string | null;
  },
): string {
  const pref = opts?.preferenceDisplay?.trim();
  const lang = (opts?.contentLang ?? "").trim().toLowerCase();
  if (pref) {
    const prefHangul = /[가-힣]/.test(pref);
    if (!(lang === "en" && prefHangul)) return pref;
  }
  return topicDisplayLabel(target, opts?.lexicon, opts?.labelMap);
}

/**
 * Embedding query variants from report lexicon + topic_labels.
 * Matches by slug, alias, display, or reverse topic_labels display→key,
 * then expands slug + display + aliases.
 */
export function expandQueriesFromLexicon(
  raw: string,
  lexicon: TagLexicon | null | undefined,
  labelMap?: Record<string, string> | null,
): string[] {
  const t = raw.trim();
  if (!t) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  push(t);
  if (t.includes("-")) push(t.replace(/-/g, " "));
  if (/\s/.test(t)) push(t.replace(/\s+/g, "-"));

  // Forward: key → display
  const fromMap =
    labelMap?.[t] ?? labelMap?.[t.toLowerCase()] ?? null;
  if (fromMap) push(fromMap);

  // Reverse: display → canonical keys (so 「10년물 금리」 still expands slug)
  for (const k of keysForTopicLabelDisplay(t, labelMap)) {
    push(k);
    if (k.includes("-")) push(k.replace(/-/g, " "));
    if (/\s/.test(k)) push(k.replace(/\s+/g, "-"));
  }

  const slug =
    resolveTagSlug(t, lexicon) ??
    keysForTopicLabelDisplay(t, labelMap)
      .map((k) => resolveTagSlug(k, lexicon) ?? k)
      .find(Boolean) ??
    null;

  if (slug && labelMap) {
    const via = labelMap[slug] ?? labelMap[slug.toLowerCase()];
    if (via) push(via);
  }
  const lexeme =
    slug && lexicon ? lexicon.bySlug.get(slug.toLowerCase()) : null;
  if (lexeme) {
    push(lexeme.slug);
    if (lexeme.slug.includes("-")) push(lexeme.slug.replace(/-/g, " "));
    if (/\s/.test(lexeme.slug)) push(lexeme.slug.replace(/\s+/g, "-"));
    push(lexeme.display);
    for (const a of lexeme.aliases) {
      push(a);
      if (a.includes("-")) push(a.replace(/-/g, " "));
      if (/\s/.test(a)) push(a.replace(/\s+/g, "-"));
    }
  }

  return out;
}

/** topic_labels display → underlying keys (exact / loose). */
export function keysForTopicLabelDisplay(
  display: string,
  labelMap?: Record<string, string> | null,
): string[] {
  if (!labelMap) return [];
  const want = display.trim().toLowerCase();
  const looseWant = looseKey(display);
  if (!want) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(labelMap)) {
    const dv = v.trim();
    if (!dv) continue;
    if (dv.toLowerCase() !== want && looseKey(dv) !== looseWant) continue;
    const id = k.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(k);
  }
  return out;
}
