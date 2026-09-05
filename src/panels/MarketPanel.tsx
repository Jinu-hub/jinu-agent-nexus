// ─────────────────────────────────────────────────────────────────────────
// MarketPanel — Market Memory brief + voice for a Seoul market_date
// ─────────────────────────────────────────────────────────────────────────
// Fetches existing HTTP APIs (no ChatAgent State). Language comes from
// Settings content_lang — independent of chat reply language.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  LoaderCircle,
  Newspaper,
  RefreshCw,
  Volume2,
} from "lucide-react";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./PanelHeader";

type BriefItem = {
  id: string;
  title: string | null;
  content: string | null;
  brief_type: string;
  content_type: string;
  lang_code: string;
  status: string;
  market_date: string | null;
  metadata: unknown;
};

type VoiceItem = {
  id: string;
  title: string | null;
  duration_seconds: number | null;
  lang_code: string;
  status: string;
  market_date: string | null;
};

type BriefResponse = {
  ok: boolean;
  found?: boolean;
  marketDate?: string;
  lang?: string;
  item?: BriefItem | null;
  message?: string;
};

type VoiceResponse = {
  ok: boolean;
  found?: boolean;
  marketDate?: string;
  lang?: string;
  playPath?: string | null;
  item?: VoiceItem | null;
  message?: string;
};

function seoulYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return seoulYmd(anchor);
}

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function MarketPanel({
  contentLang,
}: {
  contentLang: ContentLang | null;
}) {
  const lang = contentLang ?? "ko";
  const [date, setDate] = useState(() => seoulYmd());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [voice, setVoice] = useState<VoiceResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (marketDate: string, marketLang: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        date: marketDate,
        lang: marketLang,
      });
      const [briefRes, voiceRes] = await Promise.all([
        fetch(`/api/briefs/today?${qs}`),
        fetch(`/api/audio/today?${qs}`),
      ]);
      const briefJson = (await briefRes.json()) as BriefResponse;
      const voiceJson = (await voiceRes.json()) as VoiceResponse;

      if (!briefRes.ok && !briefJson.ok) {
        throw new Error(briefJson.message || `briefs HTTP ${briefRes.status}`);
      }
      if (!voiceRes.ok && !voiceJson.ok) {
        throw new Error(voiceJson.message || `audio HTTP ${voiceRes.status}`);
      }

      setBrief(briefJson);
      setVoice(voiceJson);
    } catch (err) {
      setBrief(null);
      setVoice(null);
      setError(err instanceof Error ? err.message : "Failed to load Market Memory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date, lang);
  }, [date, lang, load]);

  const briefItem = brief?.found ? brief.item : null;
  const voiceItem = voice?.found ? voice.item : null;
  const playPath =
    voice?.found && typeof voice.playPath === "string" ? voice.playPath : null;

  const copyBrief = async () => {
    if (!briefItem?.content) return;
    const text = [briefItem.title, briefItem.content].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard copy failed");
    }
  };

  const pulse = metaString(briefItem?.metadata, "pulse");
  const takeaway = metaString(briefItem?.metadata, "takeaway");

  return (
    <section>
      <PanelHeader
        icon={Newspaper}
        title="Market"
        trailing={
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {lang}
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(date, lang)}
              className={cn(
                "rounded-md p-1 text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
            </button>
          </div>
        }
      />

      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          disabled={loading}
          onClick={() => setDate((d) => shiftYmd(d, -1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date}
          disabled={loading}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5",
            "font-mono text-xs tabular-nums",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50",
          )}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => setDate((d) => shiftYmd(d, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={loading || date === seoulYmd()}
          onClick={() => setDate(seoulYmd())}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] text-muted-foreground",
            "hover:bg-accent hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          Today
        </button>
      </div>

      <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
        Language follows Settings → Market content language. Not chat reply
        language.
      </p>

      {loading && !brief && !voice ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {/* Voice first — play without scrolling past long text */}
          <div className="paper-inset px-3 py-2.5">
            <div className="mb-2 flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium">Voice</p>
            </div>
            {voiceItem && playPath ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-snug text-foreground">
                  {voiceItem.title ?? "Voice briefing"}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {voiceItem.duration_seconds != null
                    ? `${voiceItem.duration_seconds}s`
                    : "—"}
                  {" · "}
                  {voiceItem.lang_code}
                </p>
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
            ) : (
              <p className="text-[11px] italic text-muted-foreground">
                No completed voice for {date} / {lang}.
              </p>
            )}
          </div>

          <div className="paper-inset px-3 py-2.5">
            <div className="mb-2 flex items-center gap-1.5">
              <Newspaper className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium">Brief</p>
              {briefItem?.content && (
                <button
                  type="button"
                  onClick={() => void copyBrief()}
                  className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Copy title + content"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
            {briefItem ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium leading-snug">
                  {briefItem.title ?? "Untitled brief"}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {briefItem.brief_type} · {briefItem.lang_code} ·{" "}
                  {briefItem.status}
                </p>
                {(pulse || takeaway) && (
                  <div className="space-y-1 rounded-md bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {pulse && (
                      <p>
                        <span className="font-medium text-foreground">
                          Pulse:{" "}
                        </span>
                        {pulse}
                      </p>
                    )}
                    {takeaway && (
                      <p>
                        <span className="font-medium text-foreground">
                          Takeaway:{" "}
                        </span>
                        {takeaway}
                      </p>
                    )}
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
                  {briefItem.content}
                </div>
              </div>
            ) : (
              <p className="text-[11px] italic text-muted-foreground">
                No final brief for {date} / {lang}.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
