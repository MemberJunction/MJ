# GPT-Live-1 — a second realtime protocol, and the architecture changes it forces

**Status:** proposed, not started. Companion: [`plans/ai-model-identity.md`](../ai-model-identity.md)
(personas + modalities), which this plan depends on for voice selection but does not block.

**Source of truth for the protocol facts below:** `openai@7.15.0`, `src/resources/live/**`
(2,296 lines of types generated from OpenAI's OpenAPI spec). The Live API landed in
`openai-node` **7.14.0 on 2026-09-10** (`CHANGELOG.md`: *"feat(api): Add Live API"*). Model id
is **`gpt-live-1`**. Pricing is **$0.05/min, billed per second**, covering the voice layer only;
delegated reasoning bills separately.

> **Open items that need the published docs** (`developers.openai.com/api/docs/guides/live` and the
> `live-prompting` guide). Each is flagged inline as ⛳:
> inbound-SIP notification mechanism · barge-in semantics · whether `RegisterTools` has any wire
> meaning under client delegation · rate limits and concurrency.

---

## 1. Why this is a new driver, not a profile

`OpenAIRealtimeProfile` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:155`) exists so
OpenAI-*protocol*-compatible providers (xAI, HuggingFace) can reuse one wire implementation. Live is
not protocol-compatible. **Zero event names overlap.**

| | Realtime (shipped) | Live (new) |
|---|---|---|
| WS endpoint | `POST /v1/realtime/calls` (SDP) | `wss://api.openai.com/v1/live/sessions` |
| WebRTC | ephemeral secret → browser POSTs SDP | `POST /live/sessions` `{session, transport:{sdp,type:'webrtc'}}` |
| Control plane | same channel | **sideband** WS at `/live/sessions/{id}/attach` |
| Auth | ephemeral client secret (`ek_…`) | `Authorization: Bearer <apiKey>`; **no client-secret mint exists** |
| Model selection | encoded in the minted secret | in the first `session.start` event |
| Session shape | `type:'realtime'`, nested `audio.input/output` | `SessionConfig` on `session.start` |
| Tools | `session.tools` | **only** `delegation.responses.tools` |
| Turn detection | `server_vad` / `semantic_vad` + thresholds | **none — the model owns turn-taking** |
| Transcription | opt-in, needs a model | **free, both directions, timestamped** |
| Usage | tokens on `response.done` | `{seconds}` + `context_window.usage_ratio` |
| Telephony | via our bridges | **native SIP** (`accept`/`reject`/`hangup`/`refer`, `transport.*`) |
| Audio formats | PCM16 only | `audio/pcm` 16k/24k, **`audio/pcmu`, `audio/pcma`** |

**Client events:** `session.start` · `session.update` · `session.input_audio.append` ·
`session.input_audio.{mute,unmute}` · `session.instructions.append` · `session.thinking.append` ·
`session.commentary.append` · `response.item.create` · `response.create` · `session.close`

**Server events:** `session.started` · `session.updated` · `session.input_audio.append` ·
`session.output_audio.delta` · `session.input_transcript.delta` · `session.output_transcript.delta` ·
`session.delegation.created` · `response.event` · `session.usage.updated` · `session.closed` ·
`error` · `info` · `transport.{dtmf.received,dtmf.send,ringing,answered,failed}` · `*.appended` echoes

There is **no interrupt, cancel, or buffer-clear client event.** Barge-in is internal to the model.

---

## 2. The reasoning plane — make dual delegation first-class

Live's architecture is two-model: `gpt-live-1` runs the conversation and *delegates* reasoning.

```
delegation omitted | null | {type:'client'}   → your application handles it   (OpenAI's default)
delegation: {type:'responses', responses:{…}} → the API manages a Responses backend
```

**This axis already exists in our fleet and is badly modelled.** `AIModelVendor.APIName` currently
does three different jobs across Realtime rows:

| Model | `APIName` | What it actually is |
|---|---|---|
| GPT Realtime 2.1 | `gpt-realtime-2.1` | a wire model id — the intended meaning |
| **Inworld Realtime** | `anthropic/claude-sonnet-4-6` | **a backend reasoning-model selector** |
| **ElevenLabs Agents** | `MJ Realtime Co-Agent` | **an agent hosted on the vendor's servers** |

Inworld's own driver doc says it: *"Inworld brokers hundreds of LLMs; the reasoning model is selected
via `modelId`."* ElevenLabs' driver visibly fights to keep authority local, enabling per-session
overrides for `agent.prompt.prompt`, `prompt.llm`, `tts.voice_id` and `first_message`.

### 2.1 The model

Add to `packages/AI/Core/src/generic/modelConfiguration.ts`, mirrored **in lockstep** into
`metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`, then CodeGen:

```ts
export type RealtimeReasoningPlane = 'local' | 'remote';

export interface RealtimeRemoteReasoning {
    /** What the remote reference denotes. `model` = Live/Inworld; `hostedAgent` = ElevenLabs. */
    Kind?: 'model' | 'hostedAgent';
    /** The reference itself: 'gpt-5.1' | 'anthropic/claude-sonnet-4-6' | 'MJ Realtime Co-Agent'. */
    Ref?: string;
    Effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    MaxOutputTokens?: number;
}

export interface RealtimeReasoningSettings {
    /** Absent = 'local'. */
    Plane?: RealtimeReasoningPlane;
    Remote?: RealtimeRemoteReasoning;
}

export interface RealtimeModelConfigurationSection {
    TurnDetection?: RealtimeTurnDetectionSettings;   // existing
    Reasoning?: RealtimeReasoningSettings;           // NEW
}
```

This rides the existing `ModelConfiguration` cascade (model type < model < model vendor) and then the
agent/app cascade (`realtime.reasoning.*` in `AIAgent.TypeConfiguration`), exactly as `voice` and
`turnDetection` already do. It respects the documented boundary rule — *"anything a driver consumes
at session time belongs in the bag; do not add a new capability column per knob."*

Capability declaration, back-compatible because absent means today's behaviour:

```ts
export interface RealtimeSessionCapabilities {
    CanReconfigureTurnMode: boolean;                             // existing
    SupportedReasoningPlanes?: readonly RealtimeReasoningPlane[]; // absent ⇒ ['local']
}
```

**Default is `local`.** It preserves MJ's agent loop, Actions, prompt runs and observability, and it
is also OpenAI's own default (*"Omitted or null selects your application"*).

### 2.2 Two consequences to handle explicitly, not discover later

- **`remote` is an observability hole.** When the provider runs the reasoning we get no
  `AIPromptRun` / `AIAgentRun` — only opaque `response.event` passthrough — and the tokens bill on
  the provider's side, separate from our per-minute meter. **The `remote` plane must write a marker
  run** recording the delegation (model ref, plane, delegation id) so the trail does not simply stop.
- **Tool execution gains three owners:** MJ's agent (local plane); MJ-executed but remote-model-decided
  (remote plane + function tools, arriving inside `response.event`); and provider-executed (remote
  plane + `web_search` / `mcp` tools). Name all three in config rather than inferring.
  ⛳ Under client delegation `ClientDelegation` is literally `{type:'client'}` with **no tools field**,
  so how the live model decides *when* to delegate appears to be prompt-driven. Confirm before
  deciding what `RegisterTools` means on this driver.

### 2.3 `APIName` cleanup (breaking, approved)

`APIName` returns to meaning exactly one thing: **the wire identifier for this model on this vendor.**
Overloaded values move into `Reasoning.Remote.Ref` with the right `Kind`:

| Row | Before | After |
|---|---|---|
| Inworld Realtime | `APIName: 'anthropic/claude-sonnet-4-6'` | `APIName:` the realtime service id (or null); `Reasoning: {Plane:'remote', Remote:{Kind:'model', Ref:'anthropic/claude-sonnet-4-6'}}` |
| ElevenLabs Agents | `APIName: 'MJ Realtime Co-Agent'` | `APIName: null`; `Reasoning: {Plane:'remote', Remote:{Kind:'hostedAgent', Ref:'MJ Realtime Co-Agent'}}` |
| GPT Realtime 2.x, Grok, Gemini | unchanged | unchanged |

Both drivers must read the new field instead of `params.Model`. This is a **breaking metadata +
driver change**, accepted deliberately so the field stops carrying three meanings.

---

## 3. Interface evolution on `IRealtimeSession`

All additions optional; absent preserves today's behaviour exactly.

| Change | Why | Shape |
|---|---|---|
| **Audio format gains a codec** | Today it is rate-only (`InputSampleRate`/`OutputSampleRate`). Live's `audio/pcmu` and `audio/pcma` break that assumption | `InputFormat?/OutputFormat?: { Codec: 'pcm16'\|'g711_ulaw'\|'g711_alaw'; SampleRate: number }`. Keep the two rate fields as derived getters |
| **Interruption becomes advisory** | Live emits no interruption signal; bridges must adapt rather than silently misbehave | `EmitsInterruptionSignal?: boolean` on `RealtimeSessionCapabilities` |
| **Usage gains a basis** | Live reports `{seconds}`, not tokens | `UsageBasis?: 'tokens' \| 'seconds'`. `ModelUsage.ForMedia('Seconds', n)` already exists (used by TTS/transcription) — this is a branch in `RealtimeUsage`, not new machinery |
| **Transcription is declarable** | Live provides both directions free; Realtime needs a configured model | `ProvidesInputTranscription?` / `ProvidesOutputTranscription?` |

We also gain an **A-law codec gap**: `packages/AI/RealtimeBridge/Base/src/audio/g711.ts` implements
μ-law only (`muLawToPcm16` / `pcm16ToMuLaw`). `audio/pcma` needs the A-law pair.

---

## 4. The driver

New `@RegisterClass(BaseRealtimeModel, 'OpenAILiveRealtime')` plus
`OpenAILiveSession implements IRealtimeSession`, in `packages/AI/Providers/OpenAI/src/models/`.

**Do not bump the OpenAI SDK.** `openai` is pinned **exactly `6.18.0`** in six packages
(`Providers/{OpenAI,xAI,HuggingFace,Fireworks,Inception}`, `Vectors/Core`) and Live needs ≥ 7.14.0.
`rawRealtimeWebSocketConnection.ts` already drives a bare platform `WebSocket` and
`openAIProtocolClient.ts` already declares its own wire interfaces rather than importing SDK types —
so declare the Live wire types locally and build on a raw socket. **Zero SDK churn.**

Mapping to `IRealtimeSession`:

| Member | Live mechanism | Note |
|---|---|---|
| `SendInput` | `session.input_audio.append` `{audio: b64}` | rename |
| `OnOutput` | `session.output_audio.delta` `{delta, start_ms, end_ms}` | rename; free timing |
| `OnTranscript` | `session.{input,output}_transcript.delta` | **better** — timestamped, no model to configure |
| `SendToolResult` | `response.item.create` + `response.create` | rename |
| `SendContextNote` | `session.instructions.append` (≤500 tok) | **better** than our system-role item hack |
| `RequestSpokenUpdate` | `session.commentary.append` (≤500 tok, speakable) | **better** — purpose-built |
| `OnError` / `OnClose` | `error`, `info`; `session.closed{reason,usage}` | richer (`remote_hangup`, `expired`, …) |
| `Close` | `session.close` | |
| `Capabilities.CanReconfigureTurnMode` | no turn config exists → `false` | `ModelConfiguration.Realtime.TurnDetection` is inert for this model |
| `Reconfigure` | `SessionUpdateConfig` accepts **only `delegation`** — voice and format are immutable after start | narrowed |
| `OnToolCall` | Responses-API events inside `response.event`, after `session.delegation.created{target}` | **largest single piece of new work** |
| `OnInterruption` | no signal | declare `EmitsInterruptionSignal: false` |

**Metadata** (per the GPT Realtime 2.1 pattern in `metadata/ai-models/.ai-models.json`): one
`MJ: AI Models` row with `AIModelTypeID: "@lookup:MJ: AI Model Types.Name=Realtime"`; two
`MJ: AI Model Vendors` rows — `Model Developer` at `Priority: 0`, `Inference Provider` at
`Priority: 1` with `DriverClass: "OpenAILiveRealtime"` and `APIName: "gpt-live-1"`; one
`MJ: AI Model Costs` row on **`Per Minute`** (`847D106C-19EB-4034-92BC-15B158C3CB12`, UsageType
`Seconds`) at `0.05`, `ProcessingType: "Realtime"` — `Grok Voice Think Fast 2.0` is the precedent.
`primaryKey` UUIDs from CLI `uuidgen`; **no `sync` blocks**. Changeset: `minor` (touches `metadata/`).

Deployment needs **`AI_VENDOR_API_KEY__OpenAILiveRealtime`** — driver-class-keyed, not `OpenAILLM`.

---

## 5. Browser topology — a security improvement, not a gap

An earlier read of this called the missing ephemeral-secret mint a gap. It is not. In Live's WebRTC
topology **the browser holds no OpenAI credential at all**: MJAPI performs the SDP exchange
(`POST /live/sessions`) and media rides DTLS/SRTP. The data channel is then governed by
`ClientConfig.data_channel.allowed_client_events` / `allowed_server_events`, documented as
*"Startup-only capabilities for an **untrusted frontend**… **Trusted sideband connections are
unaffected**."* We hold a trusted sideband WS with full control; the browser gets an allowlisted
event set.

That is **strictly better than what we ship today**, where the browser holds an ephemeral token
granting full session control. `ClientRealtimeSessionConfig.EphemeralToken` can carry a one-time
MJAPI broker ticket — the same "credential IS the URL" precedent HuggingFace already uses — so the
contract needs no change.

*Sequencing note:* server-bridged first. The browser path is Phase 5.

---

## 6. `OpenAISipBridge` — a detached media plane

OpenAI can terminate the SIP leg itself. MJ attaches a sideband WS and holds **no audio bytes**.
Ship as a **sibling provider**, not a replacement — Twilio/Vonage/RingCentral keep working untouched.

**Only 2 of 12 `BaseRealtimeBridge` members assume MJ is in the media path**: `SendMedia` and
`OnMedia` (both `abstract`). The other ten are already capability-gated virtuals or safe no-ops.

| Change | Cost |
|---|---|
| `DetachedMediaPlane?: boolean` in `IBridgeProviderFeatures` | **Zero migration** — the interface's own doc: *"Holding these as JSON… lets new platform features be added without a schema migration"* |
| Satisfy `SendMedia`/`OnMedia` | New intermediate base `BaseDetachedMediaBridge`, following the `BaseTelephonyBridge` precedent → **zero edits to `base-realtime-bridge.ts`** |
| `wireTransportSeam` (`ai-bridge-engine.ts:971`) | **One flag-keyed branch** skipping 3 of 4 blocks: the `Bridge.OnMedia` registration (976-991), `RealtimeSession.OnOutput` (994-1001), `OnVideoOutput` (1006-1009). **Keep `OnInterruption` (1015-1027)** — `FlushOutboundMedia` self-no-ops and the `clearRoomModeratorState` / `releaseRoomFloor` work is transport-independent |
| `BaseTelephonyBridge.Connect:347-348` | `RequireFeature('AudioIn'/'AudioOut')` becomes conditional — those flags are *defined* as "MJ carries the bytes" |
| `BridgeType` | `'Telephony'` already in the value list. No CHECK-constraint change |
| Inbound routing | RingCentral's two-phase SIP INVITE shape maps 1:1 — reject in the coordinator, accept in `Connect`. `INBOUND_CALL_ID_CONFIG_KEY` carries the OpenAI session id unchanged |
| New ingress | An OpenAI event receiver mounted like `TwilioTelephonyRouter` — **before** auth middleware, signature-gated as `X-Twilio-Signature` is. Sideband WS registers via `RegisterMediaUpgradeRoute` (`{noServer:true}`) ⛳ |
| Metadata | A 12th row in `metadata/ai-bridge-providers/.ai-bridge-providers.json`: `DriverClass:'OpenAISipBridge'`, `BridgeType:'Telephony'`, features `{InboundRouting, OutboundDial, DTMF, CallTransfer, Recording, DetachedMediaPlane}` |

### 6.1 It structurally eliminates the barge-in problem

The stale-audio-on-barge-in bug exists only because MJ holds bytes the model stopped producing.
Today that is three separate buffers:

- **Vonage** — `outboundBuffer` + `partial` + the carrier's **~60 s** server-side playback queue
- **RingCentral** — a 20 ms self-paced RTP queue held in MJ process memory
- **Twilio** — **no flush wired at all.** `FlushOutboundMedia()` resolves to `undefined` → silent
  no-op; Twilio's own media-stream `clear` command is never sent. *(Pre-existing bug — fix it
  regardless, §7.)*

