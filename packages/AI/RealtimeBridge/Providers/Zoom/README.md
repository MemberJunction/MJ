# @memberjunction/ai-bridge-zoom

The **Zoom** Realtime Bridge driver — the first real platform bridge in MemberJunction's Realtime
Bridges program. It connects the one realtime agent engine to a **Zoom meeting**: bidirectional audio,
a diarized participant roster, participant mute, in-meeting chat, and a **Meeting Controls** facilitator
channel — all behind an injectable Zoom Meeting SDK seam so the driver builds and unit-tests with **no
network and no real Zoom SDK**.

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§3 provider abstraction, §4b channels, §8 Zoom capability row) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-zoom
```

## What it provides

- **`ZoomBridge`** — `@RegisterClass(BaseRealtimeBridge, 'ZoomBridge')`. The `MJ: AI Bridge Providers`
  row with `DriverClass = 'ZoomBridge'` resolves to this driver via the `ClassFactory`. Implements the
  four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` / `SendMedia` / `OnMedia`) and the
  capability-gated virtuals Zoom supports (`GetParticipants`, `OnParticipantChange`), plus
  `GetMeetingControlsEventSource` for the facilitator channel and a `PostChatMessage` helper.
- **`IZoomMeetingSdk`** — the **injectable seam** the driver depends on instead of the real SDK.
- **`ZoomMeetingControlsEventSource`** — adapts the seam's roster / hand-raise / speaking / mute into
  the bridge's `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the Zoom seed row)

| Capability | Status |
|---|---|
| On-demand + scheduled join | ✅ |
| Audio in / out | ✅ |
| Video in/out, Screen in/out (directional flags) | ✅ (transport carries them; models light audio first) |
| Speaker diarization (roster + per-speaker labels) | ✅ |
| Participant mute (Meeting Controls) | ✅ |
| In-meeting chat | ✅ |
| DTMF / call transfer / recording | ➖ not Zoom-meeting features — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

## The Zoom Meeting SDK seam (`IZoomMeetingSdk`)

The driver never imports the real Zoom SDK. It depends only on this minimal interface:

```typescript
export interface IZoomMeetingSdk {
    join(args: ZoomJoinArgs): Promise<ZoomJoinResult>;
    leave(): Promise<void>;
    sendAudioFrame(pcm: ArrayBuffer): void;                                 // agent's voice out (virtual mic)
    onAudioFrame(cb: (frame: ZoomAudioFrame) => void): void;                // raw per-participant audio in (diarization)
    onParticipantJoin(cb: (p: ZoomParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    onHandRaise(cb: (id: string, raised: boolean) => void): void;
    getParticipants(): Promise<ZoomParticipant[]>;
    postChatMessage(text: string): Promise<void>;
    muteParticipant(participantId: string): Promise<void>;
    onMeetingEnded(cb: () => void): void;
}
```

## Real Zoom binding — `ZoomRtmsMeetingSdk` (RTMS)

This package now ships a **real** `IZoomMeetingSdk` binding: **`ZoomRtmsMeetingSdk`**, built over Zoom's
**Realtime Media Streams (RTMS)** Node SDK (**`@zoom/rtms`**). It gives the agent **hearing** in a live
Zoom meeting — RTMS streams **per-participant** inbound audio to your server over a webhook-initiated
WebSocket, and the adapter maps each frame to the bridge's diarized `{ Pcm, ParticipantId }` path.

```typescript
import { ZoomBridge, BindZoomRtms } from '@memberjunction/ai-bridge-zoom';

// Once, where bridge drivers are configured. Creds + RTMS connection params resolve from the
// session Configuration the engine passes at Connect (see below) — no secrets inline.
bridge.SetSdkFactory(BindZoomRtms());
```

`BindZoomRtms()` returns the `SetSdkFactory`-shaped factory that constructs a `ZoomRtmsMeetingSdk` from
the engine's per-session `Configuration`. The driver and its tests do not change.

### 🔴 Outbound-audio limitation (read this)

**RTMS is RECEIVE-ONLY.** It delivers inbound per-participant audio/transcripts but **cannot send the
agent's synthesized audio back into the meeting.** So a real RTMS binding gives the agent **hearing**
(diarized inbound audio) but **not a voice** in the meeting.

In `ZoomRtmsMeetingSdk` the outbound/host-control surfaces are therefore **documented, one-time-warned
no-ops** (they never throw, so a live session is not killed when the model emits audio):

