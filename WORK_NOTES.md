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
 ├── GET  /api/briefs/today                        → content_briefs 당일 브리핑 조회 (Phase A)
 ├── GET  /api/briefs/latest-date                  → 데이터 있는 최신 market_date (§10.5)
 ├── GET  /api/reports/today                       → item_contents 풀리포트 (via brief.target_id) (§10 Phase A)
 ├── GET  /api/audio/pending                       → content_audio script_ready 조회 (Phase 1)
 ├── GET  /api/audio/today                         → completed Voice 메타 + play URL (Phase 7)
 ├── POST /api/audio/claim                         → script_ready → generating claim (Phase 2)
 ├── GET  /api/audio/storage/health                → AUDIO_BUCKET put → get 점검 (Phase 3)
 ├── POST /api/audio/tts                           → 1 row TTS 테스트, audio/mpeg (Phase 4)
 ├── POST /api/audio/generate                      → TTS → R2 → completed (Phase 5)
 ├── GET  /api/audio/file/:id                      → R2 MP3 스트리밍 (Phase 5)
 ├── POST /api/audio/cron/run                      → Cron drain 1회 수동 실행 (Phase 6)
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

* **목적:** Worker에서 Supabase(Market Memory)에 접근할 수 있는 기반만 마련. 제품 테이블 조회는 §8 (`content_audio`) / §9 (`content_briefs`)부터.
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
| 3 | Voice 전용 R2 연결 (`AUDIO_BUCKET` → `market-memory-audio`) | 완료 |
| 4 | TTS Provider 연결 (수동 1 row 테스트) | 완료 |
| 5 | TTS → R2 → Supabase 통합 | 완료 |
| 6 | Cron Trigger | 완료 |
| 7 | Today playback — Supabase 메타 + R2 bytes (`/api/audio/today` + chat tool) | 완료 |
| 8 | In-chat `<audio>` player for `getTodayMarketVoice` | 완료 |

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

### 8.3 Phase 3 — Cloudflare R2 연결 *(완료)*

* **목적:** Voice 전용 bucket에 Worker put/get이 되는지 TTS 없이 확인. `content_audio`는 수정하지 않음.
* **리소스:**
  * bucket: `market-memory-audio` *(신규 생성)*
  * binding: `AUDIO_BUCKET`
  * 기존 `BUCKET` → `boilerplate-bucket` 유지 (skills / pdfs / screenshots)
* **수정 및 추가 파일:**
  * `wrangler.jsonc`: `r2_buckets`에 `AUDIO_BUCKET` 항목 **추가** (기존 `BUCKET` 교체 금지, `remote: true`)
  * `package.json`: `setup:audio-r2` 스크립트 추가
  * `worker/audio-r2.ts` *(신규)*: `pingAudioBucket()` — `health/phase3-ping.txt` put 후 get, body echo 비교
  * `worker/content-audio.ts`: `GET /api/audio/storage/health` (Supabase 불필요)
  * `worker-configuration.d.ts`: `npm run cf-typegen`으로 `AUDIO_BUCKET: R2Bucket` 생성 (직접 수정하지 않음)
* **probe key:** `health/phase3-ping.txt`
  * 향후 실제 오디오 key (`{audio_type}/{YYYY}/{MM}/{DD}/{lang_code}/{id}.mp3`)와 prefix가 겹치지 않음
* **이 Phase에서 하지 않은 것:** TTS, `storage_key` 생성, `content_audio` UPDATE, Cron, `BUCKET` 변경

로컬 확인:

```bash
curl http://localhost:5173/api/audio/storage/health
```

`wrangler.jsonc` 바인딩을 추가한 뒤에는 `npm run dev`를 재시작해야 `env.AUDIO_BUCKET`이 붙는다.

- 성공 → `200` `{ ok: true, binding: "AUDIO_BUCKET", bucket: "market-memory-audio", key: "health/phase3-ping.txt", echoed: true }`
- 바인딩 미적용 → `502` (`put` of undefined)
- POST → `405`

로컬 확인 결과 (2026-08-30): put → get echo 성공. pending / supabase health 유지.

### 8.4 Phase 4 — TTS Provider 연결 *(완료)*

* **목적:** 한 `content_audio` row의 `script` + `lang_code`로 TTS를 호출해 **audio binary**를 받는다. R2 저장 / DB 업데이트 / Cron은 하지 않음.
* **Provider 추상화:** `worker/tts.ts` `TTSProvider.generate({ text, language, voice? })`
* **1차 구현:** OpenAI TTS (`tts-1`, voice `nova`) — ko/ja/en 지원. Workers AI MeloTTS/Aura는 한국어 커버가 부족해서 사용하지 않음.
* **호출 경로:**
  1. `OPENAI_API_KEY`가 있으면 `https://api.openai.com/v1/audio/speech`
  2. 없으면 `API_TOKEN`으로 AI Gateway `.../openai/audio/speech`
* **수정 및 추가 파일:**
  * `worker/tts.ts` *(신규)*
  * `worker/content-audio.ts`: `getContentAudioById()`, `POST /api/audio/tts`
  * `wrangler.jsonc` vars: `TTS_MODEL=openai/tts-1`, `TTS_VOICE=nova`
  * `worker-env.d.ts` / `.dev.vars.example`: optional `OPENAI_API_KEY`
* **이 Phase에서 하지 않은 것:** R2 put, `storage_key` 생성, `completed` 전환, Cron, ElevenLabs

로컬 확인:

```bash
curl -X POST http://localhost:5173/api/audio/tts \
  -H "Content-Type: application/json" \
  -d '{"id":"<content_audio.id>"}' \
  --output brief.mp3
```

- 성공 → `200` `Content-Type: audio/mpeg`, 헤더 `X-TTS-Provider` / `X-TTS-Model` / `X-TTS-Voice`
- id 없음 → `400`
- row 없음 → `404`
- TTS 인증 실패 → `502` (키/Authorization은 응답에 넣지 않음)

