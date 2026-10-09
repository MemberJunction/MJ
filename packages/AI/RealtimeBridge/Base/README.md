# @memberjunction/ai-bridge-base

Cross-platform, **metadata-only** base layer for MemberJunction **Realtime Bridges** — pluggable,
capability-gated **media transports** (audio / video / screen, full duplex) that connect the *one*
realtime agent engine to an external endpoint: a Zoom/Teams/Slack/Meet/Webex/Discord **meeting** or a
Twilio/Vonage/RingCentral **phone call**.

This package holds everything a bridge needs that carries **no execution** — the provider/identity/
channel cache, the abstract `BaseRealtimeBridge` driver contract, the media-track types, the
platform-agnostic turn-taking policy, and the capability-error type. It is the base half of the
`AIBridgeEngineBase` / `AIBridgeEngine` pair, exactly mirroring how
[`@memberjunction/ai-engine-base`](../../BaseAIEngine)'s `AIEngineBase` underpins
[`@memberjunction/aiengine`](../../Engine)'s `AIEngine`. The server tier that actually *runs* a bridged
session (the transport seam, bot lifecycle, janitor, the `LoopbackBridge`) lives in
[`@memberjunction/ai-bridge-server`](../Server).

> See the architecture plan at `/plans/realtime/realtime-bridges-architecture.md` and the developer
> guide [`/guides/REALTIME_BRIDGES_GUIDE.md`](../../../../guides/REALTIME_BRIDGES_GUIDE.md) for the full
> design (transport seam, capability gating, channel contribution, turn-taking, roadmap).

## What's in the box

