// Shared Market Memory example prompts — Chat empty state + Market panel.
// Keep prompts aligned with worker/chat-agent/market-intent.ts.

export type MarketSuggestion = {
  id: string;
  /** Exact text sent to chat on click. */
  prompt: string;
  /** Short chip label in the Market panel. */
  label: string;
};

export const MARKET_SUGGESTIONS: MarketSuggestion[] = [
  {
    id: "risk",
    label: "리스크 정리",
    prompt: "Latest 브리핑에서 가장 큰 리스크만 정리해줘",
  },
  {
    id: "pulse",
    label: "pulse / takeaway",
    prompt: "어제 pulse/takeaway 한 줄로 말해줘",
  },
  {
    id: "compare",
    label: "톤 비교",
    prompt: "그제랑 어제 브리핑 톤이 어떻게 달라졌지?",
  },
  {
    id: "reportCore",
    label: "풀리포트 핵심",
    prompt: "어제 풀리포트 핵심만 정리해줘",
  },
  {
    id: "keywords",
    label: "키워드만",
    prompt: "Latest 풀리포트 키워드만 말해줘",
  },
  {
    id: "companies",
    label: "주요 기업",
    prompt: "Latest 풀리포트에 나온 주요 기업·기관만 말해줘",
  },
  {
    id: "highlights",
    label: "하이라이트만",
    prompt: "어제 풀리포트 하이라이트만 말해줘",
  },
  {
    id: "briefVsReport",
    label: "리포트가 더 담은 것",
    prompt: "어제 브리프에 없는 풀리포트 내용만 짚어줘",
  },
  {
    id: "voice",
    label: "보이스 → 탭",
    prompt: "어제 보이스 틀어줘",
  },
  {
    id: "fullReport",
    label: "리포트 → 탭",
    prompt: "풀리포트 전문 보여줘",
  },
];

/** T4 — Topics / entity chip → chat ask (panel date when known). */
export type TopicChipAskKind = "tag" | "place" | "entity";

/**
 * Chip → chat prompt. `label` is the **user-visible** phrase in 「」
 * (prefer topic_labels / KO display). Vector expand reverse-maps to slug.
 */
export function topicChipAskPrompt(
  kind: TopicChipAskKind,
  label: string,
  marketDate?: string | null,
): string {
  const name = label.trim();
  const when =
    marketDate && /^\d{4}-\d{2}-\d{2}$/.test(marketDate)
      ? marketDate
      : "Latest";
  if (kind === "place") {
    return `${when} 풀리포트에서 ${name} 관련 포인트만 짧게 짚어줘`;
  }
  if (kind === "entity") {
    return `${when} 풀리포트에서 「${name}」 관련 내용만 짧게 짚어줘`;
  }
  return `${when} 풀리포트에서 「${name}」 키워드 관련 내용만 짧게 짚어줘`;
}
