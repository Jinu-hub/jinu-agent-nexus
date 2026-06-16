// ─────────────────────────────────────────────────────────────────────────
// ChatAgent — the brain of the boilerplate
// ─────────────────────────────────────────────────────────────────────────
//
// Extends `Think`, which itself extends `AIChatAgent`, which extends
// `Agent`, which IS a Durable Object. Through that chain we get for free:
//
//   • Chat protocol over WebSocket  (Think → AIChatAgent)
//   • Message persistence + branching
//   • Streaming responses + abort + resumable streams
//   • Crash recovery via fibers  (chatRecovery = true by default)
//   • Built-in workspace tools — read/write/edit/list/find/grep/delete
//     (a virtual filesystem in SQLite)
//   • Session-based memory with compaction + FTS5 search
//   • Schedule / queue / retry primitives
//   • SQL storage scoped to this DO instance
//   • Multi-tab state sync via setState() → onStateChanged
//
// Everything below is just CONFIGURATION + a few additional tools and
// @callable methods for the panels in the frontend.
//
// ── Where you'd extend this file ────────────────────────────────────────
//   • Add a tool          → see `getTools()` below (and worker/tools/)
//   • Change the model    → worker/ai.ts
//   • Change the prompt   → `configureSession` → "soul" context block
//   • Add a panel mirror  → extend `State`, populate in `refreshAll()`
//   • Add a callable RPC  → add an `@callable() async method() {...}`
// ─────────────────────────────────────────────────────────────────────────

import { Think, type Session } from "@cloudflare/think";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { R2SkillProvider } from "agents/experimental/memory/session";
import {
  type ToolSet,
  type LanguageModel,
  embedMany,
} from "ai";
import { callable } from "agents";
import type { ChatResponseResult } from "agents/chat";
import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";

import { chunkMarkdown } from "./ingest";
import { createModel, createEmbedder } from "./ai";

// Tool factories — one file per tool. See worker/tools/ for the
// patterns (server-side / client-side / approval).
import { createGetCurrentTimeTool } from "./tools/getCurrentTime";
import { createGetWeatherTool } from "./tools/getWeather";
import { createGetUserTimezoneTool } from "./tools/getUserTimezone";
import { createSendNotificationTool } from "./tools/sendNotification";
import { createSetReminderTool } from "./tools/setReminder";
import { createRecallTool } from "./tools/recall";
import { createNavigateTool } from "./tools/navigate";
import { createScreenshotTool } from "./tools/screenshot";

// ─── Types mirrored to the frontend ──────────────────────────────────────
// Each panel reads from a slice of `state`. The state shape lives here
// and is imported by the React side, so changes to the shape get
// type-checked across the boundary.

export type FileEntry = {
  path: string;
  type: "file" | "directory";
  size: number;
  updatedAt: number;
};

export type MemoryView = {
  content: string;
  tokens: number;
  maxTokens: number;
};

export type SkillsView = {
  listing: string;
  loaded: string[];
};

export type ScheduleView = {
  id: string;
  callback: string;
  type: "scheduled" | "delayed" | "cron" | "interval";
  time: number;
  detail?: string;
  payload?: unknown;
};

export type ToolView = {
  name: string;
  // The bucket the tool comes from — used by the Tools panel to group:
  //   * custom    — defined in getTools() below
  //   * workspace — built-in Think workspace tools (read/write/etc.)
  //   * session   — set_context / load_context / unload_context
  //   * extension — runtime-loaded tool (via load_extension)
  //   * mcp       — pulled in from a connected MCP server
  source: "custom" | "workspace" | "session" | "extension" | "mcp";
  description?: string;
};

export type Source = { source: string; kind: "pdf" };

export type ExtensionView = {
  name: string;
  version: string;
  description?: string;
  tools: string[];
};

export type State = {
  files: FileEntry[];
  memory: MemoryView;
  skills: SkillsView;
  schedules: ScheduleView[];
  tools: ToolView[];
  sources: Source[];
  extensions: ExtensionView[];
};

// ─── Constants ───────────────────────────────────────────────────────────

const EMPTY_MEMORY: MemoryView = { content: "", tokens: 0, maxTokens: 0 };
const EMPTY_SKILLS: SkillsView = { listing: "", loaded: [] };
const SKILLS_LABEL = "skills";

