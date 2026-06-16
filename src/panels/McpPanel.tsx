// ─────────────────────────────────────────────────────────────────────────
// McpPanel — connect to external MCP servers
// ─────────────────────────────────────────────────────────────────────────
//
// `agent.addMcpServer(name, url)` connects to a remote MCP server.
// Think auto-merges that server's tools into the agent's toolset
// every turn — no extra wiring. The model can use them just like
// any other tool.
//
// Server / tool state is propagated to the frontend automatically
// via the agents SDK's `cf_agent_mcp_servers` protocol message —
// `useAgent({ onMcpUpdate })` subscribes to it. We pass the latest
// snapshot in here as `servers`.
//
// OAuth flow: if a server needs auth, `addMcpServer` returns an
// `authUrl` and the server state goes to `"authenticating"`. The
// user clicks the auth URL in a new tab; the SDK auto-reconnects
// once OAuth completes.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Plug, X, ExternalLink } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type McpServerView = {
  id: string;
  name: string;
  server_url: string;
  state: string;
  auth_url?: string | null;
};

export function McpPanel({
  servers,
  onConnect,
  onDisconnect,
  onClear,
}: {
  servers: McpServerView[];
  onConnect: (name: string, url: string) => Promise<void> | void;
  onDisconnect: (id: string) => Promise<void> | void;
  onClear?: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onConnect(name.trim(), url.trim());
      setName("");
      setUrl("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <PanelHeader
        icon={Plug}
        title="MCP Servers"
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {servers.length}
          </span>
        }
        onClear={onClear}
        clearLabel="Disconnect all"
      />

      <div className="paper-inset mb-3 space-y-2 p-2.5">
        <Input
          placeholder="Server name (e.g. 'github')"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <Input
          placeholder="https://example.com/mcp"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <Button
          size="sm"
          className="w-full"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !url.trim()}
        >
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {err && <p className="text-[11px] text-destructive">{err}</p>}
      </div>

      {servers.length === 0 ? (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          No servers connected. Add an MCP server URL above — its tools will
          merge into the agent's toolset automatically.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {servers.map((s) => (
            <li
              key={s.id}
              className="paper-inset flex items-start gap-2 px-2.5 py-2 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono font-medium">{s.name}</code>
                  <Badge
                    variant={s.state === "ready" ? "default" : "muted"}
                  >
                    {s.state}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {s.server_url}
                </p>
                {s.auth_url && (
                  <a
                    href={s.auth_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Authenticate
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => void onDisconnect(s.id)}
                title="Disconnect"
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
