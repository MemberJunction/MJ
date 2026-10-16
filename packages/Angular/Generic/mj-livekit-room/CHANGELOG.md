# @memberjunction/ng-mj-livekit-room

## 6.2.0-edge.4

### Patch Changes

- 8c157aa: A host can word the avatar notice for a reason this version doesn't know. `AvatarNoticeOverrides` gains an `unknown` key, which `AvatarNoticeText` uses for a `null` reason and for a reason with no line in `AVATAR_NOTICE_TEXT` (such a reason used to throw). Without it, or with a blank one, the line is `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`, worded as before. The key doesn't stand in for a known reason the host leaves out. The meeting room's `AvatarNoticeLabels` takes it, so a reason the room can't name, such as a newer bot's, reads in the host's words.
- 45ba6be: Meet's landing offers a "Preview room" to holders of the `Realtime: Advanced Session Controls` authorization: the meeting room with your camera and microphone and simulated people, and no LiveKit server. `mj-livekit-agent-room` takes `Mode="preview"`: nothing is minted and no agent session starts, the room runs on `LiveKitPreviewRoomController` (on the camera and microphone `LOCAL_MEDIA_CONTROLLER_FACTORY` provides), recording is off, and the preview saves its layout per user under its own keys (`LIVEKIT_PREVIEW_PLACEMENT_PREF_KEY`, `LIVEKIT_PREVIEW_PIP_PREF_KEY`), apart from meetings'. In the other modes the room's controller still comes from `LIVEKIT_ROOM_CONTROLLER_FACTORY` as provided above the binding.
- b09fe34: The meeting room shows an agent's avatar. The room core maps the camera track an agent's bot publishes the avatar on (`REALTIME_AGENT_AVATAR_TRACK_NAME`, `agent-avatar`, now shared by the bot's publisher) to the participant's avatar instead of a camera, so its tile carries the "AI-generated video" label, and reads the bot's `mj.agentAvatar` attribute (`ReadAgentAvatarAttribute`) into `LiveKitParticipantView.AvatarAudioOnly`. `mj-media-tile` now shows an avatar whole, the full portrait with bars, in every tile: meeting tiles, and the call's avatar on the stage and in picture-in-picture. Its new `AvatarVideoFit` (default `'contain'`) lets a host fill the tile with `'cover'` instead; other video still fills its tile. When an agent's bot says audio only, the MJ room shows everyone one info notice per agent per join ("Audio only for Sage: the avatar can't be shown in this meeting"), dismissible and hiding itself after 10 seconds; `AvatarNoticeLabels` lets a host word it. Its words come from `ng-realtime-media`'s `AvatarNoticeText`, which gains an options argument (`{ NameAgent: true }` names the agent on a call's lines, for meetings; calls are unchanged) and takes `null` for a reason it doesn't know, giving the new `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`.
- 33d4f4f: The meeting room says when a share, camera, microphone or the room's sound fails while it is connected. Before, these errors reached only the room's connection overlay, which is hidden while connected, so a share the browser refused looked like a click that did nothing. `<mj-livekit-agent-room>` shows the latest device error as a dismissible error notice in its notice stack, after the notice about what the agent sees, worded as "Couldn't <what the user asked for>: <the reason given>": "Couldn't start sharing: To share only the panel, choose this tab in the browser's picker." for a "This panel" share where the user picked another surface, "Couldn't turn on your camera: Could not start video source" for a camera that won't start. A share picker the user closes is still no error and shows nothing. The notice goes when the user dismisses it, asks for another change to their devices (the room's `BeforeMediaToggle` or `BeforeDeviceSwitch`), leaves, or joins again; device errors before the room connects are left to its connection overlay, and every error is still re-emitted on `ErrorOccurred`. In `livekit-room-core`, a `device` error says which device it is about and what the user asked of it: `LiveKitRoomError.Device`, a new `LiveKitErrorDevice` with `Media` (`'microphone' | 'camera' | 'screen' | 'speaker'`) and `Change` (`'on' | 'off' | 'switch'`, absent when the room can't tell). `LiveKitRoomController` sets it when turning the microphone, camera or share on or off, switching a device, or starting the room's sound fails, and on LiveKit's `MediaDevicesError` (the device kind only); the preview room sets it for a share or a camera or microphone that fails to start. A device error about no one device (listing the devices) has none. Error messages are unchanged.
- 318084b: The meeting room's self-view Hide is saved per user. In `<mj-livekit-agent-room>`, a user who hides their own tile finds it still hidden in their next meeting, on any device, until they click Show on the "Self-view hidden" chip or reset the layout. It is saved in `MJ: User Settings` under `mj.livekit.selfView.hidden.v1`, and the preview room keeps its own under `mj.livekit.preview.selfView.hidden.v1`. Only a saved `true` hides it. Nothing saved, `false`, or a malformed value shows it. When saving fails, the hide still holds for that session. Reset layout now also shows the self-view again and saves that, as the realtime call's Reset brings back a hidden camera box. `<mj-livekit-room>`'s `SelfViewHidden` is now an input, and the new `SelfViewHiddenChange` output fires when the user hides or shows the self-view or resets the layout, so any host can save it. Without a host that saves it, it lasts for the session as before. In `/media`, `MediaLayoutKeys` gains an optional `SelfViewHidden` key, `MediaLayoutPrefs` gains `LoadSelfViewHidden` and `SaveSelfViewHidden`, and `ParseSelfViewHidden` / `SerializeSelfViewHidden` are new. A host that names no key for the self-view, such as the realtime call, reads it as shown and saves nothing: the call's self-view hides by moving its box to Hide, a move it already saves.
- dbc3462: The realtime picker marks the voices that come with an avatar. `GetRealtimeModelVoices` lists one voice per persona, keyed by `PersonaID`, so two personas that share a voice (a voice, and the same voice with a face) both list. A persona voice also carries the `APIName` of the same persona's preset Video binding on the model's vendor (`AvatarID`) and the persona's `PreviewImageURL`; a binding on another vendor or a custom avatar doesn't count, and a voice only the driver declares carries none of the three. A driver voice is now left out only when a persona offers the same voice without a face, so a voice stays pickable without its face. The GraphQL voice option (`RealtimeVoiceOptionResult`) and the client's `RealtimeVoiceOption` carry the three as nullable fields, and the client selects them. For holders of `Realtime: Advanced Session Controls`, the picker's voice list is now an `mj-dropdown` with one option per persona: a camera icon on voices with an avatar, the persona's preview image when it has one, and a hint under the list ("Comes with an avatar") when the picked voice has a face. A pick sends the voice id, plus the avatar (`RealtimeAgentPick.PreferredAvatarId`) when the persona has a face; the override envelope from both builders (`BuildRealtimeConfigOverridesJson`, `BuildRealtimeOverridesJson`) carries it as `realtime.video.avatarId`. The session asks for that face only when the voiced agent's own video setting is on and it names a Video binding on the vendor it resolves. The meeting room's voice lists (the add-agent list in `mj-livekit-agent-room` and the pre-join list on the Meet page) also key their options by persona, so two personas sharing a voice no longer collide and only the picked one shows picked; either still sends the voice id (`AddVoiceOption`, `SelectedVoiceOption`).
- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- b3db2aa: The realtime relay caps what it holds while the upstream opens at 8 MiB as well as 512 frames, and closes a tunnel whose upstream stops reading once 16 MiB is queued for it (1013 to the browser, 1001 upstream), as it already did for a browser that falls behind (#5499).

  Withdrawing agent vision (`SetLiveKitAgentVision` with `Allow: false`) no longer goes through room authorization, so a cancelled meeting or a failed lookup cannot keep an agent watching (#5500).

  The mint fallback for a server without the relay fields matches `field "RelayUrl"`, not any message that names RelayUrl.

  The agent-vision button says what the consent covers: in a room with more than one agent, every agent in the room. Its label there reads "Let agents see me" / "Hide from agents" and its name "Let agents in this room see your camera and screen"; with one agent, "Let the agent see me" / "Hide from the agent" and "Let the agent see your camera and screen". A failure says "Couldn't change what the agent sees" with one agent and "Couldn't change what agents see" with several (#5502).

- dcc5a44: The meeting room lets each person choose whether an agent sees their camera and shared screen. Two LiveKit participant attributes carry it: `mj.agentCanSee` (the person allows it; the server sets it, since a participant's token can't change its own attributes) and `mj.agentWatches` (an agent's bot watches). `LiveKitRoomController` reads them into `LiveKitRoomState.AgentWatching`, `LiveKitLocalMediaState.AgentVisionOn` and each participant view's `AgentCanSee`, which the tiles show as "Agent can see" ("Agents can see" in a room with more than one agent). `mj-livekit-room` offers the "Let the agent see me" switch only while an agent watches (`EnableAgentVisionControl` turns it off) and reports the person's choice through `AgentVisionChange`; the room changes nothing itself. The preview room simulates it: its agent watches, Ada allows it, and `LiveKitPreviewRoomController.SetAgentVision` records your choice at once, which `mj-livekit-agent-room` does in preview mode.
- d3cfd90: In a meeting, `mj-livekit-agent-room` now asks MJAPI to record the user's choice of whether agents may see their camera and shared screen (`GraphQLLiveKitClient.SetAgentVision`); the room shows the change once LiveKit reports it. When MJAPI can't record it, a dismissible notice over the room says why ("Couldn't change what the agent sees: …"), the room stays open, and `ErrorOccurred` reports it with the new `LiveKitRoomError` kind `'agent-vision'`. The preview room still records the choice itself.
- 3775aba: The meeting room's layout is saved per user, for every room. `mj-livekit-room` takes the user's moves and boxes as `TileMoves` and `PipRects` and reports them through `TileMovesChange` and `PipRectsChange` (two-way bindable) as the user moves a tile, moves or resizes a box, or resets the layout; Reset layout now also forgets the boxes' positions, as the realtime call's does. `mj-livekit-agent-room` loads and saves them with the shared `MediaLayoutPrefs`, under `mj.livekit.placement.v1` and `mj.livekit.pip.v1` (`LIVEKIT_PLACEMENT_PREF_KEY`, `LIVEKIT_PIP_PREF_KEY`), in its provider's `UserInfoEngine` once that has loaded and the global one otherwise. The binding gets its first DOM spec.
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [c8409ce]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [155aa45]
- Updated dependencies [e4c355e]
- Updated dependencies [4412e85]
- Updated dependencies [6dce70c]
- Updated dependencies [8c157aa]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [dde482c]
- Updated dependencies [a4b23b7]
- Updated dependencies [676f0dc]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [b2441c3]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [703c44e]
- Updated dependencies [435a69b]
- Updated dependencies [b44a563]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [5b2c8a8]
- Updated dependencies [33d4f4f]
- Updated dependencies [4ee3b59]
- Updated dependencies [318084b]
- Updated dependencies [69bf67c]
- Updated dependencies [efe4738]
- Updated dependencies [08b3d7b]
- Updated dependencies [dbc3462]
- Updated dependencies [d9da1ad]
- Updated dependencies [a16b39d]
- Updated dependencies [c5472d2]
- Updated dependencies [666d078]
- Updated dependencies [ae78a45]
- Updated dependencies [8704df6]
- Updated dependencies [b2f8b5b]
- Updated dependencies [4cff918]
- Updated dependencies [d714f25]
- Updated dependencies [989b3d0]
- Updated dependencies [368ce6d]
- Updated dependencies [ca2791b]
- Updated dependencies [1ea4085]
- Updated dependencies [22c9074]
- Updated dependencies [7f243eb]
- Updated dependencies [a3fcce8]
- Updated dependencies [a08ed58]
- Updated dependencies [2bc4677]
- Updated dependencies [42f8016]
- Updated dependencies [6b587b3]
- Updated dependencies [891dc77]
- Updated dependencies [98dbb78]
- Updated dependencies [0a952ee]
- Updated dependencies [ee81865]
- Updated dependencies [aee2d53]
- Updated dependencies [5e1e343]
- Updated dependencies [84fc9d4]
- Updated dependencies [54cd610]
- Updated dependencies [1bed7f7]
- Updated dependencies [b3db2aa]
- Updated dependencies [20d1f4a]
- Updated dependencies [f1fb411]
- Updated dependencies [f0c78c3]
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [74d9357]
- Updated dependencies [a5b4a72]
- Updated dependencies [25f7b82]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [eee025e]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [dcc5a44]
- Updated dependencies [d3cfd90]
- Updated dependencies [a96c392]
- Updated dependencies [6eec932]
- Updated dependencies [13ccb0c]
- Updated dependencies [3775aba]
- Updated dependencies [d09f068]
- Updated dependencies [161b7bc]
- Updated dependencies [c9e1891]
- Updated dependencies [aac148b]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [005612e]
- Updated dependencies [cf50330]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [f00d5fc]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/ai-realtime-client@6.2.0-edge.4
  - @memberjunction/ng-realtime-media@6.2.0-edge.4
  - @memberjunction/livekit-room-core@6.2.0-edge.4
  - @memberjunction/ng-livekit-room@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ng-ui-components@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4
  - @memberjunction/ng-media-player@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 279b93e: Multi-agent rooms now take turns properly with full-duplex realtime models, and the Live Room doubles as an agent test bed.
  - **Model-side addressing.** `IAddressedMatcher` gains a model-judged implementation next to the name-matching one. Full-duplex sessions get two host tools, `i_am_addressed` and `yield_turn`, because neither vendor offers a native signal. `TurnAddressing` (`Auto` | `ModelSide` | `Regex`) is selectable per session; `Auto` uses the model's judgement when the model reports the new `FullDuplex` capability (GPT-Live, Gemini 3.8 Live with always-on proactive audio) and name matching otherwise.
  - **Floor discipline.** `MultiAgentRoomCoordinator` now grants hand-offs with a TTL (a third agent cannot jump in), keeps backchannels (short "mm-hm" acknowledgements) off the floor, lets a person's speech preempt the holder through the existing barge-in flush path while delegated work keeps running, and caps consecutive agent-to-agent turns (default 8, configurable). A new `FullDuplexTurnGate` enforces it on models that decide for themselves when to speak, so two agents never speak at once even if neither asks first.
  - **Test bed.** New `GetLiveKitRoomTurnState` query and typed `GraphQLLiveKitClient.GetRoomTurnState`; new `mj-livekit-turn-state` widget; the Live Room gets per-agent turn mode and addressing pickers, roster badges and a live Turns panel (floor holder, hand-offs, backchannels, loop cap, event feed) that also works for a person who joins an existing room.
  - **Tests.** A deterministic replay harness with twelve recorded room timelines asserts no overlapping agent speech, no run beyond the loop cap, humans always preempt and backchannels never take the floor.

  No schema, metadata or CodeGen changes. Live-model behaviour of the host tools is not yet verified; see the "Multi-agent rooms" section of `plans/realtime/bridges-and-widget/LIVE-CALL-CHECKLIST.md`.

- d0a8dbf: Add multi-party meetings support: MeetingResolver with GraphQL queries and mutations, GraphQLMeetingClient, Angular L2 meeting components (list, schedule form, lobby, participant picker), and L3 MeetingsResource component for MJ Explorer.
- b1b6d3d: Phone calls can now arrive in a LiveKit room, and an agent can bring a person, a phone number or another agent into that same room.

  No database, entity or metadata change. Handoff offers are held in memory per process, so use a single MJAPI instance for human handoff until a database-backed registry exists (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF-PR3.md`). None of this has been run against a real LiveKit SIP project or Twilio trunk.
  - **`@memberjunction/livekit-room-server`** — `LiveKitSipService` (list, dial, remove and provision SIP participants and trunks through the LiveKit SIP client), `LiveKitWebhookParser` (signed LiveKit webhooks), and the room handoff engine: `RoomHandoffEngine`, `HandoffOfferRegistry` and the handoff types. `LiveKitAgentRoomCoordinator.StartAgentRoomSession` takes optional host options (tools, framing, conversation, transcript sink, barge-in and recovery hooks), and an ended agent leaves the room roster. `LiveKitUserIdentity` is shared by the token minter and the handoff engine.
  - **`@memberjunction/telephony-adapters`** — `telephony.livekitSip` configuration and the `LiveKitSipTelephonyService` server extension (webhook at `/telephony/livekit-sip/webhook`, inbound admission by dialed number, capacity gate, run-as user, outbound through the shared gate), `ISipTrunkCarrier` with a Twilio Elastic SIP implementation that validates configuration only, `RoomCallSessionStarter`, and `PlaceLiveKitSipCall`. Transfer targets gain `kind: 'user' | 'agent'` (`userEmail`, `fallbackNumber`, `agentName`); a `number` target and a call on a carrier media stream behave as before.
  - **`@memberjunction/server`** — the `telephony.livekitSip` config block; `HumanHandoffResolver` (`MyHandoffOffers`, `AcceptHandoffOffer`, `DeclineHandoffOffer`, subscription `HandoffOfferChanges`, all scoped to the signed-in user, failing closed); `StartLiveKitAgentRoomSession` accepts `EnableHandoff` for web-room escalation.
  - **`@memberjunction/graphql-dataprovider`** — `GraphQLHandoffClient`; `EnableHandoff` on the agent room input.
  - **`@memberjunction/ng-conversation-offers`** (new) — `mj-conversation-offers`, a generic widget listing offered conversations with a countdown and Accept / Decline.
  - **`@memberjunction/ng-mj-livekit-room`** — `EnableHandoff` input.
  - **`@memberjunction/ng-explorer-core`** — the Conversation Console resource (`HumanHandoffConsoleResource`), opened by a `handoff-offer` notification.

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [b1b6d3d]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ng-livekit-room@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3
  - @memberjunction/livekit-room-core@6.2.0-edge.3
  - @memberjunction/ng-media-player@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ea4080e]
- Updated dependencies [7e57b48]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ng-base-types@6.2.0-edge.2
  - @memberjunction/ng-media-player@6.2.0-edge.2
  - @memberjunction/livekit-room-core@6.2.0-edge.2
  - @memberjunction/ng-livekit-room@6.2.0-edge.2

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
- Updated dependencies [eb3a8d3]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/livekit-room-core@6.2.0-edge.1
  - @memberjunction/ng-livekit-room@6.2.0-edge.1
  - @memberjunction/ng-media-player@6.2.0-edge.1
  - @memberjunction/ng-base-types@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [5df9486]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ng-base-types@6.2.0-edge.0
  - @memberjunction/ng-media-player@6.2.0-edge.0
  - @memberjunction/ng-livekit-room@6.2.0-edge.0
  - @memberjunction/livekit-room-core@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [834f8d7]
- Updated dependencies [b915983]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [a5f92d2]
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
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [394d276]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [d7feeae]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/ng-base-types@6.1.0
  - @memberjunction/ng-livekit-room@6.1.0
  - @memberjunction/ng-media-player@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/livekit-room-core@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ng-base-types@6.1.0-edge.7
  - @memberjunction/ng-media-player@6.1.0-edge.7
  - @memberjunction/ng-livekit-room@6.1.0-edge.7
  - @memberjunction/livekit-room-core@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- Updated dependencies [b915983]
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
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/ng-livekit-room@6.1.0-edge.6
  - @memberjunction/ng-media-player@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/livekit-room-core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [c42c0e8]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ng-livekit-room@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5
  - @memberjunction/ng-media-player@6.1.0-edge.5
  - @memberjunction/livekit-room-core@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/livekit-room-core@6.1.0-edge.4
  - @memberjunction/ng-media-player@6.1.0-edge.4
  - @memberjunction/ng-livekit-room@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
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
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/livekit-room-core@6.1.0-edge.3
  - @memberjunction/ng-media-player@6.1.0-edge.3
  - @memberjunction/ng-livekit-room@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/livekit-room-core@6.1.0-edge.2
  - @memberjunction/ng-media-player@6.1.0-edge.2
  - @memberjunction/ng-livekit-room@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-livekit-room@6.1.0-edge.1
  - @memberjunction/ng-media-player@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/livekit-room-core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-livekit-room@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ng-media-player@6.1.0-edge.0
  - @memberjunction/livekit-room-core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/ng-media-player@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/ng-livekit-room@6.0.0
  - @memberjunction/livekit-room-core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/ng-media-player@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/ng-livekit-room@5.51.0
  - @memberjunction/livekit-room-core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/ng-media-player@5.50.0
  - @memberjunction/ng-livekit-room@5.50.0
  - @memberjunction/livekit-room-core@5.50.0
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
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ng-livekit-room@5.49.0
  - @memberjunction/ng-media-player@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/livekit-room-core@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/ng-media-player@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/ng-livekit-room@5.48.0
  - @memberjunction/livekit-room-core@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/ng-media-player@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/ng-livekit-room@5.47.0
  - @memberjunction/livekit-room-core@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-media-player@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/ng-livekit-room@5.46.0
  - @memberjunction/livekit-room-core@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/ng-media-player@5.45.1
- @memberjunction/ng-base-types@5.45.1
- @memberjunction/ng-livekit-room@5.45.1
- @memberjunction/livekit-room-core@5.45.1
- @memberjunction/core@5.45.1
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
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-media-player@5.45.0
  - @memberjunction/ng-livekit-room@5.45.0
  - @memberjunction/livekit-room-core@5.45.0

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
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [5de2d37]
- Updated dependencies [6f74b17]
- Updated dependencies [aa9102d]
- Updated dependencies [0476455]
- Updated dependencies [2f9b863]
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-livekit-room@5.44.0
  - @memberjunction/ng-media-player@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/livekit-room-core@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [54183aa]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ng-livekit-room@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0
  - @memberjunction/livekit-room-core@5.43.0

## 5.42.0

### Minor Changes

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

- a07fde1: Add the missing `vitest.config.ts` to `@memberjunction/ng-mj-livekit-room` so its `test` script no longer fails resolving the root config's `projects` globs (the package has no tests yet; `passWithNoTests` from the shared config now lets the sweep pass cleanly).
- a81d82f: Add missing vitest.config.ts so the package's test script no longer crashes by falling back to the root vitest config's project globs.
- Updated dependencies [9b9b484]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/livekit-room-core@5.42.0
  - @memberjunction/ng-livekit-room@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-base-types@5.42.0