로컬 확인 결과 (2026-08-30):
* id 생략 → `400 id is required` (핸들러 OK)
* `OPENAI_API_KEY` 없이 Gateway만 사용 → `401 Unauthorized`

로컬 확인 결과 (2026-09-01): `OPENAI_API_KEY` 설정 후 같은 curl로 `brief.mp3` 수신.
* 약 805 KB, MPEG layer III 128 kbps / 24 kHz / mono
* row `045e93fd-9440-4e21-9c64-adaf75c58c3f` (`ko` / `brief_30s`)
* R2 / `content_audio` 상태는 변경하지 않음 (row는 계속 `generating`)

### 8.5 Phase 5 — TTS → R2 → `completed` *(완료)*

* **목적:** 한 row에 대해 claim → TTS → `AUDIO_BUCKET` put → `content_audio`를 `completed`로 마감. Cron은 하지 않음.
* **엔드포인트:**
  * `POST /api/audio/generate` body `{ "id": "<uuid>" }` → JSON `{ ok, item }` (raw MP3가 아님)
  * `GET /api/audio/file/:id` → R2에서 MP3 스트리밍 (curl 확인용)
* **상태 분기:**
  * `script_ready` → claim 후 생성
  * `generating` → 생성 (Phase 2 테스트 row가 이 상태)
  * `failed` → CAS `failed` → `generating` 후 재시도
  * `completed` → `409 already_completed`
* **성공 시 갱신 컬럼:**
  * `status = completed`
  * `storage_provider = cloudflare_r2`
  * `storage_key = {audio_type}/{YYYY}/{MM}/{DD}/{lang_code}/{id}.mp3` (`market_date`의 날짜 부분만 사용, bucket 이름 없음)
  * `duration_seconds` — MP3 프레임 파싱, 실패 시 `null`
  * `model_info = { provider, model, voice }`
  * `updated_at`
  * `metadata.voice_error` 가 있으면 삭제. 기존 `pulse` / `highlights` 등은 유지
* **실패 시:** `generating` → `failed`, `metadata.voice_error = { message, at }` (기존 metadata 키는 지우지 않음)
* **수정 및 추가 파일:**
  * `worker/audio-r2.ts`: `buildVoiceStorageKey`, `putVoiceAudio` / `getVoiceAudio`, `mp3DurationSeconds`
  * `worker/content-audio.ts`: `generateVoiceAudio()`, generate / file 라우트
  * `worker/tts.ts`: `TTSProvider.voice` 노출 (`model_info`용)
  * `worker/index.ts`: 주석만
* **이 Phase에서 하지 않은 것:** Cron, Queues, 스키마 변경, `BUCKET`(boilerplate-bucket) 사용

로컬 확인:

```bash
curl -X POST http://localhost:5173/api/audio/generate \
  -H "Content-Type: application/json" \
  -d '{"id":"<content_audio.id>"}'
curl http://localhost:5173/api/audio/file/<content_audio.id> --output /tmp/voice.mp3
curl http://localhost:5173/api/audio/pending
curl http://localhost:5173/api/supabase/health
```

- 성공 → `200` `{ ok: true, item.status: "completed", storage_key, duration_seconds, model_info }`
- 이미 completed → `409` `{ reason: "already_completed" }`
- id 생략 → `400`
- TTS/R2 실패 → `502`, row는 `failed` + `metadata.voice_error`
- pending은 계속 `count: 0`
- health는 그대로 `200`

로컬 확인 결과 (2026-09-01): id `045e93fd-9440-4e21-9c64-adaf75c58c3f`
* `generating` → `completed`
* `storage_key`: `brief_30s/2026/08/29/ko/045e93fd-9440-4e21-9c64-adaf75c58c3f.mp3`
* `duration_seconds`: 52 (`file` MPEG L3 128 kbps / 24 kHz / mono)
* `GET /api/audio/file/:id` → `200` `audio/mpeg` 약 826 KB
* 재호출 `409 already_completed`, pending 0, supabase / R2 health 유지
* `metadata`의 pulse / highlights 유지, `voice_error` 없음

### 8.6 Phase 6 — Cron Trigger *(완료)*

* **목적:** `script_ready` pending 중 **UTC 기준 전날 `market_date`** 인 row를 사람 없이 주기적으로 drain. pending 0건이면 TTS/R2 없이 즉시 종료.
* **스케줄:** `0 0 * * *` (UTC 00:00 = **KST 09:00**). `wrangler.jsonc` `triggers.crons`에서 변경 후 재배포.
* **lang_code 필터** (`wrangler.jsonc` vars, 쉼표 구분):
  * `AUDIO_CRON_LANG_EXCLUDE` — 기본 `ja` (일본어 제외)
  * `AUDIO_CRON_LANG_INCLUDE` — 비어 있으면 allowlist 미사용; 설정 시 **해당 언어만** (EXCLUDE 무시)
  * 예: `ja` 다시 포함 → `AUDIO_CRON_LANG_EXCLUDE`를 `""` 로
  * 예: `ko`만 → `AUDIO_CRON_LANG_INCLUDE=ko`, `AUDIO_CRON_LANG_EXCLUDE`는 무시됨
* `AUDIO_CRON_BATCH_LIMIT` — tick당 최대 처리 row 수 (기본 10, 상한 50)
* **날짜 필터:**
  * Cron 실행 시점이 `2026-09-03T00:00:00Z` 이면 대상 `market_date`는 `2026-09-02`
  * 즉 `targetMarketDate = previous UTC day`
  * 같은 날에 더 오래된 미처리 row가 있어도, `market_date`가 다르면 이번 tick 대상이 아님
