// ─────────────────────────────────────────────────────────────────────────
// Client-side tool handling — shared by every chat surface
// ─────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import type { useAgentChat } from "@cloudflare/ai-chat/react";

/**
 * Resolve tools whose `execute` lives in the browser.
 *
 * Stable across renders on purpose: without useCallback a fresh closure is
 * created every render, and the chat hook treats that as a new options
 * object and can re-init internals.
 */
export function useClientToolCall() {
  return useCallback<
    NonNullable<Parameters<typeof useAgentChat>[0]["onToolCall"]>
  >(async ({ toolCall, addToolOutput }) => {
    if (toolCall.toolName === "getUserTimezone") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      addToolOutput({
        toolCallId: toolCall.toolCallId,
        output: { timezone: tz },
      });
      return;
    }
    // Server-side tools (getWeather, getTodayMarketBrief, …) also may
    // surface here via useAgentChat. Do NOT addToolOutput — that would
    // short-circuit the real server execute with a fake client error
    // ("No client handler…") and make the model retry once.
  }, []);
}
