# jinu-agent-nexus — AI Development Guide

> Human docs: `README.md` (KO), `README.eng.md` (EN), `ARCHITECTURE.md` (flows),
> `MERGE_STRATEGY.md` (baseline overlay A/B/C), `WORK_NOTES_2.md` (active work log).
> This file is for **LLM-assisted development** — architecture, extension
> patterns, and constraints. Not a copy of the README.

## Project identity

- **Name:** `jinu-agent-nexus` (Worker, package, UI subtitle)
- **Origin:** Forked from Nomad Coders Cloudflare Agent Boilerplate
- **Remote:** `https://github.com/Jinu-hub/jinu-agent-nexus.git` — never push
  to nomadcoders upstream
- **Agent instance name:** `"default"` (single-user). For multi-user, mint a
  per-user name in `worker/index.ts` and pass it from the frontend `useAgent`
  hook

## Stack (do not reinvent)

| Layer | Tech |
|-------|------|
| Runtime | Cloudflare Workers + Durable Objects (SQLite per agent) |
| Agent | `Think` → `AIChatAgent` → `Agent` (`worker/chat-agent/`) |
| Frontend | React 19, Vite 8, Tailwind 4, shadcn-style UI |
| Chat hook | `@cloudflare/ai-chat/react` → `useAgentChat` |
| AI routing | `worker/ai.ts` — model from `wrangler.jsonc` vars |
| Tools | Vercel AI SDK `tool()` + Zod schemas |

## Current Cloudflare config

| Item | Value |
|------|-------|
| Worker name | `jinu-agent-nexus` |
| R2 bucket | `boilerplate-bucket` (binding `BUCKET`) |
| Workers KV | binding `NOTES` — My Market Notes (`/notes`) |
| Vectorize (PDF) | `pdf-vectorstore`, **768-dim** (binding `PDF_VECTOR_DB`) |
| Vectorize (Market) | `market-memory-vectorstore`, **768-dim** (binding `MARKET_VECTOR_DB`) |
| Default chat model | `@cf/zai-org/glm-4.7-flash` (Workers AI, free tier) |
| Default embed model | `@cf/baai/bge-base-en-v1.5` (768-dim, must match Vectorize) |
| AI Gateway name | `agent-boilerplate` (unused until non-`@cf/` models) |
| Voice Cron | UTC `0 0 * * *` + catch-up `0 1 * * *` (`voice-audio-cron.ts`) |
| Live poll room DO | `LiveMarketRoomAgent` (binding + class), room `market-pulse` |
| Secrets | `API_TOKEN`, `LIVE_ROOM_TOKEN` (optional), `SUPABASE_*` (optional) in `.dev.vars` / `wrangler secret put` |

**Embedding dimension rule:** Changing `EMBEDDING_MODEL` may require dropping
and recreating **both** Vectorize indexes (`pdf-vectorstore`,
`market-memory-vectorstore`). See `worker/ai.ts` and README "Switching
models".

## Architecture in one pass

```mermaid
flowchart LR
  subgraph FE["src/"]
    App["App.tsx\nuseAgent"]
    Chat["chat/Chat.tsx"]
    Panels["panels/*.tsx"]
  end

  subgraph WK["worker/"]
    Index["index.ts"]
    Agent["chat-agent/\nChatAgent.ts"]
    Tools["tools/*.ts"]
  end

  subgraph CF["Bindings"]
    R2["BUCKET"]
    VDB["PDF_VECTOR_DB"]
    MVDB["MARKET_VECTOR_DB"]
    AI["AI / Gateway"]
  end

  Chat --> App
  Panels --> App
  App -->|"WS + RPC"| Index
  Index --> Agent
  Agent --> Tools
  Agent --> R2
  Agent --> VDB
  Agent --> MVDB
  Agent --> AI
  Agent -->|"setState"| Panels
```

**Request routing (`worker/index.ts`):**

