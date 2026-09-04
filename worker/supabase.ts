// ─────────────────────────────────────────────────────────────────────────
// Supabase client — Market Memory (shared market data) access from Workers
// ─────────────────────────────────────────────────────────────────────────
//
// Product role:
//   Supabase  = Market Memory (reports, tags, entities, briefings)
//   Cloudflare = My Market Memory (personal preferences, live rooms)
//
// Shared client factory + health probe. Product table queries live in
// worker/content-audio.ts, worker/content-briefs.ts (and later Voice /
// Market Memory modules). This file stays the single place to build a
// client and verify secrets + network.
//
// Keys NEVER ship to the browser. Prefer SUPABASE_ANON_KEY for
// RLS-aware reads; use SUPABASE_SERVICE_ROLE_KEY only for trusted
// server-side jobs that must bypass RLS.
// ─────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseSecrets = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type SupabaseAccessMode = "anon" | "service_role";

export type CreateSupabaseOptions = {
  /**
   * When true, use the service role key (bypasses RLS).
   * Default: false — uses the anon / publishable key.
   */
  privileged?: boolean;
};

function resolveSecret(value: string | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  // dotenv / .dev.vars sometimes keep surrounding quotes in the binding.
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v || null;
}

/** True when URL + at least one usable key are present. */
export function isSupabaseConfigured(env: SupabaseSecrets): boolean {
  return Boolean(resolveSecret(env.SUPABASE_URL) && resolveKey(env, false));
}

/**
 * Build a Supabase JS client bound to this Worker's secrets.
 * Throws if required secrets are missing — call `isSupabaseConfigured`
 * first when the feature is optional.
 */
export function createSupabaseClient(
  env: SupabaseSecrets,
  options: CreateSupabaseOptions = {},
): SupabaseClient {
  const url = resolveSecret(env.SUPABASE_URL);
  if (!url) {
    throw new Error("SUPABASE_URL is not configured");
  }

  const privileged = options.privileged === true;
  const key = resolveKey(env, privileged);
  if (!key) {
    throw new Error(
      privileged
        ? "SUPABASE_SERVICE_ROLE_KEY is not configured"
        : "SUPABASE_ANON_KEY is not configured",
    );
  }

  return createClient(url, key, {
    auth: {
      // Workers have no persistent browser session storage.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseAccessMode(
  env: SupabaseSecrets,
  options: CreateSupabaseOptions = {},
): SupabaseAccessMode | null {
  if (!resolveSecret(env.SUPABASE_URL)) return null;
  if (options.privileged) {
    return resolveSecret(env.SUPABASE_SERVICE_ROLE_KEY) ? "service_role" : null;
  }
  return resolveKey(env, false) ? "anon" : null;
}

/**
 * HTTP routes for Supabase prep:
 *   GET /api/supabase/health — secrets + REST reachability check
 */
export async function handleSupabaseRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/supabase/health") return null;
  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  if (!isSupabaseConfigured(env)) {
    return Response.json(
      {
        ok: false,
        configured: false,
        message:
          "Set SUPABASE_URL and SUPABASE_ANON_KEY in .dev.vars (local) or via wrangler secret put (production).",
      },
      { status: 503 },
    );
  }

  const baseUrl = resolveSecret(env.SUPABASE_URL)!;
  const projectHost = safeHost(baseUrl);
  const urlRef = projectHost?.split(".")[0] ?? null;

  // Prefer anon for the probe; if it 401s, try service_role so we can tell
  // whether the project is reachable at all vs only the anon key is bad.
  const probes: Array<{ mode: SupabaseAccessMode; key: string }> = [];
  const anon = resolveSecret(env.SUPABASE_ANON_KEY);
  const service = resolveSecret(env.SUPABASE_SERVICE_ROLE_KEY);
  if (anon) probes.push({ mode: "anon", key: anon });
  if (service) probes.push({ mode: "service_role", key: service });

  const attempts: Array<{
    mode: SupabaseAccessMode;
    status: number;
    jwtRole: string | null;
    jwtRef: string | null;
    urlMatch: boolean | null;
  }> = [];

  try {
    for (const probe of probes) {
      const claims = decodeJwtClaims(probe.key);
      const rest = await fetch(new URL("/rest/v1/", baseUrl), {
        method: "GET",
        headers: {
          apikey: probe.key,
          Authorization: `Bearer ${probe.key}`,
          Accept: "application/json",
        },
      });
      attempts.push({
        mode: probe.mode,
        status: rest.status,
        jwtRole: claims?.role ?? null,
        jwtRef: claims?.ref ?? null,
        urlMatch:
          claims?.ref && urlRef ? claims.ref === urlRef : claims?.ref == null ? null : false,
      });
      if (rest.ok) {
        return Response.json({
          ok: true,
          configured: true,
          mode: probe.mode,
          projectHost,
          message: "Supabase reachable from Worker",
        });
      }
    }

    const hint = hintForUnauthorized(attempts);
    return Response.json(
      {
        ok: false,
        configured: true,
        projectHost,
        attempts,
        message: hint,
      },
      { status: 502 },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        configured: true,
        projectHost,
        message: error instanceof Error ? error.message : "fetch failed",
      },
      { status: 502 },
    );
  }
}

function resolveKey(env: SupabaseSecrets, privileged: boolean): string | null {
  if (privileged) {
    return resolveSecret(env.SUPABASE_SERVICE_ROLE_KEY);
  }
  // Prefer anon; fall back to service role so local smoke tests can run
  // with a single key while still defaulting to least privilege.
  return (
    resolveSecret(env.SUPABASE_ANON_KEY) ||
    resolveSecret(env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

function safeHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host;
  } catch {
    return null;
  }
}

/** Decode JWT payload claims without verifying the signature. */
function decodeJwtClaims(
  token: string,
): { role?: string; ref?: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (padded.length % 4)) % 4);
    const json = atob(padded + pad);
    return JSON.parse(json) as { role?: string; ref?: string };
  } catch {
    return null;
  }
}

function hintForUnauthorized(
  attempts: Array<{ mode: SupabaseAccessMode; status: number; urlMatch: boolean | null }>,
): string {
  if (attempts.some((a) => a.urlMatch === false)) {
    return "JWT ref does not match SUPABASE_URL project. Re-copy keys from the same Supabase project.";
  }
  if (attempts.every((a) => a.status === 401)) {
    return "Supabase rejected the API key (401). Restart `npm run dev` after editing .dev.vars, then re-copy anon + service_role from Dashboard → Project Settings → API (no quotes).";
  }
  return `Supabase REST probe failed (statuses: ${attempts
    .map((a) => `${a.mode}=${a.status}`)
    .join(", ")})`;
}
