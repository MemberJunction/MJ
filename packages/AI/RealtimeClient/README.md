# @memberjunction/ai-realtime-client

Framework-agnostic **browser-side** abstraction for provider-direct realtime (voice) sessions: the `BaseRealtimeClient` contract plus the four shipped provider drivers (`OpenAIRealtimeClient`, `GeminiRealtimeClient`, `ElevenLabsRealtimeClient`, `AssemblyAIRealtimeClient`) and the shared PCM audio plane (`src/audio/`) the websocket drivers build on.

This package is the **client-side mirror** of the server's `BaseRealtimeModel` pattern (`@memberjunction/ai`). In the **client-direct topology**, the MJ server mints an ephemeral credential + provider-native session config (`ClientRealtimeSessionConfig`) through its server driver, and the browser resolves the matching *client* driver through the MemberJunction `ClassFactory` using the config's `Provider` string as the registration key. The browser owns the provider socket (lowest audio latency — frames never transit the MJ server), while **prompt and tool authority stay server-side**: the client applies the server-built `SessionConfig` verbatim.

For the full architecture — topologies, the co-agent model, channels, narration, security — see **[guides/REALTIME_CO_AGENTS_GUIDE.md](../../../guides/REALTIME_CO_AGENTS_GUIDE.md)**.

## Installation

```bash
npm install @memberjunction/ai-realtime-client
```

Dependencies are intentionally tiny: `@memberjunction/global` (ClassFactory), `@memberjunction/ai` (the shared `ClientRealtimeSessionConfig` / `JSONObject` types), and `@google/genai` (the Gemini Live SDK). **No Angular, no DOM framework** — the package is plain TypeScript so it can be consumed by any browser host and unit-tested in plain Node.

## Architecture

```
MJ Server                                  Browser
─────────                                  ───────
BaseRealtimeModel driver                   BaseRealtimeClient driver
  .CreateClientSession()                     .Connect(config, micStream)
        │                                          ▲
        │  ClientRealtimeSessionConfig             │ ClassFactory.CreateInstance(
        │  { Provider, Model,                      │   BaseRealtimeClient,
        │    EphemeralToken, ExpiresAt,  ────────► │   config.Provider)
        │    SessionConfig (opaque) }              │   // 'openai' | 'gemini' | 'elevenlabs' | 'assemblyai'
```

**Division of responsibility** (from the `BaseRealtimeClient` doc header):

- **Drivers own ALL provider wire concerns**: transport (WebRTC / WebSocket), event-name translation, the response state machine (a tool-result reply must never collide with an in-flight response), narration-kind tagging, and audible-playback tracking.
- **Hosts own POLICY**: when to narrate, what instructions to speak, transcript persistence, and UI state. The reference host is `VoiceSessionService` in `@memberjunction/ng-conversations`.

## The contract (`BaseRealtimeClient`)

