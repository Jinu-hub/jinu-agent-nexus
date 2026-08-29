// ─────────────────────────────────────────────────────────────────────────
// Live Market Room — shared constants
// ─────────────────────────────────────────────────────────────────────────
//
// Imported by both the worker and the React client, so it must stay free
// of secrets and of any Cloudflare / DOM specific code. The room token
// itself is NOT here — the client reads it from `?token=` and the worker
// reads it from the LIVE_ROOM_TOKEN secret.
// ─────────────────────────────────────────────────────────────────────────

/** Agent class name, as used by `useAgent({ agent })`. */
export const LIVE_ROOM_AGENT = "LiveMarketRoomAgent";

/** Single shared room for the MVP. Per-day rooms → use the date here. */
export const LIVE_ROOM_NAME = "market-pulse";

/** Client-side path that renders the room (SPA fallback serves it). */
export const LIVE_ROOM_PATH = "/live";

/** How long a freshly opened (or reset) poll stays open. */
export const POLL_DURATION_SECONDS = 10 * 60;

/** WebSocket close code used when the room token is missing or wrong. */
export const UNAUTHORIZED_CLOSE_CODE = 4401;