| Surface | RTMS behavior |
|---|---|
| `sendAudioFrame` (agent's voice out) | no-op + one-time warning — RTMS has no send path |
| `postChatMessage` | no-op — chat is a Meeting-SDK/host control, not RTMS |
| `muteParticipant` | no-op — host mute is a Meeting-SDK control |
| `onHandRaise` | no-op — RTMS surfaces no hand-raise signal |

**For full two-way audio (the agent *speaking* into Zoom)**, this package now ships the second binding:
**`ZoomNativeMeetingSdk`** (`zoom-native-sdk.ts`) — a real, two-way `IZoomMeetingSdk` adapter whose
`sendAudioFrame` forwards to the native virtual-mic send path and whose host controls (chat/mute) actually
act. Activate it with `bridge.SetSdkFactory(BindZoomNative())` (or just let the engine auto-bind it — it is
the registered default for `DriverClass = 'ZoomBridge'`; pass `StartBridgeSessionParams.BindSdk` with
`BindZoomRtms()` to choose the receive-only RTMS binding instead).

`ZoomNativeMeetingSdk` is the **MJ-side adapter**, fully unit-tested against a fake native module. It still
requires a real backing media client at deployment — one of:
- the native **Zoom Meeting SDK** (a C++/Linux server-bot build with the raw-data send+receive entitlement),
  wrapped as a N-API addon or sidecar exposing the adapter's `NativeMeetingModule` surface and pointed at via
  `ZoomNativeSdkConfig.NativeModuleSpecifier`; or
- a **third-party meeting-bot service** that injects audio on your behalf, behind the same module surface.

Both satisfy the same `NativeMeetingModule` contract, so the `ZoomNativeMeetingSdk` adapter and its tests are
unchanged. See [`plans/realtime/native-bridge-buildout-plan.md`](../../../../plans/realtime/native-bridge-buildout-plan.md) §3 for the build steps.

All three bindings (`ZoomRtmsMeetingSdk` receive-only, `ZoomNativeMeetingSdk` two-way, and a test
`FakeZoomSdk`) implement the same `IZoomMeetingSdk` seam, so the `ZoomBridge` driver and its tests are
unchanged regardless of which is bound.

### Webhook + credential configuration a deployment provides

RTMS is **webhook-initiated**. A deployment must:

1. **Create a Zoom app** with the **RTMS** scopes/entitlement enabled (per-participant audio).
2. **Subscribe to the RTMS webhooks** — `meeting.rtms_started` and `meeting.rtms_stopped` (a.k.a.
   `rtms.stopped`). Zoom signs every webhook; **verify the signature** before processing.
3. **Wire a webhook endpoint** that, on `meeting.rtms_started`, hands the connection params the payload
   carries into the bridge session's `Configuration` under a `Connection` block:

   ```jsonc
   // session Configuration the engine passes to ZoomBridge.Connect → BindZoomRtms factory:
   {
     "ClientId":     "<resolved upstream from the MJ credential system — NEVER inline>",
     "ClientSecret": "<resolved upstream — NEVER inline>",
     "Connection": {                         // straight from the meeting.rtms_started webhook payload
       "meeting_uuid":   "payload.object.meeting_uuid",
       "rtms_stream_id": "payload.object.rtms_stream_id",
       "server_urls":    "payload.object.server_urls",
       "signature":      "<optional: HMAC-SHA256(client_secret, client_id + meeting_uuid + rtms_stream_id)>"
     }
   }
   ```

4. On `meeting.rtms_stopped`, end the corresponding bridge session.

**Credentials** (`ClientId` / `ClientSecret`) **resolve upstream** via the MJ credential system / the
provider `Configuration` — they are **never inlined** at a call site. If the `Connection` block is
absent or malformed, `ZoomRtmsMeetingSdk.join()` throws a precise "RTMS is webhook-initiated — wire the
meeting.rtms_started webhook" error.

### Optionality

`@zoom/rtms` is an **`optionalDependency`** (a native addon requiring **Node ≥ 22**). The adapter loads
it **lazily** behind the seam, so this package **builds and unit-tests without `@zoom/rtms` installed**.
When absent at runtime, `join()` throws an actionable "install `@zoom/rtms`" error. Tests inject a fake
module — no network, no native addon.

> ⚠️ The exact `@zoom/rtms` API surface is pinned from the SDK README + quickstart and marked with
> `// VERIFY against @zoom/rtms` notes in `zoom-rtms-sdk.ts` (callback arity, metadata field names,
> `join()` payload, leave/session-update semantics). A live test against a real Zoom app should confirm
> these before relying on them in production.

### The old default

Out of the box, `ZoomBridge`'s **default** factory still throws an explicit "bind the real Zoom SDK"
error until `SetSdkFactory` is called — so an unconfigured deployment fails loudly. Call
`SetSdkFactory(BindZoomRtms())` to activate real RTMS; tests inject a `FakeZoomSdk`.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected
`IRealtimeSession`, and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeZoomSdk` (in `src/__tests__/`) is an in-memory `IZoomMeetingSdk` with drive helpers and capture
sinks. The driver suite covers connect/disconnect, audio in→`OnMedia` (speaker labels) and out→seam,
participant join/leave → roster + event source, native hand-raise → Meeting Controls perception,
capability gating (a feature Zoom lacks throws), and chat — all with no network.

A second suite (`zoom-rtms-sdk.test.ts`) covers the **real RTMS adapter** against a **fake `@zoom/rtms`
module** (no native addon, no network): the pure RTMS-frame→`{ Pcm, ParticipantId }` mapping (both
documented callback arities + numeric/string ids), `readRtmsConfig` extraction, the join/hearing path
and participant discovery, the meeting-ended signals, the **receive-only no-op guards**, the
`BindZoomRtms` factory, and the actionable error when `@zoom/rtms` is absent.

```bash
cd packages/AI/RealtimeBridge/Providers/Zoom && npm run test
```
