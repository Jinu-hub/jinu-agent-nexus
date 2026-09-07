// ─────────────────────────────────────────────────────────────────────────
// Compact report keywords for chat / prefetch (T3)
// Surface tags + places + a few entity names — never full metadata JSON.
// ─────────────────────────────────────────────────────────────────────────

export type ReportChatKeywords = {
  tags: string[];
  places: string[];
  companies: string[];
  institutions: string[];
  technologies: string[];
  industries: string[];
  products: string[];
};

const TAG_LIMIT = 8;
const PLACE_LIMIT = 6;
const COMPANY_LIMIT = 4;
const INSTITUTION_LIMIT = 3;
const TECH_LIMIT = 4;
const INDUSTRY_LIMIT = 3;
const PRODUCT_LIMIT = 3;

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

function entityList(metadata: unknown, key: string): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const entities = (metadata as { entities?: unknown }).entities;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    return [];
  }
  return asStringList((entities as Record<string, unknown>)[key]);
}

/** Token-light keyword bundle for chat grounding. */
export function reportChatKeywords(item: {
  tags?: unknown;
  countries?: unknown;
  regions?: unknown;
  metadata?: unknown;
}): ReportChatKeywords {
  const places = [
    ...asStringList(item.countries),
    ...asStringList(item.regions),
  ].slice(0, PLACE_LIMIT);

  return {
    tags: asStringList(item.tags).slice(0, TAG_LIMIT),
    places,
    companies: entityList(item.metadata, "companies").slice(0, COMPANY_LIMIT),
    institutions: entityList(item.metadata, "institutions").slice(
      0,
      INSTITUTION_LIMIT,
    ),
    technologies: entityList(item.metadata, "technologies").slice(0, TECH_LIMIT),
    industries: entityList(item.metadata, "industries").slice(0, INDUSTRY_LIMIT),
    products: entityList(item.metadata, "products").slice(0, PRODUCT_LIMIT),
  };
}

export function hasReportChatKeywords(kw: ReportChatKeywords): boolean {
  return (
    kw.tags.length > 0 ||
    kw.places.length > 0 ||
    kw.companies.length > 0 ||
    kw.institutions.length > 0 ||
    kw.technologies.length > 0 ||
    kw.industries.length > 0 ||
    kw.products.length > 0
  );
}
