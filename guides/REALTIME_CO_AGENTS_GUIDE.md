# Real-Time Co-Agents Guide

How MemberJunction delivers **live, low-latency, full-duplex agents** — agents you talk to the way you talk to a person, that can draw on a shared whiteboard while they speak, and that delegate real work back to the async agents you already have.

This is the developer guide for the whole stack: the model primitive, the `Realtime` agent type, the Realtime Co-Agent, the dual-topology session architecture, the session/channel persistence layer, the interactive-channel plugin system (with the live Whiteboard as the canonical implementation), narration, observability, and security.

**Companion documents:**

- [`plans/ai-agent-sessions.md`](../plans/ai-agent-sessions.md) — the original architecture plan (Part I: realtime capability, Part II: session/channel infrastructure). This guide documents what actually shipped; the plan retains the rationale and the deferred tracks.
- [`packages/AI/RealtimeClient/README.md`](../packages/AI/RealtimeClient/README.md) — the browser-side driver package (`BaseRealtimeClient` + the OpenAI / Gemini / ElevenLabs / AssemblyAI client drivers and the shared PCM audio plane).
- [`packages/AI/Agents/README.md`](../packages/AI/Agents/README.md) — the agent framework, including how `RealtimeAgentType` sits beside Loop and Flow.
- [`packages/Angular/Generic/whiteboard/README.md`](../packages/Angular/Generic/whiteboard/README.md) — `@memberjunction/ng-whiteboard`, the extracted generic whiteboard package (state engine, agent tool API, components, exports). The conversations package consumes it as a thin channel plugin.
- [`guides/TRANSPORT_LAYER_ARCHITECTURE_GUIDE.md`](TRANSPORT_LAYER_ARCHITECTURE_GUIDE.md) — the engine → resolver → client layering the realtime resolvers follow.

---

## Table of Contents

