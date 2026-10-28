# @memberjunction/ai-vertex

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [709de1a]
- Updated dependencies [914e6ff]
- Updated dependencies [1141164]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-gemini@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- c6d1232: The Gemini provider (and Vertex, which inherits it) stops sending `temperature`, `topP` and `topK` to the models that no longer honor them. Google has announced that upcoming Gemini models return 400 INVALID_ARGUMENT for these fields.
  - **Sampling fields stop at Gemini 3.6.** Models before 3.6 still honor `temperature`, `topP` and `topK`, so they keep them unchanged, including the 0.5 `temperature` default. Gemini 3.6+ and Gemini ids with no version (such as `gemini-flash-latest`) get none of the three. A caller-supplied value is dropped for those models with one console warning per model and field per process. Google has ignored these values since Gemini 3.6 Flash, so output from those models does not change. The cutoff is read from the version in the model id, so a newly released model needs no code change. Non-Gemini models served by these drivers (Gemma on Vertex) are unaffected.
  - **`topP` / `topK` now reach models before 3.6.** They were sent as `top_p` / `top_k`, which `@google/genai` silently drops, so they never took effect. They are now sent as `topP` / `topK`.
  - **An explicit `temperature: 0` is sent as 0.** `params.temperature || 0.5` turned it into 0.5.
  - **Removed the thinking configuration, which has not reached Google since November 2025.** The provider built a `thinkingConfig` (`thinkingBudget` on Gemini 2.5, `thinkingLevel` on Gemini 3) and set it on the chat session. `@google/genai` replaces the session config with the per-request config whenever a request passes one, and since November 2025 this provider always passes one, so the thinking config was not sent. Since then Gemini has run at each model's default thinking. `effortLevel` was mapped only after that point, so it has never had an effect. This change removes that code, the private `getThinkingBudget` and `supportsThinking` methods, and the `-3` through `-7` model-name check. What goes out on the wire does not change. Making `effortLevel` work on Gemini is separate follow-up work.

- 72dd65c: Adds `realtime.session.transcriptionLanguages`, a caption-language hint for realtime voice sessions, and makes a rejected Gemini Live connect fail instead of hang.
  - Gemini Live captions both sides of a call with its own transcription, and with no hint it guesses each utterance's language, so an English call could show captions in Arabic, Tamil or Korean script. `"transcriptionLanguages": ["en-US"]` (BCP-47 codes) under `realtime.session` is sent as `languageCodes` on both caption streams. It is a hint, not a lock: other languages still caption in their own script. Unset, nothing changes.
  - Set it on the target agent's `TypeConfiguration` (agent types without a `ConfigSchema`), an agent type's `DefaultConfiguration`, or a runtime override. A Realtime-type co-agent cannot save it yet: that type's schema does not declare `realtime.session`, which was already true for every session key.
  - The OpenAI-protocol drivers scrub the key, and the other drivers drop it with the rest of the shared session keys.
  - The relay's Live setup writer now keeps `languageCodes` on the Developer API, as SDK 2.14+ does, so relayed sessions carry the hint too.
  - Raises `@google/genai` from `^2.8.0` to `^2.16.0`, because SDKs before 2.14.0 throw on `languageCodes`. Set the key only after every browser bundle that opens Gemini sessions is rebuilt on this release.
  - A Gemini Live connect now rejects with the close reason when the socket errors or closes before setup completes, in the server and browser drivers for both the Developer API and Gemini Enterprise. Before, a close before the socket opened hung on any SDK, and from SDK 2.11 so did a rejected key, model or setup field.

