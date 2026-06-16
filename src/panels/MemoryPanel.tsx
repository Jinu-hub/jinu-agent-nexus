// ─────────────────────────────────────────────────────────────────────────
// MemoryPanel — durable facts about the user
// ─────────────────────────────────────────────────────────────────────────
//
// `memory` is a writable session context block (see configureSession
// in worker/chat-agent.ts). The model has access to a `set_context`
// tool that writes here. Anything saved survives across chat sessions,
// browser refreshes, and DO restarts — it lives in the agent's SQLite.
//
// Cleared via the clear button (calls @callable clearMemory()).
// ─────────────────────────────────────────────────────────────────────────

import { Brain } from "lucide-react";
import type { MemoryView } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";

export function MemoryPanel({
  memory,
  onClear,
}: {
  memory: MemoryView;
  onClear?: () => void | Promise<void>;
}) {
  const pct = memory.maxTokens
    ? Math.min(100, (memory.tokens / memory.maxTokens) * 100)
    : 0;

  return (
    <section>
      <PanelHeader
        icon={Brain}
        title="Memory"
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {memory.tokens.toLocaleString()}
            <span className="text-muted-foreground/60"> / </span>
            {memory.maxTokens ? memory.maxTokens.toLocaleString() : "∞"}
          </span>
        }
        onClear={onClear}
        clearLabel="Clear memory"
      />
      <div className="relative mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {memory.content ? (
        <pre className="paper-inset max-h-[70vh] overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">
          {memory.content}
        </pre>
      ) : (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Tell the agent something to remember.
        </p>
      )}
    </section>
  );
}
