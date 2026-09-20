// Fetch helper that attaches the Supabase access token when present.

import { getSupabaseBrowserClient } from "./supabase-browser";

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  try {
    const supabase = await getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* guest path */
  }
  return fetch(input, { ...init, headers });
}
