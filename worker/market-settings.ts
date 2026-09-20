// ChatAgent settings from Worker HTTP — system / cron path uses `default`.

import { getAgentByName } from "agents";

import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";
import { ChatAgent } from "./chat-agent/ChatAgent";
import type { ChatSettings } from "./chat-agent/settings";

/**
 * Content-pipeline settings (enabled series for ingest).
 * Stays on `default` so cron is not tied to a random guest browser.
 * Interactive UI settings use the guest cookie via /settings.
 */
export async function getChatAgentSettings(env: Env): Promise<ChatSettings> {
  const agent = await getAgentByName<Env, ChatAgent>(
    env.ChatAgent as unknown as DurableObjectNamespace<ChatAgent>,
    DEFAULT_INSTANCE_NAME,
  );
  return agent.getSettings();
}
