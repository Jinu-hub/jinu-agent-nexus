// ─────────────────────────────────────────────────────────────────────────
// Tool: getUserTimezone — CLIENT-SIDE, runs in the browser
//
// PATTERN: CLIENT-SIDE TOOL
// ─────────────────────────────────────────────────────────────────────────
// A client-side tool has NO `execute` function on the server. The agents
// SDK detects the missing execute, ships the tool schema to the
// browser, and the React app handles the call via `useAgentChat({
// onToolCall })`.
//
// The browser then calls `addToolOutput(...)` to feed the result back
// to the LLM, and the conversation continues.
//
// Client-side tools are the right choice when:
//   • The data lives in the browser (geolocation, timezone, clipboard,
//     selected text, current scroll position…)
//   • Something needs a permission popup (camera, mic, push)
//   • You want to inject context without making the user type
//
// The matching handler in the frontend lives in `src/chat/Chat.tsx`
// (look for the `onToolCall` callback).
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

export function createGetUserTimezoneTool() {
  return tool({
    description:
      "Detect the user's IANA timezone from their browser. Call this BEFORE asking the user what timezone they are in — their browser already knows.",
    inputSchema: z.object({}),
    // No `execute` field — that's the entire opt-in for client-side
    // execution. The agents SDK routes this call to the browser via
    // `onToolCall`.
  });
}
