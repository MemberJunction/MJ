# @memberjunction/ai-bridge-teams

The **Microsoft Teams** Realtime Bridge driver in MemberJunction's Realtime Bridges program. It connects
the one realtime agent engine to a **Teams meeting**: bidirectional audio, a diarized participant roster,
participant mute, Teams meeting chat, and a **Meeting Controls** facilitator channel — all behind an
injectable Teams calling-bot SDK seam so the driver builds and unit-tests with **no network and no real
Teams / Azure Communication Services SDK**. It is a structural mirror of the reference
[`@memberjunction/ai-bridge-zoom`](../BridgeZoom/README.md) driver.

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§3 provider abstraction, §4b channels, §8 Microsoft Teams capability row) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-teams
```

## What it provides

- **`TeamsBridge`** — `@RegisterClass(BaseRealtimeBridge, 'TeamsBridge')`. The `MJ: AI Bridge Providers`
  row with `DriverClass = 'TeamsBridge'` resolves to this driver via the `ClassFactory`. Implements the
  four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` / `SendMedia` / `OnMedia`) and the
  capability-gated virtuals Teams supports (`GetParticipants`, `OnParticipantChange`), plus
  `GetMeetingControlsEventSource` for the facilitator channel and a `PostChatMessage` helper.
- **`ITeamsMeetingSdk`** — the **injectable seam** the driver depends on instead of the real SDK.
- **`TeamsMeetingControlsEventSource`** — adapts the seam's roster / hand-raise / speaking / mute into
  the bridge's `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the Microsoft Teams seed row)

| Capability | Status |
|---|---|
| On-demand + scheduled + invite + **native invite** join | ✅ |
| Inbound routing | ✅ |
| Audio in / out | ✅ |
| Video in/out, Screen in/out (directional flags) | ✅ (transport carries them; models light audio first) |
| Speaker diarization (roster + per-speaker labels) | ✅ |
| Participant mute (Meeting Controls) | ✅ |
| Teams meeting chat | ✅ |
| Native raised-hand | ⚠️ Partial — wired where the calling-bot API surfaces it; tolerant of it never firing |
| DTMF / call transfer / recording | ➖ not Teams-meeting features here — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

### Teams vs. Zoom capability differences

Teams advertises everything Zoom does, **plus** `InviteJoin`, `NativeInvite`, and `InboundRouting` (the
calendar-invite / marketplace-native-invite / inbound-routing UX), and its native raised-hand is **partial**
rather than fully reliable. Everything else (audio in/out, directional video/screen, diarized roster,
mute, meeting chat) maps one-to-one onto the Zoom reference driver.

## The Teams calling-bot SDK seam (`ITeamsMeetingSdk`)

The driver never imports the real Teams / ACS SDK. It depends only on this minimal interface, named after
Microsoft Teams / Azure Communication Services calling-bot concepts:

```typescript
export interface ITeamsMeetingSdk {
    join(args: TeamsJoinArgs): Promise<TeamsJoinResult>;
    leave(): Promise<void>;
    sendAudioFrame(pcm: ArrayBuffer): void;                                 // agent's voice out (outbound audio socket)
    onAudioFrame(cb: (frame: TeamsAudioFrame) => void): void;               // raw per-participant audio in (diarization)
    onParticipantJoin(cb: (p: TeamsParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    onHandRaise(cb: (id: string, raised: boolean) => void): void;           // ⚠️ partial on Teams
    getParticipants(): Promise<TeamsParticipant[]>;
    postChatMessage(text: string): Promise<void>;                           // Teams meeting chat thread
    muteParticipant(participantId: string): Promise<void>;
    onMeetingEnded(cb: () => void): void;
}
```

### Production binding (deployment TODO)

In production this is bound to the **Azure Communication Services (ACS) calling-bot** SDK plus the
**Microsoft Graph cloud-communications API** (`/communications/calls`, application-hosted media) for
per-participant PCM audio, roster events, mute, and Teams meeting-chat posting. Supply a factory via the
creation seam:

```typescript
import { TeamsBridge } from '@memberjunction/ai-bridge-teams';

// Once, where bridge drivers are configured:
//   bridge.SetSdkFactory((config) => new RealTeamsSdkAdapter(config));
// The adapter implements ITeamsMeetingSdk over the real ACS/Graph SDK. The driver + its tests do not change.
```

Out of the box, `TeamsBridge` ships **without** the real SDK adapter — `Connect` throws an explicit
"bind the real Microsoft Teams SDK" error until `SetSdkFactory` is called. Tests inject a `FakeTeamsSdk`.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected
`IRealtimeSession`, and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeTeamsSdk` (in `src/__tests__/`) is an in-memory `ITeamsMeetingSdk` with drive helpers and capture
sinks. The suite covers connect/disconnect (incl. parsing the meeting thread id out of the join URL),
audio in→`OnMedia` (speaker labels) and out→seam, participant join/leave → roster + event source, native
hand-raise → Meeting Controls perception, capability gating (a feature Teams lacks throws), and chat — all
with no network.

```bash
cd packages/AI/Providers/BridgeTeams && npm run test
```
