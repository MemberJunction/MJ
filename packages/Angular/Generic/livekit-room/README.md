# @memberjunction/ng-livekit-room

A **full-featured, framework-portable** Angular LiveKit room UI. Drop `<mj-livekit-room>` into any Angular
app (MemberJunction or not), give it a server URL + access token, and you get a complete conferencing
surface: participant grid/spotlight/split/audio-only layouts, A/V/screen controls, data-channel chat,
device pickers, a PreJoin lobby, active-speaker rings, per-tile audio meters, an agent-state visualizer,
cloud noise-filter/background-blur toggles, recording control, and end-to-end encryption.

Built on the pure-TS [`@memberjunction/livekit-room-core`](../../../LiveKitRoomCore). Themed with MJ design
tokens **with fallbacks**, so it looks right inside MemberJunction and still works standalone.

> For the **MemberJunction** experience (auto-minted tokens, agent room sessions via the realtime bridge),
> use [`@memberjunction/ng-mj-livekit-room`](../mj-livekit-room), which wraps this component.

## Install

```bash
npm install @memberjunction/ng-livekit-room @memberjunction/livekit-room-core livekit-client
```

## Usage

```html
<mj-livekit-room
    [ServerUrl]="'wss://livekit.myorg.com'"
    [Token]="accessToken"
    [DisplayName]="'Jordan'"
    [Layout]="'spotlight'"
    [ShowChat]="true"
    [ShowAgentState]="true"
    [EnableNoiseFilter]="true"
    (Connected)="onConnected($event)"
    (BeforeDisconnect)="confirmLeave($event)"
></mj-livekit-room>
```

All components are **standalone** — import the ones you need.

## Everything is gated by an `@Input`

Compose exactly the experience you want — a voice-only widget, a full conferencing surface, an embedded
co-agent panel — without forking the component. Public members are PascalCase (MJ convention).

| Area | Inputs |
|---|---|
| Connection | `ServerUrl`, `Token`, `DisplayName`, `AutoConnect`, `StartWithMicrophone`, `StartWithCamera` |
| Layout | `Layout` (`grid` / `spotlight` / `split` / `audio-only`), `EnableLayoutSwitcher`, `EnablePinning`, `TileMoves`, `PipRects` |
| Chrome | `ShowHeader`, `Title`, `ShowParticipantCount`, `ShowSelfView`, `SelfViewHidden`, `ShowConnectionOverlay` |
| Tiles | `ShowAudioMeters`, `ShowActiveSpeakerHighlight`, `ShowConnectionQuality`, `ShowNameBadges`, `AgentAvatarUrl` |
| Controls | `ShowControlBar`, `EnableMicrophoneControl`, `EnableCameraControl`, `EnableScreenShareControl`, `EnableDeviceSettings`, `EnableLeaveControl`, `ShowRecordingControl` |
| Panels | `ShowChat`, `ShowParticipantsPanel`, `ChatOpenByDefault` |
| PreJoin | `ShowPreJoin` |
| Agent | `ShowAgentState` |
| Whiteboard | `ShowWhiteboard` — collaborative board (reuses `@memberjunction/ng-whiteboard`), synced over the data channel; agents co-author via the same topic |
| Cloud / security | `EnableNoiseFilter`, `EnableBackgroundEffects`, `E2EEPassphrase` + `E2EEWorker` |

## Deep, cancelable event model

The core's cancelable events surface as `@Output()`s. **Before-events** are emitted synchronously, so a
handler can set `$event.Cancel = true` to veto (or mutate the payload):

```html
<mj-livekit-room
    (BeforeDisconnect)="$event.Cancel = !confirm('Leave?')"
    (BeforeSendData)="$event.Text = sanitize($event.Text)"
    (Connected)="..." (Disconnected)="..." (ParticipantJoined)="..." (DataReceived)="..." (ErrorOccurred)="..."
></mj-livekit-room>
```

Cancelable: `BeforeConnect`, `BeforeDisconnect`, `BeforeMediaToggle`, `BeforeSendData`, `BeforeDeviceSwitch`.
Notifications: `Connected`, `Disconnected`, `Reconnecting`, `Reconnected`, `ParticipantJoined`,
`ParticipantLeft`, `ActiveSpeakersChanged`, `DataReceived`, `LocalMediaChanged`, `StateChanged`,
`ChatMessage`, `ToggleRecording`, `LayoutChange`, `ErrorOccurred`, `TileMovesChange`, `PipRectsChange`,
`SelfViewHiddenChange`.