| Export | Purpose |
|---|---|
| `BaseRealtimeBridge` | The abstract driver. A concrete driver (`ZoomBridge`, `TwilioBridge`, …) implements only the irreducibly platform-specific primitives (`Connect` / `Disconnect` / `SendMedia` / `OnMedia`) and overrides the capability-gated virtuals (`GetParticipants`, `SendDTMF`, `TransferCall`, `StartRecording`, …) its platform supports. Drivers self-register via `@RegisterClass(BaseRealtimeBridge, '<X>Bridge')`. |
| `AIBridgeEngineBase` | A `BaseEngine` singleton caching the bridge registry — providers + capability flags, agent identities, the provider→channel junction — with synchronous resolution helpers (`ProviderByName`, `ProviderByDriverClass`, `IdentityByValue`, `ChannelsForProvider`, …). No execution. |
| `TurnTakingPolicy` + `RegexAddressedMatcher` | Pure, platform-agnostic turn-taking (`Passive` / `Active` / `Hybrid`) with injected matcher/scorer/clock — fully unit-testable, no I/O. |
| `BridgeCapabilityNotSupportedError` | The defense-in-depth error thrown when a capability-gated method is called on a driver that doesn't support it (carries `FeatureName` + `ProviderName`). |
| Media-track types | `BridgeMediaFrame`, `BridgeMediaTrackKind` (`audio-in` … `screen-out`), `BridgeParticipantInfo`, `BridgeParticipantRole` — the typed, directional, **media-agnostic** transport payloads. `BridgeVideoSourceEnd` and `BridgeAvatarFailure` are what a driver reports when a camera or screen stops or the agent's avatar can't be shown (see [Video on the bridge](#video-on-the-bridge)). |
| Driver contract types | `RealtimeBridgeContext`, `BridgeConnectResult`, `BridgeDisconnectReason`, `IBridgeProviderFeatures` (typed alias of the generated `MJ: AI Bridge Providers.SupportedFeatures` shape). |

## Installation

```bash
npm install @memberjunction/ai-bridge-base
```

## The driver contract

`BaseRealtimeBridge` has two tiers of methods:

- **Abstract — every bridge MUST implement:** `Connect(ctx)`, `Disconnect(reason)`,
  `SendMedia(track, frame)` (outbound — the agent's voice from `IRealtimeSession.OnOutput`, its video from
  `IRealtimeSession.OnVideoFrame`), and `OnMedia(handler)` (inbound — routed to `IRealtimeSession.SendInput` as a
  frame tagged audio or video). Audio is just one track; video/screen ride the same two media methods.
- **Virtual / capability-gated — override only what your platform supports:** `GetParticipants`,
  `OnParticipantChange` (gated by `SpeakerDiarization`), `SendDTMF` / `OnDTMF` (`DTMF`),
  `TransferCall` (`CallTransfer`), `StartRecording` (`Recording`). Each throws
  `BridgeCapabilityNotSupportedError` by default. The engine checks the matching `SupportedFeatures`
  flag *first* and never calls a method whose feature is off; the throw is the second, defense-in-depth
  layer for when a metadata flag lies or a caller bypasses the gate.

Protected helpers for driver authors: `applyContext(ctx)` (capture features + provider name — call it
first in `Connect`), `RequireFeature(flag)` (re-assert a flag at the top of an overriding method), and
`notSupported(name)` (build the standard error).

Outside the two tiers, a few hooks are no-ops by default and not capability-gated. The two for video,
`OnVideoSourceEnded` and `OnAvatarUnavailable`, are described below.

## Video on the bridge

Cameras and shared screens come in on `video-in` and `screen-in`; the agent's own video goes out on `video-out`. The
server engine sends a camera or screen frame to the model as video, and only to a session that takes video.

A video frame carries more than an audio frame. Each of these `BridgeMediaFrame` fields is optional:

- `MimeType` — the payload's format: `'image/jpeg'` for a camera frame, `'video/mp4'` for a piece of an avatar's
  fragmented MP4. Audio frames may omit it. A video frame without one can't be sent to a model that needs an image type;
  the realtime driver drops it.
- `SourceID` — which camera or screen an inbound frame comes from, when the endpoint has several: an opaque key that
  stays the same for one source, such as `'participant:ada:camera'`. The engine uses it to notice a new source.
- `SourceLabel` — the source's name for the model ("Ada's camera").
- `Width`, `Height` — the video's size in pixels, set together, where the producer knows it: an image's own size after
  rotation and scaling, or for fragmented MP4 the size the init segment gives the video track (on the init segment and
  on each fragment that carries video).
- `KeyFrame` — whether a decoder can start at this frame. `true` for a still image, which decodes on its own; for encoded
  video, whether the piece's first video frame is a key frame. Absent on a piece with no video frame (audio, an MP4 init
  segment).

A consumer reads an absent `Width`, `Height` or `KeyFrame` as unknown.

Two hooks carry the driver's video events to the engine. A driver that has no video doesn't override them:

- `OnVideoSourceEnded(handler)` — a camera or screen the driver was sending stopped, reported as a
  `BridgeVideoSourceEnd` (`Track`, `SourceID`, `SourceLabel`, as its frames carried them): the person stopped letting
  agents see them, left, stopped sharing or turned the camera off, or the driver moved the model's view to another
  source. The engine tells the model it can no longer see that source.
- `OnAvatarUnavailable(handler)` — the driver took the agent's avatar down and goes on audio only, with a
  `BridgeAvatarFailure`: `'decoder-failed'` (its decoders kept failing) or `'publish-failed'` (the endpoint refused the
  video track). The engine then replaces the model session with one that renders no avatar, when the host gave it a way
  to (`RecoverRealtimeSessionWithoutAvatar` in [`@memberjunction/ai-bridge-server`](../Server)).

## Minimal usage — a tiny custom bridge

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeBridge,
    BridgeConnectResult,
    BridgeDisconnectReason,
    BridgeMediaFrame,
    BridgeMediaTrackKind,
    RealtimeBridgeContext,
} from '@memberjunction/ai-bridge-base';

