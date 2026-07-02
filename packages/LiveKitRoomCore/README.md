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

await room.Connect('wss://livekit.myorg.com', signedToken, { DisplayName: 'Amith' });
await room.ToggleCamera();
await room.SendData('hello', 'lk-chat');
```

## What it gives you

| Capability | API |
|---|---|
| Connect / leave | `Connect(url, token, options)`, `Disconnect()` |
| Local media | `ToggleMicrophone()` / `ToggleCamera()` / `ToggleScreenShare()`, `Set*Enabled()` |
| Devices | `ListDevices(kind)`, `SwitchDevice(kind, id)` |
| Data channel | `SendData(text, topic?)` |
| Audio autoplay unblock | `StartAudio()` + `State.AudioPlaybackBlocked` |
| Krisp noise filter (Cloud) | `SetNoiseFilterEnabled(bool)` |
| Background blur / virtual bg | `SetBackgroundEffect({ Kind: 'blur' \| 'image' \| 'none' })` |
| End-to-end encryption | `Connect(..., { E2EE: { Passphrase, Worker } })` |
| PreJoin preview (room-free) | `LiveKitMediaPreview` |
| Audio visualizer math | `LiveKitAudioMeter` |

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

ISC © MemberJunction.com
