import { getAgentByName } from "agents";

import { resolveInstanceNameFromRequest } from "../src/lib/agent-identity";
import { ChatAgent } from "./chat-agent/ChatAgent";
import type { ChatSettingsPatch } from "./chat-agent/settings";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * HTTP inspection/update surface for the ChatAgent settings tables.
 *
 * Instance name comes from `x-lyra-instance` / `lyra_instance` cookie
 * (same guest id as useAgent). Cron callers with no cookie stay on `default`.
 */
export async function handleSettingsRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/settings" && url.pathname !== "/settings/events") {
    return null;
  }

  const instanceName = resolveInstanceNameFromRequest(request);
  const agent = await getAgentByName<Env, ChatAgent>(
    env.ChatAgent as unknown as DurableObjectNamespace<ChatAgent>,
    instanceName,
  );

  try {
    if (url.pathname === "/settings/events") {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      const limit = Number(url.searchParams.get("limit") ?? "100");
      return json(await agent.getSettingEvents(limit));
    }

    if (request.method === "GET") {
      return json(await agent.getSettings());
    }

    if (request.method === "PATCH") {
      const patch = (await request.json()) as ChatSettingsPatch;
      return json(await agent.updateSettings(patch));
    }

    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    return json({ error: message }, 400);
  }
}
