# 머지 전략 — 신규 baseline overlay

> **목적:** ~2주 뒤 GitHub에서 가져온 **최신 boilerplate(baseline)** 위에  
> 현재 `jinu-agent-nexus` 제품 기능을 **원할히 이식(overlay)** 하기 위한 단일 소스.  
> 작업 이력은 [`WORK_NOTES_3.md`](./WORK_NOTES_3.md) (§35~) / 아카이브 [`WORK_NOTES_2.md`](./WORK_NOTES_2.md) (§11–34) · [`WORK_NOTES.md`](./WORK_NOTES.md) (§1–10).  
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
| MyMemory | `worker/my-memory.ts`, `worker/memory-routes.ts`; prefs PK `(category, kind, target)` via `src/lib/preference-category.ts` |
| Live room | `worker/live-market-room.ts`, `src/lib/live-room.ts`, `src/live/LiveMarketRoom.tsx` |
| Identity | `src/lib/agent-identity.ts`, `src/lib/auth.tsx`, `worker/auth.ts` |
| Settings domain | `worker/chat-agent/settings.ts`, `worker/settings-routes.ts`, `src/panels/SettingsPanel.tsx` |
| Supabase | `worker/supabase.ts` |
| Report series catalog | `worker/report-series.ts` — Settings Content toggles |
| Market day reads | `worker/market-day.ts` — enabled `series_id` → mmi → item_contents |
| Report pages | `src/lib/report-pages.ts` (`REPORT_PAGES` + `REPORT_NAV_CATEGORIES`), `src/lib/brief-format.ts`, `src/reports/ReportSurface.tsx`, `ReportChat.tsx`, `ReportForYou.tsx`, `ReportFullText.tsx` — `/<slug>` 리딩 화면 + 쉘 카테고리 메뉴 |
| Report For you | `worker/market-for-you.ts` — 관심사 ∩ 리포트 → 벡터 문단 → LLM 요약; 캐시는 MyMemory `for_you_summaries` |
| Chat parts | `src/chat/ChatParts.tsx`, `src/chat/use-client-tools.ts`, `src/chat/HomeReportExits.tsx`, `src/chat/ChatHelperRail.tsx` — transcript/입력부 공용 + 홈→리포트 카테고리 출구 + 홈 왼쪽 Topics/Ask 레일 |
| Market item resolve | `worker/market-item-resolve.ts`, `worker/market-settings.ts` — ingest/query resolve without brief |
| Briefs / reports | `worker/content-briefs.ts`, `worker/item-contents.ts` (+ `item_content_i18n` localize), `worker/lib/report-keywords.ts`, `worker/lib/market-date.ts` |
| Market vectors | `worker/market-vector.ts`, `worker/market-vector-routes.ts`, `worker/market-vector-cron.ts` |
| Market topic labels | `worker/market-labels.ts`, `worker/lib/market-labels-helper.ts`, `worker/market-labels-routes.ts` |
| Voice | `worker/content-audio.ts` (barrel), `content-audio-domain.ts`, `content-audio-routes.ts`, `audio-r2.ts`, `tts.ts`, `worker/lib/voice-lang-filter.ts`, `voice-audio-cron.ts` |
| Shared load | `worker/market-memory-load.ts`, `worker/tools/market-date-resolve.ts` |
| Market tools | `worker/tools/getTodayMarketBrief.ts`, `getTodayMarketVoice.ts`, `getTodayMarketReport.ts` |
| Chat Market | `worker/chat-agent/market-intent.ts`, `market-prefetch.ts`, `market-vector-search.ts`, `market-turn-hooks.ts`, `soul-market.ts`, `user-interests.ts` |
| Tag lexicon (FE) | `src/lib/market-tag-lexicon.ts` — `metadata.tags.core` + `entities` display/expand |

### Frontend Market

| 영역 | 경로 |
|------|------|
| Panel | `src/panels/MarketPanel.tsx` (`SHOW_MARKET_WORKBENCH` slim vs folds), `ReportReader.tsx`, `report-topics.tsx`, `MyInterestsFold.tsx`, `BriefForYou.tsx`; Topics/Ask는 홈 `ChatHelperRail`; registered series → reading page |
| Libs | `src/lib/market-date.ts`, `market-suggestions.ts`, `preference-category.ts`, `topic-preference.ts`, `brief-for-you.ts`, `market-fetch.ts`, `use-market-day-data.ts`, `use-market-preferences.ts` |

### Docs (포팅 후 선택)

`WORK_NOTES.md` / `WORK_NOTES_2.md` / `WORK_NOTES_3.md` / 이 파일 — 제품 히스토리. baseline에 필수는 아님.

---

## B — 접합점 (손에 꽂기)

신규 baseline에서 **이 파일들만** 열어 제품 등록을 다시 넣는다. 로직 본문은 A에 둔다.

