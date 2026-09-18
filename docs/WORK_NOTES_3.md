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

---
