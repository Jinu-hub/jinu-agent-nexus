# 머지 전략 — 신규 baseline overlay

> **목적:** ~2주 뒤 GitHub에서 가져온 **최신 boilerplate(baseline)** 위에  
> 현재 `jinu-agent-nexus` 제품 기능을 **원할히 이식(overlay)** 하기 위한 단일 소스.  
> 작업 이력은 [`WORK_NOTES_2.md`](./WORK_NOTES_2.md) / 아카이브 [`WORK_NOTES.md`](./WORK_NOTES.md).  
> 이 파일은 **무엇을 복사·무엇을 손으로 꽂을지**만 유지한다.

---

## 원칙

1. **A 복사** — 제품 전용 모듈은 파일 단위로 새 baseline에 복사
2. **B 접합** — baseline 파일에는 짧은 import·등록·라우트만 (두껍게 쓰지 않음)
3. **C 인프라** — git 밖 (secrets, KV/R2/DO, cron)은 별도 체크리스트
4. **이름 고정** — 포팅 직전까지 바인딩·`/api/*`·툴 키 rename 금지 (한 번에 맞출 것)
5. **기능보다 경계** — 신규 대형 기능은 baseline 이후; 지금은 A 두껍게 / B 얇게

```text
지금 ──(리팩터·이 문서 갱신)──▶ 동결
                               │
약 2주 후 ── 신규 baseline 클론 ──▶ A 복사 → B 재적용 → C → 검증
```

---

## 방식

**권장: Overlay** (신규 baseline 클론 → A 복사 → B 패치 → C → curl/UI 검증)

3-way merge는 fork-base SHA가 명확하고 baseline rename이 적을 때만.  
현재는 overlay를 기본으로 둔다.

| 기록할 것 | 상태 |
|-----------|------|
| 이 레포(제품) remote | `https://github.com/Jinu-hub/jinu-agent-nexus.git` |
| 최초 baseline / fork SHA | *(미기입 — 알면 여기 태그)* |
| 다음 baseline remote/URL | *(클론 시점에 기입)* |

---

## A — 복사 목록 (제품 모듈)

경로가 늘거나 줄면 **같은 PR에서 이 표를 갱신**한다.

### Worker domain

| 영역 | 경로 |
|------|------|
| Notes | `worker/notes.ts` |
| MyMemory | `worker/my-memory.ts`, `worker/memory-routes.ts` |
| Live room | `worker/live-market-room.ts`, `src/lib/live-room.ts`, `src/live/LiveMarketRoom.tsx` |
| Identity | `src/lib/agent-identity.ts` |
| Settings domain | `worker/chat-agent/settings.ts`, `worker/settings-routes.ts`, `src/panels/SettingsPanel.tsx` |
| Supabase | `worker/supabase.ts` |
| Briefs / reports | `worker/content-briefs.ts`, `worker/item-contents.ts`, `worker/report-keywords.ts`, `worker/market-date.ts` |
| Market vectors | `worker/market-vector.ts`, `worker/market-vector-routes.ts` |
| Voice | `worker/content-audio.ts` (barrel), `content-audio-domain.ts`, `content-audio-routes.ts`, `audio-r2.ts`, `tts.ts`, `voice-lang-filter.ts`, `voice-audio-cron.ts` |
| Shared load | `worker/market-memory-load.ts`, `worker/tools/market-date-resolve.ts` |
| Market tools | `worker/tools/getTodayMarketBrief.ts`, `getTodayMarketVoice.ts`, `getTodayMarketReport.ts` |
| Chat Market | `worker/chat-agent/market-intent.ts`, `market-prefetch.ts`, `market-turn-hooks.ts`, `soul-market.ts`, `user-interests.ts` |

### Frontend Market

| 영역 | 경로 |
|------|------|
| Panel | `src/panels/MarketPanel.tsx`, `ReportReader.tsx`, `report-topics.tsx`, `MyInterestsFold.tsx`, `BriefForYou.tsx` |
| Libs | `src/lib/market-date.ts`, `market-suggestions.ts`, `topic-preference.ts`, `brief-for-you.ts` |

### Docs (포팅 후 선택)

`WORK_NOTES.md` / `WORK_NOTES_2.md` / 이 파일 — 제품 히스토리. baseline에 필수는 아님.

---

## B — 접합점 (손에 꽂기)

신규 baseline에서 **이 파일들만** 열어 제품 등록을 다시 넣는다. 로직 본문은 A에 둔다.