// Static tool entries — these are always present, so the Tools panel
// can show them without extra runtime introspection.
const WORKSPACE_TOOLS: ToolView[] = [
  { name: "read", source: "workspace" },
  { name: "write", source: "workspace" },
  { name: "edit", source: "workspace" },
  { name: "list", source: "workspace" },
  { name: "find", source: "workspace" },
  { name: "grep", source: "workspace" },
  { name: "delete", source: "workspace" },
];
const SESSION_TOOLS: ToolView[] = [
  { name: "set_context", source: "session" },
  { name: "load_context", source: "session" },
  { name: "unload_context", source: "session" },
];

// ═════════════════════════════════════════════════════════════════════════
// ChatAgent
// ═════════════════════════════════════════════════════════════════════════
export class ChatAgent extends Think<Env, State> {
  initialState: State = {
    files: [],
    memory: EMPTY_MEMORY,
    skills: EMPTY_SKILLS,
    schedules: [],
    tools: [],
    sources: [],
    extensions: [],
  };

  // Setting `extensionLoader` is the entire opt-in for runtime
  // extensions. Think sees this on the instance and instantiates an
  // ExtensionManager bound to the `worker_loaders` binding. The LLM
  // can then write its own tools mid-conversation via `load_extension`
  // and they become callable on the next turn.
  extensionLoader = this.env.LOADER;

  // Cap the agentic loop. Default in Think is 10 — fine for a model
  // that reliably stops emitting text once a tool result satisfies
  // the user's request. Smaller models (the @cf/zai-org/glm-4.7-flash
  // default in this boilerplate) tend to keep "acknowledging" after
  // every tool call, producing 2-3 redundant text bubbles per turn.
  // Capping at 3 gives room for: (1) one text + tool, (2) one
  // continuation, (3) one final cleanup. If you switch to a bigger
  // model (Llama 3.3 70B, Claude, GPT-4.1), raise this back to 10.
  override maxSteps = 3;

  // chatRecovery wraps every turn in a runFiber so a crashed worker
  // can resume the stream. In dev with frequent wrangler restarts /
  // HMR, an interrupted turn can replay alongside a new send and
  // produce ghost responses. Turning it OFF for the boilerplate;
  // re-enable in production where the worker stays up.
  override chatRecovery = false;

  // Browser session — held across tool calls so navigate + screenshot
  // operate on the same Chrome tab. Lazily created in `getPage()`.
  // Public so tool factories in worker/tools/ can reach in.
  browser?: Browser;
  page?: Page;

  // ─── Model wiring ──────────────────────────────────────────────────────
  getModel(): LanguageModel {
    return createModel(this.env);
  }

  // ─── Session: prompt + memory + skills ─────────────────────────────────
  // Think doesn't have a single "system prompt" field. Instead, you wire
  // up CONTEXT BLOCKS — pieces of the prompt that come from different
  // providers and are reassembled on every turn:
  //
  //   * "soul"   — your fixed persona / policy text (always present)
  //   * "memory" — writable memory (the model uses set_context to
  //                add/replace entries)
  //   * "skills" — on-demand documents loaded from R2 via R2SkillProvider
  //                (the model uses load_context / unload_context)
  //
  // The block labels are arbitrary. Add new blocks here to expose new
  // surfaces to the model.
  configureSession(session: Session) {
    return session
      .withContext("soul", {
        provider: {
          get: async () =>
            `You are a helpful AI assistant running on Cloudflare Agents.

You have access to:
  * Tools — short, well-named server / client / approval tools.
  * Memory — durable facts about the user. Use the set_context tool to
    save anything the user explicitly tells you to remember, plus any
    durable preferences, constraints, or identity facts you notice. Keep
    each entry terse and factual.
  * Skills — reference documents (markdown) the user has stocked in R2.
    Use load_context whenever a question would benefit from one;
    unload_context when the topic shifts.
  * Sources — PDFs the user uploaded. Use the \`recall\` tool to search
    them whenever a question might be answered by an ingested document.
    Cite the source name in your answer.
  * Workspace — a virtual filesystem (this.workspace). Use it to draft
    notes, save artifacts, or organise long-form output for the user.
  * Browser — \`navigate\` to open a URL, \`screenshot\` only when the
    user explicitly asks for one. The user can see the live Chrome tab.
  * Extensions — you can write your OWN tools at runtime via
    load_extension. Use this when the user asks for a capability you
    don't have. Extensions run in a NETWORK-ISOLATED sandbox — no
    fetch, no I/O — so use them for pure computation only.

TOOL-CALL ETIQUETTE — these rules are STRICT, follow them exactly:

  RULE 1 — NEVER mix text and tool calls in the same step.
    Each step must be EITHER text OR tool calls, never both.
    Wrong:  "Got it! Let me save that…" + set_context()
    Right:  set_context()   (silent step, no text)
            (next step)  "Got it!"  (text step, no tools)

  RULE 2 — Tool calls are SILENT. No preamble.
    Do not write "Let me save that…", "I'll remember…", "One moment
    while I check…", or any other narration of what you're about to do.
    Just call the tool.

  RULE 3 — After a tool returns, write the answer ONCE.
    Do not rephrase or expand what you would have said without the
    tool. Output ONE coherent response covering all the new
    information the tool gave you.

  RULE 4 — Internal-bookkeeping tools (set_context, load_context,
    unload_context, list_extensions) should be invoked silently as
    your first action of the turn, then immediately followed by the
    user-facing answer. Do not write a "Done!" acknowledgment for them.

Be concise. Prefer calling tools over guessing. Cite sources when you
recalled from one.`,
        },
      })
      .withContext("memory", {
        description:
          "Durable facts about the user — preferences, constraints, identity, recurring context.",
        maxTokens: 1100,
      })
      .withContext(SKILLS_LABEL, {
        description:
          "Reference documents available on demand. Use load_context to pull one in when relevant; unload_context when done.",
        provider: new R2SkillProvider(this.env.BUCKET, { prefix: "skills/" }),
      })
      .withCachedPrompt();
  }

