# Cloudflare Agent Boilerplate

## What this is

A starter project for building Cloudflare Agents — a Think-based chat
agent with memory, skills, workspace files, RAG, browser, schedules,
extensions, and an MCP client. Ships as the companion boilerplate to
the Nomad Coders Cloudflare Agents course.

## Stack

- **Runtime:** Cloudflare Workers + Durable Objects (one DO instance
  per agent, addressed by name)
- **Agent class:** `Think` (extends `AIChatAgent` extends `Agent`)
- **Frontend:** React 19 + Vite 8 + Tailwind 4 + shadcn-style UI
- **AI:** OpenAI through Cloudflare AI Gateway (Unified Billing).
  Swap by editing `worker/ai.ts`.
- **Storage:** R2 (skills + PDFs + screenshots), Vectorize (RAG),
  DO SQLite (workspace files, chat history, chunk text)

## Repo layout

```
worker/
  index.ts             Worker entry — HTTP routing + DO re-export
  chat-agent.ts        ChatAgent class (the Think extension)
  ai.ts                AI Gateway helpers — change model here
  ingest.ts            Markdown chunker for RAG ingest
  tools/               One tool per file. See README "Adding a tool".
src/
  App.tsx              Main shell. Two columns + 9 tabbed panels.
  chat/                Chat UI (Chat, Message, Markdown)
  panels/              One panel per file. See README "Adding a panel".
  components/ui/       shadcn-style primitives (button, input, tabs…)
  lib/utils.ts         cn() helper
skills/                Markdown files seeded to R2 as on-demand context
wrangler.jsonc         All Cloudflare bindings and vars
.dev.vars.example      Local secrets template
worker-env.d.ts        Env augmentations (secrets + typed DO stub)
```

## When extending

- New tool → drop a file in `worker/tools/`, register in
  `getTools()` in `chat-agent.ts`. README has the full pattern with
  three examples (server-side, client-side, approval).
- New panel → add a file in `src/panels/`, register in `PANELS` and
  `<TabsContent>` in `App.tsx`. If it needs new agent-side data,
  extend `State` and populate it in `refreshAll()` in `chat-agent.ts`.
- New skill → drop a `.md` in `skills/`, run
  `npm run seed:skills:local`.
- Different model/provider → edit `worker/ai.ts`. The chat model and
  embeddings are both pinned there.

## Notes for AI assistants

- **NEVER scaffold features the user didn't ask for.** This is a
  boilerplate — adding speculative tools/panels makes it harder to
  fork.
- The wrangler-generated `worker-configuration.d.ts` is regenerated
  by `wrangler types`. Don't hand-edit it. Add secrets and
  type overrides to `worker-env.d.ts` instead.
- Agent `env` is `protected` — tool factories receive it as a
  separate argument (see `recall.ts`, `screenshot.ts`).
- Heavy commenting in this repo is intentional. Course buyers read
  this code; explain the WHY of non-obvious decisions.
