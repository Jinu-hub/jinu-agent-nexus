# jinu-agent-nexus 개발 작업노트 (계속)

> **이전 기록:** [`WORK_NOTES.md`](./WORK_NOTES.md) — §1 ~ §10.16 (아카이브. 새 기능은 여기에 추가하지 않음)  
> **이후 기록:** 이 파일만 사용. 섹션 번호는 **§11**부터.  
> **머지/포팅 체크리스트:** [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md) (A/B/C — Phase 서술 대신 여기 표 갱신)

---

## 기록 규칙 (이 파일)

비트리비얼 작업(새 route / binding / secret / tool / panel / Phase / 동작 변경)은 **같은 변경 세트**에 아래를 남긴다. 순수 typo·스타일만이면 생략.

### 섹션에 넣을 것

1. **목적** — 왜 / 무엇이 바뀌는지
2. **수정 및 추가 파일** — 경로 + *(신규)* 여부 + 한 줄 역할 (가능한 한 완전하게)
3. **확인** — curl / UI 체크 / 로컬 검증 결과
4. **의도적으로 안 함** — 스코프 밖 항목

### 번호·위치

| 항목 | 규칙 |
|------|------|
| 새 큰 기능 | `## 11.` … `## 12.` … (정수 절) |
| 같은 절 안의 단계 | `### 11.1` Phase / 버그픽스 소절 |
| HTTP 경로 변경 | **라우팅 트리**는 [`WORK_NOTES.md` §6](./WORK_NOTES.md)만 갱신 (단일 소스). 이 파일 해당 절에 “§6 반영” 한 줄 |
| 과거 Phase 조회 | `WORK_NOTES.md`만 본다. 내용을 여기로 복사하지 않음 |

### 스타일

- `WORK_NOTES.md`와 동일: 한국어 불릿, Phase 표, curl 블록
- 코드에 없는 기능을 문서에 적지 않음
- 병렬 “그림자” 문서 대신 기존 절을 이어 씀

### 관련 문서 (코드와 같이)

`.cursor/rules/update-docs.mdc` 기준 — route/DO/tool/panel/binding 등이면 `ARCHITECTURE.md` / `CLAUDE.md` / `.dev.vars.example` 등도 같은 PR에서 갱신.  
A/B/C·포팅 Wave가 바뀌면 [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md)도 함께.

---

## 11. Portability refactor — 이식성 정리 (Wave 1+)

* **목적:** 기능을 늘리지 않고, ~2주 뒤 **신규 baseline overlay 포팅**을 쉽게 하기 위해 제품 모듈(A)을 두껍게·접합점(B)을 얇고 선택 가능하게 정리한다. 공개 HTTP/툴 키/바인딩 이름은 변경하지 않음.
* **§6:** 라우트 추가 없음 → `WORK_NOTES.md` §6 미변경.
* **머지 전략:** A/B/C·검증·Wave 표는 [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md)가 단일 소스 (본 절은 구현 이력).

| 소절 | 내용 |
|------|------|
| **11.1** | Market seams optionalize — turn hooks / soul RULE 5–7 / tools registry split |
| **11.2** | `content-audio` domain/routes + barrel |
| **11.3** | `withResolvedMarketDate` (+ `metaString`) tools·prefetch 공통화 |
| **11.4** | ReportReader topics 분리 + FE `market-date` 헬퍼 |

### 11.1 Market seams *(완료)*

* **목적:** ChatAgent 접합점에서 Market을 빼기 쉽게 — hooks / soul / tools 모듈 분리
* **수정 및 추가 파일:**
  * `worker/chat-agent/market-turn-hooks.ts` *(신규)* — `marketBeforeTurn` / `marketBeforeStep`
  * `worker/chat-agent/soul-market.ts` *(신규)* — RULE 5–7 (`MARKET_SOUL_RULES`)
  * `worker/chat-agent/ChatAgent.ts` — hooks 위임; `marketPrefetchReady` public
  * `worker/chat-agent/configure-session.ts` — soul에 `MARKET_SOUL_RULES` compose
  * `worker/chat-agent/tools-registry.ts` — `getBoilerplateTools` + `getMarketMemoryTools` → `getChatTools`
* **확인:** 동작 동일 (prefetch 시 `toolChoice: none`, 툴 키 불변). `tsc --noEmit` OK
* **의도적으로 안 함:** intent 정규식·callable·State 변경

### 11.2 content-audio split *(완료)*

