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
import {
  ensureSettings,
  getSettings as getSettingsImpl,
  listSettingEvents as listSettingEventsImpl,
  updateSettings as updateSettingsImpl,
  type ChatSettings,
  type ChatSettingsPatch,
  type SettingEvent,
} from "./settings";
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
    ensureSettings(this);
    await this.ensureMessageCleanupSchedule();

    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  override async onChatResponse() {
    await this.session.refreshSystemPrompt();
    await this.refreshAll();
  }

  private async refreshAll() {
    await refreshPanelState(this);
  }

  @callable()
  async getSettings(): Promise<ChatSettings> {
    return getSettingsImpl(this);
  }

  @callable()
  async updateSettings(patch: ChatSettingsPatch): Promise<ChatSettings> {
    const previous = getSettingsImpl(this);
    const settings = updateSettingsImpl(this, patch);
    if (
      previous.alarm_enabled !== settings.alarm_enabled ||
      previous.message_cleanup_enabled !== settings.message_cleanup_enabled ||
      previous.alarm_interval_seconds !== settings.alarm_interval_seconds
    ) {
      await this.syncMessageCleanupSchedule();
    }
    return settings;
  }

  @callable()
  async getSettingEvents(limit = 100): Promise<SettingEvent[]> {
    return listSettingEventsImpl(this, limit);
  }

  /**
   * Scheduled through the Agents SDK so it shares the DO alarm with
   * reminders instead of replacing the framework's alarm handler.
   */
  async runMessageCleanup(): Promise<{ deleted: number }> {
    const settings = getSettingsImpl(this);
    if (!settings.alarm_enabled || !settings.message_cleanup_enabled) {
      return { deleted: 0 };
    }

    const cutoff = Date.now() - settings.message_retention_seconds * 1000;
    const expiredIds = this.session
      .getHistory()
      .filter((message) => {
        if (!message.createdAt) return false;
        const createdAt =
          message.createdAt instanceof Date
            ? message.createdAt.getTime()
            : Date.parse(String(message.createdAt));
        return Number.isFinite(createdAt) && createdAt < cutoff;
      })
      .map((message) => message.id);

    if (expiredIds.length > 0) {
      this.session.deleteMessages(expiredIds);
      this.broadcast(
        JSON.stringify({
          type: "messages_pruned",
          deleted: expiredIds.length,
        }),
      );
    }

    return { deleted: expiredIds.length };
  }

  private async syncMessageCleanupSchedule(): Promise<void> {
    const schedules = await this.listSchedules();
    for (const schedule of schedules) {
      if (schedule.callback === "runMessageCleanup") {
        await this.cancelSchedule(schedule.id);
      }
    }

    const settings = getSettingsImpl(this);
    if (settings.alarm_enabled && settings.message_cleanup_enabled) {
      await this.scheduleEvery(
        settings.alarm_interval_seconds,
        "runMessageCleanup",
      );
    }
  }

  private async ensureMessageCleanupSchedule(): Promise<void> {
    const settings = getSettingsImpl(this);
    if (!settings.alarm_enabled || !settings.message_cleanup_enabled) {
      const schedules = await this.listSchedules();
      for (const schedule of schedules) {
        if (schedule.callback === "runMessageCleanup") {
          await this.cancelSchedule(schedule.id);
        }
      }
      return;
    }

    await this.scheduleEvery(
      settings.alarm_interval_seconds,
      "runMessageCleanup",
    );
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
