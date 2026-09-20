# 인스턴스 데이터 경계 — 공유 vs 개인

> **목적:** Durable Object / Vectorize / R2에 **무엇을 어디에 둘지**의 단일 소스.  
> Phase 1(guest) · Phase 2(Auth) · 관리자 분리 모두 이 표를 따른다.  
> 구현 세부는 [`CLAUDE.md`](./CLAUDE.md), HTTP는 [`ROUTING.md`](./ROUTING.md), 작업 이력은 [`WORK_NOTES_3.md`](./WORK_NOTES_3.md).

---

## 한 줄 원칙

| 질문 | 답 |
|------|-----|
| **모든 사용자에게 같아야 하는가?** | → **공유** |
| **사람(또는 브라우저 guest)마다 달라야 하는가?** | → **개인** |

**임베딩·리포트 본문·칩 표시 라벨 = 공유.**  
**관심사(★)·챗·개인 설정 = 개인.**

---

## 인스턴스 이름

| 이름 | 역할 |
|------|------|
| `"default"` | **시스템 / 공유** — cron ingest용 ChatAgent settings, (목표) 공용 `topic_labels` 등 |
| `guest_<uuid>` | Phase 1 **개인** — 브라우저 localStorage + `lyra_instance` cookie |
| `<userId>` (Supabase UUID) | Phase 2 **개인** — 로그인 시 JWT 검증 후 guest를 대체. 로그아웃 시 같은 브라우저의 `guest_*`로 복귀 |

식별 코드: [`src/lib/agent-identity.ts`](../src/lib/agent-identity.ts).

---

## 저장소 맵 (목표 설계)

### 1. 공유 (전 유저 공통)

| 데이터 | 저장소 | 비고 |
|--------|--------|------|
| Market 리포트 청크 **임베딩** | Vectorize `MARKET_VECTOR_DB` | ingest/cron; 인스턴스와 무관 |
| PDF RAG 임베딩 | Vectorize `PDF_VECTOR_DB` | (제품 정책에 따라 개인화할 수도 있으나 현행은 공유 인덱스) |
| 리포트 원문·브리프·보이스 메타 | **Supabase** | Market Memory 카탈로그 |
| Voice 오디오 바이트 | R2 `AUDIO_BUCKET` | playPath만 개인 UI가 소비 |
| Skills 시드 파일 | R2 | |
| **topic_labels** (slug → KO/EN 표시) | **공유 MyMemory `"default"`** (또는 향후 별도 shared DO/KV) | UI Tags/Keywords 라벨. **개인 DO에 두지 않음** |
| Cron이 읽는 **콘텐츠 파이프라인 settings** (시리즈 on/off for ingest) | ChatAgent `"default"` settings | `getChatAgentSettings()` |

### 2. 개인 (guest / userId 인스턴스)

| 데이터 | 저장소 | 비고 |
|--------|--------|------|
| ★ **관심사** `preferences` | MyMemory **개인** | Topics 별; PK `(category, kind, target)` — `category` = 제품 도메인 (`market` / `entertainment` / `sports`), `kind` = 칩 타입 |
| preference_events / weights | MyMemory **개인** | |
| For you 요약 캐시 `for_you_summaries` | MyMemory **개인** | 관심사 해시 기반 |
| 챗 메시지·세션 | ChatAgent **개인** | |
| UI `content_lang` | ChatAgent settings **개인** | |
| Settings Content 시리즈 토글 `disabled_report_series` | ChatAgent settings **개인** | 패널/읽기 필터 (ingest와 별개) |
| `market_focus_series_id` | ChatAgent settings **개인** | |
| `hidden_panels` | ChatAgent settings **개인** (추후 admin 전역 정책으로 옮길 수 있음) | Phase 3에서 재검토 |

### 3. 명시적으로 개인이 아닌 것

| UI에 보이는 것 | 출처 | 개인 저장? |
|----------------|------|------------|
| Tags / Keywords **칩 목록** | 리포트 메타 (Supabase item) | ❌ |
| 칩 **표시 문자열** (한글 등) | **공유** `topic_labels` (+ lexicon/hint) | ❌ |
| ★ 누른 뒤 **내 관심사** 목록 | 개인 `preferences` | ✅ |
| 「키워드를 눌러 챗에서 질문」 | 공용 칩 + 개인 챗 세션 | 질문만 개인 |

---

## MyMemory 테이블 — 목표 소속

| 테이블 | 목표 소속 | 이유 |
|--------|-----------|------|
| `preferences` | **개인** | 관심 키워드. 컬럼: `category` + `kind` + `target` + `level` + `display`. **`kind` ≠ 제품 카테고리** |
| `preference_events` | **개인** | 이벤트에도 `category` (기본 `market`) |
| `weights` | **개인** | PK `(category, kind, target)` |
| `for_you_summaries` | **개인** | |
| `topic_labels` | **공유 (`default`)** | 임베딩/resolve 결과의 공용 UI 매핑 |

### preferences `category` 축

| 필드 | 의미 | 예 |
|------|------|-----|
| **`category`** | 제품 카테고리 (마켓 / 엔터 / 스포츠) | `market` · `entertainment` · `sports` |
| `kind` | 칩 엔티티 타입 | `theme` · `company` · `industry` · `asset` |
| `target` | slug | `energy` |

