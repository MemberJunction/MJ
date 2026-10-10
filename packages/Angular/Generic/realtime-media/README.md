# @memberjunction/ng-realtime-media

Provider-neutral media UI for realtime calls and meeting rooms. The components render the `/media` models of
[`@memberjunction/ai-realtime-client`](../../../AI/RealtimeClient/README.md) (`MediaParticipant`, `MediaVideoSource`,
`MediaDevice`, `MediaPlacement`, `MediaPipRect`, and the agent and connection states) and emit what the user asks for.
None of them acquires media or talks to a vendor SDK, so the realtime call overlay
([`@memberjunction/ng-conversations`](../conversations/README.md)) and the LiveKit meeting room
([`@memberjunction/ng-livekit-room`](../livekit-room/README.md)) share one implementation. The `/media` types are not
re-exported here; import them from `@memberjunction/ai-realtime-client/media`.

All components and directives are standalone. The components are `OnPush`, with PascalCase inputs and outputs.

## Components and directives

| Selector | Class | What it is |
|---|---|---|
| `mj-media-tile` | `MediaTileComponent` | One participant: their video, or a picture or initials, with name, badges and chips |
| `[mjMediaTilePlaceholder]` | `MediaTilePlaceholderDirective` | Marks the host's own content for a tile with no video to show |
| `mj-media-stage` | `MediaStageComponent` | A layer that places surfaces on the stage, over a tab, in picture-in-picture boxes or out of sight |
| `ng-template[mjMediaStageSurface]` | `MediaStageSurfaceDirective` | The host's template for a surface's content |
| `ng-template[mjMediaStagePipActions]` | `MediaStagePipActionsDirective` | The host's template for the buttons on a picture-in-picture bar |
| `mj-self-view` | `SelfViewComponent` | The user's own tile, mirrored, with a Hide button |
| `mj-share-preview` | `SharePreviewComponent` | What the user is sharing, with Stop sharing and Change |
| `mj-media-controls` | `MediaControlsComponent` | Microphone, camera and Share buttons, and an optional agent-vision button |
| `mj-camera-check` | `CameraCheckComponent` | A check of the camera and microphone before anything is shared |
| `mj-media-device-menu` | `MediaDeviceMenuComponent` | Microphone, camera and speaker pickers, plus optional noise-filter and background-blur toggles |
| `mj-media-move-menu` | `MediaMoveMenuComponent` | The "Move to…" menu for one surface |
| `mj-agent-state` | `MediaAgentStateComponent` | An orb and a label for the agent's state |
| `mj-connection-overlay` | `MediaConnectionOverlayComponent` | Connecting, reconnecting, error and disconnected states, with a retry action |
| `mj-audio-meter` | `MediaAudioMeterComponent` | A bar meter fed by a level reader |
| `[mjSharePanel]` | `SharePanelDirective` | Marks an element as a panel the user can share on its own |

The package also exports `SharePanelRegistry` (a root service), `LOCAL_MEDIA_CONTROLLER_FACTORY` (an injection token),
the avatar notice wording (`AvatarNoticeText`, `AVATAR_NOTICE_TEXT`), the picture-in-picture geometry helpers, two
label helpers (`MediaAgentStateLabel`, `MediaDisconnectTitle`) and the types its inputs and outputs use.

## Tiles and stage

### `mj-media-tile`

The tile shows the participant's `PreferredVideo` when set, else a shared screen, the camera, then the avatar. Without
video it shows `AvatarUrl`, or up to two initials from the name. Over it sit the name (with a mute icon while muted
and an "AI" badge for an agent), an audio meter, connection quality, an active-speaker ring and an optional pin.

Chips sit in a row in the top-left corner, in this order:

- "AI-generated video" while the tile shows an avatar's video. An avatar is generated, and a watermark the model adds
  can't be seen, so the tile says so for as long as it shows one.
- "Sharing" while the participant shares a screen.
- "Agent can see" while `Participant.AgentCanSee` is true: the host reports that an agent can see this participant's
  camera and shared screen.
- `Status`, a short text from the host such as what an agent is doing, marked with a dot.

