// ─────────────────────────────────────────────────────────────────────────
// Chat — the main conversation surface
// ─────────────────────────────────────────────────────────────────────────
//
// Uses `useAgentChat` from the agents SDK. The hook wraps the AI SDK's
// React chat machinery with agents-specific wiring (message
// persistence, resumable streams, server-driven tool callbacks).
//
// Three things the parent App.tsx wires in via props:
//   1. The `agent` connection object from `useAgent()`.
//   2. `clientTools` — the schemas for client-side tools whose
//      `execute` is here in the browser. Right now we only have one,
//      `getUserTimezone`; the implementation lives in `onToolCall`.
//   3. Nothing else — chat owns its own input state, scroll, etc.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Trash2, RotateCcw, PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChromePrefs } from "@/components/ChromePrefs";
import type { ContentLang } from "../../worker/chat-agent/settings";
import {
  ChatComposer,
  ChatMessageList,
  type AgentForChat,
  type ChatHelpers,
} from "./ChatParts";
import { ReportLandingCards, ReportNavLinks } from "./HomeReportExits";
import { useClientToolCall } from "./use-client-tools";
import { useT } from "@/i18n/ui-lang";

export function Chat({
  agent,
  contentLang = "ko",
  onContentLangChange,
  contentLangUpdating = false,
  onReset,
  pendingAsk = null,
  onPendingAskConsumed,
  panelOpen = false,
  onTogglePanels,
  helperOpen = false,
  onToggleHelper,
}: {
  agent: AgentForChat;
  /** Settings content_lang — screen chrome + Market Memory (not chat reply). */
  contentLang?: ContentLang;
  onContentLangChange?: (lang: ContentLang) => void;
  contentLangUpdating?: boolean;
  onReset: () => void;
  /** Set by helper rail / Market modal "Ask in chat" — Chat sends then clears. */
  pendingAsk?: { text: string; nonce: number } | null;
  onPendingAskConsumed?: () => void;
  /** Narrow-viewport panel drawer open (lg+ dock ignores this). */
  panelOpen?: boolean;
  onTogglePanels?: () => void;
  /** Narrow-viewport helper drawer open (xl+ dock ignores this). */
  helperOpen?: boolean;
  onToggleHelper?: () => void;
}) {
  const onToolCall = useClientToolCall();
  const chat = useAgentChat({ agent, onToolCall });
  const sendRef = useRef(chat.sendMessage);
  sendRef.current = chat.sendMessage;
  const consumedRef = useRef(onPendingAskConsumed);
  consumedRef.current = onPendingAskConsumed;

  useEffect(() => {
    const text = pendingAsk?.text?.trim();
    if (!text || pendingAsk == null) return;
    void sendRef.current({ text });
    consumedRef.current?.();
  }, [pendingAsk]);

  return (
    <div className="flex h-full flex-col">
      <Header
        chat={chat}
        contentLang={contentLang}
        onContentLangChange={onContentLangChange}
        contentLangUpdating={contentLangUpdating}
        onReset={onReset}
        panelOpen={panelOpen}
        onTogglePanels={onTogglePanels}
        helperOpen={helperOpen}
        onToggleHelper={onToggleHelper}
      />
      <ChatMessageList
        chat={chat}
        className="flex-1 overflow-y-auto px-4 py-6"
        empty={<EmptyState />}
      />
      <ChatComposer chat={chat} />
    </div>
  );
}

// ─── Brand mark ─────────────────────────────────────────────────────────
// Monochrome bordered square, no gradients — header only.
// Glyph: geometric L (LYRA) — readable at header size; lyre was too vague.
function BrandMark() {
  return (
    <div className="size-7 grid place-items-center rounded-md border border-border bg-card text-foreground">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[62%]"
        aria-hidden="true"
      >
        {/* L */}
        <path d="M10 8 V23 H21" />

        {/* Vega / star */}
        <path d="M22 7 V11" />
        <path d="M20 9 H24" />
      </svg>
    </div>
  );
}

// ─── Header bar ──────────────────────────────────────────────────────────
// Hosts theme / content_lang toggles and clear-chat. Reset session
// (sources/files/schedules/extensions/MCP) stays wired but hidden until
// the action has clearer UX.
const SHOW_RESET_SESSION = false;

function Header({
  chat,
  contentLang,
  onContentLangChange,
  contentLangUpdating,
  onReset,
  panelOpen,
  onTogglePanels,
  helperOpen,
  onToggleHelper,
}: {
  chat: ChatHelpers;
  contentLang: ContentLang;
  onContentLangChange?: (lang: ContentLang) => void;
  contentLangUpdating: boolean;
  onReset: () => void;
  panelOpen: boolean;
  onTogglePanels?: () => void;
  helperOpen: boolean;
  onToggleHelper?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {onToggleHelper ? (
          <Button
            size="sm"
            variant="ghost"
            className="xl:hidden"
            onClick={onToggleHelper}
            aria-pressed={helperOpen}
            title={helperOpen ? t("shell.closeHelper") : t("shell.openHelper")}
            aria-label={
              helperOpen ? t("shell.closeHelper") : t("shell.openHelper")
            }
          >
            <PanelLeft className="size-4" />
          </Button>
        ) : null}
        <BrandMark />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-tight">LYRA</h1>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            {t("chat.slogan")}
          </p>
        </div>
        {/* Sidebar appears at lg — keep nav only when the chat column is wide enough. */}
        <ReportNavLinks className="ml-3 flex shrink-0" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onTogglePanels ? (
          <Button
            size="sm"
            variant="ghost"
            className="lg:hidden"
            onClick={onTogglePanels}
            aria-pressed={panelOpen}
            title={panelOpen ? t("panels.close") : t("panels.open")}
            aria-label={panelOpen ? t("panels.close") : t("panels.open")}
          >
            <PanelRight className="size-4" />
          </Button>
        ) : null}
        <ChromePrefs
          lang={contentLang}
          onContentLangChange={onContentLangChange}
          contentLangUpdating={contentLangUpdating}
        />
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        {SHOW_RESET_SESSION ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            title={t("chat.resetSessionTitle")}
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden xl:inline">{t("chat.resetSession")}</span>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => chat.clearHistory()}
          title={t("chat.clearHistoryTitle")}
        >
          <Trash2 className="size-3.5" />
          <span className="hidden xl:inline">{t("chat.clearHistory")}</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Empty state — shown before the first message ───────────────────────
// Product intro + how-to + report landing cards. Starter prompts live in
// the left ChatHelperRail so the conversation column stays a reading intro.
const INTRO_KEYS = [
  "chat.intro.p1",
  "chat.intro.p2",
  "chat.intro.p3",
  "chat.intro.p4",
] as const;

const HOW_TO_KEYS = [
  "chat.howTo.s1",
  "chat.howTo.s2",
  "chat.howTo.s3",
  "chat.howTo.s4",
  "chat.howTo.s5",
] as const;

function EmptyState() {
  const t = useT();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-8 py-10 animate-fade-up [animation-delay:280ms]">
      <section className="space-y-3 self-stretch">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          {t("chat.introHeading")}
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
          {INTRO_KEYS.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
        </div>
      </section>

      <section className="space-y-3 self-stretch">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          {t("chat.howToHeading")}
        </h2>
        <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-foreground/80">
          {HOW_TO_KEYS.map((key) => (
            <li key={key} className="pl-1">
              {t(key)}
            </li>
          ))}
        </ol>
      </section>

      <ReportLandingCards />
    </div>
  );
}