With media detached, MJ holds zero bytes and interruption happens inside OpenAI between its VAD and
its SIP egress. The base class's existing no-op default stops being merely *safe* and becomes
*correct*.

---

## 7. Bugs to fix alongside — two are pre-existing and this work activates them

**P0-1 — the idle sweep will reap live calls.** `LastActivityMs` is bumped in exactly one place:
`wireTurnTaking`'s `OnTranscript` handler (`ai-bridge-engine.ts:1262`). `SweepStaleSessions` filters
`nowMs - s.LastActivityMs > this.idleTtlMs`. A detached session that does not surface transcripts
through `IRealtimeSession.OnTranscript` gets killed at the idle TTL. Easy to satisfy — Live gives us
transcripts free — but it is the highest-risk silent failure in the port. **Also add a second
liveness source** so the invariant does not depend on one event type.

**P0-2 — identity lookup is missing a `ProviderID` predicate (pre-existing).**
`TwilioTelephonyService.ts:238`, `VonageTelephonyService.ts:236` and
`RingCentralTelephonyService.ts:319` all filter
`IdentityType='PhoneNumber' AND IdentityValue=… AND IsActive=1` with **no provider constraint** —
despite `MJ: AI Bridge Agent Identities.IdentityValue` being documented *"Unique per provider."*
Latent today because each vendor only sees DIDs it owns; **live the moment a number could be served
by either a Twilio trunk or an OpenAI SIP endpoint.** Add `AND ProviderID='<id>'` in **all three**,
not just the new one.