  // ─── Tools ─────────────────────────────────────────────────────────────
  // HOW TO ADD A NEW TOOL:
  //   1. Drop a new file under `worker/tools/` exporting a factory
  //      function. Copy the closest existing file (server / client /
  //      approval) as a template.
  //   2. Import the factory at the top of this file.
  //   3. Register it in the object below. The KEY is what the LLM sees
  //      as the tool name — keep it short, snake_case or camelCase.
  override getTools(): ToolSet {
    return {
      getCurrentTime: createGetCurrentTimeTool(),
      getWeather: createGetWeatherTool(),
      getUserTimezone: createGetUserTimezoneTool(),
      sendNotification: createSendNotificationTool(),
      setReminder: createSetReminderTool(this),
      recall: createRecallTool(this, this.env),
      navigate: createNavigateTool(this),
      screenshot: createScreenshotTool(this, this.env),

      // load_extension + list_extensions — the management tools for
      // runtime extensions. The actual tools each loaded extension
      // provides are auto-merged by Think internally, so we don't have
      // to register them here.
      ...(this.extensionManager
        ? createExtensionTools({ manager: this.extensionManager })
        : {}),
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────
  override async onStart() {
    // Idempotent schema. Runs on every wake-up — CREATE TABLE IF NOT
    // EXISTS makes it a no-op after the first run.
    void this.sql`CREATE TABLE IF NOT EXISTS documents (
      source TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      r2_key TEXT
    )`;
    void this.sql`CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      text TEXT NOT NULL
    )`;

    // Hydrate the session context blocks (skills listing, memory) on
    // cold start. Without this, the sidebar panels stay empty until
    // the first chat turn forces a refresh.
    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  override async onChatResponse(_result: ChatResponseResult) {
    // After every chat turn, re-pull all panel state. Memory may have
    // changed (set_context), skills may have toggled (load_context),
    // tools may have grown (load_extension), workspace may have new
    // files (write), schedules may have been added (setReminder)…
    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  // ─── Panel state mirroring ─────────────────────────────────────────────
  // Reads from various sources of truth (workspace, session, sql,
  // schedules) and writes one combined snapshot to `this.state`. The
  // agents SDK auto-broadcasts the new state to all connected
  // browser tabs via the `cf_agent_state` protocol message.
  private async refreshAll() {
    const [files, schedules] = await Promise.all([
      this.workspace.glob("**/*"),
      this.listSchedules(),
    ]);
    const memoryBlock = this.session.getContextBlock("memory");
    const skillsBlock = this.session.getContextBlock(SKILLS_LABEL);
    const loadedKeys = this.session.getLoadedSkillKeys();

    // Loaded skill keys are namespaced as "skills:<filename>". Strip
    // the prefix for the panel display.
    const loaded: string[] = [];
    for (const composite of loadedKeys) {
      if (composite.startsWith(`${SKILLS_LABEL}:`)) {
        loaded.push(composite.slice(SKILLS_LABEL.length + 1));
      }
    }

    // Custom tools = whatever getTools() returns minus the ones that
    // came from extensions (those land in their own bucket below).
    const allTools = this.getTools();
    const extensionList = this.extensionManager?.list() ?? [];
    const extensionToolNames = new Set(extensionList.flatMap((e) => e.tools));
    const customTools: ToolView[] = Object.entries(allTools)
      .filter(([name]) => !extensionToolNames.has(name))
      .map(([name, t]) => ({
        name,
        source: "custom" as const,
        description:
          typeof t === "object" && t && "description" in t
            ? String(t.description)
            : undefined,
      }));
    const extensionTools: ToolView[] = extensionList.flatMap((ext) =>
      ext.tools.map((tn) => ({
        name: tn,
        source: "extension" as const,
        description: `from ${ext.name}@${ext.version}`,
      })),
    );

    const sources = this.sql<Source>`
      SELECT source, kind FROM documents ORDER BY source
    `;

    this.setState({
      ...this.state,
      files: files
        .filter((f) => f.type !== "directory")
        .map((f) => ({
          path: f.path,
          type: "file" as const,
          size: f.size,
          updatedAt: f.updatedAt,
        })),
      memory: memoryBlock
        ? {
            content: memoryBlock.content,
            tokens: memoryBlock.tokens,
            maxTokens: memoryBlock.maxTokens ?? 0,
          }
        : EMPTY_MEMORY,
      skills: { listing: skillsBlock?.content ?? "", loaded },
      schedules: schedules.map((s) => {
        const detail =
          s.type === "delayed"
            ? `+${s.delayInSeconds}s`
            : s.type === "cron"
              ? s.cron
              : s.type === "interval"
                ? `every ${s.intervalSeconds}s`
                : new Date(s.time).toLocaleString();
        return {
          id: s.id,
          callback: s.callback,
          type: s.type,
          time: s.time,
          detail,
          payload: s.payload,
        };
      }),
      tools: [
        ...customTools,
        ...WORKSPACE_TOOLS,
        ...SESSION_TOOLS,
        ...extensionTools,
      ],
      sources: Array.from(sources),
      extensions: extensionList.map((ext) => ({
        name: ext.name,
        version: ext.version,
        description: ext.description,
        tools: ext.tools,
      })),
    });
  }

  // ─── Reminder callback ─────────────────────────────────────────────────
  // Invoked by the scheduler when a setReminder timer fires. We inject
  // a synthetic user message so the LLM emits the reminder text on its
  // next turn — keeps the message in the conversation history and lets
  // the model format the message its own way.
  async remind(payload: { message: string }) {
    await this.saveMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        metadata: { synthetic: true, kind: "reminder" },
        parts: [
          {
            type: "text",
            text: `(internal: scheduled reminder fired) Post a single short line to the user in this exact format and nothing else: "⏰ Reminder: ${payload.message}"`,
          },
        ],
      },
    ]);
  }

  // ─── RAG: PDF ingest ───────────────────────────────────────────────────
  // Called from worker/index.ts when the user uploads a PDF via the
  // Sources panel. We:
  //   1. Stash the raw PDF in R2 (so we can show / re-process later)
  //   2. Convert to markdown via env.AI.toMarkdown (Workers AI built-in)
  //   3. Chunk the markdown
  //   4. Embed every chunk via embedMany (one round-trip)
  //   5. Upsert vectors to Vectorize, store raw text in this.sql
  //   6. Broadcast a notification so the frontend can clear "Ingesting…"
  async uploadPdf(buffer: ArrayBuffer, name: string) {
    const r2Key = `pdfs/${crypto.randomUUID()}-${name}`;
    await this.env.BUCKET.put(r2Key, buffer, {
      httpMetadata: { contentType: "application/pdf" },
    });

    const blob = new Blob([buffer], { type: "application/pdf" });
    const [result] = await this.env.AI.toMarkdown([{ name, blob }]);
    if (result.format === "error") {
      throw new Error(`toMarkdown failed for ${name}: ${result.error}`);
    }
    return await this.ingestMarkdown(name, "pdf", result.data, r2Key);
  }

  private async ingestMarkdown(
    source: string,
    kind: "pdf",
    markdown: string,
    r2Key: string | null,
  ) {
    void this.sql`
      INSERT OR REPLACE INTO documents (source, kind, r2_key)
      VALUES (${source}, ${kind}, ${r2Key})
    `;

    const texts = chunkMarkdown(markdown);
    const { embeddings } = await embedMany({
      model: createEmbedder(this.env),
      values: texts,
    });
    // For each chunk: generate an ID, insert the text into SQL, build
    // a vector descriptor for Vectorize. Join key is the chunk ID.
    const vectors = texts.map((text, i) => {
      const id = crypto.randomUUID();
      void this.sql`
        INSERT INTO chunks (id, source, text)
        VALUES (${id}, ${source}, ${text})
      `;
      return { id, values: embeddings[i], metadata: { source } };
    });
    await this.env.VECTOR_DB.upsert(vectors);
    this.broadcast(JSON.stringify({ type: "source_added", source }));
    await this.refreshAll();
    return { source, chunks: texts.length };
  }

  @callable()
  async deleteSource(source: string) {
    // Delete from Vectorize first — its deleteByIds is batched at 100.
    const ids = this.sql<{ id: string }>`
      SELECT id FROM chunks WHERE source = ${source}
    `.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 100) {
      await this.env.VECTOR_DB.deleteByIds(ids.slice(i, i + 100));
    }
    // Then the R2 object.
    const [doc] = this.sql<{ r2_key: string | null }>`
      SELECT r2_key FROM documents WHERE source = ${source}
    `;
    if (doc?.r2_key) await this.env.BUCKET.delete(doc.r2_key);

    // Then the SQL rows. Order matters for crash safety: if we crash
    // mid-way, the user can re-trigger delete on a partial state.
    void this.sql`DELETE FROM chunks WHERE source = ${source}`;
    void this.sql`DELETE FROM documents WHERE source = ${source}`;

    this.broadcast(JSON.stringify({ type: "source_removed", source }));
    await this.refreshAll();
    return { source, deletedChunks: ids.length };
  }

