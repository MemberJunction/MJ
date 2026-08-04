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
    [DisplayName]="'Amith'"
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
| Layout | `Layout` (`grid` / `spotlight` / `split` / `audio-only`), `EnableLayoutSwitcher`, `EnablePinning` |
| Chrome | `ShowHeader`, `Title`, `ShowParticipantCount`, `ShowSelfView`, `ShowConnectionOverlay` |
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
`ChatMessage`, `ToggleRecording`, `LayoutChange`, `ErrorOccurred`.

## Layouts

- **Gallery (`grid`)** — equal tiles, responsive.
- **Active speaker (`spotlight`)** — one large tile (active speaker / pinned / agent) + a filmstrip.
- **Split (`split`)** — a draggable splitter between the active screen-share and the speaker.
- **Audio only** — compact avatar tiles.

A built-in layout switcher (gated by `EnableLayoutSwitcher`) lets users change live.

## Components exported

`LiveKitRoomComponent`, `LiveKitParticipantTileComponent`, `LiveKitControlBarComponent`,
`LiveKitChatPanelComponent`, `LiveKitDeviceMenuComponent`, `LiveKitParticipantsPanelComponent`,
`LiveKitConnectionOverlayComponent`, `LiveKitAudioMeterComponent`, `LiveKitPreJoinComponent`,
`LiveKitAgentStateComponent`, `LiveKitWhiteboardSurfaceComponent`.

## License

ISC © MemberJunction.com
