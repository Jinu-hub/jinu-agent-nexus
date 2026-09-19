// ─────────────────────────────────────────────────────────────────────────
// ToolsPanel — every tool the LLM currently has access to
// ─────────────────────────────────────────────────────────────────────────
//
// Tools come from five sources:
//   • custom    — defined in worker/chat-agent.ts getTools()
//   • workspace — built-in Think filesystem tools
//   • session   — set_context / load_context / unload_context
//   • extension — runtime-authored via `load_extension`
//   • mcp       — pulled in from a connected MCP server
//
// The panel groups by source so you can see at a glance what's
// available and where each tool came from.
// ─────────────────────────────────────────────────────────────────────────

import { Wrench } from "lucide-react";
import type { ToolView } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/ui-lang";
import type { MessageKey } from "@/i18n/messages";

const GROUP_LABEL_KEYS: Record<ToolView["source"], MessageKey> = {
  custom: "tools.custom",
  workspace: "tools.workspace",
  session: "tools.session",
  extension: "tools.extension",
  mcp: "tools.mcp",
};

export function ToolsPanel({ tools }: { tools: ToolView[] }) {
  const t = useT();
  const grouped = tools.reduce<Record<ToolView["source"], ToolView[]>>(
    (acc, t) => {
      (acc[t.source] ??= []).push(t);
      return acc;
    },
    {} as Record<ToolView["source"], ToolView[]>,
  );

  const sources: ToolView["source"][] = [
    "custom",
    "workspace",
    "session",
    "extension",
    "mcp",
  ];

  return (
    <section>
      <PanelHeader
        icon={Wrench}
        title={t("panels.tools")}
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {tools.length}
          </span>
        }
      />
      <div className="space-y-4">
        {sources.map((src) => {
          const items = grouped[src];
          if (!items || items.length === 0) return null;
          return (
            <div key={src}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(GROUP_LABEL_KEYS[src])}
              </p>
              <div className="space-y-1">
                {items.map((t) => (
                  <div
                    key={`${src}:${t.name}`}
                    className="paper-inset px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-medium">{t.name}</code>
                      <Badge variant="muted" className="ml-auto">
                        {src}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="mt-1 text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
