# @memberjunction/ai-bridge-server

Server-tier **coordination + execution** for MemberJunction Realtime Bridges. This package completes
the realtime engine's long-deferred **unified media-transport seam** — the pipe that connects a
bridge driver's media plane to a realtime agent session — and adds the bot-session lifecycle, host
affinity + janitor, participant tracking, and turn-taking integration around it.

It is the server half of the `AIBridgeEngineBase` / `AIBridgeEngine` pair, exactly mirroring how
`@memberjunction/aiengine`'s `AIEngine` builds on `@memberjunction/ai-engine-base`'s `AIEngineBase`.
The cross-platform, metadata-only base (provider/identity/channel cache, the abstract
`BaseRealtimeBridge` driver, `TurnTakingPolicy`, media-track types) lives in
[`@memberjunction/ai-bridge-base`](../BridgeBase); this package adds everything that actually *runs* a
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
media-agnostic — `SendInput(chunk)` is what the agent hears, `OnOutput(handler)` is what it says —
but it had **no client-facing pipe**. A bridge *is* that pipe. `AIBridgeEngine.wireTransportSeam`
connects the two directions:

```typescript
// Inbound: endpoint media → the agent hears it.
bridge.OnMedia((frame) => {
    const chunk = frameToArrayBuffer(frame);     // unwrap BridgeMediaFrame → ArrayBuffer
    if (chunk) realtimeSession.SendInput(chunk);
});

// Outbound: the agent speaks → into the meeting/call.
realtimeSession.OnOutput((chunk) => {
    bridge.SendMedia('audio-out', arrayBufferToFrame(chunk, 'audio-out'));
});
```

Audio is the first track lit up; video/screen ride the same two methods unchanged once the model
emits them. The engine never constructs the realtime model — the `IRealtimeSession` is **injected**
via `StartBridgeSessionParams.RealtimeSession`, so the only coupling is the seam itself.

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
assert media flows **bridge → session** and **session → bridge** with no external service. See
`src/__tests__/transport-seam.test.ts` for the round-trip, lifecycle, turn-taking, participant, and
janitor tests.

## Composition with the realtime engine

| Layer | Package | Role |
|---|---|---|
| Metadata cache + abstract driver + turn policy | `@memberjunction/ai-bridge-base` | provider/identity/channel cache, `BaseRealtimeBridge`, `TurnTakingPolicy`, media-track types |
| **Coordination + execution + transport seam** | **`@memberjunction/ai-bridge-server`** (this) | bot lifecycle, seam wiring, participant tracking, janitor |
| Realtime session contract | `@memberjunction/ai` | `IRealtimeSession` / `BaseRealtimeModel` (injected, never constructed here) |

## License

ISC
