# jinu-agent-nexus — Architecture Overview

> **For whom:** Project owner and collaborators who want to understand *what
> exists* and *how data flows* without reading every source file.
>
> **For implementation details:** see `CLAUDE.md` (LLM dev guide) and
> `README.md` / `README.eng.md` (setup & deploy).

---

## What this system is

A **single-user AI chat agent** that runs on Cloudflare:

- **Frontend** — React app in the browser (chat + side panels)
- **Backend** — one **Durable Object** (`ChatAgent`) per agent name (`"default"`)
- **AI** — Workers AI by default; optional AI Gateway for production
- **Storage** — DO SQLite (chat, workspace, RAG chunks), R2 (skills, PDFs,
  screenshots), Vectorize (embeddings)

The agent can chat, remember context, load skills, search uploaded PDFs,
control a remote browser, schedule reminders, write its own tools at runtime,
and connect to external MCP servers.

---

## UI layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent — jinu-agent-nexus                                       │
├──────────────────────────────┬──────────────────────────────────┤
│                              │  [Memory][Skills][Files][Tools]… │
│  Chat                        │                                  │
│  • message list              │  One panel visible at a time     │
│  • tool calls / approvals    │  (9 tabs on the right)           │
│  • input                     │                                  │
│                              │  Reads live `agent.state`        │
└──────────────────────────────┴──────────────────────────────────┘
         src/chat/Chat.tsx              src/panels/*.tsx
                    ↑                           ↑
                    └──── useAgent (WebSocket + RPC) ────┘
                                    src/App.tsx
```

---

## End-to-end request flow

```mermaid
flowchart TB
  subgraph Browser["Browser (React)"]
    App["App.tsx"]
    Chat["Chat.tsx"]
    Panels["Panels (9 tabs)"]
    App --> Chat
    App --> Panels
  end

  subgraph Worker["Cloudflare Worker"]
    Index["worker/index.ts"]
    Route{"Path?"}
    Upload["POST /api/upload"]
    Screenshots["GET /screenshots/*"]
    AgentRouter["routeAgentRequest"]
  end

  subgraph DO["Durable Object: ChatAgent"]
    Think["Think (chat + workspace + session)"]
    Tools["getTools()"]
    Refresh["refreshAll() → state"]
    Think --> Tools
    Think --> Refresh
  end

  subgraph External["Cloudflare services"]
    R2["R2: boilerplate-bucket"]
    VDB["Vectorize: boilerplate-vectorstore"]
    AI["Workers AI / AI Gateway"]
    Browser["Browser Rendering"]
  end

  Chat -->|"WebSocket + RPC"| AgentRouter
  Panels -->|"RPC (@callable)"| AgentRouter
  App --> AgentRouter

  Index --> Route
  Route -->|PDF| Upload --> DO
  Route -->|image| Screenshots --> R2
  Route -->|/agents/*| AgentRouter --> DO

  DO --> R2
  DO --> VDB
  DO --> AI
  DO --> Browser
  Refresh -->|"state sync"| Panels
```

---

## One chat turn (simplified)

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat.tsx
  participant A as ChatAgent (DO)
  participant M as Model (Workers AI / Gateway)
  participant T as Tools

  U->>C: Send message
  C->>A: WebSocket (agents SDK)
  A->>M: streamText + tool definitions
  loop Agentic loop (max 3 steps)
    M-->>A: tool call?
    A->>T: execute tool (server) or defer (client)
    T-->>A: result
    A->>M: continue with tool output
  end
  M-->>A: assistant text (stream)
  A-->>C: streamed chunks
  A->>A: refreshAll() — update panel state
  A-->>C: state broadcast
  C-->>U: rendered reply
```

**Client-side tools** (e.g. timezone): model asks → browser runs in
`Chat.tsx` `onToolCall` → result sent back to agent.

**Approval tools** (e.g. notifications): model asks → user clicks Approve/Reject
in `Message.tsx` → then server `execute` runs.

---

## Feature map

| Feature | UI (panel) | Main code | Where data lives |
|---------|------------|-----------|------------------|
| Chat | Chat (left) | `worker/chat-agent/`, `src/chat/` | DO SQLite (messages) |
| Memory | Memory | session context block `"memory"` | DO SQLite (session) |
| Skills | Skills | R2 skill provider, `skills/*.md` | R2 `skills/` |
| Workspace files | Files | Think workspace tools (`read`, `write`, …) | DO SQLite |
| Tool list | Tools | `getTools()` + extension/MCP merge | In-memory snapshot in `state` |
| PDF / RAG | Sources | `uploadPdf`, `recall.ts`, `ingest.ts` | R2 `pdfs/`, Vectorize, DO `chunks` |
| My Market Notes | (API only) | `worker/notes.ts` | Workers KV (`NOTES`) |
| My Market Memory | (API only) | `worker/my-memory.ts` | DO SQLite (`MyMemory`) |
| Market Pulse poll | `/live` page | `worker/live-market-room.ts`, `src/live/` | DO state + SQLite (`LiveMarketRoomAgent`) |
| Supabase (prep) | `GET /api/supabase/health` | `worker/supabase.ts` | External Postgres (Market Memory) |
| Content briefs | `GET /api/briefs/today` | `worker/content-briefs.ts`, `market-date.ts` | Supabase `content_briefs` |
| Market panel | Market tab | `src/panels/MarketPanel.tsx` | briefs/today + audio/today + Settings `content_lang` |
| Browser | Browser | `navigate.ts`, `screenshot.ts`, Puppeteer | Remote browser session + R2 screenshots |
| Schedules | Schedules | `setReminder.ts`, DO alarms | DO schedule store |
| Runtime tools | Extensions | `load_extension`, `worker_loaders` | Sandboxed worker per extension |
| MCP | MCP | `connectMcpServer`, etc. | External MCP servers |

---

## Custom tools (examples)

All live under `worker/tools/` and register in `getTools()` inside
`chat-agent.ts`.

| Tool file | Purpose | Runs on |
|-----------|---------|---------|
| `getCurrentTime.ts` | Current UTC time | Server |
| `getWeather.ts` | Weather via Open-Meteo | Server |
| `getUserTimezone.ts` | Browser timezone | **Client** (`Chat.tsx`) |
| `sendNotification.ts` | Browser notification | Server + **approval** |
| `setReminder.ts` | Schedule a reminder | Server (DO alarm) |
| `recall.ts` | RAG search over PDFs | Server (Vectorize + SQL) |
| `navigate.ts` | Open URL in browser | Server |
| `screenshot.ts` | Capture page → R2 | Server |
| `getTodayMarketBrief.ts` | Today's market-issue brief (`content_briefs`); `lang` = Settings `content_lang` | Server (Supabase) |
| `getTodayMarketVoice.ts` | Today's voice brief meta + play URL; `lang` = Settings `content_lang` | Server (Supabase + R2) |

Built-in **Think** tools (not in `worker/tools/`): `read`, `write`, `edit`,
`list`, `find`, `grep`, `delete`, `set_context`, `load_context`,
`unload_context`, `load_extension`, …

---

## Backend layers

```
worker/index.ts          HTTP entry — routes only, thin
    │
    ├── /notes, /notes/:key  → Workers KV (My Market Notes)
    ├── /memory/*            → MyMemory DO SQLite (preferences / events / weights)
    ├── POST /api/upload     → ChatAgent.uploadPdf()
    ├── GET  /screenshots/*  → stream from R2
    ├── GET  /api/supabase/health → Supabase reachability probe
    ├── GET  /api/briefs/today → content_briefs (Seoul market_date)
    ├── /api/audio/* → content_audio Voice pipeline (+ GET /api/audio/today)
    ├── /agents/live-market-room-agent/market-pulse → poll room WS + RPC
    └── /agents/ChatAgent/default  → WebSocket + RPC
              │
worker/chat-agent/
    ChatAgent.ts           Class — Think config, lifecycle, @callable RPC
    configure-session.ts   Prompt + memory + skills context blocks
    tools-registry.ts      getTools() registration
    refresh-state.ts       Panel state → this.state
    rag.ts                 PDF ingest, delete sources
    browser.ts             Puppeteer session, Live View URL
    reminders.ts           Scheduled reminder callback
    panel-ops.ts           clear workspace, reset session
    types.ts               State + panel view types (shared with React)
    constants.ts           Initial state, static tool lists

worker/notes.ts          KV note API (personalization seed)
worker/my-memory.ts      MyMemory DO — preferences, events, weights
worker/memory-routes.ts  HTTP → MyMemory RPC
worker/ai.ts             Model routing (@cf/ vs AI Gateway)
worker/ingest.ts         Markdown chunking for RAG
worker/tools/*.ts        One tool per file
worker/chat-agent.ts     Re-export shim (legacy import path)
```

---

## Panel state sync

Panels do **not** fetch their own data. Flow:

1. `ChatAgent.refreshAll()` reads workspace, session, SQL, schedules, tools, …
2. Writes one object to `this.state` (`State` type in `chat-agent.ts`)
3. Agents SDK broadcasts state to all connected tabs
4. `App.tsx` passes `agent.state` into each panel component

Called after: cold start, every chat turn, and most `@callable` mutations.

---

## Cloudflare bindings (current)

| Binding | Resource name | Used for |
|---------|---------------|----------|
| `ChatAgent` | DO class | Stateful agent instance |
| `MyMemory` | DO class | Personalization SQLite (preferences / events / weights) |
| `LiveMarketRoomAgent` | DO class | Market Pulse poll room — synced state + vote log |
| `NOTES` | Workers KV | My Market Notes (`/notes`) — personalization seed |
| `BUCKET` | `boilerplate-bucket` | Skills, PDFs, screenshots |
| `VECTOR_DB` | `boilerplate-vectorstore` (768-dim) | RAG embeddings |
| `AI` | Workers AI | Default models + PDF→markdown |
| `BROWSER` | Browser Rendering (remote) | Navigate / screenshot / Live View |
| `LOADER` | worker_loaders | Runtime extensions |

**Vars** (`wrangler.jsonc`): `ACCOUNT_ID`, `AI_GATEWAY_NAME`, `CHAT_MODEL`,
`EMBEDDING_MODEL`.

**Secret** (`.dev.vars` / production):
- `API_TOKEN` — Browser Live View + AI Gateway auth
- `LIVE_ROOM_TOKEN` (optional) — Market Pulse room gate
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (optional) — Market Memory

> R2/Vectorize still use `boilerplate-*` names from initial setup. The Worker
> and repo are renamed to `jinu-agent-nexus`; infra names can stay until you
> deliberately recreate resources.

---

## Frontend file map

| Path | Role |
|------|------|
| `src/main.tsx` | React entry |
| `src/App.tsx` | Layout, `useAgent`, panel tabs, theme |
| `src/chat/Chat.tsx` | Messages, input, client tools |
| `src/chat/Message.tsx` | Message rendering, tool UI, approvals |
| `src/chat/Markdown.tsx` | Markdown in replies |
| `src/panels/*.tsx` | One panel per feature tab |
| `src/components/ui/` | Shared UI primitives |

---

## Adding something new (where to look)

| You want… | Start here |
|-----------|------------|
| New capability the LLM can call | `worker/tools/` + README "Adding a tool" |
| New right-side tab | `src/panels/` + `App.tsx` `PANELS` |
| New persistent panel field | `State` in `types.ts` + `refresh-state.ts` |
| Different AI model | `wrangler.jsonc` vars → `worker/ai.ts` |
| Onboarding / deploy steps | `README.md` |
| LLM implementation rules | `CLAUDE.md` |

---

## Related docs

| Document | Audience |
|----------|----------|
| `ARCHITECTURE.md` (this file) | High-level structure & flows |
| `CLAUDE.md` | AI assistants implementing features |
| `README.md` | Setup, deploy, course-aligned how-tos |
| `README.eng.md` | English README |
