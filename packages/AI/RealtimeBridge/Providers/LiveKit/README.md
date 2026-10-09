# @memberjunction/ai-bridge-livekit

The **LiveKit** Realtime Bridge driver — the **MJ-native multi-party room**. Unlike every other bridge
in MemberJunction's Realtime Bridges program (which connect **out** to a 3rd-party meeting platform like
Zoom/Teams/Meet or a telephony carrier), LiveKit is a **self-hosted WebRTC SFU that MJ runs itself**. The
architecture treats a Zoom meeting and an MJ-native LiveKit room **identically** — both are multi-party
media transports — so this is "*another bridge, not a special build.*"

It connects the one realtime agent engine to a **LiveKit room** as a bot participant: bidirectional
audio, the cameras and shared screens of people who let agents see them, the agent's avatar as its only video out, a
per-participant diarized roster, room-admin mute, data-channel chat, and a **Meeting Controls** facilitator channel —
all behind an injectable LiveKit room SDK seam so the driver builds and unit-tests with **no network and no real
LiveKit SDK**.

See the [Realtime Bridges Guide](../../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../../plans/realtime/realtime-bridges-architecture.md)
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
  `GetMeetingControlsEventSource` for the facilitator channel, the video hooks `OnVideoSourceEnded` and
  `OnAvatarUnavailable`, and a `SendDataMessage` helper.
- **`ILiveKitRoomSdk`** — the **injectable seam** the driver depends on instead of the real SDK.
- **`LiveKitMeetingControlsEventSource`** — adapts the seam's roster / speaking / mute into the bridge's
  `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the LiveKit seed row)

| Capability | Status |
|---|---|
| On-demand join | ✅ |
| Audio in / out | ✅ |
| Video in (cameras) | ✅ only from people who let agents see them, and only while the agent watches (see [Video](#video)) |
| Screen in | ✅ shared screens, under the same consent and conditions as cameras |
| Video out | ✅ the agent's avatar only, through `publishAvatarMedia`; no raw video frames |
| Screen out | ➖ none: every `screen-out` frame is dropped (the seed row still sets `ScreenOut`) |
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
    flushOutboundAudio(): void;                                             // barge-in: drop the queued voice
    onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void;            // per-participant audio in (diarization)
    onVideoTrack?(cb: (frame: LiveKitVideoFrame) => void): void;           // sampled camera and screen JPEGs in
    onVideoSourceEnded?(cb: (source: LiveKitVideoSourceEnd) => void): void; // a camera or screen stopped being read
    publishAvatarMedia?(chunk: LiveKitAvatarMediaChunk): void;             // the agent's avatar: the only video out
    onAvatarStatus?(cb: (status: LiveKitAvatarStatus) => void): void;      // avatar published, or taken down
    onParticipantJoin(cb: (p: LiveKitParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    getParticipants(): Promise<LiveKitParticipant[]>;
    sendDataMessage(text: string): Promise<void>;                           // data-channel chat
    onDisconnected(cb: (reason?: string) => void): void;
}
```

The video and avatar members are optional: an SDK without them carries audio only. The seam has no raw video or
screen-share publish.

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
[`plans/complete/realtime/native-bridge-buildout-plan.md`](../../../../../plans/complete/realtime/native-bridge-buildout-plan.md) §6.

## Echo / self-audio

A LiveKit SFU **never delivers a participant its own published track back** — the bot does not hear its
own voice, so no echo gate is needed. This is exactly the property the multi-party model relies on
(§4c): each agent in a room hears the *others'* mix natively, never itself, so two agents can converse
without a transcript-relay hack.

## Video

### Cameras and screens in

The bot reads video only while the agent watches the meeting. `LiveKitNativeMeetingSdk` gives the room client video
options (`NativeVideoOptionsFor`) only when the session `Configuration` has `AgentVision: true`, `InboundVideoStreams`
above `0`, and the provider allows cameras (`VideoIn`) or shared screens (`ScreenIn`); the bridge adds both flags to the
configuration. The native room client then reads only people whose `mj.agentCanSee` attribute is `'true'`, never another
agent (`IsAgentParticipantIdentity`: identities starting with `agent-`), and picks which source the model sees; see
[`@memberjunction/ai-bridge-livekit-native`](../LiveKitNative).

| `Configuration` key | Set by | Meaning |
|---|---|---|
| `AgentVision` | the room coordinator | The agent watches: its `realtime.video.watchMeetings` setting is on and its session takes video. |
| `InboundVideoStreams` | the engine, from the model | How many sources the model takes at once. |
| `InboundVideoRate` | the engine, from the model | Frames per second per source. Absent: 1. |
| `VideoCameraMaxDimension` | an optional override | Cap on a camera frame's longer side, in pixels. Default 640. |
| `VideoScreenMaxDimension` | an optional override | Cap on a screen frame's longer side, in pixels. Default 1280. |
| `VideoJpegQuality` | an optional override | JPEG quality, 1 to 100. Default 80. |
| `VideoSpeakerOnsetMs` | an optional override | How long a person must lead the room's active-speaker list before the view moves to their camera. Default 1500. |
| `VideoSpeakerHoldMs` | an optional override | How long a camera stays in view, from its first frame, before another camera may replace it. Default 4000. |

Each frame reaches the engine as `video-in` (a camera) or `screen-in` (a shared screen), carrying:

- `MimeType` `image/jpeg`, the image's `Width` and `Height`, and `KeyFrame: true` (a JPEG decodes on its own);
- a `SourceID` that stays the same per person and kind, `participant:<identity>:camera` or `:screen` (`VideoSourceIdOf`);
- a `SourceLabel` for the model: "Ada's camera", or "a participant's screen" when the person has no display name
  (`VideoSourceLabelOf`).

The bridge checks `VideoIn` or `ScreenIn` again on every frame. When the room client stops reading a source, including
when it moves the model's view to another source, the bridge reports it through `OnVideoSourceEnded` with the same key
and label, so the engine can tell the model.

### Video out: the agent's avatar only

On `video-out`, a frame whose MIME type is `video/mp4` (`IsAvatarMediaFrame`) goes to `publishAvatarMedia` when the
provider allows `VideoOut`: the room client decodes the piece and shows the agent's face on a camera track, in step with
its voice. Any other `video-out` frame, and every `screen-out` frame, is dropped, since the room has no publisher for it.
When the provider allows that track, the first drop of each per session is logged, naming the frame's MIME type on
`video-out`. When the room client takes the avatar down (`onAvatarStatus` with a reason), the bridge reports it through
`OnAvatarUnavailable`, so the engine can replace the model session with an audio-only one.

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
the [Multi-party section of the guide](../../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
`MultiAgentRoomCoordinator` in `@memberjunction/ai-bridge-server`.

## Testing

`FakeLiveKitRoomSdk` (in `livekit-bridge.test.ts`) implements `ILiveKitRoomSdk` in memory with drive helpers and
capture sinks — connect/disconnect, audio in→`OnMedia` (speaker labels) + out→track, camera and screen frames in and
their ended sources, the avatar out and the dropped raw video and screen frames, participant join/leave→roster, speaking
attribution, data-channel chat, and capability gating. `livekit-native-sdk.test.ts` tests `LiveKitNativeMeetingSdk`
against a fake native room client. **76 tests in two files, no network.** Run with `npm test`.

## License

Business Source License 1.1 — see [LICENSE](../../../../../LICENSE) for details.
