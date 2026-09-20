# jinu-agent-nexus 개발 작업노트 (계속)

> **이전 기록:**  
> - [`WORK_NOTES.md`](./WORK_NOTES.md) — §1 ~ §10.16 (아카이브)  
> - [`WORK_NOTES_2.md`](./WORK_NOTES_2.md) — §11 ~ §34 (아카이브. 새 기능은 여기에 추가하지 않음)  
> **이후 기록:** 이 파일만 사용. 섹션 번호는 **§35**부터.  
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
| 새 큰 기능 | `## 35.` … `## 36.` … (정수 절) |
| 같은 절 안의 단계 | `### 35.1` Phase / 버그픽스 소절 |
| HTTP 경로 변경 | **라우팅 트리**는 [`ROUTING.md`](./ROUTING.md)만 갱신 (단일 소스). 이 파일 해당 절에 “ROUTING 반영” 한 줄 |
| 과거 Phase 조회 | `WORK_NOTES.md` (§1–10) · `WORK_NOTES_2.md` (§11–34). 내용을 여기로 복사하지 않음 |

### 스타일

- `WORK_NOTES.md` / `_2`와 동일: 한국어 불릿, Phase 표, curl 블록
- 코드에 없는 기능을 문서에 적지 않음
- 병렬 “그림자” 문서 대신 기존 절을 이어 씀

### 관련 문서 (코드와 같이)

`.cursor/rules/update-docs.mdc` 기준 — route/DO/tool/panel/binding 등이면 `ARCHITECTURE.md` / `CLAUDE.md` / `.dev.vars.example` 등도 같은 PR에서 갱신.  
A/B/C·포팅 Wave가 바뀌면 [`MERGE_STRATEGY.md`](./MERGE_STRATEGY.md)도 함께. HTTP 경로면 [`ROUTING.md`](./ROUTING.md).

---

## 35. 작업노트 분할 — `WORK_NOTES_3` *(완료)*

* **목적:** `WORK_NOTES_2` (§11–§34)가 길어져 활성 기록을 `WORK_NOTES_3.md` (§35~)로 이어 씀.
* **수정 및 추가 파일:**
  * `docs/WORK_NOTES_3.md` *(신규)* — 활성 작업노트
  * `docs/WORK_NOTES_2.md` — 아카이브 헤더 (§11–§34)
  * `docs/WORK_NOTES.md` — 이어쓰기 포인터 → `_3`
  * `.cursor/rules/update-docs.mdc` — 활성 파일 = `_3`
  * docs: `CLAUDE.md`, `ARCHITECTURE.md`, `MERGE_STRATEGY.md`, `ROUTING.md`
* **확인:** 새 비트리비얼 작업은 `_3`에만 추가; `_2` 과거 절 링크 유지
* **의도적으로 안 함:** `_2` 본문 이동/재번호; 과거 MERGE changelog 링크 일괄 변경

## 36. 헤더 리포트 카테고리 메뉴 (Market) *(완료)*

* **목적:** 앞으로 Enter / Sports 등 카테고리를 늘릴 로드맵. 지금은 Market 하나로 `daily-market-issues` · `weekly-ai-issues`를 묶고, 호버/클릭/터치로 하위 링크 메뉴를 연다.
* **수정 및 추가 파일:**
  * `src/lib/report-pages.ts` — `REPORT_NAV_CATEGORIES` / `reportPagesForCategory()`; 페이지 `navLabel`은 메뉴 항목명
  * `src/chat/HomeReportExits.tsx` — `ReportCategoryMenu` (호버·토글·Esc·바깥 클릭); 랜딩 카드도 카테고리 그룹
  * docs: `CLAUDE.md`, `ARCHITECTURE.md`, `MERGE_STRATEGY.md`, 본 절
* **확인:** 헤더 `Market` ▾ → Market issues / Weekly AI; 빈 화면 「준비된 테마」 아래 Market 그룹
* **의도적으로 안 함:** Enter/Sports 플레이스홀더 카테고리; 사이드바 패널 탭 개편

### 36.1 헤더 Market 메뉴 — 좁은 폭에서도 유지 *(완료)*

* **목적:** 카테고리가 하나라 폭 여유가 있음 → `xl`에서 숨기지 않음.
* **수정:** `src/chat/Chat.tsx` — `ReportNavLinks` `hidden xl:flex` → 항상 `flex`
* **의도적으로 안 함:** Clear 라벨의 `xl` 접기 해제

### 36.2 슬로건 — 모바일에서만 숨김 *(완료)*

* **목적:** `Your world, a little closer.`는 모바일(`<sm`)에서만 접고, 그 이상은 표시.
* **수정:** `src/chat/Chat.tsx` — 슬로건 `xl:block` → `sm:block`

## 37. Chat 「keyword」 vector topK — entity miss 수정 *(완료)*

