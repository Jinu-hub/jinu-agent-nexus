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
import { Trash2, RotateCcw, Moon, Sun, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { HOME_CHAT_SUGGESTIONS } from "@/lib/market-suggestions";
import {
  ChatComposer,
  ChatMessageList,
  type AgentForChat,
  type ChatHelpers,
} from "./ChatParts";
import { ReportLandingCards, ReportNavLinks } from "./HomeReportExits";
import { useClientToolCall } from "./use-client-tools";

export function Chat({
  agent,
  theme,
  onToggleTheme,
  onReset,
  pendingAsk = null,
  onPendingAskConsumed,
  panelOpen = false,
  onTogglePanels,
}: {
  agent: AgentForChat;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onReset: () => void;
  /** Set by Market panel "Ask in chat" — Chat sends then clears via callback. */
  pendingAsk?: { text: string; nonce: number } | null;
  onPendingAskConsumed?: () => void;
  /** Narrow-viewport panel drawer open (lg+ dock ignores this). */
  panelOpen?: boolean;
  onTogglePanels?: () => void;
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
        panelOpen={panelOpen}
        onTogglePanels={onTogglePanels}
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
// Glyph: geometric L (LYRA) — readable at header size; lyre was too vague.
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
// Hosts theme toggle and clear-chat. Reset session (sources/files/schedules/
// extensions/MCP) stays wired but hidden until the action has clearer UX.
const SHOW_RESET_SESSION = false;

function Header({
  chat,
  theme,
  onToggleTheme,
  onReset,
  panelOpen,
  onTogglePanels,
}: {
  chat: ChatHelpers;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onReset: () => void;
  panelOpen: boolean;
  onTogglePanels?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-tight">LYRA</h1>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            Your world, a little closer.
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
            title={panelOpen ? "Close panels" : "Open panels"}
            aria-label={panelOpen ? "Close panels" : "Open panels"}
          >
            <PanelRight className="size-4" />
          </Button>
        ) : null}
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
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        {SHOW_RESET_SESSION ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            title="Wipe sources, files, schedules, extensions, MCP connections"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden xl:inline">Reset session</span>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => chat.clearHistory()}
          title="Clear chat history"
        >
          <Trash2 className="size-3.5" />
          <span className="hidden xl:inline">Clear chat</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Empty state — shown before the first message ───────────────────────
// Product intro + Cloudflare stack notes + a few starter prompts. Longer
// than the old one-liner, so the list stays short and the column is wider.
const INTRO_PARAS = [
  "LYRA는 매일 쏟아지는 많은 정보 속에서 자신에게 필요한 내용을 일일이 찾아보기 어려운 사람을 위한 개인화 정보 서비스입니다.",
  "현재는 글로벌 시장과 AI 관련 주요 이슈를 짧고 쉽게 정리해 보여주고, 사용자가 등록한 관심 키워드와 태그를 기준으로 관련 내용을 따로 요약해 제공합니다.",
  "앞으로는 국내 이슈, 스포츠, 엔터테인먼트 등 보다 대중적인 분야로 콘텐츠를 확장하고, 사용자의 관심 키워드와 연결되는 심층 리포트가 발행될 경우 이를 추천하고 이어서 볼 수 있도록 하는 기능도 추가할 계획입니다.",
  "궁극적으로는 사용자가 여러 뉴스와 콘텐츠를 직접 찾아다니지 않아도, 나에게 중요한 정보를 빠르게 발견하고 필요할 때 더 깊이 탐색할 수 있도록 하는 것이 LYRA의 목적입니다.",
] as const;

const TECH_STACK = [
  {
    name: "Workers AI",
    detail: "임베딩 / For you 요약 LLM / Voice TTS / topic label 보강",
  },
  {
    name: "Vectorize",
    detail: "마켓 리포트 청크 검색 (ingest · keyword · For you 근거)",
  },
  {
    name: "R2",
    detail: "Voice 오디오 저장·재생 (AUDIO_BUCKET)",
  },
  {
    name: "Cron Triggers",
    detail:
      "일일 Voice TTS + Market vector ingest (각 catch-up 포함)",
  },
  {
    name: "Durable Objects (SQLite)",
    detail: "ChatAgent 설정 · MyMemory(관심사/라벨/for-you 캐시)",
  },
  {
    name: "Workers RPC / HTTP routes",
    detail: "settings RPC · /api/market/* · /api/audio/* · /memory/*",
  },
] as const;

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-8 py-10 animate-fade-up [animation-delay:280ms]">
      <BrandMark size="lg" />

      <section className="space-y-3 self-stretch">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          소개
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-foreground/80">
          {INTRO_PARAS.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      </section>

      <ReportLandingCards />

      <section className="space-y-3 self-stretch">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          기술 스택
        </h2>
        <div className="overflow-x-auto self-stretch">
          <table className="w-full border-collapse text-left text-[11px] leading-snug">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4 font-semibold tracking-wide">기술</th>
                <th className="py-2 font-semibold tracking-wide">용도</th>
              </tr>
            </thead>
            <tbody className="font-mono text-muted-foreground">
              {TECH_STACK.map((row) => (
                <tr key={row.name} className="border-b border-border/70 align-top">
                  <td className="whitespace-nowrap py-2.5 pr-4 text-foreground/85">
                    {row.name}
                  </td>
                  <td className="py-2.5">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col items-stretch gap-2 self-stretch">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          이렇게 물어보세요
        </p>
        {HOME_CHAT_SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-foreground hover:border-primary/50"
          >
            <span className="font-mono text-primary/70 group-hover:text-primary">
              ›
            </span>
            <span>{s.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

