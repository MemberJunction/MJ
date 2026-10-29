# @memberjunction/ng-livekit-room

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [0581392]
- Updated dependencies [b5c11d3]
- Updated dependencies [c4645bc]
- Updated dependencies [dae1d31]
- Updated dependencies [a610c6e]
- Updated dependencies [cb1e602]
- Updated dependencies [db4e210]
- Updated dependencies [c4645bc]
- Updated dependencies [f125bb4]
- Updated dependencies [4c34ab8]
- Updated dependencies [e600813]
  - @memberjunction/ng-ui-components@6.2.0-edge.6
  - @memberjunction/ai-realtime-client@6.2.0-edge.6
  - @memberjunction/ng-whiteboard@6.2.0-edge.6
  - @memberjunction/ng-realtime-media@6.2.0-edge.6
  - @memberjunction/livekit-room-core@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- 1aefcb4: `<mj-realtime-whiteboard-host>` gains a `ShowFocusToggle` input (default `true`). The header's Focus toggle ("Move to stage" / "Back to tab") only emits `FocusModeChange`; a host that composes the board into its own chrome has nothing to collapse, so the button was visible and did nothing, and could only be removed by `!important` CSS against an internal class name. Hosts without a stage now pass `[ShowFocusToggle]="false"`. `SetOnStage` and `FocusMode` keep working with the toggle hidden; the rest of the header is unchanged.

  `<mj-livekit-whiteboard-surface>` passes it: the LiveKit room has no stage and never serviced `FocusModeChange`, so its board header no longer carries the inert button.

- Updated dependencies [8b62f8c]
- Updated dependencies [72dd65c]
- Updated dependencies [7fb8598]
- Updated dependencies [1aefcb4]
- Updated dependencies [2f9e209]
- Updated dependencies [382de4d]
- Updated dependencies [8576224]
  - @memberjunction/ng-ui-components@6.2.0-edge.5
  - @memberjunction/ai-realtime-client@6.2.0-edge.5
  - @memberjunction/ng-whiteboard@6.2.0-edge.5
  - @memberjunction/ng-realtime-media@6.2.0-edge.5
  - @memberjunction/livekit-room-core@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- 676f0dc: The words a call shows now match across the web and the phone. The phone's red call button is named "End call" for screen readers, as the web names it, and its hint says "Tap to end the call · swipe right for keyboard" (it said "Stop" and "Tap to stop"). The words for what agents see are plural only in a room with more than one agent: the participant tile's chip says "Agents can see", the self-view's badge "Agents can see this" and the control "Let agents see me" / "Hide from agents" (named "Let agents in this room see your camera and screen") there, and "Agent can see", "Agent can see this" and "Let the agent see me" / "Hide from the agent" (named "Let the agent see your camera and screen") in a call with one agent. `mj-media-tile`, `mj-self-view`, `mj-media-controls` and `mj-livekit-control-bar` take an `AgentCount` input (1 by default); `mj-livekit-room` passes its number of agents (`AgentCount`, participants whose role is `agent`), and the words are exported as `AgentVisionText(agentCount)`.