* **목적:** 하이라이트/키워드에 있는 고유명사(예: Intel)가 `vectorSearch.hits` empty로 나와 “없다”고 답하던 문제. 원인: 짧은 쿼리의 리터럴 청크가 cosine 3등인데 chat `topKPerQuery=2`라 lexical 예외(`textIncludesQuery`)가 후보를 못 봄.
* **수정 및 추가 파일:**
  * `worker/lib/market-vector-defaults.ts` *(신규)* — `CHAT_VECTOR_*` + HTTP `DEFAULT_TOP_K` / `DEFAULT_HIT_LIMIT`
  * `worker/chat-agent/market-vector-search.ts` — chat knobs import; `topKPerQuery` **2 → 8**, `hitLimit` 3 유지, `minScore` 0.68
  * `worker/market-vector.ts` — HTTP 기본 topK/hitLimit을 동일 모듈에서 import
  * `worker/lib/README.md` — 모듈 표
  * docs: `CLAUDE.md` (file map), 본 절
* **확인 (로컬 2026-09-18):**
  ```bash
  # chat knobs 재현 — hits≥1, chunk에 Intel
  curl -sS -X POST http://localhost:5173/api/market-vector/query \
    -H 'Content-Type: application/json' \
    -d '{"queries":["Intel"],"date":"2026-09-16","lang":"ko","topKPerQuery":8,"hitLimit":3,"minScore":0.68}'
  ```
  * 이전 `topKPerQuery:2` + `minScore:0.68` → hits 0; `8` → score~0.61 chunk0 lexical 채택
* **의도적으로 안 함:** HTTP 기본 topK(2) 상향; minScore 변경

### 37.1 Empty vectorSearch → keywords/하이라이트 문자 폴백 *(완료)*

* **목적:** Vectorize가 여전히 empty여도 Topics/하이라이트에 리터럴로 있으면 “없다”고 답하지 않게 함 (ingest 누락·스코프 어긋남 대비).
* **수정 및 추가 파일:**
  * `worker/chat-agent/market-vector-search.ts` — `buildKeywordHighlightFallbackHits` / `withKeywordHighlightFallback`; `fallback: "keywords_highlights"`; instruction에 라벨-only 시 Topics 안내
  * `worker/chat-agent/market-prefetch.ts` — empty 후 payload.report(또는 brief 경로의 report keywords/highlights)로 폴백
  * docs: 본 소절
* **확인:**
  ```ts
  // highlights에 Intel 있으면 fallback hits ≥ 1
  withKeywordHighlightFallback(
    { queries: ["Intel"], hits: [], empty: true, marketDate: null, lang: null, itemId: null },
    { highlights: ["SK하이닉스와 Intel, 첫 미국 메모리칩 …"], keywords: { companies: ["Intel"], tags: [], places: [], institutions: [], technologies: [], industries: [], products: [] } },
  )
  ```
* **의도적으로 안 함:** summary/excerpt 폴백; vector error 시 폴백; 무관한 하이라이트 전체 주입

## 38. Topic label soft/hint 튜닝 — 태그 EN fallback 완화 *(완료)*

* **목적:** `tokenization` / `regulatory-recalibration` / `finance` / `trade-friction` 등이 LLM miss 시 slug로 남는 문제. 배포는 캐시로 3개쯤 보이는데 로컬은 soft/hint 맵이 비어 EN fallback이 잦음.
* **수정 및 추가 파일:**
  * `worker/lib/market-labels-helper.ts` — 위 slug(+aliases)용 `LABEL_BODY_HINTS` · `TAG_SOFT_DISPLAY_KO` 추가
  * `worker/market-labels.ts` — Tags 경로 **hint → soft** 순으로 변경 (본문 근거 우선, soft는 본문 없을 때)
  * docs: 본 절
* **확인 (로컬 2026-09-18):**
  ```bash
  curl -sS -X POST http://localhost:5173/api/market-labels/resolve \
    -H 'Content-Type: application/json' \
    -d '{"date":"2026-09-17","lang":"ko","force":true}'
  ```
  * Tags: tokenization→hint(토큰화…), finance→hint(금융…), trade-friction→hint(무역…), regulatory-recalibration→hint/soft — EN fallback 제거
* **의도적으로 안 함:** Keywords soft(본문 없으면 탈락 유지); 전역 영한 사전

## 39. Market chat 톤 — 말투만 해요체 *(완료)*

* **목적:** 구조(`「제목」`+불릿+Market 탭)는 유지하고, 뉴스체 어미(…다/…이다)만 해요체로 부드럽게. “쉽게 말하면”·빈 오프너 강제는 어색해서 **의도적으로 안 함**.
* **수정 및 추가 파일:**
  * `worker/chat-agent/soul-market.ts` — RULE 5b = **어미만** (구조 변경·필러 금지)
  * `worker/chat-agent/market-vector-search.ts` — OUTPUT SHAPE 유지 + 해요체/필러 금지 한 줄
  * `worker/chat-agent/market-prefetch.ts` — brief/report 등 instruction 끝에 해요체 한 줄만 추가
  * `worker/chat-agent/user-interests.ts` — interestHits CRITICAL 완화(기존)
  * docs: 본 절
* **확인:** Clear chat → 「기준금리」 — 내용은 같고 어미만 ~해요/~예요인지; 불릿·제목 구조 유지
* **의도적으로 안 함:** 쉽게 말하면 리드 강제; 샘플 shape; 구조/섹션 개편

