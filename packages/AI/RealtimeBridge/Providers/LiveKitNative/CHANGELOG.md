# @memberjunction/ai-bridge-livekit-native

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [0a348e2]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [2274f42]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [72dd65c]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- 7873578: The meeting bot now stops reading a participant's audio when the track is unsubscribed, when the participant leaves, and when the bot leaves the room or the room disconnects. It read each track with `for await`, which locks rtc-node's `AudioStream` (a `ReadableStream` with no `close()`), and tried to stop it with `close?.()`, which did nothing, so each stream kept its native handle and a listener on rtc-node's process-wide event emitter until an end of stream that rtc-node 0.13.29 does not send in those cases. Each stream is now read through a reader the client keeps and cancels; a frame already read when the stream is cancelled is dropped, and no stream opens after the bot leaves. `RtcAudioStream` now describes that reader surface (`getReader()`), so a hand-built `RtcNodeModule`, such as a test fake, must return a stream that has it; rtc-node before 0.13.12, whose `AudioStream` was an async iterator, is no longer read (the client logs that it could not open the stream).
- 1da00cb: An agent can now watch a LiveKit meeting. Set `realtime.video.watchMeetings: true` in the voiced agent's `TypeConfiguration`. When its realtime model takes video (Gemini 3.8 Live), the agent's bot joins with the `mj.agentWatches` attribute, so the room offers each person the choice, and reads the camera or shared screen of the people who allow it: one source at a time, at the model's frame rate, as JPEG (cameras scaled to 640 px on the longer side, screens to 1280 px). When a source whose frames reached the model ends (the person withdraws, leaves, stops sharing or turns the camera off), the model is told "[The agent can no longer see: Ada's camera]". In every meeting the bot now unsubscribes from video it does not read. The frame-rate and scaling math moves to `@memberjunction/ai` (`RealtimeVideoFrameIntervalMs`, `ScaleRealtimeVideoFrame`, `InboundVideoRateOf`), and the Gemini driver declares its video rate from the model's profile.
- 567d5de: The meeting bot no longer hears a participant's screen-share audio as their speech. It read every audio track it was subscribed to, so the sound of a tab or screen shared from another LiveKit client reached the model, and the room's transcript, as that person's words. A track whose source is `SOURCE_SCREENSHARE_AUDIO` is now unsubscribed as it arrives, with one log line per participant. Microphones are heard as before, and so are tracks published without a source (`SOURCE_UNKNOWN`, which clients on LiveKit's Rust SDK, rtc-node and Python included, report unless they name one). `RtcNodeModule.TrackSource` gains `SOURCE_SCREENSHARE_AUDIO`; a hand-built module, such as a test fake, must now supply it.
- 80ca198: The agent's bot now encodes the camera and screen frames it reads on a worker thread of its own, so a shared screen no longer blocks the thread that hosts the room (MJAPI's main loop by default) for each sampled frame. One encode worker serves every watching room on a thread, and each media worker (`MJ_LIVEKIT_WORKER_MEDIA=on`) gets its own; it starts with the first frame and stops after 60 s without frames. Each sampled frame is copied once, since the SDK's frame buffers can't be transferred. Consent is checked before a frame is sent to the worker and again when its JPEG returns. If the worker fails 3 times within 60 s, or its script is missing, frames are encoded in-process again for the rest of the process. `MJ_LIVEKIT_VIDEO_ENCODE_WORKER=off` (or the `VideoEncodeWorker` option) turns it off. Room telemetry gains where frames are encoded, the encode round trip, frames skipped or dropped around an encode, failures and worker restarts.
- ad3f44f: The meeting bot's only video out is the agent's avatar. The native room client's `publishVideo` and `publishScreen` no-ops are removed, from `LiveKitRtcNodeRoomClient`, `LiveKitWorkerRoomClient`, the media worker protocol (`MediaWorkerCommand`) and session, and the `NativeRoomClient` interface; `ILiveKitRoomSdk` and `LiveKitNativeMeetingSdk` lose `publishVideoFrame` and `publishScreenFrame`, which only forwarded to them. `LiveKitBridge.SendMedia` sends `video/mp4` frames on `video-out` to the avatar publisher as before, and drops any other `video-out` frame and every `screen-out` frame, logging the first of each per session when the provider allows that track.
- 1c76559: Fixes the Meet "could not load the native LiveKit room module at '@memberjunction/ai-bridge-livekit-native'" failure: `@memberjunction/ai-bridge-livekit` now keeps a process-wide registry of native room modules (`RegisterNativeRoomModule`) that `DefaultNativeLoader` checks before falling back to `import()`, and `@memberjunction/livekit-room-server`, which declares the native wrapper, registers it at load (no dependency cycle). `LIVEKIT_NATIVE_MODULE` overrides still go through `import()`. The native room client's `onDisconnected` callback now receives the LiveKit disconnect reason. The handoff offer registry no longer logs "User not found in metadata and no contextUser" every 15 seconds: the server now supplies the system user lazily, and queries are skipped (in-memory expiry still runs) when no user is available.
- 97bbca4: The LiveKit worker media plane is experimental and opt-in, off by default (`MJ_LIVEKIT_WORKER_MEDIA=on|true|1` or `UseWorker: true` enables it) and, when enabled, falls back to the in-process client if the worker cannot start or join. Worker crashes now clear the connected flag at once, restart with bounded exponential backoff (the counter resets only after 60s healthy), refuse to rejoin with an old token, and raise the disconnected callback with a reason when recovery fails. The auto-running worker bootstrap moved to a separate entry that the package index no longer re-exports. Outbound audio is paced by duration against a monotonic clock, the roster is seeded from the room on join and rejoin, telemetry is polled and reports main-thread and worker event-loop p99 separately, and the message protocol is a typed discriminated union. The live benchmark moved into the package and measures two-participant inbound and outbound audio with no hard-coded results.

  The README documents it, and moving the model transport into the worker is deferred (plans/realtime/livekit-worker-model-transport.md).

