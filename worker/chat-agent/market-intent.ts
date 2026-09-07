// Detect Market Memory (and related) intent from the latest user text.
// Used by ChatAgent.beforeTurn (prefetch) and beforeStep (tool force fallback).

export type MarketMemoryTool =
  | "getTodayMarketVoice"
  | "getTodayMarketBrief"
  | "getTodayMarketReport";

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
      kind: "reportVsBrief";
      dateHint?: MarketDateHint;
    }
  | {
      kind: "report";
      dateHint?: MarketDateHint;
      /** User wants panel redirect for full report (no dump). */
      fullText?: boolean;
      /** User wants tags / places / top entities only. */
      keywordsOnly?: boolean;
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

  // Brief vs full report (same day) — BEFORE day-over-day compare.
  // Otherwise "어제 … 차이" matches the compare regex and skips report.
  // Also: "브리프에 없는 … 풀리포트" (what Report adds beyond Brief).
  if (
    /(브리프|brief).{0,24}(풀\s*리포트|풀리포트|리포트|report|원문)/i.test(t) ||
    /(풀\s*리포트|풀리포트|리포트|report).{0,24}(브리프|brief)/i.test(t) ||
    /(브리프|brief).{0,16}(없|빠진|빠진\s*것|없는).{0,16}(풀\s*리포트|풀리포트|리포트|report)/i.test(
      t,
    )
  ) {
    return { kind: "reportVsBrief", dateHint: dateHintFromText(t) };
  }

  // Day-over-day brief compare (그제 vs 어제, multi-day) — not "어제 A vs B"
  if (
    /(그제).{0,32}(어제|톤|비교|달라|차이)/i.test(t) ||
    /(어제).{0,32}(그제)/i.test(t) ||
    /(며칠|연속).{0,12}(이슈|테마|리스크)/i.test(t) ||
    /(톤\s*비교|비교).{0,16}(그제|어제)/i.test(t)
  ) {
    return { kind: "compare" };
  }

  // Full report / digest (item_contents)
  if (
    /풀\s*리포트|풀리포트|full\s*report|digest\s*report|다이제스트\s*리포트/i.test(
      t,
    ) ||
    /(하이라이트).{0,12}(만|풀|리포트|report)/i.test(t) ||
    /(리포트|report).{0,12}(하이라이트|핵심|요약)/i.test(t) ||
    // Keyword / topic / entity asks (T3) — still grounded on report
    /(키워드|태그|토픽|topics?|엔티티|entities)/i.test(t) ||
    /(주요\s*기업|companies|institutions).{0,16}(리포트|report|풀|다이제스트)?/i.test(
      t,
    ) ||
    /(리포트|report|풀리포트).{0,16}(키워드|태그|기업|기관)/i.test(t)
  ) {
    const fullText =
      /(전문|원문|보여|보여줘|full\s*text)/i.test(t) &&
      !/(핵심|하이라이트|요약|정리|차이|비교|키워드|태그|토픽|기업)/i.test(t);
    const keywordsOnly =
      !fullText &&
      (/(키워드|태그|토픽|topics?|엔티티|entities)/i.test(t) ||
        /(주요\s*기업|companies|institutions)/i.test(t));
    return {
      kind: "report",
      dateHint: dateHintFromText(t),
      fullText,
      keywordsOnly,
    };
  }

  // Brief full-text / "show me the brief" → panel redirect, not chat dump
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
  if (intent.kind === "report" || intent.kind === "reportVsBrief") {
    return "getTodayMarketReport";
  }
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
