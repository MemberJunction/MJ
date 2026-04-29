# Voice & Multi-Modal Channels for MJ Agents

**Status:** Plan — not yet implemented.
**Branch:** `claude/voice-agents-integration-5T8cA`.
**Supersedes:** [`plans/audio-agent-architecture.md`](./audio-agent-architecture.md) (earlier audio-only draft; absorbed and generalized here).

---

## What this plan delivers

A first-class **interaction-channel layer** that lets any MJ agent be invoked over voice (browser, mobile, phone) without forking the agent into a "voice version." A single agent definition (e.g. Sage) declares which channels it supports and is reachable over text-chat, low-latency voice (cascaded STT→LLM→TTS), unified speech-to-speech (gpt-realtime, Gemini Live, ElevenLabs Conv AI, PersonaPlex), or PSTN — all through the same `BaseAgent` runtime.

The core idea: **modality is how an agent is invoked, not what an agent is.** The agent itself stays text-shaped; a new `ChannelSession` runtime brokers between transport, audio engine, and the agent. Tool calls reuse MJ's existing client-tool and action infrastructure unchanged.

## Goals

- One agent definition, many channels — Sage and every other agent inherits voice/phone support via metadata, no agent type fork.
- Provider-agnostic — any STT, TTS, LLM, or unified S2S model can be plugged in via the existing `AIModel` + `DriverClass` pattern; ElevenLabs, OpenAI Realtime, Deepgram, AssemblyAI, Cartesia, Azure, Gemini Live, PersonaPlex are all peers.
- Cascaded **and** unified S2S supported as siblings under one engine contract — choosing one is a metadata decision per agent×channel.
- First-class barge-in / interrupt as a runtime concern, not a provider concern.
- Phone bridge via Twilio ConversationRelay, then Twilio Media Streams + LiveKit SIP for full audio control.
- Forward-compatible with `video-realtime`, multi-participant rooms, and on-prem unified models.

## Non-goals (this plan)

- CDP migration. CDP's voice stack stays running. We rebuild the equivalent capability in MJ core; CDP cuts over later as its own effort once this is shipped in a real MJ release.
- Storing recorded audio by default. An agent can opt to persist a transcript or recording, but media persistence is not part of the channel runtime contract.
- Skip / Explorer UI redesign. Voice widget ships as a generic Angular package; surfaces consume it.

## Relationship to prior MJ work

- **`plans/audio-agent-architecture.md`** — earlier audio-only draft. Introduced "audio is an I/O modality wrapper" and the dual real-time / agent-delegation idea. This plan generalizes the modality wrapper to a `Channel` abstraction that covers text, voice (cascaded and S2S), phone, and future video; collapses the dual-layer execution model into a single `ChannelSession` that always runs through `BaseAgent`; and reuses MJ's existing client-tool framework instead of an `AudioGateway`-specific one.
- **`packages/AI/Agents/src/ClientToolRequestManager.ts`** — production client-tool dispatch (PubSub topic `CLIENT_TOOL_REQUEST` + `RespondToClientToolRequest` mutation). Voice channels reuse this verbatim. No new dispatch mechanism.
- **`packages/AI/Core/src/generic/baseAudio.ts`** — existing `BaseAudioGenerator` (batch `CreateSpeech` / `SpeechToText`). Extended with streaming methods; new `BaseRealtimeSpeech` added alongside for bidirectional S2S.
- **`packages/AI/Agents/src/artifact-tools/`** — artifact-tool subsystem (`BaseArtifactToolLibrary`). Not used by the channel runtime now; noted as a future surface (e.g. transcript artifacts gain search/extract tools automatically).

---

## Architecture

### 1. Naming & Terminology

We use the word **Channel** for interaction modality (text-chat, voice-cascaded, voice-realtime, phone, video-realtime, etc.) and leave the existing `MJAIModality` entity untouched (it models content/data types — text, image, audio, video — i.e. what a model can ingest/emit). "Modality" in MJ continues to mean what the rest of the multi-modal-LLM industry calls modality. "Channel" is new and orthogonal.

| Term | Meaning |
|---|---|
| **`MJAIModality`** *(existing, unchanged)* | Content/data types a model handles — text, image, audio, video. Drives `AIModel.SupportedInput*` / `SupportedOutput*`. |
| **`AIAgentChannel`** *(new entity)* | An interaction channel an agent can be invoked over — `text-chat`, `voice-cascaded`, `voice-realtime`, `phone`, `video-realtime`. |
| **`AIAgentChannelConfig`** *(new entity)* | Per-agent override of a channel's defaults. |
| **`AIVoiceProfile`** *(new entity)* | Portable persona: voice id or sample, language, style hints. Maps onto each provider's knobs. |
| **`ChannelSession` / `ChannelRuntime`** *(new code)* | Runtime that bridges transport ↔ engine ↔ `BaseAgent` for a non-text channel. |
| **`BaseChannelEngine`** *(new abstract class)* | Implementation of a channel's per-turn loop — `CascadedChannelEngine`, `RealtimeChannelEngine`, etc. Resolved from `AIAgentChannel.DriverClass` via `ClassFactory`. |
| **`BaseRealtimeSpeech`** *(new abstract class)* | Bidirectional speech-to-speech provider contract (gpt-realtime, Gemini Live, EL Conv AI, PersonaPlex). |

#### Entity name conventions

Tables live in the `__mj` schema; table names use the `AI*` family prefix where appropriate; class generation prepends `MJ` and appends `Entity`; metadata entity names are pluralized.

| Table (`__mj`) | Generated class | Entity name (plural) |
|---|---|---|
| `AIAgentChannel` | `MJAIAgentChannelEntity` | "MJ: AI Agent Channels" |
| `AIAgentChannelConfig` | `MJAIAgentChannelConfigEntity` | "MJ: AI Agent Channel Configs" |
| `AIVoiceProfile` | `MJAIVoiceProfileEntity` | "MJ: AI Voice Profiles" |

### 2. Data Model

All additions are additive. No existing entity is renamed.

#### 2.1 `AIAgentChannel` — channel type table

Seeded rows describe each channel kind the runtime knows how to drive. New channels are added by inserting a row and shipping a class registered with the channel's `DriverClass` key.

| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier | PK |
| `Name` | nvarchar | e.g. `text-chat`, `voice-cascaded`, `voice-realtime`, `phone`, `video-realtime` |
| `Description` | nvarchar(max) | |
| `DriverClass` | nvarchar | `@RegisterClass` key for the engine — e.g. `CascadedChannelEngine` |
| `ConfigJSONSchemaName` | nvarchar | TS discriminator name validating `ConfigJSON` — e.g. `VoiceCascadedConfig` |
| `DefaultConfigJSON` | nvarchar(max) | Channel-wide defaults; merged under per-agent overrides |
| `Status` | nvarchar | `Active` / `Pending` / `Disabled` |
| standard MJ audit columns | | |