## 40. 벡터 답 줄바꿈 + 「통화정책」 회피 수정 *(완료)*

* **목적:** (1) 키워드 답이 한 덩어리 문단으로 나와 가독성 나쁨 → `- ` 불릿 + 불릿 사이 빈 줄 강제. (2) 「통화정책」은 Vectorize hit이 있는데도 모델이 “가까운 내용이 많아요 / Market 확인”으로 회피 — hit 있으면 반드시 요약; 쿼리 expand로 `monetary-policy-shifts`·기준금리 등 보강.
* **수정 및 추가 파일:**
  * `worker/lib/market-vector-defaults.ts` — `CHAT_VECTOR_QUERY_ALIASES` (통화정책↔monetary-policy-shifts 등)
  * `worker/chat-agent/market-vector-search.ts` — expand에 alias 병합; instruction에 줄바꿈·회피 금지·★ 금지
  * `worker/chat-agent/soul-market.ts` — hits 있을 때 Market 회피 금지
  * `worker/lib/market-labels-helper.ts` — monetary-policy-shifts soft/hint
  * docs: 본 절
* **확인:** Clear chat → `2026-09-18 … 「통화정책」` — BOJ/금리 사실이 불릿+빈줄로; 「희토류」도 동일 포맷
* **의도적으로 안 함:** glossary 청크 하드 필터; FE 마크다운 후처리

### 40.1 톤 흔들림 — 해요체 단일 레지스터 *(완료)*

* **목적:** 같은 세션에서 …어요 / …다 / …습니다가 섞이고, footer가 `확인할 수 있습니다`로 변형되며, 불릿이 문단으로 붕괴.
* **수정:**
  * `soul-market.ts` RULE 5b — **ONE register** (해요체 only; 다/이다/습니다 혼용 금지)
  * `market-vector-search.ts` — VOICE LOCK + OUTPUT SHAPE를 실제 마크다운 골격으로 제시; footer 문구 고정
  * `market-prefetch.ts` — brief/report instruction의 해요체 문구를 “ONLY / no mix”로 강화
* **확인:** Clear chat → 「통화정책」「반도체」 — 전 문장 해요체, `- ` 불릿+빈줄, footer 정확히 `원문·리포트는 Market 탭.`
* **의도적으로 안 함:** FE 어미 후처리; 쉽게 말하면 리드

## 41. 홈 왼쪽 Chat helper 레일 *(완료)*

* **목적:** 홈 `/`에서 챗이 주인공이 되도록 Topics + Ask-in-chat 추천을 **왼쪽 레일**로 분리. 리포트 상세(`/<slug>`)는 그대로.
* **수정 및 추가 파일:**
  * `src/chat/ChatHelperRail.tsx` *(신규)* — Latest 날짜 Topics(My interests + keywords) + `MARKET_SUGGESTIONS`; 칩 탭 → `pendingAsk`; 시리즈 탭은 `market_focus_series_id`와 동기화
  * `src/App.tsx` — 3열: helper (`xl+` 도킹 / 아래는 왼쪽 드로어) · Chat · 오른쪽 패널; `helperOpen`
  * `src/chat/Chat.tsx` — `PanelLeft` 토글(`xl` 미만); empty state에서 추천 질문 블록 제거(레일이 소유)
  * `src/panels/MarketPanel.tsx` — Topics 섹션·Ask in chat 푸터 제거; `marketFocusSeriesId`를 따라감 (wide reader 칩 Ask는 유지)
  * `src/panels/report-topics.tsx` — `SHOW_TOPICS_SECTION` 주석 (홈 레일)
  * `worker/chat-agent/soul-market.ts` · `market-prefetch.ts` · `market-vector-search.ts` · `worker/tools/getTodayMarketReport.ts` — Topics 안내를 홈 사이드바로
  * docs: `CLAUDE.md`, `ARCHITECTURE.md`, `MERGE_STRATEGY.md`, 본 절
* **확인 (로컬 2026-09-19):** 홈 `1440`에서 왼쪽 Ask 레일(Topics + 추천 칩) · `키워드만` 클릭 시 가운데 챗으로 전송 · Market 탭은 슬림 카드(§41.2) · `900`폭에서 헤더 Open helper 드로어 · `/daily-market-issues`는 기존 Ask 헤더 버튼·읽기 레이아웃 유지
* **의도적으로 안 함:** 리포트 페이지 왼쪽 레일; `HOME_CHAT_SUGGESTIONS` 삭제(레일은 전체 `MARKET_SUGGESTIONS` 사용)

### 41.1 홈 Market fetch 훅 공유 *(완료)*

* **목적:** `ChatHelperRail`과 `MarketPanel`이 같은 `/api/report-series` · `latest-date` · `day` · preferences · topic-labels를 **각자 호출**하던 중복을 제거. 코드 DRY + in-flight/TTL 캐시로 홈 마운트 시 네트워크 1회화. ★ interests는 모듈 스토어로 양쪽에 동기화.
* **수정 및 추가 파일:**
  * `src/lib/market-fetch.ts` *(신규)* — 타입 + promise 캐시(`invalidateMarketFetch` / generation subscribe)
  * `src/lib/use-market-day-data.ts` *(신규)* — `useReportSeriesCatalog` · `useMarketDayData` · `useTopicLabelMap`
  * `src/lib/use-market-preferences.ts` *(신규)* — `useSyncExternalStore` 공유 preferences + toggle/remove
  * `src/chat/ChatHelperRail.tsx` · `src/panels/MarketPanel.tsx` — 위 훅 사용; Market Refresh → 캐시 무효화 + prefs reload
  * docs: `CLAUDE.md`, `MERGE_STRATEGY.md` (Wave 2 일부), 본 소절
