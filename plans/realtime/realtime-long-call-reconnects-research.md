# Realtime Long-Call Reconnects — Codebase Trace, Provider Research & Claim Ledger (Issue #6460)

_Date researched and fact-checked: 2026-11-07_
_Target branch: `next` (`e055b9230c`)_
_Issue: [MemberJunction/MJ#6460](https://github.com/MemberJunction/MJ/issues/6460) (supersedes narrow scope of [#6403](https://github.com/MemberJunction/MJ/issues/6403), open PR [#6458](https://github.com/MemberJunction/MJ/pull/6458), and closed reference PR [#6453](https://github.com/MemberJunction/MJ/pull/6453))_

---

## 1. Executive Summary of Verified Findings

1. **Metadata Column Naming vs. Senior Engineer's Requirement:**
   - The senior engineer specified that call duration in seconds should come from a `Configuration` JSON bag element on the model, overridable at the model-vendor level, and overridable at runtime via a readonly getter returning `number | undefined`.
   - In MemberJunction's schema and generated entities (`packages/MJCoreEntities/src/generated/entities/__mj.ts`), the JSON configuration column on `MJ: AI Model Types`, `MJ: AI Models`, and `MJ: AI Model Vendors` is named **`ModelConfiguration`** (typed via `IAIConfiguration.ts` / `AIModelConfiguration` with a `Realtime?: RealtimeConfigurationSettings | null` section), whereas `Configuration` is the column on `MJ: AI Vendors` (`AIVendorConfiguration.ModelDefaults`) and `MJ: AI Agents`.
   - `AIEngineBase.GetEffectiveModelConfiguration(modelID, vendorModelVendorID)` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:2063-2079`) and `ResolveEffectiveModelConfiguration` (`packages/AI/Core/src/generic/modelConfiguration.ts:575-586`) already implement the exact 4-layer deep merge:
     `AIModelType.ModelConfiguration < AIModel.ModelConfiguration < AIVendor.Configuration.ModelDefaults < AIModelVendor.ModelConfiguration`.

2. **Two Distinct Provider Time Ceilings Exist in Practice:**
   - Across the target providers (`Gemini`, `xAI`, `OpenAI`, `ElevenLabs`), there is a structural distinction between:
     - **Single-connection / socket lifetime** (`ConnectionMaxSeconds` — e.g., Gemini Live WebSocket closes at ~600 s; Gemini audio+video without compression closes at 120 s), and
     - **Token / session ceiling** (`ProviderMaxSessionSeconds` / `SessionMaxSeconds` — e.g., Gemini ephemeral token max `expireTime` is 1,800 s; xAI `client_secrets` max `expires_after.seconds` is 3,600 s while xAI WebSocket session ceiling is 7,200 s; OpenAI Realtime session max is 3,600 s while `client_secrets` `expires_after.seconds` defaults to 600 s and caps at 7,200 s).

3. **Live Probe Discovery on Native Resumption vs. History Seeding:**
   - **Gemini Developer API (`GeminiRealtime` / `GeminiRealtimeClient`):**
     - **Server-side direct API key (`v1beta` `BidiGenerateContent`):** Live Probe 3C confirmed that reconnecting with `sessionResumption: { handle }` on a direct API key restores full conversation memory (`recalledCobalt: true` in `4,118 ms`).
     - **Client-direct ephemeral token (`v1alpha` `BidiGenerateContentConstrained`):** Live Probes 3A and 3D confirmed that reconnecting with `sessionResumption: { handle }`—both when reusing the **same** multi-use ephemeral token (`uses: 4`) and when minting a **new** ephemeral token—connects cleanly (`setupComplete` in `234–324 ms`) **but restores an empty session** (`recalledAurora: false`, `recalledFalcon: false`). Seeding history via `sendClientContent({ turns, turnComplete: false })` on the new ephemeral token restores full context (`recalledAurora: true` in `1,462 ms`, Live Probe 3B).
   - **xAI (`xAIRealtime` / `xAIRealtimeClient`):**
     - Contrary to the assumption in Issue #6460's background table that xAI has no native resumption, xAI's official Speech-to-Speech documentation (`https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech.md#session-resumption`, read `2026-11-07`) documents native **Session Resumption** via `session.update` `{ resumption: { enabled: true } }` and reconnecting to `wss://api.x.ai/v1/realtime?model=...&conversation_id=<id>`.
     - Live Probe 1B verified that xAI native resumption works across **two separately minted ephemeral tokens** (`recalledPineapple: true` in `949 ms` with zero client-side history injection). Live Probe 1C verified that `conversation.item.create` history seeding also works (`recalledPineapple: true` in `903 ms`).
     - Live Probe 1A also uncovered a bug risk in `xAIRealtime`: `xAIRealtime.DriverFacts.ProviderMaxSessionSeconds` is `7200` (`packages/AI/Providers/xAI/src/models/xaiRealtime.ts:180`), but `POST https://api.x.ai/v1/realtime/client_secrets` rejects `expires_after.seconds: 7200` with HTTP 400 (`{"error":"TTL for a client secret cannot exceed 60 minutes"}`) and accepts `3600` (HTTP 200).
   - **OpenAI Realtime (`OpenAIRealtime` / `OpenAIRealtimeClient`):**
     - Has no native cross-connection session resumption handle on `/v1/realtime`. Live Probe 2 verified that minting a fresh `client_secret` (`208 ms`) and seeding prior turns via `conversation.item.create` (`467 ms` to `session.created`, `1,051 ms` total) preserves full context (`recalledGlacier: true`).

---

## 2. Codebase Trace (`file:line` References)

### 2.1 Base Classes & Shared Core (`packages/AI/Core/` & `packages/AI/RealtimeClient/`)

- **`BaseRealtimeModel`** (`packages/AI/Core/src/generic/baseRealtime.ts:176-310`):
  - `RealtimeDriverFacts` (`:149-158`): `{ ProviderMaxSessionSeconds?: number; SupportedTurnSettings?: RealtimeTurnSettingFidelity }`.
  - `ClampSessionSecondsValue(...caps)` (`:167-174`): filters positive integers (`Number.isInteger(c) && c > 0`) and returns `Math.min(...usable)` or `undefined`.
  - `public static readonly DriverFacts: Readonly<RealtimeDriverFacts> = Object.freeze({})` (`:183`).
  - `protected ClampSessionSeconds(...caps: Array<number | null | undefined>): number | undefined` (`:190-192`).
  - `public abstract StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession>` (`:207`).
  - `public get SupportsClientDirect(): boolean` (`:228-230`): defaults to `false`.
  - `public async CreateClientSession(_params: ClientRealtimeSessionParams): Promise<ClientRealtimeSessionConfig>` (`:251-253`): throws by default unless overridden.
  - `ClientRealtimeSessionConfig` (`:421-486`): `{ Provider, Model, EphemeralToken, ExpiresAt, Transport?: 'direct' | 'relay', RelayUrl?, SessionConfig?, AvatarStatus?, MaxSessionSeconds? }`.
  - **Missing today:** No instance readonly getter for call/connection duration; no timer or buffer before expiry; no abstract reconnect method on `BaseRealtimeModel` or `IRealtimeSession`.

- **`BaseRealtimeClient`** (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:296-937`):
  - `REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE = 'time-limit'` (`:177`).
  - Abstract methods today: `Connect` (`:339`), `Disconnect` (`:345`), `SendText` (`:348`), `CancelActiveResponse` (`:358`), `SendContextNote` (`:372`), `RequestSpokenUpdate` (`:387`), `SendToolResult` (`:419`), `SetMuted` (`:422`), `IsBusy` (`:435`), `IsAudioPlaying` (`:443`).
  - Concrete state held on `BaseRealtimeClient` that survives transport swaps: event handlers (`transcriptHandler`, `toolCallHandler`, `stateChangeHandler`, `errorHandler`, `interruptionHandler`, `userSpeechStartHandler`, `usageHandler`, `remoteVideoHandler`, `trackHandler` at `:298-306`), `tracks: RealtimeTrack[]` (`:310`), `inputAudioMeter` / `outputAudioMeter` (`:484-486`), `remoteMediaStream` / `remoteMediaStreamHandlers` (`:575-577`).
  - **Missing today:** No instance readonly getter for call/connection duration; no framework reconnect timer; no token-refresh callback seam; no abstract reconnect method; no shared `RealtimeConversationMemory` instance.

- **`RealtimeSessionResumption`** (`packages/AI/Core/src/generic/realtimeSessionResumption.ts:114-356`):
  - Constants: `REALTIME_RESUMPTION_RETRY_DELAYS_MS = [0, 1000, 3000]` (`:56`), `REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS = 15000` (`:59`), `REALTIME_RESUMPTION_DEADLINE_MARGIN_MS = 10000` (`:65`), `REALTIME_RESUMPTION_MIN_DEADLINE_MARGIN_MS = 1500` (`:71`).
  - Today only instantiated by `GeminiRealtimeSession` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts:1484-1499`) and `GeminiRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts:1297-1309`).
  - Requires `_handle !== null` (`realtimeSessionResumption.ts:152-164, 213-221`) before `ConnectionLost()` or `ConnectionEnding()` will trigger a reconnect.

