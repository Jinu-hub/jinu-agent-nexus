// ─────────────────────────────────────────────────────────────────────────
// Tool: getCurrentTime — server-side, no arguments
//
// PATTERN: SERVER-SIDE TOOL
// ─────────────────────────────────────────────────────────────────────────
// A server-side tool has an `execute` function that runs inside the
// agent (Durable Object). The LLM calls it, the result is sent back to
// the model, the model uses it to compose its reply.
//
// Server-side tools are the right choice when:
//   • The work needs server-only resources (env bindings, secrets, DB)
//   • You want a deterministic result the LLM can chain on
//   • The user shouldn't be able to fake the response from the browser
//
// This particular tool is trivial — it returns the agent's wall-clock
// time. Useful as a template you can copy when adding your own tool.
//
// ── HOW TO ADD A NEW SERVER-SIDE TOOL ─────────────────────────────────
// 1. Copy this file. Rename it after your tool (camelCase).
// 2. Define a Zod input schema. Empty object if there are no inputs.
// 3. Write your `execute` function. Anything returned is JSON.stringified
//    and shown to the LLM in the next step.
// 4. Open `worker/chat-agent.ts`, import the factory, and add it to the
//    object returned by `getTools()`.
// 5. Reload the dev server. The model will see the new tool on its
//    next turn.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

export function createGetCurrentTimeTool() {
  return tool({
    description:
      "Get the current UTC time on the server. Use this when the user asks 'what time is it' or needs a timestamp.",
    inputSchema: z.object({}),
    execute: async () => {
      const now = new Date();
      return {
        iso: now.toISOString(),
        unixMs: now.getTime(),
      };
    },
  });
}
