# Real-Time Co-Agents Guide

How MemberJunction delivers **live, low-latency, full-duplex agents** — agents you talk to the way you talk to a person, that can draw on a shared whiteboard while they speak, and that delegate real work back to the async agents you already have.

This is the developer guide for the whole stack: the model primitive, the `Realtime` agent type, the Realtime Co-Agent, the dual-topology session architecture, the session/channel persistence layer, the interactive-channel plugin system (with the live Whiteboard as the canonical implementation), narration, observability, and security.

**Companion documents:**

- [`plans/ai-agent-sessions.md`](../plans/ai-agent-sessions.md) — the original architecture plan (Part I: realtime capability, Part II: session/channel infrastructure). This guide documents what actually shipped; the plan retains the rationale and the deferred tracks.
- [`packages/AI/RealtimeClient/README.md`](../packages/AI/RealtimeClient/README.md) — the browser-side driver package (`BaseRealtimeClient` + OpenAI/Gemini drivers).
- [`packages/AI/Agents/README.md`](../packages/AI/Agents/README.md) — the agent framework, including how `RealtimeAgentType` sits beside Loop and Flow.
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

---

## 1. The Concept: Co-Agents

### Real-time is a complement, not a replacement

MJ agents are **asynchronous by design**: a request arrives, an `AIAgentRun` does its work over seconds to minutes, results come back. That is exactly right for substantive work, and Loop/Flow agents are untouched by the realtime feature. What async agents cannot do is hold a *natural, low-latency conversation* — modern realtime models (GPT Realtime, Gemini Live) own the listen-reason-speak loop themselves, with provider-side voice activity detection, barge-in, and sub-second turn taking.

So instead of forcing the loop agent to drive a live call, MJ adds a **third agent type — `Realtime`** — a first-class peer of Loop and Flow (`RealtimeAgentType` in `packages/AI/Agents/src/agent-types/realtime-agent-type.ts`, registered as `@RegisterClass(BaseAgentType, "RealtimeAgentType")`, seeded in `metadata/agent-types/` with `DriverClass: "RealtimeAgentType"`). A Realtime agent does not iterate a reasoning loop; it wraps a long-lived duplex model session. The marker is `RealtimeAgentType.IsSessionDriven` (always `true`); `BaseAgent.isSessionDrivenAgentType()` duck-types that getter and branches into `executeRealtimeSession()` instead of the loop.

### One co-agent voices ANY agent

The first (and seeded) agent of this type is the **Realtime Co-Agent** (`metadata/agents/.voice-co-agent.json`). It is deliberately generic: it is the live voice **for** a *target* agent, and the target is a **runtime parameter**, not configuration baked into the co-agent. One Realtime Co-Agent definition fronts Sage, Query Builder, or anything else — agents gain voice by configuration, never by being rewritten.

Three design rules make this work:

1. **The realtime-registered tool set is stable and target-independent.** Every voice session registers the single `invoke-target-agent` tool (`INVOKE_TARGET_AGENT_TOOL_NAME` in `packages/AI/Agents/src/realtime/realtime-tool-broker.ts`) plus fixed UI/channel tools. The target is an argument *inside* that one tool; target-specific capabilities execute inside the delegated agent's own run and are never registered on the provider socket. This keeps the provider contract identical across targets (and is what would let a pre-provisioned, fixed-tool provider like Eleven Labs fit the same model later).
2. **Companion framing, never impersonation.** The system prompt (template: `metadata/prompts/templates/Voice Co-Agent - System Prompt.template.md`) frames the model as "the live voice for the agent" — first-person, owning the work ("I'm pulling that up"), never "pretend to be X" (which makes models refuse) and never third-person ("Sage is working on it").
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

---

## 2. The Triple-Registry Plugin Architecture

Realtime is pluggable along **three independent axes**, all resolved through `MJGlobal.ClassFactory` + metadata. Nothing in the hosts (the session runner, the resolver, the Angular overlay) names a concrete provider or channel.