- **`OpenAIProtocolRealtimeClient` & `OpenAIProtocolWebSocketRealtimeClient`** (`packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts`):
  - `OpenAIProtocolRealtimeClient` (`:216-885`): shared protocol brain for `OpenAIRealtimeClient`, `xAIRealtimeClient`, `ElevenRealtimeClient`, and `HuggingFaceRealtimeClient`.
  - `OpenAIProtocolWebSocketRealtimeClient` (`:927-1270`): shared WebSocket + 24 kHz PCM capture/playback base class for `xAIRealtimeClient`, `ElevenRealtimeClient`, and `HuggingFaceRealtimeClient`. Holds `socket` (`:929`), `playback` (`:931`), `micCapture` (`:933`), `sessionObject` (`:935`).

### 2.2 Metadata & Model Configuration Cascade

- **Generated Entities (`packages/MJCoreEntities/src/generated/entities/__mj.ts`):**
  - `MJAIModelTypeEntity` (`:59127-59303`): `ModelConfiguration: string | null` (`:59264`), `ModelConfigurationObject: MJAIModelTypeEntity_IAIModelConfiguration | null` (`:59279`).
  - `MJAIModelEntity` (`:60747-61134`): `ModelConfiguration: string | null` (`:61020`), `ModelConfigurationObject: MJAIModelEntity_IAIModelConfiguration | null` (`:61035`).
  - `MJAIModelVendorEntity` (`:59841-60217`): `ModelConfiguration: string | null` (`:60161`), `ModelConfigurationObject: MJAIModelVendorEntity_IAIModelVendorConfiguration | null` (`:60176`).
  - `MJAIVendorEntity` (`:68664-68792`): `Configuration: string | null` (`:68762`), `ConfigurationObject: MJAIVendorEntity_IAIVendorConfiguration | null` (`:68777`).

