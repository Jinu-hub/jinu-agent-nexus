// Market Memory turn hooks — product seam for ChatAgent.
// Omit this module (+ soul-market + market tools) when porting without Market.

import type { PrepareStepContext, TurnContext } from "@cloudflare/think";

import type { ChatAgent } from "./ChatAgent";
import {
  detectMarketMemoryTool,
  detectWeatherTool,
  latestUserText,
} from "./market-intent";
import { buildMarketPrefetchBlock } from "./market-prefetch";

/**
 * Prefetch Market Memory into the system prompt so answers do not depend
 * on the model emitting tool calls after reasoning (common hang).
 */
export async function marketBeforeTurn(
  agent: ChatAgent,
  env: Env,
  ctx: TurnContext,
): Promise<
  | { system: string; toolChoice: "none" }
  | undefined
> {
  agent.marketPrefetchReady = false;
  if (ctx.continuation) return;

  const text = latestUserText(
    ctx.messages as Array<{ role: string; content: unknown }>,
  );
  const block = await buildMarketPrefetchBlock(agent, env, text);
  if (!block) return;

  agent.marketPrefetchReady = true;
  return {
    system: `${ctx.system}

## Prefetched Market Memory (authoritative for this turn)
${block}`,
    // Text-only: model often hangs after reasoning when tools are required.
    toolChoice: "none" as const,
  };
}

/**
 * Fallback: force tools when prefetch did not run (or weather).
 * Skip Market force when beforeTurn already injected facts.
 */
export function marketBeforeStep(
  agent: ChatAgent,
  ctx: PrepareStepContext,
):
  | {
      activeTools: string[];
      toolChoice: { type: "tool"; toolName: string };
    }
  | undefined {
  if (ctx.stepNumber !== 0) return;
  if (ctx.steps.some((step) => step.toolResults.length > 0)) return;

  const text = latestUserText(ctx.messages);

  if (agent.marketPrefetchReady) return;

  const weather = detectWeatherTool(text);
  if (weather) {
    return {
      activeTools: [weather],
      toolChoice: { type: "tool" as const, toolName: weather },
    };
  }

  const tool = detectMarketMemoryTool(text);
  if (!tool) return;

  return {
    activeTools: [tool],
    toolChoice: { type: "tool" as const, toolName: tool },
  };
}
