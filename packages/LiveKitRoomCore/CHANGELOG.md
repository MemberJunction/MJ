# @memberjunction/livekit-room-core

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [709de1a]
- Updated dependencies [b5c11d3]
- Updated dependencies [c4645bc]
- Updated dependencies [914e6ff]
- Updated dependencies [1141164]
- Updated dependencies [a610c6e]
- Updated dependencies [cb1e602]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-realtime-client@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [3080e83]
- Updated dependencies [81aea34]
- Updated dependencies [2274f42]
- Updated dependencies [230cdad]
- Updated dependencies [4e4c82d]
- Updated dependencies [72dd65c]
- Updated dependencies [7fb8598]
- Updated dependencies [17a4137]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-realtime-client@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- 7ada797: The participant attributes that say who an agent may see in a meeting now live in `@memberjunction/ai`, so the browser's room, the server that records a person's choice, and an agent's bot share one definition: `REALTIME_AGENT_CAN_SEE_ATTRIBUTE` (`mj.agentCanSee`), `REALTIME_AGENT_WATCHES_ATTRIBUTE` (`mj.agentWatches`), and the readers `AllowsAgentVision` and `IsAgentWatching` (only the value `'true'` counts). `@memberjunction/livekit-room-core` reads them through these and no longer exports its own `LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE` / `LIVEKIT_AGENT_WATCHES_ATTRIBUTE`, added earlier in this release.
- 435a69b: The meeting room shares a screen through `/media` display capture, so it can share one panel of the page as the call does. `LiveKitRoomController` asks the browser's picker through `RequestDisplayCapture` (a constructor option, `RequestScreenShare`, lets a test pass its own), caps the shared track at 1080p and 30 fps with `applyConstraints`, as LiveKit caps its own capture, and publishes it with `publishTrack(track, { source: ScreenShare })`; stopping unpublishes it and releases the capture, and leaving releases it too. A share stopped, or ended in the browser, while the picker was open or the track was publishing is withdrawn. A picker the user closes shares nothing and is no longer reported as an error; a share the browser refuses is a `device` error with the picker's reason. `ILiveKitRoomController.SetScreenShareEnabled` and `ChangeScreenShare` take a surface as before or the capture's options (`DisplayCaptureSurface | DisplayCaptureOptions`), so one panel can be shared with its name, and `LiveKitLocalMediaState.ScreenSharePanelLabel` carries the name while it is shared; the preview room takes the same request. `ToScreenShareCaptureOptions` is deprecated. In `ng-livekit-room`, the control bar's Share menu lists panels under "This panel" (`SharePanels`, `PanelShareRequested`); `mj-livekit-room` marks its whiteboard as a panel (`mjSharePanel="Whiteboard"`), lists the panels on screen that do not hold the room, shares the picked one, names it in the share preview ("Sharing a panel: Whiteboard"), and stops the share when the shared panel goes away. The room's whiteboard shows its board again: its surface set `display: block` on the board host, which overrode the host's flex column and left the board with no height.
- b09fe34: The meeting room shows an agent's avatar. The room core maps the camera track an agent's bot publishes the avatar on (`REALTIME_AGENT_AVATAR_TRACK_NAME`, `agent-avatar`, now shared by the bot's publisher) to the participant's avatar instead of a camera, so its tile carries the "AI-generated video" label, and reads the bot's `mj.agentAvatar` attribute (`ReadAgentAvatarAttribute`) into `LiveKitParticipantView.AvatarAudioOnly`. `mj-media-tile` now shows an avatar whole, the full portrait with bars, in every tile: meeting tiles, and the call's avatar on the stage and in picture-in-picture. Its new `AvatarVideoFit` (default `'contain'`) lets a host fill the tile with `'cover'` instead; other video still fills its tile. When an agent's bot says audio only, the MJ room shows everyone one info notice per agent per join ("Audio only for Sage: the avatar can't be shown in this meeting"), dismissible and hiding itself after 10 seconds; `AvatarNoticeLabels` lets a host word it. Its words come from `ng-realtime-media`'s `AvatarNoticeText`, which gains an options argument (`{ NameAgent: true }` names the agent on a call's lines, for meetings; calls are unchanged) and takes `null` for a reason it doesn't know, giving the new `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`.
- 5b2c8a8: The meeting room's chat marks a message that fails to send "Not sent", with a Retry. Before, `<mj-livekit-room>` showed the user's message at once and kept showing it as sent when it never went out; the failure reached only `ErrorOccurred`, which nothing in the room showed. The message still shows at once. When it does not go out (the send failed, a `BeforeSendData` handler canceled it, or there is no room), a "Not sent" line with a Retry button appears under it; Retry removes it and sends the text again as a new message at the end of the chat, where the others will see it. If the chat panel was closed by then, the chat button's unread badge counts the failure. A message that goes out looks as before. `ChatMessage` now reports the user's own message once it has gone out, and not at all when it does not. `LiveKitChatMessage.NotSent` marks such a message, and the chat panel has a `Retry` output. In `livekit-room-core`, `ILiveKitRoomController.SendData` resolves `true` when the message went out and `false` when it did not; `LiveKitRoomController` still raises a failed publish as an `error` of kind `data`, and the preview room resolves `false` only for a canceled message or outside the room.
- 33d4f4f: The meeting room says when a share, camera, microphone or the room's sound fails while it is connected. Before, these errors reached only the room's connection overlay, which is hidden while connected, so a share the browser refused looked like a click that did nothing. `<mj-livekit-agent-room>` shows the latest device error as a dismissible error notice in its notice stack, after the notice about what the agent sees, worded as "Couldn't <what the user asked for>: <the reason given>": "Couldn't start sharing: To share only the panel, choose this tab in the browser's picker." for a "This panel" share where the user picked another surface, "Couldn't turn on your camera: Could not start video source" for a camera that won't start. A share picker the user closes is still no error and shows nothing. The notice goes when the user dismisses it, asks for another change to their devices (the room's `BeforeMediaToggle` or `BeforeDeviceSwitch`), leaves, or joins again; device errors before the room connects are left to its connection overlay, and every error is still re-emitted on `ErrorOccurred`. In `livekit-room-core`, a `device` error says which device it is about and what the user asked of it: `LiveKitRoomError.Device`, a new `LiveKitErrorDevice` with `Media` (`'microphone' | 'camera' | 'screen' | 'speaker'`) and `Change` (`'on' | 'off' | 'switch'`, absent when the room can't tell). `LiveKitRoomController` sets it when turning the microphone, camera or share on or off, switching a device, or starting the room's sound fails, and on LiveKit's `MediaDevicesError` (the device kind only); the preview room sets it for a share or a camera or microphone that fails to start. A device error about no one device (listing the devices) has none. Error messages are unchanged.
- 4ee3b59: A microphone or camera that fails while joining a LiveKit meeting no longer fails the join. `LiveKitRoomController.Connect` turned the devices on inside the same `try` as the connection, so a microphone the browser refused set the room to "Connection failed: Failed to connect to the room." although LiveKit had connected, and "Try again" failed the same way. The devices now start once the connection is made, each on its own: one that fails is left off and reported as a `device` error (`Failed to enable microphone.` with `Device: { Media: 'microphone', Change: 'on' }`, after LiveKit's own report), the other still starts, and the join completes. `<mj-livekit-agent-room>` then shows its device notice over the connected room ("Couldn't turn on your microphone: Permission denied"), and the user can turn the device on from the control bar. Only a failed connection fails the join: `Connect` rejects, the status is `'error'` and a `connect` error is emitted. If the user leaves while a device starts (the browser's permission prompt can stay open a while), no other device starts and no `connected` is emitted.
- efe4738: New package `@memberjunction/ng-realtime-media`: provider-neutral media UI that renders the `/media` models of `@memberjunction/ai-realtime-client`. It holds the participant tile (`mj-media-tile`), the audio meter (`mj-audio-meter`), the agent-state indicator (`mj-agent-state`), the connection overlay (`mj-connection-overlay`) and the device menu (`mj-media-device-menu`), moved out of `ng-livekit-room` so the realtime overlay and the meeting room share one implementation. A tile never plays audio, and text over video stays light in dark mode.

  `ng-livekit-room` renders the new components. Each remote voice now plays from a hidden player outside the layouts (`mj-livekit-participant-audio`), so split view and the whiteboard no longer silence participants without a tile. The old `mj-livekit-participant-tile`, `-audio-meter`, `-agent-state`, `-connection-overlay` and `-device-menu` components stay as deprecated wrappers around the new ones, with the same inputs and outputs.

  `livekit-room-core` adds `ToMediaParticipant`, `ToMediaDevice` and `ToLiveKitDeviceKind`, which map LiveKit views to the `/media` models (memoized, so a tile never reattaches its video), and exports the meter's `AUDIO_METER_ATTACK` and `AUDIO_METER_DECAY`. The `/media` model gains `MediaAgentState`, `MediaConnectionStatus`, `MediaDisconnectReason`, `MediaConnectionQuality`, `MediaDeviceSelection`, a `speaker` device kind, and the tile's optional participant fields (`PreferredVideo`, `IsMuted`, `ConnectionQuality`, `GetAudioLevel`).

- a16b39d: `LiveKitPreviewRoomController` is a meeting-room controller that needs no LiveKit server, for trying the room UI: `mj-livekit-room` runs on it through `LIVEKIT_ROOM_CONTROLLER_FACTORY`. Your camera, microphone and screen share are real (the camera and microphone on the shared `MediaPreview`, the share through the browser's picker); the other people are simulated (by default an agent and three participants, `LIVEKIT_PREVIEW_PEOPLE`) and take turns speaking. Nothing is sent anywhere. A participant view can now carry media from outside LiveKit (`LiveKitParticipantView.Media`), which `ToMediaParticipant` shows in place of the participant's LiveKit tracks and level; `ToMediaDeviceKind` maps a LiveKit device kind to a `/media` one.
- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- 5e1e343: `mj-media-controls` (ng-realtime-media) is a call's microphone, camera and Share buttons, drawn as round `mjButton`s. Share is a split button: its main part asks the browser's picker with no preference, or stops sharing; its arrow opens a menu that asks for an entire screen, a window or a browser tab first and, when the host lists `SharePanels`, offers "This panel" with one of them. The arrow hides while the user shares. It emits `MicrophoneToggled`, `CameraToggled`, `ShareRequested` (`MediaShareRequest`) and `StopShareRequested`.

  The LiveKit room's control bar renders it for its media buttons, and its other buttons become round `mjButton`s. The bar gains `EnableShareMenu` (off by default) and `ScreenShareRequested`; the room turns the menu on and starts the share with `LiveKitRoomController.SetScreenShareEnabled(true, surface)`, which now takes the kind of surface to offer first and passes it to LiveKit as `displaySurface` (`ToScreenShareCaptureOptions`). The chat and participants buttons are named with the counts their badges show.

  `mj-menu-item` shows an arrow after its label when it opens a submenu.

- f1fb411: `mj-self-view` (ng-realtime-media) is the user's own tile, as `mj-media-tile` draws it with the camera mirrored, with an "Agent can see this" badge ("Agents can see this" with more than one agent) while the host says frames reach an agent, and a Hide button (`HideRequested`). `mj-share-preview` shows what the user shares, whole and not mirrored, labelled by the kind of surface ("Sharing a window"), with Stop sharing and Change (`StopRequested`, `ChangeRequested`). `mj-media-tile` gains `Mirror`, which mirrors the camera only.

  The LiveKit room draws the user's own tile with them in every layout: their self-view, or their share preview while they share. Hide (in the grid and filmstrip) leaves a "Self-view hidden · Show" chip in the stage's top-left corner for the session; the camera stays on. Your own tile no longer has a pin button. `LiveKitRoomController.ChangeScreenShare(preferredSurface?)` stops a share and asks the browser's picker again, and `LiveKitLocalMediaState.ScreenShareSurface` says what is shared. `/media` exports `CapturedSurfaceOf(track)`, which reads the kind of surface from any captured display track.

- d853bf8: A channel's frames sent through its context's `SendVideoFrame` (`RealtimeChannelContext`, `@memberjunction/realtime-runtime`) now go through the session's `VideoSourceArbiter` as the channel's own source, under the id its frame bridge uses (`<channel key>#<instance>`): they reach the model only while the arbiter picks that source, the model is told when it switches, and nothing is sent while the channel's exposure is below pixels. Before, they went straight to the model. The member is deprecated in favour of `ChannelInboundVideoBridge`; the context's `Client` still writes past the arbiter, as does the runtime's own `SendVideoFrame`, whose TSDoc now says so.

  Deprecated, with nothing reading them: `RealtimeVideoConfig.provider` and `providers` (`@memberjunction/ai-agents`). The model is chosen with `realtime.modelPreference`, or with `realtime.video.enabled` the first model that shows an avatar; an avatar's settings are its persona binding's `VendorSettings.Avatar`. A session whose configuration sets either key logs one line per agent naming them, and `FindDeprecatedRealtimeVideoKeys` reports them as data. The TSDoc of `enabled` and `avatarId` now says what they do: `enabled` asks for an avatar and does not start the camera, and `avatarId` names one of the model's Video persona bindings.

  Also deprecated: `BaseRealtimeModel.SupportsVideo` (`@memberjunction/ai`), which no driver overrides and nothing reads (video is declared by `Capabilities.SupportedInboundTracks` / `SupportedOutboundTracks` and `SupportsAvatarOutput`); `LiveKitAudioMeter` and `LiveKitAudioMeterFrame` (`@memberjunction/livekit-room-core`) in favour of `AudioLevelSmoother`, which gives the same frames with the room's settings (the `AUDIO_METER_*` constants stay); and `CreateCameraCapture` (`@memberjunction/ai-realtime-client`) in favour of `LocalMediaController` and `FrameSampler`.

  Removed, since no release shipped it: `ToScreenShareCaptureOptions` from `@memberjunction/livekit-room-core`.

- dcc5a44: The meeting room lets each person choose whether an agent sees their camera and shared screen. Two LiveKit participant attributes carry it: `mj.agentCanSee` (the person allows it; the server sets it, since a participant's token can't change its own attributes) and `mj.agentWatches` (an agent's bot watches). `LiveKitRoomController` reads them into `LiveKitRoomState.AgentWatching`, `LiveKitLocalMediaState.AgentVisionOn` and each participant view's `AgentCanSee`, which the tiles show as "Agent can see" ("Agents can see" in a room with more than one agent). `mj-livekit-room` offers the "Let the agent see me" switch only while an agent watches (`EnableAgentVisionControl` turns it off) and reports the person's choice through `AgentVisionChange`; the room changes nothing itself. The preview room simulates it: its agent watches, Ada allows it, and `LiveKitPreviewRoomController.SetAgentVision` records your choice at once, which `mj-livekit-agent-room` does in preview mode.
- d3cfd90: In a meeting, `mj-livekit-agent-room` now asks MJAPI to record the user's choice of whether agents may see their camera and shared screen (`GraphQLLiveKitClient.SetAgentVision`); the room shows the change once LiveKit reports it. When MJAPI can't record it, a dismissible notice over the room says why ("Couldn't change what the agent sees: …"), the room stays open, and `ErrorOccurred` reports it with the new `LiveKitRoomError` kind `'agent-vision'`. The preview room still records the choice itself.
- a96c392: `LiveKitRoomController` clears the state's `Local` and `RoomName` when the user leaves or the connection ends, as the preview room does (#5391). Its reset merged an initial state that left both out over the current state, so both kept their values: after leaving, the state still named the room and held the user's own participant view, which the meeting room lists among its participants. A `beforeDisconnect` handler still reads both, and the disconnect reason still outlasts the reset; `stateChanged` and `disconnected` handlers now get the state without them, and joining again sets them once connected. The reset's type now requires every state field but `DisconnectReason`, so a field added to `LiveKitRoomState` later can't be left out of it.
- 6eec932: The meeting room runs on any room controller. `ILiveKitRoomController` in `@memberjunction/livekit-room-core` is what `mj-livekit-room` drives: the connection, local media, the data channel, effects, devices, and the room's state and events. `LiveKitRoomController` implements it and stays the default. `LIVEKIT_ROOM_CONTROLLER_FACTORY` and the room's `Controller` are now typed to the interface, so a host can provide its own controller; code that assigns `Controller` to a variable typed `LiveKitRoomController` should type it `ILiveKitRoomController` instead.
- d09f068: The meeting room's lobby runs on the shared `MediaPreview` and renders `mj-camera-check` itself, instead of the deprecated `mj-livekit-prejoin` wrapper and its `LiveKitMediaPreview`. The lobby starts the microphone and camera as the room's `StartWithMicrophone` and `StartWithCamera` say (the wrapper always started the microphone), lets the user pick devices, frees them before the room connects with the name and devices chosen, and frees them if the room goes away first. `LOCAL_MEDIA_CONTROLLER_FACTORY` in `@memberjunction/ng-realtime-media` makes the camera-and-microphone controller a component runs on (the browser's `LocalMediaController` by default; a test provides a fake). `LiveKitMediaPreview` in `@memberjunction/livekit-room-core` is deprecated in favor of `MediaPreview`; `mj-livekit-prejoin` stays exported, deprecated.
- Updated dependencies [d17de94]
- Updated dependencies [c8409ce]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [4412e85]
- Updated dependencies [6dce70c]
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
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [20d1f4a]
- Updated dependencies [f1fb411]
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [afe9eb4]
- Updated dependencies [c9e1891]
- Updated dependencies [d2cb42e]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [cf50330]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [f00d5fc]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/ai-realtime-client@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [dfe40a4]
  - @memberjunction/global@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [4d647e6]
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

- Updated dependencies [80905a1]
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [1940a4d]
- Updated dependencies [a5f92d2]
- Updated dependencies [cefc302]
- Updated dependencies [080f4cd]
- Updated dependencies [be0bdb2]
- Updated dependencies [48ff99f]
- Updated dependencies [23c2521]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [1bd9674]
- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [197fdf8]
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [1940a4d]
- Updated dependencies [23c2521]
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0

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

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
