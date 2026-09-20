// ─────────────────────────────────────────────────────────────────────────
// ReportChat — side chat on a standalone report page
// ─────────────────────────────────────────────────────────────────────────
//
// Same agent and transcript as the shell's chat (`ChatParts`), minus the
// brand header, theme toggle and session reset — the report is the main
// surface here, chat is the sidekick.
//
// Scope: ReportSurface pins `market_focus_series_id` to the active day slot
// (path series or a companion like weekly-market-issues) before the user asks,
// so Market prefetch / vector search read the report they are looking at.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { MessageSquare, Trash2, X } from "lucide-react";

import {
  ChatComposer,
  ChatMessageList,
  type AgentForChat,
} from "@/chat/ChatParts";
import { useClientToolCall } from "@/chat/use-client-tools";
import { reportChatSuggestions } from "@/lib/market-suggestions";
import { cn } from "@/lib/utils";
import { useT, useUiLang } from "@/i18n/ui-lang";

export function ReportChat({
  agent,
  marketDate,
  pendingAsk = null,
  onPendingAskConsumed,
  onClose,
}: {
  agent: AgentForChat;
  /** Day on screen — suggestion prompts name it instead of "Latest". */
  marketDate: string | null;
  /** Set by a topic chip "ask" — same nonce handshake as the shell's Chat. */
  pendingAsk?: { text: string; nonce: number } | null;
  onPendingAskConsumed?: () => void;
  onClose: () => void;
}) {
  const onToolCall = useClientToolCall();
  const chat = useAgentChat({ agent, onToolCall });
  const sendRef = useRef(chat.sendMessage);
  sendRef.current = chat.sendMessage;
  const consumedRef = useRef(onPendingAskConsumed);
  consumedRef.current = onPendingAskConsumed;
  const t = useT();

  useEffect(() => {
    const text = pendingAsk?.text?.trim();
    if (!text) return;
    void sendRef.current({ text });
    consumedRef.current?.();
  }, [pendingAsk]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight">
          {t("report.askTitle")}
        </p>
        <button
          type="button"
          onClick={() => chat.clearHistory()}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t("chat.clearHistoryTitle")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t("report.hideChat")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ChatMessageList
        chat={chat}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        empty={
          <Suggestions
            marketDate={marketDate}
            onPick={(text) => chat.sendMessage({ text })}
          />
        }
      />

      <ChatComposer chat={chat} />
    </div>
  );
}

function Suggestions({
  marketDate,
  onPick,
}: {
  marketDate: string | null;
  onPick: (text: string) => void;
}) {
  const t = useT();
  const { lang } = useUiLang();
  if (!marketDate) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
        {t("report.tryAsking")}
      </p>
      {reportChatSuggestions(marketDate, lang).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(s.prompt)}
          className={cn(
            "group flex w-full items-center gap-2 rounded-lg border border-border bg-card",
            "px-3 py-2 text-left text-xs hover:border-primary/50",
          )}
        >
          <span className="font-mono text-muted-foreground group-hover:text-primary">
            ›
          </span>
          <span>{s.prompt}</span>
        </button>
      ))}
    </div>
  );
}
