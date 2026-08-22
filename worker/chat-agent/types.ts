// ─────────────────────────────────────────────────────────────────────────
// Types mirrored to the frontend
// ─────────────────────────────────────────────────────────────────────────
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
  //   * custom    — defined in getTools()
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
