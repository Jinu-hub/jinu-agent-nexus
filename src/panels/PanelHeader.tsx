// ─────────────────────────────────────────────────────────────────────────
// PanelHeader — shared header for the right-pane tabs
// ─────────────────────────────────────────────────────────────────────────
//
// Every panel uses this. Icon + title + optional trailing slot
// (typically a count badge or token meter) + optional trash button to
// clear the panel's data.
// ─────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from "lucide-react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PanelHeader({
  icon: Icon,
  title,
  trailing,
  onClear,
  clearLabel = "Clear",
}: {
  icon: LucideIcon;
  title: string;
  trailing?: React.ReactNode;
  onClear?: () => void | Promise<void>;
  clearLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="ml-auto flex items-center gap-2">
        {trailing}
        {onClear && (
          <button
            type="button"
            onClick={() => void onClear()}
            className={cn(
              "rounded-md p-1 text-muted-foreground transition-colors",
              "hover:bg-destructive/10 hover:text-destructive",
            )}
            title={clearLabel}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
