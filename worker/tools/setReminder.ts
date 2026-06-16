// ─────────────────────────────────────────────────────────────────────────
// Tool: setReminder — schedules a callback that fires after N seconds
//
// PATTERN: SERVER-SIDE TOOL THAT USES THE AGENT'S OWN APIS
// ─────────────────────────────────────────────────────────────────────────
// Some tools need to reach into the agent itself — its state, its
// scheduling, its SQL, its broadcast. To support that, the factory
// takes the agent as an argument and the closure captures it.
//
// `agent.schedule(seconds, callbackName, payload)` registers a Durable
// Object alarm that wakes the DO at the right time and invokes the
// named method on the class. The method here is `remind`, defined on
// ChatAgent.
//
// The reminder survives evictions, restarts, even local-dev `wrangler
// dev` kills — Durable Object alarms are persistent.
//
// To inspect / cancel scheduled callbacks at runtime, see the
// Schedules panel and the `@callable cancelScheduleById` method on
// ChatAgent.
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";
import type { ChatAgent } from "../chat-agent";

export function createSetReminderTool(agent: ChatAgent) {
  return tool({
    description:
      "Set a reminder. After `seconds` elapse, post the given message to chat unprompted. Use whenever the user asks to be reminded of something.",
    inputSchema: z.object({
      seconds: z
        .number()
        .int()
        .positive()
        .describe("Delay in seconds. e.g. 60 for one minute."),
      message: z.string().describe("The reminder text."),
    }),
    execute: async ({ seconds, message }) => {
      const schedule = await agent.schedule(seconds, "remind", { message });
      return {
        scheduleId: schedule.id,
        fireInSeconds: seconds,
        message,
      };
    },
  });
}