* **목적:** ~1080줄 단일 파일을 domain / HTTP로 분리, import 경로 `./content-audio` 유지
* **수정 및 추가 파일:**
  * `worker/content-audio-domain.ts` *(신규)* — queue/TTS/R2 도메인
  * `worker/content-audio-routes.ts` *(신규)* — `handleAudioRequest` + 라우트 핸들러
  * `worker/content-audio.ts` — barrel re-export
  * `worker/voice-audio-cron.ts` — domain 직접 import (순환 의존 방지)
* **확인:** 공개 `/api/audio/*`·export 심볼 동일. §6 미변경
* **의도적으로 안 함:** 라우트/응답 shape 변경

### 11.3 market-memory-load *(완료)*

* **목적:** brief/voice/report 툴 + prefetch의 resolve→fetch→retry 중복 제거
* **수정 및 추가 파일:**
  * `worker/market-memory-load.ts` *(신규)* — `withResolvedMarketDate`, `metaString`
  * `worker/tools/getTodayMarketBrief.ts` / `Voice` / `Report` — 헬퍼 사용
  * `worker/chat-agent/market-prefetch.ts` — `loadBrief`/`Voice`/`Report` 헬퍼 사용
* **확인:** 반환 필드·presentation 문자열 유지
* **의도적으로 안 함:** 툴 JSON 필드명 변경

### 11.4 FE topics + market-date *(완료)*

* **목적:** Topics UI 독립 파일 + 패널 Seoul 날짜 헬퍼 공통화
* **수정 및 추가 파일:**
  * `src/panels/report-topics.tsx` *(신규)* — chips/Keywords/Entities + flags
  * `src/panels/ReportReader.tsx` — TOC/Article/Modal + topics re-export
  * `src/lib/market-date.ts` *(신규)* — `seoulYmd` / `shiftYmd` / `metaString` (worker API 미러)
  * `src/panels/MarketPanel.tsx` — 로컬 날짜·metaString 제거, lib import
* **확인:** MarketPanel import 경로(`./ReportReader`) 유지 가능
* **의도적으로 안 함:** MarketPanel fetch 훅 / App panel-registry (Wave 2)

### 11.5 Typecheck fixes *(완료)*

* **수정:** `marketBeforeTurn(agent, env, ctx)` — `env`는 ChatAgent에서 전달 (`agent.env` protected)
* **수정:** `publicQueryMessage`를 domain으로 이동(generate catch); routes는 import; 미사용 import 제거
* **확인:** `npx tsc -b` 통과

### Wave 2 (나중 · 문서만)

* MarketPanel `useMarketDayData` + Voice/Brief 섹션 컴포넌트
* Optional `panel-registry.tsx` / upload·screenshot route 추출 (`index.ts`는 이미 thin)

### 의도적으로 안 함

* 바인딩·경로·툴 키 rename (예외 §14.0 Vectorize), ChatAgent 대수술, §14 Phase 1+ 벡터 ingest/UI, 신규 기능, soul RULE **문구** 변경(파일 위치만)

---

## 12. Settings — panel tab visibility (`hidden_panels`)

* **목적:** Settings에서 사이드 패널 탭(Market~MCP)을 개별 표시/숨김. DO SQLite에 저장해 새로고침 후에도 유지. Settings 탭은 항상 노출.
* **§6:** HTTP 경로 변경 없음 (`PATCH /settings` body에 `hidden_panels`만 추가).
* **머지:** A Settings domain 확장; B `App.tsx`에 tab strip filter — [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md) B 행 갱신.

### 수정 및 추가 파일

* `worker/chat-agent/settings.ts` — `TOGGLEABLE_PANELS` / `hidden_panels` 컬럼(JSON) + migrate; patch/validate
* `src/panels/SettingsPanel.tsx` — Alarm 위 **Panel tabs** 토글 UI (기본 접힘, 여닫이)
* `src/App.tsx` — `PANELS`를 `hidden_panels`로 filter; 활성 탭이 숨겨지면 market/settings로 이동
* `CLAUDE.md` / `ARCHITECTURE.md` / `MERGE_STRATEGY.md` — Settings·App 표기 갱신

### 확인

```bash
# 숨김 저장
curl -s -X PATCH http://localhost:5173/settings \
  -H 'content-type: application/json' \
  -d '{"hidden_panels":["browser","schedules","extensions","mcp"]}'

# 복원
curl -s -X PATCH http://localhost:5173/settings \
  -H 'content-type: application/json' \
  -d '{"hidden_panels":[]}'
```

