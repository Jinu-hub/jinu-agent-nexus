import { useAuth } from "@/lib/auth";

/** ChatAgent / MyMemory instance — user.id when signed in, else guest_*. */
export function useAgentInstanceName(): string {
  return useAuth().instanceName;
}