**Seeded rows (Phase 1):**
- `text-chat` → `TextChatChannelEngine` / `TextChatConfig`
- `voice-cascaded` → `CascadedChannelEngine` / `VoiceCascadedConfig`
- `voice-realtime` → `RealtimeChannelEngine` / `VoiceRealtimeConfig`
- `phone` → `PhoneChannelEngine` / `PhoneConfig`
- `video-realtime` → `VideoRealtimeChannelEngine` / `VideoRealtimeConfig` *(skeleton, engine class can be a stub for forward-compat)*

#### 2.2 `AIAgentChannelConfig` — agent × channel join

Replaces the "ordered JSON array of supported modalities on `AIAgent`" idea. A join with `Sequence` preserves the ordered-array UX, gives proper FKs, and provides a place to hang per-agent JSON overrides.

| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier | PK |
| `AIAgentID` | FK → `AIAgent` | |
| `AIAgentChannelID` | FK → `AIAgentChannel` | |
| `Sequence` | int | Preferred order when multiple channels are eligible |
| `Status` | nvarchar | `Active` / `Pending` / `Disabled` |
| `ConfigJSON` | nvarchar(max) | Sparse override of the channel's `DefaultConfigJSON` |
| `AIVoiceProfileID` | FK → `AIVoiceProfile`, nullable | Preferred voice for voice channels |
| `LatencyBudgetMs` | int, nullable | Soft cap; runtime emits filler TTS past this |
| standard MJ audit columns | | |

Unique index on `(AIAgentID, AIAgentChannelID)`.

#### 2.3 `AIVoiceProfile` — portable persona

Lets a voice survive a provider swap.

| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier | PK |
| `Name` | nvarchar | e.g. "Sage Default", "Customer Service Warm" |
| `Description` | nvarchar(max) | |
| `LanguageCode` | nvarchar | BCP-47 (`en-US`, `es-ES`, …) |
| `StyleHint` | nvarchar(max), nullable | Free-form style/role/tone — provider-neutral |
| `SampleAudioURL` | nvarchar, nullable | For providers that support voice cloning from a sample |
| `ProviderOverridesJSON` | nvarchar(max), nullable | `{ "elevenlabs": { "voiceId": "...", "stability": 0.5 }, "cartesia": { ... } }` — provider-specific knobs |
| standard MJ audit columns | | |

#### 2.4 Touchpoints to existing entities

- **`AIAgentRun.AIAgentChannelID`** *(new column, FK, nullable)* — every run records the channel it ran over. Defaults to the `text-chat` row for existing callers.
- **`ConversationDetail.AIContentTypeID`** *(new column, FK to `MJAIModality`, nullable)* — surfaces the content type of a turn (text/audio/etc.) for replay/UX. Optional, no migration impact on existing rows.
- **`AIModelType`** seed data extended to include `STT`, `TTS`, `RealtimeSpeech` so STT/TTS/S2S providers register exactly like LLMs do today.
- **No persistent media table.** Audio is not retained by default. An agent that wants to persist a recording or transcript can write it as an action result; framework does not auto-store.

#### 2.5 Strong typing for `ConfigJSON`

`@memberjunction/ai-agent-channel-runtime` exports a discriminated union of channel-config shapes; the runtime resolves `AIAgentChannel.ConfigJSONSchemaName` to one variant and validates accordingly.

```ts
// packages/AI/AgentChannelRuntime/src/types/channel-config.ts
export type AgentChannelConfig =
  | TextChatConfig
  | VoiceCascadedConfig
  | VoiceRealtimeConfig
  | PhoneConfig
  | VideoRealtimeConfig;

export interface VoiceCascadedConfig {
  kind: 'voice-cascaded';
  stt: { aiModelId: string; languageCode?: string; partials?: boolean };
  tts: { aiModelId: string; aiVoiceProfileId?: string; firstChunkBudgetMs?: number };
  vad: { driverClass: string; sensitivity?: number };
  turnDetector: { driverClass: string };
  llm?: { aiModelId?: string };           // overrides the agent's default LLM
  latencyBudgetMs?: number;
  fillerPolicy?: { thresholdMs: number; phrases: string[] };
  bargeIn?: boolean;
}

export interface VoiceRealtimeConfig {
  kind: 'voice-realtime';
  realtime: { aiModelId: string };        // gpt-realtime, gemini-live, elevenlabs-conv, personaplex
  aiVoiceProfileId?: string;
  toolCallStrategy: 'native' | 'hand-off-to-llm';   // PersonaPlex forces hand-off
  bargeIn?: boolean;
}

export interface PhoneConfig {
  kind: 'phone';
  bridge: 'twilio-conv-relay' | 'twilio-media-streams' | 'livekit-sip';
  cascaded?: VoiceCascadedConfig;         // when bridge delivers raw audio
  // when bridge=conv-relay, Twilio handles STT/TTS — only LLM/agent config matters
}
```

The metadata UI dispatches on `kind` to render a strong-typed editor for each channel's config — same pattern as the `ConfigJSONSchemaName` field on artifact types today.

### 3. Code Architecture

#### 3.1 Package layout

```
packages/AI/Core
  └── src/generic/
        ├── baseAudio.ts                  [exists; extend with streaming methods]
        └── baseRealtimeSpeech.ts         [NEW — BaseRealtimeSpeech]

packages/AI/Providers/
  ├── ElevenLabs                          [exists for batch TTS; extend for realtime + streaming]
  ├── Deepgram                            [NEW — STT, streaming]
  ├── AssemblyAI                          [NEW — STT, streaming]
  ├── Cartesia                            [NEW — TTS, streaming]
  ├── Azure                               [NEW or extend — STT/TTS]
  ├── OpenAI                              [exists; add gpt-realtime BaseRealtimeSpeech impl]
  ├── Google                              [exists; add Gemini Live BaseRealtimeSpeech impl]
  └── PersonaPlex                         [NEW — on-prem BaseRealtimeSpeech impl]

packages/AI/Agents
  └── src/
        └── BaseAgent.ts                  [unchanged contract; additive: cancellation token, OnProgress hook]

packages/AI/AgentChannelRuntime           [NEW — the new package]
  └── src/
        ├── ChannelSession.ts             [orchestrator]
        ├── BaseChannelEngine.ts          [abstract base for engines]
        ├── engines/
        │     ├── TextChatChannelEngine.ts
        │     ├── CascadedChannelEngine.ts
        │     ├── RealtimeChannelEngine.ts
        │     ├── PhoneChannelEngine.ts
        │     └── VideoRealtimeChannelEngine.ts   [skeleton]
        ├── transports/
        │     ├── ITransportAdapter.ts
        │     ├── WebRTCTransport.ts      [LiveKit-backed; SFU swappable]
        │     ├── WebSocketTransport.ts
        │     ├── TwilioConvRelayTransport.ts
        │     ├── TwilioMediaStreamsTransport.ts
        │     └── LiveKitSIPTransport.ts
        ├── interrupt/
        │     └── InterruptChannel.ts     [first-class barge-in signal]
        ├── frames/
        │     └── frame-bus.ts            [Pipecat-style typed frame bus]
        ├── vad/
        │     ├── BaseVAD.ts
        │     ├── EnergyVAD.ts
        │     └── SileroVAD.ts
        └── turn-detector/
              ├── BaseTurnDetector.ts
              └── SemanticTurnDetector.ts

packages/MJServer
  └── imports AgentChannelRuntime; exposes WS/HTTP endpoints,
    plus LiveKit room token issuance and Twilio webhook entrypoints

packages/MJAPI
  └── imports MJServer (no direct dependency on the runtime)

packages/Angular/Generic/voice-widget     [NEW — provider-agnostic Angular voice widget]
  └── speaks the MJ channel protocol; subscribes to the existing
    GraphQL ClientToolRequest channel for client tool dispatch
```