- HTTP: `GET /memory/preferences?category=market` (미지정 = 전체). POST/DELETE body에 `category` (생략 시 `market`).
- For you / 챗 interestHits는 **해당 카테고리만** (현행 Market → `market`).
- 헬퍼: [`src/lib/preference-category.ts`](../src/lib/preference-category.ts).

---

## ChatAgent settings — 목표 소속

| 필드 | 목표 소속 | 이유 |
|------|-----------|------|
| `content_lang` | **개인** | 화면·콘텐츠 언어 선호 |
| `disabled_report_series` | **개인** (UI) / ingest는 `"default"` | 개인 필터 ≠ cron 배치 |
| `market_focus_series_id` | **개인** | |
| `hidden_panels` | **개인** 또는 추후 **admin 전역** | Phase 3 |
| `alarm_*` / `message_cleanup_*` | 백엔드 유지; UI 비노출 | 제품 설정 아님 |

---

## 현재 코드 vs 목표 (갭)

Phase 1 직후 상태. **목표와 다르면 여기가 수정 백로그.**

| 항목 | 목표 | 현재 (대략) | 조치 |
|------|------|-------------|------|
| Vectorize Market | 공유 | 공유 ✅ | — |
| `preferences` / For you | 개인 + **category 스코프** | 개인 (`guest_*`); PK에 `category` ✅ (기존 행 → `market`) | Enter/Sports UI 연결 시 `?category=` |
| **`topic_labels` 읽기/쓰기** | **항상 `default`(공유)** | HTTP `/memory/topic-labels` + resolve persist → **`default`** ✅ | — |
| chat `loadTopicLabelMap` | 공유만 | 공유 `default`만 ✅ | — |
| Cron ingest settings | `default` | `default` ✅ | — |
| 개인 settings | guest/user | guest ✅ / 로그인 시 userId ✅ | — |

### Auth (Phase 2)

| 항목 | 동작 |
|------|------|
| 제공자 | 같은 Supabase 프로젝트 (Market Memory) — Email magic link + (옵션) Google |
| 브라우저 | `GET /api/auth/config` → anon 클라이언트; Settings「계정」 |
| 인스턴스 | 로그인 → `user.id`; 로그아웃 → `lyra_guest_instance` |
| Worker | `/memory/*`(labels 제외) · `/settings` · upload · for-you: Bearer JWT 검증. user UUID 쿠키만 있고 토큰 없으면 401 |
| 이메일 템플릿 | [`AUTH_EMAIL_TEMPLATE.html`](./AUTH_EMAIL_TEMPLATE.html) (magic/OTP) · [`AUTH_EMAIL_TEMPLATE_CONFIRM.html`](./AUTH_EMAIL_TEMPLATE_CONFIRM.html) (signup confirm) — `ConfirmationURL` + `Token` |

---

## 요청 경로 규칙 (목표)

```
브라우저 guest/userId
  ├─ useAgent({ name })     → ChatAgent 개인
  ├─ /settings              → ChatAgent 개인
  ├─ /memory/preferences*   → MyMemory 개인
  ├─ /memory/topic-labels*  → MyMemory "default" 공유  ← 개인 name 쓰지 않음
  ├─ /api/market/for-you    → preferences는 개인, labels는 공유
  └─ /api/market-vector/*   → Vectorize 공유 (쿠키와 무관)

Cron / 시스템
  ├─ market-vector ingest   → Vectorize 공유
  ├─ label resolve (ingest) → topic_labels → "default"
  └─ getChatAgentSettings() → ChatAgent "default"
```

---

## 금지 사항

1. **공용 UI 라벨(`topic_labels`)을 guest/user MyMemory에만 쓰기** — 새 인스턴스마다 매핑이 증발함.
2. **개인 관심사를 Vectorize에 넣기** — 임베딩 인덱스에 유저별 분기 금지 (현행 제품).
3. **`default`를 “관리자 로그인”과 동일시** — `default`는 시스템/공유 스토어. 관리자는 Phase 3의 role.

---

## 관련 파일

| 영역 | 파일 |
|------|------|
| 인스턴스 id | `src/lib/agent-identity.ts`, `src/lib/use-agent-instance.ts` |
| MyMemory DO | `worker/my-memory.ts`, `worker/memory-routes.ts`, `worker/lib/my-memory-stub.ts` |
| Labels | `worker/market-labels.ts`, `worker/lib/chat-ui-topic-map.ts` |
| Settings | `worker/chat-agent/settings.ts`, `worker/market-settings.ts` |
| Vectors | `worker/market-vector.ts`, `worker/market-vector-cron.ts` |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-09-20 | 초안 — Phase 1 이후 공유/개인 경계 문서화. `topic_labels`는 공유가 목표임을 명시. |
| 2026-09-20 | preferences PK에 `category` 축 추가 (`market` 기본). kind와 제품 카테고리 분리. |
| 2026-09-20 | `topic_labels` HTTP·resolve·chat map → 항상 MyMemory `"default"`. |
| 2026-09-20 | Phase 2 Auth — Supabase magic link/Google → userId 인스턴스. |
