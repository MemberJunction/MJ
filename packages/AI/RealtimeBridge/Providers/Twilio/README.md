# @memberjunction/ai-bridge-twilio

The **Twilio** Realtime Bridge driver — the first **telephony** bridge in MemberJunction's Realtime
Bridges program, and the reference driver the RingCentral and Vonage telephony drivers copy. It connects
the one realtime agent engine to a **phone call** over **Twilio Programmable Voice + Media Streams**:
outbound dial, inbound DID routing, single-party audio in/out, DTMF send/receive, and call transfer — all
behind an injectable telephony call SDK seam so the driver builds and unit-tests with **no network and no
real Twilio client**.

A phone call goes through the *same* transport seam as every meeting bridge — it is just a single-leg
audio media source. Telephony is **audio only**: no video, no screen, and **no Meeting Controls /
facilitator surface** (a 1:1 call has no roster to facilitate).

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) (§ Telephony bridges) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§8 Twilio capability row, §9 Phase 6) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-twilio
```

## What it provides

- **`TwilioBridge`** — `@RegisterClass(BaseRealtimeBridge, 'TwilioBridge')`. The `MJ: AI Bridge Providers`
  row with `DriverClass = 'TwilioBridge'` resolves to this driver via the `ClassFactory`. It is a thin
  subclass of [`BaseTelephonyBridge`](../../BridgeBase) — all call lifecycle, the audio media seam, DTMF,
  transfer, the caller+agent roster, and capability gating are inherited. The driver only binds the Twilio
  SDK factory.
- **`TwilioCallSdk`** — the Twilio binding of the platform-agnostic `ITelephonyCallSdk` seam over Twilio
  Programmable Voice + Media Streams. Ships **unbound** (every op throws "bind the real Twilio client")
  until a deployment supplies `ITwilioClientBindings` over the real `twilio` SDK.
- **`TwilioCallSdkFactory`** — the creation seam that builds a `TwilioCallSdk` from resolved config.

## Capability coverage (the Twilio seed row)

| Capability | Status |
|---|---|
| Outbound dial | ✅ |
| Inbound DID routing | ✅ |
| Invite (DID identity) | ✅ |
| Audio in / out | ✅ |
| DTMF send / receive | ✅ |
| Call transfer | ✅ |
| Video / screen | ➖ n/a — telephony is audio only (`SendMedia` no-ops video/screen out) |
| Meeting Controls / facilitator | ➖ n/a — a 1:1 call has no roster (`GetMeetingControlsEventSource` → `null`) |
| Recording | ➖ not enabled on the seed row — `StartRecording` stays capability-gated and throws |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the base re-asserts each flag with `RequireFeature` at the top of its overrides.

## Outbound vs inbound

The shipped `RealtimeBridgeContext` is a meeting-shaped contract with no `Direction` field, so the engine
forwards the session's direction (and the agent's caller-id / the inbound call id) into the driver's
`Configuration`:

| Config key | Purpose |
|---|---|
| `Direction` | `'Outbound'` (default) → `sdk.dial(to, from)`; `'Inbound'` → `sdk.answer(callId)` |
| `FromNumber` | the agent's Twilio number / DID outbound calls originate from |
| `InboundCallId` | the platform Call SID of the inbound call to answer (from the inbound webhook) |

`Connect` requires `AudioIn` + `AudioOut`; outbound additionally requires `OutboundDial`, inbound requires
`InboundRouting`.

## The Twilio binding (deployment TODO)

`TwilioCallSdk` maps the telephony seam onto Twilio's two halves — the **REST API** (place/modify/hang-up)
and the **Media Streams** websocket (bidirectional realtime audio + DTMF):

| `ITelephonyCallSdk` op | Twilio binding |
|---|---|
| `dial` (outbound) | REST `calls.create({ to, from, twiml })` with `<Connect><Stream>` to the Media-Streams websocket → Call SID |
| `answer` (inbound) | the inbound voice webhook returns `<Connect><Stream>`; accept the Media-Streams websocket for the Call SID |
| `hangup` | REST `calls(sid).update({ status: 'completed' })` |
| `sendAudioFrame` | outbound Media-Streams `media` message (the agent's voice) |
| `onAudioFrame` | inbound Media-Streams `media` events (single remote party) |
| `sendDtmf` | REST `calls(sid).update` with `<Play digits>` / `<Dial sendDigits>` |
| `onDtmf` | `<Gather input="dtmf">` webhook results or Media-Streams `dtmf` events |
| `transfer` | REST `calls(sid).update({ twiml: '<Dial>+1…</Dial>' })` |
| `onCallEnded` | the `status-callback` webhook (`completed`/`failed`/`canceled`) or the stream `stop` event |

Out of the box `TwilioCallSdk` is **unbound** — every operation throws an explicit "bind the real Twilio
client" error. Bind the real client by supplying an `ITwilioClientBindings` (REST + Media Streams) when
constructing the SDK; the driver and its tests do not change, and **none of the `twilio` SDK's types leak
into this package**. Credentials (Account SID, Auth Token, Media-Streams URL) resolve through MJ's
credential system referenced by the provider `Configuration` — never inline secrets.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, forwards the session `Direction` / caller-id into the
driver config, and wires the transport seam to the injected `IRealtimeSession`. There is no channel host
to wire for telephony (no Meeting Controls).

## Testing

`FakeTwilioCallSdk` (in `src/__tests__/`) is an in-memory `ITelephonyCallSdk` with drive helpers and
capture sinks. The suite covers outbound dial → connect → audio round-trip (in/out), inbound answer, DTMF
send + receive, transfer (gated), hangup + `onCallEnded`, the single caller+agent roster, capability
gating (video/screen/Meeting Controls correctly absent), and the unbound-`TwilioCallSdk` bind-me throw —
all with no network.

```bash
cd packages/AI/Providers/BridgeTwilio && npm run test
```

### Production REST wiring (`RealTwilioRestClient`)

`RealTwilioRestClient` is the production `ITwilioRestLike` over the real `twilio` SDK (an
`optionalDependency`, lazily loaded — the package still builds/tests with no `twilio` install). It maps
`CreateCall` → `client.calls.create({ to, from, twiml, statusCallback })` and `UpdateCall` →
`client.calls(sid).update({ status, twiml })`. Construct it with credentials resolved from MJ config
(API-key pair preferred over the account auth token); pass it as the `Rest` half of `RealTwilioBindings`
(the `MediaPump` half is the Media-Streams websocket, owned by the MJAPI telephony ingress). Unit-tested
via an injected fake `twilio` factory — no network.

### Credential-gated integration test (NOT in CI)

`real-twilio-bindings.integration.test.ts` places a real outbound call and ends it. It is `skipIf`-gated
on these env vars and never runs in CI (it spends real money + dials real PSTN):

| Env var | Purpose |
|---|---|
| `TWILIO_TEST_ACCOUNT_SID` | Twilio Account SID (`AC…`). |
| `TWILIO_TEST_AUTH_TOKEN` | Account auth token. |
| `TWILIO_TEST_FROM` | A Twilio number you own (caller-id). |
| `TWILIO_TEST_TO` | A capped-spend test number that auto-answers. |
| `TWILIO_TEST_STREAM_URL` | (optional) the `wss://…/telephony/twilio/media` URL for the `<Connect><Stream>`. |

Run locally: `npm run test -- real-twilio-bindings.integration`. The full media round-trip (audio through
the agent) needs the MJAPI ingress + a publicly reachable stream URL — see the T1 ingress notes + manual
runbook.
