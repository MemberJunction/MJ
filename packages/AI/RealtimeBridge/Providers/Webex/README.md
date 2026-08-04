# @memberjunction/ai-bridge-webex

The **Cisco Webex** Realtime Bridge driver in MemberJunction's Realtime Bridges program. It connects
the one realtime agent engine to a **Webex meeting**: bidirectional audio, a diarized participant roster,
participant mute, Webex meeting chat, and a **Meeting Controls** facilitator channel — all behind an
injectable Cisco Webex Meetings SDK seam so the driver builds and unit-tests with **no network and no real
Cisco Webex Meetings SDK**. It is a structural mirror of the reference
[`@memberjunction/ai-bridge-zoom`](../BridgeZoom/README.md) driver (and its sibling
[`@memberjunction/ai-bridge-teams`](../BridgeTeams/README.md)).

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§3 provider abstraction, §4b channels, §8 Cisco Webex capability row) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-webex
```

## What it provides

- **`WebexBridge`** — `@RegisterClass(BaseRealtimeBridge, 'WebexBridge')`. The `MJ: AI Bridge Providers`
  row with `DriverClass = 'WebexBridge'` resolves to this driver via the `ClassFactory`. Implements the
  four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` / `SendMedia` / `OnMedia`) and the
  capability-gated virtuals Webex supports (`GetParticipants`, `OnParticipantChange`), plus
  `GetMeetingControlsEventSource` for the facilitator channel and a `PostChatMessage` helper.
- **`IWebexMeetingSdk`** — the **injectable seam** the driver depends on instead of the real SDK.
- **`WebexMeetingControlsEventSource`** — adapts the seam's roster / hand-raise / speaking / mute into
  the bridge's `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the Cisco Webex seed row)

| Capability | Status |
|---|---|
| On-demand + scheduled + invite join | ✅ |
| Inbound routing | ✅ |
| Audio in / out | ✅ |
| Video in/out, Screen in/out (directional flags) | ✅ (transport carries them; models light audio first) |
| Speaker diarization (roster + per-speaker labels) | ✅ |
| Participant mute (Meeting Controls) | ✅ |
| Webex meeting chat | ✅ |
| Native raised-hand | ⚠️ Partial — wired where the Meetings SDK surfaces it; tolerant of it never firing |
| DTMF / call transfer / recording | ➖ not Webex-meeting features here — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

### Webex vs. Zoom capability differences

Webex advertises everything Zoom does, **plus** `InviteJoin` and `InboundRouting` (the calendar-invite /
inbound-routing UX), and its native raised-hand is **partial** rather than fully reliable. Unlike Teams,
Webex does **not** advertise `NativeInvite`. Everything else (audio in/out, directional video/screen,
diarized roster, mute, meeting chat) maps one-to-one onto the Zoom reference driver.

## The Cisco Webex Meetings SDK seam (`IWebexMeetingSdk`)

The driver never imports the real Webex SDK. It depends only on this minimal interface, named after
Cisco Webex Meetings SDK / xAPI / Webex bot concepts:

```typescript
export interface IWebexMeetingSdk {
    join(args: WebexJoinArgs): Promise<WebexJoinResult>;
    leave(): Promise<void>;
    sendAudioFrame(pcm: ArrayBuffer): void;                                 // agent's voice out (outbound audio track)
    onAudioFrame(cb: (frame: WebexAudioFrame) => void): void;               // raw per-participant audio in (diarization)
    onParticipantJoin(cb: (p: WebexParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    onHandRaise(cb: (id: string, raised: boolean) => void): void;           // ⚠️ partial on Webex
    getParticipants(): Promise<WebexParticipant[]>;
    postChatMessage(text: string): Promise<void>;                           // Webex meeting space chat
    muteParticipant(participantId: string): Promise<void>;
    onMeetingEnded(cb: () => void): void;
}
```

### Production binding (deployment TODO)

In production this is bound to the **Cisco Webex Meetings SDK** (the embedded-app / Web / mobile Meetings
SDK that joins the meeting and exposes media + the `members` roster) together with the **Webex bot
framework** (Webex Messaging API for the in-meeting space chat) and, where a Webex room device is involved,
the **xAPI** for participant actions. Supply a factory via the creation seam:

```typescript
import { WebexBridge } from '@memberjunction/ai-bridge-webex';

// Once, where bridge drivers are configured:
//   bridge.SetSdkFactory((config) => new RealWebexSdkAdapter(config));
// The adapter implements IWebexMeetingSdk over the real Webex SDK. The driver + its tests do not change.
```

Out of the box, `WebexBridge` ships **without** the real SDK adapter — `Connect` throws an explicit
"bind the real Cisco Webex SDK" error until `SetSdkFactory` is called. Tests inject a `FakeWebexSdk`.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected
`IRealtimeSession`, and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeWebexSdk` (in `src/__tests__/`) is an in-memory `IWebexMeetingSdk` with drive helpers and capture
sinks. The suite covers connect/disconnect (incl. parsing the meeting number out of the join link),
audio in→`OnMedia` (speaker labels) and out→seam, participant join/leave → roster + event source, native
hand-raise → Meeting Controls perception, capability gating (a feature Webex lacks throws), and chat — all
with no network.

```bash
cd packages/AI/Providers/BridgeWebex && npm run test
```