* UI: Settings → Panel tabs 토글 시 상단 탭 strip 즉시 반영. Settings는 끄기 불가.
* `npx tsc -b` OK

### 의도적으로 안 함

* Settings 탭 자체 hide
* TabsContent 언마운트(트리거는 숨기고 content 등록은 유지)
* panel-registry 분리 (Wave 2)

---

## 13. Voice Cron catch-up (UTC 01:00)

* **목적:** EN 등 upstream `script_ready`가 종종 UTC `00:00` 직후(~`00:01`+)에 들어와 **00:00 tick을 놓치면** 다음날 cron은 다른 `market_date`만 봐 영구 pending이 됨. **01:00에 동일 drain을 한 번 더** 돌려 late row를 회수. pending 0이면 TTS/R2 없이 즉시 종료.
* **§6:** 라우트 변경 없음.
* **머지:** C Voice cron 스케줄 — [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md) C 체크리스트 문구 갱신.

### 수정 및 추가 파일

* `wrangler.jsonc` — `triggers.crons`: `["0 0 * * *", "0 1 * * *"]`
* `worker/voice-audio-cron.ts` — `VOICE_AUDIO_CRON_CATCHUP` / `VOICE_AUDIO_CRONS` / `isVoiceAudioCron`
* `worker/index.ts` — `scheduled`가 두 cron 모두 수용
* `CLAUDE.md` / `MERGE_STRATEGY.md` / `ARCHITECTURE.md` — 스케줄 표기

### 확인

```bash
# 수동 drain (전날 market_date + lang filter — 로컬에서 cron과 동일)
curl -s -X POST http://localhost:5173/api/audio/cron/run

# scheduled 시뮬레이션 (dev 재시작 후; catch-up 표현식)
curl -s "http://localhost:5173/cdn-cgi/handler/scheduled?cron=0+1+*+*+*"
```

* 01:00 tick도 `targetMarketDate = previous UTC day` (00:00과 동일 창).
* 이미 `completed`인 ko는 pending 목록에 없음 → 재생성 없음.
* **프로덕션:** `wrangler.jsonc` 변경 후 **redeploy** 해야 Cloudflare triggers에 01:00이 등록됨.

### 의도적으로 안 함

* 과거 쌓인 `script_ready` 일괄 backfill (날짜 필터 유지)
* cron 시각을 01:00만으로 이동 (00:00 primary 유지)
* Queues / retry-on-failed

---

## 14. Vector interest search (§10.14 착수)

* **목적:** MyMemory 관심사로 **당일 풀 리포트 문단**을 벡터 검색 (Brief 문자열 `includes` / keyword exact의 한계 해소). PDF RAG와 **인덱스 분리**.
* **아카이브 TODO:** [`WORK_NOTES.md` §10.14](./WORK_NOTES.md) — 구현 이력은 이 절.
* **§6:** Phase 0 라우트 없음.
* **머지:** C Vectorize 2개 + B `wrangler` 바인딩 — [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md).

### 14.0 Phase 0 — 설계 고정 + Vectorize 인프라 *(완료)*

**설계 결정**

| 항목 | 결정 |
|------|------|
| 인덱스 | **분리** — PDF `pdf-vectorstore` / Market `market-memory-vectorstore` |
| 바인딩 | `PDF_VECTOR_DB` / `MARKET_VECTOR_DB` (구 `VECTOR_DB` + `boilerplate-vectorstore` rename; Sources 0건이라 재ingest 없음) |
| dim / 모델 | 둘 다 768 + 기존 `EMBEDDING_MODEL` (`@cf/baai/bge-base-en-v1.5`) |
| metadata (Market) | **필수** `item_id`, `market_date`, `lang`; 선택(나중) `report_type` / `chunk_index` |
| 벡터 id | `mr_{item_id}_{lang}_{chunk_index}` — lang별 공존 (legacy `mr_{item_id}_{i}`는 delete 시 sweep) |
| 필터 | 검색 시 `market_date`+`lang` 및/또는 `item_id` — 날짜·종류 혼입 방지 |
| 청크 원문 | Phase 1에서 확정 (metadata 발췌 vs hit 후 `item_contents` 재조회) |
| 외부 API | Worker 검색 API로 문단+score+메타 반환 가능 (숫자 배열 export는 비목표) |
| 통합 검색 | **나중** — 두 인덱스 fan-out + score merge (프롬프트로 인덱스명 지시 아님) |
| 소비처 (Phase 3) | For you / chat prefetch `interestHits` → 리포트 문단; Brief `brief-for-you`는 임시 |

