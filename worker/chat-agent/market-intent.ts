// Detect Market Memory (and related) intent from the latest user text.
// Used by ChatAgent.beforeTurn (prefetch) and beforeStep (tool force fallback).

export type MarketMemoryTool =
  | "getTodayMarketVoice"
  | "getTodayMarketBrief";

export type MarketDateHint = "today" | "yesterday" | "latest";

export type MarketMemoryIntent =
  | {
      kind: "voice";
      dateHint?: MarketDateHint;
    }
  | {
      kind: "compare";
    }
  | {
      kind: "fullText";
      dateHint?: MarketDateHint;
    }
  | {
      kind: "brief";
      dateHint?: MarketDateHint;
    };

function dateHintFromText(t: string): MarketDateHint | undefined {
  if (/오늘|today/i.test(t)) return "today";
  if (/어제|yesterday/i.test(t)) return "yesterday";
  if (/latest|최신/i.test(t)) return "latest";
  return undefined;
}

/** Prefer voice when both brief and voice cues appear. */
export function detectMarketMemoryIntent(
  text: string,
): MarketMemoryIntent | null {
  const t = text.trim();
  if (!t) return null;

  if (
    /보이스|음성\s*브리핑|voice\s*brief|market\s*voice|음성\s*브리핑|(마켓|브리핑|market|brief).{0,12}(틀어|재생|listen|play)|(?:틀어|재생).{0,12}(보이스|브리핑|voice)/i.test(
      t,
    )
  ) {
    return { kind: "voice", dateHint: dateHintFromText(t) };
  }

  if (
    /(그제|어제).{0,24}(톤|비교|달라|차이)/i.test(t) ||
    /(며칠|연속).{0,12}(이슈|테마|리스크)/i.test(t) ||
    /(톤|비교).{0,16}(그제|어제|달라)/i.test(t)
  ) {
    return { kind: "compare" };
  }

  // Full-text / "show me the brief" → panel redirect, not chat dump
  if (
    /(전문|원문|full\s*text|full\s*brief)/i.test(t) ||
    /(브리핑|brief|이슈).{0,12}(보여|보여줘|전체)/i.test(t) ||
    /(보여|보여줘).{0,12}(브리핑|brief)/i.test(t)
  ) {
    return { kind: "fullText", dateHint: dateHintFromText(t) };
  }

  if (
    /브리핑|briefing|마켓\s*이슈|market\s*issue|today\s+in\s+30|market\s*memory|다이제스트/i.test(
      t,
    )
  ) {
    return { kind: "brief", dateHint: dateHintFromText(t) };
  }

  // Interpretive asks that still need grounded brief data
  if (
    /(pulse|takeaway|리스크|체크리스트|톤|요약|정리)/i.test(t) &&
    /(마켓|브리핑|이슈|brief|market|어제|그제|오늘|latest)/i.test(t)
  ) {
    return { kind: "brief", dateHint: dateHintFromText(t) };
  }

  return null;
}

/** Map intent → tool name for beforeStep fallback when prefetch did not run. */
export function detectMarketMemoryTool(
  text: string,
): MarketMemoryTool | null {
  const intent = detectMarketMemoryIntent(text);
  if (!intent) return null;
  if (intent.kind === "voice") return "getTodayMarketVoice";
  return "getTodayMarketBrief";
}

/** Non-market: force weather tool (same reasoning-only hang pattern). */
export function detectWeatherTool(text: string): "getWeather" | null {
  const t = text.trim();
  if (!t) return null;
  if (/날씨|weather|기온|온도/i.test(t)) return "getWeather";
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