* **확인:** 홈 로드 시 Network에서 `report-series` / `latest-date` / `day`가 레일·패널 합쳐 각 1회(동일 키); 레일에서 ★ → Market BriefForYou 반영; Market Refresh 후 레일 Topics도 재로드
* **의도적으로 안 함:** 리포트 페이지 레일; Market 패널 섹션 컴포넌트 분리 / App panel-registry (Wave 2 나머지)

### 41.2 홈 Market 패널 슬림 *(완료)*

* **목적:** 홈 오른쪽 Market 탭은 **정보 카드 + 읽기 페이지 출구**. Brief/Voice/Report 접이식 워크벤치·인패널 Report reader는 플래그로 보관. Topics/Ask는 왼쪽 `ChatHelperRail`.
* **수정 및 추가 파일:**
  * `src/panels/MarketPanel.tsx` — `SHOW_MARKET_WORKBENCH = false`; 슬림 카드: title·meta·(시리즈별) pulse/takeaway·**Brief 본문**(`max-h` ≈ `min(32rem, 100dvh−20rem)`)·Report summary blurb·Voice·「이 리포트 크게 보기」 CTA; folds·ReportReaderModal은 `true`일 때만
  * `worker/report-series.ts` — `hidesBriefLeadSummary` (`weekly-ai-issues` / `weekly-market-issues` / `daily-market-issues`는 pulse·takeaway 생략, Brief부터)
  * docs: `CLAUDE.md`, `ARCHITECTURE.md`, `MERGE_STRATEGY.md`, 본 소절
* **확인:** 홈 Market에 Brief/Voice/Report 접이 섹션 없음 · 위 3 시리즈는 title 다음 Brief · 다른 시리즈는 pulse/takeaway 유지 · CTA → `/<slug>` · `SHOW_MARKET_WORKBENCH = true`면 기존 워크벤치
* **의도적으로 안 함:** 리포트 페이지 helper 레일; 워크벤치 코드 삭제(플래그만); Wave 2 섹션 분리

### 41.3 홈 Ask ↔ Market 날짜 동기화 *(완료)*

* **목적:** Market 날짜 피커를 바꿔도 Ask 레일이 Latest에 고정되어 Topics/칩 날짜가 어긋나던 문제 해소. 시리즈 탭은 기존 `market_focus_series_id`로 맞춤.
* **수정 및 추가 파일:**
  * `src/lib/use-market-day-data.ts` — 모듈 `sharedBrowseDate` (`useSyncExternalStore`); `pinToLatest` 제거; Ask·Market 동일 `date`/`setDate`
  * `src/chat/ChatHelperRail.tsx` — 공유 `date`로 Topics·칩·헤더·`reportPageSuggestions`; Latest일 때만 헤더에 `Latest ·`
  * `src/panels/MarketPanel.tsx` — `pinToLatest` 인자 제거
  * docs: 본 소절 · `CLAUDE.md` · `ARCHITECTURE.md` · `MERGE_STRATEGY.md`
* **확인:** Market에서 날짜 이동 → Ask 헤더·Topics가 같은 `market_date` · 시리즈 탭 클릭 시 양쪽 포커스 유지 · Latest 버튼 시 Ask도 Latest
* **의도적으로 안 함:** 리포트 페이지 레일; App으로 date lift; chat prefetch 날짜를 UI 피커에 강제

### 41.4 홈 Ask 챗 = 이해 도우미 톤 *(완료)*

* **목적:** Ask-in-chat이 검색 스니펫·한 줄 에코처럼 느껴지던 문제. 챗은 **이해를 돕는 설명**(왜 중요한지·인과)을 해요체로; 전문 덤프는 계속 Market.
* **수정 및 추가 파일:**
  * `worker/chat-agent/soul-market.ts` — RULE 5를 understanding aide로; 분석 답 깊이 권장; `쉽게 말하면` 브리지 허용
  * `worker/chat-agent/market-prefetch.ts` — brief/report/compare/reportVsBrief instruction을 설명형으로
  * `worker/chat-agent/market-vector-search.ts` — explain 감지 확대(리스크·핵심·정리 등); lead + 더 긴 불릿
  * `src/lib/market-suggestions.ts` — Ask 칩 프롬프트를 「쉽게 설명해줘」계열로
  * `src/chat/ChatHelperRail.tsx` — 푸터 카피 “이해는 챗에서…”
  * `worker/tools/getTodayMarketBrief.ts` · `getTodayMarketReport.ts` — tool 후 지시문도 설명형
  * docs: 본 소절
