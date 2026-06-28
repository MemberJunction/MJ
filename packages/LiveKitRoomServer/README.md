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

> **Where the LiveKit server comes from — see [`docker/livekit/README.md`](../../docker/livekit/README.md) (canonical setup guide):**
> - **Local dev:** spin up a throwaway LiveKit server with matching dev creds — Docker (`docker compose up -d`) for
>   browser-only testing, or native `livekit-server --config docker/livekit/livekit.yaml` for the agent-bot path on
>   macOS. Then `LIVEKIT_URL=ws://localhost:7880` / `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=mj-local-dev-livekit-secret-0123456789`.
> - **Production / real-world:** use [**LiveKit Cloud**](https://cloud.livekit.io) — a hosted `wss://…livekit.cloud`
>   URL + API key + secret to drop into `.env`, no server to run (or a properly-networked self-host).

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
const done = await egress.StopRecording(rec.EgressID);
// On stop/complete, RecordingInfo also surfaces the produced file:
//   done.OutputLocation    – the file's path/key in the egress sink
//   done.OutputSizeBytes   – byte count
//   done.OutputDurationMs  – duration in ms (normalized from the SDK's nanoseconds)
// These are what the server registers into MJStorage on the Meeting-Room Conversation
// (Conversation.RecordingFileID + EgressID). While recording is in progress they are undefined.
```

Egress output storage (S3 / GCS / Azure / LiveKit Cloud) is configured on the LiveKit project.

## Meeting-recording registration (egress → MJStorage → Conversation)

When the browser stops a room recording, MJServer's `RealtimeBridgeResolver.StopLiveKitRecording` calls
`registerMeetingRecordingFile` (`packages/MJServer/src/resolvers/meetingRecordingRegistration.ts`), which:

1. Resolves the room's **Meeting-Room Conversation** (by `EgressID`, then room name, else creates one).
2. Creates an **`MJ: Files`** row for the egress MP4 (`ProviderKey` = `OutputLocation`, `ContentType =
   video/mp4`, `Status = Uploaded`). **v1 points the Files row directly at the egress output — no byte
   copy** — so playback streams straight from the sink.
3. Stamps **`Conversation.RecordingFileID`** (+ `EgressID`) and returns the new file id on the result.

This requires the egress sink and the MJStorage account to target the **same** bucket/container, configured
via the provider:

- `MJ_MEETING_RECORDING_STORAGE_PROVIDER=<MJ: File Storage Providers ID>` (or
  `meetingRecordingStorageProviderID` in `mj.config.cjs`).

Optional **copy-to-canonical** ("copy into Box") — set a *different* canonical provider via
`MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER` (or `meetingRecordingCanonicalStorageProviderID`) to read
the bytes out of the sink and re-upload them into a separate provider, pointing the Files row there. OFF by
default.

Registration is **best-effort**: a missing storage provider or any failure leaves `RecordingFileID` unset
and logs — the stop-recording mutation still succeeds. See
[REALTIME_SESSION_CAPTURE_GUIDE.md](../../guides/REALTIME_SESSION_CAPTURE_GUIDE.md#meeting-room-recording-livekit-egress--mjstorage)
for the full loop incl. Meet-app playback.

## GraphQL surface

These are exposed to the browser via MJServer's `RealtimeBridgeResolver`:
`MintLiveKitClientToken`, `StartLiveKitAgentRoomSession`, `StartLiveKitRecording`, `StopLiveKitRecording`
(returns `RecordingFileID` once registered). Call them from the browser with `GraphQLLiveKitClient` in
`@memberjunction/graphql-dataprovider`.

## License

ISC © MemberJunction.com