Package name: **`@memberjunction/ai-agent-channel-runtime`**.

#### 3.2 Class registration pattern

Engines and providers are resolved from the database via `ClassFactory`, exactly matching the way `BaseLLM` providers and `ArtifactType.ToolLibraryClass` work today.

```ts
// Engine resolution
const channelRow = AIEngine.AIAgentChannels.find(c => c.ID === channelConfig.AIAgentChannelID);
const engine = MJGlobal.Instance.ClassFactory.CreateInstance<BaseChannelEngine>(
  BaseChannelEngine,
  channelRow.DriverClass            // e.g. 'CascadedChannelEngine'
);

// Provider resolution (STT/TTS/RealtimeSpeech)
const sttModel = AIEngine.AIModels.find(m => m.ID === voiceCfg.stt.aiModelId);
const stt = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAudioGenerator>(
  BaseAudioGenerator,
  sttModel.DriverClass              // e.g. 'DeepgramAudioGenerator'
);
```

Adding a new channel = insert a row, ship a class with `@RegisterClass(BaseChannelEngine, 'XYZChannelEngine')`. Adding a new provider = insert an `AIModel` row with `AIModelType=STT|TTS|RealtimeSpeech`, ship a class with `@RegisterClass(...)`.

#### 3.3 Core abstractions

```ts
// BaseRealtimeSpeech — bidirectional S2S contract
export abstract class BaseRealtimeSpeech extends BaseModel {
  abstract Connect(opts: RealtimeSpeechConnectOptions): Promise<RealtimeSpeechSession>;
}

export interface RealtimeSpeechConnectOptions {
  systemPrompt: string;
  voiceProfile?: AIVoiceProfileEntity;
  tools?: ToolDefinition[];                 // empty for tool-less S2S like PersonaPlex
  language?: string;
  contextUser: UserInfo;
  credentials?: Record<string, string>;     // pluggable; supports cloud + on-prem
}

export interface RealtimeSpeechSession {
  // Bidirectional frame channels
  sendAudio(chunk: AudioFrame): void;
  onAudio(cb: (chunk: AudioFrame) => void): void;
  onTranscript(cb: (text: string, role: 'user' | 'assistant', isFinal: boolean) => void): void;
  onToolCall(cb: (call: ToolCall) => Promise<ToolResult>): void;
  cancelCurrentResponse(): void;            // for barge-in
  close(): Promise<void>;
}
```

```ts
// BaseAudioGenerator extension (existing class, additive methods)
export abstract class BaseAudioGenerator extends BaseModel {
  // ...existing CreateSpeech / SpeechToText (batch)...

  // NEW — streaming
  TranscribeStream?(opts: StreamingSTTOptions): AsyncIterable<TranscriptEvent>;
  SynthesizeStream?(opts: StreamingTTSOptions): AsyncIterable<AudioFrame>;
  SupportsStreaming?: boolean;
}
```

```ts
// BaseChannelEngine — the per-channel turn loop
export abstract class BaseChannelEngine {
  abstract Run(ctx: ChannelRunContext): Promise<void>;
  abstract Stop(reason: ChannelStopReason): Promise<void>;
}

export interface ChannelRunContext {
  agent: BaseAgent;
  agentMetadata: AIAgentEntity;
  channelConfig: AgentChannelConfig;        // strong-typed discriminated union
  voiceProfile?: AIVoiceProfileEntity;
  transport: ITransportAdapter;
  interrupt: InterruptChannel;
  contextUser: UserInfo;
  agentRun: AIAgentRunEntity;               // already created with AIAgentChannelID set
  conversation?: ConversationEntity;
}
```

`ChannelSession` is the public entrypoint that loads metadata, merges config, picks the engine via `DriverClass`, wires the transport, and hands off to `engine.Run()`.

### 4. Forward Compatibility

Decisions baked in now so we don't pay later:

- **Engine slot is a discriminated union**, not "voice." Adding `kind: 'video-realtime'` later is one new variant + one engine class. Agent / runtime / transport / actions unchanged.
- **Internal frame bus** (Pipecat-style) — audio frames, video frames, transcript fragments, control events, and tool calls flow through one typed bus. Even if not exposed publicly, we don't shortcut it internally with audio-only structures.
- **Multi-participant** is purely a transport concern. `ITransportAdapter` accepts `participants: ParticipantStream[]`; single-participant is `[oneStream]`.
- **PersonaPlex / on-prem realtime** — `BaseRealtimeSpeech.Connect()` takes a generic `credentials` bag. On-prem WebSocket-to-self-hosted-GPU is a first-class case, not a special path.
- **Tool calling lives above the engine.** Even when the realtime model has native tool calling, tool execution routes through `BaseAgent` and the existing client-tool / action engines so logging, permissions, and audit are consistent. PersonaPlex's tool-less case is the same path with `toolCallStrategy: 'hand-off-to-llm'`.
- **Duplex cancel / barge-in** is first-class in `ChannelSession` from v1, not retrofitted. `BaseAgent` accepts an optional cancellation token — text callers ignore it, voice engines flip it on user-speech-detected.
- **`BaseAgent` contract stays text-shaped.** No audio/video knowledge in the agent. The channel runtime feeds the agent text turns (cascaded) or routes the agent's tool calls back through the realtime engine (S2S). Sage and every other agent become channel-aware via metadata only.

---

## Channel Runtime, Engines, Transports, Providers

This document covers the runtime side of the plan: how a turn flows, how engines differ, what transports look like, and how providers are wired in.

### 1. `ChannelSession` — what it does

```ts
const session = new ChannelSession({
  agentId,                            // AIAgent.ID
  channelName: 'voice-cascaded',      // matches an AIAgentChannel.Name
  configOverrides?: Partial<AgentChannelConfig>, // optional caller overrides
  transport: new WebRTCTransport({ room, participantToken }),
  contextUser,
});
await session.Run();
```

