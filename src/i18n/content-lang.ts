// ─────────────────────────────────────────────────────────────────────────
// content_lang helpers — same persist path from any surface
// ─────────────────────────────────────────────────────────────────────────
//
// Chat shell uses agent.stub.updateSettings; standalone pages (report, live)
// use PATCH /settings. Both land on ChatAgent.updateSettings in the DO.
// Prefer these helpers so cycle + HTTP stay in one place.

import type { ContentLang } from "../../worker/chat-agent/settings";
import {
  isContentLang,
  nextContentLang,
} from "../../worker/chat-agent/settings";
import { authFetch } from "@/lib/auth-fetch";

export { nextContentLang };

/** Persist screen language via HTTP (report / live pages without App state). */
export async function patchContentLang(lang: ContentLang): Promise<ContentLang> {
  const res = await authFetch("/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_lang: lang }),
  });
  const body = (await res.json().catch(() => null)) as {
    content_lang?: unknown;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Failed to update language (${res.status})`);
  }
  return isContentLang(body?.content_lang) ? body.content_lang : lang;
}