**수정 및 추가 파일**

* `wrangler.jsonc` — vectorize 2 bindings
* `worker/chat-agent/rag.ts`, `worker/tools/recall.ts` — `PDF_VECTOR_DB`
* `worker/ai.ts` — recreate 주석 (양쪽 인덱스)
* `package.json` — `setup:vectorize` + `setup:vectorize:market`
* `scripts/setup.mjs` — 두 인덱스 create
* `CLAUDE.md` / `ARCHITECTURE.md` / `MERGE_STRATEGY.md` / `README.md` / `README.eng.md`

**확인**

```bash
npm run setup:vectorize
npm run setup:vectorize:market
npm run cf-typegen
npx tsc -b
```

* Sources 패널 0 — PDF rename 안전.
* `cf-typegen` + `tsc -b` OK (로컬).
* **원격 인덱스 create**는 사용자가 CLI로 실행: `npm run setup:vectorize` + `setup:vectorize:market` (또는 `npm run setup`).
* 빈 legacy `boilerplate-vectorstore`는 대시보드/CLI에서 삭제 가능 (선택).

**의도적으로 안 함 (Phase 0)**

* `item_contents` ingest / query API / For you·prefetch 교체
* PDF+Market 통합 검색
* `pgvector` / 임베딩 float export
* 타임라인 파이프라인

### 14.1 Phase 1 — Market report ingest *(완료)*

* **목적:** 당일(또는 지정) `item_contents` 본문을 청크·임베딩해 `MARKET_VECTOR_DB`에 저장. 재실행 시 동일 `item_id` 벡터를 deterministic id로 교체.
* **§6:** `POST /api/market-vector/ingest` 반영.
* **머지:** A `market-vector.ts` + routes; B `index.ts` 체인 — [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md).

**설계 (Phase 0 확정 반영)**

* 청크: 기존 `chunkMarkdown` (~800자)
* 벡터 id: `mr_{item_id}_{lang}_{chunk_index}` — 재ingest 시 해당 lang의 `0..199` (+ legacy `mr_{item_id}_{i}`) deleteByIds 후 upsert. **ko/en 공존** (같은 `item_id`라도 lang별 id)
* metadata: `item_id`, `market_date`, `lang`, `chunk_index`, `text` (Phase 2 조회용; DO SQLite 없음)
* resolve: body `item_id` 있으면 직접 로드, 없으면 brief→`getTodayItemContent` (date/lang/…)

**수정 및 추가 파일**

* `worker/market-vector.ts` *(신규)* — ingest / deleteByItem
* `worker/market-vector-routes.ts` *(신규)* — `POST /api/market-vector/ingest`
* `worker/item-contents.ts` — `getItemContentById`
* `worker/index.ts` — 라우트 체인
* `WORK_NOTES.md` §6 · `CLAUDE.md` / `ARCHITECTURE.md` / `MERGE_STRATEGY.md`

**확인**

```bash
# 데이터 있는 Latest (omit date) — lang 기본 ko
curl -s -X POST http://localhost:5173/api/market-vector/ingest \
  -H 'content-type: application/json' \
  -d '{}'

# 특정일
curl -s -X POST http://localhost:5173/api/market-vector/ingest \
  -H 'content-type: application/json' \
  -d '{"date":"2026-09-11","lang":"ko"}'

# item_id 직접
curl -s -X POST http://localhost:5173/api/market-vector/ingest \
  -H 'content-type: application/json' \
  -d '{"item_id":"<uuid>"}'
```

* 기대 JSON: `{ ok, itemId, marketDate, lang, chunks, deletedIds, title }`
* `npx tsc -b` OK
* **로컬 검증 (OK):** `date=2026-09-11` `lang=ko` → `chunks:4`, `itemId=3f236446-…`, 동일 요청 재호출도 동일 (재ingest 안정)
* `deletedIds` = lang sweep(0..199) + legacy id sweep(0..199) → 최대 400 (실제 삭제 수 아님)
* **id에 lang (B안):** `mr_{itemId}_{lang}_{i}` — ko ingest 후 en ingest 해도 ko 벡터 유지
* **로컬 검증 (2026-09-12):** ko `chunks:4` + en `chunks:9` 연속 ingest → query ko hits `…_ko_*`, en hits `…_en_*` (공존 확인). `list-vectors`는 upsert 직후 empty로 보일 수 있음(쿼리 우선)

**Clear (재ingest 없이 삭제)**