- Updated dependencies [0d81c53]
- Updated dependencies [3080e83]
- Updated dependencies [81aea34]
- Updated dependencies [55184f1]
- Updated dependencies [e5675dc]
- Updated dependencies [c6d1232]
- Updated dependencies [2274f42]
- Updated dependencies [230cdad]
- Updated dependencies [4e4c82d]
- Updated dependencies [72dd65c]
- Updated dependencies [17a4137]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-gemini@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 7316ac3: Gemini 3.8 Live gets a Vertex AI (Gemini Enterprise) model-vendor row, its voices and one example avatar persona on Vertex AI, an avatar video price and a default Vertex AI token price. The AI configuration JSON type catches up with its `@memberjunction/ai` mirror, and `spCreateAIModelCost` lets a cost row omit the deprecated `PriceTypeID`.
  - **Vertex AI row:** `GeminiEnterpriseRealtime`, API name `gemini-3.8-live`, the Google row's `ModelConfiguration.Realtime`, Priority 1 (Google's is 0). Realtime sessions select it only where `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` is set. Gemini 3.8 Live also gains a Video / Output modality row.
  - **Voices and avatar on Vertex AI:** Puck, Charon, Kore, Fenrir and Aoede get Audio bindings on Vertex AI with the same voice names as on Google, and the new persona "Ben" pairs Google's "Ben" avatar preset (Video binding, `VendorSettings.Avatar.Kind` `preset`) with the Puck voice. With the existing model persona rows plus Ben's, Gemini 3.8 Live lists all six on Vertex AI; the Google listing is unchanged. The Vertex AI names are unverified until Vertex AI access, and each binding says so.
  - **Avatar video price:** `ModelConfiguration.Realtime.Pricing.AvatarVideoOutput` on the Vertex AI row is $1.00 per 1M avatar video output tokens in USD, Google's list price.
  - **Token price:** a default cost row for Gemini 3.8 Live on Vertex AI mirrors Google's Developer API list price ($0.75 input and $4.50 output per 1M tokens, Realtime), to be checked against the Vertex AI price list. It leaves `PriceTypeID` to the database default.
  - **AI configuration types:** `IAIConfiguration` now declares everything the `@memberjunction/ai` mirror does: `TurnDetection.Coverage`, `Reasoning.Level` (new in both, with `RealtimeReasoningEffort`), `Reasoning.IncludeThoughtSummaries`, `Tooling`, `RequestedTracks` (with a copy of the track descriptor types), `IdleSignal`, and the new `Pricing`. Members the mirror declares without `| null` lose it in the JSON type, so the generated `ModelConfigurationObject` / `PromptConfigurationObject` / `ConfigurationObject` types on the six AI entities match the mirror exactly. A Core test now fails when the two drift.
  - **`spCreateAIModelCost`:** a migration drops the procedure so CodeGen regenerates it with `@PriceTypeID` optional, defaulting to the Tokens price type (the column default since 6.1). Cost rows can now omit the deprecated column, as its description asks.

- 8a9d203: Gemini Live on Gemini Enterprise (Vertex AI) no longer asks for a turn coverage Vertex AI refuses. Vertex AI closes a session's setup on `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` (1007, "Invalid value at 'setup.realtime_input_config.turn_coverage'", on `v1` and `v1beta1`), which Gemini 3.8 Live's catalog rows asked for (`audioActivityAndAllVideo`). The Gemini Live endpoint profiles now say which turn coverages each endpoint accepts: the Developer API both, Gemini Enterprise only `audioActivityOnly`. A session whose configured coverage its endpoint doesn't accept, or whose value is not a coverage, sends `TURN_INCLUDES_ONLY_ACTIVITY` and logs one line naming what was asked for and what was sent. This covers the setup MJAPI's relay writes for a browser session and bridged sessions, resumed connections included. The Developer API still sends `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` when it is configured. The Gemini 3.8 Live row on Vertex AI now sets `ModelConfiguration.Realtime.TurnDetection.Coverage` to `audioActivityOnly`; the model's own value and the Google row keep `audioActivityAndAllVideo`.

### Patch Changes