- `POST/GET /notes`, `GET /notes/:key` — Workers KV (My Market Notes)
- `/memory/*` — MyMemory DO SQLite (preferences, events, weights)
- `/live` — SPA-served Market Pulse poll room (LiveMarketRoomAgent over WS)
- `GET /api/supabase/health` — Supabase connectivity probe (Market Memory prep)
- `GET /api/briefs/today` — `content_briefs` daily market-issue text (Seoul `market_date`)
- `GET /api/briefs/latest-date` — newest `market_date` with a final brief (data-backed Latest)
- `GET /api/reports/today` — `item_contents` full report via `content_briefs.target_id` (+ `item_content_i18n` overlay by `lang`)
- `POST /api/market-vector/ingest` — chunk+embed report → `MARKET_VECTOR_DB`
- `POST /api/market-vector/query` — interest similarity search (+ date/lang/item filters)
- `POST /api/upload` — PDF upload (not RPC; large FormData)
- `/screenshots/*` — R2 screenshot proxy
- Everything else → `routeAgentRequest` → ChatAgent DO
- **Must** `export { ChatAgent }` from `worker/index.ts`

**Where to edit (common tasks):**

```mermaid
flowchart TD
  Task{"User asks for…"}
  Task -->|new tool| T1["worker/tools/new.ts"]
  T1 --> T2["chat-agent/tools-registry.ts"]
  T2 --> T3{"client-side?"}
  T3 -->|yes| T4["Chat.tsx onToolCall"]
  T3 -->|approval| T5["Message.tsx UI"]

  Task -->|new panel| P1["src/panels/NewPanel.tsx"]
  P1 --> P2["App.tsx PANELS + TabsContent"]
  P2 --> P3{"needs new data?"}
  P3 -->|yes| P4["types.ts + refresh-state.ts"]

  Task -->|new skill| S1["skills/*.md"]
  S1 --> S2["seed:skills:local/remote"]

  Task -->|model change| M1["wrangler.jsonc vars"]
```

## Repo layout

