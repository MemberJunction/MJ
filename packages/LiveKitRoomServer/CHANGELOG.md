# @memberjunction/livekit-room-server

## 6.2.0-edge.6

### Patch Changes

- c4645bc: Anonymous visitors are isolated from each other on three more paths. Every anonymous widget guest and anonymous magic-link invitee authenticates as the one shared Anonymous user, so any check that compares only `UserID` treats every visitor as the same person. A widget now mints a guest session only for a scope-isolated guest role: the stock `Widget Guest` role, or a role the deployment lists in `magicLink.grantableRoleNames`; a widget whose `GuestRoleID` is the stock `UI` role (whose row filters key on `UserID`, so under it visitors read and update each other's conversations and sessions through the generic API, MJ#6043) is refused at mint and at refresh with `guest_role_not_isolated`, and the API log names the widget and the fix. The text agent turn (`RunAIAgentFromConversationDetail`) now checks an anonymous caller's scope id against the conversation's `ExternalID` with the same `AuthorizeSessionAccess` decision the realtime gates use, before any reply row is written, so one guest can no longer run the agent in another guest's conversation (MJ#6032); named users are not read again and are unchanged. The LiveKit room gate's ownership rule no longer admits an anonymous caller by the shared `UserID` or by an offer that names it (MJ#6044): an anonymous visitor joins a call or agent-session room only when it owns one of the room's agent sessions by scope, decided by the same `AuthorizeSessionAccess` the realtime gates use. MJServer registers that check at startup through the new `RoomAuthorizationService.SetAnonymousSessionOwnerCheck`; with none registered, every anonymous caller is refused those rooms.
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [f7a43b2]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-bridge-server@6.2.0-edge.6
  - @memberjunction/network-utils@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/storage@6.2.0-edge.6
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.6
  - @memberjunction/ai-bridge-livekit-native@6.2.0-edge.6
  - @memberjunction/ai-bridge-base@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- 17c36d1: The meeting dial-in rate limiter stays cheap and keeps its lockouts under a flood of distinct caller numbers.
  - **Constant cost per failed attempt.** Past 1,000 tracked numbers, every failed dial-in used to scan the whole map for expired entries, so a flood of distinct numbers cost a 10,000-entry scan per attempt. The scan now runs at most once per 1,000 new numbers, and enforcing the 10,000-entry cap drops a single entry.
  - **Lockouts are evicted last.** A locked-out caller could flood 10,000 other numbers to push their own lockout out of the map. Locked-out numbers are now kept apart, and the cap drops a number that is only counting attempts first; a lockout goes only when every tracked number is locked out.
  - **A failure during an active lockout leaves it alone.** It used to reset the lockout once the attempt window had passed. The dial-in service never records a failure for a locked-out number, so this only affects direct callers of `DialInRateLimiter`.

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [52b9fd5]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [cd39c95]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [0cc6b08]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/storage@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-bridge-base@6.2.0-edge.5
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.5
  - @memberjunction/ai-bridge-server@6.2.0-edge.5
  - @memberjunction/ai-bridge-livekit-native@6.2.0-edge.5
  - @memberjunction/network-utils@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- d17de94: MJAPI records a person's choice of whether agents may see their camera and shared screen in a LiveKit room. The new `SetLiveKitAgentVision` mutation works out the participant from the signed-in user (no identity is sent), sets their `mj.agentCanSee` attribute through LiveKit's server SDK with the new `LiveKitParticipantService` (a participant's token can't change its own attributes), and writes an `MJ: Audit Logs` row of the new `Realtime Agent Vision Consent` type whether LiveKit applied the change or refused it. `GraphQLLiveKitClient.SetAgentVision` calls it, and `AgentVisionAttributes` in `@memberjunction/ai` builds the attribute change. Integration test IT113 drives it over the wire. Minor because it adds an audit log type under `metadata/`.

### Patch Changes

- 1da00cb: An agent can now watch a LiveKit meeting. Set `realtime.video.watchMeetings: true` in the voiced agent's `TypeConfiguration`. When its realtime model takes video (Gemini 3.8 Live), the agent's bot joins with the `mj.agentWatches` attribute, so the room offers each person the choice, and reads the camera or shared screen of the people who allow it: one source at a time, at the model's frame rate, as JPEG (cameras scaled to 640 px on the longer side, screens to 1280 px). When a source whose frames reached the model ends (the person withdraws, leaves, stops sharing or turns the camera off), the model is told "[The agent can no longer see: Ada's camera]". In every meeting the bot now unsubscribes from video it does not read. The frame-rate and scaling math moves to `@memberjunction/ai` (`RealtimeVideoFrameIntervalMs`, `ScaleRealtimeVideoFrame`, `InboundVideoRateOf`), and the Gemini driver declares its video rate from the model's profile.
- 59d47d5: A LiveKit agent room start that fails no longer leaves the agent's model session open or its `MJ: AI Agent Sessions` row `Active` (#5308).
  - `LiveKitAgentRoomCoordinator.StartAgentRoomSession` closes the model session it opened when the start fails before the bridge engine takes that session: when the bot's token can't be minted (as before) and now also when the bridge doesn't start, for example because its row can't be saved. Before, a failed bridge start left the model connection open in MJAPI until the provider timed it out.
  - `StartLiveKitAgentRoomSession` and `StartMeeting` close the agent session they created for an agent that fails to start, with reason `Error`, instead of leaving it `Active` until the janitor's staleness sweep. A meeting still starts without that agent. A session the caller passed in (`AgentSessionID`) is the caller's and is left as it was.
  - New `SessionManager.CloseSessionForFailedStart` runs `CloseSession` with `Error`. It never throws, so the caller still reports the start's own error; a close that fails is logged and left to the janitor.

- aaf74ca: A realtime agent start that fails now records the failure on the agent's co-agent run, and a LiveKit room start that can't give the user a token starts nothing.
  - The co-agent run of an agent whose start failed read `Completed`: closing its model session finalized the run as a success, whatever the reason for the close. The LiveKit room coordinator and the phone-call starter now finalize the run as `Failed` first, with the start's error as the `ErrorMessage` of the run, its prompt run and its step; the close then finalizes nothing more.
  - `BridgeRealtimeRuntime.Finalize` and `RealtimeClientSessionService.FinalizeCoAgentRun` take an optional error message for a failed finalize.
  - `LiveKitAgentRoomCoordinator.SetFailedStartRecorder` binds how a failed start is recorded; MJServer binds it to the session runtime's `Finalize(false, error)`. Unbound, a failed start's run reads `Completed`, as before.
  - `StartLiveKitAgentRoomSession` mints the user's client token before it starts the agent. Minted after the agent joined, a token that couldn't be minted failed the start with the agent left in the room, its agent session `Active`, and no bridge id for the UI to stop it by.

- 1b4c9f5: Rename `DialInRateLimiter`'s private constants `SweepThreshold` and `MaxEntries` to `sweepThreshold` and `maxEntries`. The repo's naming standard requires camelCase for private members, and since these landed on `next` in `95e5dd9c94` the "adopted standards" CI check fails on every PR that merges `next` and touches package TypeScript or `package.json` files. No behavior change.
- 1c76559: Fixes the Meet "could not load the native LiveKit room module at '@memberjunction/ai-bridge-livekit-native'" failure: `@memberjunction/ai-bridge-livekit` now keeps a process-wide registry of native room modules (`RegisterNativeRoomModule`) that `DefaultNativeLoader` checks before falling back to `import()`, and `@memberjunction/livekit-room-server`, which declares the native wrapper, registers it at load (no dependency cycle). `LIVEKIT_NATIVE_MODULE` overrides still go through `import()`. The native room client's `onDisconnected` callback now receives the LiveKit disconnect reason. The handoff offer registry no longer logs "User not found in metadata and no contextUser" every 15 seconds: the server now supplies the system user lazily, and queries are skipped (in-memory expiry still runs) when no user is available.
- 97bbca4: The LiveKit worker media plane is experimental and opt-in, off by default (`MJ_LIVEKIT_WORKER_MEDIA=on|true|1` or `UseWorker: true` enables it) and, when enabled, falls back to the in-process client if the worker cannot start or join. Worker crashes now clear the connected flag at once, restart with bounded exponential backoff (the counter resets only after 60s healthy), refuse to rejoin with an old token, and raise the disconnected callback with a reason when recovery fails. The auto-running worker bootstrap moved to a separate entry that the package index no longer re-exports. Outbound audio is paced by duration against a monotonic clock, the roster is seeded from the room on join and rejoin, telemetry is polled and reports main-thread and worker event-loop p99 separately, and the message protocol is a typed discriminated union. The live benchmark moved into the package and measures two-participant inbound and outbound audio with no hard-coded results.

  The README documents it, and moving the model transport into the worker is deferred (plans/realtime/livekit-worker-model-transport.md).

- c28e243: A LiveKit meeting agent's `MJ: AI Agent Sessions` row now closes when the agent leaves the room (#5356). Before, stopping the agent (`StopLiveKitAgentRoomSession`), ending the room (`EndLiveKitRoom`) or ending a scheduled meeting stopped the bot but left its session `Active` until the janitor's staleness sweep closed it, 15 minutes or more later, as `Janitor`.
  - The session `StartLiveKitAgentRoomSession` creates for an agent, and the one `StartMeeting` creates for each agent participant, closes once the agent's bridge has ended, whatever ended it: a stop or an ended meeting, an emptied room, a lost model session. Both pass the room coordinator an end-of-session hook, as phone and room calls already do for theirs.
  - New `SessionManager.CloseSessionForEndedBridge` runs the janitor's close (`CloseSession`) with the bridge's reason: `Explicit` for a stop, an ended meeting or an emptied room, otherwise the bridge's own (`Error`, `Janitor`, `Shutdown`). A session already closed keeps its reason. It never throws; a failure is logged and the janitor closes the session later, as before.
  - A session the caller passed in (`AgentSessionID`) is the caller's to close and is left open.
  - The coordinator's `AgentRoomHostOptions` TSDoc says a plain Meet room may pass only the end-of-session hook.

- 08a4cfc: The meeting bot publishes an agent's avatar. Before an agent's meeting session opens, the room coordinator asks the native room module whether the bot can publish one (`describeAvatarVideo`: `@livekit/rtc-node` with video publishing, and ffmpeg 4.2 or later with the H.264 and AAC decoders, from `MJ_FFMPEG_PATH` or the `PATH`, probed once per thread); only then does the session ask for it (`RealtimeAvatarSettings.Delivery: 'room'`, threaded through the bridged session prep), and the Gemini driver grants it on an endpoint that renders avatars (VIDEO, the avatar at 2 Mbps), with the decision on `IRealtimeSession.AvatarStatus`. A granted bridged Gemini session sends the avatar's fragmented MP4 as typed frames through `IRealtimeSession.OnVideoFrame`, plays PCM only before a turn's first video, drops media from `interrupted` to that turn's `turnComplete`, and reports the avatar video it generated as `OutputTokenDetails.VideoSeconds` deltas through `OnUsage` (counted up to `generationComplete`). The engine sends the pieces on `video-out` with their MIME type; in a full-duplex multi-agent room each piece passes the floor gate by its audio's duration (`FullDuplexTurnGate.OnOutputDuration`). The LiveKit bridge routes `video/mp4` frames to the room client (`publishAvatarMedia`), which reads them with Core's fMP4 reader (`ReadFmp4Fragment`, `AvccToAnnexB`, `AdtsHeader`, and `Fmp4AudioSeconds` beside AV9's `Fmp4VideoSeconds`; `ReadFmp4Init` also reads a track's size, the trex sample size and flags, the H.264 parameter sets and the AAC config), decodes them in two long-lived ffmpeg child processes, queues the voice on the bot's audio track and shows each frame on a camera track (`agent-avatar`, LiveKit's default simulcast, published at the first frame) when the voice's playout reaches the frame's timestamp. A barge-in drops the queued frames and fences both decoders; the last frame stays on screen. A decoder that dies is restarted; three failures of one decoder within 60 s, or a refused camera track, take the avatar down: the track is unpublished, the bot sets `mj.agentAvatar` to `audio-only:<reason>` (agent bot tokens now carry `canUpdateOwnMetadata`), and the engine replaces the model session with an audio-only one (`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`). The bot's join token carries `mj.agentAvatar` (`on`, or `audio-only:<reason>` with `decoder-missing` when the host has no usable ffmpeg); Core adds the attribute helpers and the reasons `decoder-missing`, `decoder-failed` and `publish-failed`, which `ParseRealtimeAvatarStatus` reads and `REALTIME_AVATAR_UNAVAILABLE_REASONS` lists (from the same table); the call and mobile notices word them "Audio only for {Agent}: the avatar couldn't be shown in this meeting". `GeminiEnterpriseRealtime` renders a bridged session's avatar the same way. With the media worker on, the pieces are transferred to the worker, a restarted worker gets the stream's init again, and one restarted after a take-down joins audio only. Integration check RD17 (the LiveKit provider allows video out, and the native module answers the avatar probe). The MJAPI image can install a pinned LGPL static ffmpeg (BtbN) checked against its sha256; it is off by default (`INSTALL_FFMPEG=false`, so meetings stay audio only): fill in the pin values and build with `--build-arg INSTALL_FFMPEG=true` to turn it on.
- 95e5dd9: fix(memory-leaks): round 18 audit — release OpenAI Live session handlers/timer on Close, delete per-session bridge diag flags, sweep and cap the dial-in rate limiter, detach MCP toolsSynced listener on failure, don't arm the telephony dashboard interval after destroy
- 8704df6: A phone call never asks the model for an avatar. A caller hears the agent and sees no video, but a voiced agent whose persona has a face still asked for its avatar on a phone call: on a carrier call (Twilio, Vonage, RingCentral) the Gemini driver refused it as `bridged` and logged that on every call, and on a call that reached a LiveKit room through SIP the room coordinator asked for room delivery whenever its host could publish, so the model rendered avatar video, billed per minute, that the caller never saw. The session prep now decides before the driver: a session marked as a phone call (`PrepareClientSessionInput.PhoneCall`, set from `params.data.realtimePhoneCall`, which `CreateBridgeRealtimeSession` sets from `BridgeRealtimeSessionContext.PhoneCall`) carries no avatar request, keeps the avatar persona's voice so the agent sounds the same as in a call that shows its face, and the default model walk prefers no avatar model for it. The telephony call starter marks every carrier call as a phone call; the room call starter passes its channel to the coordinator (`AgentRoomHostOptions.Channel`), which on `'phone'` skips the native module's avatar probe, passes no room delivery, and marks the session (`RealtimeSessionStartContext.PhoneCall`). Core gains the reason `'phone'` (`RealtimeAvatarUnavailableReason`, read by `ParseRealtimeAvatarStatus` and the bot attribute reader); a phone call's bridged session reports `{ Requested: true, Granted: false, Reason: 'phone' }` as its `AvatarStatus`, so a SIP call's bot joins with `mj.agentAvatar` `audio-only:phone`, and the notice reads "Audio only for {Agent}: the avatar isn't shown on phone calls" (`ng-realtime-media` and the mobile app's copy). The `bridged` reason now covers only a server-side session whose host can't publish video into a room. Integration check RD13 also checks that a phone call in a room that could publish the avatar asks for none and keeps the persona's voice.
- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- d2cb42e: The rule that tells an agent's bot from a person in a meeting room now lives in one place, `@memberjunction/ai`: `AgentParticipantIdentity(agentSessionId)` gives a bot its participant identity (`agent-<agent session id>`), and `IsAgentParticipantIdentity(identity)` reads one back (any identity starting with `agent-`, in any case). The LiveKit room coordinator mints the bot's identity with it; the LiveKit bridge, the bot's video watcher and the bridge engine read identities with it, where the engine had three inline copies of the check. `IsAgentParticipantIdentity` in `@memberjunction/ai-bridge-livekit` is deprecated and calls the shared one, and the package now depends on `@memberjunction/ai`. The engine's verbose first-frame log says what arrived: "The agent can SEE your camera." or "...your screen." for video (it said "The agent is HEARING you." for every track); the line for audio is unchanged. Nothing else behaves differently.
- ed8a189: feat(telephony): add ILiveKitSipInboundHandler hook and multi-observer support to RoomHandoffEngine
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [7873578]
- Updated dependencies [1da00cb]
- Updated dependencies [567d5de]
- Updated dependencies [92ecdf9]
- Updated dependencies [1aa4e00]
- Updated dependencies [acf0f5b]
- Updated dependencies [989f7fe]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [64b6fa5]
- Updated dependencies [80ca198]
- Updated dependencies [d86bcbc]
- Updated dependencies [af6f892]
- Updated dependencies [432fe69]
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
- Updated dependencies [97bbca4]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [69bf67c]
- Updated dependencies [95e5dd9]
- Updated dependencies [6d5c6ad]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [1ea4085]
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
- Updated dependencies [dfae333]
- Updated dependencies [57096ab]
- Updated dependencies [aac148b]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/aiengine@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/ai-bridge-livekit-native@6.2.0-edge.4
  - @memberjunction/ai-bridge-base@6.2.0-edge.4
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.4
  - @memberjunction/ai-bridge-server@6.2.0-edge.4
  - @memberjunction/storage@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/network-utils@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 54f4bc1: Wire `@memberjunction/ai-bridge-livekit-native` dependency so the native LiveKit room wrapper resolves cleanly in LiveKit providers, room servers, and runtime hosts.
- 0618369: Adds `RoomAudioPlayer`, a server-side primitive that joins a LiveKit room as a publish-only bot and plays hold music into it.
  - **Sources:** an `MJ: Files` row, an https URL (SSRF-safe fetch, 20 s timeout, 25 MB cap; http is refused), caller PCM, or a built-in procedurally generated comfort tone.
  - **Formats:** WAV (integer PCM 8/16/24/32-bit, float 32/64-bit, any channel count, downmixed) and MP3 (via the WebAssembly `mpg123-decoder`), up to 15 minutes. Other formats are refused by name.
  - **Playback:** resampled to 48 kHz and paced in 20 ms frames about 150 ms ahead of real time, so the native client's queue stays bounded. Supports loop, pause/resume, and `Announce`, which ducks the music under a clip.
  - **Lifecycle:** a registry (`GetActive`, `StopAllInRoom`). A playback stops itself when the server drops its bot, and a verified `room_finished` webhook stops a room's playbacks.
  - **Text announcements** go through the `IRoomSpeechSynthesizer` port. No synthesizer is installed by default; a host opts in with `SetSpeechSynthesizer(new MJRoomSpeechSynthesizer({ Voice }))`, which uses `AITextToSpeechRunner`.
  - **Native module specifier:** the agent coordinator and the player now resolve it through one shared function, `ResolveLiveKitNativeModuleSpecifier`. The coordinator's behavior is unchanged.
  - **New dependencies:** `@memberjunction/storage`, `@memberjunction/network-utils`, `@memberjunction/ai-prompts` and `mpg123-decoder`.

- 279b93e: Multi-agent rooms now take turns properly with full-duplex realtime models, and the Live Room doubles as an agent test bed.
  - **Model-side addressing.** `IAddressedMatcher` gains a model-judged implementation next to the name-matching one. Full-duplex sessions get two host tools, `i_am_addressed` and `yield_turn`, because neither vendor offers a native signal. `TurnAddressing` (`Auto` | `ModelSide` | `Regex`) is selectable per session; `Auto` uses the model's judgement when the model reports the new `FullDuplex` capability (GPT-Live, Gemini 3.8 Live with always-on proactive audio) and name matching otherwise.
  - **Floor discipline.** `MultiAgentRoomCoordinator` now grants hand-offs with a TTL (a third agent cannot jump in), keeps backchannels (short "mm-hm" acknowledgements) off the floor, lets a person's speech preempt the holder through the existing barge-in flush path while delegated work keeps running, and caps consecutive agent-to-agent turns (default 8, configurable). A new `FullDuplexTurnGate` enforces it on models that decide for themselves when to speak, so two agents never speak at once even if neither asks first.
  - **Test bed.** New `GetLiveKitRoomTurnState` query and typed `GraphQLLiveKitClient.GetRoomTurnState`; new `mj-livekit-turn-state` widget; the Live Room gets per-agent turn mode and addressing pickers, roster badges and a live Turns panel (floor holder, hand-offs, backchannels, loop cap, event feed) that also works for a person who joins an existing room.
  - **Tests.** A deterministic replay harness with twelve recorded room timelines asserts no overlapping agent speech, no run beyond the loop cap, humans always preempt and backchannels never take the floor.

  No schema, metadata or CodeGen changes. Live-model behaviour of the host tools is not yet verified; see the "Multi-agent rooms" section of `plans/realtime/bridges-and-widget/LIVE-CALL-CHECKLIST.md`.

- be15f39: `RoomAudioHandle` gains `Ended: Promise<RoomAudioEndReason>` and `EndReason`, so callers can tell a clip that played in full (`'Completed'`) from one that was stopped, failed, or disconnected — e.g. start a call recording only after the recording disclosure has been heard. A non-looping playback now waits for the audio already sent ahead of real time to play out before its bot leaves, so the clip's tail is no longer cut off.
- d046715: Add optional FromNumber to DialIntoRoomRequest (honoured in LiveKitSipTelephonyService with fallback to outboundFromNumber) and expose InteractionID on HandoffOfferInfo, the GraphQL HandoffOffer type, and OFFER_FIELDS.
- 3204a32: Add Interaction lifecycle tracking, append-only InteractionEvent enforcement, caller linking, and outbound number pool selection.
  - **Append-only InteractionEvent**: `MJInteractionEventEntityServer` blocks update and delete operations on `MJ: Interaction Events`.
  - **Interaction lifecycle**: `InteractionLifecycleService` manages creation, state transitions, caller linking, event logging, and duration/cost computation across phone and room calls.
  - **Outbound number pool selection**: `NumberPoolSelector` supports `RoundRobin`, `LocalPresence`, and `Random` selection policies, respecting `MaxConcurrentPerNumber` limits.
  - **Inbound routing**: Resolves dialed numbers to active agent identities and associated `PhoneNumber` records.

- a8e162d: Durable hand-off offers backed by MJ: Interaction Offers with compare-and-set and cluster pubsub fan-out
- b1b6d3d: Phone calls can now arrive in a LiveKit room, and an agent can bring a person, a phone number or another agent into that same room.

  No database, entity or metadata change. Handoff offers are held in memory per process, so use a single MJAPI instance for human handoff until a database-backed registry exists (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF-PR3.md`). None of this has been run against a real LiveKit SIP project or Twilio trunk.
  - **`@memberjunction/livekit-room-server`** — `LiveKitSipService` (list, dial, remove and provision SIP participants and trunks through the LiveKit SIP client), `LiveKitWebhookParser` (signed LiveKit webhooks), and the room handoff engine: `RoomHandoffEngine`, `HandoffOfferRegistry` and the handoff types. `LiveKitAgentRoomCoordinator.StartAgentRoomSession` takes optional host options (tools, framing, conversation, transcript sink, barge-in and recovery hooks), and an ended agent leaves the room roster. `LiveKitUserIdentity` is shared by the token minter and the handoff engine.
  - **`@memberjunction/telephony-adapters`** — `telephony.livekitSip` configuration and the `LiveKitSipTelephonyService` server extension (webhook at `/telephony/livekit-sip/webhook`, inbound admission by dialed number, capacity gate, run-as user, outbound through the shared gate), `ISipTrunkCarrier` with a Twilio Elastic SIP implementation that validates configuration only, `RoomCallSessionStarter`, and `PlaceLiveKitSipCall`. Transfer targets gain `kind: 'user' | 'agent'` (`userEmail`, `fallbackNumber`, `agentName`); a `number` target and a call on a carrier media stream behave as before.
  - **`@memberjunction/server`** — the `telephony.livekitSip` config block; `HumanHandoffResolver` (`MyHandoffOffers`, `AcceptHandoffOffer`, `DeclineHandoffOffer`, subscription `HandoffOfferChanges`, all scoped to the signed-in user, failing closed); `StartLiveKitAgentRoomSession` accepts `EnableHandoff` for web-room escalation.
  - **`@memberjunction/graphql-dataprovider`** — `GraphQLHandoffClient`; `EnableHandoff` on the agent room input.
  - **`@memberjunction/ng-conversation-offers`** (new) — `mj-conversation-offers`, a generic widget listing offered conversations with a countdown and Accept / Decline.
  - **`@memberjunction/ng-mj-livekit-room`** — `EnableHandoff` input.
  - **`@memberjunction/ng-explorer-core`** — the Conversation Console resource (`HumanHandoffConsoleResource`), opened by a `handoff-offer` notification.

- eeee8d4: Telephony Step 6 Integration Verification: add RD10, RD11, and RD12 deterministic integration checks, relocate RoomAuthorizationService to LiveKitRoomServer for reuse, fix virtual PhoneNumber sequence in MJ: Interactions and base view alignment, and update live call checklist.
- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [54f4bc1]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [1595b7d]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [8db8973]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.3
  - @memberjunction/ai-bridge-livekit-native@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/ai-bridge-base@6.2.0-edge.3
  - @memberjunction/ai-bridge-server@6.2.0-edge.3
  - @memberjunction/storage@6.2.0-edge.3
  - @memberjunction/network-utils@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-bridge-base@6.2.0-edge.2
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.2
  - @memberjunction/ai-bridge-server@6.2.0-edge.2

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

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [15a4333]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/ai-bridge-base@6.2.0-edge.1
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.1
  - @memberjunction/ai-bridge-server@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-bridge-server@6.2.0-edge.0
  - @memberjunction/ai-bridge-base@6.2.0-edge.0
  - @memberjunction/ai-bridge-livekit@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/ai-bridge-base@6.1.0
  - @memberjunction/ai-bridge-livekit@6.1.0
  - @memberjunction/ai-bridge-server@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ai-bridge-base@6.1.0-edge.7
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.7
  - @memberjunction/ai-bridge-server@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/ai-bridge-server@6.1.0-edge.6
  - @memberjunction/ai-bridge-base@6.1.0-edge.6
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-bridge-server@6.1.0-edge.5
  - @memberjunction/ai-bridge-base@6.1.0-edge.5
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-bridge-server@6.1.0-edge.4
  - @memberjunction/ai-bridge-base@6.1.0-edge.4
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-bridge-base@6.1.0-edge.3
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.3
  - @memberjunction/ai-bridge-server@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-bridge-base@6.1.0-edge.2
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.2
  - @memberjunction/ai-bridge-server@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-bridge-base@6.1.0-edge.1
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.1
  - @memberjunction/ai-bridge-server@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ai-bridge-base@6.1.0-edge.0
  - @memberjunction/ai-bridge-livekit@6.1.0-edge.0
  - @memberjunction/ai-bridge-server@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-bridge-base@6.0.0
  - @memberjunction/ai-bridge-livekit@6.0.0
  - @memberjunction/ai-bridge-server@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-bridge-base@5.51.0
  - @memberjunction/ai-bridge-livekit@5.51.0
  - @memberjunction/ai-bridge-server@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/ai-bridge-base@5.50.0
  - @memberjunction/ai-bridge-livekit@5.50.0
  - @memberjunction/ai-bridge-server@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-bridge-base@5.49.0
  - @memberjunction/ai-bridge-livekit@5.49.0
  - @memberjunction/ai-bridge-server@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-bridge-base@5.48.0
  - @memberjunction/ai-bridge-livekit@5.48.0
  - @memberjunction/ai-bridge-server@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-bridge-base@5.47.0
  - @memberjunction/ai-bridge-livekit@5.47.0
  - @memberjunction/ai-bridge-server@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-bridge-base@5.46.0
  - @memberjunction/ai-bridge-livekit@5.46.0
  - @memberjunction/ai-bridge-server@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/ai-bridge-base@5.45.1
- @memberjunction/ai-bridge-livekit@5.45.1
- @memberjunction/ai-bridge-server@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-bridge-base@5.45.0
  - @memberjunction/ai-bridge-livekit@5.45.0
  - @memberjunction/ai-bridge-server@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Minor Changes

- aa9102d: feat(media+realtime): generic media player, end-to-end media streaming, and the realtime/LiveKit recording stack

  A new media + recording platform spanning the player, storage, server, and the realtime/voice stack.

  **Generic media player (`@memberjunction/ng-media-player`, new package)** — a framework-agnostic
  `mj-media-player` (transport, click/drag scrubber, playback speed, ±skip, keyboard, fullscreen,
  multi-track video grid, a real decoded audio waveform that doubles as the scrubber and accepts
  precomputed `MediaTrack.Peaks`, a time-synced clickable transcript, loading/buffering state with an
  `aria-live` status, cancelable `Before*` events, and an imperative API) plus an MJStorage-bound
  `mj-storage-media-player` that resolves a `FileID` to an authenticated, range-streamed source. The
  artifact audio/video viewers and previews now embed it.

  **MJStorage streaming (`@memberjunction/storage`)** — `FileStorageBase.GetObjectStream` +
  `SupportsStreaming` + `StreamingNotSupportedError`, implemented for all seven drivers (Box, AWS S3,
  Azure, GCS, Google Drive, SharePoint, Dropbox).

  **Authenticated media delivery (`@memberjunction/server`)** — a `CreateMediaAccessToken` mutation
  (short-lived, permission-gated, returns precomputed waveform peaks) and a `GET /media/:fileId?token=`
  HTTP-Range streaming route — any stored asset is served to the browser by `FileID` with real
  streaming + permissions, no public links.

  **Realtime co-agent recording (`@memberjunction/ng-conversations`, `@memberjunction/ai-realtime-client`,
  `@memberjunction/ai-agents`)** — client-direct sessions record a seekable 16-bit WAV with capture-time
  waveform peaks (a `peaks.json` sidecar); the agent's remote audio is mixed in when its WebRTC track
  lands (`OnRemoteMediaStream`/`AttachRemoteStream`); transcript cue timing anchors to real audio onset
  across tool-call gaps; recorded sessions stream back through the player. Plus reactive fixes
  (`ConversationEngine.EnsureConversationLoaded` in `@memberjunction/core-entities`) so new conversations
  and recordings appear without a refresh.

  **LiveKit meeting recording (`@memberjunction/livekit-room-server`, `@memberjunction/server`,
  `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-mj-livekit-room`)** — egress output is
  registered as an `MJ: Files` row linked to the Meeting-Room `Conversation` (new `RecordingFileID` /
  `EgressID`), with point-at-sink or copy-to-canonical storage, and played back in the Meet UI.

  **Realtime surface-tab overhaul (`@memberjunction/ng-conversations`)** — channel tabs appear only once
  used (Whiteboard excepted), each color/icon-coded; the Activity tab is gated, restyled, and
  right-aligned; agent-run artifacts move out of per-artifact tabs into the Activity tab with a
  resizable, `UserInfoEngine`-persisted split viewer.

  The Media channel can now show MJStorage files (`fileId`) in addition to URLs. The realtime
  recordings dashboard (`@memberjunction/ng-dashboards`) and CodeGen-regenerated entity forms
  (`@memberjunction/ng-core-entity-forms`) reflect the new recording fields.

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-bridge-base@5.44.0
  - @memberjunction/ai-bridge-livekit@5.44.0
  - @memberjunction/ai-bridge-server@5.44.0

## 5.43.0

### Minor Changes

- 9f6aa87: Generic fire-and-forget save queue, realtime multi-agent floor control, and telemetry fixes.

  **Generic fire-and-forget save queue** (`@memberjunction/global`, `@memberjunction/core`, + adopters) — de-duplicates the hand-rolled "INSERT (fire-and-forget) → chained UPDATE" persistence pattern and makes the "stuck at Running" race structurally impossible:
  - `KeyedSerialTaskQueue` (`@memberjunction/global`) — entity-agnostic per-key serial task chain: same-key tasks serialize, different keys run concurrently, failures are tallied for `flush()` and never propagate. Self-bounding (in-flight set + failure counters), so a long-lived queue that never flushes doesn't grow.
  - `BaseEntitySaveQueue` (`@memberjunction/core`) — entity façade: `Insert` / `Update(entity, applyMutation?)` / `Flush`, with an optional `onError` hook for structured logging. `Update`'s mutation runs _inside_ the post-INSERT task, so it can never be reverted by the INSERT's reload.
  - Adopted in all three hand-rolled copies + the new consumer: `GenericProcessRunTracker` (`@memberjunction/record-set-processor`), `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`), `ActionEngine`'s execution log (`@memberjunction/actions`), and `AIPromptRunner` / `AIModelRunner` (`@memberjunction/ai-prompts`). Also fixes a pre-existing `MJLruCache` mock gap in the Actions/Engine test suite.

  **Realtime** (`@memberjunction/ai`, `@memberjunction/ai-bridge-server`, `@memberjunction/ai-gemini`, `@memberjunction/ai-openai`, `@memberjunction/livekit-room-server`, `@memberjunction/ng-livekit-room`) — multi-agent floor control, Gemini meeting mode, the session capability surface with first-agent re-gating, and an idle reaper.

  **Telemetry / core** (`@memberjunction/core`, `@memberjunction/server`) — cacheability-aware duplicate-RunView suggestion for `AllowCaching=false` entities; fixes the telemetry pagination-fingerprint false-duplicate and batches the janitor channel reads.

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/ai-bridge-server@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-bridge-base@5.43.0
  - @memberjunction/ai-bridge-livekit@5.43.0

## 5.42.0

### Minor Changes

- 9b9b484: Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

  **Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
  - Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely _contains_ a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
  - New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
  - `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

  **Telemetry (`@memberjunction/core`)**
  - Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

  **Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
  - Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
  - Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

  **"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
  - Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.

- 5fde509: Add the LiveKit room UX stack — a full-featured, framework-portable LiveKit client plus the MJ realtime-bridge binding, server token/egress support, and an Explorer surface.
  - **`@memberjunction/livekit-room-core`** (new): framework-agnostic pure-TS room controller over `livekit-client` — observable room state, participants, active speakers, audio meters, device control, data-channel messages, audio-autoplay unblock, Krisp noise filter, background blur/virtual background, E2EE, room-free media preview, and a deep **cancelable event architecture** (`event.Cancel = true`).
  - **`@memberjunction/ng-livekit-room`** (new): super-featured portable Angular UI (`mj-livekit-room`) — gallery / active-speaker / **split-view (draggable splitter)** / audio-only layouts with a live switcher, A/V/screen controls, data-channel chat, device + settings menu (noise filter / background blur), **PreJoin lobby**, **StartAudio** unblock, click-to-pin, **agent-state visualizer**, **collaborative whiteboard** (reuses `@memberjunction/ng-whiteboard`, synced over the data channel — agent co-authoring supported), recording control, and E2EE. Every feature gated by a PascalCase `@Input`; core events re-surfaced as `@Output`s. MJ design tokens with fallbacks.
  - **`@memberjunction/livekit-room-server`** (new): scoped client/bot token minting (`livekit-server-sdk`), `LiveKitAgentRoomCoordinator` session-start harness (opens a realtime session → `AIBridgeEngine.StartBridgeSession`), and `LiveKitEgressService` recording.
  - **`@memberjunction/ng-mj-livekit-room`** (new): MJ binding (`mj-livekit-agent-room`) resolving tokens / starting agent sessions / recording via the RealtimeBridge GraphQL surface.
  - **`@memberjunction/graphql-dataprovider`**: adds `GraphQLLiveKitClient` (mint token, start agent room session, start/stop recording).
  - **`@memberjunction/server`**: adds `RealtimeBridgeResolver` (`MintLiveKitClientToken`, `StartLiveKitAgentRoomSession`, `StartLiveKitRecording`, `StopLiveKitRecording`).
  - **`@memberjunction/ng-explorer-core`**: registers a `LiveKitRoomResource` so the room can be opened as an Explorer tab.

  Tests: 74 unit tests across the stack (core 22, server 15, ng-livekit-room 26, GraphQL client 6, resolver 5). No migrations. The agent-talking path additionally requires the deployment to bind a realtime-session factory on `LiveKitAgentRoomCoordinator.Instance` and the LiveKit native room client (`@livekit/rtc-node`) — the documented deployment seams.

- 4ec1732: Make the Meet app's LiveKit Live Room work end-to-end (default agent resolution, realtime model fallback, real backing session row, bridge-driver registration, connect timeout, and active device selection), then build it into a multi-party experience: a pre-join agent picker, threading a target agent so the co-agent actually responds, in-room add/remove of agents, and shareable human invite links. Also improves Entity Vector Sync with a concise per-document summary, verbose-gated pipeline logging, and a batched Entity Record Document existence read that replaces an N+1 query storm.

### Patch Changes

- 78f834d: Wire the realtime-session factory so a LiveKit-bridged agent actually talks. Adds `BaseAgent.StartBridgeRealtimeSession()` — opens a raw `IRealtimeSession` for the agent (reusing the same model resolution + system-prompt/memory assembly as the client-direct realtime path, minus the RealtimeSessionRunner since the bridge engine owns turn-taking) — and `CreateBridgeRealtimeSession`, the provider-agnostic factory that resolves the agent + instantiates its `BaseAgent` and calls it. `RealtimeBridgeResolver` binds the factory onto `LiveKitAgentRoomCoordinator` at module load. The coordinator now threads `NativeModuleSpecifier` (default `@memberjunction/ai-bridge-livekit-native`, overridable via `LIVEKIT_NATIVE_MODULE` env / `SetNativeModuleSpecifier`) into the bridge session Configuration so the native room client loads. Completes the agent-talking path for the LiveKit bridge.
- Updated dependencies [9b9b484]
- Updated dependencies [8c896c4]
- Updated dependencies [4b9361b]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/ai-bridge-livekit@5.42.0
  - @memberjunction/ai-bridge-base@5.42.0
  - @memberjunction/ai-bridge-server@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0
