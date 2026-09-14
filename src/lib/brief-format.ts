// ─────────────────────────────────────────────────────────────────────────
// Brief formatting — structured metadata first, plain text as fallback
// ─────────────────────────────────────────────────────────────────────────
//
// `content_briefs.content` is plain text (the Market panel prints it with
// `whitespace-pre-wrap`), but `metadata` already carries the same brief in
// parts — `pulse`, `highlights[]`, `market_reaction[]`, `takeaway`. A page
// that wants to lay the brief out as an article should read the parts, not
// re-parse prose.
//
// Older rows may have no metadata, so `parseBriefBody` recovers the shape
// from the text: a lead paragraph followed by numbered items.
//
//   <lead paragraph>
//
//   1. <headline>
//   <body>
// ─────────────────────────────────────────────────────────────────────────

export type BriefHighlight = {
  title: string;
  summary: string;
};

export type BriefReaction = {
  label: string;
  value: string;
  /** "up" | "down" when the row carries one, else null. */
  direction: "up" | "down" | null;
};

export type BriefParts = {
  pulse: string | null;
  takeaway: string | null;
  highlights: BriefHighlight[];
  reactions: BriefReaction[];
};

/** Read the structured pieces out of `content_briefs.metadata`. */
export function parseBriefParts(metadata: unknown): BriefParts {
  const meta = isRecord(metadata) ? metadata : {};

  return {
    pulse: text(meta.pulse),
    takeaway: text(meta.takeaway),
    highlights: asArray(meta.highlights).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const title = text(entry.title);
      const summary = text(entry.summary);
      if (!title && !summary) return [];
      return [{ title: title ?? "", summary: summary ?? "" }];
    }),
    reactions: asArray(meta.market_reaction).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const label = text(entry.label);
      const value = text(entry.value);
      if (!label && !value) return [];
      const direction = text(entry.direction);
      return [
        {
          label: label ?? "",
          value: value ?? "",
          direction:
            direction === "up" || direction === "down" ? direction : null,
        },
      ];
    }),
  };
}

export type BriefSection = {
  /** Number as printed in the brief ("1", "2", …). */
  index: string;
  headline: string;
  /** Body paragraphs below the headline (may be empty). */
  body: string[];
};

export type BriefBody = {
  /** Paragraphs before the first numbered section. */
  lead: string[];
  sections: BriefSection[];
};

const SECTION_LINE = /^(\d{1,2})\s*[.)]\s*(\S.*)$/;

/**
 * Split brief text into a lead and its numbered sections — fallback for
 * rows without `metadata.highlights`.
 *
 * A line only starts a section when its number continues the sequence
 * (1, 2, 3, …), so body lines that happen to begin with a figure stay in
 * the paragraph they belong to.
 */
export function parseBriefBody(content: string): BriefBody {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const lead: string[] = [];
  const sections: BriefSection[] = [];
  let open: { index: string; headline: string; body: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const match = line ? SECTION_LINE.exec(line) : null;

    if (match && Number(match[1]) === sections.length + 1) {
      if (open) sections.push({ ...open, body: toParagraphs(open.body) });
      open = { index: match[1], headline: match[2].trim(), body: [] };
      continue;
    }

    (open ? open.body : lead).push(line);
  }

  if (open) sections.push({ ...open, body: toParagraphs(open.body) });

  return { lead: toParagraphs(lead), sections };
}

/** Blank-line separated blocks; single newlines inside a block are kept. */
function toParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let block: string[] = [];

  for (const line of lines) {
    if (line) {
      block.push(line);
      continue;
    }
    if (block.length > 0) {
      paragraphs.push(block.join("\n"));
      block = [];
    }
  }
  if (block.length > 0) paragraphs.push(block.join("\n"));

  return paragraphs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
