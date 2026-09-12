// ─────────────────────────────────────────────────────────────────────────
// content_audio — barrel (domain + HTTP routes)
// ─────────────────────────────────────────────────────────────────────────
// Import path `./content-audio` stays stable for index / tools / cron / prefetch.
// Implementation: content-audio-domain.ts + content-audio-routes.ts.

export type { VoiceLangFilter } from "./voice-lang-filter";

export {
  CONTENT_AUDIO_TABLE,
  PENDING_AUDIO_STATUS,
  GENERATING_AUDIO_STATUS,
  COMPLETED_AUDIO_STATUS,
  FAILED_AUDIO_STATUS,
  DEFAULT_VOICE_LANG,
  DEFAULT_VOICE_AUDIO_TYPE,
  DEFAULT_VOICE_CONTENT_TYPE,
  listPendingContentAudio,
  claimPendingContentAudio,
  claimNextPendingContentAudio,
  getContentAudioById,
  getTodayContentAudio,
  generateVoiceAudio,
  hasUsableScript,
  isUuid,
  publicQueryMessage,
  type ContentAudioStatus,
  type ContentAudioRow,
  type PendingAudioResponse,
  type ClaimAudioResult,
  type ListPendingOptions,
  type GetTodayContentAudioOptions,
  type TodayContentAudioResult,
  type GenerateAudioResult,
} from "./content-audio-domain";

export { handleAudioRequest } from "./content-audio-routes";
