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
import { useT } from "@/i18n/ui-lang";

export function BrowserPanel({
  liveViewUrl,
  onClose,
}: {
  liveViewUrl: string | null;
  onClose: () => Promise<void> | void;
}) {
  const t = useT();
  return (
    <section className="flex h-full flex-col">
      <PanelHeader
        icon={Globe}
        title={t("panels.browser")}
        trailing={
          liveViewUrl && (
            <Button size="sm" variant="outline" onClick={() => void onClose()}>
              {t("browser.close")}
            </Button>
          )
        }
      />
      {liveViewUrl ? (
        <div className="paper-inset h-[70vh] w-full overflow-hidden">
          <iframe
            src={liveViewUrl}
            title={t("browser.iframe")}
            className="h-full w-full border-0"
            // sandbox kept loose so the DevTools page can run scripts.
            // Live View is a Cloudflare-hosted URL — same trust level
            // as the wrangler dashboard.
            allow="clipboard-read; clipboard-write"
          />
        </div>
      ) : (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          {t("browser.empty")}
        </p>
      )}
    </section>
  );
}
