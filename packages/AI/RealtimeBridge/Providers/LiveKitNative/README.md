# @memberjunction/ai-bridge-livekit-native

The **real native LiveKit room client** for the MemberJunction LiveKit Realtime Bridge — the piece that
makes an agent **talk, hear and see** in a live LiveKit room, and show its avatar there. It wraps
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
- **Seeing in** — while the agent watches the meeting, the client reads the cameras and shared screens of people who
  let agents see them, picks which ones the model sees, and hands it sampled JPEG frames at the session's frame rate
  ([Participant video](#participant-video-seeing-in)). By default, frames are encoded on a worker thread of their own
  ([Encode worker](#encode-worker)).
- **Avatar out** — the agent's live avatar (fragmented MP4 from the model) is decoded with ffmpeg and published as the
  bot's camera track, in step with its voice ([The agent's avatar](#the-agents-avatar-video-out)).
- **Roster + chat** — participant connect/disconnect events and the reliable data channel.

The avatar outlet is the only video out: the client publishes no raw video frames and no screen share.

## Use it

Point the bridge's `NativeModuleSpecifier` straight at this package and the engine does the rest (the
LiveKit native binding is the registered default for `DriverClass = 'LiveKitBridge'`):

```jsonc
// the session Configuration the LiveKit coordinator passes to the bridge:
{
  "NativeModuleSpecifier": "@memberjunction/ai-bridge-livekit-native",
  "AccessToken": "<pre-signed LiveKit join token, minted upstream>",
  "BotDisplayName": "Sage",
  "RoomName": "demo-room",
  "AgentVision": true   // true when the agent watches the meeting (see "Participant video")
}
```

Install the addon on the server that runs the agent bot:

```bash
npm install @livekit/rtc-node    # native addon — the agent bot host needs it
```

`@livekit/rtc-node` is an **`optionalDependency`** loaded lazily, so this package **builds and unit-tests
without the addon** (tests inject a fake module). When the addon is absent at runtime, `connect()` throws an
actionable "install `@livekit/rtc-node`" error.

To show the agent's avatar, that host also needs ffmpeg ([The agent's avatar](#the-agents-avatar-video-out)).

## Participant video (seeing in)

The client reads video only when it is created with video options (`NativeRoomClientOptions.Video`), which
`LiveKitNativeMeetingSdk` passes while the agent watches the meeting; the
[LiveKit README](../LiveKit/README.md#cameras-and-screens-in) lists the `Configuration` keys behind them. In every
meeting, watching or not, each video track the bot does not read is unsubscribed as it arrives: the bot joins with
`autoSubscribe` for its hearing, so every track arrives subscribed.

**Who may be read.** A remote participant whose `mj.agentCanSee` attribute is `'true'` (any other value means no), with
an unmuted camera or screen share of a kind the provider allows. Agents (identities starting with `agent-`) are never
read, so neither the bot's own avatar nor another agent's reaches the model. Consent is checked before a frame goes to
the encoder and again when its JPEG returns, so an opt-out during an encode drops that frame.

**Which source the model sees.** `RoomVideoWatcher` reads as many sources at once as the session takes
(`InboundVideoStreams`), at most one camera and one screen per person, ranked best first:

1. shared screens, the most recently shared first;
2. the camera of whoever leads LiveKit's active-speaker list, once they have led for 1.5 s;
3. the camera already in view;
4. the camera of whoever spoke last;
5. the first camera in room order (participants in join order, their tracks in publish order).

A camera stays in view for 4 s from its first frame before another camera may replace it. A new shared screen, a
withdrawn consent, a person leaving, an unpublished or muted track and an ended stream never wait. The bot itself and
other agents never count as speakers. The ranking runs on every room event that can change it and on each active-speaker
update; when the hold delays a change, one `unref`'d timer runs it again when the change falls due. The bridge
`Configuration` keys `VideoSpeakerOnsetMs` and `VideoSpeakerHoldMs` override the two times.

**Switching.** A source the ranking drops ends at once: its reader is cancelled, its subscription dropped, and, if it
sent a frame, it is reported ended (`onVideoSourceEnded`), so the engine can tell the model. The new source is subscribed
and read when its track arrives, or at once when it has just arrived. A source LiveKit refused or unsubscribed, or whose
stream ended or failed, is passed over for 10 s (`PASSED_OVER_MS`), or until it is unmuted or its owner's consent
changes. `disconnect()` reports no source ended.

**Sampling and encoding.** Every frame of a source being read is drained: `@livekit/rtc-node`'s `VideoStream` copies each
one into JavaScript, sampled or not. A frame is encoded only when the session's frame interval has passed since that
source's last sent frame (`InboundVideoRate`; 1 fps when absent) and no earlier frame of the source is still being
encoded; other frames are dropped and counted. The encoder turns the frame upright, scales it so its longer side is at
most 640 px for a camera or 1280 px for a screen (never enlarging), and writes a JPEG at quality 80 with `jpeg-js`. The
bridge `Configuration` keys `VideoCameraMaxDimension`, `VideoScreenMaxDimension` and `VideoJpegQuality` override these.
A frame that fails to encode is logged, and its source waits a full interval.

**Telemetry.** While the agent watches, `GetTelemetry()` on either client also returns `video`:

| Field | Meaning |
|---|---|
| `framesReceived`, `framesSent`, `bytesSent` | Frames drained from the sources being read; frames encoded and handed to the bridge; their JPEG bytes |
| `framesSkippedNotDue`, `framesSkippedEncoding`, `framesDroppedAfterEncode` | Frames dropped: not due yet, the source's previous frame still encoding, or encoded and then dropped (consent withdrawn, the source ended or the bot left meanwhile) |
| `encoder`, `encodeMsLast`, `encodeMsMax` | Where frames are encoded now (`worker` or `in-process`); the encode's own time on the thread that ran it |
| `encodeRoundTripMsLast`, `encodeRoundTripMsMax`, `encodeDispatchMsMax` | From sending a frame to the encoder to its reply, on the room's thread; the room thread's longest cost of sending one (the copy and post, or the whole encode in-process) |
| `encodeInFlight`, `encodeQueueDepth`, `encodeFailures`, `encodeWorkerRestarts` | This room's frames being encoded; frames waiting on this thread's encode worker from every room; frames that failed to encode; encode worker failures on this thread |
| `selectedSources`, `sourceSwitches`, `switchesHeld`, `activeSpeakerUpdates` | Sources selected now; sources the ranking replaced while they could still be read (ends not counted); changes the hold delayed; active-speaker updates LiveKit sent |
| `switchGapMsLast`, `switchGapMsMax` | From picking a source to its first frame reaching the bridge: how long the model saw nothing after a switch |

## Encode worker

Scaling, rotation and the JPEG run on a worker thread of their own, off the thread that hosts the room (MJAPI's main
thread, or the media worker).

- **One per thread that hosts rooms.** `VideoEncodeWorkerHost`, a `BaseSingleton` (one per thread), owns one encode
  worker shared by every watching room on that thread. A media worker gets its own, nested in it.
- **Lifecycle.** The first frame starts the worker, so no thread exists where nobody let an agent see them. After 60 s
  with no request and none pending it is stopped; the next frame starts a new one. The worker and its timers are
  `unref`'d.
- **One copy per frame.** On the room's thread a sampled frame is converted to I420 if needed and its planes are copied
  once into a buffer that is transferred to the worker; the SDK's own frame buffer can't be transferred. Draining the
  stream, sampling, the consent checks and that copy stay on the room's thread. The worker never sees whose frame it
  encodes.
- **Failure.** A worker that errors, exits, does not start within 10 s, or leaves a request unanswered for 5 s fails
  the frames it holds and is replaced at the next frame. After 3 failures within 60 s, or when the built worker script
  is missing, frames are encoded in-process for the rest of the process, logged once.
- **Heap cap.** The worker runs with a 128 MB old-generation limit (`VIDEO_ENCODE_WORKER_MAX_OLD_GENERATION_MB`), so a
  runaway ends the worker instead of growing the process.
- **The switch.** On by default for every client `CreateLiveKitRtcNodeModule` builds: the in-process client, the
  worker client's in-process fallback and the media worker's client. `MJ_LIVEKIT_VIDEO_ENCODE_WORKER=off` (also `false` or `0`) on the
  MJAPI host turns it off; the module's `VideoEncodeWorker` option overrides the env in both directions. A
  `LiveKitRtcNodeRoomClient` constructed directly encodes in-process unless given a `VideoEncoder`.

## The agent's avatar (video out)

**Can this host show it?** The module's `describeAvatarVideo()` (`DescribeAvatarVideo`) answers before a meeting
session opens; the room coordinator asks, so a host that can't show the avatar never asks the model for one. It answers
`{ Supported: true }` when `@livekit/rtc-node` loads with its video classes (`VideoSource`, `VideoFrame`,
`LocalVideoTrack`) and ffmpeg is usable; otherwise `Reason: 'decoder-missing'` (no usable ffmpeg) or `'bridged'`
(`@livekit/rtc-node` can't be loaded or can't publish video). ffmpeg is `MJ_FFMPEG_PATH` when set, else `ffmpeg` on the `PATH`, and must be version 4.2 or later
with the `h264` and `aac` decoders. `FfmpegLocator` probes it once per thread (3 s per probe command) and keeps the
answer.

**Publishing.** `publishAvatarMedia(chunk)` hands one piece of the model's fragmented MP4 to an `AvatarPublisher`,
created at the first piece. It reads the pieces with `@memberjunction/ai`'s fMP4 reader and feeds two long-lived ffmpeg
child processes, spawned by the thread that hosts the room: H.264 to I420 frames, and AAC to PCM at the voice track's
rate. A crash ends the child, never MJAPI.

- The voice joins the bot's existing voice queue, so the agent has one audio track.
- The face goes on a camera track named `agent-avatar` (`SOURCE_CAMERA`, LiveKit's default simulcast), published at the
  first decoded frame, so nobody sees a black tile before the agent first speaks.
- The voice is the clock: a frame is shown when the voice's playout reaches the frame's own timestamp. When several are
  due, only the newest is shown; a frame more than 500 ms late is dropped. At most 24 decoded frames wait; then the video
  decoder's output pauses.
- Between turns and after a barge-in the last frame stays on screen. `flushOutbound()` drops the queued frames and
  fences both decoders, so nothing decoded before the barge-in plays.

**Failure.** A decoder that dies is restarted; video resumes at the next key frame. After 3 failures of one decoder within
60 s, or when the room refuses the camera track, the avatar goes audio only: the camera track is unpublished, the bot
sets its `mj.agentAvatar` attribute to `audio-only:decoder-failed` or `audio-only:publish-failed` (its token must allow
`canUpdateOwnMetadata`), and `onAvatarStatus` reports it. The LiveKit bridge passes that to the engine, which replaces
the model session with an audio-only one; that session's first audio retires the publisher. If ffmpeg turns out
unusable on the publisher's own thread, the avatar is taken down as `decoder-failed`.

## Live check for participant video

`scripts/agent-vision-live.mjs` checks the bot reading meeting video against a real LiveKit server. A synthetic person
publishes a camera (or a screen share); the bot under test is built through `CreateLiveKitRtcNodeModule`, as MJAPI
builds it, and consent is set and withdrawn through LiveKit's server API. The run has a baseline before consent (the
bot must read nothing), a measured window after consent, the opt-out, and a settle. It asserts nothing and prints what
it measured: frames before consent, the time to the first frame, frames per second, JPEG sizes and dimensions, the
video telemetry, the main loop's p99 before and during the window, and when the ended source was reported after the
opt-out.

| Variable | Mode |
|---|---|
| `VISION_ENCODER=worker` (default) or `in-process` | Where frames are encoded. |
| `VISION_WORKER_MEDIA=on` | The room runs in the media worker, with its own encode worker; also reports the media worker's p99, outbound underruns and `pacerQueuedMs`. |
| `VISION_CRASH_ENCODER=1` | Kills the encode worker halfway through the window and reports the time to the next frame (only with the encode worker on the main thread). |
| `VISION_SCENARIO=switch` | Two people with cameras; the second talks, then shares a screen, the bot talks, then the share stops. Reports which source the bot read when, each switch and its gap, the active-speaker updates, the switch telemetry and the ended sources. |

Other optional variables: `VISION_DURATION_S` (default 10; the baseline is as long), `VISION_SOURCE=camera|screen`
(default `camera`), `VISION_WIDTH` / `VISION_HEIGHT` (default 1280 x 720), `VISION_FPS` (default 30), `VISION_RATE`
(default 1). Required env vars (names only): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Run
`pnpm run build` first (the script imports `../dist`), then `node scripts/agent-vision-live.mjs`. Like the benchmark
below, it resolves `livekit-server-sdk` from the sibling `@memberjunction/livekit-room-server` package.

## Worker media plane (experimental, opt-in)

**What it does.** With the worker enabled, the LiveKit room I/O runs in a dedicated `worker_threads` Worker
instead of on MJAPI's main event loop: the `@livekit/rtc-node` room, the inbound per-participant audio pumps,
and outbound pacing with a 150 ms pre-buffer. PCM crosses the thread boundary as transferable `ArrayBuffer`s
(no copy). Barge-in `flushOutbound()` is forwarded to the worker and drops its queue and the native source queue.

Participant video is read inside the worker too: the watcher runs there, next to the room's attributes and events, and
frames are encoded on the media worker's own nested encode worker unless the encode worker is off. Each sampled JPEG
crosses to the main thread as a transferred buffer (a `videoFrame` event), and each ended source as a `videoSourceEnded`
event. Avatar pieces are transferred to the worker (`publishAvatarMedia`), which decodes and publishes them; the newest
init segment is copied first, so it can be replayed to a restarted worker.

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
tears the session down. The roster is re-seeded from the room after every rejoin. When the worker dies after joining,
each source it was sending frames of is reported ended, so the model is told. A worker restarted after the avatar was
taken down rejoins audio only and sets the bot's `mj.agentAvatar` attribute again (its join token still says `on`).

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
  `InboundSampleRate`, `Channels`, `Loader` (inject a fake `@livekit/rtc-node` for tests), `VideoEncodeWorker`
  ([Encode worker](#encode-worker)). The module also answers `describeAvatarVideo()`.
- **`LiveKitRtcNodeRoomClient`** — the `NativeRoomClient` implementation (connect / publishAudio /
  onAudioFrame / roster / publishData / disconnect, and onVideoFrame / onVideoSourceEnded / publishAvatarMedia /
  onAvatarStatus). `GetTelemetry()` returns its telemetry. Constructor options: `Video` (what to read), `VideoEncoder`
  (where frames are encoded; in-process by default), `Now` and `Timer` (the clock for pacing and the hold, and the timer
  that runs a delayed ranking; tests inject them), `AvatarStatus` (join with the avatar already taken down) and
  `Avatar` (the ffmpeg probe and decoders; tests pass fakes).
- Pure helpers: `pcmToInt16`, `int16ToArrayBuffer`, `participantsToArray` — unit-tested directly.
- `defaultRtcNodeLoader` — the lazy `@livekit/rtc-node` loader (with the actionable absent-addon error).
- Participant video: `RoomVideoWatcher`, `DropVideoSubscription`, `PASSED_OVER_MS`; `VideoEncodeWorkerHost`,
  `CreateVideoEncodeWorker` and the `VIDEO_ENCODE_*` limits; `IsVideoEncodeWorkerEnabled`; `IRoomVideoFrameEncoder`,
  `InProcessVideoFrameEncoder`, `VideoFrameEncoder` and the defaults `DEFAULT_CAMERA_MAX_DIMENSION`,
  `DEFAULT_SCREEN_MAX_DIMENSION`, `DEFAULT_JPEG_QUALITY`; the pixel functions (`video-frame-pixels.ts`) and the encode
  worker's message types (`video-encode-protocol.ts`).
- The avatar: `DescribeAvatarVideo`, `AvatarPublisher`, `AvatarMediaClock`, `AvatarH264Decoder`, `AvatarAacDecoder`,
  `AvatarDecoderProcess`, `RtcNodeAvatarOutlet`, `FfmpegLocator` (with `MINIMUM_FFMPEG_VERSION` and
  `REQUIRED_FFMPEG_DECODERS`), and the `AVATAR_*` and `FFMPEG_*` constants.
- Telemetry types: `RoomAudioTelemetrySnapshot`, whose `video` is a `RoomVideoTelemetry`.

The two worker entries (the media worker and the encode worker) are not exported: they run on import.

> ⚠️ The exact `@livekit/rtc-node` surface is pinned from the SDK docs and marked with `// VERIFY against
> @livekit/rtc-node` notes in `livekit-rtc-node-room.ts` (Room/AudioSource/AudioStream/AudioFrame ctors,
> `RoomEvent`/`TrackKind` member names, `connect`/`publishData`/`publishTrack` signatures). Video adds more: the
> `VideoStream` reader, the `VideoFrame` layout and rotation, `setSubscribed`, the video event arities, `VideoSource` and
> `LocalVideoTrack` publishing, `unpublishTrack` and `setAttributes`; some of these notes are in `room-video-watcher.ts`
> and `video-frame-pixels.ts`. Live meetings on hosted LiveKit have run the voice, participant video and the avatar's
> publishing through this surface; taking an avatar down (`unpublishTrack`, `setAttributes`) has not run live.

## Testing

```bash
cd packages/AI/RealtimeBridge/Providers/LiveKitNative && npm run test
```

338 tests in 14 files against a **fake `@livekit/rtc-node`** (no addon, no network). Encode workers and ffmpeg
decoders are faked too, except in the tests that start a real worker thread or run the installed ffmpeg:

- the room client (`livekit-rtc-node-room.test.ts`): the pure PCM helpers, the connect→publish-track flow, both audio
  directions (outbound `captureFrame` at the configured rate + inbound `AudioStream`→diarized frame), participant
  events, roster, data publish, disconnect teardown, the sample-rate overrides, no raw video or screen publish, the
  video wiring, and the loader's present/absent branches;
- the media worker client and session (`livekit-worker-room.test.ts`);
- participant video: the watcher (`room-video-watcher.test.ts`), the ranking (`video-source-policy.test.ts`), the
  encoder and the encode worker (`video-frame-encoder.test.ts`, `video-encode-handler.test.ts`,
  `video-encode-worker-host.test.ts`);
- the avatar: `avatar-decoders.test.ts`, `avatar-media-clock.test.ts`, `avatar-publisher.test.ts`,
  `ffmpeg-locator.test.ts`, `livekit-rtc-node-avatar.test.ts`, `livekit-worker-avatar.test.ts` and
  `avatar-pipeline-ffmpeg.test.ts`.

Five are skipped unless their tool is there: four need ffmpeg on the `PATH` (`avatar-pipeline-ffmpeg.test.ts` decodes
the committed lip-sync fixture), and one needs the built encode worker (`npm run build` first).
