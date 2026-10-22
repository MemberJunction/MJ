# @memberjunction/ai-realtime-client

Framework-agnostic **browser-side** abstraction for provider-direct realtime (voice and video) sessions: the `BaseRealtimeClient` contract plus the provider drivers (`OpenAIRealtimeClient`, `OpenAILiveClient`, `GeminiRealtimeClient`, `GeminiEnterpriseRealtimeClient`, `ElevenLabsRealtimeClient`, `AssemblyAIRealtimeClient`, `xAIRealtimeClient`, `HuggingFaceRealtimeClient`), the shared PCM audio plane (`src/audio/`) the websocket drivers build on, the browser media code in the `/media` entry (capture, video playout, the media stage) and the video conformance kit in the `/testing` entry.

This package is the **client-side mirror** of the server's `BaseRealtimeModel` pattern (`@memberjunction/ai`). In the **client-direct topology**, the MJ server mints a session config (`ClientRealtimeSessionConfig`) through its server driver, and the browser resolves the matching *client* driver through the MemberJunction `ClassFactory` using the config's `Provider` string as the registration key. The browser owns the provider socket (lowest audio latency — frames never transit the MJ server), or, for a provider with no browser-safe credential, a socket to MJAPI's realtime relay. Either way **prompt and tool authority stay server-side**: the client applies the server-built `SessionConfig` verbatim, and a relay session's setup is written by the server.

For the full architecture — topologies, the co-agent model, channels, narration, security, and adding a video-capable provider — see **[guides/REALTIME_CO_AGENTS_GUIDE.md](../../../guides/REALTIME_CO_AGENTS_GUIDE.md)**.

## Installation

```bash
npm install @memberjunction/ai-realtime-client
```

Dependencies are intentionally tiny: `@memberjunction/global` (ClassFactory), `@memberjunction/ai` (the shared `ClientRealtimeSessionConfig` / `RealtimeVideoFrame` / `JSONObject` types), `rxjs`, and `@google/genai` (the Gemini Live SDK). **No Angular, no DOM framework** — the package is plain TypeScript so it can be consumed by any browser host and unit-tested in plain Node. A consumer that imports only `/media` bundles no driver and no `@google/genai`.

## Entry points

| Import | What it has | Boundary |
|---|---|---|
| `@memberjunction/ai-realtime-client` | Everything: `BaseRealtimeClient`, the drivers, the PCM audio plane, and all of `/media` | — |
| `@memberjunction/ai-realtime-client/media` | The browser media code no driver sits behind: camera, microphone and display capture, frame sampling and pacing, the video source arbiter, video playout and its decoders, the playback clock, the media stage and saved layouts, the audio meter | May import only other `/media` modules, `audio/audioMeter`, `@memberjunction/ai`, `@memberjunction/global` and `rxjs`. `media-entry-boundary.test.ts` fails the build otherwise; its allowlist is where a new `/media` dependency is added |
| `@memberjunction/ai-realtime-client/testing` | The video provider conformance kit (`RunRealtimeVideoConformance`, `ListRealtimeVideoConformanceChecks`, the harness types, recorders and fixtures) | No driver, no `@google/genai`, no test framework (`testing-entry-boundary.test.ts`). The main entry does not export it, so apps never bundle it |

The LiveKit room (`@memberjunction/livekit-room-core`) and `@memberjunction/ng-realtime-media` import only `/media`.

## Architecture

```
MJ Server                                  Browser
─────────                                  ───────
BaseRealtimeModel driver                   BaseRealtimeClient driver
  .CreateClientSession()                     .Connect(config, micStream, cameraStream?)
        │                                          ▲
        │  ClientRealtimeSessionConfig             │ ClassFactory.CreateInstance(
        │  { Provider, Model,                      │   BaseRealtimeClient,
        │    EphemeralToken, ExpiresAt,  ────────► │   config.Provider)
        │    Transport?, RelayUrl?,                │   // 'openai' | 'openai-live' | 'gemini' | 'gemini-enterprise'
        │    SessionConfig (opaque),               │   // | 'elevenlabs' | 'assemblyai' | 'xai' | 'huggingface'
        │    AvatarStatus? }                       │
```

**Division of responsibility** (from the `BaseRealtimeClient` doc header):

- **Drivers own ALL provider wire concerns**: transport (WebRTC / WebSocket), event-name translation, the response state machine (a tool-result reply must never collide with an in-flight response), narration-kind tagging, audible-playback tracking, and the agent's video when the model sends one.
- **Hosts own POLICY**: when to narrate, what instructions to speak, transcript persistence, and UI state. The reference host is `RealtimeSessionRuntime` in `@memberjunction/realtime-runtime`; the Angular `RealtimeSessionService` in `@memberjunction/ng-conversations` is a thin adapter over it.

## The contract (`BaseRealtimeClient`)

