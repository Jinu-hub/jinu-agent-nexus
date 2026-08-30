# jinu-agent-nexus 개발 작업노트

> 프로젝트의 주요 기능 개발 내역, 소스코드 변경 사항, 아키텍처 및 라우팅 현황을 기록하는 문서입니다.

---

## 1. My Market Notes (Workers KV 기반 경량 키-값 저장소)

* **목적:** 관심 키워드, 숨김 항목, 간단한 메모를 빠르게 읽고 쓸 수 있는 엣지 KV 저장소 API 제공
* **수정 및 추가 파일:**
  * `worker/notes.ts` *(신규)*: `POST /notes/:key`, `GET /notes/:key`, `GET /notes` API 핸들러 구현
  * `worker/index.ts`: `/notes` 및 `/notes/*` 라우팅 등록
  * `wrangler.jsonc`: `NOTES` KV 네임스페이스 바인딩 등록 및 `run_worker_first`에 `/notes`, `/notes/*` 추가

---

## 2. My Market Memory (DO SQLite 기반 개인화 저장소)

* **목적:** 사용자의 관심 분야(산업/기업/자산/테마), 실시간 인터랙션 피드백(별표/덜보기/숨기기/리포트클릭), 방문자 Geo(IP/도시/국가) 및 가중치(Weights) 계산을 DO 인스턴스 전용 SQLite에 격리 저장
* **수정 및 추가 파일:**
  * `worker/my-memory.ts` *(신규)*:
    * `preferences` (현재 관심사 테이블)
    * `preference_events` (행동 이력 로그 테이블)
    * `weights` (Daily Brief 랭킹용 가중치 재계산 테이블)
    * `visitorGeoFromRequest` (Cloudflare 접속자 국가/도시 추출)
  * `worker/memory-routes.ts` *(신규)*: `/memory/preferences`, `/memory/events`, `/memory/weights`, `/memory/profile` REST API 구현
  * `worker/index.ts`: `MyMemory` DO 클래스 re-export 및 라우팅 추가
  * `wrangler.jsonc`: `MyMemory` DO 바인딩 및 SQLite 마이그레이션 (`tag: v2`) 추가

---

## 3. DO 인스턴스 식별자 중앙 집중화 (Identity Refactoring)

* **목적:** 하드코딩된 `"default"` 인스턴스명을 공유 상수로 통일하고, 추후 멀티 유저(`userId`) 전환이 용이하도록 리팩터링
* **수정 및 추가 파일:**
  * `src/lib/agent-identity.ts` *(신규)*: `DEFAULT_INSTANCE_NAME`, `getInstanceName(userId?)` 헬퍼 모듈 생성
  * `src/App.tsx`: `useAgent` 호출 시 `DEFAULT_INSTANCE_NAME` 사용
  * `worker/index.ts`: PDF 업로드 RPC 호출 시 `DEFAULT_INSTANCE_NAME` 사용
  * `worker/memory-routes.ts`: `MyMemory` DO 인스턴스 참조 시 `DEFAULT_INSTANCE_NAME` 사용

---

## 4. ChatAgent SQLite 런타임 설정 및 자동 청소 알람 (Settings & Cleanup Alarm)

* **목적:** AI 채팅방 DO 내부 SQLite에 런타임 설정(`settings`, `setting_events`)을 저장하고, Agents SDK의 `scheduleEvery()` 알람을 통해 5분 이상 경과된 오래된 메시지를 주기적으로 자동 정리하는 기능 구현
* **수정 및 추가 파일:**
  * `worker/chat-agent/settings.ts` *(신규)*: `settings` 및 변경 이력 `setting_events` 테이블 스키마, CRUD 및 유효성 검사 로직
  * `worker/chat-agent/ChatAgent.ts`:
    * `@callable()` 메서드 `getSettings()`, `updateSettings()`, `getSettingEvents()` 추가
    * `runMessageCleanup()` (보관 기간 초과 메시지 삭제 및 브로드캐스트)
    * `ensureMessageCleanupSchedule()`, `syncMessageCleanupSchedule()` (Agents SDK의 `scheduleEvery` 알람 등록 및 해제)
  * `worker/settings-routes.ts` *(신규)*: `/settings`, `/settings/events` 엔드포인트 구현
  * `src/panels/SettingsPanel.tsx` *(신규)*:
    * 알람 스케줄링 ON/OFF 토글
    * 메시지 정리 ON/OFF 토글
    * 보관 기간/알람 주기 및 갱신 시간 표시 UI
  * `src/App.tsx`: 10번째 우측 탭으로 **Settings 패널** 등록 및 상태 연동
  * `wrangler.jsonc`: `run_worker_first`에 `/settings`, `/settings/*` 추가

