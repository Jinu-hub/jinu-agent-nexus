// ─────────────────────────────────────────────────────────────────────────
// Tool: screenshot — capture the current browser page to R2
//
// PATTERN: SERVER-SIDE TOOL THAT WRITES TO R2 AND SERVES VIA THE WORKER
// ─────────────────────────────────────────────────────────────────────────
// Screenshots are PNG bytes — too big to return inline through the
// chat protocol without bloating message persistence. So we:
//   1. Store the bytes in R2 under `screenshots/<key>`
//   2. Return just the key from the tool
//   3. The frontend renders the image via `/screenshots/<key>`
//   4. The worker's fetch handler proxies that path back out of R2
//      (see worker/index.ts)
//
// Same R2 bucket as skills/ and pdfs/ — namespaced by prefix. Single
// bucket keeps the wrangler.jsonc tidy.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";
import type { ChatAgent } from "../chat-agent";

// `env` is passed in explicitly because `agent.env` is protected on
// the agent class. We could expose a public getter on ChatAgent, but
// passing env makes the factory's dependencies obvious.
export function createScreenshotTool(agent: ChatAgent, env: Env) {
  return tool({
    description:
      "Take a screenshot of the current page and save it. Only use when the user explicitly asks for a screenshot — don't do it automatically after navigate.",
    inputSchema: z.object({
      fileName: z
        .string()
        .describe("A short slug for the screenshot (e.g. 'hero', 'pricing')."),
    }),
    execute: async ({ fileName }) => {
      const page = await agent.getPage();
      const buffer = await page.screenshot({ type: "png" });
      const key = `screenshots/${Date.now()}-${fileName}.png`;
      await env.BUCKET.put(key, buffer, {
        httpMetadata: { contentType: "image/png" },
      });
      return { ok: true, key };
    },
  });
}
