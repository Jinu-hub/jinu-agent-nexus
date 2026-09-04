// ─────────────────────────────────────────────────────────────────────────
// Worker entry — HTTP routing
// ─────────────────────────────────────────────────────────────────────────
//
// Responsibilities:
//   1. PDF upload — multipart FormData → ArrayBuffer → DO RPC.
//   2. Screenshot proxy — stream image bytes out of R2 by key.
//   3. My Market Notes — Workers KV note API (`/notes`, `/notes/:key`).
//   4. My Market Memory — personalization DO SQLite (`/memory/*`).
//   5. ChatAgent Settings — runtime settings and change history (`/settings`).
//   6. Supabase health — Market Memory connectivity probe (`/api/supabase/health`).
//   7. Content briefs — today's market-issue brief text (`/api/briefs/today`).
//   8. Voice audio — pending, claim, R2, TTS, generate, Cron (`/api/audio/*`).
//   9. Everything else (incl. WebSocket upgrades) → routeAgentRequest,
//      which dispatches to the ChatAgent / LiveMarketRoomAgent DOs.
//
// The DO class MUST be re-exported from this file. Wrangler's runtime
// needs to find the class when an instance wakes up, and it looks in
// the worker's exports by class name.
// ─────────────────────────────────────────────────────────────────────────

import { routeAgentRequest, getAgentByName } from "agents";
import { ChatAgent } from "./chat-agent";
import { MyMemory } from "./my-memory";
import { LiveMarketRoomAgent } from "./live-market-room";
import { handleNotesRequest } from "./notes";
import { handleMemoryRequest } from "./memory-routes";
import { handleSettingsRequest } from "./settings-routes";
import { handleSupabaseRequest } from "./supabase";
import { handleBriefsRequest } from "./content-briefs";
import { handleAudioRequest } from "./content-audio";
import { runVoiceAudioCron, VOICE_AUDIO_CRON } from "./voice-audio-cron";
import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";

export { ChatAgent, MyMemory, LiveMarketRoomAgent };

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // ── My Market Notes (KV) ───────────────────────────────────────────
    // Lightweight personalization seed — interest / hide / memo keys.
    // See worker/notes.ts. Must run before the SPA asset fallback.
    const notes = await handleNotesRequest(request, env);
    if (notes) return notes;

    // ── My Market Memory (DO SQLite) ───────────────────────────────────
    // Structured preferences, feedback history, Brief weights.
    // See worker/my-memory.ts + memory-routes.ts.
    const memory = await handleMemoryRequest(request, env);
    if (memory) return memory;

    // ── ChatAgent Settings ──────────────────────────────────────────────
    // Runtime behavior such as cleanup and alarm policy. The data lives in
    // the ChatAgent DO's SQLite database.
    const settings = await handleSettingsRequest(request, env);
    if (settings) return settings;

    // ── Supabase (Market Memory) ───────────────────────────────────────
    // Health probe (`/api/supabase/health`), content_briefs today read
    // (`/api/briefs/today`), plus Voice pending/claim/R2/TTS/generate
    // (`/api/audio/*`). See worker/supabase.ts, content-briefs.ts, content-audio.ts.
    const supabase = await handleSupabaseRequest(request, env);
    if (supabase) return supabase;

    const briefs = await handleBriefsRequest(request, env);
    if (briefs) return briefs;

    const audio = await handleAudioRequest(request, env);
    if (audio) return audio;

    // ── PDF upload ─────────────────────────────────────────────────────
    // Why this is a top-level route (not a @callable on the agent):
    // structured-clone-able RPC args max out around small payloads;
    // FormData with a multi-MB PDF needs to go through fetch.
    // We pull the bytes here, then hand a structured-cloneable
    // ArrayBuffer to the agent.
    if (url.pathname === "/api/upload" && request.method === "POST") {
      const fd = await request.formData();
      const file = fd.get("file");
      if (!(file instanceof File)) {
        return new Response("missing file", { status: 400 });
      }
      const buffer = await file.arrayBuffer();
      // "default" matches the agent name used by the frontend's
      // useAgent({ agent: "ChatAgent" }) hook. A single-user
      // boilerplate uses one instance; for multi-user, mint a
      // unique name per signed-in user and pass it via a header /
      // session here.
      //
      // The cast is unavoidable: wrangler emits
      //   `ChatAgent: DurableObjectNamespace /* ChatAgent */`
      // with no real class generic, so we have to tell TS what's
      // actually on the other end of the namespace at call sites
      // that use the typed stub.
      const agent = await getAgentByName<Env, ChatAgent>(
        env.ChatAgent as unknown as DurableObjectNamespace<ChatAgent>,
        DEFAULT_INSTANCE_NAME,
      );
      const result = await agent.uploadPdf(buffer, file.name);
      return Response.json(result);
    }

    // ── Screenshot proxy ───────────────────────────────────────────────
    // The agent stored a PNG at R2 key `screenshots/<key>`. The chat
    // UI references it as `/screenshots/<key>` — this route streams it
    // back from R2.
    if (url.pathname.startsWith("/screenshots/")) {
      const key = url.pathname.slice(1); // strip leading "/"
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType ?? "image/png",
        },
      });
    }

    // ── Everything else → agents SDK router ────────────────────────────
    // Handles /agents/<class>/<name> URLs for both HTTP and WebSocket
    // upgrades. Returns `null` if the request didn't match — fall back
    // to a 404 in that case.
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },

  async scheduled(event, env, ctx) {
    if (event.cron !== VOICE_AUDIO_CRON) return;
    ctx.waitUntil(
      runVoiceAudioCron(env, event.cron).then((result) => {
        console.log("voice-audio-cron", JSON.stringify(result));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
