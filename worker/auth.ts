// ─────────────────────────────────────────────────────────────────────────
// Auth helpers — Supabase JWT → trusted ChatAgent / MyMemory instance
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 2: logged-in users bind to `auth.users.id` (UUID). Guests keep
// `guest_*`. Unauthenticated claims of a user UUID are rejected (anti-spoof).
// Shared topic_labels stay on `"default"` (memory-routes labelsStub).
//
// Phase 3: admin is an env allowlist (ADMIN_USER_IDS / ADMIN_EMAILS), not
// the `"default"` instance. Admins still use their userId DO for personal data.
// ─────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_INSTANCE_NAME,
  isValidInstanceName,
  resolveInstanceNameFromRequest,
} from "../src/lib/agent-identity";
import { createSupabaseClient, getSupabaseBrowserConfig, isSupabaseConfigured } from "./supabase";
import {
  getGlobalHiddenPanels,
  setGlobalHiddenPanels,
} from "./panel-defaults";

export type VerifiedUser = { id: string; email: string | null };

export type TrustedInstance =
  | { ok: true; name: string; userId: string | null; isAdmin: boolean }
  | { ok: false; error: string; status: number };

export type RequireAdminResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: Response };

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

/** Comma-separated allowlist → trimmed lowercased set (empty entries dropped). */
export function parseAdminAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if (v) out.add(v);
  }
  return out;
}

/**
 * Phase 3 admin gate — env allowlist only (not `"default"` instance).
 * Match by user id (case-insensitive) or email (case-insensitive).
 */
export function isAdminUser(
  env: Env,
  user: { id: string; email?: string | null },
): boolean {
  const ids = parseAdminAllowlist(env.ADMIN_USER_IDS);
  if (ids.has(user.id.trim().toLowerCase())) return true;
  const email = user.email?.trim().toLowerCase();
  if (email) {
    const emails = parseAdminAllowlist(env.ADMIN_EMAILS);
    if (emails.has(email)) return true;
  }
  return false;
}

/**
 * Verify Supabase access token via Auth API (`getUser(jwt)`).
 * Returns id + email when valid.
 */
export async function verifySupabaseUser(
  env: Env,
  accessToken: string,
): Promise<VerifiedUser | null> {
  if (!isSupabaseConfigured(env)) return null;
  const token = accessToken.trim();
  if (!token) return null;
  try {
    const supabase = createSupabaseClient(env);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) return null;
    const id = data.user.id.trim();
    if (!isValidInstanceName(id)) return null;
    const email = data.user.email?.trim() || null;
    return { id, email };
  } catch {
    return null;
  }
}

/** @deprecated Prefer verifySupabaseUser — kept for id-only call sites. */
export async function verifySupabaseAccessToken(
  env: Env,
  accessToken: string,
): Promise<string | null> {
  const user = await verifySupabaseUser(env, accessToken);
  return user?.id ?? null;
}

/**
 * Resolve the Durable Object instance for interactive HTTP.
 * Prefer verified JWT user id; otherwise allow guest_* cookie/header only.
 * Admin flag never switches the instance to `"default"`.
 */
export async function resolveTrustedInstanceName(
  request: Request,
  env: Env,
): Promise<TrustedInstance> {
  const token = bearerAccessToken(request);
  if (token) {
    const user = await verifySupabaseUser(env, token);
    if (user) {
      return {
        ok: true,
        name: user.id,
        userId: user.id,
        isAdmin: isAdminUser(env, user),
      };
    }
    return { ok: false, error: "invalid or expired session", status: 401 };
  }

  const claimed = resolveInstanceNameFromRequest(request);
  if (isGuestInstanceName(claimed) && isValidInstanceName(claimed)) {
    return { ok: true, name: claimed, userId: null, isAdmin: false };
  }
  if (claimed === DEFAULT_INSTANCE_NAME) {
    return { ok: true, name: DEFAULT_INSTANCE_NAME, userId: null, isAdmin: false };
  }
  // Cookie/header looks like a user id but no Bearer — do not honor.
  if (isUserInstanceName(claimed)) {
    return {
      ok: false,
      error: "authentication required",
      status: 401,
    };
  }
  return { ok: true, name: DEFAULT_INSTANCE_NAME, userId: null, isAdmin: false };
}

/** Bearer + allowlist. Use before any `/api/admin/*` handler. */
export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<RequireAdminResult> {
  const token = bearerAccessToken(request);
  if (!token) {
    return {
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 }),
    };
  }
  const user = await verifySupabaseUser(env, token);
  if (!user) {
    return {
      ok: false,
      response: Response.json(
        { error: "invalid or expired session" },
        { status: 401 },
      ),
    };
  }
  if (!isAdminUser(env, user)) {
    return {
      ok: false,
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, email: user.email };
}

/**
 * Auth HTTP:
 *   GET /api/auth/config — public anon key
 *   GET /api/auth/me     — Bearer → { userId, email, isAdmin }
 */
export async function handleAuthRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/auth/config") {
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

  if (path === "/api/auth/me") {
    if (request.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const token = bearerAccessToken(request);
    if (!token) {
      return Response.json({ error: "authentication required" }, { status: 401 });
    }
    const user = await verifySupabaseUser(env, token);
    if (!user) {
      return Response.json(
        { error: "invalid or expired session" },
        { status: 401 },
      );
    }
    return Response.json({
      ok: true,
      userId: user.id,
      email: user.email,
      isAdmin: isAdminUser(env, user),
    });
  }

  return null;
}

/**
 * Admin HTTP (Phase 3–4):
 *   GET  /api/admin/status         — requireAdmin → { ok, role: "admin" }
 *   GET  /api/admin/panel-defaults — requireAdmin → { ok, hidden_panels }
 *   PATCH /api/admin/panel-defaults — requireAdmin → update ChatAgent "default"
 */
export async function handleAdminRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin")) return null;

  if (url.pathname === "/api/admin/status") {
    if (request.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const gate = await requireAdmin(request, env);
    if (!gate.ok) return gate.response;
    return Response.json({ ok: true, role: "admin" });
  }

  if (url.pathname === "/api/admin/panel-defaults") {
    if (request.method === "GET") {
      const gate = await requireAdmin(request, env);
      if (!gate.ok) return gate.response;
      const hidden_panels = await getGlobalHiddenPanels(env);
      return Response.json({ ok: true, hidden_panels });
    }
    if (request.method === "PATCH") {
      const gate = await requireAdmin(request, env);
      if (!gate.ok) return gate.response;
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const raw =
        body &&
        typeof body === "object" &&
        "hidden_panels" in body
          ? (body as { hidden_panels: unknown }).hidden_panels
          : undefined;
      if (raw === undefined) {
        return Response.json(
          { error: "hidden_panels required" },
          { status: 400 },
        );
      }
      try {
        const hidden_panels = await setGlobalHiddenPanels(env, raw);
        return Response.json({ ok: true, hidden_panels });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "invalid request";
        return Response.json({ error: message }, { status: 400 });
      }
    }
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
