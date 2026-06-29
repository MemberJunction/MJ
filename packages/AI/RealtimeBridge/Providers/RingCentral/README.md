# @memberjunction/ai-bridge-ringcentral

The **RingCentral** Realtime Bridge driver — a **telephony** bridge in MemberJunction's Realtime Bridges
program. It connects the one realtime agent engine to a **phone call** over a registered **SIP softphone**
(`ringcentral-softphone` over SIP/TLS + RTP/SRTP): full-duplex audio in/out, outbound dial + inbound INVITE
answer, DTMF send/receive, and blind transfer — all behind an injectable telephony call SDK seam so the
driver builds and unit-tests with **no network and no real SIP client**.

## Why SIP (not Call Control / Call Streaming)

RingCentral's only product that carries **bidirectional** call audio is a registered SIP softphone.
RingCentral's WebSocket **"Call Streaming"** product is **receive-only** — it lets you *hear* a call but
has no way to inject the agent's voice — and its **Call Control** REST API is signaling-only (no media
plane). A realtime voice agent needs duplex audio, so this driver registers as a SIP device and carries
RTP both ways. (Confirmed by RingCentral: *"we don't have such a voice API to stream bi-direction audio"* —
that's Call Streaming; duplex is SIP-only.)

A phone call goes through the *same* transport seam as every meeting bridge — it is just a single-leg
audio media source. Telephony is **audio only**: no video, no screen, and **no Meeting Controls /
facilitator surface** (a 1:1 call has no roster to facilitate).

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) (§ Telephony bridges) and the
program [`DEPLOYMENT.md` §6b](../../../../plans/realtime/bridges-and-widget/DEPLOYMENT.md) for the
end-to-end RingCentral setup (the five SIP credentials + DID routing).

## Install

```bash
npm install @memberjunction/ai-bridge-ringcentral
```

`ringcentral-softphone` and its `werift-rtp` peer are **optional dependencies** loaded lazily only when the
RingCentral provider is configured (the package builds + unit-tests with neither installed).

## What it provides

- **`RingCentralBridge`** — `@RegisterClass(BaseRealtimeBridge, 'RingCentralBridge')`. The
  `MJ: AI Bridge Providers` row with `DriverClass = 'RingCentralBridge'` resolves to this driver via the
  `ClassFactory`. A thin subclass of [`BaseTelephonyBridge`](../../Base) — all call lifecycle, the audio
  media seam, DTMF, transfer, the caller+agent roster, and capability gating are inherited.
- **`RingCentralSoftphoneHandle`** + **`createRingCentralSoftphone`** — the process-wide, long-lived SIP
  **registration** (constructed + registered once at boot). It owns the inbound-INVITE stream: it parks
  each INVITE by SIP `Call-ID` and notifies a listener with the parsed caller/DID, so the bridge that the
  server then starts can answer it. Per-call SDKs draw their session from it (`SoftphoneCallSource`).
- **`RingCentralSoftphoneCallSdk`** — the full-duplex binding of the platform-agnostic `ITelephonyCallSdk`
  seam over one softphone call session.
- **`RealtimeRtpSender`** — the outbound audio clock: an appendable, self-paced 20 ms RTP sender (the SDK's
  own `Streamer` only plays a fixed pre-recorded buffer and can't be fed a live stream). Barge-in drops its
  queue so the agent goes silent immediately.
- **`RingCentralCallSdk`** / **`RingCentralCallSdkFactory`** — the **unbound default** SDK the bridge falls
  back to (every op throws "bind the real RingCentral client"); the server overrides it with the softphone
  SDK at `StartBridgeSession` via `BindSdk`, so a misconfigured deployment fails loudly rather than silently.

## Capability coverage (the RingCentral telephony seed row)

| Capability | Status |
|---|---|
| Outbound dial | ✅ |
| Inbound routing | ✅ |
| Audio in / out | ✅ (full duplex over RTP/SRTP) |
| DTMF send / receive | ✅ |
| Call transfer | ✅ (blind / SIP REFER) |
| Video / screen | ➖ n/a — telephony is audio only (`SendMedia` no-ops video/screen out) |
| Meeting Controls / facilitator | ➖ n/a — a 1:1 call has no roster (`GetMeetingControlsEventSource` → `null`) |
| Recording | ➖ not enabled on the seed row — `StartRecording` stays capability-gated and throws |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the base re-asserts each flag with `RequireFeature` at the top of its overrides.

## Outbound vs inbound

The shipped `RealtimeBridgeContext` is a meeting-shaped contract with no `Direction` field, so the server
forwards the session's direction (and the inbound call id + carrier rate) into the driver's `Configuration`:

| Config key | Purpose |
|---|---|
| `Direction` | `'Outbound'` (default) → `sdk.dial(to, from)`; `'Inbound'` → `sdk.answer(callId)` |
| `FromNumber` | the agent's DID (informational — the softphone's caller-id is fixed by its SIP registration) |
| `InboundCallId` | the SIP `Call-ID` of the inbound call to answer (the handle parked the INVITE under it) |
| `CarrierSampleRate` | the SIP leg's PCM16 rate — `16000` for OPUS/16000 — so the base bridge resamples to/from the model rate without bottlenecking through 8 kHz |

