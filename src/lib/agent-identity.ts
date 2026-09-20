// ─────────────────────────────────────────────────────────────────────────
// Shared Durable Object instance identity
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 1: each browser gets a stable guest id (localStorage + cookie).
// Phase 2: when Supabase Auth session exists, bind to user.id instead;
//          guest id is kept so logout returns to the same anonymous DO.
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

/** Active instance (guest or user id) — kept for boot before Auth resolves. */
const CLIENT_STORAGE_KEY = "lyra_instance_name";
/** Stable anonymous id for this browser (survives login/logout). */
const GUEST_STORAGE_KEY = "lyra_guest_instance";

/** Durable Object name: letters, digits, _ and - only (max 64). */
export function isValidInstanceName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(name);
}

export function isGuestInstanceName(name: string): boolean {
  return name.startsWith("guest_");
}

export function getInstanceName(userId?: string): string {
  const n = userId?.trim();
  if (n && isValidInstanceName(n)) return n;
  return DEFAULT_INSTANCE_NAME;
}

/**
 * Interactive instance for this request (header → cookie → default).
 * Cron / system callers that omit both stay on DEFAULT_INSTANCE_NAME.
 * Prefer `resolveTrustedInstanceName` (worker/auth.ts) for personal routes.
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
  const doc = (globalThis as { document?: { cookie: string } }).document;
  if (!doc) return;
  doc.cookie = `${INSTANCE_COOKIE}=${encodeURIComponent(name)}; path=/; SameSite=Lax; Max-Age=31536000`;
}

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function browserLocalStorage(): BrowserStorage | null {
  const w = globalThis as { window?: { localStorage?: BrowserStorage } };
  return w.window?.localStorage ?? null;
}

/**
 * Stable per-browser guest id. Does not switch on login — AuthProvider
 * calls `bindClientInstanceName(user.id)` for the active cookie.
 */
export function getOrCreateGuestInstanceName(): string {
  const storage = browserLocalStorage();
  if (!storage) return DEFAULT_INSTANCE_NAME;

  let name = storage.getItem(GUEST_STORAGE_KEY)?.trim() ?? "";
  if (!isValidInstanceName(name) || !isGuestInstanceName(name)) {
    const legacy = storage.getItem(CLIENT_STORAGE_KEY)?.trim() ?? "";
    if (isValidInstanceName(legacy) && isGuestInstanceName(legacy)) {
      name = legacy;
    } else {
      name = `guest_${crypto.randomUUID().replace(/-/g, "")}`;
    }
    storage.setItem(GUEST_STORAGE_KEY, name);
  }
  return name;
}

/** Write active instance to localStorage + cookie (guest or user id). */
export function bindClientInstanceName(name: string): string {
  const storage = browserLocalStorage();
  if (!storage) return name;
  if (!isValidInstanceName(name)) {
    throw new Error(`invalid instance name: ${name}`);
  }
  storage.setItem(CLIENT_STORAGE_KEY, name);
  syncInstanceCookie(name);
  return name;
}

/**
 * Boot helper: ensure guest exists and cookie matches last active name
 * (or guest). AuthProvider may replace with user.id shortly after.
 *
 * Recovery of legacy solo data: set localStorage
 * `lyra_instance_name` = `default` and reload.
 */
export function getOrCreateClientInstanceName(): string {
  const storage = browserLocalStorage();
  if (!storage) return DEFAULT_INSTANCE_NAME;

  const guest = getOrCreateGuestInstanceName();
  const active = storage.getItem(CLIENT_STORAGE_KEY)?.trim() ?? "";
  if (isValidInstanceName(active)) {
    syncInstanceCookie(active);
    return active;
  }
  return bindClientInstanceName(guest);
}