| Registry | Base class | ClassFactory key comes from | Shipped implementations |
|---|---|---|---|
| **Server model drivers** | `BaseRealtimeModel` (`packages/AI/Core/src/generic/baseRealtime.ts`) | `MJ: AI Model Vendors.DriverClass` on a model of `AIModelType = 'Realtime'` | `OpenAIRealtime` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts`), `GeminiRealtime` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts`) |
| **Client model drivers** | `BaseRealtimeClient` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`) | `ClientRealtimeSessionConfig.Provider` — the string the server driver stamps when it mints (`'openai'`, `'gemini'`) | `OpenAIRealtimeClient`, `GeminiRealtimeClient` (same package) |
| **Client channel plugins** | `BaseRealtimeChannelClient` (`packages/Angular/Generic/conversations/src/lib/components/realtime/channels/base-realtime-channel-client.ts`) | `MJ: AI Agent Channels.ClientPluginClass` | `RealtimeWhiteboardChannel` (key `'RealtimeWhiteboardChannel'`) |

Server model drivers are resolved by `BaseAgent.resolveRealtimeModel()` (server-bridged) and `RealtimeClientSessionService.resolveVendorAndInstantiate()` (client-direct): highest-`PowerRank` active `Realtime` model → highest-`Priority` active vendor whose `DriverClass` has a resolvable API key (`GetAIAPIKey`, e.g. `AI_VENDOR_API_KEY__OpenAIRealtime`) → `ClassFactory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, driverClass, apiKey)`. An explicit `preferredModelId` bypasses ranking and **fails with a specific reason** rather than silently falling back (`resolvePreferredRealtimeModel`).

Client model drivers are resolved in `VoiceSessionService.createRealtimeClient()` by the server-reported `Provider` key. Channel plugins are resolved in `VoiceSessionService.loadActiveChannels()` from the active `MJ: AI Agent Channels` rows.

> [!NOTE]
> The channel registry also carries a `ServerPluginClass` column (seeded `'WhiteboardChannelServer'` for the Whiteboard) and a `TransportType` (`PubSub` / `WebRTC` / `WebSocket`). Server-side channel plugin *resolution* is not yet consumed by any code path — the server currently handles channel persistence generically (`SaveSessionChannelState` / `SaveSessionChannelArtifact`). The column is the registered seam for future server-side channel behavior.

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

1. **Server driver.** In the provider's package (`packages/AI/Providers/<X>`), implement `BaseRealtimeModel.StartSession()` returning an `IRealtimeSession`, and register it: `@RegisterClass(BaseRealtimeModel, '<X>Realtime')`. Build against an injectable connection seam (see `IOpenAIRealtimeConnection` / `GeminiLiveSession`) so unit tests can drive provider-shaped frames with no network — both existing drivers ship extensive vitest suites this way.
2. **Client-direct support (optional).** Override `SupportsClientDirect` to `true` and implement `CreateClientSession()` to mint an ephemeral token + provider-native `SessionConfig`, stamping a unique `Provider` key.
3. **Client driver.** In `@memberjunction/ai-realtime-client`, extend `BaseRealtimeClient`, register under the same `Provider` key (`@RegisterClass(BaseRealtimeClient, '<x>')`), export a `Load<X>RealtimeClient()` no-op, and have hosts call it (the existing Load calls live at the top of `voice-session.service.ts` — tree-shaking prevention).
4. **Metadata.** Add the `MJ: AI Models` row (`AIModelTypeID` → `Realtime` type) with an `MJ: AI Model Vendors` association carrying `DriverClass: '<X>Realtime'` and the provider `APIName`, in `metadata/ai-models/`; push with `mj sync`. Reference rows: `GPT Realtime 2` (APIName `gpt-realtime-2`) and `Gemini 3.1 Flash Live` (APIName `gemini-3.1-flash-live-preview`).
5. **API key.** `AI_VENDOR_API_KEY__<DriverClass>` (or the deployment's key-resolution path consumed by `GetAIAPIKey`).

No host code changes: the resolver ranks the new model by `PowerRank`/`Priority`, and the browser resolves the client driver by the minted `Provider` string.

### Recipe: add a new interactive channel

Covered in depth in [§5](#5-channels--the-heart-of-the-system); the short version:

1. Subclass `BaseRealtimeChannelClient<YourSurfaceComponent>`, implementing the channel contract (tools + perception + surface + state of record).
2. `@RegisterClass(BaseRealtimeChannelClient, '<YourClientPluginClass>')` + a `Load...()` no-op called from a static code path (the Whiteboard's is called from `conversations.module.ts`).
3. Seed an `MJ: AI Agent Channels` row (`Name`, `ClientPluginClass`, `ServerPluginClass`, `TransportType`, `IsActive: true`) in `metadata/ai-agent-channels/` and push with `mj sync`.
4. Done — `VoiceSessionService.startChannels()` resolves every active registry row at session start, declares the plugin's tools to the model, registers its prefix-routed local executor, and the overlay registers a surface tab per plugin. The shell carries **zero** channel-specific wiring.

---

## 3. Topologies: Client-Direct vs Server-Bridged

The same tool-execution semantics run in two transport topologies. The shared piece is `RealtimeToolBroker` (`packages/AI/Agents/src/realtime/realtime-tool-broker.ts`) — both topologies route every tool call through it so results are byte-for-byte identical: `invoke-target-agent` → delegate (with a broker-owned per-call `AbortController` so barge-in cancels the run), everything else → the injected tool executor; failures serialize to `{ success: false, error }` so the model can *narrate* failures instead of going silent.

### Decision table

| | **Client-direct** (shipped MVP, drives Explorer voice) | **Server-bridged** (`RealtimeSessionRunner`) |
|---|---|---|
| Provider socket lives | In the **browser** (OpenAI: WebRTC; Gemini: WebSocket via `@google/genai` Live) | On the **server** |
| Audio path | Browser ↔ provider directly — frames never transit MJ (lowest latency) | Server ↔ provider; **no client media transport is wired yet** (the plan's P5 media plane) |
| Prompt/tool authority | **Server** — it builds the session config; the browser applies it verbatim | Server (it owns the socket) |
| Tool execution | Relayed: browser → `ExecuteRealtimeSessionTool` mutation → `RealtimeToolBroker` → result JSON → browser → `SendToolResult` | In-process: `RealtimeSessionRunner.handleToolCall` → broker → `IRealtimeSession.SendToolResult` |
| Non-target tools | Channel/UI tools execute **locally in the browser** (never relayed); relayed unknown tools get a structured "not available" (`RealtimeClientSessionService.executeNonTargetTool` — action wiring is a later phase) | Agent **actions** execute via `BaseAgent.executeRealtimeTool` → `ExecuteSingleAction` |
| Entry point | `StartRealtimeClientSession` mutation → `RealtimeClientSessionService.PrepareClientSession` | `AgentRunner.RunAgent` on a Realtime-type agent → `BaseAgent.executeRealtimeSession` |
| Narration / context notes | Browser calls `BaseRealtimeClient.SendContextNote` / `RequestSpokenUpdate` (fully wired — see [§7](#7-progress-narration)) | `IRealtimeSession.SendContextNote` / `RequestSpokenUpdate` exist on the drivers, but the runner does **not yet consume** delegation progress to feed them (pending) |

### Client-direct flow (the shipped path)

1. **Mint.** The browser (`VoiceSessionService.StartVoiceSession`) calls `StartRealtimeClientSession(targetAgentId, conversationId?, lastSessionId?, preferredModelId?, clientToolsJson?, coAgentId?)`. The resolver authorizes `CanRun` on the **target** agent, resolves the co-agent (chain in §1), creates the durable `AIAgentSession` via `SessionManager.CreateSession` (storing `targetAgentID` **server-side** in the session's `Config` column — accessed as `Config_` on the generated entity), then `RealtimeClientSessionService.PrepareClientSession` resolves the model, assembles the companion system prompt (framing + co-agent prompt + target identity + history + memory via `AgentMemoryContextBuilder` — the same context a loop agent injects), builds the stable tool set, and asks the driver to `CreateClientSession`. On mint failure the just-created session is closed with `CloseReason = 'Error'` so nothing half-open leaks.
2. **Connect.** The browser resolves the client driver by the returned `Provider` key and calls `Connect(config, micStream)` — the host acquires the mic (it owns the permission UX); the driver owns the transport, applies `SessionConfig` verbatim once the control channel opens, and only then reports `'listening'`.
3. **Converse.** Transcripts stream both ways; final normal turns become captions and are persisted via `RelayRealtimeTranscript` (a `Conversation Detail` stamped with `AgentSessionID`). Typed text rides `SendText` — which **implies barge-in**: the driver cancels any active spoken response (`CancelActiveResponse`, a floor-control action that never aborts server-side delegated work) before injecting the text, then routes the reply through the same collision-safe path tool results use.
4. **Tools.** Tool calls whose names match a registered client-tool prefix (e.g. `Whiteboard_`) execute **locally**; everything else relays to `ExecuteRealtimeSessionTool`, which reads the target from the session config (never from the client), threads a progress callback, nests the delegated run under the co-agent run, and rolls a `pendingFeedbackRunID` forward when an interactive target pauses `AwaitingFeedback` — so the user's next answer **resumes the same run** (`lastRunId` + `autoPopulateLastRunPayload`).
5. **End.** Teardown flushes pending channel saves, disposes plugins, stops the mic, disconnects the driver, and calls `CloseAgentSession`; `SessionManager.CloseSession` stamps `CloseReason = 'Explicit'`, disconnects channel rows, and finalizes the co-agent observability runs.

### What an ephemeral token can lock — provider differences

Both providers keep prompt/tool authority server-side in the client-direct topology, but **how much the minted credential itself enforces differs**:

- **OpenAI** (`OpenAIRealtime.CreateClientSession`): the full realtime session config — `instructions` (system prompt), `tools`, input-transcription opt-in — is baked into the **client secret** at mint time via the client-secrets API. The browser's `session.update` applies the same config; tampering buys nothing the secret didn't already fix.
- **Gemini** (`GeminiRealtime.CreateClientSession`): the ephemeral-token API accepts only a **mask-safe subset** as `liveConnectConstraints.config` (`GeminiRealtime.BuildConstraintConfig`): `responseModalities`, `speechConfig`, `temperature`, `topP`, `maxOutputTokens`, `sessionResumption` — locked with `lockAdditionalFields: []`. **`systemInstruction`, `tools`, and the transcription configs cannot be locked** (their presence 400s the mint); they ride in `SessionConfig` and the matching client driver applies them verbatim. So on Gemini the token locks model + generation parameters, while prompt/tool integrity relies on the driver-applied config rather than a token-side lock. Token windows: ~10 minutes to *open* a new session, ~30 minutes total lifetime.

### Server-bridged flow (wired, awaiting a media plane)

`BaseAgent.executeRealtimeSession` (in `packages/AI/Agents/src/base-agent.ts`) is fully implemented: it resolves the model, creates **one long-lived `AIPromptRun`** for the session (usage is checkpointed incrementally onto it — crash-safe by design), builds `RealtimeSessionRunnerDeps` (delegation via `ExecuteSubAgent`, actions via `ExecuteSingleAction`, transcript persistence, debounced usage checkpoints — default 5 s), and drives `RealtimeSessionRunner.Run()`. The runner passes the tool set via `StartSession` params (the canonical registration path — for connect-bound providers like Gemini Live, the *only* effective one) and wires `OnTranscript` / `OnToolCall` / `OnUsage` / `OnInterruption` (barge-in aborts the in-flight delegated run via `RealtimeToolBroker.AbortInFlight`) / `OnError` (a `Fatal` error finalizes the session via `Stop()` instead of idling on a dead socket).

What is **not** wired yet for server-bridged: a client media transport (browser audio in/out of the server socket — `IRealtimeSession.SendInput` / `OnOutput` have no client-facing pipe), and narration consumption (the runner does not yet call the optional `SendContextNote` / `RequestSpokenUpdate` capabilities). The client-direct topology is the path Explorer voice uses today.

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

Continuity is real, not cosmetic: `StartRealtimeClientSession` with a `lastSessionId` triggers `loadPriorChannelStatesJson()` — the prior session's `AIAgentSessionChannel.Config` blobs come back as `PriorChannelStatesJson` (a `{ channelName: stateJson }` map), and `VoiceSessionService.applyPriorChannelStates()` offers each entry to the matching plugin via `BaseRealtimeChannelClient.RestoreState`. The whiteboard you drew last call reappears in the next one. Restore is **strictly best-effort and ownership-checked**: a prior session owned by another user, an oversized state (> 2,000,000 chars per state and in total), or a malformed payload is logged and skipped — a session start never fails because of restore.

---

## 5. Channels — The Heart of the System

A channel is more than transport. An **interactive channel** is a bidirectional surface the session's *single* realtime agent both **perceives** and **acts upon**. One agent per session is a hard invariant — everything every channel observes feeds that one agent, and every channel mutation comes from it.

Every interactive channel implements two directions:

1. **Perception (channel state → agent context).** The channel serializes **compact, coalesced deltas** of its state and feeds them into the live model as background context notes — *replace-current-state* semantics, never full snapshots, never bitmaps.
2. **Action (agent → channel mutation).** The channel exposes **mutation tools** the model can call; they execute and the result feeds back as the `tool_response` the model narrates.

### The definition registry

`MJ: AI Agent Channels` rows define what channels exist (see [§4 schema](#4-session-lifecycle)). At session start `VoiceSessionService` reads the **active** rows and instantiates one plugin per row via the ClassFactory (`ClientPluginClass` key) — one fresh instance per session, never a singleton. Registry failures degrade to "no channels"; the voice session always proceeds.

### Per-session state of record

Each attached channel gets an `AIAgentSessionChannel` row. Its `Config` column is the channel's **state of record** — written by the `SaveSessionChannelState` mutation through a client-side debounce (3 s, latest-state-wins, flushed at teardown with the session id captured while live so the final save lands even on the just-closed session). The model's perception feed is *derived* from this state, never the source of truth. A `Closed` session still accepts state saves (the final flush legitimately lands after `CloseAgentSession`).

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

### The implicit voice/text channel

Voice itself is not a registry row — it **is the session**: the provider socket, live captions, the typed-input composer, and the persisted transcript. Concretely:

- Every **final, normal** transcript turn (both roles) becomes a caption and a `Conversation Detail` stamped with `AgentSessionID` (`RelayRealtimeTranscript` → `persistTranscriptTurn`; roles map `user → 'User'`, everything else → `'AI'`). That is the durable transcript — raw audio is not persisted.
- **Typed text** (`VoiceSessionService.SendText`) is injected as a user turn through the same collision-safe response path tool results use, then rides the same caption + relay path as speech — a typed turn behaves identically to a spoken one.
- **Narration** turns (`Kind: 'narration'`) are deliberately ephemeral — never captions, never persisted (see [§7](#7-progress-narration)).

### The Whiteboard — canonical interactive channel

`RealtimeWhiteboardChannel` (`packages/Angular/Generic/conversations/src/lib/components/realtime/whiteboard/whiteboard-channel.ts`, registered as `'RealtimeWhiteboardChannel'`, seeded registry row `Name: 'Whiteboard'`) is the reference implementation. Read it before writing a new channel.

**Tool surface** (`whiteboard-tools.ts`, prefix `Whiteboard_`): `Whiteboard_AddNote` (sticky notes), `Whiteboard_AddShape` (labeled rect/ellipse/diamond boxes), `Whiteboard_AddText` (free-floating labels), `Whiteboard_DrawConnector` (arrows between items by id or absolute points), `Whiteboard_Highlight` ("pointing without touching" — a pulsing region the user dismisses with a click), `Whiteboard_MoveItem`, `Whiteboard_RemoveItem`, `Whiteboard_StyleItem`. Every tool returns a `WhiteboardToolResult` `{ success, itemId?, summary?, error? }` — the `summary` is what the model narrates ("Added a sticky note…"). `ApplyWhiteboardAgentTool` is the pure, Angular-free engine round-trip; the bound host component adds UI garnish (violet pop-in animation, the agent-action toast with Undo, a presence cursor).

**Perception model** (`whiteboard-state.ts`): `WhiteboardState` is an Angular-free state engine — the **single mutation API** used by both the user's board tools and the agent's channel tools. Every mutation appends to a compact change journal and emits `Changed$`; the bound surface coalesces changes over **750 ms** and emits one `SceneDelta`, which the plugin pipes into the model as a `[whiteboard]`-prefixed context note. `BuildSceneDelta(sinceToken)` collapses the journal (multiple moves of one item → one `moved` entry) with replace-current-state semantics; `BuildSceneSummary()` produces the full compact scene that powers the **"What the agent sees" popover** (`whiteboard-agent-sees-popover.component.ts`) — the user can literally inspect the agent's perception feed. When the user clicks Undo on an agent-action toast, the plugin tells the model: `[whiteboard] user undid your last change`.

**Ownership / the violet system**: every item carries `Author: 'user' | 'agent'`. The violet treatment is **reserved for the agent** — agent stickies render violet regardless of tint, the user's pen/text palettes never offer violet, and ownership chips ("You" / the agent's name) make authorship unambiguous on the board and in exports. This is the UI-level answer to "render agent-driven mutations distinctly from the user's own edits."

**Styling**: curated font sizes (`WHITEBOARD_FONT_SIZES`: 12/14/18/24/32), font families (`sans`/`serif`/`mono`), weights, user sticky tints — the same constraints appear in the agent's tool schemas, so the agent can't produce off-palette output.

**Export / print** (`whiteboard-export.ts`): `BuildWhiteboardExportHtml` renders one fully self-contained HTML document (inline CSS, zero external references — the documented exception to design tokens) for Download/Print; `BuildWhiteboardExportSvg` for SVG. Every piece of user/agent-authored text is HTML-escaped via `escapeHtml` before touching the document, and output is deterministic for a given state + options.

**Artifact snapshots**: "Save to artifacts" snapshots the board JSON as a versioned `MJ: Artifacts` record via `SaveSessionChannelArtifact` — typed with the seeded **`Whiteboard` artifact type** (`metadata/artifact-types/`, `ContentType: application/json`, viewer `DriverClass: WhiteboardArtifactViewerPlugin`), best-effort linked into conversation history via a `MJ: Conversation Detail Artifacts` junction row against the latest session-stamped detail. On success the plugin tells the model the user saved the board, so it can reference the artifact naturally.

**Restore-on-resume**: `RestoreState` rehydrates a prior session's board **in place** into the same `WhiteboardState` instance (`LoadFromJSON`), so the save subscription and any later surface binding keep pointing at one engine. Malformed payloads return `false` and the board starts fresh.

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

- **Stepping stone**: planned **markdown/HTML widgets on the whiteboard** — agent-authored rich-text blocks as board items get most of the value (agent drafts a section, user drags/edits it) inside the existing channel, before a dedicated doc channel exists.
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

Delegated work takes seconds to minutes; dead air kills a voice call. The narration system keeps the wait conversational without chattering. It lives in `VoiceSessionService` (client-direct topology) and is **DB-tunable**.

**The pipeline:**

1. The server threads an `OnProgress` callback into every delegated run (`buildDelegationProgressCallback` in `RealtimeClientSessionResolver`). Only **significant** steps pass the filter (`prompt_execution`, `action_execution`, `subagent_execution`, `decision_processing`); each is published on the push-status topic tagged `type: 'RealtimeDelegationProgress'` + `agentSessionID` + `callID`.
2. The browser correlates events to the active session, **drops stale progress** (events for calls no longer in `inFlightCallIds` — PubSub can lag the fast mutation result, and narrating "starting up" after the answer was spoken is exactly the bug this prevents).
3. Every live progress message is injected as a context note (`[delegated-agent progress] …`) so the model *knows* what's happening even when it doesn't speak.
4. **Throttled spoken updates**: the first no earlier than ~5 s into a delegation burst (`FirstNarrationDelayMs`), subsequent ones at ≥8 s spacing (`NarrationIntervalMs`) — and the spacing floor is **session-global**, so back-to-back tool calls can't re-arm the faster first-update path. Floods of small updates **aggregate** into one digest (up to 4 distinct messages, deduped, oldest-first). If the model is busy or audio is still audibly playing, the update retries in 1.5 s — hosts must gate on **both** `IsBusy` and `IsAudioPlaying`, or queued utterances come out late and stale. When the result lands first, the pending narration is cancelled (it's moot — the result is about to be spoken).
5. The spoken update itself is `BaseRealtimeClient.RequestSpokenUpdate(instructions)`. The instruction wording is **DB-driven**: the `Realtime Co-Agent - Progress Narration` prompt (`metadata/prompts/`) carries the template with `{{ progressMessage }}`, `{{ updateNumber }}`, and `{{ priorNarrations }}` placeholders — resolved server-side at session prepare (`RealtimeClientSessionService.NarrationPromptName`, with a deprecated-name fallback to `Voice Co-Agent - Progress Narration` for un-resynced deployments) and threaded to the browser, with a built-in fallback when the deployment hasn't synced the prompt. The template enforces strictly **first-person** narration (the co-agent owns the work — "I'm digging into that now", never "Sage is analyzing"), bans repetition (prior spoken narrations are chained into the instructions), and bans generic filler.
6. Narration transcripts are tagged `Kind: 'narration'` by the client driver and are **ephemeral by product decision**: surfaced as a transient "live note" in the overlay (`DelegationNarration$`), never captions, never persisted as `Conversation Detail`s.

> Server-bridged narration consumption (the runner feeding delegation progress into `IRealtimeSession.SendContextNote` / `RequestSpokenUpdate`) is **pending** — the driver capabilities exist; the runner doesn't call them yet.

---

## 8. Observability & Administration

### Run topology

A voice session produces a standard, navigable run tree:

- A **co-agent `AIAgentRun`** (`Status: 'Running'`, stamped `AgentSessionID` + `ConversationID`) plus a linked **`AIPromptRun`** are created at session start by `RealtimeClientSessionService.createCoAgentObservabilityRun` (best-effort — failure never blocks the call). Their ids persist in the session's config and `SessionManager.CloseSession` finalizes them (`Completed`/`Failed` + `CompletedAt`), idempotently, even when the close comes from the janitor.
- Every **delegated target-agent run** nests under the co-agent run via `ParentRunID` and shares the `AgentSessionID` — the delegation tree groups under the session.
- The **transcript** is the session-stamped `Conversation Detail` rows; **channel state** is on the session-channel rows; **artifacts** link in via the conversation-detail junction.
- On the server-bridged path, usage telemetry is **checkpointed incrementally** (debounced, cumulative snapshots) onto the single long-lived `AIPromptRun` by `RealtimeSessionRunner` — a crash-driven janitor close finalizes from the last-persisted values and loses nothing. (Client-direct usage relay — a `RelayRealtimeUsage` mutation — is deferred; see §10.)

### Admin surfaces

- **AI Analytics dashboard → Realtime Voice** (`packages/Angular/Explorer/dashboards/src/AI/components/analytics/realtime/`): `realtime-overview.component.ts` (KPI row — active sessions, sessions in window, average duration, delegated runs, janitor closes, cost; sessions-over-time; channel-usage donut; top delegated targets; recent sessions) and `realtime-sessions.component.ts` (the full sessions grid: Agent → Target, status pills **including the persisted close cause** — explicit / janitor / shutdown / error / unknown-legacy, channel icons, run counts, tokens/cost, host instance, row drill-in to the session record).
- **Custom entity forms** for `MJ: AI Agent Sessions` and `MJ: AI Agent Channels` (`packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgentSessions/`, `.../AIAgentChannels/`).
- **In-call developer mode**: the overlay's gear toggle reveals "Open run" links on delegation cards and an "Open session" link in the banner; clicking minimizes the call (the session stays live) and emits a navigate request the host resolves.

### Session review (review-on-reopen)

A past session can be reopened in **review mode**: `ConversationChatAreaComponent.OpenRealtimeSessionReview(agentSessionId)` loads the session through `RealtimeSessionReviewService` (`packages/Angular/Generic/conversations/src/lib/services/realtime-session-review.service.ts`) — a stateless, tolerant batch loader that folds the session row, its persisted caption turns (`MJ: Conversation Details` by `AgentSessionID`), its delegated runs (excluding the co-agent observability run), and its saved channel states into one `RealtimeSessionReview`. The call overlay then renders the past session instead of a live call: a "Session review" banner badge with the lifecycle range + close-reason chip, the **same** thread/rail components replaying the historical turns and delegation cards, and a **read-only Whiteboard tab** when the session saved a parseable board state. Everything live is dead in review — no mic, no composer; the controls collapse to **"Start live session"** (emits `RealtimeStartLiveRequest`, resuming as a *new* session chained via `lastSessionId` — which restores saved channel states through `PriorChannelStatesJson`) and Close.

The plan's complementary timeline treatment — the conversation rendering a completed session as a single **collapsed session block** ("🎙 Voice session · 14 min · 6 exchanges · 2 agent runs") inline in the message history — remains a UX direction; today the session's turns appear as ordinary conversation messages, and review mode is the way to replay an episode as an episode.

---

## 9. Security Model

Authorization is overwhelmingly reuse of existing primitives, plus a small number of session-specific gates:

- **`CanRun` on the *target* agent gates session creation** — `AIAgentPermissionHelper.HasPermission(targetAgentId, user, 'run')` in both `SessionManager.CreateSession` and `RealtimeClientSessionResolver.assertCanRunTarget`. The co-agent is internal orchestration; the meaningful permission is on the agent doing real work. Denial throws before any row is written.
- **Session ownership on every inbound operation** — every relay (`ExecuteRealtimeSessionTool`, `RelayRealtimeTranscript`, `SaveSessionChannelState`, `SaveSessionChannelArtifact`) loads the session and enforces `UUIDsEqual(session.UserID, contextUser.ID)`; tool/transcript relays additionally reject `Closed` sessions, while state/artifact saves accept them (the final flush legitimately lands post-close). Channel-state **restore** is ownership-checked too — another user's prior session never leaks.
- **The target agent cannot be swapped mid-session** — it is stored server-side in the session's config at start and read back on every relay; the browser never re-supplies it.
- **Tools execute under the session's `contextUser`** with the request-scoped provider — a realtime model calling a tool can do exactly what the user could do, no more. The provider owning the conversation is never an authorization bypass.
- **Client-declared tools grant zero server capability.** `clientToolsJson` declarations (channel/UI tools) are *declared* to the model so it can call them, but the server never executes them — a relayed call for one of those names falls into the structured "not available" path. Declarations are still validated to stop config bloat: ≤16 tools, ≤64,000 chars total, per-tool shape checks (name ≤128 chars, description non-empty, schema a plain object); channel-state payloads cap at 2,000,000 chars (per state and accumulated on restore).
- **Ephemeral, provider-scoped tokens** — the browser never sees a long-lived provider key. OpenAI bakes the full session config (instructions + tools) into the minted client secret; Gemini token-locks the mask-safe generation subset via `liveConnectConstraints` + `lockAdditionalFields: []` (system prompt/tools ride the driver-applied `SessionConfig`; see [§3](#what-an-ephemeral-token-can-lock--provider-differences)). Token expiry mid-session surfaces as a `Fatal` error so the session finalizes cleanly.
- **XSS-safe exports** — every user/agent-authored string in whiteboard HTML/SVG exports passes through `escapeHtml` before touching the document.
- **Deferred**: channel-grained permissions (today: if you can run the agent, you can use its channels), multi-party sessions (`AIAgentSession.UserID` is singular by design), and audio retention (off — the text transcript is the durable record).

---

## 10. Known Gaps & Deferred Work

Honest ledger of what is *not* done on this branch, so nobody reads aspiration into the docs above:

| Item | Status |
|---|---|
| Server-bridged client media plane (browser audio ↔ server socket, the plan's P5 / WebRTC transport) | **Not built** — client-direct is the shipped audio path; server-bridged runs are fully wired up to the provider socket but have no client media transport |
| Server-bridged narration consumption (`SendContextNote` / `RequestSpokenUpdate` from `RealtimeSessionRunner`) | **Pending** — driver capabilities exist, runner doesn't call them |
| Client-direct usage telemetry (`RelayRealtimeUsage` onto the co-agent `AIPromptRun`) and transcript-turn → run linkage | **Deferred** (noted in `RelayRealtimeTranscript`'s doc comment) |
| Conversation-history hydration into the companion prompt on session start | **MVP gap** — the resolver passes `ConversationMessages: []`; the service supports history, the resolver doesn't load it yet |
| Collapsed session block inline in the conversation timeline | **UX direction only** — session review mode (see §8) ships the replay; the inline collapsed-block rendering in message history is not built |
| Unified session transport (`SessionEnvelope` / `ISessionTransport`) | **Independent track** per the plan — voice deliberately does not depend on it |
| Eleven Labs driver | **Fast-follow** — the pre-provisioned-agent mapping is designed in the plan, not implemented |
| Video channel / video modality | **Deferred** — `BaseRealtimeModel`'s contract anticipates it |
| Server-side channel plugin execution (`ServerPluginClass` consumption) | **Seam only** — registered in metadata, not resolved by any code path |
| Non-target server tools on the client-direct relay (action wiring through `executeNonTargetTool`) | **Later phase** — structured "not available" today; the server-bridged path already executes actions |
| Channel-grained permissions, multi-party sessions, audio retention/consent | **Out of scope** for this iteration (see plan) |
| `RealtimeClientSessionService` ↔ `BaseAgent` prepare-logic duplication | **Known debt** — the service's doc header calls for a future shared `RealtimeSessionPreparer`; until then the two are kept in sync intentionally |

---

## Reference Map

| Concern | Where |
|---|---|
| Model primitive + driver obligations | `packages/AI/Core/src/generic/baseRealtime.ts` |
| Server drivers | `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts`, `packages/AI/Providers/Gemini/src/geminiRealtime.ts` |
| Browser drivers | `packages/AI/RealtimeClient/` ([README](../packages/AI/RealtimeClient/README.md)) |
| Agent type / runner / broker / client-session service / memory builder | `packages/AI/Agents/src/agent-types/realtime-agent-type.ts`, `src/realtime/*`, `src/agent-memory-context-builder.ts` |
| Session records, janitor, host identity | `packages/MJServer/src/agentSessions/` |
| GraphQL resolvers | `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`, `AgentSessionResolver.ts` |
| Browser orchestration + overlay + channels + whiteboard | `packages/Angular/Generic/conversations/src/lib/services/voice-session.service.ts`, `src/lib/components/realtime/**` |
| Admin dashboard | `packages/Angular/Explorer/dashboards/src/AI/components/analytics/realtime/` |
| Schema | `migrations/v5/V202606090930__v5.41.x__AI_Agent_Sessions_Channels.sql` |
| Seeds | `metadata/agents/.voice-co-agent.json`, `metadata/prompts/.voice-co-agent-*.json`, `metadata/ai-agent-channels/`, `metadata/ai-model-types/`, `metadata/ai-models/` (realtime rows), `metadata/agent-types/` (Realtime), `metadata/artifact-types/` (Whiteboard) |
