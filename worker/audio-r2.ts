// ─────────────────────────────────────────────────────────────────────────
// Voice audio R2 — AUDIO_BUCKET (market-memory-audio)
// ─────────────────────────────────────────────────────────────────────────
//
// Separate from env.BUCKET (boilerplate-bucket: skills / pdfs / screenshots).
// Phase 3 only verifies put → get with a tiny probe object. TTS and
// content_audio storage_key writes come later.
//
// Probe key lives under `health/` so it never collides with production
// keys: {audio_type}/{YYYY}/{MM}/{DD}/{lang_code}/{id}.mp3
// ─────────────────────────────────────────────────────────────────────────

export const AUDIO_BUCKET_NAME = "market-memory-audio";
export const AUDIO_BUCKET_BINDING = "AUDIO_BUCKET";
export const AUDIO_PING_KEY = "health/phase3-ping.txt";

export type AudioStoragePingResult = {
  ok: true;
  binding: typeof AUDIO_BUCKET_BINDING;
  bucket: typeof AUDIO_BUCKET_NAME;
  key: string;
  bytes: number;
  echoed: boolean;
};

export async function pingAudioBucket(env: Env): Promise<AudioStoragePingResult> {
  const payload = `ping ${new Date().toISOString()}\n`;
  await env.AUDIO_BUCKET.put(AUDIO_PING_KEY, payload, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  const obj = await env.AUDIO_BUCKET.get(AUDIO_PING_KEY);
  if (!obj) {
    throw new Error("AUDIO_BUCKET.get returned null after put");
  }

  const echoed = (await obj.text()) === payload;
  return {
    ok: true,
    binding: AUDIO_BUCKET_BINDING,
    bucket: AUDIO_BUCKET_NAME,
    key: AUDIO_PING_KEY,
    bytes: new TextEncoder().encode(payload).length,
    echoed,
  };
}
