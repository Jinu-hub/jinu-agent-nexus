// ─────────────────────────────────────────────────────────────────────────
// TTS provider — Voice generation (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
//
// Keep the Worker loosely coupled to a single vendor. Phase 4 ships one
// implementation (OpenAI TTS) that covers ko / ja / en. Swap later by
// adding another class — do not scatter provider calls through
// content-audio.ts.
//
// Native Workers AI TTS (MeloTTS / Aura) is not used: those models do
// not cover Korean well enough for Market Memory briefs.
//
// Auth, in order:
//   1. OPENAI_API_KEY → api.openai.com (optional secret)
//   2. Else API_TOKEN → AI Gateway native OpenAI endpoint
//      (Unified Billing or a stored OpenAI key on the gateway)
// ─────────────────────────────────────────────────────────────────────────

export type TTSGenerateInput = {
  text: string;
  language: string;
  voice?: string;
};

export interface TTSProvider {
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  generate(input: TTSGenerateInput): Promise<ArrayBuffer>;
}

const OPENAI_TTS_CHAR_LIMIT = 4096;
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

export function ttsCharLimit(): number {
  return OPENAI_TTS_CHAR_LIMIT;
}

export function createTTSProvider(env: Env): TTSProvider {
  return new OpenAiTTS(env);
}

class OpenAiTTS implements TTSProvider {
  readonly provider = "openai";
  readonly model: string;
  readonly voice: string;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.model = env.TTS_MODEL;
    this.voice = env.TTS_VOICE;
  }

  async generate(input: TTSGenerateInput): Promise<ArrayBuffer> {
    const text = input.text.trim();
    if (!text) {
      throw new Error("TTS text is empty");
    }
    if (text.length > OPENAI_TTS_CHAR_LIMIT) {
      throw new Error(
        `TTS text exceeds ${OPENAI_TTS_CHAR_LIMIT} characters`,
      );
    }

    const voice = input.voice?.trim() || this.voice;
    const body = JSON.stringify({
      model: openAiSpeechModelId(this.model),
      input: text,
      voice,
      response_format: "mp3",
    });

    const openaiKey = this.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
      return postSpeech(OPENAI_SPEECH_URL, {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      }, body);
    }

    const token = this.env.API_TOKEN?.trim();
    if (!token) {
      throw new Error(
        "Set OPENAI_API_KEY, or API_TOKEN for OpenAI TTS via AI Gateway",
      );
    }

    const url = `https://gateway.ai.cloudflare.com/v1/${this.env.ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/openai/audio/speech`;
    return postSpeech(url, {
      Authorization: `Bearer ${token}`,
      "cf-aig-authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    }, body);
  }
}

async function postSpeech(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(summarizeTtsHttpError(res.status, text));
  }
  return res.arrayBuffer();
}

function openAiSpeechModelId(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

function summarizeTtsHttpError(status: number, body: string): string {
  const redacted = body.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  let detail = "";
  try {
    const parsed = JSON.parse(redacted) as {
      error?: { message?: string };
      message?: string;
    };
    detail = parsed.error?.message ?? parsed.message ?? "";
  } catch {
    detail = redacted.replace(/\s+/g, " ").trim().slice(0, 180);
  }

  if (status === 401) {
    return [
      "TTS request failed (401).",
      "Set OPENAI_API_KEY in .dev.vars, or enable Unified Billing / a stored OpenAI key on AI Gateway",
      "and use an API_TOKEN with Account → AI Gateway → Run.",
      detail ? `Provider: ${detail}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return detail
    ? `TTS request failed (${status}): ${detail}`
    : `TTS request failed (${status})`;
}
