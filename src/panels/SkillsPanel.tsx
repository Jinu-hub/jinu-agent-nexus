// ─────────────────────────────────────────────────────────────────────────
// SkillsPanel — markdown documents the agent can load on demand
// ─────────────────────────────────────────────────────────────────────────
//
// Skills are markdown files stored in R2 under `skills/`. The agent's
// `R2SkillProvider` exposes a directory listing to the model as part
// of its system prompt, and provides `load_context` / `unload_context`
// tools so the model can pull a doc into context only when relevant.
//
// To add a skill: drop a .md file into `skills/` and run
//   `npm run seed:skills:local`     (for dev)
//   `npm run seed:skills:remote`    (for production)
// Or upload directly via the Cloudflare R2 dashboard.
// ─────────────────────────────────────────────────────────────────────────

import { BookOpen } from "lucide-react";
import type { SkillsView } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";
import { Badge } from "@/components/ui/badge";

export function SkillsPanel({ skills }: { skills: SkillsView }) {
  return (
    <section>
      <PanelHeader
        icon={BookOpen}
        title="Skills"
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {skills.loaded.length} loaded
          </span>
        }
      />
      {skills.listing ? (
        <pre className="paper-inset mb-3 max-h-40 overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-relaxed">
          {skills.listing}
        </pre>
      ) : (
        <p className="panel-empty mb-3 px-3 py-4 text-center text-xs italic">
          No skills indexed. Drop a markdown file into{" "}
          <code className="font-mono">skills/</code> and run{" "}
          <code className="font-mono">npm run seed:skills:local</code>.
        </p>
      )}
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Currently loaded
        </p>
        {skills.loaded.length === 0 ? (
          <p className="text-xs text-muted-foreground/80">
            None — the model will <code>load_context</code> when needed.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {skills.loaded.map((name) => (
              <Badge key={name} variant="secondary" className="font-mono">
                {name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
