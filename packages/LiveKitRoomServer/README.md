# @memberjunction/livekit-room-server

Server-side LiveKit support for MemberJunction: scoped **access-token minting**, the **agent-room
session-start coordinator**, and **recording (egress)** control. This is the seam between the MJ realtime
bridge and the browser LiveKit UI.

```
browser  ── GraphQL ──►  RealtimeBridgeResolver (MJServer)
                                   │
                                   ▼
        @memberjunction/livekit-room-server   ← you are here
        ├─ LiveKitTokenService          mint client + bot tokens (livekit-server-sdk)
        ├─ LiveKitAgentRoomCoordinator  open realtime session → AIBridgeEngine.StartBridgeSession
        └─ LiveKitEgressService         start/stop room recording
```

## Why it exists

The realtime bridge already joins the **agent bot** to a LiveKit room with an MJ-minted token. Two gaps
remained: (1) a **human** browser participant needs its own scoped token for the same room, and (2) nothing
outside the bridge package opened a realtime session and called `StartBridgeSession`. This package closes
both.

## Configuration

Credentials resolve from explicit config or environment variables (never inline secrets):

```bash
LIVEKIT_URL=wss://livekit.myorg.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

## Token minting (fully functional)

```typescript
import { LiveKitTokenService } from '@memberjunction/livekit-room-server';

const tokens = new LiveKitTokenService();              // reads env, or pass { ServerUrl, ApiKey, ApiSecret }
const human = await tokens.MintClientToken('support-42', 'user-abc', 'Amith');
// → { ServerUrl, Token, Identity, RoomName }  — hand Token to <mj-livekit-room>
```

## Agent-room session-start harness

`LiveKitAgentRoomCoordinator` is a `BaseSingleton`. It mints the bot token, opens the realtime model
session via an injectable factory seam, and bridges it into the room:

```typescript
import { LiveKitAgentRoomCoordinator } from '@memberjunction/livekit-room-server';

// At deployment/startup, bind the realtime-session factory (resolves a BaseRealtimeModel → IRealtimeSession):
LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(async (ctx) => openRealtimeSession(ctx));

// Then, per request:
const session = await LiveKitAgentRoomCoordinator.Instance.StartAgentRoomSession({
    AgentSessionID, RoomName: 'support-42', AgentName: 'Sage', TurnMode: 'Passive', ContextUser,
});
```

The factory is a seam (like `LiveKitBridge.SetSdkFactory`) so this package carries no heavy agent-runtime
coupling and unit-tests with a stub session. The actual native room media client (`@livekit/rtc-node`) is
bound on the bridge driver at deployment, per the realtime-bridge buildout plan.

## Recording (egress)

```typescript
import { LiveKitEgressService } from '@memberjunction/livekit-room-server';

const egress = new LiveKitEgressService();
const rec = await egress.StartRoomRecording({ RoomName: 'support-42' });   // → { EgressID, Status }
await egress.StopRecording(rec.EgressID);
```

Egress output storage (S3 / GCS / Azure / LiveKit Cloud) is configured on the LiveKit project.

## GraphQL surface

These are exposed to the browser via MJServer's `RealtimeBridgeResolver`:
`MintLiveKitClientToken`, `StartLiveKitAgentRoomSession`, `StartLiveKitRecording`, `StopLiveKitRecording`.
Call them from the browser with `GraphQLLiveKitClient` in `@memberjunction/graphql-dataprovider`.

## License

ISC © MemberJunction.com
