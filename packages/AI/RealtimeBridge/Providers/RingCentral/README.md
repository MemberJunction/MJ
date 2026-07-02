# @memberjunction/ai-bridge-ringcentral

The **RingCentral** Realtime Bridge driver — a **telephony** bridge in MemberJunction's Realtime Bridges
program, copied from the reference telephony driver (`@memberjunction/ai-bridge-twilio`). It connects the
one realtime agent engine to a **phone call** over the **RingCentral Voice / Call Control API**: outbound
dial (RingOut / `POST /telephony/sessions`), inbound webhook routing, single-party audio in/out, DTMF
send/receive, and call transfer (supervise/transfer) — all behind an injectable telephony call SDK seam so
the driver builds and unit-tests with **no network and no real RingCentral client**.

A phone call goes through the *same* transport seam as every meeting bridge — it is just a single-leg
audio media source. Telephony is **audio only**: no video, no screen, and **no Meeting Controls /
facilitator surface** (a 1:1 call has no roster to facilitate). (RingCentral **Video** meetings could be a
separate provider row / meeting driver in the future — this package is the **telephony** side only.)

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) (§ Telephony bridges) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§8 RingCentral capability row, §9 Phase 6) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-ringcentral
```

## What it provides

- **`RingCentralBridge`** — `@RegisterClass(BaseRealtimeBridge, 'RingCentralBridge')`. The
  `MJ: AI Bridge Providers` row with `DriverClass = 'RingCentralBridge'` resolves to this driver via the
  `ClassFactory`. It is a thin subclass of [`BaseTelephonyBridge`](../../Base) — all call lifecycle, the
  audio media seam, DTMF, transfer, the caller+agent roster, and capability gating are inherited. The
  driver only binds the RingCentral SDK factory.
- **`RingCentralCallSdk`** — the RingCentral binding of the platform-agnostic `ITelephonyCallSdk` seam
  over the RingCentral Voice / Call Control API. Ships **unbound** (every op throws "bind the real
  RingCentral client") until a deployment supplies `IRingCentralClientBindings` over the real
  `@ringcentral/sdk`.
- **`RingCentralCallSdkFactory`** — the creation seam that builds a `RingCentralCallSdk` from resolved config.

## Capability coverage (the RingCentral telephony seed row)

| Capability | Status |
|---|---|
| Outbound dial | ✅ |
| Inbound routing | ✅ |
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
forwards the session's direction (and the agent's caller-id / the inbound session id) into the driver's
`Configuration`:

| Config key | Purpose |
|---|---|
| `Direction` | `'Outbound'` (default) → `sdk.dial(to, from)`; `'Inbound'` → `sdk.answer(callId)` |
| `FromNumber` | the agent's RingCentral DID outbound calls originate from |
| `InboundCallId` | the platform telephony session id of the inbound call to answer (from the inbound webhook) |

`Connect` requires `AudioIn` + `AudioOut`; outbound additionally requires `OutboundDial`, inbound requires
`InboundRouting`.

## The RingCentral binding (deployment TODO)

`RingCentralCallSdk` maps the telephony seam onto RingCentral's two halves — the **Call Control REST API**
(place/supervise/transfer/hang-up sessions) and the session **media stream** (bidirectional realtime audio
+ DTMF):

| `ITelephonyCallSdk` op | RingCentral binding |
|---|---|
| `dial` (outbound) | RingOut / Call Control `POST /restapi/v1.0/account/~/telephony/sessions` → telephony session id |
| `answer` (inbound) | subscription notification delivers the session id; `POST .../sessions/{id}/parties/{id}/answer` + accept media stream |
| `hangup` | Call Control `DELETE .../telephony/sessions/{id}` (or party drop) |
| `sendAudioFrame` | outbound media frame on the session's media stream (the agent's voice) |
| `onAudioFrame` | inbound media events on the session's media stream (single remote party) |
| `sendDtmf` | Call Control party `play` / `dtmf` action |
| `onDtmf` | inbound DTMF events on the session's media/event stream |
| `transfer` | Call Control party `transfer` (supervise/transfer to number or extension) |
| `onCallEnded` | telephony-session `Disconnected`/`Finished` status event, or media-stream `stop` |

Out of the box `RingCentralCallSdk` is **unbound** — every operation throws an explicit "bind the real
RingCentral client" error. Bind the real client by supplying an `IRingCentralClientBindings` (Call Control
REST + media stream) when constructing the SDK; the driver and its tests do not change, and **none of the
`@ringcentral/sdk` types leak into this package**. Credentials (clientId / clientSecret / JWT) resolve
through MJ's credential system referenced by the provider `Configuration` — never inline secrets.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, forwards the session `Direction` / caller-id into the
driver config, and wires the transport seam to the injected `IRealtimeSession`. There is no channel host
to wire for telephony (no Meeting Controls).

## Testing

`FakeRingCentralCallSdk` (in `src/__tests__/`) is an in-memory `ITelephonyCallSdk` with drive helpers and
capture sinks. The suite covers outbound dial → connect → audio round-trip (in/out), inbound answer, DTMF
send + receive, transfer (gated), hangup + `onCallEnded`, the single caller+agent roster, capability
gating (video/screen/Meeting Controls correctly absent), and the unbound-`RingCentralCallSdk` bind-me
throw — all with no network.

```bash
cd packages/AI/RealtimeBridge/Providers/RingCentral && npm run test
```
