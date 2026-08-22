import type { UIMessage } from "ai";

export function buildReminderMessages(
  current: UIMessage[],
  message: string,
): UIMessage[] {
  return [
    ...current,
    {
      id: crypto.randomUUID(),
      role: "user",
      metadata: { synthetic: true, kind: "reminder" },
      parts: [
        {
          type: "text",
          text: `(internal: scheduled reminder fired) Post a single short line to the user in this exact format and nothing else: "⏰ Reminder: ${message}"`,
        },
      ],
    },
  ];
}
