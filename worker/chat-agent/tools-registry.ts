import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import type { ToolSet } from "ai";

import { createGetCurrentTimeTool } from "../tools/getCurrentTime";
import { createGetWeatherTool } from "../tools/getWeather";
import { createGetUserTimezoneTool } from "../tools/getUserTimezone";
import { createSendNotificationTool } from "../tools/sendNotification";
import { createSetReminderTool } from "../tools/setReminder";
import { createRecallTool } from "../tools/recall";
import { createNavigateTool } from "../tools/navigate";
import { createScreenshotTool } from "../tools/screenshot";

import type { ChatAgent } from "../chat-agent";

// HOW TO ADD A NEW TOOL:
//   1. Drop a new file under `worker/tools/` exporting a factory.
//   2. Import the factory here.
//   3. Register it in the object below. The KEY is the LLM-visible name.
export function getChatTools(agent: ChatAgent, env: Env): ToolSet {
  return {
    getCurrentTime: createGetCurrentTimeTool(),
    getWeather: createGetWeatherTool(),
    getUserTimezone: createGetUserTimezoneTool(),
    sendNotification: createSendNotificationTool(),
    setReminder: createSetReminderTool(agent),
    recall: createRecallTool(agent, env),
    navigate: createNavigateTool(agent),
    screenshot: createScreenshotTool(agent, env),

    // load_extension + list_extensions — extension management tools.
    // Per-extension tools are auto-merged by Think internally.
    ...(agent.extensionManager
      ? createExtensionTools({ manager: agent.extensionManager })
      : {}),
  };
}
