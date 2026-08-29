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

* **목적:** Worker에서 Supabase(Market Memory)에 접근할 수 있는 기반만 마련. 아직 제품 테이블 조회/갱신은 없음
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
