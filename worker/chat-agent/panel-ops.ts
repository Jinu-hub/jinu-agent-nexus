import { deleteAllSources } from "./rag";
import { refreshPanelState } from "./refresh-state";
import { closeBrowser } from "./browser";
import type { PanelOpsHost } from "./agent-host";

export async function clearWorkspace(agent: PanelOpsHost) {
  const entries = await agent.workspace.glob("**/*");
  const sorted = [...entries].sort(
    (a, b) => b.path.split("/").length - a.path.split("/").length,
  );
  for (const f of sorted) {
    try {
      await agent.workspace.rm(f.path);
    } catch {
      /* ignore */
    }
  }
  await refreshPanelState(agent);
}

export async function disconnectAllMcp(agent: PanelOpsHost) {
  for (const server of agent.mcp.listServers()) {
    try {
      await agent.removeMcpServer(server.id);
    } catch {
      /* ignore */
    }
  }
}

// Wipes conversation-specific state. Does NOT clear memory or R2 skills.
export async function resetSession(agent: PanelOpsHost, env: Env) {
  const schedules = await agent.listSchedules();
  for (const s of schedules) {
    try {
      await agent.cancelSchedule(s.id);
    } catch (err) {
      console.error("[reset] cancelSchedule failed", s.id, err);
    }
  }

  try {
    await deleteAllSources(agent, env);
  } catch (err) {
    console.error("[reset] deleteAllSources failed", err);
  }

  try {
    await clearWorkspace(agent);
  } catch (err) {
    console.error("[reset] clearWorkspace failed", err);
  }

  if (agent.extensionManager) {
    for (const ext of agent.extensionManager.list()) {
      try {
        await agent.extensionManager.unload(ext.name);
      } catch (err) {
        console.error("[reset] extension unload failed", ext.name, err);
      }
    }
  }

  try {
    await disconnectAllMcp(agent);
  } catch (err) {
    console.error("[reset] disconnect mcp failed", err);
  }

  try {
    await closeBrowser(agent);
  } catch (err) {
    console.error("[reset] closeBrowser failed", err);
  }

  await refreshPanelState(agent);
}
