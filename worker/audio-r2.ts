// ─────────────────────────────────────────────────────────────────────────
// Voice audio R2 — AUDIO_BUCKET (market-memory-audio)
// ─────────────────────────────────────────────────────────────────────────
//
// Separate from env.BUCKET (boilerplate-bucket: skills / pdfs / screenshots).
// Voice objects live at:
//   {audio_type}/{YYYY}/{MM}/{DD}/{lang_code}/{id}.mp3
// Probe key lives under `health/` so it never collides with those keys.
// ─────────────────────────────────────────────────────────────────────────

export const AUDIO_BUCKET_NAME = "market-memory-audio";
export const AUDIO_BUCKET_BINDING = "AUDIO_BUCKET";
export const AUDIO_PING_KEY = "health/phase3-ping.txt";
export const AUDIO_STORAGE_PROVIDER = "cloudflare_r2";

export type VoiceStorageKeyInput = {
  audioType: string;
  langCode: string;
  id: string;
  marketDate: string | null;
  createdAt: string;
};

/**
 * Object key only (no bucket name):
 *   {audio_type}/{YYYY}/{MM}/{DD}/{lang_code}/{id}.mp3
 * Date parts come from market_date (YYYY-MM-DD), else created_at.
 */
export function buildVoiceStorageKey(input: VoiceStorageKeyInput): string {
  const audioType = keySegment(input.audioType, "audio_type");
  const langCode = keySegment(input.langCode, "lang_code");
  const id = keySegment(input.id, "id");
  const { y, m, d } = ymdFromRow(input.marketDate, input.createdAt);
  return `${audioType}/${y}/${m}/${d}/${langCode}/${id}.mp3`;
}

export async function putVoiceAudio(
  env: Env,
  key: string,
  audio: ArrayBuffer,
): Promise<void> {
  await env.AUDIO_BUCKET.put(key, audio, {
    httpMetadata: { contentType: "audio/mpeg" },
  });
}

export async function getVoiceAudio(
  env: Env,
  key: string,
): Promise<R2ObjectBody | null> {
  return env.AUDIO_BUCKET.get(key);
}

function keySegment(value: string, label: string): string {
  const v = value.trim();
  if (!v || v.includes("/") || v.includes("\\") || v.includes("..")) {
    throw new Error(`invalid ${label} for storage_key`);
  }
  return v;
}

function ymdFromRow(
  marketDate: string | null,
  createdAt: string,
): { y: string; m: string; d: string } {
  const fromMarket = marketDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (fromMarket) {
    return { y: fromMarket[1], m: fromMarket[2], d: fromMarket[3] };
  }
  const fromCreated = createdAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (fromCreated) {
    return { y: fromCreated[1], m: fromCreated[2], d: fromCreated[3] };
  }
  const now = new Date();
  return {
    y: String(now.getUTCFullYear()),
    m: String(now.getUTCMonth() + 1).padStart(2, "0"),
    d: String(now.getUTCDate()).padStart(2, "0"),
  };
}

/** MPEG Layer III duration in whole seconds, or null if headers cannot be parsed. */
export function mp3DurationSeconds(buf: ArrayBuffer): number | null {
  const b = new Uint8Array(buf);
  let offset = 0;
  if (
    b.length >= 10 &&
    b[0] === 0x49 &&
    b[1] === 0x44 &&
    b[2] === 0x33
  ) {
    const size =
      ((b[6] & 0x7f) << 21) |
      ((b[7] & 0x7f) << 14) |
      ((b[8] & 0x7f) << 7) |
      (b[9] & 0x7f);
    offset = 10 + size;
  }

  const mpeg1Layer3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const mpeg2Layer3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const srMpeg1 = [44100, 48000, 32000];
  const srMpeg2 = [22050, 24000, 16000];
  const srMpeg25 = [11025, 12000, 8000];

  let samples = 0;
  let sampleRate = 0;
  let frames = 0;
  const maxFrames = 200_000;

  while (offset + 4 <= b.length && frames < maxFrames) {
    if (b[offset] !== 0xff || (b[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const b1 = b[offset + 1];
    const b2 = b[offset + 2];
    const verId = (b1 >> 3) & 3;
    const layer = (b1 >> 1) & 3;
    const bitrateIdx = (b2 >> 4) & 0xf;
    const srIdx = (b2 >> 2) & 3;
    const padding = (b2 >> 1) & 1;

    if (verId === 1 || layer !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) {
      offset += 1;
      continue;
    }

    const mpeg1 = verId === 3;
    const mpeg2 = verId === 2;
    const sr = mpeg1 ? srMpeg1[srIdx] : mpeg2 ? srMpeg2[srIdx] : srMpeg25[srIdx];
    const kbps = (mpeg1 ? mpeg1Layer3 : mpeg2Layer3)[bitrateIdx];
    if (!sr || !kbps) {
      offset += 1;
      continue;
    }

    const bitrate = kbps * 1000;
    const frameSize = mpeg1
      ? Math.floor((144 * bitrate) / sr) + padding
      : Math.floor((72 * bitrate) / sr) + padding;
    if (frameSize < 4) {
      offset += 1;
      continue;
    }

    sampleRate = sr;
    samples += mpeg1 ? 1152 : 576;
    frames += 1;
    offset += frameSize;
  }

  if (!sampleRate || samples <= 0) return null;
  return Math.round(samples / sampleRate);
}

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