- 703c44e: The meeting room lays out through the shared media stage (`LayoutMediaStage` and its selectors from `@memberjunction/ai-realtime-client/media`), as the realtime call does: the spotlight, the filmstrip beside it, the grid, and split view's sharer and speaker. The layouts show the same people as before, with one difference: split view shows a remote share once its screen track arrives, where it showed the sharer's tile without the screen for the moment between the share being announced and its track arriving. The room's own layout selectors (`SelectDisplayParticipants`, `SelectSpotlight`, `SelectFilmstrip`, `SelectScreenShare`, `SelectSplitSpeaker`) are deprecated in favor of the shared ones.
- 435a69b: The meeting room shares a screen through `/media` display capture, so it can share one panel of the page as the call does. `LiveKitRoomController` asks the browser's picker through `RequestDisplayCapture` (a constructor option, `RequestScreenShare`, lets a test pass its own), caps the shared track at 1080p and 30 fps with `applyConstraints`, as LiveKit caps its own capture, and publishes it with `publishTrack(track, { source: ScreenShare })`; stopping unpublishes it and releases the capture, and leaving releases it too. A share stopped, or ended in the browser, while the picker was open or the track was publishing is withdrawn. A picker the user closes shares nothing and is no longer reported as an error; a share the browser refuses is a `device` error with the picker's reason. `ILiveKitRoomController.SetScreenShareEnabled` and `ChangeScreenShare` take a surface as before or the capture's options (`DisplayCaptureSurface | DisplayCaptureOptions`), so one panel can be shared with its name, and `LiveKitLocalMediaState.ScreenSharePanelLabel` carries the name while it is shared; the preview room takes the same request. `ToScreenShareCaptureOptions` is deprecated. In `ng-livekit-room`, the control bar's Share menu lists panels under "This panel" (`SharePanels`, `PanelShareRequested`); `mj-livekit-room` marks its whiteboard as a panel (`mjSharePanel="Whiteboard"`), lists the panels on screen that do not hold the room, shares the picked one, names it in the share preview ("Sharing a panel: Whiteboard"), and stops the share when the shared panel goes away. The room's whiteboard shows its board again: its surface set `display: block` on the board host, which overrode the host's flex column and left the board with no height.
- b44a563: The meeting room's pin is a move of the participant's tile to the spotlight in the shared media stage: each participant's tile is a media-stage surface, and `MoveTile(identity, placement)` moves it to the spotlight (`stage`) or back among the others (`tab`). One participant holds the spotlight, so a new pin sends the last one back, and unpinning gives the spotlight back to the call. Pinning someone in Gallery switches the room to Active speaker with them in the spotlight, and emits `LayoutChange`. `PinnedIdentity` reads the participant moved to the spotlight while pinning is on and they are in the room; setting it moves their tile, and `null` sends it back.
- 5b2c8a8: The meeting room's chat marks a message that fails to send "Not sent", with a Retry. Before, `<mj-livekit-room>` showed the user's message at once and kept showing it as sent when it never went out; the failure reached only `ErrorOccurred`, which nothing in the room showed. The message still shows at once. When it does not go out (the send failed, a `BeforeSendData` handler canceled it, or there is no room), a "Not sent" line with a Retry button appears under it; Retry removes it and sends the text again as a new message at the end of the chat, where the others will see it. If the chat panel was closed by then, the chat button's unread badge counts the failure. A message that goes out looks as before. `ChatMessage` now reports the user's own message once it has gone out, and not at all when it does not. `LiveKitChatMessage.NotSent` marks such a message, and the chat panel has a `Retry` output. In `livekit-room-core`, `ILiveKitRoomController.SendData` resolves `true` when the message went out and `false` when it did not; `LiveKitRoomController` still raises a failed publish as an `error` of kind `data`, and the preview room resolves `false` only for a canceled message or outside the room.
- 318084b: The meeting room's self-view Hide is saved per user. In `<mj-livekit-agent-room>`, a user who hides their own tile finds it still hidden in their next meeting, on any device, until they click Show on the "Self-view hidden" chip or reset the layout. It is saved in `MJ: User Settings` under `mj.livekit.selfView.hidden.v1`, and the preview room keeps its own under `mj.livekit.preview.selfView.hidden.v1`. Only a saved `true` hides it. Nothing saved, `false`, or a malformed value shows it. When saving fails, the hide still holds for that session. Reset layout now also shows the self-view again and saves that, as the realtime call's Reset brings back a hidden camera box. `<mj-livekit-room>`'s `SelfViewHidden` is now an input, and the new `SelfViewHiddenChange` output fires when the user hides or shows the self-view or resets the layout, so any host can save it. Without a host that saves it, it lasts for the session as before. In `/media`, `MediaLayoutKeys` gains an optional `SelfViewHidden` key, `MediaLayoutPrefs` gains `LoadSelfViewHidden` and `SaveSelfViewHidden`, and `ParseSelfViewHidden` / `SerializeSelfViewHidden` are new. A host that names no key for the self-view, such as the realtime call, reads it as shown and saves nothing: the call's self-view hides by moving its box to Hide, a move it already saves.
- efe4738: New package `@memberjunction/ng-realtime-media`: provider-neutral media UI that renders the `/media` models of `@memberjunction/ai-realtime-client`. It holds the participant tile (`mj-media-tile`), the audio meter (`mj-audio-meter`), the agent-state indicator (`mj-agent-state`), the connection overlay (`mj-connection-overlay`) and the device menu (`mj-media-device-menu`), moved out of `ng-livekit-room` so the realtime overlay and the meeting room share one implementation. A tile never plays audio, and text over video stays light in dark mode.

  `ng-livekit-room` renders the new components. Each remote voice now plays from a hidden player outside the layouts (`mj-livekit-participant-audio`), so split view and the whiteboard no longer silence participants without a tile. The old `mj-livekit-participant-tile`, `-audio-meter`, `-agent-state`, `-connection-overlay` and `-device-menu` components stay as deprecated wrappers around the new ones, with the same inputs and outputs.

  `livekit-room-core` adds `ToMediaParticipant`, `ToMediaDevice` and `ToLiveKitDeviceKind`, which map LiveKit views to the `/media` models (memoized, so a tile never reattaches its video), and exports the meter's `AUDIO_METER_ATTACK` and `AUDIO_METER_DECAY`. The `/media` model gains `MediaAgentState`, `MediaConnectionStatus`, `MediaDisconnectReason`, `MediaConnectionQuality`, `MediaDeviceSelection`, a `speaker` device kind, and the tile's optional participant fields (`PreferredVideo`, `IsMuted`, `ConnectionQuality`, `GetAudioLevel`).

