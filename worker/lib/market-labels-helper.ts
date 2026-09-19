// ─────────────────────────────────────────────────────────────────────────
// Market label helpers — body span match, chip polish, EN→KO hint lexicon
// ─────────────────────────────────────────────────────────────────────────
//
// Tunable maps live here so ongoing slug→display tweaks stay out of the
// resolve orchestration in market-labels.ts.
// Hints are only applied when the candidate string appears in the body
// (never invented). Soft KO chips may apply without a body span (Tags only).
// ─────────────────────────────────────────────────────────────────────────

/** Soft cap for chip display (Korean syllables / short EN phrases). */
export const MAX_CHIP_CHARS = 18;
export const MAX_CHIP_TOKENS = 4;

/**
 * Body-grounded fallback candidates for common EN slugs (KO reports).
 * Only used when the string appears in the body — never invented.
 * Add rows here as we discover slug→surface gaps (e.g. oil → 유가).
 */
export const LABEL_BODY_HINTS: Record<string, string[]> = {
  bonds: ["국채", "채권", "국채금리", "채권시장", "장기채"],
  "fixed income": ["국채", "채권", "채권시장"],
  "policy-tightening": ["긴축", "긴축 기조", "금리 인상", "통화정책"],
  "energy-supply-shortfall": [
    "원유 공급",
    "공급 부족",
    "공급 감소",
    "원유 공급 부족",
    "에너지",
  ],
  "10y-treasury-yield": ["10년물 금리", "미 10년물 금리", "10년물", "장기금리"],
  "10-year treasury yield": ["10년물 금리", "미 10년물 금리", "10년물"],
  "short-term treasury yields": ["단기 국채금리", "단기", "국채금리"],
  "core cpi": ["근원 CPI", "근원 물가", "CPI"],
  cpi: ["CPI", "소비자물가", "물가"],
  energy: ["에너지", "에너지 시장", "원유", "유가"],
  oil: ["유가", "원유", "오일", "WTI", "브렌트", "브렌트유"],
  shipping: ["운임", "탱커 운임", "원유 탱커 운임", "VLCC"],
  "federal reserve": ["연준", "Fed"],
  "us treasury": ["재무부", "국채"],
  "international energy agency": ["국제에너지기구", "IEA"],
  us: ["미국"],
  "saudi arabia": ["사우디"],
  global: ["글로벌"],
  nvidia: ["엔비디아"],
  "ai-infra": ["인프라", "AI 인프라", "컴퓨팅"],
  // on-device-ai: body often says 소비자 기기 / 애플 — chip uses TAG_SOFT_DISPLAY_KO
  "platform-consolidation": ["플랫폼"],
  "production-scale": ["프로덕션"],
  // 2026-09-17 daily tags — prefer longer body phrases first
  tokenization: ["토큰화 주식", "토큰화", "토큰"],
  "tokenized-assets": ["토큰화", "토큰화 주식"],
  "tokenized-stocks": ["토큰화 주식", "토큰화"],
  "regulatory-recalibration": ["금융 규제", "규제 면제", "규제"],
  "regulation-shift": ["금융 규제", "규제"],
  "policy-recalibration": ["금융 규제", "규제"],
  finance: ["금융 규제", "금융"],
  "trade-friction": ["무역 갈등", "무역 마찰", "무역"],
  "trade friction": ["무역 갈등", "무역 마찰", "무역"],
  "monetary-policy-shifts": [
    "통화정책",
    "기준금리",
    "정책금리",
    "금리 인상",
    "일본은행",
  ],
  "monetary policy": ["통화정책", "기준금리", "정책금리"],
  통화정책: ["통화정책", "기준금리", "정책금리", "금리 인상"],
};

/**
 * Tag-only soft KO chips when the natural Korean form is not a body substring
 * (e.g. on-device-ai → 온디바이스) but still useful for UI / Ask.
 * Also used as a stable chip when LLM grounding is flaky for abstract EN slugs.
 */
export const TAG_SOFT_DISPLAY_KO: Record<string, string> = {
  "on-device-ai": "온디바이스",
  "ai-infra": "인프라",
  nvidia: "엔비디아",
  "platform-consolidation": "플랫폼",
  "production-scale": "프로덕션",
  tokenization: "토큰화",
  "tokenized-assets": "토큰화",
  "tokenized-stocks": "토큰화",
  "regulatory-recalibration": "규제 재조정",
  "regulation-shift": "규제 재조정",
  "policy-recalibration": "규제 재조정",
  finance: "금융",
  "trade-friction": "무역 갈등",
  "trade friction": "무역 갈등",
  "monetary-policy-shifts": "통화정책",
  "monetary policy": "통화정책",
};