While in those three lines: each hand-rolls `.replace(/'/g, "''")` for SQL escaping.
`EscapeSQLString` exists in `@memberjunction/global` (`packages/MJGlobal/src/util.ts:1661`) and
handles null-byte stripping the hand-rolled version misses. Swap them.

**P0-3 — `OnCallEnded` is registered by nobody (pre-existing).**
`BaseTelephonyBridge.OnCallEnded:541` has no caller; `handleCallEnded:598-601` fires a
`participantHandler` that `wireParticipantTracking` never registered for telephony (it early-returns
for every non-diarizing provider, which is all three). A caller hanging up is reconciled only by the
stale sweep — **for every telephony provider today.** Either register `OnCallEnded` from the engine
or route hangup events straight to `StopBridgeSession`. OpenAI's `transport.failed` / hangup would
land in the same dead end otherwise.

**P1 — Twilio `flushOutbound` is unimplemented** (see §6.1). Wire Twilio's media-stream `clear`.

**Known-and-accepted:** `SendDTMF`, `OnDTMF`, `TransferCall` and `StartRecording` have **no
production caller anywhere in MJ** — built, unit-tested, metadata-declared, invoked by no Action,
agent tool or resolver. OpenAI's `transport.dtmf.*` / `refer` / `store` substitute cleanly at the
driver seam (and `store` would be our first working `StartRecording`), but **exposing them to an
agent is net-new work**, orthogonal to this plan. Do not sell them as capabilities we "get".