- 368ce6d: `mj-camera-check` (ng-realtime-media) is a look at the camera and a listen to the microphone before anything is shared: the camera mirrored, a level meter, the microphone and camera buttons of `mj-media-controls`, microphone and camera pickers, an optional name, and a confirm button that emits `Confirmed` with the choices (`MediaCameraCheckChoices`). It is presentational: the host runs the preview, passing the camera as `CameraSource` and the level as `MicrophoneLevel`, and starts, stops or switches devices on `MicrophoneToggled`, `CameraToggled` and `DeviceSelected`.

  `mj-livekit-prejoin` is now a deprecated wrapper: it runs `LiveKitMediaPreview` and renders `mj-camera-check`, with the same inputs and `Join` output. Its text now follows the theme (it was white on the light page), its meter is the shared `mj-audio-meter`, and `MicLevelPct` reads the level on demand instead of being updated on every animation frame.

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

- b3db2aa: The realtime relay caps what it holds while the upstream opens at 8 MiB as well as 512 frames, and closes a tunnel whose upstream stops reading once 16 MiB is queued for it (1013 to the browser, 1001 upstream), as it already did for a browser that falls behind (#5499).

  Withdrawing agent vision (`SetLiveKitAgentVision` with `Allow: false`) no longer goes through room authorization, so a cancelled meeting or a failed lookup cannot keep an agent watching (#5500).

  The mint fallback for a server without the relay fields matches `field "RelayUrl"`, not any message that names RelayUrl.

  The agent-vision button says what the consent covers: in a room with more than one agent, every agent in the room. Its label there reads "Let agents see me" / "Hide from agents" and its name "Let agents in this room see your camera and screen"; with one agent, "Let the agent see me" / "Hide from the agent" and "Let the agent see your camera and screen". A failure says "Couldn't change what the agent sees" with one agent and "Couldn't change what agents see" with several (#5502).

- f1fb411: `mj-self-view` (ng-realtime-media) is the user's own tile, as `mj-media-tile` draws it with the camera mirrored, with an "Agent can see this" badge ("Agents can see this" with more than one agent) while the host says frames reach an agent, and a Hide button (`HideRequested`). `mj-share-preview` shows what the user shares, whole and not mirrored, labelled by the kind of surface ("Sharing a window"), with Stop sharing and Change (`StopRequested`, `ChangeRequested`). `mj-media-tile` gains `Mirror`, which mirrors the camera only.

  The LiveKit room draws the user's own tile with them in every layout: their self-view, or their share preview while they share. Hide (in the grid and filmstrip) leaves a "Self-view hidden · Show" chip in the stage's top-left corner for the session; the camera stays on. Your own tile no longer has a pin button. `LiveKitRoomController.ChangeScreenShare(preferredSurface?)` stops a share and asks the browser's picker again, and `LiveKitLocalMediaState.ScreenShareSurface` says what is shared. `/media` exports `CapturedSurfaceOf(track)`, which reads the kind of surface from any captured display track.

- dcc5a44: The meeting room lets each person choose whether an agent sees their camera and shared screen. Two LiveKit participant attributes carry it: `mj.agentCanSee` (the person allows it; the server sets it, since a participant's token can't change its own attributes) and `mj.agentWatches` (an agent's bot watches). `LiveKitRoomController` reads them into `LiveKitRoomState.AgentWatching`, `LiveKitLocalMediaState.AgentVisionOn` and each participant view's `AgentCanSee`, which the tiles show as "Agent can see" ("Agents can see" in a room with more than one agent). `mj-livekit-room` offers the "Let the agent see me" switch only while an agent watches (`EnableAgentVisionControl` turns it off) and reports the person's choice through `AgentVisionChange`; the room changes nothing itself. The preview room simulates it: its agent watches, Ada allows it, and `LiveKitPreviewRoomController.SetAgentVision` records your choice at once, which `mj-livekit-agent-room` does in preview mode.
- 6eec932: The meeting room runs on any room controller. `ILiveKitRoomController` in `@memberjunction/livekit-room-core` is what `mj-livekit-room` drives: the connection, local media, the data channel, effects, devices, and the room's state and events. `LiveKitRoomController` implements it and stays the default. `LIVEKIT_ROOM_CONTROLLER_FACTORY` and the room's `Controller` are now typed to the interface, so a host can provide its own controller; code that assigns `Controller` to a variable typed `LiveKitRoomController` should type it `ILiveKitRoomController` instead.
- 13ccb0c: The meeting room's header shows its title and participant count in the light theme. Both used the inverse text color, meant for colored backgrounds, on the header's surface, so they were white on white; they now use the primary and secondary text colors, which also reads better in the dark theme.
- 3775aba: The meeting room's layout is saved per user, for every room. `mj-livekit-room` takes the user's moves and boxes as `TileMoves` and `PipRects` and reports them through `TileMovesChange` and `PipRectsChange` (two-way bindable) as the user moves a tile, moves or resizes a box, or resets the layout; Reset layout now also forgets the boxes' positions, as the realtime call's does. `mj-livekit-agent-room` loads and saves them with the shared `MediaLayoutPrefs`, under `mj.livekit.placement.v1` and `mj.livekit.pip.v1` (`LIVEKIT_PLACEMENT_PREF_KEY`, `LIVEKIT_PIP_PREF_KEY`), in its provider's `UserInfoEngine` once that has loaded and the global one otherwise. The binding gets its first DOM spec.
- d09f068: The meeting room's lobby runs on the shared `MediaPreview` and renders `mj-camera-check` itself, instead of the deprecated `mj-livekit-prejoin` wrapper and its `LiveKitMediaPreview`. The lobby starts the microphone and camera as the room's `StartWithMicrophone` and `StartWithCamera` say (the wrapper always started the microphone), lets the user pick devices, frees them before the room connects with the name and devices chosen, and frees them if the room goes away first. `LOCAL_MEDIA_CONTROLLER_FACTORY` in `@memberjunction/ng-realtime-media` makes the camera-and-microphone controller a component runs on (the browser's `LocalMediaController` by default; a test provides a fake). `LiveKitMediaPreview` in `@memberjunction/livekit-room-core` is deprecated in favor of `MediaPreview`; `mj-livekit-prejoin` stays exported, deprecated.
- 161b7bc: Every meeting tile has a "Move to…" menu, beside its pin. It offers the spotlight and the strip (named Filmstrip, or Gallery in Gallery), with the tile's place disabled, then Reset layout, which puts every tile back where the call places it. The participant the call put in the spotlight is offered the spotlight alone, which pins them there. Moving to the spotlight from Gallery switches to Active speaker, as the pin does. There is no menu while pinning is off, or on the shared screen in split view.

  To make room for it, `mj-media-tile` takes content marked `mjMediaTileActions` in its top corner, before the pin, shown on hover or focus; `mj-self-view` passes it on and puts its Hide button in the same corner, after it; `mj-share-preview` takes it in its top corner. `mj-media-move-menu` gains `OverVideo`, which gives its button the dark round scrim of the tile's pin.

- c9e1891: Meeting tiles can go into picture-in-picture boxes. Every tile's "Move to…" menu offers Picture-in-picture (the participant the call put in the spotlight is offered the spotlight and a box); a box floats over the stage, the whiteboard included, through `mj-media-stage`, and its bar carries the participant's menu. Someone in a box is not shown again: they leave the filmstrip and the grid, and are not the speaker pane in split view, though their shared screen still shows. Without pinning, the menus offer the strip and a box. A host turning the self-view off takes the user's box away until it is back on.

  The shared media stage (`LayoutMediaStage`) no longer picks for the spotlight a participant already shown in a picture-in-picture box; the next in line takes it. `mj-media-tile`'s minimum height reads `--mj-media-tile-min-height` (120px by default), so a host can let a tile shrink into a small box.

- 7a08dc1: The realtime call and the meeting room keep and save the user's layout through one shared set of helpers in `@memberjunction/ai-realtime-client/media`: `RecordPlacementMove` and `WithoutStageMoves` keep the moves, `ParsePlacementMoves` / `SerializePlacementMoves` and `ParsePipRects` / `SerializePipRects` give their saved form, and `MediaPipRect` is the saved picture-in-picture box. `ParticipantTileKey`, `ParticipantTileSurface` and `StageParticipantIdentity` let any host show participants as movable tiles, as the meeting room now does through them. Nothing changes on screen.

  Removed, since no release shipped them: the call's own copies of these helpers (`ParseSurfacePlacementPref`, `SerializeSurfacePlacementPref`, `RecordSurfaceMove`, `ParseSurfacePipPref`, `SerializeSurfacePipPref`) and the deprecated `mj-realtime-surface-move-menu` / `RealtimeSurfaceMove` from `@memberjunction/ng-conversations`, and `MediaPipRect` from `@memberjunction/ng-realtime-media`. The call's setting keys (`SURFACE_PLACEMENT_PREF_KEY`, `SURFACE_PIP_PREF_KEY`) stay.

- Updated dependencies [c8409ce]
- Updated dependencies [7ada797]
- Updated dependencies [155aa45]
- Updated dependencies [e4c355e]
- Updated dependencies [4412e85]
- Updated dependencies [6dce70c]
- Updated dependencies [8c157aa]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [a4b23b7]
- Updated dependencies [676f0dc]
- Updated dependencies [961d529]
- Updated dependencies [6dc3aa9]
- Updated dependencies [490cd8d]
- Updated dependencies [b2441c3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [435a69b]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [5b2c8a8]
- Updated dependencies [33d4f4f]
- Updated dependencies [4ee3b59]
- Updated dependencies [318084b]
- Updated dependencies [69bf67c]
- Updated dependencies [efe4738]
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
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [74d9357]
- Updated dependencies [a5b4a72]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [eee025e]
- Updated dependencies [afe9eb4]
- Updated dependencies [dcc5a44]
- Updated dependencies [d3cfd90]
- Updated dependencies [a96c392]
- Updated dependencies [6eec932]
- Updated dependencies [d09f068]
- Updated dependencies [161b7bc]
- Updated dependencies [c9e1891]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [005612e]
- Updated dependencies [cf50330]
- Updated dependencies [cbddadb]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [f00d5fc]
- Updated dependencies [7d4906b]
  - @memberjunction/ai-realtime-client@6.2.0-edge.4
  - @memberjunction/ng-realtime-media@6.2.0-edge.4
  - @memberjunction/livekit-room-core@6.2.0-edge.4
  - @memberjunction/ng-ui-components@6.2.0-edge.4
  - @memberjunction/ng-whiteboard@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 279b93e: Multi-agent rooms now take turns properly with full-duplex realtime models, and the Live Room doubles as an agent test bed.
  - **Model-side addressing.** `IAddressedMatcher` gains a model-judged implementation next to the name-matching one. Full-duplex sessions get two host tools, `i_am_addressed` and `yield_turn`, because neither vendor offers a native signal. `TurnAddressing` (`Auto` | `ModelSide` | `Regex`) is selectable per session; `Auto` uses the model's judgement when the model reports the new `FullDuplex` capability (GPT-Live, Gemini 3.8 Live with always-on proactive audio) and name matching otherwise.
  - **Floor discipline.** `MultiAgentRoomCoordinator` now grants hand-offs with a TTL (a third agent cannot jump in), keeps backchannels (short "mm-hm" acknowledgements) off the floor, lets a person's speech preempt the holder through the existing barge-in flush path while delegated work keeps running, and caps consecutive agent-to-agent turns (default 8, configurable). A new `FullDuplexTurnGate` enforces it on models that decide for themselves when to speak, so two agents never speak at once even if neither asks first.
  - **Test bed.** New `GetLiveKitRoomTurnState` query and typed `GraphQLLiveKitClient.GetRoomTurnState`; new `mj-livekit-turn-state` widget; the Live Room gets per-agent turn mode and addressing pickers, roster badges and a live Turns panel (floor holder, hand-offs, backchannels, loop cap, event feed) that also works for a person who joins an existing room.
  - **Tests.** A deterministic replay harness with twelve recorded room timelines asserts no overlapping agent speech, no run beyond the loop cap, humans always preempt and backchannels never take the floor.

  No schema, metadata or CodeGen changes. Live-model behaviour of the host tools is not yet verified; see the "Multi-agent rooms" section of `plans/realtime/bridges-and-widget/LIVE-CALL-CHECKLIST.md`.

- Updated dependencies [60bd774]
  - @memberjunction/ng-ui-components@6.2.0-edge.3
  - @memberjunction/ng-whiteboard@6.2.0-edge.3
  - @memberjunction/livekit-room-core@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [369e229]
  - @memberjunction/ng-ui-components@6.2.0-edge.2
  - @memberjunction/ng-whiteboard@6.2.0-edge.2
  - @memberjunction/livekit-room-core@6.2.0-edge.2

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

- Updated dependencies [f78fd63]
- Updated dependencies [80905a1]
- Updated dependencies [920bef8]
  - @memberjunction/ng-whiteboard@6.2.0-edge.1
  - @memberjunction/livekit-room-core@6.2.0-edge.1
  - @memberjunction/ng-ui-components@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- @memberjunction/ng-whiteboard@6.2.0-edge.0
- @memberjunction/ng-ui-components@6.2.0-edge.0
- @memberjunction/livekit-room-core@6.2.0-edge.0

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
- Updated dependencies [4273317]
- Updated dependencies [394d276]
- Updated dependencies [b915983]
- Updated dependencies [b895f92]
- Updated dependencies [4c1de04]
- Updated dependencies [c09c818]
- Updated dependencies [d26e202]
- Updated dependencies [394d276]
- Updated dependencies [6ecfaa0]
- Updated dependencies [cf2484c]
- Updated dependencies [394d276]
- Updated dependencies [ce3d526]
- Updated dependencies [ba71cd4]
  - @memberjunction/ng-whiteboard@6.1.0
  - @memberjunction/ng-ui-components@6.1.0
  - @memberjunction/livekit-room-core@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [cf2484c]
  - @memberjunction/ng-ui-components@6.1.0-edge.7
  - @memberjunction/ng-whiteboard@6.1.0-edge.7
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
- Updated dependencies [4c1de04]
- Updated dependencies [ce3d526]
- Updated dependencies [ba71cd4]
  - @memberjunction/ng-ui-components@6.1.0-edge.6
  - @memberjunction/ng-whiteboard@6.1.0-edge.6
  - @memberjunction/livekit-room-core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [4273317]
- Updated dependencies [c09c818]
  - @memberjunction/ng-whiteboard@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/livekit-room-core@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- @memberjunction/ng-whiteboard@6.1.0-edge.4
- @memberjunction/livekit-room-core@6.1.0-edge.4
- @memberjunction/ng-ui-components@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [6ecfaa0]
  - @memberjunction/ng-ui-components@6.1.0-edge.3
  - @memberjunction/ng-whiteboard@6.1.0-edge.3
  - @memberjunction/livekit-room-core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- @memberjunction/ng-whiteboard@6.1.0-edge.2
- @memberjunction/livekit-room-core@6.1.0-edge.2
- @memberjunction/ng-ui-components@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/ng-whiteboard@6.1.0-edge.1
  - @memberjunction/livekit-room-core@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [b895f92]
- Updated dependencies [d26e202]
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/ng-whiteboard@6.1.0-edge.0
  - @memberjunction/livekit-room-core@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ng-whiteboard@6.0.0
- @memberjunction/ng-ui-components@6.0.0
- @memberjunction/livekit-room-core@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ng-whiteboard@5.51.0
- @memberjunction/ng-ui-components@5.51.0
- @memberjunction/livekit-room-core@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/ng-ui-components@5.50.0
- @memberjunction/ng-whiteboard@5.50.0
- @memberjunction/livekit-room-core@5.50.0

## 5.49.0

### Patch Changes

- @memberjunction/ng-ui-components@5.49.0
- @memberjunction/ng-whiteboard@5.49.0
- @memberjunction/livekit-room-core@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/ng-whiteboard@5.48.0
- @memberjunction/ng-ui-components@5.48.0
- @memberjunction/livekit-room-core@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ng-whiteboard@5.47.0
- @memberjunction/ng-ui-components@5.47.0
- @memberjunction/livekit-room-core@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ng-whiteboard@5.46.0
- @memberjunction/ng-ui-components@5.46.0
- @memberjunction/livekit-room-core@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/ng-whiteboard@5.45.1
- @memberjunction/livekit-room-core@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [13716e4]
- Updated dependencies [c1f2d3d]
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/ng-whiteboard@5.45.0
  - @memberjunction/livekit-room-core@5.45.0

## 5.44.0

### Minor Changes

- 5de2d37: `LiveKitRoomComponent`: make the room controller injectable. The component previously did `new LiveKitRoomController()` inline (untestable, no seam to substitute); it now resolves a new exported `LIVEKIT_ROOM_CONTROLLER_FACTORY` injection token and invokes it. The default factory returns `new LiveKitRoomController()`, so **runtime behavior is unchanged** — this is purely additive.

  A host (or test) can now provide an alternate/fake controller: `{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => myController }`. Used to add a container-level DOM spec that drives the room entirely from a fake controller (no `livekit-client`, no media), proving the injected-fake-container test pattern.

### Patch Changes

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [f8be8a0]
- Updated dependencies [1e5e449]
- Updated dependencies [0476455]
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-whiteboard@5.44.0
  - @memberjunction/livekit-room-core@5.44.0

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

- 54183aa: Add the Angular DOM unit-testing foundation: a new `@memberjunction/ng-test-utils` package providing `renderComponentFixture` (standalone/leaf components) and `renderTemplate` (compound / module-declared components) helpers, the Vitest + jsdom DOM-testing harness, coverage reporting in the DOM preset, a `scaffold-tests.mjs --dom` flag (with a spaces-in-path fix), and DOM specs across `ng-ui-components`, `ng-pagination`, `ng-tabstrip`, and `ng-livekit-room`.

  `ng-livekit-room` is the headline pilot (now that PR #2860 is on `next`): DOM specs for the media-free leaf components (`control-bar`, `agent-state`, `connection-overlay`, `chat-panel`, `device-menu`) plus `participant-tile` as the §7 media-split worked example — the media-free surface is tested while `track.attach()` and the audio-meter `requestAnimationFrame` loop are left to live tests — on a dual node+dom preset that preserves the package's existing logic specs. The `LiveKitRoomComponent` injectable-controller refactor (the one production-code change) is deferred to the Phase 2 component rollout; the injected-fake-container pattern it would prove is already demonstrated via the `providers` seam.

  Also hardens the harness wiring flagged in review: correct `@memberjunction/ng-test-utils` devDependency declarations (`ng-tabstrip`, `ng-livekit-room`) and Turbo cache inputs covering `tsconfig.spec.json` + the root shared-harness files. Code-only, no schema changes.
  - @memberjunction/ng-whiteboard@5.43.0
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

- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
  - @memberjunction/livekit-room-core@5.42.0
  - @memberjunction/ng-whiteboard@5.42.0
