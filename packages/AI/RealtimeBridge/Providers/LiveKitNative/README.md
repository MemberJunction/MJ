# @memberjunction/ai-bridge-livekit-native

The **real native LiveKit room client** for the MemberJunction LiveKit Realtime Bridge — the piece that
makes an agent actually **talk and hear** in a live LiveKit room. It wraps
[`@livekit/rtc-node`](https://github.com/livekit/node-sdks) (LiveKit's Node WebRTC participant) behind the
`NativeRoomModule` contract that [`@memberjunction/ai-bridge-livekit`](../LiveKit)'s `LiveKitNativeMeetingSdk`
expects.

```
realtime model ──IRealtimeSession──► AIBridgeEngine transport seam ──► LiveKitBridge
                                                                          │ SetSdkFactory(BindLiveKitNative())
                                                                          ▼
                                                            LiveKitNativeMeetingSdk  (the adapter — in ai-bridge-livekit)
                                                                          │ NativeModuleSpecifier
                                                                          ▼
                                                  @memberjunction/ai-bridge-livekit-native  ◄── THIS PACKAGE
                                                                          │
                                                                          ▼
                                                                  @livekit/rtc-node  (the real WebRTC participant)
```

## What it does

- **Voice out** — `publishAudio(pcm)` captures the agent's synthesized PCM onto a published LiveKit audio
  track (`AudioSource` → `LocalAudioTrack`), so every participant hears the agent.
- **Hearing in** — each remote participant's subscribed audio track is read via an `AudioStream` and
  surfaced as a diarized `{ data, participantIdentity, name }` frame.
- **Roster + chat** — participant connect/disconnect events and the reliable data channel.

Video/screen publish are documented one-time-warned **no-ops** in this voice-MVP wrapper (LiveKit supports
them; they need a `VideoSource` + frame-format work that's out of scope here).

## Use it

Point the bridge's `NativeModuleSpecifier` straight at this package and the engine does the rest (the
LiveKit native binding is the registered default for `DriverClass = 'LiveKitBridge'`):

```jsonc
// the session Configuration the LiveKit coordinator passes to the bridge:
{
  "NativeModuleSpecifier": "@memberjunction/ai-bridge-livekit-native",
  "AccessToken": "<pre-signed LiveKit join token, minted upstream>",
  "BotDisplayName": "Sage",
  "RoomName": "demo-room"
}
```

Install the addon on the server that runs the agent bot:

```bash
npm install @livekit/rtc-node    # native addon — the agent bot host needs it
```

`@livekit/rtc-node` is an **`optionalDependency`** loaded lazily, so this package **builds and unit-tests
without the addon** (tests inject a fake module). When the addon is absent at runtime, `connect()` throws an
actionable "install `@livekit/rtc-node`" error.

## 🔴 Sample rates (read this before the live test)

The realtime model emits/consumes PCM at a **specific** rate, and `@livekit/rtc-node` resamples for you
**only if told the right rate**. Defaults are **24 kHz mono** (OpenAI-Realtime-compatible: xAI Grok Voice,
etc.). **Gemini Live wants 16 kHz inbound.** A mismatch produces chipmunk / garbled audio — it is the #1
live-test failure mode, not a logic bug.

To override, write a one-line module and point `NativeModuleSpecifier` at it:

```typescript
// my-livekit-native-gemini.ts
import { CreateLiveKitRtcNodeModule } from '@memberjunction/ai-bridge-livekit-native';
export default CreateLiveKitRtcNodeModule({ InboundSampleRate: 16000, OutboundSampleRate: 24000 });
```

## API

- **`CreateLiveKitRtcNodeModule(opts?)`** → a `NativeRoomModule`. Options: `OutboundSampleRate`,
  `InboundSampleRate`, `Channels`, `Loader` (inject a fake `@livekit/rtc-node` for tests).
- **`LiveKitRtcNodeRoomClient`** — the `NativeRoomClient` implementation (connect / publishAudio /
  onAudioFrame / roster / publishData / disconnect).
- Pure helpers: `pcmToInt16`, `int16ToArrayBuffer`, `participantsToArray` — unit-tested directly.
- `defaultRtcNodeLoader` — the lazy `@livekit/rtc-node` loader (with the actionable absent-addon error).

> ⚠️ The exact `@livekit/rtc-node` surface is pinned from the SDK docs and marked with `// VERIFY against
> @livekit/rtc-node` notes in `livekit-rtc-node-room.ts` (Room/AudioSource/AudioStream/AudioFrame ctors,
> `RoomEvent`/`TrackKind` member names, `connect`/`publishData`/`publishTrack` signatures). A live test
> against a real LiveKit server should confirm them.

## Testing

```bash
cd packages/AI/RealtimeBridge/Providers/LiveKitNative && npm run test
```

14 tests against a **fake `@livekit/rtc-node`** (no addon, no network): the pure PCM helpers, the
connect→publish-track flow, both audio directions (outbound `captureFrame` at the configured rate + inbound
`AudioStream`→diarized frame), participant events, roster, data publish, disconnect teardown, the
sample-rate overrides, the video/screen no-ops, and the loader's present/absent branches.
