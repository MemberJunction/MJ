# @memberjunction/ai-bridge-vonage

The **Vonage** Realtime Bridge driver — a **telephony** bridge in MemberJunction's Realtime Bridges
program, mirroring the reference telephony driver
[`@memberjunction/ai-bridge-twilio`](../Twilio). It connects the one realtime agent engine to a **phone
call** over the **Vonage Voice API + websocket media**: outbound dial, inbound DID routing, single-party
audio in/out, DTMF send/receive, and call transfer — all behind an injectable telephony call SDK seam so
the driver builds and unit-tests with **no network and no real Vonage client**.

A phone call goes through the *same* transport seam as every meeting bridge — it is just a single-leg
audio media source. Telephony is **audio only**: no video, no screen, and **no Meeting Controls /
facilitator surface** (a 1:1 call has no roster to facilitate).

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) (§ Telephony bridges) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§8 Vonage capability row, §9 Phase 6) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-vonage
```

## What it provides

- **`VonageBridge`** — `@RegisterClass(BaseRealtimeBridge, 'VonageBridge')`. The `MJ: AI Bridge Providers`
  row with `DriverClass = 'VonageBridge'` resolves to this driver via the `ClassFactory`. It is a thin
  subclass of [`BaseTelephonyBridge`](../../Base) — all call lifecycle, the audio media seam, DTMF,
  transfer, the caller+agent roster, and capability gating are inherited. The driver only binds the Vonage
  SDK factory.
- **`VonageCallSdk`** — the Vonage binding of the platform-agnostic `ITelephonyCallSdk` seam over the
  Vonage Voice API + websocket media. Ships **unbound** (every op throws "bind the real Vonage client")
  until a deployment supplies `IVonageClientBindings` over the real `@vonage/server-sdk`.
- **`VonageCallSdkFactory`** — the creation seam that builds a `VonageCallSdk` from resolved config.

## Capability coverage (the Vonage seed row)

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
| `FromNumber` | the agent's Vonage number / DID outbound calls originate from |
| `InboundCallId` | the platform call UUID of the inbound call to answer (from the inbound webhook) |

`Connect` requires `AudioIn` + `AudioOut`; outbound additionally requires `OutboundDial`, inbound requires
`InboundRouting`.

## The Vonage binding (deployment TODO)

`VonageCallSdk` maps the telephony seam onto Vonage's two halves — the **Voice API** (place/modify/hang-up,
driven by NCCO documents) and the **websocket** media leg the call `connect`s to (bidirectional realtime
audio + DTMF):

| `ITelephonyCallSdk` op | Vonage binding |
|---|---|
| `dial` (outbound) | Voice API `POST /v1/calls` with an NCCO whose `connect` action opens a bidirectional websocket → call UUID |
| `answer` (inbound) | the inbound answer webhook returns an NCCO with a `connect` websocket action; accept the websocket for the call UUID |
| `hangup` | Voice API `PUT /v1/calls/:uuid` with `{ action: 'hangup' }` |
| `sendAudioFrame` | outbound websocket media frame (the agent's voice) |
| `onAudioFrame` | inbound websocket media frames (single remote party) |
| `sendDtmf` | Voice API `PUT /v1/calls/:uuid/dtmf` with `{ digits }` (or an NCCO `input` action) |
| `onDtmf` | NCCO `input` (`dtmf`) results delivered to the event webhook |
| `transfer` | Voice API `PUT /v1/calls/:uuid` with `{ action: 'transfer', destination: { type: 'ncco', ncco: [...] } }` |
| `onCallEnded` | the event webhook (`completed`/`failed`/`rejected`/`cancelled`) or the websocket `close` event |

Out of the box `VonageCallSdk` is **unbound** — every operation throws an explicit "bind the real Vonage
client" error. Bind the real client by supplying an `IVonageClientBindings` (Voice API + websocket) when
constructing the SDK; the driver and its tests do not change, and **none of the `@vonage/server-sdk`
types leak into this package**. Credentials (API key, API secret, the Voice application id + private key,
the websocket media URL) resolve through MJ's credential system referenced by the provider
`Configuration` — never inline secrets.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, forwards the session `Direction` / caller-id into the
driver config, and wires the transport seam to the injected `IRealtimeSession`. There is no channel host
to wire for telephony (no Meeting Controls).

## Testing

`FakeVonageCallSdk` (in `src/__tests__/`) is an in-memory `ITelephonyCallSdk` with drive helpers and
capture sinks. The suite covers outbound dial → connect → audio round-trip (in/out), inbound answer, DTMF
send + receive, transfer (gated), hangup + `onCallEnded`, the single caller+agent roster, capability
gating (video/screen/Meeting Controls correctly absent), and the unbound-`VonageCallSdk` bind-me throw —
all with no network.

```bash
cd packages/AI/RealtimeBridge/Providers/Vonage && npm run test
```