@RegisterClass(BaseRealtimeBridge, 'EchoBridge')
export class EchoBridge extends BaseRealtimeBridge {
    private inbound?: (frame: BridgeMediaFrame) => void;

    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);                       // capture features + provider name (do this first)
        return { BotParticipantId: 'echo-bot', ExternalConnectionId: `echo:${ctx.Address}` };
    }

    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        this.inbound = undefined;
    }

    public SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void {
        // echo the agent's outbound audio straight back inbound
        this.inbound?.({ ...frame, Track: 'audio-in' });
    }

    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.inbound = handler;
    }

    // SendDTMF / TransferCall / StartRecording / GetParticipants are NOT overridden —
    // they stay capability-gated and throw BridgeCapabilityNotSupportedError if called.
}
```

A bridge provider row whose `DriverClass = 'EchoBridge'` and whose `SupportedFeatures` enables
`{ AudioIn, AudioOut }` resolves to this driver through the `ClassFactory`. (The shipped
[`LoopbackBridge`](../Server) in the server package is a fuller worked example — it also overrides the
diarization-gated roster methods.)

## Turn-taking

`TurnTakingPolicy` gates **generation** (whether the agent speaks / posts to chat / stays silent) —
the agent always *hears*. It operates on diarized transcript segments and is identical for any
platform:

```typescript
import { TurnTakingPolicy, RegexAddressedMatcher } from '@memberjunction/ai-bridge-base';

const policy = new TurnTakingPolicy({
    Mode: 'Passive',                                  // default — speak only when addressed
    Matcher: new RegexAddressedMatcher(['Sage', 'the assistant']),
});

const decision = policy.EvaluateTurn({
    Segment: { Text: 'Hey Sage, what do you think?', IsAgent: false, EndMs: Date.now() },
});
// → { Action: 'Speak', Reason: 'Agent was addressed (passive).' }
```

`Active` mode adds an injected "worth saying" scorer that fires only in silence windows (throttled,
never barging over a live speaker); `Hybrid` adds a chat hand-raise when chat is available. Every
dependency (matcher, scorer, clock) is injected, so the policy is pure and deterministic in tests.

## The capability model

A provider's capabilities live in the `MJ: AI Bridge Providers.SupportedFeatures` JSON column, strongly
typed via `IBridgeProviderFeatures`. It holds **transport/media** concerns only — join methods,
directional media tracks (`AudioIn/Out`, `VideoIn/Out`, `ScreenIn/Out`), `SpeakerDiarization`, `DTMF`,
`CallTransfer`, `Recording`. New platform features need no schema migration — extend the interface.
*Interactive surfaces (hand-raise, chat, native whiteboard) are NOT features here — they are channels
the bridge contributes (planned Phase 2).*

## How it composes with the realtime engine

| Layer | Package | Role |
|---|---|---|
| **Metadata cache + abstract driver + turn policy** | **`@memberjunction/ai-bridge-base`** (this) | provider/identity/channel cache, `BaseRealtimeBridge`, `TurnTakingPolicy`, media-track + capability types |
| Coordination + execution + transport seam | [`@memberjunction/ai-bridge-server`](../Server) | `AIBridgeEngine` (composes this base), the `bridge ↔ IRealtimeSession` seam, bot lifecycle, janitor, `LoopbackBridge` |
| Realtime session contract | [`@memberjunction/ai`](../../Core) | `IRealtimeSession` / `BaseRealtimeModel` — injected into the engine, never constructed by a bridge |

The server `AIBridgeEngine` **composes** (does not extend) `AIBridgeEngineBase`, so the startup manager
warms exactly one `BaseEngine` cache — the same composition-over-inheritance pattern `AIEngine` uses
over `AIEngineBase`.

## Further reading

- **Guide:** [`/guides/REALTIME_BRIDGES_GUIDE.md`](../../../../guides/REALTIME_BRIDGES_GUIDE.md) — the full
  developer guide (how to add a driver, the transport seam, turn-taking, entity invariants, roadmap).
- **Architecture plan:** `/plans/realtime/realtime-bridges-architecture.md`.
- **Server package:** [`@memberjunction/ai-bridge-server`](../Server/README.md).
- **Companion:** [`/guides/REALTIME_CO_AGENTS_GUIDE.md`](../../../../guides/REALTIME_CO_AGENTS_GUIDE.md) —
  the realtime engine the bridge plugs into.

## License

Business Source License 1.1 — see [LICENSE](../../../../LICENSE) for details.
