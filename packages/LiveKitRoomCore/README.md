# @memberjunction/livekit-room-core

Framework-agnostic, pure-TypeScript core for the MJ-native realtime room UX. It wraps
[`livekit-client`](https://www.npmjs.com/package/livekit-client) into a single observable room controller
with a deep, **cancelable** event model — consumable from any framework (Angular, React, Vue) or plain TS.

This is **Layer A's engine** in the LiveKit room stack:

```
@memberjunction/livekit-room-core   ← you are here (pure TS, no UI)
        ▲
@memberjunction/ng-livekit-room      (portable Angular UI)
        ▲
@memberjunction/ng-mj-livekit-room   (MJ binding → realtime bridge)
```

## Why a core package?

The room logic — connect/disconnect, participant + track tracking, active speakers, audio metering,
device control, data-channel messages, cloud effects, E2EE — has nothing to do with Angular. Keeping it
here means the Angular widget (and any future React binding) is a thin view over a tested engine, and the
logic unit-tests with **no WebRTC, no browser, no network** via an injectable `Room` factory seam.

## Install

```bash
npm install @memberjunction/livekit-room-core livekit-client
# optional cloud effects:
npm install @livekit/krisp-noise-filter @livekit/track-processors
```

## Quick start

```typescript
import { LiveKitRoomController } from '@memberjunction/livekit-room-core';

const room = new LiveKitRoomController();

// Render from the observable snapshot
room.State$.subscribe((state) => renderParticipants(state.Remote));

// Cancelable Before-events (veto an action)
room.Events.On('beforeDisconnect', (e) => {
    if (!confirm('Leave the call?')) e.Cancel = true;
});

// Transform an outgoing chat message
room.Events.On('beforeSendData', (e) => { e.Text = e.Text.trim(); });

await room.Connect('wss://livekit.myorg.com', signedToken, { DisplayName: 'Jordan' });
await room.ToggleCamera();
await room.SendData('hello', 'lk-chat');
```

## What it gives you

| Capability | API |
|---|---|
| Connect / leave | `Connect(url, token, options)`, `Disconnect()` |
| Local media | `ToggleMicrophone()` / `ToggleCamera()` / `ToggleScreenShare()`, `Set*Enabled()` |
| Screen share, including one panel of the page | `SetScreenShareEnabled(true, request?)`, `ChangeScreenShare(request?)`, `State.LocalMedia.ScreenSharePanelLabel` (see below) |
| An agent's avatar | `ToMediaParticipant`, `LiveKitParticipantView.AvatarAudioOnly` (see below) |
| Devices | `ListDevices(kind)`, `SwitchDevice(kind, id)` |
| Data channel | `SendData(text, topic?)` |
| Audio autoplay unblock | `StartAudio()` + `State.AudioPlaybackBlocked` |
| Krisp noise filter (Cloud) | `SetNoiseFilterEnabled(bool)` |
| Background blur / virtual bg | `SetBackgroundEffect({ Kind: 'blur' \| 'image' \| 'none' })` |
| End-to-end encryption | `Connect(..., { E2EE: { Passphrase, Worker } })` |
| PreJoin preview (room-free) | `LiveKitMediaPreview` |
| Audio visualizer math | `LiveKitAudioMeter` |

## Screen share

The controller shares through display capture (`RequestDisplayCapture` in `@memberjunction/ai-realtime-client/media`),
not LiveKit's own capture, and publishes the shared track with `publishTrack` as the participant's screen share.

- **What to share.** `SetScreenShareEnabled(true, request)` and `ChangeScreenShare(request)` take the kind of surface the
  browser's picker offers first (`'screen'`, `'window'` or `'tab'`), or `/media`'s `DisplayCaptureOptions`. The options
  can name one element of the page to share alone (`Panel`; Chrome and Edge) and its name (`PanelLabel`). While a
  named panel is shared, `State.LocalMedia.ScreenSharePanelLabel` holds its name.
- **The cap.** The shared track is capped at 1920x1080 and 30 fps, LiveKit's own `ScreenSharePresets.h1080fps30`. These
  are maximums, so a small panel is not upscaled. A browser that refuses them shares at full size.
- **The picker.** Closing it shares nothing and is no error. A share the browser refuses is a `device` error whose
  `Cause` holds the picker's reason. The `RequestScreenShare` constructor option replaces the picker (default
  `RequestDisplayCapture`), so tests can pass a fake.

`ToScreenShareCaptureOptions` is deprecated: nothing in MJ calls it. It stays for code that drives LiveKit's own
`setScreenShareEnabled`.

## An agent's avatar

An agent's bot publishes the agent's avatar as a camera track named `agent-avatar` (`REALTIME_AGENT_AVATAR_TRACK_NAME`
in `@memberjunction/ai`). `ToMediaParticipant` turns an agent's camera track by that name into the participant's avatar
video (`Video.avatar`), so `mj-media-tile` labels it "AI-generated video". A person's track by that name stays a camera.

The bot also sets the `mj.agentAvatar` attribute. When it reads `audio-only:<reason>`, the controller sets
`LiveKitParticipantView.AvatarAudioOnly` on that agent's view, reading the attribute with `ReadAgentAvatarAttribute`
from `@memberjunction/ai`. `AvatarAudioOnly.Reason` is set when the reason is one this version knows. The controller
rebuilds the state on every attribute change, so a change mid-meeting shows at once.

## The cancelable event architecture

`controller.Events` is a typed `LiveKitRoomEventBus`. **Before-events** run synchronously and may be
vetoed (`event.Cancel = true`) or mutated; **notification events** report what happened.

- Cancelable: `beforeConnect`, `beforeDisconnect`, `beforeMediaToggle`, `beforeSendData`, `beforeDeviceSwitch`
- Notifications: `connected`, `disconnected`, `reconnecting`, `reconnected`, `participantJoined`,
  `participantLeft`, `activeSpeakersChanged`, `dataReceived`, `localMediaChanged`, `stateChanged`,
  `audioPlaybackChanged`, `noiseFilterChanged`, `backgroundEffectChanged`, `error`

## Testability

Inject a fake `Room` via the factory seam — no WebRTC needed:

```typescript
const controller = new LiveKitRoomController({ RoomFactory: () => fakeRoom as unknown as Room });
```

See `src/__tests__/` for the in-memory fake used by the package's own 22-test suite.

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