- 155aa45: Live-avatar settings that change without a rebuild, and a Google Cloud API key as a Vertex AI credential.

  `MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS` sets the `avatarConfig.videoBitrateBps` a Gemini Live avatar session asks for, in bits per second: 2,000,000 when unset, as before, and `0` leaves the field out. A value that is not a whole number is logged once and the default is used. It is read wherever MJ writes the avatar into a session's config, so the browser mint, MJAPI's relay setup and server-side (meeting) sessions all follow it (`ResolveGeminiAvatarVideoBitrateBps`).

  `MJ_GEMINI_LIVE_MODEL_ALIASES` gives a model id the Gemini Live profile table does not know the profile of one it does: `<model id>=<known model id>`, comma-separated, such as `gemini-live-3.8-preview=gemini-3.8-live`. Google is still sent the catalog's API name; what the model accepts and renders (the avatar on Gemini Enterprise) comes from the known model's row. An alias matches the whole id and wins over the table. Bad entries are named in one log line, and each alias is logged once when first used.

  The Vertex AI key JSON (`VertexAICredentials`) takes two optional Gemini Live fields, which `GeminiEnterpriseRealtime` uses for the relay's upstream and for server-side sessions: `liveApiVersion` (`v1` when unset; for example `v1beta1`) and `liveHost` (a host name with an optional port, bare or after `https://` or `wss://`, with nothing after it). A `liveHost` is honoured only in the platform's environment key, since MJAPI sends the token or API key to that host. Anything else is refused with a `VertexCredentialsError` (`invalid-live-host`, `invalid-live-api-version`, `live-host-not-allowed`) whose message quotes no value.

  The key JSON may hold a Google Cloud API key (`apiKey`), never beside another credential (`api-key-with-credentials`; `invalid-api-key` for one a header cannot carry). Alone, it takes Google's global route, as `@google/genai`'s API-key mode does: the global host and the model's short name (`publishers/google/models/<id>`). With a `project` (and a `location`, `us-central1` by default), it takes the regional route: the location's host and the full model name. Either way the relay and server-side sessions send it as `x-goog-api-key` instead of an OAuth bearer, and it never reaches the browser, the session pact, the relay URL or the logs. `VertexGenAIOptions` gives the SDK the key alone, so `VertexLLM` uses the global route with either shape. `BuildGeminiLiveSetup` takes `UsesApiKey`, and `BuildGeminiLiveModelPath` is exported.

  An avatar part that opens with an MP4 box (`ftyp`, `moov`, `moof`, `styp`) plays as the avatar whatever MIME type it names, in the browser client and in server-side sessions, which hand it to the meeting room labelled `video/mp4`. A part that is not MP4 and names a type other than video or PCM never plays. `SniffFmp4Piece` reads a `moov` first as an init segment.

  MJAPI logs each realtime relay or proxy upgrade it refuses for its Origin (`MJ_REALTIME_PROXY_ALLOWED_ORIGINS`): `[RealtimeRelay] upgrade refused (403): origin "<origin>" is not in MJ_REALTIME_PROXY_ALLOWED_ORIGINS` (`[RealtimeProxy]` on the proxy path), with the origin's printable characters only, and never the ticket or the path.

