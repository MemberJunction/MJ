---
"@memberjunction/ai": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-agents": patch
"@memberjunction/remote-browser-server": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/server": patch
---

feat(ai): Gemini 3.8 Live multimodal realtime streaming, video tracks, asynchronous reasoning, and per-model legality

This release adds comprehensive support for Google's Gemini 3.8 Live multimodal realtime models (`gemini-3.8-live` and `gemini-3.8-live-extended-thinking`), including a first-class media plane for video/audio tracks, non-blocking tool execution, thought summaries, session continuity, and complete catalog metadata.

In `@memberjunction/server`, the default configuration for `realtime.enabled` is flipped from `false` to `true`, enabling the `/realtime/sdp-exchange` WebRTC broker endpoint on all MemberJunction API servers by default (configurable via `MJ_REALTIME_ENABLED`).

### Phase Summary:
- **Phase A (Contracts & Media Plane)**: Introduced directional media tracks (`RealtimeTrackDescriptor`, `RealtimeTrackDirection`), open modality vocabulary via `RealtimeModalityRegistry`, track negotiation in `BaseRealtimeClient`, and channel track sourcing/sinking (`GetSourcedTracks`/`GetSunkTracks`).
- **Phase B (Audio Retrofit & SDK Convergence)**: Upgraded and converged `@google/genai` to `^2.8.0` across dependents.
- **Phase C (Gemini Live Config Legality)**: Added per-model legality enforcement in `GeminiRealtime`: stripped `enable_affective_dialog`, preserved `proactive_audio: true` while rejecting `false`, enforced `thinkingConfig` rules (omitted on 3.8-live, validated levels low/medium/high and rejected `minimal` on Extended Thinking), explicit turn coverage, local refusal of `BLOCKING` tools on Extended Thinking, default `NON_BLOCKING` state on all declarations, and config bag sanitization.
- **Phase D (Async Tool Execution & Idle Contract)**: Implemented per-model idle detection honoring `IdleSignal` (`generationComplete` for 3.8-live, `interactionStatus` for Extended Thinking); decoupled tool call arrival from response activity so generation is not falsely interrupted; drained `queuedSends` only on true idle or turn complete; integrated `RealtimeToolBatchBarrier` for parallel/out-of-order tool calls; and added function scheduling resolution (`__mj_scheduling` / `scheduling` with `INTERRUPT`/`INTERRUPTED` support).
- **Phase E (Extended Thinking & Narration)**: Routed model thought parts (`IsThought: true`) to `ThoughtNarration$` and created immutable narration delegation cards (`Kind: 'narration'`), keeping scratch thoughts distinct from spoken responses and user-cancelable actions.
- **Phase F (Video Tracks & Session Continuity)**: Implemented video frame capture (`getDisplayMedia`/`getUserMedia` in `src/media/frameCapture.ts`), throttled inbound video frame transmission via `ChannelInboundVideoBridge` (whiteboard and remote browser channels), and resilient session continuity across the vendor session cap via `sessionResumptionUpdate` / `goAway`.
- **Phase G (Metadata & Release)**: Added declarative catalog metadata and multi-channel pricing for `Gemini 3.8 Live` and `Gemini 3.8 Live Extended Thinking` in `metadata/ai-models/.ai-models.json`.

### Reviewer Punch List Resolutions:
- **Items 16–18 (Scheduling)**: Supported `__mj_scheduling` alongside `scheduling`, sanitized payload keys, accepted both `INTERRUPT` and `INTERRUPTED`, and added diagnostic warnings on unknown values.
- **Item 19 (Non-blocking getter)**: Extracted and centralized `isNonBlocking` getter on `GeminiRealtimeClient`.
- **Item 20 (Generation Complete)**: Ensured `handleGenerationComplete` updates `responseActive` without prematurely draining queued sends.
- **Items 21–23 (Thought Narration)**: Cleanly separated thought summaries from spoken narrations and the ephemeral live note across `RealtimeSessionService` and `RealtimeSessionState`.
- **Item 24 (Activity Rail)**: Restricted open-run button rendering to agent runs (`card.Kind === 'agent' && !!card.RunID`).
- **Items 25–27 (Video Bridge & Throttle)**: Separated `sendFrameDirect`, resolved throttle contention between bridge and driver with jitter headroom, added graceful headless DOM detection, and guarded against unimplemented `SendVideoFrame`.
- **Item 28 (File organization)**: Moved `frameCapture.ts` from `audio/` to `media/` with clean import paths.
- **C5a–C5c (Config Sanitization & Tool Behavior)**: Stated explicit tool behavior on all declarations, warned on unknown values, and added `tooling`, `toolBehavior`, and `functionCallingBehavior` to `REALTIME_SHARED_CONFIG_KEYS`.

