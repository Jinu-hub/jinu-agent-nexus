# jinu-agent-nexus 개발 작업노트 (계속)

> **이전 기록:** [`WORK_NOTES.md`](./WORK_NOTES.md) — §1 ~ §10.16 (아카이브. 새 기능은 여기에 추가하지 않음)  
> **이후 기록:** 이 파일만 사용. 섹션 번호는 **§11**부터.  
> **머지/포팅 체크리스트:** [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md) (A/B/C — Phase 서술 대신 여기 표 갱신)  
> **HTTP/FE 라우팅:** [`ROUTING.md`](./ROUTING.md) (단일 소스)

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
| HTTP 경로 변경 | **라우팅 트리**는 [`ROUTING.md`](./ROUTING.md)만 갱신 (단일 소스). 이 파일 해당 절에 “ROUTING 반영” 한 줄 |
| 과거 Phase 조회 | `WORK_NOTES.md`만 본다. 내용을 여기로 복사하지 않음 |

### 스타일

- `WORK_NOTES.md`와 동일: 한국어 불릿, Phase 표, curl 블록
- 코드에 없는 기능을 문서에 적지 않음
- 병렬 “그림자” 문서 대신 기존 절을 이어 씀

### 관련 문서 (코드와 같이)

`.cursor/rules/update-docs.mdc` 기준 — route/DO/tool/panel/binding 등이면 `ARCHITECTURE.md` / `CLAUDE.md` / `.dev.vars.example` 등도 같은 PR에서 갱신.  
A/B/C·포팅 Wave가 바뀌면 [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md)도 함께. HTTP 경로면 [`ROUTING.md`](./ROUTING.md).

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
| 필터 | 검색 시 `item_id`+`market_date` (기본); `lang`는 `MARKET_VECTOR_QUERY_FILTER_BY_LANG`로 재활성 가능 |
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

* **목적:** 관심사 유사도 검색. **ingest와 같이** brief/date → `item_contents.id`를 먼저 구한 뒤, 필터에 **`item_id`+`market_date`** 를 넣음 (`itemId: null` 없음).
* **§6 / ROUTING:** `POST /api/market-vector/query` 반영.
* **전제:** metadata index (`market_date`, `lang`, `item_id`) + 인덱스 생성 후 재ingest.
* **기본값:** `top_k_per_query=2`, `hit_limit=3` (짧은 다이제스트 ~4–5청크 기준; 관심사 여러 개여도 거의 전부 반환 방지).
* **lang 필터 (임시 off):** `MARKET_VECTOR_QUERY_FILTER_BY_LANG = false` — Vectorize filter에서 `lang` 제외 (같은 item의 ko/en 청크 모두 매칭 가능). resolve·응답 `lang`·metadata·인덱스는 유지. 다시 켜려면 상수 `true`.

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
  * **답 포맷 (2026-09-12):** `vectorSearchInstructionClause` 고정 템플릿 — `**「표시어」**` + 불릿 2–4(빈 줄) + Market 탭 한 줄; score/vector 메타 출력 금지
  * **lexical 예외 (2026-09-14):** `minScore` 미만이어도 청크 `text`에 쿼리 문자열이 있으면 채택 (`textIncludesQuery`) — NVIDIA 중심 문단의 Hugging Face 등 누락 방지
  * **Ask 문구 (2026-09-14):** Topics 칩=`… 관련 내용에 대해 설명해줘` (`짧게 짚어줘` 제거)
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

## 17. Docs 폴더화 + 라우팅 트리 분리

* **목적:** 루트에 쌓인 프로젝트 문서를 `docs/`로 모으고, HTTP/FE 라우팅 트리를 [`ROUTING.md`](./ROUTING.md) 단일 소스로 분리 (WORK_NOTES §6.2 거슬림 해소).
* **ROUTING 반영:** 현재 Worker·FE 트리는 `ROUTING.md`만 유지. `WORK_NOTES.md` §6.1은 §7 스냅샷 아카이브만.
* **머지:** 문서 위치만 — A/B/C 코드 경계 변경 없음. [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md) 변경 로그만.

**수정 및 추가 파일**

