# @memberjunction/ai-bridge-server

## 6.2.0-edge.6

### Patch Changes

- f7a43b2: Calendars in Communication (#4789, A18). Communication providers gain CreateEvent, UpdateEvent, CancelEvent, GetEvent and SyncEvents, each taking a required CalendarTarget so an event never lands in a default mailbox; a provider without a calendar refuses each by name. The MS Graph provider implements them (calendarView delta sync, organizer cancel or attendee delete) and accepts a caller-supplied `accessToken`; the Gmail provider implements them on Google Calendar with the same OAuth client (the refresh token needs a calendar scope). The Communication engine adds `CalendarEventLinks` to create, update and cancel events linked to any record through `MJ: Calendar Event Links`, and to sync a calendar from the cursor in `MJ: Calendar Sync States`, handing each change to a `BaseCalendarEventLinkHandler` registered for the record's entity; stored credentials resolve through CredentialEngine. The realtime bridge's `GraphCalendarSource` and `GoogleCalendarSource` now read through the providers' SyncEvents; `GraphCalendarClient`, `GoogleCalendarClient`, the `IGraphCalendarLike`/`IGoogleCalendarLike` surfaces and the raw Graph/Google normalizers are removed, along with the bridge's optional Graph and googleapis dependencies. The Teams calendar scheduler polls through the MS Graph provider with the bot token. GetEvents and every existing operation behave as before.
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [f7a43b2]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
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
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/communication-types@6.2.0-edge.6
  - @memberjunction/ai-bridge-base@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
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
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-bridge-base@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- 1da00cb: An agent can now watch a LiveKit meeting. Set `realtime.video.watchMeetings: true` in the voiced agent's `TypeConfiguration`. When its realtime model takes video (Gemini 3.8 Live), the agent's bot joins with the `mj.agentWatches` attribute, so the room offers each person the choice, and reads the camera or shared screen of the people who allow it: one source at a time, at the model's frame rate, as JPEG (cameras scaled to 640 px on the longer side, screens to 1280 px). When a source whose frames reached the model ends (the person withdraws, leaves, stops sharing or turns the camera off), the model is told "[The agent can no longer see: Ada's camera]". In every meeting the bot now unsubscribes from video it does not read. The frame-rate and scaling math moves to `@memberjunction/ai` (`RealtimeVideoFrameIntervalMs`, `ScaleRealtimeVideoFrame`, `InboundVideoRateOf`), and the Gemini driver declares its video rate from the model's profile.
- 1aa4e00: The bridge engine forgets a bridge's first-frame diagnostics when the bridge stops. The engine remembers which bridges have logged their first inbound media frame and the agent's first outbound audio (verbose-only log lines); it kept one id per bridged call or meeting for the life of the process. A frame that arrives while a bridge is stopping, or after, records nothing and logs no first-frame line. Each bridge still logs the two lines once.
- acf0f5b: `BridgeMediaFrame` gains optional `Width`, `Height` and `KeyFrame`, so a bridge frame can say how large its video is and whether a decoder can start at it. The LiveKit bridge fills them on the camera and screen frames it hands the engine (the encoded JPEG's size; every JPEG is a key frame). The engine fills them on the avatar pieces it sends a bridge: the size the stream's init segment gives its video track, and for a fragment with video, whether its first frame is a key frame. Consumers that don't read them behave as before, and every field stays optional.
- 989f7fe: The realtime bridge engine's orphan reconcile closes only the bridges an earlier boot of the same MJAPI left, and no longer other MJAPIs' live bridges (#5310). Before, MJServer never gave the engine its identity, so every MJAPI stamped its bridges `unknown-host:pid:bootId`, and each one's reconcile (15 seconds after startup, then every 10 minutes) marked every other MJAPI's `Connecting` and `Connected` bridges `Disconnected` with reason `Janitor` and finalized their co-agent runs while the calls went on.
  - `Serve` gives the engine the identity its agent-session rows carry (`BindBridgeEngineHostInstance`), so bridge rows are stamped `hostname:port:pid:bootId`.
  - `IHostInstanceIdentity` has `GetInstancePrefix()` in place of `GetHostNamePrefix()`, and a new `IsPriorBoot(id)`. `ReconcileOrphans` reads the open bridges under the instance prefix and closes those `IsPriorBoot` accepts, checking each id exactly, since a SQL `LIKE` reads a `_` in a host name as any character. MJServer's `HostInstanceIdentity` has both methods; a host that injects its own identity needs them too.
  - The engine's `HandleStartup` no longer starts the orphan reconcile. The host starts it (`StartOrphanReconciliation`) once it owns its instance: `Serve` does so after it listens (`StartBridgeOrphanReconciliation`), so an MJAPI started on a port another MJAPI still serves can't close that one's bridges before it fails to bind.
  - `DefaultHostInstanceIdentity`, used until a host injects one, names this process alone (`hostname:pid-<pid>:<pid>:<bootId>`), so it never matches another process's bridges.
  - Bridge rows stamped `unknown-host:…` before the upgrade belong to no instance, so the reconcile no longer closes them.

- b699a37: The realtime bridge carries meeting video safely. The engine sends a shared screen (`screen-in`) to the model as video (it was tagged as audio), and sends camera and screen frames only to a session that declares inbound video: a driver that takes audio only, or declares no capabilities, would otherwise read an image as audio. `InboundVideoStreamsOf(capabilities)` in `@memberjunction/ai` tells a host how many inbound video streams a live session takes. `BridgeMediaFrame` gains optional `SourceID` and `SourceLabel`, so a bridge can say which camera or screen a frame comes from.
- 08a4cfc: The meeting bot publishes an agent's avatar. Before an agent's meeting session opens, the room coordinator asks the native room module whether the bot can publish one (`describeAvatarVideo`: `@livekit/rtc-node` with video publishing, and ffmpeg 4.2 or later with the H.264 and AAC decoders, from `MJ_FFMPEG_PATH` or the `PATH`, probed once per thread); only then does the session ask for it (`RealtimeAvatarSettings.Delivery: 'room'`, threaded through the bridged session prep), and the Gemini driver grants it on an endpoint that renders avatars (VIDEO, the avatar at 2 Mbps), with the decision on `IRealtimeSession.AvatarStatus`. A granted bridged Gemini session sends the avatar's fragmented MP4 as typed frames through `IRealtimeSession.OnVideoFrame`, plays PCM only before a turn's first video, drops media from `interrupted` to that turn's `turnComplete`, and reports the avatar video it generated as `OutputTokenDetails.VideoSeconds` deltas through `OnUsage` (counted up to `generationComplete`). The engine sends the pieces on `video-out` with their MIME type; in a full-duplex multi-agent room each piece passes the floor gate by its audio's duration (`FullDuplexTurnGate.OnOutputDuration`). The LiveKit bridge routes `video/mp4` frames to the room client (`publishAvatarMedia`), which reads them with Core's fMP4 reader (`ReadFmp4Fragment`, `AvccToAnnexB`, `AdtsHeader`, and `Fmp4AudioSeconds` beside AV9's `Fmp4VideoSeconds`; `ReadFmp4Init` also reads a track's size, the trex sample size and flags, the H.264 parameter sets and the AAC config), decodes them in two long-lived ffmpeg child processes, queues the voice on the bot's audio track and shows each frame on a camera track (`agent-avatar`, LiveKit's default simulcast, published at the first frame) when the voice's playout reaches the frame's timestamp. A barge-in drops the queued frames and fences both decoders; the last frame stays on screen. A decoder that dies is restarted; three failures of one decoder within 60 s, or a refused camera track, take the avatar down: the track is unpublished, the bot sets `mj.agentAvatar` to `audio-only:<reason>` (agent bot tokens now carry `canUpdateOwnMetadata`), and the engine replaces the model session with an audio-only one (`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`). The bot's join token carries `mj.agentAvatar` (`on`, or `audio-only:<reason>` with `decoder-missing` when the host has no usable ffmpeg); Core adds the attribute helpers and the reasons `decoder-missing`, `decoder-failed` and `publish-failed`, which `ParseRealtimeAvatarStatus` reads and `REALTIME_AVATAR_UNAVAILABLE_REASONS` lists (from the same table); the call and mobile notices word them "Audio only for {Agent}: the avatar couldn't be shown in this meeting". `GeminiEnterpriseRealtime` renders a bridged session's avatar the same way. With the media worker on, the pieces are transferred to the worker, a restarted worker gets the stream's init again, and one restarted after a take-down joins audio only. Integration check RD17 (the LiveKit provider allows video out, and the native module answers the avatar probe). The MJAPI image can install a pinned LGPL static ffmpeg (BtbN) checked against its sha256; it is off by default (`INSTALL_FFMPEG=false`, so meetings stay audio only): fill in the pin values and build with `--build-arg INSTALL_FFMPEG=true` to turn it on.
- 69bf67c: An agent that watches a LiveKit meeting now picks which camera or screen its model sees, instead of keeping the first one until it ends. A shared screen comes first (the most recent share). After that comes the camera of whoever leads LiveKit's active-speaker list, once they have led for 1.5 s, then the camera already in view, then the camera of whoever spoke last, then the first camera in the room. A camera stays in view for 4 s from its first frame before another camera replaces it. A shared screen, a withdrawn consent and an ended source never wait. The bot itself and other agents never count as speakers. Only the chosen source is subscribed and read: a switch drops the old one, then subscribes the new one. The model is told what it sees: "[You can now see: Ada's screen]" right before the first frame of each source new to its session, and "[You can no longer see: Bob's camera]" when a source it saw stops, including on a switch (the ended note used to read "[The agent can no longer see: …]"). The hold lengths can be overridden through the bridge's `Configuration` (`VideoSpeakerOnsetMs`, `VideoSpeakerHoldMs`). Room telemetry gains `sourceSwitches`, `switchesHeld`, `activeSpeakerUpdates` and `switchGapMsLast` / `switchGapMsMax`. The live check script gains a switch scenario (`VISION_SCENARIO=switch`).

  A browser call's video notes use the same second-person set. `VideoSourceArbiter` now says "[You can now see: Camera]" when what the model sees changes (it said "[The agent is now viewing: Camera]"), "[You can no longer see: Whiteboard (the user turned it off)]" when a source is turned off (it said "[The user turned off the agent's view of: Whiteboard]"), and "[You can now see: Whiteboard (turned back on)]" when it is turned back on (it said "[The agent can see Whiteboard again]"). The notes are sent at the same moments as before, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override them.

- 95e5dd9: fix(memory-leaks): round 18 audit — release OpenAI Live session handlers/timer on Close, delete per-session bridge diag flags, sweep and cap the dial-in rate limiter, detach MCP toolsSynced listener on failure, don't arm the telephony dashboard interval after destroy
- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- 5dc3752: In a multi-agent meeting with moderator mode on, a Gemini avatar's video between answers no longer takes the room's floor. The full-duplex floor gate counts an avatar piece by the audio it carries, and a piece with none (the face the avatar shows between answers) started a burst like speech: it held the floor until the 20 s safety release and counted as the agent's turn; the next piece was then cut, and each later one kept the muted burst alive, so the agent's next answer was dropped. A chunk with no speech now never starts a burst or keeps one going; inside a burst it goes with it. `RealtimeVideoFrame` gains `Idle`, which a driver sets on video the model streams between answers: the bridge engine counts such a piece as no speech, whatever its audio track holds, and the Gemini bridged avatar marks every piece outside an answer.

  A bridged Gemini session now closes the client turn a context note left open, after a tool result, as the browser driver does. A note goes out as client content with `turnComplete: false`, and Gemini then holds the continuation after a tool result until a `turnComplete: true`, so the model could stay silent after a delegated result. `SendToolResult` follows the result with a bare `turnComplete: true` when a note left the turn open, on a model whose tools can block and while no answer is being generated; otherwise the model's own `turnComplete` takes the note in. Gemini 3.8 Live Extended Thinking, whose tools never block, gets no close: it may still be reasoning, and the close would cut it off.

- 35ed7b5: `IRealtimeSession.SendInput` takes one `RealtimeInputFrame` (`Data`, `Kind`, and optional `MimeType` and `TimestampMs`) instead of `(chunk, kind?)`. A realtime driver outside this repo must change its `SendInput` signature, and a caller passes `{ Data: chunk, Kind: 'audio' }`. The bridge engine passes each inbound frame's type and capture time, and `BridgeMediaFrame` gains an optional `MimeType`. The server Gemini Live driver sends a JPEG or PNG video frame as video instead of as audio, sends audio in the PCM format the frame names, and drops a frame it cannot send, reporting each type once. The other drivers behave as before.
- e293b68: A realtime model's video output comes as typed frames. Core adds `RealtimeVideoFrame`, a union of three kinds, each with its MIME type: `fmp4` (a piece of fragmented MP4, `Piece: 'init' | 'fragment'`), `chunk` (one encoded frame, H.264 in Annex B form or VP8, VP9 or AV1, with a required `PresentationTimeMs` and `KeyFrame`) and `image` (JPEG, PNG, WebP). `PresentationTimeMs` is on the stream's own media timeline, not wall-clock time; `Width` and `Height` are optional. `Fmp4PieceToVideoFrame` builds an fMP4 frame from a model part: the piece from its first box, an init's picture size from its video track, and a fragment's time and key-frame flag from its first video sample; bytes neither labelled `video/mp4` nor opening with an MP4 box give `null`. `IRealtimeSession.OnVideoFrame` replaces `OnAvatarOutput` and `RealtimeAvatarMediaChunk`, which were added earlier in this release, and `OnVideoOutput` is deprecated (hosts still forward it; it goes in the next major version). A granted bridged Gemini avatar, on the Developer API or Gemini Enterprise, sends its pieces as frames through `OnVideoFrame`, and the browser Gemini client hands frames to `VideoPlayout.Append(frame)` (`IAvatarVideoPlayout.Append` takes a frame); both drop a `video/*` part that isn't MP4 and report it once per type. The bridge engine forwards each frame on `video-out` with its MIME type and copies what the frame says about its video onto the bridge frame (`Width`, `Height`, `KeyFrame`: an image is a key frame, an fMP4 init carries its own size, and an fMP4 fragment with video carries its key-frame flag and the size of the stream's init); in a full-duplex multi-agent room the floor gate reads an fMP4 frame's piece (an init passes, a fragment counts its audio), and encoded chunks and images pass ungated because their voice comes as PCM, which is gated. `VideoPlayout` plays `fmp4` frames and drops any other kind, reporting `'no-decoder'` once.
- d2cb42e: The rule that tells an agent's bot from a person in a meeting room now lives in one place, `@memberjunction/ai`: `AgentParticipantIdentity(agentSessionId)` gives a bot its participant identity (`agent-<agent session id>`), and `IsAgentParticipantIdentity(identity)` reads one back (any identity starting with `agent-`, in any case). The LiveKit room coordinator mints the bot's identity with it; the LiveKit bridge, the bot's video watcher and the bridge engine read identities with it, where the engine had three inline copies of the check. `IsAgentParticipantIdentity` in `@memberjunction/ai-bridge-livekit` is deprecated and calls the shared one, and the package now depends on `@memberjunction/ai`. The engine's verbose first-frame log says what arrived: "The agent can SEE your camera." or "...your screen." for video (it said "The agent is HEARING you." for every track); the line for audio is unchanged. Nothing else behaves differently.
- cbddadb: The notes a realtime model gets when the video it sees changes now come from one module in `@memberjunction/ai`: `VideoSourceSeenNote` ("[You can now see: Ada's screen]", several sources joined with ", "), `VideoSourceEndedNote` ("[You can no longer see: Bob's camera]"), `VideoSourceTurnedOffNote` ("[You can no longer see: Whiteboard (the user turned it off)]") and `VideoSourceTurnedOnNote` ("[You can now see: Whiteboard (turned back on)]"). A browser call's `VideoSourceArbiter` and a meeting's bridge engine both build their notes with them, where each had its own copy of the wording. No note's text changes, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override the call's. `@memberjunction/ai-bridge-server` no longer exports its own `VideoSourceSeenNote` and `VideoSourceEndedNote`, added earlier in this release; import them from `@memberjunction/ai`.
- 6b487b8: In a meeting, the note that tells the model it can no longer see a camera or screen now names the source as the model was told with its first frame. The bridge engine named it by the label the driver reported when the source ended, so after a person was renamed mid-meeting, or when the first frame was read before they had a name, the model read "[You can no longer see: …]" with a name it had never been given. The name for a camera or screen that has none of its own ("a participant's camera", "a participant's screen") now comes from `UnnamedVideoSourceLabel` in `@memberjunction/ai`, beside the video notes; the LiveKit bridge's `VideoSourceLabelOf` and the bridge engine each wrote it. The documentation of `BridgeVideoSourceEnd.SourceLabel` says it can differ from the name the model was given.
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
- Updated dependencies [1da00cb]
- Updated dependencies [acf0f5b]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
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
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [69bf67c]
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
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/ai-bridge-base@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 279b93e: Multi-agent rooms now take turns properly with full-duplex realtime models, and the Live Room doubles as an agent test bed.
  - **Model-side addressing.** `IAddressedMatcher` gains a model-judged implementation next to the name-matching one. Full-duplex sessions get two host tools, `i_am_addressed` and `yield_turn`, because neither vendor offers a native signal. `TurnAddressing` (`Auto` | `ModelSide` | `Regex`) is selectable per session; `Auto` uses the model's judgement when the model reports the new `FullDuplex` capability (GPT-Live, Gemini 3.8 Live with always-on proactive audio) and name matching otherwise.
  - **Floor discipline.** `MultiAgentRoomCoordinator` now grants hand-offs with a TTL (a third agent cannot jump in), keeps backchannels (short "mm-hm" acknowledgements) off the floor, lets a person's speech preempt the holder through the existing barge-in flush path while delegated work keeps running, and caps consecutive agent-to-agent turns (default 8, configurable). A new `FullDuplexTurnGate` enforces it on models that decide for themselves when to speak, so two agents never speak at once even if neither asks first.
  - **Test bed.** New `GetLiveKitRoomTurnState` query and typed `GraphQLLiveKitClient.GetRoomTurnState`; new `mj-livekit-turn-state` widget; the Live Room gets per-agent turn mode and addressing pickers, roster badges and a live Turns panel (floor holder, hand-offs, backchannels, loop cap, event feed) that also works for a person who joins an existing room.
  - **Tests.** A deterministic replay harness with twelve recorded room timelines asserts no overlapping agent speech, no run beyond the loop cap, humans always preempt and backchannels never take the floor.

  No schema, metadata or CodeGen changes. Live-model behaviour of the host tools is not yet verified; see the "Multi-agent rooms" section of `plans/realtime/bridges-and-widget/LIVE-CALL-CHECKLIST.md`.

- 1595b7d: Persist resolved TurnAddressing on AIAgentSessionBridge rows
- 4840fff: Phone calls now get the same agent as the browser path, survive a dropped model connection, and can transfer, send DTMF and hang up.
  - **One co-agent resolution for every host.** The MJServer resolver's chain (explicit, the target's `DefaultCoAgentID`, the type default, then the global Realtime Co-Agent) and its `CanRun` filter on delegation agents moved to `ResolveRealtimeCoAgentID` / `FilterAllowedAgentsByCanRun` in `@memberjunction/ai-agents`. Twilio, Vonage and RingCentral use them, and the dialled agent is now the TARGET voiced by the co-agent instead of being used as both.
  - **Caller identity extension point.** `BaseCallerIdentityResolver` (register under `TelephonyCallerIdentity`) lets a host say who an inbound caller is. MJ core knows nothing about contacts; the default treats every caller as anonymous, and the model is told the caller ID is unverified.
  - **Phone-aware agent.** The model is told it is on a phone call and gets `transfer_call`, `send_dtmf` and `end_call` tools, offered per the carrier's `CallTransfer` / `DTMF` features. A transfer destination goes through the same E.164 and allow/block-list policy as an outbound dial. Keypad presses from the caller reach the model as one note per burst.
  - **Transfers go to a configured directory only.** `telephony.transferTargets` (`{ name, number, description? }`) lists where the agent may transfer a call; the tool takes a name, never a number, so an unverified caller cannot get free forwarding to an arbitrary number. Entries are validated against the outbound policy at startup, and with none configured the tool is not offered.
  - **Barge-in follows the browser policy.** Talking over the agent drops queued progress narration but does not cancel delegated work; the new `cancel_pending_work` tool is the explicit cancel.
  - **Transfer and DTMF no longer end the call.** Twilio sends DTMF as in-band tones instead of replacing the TwiML, and a transferred or goodbyed call is handed to the carrier rather than hung up when the media stream stops. Vonage uses its DTMF API; RingCentral detaches without a BYE.
  - **Model-drop recovery.** A lost realtime model session is reopened once with the conversation so far; if that fails the caller hears a carrier-side message (Twilio `<Say>`, Vonage `talk`) and the call ends. No retry loop.
  - **Spoken progress.** Delegations narrate progress on bridged calls.
  - **Transcript in the call's own conversation**, attributed to the dialled agent, instead of a shared "Meeting Room" conversation.
  - **Cleanup.** `ReconcileOrphans` runs at startup and every 10 minutes; ended calls close their `MJ: AI Agent Sessions` row; live calls heartbeat it so the host janitor does not close a long call.
  - **`telephony.maxConcurrentCalls` (default 25).** Over the cap an inbound caller hears "all agents are busy" and an outbound request is refused with `at-capacity`. Set it at or below the realtime model plan's concurrent-session limit.
  - **RingCentral `HealthCheck`** reports unhealthy when SIP registration failed or has been pending past a minute, with the reason.
  - **Audio.** A stateful per-direction resampler with a low-pass filter replaces the stateless one, removing frame-edge clicks and aliasing when 24 kHz model audio is sent at 8 kHz.
  - **Fixes.** Inbound bridge rows are stamped `InboundRoute` / `Active` rather than `OnDemand` / `Passive`; the roster no longer swaps the agent's and the caller's numbers; and the Twilio signature URL is the public URL's origin plus the request path, so a public URL ending in `/graphql` no longer double-counts the path.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [8db8973]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-bridge-base@6.2.0-edge.3

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
  - @memberjunction/ai-bridge-base@6.2.0-edge.0
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
  - @memberjunction/ai-bridge-base@6.1.0-edge.6

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
  - @memberjunction/ai-bridge-base@6.1.0-edge.5

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
  - @memberjunction/ai-bridge-base@6.1.0-edge.4

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
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-bridge-base@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-bridge-base@5.51.0
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

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-bridge-base@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-bridge-base@5.47.0
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
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/ai-bridge-base@5.45.1
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
  - @memberjunction/ai@5.45.0

