import type { Browser, Page } from "@cloudflare/puppeteer";
import type { ToolSet } from "ai";

import type { State } from "./types";

type WorkspaceEntry = {
  path: string;
  type: string;
  size: number;
  updatedAt: number;
};

type ScheduleEntry = {
  id: string;
  callback: string;
  type: "scheduled" | "delayed" | "cron" | "interval";
  time: number;
  delayInSeconds?: number;
  cron?: string;
  intervalSeconds?: number;
  payload?: unknown;
};

type ExtensionEntry = {
  name: string;
  version: string;
  description?: string;
  tools: string[];
};

type ContextBlock = {
  content: string;
  tokens: number;
  maxTokens?: number;
};

type SqlValue = string | number | boolean | null;

/** Matches Think/Agent `sql` tagged-template signature. */
export type SqlAgentHost = {
  sql: <T = Record<string, SqlValue>>(
    strings: TemplateStringsArray,
    ...values: SqlValue[]
  ) => T[];
};

export type BrowserSessionHost = {
  browser?: Browser;
  page?: Page;
  broadcast(message: string): void;
};

export type RefreshStateHost = SqlAgentHost & {
  workspace: {
    glob(pattern: string): Promise<WorkspaceEntry[]>;
    rm(path: string): Promise<void>;
  };
  listSchedules(): Promise<ScheduleEntry[]>;
  session: {
    getContextBlock(label: string): ContextBlock | null | undefined;
    getLoadedSkillKeys(): Set<string>;
  };
  getTools(): ToolSet;
  extensionManager?: {
    list(): ExtensionEntry[];
  } | null;
  state: State;
  setState(state: State): void;
};

export type RagAgentHost = RefreshStateHost & {
  broadcast(message: string): void;
};

export type PanelOpsHost = BrowserSessionHost &
  RefreshStateHost &
  Pick<
    import("../chat-agent").ChatAgent,
    "cancelSchedule" | "removeMcpServer" | "extensionManager" | "mcp"
  >;

export type { Page };
