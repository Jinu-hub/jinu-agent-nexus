// ─────────────────────────────────────────────────────────────────────────
// content_audio — Market Memory Voice generation queue
// ─────────────────────────────────────────────────────────────────────────
//
// Product role:
//   Supabase content_audio  = shared Voice scripts + generation status
//   Cloudflare Worker       = lookup pending rows, claim, later TTS → R2
//
// Phase 1: read-only list of script_ready rows with a usable script.
// Phase 2: atomic claim (script_ready → generating). No TTS / R2 / Cron.
// Phase 4: manual TTS for one row. Returns audio bytes. No R2 / DB write.
// Phase 5: one-row TTS → AUDIO_BUCKET → content_audio completed. No Cron.
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
import {
  AUDIO_STORAGE_PROVIDER,
  buildVoiceStorageKey,
  getVoiceAudio,
  mp3DurationSeconds,
  pingAudioBucket,
  putVoiceAudio,
} from "./audio-r2";
import { createTTSProvider, ttsCharLimit } from "./tts";

export const CONTENT_AUDIO_TABLE = "content_audio";
export const PENDING_AUDIO_STATUS = "script_ready";
/** Claim target. Requires `generating` on the live `content_audio_status` enum. */
export const GENERATING_AUDIO_STATUS = "generating";
export const COMPLETED_AUDIO_STATUS = "completed";
export const FAILED_AUDIO_STATUS = "failed";

export type ContentAudioStatus =
  | "script_ready"
  | "generating"
  | "completed"
  | "cancelled"
  | "failed";

const CONTENT_AUDIO_SELECT =
  "id, target_type, target_id, content_type, audio_type, lang_code, title, script, duration_seconds, storage_provider, storage_key, status, market_date, model_info, metadata, created_at, updated_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export type ClaimAudioResult =
  | { claimed: true; item: ContentAudioRow }
  | {
      claimed: false;
      reason: "not_found" | "already_claimed" | "none_pending";
      status: string | null;
      item: ContentAudioRow | null;
    };