* **수정 및 추가 파일:**
  * `wrangler.jsonc`: `triggers.crons`, Cron vars
  * `worker/voice-lang-filter.ts` *(신규)*: include/exclude 파싱
  * `worker/voice-audio-cron.ts` *(신규)*: `runVoiceAudioCron()`, `VOICE_AUDIO_CRON`, 전날 `market_date` 계산
  * `worker/index.ts`: `scheduled` → `ctx.waitUntil(runVoiceAudioCron)`
  * `worker/content-audio.ts`: `listPendingContentAudio` optional `langFilter` / `marketDate`; `POST /api/audio/cron/run`
* **수동 API와 차이:** `GET /api/audio/pending`, `POST /api/audio/claim`은 **lang 필터 없음** (전체 pending). Cron만 env 필터 적용.
* **이 Phase에서 하지 않은 것:** Queues, 스키마 변경, 스크립트 작성 (upstream Market Memory)

로컬 확인:

```bash
# Cron과 동일한 drain 1회 (전날 market_date + lang exclude=ja 적용)
curl -X POST http://localhost:5173/api/audio/cron/run

# Wrangler scheduled 시뮬레이션 (dev 서버 재시작 후)
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=0+0+*+*+*"
```

- pending 0 (또는 전날 대상이 없거나 ja만 남음) → `200` `{ attempted: 0, ... }`
- ko/en pending 있음 → 순서대로 generate, `completed` / `failed` 집계
- 응답 `targetMarketDate`에 이번 tick 대상 날짜가 들어감
- `langFilter`: `"exclude=[ja]"` 또는 `"include=[ko,en]"` 등
- Supabase 미설정 → `503`

### 8.7 Phase 7 — Today Voice playback (메타 + R2) *(완료)*

* **목적:** 완성된 Voice를 **Supabase 메타로 고르고**, MP3 bytes는 기존 `GET /api/audio/file/:id` → R2로 스트림. Chat에는 URL만 넘김.
* **패턴:** 텍스트 `content_briefs` today API와 대칭 (`market_date` = Asia/Seoul 기본).
* **기본 필터:** `status=completed`, `storage_key` non-empty, `lang=ko`, `audio_type=brief_30s`, `content_type=daily-market-issues`
* **수정 및 추가 파일:**
  * `worker/content-audio.ts`: `getTodayContentAudio()`, `GET /api/audio/today`
  * `worker/tools/getTodayMarketVoice.ts` *(신규)*
  * `worker/chat-agent/tools-registry.ts`: `getTodayMarketVoice` 등록
* **이 Phase에서 하지 않은 것:** Chat UI `<audio>` 위젯, R2-only list, Panel

로컬 확인:

```bash
# 메타 (데이터 있는 날)
curl -sS 'http://localhost:5173/api/audio/today?date=2026-09-03' | python3 -m json.tool

# R2 bytes (응답의 item.id 사용)
curl -sS "http://localhost:5173/api/audio/file/<id>" -o /tmp/voice-today.mp3 && file /tmp/voice-today.mp3

# Seoul 오늘 (없으면 found:false)
curl -sS http://localhost:5173/api/audio/today | python3 -m json.tool
```

채팅: 「2026년 9월 3일 보이스 브리핑」 → `getTodayMarketVoice` → `playPath` 안내

로컬 확인 결과 (2026-09-04):
* `?date=2026-09-03` → `found: true`, title `글로벌 시장 이슈 (260903)`, `duration_seconds: 57`
* `playPath` → `/api/audio/file/066b84e2-…` → MPEG L3 ~918 KB
* 기본 today (`2026-09-04`) → `found: false`

### 8.8 In-chat Voice player *(완료)*

* **목적:** `getTodayMarketVoice` 툴 결과의 `playPath`를 채팅 안에서 `<audio controls>`로 바로 재생.
* **수정 파일:** `src/chat/Message.tsx`
  * `found` + `/api/audio/file/<uuid>` 일 때만 플레이어 표시 (임의 URL 차단)
  * title / duration 라벨 + native audio controls
* **이 Phase에서 하지 않은 것:** 마크다운 본문 안 auto-embed, 전역 미디어 큐, Panel

채팅 확인: 「2026년 9월 3일 보이스 브리핑」 → 툴 카드 아래 재생 컨트롤 → Play

---

## 9. Content Briefs 조회 (content_briefs → Worker read path)

> Market Memory 공유 텍스트 브리핑을 Worker에서 읽어오는 베이스라인.
> Voice(`content_audio`)와 테이블이 다름. Panel/`State`는 아직 없음.

| Phase | 내용 | 상태 |
|-------|------|------|
| A | `content_briefs` 조회 + `GET /api/briefs/today` | 완료 |
| B | Chat tool `getTodayMarketBrief` — Phase A 함수 재사용 | 완료 |
| C | 공용 query 헬퍼 정리 (두 번째 테이블 때) | 선택 |
| D | Market 사이드바 패널 (brief + voice) | 완료 |

### 9.1 Phase A — Today brief HTTP API *(완료)*

* **목적:** Supabase `content_briefs`에서 하루치 마켓 이슈 브리핑(`content`)을 읽어 curl로 검증. DB 수정 없음.
* **기본 필터:**
  * `market_date` — 기본 **Asia/Seoul** 달력 오늘 (`?date=YYYY-MM-DD`로 오버라이드)
  * `lang_code` — 기본 `ko` (`?lang=`)
  * `brief_type` — 기본 `brief_30s` (`?brief_type=`)
  * `content_type` — 기본 `daily-market-issues` (`?content_type=`)
  * `status` — `final`, `content` non-empty
* **날짜 규칙:** Voice Cron의 UTC 전날)과 분리. Brief “오늘”은 `worker/market-date.ts`의 Seoul 달력일.
* **수정 및 추가 파일:**
  * `worker/market-date.ts` *(신규)*: `marketDateYmdInTimeZone()`, `isMarketDateYmd()`
  * `worker/content-briefs.ts` *(신규)*:
    * `getTodayContentBrief(env, options)` — service_role 조회
    * `GET /api/briefs/today` 핸들러
  * `worker/index.ts`: briefs 라우트 등록 (supabase health 다음, audio 이전)
  * `worker/supabase.ts`: 주석만 갱신 (`content-briefs` 언급)