* **확인:** Clear chat → Ask `리스크` / `풀리포트 핵심` — 4–8문장급 설명·해요체 · Market으로만 회피하지 않음 · 전문 붙여넣기 없음
* **의도적으로 안 함:** 전문을 챗에 붙여넣기; FE 후처리; prefetch 구조 개편

### 41.5 Ask 답 길이·포맷 튜닝 *(완료)*

* **목적:** 리스크 설명은 유지. 풀리포트 **핵심**은 장황함 억제(3불릿). **브리프 vs 리포트**는 제품/비유 강의 금지·델타만. **키워드+스토리**는 **태그 맵** + 짧은 한눈 스토리.
* **수정 및 추가 파일:**
  * `worker/chat-agent/market-prefetch.ts` — report / keywordsOnly / reportVsBrief instruction OUTPUT SHAPE
  * `worker/tools/getTodayMarketReport.ts` — tool 후 지시 정렬
  * docs: 본 소절
* **확인:** Clear chat → 동일 3칩 — 핵심≈리스크 길이 · 브리프대비 서론 비유 없음 · 키워드는 태그 맵+짧은 스토리
* **의도적으로 안 함:** FE 태그 UI 렌더; soul 전면 재작성

### 41.5b 키워드 Ask = Topics와 같은 display 맵 *(완료)*

* **목적:** “태그 맵” = Settings `content_lang`용 **topic_labels + lexicon** (홈 Keywords 칩과 동일). 모델이 영어 slug를 임의 번역·나열하지 않게 `uiTopicMap`을 prefetch에 심음.
* **수정 및 추가 파일:**
  * `worker/lib/chat-ui-topic-map.ts` *(신규)* — `loadTopicLabelMap` · `buildChatUiTopicMap` · `formatChatUiTopicMapLines`
  * `worker/chat-agent/market-prefetch.ts` — keywordsOnly 시 `uiTopicMap` + OUTPUT에 KIND·display 고정
  * docs: 본 소절
* **확인:** Clear chat → 키워드 칩 — `INSTITUTION 일본은행` 식 (Topics와 같은 display) · 한눈 스토리 짧음
* **의도적으로 안 함:** FE pickTopKeywords 라운드로빈을 worker에 완전 복제; INDICATOR/PERSON metadata 전 그룹 확장

### 41.6 챗 답변 준비 중 표시 *(완료)*

* **목적:** 질문 후 prefetch/첫 토큰까지 빈 공간이 길어 “멈춘 것처럼” 보임 → UI에 준비 중 힌트.
* **수정 및 추가 파일:**
  * `src/chat/ChatParts.tsx` — `submitted` / streaming인데 assistant 본문 없을 때 `PreparingReply` (스피너·도트만)
  * docs: 본 소절
* **확인:** Ask 칩 전송 → 사용자 버블 아래 스피너 → 스트림 시작 시 사라짐 (홈·리포트 챗 공통)
* **의도적으로 안 함:** 단계별 prefetch 진행률; 영문 카피 분기

### 41.7 리포트 페이지 — 브리프 미생성 안내 *(완료)*

* **목적:** 전문만 있고 30초 브리프가 비어 있으면 탭이 허전해 보임 → 안내 문구 + 전문 탭 링크.
* **수정 및 추가 파일:**
  * `src/reports/ReportSurface.tsx` — brief 탭에서 `briefMissing` 시 `Notice` (“30초 브리프가 아직 없어요”)
  * docs: 본 소절
* **확인:** 브리프 없는 날짜 → 30초 브리프 탭에 안내 · 전문 있으면 「전문」링크 · 브리프 있는 날은 기존 BriefBody
* **의도적으로 안 함:** 브리프 자동 생성; for-you 빈 상태 개편

---

## 42. 화면+데이터 언어 (`content_lang`) — 챗 회신과 분리 *(완료)*

* **목적:** Settings 언어를 Market 접힌 블록 밖으로 꺼내 **화면 크롬 + Supabase Market Memory**에 같이 쓴다. 챗 회신 언어는 설정 없이 그 턴의 사용자 말(직접 입력 또는 칩)을 따른다.
* **수정 및 추가 파일:**
  * `src/i18n/messages.ts` *(신규)* — ko/en 사전
  * `src/i18n/ui-lang.tsx` *(신규)* — `UiLangProvider` / `useT` / 시리즈·관심사 라벨 헬퍼; `document.documentElement.lang`
  * `src/panels/SettingsPanel.tsx` — Language를 최상위 블록으로 이동; Market는 Content만
  * `worker/chat-agent/settings.ts` — `content_lang` 주석을 UI+콘텐츠로 확장 (컬럼 유지)
  * `src/lib/market-suggestions.ts` — 칩 라벨·프롬프트가 `content_lang`을 따름
  * `src/App.tsx` / `src/reports/ReportSurface.tsx` / `src/live/LiveMarketRoom.tsx` — Provider
  * 화면 크롬: `src/chat/*`, `src/panels/*`, `src/reports/*`
  * `docs/CLAUDE.md` — settings / i18n 행
  * `docs/ARCHITECTURE.md` — frontend 표 i18n 행
  * docs: 본 소절
