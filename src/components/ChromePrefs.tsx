// ─────────────────────────────────────────────────────────────────────────
// ChromePrefs — theme + content_lang pair (same on every surface)
// ─────────────────────────────────────────────────────────────────────────
//
// Moon/Sun + KO/EN (…JA via nextContentLang). Theme is ThemeProvider /
// localStorage; language persistence is owned by the parent (RPC or
// patchContentLang → ChatAgent settings).

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { ContentLangToggle } from "@/i18n/ContentLangToggle";
import { useT } from "@/i18n/ui-lang";

type Props = {
  lang: ContentLang | null;
  onContentLangChange?: (lang: ContentLang) => void;
  contentLangUpdating?: boolean;
  className?: string;
};

export function ChromePrefs({
  lang,
  onContentLangChange,
  contentLangUpdating = false,
  className,
}: Props) {
  const t = useT();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        size="sm"
        variant="ghost"
        onClick={toggleTheme}
        title={t("common.toggleTheme")}
        aria-label={t("common.toggleTheme")}
      >
        {theme === "light" ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </Button>
      {onContentLangChange ? (
        <ContentLangToggle
          lang={lang}
          onChange={onContentLangChange}
          disabled={contentLangUpdating}
        />
      ) : null}
    </div>
  );
}
