// ─────────────────────────────────────────────────────────────────────────
// ExtensionsPanel — runtime-authored tools
// ─────────────────────────────────────────────────────────────────────────
//
// Think's `createExtensionTools` exposes `load_extension` and
// `list_extensions` to the model. When the user asks for a capability
// the agent doesn't have ("make me a tool that converts EUR to USD"),
// the model can author the JS source and load it via load_extension.
// The new tool is callable on the very next turn.
//
// Extensions run in a network-isolated sandbox (worker_loaders, see
// wrangler.jsonc). No fetch, no I/O — pure computation only.
//
// The unload button calls `@callable unloadExtension` to remove a
// loaded module from memory AND from DO storage.
// ─────────────────────────────────────────────────────────────────────────

import { Puzzle, X } from "lucide-react";
import type { ExtensionView } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";
import { Badge } from "@/components/ui/badge";

export function ExtensionsPanel({
  extensions,
  onUnload,
}: {
  extensions: ExtensionView[];
  onUnload: (name: string) => Promise<void> | void;
}) {
  return (
    <section>
      <PanelHeader
        icon={Puzzle}
        title="Extensions"
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {extensions.length}
          </span>
        }
      />
      {extensions.length === 0 ? (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Ask the agent for a tool it doesn't have — it can write one for
          itself.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {extensions.map((ext) => (
            <li
              key={ext.name}
              className="paper-inset flex items-start gap-2 px-2.5 py-2 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono font-medium">{ext.name}</code>
                  <Badge variant="muted">v{ext.version}</Badge>
                </div>
                {ext.description && (
                  <p className="mt-1 text-muted-foreground">
                    {ext.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {ext.tools.map((tn) => (
                    <code
                      key={tn}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {tn}
                    </code>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onUnload(ext.name)}
                title="Unload"
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
