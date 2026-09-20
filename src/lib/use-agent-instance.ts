import { useState } from "react";

import { getOrCreateClientInstanceName } from "@/lib/agent-identity";

/** Stable ChatAgent / MyMemory instance name for this browser (Phase 1 guest). */
export function useAgentInstanceName(): string {
  const [name] = useState(() => getOrCreateClientInstanceName());
  return name;
}
