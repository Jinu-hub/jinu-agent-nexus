// ─────────────────────────────────────────────────────────────────────────
// ChatParts — message list + composer shared by every chat surface
// ─────────────────────────────────────────────────────────────────────────
//
// `Chat.tsx` is the agent shell's full conversation surface (brand header,
// theme toggle, session reset). Report pages want the same transcript and
// input without that chrome, so the reusable halves live here and each
// surface composes its own header and empty state.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from "react";
// `agents/ai-react` re-exports this and prints a deprecation banner —
// the canonical home is `@cloudflare/ai-chat/react`, so import there
// directly to keep the console clean.
import type { useAgentChat } from "@cloudflare/ai-chat/react";
import { LoaderCircle, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Message } from "./Message";
import { cn } from "@/lib/utils";

// useAgentChat returns a value whose shape includes `messages`,
// `status`, `sendMessage`, etc. The SDK doesn't export the type
// directly, but `ReturnType<typeof useAgentChat>` works the same way.
export type ChatHelpers = ReturnType<typeof useAgentChat>;

// `useAgentChat` accepts both typed and untyped agent connections via
// its option type. We grab that exact type from the options surface
// so a typed `useAgent<ChatAgent, State>(...)` flows through.
export type AgentForChat = Parameters<typeof useAgentChat>[0]["agent"];

export function ChatMessageList({
  chat,
  empty,
  className,
}: {
  chat: ChatHelpers;
  /** Shown instead of the transcript before the first message. */
  empty: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSubmitted = chat.status === "submitted";
  const isStreaming = chat.status === "streaming";
  const isBusy = isSubmitted || isStreaming;
  const last = chat.messages[chat.messages.length - 1];
  const assistantHasVisibleText =
    last?.role === "assistant" &&
    last.parts.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.trim().length > 0,
    );
  // Prefetch / first tokens can leave a long empty gap after the user bubble.
  const showPreparing =
    isBusy &&
    chat.messages.length > 0 &&
    (isSubmitted || last?.role === "user" || !assistantHasVisibleText);

  // Auto-scroll to the bottom on every new message. We pin to the
  // bottom unless the user has manually scrolled up — track that via
  // a "near bottom" check before scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat.messages, showPreparing]);

  const handleApprove = (toolCallId: string, approved: boolean) => {
    chat.addToolApprovalResponse({
      id: toolCallId,
      approved,
      reason: approved ? undefined : "Rejected by user",
    });
  };

  return (
    <div ref={scrollRef} className={className}>
      {chat.messages.length === 0 ? (
        empty
      ) : (
        <div className="space-y-4">
          {chat.messages.map((m) => (
            <Message key={m.id} message={m} onApprove={handleApprove} />
          ))}
          {showPreparing ? <PreparingReply /> : null}
        </div>
      )}
    </div>
  );
}

function PreparingReply() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-busy="true">
      <div
        className={cn(
          "inline-flex max-w-[85%] items-center gap-1.5 rounded-2xl rounded-bl-sm",
          "border border-border bg-card px-3.5 py-2.5 shadow-sm",
        )}
        title="Preparing reply"
        aria-label="Preparing reply"
      >
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
        <span className="inline-flex gap-0.5" aria-hidden>
          <span className="size-1 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
          <span className="size-1 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
          <span className="size-1 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}

export function ChatComposer({ chat }: { chat: ChatHelpers }) {
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
