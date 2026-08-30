// ─────────────────────────────────────────────────────────────────────────
// content_audio — Market Memory Voice generation queue (Phase 1: read)
// ─────────────────────────────────────────────────────────────────────────
//
// Product role:
//   Supabase content_audio  = shared Voice scripts + generation status
//   Cloudflare Worker       = lookup pending rows, later TTS → R2
//
// Phase 1 is read-only. Do not UPDATE status, storage_key, or any other
// column here. Claim (`script_ready` → `generating`) is Phase 2.
//
// Rows that are ready for TTS:
//   status = 'script_ready'
//   script IS NOT NULL
//   script is not empty / whitespace-only (trim)
// ─────────────────────────────────────────────────────────────────────────

import {
  createSupabaseClient,
  getSupabaseAccessMode,
  isSupabaseConfigured,
} from "./supabase";

export const CONTENT_AUDIO_TABLE = "content_audio";
export const PENDING_AUDIO_STATUS = "script_ready";

const CONTENT_AUDIO_SELECT =
  "id, target_type, target_id, content_type, audio_type, lang_code, title, script, duration_seconds, storage_provider, storage_key, status, market_date, model_info, metadata, created_at, updated_at";

export type ContentAudioRow = {
  id: string;
  target_type: string;
  target_id: string;
  content_type: string;
  audio_type: string;
  lang_code: string;
  title: string | null;
  script: string | null;
  duration_seconds: number | null;
  storage_provider: string | null;
  storage_key: string | null;
  status: string;
  market_date: string | null;
  model_info: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type PendingAudioResponse = {
  ok: true;
  count: number;
  items: ContentAudioRow[];
};

function hasUsableScript(row: ContentAudioRow): boolean {
  return typeof row.script === "string" && row.script.trim().length > 0;
}

/**
 * List Voice generation candidates. Read-only — never mutates rows.
 * Uses the service role client: this is a trusted Worker-side job, and
 * the local health probe currently reaches this project via service_role.
 */
export async function listPendingContentAudio(
  env: Env,
): Promise<ContentAudioRow[]> {
  const client = createSupabaseClient(env, { privileged: true });

  const { data, error } = await client
    .from(CONTENT_AUDIO_TABLE)
    .select(CONTENT_AUDIO_SELECT)
    .eq("status", PENDING_AUDIO_STATUS)
    .not("script", "is", null)
    .neq("script", "")
    .order("created_at", { ascending: true })
    .overrideTypes<ContentAudioRow[], { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter(hasUsableScript);
}

/**
 * HTTP routes for Voice generation (Phase 1):
 *   GET /api/audio/pending — script_ready rows with a non-empty script
 *
 * Returns `null` if the path is not an audio route.
 */
export async function handleAudioRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/audio/pending") return null;
  if (request.method !== "GET") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  if (!isSupabaseConfigured(env)) {
    return Response.json(
      {
        ok: false,
        configured: false,
        message:
          "Set SUPABASE_URL and a usable key in .dev.vars (local) or via wrangler secret put (production).",
      },
      { status: 503 },
    );
  }

  if (!getSupabaseAccessMode(env, { privileged: true })) {
    return Response.json(
      {
        ok: false,
        configured: true,
        message:
          "Set SUPABASE_SERVICE_ROLE_KEY for Worker-side content_audio reads.",
      },
      { status: 503 },
    );
  }

  try {
    const items = await listPendingContentAudio(env);
    const body: PendingAudioResponse = {
      ok: true,
      count: items.length,
      items,
    };
    return Response.json(body);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "query failed",
      },
      { status: 502 },
    );
  }
}
