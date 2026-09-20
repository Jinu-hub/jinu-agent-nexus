// ─────────────────────────────────────────────────────────────────────────
// Auth helpers — Supabase JWT → trusted ChatAgent / MyMemory instance
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 2: logged-in users bind to `auth.users.id` (UUID). Guests keep
// `guest_*`. Unauthenticated claims of a user UUID are rejected (anti-spoof).
// Shared topic_labels stay on `"default"` (memory-routes labelsStub).
// ─────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_INSTANCE_NAME,
  isValidInstanceName,
  resolveInstanceNameFromRequest,
} from "../src/lib/agent-identity";
import { createSupabaseClient, getSupabaseBrowserConfig, isSupabaseConfigured } from "./supabase";

export type TrustedInstance =
  | { ok: true; name: string; userId: string | null }
  | { ok: false; error: string; status: number };

export function isGuestInstanceName(name: string): boolean {
  return name.startsWith("guest_");
}

/** Supabase user ids are UUIDs; also allow future opaque ids. */
export function isUserInstanceName(name: string): boolean {
  if (!isValidInstanceName(name)) return false;
  if (name === DEFAULT_INSTANCE_NAME || isGuestInstanceName(name)) return false;
  return true;
}

export function bearerAccessToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(header);
  return m?.[1] ?? null;
}

/**
 * Verify Supabase access token via Auth API (`getUser(jwt)`).
 * Returns the user id when valid.
 */
export async function verifySupabaseAccessToken(
  env: Env,
  accessToken: string,
): Promise<string | null> {
  if (!isSupabaseConfigured(env)) return null;
  const token = accessToken.trim();
  if (!token) return null;
  try {
    const supabase = createSupabaseClient(env);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) return null;
    const id = data.user.id.trim();
    return isValidInstanceName(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the Durable Object instance for interactive HTTP.
 * Prefer verified JWT user id; otherwise allow guest_* cookie/header only.
 */
export async function resolveTrustedInstanceName(
  request: Request,
  env: Env,
): Promise<TrustedInstance> {
  const token = bearerAccessToken(request);
  if (token) {
    const userId = await verifySupabaseAccessToken(env, token);
    if (userId) {
      return { ok: true, name: userId, userId };
    }
    return { ok: false, error: "invalid or expired session", status: 401 };
  }

  const claimed = resolveInstanceNameFromRequest(request);
  if (isGuestInstanceName(claimed) && isValidInstanceName(claimed)) {
    return { ok: true, name: claimed, userId: null };
  }
  if (claimed === DEFAULT_INSTANCE_NAME) {
    return { ok: true, name: DEFAULT_INSTANCE_NAME, userId: null };
  }
  // Cookie/header looks like a user id but no Bearer — do not honor.
  if (isUserInstanceName(claimed)) {
    return {
      ok: false,
      error: "authentication required",
      status: 401,
    };
  }
  return { ok: true, name: DEFAULT_INSTANCE_NAME, userId: null };
}

/**
 * Public Auth config for the browser (anon key is designed to be public).
 *   GET /api/auth/config
 */
export async function handleAuthRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/config") return null;
  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const config = getSupabaseBrowserConfig(env);
  if (!config) {
    return Response.json(
      {
        ok: false,
        configured: false,
        message:
          "Set SUPABASE_URL and SUPABASE_ANON_KEY for Auth (anon key is required in the browser; service_role is never exposed).",
      },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    url: config.url,
    anonKey: config.anonKey,
  });
}