## Layouts

- **Gallery (`grid`)** — equal tiles, responsive.
- **Active speaker (`spotlight`)** — one large tile (active speaker / pinned / agent) + a filmstrip.
- **Split (`split`)** — a draggable splitter between the active screen-share and the speaker.
- **Audio only** — compact avatar tiles.

A built-in layout switcher (gated by `EnableLayoutSwitcher`) lets users change live.

## The layout a host saves

Users can rearrange the room. Each participant's tile has a "Move to…" menu (the spotlight, back among the others, or a
picture-in-picture box), and boxes can be moved and resized. Hide on the user's own tile hides their self-view: their
camera stays on, so others still see them, and a "Self-view hidden" chip offers Show.

The room hands this layout to its host as three two-way pairs, so the host can save it and give it back:

| Input | Output | Holds |
|---|---|---|
| `TileMoves` | `TileMovesChange` | Where the user moved participants' tiles |
| `PipRects` | `PipRectsChange` | Where the picture-in-picture boxes are, by participant identity |
| `SelfViewHidden` | `SelfViewHiddenChange` | Whether the user hid their self-view (`ShowSelfView` is the host's own switch) |

Bind them two-way (`[(TileMoves)]`, `[(PipRects)]`, `[(SelfViewHidden)]`); setting an input doesn't fire its output.
"Reset layout", in the "Move to…" menu, clears all three: the moves and boxes go, the self-view shows again, and the
host hears each. Without a host that saves them, they last for the session.
[`@memberjunction/ng-mj-livekit-room`](../mj-livekit-room) saves them per user.

## Sharing one panel

The Share button's menu asks the browser's picker for a screen, a window or a tab first, and lists "This panel": panels
of the page the user can share on their own. The room lists the panels marked with `mjSharePanel` (from
`@memberjunction/ng-realtime-media`) that are on screen, in page order, and leaves out any panel that contains the room.
It marks its own whiteboard, so the whiteboard is listed while it shows.

Picking a panel shares only that panel: the picker offers this tab, and the share is narrowed to the panel, with Element
Capture in Chrome and Edge 132+ or Region Capture in 104 to 131. Other browsers don't offer "This panel". While the user
shares a panel, their own tile (the share preview) says "Sharing a panel: Whiteboard". When the shared panel goes away,
for example when the whiteboard closes, the share stops; a panel that is only out of sight keeps its share.

`LiveKitControlBarComponent` takes the panels as `SharePanels`, listed when `EnableShareMenu` is on, and emits the
picked panel's key as `PanelShareRequested`.

## The agent's avatar

When an agent's bot publishes the agent's avatar (see
[`@memberjunction/livekit-room-core`](../../../LiveKitRoomCore)), the agent's tile shows the whole avatar, with black
bars where its shape differs from the tile's, and the "AI-generated video" chip. This holds in every layout and
picture-in-picture box; people's cameras still fill their tiles. It is the default of `mj-media-tile`'s `AvatarVideoFit`
(`'contain'`, in `@memberjunction/ng-realtime-media`); the room has no input for it.

When the bot says the avatar can't be shown, the room shows nothing itself. The agent's view in the room state
(`StateChanged`) carries `AvatarAudioOnly`, and [`@memberjunction/ng-mj-livekit-room`](../mj-livekit-room) shows a
notice from it.

## Components exported

`LiveKitRoomComponent`, `LiveKitParticipantTileComponent`, `LiveKitControlBarComponent`,
`LiveKitChatPanelComponent`, `LiveKitDeviceMenuComponent`, `LiveKitParticipantsPanelComponent`,
`LiveKitConnectionOverlayComponent`, `LiveKitAudioMeterComponent`, `LiveKitPreJoinComponent`,
`LiveKitAgentStateComponent`, `LiveKitWhiteboardSurfaceComponent`.

## License

Business Source License 1.1 — see [LICENSE](../../../../LICENSE) for details.