  @callable()
  async deleteAllSources() {
    const ids = this.sql<{ id: string }>`SELECT id FROM chunks`.map(
      (r) => r.id,
    );
    for (let i = 0; i < ids.length; i += 100) {
      await this.env.VECTOR_DB.deleteByIds(ids.slice(i, i + 100));
    }
    const keys = this.sql<{ r2_key: string }>`
      SELECT r2_key FROM documents WHERE r2_key IS NOT NULL
    `.map((r) => r.r2_key);
    if (keys.length > 0) await this.env.BUCKET.delete(keys);

    void this.sql`DELETE FROM chunks`;
    void this.sql`DELETE FROM documents`;

    this.broadcast(JSON.stringify({ type: "all_cleared" }));
    await this.refreshAll();
    return { deletedChunks: ids.length, deletedFiles: keys.length };
  }

  // ─── Browser session management ────────────────────────────────────────
  // Lazy launcher. Reuses the existing browser session if still
  // connected; otherwise spins up a fresh one with keep_alive so the
  // user has 10 minutes to interact with Live View between calls.
  //
  // We re-broadcast the Live View URL on EVERY getPage() — broadcast
  // is fire-and-forget, so an early broadcast might race ahead of the
  // WebSocket handshake. Re-broadcasting lets late-joining tabs catch
  // up.
  async getPage(): Promise<Page> {
    if (!this.page || !this.browser?.connected) {
      this.browser = await puppeteer.launch(this.env.BROWSER, {
        keep_alive: 600_000,
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
    }

    const liveViewUrl = await this.getLiveViewUrl();
    if (liveViewUrl) {
      this.broadcast(JSON.stringify({ type: "live_view", url: liveViewUrl }));
    }
    return this.page;
  }

  // Resolve the hosted Live View URL via Cloudflare's DevTools API.
  // `?mode=tab` strips the devtools panel — the viewer just sees the
  // agent's page, not the DevTools chrome. Requires ACCOUNT_ID +
  // API_TOKEN to be set.
  async getLiveViewUrl(): Promise<string | null> {
    if (!this.browser) return null;
    if (!this.env.API_TOKEN) return null;
    if (!this.env.ACCOUNT_ID) return null;
    const sessionId = this.browser.sessionId();

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/browser-rendering/devtools/browser/${sessionId}/json/list`,
      { headers: { Authorization: `Bearer ${this.env.API_TOKEN}` } },
    );
    if (!res.ok) return null;

    const targets = (await res.json()) as Array<{
      type: string;
      devtoolsFrontendUrl: string;
    }>;
    const url = targets.find((t) => t.type === "page")?.devtoolsFrontendUrl;
    if (!url) return null;

    const liveUrl = new URL(url);
    liveUrl.searchParams.set("mode", "tab");
    return liveUrl.toString();
  }

  // Late-joiner fallback. broadcast() is fire-and-forget — if the user
  // reloads after the browser launched, they missed the original push.
  // The frontend calls this on mount to backfill the Live View URL.
  @callable()
  async fetchLiveView(): Promise<string | null> {
    return await this.getLiveViewUrl();
  }

  @callable()
  async closeBrowser() {
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
    this.broadcast(JSON.stringify({ type: "live_view", url: null }));
  }

  // ─── MCP client surface ────────────────────────────────────────────────
  // The user connects external MCP servers via the MCP panel. Think
  // auto-merges tools from connected MCP servers into the toolset on
  // every turn, so we don't need to do anything special here beyond
  // connect / disconnect.
  //
  // Server / tool state is propagated to the frontend via the agents
  // SDK's built-in `cf_agent_mcp_servers` protocol message — the
  // React side subscribes via `useAgent({ onMcpUpdate })`.

  @callable()
  async connectMcpServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async disconnectMcpServer(id: string) {
    await this.removeMcpServer(id);
  }

  @callable()
  async disconnectAllMcp() {
    for (const server of this.mcp.listServers()) {
      try {
        await this.removeMcpServer(server.id);
      } catch {
        /* ignore */
      }
    }
  }

  // ─── Workspace / extension panel callables ─────────────────────────────
  // Each panel header has a small action button — clear, delete, read
  // a single file. Each routes to one of the @callable methods below.

  @callable()
  async readWorkspaceFile(path: string): Promise<string | null> {
    return await this.workspace.readFile(path);
  }

  @callable()
  async cancelScheduleById(id: string): Promise<void> {
    await this.cancelSchedule(id);
    await this.refreshAll();
  }

  @callable()
  async unloadExtension(name: string): Promise<boolean> {
    if (!this.extensionManager) return false;
    const ok = await this.extensionManager.unload(name);
    await this.refreshAll();
    return ok;
  }

  @callable()
  async clearMemory() {
    await this.session.replaceContextBlock("memory", "");
    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  @callable()
  async clearAllSchedules() {
    const schedules = await this.listSchedules();
    for (const s of schedules) {
      try {
        await this.cancelSchedule(s.id);
      } catch {
        /* ignore */
      }
    }
    await this.refreshAll();
  }

  @callable()
  async clearWorkspace() {
    const entries = await this.workspace.glob("**/*");
    // Delete deeper paths first so directories empty before they're
    // removed. Sort by descending path-depth.
    const sorted = [...entries].sort(
      (a, b) => b.path.split("/").length - a.path.split("/").length,
    );
    for (const f of sorted) {
      try {
        await this.workspace.rm(f.path);
      } catch {
        /* ignore */
      }
    }
    await this.refreshAll();
  }

  // ─── Global Clear button ───────────────────────────────────────────────
  // Wipes everything that's conversation-specific:
  //   * Cancels every reminder
  //   * Drops all RAG sources (vectors + r2 + sql rows)
  //   * Empties the workspace
  //   * Unloads all extensions
  //   * Disconnects MCP servers
  //   * Closes the browser
  //
  // INTENTIONALLY does NOT clear:
  //   * Memory       — that's durable across chats by design
  //   * Skills (R2)  — uploaded resource, not session state
  //
  // Note: this does not reset chat messages. To clear the visible
  // chat history, the frontend uses `clearHistory()` from
  // `useAgentChat`. That's a SDK-provided callable.
  @callable()
  async resetSession() {
    const schedules = await this.listSchedules();
    for (const s of schedules) {
      try {
        await this.cancelSchedule(s.id);
      } catch (err) {
        console.error("[reset] cancelSchedule failed", s.id, err);
      }
    }

    try {
      await this.deleteAllSources();
    } catch (err) {
      console.error("[reset] deleteAllSources failed", err);
    }

    try {
      await this.clearWorkspace();
    } catch (err) {
      console.error("[reset] clearWorkspace failed", err);
    }

    if (this.extensionManager) {
      for (const ext of this.extensionManager.list()) {
        try {
          await this.extensionManager.unload(ext.name);
        } catch (err) {
          console.error("[reset] extension unload failed", ext.name, err);
        }
      }
    }

    try {
      await this.disconnectAllMcp();
    } catch (err) {
      console.error("[reset] disconnect mcp failed", err);
    }

    try {
      await this.closeBrowser();
    } catch (err) {
      console.error("[reset] closeBrowser failed", err);
    }

    await this.refreshAll();
  }
}