* `docs/` — `README.md`, `README.eng.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `MERGE_STRATEGY.md`, `WORK_NOTES.md`, `WORK_NOTES_2.md` *(이동)*
* `docs/ROUTING.md` *(신규)* — HTTP/FE 라우팅 트리
* 루트 `README.md` / `CLAUDE.md` — `docs/` 포인터 스텁
* `.cursor/rules/update-docs.mdc` — `docs/…` · `ROUTING.md` 규칙
* `docs/README*.md` — `demo.jpg` → `../demo.jpg`

**확인**

* 루트 스텁 → `docs/CLAUDE.md` / `docs/README.md` 링크
* `WORK_NOTES.md` §6에 현재 트리 없음 · `ROUTING.md`에 market-vector/clear 포함

**의도적으로 안 함**

* `skills/*.md` 이동
* `demo.jpg` 이동
* 아카이브 §6.1 스냅샷 삭제
* ARCHITECTURE / CLAUDE 안의 요약 라우트 목록 전량 삭제 (ROUTING 링크만 추가)

---

## 18. Topic body labels (B안) — Tags/Keywords 본문 grounded 표시

* **목적:** Tags/Keywords·벡터 expand용 **표시어**를 본문에서 의미적으로 고른다 (영↔한 포함). DB/Ask/`target` 키는 유지. A안(표기만)은 매핑률 낮아 채택하지 않음.
* **ROUTING 반영:** `POST /api/market-labels/resolve` · `GET/POST /memory/topic-labels`
* **배치:** (예정) market-vector ingest cron **후속**. 지금은 ingest 끝에서 동일 코어 호출 + 수동 resolve API.
* **파이프라인:** `topic_labels` 캐시(긴 라벨은 polish로 단축·재저장) → exact/loose → **body hint**(슬러그별 짧은 본문 후보) → LLM grounded span → upsert
* **규칙:** Tags 탈락 없음 (실패 시 key). Keywords 본문 스팬 없으면 탈락. Tags는 본문에 없는 짧은 KO 칩(`soft` / LLM soft) 허용 — 예: `on-device-ai`→온디바이스. My interests는 star 시 `display` 고정(EN 보기에서 한글 freeze는 표시만 스킵). Ask 「」는 **표시어**; 저장/`target`은 slug. `topic_labels`는 **`(key, lang)`**.

**수정 및 추가 파일**

* `worker/market-labels.ts` *(신규)* — resolve 코어
* `worker/market-labels-routes.ts` *(신규)* — `POST /api/market-labels/resolve` (`force` / `skip_llm`)
* `worker/my-memory.ts` — `topic_labels` 테이블 · `preferences.display`
* `worker/memory-routes.ts` — `/memory/topic-labels` · preferences `display`
* `worker/market-vector.ts` — ingest 후 label resolve 훅
* `worker/index.ts` — 라우트 체인
* `worker/chat-agent/market-vector-search.ts` — expand에 topic_labels
* `src/lib/market-tag-lexicon.ts` · `topic-preference.ts` · `report-topics.tsx` · `MyInterestsFold.tsx` · `MarketPanel.tsx`
* docs (`ROUTING` / `WORK_NOTES_2` / `CLAUDE`)

**확인**

```bash
# ingest 후 labels 요약이 응답에 포함
curl -s -X POST http://localhost:5173/api/market-vector/ingest \
  -H 'content-type: application/json' \
  -d '{"date":"2026-09-11","lang":"ko"}'

# 수동 resolve (캐시 무시 재픽: force)
curl -s -X POST http://localhost:5173/api/market-labels/resolve \
  -H 'content-type: application/json' \
  -d '{"date":"2026-09-11","lang":"ko","force":true}'

curl -s 'http://localhost:5173/memory/topic-labels' | head
```

* `npx tsc -b` OK

**버그 (2026-09-12):** GLM-4.7-flash 기본 thinking이 `maxOutputTokens`를 CoT에 소진 → `generateText().text` 빈 문자열 → `resolvedBy` 전부 fallback.  
**수정:** `providerOptions["workers-ai"]`에 `reasoning_effort: null` + `chat_template_kwargs.enable_thinking: false`.

**품질 (2026-09-12):** 헤드라인 통째 픽 → 칩 부적합.  
**보완:** 프롬프트(짧은 명사구) + `polishLabel`(쉼표/%/토큰 절단, 본문 grounding 유지) + `LABEL_BODY_HINTS`(본문에 있을 때만) + 캐시 soft-refresh + `force`. 기대 예: `10y-treasury-yield`→「미 10년물 금리」, `energy-supply-shortfall`→「원유 공급」, `bonds`→「국채」, `policy-tightening`→「긴축」.  
**챗 표시:** 칩 Ask는 slug 대신 display를 「」에 넣고, 답 제목도 사용자 인용구 사용. expand는 `keysForTopicLabelDisplay`로 slug 유지.  
**lang (2026-09-12):** `topic_labels` PK `(key, lang)`. EN 패널이 KO 캐시를 쓰지 않음. `GET /memory/topic-labels?lang=en`. My interests는 contentLang=en이면 한글 preference.display 스킵.  
**Tags soft KO (2026-09-14):** 본문에 없는 slug(예: `on-device-ai`)는 임베딩 Ask는 「온디바이스」로 되는데 칩만 EN fallback이던 문제. `TAG_SOFT_DISPLAY_KO`를 Tags에 한해 exact 다음·hint 앞에 적용 (`resolvedBy: soft`). Keywords는 본문 스팬 없으면 탈락 유지.

**의도적으로 안 함**

* ingest cron 신규 스케줄 (훅만)
* 패널 오픈 시 동기 LLM
* Keywords에 soft 번역 허용 / Keywords 10개 강제
* chat 전역 thinking off (`createModel`은 그대로; label pick만 끔)

---

## 19. Settings — Market Content (`report_series` + `disabled_report_series`)

* **목적:** Settings에 **Market** 블록을 두고, Supabase `report_series` 카탈로그로 **쓸 콘텐츠 on/off**를 고른다. 기존 `content_lang`은 같은 블록의 **Language**로 이동. `is_active=false` 시리즈는 토글 불가 + `soon` 뱃지.
* **ROUTING 반영:** `GET /api/report-series`
* **저장:** ChatAgent DO SQLite `disabled_report_series` (JSON slug 배열, opt-out; 활성 카탈로그 기본 ON)

| 소절 | 내용 |
|------|------|
| **19.1** | 카탈로그 API + settings 컬럼 + Settings UI |
| **19.2** | weekly + daily market issues → 하나의 Content 토글 |

### 19.1 Phase *(완료)*

* **수정 및 추가 파일:**
  * `worker/report-series.ts` *(신규)* — `listReportSeries` + `GET /api/report-series` (service_role)
  * `worker/index.ts` — 라우트 체인
  * `worker/chat-agent/settings.ts` — `disabled_report_series` 컬럼·patch·validate (PRAGMA migrate)
  * `src/panels/SettingsPanel.tsx` — Market → Content / Language UI
  * `src/App.tsx` — `toggleReportSeries` → `updateSettings`
  * docs: `ROUTING.md`, `WORK_NOTES_2.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `MERGE_STRATEGY.md`
* **확인:**

```bash
curl -s http://localhost:5173/api/report-series | jq .
# items: weekly-ai-issues, weekly-market-issues (active) + daily-* (is_active false)

# opt-out one active series
curl -s -X PATCH http://localhost:5173/settings \
  -H 'content-type: application/json' \
  -d '{"disabled_report_series":["weekly-ai-issues"]}'
```

* UI: Settings → Market → Content 토글; daily 행은 `soon` + switch disabled
* **의도적으로 안 함:** prefetch/tools가 `disabled_report_series`를 아직 필터하지 않음 (후속 지시용 설정만)

### 19.2 Market issues 그룹 *(완료)*

* **목적:** `weekly-market-issues` + `daily-market-issues`를 Settings Content에서 **한 스위치**로 취급
* **수정 및 추가 파일:**
  * `worker/report-series.ts` — `groupReportSeriesForSettings` / `groups` 응답 필드
  * `src/panels/SettingsPanel.tsx` — groups 렌더; 토글 시 slug 배열
  * `src/App.tsx` — `toggleReportSeries(slugs[])`
* **표시:** 제목 `Market Issues Report`, detail에 두 slug; KR은 `Market Issues Report (KR)` (soon)
* **저장:** off 시 두 slug 모두 `disabled_report_series`에 추가, on 시 둘 다 제거
* **확인:** `curl -s http://localhost:5173/api/report-series | jq '.groups'`
* **의도적으로 안 함:** DB 스키마 병합 / prefetch 필터

---

## 20. Market panel — enabled series + same-day tabs

* **목적:** Settings ON인 `report_series`만 `market_memory_items.series_id`로 조회. 같은 `market_date`에 슬롯 2개 이상이면 날짜 아래 **탭**으로 brief/voice/report 전환.
* **ROUTING 반영:** `GET /api/market/day`, `GET /api/market/latest-date` (`series_id` repeat)
* **조회:** `mmi.status=done` + `current_content_id` → `item_contents`; brief/audio는 `target_id` 매칭

### 20.1 Phase *(완료)*

* **수정 및 추가 파일:**
  * `worker/market-day.ts` *(신규)* — slots + latest-date
  * `worker/report-series.ts` — `enabledReportSeriesRows`, `parseSeriesIdsFromUrl`
  * `worker/index.ts` — 라우트
  * `src/panels/MarketPanel.tsx` — `/api/market/day`, 탭 UI, `disabledReportSeries` prop
  * `src/App.tsx` — settings → MarketPanel
  * docs: `ROUTING.md`, `WORK_NOTES_2.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `MERGE_STRATEGY.md`
* **확인:**

```bash
curl -s "http://localhost:5173/api/market/day?date=2026-09-12&lang=ko\
&series_id=71754888-892c-4e88-9f3d-9d061940440d\
&series_id=54b3fc4c-3c64-4b63-b526-67d85344213a" | jq '.count, [.slots[].seriesSlug]'
# → 2 tabs: weekly-ai-issues, weekly-market-issues
```

* UI: 슬롯 1개 → 탭 없음; 2개+ → 날짜 바로 아래 탭
* **의도적으로 안 함:** chat prefetch/tools 필터; settings에 `series_id` 영구 저장 (slug opt-out + catalog uuid)

---

## 21. Market vector ingest — mmi + Settings batch (no brief)

* **목적:** Vectorize ingest가 `content_briefs`에 의존하지 않고 `market_memory_items` → `item_contents`만 사용. `date`+`lang`만 넣으면 **ChatAgent Settings ON 시리즈**를 순차 ingest.
* **ROUTING:** `POST /api/market-vector/ingest` 응답 shape 확장 (`batch` + `ingested[]` / `skipped[]`)

### 21.1 Phase *(완료)*

* **수정 및 추가 파일:**
  * `worker/market-item-resolve.ts` *(신규)* — enabled series + `listReportsForMarketDay`
  * `worker/market-settings.ts` *(신규)* — DO에서 `disabled_report_series` 읽기
  * `worker/market-vector.ts` — `ingestMarketReportsForDay`; resolve brief 제거
  * `worker/market-vector-routes.ts` — `item_id`/`series_id` 단건 vs batch
* **동작:**
  * body에 `item_id` 또는 `series_id` → **1건** ingest (기존 JSON)
  * 그 외 `date`+`lang` → Settings ON catalog series마다 mmi 조회 후 **순차 ingest**
  * 해당 날 row 없음 → `skipped` (전체 실패 아님); 1건도 ingest 못하면 404
* **확인:**

```bash
curl -s -X POST http://localhost:5173/api/market-vector/ingest \
  -H 'content-type: application/json' \
  -d '{"date":"2026-09-12","lang":"ko"}' | jq '.batch, [.ingested[].seriesSlug], .skipped'
# batch true · ["weekly-ai-issues","weekly-market-issues"] · daily skipped (no row that date)
```

* **의도적으로 안 함:** query/clear 멀티 fan-out; chat prefetch brief 경로; cron ingest

---

## 22. Chat keyword search — Market panel series focus

* **목적:** 같은 `market_date`에 시리즈가 여러 개일 때, 채팅 `vectorSearch`가 catalog **첫 슬롯(Weekly AI)** 만 보던 문제 수정. Market 패널 **선택 탭** = chat 리포트·Vectorize scope.
* **설정:** ChatAgent SQLite `market_focus_series_id` (`report_series.id`). 탭 전환 시 `updateSettings` (Settings UI 노출 없음).

### 22.1 Phase *(완료)*

* **수정 및 추가 파일:**
  * `worker/chat-agent/settings.ts` — `market_focus_series_id` 컬럼 + patch
  * `src/panels/MarketPanel.tsx` — `onMarketFocusSeriesChange`
  * `src/App.tsx` — 탭 → settings 동기화
  * `worker/chat-agent/market-prefetch.ts` — focus 시 `listReportsForMarketDay`로 `loadReport`; vector에 `seriesId`/`itemId`
  * `worker/chat-agent/market-vector-search.ts` — `queryMarketVectors`에 scope 전달
* **확인:** Market → **Weekly Market** 탭 → `2026-09-12` → 채팅에서 `「Qualcomm」` 리포트 질문 → vector hits·답변에 해당 시리즈 본문 반영 (Weekly AI만 ingest/search 하던 경우와 대비).
* **버그픽스:** `enabledSeriesIds` 배열 identity가 settings 갱신(focus sync)마다 바뀌며 `setDate(null)` → latest로 되감김 → effect deps를 `enabledSeriesKey` 문자열만 쓰도록 수정.
* **의도적으로 안 함:** 멀티 시리즈 vector merge; getTodayMarketReport tool mmi 전환; focus 없을 때 query fan-out

---

## 23. Report UI — hide duplicate summary blurb (selected series)

* **목적:** Weekly AI / Weekly Market / Daily Market 리포트는 `summary`가 본문 lead와 중복되는 경우가 많아 Market Report의 **회색 summary 블록만** 숨김. 다른 시리즈(예: KR)는 summary 유지. 본문 문자열은 자르지 않음.
* **수정:** `worker/report-series.ts` — `hidesReportSummaryBlurb`; `src/panels/MarketPanel.tsx` — 패널·모달 summary 조건부 표시
* **의도적으로 안 함:** content 본문 trim; chat excerpt/`summary` 필드 변경; `daily-market-issues-kr` 숨김

---

## 24. Full report modal — same topic labelMap as Topics

* **목적:** 와이드 Report 리더의 Tags/Keywords가 패널 Topics와 다른 라벨(slug vs 한글)로 보이던 문제 — `ReportReaderModal`에 `topicLabelMap` 미전달이 원인.
* **수정:** `ReportReader.tsx` + `MarketPanel.tsx` — `labelMap` prop 연결; Report/모달 열 때도 `fetchTopicLabels`
* **의도적으로 안 함:** Keywords의 COMPANY/TECHNOLOGY 섹션 prefix 제거 (의도된 구분)

---

## 25. Settings Market — collapsible fold

* **목적:** Settings의 Market(Content/Language)을 Panel tabs와 같은 여닫이로. 접힌 요약: `ko · 2/2 series`.
* **수정:** `src/panels/SettingsPanel.tsx` — `marketOpen` + ChevronDown
* **의도적으로 안 함:** 기본 펼침; Content/Language 각각 별도 여닫이

---

## 26. 리포트 전용 페이지 — `/daily-market-issues` (Brief 아티클)

* **목적:** 리포트 종류가 늘어나고(마켓 외 다른 카테고리 포함) 각 콘텐츠가 어느 정도 **정해진 포맷**을 갖기 때문에, 사이드 패널이 아니라 **메인 프레임 전용 화면**에서 읽기 좋은 템플릿으로 보여준다. 첫 단계는 `daily-market-issues`의 **Brief만**.
* **ROUTING 반영:** FE `/daily-market-issues` (`?date=` `?lang=`)
* **경로 규칙:** URL = `/<report_series.slug>`. `src/lib/report-pages.ts`의 `REPORT_PAGES`에 등록된 slug만 라우팅되고, 나머지는 기존처럼 Market 패널 전용.
* **라우터 미도입:** `/live`와 같은 방식 — `src/main.tsx`의 pathname 분기 (SPA fallback은 `wrangler.jsonc`에 이미 있음).

### 26.1 Phase 1 — Brief 템플릿 *(완료)*

* **데이터 소스:** `content_briefs.metadata`가 이미 구조화되어 있어 **본문 파싱이 아니라 메타데이터**를 템플릿에 그린다.

| metadata | 화면 |
|----------|------|
| `pulse` | 리드 문단 |
| `highlights[] {title, summary}` | `01 / 02 / 03` 번호 섹션 |
| `market_reaction[] {label, value, direction}` | Market reaction 리스트 (↗/↘) |
| `takeaway` | 하단 Takeaway 블록 |

* `highlights`가 없는 과거 row → `parseBriefBody()`가 본문 텍스트(리드 + `1.` `2.` 번호 항목)에서 복원하는 **폴백**.
* **수정 및 추가 파일:**
  * `src/lib/report-pages.ts` *(신규)* — `REPORT_PAGES` 등록부 + `matchReportPage()`
  * `src/lib/brief-format.ts` *(신규)* — `parseBriefParts()` (metadata) + `parseBriefBody()` (텍스트 폴백)
  * `src/reports/ReportSurface.tsx` *(신규)* — 전체 화면 아티클 (헤더 + 날짜 네비 + Brief 템플릿)
  * `src/main.tsx` — `matchReportPage()` 분기 추가
  * docs: `ROUTING.md`, `WORK_NOTES_2.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `MERGE_STRATEGY.md`
* **읽는 API (에이전트 연결 없음, Market 패널과 동일):**
  * `GET /settings` → `content_lang` (`?lang=`이 있으면 그쪽 우선)
  * `GET /api/report-series` → slug → series row
  * `GET /api/market/latest-date` → 초기 날짜
  * `GET /api/market/day` → 해당 날 brief
* **확인:**

```bash
curl -s "http://localhost:5173/api/market/day?date=2026-09-11&lang=ko\
&series_id=596797cb-3007-43b4-9c47-d19ee8991a78" | jq '.slots[0].brief.metadata | keys'
# → ["highlights","market_date","market_reaction","pulse","takeaway","topic"]
```

  * `http://localhost:5173/daily-market-issues` → Latest(`2026-09-11`) 자동 로드, 제목·리드·`01~03`·Market reaction·Takeaway 렌더 OK
  * `?date=2026-09-13` (미발행) → "Nothing published for this day" + 최신일 안내
  * `/` 기존 채팅 쉘 회귀 없음
* **의도적으로 안 함:** 같은 화면 안 채팅(다음 단계); Voice / 풀리포트 / Topics 섹션; 다른 slug 페이지 등록; 날짜 변경 시 URL 동기화; `disabled_report_series` 기반 접근 차단(직접 URL은 의도로 봄)

### 26.2 Warm paper 테마 *(완료)*

* **목적:** 리딩 화면만 따뜻한 톤으로 — 크림 종이 배경 + 웜 잉크 + 주황 액센트 1개. 에이전트 쉘의 중립 팔레트(`index.css` 상단 주석의 "industry-neutral" 결정)는 **건드리지 않음**.
* **적용 방식:** `.report-warm` 래퍼에서 테마 CSS 변수(`--background` / `--foreground` / `--card` / `--border` / `--primary` …)를 **재선언**만 한다. 하위의 `bg-background`·`text-muted-foreground` 등 기존 유틸리티가 그대로 새 값으로 해석되므로 클래스 교체가 필요 없다. `.dark .report-warm`에 다크 대응 값.
* **팔레트 (레퍼런스 시안에서 추출):** paper `#f4f3ee` · card `#fbfaf6` · border `#e2e0d9` · ink `#1c1b15` · accent `#f55531` (`index.css`에는 파일 규칙대로 oklch로 기재)
* **수정 및 추가 파일:**
  * `src/index.css` — `.report-warm` / `.dark .report-warm` 토큰 블록
  * `src/reports/ReportSurface.tsx` — 래퍼에 `report-warm`; eyebrow/섹션 라벨 주황 대문자, headline `text-4xl font-extrabold`, 하이라이트를 카드(`rounded-xl border bg-card`) + 주황 번호, Market reaction 카드, Takeaway는 반전 카드(`bg-foreground text-background`), 헤더 컨트롤 pill(`rounded-full`)
* **확인:** `/daily-market-issues` 라이트·다크 모두 OK; `/` 채팅 쉘 중립 팔레트 회귀 없음
* **의도적으로 안 함:** 전역 테마 웜 전환; Market 패널·채팅에 적용; 시리즈별 액센트 색 분기

### 26.3 Phase 2 — 사이드 채팅 *(완료)*

* **목적:** 리포트를 읽으면서 같은 화면에서 물어보기. 리포트가 메인, 채팅은 오른쪽 보조 컬럼.
* **스코프 고정 (핵심):** 채팅의 Market 범위는 ChatAgent 설정 `market_focus_series_id` 하나이고, 원래는 Market 패널 탭이 바꾼다. 리포트 페이지는 series 해석 직후 이 값을 **자기 시리즈로 PATCH**한다. 안 하면 패널에서 마지막에 고른 시리즈를 답한다.
* **채팅 파트 분리:** `Chat.tsx`는 쉘 전용 크롬(브랜드 헤더 / 테마 토글 / Reset session)을 갖고 있어 400px 컬럼에 그대로 넣을 수 없다. transcript·입력부만 `ChatParts.tsx`로 빼고 각 surface가 헤더·empty state를 직접 조립한다.
* **수정 및 추가 파일:**
  * `src/chat/ChatParts.tsx` *(신규)* — `ChatMessageList`(`empty` prop) + `ChatComposer` + `ChatHelpers`/`AgentForChat` 타입
  * `src/chat/use-client-tools.ts` *(신규)* — `useClientToolCall` (`getUserTimezone`); 컴포넌트 파일과 분리해 fast-refresh 경고 회피
  * `src/chat/Chat.tsx` — 위 파트 사용으로 축소 (동작 변경 없음)
  * `src/reports/ReportChat.tsx` *(신규)* — 슬림 채팅 (헤더 + 날짜 고정 제안 + Clear/Hide)
  * `src/reports/ReportSurface.tsx` — `useAgent`, `market_focus_series_id` PATCH, 2컬럼 레이아웃, 헤더 `Ask` 버튼
  * `src/lib/market-suggestions.ts` — `reportPageSuggestions(marketDate)` (화면의 날짜를 프롬프트에 박아 "Latest"/"어제" 해석에 의존하지 않음)
* **레이아웃:** `lg` 이상 → 오른쪽 인플로우 컬럼 `26rem`; 그 아래 → 오른쪽에서 덮는 오버레이(`max-lg:fixed`). 기본은 닫힘, 헤더 `Ask`로 연다.
* **확인:**

```bash
# 페이지 진입 후 — 채팅 스코프가 이 시리즈로 고정됐는지
curl -s http://localhost:5173/settings | jq -r .market_focus_series_id
# → 596797cb-3007-43b4-9c47-d19ee8991a78 (daily-market-issues)
```

  * `Ask` → 제안 4개가 `2026-09-11`로 박혀서 표시; 1440px 2컬럼(1024 + 416), 좁은 창은 오버레이
  * `/` 채팅 쉘 회귀 없음 (ChatParts 분리 후)
* **의도적으로 안 함:** 리포트 본문에서 드래그 → 질문; 페이지 이탈 시 `market_focus_series_id` 복원; 채팅 열림 상태 기억; Voice / 풀리포트 섹션

### 26.4 Phase 3 — Voice 재생 UI *(완료)*

* **목적:** 그 날짜에 보이스가 있으면 아티클 안에서 바로 듣기. **있을 때만** 표시하고, 없으면 자리 표시자·안내 없이 아무것도 그리지 않는다 (Market 패널의 `EmptyHint`와 다른 선택 — 리딩 화면은 빈 섹션을 두지 않는다).
* **데이터 소스:** 추가 요청 없음. Brief를 가져오는 `GET /api/market/day`의 같은 slot에 `voice: { playPath, item { title, duration_seconds, lang_code } }`가 이미 들어온다. `slots[0].voice`를 brief와 함께 상태에 담는다.
* **위치:** 메타 라인(`날짜 · brief_type · lang`) 바로 아래, 리드 문단 위. Brief가 있을 때만 그리는 블록 안이라 "Nothing published" 상태에서는 자연히 안 보인다.
* **플레이어:** Market 패널·채팅 말풍선과 같은 네이티브 `<audio controls preload="metadata">` (fallback `Download MP3` 링크). 감싸는 카드만 warm 톤 — `rounded-xl border bg-card`, 주황 `LISTEN` 라벨, 우측에 `54s · ko`.
* **수정 및 추가 파일:**
  * `src/reports/ReportSurface.tsx` — `VoiceSlot` 타입, `voice` 상태(브리프 로드/에러 시 동시 갱신), `VoicePlayer` 컴포넌트

* **확인:**

```bash
curl -s "http://localhost:5173/api/market/day?date=2026-09-11&lang=ko\
&series_id=596797cb-3007-43b4-9c47-d19ee8991a78" | jq '.slots[0].voice.item'
# → { "title": "글로벌 시장 이슈 (260911)", "duration_seconds": 54, "lang_code": "ko" }
```

  * `/daily-market-issues?date=2026-09-11` → `LISTEN` 카드 + `0:00 / 0:54` 렌더, 재생 OK
  * 날짜 이동(← `2026-09-10`) → `audio[src]`가 해당 날짜 파일로 교체됨 (48767178-… )
* **의도적으로 안 함:** 커스텀 트랜스포트(배속/스크럽/파형); 자동 재생; 보이스 없을 때 "Voice pending" 안내; 하이라이트별 구간 점프; 채팅 답변의 보이스와 상태 공유

---