`Connect` requires `AudioIn` + `AudioOut`; outbound additionally requires `OutboundDial`, inbound requires
`InboundRouting`.

## The softphone binding

`RingCentralSoftphoneCallSdk` maps the telephony seam onto the `ringcentral-softphone` SDK (codec
**OPUS/16000** → clean PCM16 mono 16 kHz both directions):

| `ITelephonyCallSdk` op | softphone binding |
|---|---|
| `dial` (outbound) | `softphone.call(to)` → `OutboundCallSession` (caller-id is the registration's; `from` is informational) |
| `answer` (inbound) | `softphone.answer(parkedInvite)` → `InboundCallSession`, resolved from the handle by SIP `Call-ID` |
| `hangup` | `session.hangup()` (SIP `BYE`) + stop the RTP sender |
| `sendAudioFrame` | enqueue on `RealtimeRtpSender` → paced 20 ms RTP frames (`encoder.encode` → `RtpPacket` → `session.sendPacket`) |
| `onAudioFrame` | `session.on('audioPacket', …)` → decoded PCM16 (the caller's voice) |
| `sendDtmf` | `session.sendDTMF(char)` per digit |
| `onDtmf` | `session.on('dtmf', …)` |
| `transfer` | `session.transfer(to)` (blind REFER) |
| `onCallEnded` | `session.once('disposed', …)` (either party hangs up); outbound also `'busy'` |
| `flushOutbound` | drop the RTP sender's queue (barge-in — the softphone holds no outbound buffer to flush) |

The five SIP device credentials (`domain` / `outboundProxy` / `username` / `password` / `authorizationId`)
resolve **upstream** from the deployment config (an "Existing Phone" BYOD device — see
[`DEPLOYMENT.md` §6b](../../../../plans/realtime/bridges-and-widget/DEPLOYMENT.md)) — never inline secrets,
and **none of the `ringcentral-softphone` / `werift-rtp` types leak into this package** (they're loaded
lazily behind structural seams).

## Usage (engine-driven)

The bridge is not used directly — the server's `RingCentralTelephonyService` creates + registers the shared
softphone at boot, routes inbound INVITEs to `AIBridgeEngine.StartBridgeSession`, and binds the softphone
SDK onto the driver. There is no channel host to wire for telephony (no Meeting Controls).

## Testing

The suite is fully offline (no SIP client, no `werift-rtp`, no network):

- **`realtime-rtp-sender.test.ts`** — 20 ms framing, RTP counter advancement + sequence wrap, sub-frame
  remainder carry, barge-in flush, the disposed-session guard.
- **`ringcentral-softphone-call-sdk.test.ts`** — dial/answer wiring, inbound audio → `onAudioFrame`, paced
  outbound audio (driven with fake timers through the real sender), barge-in, DTMF send/receive, transfer,
  hangup, `disposed`/`busy` → `onCallEnded`.
- **`ringcentral-softphone-handle.test.ts`** — inbound INVITE parking + `onInvite` notification, answer /
  decline by call id, and the pure SIP-header parsing (`parseInvite` / `getHeader` / `extractSipNumber`).
- **`ringcentral-bridge.test.ts`** — the driver + the unbound-`RingCentralCallSdk` bind-me throw + capability
  gating (video/screen/Meeting Controls correctly absent).

```bash
cd packages/AI/RealtimeBridge/Providers/RingCentral && npm run test
```