```
worker/
  index.ts             Worker entry — HTTP routing + DO re-export
  notes.ts             My Market Notes — Workers KV API (`/notes`)
  my-memory.ts         MyMemory DO — preferences / events / weights
  memory-routes.ts     HTTP routes → MyMemory
  live-market-room.ts  Market Pulse poll room Agent — state + vote log
  supabase.ts          Supabase client factory + `/api/supabase/health`
  content-briefs.ts    content_briefs today read (`/api/briefs/today`)
  item-contents.ts     item_contents full report (`/api/reports/today` via brief.target_id; `item_content_i18n` by lang)
  market-vector.ts     Market report → MARKET_VECTOR_DB ingest (§14)
  market-vector-routes.ts  HTTP `POST /api/market-vector/ingest`
  report-keywords.ts   Compact tags/places/entities for chat/prefetch (T3)
  market-date.ts       Calendar YYYY-MM-DD helpers (default Asia/Seoul)
  market-memory-load.ts resolve→fetch→retry for brief/voice/report tools+prefetch
  content-audio.ts     Voice barrel (re-exports domain + routes)
  content-audio-domain.ts  content_audio queue / TTS→R2 / today
  content-audio-routes.ts  HTTP handlers for `/api/audio/*`
  chat-agent.ts        Re-export shim (imports use this path)
  chat-agent/
    ChatAgent.ts       Class — lifecycle + @callable RPC
    configure-session.ts
    soul-market.ts     Market RULE 5–7 (omit when porting without Market)
    tools-registry.ts  getBoilerplateTools + getMarketMemoryTools
    refresh-state.ts
    market-turn-hooks.ts beforeTurn/beforeStep Market seam
    market-intent.ts   Market / weather intent detection
    market-prefetch.ts beforeTurn Market Memory JSON inject
    rag.ts
    browser.ts
    reminders.ts
    panel-ops.ts
    types.ts           State types (imported by React panels)
    constants.ts
    settings.ts
  ai.ts                Model routing — change provider logic here
  ingest.ts            Markdown chunker for RAG ingest
  tools/               One tool per file. See "Extension patterns" below.
src/
  App.tsx              Main shell + tab registry (PANELS array)
  chat/                Chat UI (Chat, Message, Markdown)
  panels/              One panel per file (+ `report-topics.tsx` for Market Topics)
  components/ui/       shadcn-style primitives
  lib/utils.ts         cn() helper
  lib/market-date.ts   Seoul YMD helpers for Market panel (mirrors worker)
skills/                Markdown files seeded to R2 as on-demand context
wrangler.jsonc         All Cloudflare bindings and vars
worker-env.d.ts        Env augmentations (secrets + typed DO stub)
.dev.vars.example      Template for local secrets
```

## File map — where to change what

| Task | Files |
|------|-------|
| New server tool | `worker/tools/*.ts` → register in `worker/chat-agent/tools-registry.ts` |
| New client tool | Same + handler in `src/chat/Chat.tsx` `onToolCall` |
| Approval tool | Same + `needsApproval` on tool; UI in `Message.tsx` |
| New panel | `src/panels/*.tsx` → `PANELS` + `<TabsContent>` in `src/App.tsx` |
| Panel needs new data | Extend `State` in `chat-agent/types.ts` → `refresh-state.ts` |
| New skill | `skills/*.md` → `npm run seed:skills:local` or `:remote` |
| Change model | `wrangler.jsonc` vars only (usually no code change) |
| AI provider logic | `worker/ai.ts` |
| PDF ingest / chunking | `worker/ingest.ts`, RAG in `worker/tools/recall.ts` + `chat-agent/rag.ts` (`PDF_VECTOR_DB`) |
| Market report vectors | `worker/market-vector.ts` + `market-vector-routes.ts` — ingest + query; chat 「keyword」 via `market-vector-search.ts` → prefetch `vectorSearch` |
| My Market Notes (KV) | `worker/notes.ts` + `wrangler.jsonc` `kv_namespaces` |
| My Market Memory (DO SQLite) | `worker/my-memory.ts` + `memory-routes.ts`; panel interests UI `src/lib/topic-preference.ts` + `MyInterestsFold.tsx`; chat prefetch `user-interests.ts` (P3) |
| Market Pulse poll room | `worker/live-market-room.ts` + `src/live/LiveMarketRoom.tsx` + `src/lib/live-room.ts` |
| Supabase (Market Memory) | `worker/supabase.ts` + `SUPABASE_*` secrets in `.dev.vars` |
| Content briefs (today) | `worker/content-briefs.ts` + `market-date.ts` → `GET /api/briefs/today` + `GET /api/briefs/latest-date`; chat tool `worker/tools/getTodayMarketBrief.ts` (lang = Settings `content_lang`; omit date = data-backed latest) |
| Full reports (today) | `worker/item-contents.ts` → `GET /api/reports/today`; primary `item_contents` + `item_content_i18n` overlay when `lang` ≠ primary `lang_code`; chat tool `getTodayMarketReport.ts` (excerpt + compact `keywords` via `report-keywords.ts`; lang = Settings `content_lang`) |
| Market panel (sidebar) | `MarketPanel.tsx` + `ReportReader.tsx` + `report-topics.tsx` + `MyInterestsFold.tsx` + `BriefForYou.tsx` + `src/lib/market-date.ts` + `src/lib/market-tag-lexicon.ts` (display/expand from `metadata.tags.core` + `metadata.entities`; Ask/save stay slug/name); Topics chips/Keywords in `report-topics.tsx` (re-exported by ReportReader); off-switches unchanged; wired in `App.tsx` |
| ChatAgent settings | `worker/chat-agent/settings.ts` — alarm/cleanup + `content_lang` (ko\|en) + `hidden_panels` (tab strip); UI `src/panels/SettingsPanel.tsx`; App filters `PANELS` |
| Market Memory intent | `market-turn-hooks.ts` + `market-intent.ts` + `market-prefetch.ts` + `market-vector-search.ts` + `soul-market.ts` + `market-memory-load.ts` — prefetch (`toolChoice: none`); 「keyword」 → `vectorSearch` (expand via report tag lexicon); ★ `interestHits` string match; beforeStep fallback for weather / no prefetch |
| Voice audio pipeline | `content-audio.ts` barrel + `content-audio-domain.ts` / `content-audio-routes.ts` + `voice-audio-cron.ts` (UTC `0 0` + catch-up `0 1`) → `/api/audio/*`; today play + tool `getTodayMarketVoice.ts` |
| New secret | `.dev.vars.example` + `worker-env.d.ts` + user's `.dev.vars` |
| Generated types | `npm run cf-typegen` → `worker-configuration.d.ts` (**never hand-edit**) |
| UI chat shell | `src/chat/Chat.tsx`, `Message.tsx`, `Markdown.tsx` — empty state shares Market Memory suggestions |
| Voice in-chat player | `src/chat/Message.tsx` — `<audio>` when `getTodayMarketVoice` returns `playPath` |

## Extension patterns

### Tool factory conventions

- One file per tool under `worker/tools/`
- Export `createXxxTool()` factory (not a bare tool object)
- Use `tool()` from `"ai"` + `inputSchema: z.object({...})`
- Tool **key** in `getTools()` = LLM-visible name (e.g. `getWeather`)

**Needs `env` or agent?** Pass explicitly — `this.env` is `protected`:

```ts
recall: createRecallTool(this, this.env),
setReminder: createSetReminderTool(this),
```

Reference implementations:

- Server + API: `getWeather.ts`
- Server + Market Memory read: `getTodayMarketBrief.ts` (uses `content-briefs.ts`; `lang` from Settings `content_lang`)
- Server + Market Memory Voice: `getTodayMarketVoice.ts` (uses `content-audio.ts` → playPath; `lang` from Settings `content_lang`)
- Server + Market Memory Report: `getTodayMarketReport.ts` (uses `item-contents.ts`; summary/excerpt/highlights + compact `keywords`; `lang` from Settings `content_lang`)
- Server + agent: `setReminder.ts`, `recall.ts`, `screenshot.ts`
- Client-side (no execute): `getUserTimezone.ts` → resolve in `Chat.tsx`
- Approval: `sendNotification.ts`

### Panel / state sync

- `State` type lives in `worker/chat-agent/types.ts`
- `refreshPanelState()` in `refresh-state.ts` is the **single writer** for panel state
- Called from `onStart`, `onChatResponse`, and after mutating RPCs
- Frontend reads `agent.state` — do not duplicate state in React unless UI-only

### Callable RPC methods

- Add `@callable()` methods on `ChatAgent` for panel actions (upload, MCP
  connect, etc.)
- After mutations that affect panels → call `await this.refreshAll()`

## Hard rules for AI assistants

1. **Never scaffold features the user didn't ask for** (extra tools, panels,
   bindings).
2. **Minimize diff** — match existing patterns and comment style.
3. **Do not edit** `worker-configuration.d.ts` — run `npm run cf-typegen`.
4. **Do not commit** `.dev.vars` or secrets.
5. **Do not rename** R2/`boilerplate-bucket` casually. Vectorize is
   `pdf-vectorstore` + `market-memory-vectorstore` (do not merge
   casually — unified search is fan-out later).
6. **Preserve course-style comments** in worker code when touching nearby
   lines.
7. **Peer deps:** `@cloudflare/shell`, `@ai-sdk/react` are direct
   dependencies; avoid conflicting npm `overrides`.

## Common tasks → checklist

### "Add a tool"

1. Create `worker/tools/myTool.ts` (copy closest pattern)
2. Import + register in `tools-registry.ts`
3. If client-side → `Chat.tsx` `onToolCall`
4. If uses secret → `worker-env.d.ts` + `.dev.vars.example`
5. No panel change unless user asked

### "Add a panel"

1. Create `src/panels/MyPanel.tsx` (copy existing + `PanelHeader`)
2. Add to `PANELS` in `App.tsx`
3. If new state field → `types.ts` + `refresh-state.ts`
4. Wire `@callable` on agent if panel needs actions

### "Switch to AI Gateway"

1. Create gateway in Cloudflare dashboard
2. Set `CHAT_MODEL` / `EMBEDDING_MODEL` to `provider/model-id` in
   `wrangler.jsonc`
3. Ensure `API_TOKEN` with AI Gateway → Run
4. See README "Before production — switch to AI Gateway"

### "Deploy"

1. `npm run deploy`
2. `npx wrangler secret put API_TOKEN` for production secrets
3. `npm run seed:skills:remote` if skills changed

## Local dev pitfalls (known)

| Symptom | Fix |
|---------|-----|
| `Cannot find name 'Env'` | `npm run cf-typegen` |
| `vite: command not found` | `npm install` |
| `@cloudflare/shell` missing | `npm install @cloudflare/shell` |
| `@ai-sdk/react` missing | already in dependencies; `npm install` |
| `EOVERRIDE` on npm install | Don't duplicate `@ai-sdk/react` in `overrides` |
| `@cloudflare/workers-types` lint | `npm install -D @cloudflare/workers-types` |
| Browser Live View 404 locally | Expected without remote browser + `API_TOKEN` |
| `listStoredTargets does not exist` | RPC mismatch; often non-blocking in dev |

## Intentionally not in boilerplate

Do not add unless user explicitly requests (see README Recipes):

- Voice (`@cloudflare/voice`)
- Email (`send_email` binding)
- MCP Server expose (outbound)
- Workflows / sub-agents

## README pointer

Use README for step-by-step setup, deploy, MCP connection UI, and course
phase recipes. Use `ARCHITECTURE.md` for human-readable feature maps and
full sequence diagrams. This guide is for **implementation decisions**, not
onboarding.