* §6: `POST /api/market-vector/clear` — ingest와 동일 resolve(`date`/`lang`/`item_id`) 후 `deleteMarketVectorsForItem`
* 기대: `{ ok, itemId, marketDate, lang, deletedIds }` (`deletedIds` = lang+legacy sweep)

```bash
curl -s -X POST http://localhost:5173/api/market-vector/clear \
  -H 'content-type: application/json' \
  -d '{"date":"2026-09-11","lang":"ko"}'
```

* **로컬 검증 (2026-09-12):** Worker `clear`는 `{ ok, deletedIds:200 }` 반환하나, `remote: true` 바인딩에서 list/query에 잔여가 남을 수 있음 → `npx wrangler vectorize delete-vectors market-memory-vectorstore --ids …` 로 원격 인덱스 9건 enqueue 삭제 확인. 이후 `list-vectors` empty · query hits 0.

**의도적으로 안 함**

* 유사도 쿼리 API / For you·prefetch 교체 (14.2–14.3)
* 일배치 cron ingest
* PDF+Market 통합 검색 / metadata index 튜닝
* `report_type` 필터 필드 (나중)
* 인덱스 전체 wipe (`list-vectors` 후 일괄 삭제) — 현재는 item 단위만
* Worker clear의 remote 바인딩 delete 신뢰성 조사 (CLI로 우회 확인만)

### 14.2 Phase 2 — 관심사 쿼리 *(완료)*

* **목적:** 관심사 유사도 검색. **ingest와 같이** brief/date → `item_contents.id`를 먼저 구한 뒤, 필터에 **`item_id`+`market_date`+`lang`을 항상** 넣음 (`itemId: null` 없음).
* **§6:** `POST /api/market-vector/query` 반영.
* **전제:** metadata index (`market_date`, `lang`, `item_id`) + 인덱스 생성 후 재ingest.
* **기본값:** `top_k_per_query=2`, `hit_limit=3` (짧은 다이제스트 ~4–5청크 기준; 관심사 여러 개여도 거의 전부 반환 방지).

**수정 및 추가 파일**

* `worker/market-vector.ts` — `queryMarketVectors` (`resolveItemForIngest` 재사용)
* `worker/market-vector-routes.ts` — query (Supabase로 id resolve)
* `package.json` / `scripts/setup.mjs` — `setup:vectorize:market-meta`
* docs (§6 / CLAUDE / ARCH / MERGE)

**확인**

```bash
curl -s -X POST http://localhost:5173/api/market-vector/query \
  -H 'content-type: application/json' \
  -d '{"date":"2026-09-11","lang":"ko","queries":["물가","에너지"]}'
```

* 기대: `{ ok, itemId: "3f236446-…", marketDate, lang, queries, hits:[…] }`

**의도적으로 안 함**

* For you / ★ prefetch 벡터 교체 (나중)
* MyMemory preferences 자동 로드 (호출측에서 queries 전달)
* 일배치 cron / 통합 검색

### 14.3 Phase 3 — 챗 벡터 검색 *(완료)*

* **목적:** 사용자가 챗에서 하는 **평범한 키워드 검색**을 벡터로. Topics 칩/`「키워드」` → `queryMarketVectors` → 문단만으로 답.
* **§6:** 라우트 추가 없음 (기존 query API 재사용).
* **동작:**
  * 유저 말에서 `「…」` / `"…"` 추출 + `YYYY-MM-DD`면 그 날짜
  * prefetch에 `vectorSearch` (`minScore` 0.68; 리포트 `metadata.tags.core` lexicon으로 expand — 하드코딩 맵 없음)
  * hits 있으면 **그 문단만** 근거; 없으면 “가까운 내용 없음”
* **미룸:** For you / ★관심사 prefetch 벡터 교체

**수정 및 추가 파일**

* `worker/chat-agent/market-vector-search.ts` *(신규)*
* `worker/chat-agent/market-prefetch.ts` — `withVectorSearch`
* `worker/chat-agent/soul-market.ts` — `vectorSearch` 규칙
* docs (CLAUDE / ARCH / MERGE)

**확인**

1. ingest된 `2026-09-11`에서 Topics 칩/`「키워드」` → `vectorSearch.hits` (또는 empty)
2. `npx tsc -b` OK

**의도적으로 안 함**

* For you UI 벡터화
* ★목록 자동 벡터 prefetch
* 일배치 cron / 여러 itemId 검색

### 14.4 Phase 3b — 태그 lexicon (메타 라벨) *(완료)*