* **확인 (로컬 `localhost:5173`):** Settings Language가 최상위. ko: 탭 「설정/마켓」, 칩 「리스크」, 브리프 `· ko ·`. en 전환 후 `html lang=en`, 슬로건 “Your world…”, 탭 Market/Settings, 칩 Risks/Report core, Market 접힘 `2/2 series`(lang 없음), 브리프 `Weekly AI Issue Digest` · `en · report`. 기존 한글 챗 히스토리는 그대로. (해요체 회신은 soul 규칙 — 이번 세션에서 새 한글 턴은 보내지 않음)
* **의도적으로 안 함:** 챗 회신 언어 토글; `content_lang` 컬럼 리네임; i18next; soul 한국어 문장을 UI 언어에 묶기; ko/en 이외 로케일

### 42.1 챗 회신 = 이번 턴 질문 언어 *(완료)*

* **목적:** EN UI + 영어 질문인데 한국어로 답하던 문제 — prefetch/vector 지시의 “해요체 ONLY for the whole reply”가 soul RULE 5보다 세게 먹힘.
* **수정 및 추가 파일:**
  * `worker/chat-agent/soul-market.ts` — RULE 5 Language STRICT; RULE 5b는 한국어 회신에만; `REPLY_LANG_LOCK` export
  * `worker/chat-agent/market-prefetch.ts` — 턴 instruction에 `REPLY_LANG_LOCK` (한국어 무조건 고정 문구 제거)
  * `worker/chat-agent/market-vector-search.ts` — VOICE LOCK → `REPLY_LANG_LOCK`; explain 감지에 EN 패턴 추가
  * docs: 본 소절
* **확인:** Settings EN + 영어 칩/직접 입력 → 영어 회신. 한글 질문 → 해요체 유지. `content_lang`은 Market 데이터만.
* **의도적으로 안 함:** 대화 히스토리 언어 리셋 UI; 다국어 자동 감지 라이브러리

### 42.2 For you 관심사 라벨 = Topics와 동일 *(완료)*

* **목적:** EN For you 헤더가 KO에서 찍은 `preferences.display`(예: 에너지)에 고정되던 버그. Topics My interests는 이미 lang-aware.
* **수정 및 추가 파일:**
  * `worker/market-for-you.ts` — `interestDisplayLabel` 사용; 캐시 hit 시 display 재해석; 검색 쿼리에 frozen display 유지
  * docs: 본 소절
* **확인:** Settings EN → For you `★ energy INDUSTRY` (Topics와 동일). KO → `에너지`. Regenerate 없이 캐시 hit여도 헤더만 언어에 맞게.
* **의도적으로 안 함:** preferences.display 마이그레이션/삭제; Brief For you 경로 변경

### 42.3 헤더 언어 토글 (테마 옆) *(완료)*

* **목적:** Settings를 열지 않고도 화면 언어(`content_lang`)를 바꿀 수 있게. 테마와 같은 글로벌 크롬 설정으로 헤더에 둔다.
* **수정 및 추가 파일:**
  * `src/chat/Chat.tsx` — 테마 오른쪽 `KO`/`EN` 버튼; `contentLang` / `onContentLangChange` / `contentLangUpdating` props
  * `src/App.tsx` — Settings와 동일 `updateSettings({ content_lang })` 경로로 연결
  * `src/i18n/messages.ts` — `chat.toggleLanguage`
  * `docs/CLAUDE.md` — UI chat shell 행
  * `docs/ARCHITECTURE.md` — Chat.tsx 행
  * docs: 본 소절
* **확인:** 헤더 `KO` 클릭 → `EN` + `html lang=en` + 슬로건/탭 영문; Settings Language도 같이 갱신. 반대도 동일. 업데이트 중 버튼 disabled.
* **의도적으로 안 함:** Settings Language 섹션 제거; Report 페이지 헤더 토글; 챗 회신 언어 연동

### 42.4 리포트 헤더도 같은 `content_lang` 토글 *(완료)*

* **목적:** `/daily-market-issues` · `/weekly-ai-issues` 헤더의 언어 배지를 읽기 전용이 아니라 셸과 **같은 사이클·같은 Settings 행**으로 바꾸기. 화면마다 다른 로직을 두지 않음.
* **수정 및 추가 파일:**
  * `worker/chat-agent/settings.ts` — `nextContentLang()`; `isContentLang`이 `CONTENT_LANGS` 기준
  * `src/i18n/content-lang.ts` *(신규)* — `patchContentLang` (`PATCH /settings`) + `nextContentLang` re-export
  * `src/i18n/ContentLangToggle.tsx` *(신규)* — 공통 UI (`ghost` 셸 / `pill` 리포트)
  * `src/chat/Chat.tsx` — 인라인 버튼 → `ContentLangToggle`
  * `src/reports/ReportSurface.tsx` — 배지 → 토글; 저장 후 `?lang=` 핀 제거
  * `src/i18n/messages.ts` — `common.toggleLanguage` (chat 키 제거)
  * docs: `CLAUDE.md`, `ARCHITECTURE.md`, 본 소절
* **확인:** 리포트 헤더 `KO`→`EN` → 크롬·브리프 lang 갱신; 홈 헤더/Settings도 같은 값. `?lang=en` 로드 후 토글하면 URL에서 `lang` 제거 + Settings 저장.
* **의도적으로 안 함:** `/live` 헤더 토글; JA 추가 시 드롭다운 전환; Settings Language 섹션 제거