Internally, `Run()`:
1. Loads `AIAgent`, `AIAgentChannel`, `AIAgentChannelConfig` rows (existing engine caches).
2. Merges `AIAgentChannel.DefaultConfigJSON` ⊕ `AIAgentChannelConfig.ConfigJSON` ⊕ caller overrides; validates against `ConfigJSONSchemaName`.
3. Resolves `AIVoiceProfile` if present.
4. Creates an `AIAgentRun` row with `AIAgentChannelID` set.
5. Resolves the engine via `ClassFactory` from `AIAgentChannel.DriverClass`.
6. Constructs the per-run `InterruptChannel` and frame bus.
7. Hands control to `engine.Run(ctx)`.
8. On termination, finalizes the `AIAgentRun` and tears down the transport.

`ChannelSession` is the only public class consumers need.

### 2. Engines

#### 2.1 `TextChatChannelEngine`

Trivial engine — calls `BaseAgent.Run()` once per turn. Exists so text chat lives under the same metadata plumbing as voice (analytics, channel-aware permissions, future per-channel prompt overrides). Backwards compatible: existing agent invocations that don't go through `ChannelSession` continue to work; `AIAgentRun.AIAgentChannelID` defaults to the `text-chat` row.

#### 2.2 `CascadedChannelEngine`

The STT → LLM → TTS pipeline. Per-turn flow:

```
transport.audioFramesIn$
  → VAD
  → TurnDetector
  → STT.TranscribeStream() → partial + final transcript events
  → BaseAgent.Run({ text: finalTranscript, cancellationToken })
      → emits text tokens via streaming callback
      → emits tool calls (server actions or client tools — handled by existing infra)
  → TTS.SynthesizeStream(tokens$) → audio frames
  → transport.audioFramesOut$
```

Barge-in: when the VAD says the user is speaking again, `InterruptChannel.fire()` flushes downstream TTS frames, cancels the in-flight TTS request, and signals the cancellation token on `BaseAgent` so any in-progress LLM/action work aborts cleanly.

Filler policy: if a tool call exceeds `LatencyBudgetMs`, `CascadedChannelEngine` emits a configured filler phrase ("let me look that up...") via TTS while the action runs. Phrases come from `fillerPolicy.phrases`; selection is round-robin or random.

#### 2.3 `RealtimeChannelEngine`

The unified speech-to-speech path. Per-session flow:

```
realtime = new BaseRealtimeSpeech-impl()
session = realtime.Connect({ systemPrompt, voiceProfile, tools, ... })

transport.audioFramesIn$  → session.sendAudio()
session.onAudio(...)      → transport.audioFramesOut$
session.onTranscript(...) → ConversationDetail rows (best-effort)
session.onToolCall(call)  → 
   if config.toolCallStrategy === 'native':
       resolve via existing Action / ClientTool infra, return result to session
   else /* hand-off-to-llm */:
       run BaseAgent over the tool call (text path), feed result back via session.sendText()
```

`hand-off-to-llm` is the path for tool-less S2S models like PersonaPlex: the realtime model handles the spoken interaction, but anytime a tool is needed we synthesize the request as text and run a one-shot `BaseAgent` invocation to get a tool-using LLM to actually do the work.

Barge-in is delegated to `session.cancelCurrentResponse()` plus the cancellation token on `BaseAgent` for any hand-off work in flight.

#### 2.4 `PhoneChannelEngine`

Thin wrapper that routes to one of the cascaded / realtime engines based on `PhoneConfig.bridge`:

- `bridge: 'twilio-conv-relay'` → engine receives **text** turns from Twilio (Twilio handles STT/TTS); runs `BaseAgent.Run()` directly. Effectively a degenerate cascaded engine where STT/TTS are external.
- `bridge: 'twilio-media-streams'` or `'livekit-sip'` → engine receives raw audio frames; runs `CascadedChannelEngine` or `RealtimeChannelEngine` based on nested config.

This way phone is "just another transport" once Phase 1(f) is complete, but ConversationRelay is a faster ship-it path.

#### 2.5 `VideoRealtimeChannelEngine` (skeleton in Phase 1)

Placeholder class registered with `DriverClass='VideoRealtimeChannelEngine'`. Run-time throws "not yet implemented" but the metadata, config-type, and transport interface all exist. Adding the actual engine later is purely additive.

### 3. Transports — `ITransportAdapter`

```ts
export interface ITransportAdapter {
  // Inbound media from clients/phone
  audioFramesIn$: AsyncIterable<AudioFrame>;
  videoFramesIn$?: AsyncIterable<VideoFrame>;
  controlEventsIn$: AsyncIterable<ControlEvent>;

  // Outbound media to clients/phone
  sendAudioFrame(frame: AudioFrame): void;
  sendVideoFrame?(frame: VideoFrame): void;
  sendControlEvent(event: ControlEvent): void;

  // Lifecycle
  open(): Promise<void>;
  close(): Promise<void>;

  // Multi-participant (N≥1 from day one; common case is 1)
  participants: ReadonlyArray<ParticipantStream>;
  onParticipantJoin(cb: (p: ParticipantStream) => void): void;
  onParticipantLeave(cb: (p: ParticipantStream) => void): void;
}
```

#### 3.1 `WebRTCTransport` — browser & mobile

Uses LiveKit (Apache 2.0; self-hostable; LiveKit Cloud is the easy path) as the SFU. The adapter wraps a `livekit-server-sdk` room session on the server side and consumes audio tracks. Server issues short-lived participant tokens to clients (new `MJServer` GraphQL mutation `IssueChannelParticipantToken`).

LiveKit is encapsulated behind `ITransportAdapter` — swapping to mediasoup or Daily later is a transport-package replacement, not a runtime change.

#### 3.2 `WebSocketTransport` — backend↔provider

For backend-side connections to providers (gpt-realtime, ElevenLabs Conversational AI) and as a low-tier browser fallback when WebRTC isn't viable.

#### 3.3 `TwilioConvRelayTransport` — phone, easy path

Twilio handles media + STT/TTS; the adapter emits **text turns** as control events rather than audio frames. `PhoneChannelEngine` with `bridge='twilio-conv-relay'` runs the agent directly on those turns. Lowest-effort phone bridge.

#### 3.4 `TwilioMediaStreamsTransport` — phone, full control

Twilio sends μ-law 8 kHz audio over WebSocket. Transport handles codec conversion (μ-law ↔ Opus/PCM 16 kHz) so engines see standard frames. Lets us pick our own STT/TTS providers for phone.

#### 3.5 `LiveKitSIPTransport` — phone, SIP-native

LiveKit SIP ingress (Apache 2.0). PSTN-to-WebRTC bridge for direct integration with carriers. Same `ITransportAdapter` contract as `WebRTCTransport`.

### 4. Providers

All providers slot into the existing `AIModel` + `DriverClass` mechanism. The only new bits are:
- `AIModelType` seed values: `STT`, `TTS`, `RealtimeSpeech`.
- `BaseRealtimeSpeech` abstract class.
- Streaming methods on `BaseAudioGenerator`.

#### 4.1 STT (cascaded path)