| Member | Purpose |
|---|---|
| `Connect(config, micStream, cameraStream?)` | Opens the provider connection with the server-minted credential (or, on a relay session, MJAPI's relay URL) and applies `config.SessionConfig` **verbatim** once the control channel is ready. The *caller* acquires the mic (it owns the permission UX); the driver attaches it and stops its tracks on `Disconnect`. A video-capable driver also samples the optional camera into the model. |
| `SendText(text)` | Injects typed text as a USER turn and asks for a reply through the same collision-safe path tool results use. **SendText implies barge-in**: an active spoken response is cancelled via `CancelActiveResponse` before the text is injected, so the typed turn takes the floor immediately. Must NOT synthesize a user-role transcript echo (the host owns the local echo). |
| `CancelActiveResponse()` | Cancels the model's ACTIVE spoken response and flushes pending playback (and the agent's video) so a new user turn can take the floor; no-op when nothing is active. A **floor-control** action only — it must never abort server-side delegated work (hosts do that from `OnInterruption` / their own policy). Leaves `IsBusy` / `IsAudioPlaying` accurate afterward. |
| `SendContextNote(text)` | Injects background context (channel perception deltas, delegated-run progress) **without** forcing a spoken reply. |
| `RequestSpokenUpdate(instructions)` | Asks for ONE brief interim utterance; the resulting turn's transcripts MUST be tagged `Kind: 'narration'` and must never collide with a pending tool-result reply. |
| `SendToolResult(callID, outputJson)` | Feeds an executed tool's result back, ensuring the model speaks it ASAP — immediately when idle, otherwise queued behind the in-flight response so the trigger is never dropped. |
| `SetMuted(muted)` | Toggles mic tracks' `enabled` flag (transport stays up; the provider receives silence). |
| `ReplaceMicrophone?(micStream)` | Rebinds what used the old microphone track after a device switch (obligation #10). |
| `SendVideoFrame?(base64, mime, sourceId?)` | Streams one image frame to a model that takes inbound video. Hosts don't call it directly: `VideoSourceArbiter` does. |
| `AddTrack(descriptor)` / `RemoveTrack(descriptor)` | Adds or removes a track mid-session, negotiated against what the driver supports (a capture adds its inbound video track when it starts). Audio is not removable. |
| `SupportsInboundVideo`, `InboundVideoRate`, `MaxInboundVideoStreams`, `EstablishedTracks`, `IsTrackEstablished(modality, direction)` | What the session negotiated: whether the model takes video, at what rate, how many streams. Anything pacing frames reads the rate from here. |
| `OnRemoteVideo(handler)` | The agent's video, as a `MediaVideoSource`, handed over once per session when the model sends video (a live avatar). One handler, owned by the runtime. |
| `OnRemoteMediaStream(handler)` | The agent's audio as a `MediaStream`, for a host recorder. |
| `Disconnect()` | Tears down everything; emits a final `'closed'` state; safe to call more than once. |
| `IsBusy` | `true` while a model response is in flight (generation). |
| `IsAudioPlaying` | `true` while audio is AUDIBLY playing (in an avatar session, while the avatar speaks). **Distinct from `IsBusy`** — generation runs ahead of playback; hosts must gate narration on BOTH or queued utterances come out stale. |
| `OnTranscript / OnToolCall / OnStateChange / OnError / OnInterruption / OnUsage / OnTrackStateChange` | Single-handler registration (matching the server `IRealtimeSession` style); registering again replaces the handler. `OnInterruption` fires on **true barge-in only** — user input cut off *active* model output (response in flight or audio audibly playing); a normal turn while the model is idle is not an interruption. Hosts use it per their own policy (the production host cancels pending narration; it deliberately does **not** abort delegated work — that's an explicit user action). |
| `OnUsage(handler)` | Token-usage telemetry as **deltas** for the response/turn that just completed (`RealtimeClientUsage` — cumulative-only providers must convert in the driver), with per-modality detail (`InputTokenDetails`, `OutputTokenDetails`) and the seconds of avatar video generated (`OutputTokenDetails.VideoSeconds`). **Optional capability**: providers without usage events never emit (registering is always safe). Emits: OpenAI (`response.done.usage`), Gemini (`usageMetadata`, reported per turn, plus the avatar's video seconds in updates of their own). Never emits: ElevenLabs, AssemblyAI (no wire usage events — ElevenLabs accounts platform-side; AssemblyAI bills flat per session-hour). The production host accumulates deltas and relays them debounced onto the co-agent `AIPromptRun` via the `RelayRealtimeUsage` mutation. |

States (`RealtimeClientState`): `connecting → connected → listening ⇄ speaking → closed | error`. There is deliberately **no `thinking` state** — "the host is executing a tool" is host policy, not wire state.

Transcripts (`RealtimeClientTranscript`): carry `Role`, `Text` (interim events are incremental **deltas**, finals are the complete turn), `IsFinal`, and `Kind: 'normal' | 'narration'` — narration transcripts are ephemeral by product decision (never captions, never persisted).

Errors (`RealtimeClientError`): `Fatal: true` means the session is unusable (transport failure, credential expiry) and is also followed by an `'error'` state; `Fatal: false` is a recoverable provider error frame.

### Sessions through MJAPI's relay

`ClientRealtimeSessionConfig.Transport` says how the browser reaches the provider. Absent or `'direct'`: the driver opens the provider's socket with `EphemeralToken`. `'relay'`: the provider has no browser-safe credential, so the driver connects to MJAPI's relay at `RelayUrl` (`wss://<mjapi>/realtime/relay/<ticket>`) and `EphemeralToken` is empty. MJAPI holds the provider credential and runs the provider's frame policy between the two sockets.

Every driver calls `AssertTransportSupported(config)` first in `Connect` (obligation #11), so a driver that connects only to its provider refuses a relay session with a clear error. A driver that speaks its provider's protocol through the relay opts in by overriding `SupportsRelayTransport`; today only `GeminiEnterpriseRealtimeClient` does. The relay URL carries the session's ticket, so it is a credential: never log it or put it in an error.

## Drivers

### `OpenAIRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'openai')`

- **Transport**: WebRTC — mic tracks onto a peer connection, remote audio into a hidden `<audio>` sink, the `'oai-events'` data channel for control frames, and the GA SDP handshake. `SessionConfig` is applied via `session.update` when the data channel opens; `'listening'` is reported only after that (obligation #7).
- **Event translation**: GA *and* beta transcript event names, input-transcription completion, `response.function_call_arguments.done` tool calls, `input_audio_buffer.speech_started` barge-in, `output_audio_buffer.*` playback events, provider error frames.
- **Response state machine**: `responseActive` set on `response.created`, cleared on `response.done`; tool-result `response.create` triggers are queued while a response is in flight and flushed on `response.done` so the model **always** voices delegated results (obligation #5).
- **Narration tagging**: `RequestSpokenUpdate` marks the next response so its transcripts emit with `Kind: 'narration'`.
- **Playback tracking**: `IsAudioPlaying` from the WebRTC `output_audio_buffer` started/stopped events.
- **Video**: none in either direction.

### `OpenAILiveClient` — `@RegisterClass(BaseRealtimeClient, 'openai-live')`, also `'OpenAILiveRealtime'`

- **Model**: `gpt-live-1` (OpenAI Live API).
- **Transport**: WebRTC via `/v1/realtime/calls` data channel.
- **Wire protocol specifics**:
  - **Tool Outputs**: Emits `response.item.create` (item type: `function_call_output`) followed by `response.create` per batch (coordinated via `RealtimeToolBatchBarrier`). `conversation.item.create` is not supported by OpenAI Live and is explicitly rejected.
  - **Floor Control**: No wire `response.cancel` event exists in OpenAI Live WebRTC; `CancelActiveResponse()` performs local audio playback draining and state reset.
  - **Tool Call Deduplication**: Tool calls arriving via `output_item.done` or `response.function_call_arguments.done` are deduplicated by `CallID` via an `emittedToolCallIds` Set. The deduplication Set deliberately survives local cancellations so late-arriving frames within an in-flight turn cannot double-emit an already-handled tool call.
  - **Context & Commentary**: `SendContextNote` appends to model thinking via `session.thinking.append` (with `delegation_id: null`). Spoken interim updates use `session.commentary.append`.
  - **Outbound Queuing**: Frames sent while the WebRTC data channel is connecting are buffered in a bounded FIFO queue (`MAX_OUTBOUND_QUEUE_SIZE = 100`, drop-oldest with warnings).
- **Video**: none in either direction.

### `GeminiRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'gemini')`

- **Transport**: WebSocket via the `@google/genai` Live SDK, authenticated with the server-minted ephemeral token (a `v1alpha` client).
- **Audio**: client → model is 16-bit PCM @ 16 kHz mono via the shared `CreatePcmMicCapture` worklet pipeline; model → client is PCM @ 24 kHz, scheduled gaplessly by `GeminiPcmPlayback` (a thin specialization of the shared `RealtimePcmPlayback`), which also backs `IsAudioPlaying` and flushes on barge-in (obligation #3).
- The server-built `SessionConfig` carries `{ model, config }` (system instruction, tools, transcription, modalities) and the model's facts on its endpoint; the client applies the config at `live.connect`.
- **Inbound video**: `maxInboundVideoStreams` and `maxInboundVideoRate` come from the minted `SessionConfig` (the model profile: Gemini 3.8 Live and Extended Thinking take one stream at 1 frame per second; a model without video input takes none). `negotiateTracks` keys requested tracks by direction + modality + `SourceID` and marks streams beyond the model's maximum `'unsupported'` with the reason. Frames reach the model only through the session's `VideoSourceArbiter`; a camera passed to `Connect` becomes its `'camera'` source.
- **Resumption**: when Google announces the connection is ending (`goAway`; on Vertex AI it came about 9 minutes into a connection, with 30 s left) or the socket drops, the session moves to a new connection with Google's resumption handle (`ResumptionHandle`). The avatar's player, its element and the last frame shown carry over.
- **Agent video (a live avatar)**: when the minted config grants an avatar (its `avatar` block: `output`, `encoding`, `audioMuxed`) and the host shows it (the outbound video track is live), the client creates a player through the `CreateVideoPlayout(options)` seam and hands its `Source` to the host at connect. Model parts are routed by type: a `video/*` part, or one whose bytes open with an MP4 box (`ftyp`, `moov`, `moof`, `styp`) whatever type it names, goes to the player as a `RealtimeVideoFrame`; PCM goes to the voice; anything else is dropped and reported once. The session's first init segment decides whether the MP4 carries the voice; when it does, PCM never plays the voice twice (the turn's first video part flushes the PCM the turn queued, and later PCM in the turn is dropped), and the player's audio is routed into the PCM playback's graph so the meter and the recording carry it. `generationComplete` ends the turn's video (`turnComplete` as the fallback); `interrupted` flushes it and drops the turn's late parts until its `turnComplete`. The seconds of video generated are reported per turn in `OnUsage` updates of their own (`OutputTokenDetails.VideoSeconds`). A host that shows no agent video, or a browser that can't play the avatar's type, gets an audio-only session and one log line (reason `host` or `browser`).

### `GeminiEnterpriseRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'gemini-enterprise')`

Gemini Live on **Gemini Enterprise** (Vertex AI), minted by the server driver `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`. Gemini Enterprise has no browser credential, so its sessions are relay sessions only (`Transport: 'relay'`): the client runs the web SDK in Vertex mode with the relay URL as its base URL, and MJAPI holds the Google credential, writes the setup and filters what the browser sends. The client states its response modalities on every connect (VIDEO while the avatar shows), because the relay reads an AUDIO-only setup as a request to drop the avatar. Everything else is `GeminiRealtimeClient`'s, avatar playout and resumption (through the same relay URL) included. Call `LoadGeminiEnterpriseRealtimeClient()` from a static code path.

### `ElevenLabsRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'elevenlabs')`

- **Transport**: raw WebSocket against the server-minted **signed URL** — the `EphemeralToken` *is* the `wss://…&token=…` URL (no API key in the browser). Handshake: open → send `conversation_initiation_client_data` carrying the server-authored prompt override (from the `SessionConfig` pact `{ agentId, overrides, config }`) → wait for `conversation_initiation_metadata` → negotiate PCM rates from the metadata's audio-format tags → build the audio plane → `'listening'` (obligation #7). Non-PCM telephony formats (`ulaw_8000`) degrade loudly to the 16 kHz default with a warning.
- **Audio**: the shared PCM plane (`CreatePcmMicCapture` up as bare-key `user_audio_chunk` frames, `RealtimePcmPlayback` down from `audio` events) at the **negotiated** rates; `IsAudioPlaying` from the playout clock.
- **Capability deltas**: transcripts are **finals-only** (no interim deltas; `agent_response_correction` re-finalizes a barged-in turn with what was actually spoken — treat it as the authoritative replacement); `SendContextNote` is **native** (`contextual_update`, sent even mid-response); `RequestSpokenUpdate` is **emulated** as a `user_message` (queued behind in-flight responses; narration kind stamped at send time — there is no `response.created`-style frame to stamp on); there is **no cancel frame** — `CancelActiveResponse` flushes the locally-owned playout (residual server generation is simply never played); **no usage events**; `SendToolResult` is exactly-once (duplicate call ids dropped with a warning).
- **Busy mapping**: set on the first `audio` / `agent_response` of a turn, cleared on `agent_response_complete` / `interruption` / `client_tool_call` (obligation #2 — no envelope frames exist; state is inferred frame-by-frame).

### `AssemblyAIRealtimeClient` — `@RegisterClass(BaseRealtimeClient, 'assemblyai')`

- **Transport**: raw WebSocket to `wss://agents.assemblyai.com/v1/ws?token=…` with the server-minted **one-time** temp token. Handshake: open → send the server-authored `session.update` (the whole session object: prompt, tools, voice, turn detection — from the `SessionConfig` pact `{ session, config }`) as the **first** frame → wait for `session.ready` → audio plane → `'listening'` (obligation #7; audio sent earlier would be dropped).
- **Audio**: the shared PCM plane at the provider's **fixed 24 kHz** format both directions (`input.audio` up, `reply.audio` down).
- **Capability deltas**: user transcripts stream as deltas + final, agent transcripts are **final-only** (a barged-in final carries the truncated text — no correction event); `RequestSpokenUpdate` is **native** (`reply.create` per-response instructions, queued behind in-flight replies); `SendText` is **emulated** via `reply.create` (the protocol has no typed-user-input event — best-effort fidelity); `SendContextNote` is emulated via the **mutable `system_prompt`** ("Background updates" section re-sent through `session.update` — a config write that never disturbs generation); **no cancel frame** — `CancelActiveResponse` flushes local playout *and suppresses* residual `reply.audio` of the cancelled reply until the next boundary; **no usage events** (flat session-hour billing).
- **Barge-in**: `input.speech.started` while output is active is the snappy flush point (~300 ms faster than waiting per the provider's guidance); `reply.done` `status: 'interrupted'` is the authoritative verdict / fallback flush. A speech start while idle is a normal turn, NOT an interruption.
- **Teardown**: `Disconnect()` sends `session.end` before closing — skipping it leaves a billable 30-second resume hold.

`xAIRealtimeClient` (`'xai'`) and `HuggingFaceRealtimeClient` (`'huggingface'`) are thin subclasses of the OpenAI-protocol websocket layer; see [the OpenAI-protocol client family](#openai-protocol-client-family-architecture) below. No driver but the two Gemini clients hands over agent video; `realtime-video-driver-audit.test.ts` keeps that true for every registered driver.

### Shared audio plane (`src/audio/`)

The websocket drivers (Gemini, ElevenLabs, AssemblyAI, and the OpenAI-protocol websocket family — everyone whose audio rides the socket rather than WebRTC) share one browser audio pipeline instead of reimplementing it per provider:

- **`CreatePcmMicCapture(micStream, sampleRate, onPcmChunk)`** (`micCapture.ts`) — `AudioWorklet`-based mic capture resampled to the requested rate, delivering base64 PCM16 chunks; the worklet is loaded from a Blob URL so the package ships no asset files. Its `Rebind` follows a replaced microphone track.
- **`RealtimePcmPlayback`** (`pcmPlayback.ts`) — gapless playhead-clock scheduling of inbound PCM16, backing `IsAudioPlaying` precisely ("scheduled audio extends beyond the context's current time") with an instant `Flush()` for barge-in / cancel. `Enqueue(pcm16, mediaTimeMs?)` takes the chunk's place on the stream's media timeline, and the playback is also an `IPlaybackClock` (`CurrentTimeMs`: the media time of the audio heard now, less the output latency the browser reports), which a video player can follow for lip sync. `CreateMeter()` taps its output for the call's visuals, `GetOutputStream()` hands it to a recorder, and `ConnectMediaElement(element)` plays a media element's audio through the same graph (an avatar's voice is in its video).
- **`pcmUtils.ts`** — base64 ↔ `ArrayBuffer` and PCM conversion helpers.

Drivers expose these through overridable `protected` creation seams (`createMicCapture` / `createPlayback`), so tests run with no audio hardware.

## Media (`/media`)

The browser media code the realtime call, the LiveKit meeting room and any other host share. None of it starts a device on its own or talks to a vendor.

### Capture

- **`LocalMediaController`** (implements `ILocalMediaController`, which another platform or a test can supply): the user's camera and microphone. `State$` / `State` report each kind's status, device and failure; `RefreshDevices()` lists devices and the controller follows `devicechange`. `Start(kind, deviceId?)` opens a kind (always resolves; a failure is a result that keeps the browser's error name); `SwitchDevice(kind, deviceId)` moves a live kind to another device inside the same `MediaStream`, releasing the old device first (mobile browsers open one camera at a time) and reopening it if the new one fails; a lost device falls back to the default. It never starts on its own, and captures at the device's native rate. A consumer bound to a track rather than the stream (a Web Audio node, a WebRTC sender) rebinds when `State$` reports a new device.
- **`RequestDisplayCapture(options)`**: asks the browser to share a screen, a window, a tab or one panel of the page, from a user gesture. It resolves `started` (a `DisplayCapture` with its `Stream`, `Track`, actual `Surface`, `Label`, `OnEnded` and `Stop`), `cancelled`, or `failed` (`unsupported`, `panel-unsupported`, `panel-wrong-surface`, `denied`, `error`); it never rejects. The picker hints (`PreferredSurface` and the `selfBrowserSurface` / `surfaceSwitching` / `preferCurrentTab` family) are read only by Chromium browsers. **A panel capture** (`Panel`, with an optional `PanelLabel` the capture carries for the UI and the agent) shares one element: the user picks this tab and the stream is narrowed with Element Capture (Chromium 132+, the element alone) or else Region Capture (Chromium 104+, the element's rectangle). Element Capture needs the element to be its own stacking context, so it gets `isolation: isolate` while shared. Sharing anything other than this tab stops the capture. `GetDisplayCaptureSupport()` says what the browser can do (desktop Firefox and Safari can share, but not a single panel; no mobile browser can share); `CapturedSurfaceOf(track)` reads what a track shares.
- **`FrameSampler`**: takes still frames from any `MediaStream` at the rate the caller passes (the negotiated `InboundVideoRate`) as base64 JPEG or PNG, with an optional `MaxDimension`. It has no ceiling of its own, so a self-view runs at the camera's native rate while the model gets only the frames it takes.
- **`MediaPreview`**: a lobby's camera and microphone before joining (a self-view stream, a microphone level, the devices, the user's choices), released before the call or meeting opens its own. The realtime call checks the camera inside the call instead (`RealtimeCaptures` in `@memberjunction/realtime-runtime`).
- Deprecated wrappers kept for existing callers: `CreateCameraCapture`, `CreateScreenCapture` and `CreateStreamFrameCapture` (`frameCapture.ts`), now thin wrappers over the modules above.

### Showing video

- **`MediaVideoSource`** is what every renderer shows: `{ Kind: 'stream', Stream }` (a camera, a shared screen, a WebRTC track) or `{ Kind: 'element', Attach(element) }` (a player that must own the `<video>` element, such as `VideoPlayout`).
- **`AttachVideoSource(source, element)`** puts either into a `<video>` and returns a detach function. Streams play muted (a video surface never plays audio; each voice plays once, elsewhere); an element source decides its own audio. Detaching never stops the source's tracks. UI code uses it instead of a vendor's `track.attach`.
- The UI model types live here too: `MediaParticipant` (identity, role, speaking, videos by kind, `PreferredVideo`, `IsMuted`, `ConnectionQuality`, `GetAudioLevel`, `AgentCanSee`), `MediaDevice`, `MediaDeviceSelection` (including the `speaker` kind), `MediaAgentState`, `MediaConnectionStatus`, `MediaDisconnectReason`, `MediaConnectionQuality`.

### Playing the agent's video: `VideoPlayout`

`VideoPlayout` plays a model's video into one `<video>` element at a time, whatever form it arrives in. A driver creates one when the agent's video is granted and shown, and hands its `Source` to the host once.

- `Append(frame)` takes each `RealtimeVideoFrame` (`@memberjunction/ai`), in order: a piece of fragmented MP4, an encoded chunk or an image.
- `EndOfTurn()` lets the turn play to its end and hold the last frame; `Flush()` (barge-in) drops everything not yet shown and holds the last frame; between turns, and while a session resumes on a new connection, the element keeps showing the last frame. Across a resume the player keeps its element and decoder, and the next connection's init segment and fragments continue in the same buffer.
- `IsPlaying` is true while it plays with media ahead of the playhead (an avatar audibly speaking). `CarriesVoice` unmutes the element for an MP4 that carries the voice; `VideoPlayoutOptions.OnElementAttached` lets a driver route the element's audio into its own Web Audio graph.
- `OnProblem(handler)` reports each kind once: `unsupported`, `no-decoder`, `fragment-before-init`, `append-failed`, `pending-overflow`. `VideoPlayout.IsSupported(mimeType)` says at once whether some decoder plays a type in this browser.

**Decoders.** The player keeps one decoder at a time, chosen per frame type from `VideoFrameDecoderRegistry`:

| Decoder | Plays | How |
|---|---|---|
| `'mse-fmp4'` | `video/mp4` fragmented MP4 (a Gemini avatar) | Media Source Extensions, or `ManagedMediaSource` on iOS Safari 17.1+ |
| `'webcodecs'` | `video/h264` (Annex B, codec string in the `codecs` parameter), `video/vp8`, `video/vp9`, `video/av1` chunks | A WebCodecs `VideoDecoder`, drawn into a `MediaStream` the element shows |
| `'image'` | `image/jpeg`, `image/png`, `image/webp` | `createImageBitmap`, drawn the same way |

A decoder that gives up (`Failed`) is not chosen again for that type, and the next that can play it takes over. An app adds a decoder with `VideoFrameDecoderRegistry.Instance.Register({ Name, Kind, Priority, CanPlay, Create })` (the same name replaces a built-in); `CanPlay` must answer at once, and `Create` returns an `IVideoFrameDecoder` that plays into the host's element.

**The playback clock.** Pass the voice's playback as `VideoPlayoutOptions.Clock` (an `IPlaybackClock`; `RealtimePcmPlayback` is one) when the driver times its PCM and its frames on one media timeline. The chunk and image decoders then show each frame when the voice reaches its `PresentationTimeMs`: a frame more than 500 ms behind the voice is dropped, one ahead waits, one more than 2 s ahead is dropped, and a new stream waits for its own voice. Before the clock has read anything (at the start, or after a barge-in) frames wait up to 500 ms, then go by their own times; when the voice ends before the video, frames carry on by their own times. MSE ignores the clock: an MP4 that carries the voice keeps face and voice together itself.

### Which source the model sees: `VideoSourceArbiter`

Several things can offer the model pictures at once (a whiteboard, a remote browser, a component, a camera, a shared screen); a model accepts a bounded number of inbound video streams (`MaxInboundVideoStreams`, 1 for Gemini Live today). `VideoSourceArbiter` is the **single writer** of inbound video per connection (`VideoSourceArbiter.ForSink(client)`), so there is exactly one place that decides what the model sees:

* sources `RegisterSource({ SourceID, Label, Kind, ChannelKey, Enabled })` and push frames with `PushFrame(sourceId, base64, mime)`; the arbiter forwards up to the model's stream count (N-stream models pass every enabled source through) and **paces** to the negotiated rate with jitter headroom (`MinVideoFrameSpacingMs`). A source registered with `Enabled: false` starts off, and the model is not told about it.
* with more enabled sources than streams it picks by a **policy that is data** (`DEFAULT_VIDEO_SOURCE_POLICY`: the user's pick, the most recently started capture, the focused surface, the newest), and tells the model in the second person on every switch (`[You can now see: <label>]`), when a source is turned off (`[You can no longer see: <label> (the user turned it off)]`) and when it is turned back on. The wording can be replaced through the arbiter's options.
* `SelectSource`, `SetFocusedSource` / `SetFocusedChannel`, `SetSourceEnabled(id, enabled, notify)`, `GetSources()`, `OnChange()` back the "agent can see" control.
* it talks to a narrow `IVideoFrameSink` (stream count, rate, `SendVideoFrame(data, mime, sourceId?)`, `SendContextNote`), so a driver other than Gemini adopts it by implementing four members.

`ChannelInboundVideoBridge` registers a channel as a source and polls its frames at the negotiated rate; its `Rate` option is deprecated. The pacing math (`NominalVideoFrameIntervalMs`, `MinVideoFrameSpacingMs`) wraps `@memberjunction/ai`'s, which the meeting bot uses too.

### Layout: the media stage

`LayoutMediaStage(input)` is a headless layout model: participants, placeable surfaces (`MediaSurface`: a channel's surface or a participant's video, with its `DefaultPlacement` and `AllowedPlacements`) and the user's moves go in; one stage, picture-in-picture tiles (newest first), tabs, hidden surfaces, the other participants and a screen-share split come out. The rules:

- a surface goes where the user last moved it, if that placement is allowed, else to its default;
- **one stage**: the latest move to the stage wins it, and a surface it displaces goes to its default, or to picture-in-picture when its default is also the stage;
- with no surface on the stage, the spotlight participant holds it: a pin, the active speaker, a speaking participant, the agent, the first other participant, the user; a participant already shown through a surface (the avatar, the user's camera) is not repeated, and one in a picture-in-picture box doesn't take the spotlight;
- the stage goes to the newest move there, so withdrawing that move hands the stage to an earlier one; a host whose "unpin" should return the stage to its default drops the stage moves first (`WithoutStageMoves`).

A host that lets the user move participants' tiles passes each as a surface (`ParticipantTileSurface`, `ParticipantTileKey`, `StageParticipantIdentity`), as the meeting room does; the realtime call passes its channel surfaces. `PlacementOffStage(surface)` says where a surface goes when it leaves the stage.

**Saved layouts.** `mediaLayout.ts` keeps a host's layout in a per-user settings store (`MediaLayoutSettings`: `GetSetting` / `SetSettingDebounced`, which `UserInfoEngine` fits): the moves in order (`RecordPlacementMove`, `ParsePlacementMoves` / `SerializePlacementMoves`), the picture-in-picture boxes as fractions of the stage (`MediaPipRect`, `RecordPipRect`, `ParsePipRects` / `SerializePipRects`) and, optionally, whether the user hid their self-view (`ParseSelfViewHidden` / `SerializeSelfViewHidden`; only a saved `true` hides it). `MediaLayoutPrefs` reads and writes all three under the host's `MediaLayoutKeys` (`Moves`, `PipRects`, optional `SelfViewHidden`), keeps the newest 50 moves and boxes, and treats a store that isn't ready as nothing saved. The realtime call saves under `mj.realtime.placement.v1` and `mj.realtime.pip.v1`, the meeting room under its own `mj.livekit.*` keys.

### Audio meter

`RealtimeAudioMeter` taps a `MediaStream` (`ForStream`, `ForMicStream`) or a node in an existing graph (`ForContextNode`) and reports a level and 9 frequency bins; it returns `null` where Web Audio is missing. The smoothing every meter display shares is pure: `GateAudioLevel`, `SmoothAudioLevel`, `SmoothAudioBars`, `SynthesizeAudioBars`, and `AudioLevelSmoother`, which puts them together for one source; each display passes its own attack and decay.

## Testing kit (`/testing`)

`@memberjunction/ai-realtime-client/testing` is the video provider conformance kit: a provider's test runs it against the provider's real client driver, with a fake transport, to prove the driver follows the realtime video rules (obligation #12). `RunRealtimeVideoConformance(driverFactory)` resolves to one result per check (VC01-VC15, VF01-VF02), and `ListRealtimeVideoConformanceChecks(driverFactory)` gives any test runner one test per check:

```ts
import { ListRealtimeVideoConformanceChecks } from '@memberjunction/ai-realtime-client/testing';

for (const check of ListRealtimeVideoConformanceChecks(() => new MyProviderHarness())) {
    (check.SkipReason ? it.skip : it)(`${check.Id} ${check.Title}`, () => check.Run());
}
```

The provider writes the harness (`IRealtimeVideoConformanceHarness`): what its server mints, its client driver with its creation seams wired to the kit's recorders (`RecordingVideoPlayout`, `RecordingPcmPlayback`), and the model's side of the wire, sending video as `RealtimeVideoFrame`s of the provider's kind. The harness contract, the traits and the check table are in the [Co-Agents guide §12](../../../guides/REALTIME_CO_AGENTS_GUIDE.md#12-adding-a-video-capable-realtime-provider). `src/__tests__/video-conformance/` runs the kit against Gemini (Developer API and Gemini Enterprise), OpenAI and a synthetic raw-frame provider; the synthetic one is the worked example.

## Driver-author obligations

`BaseRealtimeClient`'s doc header carries the authoritative client-side **"DRIVER AUTHOR OBLIGATIONS"** block (12 numbered rules, paid for in live debugging — rules 1-8 mirror the server-side block on `BaseRealtimeModel` in `@memberjunction/ai`). The ones drivers trip over most: leave `'speaking'` *silently* (no state emission) when a tool call is emitted so the host's busy indicator isn't clobbered; release the busy flag at tool-call emission (deadlock guard); flush playback and report `IsAudioPlaying === false` promptly on barge-in *and* on `CancelActiveResponse`; never echo a user transcript for injected text; never drop a tool-result generation trigger (queue behind the in-flight response); surface credential expiry as a `Fatal` error; report `'listening'` only after the session config is applied; treat `SessionConfig` as a private pact between same-keyed driver halves. `RequestSpokenUpdate` has an explicit collision rule: when a response is already in flight the driver must queue or *skip* the update (skipping is fine — narration is disposable by contract); host-side `IsBusy`/`IsAudioPlaying` gating is for timing quality, the driver is the safety net.

The client block adds four:

9. **Audio metering is a capability**: wire the meters for the audio planes the driver owns, and release them on disconnect.
10. **Follow a replaced microphone track** (`ReplaceMicrophone`): `replaceTrack` on WebRTC senders, `IPcmMicCapture.Rebind` on PCM capture, a new input meter; mute follows the track's `enabled`.
11. **Refuse a transport you don't speak**: `AssertTransportSupported` first in `Connect`; opt in to relay sessions with `SupportsRelayTransport`.
12. **The agent's video keeps the voice's rules**: hand it over once, only while the outbound video track is live; give the player each frame as the model sent it; barge-in flushes it with the voice and the cut turn's late media never plays; a turn's end lets it play out; a video that carries the voice never plays it twice; each generated second is reported once; a resumed session keeps its video; `Disconnect` releases it; a driver whose voice and video share a media timeline gives the player its voice playback as the clock. The `/testing` kit checks each rule.

## Usage

```typescript
import { MJGlobal } from '@memberjunction/global';
import {
    BaseRealtimeClient,
    LoadOpenAIRealtimeClient, LoadOpenAILiveClient, LoadGeminiRealtimeClient,
    LoadGeminiEnterpriseRealtimeClient, LoadElevenLabsRealtimeClient, LoadAssemblyAIRealtimeClient
} from '@memberjunction/ai-realtime-client';

// Tree-shaking prevention — drivers are resolved dynamically, so a static call path
// must keep their @RegisterClass side effects alive:
LoadOpenAIRealtimeClient();
LoadOpenAILiveClient();
LoadGeminiRealtimeClient();
LoadGeminiEnterpriseRealtimeClient();
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
client.OnRemoteVideo(video => showAgentVideo(video)); // a MediaVideoSource; render it with AttachVideoSource
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

The production host is `RealtimeSessionRuntime` (`@memberjunction/realtime-runtime`), adapted for Angular by `RealtimeSessionService` (`packages/Angular/Generic/conversations`) — read it for the full policy layer (caption/transcript routing, prefix-routed client tools, narration pacing, channel plugins, captures, the agent's video).

## Testing seams

Every driver is written against **structural transport seams** so the full event flow is unit-testable with zero network, zero WebRTC, and zero audio or video hardware (see `src/__tests__/`):

- **OpenAI**: `IRealtimePeerConnection`, `IRealtimeDataChannel`, `IRealtimeAudioSink` — created through overridable `protected` factory methods (`createPeerConnection`, `createAudioSink`, …); tests subclass the driver and inject fakes, then drive provider-shaped JSON frames through the data channel.
- **Gemini**: `GeminiLiveClientSession` (typed subset of the SDK `Session`), `IGeminiMicCapture`, `IGeminiAudioPlayback`, `IAvatarVideoPlayout` — the `connectLiveSession` / capture / playback / `CreateVideoPlayout` boundaries are the only things tests replace. The Gemini Enterprise tests run the real web SDK over a fake relay socket.
- **ElevenLabs / AssemblyAI**: `IElevenLabsClientSocket` / `IAssemblyAIClientSocket` (assignable-handler websocket seams behind `createSocket`) plus the shared `createMicCapture` / `createPlayback` seams — tests drive provider-shaped frames straight through the socket fake.
- Shared fakes live in `src/__tests__/helpers/` (`realtime-fakes.ts`, and fakes for media devices, display capture, Media Source, WebCodecs and Web Audio); fMP4 fixtures are in `src/__tests__/fixtures/`.

If you write a new driver, follow the same shape: every wire/hardware boundary behind a `protected` overridable seam, asserted with scripted provider frames. A driver that plays the agent's video creates its player through such a seam, so the conformance kit can record it.

## Related

- [`guides/REALTIME_CO_AGENTS_GUIDE.md`](../../../guides/REALTIME_CO_AGENTS_GUIDE.md) — the flagship feature guide, including §12 on video-capable providers
- `@memberjunction/ai` — `BaseRealtimeModel`, `IRealtimeSession`, `ClientRealtimeSessionConfig`, `RealtimeVideoFrame`, the fMP4 reader, `RealtimeToolDefinition`
- `@memberjunction/ai-agents` — `RealtimeSessionRunner`, `RealtimeToolBroker`, `RealtimeClientSessionService`
- `@memberjunction/realtime-runtime` — `RealtimeSessionRuntime`, the host-side session (channels, captures, the agent's video)
- `@memberjunction/ng-realtime-media` — the Angular media widgets that render `/media` models
- `@memberjunction/ng-conversations` — the Angular host (overlay, channels, session review)
- `@memberjunction/ng-whiteboard` — the generic whiteboard the Whiteboard channel surfaces

## OpenAI-protocol client family architecture

The OpenAI-protocol drivers share two stacked layers in `generic/openAIProtocolClient.ts`:

- **`OpenAIProtocolRealtimeClient`** — the transport-agnostic protocol brain: inbound event dispatch (GA + beta frame names), the response state machine, narration-kind tagging, tool-result queueing, and the outbound actions (`SendText`, `SendToolResult`, `SendContextNote`, `RequestSpokenUpdate`, `CancelActiveResponse`, `SetMuted`).
- **`OpenAIProtocolWebSocketRealtimeClient`** — the websocket + client-owned PCM transport: socket lifecycle with a **connect-phase deadline** (`connectTimeoutMs`, default 15s, covering open AND the optional `session.created` wait — socket death, consumer `Disconnect`, and the deadline all reject the awaited `Connect`), the shared mic-capture/playout plumbing, and open-gated sends.

`OpenAIRealtimeClient` (WebRTC) extends the brain directly; `xAIRealtimeClient` and `HuggingFaceRealtimeClient` are thin subclasses of the websocket layer.

**Turn-discipline guarantees** (all drivers): a cancelled turn's trailing `response.done` cannot release the busy lock out from under a locally-initiated replacement response (stale-done protection); a TRUE user barge-in drops the queued tool-result auto-trigger — the result item is already in the conversation and the user's next turn voices it, so the model never speaks over a user who just took the floor.
