# @memberjunction/ng-mj-livekit-room

The **MemberJunction binding** for the LiveKit room UI. `<mj-livekit-agent-room>` wraps the portable
[`@memberjunction/ng-livekit-room`](../livekit-room) component and connects it to MJ's realtime-bridge
infrastructure: it mints a scoped access token (and optionally starts an **agent room session**) via the
`RealtimeBridge` GraphQL surface, threads MJ user/provider context, and forwards every feature gate.

```
@memberjunction/ng-mj-livekit-room   ← you are here (MJ-aware, app-agnostic)
        ▲ wraps
@memberjunction/ng-livekit-room       (portable UI)
        ▲ calls
RealtimeBridgeResolver (MJServer) ──► @memberjunction/livekit-room-server
```

## Usage

```html
<!-- Start an agent in a room and join it -->
<mj-livekit-agent-room
    [Mode]="'agent'"
    [AgentID]="agentId"
    [AgentName]="'Sage'"
    [Provider]="Provider"
    [ShowAgentState]="true"
    [EnableRecording]="true"
    (SessionStarted)="onSessionStarted($event)"
></mj-livekit-agent-room>

<!-- Or just join an existing room -->
<mj-livekit-agent-room [Mode]="'join'" [RoomName]="'support-42'" [DisplayName]="'Jordan'"></mj-livekit-agent-room>
```

## What it adds over the generic component

- **Token resolution** — calls `GraphQLLiveKitClient.MintClientToken` / `StartAgentRoomSession`; you never
  handle LiveKit credentials in the browser.
- **Agent sessions** — `Mode="agent"` starts the agent's presence in the room via the realtime bridge and
  emits `SessionStarted` with the bridge id.
- **Server-authorized recording** — `EnableRecording` wires the record button to the egress mutations.
- **Multi-provider** — extends `BaseAngularComponent`; pass `[Provider]` to scope to a specific MJ server.
- **Saved layout** — the user's layout of the room is saved per user (see [Saved layout](#saved-layout)).
- **Avatar notices** — when an agent's bot says the agent's avatar can't be shown, the room shows one info notice per
  agent per join, such as "Audio only for Sage: the avatar can't be shown in this meeting". The user can dismiss it; it
  also hides after 10 seconds or when the agent leaves, and doesn't show again in that join. A reconnect is the same
  join; a disconnect or "Try again" starts a new one. `AvatarNoticeLabels` (`AvatarNoticeOverrides` from
  `@memberjunction/ng-realtime-media`) gives a host's own line per reason, shown as written with `{Agent}` for the
  agent's name. A reason it leaves out, or one the room doesn't know, gets the stock line.

## Inputs

`Mode` (`agent` / `join` / `preview`), `AgentID`, `AgentName`, `RoomName`, `DisplayName`, `TurnMode`, `AutoStart`,
`AvatarNoticeLabels`, plus pass-through gates: `Layout`, `Title`, `ShowHeader`, `ShowControlBar`, `ShowChat`,
`ShowParticipantsPanel`, `EnablePinning`, `EnableLayoutSwitcher`, `EnableNoiseFilter`,
`EnableBackgroundEffects`, `ShowAgentState`, `ShowPreJoin`, `EnableRecording`, `StartWithMicrophone`,
`StartWithCamera`, `AgentAvatarUrl`, `E2EEPassphrase`, `E2EEWorker`, and the device-control gates.

## Outputs

`SessionStarted`, `Connected`, `Disconnected`, `ParticipantJoined`, `ParticipantLeft`, `DataReceived`,
`ErrorOccurred`.

## Saved layout

The binding saves the user's room layout in `MJ: User Settings`, per user and for every room: where they moved
participants' tiles, where they put picture-in-picture boxes, and whether they hid their self-view. It loads the layout
when it starts, gives it to the room, and saves each change the room reports, through `MediaLayoutPrefs` from
`@memberjunction/ai-realtime-client/media`. The preview room (`Mode="preview"`) saves under its own keys, so trying it
never changes a meeting's layout.

| Saved | Meetings | Preview room |
|---|---|---|
| Tile moves | `mj.livekit.placement.v1` (`LIVEKIT_PLACEMENT_PREF_KEY`) | `mj.livekit.preview.placement.v1` (`LIVEKIT_PREVIEW_PLACEMENT_PREF_KEY`) |
| Picture-in-picture boxes | `mj.livekit.pip.v1` (`LIVEKIT_PIP_PREF_KEY`) | `mj.livekit.preview.pip.v1` (`LIVEKIT_PREVIEW_PIP_PREF_KEY`) |
| Self-view hidden | `mj.livekit.selfView.hidden.v1` (`LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY`) | `mj.livekit.preview.selfView.hidden.v1` (`LIVEKIT_PREVIEW_SELF_VIEW_HIDDEN_PREF_KEY`) |

Only a saved `true` hides the self-view; nothing saved, `false` or any other value shows it. Show and Reset layout save
`false`. When saving fails, the change still holds for the session.

## In Explorer

`@memberjunction/ng-explorer-core` registers a `LiveKitRoomResource` (`DriverClass = 'LiveKitRoomResource'`)
that hosts this component as a tab — add a nav item with that driver class to surface it in an app.

## License

Business Source License 1.1 — see [LICENSE](../../../../LICENSE) for details.