### 42.5 테마+언어 ChromePrefs — 전 화면 동일 *(완료)*

* **목적:** 달/해 + `KO`/`EN` 페어를 홈·리포트·`/live`에서 **같은 컴포넌트·같은 룩**으로. 테마는 `ThemeProvider`(localStorage), 언어는 기존 Settings 행.
* **수정 및 추가 파일:**
  * `src/lib/theme.tsx` *(신규)* — `ThemeProvider` / `useTheme` (`index.html` 부트 스크립트와 동일)
  * `src/components/ChromePrefs.tsx` *(신규)* — Moon/Sun + `ContentLangToggle`
  * `src/main.tsx` — 전 라우트 `ThemeProvider` 래핑
  * `src/App.tsx` / `src/chat/Chat.tsx` — 로컬 theme 상태 제거 → `ChromePrefs`
  * `src/reports/ReportSurface.tsx` — pill 배지 대신 `ChromePrefs`
  * `src/live/LiveMarketRoom.tsx` — Gate/Room 헤더에 `ChromePrefs` + `patchContentLang`
  * `src/i18n/ContentLangToggle.tsx` — pill appearance 제거 (단일 ghost)
  * `src/i18n/messages.ts` — `common.toggleTheme`
  * docs: `CLAUDE.md`, `ARCHITECTURE.md`, 본 소절
* **확인:** `/` · `/daily-market-issues` · `/weekly-ai-issues` · `/live` 헤더에 동일 Moon+KO; 테마·언어가 화면 간 유지.
* **의도적으로 안 함:** JA 드롭다운; Settings Language 섹션 제거

---

## 43. 홈 EmptyState — 기술 스택 표 제거 *(완료)*

* **목적:** 홈 빈 화면에서 Cloudflare 기술 스택 표(기술/용도)를 빼서 소개 + 리포트 랜딩만 남긴다.
* **수정 및 추가 파일:**
  * `src/chat/Chat.tsx` — `TECH_STACK` 상수·표 `<section>` 삭제; EmptyState = intro + `ReportLandingCards`
  * `src/i18n/messages.ts` — `chat.techHeading` / `chat.tech.*` ko·en 키 제거
  * `docs/CLAUDE.md` — UI chat shell 행에서 “CF stack” 문구 제거
  * docs: 본 절
* **확인:** 홈 `/` EmptyState에 「기술 스택」 표 없음; intro 4문단 + 리포트 카드만.
* **의도적으로 안 함:** intro 문단·리포트 랜딩 카드 변경; 아카이브 `WORK_NOTES_2` 과거 서술 수정

### 43.1 슬로건 — ko도 영문 브랜드 문구 *(완료)*

* **목적:** 헤더 슬로건을 언어와 무관하게 영문 브랜드 표기(`Your world, a little closer.`)로 통일.
* **수정 및 추가 파일:**
  * `src/i18n/messages.ts` — `chat.slogan` ko = en
  * docs: 본 소절
* **확인:** Settings KO여도 헤더에 `Your world, a little closer.`
* **의도적으로 안 함:** 한글 대체 슬로건 유지; 다른 크롬 문구 en 고정

### 43.2 홈 EmptyState — 아이콘 제거 + 사용방법 *(완료)*

* **목적:** 홈 빈 화면의 큰 BrandMark를 빼고, 소개 아래에 **사용방법** 4단계를 넣어 첫 사용 흐름을 안내한다.
* **수정 및 추가 파일:**
  * `src/chat/Chat.tsx` — EmptyState에서 `BrandMark` 제거; `HOW_TO_KEYS` 섹션 추가; 헤더용 `BrandMark`는 size 없이 유지
  * `src/i18n/messages.ts` — `chat.howToHeading` / `chat.howTo.s1`–`s4` ko·en
  * `docs/CLAUDE.md` — UI chat shell 행에 how-to 반영
  * docs: 본 소절
* **확인:** `/` EmptyState = 소개 → 사용방법(번호 목록) → 준비된 콘텐츠; 큰 L+ 아이콘 없음. 헤더 BrandMark는 유지. 사용방법: 관심사 → 챗 질문 → **오른쪽 마켓 사이드바(날짜·보이스·브리프)** → 테마/헤더 읽기 페이지 → 자유 입력.
* **의도적으로 안 함:** intro 문단 변경; 헬퍼 레일/리포트 카드 구조 변경

---

## 44. Settings — 알람 스케줄 UI 제거 *(완료)*

* **목적:** Settings에서 사용자에게 혼란스러운 「알람 스케줄」 토글을 제거. 메시지 정리 on/off·보관·간격만 남긴다.
* **수정 및 추가 파일:**
  * `src/panels/SettingsPanel.tsx` — `SettingRow` 알람 + `onToggleAlarm` prop 제거
  * `src/App.tsx` — `alarm_enabled` 업데이트 배선 제거
  * `src/i18n/messages.ts` — `settings.alarm` / `settings.alarmHelp` ko·en 제거
  * `docs/CLAUDE.md` — settings 행 문구
  * docs: 본 절
