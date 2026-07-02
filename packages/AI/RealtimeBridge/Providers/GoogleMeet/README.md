# @memberjunction/ai-bridge-googlemeet

The **Google Meet** Realtime Bridge driver in MemberJunction's Realtime Bridges program. It connects
the one realtime agent engine to a **Google Meet conference**: bidirectional audio, a diarized
participant roster, participant mute, and a **Meeting Controls** facilitator channel — all behind an
injectable Google Meet Media API seam so the driver builds and unit-tests with **no network and no real
Google Meet client**.

> ### ⚠️ Early-access / allowlist caveat
> Unlike Zoom's broadly-available Meeting SDK, the **Google Meet Media API is early-access and
> allowlisted** — a Google Workspace tenant must be explicitly granted access before the agent bot can
> pull/push real-time media. This package ships the driver and its seam; the **production binding to the
> real Media API is a deployment concern gated on that allowlist**. Out of the box, `Connect` throws an
> explicit "bind the real Google Meet Media API" error until `SetSdkFactory` is called.

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§3 provider abstraction, §4b channels, §8 Google Meet capability row) for the full architecture. The
[`@memberjunction/ai-bridge-zoom`](../BridgeZoom/README.md) driver is the reference this one mirrors.

## Install

```bash
npm install @memberjunction/ai-bridge-googlemeet
```

## What it provides

- **`GoogleMeetBridge`** — `@RegisterClass(BaseRealtimeBridge, 'GoogleMeetBridge')`. The
  `MJ: AI Bridge Providers` row with `DriverClass = 'GoogleMeetBridge'` resolves to this driver via the
  `ClassFactory`. Implements the four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` /
  `SendMedia` / `OnMedia`) and the capability-gated virtuals Meet supports (`GetParticipants`,
  `OnParticipantChange`), plus `GetMeetingControlsEventSource` for the facilitator channel.
- **`IGoogleMeetSdk`** — the **injectable seam** the driver depends on instead of the real Media API.
- **`GoogleMeetMeetingControlsEventSource`** — adapts the seam's roster / speaking / mute into the
  bridge's `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the Google Meet seed row)

| Capability | Status |
|---|---|
| On-demand + scheduled join | ✅ (⚠️ on-demand/scheduled joins need Workspace verification) |
| Invite join, inbound routing | ✅ (⚠️ inbound routing) |
| Audio in / out | ✅ |
| Video in/out, Screen in/out (directional flags) | ✅ (transport carries them; models light audio first) |
| Speaker diarization (roster + per-speaker labels) | ✅ (⚠️ early-access) |
| Participant mute (Meeting Controls) | ✅ (where the tenant tier / allowlist grants it) |
| **Hand-raise** | ➖ **not offered** — the Meet Media API surfaces no hand-raise signal (see below) |
| In-meeting chat | ⚠️ not exposed by the Media API — no `postChatMessage` path |
| DTMF / call transfer / recording | ➖ not Meet features — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

### How Meet's missing hand-raise (➖) is handled

The Google Meet Media API exposes **no participant hand-raise/lower signal**. So, unlike `ZoomBridge`:

- **`IGoogleMeetSdk` has no `onHandRaise` operation** — there is nothing to subscribe to.
- **`GoogleMeetBridge` wires no hand-raise subscription** in `Connect`.
- **`GoogleMeetMeetingControlsEventSource` has no `IngestHandRaise`** — the driver feeds nothing.
- The channel contract (`IBridgeMeetingControlsEventSource`) still **requires** an `OnHandRaiseChange`
  registration, so the source implements it — but for Meet it is a **registered-but-never-fired no-op**.
  The hand-raise *queue* facet of the facilitator is therefore inert on Meet; roster, speaking, and mute
  remain fully functional.

A dedicated test (`hand-raise correctly absent`) pins this down: it asserts the seam exposes no
`onHandRaise` op and that driving every signal Meet *does* surface (roster churn, speaking, mute) never
synthesizes a hand-raise event. (For the same reason — no chat path — the Hybrid "raise hand via chat"
turn-taking mode degrades to plain passive on Meet, by design.)

## The Google Meet Media API seam (`IGoogleMeetSdk`)

The driver never imports the real Google Meet client. It depends only on this minimal interface
(note: **no `onHandRaise`, no `postChatMessage`** vs. the Zoom seam):

```typescript
export interface IGoogleMeetSdk {
    join(args: GoogleMeetJoinArgs): Promise<GoogleMeetJoinResult>;
    leave(): Promise<void>;
    sendAudioFrame(pcm: ArrayBuffer): void;                                  // agent's voice out (audio contribution)
    onAudioFrame(cb: (frame: GoogleMeetAudioFrame) => void): void;           // raw per-participant audio in (diarization)
    onParticipantJoin(cb: (p: GoogleMeetParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    getParticipants(): Promise<GoogleMeetParticipant[]>;
    muteParticipant(participantId: string): Promise<void>;                   // where tenant/allowlist grants it
    onMeetingEnded(cb: () => void): void;
}
```

### Production binding (deployment TODO, gated on the allowlist)

In production this is bound to the **Google Meet Media API** client (the allowlisted participating-client
build) for per-participant PCM audio. Supply a factory via the creation seam:

```typescript
import { GoogleMeetBridge } from '@memberjunction/ai-bridge-googlemeet';

// Once, where bridge drivers are configured:
//   bridge.SetSdkFactory((config) => new RealGoogleMeetSdkAdapter(config));
// The adapter implements IGoogleMeetSdk over the real Media API. The driver + its tests do not change.
```

Out of the box, `GoogleMeetBridge` ships **without** the real adapter — `Connect` throws an explicit
"bind the real Google Meet Media API" error until `SetSdkFactory` is called. Tests inject a
`FakeGoogleMeetSdk`.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected
`IRealtimeSession`, and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeGoogleMeetSdk` (in `src/__tests__/`) is an in-memory `IGoogleMeetSdk` with drive helpers and
capture sinks. The suite covers connect/disconnect, audio in→`OnMedia` (speaker labels) and out→seam,
participant join/leave → roster + event source, **the correctly-absent hand-raise path**, capability
gating (a feature Meet lacks throws), and mute — all with no network.

```bash
cd packages/AI/Providers/BridgeGoogleMeet && npm run test
```
