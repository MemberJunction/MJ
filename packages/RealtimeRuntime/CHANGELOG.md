# @memberjunction/realtime-runtime

## 6.2.0-edge.6

### Minor Changes

- b5c11d3: Adds ElevenLabs' **Eleven Realtime** speech-to-speech models, `eleven_realtime_v1_mini` and `eleven_realtime_v1_max`, as realtime models for voice co-agents, on both the server-bridged and the browser-direct topology.
  - **Server driver `ElevenRealtime`** (`@memberjunction/ai-elevenlabs`). Eleven Realtime follows the OpenAI Realtime spec over a WebSocket, so the driver subclasses the shared `OpenAIRealtime` implementation the way the Grok Voice driver does, with its own provider profile. It differs from OpenAI in two places. ElevenLabs takes its API key as `xi-api-key`, not as a bearer token, so client secrets are minted from `/v1/convai/realtime/client_secrets` with that header, and the server-bridged session mints a secret before opening its socket instead of sending the API key on it. And ElevenLabs' turn eagerness is `low` / `medium` / `high`, so MJ's `auto` is sent as `medium`.
  - **What the profile turns on**, read from the session ElevenLabs echoes back: MCP tools and an output voice (ElevenLabs voice ids) are on. Reasoning effort and parallel tool calls are off: ElevenLabs accepts both fields but does not keep them, and Max's reasoning is not a session setting. No input-transcription model is sent, because the cascade transcribes the user itself.
  - **Browser client `ElevenRealtimeClient`** (`@memberjunction/ai-realtime-client`, provider key `eleven-realtime`): a WebSocket client that authenticates with the minted secret in the `openai-insecure-api-key.` subprotocol, as the `openai` SDK does. It is loaded wherever the other realtime clients are.
  - **Catalog** (metadata): **Eleven Realtime v1 Max** and **Eleven Realtime v1 Mini**, each with Eleven Labs as model developer and as inference provider through `ElevenRealtime`. No cost rows: ElevenLabs published no API pricing at launch.
  - This is a separate product from the ElevenLabs Agents Platform model (`ElevenLabsRealtime`), which is unchanged; its premade voice list now comes from a shared `ElevenLabsPremadeVoices()`.

### Patch Changes