| Provider | Driver class | Phase | Notes |
|---|---|---|---|
| Deepgram | `DeepgramAudioGenerator` | 1(e) | Nova-3, partials, low latency |
| AssemblyAI | `AssemblyAIAudioGenerator` | 1(e) | Universal-Streaming |
| Azure | `AzureAudioGenerator` | 1(e) | STT + TTS in one provider |
| OpenAI Whisper | `OpenAIAudioGenerator` | future | batch only currently |

#### 4.2 TTS (cascaded path)

| Provider | Driver class | Phase | Notes |
|---|---|---|---|
| ElevenLabs | `ElevenLabsAudioGenerator` | 1(e) | Flash v2.5 — ~75 ms first chunk |
| Cartesia | `CartesiaAudioGenerator` | 1(e) | Sonic — ~40-150 ms |
| Azure | `AzureAudioGenerator` | 1(e) | shared with STT |

#### 4.3 Realtime / Speech-to-Speech

| Provider | Driver class | Tool calling | Phase | Notes |
|---|---|---|---|---|
| ElevenLabs Conversational AI | `ElevenLabsRealtimeSpeech` | yes | 1(d) | parity with current CDP |
| OpenAI gpt-realtime | `OpenAIRealtimeSpeech` | yes (native) | 1(d) | WebRTC + WebSocket transports |
| Google Gemini Live | `GeminiLiveRealtimeSpeech` | yes (native) | 1(d) | WebSocket |
| NVIDIA PersonaPlex | `PersonaPlexRealtimeSpeech` | no — hand-off | 1(i) | self-hosted GPU; ~70 ms switch latency |
| Kyutai Moshi | `MoshiRealtimeSpeech` | no — hand-off | future | open-weights |

#### 4.4 LLM (cascaded path)

No change. Cascaded engine uses any existing `BaseLLM` provider via the agent's existing model-selection flow, plus optional `voice-cascaded.llm.aiModelId` override.

#### 4.5 VAD / Turn detection

| Class | Phase | Notes |
|---|---|---|
| `EnergyVAD` | 1(c) | simple energy threshold; default fallback |
| `SileroVAD` | 1(c) | small ML model; default for production |
| `SemanticTurnDetector` | 1(c) or 1(h) | transformer-based turn boundary detection (LiveKit-style) |

These are not `AIModel` rows — they're simple classes resolved by `DriverClass` string in `VoiceCascadedConfig.vad.driverClass` / `turnDetector.driverClass`. Lighter weight than full provider plumbing.

### 5. Voice Profile resolution

When an engine needs to actually drive a provider, it looks up the `AIVoiceProfile` (channel default ⊕ per-agent override) and the provider adapter maps `(LanguageCode, StyleHint, ProviderOverridesJSON[providerKey])` onto its own knobs:

- ElevenLabs: `voice_id`, `stability`, `similarity_boost`, `style`, `speaker_boost`
- Cartesia: `voice_id`, `language`, `__experimental_voice_controls`
- OpenAI gpt-realtime: `voice` enum
- PersonaPlex: text role prompt + audio voice conditioning sample

The provider-neutral fields (`LanguageCode`, `StyleHint`, `SampleAudioURL`) cover the 80% case so swapping providers doesn't require re-doing voice config. `ProviderOverridesJSON` covers the long tail.

### 6. End-to-end latency budget (target)

| Path | Budget | Notes |
|---|---|---|
| Cascaded (browser, WebRTC) | 700-900 ms | VAD ~50 + STT ~150 + LLM TTFT ~400 + TTS first chunk ~150 + net ~50 |
| Realtime S2S (gpt-realtime) | 300-500 ms | end-to-end |
| Realtime S2S (PersonaPlex) | 200-300 ms | local GPU |
| Phone (ConversationRelay) | 800-1100 ms | Twilio-internal STT/TTS adds overhead |
| Phone (Media Streams + cascaded) | 800-1000 ms | same as web cascaded plus PSTN jitter |

Budgets are soft targets, not contracts. `LatencyBudgetMs` on `AIAgentChannelConfig` triggers filler-phrase behavior past it.

### 7. Where the runtime lives

- `@memberjunction/ai-agent-channel-runtime` exports `ChannelSession`, `BaseChannelEngine`, `ITransportAdapter`, all the channel-config types, and the engines.
- `@memberjunction/server` (MJServer) imports it and exposes:
  - `IssueChannelParticipantToken` GraphQL mutation (for WebRTC clients).
  - `StartChannelSession` / `EndChannelSession` GraphQL mutations.
  - Twilio webhook HTTP entrypoints (`/channels/twilio/conv-relay`, `/channels/twilio/media-streams`).
  - LiveKit SIP webhook entrypoint when 1(f) lands.
- `@memberjunction/api` (MJAPI) imports MJServer; no direct dependency on the runtime.

Existing surfaces (Skip chat, Explorer) keep working unchanged. New voice surfaces consume `@memberjunction/voice-widget`.

---

## Tool & Action Integration

A core decision in this plan is that **voice channels reuse MJ's existing tool infrastructure unchanged**. We do not build a parallel `BaseVoiceTool` framework. Two pipelines already exist and are reused as-is:

1. **Server-side actions** — `BaseAction` + `ActionEngineServer`.
2. **Client-side tools** — `ClientToolRequestManager` + GraphQL subscription/mutation pair.

A third subsystem, **artifact tools** (`BaseArtifactToolLibrary`), is noted for future relevance but not used by the channel runtime in this plan.

### 1. Server-side actions — minor additions

`BaseAction` and the action engine work as-is. Two narrow, additive changes:

#### 1.1 `ChannelContext` on `RunActionParams`

```ts
// existing
export interface RunActionParams {
  Action: ActionEntityExtended;
  ContextUser?: UserInfo;
  Params: ActionParam[];
  Filters?: ActionFilterEntity[];
}

// extended
export interface RunActionParams {
  // ...existing fields...
  ChannelContext?: {
    channelName: string;                 // 'voice-cascaded', 'phone', etc.
    sessionId: string;                   // ChannelSession id
    conversationId?: string;
    agentRunId: string;
    agentRunStepId?: string;
    transcriptRef?: string;              // opaque handle if engine maintains transcript
    isPostCall?: boolean;
  };
}
```

Existing callers pass nothing; behavior unchanged. The channel runtime fills it in. Action authors who want channel awareness (e.g. an action that behaves slightly differently on phone vs. web) can read it; everyone else ignores it.

#### 1.2 Optional `OnProgress` hook

```ts
export interface RunActionParams {
  // ...existing fields...
  OnProgress?: (status: string, percent?: number) => void;
}
```

Long-running actions can call `params.OnProgress?.('searching customer records...')`. The cascaded engine uses these messages to drive filler TTS so the user isn't sitting in silence.

`BaseAction` itself doesn't change — these are params-level additions. Action authors who don't care about progress simply don't call the hook.

#### 1.3 What we do NOT do

