// ─────────────────────────────────────────────────────────────────────────
// ChatAgent WebSocket auth (Phase 5)
// ─────────────────────────────────────────────────────────────────────────
//
// User UUID instances require `?token=` (Supabase access JWT) matching the
// DO name. guest_* may connect without a token. `"default"` rejects browser
// sockets (system/cron only via getAgentByName).
// ─────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_INSTANCE_NAME,
  isValidInstanceName,
} from "../src/lib/agent-identity";
import {
  bearerAccessToken,
  isGuestInstanceName,
  isUserInstanceName,
  verifySupabaseAccessToken,
} from "./auth";

/** Same close code as Live Market Room unauthorized. */
export const CHAT_AGENT_UNAUTHORIZED_CLOSE = 4401;

/** Extract ChatAgent instance name from `/agents/chat-agent/:name` (any case). */
export function chatAgentInstanceFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "agents") return null;
  const agentClass = parts[1]!.replace(/-/g, "").toLowerCase();
  if (agentClass !== "chatagent") return null;
  try {
    return decodeURIComponent(parts[2]!);
  } catch {
    return parts[2] ?? null;
  }
}

function tokenFromRequest(request: Request): string | null {
  const q = new URL(request.url).searchParams.get("token")?.trim();
  if (q) return q;
  return bearerAccessToken(request);
}

/**
 * Whether this WebSocket upgrade may attach to the ChatAgent instance.
 */
export async function authorizeChatAgentWebSocket(
  request: Request,
  env: Env,
  instanceName: string,
): Promise<boolean> {
  if (!isValidInstanceName(instanceName)) return false;

  if (isGuestInstanceName(instanceName)) {
    return true;
  }

  if (instanceName === DEFAULT_INSTANCE_NAME) {
    return false;
  }

  if (!isUserInstanceName(instanceName)) {
    return false;
  }

  const token = tokenFromRequest(request);
  if (!token) return false;
  const userId = await verifySupabaseAccessToken(env, token);
  return userId === instanceName;
}
