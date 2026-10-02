# GPT-Live-1 — a second realtime protocol, and the architecture changes it forces

**Status:** partially implemented — see §8. Companion: [`plans/ai-model-identity.md`](../ai-model-identity.md)
(personas + modalities), which this plan depends on for voice selection but does not block.

**Revision 2** (2026-09-11) — verified against OpenAI's twelve published GPT-Live guides. Revision 1
was written from the `openai@7.15.0` SDK types alone and got several things wrong; each correction
is marked **[R2]** inline, and §9 lists them. Where SDK types and published guides disagree, the
guides win and the disagreement is called out rather than silently resolved.

**Sources.** Wire shapes: `openai@7.15.0`, `src/resources/live/**` (types generated from OpenAI's
OpenAPI spec; Live landed in `openai-node` **7.14.0 on 2026-09-10**). Behaviour and constraints: the
published guides — Getting started, Delegation and tools, Managing sessions, WebSockets, WebRTC,
Server-side controls, Telephony and SIP, Migrate, Prompting, Cost optimization, Partner integrations,
and the `gpt-live-1` model page.

Model id **`gpt-live-1`**. **$0.05/min, billed per second, not rounded up** — cite the *model page*
for this; the cost guide calls its own figure "illustrative". Backend reasoning bills separately.
**Rate limits are measured in concurrent sessions**, not tokens: Free unsupported, Tier 1 = 25,
Tier 2 = 50, Tier 3 = 200, Tier 4 = 300, Tier 5 = 500. **Modalities: Text and Audio, in and out.
Image and Video unsupported.**

> **Open items status** ⛳:
>
> *Settled by implementation:*
> - **Live WebSocket handshake headers**: The driver sends `Authorization: Bearer <key>` only (verified against `openai@7.15.0 src/resources/live/ws.ts`). Live does **not** use the classic Realtime `OpenAI-Beta: realtime=v1` header; bearer auth on the connection URL path (`/v1/live/sessions`) is sufficient.
>
> *Still open / pending live validation:*
> - **`audio.output.voice` settability on WebRTC path**: We bind voice into the broker payload to `POST /v1/live/sessions`; unverified against a live session whether the provider honours or ignores it on WebRTC (published WebRTC samples omit voice).
> - **`transport.ringing`/`answered`/`failed`**: SDK types declare them, but they have zero coverage across all twelve published guides; unverified against live inbound SIP traffic.
> - **WebSocket keepalive, reconnection and close codes**: The driver tracks lifecycle via `_closed` state guards and clean `session.close` dispatch; wire ping/pong heartbeat handling is unverified and not currently implemented.

---

## 1. Why this is a new driver, not a profile

`OpenAIRealtimeProfile` (`packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts:155`) exists so
OpenAI-*protocol*-compatible providers (xAI, HuggingFace) can reuse one wire implementation. Live is
not protocol-compatible — OpenAI says so itself: *"A Realtime integration is not automatically
compatible with GPT-Live."*

**[R2] Two event names overlap, and that is more dangerous than none.** Revision 1 claimed zero
overlap. `response.create` and `session.update` exist in *both* protocols with *different meaning*.
In Realtime, `response.create` is the "speak now" trigger; in Live it *"starts or continues delegated
backend work… **It does not grant permission for the voice model to speak.**"* Anyone porting code by
find-and-replace will produce something that compiles, connects, and misbehaves.

| | Realtime (shipped) | Live (new) |
|---|---|---|
| WS endpoint | `wss://api.openai.com/v1/realtime?model=…` | `wss://api.openai.com/v1/live/sessions`, **no query params** |
| WebRTC | ephemeral secret → browser POSTs SDP | `POST /v1/live/sessions` `{session, transport:{sdp,type:'webrtc'}}` → **201** |
| Control plane | same channel | same channel; **sideband** (`/v1/live/sessions/{id}/attach`) only when a *second* observer is needed **[R2]** |
| Auth | ephemeral client secret (`ek_…`) | `Authorization: Bearer <apiKey>`; **no client-secret mint exists** |
| Model selection | encoded in the minted secret | in the first `session.start` event |
| Tools | `session.tools` | **only** `delegation.responses.tools`; **nothing at all under client delegation [R2]** |
| Turn detection | `server_vad` / `semantic_vad` + thresholds | **none — the model owns turn-taking** |
| Transcription | opt-in, needs a model | both directions, timestamped, **no model to configure [R2]** |
| Usage | tokens on `response.done` | `{seconds}` **snapshot** + `context_window.usage_ratio` |
| Telephony | via our bridges | **native SIP, inbound only [R2]** |
| Audio formats | PCM16 only | `audio/pcm` 24k (default) / 16k, `audio/pcmu` 8k, `audio/pcma` 8k |