| Member | Purpose |
|---|---|
| `Connect(config, micStream)` | Opens the provider connection with the server-minted ephemeral credential and applies `config.SessionConfig` **verbatim** once the control channel is ready. The *caller* acquires the mic (it owns the permission UX); the driver attaches it and stops its tracks on `Disconnect`. |
| `SendText(text)` | Injects typed text as a USER turn and asks for a reply through the same collision-safe path tool results use. **SendText implies barge-in**: an active spoken response is cancelled via `CancelActiveResponse` before the text is injected, so the typed turn takes the floor immediately. Must NOT synthesize a user-role transcript echo (the host owns the local echo). |
| `CancelActiveResponse()` | Cancels the model's ACTIVE spoken response and flushes pending playback so a new user turn can take the floor; no-op when nothing is active. A **floor-control** action only — it must never abort server-side delegated work (hosts do that from `OnInterruption` / their own policy). Leaves `IsBusy` / `IsAudioPlaying` honest afterward. |
| `SendContextNote(text)` | Injects background context (channel perception deltas, delegated-run progress) **without** forcing a spoken reply. |
| `RequestSpokenUpdate(instructions)` | Asks for ONE brief interim utterance; the resulting turn's transcripts MUST be tagged `Kind: 'narration'` and must never collide with a pending tool-result reply. |
| `SendToolResult(callID, outputJson)` | Feeds an executed tool's result back, ensuring the model speaks it ASAP — immediately when idle, otherwise queued behind the in-flight response so the trigger is never dropped. |
| `SetMuted(muted)` | Toggles mic tracks' `enabled` flag (transport stays up; the provider receives silence). |
| `Disconnect()` | Tears down everything; emits a final `'closed'` state; safe to call more than once. |
| `IsBusy` | `true` while a model response is in flight (generation). |
| `IsAudioPlaying` | `true` while audio is AUDIBLY playing. **Distinct from `IsBusy`** — generation runs ahead of playback; hosts must gate narration on BOTH or queued utterances come out stale. |
| `OnTranscript / OnToolCall / OnStateChange / OnError / OnInterruption / OnUsage` | Single-handler registration (matching the server `IRealtimeSession` style); registering again replaces the handler. `OnInterruption` fires on **true barge-in only** — user input cut off *active* model output (response in flight or audio audibly playing); a normal turn while the model is idle is not an interruption. Hosts use it per their own policy (the production host cancels pending narration; it deliberately does **not** abort delegated work — that's an explicit user action). |
| `OnUsage(handler)` | Token-usage telemetry as **deltas** for the response/turn that just completed (`RealtimeClientUsage` — cumulative-only providers must convert in the driver). **Optional capability**: providers without usage events simply never emit (registering is always safe). Emits: OpenAI (`response.done.usage`), Gemini (`usageMetadata`). Never emits: ElevenLabs, AssemblyAI (no wire usage events — ElevenLabs accounts platform-side; AssemblyAI bills flat per session-hour). The production host accumulates deltas and relays them debounced onto the co-agent `AIPromptRun` via the `RelayRealtimeUsage` mutation. |

States (`RealtimeClientState`): `connecting → connected → listening ⇄ speaking → closed | error`. There is deliberately **no `thinking` state** — "the host is executing a tool" is host policy, not wire state.

Transcripts (`RealtimeClientTranscript`) carry `Role`, `Text` (interim events are incremental **deltas**, finals are the complete turn), `IsFinal`, and `Kind: 'normal' | 'narration'` — narration transcripts are ephemeral by product decision (never captions, never persisted).

Errors (`RealtimeClientError`): `Fatal: true` means the session is unusable (transport failure, credential expiry) and is also followed by an `'error'` state; `Fatal: false` is a recoverable provider error frame.

## Drivers

### `OpenAIRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'openai')`

- **Transport**: WebRTC — mic tracks onto a peer connection, remote audio into a hidden `<audio>` sink, the `'oai-events'` data channel for control frames, and the GA SDP handshake. `SessionConfig` is applied via `session.update` when the data channel opens; `'listening'` is reported only after that (obligation #7).
- **Event translation**: GA *and* beta transcript event names, input-transcription completion, `response.function_call_arguments.done` tool calls, `input_audio_buffer.speech_started` barge-in, `output_audio_buffer.*` playback events, provider error frames.
- **Response state machine**: `responseActive` set on `response.created`, cleared on `response.done`; tool-result `response.create` triggers are queued while a response is in flight and flushed on `response.done` so the model **always** voices delegated results (obligation #5).
- **Narration tagging**: `RequestSpokenUpdate` marks the next response so its transcripts emit with `Kind: 'narration'`.
- **Playback tracking**: `IsAudioPlaying` from the WebRTC `output_audio_buffer` started/stopped events.

### `GeminiRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'gemini')`

- **Transport**: WebSocket via the `@google/genai` Live SDK, authenticated with the server-minted ephemeral token (a `v1alpha` client).
- **Audio**: client → model is 16-bit PCM @ 16 kHz mono via the shared `createPcmMicCapture` worklet pipeline; model → client is PCM @ 24 kHz, scheduled gaplessly by `GeminiPcmPlayback` (a thin specialization of the shared `RealtimePcmPlayback`), which also backs `IsAudioPlaying` and flushes on barge-in (obligation #3).
- The server-built `SessionConfig` carries `{ model, config }` (system instruction, tools, transcription, modalities); the client applies it at `live.connect`.

### `ElevenLabsRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'elevenlabs')`

- **Transport**: raw WebSocket against the server-minted **signed URL** — the `EphemeralToken` *is* the `wss://…&token=…` URL (no API key in the browser). Handshake: open → send `conversation_initiation_client_data` carrying the server-authored prompt override (from the `SessionConfig` pact `{ agentId, overrides, config }`) → wait for `conversation_initiation_metadata` → negotiate PCM rates from the metadata's audio-format tags → build the audio plane → `'listening'` (obligation #7). Non-PCM telephony formats (`ulaw_8000`) degrade loudly to the 16 kHz default with a warning.
- **Audio**: the shared PCM plane (`createPcmMicCapture` up as bare-key `user_audio_chunk` frames, `RealtimePcmPlayback` down from `audio` events) at the **negotiated** rates; `IsAudioPlaying` from the playout clock.
- **Capability deltas**: transcripts are **finals-only** (no interim deltas; `agent_response_correction` re-finalizes a barged-in turn with what was actually spoken — treat it as the authoritative replacement); `SendContextNote` is **native** (`contextual_update`, sent even mid-response); `RequestSpokenUpdate` is **emulated** as a `user_message` (queued behind in-flight responses; narration kind stamped at send time — there is no `response.created`-style frame to stamp on); there is **no cancel frame** — `CancelActiveResponse` flushes the locally-owned playout (residual server generation is simply never played); **no usage events**; `SendToolResult` is exactly-once (duplicate call ids dropped with a warning).
- **Busy mapping**: set on the first `audio` / `agent_response` of a turn, cleared on `agent_response_complete` / `interruption` / `client_tool_call` (obligation #2 — no envelope frames exist; state is inferred frame-by-frame).

### `AssemblyAIRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'assemblyai')`

- **Transport**: raw WebSocket to `wss://agents.assemblyai.com/v1/ws?token=…` with the server-minted **one-time** temp token. Handshake: open → send the server-authored `session.update` (the whole session object: prompt, tools, voice, turn detection — from the `SessionConfig` pact `{ session, config }`) as the **first** frame → wait for `session.ready` → audio plane → `'listening'` (obligation #7; audio sent earlier would be dropped).
- **Audio**: the shared PCM plane at the provider's **fixed 24 kHz** format both directions (`input.audio` up, `reply.audio` down).
- **Capability deltas**: user transcripts stream as deltas + final, agent transcripts are **final-only** (a barged-in final carries the truncated text — no correction event); `RequestSpokenUpdate` is **native** (`reply.create` per-response instructions, queued behind in-flight replies); `SendText` is **emulated** via `reply.create` (the protocol has no typed-user-input event — best-effort fidelity); `SendContextNote` is emulated via the **mutable `system_prompt`** ("Background updates" section re-sent through `session.update` — a config write that never disturbs generation); **no cancel frame** — `CancelActiveResponse` flushes local playout *and suppresses* residual `reply.audio` of the cancelled reply until the next boundary; **no usage events** (flat session-hour billing).
- **Barge-in**: `input.speech.started` while output is active is the snappy flush point (~300 ms faster than waiting per the provider's guidance); `reply.done` `status: 'interrupted'` is the authoritative verdict / fallback flush. A speech start while idle is a normal turn, NOT an interruption.
- **Teardown**: `Disconnect()` sends `session.end` before closing — skipping it leaves a billable 30-second resume hold.

### Shared audio plane (`src/audio/`)

The three websocket drivers (Gemini, ElevenLabs, AssemblyAI — everyone whose audio rides the socket rather than WebRTC) share one browser audio pipeline instead of reimplementing it per provider:

- **`createPcmMicCapture(micStream, sampleRate, onPcmChunk)`** (`micCapture.ts`) — `AudioWorklet`-based mic capture resampled to the requested rate, delivering base64 PCM16 chunks; the worklet is loaded from a Blob URL so the package ships no asset files.
- **`RealtimePcmPlayback`** (`pcmPlayback.ts`) — gapless playhead-clock scheduling of inbound PCM16, backing `IsAudioPlaying` precisely ("scheduled audio extends beyond the context's current time") with an instant `Flush()` for barge-in / cancel.
- **`pcmUtils.ts`** — base64 ↔ `ArrayBuffer` and PCM conversion helpers.

Drivers expose these through overridable `protected` creation seams (`createMicCapture` / `createPlayback`), so tests run with no audio hardware.

## Driver-author obligations

`BaseRealtimeClient`'s doc header carries the authoritative client-side **"DRIVER AUTHOR OBLIGATIONS"** block (8 numbered rules, paid for in live debugging — the mirror of the server-side block on `BaseRealtimeModel` in `@memberjunction/ai`). The ones drivers trip over most: leave `'speaking'` *silently* (no state emission) when a tool call is emitted so the host's busy indicator isn't clobbered; release the busy flag at tool-call emission (deadlock guard); flush playback and report `IsAudioPlaying === false` promptly on barge-in *and* on `CancelActiveResponse`; never echo a user transcript for injected text; never drop a tool-result generation trigger (queue behind the in-flight response); surface credential expiry as a `Fatal` error; report `'listening'` only after the session config is applied; treat `SessionConfig` as a private pact between same-keyed driver halves. `RequestSpokenUpdate` has an explicit collision rule: when a response is already in flight the driver must queue or *skip* the update (skipping is fine — narration is disposable by contract); host-side `IsBusy`/`IsAudioPlaying` gating is for timing quality, the driver is the safety net.

## Usage

```typescript
import { MJGlobal } from '@memberjunction/global';
import {
    BaseRealtimeClient,
    LoadOpenAIRealtimeClient, LoadGeminiRealtimeClient,
    LoadElevenLabsRealtimeClient, LoadAssemblyAIRealtimeClient
} from '@memberjunction/ai-realtime-client';

// Tree-shaking prevention — drivers are resolved dynamically, so a static call path
// must keep their @RegisterClass side effects alive:
LoadOpenAIRealtimeClient();
LoadGeminiRealtimeClient();
LoadElevenLabsRealtimeClient();
LoadAssemblyAIRealtimeClient();

// 1. The server minted a ClientRealtimeSessionConfig (e.g. via the
//    StartRealtimeClientSession mutation). Resolve the matching driver:
const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(
    BaseRealtimeClient, startResult.Provider)!;

// 2. Wire policy handlers, then connect with the caller-acquired mic:
client.OnStateChange(state => updateUI(state));
client.OnTranscript(t => { if (t.IsFinal && t.Kind === 'normal') persistTurn(t); });
client.OnToolCall(async call => {
    const resultJson = await executeTool(call.ToolName, call.ArgumentsJson);
    client.SendToolResult(call.CallID, resultJson);
});
client.OnError(e => { if (e.Fatal) endSession(); });

const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
await client.Connect(startResult.clientConfig, mic);

// 3. Later:
client.SendContextNote('[whiteboard] user added a sticky note: "Q3 goals"');
if (!client.IsBusy && !client.IsAudioPlaying) {
    client.RequestSpokenUpdate('In one short first-person sentence, say the lookup is still running.');
}
await client.Disconnect();
```

The production host is `VoiceSessionService` (`packages/Angular/Generic/conversations`) — read it for the full policy layer (caption/transcript routing, prefix-routed client tools, narration pacing, channel plugins).

## Testing seams

All four drivers are written against **structural transport seams** so the full event flow is unit-testable with zero network, zero WebRTC, and zero audio hardware (see `src/__tests__/`, ~4,200 lines of vitest coverage):

- **OpenAI**: `IRealtimePeerConnection`, `IRealtimeDataChannel`, `IRealtimeAudioSink` — created through overridable `protected` factory methods (`createPeerConnection`, `createAudioSink`, …); tests subclass the driver and inject fakes, then drive provider-shaped JSON frames through the data channel.
- **Gemini**: `GeminiLiveClientSession` (typed subset of the SDK `Session`), `IGeminiMicCapture`, `IGeminiAudioPlayback` — the `connectLiveSession` / capture / playback boundaries are the only things tests replace.
- **ElevenLabs / AssemblyAI**: `IElevenLabsClientSocket` / `IAssemblyAIClientSocket` (assignable-handler websocket seams behind `createSocket`) plus the shared `createMicCapture` / `createPlayback` seams — tests drive provider-shaped frames straight through the socket fake.
- Shared fakes live in `src/__tests__/helpers/realtime-fakes.ts`.

If you write a new driver, follow the same shape: every wire/hardware boundary behind a `protected` overridable seam, asserted with scripted provider frames.

## Related

- [`guides/REALTIME_CO_AGENTS_GUIDE.md`](../../../guides/REALTIME_CO_AGENTS_GUIDE.md) — the flagship feature guide
- `@memberjunction/ai` — `BaseRealtimeModel`, `IRealtimeSession`, `ClientRealtimeSessionConfig`, `RealtimeToolDefinition`
- `@memberjunction/ai-agents` — `RealtimeSessionRunner`, `RealtimeToolBroker`, `RealtimeClientSessionService`
- `@memberjunction/ng-conversations` — the Angular host (overlay, channels, session review)
- `@memberjunction/ng-whiteboard` — the generic whiteboard the Whiteboard channel surfaces
