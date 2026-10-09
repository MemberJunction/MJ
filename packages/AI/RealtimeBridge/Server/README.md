# @memberjunction/ai-bridge-server

Server-tier **coordination + execution** for MemberJunction Realtime Bridges. This package completes
the realtime engine's long-deferred **unified media-transport seam** — the pipe that connects a
bridge driver's media plane to a realtime agent session — and adds the bot-session lifecycle, host
affinity + janitor, participant tracking, and turn-taking integration around it.

It is the server half of the `AIBridgeEngineBase` / `AIBridgeEngine` pair, exactly mirroring how
`@memberjunction/aiengine`'s `AIEngine` builds on `@memberjunction/ai-engine-base`'s `AIEngineBase`.
The cross-platform, metadata-only base (provider/identity/channel cache, the abstract
`BaseRealtimeBridge` driver, `TurnTakingPolicy`, media-track types) lives in
[`@memberjunction/ai-bridge-base`](../Base); this package adds everything that actually *runs* a
bridged session.

> See the architecture plan at `/plans/realtime/realtime-bridges-architecture.md` (§1 transport seam,
> §2 layer cake, §7 lifecycle, §10 security/janitor) for the full design.

## What's in the box

| Export | Purpose |
|---|---|
| `AIBridgeEngine` | The server engine. Extends `AIBridgeEngineBase`; starts/stops bridged sessions, **wires the transport seam**, tracks participants, integrates turn-taking, reconciles orphans. Singleton via `AIBridgeEngine.Instance`. |
| `LoopbackBridge` | An in-memory, platform-free bridge driver (`@RegisterClass(BaseRealtimeBridge, 'LoopbackBridge')`) that echoes outbound media back inbound — proves the seam round-trips with zero external infrastructure. |
| `StartBridgeSessionParams` / `ActiveBridgeSession` | The start contract + the live in-memory session handle. |
| `IHostInstanceIdentity` / `DefaultHostInstanceIdentity` | The injectable host-instance identity used for `HostInstanceID` stamping + janitor affinity (host apps inject the real one; a default is provided for standalone use). |
| `LoadLoopbackBridge` | Tree-shaking-prevention loader for the loopback driver. |

## Installation

```bash
npm install @memberjunction/ai-bridge-server
```

## The transport seam (the heart)

The realtime session contract (`IRealtimeSession` in `@memberjunction/ai`) is already
media-agnostic — `SendInput(frame)` is what the agent hears (and sees), `OnOutput(handler)` is what it says,
`OnVideoFrame(handler)` is the video it shows — but it had **no client-facing pipe**. A bridge *is* that pipe.
`AIBridgeEngine.wireTransportSeam` connects the two directions:

```typescript
// Inbound: endpoint media → the agent hears (and, for a video model, sees) it.
bridge.OnMedia((frame) => {
    const chunk = frameToArrayBuffer(frame);     // unwrap BridgeMediaFrame → ArrayBuffer
    const kind = mediaKindOf(frame.Track);       // 'video' for video-in and screen-in, else 'audio'
    if (chunk) realtimeSession.SendInput({ Data: chunk, Kind: kind, MimeType: frame.MimeType, TimestampMs: frame.TimestampMs });
});

// Outbound: the agent speaks → into the meeting/call.
realtimeSession.OnOutput((chunk) => {
    bridge.SendMedia('audio-out', arrayBufferToFrame(chunk, 'audio-out'));
});

// Outbound video: the agent's typed video frames → video-out, with their MIME type.
realtimeSession.OnVideoFrame?.((frame) => {
    bridge.SendMedia('video-out', { Track: 'video-out', Bytes: frame.Data, MimeType: frame.MimeType });
});
```

The snippet leaves out the video gate, the notes to the model and the floor gate; see [Video](#video). The engine
never constructs the realtime model — the `IRealtimeSession` is **injected** via
`StartBridgeSessionParams.RealtimeSession`, so the only coupling is the seam itself.

## Video

### What the driver is told

`StartBridgeSession` passes the driver its `Configuration` plus facts read from the realtime session: its audio rates
(`InboundSampleRate`, `OutboundSampleRate`) and its video facts, `InboundVideoStreams` (how many camera or screen sources
it takes at once; `0` when it takes no video) and `InboundVideoRate` (frames per second; absent when the model declares
none). The video facts come from the session's declared capabilities (`InboundVideoStreamsOf`, `InboundVideoRateOf` in
`@memberjunction/ai`), so the rate comes from the model, not the driver.

### Video in: the gate and the notes

- **The gate.** A `video-in` or `screen-in` frame goes only to a session whose capabilities declare an inbound video
  track. Any other session would read the image as audio, so the engine drops the frame (one verbose log line per
  session). No inbound frame is sent while the model session is being replaced.
- **"[You can now see: …]"** goes to the model right before the first frame of a source new to the current model
  session: the first source, the next one after a switch, and a source seen again after it ended. A replacement model
  session (after a drop, or the audio-only one below) starts with no sources seen, so it gets the note with its first
  frame. Sources are told apart by `SourceID`; a frame without one gets no note.
- **"[You can no longer see: …]"** goes when the driver reports through `OnVideoSourceEnded` that a source whose frames
  reached the current model session stopped, a switch to another source included. A source the model never saw gets no
  note.
- **The label.** Both notes name the source by its `SourceLabel` ("Ada's camera"). A source without one is "a
  participant's camera" or "a participant's screen", never its `SourceID`.
- The notes go through the session's optional `SendContextNote`, and a driver may hold them: Gemini Live queues a note
  until the agent's reply ends but sends frames at once, so while the agent talks, a new source's first frames can reach
  the model before its note.

`VideoSourceSeenNote` and `VideoSourceEndedNote` build the two notes.

### Video out