* **이 Phase에서 하지 않은 것:** Chat tool, Panel/`State`, RLS(anon) 전환, 스키마 변경

로컬 확인:

```bash
# 알려진 market_date (데이터 있는 날)
curl -sS 'http://localhost:5173/api/briefs/today?date=2026-09-03' | python3 -m json.tool

# Seoul 오늘 (row 없으면 found:false + item:null — 정상)
curl -sS http://localhost:5173/api/briefs/today | python3 -m json.tool

# 잘못된 date
curl -sS 'http://localhost:5173/api/briefs/today?date=09-03'

curl http://localhost:5173/api/supabase/health
```

- 성공 (row 있음) → `200` `{ ok: true, found: true, item: { title, content, … } }`
- 성공 (row 없음) → `200` `{ ok: true, found: false, item: null }`
- `date` 형식 오류 → `400` `{ ok: false, message: "date must be YYYY-MM-DD" }`
- Supabase 미설정 / service_role 없음 → `503`

로컬 확인 결과 (2026-09-04):
* `?date=2026-09-03` → `found: true`, title `글로벌 시장 이슈 (260903)`, `content` 595자
* 기본 today (`2026-09-04`) → `found: false` (해당일 row 없음)
* 잘못된 date / health 정상 유지

### 9.2 Phase B — Chat tool `getTodayMarketBrief` *(완료)*

* **목적:** 채팅에서 「오늘의 마켓 이슈 브리핑」 등이 도구를 통해 `content_briefs.content`를 가져오게 함.
* **수정 및 추가 파일:**
  * `worker/tools/getTodayMarketBrief.ts` *(신규)*: `createGetTodayMarketBriefTool(env)`
    * 입력: optional `date` (YYYY-MM-DD), optional `lang` (기본 ko)
    * `getTodayContentBrief()`만 호출 — select 로직 중복 없음
    * 응답: `found` + `title`/`content` (+ `pulse`/`takeaway` 요약)
  * `worker/chat-agent/tools-registry.ts`: `getTodayMarketBrief` 등록
  * `worker/content-briefs.ts`: Phase B 주석만 갱신
* **이 Phase에서 하지 않은 것:** Panel/`State`, 범용 테이블 쿼리 tool, Phase C 헬퍼 추출

채팅 확인:

1. Tools 패널(또는 에이전트 재연결)에 `getTodayMarketBrief`가 보이는지
2. 「2026년 9월 3일 마켓 이슈 브리핑 보여줘」 → tool call → `content`가 답변에 포함
3. 「오늘의 마켓 브리핑 보여줘」 → tool call → 오늘(Seoul) row 없으면 “없다”고 안내 (환각 금지)

```bash
# 데이터 경로 회귀 (Phase A 유지)
curl -sS 'http://localhost:5173/api/briefs/today?date=2026-09-03' | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['found'] and d['item']['content']; print('ok', d['item']['title'])"
```

### 9.3 Chat `onToolCall` — 서버 툴 오인 에러 수정 *(완료)*

* **증상:** `getTodayMarketBrief` 첫 호출이 `{ error: "No client handler…" }` 후 재시도 성공
* **원인:** `Chat.tsx` `onToolCall`이 `getUserTimezone` 외 모든 툴에 `addToolOutput(error)` — 서버 `execute`를 가로챔
* **수정:** `src/chat/Chat.tsx` — 알 수 없는(서버) 툴은 `addToolOutput` 하지 않고 return

### 9.4 Settings `content_lang` (ko/en) → Market Memory 조회 *(완료)*

* **목적:** 챗에서 “한국어/영어 브리핑”을 말하지 않아도 Settings 선호 언어로 Supabase `lang_code` 조회
* **챗 UI 언어와 무관** — Market Memory content language만 제어
* **변경:**
  * `worker/chat-agent/settings.ts` — `content_lang: "ko" | "en"` (기본 `ko`), DO SQLite 마이그레이션(`PRAGMA` + `ALTER` if missing)
  * `src/panels/SettingsPanel.tsx` — ko/en 토글 UI
  * `src/App.tsx` — `updateSettings({ content_lang })`
  * `getTodayMarketBrief` / `getTodayMarketVoice` — tool `lang` 인자 제거, `getSettings(agent).content_lang`을 Supabase에 전달
* **이 Phase에서 하지 않은 것:** HTTP `?lang=` 기본값을 Settings에 묶기(curl은 여전히 query/`ko` 기본), ja 등 확장, 폴백

확인:

1. Settings → Market content language → `en` 선택
2. 「2026년 9월 3일 마켓 브리핑 보여줘」 → tool 결과에 `lang: "en"` (해당 row 있을 때)
3. 다시 `ko` → 같은 질문 → `lang: "ko"`

### 9.5 Brief/voice — LLM 번역 금지 *(완료)*

* **증상:** Settings `en`인데 챗 답변이 한국어로 보임
* **원인:** tool은 `lang: "en"` + 영어 `content`를 정상 반환했으나, 한국어 질문에 맞춰 모델이 번역해 재작성
* **수정:**
  * `configure-session.ts` soul RULE 5 — Market Memory 본문은 tool `lang` 그대로
  * tool 결과에 `presentation: "…VERBATIM…"` 필드 추가

### 9.6 Voice 재요청 / 무응답 *(완료)*

* **증상:**
  * 같은 날짜 보이스 재요청 → “이전에 이미 요청하신 정보입니다” (tool 미호출)
  * 다른 날짜 보이스 → reasoning만 남고 tool/텍스트 없이 종료 (무응답)
