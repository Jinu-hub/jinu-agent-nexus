// ─────────────────────────────────────────────────────────────────────────
// Live Market Room — Market Pulse
// ─────────────────────────────────────────────────────────────────────────
//
// Standalone surface at `/live`, rendered instead of the chat shell (see
// src/main.tsx). One question, live tallies, no chat.
//
// The room token never ships in the bundle — it comes from `?token=` and
// is forwarded to the agent as a WebSocket query param, which
// LiveMarketRoomAgent.onConnect() validates. `?readonly=true` joins as a
// spectator: results stream in, votes are refused server-side.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAgent } from "agents/react";
import { Eye, Lock, Plus, Radio, RotateCcw, Timer } from "lucide-react";

import type {
  LiveMarketRoomAgent,
  PollState,
  RoomActionResult,
} from "../../worker/live-market-room";
import {
  LIVE_ROOM_AGENT,
  LIVE_ROOM_NAME,
  UNAUTHORIZED_CLOSE_CODE,
} from "@/lib/live-room";
import { Button } from "@/components/ui/button";
import { ChromePrefs } from "@/components/ChromePrefs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { patchContentLang } from "@/i18n/content-lang";
import { UiLangProvider, useT, type TFn } from "@/i18n/ui-lang";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { isContentLang } from "../../worker/chat-agent/settings";

function refusalText(
  t: TFn,
  reason: Extract<RoomActionResult, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "readonly":
      return t("live.refuse.readonly");
    case "closed":
      return t("live.refuse.closed");
    case "unknown_option":
      return t("live.refuse.unknown_option");
    case "empty_label":
      return t("live.refuse.empty_label");
    case "duplicate_option":
      return t("live.refuse.duplicate_option");
    case "too_many_options":
      return t("live.refuse.too_many_options");
  }
}

export default function LiveMarketRoom() {
  const [lang, setLang] = useState<ContentLang>("ko");
  const [langUpdating, setLangUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/settings")
      .then((res) => res.json() as Promise<{ content_lang?: unknown }>)
      .then((body) => {
        if (!active) return;
        if (isContentLang(body.content_lang)) setLang(body.content_lang);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      active = false;
    };
  }, []);

  const onContentLangChange = useCallback(async (next: ContentLang) => {
    setLangUpdating(true);
    try {
      setLang(await patchContentLang(next));
    } catch {
      /* keep current */
    } finally {
      setLangUpdating(false);
    }
  }, []);

  const prefs = (
    <ChromePrefs
      lang={lang}
      onContentLangChange={(next) => void onContentLangChange(next)}
      contentLangUpdating={langUpdating}
    />
  );

  return (
    <UiLangProvider lang={lang}>
      <LiveMarketRoomBody prefs={prefs} />
    </UiLangProvider>
  );
}

function LiveMarketRoomBody({ prefs }: { prefs: ReactNode }) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token")?.trim() ?? "";
  const readonly = params.get("readonly") === "true";
  const t = useT();

  if (!token) {
    return (
      <Gate title={t("live.tokenRequired")} prefs={prefs}>
        {t("live.tokenRequiredBody")}
      </Gate>
    );
  }

  return <Room token={token} readonly={readonly} prefs={prefs} />;
}