`OnVideoFrame` → `SendMedia('video-out')`. Each typed frame (`RealtimeVideoFrame`: a fragmented MP4 piece, an encoded
chunk or an image) goes to the bridge with its bytes, its `MimeType`, so the driver can tell an avatar's MP4 from other
video, and what it says about its video (`Width`, `Height`, `KeyFrame`):

- an image: its own size when it has one, and `KeyFrame: true`;
- a chunk: its own size when it has one, and its own key-frame flag;
- an fMP4 init segment: its own size, read from the piece itself, and no `KeyFrame`;
- an fMP4 fragment with video: whether its first video frame is a key frame, and the size the stream's init segment
  gives the video track. An audio-only fragment, a fragment before any init segment, or one the driver couldn't read
  carries none of these.

When the session's speech is floor-gated (`FullDuplexTurnGate`, in a room with more than one agent), its video is gated
too. An fMP4 fragment counts by the duration of its audio track, which carries the agent's voice
(`FullDuplexTurnGate.OnOutputDuration`). An init segment passes and is kept for reading the fragments. Chunks and images
carry no voice and pass. A cut flushes the bridge's queued media.

The deprecated `OnVideoOutput` (untyped bytes) is still forwarded to `video-out`, without a MIME type.

### When the avatar can't be shown

A driver that publishes the agent's avatar reports through `OnAvatarUnavailable` when it took the avatar down
(`'decoder-failed'` or `'publish-failed'`). The engine then replaces the model session once, through the host's
`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`, with one that renders no avatar, seeded with the
conversation so far, so the model stops generating video nobody sees. Inbound audio is held while the replacement opens,
and the replacement must use the same audio sample rates. Nothing is replaced when the host gave no factory, or the
session is ending, recovering or already replaced; if the replacement fails, the session goes on as it was. This is
separate from `RecoverRealtimeSession`'s attempts after a dropped model session.

### Model usage

The engine records no model usage. For an agent's bridged session, `RealtimeClientSessionService.WireBridgeRealtimeSession`
in `@memberjunction/ai-agents` records the model session's `OnUsage` on that session's own co-agent prompt run, so a
replacement session opened through it has a run of its own.

## Usage

```typescript
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { RegexAddressedMatcher } from '@memberjunction/ai-bridge-base';

const engine = AIBridgeEngine.Instance;
await engine.Config(false, contextUser, provider);   // load the bridge registry (inherited from base)

// `realtimeSession` is an already-open IRealtimeSession from the agent/session layer.
const active = await engine.StartBridgeSession({
    AgentSessionID: existingAgentSessionId,
    Provider: zoomProviderRow,                        // MJAIBridgeProviderEntity (DriverClass resolves the driver)
    RealtimeSession: realtimeSession,                 // injected — the engine wires its media plane
    Address: 'https://zoom.us/j/123456789',
    TurnMode: 'Passive',
    TurnMatcher: new RegexAddressedMatcher(['Sage']),
    ContextUser: contextUser,
    MetadataProvider: provider,
});

// ...later, on hang-up / host-ended:
await engine.StopBridgeSession(active.SessionBridgeID, 'Explicit');
```

### Lifecycle

`StartBridgeSession` drives the `AIAgentSessionBridge` status state machine
`Pending → Connecting → Connected` (and `→ Failed` on any error), stamps `HostInstanceID` for node
affinity, resolves the driver via `ClassFactory.CreateInstance(BaseRealtimeBridge, provider.DriverClass)`,
then wires the transport seam + participant tracking + turn-taking. `StopBridgeSession` disconnects the
driver and transitions the row to `Disconnected` with a `CloseReason`. Both are idempotent.

### Host affinity & janitor

Every bridge row is stamped with `HostInstanceID`. `ReconcileOrphans(contextUser, provider)`
force-closes `Connected`/`Connecting` bridges left by a **prior boot of this host** (matching hostname
prefix, differing instance id) with `CloseReason = 'Janitor'` — mirroring `SessionJanitor`. The
*scheduling* (run-once-at-boot + periodic sweep) is a host-provided hook so this package carries no
timer/IO of its own; call `ReconcileOrphans` from the host's janitor.

### Turn-taking

A `TurnTakingPolicy` is built per session from `TurnMode` (`Passive` default / `Active` / `Hybrid`)
and fed the session's diarized **user** transcript segments. `Speak` requests a spoken update on the
session (when the provider supports `RequestSpokenUpdate`), `PostToChat` is a documented hook for the
Phase-2 bridge-chat channel, and `Silent` does nothing.

## Testing the seam without a platform

`LoopbackBridge` echoes every outbound frame back inbound, so with a mock `IRealtimeSession` you can
assert media flows **bridge → session** and **session → bridge** with no external service. Its
`EmitVideoSourceEnded` and `EmitAvatarUnavailable` drive the ended-source note and the audio-only replacement. See
`src/__tests__/transport-seam.test.ts` for the round-trip, lifecycle, turn-taking, participant,
janitor and video-note tests, and `src/__tests__/avatar-output.test.ts` for video out, the floor gate and the
audio-only replacement.

## Composition with the realtime engine

| Layer | Package | Role |
|---|---|---|
| Metadata cache + abstract driver + turn policy | `@memberjunction/ai-bridge-base` | provider/identity/channel cache, `BaseRealtimeBridge`, `TurnTakingPolicy`, media-track types |
| **Coordination + execution + transport seam** | **`@memberjunction/ai-bridge-server`** (this) | bot lifecycle, seam wiring, participant tracking, janitor |
| Realtime session contract | `@memberjunction/ai` | `IRealtimeSession` / `BaseRealtimeModel` (injected, never constructed here) |

## License

Business Source License 1.1 — see [LICENSE](../../../../LICENSE) for details.
