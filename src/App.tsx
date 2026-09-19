// ─────────────────────────────────────────────────────────────────────────
// App — main shell
// ─────────────────────────────────────────────────────────────────────────
//
// Layout: three columns, full viewport.
//   Left   — <ChatHelperRail>            (Topics + Ask prompts; xl+ dock)
//   Center — <Chat>                      (messages + input)
//   Right  — Tabs over panels            (one panel visible at a time)
//
// The agent connection lives here. We pass it down to <Chat> for chat
// I/O, and read `agent.state` to power the right-side panels.
//
// HOW TO ADD A PANEL:
//   1. Create a new file under `src/panels/MyPanel.tsx` — copy any
//      existing one as a template (PanelHeader at the top, state in
//      via props, callable actions in via props).
//   2. If the panel needs a new piece of agent state, extend `State`
//      in worker/chat-agent.ts and populate it inside `refreshAll()`.
//   3. Add a new <TabsTrigger> + <TabsContent> entry in this file's
//      PANELS array below.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { MCPServersState } from "agents";
import { DEFAULT_INSTANCE_NAME } from "@/lib/agent-identity";
import { cn } from "@/lib/utils";
import {
  Brain,
  BookOpen,
  FolderTree,
  Wrench,
  Clock,
  FileUp,
  Globe,
  Puzzle,
  Plug,
  Settings2,
  Newspaper,
  X,
} from "lucide-react";

import type { ChatAgent, State } from "../worker/chat-agent";
import type {
  ChatSettings,
  ChatSettingsPatch,
  ContentLang,
  ToggleablePanel,
} from "../worker/chat-agent/settings";
import { isToggleablePanel } from "../worker/chat-agent/settings";
import { Chat } from "@/chat/Chat";
import { ChatHelperRail } from "@/chat/ChatHelperRail";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { MemoryPanel } from "@/panels/MemoryPanel";
import { MarketPanel } from "@/panels/MarketPanel";
import { SkillsPanel } from "@/panels/SkillsPanel";
import { FilesPanel } from "@/panels/FilesPanel";
import { ToolsPanel } from "@/panels/ToolsPanel";
import { SchedulesPanel } from "@/panels/SchedulesPanel";
import { SourcesPanel } from "@/panels/SourcesPanel";
import { BrowserPanel } from "@/panels/BrowserPanel";
import { ExtensionsPanel } from "@/panels/ExtensionsPanel";
import { McpPanel, type McpServerView } from "@/panels/McpPanel";
import { SettingsPanel } from "@/panels/SettingsPanel";
import { UiLangConsumer, UiLangProvider, translate } from "@/i18n/ui-lang";
import type { MessageKey } from "@/i18n/messages";

const INITIAL_STATE: State = {
  files: [],
  memory: { content: "", tokens: 0, maxTokens: 0 },
  skills: { listing: "", loaded: [] },
  schedules: [],
  tools: [],
  sources: [],
  extensions: [],
};

// ─── Tab registry ────────────────────────────────────────────────────────
// Order here is the order in the tab strip. Extend this array to add a
// new tab. The value strings are arbitrary — they just have to match
// between trigger and content.
const PANELS = [
  { value: "market", labelKey: "panels.market" as const, icon: Newspaper },
  { value: "memory", labelKey: "panels.memory" as const, icon: Brain },
  { value: "skills", labelKey: "panels.skills" as const, icon: BookOpen },
  { value: "files", labelKey: "panels.files" as const, icon: FolderTree },
  { value: "tools", labelKey: "panels.tools" as const, icon: Wrench },
  { value: "sources", labelKey: "panels.sources" as const, icon: FileUp },
  { value: "browser", labelKey: "panels.browser" as const, icon: Globe },
  { value: "schedules", labelKey: "panels.schedules" as const, icon: Clock },
  { value: "extensions", labelKey: "panels.extensions" as const, icon: Puzzle },
  { value: "mcp", labelKey: "panels.mcp" as const, icon: Plug },
  { value: "settings", labelKey: "panels.settings" as const, icon: Settings2 },
] as const satisfies ReadonlyArray<{
  value: string;
  labelKey: MessageKey;
  icon: typeof Newspaper;
}>;

