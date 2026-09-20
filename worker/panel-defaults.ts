// ─────────────────────────────────────────────────────────────────────────
// Global panel-tab defaults — ChatAgent `"default"` (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
//
// Product rule: which side panels are hidden for everyone is a *system*
// setting on the `"default"` DO — not each guest/user instance.
// Admin writes via PATCH /api/admin/panel-defaults; anyone may read
// GET /api/panel-defaults for the tab strip.
// ─────────────────────────────────────────────────────────────────────────

import { getAgentByName } from "agents";

import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";
import { requireAdmin } from "./auth";
import { ChatAgent } from "./chat-agent/ChatAgent";
import {
  DEFAULT_HIDDEN_PANELS,
  normalizeHiddenPanels,
  type ToggleablePanel,
} from "./chat-agent/settings";

async function defaultChatAgent(env: Env): Promise<ChatAgent> {
  return getAgentByName<Env, ChatAgent>(
    env.ChatAgent as unknown as DurableObjectNamespace<ChatAgent>,
    DEFAULT_INSTANCE_NAME,
  );
}

/** Hidden panel ids for the whole product (fallback: code default). */
export async function getGlobalHiddenPanels(
  env: Env,
): Promise<ToggleablePanel[]> {
  try {
    const agent = await defaultChatAgent(env);
    const settings = await agent.getSettings();
    // Empty [] on a brand-new default DO still means "use product default"
    // until an admin explicitly saves (including "show all" as []).
    // Distinguish: if updated_at is empty-ish and panels empty → code default.
    // Simpler: always return stored normalize; seed INSERT already uses
    // DEFAULT_HIDDEN_PANELS. If somehow [], treat as all-visible (admin choice).
    return normalizeHiddenPanels(settings.hidden_panels);
  } catch {
    return [...DEFAULT_HIDDEN_PANELS];
  }
}

export async function setGlobalHiddenPanels(
  env: Env,
  panels: unknown,
): Promise<ToggleablePanel[]> {
  const next = normalizeHiddenPanels(panels);
  const agent = await defaultChatAgent(env);
  const updated = await agent.updateSettings({ hidden_panels: next });
  return normalizeHiddenPanels(updated.hidden_panels);
}

/**
 * Public read:
 *   GET /api/panel-defaults → { ok, hidden_panels }
 *
 * Returns null if path does not match (caller continues).
 */
export async function handlePanelDefaultsRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/panel-defaults") return null;
  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }
  const hidden_panels = await getGlobalHiddenPanels(env);
  return Response.json({ ok: true, hidden_panels });
}