- We do not add `Action.ExecutionLocation` or any "client-vs-server" flag to `BaseAction`. Client-side tools are a **separate registration**, not a flag on actions. (See section 2.)
- We do not move ElevenLabs-specific frame format, post-call webhook handling, transcript context, or session lifecycle onto `BaseAction`. Those stay in the channel runtime where they belong.

### 2. Client-side tools — reuse the existing system verbatim

MJ has a complete production client-tool pipeline in `packages/AI/Agents/src/ClientToolRequestManager.ts` (and `packages/MJServer/src/resolvers/ClientToolRequestResolver.ts`). The channel runtime plugs into it without modification.

#### 2.1 How it works today (recap)

- **Registration:** metadata-driven; tools are described by `ClientToolMetadata[]` on the agent.
- **Dispatch:** when `BaseAgent` emits a client tool call, `ClientToolRequestManager.RequestClientTool()` publishes to PubSub topic `CLIENT_TOOL_REQUEST` with `{ AgentRunID, SessionID, RequestID, ToolName, ParamsJSON, TimeoutMs, Description }`.
- **Client subscription:** clients subscribe to `ClientToolRequest(sessionID)` GraphQL subscription, execute via their `ClientToolRegistry`, and call back via the `RespondToClientToolRequest` mutation.
- **Pause/resume:** `RequestClientTool()` returns a Promise that resolves when the response arrives or the timeout fires. The agent loop awaits.
- **Runtime decoration:** clients can enrich tool definitions at session start (inject available tabs/entities/permissions) via `UpdateClientToolDefinitions`.

#### 2.2 What changes for voice

Almost nothing. The voice widget is a new GraphQL subscriber on the same channel. When it joins a `ChannelSession`, it:

1. Subscribes to `ClientToolRequest(sessionID)` with the session id from the channel session.
2. Implements `ClientToolRegistry` handlers for the tools it supports (`navigateToRecord`, `showResource`, `closeResource`, etc.).
3. Returns results via `RespondToClientToolRequest`.

That's it. The existing pipeline does the rest. Server actions and client tools coexist in the same agent run; the agent emits one or the other based on the metadata it received.

#### 2.3 Surface compatibility

This is a generic dispatch path, not a voice-only one — Skip chat in the browser already uses it. The voice widget is just another consumer. A future native mobile app would be a third consumer with the same contract.

### 3. Artifact tools — note for future, not used now

MJ's artifact-tool subsystem (`packages/AI/CorePlus/src/artifact-tool-library.ts`, `packages/AI/Agents/src/artifact-tools/`, `ArtifactToolManager.ts`) is a third execution axis: server-side, in-memory, type-driven via `ArtifactMetadataEngine`. Concrete libraries today: PDF, Excel, Docx, JSON, Text, DataSnapshot.

#### 3.1 Why we mention it

The channel runtime does **not** persist audio or video by default. But if a downstream agent (or this plan in a future phase) chooses to write a transcript or recording as an `Artifact` row, the artifact-tool subsystem becomes a free downstream surface — e.g. a "Conversation Transcript" artifact type could expose `ExtractActionItems`, `SearchTranscript`, `GenerateSummary` tools that any agent automatically gets when handed a past conversation.

#### 3.2 What we are NOT doing in this plan

- Not auto-storing audio.
- Not adding an "Audio Recording" artifact type.
- Not changing `BaseArtifactToolLibrary` or the artifact metadata engine.

This is a forward-compat note, not scope.

### 4. Tool calling across engines — the consistent picture

Whichever channel an agent runs on, tool calls are dispatched the same way:

| Source of the tool call | Path |
|---|---|
| LLM in `CascadedChannelEngine` | identical to today's text agent — `BaseAgent` invokes server actions via `ActionEngineServer`, client tools via `ClientToolRequestManager` |
| Realtime model with native tool calling (gpt-realtime, Gemini Live, ElevenLabs Conv AI) | `RealtimeChannelEngine` translates the model's tool-call frame into a `ToolCall` and dispatches via `BaseAgent` (same target as above), then returns the result to the model |
| Realtime model without tool calling (PersonaPlex) | model produces a transcript that the engine inspects; when a tool is needed, `RealtimeChannelEngine` runs a one-shot `BaseAgent.Run()` with the user transcript as input and feeds the response back to the model via `session.sendText()` |

All three paths log to `AIAgentRunStep` the same way. All three honor server-side action permissions. All three use the same client-tool subscription. Audit, security, and observability are uniform.

---

## Implementation Phases

A single deliverable for the MJ release that lights up voice/multi-modal channels feature-complete. CDP migration is **out of scope** and tackled later as its own effort. Sub-phases are sequenced for incremental verifiability — each one delivers something testable on its own.

The phases are not strict deliverable boundaries; in practice some can run in parallel (data model, transports, providers). Sequencing below reflects critical-path dependencies.

### 1(a) — Data model & metadata

**Scope.** New entities, columns, seed data, CodeGen.

**Tasks.**
- 1(a)(i) — SQL migration: create `__mj.AIAgentChannel`, `__mj.AIAgentChannelConfig`, `__mj.AIVoiceProfile`. Schema-aware extended properties for documentation.
- 1(a)(ii) — SQL migration: add `AIAgentRun.AIAgentChannelID` (FK, nullable, default = `text-chat` row id). Backfill existing rows.
- 1(a)(iii) — SQL migration: add `ConversationDetail.AIContentTypeID` (FK to `MJAIModality`, nullable).
- 1(a)(iv) — SQL migration: extend `AIModelType` seed with `STT`, `TTS`, `RealtimeSpeech` rows.
- 1(a)(v) — Seed `AIAgentChannel` rows: `text-chat`, `voice-cascaded`, `voice-realtime`, `phone`, `video-realtime`. Set `DriverClass` and `ConfigJSONSchemaName`.
- 1(a)(vi) — CodeGen run; produce `MJAIAgentChannelEntity`, `MJAIAgentChannelConfigEntity`, `MJAIVoiceProfileEntity`.
- 1(a)(vii) — Permission provider entries for the new entities.
- 1(a)(viii) — Explorer form scaffolding for the three entities (generated forms are sufficient initially; rich `ConfigJSON` editor lands in 1(g)).

**Deliverable.** Tables exist, generated entities import cleanly, an admin can manually insert an `AIAgentChannelConfig` row for an agent.

### 1(b) — Core abstractions

**Scope.** New base classes in `@memberjunction/ai`; channel runtime package skeleton; non-breaking `BaseAgent` additions.

