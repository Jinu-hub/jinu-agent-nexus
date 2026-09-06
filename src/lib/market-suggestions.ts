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
    id: "voice",
    label: "보이스 → 탭",
    prompt: "어제 보이스 틀어줘",
  },
  {
    id: "fullText",
    label: "전문 → 탭",
    prompt: "브리핑 전문 보여줘",
  },
];