---

## 5. Market Pulse 실시간 투표방 (Agents SDK 기반 Live Market Room)

* **목적:** Agents SDK의 `Agent<Env, PollState>`를 활용하여 상태 동기화(`setState`), RPC(`@callable`), SQLite 투표 로그(`this.sql`), 자동 마감 알람(`schedule()`), 토큰 인증(`onConnect`)을 단일 클래스로 구현
* **수정 및 추가 파일:**
  * `src/lib/live-room.ts` *(신규)*: 라이브 룸 클래스명(`LiveMarketRoomAgent`), 방 이름(`market-pulse`), 경로(`/live`), 마감 시간(10분), 에러 코드 등 공유 상수
  * `worker/live-market-room.ts` *(신규)*:
    * `initialState` 및 `this.sql` (`votes` 테이블 생성)
    * `@callable` 메서드: `vote()`, `addOption()`, `reset()`
    * `schedule(closesAt, "closePoll")`을 통한 10분 후 자동 마감 처리
    * `shouldSendProtocolMessages`, `shouldConnectionBeReadonly`, `onConnect` 기반 토큰 검증 및 `?readonly=true` 관전자 처리
  * `src/live/LiveMarketRoom.tsx` *(신규)*:
    * `/live` 경로 전용 실시간 투표방 UI (진행 바, 실시간 득표율, 타이머, 옵션 추가, Reset, 접속자 도시 표시)
    * 관전자 모드(`Spectator`) 및 토큰 인증 에러 화면 처리
  * `src/main.tsx`: URL 경로(`/live`)에 따라 메인 챗 앱과 LiveMarketRoom을 분기 렌더링
  * `worker/index.ts`: `LiveMarketRoomAgent` DO 클래스 re-export
  * `wrangler.jsonc`: `LiveMarketRoomAgent` DO 바인딩 및 SQLite 마이그레이션 (`tag: v3`) 등록
  * `worker-env.d.ts` & `.dev.vars.example`: `LIVE_ROOM_TOKEN` 시크릿 인터페이스 및 가이드 정의

---

## 6. 전체 아키텍처 및 라우팅 현황

### 백엔드 (Cloudflare Workers & DO)
```text
worker/index.ts (HTTP Gateway)
 ├── /notes, /notes/:key                           → Workers KV (My Market Notes)
 ├── /memory/*                                     → MyMemory DO (개인화 SQLite)
 ├── /settings, /settings/events                   → ChatAgent DO (설정 SQLite)
 ├── GET  /api/supabase/health                     → Supabase 도달성 점검
 ├── GET  /api/audio/pending                       → content_audio script_ready 조회 (Phase 1)
 ├── POST /api/audio/claim                         → script_ready → generating claim (Phase 2)
 ├── POST /api/upload                              → ChatAgent DO (PDF RAG 업로드)
 ├── GET  /screenshots/*                           → R2 Bucket (브라우저 스크린샷)
 ├── /agents/ChatAgent/default                     → ChatAgent (WebSocket + Think Chat)
 └── /agents/live-market-room-agent/market-pulse   → LiveMarketRoomAgent (실시간 투표/알람)
```

### 프론트엔드 (React & Vite)
```text
src/ (React Frontend)
 ├── /      → Chat 메인 쉘 + 10개 패널 (Memory, Skills, Files, Tools, Sources, Browser, Schedules, Extensions, MCP, Settings)
 └── /live  → Market Pulse 실시간 투표방 (단독 전체 화면)
```

---

