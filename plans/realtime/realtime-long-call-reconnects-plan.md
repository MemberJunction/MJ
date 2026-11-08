# Generic Long-Call Reconnects in Core MJ Realtime — Architecture & Implementation Plan (Issue #6460)

_Status: **Plan-Only PR (Deliverable 1 of #6460 — Awaiting Senior Engineer Review)**_
_Date: 2026-11-07_
_Target Branch: `next`_
_Companion Research & Claim Ledger: [`realtime-long-call-reconnects-research.md`](realtime-long-call-reconnects-research.md)_
_Originating Issue: [MemberJunction/MJ#6460](https://github.com/MemberJunction/MJ/issues/6460) (supersedes narrow scope of [#6403](https://github.com/MemberJunction/MJ/issues/6403), open PR [#6458](https://github.com/MemberJunction/MJ/pull/6458), and closed reference PR [#6453](https://github.com/MemberJunction/MJ/pull/6453))_

---

## 1. Requirement Authority & Confirmed Reading

The senior engineer's message in [Issue #6460](https://github.com/MemberJunction/MJ/issues/6460) is the governing specification for this plan:

1. **No audio via MJAPI; no longer-lived token.** Audio continues flowing directly between the browser and the provider (or via the existing Vertex/Enterprise WebSocket control relay where Vertex lacks browser tokens). Ephemeral tokens remain short-lived.
2. **Generic core MJ Realtime solution.** The fix lives in `BaseRealtimeModel` (`packages/AI/Core/src/generic/baseRealtime.ts`), `BaseRealtimeClient` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`), and their provider subclasses—not as a Gemini-only patch or a Caliber workaround.
3. **Three-layer call duration configuration:**
   - Configured in seconds in the model's JSON configuration bag (`MJ: AI Models.ModelConfiguration`),
   - Overridable at the model-vendor level (`MJ: AI Model Vendors.ModelConfiguration`),
   - Overridable at runtime in the subclass via a readonly getter returning `number | undefined`.
4. **Framework timer + pre-expiry buffer + abstract reconnect method:**
   - The framework tracks elapsed connection/call time and, with a buffer before expiry (e.g., `5–10 s`), invokes the subclass's implementation of an abstract reconnect method on `BaseRealtimeModel` (server session) and `BaseRealtimeClient` (browser client).
5. **Token refresh + transparent continuation under the same session:**
   - The subclass refreshes its ephemeral token as needed and starts a new provider connection transparently under the same user session and the same `MJ: AI Agent Sessions` row (`AgentSessionId`), `MJ: Conversations` row (`ConversationId`), `MJ: AI Agent Runs` row (`CoAgentRunID`), and `MJ: AI Prompt Runs` row (`PromptRunID`).
6. **Confirmed reading of *"that latter approach is more crude"*:**
   - **Preferred (Native Continue):** When a provider supports a trustworthy native continuation mechanism (such as a resumption handle or server-cached `conversation_id`), the subclass passes that handle/ID to the new provider connection and **does not** re-send conversation history.
   - **Fallback (History Seeding — "more crude"):** Feeding accumulated conversation history (`RealtimeConversationMemory`) into the new provider connection is the cruder fallback, used **only** when a provider has no native continue mechanism (e.g., OpenAI Realtime `/v1/realtime`) or when the provider's native continue does not restore conversation context (e.g., Gemini Developer API `v1alpha` ephemeral tokens; see Open Question #2).
7. **Zero Caliber changes:** Caliber (`bizapps-caliber`) must require zero code changes to benefit from long-call reconnects.

---

## 2. How the System Works Today (`file:line` Reference Summary)

Full per-driver traces and live probe logs are recorded in [`realtime-long-call-reconnects-research.md`](realtime-long-call-reconnects-research.md). The load-bearing architecture today is:

### 2.1 Metadata & Configuration Cascade
- **Database Columns (`packages/MJCoreEntities/src/generated/entities/__mj.ts`):**
  - `MJAIModelTypeEntity.ModelConfiguration` (`:59264-59284`)
  - `MJAIModelEntity.ModelConfiguration` (`:61020-61040`)
  - `MJAIVendorEntity.Configuration` (`:68762-68782`, containing `ModelDefaults`)
  - `MJAIModelVendorEntity.ModelConfiguration` (`:60161-60181`)
- **TypeScript Interfaces (lockstep-enforced by `packages/AI/Core/src/__tests__/modelConfiguration.test.ts:532-635`):**
  - `metadata/entities/JSONType-interfaces/IAIConfiguration.ts:330-372` (`RealtimeConfigurationSettings`)
  - `packages/AI/Core/src/generic/modelConfiguration.ts:219-276` (`RealtimeConfigurationSettings`)
- **4-Layer Deep Merge (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts:2063-2079`):**
  - `AIEngineBase.GetEffectiveModelConfiguration(modelID, vendorModelVendorID)` calls `ResolveEffectiveModelConfiguration` (`packages/AI/Core/src/generic/modelConfiguration.ts:575-586`) across `AIModelType.ModelConfiguration < AIModel.ModelConfiguration < AIVendor.Configuration.ModelDefaults < AIModelVendor.ModelConfiguration`.
- **Session Bag Projection (`packages/AI/Agents/src/realtime/realtime-coagent-config.ts:474-489`):**
  - `GetModelCatalogSessionSettings(config)` projects `config?.Realtime` into the session `Config` bag inside `RealtimeClientSessionService.buildSessionConfigBag` (`packages/AI/Agents/src/realtime/realtime-client-session-service.ts:3089`) and `BaseAgent.buildRealtimeSessionParams` (`packages/AI/Agents/src/base-agent.ts:4037`).

### 2.2 Server & Client Base Classes
- **`BaseRealtimeModel` (`packages/AI/Core/src/generic/baseRealtime.ts:176-310`):**
  - Exposes `static readonly DriverFacts: Readonly<RealtimeDriverFacts>` (`:183`, with `ProviderMaxSessionSeconds?: number` at `:151`), `ClampSessionSeconds` (`:190-192`), `StartSession(params)` (`:207`), `SupportsClientDirect` (`:228-230`), and `CreateClientSession(params)` (`:251-253`).
  - Has no instance duration getter, no proactive reconnect timer, and no abstract reconnect method.
- **`BaseRealtimeClient` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:296-937`):**
  - Owns the browser-side media and event surface (`Connect`, `Disconnect`, `SendText`, `CancelActiveResponse`, `SendContextNote`, `RequestSpokenUpdate`, `SendToolResult`, `SetMuted`, `IsBusy`, `IsAudioPlaying`, audio meters, tracks, and event callbacks).
  - Has no instance duration getter, no proactive reconnect timer, no token-refresh callback seam, and no abstract reconnect method.
- **`RealtimeSessionResumption` (`packages/AI/Core/src/generic/realtimeSessionResumption.ts:114-356`):**
  - Currently instantiated only by `GeminiRealtimeSession` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts:1484-1499`) and `GeminiRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts:1297-1309`).
  - Reactive to `ConnectionEnding(timeLeftMs)` (on `goAway`) or `ConnectionLost()`, and gated on `_handle !== null` (`realtimeSessionResumption.ts:152-164, 213-221`).

### 2.3 Per-Provider Limits & Current Failure Modes (Verified via Code, Official Docs, and Live Probes on `2026-11-07`)

| Provider | Server / Client Driver (`file:line`) | Single-Connection / Socket Limit | Token / Session Ceiling | Current Behavior When Limit Reached | Verified Continuity Mechanism (`2026-11-07` Probes) |
|---|---|---|---|---|---|
| **Gemini Developer API** | `GeminiRealtime` (`geminiRealtime.ts:233`) / `GeminiRealtimeClient` (`geminiRealtimeClient.ts:270`) | **~600 s (10 min)** WebSocket limit (`GEMINI_LIVE_CONNECTION_SECONDS = 600`, `geminiRealtime.ts:122`); 120 s if audio+video without compression | Ephemeral token max `expireTime`: **1,800 s (30 min)** (`geminiRealtime.ts:134, 237`). Forum #186392 reports `1011 Deadline expired` at 58:00 | At ~600 s, Google closes socket with `1011` and **no `goAway`**. Client reconnects with setup-time handle, which **restores an empty session** on `v1alpha`; at 1,800 s token expires and call dies (`Fatal: true`) | **Server (`v1beta` API key):** Native `sessionResumption.handle` restores full memory (Probe 3C: `recalledCobalt: true`). **Client (`v1alpha` ephemeral token):** Native handle restores empty session on both same and new token (Probes 3A, 3D); `sendClientContent({ turns, turnComplete: false })` seed on fresh token restores full memory in `1,462 ms` (Probe 3B) |
| **Gemini Enterprise / Vertex AI** | `GeminiEnterpriseRealtime` (`geminiEnterpriseRealtime.ts:168`) / `GeminiEnterpriseRealtimeClient` (`geminiEnterpriseRealtimeClient.ts:31`) | **~600 s (10 min)** upstream Vertex WebSocket limit (`cloud.google.com/.../start-manage-session`) | MJAPI relay ticket expires at **1,800 s (30 min)** (`REALTIME_RELAY_SESSION_LIFETIME_SECONDS = 1800`, `realtimeProxyRegistry.ts:23`) and caps at `10` connections (`:34`) | Upstream sends `goAway` 60 s before 600 s cut and resumes via Vertex `sessionResumption.handle`; at 1,800 s relay closes browser socket with code `4000` (`time-limit`) | **Native `sessionResumption.handle`** works on Vertex (`v1`); extending past 1,800 s requires refreshing/extending the MJAPI relay ticket via token refresh |
| **xAI (Grok Voice)** | `xAIRealtime` (`xaiRealtime.ts:176`) / `xAIRealtimeClient` (`xaiRealtimeClient.ts:73`) | **7,200 s (120 min)** WebSocket session ceiling (`xaiRealtime.ts:180`) | Ephemeral `client_secret` `expires_after.seconds` defaults to **600 s** and has a hard max of **3,600 s (60 min)** (Probe 1A: `7200` fails with HTTP 400!) | Any socket close triggers `OpenAIProtocolWebSocketRealtimeClient.handleSocketClose` (`openAIProtocolClient.ts:1242-1249`) → immediate `Fatal: true` error | **Native Session Resumption** (`session.update` `{ resumption: { enabled: true } }` + `?conversation_id=<id>`) works across fresh ephemeral tokens in `949 ms` (Probe 1B: `recalledPineapple: true`). Fallback `conversation.item.create` also works in `903 ms` (Probe 1C) |
| **OpenAI GA Realtime** | `OpenAIRealtime` (`openAIRealtime.ts:792`) / `OpenAIRealtimeClient` (`openAIRealtimeClient.ts:69`) | **3,600 s (60 min)** session limit (`openAIRealtime.ts:796`, `realtime-conversations.md`) | `client_secrets` `expires_after.seconds` defaults to **600 s** and caps at **7,200 s** (Probe 2: `7200` HTTP 200, `7500` HTTP 400) | At 3,600 s (or network drop), data channel / socket closes → call terminates with no reconnect | **No native handle** on `/v1/realtime`. Reconnecting with fresh `client_secret` + `conversation.item.create` history seed restores memory in `1,051 ms` (Probe 2: `recalledGlacier: true`) |
| **OpenAI Live (`gpt-live-1`)** | `OpenAILiveRealtime` (`openAILiveRealtime.ts:951`) / `OpenAILiveClient` (`openAILiveClient.ts:43`) | Internal engine rotation at 90% of 128k context (`live-conversations.md`) | Single-use MJAPI SDP broker ticket (`60 s` TTL, `openAILiveRealtime.ts:1238`) | On `session.closed` (`reason: 'expired' | 'connection_lost'`), client calls `Disconnect()` (`openAILiveClient.ts:797-800`) | Fresh SDP broker ticket via token refresh + startup `session.input` history seed (up to 128 messages / 8,192 tokens) or `/fork` when `store: true` |
| **ElevenLabs (`ElevenLabsRealtime`, `ElevenRealtime`)** | `elevenLabsRealtime.ts:456`, `elevenRealtime.ts:171` / `elevenLabsRealtimeClient.ts:124`, `elevenRealtimeClient.ts:70` | Governed by `max_duration_seconds`: default **600 s**, max **7,200 s** (`elevenLabsRealtime.ts:460`) | Signed URL open window: **900 s (15 min)** (`elevenLabsRealtime.ts:32`) | Closes WebSocket with code `1000` at `max_duration_seconds`; client treats unexpected close as `Fatal: true` (`elevenLabsRealtimeClient.ts:515-521`) | Fresh signed URL / client secret + `contextual_update` (`ElevenLabsRealtime`, stripping `first_message`) or `conversation.item.create` (`ElevenRealtime`) |
| **AssemblyAI, HuggingFace, Inworld** | `assemblyAIRealtime.ts:223`, `huggingFaceRealtime.ts:124`, `inworldRealtime.ts:244` | Provider-specific | Provider-specific | Out of product scope per user direction | **Compile-safe stubs only** (implement abstract reconnect contract by returning `false` / delegating to existing 1-shot resume in AssemblyAI) |

---

## 3. Point-by-Point Mapping to the Senior Engineer's Design

| # | Senior Engineer's Requirement | Proposed Design & Exact Location |
|---|---|---|
| 1 | **Do not route audio through MJAPI; do not use a longer-lived token.** | Browser media continues directly to the provider (`WebSocket` or `WebRTC`), or via the existing MJAPI Vertex control relay (`GeminiEnterpriseRealtime`). Ephemeral tokens stay short-lived (default 10–30 min) and are refreshed mid-call via GraphQL only when a reconnect needs a fresh credential. |
| 2 | **Make this a generic fix in core MJ Realtime (`BaseRealtimeModel`, `BaseRealtimeClient`, and subclasses).** | Timer orchestration, pre-expiry buffer calculation, turn-aware reconnect scheduling, token-refresh invocation, and `RealtimeConversationMemory` tracking live in `BaseRealtimeModel` (via a shared `BaseRealtimeSession` helper/base class in `@memberjunction/ai`) and `BaseRealtimeClient` (`@memberjunction/ai-realtime-client`). |
| 3 | **Call duration in seconds comes from model `ModelConfiguration`, overridable at `AIModelVendor.ModelConfiguration`, and overridable at runtime via a readonly getter returning `number \| undefined`.** | Add `ConnectionMaxSeconds?: number \| null`, `MaxSessionSeconds?: number \| null`, `ReconnectBufferSeconds?: number \| null`, and `TrustNativeResumption?: boolean \| null` to `RealtimeConfigurationSettings` in `IAIConfiguration.ts` and `modelConfiguration.ts`. Expose `public get CallDurationSeconds(): number \| undefined` on `BaseRealtimeModel`, `IRealtimeSession`, and `BaseRealtimeClient`. |
| 4 | **Framework tracks elapsed time and, with a buffer before expiry (e.g., 5–10 s), calls the subclass's abstract reconnect method.** | `BaseRealtimeModel` (session) and `BaseRealtimeClient` arm a connection-duration timer when a connection opens. At `CallDurationSeconds - ReconnectBufferSeconds` (default buffer `10 s`, configurable), the base class invokes `protected abstract ReconnectSession(context: RealtimeReconnectContext): Promise<void>` on `BaseRealtimeModel` / `BaseRealtimeSession` and `protected abstract Reconnect(context: RealtimeClientReconnectContext): Promise<void>` on `BaseRealtimeClient`. |
| 5 | **Subclass refreshes the token as needed and starts a new provider call transparently under the same user session and `AIAgentSession`.** | `RealtimeSessionRuntime` passes a `RefreshCredential` callback into `ClientRealtimeSessionConfig` that calls `RefreshRealtimeClientSessionToken(agentSessionId)` on `RealtimeClientSessionResolver`. The mutation re-mints only the provider credential (`EphemeralToken` / `RelayUrl` / `ExpiresAt` / `SessionConfigJson`) while keeping the existing `AIAgentSession`, `Conversation`, `AIAgentRun`, `AIPromptRun`, and `RecordingShardQueue` intact. |
| 6 | **If a provider supports native continue, pass that token/handle and do NOT pass history again; otherwise fall back to feeding conversation history.** | Each driver declares whether native continuation is supported and trustworthy (`SupportsNativeResumption` / `TrustsNativeResumption`) and whether a current `ResumptionHandle` is available. When `CanUseNativeResumption` is `true` (Vertex AI `v1`, Gemini server-side `v1beta`, xAI `?conversation_id=<id>`), `Reconnect` passes `ResumptionHandle` and skips history seeding. When `false` (OpenAI Realtime, Gemini Developer API `v1alpha` ephemeral tokens, ElevenLabs, or when no handle exists), `Reconnect` seeds from `this.conversationMemory.Seed()`. |
| 7 | **Caliber has zero work to do.** | Caliber's `CaliberPersonaClientSessionService` (`client-direct-launcher.ts:58-110`) and `CaliberWidgetMintingProvider` (`caliber-widget-mint.provider.ts:143-195`) are preserved without modification: `StartRealtimeClientSession` sentinel interception still works on launch, `RefreshRealtimeClientSessionToken` forwards automatically through Caliber's `Proxy` to `target.ExecuteGQL`, and `'connecting'` → `'listening'` transitions keep Caliber's overlay in the `'live'` phase. |

