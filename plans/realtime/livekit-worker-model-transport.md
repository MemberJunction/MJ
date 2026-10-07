# LiveKit worker media plane, Phase 2: model transport in the worker

**Status:** deferred design (not started). Phase 1 (LiveKit room I/O in a worker, opt-in via
`MJ_LIVEKIT_WORKER_MEDIA=on`) shipped in PR #5148; see the
[LiveKitNative README](../../packages/AI/RealtimeBridge/Providers/LiveKitNative/README.md).

## Trigger: when to build this

Implement only if Meet telemetry shows **inbound gaps over 30 ms, or main-loop p99 spikes correlated with choppy audio**.
Phase 1 measurements (local SFU, synthetic main-thread load) showed no gaps over 30 ms in either mode, so
the main-thread relay is not currently the bottleneck.

## Goal

The model WebSocket transport (Gemini Live, OpenAI realtime) also runs in the worker. Model-bound and
model-sourced audio (socket, JSON framing, base64 encode/decode) never cross MJAPI's main event loop; only
control-plane messages cross to main: tool calls and results, transcripts, session events, config.

## Existing seams

- OpenAI: `OpenAIRealtime.createConnection()` returning `IOpenAIRealtimeConnection` (`on('event'|'error')`, `off`, `send`, `close`).
- OpenAI GPT-Live: `OpenAILiveRealtime.createSocket()` returning `ILiveWebSocketLike`.
- Gemini: `GeminiRealtime.connectLiveSession()` returning `GeminiLiveSession` (`sendRealtimeInput` plus callbacks).
- base64 lives inside the sessions today (`geminiRealtime.ts`, `openAIRealtime.ts`).

## Design

**Transport vs session halves.**
- Transport half (worker): owns the socket, JSON framing, base64 and heartbeat. Small `IRealtimeTransport`:
  `Send(clientFrame)`, `OnServerFrame`, `OnClose`, `Close`.
- Session half (main): keeps provider session logic (tool-schema scrubbing, transcripts, interruption and turn
  state, `IRealtimeSession`) and talks to a `RemoteRealtimeConnection` that implements the existing connection interfaces.

**Avoiding driver forks.** Add one optional protected `createTransport()` per driver. Default: today's in-process
socket. With a `TransportHost` configured it returns a `RemoteRealtimeConnection`. Session code is unchanged. Extract
per-provider codec functions (`encodeAudio`, `decodeAudio`, framing) shared by both paths. An `AudioPlaneBound`
capability flag on the session marks the audio bypass; sessions without it keep the main-thread path.

**What crosses the boundary.** Control plane as structured-clone JSON. Audio does not: a `bindAudioPlane` message
connects the media worker and the transport worker over a `MessageChannel` (or SharedArrayBuffer ring). Model PCM
goes straight into the media worker's pacer; room PCM goes straight into the transport. With the plane bound,
`SendInput` / `OnOutput` become control stubs.

**Bridge wiring.** `ai-bridge-engine.ts` (`OnMedia` to `SendInput`, `OnOutput` to `SendMedia`, ~L1215-1290) checks
`session.Capabilities.AudioPlaneBound`. If true it obtains a port pair from the LiveKit native client and the
transport and calls `BindAudioPlane`, skipping per-chunk callbacks. `RecoverRealtimeSession` re-binds on recovery.

## Risks

- Two workers need coupled lifecycles (one dying must not strand the other).
- Backpressure and flush semantics across the ring buffer.
- Ordering of control events versus audio (interruption versus the last audio chunk).
- Transcripts and usage derived from audio-frame events.
- The `ws` / SDK dependencies inside a worker (OpenAI SDK WebSocket, `@google/genai`).
- Keeping driver fakes testable.

## Plan (about 3 PRs, roughly 2.5-3.5k lines)

1. Transport protocol, `RemoteRealtimeConnection`, `TransportHost`; pilot on OpenAI GPT-Live.
2. Gemini and OpenAI realtime drivers via `createTransport()`.
3. Bridge `BindAudioPlane` wiring and the audio-plane ring; recovery re-bind.

## Test strategy

- Contract tests: the same driver fakes run in-process and through the remote transport (in-memory `MessageChannel`),
  asserting identical `IRealtimeSession` event sequences.
- Ordering and flush tests for the interruption-versus-audio race.
- Worker crash-recovery test through `RecoverRealtimeSession`.
- Extend `scripts/worker-meet-live-benchmark.mjs` to show main-loop p99 with the model transport in the worker.