| 파일 | 넣을 것 (요약) |
|------|----------------|
| `worker/index.ts` | `handleNotes` / `Memory` / `Settings` / `Supabase` / `Briefs` / `Reports` / `Audio` / `MarketVector` / `MarketForYou` 체인; DO re-export (`ChatAgent`, `MyMemory`, `LiveMarketRoomAgent`); `scheduled` → voice cron + market-vector cron |
| `wrangler.jsonc` | NOTES KV, MyMemory + Live DO, AUDIO_BUCKET, `PDF_VECTOR_DB` + `MARKET_VECTOR_DB`, crons, `run_worker_first` paths, vars |
| `worker/chat-agent/ChatAgent.ts` | `marketBeforeTurn` / `marketBeforeStep` 위임; settings cleanup (이미 있으면 유지) |
| `configure-session.ts` | `MARKET_SOUL_RULES` compose (`soul-market.ts`) |
| `tools-registry.ts` | `...getMarketMemoryTools(agent, env)` merge |
| `src/App.tsx` | Market + Settings 패널 탭 / Ask bridge / `hidden_panels` → tab strip filter / 홈 왼쪽 `ChatHelperRail` (`helperOpen`) |
| `src/main.tsx` | `/live` → `LiveMarketRoom`, `matchReportPage()` → `ReportSurface` 분기 |
| `src/chat/Chat.tsx` | 서버 툴은 `onToolCall`에서 가로채지 않기; 헬퍼 드로어 토글 |
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
- [ ] Market vector cron (`5 0` + `5 1` UTC = 00:05 / 01:05; vars `MARKET_VECTOR_CRON_LANGS`)
- [ ] `npm run seed:skills:*` if skills changed

---

## 검증 순서 (포팅 직후)

1. `GET /api/supabase/health`
2. `GET /api/briefs/today` · `/api/briefs/latest-date` · `/api/reports/today` · `/api/audio/today`
3. UI: 홈 왼쪽 Topics/Ask 레일 · Market Brief / Voice / Report + Settings `content_lang`
4. Chat: Latest 해석 (prefetch, hang 없음) · ★ interests · For you
5. `/live` Market Pulse (토큰 있으면)
6. `/daily-market-issues` 3탭 (브리프 / 나를 위한 요약 / 전문) + `POST /api/market/for-you` (§26.5)

상세 curl·Phase 맥락 → `WORK_NOTES.md` §7–§10, `WORK_NOTES_2.md` §11–§34, `WORK_NOTES_3.md` §35~.

---

## 리팩터 진행 (이 문서와 동기)

| Wave | 상태 | 요지 | 노트 |
|------|------|------|------|
| **1** | 완료 | Market seams / content-audio split / `market-memory-load` / topics+FE date | [`WORK_NOTES_2` §11](./WORK_NOTES_2.md) |
| **2** | 진행 중 | Market fetch 훅 공유 완료; 섹션 분리·App registry는 남음 | fetch: [`WORK_NOTES_3` §41.1](./WORK_NOTES_3.md) |

### 갱신 규칙

코드가 **A 목록·B 접합·C 인프라**를 바꾸면 **같은 변경 세트**에서 이 파일을 고친다  
(`.cursor/rules/update-docs.mdc`). Phase 서술·curl 결과는 `WORK_NOTES_3.md`에 두고, 여기에는 표·체크리스트만.

### 의도적으로 하지 않음 (포팅 전)

