// ─────────────────────────────────────────────────────────────────────────
// App — main shell
// ─────────────────────────────────────────────────────────────────────────
//
// Layout: two columns, full viewport.
//   Left  — <Chat>                       (messages + input)
//   Right — Tabs over 9 panels          (one panel visible at a time)
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

import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import type { MCPServersState } from "agents";
import { DEFAULT_INSTANCE_NAME } from "@/lib/agent-identity";
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
} from "lucide-react";

import type { ChatAgent, State } from "../worker/chat-agent";
import type {
  ChatSettings,
  ChatSettingsPatch,
  ContentLang,
} from "../worker/chat-agent/settings";
import { Chat } from "@/chat/Chat";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

import { MemoryPanel } from "@/panels/MemoryPanel";
import { SkillsPanel } from "@/panels/SkillsPanel";
import { FilesPanel } from "@/panels/FilesPanel";
import { ToolsPanel } from "@/panels/ToolsPanel";
import { SchedulesPanel } from "@/panels/SchedulesPanel";
import { SourcesPanel } from "@/panels/SourcesPanel";
import { BrowserPanel } from "@/panels/BrowserPanel";
import { ExtensionsPanel } from "@/panels/ExtensionsPanel";
import { McpPanel, type McpServerView } from "@/panels/McpPanel";
import { SettingsPanel } from "@/panels/SettingsPanel";

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
  { value: "memory", label: "Memory", icon: Brain },
  { value: "skills", label: "Skills", icon: BookOpen },
  { value: "files", label: "Files", icon: FolderTree },
  { value: "tools", label: "Tools", icon: Wrench },
  { value: "sources", label: "Sources", icon: FileUp },
  { value: "browser", label: "Browser", icon: Globe },
  { value: "schedules", label: "Schedules", icon: Clock },
  { value: "extensions", label: "Extensions", icon: Puzzle },
  { value: "mcp", label: "MCP", icon: Plug },
  { value: "settings", label: "Settings", icon: Settings2 },
] as const;

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
            error instanceof Error ? error.message : "Failed to load settings.",
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
          error instanceof Error ? error.message : "Failed to update settings.",
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

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="relative isolate flex h-full overflow-hidden">
      {/* LEFT — chat */}
      <main className="flex min-w-0 flex-1 flex-col animate-fade-up [animation-delay:120ms]">
        <Chat
          agent={agent}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          onReset={() => void agent.stub.resetSession()}
        />
      </main>

      {/* RIGHT — tabbed panels */}
      <aside className="hidden w-105 shrink-0 border-l border-border bg-card md:flex md:flex-col animate-fade-up [animation-delay:200ms]">
        <Tabs defaultValue="memory" className="flex h-full flex-col">
          <TabsList className="shrink-0 px-2 pt-2">
            {PANELS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                <p.icon className="size-3.5" />
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="memory">
            <MemoryPanel
              memory={state.memory}
              onClear={() => agent.stub.clearMemory()}
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
            />
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