## 7. Supabase 연동 사전 작업 (Market Memory 접속 준비)

* **목적:** Worker에서 Supabase(Market Memory)에 접근할 수 있는 기반만 마련. 제품 테이블 조회는 §8 Phase 1부터 시작.
* **수정 및 추가 파일:**
  * `package.json`: `@supabase/supabase-js` 의존성 추가
  * `worker/supabase.ts` *(신규)*:
    * `createSupabaseClient(env)` / `isSupabaseConfigured(env)` 팩토리
    * `GET /api/supabase/health` — 시크릿 설정 여부 + REST 도달성 점검 (스키마 무관)
  * `worker/index.ts`: health 라우트 연결
  * `worker-env.d.ts` / `.dev.vars.example`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 선언
  * `CLAUDE.md` / `ARCHITECTURE.md`: 라우트·시크릿 문서화

### 로컬에서 연결 확인하는 방법

1. `.dev.vars.example`을 참고해 `.dev.vars`에 Supabase Project URL / anon key 입력
2. `npm run dev` 후:

```bash
curl http://localhost:5173/api/supabase/health
```

- 시크릿 미설정 → `503` `{ configured: false }`
- 연결 성공 → `200` `{ ok: true, projectHost: "….supabase.co" }`

---

## 8. Voice Audio 생성 (content_audio → TTS → R2)

> 사용자별 개인화 Voice가 아님. 날짜/언어/`audio_type`당 오디오를 한 번만 생성하고, 완료된 R2 파일을 모든 사용자가 재생한다.
> 생성 단위는 사용자 요청이 아니라 `content_audio.status = script_ready` 이다.
> 실제 MP3는 Supabase Storage가 아니라 Cloudflare R2 (`market-memory-audio`)에 저장할 예정. Supabase는 메타/상태만 관리.

최종 흐름 (전체 완료 시):

```text
content_audio (script_ready, script != null)
        ↓
Cloudflare Worker Cron
        ↓
row claim (status = generating)
        ↓
TTS Provider → audio binary
        ↓
R2 AUDIO_BUCKET (market-memory-audio)
        ↓
content_audio 업데이트
  status = completed
  storage_provider = cloudflare_r2
  storage_key = {audio_type}/{YYYY}/{MM}/{DD}/{lang_code}/{id}.mp3
```

상태 흐름: `script_ready` → `generating` → `completed` (실패 시 `generating` → `failed`)

Phase 계획:

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | `script_ready` row 조회 (`GET /api/audio/pending`) | 완료 |
| 2 | 안전한 claim (`script_ready` → `generating`) | 완료 |
| 3 | Voice 전용 R2 연결 (`AUDIO_BUCKET` → `market-memory-audio`) | 예정 |
| 4 | TTS Provider 연결 (수동 1 row 테스트) | 예정 |
| 5 | TTS → R2 → Supabase 통합 | 예정 |
| 6 | Cron Trigger | 예정 |

### 8.1 Phase 1 — script_ready row 조회 *(완료)*

* **목적:** Worker에서 Supabase `content_audio`를 조회해 Voice 생성 대상을 확인. DB row는 수정하지 않음.
* **수정 및 추가 파일:**
  * `worker/content-audio.ts` *(신규)*:
    * `ContentAudioRow` 타입 (기존 schema 컬럼 재사용, migration 없음)
    * `listPendingContentAudio()` — 읽기 전용 조회
    * `GET /api/audio/pending` 핸들러
  * `worker/index.ts`: `handleAudioRequest` 라우팅 등록 (health 다음)
  * `worker/supabase.ts`: 주석만 갱신. 기존 `createSupabaseClient` / health 로직 유지
* **재사용:** `createSupabaseClient(env, { privileged: true })`, `isSupabaseConfigured`, `getSupabaseAccessMode`
  * 제품 조회는 신뢰된 Worker 작업이라 service role 사용. 로컬 health도 anon 401 후 `mode: "service_role"`로 통과함
* **조회 조건:**
  * `status = 'script_ready'`
  * `script IS NOT NULL`
  * `script != ''`
  * JS에서 `script.trim().length > 0` 인 row만 반환