| 파일 | 넣을 것 (요약) |
|------|----------------|
| `worker/index.ts` | `handleNotes` / `Memory` / `Settings` / `Supabase` / `Briefs` / `Reports` / `Audio` / `MarketVector` 체인; DO re-export (`ChatAgent`, `MyMemory`, `LiveMarketRoomAgent`); `scheduled` → voice cron |
| `wrangler.jsonc` | NOTES KV, MyMemory + Live DO, AUDIO_BUCKET, `PDF_VECTOR_DB` + `MARKET_VECTOR_DB`, crons, `run_worker_first` paths, vars |
| `worker/chat-agent/ChatAgent.ts` | `marketBeforeTurn` / `marketBeforeStep` 위임; settings cleanup (이미 있으면 유지) |
| `configure-session.ts` | `MARKET_SOUL_RULES` compose (`soul-market.ts`) |
| `tools-registry.ts` | `...getMarketMemoryTools(agent, env)` merge |
| `src/App.tsx` | Market + Settings 패널 탭 / Ask bridge / `hidden_panels` → tab strip filter |
| `src/main.tsx` | `/live` → `LiveMarketRoom` 분기 |
| `src/chat/Chat.tsx` | 서버 툴은 `onToolCall`에서 가로채지 않기 |
| `src/chat/Message.tsx` | Voice `playPath` `<audio>` |
| `package.json` | `@supabase/supabase-js` 등 |
| `worker-env.d.ts` / `.dev.vars.example` | `SUPABASE_*`, `LIVE_ROOM_TOKEN` |

**포팅 팁:** Market 없이 올릴 때 → `market-turn-hooks` / `soul-market` / `getMarketMemoryTools` omit.

---

## C — 인프라 체크리스트

- [ ] `.dev.vars` / production secrets: `API_TOKEN`, `SUPABASE_*`, `LIVE_ROOM_TOKEN`(optional)
- [ ] NOTES KV (prod/preview)
- [ ] R2 `AUDIO_BUCKET` (`market-memory-audio`) + 기존 `BUCKET`
- [ ] Vectorize `PDF_VECTOR_DB` → `pdf-vectorstore` (768) + `MARKET_VECTOR_DB` → `market-memory-vectorstore` (768); same `EMBEDDING_MODEL`; market **metadata indexes** (`market_date`,`lang`,`item_id`) then re-ingest
- [ ] DO migrations (MyMemory / Live / ChatAgent tags)
- [ ] Voice cron schedule (`wrangler.jsonc` `triggers.crons` — `0 0` + `0 1` UTC)
- [ ] `npm run seed:skills:*` if skills changed

---

## 검증 순서 (포팅 직후)

1. `GET /api/supabase/health`
2. `GET /api/briefs/today` · `/api/briefs/latest-date` · `/api/reports/today` · `/api/audio/today`
3. UI: Market Brief / Voice / Topics / Report + Settings `content_lang`
4. Chat: Latest 해석 (prefetch, hang 없음) · ★ interests · For you
5. `/live` Market Pulse (토큰 있으면)

상세 curl·Phase 맥락 → `WORK_NOTES.md` §7–§10, `WORK_NOTES_2.md` §11.

---

## 리팩터 진행 (이 문서와 동기)

| Wave | 상태 | 요지 | 노트 |
|------|------|------|------|
| **1** | 완료 | Market seams / content-audio split / `market-memory-load` / topics+FE date | [`WORK_NOTES_2` §11](./WORK_NOTES_2.md) |
| **2** | 예정 | MarketPanel fetch 훅·섹션 분리; optional App registry / upload routes | 완료 시 A/B 표 갱신 |

### 갱신 규칙

코드가 **A 목록·B 접합·C 인프라**를 바꾸면 **같은 변경 세트**에서 이 파일을 고친다  
(`.cursor/rules/update-docs.mdc`). Phase 서술·curl 결과는 `WORK_NOTES_2.md`에 두고, 여기에는 표·체크리스트만.

### 의도적으로 하지 않음 (포팅 전)

- 바인딩/경로/툴 키 rename (예외: §14.0 Vectorize PDF rename + Market index — Sources 미사용 시점에 완료)
- baseline `ChatAgent` 대수술
- §14 벡터 **For you·prefetch 교체** (Phase 14.3; ingest·query는 §14.1–14.2 완료)
- soul RULE **문구** 변경 (파일 위치만 Wave 1에서 분리)
- PDF+Market **통합 검색** (나중 fan-out)

---

## 변경 로그

| 날짜 | 내용 |
|------|------|
| 2026-09-12 | 문서 신설. Wave 1 반영 A/B/C 초안 |
| 2026-09-12 | Settings `hidden_panels` — B `App.tsx` tab filter 표기 ([`WORK_NOTES_2` §12](./WORK_NOTES_2.md)) |
| 2026-09-12 | Voice cron catch-up `0 1` — C 체크리스트 ([`WORK_NOTES_2` §13](./WORK_NOTES_2.md)) |
| 2026-09-12 | Vectorize split/rename — C + B wrangler ([`WORK_NOTES_2` §14.0](./WORK_NOTES_2.md)) |
| 2026-09-12 | Market vector ingest — A + B index ([`WORK_NOTES_2` §14.1](./WORK_NOTES_2.md)) |
| 2026-09-12 | Market vector query + metadata indexes ([`WORK_NOTES_2` §14.2](./WORK_NOTES_2.md)) |
