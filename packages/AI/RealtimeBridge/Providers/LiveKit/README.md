# @memberjunction/ai-bridge-livekit

The **LiveKit** Realtime Bridge driver — the **MJ-native multi-party room**. Unlike every other bridge
in MemberJunction's Realtime Bridges program (which connect **out** to a 3rd-party meeting platform like
Zoom/Teams/Meet or a telephony carrier), LiveKit is a **self-hosted WebRTC SFU that MJ runs itself**. The
architecture treats a Zoom meeting and an MJ-native LiveKit room **identically** — both are multi-party
media transports — so this is "*another bridge, not a special build.*"

It connects the one realtime agent engine to a **LiveKit room** as a bot participant: bidirectional
audio (and full video/screen), a per-participant diarized roster, room-admin mute, data-channel chat, and
a **Meeting Controls** facilitator channel — all behind an injectable LiveKit room SDK seam so the driver
builds and unit-tests with **no network and no real LiveKit SDK**.

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§4c multi-party / MJ-native room, §3 provider abstraction, §4b channels) for the full architecture.

## Install

```bash
npm install @memberjunction/ai-bridge-livekit
```

## Self-hosted vs. connecting out

| | The other bridges (Zoom, Teams, Meet, Webex, Slack, Discord, Twilio…) | **LiveKit (this package)** |
|---|---|---|
| Who owns the room | a 3rd-party platform | **MJ — self-hosted SFU** |
| How you join | a join URL / number you were handed | a room URL + a **token MJ mints** |
| Bot admission | per-platform review/quirks | none — MJ controls the room |
| Use case | meet the customer where they already are | an MJ-native multi-party experience (e.g. embedded in Explorer) |

The same multi-party machinery (§4c) works either way: put **1+ agents into a shared room** and the room
itself is the shared media plane.

## What it provides

- **`LiveKitBridge`** — `@RegisterClass(BaseRealtimeBridge, 'LiveKitBridge')`. The `MJ: AI Bridge
  Providers` row with `DriverClass = 'LiveKitBridge'` resolves to this driver via the `ClassFactory`.
  Implements the four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` / `SendMedia` / `OnMedia`)
  and the capability-gated virtuals LiveKit supports (`GetParticipants`, `OnParticipantChange`), plus
  `GetMeetingControlsEventSource` for the facilitator channel and a `SendDataMessage` helper.
- **`ILiveKitRoomSdk`** — the **injectable seam** the driver depends on instead of the real SDK.
- **`LiveKitMeetingControlsEventSource`** — adapts the seam's roster / speaking / mute into the bridge's
  `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the LiveKit seed row)

| Capability | Status |
|---|---|
| On-demand join | ✅ |
| Audio in / out | ✅ |
| Video in / out | ✅ (LiveKit does full A/V) |
| Screen in / out | ✅ (full screen share) |
| Speaker diarization (per-participant tracks → labels) | ✅ — **native**, the SFU delivers tracks per participant |
| Room-admin mute (Meeting Controls) | ✅ |
| Data-channel chat | ✅ |
| Scheduled / invite / native-invite join, DTMF / transfer / recording | ➖ not LiveKit-room features — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

## The LiveKit room SDK seam (`ILiveKitRoomSdk`)

The driver never imports the real LiveKit SDK. It depends only on this minimal interface:

```typescript
export interface ILiveKitRoomSdk {
    connect(args: LiveKitConnectArgs): Promise<LiveKitConnectResult>;       // roomUrl + signed token → join as bot
    disconnect(): Promise<void>;
    publishAudioFrame(pcm: ArrayBuffer): void;                              // agent's voice out
    onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void;            // per-participant audio in (diarization)
    publishVideoFrame(frame: ArrayBuffer): void;                            // full video out
    publishScreenFrame(frame: ArrayBuffer): void;                           // full screen share out
    onParticipantJoin(cb: (p: LiveKitParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    getParticipants(): Promise<LiveKitParticipant[]>;
    sendDataMessage(text: string): Promise<void>;                           // data-channel chat
    onDisconnected(cb: () => void): void;
}
```

**Native binding:** this package ships **`LiveKitNativeMeetingSdk`** (`livekit-native-sdk.ts`) — the
two-way adapter over the LiveKit room client, activated with `bridge.SetSdkFactory(BindLiveKitNative())`
(auto-bound by the engine as the registered default for `DriverClass = 'LiveKitBridge'`). It's the MJ-side
adapter, unit-tested against a fake module; none of the SDK types leak into this package.

**The real room client now ships too:** [`@memberjunction/ai-bridge-livekit-native`](../LiveKitNative)
wraps `@livekit/rtc-node` behind this adapter's `NativeRoomModule` contract. The LiveKit coordinator points
`NativeModuleSpecifier` at it by default (overridable via the `LIVEKIT_NATIVE_MODULE` env), so a deployment
just needs to `npm install @livekit/rtc-node` on the agent host. Until a module is configured, `connect`
throws an explicit "load the native LiveKit module" error.

LiveKit is the recommended **internal proving ground** (pair with the `mj-livekit-room` Explorer tab or the
LiveKit Agents Playground) — see
[`plans/realtime/native-bridge-buildout-plan.md`](../../../../plans/realtime/native-bridge-buildout-plan.md) §6.

## Echo / self-audio

A LiveKit SFU **never delivers a participant its own published track back** — the bot does not hear its
own voice, so no echo gate is needed. This is exactly the property the multi-party model relies on
(§4c): each agent in a room hears the *others'* mix natively, never itself, so two agents can converse
without a transcript-relay hack.

## Usage

```typescript
import { LiveKitBridge } from '@memberjunction/ai-bridge-livekit';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';

// The engine resolves the driver by DriverClass via the ClassFactory; you do not new it up directly.
// In production, bind the real SDK factory once at boot:
//   (resolved per provider config) — LiveKitBridge instances call SetSdkFactory with a real adapter.

const active = await AIBridgeEngine.Instance.StartBridgeSession({
    AgentSessionID: sessionId,
    Provider: liveKitProvider,            // MJ: AI Bridge Providers row, DriverClass='LiveKitBridge'
    RealtimeSession: realtimeSession,     // injected IRealtimeSession
    Address: 'wss://livekit.myorg.com',   // the MJ-native room server
    Configuration: { AccessToken: signedToken, BotDisplayName: 'Sage' },
    MetadataProvider: provider,
    ContextUser: user,
});
```

For multiple agents in one LiveKit room, register each session with the engine's room coordinator — see
the [Multi-party section of the guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
`MultiAgentRoomCoordinator` in `@memberjunction/ai-bridge-server`.

## Testing

`FakeLiveKitRoomSdk` (in the test file) implements `ILiveKitRoomSdk` in memory with drive helpers and
capture sinks — connect/disconnect, audio in→`OnMedia` (speaker labels) + out→track, video/screen out,
participant join/leave→roster, speaking attribution, data-channel chat, and capability gating. **24
tests, no network.** Run with `npm test`.

## License

ISC
