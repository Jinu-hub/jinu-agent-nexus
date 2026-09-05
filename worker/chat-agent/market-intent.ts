// Detect Market Memory brief vs voice intent from the latest user text.
// Used by ChatAgent.beforeStep to force the correct tool on step 0.

export type MarketMemoryTool =
  | "getTodayMarketVoice"
  | "getTodayMarketBrief";

/** Prefer voice when both brief and voice cues appear. */
export function detectMarketMemoryTool(
  text: string,
): MarketMemoryTool | null {
  const t = text.trim();
  if (!t) return null;

  if (
    /보이스|음성\s*브리핑|voice\s*brief|market\s*voice|\bvoice\b|listen\s+to|play\s+(the\s+)?(brief|audio|market)/i.test(
      t,
    )
  ) {
    return "getTodayMarketVoice";
  }

  if (
    /브리핑|briefing|마켓\s*이슈|market\s*issue|today\s+in\s+30|market\s*memory/i.test(
      t,
    )
  ) {
    return "getTodayMarketBrief";
  }

  return null;
}

export function latestUserText(
  messages: Array<{ role: string; content: unknown }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) continue;
    return content
      .map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          (part as { type: string }).type === "text" &&
          "text" in part
        ) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