* **원인:** 모델이 prior tool 결과를 재사용하거나, reasoning 후 tool call을 안 냄. API/데이터는 `2026-09-03` en/ko 모두 존재
* **수정:**
  * `ChatAgent.beforeStep` step 0에서 보이스/브리핑 의도 감지 시 `toolChoice` 강제 (`market-intent.ts`)
  * soul RULE 6 — 매번 fresh tool call, “이미 요청” 금지
  * `maxSteps` 3 → 5
  * tool description 강화

### 9.7 market_date 년도 보정 *(완료)*

* **증상:** “어제” / “9월 4일” → 모델이 `2025-09-04` 전달 → `found: false` → 플레이어 UI 없음 (이전 답 환각)
* **수정:**
  * `worker/tools/market-date-resolve.ts` — tool `date` 년도가 Seoul 현재 년이 아니면, miss 시 현재 년+MM-DD로 1회 재조회
  * brief/voice tool description에 Seoul `today`/`yesterday` 힌트 삽입
  * soul RULE 7

### 9.8 Market 패널 (사이드바) *(완료)*

* **목적:** 챗 없이 Settings `content_lang` + 날짜로 brief/voice를 바로 보기·재생
* **추가:**
  * `src/panels/MarketPanel.tsx` — `GET /api/briefs/today` + `GET /api/audio/today` 병렬 fetch
  * 날짜 prev/next / date input / Today, 수동 Refresh, brief 복사, `<audio>` 플레이어
  * `src/App.tsx` — `PANELS`에 Market 탭 (Memory 다음)
* **배치 UX (9.8b):** 일 배치 `~22:30 UTC` → 최신 `market_date`는 보통 Seoul **어제**
  * 기본 날짜 = Seoul yesterday (`Latest`)
  * 힌트 문구 + empty 시 “Open latest · YYYY-MM-DD”
  * Today = 달력 오늘(미발행일 수 있음) / Latest = 예상 최신일
  * Brief만 있고 Voice 없으면 `Brief ready · Voice pending`
* **이 Phase에서 하지 않은 것:** 최근 N일 리스트 API, ChatAgent `State` 동기화, Settings lang 토글을 패널로 이동

확인:

1. 사이드바 Market → 기본이 Seoul **어제**(latest)로 로드
2. Today 클릭 → 오늘 empty면 배치 설명 + Open latest
3. Settings `content_lang` ko↔en 변경 → 패널 자동 재조회

### 9.9 Chat = 해석 / Panel = 원문 *(완료)*

* **목적:** Market 패널이 원문·보이스 UI이므로 챗은 해석·비교·행동에 집중
* **변경:**
  * `configure-session.ts` RULE 5–7 — 전문 dump 금지, Market 탭 안내, omit date = Seoul yesterday (latest)
  * `market-date-resolve.ts` — tool `date` 생략 시 expected latest (어제)
  * brief/voice tool description + `presentation` — 짧은 답 + 패널 유도
  * `market-intent.ts` — 해석형 질문도 brief tool 강제
  * `Chat.tsx` SUGGESTIONS — Market 해석형 예시로 교체
* **이 Phase에서 하지 않은 것:** 멀티데이 비교 전용 API, 패널↔챗 date 동기화 RPC

### 9.10 Chat 먹통 — reasoning-only / tool 미호출 *(완료)*

* **증상:** `어제 pulse/takeaway`는 OK. 이후 `그제랑 어제 톤 비교`, `어제 보이스`, `브리핑 전문`, `서울 날씨` 등에서 reasoning만 하고 tool/답변 없이 종료하거나 의도와 다른 요약
* **원인:** GLM이 toolChoice를 무시하고 reasoning 후 stop. 비교는 2회 brief 호출을 계획만 하고 실행 안 함. `beforeStep` 강제만으로는 부족
* **수정:**
  * `market-prefetch.ts` — `beforeTurn`에서 brief/voice/compare를 서버가 조회해 system에 JSON 주입
  * Market 턴은 `toolChoice: "none"` → 텍스트만 답 (tool stall 회피)
  * `market-intent.ts` — `compare` / `fullText` / `voice` / `brief` 의도 분리; `detectWeatherTool`
  * `beforeStep` — prefetch 성공 시 Market force 스킵; 날씨·prefetch 실패 시에만 tool 강제
  * soul RULE 5–6 — Prefetch 우선, 전문/틀어줘는 Market 탭 안내
* **이 Phase에서 하지 않은 것:** 보이스 인라인 플레이어를 prefetch 경로에 연결, 멀티데이 HTTP API

확인:

1. 「어제 pulse/takeaway 한 줄로」→ 짧은 답 + Market 탭 안내
2. 「그제랑 어제 브리핑 톤이 어떻게 달라졌지?」→ 비교 답 (먹통 아님)
3. 「어제 보이스 틀어줘」→ Market 탭 안내 (먹통 아님)
4. 「브리핑 전문 보여줘」→ 전문 dump 없이 Market 탭 Latest 안내
5. 「서울 날씨」→ getWeather 호출 후 답

### 9.12 Market Memory 추천 질문 UI *(완료)*

* **목적:** Chat empty / Market 패널에 같은 예시 프롬프트를 드러내어 해석·비교·패널 유도 명령을 발견하기 쉽게
* **추가:**
  * `src/lib/market-suggestions.ts` — 공유 `MARKET_SUGGESTIONS` (intent와 맞춤)
  * `Chat.tsx` empty — 「Market Memory · 이렇게 물어보세요」+ 클릭 시 전송
  * `MarketPanel` — Ask in chat 칩 → `App` `pendingAsk` → Chat `sendMessage`
* **이 Phase에서 하지 않은 것:** 대화 중 입력창 위 상시 칩, 영문 예시 토글

확인:

1. 빈 채팅 → Market 예시 5개 클릭 전송
2. Market 탭 → Ask in chat 칩 → 왼쪽 채팅에 같은 문장 전송

