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

## Worker media plane (experimental, opt-in)

**What it does.** With the worker enabled, the LiveKit room I/O runs in a dedicated `worker_threads` Worker
instead of on MJAPI's main event loop: the `@livekit/rtc-node` room, the inbound per-participant audio pumps,
and outbound pacing with a 150 ms pre-buffer. PCM crosses the thread boundary as transferable `ArrayBuffer`s
(no copy). Barge-in `flushOutbound()` is forwarded to the worker and drops its queue and the native source queue.

**What it does NOT do (yet).** The model WebSocket transport (Gemini Live / OpenAI realtime sockets, JSON
framing, base64 encode/decode) still runs on the main thread, so model audio still crosses the main loop. See
[`plans/realtime/livekit-worker-model-transport.md`](../../../../../plans/realtime/livekit-worker-model-transport.md).

**Enable / disable.** OFF by default. Set `MJ_LIVEKIT_WORKER_MEDIA=on` (also `true` or `1`) on the MJAPI host, or pass
`UseWorker: true` to `CreateLiveKitRtcNodeModule`. `UseWorker` overrides the env var in both directions. Any other
env value means in-process. A custom `Loader` implies in-process (a function cannot cross the thread boundary)
unless `UseWorker` is set explicitly.

**Fallback.** If the worker cannot be spawned, errors or exits before the room is joined, or does not join within
20 s (`connectTimeoutMs`), the client logs once and falls back to the in-process client. A join error reported by
LiveKit itself (e.g. a bad token) is rethrown, not retried in-process.

**Crash handling.** If the worker dies after joining, the client marks itself disconnected immediately, then
restarts it up to 3 times with exponential backoff (250 ms doubling to 5 s). The restart counter resets only after
60 s of healthy connection. A rejoin reuses the original join token and is only attempted while that token is
younger than 10 minutes (`maxRejoinTokenAgeMs`). A rejected rejoin is terminal. When restarts are exhausted, the
rejoin is rejected, or the token is too old, the disconnected callback is raised once with a reason so the bridge
tears the session down. The roster is re-seeded from the room after every rejoin.

**Telemetry.** `GetTelemetry()` returns the latest snapshot (refreshed every second while connected);
`RefreshTelemetry()` requests a fresh one from the worker.

| Field | Meaning |
|---|---|
| `inboundGaps[identity]` | Inter-frame gap histogram (`lt10ms` ... `gte100ms`) for that participant, measured on the media thread since connect |
| `outbound.captureCount`, `underrunCount`, `lastQueuedDuration` | Frames captured, queue-starved underruns, audio currently buffered in the native source |
| `pacerQueuedMs` | Audio waiting in the worker's pacing queue |
| `mainEventLoopDelayP99Ms` | p99 event-loop delay of MJAPI's main thread |
| `workerEventLoopDelayP99Ms` | p99 event-loop delay of the media worker thread |

*Diagnosing choppy audio:* many inbound gaps of 50 ms or more (`b50_100ms`, `gte100ms`) together with a high main-thread p99
points at main-loop contention; try the worker. Inbound gaps are clean but the agent still sounds choppy: look at
`outbound.underrunCount` and `pacerQueuedMs` (the model is delivering audio late, which the worker cannot fix). A high worker p99 means the
media thread itself is starved (CPU), not the main loop.

**Benchmark.** `scripts/worker-meet-live-benchmark.mjs` (`pnpm run bench:live`, after `pnpm run build`) compares in-process vs
worker against a real LiveKit server. A simulated human publishes a 20 ms-framed tone; the bot under test subscribes and pushes
model-style outbound bursts, with synthetic JSON load on the main thread. Required env vars (names only):
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; optional `BENCH_DURATION_S`, `BENCH_LOAD=off`, `BENCH_SKIP_CRASH=1`.
It needs `livekit-server-sdk`, resolved from the sibling `@memberjunction/livekit-room-server` package. Output per mode:
inbound gap histogram as seen by the main-thread callback and by the media thread, outbound captures/underruns/queue
depth, main and worker p99, and (worker mode) measured time to first frame after a deliberate worker kill.

**Measured result.** On a local LiveKit server with synthetic main-thread load, both modes showed no inbound gaps over 30 ms
(max about 20 ms in-process, about 17 ms worker), 0 outbound underruns, and the same main-thread p99 (the synthetic load dominates it).
The main-thread relay is therefore not the bottleneck at this scale, which is why the worker is off by default. Worker crash
recovery was observed (one respawn, first frame back after about 0.56 s).

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