- 6cd23e1: A call whose agent asked for a live avatar it can't show says so once. Core gains `RealtimeAvatarStatus`, `ClientRealtimeSessionConfig.AvatarStatus`, `BaseRealtimeModel.SupportsAvatarOutput(model)` (default `false`; Gemini answers from its Live profile) and `ParseRealtimeAvatarStatus`, and the browser-side reason `downgraded` becomes `host` and `browser` (the Gemini and Gemini Enterprise browser clients log the new reason). Both Gemini drivers (`GeminiRealtime`, and `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`) return their avatar decision on the mint, through the protected `AvatarStatusFor`; `RealtimeClientSessionService.PrepareClientSession` merges it with the persona resolution (`endpoint` first, then `no-binding` / `unknown-avatar`, else the driver's decision), logs one line, and returns `AvatarStatus`, which MJServer sends as `StartRealtimeClientSessionResult.AvatarStatusJson`. The stock launcher asks for the field and drops it alone against a server that predates it. After the call connects, the runtime publishes `AvatarNotice$` (`host` when the app asked for no agent video, `browser` when the track did not go live, else the status's reason), once per call, and clears it when the call ends. `ng-realtime-media` holds the wording (`AvatarNoticeText`, "Audio only: …", per-reason host overrides) and declares `@memberjunction/ai`; the call overlay shows it as a small info `mj-alert` under the banner in both chromes, with a dismiss button, hiding after 10 s, never in review (`AvatarNoticeLabels` overrides the words). Calls whose agent asked for no avatar look as before. Integration check RD13 also checks that a voiced agent without a face on the session's vendor asks for no avatar and reports `no-binding`.
- 961d529: `ClientRealtimeSessionConfig` gains `Transport` (`'direct'` or `'relay'`; absent means direct) and `RelayUrl`, so a minted session says how the browser reaches its provider. The Gemini Enterprise mint returns a relay session: `Transport: 'relay'`, the relay URL as `RelayUrl` (the ticket is in its path) and an empty `EphemeralToken`. MJAPI's `StartRealtimeClientSession` returns both fields; the realtime runtime and the support widget ask for them and hand them to the client driver, and mint without them against a server that predates them. The `'gemini-enterprise'` client connects to `RelayUrl` and refuses a session that is not a relay session. Every other client driver refuses a relay session in `Connect` (`BaseRealtimeClient.AssertTransportSupported`); a driver that can open one opts in through `SupportsRelayTransport`. The relay URL is never logged.
- 91be34f: Gemini Live on Gemini Enterprise (Vertex AI): a server driver and a browser driver. `GeminiEnterpriseRealtime` (`@memberjunction/ai-vertex`) reads `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` (or a run's key), a JSON string in the shapes `VertexLLM` takes: an inline service account, a key-file path (environment key only), or neither for Application Default Credentials. A client-direct session goes through MJAPI's realtime relay: the mint issues one relay session per call, whose policy writes the Live setup from the connect config and adds a `google-auth-library` bearer token (scope `cloud-platform`) on each upstream open, never at the mint. The browser gets the relay URL, with the ticket in its path, and a pact whose config holds only the response modalities and the avatar's name: no system prompt, no tools, no credential. The upstream is the Vertex AI `v1` Live socket on the location's host (`us` and `eu` on `aiplatform.<location>.rep.googleapis.com`); the mint warns when the location is not `us`, `eu` or `us-central1`. A bridged session uses `@google/genai` in Vertex mode, audio only. The constructor never throws; a key that cannot be read fails the session with a reason that quotes none of it. `GeminiEnterpriseRealtimeClient` (`'gemini-enterprise'`, `@memberjunction/ai-realtime-client`) runs the web SDK in Vertex mode against the relay URL with a placeholder API key that never leaves the page, always states its response modalities (VIDEO while it shows the avatar), and resumes on the same URL. Both Vertex drivers now read their key through shared helpers (`ParseVertexAICredentials`, `VertexKeySourceOf`, `CreateVertexAuthClient`, `VertexGenAIOptions`) and build the `google-auth-library` client themselves instead of passing the deprecated `keyFile` or `credentials` options to `GoogleAuth`: an inline service account becomes a `JWT` client with the `cloud-platform` scope, and a key without credentials still uses Application Default Credentials. **Change to run-key handling in `VertexLLM`: a key may name a key file (`keyFilePath`) only when it is the driver's environment key (`AI_VENDOR_API_KEY__VertexLLM`; `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` for the realtime driver), byte for byte. A run's key (`apiKeys`), an MJ Credential (the Google Cloud Platform credential type's Key File Path) or any other key that names a key file is refused when the client is created, with an error that does not quote the path; use an inline service account (`serviceAccountJson`) or Application Default Credentials instead.** Environment keys behave as before: MJ reads the key file and builds the client for its `type` (service account, authorized user, impersonated service account, external account, GDCH). The file is now read when the client is created rather than at the first request, and its errors no longer quote the path. `GeminiRealtime` gains the protected `SessionPactFor`. The realtime runtime keeps the new client from being tree-shaken, and the server and browser class-registration manifests register the two drivers. Integration checks RD13 (the avatar from the voiced agent's persona, through the session prep) and RD14 (every realtime vendor DriverClass resolves). Nothing selects the Enterprise driver until its vendor row ships.
- f5e317c: `GeminiEnterpriseRealtime`'s bridged sessions now open a moved `LiveUrl` as given, path prefix and API version included (#5449). A subclass that overrides the protected `LiveUrl` already moved the relay's upstream to the whole URL, but bridged sessions took only its scheme, host and port, and `@google/genai` wrote Google's socket path after them with the key's API version. The driver now gives the SDK everything before the socket path (`/ws/google.cloud.aiplatform.<version>.LlmBidiService/BidiGenerateContent`) as its base URL, with the version that path names, so a proxy behind a path prefix or on another API version serves bridged sessions on the same URL as the relay. A moved URL the SDK cannot open as given (no socket path at its end; a user, a query or a fragment; a scheme other than ws, wss, http or https) fails a bridged session with a message that does not quote it. A driver no subclass moves passes the SDK the same options as before.
- 6055792: `GeminiEnterpriseRealtime` has a protected `LiveUrl(credentials, location)`: the Vertex AI Live websocket a session connects to. A subclass registered at a higher priority can override it to point the driver at another host, such as a mock upstream, a private endpoint or a proxy, without patching the package (#5315). MJAPI's relay opens client-direct sessions on the URL it returns, and bridged sessions' `@google/genai` client connects to its scheme, host and port. By default it returns the URL the driver used before, and a driver no subclass moves builds the same relay session and the same SDK options as before. The credentials are unchanged: the relay and the SDK send the same bearer token or API key, to the host `LiveUrl` returns. The token does not depend on the URL, since both paths ask for the `cloud-platform` scope. This is a seam for code, not a configuration setting.
- 08a4cfc: The meeting bot publishes an agent's avatar. Before an agent's meeting session opens, the room coordinator asks the native room module whether the bot can publish one (`describeAvatarVideo`: `@livekit/rtc-node` with video publishing, and ffmpeg 4.2 or later with the H.264 and AAC decoders, from `MJ_FFMPEG_PATH` or the `PATH`, probed once per thread); only then does the session ask for it (`RealtimeAvatarSettings.Delivery: 'room'`, threaded through the bridged session prep), and the Gemini driver grants it on an endpoint that renders avatars (VIDEO, the avatar at 2 Mbps), with the decision on `IRealtimeSession.AvatarStatus`. A granted bridged Gemini session sends the avatar's fragmented MP4 as typed frames through `IRealtimeSession.OnVideoFrame`, plays PCM only before a turn's first video, drops media from `interrupted` to that turn's `turnComplete`, and reports the avatar video it generated as `OutputTokenDetails.VideoSeconds` deltas through `OnUsage` (counted up to `generationComplete`). The engine sends the pieces on `video-out` with their MIME type; in a full-duplex multi-agent room each piece passes the floor gate by its audio's duration (`FullDuplexTurnGate.OnOutputDuration`). The LiveKit bridge routes `video/mp4` frames to the room client (`publishAvatarMedia`), which reads them with Core's fMP4 reader (`ReadFmp4Fragment`, `AvccToAnnexB`, `AdtsHeader`, and `Fmp4AudioSeconds` beside AV9's `Fmp4VideoSeconds`; `ReadFmp4Init` also reads a track's size, the trex sample size and flags, the H.264 parameter sets and the AAC config), decodes them in two long-lived ffmpeg child processes, queues the voice on the bot's audio track and shows each frame on a camera track (`agent-avatar`, LiveKit's default simulcast, published at the first frame) when the voice's playout reaches the frame's timestamp. A barge-in drops the queued frames and fences both decoders; the last frame stays on screen. A decoder that dies is restarted; three failures of one decoder within 60 s, or a refused camera track, take the avatar down: the track is unpublished, the bot sets `mj.agentAvatar` to `audio-only:<reason>` (agent bot tokens now carry `canUpdateOwnMetadata`), and the engine replaces the model session with an audio-only one (`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`). The bot's join token carries `mj.agentAvatar` (`on`, or `audio-only:<reason>` with `decoder-missing` when the host has no usable ffmpeg); Core adds the attribute helpers and the reasons `decoder-missing`, `decoder-failed` and `publish-failed`, which `ParseRealtimeAvatarStatus` reads and `REALTIME_AVATAR_UNAVAILABLE_REASONS` lists (from the same table); the call and mobile notices word them "Audio only for {Agent}: the avatar couldn't be shown in this meeting". `GeminiEnterpriseRealtime` renders a bridged session's avatar the same way. With the media worker on, the pieces are transferred to the worker, a restarted worker gets the stream's init again, and one restarted after a take-down joins audio only. Integration check RD17 (the LiveKit provider allows video out, and the native module answers the avatar probe). The MJAPI image can install a pinned LGPL static ffmpeg (BtbN) checked against its sha256; it is off by default (`INSTALL_FFMPEG=false`, so meetings stay audio only): fill in the pin values and build with `--build-arg INSTALL_FFMPEG=true` to turn it on.
- e293b68: A realtime model's video output comes as typed frames. Core adds `RealtimeVideoFrame`, a union of three kinds, each with its MIME type: `fmp4` (a piece of fragmented MP4, `Piece: 'init' | 'fragment'`), `chunk` (one encoded frame, H.264 in Annex B form or VP8, VP9 or AV1, with a required `PresentationTimeMs` and `KeyFrame`) and `image` (JPEG, PNG, WebP). `PresentationTimeMs` is on the stream's own media timeline, not wall-clock time; `Width` and `Height` are optional. `Fmp4PieceToVideoFrame` builds an fMP4 frame from a model part: the piece from its first box, an init's picture size from its video track, and a fragment's time and key-frame flag from its first video sample; bytes neither labelled `video/mp4` nor opening with an MP4 box give `null`. `IRealtimeSession.OnVideoFrame` replaces `OnAvatarOutput` and `RealtimeAvatarMediaChunk`, which were added earlier in this release, and `OnVideoOutput` is deprecated (hosts still forward it; it goes in the next major version). A granted bridged Gemini avatar, on the Developer API or Gemini Enterprise, sends its pieces as frames through `OnVideoFrame`, and the browser Gemini client hands frames to `VideoPlayout.Append(frame)` (`IAvatarVideoPlayout.Append` takes a frame); both drop a `video/*` part that isn't MP4 and report it once per type. The bridge engine forwards each frame on `video-out` with its MIME type and copies what the frame says about its video onto the bridge frame (`Width`, `Height`, `KeyFrame`: an image is a key frame, an fMP4 init carries its own size, and an fMP4 fragment with video carries its key-frame flag and the size of the stream's init); in a full-duplex multi-agent room the floor gate reads an fMP4 frame's piece (an init passes, a fragment counts its audio), and encoded chunks and images pass ungated because their voice comes as PCM, which is gated. `VideoPlayout` plays `fmp4` frames and drops any other kind, reporting `'no-decoder'` once.
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [4412e85]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [0dbd455]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [af6f892]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [a1eaf42]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [111a5f3]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [7e86ce0]
- Updated dependencies [584fc44]
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
- Updated dependencies [5e21f50]
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
- Updated dependencies [8a9d203]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/ai-gemini@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 29b6ec3: fix: native tool calling — object action params, a one-turn `complete_task` finish, an implicit-mode Loop prompt, and Gemini thought signatures across failover

  Found running Skip's Query Writer on Gemini 3 Flash with native implicit control flow. `Simple Object` action params are declared as `object` and a JSON-string argument is decoded before the Action runs (`Other` stays `string`). A new `complete_task` control tool applies the final payload change and completes in one turn; its `payloadChangeRequest` is a JSON string because the forced final turn is schema-constrained and an open object decodes as `{}`, and the final permitted turn now forces `complete_task` instead of `'none'` (downgraded to `'none'` for hybrid models). The Loop system prompt's implicit mode no longer tells the model to answer in a JSON envelope, and unreadable JSON text is a Retry rather than a final answer that drops its payload. The Gemini driver records where a thought signature was minted and replays it only there, so a failover between Google AI Studio and Vertex AI no longer fails with a 400 "Corrupted thought signature." A model that rejects a forced tool choice gets `'auto'` instead: Claude Opus 5.5 and Sonnet 5.5 through a new catalog flag, `LLM.SupportsForcedToolChoice: false`, and any Claude request using budget thinking in the Anthropic driver. Envelope and hybrid prompts render byte-identically.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [bea2386]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/ai-gemini@6.2.0-edge.3

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
  - @memberjunction/ai-gemini@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [15a4333]
- Updated dependencies [5da3ad2]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [1d43161]
- Updated dependencies [80905a1]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/ai-gemini@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [575bfae]
- Updated dependencies [e962151]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/ai-gemini@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

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
- Updated dependencies [102a692]
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
  - @memberjunction/ai-gemini@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [61b5612]
- Updated dependencies [076fa5d]
- Updated dependencies [7fcdc2d]
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/ai-gemini@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [197fdf8]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/ai-gemini@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [ada8784]
- Updated dependencies [23c2521]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-gemini@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/ai-gemini@6.1.0-edge.4

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
  - @memberjunction/ai-gemini@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [5ecfdb4]
- Updated dependencies [102a692]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [de343b5]
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-gemini@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/ai@6.1.0-edge.1
- @memberjunction/ai-gemini@6.1.0-edge.1
- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/ai@6.1.0-edge.0
- @memberjunction/ai-gemini@6.1.0-edge.0
- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ai@6.0.0
- @memberjunction/ai-gemini@6.0.0
- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ai@5.51.0
- @memberjunction/ai-gemini@5.51.0
- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [c221553]
- Updated dependencies [0ba33b3]
  - @memberjunction/ai@5.50.0
  - @memberjunction/ai-gemini@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [ea945da]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [b52ffa8]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [15e3017]
  - @memberjunction/global@5.49.0
  - @memberjunction/ai-gemini@5.49.0
  - @memberjunction/ai@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [c20723a]
  - @memberjunction/ai@5.48.0
  - @memberjunction/ai-gemini@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ai@5.47.0
- @memberjunction/ai-gemini@5.47.0
- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ai@5.46.0
- @memberjunction/ai-gemini@5.46.0
- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/ai-gemini@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/ai-gemini@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [a7c1f2f]
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-gemini@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/ai-gemini@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0
  - @memberjunction/ai-gemini@5.42.0

## 5.41.0

### Minor Changes

- 84089ae: Add multimodal embeddings: new EmbedContent method + GetFileCapabilities on BaseEmbeddings, GeminiEmbedding2 and CohereEmbedding providers, AIEngine.EmbedContent, and the @google/genai 2.x bump (Gemini + Vertex).

### Patch Changes

- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [15b743b]
- Updated dependencies [1568bae]
  - @memberjunction/ai@5.41.0
  - @memberjunction/ai-gemini@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/ai-gemini@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/ai@5.40.1
- @memberjunction/ai-gemini@5.40.1
- @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/ai@5.40.0
- @memberjunction/ai-gemini@5.40.0
- @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [8c39dd9]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
  - @memberjunction/ai-gemini@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [30f598d]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0
  - @memberjunction/ai@5.38.0
  - @memberjunction/ai-gemini@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/ai@5.37.0
- @memberjunction/ai-gemini@5.37.0
- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/ai@5.36.0
- @memberjunction/ai-gemini@5.36.0
- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [c3f4154]
- Updated dependencies [ac4b9a5]
  - @memberjunction/ai-gemini@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ai@5.34.1
- @memberjunction/ai-gemini@5.34.1
- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0
  - @memberjunction/ai-gemini@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ai-gemini@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ai@5.32.0
- @memberjunction/ai-gemini@5.32.0
- @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-gemini@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/ai-gemini@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/ai@5.30.0
- @memberjunction/ai-gemini@5.30.0
- @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ai@5.29.0
- @memberjunction/ai-gemini@5.29.0
- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ai@5.28.0
- @memberjunction/ai-gemini@5.28.0
- @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-gemini@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/ai-gemini@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/ai@5.26.0
- @memberjunction/ai-gemini@5.26.0
- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ai@5.25.0
- @memberjunction/ai-gemini@5.25.0
- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/ai@5.24.0
- @memberjunction/ai-gemini@5.24.0
- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0
  - @memberjunction/ai@5.23.0
  - @memberjunction/ai-gemini@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0
  - @memberjunction/ai@5.22.0
  - @memberjunction/ai-gemini@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/ai@5.21.0
- @memberjunction/ai-gemini@5.21.0
- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/ai@5.20.0
- @memberjunction/ai-gemini@5.20.0
- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/ai-gemini@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ai@5.18.0
- @memberjunction/ai-gemini@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/ai@5.17.0
- @memberjunction/ai-gemini@5.17.0
- @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/ai@5.16.0
- @memberjunction/ai-gemini@5.16.0
- @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- c3e8b94: metadata updates and migration

### Patch Changes

- Updated dependencies [c3e8b94]
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-gemini@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/ai@5.14.0
- @memberjunction/ai-gemini@5.14.0
- @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0
  - @memberjunction/ai@5.13.0
  - @memberjunction/ai-gemini@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/ai@5.12.0
- @memberjunction/ai-gemini@5.12.0
- @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/ai@5.11.0
- @memberjunction/ai-gemini@5.11.0
- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/ai-gemini@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/ai@5.10.0
- @memberjunction/ai-gemini@5.10.0
- @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/ai-gemini@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/ai@5.8.0
- @memberjunction/ai-gemini@5.8.0
- @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ai-gemini@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/ai@5.6.0
- @memberjunction/ai-gemini@5.6.0
- @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-gemini@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/ai-gemini@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/ai@5.4.0
- @memberjunction/ai-gemini@5.4.0
- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/ai-gemini@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/ai@5.3.0
- @memberjunction/ai-gemini@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/ai@5.2.0
- @memberjunction/ai-gemini@5.2.0
- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-gemini@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-gemini@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/ai@4.4.0
- @memberjunction/ai-gemini@4.4.0
- @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/ai-gemini@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/ai@4.3.0
- @memberjunction/ai-gemini@4.3.0
- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/ai-gemini@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- @memberjunction/ai@4.1.0
- @memberjunction/ai-gemini@4.1.0
- @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-gemini@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- @memberjunction/ai@3.4.0
- @memberjunction/ai-gemini@3.4.0
- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ai@3.3.0
- @memberjunction/ai-gemini@3.3.0
- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [cbd2714]
  - @memberjunction/ai-gemini@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/ai-gemini@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/ai-gemini@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/ai@2.133.0
- @memberjunction/ai-gemini@2.133.0
- @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- @memberjunction/ai@2.132.0
- @memberjunction/ai-gemini@2.132.0
- @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- @memberjunction/ai@2.131.0
- @memberjunction/ai-gemini@2.131.0
- @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/ai-gemini@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-gemini@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c7e38aa: migration

### Patch Changes

- 7a39231: Add Vertex AI provider with Google GenAI SDK integration, resolve database connection timeout, and improve conversation UI
- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0
  - @memberjunction/ai@2.129.0
  - @memberjunction/ai-gemini@2.129.0

## 2.128.0

### Patch Changes

- @memberjunction/ai@2.128.0
- @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- @memberjunction/ai@2.126.0
- @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- @memberjunction/ai@2.125.0
- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- @memberjunction/ai@2.124.0
- @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/ai@2.122.2
- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- @memberjunction/ai@2.122.0
- @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
  - @memberjunction/ai@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/ai@2.120.0
- @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- @memberjunction/ai@2.119.0
- @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- @memberjunction/ai@2.118.0
- @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- @memberjunction/ai@2.117.0
- @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ai@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/ai@2.113.2
- @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/ai@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/ai@2.110.0
- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/ai@2.109.0
- @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/ai@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [9b67e0c]
  - @memberjunction/ai@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0
  - @memberjunction/ai@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/ai@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/ai@2.100.0
- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/ai@2.99.0
- @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/ai@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- @memberjunction/ai@2.96.0
- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/ai@2.95.0
- @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/ai@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- @memberjunction/ai@2.93.0
- @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- @memberjunction/ai@2.92.0
- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- @memberjunction/ai@2.91.0
- @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/ai@2.90.0
- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/ai@2.89.0
- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/ai@2.88.0
- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/ai@2.87.0
- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/ai@2.86.0
- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
  - @memberjunction/ai@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- @memberjunction/ai@2.84.0
- @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/ai@2.83.0
- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/ai@2.82.0
- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- @memberjunction/ai@2.81.0
- @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- @memberjunction/ai@2.80.0
- @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- bad1a60: migration

### Patch Changes

- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
  - @memberjunction/ai@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- @memberjunction/ai@2.77.0
- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- @memberjunction/ai@2.76.0
- @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- @memberjunction/ai@2.74.0
- @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [eebfb9a]
  - @memberjunction/ai@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/ai@2.72.0
- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/ai@2.69.1
- @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Patch Changes

- @memberjunction/ai@2.68.0
- @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ai@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/ai@2.64.0
- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/ai@2.63.0
- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/ai@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- @memberjunction/ai@2.60.0
- @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [db88416]
  - @memberjunction/ai@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/global@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/ai@2.56.0
- @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/ai@2.54.0
- @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/ai@2.53.0
- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
  - @memberjunction/ai@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0
  - @memberjunction/ai@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/ai@2.48.0
- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/ai@2.47.0
- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [fbc30dc]
  - @memberjunction/ai@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- @memberjunction/ai@2.43.0
- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 276371d: Added Google Vertex and Amazon Bedrock AI providers!
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
  - @memberjunction/ai@2.41.0
  - @memberjunction/global@2.41.0