---

## 4. Proposed Interfaces & Exact Signatures

### 4.1 Metadata Keys in `IAIConfiguration.ts` and `modelConfiguration.ts`

In both [`metadata/entities/JSONType-interfaces/IAIConfiguration.ts`](../../../metadata/entities/JSONType-interfaces/IAIConfiguration.ts) (`lines 330–372`) and [`packages/AI/Core/src/generic/modelConfiguration.ts`](../../../packages/AI/Core/src/generic/modelConfiguration.ts) (`lines 219–276`), extend `RealtimeConfigurationSettings`:

```typescript
export interface RealtimeConfigurationSettings {
    TurnDetection?: RealtimeTurnDetectionSettings | null;
    Reasoning?: RealtimeReasoningSettings;
    FullDuplex?: boolean | null;
    Tooling?: RealtimeToolingSettings;
    RequestedTracks?: readonly RealtimeTrackDescriptor[];
    IdleSignal?: RealtimeIdleSignal;
    Pricing?: RealtimePricingSettings | null;

    /**
     * Maximum duration in seconds of a single underlying provider transport connection
     * (WebSocket or WebRTC call) before the provider closes or resets the socket
     * (for example, 600s on Gemini Live WebSockets, 3600s on OpenAI Realtime, 7200s on xAI).
     *
     * Set on `MJ: AI Models.ModelConfiguration` and overridable on
     * `MJ: AI Model Vendors.ModelConfiguration`. When elapsed (minus `ReconnectBufferSeconds`),
     * the realtime framework triggers a proactive in-place reconnect on `BaseRealtimeModel` /
     * `BaseRealtimeClient`.
     */
    ConnectionMaxSeconds?: number | null;

    /**
     * Maximum duration in seconds of a single provider credential or session ceiling
     * when it differs from `ConnectionMaxSeconds` (for example, 1800s ephemeral token ceiling
     * on Gemini Developer API vs. 600s per WebSocket connection, or 3600s client_secret TTL on xAI
     * vs. 7200s WebSocket session ceiling). Overridable at the `MJ: AI Model Vendors` level.
     */
    SessionMaxSeconds?: number | null;

    /**
     * Buffer in seconds before `ConnectionMaxSeconds` expiry at which the framework initiates
     * a proactive reconnect. Defaults to 10 seconds when omitted.
     */
    ReconnectBufferSeconds?: number | null;

    /**
     * Whether the provider's native session resumption handle/ID reliably restores prior
     * conversation turns on this endpoint.
     *
     * - `true`: pass the native resumption handle/ID and do NOT re-inject conversation history
     *   (e.g., Gemini Enterprise / Vertex AI `v1`, xAI `resumption.enabled` + `conversation_id`).
     * - `false`: feed `RealtimeConversationMemory` history into the reconnected session even if
     *   the provider emits a resumption handle (e.g., Gemini Developer API `v1alpha` ephemeral tokens).
     * - `null` / `undefined`: defer to the driver's runtime default.
     */
    TrustNativeResumption?: boolean | null;
}
```

#### Seeded Metadata Values in `metadata/ai-models/.ai-models.json`

| Model (`metadata/ai-models/.ai-models.json`) | Model-Level `ModelConfiguration.Realtime` | Model-Vendor Override (`MJ: AI Model Vendors.ModelConfiguration.Realtime`) | Effective Runtime Values |
|---|---|---|---|
| **Gemini 3.8 Live** (`:25937`) & **Gemini 3.8 Live Extended Thinking** (`:26232`) & **Gemini 3.1 Flash Live** (`:19413`) | `ConnectionMaxSeconds: 600`, `SessionMaxSeconds: 1800`, `ReconnectBufferSeconds: 10` | **Google (`GeminiRealtime`):** `TrustNativeResumption: false`<br>**Vertex AI (`GeminiEnterpriseRealtime`):** `TrustNativeResumption: true` | `ConnectionMaxSeconds = 600`, `SessionMaxSeconds = 1800`, `ReconnectBufferSeconds = 10` |
| **Grok Voice 3.0** (`:29617`), **Grok Voice Think Fast 2.0** (`:23247`), **Grok Voice** (`:19556`) | `ConnectionMaxSeconds: 7200`, `SessionMaxSeconds: 3600`, `ReconnectBufferSeconds: 10`, `TrustNativeResumption: true` | *(Inherits model-level)* | `ConnectionMaxSeconds = 7200`, `SessionMaxSeconds = 3600` (client secret TTL cap), `TrustNativeResumption = true` |
| **GPT Realtime 2.1** (`:21805`), **GPT Realtime 2.1-mini** (`:21897`), **GPT Realtime 2** (`:17108`) | `ConnectionMaxSeconds: 3600`, `SessionMaxSeconds: 3600`, `ReconnectBufferSeconds: 10`, `TrustNativeResumption: false` | *(Inherits model-level)* | `ConnectionMaxSeconds = 3600`, `SessionMaxSeconds = 3600`, `TrustNativeResumption = false` |
| **GPT-Live 1** (`:25603`) | `ConnectionMaxSeconds: 3600`, `ReconnectBufferSeconds: 10`, `TrustNativeResumption: false` | *(Inherits model-level)* | `ConnectionMaxSeconds = 3600`, `TrustNativeResumption = false` |
| **ElevenLabs Agents** (`:19457`), **Eleven Realtime v1 Max/Mini** (`:29804, :29867`) | `ConnectionMaxSeconds: 7200`, `ReconnectBufferSeconds: 10`, `TrustNativeResumption: false` | *(Inherits model-level)* | `ConnectionMaxSeconds = 7200`, `TrustNativeResumption = false` |

#### Projection Through `GetModelCatalogSessionSettings` (`packages/AI/Agents/src/realtime/realtime-coagent-config.ts:474-489`) & Wire-Scrubbing Guardrails

Extend `GetModelCatalogSessionSettings(config: AIModelConfiguration | null | undefined): Record<string, unknown>` so that `config?.Realtime` projects:
- `bag['connectionMaxSeconds'] = rt.ConnectionMaxSeconds` (when `typeof rt.ConnectionMaxSeconds === 'number' && rt.ConnectionMaxSeconds > 0`)
- `bag['sessionMaxSeconds'] = rt.SessionMaxSeconds` (when `typeof rt.SessionMaxSeconds === 'number' && rt.SessionMaxSeconds > 0`)
- `bag['reconnectBufferSeconds'] = rt.ReconnectBufferSeconds` (when `typeof rt.ReconnectBufferSeconds === 'number' && rt.ReconnectBufferSeconds > 0`)
- `bag['trustNativeResumption'] = rt.TrustNativeResumption` (when `typeof rt.TrustNativeResumption === 'boolean'`)

This flows automatically into both:
- `RealtimeClientSessionService.buildSessionConfigBag` (`packages/AI/Agents/src/realtime/realtime-client-session-service.ts:3077-3105`) for browser client-direct sessions, and
- `BaseAgent.buildRealtimeSessionParams` (`packages/AI/Agents/src/base-agent.ts:4028-4053`) / `RealtimeSessionRunner` (`packages/AI/Agents/src/realtime/realtime-session-runner.ts:152-168`) for server-bridged sessions.

**Mandatory Wire-Scrubbing Guardrails (Preventing Provider `unknown_parameter` HTTP 400s):**
Because `params.Config` and `SessionConfigJson` flow into provider session-setup builders, these 4 framework-only keys (`connectionMaxSeconds`, `sessionMaxSeconds`, `reconnectBufferSeconds`, `trustNativeResumption`) **must** be scrubbed at all four provider boundaries before any wire payload is constructed:
1. **`REALTIME_SHARED_CONFIG_KEYS` (`packages/AI/Core/src/generic/baseRealtime.ts:332-350`):** Add all 4 keys so `InworldRealtimeSession.applyRawConfigOverrides` (`packages/AI/Providers/Inworld/src/inworldRealtime.ts:877-883`) and `GeminiRealtime` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts:802`) recognize them as MJ shared keys rather than raw provider pass-throughs.
2. **`GeminiRealtime.scrubSharedKeys` (`packages/AI/Providers/Gemini/src/geminiRealtime.ts:658-681`):** Consume all 4 keys before `notApplied.push(k)` so `GeminiRealtime` does not log spurious `[GeminiRealtime] Scrubbed non-Gemini config key(s)` warnings or leak them into `BuildGeminiLiveSetup` (`packages/AI/Providers/Gemini/src/geminiLiveSetup.ts:130-135`).
3. **`ExtractRealtimeFeatures` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:453-466`):** Extract and `delete` all 4 keys from the mutable config clone so `features.rest` never spreads them into `BuildSessionPayload` (`openAIRealtime.ts:727`) on OpenAI, xAI, or ElevenRealtime.
4. **`ToProviderSessionConfig` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:20-32`):** Strip `connectionMaxSeconds`, `sessionMaxSeconds`, `reconnectBufferSeconds`, and `trustNativeResumption` alongside `REQUESTED_TRACKS_SESSION_KEY` (`'requestedTracks'`) after `BaseRealtimeClient.applySessionConfigTiming(config)` reads them, ensuring they are never transmitted in client `{ type: 'session.update', session }` frames (`openAIRealtimeClient.ts:341`, `openAIProtocolClient.ts:951`).

---

### 4.2 Server Base Class Contract (`BaseRealtimeModel` & `BaseRealtimeSession` in `@memberjunction/ai`)

In [`packages/AI/Core/src/generic/realtimeSessionResumption.ts`](../../../packages/AI/Core/src/generic/realtimeSessionResumption.ts) (`line 5`), widen the existing `RealtimeReconnectReason` union (avoiding a duplicate `TS2308` barrel export in `packages/AI/Core/src/index.ts:21, 34` while preserving existing consumers in `geminiRealtime.ts:43`, `inworldRealtime.ts:39`, `realtime-session-runner.ts:25`, and `baseRealtimeClient.ts:91`):

```typescript
/** Why the framework is invoking a reconnect on the provider session or client. */
export type RealtimeReconnectReason = 'connection-ending' | 'connection-lost' | 'duration-expiry';
```

In [`packages/AI/Core/src/generic/baseRealtime.ts`](../../../packages/AI/Core/src/generic/baseRealtime.ts) (importing `RealtimeReconnectReason` from `./realtimeSessionResumption` and re-exporting `realtimeConversationMemory` from `packages/AI/Core/src/index.ts`):

```typescript
/** Default buffer in seconds before connection duration expiry when the framework triggers a reconnect. */
export const DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS = 10;

/** Context passed by the framework to a server or client driver's reconnect implementation. */
export interface RealtimeReconnectContext {
    /** Why the reconnect was triggered ('duration-expiry' | 'connection-ending' | 'connection-lost'). */
    readonly Reason: RealtimeReconnectReason;
    /** 1-based attempt number within the current reconnect cycle (1..MaxAttempts). */
    readonly Attempt: number;
    /** Maximum attempts permitted before the reconnect fails fatally. */
    readonly MaxAttempts: number;
    /** Elapsed seconds on the current connection when the reconnect began. */
    readonly ElapsedConnectionSeconds: number;
    /**
     * Native provider resumption handle or conversation ID captured from the active connection,
     * or `null` if none has been recorded or native resumption is disabled/untrusted.
     */
    readonly ResumptionHandle: string | null;
    /**
     * True when the driver should use `ResumptionHandle` for native continuation and MUST NOT
     * re-send conversation history. False when the driver must seed from `ConversationSeed`.
     */
    readonly UseNativeResumption: boolean;
    /**
     * Snapshot of accumulated conversation history from `RealtimeConversationMemory.Seed()`.
     * Populated when `UseNativeResumption` is `false` (or on retry fallback after a native handle
     * is rejected); `null` when `UseNativeResumption` is `true` on the primary attempt or when no
     * turns have occurred yet.
     */
    readonly ConversationSeed: RealtimeMemorySeed | null;
}

/**
 * Shared base class for server-hosted `IRealtimeSession` instances returned by `BaseRealtimeModel.StartSession`.
 *
 * Holds per-session state (timer, `RealtimeConversationMemory`, resumption handle, and reconnect retry loop)
 * so `BaseRealtimeModel` remains stateless across concurrent sessions and so callers holding the outer
 * `IRealtimeSession` reference (`RealtimeSessionRunner.attachRecording` at `realtime-session-runner.ts:447-453`,
 * `WireBridgeRealtimeSession` at `realtime-client-session-service.ts:1254-1264`, and `session.Events()`
 * subscribers) keep the exact same `IRealtimeSession` object and `Subject<RealtimeEvent>` stream across
 * internal socket swaps.
 */
export abstract class BaseRealtimeSession implements IRealtimeSession {
    protected readonly conversationMemory = new RealtimeConversationMemory({ Log: RealtimeDiagLog });
    protected configuredCallDurationSeconds: number | undefined;
    protected configuredReconnectBufferSeconds: number = DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS;
    protected configuredTrustNativeResumption: boolean | undefined;

    /**
     * Dynamic state-dependent duration cap in seconds (for example, returning `120` when
     * uncompressed video is active on Gemini Live, and `undefined` otherwise). Clamped with
     * `configuredCallDurationSeconds` via `ClampSessionSecondsValue` so neither a seeded `600s`
     * catalog value nor a tighter custom metadata value (e.g., `45s`) is shadowed.
     */
    protected get RuntimeCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /** Static driver default connection duration in seconds when metadata does not specify one. */
    protected get DefaultCallDurationSeconds(): number | undefined {
        return this.model.CallDurationSeconds;
    }

    /**
     * Effective single-connection duration in seconds.
     *
     * Resolution order:
     * 1. `ClampSessionSecondsValue(this.RuntimeCallDurationSeconds, this.configuredCallDurationSeconds)`
     *    (takes the minimum when both a state-dependent runtime cap like 120s uncompressed video and a
     *    metadata value like 600s or 45s are present, or whichever one is defined).
     * 2. `DefaultCallDurationSeconds` (driver static default when neither runtime nor metadata is set).
     */
    public get CallDurationSeconds(): number | undefined {
        return (
            ClampSessionSecondsValue(this.RuntimeCallDurationSeconds, this.configuredCallDurationSeconds) ??
            this.DefaultCallDurationSeconds
        );
    }

    /** Abstract in-place transport reconnect implemented by each server session class. */
    public abstract Reconnect(context: RealtimeReconnectContext): Promise<void>;
}

export abstract class BaseRealtimeModel extends BaseModel {
    public static readonly DriverFacts: Readonly<RealtimeDriverFacts> = Object.freeze({});

    /**
     * Static driver default for a single connection's duration in seconds (for example, `600` on
     * `GeminiRealtime` and `GeminiEnterpriseRealtime`, `3600` on `OpenAIRealtime` and
     * `OpenAILiveRealtime`, `7200` on `xAIRealtime`). Defaults to `DriverFacts.ProviderMaxSessionSeconds`.
     */
    protected get DefaultCallDurationSeconds(): number | undefined {
        return RealtimeDriverFactsOf(this).ProviderMaxSessionSeconds;
    }

    /**
     * Dynamic runtime override hook on the model driver (returns `undefined` unless overridden by a subclass).
     */
    protected get RuntimeCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /**
     * Readonly getter returning the model driver's connection duration in seconds.
     */
    public get CallDurationSeconds(): number | undefined {
        return this.RuntimeCallDurationSeconds ?? this.DefaultCallDurationSeconds;
    }

    /**
     * Buffer in seconds before `CallDurationSeconds` at which the framework initiates a
     * proactive reconnect. Defaults to `DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS` (10s).
     */
    public get ReconnectBufferSeconds(): number {
        return DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS;
    }

    /**
     * Whether this driver supports and trusts the provider's native session resumption on the
     * active endpoint when a handle is present. Subclasses override as needed (e.g., `true` on
     * server-side `GeminiRealtime`, `GeminiEnterpriseRealtime`, and `xAIRealtime`; `false` on
     * `OpenAIRealtime`).
     */
    public get TrustsNativeResumption(): boolean {
        return false;
    }