**[R2] "Transcription is free" is unsupported.** Both directions and timestamps are confirmed; the
word *free* appears nowhere, and the cost guide's Live accounting has exactly two components (voice
seconds, backend). Say **"no separate transcription model to configure or bill"** and stop there.

**Client events:** `session.start` · `session.update` · `session.input_audio.append` ·
`session.input_audio.{mute,unmute}` · `session.instructions.append` · `session.thinking.append` ·
`session.commentary.append` · `response.item.create` · `response.create` · `session.close`

**Server events:** `session.started` · `session.updated` · `session.output_audio.delta` ·
`session.input_transcript.delta` · `session.output_transcript.delta` ·
`session.delegation.created` · `response.event` · `session.usage.updated` · `session.closed` ·
`error` · `info` · `session.input_audio.append` (reflected) · `transport.dtmf.{received,send}` ·
`*.appended` acknowledgements

**[R2] Three absences, not one.** Revision 1 recorded only "no interrupt event". There are three, and
the second is the more consequential:

1. **No interrupt / cancel / buffer-clear client event.** Barge-in is model-owned.
2. **No response-terminal event at all.** *"GPT-Live has no corresponding event marking the end of
   each spoken response. Track playback in your client."* Anything keyed on Realtime's `response.done`
   — turn accounting, "assistant finished speaking", post-turn hooks — has **no Live source**.
3. **No cancellation mechanism.** See §2.3.

