// ─────────────────────────────────────────────────────────────────────────
// Message rendering
// ─────────────────────────────────────────────────────────────────────────
//
// A single message in the conversation can have multiple "parts" — text,
// tool calls, tool results, etc. We iterate over `message.parts` and
// render each one with the right look.
//
// Tool call lifecycle (AI SDK v6):
//   * input-streaming    — model is still writing the JSON args
//   * input-available    — args complete, execute hasn't started
//   * output-available   — execute returned (server tool) OR client
//                          provided output (client tool)
//   * output-error       — execute threw OR client returned error
//
// For tools that need user approval (sendNotification), the SDK emits
// an extra state for the awaiting-approval period. The `Chat` parent
// component handles those via `addToolApprovalResponse`.
// ─────────────────────────────────────────────────────────────────────────

import type { UIMessage } from "ai";
import { Wrench, CheckCircle2, XCircle, Loader2, Volume2 } from "lucide-react";
import { Markdown } from "./Markdown";

type ApprovalHandler = (toolCallId: string, approved: boolean) => void;

export function Message({
  message,
  onApprove,
}: {
  message: UIMessage;
  onApprove?: ApprovalHandler;
}) {
  const isUser = message.role === "user";

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
            : "max-w-[85%] space-y-2"
        }
      >
        {message.parts.map((part, i) => {
          // Plain text — most common part.
          if (part.type === "text") {
            return isUser ? (
              <p key={i} className="whitespace-pre-wrap text-sm">
                {part.text}
              </p>
            ) : (
              // Assistant text gets its own bubble. Mirror of the
              // user's rounded-br-sm: assistant lives on the left,
              // so the corner-cut points down to the left
              // (rounded-bl-sm).
              <div
                key={i}
                className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 shadow-sm"
              >
                <Markdown>{part.text}</Markdown>
              </div>
            );
          }

          // Tool call / result. The type string is `tool-<toolName>`.
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            const toolName = part.type.slice("tool-".length);
            const toolPart = part as ToolPart;
            return (
              <ToolCall
                key={toolPart.toolCallId ?? i}
                name={toolName}
                state={toolPart.state}
                input={toolPart.input}
                output={toolPart.output}
                errorText={toolPart.errorText}
                toolCallId={toolPart.toolCallId}
                onApprove={onApprove}
              />
            );
          }

          // Unknown part type — render nothing rather than throw.
          return null;
        })}
      </div>
    </div>
  );
}

// ─── Tool call card ──────────────────────────────────────────────────────
// Collapsible visual for each tool invocation. Click to expand input /
// output. Approval state shows Approve / Reject buttons inline.

type ToolPart = {
  type: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function ToolCall({
  name,
  state,
  input,
  output,
  errorText,
  toolCallId,
  onApprove,
}: {
  name: string;
  state: ToolPart["state"];
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
  onApprove?: ApprovalHandler;
}) {
  const statusIcon = (() => {
    if (state === "input-streaming" || state === "input-available")
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    if (state === "output-error")
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  })();

  // sendNotification is the only approval-required tool wired up by
  // default. The agents SDK signals "awaiting approval" via the same
  // input-available state but with a flag — we detect it via the
  // presence of an approval-handler prop and the tool name.
  const awaitingApproval =
    state === "input-available" &&
    name === "sendNotification" &&
    !!toolCallId &&
    !!onApprove;

  const voice = name === "getTodayMarketVoice" ? parseVoiceToolOutput(output) : null;

  return (
    <div className="paper-inset px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono font-medium text-foreground">{name}</span>
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          {statusIcon}
          <span className="capitalize">{state.replace("-", " ")}</span>
        </span>
      </div>
      {input !== undefined && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            input
          </summary>
          <pre className="mt-1 overflow-x-auto text-[11px]">
            {JSON.stringify(input, null, 2)}
          </pre>
        </details>
      )}
      {voice && (
        <VoiceBriefPlayer
          playPath={voice.playPath}
          title={voice.title}
          durationSeconds={voice.durationSeconds}
        />
      )}
      {output !== undefined && (
        <details className="mt-1.5" open={state === "output-error"}>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            output
          </summary>
          <pre className="mt-1 overflow-x-auto text-[11px]">
            {JSON.stringify(output, null, 2)}
          </pre>
        </details>
      )}
      {state === "output-error" && errorText && (
        <p className="mt-1.5 text-destructive">{errorText}</p>
      )}
      {awaitingApproval && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            onClick={() => onApprove!(toolCallId!, true)}
          >
            Approve
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            onClick={() => onApprove!(toolCallId!, false)}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

type VoiceToolMeta = {
  playPath: string;
  title: string | null;
  durationSeconds: number | null;
};

/** Only same-origin /api/audio/file/:id paths — never arbitrary URLs. */
function parseVoiceToolOutput(output: unknown): VoiceToolMeta | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (o.found !== true) return null;
  if (typeof o.playPath !== "string") return null;
  if (!/^\/api\/audio\/file\/[0-9a-f-]{36}$/i.test(o.playPath)) return null;
  return {
    playPath: o.playPath,
    title: typeof o.title === "string" ? o.title : null,
    durationSeconds:
      typeof o.durationSeconds === "number" && Number.isFinite(o.durationSeconds)
        ? o.durationSeconds
        : null,
  };
}

function VoiceBriefPlayer({
  playPath,
  title,
  durationSeconds,
}: VoiceToolMeta) {
  const durationLabel =
    durationSeconds != null ? `${durationSeconds}s` : null;

  return (
    <div className="mt-2 rounded-md border border-border bg-card px-2.5 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
        <Volume2 className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate font-medium text-foreground">
          {title ?? "Voice briefing"}
        </span>
        {durationLabel && (
          <span className="ml-auto shrink-0 tabular-nums">{durationLabel}</span>
        )}
      </div>
      <audio
        className="w-full"
        controls
        preload="metadata"
        src={playPath}
      >
        <a href={playPath} target="_blank" rel="noreferrer">
          Download MP3
        </a>
      </audio>
    </div>
  );
}