* **응답 필드:** `id`, `target_type`, `target_id`, `content_type`, `audio_type`, `lang_code`, `title`, `script`, `duration_seconds`, `storage_provider`, `storage_key`, `status`, `market_date`, `model_info`, `metadata`, `created_at`, `updated_at`
* **이 Phase에서 하지 않은 것:** status 변경, TTS, R2 binding, Cron, schema 변경

로컬 확인:

```bash
curl http://localhost:5173/api/audio/pending
curl http://localhost:5173/api/supabase/health
```

- 생성 대상 있음 → `200` `{ ok: true, count: N, items: [...] }`
- 생성 대상 없음 → `200` `{ ok: true, count: 0, items: [] }`
- 시크릿 미설정 → `503`
- Supabase 조회 실패 → `502` (키/Authorization은 응답에 넣지 않음)
- 기존 health는 그대로 `200` `{ ok: true, mode: "service_role", ... }`

로컬 확인 결과 (2026-08-30): pending 1건 (`brief_30s` / `ko` / `script_ready`), health 정상.

### 8.2 Phase 2 — row claim / 상태 전환 *(완료)*

* **목적:** Cron이 겹쳐도 같은 row를 두 번 생성하지 않도록, TTS 호출 전에 `script_ready` → `generating`을 원자적으로 claim.
* **방식:** SELECT 후 UPDATE가 아니라 조건부 UPDATE 1회 (compare-and-swap).

```text
UPDATE content_audio
SET status = 'generating', updated_at = now()
WHERE id = $id AND status = 'script_ready'
RETURNING *
```

* 반환 1건 → claim 성공
* 반환 0건 → 다른 실행이 이미 가져갔거나, row가 없음. 이어서 id로 조회해 `already_claimed` / `not_found` 구분
* **수정 및 추가 파일:**
  * `worker/content-audio.ts`:
    * `claimPendingContentAudio(id)` — CAS claim
    * `claimNextPendingContentAudio()` — 가장 오래된 pending부터 시도, 경쟁으로 miss면 다음 id
    * `POST /api/audio/claim` — body `{ "id": "<uuid>" }` 또는 body 생략 시 다음 pending 1건
  * `worker/index.ts`: 기존 `/api/audio/*` 핸들러로 연결 (신규 라우트 파일 없음)
* **변경하는 컬럼:** `status`, `updated_at` 만. `metadata` / `storage_key` 등은 건드리지 않음
* **이 Phase에서 하지 않은 것:** TTS, R2, Cron, `completed`/`failed` 전환, schema 변경
* **선행 조건:** 라이브 `content_audio_status` enum에 `generating`이 있어야 함.
  * 초기 라이브 enum은 `script_ready | generated | failed` 이라 claim이 거절됨
  * MarketMemory `schema.ts` 기준으로 enum 최신화 후 재확인

로컬 확인:

```bash
curl http://localhost:5173/api/audio/pending
curl -X POST http://localhost:5173/api/audio/claim \
  -H "Content-Type: application/json" \
  -d '{"id":"<content_audio.id>"}'
curl -X POST http://localhost:5173/api/audio/claim \
  -H "Content-Type: application/json" \
  -d '{"id":"<같은 id>"}'
```

- 첫 claim 성공 → `200` `{ ok: true, claimed: true, item.status: "generating" }`
- 같은 id 재claim → `409` `{ claimed: false, reason: "already_claimed", status: "generating" }`
- pending 재조회 → `200` `{ count: 0, items: [] }`
- pending이 없을 때 id 생략 claim → `200` `{ claimed: false, reason: "none_pending" }`
- 없는 UUID → `404` `{ reason: "not_found" }`
- 잘못된 id → `400`
- health는 그대로 `200`

로컬 확인 결과 (2026-08-30): id `045e93fd-9440-4e21-9c64-adaf75c58c3f` claim 성공 (`generating`), 재claim 409, pending 0건. 이 row는 이후 Phase 테스트 전까지 `generating`으로 남아 있음.

claim을 다시 시험하려면 Supabase에서 해당 row의 `status`를 `script_ready`로 되돌리면 됨.
