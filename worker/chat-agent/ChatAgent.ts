// ─────────────────────────────────────────────────────────────────────────
// ChatAgent — the brain of the boilerplate
// ─────────────────────────────────────────────────────────────────────────
//
// Extends `Think`, which itself extends `AIChatAgent`, which extends
// `Agent`, which IS a Durable Object. Domain logic lives in sibling
// modules under `worker/chat-agent/`; this class wires Think config,
// lifecycle, and @callable RPC surface.
//
// ── Where you'd extend ──────────────────────────────────────────────────
//   • Add a tool          → worker/tools/ + tools-registry.ts
//   • Change the model    → worker/ai.ts
//   • Change the prompt   → configure-session.ts
//   • Add a panel mirror  → types.ts + refresh-state.ts
//   • Add a callable RPC  → add an @callable() method here (or panel-ops.ts)
// ─────────────────────────────────────────────────────────────────────────

import { Think, type Session } from "@cloudflare/think";
import type { ToolSet, LanguageModel } from "ai";
import { callable } from "agents";
import type { ChatResponseResult } from "agents/chat";
import type { Browser, Page } from "@cloudflare/puppeteer";

import { createModel } from "../ai";
import { INITIAL_STATE } from "./constants";
import { configureChatSession } from "./configure-session";
import { getChatTools } from "./tools-registry";
import { refreshPanelState } from "./refresh-state";
import {
  uploadPdf as uploadPdfImpl,
  deleteSource as deleteSourceImpl,
  deleteAllSources as deleteAllSourcesImpl,
} from "./rag";
import {
  getPage as getPageImpl,
  getLiveViewUrl as getLiveViewUrlImpl,
  closeBrowser as closeBrowserImpl,
} from "./browser";
import { buildReminderMessages } from "./reminders";
import {
  clearWorkspace as clearWorkspaceImpl,
  disconnectAllMcp as disconnectAllMcpImpl,
  resetSession as resetSessionImpl,
} from "./panel-ops";
import type { State } from "./types";

export type {
  FileEntry,
  MemoryView,
  SkillsView,
  ScheduleView,
  ToolView,
  Source,
  ExtensionView,
  State,
} from "./types";

export class ChatAgent extends Think<Env, State> {
  initialState: State = { ...INITIAL_STATE };

  extensionLoader = this.env.LOADER;

  override maxSteps = 3;
  override chatRecovery = false;

  browser?: Browser;
  page?: Page;

  getModel(): LanguageModel {
    return createModel(this.env);
  }

  configureSession(session: Session) {
    return configureChatSession(session, this.env.BUCKET);
  }

  override getTools(): ToolSet {
    return getChatTools(this, this.env);
  }

  override async onStart() {
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

    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  override async onChatResponse(_result: ChatResponseResult) {
    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  private async refreshAll() {
    await refreshPanelState(this);
  }

  async remind(payload: { message: string }) {
    await this.saveMessages((current) =>
      buildReminderMessages(current, payload.message),
    );
  }

  async uploadPdf(buffer: ArrayBuffer, name: string) {
    return uploadPdfImpl(this, this.env, buffer, name);
  }

  @callable()
  async deleteSource(source: string) {
    return deleteSourceImpl(this, this.env, source);
  }

  @callable()
  async deleteAllSources() {
    return deleteAllSourcesImpl(this, this.env);
  }

  async getPage(): Promise<Page> {
    return getPageImpl(this, this.env);
  }

  async getLiveViewUrl(): Promise<string | null> {
    return getLiveViewUrlImpl(this, this.env);
  }

  @callable()
  async fetchLiveView(): Promise<string | null> {
    return await this.getLiveViewUrl();
  }

  @callable()
  async closeBrowser() {
    await closeBrowserImpl(this);
  }

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
    await disconnectAllMcpImpl(this);
  }

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
    await clearWorkspaceImpl(this);
  }

  @callable()
  async resetSession() {
    await resetSessionImpl(this, this.env);
  }
}