**Tasks.**
- 1(b)(i) — `BaseRealtimeSpeech` abstract class in `packages/AI/Core/src/generic/baseRealtimeSpeech.ts`. Add to `index.ts` exports.
- 1(b)(ii) — Streaming methods on `BaseAudioGenerator` (`TranscribeStream`, `SynthesizeStream`, `SupportsStreaming`). Default impls throw "not supported"; existing batch behavior unchanged.
- 1(b)(iii) — Cancellation token support on `BaseAgent.Run()`. Optional param, default no-op for text callers.
- 1(b)(iv) — `OnProgress` hook on `RunActionParams`. Default no-op.
- 1(b)(v) — `ChannelContext` field on `RunActionParams`. Default undefined.
- 1(b)(vi) — Create `packages/AI/AgentChannelRuntime/` package skeleton: `package.json`, `tsconfig.json`, empty `index.ts`, `BaseChannelEngine.ts`, `ChannelSession.ts` (skeleton), type files for `AgentChannelConfig` discriminated union.
- 1(b)(vii) — Frame-bus types (`AudioFrame`, `VideoFrame`, `ControlEvent`, `ToolCallFrame`, `TranscriptFrame`).
- 1(b)(viii) — `InterruptChannel` class.

**Deliverable.** Package compiles. `BaseAgent` regression tests pass unchanged. Channel runtime imports and exposes empty `ChannelSession.Run()` (throws "no engine").

### 1(c) — Cascaded engine + WebRTC + WebSocket transports

**Scope.** First end-to-end working channel: voice-cascaded over WebRTC.

**Tasks.**
- 1(c)(i) — `ITransportAdapter` interface and `WebRTCTransport` (LiveKit-server-sdk-backed). Token issuance helper.
- 1(c)(ii) — `WebSocketTransport`.
- 1(c)(iii) — `BaseVAD` + `EnergyVAD` + `SileroVAD` (Silero via ONNX runtime).
- 1(c)(iv) — `BaseTurnDetector` + simple silence-based default.
- 1(c)(v) — `CascadedChannelEngine`:
  - assemble pipeline from config
  - drive STT → BaseAgent → TTS streams
  - integrate `InterruptChannel` for barge-in
  - filler-policy logic for `LatencyBudgetMs`
- 1(c)(vi) — `TextChatChannelEngine` (trivial — calls `BaseAgent.Run()` once); makes existing text agents formally channel-aware.
- 1(c)(vii) — `ChannelSession.Run()` end-to-end: load metadata, merge config, resolve engine via `ClassFactory`, run.
- 1(c)(viii) — `MJServer` GraphQL: `IssueChannelParticipantToken`, `StartChannelSession`, `EndChannelSession`.

**Deliverable.** With one STT and one TTS provider stubbed (mock), a developer can start a channel session, speak via a test client, and hear synthesized agent response. Barge-in works.

### 1(d) — Realtime engine

**Scope.** Speech-to-speech path as a peer of cascaded.

**Tasks.**
- 1(d)(i) — `RealtimeChannelEngine` orchestrator.
- 1(d)(ii) — `toolCallStrategy: 'native'` path: receive realtime model's tool calls → dispatch via `BaseAgent` (server actions + client tools) → return result.
- 1(d)(iii) — `toolCallStrategy: 'hand-off-to-llm'` path: detect tool need from transcript or model signal → run one-shot `BaseAgent` over user text → feed response back via `session.sendText()`.
- 1(d)(iv) — Barge-in via `session.cancelCurrentResponse()` + cancellation token on hand-off agent run.

**Deliverable.** With one realtime provider (1(e) below) wired in, voice-realtime channel works end-to-end; tool calls are honored; PersonaPlex-style tool-less providers are usable via hand-off (verified in 1(i)).

### 1(e) — Provider plug-ins

**Scope.** Concrete providers implementing the new abstractions. Multi-provider day-one. Each provider is its own package.

**Tasks.**
- 1(e)(i) — `@memberjunction/ai-deepgram` — `DeepgramAudioGenerator` implements `TranscribeStream`. Streaming partials + finals.
- 1(e)(ii) — `@memberjunction/ai-assemblyai` — `AssemblyAIAudioGenerator` implements `TranscribeStream` (Universal-Streaming).
- 1(e)(iii) — `@memberjunction/ai-cartesia` — `CartesiaAudioGenerator` implements `SynthesizeStream` (Sonic).
- 1(e)(iv) — Extend `@memberjunction/ai-elevenlabs` (or create if absent): `SynthesizeStream` (Flash v2.5) + `ElevenLabsRealtimeSpeech` implementing `BaseRealtimeSpeech` for Conv AI.
- 1(e)(v) — `@memberjunction/ai-azure-speech` — `AzureAudioGenerator` for STT + TTS.
- 1(e)(vi) — Extend OpenAI provider: `OpenAIRealtimeSpeech` implementing `BaseRealtimeSpeech` for `gpt-realtime` (WebRTC + WebSocket transports).
- 1(e)(vii) — Extend Google provider: `GeminiLiveRealtimeSpeech` implementing `BaseRealtimeSpeech`.
- 1(e)(viii) — Seed `AIModel` rows for each provider with the right `AIModelType` and `DriverClass`.

**Deliverable.** Cascaded engine works with Deepgram+Cartesia, Deepgram+ElevenLabs, AssemblyAI+Azure, etc. Realtime engine works with gpt-realtime, Gemini Live, ElevenLabs Conv AI. All swappable purely by metadata.

### 1(f) — Phone bridge

**Scope.** Full phone support, three transports, ConversationRelay shipping first.

**Tasks.**
- 1(f)(i) — `TwilioConvRelayTransport`. `MJServer` Twilio webhook entrypoints. `PhoneChannelEngine` `bridge='twilio-conv-relay'` path: text turns → `BaseAgent.Run()` directly.
- 1(f)(ii) — `TwilioMediaStreamsTransport`. μ-law 8 kHz ↔ Opus/PCM 16 kHz codec conversion in the adapter. `PhoneChannelEngine` routes to nested cascaded or realtime engine.
- 1(f)(iii) — `LiveKitSIPTransport`. SIP ingress + room mapping. Same path as Media Streams thereafter.
- 1(f)(iv) — Phone-number-to-agent routing metadata (lightweight; could be config or a small new table — decided in 1(a) follow-up).

**Deliverable.** A configured phone number rings, the agent answers, holds a conversation, hangs up. Verified across all three bridge options.

### 1(g) — Voice widget (Angular)

**Scope.** Provider-agnostic Angular component that speaks the MJ channel protocol.

**Tasks.**
- 1(g)(i) — Create `packages/Angular/Generic/voice-widget` package.
- 1(g)(ii) — Mic/speaker handling (Web Audio API + WebRTC client).
- 1(g)(iii) — LiveKit client SDK wired against the MJ token endpoint.
- 1(g)(iv) — GraphQL subscription to `ClientToolRequest(sessionID)`; `ClientToolRegistry` for in-widget handlers; mutation `RespondToClientToolRequest`.
- 1(g)(v) — Strong-typed `ConfigJSON` editor for `AIAgentChannelConfig` Explorer form (reads `ConfigJSONSchemaName`, dispatches on `kind` to render the right editor).
- 1(g)(vi) — Default styles, mute/end-call controls, transcript display.

