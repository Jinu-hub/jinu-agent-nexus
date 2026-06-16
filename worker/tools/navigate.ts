// ─────────────────────────────────────────────────────────────────────────
// Tool: navigate — open a URL in the agent's remote Chrome
//
// PATTERN: SERVER-SIDE TOOL THAT REUSES AN AGENT-LEVEL RESOURCE
// ─────────────────────────────────────────────────────────────────────────
// The agent owns a single Puppeteer `Page` instance (see
// ChatAgent.getPage). Both `navigate` and `screenshot` operate on that
// same page, so going to a URL and then screenshotting captures the
// state you expect — including any clicks the user made in the Live
// View iframe between tool calls.
//
// Browser sessions are billed by minute on Cloudflare Browser
// Rendering. The agent calls `puppeteer.launch(..., { keep_alive:
// 600_000 })` to give the user 10 minutes of interaction time before
// the session is automatically torn down.
//
// Live View — when the agent first opens a browser, it broadcasts the
// DevTools URL via `agent.broadcast(JSON.stringify({ type:
// "live_view", url }))`. The frontend Browser panel subscribes to
// these messages via `useAgent({ onMessage })` and renders the URL in
// an iframe so the user sees what the agent sees.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";
import type { ChatAgent } from "../chat-agent";

export function createNavigateTool(agent: ChatAgent) {
  return tool({
    description:
      "Open a URL in the browser. Returns the page title once loaded. Does NOT take a screenshot — call `screenshot` separately only when the user explicitly asks for one. The user can watch in a Live View iframe.",
    inputSchema: z.object({
      url: z.url().describe("The full URL to navigate to."),
    }),
    execute: async ({ url }) => {
      // Reusing the same page across calls is what makes the
      // multi-step browsing UX coherent. Don't open a new tab per
      // call.
      if (agent.page?.url() === url) {
        return { ok: true, title: await agent.page.title() };
      }
      const page = await agent.getPage();
      await page.goto(url);
      return { ok: true, title: await page.title() };
    },
  });
}