**[R2] Barge-in is not opaque — it is prompt-steerable.** `Interruption policy:` and
`Backchannel policy:` are named lines in OpenAI's own prompt template, with a warning that
over-constraining one damages the other (*"Do not add a blanket 'never speak while the user is
speaking' rule alongside it. That can also suppress helpful listening sounds."*). Barge-in behaviour
is a **persona/prompt configuration surface we own**, which is why it belongs in the persona model
rather than being written off as provider-internal.

---

## 2. The reasoning plane — make dual delegation first-class

Live is two-model: `gpt-live-1` converses and *delegates* reasoning.

```
delegation omitted | null | {type:'client'}   → your application handles it   (OpenAI's default)
delegation: {type:'responses', responses:{…}} → the API manages a Responses backend
```

**This axis already exists in our fleet and is badly modelled.** `AIModelVendor.APIName` means three
different things across Realtime rows: a wire model id (`gpt-realtime-2.1`), a backend
reasoning-model selector (Inworld: `anthropic/claude-sonnet-4-6`), and a vendor-hosted agent name
(ElevenLabs: `MJ Realtime Co-Agent`).

### 2.1 The model

Add to `packages/AI/Core/src/generic/modelConfiguration.ts`, mirrored **in lockstep** into
`metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`, then CodeGen:

```ts
export type RealtimeReasoningPlane = 'local' | 'remote';

export interface RealtimeRemoteReasoning {
    /** What the remote reference denotes. `model` = Live/Inworld; `hostedAgent` = ElevenLabs. */
    Kind?: 'model' | 'hostedAgent';
    /** 'gpt-5.6-terra' | 'anthropic/claude-sonnet-4-6' | 'MJ Realtime Co-Agent'. */
    Ref?: string;
    Effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    MaxOutputTokens?: number;
}

export interface RealtimeReasoningSettings {
    /** Absent = 'local'. Session-creation-time only — NOT runtime-switchable. */
    Plane?: RealtimeReasoningPlane;
    Remote?: RealtimeRemoteReasoning;
}
```

Capability declaration, back-compatible because absent means today's behaviour:

```ts
export interface RealtimeSessionCapabilities {
    CanReconfigureTurnMode: boolean;                             // existing
    SupportedReasoningPlanes?: readonly RealtimeReasoningPlane[]; // absent ⇒ ['local']
    CanReconfigureDelegationMode?: boolean;                       // [R2] Live: false, always
}
```

**Default is `local`** — it preserves MJ's agent loop, Actions and prompt runs, and it is also
OpenAI's default (*"Omitted or null selects your application"*). **[R2] The mode is fixed at session
creation**; attempting to switch returns a typed `immutable_field_update` error naming
`session.delegation.type`.

### 2.2 `RegisterTools` under client delegation — ⛳ **closed: it has no wire meaning**

*"The Live session does not configure or run those backend tools."* Nothing is declared. The live
model decides when to delegate **purely from prose**, via a fixed-shape block in `session.instructions`
with three mandatory labels:

```
Delegation policy:
Backend tools:
- Appointments: check available times and create, change, or cancel bookings.

Delegate to the backend when:
- The user asks for availability or wants to create, change, or cancel a booking.

Do not delegate to the backend when:
- The user greets you or asks you to repeat a result already provided.

Delegate before giving an answer that depends on backend work.
Do not guess the result while waiting.
```

> *"List only capabilities your backend actually has. **These describe what it can help with; they are
> not instructions for the live model to call a tool.**"*

**So on this driver `RegisterTools` is prompt compilation, not wire registration.** MJ needs a
projection from the Action catalogue to one-line capability bullets. There is no per-tool routing and
no named-function granularity: the model emits one undifferentiated "help me" signal carrying
**metadata only** — *"It does not contain the user's utterance or task text"* — and MJ's agent
reconstructs intent from transcript plus application state.

Two hazards the guides name explicitly: *"A delegation can arrive before a complete sentence appears
in the transcript"*, and *"Before invoking this adapter, **claim the delegation in your application so
duplicate delivery cannot start the same operation twice.**"*

### 2.3 Cancellation is entirely ours — **[R2] new, and nothing in MJ does it today**

There is no cancel event and no cancel API. The guides say so from four directions, e.g.
*"A spoken interruption does not automatically cancel backend work… **Your application must decide
whether to cancel work, change it, or let it finish. Check that cancellation succeeded before saying
it did.**"*

MJ must therefore build: a **task-revision counter independent of `delegation_id`**; supersede-and-
discard for late results; **idempotency keys on consequential Actions** (*"a lost response should not
cause a second booking"*); and a confirm-before-announcing gate. Keep operation IDs and task
revisions **separate from** delegation IDs so reconnects and retries do not repeat an action.

### 2.4 [R2] The observability hole is smaller than Revision 1 claimed

Revision 1 called `response.event` "opaque passthrough". It is structured: *"read the backend
response's usage from nested `response.completed` events delivered through `response.event`. **Count
each backend response once, using its response ID**, and retain the input, output, and cached-token
details."* So the `remote` plane can write a **real `AIPromptRun` with genuine token and cost
figures**, not a bookmark.

What it *cannot* reconstruct: forwarded lifecycle snapshots are deliberately hollowed —
*"their `tools` array is empty, `instructions` is null, and `input` is omitted"*. So we can record
what a delegation **cost**, never what it **ran**. The agent-loop and Actions arguments for
defaulting to `local` stand; the observability argument is weaker than stated.

**[R2] `mcp` is not a documented Live tool type.** The guides list *"function definitions and
`web_search` entries"* and mention MCP nowhere. Drop it from the plan or mark it unverified; do not
design a third tool-execution owner around it.

### 2.5 `APIName` cleanup (breaking, approved)

`APIName` returns to meaning exactly one thing: the wire identifier for this model on this vendor.

| Row | After |
|---|---|
| Inworld | `Reasoning: {Plane:'remote', Remote:{Kind:'model', Ref:'anthropic/claude-sonnet-4-6'}}` |
| ElevenLabs | `APIName: null`; `Reasoning: {Plane:'remote', Remote:{Kind:'hostedAgent', Ref:'MJ Realtime Co-Agent'}}` |
| GPT Realtime 2.x, Grok, Gemini | unchanged |

---

## 3. Interface evolution on `IRealtimeSession`

All additions optional; absent preserves today's behaviour.

| Change | Why | Shape |
|---|---|---|
| **[R2] Audio format is ONE transport-dependent setting** | Live has a single `session.audio.format` governing **both directions**, fixed at startup — not an input/output pair. And WebRTC **forbids** it entirely (SDP negotiates) | `AudioFormat?: { Codec: 'pcm16'\|'g711_ulaw'\|'g711_alaw'; SampleRate: number } \| 'negotiated'`. Keep `InputSampleRate`/`OutputSampleRate` as derived getters |
| **Interruption becomes advisory** | No user-barge-in signal — but **[R2]** moderation cut-offs *do* emit `error` mid-speech | Split, don't use one boolean: `EmitsUserInterruptionSignal?: boolean` (Live: false) and `EmitsProviderCutoffSignal?: boolean` (Live: true) |
| **[R2] Response completion becomes declarable** | Live emits no response-terminal event at all | `EmitsResponseComplete?: boolean` (Live: false) |
| **[R2] Usage gains a basis — and it is not exclusive** | Live reports seconds **and** delegated tokens, from different places | `UsageBases?: readonly ('tokens'\|'seconds')[]`. A `'tokens' \| 'seconds'` enum forces us to drop one |
| **[R2] Seconds usage is a SNAPSHOT** | *"Voice-duration updates are cumulative snapshots; **do not add them together.**"* | The `seconds` branch takes the **last** value. Opposite of every token accumulator in MJ — an easy double-billing bug |
| **Transcription is declarable** | Live provides both directions with no model to configure | `ProvidesInputTranscription?` / `ProvidesOutputTranscription?` |

**A-law is a real gap**: `packages/AI/RealtimeBridge/Base/src/audio/g711.ts` implements μ-law only
(`muLawToPcm16` / `pcm16ToMuLaw`). `audio/pcma` needs the A-law pair — **but see §6.2: the best case
needs no codec at all.**

---

## 4. The driver

New `@RegisterClass(BaseRealtimeModel, 'OpenAILiveRealtime')` plus
`OpenAILiveSession implements IRealtimeSession`, in `packages/AI/Providers/OpenAI/src/models/`.

**Do not bump the OpenAI SDK.** `openai` is pinned exactly `6.18.0` in six packages
(`Providers/{OpenAI,xAI,HuggingFace,Fireworks,Inception}`, `Vectors/Core`); Live needs ≥ 7.14.0.
The wire contract is fully SDK-independent — JSON text frames only, base64 audio, Bearer auth, no
query params, no named subprotocol — so declare the Live wire types locally and build on the existing
raw-socket adapter. **The handshake header set** ⛳ was verified from `openai@7.15.0 src/resources/live/ws.ts`: `Authorization: Bearer <key>` only (no `OpenAI-Beta` header).

### 4.1 Handshake and framing

1. Connect `wss://api.openai.com/v1/live/sessions`, no query params, `Authorization: Bearer …`
2. **`session.start` must be the first message**, carrying model, instructions, `audio.format`,
   `audio.output.voice`, delegation
3. **Wait for `session.started`** before sending audio or commands — it returns the resolved config
   and session id
4. Audio is **base64 inside JSON text frames**. No binary frames anywhere. PCM chunks must contain
   whole 16-bit samples (even byte length); carry an odd trailing byte into the next chunk
5. **Pace at the recorded sample rate.** *"Piping an entire file at once does not simulate a live
   microphone."* **Audio appends are unacknowledged** — no per-chunk backpressure signal exists
6. Errors are in-band `error` events; correlate via `error.client_event_id` against the `event_id`
   you set on each client event

### 4.2 Mapping to `IRealtimeSession` — **[R2] the table now forks by plane**

| Member | Live mechanism | Note |
|---|---|---|
| `SendInput` | `session.input_audio.append` `{audio: b64}` | WS/SIP only — **forbidden on WebRTC** |
| `OnOutput` | `session.output_audio.delta` `{delta}` | **[R2] NO timing fields, NO done event.** Revision 1's "free timing" was wrong — `start_ms`/`end_ms` belong to *transcript* deltas. Track your own playback queue |
| `OnTranscript` | `session.{input,output}_transcript.delta` | Half-open `[start_ms, end_ms)` on the session timeline. **Not** wall-clock, **not** word alignment, **no** turn-completed event, **no** speaker id |
| **`SendToolResult`** | **local plane:** `session.commentary.append` (speakable) or `session.thinking.append` (quiet), each with `delegation_id` · **remote plane:** `response.item.create` (type `function_call_output`, live-verified against OpenAI wire protocol; `conversation.item.create` is explicitly rejected by OpenAI Live) **then** a separate `response.create` | **[R2] Revision 1 gave only the remote form, on the plane we default to.** *"Both commands require Responses delegation."* One `response.create` per **batch**, not per result — coordinated by `RealtimeToolBatchBarrier` (`@memberjunction/ai/generic/realtimeToolBatchBarrier.ts`), shared by both `OpenAILiveRealtime` and `OpenAILiveClient`. |
| `SendContextNote` | **[R2] `session.thinking.append`**, not `instructions.append` | Instructions are *"application-authored behavioral guidance"* and **can interrupt speech in progress**; the guides warn *"do not copy untrusted tool output into it as an instruction."* Retrieved facts belong in `thinking` |
| `RequestSpokenUpdate` | `session.commentary.append` | Same event as a spoken tool result; distinguished only by `delegation_id`. Make that explicit in the interface or the two will be conflated |
| *(new)* steer/redirect | `session.instructions.append` | Deliberately disruptive. Worth its own primitive |
| `OnError` / `OnClose` | `error`, `info`; `session.closed{reason,usage}` | `close_requested \| expired \| content \| remote_hangup \| connection_lost` |
| `Close` | `session.close` | **Register the `session.closed` listener first**, keep the socket open until it arrives. *"A socket close alone does not establish success."* |
| `Capabilities.CanReconfigureTurnMode` | no turn config exists → `false` | `ModelConfiguration.Realtime.TurnDetection` is inert for this model |
| `Reconfigure` | **[R2] inert on the local plane** | Only `delegation.responses.*` is mutable, and only *"within the existing delegation mode."* On client delegation there is nothing it can change |
| `OnToolCall` | remote plane only — Responses events inside `response.event` | **largest single piece of new work**; see 4.3 |

**All three append channels take a plain string ≤500 tokens and require `delegation_id`** — nullable,
but the field must be present. `null` means session-wide context.

**[R2] Acknowledgements are not delivery.** `*.appended` echoes correlate by `client_event_id`, and
*"the acknowledgment waits for estimated context injection, not for speech or playback to finish…
it is not proof that the model has consumed or spoken the result."* If these methods return a promise,
its contract is **accepted**, never **spoken**.

**[R2] `thinking` is not private.** *"Quiet context can still affect what the model says later. It is
not a private place for secrets or hidden reasoning."* Keep credentials out of all three channels.

### 4.3 [R2] Four documented traps in the remote-plane tool loop

Each one silently produces a hung delegation:

1. Read completed calls from nested **`response.output_item.done`** — *"an arguments-done event alone
   is not sufficient to identify the call"* (it lacks `name` and `call_id`)
2. *"Forwarded lifecycle snapshots deliberately contain `response.output: []`, including at
   `response.completed`… **An empty terminal output list does not mean there are no pending function
   calls.**"*
3. *"Appending a function result does not automatically continue the response"* — `response.create` is
   a required separate step, and `response.item.create` has **no success acknowledgment**
4. Three ids to correlate: outer `delegation_id`, the `response_id` on
   `session.delegation.created`, and a third from the nested `response.created`

Start with `parallel_tool_calls: false` — OpenAI's own migration advice.

### 4.4 Metadata

One `MJ: AI Models` row (`AIModelTypeID: "@lookup:MJ: AI Model Types.Name=Realtime"`); two
`MJ: AI Model Vendors` rows — `Model Developer` @ `Priority: 0`, `Inference Provider` @ `Priority: 1`
with `DriverClass: "OpenAILiveRealtime"`, `APIName: "gpt-live-1"`; one `MJ: AI Model Costs` row on
**`Per Minute`** (`847D106C-19EB-4034-92BC-15B158C3CB12`, UsageType `Seconds`) at `0.05`,
`ProcessingType: "Realtime"` — `Grok Voice Think Fast 2.0` is the precedent. CLI `uuidgen` keys, **no
`sync` blocks**. Changeset `minor`.

**[R2] And `MJ: AI Model Modalities` rows.** `gpt-live-1` is **Text and Audio, in and out**; the
`Realtime` model type defaults to Audio→Audio. So Live needs junction rows adding Text input and Text
output — **the first genuine use of the inheritance path Part A of the companion plan repairs.**

Deployment needs **`AI_VENDOR_API_KEY__OpenAILiveRealtime`** (driver-class-keyed, not `OpenAILLM`)
and — for SIP only — a **second secret**, `OPENAI_WEBHOOK_SECRET` (§6.3).

---

## 5. Browser topology

**[R2] Confirmed, and stronger than Revision 1 could claim:** *"Your application server exchanges it
for an answer with `POST /v1/live/sessions`, **using the project API key. Keep the key and session
configuration on your trusted server.**"* The browser POSTs only `{ sdp }` to a first-party route and
never contacts `api.openai.com`. Contrast the legacy Realtime path in the same guide, where the
browser carries `Authorization: Bearer ${EPHEMERAL_KEY}` directly to OpenAI. **Strictly better.**

**[R2] But the allowlist claim was over-stated.** Revision 1 quoted *"untrusted frontend… trusted
sideband connections are unaffected"* as documented. `data_channel`, `ClientConfig`,
`allowed_client_events` and `allowed_server_events` get **zero hits across all twelve guides** — that
quote is an SDK doc-comment. The mechanism exists in the types; the guides describe no allowlist and
say something weaker and partly contrary: *"A sideband does not itself make session events private
from the browser."* Re-attribute it, and do not make it load-bearing in a security argument.

Mechanics: create the `oai-events` data channel **before** `createOffer()`; ICE is **non-trickle**
(wait for `iceGatheringState === 'complete'`); the **HTTP request starts the session — never send
`session.start` on the data channel**; `session.input_audio.append` and `session.output_audio.delta`
are **forbidden** there (media rides the tracks); omit `audio.format` entirely.

**[R2] Creating a WebRTC session pre-bills 15 seconds of voice duration**, credited back once the
session runs. A broker that mints a session at page load rather than at first speech pays 15 s per
abandoned page. ⛳ Whether `audio.output.voice` is honoured on this path remains unverified: the server-side SDP broker binds voice into the payload to `POST /v1/live/sessions`, but provider-side voice selection on WebRTC is absent from published samples.

---

## 6. `OpenAISipBridge` — a detached media plane

OpenAI terminates the SIP leg; MJ attaches a sideband. Ship as a **sibling provider**, not a
replacement. **[R2] Inbound only** — *"Creating an outbound SIP call through `POST /v1/live/sessions`
is **not supported**; use the relevant partner integration for provider-owned outbound calling."*
Outbound stays with Twilio/Vonage/RingCentral.

Only **2 of 12** `BaseRealtimeBridge` members assume MJ is in the media path (`SendMedia`, `OnMedia`,
both `abstract`). The other ten are already capability-gated virtuals or safe no-ops.

| Change | Cost |
|---|---|
| `DetachedMediaPlane?: boolean` in `IBridgeProviderFeatures` | **Zero migration** — JSON by explicit design |
| Satisfy `SendMedia`/`OnMedia` | New `BaseDetachedMediaBridge`, following the `BaseTelephonyBridge` precedent → **zero edits to `base-realtime-bridge.ts`** |
| `wireTransportSeam` (`ai-bridge-engine.ts:971`) | One flag-keyed branch skipping 3 of 4 blocks. **[R2] Load-bearing, not tidy** — see §6.1. Keep the `OnInterruption` block |
| `BaseTelephonyBridge.Connect:347-348` | `RequireFeature('AudioIn'/'AudioOut')` becomes conditional |
| Metadata | 12th row: `DriverClass:'OpenAISipBridge'`, `BridgeType:'Telephony'`, features `{InboundRouting, DTMF, CallTransfer, DetachedMediaPlane}` — **[R2] no `OutboundDial`, no `Recording`** |

### 6.1 [R2] MJ does not *relay* audio — but it does *receive* it

Revision 1 said "MJ holds zero bytes". Wrong: *"A sideband **also receives copies of subsequent input
and output audio** while the primary connection carries the live media… base64-encoded raw mono
PCM16LE at **24 kHz, regardless of the primary transport's audio format**."* There is **no documented
opt-out**.

The architectural claim survives — MJ is not in the media *path*, relays nothing, and the barge-in
reasoning holds. But budget the bandwidth, and note the `wireTransportSeam` skip is now **required**:
without it, reflected deltas get pumped at a bridge with no sink.

### 6.2 Barge-in, and a capability we lose

Detaching removes MJ's outbound buffers — Vonage's `outboundBuffer` plus a **~60 s** carrier queue,
RingCentral's 20 ms RTP queue in MJ process memory, and Twilio's (**which has no flush wired at all**
— `FlushOutboundMedia()` resolves to `undefined`; a pre-existing bug, §7 P1). For **caller-initiated**
barge-in the base class's no-op default becomes not merely safe but *correct*.

**[R2] What we lose: application-initiated audio suppression.** *"A sideband alone does not control
the media path."* With no client and no media relay, MJ cannot stop model speech for a guardrail trip.
The only lever is `session.instructions.append`, which *can* interrupt speech but whose ack *"does not
prove that the assistant stopped speaking"*, and *"corrective instructions cannot retract audio the
user has already heard."* **Accept this explicitly; do not discover it in P6.**

**[R2] G.711 passthrough is confirmed and needs no codec work:** *"A matching G.711 stream can pass
through without conversion to PCM."* This applies to the **server-bridged WebSocket** path, where MJ
sets `audio/pcmu` and forwards carrier bytes untouched — eliminating two companding passes and two
resamples per direction versus today. On Direct SIP, format is SDP-negotiated and MJ never sees it.

### 6.3 [R2] Inbound routing — ⛳ closed

Inbound arrives as a **project webhook**, not a socket event:

- Event **`live.transport.incoming`**, carrying `data.type: "sip"`, `data.session_id`, and
  `data.sip_headers` — explicitly *"untrusted caller metadata, **not authorization**"*
- A deprecated **`live.call.incoming`** alias must be handled concurrently during migration
- **The same call can also fire a Realtime `realtime.call.incoming` webhook** — *"assign one handler
  to the accept/reject decision rather than accepting through both APIs"*
- Signature is **Standard-Webhooks** (`webhook-id` / `webhook-timestamp` / `webhook-signature: v1,…`)
  with a **separate `OPENAI_WEBHOOK_SECRET`**. Since we are not bumping the SDK, MJ implements that
  HMAC verification itself — including timestamp skew and replay defence keyed on `webhook-id`
- `POST /v1/live/sessions/{id}/accept` with a top-level `session` object → **200, empty body**.
  `reject` takes `{status_code}`, integer 300–699. **First decision wins**; a later one returns
  `decision_already_made`. No response deadline is documented
- **Voice, instructions and delegation mode are all chosen at acceptance**, synchronously inside the
  webhook handler, from headers the guides label untrusted — **before any session or sideband exists.**
  Revision 1's "reject in the coordinator, accept in `Connect`" needs re-checking against this: attach
  is documented as strictly *after* acceptance
- `refer` (`{target_uri}`) and `hangup` (no body) both return 200 empty. **A successful hangup is not
  a substitute for `session.closed`** — keep the sideband open to collect final usage
- **[R2] DTMF is receive-only.** *"These are observer notifications, not client commands. **Do not
  send `transport.dtmf.send` to request a tone.**"* `OnDTMF` maps; `SendDTMF` has no equivalent
- Session ids are **opaque — preserve the prefix, use unchanged**

---

## 7. Bugs to fix alongside — two are pre-existing and this work activates them

**P0-1 — the idle sweep will reap live calls.** `LastActivityMs` is bumped in exactly one place:
`wireTurnTaking`'s `OnTranscript` handler (`ai-bridge-engine.ts:1262`). **[R2] And transcripts are
explicitly not a heartbeat:** *"Only intervals containing transcript text produce events… **Do not
infer silence from a missing event.**"* A caller on hold produces none. Revision 1 called this "easy
to satisfy" — it is not. A second liveness source is **required**, not an aside; on SIP, reflected
audio is the natural one.

**P0-2 — identity lookup is missing a `ProviderID` predicate (pre-existing).**
`TwilioTelephonyService.ts:238`, `VonageTelephonyService.ts:236`, `RingCentralTelephonyService.ts:319`
all filter `IdentityType='PhoneNumber' AND IdentityValue=… AND IsActive=1` with no provider
constraint, despite the column being documented *"Unique per provider."* Add `AND ProviderID='<id>'`
in **all three**. While in those lines: each hand-rolls `.replace(/'/g, "''")`; `EscapeSQLString`
exists in `@memberjunction/global` (`packages/MJGlobal/src/util.ts:1661`) and handles null-byte
stripping the hand-rolled version misses. **[R2] This gets sharper on SIP** — the lookup runs inside
the webhook, on data the guides label untrusted, and resolves the entire session config.

**P0-3 — `OnCallEnded` is registered by nobody (pre-existing).**
`BaseTelephonyBridge.OnCallEnded:541` has no caller; `handleCallEnded:598-601` fires a
`participantHandler` that `wireParticipantTracking` never registers for telephony. **[R2] The fix must
not tear the socket down on hangup** — MJ has to keep the sideband alive until `session.closed` to
collect final usage.

**P1 — Twilio `flushOutbound` is unimplemented.** Wire Twilio's media-stream `clear`.

**[R2] P2 — new: idle sessions bill.** *"Active session time includes time when the user speaks, the
assistant speaks, **both are silent, or the backend is working**."* On the local plane an MJ agent run
with Actions can take tens of seconds, billed at full rate. OpenAI's documented technique is to
**close the session during long tasks and resume**, and note *"muting microphone input does not close
the session."* The idle sweep (P0-1) and cost-driven closing must have **one owner**, not two
mechanisms racing.

**Known-and-accepted:** `SendDTMF`, `OnDTMF`, `TransferCall` and `StartRecording` have **no production
caller anywhere in MJ**. `refer` substitutes cleanly for `TransferCall`; `transport.dtmf.*` covers
`OnDTMF` only. **[R2] `store` cannot implement `StartRecording`** — it is startup-only, project-gated,
and treated as false under Zero Data Retention; a `StartRecording` API implies starting mid-call.

---

## 8. Phasing

| Phase | Status | Work | Gate |
|---|---|---|---|
| **P0** | Shipped | The bridge fixes in §7 + Twilio flush. Independent of Live; ship first | regression on existing telephony |
| **P1** | Shipped | Reasoning-plane interfaces + `ModelConfiguration.Realtime.Reasoning` + CodeGen | builds clean, cascade unit tests |
| **P2** | Shipped | `OpenAILiveRealtime` on a raw socket, **local plane only** | loopback + a real `gpt-live-1` call |
| **P3** | Shipped | Metadata rows + per-minute cost + **modality junction rows** + API key | `mj sync validate`; Integration Tier |
| **P4** | Shipped | Remote plane: `delegation:'responses'`, `response.event` parsing (all four traps), marker runs with real token costs | both planes on one agent |
| **P5** | Shipped | Cancellation: task revisions, supersede-and-discard, Action idempotency | a mid-flight correction discards the stale result |
| **P6** | Planned | `APIName` cleanup — Inworld + ElevenLabs migrate to `Reasoning.Remote.Ref` | **breaking**; both drivers re-tested |
| **P7** | Partial | `OpenAISipBridge` + `BaseDetachedMediaBridge` + webhook ingress + Standard-Webhooks HMAC | inbound call, hangup, DTMF receive, `session.closed` collected |
| **P8** | Shipped | Browser WebRTC: SDP broker + `OpenAILiveClient` | 15 s pre-bill accounted for |
| **P9** | Shipped | `audio/pcmu` passthrough on the server-bridged path | latency measured vs today |

P0 and P1 are independently valuable and should not wait.

---

## 9. [R2] What Revision 1 got wrong

| Claim | Reality |
|---|---|
| "Zero event names overlap" | `response.create` and `session.update` overlap **with different semantics** |
| `OnOutput` gets `start_ms`/`end_ms` — "free timing" | No timing fields and no output-audio-done event; those belong to transcript deltas |
| `SendToolResult` → `response.item.create` + `response.create` | Remote plane wire event is `response.item.create` (type `function_call_output`); `conversation.item.create` is explicitly rejected by OpenAI Live with 'Invalid value: conversation.item.create. Supported values are: ... response.item.create, response.create, ...' |
| `SendContextNote` → `instructions.append` | Should be `thinking.append`; instructions interrupt speech and must not carry tool output |
| Transcription is "free" | Both directions and timestamped, yes; "free" is stated nowhere |
| `mcp` is a hosted tool type | Not documented anywhere in the guides |
| Observability is an opaque hole | Structured per-response token usage is available and attributable |
| Detached plane: "MJ holds zero bytes" | Reflected audio arrives at the sideband regardless, 24 kHz PCM16 |
| `OutboundDial` on the SIP bridge | Outbound is explicitly unsupported |
| DTMF "substitutes cleanly" | `OnDTMF` yes; `SendDTMF` has no equivalent |
| `store` gives us `StartRecording` | Startup-only and multiply gated; cannot start mid-call |
| Browser allowlist "documented as…" | SDK doc-comment; absent from all twelve guides |
| P0-1 "easy to satisfy" | Transcripts are explicitly not a heartbeat |
| Sideband is the control plane | Only when a second observer is needed; a server-owned primary WS needs none |
