// ChatAgent settings from Worker HTTP (default instance).

import { getAgentByName } from "agents";

import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";
import { ChatAgent } from "./chat-agent/ChatAgent";
import type { ChatSettings } from "./chat-agent/settings";

export async function getChatAgentSettings(env: Env): Promise<ChatSettings> {
  const agent = await getAgentByName<Env, ChatAgent>(
    env.ChatAgent as unknown as DurableObjectNamespace<ChatAgent>,
    DEFAULT_INSTANCE_NAME,
  );
  return agent.getSettings();
}