1. [The Concept: Co-Agents](#1-the-concept-co-agents)
2. [The Triple-Registry Plugin Architecture](#2-the-triple-registry-plugin-architecture)
3. [Topologies: Client-Direct vs Server-Bridged](#3-topologies-client-direct-vs-server-bridged)
4. [Session Lifecycle](#4-session-lifecycle)
5. [Channels — The Heart of the System](#5-channels--the-heart-of-the-system)
6. [Future Channel Types (Envisioned)](#6-future-channel-types-envisioned)
7. [Progress Narration](#7-progress-narration)
8. [Observability & Administration](#8-observability--administration)
9. [Security Model](#9-security-model)
10. [Known Gaps & Deferred Work](#10-known-gaps--deferred-work)
11. [Audio-Reactive Call Visuals](#11-audio-reactive-call-visuals-audio-activity-metering)

---

## 1. The Concept: Co-Agents

### Real-time is a complement, not a replacement

MJ agents are **asynchronous by design**: a request arrives, an `AIAgentRun` does its work over seconds to minutes, results come back. That is exactly right for substantive work, and Loop/Flow agents are untouched by the realtime feature. What async agents cannot do is hold a *natural, low-latency conversation* — modern realtime stacks (GPT Realtime, Gemini Live, ElevenLabs Agents, AssemblyAI Voice Agent) own the listen-reason-speak loop themselves, with provider-side voice activity detection, barge-in, and sub-second turn taking.

So instead of forcing the loop agent to drive a live call, MJ adds a **third agent type — `Realtime`** — a first-class peer of Loop and Flow (`RealtimeAgentType` in `packages/AI/Agents/src/agent-types/realtime-agent-type.ts`, registered as `@RegisterClass(BaseAgentType, "RealtimeAgentType")`, seeded in `metadata/agent-types/` with `DriverClass: "RealtimeAgentType"`). A Realtime agent does not iterate a reasoning loop; it wraps a long-lived duplex model session. The marker is `RealtimeAgentType.IsSessionDriven` (always `true`); `BaseAgent.isSessionDrivenAgentType()` duck-types that getter and branches into `executeRealtimeSession()` instead of the loop.

### One co-agent voices ANY agent

The first (and seeded) agent of this type is the **Realtime Co-Agent** (`metadata/agents/.voice-co-agent.json` — the agent was renamed from the original *Voice Co-Agent*; the seed file keeps its legacy filename, the `Name` field is `Realtime Co-Agent`). It is deliberately generic: it is the live voice **for** a *target* agent, and the target is a **runtime parameter**, not configuration baked into the co-agent. One Realtime Co-Agent definition fronts Sage, Query Builder, or anything else — agents gain voice by configuration, never by being rewritten.

Three design rules make this work:

1. **The realtime-registered tool set is stable and target-independent.** Every voice session registers the single `invoke-target-agent` tool (`INVOKE_TARGET_AGENT_TOOL_NAME` in `packages/AI/Agents/src/realtime/realtime-tool-broker.ts`) plus fixed UI/channel tools. The target is an argument *inside* that one tool; target-specific capabilities execute inside the delegated agent's own run and are never registered on the provider socket. This keeps the provider contract identical across targets — and it is exactly what let the **ElevenLabs Agents** driver (a pre-provisioned, server-side-agent provider) fit the same model: its managed agent is created once with the stable tool set and reused across sessions (see [§2](#2-the-triple-registry-plugin-architecture)).
2. **Companion framing, never impersonation.** The system prompt (the `Realtime Co-Agent - System Prompt` row in `metadata/prompts/` — its template file retains the legacy name `templates/Voice Co-Agent - System Prompt.template.md`) frames the model as "the live voice for the agent" — first-person, owning the work ("I'm pulling that up"), never "pretend to be X" (which makes models refuse) and never third-person ("Sage is working on it").
3. **Delegation is a normal agent run.** When the co-agent invokes the target, that is a full `AIAgentRun`, linked to the co-agent's run via `ParentRunID` and stamped with the shared `AgentSessionID` — the delegation tree is fully visible in standard observability.

### The co-agent resolution chain

Which Realtime-type agent voices a given target is resolved at session start by `RealtimeClientSessionResolver.resolveCoAgentID()` (`packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`). **First match wins:**

| Step | Source | On invalid candidate |
|---|---|---|
| 1 | Runtime `coAgentId` argument on `StartRealtimeClientSession` | **Throws** (fail loud — the caller asked for something specific) |
| 2 | Target agent's `AIAgent.DefaultCoAgentID` (per-agent persona) | Logs a warning, **falls through** (metadata drift must degrade, not break calls) |
| 3 | Target agent's type's `AIAgentType.DefaultCoAgentID` (per-type default) | Logs a warning, **falls through** |
| 4 | The seeded **`Realtime Co-Agent`**, looked up by name (falls back to the deprecated legacy name `Voice Co-Agent` with a deprecation log, for deployments that haven't re-synced the renamed seed) | Throws when both names are absent (the realtime feature is unconfigured in this deployment) |

Every candidate from steps 1–3 is validated by `findValidCoAgent()`: it must exist in `AIEngine`'s cached agents, have `Status = 'Active'`, and be of the `Realtime` agent type. The two `DefaultCoAgentID` columns were added by migration `migrations/v5/V202606090930__v5.41.x__AI_Agent_Sessions_Channels.sql`.

This chain is how deployments give individual agents a distinct voice persona (a different co-agent with a different prompt/voice) without touching code or the global seed.

Two further metadata layers refine *which target a co-agent fronts* and *how it sounds/behaves* — **pairing rows** and the **effective configuration** merge. Both are opt-in with zero-config defaults identical to the pre-feature behavior; see [§4 — Co-agent pairing & effective configuration](#co-agent-pairing--effective-configuration).

---

## 2. The Triple-Registry Plugin Architecture

Realtime is pluggable along **three independent axes**, all resolved through `MJGlobal.ClassFactory` + metadata. Nothing in the hosts (the session runner, the resolver, the Angular overlay) names a concrete provider or channel. The third axis — interactive channels — has **two halves**, one base class per side of the wire, resolved from the same registry row:

| Registry | Base class | ClassFactory key comes from | Shipped implementations |
|---|---|---|---|
| **Server model drivers** | `BaseRealtimeModel` (`packages/AI/Core/src/generic/baseRealtime.ts`) | `MJ: AI Model Vendors.DriverClass` on a model of `AIModelType = 'Realtime'` | `OpenAIRealtime` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts`), `GeminiRealtime` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts`), `ElevenLabsRealtime` (`packages/AI/Providers/ElevenLabs/src/elevenLabsRealtime.ts`), `AssemblyAIRealtime` (`packages/AI/Providers/AssemblyAI/src/assemblyAIRealtime.ts`) |
| **Client model drivers** | `BaseRealtimeClient` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`) | `ClientRealtimeSessionConfig.Provider` — the string the server driver stamps when it mints (`'openai'`, `'gemini'`, `'elevenlabs'`, `'assemblyai'`) | `OpenAIRealtimeClient`, `GeminiRealtimeClient`, `ElevenLabsRealtimeClient`, `AssemblyAIRealtimeClient` (same package) |
| **Channel plugins — client half** | `BaseRealtimeChannelClient` (`packages/Angular/Generic/conversations/src/lib/components/realtime/channels/base-realtime-channel-client.ts`) | `MJ: AI Agent Channels.ClientPluginClass` | `RealtimeWhiteboardChannel` (key `'RealtimeWhiteboardChannel'`) — a thin plugin over `@memberjunction/ng-whiteboard` |
| **Channel plugins — server half** | `BaseRealtimeChannelServer` (`packages/AI/Core/src/generic/baseRealtimeChannelServer.ts`), resolved per session by `RealtimeChannelServerHost` (`packages/AI/Agents/src/realtime/realtime-channel-server-host.ts`) | `MJ: AI Agent Channels.ServerPluginClass` | `WhiteboardChannelServer` (key `'WhiteboardChannelServer'`, in `@memberjunction/ai-agents`) — validates/canonicalizes the board's persisted state of record |

Server model drivers are resolved by `BaseAgent.resolveRealtimeModel()` (server-bridged) and `RealtimeClientSessionService.resolveVendorAndInstantiate()` (client-direct): highest-`PowerRank` active `Realtime` model → highest-`Priority` active vendor whose `DriverClass` has a resolvable API key (`GetAIAPIKey`, e.g. `AI_VENDOR_API_KEY__OpenAIRealtime`) → `ClassFactory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, driverClass, apiKey)`. An explicit `preferredModelId` bypasses ranking and **fails with a specific reason** rather than silently falling back (`resolvePreferredRealtimeModel`).

Client model drivers are resolved in `VoiceSessionService.createRealtimeClient()` by the server-reported `Provider` key. Channel plugins are resolved in `VoiceSessionService.loadActiveChannels()` from the active `MJ: AI Agent Channels` rows.

> [!NOTE]
> The channel registry is the one registry with **two halves**: each row carries both a `ClientPluginClass` (resolved in the browser by `VoiceSessionService`) and a `ServerPluginClass` (resolved server-side by `RealtimeChannelServerHost` when `SessionManager.CreateSession` mints the session — one fresh instance per session, exactly mirroring the client half's resolution: ACTIVE rows only, ClassFactory registration checked first, unregistered keys skipped with a log, never fatal). The server half's lifecycle hooks are the durable session events — session started, channel state saved (pre-persistence, with normalization power), session closed (any provenance) — see [§5](#5-channels--the-heart-of-the-system) for the full contract. The registry also carries a `TransportType` (`PubSub` / `WebRTC` / `WebSocket`) for the future media-plane work.

### The four-provider capability matrix

The base contracts are deliberately tolerant of provider asymmetry: several members are **optional capabilities** (`SendContextNote` / `RequestSpokenUpdate` / `OnClose` on `IRealtimeSession`) or **may simply never fire** (`OnUsage`). Where a provider lacks a native channel, the driver either emulates it (documented per driver) or omits it — hosts feature-detect, never assume. What actually ships, verified per driver:

| Capability | **OpenAI** (`'openai'`) | **Gemini** (`'gemini'`) | **ElevenLabs Agents** (`'elevenlabs'`) | **AssemblyAI Voice Agent** (`'assemblyai'`) |
|---|---|---|---|---|
| Client transport | WebRTC (mic track + `oai-events` data channel) | WebSocket (`@google/genai` Live SDK) | WebSocket (raw Agents protocol) | WebSocket (raw Voice Agent protocol) |
| Mint style | Client secret with the full session config (instructions + tools) **baked in** | Ephemeral token locking the mask-safe generation subset (`liveConnectConstraints`) | **Signed URL** *is* the credential (`wss://…&token=…`, ~15-min open window); agent ensured server-side first | **One-time** temp token (`GET /v1/token`, 300 s connect window) |
| What the token locks | Prompt + tools + transcription (tamper-proof) | Model + generation params only — prompt/tools ride the driver-applied `SessionConfig` | Agent identity; the prompt rides the `conversation_initiation_client_data` override (enabled on the managed agent); tools are bound to the server-side agent config | Nothing beyond auth — the whole session object rides the driver-applied first `session.update` frame |
| Transcripts | Interim **deltas** + finals, both roles | Interim **deltas** + finals, both roles | **Finals only**, both roles; `agent_response_correction` re-finalizes a barged-in turn with what was actually spoken | User turns: deltas + final; agent turns: **final only** (post-barge-in final carries the truncated text — no correction event) |
| `SendContextNote` | Emulated (conversation-item injection without a response trigger) | Emulated (`turnComplete: false` client content) | **Native** — `contextual_update`, the platform's purpose-built non-interrupting channel; sent even mid-response | Emulated via the **mutable `system_prompt`** — notes accumulate under a "Background updates" heading and the full prompt is re-sent via `session.update` |
| `RequestSpokenUpdate` | Native-ish (`response.create` with per-response instructions) | Emulated (instruction turn via **realtime text** — `sendRealtimeInput({ text })`; mid-call `sendClientContent` is history-seeding-only on native-audio models and never triggers generation), queued behind in-flight responses | **Emulated** as a `user_message` turn (queued; fidelity caveat — the model may reference "you asked me for an update") | **Native** — `reply.create` carries per-response instructions (queued behind in-flight replies) |
| `SendText` (typed input) | Native user-item injection | Realtime-text turn (`sendRealtimeInput({ text })` — same native-audio caveat as `RequestSpokenUpdate`) | Native `user_message` (takes the floor server-side) | **Emulated** via `reply.create` instructions — the protocol has no typed-user-input event; best-effort fidelity |
| Cancel (`CancelActiveResponse`) | Wire-level `response.cancel` + local flush | Local playout flush (client owns the audio plane) | No cancel frame — local playout flush; residual server generation is simply never played | No cancel frame — local flush **plus suppression** of residual `reply.audio` frames until the next reply boundary |
| Mid-session `RegisterTools` | Idempotent re-declare via `session.update` | Connect-bound (the `StartSession` params path is the only effective one) | **Cannot** re-declare on an open conversation — identical set no-ops, a different set warns and is ignored (next session picks it up via the ensure flow) | **Native** re-declare — `tools` is a mutable `session.update` field |
| Usage events (`OnUsage`) | Per-response deltas from `response.done.usage` | Per-turn deltas from `usageMetadata` | **None** — the Agents socket reports no token usage (platform-side accounting) | **None** — flat per-session-hour billing; the terminal `session.ended` frame carries duration seconds only |
| Server-side object to manage | None | None | **Managed agent** — `ensureAgent()`: find-by-name → create-if-missing → PATCH on tool-fingerprint drift / missing prompt-override enablement; cached per name + fingerprint | None — pure per-session config |
| Audio format (client driver) | Provider-negotiated via WebRTC | PCM16 16 kHz up / 24 kHz down | PCM16 at rates **negotiated from the initiation metadata** (`pcm_<rate>`, default 16 kHz; non-PCM telephony formats degrade loudly) | PCM16 **fixed 24 kHz** both directions |

Two cross-cutting notes on the websocket-audio drivers (ElevenLabs, AssemblyAI): they share the browser audio plane in `packages/AI/RealtimeClient/src/audio/` (`createPcmMicCapture` worklet capture, `RealtimePcmPlayback` playhead-clock playout, `pcmUtils`) — `IsAudioPlaying` is computed from the locally-owned playout clock. And both must send `session.end`-style teardown correctly: AssemblyAI's `Close()` sends `session.end` before closing the socket, because skipping it leaves the session in a **billable 30-second resume hold**.

### Driver-author obligations (read before writing a driver)

Both base classes carry an explicit **"DRIVER AUTHOR OBLIGATIONS"** block in their doc headers — `BaseRealtimeModel` (`packages/AI/Core/src/generic/baseRealtime.ts`) for server drivers, with the client-side mirror on `BaseRealtimeClient` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`). Those blocks are the authoritative list (8 numbered rules each, paid for in live debugging). Summarized:

1. **Silent exit from "speaking" on tool-call emission** — don't clobber the host's busy indicator with trailing turn frames.
2. **Release the busy flag when a tool call is emitted** — otherwise `SendToolResult` deadlocks waiting on a turn boundary that never arrives.
3. **Flush playback + report `IsAudioPlaying = false` promptly on barge-in** — stale queued audio after an interruption is a product bug.
4. **Text injection must not echo a user transcript** — the host owns the local echo; a synthesized user-role event renders the message twice.
5. **Every tool result must EVENTUALLY be voiced and never dropped** — queue the generation trigger behind an in-flight response if the provider rejects overlaps.
6. **Credential expiry surfaces as a `Fatal: true` `OnError`** — never idle forever on a dead socket.
7. **Report "ready/listening" only after the server-built session config has been applied** — early turns must not run against an unconfigured model.
8. **`SessionConfig` is a private pact** between same-keyed server and client driver halves — hosts and intermediaries treat it as an opaque blob.

Additional contract points on `IRealtimeSession`: `RegisterTools` must be **idempotent** for a set identical to the connect-time set; `OnInterruption` fires on **true barge-in only** (user speech over *active* model output, not every utterance); `SendContextNote` / `RequestSpokenUpdate` / `OnClose` are **optional capability members** — callers feature-detect, and drivers whose provider can't support them omit them entirely.

### Recipe: add a new realtime provider

1. **Server driver.** In the provider's package (`packages/AI/Providers/<X>`), implement `BaseRealtimeModel.StartSession()` returning an `IRealtimeSession`, and register it: `@RegisterClass(BaseRealtimeModel, '<X>Realtime')`. Build against an injectable connection seam (see `IOpenAIRealtimeConnection`, `GeminiLiveSession`, `ElevenLabsRealtimeSocket`, `AssemblyAIRealtimeSocket`) so unit tests can drive provider-shaped frames with no network — all four drivers ship extensive vitest suites this way.
2. **Client-direct support (optional).** Override `SupportsClientDirect` to `true` and implement `CreateClientSession()` to mint an ephemeral credential + provider-native `SessionConfig`, stamping a unique `Provider` key. The credential doesn't have to be a token: ElevenLabs mints a **signed websocket URL**; AssemblyAI mints a **one-time temp token** via a REST call.
3. **Client driver.** In `@memberjunction/ai-realtime-client`, extend `BaseRealtimeClient`, register under the same `Provider` key (`@RegisterClass(BaseRealtimeClient, '<x>')`), export a `Load<X>RealtimeClient()` no-op, and have hosts call it (the existing Load calls live at the top of `voice-session.service.ts` — tree-shaking prevention). If the audio plane is a raw websocket (not WebRTC), reuse the shared `src/audio/` pipeline (`createPcmMicCapture` + `RealtimePcmPlayback`) instead of writing capture/playout again.
4. **Metadata.** Add the `MJ: AI Models` row (`AIModelTypeID` → `Realtime` type) with an `MJ: AI Model Vendors` association carrying `DriverClass: '<X>Realtime'` and the provider `APIName`, in `metadata/ai-models/`; push with `mj sync`. Reference rows: `GPT Realtime 2` (APIName `gpt-realtime-2`), `Gemini 3.1 Flash Live` (APIName `gemini-3.1-flash-live-preview`), `ElevenLabs Agents` (APIName `MJ Realtime Co-Agent` — see the precedent below), `AssemblyAI Voice Agent` (APIName `voice-agent` — the endpoint has no model selection; the value is bookkeeping).
5. **API key.** `AI_VENDOR_API_KEY__<DriverClass>` (or the deployment's key-resolution path consumed by `GetAIAPIKey`).

No host code changes: the resolver ranks the new model by `PowerRank`/`Priority`, and the browser resolves the client driver by the minted `Provider` string.

#### Lessons from the ElevenLabs / AssemblyAI builds (read before driver #5)

Durable friction points the third and fourth drivers surfaced — they generalize to any future provider:

- **`Model`/`APIName` doesn't have to name a model.** ElevenLabs has no bare-model realtime socket — only pre-configured server-side *agents*. The driver sets the precedent: `RealtimeSessionParams.Model` carrying the `agent_` prefix is used **verbatim** as a deployment-managed agent id; any other value is the **name** of the driver-managed agent (`ensureAgent()`: find-by-name → create-if-missing with the session tool set + per-session prompt-override enablement → PATCH on tool-fingerprint drift; instance-cached). The seeded APIName is `MJ Realtime Co-Agent`. If your provider's "thing you connect to" isn't a model, map it through `Model` the same way rather than inventing config side-channels.
- **Delta-less transcript providers exist.** ElevenLabs emits whole-utterance finals only; AssemblyAI's agent turns are final-only. Host code must not assume interim deltas — the caption pipeline keys off `IsFinal`, and that discipline is what made finals-only providers drop in cleanly.
- **The post-barge-in "correction" problem.** ElevenLabs re-finalizes a barged-in assistant turn via `agent_response_correction` (the text actually spoken); AssemblyAI's final already reflects the truncation. The transcript contract has **no `Replaces` marker**, so a host persisting finals gets two assistant finals around an ElevenLabs barge-in (the original and the correction) with no machine-readable link — a known open contract gap (see [§10](#10-known-gaps--deferred-work)). Until it's closed, treat a final assistant transcript arriving immediately after an interruption as the authoritative replacement.
- **Single-frame busy boundaries.** Neither new provider has an OpenAI-style `response.created`/`response.done` envelope pair around every response. Busy state is inferred frame-by-frame (ElevenLabs: first `audio`/`agent_response` sets it, `agent_response_complete` clears it; AssemblyAI: `reply.started`/`reply.done`), and the narration `Kind` must be **stamped at send time** — there is no confirmation frame to stamp on. Tool-call frames still clear the busy flag (deadlock guard) *without* draining the queue, so a queued narration can't wedge between a tool call and its result.
- **Two-round-trip opens.** Both drivers' `Connect`/`StartSession` is a handshake, not a socket-open: open the socket → send the config frame (`conversation_initiation_client_data` / first `session.update`) → **await the provider's confirmation** (`conversation_initiation_metadata` / `session.ready`) → only then build the audio plane and report `'listening'` (obligation #7). On ElevenLabs the server side additionally spends REST round-trips *before* the socket (ensure-agent + signed-URL mint, mitigated by the fingerprint cache). Budget for this in any "time to first listening" expectations.
- **Teardown can be billable.** AssemblyAI holds a closed-without-`session.end` session in a billable 30-second resume window — `Close()`/`Disconnect()` must send the explicit end frame first.

### Recipe: add a new interactive channel

Covered in depth in [§5](#5-channels--the-heart-of-the-system); the short version:

1. Subclass `BaseRealtimeChannelClient<YourSurfaceComponent>`, implementing the channel contract (tools + perception + surface + state of record).
2. `@RegisterClass(BaseRealtimeChannelClient, '<YourClientPluginClass>')` + a `Load...()` no-op called from a static code path (the Whiteboard's is called from `conversations.module.ts`).
3. *(Optional but recommended)* Subclass `BaseRealtimeChannelServer` for the **server half** — at minimum a state-of-record guard like `WhiteboardChannelServer`'s (validate/normalize each landed save in `OnChannelStateSave`). `@RegisterClass(BaseRealtimeChannelServer, '<YourServerPluginClass>')` + a `Load...Server()` no-op called from a static server path (the Whiteboard's is called from MJServer's `agentSessions/index.ts`). A row whose server key is unregistered simply runs with no server plugin — it is never an error.
4. Seed an `MJ: AI Agent Channels` row (`Name`, `ClientPluginClass`, `ServerPluginClass`, `TransportType`, `IsActive: true`) in `metadata/ai-agent-channels/` and push with `mj sync`.
5. Done — `VoiceSessionService.startChannels()` resolves every active registry row at session start in the browser, and `RealtimeChannelServerHost` resolves the same rows' server halves when the session mints. The model gets the plugin's tools, the overlay gets a surface tab, the server gets the lifecycle hooks. The shells carry **zero** channel-specific wiring.

---

## 3. Topologies: Client-Direct vs Server-Bridged

The same tool-execution semantics run in two transport topologies. The shared piece is `RealtimeToolBroker` (`packages/AI/Agents/src/realtime/realtime-tool-broker.ts`) — both topologies route every tool call through it so results are byte-for-byte identical: `invoke-target-agent` → delegate (with a broker-owned per-call `AbortController` — fired by barge-in on the server-bridged path, and by the **explicit** cancel channel on the client-direct path), everything else → the injected tool executor; failures serialize to `{ success: false, error }` so the model can *narrate* failures instead of going silent.

### Decision table

| | **Client-direct** (shipped MVP, drives Explorer voice) | **Server-bridged** (`RealtimeSessionRunner`) |
|---|---|---|
| Provider socket lives | In the **browser** (OpenAI: WebRTC; Gemini: WebSocket via `@google/genai` Live; ElevenLabs / AssemblyAI: raw WebSocket + the shared PCM audio plane) | On the **server** |
| Audio path | Browser ↔ provider directly — frames never transit MJ (lowest latency) | Server ↔ provider; **no client media transport is wired yet** (the plan's P5 media plane) |
| Prompt/tool authority | **Server** — it builds the session config; the browser applies it verbatim | Server (it owns the socket) |
| Tool execution | Relayed: browser → `ExecuteRealtimeSessionTool` mutation → `RealtimeToolBroker` → result JSON → browser → `SendToolResult` | In-process: `RealtimeSessionRunner.handleToolCall` → broker → `IRealtimeSession.SendToolResult` |
| Non-target tools | Channel/UI tools execute **locally in the browser** (never relayed); relayed unknown tools get a structured "not available" (`RealtimeClientSessionService.executeNonTargetTool` — action wiring is a later phase) | Agent **actions** execute via `BaseAgent.executeRealtimeTool` → `ExecuteSingleAction` |
| Entry point | `StartRealtimeClientSession` mutation → `RealtimeClientSessionService.PrepareClientSession` | `AgentRunner.RunAgent` on a Realtime-type agent → `BaseAgent.executeRealtimeSession` |
| Narration / context notes | Browser calls `BaseRealtimeClient.SendContextNote` / `RequestSpokenUpdate` (fully wired — see [§7](#7-progress-narration)) | **Wired**: the runner pipes delegation progress into `IRealtimeSession.SendContextNote` and paces spoken updates through the same first-delay / spacing / digest rules as the browser (shared template via `realtime-narration.ts` — see [§7](#7-progress-narration)) |
| Delegation cancel | Explicit-only: the overlay's per-card ✕ → `CancelRealtimeSessionTool` mutation → the service's in-flight registry aborts the run. **Barge-in never aborts delegations** (deliberate host policy — the narration design expects the user to keep talking while work runs) | Barge-in aborts the in-flight delegated run via `RealtimeToolBroker.AbortInFlight` (no human ✕ exists on this topology) |
| Usage telemetry | Browser accumulates `OnUsage` deltas → debounced (10 s) + teardown-flushed `RelayRealtimeUsage` mutation → accumulated onto the co-agent `AIPromptRun` | Runner checkpoints accumulated usage onto the long-lived `AIPromptRun` (debounced 5 s, crash-safe) |

### 🚨 Single source of truth: ONE prep, the precedence cascade, the core↔host boundary

Every realtime host — native chat, **LiveKit**, and future **Zoom/Teams/GoToMeeting/Webex** — must be the **same agent**: same identity, personality, model/voice, delegation, and session tracking. Only **media transport** and **host UX tools** vary. The full rationale + roadmap is in [`plans/realtime/realtime-core-host-convergence.md`](../plans/realtime/realtime-core-host-convergence.md).

**There is exactly ONE producer of realtime session prep:** `RealtimeClientSessionService.PrepareRealtimeSessionParams` (`packages/AI/Agents/src/realtime/realtime-client-session-service.ts`). It resolves the model, builds the **target-identity** system prompt (via the single `BuildRealtimeAgentFraming` in `realtime-tool-broker.ts` — first-person AS the target, never the co-agent), the stable tool set (always incl. `invoke-target-agent`), voice, and memory. **Do NOT build session prep in a host.** The LiveKit bridge (`BaseAgent.StartBridgeRealtimeSession`) *consumes* it and differs only in opening server-side (`StartSession`) vs the browser mint (`CreateClientSession`); a bridge re-implementing prep is exactly the drift this convergence removed (guarded by `__tests__/realtime-convergence-drift.test.ts`).

**Model + voice resolve through ONE precedence cascade** (`ResolveEffectiveRealtimeConfig`), identical on every host:

```
runtime override  >  target agent's TypeConfiguration  >  co-agent config  >  agent-type default
```

The **target** layer is what lets a voiced agent (Sage, Marketing Agent, …) carry its own persisted voice/model that the shared co-agent then speaks with. The runtime-override input funnels into one slot — the native picker builds `ConfigOverridesJson` client-side (`BuildRealtimeConfigOverridesJson`), the server-bridged hosts build the **identical** envelope via `BuildRealtimeOverridesJson` — so both ride the same highest-precedence cascade layer.

**Core (one place, all hosts):** identity, model/voice precedence, base prompt + memory, `invoke-target-agent` delegation, session/run tracking. **Host (varies):** media transport (LiveKit audio → video) + host UX tools (whiteboard/browser/… — injected via `RealtimeSessionRunnerDeps.ExtraTools`/`ExecuteTool`, never baked into core).

### Client-direct flow (the shipped path)

1. **Mint.** The browser (`VoiceSessionService.StartVoiceSession`) calls `StartRealtimeClientSession(targetAgentId, conversationId?, lastSessionId?, preferredModelId?, clientToolsJson?, coAgentId?)`. The resolver authorizes `CanRun` on the **target** agent, resolves the co-agent (chain in §1), creates the durable `AIAgentSession` via `SessionManager.CreateSession` (storing `targetAgentID` **server-side** in the session's `Config` column — accessed as `Config_` on the generated entity), then `RealtimeClientSessionService.PrepareClientSession` resolves the model, assembles the companion system prompt (framing + co-agent prompt + target identity + history + memory via `AgentMemoryContextBuilder` — the same context a loop agent injects), builds the stable tool set, and asks the driver to `CreateClientSession`. When a `lastSessionId` is supplied, the resolver also loads the **prior session chain's transcript** (`loadPriorTranscript` — ownership-checked, hidden/error rows skipped, capped at 30 newest turns / 8,000 chars / 5 chain legs, with a cycle guard) and frames it into the system prompt so the resumed model *remembers* the last leg. Strictly best-effort — any problem yields no hydration, never a failed start. On mint failure the just-created session is closed with `CloseReason = 'Error'` so nothing half-open leaks.
2. **Connect.** The browser resolves the client driver by the returned `Provider` key and calls `Connect(config, micStream)` — the host acquires the mic (it owns the permission UX); the driver owns the transport, applies `SessionConfig` verbatim once the control channel opens, and only then reports `'listening'`.
3. **Converse.** Transcripts stream both ways; final normal turns become captions and are persisted via `RelayRealtimeTranscript` (a `Conversation Detail` stamped with `AgentSessionID`). Typed text rides `SendText` — which **implies barge-in**: the driver cancels any active spoken response (`CancelActiveResponse`, a floor-control action that never aborts server-side delegated work) before injecting the text, then routes the reply through the same collision-safe path tool results use.
4. **Tools.** Tool calls whose names match a registered client-tool prefix (e.g. `Whiteboard_`) execute **locally**; everything else relays to `ExecuteRealtimeSessionTool`, which reads the target from the session config (never from the client), threads a progress callback, nests the delegated run under the co-agent run, junction-links any artifacts the delegated run produced into the session's conversation history (best-effort — when no session-stamped transcript turn exists yet to anchor to, a minimal **hidden anchor** `Conversation Detail` is created so the junction rows are never orphaned and no fake visible message appears), and rolls a `pendingFeedbackRunID` forward when an interactive target pauses `AwaitingFeedback` — so the user's next answer **resumes the same run** (`lastRunId` + `autoPopulateLastRunPayload`).
5. **Cancel.** A still-working delegation card carries a ✕; clicking it calls `VoiceSessionService.CancelDelegation(callId)` → the `CancelRealtimeSessionTool` mutation → `RealtimeClientSessionService.CancelInFlightDelegations`, whose per-session in-flight registry aborts the matching `AbortController`(s); the original `ExecuteRealtimeSessionTool` mutation then resolves with the cancelled run's outcome (the card was already flipped to "Cancelled by user"; the late duplicate result is suppressed). `AbortedCount: 0` is a legitimate success — the work may have finished first. A callId-less sweep form (`CancelInFlightDelegations()`) exists for "stop everything" affordances. **True barge-in never cancels delegations on this topology** — it only cancels pending narration.
6. **End.** Teardown flushes pending channel saves **and the pending usage-relay delta**, disposes plugins, stops the mic, disconnects the driver, and calls `CloseAgentSession`; `SessionManager.CloseSession` stamps `CloseReason = 'Explicit'`, disconnects channel rows, and finalizes the co-agent observability runs.

### What an ephemeral token can lock — provider differences

All four providers keep prompt/tool authority server-side in the client-direct topology, but **how much the minted credential itself enforces differs**:

- **OpenAI** (`OpenAIRealtime.CreateClientSession`): the full realtime session config — `instructions` (system prompt), `tools`, input-transcription opt-in — is baked into the **client secret** at mint time via the client-secrets API. The browser's `session.update` applies the same config; tampering buys nothing the secret didn't already fix.
- **Gemini** (`GeminiRealtime.CreateClientSession`): the ephemeral-token API accepts only a **mask-safe subset** as `liveConnectConstraints.config` (`GeminiRealtime.BuildConstraintConfig`): `responseModalities`, `speechConfig`, `temperature`, `topP`, `maxOutputTokens`, `sessionResumption` — locked with `lockAdditionalFields: []`. **`systemInstruction`, `tools`, and the transcription configs cannot be locked** (their presence 400s the mint); they ride in `SessionConfig` and the matching client driver applies them verbatim. So on Gemini the token locks model + generation parameters, while prompt/tool integrity relies on the driver-applied config rather than a token-side lock. Token windows: ~10 minutes to *open* a new session, ~30 minutes total lifetime.
- **ElevenLabs** (`ElevenLabsRealtime.CreateClientSession`): the **signed websocket URL is the credential** (agent-scoped, ~15-minute open window; an already-open conversation continues past it). It pins the *agent* — and the agent's server-side configuration carries the tool set (bound by the driver's managed-agent ensure flow, so tools are effectively server-fixed). The per-session **system prompt** rides the `conversation_initiation_client_data` override in `SessionConfig` (the managed agent's platform settings enable exactly that one field), applied by the client driver — so prompt integrity is driver-applied, tool integrity is agent-side.
- **AssemblyAI** (`AssemblyAIRealtime.CreateClientSession`): a **one-time** temp token (`GET /v1/token`, 300-second connect window, single websocket open). The token locks nothing but auth; the entire session object (prompt, tools, voice, turn detection) rides `SessionConfig` and is applied by the client driver as the first `session.update` frame — the provider confirms with `session.ready` before the driver reports `'listening'`.

### Server-bridged flow (wired, awaiting a media plane)

`BaseAgent.executeRealtimeSession` (in `packages/AI/Agents/src/base-agent.ts`) is fully implemented: it resolves the model, creates **one long-lived `AIPromptRun`** for the session (usage is checkpointed incrementally onto it — crash-safe by design), builds `RealtimeSessionRunnerDeps` (delegation via `ExecuteSubAgent`, actions via `ExecuteSingleAction`, transcript persistence, debounced usage checkpoints — default 5 s, plus the DB-driven `NarrationInstructionsTemplate` resolved through the shared `realtime-narration.ts` lookup), and drives `RealtimeSessionRunner.Run()`. The runner passes the tool set via `StartSession` params (the canonical registration path — for connect-bound providers like Gemini Live, the *only* effective one) and wires `OnTranscript` / `OnToolCall` / `OnUsage` / `OnInterruption` (barge-in aborts the in-flight delegated run via `RealtimeToolBroker.AbortInFlight` and cancels pending narration) / `OnError` (a `Fatal` error finalizes the session via `Stop()` instead of idling on a dead socket). The runner also **consumes delegation progress itself**: each significant event is fed to `SendContextNote?.()` and paced into `RequestSpokenUpdate?.()` spoken digests (see [§7](#7-progress-narration)) — both feature-detected, since they are optional capabilities.

What is **not** wired yet for server-bridged: a client media transport (browser audio in/out of the server socket — `IRealtimeSession.SendInput` / `OnOutput` have no client-facing pipe). The client-direct topology is the path Explorer voice uses today.

---

## 4. Session Lifecycle

A realtime session is a **long-lived durable record backed by volatile in-memory resources** (sockets, the mic, channel plugins). The lifecycle machinery keeps the durable state from drifting away from process reality.

### Schema (migration `V202606090930__v5.41.x__AI_Agent_Sessions_Channels.sql`)

- **`AIAgentChannel`** (`MJ: AI Agent Channels`) — the pluggable channel-definition registry: `Name` (unique), `ServerPluginClass`, `ClientPluginClass`, `TransportType` (`PubSub` | `WebRTC` | `WebSocket`), `ConfigSchema`, `IsActive`. Reference data, seeded via `metadata/ai-agent-channels/`.
- **`AIAgentSession`** (`MJ: AI Agent Sessions`) — the long-lived session: `AgentID` (the **co-agent**), `UserID`, `Status` (`Active` | `Idle` | `Closed`), `CloseReason`, `ConversationID`, `LastSessionID` (resume chaining), `HostInstanceID`, `Config` (free-form JSON — authoritative `targetAgentID`, observability run ids, `pendingFeedbackRunID`), `LastActiveAt`, `ClosedAt`.
- **`AIAgentSessionChannel`** (`MJ: AI Agent Session Channels`) — one row per channel attached to a session: `Status` (`Connecting` | `Connected` | `Paused` | `Disconnected`), `Config` (the channel's **state of record**, e.g. the serialized whiteboard), `LastActiveAt`, `DisconnectedAt`; unique per `(AgentSessionID, ChannelID)`.
- Additive nullable FKs: `AIAgentRun.AgentSessionID`, `ConversationDetail.AgentSessionID` (the timeline/grouping keys), `AIAgent.DefaultCoAgentID`, `AIAgentType.DefaultCoAgentID`.

The column is named **`AgentSessionID`** everywhere — deliberately distinct from the per-connection GraphQL transport `sessionID` (a browser-generated correlation id). They are orthogonal and never merged.

### `SessionManager` (`packages/MJServer/src/agentSessions/SessionManager.ts`)

Stateless per-request lifecycle manager (every method takes `contextUser` + request-scoped `IMetadataProvider` — never the global):

- **`CreateSession`** — `CanRun` authorization first (denial throws `SessionAuthorizationError` before any write), then resolve-or-create the `Conversation`, then persist the session `Active`, stamped with this host's `HostInstanceID` .
- **`CloseSession`** — terminal and idempotent: `Status = 'Closed'`, `ClosedAt`, `CloseReason`; disconnects all channel rows; finalizes the co-agent observability runs stored in the session config. An already-closed session is a no-op that **keeps its original `CloseReason`**.
- **`Heartbeat`** — coalesced: at most one `LastActiveAt` write per session per 3 s (`HEARTBEAT_MIN_WRITE_INTERVAL_MS`), so chatty channels never become a DB write storm. Reactivates `Idle → Active`; never reactivates `Closed`. Tool relays and transcript relays heartbeat implicitly.
- **`MarkIdle`** — `Active → Idle` when the last channel goes quiet.

**`CloseReason`** (`SessionCloseReason`) is the close-provenance enum the dashboards key off: `'Explicit'` (user hang-up — the default), `'Janitor'` (orphan reconciliation), `'Shutdown'` (graceful host drain), `'Error'` (failure-path teardown, e.g. a failed mint). `NULL` means legacy/pre-column rows.

### The janitor (`SessionJanitor`) and host identity

`HostInstance.ts` gives each server process a stable identity `hostname:pid:bootId` (the `bootId` UUID is minted once at module load, so two boots of the same host are distinguishable). `SessionJanitor` is a `BaseSingleton` + `IShutdownable` that runs three reconciliation paths, all writing through `SessionManager.CloseSession` (so Record Changes captures transitions and channel rows disconnect consistently), all paging with **keyset (`AfterKey`) pagination** (200 rows/page):

1. **`RunStartupRecovery`** (once at boot) — closes `Active`/`Idle` sessions whose `HostInstanceID` matches this host's `hostname:` prefix but a *different* boot — crash/redeploy orphans. `CloseReason = 'Janitor'`.
2. **`RunStalenessSweep`** (every 60 s by default) — closes any `Active`/`Idle` session with `LastActiveAt` older than 15 minutes (`closeThresholdMinutes`), regardless of host — catches owners that died without a clean reboot. Idempotent and safe to run concurrently on every instance.
3. **`RunShutdownDrain`** (from `Shutdown()` during the `ShutdownRegistry` drain) — closes this exact host instance's own live sessions with `CloseReason = 'Shutdown'`, so a clean redeploy never strands rows for the next boot's janitor.

### Continuity: `lastSessionId` + channel-state restore

A closed session is never reopened; **resuming creates a new session chained via `LastSessionID`** (mirroring `AIAgentRun.LastRunID`). The conversation is the durable thread; sessions are time-boxed episodes along it.

Continuity is real, not cosmetic — a `lastSessionId` on `StartRealtimeClientSession` triggers **two** restore paths:

- **Channel state**: `loadPriorChannelStatesJson()` — the prior session's `AIAgentSessionChannel.Config` blobs come back as `PriorChannelStatesJson` (a `{ channelName: stateJson }` map), and `VoiceSessionService.applyPriorChannelStates()` offers each entry to the matching plugin via `BaseRealtimeChannelClient.RestoreState`. The whiteboard you drew last call reappears in the next one.
- **Model memory**: `loadPriorTranscript()` walks the prior session **chain** (up to 5 legs, cycle-guarded) and frames the newest 30 turns / 8,000 chars of persisted captions into the new session's system prompt, so the model remembers what was said on the previous leg(s) — not just what was drawn.

Both are **strictly best-effort and ownership-checked**: a prior session owned by another user, an oversized state (> 2,000,000 chars per state and in total), or a malformed payload is logged and skipped — a session start never fails because of restore.

### Co-agent pairing & effective configuration

Migration `V202606121100__v5.41.x__Realtime_CoAgent_Pairing_And_TypeConfig.sql` adds two opt-in metadata layers on top of the co-agent resolution chain.

#### Pairing semantics — universal vs constrained

**`AIAgentPairedAgent`** (`MJ: AI Agent Paired Agents`) is an OPT-IN junction between a Realtime-type co-agent and the targets it can front (`CoAgentID`, `TargetAgentID`, `IsDefault`, `Sequence`). **Pairings are never mandated:**

| Co-agent state | Runtime `targetAgentId` supplied | Behavior |
|---|---|---|
| **Zero pairing rows (universal)** | yes | Today's behavior, untouched — fronts the supplied agent. Zero-config deployments need zero metadata. |
| Zero pairing rows | no | Clear error — a universal co-agent has no default target to fall back to. |
| **Has pairing rows (constrained)** | yes, in the list | Accepted (canonical row casing wins). |
| Has pairing rows | yes, NOT in the list | Clear structured error — the rows RESTRICT the co-agent to its prebuilt target list. |
| Has pairing rows | no | The `IsDefault` row stands in; no default row → clear error asking for an explicit target. |

Resolution lives in `RealtimeClientSessionResolver.resolveConstrainedTargetAgentID()` (rows loaded by `Sequence`). Pairing is a **targeting** constraint, not a security boundary — `CanRun` on the *resolved* target remains the security gate, applied immediately after; a failed pairing query therefore degrades to the universal behavior (logged) rather than breaking calls. Server-side write invariants (`MJAIAgentPairedAgentEntityServer.ValidateAsync` in `MJCoreEntitiesServer`): the co-agent must be an **Active** agent of the **Realtime** type, at most **one `IsDefault = 1` row per co-agent**, and `CoAgentID ≠ TargetAgentID` (defense in depth over the CHECK constraint).

#### The effective-configuration merge

Realtime behavior is configured in three JSON layers, **deep-merged per key (later wins; plain objects merge, arrays/primitives replace)**:

```
AIAgentType.DefaultConfiguration  ←  AIAgent.TypeConfiguration  ←  runtime overrides (configOverridesJson)
(type-level defaults)                 (per-agent layer)              (per-session, authorization-gated)
```

The pure implementation is `packages/AI/Agents/src/realtime/realtime-coagent-config.ts` (`DeepMergeConfigs`, `ParseRealtimeTypeConfiguration` — tolerant, malformed layers contribute nothing — and `ResolveEffectiveRealtimeConfig`, which normalizes into the typed `RealtimeCoAgentConfig`). The canonical shape (the Realtime type's `ConfigSchema` is seeded to it):

```jsonc
{ "realtime": {
    "modelPreference": "<AI Model name or ID>",
    "voice": { "default": { "tone": "…", "speakingStyle": "…" },
               "providers": { "openai": { "voice": "alloy" }, "elevenlabs": { "voiceId": "…" },
                              "gemini": { "voice": "…" }, "assemblyai": { "voice": "…" } } },
    "allowUserModelOverride": true,
    "narration": { "paceMs": 8000 } } }
```

**How each knob is applied at mint** (`RealtimeClientSessionService.PrepareClientSession`, mirrored on the server-bridged path in `BaseAgent`):

- **`modelPreference`** (Name or ID) participates in realtime-model selection *between* the explicit runtime choice and the default: explicit `preferredModelId` (strict, fails loud, authorization-gated when deviating) → configured preference (**tolerant** — an unsatisfiable metadata preference logs and falls through, mirroring the chain's metadata steps) → highest-PowerRank default.
- **`voice.default` (tone / speakingStyle)** is appended to the server-built companion system prompt as a short **"Voice & manner"** section, right after the co-agent's own prompt.
- **`voice.providers.<provider>`** is matched to the resolved vendor's `DriverClass` by normalized prefix (`openai` ↔ `OpenAIRealtime`, …) and merged into the session's open **`Config` bag** — the same opaque per-driver pact every other config entry rides (a caller-supplied runtime `Config` wins per key). Server-bridged reach today: **OpenAI** spreads the bag into `session.update`; **Gemini** merges it last; **AssemblyAI** maps `voice` → `output.voice`. **ElevenLabs** provisions voice on its managed agent and does not consume a per-session bag (per-driver TODO). **Client-direct reach**: `OpenAIRealtime.CreateClientSession` does not yet fold `params.Config` into the minted session (per-driver TODO) — the resolver instead surfaces the full resolved config as **`EffectiveConfigJson`** on `StartRealtimeClientSessionResult` so client drivers can apply provider voice settings browser-side.
- **`narration.paceMs`** drives spoken-progress spacing: server-bridged, it feeds `RealtimeSessionRunnerDeps.NarrationPaceMs` (replacing the built-in 8 s spacing floor); client-direct, pacing is enforced client-side, so the value is surfaced as **`NarrationPaceMs`** on the start result.

**Runtime override precedence & authorization** (`configOverridesJson` on `StartRealtimeClientSession`):

| Request | Gate | Outcome |
|---|---|---|
| Plain start (no overrides, no explicit model) | `CanRun` on the target only | Never touches the new gate. |
| Target selection (within a pairing list / universal) and `coAgentId` choice | `CanRun` only | Normal user flow — deliberately ungated. |
| `configOverridesJson` | **`Realtime: Advanced Session Controls`** authorization (hierarchy-aware, fail-closed when the seed is absent) | Unauthorized → structured rejection (never a silent ignore). Must be a JSON object. |
| `preferredModelId` **equal** to the metadata `modelPreference` | none (not a deviation) | Allowed for everyone. |
| `preferredModelId` **deviating** from metadata | the authorization **AND** effective `allowUserModelOverride ≠ false` (the policy blocks even authorized callers) | Denial is a structured rejection naming the reason. |

Gate implementation: `RealtimeClientSessionResolver.assertRuntimeOverridesAuthorized()` → the pure `EvaluateRuntimeOverrideAuthorization()` decision (unit-tested matrix) + `AuthorizationEvaluator.UserCanExecuteWithAncestors` over the request provider's cached Authorizations. The authorization is seeded in `metadata/authorizations/.realtime.json`.

**Write-side schema enforcement**: when an agent type publishes `ConfigSchema`, `MJAIAgentEntityServer.ValidateAsync` (in `MJCoreEntitiesServer`) validates `TypeConfiguration` against it with a dependency-free JSON-Schema-subset validator (`json-schema-lite.ts`: type / required / properties / enum / items / additionalProperties). Non-object configuration always fails; a malformed `ConfigSchema` only WARNS (a metadata bug on the type row must not brick agent saves).

### Live session capabilities — `RealtimeSessionCapabilities` + `Reconfigure`

A live `IRealtimeSession` exposes a small **capability surface** (the realtime-session analogue of the bridge's `IBridgeProviderFeatures` and of `BaseRealtimeModel.SupportsClientDirect`) so the container can ask "is it safe to call X?" instead of blind-invoking optional methods that no-op — or *can't* be supported — on some providers. Both members are **optional** on the interface (`@memberjunction/ai`, `baseRealtime.ts`), so a driver that hasn't declared them is treated **conservatively** (unsupported), and the 6 existing drivers compile unchanged:

- **`Capabilities?: RealtimeSessionCapabilities`** — currently `{ CanReconfigureTurnMode }`: whether the session can change its turn-taking / auto-response mode on a **live** socket without reconnecting. Grow this object as providers gain runtime abilities.
- **`Reconfigure?(params: RealtimeReconfigureParams): void`** — applies a live change (e.g. `{ DisableAutoResponse: true }`). **Gate on the capability before calling.** OpenAI implements it via a partial `session.update` and reports `CanReconfigureTurnMode: true`; Gemini Live's activity detection is fixed at connect, so it reports `false` and *omits* the method.

Prime consumer: the bridge engine's first-agent re-gating (`AIBridgeEngine.ReconfigureSessionToMeeting` → meeting mode when a room becomes multi-agent — see the Bridges guide §9). As models gain mid-session reconfiguration, a driver flips one flag and the container starts using it with **zero container changes**.

### Turn moderator (multi-agent turn-taking)

When **two or more agents** share one realtime room (a LiveKit panel, a meeting), the hard question is *who speaks next*. The original answer was a per-agent regex name-match (`RegexAddressedMatcher`): each agent independently checked "was I addressed?" That routes direct address but nothing else — it can't bring a relevant-but-unaddressed agent in, can't let two agents have a productive back-and-forth, and can't tell a useful exchange from an unproductive ping-pong loop. The **turn moderator** replaces it with a room-level decision.

Once per turn, a single fast LLM looks at the room roster + the recent diarized conversation and returns the **ordered agent(s) who should speak next** — zero, one, or several. It routes direct address *and* relevance (send a question to Sage **and** Skip when both matter), lets a *productive* agent↔agent discussion continue, and goes quiet on unproductive ping-pong or when nobody should speak (hand back to the human). The engine speaks the returned agents **serially via the floor** — never overlapping. The **audio plane is untouched**: every agent always hears the raw room audio; the moderator only decides *when* each agent is triggered to commit and speak. (It's called a *moderator*, not a judge, because it *brings agents in* as much as it restrains them — the informal nickname is "nanny mode," but that undersells the half that matters.)

#### Prompt, not agent

The moderator is `RealtimeTurnModerator` (`packages/AI/Agents/src/realtime/realtime-turn-moderator.ts`; exported as `RealtimeTurnModeratorDecision`, the `(ctx) => Promise<string[]>` function wired into the bridge engine). It is a stateless yes/who classification — no planning, tools, or sub-agents — so it runs as an **`AIPromptRun` via `AIPromptRunner`, not an agent run**. Each decision's `agentRunId` is tied to the **co-agent's `AIAgentRun`**, so the per-turn "who spoke and why" trail (including the moderator's structured `reason` per speaker and an optional `note`) is fully observable through standard prompt-run logs — and those logs are exactly the data for deciding when this mechanism can be relaxed as realtime models get smarter. The prompt returns structured `{ speakers: [{ agent, reason }], note }`; the plugin maps the returned names back to roster `AgentSessionID`s (in order, de-duplicated).

#### Config cascade + the `turnTaking` shape

Two parts of the effective-config cascade carry turn-taking, and they live at different layers:

- **Room-wide moderator brain** — the `turnTaking.moderator` block on the **Realtime agent type's `DefaultConfiguration`** (`metadata/agent-types/schemas/realtime-type-default-config.json`). A room has exactly one moderator.
- **Per-agent participation `mode`** — `turnTaking.mode` on the **target agent's `TypeConfiguration`**: `'proactive'` (default — may be brought in unaddressed when the moderator judges it relevant) or `'addressed-only'` (speaks only when directly addressed by name).

Both ride the existing cascade (agent-type `DefaultConfiguration` ← co-agent `TypeConfiguration` ← **target agent** `TypeConfiguration` ← runtime override — see [§4 the effective-configuration merge](#the-effective-configuration-merge)). The shape (in `packages/AI/Agents/src/realtime/realtime-coagent-config.ts`):

```jsonc
{ "realtime": { "turnTaking": {
    "mode": "proactive",                 // per TARGET agent (TypeConfiguration)
    "moderator": {                       // room-wide (agent-type DefaultConfiguration)
        "promptId": "<AI Prompt ID>",    // authored as @lookup:, stored as the resolved ID
        "contextWindowTurns": 30,        // diarized turns the moderator sees; clamped ≤ 50
        "maxCharsPerTurn": 240,          // per-turn clip (token savings + cacheable prefix)
        "maxConsecutiveAgentOnlyTurns": null,  // null = no cap (trust the model's progress read)
        "timeoutMs": 800,                // per-decision budget on the latency-critical path
        "onError": "silent",             // 'silent' (no one speaks) | 'addressed-only' (cheap fallback)
        "prestageOnAgentSpeech": true    // run the next decision during the prior agent's playback
} } } }
```

`GetEffectiveModeratorConfig` / `GetEffectiveTurnMode` are the typed accessors; absent fields fall back to `REALTIME_MODERATOR_DEFAULTS`. `GetEffectiveModeratorConfig` returns `null` when no `promptId` is configured — which the engine reads as "no moderator, fall back to the matcher."

#### Serialized multi-route + pre-staging

The moderator can name several speakers; the engine queues them and drains the queue **one at a time through the room floor**, so a multi-agent route is heard as a clean sequence, never a pile-up. The moderator also runs on **agent turns**, not just human ones — that powers both agent↔agent continuation and **pre-staging**: when `prestageOnAgentSpeech` is on (the default), the next decision runs *during the prior agent's audio playback* (the model emits its full response text seconds before the user finishes hearing it), so the agent→agent hand-off pays ~zero added latency. A human **barge-in discards the pre-staged decision** (the user changed the topic). The optional `maxConsecutiveAgentOnlyTurns` is a hard backstop against runaway agent-only loops; left `null`, the room relies on the moderator's own progress assessment so a genuine discussion is never gated by a counter.

#### The model — small, fast, swappable

A small/fast LLM is the right call because this runs **every turn on the latency-critical path**. The seeded prompt (`"Realtime: Turn Moderator"`, `metadata/prompts/.realtime-prompts.json`) is bound to **GPT-OSS-120B on Cerebras**. The structured output, plus putting the static roster near the top of the prompt and the variable conversation at the bottom, maximizes prefill caching. The whole mechanism is metadata-driven: swap the model binding (e.g. to Gemma on Cerebras) or retune the windows entirely in metadata, **no code change** — and the `prestageOnAgentSpeech` design means a slower model still hides most of its latency.

#### No-moderator fallback

When no moderator is injected into the engine — or no `promptId` is configured — the engine **falls back to the per-agent `RegexAddressedMatcher` broadcast** (still present): the room's utterance is broadcast to every agent's `TurnPolicy` and each independently decides "was I addressed?" The plugin itself also degrades to a crude name-contains safety net only when no prompt is configured, so a room is never left mute by a metadata gap. The engine seam (`SetTurnModerator`, the lookback buffer, the serialized queue, barge-in invalidation) is documented in the [Bridges guide §9](REALTIME_BRIDGES_GUIDE.md#9-multi-party-livekit--multiple-agents).

---

## 5. Channels — The Heart of the System

A channel is more than transport. An **interactive channel** is a bidirectional surface the session's *single* realtime agent both **perceives** and **acts upon**. One agent per session is a hard invariant — everything every channel observes feeds that one agent, and every channel mutation comes from it.

Every interactive channel implements two directions:

1. **Perception (channel state → agent context).** The channel serializes **compact, coalesced deltas** of its state and feeds them into the live model as background context notes — *replace-current-state* semantics, never full snapshots, never bitmaps.
2. **Action (agent → channel mutation).** The channel exposes **mutation tools** the model can call; they execute and the result feeds back as the `tool_response` the model narrates.

### The definition registry

`MJ: AI Agent Channels` rows define what channels exist (see [§4 schema](#4-session-lifecycle)). At session start `VoiceSessionService` reads the **active** rows and instantiates one plugin per row via the ClassFactory (`ClientPluginClass` key) — one fresh instance per session, never a singleton. Registry failures degrade to "no channels"; the voice session always proceeds. The **server half** mirrors this exactly: when `SessionManager.CreateSession` mints the durable session, `RealtimeChannelServerHost` reads the same active rows and resolves each `ServerPluginClass` into one fresh `BaseRealtimeChannelServer` instance per session (unregistered keys skip with a log, never fatal).

### Per-session state of record

Each attached channel gets an `AIAgentSessionChannel` row. Its `Config` column is the channel's **state of record** — written by the `SaveSessionChannelState` mutation through a client-side debounce (3 s, latest-state-wins, flushed at teardown with the session id captured while live so the final save lands even on the just-closed session). The model's perception feed is *derived* from this state, never the source of truth. A `Closed` session still accepts state saves (the final flush legitimately lands after `CloseAgentSession`). Before persistence, each landed save routes through the channel's **server plugin** (when one resolved — see below), which may validate/normalize the payload; a plugin can transform a save but can never lose or block one.

### The `BaseRealtimeChannelClient` contract

A concrete plugin contributes everything its channel needs, so the host shell carries zero channel-specific wiring:

| Member | Role |
|---|---|
| `ChannelName` | Must match the registry row's `Name`; the persistence + restore key and the tab key |
| `ToolNamePrefix` | One prefix-routed local executor per plugin — `Whiteboard_*` calls run in the browser, never the server relay |
| `GetToolDefinitions()` | The client-executed tool declarations, aggregated into the session mint (`clientToolsJson`) |
| `ApplyAgentTool(toolName, argsJson)` | Executes one tool **locally**; MUST work with no surface bound (apply to the state engine, skip the UI garnish) — calls can arrive while the tab pane is collapsed |
| `GetSurfaceComponent()` / `BindSurface()` / `UnbindSurface()` | The Angular surface the overlay creates dynamically in a channel tab; the *plugin* wires the component's inputs/outputs — the host treats the instance as opaque |
| `SerializeState()` / `RestoreState()` | The state of record + resume rehydration (tolerant by contract: bad input returns `false`, never throws) |
| `RequestFocusExit()` | Routed from the floating call pill back to whichever channel holds focus |
| `Initialize(ctx)` / `Dispose()` | Lifecycle bracket; `Context` is the plugin's **only** line to the session |

The host context (`RealtimeChannelContext`) supplies: `SendContextNote` (the perception feed), `RequestSave` (debounced state-of-record persistence), `SaveAsArtifact` (snapshot to a first-class versioned `MJ: Artifacts` record), `SetFocusMode` (the focus-layout request), and `AgentName`.

### The server half — `BaseRealtimeChannelServer`

The same registry row's `ServerPluginClass` resolves a **server-side** plugin (`BaseRealtimeChannelServer` in `@memberjunction/ai`, beside `BaseRealtimeModel`), hosted per session by the `RealtimeChannelServerHost` singleton in `@memberjunction/ai-agents`. Because today's shipped topology is client-direct (channel tools execute in the browser), the server half's contract is the **durable lifecycle**, not socket ownership — a pragmatic adaptation of the plan's `IAgentChannelServer` (see the base class doc header for the deviation notes; socket/transport members are deferred with the unified-transport track):

| Member | Role |
|---|---|
| `ChannelName` | Must match the registry row's `Name` (the host routes by the row name and warns on a mismatch) |
| `Initialize(ctx)` / `Dispose()` | Lifecycle bracket; `ctx` is plain session facts (`AgentSessionID`, `AgentID`, `UserID`, `ConversationID`) |
| `OnSessionStarted()` | Fired right after the durable session row persists (`SessionManager.CreateSession`) |
| `OnChannelStateSave(stateJson)` | Fired when the client's debounced state save lands, **pre-persistence**; return a replacement string to normalize the persisted state of record, or `null` to keep the original. Throw/garbage → original persisted — a plugin can never lose or block a save |
| `OnSessionClosed(closeReason)` | Fired from **every** close provenance — explicit hang-up, janitor sweeps, shutdown drain, error teardown all funnel through `SessionManager.CloseSession` |
| `ToolNamePrefix` | The shared prefix of this channel's **server-executed** tools (e.g. `MeetingControls_`); the host routes any prefixed tool call back to this plugin. Default `''` (no server tools) |
| `GetServerToolDefinitions()` | This channel's **server-executed** tool declarations — may be **runtime-computed** (per session / per platform state), not only constants. Default `[]`. The host aggregates these across a session's live plugins (`RealtimeChannelServerHost.GetSessionServerTools`) and feeds them into `RealtimeSessionRunner.ServerChannelTools` |
| `ExecuteServerTool(toolName, argsJson)` | Executes one server-side tool; routed by `ToolNamePrefix`. Default returns a structured "not implemented" error (never throws) — the host additionally wraps any throw |

Hard rules baked into the host: **one fresh instance per session** (never a singleton); every hook is wrapped in try/catch (a throwing plugin is logged and the session/persistence proceeds untouched); resolution is skip-with-log for unregistered keys; and disposal is **deferred briefly** after close (15 s linger) so the client's legitimate post-close final state flush still routes through `OnChannelStateSave`.

The reference implementation is `WhiteboardChannelServer` (`packages/AI/Agents/src/realtime/whiteboard-channel-server.ts`, key `'WhiteboardChannelServer'` — the value the Whiteboard row's `ServerPluginClass` has carried since the seed): it guards the persisted state of record by validating that each landed save parses as a JSON object (flagging corrupt payloads loudly *now* instead of at the next resume's `RestoreState`) and canonicalizing valid payloads to compact JSON. Register a new server half with `@RegisterClass(BaseRealtimeChannelServer, '<key>')` plus a `Load...Server()` no-op called from a static server path (the Whiteboard's is invoked from MJServer's `agentSessions/index.ts`).

**Server-executed channel tools (Phase 2 — now wired).** A server-side channel can contribute a **dynamic** server-executed tool vocabulary (`GetServerToolDefinitions`, possibly runtime-computed) plus its execution (`ExecuteServerTool`), namespaced by `ToolNamePrefix`. The `RealtimeChannelServerHost` aggregates every live plugin's tools for a session (`GetSessionServerTools`) and routes each prefixed call back to its owner (`ExecuteSessionServerTool`, longest-prefix-wins). The server-bridged `RealtimeSessionRunner` accepts these via the new additive `ServerChannelTools` dep + an `ExecuteServerChannelTool` handler — they are registered alongside (and after) `ExtraTools`, and a contributed tool routes to the channel handler before the generic executor. This is purely additive: the client-direct path and runs without channels are unchanged. The reference server-only channel is **`MeetingControlsChannel`** (roster / hand-raise queue / who's-speaking / timer → facilitator; see the Realtime Bridges guide).

**Optional client surface (Phase 2).** A server-only channel has **no** MJ client surface — `BaseRealtimeChannelClient.GetSurfaceComponent()` now defaults to `null` (`HasSurface()` is `false`), and the overlay skips a surfaceless channel's tab while still wiring its tools + perception. A platform-native surface (e.g. a Zoom whiteboard) lives on the platform, not in MJ.

**Still deferred:** socket/media members (`OnClientMessage`, `SendToClient`) remain deferred with the unified-transport track.

### The implicit voice/text channel

Voice itself is not a registry row — it **is the session**: the provider socket, live captions, the typed-input composer, and the persisted transcript. Concretely:

- Every **final, normal** transcript turn (both roles) becomes a caption and a `Conversation Detail` stamped with `AgentSessionID` (`RelayRealtimeTranscript` → `persistTranscriptTurn`; roles map `user → 'User'`, everything else → `'AI'`). That is the durable transcript — raw audio is not persisted.
- **Typed text** (`VoiceSessionService.SendText`) is injected as a user turn through the same collision-safe response path tool results use, then rides the same caption + relay path as speech — a typed turn behaves identically to a spoken one.
- **Narration** turns (`Kind: 'narration'`) are deliberately ephemeral — never captions, never persisted (see [§7](#7-progress-narration)).

### The Whiteboard — canonical interactive channel

The whiteboard now lives in **two layers**, and the split is the point:

- **`@memberjunction/ng-whiteboard`** (`packages/Angular/Generic/whiteboard/` — [README](../packages/Angular/Generic/whiteboard/README.md)) is the generic, reusable board: the Angular-free `WhiteboardState` engine, the `Whiteboard_*` tool API, the host/board/toolbar/zoom/popover/snapshot components, exports, the widget input bridge, and the right-click context menu. It has **no** MJ-metadata, AI-framework, or Router dependency — any Angular app can use it. The README there is the authoritative whiteboard reference.
- **`RealtimeWhiteboardChannel`** (`packages/Angular/Generic/conversations/src/lib/components/realtime/whiteboard/whiteboard-channel.ts`, registered as `'RealtimeWhiteboardChannel'`, seeded registry row `Name: 'Whiteboard'`) is the **thin channel plugin** (~200 lines) that wires that package into a realtime session: it owns one `WhiteboardState` per session, declares `WHITEBOARD_TOOL_DEFINITIONS` to the model, routes `Whiteboard_*` calls to the bound `RealtimeWhiteboardHostComponent` (UI garnish) or the pure `ApplyWhiteboardAgentTool` when the pane is collapsed, pipes the host's coalesced `SceneDelta` output into `Context.SendContextNote`, requests debounced state-of-record saves on every `Changed$`, and handles restore/focus/artifact snapshots. Read it before writing a new channel — it is the reference for how *little* a channel plugin should be.

**Tool surface** (prefix `Whiteboard_`, 11 tools): `AddNote` (sticky notes), `AddShape` (labeled rect/ellipse/diamond boxes), `AddText` (free-floating labels, with explicit wrap-width support), `AddMarkdown` (**v3** — a rendered rich-text panel, ≤32,000 chars), `AddHtml` (**v3** — an interactive sandboxed HTML widget, ≤64,000 chars), `UpdateContent` (**v3** — rewrite an existing item's text/markdown/HTML in place), `DrawConnector` (arrows between items by id or absolute points), `Highlight` ("pointing without touching" — a pulsing region the user dismisses with a click), `MoveItem`, `RemoveItem`, `StyleItem`. Every tool returns a `WhiteboardToolResult` `{ success, itemId?, summary?, error? }` — the `summary` is what the model narrates ("Added a sticky note…"); failures are structured so the model can self-correct conversationally. Each call runs as one undo batch, so a single toast-Undo reverts a whole tool effect.

**Markdown panels & sandboxed HTML widgets (v3)**: markdown renders through the shared sanitized `mj-markdown` component (no raw-HTML passthrough); HTML widgets render in an iframe sandboxed to **`allow-scripts` only** (opaque origin — no parent DOM, session, cookies, or storage access), with off-screen frames rendered as placeholders. Users can edit both in-board through the rich editors (commits flow through the cancelable `ContentApplying`/`ContentApplied` events). The **input bridge** (`MJWhiteboard.submit(data)` — `whiteboard-widget-bridge.ts`) is the tutoring loop: the agent draws a quiz/micro-form widget, the user answers inside it, the validated, size-capped (8,000 chars) submission flows out through `postMessage` → `WidgetSubmitted` → the channel plugin sends the model `[whiteboard] the user submitted input in widget "…": {data}` — and the agent reacts in voice. A **right-click context menu** (pure model in `whiteboard-context-menu.ts`) offers per-item-kind actions on the board.

**Perception model**: `WhiteboardState` is the **single mutation API** used by both the user's board tools and the agent's channel tools. Every mutation appends to a compact change journal and emits `Changed$`; the bound surface coalesces changes over **750 ms** and emits one `SceneDelta`, which the plugin pipes into the model as a `[whiteboard]`-prefixed context note. **Perception etiquette rides in the note itself**: the prefix text instructs the model that board updates are background context — "do NOT comment on minor edits; only mention it if the change is significant" — so any realtime model behaves, regardless of system-prompt sync state. `BuildSceneDelta(sinceToken)` collapses the journal (multiple moves of one item → one `moved` entry) with replace-current-state semantics; `BuildSceneSummary()` powers the **"What the agent sees" popover** — the user can literally inspect the agent's perception feed. When the user clicks Undo on an agent-action toast, the plugin tells the model: `[whiteboard] user undid your last change`.

**Ownership / the violet system**: every item carries `Author: 'user' | 'agent'`. The violet treatment is **reserved for the agent** — agent items render violet regardless of tint, the user's pen/text palettes never offer violet, and ownership chips ("You" / the agent's name) make authorship unambiguous on the board and in exports. Hosts can go further: the engine's cancelable before-events (`ItemAdding$` / `ItemUpdating$` / `ItemRemoving$`) let a policy veto, e.g., the agent removing the user's items.

**Export / print** (`whiteboard-export.ts`): `BuildWhiteboardExportHtml` renders one fully self-contained HTML document (inline CSS, zero external references — the documented exception to design tokens) for Download/Print; `BuildWhiteboardExportSvg` for SVG. Every piece of user/agent-authored text is HTML-escaped before touching the document; live widget HTML is **never inlined** in exports (no sandbox exists there — widgets export as placeholder cards with escaped source in a `<details>`).

**Artifact snapshots**: "Save to artifacts" snapshots the board JSON as a versioned `MJ: Artifacts` record via `SaveSessionChannelArtifact` — typed with the seeded **`Whiteboard` artifact type** (`metadata/artifact-types/`, `ContentType: application/json`, viewer `DriverClass: WhiteboardArtifactViewerPlugin` — the viewer component stays in the conversations package and renders through `WhiteboardSnapshotComponent`), best-effort linked into conversation history via a `MJ: Conversation Detail Artifacts` junction row against the latest session-stamped detail. On success the plugin tells the model the user saved the board, so it can reference the artifact naturally.

**Restore-on-resume**: `RestoreState` rehydrates a prior session's board **in place** into the same `WhiteboardState` instance (`LoadFromJSON`), so the save subscription and any later surface binding keep pointing at one engine. Malformed payloads return `false` and the board starts fresh.

### The Media channel's agent media library (Collections as kits)

The **Media** channel (`MediaChannelServer` / `RealtimeMediaChannel`, seeded row `Name: 'Media'`) lets the agent put images/video/audio/PDF/web on a shared surface. Beyond ad-hoc `Media_ShowMedia({ url | fileId })`, an agent can be given a **curated, governed media kit** it reasons over — built by **reusing Artifacts + Collections**, not a bespoke entity:

- **A `MJ: Collections` of `MJ: Artifacts` IS the kit.** The artifact (+ current version) describes the media — `FileID → MJ: Files`, `MimeType`, name, viewer, versioning, permissions. Bytes stream through the authenticated `/media` route. Nothing is duplicated.
- **Agent-reasoning metadata lives per-membership** on `MJ: Collection Artifacts`: `Sequence` (priority/order, pre-existing) + **`ContextDescription`** (the agent-facing "what this is / when to show it") + **`Preload`** (eager hint). Per-membership means the same artifact can be framed differently in different kits.
- **Binding:** `AIAgent.DefaultMediaCollectionID` (FK → `Collection`) is the agent's default kit; per-session resolution is `runtime override > agent default > none`.
- **Per-session runtime override (wired).** `StartRealtimeClientSession` accepts an optional `mediaCollectionId` arg — **UUID-validated at the resolver boundary** (`IsValidUUID` from `@memberjunction/global`; a malformed value is dropped + logged, the session still starts) and stored on the session config (`RealtimeSessionConfig.mediaCollectionID` → `AIAgentSession.Config_`). `SessionManager` hands the verbatim config blob to data-aware channels via **`RealtimeChannelServerContext.AgentSessionConfig`**; `MediaChannelServer` parses `mediaCollectionID` from it and passes it as the override (re-validated downstream — defense in depth). So a caller (e.g. a Praxis Protocol) can hand a session its own kit, overriding the agent default; absent ⇒ the agent default applies. *Note: `AgentSessionConfig` (the persisted `AIAgentSession.Config_`) is intentionally distinct from the driver-level `ClientRealtimeSessionConfig.SessionConfig` "private pact" (§5.8) — same word, different layer.*
- **Server-side resolution, existing client tool.** `MediaChannelServer` implements `IRealtimeChannelServerDataAware` (the host hands it the session `contextUser` + `provider` between `Initialize` and `OnSessionStarted`); on start it resolves the kit via `agent-media-library.ts` (`buildAgentMediaContextNote`) and `SendContextNote`s a manifest (`fileId`, type, display name, when-to-show, PRELOAD). The agent then surfaces items with the **existing** `Media_ShowMedia({ fileId, mediaType, displayName })` — no new client tool, no client round-trips. An agent with no kit is unaffected.

The resolver (`mediaTypeFromMimeType` / `resolveAgentMediaManifest` / `formatAgentMediaManifest`) is exported from `@memberjunction/ai-agents` and unit-tested. See `plans/praxis/AGENT_MEDIA_LIBRARY_PLAN.md`.

### Interactions between channels

The channels are not silos — they converge on the one shared model context and the one overlay shell:

- **Voice narrates board actions.** A `Whiteboard_AddShape` tool result's `summary` returns through `SendToolResult`, and the model speaks it — the agent talks about what it just drew, in the same breath as the conversation.
- **Context notes are the cross-channel bus.** Whiteboard scene deltas, delegated-run progress, artifact-save notifications, and undo events all arrive as context notes in the *single* model conversation — the agent's awareness of every surface lives in one place, which is exactly why the one-agent-per-session invariant exists.
- **Focus mode is a shared layout protocol.** Any channel can call `Context.SetFocusMode(true)`; the overlay (`realtime-session-overlay.component.ts`) collapses the main call column so the surface owns the screen, with a floating call pill keeping mute/thread/end reachable; the pill's exit routes back through `RequestFocusExit()` to whichever channel holds focus.
- **Delegated-run artifacts surface beside channel surfaces.** The overlay's right panel is a tabbed surface (`RealtimeSurfaceTabsModel`): the Activity rail is always tab 1, **one tab per artifact** a delegated run produced (auto-opened + flash-highlighted on arrival, keyed by artifact *version*), and **one tab per interactive channel**. A delegated Sage run's report artifact and the live whiteboard sit side by side in the same panel while the voice keeps going.

---

## 6. Future Channel Types (Envisioned)

> [!NOTE]
> **Everything in this section is forward-looking design discussion — none of it is implemented.** It is here because the channel plugin contract was explicitly shaped to make these tractable, and because "what would it take" is the best test of the abstraction. For each candidate: the perception feed shape, the mutation tool surface, transport considerations, and what the existing contract covers vs. what would need extending.

### Video (camera as perception)

- **Perception**: sampled camera frames (or provider-native video input — `BaseRealtimeModel` is deliberately modality-agnostic and `IRealtimeSession.SendInput` already takes raw media frames). Structured deltas don't apply; this is the one channel class where the *media plane itself* is the perception feed.
- **Tools**: model-driven visual annotations over the video surface (`Video_Highlight(x,y,label)`, `Video_Snapshot()` → an artifact) rather than mutations of the feed itself.
- **Transport**: WebRTC, full stop — frames are binary and latency-sensitive. The registry's `TransportType: 'WebRTC'` value exists for exactly this.
- **Contract fit**: surface/tab/focus-mode and the tool path carry over unchanged. The gap is the perception direction: `SendContextNote` is text-only, so native video input needs either provider video-modality support through the driver (extending `RealtimeSessionParams`/client `Connect`) or a frame-sampling serializer that describes frames textually (cheap, lossy interim).

### Screen-share (perceive the user's screen, guide and highlight)

- **Perception**: like video, but the richer play is hybrid — periodic frames *plus* a structured accessibility/DOM digest for shared app windows ("dialog open: Save Changes; focused field: Name"). Structured digests are vastly cheaper than pixels and more reliable for guidance.
- **Tools**: `Screen_Highlight(region|elementRef)`, `Screen_Annotate(text, anchor)` — guidance overlays rendered by the channel surface, never synthetic input into the user's apps (a deliberate security boundary).
- **Transport**: WebRTC for frames; the structured digest is small enough for the control plane (PubSub).
- **Contract fit**: tools/surface/focus are covered (a screen-share would almost always run in focus mode). Same perception gap as video for the pixel path; the digest path works today via `SendContextNote`.

### Collaborative documents (markdown / rich text co-editing)

- **Stepping stone — SHIPPED**: the whiteboard's v3 **markdown panels and sandboxed HTML widgets** deliver most of this value inside the existing channel today — the agent drafts a rich-text section (`Whiteboard_AddMarkdown`), revises it in place (`Whiteboard_UpdateContent`), and the user drags/edits it with the in-board editors. A dedicated doc channel remains the eventual destination for true co-editing.
- **Perception**: section-level structural deltas ("§2 'Pricing' edited by user; +2 paragraphs"), not character-level OT/CRDT traffic — the model needs document awareness, not keystrokes. The whiteboard's journal → coalesced-delta pattern transfers directly.
- **Tools**: `Doc_InsertSection`, `Doc_ReplaceRange`, `Doc_Comment`, `Doc_ProposeEdit` (a suggestion the user accepts — the doc analogue of the whiteboard's violet ownership + undo toast).
- **Transport**: PubSub-class control traffic; nothing binary. State of record = the serialized doc on the session-channel row; snapshots via `SaveAsArtifact` exactly like the board.
- **Contract fit**: this is the channel the contract fits *best* — everything (tools, perception, state of record, restore, artifact snapshots) works without extension. The work is the editor surface and the delta serializer.

### Maps / geo canvases

- **Perception**: viewport + feature deltas ("user panned to Chicago; zoom 11; 3 pins visible: …") — replace-current-state, like the board.
- **Tools**: `Map_AddPin`, `Map_DrawRegion`, `Map_FlyTo`, `Map_Highlight`. Agent-authored features get the violet ownership treatment.
- **Transport**: PubSub; tiles come from the map provider, not the session.
- **Contract fit**: clean — a near-isomorph of the whiteboard over a geographic coordinate space.

### Dashboards / live-data surfaces

- **Perception**: the surface pushes *data-state* deltas ("KPI 'Churn' crossed threshold; user filtered to Q3") so the agent can voice what the user is looking at.
- **Tools**: `Dash_SetFilter`, `Dash_FocusWidget`, `Dash_Explain(widgetId)` — the last one likely *combines* channels: a delegated run analyzes the widget's data while the voice narrates.
- **Transport**: PubSub; the data itself flows through MJ's normal RunView/RunQuery paths, not the session.
- **Contract fit**: covered; the interesting question is policy — debouncing live-data churn so the perception feed doesn't flood the context (the whiteboard's coalescing policy generalizes).

### Code editors

- **Perception**: file + selection + diagnostic deltas ("user opened foo.ts; cursor in `resolveModel`; 2 TS errors"), never whole files on every keystroke.
- **Tools**: `Code_ProposeEdit(file, range, replacement)` (rendered as an accept/reject diff — ownership semantics again), `Code_Annotate`, `Code_NavigateTo`.
- **Transport**: PubSub.
- **Contract fit**: covered structurally; the real cost is the surface (an embedded editor) and the safety policy that proposals are never auto-applied.

### Form-filling / guided UI

- **Perception**: form-state deltas ("field 'Tax ID' invalid; 3 of 9 required fields complete") — likely derivable from MJ's metadata-driven forms automatically, which makes this uniquely cheap in MJ.
- **Tools**: `Form_SetField`, `Form_Explain(field)`, `Form_Submit` (gated on user confirmation). Agent-set values get a distinct treatment until the user confirms.
- **Transport**: PubSub.
- **Contract fit**: covered. The promising angle: because MJ forms are generated from entity metadata, a *generic* form channel could expose any entity form to the agent without per-form code — the metadata already describes the fields, validation, and value lists the tool schemas need.

**The common thread**: PubSub-class structured channels (docs, maps, dashboards, code, forms) fit today's contract as-is — they are whiteboard isomorphs over different state engines. Media-perception channels (video, screen pixels) are the ones that need a real extension: a binary perception path through the driver layer, which is exactly the boundary `BaseRealtimeModel`'s modality-agnostic contract and the registry's `TransportType` column were designed to absorb.

---

## 7. Progress Narration

Delegated work takes seconds to minutes; dead air kills a voice call. The narration system keeps the wait conversational without chattering. It runs in **both topologies** — `VoiceSessionService` on the client-direct path, `RealtimeSessionRunner` on the server-bridged path — sharing the DB-driven instruction template through `packages/AI/Agents/src/realtime/realtime-narration.ts` (`ResolveNarrationInstructionsTemplate` / `BuildServerNarrationInstructions`), and is **DB-tunable**.

**The client-direct pipeline:**

1. The server threads an `OnProgress` callback into every delegated run (`buildDelegationProgressCallback` in `RealtimeClientSessionResolver`). Only **significant** steps pass the filter (`prompt_execution`, `action_execution`, `subagent_execution`, `decision_processing`); each is published on the push-status topic tagged `type: 'RealtimeDelegationProgress'` + `agentSessionID` + `callID`.
2. The browser correlates events to the active session, **drops stale progress** (events for calls no longer in `inFlightCallIds` — PubSub can lag the fast mutation result, and narrating "starting up" after the answer was spoken is exactly the bug this prevents).
3. Every live progress message is injected as a context note (`[delegated-agent progress] …`) so the model *knows* what's happening even when it doesn't speak.
4. **Throttled spoken updates**: the first no earlier than ~5 s into a delegation burst (`FirstNarrationDelayMs`), subsequent ones at ≥8 s spacing (`NarrationIntervalMs`) — and the spacing floor is **session-global**, so back-to-back tool calls can't re-arm the faster first-update path. Floods of small updates **aggregate** into one digest (up to 4 distinct messages, deduped, oldest-first). If the model is busy or audio is still audibly playing, the update retries in 1.5 s — hosts must gate on **both** `IsBusy` and `IsAudioPlaying`, or queued utterances come out late and stale. When the result lands first, the pending narration is cancelled (it's moot — the result is about to be spoken).
5. The spoken update itself is `BaseRealtimeClient.RequestSpokenUpdate(instructions)`. The instruction wording is **DB-driven**: the `Realtime Co-Agent - Progress Narration` prompt (`metadata/prompts/`) carries the template with `{{ progressMessage }}`, `{{ updateNumber }}`, and `{{ priorNarrations }}` placeholders — resolved server-side at session prepare (`RealtimeClientSessionService.NarrationPromptName`, with a deprecated-name fallback to `Voice Co-Agent - Progress Narration` for un-resynced deployments) and threaded to the browser, with a built-in fallback when the deployment hasn't synced the prompt. The template enforces strictly **first-person** narration (the co-agent owns the work — "I'm digging into that now", never "Sage is analyzing"), bans repetition (prior spoken narrations are chained into the instructions), and bans generic filler.
6. Narration transcripts are tagged `Kind: 'narration'` by the client driver and are **ephemeral by product decision**: surfaced as a transient "live note" in the overlay (`DelegationNarration$`), never captions, never persisted as `Conversation Detail`s.

**The server-bridged pipeline** (B3 — `RealtimeSessionRunner`): the runner wraps every delegation in a narration burst (`runDelegateWithNarration`). Each significant progress event is fed to `IRealtimeSession.SendContextNote?.()` as a `[delegated-agent progress]` note, and spoken updates are paced by the same engine rules as the browser — first update no earlier than ~5 s into a burst (`FirstNarrationDelayMs`), ≥8 s **session-global** spacing (`NarrationIntervalMs`), buffered messages deduped and aggregated into one digest, pending narration cancelled on delegation completion and on barge-in. Instructions come from `BuildServerNarrationInstructions` — the DB template with `{{ progressMessage }}` / `{{ updateNumber }}` substituted; `{{ priorNarrations }}` gets a neutral note because the server cannot observe what the model actually *said* (those transcripts ride the provider socket — the browser host chains real prior narrations, the server-side builder is deliberately compact). Both capabilities are feature-detected: on a provider whose session lacks `RequestSpokenUpdate`, progress still flows as context notes; lacking both, narration is simply absent. The drivers themselves are the collision safety net (queue or skip per the `RequestSpokenUpdate` contract), so the runner does not gate on busy state.

**Prompt seed**: the instruction template is the `Realtime Co-Agent - Progress Narration` prompt (`metadata/prompts/`), resolved with a deprecated-name fallback to `Voice Co-Agent - Progress Narration` for deployments that haven't re-synced the renamed seed (`NARRATION_PROMPT_NAME` / `LEGACY_NARRATION_PROMPT_NAME` in `realtime-narration.ts`).

---

## 8. Observability & Administration

### Run topology

A voice session produces a standard, navigable run tree:

- A **co-agent `AIAgentRun`** (`Status: 'Running'`, stamped `AgentSessionID` + `ConversationID` + `AgentID`) plus a linked **`AIPromptRun`** (stamped with both `AgentRunID` *and* `AgentID`, so the run shows on the agent's own history too) plus a single **`MJ: AI Agent Run Steps`** row (StepNumber 1, `StepType: 'Prompt'`, `TargetID` = the system `AIPrompt`, `TargetLogID` = the linked prompt run — so the co-agent run's Timeline is non-empty and drills into the prompt run) are created at session start by `RealtimeClientSessionService.createCoAgentObservabilityRun` (best-effort — failure never blocks the call). Their ids persist in the session's config and `SessionManager.CloseSession` finalizes all three via `FinalizeCoAgentRun` (`Completed`/`Failed`, `CompletedAt`, and a `Success` stamp), idempotently, even when the close comes from the janitor.
- Every **delegated target-agent run** nests under the co-agent run via `ParentRunID` and shares the `AgentSessionID` — the delegation tree groups under the session.
- The **transcript** is the session-stamped `Conversation Detail` rows; **channel state** is on the session-channel rows; **artifacts** link in via the conversation-detail junction (with a hidden anchor detail when no transcript turn exists yet — see [§3](#3-topologies-client-direct-vs-server-bridged)).
- **Usage telemetry lands on the co-agent `AIPromptRun` in both topologies** (B7). Server-bridged: `RealtimeSessionRunner` checkpoints accumulated usage on a debounced cadence (default 5 s) — a crash-driven janitor close finalizes from the last-persisted values and loses nothing. Client-direct: the browser accumulates the client driver's `OnUsage` token deltas and flushes them via the `RelayRealtimeUsage` mutation, debounced (10 s) plus once at teardown; the resolver clamps and **accumulates** the deltas onto `TokensPrompt`/`TokensCompletion` (recomputing `TokensUsed`), accepts a post-close flush, and tolerates every failure (usage relay must never break a live call). Providers without usage events (ElevenLabs, AssemblyAI) simply never emit — the run's token counts stay zero and cost accounting lives provider-side. Still deferred: linking persisted transcript turns to those runs.

### Admin surfaces

- **AI Analytics dashboard → Realtime Voice** (`packages/Angular/Explorer/dashboards/src/AI/components/analytics/realtime/`): `realtime-overview.component.ts` (KPI row — active sessions, sessions in window, average duration, delegated runs, janitor closes, cost; sessions-over-time; channel-usage donut; top delegated targets; recent sessions) and `realtime-sessions.component.ts` (the full sessions grid: Agent → Target, status pills **including the persisted close cause** — explicit / janitor / shutdown / error / unknown-legacy, channel icons, run counts, tokens/cost, host instance, row drill-in to the session record).
- **Custom entity forms** for `MJ: AI Agent Sessions` and `MJ: AI Agent Channels` (`packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgentSessions/`, `.../AIAgentChannels/`).
- **In-call developer mode**: the overlay's gear toggle reveals "Open run" links on delegation cards and an "Open session" link in the banner; clicking minimizes the call (the session stays live) and emits a navigate request the host resolves.

### Session review (review-on-reopen) & resume carryover

A past session can be reopened in **review mode**: `ConversationChatAreaComponent.OpenRealtimeSessionReview(agentSessionId)` loads the session through `RealtimeSessionReviewService` (`packages/Angular/Generic/conversations/src/lib/services/realtime-session-review.service.ts`) — a stateless, tolerant batch loader that folds the session row, its persisted caption turns (`MJ: Conversation Details` by `AgentSessionID`), its delegated runs (excluding each leg's co-agent observability run), and its saved channel states into one `RealtimeSessionReview`.

The loader is **chain-aware**: when the reviewed session was a resume (`LastSessionID` set), it walks the chain *backwards* — capped at 5 legs (`MAX_REVIEW_LEGS`) and 500 total caption rows (`MAX_REVIEW_DETAILS`, oldest legs trimmed first), cycle-guarded so a corrupt A→B→A chain can't loop — and surfaces every leg chronologically on `Review.Legs`. `BuildReviewThreadItems` renders a **divider** between legs ("Session leg started · *time*", carrying the *previous* leg's `CloseReason` as a chip — explicit / janitor / shutdown / error), so a multi-call conversation arc reads as one episode. Channel state stays the latest leg's only (earlier boards were superseded on resume). The chain's conversation-history **artifacts** (the `MJ: Conversation Detail Artifacts` junctions, Direction `Output` — including ones hung off hidden anchor details) load too, and review mode registers each as an unfocused artifact tab on the surface panel.

The call overlay then renders the past session instead of a live call: a "Session review" banner badge with the lifecycle range + close-reason chip, the **same** thread/rail components replaying the historical turns and delegation cards, and a **read-only Whiteboard tab** when the session saved a parseable board state. Everything live is dead in review — no mic, no composer; the controls collapse to **"Start live session"** (emits `RealtimeStartLiveRequest`, resuming as a *new* session chained via `lastSessionId` — which restores saved channel states through `PriorChannelStatesJson` *and* hydrates the prior transcript into the new model's prompt, see [§4](#4-session-lifecycle)) and Close. On the review→live edge, the review-registered (template-based, read-only) Whiteboard tab is removed **only when the live session's channel set has no Whiteboard channel** — when it has one, the live plugin re-registers the same tab key and upgrades the pane in place; review *artifact* tabs are deliberately kept (wanted carryover). The rule is the pure `ShouldRemoveReviewWhiteboardTab` helper next to `RealtimeSurfaceTabsModel.RemoveTab` in `realtime-surface-tabs.model.ts` (the Activity tab itself is irremovable by model contract; removing a focused tab falls focus back to Activity).

**Deep link**: the custom `MJ: AI Agent Sessions` form ships an "Open session review" affordance that navigates to the conversations resource with a `realtimeSessionId` query param; `ChatConversationsResourceComponent` picks it up (initial load *and* later `OnQueryParamsChanged` deliveries) and calls `OpenRealtimeSessionReview` once the chat area is ready.

The plan's complementary timeline treatment — the conversation rendering a completed session as a single **collapsed session block** ("🎙 Voice session · 14 min · 6 exchanges · 2 agent runs") inline in the message history — remains a UX direction; today the session's turns appear as ordinary conversation messages, and review mode is the way to replay an episode as an episode.

---

## 9. Security Model

Authorization is overwhelmingly reuse of existing primitives, plus a small number of session-specific gates:

- **`CanRun` on the *target* agent gates session creation** — `AIAgentPermissionHelper.HasPermission(targetAgentId, user, 'run')` in both `SessionManager.CreateSession` and `RealtimeClientSessionResolver.assertCanRunTarget`. The co-agent is internal orchestration; the meaningful permission is on the agent doing real work. Denial throws before any row is written.
- **Runtime overrides are authorization-gated** — `configOverridesJson` and a *deviating* explicit `preferredModelId` require the seeded **`Realtime: Advanced Session Controls`** authorization (hierarchy-aware via `AuthorizationEvaluator`; fail-closed when the seed is absent); a deviating model is additionally subject to the effective `allowUserModelOverride` policy. Denial is a structured rejection, never a silent ignore — unauthorized users still get a fully working session on the co-agent's configured defaults. Pairing rows restrict *which* targets a constrained co-agent fronts, but they are a targeting constraint layered on top of `CanRun`, never a replacement for it (see [§4](#co-agent-pairing--effective-configuration)).
- **Session ownership on every inbound operation** — every relay (`ExecuteRealtimeSessionTool`, `RelayRealtimeTranscript`, `SaveSessionChannelState`, `SaveSessionChannelArtifact`, `CancelRealtimeSessionTool`, `RelayRealtimeUsage`) loads the session and enforces `UUIDsEqual(session.UserID, contextUser.ID)`; tool/transcript relays additionally reject `Closed` sessions, while state/artifact saves, the cancel channel, and usage relay accept them (the final flush legitimately lands post-close, and a cancel can legitimately race teardown). Channel-state **restore** and **prior-transcript hydration** are ownership-checked too — another user's prior session never leaks state *or* words.
- **The target agent cannot be swapped mid-session** — it is stored server-side in the session's config at start and read back on every relay; the browser never re-supplies it.
- **Tools execute under the session's `contextUser`** with the request-scoped provider — a realtime model calling a tool can do exactly what the user could do, no more. The provider owning the conversation is never an authorization bypass.
- **Client-declared tools grant zero server capability.** `clientToolsJson` declarations (channel/UI tools) are *declared* to the model so it can call them, but the server never executes them — a relayed call for one of those names falls into the structured "not available" path. Declarations are still validated to stop config bloat: ≤16 tools, ≤64,000 chars total, per-tool shape checks (name ≤128 chars, description non-empty, schema a plain object); channel-state payloads cap at 2,000,000 chars (per state and accumulated on restore).
- **Ephemeral, provider-scoped tokens** — the browser never sees a long-lived provider key. OpenAI bakes the full session config (instructions + tools) into the minted client secret; Gemini token-locks the mask-safe generation subset via `liveConnectConstraints` + `lockAdditionalFields: []` (system prompt/tools ride the driver-applied `SessionConfig`; see [§3](#what-an-ephemeral-token-can-lock--provider-differences)). Token expiry mid-session surfaces as a `Fatal` error so the session finalizes cleanly.
- **XSS-safe exports** — every user/agent-authored string in whiteboard HTML/SVG exports is HTML-escaped before touching the document, and live widget HTML is never inlined in exports (no sandbox exists there).
- **Sandboxed agent-authored HTML** — whiteboard HTML widgets run in `allow-scripts`-only iframes (opaque origin — no parent DOM, session, cookies, or storage); the only outbound channel is the validated, size-capped `MJWhiteboard.submit` postMessage bridge, gated on a tracked-frame source check. Markdown panels render through the sanitized shared markdown component. See the [ng-whiteboard README](../packages/Angular/Generic/whiteboard/README.md) for the full sandbox rationale.
- **Deferred**: channel-grained permissions (today: if you can run the agent, you can use its channels), multi-party sessions (`AIAgentSession.UserID` is singular by design), and audio retention (off — the text transcript is the durable record).

---

## 10. Known Gaps & Deferred Work

Honest ledger of what is *not* done on this branch, so nobody reads aspiration into the docs above. (Items previously listed here and since **shipped** — the ElevenLabs and AssemblyAI drivers, server-bridged narration consumption, client-direct usage relay, prior-session transcript hydration, the delegation cancel channel — have been pruned; they are documented in the sections above.)

| Item | Status |
|---|---|
| Server-bridged client media plane (browser audio ↔ server socket, the plan's P5 / WebRTC transport) | **Not built** — client-direct is the shipped audio path; server-bridged runs are fully wired up to the provider socket but have no client media transport |
| Transcript `Replaces` marker | **Shipped** — `RealtimeClientTranscript.ReplacesPrevious` is the machine-readable correction marker: the ElevenLabs driver stamps it on `agent_response_correction`, the overlay replaces the caption in place, and `RelayRealtimeTranscript(replacesPrevious)` UPDATES the persisted turn instead of appending (insert fallback when no prior turn exists). The server-bridged `RealtimeTranscript` type can adopt the same field when that path needs it |
| Provider `session.resume` windows | **AssemblyAI shipped** — the client driver captures `session_id` from `session.ready` and, on an unexpected socket drop, makes ONE reattach inside the provider's 30-second window (`session.resume` first frame; `'connecting'` shown while reattaching; mic worklet + playout engine survive; a failed/second drop falls through to the pre-existing fatal path). Gemini's `sessionResumption` token remains unused — it needs server-mint participation (documented TODO); MJ's own chain resume (`LastSessionID`) is unchanged and complementary |
| Transcript-turn → co-agent-run linkage | **Deferred** (noted in `RelayRealtimeTranscript`'s doc comment) — turns are session-stamped but not linked to the observability runs |
| *Chat* conversation-history hydration into the companion prompt | **MVP gap** — the resolver passes `ConversationMessages: []` (the service supports it). Distinct from the **shipped** prior-*session* transcript hydration on resume (§4) |
| Collapsed session block inline in the conversation timeline | **UX direction only** — session review mode (see §8) ships the replay; the inline collapsed-block rendering in message history is not built |
| Unified session transport (`SessionEnvelope` / `ISessionTransport`) | **Independent track** per the plan — voice deliberately does not depend on it |
| Video channel / video modality | **Deferred** — `BaseRealtimeModel`'s contract anticipates it |
| Server-side channel plugin execution (`ServerPluginClass` consumption) | **Shipped with scope notes** — `BaseRealtimeChannelServer` (in `@memberjunction/ai`) is resolved per session by `RealtimeChannelServerHost` from the ACTIVE registry rows and wired into the durable lifecycle: session start (`SessionManager.CreateSession`), pre-persistence channel-state saves (`SaveSessionChannelState`), and session close from every provenance incl. the janitor (`SessionManager.CloseSession`); `WhiteboardChannelServer` ships as the reference (state-of-record validation/canonicalization). **Not** covered: socket/media members (deferred with the unified-transport track) and server-tool contribution to `RealtimeSessionRunner` (documented TODO — no code path gives the server-bridged runner per-session channel instances yet). See [§5](#5-channels--the-heart-of-the-system) |
| Non-target server tools on the client-direct relay (action wiring through `executeNonTargetTool`) | **Later phase** — structured "not available" today; the server-bridged path already executes actions |
| Channel-grained permissions, multi-party sessions, audio retention/consent | **Out of scope** for this iteration (see plan) |
| `RealtimeClientSessionService` ↔ `BaseAgent` prepare-logic duplication | **Known debt** — the service's doc header calls for a future shared `RealtimeSessionPreparer`; until then the two are kept in sync intentionally (the shared `realtime-narration.ts` and `realtime-coagent-config.ts` modules are the first extracted pieces — both paths consume the same effective-config merge) |
| Per-driver voice plumbing for the effective config (`realtime.voice.providers`) | **Partially shipped** — provider-matched settings flow into the open `Config` bag (server-bridged: OpenAI spread, Gemini merge-last, AssemblyAI `voice` mapping). **TODOs**: `OpenAIRealtime.CreateClientSession` does not fold `params.Config` into the minted client-direct session (clients apply `EffectiveConfigJson` instead); the ElevenLabs server driver provisions voice on its managed agent and consumes no per-session bag |

---

## 11. Audio-Reactive Call Visuals (Audio Activity Metering)

The call overlay is a PROGRESSIVE-DISCLOSURE console (see `realtime-disclosure.ts` +
`ng-conversations`' README): a first-ever call is **pure audio** — a breathing hero orb and
three controls, with the caption thread / composer dock / surface panel / gear unlocking by
level (0–4) as the user acts or across sessions via a per-user UserInfoEngine milestones
ratchet (`mj.realtimeVoice.uxMilestones.v1`; the gear's Simple/Standard/Pro/Auto density
control is the escape hatch). Content never flips the console open — the ONE auto-reveal is
a channel's first agent activity (`ChannelActivity$`), which opens the surface panel as a
peek with that channel's tab focused; finished artifacts arrive as unfocused, glowing tabs.

That pure-audio hero orb doesn't *act out* speech — it **reacts to the actual
waveform**, vibrating like a speaker cone with the agent's voice and flipping color when the
user talks. Three layers, each degrading gracefully:

### The capability contract (client drivers)

`BaseRealtimeClient.GetAudioActivity(): RealtimeAudioActivity | null` is a **capability, not
an obligation** (driver obligation #9): per-direction RMS levels (0..1) plus 9 normalized
frequency bins, or `null` for any direction the driver couldn't meter — full `null` when no
meters exist at all. Drivers attach meters through the protected
`attachInputAudioMeter` / `attachOutputAudioMeter` hooks and MUST release them on disconnect
(`closeAudioMeters()`).

Metering sources per driver (all four currently meter BOTH directions):

| Driver | Agent audio (output) | User mic (input) |
|---|---|---|
| OpenAI (WebRTC) | `RealtimeAudioMeter.ForStream` on the remote track's stream (attached in `ontrack`) | `ForStream` on the mic stream at Connect |
| Gemini / ElevenLabs / AssemblyAI (client-owned audio) | `RealtimePcmPlayback.CreateMeter()` — an `AnalyserNode` on the playout engine's master gain | `ForStream` on the mic stream |

`RealtimeAudioMeter` (in `packages/AI/RealtimeClient/src/audio/audioMeter.ts`) is defensive
by contract: factories return `null` where Web Audio is unavailable (tests, SSR), and the DSP
math (`ComputeRmsLevel`, `BucketizeFrequencyData`) is exported pure for unit testing.

### The sampling loop (call overlay)

`VoiceSessionService.GetAudioActivity()` is a plain passthrough; the overlay runs ONE
`requestAnimationFrame` loop **outside Angular** that samples it, runs the frame through
`RealtimeAudioVisualSmoother` (attack/decay envelopes + direction hysteresis — see
`realtime-audio-visuals.ts` in ng-conversations), and writes CSS custom properties
(`--voice-out`, `--voice-in`, `--eq-1..9`) plus `data-audio-live` / `data-voice-dir`
attributes directly on the rendered overlay element. Zero change detection per frame.

### The render gate (CSS)

All audio-reactive rules key off `[data-audio-live='true']`: orb scale follows the smoothed
output envelope, the EQ bars become a true spectrum, and `[data-voice-dir='user']` recolors
orb + bars green (the established "user audio" palette). When a driver attaches no meters the
attribute stays `false` and the original turn-state keyframe animations remain in charge —
**the fallback is the pre-existing behavior, not a degraded new one**.

---

## Reference Map

| Concern | Where |
|---|---|
| Model primitive + driver obligations | `packages/AI/Core/src/generic/baseRealtime.ts` |
| Channel plugin contract — server half (+ host + reference impl) | `packages/AI/Core/src/generic/baseRealtimeChannelServer.ts`, `packages/AI/Agents/src/realtime/realtime-channel-server-host.ts`, `packages/AI/Agents/src/realtime/whiteboard-channel-server.ts` |
| Server drivers | `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts`, `packages/AI/Providers/Gemini/src/geminiRealtime.ts`, `packages/AI/Providers/ElevenLabs/src/elevenLabsRealtime.ts`, `packages/AI/Providers/AssemblyAI/src/assemblyAIRealtime.ts` |
| Browser drivers + shared PCM audio plane | `packages/AI/RealtimeClient/` ([README](../packages/AI/RealtimeClient/README.md)) — `src/drivers/*`, `src/audio/*` |
| Agent type / runner / broker / client-session service / shared narration / memory builder | `packages/AI/Agents/src/agent-types/realtime-agent-type.ts`, `src/realtime/*` (incl. `realtime-narration.ts`), `src/agent-memory-context-builder.ts` |
| Session records, janitor, host identity | `packages/MJServer/src/agentSessions/` |
| GraphQL resolvers | `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`, `AgentSessionResolver.ts` |
| Browser orchestration + overlay + channels + session review | `packages/Angular/Generic/conversations/src/lib/services/voice-session.service.ts`, `src/lib/services/realtime-session-review.service.ts`, `src/lib/components/realtime/**` |
| Generic whiteboard (engine, tools, surfaces, exports, widget bridge) | `packages/Angular/Generic/whiteboard/` ([README](../packages/Angular/Generic/whiteboard/README.md)) |
| Admin dashboard | `packages/Angular/Explorer/dashboards/src/AI/components/analytics/realtime/` |
| Session / channel custom entity forms (incl. the review deep link) | `packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgentSessions/`, `.../AIAgentChannels/` |
| Schema | `migrations/v5/V202606090930__v5.41.x__AI_Agent_Sessions_Channels.sql` |
| Seeds | `metadata/agents/.voice-co-agent.json` (Realtime Co-Agent), `metadata/prompts/.voice-co-agent-*.json` (Realtime Co-Agent prompts), `metadata/ai-agent-channels/`, `metadata/ai-model-types/`, `metadata/ai-models/` (realtime rows incl. ElevenLabs Agents + AssemblyAI Voice Agent), `metadata/agent-types/` (Realtime), `metadata/artifact-types/` (Whiteboard) |
