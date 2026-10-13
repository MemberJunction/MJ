---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
---

refactor(ai-realtime): thread HasToolFraming boolean, document SendText barrier commentary queueing, and document tool batch dedupe lifetime rule

- Added `HasToolFraming?: boolean` to `RealtimeSessionParams` in `@memberjunction/ai` (Core), replacing prompt substring sniffing with an explicit caller-asserted parameter while retaining substring sniffing as a fallback.
- Set `HasToolFraming: true` in `RealtimeClientSessionService.buildSessionParams` for companion co-agent sessions.
- Added comprehensive unit tests in `@memberjunction/ai-openai` verifying that `HasToolFraming` explicitly controls standalone delegation policy compilation.
- Documented in `OpenAILiveClient.SendText` that user typed input is appended to commentary rather than dropped when the tool barrier is active, draining with the tool batch's `response.create`.
- Documented the shared lifetime rule for `emittedToolCallIds` and `toolBatchBarrier` across declaration and clear sites.
- Added `"engines": { "node": ">=24" }` to root `package.json` and `packages/AI/RealtimeClient/package.json`.
- Recorded Item 43 design note for `RequiresConsent` in `plans/realtime/gemini-3-8-live.md`.
