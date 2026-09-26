// Shared Market Memory example prompts — Chat empty state + Market panel.
// Keep prompts aligned with worker/chat-agent/market-intent.ts.
// Labels and prompts follow Settings content_lang (screen language).
// Chat reply language still follows whatever the user (or chip) sends.

import type { ContentLang } from "../../worker/chat-agent/settings";

export type MarketSuggestion = {
  id: string;
  /** Exact text sent to chat on click. */
  prompt: string;
  /** Short chip label in the Market panel. */
  label: string;
};

type SuggestionCopy = { label: string; prompt: string };

const SUGGESTION_COPY: Record<
  string,
  { ko: SuggestionCopy; en: SuggestionCopy }
> = {
  risk: {
    ko: {
      label: "리스크 정리",
      prompt:
        "Latest 브리핑에서 주요한 리스크를 선별하고 중요성에 대해 쉽게 설명해줘",
    },
    en: {
      label: "Risk recap",
      prompt:
        "From the Latest briefing, pick the main risks and explain why they matter in plain language",
    },
  },
  pulse: {
    ko: {
      label: "pulse / takeaway",
      prompt: "어제 pulse/takeaway를 쉽게 풀어서 설명해줘",
    },
    en: {
      label: "pulse / takeaway",
      prompt: "Explain yesterday's pulse/takeaway in plain language",
    },
  },
  compare: {
    ko: {
      label: "톤 비교",
      prompt: "그제랑 어제 브리핑 톤이 어떻게 달라졌고 왜 그런지 설명해줘",
    },
    en: {
      label: "Tone compare",
      prompt:
        "How did the briefing tone change from the day before yesterday to yesterday, and why?",
    },
  },
  reportCore: {
    ko: {
      label: "풀리포트 핵심",
      prompt: "어제 풀리포트 핵심을 아주 쉽게 이해 할수 있게 설명해줘",
    },
    en: {
      label: "Report core",
      prompt:
        "Explain the core of yesterday's full report so it's very easy to understand",
    },
  },
  keywords: {
    ko: {
      label: "키워드만",
      prompt:
        "Latest 풀리포트 키워드를 알려주고, 오늘 스토리가 뭔지 한눈에 설명해줘",
    },
    en: {
      label: "Keywords",
      prompt:
        "List the Latest full-report keywords and explain today's story at a glance",
    },
  },
  companies: {
    ko: {
      label: "주요 기업",
      prompt: "Latest 풀리포트에 나온 주요 기업·기관이 왜 언급됐는지 설명해줘",
    },
    en: {
      label: "Key names",
      prompt:
        "Explain why the main companies and institutions in the Latest full report were mentioned",
    },
  },
  highlights: {
    ko: {
      label: "하이라이트만",
      prompt: "어제 풀리포트 하이라이트를 짚어주고 왜 중요한지 설명해줘",
    },
    en: {
      label: "Highlights",
      prompt:
        "Walk through yesterday's full-report highlights and why they matter",
    },
  },
  briefVsReport: {
    ko: {
      label: "리포트가 더 담은 것",
      prompt: "어제 브리프에 없는 풀리포트 내용을 심플하게 요약해줘",
    },
    en: {
      label: "What the report adds",
      prompt:
        "Simply summarize what yesterday's full report covers that the brief does not",
    },
  },
  voice: {
    ko: {
      label: "보이스 → 탭",
      prompt: "어제 보이스 틀어줘",
    },
    en: {
      label: "Voice → tab",
      prompt: "Play yesterday's voice briefing",
    },
  },
  fullReport: {
    ko: {
      label: "리포트 → 탭",
      prompt: "풀리포트 전문 보여줘",
    },
    en: {
      label: "Report → tab",
      prompt: "Show me the full report",
    },
  },
};

const SUGGESTION_ORDER = [
  "risk",
  "pulse",
  "compare",
  "reportCore",
  "keywords",
  "companies",
  "highlights",
  "briefVsReport",
  "voice",
  "fullReport",
] as const;

function copyFor(id: string, lang: ContentLang): SuggestionCopy {
  const row = SUGGESTION_COPY[id];
  return row?.[lang] ?? row?.ko ?? { label: id, prompt: id };
}

export function marketSuggestions(lang: ContentLang): MarketSuggestion[] {
  return SUGGESTION_ORDER.map((id) => ({ id, ...copyFor(id, lang) }));
}

/** Chat home empty state — a short subset so the intro stays scannable. */
const HOME_CHAT_IDS = new Set(["risk", "reportCore", "keywords", "voice"]);

export function homeChatSuggestions(lang: ContentLang): MarketSuggestion[] {
  return marketSuggestions(lang).filter((s) => HOME_CHAT_IDS.has(s.id));
}

/**
 * Date-pinned copy for helper-rail / report-page chips.
 * Names the browse `market_date` so prompts do not rely on "Latest" / "어제".
 */
const DATED_PROMPT: Record<
  string,
  (date: string) => { ko: SuggestionCopy; en: SuggestionCopy }
