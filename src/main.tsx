import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import LiveMarketRoom from "./live/LiveMarketRoom";
import ReportSurface from "./reports/ReportSurface";
import { LIVE_ROOM_PATH } from "./lib/live-room";
import { matchReportPage } from "./lib/report-pages";

// Minimal path switch instead of a router dependency: `/live` is its own
// surface (poll room, no chat), `/<report-series-slug>` is a full-frame
// reading page, everything else is the agent shell. The SPA fallback in
// wrangler.jsonc serves index.html for all of them.
const { pathname } = window.location;
const isLiveRoom =
  pathname === LIVE_ROOM_PATH || pathname.startsWith(`${LIVE_ROOM_PATH}/`);
const reportPage = matchReportPage(pathname);

// We do NOT wrap App in <StrictMode>.
//
// StrictMode double-mounts components in dev to surface effect cleanup
// bugs. That's normally a good thing, but `useAgentChat` (from
// `@cloudflare/ai-chat/react`) sets up WebSocket subscriptions that
// re-fire on every mount cycle — under StrictMode the second mount
// subscribes a second time before the first cleanup completes, and
// every assistant message gets processed twice. You end up with
// duplicate responses on every send.
//
// Workaround: skip StrictMode. The trade-off is we lose StrictMode's
// dev-time invariant checks, but the chat hook becomes reliable in
// dev. If a future version of @cloudflare/ai-chat fixes the
// double-subscription, re-add <StrictMode>.
createRoot(document.getElementById("root")!).render(
  isLiveRoom ? (
    <LiveMarketRoom />
  ) : reportPage ? (
    <ReportSurface page={reportPage} />
  ) : (
    <App />
  ),
);
