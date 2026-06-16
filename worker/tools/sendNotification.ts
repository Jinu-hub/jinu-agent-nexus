// ─────────────────────────────────────────────────────────────────────────
// Tool: sendNotification — APPROVAL TOOL (human-in-the-loop)
//
// PATTERN: APPROVAL TOOL
// ─────────────────────────────────────────────────────────────────────────
// An approval tool defines `needsApproval`. Before `execute` is called,
// the agents SDK pauses the turn, sends the proposed tool call to the
// browser, and waits for the user to click Approve or Reject. Only on
// approval does `execute` run.
//
// Approval tools are the right choice when:
//   • The action is destructive or expensive (sending email, charging
//     a card, deleting data, posting publicly)
//   • You want a "are you sure?" beat before the agent commits
//   • Compliance or safety requires explicit human consent
//
// `needsApproval` can be:
//   • `true` / `false`        — always / never approve
//   • a function `(input) =>`  — decide per-call (e.g. approve only
//     above $100, only for external recipients, etc.)
//
// This example is a stub — replace `execute` with a real send via your
// notification provider (email, SMS, push, Slack…). For email, see the
// COURSE recipe in the README under "Adding email".
// ─────────────────────────────────────────────────────────────────────────

import { tool } from "ai";
import { z } from "zod";

export function createSendNotificationTool() {
  return tool({
    description:
      "Send a notification to the user. Use SPARINGLY — only when the user explicitly asks to be notified, or when something urgent enough to interrupt them has happened. The user will see an approval prompt before this fires.",
    inputSchema: z.object({
      title: z.string().describe("Short, attention-grabbing headline."),
      body: z.string().describe("One or two sentences with the detail."),
    }),
    needsApproval: () => true,
    execute: async ({ title, body }) => {
      // STUB. In a real app this would call your notification provider.
      // Examples:
      //   * Email: env.EMAIL.send({ to: ..., subject: title, text: body })
      //   * Slack: await fetch(slackWebhookUrl, { ... })
      //   * Web Push: await env.PUSH.send(subscription, { title, body })
      console.log("[sendNotification]", { title, body });
      return {
        ok: true,
        sentAt: new Date().toISOString(),
        title,
        body,
      };
    },
  });
}
