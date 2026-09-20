// ─────────────────────────────────────────────────────────────────────────
// Shared Durable Object instance identity
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 1 (pre-auth): each browser gets a stable guest id in localStorage
// and a same-origin cookie so Worker HTTP (/settings, /memory, upload) hits
// the same ChatAgent + MyMemory instance as useAgent({ name }).
//
// When authentication lands, pass the verified user id into
// getInstanceName() / replace getOrCreateClientInstanceName().
//
// `default` remains the system instance for cron ingest settings and shared
// topic-label bootstrap writes — not the normal interactive user path.
//
// This module contains no secrets and is safe to import from the client.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_INSTANCE_NAME = "default";

/** Cookie + header — Worker resolves the interactive instance from the request. */
export const INSTANCE_COOKIE = "lyra_instance";
export const INSTANCE_HEADER = "x-lyra-instance";

const CLIENT_STORAGE_KEY = "lyra_instance_name";

/** Durable Object name: letters, digits, _ and - only (max 64). */
export function isValidInstanceName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(name);
}

export function getInstanceName(userId?: string): string {
  const n = userId?.trim();
  if (n && isValidInstanceName(n)) return n;
  return DEFAULT_INSTANCE_NAME;
}

/**
 * Interactive instance for this request (header → cookie → default).
 * Cron / system callers that omit both stay on DEFAULT_INSTANCE_NAME.
 */
export function resolveInstanceNameFromRequest(request: Request): string {
  const header = request.headers.get(INSTANCE_HEADER)?.trim();
  if (header && isValidInstanceName(header)) return header;

  const cookie = request.headers.get("Cookie") ?? "";
  const re = new RegExp(
    `(?:^|;\\s*)${INSTANCE_COOKIE}=([^;]*)`,
  );
  const match = cookie.match(re);
  if (match?.[1]) {
    try {
      const value = decodeURIComponent(match[1].trim());
      if (isValidInstanceName(value)) return value;
    } catch {
      // ignore malformed cookie
    }
  }

  return DEFAULT_INSTANCE_NAME;
}

function syncInstanceCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${INSTANCE_COOKIE}=${encodeURIComponent(name)}; path=/; SameSite=Lax; Max-Age=31536000`;
}

/**
 * Stable per-browser guest id for useAgent + cookie-backed HTTP.
 * Call once at app boot (main.tsx) before any /settings or /memory fetch.
 *
 * Recovery of legacy solo data: set localStorage
 * `lyra_instance_name` = `default` and reload.
 */
export function getOrCreateClientInstanceName(): string {
  if (typeof window === "undefined") return DEFAULT_INSTANCE_NAME;

  let name = localStorage.getItem(CLIENT_STORAGE_KEY)?.trim() ?? "";
  if (!isValidInstanceName(name)) {
    name = `guest_${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(CLIENT_STORAGE_KEY, name);
  }
  syncInstanceCookie(name);
  return name;
}
