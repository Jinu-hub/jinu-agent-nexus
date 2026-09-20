// ChatAgent WebSocket query — Phase 5 auth token for user instances.

import { useCallback } from "react";

import { useAuth } from "@/lib/auth";

/**
 * `useAgent({ query, queryDeps })` params for ChatAgent.
 * Guests: no token. Signed-in: Supabase access_token as `?token=`.
 */
export function useChatAgentAuthQuery(): {
  query: () => Promise<Record<string, string>>;
  queryDeps: unknown[];
} {
  const { accessToken, instanceName } = useAuth();

  const query = useCallback(async () => {
    if (instanceName.startsWith("guest_")) return {};
    if (accessToken) return { token: accessToken };
    return {};
  }, [accessToken, instanceName]);

  return { query, queryDeps: [accessToken, instanceName] };
}
