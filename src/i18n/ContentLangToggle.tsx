// ─────────────────────────────────────────────────────────────────────────
// ContentLangToggle — shared KO/EN (…JA) chrome control
// ─────────────────────────────────────────────────────────────────────────
//
// Cycles via nextContentLang. Parent owns persistence (RPC updateSettings
// or patchContentLang) so App state and standalone pages stay in sync with
// the same ChatAgent settings row. Prefer ChromePrefs when pairing with theme.

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { nextContentLang } from "./content-lang";
import { useT } from "./ui-lang";

type Props = {
  lang: ContentLang | null;
  onChange: (lang: ContentLang) => void;
  disabled?: boolean;
  className?: string;
};

export function ContentLangToggle({
  lang,
  onChange,
  disabled = false,
  className,
}: Props) {
  const t = useT();

  if (!lang) {
    return (
      <span
        className={cn(
          "inline-flex h-8 min-w-8 items-center justify-center",
          "font-mono text-xs tracking-wide text-muted-foreground",
          className,
        )}
        aria-hidden
      >
        …
      </span>
    );
  }

  const label = lang.toUpperCase();
  const title = t("common.toggleLanguage");

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={() => onChange(nextContentLang(lang))}
      title={title}
      aria-label={title}
      className={className}
    >
      <span className="font-mono text-xs tracking-wide">{label}</span>
    </Button>
  );
}
