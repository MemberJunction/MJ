# MJ#5483 Real user-turn start for final-only realtime drivers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recorded user turn on a final-only driver relays its real speech start (from the provider VAD) or `null`, never a placeholder `0`.

**Architecture:** Layer 1 removes the `?? 0` fallback in `RealtimeSessionRuntime.relayTranscript`. Layer 2 adds a `OnUserSpeechStart` / `emitUserSpeechStart` handler slot to `BaseRealtimeClient`, raised on every OpenAI-protocol `input_audio_buffer.speech_started` frame, and the runtime subscribes it to `markTurnAudioStart('normal')`.

**Tech Stack:** TypeScript, vitest.

**Spec:** the brief on MJ#5483 (design decided there).

## Global Constraints

- No change to `RealtimeClientSessionResolver`, `base-agent.ts`, ElevenLabs, the recording-start seed `0`, or `markTurnAudioStart`'s guards.
- No per-role start slot for barge-in.
- `grep -n "?? 0" packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts` shows no hit on the `utteranceStartMs` line.

## Review Focus

- HuggingFace and xAI go through `OpenAIProtocolWebSocketRealtimeClient.onSpeechStartedFrame`, which overrides the protocol base WITHOUT calling super; xAI overrides it again without super. Raising the event inside the base `onSpeechStartedFrame` only (as the brief words it) would miss HuggingFace. Raise it once in the frame dispatcher (`case 'input_audio_buffer.speech_started'`), immediately before `this.onSpeechStartedFrame()`, so no override can drop it. Tests for OpenAI, HuggingFace and xAI pin this.
- Event with no handler registered must be a no-op (optional-call like `emitInterruption`).
- Event before recording/session clock is live: `markTurnAudioStart` already returns when `nowTurnOffsetMs()` is `null` — covered by existing code, no new test.
- Narration must not be stamped by the event: the subscription passes `'normal'` explicitly; the user-speech onset is never narration.
- First turn of a recording still relays start `0` from the seed (existing recording tests cover it; must stay green).

---

### Task 1: Client event + OpenAI-protocol raise

**Files:**
- Modify: `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts` (handler field near `interruptionHandler`, `OnUserSpeechStart` after `OnInterruption`, `emitUserSpeechStart` after `emitInterruption`)
- Modify: `packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts` (`case 'input_audio_buffer.speech_started'`)
- Test: `openai-realtime-client.test.ts`, `huggingface-realtime-client.test.ts`, `xai-realtime-client.test.ts` in `packages/AI/RealtimeClient/src/__tests__/`

**Interfaces — Produces:** `public OnUserSpeechStart(handler: () => void): void`; `protected emitUserSpeechStart(): void`. Doc: "the provider's voice-activity detection saw the user start to speak; fires once per detected onset, may fire again inside one turn after a pause; carries no text".

- [ ] Step 1: per driver test file, add `it('invokes the OnUserSpeechStart handler on input_audio_buffer.speech_started')`: register a counter with `client.OnUserSpeechStart`, emit the frame, expect count `1`; emit again, expect `2`. In the OpenAI file also assert it fires while a response is in flight (barge-in) and the handler runs before the `'listening'` state change.
- [ ] Step 2: run `npx vitest run` on those three files — FAIL (`OnUserSpeechStart is not a function`).
- [ ] Step 3: implement both methods and the one-line raise in the dispatcher.
- [ ] Step 4: re-run — PASS; run the whole package `pnpm test`.
- [ ] Step 5: commit.

### Task 2: Runtime — null start + subscription

**Files:**
- Modify: `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts` (`relayTranscript`, `wireClientHandlers`, doc comments on `currentTurnStartMs`, `markTurnAudioStart`, `relayTranscript`)
- Test: `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts` (committed repro)

**Interfaces — Consumes:** `client.OnUserSpeechStart` from Task 1 (runtime resolves `@memberjunction/ai-realtime-client` from its `dist`, so rebuild RealtimeClient first: `npm run build` in that package).

- [ ] Step 1: repro already red (3 failures).
- [ ] Step 2: `utteranceStartMs = ... ? this.currentTurnStartMs : null` (drop `?? 0` and its comment); subscribe `client.OnUserSpeechStart(() => this.markTurnAudioStart('normal'))` in `wireClientHandlers`; rewrite the three doc comments so none says the relay falls back to a seeded/prior start or `?? 0`.
- [ ] Step 3: repro file PASS; `pnpm test` in the package PASS; build PASS.
- [ ] Step 4: commit.

### Task 3: Verify

- [ ] Both packages: `pnpm test`, build, lint (eslint on changed files).
- [ ] `pnpm run test:integration` (deterministic tier) from repo root.
- [ ] grep check from Global Constraints.
- [ ] Slot smoke: a recorded GPT Realtime session needs a live mic + provider key; run if the slot can, else record why not.
