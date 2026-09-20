import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import "./index.css";
import App from "./App";
import LiveMarketRoom from "./live/LiveMarketRoom";
import ReportSurface from "./reports/ReportSurface";
import { LIVE_ROOM_PATH } from "./lib/live-room";
import { matchReportPage } from "./lib/report-pages";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider, useAuth } from "./lib/auth";
import { getOrCreateGuestInstanceName } from "./lib/agent-identity";

// Ensure a stable guest id exists; AuthProvider binds active cookie (guest or user).
getOrCreateGuestInstanceName();

const { pathname } = window.location;
const isLiveRoom =
  pathname === LIVE_ROOM_PATH || pathname.startsWith(`${LIVE_ROOM_PATH}/`);
const reportPage = matchReportPage(pathname);

function BootShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        …
      </div>
    );
  }
  return children;
}

// We do NOT wrap App in <StrictMode>.
//
// StrictMode double-mounts components in dev to surface effect cleanup
// bugs. That's normally a good thing, but `useAgentChat` (from
// `@cloudflare/ai-chat/react`) sets up WebSocket subscriptions that
// re-fire on every mount cycle — under StrictMode the second mount
// subscribes a second time before the first cleanup completes, and
// every assistant message gets processed twice. You end up with
// duplicate responses on every send.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <BootShell>
        {isLiveRoom ? (
          <LiveMarketRoom />
        ) : reportPage ? (
          <ReportSurface page={reportPage} />
        ) : (
          <App />
        )}
      </BootShell>
    </AuthProvider>
  </ThemeProvider>,
);