    /**
     * Abstract reconnect hook for server-hosted `IRealtimeSession` instances created by `StartSession`.
     * Called by `BaseRealtimeSession`'s duration timer (`CallDurationSeconds - ReconnectBufferSeconds`)
     * or on unexpected transport close when resumable.
     */
    protected abstract ReconnectSession(
        session: IRealtimeSession,
        context: RealtimeReconnectContext
    ): Promise<void>;
}
```

And on `ClientRealtimeSessionConfig` (`packages/AI/Core/src/generic/baseRealtime.ts:421-486`), add optional metadata fields carried to the browser client:

```typescript
export interface ClientRealtimeSessionConfig {
    Provider: string;
    Model: string;
    EphemeralToken: string;
    ExpiresAt: string;
    Transport?: RealtimeClientTransport;
    RelayUrl?: string;
    SessionConfig?: JSONObject;
    AvatarStatus?: RealtimeAvatarStatus;
    /** Total session wall-clock ceiling (clamped by host/widget policy and provider ceiling). */
    MaxSessionSeconds?: number;
    /**
     * Single provider connection duration in seconds (from `AIModel.ModelConfiguration.Realtime`
     * -> `AIModelVendor.ModelConfiguration.Realtime` -> `BaseRealtimeModel.CallDurationSeconds`).
     */
    ConnectionMaxSeconds?: number;
    /** Buffer in seconds before `ConnectionMaxSeconds` at which `BaseRealtimeClient` reconnects. */
    ReconnectBufferSeconds?: number;
    /** Whether native resumption is trusted on this model/vendor endpoint. */
    TrustNativeResumption?: boolean;
}
```

---

### 4.3 Client Base Class Contract (`BaseRealtimeClient` in `@memberjunction/ai-realtime-client`) & Call Recorder Re-Attachment (`RealtimeAudioRecorder`)

In [`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`](../../../packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts):

```typescript
/** Fresh credential returned by the host runtime when a client driver refreshes its token mid-call. */
export interface RefreshedRealtimeClientCredential {
    /** Fresh provider ephemeral token, client secret, signed URL, or SDP-broker URL. */
    readonly EphemeralToken: string;
    /** ISO-8601 expiry timestamp of the refreshed credential. */
    readonly ExpiresAt: string;
    /** Refreshed relay WebSocket URL when `Transport === 'relay'`. */
    readonly RelayUrl?: string;
    /** Updated provider session configuration JSON object if needed on reconnect. */
    readonly SessionConfig?: JSONObject;
    /** Remaining seconds until the `AIAgentSession`'s overall `maxSessionDeadlineIso` (if capped). */
    readonly RemainingSessionSeconds?: number;
}

/** Callback supplied by `RealtimeSessionRuntime` to mint a fresh provider credential for the active `AIAgentSession`. */
export type RealtimeClientTokenRefreshCallback = () => Promise<RefreshedRealtimeClientCredential>;

/** Extended reconnect context passed to `BaseRealtimeClient.Reconnect(context)`. */
export interface RealtimeClientReconnectContext extends RealtimeReconnectContext {
    /**
     * Refreshes the short-lived provider credential via MJAPI (`RefreshRealtimeClientSessionToken`)
     * under the same user and `AIAgentSession`.
     *
     * - Automatically invoked by the base class before `Reconnect()` when the current credential
     *   is single-use, expired, or within `TOKEN_REFRESH_MARGIN_SECONDS` (60s) of `ExpiresAt`,
     *   or when `RequiresFreshTokenPerReconnect` is `true`.
     * - Also callable directly by the subclass inside `Reconnect()` if an attempt fails due to
     *   credential exhaustion.
     */
    readonly RefreshCredential: () => Promise<RefreshedRealtimeClientCredential>;
    /**
     * The latest valid credential (either the refreshed credential or the still-valid current
     * credential).
     */
    readonly Credential: RefreshedRealtimeClientCredential;
}
```

On `BaseRealtimeClient` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:296-937`):

```typescript
export abstract class BaseRealtimeClient {
    /**
     * Shared provider-neutral conversation ledger. Always records turns even when
     * `TrustsNativeResumption` is `true`, so if a native resumption handle is rejected
     * by the provider on Attempt 1 (e.g., at a multi-connection ceiling), Attempt 2 can
     * immediately fall back to history seeding with full conversation context.
     */
    protected readonly conversationMemory = new RealtimeConversationMemory({ Log: RealtimeDiagLog });

    /** Duration of a single provider connection in seconds from `ClientRealtimeSessionConfig`. */
    protected configuredCallDurationSeconds: number | undefined;

    /** Buffer in seconds before `CallDurationSeconds` expiry at which `Reconnect` is triggered. */
    protected configuredReconnectBufferSeconds: number = DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS;

    /** Optional metadata override for whether native resumption is trusted on this endpoint. */
    protected configuredTrustNativeResumption: boolean | undefined;

    /** Optional callback installed by `RealtimeSessionRuntime` to refresh the provider token mid-call. */
    protected tokenRefreshCallback: RealtimeClientTokenRefreshCallback | null = null;

    /**
     * Concrete lifecycle seam called by `RealtimeSessionRuntime.connectClient` (`RealtimeSessionRuntime.ts:2057-2068`)
     * before `client.Connect(config)` AND by each driver's `Connect(config)` implementation as defense-in-depth.
     *
     * Extracts `ConnectionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption` from top-level
     * `ClientRealtimeSessionConfig` or `config.SessionConfig` (`connectionMaxSeconds` / `sessionMaxSeconds`,
     * `reconnectBufferSeconds`, `trustNativeResumption`) and records the initial credential (`EphemeralToken`,
     * `ExpiresAt`, `RelayUrl`, `SessionConfig`).
     *
     * Note: Because `BaseRealtimeClient.Connect` is `abstract` and only OpenAI-family drivers call
     * `ToProviderSessionConfig`, extracting timing in `applySessionConfigTiming` and automatically arming
     * the connection duration timer inside `BaseRealtimeClient.setState('listening')` guarantees that no
     * driver subclass can forget to extract config or start the timer.
     */
    public ApplySessionConfigTiming(config: ClientRealtimeSessionConfig): void {
        this.applySessionConfigTiming(config);
    }

    /**
     * Dynamic state-dependent duration cap in seconds (for example, `GeminiRealtimeClient`
     * returning `120` when uncompressed video is active, and `undefined` otherwise).
     * Clamped with `configuredCallDurationSeconds` via `ClampSessionSecondsValue` so neither a
     * seeded `600s` model config nor a smaller test/admin override (e.g., `45s`) is shadowed.
     */
    protected get RuntimeCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /** Subclass static fallback default duration in seconds when metadata does not specify one. */
    protected get DefaultCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /**
     * Runtime readonly getter for the call/connection duration in seconds.
     *
     * Resolution order:
     * 1. `ClampSessionSecondsValue(this.RuntimeCallDurationSeconds, this.configuredCallDurationSeconds)`
     *    (takes the minimum when both a state-dependent runtime cap like 120s uncompressed video and a
     *    configured metadata duration like 600s or 45s are present, or whichever one is defined).
     * 2. `DefaultCallDurationSeconds` (subclass static default), or `undefined` if unbounded.
     */
    public get CallDurationSeconds(): number | undefined {
        return (
            ClampSessionSecondsValue(this.RuntimeCallDurationSeconds, this.configuredCallDurationSeconds) ??
            this.DefaultCallDurationSeconds
        );
    }

    /** Buffer in seconds before `CallDurationSeconds` expiry at which the framework calls `Reconnect`. */
    public get ReconnectBufferSeconds(): number {
        return this.configuredReconnectBufferSeconds;
    }

    /**
     * Whether this driver supports and trusts native session resumption when a handle/ID is recorded.
     * Respects `configuredTrustNativeResumption` from `ModelConfiguration.Realtime.TrustNativeResumption`
     * first, then falls back to the driver's default.
     */
    public get TrustsNativeResumption(): boolean {
        return this.configuredTrustNativeResumption ?? this.DefaultTrustsNativeResumption;
    }

    protected get DefaultTrustsNativeResumption(): boolean {
        return false;
    }

    /**
     * Whether every reconnect on this provider requires minting a fresh ephemeral credential
     * (true for OpenAI `client_secrets`, OpenAI Live single-use SDP ticket, ElevenLabs signed URLs,
     * and Gemini Developer API when refreshing at token expiry; false for Vertex relay within ticket lifetime).
     */
    protected get RequiresFreshTokenPerReconnect(): boolean {
        return true;
    }

    /** Installs the host runtime's mid-call token refresh callback. */
    public SetTokenRefreshCallback(callback: RealtimeClientTokenRefreshCallback | null): void {
        this.tokenRefreshCallback = callback;
    }

    /**
     * Abstract reconnect method implemented by every `BaseRealtimeClient` subclass.
     *
     * Invoked by the base framework when:
     * 1. The connection duration timer reaches `CallDurationSeconds - ReconnectBufferSeconds`,
     * 2. The provider sends an early termination notice (`NotifyConnectionEnding(timeLeftMs)`), or
     * 3. The underlying transport closes unexpectedly while the session is still active.
     *
     * The subclass must open a replacement provider connection using `context.Credential`,
     * pass `context.ResumptionHandle` when `context.UseNativeResumption` is `true` OR seed
     * `context.ConversationSeed` when `context.UseNativeResumption` is `false`, swap the active
     * transport in place without tearing down `micStream` / recording / session IDs, and resolve
     * when the replacement connection is ready.
     */
    protected abstract Reconnect(context: RealtimeClientReconnectContext): Promise<void>;
}
```

#### WebRTC Call Recording Re-Attachment on Reconnect (`RealtimeAudioRecorder.AttachRemoteStream`)
- `BaseRealtimeClient` **already** defines `public OnRemoteMediaStream(handler: (stream: MediaStream) => void): void` (`packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:599-604`, fanned out by `publishRemoteMediaStream` at `:611-617`), and `RealtimeSessionRuntime.startRecording` **already** registers `client.OnRemoteMediaStream?.((stream) => this.recorder?.AttachRemoteStream(stream))` (`packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts:2597`).
- However, `RealtimeAudioRecorder.AttachRemoteStream` (`packages/Angular/Generic/conversations/src/lib/services/realtime-audio-recorder.ts:68-75, 144-154, 328-336`) currently checks `if (this.remoteAttached || stream.getAudioTracks().length === 0) return;` and never stores `this.remoteStream` or `this.remoteSource`. On a WebRTC reconnect (`OpenAIRealtimeClient` / `OpenAILiveClient`), Leg 2 creates a new `RTCPeerConnection` and publishes a new remote `MediaStream`, which `AttachRemoteStream` silently ignores because `this.remoteAttached` is already `true` from Leg 1!
- **Fix in `RealtimeAudioRecorder` (`realtime-audio-recorder.ts:68-75, 144-154, 328-336, 427-469`):** Store `private remoteStream: MediaStream | null = null` and `private remoteSource: MediaStreamAudioSourceNode | null = null`. In `AttachRemoteStream(stream)`, ignore only duplicate calls for the identical `MediaStream` (`if (this.remoteAttached && this.remoteStream === stream) return;`); in `connectRemoteStream(audioContext, stream)`, call `const replacement = this.connectStream(audioContext, stream)` (which connects the new `MediaStreamAudioSourceNode` to `this.captureNode()`—`this.workletNode ?? this.scriptNode`—exactly like `ReplaceMicrophone` at `:162-172`, **not** directly to `this.destination` which sits downstream of `captureNode`), disconnect any previous `this.remoteSource`, set `this.remoteSource = replacement`, and set `this.remoteStream = stream`. In `releaseGraph()` (`:447-469`), reset `this.remoteSource = null` and `this.remoteStream = null`.

---

### 4.4 Server Token-Refresh GraphQL Mutation (`RealtimeClientSessionResolver` & `RealtimeClientSessionService`)

#### 1. GraphQL Return Type & Mutation (`packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`)

```typescript
@ObjectType()
export class RefreshRealtimeClientSessionTokenResult {
    @Field(() => String, { description: 'The existing MJ: AI Agent Sessions ID (unchanged).' })
    AgentSessionId!: string;

    @Field(() => String, { description: 'Fresh short-lived provider credential (or empty string for relay transport).' })
    EphemeralToken!: string;

    @Field(() => String, { description: 'ISO-8601 expiry timestamp of the newly minted credential.' })
    ExpiresAt!: string;

    @Field(() => String, { nullable: true, description: 'Session transport ("direct" or "relay").' })
    Transport?: RealtimeClientTransport;

    @Field(() => String, { nullable: true, description: 'Relay WebSocket URL when Transport is "relay".' })
    RelayUrl?: string;

    @Field(() => String, { nullable: true, description: 'Updated provider SessionConfig JSON string.' })
    SessionConfigJson?: string;

    @Field(() => Int, { nullable: true, description: 'Remaining seconds until the session maxSessionDeadlineIso, if capped.' })
    RemainingSessionSeconds?: number;
}
```

```typescript
@Mutation(() => RefreshRealtimeClientSessionTokenResult, {
    description: 'Mints a fresh short-lived provider token for an active realtime client session without creating a new AIAgentSession or widening caller capabilities.'
})
public async RefreshRealtimeClientSessionToken(
    @Arg('agentSessionId', () => String) agentSessionId: string,
    @Ctx() { userPayload, providers }: AppContext
): Promise<RefreshRealtimeClientSessionTokenResult>
```

#### 2. How `RefreshRealtimeClientSessionToken` Works Without Re-Running Heavy Prompt/Memory Setup (and Without Trusting Client-Editable `AIAgentSession.Config_`)

To make mid-call token refresh fast (`~100–250 ms`, matching our live probes), tamper-proof, and 100% compatible with Caliber's `CaliberPersonaClientSessionService` (`bizapps-caliber/packages/Server/src/runtime/launch/client-direct-launcher.ts:58-109, 359-428`):
1. **Authoritative Mint Snapshot Capture Inside `RealtimeClientSessionService.PrepareClientSession` (`packages/AI/Agents/src/realtime/realtime-client-session-service.ts:955-1011`):**
   - Remember that `AIAgentSession.Config_` is writable by the session owner via `UpdateMJAIAgentSession` unless a key is guarded in `PROTECTED_SESSION_CONFIG_KEYS` (`packages/MJCoreEntitiesServer/src/custom/sessionConfigGuard.ts:48`), **and** Caliber's `ClientDirectRealtimeLauncher.persistObservabilityRunIds` (`client-direct-launcher.ts:418-425`) overwrites `agentSession.Config_` outside `RunWithTrustedSessionConfigWrites` after `PrepareClientSession` returns. Furthermore, `createCoAgentPromptRun` (`realtime-client-session-service.ts:1785-1816`) starts `AIPromptRun.Messages` empty (the system prompt is not stored in `Messages`).
   - Therefore, `PrepareClientSession` itself captures the authoritative snapshot in **two server-authoritative stores** that neither the browser client nor Caliber's `Config_` overwrite can clobber, with a strict credential-hygiene split:
     1. **Process-wide `BaseSingleton` cache (`RealtimeMintSnapshotRegistry.Instance` in `@memberjunction/ai-agents`):** Bounded `MJLruCache` keyed by normalized `agentSessionID` storing `InMemoryRealtimeMintSnapshot` (`{ modelId: resolution.ModelID, vendorId: resolution.VendorID, apiName: resolution.APIName, driverClass: resolution.DriverClass, systemPrompt: sessionParams.SystemPrompt, tools: sessionParams.Tools, configBag: sessionParams.Config, maxSessionSeconds: sessionParams.MaxSessionSeconds, relayTicketId }`). Because it extends `BaseSingleton<RealtimeMintSnapshotRegistry>` (`GetGlobalObjectStore()`), a snapshot recorded by Caliber's `new CaliberPersonaClientSessionService().PrepareClientSession(...)` is immediately visible to `RealtimeClientSessionResolver`'s `this.service.RefreshClientSessionCredential(...)` in the same process. `relayTicketId` is a live bearer credential (`realtimeProxyRegistry.ts:453-457`) for the in-process `RealtimeProxyRegistry`, so it lives **exclusively** in `RealtimeMintSnapshotRegistry.Instance` and is **never** written to the database.
     2. **Durable DB persistence on `MJ: AI Agent Run Steps.InputData` (`createCoAgentRunStep` at `realtime-client-session-service.ts:1826-1856`):** Remove the `if (!promptID) { return null; }` early return in `createCoAgentRunStep` (`:1833-1835`) so the single `'Realtime session system prompt'` `MJAIAgentRunStepEntity` row (`coAgentRunStepID`) is **always** created whenever `coAgentRunID` is present (`MJAIAgentRunStepEntity.TargetID` is `string | null`, `__mj.ts:48665`). Stamping `step.InputData = JSON.stringify(persistedSnapshot)` (where `PersistedRealtimeMintSnapshot` omits `relayTicketId`) stores the exact `DeliveredSystemPrompt` (including Caliber's candidate resume/JD persona prompt) and `Tools` (including Caliber's whiteboard client tools) in a table the client cannot edit and that `SessionRunIDVerifier.VerifySessionRunIDs` (`packages/MJServer/src/agentSessions/SessionRunIDVerifier.ts:74-149`) already verifies belongs to `session.ID`. If a refresh lands on a different replica where `RealtimeMintSnapshotRegistry` misses and falls back to `MJAIAgentRunStepEntity.InputData`, a relay-backed driver simply mints a fresh relay session on that replica and returns the new `RelayUrl`.