### 9.13 Market Voice/Brief 여닫이 *(완료)*

* **목적:** 내용 있는 Voice/Brief만 접기; empty hint는 토글 없이 그대로 노출
* **변경:** `MarketPanel` `MarketSection` — `collapsible={hasVoice|hasBrief}`, 접힌 헤더에 title 요약
* **이 Phase에서 하지 않은 것:** 접힘 상태 localStorage 유지

---

## 10. Full Report 조회 (item_contents → Worker read path)

> Market Memory **원문(풀리포트)**. `content_briefs.target_id` = `item_contents.id`.
> Brief = 30초 티저, Report = markdown 본문, Chat = 해석만 (전문 dump 금지 — §9.9와 동일).
> 샘플 본문 구조: lead 요약 → `## 하이라이트` / `## 주요 항목` / `## 추가 항목` / `## 마무리` / `## 용어 정리`.

| Phase | 내용 | 상태 |
|-------|------|------|
| A | `item_contents` 조회 + `GET /api/reports/today` (brief → target_id) | 완료 |
| B | Market 패널 Report 섹션 (기본 접힘 + lazy fetch + markdown) | 완료 |
| C | Chat tool / prefetch / Ask chips — 해석만, 탭 유도 | 완료 |
| D | UX 개선 (모달·TOC·Brief→Report 리더) | 완료 |

### 제품 계층 (고정)

```text
Voice  → content_audio   (듣기)
Brief  → content_briefs  (한눈에)
Report → item_contents   (깊이 읽기)  ← 이 섹션
Chat   → 해석·비교·리스크 (본문은 Market 탭)
```

### 10.1 Phase A — Today report HTTP API *(완료)*

* **목적:** curl로 `item_contents` 원문을 검증. Panel/Chat 없음.
* **조인 규칙:**
  1. `getTodayContentBrief()`와 동일 필터로 brief 1건 (없으면 `found: false`)
  2. `brief.target_id` → `item_contents.id` select
  3. brief는 있는데 report row 없으면 `found: false` + `briefId`/`targetId` 힌트
* **스키마 확정 (2026-09-06 probe):**
  * `status` 컬럼 **없음** → `is_active` / `is_public` 사용
  * 제품 select: `id, title, content, summary, lang_code, market_date, report_type, report_tier, category, tags, countries, regions, is_active, is_public, created_at, metadata`
  * 샘플 `target_type` / `report_type`: `digest-report`
  * 본문 `content` = markdown; `summary` = lead 요약 (패널 접힘 헤더에 유용)
* **기본 필터 (report):** `id = target_id`, `is_active = true`, `content` non-empty
* **쿼리:** `?date=` `?lang=` `?brief_type=` `?content_type=` — brief today와 동일
* **수정 및 추가 파일:**
  * `worker/item-contents.ts` *(신규)* — `getTodayItemContent()` + `GET /api/reports/today`
  * `worker/index.ts` — briefs 다음, audio 이전에 라우트
  * `worker/supabase.ts` — 주석에 `item-contents` 언급
* **이 Phase에서 하지 않은 것:** Panel, Chat tool, markdown 렌더, 스키마 변경, `content_sns`/`html_body` 노출

로컬 확인:

```bash
curl -sS 'http://localhost:5173/api/reports/today?date=2026-09-04' | python3 -m json.tool
# found:true → item.title / item.content (markdown) / item.summary

curl -sS 'http://localhost:5173/api/reports/today?date=2099-01-01' | python3 -m json.tool
# found:false

curl -sS 'http://localhost:5173/api/reports/today?date=09-04'
# 400 date must be YYYY-MM-DD
```

로컬 확인 결과 (2026-09-06):
* `?date=2026-09-04` → `found: true`, `targetType: digest-report`, content ~2588자, summary 있음
* `?date=2099-01-01` → `found: false`
* 잘못된 date → `400`

### 10.2 Phase B — Market 패널 Report 섹션 *(완료)*

* **목적:** Voice / Brief 아래 **Report** 3단. 사이드바 미리보기 + (Phase D) 넓은 리더 모달.
* **UX:**
  * 기본 **접힘**. 펼칠 때 `GET /api/reports/today` **lazy** fetch (date|lang 캐시)
  * Brief에 `target_id` 있으면 trailing `Report` 뱃지 + 접힌 헤더 `Tap to load full report`
  * 본문: `Markdown.tsx` + `max-h-96` scroll; 상단에 `summary` 박스
  * Copy = title + content (brief / report 각각)
  * empty: brief만 있고 report 없음 → `Brief ready · Full report missing…`
* **변경 파일:** `src/panels/MarketPanel.tsx`
* **이 Phase에서 하지 않은 것:** Chat tool, prefetch, Ask chip 문구 정리(→ C), TOC/모달(→ D)

확인:

1. Market → Latest → Brief 있고 Report **접힌** 채 로드
2. Report 펼침 → lazy fetch → 하이라이트/주요 항목 등 섹션 보임
3. ko/en Settings 변경 → date 유지한 채 report 캐시 무효화 후 재펼침 시 재조회

### 10.3 Phase C — Chat = 해석 / Report는 탭 *(완료)*

* **목적:** 풀리포트도 §9.9 정책 유지 — 챗에 전문 dump 금지.
* **추가:**
  * `worker/tools/getTodayMarketReport.ts` — `found` + `title`/`summary`/`excerpt`/`highlights` (+ Market 탭 Report 안내). 전문 markdown 미반환
  * `tools-registry.ts` — `getTodayMarketReport` 등록
  * `market-intent.ts` — `report` / `reportVsBrief` 의도; fallback tool 매핑
  * `market-prefetch.ts` — report / brief+report prefetch (`toolChoice: none` 경로 유지)
  * `configure-session.ts` RULE 5–6 — Brief / Voice / Report 역할 분리
  * `MARKET_SUGGESTIONS` — 풀리포트 핵심 / 하이라이트만 / 브리프 vs 리포트 / 리포트 → 탭
