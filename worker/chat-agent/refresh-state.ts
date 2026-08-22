import {
  EMPTY_MEMORY,
  SESSION_TOOLS,
  SKILLS_LABEL,
  WORKSPACE_TOOLS,
} from "./constants";
import type { Source, ToolView } from "./types";
import type { RefreshStateHost } from "./agent-host";

// Reads from workspace, session, sql, schedules, tools… and writes one
// combined snapshot to `agent.state`. The agents SDK auto-broadcasts
// the new state to all connected browser tabs.
export async function refreshPanelState(agent: RefreshStateHost): Promise<void> {
  const [files, schedules] = await Promise.all([
    agent.workspace.glob("**/*"),
    agent.listSchedules(),
  ]);
  const memoryBlock = agent.session.getContextBlock("memory");
  const skillsBlock = agent.session.getContextBlock(SKILLS_LABEL);
  const loadedKeys = agent.session.getLoadedSkillKeys();

  // Loaded skill keys are namespaced as "skills:<filename>". Strip
  // the prefix for the panel display.
  const loaded: string[] = [];
  for (const composite of loadedKeys) {
    if (composite.startsWith(`${SKILLS_LABEL}:`)) {
      loaded.push(composite.slice(SKILLS_LABEL.length + 1));
    }
  }

  const allTools = agent.getTools();
  const extensionList = agent.extensionManager?.list() ?? [];
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

  const sources = agent.sql<Source>`
    SELECT source, kind FROM documents ORDER BY source
  `;

  agent.setState({
    ...agent.state,
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
