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

import { useCallback, useEffect, useRef, useState } from "react";
// `agents/ai-react` re-exports this and prints a deprecation banner —
// the canonical home is `@cloudflare/ai-chat/react`, so import there
// directly to keep the console clean.
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Send, Square, Trash2, RotateCcw, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Message } from "./Message";

// useAgentChat returns a value whose shape includes `messages`,
// `status`, `sendMessage`, etc. The SDK doesn't export the type
// directly, but `ReturnType<typeof useAgentChat>` works the same way.
type ChatHelpers = ReturnType<typeof useAgentChat>;

// `useAgentChat` accepts both typed and untyped agent connections via
// its option type. We grab that exact type from the options surface
// so the App's typed `useAgent<ChatAgent, State>(...)` flows through.
type AgentForChat = Parameters<typeof useAgentChat>[0]["agent"];

const SUGGESTIONS = [
  "What's the weather in Seoul?",
  "Remind me to drink water in 30 seconds.",
  "Summarize the last PDF I uploaded.",
];

export function Chat({
  agent,
  theme,
  onToggleTheme,
  onReset,
}: {
  agent: AgentForChat;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onReset: () => void;
}) {
  // Stable identity for onToolCall — without useCallback a fresh
  // closure is created on every render, and the chat hook treats
  // that as a new options object and can re-init internals.
  const onToolCall = useCallback<
    NonNullable<Parameters<typeof useAgentChat>[0]["onToolCall"]>
  >(async ({ toolCall, addToolOutput }) => {
    if (toolCall.toolName === "getUserTimezone") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      addToolOutput({
        toolCallId: toolCall.toolCallId,
        output: { timezone: tz },
      });
      return;
    }
    // Server-side tools (getWeather, getTodayMarketBrief, …) also may
    // surface here via useAgentChat. Do NOT addToolOutput — that would
    // short-circuit the real server execute with a fake client error
    // ("No client handler…") and make the model retry once.
  }, []);

  const chat = useAgentChat({ agent, onToolCall });

  return (
    <div className="flex h-full flex-col">
      <Header
        chat={chat}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={onReset}
      />
      <MessageList chat={chat} />
      <ChatInput chat={chat} />
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
          <h1 className="text-sm font-semibold tracking-tight">Agent</h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            jinu-agent-nexus
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

// ─── Message list with auto-scroll ───────────────────────────────────────
function MessageList({ chat }: { chat: ChatHelpers }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom on every new message. We pin to the
  // bottom unless the user has manually scrolled up — track that via
  // a "near bottom" check before scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat.messages]);

  const handleApprove = (toolCallId: string, approved: boolean) => {
    chat.addToolApprovalResponse({
      id: toolCallId,
      approved,
      reason: approved ? undefined : "Rejected by user",
    });
  };

  const isEmpty = chat.messages.length === 0;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
      {isEmpty ? (
        <EmptyState onPick={(text) => chat.sendMessage({ text })} />
      ) : (
        <div className="space-y-4">
          {chat.messages.map((m) => (
            <Message key={m.id} message={m} onApprove={handleApprove} />
          ))}
        </div>
      )}
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
          Memory, skills, RAG, browser, schedules, and MCP — all wired
          up. Try one of these or ask anything.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2 self-stretch">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-foreground hover:border-foreground/40"
          >
            <span className="font-mono text-muted-foreground group-hover:text-foreground">
              ›
            </span>
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Input box ───────────────────────────────────────────────────────────
function ChatInput({ chat }: { chat: ChatHelpers }) {
  const [value, setValue] = useState("");
  const isStreaming = chat.status === "streaming";
  const isBusy = isStreaming || chat.status === "submitted";

  const send = () => {
    const text = value.trim();
    if (!text || isBusy) return;
    chat.sendMessage({ text });
    setValue("");
  };

  return (
    <div className="border-t border-border bg-card/40 p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Send a message…"
          rows={1}
          className="min-h-11 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {isStreaming ? (
          // Abort the active turn. `stop()` sends an abort signal to
          // the server; the agent's onChatMessage sees abortSignal
          // and bails out of its streamText loop.
          <Button onClick={() => void chat.stop()} variant="outline">
            <Square className="size-4 fill-current" />
            Stop
          </Button>
        ) : (
          <Button onClick={send} disabled={!value.trim() || isBusy}>
            <Send className="size-4" />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
