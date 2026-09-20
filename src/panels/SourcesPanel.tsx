// ─────────────────────────────────────────────────────────────────────────
// SourcesPanel — RAG sources (PDFs)
// ─────────────────────────────────────────────────────────────────────────
//
// Drop a PDF on the dropzone (or pick via file picker) → POSTs to
// /api/upload → worker/index.ts → ChatAgent.uploadPdf(). The full
// chain: convert to markdown via env.AI.toMarkdown, paragraph-chunk,
// embed each chunk, upsert vectors to Vectorize, store raw text in
// SQLite. The model retrieves via the `recall` tool.
//
// Per-source delete → @callable deleteSource() removes from
// Vectorize + R2 + SQLite atomically.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import type { Source } from "../../worker/chat-agent";
import { PanelHeader } from "./PanelHeader";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { useT } from "@/i18n/ui-lang";

export function SourcesPanel({
  sources,
  onDelete,
  onClear,
}: {
  sources: Source[];
  onDelete: (source: string) => Promise<void> | void;
  onClear?: () => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const upload = async (file: File) => {
    setError(null);
    setUploading(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(null);
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) await upload(file);
  };

  return (
    <section>
      <PanelHeader
        icon={FileUp}
        title={t("panels.sources")}
        trailing={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {sources.length}
          </span>
        }
        onClear={onClear}
        clearLabel={t("sources.clear")}
      />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="panel-empty mb-3 flex flex-col items-center justify-center gap-2 px-4 py-6 text-center"
      >
        <FileUp className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {t("sources.dropPdf")}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
        >
          {uploading
            ? t("sources.ingesting", { name: uploading })
            : t("sources.chooseFile")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>

      {sources.length === 0 ? (
        <p className="text-center text-xs italic text-muted-foreground">
          {t("sources.empty")}
        </p>
      ) : (
        <ul className="space-y-1">
          {sources.map((s) => (
            <li
              key={s.source}
              className="paper-inset flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
            >
              <span className="truncate font-mono">{s.source}</span>
              <button
                type="button"
                onClick={() => void onDelete(s.source)}
                title={t("sources.delete")}
                className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