---

## 8. Phasing

| Phase | Work | Gate |
|---|---|---|
| **P0** | The three bridge fixes in §7 + Twilio flush. Independent of Live; ship first | regression on existing telephony |
| **P1** | Reasoning-plane interfaces + `ModelConfiguration.Realtime.Reasoning` + CodeGen | builds clean, cascade unit tests |
| **P2** | `OpenAILiveRealtime` driver on a raw socket, local plane only | loopback + a real `gpt-live-1` call |
| **P3** | Metadata rows + per-minute cost + `AI_VENDOR_API_KEY__OpenAILiveRealtime` | `mj sync validate`; Integration Tier |
| **P4** | Remote plane: `delegation:'responses'`, `response.event` parsing, marker runs | both planes on one agent |
| **P5** | `APIName` cleanup — Inworld + ElevenLabs migrate to `Reasoning.Remote.Ref` | **breaking**; both drivers re-tested |
| **P6** | `OpenAISipBridge` + `BaseDetachedMediaBridge` + `DetachedMediaPlane` flag | inbound + outbound call, hangup, DTMF |
| **P7** | Browser WebRTC: SDP broker + `OpenAILiveClient` + data-channel allowlists | |
| **P8** | `audio/pcmu` passthrough in telephony adapters; A-law codec | latency measured vs today |

P0 and P1 are independently valuable and should not wait on the docs. P2 onward benefit from the ⛳
answers.
