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

### Production binding (deployment TODO)

In production this is bound to the **Zoom Meeting SDK** (a server/Linux bot build) plus **raw data
access** (Zoom's raw-data entitlement) for per-participant PCM audio. Supply a factory via the creation
seam:

```typescript
import { ZoomBridge } from '@memberjunction/ai-bridge-zoom';

// Once, where bridge drivers are configured:
//   bridge.SetSdkFactory((config) => new RealZoomSdkAdapter(config));
// The adapter implements IZoomMeetingSdk over the real SDK. The driver + its tests do not change.
```

Out of the box, `ZoomBridge` ships **without** the real SDK adapter — `Connect` throws an explicit
"bind the real Zoom Meeting SDK" error until `SetSdkFactory` is called. Tests inject a `FakeZoomSdk`.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected
`IRealtimeSession`, and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeZoomSdk` (in `src/__tests__/`) is an in-memory `IZoomMeetingSdk` with drive helpers and capture
sinks. The suite covers connect/disconnect, audio in→`OnMedia` (speaker labels) and out→seam,
participant join/leave → roster + event source, native hand-raise → Meeting Controls perception,
capability gating (a feature Zoom lacks throws), and chat — all with no network.

```bash
cd packages/AI/Providers/BridgeZoom && npm run test
```
