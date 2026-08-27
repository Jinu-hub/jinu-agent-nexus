// ─────────────────────────────────────────────────────────────────────────
// Shared Durable Object instance identity
// ─────────────────────────────────────────────────────────────────────────
//
// Single-user MVP uses one shared instance. When authentication is added,
// replace the value passed to getInstanceName() with the verified user id.
// This module contains no secrets and is safe to import from the client.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_INSTANCE_NAME = "default";

export function getInstanceName(userId?: string): string {
  return userId ?? DEFAULT_INSTANCE_NAME;
}