> = {
  risk: (d) => ({
    ko: {
      label: "리스크",
      prompt: `${d} 브리핑에서 주요한 리스크를 선별하고 중요성에 대해 쉽게 설명해줘`,
    },
    en: {
      label: "Risks",
      prompt: `From the ${d} briefing, pick the main risks and explain why they matter in plain language`,
    },
  }),
  pulse: (d) => ({
    ko: {
      label: "pulse / takeaway",
      prompt: `${d} pulse/takeaway를 쉽게 풀어서 설명해줘`,
    },
    en: {
      label: "pulse / takeaway",
      prompt: `Explain the ${d} pulse/takeaway in plain language`,
    },
  }),
  compare: (d) => ({
    ko: {
      label: "톤 비교",
      prompt: `${d}와 그 전날 브리핑 톤이 어떻게 달라졌고 왜 그런지 설명해줘`,
    },
    en: {
      label: "Tone compare",
      prompt: `How did the briefing tone change from the day before ${d} to ${d}, and why?`,
    },
  }),
  reportCore: (d) => ({
    ko: {
      label: "풀리포트 핵심",
      prompt: `${d} 풀리포트 핵심을 아주 쉽게 이해 할수 있게 설명해줘`,
    },
    en: {
      label: "Report core",
      prompt: `Explain the core of the ${d} full report so it's very easy to understand`,
    },
  }),
  keywords: (d) => ({
    ko: {
      label: "키워드만",
      prompt: `${d} 풀리포트 키워드를 알려주고, 오늘 스토리가 뭔지 한눈에 설명해줘`,
    },
    en: {
      label: "Keywords",
      prompt: `List the ${d} full-report keywords and explain today's story at a glance`,
    },
  }),
  companies: (d) => ({
    ko: {
      label: "주요 기업",
      prompt: `${d} 풀리포트에 나온 주요 기업·기관이 왜 언급됐는지 설명해줘`,
    },
    en: {
      label: "Key names",
      prompt: `Explain why the main companies and institutions in the ${d} full report were mentioned`,
    },
  }),
  highlights: (d) => ({
    ko: {
      label: "하이라이트만",
      prompt: `${d} 풀리포트 하이라이트를 짚어주고 왜 중요한지 설명해줘`,
    },
    en: {
      label: "Highlights",
      prompt: `Walk through the ${d} full-report highlights and why they matter`,
    },
  }),
  briefVsReport: (d) => ({
    ko: {
      label: "리포트가 더 담은 것",
      prompt: `${d} 브리프에 없는 풀리포트 내용을 심플하게 요약해줘`,
    },
    en: {
      label: "What the report adds",
      prompt: `Simply summarize what the ${d} full report covers that the brief does not`,
    },
  }),
  voice: (d) => ({
    ko: {
      label: "보이스 → 탭",
      prompt: `${d} 보이스 틀어줘`,
    },
    en: {
      label: "Voice → tab",
      prompt: `Play the ${d} voice briefing`,
    },
  }),
  fullReport: (d) => ({
    ko: {
      label: "리포트 → 탭",
      prompt: `${d} 풀리포트 전문 보여줘`,
    },
    en: {
      label: "Report → tab",
      prompt: `Show me the ${d} full report`,
    },
  }),
};

/** Helper-rail Ask chips — fuller set; vertical scroll is OK. */
const HELPER_ASK_ORDER = [
  "risk",
  "reportCore",
  "briefVsReport",
  "keywords",
  "highlights",
  "pulse",
  "companies",
  "compare",
  "voice",
  "fullReport",
] as const;

/** Report-page chat empty state — keep short (full prompt text per row). */
const REPORT_CHAT_ORDER = [
  "risk",
  "reportCore",
  "briefVsReport",
  "keywords",
] as const;

function datedSuggestions(
  marketDate: string,
  lang: ContentLang,
  order: readonly string[],
): MarketSuggestion[] {
  return order.map((id) => {
    const row = DATED_PROMPT[id]?.(marketDate);
    const copy = row?.[lang] ?? row?.ko ?? copyFor(id, lang);
    return { id, ...copy };
  });
}

/**
 * Home helper rail — date-pinned Ask rows (one per suggestion; Ask scrolls).
 */
export function reportPageSuggestions(
  marketDate: string,
  lang: ContentLang,
): MarketSuggestion[] {
  return datedSuggestions(marketDate, lang, HELPER_ASK_ORDER);
}

/**
 * Standalone report-page chat empty state — short list of full prompts.
 */
export function reportChatSuggestions(
  marketDate: string,
  lang: ContentLang,
): MarketSuggestion[] {
  return datedSuggestions(marketDate, lang, REPORT_CHAT_ORDER);
}

/** T4 — Topics / entity chip → chat ask (panel date when known). */
export type TopicChipAskKind = "tag" | "place" | "entity";

/**
 * Chip → chat prompt. `label` is the **user-visible** phrase in 「」
 * (prefer topic_labels / KO display). Vector expand reverse-maps to slug.
 * `kind` is kept for call-site clarity; all kinds share the 「」 form so
 * `market-vector-search` can extract the query.
 */
export function topicChipAskPrompt(
  _kind: TopicChipAskKind,
  label: string,
  marketDate?: string | null,
  lang: ContentLang = "ko",
): string {
  const name = label.trim();
  const when =
    marketDate && /^\d{4}-\d{2}-\d{2}$/.test(marketDate)
      ? marketDate
      : "Latest";
  if (lang === "en") {
    return `In the ${when} full report, explain 「${name}」`;
  }
  return `${when} 풀리포트에서 「${name}」 관련 내용에 대해 설명해줘`;
}