* **목적:** 하드코딩 동의어 맵 대신 **리포트 메타**의 slug + 표시라벨/aliases 사용. UI는 표시만, 저장·Ask `「slug」`는 영어 유지.
* **스키마 (producer):** `item_contents.metadata.tags.core[]`
  * `{ tag|slug, label_ko?, label?, display?, aliases?: string[] }`
  * 선택: `metadata.tag_labels` / `tagLabels` — `{ [slug]: "한글" }`
* **동작:**
  * UI Topics/My interests — `label_ko`→`label`→`display`→slug 순으로 표시
  * 벡터 expand — 같은 lexicon의 aliases + display (슬러그/별칭 reverse lookup 포함)
  * 모델 프롬프트에는 lexicon dump 안 함 (서버 expand 전용)
* **현재 데이터:** core에 `aliases`는 있음, `label_ko`는 아직 없음 → **표시는 slug 유지** until pipeline이 `label_ko` 채움. 벡터는 aliases로 표기 흔들림 완화.
* **entities:** `metadata.entities.*` 문자열/`{name, aliases, label_ko}`도 **같은 lexicon**에 편입. 기존 태그 slug/alias와 이름·느슨한 키가 겹치면 merge(별도 엔트리 중복 방지).

**수정 및 추가 파일**

* `src/lib/market-tag-lexicon.ts` *(신규)* — tags.core + entities
* `src/panels/report-topics.tsx` / `MyInterestsFold.tsx` / `MarketPanel.tsx`
* `worker/chat-agent/market-prefetch.ts` / `market-vector-search.ts`
* docs (CLAUDE / WORK_NOTES_2)

**확인**

1. `npx tsc -b` OK
2. Topics Ask는 여전히 `「cpi」` / entity 원문 등 저장 키 유지
3. `「Federal Reserve」` / `「shipping」`도 lexicon에 등록되어 expand 경로 타는지 (aliases 없으면 자기 자신 + normalize)
4. `label_ko` 넣으면 UI에 한글 표시 (파이프라인 쪽 작업)

**의도적으로 안 함**

* Worker가 KO 번역을 생성/하드코딩
* entities에 없는 동의어를 코드에서 발명

### 16 Full report i18n overlay (`item_content_i18n`) *(완료)*

* **목적:** Settings `content_lang` / `?lang=`에 맞춰 풀리포트 `title`·`summary`·`content`를 채운다.  
  `item_contents.lang_code` = **주 언어**, 번역은 `item_content_i18n` (`item_content_id` + `lang_code`).
* **동작:**
  1. brief → `target_id` → `item_contents` (기존)
  2. 요청 `lang`이 primary와 다르면 `item_content_i18n`에서 비어 있지 않은 `content` 행을 overlay
  3. i18n 없으면 primary 그대로 (fallback)
  4. overlay 후 `item.lang_code` = 요청 lang (패널/툴이 실제 본문 언어와 일치)
  5. chat highlights: `## 하이라이트` + `## Highlights` 모두 인식
* **§6:** 라우트 추가 없음

**수정 및 추가 파일**

* `worker/item-contents.ts` — `localizeItemContent()`; `getTodayItemContent` / `getItemContentById(lang?)`
* `worker/tools/getTodayMarketReport.ts` — EN Highlights 헤딩
* `worker/market-vector.ts` — ingest `itemId` 경로도 `lang` overlay
* docs (CLAUDE / ARCH / MERGE / WORK_NOTES_2)

**확인**

```bash
curl -sS 'http://localhost:5173/api/reports/today?date=2026-09-11&lang=ko' \
  | python3 -c 'import json,sys; i=json.load(sys.stdin)["item"]; print(i["lang_code"], (i["title"] or "")[:60])'
# ko · 한국어 제목

curl -sS 'http://localhost:5173/api/reports/today?date=2026-09-11&lang=en' \
  | python3 -c 'import json,sys; i=json.load(sys.stdin)["item"]; print(i["lang_code"], (i["title"] or "")[:60], (i["content"] or "")[:80])'
# en · Global Market Issues… · This edition…
```

로컬 확인 결과 (2026-09-12):
* `lang=ko` → `lang_code: ko`, 한국어 title/content (primary)
* `lang=en` → `lang_code: en`, EN title + `This edition…` content (`item_content_i18n`)
* `npx tsc -b` OK

**의도적으로 안 함**

* brief/voice 자체 i18n 테이블 (이미 lang별 row)
* ja 등 Settings에 없는 lang UI
* i18n 없을 때 found:false로 바꾸기 (primary fallback 유지)

---

