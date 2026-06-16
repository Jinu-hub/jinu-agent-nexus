// ─────────────────────────────────────────────────────────────────────────
// FilesPanel — virtual workspace filesystem
// ─────────────────────────────────────────────────────────────────────────
//
// Every Think agent has a `this.workspace` — a virtual filesystem
// backed by the agent's SQLite. The model has read/write/edit/list/
// find/grep/delete tools out of the box. The user can see the result
// in this panel.
//
// Clicking a file calls `@callable readWorkspaceFile` and shows the
// content inline. Useful for inspecting LLM-authored notes, drafts,
// generated reports.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FolderTree, FileText } from "lucide-react";
import type { FileEntry } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";

export function FilesPanel({
  files,
  onRead,
  onClear,
}: {
  files: FileEntry[];
  onRead: (path: string) => Promise<string | null>;
  onClear?: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<{
    path: string;
    content: string | null;
  } | null>(null);

  const open = async (path: string) => {
    setSelected({ path, content: null });
    const content = await onRead(path);
    setSelected({ path, content });
  };

  return (
    <section>
      <PanelHeader
        icon={FolderTree}
        title="Files"
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {files.length}
          </span>
        }
        onClear={onClear}
        clearLabel="Clear workspace"
      />
      {files.length === 0 ? (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          The agent hasn't created any files yet. Ask it to save something.
        </p>
      ) : (
        <ul className="mb-3 space-y-0.5">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                onClick={() => void open(f.path)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono">{f.path}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {f.size}b
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="paper-inset overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[11px]">
            <span className="truncate font-mono font-medium">
              {selected.path}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              close
            </button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-relaxed">
            {selected.content ?? "loading…"}
          </pre>
        </div>
      )}
    </section>
  );
}
