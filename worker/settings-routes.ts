import { getAgentByName } from "agents";

import { resolveTrustedInstanceName } from "./auth";
import { ChatAgent } from "./chat-agent/ChatAgent";
import type { ChatSettingsPatch } from "./chat-agent/settings";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * HTTP inspection/update surface for the ChatAgent settings tables.
 *
 * Instance: verified Supabase user id, or guest_* cookie (Phase 2).
 * Cron callers with no cookie stay on `default`.
 * Phase 3: `hidden_panels` PATCH requires admin allowlist.
 */
export async function handleSettingsRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/settings" && url.pathname !== "/settings/events") {
    return null;
  }

  const trusted = await resolveTrustedInstanceName(request, env);
  if (!trusted.ok) {
    return json({ error: trusted.error }, trusted.status);
  }

  const agent = await getAgentByName<Env, ChatAgent>(
    env.ChatAgent as unknown as DurableObjectNamespace<ChatAgent>,
    trusted.name,
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
      // Phase 4: global panel defaults → PATCH /api/admin/panel-defaults
      if (patch.hidden_panels !== undefined) {
        return json(
          {
            error:
              "use PATCH /api/admin/panel-defaults for global panel tabs",
          },
          400,
        );
      }
      return json(await agent.updateSettings(patch));
    }

    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    return json({ error: message }, 400);
  }
}
