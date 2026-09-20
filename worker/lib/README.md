# worker/lib

Worker-only helpers and small shared utilities that are **not** HTTP/domain
entrypoints. Keeps `worker/` root for routes, domain modules, and crons.

| Put here | Keep at `worker/` root |
|----------|-------------------------|
| Pure date / filter / keyword helpers | `*-routes.ts`, `*-cron.ts`, `index.ts` |
| Tunable hint maps (`market-labels-helper`) | Domain orchestration (`market-labels.ts`, `market-vector.ts`, …) |
| Small cross-cutting utils | DO classes, ChatAgent, tools factories |

## Current modules

| File | Role |
|------|------|
| `market-date.ts` | Seoul/calendar `YYYY-MM-DD` helpers |
| `voice-lang-filter.ts` | Voice cron lang include/exclude |
| `report-keywords.ts` | Compact report keywords for chat/prefetch |
| `market-labels-helper.ts` | Topic label body hints + span/polish |
| `market-vector-defaults.ts` | Vectorize query knobs (chat topK/minScore + HTTP defaults + 「keyword」 query aliases) |
| `my-memory-stub.ts` | `MyMemory` DO stub by instance name |
| `chat-ui-topic-map.ts` | Chat keyword chips + topic_labels (user + shared `default` fallback) |

FE-shared code stays in `src/lib/` (e.g. `market-tag-lexicon.ts`, FE `market-date.ts` mirror).
