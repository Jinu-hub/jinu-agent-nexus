# HTTP / Frontend 라우팅 트리

> **단일 소스.** Worker·SPA 경로가 바뀌면 이 파일만 갱신한다.  
> 작업노트에는 “ROUTING 반영” 한 줄만 남긴다 (`WORK_NOTES_2.md`).  
> 아카이브 스냅샷(§7 완료 시점)은 [`WORK_NOTES.md` §6.1](./WORK_NOTES.md)에만 둔다.

---

## Worker (`worker/index.ts`)

```text
worker/index.ts (HTTP Gateway)
 ├── /notes, /notes/:key                           → Workers KV (My Market Notes)
 ├── /memory/*                                     → MyMemory DO (개인화 SQLite; topic_labels `(key,lang)`)
 ├── /settings, /settings/events                   → ChatAgent DO (설정 SQLite)
 ├── GET  /api/supabase/health                     → Supabase 도달성 점검
 ├── GET  /api/briefs/today                        → content_briefs 당일 브리핑 조회 (§9)
 ├── GET  /api/briefs/latest-date                  → 데이터 있는 최신 market_date (§10.5)
 ├── GET  /api/reports/today                       → item_contents 풀리포트 (via brief.target_id) (§10)
 ├── GET  /api/audio/pending                       → content_audio script_ready 조회 (§8 Phase 1)
 ├── GET  /api/audio/today                         → completed Voice 메타 + play URL (§8 Phase 7)
 ├── POST /api/audio/claim                         → script_ready → generating claim (§8 Phase 2)
 ├── GET  /api/audio/storage/health                → AUDIO_BUCKET put → get 점검 (§8 Phase 3)
 ├── POST /api/audio/tts                           → 1 row TTS 테스트, audio/mpeg (§8 Phase 4)
 ├── POST /api/audio/generate                      → TTS → R2 → completed (§8 Phase 5)
 ├── GET  /api/audio/file/:id                      → R2 MP3 스트리밍 (§8 Phase 5)
 ├── POST /api/audio/cron/run                      → Cron drain 1회 수동 실행 (§8 Phase 6)
 ├── POST /api/market-vector/ingest                → item_contents → MARKET_VECTOR_DB (§14.1)
 ├── POST /api/market-vector/query                 → 관심사 유사도 검색 (+ 필터) (§14.2)
 ├── POST /api/market-vector/clear                 → 해당 리포트 Vectorize 청크 삭제
 ├── POST /api/market-labels/resolve              → Tags/Keywords 본문 grounded 표시 라벨 (B안; body: force/skip_llm)
 ├── POST /api/upload                              → ChatAgent DO (PDF RAG 업로드)
 ├── GET  /screenshots/*                           → R2 Bucket (브라우저 스크린샷)
 ├── /agents/ChatAgent/default                     → ChatAgent (WebSocket + Think Chat)
 └── /agents/live-market-room-agent/market-pulse   → LiveMarketRoomAgent (실시간 투표/알람)
```

---

## Frontend (React & Vite)

```text
src/ (React Frontend)
 ├── /      → Chat 메인 쉘 + 패널 (Memory, Skills, Files, Tools, Sources, Browser, Schedules, Extensions, MCP, Settings, Market …)
 └── /live  → Market Pulse 실시간 투표방 (단독 전체 화면)
```