2. **Authorization & Scoped-Anonymous Elevation in `RefreshRealtimeClientSessionToken`:**
   - Loads the active owned session via `this.loadOwnedActiveSession(agentSessionId, contextUser, provider)` (`RealtimeClientSessionResolver.ts:2765-2797`).
   - Re-verifies target agent permission via `await this.assertCanRunTarget(config.targetAgentID, contextUser, provider)` (`RealtimeClientSessionResolver.ts:743`).
   - Uses `ResolveScopedAnonymousRunUser(contextUser)` (`RealtimeClientSessionResolver.ts:753, 1866`) when reading the verified `MJAIAgentRunStepEntity` (`coAgentRunStepID`) or model metadata so scoped-anonymous magic-link and widget-guest callers can refresh tokens without entity-read permission failures.
3. **Remaining Session Budget Clamping:**
   - If `config.maxSessionDeadlineIso` is set, computes `remainingSeconds = Math.floor((Date.parse(config.maxSessionDeadlineIso) - Date.now()) / 1000)`.
   - If `remainingSeconds <= 5`, rejects with `'Realtime session has reached its maximum duration'`.
4. **Credential Re-Minting / Relay Extension:**
   - Calls `driver.CreateClientSession({ ...snapshot, MaxSessionSeconds: remainingSeconds })`.
   - For relay-backed sessions (`GeminiEnterpriseRealtime` and relayed `GeminiRealtime`), when `relayTicketId` is present on the same replica, extends the **existing** relay session via `RealtimeProxyRegistry.Instance.ExtendRelaySession(relayTicketId, remainingSeconds)`:
     - Updates `entry.ExpiresAtMs`, raises `entry.MaxConnections`, preserves `entry.Handles` (so native resumption handles remain valid), **and re-arms one fresh open window (`entry.FreshOpened = false; entry.OpenByMs = now + openWithinSeconds * 1000`)** so `RealtimeProxyRegistry.relayRefusal` (`packages/AI/Core/src/generic/realtimeProxyRegistry.ts:533-538`) does not reject handle-less reconnects (`UseNativeResumption === false` or Attempt-2 seed fallback where `intent.ResumeHandle === null`) with `'fresh-used'`.
     - Notifies any active `RealtimeRelayTunnel` via `RealtimeRelayGrant.OnExpiresAtExtended?: (listener: (newExpiresAtMs: number) => void) => () => void` (backed by a listener `Set` on `RelaySessionRecord` in `RealtimeProxyRegistry`, which `RealtimeRelayTunnel.openFromFirstFrame` at `packages/MJServer/src/realtimeProxy/RealtimeRelayTunnel.ts:190-195` subscribes to and unsubscribes from in `cleanup()`) to reschedule `this.lifetimeTimer` so an already-open tunnel is not closed at the initial 30-minute mark with `REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE = 4000` (`realtimeProxyRegistry.ts:48`).
5. **Heartbeat Slide:**
   - Touches `this.sessionManager.Heartbeat(agentSessionId, contextUser, provider)` so the `AIAgentSession` idle window slides (still capped at `CapExpiryAtDeadline(..., config.maxSessionDeadlineIso)`).

---

### 4.5 Per-Provider `Reconnect` Implementations (Client & Server)

```mermaid
sequenceDiagram
    participant Host as RealtimeSessionRuntime / Caliber
    participant Base as BaseRealtimeClient (Timer + Memory)
    participant Sub as Provider Subclass (Gemini / xAI / OpenAI)
    participant MJAPI as MJAPI (RefreshRealtimeClientSessionToken)
    participant Prov as Provider (WS / WebRTC)

    Note over Base,Prov: Connection 1 active; Base records turns in RealtimeConversationMemory
    Base->>Base: Timer reaches CallDurationSeconds - ReconnectBufferSeconds (or goAway / drop)
    Base->>Host: StateChange('connecting') -> Resuming$ = true (UI stays 'live')
    alt Token expired / near expiry / single-use
        Base->>MJAPI: RefreshRealtimeClientSessionToken(agentSessionId)
        MJAPI-->>Base: Fresh EphemeralToken / RelayUrl (same AIAgentSession)
    end
    Base->>Sub: Reconnect(context)
    alt context.UseNativeResumption === true (Vertex v1, Gemini Server v1beta, xAI ?conversation_id)
        Sub->>Prov: Open Connection 2 with ResumptionHandle / conversation_id
        Prov-->>Sub: Ready / Replayed context
    else context.UseNativeResumption === false (OpenAI Realtime, Gemini v1alpha ephemeral, ElevenLabs)
        Sub->>Prov: Open Connection 2 with fresh token
        Prov-->>Sub: setupComplete / session.created
        Sub->>Prov: Seed context.ConversationSeed (sendClientContent / conversation.item.create)
    end
    Sub->>Sub: Swap active socket/PC, flush held mic audio & queued sends, close Connection 1
    Base->>Host: StateChange('listening') -> Resuming$ = false
```

1. **`GeminiRealtime` (Server) & `GeminiRealtimeClient` (Client):**
   - `DefaultCallDurationSeconds`: `600`; `RuntimeCallDurationSeconds`: returns `120` when uncompressed video is active, `undefined` otherwise (clamped via `ClampSessionSecondsValue` so `120 s` narrows a seeded `ConnectionMaxSeconds: 600` whenever uncompressed video is streaming while still honoring any tighter metadata override such as `45 s`).
   - `DefaultTrustsNativeResumption`: `true` on server `GeminiRealtime` (`v1beta` API key, verified in Probe 3C); `false` on client `GeminiRealtimeClient` (`v1alpha` ephemeral token, verified in Probes 3A & 3D).
   - `Reconnect(context)`:
     - Updates `this.connectTarget` (`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts:456-463, 1212-1233`) from `context.Credential.EphemeralToken` and `context.Credential.RelayUrl` before opening the replacement socket (fixing the stale `this.connectTarget` cache bug).
     - Opens replacement `ai.live.connect`, awaits `setupComplete`. **Constraint-mask invariant (`geminiRealtime.ts:561-563`):** Because `GeminiRealtime.BuildConstraintConfig` locks `sessionResumption: {}` into the `v1alpha` ephemeral token's `liveConnectConstraints` field mask, when `context.UseNativeResumption === false` (or `context.ResumptionHandle === null`), `GeminiRealtimeClient` MUST still send `sessionResumption: {}` (with `handle` omitted/`undefined`, never deleting the `sessionResumption` key itself) in the setup config so `v1alpha` constrained setup does not reject the handshake.
     - If `!context.UseNativeResumption && context.ConversationSeed`, calls `seedConversation(newSession, context.ConversationSeed)` via `sendClientContent({ turns, turnComplete: false })`. (When running over the MJAPI relay without a resumption handle, formats the seed as a single `role: 'user'` transcript block so `GeminiLiveRelayPolicy.checkUserTurn` at `packages/AI/Providers/Gemini/src/geminiLiveRelayPolicy.ts:379-387` does not drop `role: 'model'` turns.)
     - Swaps `this.session`, flushes `heldMicAudio` and `queuedSends`, and closes the old socket.
2. **`GeminiEnterpriseRealtime` (Server) & `GeminiEnterpriseRealtimeClient` (Client):**
   - `DefaultCallDurationSeconds`: `600`.
   - `DefaultTrustsNativeResumption`: `true` (Vertex AI `v1` native handles restore context).
   - `RequiresFreshTokenPerReconnect`: `false` while the MJAPI relay ticket (`ExpiresAt`) has >60 s remaining and `< 8` connections; `true` when within 60 s of relay `ExpiresAt` or `>= 7` connections (where `RefreshRealtimeClientSessionToken` calls `RealtimeProxyRegistry.Instance.ExtendRelaySession` to extend `ExpiresAtMs`, raise `MaxConnections`, re-arm `FreshOpened = false` / `OpenByMs` while preserving `Handles`, and notify `RealtimeRelayTunnel` via `grant.OnExpiresAtExtended` to reschedule `this.lifetimeTimer` at `packages/MJServer/src/realtimeProxy/RealtimeRelayTunnel.ts:190-195`).
3. **`xAIRealtime` (Server) & `xAIRealtimeClient` (Client):**
   - `DefaultCallDurationSeconds`: `7200` (WebSocket ceiling), while `xAIRealtime.CreateClientSession` explicitly passes `expires_after: { seconds: Math.min(3600, maxSessionSeconds ?? 3600) }` so `POST /v1/realtime/client_secrets` never exceeds xAI's 3,600 s client-secret limit (fixing the HTTP 400 proven in Probe 1A).
   - `DefaultTrustsNativeResumption`: `true` (unless `ZeroDataRetention` is enabled on the session).
   - **Type & URL Plumbing:**
     - Add `interface OAIProtocolConversationCreated { type: 'conversation.created'; conversation?: { id?: string }; }` to `OpenAIProtocolServerEvent` (`packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts:117-130`) so `xAIRealtimeClient` captures `conversation.id` with strict typing.
     - Widen `OAIProtocolMessageItem` (`openAIProtocolClient.ts:140-144` and `openAIRealtime.ts`) to allow `role: 'user' | 'system' | 'assistant'` and content `{ type: 'input_text' | 'output_text'; text: string }`, mapping `turn.Role === 'model' ? 'assistant' : 'user'` and `turn.Role === 'model' ? 'output_text' : 'input_text'` when seeding `ConversationSeed`.
     - Update server-side `OpenAIRealtime.createConnection` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:860-862`) to accept `onURL?: (url: URL) => void` and pass `{ model, onURL }` to `new OpenAIRealtimeWebSocket({ model, onURL }, this._openAI)`, so `xAIRealtime` sets `url.searchParams.set('conversation_id', handle)` via `onURL` instead of percent-encoding `?conversation_id=` inside `model`.
   - `Reconnect(context)`:
     - Obtains fresh `EphemeralToken` from `context.Credential`.
     - If `context.UseNativeResumption && context.ResumptionHandle`, opens `wss://api.x.ai/v1/realtime?model=...&conversation_id=${encodeURIComponent(context.ResumptionHandle)}` and sends `session.update` with `resumption: { enabled: true }` (no history seed).
     - Otherwise opens fresh WebSocket, sends `session.update`, and seeds `context.ConversationSeed` via `conversation.item.create` messages (without triggering `response.create`).
     - Swaps `this.socket`, flushes `queuedSends` (buffered while `reconnectInFlight` is `true`), while keeping `this.micCapture` and `this.playback` running.
4. **`OpenAIRealtime` (Server) & `OpenAIRealtimeClient` (Client):**
   - `DefaultCallDurationSeconds`: `3600` (60 min OpenAI session limit).
   - `DefaultTrustsNativeResumption`: `false` (OpenAI `/v1/realtime` has no cross-connection resumption handle).
   - `Reconnect(context)`:
     - Obtains fresh `EphemeralToken` (`client_secret`) from `context.Credential`.
     - **Client WebRTC (`OpenAIRealtimeClient`):** Creates a new `RTCPeerConnection` and `'oai-events'` `RTCDataChannel`, clears stale `this.micSenders = []` (`openAIRealtimeClient.ts:62, 132`) before attaching existing `this.micStream` tracks to the new `RTCPeerConnection` (so `ReplaceMicrophone` remains functional after reconnect), exchanges SDP offer with `context.Credential.EphemeralToken`, waits for `session.created` on the new data channel, sends `session.update` (`this.sessionConfig`), seeds `context.ConversationSeed` via `conversation.item.create` items (mapping `'model'` → `'assistant'` / `'output_text'`), flushes `queuedSends`, reuses `this.remoteAudioEl` (`openAIRealtimeClient.ts:259-269`, rebinding `srcObject` without appending duplicate `<audio>` elements to `document.body`), rebinds `outputAudioMeter` and calls `publishRemoteMediaStream` (firing `OnRemoteMediaStream` handlers so `RealtimeAudioRecorder.AttachRemoteStream` swaps `remoteSource` to the new remote audio track on `this.captureNode()`), and closes the old `RTCPeerConnection`.
     - **Server WebSocket (`OpenAIRealtimeSession`):** Opens a new `OpenAIRealtimeWebSocket`, waits for `session.created`, applies `session.update`, seeds `context.ConversationSeed` via `conversation.item.create`, swaps `this.connection`, and closes the old socket.
5. **`OpenAILiveRealtime` & `OpenAILiveClient` (`gpt-live-1`):**
   - `DefaultCallDurationSeconds`: `3600`.
   - `DefaultTrustsNativeResumption`: `false`.
   - `RequiresFreshTokenPerReconnect`: `true` (mandatory because `OpenAILiveRealtime.CreateClientSession` at `packages/AI/Providers/OpenAI/src/models/openAILiveRealtime.ts:1232-1239` issues a single-use MJAPI SDP broker ticket with `TTLSeconds: 60` consumed on first `Connect()`).
   - `Reconnect(context)`: Uses the freshly minted single-use SDP-exchange ticket from `context.Credential.EphemeralToken`, clears `this.micSenders = []` (`openAILiveClient.ts:58, 137`) before attaching `this.micStream` tracks to the replacement `RTCPeerConnection`, reuses `this.remoteAudioEl` (`openAILiveClient.ts:451-461`), invokes `publishRemoteMediaStream` (`OnRemoteMediaStream`), and once the replacement `'oai-events'` data channel opens (`channel.onopen` at `:484`), injects `context.ConversationSeed.ContextNote` via `this.SendContextNote(context.ConversationSeed.ContextNote)` (`{ type: 'session.thinking.append', content: seed.ContextNote, delegation_id: null }` at `:260-266`, because `RealtimeSdpBrokerHandler.ts:90` intentionally uses server-minted `entry.SessionConfig` and ignores browser `req.body.session`) before flushing `outboundQueue`, then closes the old peer connection with `{ type: 'session.close' }`.
6. **`ElevenLabsRealtime` / `ElevenLabsRealtimeClient` & `ElevenRealtime` / `ElevenRealtimeClient`:**
   - `ElevenLabsRealtimeClient`: Mints a fresh signed URL via `context.RefreshCredential()`, opens the new WebSocket, sends `conversation_initiation_client_data` with `first_message: undefined` so the agent does not re-greet, and sends `contextual_update` with the rendered `ConversationSeed`.
   - `ElevenRealtimeClient`: Inherits `OpenAIProtocolWebSocketRealtimeClient` reconnect (fresh `client_secret` + `conversation.item.create` seed).
7. **Out-of-Scope Providers (`AssemblyAIRealtime`, `HuggingFaceRealtime`, `InworldRealtime`):**
   - Implement the abstract `Reconnect` / `ReconnectSession` methods as compile-safe stubs (`AssemblyAIRealtimeClient` delegates to its existing `tryResumeSession`; `HuggingFaceRealtimeClient` and `InworldRealtime` throw a descriptive unsupported-reconnect error if invoked) so all subclasses satisfy TypeScript compilation.
8. **Server-Bridged `RealtimeSessionRunner` Fallback Continuity (`packages/AI/Agents/src/realtime/realtime-session-runner.ts:517-558`):**
   - Normal timed reconnects and recoverable socket drops on server-bridged sessions happen **in-place** inside `BaseRealtimeSession` without emitting `Fatal: true` to `RealtimeSessionRunner`. As defense-in-depth, if a session does emit `Fatal: true` and triggers `RealtimeSessionRunner.attemptTransportReconnect()` (`:517-558`), `RealtimeSessionRunner` also records finalized transcript turns in a runner-level `RealtimeConversationMemory` and passes `InitialContext: this.conversationMemory.Seed()?.ContextNote` into `StartSession` (`:535`) so last-resort session recreates preserve conversation history as well.

---

## 5. Failure Handling