function Room({
  token,
  readonly,
  prefs,
}: {
  token: string;
  readonly: boolean;
  prefs: ReactNode;
}) {
  const [unauthorized, setUnauthorized] = useState(false);
  const [handshakeExpired, setHandshakeExpired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draftOption, setDraftOption] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const t = useT();

  // Reconnects would thrash if this object were rebuilt on every render.
  const query = useMemo<Record<string, string>>(() => {
    const params: Record<string, string> = { token };
    if (readonly) params.readonly = "true";
    return params;
  }, [token, readonly]);

  const onClose = useCallback((event: CloseEvent) => {
    if (event.code === UNAUTHORIZED_CLOSE_CODE) setUnauthorized(true);
  }, []);

  const agent = useAgent<LiveMarketRoomAgent, PollState>({
    agent: LIVE_ROOM_AGENT,
    name: LIVE_ROOM_NAME,
    query,
    onClose,
  });

  // The socket auto-reconnects by default; a rejected token would retry
  // forever, so stop it once the server has told us why.
  useEffect(() => {
    if (unauthorized) agent.close();
  }, [unauthorized, agent]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A refused socket is silent — the agent withholds its state frames. The
  // close code usually tells us why, but it can be swallowed by a dev
  // proxy, so treat a state-less handshake as a refusal too.
  useEffect(() => {
    const id = setTimeout(() => setHandshakeExpired(true), 6000);
    return () => clearTimeout(id);
  }, []);

  const run = useCallback(async (action: () => Promise<RoomActionResult>) => {
    setPending(true);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) setNotice(refusalText(t, result.reason));
      return result.ok;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("live.rejected"),
      );
      return false;
    } finally {
      setPending(false);
    }
  }, [t]);

  const poll = agent.state;

  if (!poll && (unauthorized || handshakeExpired)) {
    return (
      <Gate title={t("live.invalidToken")} prefs={prefs}>
        {t("live.invalidTokenBody")}
      </Gate>
    );
  }
  if (!poll) {
    return (
      <Gate title={t("live.joining")} prefs={prefs}>
        {t("live.opening")}
      </Gate>
    );
  }

  const total = poll.options.reduce((sum, o) => sum + o.votes, 0);
  const leader = poll.options.reduce(
    (best, o) => (o.votes > best ? o.votes : best),
    0,
  );
  const secondsLeft = poll.closesAt
    ? Math.max(0, Math.round((poll.closesAt - now) / 1000))
    : null;
  const locked = poll.closed || readonly;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <section className="w-full max-w-xl animate-fade-up">
        <header className="mb-5 flex items-center gap-2">
          <Radio
            className={cn(
              "size-4",
              poll.closed ? "text-muted-foreground" : "text-primary",
            )}
          />
          <span className="text-sm font-semibold">{t("live.title")}</span>
          {readonly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Eye className="size-3" />
              {t("live.spectator")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {prefs}
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              {poll.closed ? (
                <>
                  <Lock className="size-3" />
                  {t("live.closed")}
                </>
              ) : (
                <>
                  <Timer className="size-3" />
                  {formatCountdown(secondsLeft)}
                </>
              )}
            </span>
          </div>
        </header>

        <h1 className="text-lg font-semibold leading-snug">{poll.question}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {total === 1
            ? t("live.voteOne", { n: total })
            : t("live.voteMany", { n: total })}
        </p>

        <ul className="mt-4 space-y-2">
          {poll.options.map((option) => {
            const share = total === 0 ? 0 : (option.votes / total) * 100;
            const winning = option.votes > 0 && option.votes === leader;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={locked || pending}
                  onClick={() => void run(() => agent.stub.vote(option.id))}
                  className={cn(
                    "paper-inset relative w-full overflow-hidden px-3 py-2.5 text-left transition-colors",
                    "hover:border-primary/50 disabled:cursor-not-allowed disabled:hover:border-border",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 transition-[width] duration-500",
                      winning ? "bg-primary/15" : "bg-foreground/5",
                    )}
                    style={{ width: `${share}%` }}
                  />
                  <span className="relative flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {option.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {Math.round(share)}%
                    </span>
                    <span className="w-8 text-right font-mono text-xs">
                      {option.votes}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const label = draftOption;
            void run(() => agent.stub.addOption(label)).then((ok) => {
              if (ok) setDraftOption("");
            });
          }}
        >
          <Input
            value={draftOption}
            disabled={locked || pending}
            maxLength={60}
            placeholder={t("live.addPlaceholder")}
            onChange={(event) => setDraftOption(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={locked || pending || !draftOption.trim()}
          >
            <Plus className="size-3.5" />
            {t("live.add")}
          </Button>
        </form>

        {notice && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {notice}
          </p>
        )}

        <footer className="mt-5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {poll.recentCities.length > 0
              ? t("live.votingFrom", { cities: poll.recentCities.join(" · ") })
              : t("live.noVotes")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={readonly || pending}
            onClick={() => void run(() => agent.stub.reset())}
          >
            <RotateCcw className="size-3.5" />
            {t("live.reset")}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function Gate({
  title,
  children,
  prefs,
}: {
  title: string;
  children: React.ReactNode;
  prefs?: ReactNode;
}) {
  return (
    <div className="relative flex h-full items-center justify-center p-6">
      {prefs ? (
        <div className="absolute right-3 top-3 z-10">{prefs}</div>
      ) : null}
      <div className="paper-inset max-w-md px-5 py-4 text-center animate-fade-up">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