| Input | Default | What it does |
|---|---|---|
| `Participant` | `null` | The `MediaParticipant`. A new object with the same video source keeps the attached video; a different source replaces it. |
| `Mirror` | `false` | Mirrors the camera, as a self-view does. A shared screen or an avatar is never mirrored. |
| `Status` | `null` | The status chip's text. |
| `StallAfterMs` | `null` | Shows the picture or initials while the video has no frames (below). |
| `AvatarVideoFit` | `'contain'` | How an avatar fits. `'contain'` shows the whole frame with black bars, so a portrait avatar keeps its face in any box; `'cover'` fills the tile and crops, as every other video does. |
| `AvatarUrl` | `null` | A picture for when there is no video. |
| `Pinnable`, `IsPinned` | `false` | Show the pin button, and whether it shows as pinned. |
| `ShowName`, `ShowMeter`, `ShowConnectionQuality`, `ShowActiveSpeakerRing` | `true` | Turn those parts off. The meter shows only when the participant has `GetAudioLevel` and isn't muted. |
| `MeterSettings` | `{}` | The meter's smoothing settings, as on `mj-audio-meter`. |

Output: `TogglePin`, when the user clicks the pin.

**Out of frames.** With `StallAfterMs` set, the picture or initials show until the video's first frame, and again
after `StallAfterMs` milliseconds without a new one, until frames come back. The video stays attached underneath at
zero opacity, since a hidden video can stop sending frames. The change fades over 240 ms, with no fade under
`prefers-reduced-motion`. The "AI-generated video" chip shows only while the video does. The value is read when a video
is attached, and each new video starts out of frames. With `null`, the video always shows. An internal
`VideoFrameWatch` does the watching: it counts frames with `requestVideoFrameCallback` where the browser has it, else a
moving playback position (`timeupdate`), and it runs outside Angular's zone, entering it only when the state changes.

**Content.** Content marked `mjMediaTilePlaceholder` replaces the picture or initials wherever they would show; import
`MediaTilePlaceholderDirective` with the tile. Content marked `mjMediaTileActions`, such as an `mj-media-move-menu`,
sits in the top-right corner before the pin. The corner's actions and the pin show on hover or focus; a pinned tile's
pin stays shown.

**Size.** The tile fills its host, with a minimum height of `--mj-media-tile-min-height` (120px by default). A host
lowers it for a small frame, such as a picture-in-picture box.

### `mj-media-stage`

