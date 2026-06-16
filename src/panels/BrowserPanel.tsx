// ─────────────────────────────────────────────────────────────────────────
// BrowserPanel — Live View of the agent's Chrome tab
// ─────────────────────────────────────────────────────────────────────────
//
// When the model calls `navigate`, the agent launches a Cloudflare
// Browser Rendering session and broadcasts the DevTools Live View URL
// via `agent.broadcast({ type: "live_view", url })`. App.tsx
// subscribes to those broadcasts via `useAgent({ onMessage })` and
// passes the URL down here.
//
// The iframe shows what the agent sees — and clicks in the iframe
// affect the SAME tab the agent is driving. This is what makes the
// "human + agent share a browser" UX work.
//
// Live View only works against REAL Browser Rendering sessions on
// Cloudflare's edge, not local miniflare. That's why wrangler.jsonc
// has `browser: { binding: "BROWSER", remote: true }` — the
// `remote: true` ships browser calls to the edge even in dev.
// ─────────────────────────────────────────────────────────────────────────

import { Globe } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { Button } from "@/components/ui/button";

export function BrowserPanel({
  liveViewUrl,
  onClose,
}: {
  liveViewUrl: string | null;
  onClose: () => Promise<void> | void;
}) {
  return (
    <section className="flex h-full flex-col">
      <PanelHeader
        icon={Globe}
        title="Browser"
        trailing={
          liveViewUrl && (
            <Button size="sm" variant="outline" onClick={() => void onClose()}>
              Close browser
            </Button>
          )
        }
      />
      {liveViewUrl ? (
        <div className="paper-inset h-[70vh] w-full overflow-hidden">
          <iframe
            src={liveViewUrl}
            title="Agent browser"
            className="h-full w-full border-0"
            // sandbox kept loose so the DevTools page can run scripts.
            // Live View is a Cloudflare-hosted URL — same trust level
            // as the wrangler dashboard.
            allow="clipboard-read; clipboard-write"
          />
        </div>
      ) : (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Ask the agent to <code>navigate</code> somewhere — the live tab
          will appear here.
        </p>
      )}
    </section>
  );
}