- 바인딩/경로/툴 키 rename (예외: §14.0 Vectorize PDF rename + Market index — Sources 미사용 시점에 완료)
- baseline `ChatAgent` 대수술
- §14 벡터 **챗 prefetch `interestHits` 교체** (리포트 페이지 For you는 §26.5 완료; 챗 ★ prefetch는 아직 문자열 매칭)
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
| 2026-09-12 | Chat 「keyword」 vector search ([`WORK_NOTES_2` §14.3](./WORK_NOTES_2.md)) |
| 2026-09-12 | Tag lexicon from report metadata ([`WORK_NOTES_2` §14.4](./WORK_NOTES_2.md)) |
| 2026-09-12 | Docs → `docs/` + [`ROUTING.md`](./ROUTING.md) 단일 소스 ([`WORK_NOTES_2` §17](./WORK_NOTES_2.md)) |
| 2026-09-12 | Topic body labels B안 — A + B index ([`WORK_NOTES_2` §18](./WORK_NOTES_2.md)) |
| 2026-09-14 | Settings Market Content (`report_series` + `disabled_report_series`) — A + ROUTING ([`WORK_NOTES_2` §19](./WORK_NOTES_2.md)) |
| 2026-09-14 | Market day API + same-date series tabs — A + ROUTING ([`WORK_NOTES_2` §20](./WORK_NOTES_2.md)) |
| 2026-09-14 | Vector ingest mmi batch (Settings ON) — A ([`WORK_NOTES_2` §21](./WORK_NOTES_2.md)) |
| 2026-09-14 | Chat vector scope = Market tab (`market_focus_series_id`) — A + B settings ([`WORK_NOTES_2` §22](./WORK_NOTES_2.md)) |
| 2026-09-14 | `/daily-market-issues` 리포트 전용 페이지 — A + B `main.tsx` + ROUTING ([`WORK_NOTES_2` §26](./WORK_NOTES_2.md)) |
| 2026-09-14 | 리포트 페이지 사이드 채팅 + `ChatParts` 분리 — A ([`WORK_NOTES_2` §26.3](./WORK_NOTES_2.md)) |
| 2026-09-14 | 리포트 3탭 + For you 요약 — A + B `index.ts` + ROUTING ([`WORK_NOTES_2` §26.5](./WORK_NOTES_2.md)) |
| 2026-09-15 | Market vector ingest cron `5 0`/`5 1` — A + B scheduled + C ([`WORK_NOTES_2` §29](./WORK_NOTES_2.md)) |
| 2026-09-16 | `worker/lib/` helpers (`market-date`, `voice-lang-filter`, `report-keywords`, `market-labels-helper`) — A ([`WORK_NOTES_2` §31](./WORK_NOTES_2.md)) |
| 2026-09-17 | `/daily-market-issues` includes weekly companion slots — A + ROUTING ([`WORK_NOTES_2` §32](./WORK_NOTES_2.md)) |
| 2026-09-17 | `/weekly-ai-issues` report page registry — A + ROUTING ([`WORK_NOTES_2` §33](./WORK_NOTES_2.md)) |
| 2026-09-17 | 홈 → 리포트 페이지 출구 — A `Chat.tsx` + ROUTING ([`WORK_NOTES_2` §34](./WORK_NOTES_2.md)) |
| 2026-09-17 | Market 패널 「이 리포트 크게 보기」 — A `MarketPanel` ([`WORK_NOTES_2` §34.1](./WORK_NOTES_2.md)) |
| 2026-09-17 | 좁은 폭 헤더·패널 — B `App`/`Chat` ([`WORK_NOTES_2` §34.2](./WORK_NOTES_2.md)) |
| 2026-09-17 | 좁은 폭 패널 드로어 — B `App`/`Chat` ([`WORK_NOTES_2` §34.4](./WORK_NOTES_2.md)) |
| 2026-09-17 | 작업노트 → `WORK_NOTES_3` (§35~) — docs ([`WORK_NOTES_3` §35](./WORK_NOTES_3.md)) |
| 2026-09-17 | 헤더 Market 카테고리 메뉴 — A `report-pages` / `HomeReportExits` ([`WORK_NOTES_3` §36](./WORK_NOTES_3.md)) |
| 2026-09-19 | 홈 왼쪽 Chat helper 레일 — A `ChatHelperRail` + B `App`/`Chat` ([`WORK_NOTES_3` §41](./WORK_NOTES_3.md)) |
| 2026-09-19 | 홈 Market fetch 훅 공유 — A `market-fetch` / `use-market-day-data` / `use-market-preferences`; Wave 2 일부 ([`WORK_NOTES_3` §41.1](./WORK_NOTES_3.md)) |
| 2026-09-19 | 홈 Market 패널 슬림 — A `SHOW_MARKET_WORKBENCH` ([`WORK_NOTES_3` §41.2](./WORK_NOTES_3.md)) |
| 2026-09-19 | 홈 Ask ↔ Market 날짜 동기화 — A `use-market-day-data` sharedBrowseDate ([`WORK_NOTES_3` §41.3](./WORK_NOTES_3.md)) |
| 2026-09-19 | 홈 Ask 챗 이해 도우미 톤 — A soul/prefetch/vector + Ask 칩 ([`WORK_NOTES_3` §41.4](./WORK_NOTES_3.md)) |
| 2026-09-20 | Phase 1 guest 인스턴스 — A `agent-identity` / B App·settings·memory ([`WORK_NOTES_3` §46](./WORK_NOTES_3.md)) |
| 2026-09-20 | 공유 vs 개인 데이터 경계 문서 [`INSTANCE_DATA.md`](./INSTANCE_DATA.md) ([`WORK_NOTES_3` §46.1](./WORK_NOTES_3.md)) |
| 2026-09-20 | MyMemory preferences `category` 축 — A schema + FE market scope ([`WORK_NOTES_3` §47](./WORK_NOTES_3.md)) |
| 2026-09-20 | topic_labels → shared `default` only ([`WORK_NOTES_3` §47.1](./WORK_NOTES_3.md)) |
| 2026-09-20 | Phase 2 Supabase Auth — A auth + Settings account ([`WORK_NOTES_3` §48](./WORK_NOTES_3.md)) |
