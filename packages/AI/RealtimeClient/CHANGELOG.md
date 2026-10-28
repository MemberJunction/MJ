# @memberjunction/ai-realtime-client

## 6.2.0-edge.5

### Patch Changes

- 72dd65c: Adds `realtime.session.transcriptionLanguages`, a caption-language hint for realtime voice sessions, and makes a rejected Gemini Live connect fail instead of hang.
  - Gemini Live captions both sides of a call with its own transcription, and with no hint it guesses each utterance's language, so an English call could show captions in Arabic, Tamil or Korean script. `"transcriptionLanguages": ["en-US"]` (BCP-47 codes) under `realtime.session` is sent as `languageCodes` on both caption streams. It is a hint, not a lock: other languages still caption in their own script. Unset, nothing changes.
  - Set it on the target agent's `TypeConfiguration` (agent types without a `ConfigSchema`), an agent type's `DefaultConfiguration`, or a runtime override. A Realtime-type co-agent cannot save it yet: that type's schema does not declare `realtime.session`, which was already true for every session key.
  - The OpenAI-protocol drivers scrub the key, and the other drivers drop it with the rest of the shared session keys.
  - The relay's Live setup writer now keeps `languageCodes` on the Developer API, as SDK 2.14+ does, so relayed sessions carry the hint too.
  - Raises `@google/genai` from `^2.8.0` to `^2.16.0`, because SDKs before 2.14.0 throw on `languageCodes`. Set the key only after every browser bundle that opens Gemini sessions is rebuilt on this release.
  - A Gemini Live connect now rejects with the close reason when the socket errors or closes before setup completes, in the server and browser drivers for both the Developer API and Gemini Enterprise. Before, a close before the socket opened hung on any SDK, and from SDK 2.11 so did a rejected key, model or setup field.

- 7fb8598: Recorded realtime sessions on drivers that send the user's speech only as one final transcript (OpenAI Realtime, HuggingFace, xAI, ElevenLabs) no longer store `UtteranceStartMs = 0` as a placeholder. `BaseRealtimeClient` gains `OnUserSpeechStart`, raised on every OpenAI-protocol `input_audio_buffer.speech_started` frame, and the realtime runtime relays that onset as the user turn's start. A turn whose start was not measured (for example every ElevenLabs turn after the first) is now stored as NULL instead of 0, and readers fall back to the turn's creation time.
- Updated dependencies [0d81c53]
- Updated dependencies [3080e83]
- Updated dependencies [81aea34]
- Updated dependencies [2274f42]
- Updated dependencies [230cdad]
- Updated dependencies [4e4c82d]
- Updated dependencies [72dd65c]
- Updated dependencies [17a4137]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 1ea4085: A realtime channel's surface now shows where its `MJ: AI Agent Channels` row says. The row's `UIConfig` JSON gains `Placement` (`stage`, `pip`, `tab` or `hidden`; the tab when absent) and `AllowedPlacements` (where the user may move it; anywhere when absent), and CodeGen regenerates the typed `UIConfigObject` accessor. The runtime reads each row's placement when it builds the channel (a row whose `UIConfig` is not valid JSON keeps its channel and starts on its tab) and exposes it as `BaseRealtimeChannelClient.SurfacePlacement`. The call overlay starts each surface there, offers only the allowed placements in "Move to…", hides "Bring it here" when the tab is not allowed, and sends a surface leaving the stage to where its channel places it, using the media module's newly exported `PlacementOffStage`. No existing row sets a placement, so every surface still starts on its tab.
- 22c9074: Realtime Channels v2, second phase: an Interactive Component channel, several video sources with one arbiter, and exposure policy. Existing channels, tool names and hosts are unchanged.

  `minor` because the branch edits `metadata/` (a new `MJ: AI Agent Channels` row, and `Privacy.ZeroDataRetention` and `RequireZeroDataRetentionFor` in the `IAIConfiguration` / `IAgentSettings` JSON types). There is no migration and no new entity column.
  - **Interactive Component channel** (`@memberjunction/ng-conversations`, `@memberjunction/ai-agents`, `@memberjunction/ng-react`). Shows any component artifact next to the call and lets the agent operate it. Multi-instance, opt-in, on-demand. Its contract is derived from the component's spec: custom methods and the standard methods it supports become verbs with parameter schemas, `getCurrentDataState` becomes the instance's data, spec events become channel events, spec properties become the schema of the opening inputs. Built-ins: `open`, `show_version` (swaps an open instance to another version of its own artifact in place, keeping its id), `close`. Artifacts load through the signed-in user's own access. Delegated component artifacts can open automatically (`channels.config.InteractiveComponent.autoOpenDelegatedComponents`, off by default), and a newer version of an open component replaces it in place. `MJReactComponent` gains a public `Refresh()`. New `InteractiveComponentChannelServer` and a `MJ: AI Agent Channels` row.
  - **Multi-instance and delegated-artifact hooks** (`@memberjunction/realtime-runtime`). `OnOpen` can name the instance it created; `Complete` and `EmitChannelEvent` take an optional instance. A channel can ask to be offered the artifacts of a delegated run (`AcceptsDelegationArtifacts` / `OnDelegationArtifacts`); the runtime mounts it if needed and reveals its tab.
  - **Several video sources** (`@memberjunction/ai`, `@memberjunction/ai-gemini`, `@memberjunction/ai-realtime-client`). Tracks carry a `SourceID` and `Label`; model profiles declare `MaxInboundVideoStreams` (1 for Gemini 3.8 Live and Extended Thinking, 0 without video input) and negotiation caps the streams to it. `SendVideoFrame(data, mime, sourceId?)`. `VideoSourceArbiter` is the single writer of inbound video: it passes every enabled source through on a multi-stream model; on a one-stream model it picks by a policy that is data (user pick, most recent capture, focused surface, newest), tells the model `[The agent is now viewing: <label>]` on every switch, and paces to the negotiated rate. The channel video bridge now registers with the arbiter; its exports are unchanged.
  - **"Agent can see" and exposure policy** (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). The realtime overlay shows which sources the agent can see, with a switch per source, remembered per user per channel. A channel's exposure is the lowest of its own ceiling, the agent's `channels.config.<Key>.maxExposure`, a zero-data-retention requirement and the user's choice; the server decides all but the last and returns it in the session policy. `requireZeroDataRetentionFor: ['state' | 'pixels']` lowers exposure when the session model's configuration does not declare `Privacy.ZeroDataRetention: true`, and the agent is told why. Exposure gates what is volunteered to the model (state notes and frames), and, for a verb that declares `ReturnsChannelData`, what the agent may ask for (the verb is refused whole below its level; see the third phase).
  - **Session tuning.** `realtime.session.unverifiedMaxSeconds` and `verifiedMaxSeconds` (positive integers) pass through the configuration cascade; `channels.config.<Key>` reaches a channel intact.

### Patch Changes

- c8409ce: The shared media kit can let a person choose whether the agents in a room see their camera and shared screen. `mj-media-controls` shows a "Let the agent see your camera and screen" button when the host sets `ShowAgentVision` (filled while `AgentVisionOn`, labelled "Let the agent see me" / "Hide from the agent" with `ShowLabels`) and reports clicks through `AgentVisionToggled`; the host does what the person asks. `mj-media-tile` shows an "Agent can see" chip when the participant's new `MediaParticipant.AgentCanSee` is set. With `AgentCount` above 1 (a room with more than one agent) the words are plural: "Let agents in this room see your camera and screen", "Let agents see me" / "Hide from agents", "Agents can see".
- 155aa45: Live-avatar settings that change without a rebuild, and a Google Cloud API key as a Vertex AI credential.

  `MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS` sets the `avatarConfig.videoBitrateBps` a Gemini Live avatar session asks for, in bits per second: 2,000,000 when unset, as before, and `0` leaves the field out. A value that is not a whole number is logged once and the default is used. It is read wherever MJ writes the avatar into a session's config, so the browser mint, MJAPI's relay setup and server-side (meeting) sessions all follow it (`ResolveGeminiAvatarVideoBitrateBps`).

  `MJ_GEMINI_LIVE_MODEL_ALIASES` gives a model id the Gemini Live profile table does not know the profile of one it does: `<model id>=<known model id>`, comma-separated, such as `gemini-live-3.8-preview=gemini-3.8-live`. Google is still sent the catalog's API name; what the model accepts and renders (the avatar on Gemini Enterprise) comes from the known model's row. An alias matches the whole id and wins over the table. Bad entries are named in one log line, and each alias is logged once when first used.

  The Vertex AI key JSON (`VertexAICredentials`) takes two optional Gemini Live fields, which `GeminiEnterpriseRealtime` uses for the relay's upstream and for server-side sessions: `liveApiVersion` (`v1` when unset; for example `v1beta1`) and `liveHost` (a host name with an optional port, bare or after `https://` or `wss://`, with nothing after it). A `liveHost` is honoured only in the platform's environment key, since MJAPI sends the token or API key to that host. Anything else is refused with a `VertexCredentialsError` (`invalid-live-host`, `invalid-live-api-version`, `live-host-not-allowed`) whose message quotes no value.

  The key JSON may hold a Google Cloud API key (`apiKey`), never beside another credential (`api-key-with-credentials`; `invalid-api-key` for one a header cannot carry). Alone, it takes Google's global route, as `@google/genai`'s API-key mode does: the global host and the model's short name (`publishers/google/models/<id>`). With a `project` (and a `location`, `us-central1` by default), it takes the regional route: the location's host and the full model name. Either way the relay and server-side sessions send it as `x-goog-api-key` instead of an OAuth bearer, and it never reaches the browser, the session pact, the relay URL or the logs. `VertexGenAIOptions` gives the SDK the key alone, so `VertexLLM` uses the global route with either shape. `BuildGeminiLiveSetup` takes `UsesApiKey`, and `BuildGeminiLiveModelPath` is exported.

  An avatar part that opens with an MP4 box (`ftyp`, `moov`, `moof`, `styp`) plays as the avatar whatever MIME type it names, in the browser client and in server-side sessions, which hand it to the meeting room labelled `video/mp4`. A part that is not MP4 and names a type other than video or PCM never plays. `SniffFmp4Piece` reads a `moov` first as an init segment.

  MJAPI logs each realtime relay or proxy upgrade it refuses for its Origin (`MJ_REALTIME_PROXY_ALLOWED_ORIGINS`): `[RealtimeRelay] upgrade refused (403): origin "<origin>" is not in MJ_REALTIME_PROXY_ALLOWED_ORIGINS` (`[RealtimeProxy]` on the proxy path), with the origin's printable characters only, and never the ticket or the path.

