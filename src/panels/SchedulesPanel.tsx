// ─────────────────────────────────────────────────────────────────────────
// SchedulesPanel — pending scheduled callbacks
// ─────────────────────────────────────────────────────────────────────────
//
// `agent.schedule(seconds, callbackName, payload)` and friends register
// Durable Object alarms. They survive evictions, restarts, even your
// laptop closing for hours. This panel shows what's queued and lets
// you cancel individual entries (X button) or all at once (trash icon).
// ─────────────────────────────────────────────────────────────────────────

import { Clock, X } from "lucide-react";
import type { ScheduleView } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";
import { Badge } from "@/components/ui/badge";

export function SchedulesPanel({
  schedules,
  onCancel,
  onClear,
}: {
  schedules: ScheduleView[];
  onCancel: (id: string) => Promise<void> | void;
  onClear?: () => void | Promise<void>;
}) {
  return (
    <section>
      <PanelHeader
        icon={Clock}
        title="Schedules"
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {schedules.length}
          </span>
        }
        onClear={onClear}
        clearLabel="Cancel all"
      />
      {schedules.length === 0 ? (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Nothing scheduled. Try "remind me to stretch in 30 seconds".
        </p>
      ) : (
        <ul className="space-y-1.5">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="paper-inset flex items-start gap-2 px-2.5 py-1.5 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono font-medium">{s.callback}</code>
                  <Badge variant="muted">{s.type}</Badge>
                </div>
                <p className="mt-0.5 text-muted-foreground">{s.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => void onCancel(s.id)}
                title="Cancel"
                className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