export default function App() {
  // ─── Live View URL (from broadcast) ────────────────────────────────────
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);

  // ─── MCP server snapshot (from cf_agent_mcp_servers protocol msg) ──────
  const [mcpServers, setMcpServers] = useState<McpServerView[]>([]);

  // ─── ChatAgent runtime settings (persisted in the DO SQLite) ────────────
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsUpdating, setSettingsUpdating] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("market");
  /** Below lg the panel column is a drawer; lg+ it stays docked. */
  const [panelOpen, setPanelOpen] = useState(false);
  /** Below xl the helper rail is a drawer; xl+ it stays docked. */
  const [helperOpen, setHelperOpen] = useState(false);

  // ─── Theme toggle (lives in localStorage so it survives refresh) ───────
  // The matching inline script in index.html sets the `dark` class on
  // <html> before React mounts so there's no theme flash. We mirror its
  // logic here so React's view of the theme stays in sync.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Market panel → left chat example prompts
  const [pendingAsk, setPendingAsk] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const askInChat = useCallback((prompt: string) => {
    setPendingAsk({ text: prompt, nonce: Date.now() });
  }, []);

  // ─── Agent connection ──────────────────────────────────────────────────
  // `useAgent<ChatAgent, State>` gives us a fully typed RPC stub
  // (`agent.stub.method()`) plus live state syncing via WebSocket.
  //
  // Both callbacks below are wrapped in useCallback with EMPTY deps.
  // The hook captures these by reference at mount, and re-creating
  // them on every render would make the underlying socket think the
  // subscription changed — leading to duplicate WebSocket
  // subscribers, which manifests as duplicate React keys in the
  // message list and double-rendered assistant replies on every tool
  // call. We update state via setters, which are stable across
  // renders, so empty deps are correct here.

  // Broadcast handler — out-of-band messages (live_view, source_added,
  // etc.) come through here as JSON strings.
  const onMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "live_view") {
        setLiveViewUrl(msg.url ?? null);
      }
    } catch {
      // Not JSON — agents SDK heartbeats etc. Ignore.
    }
  }, []);

  // MCP state changes (connect, disconnect, OAuth flow) come through
  // a separate protocol channel.
  const onMcpUpdate = useCallback((mcp: MCPServersState) => {
    const list = Object.entries(mcp.servers).map(([id, s]) => ({
      id,
      name: s.name,
      server_url: s.server_url,
      state: s.state,
      auth_url: s.auth_url,
    }));
    setMcpServers(list);
  }, []);

  const agent = useAgent<ChatAgent, State>({
    agent: "ChatAgent",
    name: DEFAULT_INSTANCE_NAME,
    onMessage,
    onMcpUpdate,
  });

  useEffect(() => {
    let active = true;
    void agent.stub
      .getSettings()
      .then((nextSettings) => {
        if (active) setSettings(nextSettings);
      })
      .catch((error: unknown) => {
        if (active) {
          setSettingsError(
            error instanceof Error
              ? error.message
              : translate("ko", "settings.loadFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [agent.stub]);

  const updateSettings = useCallback(
    async (patch: ChatSettingsPatch) => {
      setSettingsUpdating(true);
      setSettingsError(null);
      try {
        setSettings(await agent.stub.updateSettings(patch));
      } catch (error) {
        setSettingsError(
          error instanceof Error
            ? error.message
            : translate(settings?.content_lang ?? "ko", "settings.updateFailed"),
        );
      } finally {
        setSettingsUpdating(false);
      }
    },
    [agent.stub],
  );

  // Backfill the Live View URL on mount, in case the agent already had
  // a browser open from a previous session.
  useEffect(() => {
    void agent.stub.fetchLiveView().then((url) => {
      if (url) setLiveViewUrl(url);
    });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = agent.state ?? INITIAL_STATE;

  const hiddenPanels = new Set(settings?.hidden_panels ?? []);
  const visiblePanels = PANELS.filter(
    (p) => p.value === "settings" || !hiddenPanels.has(p.value),
  );

  useEffect(() => {
    const hidden = new Set(settings?.hidden_panels ?? []);
    const stillVisible =
      activeTab === "settings" ||
      !isToggleablePanel(activeTab) ||
      !hidden.has(activeTab);
    if (stillVisible) return;
    setActiveTab(hidden.has("market") ? "settings" : "market");
  }, [activeTab, settings?.hidden_panels]);

  const togglePanelVisibility = useCallback(
    async (panel: ToggleablePanel, visible: boolean) => {
      const current = settings?.hidden_panels ?? [];
      const nextHidden = visible
        ? current.filter((id) => id !== panel)
        : current.includes(panel)
          ? current
          : [...current, panel];
      await updateSettings({ hidden_panels: nextHidden });
    },
    [settings?.hidden_panels, updateSettings],
  );

  const toggleReportSeries = useCallback(
    async (slugs: string[], enabled: boolean) => {
      if (slugs.length === 0) return;
      const current = settings?.disabled_report_series ?? [];
      const slugSet = new Set(slugs);
      const nextDisabled = enabled
        ? current.filter((id) => !slugSet.has(id))
        : Array.from(new Set([...current, ...slugs]));
      await updateSettings({ disabled_report_series: nextDisabled });
    },
    [settings?.disabled_report_series, updateSettings],
  );

  const marketFocusSeriesRef = useRef(settings?.market_focus_series_id ?? "");
  marketFocusSeriesRef.current = settings?.market_focus_series_id ?? "";

  const onMarketFocusSeriesChange = useCallback(
    (seriesId: string) => {
      const id = seriesId.trim();
      if (!id || marketFocusSeriesRef.current === id) return;
      marketFocusSeriesRef.current = id;
      void updateSettings({ market_focus_series_id: id });
    },
    [updateSettings],
  );

  useEffect(() => {
    if (!panelOpen && !helperOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (helperOpen) setHelperOpen(false);
      else setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, helperOpen]);

  const openHelper = useCallback(() => {
    setPanelOpen(false);
    setHelperOpen(true);
  }, []);
  const openPanels = useCallback(() => {
    setHelperOpen(false);
    setPanelOpen(true);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <UiLangProvider lang={settings?.content_lang ?? "ko"}>
      <UiLangConsumer>
        {(t) => (
    <div className="relative isolate flex h-full overflow-hidden">
      {/* Scrim — helper drawer below xl */}
      {helperOpen ? (
        <button
          type="button"
          aria-label={t("shell.closeHelper")}
          className="fixed inset-0 z-20 bg-foreground/20 xl:hidden"
          onClick={() => setHelperOpen(false)}
        />
      ) : null}

      {/* LEFT — Topics + Ask (docked xl+; drawer overlay below) */}
      <aside
        className={cn(
          "flex flex-col border-border bg-card animate-fade-up",
          "max-xl:fixed max-xl:inset-y-0 max-xl:left-0 max-xl:z-30",
          "max-xl:w-full max-xl:max-w-80 max-xl:border-r max-xl:shadow-2xl",
          helperOpen ? "max-xl:flex" : "max-xl:hidden",
          "xl:relative xl:flex xl:h-full xl:w-80 xl:shrink-0 xl:border-r",
        )}
      >
        <ChatHelperRail
          contentLang={settings?.content_lang ?? null}
          disabledReportSeries={settings?.disabled_report_series ?? []}
          marketFocusSeriesId={settings?.market_focus_series_id ?? null}
          onAskInChat={askInChat}
          onMarketFocusSeriesChange={onMarketFocusSeriesChange}
          onClose={() => setHelperOpen(false)}
        />
      </aside>

      {/* CENTER — chat */}
      <main className="flex min-w-0 flex-1 flex-col animate-fade-up [animation-delay:120ms]">
        <Chat
          agent={agent}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          onReset={() => void agent.stub.resetSession()}
          pendingAsk={pendingAsk}
          onPendingAskConsumed={() => setPendingAsk(null)}
          panelOpen={panelOpen}
          onTogglePanels={() =>
            panelOpen ? setPanelOpen(false) : openPanels()
          }
          helperOpen={helperOpen}
          onToggleHelper={() =>
            helperOpen ? setHelperOpen(false) : openHelper()
          }
        />
      </main>

      {/* Scrim — only while the drawer is open below lg */}
      {panelOpen ? (
        <button
          type="button"
          aria-label={t("panels.close")}
          className="fixed inset-0 z-20 bg-foreground/20 lg:hidden"
          onClick={() => setPanelOpen(false)}
        />
      ) : null}

      {/* RIGHT — tabbed panels (docked lg+; drawer overlay below) */}
      <aside
        className={cn(
          "flex flex-col border-border bg-card animate-fade-up [animation-delay:200ms]",
          "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30",
          "max-lg:w-full max-lg:max-w-105 max-lg:border-l max-lg:shadow-2xl",
          panelOpen ? "max-lg:flex" : "max-lg:hidden",
          "lg:relative lg:flex lg:w-105 lg:shrink-0 lg:border-l",
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full flex-col"
        >
          <div className="flex shrink-0 items-start gap-0.5 pr-1.5 pt-2">
            <TabsList className="min-w-0 flex-1 px-2 pt-0">
              {visiblePanels.map((p) => (
                <TabsTrigger key={p.value} value={p.value}>
                  <p.icon className="size-3.5" />
                  {t(p.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              size="sm"
              variant="ghost"
              className="mt-0.5 shrink-0 lg:hidden"
              onClick={() => setPanelOpen(false)}
              title={t("panels.close")}
              aria-label={t("panels.close")}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <TabsContent value="memory">
            <MemoryPanel
              memory={state.memory}
              onClear={() => agent.stub.clearMemory()}
            />
          </TabsContent>

          <TabsContent value="market">
            <MarketPanel
              contentLang={settings?.content_lang ?? null}
              disabledReportSeries={settings?.disabled_report_series ?? []}
              marketFocusSeriesId={settings?.market_focus_series_id ?? null}
              onAskInChat={askInChat}
              onMarketFocusSeriesChange={onMarketFocusSeriesChange}
            />
          </TabsContent>

          <TabsContent value="skills">
            <SkillsPanel skills={state.skills} />
          </TabsContent>

          <TabsContent value="files">
            <FilesPanel
              files={state.files}
              onRead={(path) => agent.stub.readWorkspaceFile(path)}
              onClear={async () => {
                await agent.stub.clearWorkspace();
              }}
            />
          </TabsContent>

          <TabsContent value="tools">
            <ToolsPanel tools={state.tools} />
          </TabsContent>

          <TabsContent value="sources">
            <SourcesPanel
              sources={state.sources}
              onDelete={async (s) => {
                await agent.stub.deleteSource(s);
              }}
              onClear={async () => {
                await agent.stub.deleteAllSources();
              }}
            />
          </TabsContent>

          <TabsContent value="browser">
            <BrowserPanel
              liveViewUrl={liveViewUrl}
              onClose={async () => {
                setLiveViewUrl(null);
                await agent.stub.closeBrowser();
              }}
            />
          </TabsContent>

          <TabsContent value="schedules">
            <SchedulesPanel
              schedules={state.schedules}
              onCancel={async (id) => {
                await agent.stub.cancelScheduleById(id);
              }}
              onClear={async () => {
                await agent.stub.clearAllSchedules();
              }}
            />
          </TabsContent>

          <TabsContent value="extensions">
            <ExtensionsPanel
              extensions={state.extensions}
              onUnload={async (name) => {
                await agent.stub.unloadExtension(name);
              }}
            />
          </TabsContent>

          <TabsContent value="mcp">
            <McpPanel
              servers={mcpServers}
              onConnect={async (name, url) => {
                await agent.stub.connectMcpServer(name, url);
              }}
              onDisconnect={async (id) => {
                await agent.stub.disconnectMcpServer(id);
              }}
              onClear={async () => {
                await agent.stub.disconnectAllMcp();
              }}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel
              settings={settings}
              loading={settingsLoading}
              updating={settingsUpdating}
              error={settingsError}
              onToggleAlarm={(enabled) =>
                updateSettings({ alarm_enabled: enabled })
              }
              onToggleCleanup={(enabled) =>
                updateSettings({ message_cleanup_enabled: enabled })
              }
              onContentLangChange={(lang: ContentLang) =>
                updateSettings({ content_lang: lang })
              }
              onTogglePanelVisibility={togglePanelVisibility}
              onToggleReportSeries={toggleReportSeries}
            />
          </TabsContent>
        </Tabs>
      </aside>
    </div>
        )}
      </UiLangConsumer>
    </UiLangProvider>
  );
}