The stage shows each surface (a whiteboard, a remote browser, the agent's video) where its placement says, without
moving it in the DOM. Each surface's content is created once per key from the host's `mjMediaStageSurface` template,
and kept while its key is in `Surfaces`; a change of placement only changes where it is and how big. A whiteboard keeps
its view, a stream keeps playing, and nothing reloads. When a key leaves the list, its content is destroyed.

The host puts the stage in a positioned element over the area it covers. The stage fills that element
(`position: absolute; inset: 0`), and only its surfaces take pointer input. The placements (`MediaPlacement`, also
exported as `MediaStagePlacement`):

- `stage` fills the stage, or covers `StageSlot` when the host gives one (such as the agent's place in a call). It is
  out of sight while that slot has no size.
- `tab` covers `TabSlot`, the element the host's tab panel keeps for the active tab, while the surface's key is
  `ActiveTabKey`. It is out of sight otherwise, and while the slot is missing or has no size.
- `pip` floats in a picture-in-picture box.
- `hidden` stays alive, out of sight.

While the stage itself has no size (a hidden ancestor, such as a minimized call), every surface is out of sight.

A `ResizeObserver` follows the stage and both slots. When a slot input changes, the stage measures again once the
current change-detection pass is over (so a slot sized by its own bindings works), then follows the slot frame by frame
for 600 ms, so a panel sliding in is tracked. Measuring runs outside Angular's zone and enters it only when a box
changed.

| Input | What it does |
|---|---|
| `Surfaces` | The `MediaStageSurface` list: `Key`, `Placement`, and optional `Label` (the picture-in-picture bar's title; the key by default) and `PipIndex` |
| `ActiveTabKey` | The key of the surface whose tab is active |
| `TabSlot` | The element the active tab's surface covers, or `null` |
| `StageSlot` | The element a `stage` surface covers, or `null` (the default) to fill the stage |
| `PipRects` | Where the user put picture-in-picture boxes, by key |

Output: `PipRectChange` (`MediaStagePipRectChange`: `{ Key, Rect }`).

The surface template receives the key as `let-key`, `Visible` (on screen now: its placement shows it and the stage has
a size) and `Placement`, typed as `MediaStageSurfaceContext`. A host passes `Visible` on so a surface can pause work
nobody sees. The `mjMediaStagePipActions` template receives the key as `let-key` (`MediaStagePipActionsContext`).

**Picture-in-picture.** A `pip` box has a bar with its `Label` and the host's `mjMediaStagePipActions` buttons. The
user drags the box by its bar, resizes it from its bottom-right corner, or focuses the bar and moves it with the arrow
keys, 16 px a press; Shift with an arrow key resizes it. A press or a key on a button in the bar is left to the button.
The box touched last sits on top. For assistive technology, the bar is named after the label ("Whiteboard,
picture-in-picture") and described by a hidden hint on how to move and resize it.

Boxes stay inside the stage, no smaller than 200×120 px unless the stage is smaller. Until the user moves one, a box
is 320×200 px and stacks upward from the bottom-right corner by `PipIndex` (0, the newest, sits in the corner).

`PipRects` holds boxes as fractions of the stage (`MediaPipRect`: `X`, `Y`, `W`, `H`, each 0 to 1), so a layout
survives a resized window. A box with no entry stacks by its `PipIndex`, and setting `PipRects` replaces every box.
When a drag or a resize moved a box, or an arrow key was pressed on its bar, `PipRectChange` reports where it is now,
for the host to save. `MediaPipRect` comes from `@memberjunction/ai-realtime-client/media`, which also saves and loads
these boxes (`MediaLayoutPrefs`, `ParsePipRects`, `SerializePipRects`).

A host imports `MediaStageComponent`, `MediaStageSurfaceDirective` and `MediaStagePipActionsDirective` (and here
`MediaMoveMenuComponent`):

```html
<!-- Inside a positioned element. Surfaces is, for example:
     [{ Key: 'whiteboard', Label: 'Whiteboard', Placement: 'tab' },
      { Key: 'browser', Label: 'Browser', Placement: 'pip', PipIndex: 0 }] -->
<div class="tab-body" #tabBody></div>
<mj-media-stage
  [Surfaces]="Surfaces"
  [TabSlot]="tabBody"
  ActiveTabKey="whiteboard"
  [PipRects]="PipRects"
  (PipRectChange)="SavePipRect($event)"
>
  <ng-template mjMediaStageSurface let-key let-visible="Visible">
    <!-- The host's own component for a surface. -->
    <app-surface [SurfaceKey]="key" [Paused]="!visible"></app-surface>
  </ng-template>
  <ng-template mjMediaStagePipActions let-key>
    <mj-media-move-menu [Key]="key" Placement="pip" (MoveRequested)="Move($event)"></mj-media-move-menu>
  </ng-template>
</mj-media-stage>
```

### Picture-in-picture geometry

The stage's box math is exported, framework-free, for a host that places or saves boxes itself. A box is pixels
relative to the stage's top-left corner (`MediaStageBox`: `Left`, `Top`, `Width`, `Height`), in a stage of
`MediaStageSize` (`Width`, `Height`).

| Helper | Returns |
|---|---|
| `DefaultPipBox(index, stage)` | Where a box goes before the user moves it |
| `ClampPipBox(box, stage)` | The box inside the stage, between the minimum size and the stage's size |
| `MovePipBox(box, dx, dy, stage)` | The box moved, kept inside |
| `ResizePipBox(box, dw, dh, stage)` | The box resized from its bottom-right corner, kept inside |
| `PipBoxToRect(box, stage)` | The box as fractions of the stage, for saving; all zeros for a stage with no size |
| `PipRectToBox(rect, stage)` | A saved box in whole pixels for the stage's current size, kept inside |

The sizes are constants: `PIP_DEFAULT_WIDTH` and `PIP_DEFAULT_HEIGHT` (320 and 200), `PIP_MIN_WIDTH` and
`PIP_MIN_HEIGHT` (200 and 120), `PIP_MARGIN` (16, from the stage's edge), `PIP_GAP` (8, between stacked boxes) and
`PIP_KEY_STEP` (16, one arrow key press).

## Self-view, share preview and controls

The meeting room uses `mj-self-view` and `mj-share-preview` for the user's own tile, and the call overlay uses them
for the user's camera and share.

### `mj-self-view`

An `mj-media-tile` with `Mirror` on, so the camera shows as in a mirror (a shared screen does not), and no pin.

- `AgentCanSee` shows "Agent can see this" while the host knows the user's frames reach an agent. The tile's own
  "Agent can see" chip still follows `Participant.AgentCanSee`, in the same corner.
- `ShowHide` (on by default) shows a Hide button that emits `HideRequested`. The host takes the tile away; the camera
  stays on, so others still see the user.
- `Participant`, `AvatarUrl`, `MeterSettings`, `ShowName`, `ShowMeter`, `ShowConnectionQuality` and
  `ShowActiveSpeakerRing` pass to the tile.
- Content marked `mjMediaTileActions` goes to the tile's corner, before Hide.

### `mj-share-preview`

What the user is sharing, shown whole and not mirrored, framed in the brand color, with Stop sharing and Change. The
host stops the share, or opens the browser's picker again.

- `Source` is the share's `MediaVideoSource`; a different source replaces the shown one.
- `Surface` (`CapturedDisplaySurface`) sets the label: "Sharing your entire screen", "Sharing a window", "Sharing a
  browser tab", or "Sharing your screen" for `'unknown'`.
- `PanelLabel` is set when the user shares one panel of the page; the label then names the panel, as in "Sharing a
  panel: Whiteboard".
- `ShowChange` (on by default) shows Change.
- Outputs: `StopRequested`, `ChangeRequested`.
- Content marked `mjMediaTileActions` sits in the top-right corner, shown on hover or focus, as on a tile.

### `mj-media-controls`

A call's microphone, camera and Share buttons and, when the host shows it, a button that lets an agent see the user's
camera and shared screen. It shows what is on and emits what the user asks for; the host starts or stops the media.
Each button is a circle named by what a click does, such as "Mute microphone" or "Turn on camera".

| Input | Default | What it does |
|---|---|---|
| `MicrophoneOn`, `CameraOn`, `Sharing` | `false` | What is on now. The microphone and camera buttons are red while off; Share is filled while sharing. |
| `ShowMicrophone`, `ShowCamera`, `ShowShare` | `true` | Show each button. |
| `ShowShareMenu` | `true` | Show the Share button's arrow and its menu. |
| `SharePanels` | `[]` | Panels the user can share on their own (`MediaSharePanel`: `Key`, `Label`, optional `Icon`), offered under "This panel". |
| `Size` | `'md'` | The circles' size: `'sm'`, `'md'` or `'lg'` (32, 44 or 52 px). The Share arrow stays small. |
| `ShowLabels` | `false` | A label under each button: Mute or Unmute, Video or Stop video, Share or Stop sharing, Show agent or Hide from agent. |
| `CameraOptional` | `false` | For a call where the camera usually stays off, such as one with an agent: the camera button is neutral while off and filled while on, instead of red while off. |
| `ShowAgentVision`, `AgentVisionOn` | `false` | Show the agent-vision button, and whether it is on (filled). |

Outputs: `MicrophoneToggled(boolean)` and `CameraToggled(boolean)`, each with the state asked for;
`ShareRequested(MediaShareRequest)`; `StopShareRequested`; and `AgentVisionToggled(boolean)`. The agent-vision button
only reports; the host does what the user asks.

Share is a split button. Its main part asks for a share with no preference, `{ Kind: 'display' }`, or emits
`StopShareRequested` while the user shares. Its arrow opens a menu: Entire screen, Window and Browser tab ask for
`{ Kind: 'display', PreferredSurface }` (`'screen'`, `'window'` or `'tab'`, the kind the browser's picker offers
first), and when `SharePanels` lists any, a "This panel" submenu asks for `{ Kind: 'panel', PanelKey }`. The arrow
hides while the user shares. The menus are `mj-menu` from `@memberjunction/ng-ui-components`.

## Camera check

### `mj-camera-check`

A look at the camera and a listen to the microphone before anything is shared: a mirrored preview with a level meter,
microphone and camera buttons (`mj-media-controls` without Share), microphone and camera pickers, an optional name
field, and a confirm button. The host runs the preview: it passes the camera as `CameraSource` and the level as
`MicrophoneLevel`, and starts, stops or switches devices when the check asks. While the camera is on and its source
hasn't come, the preview says "Starting camera…"; while it is off, "Camera off".

| Input | Default | What it does |
|---|---|---|
| `CameraSource` | `null` | The camera's `MediaVideoSource`. |
| `MicrophoneLevel` | `null` | Reads the microphone's level, 0 to 1. The meter shows while the microphone is on and a reader is given. |
| `MicrophoneOn`, `CameraOn` | `true`, `false` | What is on now. |
| `Devices` | `[]` | The devices to pick from. Speakers are left out, and a kind with none has no picker. |
| `SelectedMicrophoneID`, `SelectedCameraID` | `null` | The picked devices. |
| `ShowDeviceSelection` | `true` | Show the pickers. |
| `ShowControls` | `true` | Show the microphone and camera buttons. |
| `ShowDisplayName`, `RequireDisplayName` | `false` | Ask for a name, and keep the confirm button off until one is typed. |
| `InitialDisplayName` | none | The name the field starts with. |
| `Heading` | `'Ready to join?'` | The heading; none when empty. |
| `ConfirmLabel` | `'Continue'` | The confirm button's label. |
| `CancelLabel` | `''` | When set, a button after the confirm button that emits `Cancelled`. |
| `MeterSettings` | `{}` | The meter's smoothing settings. |

Outputs: `MicrophoneToggled(boolean)`, `CameraToggled(boolean)`, `DeviceSelected(MediaDeviceSelection)`, `Cancelled`,
and `Confirmed(MediaCameraCheckChoices)`, which carries `DisplayName` (trimmed; empty when no name was asked for),
`MicrophoneOn`, `CameraOn`, and `MicrophoneID` and `CameraID` when picked.

To check the camera alone, pass only cameras in `Devices` and no `MicrophoneLevel`, and turn `ShowControls` off; a
`CancelLabel` gives the user a way out. The call's camera check is built this way.

## Menus

### `mj-media-device-menu`

A "Devices" panel with microphone, camera and speaker pickers and a close button. A kind with no devices is left out,
and the host switches the device.

Inputs: `Devices`, `SelectedMicrophoneID`, `SelectedCameraID`, `SelectedSpeakerID`; `ShowNoiseFilter` and
`ShowBackgroundBlur` (off by default) add the toggles, with `NoiseFilterEnabled` and `BackgroundBlurEnabled` as their
state. Outputs: `DeviceSelected(MediaDeviceSelection)`, `NoiseFilterToggled(boolean)`,
`BackgroundBlurToggled(boolean)`, `Close`.

### `mj-media-move-menu`

The "Move to…" menu for one surface, behind a ⋮ button. It lists the places the surface may go, always in the order
stage, picture-in-picture, tab, hidden, each with its own icon and the current one disabled, then "Reset layout". The
call shows it for its channels' surfaces and the meeting room for its participants' tiles.

- `Key` (required): the surface's key, sent back with the request.
- `Title`: the surface's name, for the accessible names of the button ("Move Whiteboard") and the menu.
- `Placement` (default `'tab'`): where the surface is now.
- `Allowed` (default every placement): where it may go.
- `Labels`: the host's names for some places, such as `{ stage: 'Spotlight' }`. A place it leaves out keeps its name
  from `MEDIA_MOVE_LABELS`: Stage, Picture-in-picture, Tab, Hide.
- `OverVideo`: for a button over a picture, such as in a tile's corner. It takes the dark round scrim of the tile's
  pin.
- Outputs: `MoveRequested(MediaMoveRequest)`, which is `{ Key, Placement }`, and `ResetLayoutRequested`, which asks the
  host to put everything back where it places it.

## Agent state, connection and meter

### `mj-agent-state`

An orb and a label such as "Agent · listening" (`AgentName`, then the state) for `State` (`MediaAgentState`: idle,
listening, thinking, speaking). Inputs: `State`, `AgentName` (default "Agent"), `ShowLabel` (on by default).
`MediaAgentStateLabel(state)` gives the label's words. The speaking pulse stops under `prefers-reduced-motion`.

### `mj-connection-overlay`

A full-surface overlay for `Status` (`MediaConnectionStatus`): connecting, reconnecting, an error showing
`ErrorMessage` with "Try again", or a disconnect titled by `DisconnectReason`, with "Rejoin" unless `AllowRetry` is
off. Both buttons emit `Retry`. It is meant for those four states; for `idle` or `connected` it reads "Ready to
connect". `MediaDisconnectTitle(reason)` gives the title for each `MediaDisconnectReason`.

### `mj-audio-meter`

Bars fed by `Level`, a reader `() => number` that returns 0 to 1; `null` stops the meter. It reads the level on every
animation frame outside Angular and writes the bar heights straight to the DOM, so it never runs change detection. The
shared `AudioLevelSmoother` from `/media` smooths it. `Settings` (`MediaAudioMeterSettings`) sets the bar count (7 by
default), attack, decay and silence floor; a change starts the bars over.

## Avatar notice

When a call or a meeting shows no avatar its agent asked for, it says why in one line. The words live here so the
call and the meeting say the same: `AvatarNoticeText(reason, overrides?, agentName?, options?)` returns the line for a
`RealtimeAvatarUnavailableReason` from `@memberjunction/ai`. `AVATAR_NOTICE_TEXT` holds the stock lines. Each leads
with "Audio only" and names no model or vendor. `{Agent}` stands for the agent's name, or "the agent" when none is
given.

| Reason | When | Line |
|---|---|---|
| `endpoint` | The model, on its endpoint, renders no avatar | Audio only: this voice model can't show an avatar |
| `no-binding` | The persona has no avatar on this vendor | Audio only: this agent has no avatar for this voice model |
| `unknown-avatar` | The request names no avatar the vendor knows | Audio only: the chosen avatar wasn't found |
| `custom-disabled` | Custom avatars are not enabled | Audio only: custom avatars aren't turned on |
| `host` | The app showing the call asked for no agent video | Audio only: this app can't show the avatar |
| `browser` | The browser couldn't play the avatar | Audio only: this browser can't play the avatar |
| `bridged` | The session runs on a server (a meeting or a phone call) whose host can't publish video | Audio only for {Agent}: the avatar can't be shown in this meeting |
| `decoder-missing`, `decoder-failed`, `publish-failed` | The meeting's host has no usable decoder, its decoders kept failing, or the room refused the bot's video track | Audio only for {Agent}: the avatar couldn't be shown in this meeting |

- **The meeting form.** `{ NameAgent: true }` names the agent on every stock line: "Audio only:" becomes "Audio only
  for {Agent}:". The meeting room passes it, since several agents there can be audio only; the call doesn't.
- **An unknown reason.** For a reason this version doesn't know, such as a newer bot's, pass `null`. The line is
  `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`, "Audio only for {Agent}: the avatar couldn't be shown in this meeting", with or
  without `NameAgent`. A host can't replace it.
- **A host's own words.** `overrides` (`AvatarNoticeOverrides`) maps some reasons to the host's own lines, such as its
  product's name for "this app". They are used as written, with `{Agent}` filled in; `NameAgent` doesn't change them.
  A reason left out, or given a blank line, keeps the stock line, so a notice is never empty. The call overlay
  (`mj-realtime-session-overlay`) and the meeting room (`mj-livekit-agent-room`) take these as their
  `AvatarNoticeLabels` input.

## Share panels

The user can share one panel of the page instead of a screen, a window or a tab, where the browser can: Chrome and
Edge on the desktop.

**`[mjSharePanel]`** (`SharePanelDirective`) marks its element as a panel:
`<div mjSharePanel="Whiteboard" mjSharePanelIcon="fa-solid fa-chalkboard">`. The label is the panel's name in the
Share menu and in the share preview; `mjSharePanelIcon` takes Font Awesome classes for its menu item. An empty or
`null` label leaves the element unmarked, so a host can bind it conditionally:
`[mjSharePanel]="shareable ? title : null"`. The directive adds no style, class or ARIA and moves no focus. It
registers the element with `SharePanelRegistry`, and takes it off when the element goes away.

**`SharePanelRegistry`** is one service for the app (`providedIn: 'root'`), so a panel marked in the app's shell and a
Share menu inside a call meet without knowing each other.

- `PanelsFor$(host)` streams what a Share menu inside `host` offers, as `MediaSharePanel[]` for `mj-media-controls`'
  `SharePanels`: the panels on screen, in page order, leaving out any panel that contains `host` (sharing it would
  show the call its own controls). It gives the current list at once, then each list that differs.
- On screen means the panel's box overlaps the viewport with some area, as one `IntersectionObserver` reports it. A
  panel scrolled away, collapsed or hidden (`display: none`) is left out; what lies over a panel doesn't count.
  Without `IntersectionObserver`, every registered panel counts as on screen.
- `Supported` says whether the browser can share one panel: `getDisplayMedia` plus Element or Region Capture. Where
  it can't, `PanelsFor$` lists nothing, so no menu offers "This panel".
- `Get(key)` returns the picked panel (`SharePanelEntry`: `Key`, `Label`, `Icon`, `Element`), or `null` once it is
  gone.
- `Removed$` emits a panel's key when it is taken off the registry.
- `Register(element, label, icon?)` returns a `SharePanelRegistration` (`Key`, `Update(label, icon)`, `Unregister()`);
  the directive calls it for you. Each registration gets its own key, so two panels may have the same label.
- Changes reach `PanelsFor$` and `Removed$` in a microtask: a panel that registers or goes away while Angular renders
  changes a menu in the next pass, not in the one under way.

**How the hosts use them.** The call overlay marks a channel's frame on its stage when the channel opts in (the
whiteboard does), the meeting room marks its whiteboard, and Explorer's shell marks its main content area "Main
content". The call and the meeting room each subscribe to `PanelsFor$` with their own element and pass the list to
their Share button. On a `{ Kind: 'panel' }` request, the host looks the panel up with `Get` and shares its `Element`
with its `Label`, which `mj-share-preview` shows as "Sharing a panel: Whiteboard". When `Removed$` reports the panel
being shared, the host stops the share; a panel only out of sight keeps it. The capture is the realtime client's
(`/media`): it narrows a share of this tab to the panel with Element Capture where the browser has it, else Region
Capture, and gives the panel `isolation: isolate` while it is shared.

## Local media controller

`LOCAL_MEDIA_CONTROLLER_FACTORY`, an `InjectionToken<() => ILocalMediaController>` provided in root, makes the
camera-and-microphone controller a host runs a preview on, such as a lobby's `MediaPreview` (both from `/media`). By
default it makes the browser's `LocalMediaController`. A test provides a fake, and a host on another platform its own:
`{ provide: LOCAL_MEDIA_CONTROLLER_FACTORY, useValue: () => new FakeLocalMediaController() }`. It is a factory, not one
shared controller, because each lobby or preview owns its controller and disposes it. No component here injects it;
the meeting room's lobby does.

## Rules the components follow

- **A tile never plays audio.** A voice must not stop because its tile left the screen, so the host plays each voice
  once, outside the layout. Video is attached with `AttachVideoSource`, and the tile, the share preview and the camera
  check reattach only when the source object changes. Adapters should hand out the same source for the same track (the
  LiveKit one, `ToMediaParticipant` in `@memberjunction/livekit-room-core`, does).
- **Each host keeps its own meter feel.** `mj-audio-meter`, the tile and the camera check take smoothing settings (bar
  count, attack, decay, silence floor); the LiveKit room passes the values its meter has always used
  (`LIVEKIT_METER_SETTINGS`).
- **Frequent work stays outside Angular.** The meter's frames, the tile's frame watch, the stage's slot following and
  a picture-in-picture drag run outside Angular's zone. The meter never enters it; the others enter it only when
  something shown changes.
- **No vendor imports.** The source may import `@angular/core`, `@angular/common`, `@angular/forms`,
  `@memberjunction/ng-ui-components`, the `/media` entry of the realtime client, `@memberjunction/ai` (vendor-neutral
  Core types, such as the avatar reasons) and `rxjs` (the share-panel registry streams its panels), nothing else: not
  `livekit-client`, not the router, not the realtime client's main entry, which carries the provider drivers.
  `src/__tests__/import-boundary.test.ts` enforces it.

## Styling

The components use the semantic `--mj-*` tokens, the `mjButton` directive and `mj-menu`, so the host application must
load the MemberJunction token stylesheet and `button.scss` from
[`@memberjunction/ng-ui-components`](../ui-components/README.md); `mj-menu` carries its own styles. Video is
letterboxed in black and text over video sits on a dark scrim, in both themes. `--mj-media-tile-min-height` sets a
tile's minimum height (120px by default).

## Tests

`pnpm test` runs two projects. The node project runs `src/__tests__`: the import-boundary check and the specs for the
avatar notice wording, the picture-in-picture geometry and `VideoFrameWatch`. The DOM project (jsdom) runs the spec
next to each component and next to the share-panel registry and directive; a file it compiles must be listed in
`tsconfig.spec.json`. Video in the DOM specs uses element sources that only record calls; real media is checked live.
jsdom has no `requestVideoFrameCallback`, so the tile's frame specs define one on `HTMLVideoElement.prototype` and
deliver frames by calling it.
