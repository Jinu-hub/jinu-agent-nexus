import { LoaderCircle, Settings2 } from "lucide-react";
import type {
  ChatSettings,
  ContentLang,
} from "../../worker/chat-agent/settings";
import { CONTENT_LANGS } from "../../worker/chat-agent/settings";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";

function SettingSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="paper-inset flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <SettingSwitch
        checked={checked}
        disabled={disabled}
        label={title}
        onChange={onChange}
      />
    </div>
  );
}

export function SettingsPanel({
  settings,
  loading,
  updating,
  error,
  onToggleAlarm,
  onToggleCleanup,
  onContentLangChange,
}: {
  settings: ChatSettings | null;
  loading: boolean;
  updating: boolean;
  error: string | null;
  onToggleAlarm: (enabled: boolean) => Promise<void>;
  onToggleCleanup: (enabled: boolean) => Promise<void>;
  onContentLangChange: (lang: ContentLang) => Promise<void>;
}) {
  return (
    <section>
      <PanelHeader
        icon={Settings2}
        title="Settings"
        trailing={
          updating ? (
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
          ) : null
        }
      />

      {loading && !settings ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Loading settings…
        </div>
      ) : settings ? (
        <div className="space-y-2">
          <div className="paper-inset px-3 py-2.5">
            <p className="text-xs font-medium">Market content language</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Preferred lang_code for Market Memory briefs and voice (Supabase).
              Independent of chat reply language.
            </p>
            <div className="mt-2.5 flex gap-1.5">
              {CONTENT_LANGS.map((lang) => {
                const selected = settings.content_lang === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    disabled={updating}
                    aria-pressed={selected}
                    onClick={() => void onContentLangChange(lang)}
                    className={cn(
                      "min-w-12 rounded-md px-3 py-1.5 font-mono text-xs transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>

          <SettingRow
            title="Alarm scheduling"
            description="Allow the agent to schedule background cleanup work."
            checked={settings.alarm_enabled}
            disabled={updating}
            onChange={(enabled) => void onToggleAlarm(enabled)}
          />
          <SettingRow
            title="Message cleanup"
            description="Delete messages older than the configured retention period."
            checked={settings.message_cleanup_enabled}
            disabled={updating}
            onChange={(enabled) => void onToggleCleanup(enabled)}
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="paper-inset px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Retention</p>
              <p className="mt-1 font-mono text-xs">
                {formatDuration(settings.message_retention_seconds)}
              </p>
            </div>
            <div className="paper-inset px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Interval</p>
              <p className="mt-1 font-mono text-xs">
                {formatDuration(settings.alarm_interval_seconds)}
              </p>
            </div>
          </div>

          <p className="pt-1 text-[10px] text-muted-foreground">
            Updated {formatUpdatedAt(settings.updated_at)}
          </p>
        </div>
      ) : (
        <p className="panel-empty px-3 py-6 text-center text-xs italic">
          Settings are unavailable.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  if (Number.isInteger(minutes)) return `${minutes}m`;
  return `${seconds}s`;
}

function formatUpdatedAt(updatedAt: string): string {
  if (!updatedAt) return "never";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}