- c4645bc: A realtime session whose start fails after the mint is now closed on the server at once, as `CloseReason = Error`, instead of staying `Active` until the janitor's 15-minute staleness sweep (MJ#6013). The runtime's teardown used to take one boolean that meant both "the user ended it" and "close the server row", so a start that failed (a provider refusing the websocket, for example) reported an error to the host and left its row open. Teardown now takes the end reason and always closes a minted session, stamping `Explicit` when the host or user ended the call and `Error` when the runtime ended it over a failure; `SessionEnded$` carries the same reason. The `CloseAgentSession` mutation gains an optional `closeReason` argument (`Explicit` or `Error`; the server's own `Janitor` and `Shutdown` are refused from a client), defaulting to `Explicit` for clients that do not send it. The runtime now sends that argument, so it needs a server from this release or later.
- a610c6e: Pair user speech onset (`input_audio_buffer.speech_started`) with the completed user transcript (`conversation.item.input_audio_transcription.completed`) by the OpenAI-protocol `item_id` so late user transcripts keep their own utterance start offset in recorded calls. The xAI client also stops flagging the next item's first user transcript as `ReplacesPrevious` when an earlier item's transcript arrived late, so it no longer overwrites the earlier turn.
- cb1e602: Follow-ups to the realtime runtime's new failure teardown. A call that ends over a failure now keeps its end reason when the host reacts to it: the runtime claims its `Error` teardown before it reports the `'error'` state, so a host that ends the call the moment it sees that state (MobileApp's voice screen does) joins that teardown instead of closing the row as `Explicit`. Explorer's chat area now tells the user when a voice call ends over a failure — a dropped connection, a start that failed, or a call that reached its time limit — where the call surface used to vanish without a word. On Gemini Live Extended Thinking, a reply requested as narration stays narration when the server ends the turn and the interaction in one frame (it used to be captioned and saved as a normal turn), and a context note the finished turn already consumed is no longer committed at the end of the interaction, which made the model speak a second, unprompted time; the commit is kept for the non-blocking tool response it exists for.
- c4645bc: The realtime runtime's one driver slot can no longer be raced or orphaned (MJ#4629). A start issued while the previous call's teardown is still running now waits for that teardown and then goes live, instead of being dropped with a bare `undefined` that hosts had to guess at; a start issued while a call is genuinely live throws `RealtimeSessionAlreadyActiveError` (exported) rather than returning silently, and never replaces the live driver. A fatal error from the current client (the provider's socket dying mid-call) now ends the call the way a failed start does: the connection state goes to `error`, the microphone is released, the server row is closed as `Error`, and `SessionEnded$` reports `error`; a host's own End afterwards is a no-op. Teardown's work runs under a try/finally, so the slot is released even if a step throws, where before `IsActive` could stay set for good and refuse every later start.
- c159f99: The recording shard queue is now told why an upload failed, not only that it did. Before, every failed shard upload was logged as `server refused the shard`, including a dropped network where the request never reached the server, so support chasing lost audio looked for a server rejection that never happened. The queue's upload now resolves the transport's `Acked`/`Refused`/`Retry` outcome: a network failure, 5xx or expired token is retried up to the attempts cap with a reason that does not read as a refusal, and a `Refused` shard (400, 403, 409, 410 or 413) is given up on after one attempt instead of three, since the transport documents a re-send as pointless. A refused shard still leaves the local store through the during-call store drain, which already deletes refused shards.
- c4645bc: A host's spoken opening is now part of the conversation record (MJ#4591). `RequestSpokenOpening` used to ride the delegation-narration channel (`RequestSpokenUpdate`), whose replies are disposable by contract: never captioned, never relayed, never saved, so the greeting a participant heard was missing from the transcript. The realtime contract gains an optional `RequestSpokenTurn(instructions)` beside `RequestSpokenUpdate`: the same wire mechanics and collision rule in each driver, with the reply tagged `normal`. The Gemini (and Gemini Enterprise), ElevenLabs, AssemblyAI, OpenAI Live and OpenAI Realtime protocol drivers (`OpenAIRealtimeClient` and its WebSocket variant) implement it through the one send helper their spoken update already uses, so the two cannot drift; the runtime's `RequestSpokenOpening` prefers it and falls back to the spoken update on a driver that has not implemented it. Separately, the ElevenLabs driver now resets its response kind when a user turn arrives (MJ#6025): the platform does not always send `agent_response_complete` after a narration response, and without the reset every later agent turn in the call was tagged narration and dropped from the transcript.
- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [b5c11d3]
- Updated dependencies [c4645bc]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [a610c6e]
- Updated dependencies [4c97994]
- Updated dependencies [cb1e602]
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
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/ai-realtime-client@6.2.0-edge.6

## 6.2.0-edge.5

### Minor Changes

- 8420f36: Client-direct realtime recordings no longer depend on the browser surviving the end of the call (#5294).
  - **Opus shards during the call.** The browser captures at 48 kHz into one continuous Opus encoder (WebCodecs, or libopus WebAssembly in a Worker where WebCodecs cannot encode Opus) and uploads a 5 s `MJOPUS1` shard as raw bytes to `POST /realtime/recording/:agentSessionId/shard/:index`. Each shard is kept in IndexedDB until the server acknowledges it, so shards survive network drops and reloads and are uploaded on the next page load.
  - **Keepalive terminal.** End, `pagehide` and `visibilitychange`→hidden send `POST /realtime/recording/:agentSessionId/end` with the last partial window as a `keepalive` request, then re-send every unacknowledged shard with `keepalive`. A hidden tab's terminal carries `final=false`: the server stamps the counts but assembles only after the grace period, so switching tabs does not rewrite the recording. `EndRealtimeSession()` waits for the terminal's acknowledgement for at most 3 s. The whole-call `UploadRealtimeRecording` upload and the `beforeunload` prompt are gone from new clients. The mutations remain for older clients.
  - **Server ledger and assembly.** Migration `V202610151535` adds `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps` and `RecordingAssemblyVersion` to `AIAgentSession`, and the new `MJ: AI Agent Session Recording Shards` entity, written through guarded stored procedures. MJAPI assembles `recording.wav` and `peaks.json` within seconds of the terminal. A recording with missing shards is assembled as `Partial` after `realtime.recordingAssemblyGraceSeconds` (default 90): each gap is silence and is listed in `RecordingGaps`. The session janitor assembles sessions that never sent a terminal. Recovery of legacy `seg-*.pcm` storage shards is unchanged.
  - **Breaking for custom hosts:** `IRealtimeSessionRecorder` now returns Opus packets (`TakeEncodedPackets()`, `Stop(): Promise<number>`) instead of base64 audio. `BrowserRecordingUnloadGuard` is removed. A host that wires its own page-lifecycle events calls `SendRecordingTerminal({ Final: false })` when the page is hidden and `SendRecordingTerminal()` on `pagehide`.

### Patch Changes

- 7fb8598: Recorded realtime sessions on drivers that send the user's speech only as one final transcript (OpenAI Realtime, HuggingFace, xAI, ElevenLabs) no longer store `UtteranceStartMs = 0` as a placeholder. `BaseRealtimeClient` gains `OnUserSpeechStart`, raised on every OpenAI-protocol `input_audio_buffer.speech_started` frame, and the realtime runtime relays that onset as the user turn's start. A turn whose start was not measured (for example every ElevenLabs turn after the first) is now stored as NULL instead of 0, and readers fall back to the turn's creation time.
- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [35ed364]
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
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [7fb8598]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [e1f2583]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/graphql-dataprovider@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-realtime-client@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 7384dd6: Conversation forks: a conversation is Main (the messages with no branch) plus forks (`MJ: Conversation Branches`). A fork starts at a message and shows as a chip under it (kind icon, up to three avatars, message count, name, last activity); it opens as a full view where the inherited history sits faded behind a dashed rail, up to a fork marker, and the fork's own messages behind a solid rail. "Fork from here" on one of your own messages opens a new fork that replaces that message at once (it starts from the message before it, the composer starts with the message's text, the fork is created on the first send and named from that message, and leaving without sending creates nothing), Edit ("Save as fork"; the original message stays) and Regenerate (the first answer stays) each start a fork. A Forks button lists every fork, nested under its parent, with All and Mine filters. Everyone who can see a conversation sees its forks and who started each one. What a person is looking at is per person and in memory; nothing about the view is stored on the conversation, and changing the view ends an active voice session.
  - New entity `MJ: Conversation Branches` with `Kind` (Fork, Edit, Regenerate; default Fork), `SourceDetailID` and `UserID`; new columns `ConversationDetail.BranchID` and `ConversationDetail.ReplacedAt` (migration, so `minor`).
  - New authorization `Conversations: Fork`, granted to the UI role. The server refuses to create a fork for a person without it; deny it to a role to turn forking off for that role's members. Each person can also switch forking off in My Profile ("Fork when I edit or regenerate"; user setting `mj.conversations.forking.v1`).
  - When forking is off for a person, Edit and Regenerate change the latest turn in place: Regenerate (latest answer) and "Save and resend" (latest user message) hide the current answer and run the agent again; earlier user messages can still be edited ("Save", shown as edited). A replaced answer keeps its row (`ReplacedAt` and `HiddenToUser` set) and is left out of the chat, export, pins, the mobile transcript, rubric subjects, the returning-visitor recap and every agent context read (`ConversationEngine.LiveRowsFilter` and `IsReplacedRow`). A turn a fork depends on is not changed in place.
  - Every writer sets `BranchID` itself (null is Main): the composer and its agent turns, `AgentRunner`, the task-graph deliverer, an agent request resumed from the Agent Requests dashboard or API (the fork of the message that started the run) and realtime transcripts (a voice session's fork is fixed when it starts). The server no longer stamps it and refuses a `BranchID` that names a fork of another conversation.
  - A fork that still has its own messages or child forks cannot be deleted on its own (its messages would move into Main); deleting the conversation deletes its forks and messages.
  - `ConversationEngine` gains `CreateFork`, `ForkPointFrom`, `EditForkPoint`, `RegenerateForkPoint`, `SourceRowsFilter`, `BuildForkSummaries`, `LoadForkSummaries`, `ForkDisplayName`, `LiveRowsFilter` and `IsReplacedRow`.
  - **Removed public Angular API** (the ParentID-based thread panel; a host app that binds any of these must drop the binding): `ConversationChatAreaComponent`'s `ThreadId` input and `ThreadOpened`/`ThreadClosed` outputs; the `ThreadPanelComponent` export; `ConversationWorkspaceComponent`'s `OpenThread`, `CloseThread` and `SelectedThreadId`; `ChatConversationsResource`'s `SelectedThreadId`, `OnThreadOpened` and `OnThreadClosed`; `MessageListComponent`'s `ReplyInThread` and `ViewThread` outputs. Their deprecated camelCase aliases (`threadId`, `threadOpened`, `threadClosed`, `openThread`, `closeThread`, `selectedThreadId`, `onThreadOpened`, `onThreadClosed`, `replyInThread`, `viewThread`) are removed with them.

  Message-anchored scope: every reader of one conversation reads one path through `ConversationScope` (`LoadScope`, `TrunkScope`, `ScopeFilter`, `ScopeSubquery`, `IsInScope`, `FilterToScope`, `ArtifactVersionScopeFilter`): the open view in the chat (window, pins, artifacts, agent polling, export, voice start), and Main for the mobile app, the realtime widget, meeting transcripts, the conversation overview, rubric subjects and the returning-visitor recap. Artifact history is path-aware: the viewer takes a `Scope` input and lists only the versions a message on the path links (any direction) or that no message links, labels a gap as `v4 · from v2`, and falls back to the newest visible version with a notice. Search results carry the fork of each hit; opening one opens that fork, or Main. Skip requests carry `conversationBranchID` from the reply's fork, so Skip Brain keeps one mirror record per path.

- 4889ca0: Two new realtime channels let the agent ask to see the user's camera or screen: **Camera** (`RealtimeCameraChannel`) and **Screen Share** (`RealtimeScreenShareChannel`), with `MJ: AI Agent Channels` rows on the generic `ClientOnlyChannelServer` whose `UIConfig` places their surface in picture-in-picture. Both are opt-in and on demand: the agent opens one with a `reason`, which is the request, and only the user turns the capture on or off. The surface (`mj-realtime-capture-surface`) shows the ask with Turn on camera (or Share your screen) and Not now, then the user's self-view or share preview. The conversations UI brings both channels to its calls (`CONVERSATION_CALL_HOST_CHANNELS`); other hosts get them when their agent or app includes them. A channel's context gains `Captures$`, `StartCapture` and `StopCapture`, so a channel that fronts a capture can follow it and run the user's clicks under the runtime's policy.
- 1ea4085: A realtime channel's surface now shows where its `MJ: AI Agent Channels` row says. The row's `UIConfig` JSON gains `Placement` (`stage`, `pip`, `tab` or `hidden`; the tab when absent) and `AllowedPlacements` (where the user may move it; anywhere when absent), and CodeGen regenerates the typed `UIConfigObject` accessor. The runtime reads each row's placement when it builds the channel (a row whose `UIConfig` is not valid JSON keeps its channel and starts on its tab) and exposes it as `BaseRealtimeChannelClient.SurfacePlacement`. The call overlay starts each surface there, offers only the allowed placements in "Move to…", hides "Bring it here" when the tab is not allowed, and sends a surface leaving the stage to where its channel places it, using the media module's newly exported `PlacementOffStage`. No existing row sets a placement, so every surface still starts on its tab.
- 975948b: Realtime Channels v2, third phase: verb-level exposure policy, an Angular adapter that wraps an existing component as a channel, an opt-in DOM rasterizer, a sample game channel, and the channels guide. Existing channels, tool names and hosts are unchanged.

  `minor` because this branch edits `metadata/` earlier (see the first two phases) and adds two new packages. There is no migration and no new entity column.
  - **Verb results obey exposure** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). A verb whose result carries what the channel holds declares `ReturnsChannelData: 'state' | 'pixels'` on its descriptor entry. When the channel's effective exposure is below that level the dispatcher, and the native-tool route for a channel mounted at start, refuse the whole call with `exposure_restricted` (policy, not redaction: the verb is refused whole and its result is never filtered); the check comes after `InvokableBy` and before parameter validation, so a malformed call cannot probe a withheld verb. The catalog note and the `exposure_changed` note list the verbs that are unavailable and why. New pure helpers `IsVerbWithheld`, `WithheldVerbs` and `DescribeWithheldVerb`; `BuildToolBackedVerbs` accepts a per-verb flag map. Remote Browser flags `GetPageText` and `AchieveGoal` (`'state'`) and `DescribePage` and `LocateElement` (`'pixels'`); the Interactive Component channel flags `GetDataState`, `Validate`, `IsDirty` and custom methods with a non-void return type (merged verb offers are withheld only when every offer is flagged). This replaces the earlier statement that exposure is not a redaction layer over verb results.
  - **`AngularComponentChannel<TComponent>`** (new package `@memberjunction/ng-realtime-channels`). Wraps an existing Angular component as a channel surface without rewriting it: a descriptor plus `ReadSurfaceState`, `ApplySurfaceVerb` and `SurfaceEvents`, and optional `OnSurfaceOpen`, `SurfaceCompletion`, `OnSurfaceBound` and `SurfaceElement`. It owns binding and unbinding, change-driven perception (an event emitted while the agent's verb runs is attributed to the agent), verb resolution, validation and serialization, completion, state of record, and pictures. A verb that arrives before the surface exists waits, bounded (5 s), for the real component and otherwise fails with `surface_unavailable`; it neither runs against a hidden instance nor is acknowledged and applied later.
  - **Opt-in DOM rasterizer** (`@memberjunction/ng-realtime-channels`). `EnableChannelFrameCapture()` registers a bounded `html-to-image` based capturer (3000 nodes, 4 s, one capture at a time, 1024 px longest edge, no web fonts) that fails soft and turns itself off after repeated or unrecoverable failures, logging one reason. Core ships none by default; Explorer opts in (`@memberjunction/ng-explorer-app`), and the Interactive Component channel sources pictures only while the user allows pixels and a video track is up. `InteractiveComponentFrameCapture` is now `ChannelFrameCapture` in the new package, and `html-to-image` moved with it.
  - **Sample channel** (new package `@memberjunction/ng-realtime-channel-examples`). A tic-tac-toe channel built only through the adapter, not a dependency of anything and loaded only when a host imports it, with tests that play whole games (user win, agent win, draw) against the real component with interleaved user clicks and agent verbs, plus collapse and re-expand, resume, exposure and pictures.
  - **Guide.** `guides/REALTIME_CHANNELS_GUIDE.md` (indexed in `guides/README.md`): the contract, writing a channel from scratch, wrapping a component, scoping, opening on demand, visual perception, the Interactive Component channel, publishing from an Open App, and testing.
  - **Per-verb timeout in the adapter** (`@memberjunction/ng-realtime-channels`). `AngularComponentChannel.VerbTimeoutMs` (15 s, overridable) bounds `ApplySurfaceVerb`. On timeout the call fails with `verb_timeout` and a message the agent can act on, the serialized queue is released and the timeout is logged once with the channel and verb. A late result is never delivered, a late failure is logged, and a late success is recorded as a change so the next perception note shows the real state; nothing is rolled back.
  - **Generic `ClientOnlyChannelServer`** (`@memberjunction/ai-agents`, loaded by `@memberjunction/server`). `MJ: AI Agent Channels.ServerPluginClass` is required, so a channel that runs entirely in the browser sets it to `ClientOnlyChannelServer` instead of writing an empty plugin. It takes its channel name from the registry row, contributes no server tools and does not rewrite saves. `InteractiveComponentChannelServer` and `IdentityVerificationChannelServer` are now thin subclasses of it that keep their existing registry keys and behavior.

- 22c9074: Realtime Channels v2, second phase: an Interactive Component channel, several video sources with one arbiter, and exposure policy. Existing channels, tool names and hosts are unchanged.

  `minor` because the branch edits `metadata/` (a new `MJ: AI Agent Channels` row, and `Privacy.ZeroDataRetention` and `RequireZeroDataRetentionFor` in the `IAIConfiguration` / `IAgentSettings` JSON types). There is no migration and no new entity column.
  - **Interactive Component channel** (`@memberjunction/ng-conversations`, `@memberjunction/ai-agents`, `@memberjunction/ng-react`). Shows any component artifact next to the call and lets the agent operate it. Multi-instance, opt-in, on-demand. Its contract is derived from the component's spec: custom methods and the standard methods it supports become verbs with parameter schemas, `getCurrentDataState` becomes the instance's data, spec events become channel events, spec properties become the schema of the opening inputs. Built-ins: `open`, `show_version` (swaps an open instance to another version of its own artifact in place, keeping its id), `close`. Artifacts load through the signed-in user's own access. Delegated component artifacts can open automatically (`channels.config.InteractiveComponent.autoOpenDelegatedComponents`, off by default), and a newer version of an open component replaces it in place. `MJReactComponent` gains a public `Refresh()`. New `InteractiveComponentChannelServer` and a `MJ: AI Agent Channels` row.
  - **Multi-instance and delegated-artifact hooks** (`@memberjunction/realtime-runtime`). `OnOpen` can name the instance it created; `Complete` and `EmitChannelEvent` take an optional instance. A channel can ask to be offered the artifacts of a delegated run (`AcceptsDelegationArtifacts` / `OnDelegationArtifacts`); the runtime mounts it if needed and reveals its tab.
  - **Several video sources** (`@memberjunction/ai`, `@memberjunction/ai-gemini`, `@memberjunction/ai-realtime-client`). Tracks carry a `SourceID` and `Label`; model profiles declare `MaxInboundVideoStreams` (1 for Gemini 3.8 Live and Extended Thinking, 0 without video input) and negotiation caps the streams to it. `SendVideoFrame(data, mime, sourceId?)`. `VideoSourceArbiter` is the single writer of inbound video: it passes every enabled source through on a multi-stream model; on a one-stream model it picks by a policy that is data (user pick, most recent capture, focused surface, newest), tells the model `[The agent is now viewing: <label>]` on every switch, and paces to the negotiated rate. The channel video bridge now registers with the arbiter; its exports are unchanged.
  - **"Agent can see" and exposure policy** (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). The realtime overlay shows which sources the agent can see, with a switch per source, remembered per user per channel. A channel's exposure is the lowest of its own ceiling, the agent's `channels.config.<Key>.maxExposure`, a zero-data-retention requirement and the user's choice; the server decides all but the last and returns it in the session policy. `requireZeroDataRetentionFor: ['state' | 'pixels']` lowers exposure when the session model's configuration does not declare `Privacy.ZeroDataRetention: true`, and the agent is told why. Exposure gates what is volunteered to the model (state notes and frames), and, for a verb that declares `ReturnsChannelData`, what the agent may ask for (the verb is refused whole below its level; see the third phase).
  - **Session tuning.** `realtime.session.unverifiedMaxSeconds` and `verifiedMaxSeconds` (positive integers) pass through the configuration cascade; `channels.config.<Key>` reaches a channel intact.

- 88b85fc: Realtime Channels v2, first phase: a self-describing channel contract, per-agent/app/host channel scoping, a validated `ContextTool` proxy, and a lifted visual-perception pump. Existing channels, tool names and hosts are unchanged.

  `minor` because the branch edits `metadata/entities/JSONType-interfaces/IAgentSettings.ts` (the new `Realtime.Channels` block); there is no migration, and no new entity column.
  - **Channel descriptors** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`). `RealtimeChannelDescriptor` (nouns, verbs with parameter schemas and `InvokableBy`, events, inputs/output, display policy, default availability, exposure ceiling) and the new `BaseRealtimeChannelClient` members `GetDescriptor`, `GetState`, `ApplyVerb`, `Events$`, `Output$`, `Open`, `Complete`, `InstanceId`. A channel that implements only the original members is synthesized a descriptor, so nothing changes for it. The Whiteboard, Remote Browser, Media and Client Context channels ship authored descriptors; their native tool names are unchanged. Perception notes are structured and debounced (`[channel:<Key>#<instance>] state_changed {…}`, a snapshot first and then deltas).
  - **Channel scoping.** Code default, then agent (`realtime.channels` in the configuration cascade), then app (`Application.AgentSettings.Realtime.Channels`), then host-declared channels (`StartRealtimeSession(…, { HostChannels })`, which work on connect-only providers with no registry rows). `IsActive = false` on a registry row remains a master kill switch. At mint the browser reports its candidates (`channelCandidatesJson`) and the server returns the resolved policy (`ClientPolicyJson`), narrows the declared tools to match, persists the in-scope channel keys on the session, and drops the excluded channels' server plugins. A client with no server policy resolves the same scope locally, and a client against an older server falls back to the original mint mutation.
  - **`ContextTool` proxy.** Accepts `target: { channel, instance? }`; a targeted call is validated against the addressed verb's parameter schema and returns a structured, model-recoverable error on failure. `on-demand` channels are opened mid-session with `action: "open"`. A catalog note rendered from the descriptors tells the model which channels exist.
  - **App client tools.** `Application.AgentSettings.ClientTools` is now read by the realtime path and resolved through `ResolveClientTools`. `RegisterAppClientTools(tools, owner?)` is owner-keyed (new `UnregisterAppClientTools` / `ClearAppClientTools`); Explorer registers its globals and the active surface under separate owners and clears the previous app's surface tools on an app switch (previously they lingered). `FormatClientToolsForPrompt` is removed: it never had a caller.
  - **Visual perception.** The Whiteboard's change-driven frame pump now lives in the base channel (`EnableVisualPerception`); frames are tagged with the change id of the state they describe. The Whiteboard's behavior is unchanged.
  - **Session config rewrites no longer drop fields.** `RealtimeClientSessionResolver` rebuilt the persisted session config field by field on the run-id and pending-feedback rewrites, dropping `mediaCollectionID` and `directActions`; it now carries the existing config forward.

- 02bb563: `<mj-realtime-widget>`, the `IdentityVerification` channel, session events in the runtime, and a session-launcher seam.
  - **Session launcher** (`@memberjunction/realtime-runtime`). `IRealtimeSessionLauncher` is the one place a session is minted. `DefaultRealtimeSessionLauncher` is the stock `StartRealtimeClientSession` mutation with the channel candidates and client policy, unchanged, including the fallback for servers that predate channel scoping. Set `RealtimeSessionRuntime.Launcher` to mint through your own endpoint without wrapping the provider in a Proxy; set it to `null` to restore the default.
  - **Session events in the runtime** (`@memberjunction/realtime-runtime`). The runtime subscribes for the life of the session (tolerating a provider with no subscriptions), exposes `SessionEvents$`, and routes events to per-type handlers. `identity.verified` sends the agent a context note (JSON-framed so user-entered text cannot break out), optionally asks it to speak (`IdentityVerifiedSpokenResponse`), and moves the client deadline from the payload; the server stays authoritative and the deadline only ever moves later. On a reconnect it re-subscribes and reads `GetVerificationStatus` once, so a verification that completed while offline is still announced, flagged `Recovered`. Channels receive `SessionEvents$` on their context. Also adds `OpenChannel(key, inputs)`.
  - **`IdentityVerification` channel** (`@memberjunction/ng-conversations`, `@memberjunction/ai-agents`, `@memberjunction/server`). An opt-in v2 channel with nouns name, email and status and verbs `fill` (agent or user), `confirm` (**the user only**, refused for the agent in the channel itself, not just the surface), `submit`, `resend` and `enter_code`. A value the agent fills is marked as a suggestion until the user confirms it. The code is never stored and never reaches the agent. The surface is a small accessible Angular component using only design tokens and `mjButton`. A thin server plugin keeps no PII on the channel row. Ships with its `metadata/ai-agent-channels` row.
  - **`@memberjunction/ng-realtime-widget`** (new package). `<mj-realtime-widget>` as an Angular component and as a one-script custom element (`dist/element/mj-realtime-widget.js`: Angular linker, no `unsafe-eval`, CSP nonce, guarded define). Auth modes `widget-key`, `invite-token`, `token` and a JS-only `launcher`; a consent gate before the microphone; resume and tab-close cleanup; `--mj-*` theming; attributes, properties, methods (`start`, `end`, `openChannel`, `sendContextNote`, `requestSpokenResponse`, `registerChannel`) and bubbling, composed DOM events (`mj-ready`, `mj-session-started`, `mj-session-ended`, `mj-phase-changed`, `mj-verified`, `mj-session-event`, `mj-channel-opened`, `mj-channel-event`, `mj-channel-output`, `mj-error`). It hosts the existing realtime overlay by deep import, so the heavy `ConversationsModule` barrel stays out of the bundle. A static sample page and an embed guide ship in the package.
  - **A small shell and a lazily loaded call** (`@memberjunction/ng-realtime-widget`). The one-script embed is now a classic-script **shell** (about 8 KB gzipped, no Angular) that defines the element, exposes the whole contract and draws the start button, the consent notice and the status screens, plus the **call** (Angular, the realtime overlay, runtime, drivers, built-in channels) as split ES modules fetched relative to the shell's own URL on `start()`, `auto-start`, or a `preload` hint (`none|hover|idle|eager`, default `hover`, a `modulepreload` link that downloads without running). Declining consent downloads nothing. Calls made before the call code loads are specified and tested: `openChannel` and `sendContextNote` queue (notes are capped and never replayed into the next call), `requestSpokenResponse` is never queued, `end()` abandons a pending start. The Interactive Component channel is its own lazily loaded chunk, loaded only when it could be in the session. New attributes: `perception` (`on|off|ask`, default `ask`; pre-sets the person's exposure choice and is reported by a new `mj-perception-changed` event), `frame-capture` (a marked hook for Phase 2's rasterizer), `preload`, `session-url`. The build fails if the shell exceeds its size budget or a heavy dependency leaks into it. The bundle test boots the shell under a no-eval window, calls `start()`, and proves the call chunk loads.
  - **`frame-capture` loads the DOM rasterizer lazily** (`@memberjunction/ng-realtime-widget`). The attribute calls `EnableChannelFrameCapture()` from `@memberjunction/ng-realtime-channels` (now a dependency), as its own chunk (16 KB raw / 6.6 KB gzipped, `html-to-image` included) loaded before the session is minted, so neither the shell nor a call that does not want frames pays for it. If it cannot be loaded the widget warns once and channels stay state-only; a capturer the page registered itself is respected.
  - **Runtime hooks** (`@memberjunction/realtime-runtime`). `ChannelClassLoader` lets a host load channel code on demand (called with the `ClientPluginClass` keys of every channel about to be resolved; a failure is logged, never fatal), and `ExposurePreferences` exposes the current store so a host can layer over it.
  - **Event payload** (`@memberjunction/ai-core-plus`). `IdentityVerifiedEventPayload` gains an optional `Recovered` flag, validated by `IsIdentityVerifiedEventPayload`.

### Patch Changes

- e4c355e: The agent's video holds its last frame while a call resumes on a new connection, for up to 5 s, instead of giving way to the orb after a second (#5357). On Gemini Enterprise (Vertex AI) new video comes about 3 s after each move (Google's `goAway`, about every 9 minutes, and any dropped socket), so the avatar's tile showed the orb for about 2 s each time, as if the agent had left. `RealtimeSessionRuntime.Resuming$`, also on `RealtimeChannelContext`, is `true` from a `'connecting'` the driver reports while the call is live until the call is live again, fails or ends; a call's first connect is not a resume. `mj-media-tile` takes `HoldLastFrame`, which keeps the frame on show through a stall, and emits `FramesFlowingChange` when the video's frames stop or come back. The Avatar channel's surface holds from a resume's start until new frames come, `AGENT_VIDEO_RESUME_HOLD_MS` (5 s) pass, or the call fails or ends; the orb then shows if the video is still out of frames. A stall outside a resume still shows the orb after about a second.
- 6cd23e1: A call whose agent asked for a live avatar it can't show says so once. Core gains `RealtimeAvatarStatus`, `ClientRealtimeSessionConfig.AvatarStatus`, `BaseRealtimeModel.SupportsAvatarOutput(model)` (default `false`; Gemini answers from its Live profile) and `ParseRealtimeAvatarStatus`, and the browser-side reason `downgraded` becomes `host` and `browser` (the Gemini and Gemini Enterprise browser clients log the new reason). Both Gemini drivers (`GeminiRealtime`, and `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`) return their avatar decision on the mint, through the protected `AvatarStatusFor`; `RealtimeClientSessionService.PrepareClientSession` merges it with the persona resolution (`endpoint` first, then `no-binding` / `unknown-avatar`, else the driver's decision), logs one line, and returns `AvatarStatus`, which MJServer sends as `StartRealtimeClientSessionResult.AvatarStatusJson`. The stock launcher asks for the field and drops it alone against a server that predates it. After the call connects, the runtime publishes `AvatarNotice$` (`host` when the app asked for no agent video, `browser` when the track did not go live, else the status's reason), once per call, and clears it when the call ends. `ng-realtime-media` holds the wording (`AvatarNoticeText`, "Audio only: …", per-reason host overrides) and declares `@memberjunction/ai`; the call overlay shows it as a small info `mj-alert` under the banner in both chromes, with a dismiss button, hiding after 10 s, never in review (`AvatarNoticeLabels` overrides the words). Calls whose agent asked for no avatar look as before. Integration check RD13 also checks that a voiced agent without a face on the session's vendor asks for no avatar and reports `no-binding`.
- de2dc2f: Avatar video in realtime usage and cost. The Gemini browser client counts the seconds of avatar video a model turn generated from the fragments' durations (Core's fragmented MP4 reader gains track timescales and `Fmp4VideoSeconds`), until `generationComplete` (an interrupted turn counts what arrived before `interrupted`), and emits them once, as amounts, in `OutputTokenDetails.VideoSeconds`; it also reads Google's response-side token split, VIDEO included (`RealtimeUsageModalityDetail.VideoTokens`). The runtime relays the full input and output detail blocks, and an update that carries only video seconds; `RelayRealtimeUsage` takes them as an optional `usageDetailsJson` argument, and `AccumulatePromptRunUsage` adds them into the co-agent prompt run's `ModelSpecificResponseDetails.RealtimeUsage` record, with the stored video seconds capped at the run's elapsed time plus 30 seconds. At finalize, a run whose model vendor configuration has `Realtime.Pricing.AvatarVideoOutput` (per minute) is priced at its cost row plus a video line, the video's output tokens leave the cost row's output bucket, and the lines are written under `CostLines`; without that price the run prices as before. The agent-run analytics cost card shows the avatar video on its own line and no longer prices the video's tokens as output. Integration check RD16 stores a minute of avatar usage on a co-agent-shaped prompt run for Gemini 3.8 Live on Vertex AI, finalizes it, and checks its cost lines.
- a4b23b7: A call whose mint gives an avatar reason this version doesn't know, such as a newer server's, now says it is audio only instead of showing no notice. `ParseRealtimeAvatarStatus` keeps such a status without the reason and marks it `ReasonUnknown` (`ParsedRealtimeAvatarStatus`); a reason that isn't text still reads as no status. The runtime's notice then has no `Reason` (`RealtimeAvatarNotice.Reason` is optional), and the call overlay and the mobile voice screen say "Audio only: the avatar can't be shown in this call" (`AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT` in `ng-realtime-media`, with a copy in the mobile app). `AvatarNoticeText` gives a `null` reason that line without `NameAgent` and the meeting's `AVATAR_NOTICE_UNKNOWN_REASON_TEXT` with it, so the meeting room reads as before. A host words it with `unknown` in the call overlay's `AvatarNoticeLabels`, as in the meeting room.
- 961d529: `ClientRealtimeSessionConfig` gains `Transport` (`'direct'` or `'relay'`; absent means direct) and `RelayUrl`, so a minted session says how the browser reaches its provider. The Gemini Enterprise mint returns a relay session: `Transport: 'relay'`, the relay URL as `RelayUrl` (the ticket is in its path) and an empty `EphemeralToken`. MJAPI's `StartRealtimeClientSession` returns both fields; the realtime runtime and the support widget ask for them and hand them to the client driver, and mint without them against a server that predates them. The `'gemini-enterprise'` client connects to `RelayUrl` and refuses a session that is not a relay session. Every other client driver refuses a relay session in `Connect` (`BaseRealtimeClient.AssertTransportSupported`); a driver that can open one opts in through `SupportsRelayTransport`. The relay URL is never logged.
- bb3028a: A Config dashboard's tab has an AI assistant: a resizable side pane that chats, in text or in a Gemini 3.8 Live voice session, with the new **Dashboards Expert** agent, which the Dashboards application pins through its `AgentSettings`.
  - **Client tools.** The tab gives the agent client tools: `GetDashboardState`, `GetDashboardScreenshot` and `SearchSources` read the dashboard and find views, queries, entities and artifacts; `AddPanel`, `RemovePanel`, `MovePanel`, `ResizePanel` and `UpdatePanelSettings` make in-memory edits, one at a time, that put the tab in edit mode and that Cancel discards; and `RequestSaveDashboard` and `RequestPinToHome` ask the user in a confirm dialog, so a save or a Home pin happens only when the user confirms it. The edit and request tools take the `dashboardId` that `GetDashboardState` returns and refuse a call for a dashboard that is no longer open.
  - **`DashboardResource`** (`@memberjunction/ng-explorer-core`, the dashboard tab) adds the AI pane's members: the pane state `ChatOpen`, `CopilotExpanded`, `MainSizePct`, `CopilotSizePct`, `CopilotMinPct`, `CopilotMaxPct` and `ShowCloseChatConfirm`; the chat state `ChatAgentId`, `ChatAgentName`, `ChatAgentError`, `ChatConversation`, `ChatConversationId`, `ChatIsNewConversation`, `ChatPendingMessage`, `ChatPendingAttachments`, `ChatAppContext`, `ChatApplicationId` and `ChatEnvironmentId`; the open save or pin confirm, `AgentConfirm`, with `OnAgentConfirm()`; and the methods `ToggleChat()`, `CloseChat()`, `OnCloseChatConfirmed()`, `OnCloseChatCancelled()`, `ToggleCopilotExpanded()`, `OnCopilotSplitDragEnd()`, `OnChatConversationCreated()`, `OnChatRealtimeConversationReady()`, `OnChatPendingMessageConsumed()`, `OnChatNavigationRequest()` and `OnChatOpenEntityRecord()`.
  - **Layout editor** (`@memberjunction/ng-dashboard-viewer`). The package exports the pure layout editor behind the tab's edit tools (`InsertPanel`, `MovePanel`, `ResizePanel`, `RemovePanelFromLayout`, `SimplifyLayout`, `FindPanelPath`, `DescribePath`, `LayoutEditError`, `PANEL_PLACEMENTS`) and its types `PanelPlacement`, `PanelPosition`, `LayoutPathStep` and `SimplifiedLayoutNode`. `DashboardViewerComponent` adds `ApplyLayout()`, which shows a layout that these functions built, and `GetPanelPath()`, which gives a panel's address in the layout. The viewer's `AddPanel` returns the new panel's ID and honours its position: its optional `location` argument is now a `PanelPosition`, not a `LayoutLocation`, so a caller that passes a `LayoutLocation` must change, and a position that is not valid throws `LayoutEditError`. `UpdatePanelConfig()` now returns a `Promise` that settles when the layout is rebuilt (it rejects when the rebuild fails). A subclass that overrides `AddPanel()` or `addPanel()` must take a `PanelPosition` and return `Promise<string | null>`, and one that overrides `UpdatePanelConfig()` or `updatePanelConfig()` must return `Promise<void>`. Each panel's content element has a `data-panel-id` attribute.
  - **Screenshots** (`@memberjunction/ng-shared`). The package adds `CaptureElementJpeg`, with the types `ElementCaptureOptions` and `ElementCapture`, the defaults `ELEMENT_CAPTURE_DEFAULTS`, and the helpers `ComputePixelRatio()` and `StripDataUrlPrefix()`.
  - **Client tool results.** A client tool result now reaches the model in full: the results of one `ClientTools` step go into one message that expires after 3 turns, and the optional Loop prompt parameter `clientToolResultMaxChars` truncates them with a visible note. In `@memberjunction/ai-agents` it is `LoopAgentTypePromptParams.clientToolResultMaxChars`, and `DEFAULT_LOOP_AGENT_PROMPT_PARAMS` sets it to `-1` (no cap); code that builds its own `Required<LoopAgentTypePromptParams>` must add it.
  - **Images in tool results.** A result can also carry images (`Media`: JPEG, PNG or WebP, at most 4 items of at most 2,000,000 decoded bytes each), which `ParseClientToolMedia` (`@memberjunction/ai-core-plus`) checks in `RespondToClientToolRequest`, a bad item giving a failed tool result; the agent client sends them, and the agent and prompt runner pass them to the model as image blocks that expire after 2 turns, while the step output keeps only their metadata. `@memberjunction/ai-core-plus` adds `ClientToolMediaItem` (`MimeType`, `Base64`, optional `Width` and `Height`), `ClientToolMediaParse` and `CLIENT_TOOL_MEDIA_LIMITS`, and an optional `Media` on `ClientToolResponse` and `ClientToolResultSummary`; `@memberjunction/ai-agent-client` adds an optional `Media` on `ClientToolResult`.
  - **`RespondToClientToolRequest`** (`@memberjunction/server`) takes a new optional GraphQL argument, `media`: a string that holds the images as a JSON array. In TypeScript, `ClientToolRequestResolver.RespondToClientToolRequest()` has the new parameter before the context, so a direct caller that passes the context by position, or a subclass that overrides the method, must change. The agent client's mutation always names the `media` argument, so it needs a server from this release: an older server rejects every client tool response (`Unknown argument "media"`), and each client tool call then fails when it times out. A `result` that is not valid JSON now also gives a failed tool result, so the agent no longer waits for the request to time out.
  - **Media in the agent and prompt runner.** `BaseAgent`'s protected `contentToString()` now turns an image, audio, video or file block into a short stub (for example `[image omitted]`), not its base64 text, and its protected `estimateTokens()` counts each such block as 1,600 tokens. The prompt runner keeps the content blocks that a user message already has when it adds file blocks, and it no longer changes the caller's message objects when it replaces media that the model cannot read.
  - **Voice.** Voice tool results stay text, since the Explorer shell strips `Media` before a realtime session sees them (`WithoutMedia()`, `@memberjunction/ng-explorer-app`). A voice session's delegated run (`invoke-target-agent`) receives the browser session ID and the app context from the session start (`ExecuteRelayedToolInput.BrowserSessionID` and `AppContext`, `@memberjunction/ai-agents`), so the delegated agent can call the page's client tools; a scoped anonymous caller's run, which executes as the system user, gets no app context. The server does not store an app context whose JSON is longer than 256,000 characters, and the delegated runs then get none. A voice session also keeps its direct actions when a delegated run pauses for the user's answer. In `@memberjunction/realtime-runtime`, a surface client tool whose handler returns `Success: false` gives the voice model a failed result, and `RealtimeSessionRuntime.SendVideoFrame` returns whether the frame was sent; a subclass that overrides it must return a `boolean`.
  - **Agent context.** The sub-agent catalog lists only Active relationship targets. The Explorer shell keeps the page's additional context when it rebuilds the app-context snapshot while the page's tab is attached, clears it when the tab is detached, and restores it when the tab is reattached. The client tools a page registered now follow the same rule: only the detach of that page's own tab clears them, so the detach of another tab no longer takes the open dashboard's tools away from the agent. In `@memberjunction/ng-shared`, `AgentContextUpdate` gains `Lifecycle` (`'Detached'` or `'Reattached'`), which `NavigationService.NotifyResourceDetached()` and `NotifyResourceReattached()` set; the detach of another tab now sends an update with only `Caller` and `Lifecycle`, not an empty `AgentClientTools` list.
  - **Chat area** (`@memberjunction/ng-conversations`). The chat area's empty-state composer now receives the host's default agent, application and app context, so a voice call can start before the first message, and the dashboard tab adopts the conversation that call created when it ends.

- 91be34f: Gemini Live on Gemini Enterprise (Vertex AI): a server driver and a browser driver. `GeminiEnterpriseRealtime` (`@memberjunction/ai-vertex`) reads `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` (or a run's key), a JSON string in the shapes `VertexLLM` takes: an inline service account, a key-file path (environment key only), or neither for Application Default Credentials. A client-direct session goes through MJAPI's realtime relay: the mint issues one relay session per call, whose policy writes the Live setup from the connect config and adds a `google-auth-library` bearer token (scope `cloud-platform`) on each upstream open, never at the mint. The browser gets the relay URL, with the ticket in its path, and a pact whose config holds only the response modalities and the avatar's name: no system prompt, no tools, no credential. The upstream is the Vertex AI `v1` Live socket on the location's host (`us` and `eu` on `aiplatform.<location>.rep.googleapis.com`); the mint warns when the location is not `us`, `eu` or `us-central1`. A bridged session uses `@google/genai` in Vertex mode, audio only. The constructor never throws; a key that cannot be read fails the session with a reason that quotes none of it. `GeminiEnterpriseRealtimeClient` (`'gemini-enterprise'`, `@memberjunction/ai-realtime-client`) runs the web SDK in Vertex mode against the relay URL with a placeholder API key that never leaves the page, always states its response modalities (VIDEO while it shows the avatar), and resumes on the same URL. Both Vertex drivers now read their key through shared helpers (`ParseVertexAICredentials`, `VertexKeySourceOf`, `CreateVertexAuthClient`, `VertexGenAIOptions`) and build the `google-auth-library` client themselves instead of passing the deprecated `keyFile` or `credentials` options to `GoogleAuth`: an inline service account becomes a `JWT` client with the `cloud-platform` scope, and a key without credentials still uses Application Default Credentials. **Change to run-key handling in `VertexLLM`: a key may name a key file (`keyFilePath`) only when it is the driver's environment key (`AI_VENDOR_API_KEY__VertexLLM`; `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` for the realtime driver), byte for byte. A run's key (`apiKeys`), an MJ Credential (the Google Cloud Platform credential type's Key File Path) or any other key that names a key file is refused when the client is created, with an error that does not quote the path; use an inline service account (`serviceAccountJson`) or Application Default Credentials instead.** Environment keys behave as before: MJ reads the key file and builds the client for its `type` (service account, authorized user, impersonated service account, external account, GDCH). The file is now read when the client is created rather than at the first request, and its errors no longer quote the path. `GeminiRealtime` gains the protected `SessionPactFor`. The realtime runtime keeps the new client from being tree-shaken, and the server and browser class-registration manifests register the two drivers. Integration checks RD13 (the avatar from the voiced agent's persona, through the session prep) and RD14 (every realtime vendor DriverClass resolves). Nothing selects the Enterprise driver until its vendor row ships.
- 1c9ac95: A call ended while the microphone is still opening now hands the microphone back to the host once the opening returns (#5386). `RealtimeSessionRuntime` calls the host's `ReleaseMicrophone()` once each time it asks for the microphone, after that request returns: at the end of the session, or, when the session ended while the request was pending, from the start's own unwind once it returns. Before, teardown called it while `AcquireMicrophone()` was still pending, before the opening had changed anything, and the unwind never called it, so on iOS the React Native host stayed in the call audio category after the call. A start ended while connecting whose connection then fails now releases once instead of twice, and a session that ends before asking for the microphone no longer calls it, since there is nothing to undo. When a newer session on the same runtime has asked for the microphone by then, the abandoned start leaves the release to that session's end.
- 4fb501e: In a realtime call, the camera's self-view says "Agent can see this" only while the model is being sent the camera's frames (#5373). It used to show whenever the camera was on and the Camera channel allowed pixels. On a model that takes one video stream, a screen share started after the camera is what the model is sent, so the badge stayed on while the "Agent can see" chip said "Agent sees: Shared screen". The badge now also needs the camera's source among the session's video sources to be on and active, which is what the chip reads, and it comes back when the user picks the camera. A channel's context gains `VideoSources$` (the runtime's `VideoSources$`), and `REALTIME_CAPTURE_SOURCE_IDS` names the camera's and the screen share's sources (`capture:camera`, `capture:screen`). A host whose channel context has no `VideoSources$` keeps the previous rule.
- 2de7fe0: The realtime runtime carries the agent's video (an avatar) to the host and to channels. `AgentVideo$` (new) holds the video the driver hands over through `OnRemoteVideo`, a live stream or a player that owns the `<video>` element, until the call ends; a newer one replaces it, and a late frame from an ended call is ignored. Channels get it as `AgentVideo$` on their context. The tracks a channel sinks (`GetSunkTracks`) are now requested when the session connects, next to the tracks it sources, so a driver establishes outbound video when the model sends it (and reports it unsupported when it does not). A channel that sinks outbound video counts as used once the agent's video arrives, so the host shows its surface.
- 0d0ba18: An app that shows no agent video now tells the mint, and the mint asks the model for no avatar. Every browser session counted as one that could show an avatar, so a video-enabled agent's call from the embeddable widget or the mobile app, which have no channel that shows the agent's video, was steered to a model that renders avatars and minted with the avatar asked for; the browser then dropped it at connect (`host`). `StartRealtimeClientSession` takes `showsAgentVideo`: with `false` the session prep (`PrepareClientSessionInput.ShowsAgentVideo`) asks the driver for no avatar, keeps the avatar persona's voice, prefers no avatar model in the default model walk, and returns `AvatarStatusJson` with the existing reason `host` ("Audio only: this app can't show the avatar"); absent or `true` behaves as before. The argument only ever turns video off. The realtime runtime works it out from the session's channels before the mint: when no channel that could be in the session shows the agent's video (an Avatar channel switched off in the registry counts as none), the launch request carries `ShowsAgentVideo: false` (`RealtimeSessionLaunchRequest.ShowsAgentVideo`) and the stock launcher sends `showsAgentVideo: false`; a host whose Avatar channel can show it sends nothing new. The embeddable support widget's guest mint always sends it. Against a server that predates the argument, both mint without it, once, and remember (the launcher's fallback pattern). Integration check RD13 also checks that an app without agent video asks for no avatar and keeps the persona's voice.
- ae78a45: The call's orb stands in for the agent's video. The hero's orb becomes a component, `mj-realtime-agent-orb` (the orb, its sound-wave rings, its turn states and its reactions to the overlay's audio meter, sized by `--mj-realtime-orb-size`), and the hero renders it as before. `mj-media-tile` takes content marked `mjMediaTilePlaceholder` in place of the participant's picture or initials. The Avatar channel's surface puts the orb there, so until the agent's video sends its first frame, and after a second without one, the tile shows the orb, sized to the tile and following the agent's turn. A channel's context gains `ConnectionState$` (the call's state), which the Avatar channel passes to its surface.
- b2f8b5b: The agent's video shows in the agent's place in the call rather than in the focus layout. `BaseRealtimeChannelClient.ShowsAgentVideo` (new) says whether a channel shows the agent's video (it sinks outbound video); the runtime uses it to mark that channel as used when the video arrives. `mj-media-stage` gains `StageSlot`: a stage surface covers that element instead of filling the stage, followed as it moves and resizes, and out of sight while it has no size. The call overlay gives the stage that slot while a channel that shows the agent's video holds the stage: in the hero it takes the orb's place, in the console it is a compact tile above the thread, and the surface carries its own "Move to…" menu. Any other surface on the stage is the focus layout as before. The agent's first video gives its channel a tab without opening the panel.
- dcfdda4: A realtime call says when no microphone works, and a pick in the device menu brings the microphone back (#5406). When the microphone in use fails and the fallback to the default fails too, or the last microphone goes away, `Microphone$` now carries a `Failure` (`RealtimeMicrophoneState.Failure`, the controller's reason) until a microphone is on again. `SwitchMicrophone` then opens the picked microphone instead of doing nothing: the runtime follows the controller's current microphone stream, so the driver and the call's recording move to the new stream, which keeps the call's mute and becomes the stream that mute and teardown act on. While the call has no microphone track, `ToggleMute` changes nothing and returns the call's mute instead of `false`. The call overlay shows a warning under the banner while no microphone works (the agent can't hear the user; connect a microphone or choose one from the arrow next to the microphone button, or allow it first when the browser blocked it), and it goes once a microphone is on.
- d714f25: A user can switch microphone and camera during a realtime call (#5371). The runtime gains `SwitchMicrophone(deviceId)` beside `SwitchCamera`, through the host's `LocalMediaController.SwitchDevice`: the new track goes into the same stream with the mute carried over, and the driver and the call's recording move to it. `Microphone$` (`RealtimeMicrophoneState`: the microphone in use and the microphones listed, or `REALTIME_MICROPHONE_NONE`) offers it from the moment the call connects until it ends; a host without a controller gets none. `mj-media-controls` gains an optional device chevron on the microphone (`ShowDeviceMenu`, `Devices`, `SelectedMicrophoneID`, `SelectedCameraID`, `DeviceSelected`) that opens `mj-media-device-menu` above the controls with the microphones and cameras; it lists no speakers, and closes from its close button, the chevron, Escape or a click outside. The call overlay offers it in the composer's strip and lean dock (not the typed-input dock, which also has no Share arrow), listing the call's microphones and, while the camera is open, its cameras; a pick switches through the session and emits `ControlInvoked` with the new `'devices'` id. A narrow lean dock tightens its gaps, and wraps if needed, so the chevron fits.
- a35b50f: A call's first camera start can wait for the user to check the camera. With `RealtimeSessionStartOptions.CameraCheck`, the camera opens for the user only: its state is `starting` with `Checking` set and the stream to preview, and nothing reaches the agent until the host calls `ConfirmCamera()`. `StopCamera()` during the check is the user's "not now". Later starts in the same call skip the check, and the next call checks again. Off by default, so a host that shows no check is unchanged.
- 3e7f8c8: While the user's camera is open (being checked or on), its capture state names the camera in use (`DeviceID`) and lists the cameras the browser offers (`Devices`), following the host's controller as cameras come and go and their names appear. `SwitchCamera(deviceId)` moves the open camera to another device and keeps the same stream, so the preview and the agent's frames carry on; when the new camera cannot open, the camera in use stays.
- ca2791b: A realtime session's camera and screen share now follow the channel that fronts each of them (a channel whose new `CaptureKind` is `camera` or `screen`). `StartCamera` and `StartScreenShare` refuse, with the new `policy` failure and a message for the user, when that channel is not in the call or the server's policy keeps pixels from the agent (the agent's configuration, a zero-data-retention rule); nothing is opened or added first. An on-demand channel is opened when its capture starts, and an open one counts as used, so the host shows its surface. The capture's video source belongs to the channel: the user's "agent can see" choice for it hides the frames from the agent without stopping the capture. `VideoSourceArbiter.RegisterSource` takes `Enabled`, so such a source can register hidden without the model being told about it.
- 891dc77: Realtime drivers can follow a replaced microphone track mid-call. `BaseRealtimeClient` gains the optional `ReplaceMicrophone(micStream)` (driver obligation #10), and every browser driver implements it: the OpenAI WebRTC drivers move their senders with `replaceTrack`, and the PCM-capture drivers (Gemini, ElevenLabs, AssemblyAI, xAI, Hugging Face) rebind the shared capture through the new `IPcmMicCapture.Rebind`. Each rebuilds its input meter on the new track. `IRealtimePeerConnection.addTrack` now returns the sender (`IRealtimeRtpSender`), as the platform API does. `LocalMediaController` keeps a muted microphone muted across a device switch or a lost device. The session recorder gains an optional `ReplaceMicrophone` on `IRealtimeSessionRecorder`, implemented by the browser recorder. The runtime starts calling these when its microphone moves onto the controller.
- 0a952ee: The realtime call overlay's composer shows Camera and Share whenever the call offers them, in all three layouts. A call offers a capture while it is connected, the model takes inbound video (`BaseRealtimeClient.SupportsInboundVideo`, new), the host can open it, and its channel's policy admits it; the runtime publishes this as `CaptureOffers$` (new). The buttons follow `Captures$` and call `StartCamera` / `StopCamera` / `StartScreenShare` (offering the kind of surface picked in the Share menu first) / `StopScreenShare`. The camera is optional in an agent call, so it is neutral while off and filled while on: `mj-media-controls` gains `CameraOptional` for this, and the LiveKit room keeps its red. In the fused dock the Share arrow is left out for room, and on a narrow composer the strip wraps onto a second row and the dock puts its text box on a row of its own (a container query on the composer's width). `RealtimeControlId` gains `camera` and `share`.
- 72827e6: A call ended while it is still connecting no longer reports a failed start when its connection then fails (#5420). Before, `RealtimeSessionRuntime` set `ConnectionState$` to `'error'` and `LastStartError` after the host had ended the call, and ran a second teardown, which ended a newer call if one had started on the same runtime by then. The runtime now checks whether the start was abandoned before it reports a connection failure, as it already did for the microphone, and unwinds that start quietly. An abandoned start also leaves the server session to a teardown that is still running, so the session is closed once and its end is reported on `SessionEnded$`; before, the start could close it a second time and the end went unreported.
- 18c66ce: `RealtimeSessionRuntime.LastStartError` is now cleared when a session starts, as its documentation said (#5431). Nothing cleared it before, so once a start failed, the runtime kept reporting that failure through every later start, including ones that succeeded. A host that reads it when `ConnectionState$` reports `'error'` could then give a later failure an earlier start's cause: the embeddable widget, retried after a blocked microphone, could tell the visitor the microphone was blocked when the new call failed while connecting. Each start now clears it before it reports `'connecting'`.
- 84fc9d4: The realtime overlay's channel surfaces can be moved. "Move to…", beside the active channel tab (and in the call pill while a surface is on the stage), puts a surface on the stage, back on its tab, or out of sight, and "Reset layout" puts every surface back. A surface on the stage is the focus layout: the call column folds away and the pill appears. A channel whose surface is elsewhere says where in its tab, with "Bring it here". Moves are saved per user (`mj.realtime.placement.v1`, through `UserInfoEngine`) and carry over to later sessions.

  `BaseRealtimeChannelClient` gains an optional `OnSurfacePlacementChange(placement)` hook, called right after `BindSurface` with the surface's placement and then on every move. `mj-media-stage` gives each surface's template its `Placement`, and `mj-realtime-channel-pane` passes it on. The whiteboard's header button becomes "Move to stage", or "Back to tab" while the board is on the stage, kept true by the new hook.

- 6328ed3: Realtime call recordings are no longer _silently_ lost when the tab is closed right after End (#5195): the session is left `Closed` and the browser warns before the tab closes. Teardown now closes the session before it uploads the recording, so a tab closed mid-upload leaves the session `Closed` instead of open, and a driver `Disconnect()` that throws no longer skips the close.

  The runtime exposes `SavingRecording$` / `IsSavingRecording`, and `RealtimeSessionService` uses it to show the browser's "Leave site?" prompt while the recording is still uploading (desktop browsers only).

- b3db2aa: The realtime relay caps what it holds while the upstream opens at 8 MiB as well as 512 frames, and closes a tunnel whose upstream stops reading once 16 MiB is queued for it (1013 to the browser, 1001 upstream), as it already did for a browser that falls behind (#5499).

  Withdrawing agent vision (`SetLiveKitAgentVision` with `Allow: false`) no longer goes through room authorization, so a cancelled meeting or a failed lookup cannot keep an agent watching (#5500).

  The mint fallback for a server without the relay fields matches `field "RelayUrl"`, not any message that names RelayUrl.

  The agent-vision button says what the consent covers: in a room with more than one agent, every agent in the room. Its label there reads "Let agents see me" / "Hide from agents" and its name "Let agents in this room see your camera and screen"; with one agent, "Let the agent see me" / "Hide from the agent" and "Let the agent see your camera and screen". A failure says "Couldn't change what the agent sees" with one agent and "Couldn't change what agents see" with several (#5502).

- b6b3990: `RealtimeSessionRuntime` can show the agent the user's camera and a shared screen: `StartCamera(deviceId?)`, `StopCamera()`, `StartScreenShare(options?)` and `StopScreenShare()`, with both reported on `Captures$` (off, starting, on with the stream to show the user, or failed with the reason and a message). A start first makes sure the model takes video, adding the inbound video track only now (`AddTrack`), so a session is not limited or billed for video before anyone shares; then it opens the camera through the host's `ILocalMediaController`, or asks for a screen, window or tab through the host's new optional `IRealtimeMediaHost.RequestDisplayCapture`. The capture becomes a source of the video source arbiter, sampled at the negotiated rate. Stopping undoes it all, and removes the track again when the runtime added it and nothing else is captured; a camera that goes away or a share ended from the browser's bar stops the same way, and the session's end stops both. The browser host implements `RequestDisplayCapture`. No UI uses this yet.
- 20d1f4a: A realtime call keeps going when the microphone changes. `IRealtimeMediaHost` gains an optional `CreateLocalMediaController()`, and the browser host returns a `LocalMediaController`. When a host offers one, the runtime starts the microphone through it instead of `AcquireMicrophone`, moves the driver and the recorder onto the new track when the controller swaps one in (a device switch, or a lost headset replaced by the default), and disposes it at teardown. A failed start keeps the `getUserMedia` error names (`NotAllowedError`, `NotFoundError`, …), so hosts that tell a denied microphone apart work unchanged. A start the host abandoned while the microphone was opening now unwinds without reporting an error. `/media` exports the `ILocalMediaController` interface, which `LocalMediaController` implements, so other hosts and tests can supply their own.
- 6a19f78: A call's Share menu offers "This panel ▸", listing the panels of the page that are on screen: the call's Whiteboard and Explorer's main content ("Main content"). Picking one shares that element alone. A new `[mjSharePanel]="<label>"` directive (with `mjSharePanelIcon`) in `ng-realtime-media` marks a shareable region and registers it with the app's `SharePanelRegistry`, whose `PanelsFor$(host)` lists the panels whose box overlaps the viewport, in page order, leaving out any panel that holds the call itself, and nothing where the browser cannot share a single panel (`Supported`: `getDisplayMedia` plus Element or Region Capture, so Chrome and Edge on the desktop). Registry changes reach its streams in a microtask. A channel opts its call surface in with `BaseRealtimeChannelClient.SurfaceShareable` (default `false`; the Whiteboard channel returns `true`), and the Explorer shell marks `mj-tab-container#mj-main-content`, so `ng-explorer-core` now depends on `ng-realtime-media`. The call overlay passes the list to the composer's Share menus (`RealtimeComposerComponent.SharePanels`), starts `StartScreenShare({ Panel, PanelLabel })` for a pick, and stops the share when the shared panel goes away; a panel only out of sight keeps its share. In `/media`, a panel share now uses Element Capture wherever the browser has it (Chromium 132+), giving the panel `isolation: isolate` inline for the share and its own value back when the share ends, and Region Capture otherwise; `DisplayCaptureOptions.PanelLabel` names the panel and `DisplayCapture.PanelLabel` carries the name. The runtime's share state carries it (`RealtimeCaptureState.PanelLabel`), the agent sees the share as "Whiteboard (shared panel)" in the "Agent can see" chip and its switch note, and `mj-share-preview` reads "Sharing a panel: Whiteboard" (`SharePreviewComponent.PanelLabel`). The Screen Share channel's state still reports `surface: 'tab'`.
- 74d9357: The realtime overlay's channel surfaces (whiteboard, remote browser, media, interactive component) move onto one stage over the call, so they are no longer destroyed and recreated. Focus mode fills the stage with the focused surface: before, it removed the surface panel along with the whiteboard, leaving the call empty. Collapsing or hiding the panel and switching tabs now only hide a surface, so a board keeps its view and a stream keeps playing. A surface is created the first time it is shown and kept until its channel leaves the session; focus also ends when its channel leaves.

  `ng-realtime-media` adds `mj-media-stage` (`MediaStageComponent` with `MediaStageSurfaceDirective`): it shows each surface filling the stage, over a tab slot it follows as the panel resizes or slides, or out of sight, without moving it in the DOM. In `ng-conversations`, a plugin channel's tab pane keeps a slot (`RealtimeSurfaceTabsComponent.ChannelSlotChange`), `RealtimeSurfaceStageModel` decides which surfaces exist and where, and `mj-realtime-channel-pane` follows a new plugin instance by rebinding. The focus pill's exit now restores the panel even for a channel that does not leave focus itself. The channel contract docs in `realtime-runtime` and `ng-realtime-channels` describe the new surface lifecycle.

- a5b4a72: Realtime channels now hear when their surface goes out of sight and comes back, so they can pause work nobody sees. `BaseRealtimeChannelClient.OnSurfaceVisibilityChange(visible)` is a new optional hook (a no-op by default): the host calls it right after `BindSurface` with the surface's current visibility, then on every change. In the realtime overlay a surface is out of sight when the panel is collapsed or hidden, another tab is active, or the call is minimized.

  `mj-media-stage` gives each surface's template whether it is on screen (`Visible` in `MediaStageSurfaceContext`), and counts every surface out of sight while the stage itself has no size. `mj-realtime-channel-pane` takes `Visible` and tells its plugin. The remote browser is the first user: its snapshot poll pauses out of sight and polls again at once when shown, while the pushed screencast and the audio keep running.

- d853bf8: A channel's frames sent through its context's `SendVideoFrame` (`RealtimeChannelContext`, `@memberjunction/realtime-runtime`) now go through the session's `VideoSourceArbiter` as the channel's own source, under the id its frame bridge uses (`<channel key>#<instance>`): they reach the model only while the arbiter picks that source, the model is told when it switches, and nothing is sent while the channel's exposure is below pixels. Before, they went straight to the model. The member is deprecated in favour of `ChannelInboundVideoBridge`; the context's `Client` still writes past the arbiter, as does the runtime's own `SendVideoFrame`, whose TSDoc now says so.

  Deprecated, with nothing reading them: `RealtimeVideoConfig.provider` and `providers` (`@memberjunction/ai-agents`). The model is chosen with `realtime.modelPreference`, or with `realtime.video.enabled` the first model that shows an avatar; an avatar's settings are its persona binding's `VendorSettings.Avatar`. A session whose configuration sets either key logs one line per agent naming them, and `FindDeprecatedRealtimeVideoKeys` reports them as data. The TSDoc of `enabled` and `avatarId` now says what they do: `enabled` asks for an avatar and does not start the camera, and `avatarId` names one of the model's Video persona bindings.

  Also deprecated: `BaseRealtimeModel.SupportsVideo` (`@memberjunction/ai`), which no driver overrides and nothing reads (video is declared by `Capabilities.SupportedInboundTracks` / `SupportedOutboundTracks` and `SupportsAvatarOutput`); `LiveKitAudioMeter` and `LiveKitAudioMeterFrame` (`@memberjunction/livekit-room-core`) in favour of `AudioLevelSmoother`, which gives the same frames with the room's settings (the `AUDIO_METER_*` constants stay); and `CreateCameraCapture` (`@memberjunction/ai-realtime-client`) in favour of `LocalMediaController` and `FrameSampler`.

  Removed, since no release shipped it: `ToScreenShareCaptureOptions` from `@memberjunction/livekit-room-core`.

- 44428b5: Realtime video, where a channel's surface and a camera or screen share take turns on a model's one video stream:
  - **The base channel's visual pump counts only the frames the model gets.** When the video source arbiter refuses a frame (another source has the model's only stream, the channel's source is off, or the frame came too soon), the pump no longer records it as the last picture sent, reports no `frame_pushed` event, and sends no "visual confirmation" note after an agent edit, which used to reach the model without its frame. When the arbiter starts sending the channel again (the camera stopped, the user picked the channel, its source was switched back on), the channel sends its current picture even if it has not changed. `ChannelInboundVideoBridge.OnSourceActivated` tells the bridge's owner when that happens, and `VisualPerceptionPump.Refresh` sends the picture.
  - **A channel opened mid-call keeps its video track.** A channel on the base class's visual perception that the agent opens during a call now adds the inbound video track it sources (`AddTrack`) when the call has none, as it would have been given at connect. And a camera or screen share that added the track removes it, once stopped, only when the arbiter has no other source: a channel that started sending on it while the capture was on used to lose it right after the model was told it could see that channel.
  - **A host can supply the frame sampler.** `IRealtimeMediaHost.CreateFrameSampler` (optional) creates the sampler for each camera or screen share, so a host without a DOM can take frames its own way; a browser host can leave it out and keep the DOM `FrameSampler`. A capture whose sampler cannot start now fails as `unsupported`, with nothing listed and nothing told to the model, where it used to report on and send no frames.

- 1b8791e: The user can pick which video source the agent sees. `RealtimeSessionRuntime.SelectVideoSource(sourceId)` makes a source the user's pick, which beats every other rule of the session's video source arbiter (a camera or screen share the user started, the surface in view); `SelectVideoSource(null)` lets the call decide again. Each source on `VideoSources$` carries `Picked: true` while it is the pick; the arbiter clears the pick when its source is turned off or leaves.
- c26b355: Retry a failed realtime recording shard upload under its own index instead of leaving a permanent gap (#5197). When the call ends, the retry queue is closed: retained shards are released and a flush still running stops sending, and the server refuses a shard for a session that already has its consolidated recording, so a late shard can no longer be left orphaned in storage.
- afe9eb4: A relayed call (Gemini Enterprise) that reaches its 30-minute cap, or its shorter `MaxSessionSeconds`, now ends with its own message instead of a connection error. MJAPI's relay closes the browser leg with `REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE` (4000, "Call time limit reached"; the upstream still gets 1000). `GeminiRealtimeClient` ends the call on that code with a fatal error whose `Code` is `REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE` (`'time-limit'`), without trying to resume. `RealtimeSessionRuntime.LastSessionError` keeps the call's fatal client error until the next start, and `DescribeCallEnd` words a time-limit end (`REALTIME_CALL_TIME_LIMIT_END`): the call bar and the audio hero say "Time limit reached" (`RealtimeAgentBannerComponent.ErrorLabel`), and the widget (`mj-error` code `time-limit`) and the phone's error screen say "This call reached its time limit. Start a new call to keep talking." The avatar tile's state chip still says "Connection error".
- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [c8409ce]
- Updated dependencies [7ada797]
- Updated dependencies [51c469d]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [4412e85]
- Updated dependencies [6dce70c]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [822ed69]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [0dbd455]
- Updated dependencies [dde482c]
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
- Updated dependencies [d86bcbc]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [318084b]
- Updated dependencies [69bf67c]
- Updated dependencies [efe4738]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [dbc3462]
- Updated dependencies [d9da1ad]
- Updated dependencies [c5472d2]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [ca2791b]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [7f243eb]
- Updated dependencies [a3fcce8]
- Updated dependencies [a08ed58]
- Updated dependencies [2bc4677]
- Updated dependencies [42f8016]
- Updated dependencies [6b587b3]
- Updated dependencies [891dc77]
- Updated dependencies [98dbb78]
- Updated dependencies [0a952ee]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [20d1f4a]
- Updated dependencies [f1fb411]
- Updated dependencies [f0c78c3]
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [02bb563]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [c9e1891]
- Updated dependencies [aac148b]
- Updated dependencies [d2cb42e]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [cf50330]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [f00d5fc]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai-engine-base@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/ai-realtime-client@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 50a2cf6: On a connect-only provider (`ConnectGraphQLClient`), the realtime session reads the `MJ: AI Agent Channels` registry over GraphQL instead of starting with no channels, so anonymous embeds keep their channel tools (Whiteboard, Media) at mint.
- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [5acbec6]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [72e082b]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ai-realtime-client@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- 21f9e15: Add `ConnectGraphQLClient` for embeds that need an authenticated client without the full metadata boot (#4887). `SetupGraphQLClient` now rejects when no metadata loaded, carrying the metadata download's failure as the cause (a user with no roles still gets the no-roles screen in Explorer and Bootstrap apps); the metadata refresh-check throttle is armed only by a successful check, and a failed metadata download no longer locks out an immediate retry; a cold boot no longer re-fetches the current user. Switching credentials on the provider (for example an anonymous connection upgraded to a login) rebuilds its GraphQL client so requests carry the new identity.
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [7e57b48]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/ai-realtime-client@6.2.0-edge.2

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
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/ai-realtime-client@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- 7658d68: Mobile app v6: make realtime voice actually resolve on a device, route hosted applications' generic nav items, and scope the new agent-session grants with row-level security.

  **Why `minor`.** The branch adds metadata — two `MJ: Row Level Security Filters` rows and the `UI` role's `MJ: AI Agent Sessions` / `MJ: AI Agent Session Channels` permissions — which becomes a consolidated metadata-sync migration at release.

  **Realtime voice could not have worked on a device.** The React Native WebRTC drivers registered against `OpenAILiveClient` / `OpenAIRealtimeClient`, but `ClassFactory` matches on the registered base class's _name_ and the session runtime resolves against `BaseRealtimeClient` — so the RN drivers were filed in a bucket lookup never reads, the browser driver won, and `new RTCPeerConnection()` threw under Hermes. They now register against `BaseRealtimeClient` under the same provider keys the browser drivers use, `registerGlobals()` from `react-native-webrtc` runs at module load, and a unit test asserts on the resolved _class_ rather than merely that something resolves.

  Two related corrections: the RN drivers now override `createAudioSink()` rather than `attachRemoteAudio()` — the latter is where the base driver installs `pc.ontrack`, so overriding it silently removed the remote stream, its subscribers and the output audio meter — and `'xai'` is no longer advertised as supported. Grok Voice speaks the OpenAI protocol but over a websocket with a client-owned PCM plane, so it would have hit the `AudioContext` crash the provider filter exists to prevent.

  **Session lifecycle.** `RealtimeSessionRuntime` gains three fixes that apply to every host, Explorer included: a start abandoned mid-flight (the user leaves while the mint is in progress) now releases the microphone, the provider connection and the server-side session instead of leaking all three; concurrent teardowns coalesce onto one run instead of racing into two `Disconnect()` calls and two `CloseAgentSession` mutations; and a host that declines the resolved provider now unwinds through the shared teardown, so channel plugins are disposed rather than left published with live tool handlers. `IRealtimeMediaHost` gains an optional `ReleaseMicrophone()` — iOS is put into a record-and-play audio category for a call, and nothing was putting it back. `LastStartError` lets a host tell a denied microphone apart from a provider failure.

  **Agent runs reported failure as success.** `ConversationAgentRunner.processMessage` returns `null` only when no agent resolves; every other failure — a quota rejection, an agent that threw, a transport error — comes back as a well-formed result carrying `success: false`. The mobile send path tested only for `null`, so those turns reported success and left a permanently spinning bubble with no error anywhere in the UI.

  **Attachments were uploaded after the agent had already answered.** Photograph an invoice, ask for the totals, and the agent replied "I don't see an attachment" while the file appeared a second later. `SendMessage` now takes an `onUserMessageSaved` hook that runs in the window between the user's row existing and the run starting.

  **Hosted applications.** Nav items are parsed into a shape derived from the generated `MJApplicationEntity_IDefaultNavItem` rather than a hand-copy, which restores `RecordID` — the field identifying which record a non-`Custom` item opens. Generic resource types now resolve through the same registry as `Custom` ones, keyed by the type name, and this build ships a `Dashboards` surface backed by the same `DashboardView` the Explorer route mounts. Retired applications and deactivated nav items are filtered the way MJ Explorer filters them, and the launcher's ordering now matches `compareUserApplications`.

  **Storage seam corrections.** `MJStorageBlobStore` restores the compensating `DeleteObject` when the `MJ: Files` row fails to save (otherwise a successful upload with a failed row leaves permanently orphaned bytes) and configures `FileStorageEngine` before reading its accounts, so a cold process does not silently fall back to environment-only credentials. `ConversationAttachmentService.DeleteAttachment` now honours the store's return value instead of deleting the row regardless — the anti-orphan guarantee three doc comments promised. The browser store implements `GetDownloadUrl` through `CreateMediaAccessToken`, which is what makes Explorer's new storage-backed attachments readable rather than write-only, and `saveAttachments` accepts the agent whose `InlineStorageThresholdBytes` the decision should honour.

  **Security.** The `UI` role's new read/update permissions on agent sessions and session channels are scoped by two new RLS filters (`UI: Own Agent Sessions`, `UI: Own Agent Session Channels`), matching the pattern the Widget Guest rows already use. Unscoped, any signed-in user could read and modify another user's sessions.

  The sample application no longer sets `DefaultForNewUser` — a worked example should not install itself into every deployment's new users — and its screen now handles transport failures rather than showing "Loading…" forever on a dead network.

### Patch Changes

- 3977917: Extract the realtime co-agent session runtime out of Angular into `@memberjunction/realtime-runtime`, and register the GPT-Live client driver so it survives bundling.

  **Why.** `RealtimeSessionService` was 2,768 lines of client-direct realtime orchestration — mint, driver resolution, transcripts, tool relay, delegation narration, channel lifecycle, usage relay, teardown — living inside `@memberjunction/ng-conversations`. Its own header noted it stays component-free so it "must stay importable in plain-node tests", and the measurement bore that out: its entire Angular surface was `import { Injectable }` plus the decorator, and its entire DOM surface was one `navigator.mediaDevices.getUserMedia` call. But because it shipped in an Angular package, no other host could drive a realtime session without reimplementing it — and a second copy drifts from the first at the next protocol change, which GPT-Live just demonstrated is a frequent event.

  This follows the precedent set by `@memberjunction/conversations-runtime`, whose extraction plan explicitly noted realtime was landing in parallel and would need the same treatment.

  **What moved** into the new pure-TypeScript package: the session runtime (now `RealtimeSessionRuntime`), the channel plugin base class, the delegation-result parser, and the narration template builder.

  **The host seam.** `IRealtimeMediaHost` supplies the two genuinely platform-specific pieces: microphone acquisition (the Real-Time Co-Agents guide already specifies "the host acquires the mic — it owns the permission UX"; that seam simply had never been cut) and optional audio recording. Recording now returns base64 across the seam, so the runtime no longer touches `Blob` or `FileReader` — a browser reaches for `FileReader`, React Native reads a file, a test harness holds bytes in memory, and the orchestration layer should never have been asking.

  **`BaseRealtimeChannelClient`'s only Angular tie** was a type-only `Type<T>` import, used in one method the runtime never calls. It is now an opaque component-class reference that Angular's `Type<T>` satisfies unchanged, with the narrowing done at the single Angular call site that instantiates a component. This is what makes interactive channels authorable from a non-Angular host at all.

  **Bug fixed alongside:** `LoadOpenAILiveClient()` was exported but never called, while every sibling driver's Load function was. Since client drivers resolve dynamically through the ClassFactory, GPT-Live's driver could be tree-shaken out of a production bundle and fail to resolve at runtime while working in dev — the exact failure mode the Load-function convention exists to prevent.

  **No behaviour change for Explorer.** `RealtimeSessionService` keeps its name, injectable token and methods; it is now a thin subclass supplying the browser media host, and Explorer is untouched. `@memberjunction/ng-conversations` does, however, stop _exporting_ the types that moved — `public-api.ts` no longer re-exports `base-realtime-channel-client`, `delegation-result-parser` or `FormatToolName` — so a downstream consumer importing them from there must re-point at `@memberjunction/realtime-runtime`. No in-repo consumer does. The bump stays `patch` because MJ ties changeset level to database impact rather than semver breakage (see `.claude/rules/changesets.md`); the required import change is called out here instead. Verified by the package's existing suites: 108 test files / 1,324 tests green, including all 13 realtime-session suites.

  Types that moved (`RealtimeCaption`, `RealtimeConnectionState`, `RealtimeSessionRunOptions`, `BaseRealtimeChannelClient`, `ParseDelegationResultJson`, …) must now be imported from `@memberjunction/realtime-runtime`, since MJ does not re-export across package boundaries.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [5df9486]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-realtime-client@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