- **Lockstep Configuration Interfaces:**
  - `metadata/entities/JSONType-interfaces/IAIConfiguration.ts:330-372` (`RealtimeConfigurationSettings`) and `packages/AI/Core/src/generic/modelConfiguration.ts:219-276` (`RealtimeConfigurationSettings`) are enforced to stay in lockstep by `packages/AI/Core/src/__tests__/modelConfiguration.test.ts:532-635`.
  - `AIEngineBase.GetEffectiveModelConfiguration(modelID: string, vendorModelVendorID?: string)` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:2063-2079`, forwarded at `packages/AI/Engine/src/AIEngine.ts:355-362`) merges:
    1. `ParseModelConfiguration(modelType?.ModelConfiguration)` (`BaseAIEngine.ts:2074`)
    2. `ParseModelConfiguration(model.ModelConfiguration)` (`BaseAIEngine.ts:2075`)
    3. `ParseVendorConfiguration(vendor?.Configuration)?.ModelDefaults` (`BaseAIEngine.ts:2076`)
    4. `ParseModelConfiguration(modelVendor?.ModelConfiguration)` (`BaseAIEngine.ts:2077`)
  - `GetModelCatalogSessionSettings(config)` (`packages/AI/Agents/src/realtime/realtime-coagent-config.ts:474-489`) is called by `RealtimeClientSessionService.buildSessionConfigBag` (`packages/AI/Agents/src/realtime/realtime-client-session-service.ts:3089`) and `BaseAgent.buildRealtimeSessionParams` (`packages/AI/Agents/src/base-agent.ts:4037`).

### 2.3 Per-Driver Codebase Trace (All 10 Driver Pairs)

| Provider | Server Driver (`file:line`) | Client Driver (`file:line`) | `DriverFacts.ProviderMaxSessionSeconds` | Scope in #6460 (per User Direction) |
|---|---|---|---|---|
| **Gemini (Developer API)** | `GeminiRealtime` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts:233-239`) | `GeminiRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts:270-271`) | `1800` (`geminiRealtime.ts:237`) | **Primary focus** |
| **Gemini Enterprise / Vertex** | `GeminiEnterpriseRealtime` (`packages/AI/Providers/Vertex/src/models/geminiEnterpriseRealtime.ts:168-175`) | `GeminiEnterpriseRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/geminiEnterpriseRealtimeClient.ts:31-32`) | `1800` (`geminiEnterpriseRealtime.ts:172`) | **Primary focus** |
| **xAI (Grok Voice)** | `xAIRealtime` (`packages/AI/Providers/xAI/src/models/xaiRealtime.ts:176-183`) | `xAIRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/xaiRealtimeClient.ts:73-74`) | `7200` (`xaiRealtime.ts:180`) | **Primary focus** |
| **OpenAI (GA Realtime)** | `OpenAIRealtime` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:792-798`) | `OpenAIRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/openAIRealtimeClient.ts:69-70`) | `3600` (`openAIRealtime.ts:796`) | **Primary focus** |
| **OpenAI Live (`gpt-live-1`)** | `OpenAILiveRealtime` (`packages/AI/Providers/OpenAI/src/models/openAILiveRealtime.ts:951-954`) | `OpenAILiveClient` (`packages/AI/RealtimeClient/src/drivers/openAILiveClient.ts:43-45`) | `undefined` (`openAILiveRealtime.ts:954`) | **Secondary OpenAI driver** |
| **ElevenLabs Agents** | `ElevenLabsRealtime` (`packages/AI/Providers/ElevenLabs/src/elevenLabsRealtime.ts:456-462`) | `ElevenLabsRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/elevenLabsRealtimeClient.ts:124-125`) | `7200` (`elevenLabsRealtime.ts:460`) | **Lower likelihood (supported in base contract)** |
| **Eleven Realtime (OpenAI-compat)** | `ElevenRealtime` (`packages/AI/Providers/ElevenLabs/src/elevenRealtime.ts:171-178`) | `ElevenRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/elevenRealtimeClient.ts:70-71`) | `undefined` (`elevenRealtime.ts:174`) | **Lower likelihood (inherits OpenAI WS protocol)** |
| **AssemblyAI Voice Agent** | `AssemblyAIRealtime` (`packages/AI/Providers/AssemblyAI/src/assemblyAIRealtime.ts:223-226`) | `AssemblyAIRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/assemblyAIRealtimeClient.ts:152-153`) | `undefined` (`assemblyAIRealtime.ts:226`) | **Out of scope (compile-safe stub only)** |
| **HuggingFace Speech-to-Speech** | `HuggingFaceRealtime` (`packages/AI/Providers/HuggingFace/src/huggingFaceRealtime.ts:124-127`) | `HuggingFaceRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/huggingFaceRealtimeClient.ts:48-49`) | `undefined` (`huggingFaceRealtime.ts:127`) | **Out of scope (compile-safe stub only)** |
| **Inworld Realtime** | `InworldRealtime` (`packages/AI/Providers/Inworld/src/inworldRealtime.ts:244-247`) | *(Server-only)* | `undefined` (`inworldRealtime.ts:247`) | **Out of scope (compile-safe stub only)** |

### 2.4 Answers to the 5 Required Codebase Study Questions

#### Question A: What happens at session end today for each provider (time cap, provider close, token expiry, clean host end)?
1. **Gemini (`GeminiRealtime` / `GeminiRealtimeClient`):**
   - *Time cap:* No driver-side `MaxSessionSeconds` timer; `RealtimeSessionRuntime.armSessionDeadline` (`packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts:1101`) or token expiry (`capSeconds + 60s` at `geminiRealtime.ts:378`) ends the session.
   - *Provider close (~600 s socket limit or network drop):* `goAway` calls `resumption.ConnectionEnding` (`geminiRealtimeClient.ts:1181-1183`, `geminiRealtime.ts:2185-2187`); unexpected socket close calls `resumption.ConnectionLost()` (`geminiRealtimeClient.ts:1152-1160`, `geminiRealtime.ts:1735-1744`). However, on the Developer API (`v1alpha`), Google closes at ~600 s with `1011` without sending `goAway`, and resuming with the single setup-time handle restores an empty session unless history is re-seeded.
   - *Token expiry:* Re-opening `ai.live.connect` with an expired or `uses`-exhausted ephemeral token fails `awaitSetup` (`geminiRealtimeClient.ts:1222, 1273-1280`), exhausts the 3 retries (`[0, 1000, 3000]` ms), and fires `handleResumeFailed` (`Fatal: true`, state `'error'`, `:1335-1341`).
   - *Clean host end:* `Disconnect()` (`geminiRealtimeClient.ts:666-702`) sets `closedByConsumer = true`, stops media/timers, disposes `resumption`, closes `session`, and sets state `'closed'`. Server `Close()` (`geminiRealtime.ts:2155-2173`) sets `closedByConsumer = true`, disposes `resumption`, and closes `this.live`.
2. **Gemini Enterprise / Vertex (`GeminiEnterpriseRealtime` / `GeminiEnterpriseRealtimeClient`):**
   - *Time cap:* MJAPI relay (`RealtimeRelayTunnel.ts:190-195, 420-427`) closes the browser WebSocket at `grant.ExpiresAtMs` (`min(1800, MaxSessionSeconds)`) with close code `4000` (`REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE`). `GeminiRealtimeClient.handleTransportClose` (`geminiRealtimeClient.ts:1141-1150`) emits `{ Code: 'time-limit', Fatal: true }` and sets state `'error'`.
   - *Provider close:* `goAway` / socket close triggers `RealtimeSessionResumption` over the same `RelayUrl` (up to `REALTIME_RELAY_MAX_CONNECTIONS = 10`, `realtimeProxyRegistry.ts:34`), provided `ResumeHandle` was observed in `entry.Handles` (`realtimeProxyRegistry.ts:505-540`).
   - *Token expiry:* Upstream Google OAuth token is refreshed per upstream connection via `Policy.UpstreamHeaders()` (`geminiEnterpriseRealtime.ts:223, 333-341`), while the MJAPI relay ticket itself expires at `ExpiresAtMs` (max 1,800 s today).
3. **OpenAI Realtime (`OpenAIRealtime` / `OpenAIRealtimeClient`):**
   - *Time cap / provider close:* OpenAI closes the session at 60 minutes (`3600` s). On client WebRTC, `channel.onerror` (`openAIRealtimeClient.ts:298-301`) sets state `'error'` (`Fatal: true`), and `channel.onclose` (`:302-306`) sets state `'closed'`. On server WebSocket (`openAIRealtime.ts:1628-1635`), `handleSocketClose` emits `{ Fatal: true }`.
   - *Token expiry:* Ephemeral `client_secret` (default 600 s TTL) is only used during the initial `postSdpOffer` (`openAIRealtimeClient.ts:112, 242-257`). Any reconnect requires minting a fresh `client_secret`.
4. **OpenAI Live (`OpenAILiveRealtime` / `OpenAILiveClient`):**
   - *Time cap / provider close:* `session.closed` frame (`openAILiveClient.ts:797-800`, `openAILiveRealtime.ts:693-713`) with `reason: 'expired' | 'connection_lost' | ...` transitions client to `'closed'` and calls `Disconnect()`. Single-use SDP broker ticket (`EphemeralToken` URL) is consumed on initial connect (`RealtimeSdpBrokerHandler.ts:59`).
5. **xAI (`xAIRealtime` / `xAIRealtimeClient`):**
   - *Time cap / provider close:* On any WebSocket close, `OpenAIProtocolWebSocketRealtimeClient.handleSocketClose` (`openAIProtocolClient.ts:1242-1249`) immediately emits `{ Message: 'xAI realtime session closed unexpectedly', Fatal: true }` and sets state `'error'`.
6. **ElevenLabs (`ElevenLabsRealtime` / `ElevenRealtime`):**
   - *Time cap / provider close:* Managed agent or OpenAI-compat session closes at `max_duration_seconds` (`600` s default, up to `7200` s). Both `ElevenLabsRealtimeClient.handleSocketClose` (`elevenLabsRealtimeClient.ts:515-521`) and `OpenAIProtocolWebSocketRealtimeClient.handleSocketClose` (`openAIProtocolClient.ts:1242-1249`) treat unexpected socket close as `Fatal: true` (`'error'`).

#### Question B: Which existing pieces (`RealtimeSessionResumption`, `RealtimeConversationMemory` from #6458, `DriverFacts`, `ResolveEffectiveModelConfiguration`, `RealtimeProxyRegistry`) fit the senior engineer's design, and which must move or change?
- **Fits as-is:**
  - `ResolveEffectiveModelConfiguration` (`packages/AI/Core/src/generic/modelConfiguration.ts:575-586`) and `AIEngineBase.GetEffectiveModelConfiguration` (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:2063-2079`) already implement the model → model-vendor configuration cascade.
  - `RealtimeConversationMemory` (from PR #6458, `packages/AI/Core/src/generic/realtimeConversationMemory.ts:1-175`) already lives in `@memberjunction/ai` (`packages/AI/Core`) and captures user, assistant, context-note, tool-call, and bracket-escaped tool-result turns in a provider-neutral format.
- **Must move or change:**
  - **Call/connection duration configuration:** Add duration settings to `RealtimeConfigurationSettings` in both `IAIConfiguration.ts` and `modelConfiguration.ts`, project them into the session config bag in `realtime-coagent-config.ts` / `realtime-client-session-service.ts`, and expose the runtime readonly getter returning `number | undefined` on `BaseRealtimeModel` and `BaseRealtimeClient`.
  - **Framework timer & abstract reconnect contract:** Move the proactive reconnect timer out of Gemini-specific code into `BaseRealtimeModel` (server session lifecycle) and `BaseRealtimeClient` (browser client lifecycle). Both base classes must arm a timer with a pre-expiry buffer (e.g., 5–10 s before connection/call duration expiry) and invoke an abstract reconnect method implemented by each subclass.
  - **History tracking in base classes:** Move `RealtimeConversationMemory` recording out of `GeminiRealtimeClient` into `BaseRealtimeClient` (and server-side base session tracking in `BaseRealtimeModel`) so every provider subclass that falls back to history injection (OpenAI, Gemini Developer API when native resume is untrusted, ElevenLabs, etc.) shares one canonical conversation ledger without duplicating recording logic.
  - **Relay ticket renewal (`RealtimeProxyRegistry`):** `GeminiEnterpriseRealtime` issues a relay ticket (`IssueRelaySession`, `realtimeProxyRegistry.ts:432-450`) capped at `REALTIME_RELAY_SESSION_LIFETIME_SECONDS = 1800` and `REALTIME_RELAY_MAX_CONNECTIONS = 10`, and `OpenAILiveRealtime` / `HuggingFaceRealtime` issue single-use tickets (`Issue`, `realtimeProxyRegistry.ts:372-385`). The mid-call token refresh path must also be able to refresh or extend relay/broker credentials within the `AIAgentSession`'s remaining deadline.

#### Question C: What state must survive a connection swap so reconnect, recording, transcript, and tool calls keep working?
1. **Host & `RealtimeSessionRuntime` (`packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts`):**
   - `AgentSessionId`, `ConversationId`, `CoAgentRunID`, `PromptRunID`, `CoAgentRunStepID` (`RealtimeSessionRuntime.ts:510-545`).
   - Active `RecordingShardQueue` and `RecordingShardDrain` (`RealtimeSessionRuntime.ts:595-605`): shard index counter must continue monotonically (`0, 1, 2, ...`) across reconnects with zero reset or terminal beacon until the user/session actually ends.
   - `BaseRealtimeClient` instance and its wired callbacks (`wireClientCallbacks`, `RealtimeSessionRuntime.ts:4378-4424`), `inputAudioMeter`, `outputAudioMeter`, `remoteMediaStream`, and mounted channels.
   - `ConnectionState$` / `Resuming$` (`RealtimeSessionRuntime.ts:4418-4424`): transitioning `'listening'` → `'connecting'` sets `Resuming$ = true` while keeping `Caliber` and `<mj-realtime-widget>` in the `'live'` phase (`widget-controller.ts:730-733`, `widget-overlay-launch.service.ts:471-524`), and `'listening'` clears `Resuming$ = false`.
2. **Driver Transport & Audio Pipeline:**
   - **WebSocket PCM drivers (`GeminiRealtimeClient`, `xAIRealtimeClient`, `ElevenLabsRealtimeClient`, `ElevenRealtimeClient`):** `micStream`, `micCapture`, `playback`, and audio meters survive untouched; outbound mic PCM during the ~200–500 ms swap is buffered in a bounded ring buffer (≤2 s) and flushed once the new socket is ready.
   - **WebRTC drivers (`OpenAIRealtimeClient`, `OpenAILiveClient`):** `micStream` and `BaseRealtimeClient` meters/handlers survive, while the new `RTCPeerConnection` and `RTCDataChannel` are negotiated using `micStream`'s existing audio track, and `remoteAudioEl.srcObject` / `outputAudioMeter` are rebound to the new remote track before closing the old `RTCPeerConnection`.
3. **Transcripts & In-Flight Tool Calls:**
   - Partial user and assistant transcripts must be finalized/flushed before swapping sockets so fragments from Connection $N$ are not concatenated onto Connection $N+1$.
   - `pendingToolCallNames` / in-flight `ExecuteRealtimeSessionTool` calls continue running against MJAPI during the socket swap. If a tool call was started on Connection $N$ and completes after Connection $N+1$ is active:
     - On native-resumed sessions (Vertex AI, Gemini server key, xAI native resumption), the tool output can be sent via normal `sendToolResponse` / `function_call_output`.
     - On fresh-session history-seeded reconnects (OpenAI Realtime, Gemini Developer API ephemeral token), Connection $N+1$ has no wire `call_id` from Connection $N$, so late tool results from before the swap (`callsFromBeforeReseed`) must be injected as a labeled context/user item rather than a bare `function_call_output` with an unknown `call_id`.

#### Question D: How does a browser get a new token mid-call under each auth type (logged-in user, magic-link visitor, public guest)?
- Every browser host already has an authenticated `IMetadataProvider` (`GraphQLDataProvider`) on `RealtimeSessionRuntime.Provider` that executes mid-call GraphQL mutations (`ExecuteRealtimeSessionTool`, `RelayRealtimeTranscript`, `RelayRealtimeUsage`, `AgentSessionHeartbeat`):
  1. **Logged-in user:** Carries standard IdP Bearer JWT; `LoadOwnedRealtimeSession` (`packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts:42-65`) verifies `UUIDsEqual(session.UserID, contextUser.ID)`.
  2. **Anonymous magic-link visitor (including Caliber widget visitors):** Carries redeemed magic-link JWT (`mj_magic_link: true, mj_anon: true, mj_sid`). `BuildMagicLinkSessionUser` (`packages/MJServer/src/context.ts:232-315`) populates `IsMagicLinkAnonymous`, `AnonymousVisitorID`, and `MagicLinkScope`. `AuthorizeSessionAccess` (`packages/MJServer/src/realtimeSessions/sessionAccess.ts:104-131`) verifies both `UUIDsEqual(session.UserID, contextUser.ID)` AND `Conversation.ExternalID === (MagicLinkScope.ResourceID || AnonymousVisitorID)`.
  3. **Public widget guest (`<mj-realtime-widget>`):** Carries 15-minute guest JWT minted at `POST /widget/session` (`WidgetSessionService.ts:210-346`) and automatically renewed for up to 2 hours (`MAX_GUEST_REFRESH_WINDOW_SECONDS = 7200`, `widgetCore.ts:35`) via `POST /widget/session/refresh` (`WidgetSessionService.ts:352-487`), which preserves `mj_sid` (`Conversation.ExternalID`).
- Therefore, a dedicated GraphQL mutation `RefreshRealtimeClientSessionToken(agentSessionId: String!)` on `RealtimeClientSessionResolver` works uniformly across all 3 auth types without new auth endpoints or privilege escalation.

#### Question E: What happens during a rolling upgrade when a newer host talks to an older server or vice versa?
1. **Newer client / host talking to an older MJAPI server:**
   - **Initial launch (`StartRealtimeClientSession`):** `DefaultRealtimeSessionLauncher` (`packages/RealtimeRuntime/src/session/session-launcher.ts:139-156, 211-240`) already uses `unsupportedExtension()` to strip any GraphQL field/argument rejected by an older server's schema validation and retry automatically. Any new field on `StartRealtimeClientSessionResult` (e.g., `ConnectionMaxSeconds`) must either be carried inside `SessionConfigJson` / `EffectiveConfigJson` or guarded by `MintExtensions` so an older server never fails launch validation.
   - **Mid-call refresh (`RefreshRealtimeClientSessionToken`):** If the client calls `RefreshRealtimeClientSessionToken` against an older server that lacks the mutation, GraphQL returns a validation error (`Cannot query field "RefreshRealtimeClientSessionToken"`). The client token-refresh callback must catch this specific schema error, log a one-time warning, and fall back to reconnecting with the existing `EphemeralToken` / `RelayUrl` (which still succeeds for multi-use Gemini tokens and Vertex relay sessions within their original TTL).
2. **Older client / host talking to a newer MJAPI server:**
   - All existing `StartRealtimeClientSession` fields and semantics remain unchanged. Server-side `BaseRealtimeModel` sessions (`RealtimeSessionRunner` / LiveKit / SIP bridges) gain automatic timed reconnects immediately, while an older browser bundle continues operating with the initial token minted at `StartRealtimeClientSession`.

---

## 3. Per-Provider Research & Live Probe Results (`2026-11-07`)

### 3.1 Summary Matrix of Provider Behavior

| Provider | How Token / Credential Is Minted | Token Lifetime & Reuse Rules | Single-Connection / Socket Limit | Total Session Ceiling | Warning Frame Before Cut? | Native Resumption Mechanism & Verified Behavior | Fallback History Seeding Mechanism |
|---|---|---|---|---|---|---|---|
| **Gemini Developer API** (`GeminiRealtime`, `GeminiRealtimeClient`) | Server calls `v1alpha` `ai.authTokens.create` (`geminiRealtime.ts:382-400`) with `uses`, `expireTime`, `newSessionExpireTime`, `liveConnectConstraints` | Default `expireTime` 30 min (`1800` s max). `uses` must cover reconnects (`uses: 1` fails on reconnect per Google forum #118180) | **~600 s (10 min)** WebSocket limit (`ai.google.dev/gemini-api/docs/live-session`); without compression: 15 min audio, 2 min audio+video | Unlimited across connections when `contextWindowCompression: { slidingWindow: {} }` is set; single token capped at **30 min (1,800 s)**; forum #186392 reports `1011 Deadline expired` at **58:00** | Docs claim `goAway` 60 s before end; **Live probes & #6403 showed Developer API closes at ~600 s with `1011` and NO `goAway`** | `sessionResumption: { handle }` (handle valid 2 hr per docs). **Live Probe 3C:** Works on server API key (`v1beta`). **Live Probes 3A & 3D:** On `v1alpha` ephemeral tokens (same or new token), connects but **restores an EMPTY session** | `session.sendClientContent({ turns, turnComplete: false })` before enabling mic/queued sends (**Live Probe 3B: PASS, `1,462 ms`**) |
| **Gemini Enterprise / Vertex AI** (`GeminiEnterpriseRealtime`, `GeminiEnterpriseRealtimeClient`) | Server issues MJAPI relay ticket (`RealtimeProxyRegistry.IssueRelaySession`, `geminiEnterpriseRealtime.ts:227-233`); relay injects Google OAuth bearer token upstream (`:333-341`) | Relay ticket open window: `300` s; relay session lifetime: `min(1800, MaxSessionSeconds)` (`realtimeProxyRegistry.ts:20-23`); max `10` connections per ticket | **~600 s (10 min)** upstream Vertex WebSocket limit (`cloud.google.com/.../start-manage-session`) | Unlimited across connections with `slidingWindow` + `sessionResumption` (handles cached 24 hr in Vertex, ~10 min active window); relay ticket currently caps at `1,800` s unless refreshed | `BidiGenerateContentServerMessage.goAway` sent 60 s before 10-min cut (`cloud.google.com/.../start-manage-session`) | `sessionResumption: { handle }` over MJAPI relay (`GeminiLiveRelayPolicy` records `newHandle` and validates on reconnect). Native handle restores context on Vertex AI (`v1`) | Not needed when Vertex native handle succeeds; if relay ticket is refreshed without handle, relay policy would need to permit seeded `clientContent` |
| **xAI (Grok Voice)** (`xAIRealtime`, `xAIRealtimeClient`) | Server POSTs to `https://api.x.ai/v1/realtime/client_secrets` (`openAIRealtime.ts:933`, `xaiRealtime.ts:193`) | `expires_after.seconds` defaults to **600 s (10 min)** and has a hard max of **3,600 s (60 min)** (**Live Probe 1A: `7200` rejected with HTTP 400**) | Up to **7,200 s (120 min)** per WebSocket session (`xaiRealtime.ts:180`) | **7,200 s (120 min)** (`DriverFacts.ProviderMaxSessionSeconds`); native resumption caches history across connections (drops after 30 min inactivity) | None documented | **Native Session Resumption documented & verified (`docs.x.ai/.../speech-to-speech.md#session-resumption`):** send `resumption: { enabled: true }` in `session.update`, capture `conversation.created.conversation.id`, reconnect with `?conversation_id=<id>` and `resumption: { enabled: true }` (**Live Probe 1B: PASS across 2 ephemeral tokens, `949 ms`**) | `conversation.item.create` for each prior turn before next user turn (**Live Probe 1C: PASS, `903 ms`**) |
| **OpenAI GA Realtime** (`OpenAIRealtime`, `OpenAIRealtimeClient`) | Server POSTs `{ session }` to `https://api.openai.com/v1/realtime/client_secrets` (`openAIRealtime.ts:933`) | `expires_after.seconds` defaults to **600 s (10 min)**, max **7,200 s (120 min)** (**Live Probe 2: `7200` HTTP 200, `7500` HTTP 400**). Gates connection open only | **3,600 s (60 min)** max Realtime session duration (`developers.openai.com/api/docs/guides/realtime-conversations.md`) | **3,600 s (60 min)** per Realtime session; longer calls require a new WebRTC/WS connection + new `client_secret` | None before 60-min cut (emits `error` / closes channel at 60 min) | **None** on `/v1/realtime` (`conversation_id` cannot be resumed across a new WebRTC/WS session) | `conversation.item.create` (`message` items with `input_text` / `output_text`) after `session.created` (**Live Probe 2: PASS, `1,051 ms`**) |
| **OpenAI Live (`gpt-live-1`)** (`OpenAILiveRealtime`, `OpenAILiveClient`) | Server issues single-use 60 s MJAPI SDP-exchange ticket (`openAILiveRealtime.ts:1232-1241`) for `POST /realtime/sdp-exchange` | Single-use MJAPI ticket, **60 s TTL** (`openAILiveRealtime.ts:1238`). Consumed on first WebRTC SDP POST | Managed internally by GPT-Live (auto-replaces voice engine at 90% of 128k context window, `live-conversations.md`) | Ends with `session.closed` (`reason: 'expired'`) when provider duration limit is reached | `session.usage.updated` reports cumulative `usage.seconds` and `context_window.usage_ratio`; `session.closed` reports `reason` | Supports **Session Forking** (`POST /v1/live/sessions/{id}/fork` or `wss://.../fork`) **only** when `store: true` (unavailable under Zero Data Retention) and after source recording finalizes (`live-conversations.md`) | Startup `session.input` accepts up to **128 messages / 8,192 tokens** (`developer`, `user`, `assistant` roles) at session creation (`live-conversations.md`) |
| **ElevenLabs Agents & Eleven Realtime** (`ElevenLabsRealtime`, `ElevenRealtime`) | Agents: `GET /v1/convai/conversation/get-signed-url` (`elevenLabsRealtime.ts:1069`). ElevenRealtime: `POST /v1/convai/realtime/client_secrets` (`elevenRealtime.ts:254`) | Signed URL open window: **15 min (900 s)** (`elevenLabsRealtime.ts:32`). Single-use once `include_conversation_id` or socket opens | Governed by `max_duration_seconds`: default **600 s (10 min)**, configurable **60–7,200 s** (`elevenlabs.io/docs/eleven-agents/customization/conversation-flow.md`) | **7,200 s (120 min)** max `max_duration_seconds`; closes WebSocket with code `1000` when exceeded (`create-client-secret.md`) | None | **None** | `ElevenLabsRealtime`: `contextual_update` (`SendContextNote`) + strip `first_message` on reconnect. `ElevenRealtime`: OpenAI-compat `conversation.item.create` |

---

### 3.2 Detailed Live Probe Logs & Pre-Stated Keep/Kill Criteria (`2026-11-07`)

All probes were executed as standalone scripts in `/tmp/probes-6460/` outside product code using the workspace's configured vendor keys in `.env`, with all tokens and conversation IDs redacted.

#### Probe 1: xAI (`grok-voice-3.0`) — Client Secret TTL Ceiling, Native Session Resumption, and History Seeding
- **Pre-stated Keep/Kill Criteria:**
  - *1A (`client_secrets` TTL):* Keep passing `MaxSessionSeconds` up to `7200` into `expires_after.seconds` if HTTP 200; **kill** (clamp `expires_after.seconds` to `<= 3600` while keeping session ceiling at `7200`) if `7200` returns HTTP 400.
  - *1B (Native resumption `?conversation_id=<id>` + `resumption: { enabled: true }` across two fresh ephemeral tokens):* **Keep** xAI native resumption if Leg 2 with a newly minted token recalls `"PINEAPPLE-42"` without `conversation.item.create` seeding; **kill** if it rejects the second token or loses context.
  - *1C (`conversation.item.create` fallback):* **Keep** as fallback if Leg 2 on a fresh conversation recalls `"PINEAPPLE-42"`.
- **Measured Results (`2026-11-07`):**
  ```text
  --- Sub-test 1A: xAI client_secrets expires_after.seconds limits ---
  mint(7200): { status: 400, elapsedMs: 234, hasValue: false, errorBody: '{"error":"TTL for a client secret cannot exceed 60 minutes"}' }
  mint(3600): { status: 200, elapsedMs: 107, hasValue: true, errorBody: null }
  mint(300):  { status: 200, elapsedMs: 181, hasValue: true, errorBody: null }

  --- Sub-test 1B: xAI Native Session Resumption (?conversation_id + resumption.enabled: true) across two ephemeral tokens ---
  Leg 1: { connectMs: 204, sessionUpdatedMs: 568, totalMs: 1754, hasConversationId: true, transcript: 'Stored: PINEAPPLE-42.', error: null }
  Leg 2 (Native ?conversation_id with fresh token #2): { mintMs: 174, connectMs: 223, sessionUpdatedMs: 377, totalMs: 949, transcript: 'PINEAPPLE-42.', recalledPineapple: true, error: null }

  --- Sub-test 1C: xAI History Seed Fallback (conversation.item.create) with fresh token #3 ---
  Leg 2 (Seeded via conversation.item.create with fresh token #3): { mintMs: 176, connectMs: 188, sessionUpdatedMs: 368, totalMs: 903, transcript: 'PINEAPPLE-42.', recalledPineapple: true, error: null }
  ```
- **Decision from Probe 1:**
  1. **Kill** passing `> 3600` to xAI `expires_after.seconds` (must clamp `expires_after.seconds` to `<= 3600` even when `MaxSessionSeconds` is `7200`).
  2. **Keep** xAI native resumption (`resumption: { enabled: true }` + `?conversation_id=<id>`) as xAI's native continuation mechanism (unless `ZeroDataRetention` is active, in which case use `conversation.item.create` fallback from 1C).

#### Probe 2: OpenAI Realtime (`gpt-realtime-2.1-mini`) — Client Secret TTL Ceiling and Reconnect History Seeding
- **Pre-stated Keep/Kill Criteria:**
  - *2A (`client_secrets` TTL):* Verify default TTL and maximum `expires_after.seconds`.
  - *2B (Reconnect with fresh `client_secret` + `conversation.item.create` seed):* **Keep** if total reconnect + seed completes in `< 2,000 ms` and recalls `"GLACIER-79"`; **kill** if `conversation.item.create` fails or loses context.
- **Measured Results (`2026-11-07`):**
  ```text
  --- OpenAI client_secrets expires_after.seconds check ---
  mint(default): { status: 200, elapsedMs: 329, ttlSec: 600 }
  mint(7200):    { status: 200, elapsedMs: 234, ttlSec: 7200, errorBody: null }
  mint(7500):    { status: 400, elapsedMs: 114, errorBody: "Invalid 'expires_after.seconds': integer above maximum value. Expected a value <= 7200, but got 7500 instead." }

  --- OpenAI Reconnect + History Seed Probe (2 legs with separate ephemeral client_secrets) ---
  Leg 1: { timedOut: false, connectMs: 338, sessionCreatedMs: 345, totalMs: 875, transcript: 'I can’t store or remember codewords, but I can help you use them when you tell me again.' }
  Leg 2 (fresh client_secret #2 + conversation.item.create seed): { mintMs: 208, timedOut: false, connectMs: 454, sessionCreatedMs: 467, totalMs: 1051, transcript: 'You asked about the codeword GLACIER-79, but I can’t store secrets.', recalledGlacier: true }
  ```
- **Decision from Probe 2:** **Keep** fresh `client_secret` mint (`~208 ms`) + new WebRTC/WebSocket connection (`~467 ms`) + `conversation.item.create` history seeding for `OpenAIRealtime` / `OpenAIRealtimeClient`.

#### Probe 3: Gemini Live (`models/gemini-3.8-live`) — Native Handle vs. History Seeding Across `v1alpha` Ephemeral Tokens and `v1beta` Server API Key
- **Pre-stated Keep/Kill Criteria:**
  - *3A & 3D (`v1alpha` Ephemeral Token + Native Handle ONLY, testing both SAME token and NEW token with 600 ms post-turn settle):* **Keep** native handle alone on `v1alpha` ephemeral tokens **only if** it recalls the prior turn's project code; **kill** trusting native handle alone on `v1alpha` ephemeral tokens if it restores an empty session.
  - *3B (`v1alpha` Ephemeral Token #3 + `sendClientContent({ turns, turnComplete: false })` History Seed):* **Keep** history seeding if it recalls `"AURORA-55"` in `< 2,500 ms`.
  - *3C (`v1beta` Direct Server API Key + Native Handle ONLY):* **Keep** native handle on server-side `GeminiRealtimeSession` (`v1beta`) if it recalls `"COBALT-88"` without history seeding.
- **Measured Results (`2026-11-07`):**
  ```text
  --- Sub-test 3A & 3B: v1alpha Ephemeral Token Native Handle vs Seeded ---
  Token #1 minted: { mintMs: 172 }
  Leg 1: { setupMs: 224, totalMs: 4590, hasHandle: true, resumableFlag: true, handleCount: 1, transcript: 'I have noted project AURORA-55.' }
  Leg 2A (Fresh Token #2 + Native Handle ONLY, no seed): { mintMs: 144, setupMs: 234, totalMs: 3742, hasHandle: true, handleCount: 1, transcript: "I don't have access to our past conversation history.", recalledAurora: false, closedEarly: false, error: null }
  Leg 2B (Fresh Token #3 + sendClientContent Seed): { mintMs: 87, setupMs: 221, totalMs: 1462, hasHandle: true, handleCount: 1, transcript: 'We were discussing project AURORA-55.', recalledAurora: true, error: null }

  --- Sub-test 3C: v1beta Direct Server API Key Native Handle ONLY ---
  Direct Key Leg 1: { setupMs: 248, totalMs: 3968, hasHandle: true, handleCount: 1, transcript: 'I have noted project COBALT-88.' }
  Direct Key Leg 2 (Native Handle ONLY): { setupMs: 196, totalMs: 4118, hasHandle: true, handleCount: 1, transcript: 'We were discussing project COBALT-88.', recalledCobalt: true }

  --- Sub-test 3D: v1alpha Ephemeral Token (Same Token vs New Token, 600ms settle after turnComplete) ---
  Leg 1: { setupMs: 339, totalMs: 4324, handleCount: 1, transcript: 'I have noted project FALCON-77.' }
  Leg 2 (SAME Ephemeral Token #1 + Native Handle): { setupMs: 324, totalMs: 6064, handleCount: 1, transcript: "I don't have access to our previous conversations to know which project code you're referring to.", recalledFalcon: false }
  Leg 3 (NEW Ephemeral Token #2 + Native Handle): { setupMs: 278, totalMs: 6452, handleCount: 1, transcript: "I'm sorry, I don't have a record of our previous conversation or the project code.", recalledFalcon: false }
  ```
- **Decision from Probe 3:**
  1. Server-side `GeminiRealtimeSession` (`v1beta` with API key) and `GeminiEnterpriseRealtime` / `GeminiEnterpriseRealtimeClient` (Vertex AI `v1`) **genuinely restore context** from `sessionResumption: { handle }` and should use native continuation without re-seeding history.
  2. Client-direct `GeminiRealtimeClient` on the Developer API (`v1alpha` ephemeral tokens) **connects with `sessionResumption: { handle }` but restores an empty session** (both on the same token and on a refreshed token). This directly motivates Open Question #2 for the senior engineer: whether a driver should declare whether its native continue is trustworthy (`TrustsNativeResumption: false` on Developer API ephemeral-token client-direct, or controllable via `ModelConfiguration.Realtime`) so the framework seeds history when native resumption is broken upstream.

---

## 4. Claim Ledger

Every load-bearing fact used in the design plan is recorded below with its verified source (`code (file:line)`, `live probe`, `official doc (with URL and date read)`, or `unverified`).

| # | Claim | Source Type | Exact Citation / Evidence |
|---|---|---|---|
| C1 | `MJ: AI Model Types`, `MJ: AI Models`, and `MJ: AI Model Vendors` store their JSON configuration in column `ModelConfiguration` (`ModelConfigurationObject`), while `MJ: AI Vendors` uses `Configuration` (`ConfigurationObject.ModelDefaults`). | `code` | `packages/MJCoreEntities/src/generated/entities/__mj.ts:59264-59284`, `:60161-60181`, `:61020-61040`, `:68762-68782` |
| C2 | `IAIConfiguration.ts` and `modelConfiguration.ts` must stay in structural lockstep, enforced by an AST unit test. | `code` | `metadata/entities/JSONType-interfaces/IAIConfiguration.ts:36-40`, `packages/AI/Core/src/generic/modelConfiguration.ts:25-31`, `packages/AI/Core/src/__tests__/modelConfiguration.test.ts:532-635` |
| C3 | `AIEngineBase.GetEffectiveModelConfiguration(modelID, vendorModelVendorID)` deep-merges `AIModelType.ModelConfiguration < AIModel.ModelConfiguration < AIVendor.Configuration.ModelDefaults < AIModelVendor.ModelConfiguration`. | `code` | `packages/AI/BaseAIEngine/src/BaseAIEngine.ts:2063-2079`, `packages/AI/Core/src/generic/modelConfiguration.ts:575-608` |
| C4 | `BaseRealtimeModel.DriverFacts` defines `ProviderMaxSessionSeconds` as `1800` for `GeminiRealtime` and `GeminiEnterpriseRealtime`, `3600` for `OpenAIRealtime`, `7200` for `xAIRealtime` (`GrokRealtime`) and `ElevenLabsRealtime`, and `undefined` for `OpenAILiveRealtime`, `ElevenRealtime`, `AssemblyAIRealtime`, `HuggingFaceRealtime`, and `InworldRealtime`. | `code` | `packages/AI/Providers/Gemini/src/geminiRealtime.ts:236-239`, `packages/AI/Providers/Vertex/src/models/geminiEnterpriseRealtime.ts:171-175`, `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:795-798`, `packages/AI/Providers/xAI/src/models/xaiRealtime.ts:179-183`, `packages/AI/Providers/ElevenLabs/src/elevenLabsRealtime.ts:459-462`, `packages/AI/Providers/Bundle/src/__tests__/realtime-driver-facts.table.test.ts:18-49` |
| C5 | `GeminiRealtime.CreateClientSession` mints a `v1alpha` ephemeral token with `expireTime = min(30 min, (capSeconds + 60) * 1000)` and `uses = Math.ceil(capSeconds / 600) + 3`. | `code` | `packages/AI/Providers/Gemini/src/geminiRealtime.ts:122-134, 372-400` |
| C6 | Gemini Live API WebSocket connections have a lifetime of ~10 minutes (~600 s); without `contextWindowCompression`, audio-only sessions end at 15 min and audio-video at 2 min; with `slidingWindow` compression, sessions can extend across connections. | `official doc` | `https://ai.google.dev/gemini-api/docs/live-session` (canonical `https://aistudio.google.com/docs/live-api/session-management`) and `https://cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session`, read `2026-11-07` |
| C7 | Gemini ephemeral tokens default to `uses: 1` and `expireTime: 30 min`; although Google's docs claim `uses: 1` works for session resumption within 30 min, Google acknowledged on the developer forum that resumption consumes `uses` and fails with `1011 Token has been used too many times` when `uses: 1`. | `official doc` | `https://ai.google.dev/gemini-api/docs/ephemeral-tokens` and `https://discuss.ai.google.dev/t/ephemeral-token-resumption-consumes-uses-even-with-uses-1-live-api-v1alpha/118180`, read `2026-11-07` |
| C8 | On Gemini Developer API (`v1alpha`), resuming with `sessionResumption: { handle }` under an ephemeral token (either the same token or a newly minted token) connects cleanly (`setupComplete` ~234–324 ms) but restores an **empty** session (`recalledAurora: false`, `recalledFalcon: false`), whereas on `v1beta` with a server API key, `sessionResumption: { handle }` restores full context (`recalledCobalt: true`). | `live probe` | Live Probes 3A, 3C, 3D (`/tmp/probes-6460/probe-gemini-ephemeral-reconnect.mjs`, `probe-gemini-server-key.mjs`, `probe-gemini-ephemeral-compare.mjs`), executed `2026-11-07` |
| C9 | On Gemini Developer API (`v1alpha`), seeding prior conversation turns via `session.sendClientContent({ turns, turnComplete: false })` on a freshly minted ephemeral token restores context (`recalledAurora: true`, `setupMs: 221`, `totalMs: 1462`). | `live probe` | Live Probe 3B (`/tmp/probes-6460/probe-gemini-ephemeral-reconnect.mjs`), executed `2026-11-07`, and Layer A smoke runs in `.claude/worktrees/fix-6403-reconnect-memory/docs/superpowers/plans/2026-11-06-gemini-live-reconnect-memory-smoke.md:105-197` |
| C10 | A Google AI Developers Forum report on `gemini-3.8-live` observed sessions closing at `58:00` with `1011 Deadline expired` (after `go_away` at `57:09.8`) and failing subsequent resumption with `1007`. We have not yet run a 60-minute continuous call probe in this session, so whether `58:00` is a universal hard session ceiling on `gemini-3.8-live` is marked `unverified` (community report only). | `official doc` / `unverified` | Forum report: `https://discuss.ai.google.dev/t/gemini-3-8-live-live-sessions-are-closed-at-exactly-58-00-with-1011-deadline-expired-resumption-afterwards-fails-with-1007/186392` (read `2026-11-07`); universal applicability across endpoints is `unverified` pending a >60-min live call test |
| C11 | OpenAI Realtime API maximum session duration is **60 minutes (3,600 s)**; `POST /v1/realtime/client_secrets` `expires_after.seconds` defaults to **600 s (10 min)** and caps at **7,200 s (2 hr)**. | `official doc` & `live probe` | `https://developers.openai.com/api/docs/guides/realtime-conversations.md` (read `2026-11-07`) and Live Probe 2 (`mint(default) -> 600s`, `mint(7200) -> 200 OK`, `mint(7500) -> 400 integer_above_max_value`, executed `2026-11-07`) |
| C12 | OpenAI Realtime (`/v1/realtime`) has no native cross-connection resumption handle, but reconnecting with a freshly minted `client_secret` and injecting prior turns via `conversation.item.create` preserves conversation memory (`mintMs: 208`, `sessionCreatedMs: 467`, `totalMs: 1051`, `recalledGlacier: true`). | `live probe` | Live Probe 2 (`/tmp/probes-6460/probe-openai-reconnect.mjs`), executed `2026-11-07` |
| C13 | OpenAI GPT-Live (`gpt-live-1`, `/v1/live/sessions`) supports seeding up to 128 messages / 8,192 tokens via `session.input` at session creation, and supports `/v1/live/sessions/{id}/fork` only when `store: true` (disabled under Zero Data Retention) and after source recording finalization. | `official doc` | `https://developers.openai.com/api/docs/guides/live-conversations.md`, read `2026-11-07` |
| C14 | xAI Speech-to-Speech (`wss://api.x.ai/v1/realtime`) supports native **Session Resumption** via `session.update` `{ resumption: { enabled: true } }` and reconnecting with `?conversation_id=<id>` (cached up to 30 min of inactivity), AND works across two freshly minted ephemeral tokens (`mintMs: 174`, `connectMs: 223`, `totalMs: 949`, `recalledPineapple: true`). | `official doc` & `live probe` | `https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech.md#session-resumption` (read `2026-11-07`) and Live Probe 1B (`/tmp/probes-6460/probe-xai-reconnect.mjs`, executed `2026-11-07`) |
| C15 | xAI `POST https://api.x.ai/v1/realtime/client_secrets` `expires_after.seconds` defaults to 600 s and has a maximum of **3,600 s (1 hour)**; passing `7200` fails with HTTP 400 `{"error":"TTL for a client secret cannot exceed 60 minutes"}`. | `official doc` & `live probe` | `https://docs.x.ai/developers/rest-api-reference/inference/voice.md` (read `2026-11-07`) and Live Probe 1A (`mint(7200) -> 400`, `mint(3600) -> 200`, executed `2026-11-07`) |
| C16 | ElevenLabs Conversational AI signed URLs expire in 15 minutes (`ELEVENLABS_SIGNED_URL_TTL_MS = 900_000`), and active conversation duration is governed by `max_duration_seconds` (default 600 s, range 60–7,200 s), closing with WebSocket code `1000` when exceeded. | `code` & `official doc` | `packages/AI/Providers/ElevenLabs/src/elevenLabsRealtime.ts:32, 756-761, 871-873`; `https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow.md` and `https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/create-client-secret.md` (read `2026-11-07`) |
| C17 | `LoadOwnedRealtimeSession` (`AuthorizeSessionAccess`) authenticates all three browser caller types—logged-in users, anonymous magic-link visitors (including Caliber visitors), and public widget guests—by checking `UUIDsEqual(session.UserID, contextUser.ID)` plus `Conversation.ExternalID === (MagicLinkScope.ResourceID || AnonymousVisitorID)` for scope-limited principals. | `code` | `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts:42-65`, `packages/MJServer/src/realtimeSessions/sessionAccess.ts:81-131`, `packages/MJServer/src/context.ts:232-315` |
| C18 | Caliber's `CaliberWidgetMintingProvider` wraps `RealtimeSessionService.Provider` in a `Proxy` that intercepts only `StartRealtimeClientSession` when `targetAgentId === 'caliber-widget-server-mint'` and forwards every other GraphQL operation verbatim to `target.ExecuteGQL`. | `code` | `bizapps-caliber/packages/Angular/src/lib/widget/overlay/caliber-widget-mint.provider.ts:143-195, 256-259` |
| C19 | Caliber's `ClientDirectRealtimeLauncher` subclasses `RealtimeClientSessionService` as `CaliberPersonaClientSessionService` (overriding `buildCompanionSystemPrompt` and calling `selectRealtimeVendor`) and writes `{ targetAgentID, coAgentRunID, promptRunID, coAgentRunStepID }` to `AIAgentSession.Config_`. | `code` | `bizapps-caliber/packages/Server/src/runtime/launch/client-direct-launcher.ts:58-110, 137-168, 413-428` |
| C20 | Both `<mj-realtime-widget>` (`WidgetController.applyConnectionState`) and Caliber (`WidgetOverlayLaunchService.applyConnectionState`) ignore `'connecting'` state emissions once the widget is in the `'live'` phase, while `RealtimeSessionRuntime.setConnectionState('connecting')` sets `Resuming$ = true`. | `code` | `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts:4418-4424`, `packages/Angular/Generic/realtime-widget/src/lib/session/widget-controller.ts:721-735`, `bizapps-caliber/packages/Angular/src/lib/widget/overlay/widget-overlay-launch.service.ts:471-524` |

---

## 5. Independent Fact-Check Pass Record

Before authoring the design plan, every `file:line` citation in Sections 2–4 was re-opened and verified against `MJ` at `e055b9230c` (the `plan-6460` worktree) and `bizapps-caliber`:

- Verified `packages/AI/Core/src/generic/baseRealtime.ts:149-253, 421-486` (`RealtimeDriverFacts`, `ClampSessionSecondsValue`, `BaseRealtimeModel`, `ClientRealtimeSessionConfig`).
- Verified `packages/AI/Core/src/generic/realtimeSessionResumption.ts:56-77, 114-356` (`RealtimeSessionResumption` constants and state machine).
- Verified `packages/AI/Core/src/generic/modelConfiguration.ts:219-276, 575-608` and `metadata/entities/JSONType-interfaces/IAIConfiguration.ts:330-372` (`RealtimeConfigurationSettings` and `ResolveEffectiveModelConfiguration`).
- Verified `packages/AI/BaseAIEngine/src/BaseAIEngine.ts:2063-2079` (`GetEffectiveModelConfiguration` 4-layer merge).
- Verified `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:177, 296-600` (`BaseRealtimeClient`) and `packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts:216-264, 927-1270` (`OpenAIProtocolRealtimeClient`, `OpenAIProtocolWebSocketRealtimeClient`).
- Verified all 10 provider server/client driver files and line numbers in Section 2.3.
- Verified `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts:166-243, 249-368, 533-635, 1547-1660, 2765-2797, 2938-2956`.
- Verified `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts:42-65`, `packages/MJServer/src/realtimeSessions/sessionAccess.ts:81-131`, and `packages/MJServer/src/context.ts:232-315`.
- Verified `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts:932-1149, 4378-4424` and `packages/RealtimeRuntime/src/session/session-launcher.ts:15-279`.
- Verified `bizapps-caliber/packages/Server/src/runtime/launch/client-direct-launcher.ts:58-110, 137-168, 413-428` and `bizapps-caliber/packages/Angular/src/lib/widget/overlay/caliber-widget-mint.provider.ts:82-95, 143-195, 256-259`.