* **확인:** Settings에 알람 스케줄 행 없음; 메시지 정리 + 보관/간격 유지.
* **의도적으로 안 함:** `alarm_enabled` / `alarm_interval_seconds` 컬럼·기본값 제거; cleanup 스케줄 로직 변경 (백엔드 default `alarm_enabled: true` 유지)

### 44.1 Settings — 메시지 정리 UI도 제거 *(완료)*

* **목적:** 「메시지 정리」 토글과 보관/간격 표시까지 Settings에서 전부 뺀다 (알람에 이어 정리 관련 UI 정리).
* **수정 및 추가 파일:**
  * `src/panels/SettingsPanel.tsx` — cleanup `SettingRow`·보관/간격·`SettingRow`/`formatDuration`/`onToggleCleanup` 제거
  * `src/App.tsx` — `message_cleanup_enabled` 배선 제거
  * `src/i18n/messages.ts` — `settings.cleanup*` / `retention` / `interval` ko·en 제거
  * `docs/CLAUDE.md` — settings 행
  * docs: 본 소절
* **확인:** Settings에 메시지 정리·보관·간격 없음; Language / Market / 패널 탭 / updated 시각은 유지.
* **의도적으로 안 함:** DO `message_cleanup_*` 컬럼·ChatAgent cleanup 스케줄 로직 삭제

### 44.2 Settings 접힘 라벨 — 마켓 → 콘텐츠 *(완료)*

* **목적:** Settings의 시리즈 on/off 접힘 제목을 「마켓」이 아니라 「콘텐츠」로. (패널 탭 「마켓」과는 별개)
* **수정 및 추가 파일:**
  * `src/i18n/messages.ts` — `settings.market` = Content/콘텐츠; `settings.marketContent` 제거; `helper.enableSeries` 경로 문구
  * `src/panels/SettingsPanel.tsx` — 펼침 시 중복 「콘텐츠」 소제목 제거 (help만)
  * docs: 본 소절
* **확인:** Settings 접힘 `콘텐츠 2/2 시리즈`; 펼치면 소제목 「마켓」+ help; 패널 탭 「콘텐츠」·안쪽 헤더 「마켓」.
* **의도적으로 안 함:** 헤더 리포트 카테고리 `chat.nav.market`(마켓) 변경; 내부 id `market` 리네임

### 44.3 패널 탭 — 마켓 → 콘텐츠 *(완료)*

* **목적:** 오른쪽 사이드 패널 **탭** 이름만 「콘텐츠」로. 패널 안쪽 헤더는 「마켓」 유지.
* **수정 및 추가 파일:**
  * `src/i18n/messages.ts` — `panels.market` = Content/콘텐츠; `market.title` = Market/마켓
  * docs: 본 소절 (44.2 확인 문구도 갱신)
* **확인:** 탭 「콘텐츠」·패널 헤더 「마켓」; Settings 패널 탭 목록의 market 항목은 탭과 동일 키(콘텐츠).
* **의도적으로 안 함:** `value: "market"` 내부 키 변경; 헤더 Market 메뉴 라벨 변경

---

## 45. 헬퍼 레일 — 챗에서 물어보기 리스트 *(완료)*

* **목적:** Ask를 **1행=1질문** 리스트로. Topics 카드 UI는 그대로. Topics가 남긴 빈 높이는 Ask가 채우고, 질문은 Ask 안에서만 세로 스크롤.
* **수정 및 추가 파일:**
  * `src/chat/ChatHelperRail.tsx` — Topics 래퍼 `shrink`+content height; Ask `flex-1 min-h-40` + 행 버튼 리스트 `overflow-y-auto`
  * `src/lib/market-suggestions.ts` — `DATED_PROMPT` + `reportPageSuggestions` 10항목; `reportChatSuggestions` 4항목
  * `src/reports/ReportChat.tsx` — `reportChatSuggestions`
  * `docs/CLAUDE.md` — helper rail Ask 행
  * docs: 본 절
* **확인:** Topics 카드/칩 UI 동일; Ask가 Topics 아래 빈 공간을 채움; 질문 10개가 각각 한 행; 넘치면 Ask 리스트만 스크롤.
* **의도적으로 안 함:** Topics 카드 내부 변경; 새 intent/worker 로직; Market empty-state `marketSuggestions` 순서 변경

### 45.1 Topics 여닫이 *(완료)*

* **목적:** 헬퍼 레일 Topics 카드 전체를 접을 수 있게. 기본은 열림. 접으면 Ask 리스트에 공간 양보.
* **수정 및 추가 파일:**
  * `src/chat/ChatHelperRail.tsx` — `topicsOpen` 기본 `true`; 헤더 버튼(ChevronDown + Tags + 토픽)으로 본문 토글 (내 관심사 fold와 동일 패턴)
  * docs: 본 소절
* **확인:** 기본 펼침; 헤더 클릭 시 Topics 본문 접힘·Ask 영역 확대; 다시 클릭 시 복원.
* **의도적으로 안 함:** Topics 내부(관심사/태그/키워드) UI 변경; 접힘 상태 localStorage 유지

---
