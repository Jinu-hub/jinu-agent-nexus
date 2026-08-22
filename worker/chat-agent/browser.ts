import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";

import type { BrowserSessionHost } from "./agent-host";

// Lazy launcher. Reuses the existing browser session if still connected.
// Re-broadcasts the Live View URL on every getPage() so late-joining tabs
// catch up.
export async function getPage(agent: BrowserSessionHost, env: Env): Promise<Page> {
  if (!agent.page || !agent.browser?.connected) {
    agent.browser = await puppeteer.launch(env.BROWSER, {
      keep_alive: 600_000,
    });
    agent.page = await agent.browser.newPage();
    await agent.page.setViewport({ width: 1280, height: 720 });
  }

  const liveViewUrl = await getLiveViewUrl(agent, env);
  if (liveViewUrl) {
    agent.broadcast(JSON.stringify({ type: "live_view", url: liveViewUrl }));
  }
  return agent.page;
}

// Resolve the hosted Live View URL via Cloudflare's DevTools API.
export async function getLiveViewUrl(
  agent: BrowserSessionHost,
  env: Env,
): Promise<string | null> {
  if (!agent.browser) return null;
  if (!env.API_TOKEN) return null;
  if (!env.ACCOUNT_ID) return null;
  const sessionId = agent.browser.sessionId();

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/browser-rendering/devtools/browser/${sessionId}/json/list`,
    { headers: { Authorization: `Bearer ${env.API_TOKEN}` } },
  );
  if (!res.ok) return null;

  const targets = (await res.json()) as Array<{
    type: string;
    devtoolsFrontendUrl: string;
  }>;
  const url = targets.find((t) => t.type === "page")?.devtoolsFrontendUrl;
  if (!url) return null;

  const liveUrl = new URL(url);
  liveUrl.searchParams.set("mode", "tab");
  return liveUrl.toString();
}

export async function closeBrowser(agent: BrowserSessionHost) {
  await agent.browser?.close();
  agent.browser = undefined;
  agent.page = undefined;
  agent.broadcast(JSON.stringify({ type: "live_view", url: null }));
}

// Re-export types for tools that reference agent.browser / agent.page.
export type { Browser, Page };
