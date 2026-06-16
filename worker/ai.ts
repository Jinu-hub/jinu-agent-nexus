// ─────────────────────────────────────────────────────────────────────────
// AI Gateway helpers — chat + embeddings, configurable per env var
// ─────────────────────────────────────────────────────────────────────────
//
// Two paths, picked per call by the model-ID prefix in
// wrangler.jsonc:
//
//   1. Model ID starts with "@cf/..."
//        → Runs on Workers AI via the `env.AI` binding.
//        → Zero extra setup. Free tier: 10,000 neurons / day.
//        → Default for this boilerplate so a fresh clone works
//          without an AI Gateway dance.
//
//   2. Model ID looks like "provider/model-id" (e.g. "openai/gpt-4.1-mini")
//        → Routes through Cloudflare AI Gateway's OpenAI-compat
//          endpoint.
//        → Requires AI Gateway set up + `API_TOKEN` in `.dev.vars`
//          with the **AI Gateway → Run** scope.
//        → Get Unified Billing (Cloudflare credits pay the model
//          bill — no upstream OpenAI / Anthropic key needed) plus
//          a dashboard, caching, rate limiting, fallbacks.
//        → Recommended before going to production.
//
// You set the model in `wrangler.jsonc`:
//
//   "vars": {
//     "CHAT_MODEL": "@cf/zai-org/glm-4.7-flash",
//     "EMBEDDING_MODEL": "@cf/baai/bge-base-en-v1.5"
//   }
//
// Switch chat to GPT-4.1-mini through AI Gateway?
//
//   "CHAT_MODEL": "openai/gpt-4.1-mini"
//
// One edit, restart `wrangler dev`, no code change. The provider
// detection below handles the rest.
//
// ─────────────────────────────────────────────────────────────────────────
// MODEL CATALOGUE
// ─────────────────────────────────────────────────────────────────────────
// Workers AI (no AI Gateway required):
//   https://developers.cloudflare.com/workers-ai/models/
//
//   Chat:
//     "@cf/zai-org/glm-4.7-flash"                ← default
//     "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
//     "@cf/qwen/qwen3-32b-fast"
//
//   Embeddings (dimensions MUST match the Vectorize index — see below):
//     "@cf/baai/bge-base-en-v1.5"    →  768 dims  ← default
//     "@cf/baai/bge-large-en-v1.5"   → 1024 dims
//     "@cf/baai/bge-m3"              → 1024 dims
//
// AI Gateway (gateway + API_TOKEN required, model billed via Unified Billing):
//   https://developers.cloudflare.com/ai-gateway/providers/
//
//   Chat:
//     "openai/gpt-4.1-mini"
//     "openai/gpt-4.1"
//     "anthropic/claude-sonnet-4-5"
//     "anthropic/claude-opus-4-5"
//     "google-ai-studio/gemini-2.5-flash"
//
//   Embeddings:
//     "openai/text-embedding-3-small"  → 1536 dims
//     "openai/text-embedding-3-large"  → 3072 dims
//
// ─── Vectorize dimensions ────────────────────────────────────────────────
// The embedding model's dimension count MUST match the Vectorize
// index's. Defaults in this repo: 768 (BGE base). To switch:
//
//   npx wrangler vectorize delete boilerplate-vectorstore
//   npx wrangler vectorize create boilerplate-vectorstore \
//     --dimensions=<new-dim> --metric=cosine
//
// Vectorize dimensions are immutable after creation.
// ─────────────────────────────────────────────────────────────────────────

import { createOpenAI } from "@ai-sdk/openai";
import { createWorkersAI } from "workers-ai-provider";
import type { LanguageModel, EmbeddingModel } from "ai";

// `@cf/...` is the unambiguous marker that a model lives on Workers
// AI. Everything else goes through AI Gateway's OpenAI-compat URL.
const isWorkersAiModel = (modelId: string) => modelId.startsWith("@cf/");

function pickProvider(env: Env, modelId: string) {
  if (isWorkersAiModel(modelId)) {
    return createWorkersAI({ binding: env.AI });
  }
  // AI Gateway via the OpenAI-compatible endpoint. One URL handles
  // every non-Workers-AI provider — the model ID (e.g.
  // "anthropic/claude-sonnet-4-5") tells the gateway where to route.
  //
  // The API token in `apiKey` lands in the `Authorization: Bearer`
  // header. The /compat endpoint accepts that as both the gateway
  // auth identity and the Unified Billing account. Because we
  // intentionally don't pass an upstream provider key, the gateway
  // pays the provider with Cloudflare credits.
  return createOpenAI({
    baseURL: `https://gateway.ai.cloudflare.com/v1/${env.ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/compat`,
    apiKey: env.API_TOKEN,
  });
}

export function createModel(env: Env): LanguageModel {
  return pickProvider(env, env.CHAT_MODEL).chat(env.CHAT_MODEL);
}

export function createEmbedder(env: Env): EmbeddingModel {
  return pickProvider(env, env.EMBEDDING_MODEL).textEmbeddingModel(
    env.EMBEDDING_MODEL,
  );
}
