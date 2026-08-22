// Re-export shim — existing imports use `worker/chat-agent`.
export { ChatAgent } from "./chat-agent/ChatAgent";
export type {
  FileEntry,
  MemoryView,
  SkillsView,
  ScheduleView,
  ToolView,
  Source,
  ExtensionView,
  State,
} from "./chat-agent/types";