function hasUsableScript(row: ContentAudioRow): boolean {
  return typeof row.script === "string" && row.script.trim().length > 0;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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
 * Atomically claim one row for generation.
 *
 * Compare-and-swap:
 *   UPDATE … SET status = 'generating'
 *   WHERE id = $id AND status = 'script_ready'
 *   RETURNING *
 *
 * Concurrent callers racing on the same id: one gets the row, the rest
 * see 0 updated rows. Do not SELECT-then-UPDATE — that is not safe.
 */
export async function claimPendingContentAudio(
  env: Env,
  id: string,
): Promise<ClaimAudioResult> {
  const client = createSupabaseClient(env, { privileged: true });

  const { data, error } = await client
    .from(CONTENT_AUDIO_TABLE)
    .update({
      status: GENERATING_AUDIO_STATUS,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", PENDING_AUDIO_STATUS)
    .select(CONTENT_AUDIO_SELECT)
    .maybeSingle()
    .overrideTypes<ContentAudioRow, { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return { claimed: true, item: data };
  }

  const existing = await getContentAudioById(env, id);
  if (!existing) {
    return {
      claimed: false,
      reason: "not_found",
      status: null,
      item: null,
    };
  }

  return {
    claimed: false,
    reason: "already_claimed",
    status: existing.status,
    item: existing,
  };
}

/**
 * Claim the oldest pending row. If a concurrent worker already took it,
 * try the next pending id instead of failing the whole call.
 */
export async function claimNextPendingContentAudio(
  env: Env,
): Promise<ClaimAudioResult> {
  const pending = await listPendingContentAudio(env);
  for (const row of pending) {
    const result = await claimPendingContentAudio(env, row.id);
    if (result.claimed) return result;
  }
  return {
    claimed: false,
    reason: "none_pending",
    status: null,
    item: null,
  };
}

export async function getContentAudioById(
  env: Env,
  id: string,
): Promise<ContentAudioRow | null> {
  const client = createSupabaseClient(env, { privileged: true });
  const { data, error } = await client
    .from(CONTENT_AUDIO_TABLE)
    .select(CONTENT_AUDIO_SELECT)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ContentAudioRow, { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export type GenerateAudioResult =
  | { ok: true; item: ContentAudioRow }
  | {
      ok: false;
      httpStatus: 400 | 404 | 409 | 502;
      body: Record<string, unknown>;
    };

/**
 * One-row Voice pipeline: claim if needed → TTS → R2 put → completed.
 * Failures after claim mark the row `failed` and keep existing metadata keys.
 */
export async function generateVoiceAudio(
  env: Env,
  id: string,
): Promise<GenerateAudioResult> {
  const prepared = await prepareRowForGenerate(env, id);
  if (!prepared.ok) return prepared;
  const row = prepared.item;

  if (!hasUsableScript(row) || !row.script) {
    await markContentAudioFailed(env, row.id, "script is empty");
    return {
      ok: false,
      httpStatus: 400,
      body: { ok: false, message: "script is empty" },
    };
  }
  if (row.script.length > ttsCharLimit()) {
    const message = `script exceeds TTS limit (${ttsCharLimit()} characters)`;
    await markContentAudioFailed(env, row.id, message);
    return { ok: false, httpStatus: 400, body: { ok: false, message } };
  }

  try {
    const tts = createTTSProvider(env);
    const audio = await tts.generate({
      text: row.script,
      language: row.lang_code,
    });
    if (audio.byteLength < 64) {
      throw new Error("TTS returned an empty audio payload");
    }

    const storageKey = buildVoiceStorageKey({
      audioType: row.audio_type,
      langCode: row.lang_code,
      id: row.id,
      marketDate: row.market_date,
      createdAt: row.created_at,
    });

    await putVoiceAudio(env, storageKey, audio);
    const stored = await getVoiceAudio(env, storageKey);
    if (!stored || stored.size !== audio.byteLength) {
      throw new Error("AUDIO_BUCKET put succeeded but get did not confirm the object");
    }

    const metadata = withoutVoiceError(asMetadataObject(row.metadata));
    const client = createSupabaseClient(env, { privileged: true });
    const { data, error } = await client
      .from(CONTENT_AUDIO_TABLE)
      .update({
        status: COMPLETED_AUDIO_STATUS,
        storage_provider: AUDIO_STORAGE_PROVIDER,
        storage_key: storageKey,
        duration_seconds: mp3DurationSeconds(audio),
        model_info: {
          provider: tts.provider,
          model: tts.model,
          voice: tts.voice,
        },
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", GENERATING_AUDIO_STATUS)
      .select(CONTENT_AUDIO_SELECT)
      .maybeSingle()
      .overrideTypes<ContentAudioRow, { merge: false }>();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      const current = await getContentAudioById(env, row.id);
      return {
        ok: false,
        httpStatus: 409,
        body: {
          ok: false,
          reason: "status_changed",
          status: current?.status ?? null,
          item: current,
        },
      };
    }

    return { ok: true, item: data };
  } catch (error) {
    const message = publicQueryMessage(error);
    await markContentAudioFailed(env, row.id, message);
    return {
      ok: false,
      httpStatus: 502,
      body: { ok: false, message },
    };
  }
}

async function prepareRowForGenerate(
  env: Env,
  id: string,
): Promise<GenerateAudioResult> {
  const existing = await getContentAudioById(env, id);
  if (!existing) {
    return {
      ok: false,
      httpStatus: 404,
      body: { ok: false, reason: "not_found" },
    };
  }

  if (existing.status === COMPLETED_AUDIO_STATUS) {
    return {
      ok: false,
      httpStatus: 409,
      body: {
        ok: false,
        reason: "already_completed",
        status: existing.status,
        item: existing,
      },
    };
  }

  if (existing.status === "cancelled") {
    return {
      ok: false,
      httpStatus: 409,
      body: {
        ok: false,
        reason: "cancelled",
        status: existing.status,
        item: existing,
      },
    };
  }

  if (existing.status === GENERATING_AUDIO_STATUS) {
    return { ok: true, item: existing };
  }

  if (existing.status === PENDING_AUDIO_STATUS) {
    const claimed = await claimPendingContentAudio(env, id);
    if (claimed.claimed) {
      return { ok: true, item: claimed.item };
    }
    if (claimed.status === GENERATING_AUDIO_STATUS && claimed.item) {
      return { ok: true, item: claimed.item };
    }
    return {
      ok: false,
      httpStatus: claimed.reason === "not_found" ? 404 : 409,
      body: {
        ok: false,
        claimed: false,
        reason: claimed.reason,
        status: claimed.status,
        item: claimed.item,
      },
    };
  }

  if (existing.status === FAILED_AUDIO_STATUS) {
    const reclaimed = await claimFromStatus(env, id, FAILED_AUDIO_STATUS);
    if (reclaimed) {
      return { ok: true, item: reclaimed };
    }
    const current = await getContentAudioById(env, id);
    if (current?.status === GENERATING_AUDIO_STATUS) {
      return { ok: true, item: current };
    }
    return {
      ok: false,
      httpStatus: 409,
      body: {
        ok: false,
        reason: "already_claimed",
        status: current?.status ?? existing.status,
        item: current,
      },
    };
  }

  return {
    ok: false,
    httpStatus: 409,
    body: {
      ok: false,
      reason: "already_claimed",
      status: existing.status,
      item: existing,
    },
  };
}

async function claimFromStatus(
  env: Env,
  id: string,
  fromStatus: string,
): Promise<ContentAudioRow | null> {
  const client = createSupabaseClient(env, { privileged: true });
  const { data, error } = await client
    .from(CONTENT_AUDIO_TABLE)
    .update({
      status: GENERATING_AUDIO_STATUS,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", fromStatus)
    .select(CONTENT_AUDIO_SELECT)
    .maybeSingle()
    .overrideTypes<ContentAudioRow, { merge: false }>();

  if (error) {
    throw new Error(error.message);
  }
  return data ?? null;
}

async function markContentAudioFailed(
  env: Env,
  id: string,
  message: string,
): Promise<void> {
  const existing = await getContentAudioById(env, id);
  if (!existing || existing.status !== GENERATING_AUDIO_STATUS) {
    return;
  }

  const metadata = asMetadataObject(existing.metadata);
  metadata.voice_error = {
    message: message.slice(0, 500),
    at: new Date().toISOString(),
  };

  const client = createSupabaseClient(env, { privileged: true });
  const { error } = await client
    .from(CONTENT_AUDIO_TABLE)
    .update({
      status: FAILED_AUDIO_STATUS,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", GENERATING_AUDIO_STATUS);

  if (error) {
    throw new Error(error.message);
  }
}

function asMetadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function withoutVoiceError(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metadata };
  delete next.voice_error;
  return next;
}

/**
 * HTTP routes for Voice generation:
 *   GET  /api/audio/pending         — script_ready rows with a non-empty script
 *   POST /api/audio/claim           — script_ready → generating (optional body `{ id }`)
 *   GET  /api/audio/storage/health  — AUDIO_BUCKET put → get probe (no TTS, no DB write)
 *   POST /api/audio/tts             — one-row TTS test; returns audio/mpeg (no R2, no DB write)
 *   POST /api/audio/generate        — TTS → R2 → completed (JSON, not raw MP3)
 *   GET  /api/audio/file/:id        — stream stored MP3 from AUDIO_BUCKET
 *
 * Returns `null` if the path is not an audio route.
 */
export async function handleAudioRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/audio/storage/health") {
    if (request.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    return handleStorageHealth(env);
  }

  if (pathname === "/api/audio/pending") {
    if (request.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handlePendingGet(env);
  }

  if (pathname === "/api/audio/claim") {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleClaimPost(request, env);
  }

  if (pathname === "/api/audio/tts") {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleTtsPost(request, env);
  }

  if (pathname === "/api/audio/generate") {
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleGeneratePost(request, env);
  }

  const fileMatch = pathname.match(/^\/api\/audio\/file\/([^/]+)$/);
  if (fileMatch) {
    if (request.method !== "GET") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const blocked = supabaseServiceRoleGuard(env);
    if (blocked) return blocked;
    return handleFileGet(env, fileMatch[1]);
  }

  return null;
}

function supabaseServiceRoleGuard(env: Env): Response | null {
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

  return null;
}

async function handlePendingGet(env: Env): Promise<Response> {
  try {
    const items = await listPendingContentAudio(env);
    const body: PendingAudioResponse = {
      ok: true,
      count: items.length,
      items,
    };
    return Response.json(body);
  } catch (error) {
    return queryFailed(error);
  }
}

async function handleClaimPost(
  request: Request,
  env: Env,
): Promise<Response> {
  const parsed = await parseClaimId(request);
  if (!parsed.ok) {
    return Response.json({ ok: false, message: parsed.message }, { status: 400 });
  }

  try {
    const result = parsed.id
      ? await claimPendingContentAudio(env, parsed.id)
      : await claimNextPendingContentAudio(env);
    return claimResponse(result);
  } catch (error) {
    return queryFailed(error);
  }
}

async function handleTtsPost(request: Request, env: Env): Promise<Response> {
  const parsed = await parseClaimId(request);
  if (!parsed.ok) {
    return Response.json({ ok: false, message: parsed.message }, { status: 400 });
  }
  if (!parsed.id) {
    return Response.json(
      { ok: false, message: "id is required" },
      { status: 400 },
    );
  }

  try {
    const row = await getContentAudioById(env, parsed.id);
    if (!row) {
      return Response.json(
        { ok: false, reason: "not_found" },
        { status: 404 },
      );
    }
    if (!hasUsableScript(row) || !row.script) {
      return Response.json(
        { ok: false, message: "script is empty" },
        { status: 400 },
      );
    }
    if (row.script.length > ttsCharLimit()) {
      return Response.json(
        {
          ok: false,
          message: `script exceeds TTS limit (${ttsCharLimit()} characters)`,
        },
        { status: 400 },
      );
    }

    const tts = createTTSProvider(env);
    const audio = await tts.generate({
      text: row.script,
      language: row.lang_code,
    });

    if (audio.byteLength < 64) {
      return Response.json(
        { ok: false, message: "TTS returned an empty audio payload" },
        { status: 502 },
      );
    }

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${row.id}.mp3"`,
        "X-Audio-Id": row.id,
        "X-Audio-Lang": row.lang_code,
        "X-TTS-Provider": tts.provider,
        "X-TTS-Model": tts.model,
        "X-TTS-Voice": tts.voice,
        "Content-Length": String(audio.byteLength),
      },
    });
  } catch (error) {
    return queryFailed(error);
  }
}

async function handleGeneratePost(
  request: Request,
  env: Env,
): Promise<Response> {
  const parsed = await parseClaimId(request);
  if (!parsed.ok) {
    return Response.json({ ok: false, message: parsed.message }, { status: 400 });
  }
  if (!parsed.id) {
    return Response.json(
      { ok: false, message: "id is required" },
      { status: 400 },
    );
  }

  try {
    const result = await generateVoiceAudio(env, parsed.id);
    if (!result.ok) {
      return Response.json(result.body, { status: result.httpStatus });
    }
    return Response.json({ ok: true, item: result.item });
  } catch (error) {
    return queryFailed(error);
  }
}

async function handleFileGet(env: Env, rawId: string): Promise<Response> {
  if (!isUuid(rawId)) {
    return Response.json(
      { ok: false, message: "id must be a UUID" },
      { status: 400 },
    );
  }

  try {
    const row = await getContentAudioById(env, rawId);
    if (!row) {
      return Response.json(
        { ok: false, reason: "not_found" },
        { status: 404 },
      );
    }
    if (!row.storage_key) {
      return Response.json(
        { ok: false, message: "row has no storage_key" },
        { status: 404 },
      );
    }

    const stored = await getVoiceAudio(env, row.storage_key);
    if (!stored) {
      return Response.json(
        { ok: false, message: "audio object not found in AUDIO_BUCKET" },
        { status: 404 },
      );
    }

    return new Response(stored.body, {
      headers: {
        "Content-Type":
          stored.httpMetadata?.contentType ?? "audio/mpeg",
        "Content-Disposition": `inline; filename="${row.id}.mp3"`,
        "X-Audio-Id": row.id,
        "X-Storage-Key": row.storage_key,
        "Content-Length": String(stored.size),
      },
    });
  } catch (error) {
    return queryFailed(error);
  }
}

type ParsedClaimId =
  | { ok: true; id: string | null }
  | { ok: false; message: string };

async function parseClaimId(request: Request): Promise<ParsedClaimId> {
  const text = await request.text();
  if (!text.trim()) {
    return { ok: true, id: null };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, message: "invalid JSON body" };
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "body must be a JSON object" };
  }

  const id = (body as { id?: unknown }).id;
  if (id == null || id === "") {
    return { ok: true, id: null };
  }
  if (typeof id !== "string" || !isUuid(id)) {
    return { ok: false, message: "id must be a UUID" };
  }
  return { ok: true, id };
}

function claimResponse(result: ClaimAudioResult): Response {
  if (result.claimed) {
    return Response.json({
      ok: true,
      claimed: true,
      item: result.item,
    });
  }

  if (result.reason === "none_pending") {
    return Response.json({
      ok: true,
      claimed: false,
      reason: result.reason,
      item: null,
    });
  }

  if (result.reason === "not_found") {
    return Response.json(
      {
        ok: false,
        claimed: false,
        reason: result.reason,
        item: null,
      },
      { status: 404 },
    );
  }

  return Response.json(
    {
      ok: false,
      claimed: false,
      reason: result.reason,
      status: result.status,
      item: result.item,
    },
    { status: 409 },
  );
}

function publicQueryMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "query failed";
  if (message.includes("invalid input value for enum content_audio_status")) {
    return "Live content_audio_status enum does not include this value yet. Add 'generating' and 'completed' via ALTER TYPE — do not rewrite rows to 'generated'.";
  }
  return message;
}

function queryFailed(error: unknown): Response {
  return Response.json(
    {
      ok: false,
      message: publicQueryMessage(error),
    },
    { status: 502 },
  );
}

async function handleStorageHealth(env: Env): Promise<Response> {
  try {
    const result = await pingAudioBucket(env);
    if (!result.echoed) {
      return Response.json(
        {
          ...result,
          ok: false,
          message: "put succeeded but get body did not match",
        },
        { status: 502 },
      );
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        binding: "AUDIO_BUCKET",
        bucket: "market-memory-audio",
        message: error instanceof Error ? error.message : "AUDIO_BUCKET probe failed",
      },
      { status: 502 },
    );
  }
}