- 08a4cfc: The meeting bot publishes an agent's avatar. Before an agent's meeting session opens, the room coordinator asks the native room module whether the bot can publish one (`describeAvatarVideo`: `@livekit/rtc-node` with video publishing, and ffmpeg 4.2 or later with the H.264 and AAC decoders, from `MJ_FFMPEG_PATH` or the `PATH`, probed once per thread); only then does the session ask for it (`RealtimeAvatarSettings.Delivery: 'room'`, threaded through the bridged session prep), and the Gemini driver grants it on an endpoint that renders avatars (VIDEO, the avatar at 2 Mbps), with the decision on `IRealtimeSession.AvatarStatus`. A granted bridged Gemini session sends the avatar's fragmented MP4 as typed frames through `IRealtimeSession.OnVideoFrame`, plays PCM only before a turn's first video, drops media from `interrupted` to that turn's `turnComplete`, and reports the avatar video it generated as `OutputTokenDetails.VideoSeconds` deltas through `OnUsage` (counted up to `generationComplete`). The engine sends the pieces on `video-out` with their MIME type; in a full-duplex multi-agent room each piece passes the floor gate by its audio's duration (`FullDuplexTurnGate.OnOutputDuration`). The LiveKit bridge routes `video/mp4` frames to the room client (`publishAvatarMedia`), which reads them with Core's fMP4 reader (`ReadFmp4Fragment`, `AvccToAnnexB`, `AdtsHeader`, and `Fmp4AudioSeconds` beside AV9's `Fmp4VideoSeconds`; `ReadFmp4Init` also reads a track's size, the trex sample size and flags, the H.264 parameter sets and the AAC config), decodes them in two long-lived ffmpeg child processes, queues the voice on the bot's audio track and shows each frame on a camera track (`agent-avatar`, LiveKit's default simulcast, published at the first frame) when the voice's playout reaches the frame's timestamp. A barge-in drops the queued frames and fences both decoders; the last frame stays on screen. A decoder that dies is restarted; three failures of one decoder within 60 s, or a refused camera track, take the avatar down: the track is unpublished, the bot sets `mj.agentAvatar` to `audio-only:<reason>` (agent bot tokens now carry `canUpdateOwnMetadata`), and the engine replaces the model session with an audio-only one (`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`). The bot's join token carries `mj.agentAvatar` (`on`, or `audio-only:<reason>` with `decoder-missing` when the host has no usable ffmpeg); Core adds the attribute helpers and the reasons `decoder-missing`, `decoder-failed` and `publish-failed`, which `ParseRealtimeAvatarStatus` reads and `REALTIME_AVATAR_UNAVAILABLE_REASONS` lists (from the same table); the call and mobile notices word them "Audio only for {Agent}: the avatar couldn't be shown in this meeting". `GeminiEnterpriseRealtime` renders a bridged session's avatar the same way. With the media worker on, the pieces are transferred to the worker, a restarted worker gets the stream's init again, and one restarted after a take-down joins audio only. Integration check RD17 (the LiveKit provider allows video out, and the native module answers the avatar probe). The MJAPI image can install a pinned LGPL static ffmpeg (BtbN) checked against its sha256; it is off by default (`INSTALL_FFMPEG=false`, so meetings stay audio only): fill in the pin values and build with `--build-arg INSTALL_FFMPEG=true` to turn it on.
- b09fe34: The meeting room shows an agent's avatar. The room core maps the camera track an agent's bot publishes the avatar on (`REALTIME_AGENT_AVATAR_TRACK_NAME`, `agent-avatar`, now shared by the bot's publisher) to the participant's avatar instead of a camera, so its tile carries the "AI-generated video" label, and reads the bot's `mj.agentAvatar` attribute (`ReadAgentAvatarAttribute`) into `LiveKitParticipantView.AvatarAudioOnly`. `mj-media-tile` now shows an avatar whole, the full portrait with bars, in every tile: meeting tiles, and the call's avatar on the stage and in picture-in-picture. Its new `AvatarVideoFit` (default `'contain'`) lets a host fill the tile with `'cover'` instead; other video still fills its tile. When an agent's bot says audio only, the MJ room shows everyone one info notice per agent per join ("Audio only for Sage: the avatar can't be shown in this meeting"), dismissible and hiding itself after 10 seconds; `AvatarNoticeLabels` lets a host word it. Its words come from `ng-realtime-media`'s `AvatarNoticeText`, which gains an options argument (`{ NameAgent: true }` names the agent on a call's lines, for meetings; calls are unchanged) and takes `null` for a reason it doesn't know, giving the new `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`.
- 69bf67c: An agent that watches a LiveKit meeting now picks which camera or screen its model sees, instead of keeping the first one until it ends. A shared screen comes first (the most recent share). After that comes the camera of whoever leads LiveKit's active-speaker list, once they have led for 1.5 s, then the camera already in view, then the camera of whoever spoke last, then the first camera in the room. A camera stays in view for 4 s from its first frame before another camera replaces it. A shared screen, a withdrawn consent and an ended source never wait. The bot itself and other agents never count as speakers. Only the chosen source is subscribed and read: a switch drops the old one, then subscribes the new one. The model is told what it sees: "[You can now see: Ada's screen]" right before the first frame of each source new to its session, and "[You can no longer see: Bob's camera]" when a source it saw stops, including on a switch (the ended note used to read "[The agent can no longer see: …]"). The hold lengths can be overridden through the bridge's `Configuration` (`VideoSpeakerOnsetMs`, `VideoSpeakerHoldMs`). Room telemetry gains `sourceSwitches`, `switchesHeld`, `activeSpeakerUpdates` and `switchGapMsLast` / `switchGapMsMax`. The live check script gains a switch scenario (`VISION_SCENARIO=switch`).

  A browser call's video notes use the same second-person set. `VideoSourceArbiter` now says "[You can now see: Camera]" when what the model sees changes (it said "[The agent is now viewing: Camera]"), "[You can no longer see: Whiteboard (the user turned it off)]" when a source is turned off (it said "[The user turned off the agent's view of: Whiteboard]"), and "[You can now see: Whiteboard (turned back on)]" when it is turned back on (it said "[The agent can see Whiteboard again]"). The notes are sent at the same moments as before, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override them.

- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- dfae333: `@livekit/rtc-node` is now declared as `^0.13.29` (it was `^0.13.0`), the release the lockfile installs and live meetings ran on; the installed version is unchanged. The meeting bot can't run on earlier 0.13.x releases: it reads participant video through `getReader()`, which rtc-node's streams have from 0.13.12, and it times the avatar's face against `AudioSource.queuedDuration`, which reads 0 after a pause in the voice before 0.13.19 and still counts the dropped audio after `clearQueue()` (a barge-in) before 0.13.20. A host whose package manager satisfied the old range with an earlier release, such as a copy already in its tree, now gets 0.13.29 or later.
- d2cb42e: The rule that tells an agent's bot from a person in a meeting room now lives in one place, `@memberjunction/ai`: `AgentParticipantIdentity(agentSessionId)` gives a bot its participant identity (`agent-<agent session id>`), and `IsAgentParticipantIdentity(identity)` reads one back (any identity starting with `agent-`, in any case). The LiveKit room coordinator mints the bot's identity with it; the LiveKit bridge, the bot's video watcher and the bridge engine read identities with it, where the engine had three inline copies of the check. `IsAgentParticipantIdentity` in `@memberjunction/ai-bridge-livekit` is deprecated and calls the shared one, and the package now depends on `@memberjunction/ai`. The engine's verbose first-frame log says what arrived: "The agent can SEE your camera." or "...your screen." for video (it said "The agent is HEARING you." for every track); the line for audio is unchanged. Nothing else behaves differently.
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [acf0f5b]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [ad3f44f]
- Updated dependencies [1c76559]
- Updated dependencies [465c950]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [69bf67c]
- Updated dependencies [8bac4d6]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [ff58383]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 54f4bc1: Wire `@memberjunction/ai-bridge-livekit-native` dependency so the native LiveKit room wrapper resolves cleanly in LiveKit providers, room servers, and runtime hosts.
- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [54f4bc1]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2d14c62]
- Updated dependencies [c996a56]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
  - @memberjunction/core@6.1.0
  - @memberjunction/ai-bridge-livekit@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [c42c0e8]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e2ad3c0]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [d0a2a55]
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [8288711]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [15319b4]
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-bridge-livekit@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-bridge-livekit@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-bridge-livekit@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-bridge-livekit@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-bridge-livekit@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-bridge-livekit@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ai-bridge-livekit@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai-bridge-livekit@5.45.1
- @memberjunction/core@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ai-bridge-livekit@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/ai-bridge-livekit@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-bridge-livekit@5.43.0

## 5.42.0

### Patch Changes

- 08c016c: Add `@memberjunction/ai-bridge-livekit-native` — the real native LiveKit room client that wraps `@livekit/rtc-node` behind the `NativeRoomModule` contract `LiveKitNativeMeetingSdk` expects, giving the agent two-way audio (publish the agent's voice + subscribe to per-participant audio for diarized hearing) in a live LiveKit room. `@livekit/rtc-node` is an optionalDependency loaded lazily, so the package builds/tests with no addon (fake-module tests). Also regenerates the pre-built class-registration manifests to include `LoopbackBridge` from `@memberjunction/ai-bridge-server`.
- Updated dependencies [9b9b484]
- Updated dependencies [8c896c4]
- Updated dependencies [4b9361b]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/ai-bridge-livekit@5.42.0
