// MyMemory stub by instance name (pairs with ChatAgent name).

import { DEFAULT_INSTANCE_NAME } from "../../src/lib/agent-identity";
import type { MyMemory } from "../my-memory";

export function myMemoryStub(
  env: Env,
  instanceName: string = DEFAULT_INSTANCE_NAME,
): DurableObjectStub<MyMemory> {
  const name =
    instanceName.trim() || DEFAULT_INSTANCE_NAME;
  const id = env.MyMemory.idFromName(name);
  return env.MyMemory.get(id);
}