export function looseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ASCII-heavy keys (oil-prices, OpenAI, S&P500) — Tags keep English when lang=en. */
export function isEnglishyKey(key: string): boolean {
  const t = key.trim();
  if (!t) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  return !/[^\x00-\x7F]/.test(t);
}

export function variantsFor(key: string, aliases: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v) return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  };
  push(key);
  if (key.includes("-")) push(key.replace(/-/g, " "));
  if (/\s/.test(key)) push(key.replace(/\s+/g, "-"));
  for (const a of aliases) push(a);
  return out;
}

/**
 * Find the first body span matching any variant (case-insensitive / loose).
 * Returns the original body substring casing when possible.
 */
export function findBodySpan(body: string, variants: string[]): string | null {
  if (!body) return null;
  const lower = body.toLowerCase();
  for (const v of variants) {
    const i = lower.indexOf(v.toLowerCase());
    if (i >= 0) return body.slice(i, i + v.length);
  }
  const bodyLoose = looseKey(body);
  for (const v of variants) {
    const loose = looseKey(v);
    if (!loose || loose.length < 2) continue;
    if (bodyLoose.includes(loose)) return v;
  }
  return null;
}

/** Grounded check: candidate must appear in body. Returns body-casing span. */
export function groundInBody(body: string, candidate: string): string | null {
  const c = candidate.trim();
  if (!c) return null;
  const i = body.toLowerCase().indexOf(c.toLowerCase());
  if (i >= 0) return body.slice(i, i + c.length);
  const looseBody = looseKey(body);
  const looseCand = looseKey(c);
  if (looseCand && looseBody.includes(looseCand)) return c;
  return null;
}

/** True when span is chip-sized (not a headline / clause). */
export function isChipLike(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.length > MAX_CHIP_CHARS) return false;
  if (/[,，、|]/.test(t)) return false;
  if (/%/.test(t)) return false;
  if (/\d/.test(t) && t.length > 12) return false;
  if (t.split(/\s+/).filter(Boolean).length > MAX_CHIP_TOKENS) return false;
  return true;
}

/**
 * Trim a grounded span into a tag/keyword chip while staying in the body.
 * e.g. "원유 탱커 운임, 사상 최고치 경신" → "원유 탱커 운임"
 *      "미 10년물 금리 5% 근접" → "미 10년물 금리"
 */
export function polishLabel(body: string, raw: string): string | null {
  const grounded0 = groundInBody(body, raw);
  if (!grounded0) return null;

  let s = grounded0.trim();
  // First clause before list / em-dash separators (keep hyphenated EN tokens).
  const clause = s.split(/[,，、·|/]| — | – | —/)[0]?.trim() ?? s;
  if (clause) s = clause;

  const tryGround = (cand: string): string | null => {
    const g = groundInBody(body, cand);
    return g && isChipLike(g) ? g : null;
  };

  const direct = tryGround(s);
  if (direct) return direct;

  // Drop trailing tokens (esp. numeric / % tails) until chip-sized + grounded.
  const tokens = s.split(/\s+/).filter(Boolean);
  for (let n = tokens.length; n >= 1; n--) {
    const hit = tryGround(tokens.slice(0, n).join(" "));
    if (hit) return hit;
  }

  // Last resort: clause if grounded (may still be slightly long).
  return groundInBody(body, s) ?? grounded0;
}

export function hintsForKey(
  key: string,
  aliases: string[],
  lang: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v || v.length < 2) return;
    const id = v.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    out.push(v);
  };
  // KO hint lexicon only for Korean reports (EN body won't contain them).
  if (lang === "ko" || lang.startsWith("ko")) {
    const mapped = LABEL_BODY_HINTS[key.toLowerCase()];
    if (mapped) for (const h of mapped) push(h);
  }
  for (const a of aliases) push(a);
  return out;
}

export function softTagDisplay(key: string, lang: string): string | null {
  if (!(lang === "ko" || lang.startsWith("ko"))) return null;
  const soft = TAG_SOFT_DISPLAY_KO[key.toLowerCase()]?.trim();
  if (!soft || !isChipLike(soft)) return null;
  return soft;
}

export function pickHintSpan(
  body: string,
  key: string,
  aliases: string[],
  lang: string,
): string | null {
  const span = findBodySpan(body, hintsForKey(key, aliases, lang));
  if (!span) return null;
  return polishLabel(body, span) ?? span;
}
