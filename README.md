# Cloudflare Agent 보일러플레이트

> 영문 원본 — [README.eng.md](./README.eng.md)

프로덕션 레벨의 Cloudflare Agents 기반 보일러플레이트입니다. 채팅, 영구 메모리, 온디맨드 스킬, 가상 파일 시스템, PDF 기반 RAG, 실시간 브라우저, 영구 스케줄, 런타임에서 자체 작성 도구, MCP 클라이언트까지 모두 연결되어 있어, 바로 포크(fork)하여 시작할 수 있습니다.

[**노마드코더 "모두를 위한 OpenClaw" 강의**](https://nomadcoders.co/clawclone) 전용 보일러플레이트로 제작되었습니다. 강의에서 다루는 모든 기능을 그대로 담았고, 각 섹션마다 강의의 어느 부분과 연결되는지, 어떻게 고치고 확장하면 되는지 정리해두었습니다.

![데모 — Memory 패널이 실시간으로 업데이트되는 채팅 화면](demo.jpg)

---

## 목차

1. [빠른 시작](#빠른-시작)
2. [필수 설정](#필수-설정)
   - [`wrangler.jsonc` 변수](#1-wranglerjsonc-변수)
   - [`.dev.vars` 시크릿](#2-devvars-시크릿)
   - [Vectorize + R2 + 스킬 (명령어 한 번으로 설정)](#3-vectorize-index--r2-bucket--스킬-시드)
3. [프로덕션 전 — AI Gateway로 전환하기](#프로덕션-전--ai-gateway로-전환하기)
4. [프로젝트 구조](#프로젝트-구조)
5. [동작 원리](#동작-원리)
6. [모델 교체하기](#모델-교체하기)
7. [도구 추가하기](#도구-추가하기)
8. [패널 추가하기](#패널-추가하기)
9. [스킬 추가하기](#스킬-추가하기)
10. [MCP 서버 연결하기](#mcp-서버-연결하기)
11. [배포하기](#배포하기)
12. [추가 기능 구현하기](#추가-기능-구현하기)
13. [더 알아보기](#더-알아보기)

---

## 빠른 시작

```bash
# 1. 설치
npm install

# 2. 최소 설정
cp .dev.vars.example .dev.vars        # API_TOKEN 붙여넣기
                                       # 라이브 브라우저 패널에서만 필요합니다. 아래 설명 참고
#   wrangler.jsonc → vars.ACCOUNT_ID 수정

# 3. Cloudflare 리소스 생성 (R2 + Vectorize + 스킬 시드)
npm run setup

# 4. 실행
npm run dev                            # http://localhost:5173
```

**기본 모델은 Workers AI에서 실행되는 `@cf/zai-org/glm-4.7-flash`입니다.** 무료 티어(하루 1만 뉴런)로 동작하며 추가 설정이 필요 없습니다. 클론하자마자 채팅을 바로 사용할 수 있습니다. 프로덕션 배포 준비가 되면 Unified Billing이 적용된 AI Gateway로 전환하세요. 자세한 내용은 [프로덕션 전 — AI Gateway로 전환하기](#프로덕션-전--ai-gateway로-전환하기)를 참고하세요.

---

## 필수 설정

### 1. `wrangler.jsonc` 변수

`wrangler.jsonc`를 열고 다음 값을 채워주세요:

```jsonc
"vars": {
  "ACCOUNT_ID": "your-cloudflare-account-id",     // dash.cloudflare.com에서 확인
  "AI_GATEWAY_NAME": "agent-boilerplate",         // AI Gateway로 전환하기 전까지는 사용되지 않음
  "CHAT_MODEL": "@cf/zai-org/glm-4.7-flash",      // Workers AI 기본값
  "EMBEDDING_MODEL": "@cf/baai/bge-base-en-v1.5", // 768차원, Vectorize와 일치
}
```

`ACCOUNT_ID`는 Cloudflare 대시보드 오른쪽 사이드바에서 확인할 수 있습니다. 라이브 브라우저 패널(Browser Rendering DevTools API)과, AI Gateway 전환 시 필요합니다. 브라우저 기능을 사용하지 않는다면 placeholder로 남겨두어도 됩니다.

`CHAT_MODEL`과 `EMBEDDING_MODEL`은 [모델 교체하기](#모델-교체하기)에서 자세히 설명합니다. 기본값은 Workers AI 스택입니다. Gateway 설정 없이 무료로 동작합니다.

### 2. `.dev.vars` 시크릿

템플릿을 복사한 뒤 값을 채우세요:

```bash
cp .dev.vars.example .dev.vars
```

```ini
API_TOKEN=your-cloudflare-api-token
```

이 토큰은 라이브 브라우저 패널에서 **필수**입니다(DevTools Live View URL에 서명하는 데 사용됩니다). 브라우저 패널을 쓰지 않고 Workers AI 기본값을 그대로 사용한다면 비워두어도 되며, 채팅은 정상적으로 동작합니다.

추후 AI Gateway로 전환하면(다음 섹션 참고), 같은 토큰이 게이트웨이 인증과 Unified Billing ID로 사용됩니다.

토큰은 여기서 생성하세요: <https://dash.cloudflare.com/profile/api-tokens>

필요한 권한:

- **Account → Browser Rendering → Edit**
- **Account → AI Gateway → Run** (AI Gateway로 전환할 때 추가)

프로덕션에서는 다음 명령어로 시크릿을 등록하세요:

```bash
npx wrangler secret put API_TOKEN
```

### 3. Vectorize index + R2 bucket + 스킬 시드

가장 빠른 방법은 올인원 스크립트를 실행하는 것입니다:

```bash
npm run setup
```

이 명령어는 아래 세 가지 작업을 순서대로 실행합니다. 모두 멱등적으로 작성되어 있기 때문에 같은 명령어를 다시 실행해도 괜찮습니다. 이미 만들어진 리소스가 있다면 오류로 중단하지 않고 "skip" 메시지와 함께 건너뜁니다.

1. `wrangler r2 bucket create boilerplate-bucket`
2. `wrangler vectorize create boilerplate-vectorstore --dimensions=768 --metric=cosine`
3. `wrangler r2 object put boilerplate-bucket/skills/*.md --remote`

수동으로 실행하고 싶다면 다음을 사용하세요:

```bash
npm run setup:r2          # "boilerplate-bucket" R2 버킷 생성
npm run setup:vectorize   # 768차원 cosine Vectorize 인덱스 생성
npm run seed:skills:remote
```

`wrangler.jsonc`에서 버킷이나 인덱스 이름을 변경했다면 `scripts/setup.mjs` 상단의 이름과 `package.json`의 관련 스크립트를 함께 수정하세요.

> **Vectorize 차원은 생성 후 변경할 수 없습니다.** 기본값 768은 기본 `EMBEDDING_MODEL`인 `@cf/baai/bge-base-en-v1.5`와 일치합니다. 다른 임베딩 모델로 바꾸려면 인덱스를 삭제하고 올바른 차원으로 다시 생성해야 합니다. 자세한 내용은 [모델 교체하기](#모델-교체하기)를 참고하세요.

---

## 프로덕션 전 — AI Gateway로 전환하기

Workers AI 기본값은 시작하기에 좋지만, 프로덕션 배포에서는 **Cloudflare AI Gateway**를 통해 라우팅하는 것이 좋습니다. AI Gateway를 사용하면 다음을 얻을 수 있습니다:

- **대시보드 뷰**: 모든 프롬프트, 응답, 지연 시간, 비용을 한눈에 확인
- **프롬프트-응답 캐싱**: 반복 쿼리 비용 절감
- **경로별 레이트 리미팅**
- **프로바이더 폴백**: Anthropic 호출이 실패하면 OpenAI로 자동 전환
- **Unified Billing**: OpenAI / Anthropic / Google 비용을 Cloudflare 크레딧으로 결제, 업스트림 프로바이더 키 불필요

### 설정 (Cloudflare 대시보드에서 최초 1회)

1. 게이트웨이를 생성합니다: <https://dash.cloudflare.com/?to=/:account/ai-gateway>
2. **Create gateway**를 클릭하고, 슬러그를 정한 뒤 복사하세요.
3. 게이트웨이를 열고 **Settings** → **Unified Billing**을 활성화합니다.
4. <https://dash.cloudflare.com/profile/api-tokens>에서 API 토큰을 생성하거나 업데이트해 **Account → AI Gateway → Run** 권한을 추가하세요.

전체 문서: <https://developers.cloudflare.com/ai-gateway/get-started/>

### 연결하기

`wrangler.jsonc`를 편집하세요:

```jsonc
"vars": {
  "AI_GATEWAY_NAME": "your-gateway-slug",
  "CHAT_MODEL": "openai/gpt-4.1-mini",
  "EMBEDDING_MODEL": "openai/text-embedding-3-small",
}
```

`provider/model-id` 형식은 Workers AI가 아닌 프로바이더로 게이트웨이를 통해 라우팅되도록 합니다. `API_TOKEN`이 설정되어 있는지 확인하세요. 로컬에서는 `.dev.vars`, 프로덕션에서는 `wrangler secret put`으로 설정합니다. 그다음 `wrangler dev`를 재시작하세요. 그 외의 코드 변경은 필요 없습니다.

`EMBEDDING_MODEL`을 차원이 다른 모델로 바꾸는 경우(`text-embedding-3-small`은 1536차원), Vectorize 인덱스를 삭제하고 다시 생성해야 합니다. 자세한 절차는 [모델 교체하기](#모델-교체하기)를 참고하세요.

---

## 프로젝트 구조

```
worker/
  index.ts             Worker 진입점 — HTTP 라우팅 + DO 재export
  chat-agent.ts        ChatAgent 클래스 (Think 확장, 약 600줄)
  ai.ts                AI Gateway 헬퍼 — 여기서 모델 변경
  ingest.ts            RAG용 마크다운 청커
  tools/
    getCurrentTime.ts  서버 사이드 도구 예시
    getWeather.ts      외부 API를 호출하는 서버 사이드 도구
    getUserTimezone.ts 클라이언트 사이드 도구 (execute 없음)
    sendNotification.ts 승인 도구 (human-in-the-loop)
    setReminder.ts     agent.schedule을 사용하는 서버 사이드 도구
    recall.ts          RAG 검색
    navigate.ts        브라우저 네비게이션
    screenshot.ts      브라우저 스크린샷 → R2

src/
  main.tsx             React 진입점
  App.tsx              메인 셸 + 탭 레지스트리
  index.css            Tailwind 4 + 테마 토큰
  lib/utils.ts         cn() 헬퍼
  components/ui/       shadcn 스타일 프리미티브
  chat/
    Chat.tsx           useAgentChat 연결, 메시지 리스트, 입력
    Message.tsx        메시지 + 도구 호출 렌더링, 승인 UI
    Markdown.tsx       react-markdown 래퍼
  panels/
    PanelHeader.tsx    공용 헤더 (아이콘, 제목, clear 버튼)
    MemoryPanel.tsx
    SkillsPanel.tsx
    FilesPanel.tsx
    ToolsPanel.tsx
    SchedulesPanel.tsx
    SourcesPanel.tsx
    BrowserPanel.tsx
    ExtensionsPanel.tsx
    McpPanel.tsx

skills/                온디맨드 컨텍스트로 R2에 시드되는 마크다운 파일
wrangler.jsonc         모든 Cloudflare 바인딩과 변수
worker-env.d.ts        Env 타입 확장 (시크릿 + 타입이 지정된 DO stub)
.dev.vars.example      로컬 시크릿 템플릿
```

---

## 동작 원리

**에이전트는 Durable Object입니다.** "name" 하나당 인스턴스 하나가 만들어집니다. 이 보일러플레이트는 `"default"`라는 단일 name을 사용합니다. 멀티 유저로 만들려면 `worker/index.ts`에서 로그인한 사용자마다 고유 name을 만들어주세요.

**에이전트는 `Think`를 확장합니다.** 이를 통해 다음 기능이 기본으로 제공됩니다:

- WebSocket 기반 채팅 프로토콜
- 메시지 영속성 + 분기 처리
- abort와 재개 가능한 스트림을 지원하는 스트리밍 응답
- durable fibers를 통한 크래시 복구 (기본값: `chatRecovery = true`)
- `read`/`write`/`edit`/`list`/`find`/`grep`/`delete` 도구가 포함된 **가상 파일시스템**
- 메모리와 스킬을 위한 컨텍스트 블록을 가진 **세션** — `set_context` / `load_context` / `unload_context` 도구를 모델이 자동으로 사용
- 스케줄 / 큐 / 재시도 프리미티브
- DO 인스턴스 범위의 SQL 스토리지

**이 보일러플레이트는 다음이 추가되어 있습니다:**

- **Memory** — SQLite에 영속 저장되는 쓰기 가능한 컨텍스트 블록
- **Skills** — R2에 있는 마크다운 파일 디렉터리입니다. 프롬프트에 목록이 들어가고, 필요할 때 로드됩니다
- **RAG** — PDF 내용을 쪼개고 임베딩한 뒤 Vectorize와 SQLite에 저장해, `recall` 도구로 다시 검색합니다
- **Browser** — Cloudflare Browser Rendering과 Live View iframe으로 `navigate`, `screenshot`을 제공합니다. 사용자는 agent가 보는 화면을 확인할 수 있습니다
- **Schedules** — `setReminder` 도구가 Durable Object 알람을 등록합니다
- **Extensions** — `load_extension`을 통해 모델이 실행 중에 `worker_loaders` 기반 JS 도구를 직접 작성할 수 있습니다
- **MCP client** — 외부 MCP 서버에 연결하면 해당 서버의 도구가 에이전트 툴셋에 자동 병합

---

## 모델 교체하기

채팅 모델과 임베딩 모델은 모두 **`wrangler.jsonc`**에서 설정합니다. 코드 수정은 필요 없습니다. 모델 ID의 접두사가 워커의 라우팅 방식을 결정합니다:

- **`@cf/...`** → `env.AI` 바인딩을 통해 Workers AI를 직접 호출합니다. 무료 티어이며, 별도 설정이 필요 없고, 채팅에는 API 토큰도 필요하지 않습니다.
- **`provider/model-id`** (예: `openai/gpt-4.1-mini`) → Unified Billing이 적용된 AI Gateway로 라우팅합니다. 게이트웨이와 AI Gateway → Run 권한이 있는 `API_TOKEN`이 필요합니다. [프로덕션 전 — AI Gateway로 전환하기](#프로덕션-전--ai-gateway로-전환하기)를 참고하세요.

```jsonc
"vars": {
  // ...
  "CHAT_MODEL": "@cf/zai-org/glm-4.7-flash",        // ← 기본값
  "EMBEDDING_MODEL": "@cf/baai/bge-base-en-v1.5",   // ← 기본값
}
```

### 채팅 모델

Workers AI (AI Gateway 불필요):

| `CHAT_MODEL`                               | 비고                       |
| ------------------------------------------ | -------------------------- |
| `@cf/zai-org/glm-4.7-flash`                | 기본값. 빠르고 저렴합니다. |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Llama 3.3 70B.             |
| `@cf/qwen/qwen3-32b-fast`                  | Alibaba Qwen 3.            |

전체 Workers AI 카탈로그: <https://developers.cloudflare.com/workers-ai/models/>

Unified Billing이 적용된 AI Gateway:

| `CHAT_MODEL`                        | 비고                 |
| ----------------------------------- | -------------------- |
| `openai/gpt-4.1-mini`               | OpenAI, 빠른 티어.   |
| `openai/gpt-4.1`                    | OpenAI, 더 큰 모델.  |
| `anthropic/claude-sonnet-4-5`       | Anthropic 미드 티어. |
| `anthropic/claude-opus-4-5`         | Anthropic 플래그십.  |
| `google-ai-studio/gemini-2.5-flash` | Google.              |

전체 AI Gateway 프로바이더 카탈로그: <https://developers.cloudflare.com/ai-gateway/providers/>

### 임베딩 모델 — 차원이 Vectorize와 일치해야 합니다

| `EMBEDDING_MODEL`               | 차원             | 경로       |
| ------------------------------- | ---------------- | ---------- |
| `@cf/baai/bge-base-en-v1.5`     | **768** ← 기본값 | Workers AI |
| `@cf/baai/bge-large-en-v1.5`    | 1024             | Workers AI |
| `@cf/baai/bge-m3`               | 1024             | Workers AI |
| `openai/text-embedding-3-small` | 1536             | AI Gateway |
| `openai/text-embedding-3-large` | 3072             | AI Gateway |

차원이 다른 모델로 바꾸면 Vectorize 인덱스를 삭제하고 다시 생성해야 합니다. Vectorize 차원은 생성 후 변경할 수 없습니다:

```bash
npx wrangler vectorize delete boilerplate-vectorstore
npx wrangler vectorize create boilerplate-vectorstore \
  --dimensions=<new-dim> --metric=cosine
```

그다음 `scripts/setup.mjs` 상단의 `VECTOR_DIM`도 새 차원으로 업데이트해 향후 실행 시 일치하도록 하세요.

### non-Workers-AI 프로바이더 인증

**Unified Billing**을 사용하면 AI Gateway 목록의 모든 모델 비용이 Cloudflare 크레딧으로 청구됩니다. 업스트림 프로바이더 키는 필요 없습니다. 직접 보유한 프로바이더 키(BYOK)를 사용하고 싶다면 게이트웨이 설정에 업로드하세요. 그러면 게이트웨이는 Unified Billing 대신 해당 키를 사용합니다.

### AI Gateway 우회 (프로바이더에 BYOK로 직접 연결)

AI Gateway를 건너뛰고 직접 보유한 키로 프로바이더에 바로 연결하고 싶다면 `worker/ai.ts`를 수정하세요. `pickProvider` 함수가 모델을 인식하는 유일한 경계입니다. AI Gateway branch를 다음처럼 교체하세요:

```ts
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
return openai.chat(modelId);
```

그리고 `.dev.vars`에 `OPENAI_API_KEY`를 추가하세요.

### `AiGatewayUnauthorizedError` — 빠른 진단

AI Gateway 모델로 전환한 뒤 이 오류가 보인다면:

- `.dev.vars`에 `API_TOKEN`이 있는지 확인하세요. 수정 후에는 `wrangler dev`를 재시작해야 합니다. `.dev.vars`는 시작 시점에 캐시됩니다.
- 토큰에 **Account → AI Gateway → Run** 권한이 있는지 확인하세요.
- `AI_GATEWAY_NAME`이 대시보드의 슬러그와 일치하는지 확인하세요.
- 게이트웨이에 **Authenticated Gateway**가 켜져 있다면(Unified Billing과 별도 설정), 해당 권한이 있는 토큰이 필요합니다. 같은 `API_TOKEN`으로 이 두 가지를 모두 처리합니다.

---

## 도구 추가하기

도구는 세 가지 타입이 있고, 각각 패턴이 다릅니다. 모든 도구는 `worker/tools/` 아래에 별도 파일로 둡니다.

### 서버 사이드 도구 (가장 일반적)

`execute`를 정의하세요. 이 함수는 에이전트 내부에서 실행됩니다. 에이전트의 SQL, env 바인딩, 네트워크가 필요한 작업에 사용하세요.

```ts
// worker/tools/getStockPrice.ts
import { tool } from "ai";
import { z } from "zod";

export function createGetStockPriceTool() {
  return tool({
    description: "주식 티커의 현재 가격을 조회합니다.",
    inputSchema: z.object({
      symbol: z.string().describe("티커 심볼, 예: 'AAPL'."),
    }),
    execute: async ({ symbol }) => {
      const res = await fetch(`https://api.example.com/quote?s=${symbol}`);
      const json = await res.json();
      return { symbol, price: json.price };
    },
  });
}
```

도구가 `env`(바인딩용)나 에이전트 자체(`sql`, `schedule`, `broadcast`용)를 필요로 한다면:

```ts
import type { ChatAgent } from "../chat-agent";

export function createMyTool(agent: ChatAgent, env: Env) {
  return tool({
    /* ... */
    execute: async (input) => {
      await env.BUCKET.put(/* ... */);
      await agent.schedule(60, "remind", {
        /* ... */
      });
    },
  });
}
```

### 클라이언트 사이드 도구

`execute`를 생략합니다. 스키마는 브라우저로 전달되고, `Chat.tsx`의 `onToolCall`이 클라이언트 사이드에서 처리합니다. 브라우저만 알 수 있는 정보(위치, 타임존, 선택된 텍스트, 클립보드)에 사용하세요.

```ts
// worker/tools/getClipboard.ts
export function createGetClipboardTool() {
  return tool({
    description: "사용자 클립보드 텍스트를 읽습니다.",
    inputSchema: z.object({}),
    // execute 없음.
  });
}
```

그다음 `src/chat/Chat.tsx`에서 `onToolCall` 핸들러를 확장하세요:

```ts
if (toolCall.toolName === "getClipboard") {
  const text = await navigator.clipboard.readText();
  addToolOutput({
    toolCallId: toolCall.toolCallId,
    output: { text },
  });
  return;
}
```

### 승인 도구 (human-in-the-loop)

`execute`와 `needsApproval`을 모두 정의합니다. SDK는 `execute`를 호출하기 전에 멈추고, 사용자가 승인 또는 거절할 때까지 기다립니다.

```ts
// worker/tools/chargeCard.ts
export function createChargeCardTool(env: Env) {
  return tool({
    description: "사용자의 저장된 카드에 청구합니다.",
    inputSchema: z.object({ amountCents: z.number().int().positive() }),
    needsApproval: ({ amountCents }) => amountCents > 1000, // > $10
    execute: async ({ amountCents }) => {
      // Stripe 호출…
      return { ok: true, amountCents };
    },
  });
}
```

`needsApproval`은 `true`(항상 승인 필요), `false`(승인 불필요), 또는 호출별로 판단하는 함수가 될 수 있습니다.

### 도구 등록하기

`worker/chat-agent.ts`에서 import를 추가하고 `getTools()`에 한 줄을 추가하세요:

```ts
import { createGetStockPriceTool } from "./tools/getStockPrice";

override getTools(): ToolSet {
  return {
    // …기존 도구들…
    getStockPrice: createGetStockPriceTool(),
  };
}
```

키(`getStockPrice`)가 LLM에게 보이는 도구 이름입니다.

---

## 패널 추가하기

1. `src/panels/MyPanel.tsx`를 생성하세요. 기존 패널을 템플릿으로 사용하면 됩니다. 모든 패널은 `<PanelHeader>`로 시작하고 props를 통해 state를 읽습니다.
2. 에이전트가 아직 노출하지 않는 서버 데이터가 필요하다면:
   - `worker/chat-agent.ts`의 `State`에 새 필드를 추가합니다.
   - `refreshAll()`에서 그 필드를 채웁니다.
   - state는 `setState()` → `cf_agent_state` 프로토콜 메시지를 통해 연결된 모든 탭에 자동 브로드캐스트됩니다.
3. 패널에 액션(clear, delete 등)이 필요하다면 `ChatAgent`에 `@callable() async method() {…}`를 추가하세요. 프론트엔드는 `agent.stub.method()`로 호출합니다.
4. `src/App.tsx`에 패널을 등록하세요:
   - `PANELS` 배열(tab strip)에 항목을 추가합니다.
   - 매칭되는 `<TabsContent value="my-panel">…</TabsContent>` 블록을 추가합니다.

---

## 스킬 추가하기

"스킬"이란 필요할 때 에이전트의 컨텍스트로 로드되는 마크다운 파일입니다. 에이전트의 시스템 프롬프트에는 모든 스킬의 디렉터리 목록이 포함되어 있으며, 모델이 현재 대화에 관련 있다고 판단하면 `load_context`를 호출해 내용을 가져옵니다.

```bash
# 1. 파일 추가
echo "# 피자 레시피\n\n밀가루, 물, 소금을 섞고…" > skills/pizza.md

# 2. R2에 시드
npm run seed:skills:local
```

프로덕션에서는 `npm run seed:skills:remote`를 사용하거나 R2 대시보드에서 직접 업로드하세요.

스킬이 많거나 하위 폴더, 메타데이터 등 더 정교한 시드가 필요하다면 `package.json`의 시드 스크립트를 확장하거나 커스텀 Node 스크립트로 교체하세요.

---

## MCP 서버 연결하기

MCP 패널(오른쪽 패널 → MCP 탭)에 이름과 Streamable HTTP MCP URL을 입력하고 **Connect**를 클릭하세요. 서버의 도구는 다음 턴부터 에이전트의 툴셋에 자동으로 병합됩니다.

서버에 OAuth가 필요하면 패널에 **Authenticate** 링크가 표시됩니다. 클릭하면 새 탭에서 OAuth 플로우가 열립니다. 인증이 끝나면 SDK가 자동으로 재연결합니다.

시도해 볼 수 있는 서버:

- Cloudflare Docs: `https://docs.mcp.cloudflare.com/sse`
- GitHub MCP: `https://api.githubcopilot.com/mcp/` (OAuth 필요)

---

## 배포하기

```bash
# 최초 1회: 프로덕션 리소스 생성
npm run setup

# 프로덕션 시크릿 등록
npx wrangler secret put API_TOKEN

# 배포
npm run deploy
```

Worker는 `https://<name>.<your-subdomain>.workers.dev`에서 동작합니다.

커스텀 도메인을 추가하려면 Cloudflare 대시보드의 Worker 설정 페이지에서 **Routes** 섹션을 확인하세요.

---

## 추가 기능 구현하기

이 보일러플레이트는 추가 설정이나 유료 플랜이 필요한 몇 가지 기능을 의도적으로 포함하지 않았습니다. 각 기능은 강의의 해당 섹션에서 다루며, 필요할 때 직접 추가할 수 있습니다.

### Voice (강의 #6)

```bash
npm install @cloudflare/voice
```

`worker/`에 `voice-agent.ts`를 추가해 `withVoice(Agent)`를 `WorkersAIFluxSTT` + `WorkersAITTS`로 감싸세요 (Workers AI가 기존 `AI` 바인딩에서 둘 다 무료로 제공합니다).

`wrangler.jsonc`에 `VoiceAgent`용 DO 바인딩 + 마이그레이션 항목을 추가하세요.

프론트엔드에는 `@cloudflare/voice/react`의 `useVoiceAgent`를 사용한 `<VoicePanel>`을 추가하세요.

### Email (강의 #5)

필요한 것:

- Cloudflare 네임서버에 등록된 도메인
- 발신용 Workers Paid 플랜 ($5/월)

`wrangler.jsonc`에 `send_email` 바인딩을 추가하세요. `ChatAgent`에서 `onEmail(msg)`를 오버라이드해 `postal-mime`으로 파싱하고, 본문을 `saveMessages`로 합성 사용자 메시지로 주입하세요. Cloudflare 대시보드에서 도메인을 이 워커로 가리키는 Email Routing 규칙을 추가하세요.

### MCP 서버로 노출하기 (강의 #12)

에이전트의 도구를 Claude Code / Claude Desktop / 모든 MCP 호스트에서 사용할 수 있게 노출합니다.

```ts
// worker/mcp-server.ts
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export class MyMcpAgent extends McpAgent {
  server = new McpServer({ name: "my-agent", version: "1.0.0" });
  async init() {
    this.server.tool("ping", "Ping the agent", {}, async () => ({
      content: [{ type: "text", text: "pong" }],
    }));
  }
}
```

`worker/index.ts`에서:

```ts
import { MyMcpAgent } from "./mcp-server";
export { MyMcpAgent };
const mcpHandler = MyMcpAgent.serve("/mcp", { binding: "MyMcpAgent" });

// fetch() 내부:
if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
  return mcpHandler.fetch(request, env, ctx);
}
```

`MyMcpAgent`용 DO 바인딩 + 마이그레이션을 추가하고, `wrangler.jsonc` → `assets.run_worker_first`에 `/mcp`와 `/mcp/*`를 추가하세요.

### Workflows와 Sub-agents (강의 #10, #9)

둘 다 사용 사례에 따라 달라집니다. Workflows는 승인 게이트와 단계별 재시도가 있는 고정 다단계 파이프라인에, Sub-agents는 fan-out 병렬 작업에 사용합니다. 예시는 강의의 해당 섹션을 참고하세요.

---

## 더 알아보기

- [Cloudflare Agents 문서](https://developers.cloudflare.com/agents/)
- [AI Gateway 문서](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [AI SDK 문서](https://ai-sdk.dev/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- **[노마드코더 "모두를 위한 OpenClaw" 강의](https://nomadcoders.co/clawclone)**