**Deliverable.** A consumer Angular app can drop in `<mj-voice-widget [agentId]="..." [channelName]="voice-cascaded">` and have a working voice conversation. Widget is provider-agnostic — switching the agent's channel config from ElevenLabs to gpt-realtime requires zero widget changes.

### 1(h) — Forward-compat scaffolding

**Scope.** Lay the rails for video, multi-participant, and on-prem without delivering the full features.

**Tasks.**
- 1(h)(i) — `VideoFrame` type wired through `ITransportAdapter` (audio-only paths ignore it).
- 1(h)(ii) — `participants: ParticipantStream[]` everywhere it appears; default `[oneStream]` for current code paths; verify nothing assumes single-participant.
- 1(h)(iii) — `VideoRealtimeChannelEngine` skeleton class registered with `DriverClass='VideoRealtimeChannelEngine'`; `Run()` throws "not yet implemented." `video-realtime` row exists in `AIAgentChannel`.
- 1(h)(iv) — `BaseRealtimeSpeech.Connect()` `credentials: Record<string,string>` bag; verify on-prem (no API key) is a viable path with a test stub.
- 1(h)(v) — `SemanticTurnDetector` (transformer-based) — improves cascaded experience now, also stress-tests the pluggability.

**Deliverable.** Adding a real video engine, a real on-prem provider, or a multi-participant scenario is purely additive. No core changes required for those follow-ons.

### 1(i) — On-prem realtime provider (PersonaPlex)

**Scope.** Prove out the on-prem realtime path with the only meaningful tool-less S2S provider in scope.

**Tasks.**
- 1(i)(i) — `@memberjunction/ai-personaplex` — `PersonaPlexRealtimeSpeech` implementing `BaseRealtimeSpeech`. WebSocket connection to a self-hosted GPU service.
- 1(i)(ii) — Validate `toolCallStrategy: 'hand-off-to-llm'` end-to-end: PersonaPlex handles voice; tool needs trigger one-shot `BaseAgent` runs; results flow back as text.
- 1(i)(iii) — Persona/voice mapping: PersonaPlex's text role prompt + audio voice conditioning sample → mapped from `AIVoiceProfile.StyleHint` + `SampleAudioURL`.
- 1(i)(iv) — Documentation on how to deploy an on-prem PersonaPlex service alongside MJ.

**Deliverable.** A self-hosted PersonaPlex GPU service can be added to an `AIModel` row, assigned to an agent's `voice-realtime` config, and Sage talks to a user via on-prem audio with tool calls hand-off-routed to the cloud LLM.

---

### What's left for a future MJ release (explicitly not in this plan)

- CDP migration from `VoiceServer` / `VoiceTools` / `CustomVoiceTools` onto MJ channel runtime.
- Audio recording / transcript persistence as an `Artifact` type with associated tool library.
- Real `VideoRealtimeChannelEngine` implementation.
- Multi-party voice rooms (multiple human participants in one session).
- Per-agent prompt overrides keyed by channel (e.g. shorter prompts for voice).
- Browser audio post-processing (noise suppression beyond what WebRTC provides, voice cloning UX).

---

## Open Questions

Decisions that affect implementation but not architecture. None of these block writing the code; all should be locked before 1(c) ships.

### 1. LiveKit deployment model for v1

**Question.** Self-host SFU vs. LiveKit Cloud vs. neither (let each MJ deployment choose).

**Recommendation.** Ship the abstraction (SFU is behind `ITransportAdapter`), bundle a working **self-hosted LiveKit docker-compose recipe** in the runtime package's docs, and document **LiveKit Cloud** as the easy path. No hard dependency either way. LiveKit is Apache 2.0 end-to-end (server, Agents, SIP), so customers can self-host without fees.

**Decision needed by.** End of 1(c).

### 2. Phone-number-to-agent routing metadata

**Question.** How does an inbound phone call find the right agent?

Options:
- (a) Lightweight config on the Twilio webhook entrypoint — phone number → agent ID lookup table in JSON.
- (b) New small entity `AIAgentPhoneRoute` (`PhoneNumber` → `AIAgentID` + `AIAgentChannelConfigID`).
- (c) Reuse `AIAgentChannelConfig` with an inbound-phone-number column.

**Recommendation.** (b) — small dedicated table. Cleaner than overloading existing entities, supports per-route overrides (greeting, IVR-style routing), and avoids fragile config files for production phone numbers.

**Decision needed by.** Start of 1(f).

### 3. Where does `MediaArtifact`-style storage live IF a future phase adds it

**Question.** This plan does not persist audio. But if a future phase does, where does the blob live?

Options:
- (a) Use existing MJ file-storage abstraction (S3/Azure Blob behind a provider class) and keep refs in `Artifact` / `ArtifactVersion`.
- (b) DB BLOB column (bad for large media).
- (c) New media-only storage abstraction.

**Recommendation.** (a) — reuse the existing file-storage abstraction with a new `ArtifactType` row ("Conversation Recording"). Gets versioning, tool-library hookability, and consistent UX for free.

**Decision needed by.** N/A for this plan; relevant if the follow-on persistence work is approved.

### 4. Default VAD / turn detector

**Question.** Which VAD ships as the default in seed data?

Options:
- (a) `EnergyVAD` — simple, no model download, lower quality.
- (b) `SileroVAD` — small ONNX model, higher quality, pulls a binary asset.

**Recommendation.** Default to `SileroVAD` for production-quality experience; keep `EnergyVAD` as a fallback for environments that can't load ONNX.

**Decision needed by.** End of 1(c).

### 5. How aggressive to be about replacing existing text-chat invocations with `ChannelSession`

**Question.** Existing text-agent callers do not go through `ChannelSession` today. Do we (a) leave them alone, (b) gently route them through `TextChatChannelEngine`, or (c) require it eventually?

**Recommendation.** (a) for this plan — `ChannelSession` is opt-in. `AIAgentRun.AIAgentChannelID` defaults to the `text-chat` row for any direct `BaseAgent.Run()` caller so analytics still works. Forcing migration is a future cleanup.

**Decision needed by.** Doc decision before 1(c) ships, no code impact.

### 6. Naming of the new `AIVoiceProfile` table when video lands

**Question.** When video-realtime lands, do we want a generic `AIPersonaProfile` (covers voice + visual style) or keep `AIVoiceProfile` and add a sibling?

**Recommendation.** Keep `AIVoiceProfile` for now; revisit when video work starts. A sibling `AIVisualPersonaProfile` is fine and avoids overloading a voice-named table with avatar/face fields.

**Decision needed by.** Future video phase, not this plan.

### 7. Cancellation token shape on `BaseAgent.Run()`

**Question.** Web-platform `AbortSignal` vs. an MJ-specific cancellation token.

**Recommendation.** `AbortSignal` — universal, works in browser and Node, plays well with `fetch` and most providers' SDKs. Less invented vocabulary.

AN Notes - we use AbortSignal elsewhere, should use for this too!

**Decision needed by.** End of 1(b).