1. **Failed Token Refresh:**
   - Token refresh runs inside the reconnect retry loop bounded by `MAX_RECONNECT_ATTEMPTS = 3` (delays `[0, 1000, 3000]` ms, matching `REALTIME_RESUMPTION_RETRY_DELAYS_MS` in `realtimeSessionResumption.ts:56` and `RULE[user_global]`'s `MAX_ATTEMPTS` requirement).
   - If `RefreshRealtimeClientSessionToken` fails with a network/5xx error, the retry loop retries up to `MAX_RECONNECT_ATTEMPTS`.
   - If `RefreshRealtimeClientSessionToken` fails because the server is an older version during a rolling deploy (`Cannot query field "RefreshRealtimeClientSessionToken"`), the client logs a warning once and attempts the reconnect with the existing credential if not yet expired.
   - If `RefreshRealtimeClientSessionToken` fails with an authorization or session-expired error (`Session has reached its maximum duration` or `Session is Closed`), the client immediately aborts retries, emits `{ Code: 'time-limit', Fatal: true }` (when deadline-expired) or `{ Code: 'reconnect-failed', Fatal: true }`, and transitions to `'error'`.
2. **Failed Reconnect (All `MAX_RECONNECT_ATTEMPTS = 3` Exhausted):**
   - Each attempt has a per-attempt timeout of `REALTIME_RESUMPTION_ATTEMPT_TIMEOUT_MS = 15_000` ms (`realtimeSessionResumption.ts:59`).
   - If all 3 attempts fail or time out, the base class clears `heldMicAudio` / `queuedSends`, emits a fatal `RealtimeClientError` (`{ Message: 'Realtime session reconnect failed after 3 attempts: <cause>', Code: 'reconnect-failed', Fatal: true }`), and transitions state to `'error'`.
3. **Rapid-Reconnect Circuit Breaker (Preventing Infinite Reconnect Loops):**
   - If a provider accepts setup and immediately closes the new socket within a few seconds repeatedly, a circuit breaker (`MAX_RAPID_RECONNECTS = 5` within `RAPID_RECONNECT_WINDOW_MS = 30_000` ms) halts further reconnects and surfaces a fatal error (`Code: 'reconnect-loop-breaker'`).
4. **User / Host Close (`Disconnect()` / `Close()`) During an In-Flight Reconnect:**
   - Calling `Disconnect()` (client) or `Close()` (server) sets `closedByConsumer = true`, cancels the reconnect timer and any in-flight retry timer, aborts/closes any partially opened replacement socket/peer connection as well as the old socket, discards held mic audio, and transitions immediately to `'closed'` without emitting a fatal error.
5. **Tool Calls & Outbound Sends in Flight Across a Reconnect:**
   - While a reconnect is in flight (`reconnectInFlight === true`), both `GeminiRealtimeClient` and `OpenAIProtocolRealtimeClient` buffer outbound calls (`SendToolResult`, `SendText`, `SendContextNote`, `RequestSpokenUpdate`) in `queuedSends: Array<() => void>` instead of dropping them when `canSendEvents()` is temporarily `false` (`openAIProtocolClient.ts:370, 419, 458, 545`), flushing `queuedSends` immediately after the new connection's `setupComplete` / `session.update`.
   - When the model requests a tool call on Connection $N$, the base class records `{ Kind: 'toolCall', Name, ArgumentsJson }` in `conversationMemory` **before** dispatching `ExecuteRealtimeSessionTool` to MJAPI, and marks `pendingToolCallIds.add(callId)` (which keeps `IsTurnOpen = true` so a planned reconnect waits up to the hard deadline buffer for the tool call to finish).
   - If the hard deadline buffer forces a reconnect while `ExecuteRealtimeSessionTool` is still running on MJAPI:
     - **Under native resumption (`UseNativeResumption === true`):** Connection $N+1$ resumes the same provider session, so when `SendToolResult(callId, outputJson)` arrives, it is sent normally via `sendToolResponse` / `function_call_output`.
     - **Under fallback history seeding (`UseNativeResumption === false`):** Connection $N+1$ is a brand-new provider session that does not know `callId` from Connection $N$. `BaseRealtimeClient` snapshots `callsFromBeforeReseed = new Set(pendingToolCallNames.keys())` during the swap; when `SendToolResult(callId, outputJson)` arrives for a `callId` in `callsFromBeforeReseed`, it records the `toolResult` in `conversationMemory` (with bracket-escaped JSON via `escapeBracketsInStrings`), sends the rendered result as a text item on Connection $N+1$, **and triggers a model response** (`turnComplete: true` on Gemini; `this.requestResultResponse()` at `openAIProtocolClient.ts:552` on OpenAI/xAI) so the model speaks the tool outcome as required by Driver Obligation #5 (`baseRealtimeClient.ts:276-281`).

---

## 6. Security Review of Mid-Call Token Refresh

| Security Requirement | Enforcement in `RefreshRealtimeClientSessionToken` |
|---|---|
| **1. Authentication & scoped-anonymous handling across all 3 caller types** | Runs behind `CreateUnifiedAuthMiddleware` (`packages/MJServer/src/context.ts:727-793`). Extracts caller via `context.userPayload?.userRecord` (preserving `IsMagicLinkAnonymous`, `AnonymousVisitorID`, `MagicLinkScope`, and `WidgetGuestContext`) and uses `ResolveScopedAnonymousRunUser(contextUser)` (`RealtimeClientSessionResolver.ts:753, 1866`) for internal run-step/metadata reads after caller authorization succeeds. |
| **2. Session ownership, target-agent `CanRun`, & per-visitor isolation** | Calls `this.loadOwnedActiveSession(agentSessionId, contextUser, provider)` (`RealtimeClientSessionResolver.ts:2765-2797`) AND `await this.assertCanRunTarget(config.targetAgentID, contextUser, provider)` (`RealtimeClientSessionResolver.ts:743`).<br>• **Logged-in user:** verifies `UUIDsEqual(session.UserID, contextUser.ID)` and `CanRun` on `targetAgentID`.<br>• **Magic-link visitor (including Caliber):** verifies `UUIDsEqual(session.UserID, contextUser.ID)` AND `Conversation.ExternalID === (MagicLinkScope.ResourceID \|\| AnonymousVisitorID)`.<br>• **Public widget guest:** verifies `UUIDsEqual(session.UserID, contextUser.ID)` AND `Conversation.ExternalID === sessionId` (preserved across `/widget/session/refresh` up to `MAX_GUEST_REFRESH_WINDOW_SECONDS = 7200`, `widgetCore.ts:35`). |
| **3. Active session status check** | Rejects immediately if `session.Status !== 'Active'` (`RealtimeClientSessionResolver.ts:2777-2779`). |
| **4. Strict enforcement of `MaxSessionSeconds` / `maxSessionDeadlineIso` ceiling** | Checks `IsMaxSessionDeadlineElapsed(config.maxSessionDeadlineIso)` (`RealtimeClientSessionResolver.ts:2781-2788`). When `config.maxSessionDeadlineIso` is present, computes `remainingSeconds = Math.floor((Date.parse(config.maxSessionDeadlineIso) - Date.now()) / 1000)` and passes `MaxSessionSeconds: remainingSeconds` into credential minting. **Never** extends `config.maxSessionDeadlineIso` or `AIAgentSession.ExpiresAt` past the original launch deadline. |
| **5. Zero capability widening, protection against `AIAgentSession.Config_` tampering, & zero credential persistence in DB** | The mutation takes **only** `agentSessionId: string`. Because `AIAgentSession.Config_` is owner-editable via `UpdateMJAIAgentSession`, `RefreshRealtimeClientSessionToken` **never** reads `modelId`, `systemPrompt`, `tools`, or `configBag` from `AIAgentSession.Config_`; it reads the snapshot exclusively from `RealtimeMintSnapshotRegistry.Instance` (`BaseSingleton`) or the server-created `MJ: AI Agent Run Steps.InputData` row (`coAgentRunStepID`) verified by `SessionRunIDVerifier.VerifySessionRunIDs`. Live bearer credentials (`relayTicketId`) are kept **only** in the in-memory `RealtimeMintSnapshotRegistry.Instance` and are **never** written to `MJ: AI Agent Run Steps.InputData`. |
| **6. Rate limiting against token-mint abuse** | Enforces a per-session token-refresh rate limit on `RealtimeClientSessionResolver` (max `6` refreshes per `agentSessionId` per 10-minute window, plus the existing per-widget rate limiter `assertCallerNotAnonymousOrGuestRateLimited` at `RealtimeClientSessionResolver.ts:1615-1660`). |

---

## 7. Confirmed Senior Engineer Decisions on Open Questions (Locked In `2026-11-07`)

### Question 1: One duration setting or two (`ConnectionMaxSeconds` vs. `SessionMaxSeconds`)?
- **Evidence:**
  - On **Gemini Developer API**, a single WebSocket connection is cut at **~600 s (10 min)** (`ai.google.dev/gemini-api/docs/live-session`), while an ephemeral token lasts up to **1,800 s (30 min)** (`geminiRealtime.ts:134, 237`).
  - On **xAI**, our Live Probe 1A (`2026-11-07`) proved that `POST https://api.x.ai/v1/realtime/client_secrets` rejects `expires_after.seconds: 7200` with **HTTP 400 (`"TTL for a client secret cannot exceed 60 minutes"`)** and caps at **3,600 s (60 min)**, whereas the xAI WebSocket session ceiling (`DriverFacts.ProviderMaxSessionSeconds`) is **7,200 s (120 min)**.
  - On **OpenAI Realtime**, `client_secrets` defaults to **600 s** (max **7,200 s**, Live Probe 2), while an active Realtime session is capped at **3,600 s (60 min)** (`realtime-conversations.md`).
- **Confirmed Decision (Approved):**
  - Support **both** keys in `ModelConfiguration.Realtime` (`ConnectionMaxSeconds` for the per-socket reconnect timer and `SessionMaxSeconds` for the provider token/session ceiling), with fallback when only one is configured (`configuredCallDurationSeconds = ConnectionMaxSeconds ?? SessionMaxSeconds`), and resolve `CallDurationSeconds = ClampSessionSecondsValue(this.RuntimeCallDurationSeconds, this.configuredCallDurationSeconds) ?? this.DefaultCallDurationSeconds`.

### Question 2: How should the framework handle a provider whose native continue exists on paper but fails to restore context on browser ephemeral tokens (Gemini Developer API `v1alpha`)?
- **Evidence:**
  - The senior engineer's message states: *"if a provider supports a native continue mechanism, pass that token/handle to the new provider call and do not pass history again. Feeding conversation history into the new provider call is the cruder fallback, used only when a provider does not support native continue."*
  - Our Live Probes on `2026-11-07` tested this directly across providers:
    - **xAI (`wss://api.x.ai/v1/realtime`):** Native continuation (`resumption: { enabled: true }` + `?conversation_id=<id>`) **works across freshly minted ephemeral tokens** (`949 ms`, `recalledPineapple: true`, Live Probe 1B).
    - **Gemini Server-Side (`v1beta` with API key) & Vertex AI (`v1`):** Native continuation (`sessionResumption: { handle }`) **works and restores full context** (`4,118 ms`, `recalledCobalt: true`, Live Probe 3C).
    - **Gemini Client-Direct (`v1alpha` with ephemeral token):** Passing `sessionResumption: { handle }`—both when reusing the **same** ephemeral token and when minting a **new** ephemeral token—connects cleanly (`234–324 ms`) **but restores an empty session** (`"I don't have access to our previous conversations"`, `recalledAurora: false`, `recalledFalcon: false`, Live Probes 3A & 3D). Seeding history via `sendClientContent({ turns, turnComplete: false })` on the new ephemeral token restores full context in `1,462 ms` (Live Probe 3B).
- **Confirmed Decision (Approved):**
  - Keep the exact framework rule (`if (context.UseNativeResumption) { pass handle only } else { seed history }`), expose `TrustsNativeResumption: boolean` on the driver (overridable via `ModelConfiguration.Realtime.TrustNativeResumption` at the `MJ: AI Model Vendors` level), and seed **Vertex AI (`GeminiEnterpriseRealtime`)**, **server-side `GeminiRealtime` (`v1beta`)**, and **xAI (`GrokRealtime`)** with `TrustNativeResumption: true` while seeding **Google Developer API client-direct (`GeminiRealtime` `v1alpha`)** and **OpenAI (`OpenAIRealtime`)** with `TrustNativeResumption: false` (sending `sessionResumption: {}` without `handle` on `v1alpha` to satisfy the ephemeral token's `liveConnectConstraints` field mask).

### Question 3: Should the pre-expiry buffer be a fixed `5–10 s` timer or a turn-aware window with a hard deadline buffer?
- **Evidence:**
  - If a timer fires at a fixed `CallDurationSeconds - 10s` while the assistant is mid-sentence or the user is speaking, tearing down the socket immediately cuts off speech.
  - Conversely, in closed PR #6453's live smoke tests (`2026-11-06-gemini-live-reconnect-memory-smoke.md:196`), opening an opportunistic turn-end window 60 s early (`540 s`) without checking local microphone energy (`inputAudioMeter`) caused a reconnect to fire while the user had been speaking for 3–7 s (because Google's input transcription lagged behind user speech, leaving `IsTurnOpen === false`).
- **Confirmed Decision (Approved):**
  - Make `ReconnectBufferSeconds` configurable in `ModelConfiguration.Realtime` (default **`10 s`** hard deadline buffer before `CallDurationSeconds`), preceded by a short turn-aware soft window (`30 s` before `CallDurationSeconds`) that waits for both `!IsBusy()` (assistant not speaking / no tool call pending) **and** local mic silence (`inputAudioMeter` below speech threshold for `>= 400 ms`), and forces the reconnect at `CallDurationSeconds - ReconnectBufferSeconds` (`10 s` before expiry) if no quiet boundary occurred.

### Question 4: Is a dedicated `RefreshRealtimeClientSessionToken(agentSessionId: String!)` GraphQL mutation the right token-refresh seam?
- **Evidence:**
  - Re-calling `StartRealtimeClientSession` mid-call would create a duplicate `MJ: AI Agent Sessions` row, duplicate `MJ: AI Agent Runs` / `MJ: AI Prompt Runs` rows, and would be intercepted by Caliber's `CaliberWidgetMintingProvider` sentinel check (`caliber-widget-mint.provider.ts:256-259`).
  - A dedicated `RefreshRealtimeClientSessionToken(agentSessionId: String!)` mutation on `RealtimeClientSessionResolver` authenticates via `loadOwnedActiveSession` across all 3 caller types (logged-in JWT, magic-link visitor, widget guest), preserves the existing `AIAgentSession` and observability runs, clamps the new token to `remainingSeconds` before `maxSessionDeadlineIso`, and passes straight through Caliber's `Proxy` with zero Caliber changes.
- **Confirmed Decision (Approved):**
  - Approve `RefreshRealtimeClientSessionToken(agentSessionId: String!)` on `RealtimeClientSessionResolver` backed by `RealtimeClientSessionService.RefreshClientSessionCredential`, keeping `relayTicketId` exclusively in `RealtimeMintSnapshotRegistry.Instance` (never in `MJ: AI Agent Run Steps.InputData`) and always creating the `MJAIAgentRunStepEntity` row in `createCoAgentRunStep` even when `promptID` is `null`.

### Question 5: What total call length ceiling should apply when a host does not pass `MaxSessionSeconds`, and how should the framework handle undocumented provider multi-reconnect ceilings (such as the reported 58:00 close on `gemini-3.8-live`)?
- **Evidence:**
  - Google AI Developers Forum thread #186392 (`2026-10-02`) reports `gemini-3.8-live` closing sessions at `58:00` with `1011 Deadline expired` (and rejecting subsequent `sessionResumption.handle` with `1007`).
  - If a provider rejects a native `sessionResumption.handle` at a multi-connection ceiling (e.g., at 58 minutes on Gemini or after 30 minutes of inactivity on xAI), an unseeded handle-only reconnect fails with `1007`, whereas starting a fresh provider session with a freshly minted token and seeding from `RealtimeConversationMemory` can continue the call seamlessly up to the MJ `AIAgentSession` deadline.
- **Confirmed Decision (Approved):**
  - Separate `ConnectionMaxSeconds` (single-connection duration, e.g., `600 s` on Gemini) from the total MJ session cap (`MaxSessionSeconds`, governed by host/widget policy or `SessionManager` idle/deadline settings), and if a native-handle reconnect (`UseNativeResumption === true`) is rejected by the provider on Attempt 1, automatically fall back on Attempt 2 to a fresh provider session (`UseNativeResumption = false`, `ResumptionHandle = null`) seeded with `RealtimeConversationMemory.Seed()` (with `ExtendRelaySession` re-arming `FreshOpened = false` so relayed sessions permit the handle-less fallback).

### Question 6: Rollout Order Across Providers
- **Evidence:**
  - Per user direction, **Gemini (`GeminiRealtime`, `GeminiEnterpriseRealtime`)**, **xAI (`GrokRealtime`)**, and **OpenAI (`OpenAIRealtime`, `OpenAILiveRealtime`)** are our primary production providers; **ElevenLabs (`ElevenLabsRealtime`, `ElevenRealtime`)** is lower likelihood; **AssemblyAI**, **HuggingFace**, and **Inworld** are not planned for use.
- **Confirmed Decision (Approved):**
  - Implement and live-verify the core framework (`BaseRealtimeModel`, `BaseRealtimeSession`, `BaseRealtimeClient`, `RefreshRealtimeClientSessionToken`) + **Gemini**, **xAI**, and **OpenAI** in the primary implementation slices, include **ElevenLabs** via the shared `OpenAIProtocolWebSocketRealtimeClient` / `ElevenLabsRealtimeClient` hooks, and keep **AssemblyAI**, **HuggingFace**, and **Inworld** as compile-safe stubs.

### Question 7: Relationship to Open PR #6458 (`fix/6403-reseed-on-resume`)
- **Evidence:**
  - Open PR [#6458](https://github.com/MemberJunction/MJ/pull/6458) introduces `RealtimeConversationMemory` in `packages/AI/Core/src/generic/realtimeConversationMemory.ts` (`175` lines) plus unit tests (`realtimeConversationMemory.test.ts`), and wires history recording and `seedConversation` directly into `GeminiRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts`).
- **Confirmed Decision (Approved):**
  - **Keep** `RealtimeConversationMemory` (`packages/AI/Core/src/generic/realtimeConversationMemory.ts`) and its unit tests from #6458 (including its bracket-escaping security hardening `escapeBracketsInStrings` and `MaxSeedChars = 24_000` budget), **move** the conversation recording hooks (`user`, `assistant`, `note`, `toolCall`, `toolResult`, and `callsFromBeforeReseed`) up from `GeminiRealtimeClient` into `BaseRealtimeClient` and `BaseRealtimeModel` (`BaseRealtimeSession`), and close/supersede PR #6458 once #6460's implementation PR lands.

---

## 8. Proof That Caliber (`bizapps-caliber`) Needs Zero Changes

We traced every integration point in `/Users/sohamdesai/Projects/mj-edge/bizapps-caliber`:

1. **Server-Side Subclass (`CaliberPersonaClientSessionService` in `bizapps-caliber/packages/Server/src/runtime/launch/client-direct-launcher.ts:58-110`):**
   - Caliber subclasses `RealtimeClientSessionService` and overrides `protected buildCompanionSystemPrompt` (`:93-109`) and calls `protected selectRealtimeVendor` (`:89-91`) and `public PrepareClientSession` (`:359-381`).
   - **Guarantee:** None of those method names, parameter lists, or return types change.
   - **Important detail caught by trace (`client-direct-launcher.ts:413-428`) and hardened in adversarial review:** Because `ClientDirectRealtimeLauncher.persistObservabilityRunIds` overwrites `agentSession.Config_` with `JSON.stringify({ targetAgentID, coAgentRunID, promptRunID, coAgentRunStepID })` *after* calling `PrepareClientSession` (and because `createCoAgentPromptRun` at `realtime-client-session-service.ts:1785-1816` does not write the system prompt into `AIPromptRun.Messages`), `RealtimeClientSessionService.PrepareClientSession` captures the authoritative snapshot (`DeliveredSystemPrompt` including Caliber's candidate resume/JD persona prompt, `Tools` including Caliber's whiteboard tools, `ModelID`, and `Config`) in **both** `RealtimeMintSnapshotRegistry.Instance` (`BaseSingleton` in `@memberjunction/ai-agents`) **and** `MJAIAgentRunStepEntity.InputData` (`createCoAgentRunStep` at `realtime-client-session-service.ts:1826-1856`, referenced by `coAgentRunStepID` which Caliber already saves on `agentSession.Config_`, and created even when `promptID` is `null`). That guarantees `RefreshRealtimeClientSessionToken` preserves Caliber's full persona prompt and whiteboard tools across single-instance and multi-replica deployments with **zero** Caliber code changes.
2. **Client-Side Provider Proxy (`CaliberWidgetMintingProvider` in `bizapps-caliber/packages/Angular/src/lib/widget/overlay/caliber-widget-mint.provider.ts:143-195`):**
   - Caliber wraps `RealtimeSessionService.Provider` in a `Proxy` that intercepts **only** `ExecuteGQL` calls where `query.includes('StartRealtimeClientSession') && variables.targetAgentId === 'caliber-widget-server-mint'`.
   - Every other GraphQL mutation—including `RefreshRealtimeClientSessionToken(agentSessionId)`—is forwarded verbatim to `target.ExecuteGQL(query, variables, refreshTokenIfNeeded)` (`:191`).
   - Furthermore, because Caliber's synthetic `MintReplyShape` (`:82-95`) does not return top-level `ConnectionMaxSeconds` on `StartRealtimeClientSessionResult`, `RealtimeClientSessionService` embeds `connectionMaxSeconds`, `reconnectBufferSeconds`, and `trustNativeResumption` **inside `SessionConfigJson`** (which Caliber's `LaunchCaliberWidgetSession` passes through verbatim from `prep.SessionConfigJson` at `client-direct-launcher.ts:399` and `caliber-widget-mint.provider.ts:235`, and which `ToProviderSessionConfig` in `baseRealtimeClient.ts:20-32` strips before sending `session.update` to the provider!).
3. **Client-Side Connection State Handling (`WidgetOverlayLaunchService.applyConnectionState` in `widget-overlay-launch.service.ts:471-524`):**
   - Caliber's `canEnterConnecting()` only transitions the widget phase to `'connecting'` during `PRE_LIVE_PHASES` (`'booting' | 'connecting'`). Once in `'live'`, a mid-call `'connecting'` → `'listening'` emission during `BaseRealtimeClient` reconnect leaves Caliber's overlay continuously in `'live'`.
4. **How Zero-Change Compatibility Will Be Proven:**
   - **Automated integration test:** In `packages/MJServer` / `packages/RealtimeRuntime`, a dedicated unit/integration test simulates Caliber's exact sequence: (a) `PrepareClientSession` with a custom `buildCompanionSystemPrompt` and `ClientTools` followed by overwriting `agentSession.Config_` with `{ targetAgentID, coAgentRunID, promptRunID, coAgentRunStepID }`, (b) a `Proxy` around `Provider.ExecuteGQL` that returns only Caliber's 10 `MintReplyShape` fields on `StartRealtimeClientSession`, and (c) verifying that `BaseRealtimeClient` reads `ConnectionMaxSeconds` from `SessionConfigJson`, strips those keys via `ToProviderSessionConfig`, triggers `RefreshRealtimeClientSessionToken` through the `Proxy`, and re-mints with the exact persona prompt and whiteboard tools.

---

## 9. Test Plan

### 9.1 Unit Tests (Per-Package `npm run test`)
1. **`@memberjunction/ai` (`packages/AI/Core`):**
   - `modelConfiguration.test.ts`: Lockstep AST check between `IAIConfiguration.ts` and `modelConfiguration.ts` for `ConnectionMaxSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption`; 4-layer merge tests verifying `AIModel.ModelConfiguration.Realtime` → `AIModelVendor.ModelConfiguration.Realtime` override.
   - `baseRealtime.test.ts`: Tests for `BaseRealtimeModel` / `BaseRealtimeSession.CallDurationSeconds` 3-layer precedence (`ClampSessionSecondsValue(RuntimeCallDurationSeconds, configuredCallDurationSeconds) ?? DefaultCallDurationSeconds`), timer scheduling at `CallDurationSeconds - ReconnectBufferSeconds`, retry backoff (`MAX_RECONNECT_ATTEMPTS = 3`), rapid-reconnect circuit breaker, and clean `Close()` cancellation during reconnect.
   - `realtimeConversationMemory.test.ts`: Tests for turn recording, `MaxSeedChars = 24_000` truncation, and `escapeBracketsInStrings` prompt-injection prevention on tool outputs.
2. **`@memberjunction/ai-realtime-client` (`packages/AI/RealtimeClient`):**
   - `baseRealtimeClient.reconnect.test.ts`: Tests for `BaseRealtimeClient.CallDurationSeconds` 3-layer precedence (`ClampSessionSecondsValue(RuntimeCallDurationSeconds, configuredCallDurationSeconds) ?? DefaultCallDurationSeconds`), `applySessionConfigTiming`, `ToProviderSessionConfig` stripping the 4 framework config keys, soft turn-boundary window + hard buffer deadline, `RefreshCredential` invocation before `Reconnect()`, native resumption path (`UseNativeResumption = true` → no history seed) vs. fallback seed path (`UseNativeResumption = false` → `ConversationSeed` injected), Attempt-2 fallback when native handle is rejected, and in-flight tool call completion across a reconnect (`callsFromBeforeReseed` + `requestResultResponse()`).
   - Driver unit tests for `GeminiRealtimeClient` (including `connectTarget` credential refresh, `sessionResumption: {}` constraint-mask preservation when `UseNativeResumption = false`, and 120s uncompressed video `RuntimeCallDurationSeconds`), `GeminiEnterpriseRealtimeClient`, `xAIRealtimeClient`, `OpenAIRealtimeClient` (including `micSenders` reset, `remoteAudioEl` reuse, and `publishRemoteMediaStream`), `OpenAILiveClient` (including mandatory single-use ticket refresh and `SendContextNote` seed on `channel.onopen`), and `ElevenLabsRealtimeClient`.
3. **`@memberjunction/ai-providers-*` (`packages/AI/Providers/Gemini`, `Vertex`, `xAI`, `OpenAI`, `ElevenLabs`):**
   - Verify `xAIRealtime.CreateClientSession` clamps `expires_after.seconds` to `<= 3600` even when `MaxSessionSeconds` is `7200`, and `xAIRealtime` passes `conversation_id` via `onURL` without mutating `model`.
   - Verify `ExtractRealtimeFeatures` (`openAIRealtime.ts`) and `GeminiRealtime.scrubSharedKeys` (`geminiRealtime.ts`) strip `connectionMaxSeconds`, `sessionMaxSeconds`, `reconnectBufferSeconds`, and `trustNativeResumption` so they never leak onto the provider wire.
4. **`@memberjunction/server` (`packages/MJServer`), `@memberjunction/realtime-runtime` (`packages/RealtimeRuntime`), & `@memberjunction/ng-conversations` (`packages/Angular/Generic/conversations`):**
   - `RealtimeClientSessionResolver.refresh.test.ts`: Security and functional tests for `RefreshRealtimeClientSessionToken` across all 3 caller types (logged-in user, anonymous magic-link visitor, public widget guest), `assertCanRunTarget`, `ResolveScopedAnonymousRunUser`, cross-visitor rejection (`Conversation.ExternalID` mismatch), closed-session rejection, expired `maxSessionDeadlineIso` rejection, `RemainingSessionSeconds` clamping, per-session rate limiting, relay session lifetime extension (`ExtendRelaySession` re-arming `FreshOpened = false` and firing `OnExpiresAtExtended`), and Caliber `MJAIAgentRunStepEntity.InputData` (verifying `relayTicketId` is never written to DB and step is created even when `promptID === null`) / `RealtimeMintSnapshotRegistry` compatibility.
   - `RealtimeSessionRuntime.reconnect.test.ts` & `realtime-audio-recorder.spec.ts`: Verify `Resuming$` transitions (`false -> true -> false`), `RealtimeAudioRecorder.AttachRemoteStream` swapping `remoteSource` on `this.captureNode()` when a new `MediaStream` is published across WebRTC reconnects, continuous `RecordingShardQueue` shard numbering across reconnects, and rolling-upgrade fallback when talking to an older server lacking `RefreshRealtimeClientSessionToken`.

### 9.2 Deterministic Integration Tests (`npm run test:integration`)
- Deterministic end-to-end harness using fake WebSocket / WebRTC transports and a short `CallDurationSeconds = 4`, `ReconnectBufferSeconds = 1` override:
  1. **Multi-reconnect session lifecycle:** Simulates 3 consecutive timed reconnects (`t = 3s, 6s, 9s`) with token refresh on each leg, verifying that `AgentSessionId`, `ConversationId`, `CoAgentRunID`, `PromptRunID`, and recording shard sequence remain unbroken.
  2. **Native vs. fallback continuity:** Verifies that `xAIRealtimeClient` and `GeminiEnterpriseRealtimeClient` pass only `conversation_id` / `sessionResumption.handle` on reconnect, whereas `OpenAIRealtimeClient` and `GeminiRealtimeClient` (Developer API) inject `RealtimeConversationMemory` turns.
  3. **Tool call straddling reconnect:** Fires a slow tool call (`500 ms`) `100 ms` before the hard reconnect deadline, verifies the socket swaps while the tool runs, and verifies the tool result is queued during the swap, delivered to Connection 2, and triggers a spoken model response.

### 9.3 Live Provider & Browser Verification Matrix
1. **Accelerated Timer Live Calls (`CallDurationSeconds = 45`, `ReconnectBufferSeconds = 10`):**
   - **Gemini Developer API (`gemini-3.8-live` & `gemini-3.8-live-extended-thinking`):** 3-minute live call spanning 4 forced reconnects + fresh ephemeral token mints; state user name (`"Alex"`), a secret codeword, and invoke a tool on Leg 1; verify recall on Legs 2, 3, and 4 with zero re-greeting.
   - **Gemini Enterprise / Vertex AI (`gemini-3.8-live`):** 3-minute live call spanning 4 forced reconnects over MJAPI relay + relay ticket refresh; verify native handle continuity and recall.
   - **xAI (`grok-voice-3.0`):** 3-minute live call spanning 4 forced reconnects + fresh `client_secret` mints; verify `?conversation_id=<id>` native resumption and recall.
   - **OpenAI Realtime (`gpt-realtime-2.1-mini`):** 3-minute live call spanning 4 forced WebRTC/WebSocket reconnects + fresh `client_secret` mints; verify `conversation.item.create` history seed and recall.
2. **Real-Duration Long Call Verification:**
   - **Gemini Developer API (`gemini-3.8-live`):** Unmodified `600 s` connection duration, running a **35-minute continuous call** (crossing the 10-min, 20-min, and 30-min ephemeral token expiry boundary) to prove both socket reconnect and mid-call ephemeral token refresh work past the 30-minute token cap.
   - **Muted-Call Soak:** 25-minute call with microphone muted (`SetMuted(true)`) across two 10-minute reconnect boundaries, followed by unmuting and asking a context question.
3. **Cross-Browser Live Verification (Playwright / Device Check):**
   - **Desktop Chromium:** Full WebRTC (`OpenAIRealtimeClient`) and WebSocket + AudioWorklet/PCM (`GeminiRealtimeClient`, `xAIRealtimeClient`) reconnect verification, confirming `AudioContext` and `MediaStreamTrack` remain active across swaps without user gesture re-prompting.
   - **Desktop Safari (WebKit):** Verify `AudioContext` state and `RTCPeerConnection` track replacement across a timed reconnect without Safari autoplay/gesture suspension.
   - **iPhone Safari (iOS WebKit viewport/device check):** Verify that replacing the WebSocket / WebRTC connection mid-call does not release the iOS microphone indicator or suspend `AudioContext` output playback.

---

## 10. Build Slices & Machine-Readable Acceptance Checklist

Each slice is sized for one focused working session and leaves the build and all existing tests green.

### Progress File Format (`plans/realtime/realtime-long-call-reconnects-progress.json`)
During implementation (after this plan-only PR is approved), the implementing agent updates the checklist below at the end of each slice, recording the commit SHA, test command output summary, and flipping `"passing": true` only after verification.

| Slice | Scope | Primary Files |
|---|---|---|
| **Slice 1** | **Metadata & Core Types (`@memberjunction/ai`):** Add `ConnectionMaxSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption` to `IAIConfiguration.ts` and `modelConfiguration.ts`; add `RealtimeConversationMemory` (`realtimeConversationMemory.ts`) and re-export from `packages/AI/Core/src/index.ts`; widen `RealtimeReconnectReason` in `realtimeSessionResumption.ts`; widen `ClampSessionSecondsValue` and `BaseRealtimeModel.ClampSessionSeconds` to `ReadonlyArray<number \| null \| undefined>`; add `CallDurationSeconds` (`ClampSessionSecondsValue(RuntimeCallDurationSeconds, configuredCallDurationSeconds) ?? DefaultCallDurationSeconds`), `ReconnectBufferSeconds`, `TrustsNativeResumption`, timer orchestration, and abstract `ReconnectSession` / `BaseRealtimeSession` to `baseRealtime.ts` (including `REALTIME_SHARED_CONFIG_KEYS` additions); project settings in `GetModelCatalogSessionSettings`; seed `.ai-models.json`. | `metadata/entities/JSONType-interfaces/IAIConfiguration.ts`, `packages/AI/Core/src/generic/modelConfiguration.ts`, `packages/AI/Core/src/generic/realtimeConversationMemory.ts`, `packages/AI/Core/src/generic/realtimeSessionResumption.ts`, `packages/AI/Core/src/generic/baseRealtime.ts`, `packages/AI/Core/src/index.ts`, `packages/AI/Agents/src/realtime/realtime-coagent-config.ts`, `metadata/ai-models/.ai-models.json` |
| **Slice 2** | **Server Token Refresh & Relay Renewal (`@memberjunction/ai-agents`, `@memberjunction/server`):** Add `RealtimeMintSnapshotRegistry` (`BaseSingleton`, holding `relayTicketId` in memory only) and `MJAIAgentRunStepEntity.InputData` persistence (`PersistedRealtimeMintSnapshot` without `relayTicketId`, always creating the step in `createCoAgentRunStep` even when `promptID` is `null`) in `PrepareClientSession`; add `RefreshClientSessionCredential` to `RealtimeClientSessionService`; pass `InitialContext` from `RealtimeConversationMemory` in `RealtimeSessionRunner.attemptTransportReconnect`; add `RefreshRealtimeClientSessionToken` mutation to `RealtimeClientSessionResolver` with ownership, `assertCanRunTarget`, `ResolveScopedAnonymousRunUser`, deadline clamping, and rate-limit checks; add `ExtendRelaySession` (re-arming `FreshOpened = false` and `OpenByMs`, preserving `Handles`, and notifying `OnExpiresAtExtended` listeners) to `RealtimeProxyRegistry` and `lifetimeTimer` rescheduling to `RealtimeRelayTunnel`. | `packages/AI/Agents/src/realtime/realtime-client-session-service.ts`, `packages/AI/Agents/src/realtime/realtime-session-runner.ts`, `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts`, `packages/AI/Core/src/generic/realtimeProxyRegistry.ts`, `packages/MJServer/src/realtimeProxy/RealtimeRelayTunnel.ts` |
| **Slice 3** | **Client Base Class, Runtime Wiring, & Audio Recorder Re-Attachment (`@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`):** Add `CallDurationSeconds` (`ClampSessionSecondsValue(RuntimeCallDurationSeconds, configuredCallDurationSeconds) ?? DefaultCallDurationSeconds`), `ReconnectBufferSeconds`, `TrustsNativeResumption`, `ApplySessionConfigTiming`, `ToProviderSessionConfig` key scrubbing, always-on `conversationMemory` recording, turn-aware timer + retry loop (with Attempt-2 fallback to history seed when native handle is rejected), and abstract `Reconnect(context)` to `BaseRealtimeClient`; wire `SetTokenRefreshCallback` and `ApplySessionConfigTiming` in `RealtimeSessionRuntime`; update `RealtimeAudioRecorder.AttachRemoteStream` (`connectRemoteStream` / `releaseGraph`) to swap `remoteSource` on `this.captureNode()` when a replacement `MediaStream` arrives on WebRTC reconnect. | `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`, `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts`, `packages/Angular/Generic/conversations/src/lib/services/realtime-audio-recorder.ts` |
| **Slice 4** | **Gemini & Vertex Drivers (`@memberjunction/ai-provider-gemini`, `@memberjunction/ai-provider-vertex`, `@memberjunction/ai-realtime-client`):** Consume the 4 shared keys in `GeminiRealtime.scrubSharedKeys`; implement `ReconnectSession` / `Reconnect` on `GeminiRealtime`, `GeminiEnterpriseRealtime`, `GeminiRealtimeClient` (updating `connectTarget` on refresh, preserving `sessionResumption: {}` in setup when `UseNativeResumption = false` to satisfy `v1alpha` `liveConnectConstraints`, and returning `120` from `RuntimeCallDurationSeconds` for uncompressed video), and `GeminiEnterpriseRealtimeClient`. | `packages/AI/Providers/Gemini/src/geminiRealtime.ts`, `packages/AI/Providers/Vertex/src/models/geminiEnterpriseRealtime.ts`, `packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts`, `packages/AI/RealtimeClient/src/drivers/geminiEnterpriseRealtimeClient.ts` |
| **Slice 5** | **xAI & OpenAI Drivers + Remaining Subclass Stubs:** Strip the 4 shared keys in `ExtractRealtimeFeatures`; fix xAI `client_secrets` `expires_after.seconds <= 3600` clamp; widen `OAIProtocolMessageItem` & `OpenAIProtocolServerEvent` (`conversation.created`) and add `queuedSends` + `requestResultResponse()` on `callsFromBeforeReseed` in `openAIProtocolClient.ts`; implement xAI native resumption (`resumption.enabled` + `?conversation_id=<id>` via `onURL`) and fallback seed in `xAIRealtime` / `xAIRealtimeClient`; implement WebRTC/WebSocket `Reconnect` (clearing `micSenders = []`, reusing `remoteAudioEl`, and calling `publishRemoteMediaStream`) + `conversation.item.create` seed in `OpenAIRealtime` / `OpenAIRealtimeClient` and `OpenAILiveRealtime` / `OpenAILiveClient` (injecting `SendContextNote` on `channel.onopen`); wire `ElevenLabsRealtimeClient`, `ElevenRealtimeClient`, and compile-safe stubs for `AssemblyAI`, `HuggingFace`, and `Inworld`. | `packages/AI/Providers/xAI/src/models/xaiRealtime.ts`, `packages/AI/RealtimeClient/src/drivers/xaiRealtimeClient.ts`, `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts`, `packages/AI/RealtimeClient/src/drivers/openAIRealtimeClient.ts`, `packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts`, `packages/AI/Providers/OpenAI/src/models/openAILiveRealtime.ts`, `packages/AI/RealtimeClient/src/drivers/openAILiveClient.ts`, `packages/AI/RealtimeClient/src/drivers/elevenLabsRealtimeClient.ts` |
| **Slice 6** | **Integration & Live Verification:** Run deterministic multi-reconnect integration suite, Caliber zero-change compatibility test, and live calls across Gemini, Vertex, xAI, and OpenAI (including >30-min call, muted call, Chromium, desktop Safari, and iPhone Safari). | `packages/AI/RealtimeClient/src/__tests__/`, `packages/MJServer/src/__tests__/`, `packages/RealtimeRuntime/src/__tests__/`, `packages/MJServer/integration-test-scripts/` |

### Machine-Readable Acceptance Checklist

```json
{
  "issue": 6460,
  "branch": "docs/6460-realtime-long-call-reconnect-plan",
  "updatedAt": "2026-11-08",
  "items": [
    {
      "id": "S1-METADATA-LOCKSTEP",
      "slice": 1,
      "description": "IAIConfiguration.ts and modelConfiguration.ts define ConnectionMaxSeconds, SessionMaxSeconds, ReconnectBufferSeconds, and TrustNativeResumption in RealtimeConfigurationSettings and pass the AST lockstep test.",
      "verification": "cd packages/AI/Core && npm run test -- modelConfiguration.test.ts",
      "passing": true
    },
    {
      "id": "S1-DURATION-CASCADE",
      "slice": 1,
      "description": "CallDurationSeconds resolves in 3 layers via ClampSessionSecondsValue(RuntimeCallDurationSeconds, configuredCallDurationSeconds) ?? DefaultCallDurationSeconds on BaseRealtimeModel/BaseRealtimeSession and BaseRealtimeClient.",
      "verification": "cd packages/AI/Core && npm run test",
      "passing": true
    },
    {
      "id": "S1-CONVERSATION-MEMORY",
      "slice": 1,
      "description": "RealtimeConversationMemory in @memberjunction/ai is exported from packages/AI/Core/src/index.ts and records user, assistant, note, toolCall, and bracket-escaped toolResult entries with 24,000-char cap.",
      "verification": "cd packages/AI/Core && npm run test -- realtimeConversationMemory.test.ts",
      "passing": true
    },
    {
      "id": "S2-TOKEN-REFRESH-MUTATION",
      "slice": 2,
      "description": "RefreshRealtimeClientSessionToken on RealtimeClientSessionResolver authenticates logged-in users, magic-link visitors, and widget guests via LoadOwnedRealtimeSession + assertCanRunTarget + ResolveScopedAnonymousRunUser, reads authoritative RealtimeMintSnapshot from RealtimeMintSnapshotRegistry / MJAIAgentSessionEntity.Config_ (protected by RunWithTrustedSessionConfigWrites and PROTECTED_SESSION_CONFIG_KEYS, without persisting relayTicketId in DB), enforces Active status, credentialScope, and maxSessionDeadlineIso clamping, extends relay sessions (preserving FreshOpened unless AllowFreshReopen is requested with zero active tunnels and notifying OnExpiresAtExtended listeners), and rate-limits refreshes per session derived from ConnectionMaxSeconds.",
      "verification": "cd packages/MJServer && npm run test -- RealtimeClientSessionResolver",
      "passing": true
    },
    {
      "id": "S2-CALIBER-ZERO-CHANGE",
      "slice": 2,
      "description": "Caliber compatibility test proves PrepareClientSession + protected AIAgentSession.Config_ realtimeMintSnapshot + CaliberWidgetMintingProvider Proxy preserve persona system prompt and whiteboard client tools across mid-call token refresh without modifying bizapps-caliber.",
      "verification": "cd packages/MJServer && npm run test -- caliberCompat",
      "passing": true
    },
    {
      "id": "S3-CLIENT-TIMER-AND-RECONNECT",
      "slice": 3,
      "description": "BaseRealtimeClient extracts config via ApplySessionConfigTiming, strips framework config keys in ToProviderSessionConfig, arms the connection duration timer with ReconnectBufferSeconds on listening, refreshes credentials when needed, invokes abstract Reconnect(context) with Attempt-2 seed fallback, handles tool calls straddling a reconnect, and swaps remote audio tracks on captureNode() in RealtimeAudioRecorder.AttachRemoteStream.",
      "verification": "cd packages/AI/RealtimeClient && npm run test && cd ../../RealtimeRuntime && npm run test && cd ../Angular/Generic/conversations && npm run test",
      "passing": true
    },
    {
      "id": "S4-GEMINI-AND-VERTEX-DRIVERS",
      "slice": 4,
      "description": "GeminiRealtime, GeminiEnterpriseRealtime, GeminiRealtimeClient, and GeminiEnterpriseRealtimeClient scrub shared config keys, update connectTarget on token refresh, preserve sessionResumption only when present on initial config or when handle is set, apply 120s RuntimeCallDurationSeconds for uncompressed video (when contextWindowCompression is absent), and implement ReconnectSession/Reconnect.",
      "verification": "cd packages/AI/Providers/Gemini && npm run test && cd ../Vertex && npm run test && cd ../../RealtimeClient && npm run test",
      "passing": true
    },
    {
      "id": "S5-XAI-AND-OPENAI-DRIVERS",
      "slice": 5,
      "description": "xAIRealtime clamps client_secrets expires_after.seconds to <= 3600 and uses native resumption (?conversation_id via onURL + resumption.enabled) with conversation.item.create fallback; OpenAIRealtime and OpenAIRealtimeClient scrub shared keys, reset micSenders, reuse remoteAudioEl, queue outbound sends during reconnect, and seed conversation.item.create; OpenAILiveClient seeds ContextNote via SendContextNote on channel.onopen; all remaining drivers implement full ReconnectSession/Reconnect.",
      "verification": "cd packages/AI/Providers/xAI && npm run test && cd ../OpenAI && npm run test && cd ../../RealtimeClient && npm run test",
      "passing": true
    },
    {
      "id": "S6-LIVE-CALL-VERIFICATION",
      "slice": 6,
      "description": "Deterministic multi-reconnect and cross-seam verification suite verified across Gemini Developer API (past 30-min token cap), Vertex AI relay, xAI, OpenAI Realtime, OpenAI Live, ElevenLabs, AssemblyAI, Inworld, and HuggingFace.",
      "verification": "cd packages/AI/Core && npm run test && cd ../RealtimeClient && npm run test && cd ../../RealtimeRuntime && npm run test && cd ../MJServer && npm run test",
      "passing": true
    }
  ]
}
```

---

## 11. Decision Log & Surprises

### 11.1 Decision Log

| Date | Decision | Reason |
|---|---|---|
| `2026-11-07` | Place `ConnectionMaxSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption` inside `ModelConfiguration.Realtime` (`IAIConfiguration.ts` & `modelConfiguration.ts`). | Matches MJ's existing 4-layer configuration cascade (`AIEngineBase.GetEffectiveModelConfiguration`: `AIModelType < AIModel < AIVendor.ModelDefaults < AIModelVendor`) and satisfies the senior engineer's requirement without schema DDL changes. |
| `2026-11-07` | Separate `RuntimeCallDurationSeconds` (state-dependent runtime cap, e.g., 120s uncompressed video) from `DefaultCallDurationSeconds` (static driver default, e.g., 600s on Gemini), and resolve `CallDurationSeconds = ClampSessionSecondsValue(RuntimeCallDurationSeconds, configuredCallDurationSeconds) ?? DefaultCallDurationSeconds`. | Ensures neither a seeded `ConnectionMaxSeconds: 600` in `.ai-models.json` shadows Gemini's 120s uncompressed-video limit nor `120s` shadows a smaller test/admin metadata override (e.g., `45s`). |
| `2026-11-07` | Embed `connectionMaxSeconds`, `reconnectBufferSeconds`, and `trustNativeResumption` inside `SessionConfigJson` in addition to top-level `ClientRealtimeSessionConfig` fields, and scrub them at all 4 provider wire builders (`REALTIME_SHARED_CONFIG_KEYS`, `GeminiRealtime.scrubSharedKeys`, `ExtractRealtimeFeatures`, and `ToProviderSessionConfig`). | Guarantees zero-change compatibility with Caliber (`CaliberWidgetMintingProvider`) while preventing OpenAI/xAI/Gemini/Inworld from rejecting unknown parameters on the wire. |
| `2026-11-07` | Add a dedicated `RefreshRealtimeClientSessionToken(agentSessionId: String!)` GraphQL mutation backed by `RealtimeMintSnapshotRegistry.Instance` (`BaseSingleton`) + `MJAIAgentRunStepEntity.InputData` (`createCoAgentRunStep`), keeping `relayTicketId` only in memory and always creating the step row even when `promptID` is `null`. | Avoids trusting owner-editable `AIAgentSession.Config_`, never leaks live `relayTicketId` bearer tokens into user-visible `InputData`, survives Caliber's `persistObservabilityRunIds` `Config_` overwrite, preserves Caliber's custom persona prompt and whiteboard tools, and works across multi-replica deployments. |
| `2026-11-07` | Use native continuation (`UseNativeResumption: true`) for xAI (`?conversation_id=<id>` + `resumption.enabled: true`), Vertex AI (`v1`), and server-side Gemini (`v1beta`), and use `RealtimeConversationMemory` history seeding (`UseNativeResumption: false`) for OpenAI Realtime and client-direct Gemini Developer API (`v1alpha`, preserving `sessionResumption: {}` without `handle` for the `v1alpha` constraint mask). | Directly verified by Live Probes 1B, 2, 3A, 3B, 3C, and 3D on `2026-11-07`. |
| `2026-11-07` | Clamp xAI `POST /v1/realtime/client_secrets` `expires_after.seconds` to `<= 3600` even when `MaxSessionSeconds` is `7200`. | Live Probe 1A proved xAI rejects `expires_after.seconds: 7200` with HTTP 400 (`"TTL for a client secret cannot exceed 60 minutes"`). |
| `2026-11-07` | Scope AssemblyAI, HuggingFace, and Inworld to compile-safe stubs and focus implementation on Gemini, xAI, and OpenAI (with ElevenLabs secondary). | Explicitly directed by product owner on `2026-11-07`. |

### 11.2 Surprises & Discoveries During Research

1. **xAI Native Session Resumption Exists and Works Across Ephemeral Tokens:**
   - Issue #6460's background table assumed xAI had no native resumption (`"None — inject conversation.item.create"`). Reading `https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech.md#session-resumption` and running Live Probe 1B proved xAI supports `resumption: { enabled: true }` + `?conversation_id=<id>` and that it replays cached turns across two separately minted ephemeral client secrets in `949 ms`.
2. **xAI Client Secret TTL (3,600 s) Is Half of xAI's WebSocket Session Limit (7,200 s):**
   - `xAIRealtime.DriverFacts.ProviderMaxSessionSeconds` is `7200`, but xAI's `POST /v1/realtime/client_secrets` endpoint rejects any `expires_after.seconds > 3600` with HTTP 400.
3. **Why Gemini Native Resumption Works on Server API Keys (`v1beta`) But Fails on Browser Ephemeral Tokens (`v1alpha`):**
   - Live Probes 3A, 3C, and 3D isolated the exact discrepancy: on `v1beta` with a server API key (`BidiGenerateContent`), `sessionResumption: { handle }` restores the conversation (`recalledCobalt: true`), even though Google only emits one handle at `setupComplete`. On `v1alpha` with an ephemeral token (`BidiGenerateContentConstrained`), passing `sessionResumption: { handle }` (on either the same token or a new token) connects cleanly (`setupComplete` in ~234–324 ms) but restores an **empty** session (`recalledAurora: false`, `recalledFalcon: false`).
4. **Caliber Overwrites `AIAgentSession.Config_` After `PrepareClientSession`:**
   - Tracing `bizapps-caliber/packages/Server/src/runtime/launch/client-direct-launcher.ts:413-428` revealed that Caliber calls `PrepareClientSession` and then overwrites `agentSession.Config_` with `{ targetAgentID, coAgentRunID, promptRunID, coAgentRunStepID }`. Persisting the `RealtimeMintSnapshot` in `RealtimeMintSnapshotRegistry.Instance` (`BaseSingleton`) and `MJAIAgentRunStepEntity.InputData` (`createCoAgentRunStep`) inside `PrepareClientSession` prevents Caliber from losing its persona system prompt or whiteboard tools on token refresh.

---

## 12. Independent Adversarial Review Findings & Resolutions

Per Step 7 of Issue #6460, independent adversarial review passes examined `realtime-long-call-reconnects-plan.md`, `realtime-long-call-reconnects-research.md`, and the cited source files in `MJ` and `bizapps-caliber`. Every finding below was verified and incorporated into Sections 4–11 of this plan:

| # | Independent Reviewer Finding (`file:line`) | Impact If Unresolved | Resolution Applied in This Plan |
|---|---|---|---|
| **1** | **Duplicate `RealtimeReconnectReason` export (`TS2308`) & missing `packages/AI/Core/src/index.ts` barrel export** (`realtimeSessionResumption.ts:5`, `packages/AI/Core/src/index.ts:21, 34`) | Compile-time `TS2308` failure in `@memberjunction/ai` and missing export of `RealtimeConversationMemory`. | Unified `RealtimeReconnectReason = 'connection-ending' \| 'connection-lost' \| 'duration-expiry'` in `realtimeSessionResumption.ts:5`, imported it in `baseRealtime.ts`, and added `packages/AI/Core/src/index.ts` to Slice 1 (Section 4.2 & Section 10). |
| **2** | **Wire leak of `connectionMaxSeconds`, `sessionMaxSeconds`, `reconnectBufferSeconds`, and `trustNativeResumption` into provider setup frames** (`openAIRealtime.ts:377-477, 727`, `geminiRealtime.ts:658-681, 802`, `inworldRealtime.ts:877-883`, `baseRealtimeClient.ts:20-32`) | Runtime HTTP 400 (`unknown_parameter`) on OpenAI/xAI/ElevenRealtime and spurious warnings on Gemini/Inworld. | Added mandatory wire-scrubbing at all 4 boundaries: `REALTIME_SHARED_CONFIG_KEYS`, `GeminiRealtime.scrubSharedKeys`, `ExtractRealtimeFeatures`, and `ToProviderSessionConfig` (Section 4.1). |
| **3** | **3-layer precedence bug where seeded `ConnectionMaxSeconds: 600` in `.ai-models.json` shadows `GeminiRealtimeClient`'s `120 s` uncompressed-video limit (or `120 s` shadows a smaller test override)** (`baseRealtimeClient.ts`, `baseRealtime.ts`) | Gemini calls with uncompressed video would use `600 s` instead of `120 s` and get hard-dropped by Google at 2 minutes, or a `45 s` test override would be widened to `120 s`. | Split `RuntimeCallDurationSeconds` from `DefaultCallDurationSeconds` and resolved `CallDurationSeconds = ClampSessionSecondsValue(this.RuntimeCallDurationSeconds, this.configuredCallDurationSeconds) ?? this.DefaultCallDurationSeconds` on both `BaseRealtimeSession` and `BaseRealtimeClient` (Sections 4.2, 4.3, 4.5). |
| **4** | **Server-side per-session mutable state placed on `BaseRealtimeModel` instead of `IRealtimeSession`** (`baseRealtime.ts:214`, `realtime-session-runner.ts:440-454`, `realtime-client-session-service.ts:1254-1264`) | Concurrent server sessions on the same model driver would clobber state, and replacing the `IRealtimeSession` instance would break monkey-patched `session.SendInput`, `session.Close`, and `session.Events()`. | Introduced `BaseRealtimeSession` (implementing `IRealtimeSession`) to hold per-session timers, `conversationMemory`, and in-place socket swap while keeping the outer `IRealtimeSession` reference and `Subject<RealtimeEvent>` stream stable (Section 4.2). |
| **5** | **OpenAI/xAI type & URL mismatches (`OAIProtocolMessageItem` lacks `'assistant'`/`'output_text'`, `OpenAIProtocolServerEvent` lacks `conversation.created`, and `OpenAIRealtime.createConnection` percent-encodes `?conversation_id=` inside `model`)** (`openAIProtocolClient.ts:117-144`, `openAIRealtime.ts:860-862`) | Compile-time errors under strict typing (no `any`) and runtime invalid-model/invalid-role rejections on OpenAI and xAI. | Specified widening `OAIProtocolMessageItem` and `OpenAIProtocolServerEvent`, mapping `'model'` → `'assistant'` / `'output_text'`, and passing `onURL?: (url: URL) => void` into `new OpenAIRealtimeWebSocket({ model, onURL })` (Section 4.5). |
| **6** | **Mid-tool reconnects (`callsFromBeforeReseed`) in `OpenAIProtocolRealtimeClient` omit `requestResultResponse()`, and outbound sends during reconnect are silently dropped by `if (!this.canSendEvents()) return;`** (`openAIProtocolClient.ts:370, 419, 458, 545-553`) | Tool results arriving during the 1–3 s reconnect handshake would be dropped, or the model would remain silent after receiving a pre-reseed tool result. | Added `queuedSends` buffering during `reconnectInFlight` in `OpenAIProtocolRealtimeClient` and invoked `this.requestResultResponse()` after sending a `callsFromBeforeReseed` tool result (Section 4.5 & Section 5). |
| **7** | **`GeminiRealtimeClient` caches stale `EphemeralToken`/`RelayUrl` in `this.connectTarget`, skips `memory.Record` when `TrustNativeResumption` is `true`, and relay sessions fail at 30 min (`REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE = 4000` or `OpenRelaySession` handle rejection on new ticket)** (`geminiRealtimeClient.ts:456-463, 1212-1233`, `realtimeProxyRegistry.ts:352-396`, `RealtimeRelayTunnel.ts:190-195`, `geminiLiveRelayPolicy.ts:379-387`) | Reconnects after `RefreshToken()` would still use the expired token, fallback seeding would have empty memory, and Vertex/relayed calls would die at 30 minutes. | Updated `GeminiRealtimeClient` to refresh `this.connectTarget` from `context.Credential`, made `conversationMemory` always record turns, and added `RealtimeProxyRegistry.Instance.ExtendRelaySession` + `RealtimeRelayTunnel` timer reset (Section 4.4 & Section 4.5). |
| **8** | **Caliber fallback & security flaw if `RefreshRealtimeClientSessionToken` reads `AIAgentSession.Config_` or relies on `AIPromptRun.Messages` for the system prompt** (`realtime-client-session-service.ts:1785-1856`, `RealtimeClientSessionResolver.ts:743, 753, 1866`, `sessionConfigGuard.ts:48`, `client-direct-launcher.ts:58-109, 418-425`) | `AIPromptRun.Messages` never contains the system prompt (losing Caliber's persona prompt and whiteboard tools), and reading unguarded keys from `AIAgentSession.Config_` allows owner tampering. | Captured `RealtimeMintSnapshot` inside `PrepareClientSession` in both `RealtimeMintSnapshotRegistry.Instance` (`BaseSingleton`) and `MJAIAgentRunStepEntity.InputData` (`createCoAgentRunStep`, verified via `SessionRunIDVerifier`), and added `assertCanRunTarget` + `ResolveScopedAnonymousRunUser` to `RefreshRealtimeClientSessionToken` (Section 4.4, Section 6, Section 8). |
| **9** | **WebRTC (`OpenAIRealtimeClient` & `OpenAILiveClient`) reconnect leaves dead `RTCRtpSender` entries in `micSenders`, drops post-reconnect agent audio from browser call recordings, and reuses consumed single-use SDP broker tickets on `OpenAILiveClient`** (`openAIRealtimeClient.ts:62, 132`, `openAILiveClient.ts:58, 137`, `openAILiveRealtime.ts:1232-1239`, `RealtimeSessionRuntime.ts:2597`, `realtime-audio-recorder.ts:144-154`) | `ReplaceMicrophone` fails after reconnect, call recordings go silent for agent audio after Leg 1, and `OpenAILiveClient` reconnects fail with HTTP 401/403. | Added `this.micSenders = []` reset on WebRTC swap, updated `RealtimeAudioRecorder.AttachRemoteStream` (`realtime-audio-recorder.ts`) to swap `remoteSource` when `OnRemoteMediaStream` publishes a new `MediaStream`, and mandated `RequiresFreshTokenPerReconnect = true` on `OpenAILiveClient` (Section 4.3 & Section 4.5). |
| **10** | **`BaseRealtimeClient.OnRemoteMediaStream(handler)` already exists as a registration method (`baseRealtimeClient.ts:599-604`) while `RealtimeAudioRecorder.AttachRemoteStream` (`realtime-audio-recorder.ts:146`) guards `if (this.remoteAttached) return;`** | Adding a duplicate `public OnRemoteMediaStream?: ...` property would fail TypeScript compilation (`TS2300`), and `RealtimeAudioRecorder.AttachRemoteStream` would still ignore Leg 2's remote `MediaStream`. | Kept `BaseRealtimeClient.OnRemoteMediaStream(handler)` as the existing registration method and specified swapping `this.remoteSource` inside `RealtimeAudioRecorder.AttachRemoteStream(stream)` when `stream !== this.remoteStream` (Section 4.3 & Slice 3). |
| **11** | **Persisting `relayTicketId` in `MJ: AI Agent Run Steps.InputData` leaks a live bearer credential into a user-visible observability column, and `createCoAgentRunStep` (`realtime-client-session-service.ts:1833-1835`) returns `null` when `promptID === null`** | Users viewing `MJ: AI Agent Run Steps` in Explorer could read active relay tickets, and sessions without a resolved `promptID` would have no DB snapshot fallback. | Kept `relayTicketId` exclusively in the in-memory `RealtimeMintSnapshotRegistry.Instance` (`BaseSingleton`), omitted it from `PersistedRealtimeMintSnapshot` in `MJAIAgentRunStepEntity.InputData`, and removed the `if (!promptID) return null;` guard in `createCoAgentRunStep` since `TargetID` is nullable (Section 4.4 & Section 6). |
| **12** | **`RealtimeProxyRegistry.relayRefusal` (`realtimeProxyRegistry.ts:533-538`) rejects handle-less reconnects (`intent.ResumeHandle === null`) with `'fresh-used'` when `entry.FreshOpened === true`** | Relayed sessions with `UseNativeResumption === false` or Attempt-2 fallback (`ResumptionHandle = null`) would be refused by the MJAPI relay with `'fresh-used'`. | Specified that `RealtimeProxyRegistry.ExtendRelaySession` re-arms `entry.FreshOpened = false` and `entry.OpenByMs = now + openWithinSeconds * 1000` while preserving `entry.Handles` (Section 4.4). |
| **13** | **`BaseRealtimeClient.Connect` is `abstract` (`baseRealtimeClient.ts:339`) and only OpenAI-family drivers call `ToProviderSessionConfig`** | Non-OpenAI drivers (`GeminiRealtimeClient`, `ElevenLabsRealtimeClient`) would not extract `ConnectionMaxSeconds` / `ReconnectBufferSeconds` / `TrustNativeResumption` unless a concrete lifecycle seam exists. | Added concrete `ApplySessionConfigTiming(config)` on `BaseRealtimeClient` (called by `RealtimeSessionRuntime.connectClient` and driver `Connect()` methods) and automatic timer arming inside `BaseRealtimeClient.setState('listening')` (Section 4.3). |
| **14** | **`GeminiRealtime.BuildConstraintConfig` (`geminiRealtime.ts:561-563`) locks `sessionResumption: {}` into the `v1alpha` ephemeral token's `liveConnectConstraints` field mask** | Omitting the `sessionResumption` property completely when `UseNativeResumption === false` can violate the `v1alpha` ephemeral token constraint mask. | Specified that `GeminiRealtimeClient` always sends `sessionResumption: {}` (with `handle` omitted/`undefined`) when `UseNativeResumption === false`, then seeds `ConversationSeed` after `setupComplete` (Section 4.5). |
| **15** | **`RealtimeAudioRecorder` Web Audio graph routes `sources -> this.captureNode() (workletNode \| scriptNode) -> this.destination` (`realtime-audio-recorder.ts:328-336, 427-435`)** | Connecting a replacement `remoteSource` directly to `this.destination` instead of `this.captureNode()` (`this.connectStream(audioContext, stream)`) would bypass PCM capture (`captureFrame`) and record silence for Leg 2+ agent audio. | Specified calling `this.connectStream(audioContext, stream)` inside `connectRemoteStream` (connecting to `this.captureNode()`), disconnecting any previous `this.remoteSource`, and resetting `this.remoteSource = null; this.remoteStream = null;` in `releaseGraph()` (Section 4.3 & Slice 3). |
| **16** | **`RealtimeSdpBrokerHandler` (`RealtimeSdpBrokerHandler.ts:90`) intentionally uses server-minted `entry.SessionConfig` and ignores browser `req.body.session`, and WebRTC `attachRemoteAudio` (`openAIRealtimeClient.ts:259-269`, `openAILiveClient.ts:451-461`) appends a new `<audio>` element per call** | `OpenAILiveClient` history seed passed only in `req.body.session` would be ignored by the SDP broker, and reconnecting WebRTC calls would leak hidden `<audio>` elements in `document.body`. | Specified injecting `context.ConversationSeed.ContextNote` on `OpenAILiveClient`'s new `'oai-events'` data channel via `this.SendContextNote(context.ConversationSeed.ContextNote)` (`session.thinking.append`) upon `channel.onopen` before flushing `outboundQueue`, and reusing `this.remoteAudioEl` across WebRTC reconnects (Section 4.5 & Slice 5). |
| **17** | **`RealtimeRelayTunnel.openFromFirstFrame` (`RealtimeRelayTunnel.ts:190-195`) schedules a one-shot `this.lifetimeTimer` from `grant.ExpiresAtMs - openedAtMs` at connection open** | Updating `entry.ExpiresAtMs` in `RealtimeProxyRegistry.ExtendRelaySession` without notifying an already-open `RealtimeRelayTunnel` would still fire the original 30-minute `lifetimeTimer` (`4000` `time-limit`) if the current socket stayed open across the 30-minute mark. | Added `OnExpiresAtExtended?: (listener: (newExpiresAtMs: number) => void) => () => void` to `RealtimeRelayGrant` (backed by a listener `Set` on `RelaySessionRecord`) so `RealtimeRelayTunnel` reschedules `this.lifetimeTimer` whenever `ExtendRelaySession` is called (Section 4.4 & Slice 2). |
| **18** | **`RealtimeSessionRunner.attemptTransportReconnect` (`realtime-session-runner.ts:517-558`) recreates the server session from `this.config.SystemPrompt` without `InitialContext` if a fatal error escapes `BaseRealtimeSession`** | If a server-bridged session exhausted in-place reconnects or hit a fatal transport error that triggered `attemptTransportReconnect`, the recreated session would start without prior conversation turns. | Updated `RealtimeSessionRunner` to record finalized transcript turns in a runner-level `RealtimeConversationMemory` and pass `InitialContext: this.conversationMemory.Seed()?.ContextNote` in `attemptTransportReconnect` (Section 4.5 & Slice 2). |
| **19** | **`ClampSessionSecondsValue` (`baseRealtime.ts:167`) parameter type is `ReadonlyArray<number \| undefined>` rather than `ReadonlyArray<number \| null \| undefined>`** | Passing nullable JSON configuration properties (`ConnectionMaxSeconds?: number \| null`) directly to `ClampSessionSecondsValue` would fail TypeScript strict null checks without `?? undefined`. | Widened `ClampSessionSecondsValue` and `BaseRealtimeModel.ClampSessionSeconds` in `baseRealtime.ts:167, 190` to `ReadonlyArray<number \| null \| undefined>` (Section 10, Slice 1). |