## 5.44.0

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
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-bridge-base@5.43.0

## 5.42.0

### Patch Changes

- 4b9361b: Add native two-way SDK bindings for all realtime-bridge providers. Each provider package gains a native send-capable SDK binding (the adapter that drives bidirectional audio + host/call controls over a real platform SDK, behind an injectable native-module loader and tested against fake modules). Adds a `BridgeNativeSdkRegistry` (in ai-bridge-base) keyed by `DriverClass` so the engine auto-binds the correct native factory at `StartBridgeSession`, with a per-session `BindSdk` override for choosing a non-default binding (e.g. Zoom RTMS receive-only) or injecting a fake. This is the MJ-side adapter + wiring layer; the platform-specific native media client (e.g. Teams ACS media streaming) and the session-start harness are the remaining work.
- Updated dependencies [9b9b484]
- Updated dependencies [4b9361b]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/ai-bridge-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- 8fd6f59: Realtime Bridges (Phase 0+1): new media-transport layer that connects the one realtime agent engine to external endpoints — meetings (Zoom/Teams/Slack/Meet/Webex/Discord) and telephony (Twilio/Vonage/RingCentral/VOIP). Adds the v5.42 schema (5 entities: AIBridgeProvider with a strongly-typed SupportedFeatures JSON column, AIBridgeAgentIdentity, AIBridgeProviderChannel, AIAgentSessionBridge, AIAgentSessionBridgeParticipant — the bridge is an attachment to the existing AIAgentSession, not a new session). New packages @memberjunction/ai-bridge-base (BaseRealtimeBridge media driver with capability gating, AIBridgeEngineBase cache, pure passive/active/hybrid TurnTakingPolicy) and @memberjunction/ai-bridge-server (AIBridgeEngine completing the deferred server-bridged transport seam — bridge media ↔ IRealtimeSession.SendInput/OnOutput — plus a LoopbackBridge, host affinity and janitor). Five server-side EntityServer validation invariants. Nothing is audio-specific (typed directional audio/video/screen tracks).

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/ai-bridge-base@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0
