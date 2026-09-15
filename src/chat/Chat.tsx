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
import { Trash2, RotateCcw, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MARKET_SUGGESTIONS } from "@/lib/market-suggestions";
import {
  ChatComposer,
  ChatMessageList,
  type AgentForChat,
  type ChatHelpers,
} from "./ChatParts";
import { useClientToolCall } from "./use-client-tools";

export function Chat({
  agent,
  theme,
  onToggleTheme,
  onReset,
  pendingAsk = null,
  onPendingAskConsumed,
}: {
  agent: AgentForChat;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onReset: () => void;
  /** Set by Market panel "Ask in chat" — Chat sends then clears via callback. */
  pendingAsk?: { text: string; nonce: number } | null;
  onPendingAskConsumed?: () => void;
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
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={onReset}
      />
      <ChatMessageList
        chat={chat}
        className="flex-1 overflow-y-auto px-4 py-6"
        empty={<EmptyState onPick={(text) => chat.sendMessage({ text })} />}
      />
      <ChatComposer chat={chat} />
    </div>
  );
}

// ─── Brand mark ─────────────────────────────────────────────────────────
// Monochrome bordered square, no gradients. Same glyph reused at small
// (header) and large (empty-state) sizes — purely a current-color
// stroke so it inverts cleanly between light/dark.
function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-12" : "size-7";
  const stroke = size === "lg" ? 2.2 : 2.4;
  return (
    <div
      className={`${box} grid place-items-center rounded-md border border-border bg-card text-foreground`}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[58%]"
        aria-hidden="true"
      >
        <path d="M10 22 L16 8 L22 22 M12.5 17 H19.5" />
      </svg>
    </div>
  );
}

// ─── Header bar ──────────────────────────────────────────────────────────
// Hosts every chat-level action: theme toggle, full session reset
// (wipes sources/files/schedules/extensions/MCP), and clear-chat-only.
function Header({
  chat,
  theme,
  onToggleTheme,
  onReset,
}: {
  chat: ChatHelpers;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <h1 className="text-sm font-semibold tracking-tight">LYRA</h1>
          <p className="text-[11px] text-muted-foreground">
            Your world, a little closer.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleTheme}
          title="Toggle theme"
        >
          {theme === "light" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          size="sm"
          variant="ghost"
          onClick={onReset}
          title="Wipe sources, files, schedules, extensions, MCP connections"
        >
          <RotateCcw className="size-3.5" />
          Reset session
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => chat.clearHistory()}
          title="Clear chat history"
        >
          <Trash2 className="size-3.5" />
          Clear chat
        </Button>
      </div>
    </div>
  );
}

// ─── Empty state — shown before the first message ───────────────────────
// Monochrome mark + a blinking terminal caret after the prompt. The
// caret is the only animated element, and it's calm enough to fade
// out of attention once the user starts reading.
function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-6 py-16 animate-fade-up [animation-delay:280ms]">
      <BrandMark size="lg" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Ready when you are
          <span className="ml-1 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-foreground animate-caret" />
        </h2>
        <p className="text-sm text-muted-foreground">
          Chat interprets Market Memory. Full brief text and voice live in
          the Market tab.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2 self-stretch">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
          Market Memory · 이렇게 물어보세요
        </p>
        {MARKET_SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-foreground hover:border-foreground/40"
          >
            <span className="font-mono text-muted-foreground group-hover:text-foreground">
              ›
            </span>
            <span>{s.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