* **이 Phase에서 하지 않은 것:** 전문을 챗에 붙이기, 멀티데이 report 비교 API, 패널↔챗 date 동기화

확인:

1. 「어제 풀리포트 핵심만 정리해줘」→ 짧은 요약 + Market 탭 Report 안내 (전문 dump 없음)
2. 「어제 풀리포트 하이라이트만 말해줘」→ highlights 기반 짧은 답
3. 「어제 브리프랑 풀리포트 차이가 뭐야?」→ 짧은 비교
4. 「풀리포트 전문 보여줘」→ Market 탭 → Report 안내만
5. Tools 패널에 `getTodayMarketReport` 노출

### 10.3b reportVsBrief — 가짜 tool_call XML / 의도 오분류 *(완료)*

* **증상:** 「어제 브리프랑 풀리포트 차이가 뭐야?」→ 답이 없고 `<tool_call>getTodayMarketBrief…` XML 텍스트 덤프
* **원인:**
  1. `(어제).{0,24}(차이)` day-compare 정규식이 `reportVsBrief`보다 먼저 매칭
  2. GLM이 prefetch/`toolChoice:none` 대신 가짜 XML tool call을 본문으로 출력
* **수정:**
  * `market-intent.ts` — `reportVsBrief`를 compare보다 먼저; compare는 그제↔어제·멀티데이 위주로 좁힘
  * prefetch instruction + soul RULE 5 — `<tool_call>` / XML 금지, 자연어만

### 10.3c reportVsBrief — 형식 비교 답변 무의미 *(완료)*

* **피드백:** 「Brief compresses / Report expands」는 틀리지 않지만 의미 없음 — Brief는 원래 하이라이트에서 씀
* **수정:**
  * prefetch instruction — 형식 비교 금지; 공유 테마 + **Brief에 없고 Report만 있는 내용**을 근거로 답
  * Ask chip — `리포트가 더 담은 것` / 「어제 브리프에 없는 풀리포트 내용만 짚어줘」

### 10.4 Phase D — Report 리더 UX *(완료 · 유지)*

* **목적:** 사이드바 scroll만으로는 긴 풀리포트 읽기가 답답 → wide 리더 + TOC.
* **유지 (사용자 합격 2026-09-06):**
  * `src/panels/ReportReader.tsx` — wide **모달** + `##` **TOC** 점프 + Esc/backdrop 닫기
  * Market Report 섹션 — TOC 칩, 사이드바 미리보기, **Open wide reader** / Maximize
  * Brief trailing **Report** 뱃지 → 원클릭 리더 오픈 (lazy load)
  * `market_date` 패널일과 다르면 경고 한 줄
* **넣지 않음:** 접힘 localStorage

확인:

1. Market → Report 펼침 → TOC 칩으로 하이라이트/주요 항목 점프
2. **Open wide reader** 또는 Brief의 **Report** → 넓은 모달, Esc로 닫기

### 결정해 둔 것 / 나중에 확정

* **조인:** 항상 brief → `target_id` → `item_contents` (날짜·lang은 brief 필터와 공유)
* **UI:** 패널 접힘 + lazy + wide 리더 모달 + TOC (Phase D 유지)
* **본문 포맷:** markdown
* **스키마 (A 확정):** `status` 없음; `is_active`; `summary` 별도 컬럼; `report_type=digest-report`
* **Latest:** 데이터 있는 최신 `market_date` (`GET /api/briefs/latest-date`) — Seoul yesterday 고정 아님 (§10.5)

### 10.5 Data-backed Latest market_date *(완료)*

* **문제:** Latest = Seoul yesterday 고정 → 월요일에 일요일이 잡혀 빈 화면 (미장/주말 무장)
* **해결:** `content_briefs`에서 final brief가 있는 **max(market_date)** 를 Latest로 사용
* **추가:**
  * `getLatestContentBriefMarketDate()` + `GET /api/briefs/latest-date?lang=`
  * MarketPanel — 마운트/lang 시 latest-date fetch → 기본일·Latest 버튼
  * `resolveToolMarketDate` — omit date 시 DB latest (실패 시 calendar yesterday fallback)
  * prefetch compare — later = data-backed latest, earlier = that − 1 day
  * soul RULE 7 — latest ≠ 어제 고정 명시
* **유지:** 사용자가 「어제」라고 하면 calendar yesterday (비어 있을 수 있음)

로컬 확인 (2026-09-07 Mon):

```bash
curl -sS 'http://localhost:5173/api/briefs/latest-date?lang=ko' | python3 -m json.tool
# marketDate: 2026-09-05, seoulYesterday: 2026-09-06, calendarToday: 2026-09-07
```

확인:

1. Market 탭 기본/Latest → `2026-09-05` (데이터 있는 날), 빈 일요일 아님
2. Today → `2026-09-07` empty + Open latest · 2026-09-05
3. 챗 omit date / 「latest」→ 같은 data-backed 날

### 10.6 Report topic chips (T1) *(완료 · 시험)*

* **목적:** Report `tags` / `countries` / `regions`를 얇은 칩으로 표시 (entities·개인화 저장은 나중)
* **UI:** 사이드바 순서 **Brief → Voice → Topics → Report** (Brief만 기본 펼침; 나머지 접힘) + wide 리더 모달 헤더
* **헤더 help:** 본문 설명 문구 제거 → KO 배지 왼쪽 `?` (hover/click 팝오버)
* **데이터:** Topics 펼침 시 기존 `reports/today` fetch 재사용 (별도 DB 저장 없음)
* **끄기 (코드 플래그, `ReportReader.tsx` 상단):**
  * `SHOW_REPORT_TOPIC_CHIPS = false` → Topics 섹션·모달 칩 모두 숨김
  * `SHOW_TOPICS_SECTION = false` → 사이드바 Topics만 숨김 (모달 칩은 유지)
