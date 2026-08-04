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
<mj-livekit-agent-room [Mode]="'join'" [RoomName]="'support-42'" [DisplayName]="'Amith'"></mj-livekit-agent-room>
```

## What it adds over the generic component

- **Token resolution** — calls `GraphQLLiveKitClient.MintClientToken` / `StartAgentRoomSession`; you never
  handle LiveKit credentials in the browser.
- **Agent sessions** — `Mode="agent"` starts the agent's presence in the room via the realtime bridge and
  emits `SessionStarted` with the bridge id.
- **Server-authorized recording** — `EnableRecording` wires the record button to the egress mutations.
- **Multi-provider** — extends `BaseAngularComponent`; pass `[Provider]` to scope to a specific MJ server.

## Inputs

`Mode` (`agent` / `join`), `AgentID`, `AgentName`, `RoomName`, `DisplayName`, `TurnMode`, `AutoStart`,
plus pass-through gates: `Layout`, `Title`, `ShowHeader`, `ShowControlBar`, `ShowChat`,
`ShowParticipantsPanel`, `EnablePinning`, `EnableLayoutSwitcher`, `EnableNoiseFilter`,
`EnableBackgroundEffects`, `ShowAgentState`, `ShowPreJoin`, `EnableRecording`, `StartWithMicrophone`,
`StartWithCamera`, `AgentAvatarUrl`, `E2EEPassphrase`, `E2EEWorker`, and the device-control gates.

## Outputs

`SessionStarted`, `Connected`, `Disconnected`, `ParticipantJoined`, `ParticipantLeft`, `DataReceived`,
`ErrorOccurred`.

## In Explorer

`@memberjunction/ng-explorer-core` registers a `LiveKitRoomResource` (`DriverClass = 'LiveKitRoomResource'`)
that hosts this component as a tab — add a nav item with that driver class to surface it in an app.

## License

ISC © MemberJunction.com