- 4412e85: Gemini avatar sessions no longer take the idle video Vertex AI streams between answers as the agent speaking (#5312). Every streamed piece used to mark the model busy and, in the browser, the agent `'speaking'`: after an answer, the next idle piece held context notes, spoken updates and blocking tool results until the next `turnComplete`, finalized the user's transcript early, and kept `IsAudioPlaying` true; in a meeting it made the bridge's next commit look like a duplicate. Now the model's answer runs from its first transcribed words, or a PCM voice part that plays, until its `generationComplete`, the turn's `turnComplete`, a barge-in or cancel, a tool call, or a resume. Video inside the answer is the answer's; video outside it is idle, and still plays (the avatar keeps its face) but marks nothing. `GeminiAvatarOutput.Accept` returns `'answer'`, `'idle'` or `'dropped'`, and the browser client marks generation started only for the answer's parts; the bridged session's `responseActive` follows the same answer through the bridged avatar output's new `OnAnswer` sink. `IsAudioPlaying` counts the avatar only while some of an answer's media is still ahead of the playhead: `IAvatarVideoPlayout` and `IVideoFrameDecoder` gain `FramesAhead`, the frames handed over that are still to play (the MSE decoder records where each appended piece ends; the WebCodecs and image decoders count their queues). Usage counting is unchanged. The video conformance kit's VC13 adds the idle video after a turn, for harnesses that implement the new optional `AnswerStarted`, and its recording player gains `FramesAhead`.
- 6dce70c: A call keeps the agent's video in its place while the session resumes on a new connection. A resume (Google's `goAway`, a dropped socket, or the Enterprise relay's new socket) takes the call through `'connecting'`, and the overlay used to swap its hero for the connecting screen then: the video lost its place, and the stage laid it over the whole call, banner and controls included, until the call was back. Now the connecting screen gives way to a hero the agent's video presents in (`RealtimeSessionOverlayComponent.ShowConnectingScreen`), so the video keeps its place and its element, its last frame stays on screen, and its tile says "Connecting". After about a second without a frame, the tile's stall fallback shows the orb in the video's place, as before, and the next frame brings the video back. Video that arrives while a call first connects goes to the hero the same way. The console chrome, a video moved to picture-in-picture and a call with no video still show the connecting screen as before.

  `@memberjunction/ai-realtime-client` has no code change. Its tests now drive a resume with the real `VideoPlayout` (after `goAway`, after a dropped socket, and through the Enterprise relay) and check that the player keeps one element, media source and source buffer, lets the cut turn play out without a flush, appends the new connection's init segment and fragments to the same buffer and plays on from the last frame, and still flushes on barge-in. The test MSE fake now reopens an ended stream on the next append, as browsers do.

- 6cd23e1: A call whose agent asked for a live avatar it can't show says so once. Core gains `RealtimeAvatarStatus`, `ClientRealtimeSessionConfig.AvatarStatus`, `BaseRealtimeModel.SupportsAvatarOutput(model)` (default `false`; Gemini answers from its Live profile) and `ParseRealtimeAvatarStatus`, and the browser-side reason `downgraded` becomes `host` and `browser` (the Gemini and Gemini Enterprise browser clients log the new reason). Both Gemini drivers (`GeminiRealtime`, and `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`) return their avatar decision on the mint, through the protected `AvatarStatusFor`; `RealtimeClientSessionService.PrepareClientSession` merges it with the persona resolution (`endpoint` first, then `no-binding` / `unknown-avatar`, else the driver's decision), logs one line, and returns `AvatarStatus`, which MJServer sends as `StartRealtimeClientSessionResult.AvatarStatusJson`. The stock launcher asks for the field and drops it alone against a server that predates it. After the call connects, the runtime publishes `AvatarNotice$` (`host` when the app asked for no agent video, `browser` when the track did not go live, else the status's reason), once per call, and clears it when the call ends. `ng-realtime-media` holds the wording (`AvatarNoticeText`, "Audio only: …", per-reason host overrides) and declares `@memberjunction/ai`; the call overlay shows it as a small info `mj-alert` under the banner in both chromes, with a dismiss button, hiding after 10 s, never in review (`AvatarNoticeLabels` overrides the words). Calls whose agent asked for no avatar look as before. Integration check RD13 also checks that a voiced agent without a face on the session's vendor asks for no avatar and reports `no-binding`.
- de2dc2f: Avatar video in realtime usage and cost. The Gemini browser client counts the seconds of avatar video a model turn generated from the fragments' durations (Core's fragmented MP4 reader gains track timescales and `Fmp4VideoSeconds`), until `generationComplete` (an interrupted turn counts what arrived before `interrupted`), and emits them once, as amounts, in `OutputTokenDetails.VideoSeconds`; it also reads Google's response-side token split, VIDEO included (`RealtimeUsageModalityDetail.VideoTokens`). The runtime relays the full input and output detail blocks, and an update that carries only video seconds; `RelayRealtimeUsage` takes them as an optional `usageDetailsJson` argument, and `AccumulatePromptRunUsage` adds them into the co-agent prompt run's `ModelSpecificResponseDetails.RealtimeUsage` record, with the stored video seconds capped at the run's elapsed time plus 30 seconds. At finalize, a run whose model vendor configuration has `Realtime.Pricing.AvatarVideoOutput` (per minute) is priced at its cost row plus a video line, the video's output tokens leave the cost row's output bucket, and the lines are written under `CostLines`; without that price the run prices as before. The agent-run analytics cost card shows the avatar video on its own line and no longer prices the video's tokens as output. Integration check RD16 stores a minute of avatar usage on a co-agent-shaped prompt run for Gemini 3.8 Live on Vertex AI, finalizes it, and checks its cost lines.
- 1da00cb: An agent can now watch a LiveKit meeting. Set `realtime.video.watchMeetings: true` in the voiced agent's `TypeConfiguration`. When its realtime model takes video (Gemini 3.8 Live), the agent's bot joins with the `mj.agentWatches` attribute, so the room offers each person the choice, and reads the camera or shared screen of the people who allow it: one source at a time, at the model's frame rate, as JPEG (cameras scaled to 640 px on the longer side, screens to 1280 px). When a source whose frames reached the model ends (the person withdraws, leaves, stops sharing or turns the camera off), the model is told "[The agent can no longer see: Ada's camera]". In every meeting the bot now unsubscribes from video it does not read. The frame-rate and scaling math moves to `@memberjunction/ai` (`RealtimeVideoFrameIntervalMs`, `ScaleRealtimeVideoFrame`, `InboundVideoRateOf`), and the Gemini driver declares its video rate from the model's profile.
- 961d529: `ClientRealtimeSessionConfig` gains `Transport` (`'direct'` or `'relay'`; absent means direct) and `RelayUrl`, so a minted session says how the browser reaches its provider. The Gemini Enterprise mint returns a relay session: `Transport: 'relay'`, the relay URL as `RelayUrl` (the ticket is in its path) and an empty `EphemeralToken`. MJAPI's `StartRealtimeClientSession` returns both fields; the realtime runtime and the support widget ask for them and hand them to the client driver, and mint without them against a server that predates them. The `'gemini-enterprise'` client connects to `RelayUrl` and refuses a session that is not a relay session. Every other client driver refuses a relay session in `Connect` (`BaseRealtimeClient.AssertTransportSupported`); a driver that can open one opts in through `SupportsRelayTransport`. The relay URL is never logged.
- b2441c3: The Gemini browser client plays a granted avatar. When the minted session config carries an `avatar` block and the host shows the agent's video, the client hands a `VideoPlayout` to the host at connect and plays the avatar's fragmented MP4 parts through it; the first init segment decides whether the video or separate PCM carries the voice, PCM never doubles a voice the video already carries, and generation ends, barge-ins, cancels and resumes apply to the video. A page-level `MediaElementAudioRouter` connects each element to Web Audio once and hands its audio to every call's PCM playback as a stream, so the call's speakers, meter and recording carry the avatar's voice, and an element shown in an earlier call works again in the next. A host that shows no avatar gets an audio-only session. Core gains a pure fragmented MP4 reader (`ReadFmp4Init`, `SniffFmp4Piece`). Sessions without an avatar grant behave as before.
- 91be34f: Gemini Live on Gemini Enterprise (Vertex AI): a server driver and a browser driver. `GeminiEnterpriseRealtime` (`@memberjunction/ai-vertex`) reads `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` (or a run's key), a JSON string in the shapes `VertexLLM` takes: an inline service account, a key-file path (environment key only), or neither for Application Default Credentials. A client-direct session goes through MJAPI's realtime relay: the mint issues one relay session per call, whose policy writes the Live setup from the connect config and adds a `google-auth-library` bearer token (scope `cloud-platform`) on each upstream open, never at the mint. The browser gets the relay URL, with the ticket in its path, and a pact whose config holds only the response modalities and the avatar's name: no system prompt, no tools, no credential. The upstream is the Vertex AI `v1` Live socket on the location's host (`us` and `eu` on `aiplatform.<location>.rep.googleapis.com`); the mint warns when the location is not `us`, `eu` or `us-central1`. A bridged session uses `@google/genai` in Vertex mode, audio only. The constructor never throws; a key that cannot be read fails the session with a reason that quotes none of it. `GeminiEnterpriseRealtimeClient` (`'gemini-enterprise'`, `@memberjunction/ai-realtime-client`) runs the web SDK in Vertex mode against the relay URL with a placeholder API key that never leaves the page, always states its response modalities (VIDEO while it shows the avatar), and resumes on the same URL. Both Vertex drivers now read their key through shared helpers (`ParseVertexAICredentials`, `VertexKeySourceOf`, `CreateVertexAuthClient`, `VertexGenAIOptions`) and build the `google-auth-library` client themselves instead of passing the deprecated `keyFile` or `credentials` options to `GoogleAuth`: an inline service account becomes a `JWT` client with the `cloud-platform` scope, and a key without credentials still uses Application Default Credentials. **Change to run-key handling in `VertexLLM`: a key may name a key file (`keyFilePath`) only when it is the driver's environment key (`AI_VENDOR_API_KEY__VertexLLM`; `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` for the realtime driver), byte for byte. A run's key (`apiKeys`), an MJ Credential (the Google Cloud Platform credential type's Key File Path) or any other key that names a key file is refused when the client is created, with an error that does not quote the path; use an inline service account (`serviceAccountJson`) or Application Default Credentials instead.** Environment keys behave as before: MJ reads the key file and builds the client for its `type` (service account, authorized user, impersonated service account, external account, GDCH). The file is now read when the client is created rather than at the first request, and its errors no longer quote the path. `GeminiRealtime` gains the protected `SessionPactFor`. The realtime runtime keeps the new client from being tree-shaken, and the server and browser class-registration manifests register the two drivers. Integration checks RD13 (the avatar from the voiced agent's persona, through the session prep) and RD14 (every realtime vendor DriverClass resolves). Nothing selects the Enterprise driver until its vendor row ships.
- 8ef5e86: Server-bridged Gemini Live sessions (meetings, telephony) now continue past Gemini's ~10-minute connection limit and survive a dropped connection, using the same `RealtimeSessionResumption` rules as the browser driver. The session opens its own connections through a connector the driver provides, ignores events from replaced connections, and after a resume ends the cut-off turn and opens a fresh meeting-mode activity window. `ParseDurationToMs` (Core) now reads Gemini's `goAway.timeLeft` for both drivers.
- 596855c: Gemini Live sessions no longer cut an answer, or lose a question, when they move to a new connection (#5354, #5358, #5313). On Vertex AI a `goAway`, or a planned move after the first answer, moved the session at once: the resumption helper waited only for Google's `resumable: false`, which Vertex AI never sends. `RealtimeSessionResumption` now takes the turns from the driver (`TurnStarted`, `TurnEnded`). From the user's first transcribed words, a turn the client sends, or the model's first output, until that turn's `turnComplete` with no tool call pending, a planned move waits; it happens at the first resumable handle Google issues after the turn ended. The deadline still bounds the wait, and its margin is now a third of the notice, between 1.5 s and 10 s, so a turn that ends within a short notice finishes on the old connection (a notice of 10 s or less used to move at once). Both Gemini drivers, the browser client and the server-bridged session (and so Gemini Enterprise), put a connection to use only once Google confirms its setup (`setupComplete`, through the new `RealtimeConnectionSetup`), since Google drops input that arrives earlier: the browser client reports `'connected'` and `'listening'` and starts the microphone after it, and a bridged session's `StartSession` resolves after it; either fails with the close code when the connection closes first, or after 15 s without a confirmation. During a move, sends queue and the latest 2 s of input audio are held, and both go out on the new connection once it is ready. The turn state is readable as `IsTurnOpen` on `GeminiRealtimeClient` and on the bridged session.
- fdf6669: Both Gemini Live drivers now route model output by MIME type: only PCM audio reaches audio playback (browser) or the session's audio output (server). A part of another type, such as the `video/mp4` frames a Live Avatar session streams, is dropped and reported once per session instead of being played as noise. A part with no MIME type still plays, as before. `IsPcmAudioMimeType` (Core) is the shared check.
- 4c682c1: Browser Gemini Live sessions now continue past Gemini's ~10-minute connection limit and survive a dropped connection. The server driver requests session resumption, and the browser driver moves to a new connection with Google's resumption handle when Google announces the connection is ending (at the next resumable point) or when the socket drops (retrying with back-off). Events from a replaced socket are ignored, so its close no longer ends the session. The timing logic is a new Core helper, `RealtimeSessionResumption`. Sessions on a model declared zero-data-retention (`RealtimeSessionParams.ZeroDataRetention`, set from `Privacy.ZeroDataRetention`) never get resumption, because Google stores resumable session state.
- f325baa: Fix (#5153): realtime voice-session recordings on PCM-playback drivers (Gemini Live, ElevenLabs Agents, AssemblyAI, xAI Grok Voice, HuggingFace) contained only the participant's microphone — the agent's turns were digital silence — because the agent audio played through `RealtimePcmPlayback`'s own AudioContext straight to the speakers and was never exposed as a stream the recorder could mix.

  ai-realtime-client: `RealtimePcmPlayback` now also feeds its master gain into a `MediaStreamAudioDestinationNode` exposed by `GetOutputStream()`; every PCM driver publishes it through `GetRemoteMediaStream()` / `OnRemoteMediaStream()`. The remote-stream slot (stream + subscribers + isolated fan-out + per-session reset) moved into `BaseRealtimeClient`, replacing two copies in the OpenAI WebRTC drivers; both methods are now concrete on the base (returning `null` / never firing when a driver has no agent-audio plane), so `?.` call sites keep working.

  ng-conversations: `RealtimeAudioRecorder` keeps recording mic-only (with a warning) when the agent stream cannot be connected — e.g. a browser that refuses a cross-sample-rate MediaStream source — instead of losing the whole recording. It also closes its AudioContext, and wires no microphone, when the call ends while the recorder is still starting (the context is resuming or the capture worklet is loading); before, that context was left open.

  ai: `RealtimeDiagLog` no longer throws `ReferenceError: process is not defined` in the browser. Gemini Live's transport close and error handlers call it first, so an abnormal provider close or a transport error used to throw before the fatal error was emitted, leaving the call stuck in 'listening'. It now returns silently when there is no `process` (diagnostics stay off), and the handlers surface the error.

- 318084b: The meeting room's self-view Hide is saved per user. In `<mj-livekit-agent-room>`, a user who hides their own tile finds it still hidden in their next meeting, on any device, until they click Show on the "Self-view hidden" chip or reset the layout. It is saved in `MJ: User Settings` under `mj.livekit.selfView.hidden.v1`, and the preview room keeps its own under `mj.livekit.preview.selfView.hidden.v1`. Only a saved `true` hides it. Nothing saved, `false`, or a malformed value shows it. When saving fails, the hide still holds for that session. Reset layout now also shows the self-view again and saves that, as the realtime call's Reset brings back a hidden camera box. `<mj-livekit-room>`'s `SelfViewHidden` is now an input, and the new `SelfViewHiddenChange` output fires when the user hides or shows the self-view or resets the layout, so any host can save it. Without a host that saves it, it lasts for the session as before. In `/media`, `MediaLayoutKeys` gains an optional `SelfViewHidden` key, `MediaLayoutPrefs` gains `LoadSelfViewHidden` and `SaveSelfViewHidden`, and `ParseSelfViewHidden` / `SerializeSelfViewHidden` are new. A host that names no key for the self-view, such as the realtime call, reads it as shown and saves nothing: the call's self-view hides by moving its box to Hide, a move it already saves.
- 69bf67c: An agent that watches a LiveKit meeting now picks which camera or screen its model sees, instead of keeping the first one until it ends. A shared screen comes first (the most recent share). After that comes the camera of whoever leads LiveKit's active-speaker list, once they have led for 1.5 s, then the camera already in view, then the camera of whoever spoke last, then the first camera in the room. A camera stays in view for 4 s from its first frame before another camera replaces it. A shared screen, a withdrawn consent and an ended source never wait. The bot itself and other agents never count as speakers. Only the chosen source is subscribed and read: a switch drops the old one, then subscribes the new one. The model is told what it sees: "[You can now see: Ada's screen]" right before the first frame of each source new to its session, and "[You can no longer see: Bob's camera]" when a source it saw stops, including on a switch (the ended note used to read "[The agent can no longer see: …]"). The hold lengths can be overridden through the bridge's `Configuration` (`VideoSpeakerOnsetMs`, `VideoSpeakerHoldMs`). Room telemetry gains `sourceSwitches`, `switchesHeld`, `activeSpeakerUpdates` and `switchGapMsLast` / `switchGapMsMax`. The live check script gains a switch scenario (`VISION_SCENARIO=switch`).

  A browser call's video notes use the same second-person set. `VideoSourceArbiter` now says "[You can now see: Camera]" when what the model sees changes (it said "[The agent is now viewing: Camera]"), "[You can no longer see: Whiteboard (the user turned it off)]" when a source is turned off (it said "[The user turned off the agent's view of: Whiteboard]"), and "[You can now see: Whiteboard (turned back on)]" when it is turned back on (it said "[The agent can see Whiteboard again]"). The notes are sent at the same moments as before, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override them.

- efe4738: New package `@memberjunction/ng-realtime-media`: provider-neutral media UI that renders the `/media` models of `@memberjunction/ai-realtime-client`. It holds the participant tile (`mj-media-tile`), the audio meter (`mj-audio-meter`), the agent-state indicator (`mj-agent-state`), the connection overlay (`mj-connection-overlay`) and the device menu (`mj-media-device-menu`), moved out of `ng-livekit-room` so the realtime overlay and the meeting room share one implementation. A tile never plays audio, and text over video stays light in dark mode.

  `ng-livekit-room` renders the new components. Each remote voice now plays from a hidden player outside the layouts (`mj-livekit-participant-audio`), so split view and the whiteboard no longer silence participants without a tile. The old `mj-livekit-participant-tile`, `-audio-meter`, `-agent-state`, `-connection-overlay` and `-device-menu` components stay as deprecated wrappers around the new ones, with the same inputs and outputs.

  `livekit-room-core` adds `ToMediaParticipant`, `ToMediaDevice` and `ToLiveKitDeviceKind`, which map LiveKit views to the `/media` models (memoized, so a tile never reattaches its video), and exports the meter's `AUDIO_METER_ATTACK` and `AUDIO_METER_DECAY`. The `/media` model gains `MediaAgentState`, `MediaConnectionStatus`, `MediaDisconnectReason`, `MediaConnectionQuality`, `MediaDeviceSelection`, a `speaker` device kind, and the tile's optional participant fields (`PreferredVideo`, `IsMuted`, `ConnectionQuality`, `GetAudioLevel`).

- d9da1ad: The face moves with the voice: `/media` adds `IPlaybackClock` (`CurrentTimeMs`, the media time of the audio heard now, or `null`), and `VideoPlayoutOptions.Clock` gives it to the player. `RealtimePcmPlayback` is such a clock: `IRealtimePcmPlayback.Enqueue(pcm16, mediaTimeMs?)` takes an optional media time, each chunk keeps its place on the audio context's clock (an untimed chunk continues the one before it), and `CurrentTimeMs` reads the context's time less the output latency the browser reports (`outputLatency`, `baseLatency`); `Flush` forgets it all. With a clock, the WebCodecs and image decoders show each frame when the voice reaches its `PresentationTimeMs`, the meeting bot's rules on media time: a frame more than 500 ms behind the voice is dropped, one ahead of it waits, and one more than 2 s ahead is dropped; a frame that starts a new stream waits while the voice still plays the old one. When the voice stops, frames carry on by their own times from where it was; before it starts, they wait up to 500 ms, then go by their own times. MSE ignores the clock (an MP4 that carries the voice keeps the two together), and Gemini passes none: its PCM carries no media time. Drivers that time nothing behave as before.
- c5472d2: `BaseRealtimeClient.AddTrack(descriptor)` adds a track to a running session, such as inbound video when the user starts their camera, resolved against what the driver supported at connect: the track is `'live'`, or `'unsupported'` with the reason (the model takes no such track, or no more inbound video streams, counting the live ones). A live track added again is returned as it is, and other tracks keep their ids. `RemoveTrack(descriptor)` reports a track `'ended'` and drops it; audio cannot be removed. Gemini Live needs nothing more: it accepts video frames without a setup change, so frames flow as soon as the track is live.

  `OnRemoteVideo` now hands over a `MediaVideoSource` (a stream, or a player that owns the `<video>` element, such as MSE playout of avatar video) instead of a `MediaStream`; `emitRemoteVideo` still takes a plain stream and wraps it. No driver emits remote video yet.

- ca2791b: A realtime session's camera and screen share now follow the channel that fronts each of them (a channel whose new `CaptureKind` is `camera` or `screen`). `StartCamera` and `StartScreenShare` refuse, with the new `policy` failure and a message for the user, when that channel is not in the call or the server's policy keeps pixels from the agent (the agent's configuration, a zero-data-retention rule); nothing is opened or added first. An on-demand channel is opened when its capture starts, and an open one counts as used, so the host shows its surface. The capture's video source belongs to the channel: the user's "agent can see" choice for it hides the frames from the agent without stopping the capture. `VideoSourceArbiter.RegisterSource` takes `Enabled`, so such a source can register hidden without the model being told about it.
- 7f243eb: Adds `MediaVideoSource` and `AttachVideoSource` to `@memberjunction/ai-realtime-client/media`. A video source is either a live `MediaStream` (shown muted and inline: its audio plays elsewhere) or a player that owns the `<video>` element itself, such as avatar playout. `AttachVideoSource` shows either in an element and returns a detach function that never stops the source's tracks and leaves the element alone once another source has taken it.
- a3fcce8: Adds `RequestDisplayCapture` and `GetDisplayCaptureSupport` to `@memberjunction/ai-realtime-client/media`. `RequestDisplayCapture` opens the browser's share picker with surface hints (never offering the current page for a normal share), reports what the user shared and when sharing ends, and can share a single panel of the page through Element Capture or Region Capture on Chromium browsers. It always resolves with a status (`started`, `cancelled` or `failed` with a reason) instead of throwing. `GetDisplayCaptureSupport` tells a caller whether panel capture is possible, so Firefox and Safari can show a panel to the agent through its channel frames instead. `CreateScreenCapture` is deprecated.
- a08ed58: Adds `FrameSampler` to `@memberjunction/ai-realtime-client/media`. It samples any `MediaStream` at the rate the caller passes, with no 1 fps ceiling, and can cap the frame size with `MaxDimension`. `CreateStreamFrameCapture` is deprecated and now wraps it; it no longer caps `Rate` at 1 fps. The camera and screen capture helpers no longer cap the device's frame rate at 1 fps, so a self-view of their stream plays smoothly while the model still receives frames at the requested rate. `GeminiRealtimeClient` samples the camera passed to `Connect` at the negotiated rate and feeds it through the session's `VideoSourceArbiter` as a camera source instead of writing frames directly.
- 2bc4677: Adds `LocalMediaController` to `@memberjunction/ai-realtime-client/media`: the user's camera and microphone. It lists devices (following `devicechange`), starts and stops each kind only when asked, moves a live kind to another device inside the same `MediaStream` (releasing the current device first, as mobile browsers need, and reopening it if the new one fails), and restarts a kind on the system default device when the device in use goes away. It reports state through an rxjs `State$` and a `State` getter, and `Start` and `SwitchDevice` resolve with a status instead of throwing. The package now declares `rxjs`, which `@memberjunction/global` already brought in.
- 42f8016: Adds the `@memberjunction/ai-realtime-client/media` entry point: frame capture, the video source arbiter, frame pacing, the channel video bridge and the audio meter, with no provider driver or `@google/genai` behind it. An app that imports only `/media` bundles none of the drivers. `ChannelInboundVideoBridge` now accepts any `IVideoFrameSink`; a `BaseRealtimeClient` still works. The main entry exports the same names as before. The package now has an `exports` map, so a deep import such as `@memberjunction/ai-realtime-client/dist/...` no longer resolves; nothing in this repo uses one.
- 6b587b3: Adds the media stage to `@memberjunction/ai-realtime-client/media`: `LayoutMediaStage` lays out a session from its participants, placeable surfaces and the user's moves into one stage, a stack of picture-in-picture tiles (newest first), tabs, hidden surfaces, the other participants, and a screen-share split. The surface the user moved to the stage most recently holds it; a displaced surface returns to its default placement. `ResolveSurfacePlacements` and the participant selectors (`SelectSpotlight`, `SelectDisplayParticipants`, `SelectScreenSharer`, `SelectSplitSpeaker`, ported from the LiveKit room) are exported too. New model types: `MediaParticipant`, `MediaSurface`, `MediaPlacement`, `MediaPlacementMove`, `MediaSourceKind`.
- 891dc77: Realtime drivers can follow a replaced microphone track mid-call. `BaseRealtimeClient` gains the optional `ReplaceMicrophone(micStream)` (driver obligation #10), and every browser driver implements it: the OpenAI WebRTC drivers move their senders with `replaceTrack`, and the PCM-capture drivers (Gemini, ElevenLabs, AssemblyAI, xAI, Hugging Face) rebind the shared capture through the new `IPcmMicCapture.Rebind`. Each rebuilds its input meter on the new track. `IRealtimePeerConnection.addTrack` now returns the sender (`IRealtimeRtpSender`), as the platform API does. `LocalMediaController` keeps a muted microphone muted across a device switch or a lost device. The session recorder gains an optional `ReplaceMicrophone` on `IRealtimeSessionRecorder`, implemented by the browser recorder. The runtime starts calling these when its microphone moves onto the controller.
- 98dbb78: Adds `VideoPlayout` to `@memberjunction/ai-realtime-client/media`: it plays fragmented MP4 that arrives in pieces, such as a Gemini Live avatar, through Media Source Extensions (`ManagedMediaSource` on iOS Safari). Its `Source` is an element `MediaVideoSource` for `AttachVideoSource`; the element is not muted because the avatar's voice is in the video. `EndOfTurn` lets a turn play to its true end, `Flush` stops the voice at once for a barge-in, the next turn resumes where playback stopped, played media is trimmed so long sessions stay within the browser's buffer, and `IsPlaying` says whether the agent is audibly speaking.
- 0a952ee: The realtime call overlay's composer shows Camera and Share whenever the call offers them, in all three layouts. A call offers a capture while it is connected, the model takes inbound video (`BaseRealtimeClient.SupportsInboundVideo`, new), the host can open it, and its channel's policy admits it; the runtime publishes this as `CaptureOffers$` (new). The buttons follow `Captures$` and call `StartCamera` / `StopCamera` / `StartScreenShare` (offering the kind of surface picked in the Share menu first) / `StopScreenShare`. The camera is optional in an agent call, so it is neutral while off and filled while on: `mj-media-controls` gains `CameraOptional` for this, and the LiveKit room keeps its red. In the fused dock the Share arrow is left out for room, and on a narrow composer the strip wraps onto a second row and the dock puts its text box on a row of its own (a container query on the composer's width). `RealtimeControlId` gains `camera` and `share`.
- 20d1f4a: A realtime call keeps going when the microphone changes. `IRealtimeMediaHost` gains an optional `CreateLocalMediaController()`, and the browser host returns a `LocalMediaController`. When a host offers one, the runtime starts the microphone through it instead of `AcquireMicrophone`, moves the driver and the recorder onto the new track when the controller swaps one in (a device switch, or a lost headset replaced by the default), and disposes it at teardown. A failed start keeps the `getUserMedia` error names (`NotAllowedError`, `NotFoundError`, …), so hosts that tell a denied microphone apart work unchanged. A start the host abandoned while the microphone was opening now unwinds without reporting an error. `/media` exports the `ILocalMediaController` interface, which `LocalMediaController` implements, so other hosts and tests can supply their own.
- f1fb411: `mj-self-view` (ng-realtime-media) is the user's own tile, as `mj-media-tile` draws it with the camera mirrored, with an "Agent can see this" badge ("Agents can see this" with more than one agent) while the host says frames reach an agent, and a Hide button (`HideRequested`). `mj-share-preview` shows what the user shares, whole and not mirrored, labelled by the kind of surface ("Sharing a window"), with Stop sharing and Change (`StopRequested`, `ChangeRequested`). `mj-media-tile` gains `Mirror`, which mirrors the camera only.

  The LiveKit room draws the user's own tile with them in every layout: their self-view, or their share preview while they share. Hide (in the grid and filmstrip) leaves a "Self-view hidden · Show" chip in the stage's top-left corner for the session; the camera stays on. Your own tile no longer has a pin button. `LiveKitRoomController.ChangeScreenShare(preferredSurface?)` stops a share and asks the browser's picker again, and `LiveKitLocalMediaState.ScreenShareSurface` says what is shared. `/media` exports `CapturedSurfaceOf(track)`, which reads the kind of surface from any captured display track.

- 6a19f78: A call's Share menu offers "This panel ▸", listing the panels of the page that are on screen: the call's Whiteboard and Explorer's main content ("Main content"). Picking one shares that element alone. A new `[mjSharePanel]="<label>"` directive (with `mjSharePanelIcon`) in `ng-realtime-media` marks a shareable region and registers it with the app's `SharePanelRegistry`, whose `PanelsFor$(host)` lists the panels whose box overlaps the viewport, in page order, leaving out any panel that holds the call itself, and nothing where the browser cannot share a single panel (`Supported`: `getDisplayMedia` plus Element or Region Capture, so Chrome and Edge on the desktop). Registry changes reach its streams in a microtask. A channel opts its call surface in with `BaseRealtimeChannelClient.SurfaceShareable` (default `false`; the Whiteboard channel returns `true`), and the Explorer shell marks `mj-tab-container#mj-main-content`, so `ng-explorer-core` now depends on `ng-realtime-media`. The call overlay passes the list to the composer's Share menus (`RealtimeComposerComponent.SharePanels`), starts `StartScreenShare({ Panel, PanelLabel })` for a pick, and stops the share when the shared panel goes away; a panel only out of sight keeps its share. In `/media`, a panel share now uses Element Capture wherever the browser has it (Chromium 132+), giving the panel `isolation: isolate` inline for the share and its own value back when the share ends, and Region Capture otherwise; `DisplayCaptureOptions.PanelLabel` names the panel and `DisplayCapture.PanelLabel` carries the name. The runtime's share state carries it (`RealtimeCaptureState.PanelLabel`), the agent sees the share as "Whiteboard (shared panel)" in the "Agent can see" chip and its switch note, and `mj-share-preview` reads "Sharing a panel: Whiteboard" (`SharePreviewComponent.PanelLabel`). The Screen Share channel's state still reports `surface: 'tab'`.
- e402de5: Adds the meter smoothing every audio display shares to `@memberjunction/ai-realtime-client/media`: `GateAudioLevel`, `SmoothAudioLevel`, `SmoothAudioBars`, `SynthesizeAudioBars`, and `AudioLevelSmoother`, which smooths one source's level and bars (from its spectrum, or synthesized from the level when it has none). The call overlay's `RealtimeAudioVisualSmoother` in `@memberjunction/ng-conversations` now uses them and produces the same frames as before. Its `GateLevel` and `SmoothLevel` exports are deprecated in favor of the `/media` functions.
- d0df5a1: A conformance kit for realtime video providers. The new `@memberjunction/ai-realtime-client/testing` subpath exports `RunRealtimeVideoConformance(driverFactory)`, which runs 17 checks (`VC01`-`VC15`, `VF01`-`VF02`) against a provider's client driver and resolves to a result per check (Passed, Failed with the rule, or Skipped with the reason), and `ListRealtimeVideoConformanceChecks(driverFactory)`, which gives a test runner one test per check. The kit needs no test framework. A provider writes a harness (`IRealtimeVideoConformanceHarness`): what its server mints, its client driver with a fake transport and its creation seams wired to the kit's recorders (`RecordingVideoPlayout`, and `RecordingPcmPlayback`, which is also a playback clock), and the model's side of the wire, its video as Core's `RealtimeVideoFrame`s (fragmented MP4, encoded chunks or images; traits `VideoFrameKind`, `TimedVoice`). The checks cover what a session hands the host (an audio-only session no video, a granted avatar once, none when the host doesn't show it or the browser can't play it), where the model's parts go (video to its player in order and typed as sent, never to the voice; an unknown type nowhere, reported once), barge-in, turn ends, a video that carries the voice, a timed voice as the player's clock, generated video seconds, resumes and Disconnect. Fixtures include `ConformanceChunkFrames` and `ConformanceImageFrame`. The package's tests run it against Gemini (Developer, and Enterprise on a relay session), OpenAI, and a synthetic provider built only on the package's public API (fMP4, chunk and image runs). The main entry and `/media` don't export the kit. `BaseRealtimeClient`'s driver obligations gain #12 (the agent's video keeps the voice's rules). In `@memberjunction/ai-agents`, `GetRealtimeModelVoices` marks a persona voice with its avatar (`AvatarID`, which the picker shows as "Comes with an avatar") only when the model shows avatars on that vendor (`RealtimeModelShowsAvatar`: its Video/Output row and its driver's endpoint profile).
- d853bf8: A channel's frames sent through its context's `SendVideoFrame` (`RealtimeChannelContext`, `@memberjunction/realtime-runtime`) now go through the session's `VideoSourceArbiter` as the channel's own source, under the id its frame bridge uses (`<channel key>#<instance>`): they reach the model only while the arbiter picks that source, the model is told when it switches, and nothing is sent while the channel's exposure is below pixels. Before, they went straight to the model. The member is deprecated in favour of `ChannelInboundVideoBridge`; the context's `Client` still writes past the arbiter, as does the runtime's own `SendVideoFrame`, whose TSDoc now says so.

  Deprecated, with nothing reading them: `RealtimeVideoConfig.provider` and `providers` (`@memberjunction/ai-agents`). The model is chosen with `realtime.modelPreference`, or with `realtime.video.enabled` the first model that shows an avatar; an avatar's settings are its persona binding's `VendorSettings.Avatar`. A session whose configuration sets either key logs one line per agent naming them, and `FindDeprecatedRealtimeVideoKeys` reports them as data. The TSDoc of `enabled` and `avatarId` now says what they do: `enabled` asks for an avatar and does not start the camera, and `avatarId` names one of the model's Video persona bindings.

  Also deprecated: `BaseRealtimeModel.SupportsVideo` (`@memberjunction/ai`), which no driver overrides and nothing reads (video is declared by `Capabilities.SupportedInboundTracks` / `SupportedOutboundTracks` and `SupportsAvatarOutput`); `LiveKitAudioMeter` and `LiveKitAudioMeterFrame` (`@memberjunction/livekit-room-core`) in favour of `AudioLevelSmoother`, which gives the same frames with the room's settings (the `AUDIO_METER_*` constants stay); and `CreateCameraCapture` (`@memberjunction/ai-realtime-client`) in favour of `LocalMediaController` and `FrameSampler`.

  Removed, since no release shipped it: `ToScreenShareCaptureOptions` from `@memberjunction/livekit-room-core`.

- e293b68: A realtime model's video output comes as typed frames. Core adds `RealtimeVideoFrame`, a union of three kinds, each with its MIME type: `fmp4` (a piece of fragmented MP4, `Piece: 'init' | 'fragment'`), `chunk` (one encoded frame, H.264 in Annex B form or VP8, VP9 or AV1, with a required `PresentationTimeMs` and `KeyFrame`) and `image` (JPEG, PNG, WebP). `PresentationTimeMs` is on the stream's own media timeline, not wall-clock time; `Width` and `Height` are optional. `Fmp4PieceToVideoFrame` builds an fMP4 frame from a model part: the piece from its first box, an init's picture size from its video track, and a fragment's time and key-frame flag from its first video sample; bytes neither labelled `video/mp4` nor opening with an MP4 box give `null`. `IRealtimeSession.OnVideoFrame` replaces `OnAvatarOutput` and `RealtimeAvatarMediaChunk`, which were added earlier in this release, and `OnVideoOutput` is deprecated (hosts still forward it; it goes in the next major version). A granted bridged Gemini avatar, on the Developer API or Gemini Enterprise, sends its pieces as frames through `OnVideoFrame`, and the browser Gemini client hands frames to `VideoPlayout.Append(frame)` (`IAvatarVideoPlayout.Append` takes a frame); both drop a `video/*` part that isn't MP4 and report it once per type. The bridge engine forwards each frame on `video-out` with its MIME type and copies what the frame says about its video onto the bridge frame (`Width`, `Height`, `KeyFrame`: an image is a key frame, an fMP4 init carries its own size, and an fMP4 fragment with video carries its key-frame flag and the size of the stream's init); in a full-duplex multi-agent room the floor gate reads an fMP4 frame's piece (an init passes, a fragment counts its audio), and encoded chunks and images pass ungated because their voice comes as PCM, which is gated. `VideoPlayout` plays `fmp4` frames and drops any other kind, reporting `'no-decoder'` once.
- 44428b5: Realtime video, where a channel's surface and a camera or screen share take turns on a model's one video stream:
  - **The base channel's visual pump counts only the frames the model gets.** When the video source arbiter refuses a frame (another source has the model's only stream, the channel's source is off, or the frame came too soon), the pump no longer records it as the last picture sent, reports no `frame_pushed` event, and sends no "visual confirmation" note after an agent edit, which used to reach the model without its frame. When the arbiter starts sending the channel again (the camera stopped, the user picked the channel, its source was switched back on), the channel sends its current picture even if it has not changed. `ChannelInboundVideoBridge.OnSourceActivated` tells the bridge's owner when that happens, and `VisualPerceptionPump.Refresh` sends the picture.
  - **A channel opened mid-call keeps its video track.** A channel on the base class's visual perception that the agent opens during a call now adds the inbound video track it sources (`AddTrack`) when the call has none, as it would have been given at connect. And a camera or screen share that added the track removes it, once stopped, only when the arbiter has no other source: a channel that started sending on it while the capture was on used to lose it right after the model was told it could see that channel.
  - **A host can supply the frame sampler.** `IRealtimeMediaHost.CreateFrameSampler` (optional) creates the sampler for each camera or screen share, so a host without a DOM can take frames its own way; a browser host can leave it out and keep the DOM `FrameSampler`. A capture whose sampler cannot start now fails as `unsupported`, with nothing listed and nothing told to the model, where it used to report on and send no frames.

- 1b8791e: The user can pick which video source the agent sees. `RealtimeSessionRuntime.SelectVideoSource(sourceId)` makes a source the user's pick, which beats every other rule of the session's video source arbiter (a camera or screen share the user started, the surface in view); `SelectVideoSource(null)` lets the call decide again. Each source on `VideoSources$` carries `Picked: true` while it is the pick; the arbiter clears the pick when its source is turned off or leaves.
- afe9eb4: A relayed call (Gemini Enterprise) that reaches its 30-minute cap, or its shorter `MaxSessionSeconds`, now ends with its own message instead of a connection error. MJAPI's relay closes the browser leg with `REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE` (4000, "Call time limit reached"; the upstream still gets 1000). `GeminiRealtimeClient` ends the call on that code with a fatal error whose `Code` is `REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE` (`'time-limit'`), without trying to resume. `RealtimeSessionRuntime.LastSessionError` keeps the call's fatal client error until the next start, and `DescribeCallEnd` words a time-limit end (`REALTIME_CALL_TIME_LIMIT_END`): the call bar and the audio hero say "Time limit reached" (`RealtimeAgentBannerComponent.ErrorLabel`), and the widget (`mj-error` code `time-limit`) and the phone's error screen say "This call reached its time limit. Start a new call to keep talking." The avatar tile's state chip still says "Connection error".
- c9e1891: Meeting tiles can go into picture-in-picture boxes. Every tile's "Move to…" menu offers Picture-in-picture (the participant the call put in the spotlight is offered the spotlight and a box); a box floats over the stage, the whiteboard included, through `mj-media-stage`, and its bar carries the participant's menu. Someone in a box is not shown again: they leave the filmstrip and the grid, and are not the speaker pane in split view, though their shared screen still shows. Without pinning, the menus offer the strip and a box. A host turning the self-view off takes the user's box away until it is back on.

  The shared media stage (`LayoutMediaStage`) no longer picks for the spotlight a participant already shown in a picture-in-picture box; the next in line takes it. `mj-media-tile`'s minimum height reads `--mj-media-tile-min-height` (120px by default), so a host can let a tile shrink into a small box.

- 0a3a56a: `MediaLayoutPrefs` in `@memberjunction/ai-realtime-client/media` reads and saves a host's layout (its moves and picture-in-picture boxes) in a per-user settings store under the host's own keys. MJ's `UserInfoEngine` is such a store (`MediaLayoutSettings`). A store that is not ready reads as nothing saved and is skipped when writing, and a saved layout keeps the newest `MEDIA_LAYOUT_SAVED_LIMIT` (50) moves and boxes. `RecordPipRect` keeps the boxes the user moved most recently last. The realtime call saves its layout through them, under its existing keys, with nothing changing on screen; the meeting room's MJ host is next.
- 7a08dc1: The realtime call and the meeting room keep and save the user's layout through one shared set of helpers in `@memberjunction/ai-realtime-client/media`: `RecordPlacementMove` and `WithoutStageMoves` keep the moves, `ParsePlacementMoves` / `SerializePlacementMoves` and `ParsePipRects` / `SerializePipRects` give their saved form, and `MediaPipRect` is the saved picture-in-picture box. `ParticipantTileKey`, `ParticipantTileSurface` and `StageParticipantIdentity` let any host show participants as movable tiles, as the meeting room now does through them. Nothing changes on screen.

  Removed, since no release shipped them: the call's own copies of these helpers (`ParseSurfacePlacementPref`, `SerializeSurfacePlacementPref`, `RecordSurfaceMove`, `ParseSurfacePipPref`, `SerializeSurfacePipPref`) and the deprecated `mj-realtime-surface-move-menu` / `RealtimeSurfaceMove` from `@memberjunction/ng-conversations`, and `MediaPipRect` from `@memberjunction/ng-realtime-media`. The call's setting keys (`SURFACE_PLACEMENT_PREF_KEY`, `SURFACE_PIP_PREF_KEY`) stay.

- cf50330: `MediaPreview` in `@memberjunction/ai-realtime-client/media`: the user's camera and microphone in a lobby before a call or meeting. It runs on an `ILocalMediaController` (the browser's `LocalMediaController`, or a fake in tests) and the shared microphone meter, and gives a lobby such as `mj-camera-check` what it shows: the camera as a stream source, the microphone level, the devices, and the user's choices (`MediaPreviewChoices`). The microphone starts on and the camera off unless asked otherwise; picking a device moves a live kind at once or remembers it for later; a kind that fails to start is turned off with its reason in the state; disposing it releases the devices, the meter and the controller. The meeting room's lobby moves onto it next.
- cbddadb: The notes a realtime model gets when the video it sees changes now come from one module in `@memberjunction/ai`: `VideoSourceSeenNote` ("[You can now see: Ada's screen]", several sources joined with ", "), `VideoSourceEndedNote` ("[You can no longer see: Bob's camera]"), `VideoSourceTurnedOffNote` ("[You can no longer see: Whiteboard (the user turned it off)]") and `VideoSourceTurnedOnNote` ("[You can now see: Whiteboard (turned back on)]"). A browser call's `VideoSourceArbiter` and a meeting's bridge engine both build their notes with them, where each had its own copy of the wording. No note's text changes, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override the call's. `@memberjunction/ai-bridge-server` no longer exports its own `VideoSourceSeenNote` and `VideoSourceEndedNote`, added earlier in this release; import them from `@memberjunction/ai`.
- f00d5fc: `VideoPlayout` plays every kind of `RealtimeVideoFrame` through a decoder registry. `/media` adds `VideoFrameDecoderRegistry` (the page's decoders: `Register`, which replaces a decoder of the same name, `Unregister`, and `Candidates(kind, mimeType)`, highest priority first) and the decoder contract (`IVideoFrameDecoder`, `VideoFrameDecoderRegistration` with a synchronous `CanPlay`, `VideoFrameDecoderContext`). Three decoders are built in: `mse-fmp4` (today's MSE code, moved unchanged), `webcodecs` (encoded chunks through a WebCodecs `VideoDecoder`, configured at the first key frame once `isConfigSupported` confirms the codec; H.264 in Annex B with the codec string from the MIME type's `codecs` parameter, VP8, VP9, AV1) and `image` (JPEG, PNG and WebP through `createImageBitmap`). Chunks and images show at their `PresentationTimeMs`, paced on the wall clock, in the host's `<video>` element through a `MediaStream` (a track generator in Chromium, else a canvas captured at 0 fps), so the tile, its stall watch and the hosts are unchanged; the last picture holds, and an element attached later is shown it. The player keeps one decoder for each frame type (kind and MIME essence), starts the one for its configured type when an element is attached, and falls back to the next decoder for a type when one gives up (a browser that can't decode the codec, or three decode errors within a minute); a type no decoder plays is dropped and reported once (`'no-decoder'`). `VideoPlayout.IsSupported(mimeType)` asks the registry. No new problem kinds: a stream that starts on a delta chunk reports `'fragment-before-init'`.
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
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
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
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 5acbec6: OpenAI-protocol realtime sessions (OpenAI Realtime, xAI Grok Voice) keep their persona and tools. The client-side `requestedTracks` negotiation hint is no longer sent in `session.update` (OpenAI rejected the whole update with `unknown_parameter`, so the session ran with no instructions and no tools).
- 72e082b: fix(realtime): a spoken update no longer wipes the session identity it speaks under

  `RequestSpokenUpdate` sent the caller's direction as `response.create`'s per-response
  `instructions`. On the OpenAI Realtime protocol that field is a **full override of the session
  system prompt for that response**, not an addition to it — so the one turn riding this method spoke
  with no identity at all: no persona, no name, none of the standing directives the session was
  minted with.

  The server-side driver already knew the rule and guarded the BLANK case on it, in its own words:
  forwarding `''` "would wipe the co-agent identity framing (incl. the `call invoke-target-agent,
don't do the work yourself` directive)". The non-blank case was never guarded, and it wipes exactly
  the same framing — just less visibly, because only the requested turn loses it while every other
  turn in the same session reads correctly.

  Reported from a downstream hiring product (bizapps-caliber#397), where the failure was as visible as
  it gets: the interviewer's opening turn — the first thing an external candidate hears — introduced
  her as _"ChatGPT, your friendly voice companion"_, while turns 4, 7 and 12 of the same session all
  correctly said _"I'm Sam Rivera, Support Team Lead."_ The candidate asked about it unprompted and
  the model conceded it had broken character.

  Both twins now carry the session prompt ahead of the direction, so the direction stays last (the
  most recent line is the one a model weights hardest) and no caller has to restate an identity the
  session already holds:
  - `@memberjunction/ai-realtime-client` — `OpenAIProtocolRealtimeClient.RequestSpokenUpdate` builds
    its frame through a new `buildSpokenUpdateEvent`, reading the pact through a
    `currentSessionInstructions()` seam that each transport answers with the config it actually
    applied (WebRTC from `sessionConfig`, websocket from `sessionObject`). A blank direction now
    sends a bare `response.create`, matching the server twin.
  - `@memberjunction/ai-openai` — `OpenAIRealtimeSession` retains the prompt it last sent in
    `session.update` and carries it the same way.

  This reaches every caller of the method, not only an opening turn: silence check-ins, progress
  narration and delegation narration were all speaking without identity on that turn.

  `OpenAILiveClient` is deliberately unchanged — it sends a bare `response.create` after
  `session.commentary.append`, so the session prompt already governs there and it never had this
  defect.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [bea2386]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [ce1a5c3]
- Updated dependencies [4d647e6]
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

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
- Updated dependencies [15a4333]
- Updated dependencies [5da3ad2]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [1d43161]
- Updated dependencies [80905a1]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- b87e4ac: feat(ai): Gemini 3.8 Live multimodal realtime streaming, video tracks, asynchronous reasoning, and per-model legality

  This release adds comprehensive support for Google's Gemini 3.8 Live multimodal realtime models (`gemini-3.8-live` and `gemini-3.8-live-extended-thinking`), including a first-class media plane for video/audio tracks, non-blocking tool execution, thought summaries, session continuity, and complete catalog metadata.

  In `@memberjunction/server`, the default configuration for `realtime.enabled` is flipped from `false` to `true`, enabling the `/realtime/sdp-exchange` WebRTC broker endpoint on all MemberJunction API servers by default (configurable via `MJ_REALTIME_ENABLED`).

  ### Phase Summary:
  - **Phase A (Contracts & Media Plane)**: Introduced directional media tracks (`RealtimeTrackDescriptor`, `RealtimeTrackDirection`), open modality vocabulary via `RealtimeModalityRegistry`, track negotiation in `BaseRealtimeClient`, and channel track sourcing/sinking (`GetSourcedTracks`/`GetSunkTracks`).
  - **Phase B (Audio Retrofit & SDK Convergence)**: Upgraded and converged `@google/genai` to `^2.8.0` across dependents.
  - **Phase C (Gemini Live Config Legality)**: Added per-model legality enforcement in `GeminiRealtime`: stripped `enable_affective_dialog`, preserved `proactive_audio: true` while rejecting `false`, enforced `thinkingConfig` rules (omitted on 3.8-live, validated levels low/medium/high and rejected `minimal` on Extended Thinking), explicit turn coverage, local refusal of `BLOCKING` tools on Extended Thinking, default `NON_BLOCKING` state on all declarations, and config bag sanitization.
  - **Phase D (Async Tool Execution & Idle Contract)**: Implemented per-model idle detection honoring `IdleSignal` (`generationComplete` for 3.8-live, `interactionStatus` for Extended Thinking); decoupled tool call arrival from response activity so generation is not falsely interrupted; drained `queuedSends` only on true idle or turn complete; integrated `RealtimeToolBatchBarrier` for parallel/out-of-order tool calls; and added function scheduling resolution (`__mj_scheduling` / `scheduling` with `INTERRUPT`/`INTERRUPTED` support).
  - **Phase E (Extended Thinking & Narration)**: Routed model thought parts (`IsThought: true`) to `ThoughtNarration$` and created immutable narration delegation cards (`Kind: 'narration'`), keeping scratch thoughts distinct from spoken responses and user-cancelable actions.
  - **Phase F (Video Tracks & Session Continuity)**: Implemented video frame capture (`getDisplayMedia`/`getUserMedia` in `src/media/frameCapture.ts`), throttled inbound video frame transmission via `ChannelInboundVideoBridge` (whiteboard and remote browser channels), and resilient session continuity across the vendor session cap via `sessionResumptionUpdate` / `goAway`.
  - **Phase G (Metadata & Release)**: Added declarative catalog metadata and multi-channel pricing for `Gemini 3.8 Live` and `Gemini 3.8 Live Extended Thinking` in `metadata/ai-models/.ai-models.json`.

  ### Reviewer Punch List Resolutions:
  - **Items 16–18 (Scheduling)**: Supported `__mj_scheduling` alongside `scheduling`, sanitized payload keys, accepted both `INTERRUPT` and `INTERRUPTED`, and added diagnostic warnings on unknown values.
  - **Item 19 (Non-blocking getter)**: Extracted and centralized `isNonBlocking` getter on `GeminiRealtimeClient`.
  - **Item 20 (Generation Complete)**: Ensured `handleGenerationComplete` updates `responseActive` without prematurely draining queued sends.
  - **Items 21–23 (Thought Narration)**: Cleanly separated thought summaries from spoken narrations and the ephemeral live note across `RealtimeSessionService` and `RealtimeSessionState`.
  - **Item 24 (Activity Rail)**: Restricted open-run button rendering to agent runs (`card.Kind === 'agent' && !!card.RunID`).
  - **Items 25–27 (Video Bridge & Throttle)**: Separated `sendFrameDirect`, resolved throttle contention between bridge and driver with jitter headroom, added graceful headless DOM detection, and guarded against unimplemented `SendVideoFrame`.
  - **Item 28 (File organization)**: Moved `frameCapture.ts` from `audio/` to `media/` with clean import paths.
  - **C5a–C5c (Config Sanitization & Tool Behavior)**: Stated explicit tool behavior on all declarations, warned on unknown values, and added `tooling`, `toolBehavior`, and `functionCallingBehavior` to `REALTIME_SHARED_CONFIG_KEYS`.

### Patch Changes

- d665a6e: feat(ai): Gemini Live direct tools support, prompt framing alignment, and change-driven remote browser screencast deduplication
  - Declared `SupportsDynamicToolSet = true` on `GeminiRealtime` and its session capabilities so target agent direct action tools are projected into Gemini Live sessions.
  - Fixed `hasDirectTools` calculation in `RealtimeClientSessionService` to consider `input.ExtraTools` (whiteboard, browser, media, context tools), ensuring interactive surface tools prevent the negative "do not attempt to do the work yourself" prompt guidance.
  - Implemented change-driven screencast frame deduplication in `RemoteBrowserChannel` with a 15-second heartbeat, preserving ~15k tokens/min on static pages while maintaining instant visual push on user interactions.
  - Reworded `ResolveGeminiThinkingLevel` fallback warning and added `CompileBrowserDelegationPolicy` doc clarification per PR review feedback.
  - Added Node < 23 `CloseEvent` compatibility polyfills in `ai-realtime-client` test suites.

- 575bfae: fix(ai-realtime): OpenAI Live planning model fallback, tool barrier synchronization, and remote video bridge
  - **OpenAI Live Default Planning Model**: Exported `DEFAULT_OPENAI_LIVE_PLANNING_MODEL = 'gpt-5.6-terra'` and warned with `console.warn` whenever `Reasoning.Remote.Ref` is undefined instead of falling back to legacy `gpt-4o`.
  - **Delegation Policy & Tool Framing**: Added `CompileBrowserDelegationPolicy` which omits the spoken holding phrase clause for browser-direct sessions. Guarded against appending delegation policy instructions when the session prompt already contains tool framing or interactive-surface execution rules.
  - **SendText Barrier Guard**: Prevented premature `response.create` emissions during `SendText` when background tool batches are in-flight (`!this.toolBatchBarrier.IsEmpty`). The creation is safely deferred until the tool batch completes via `SendToolResult`.
  - **Dedupe & Tool Barrier Lifetimes**: Maintained tool deduplication (`emittedToolCallIds`) throughout the lifetime of active tool batches, preventing duplicate execution from redelivered events when `response.completed` arrives before tool outputs. Cleared deduplication state upon batch completion and barrier timeout flushes.
  - **Remote Browser Video Bridge**: Wired `ChannelInboundVideoBridge` with client-getter support and hooked `OnSessionStarted` into active channels after WebRTC track negotiation so screencast frames stream reliably to the live model.
  - **Full-Duplex Barge-in Unblock**: Removed premature state gate in `GeminiRealtimeClient.sendMicChunk` so mic streaming and barge-in remain uninterrupted while the model is speaking or in extended thinking.
  - **Track Descriptors**: Added `Required?: boolean` to `RealtimeTrackDescriptor` so optional and channel-sourced media tracks are cleanly negotiated without breaking the session.

- 3977917: Extract the realtime co-agent session runtime out of Angular into `@memberjunction/realtime-runtime`, and register the GPT-Live client driver so it survives bundling.

  **Why.** `RealtimeSessionService` was 2,768 lines of client-direct realtime orchestration — mint, driver resolution, transcripts, tool relay, delegation narration, channel lifecycle, usage relay, teardown — living inside `@memberjunction/ng-conversations`. Its own header noted it stays component-free so it "must stay importable in plain-node tests", and the measurement bore that out: its entire Angular surface was `import { Injectable }` plus the decorator, and its entire DOM surface was one `navigator.mediaDevices.getUserMedia` call. But because it shipped in an Angular package, no other host could drive a realtime session without reimplementing it — and a second copy drifts from the first at the next protocol change, which GPT-Live just demonstrated is a frequent event.

  This follows the precedent set by `@memberjunction/conversations-runtime`, whose extraction plan explicitly noted realtime was landing in parallel and would need the same treatment.

  **What moved** into the new pure-TypeScript package: the session runtime (now `RealtimeSessionRuntime`), the channel plugin base class, the delegation-result parser, and the narration template builder.

  **The host seam.** `IRealtimeMediaHost` supplies the two genuinely platform-specific pieces: microphone acquisition (the Real-Time Co-Agents guide already specifies "the host acquires the mic — it owns the permission UX"; that seam simply had never been cut) and optional audio recording. Recording now returns base64 across the seam, so the runtime no longer touches `Blob` or `FileReader` — a browser reaches for `FileReader`, React Native reads a file, a test harness holds bytes in memory, and the orchestration layer should never have been asking.

  **`BaseRealtimeChannelClient`'s only Angular tie** was a type-only `Type<T>` import, used in one method the runtime never calls. It is now an opaque component-class reference that Angular's `Type<T>` satisfies unchanged, with the narrowing done at the single Angular call site that instantiates a component. This is what makes interactive channels authorable from a non-Angular host at all.

  **Bug fixed alongside:** `LoadOpenAILiveClient()` was exported but never called, while every sibling driver's Load function was. Since client drivers resolve dynamically through the ClassFactory, GPT-Live's driver could be tree-shaken out of a production bundle and fail to resolve at runtime while working in dev — the exact failure mode the Load-function convention exists to prevent.

  **No behaviour change for Explorer.** `RealtimeSessionService` keeps its name, injectable token and methods; it is now a thin subclass supplying the browser media host, and Explorer is untouched. `@memberjunction/ng-conversations` does, however, stop _exporting_ the types that moved — `public-api.ts` no longer re-exports `base-realtime-channel-client`, `delegation-result-parser` or `FormatToolName` — so a downstream consumer importing them from there must re-point at `@memberjunction/realtime-runtime`. No in-repo consumer does. The bump stays `patch` because MJ ties changeset level to database impact rather than semver breakage (see `.claude/rules/changesets.md`); the required import change is called out here instead. Verified by the package's existing suites: 108 test files / 1,324 tests green, including all 13 realtime-session suites.

  Types that moved (`RealtimeCaption`, `RealtimeConnectionState`, `RealtimeSessionRunOptions`, `BaseRealtimeChannelClient`, `ParseDelegationResultJson`, …) must now be imported from `@memberjunction/realtime-runtime`, since MJ does not re-export across package boundaries.

- e962151: refactor(ai-realtime): thread HasToolFraming boolean, document SendText barrier commentary queueing, and document tool batch dedupe lifetime rule
  - Added `HasToolFraming?: boolean` to `RealtimeSessionParams` in `@memberjunction/ai` (Core), replacing prompt substring sniffing with an explicit caller-asserted parameter while retaining substring sniffing as a fallback.
  - Set `HasToolFraming: true` in `RealtimeClientSessionService.buildSessionParams` for companion co-agent sessions.
  - Added comprehensive unit tests in `@memberjunction/ai-openai` verifying that `HasToolFraming` explicitly controls standalone delegation policy compilation.
  - Documented in `OpenAILiveClient.SendText` that user typed input is appended to commentary rather than dropped when the tool barrier is active, draining with the tool batch's `response.create`.
  - Documented the shared lifetime rule for `emittedToolCallIds` and `toolBatchBarrier` across declaration and clear sites.
  - Added `"engines": { "node": ">=24" }` to root `package.json` and `packages/AI/RealtimeClient/package.json`.
  - Recorded Item 43 design note for `RequiresConsent` in `plans/realtime/gemini-3-8-live.md`.

- fc3da91: fix(realtime): confirm whiteboard agent edits only when the tool succeeded, and source inbound-video capability from per-model profile data

  Review follow-ups to #4512.
  - **A failed whiteboard tool no longer reports success to the model.** `ApplyAgentTool` pushed a confirmation frame and a "visual confirmation of your action — do NOT narrate or announce your own change" note unconditionally, including when the tool returned `{ success: false, error }` (invalid JSON arguments, unknown tool, per-tool validation). The model received its failure result alongside an assertion that the edit had landed, plus an instruction not to mention it — so a failed edit disappeared from the user's view. It also pushed a frame identical to the previous one, since a failed tool mutates nothing.
  - **Inbound-video capability and its frame-rate ceiling are now per-model data.** `GeminiLiveModelProfile` gains `MaxInboundVideoRate`, the mint carries both it and `SupportsInboundVideo` in the session config, and the browser driver reads them instead of inferring capability from the model id with `startsWith('gemini-3.8-live')`. That sniff and the profile table were two answers to one question, agreeing only because the model names happened to line up; a model that broke the naming pattern would have diverged silently. A future model that accepts a faster feed now declares it in the profile and every consumer follows.
  - **The whiteboard channel is change-driven with no liveness heartbeat.** Its `WHITEBOARD_HEARTBEAT_MS` constant could never fire — the elapsed check lived inside the mutation path, which an idle board never enters — so it read as a liveness guarantee while providing none.
  - `RealtimeTrack.Descriptor`'s doc now states that negotiation refinement covers `Rate` only, so no one reads `Encoding` or `UsageBasis` off a live track expecting the model's answer.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [b87e4ac]
- Updated dependencies [575bfae]
- Updated dependencies [e962151]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 97cbf5f: Fix realtime token usage being silently discarded for xAI Grok Voice sessions.

  The two OpenAI-compatible realtime providers put the `response.done` usage payload in **different places**, verified by live wire capture:
  - **OpenAI** (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
  - **xAI** (Grok Voice) populates a **top-level** `usage` and sends `response.usage` as an **empty object**.

  Both readers in the codebase dereferenced `response.usage` only. For xAI that value is `{}` — which is truthy — so the `if (!usage) return` guard never fired. A usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those clamped to `0` downstream, the host dropped the all-zero delta without arming its flush timer, and the session's tokens were never relayed. The result was `TokensPrompt`/`TokensCompletion`/`TokensUsed` sitting at NULL on `AIPromptRun` for every Grok Voice session — a silent accounting hole rather than a visible failure. The server-bridged path had the same read and would have recorded zeros.

  Adds `ResolveResponseDoneUsage` to `@memberjunction/ai`, shared by the client-direct reader (`OpenAIProtocolRealtimeClient`) and the server-bridged driver (`OpenAIRealtime`) so the two paths cannot drift apart on this again. It prefers the nested payload whenever that carries real token counts — leaving OpenAI's behavior unchanged — and falls back to the top-level one, so xAI is captured now and nothing breaks if xAI later populates the nested slot. Crucially it rejects a payload with no numeric token fields, which is what closes the empty-object trap.

  xAI's payload also carries per-modality detail (`text_tokens` / `audio_tokens` / `grok_tokens`), `output_audio_seconds` and `billable_audio_seconds`; these survive on the usage event's `Raw` field. Note `billable_audio_seconds` is **cumulative**, not a per-response delta, so it must not be summed if it is ever surfaced as one.

  The existing xAI usage test passed throughout, because it asserted against a hand-written OpenAI-shaped frame — encoding the very assumption that was wrong. Tests now use frames copied from real captures of both providers.

- Updated dependencies [834f8d7]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [5ecfdb4]
- Updated dependencies [a5f92d2]
- Updated dependencies [ada8784]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [080f4cd]
- Updated dependencies [be0bdb2]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [23c2521]
- Updated dependencies [97cbf5f]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [1bd9674]
- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0
  - @memberjunction/ai@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [61b5612]
- Updated dependencies [076fa5d]
- Updated dependencies [7fcdc2d]
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [197fdf8]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [ada8784]
- Updated dependencies [23c2521]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 97cbf5f: Fix realtime token usage being silently discarded for xAI Grok Voice sessions.

  The two OpenAI-compatible realtime providers put the `response.done` usage payload in **different places**, verified by live wire capture:
  - **OpenAI** (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
  - **xAI** (Grok Voice) populates a **top-level** `usage` and sends `response.usage` as an **empty object**.

  Both readers in the codebase dereferenced `response.usage` only. For xAI that value is `{}` — which is truthy — so the `if (!usage) return` guard never fired. A usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those clamped to `0` downstream, the host dropped the all-zero delta without arming its flush timer, and the session's tokens were never relayed. The result was `TokensPrompt`/`TokensCompletion`/`TokensUsed` sitting at NULL on `AIPromptRun` for every Grok Voice session — a silent accounting hole rather than a visible failure. The server-bridged path had the same read and would have recorded zeros.

  Adds `ResolveResponseDoneUsage` to `@memberjunction/ai`, shared by the client-direct reader (`OpenAIProtocolRealtimeClient`) and the server-bridged driver (`OpenAIRealtime`) so the two paths cannot drift apart on this again. It prefers the nested payload whenever that carries real token counts — leaving OpenAI's behavior unchanged — and falls back to the top-level one, so xAI is captured now and nothing breaks if xAI later populates the nested slot. Crucially it rejects a payload with no numeric token fields, which is what closes the empty-object trap.

  xAI's payload also carries per-modality detail (`text_tokens` / `audio_tokens` / `grok_tokens`), `output_audio_seconds` and `billable_audio_seconds`; these survive on the usage event's `Raw` field. Note `billable_audio_seconds` is **cumulative**, not a per-response delta, so it must not be summed if it is ever surfaced as one.

  The existing xAI usage test passed throughout, because it asserted against a hand-written OpenAI-shaped frame — encoding the very assumption that was wrong. Tests now use frames copied from real captures of both providers.

- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [de343b5]
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/ai@6.1.0-edge.1
- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/ai@6.1.0-edge.0
- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ai@6.0.0
- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ai@5.51.0
- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [c221553]
- Updated dependencies [0ba33b3]
  - @memberjunction/ai@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Minor Changes

- 9e2278c: Consolidate the OpenAI-protocol realtime driver family (server AND client) onto shared, subclassable implementations, and wire MJ's normalized effort levels through to the realtime session.

  **Normalized effort mapping (`@memberjunction/ai-openai`)** — the session Config bag now accepts MJ's normalized `effortLevel` (the `ChatParams.effortLevel` vocabulary: numeric 1–100 or named level), translated to provider literals through a new per-provider `OpenAIRealtimeProfile.mapEffortLevel` seam (OpenAI implementation exported as `MapEffortLevelToOpenAIRealtime`, quintile mapping across the five GA levels). Provider-native `reasoningEffort` remains an explicit override. Providers whose endpoints use different level vocabularies override the profile function — no protocol code changes. Also: `extractRealtimeFeatures` → `ExtractRealtimeFeatures` (PascalCase for exported functions), per-session `inputTranscriptionModel` override, and unconditional scrubbing of MJ-side transport keys (`endpoint`/`sampleRate`/`proxyBaseUrl`) so they never leak into a provider payload.

  **HuggingFace server driver subclasses the shared driver (`@memberjunction/ai-huggingface`)** — `HuggingFaceRealtime`/`HuggingFaceRealtimeSession` now extend the OpenAI driver via a profile plus the new exported `RawRealtimeWebSocketConnection` adapter (raw WS speaking OpenAI frames → `IOpenAIRealtimeConnection`; send-buffering until open, provider-error-frame rerouting, close shim — reusable by any future OpenAI-frame provider). The ~340-line protocol clone is deleted while every HF-specific behavior is preserved: ready-after-config `StartSession` (via the base session's new `WaitForConfigApplied` gate), fold-context-into-prompt, beta event aliases, tool-set fingerprint no-op, native-STT (no default transcription block), proxy-ticket client-direct topology, and compat `responseActive` robustness.

  **Client-side mirror (`@memberjunction/ai-realtime-client`)** — new shared layers: `OpenAIProtocolRealtimeClient` (the transport-agnostic protocol brain: event dispatch incl. GA+beta names, response state machine, narration tagging, tool-result queueing, the outbound actions) and `OpenAIProtocolWebSocketRealtimeClient` (websocket + client-owned PCM plane). `OpenAIRealtimeClient` retains only its WebRTC transport; `xAIRealtimeClient` and `HuggingFaceRealtimeClient` collapse to thin subclasses (Grok: model-on-URL + subprotocol auth + fixed 24 kHz + streamed-transcript collapse + wire diagnostics; HF: proxy-URL connect + `{session, sampleRate}` pact parsing + `session.created` gate + benign close semantics). The per-driver duplicate frame-model types are REMOVED (breaking for anyone importing e.g. `XAIRealtimeEvent`/`OAIResponseAudioTranscriptDelta`/`IxAIClientSocket` from the driver modules — import the `OAIProtocol*`/`OpenAIProtocol*`/`IOpenAIProtocolClientSocket` names from the package root instead; repo-wide search found no consumers outside this package's own tests). Guard improvement: `RequestSpokenUpdate` on a non-open transport no longer flags busy without sending.

  **Testing** — dramatically expanded across the family: new `RawRealtimeWebSocketConnection` suite (buffering, dual error channel, listener semantics, payload integrity), `WaitForConfigApplied` lifecycle coverage, config-extraction hardening, per-provider gating proofs, and a ~2.7× expansion of the HuggingFace client suite (pact edges, tool loop, narration, barge-in/cancel, transport semantics, teardown). Suite totals: ai-openai 120, ai-xai 50, ai-huggingface 30, ai-realtime-client 377 — all passing; the pre-existing suites pass unchanged against the subclassed drivers (behavior-preserving refactor).

- bc388e3: Realtime QA hardening — every finding from the adversarial audit of the driver-family consolidation (PR #3177) plus the broader co-agent architecture, fixed with regression tests (plan: `plans/complete/realtime-qa-hardening.md`).

  **Regression fixes (A-items)** — bodyless provider `error` frames are recoverable again on raw-WS providers (adapter synthesizes the payload; transport failures stay fatal); `Capabilities.CanReconfigureTurnMode` is profile-gated (`supportsLiveReconfigure` — HuggingFace now truthfully reports false and `Reconfigure` no-ops); protected wire fields (`type`/`instructions`/`tools`) can no longer be overridden through the open Config bag (closing a strict-endpoint session.update kill vector) while the documented `audio` override remains; the client-direct minted `SessionConfig` now applies the residual bag with the same construction order as server-bridged (the two topologies are actually identical); deferred-config listener cleanup on early teardown; family-wide empty-transcript suppression; settle-handle + adapter buffer hygiene.

  **Robustness (B-items)** — connect/readiness deadlines everywhere (client WS `connectTimeoutMs` covering open + `session.created`, with socket-death/`Disconnect` releasing the awaited `Connect`; server `configReadinessTimeoutMs` rejecting `WaitForConfigApplied` on silent endpoints without cancelling the deferred apply); stale-`response.done` protection (a cancelled turn's trailing done can't release the busy lock under a locally-initiated replacement); TRUE-barge-in drops queued tool-result auto-triggers (the model never speaks over a user who took the floor; delivery via the user's next turn); WebRTC remote-stream handlers cleared on Disconnect; WS sends gated on socket-open.

  **Architecture (C-items)** — `realtime.session` tuning config (`effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`) now flows config→bag→driver on BOTH topologies (`GetSessionTuningSettings`; the PR #3177 driver features are live end-to-end); per-modality usage detail (`RealtimeUsage.Input/OutputTokenDetails`) captured by the OpenAI driver, accumulated by the runner, and persisted on the realtime `AIPromptRun` for multi-channel cost attribution; HF proxy hardening (optional `MJ_REALTIME_PROXY_ALLOWED_ORIGINS` allowlist, upstream-open deadline, bounded pre-open buffer); the session runner observes the chained cancellation signal and performs bounded transport reconnects (default 1, `MaxTransportReconnects`); MCP approval requests are auto-DENIED so the turn continues instead of dead-air blocking; Gemini scrubs+warns on foreign OpenAI-protocol/transport keys (`REALTIME_SHARED_CONFIG_KEYS` exported from Core); `RealtimeTranscript.ReplacesPrevious` added for streamed-final providers.

  Suite totals after the wave: ai-openai 147, ai-realtime-client 391, ai-agents 1653, ai-gemini 87, ai-xai 50, ai-huggingface 34, MJServer proxy 8 — all passing.

  **Second-pass re-audit fixes**: a follow-up adversarial audit of the hardening itself found the C1 fix was inert (the new realtime.session field was never propagated through the effective-config resolver — now fixed with normalizeSession), plus untested edges introduced by the B2 counter (permanent wedge on a rejected response.create — now self-heals on the error frame), the C7 reconnect (abort/Stop race leaking a live session; stale call_id relayed to the fresh session; no re-entrancy/identity guard — all fixed), the client connect deadline (timer leak on synchronous socket-construction throw), reused-instance socket handling (old socket late close corrupting the new session), the C4 abort window (abort during StartSession lost), model not being a protected wire field, and ReplacesPrevious being ignored at the transcript-persist site. All fixed with regression + interaction-seam tests.

  **Fifth-pass re-audit fixes**: a five-reviewer verification pass found one reachable correctness bug and closed two latent transcript fragilities. (1) The pass-4 client `onErrorFrame` fix cleared the pending narration kind only when no confirmed response was active, so a narration create rejected while a cancelled response drained mistagged the next delegated-answer turn as ephemeral (dropping its transcript) — the kind is now cleared unconditionally on the rejecting error. (2) The transcript in-flight-row bookkeeping moved to an `{id, open}` model so a turn that emits both an interim delta and repeated streamed completeds still collapses to one row, and a short assistant final no longer suppresses the next turn's interim streaming row. Coverage added for the `confirmedResponseActive` busy-lock guard and the per-turn `ReplacesPrevious` reset (xAI + HuggingFace).

  **Fourth-pass re-audit fixes**: a four-reviewer pass found one regression from the third-pass work and several reachable pre-existing defects, all fixed with regression tests. (1) The third-pass usage un-gate let a trailing usage frame accumulate after `Stop()` and arm a post-finalize checkpoint timer — now gated on the runner lifecycle (`!stopped`) instead. (2) `RealtimeTranscript.ReplacesPrevious` is now wired END-TO-END: the shared server session flags the 2nd+ streamed user transcription completed (Grok streams repeated growing finals) and `persistRealtimeTranscript` uses status-disambiguated reuse, so server-bridged Grok/ElevenLabs no longer mint a duplicate `ConversationDetail` per caption (previously the flag was only ever set client-side). (3) The client `onErrorFrame` self-heal now clears the eager `responseActive`/narration phantom left by a rejected local `response.create` (a `confirmedResponseActive` flag distinguishes it from a live VAD turn) so `IsBusy` no longer wedges on compat endpoints. (4) The tool broker aborts EVERY concurrent delegation on barge-in (was: only the newest, orphaning the rest). (5) The HuggingFace server session declares its native 16 kHz sample rate (was: bridge fell back to 24 kHz into a 16 kHz pipeline). (6) A stuck delegate can no longer leak stale narration-burst timing across a reconnect (burst state reset decoupled from the delegation counter).

  **Third-pass re-audit fixes**: a third adversarial pass against the latest `next` found three residual seams: (1) the C8 transcript-persist fix only bound the in-flight key on the INTERIM branch, so a FINALS-ONLY streamed provider (e.g. Grok user captions, ElevenLabs corrections) that never emits an interim delta still minted a duplicate `ConversationDetail` row per correction — the create+finalize branch now binds the key too; (2) the C7 reconnect blanket-zeroed the runner's shared `activeDelegations` counter, which — combined with each aborted delegation's self-decrementing `finally` — could double-decrement and steal a CONCURRENT post-reconnect delegation's narration burst; the reset is gone (frames self-unwind); (3) `OnUsage` was identity-gated like every other handler, so a trailing usage frame flushed on the just-dropped socket was silently discarded — usage is runner-GLOBAL (cumulative) and is now un-gated. Plus a bounded-worst-case characterization test for the S1 self-heal. All fixed with regression + interaction-seam tests.

### Patch Changes

- 42fc86b: Stop a mid-sentence pause from splitting one spoken utterance into several transcript turns.

  Providers that stream input transcription (Grok) re-emit the **full accumulated utterance** on every `input_audio_transcription.completed`, and their VAD fires `speech_started` on ordinary mid-sentence breaths. Treating each `speech_started` as a hard turn boundary therefore split one spoken thought into several persisted turns, each a longer copy of the last — observed live as three conversation rows for a single sentence:

  ```
  "...including whiteboarding, uh, remote."
  "...including whiteboarding, uh, remote, so just get going."
  "...including whiteboarding, uh, remote, so just get going. Show me some cool stuff."
  ```

  Adds `IsTranscriptContinuation` (new, dependency-free module in `@memberjunction/ai`): a caption that **extends** the utterance already in flight is now recognized as a continuation and flagged `ReplacesPrevious`, collapsing the stream into one in-place-updating turn. Crucially the comparison is **normalized** (lowercased, punctuation/whitespace collapsed) because ASR engines re-punctuate as a sentence grows — in the production case above the earlier text is _not_ a literal prefix of the later one (`remote.` became `remote,`), so a naive prefix test missed roughly half the occurrences.

  The continuation window closes when the model takes the floor (`response.created`), so two genuinely separate utterances that happen to share an opening can never be merged.

  Applied identically in the shared server session (`OpenAIRealtimeSession`, inherited by Grok/HuggingFace) and the client-direct xAI driver, so both topologies collapse the stream the same way. A new `onResponseStarted()` hook on the shared client brain gives drivers a seam for per-user-turn state. No behavior change for single-completed providers such as OpenAI, which never produce a continuation to detect.

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [b52ffa8]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [15e3017]
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0

## 5.48.0

### Minor Changes

- c20723a: Add a self-hosted **HuggingFace speech-to-speech** realtime (voice) provider, sitting side-by-side with the cloud realtime providers (OpenAI, Gemini, ElevenLabs, AssemblyAI) with no host changes. It treats HuggingFace's open-source VAD → STT → LLM → TTS stack (in its OpenAI-Realtime-compatible `/v1/realtime` mode) as a `Realtime` model — private-by-design (audio never leaves owned infrastructure), cost-free, and component-swappable.

  Because the endpoint is self-hosted, the shipped client-direct audio topology runs through a new provider-agnostic **MJAPI realtime proxy**: the driver mints a one-time ticket into a shared `RealtimeProxyRegistry` (`@memberjunction/ai`) and hands the browser a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL, so the internal endpoint + auth never reach the browser and the box needs no browser-facing ingress. Adds the new `@memberjunction/ai-huggingface` driver package, the `HuggingFaceRealtimeClient` (`@memberjunction/ai-realtime-client`), the `RealtimeProxyServer` + single upgrade-router in `@memberjunction/server`, the class-registration manifest entry (`@memberjunction/server-bootstrap`), and the client-load wiring (`@memberjunction/ng-conversations`), plus the `Hugging Face` vendor + `HuggingFace Speech-to-Speech` model metadata (low PowerRank — opt-in). Additive only; endpoint/auth/sample-rate are deployment config.

### Patch Changes

- Updated dependencies [c20723a]
  - @memberjunction/ai@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ai@5.47.0
- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ai@5.46.0
- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0
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

- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- 6f227ab: Realtime voice co-agent: direct channel control, full observability, Grok client-direct, and channel onboarding.
  - **Direct channel control** — the voice co-agent now drives interactive channels (the `browser_` and `Whiteboard_` tools) DIRECTLY instead of delegating every request to the target agent. The framing was fixed in both the client-direct path (`realtime-client-session-service.ts`, the path actually used) and the server-bridged path (`base-agent.ts`). A one-line mint log now surfaces the exact tools + framing reaching the model.
  - **Auto/Default model resolution** — now walks candidate Realtime models by power and returns the first that fully resolves to a usable client-direct driver, instead of dead-ending on a keyless or non-client-direct top pick (e.g. a newly-seeded Grok/Inworld model outranking GPT Realtime).
  - **Co-agent observability** — the co-agent's long-lived `AIPromptRun` now captures the full conversation: transcript turns AND channel tool calls (recorded run-only as `🔧 <tool> … → <result>`), closing the gap where the run held only token totals. Observability parity with every other MJ agent run.
  - **Grok Voice client-direct** — implemented xAI's OpenAI-Realtime-compatible client-direct topology: server ephemeral-token mint (`CreateClientSession` + `SupportsClientDirect`) plus a new browser-side WebSocket-audio client driver in `@memberjunction/ai-realtime-client` (registered under `Provider: 'xai'`). Grok is now selectable for voice sessions.
  - **Channel onboarding** — a first-run intro/details panel generalized to any interactive channel (Whiteboard, Remote Browser, future ones) via an optional `GetOnboardingDetails()` on `BaseRealtimeChannelClient`; excluded for the base Voice channel and persisted per-user via `UserInfoEngine`.
  - **Fix** — NG0100 `ExpressionChangedAfterItHasBeenCheckedError` on channel reveal (agent-activity tab mutations now deferred to a microtask).

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- 1568bae: Realtime ledger completion + two field bugs. SERVER CHANNEL PLUGIN HALF: `ServerPluginClass` is now consumed — `BaseRealtimeChannelServer` lifecycle contract in @memberjunction/ai, `RealtimeChannelServerHost` (ClassFactory resolution mirroring the client half, per-session instances, failure-isolated hooks, post-close dispose linger) in ai-agents with a `WhiteboardChannelServer` reference impl that validates/canonicalizes landed board saves, wired through SessionManager create/close and the channel-state save path. TRANSCRIPT CORRECTIONS END-TO-END: `RealtimeClientTranscript.ReplacesPrevious` (stamped by the ElevenLabs driver on `agent_response_correction`) replaces the caption in place and `RelayRealtimeTranscript(replacesPrevious)` updates the persisted turn instead of appending. ASSEMBLYAI RESUME WINDOW: one-shot `session.resume` reattach on unexpected socket drop (mic/playout survive; failed/second drop falls through to the old fatal path). WHITEBOARD: widget srcdoc rebuilt per mount via a view-scoped pure pipe — SVG charts survive page switches/lazy remounts, and mounted widgets no longer reload on unrelated journal ops (the old journal-invalidated identity cache was both stale on remount and over-eager on 'replace'). CONVERSATIONS: surface-panel (re)creation lands on the marquee channel tab (the whiteboard) instead of the Activity rail, the agent's first stroke reveals synchronously, and session review now merges channel states across ALL chain legs (newest leg with a saved board wins) so resumed sessions never hide an earlier leg's drawing. Plus Per-Minute/Per-Hour AI model price unit types seeded via metadata.
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [15b743b]
- Updated dependencies [1568bae]
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0
