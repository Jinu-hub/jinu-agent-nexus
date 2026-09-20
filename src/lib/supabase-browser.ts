// ─────────────────────────────────────────────────────────────────────────
// Browser Supabase client — Auth (magic link / OAuth)
// ─────────────────────────────────────────────────────────────────────────
//
// Config comes from GET /api/auth/config (Worker secrets). Anon key is
// public-by-design; service_role never reaches the browser.
// ─────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AuthConfig = {
  url: string;
  anonKey: string;
};

let configPromise: Promise<AuthConfig | null> | null = null;
let client: SupabaseClient | null = null;

async function loadAuthConfig(): Promise<AuthConfig | null> {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const res = await fetch("/api/auth/config");
        if (!res.ok) return null;
        const json = (await res.json()) as {
          ok?: boolean;
          configured?: boolean;
          url?: string;
          anonKey?: string;
        };
        if (!json.ok || !json.configured || !json.url || !json.anonKey) {
          return null;
        }
        return { url: json.url, anonKey: json.anonKey };
      } catch {
        return null;
      }
    })();
  }
  return configPromise;
}

/** Shared browser client, or null when Auth is not configured. */
export async function getSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  if (client) return client;
  const config = await loadAuthConfig();
  if (!config) return null;
  client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}

export async function isBrowserAuthConfigured(): Promise<boolean> {
  return (await loadAuthConfig()) != null;
}