* **표시:** tags 최대 8 (+N), countries/regions는 border 칩으로 구분
* **의도적으로 안 함:** MyMemory preference 저장 / 클릭 액션 / entities (→ §10.7)

확인: Brief→Voice→Topics→Report · Brief만 기본 펼침 · `?` 도움말 · Topics/모달 칩

### 10.7 Report entities fold (T2) *(완료 · 시험)*

* **목적:** `metadata.entities` 비어 있지 않은 그룹을 접힘 블록으로 표시 (읽기 전용)
* **UI:** Topics 섹션(칩 아래) + wide 리더 모달 헤더 — **기본 접힘**
* **그룹 순서:** companies → institutions → technologies → industries → products → indicators → persons (+ 기타 비어 있지 않은 키)
* **표시:** 그룹당 최대 12 (+N); countries는 surface `countries`와 중복될 수 있어 entities에 있을 때만
* **UI polish:** Tags/Places 라벨 분리 · Named entities 접힘(미리보기 문구) · 그룹별 개수 + border 칩
* **끄기 (`ReportReader.tsx`):**
  * `SHOW_REPORT_ENTITIES = false` → Topics·모달 모두 숨김
  * `SHOW_REPORT_ENTITIES_IN_TOPICS = false` → 모달만 유지
* **의도적으로 안 함:** 클릭→채팅 / MyMemory 저장 (키워드 chat은 → §10.8)

확인:

1. Topics 펼침 → Entities 접힘 행 → 펼치면 Companies/Tech 등
2. Open wide reader → 헤더에도 Entities 접힘
3. Topics에서만 끄려면 `SHOW_REPORT_ENTITIES_IN_TOPICS` false

### 10.8 Report keywords in chat (T3) *(완료 · 시험)*

* **목적:** 챗/prefetch에 키워드만 짧게 제공 (전문·entities JSON 덤프 금지)
* **헬퍼:** `worker/report-keywords.ts` → `reportChatKeywords()` (tags≤8, places≤6, companies/tech 등 소수)
* **연결:**
  * `getTodayMarketReport` 응답 `keywords` (기존 raw `tags` 제거)
  * `market-prefetch` loadReport에도 `keywords`
  * intent: 키워드/태그/토픽/주요 기업 → `report` + `keywordsOnly`
  * Ask chips: **키워드만**, **주요 기업** (`market-suggestions.ts`)
  * soul RULE 5 — keywords 객체 우선, 이름 날조 금지
* **의도적으로 안 함:** Topics 칩 클릭→채팅 (→ §10.9) / MyMemory 저장

확인:

1. Ask “키워드만” / 챗 “Latest 풀리포트 키워드만” → tags·places·기업 짧게
2. “주요 기업·기관만” → companies/institutions 위주
3. Prefetch에 `keywords` 있고 full metadata.entities 없음

### 10.9 Topic chip → Ask in chat (T4) *(완료 · 시험)*

* **목적:** Topics / 모달의 tag·place·entity 칩 클릭 → 왼쪽 챗에 질문 전송 (저장 아님)
* **프롬프트:** `topicChipAskPrompt()` — 패널 `market_date` 또는 Latest + 「라벨」관련 짧게 짚어줘
* **끄기:** `SHOW_TOPIC_CHIP_ASK = false` (`ReportReader.tsx`)
* **의도적으로 안 함:** MyMemory preference 저장은 → §10.10 / 필터

확인:

1. Topics 칩 클릭 → 챗에 해당 날짜·키워드 질문 입력
2. Named entities 펼침 후 기업명 클릭 → 동일
3. wide reader 헤더 칩도 동일

### 10.10 Topic → MyMemory interests (P0+P1) *(완료 · 시험)*

* **P0 매핑** (`src/lib/topic-preference.ts`):
  * tag / place → `theme`
  * entity `companies` / `institutions` → `company`
  * entity `industries` → `industry`
  * 나머지 entity → `theme` (places는 당분간 theme; geo kind 없음)
* **P1 UI:**
  * Topics **My interests** 접힘 — `GET/DELETE /memory/preferences`
  * 칩 옆 ★ — 저장 `POST` level=5 + `star` event / 다시 누르면 삭제
  * Ask(라벨 클릭)과 Star 분리
* **끄기:** `SHOW_TOPIC_CHIP_STAR` / `SHOW_MY_INTERESTS`
* **의도적으로 안 함:** 챗 prefetch 관심 주입 (P3) / Brief weights 반영 / hide·less

확인:

1. Topics ★ → My interests에 나타남 · 새로고침 후 유지
2. My interests × 또는 ★ 재클릭 → 삭제
3. 저장된 칩에 amber ring + filled star

### 10.11 Panel reflection — in-report interests (P2) *(완료 · 시험)*

* **매칭** (`collectReportPreferenceKeys` / `interestInReport` / `sortPreferencesForReport`):
  * 오늘 리포트 tags · places · entities → preference key set
  * My interests: 리포트에 있는 항목 먼저 정렬 + amber `in report` 뱃지
  * 헤더 `N in report` 카운트
* **필터:** `Show interests in this report only` (`SHOW_INTERESTS_ONLY_FILTER`)
  * My interests 목록 · Topics 칩 · Named entities 동시 필터
  * 날짜/언어 변경 시 필터 해제
* **끄기:** `SHOW_INTERESTS_ONLY_FILTER`
* **의도적으로 안 함:** 챗 prefetch 관심 주입 (P3) / Brief weights / hide·less

확인:

1. ★ 저장 후 Topics 펼침 → My interests에 `in report` + 헤더 카운트
2. 필터 ON → 리포트에 없는 interest / 칩 숨김
3. wide reader도 동일 필터 반영


