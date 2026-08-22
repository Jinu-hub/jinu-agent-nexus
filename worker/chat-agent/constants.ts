import type { MemoryView, SkillsView, State, ToolView } from "./types";

export const EMPTY_MEMORY: MemoryView = {
  content: "",
  tokens: 0,
  maxTokens: 0,
};

export const EMPTY_SKILLS: SkillsView = { listing: "", loaded: [] };

export const SKILLS_LABEL = "skills";

// Static tool entries — always present so the Tools panel can show them
// without extra runtime introspection.
export const WORKSPACE_TOOLS: ToolView[] = [
  { name: "read", source: "workspace" },
  { name: "write", source: "workspace" },
  { name: "edit", source: "workspace" },
  { name: "list", source: "workspace" },
  { name: "find", source: "workspace" },
  { name: "grep", source: "workspace" },
  { name: "delete", source: "workspace" },
];

export const SESSION_TOOLS: ToolView[] = [
  { name: "set_context", source: "session" },
  { name: "load_context", source: "session" },
  { name: "unload_context", source: "session" },
];

export const INITIAL_STATE: State = {
  files: [],
  memory: EMPTY_MEMORY,
  skills: EMPTY_SKILLS,
  schedules: [],
  tools: [],
  sources: [],
  extensions: [],
};
